import { showNotification, throttle, showMergeNotification } from './utils.js';
import SocketService from './socket-service.js';
import { AuthModal } from './auth-modal.js';
import CodeEditorManager from './code-editor-manager.js';
import { SyncStatusIndicator } from './sync-status-indicator.js';
import { EditorUI } from './editor-ui.js';
import { setupGlobalCursors } from './cursor-overlay.js';
import { getUserEmoji } from './utils.js';

export class AppInitializer {
    constructor() {
        console.log('[AppInitializer] Конструктор вызван');
        this.socketService = null;
        this.authModal = null;
        this.htmlEditor = null;
        this.cssEditor = null;
        this.previewFrame = null;
        this.isPreviewUpdatePending = false;
        this.syncStatusIndicator = null;
        this.codeEditorManager = null;
        this.editorUI = null;
        this.throttledUpdatePreview = throttle(this._performPreviewUpdate.bind(this), 500);
    }

    init() {
        console.log('[AppInitializer] init() вызван');
        try {
            if (document.readyState === 'loading') {
                console.log('[AppInitializer] DOM еще загружается, добавляем слушатель DOMContentLoaded');
                document.addEventListener('DOMContentLoaded', () => this._doApplicationSetup());
            } else {
                console.log('[AppInitializer] DOM уже загружен, выполняем _doApplicationSetup');
                this._doApplicationSetup();
            }
        } catch (error) {
            console.error('Ошибка при вызове AppInitializer.init():', error);
            this._showError('Произошла ошибка при запуске инициализации приложения');
        }
    }

    _doApplicationSetup() {
        console.log('[AppInitializer] _doApplicationSetup() запущен');
        try {
            this.socketService = new SocketService();
            window.socketService = this.socketService;
            console.log('[AppInitializer] SocketService создан');

            if (!window.monaco) {
                console.error('[AppInitializer] CRITICAL: window.monaco не доступен перед созданием CodeEditorManager!');
                this._showError('Критическая ошибка: Monaco Editor не загружен.');
                return;
            }
            this.codeEditorManager = new CodeEditorManager(this.socketService);
            console.log('[AppInitializer] CodeEditorManager создан');

            this.editorUI = new EditorUI(this.codeEditorManager, this);
            window.editorUI = this.editorUI;
            console.log('[AppInitializer] EditorUI создан');

            this.authModal = new AuthModal(this.socketService, this.codeEditorManager);
            console.log('[AppInitializer] AuthModal создан');

            this._initPreviewFrame();

            // Подписка на события сокетов
            this._subscribeToSocketEvents();

            // Инициализация индикатора статуса синхронизации
            this.syncStatusIndicator = new SyncStatusIndicator();
            console.log('[AppInitializer] SyncStatusIndicator создан');

            console.log('[AppInitializer] Приложение успешно настроено (в _doApplicationSetup)');

            // Подписываемся на события слияния HTML
            document.addEventListener('html_merged', (event) => {
                const teamName = event.detail.teamName;
                showMergeNotification(teamName, 'html');
            });

            // Подписываемся на события слияния CSS
            document.addEventListener('css_merged', (event) => {
                const teamName = event.detail.teamName;
                showMergeNotification(teamName, 'css');
            });
        } catch (error) {
            console.error('Ошибка в AppInitializer._doApplicationSetup():', error);
            this._showError('Произошла ошибка при основной настройке приложения');
        }
    }

    /**
     * Инициализация фрейма предпросмотра
     * @private
     */
    _initPreviewFrame() {
        try {
            this.previewFrame = document.getElementById('output');

            if (!this.previewFrame) {
                console.error('Элемент предпросмотра не найден');
                return;
            }

            console.log('Фрейм предпросмотра успешно инициализирован');

            // Добавляем таймер для проверки и обновления предпросмотра
            this.previewCheckInterval = setInterval(() => {
                this._checkAndUpdatePreview();
            }, 2000); // Проверяем каждые 2 секунды
        } catch (error) {
            console.error('Ошибка при инициализации фрейма предпросмотра:', error);
            this._showError('Произошла ошибка при инициализации предпросмотра');
        }
    }

    /**
     * Проверяет состояние предпросмотра и обновляет его при необходимости
     * @private
     */
    _checkAndUpdatePreview() {
        if (!this.previewFrame || !this.codeEditorManager) return;

        try {
            const frameDocument = this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
            const htmlCode = this.codeEditorManager.htmlEditor ? this.codeEditorManager.htmlEditor.getValue() : '';
            const cssCode = this.codeEditorManager.cssEditor ? this.codeEditorManager.cssEditor.getValue() : '';

            // Проверяем, есть ли код в редакторах, но предпросмотр пустой
            if ((htmlCode || cssCode) && (!frameDocument.body || frameDocument.body.innerHTML.trim() === '')) {
                console.log('Обнаружен пустой предпросмотр, обновляем...');
                this._updatePreview(true); // Принудительное обновление
            }
        } catch (error) {
            console.error('Ошибка при проверке предпросмотра:', error);
        }
    }

