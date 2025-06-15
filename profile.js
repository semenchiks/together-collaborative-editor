// profile.js
// Логика профиля: авторизация, отображение данных, проекты, модальные окна

// Проверка авторизации пользователя
function checkAuth() {
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      document.getElementById('auth-modal').classList.remove('show');
      
      // Проверяем, есть ли пользователь в Firestore, если нет - создаем
      if (window.db) {
        try {
          const doc = await window.db.collection('users').doc(user.uid).get();
          if (!doc.exists) {
            console.log('Создаем запись пользователя в Firestore');
            await window.db.collection('users').doc(user.uid).set({
              email: user.email,
              displayName: user.displayName || user.email.split('@')[0],
              photoURL: user.photoURL || '',
              role: 'user',
              createdAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Ошибка при проверке/создании пользователя в Firestore:', error);
        }
      }
      
      loadProfile(user);
    } else {
      document.getElementById('auth-modal').classList.add('show');
    }
  });
}

// Загрузка профиля пользователя
function loadProfile(user) {
  // Получаем имя пользователя из Firestore или используем displayName/email
  if (window.db) {
    window.db.collection('users').doc(user.uid).get().then(doc => {
      const data = doc.data();
      const displayName = (data && data.displayName) || user.displayName || user.email.split('@')[0];
      document.getElementById('profile-nickname').textContent = displayName;
    }).catch(() => {
      document.getElementById('profile-nickname').textContent = user.displayName || user.email.split('@')[0];
    });
  } else {
    document.getElementById('profile-nickname').textContent = user.displayName || user.email.split('@')[0];
  }
  // Загрузка фото профиля
  loadProfilePhoto(user);
  // Загрузить проекты из Firebase
  loadProjects(user);
}

// Загрузка фото профиля с приоритетом: Firestore -> user.photoURL -> дефолт
function loadProfilePhoto(user) {
  const avatar = document.getElementById('profile-avatar');
  if (window.db) {
    window.db.collection('users').doc(user.uid).get().then(doc => {
      const data = doc.data();
      if (data && data.photoURL) {
        avatar.src = data.photoURL;
      } else if (user.photoURL) {
        avatar.src = user.photoURL;
      } else {
        avatar.src = 'img/default-avatar.png.png';
      }
    }).catch(() => {
      avatar.src = user.photoURL || 'img/default-avatar.png.png';
    });
  } else {
    avatar.src = user.photoURL || 'img/default-avatar.png.png';
  }
}

