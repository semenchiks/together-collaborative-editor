import { getUserEmoji } from './utils.js';

/**
 * Инициализирует глобальные смайлик-курсоры и систему пометок для всех пользователей
 * @param {object} yAwareness - объект Yjs Awareness
 * @param {number} localClientID - ID текущего клиента
 */
export function setupGlobalCursors(yAwareness, localClientID) {
    const cursorLayerId = 'global-cursor-layer';
    let cursorLayer = document.getElementById(cursorLayerId);
    if (!cursorLayer) {
        cursorLayer = document.createElement('div');
        cursorLayer.id = cursorLayerId;
        cursorLayer.style.position = 'fixed';
        cursorLayer.style.left = '0';
        cursorLayer.style.top = '0';
        cursorLayer.style.width = '100vw';
        cursorLayer.style.height = '100vh';
        cursorLayer.style.pointerEvents = 'none';
        cursorLayer.style.zIndex = '9999';
        document.body.appendChild(cursorLayer);
    }

    // Для хранения состояния чата (локально)
    let chatInputState = {
        visible: false,
        x: 0,
        y: 0
    };

    // Создаём input для чата (один на пользователя)
    let chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.placeholder = 'Введите сообщение...';
    chatInput.style.position = 'fixed';
    chatInput.style.zIndex = '10001';
    chatInput.style.display = 'none';
    chatInput.style.minWidth = '180px';
    chatInput.style.fontSize = '15px';
    chatInput.style.padding = '4px 8px';
    chatInput.style.borderRadius = '6px';
    chatInput.style.border = '1px solid #aaa';
    chatInput.style.background = '#fff';
    chatInput.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    chatInput.style.pointerEvents = 'auto';
    document.body.appendChild(chatInput);

    // === КНОПКА ДЛЯ ДОБАВЛЕНИЯ ЗАМЕТКИ (обновлённая версия) ===
    let addMarkBtn = document.createElement('button');
    addMarkBtn.title = 'Оставить заметку';
    addMarkBtn.setAttribute('aria-label', 'Оставить заметку');
    addMarkBtn.className = 'notes-btn';
    addMarkBtn.innerHTML = '<i class="fa-regular fa-comment-dots"></i>';
    document.body.appendChild(addMarkBtn);

    let markMode = false;
    let markClickHandler = null;

    addMarkBtn.addEventListener('click', () => {
        markMode = true;
        addMarkBtn.disabled = true;
        document.body.style.cursor = 'crosshair';
        markClickHandler = (e) => {
            if (!markMode) return;
            markMode = false;
            addMarkBtn.disabled = false;
            document.body.style.cursor = '';
            chatInputState.visible = true;
            chatInputState.x = e.clientX;
            chatInputState.y = e.clientY;
            chatInput.value = '';
            chatInput.style.left = (chatInputState.x + 30) + 'px';
            chatInput.style.top = (chatInputState.y - 10) + 'px';
            chatInput.style.display = 'block';
            chatInput.focus();
            document.removeEventListener('click', markClickHandler, true);
        };
        document.addEventListener('click', markClickHandler, true);
    });

    // При потере фокуса скрываем input
    chatInput.addEventListener('blur', () => {
        chatInputState.visible = false;
        chatInput.style.display = 'none';
    });

    // При нажатии Enter сохраняем пометку в Awareness
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInputState.visible && chatInput.value.trim()) {
            // Получаем текущие пометки из Awareness
            let marks = yAwareness.getLocalState().marks || [];
            // Добавляем новую пометку
            marks = marks.concat([{
                id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
                x: chatInputState.x,
                y: chatInputState.y,
                text: chatInput.value,
                authorId: localClientID
            }]);
            yAwareness.setLocalStateField('marks', marks);
            chatInputState.visible = false;
            chatInput.style.display = 'none';
        }
    });

    // Обработка удаления пометки (крестик)
    window.removeMarkById = function(markId) {
        let marks = yAwareness.getLocalState().marks || [];
        marks = marks.filter(m => m.id !== markId);
        yAwareness.setLocalStateField('marks', marks);
    };

    function renderCursors() {
        const states = yAwareness.getStates();
        cursorLayer.innerHTML = '';
        // Сначала рендерим курсоры
        states.forEach((state, clientID) => {
            if (state.mouse && state.user) {
                const { x, y } = state.mouse;
                const name = state.user.name;
                const color = state.user.color;
                const emoji = getUserEmoji(name);

                const cursorDiv = document.createElement('div');
                cursorDiv.style.position = 'fixed';
                cursorDiv.style.left = `${x}px`;
                cursorDiv.style.top = `${y}px`;
                cursorDiv.style.transform = 'translate(-50%, -50%)';
                cursorDiv.style.pointerEvents = 'none';
                cursorDiv.style.zIndex = '10000';
                cursorDiv.style.display = 'flex';
                cursorDiv.style.alignItems = 'center';

                cursorDiv.innerHTML = `
                    <span style="font-size:2em; filter: drop-shadow(0 0 2px ${color});">${emoji}</span>
                    <span style="background:${color};color:#fff;padding:2px 6px;border-radius:4px;margin-left:6px;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.15);">${name}</span>
                `;
                cursorLayer.appendChild(cursorDiv);
            }
        });
        // Затем рендерим пометки всех пользователей
        states.forEach((state, clientID) => {
            if (state.marks && Array.isArray(state.marks)) {
                state.marks.forEach(mark => {
                    const markDiv = document.createElement('div');
                    markDiv.style.position = 'fixed';
                    markDiv.style.left = `${mark.x + 40}px`;
                    markDiv.style.top = `${mark.y - 10}px`;
                    markDiv.style.zIndex = '10002';
                    markDiv.style.background = '#fff';
                    markDiv.style.border = '1px solid #aaa';
                    markDiv.style.borderRadius = '8px';
                    markDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                    markDiv.style.padding = '8px 16px 8px 12px';
                    markDiv.style.fontSize = '15px';
                    markDiv.style.color = '#222';
                    markDiv.style.display = 'flex';
                    markDiv.style.alignItems = 'center';
                    markDiv.style.pointerEvents = 'auto';
                    markDiv.style.maxWidth = '320px';
                    markDiv.style.wordBreak = 'break-word';

                    // Получаем имя автора и эмодзи
                    let authorEmoji = '';
                    let authorName = '';
                    // Ищем state автора по clientID или authorId
                    let authorState = states.get(mark.authorId);
                    if (authorState && authorState.user && authorState.user.name) {
                        authorName = authorState.user.name;
                        authorEmoji = getUserEmoji(authorName);
                    }

                    // Крестик теперь виден для всех
                    let closeBtn = `<span onclick="window.removeMarkById('${mark.id}')" style="margin-left:10px;cursor:pointer;font-size:18px;color:#888;">&times;</span>`;

                    markDiv.innerHTML = `
                        <span style="margin-right:8px;font-size:1.2em;">💬</span>
                        <span style="margin-right:8px;font-size:1.4em;">${authorEmoji}</span>
                        <span>${mark.text}</span>
                        ${closeBtn}
                    `;
                    cursorLayer.appendChild(markDiv);
                });
            }
        });
    }

    yAwareness.on('change', renderCursors);
    renderCursors();
} 