import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Корневая папка
  root: '.',
  
  // Папка для сборки
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    // Входные точки - все HTML файлы
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        profile: resolve(__dirname, 'profile.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        chat: resolve(__dirname, 'chat.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  },
  
  // Настройки сервера для разработки
  server: {
    port: 5173,
    proxy: {
      // Проксируем API запросы к Node.js серверу
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  
  // Базовый путь для продакшена
  base: './'
});