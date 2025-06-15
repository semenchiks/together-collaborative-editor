// auth-modal.js
// Модуль для управления формой авторизации

import { showNotification } from './utils.js';


/**
 * Класс для управления модальным окном авторизации
 */
export class AuthModal {
    /**
     * Конструктор класса AuthModal
     * @param {Object} socketService - Экземпляр сервиса сокетов
     * @param {Object} codeEditorManager - Экземпляр менеджера редакторов кода
     * @param {Object} cursorManager - Экземпляр менеджера курсоров
     */
    constructor(socketService, codeEditorManager /*, cursorManager */) {
        this.socketService = socketService;
        this.codeEditorManager = codeEditorManager;
        this.loginFormModal = null;
        this.collaborativeModeBtn = null; // Будет удален обработчик
        this.backToMainBtn = null; // Будет удален обработчик
        this.loginForm = null;
        this.roomNameInput = null;
        this.userNameInput = null;
        this.errorMsg = null;
        this.loginSubmitBtn = null; // Новая кнопка
        this.initialized = false;


        // Инициализация
        this._initialize();
    }

    /**
     * Инициализация модального окна
     * @private
     */
    _initialize() {
        try {
            console.log('[AuthModal] _initialize: Начало');
            this.loginFormModal = document.getElementById('login-form-modal');
            this.collaborativeModeBtn = document.getElementById('collaborative-mode-btn'); // Элемент останется в DOM, но обработчик будет удален
            // this.soloModeBtn = document.getElementById('solo-mode-btn'); // Удалено
            this.backToMainBtn = document.getElementById('back-to-main'); // Элемент будет удален из HTML, обработчик удалим
            this.loginForm = document.getElementById('login-form');
            this.roomNameInput = document.getElementById('room-name');
            this.userNameInput = document.getElementById('user-name');
            this.errorMsg = document.getElementById('error-notification');
            this.loginSubmitBtn = document.getElementById('login-submit-btn'); // Находим новую кнопку

            if (!this.loginFormModal) {
                console.error('Модальное окно формы входа не найдено (login-form-modal)');
            }

            if (!this.loginForm) {
                console.error('Форма входа не найдена (login-form)');
            }
            if (!this.roomNameInput) {
                console.error('Поле ввода имени комнаты не найдено (room-name)');
            }
            if (!this.userNameInput) {
                console.error('Поле ввода имени пользователя не найдено (user-name)');
            }
            if (!this.loginSubmitBtn) { // Проверка для новой кнопки
                console.error('Кнопка отправки формы входа не найдена (login-submit-btn)');
            }
            // Настраиваем обработчики событий
            this._setupEventListeners();

            // Проверяем предыдущую авторизацию
            console.log('[AuthModal] _initialize: Вызов checkAuth()');
            const hasAuth = this.checkAuth();
            console.log(`[AuthModal] _initialize: checkAuth() вернул: ${hasAuth}`);

            // Если пользователь не авторизован И checkAuth не инициировал скрытие модалки,
            // то показываем окно входа (loginFormModal изначально виден, так что это для ясности)
            if (!hasAuth) {
                // this.showLoginForm(); // Форма и так видна по умолчанию, если стили не скрывают
                console.log('[AuthModal] _initialize: Пользователь не авторизован или сессия не восстановлена, форма входа должна быть видна.');
            }

            // Устанавливаем флаг инициализации
            this.initialized = true;

            console.log('Модальное окно авторизации успешно инициализировано');
        } catch (error) {
            console.error('Ошибка при инициализации модального окна авторизации:', error);
        }
    }

    /**
     * Проверка предыдущей авторизации
     */
    checkAuth() {
        console.log('[AuthModal] checkAuth: Начало');
        // Проверяем режим работы
        const mode = localStorage.getItem('workMode');

        if (mode === 'collaborative') {
            // Совместный режим
            const roomName = localStorage.getItem('roomName');
            const userName = localStorage.getItem('userName');
            if (roomName && userName) {
                // Пользователь уже авторизован, восстанавливаем сессию
                console.log(`[AuthModal] checkAuth: Восстановление сессии для комнаты: ${roomName}, пользователь: ${userName}`);
                // this.isSoloMode = false; // Удалено
                this.socketService.authorize(roomName, userName, true); // isReconnecting = true
                console.log('[AuthModal] checkAuth: Вызов hideLoginModals() после попытки восстановления сессии.');
                this.hideLoginModals(); // Скрывает оба модальных окна
                console.log('[AuthModal] checkAuth: Завершение, возвращаем true (попытка восстановления)');
                return true;
            }
        } else if (mode === 'solo') { // Если старая запись о solo режиме осталась, чистим ее
            localStorage.removeItem('workMode');
            localStorage.removeItem('userName');
        }

        console.log('[AuthModal] checkAuth: Завершение, возвращаем false (нет данных для восстановления)');
        return false;
    }

    /**
     * Показываем основной контейнер и скрываем логин после авторизации
     * @private
     */
    _showMainContainerAfterAuth() {
        if (this.loginFormModal) {
            this.loginFormModal.style.display = 'none';
        }

        // Показываем основной контейнер
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.display = 'flex';
        }

