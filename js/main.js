import { AppInitializer } from './app-initializer.js';
import { AccessibilityManager } from './accessibility.js';

// main.js
// Основной файл для инициализации приложения

/**
 * Инициализация базовых элементов приложения после загрузки DOM
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('[MainJS] DOMContentLoaded - базовая инициализация...');

    // --- Новый код: обработка параметров из URL ---
    const params = new URLSearchParams(window.location.search);
    const projectParam = params.get('project');
    const userParam = params.get('user');
    if (projectParam) {
        localStorage.setItem('projectName', projectParam);
        localStorage.removeItem('roomName');
        localStorage.removeItem('workMode');
    }
    if (userParam) {
        localStorage.setItem('userName', userParam);
    }
    // --- Конец нового кода ---

    // Автозаполнение полей "Название проекта" и "Ваше имя" из localStorage
    const projectName = localStorage.getItem('projectName');
    const userName = localStorage.getItem('userName');
    const projectInput = document.getElementById('room-name');
    const userInput = document.getElementById('user-name');
    if (projectInput && projectName) {
        projectInput.value = projectName;
        projectInput.readOnly = true;
    }
    if (userInput && userName) {
        userInput.value = userName;
        userInput.readOnly = true;
    }

    // Очистка localStorage будет выполнена после успешной авторизации в socket-service.js

    // Проверка на мобильные устройства
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile-device');
        console.log('[MainJS] Обнаружено мобильное устройство.');
    }

    // Перехват глобальных ошибок
    window.addEventListener('error', (event) => {
        console.error('[MainJS] Необработанная ошибка:', event.error, event.message, event.filename, event.lineno);
    });

    console.log('[MainJS] Ожидание события "monaco_loaded"...');

    // Кнопка сохранения проекта в профиль
    const saveBtn = document.getElementById('save-to-profile-btn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            let html = '';
            let css = '';
            let projectName = '';
            let projectId = localStorage.getItem('projectId');
            // Получаем значения из редакторов
            if (window.appInitializer && window.appInitializer.codeEditorManager) {
                html = window.appInitializer.codeEditorManager.htmlEditor?.getValue() || '';
                css = window.appInitializer.codeEditorManager.cssEditor?.getValue() || '';
            }
            // Получаем название проекта
            const projectInput = document.getElementById('room-name');
            if (projectInput) projectName = projectInput.value;

            // Получаем текущего пользователя Firebase
            const user = firebase.auth().currentUser;
            if (!user || !window.db) {
                alert('Необходимо войти в аккаунт для сохранения проекта.');
                return;
            }

            const projectData = {
                name: projectName,
                html,
                css,
                imgUrl: '',
                createdAt: new Date().toISOString()
            };

            if (projectId) {
                // Проверяем, существует ли проект с этим id
                const docRef = window.db.collection('users').doc(user.uid).collection('projects').doc(projectId);
                const doc = await docRef.get();
                if (doc.exists) {
                    await docRef.update(projectData);
                    alert('Проект обновлён!');
                } else {
                    await docRef.set(projectData);
                    alert('Проект сохранён!');
                }
            } else {
                // На всякий случай fallback (но такого быть не должно)
                const docRef = await window.db.collection('users').doc(user.uid).collection('projects').add(projectData);
                localStorage.setItem('projectId', docRef.id);
                // (опционально) обновить URL с id
                const url = new URL(window.location.href);
                url.searchParams.set('id', docRef.id);
                window.history.replaceState({}, '', url);
                alert('Проект сохранён!');
            }
        };
    }
});

/**
 * Инициализация компонентов, зависящих от Monaco, после его полной загрузки.
 */
