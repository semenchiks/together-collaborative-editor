// chat.js
// Простой общий чат на Firestore

const messagesRef = window.db.collection('chat-messages');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// Проверяем состояние аутентификации
window.auth.onAuthStateChanged(user => {
  console.log('Auth state changed:', user);
  if (user) {
    console.log('User logged in:', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    });
  } else {
    console.log('User not logged in');
  }
});

// Получить имя пользователя
function getUserName() {
  if (window.auth && window.auth.currentUser) {
    return window.auth.currentUser.displayName || (window.auth.currentUser.email ? window.auth.currentUser.email.split('@')[0] : 'Гость');
  }
  const name = localStorage.getItem('userName');
  return name || 'Гость';
}

// Получить данные пользователя (имя и фото)
async function getUserData() {
  const user = window.auth && window.auth.currentUser;
  console.log('getUserData: current user:', user);
  
  if (!user) {
    console.log('getUserData: no user, returning guest data');
    return {
      name: localStorage.getItem('userName') || 'Гость',
      photoURL: 'img/default-avatar.png.png'
    };
  }
  
  // Пытаемся получить данные из Firestore
  try {
    const doc = await window.db.collection('users').doc(user.uid).get();
    const data = doc.data();
    console.log('getUserData: Firestore data:', data);
    console.log('getUserData: user.photoURL:', user.photoURL);
    
    const result = {
      name: (data && data.displayName) || user.displayName || user.email.split('@')[0],
      photoURL: (data && data.photoURL) || user.photoURL || 'img/default-avatar.png.png'
    };
    console.log('getUserData: final result:', result);
    return result;
  } catch (e) {
    console.error('getUserData: Firestore error:', e);
    const result = {
      name: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || 'img/default-avatar.png.png'
    };
    console.log('getUserData: fallback result:', result);
    return result;
  }
}

// --- Поделиться проектом ---
const shareBtn = document.getElementById('share-project-btn');
const shareModal = document.getElementById('share-modal');
const closeShareModal = document.getElementById('close-share-modal');
const shareProjectsList = document.getElementById('share-projects-list');

if (shareBtn && shareModal && closeShareModal && shareProjectsList) {
  shareBtn.onclick = async () => {
    // Открыть модалку
    shareModal.classList.add('show');
    shareProjectsList.innerHTML = '<div style="color:#ffe000;text-align:center;">Загрузка...</div>';
    // Получить проекты пользователя
    let user = (window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
    if (!user) {
      shareProjectsList.innerHTML = '<div style="color:#ff5252;text-align:center;">Войдите в аккаунт, чтобы делиться проектами</div>';
      return;
    }
    const snap = await window.db.collection('users').doc(user.uid).collection('projects').orderBy('createdAt', 'desc').get();
    if (snap.empty) {
      shareProjectsList.innerHTML = '<div style="color:#ffe000;text-align:center;">У вас нет проектов</div>';
      return;
    }
    let html = '';
    snap.forEach(doc => {
      const p = doc.data();
      html += `<div class=\"share-project-card\" data-id=\"${doc.id}\">\n<img src=\"${p.imgUrl || 'img/default-project.png'}\" alt=\"img\">\n        <div class=\"card-title\">${p.name || 'Без названия'}</div>\n        <button class=\"send-project-btn\" data-id=\"${doc.id}\">Отправить</button>\n      </div>`;
    });
    shareProjectsList.innerHTML = html;
    // Навешиваем обработчики
    shareProjectsList.querySelectorAll('.send-project-btn').forEach(btn => {
      btn.onclick = async () => {
        const projectId = btn.dataset.id;
        const doc = await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).get();
        if (!doc.exists) return;
        const p = doc.data();
        // Отправляем карточку проекта в чат
        const userData = await getUserData();
        await messagesRef.add({
          type: 'project',
          project: {
            id: projectId,
            name: p.name || '',
            imgUrl: p.imgUrl || '',
            html: p.html || '',
            css: p.css || '',
            author: userData.name
          },
          user: userData.name,
          photoURL: userData.photoURL,
          created: new Date().toISOString(),
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        });
        shareModal.classList.remove('show');
      };
    });
  };
  closeShareModal.onclick = () => shareModal.classList.remove('show');
  shareModal.onclick = (e) => { if (e.target === shareModal) shareModal.classList.remove('show'); };
}

// Рендер сообщений
function renderMessages(snapshot) {
  chatMessages.innerHTML = '';
  snapshot.forEach(doc => {
    const msg = doc.data();
    let div = document.createElement('div');
    if (msg.type === 'project' && msg.project) {
      // Карточка проекта
      div.className = 'welcome-card';
      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <img src="${msg.photoURL || 'img/default-avatar.png.png'}" alt="avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #ffe000;background:#222;">
          <div>
            <div>${msg.user || 'Пользователь'}</div>
            <div>${msg.time || ''}</div>
          </div>
        </div>
        <img src="${msg.project.imgUrl || 'img/default-project.png'}" alt="img" style="width:250px;height:100px;border-radius:12px;object-fit:cover;border:2px solid #ffe000;background:#222;display:block;margin:0 auto 12px auto;">
        <div class="card-title">${msg.project.name || 'Без названия'}</div>
        <button class="connect-btn" style="background:#ffe000;color:#222;font-weight:700;padding:8px 18px;border-radius:8px;border:none;cursor:pointer;box-shadow:0 2px 8px #ffe00033;width:100%; font-size:inherit;">Подключиться к проекту</button>
      `;
      div.querySelector('.connect-btn').onclick = () => {
        localStorage.removeItem('roomName');
        localStorage.removeItem('workMode');
        localStorage.setItem('projectName', msg.project.name || '');
        localStorage.setItem('userName', getUserName());
        if (msg.project.id) {
          localStorage.setItem('projectId', msg.project.id);
          window.location.href = `editor.html?id=${encodeURIComponent(msg.project.id)}&project=${encodeURIComponent(msg.project.name || '')}`;
        } else {
          window.location.href = 'editor.html';
        }
      };
    } else {
      // Обычное сообщение
      div.style = 'margin-bottom:12px;padding:12px;border-radius:12px;background:#fff;box-shadow:0 1px 6px #ffe00022;display:flex;gap:12px;align-items:center;';
      div.innerHTML = `
        <img src="${msg.photoURL || 'img/default-avatar.png.png'}" alt="avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #ffe000;background:#222;flex-shrink:0;">
        <div style="flex:1;">
          <div style="margin-bottom:4px;">
            <b style="color:#222;">${msg.user || 'Гость'}</b> 
            <span style="color:#888;font-size:0.9em;margin-left:8px;">${msg.time || ''}</span>
          </div>
          <div style="color:#333;line-height:1.4;">${msg.text}</div>
        </div>
      `;
    }
    chatMessages.appendChild(div);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Загрузка и автообновление сообщений
messagesRef.orderBy('created', 'asc').limitToLast(50)
  .onSnapshot(renderMessages);

// Отправка сообщения
chatForm.onsubmit = async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const now = new Date();
  const time = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const userData = await getUserData();
  await messagesRef.add({
    text,
    user: userData.name,
    photoURL: userData.photoURL,
    created: now.toISOString(),
    time
  });
  chatInput.value = '';
}; 