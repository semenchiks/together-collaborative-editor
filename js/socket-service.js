// socket-service.js
// Модуль для работы с Socket.io

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as awarenessProtocol from 'y-protocols/awareness.js';


import {
    throttle,
    debounce,
    showNotification,
    retryOperation,
    safeJSONParse
} from './utils.js';


/**
 * Оптимизированная функция логирования
 * @param {string} message - Сообщение для логирования
 * @param {string} level - Уровень логирования (info, warn, error)
 */
function log(message, level = 'info') {
    const isProd = window.location.hostname !== 'localhost';
    if (isProd && level !== 'error' && level !== 'warn') return; // В проде логируем только ошибки и предупреждения

    switch (level) {
        case 'error':
            console.error(`[SocketService] ${message}`);
            break;
        case 'warn':
            console.warn(`[SocketService] ${message}`);
            break;
        default:
            console.log(`[SocketService] ${message}`);
    }
}


/**
 * Генерирует случайный HEX-цвет на основе строки (например, имени пользователя)
 * @param {string} str - Входная строка
 * @returns {string} - HEX-цвет
 */
function getRandomColorFromString(str) {
    if (!str) str = 'default';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    const color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - color.length) + color;
}

/**
 * Класс для работы с сокетами и Yjs
 */
export class SocketService {
    /**
     * Конструктор класса SocketService
     */
    constructor() {
        this.socket = null; // Инициализируем в init()
        this.teamName = ''; // Это будет использоваться как roomName
        this.userName = ''; // Новое свойство для имени пользователя

        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5; // Для старого Socket.IO
        this.reconnectionDelay = 1000;
        this.isReconnecting = false; // Для старого Socket.IO

        this.authListeners = [];
        this.onlineUsersCountListeners = [];
        this.codeInitializedListeners = []; // Будет сигнализировать о готовности Yjs
        this.codeResetListeners = [];
        // htmlUpdatedListeners и cssUpdatedListeners остаются, но будут вызываться из Yjs.observe
        this.htmlUpdatedListeners = [];
        this.cssUpdatedListeners = [];
        // cursorMovedListeners остается, будет вызываться из Yjs Awareness
        this.cursorMovedListeners = [];
        this.userDisconnectedListeners = []; // Пока остается на Socket.IO
        this.yjsSyncedListeners = []; // Слушатели события полной синхронизации Yjs

        // --- Yjs Свойства ---
        this.yDoc = null;
        this.yTextHtml = null;
        this.yTextCss = null;
        this.yWebsocketProvider = null;
        this.yAwareness = null;
        // --------------------

        // Флаги для отслеживания программных обновлений (чтобы не вызывать лишние yText.applyDelta)
        this.isProgrammaticallyUpdatingHtml = false;
        this.isProgrammaticallyUpdatingCss = false;


        this.pendingAuthorizationData = null; // Для отложенной авторизации

        this.init();
    }

    /**
     * Инициализация Socket.IO клиента
     */
    init() {
        try {
            if (typeof io === 'undefined') {
                log('Socket.io (клиент) не загружен.', 'error');
                this.handleConnectionError(); // Вызовет попытку переподключения или обработку ошибки
                return;
            }

            this._setupBeforeUnloadHandler(); // Обработчик закрытия страницы (пока оставляем, возможно, упростим)
            
            // Определяем URL сервера в зависимости от окружения
            const serverUrl = this._getServerUrl();
            log(`Socket.IO: Подключение к серверу: ${serverUrl}`);
            
            this.socket = io(serverUrl, {
                reconnectionAttempts: this.maxReconnectionAttempts,
                reconnectionDelay: this.reconnectionDelay,
                // Дополнительные параметры Socket.IO при необходимости
            });

            this._initSocketEventListeners();
            log('Socket.IO клиент инициализирован');
        } catch (error) {
            log(`Ошибка при инициализации Socket.IO клиента: ${error.message}`, 'error');
            this.handleConnectionError();
        }
    }