        // Показываем счетчик пользователей только в совместном режиме
        const onlineUsersContainer = document.querySelector('.online-users');
        if (onlineUsersContainer) {
            // onlineUsersContainer.style.display = this.isSoloMode ? 'none' : 'block'; // Удалено isSoloMode, всегда block
            onlineUsersContainer.style.display = 'block';
        }

        console.log('Основной контейнер показан после успешной авторизации');
    }

    /**
     * Показать форму входа для совместного режима
     */
    showLoginForm() {
        console.log('Показываем форму входа'); // Изменено

        // Обновляем заголовок формы
        const formTitle = this.loginFormModal.querySelector('h2');
        if (formTitle) {
            formTitle.textContent = 'Вход'; // Изменено
        }

        // Обновляем плейсхолдер поля ввода
        if (this.roomNameInput) {
            this.roomNameInput.placeholder = 'Название комнаты';
        }
        if (this.userNameInput) {
            this.userNameInput.placeholder = 'Имя пользователя';
        }

        if (this.loginFormModal) {
            console.log('Модальное окно формы входа найдено, устанавливаем display: flex');
            this.loginFormModal.style.display = 'flex';
        } else {
            console.error('Модальное окно формы входа не найдено');
        }

    }

    /**
     * Скрыть все модальные окна входа
     */
    hideLoginModals() {
        console.log('[AuthModal] hideLoginModals: Начало');
        if (this.loginFormModal) {
            this.loginFormModal.style.display = 'none';
            console.log('[AuthModal] hideLoginModals: loginFormModal скрыт.');
        } else {
            console.warn('[AuthModal] hideLoginModals: loginFormModal не найден.');
        }
        console.log('[AuthModal] hideLoginModals: Завершение');
    }

    /**
     * Выход из системы
     */
    logout() {
        console.log('Выход из системы...');
            // Выход из совместного режима
            localStorage.removeItem('roomName');
            localStorage.removeItem('userName');
            localStorage.removeItem('workMode'); // Также чистим workMode
            if (this.socketService) {
                this.socketService.disconnect(); // Отключаемся от сокета
            }
            showNotification('Вы вышли из системы.', 'info');
        // }

        // Скрываем основной контейнер
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.display = 'none';
        }

        // Очищаем редакторы
        if (this.codeEditorManager) {
            this.codeEditorManager.clearEditors();
        }

        // Перезагрузка страницы для полной очистки состояния (опционально, но рекомендуется)
        // window.location.reload(); 
        console.log('Выход завершен, показана форма входа.');
    }

    /**
     * Настройка обработчиков событий
     * @private
     */
    _setupEventListeners() {
        console.log('[AuthModal] _setupEventListeners: Начало установки обработчиков.');
        
        // Обработчик для отправки формы входа
        if (this.loginForm) {
            console.log('[AuthModal] _setupEventListeners: loginForm найден, обработчик submit не используется.');
        } else {
            console.error('[AuthModal] _setupEventListeners: Форма входа (loginForm) не найдена.');
        }

        // Новый обработчик для кнопки отправки
        if (this.loginSubmitBtn) {
            console.log('[AuthModal] _setupEventListeners: loginSubmitBtn найдена, добавляем обработчик click.');
            this.loginSubmitBtn.addEventListener('click', (event) => {
                console.log('[AuthModal] Кнопка loginSubmitBtn нажата.');
                this._handleLoginSubmit(event);
            });
        } else {
            console.error('[AuthModal] _setupEventListeners: Кнопка loginSubmitBtn не найдена, обработчик НЕ будет установлен.');
        }

    }

    /**
     * Обработка отправки формы входа
     * @param {Event} event - Событие отправки формы
     * @private
     */
    _handleLoginSubmit(event) { // event теперь событие клика
        if (event) { // Добавляем проверку на существование event
            event.preventDefault();
            console.log('[AuthModal] _handleLoginSubmit: event.preventDefault() вызван для события click.');
        } else {
            console.log('[AuthModal] _handleLoginSubmit: вызван без объекта события.');
        }
        
        console.log('[AuthModal] _handleLoginSubmit: Начало');
        const roomName = this.roomNameInput.value.trim();
        const userName = this.userNameInput.value.trim();

        if (!roomName) {
            this._showError('Название комнаты не может быть пустым.');
            showNotification('Название комнаты не может быть пустым.', 'error');
            return;
        }
        if (!userName) {
            this._showError('Имя пользователя не может быть пустым.');
            showNotification('Имя пользователя не может быть пустым.', 'error');
            return;
        }

        // Скрываем сообщение об ошибке, если оно было
        if (this.errorMsg) {
            this.errorMsg.style.display = 'none';
        }

        // Логика для совместного режима
        console.log(`[AuthModal] _handleLoginSubmit: Вызов socketService.authorize для комнаты: ${roomName}, пользователь: ${userName}`);
        this.socketService.authorize(roomName, userName);
        console.log('[AuthModal] _handleLoginSubmit: Завершение. Ожидание ответа от сервера.');
    }

    /**
     * Показать сообщение об ошибке
     * @param {string} message - Сообщение об ошибке
     * @private
     */
    _showError(message) {
        if (this.errorMsg) {
            this.errorMsg.textContent = message;
            this.errorMsg.style.display = 'block';
        }
        console.error('Ошибка авторизации:', message);
    }
}