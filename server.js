// В начале файла добавляем обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Логируем ошибку, но не завершаем процесс
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
});

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';

// --- Yjs ---
import ws from 'ws';
const WebSocketServer = ws.Server;
import * as Y from 'yjs';
import { setupWSConnection } from '@y/websocket-server/utils';

const __dirname = path.resolve();

// Функция для логирования с временными метками
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  switch(level) {
    case 'error':
      console.error(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
}

const app = express();
const httpServer = createServer(app);

// --- Настройка старого Socket.IO сервера (для авторизации и прочего, что не связано с Yjs напрямую) ---
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL || "*"
      : ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || "*"
    : ["http://localhost:5173", "http://localhost:3000"],
  credentials: true
}));
// Раздаем статические файлы
const staticPath = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, 'dist')
  : __dirname;

// Настройка MIME-типов
app.use(express.static(staticPath, {
  etag: true,
  lastModified: true,
  maxAge: process.env.NODE_ENV === 'production' ? 86400000 : 30000, // 1 день в проде
  setHeaders: (res, path) => {
    // Принудительно устанавливаем правильные MIME-типы
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    
    // В разработке отключаем кэш для быстрого обновления
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Обслуживание HTML страниц
app.get('/', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(staticPath, 'admin.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(staticPath, 'editor.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(staticPath, 'profile.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(staticPath, 'gallery.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(staticPath, 'chat.html'));
});

app.get('/RelOAD', (req, res) => {
  res.status(404).send('Admin page not found');
});

// Для всех остальных запросов (CSS, JS, изображения) позволяем Express обслуживать статические файлы
// Если файл не найден, НЕ перенаправляем на index.html

// --- API для сброса кодов (упрощено) ---
app.post('/api/reset', async (req, res) => {
  try {
    // await resetCodeInDB(); // Удаляем вызов функции для сброса кода в БД
    io.emit('code_reset_notification');

    log('Уведомление о сбросе состояния отправлено клиентам.');
    res.json({ success: true, message: 'Уведомление о сбросе состояния отправлено' });
  } catch (error) {
    log(`Ошибка при отправке уведомления о сбросе: ${error.message}`, 'error');
    res.status(500).json({ success: false, message: 'Ошибка при отправке уведомления о сбросе' });
  }
});

// --- Старая логика Socket.IO (для авторизации, списка пользователей и т.д.) ---
const onlineUsers = {};

io.on('connection', (socket) => {
  log(`Новое Socket.IO соединение: ${socket.id}`);

  let inactivityTimeout;
  const resetInactivityTimeout = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      if (socket.connected) {
        log(`Отключение Socket.IO ${socket.id} из-за неактивности`, 'warn');
        socket.disconnect(true);
      }
    }, 2 * 60 * 60 * 1000);
  };
  socket.onAny(() => {  resetInactivityTimeout(); });
  resetInactivityTimeout();

  socket.on('auth', (data, callback) => {
    const { userName, roomName } = data;

    if (!userName || !roomName) {
      const errorMsg = 'Имя пользователя и комнаты обязательны для авторизации.';
      log(`Ошибка авторизации Socket.IO: ${errorMsg} (ID: ${socket.id})`, 'warn');
      if (typeof callback === 'function') {
        callback({ status: 'error', message: errorMsg });
      }
      return;
    }

    const isUserInRoomTaken = Object.values(onlineUsers).some(
      user => user.roomName === roomName && user.userName === userName && user.socketId !== socket.id
    );

    if (isUserInRoomTaken) {
      const errorMsg = `Пользователь '${userName}' уже существует в комнате '${roomName}'.`;
      log(`Попытка авторизации Socket.IO с занятым именем пользователя: '${userName}' в комнате '${roomName}' (ID: ${socket.id})`, 'warn');
      if (typeof callback === 'function') {
        callback({ status: 'error', message: errorMsg });
      }
      return;
    }

    onlineUsers[socket.id] = { userName, roomName, socketId: socket.id };
    
    if (typeof callback === 'function') {
      callback({ status: 'ok', userName, roomName });
    }
    
    io.emit('online_users_count', Object.keys(onlineUsers).length);
    log(`Пользователь авторизован через Socket.IO: '${userName}' в комнате '${roomName}' (ID: ${socket.id})`);
  });

  socket.on('disconnect', () => {
    const disconnectedUser = onlineUsers[socket.id];
    if (disconnectedUser) {
        log(`Socket.IO соединение закрыто: ${socket.id}. Пользователь: '${disconnectedUser.userName}' из комнаты '${disconnectedUser.roomName}'`);
        delete onlineUsers[socket.id];
        io.emit('online_users_count', Object.keys(onlineUsers).length);
    } else {
        log(`Socket.IO соединение закрыто: ${socket.id}. (Пользователь не был авторизован или уже удален)`);
    }
  });
});

// --- Настройка y-websocket сервера ---
const wss = new WebSocketServer({ noServer: true }); 

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url.startsWith('/socket.io/')) {
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const docs = new Map();

const getOrCreateDoc = (docName) => {
  let doc = docs.get(docName);
  if (doc == null) {
    doc = new Y.Doc();
    docs.set(docName, doc);
    log(`Y.Doc "${docName}" создан в памяти (пустой).`);
  }
  return doc;
};

wss.on('connection', (conn, req) => {
  const docName = req.url.startsWith('/') ? req.url.substring(1) : req.url;
  
  if (!docName) {
    log('Yjs: Попытка подключения без имени документа. Закрытие соединения.', 'warn');
    conn.close();
    return;
  }

  log(`Yjs: Новое соединение к документу: "${docName}" (URL: ${req.url})`);
  
  const doc = getOrCreateDoc(docName);
  setupWSConnection(conn, req, { doc });

  conn.on('close', () => {
    log(`Yjs: Соединение с документом "${docName}" закрыто.`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  log(`Сервер запущен на порту ${PORT}`);
  log(`Yjs WebSocket сервер ожидает соединений на ws://localhost:${PORT}/ИМЯ_ВАШЕЙ_КОМНАТЫ`);
  log(`Старый Socket.IO сервер также активен для авторизации и счетчика пользователей.`);
});