    /**
     * Подписка на события сокетов
     * @private
     */
    _subscribeToSocketEvents() {
        console.log('[AppInitializer] _subscribeToSocketEvents: Начало подписки');
        // Обработка события успешной авторизации
        this.socketService.onAuth((data) => {
            console.log('[AppInitializer] onAuth: Полные данные от socketService:', JSON.parse(JSON.stringify(data)));
            console.log('[AppInitializer] onAuth: Получен ответ от сервера:', data);
            if (data.success) {
                // showNotification(`Вход выполнен под именем: ${data.teamName}`, 'success'); // Старое уведомление
                showNotification(`Вход в комнату '${data.teamName}' выполнен как '${data.userName}'`, 'success');

                // Сохраняем данные в localStorage ПОСЛЕ успешной авторизации
                localStorage.setItem('workMode', 'collaborative');
                localStorage.setItem('roomName', data.teamName); // Используем имя комнаты от сервера
                localStorage.setItem('userName', data.userName); // Используем имя пользователя от сервера
                console.log('[AppInitializer] onAuth (success): Данные сохранены в localStorage.');

                // Показываем основной контейнер и скрываем логин
                console.log('[AppInitializer] onAuth (success): Вызов _showMainContainerAfterAuth()');
                this._showMainContainerAfterAuth(); // Этот метод также скроет модальное окно входа

                // Принудительно обновляем предпросмотр после авторизации
                setTimeout(() => {
                    this._updatePreview(true); // Принудительное обновление
                    console.log('Принудительное обновление предпросмотра после авторизации');
                }, 500); // Небольшая задержка
            } else {
                // Обработка ошибки авторизации, если data.message есть
                if (data.message) {
                    showNotification(`Ошибка авторизации: ${data.message}`, 'error');
                    console.error(`[AppInitializer] onAuth (error): Ошибка авторизации: ${data.message}`);
                }
                // чтобы checkAuth() при обновлении страницы не пытался восстановить невалидную сессию.
                localStorage.removeItem('workMode');
                localStorage.removeItem('roomName');
                localStorage.removeItem('userName');
                console.log('[AppInitializer] onAuth (error): localStorage очищен после неудачной авторизации.');

                if (this.authModal && typeof this.authModal.showLoginForm === 'function') {
                    console.log('[AppInitializer] onAuth (error): Авторизация не удалась, попытка показать форму входа снова.');
                    this.authModal.showLoginForm();
                }
            }
        });


        // Обработка события инициализации кода (готовности Yjs)
        this.socketService.onCodeInitialized(() => {
            // showNotification('Код успешно загружен из базы данных', 'success'); // Старое уведомление
            showNotification('Редакторы синхронизированы с комнатой', 'success');

            // Теперь здесь инициализируем редакторы, так как Yjs готов
            if (this.codeEditorManager && !this.codeEditorManager.isInitialized) {
                console.log('AppInitializer: Yjs готов, инициализация CodeEditorManager...');
                this.codeEditorManager.initCodeEditors();
            }

            // === Глобальные смайлик-курсоры ===
            const yAwareness = this.socketService.getYAwareness && this.socketService.getYAwareness();
            const userName = this.socketService.getUserName && this.socketService.getUserName();
            if (yAwareness && userName) {
                // 1. Инициализация отображения курсоров других пользователей
                setupGlobalCursors(yAwareness, yAwareness.clientID);
                // 2. Отправка координат мыши в Awareness
                document.addEventListener('mousemove', (e) => {
                    yAwareness.setLocalStateField('mouse', {
                        x: e.clientX,
                        y: e.clientY
                    });
                });
            }
            // === Конец блока глобальных курсоров ===

            // Принудительно обновляем предпросмотр несколько раз с задержкой
            this._updatePreview(true); // Принудительное обновление

            // Дополнительные обновления с задержкой для надежности
            setTimeout(() => {
                this._updatePreview(true); // Принудительное обновление
                console.log('Повторное обновление предпросмотра после инициализации кода');
            }, 1000);

            setTimeout(() => {
                this._updatePreview(true); // Принудительное обновление
                console.log('Финальное обновление предпросмотра после инициализации кода');
            }, 2000);
        });

        // Обработка события сброса кода
        this.socketService.onCodeReset(() => {
            showNotification('Код сброшен к начальным значениям', 'warning');
            this._updatePreview(true); // Принудительное обновление
        });
    }