    /**
     * Настраивает обработчики событий Socket.IO
     * @private
     */
    _initSocketEventListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            log('Socket.IO соединение установлено.');
            this.isReconnecting = false;
            this.reconnectionAttempts = 0;
            this._sendPendingAuthRequest(); // Отправляем авторизацию, если она ожидается
        });

        this.socket.on('disconnect', (reason) => {
            log(`Socket.IO соединение потеряно: ${reason}.`, 'warn');
            this._handleSocketIODisconnect(reason); // Отдельный метод для обработки отключения Socket.IO
        });

        this.socket.on('connect_error', (error) => {
            log(`Ошибка соединения Socket.IO: ${error.message}`, 'error');
            this.handleConnectionError(); // Общий обработчик ошибок соединения
        });

        this.socket.on('online_users_count_updated', (count) => {
            // Эта логика может быть заменена или дополнена Yjs Awareness
            log(`Socket.IO: Количество онлайн пользователей обновлено: ${count}`);
            // this.onlineUsersCountListeners.forEach(listener => listener(count)); // Пока дублируем с Awareness
        });

        this.socket.on('user_disconnected', (data) => { // Пока остается на Socket.IO
            log(`Socket.IO: Пользователь ${data.teamName} (ID: ${data.socketId}) отключился.`);
            this.userDisconnectedListeners.forEach(listener => listener(data));
        });

        this.socket.on('code_reset_notification', () => {
            log('Получено уведомление о сбросе кода с сервера (Socket.IO).');
            showNotification('Внимание! Код был сброшен к начальному состоянию другим пользователем.', 'warning', 10000);
            this.codeResetListeners.forEach(listener => listener());
            if (this.yWebsocketProvider) {
                log('Переподключаемся к Yjs документу после сброса...');
                this.yWebsocketProvider.disconnect(); // Сначала отключаемся
                // Задержка перед переподключением, чтобы сервер успел обработать сброс YDoc
                setTimeout(() => {
                    this._initYjsConnection(this.teamName, true); // true для isReset
                }, 500);
            }
        });
    }

    /**
     * Обработка отключения Socket.IO
     * @private
     */
    _handleSocketIODisconnect(reason) {
        if (this.yWebsocketProvider && this.yWebsocketProvider.wsconnected) {
            this.yWebsocketProvider.disconnect();
            log('Yjs WebsocketProvider отключен из-за разрыва основного Socket.IO соединения.', 'warn');
        }
        // Логика переподключения для Socket.IO, если она настроена в io(...)
        if (reason === 'io server disconnect') {
            // Сервер принудительно разорвал соединение, возможно, не стоит пытаться переподключиться
             log('Socket.IO соединение разорвано сервером.', 'warn');
        } else {
            // Попытка переподключения будет управляться самим Socket.IO клиентом
             log('Socket.IO пытается переподключиться...', 'info');
        }
        document.dispatchEvent(new CustomEvent('socket_disconnected', { detail: { reason } }));
    }
    
    /**
     * Определяет URL сервера в зависимости от окружения
     * @private
     * @returns {string} URL сервера для Socket.IO
     */
    _getServerUrl() {
        // В продакшене используем текущий домен
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            // Используем тот же протокол и хост что и у страницы
            return `${window.location.protocol}//${window.location.host}`;
        }
        // В разработке используем localhost:3000
        return 'http://localhost:3000';
    }

    /**
     * Определяет WebSocket URL для Yjs в зависимости от окружения
     * @private
     * @returns {string} WebSocket URL для Yjs
     */
    _getWebSocketUrl() {
        // В продакшене используем текущий домен с ws/wss протоколом
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${window.location.host}`;
        }
        // В разработке используем localhost:3000
        return 'ws://localhost:3000';
    }

    /**
     * Обработчик ошибок соединения Socket.IO (для инициализации и переподключения)
     * @private
     */
    handleConnectionError() {
        this.reconnectionAttempts++;
        if (this.yWebsocketProvider && this.yWebsocketProvider.wsconnected) {
            this.yWebsocketProvider.disconnect(); // Отключаем Yjs при проблемах с основным сокетом
        }

        if (this.reconnectionAttempts <= this.maxReconnectionAttempts) {
            const delay = this.reconnectionDelay * Math.pow(2, this.reconnectionAttempts - 1);
            log(`Socket.IO: Попытка переподключения ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} через ${delay / 1000}с...`, 'warn');
            setTimeout(() => {
                if (this.socket) this.socket.connect(); // Явная попытка переподключения
                else this.init(); // Если сокет не был создан, пробуем инициализировать
            }, delay);
        } else {
            log('Socket.IO: Превышено максимальное количество попыток переподключения.', 'error');
            document.dispatchEvent(new CustomEvent('socket_connection_failed'));
            showNotification('Не удалось подключиться к серверу. Пожалуйста, проверьте соединение и обновите страницу.', 'error', 0); // 0 = не закрывать автоматически
        }
    }


    /**
     * Инициализирует соединение с Yjs через WebsocketProvider.
     * @param {string} roomName - Имя комнаты (обычно teamName).
     * @param {boolean} [isReset=false] - Флаг, указывающий, что это переподключение после сброса.
     * @private
     */
    _initYjsConnection(roomName, isReset = false) {
        if (!roomName) {
            log('Yjs: Невозможно инициализировать: имя комнаты не предоставлено.', 'error');
            return;
        }

        if (this.yWebsocketProvider) {
            if (this.yWebsocketProvider.roomname === roomName && !isReset && this.yWebsocketProvider.wsconnected) {
                log(`Yjs: Уже подключен к комнате: ${roomName}. Повторная инициализация не требуется.`, 'info');
            return;
        }
            // Если имя комнаты изменилось, это сброс, или не подключены - уничтожаем старое соединение
            log(`Yjs: Уничтожение предыдущего WebsocketProvider для комнаты ${this.yWebsocketProvider.roomname}. isReset: ${isReset}`, 'info');
            this.yWebsocketProvider.destroy();
            this.yWebsocketProvider = null;
            this.yDoc = null; 
            this.yTextHtml = null;
            this.yTextCss = null;
            this.yAwareness = null;
        }

        log(`Yjs: Инициализация соединения для комнаты: ${roomName}`);
        this.yDoc = new Y.Doc();
        
        // Определяем WebSocket URL для Yjs
        const wsUrl = this._getWebSocketUrl();
        log(`Yjs: WebSocket URL: ${wsUrl}, Комната: ${roomName}`);

        try {
            this.yWebsocketProvider = new WebsocketProvider(wsUrl, roomName, this.yDoc, {
                // Можно передать параметры аутентификации, если сервер их ожидает
                // params: { token: 'ваш_токен_если_нужен' }
            });

            this.yAwareness = this.yWebsocketProvider.awareness;
            this.yTextHtml = this.yDoc.getText('html');
            this.yTextCss = this.yDoc.getText('css');

            this.yWebsocketProvider.on('status', ({ status }) => {
                log(`Yjs: Статус соединения с комнатой "${roomName}": ${status}.`, 'info');
                if (status === 'connected') {
                    log(`Yjs: Успешно подключено к комнате "${roomName}". HTML: ${this.yTextHtml.length}, CSS: ${this.yTextCss.length}`);
                    // Уведомляем, что Yjs готов и данные (потенциально) загружены
                    this.codeInitializedListeners.forEach(listener => listener({
                        yjsReady: true,
                    }));
                } else if (status === 'disconnected') {
                    log(`Yjs: Отключено от комнаты "${roomName}". WebsocketProvider попытается переподключиться.`, 'warn');
                }
            });
            
            this.yWebsocketProvider.on('synced', (isSynced) => {
                 log(`Yjs: Статус синхронизации с комнатой "${roomName}": ${isSynced ? 'Синхронизировано' : 'Не синхронизировано'}.`);
                 if(isSynced) {
                    // Этот момент хорош для дополнительных действий после полной синхронизации
                    log(`Yjs: Документ "${roomName}" полностью синхронизирован. HTML: ${this.yTextHtml.length}, CSS: ${this.yTextCss.length}`);
                    
                    // Уведомляем слушателей о полной синхронизации
                    this.yjsSyncedListeners.forEach(listener => listener({
                        isSynced: true,
                        htmlLength: this.yTextHtml.length,
                        cssLength: this.yTextCss.length,
                        roomName: roomName
                    }));
                 }
            });

            this.yTextHtml.observe(event => {
                // event.local true, если изменение было сделано этим клиентом (через yTextHtml.insert/delete/applyDelta)
                if (!event.local) { 
                    log('Yjs: Получено удаленное обновление HTML.', 'info');
                    this.isProgrammaticallyUpdatingHtml = true; // Флаг для CodeEditorManager
                    this.htmlUpdatedListeners.forEach(listener => listener({
                        html: this.yTextHtml.toString(), // Передаем полный текст для обновления редактора
                        isRemote: true 
                    }));
                    this.isProgrammaticallyUpdatingHtml = false;
                }
            });

            this.yTextCss.observe(event => {
                if (!event.local) {
                    log('Yjs: Получено удаленное обновление CSS.', 'info');
                    this.isProgrammaticallyUpdatingCss = true; // Флаг для CodeEditorManager
                    this.cssUpdatedListeners.forEach(listener => listener({
                        css: this.yTextCss.toString(),
                        isRemote: true
                    }));
                    this.isProgrammaticallyUpdatingCss = false;
                }
            });
            
            this._initYAwareness();

        } catch (error) {
            log(`Yjs: Ошибка при инициализации WebsocketProvider для комнаты "${roomName}": ${error.message}`, 'error');
        }
    }

    /**
     * Инициализирует обработку состояний присутствия (Awareness) для курсоров и другой метаинформации.
     * @private
     */
    _initYAwareness() {
        if (!this.yAwareness) {
            log('Yjs Awareness: Не инициализирован.', 'error');
            return;
        }

        this.yAwareness.on('change', (changes) => { // { added: Array<number>, updated: Array<number>, removed: Array<number> }
            const states = this.yAwareness.getStates(); // Map<clientID, state>
            const localClientID = this.yAwareness.clientID;

            // Обновляем счетчик онлайн-пользователей на основе Yjs Awareness
            this.onlineUsersCountListeners.forEach(listener => listener(states.size));
            log(`Yjs Awareness: Изменение состояний. Всего клиентов: ${states.size}. Локальный ID: ${localClientID}. Изменения: ${JSON.stringify(changes)}`);

            states.forEach((state, clientID) => {
                // Добавляем детальное логирование всего стейта другого пользователя
                if (clientID !== localClientID) {
                    log(`Yjs Awareness: Состояние для clientID ${clientID}: ${JSON.stringify(state)}`, 'info');
                }

                if (clientID === localClientID) return; // Игнорируем свое состояние

                if (changes.added.includes(clientID) || changes.updated.includes(clientID)) {
                    // Пользователь подключился или обновил состояние
                    if (state.user) {
                         log(`Yjs Awareness: Пользователь ${state.user.name} (ID: ${clientID}) ${changes.added.includes(clientID) ? 'присоединился' : 'обновил состояние'}. User details: ${JSON.stringify(state.user)}`);
                    } else {
                         log(`Yjs Awareness: Пользователь (ID: ${clientID}) ${changes.added.includes(clientID) ? 'присоединился' : 'обновил состояние'}, но state.user отсутствует.`, 'warn');
                    }
                    if (state.cursor) { // Если есть информация о курсоре
                        log(`Yjs Awareness: Курсор от ${clientID}: ${JSON.stringify(state.cursor)}`); // Более детальный лог курсора
                        this.cursorMovedListeners.forEach(listener => listener({
                            clientId: clientID,
                            cursorData: state.cursor, // Передаем весь объект cursorData
                            userName: state.user ? state.user.name : 'Гость'
                        }));
                    } else {
                        log(`Yjs Awareness: state.user есть для ${clientID}, но state.cursor отсутствует.`);
                    }
                } else if (changes.removed.includes(clientID)) {
                     log(`Yjs Awareness: Пользователь (ID: ${clientID}) отключился (состояние удалено).`);
                     // Можно также уведомить userDisconnectedListeners, если нужно
                }
            });
        });

        // Устанавливаем начальное/локальное состояние для Awareness
        // Делаем это только если есть userName, иначе отложим до успешной авторизации
        if (this.userName && this.teamName) {
            this.yAwareness.setLocalStateField('user', {
                name: this.userName || 'Гость', // Имя пользователя
                color: getRandomColorFromString(this.userName || 'Гость') // Добавляем цвет для курсора
            });
            log(`Yjs Awareness: Локальное состояние установлено для пользователя "${this.userName || 'Гость'}" в комнате "${this.teamName}".`);
        } else {
            log('Yjs Awareness: Локальное состояние НЕ установлено, т.к. userName или teamName отсутствуют.');
        }
    }

    /**
     * Отправляет/обновляет позицию курсора и выделения через Yjs Awareness.
     * @param {object} cursorData - Объект с данными курсора/выделения.
     *                           Пример: { editorType: 'html', position: {lineNumber, column}, selection: {startLine, startColumn, endLine, endColumn} }
     */
    updateCursorAndSelection(cursorData) {
        if (this.yAwareness) {
            // Сохраняем старые данные курсора, чтобы не перезаписать курсор другого редактора
            const currentAwarenessCursor = this.yAwareness.getLocalState()?.cursor || {};
            let newCursorState = { ...currentAwarenessCursor };

            if (cursorData.editorType === 'html') {
                newCursorState.html = { position: cursorData.position, selection: cursorData.selection, timestamp: Date.now() };
            } else if (cursorData.editorType === 'css') {
                newCursorState.css = { position: cursorData.position, selection: cursorData.selection, timestamp: Date.now() };
            } else {
                // Для общего курсора или других типов
                newCursorState[cursorData.editorType || 'generic'] = { position: cursorData.position, selection: cursorData.selection, timestamp: Date.now() };
            }
            
            this.yAwareness.setLocalStateField('cursor', newCursorState);
        }
    }
    
    /**
     * Отправляет ожидающий запрос авторизации, если он есть.
     * @private
     */
    _sendPendingAuthRequest() {
        if (this.pendingAuthorizationData && this.socket && this.socket.connected) {
            const { authPayload, callback } = this.pendingAuthorizationData;
            log(`Socket.IO: Отправка ожидающего запроса авторизации для комнаты: ${authPayload.roomName}, пользователь: ${authPayload.userName}`);
            console.log('[SocketService] _sendPendingAuthRequest: Перед emit("auth")', authPayload); // Добавлено логирование
            this.socket.emit('auth', authPayload, callback);
            this.pendingAuthorizationData = null; // Очищаем после отправки
        } else if (this.pendingAuthorizationData && this.socket && !this.socket.connected) {
            log('Socket.IO: Запрос на авторизацию ожидает подключения.', 'info');
        }
    }

    /**
     * Авторизация пользователя (через Socket.IO - для получения teamName/roomName и инициации Yjs)
     * @param {string} roomNameInput - Имя комнаты
     * @param {string} userNameInput - Имя пользователя
     * @param {boolean} [isReconnect=false] - Флаг, если это повторная авторизация.
     */
    authorize(roomNameInput, userNameInput, isReconnect = false) {
        console.log(`[SocketService] authorize: Начало вызова. roomNameInput: ${roomNameInput}, userNameInput: ${userNameInput}, isReconnect: ${isReconnect}`); // Добавлено логирование
        if (!this.socket) {
            log('Socket.IO клиент не инициализирован для авторизации.', 'error');
            this.authListeners.forEach(listener => listener({success: false, message: 'Socket.IO не готов.'}));
            return;
        }

        let finalRoomName;
        let finalUserName;

        if (isReconnect) {
            // При переподключении, AuthModal передает roomNameInput и userNameInput из localStorage
            // Устанавливаем их в this.teamName и this.userName экземпляра SocketService
            this.teamName = roomNameInput; 
            this.userName = userNameInput;
            finalRoomName = this.teamName;
            finalUserName = this.userName;
            if (!finalRoomName || !finalUserName) {
                log('Невозможно авторизоваться при переподключении: this.teamName или this.userName не установлены (должны были прийти из localStorage).', 'error');
                this.authListeners.forEach(listener => listener({ success: false, message: 'Ошибка данных для переподключения.' }));
                return;
            }
            log(`Попытка переподключения для комнаты: ${finalRoomName}, пользователь: ${finalUserName}`);
        } else {
            // Новая авторизация (не переподключение)
            if (!roomNameInput || !userNameInput) {
                 log('Имя комнаты или пользователя не указано для новой авторизации.', 'warn');
                 this.authListeners.forEach(listener => listener({success: false, message: 'Имя комнаты или пользователя не может быть пустым.'}));
                 return;
            }
            finalRoomName = roomNameInput;
            finalUserName = userNameInput;
            // Сохраняем только при новой попытке авторизации, до фактического emit
            this.teamName = finalRoomName; 
            this.userName = finalUserName;
            log(`Попытка новой авторизации для комнаты: ${this.teamName}, пользователь: ${this.userName}`);
        }

        // Если это не переподключение и данные те же, и Yjs уже подключен, не делаем ничего
        // Эту проверку оставляем, чтобы избежать лишних действий, если пользователь случайно кликнет "Войти" еще раз
        if (!isReconnect && this.teamName === finalRoomName && this.userName === finalUserName && 
            this.yWebsocketProvider && this.yWebsocketProvider.wsconnected) {
            log(`Уже авторизован как ${finalUserName} в комнате ${finalRoomName} и Yjs подключен. Отправляем auth success.`, 'info');
            this.authListeners.forEach(listener => listener({success: true, teamName: finalRoomName, userName: finalUserName}));
            return;
        }
        
        const authPayload = { roomName: this.teamName, userName: this.userName };
        const authCallback = (response) => {
            console.log('[SocketService] authorize authCallback: Получен ответ от сервера:', response); // Добавлено логирование
            if (response && response.status === 'ok') {
                log(`Авторизация Socket.IO подтверждена сервером для комнаты: ${response.roomName}, пользователь: ${response.userName}`);
                // this.teamName и this.userName уже установлены выше и совпадают с response
                this.authListeners.forEach(listener => listener({success: true, teamName: this.teamName, userName: this.userName}));
                
                // Инициализируем Yjs соединение только после успешной Socket.IO авторизации
                this._initYjsConnection(this.teamName); 
                
                // Обновляем локальное состояние Awareness, так как userName теперь точно известен
                if (this.yAwareness) {
                    this.yAwareness.setLocalStateField('user', {
                        name: this.userName,
                        color: getRandomColorFromString(this.userName)
                    });
                    log(`Yjs Awareness: Локальное состояние обновлено/установлено для "${this.userName}" после авторизации.`);
                }

                // Сохраняем данные в localStorage для возможного переподключения
                localStorage.setItem('workMode', 'collaborative');
                localStorage.setItem('roomName', this.teamName);
                localStorage.setItem('userName', this.userName);
                
                // Очищаем временные данные проекта из localStorage после успешной авторизации
                // Удаляем projectName только если он уже был использован для roomName
                const currentProjectName = localStorage.getItem('projectName');
                if (currentProjectName && this.teamName === currentProjectName) {
                    localStorage.removeItem('projectName');
                }

                this.socket.emit('get_online_users_count'); 
            } else {
                const errorMsg = response && response.message ? response.message : 'Ошибка авторизации от сервера.';
                log(`Ошибка авторизации Socket.IO: ${errorMsg}`, 'error');
                this.authListeners.forEach(listener => listener({success: false, message: errorMsg}));
                showNotification(errorMsg, 'error');
            }
        };

        this.pendingAuthorizationData = { authPayload, callback: authCallback };
        log(`Socket.IO: Запрос на авторизацию для комнаты: ${this.teamName}, пользователь: ${this.userName} поставлен в очередь.`);

        if (this.socket.connected) {
            log('Socket.IO уже подключен, немедленно отправляем ожидающий запрос авторизации.');
            this._sendPendingAuthRequest();
        } else {
            log('Socket.IO не подключен, пытаемся установить соединение. Авторизация будет отправлена после.');
        }
    }

    /**
     * Запрашивает инициализацию кода с сервера (старый метод, теперь не нужен для основного контента)
     */
    initializeCode() {
        log('Yjs: initializeCode() вызван, но синхронизация документа управляется WebsocketProvider.', 'info');
        if (this.yWebsocketProvider && this.yWebsocketProvider.wsconnected) {
        } else if(this.teamName){
             log('Yjs: WebsocketProvider не подключен, попытка инициализации Yjs соединения.', 'warn');
             this._initYjsConnection(this.teamName);
        }
    }

    /**
     * Получение текущего имени команды.
     * @return {string}
     */
    getTeamName() { // Этот метод теперь возвращает roomName
        return this.teamName;
    }

    /**
     * Получение текущего имени пользователя.
     * @return {string}
     */
    getUserName() {
        return this.userName;
    }

    // --- Методы подписки на события (on...) ---
    onCodeInitialized(listener) { this.codeInitializedListeners.push(listener); }
    onCodeReset(listener) { this.codeResetListeners.push(listener); }
    onAuth(listener) { this.authListeners.push(listener); }
    onOnlineUsersCount(listener) { this.onlineUsersCountListeners.push(listener); }
    onUserDisconnected(listener) { this.userDisconnectedListeners.push(listener); }
    onHtmlUpdated(listener) { this.htmlUpdatedListeners.push(listener); }
    onCssUpdated(listener) { this.cssUpdatedListeners.push(listener); }
    onCursorMoved(listener) { this.cursorMovedListeners.push(listener); }
    onYjsSynced(listener) { this.yjsSyncedListeners.push(listener); }


    // --- Методы для доступа к Yjs объектам (для CodeEditorManager и др.) ---
    getYDoc() { return this.yDoc; }
    getYTextHtml() { return this.yTextHtml; }
    getYTextCss() { return this.yTextCss; }
    getYAwareness() { return this.yAwareness; }
    
    /**
     * Проверяет, авторизован ли пользователь и активно ли Yjs соединение.
     * @returns {boolean}
     */
    isAuthorized() {
        // Проверяем, установлено ли имя команды (Socket.IO auth) 
        // и подключен ли Yjs WebsocketProvider.
        return !!this.teamName && !!this.yWebsocketProvider && this.yWebsocketProvider.wsconnected;
    }

    // --- Вспомогательные и служебные методы ---

    /**
     * Настраивает обработчик события закрытия страницы/вкладки.
     * Пока оставляем базовую логику, возможно, она будет упрощена или удалена,
     * так как Yjs + y-websocket-server (в памяти) должны сохранять состояние.
     * Для персистентности на сервере нужна БД.
     * @private
     */
    _setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', (event) => {

            if (this.yWebsocketProvider && this.yWebsocketProvider.wsconnected) {

                log('Yjs: Попытка закрытия страницы. Данные должны быть синхронизированы.', 'info');
            }
        });
    }

    /**
     * @private
     * @deprecated Старый метод отправки через Socket.IO, теперь не используется для основного потока данных.
     */
    _socketEmit(event, data) {
        if (this.socket && this.socket.connected) {
            try {
                this.socket.emit(event, data);
                return true;
            } catch (error) {
                log(`Ошибка при отправке события "${event}" через Socket.IO: ${error.message}`, 'error');
                return false;
            }
        } else {
            log(`Не удалось отправить событие "${event}": Socket.IO не подключен.`, 'warn');
            return false;
        }
    }
     _clearAllTimers() {
        log('Очистка таймеров SocketService (если есть).', 'info');
    }

}

export default SocketService;