window.addEventListener('monaco_loaded', () => {
    console.log('[MainJS] Событие "monaco_loaded" получено.');

    if (!window.monaco || !window.monaco.languages) {
        console.error('[MainJS] Monaco или monaco.languages не определены к моменту события monaco_loaded!');
        return; 
    }

    // Логируем языки, доступные сразу после monaco_loaded
    const initialLanguages = window.monaco.languages.getLanguages().map(l => l.id);
    console.log('[MainJS] Языки Monaco сразу после monaco_loaded:', initialLanguages);

    let htmlReady = initialLanguages.includes('html');
    let cssReady = initialLanguages.includes('css');
    let appInitialized = false;

    function tryInitializeApp() {
        if (htmlReady && cssReady && !appInitialized) {
            appInitialized = true;
            console.log('[MainJS] Языки HTML и CSS готовы. Инициализация основного приложения...');
            
            // Создаем экземпляр AppInitializer ТЕПЕРЬ, когда Monaco и языки готовы
            const appInitializerInstance = new AppInitializer();
            // Вызываем его метод init для запуска остальной логики приложения
            appInitializerInstance.init(); 
            // Если нужно сделать экземпляр глобально доступным (как было раньше appInitializer)
            window.appInitializer = appInitializerInstance;
            console.log('[MainJS] AppInitializer создан и его метод init() вызван.');

            window.accessibilityManager = new AccessibilityManager();
            console.log('[MainJS] AccessibilityManager инициализирован.');

            // Загружаем код проекта из Firestore с задержкой, чтобы редакторы успели инициализироваться
            setTimeout(() => {
              if (window.socketService && typeof window.socketService.onCodeInitialized === 'function') {
                window.socketService.onCodeInitialized(() => {
                  const htmlEditor = window.appInitializer?.codeEditorManager?.htmlEditor;
                  const cssEditor = window.appInitializer?.codeEditorManager?.cssEditor;
                  if (!htmlEditor || !cssEditor) return;
                  if (!htmlEditor.getValue() && !cssEditor.getValue()) {
                    const params = new URLSearchParams(window.location.search);
                    const projectId = params.get('id') || localStorage.getItem('projectId');
                    if (!projectId) return;
                    firebase.auth().onAuthStateChanged(async user => {
                      if (!user || !window.db) return;
                      const doc = await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).get();
                      if (!doc.exists) return;
                      const p = doc.data();
                      if (htmlEditor) htmlEditor.setValue(p.html || '');
                      if (cssEditor) cssEditor.setValue(p.css || '');
                    });
                  }
                });
              }
            }, 0);
            console.log('[MainJS] Приложение полностью инициализировано (включая компоненты Monaco).');
        }
    }

    // Проверяем, если языки уже доступны (могут быть из кеша или быстрой загрузки)
    tryInitializeApp();

    if (!htmlReady) {
        console.log('[MainJS] Ожидание регистрации языка HTML...');
        const htmlListener = window.monaco.languages.onLanguage('html', () => {
            console.log('[MainJS] Язык HTML зарегистрирован.');
            htmlReady = true;
            htmlListener.dispose(); // Удаляем слушатель после срабатывания
            tryInitializeApp();
        });
    }

    if (!cssReady) {
        console.log('[MainJS] Ожидание регистрации языка CSS...');
        const cssListener = window.monaco.languages.onLanguage('css', () => {
            console.log('[MainJS] Язык CSS зарегистрирован.');
            cssReady = true;
            cssListener.dispose(); // Удаляем слушатель после срабатывания
            tryInitializeApp();
        });
    }
});

// После инициализации приложения и редакторов
function loadProjectCodeFromFirestore() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id') || localStorage.getItem('projectId');
  if (!projectId) return;
  // Ждём, когда пользователь будет авторизован
  firebase.auth().onAuthStateChanged(async user => {
    if (!user || !window.db) return;
    const doc = await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).get();
    if (!doc.exists) return;
    const p = doc.data();
    // Вставляем код в редакторы, если они инициализированы
    if (window.appInitializer && window.appInitializer.codeEditorManager) {
      if (window.appInitializer.codeEditorManager.htmlEditor) {
        window.appInitializer.codeEditorManager.htmlEditor.setValue(p.html || '');
      }
      if (window.appInitializer.codeEditorManager.cssEditor) {
        window.appInitializer.codeEditorManager.cssEditor.setValue(p.css || '');
      }
    }
  });
}