// Загрузка проектов пользователя из Firestore и отображение в профиле
function loadProjects(user) {
  const projectsBlock = document.getElementById('profile-projects-block');
  if (!user || !window.db) {
    projectsBlock.innerHTML = '<div class="no-projects">Начните творить сейчас</div>';
    return;
  }
  window.db.collection('users').doc(user.uid).collection('projects').orderBy('createdAt', 'desc').get()
    .then(snapshot => {
      if (snapshot.empty) {
        projectsBlock.innerHTML = '<div class="no-projects">Начните творить сейчас</div>';
        return;
      }
      let html = '<div class="projects-list">';
      snapshot.forEach(doc => {
        const p = doc.data();
        html += `
          <div class="project-card" data-id="${doc.id}">
            <div style="display:flex;align-items:center;gap:16px;">
              <img src="${p.imgUrl || 'img/default-project.png'}" alt="img" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:2px solid #ffe000;background:#222;">
              <div style="flex:1;">
              <div style="font-weight:700;font-size:1.1em;">${p.name || 'Без названия'}</div>
                <div style="display:flex;gap:10px;margin-top:8px;">
                  <button class="project-icon-btn set-img-btn" data-id="${doc.id}" title="Установить фото по URL"><span>🖼️</span></button>
                  <button class="project-icon-btn open-editor-btn" data-id="${doc.id}" title="Перейти в редактор"><span>✏️</span></button>
                  <button class="project-icon-btn delete-project-btn" data-id="${doc.id}" title="Удалить проект"><span>🗑️</span></button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      projectsBlock.innerHTML = html;
      setupProjectCardActions(user);
    })
    .catch(() => {
      projectsBlock.innerHTML = '<div class="no-projects">Ошибка загрузки проектов</div>';
    });
}

// Обработчики для карточек проектов
function setupProjectCardActions(user) {
  // Установить фото по URL
  document.querySelectorAll('.set-img-btn').forEach(btn => {
    btn.onclick = async () => {
      const projectId = btn.dataset.id;
      const url = prompt('Введите URL изображения для проекта:');
      if (!url) return;
      try {
        await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).update({ imgUrl: url });
        loadProjects(user);
      } catch (e) {
        alert('Ошибка при обновлении фото: ' + e.message);
      }
    };
  });
  // Перейти в редактор
  document.querySelectorAll('.open-editor-btn').forEach(btn => {
    btn.onclick = async () => {
      const projectId = btn.dataset.id;
      const doc = await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).get();
      if (!doc.exists) return;
      const p = doc.data();
      
      // Получаем имя пользователя из Firestore или Firebase Auth
      let userName = 'Пользователь';
      if (user && window.db) {
        try {
          const doc = await window.db.collection('users').doc(user.uid).get();
          const data = doc.data();
          userName = (data && data.displayName) || user.displayName || user.email.split('@')[0];
        } catch (e) {
          userName = user.displayName || user.email.split('@')[0];
        }
      } else if (user) {
        userName = user.displayName || user.email.split('@')[0];
      }
      
      localStorage.setItem('projectId', projectId);
      localStorage.setItem('projectName', p.name || '');
      localStorage.setItem('userName', userName);
      window.location.href = `editor.html?id=${encodeURIComponent(projectId)}&project=${encodeURIComponent(p.name || '')}&user=${encodeURIComponent(userName)}`;
    };
  });
  // Удалить проект
  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.onclick = () => deleteProject(user, btn.dataset.id);
  });
}

// Обработка входа и регистрации
function setupAuthModal() {
  // Переключение между формами входа и регистрации
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  loginTab.onclick = () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    clearAuthError();
  };
  
  registerTab.onclick = () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    clearAuthError();
  };
  
  // Обработка входа
  document.getElementById('login-btn').onclick = () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
      showAuthError('Пожалуйста, заполните все поля');
      return;
    }
    
    firebase.auth().signInWithEmailAndPassword(email, password)
      .catch(e => showAuthError(getErrorMessage(e.code)));
  };
  
  // Обработка регистрации
  document.getElementById('register-btn').onclick = () => {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const photoURL = document.getElementById('register-photo').value.trim();
    
    if (!name || !email || !password) {
      showAuthError('Пожалуйста, заполните обязательные поля');
      return;
    }
    
    if (password.length < 6) {
      showAuthError('Пароль должен содержать минимум 6 символов');
      return;
    }
    
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(async (userCredential) => {
        const user = userCredential.user;
        
        // Обновляем профиль пользователя
        await user.updateProfile({
          displayName: name,
          photoURL: photoURL || null
        });
        
        // Сохраняем данные в Firestore
        if (user && window.db) {
          await window.db.collection('users').doc(user.uid).set({
            email: user.email,
            displayName: name,
            photoURL: photoURL || '',
            role: 'user',
            createdAt: new Date().toISOString()
          }, { merge: true });
        }
      })
      .catch(e => showAuthError(getErrorMessage(e.code)));
  };
}
function showAuthError(msg) {
  document.getElementById('auth-error').textContent = msg;
}

function clearAuthError() {
  document.getElementById('auth-error').textContent = '';
}

function getErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'Пользователь с таким email не найден';
    case 'auth/wrong-password':
      return 'Неверный пароль';
    case 'auth/email-already-in-use':
      return 'Пользователь с таким email уже существует';
    case 'auth/weak-password':
      return 'Пароль слишком слабый';
    case 'auth/invalid-email':
      return 'Неверный формат email';
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Попробуйте позже';
    default:
      return 'Произошла ошибка. Попробуйте еще раз';
  }
}

// Обработка создания нового проекта
function setupCreateProject() {
  document.getElementById('profile-create-btn').onclick = () => {
    document.getElementById('create-project-modal').classList.add('show');
  };
  document.getElementById('start-project-btn').onclick = async () => {
    const name = document.getElementById('new-project-name').value.trim();
    if (!name) return;
    localStorage.removeItem('roomName');
    localStorage.removeItem('workMode');
    localStorage.setItem('projectName', name);
    
    // Получаем имя пользователя из Firestore или Firebase Auth
    const user = firebase.auth().currentUser;
    let userName = 'Пользователь';
    if (user && window.db) {
      try {
        const doc = await window.db.collection('users').doc(user.uid).get();
        const data = doc.data();
        userName = (data && data.displayName) || user.displayName || user.email.split('@')[0];
      } catch (e) {
        userName = user.displayName || user.email.split('@')[0];
      }
    } else if (user) {
      userName = user.displayName || user.email.split('@')[0];
    }
    localStorage.setItem('userName', userName);
    
    // Генерируем уникальный id для проекта
    let projectId = '';
    if (window.crypto && window.crypto.randomUUID) {
      projectId = window.crypto.randomUUID();
    } else {
      projectId = 'p' + Date.now() + Math.floor(Math.random() * 10000);
    }
    localStorage.setItem('projectId', projectId);
    window.location.href = `editor.html?id=${encodeURIComponent(projectId)}&project=${encodeURIComponent(name)}&user=${encodeURIComponent(userName)}`;
  };
}

// Закрытие модальных окон
function setupModals() {
  // Удаляю обработчик для project-modal, так как модальное окно удалено
}

let settingsOpen = false;

function setupSettingsToggle() {
  const settingsBtn = document.getElementById('profile-settings-btn');
  const actions = document.querySelector('.profile-actions');
  actions.style.display = 'none';
  settingsBtn.onclick = () => {
    settingsOpen = !settingsOpen;
    actions.style.display = settingsOpen ? 'flex' : 'none';
  };
}

function setupLogout() {
  document.getElementById('logout-btn').onclick = () => {
    firebase.auth().signOut();
  };
}

function setupChangePhoto() {
  const changeBtn = document.getElementById('change-photo-btn');
  const modal = document.getElementById('change-photo-modal');
  const urlInput = document.getElementById('change-photo-url');
  const preview = document.getElementById('change-photo-preview');
  const saveBtn = document.getElementById('save-photo-btn');
  const cancelBtn = document.getElementById('cancel-photo-btn');

  changeBtn.onclick = () => {
    // Открыть модалку, вставить текущее фото
    modal.classList.add('show');
    urlInput.value = document.getElementById('profile-avatar').src;
    preview.src = urlInput.value;
  };

  urlInput.oninput = () => {
    preview.src = urlInput.value || 'img/default-avatar.png.png';
  };

  saveBtn.onclick = async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    // Сохраняем в Firestore и профиль
    const user = firebase.auth().currentUser;
    if (user && window.db) {
      try {
        await window.db.collection('users').doc(user.uid).set({ photoURL: url }, { merge: true });
        await user.updateProfile({ photoURL: url });
        document.getElementById('profile-avatar').src = url;
        modal.classList.remove('show');
      } catch (e) {
        alert('Ошибка при сохранении фото: ' + e.message);
      }
    }
  };

  cancelBtn.onclick = () => {
    modal.classList.remove('show');
  };
}

function openSaveProjectModalFromDraft() {
  // Проверяем наличие черновика и флага в URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('saveProject') !== '1') return;
  const draft = localStorage.getItem('profileProjectDraft');
  if (!draft) return;
  let { html, css, projectName, userName } = JSON.parse(draft);

  // Создаём модалку динамически
  let modal = document.createElement('div');
  modal.className = 'modal show';
  modal.id = 'save-draft-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Сохранить проект</h2>
      <input type="text" id="draft-project-name" value="${projectName || ''}" readonly style="margin-bottom:8px;">
      <div style="margin-bottom:8px;">HTML:</div>
      <textarea id="draft-html" readonly style="width:100%;height:60px;resize:vertical;margin-bottom:8px;">${html || ''}</textarea>
      <div style="margin-bottom:8px;">CSS:</div>
      <textarea id="draft-css" readonly style="width:100%;height:60px;resize:vertical;margin-bottom:8px;">${css || ''}</textarea>
      <input type="text" id="draft-img-url" placeholder="URL изображения проекта" style="margin-bottom:8px;">
      <img id="draft-img-preview" src="img/default-project.png" alt="Превью проекта" style="width:90px;height:90px;border-radius:12px;margin:10px 0;object-fit:cover;border:2px solid #ffe000;background:#222;display:block;">
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="save-draft-btn">Сохранить</button>
        <button id="cancel-draft-btn">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Превью изображения
  const imgInput = document.getElementById('draft-img-url');
  const imgPreview = document.getElementById('draft-img-preview');
  imgInput.oninput = () => {
    imgPreview.src = imgInput.value || 'img/default-project.png';
  };

  // Сохранить проект
  document.getElementById('save-draft-btn').onclick = async () => {
    const imgUrl = imgInput.value.trim() || 'img/default-project.png';
    const user = firebase.auth().currentUser;
    if (user && window.db) {
      try {
        // Добавляем проект в коллекцию projects пользователя
        const projectData = {
          name: projectName,
          html,
          css,
          imgUrl,
          createdAt: new Date().toISOString()
        };
        await window.db.collection('users').doc(user.uid).collection('projects').add(projectData);
        // Очищаем черновик
        localStorage.removeItem('profileProjectDraft');
        // Закрываем модалку
        modal.remove();
        // Обновляем проекты
        loadProjects(user);
      } catch (e) {
        alert('Ошибка при сохранении проекта: ' + e.message);
      }
    }
  };
  // Отмена
  document.getElementById('cancel-draft-btn').onclick = () => {
    modal.remove();
  };
}

// Удаление проекта
async function deleteProject(user, projectId) {
  if (!user || !window.db) return;
  if (!confirm('Вы уверены, что хотите удалить этот проект?')) return;
  try {
    await window.db.collection('users').doc(user.uid).collection('projects').doc(projectId).delete();
    loadProjects(user);
  } catch (e) {
    alert('Ошибка при удалении проекта: ' + e.message);
  }
}

// Инициализация
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupAuthModal();
  setupCreateProject();
  setupModals();
  setupSettingsToggle();
  setupLogout();
  setupChangePhoto();
  openSaveProjectModalFromDraft();
  // Назначаю обработчики для навигационных кнопок, если они есть
  const galleryBtn = document.getElementById('go-gallery-btn');
  if (galleryBtn) galleryBtn.onclick = () => window.location.href = 'gallery.html';
  const chatBtn = document.getElementById('go-chat-btn');
  if (chatBtn) chatBtn.onclick = () => window.location.href = 'chat.html';
});