    /**
     * Показываем основной контейнер и скрываем логин после авторизации
     * @private
     */
    _showMainContainerAfterAuth() {
        console.log('[AppInitializer] _showMainContainerAfterAuth: Начало');
        const loginFormModal = document.getElementById('login-form-modal');
        if (loginFormModal) {
            loginFormModal.style.display = 'none';
            console.log('[AppInitializer] _showMainContainerAfterAuth: loginFormModal скрыт.');
        }
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.display = 'flex';
            console.log('[AppInitializer] _showMainContainerAfterAuth: mainContent показан.');
        }
        const onlineUsersContainer = document.querySelector('.online-users');
        if (onlineUsersContainer) {
            onlineUsersContainer.style.display = 'block';
        }
        console.log('[AppInitializer] _showMainContainerAfterAuth: Завершение. Основной контейнер показан после успешной авторизации');
    }

    /**
     * Обновление предпросмотра с возможностью принудительного обновления
     * @param {boolean} force - Принудительное обновление, даже если код не изменился
     * @param {boolean} isLocalChange - Флаг, указывающий, что изменение локальное (для мгновенного обновления)
     * @private
     */
    _updatePreview(force = false, isLocalChange = false) {
        if (isLocalChange) {
            // Для локальных изменений, выполняем немедленно и не троттлим
            this.forcePreviewUpdate = force || this.forcePreviewUpdate; 
            this._performPreviewUpdate();
        } else {
            // Для нелокальных (удаленных) изменений, используем троттлинг
            this.forcePreviewUpdate = force || this.forcePreviewUpdate; 
            this.throttledUpdatePreview();
        }
    }

    /**
     * Выполняет фактическое обновление предпросмотра
     * @private
     */
    _performPreviewUpdate() {
        if (this.isPreviewUpdatePending && !this.forcePreviewUpdate) return; // Если уже обновляется и не принудительно, выходим

        this.isPreviewUpdatePending = true;

        requestAnimationFrame(() => {
            try {
                if (!this.previewFrame) {
                    console.warn('[AppInitializer] previewFrame не найден в _performPreviewUpdate');
                    this.isPreviewUpdatePending = false;
                    return;
                }

                const frameDocument = this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
                if (!frameDocument) {
                    console.warn('[AppInitializer] frameDocument не доступен в _performPreviewUpdate');
                    this.isPreviewUpdatePending = false;
                    return;
                }

                const htmlCode = this.codeEditorManager && this.codeEditorManager.htmlEditor ? this.codeEditorManager.htmlEditor.getValue() : '';
                const cssCode = this.codeEditorManager && this.codeEditorManager.cssEditor ? this.codeEditorManager.cssEditor.getValue() : '';

                const isEmpty = !frameDocument.body || frameDocument.body.innerHTML.trim() === '';
                const contentChanged = this.lastHtmlCode !== htmlCode || this.lastCssCode !== cssCode;

                if (!this.forcePreviewUpdate && !contentChanged && !isEmpty) {
                    this.isPreviewUpdatePending = false;
                    return;
                }
                
                this.lastHtmlCode = htmlCode;
                this.lastCssCode = cssCode;
                this.forcePreviewUpdate = false; // Сбрасываем флаг принудительного обновления после использования

                console.log('[AppInitializer] Обновляем предпросмотр. HTML: ' + htmlCode.length + ' байт, CSS: ' + cssCode.length + ' байт');

                frameDocument.open();
                frameDocument.write(`
                    <!DOCTYPE html>
                    <html lang="ru">
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                body {
                                    background-color: #1a1a1a; /* Темный фон для лучшей читаемости */
                                    color: #e0e0e0; /* Светлый текст */
                                    font-family: 'Arial', sans-serif; /* Стандартный шрифт */
                                    margin: 0;
                                    padding: 10px;
                                    box-sizing: border-box;
                                }
                                ${cssCode}
                            </style>
                        </head>
                        <body>${htmlCode}</body>
                    </html>
                `);
                frameDocument.close(); // Важно закрыть документ для завершения парсинга

            } catch (error) {
                console.error('Ошибка в AppInitializer._performPreviewUpdate():', error);
                this._showError('Произошла ошибка при обновлении предпросмотра');
            } finally {
                this.isPreviewUpdatePending = false;
            }
        });
    }

    /**
     * Получает структуру HTML документа (без содержимого)
     * @param {string} html - HTML код
     * @returns {string} - Хэш структуры документа
     * @private
     */
    _getDocStructure(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Упрощенное представление структуры документа
            return doc.doctype?.name + Array.from(doc.querySelectorAll('*')).map(el =>
                el.tagName + (el.id ? '#' + el.id : '') +
                (el.className ? '.' + el.className.replace(/\s+/g, '.') : '')
            ).join('|');
        } catch (e) {
            return null;
        }
    }

    /**
     * Отображение ошибки
     * @param {string} message - Сообщение об ошибке
     * @private
     */
    _showError(message) {
        showNotification(message, 'error', 5000);
    }

    /**
     * Инициализирует обработчик сообщений от iframe (если используется)
     * @private
     */
    _initPreviewMessageHandler() {
        window.addEventListener('message', (event) => {
            if (event.data === 'previewLoaded') {
                console.log('[AppInitializer] Предпросмотр полностью загружен (событие от iframe)');
            }
        });
    }
}