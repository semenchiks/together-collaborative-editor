// gallery.js
// Загрузка всех проектов пользователей и отображение их в виде карточек

// Ожидаем загрузки DOM и инициализации Firebase
window.addEventListener('DOMContentLoaded', async () => {
  // Проверяем, что Firestore инициализирован
  if (!window.db) {
    document.getElementById('gallery-cards').innerHTML = '<div style="color:#ff5252;font-size:1.2em;text-align:center;margin:40px 0;">Ошибка инициализации базы данных</div>';
    return;
  }

  const gallery = document.getElementById('gallery-cards');
  gallery.innerHTML = '<div style="color:#ffe000;font-size:1.2em;text-align:center;margin:40px 0;">Загрузка проектов...</div>';

  try {
    // Получаем всех пользователей
    const usersSnapshot = await window.db.collection('users').get();
    let projects = [];
    let allProjects = [];
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      // Получаем никнейм как в profile.js: displayName или email до @, иначе 'Пользователь'
      let nickname = 'Пользователь';
      if (userData.displayName) {
        nickname = userData.displayName;
      } else if (userData.email) {
        nickname = userData.email.split('@')[0];
      }
      // Получаем проекты пользователя
      const projectsSnapshot = await window.db.collection('users').doc(userId).collection('projects').orderBy('createdAt', 'desc').get();
      projectsSnapshot.forEach(projectDoc => {
        const p = projectDoc.data();
        projects.push({
          id: projectDoc.id,
          userId,
          nickname,
          ...p
        });
      });
    }
    allProjects = projects; // сохраняем полный список для поиска
    if (projects.length === 0) {
      gallery.innerHTML = '<div style="color:#ffe000;font-size:1.2em;text-align:center;margin:40px 0;">Пока нет ни одного проекта</div>';
      return;
    }
    // Сортируем по дате создания (новые сверху)
    projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    // Рендерим карточки
    renderGallery(projects);
    // --- Поиск ---
    const searchInput = document.getElementById('gallery-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) {
          renderGallery(allProjects);
          return;
        }
        const filtered = allProjects.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.nickname && p.nickname.toLowerCase().includes(q))
        );
        renderGallery(filtered);
      });
    }
    // --- Конец поиска ---
  } catch (e) {
    gallery.innerHTML = '<div style="color:#ff5252;font-size:1.2em;text-align:center;margin:40px 0;">Ошибка загрузки проектов: ' + e.message + '</div>';
  }
});

// Рендер карточек
function renderGallery(projects) {
  const gallery = document.getElementById('gallery-cards');
  gallery.innerHTML = '';
  if (!projects.length) {
    gallery.innerHTML = '<div style="color:#ffe000;font-size:1.2em;text-align:center;margin:40px 0;">Ничего не найдено</div>';
    return;
  }
  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'welcome-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <img src="${p.imgUrl || 'img/default-project.png'}" alt="img" style="width:160px;height:100px;border-radius:12px;object-fit:cover;border:2px solid #ffe000;background:#222;display:block;margin:0 auto 12px auto;">
      <div class="card-title" style="margin-bottom:6px;">
        <span style="font-weight:400;">Название:</span> <span style="font-weight:700;">${p.name || 'Без названия'}</span>
      </div>
      <div class="card-desc" style="margin-bottom:8px;">Автор: <b>${p.nickname || 'Пользователь'}</b></div>
      <div class="rating-block" style="display:flex;align-items:center;gap:16px;margin-bottom:10px;">
        <button class="overview-btn" style="background:#ffe000;color:#222;font-weight:700;padding:14px 36px;font-size:1.15em;border-radius:10px;border:none;cursor:pointer;box-shadow:0 2px 8px #ffe00033;">Обзор</button>
        <button class="like-btn" title="Лайк" style="font-size:1.3em;padding:10px 18px;border-radius:10px;border:none;background:#ffe000;color:#222;cursor:pointer;">👍</button>
        <span class="like-count">0</span>
        <button class="dislike-btn" title="Дизлайк" style="font-size:1.3em;padding:10px 18px;border-radius:10px;border:none;background:#ffe000;color:#222;cursor:pointer;">👎</button>
        <span class="dislike-count">0</span>
      </div>
      
    `;
    // --- Оценки ---
    const likeBtn = card.querySelector('.like-btn');
    const dislikeBtn = card.querySelector('.dislike-btn');
    const likeCount = card.querySelector('.like-count');
    const dislikeCount = card.querySelector('.dislike-count');
    // Функция обновления счетчиков
    async function updateRatingCounts() {
      const ratingsSnap = await window.db.collection('projects').doc(p.id).collection('ratings').get();
      let likes = 0, dislikes = 0;
      ratingsSnap.forEach(doc => {
        if (doc.data().value === 1) likes++;
        if (doc.data().value === -1) dislikes++;
      });
      likeCount.textContent = likes;
      dislikeCount.textContent = dislikes;
    }
    // Получаем userId
    let userId = null;
    if (window.firebase && window.firebase.auth().currentUser) {
      userId = window.firebase.auth().currentUser.uid;
    }
    async function setRating(value) {
      if (!userId) {
        alert('Войдите в аккаунт для оценки!');
        return;
      }
      await window.db.collection('projects').doc(p.id).collection('ratings').doc(userId).set({ value });
      updateRatingCounts();
    }
    likeBtn.onclick = () => setRating(1);
    dislikeBtn.onclick = () => setRating(-1);
    updateRatingCounts();
    // --- Конец оценок ---
    card.querySelector('.overview-btn').onclick = (e) => {
      e.stopPropagation();
      openCodeModal(p);
    };
    gallery.appendChild(card);
  }
}

// Модальное окно с кодом
function openCodeModal(project) {
  // Создаём модальное окно для кода
  let codeModal = document.createElement('div');
  codeModal.className = 'modal show';
  codeModal.style = 'z-index:9999;';
  codeModal.innerHTML = `
    <div class="modal-content draggable-modal" style="min-width:340px;max-width:640px;min-height:320px;position:absolute;left:10%;top:10%;">
      <div class="modal-header" style="cursor:move;padding:8px;background:#333;border-radius:18px 18px 0 0;margin:-36px -32px 20px -32px;text-align:center;color:#ffe000;font-weight:700;">
        Код проекта - перетащите для перемещения
      </div>
      <span class="close-modal" id="close-code-modal" style="position:absolute;top:12px;right:18px;font-size:1.6em;color:#ffe000;cursor:pointer;opacity:0.7;">×</span>
      <h2 style="text-align:center;margin-bottom:10px;">${project.name || 'Без названия'}</h2>
      <div style="margin-bottom:8px;">HTML:</div>
      <pre style="background:#181818;color:#ffe000;border-radius:8px;padding:10px 8px;overflow-x:auto;max-height:120px;">${escapeHtml(project.html || '')}</pre>
      <div style="margin-bottom:8px;margin-top:10px;">CSS:</div>
      <pre style="background:#181818;color:#ffe000;border-radius:8px;padding:10px 8px;overflow-x:auto;max-height:120px;">${escapeHtml(project.css || '')}</pre>
    </div>
  `;
  document.body.appendChild(codeModal);

  // Создаём модальное окно предпросмотра сразу
  let previewModal = document.createElement('div');
  previewModal.className = 'modal show';
  previewModal.style = 'z-index:10000;background:transparent;pointer-events:none;';
  previewModal.innerHTML = `
    <div class="modal-content draggable-modal" style="min-width:340px;max-width:640px;min-height:320px;position:absolute;left:60%;top:10%;pointer-events:auto;">
      <div class="modal-header" style="cursor:move;padding:8px;background:#333;border-radius:18px 18px 0 0;margin:-36px -32px 20px -32px;text-align:center;color:#ffe000;font-weight:700;">
        Результат проекта - перетащите для перемещения
      </div>
      <span class="close-modal" id="close-preview-modal" style="position:absolute;top:12px;right:18px;font-size:1.6em;color:#ffe000;cursor:pointer;opacity:0.7;">×</span>
      <h2 style="text-align:center;margin-bottom:10px;">${project.name || 'Без названия'}</h2>
      <div style="text-align:center;margin-bottom:10px;">Автор: <b>${project.nickname || 'Пользователь'}</b></div>
      <img src="${project.imgUrl || 'img/default-project.png'}" alt="img" style="width:90px;height:90px;border-radius:12px;margin:10px auto;object-fit:cover;border:2px solid #ffe000;background:#222;display:block;">
      <iframe style="width:99%;height:240px;border-radius:12px;border:2px solid #ffe000;background:#222;margin-top:10px;" srcdoc='<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#1a1a1a;color:#e0e0e0;font-family:Montserrat,Arial,sans-serif;margin:0;padding:0;}*{box-sizing:border-box;}</style><style>${project.css || ''}</style></head><body>${project.html || ''}</body></html>'></iframe>
    </div>
  `;
  document.body.appendChild(previewModal);

  // Обработчики закрытия
  document.getElementById('close-code-modal').onclick = () => {
    codeModal.remove();
    previewModal.remove();
  };
  document.getElementById('close-preview-modal').onclick = () => {
    codeModal.remove();
    previewModal.remove();
  };
  
  // Закрытие только при клике на фон левого модального окна
  codeModal.onclick = (e) => { 
    if (e.target === codeModal) { 
      codeModal.remove(); 
      previewModal.remove(); 
    } 
  };

  // Добавляем функциональность перетаскивания
  makeDraggable(codeModal.querySelector('.modal-content'));
  makeDraggable(previewModal.querySelector('.modal-content'));
}

// Функция для создания перетаскиваемых модальных окон
function makeDraggable(element) {
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  const header = element.querySelector('.modal-header');
  
  // Получаем начальную позицию элемента
  const rect = element.getBoundingClientRect();
  currentX = rect.left;
  currentY = rect.top;
  xOffset = currentX;
  yOffset = currentY;
  
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    // Проверяем, что клик был в области заголовка или его дочерних элементов
    if (e.target === header || header.contains(e.target)) {
      e.preventDefault();
      
      // Получаем текущую позицию элемента
      const rect = element.getBoundingClientRect();
      initialX = e.clientX - rect.left;
      initialY = e.clientY - rect.top;
      
      isDragging = true;
      element.style.zIndex = '10001';
      
      // Добавляем визуальную обратную связь
      header.style.background = '#555';
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Ограничиваем перемещение в пределах экрана
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      // Устанавливаем новую позицию
      element.style.left = currentX + 'px';
      element.style.top = currentY + 'px';
      element.style.right = 'auto';
      element.style.transform = 'none';
    }
  }

  function dragEnd(e) {
    if (isDragging) {
      isDragging = false;
      
      // Возвращаем исходный цвет заголовка
      header.style.background = '#333';
    }
  }
}

// Модальное окно предпросмотра (оставляем для совместимости, но теперь не используется)
function openPreviewModal(project) {
  let modal = document.createElement('div');
  modal.className = 'modal show';
  modal.style = 'z-index:9999;';
  modal.innerHTML = `
    <div class="modal-content" style="min-width:340px;max-width:640px;min-height:320px;">
      <span class="close-modal" id="close-preview-modal" style="position:absolute;top:12px;right:18px;font-size:1.6em;color:#ffe000;cursor:pointer;opacity:0.7;">×</span>
      <h2 style="text-align:center;margin-bottom:10px;">${project.name || 'Без названия'}</h2>
      <div style="text-align:center;margin-bottom:10px;">Автор: <b>${project.nickname || 'Пользователь'}</b></div>
      <img src="${project.imgUrl || 'img/default-project.png'}" alt="img" style="width:90px;height:90px;border-radius:12px;margin:10px auto;object-fit:cover;border:2px solid #ffe000;background:#222;display:block;">
      <iframe style="width:99%;height:240px;border-radius:12px;border:2px solid #ffe000;background:#222;margin-top:10px;" srcdoc='<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#1a1a1a;color:#e0e0e0;font-family:Montserrat,Arial,sans-serif;margin:0;padding:0;}*{box-sizing:border-box;}</style><style>${project.css || ''}</style></head><body>${project.html || ''}</body></html>'></iframe>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('close-preview-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// Экранирование html для <pre>
function escapeHtml(str) {
  return str.replace(/[&<>'\"]/g, function(tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return charsToReplace[tag] || tag;
  });
} 