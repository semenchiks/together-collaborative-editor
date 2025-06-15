// admin.js - Логика админ панели Together

// Глобальные переменные
let currentUser = null;
let allUsers = [];
let allProjects = [];
let allMessages = [];
let reportTemplates = [];
let reportsHistory = [];

// Переменные для элементов на удалении
let pendingDeletionUsers = [];
let pendingDeletionProjects = [];
let pendingDeletionMessages = [];

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  console.log('Админ панель загружена');
  
  // Ждем инициализации Firebase
  const waitForFirebase = () => {
    if (typeof firebase !== 'undefined' && firebase.auth && window.db) {
      console.log('Firebase инициализирован, настраиваем авторизацию');
      
      // Проверяем авторизацию
      firebase.auth().onAuthStateChanged(async user => {
        if (user) {
          console.log('Пользователь авторизован:', user.email);
          // Проверяем роль пользователя в Firestore
          const hasAdminAccess = await checkAdminAccess(user);
          if (hasAdminAccess) {
            currentUser = user;
            showAdminPanel();
            loadAllData();
          } else {
            showAuthModal();
            showAuthError('У вас нет прав администратора');
          }
        } else {
          console.log('Пользователь не авторизован');
          showAuthModal();
        }
      });
    } else {
      console.log('Ожидание инициализации Firebase...');
      setTimeout(waitForFirebase, 100);
    }
  };
  
  waitForFirebase();
  setupEventListeners();
});

// Проверка прав администратора
async function checkAdminAccess(user) {
  try {
    console.log('Проверка прав администратора для пользователя:', user.email);
    
    if (!window.db) {
      console.error('Firestore не инициализирован');
      return false;
    }
    
    // Получаем данные пользователя из Firestore
    const userDoc = await window.db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      console.log('Пользователь не найден в Firestore');
      return false;
    }
    
    const userData = userDoc.data();
    const userRole = userData.role;
    
    console.log('Роль пользователя:', userRole);
    
    // Проверяем, является ли пользователь администратором
    return userRole === 'admin';
    
  } catch (error) {
    console.error('Ошибка при проверке прав администратора:', error);
    return false;
  }
}

// Настройка обработчиков событий
function setupEventListeners() {
  // Авторизация
  document.getElementById('admin-login-btn').onclick = handleAdminLogin;
  document.getElementById('logout-btn').onclick = handleLogout;

  // Навигация
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => switchSection(btn.dataset.section);
  });

  // Поиск и фильтры
  document.getElementById('users-search').oninput = filterUsers;
  document.getElementById('projects-search').oninput = filterProjects;
  document.getElementById('messages-search').oninput = filterMessages;
  document.getElementById('projects-filter').onchange = filterProjects;
  document.getElementById('messages-filter').onchange = filterMessages;

  // Обновление данных
  document.getElementById('refresh-users').onclick = () => loadUsers();
  document.getElementById('refresh-projects').onclick = () => loadProjects();
  document.getElementById('refresh-messages').onclick = () => loadMessages();

  // Система отчетов
  setupReportsEventListeners();

  // Клавиши
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// Настройка обработчиков для системы отчетов
function setupReportsEventListeners() {
  // Кастомные отчеты
  document.getElementById('report-period').onchange = handlePeriodChange;
  document.getElementById('generate-custom-report').onclick = generateCustomReport;
  document.getElementById('save-report-template').onclick = saveReportTemplate;
  
  // Шаблоны
  document.getElementById('save-template').onclick = handleSaveTemplate;
  
  // Обновление данных отчетов
  document.getElementById('refresh-reports').onclick = loadReportsData;
}

// Авторизация админа
async function handleAdminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-auth-error');

  if (!email || !password) {
    showAuthError('Заполните все поля');
    return;
  }

  try {
    // Авторизуемся в Firebase
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Проверяем права администратора
    const hasAdminAccess = await checkAdminAccess(user);
    
    if (!hasAdminAccess) {
      // Если нет прав админа, выходим из системы
      await firebase.auth().signOut();
      showAuthError('У вас нет прав администратора');
      return;
    }
    
    errorDiv.textContent = '';
    console.log('Успешная авторизация администратора');
    
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    showAuthError(getErrorMessage(error.code));
  }
}

// Выход из системы
async function handleLogout() {
  try {
    await firebase.auth().signOut();
    showAuthModal();
  } catch (error) {
    console.error('Ошибка выхода:', error);
  }
}

// Показать ошибку авторизации
function showAuthError(message) {
  const errorDiv = document.getElementById('admin-auth-error');
  errorDiv.textContent = message;
  setTimeout(() => {
    errorDiv.textContent = '';
  }, 5000);
}

// Получить сообщение об ошибке на русском
function getErrorMessage(errorCode) {
  const messages = {
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-email': 'Неверный формат email',
    'auth/user-disabled': 'Аккаунт заблокирован',
    'auth/too-many-requests': 'Слишком много попыток входа'
  };
  return messages[errorCode] || 'Ошибка авторизации';
}

// Показать модальное окно авторизации
function showAuthModal() {
  document.getElementById('admin-auth-modal').classList.add('show');
  document.getElementById('admin-content').style.display = 'none';
}

// Показать админ панель
function showAdminPanel() {
  document.getElementById('admin-auth-modal').classList.remove('show');
  document.getElementById('admin-content').style.display = 'block';
  
  // Настраиваем обработчики для системы мягкого удаления после показа панели
  setTimeout(() => {
    setupPendingDeletionEventListeners();
  }, 100);
}

// Переключение разделов
function switchSection(sectionName) {
  console.log('Переключение на секцию:', sectionName);
  
  // Убираем активный класс со всех кнопок и секций
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));

  // Добавляем активный класс к выбранным элементам
  const navBtn = document.querySelector(`[data-section="${sectionName}"]`);
  const section = document.getElementById(`${sectionName}-section`);
  
  if (navBtn) {
    navBtn.classList.add('active');
  } else {
    console.error('Кнопка навигации не найдена для секции:', sectionName);
  }
  
  if (section) {
    section.classList.add('active');
  } else {
    console.error('Секция не найдена:', `${sectionName}-section`);
  }
  
  // Если переключились на секцию удаления, загружаем данные
  if (sectionName === 'pending-deletion') {
    loadPendingDeletionData();
  }
}

// Загрузка всех данных
async function loadAllData() {
  console.log('Загрузка данных админ панели...');
  
  try {
    await Promise.all([
      loadUsers(),
      loadProjects(),
      loadMessages(),
      updateStats()
    ]);
    
    // Инициализируем систему отчетов после загрузки основных данных
    initializeReportsSystem();
    
    // Загружаем данные корзины
    loadPendingDeletionData();
    
    console.log('Все данные загружены');
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
  }
}

// Загрузка пользователей
async function loadUsers() {
  console.log('Загрузка пользователей...');
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Загрузка пользователей...</td></tr>';

  try {
    // Сначала пробуем загрузить с сортировкой по createdAt
    let snapshot;
    try {
      snapshot = await window.db.collection('users').orderBy('createdAt', 'desc').get();
    } catch (sortError) {
      console.log('Не удалось отсортировать по createdAt, загружаем без сортировки:', sortError);
      // Если не получается отсортировать, загружаем без сортировки
      snapshot = await window.db.collection('users').get();
    }
    
    allUsers = [];
    console.log(`Найдено ${snapshot.size} документов пользователей`);
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      
      // Пропускаем удаленных пользователей
      if (userData.deleted) {
        continue;
      }
      
      console.log(`Обрабатываем пользователя ${doc.id}:`, userData);
      
      // Подсчитываем количество проектов пользователя (исключая удаленные)
      try {
        const projectsSnapshot = await window.db.collection('users').doc(doc.id).collection('projects').where('deleted', '!=', true).get();
        const projectsCount = projectsSnapshot.size;
        
        allUsers.push({
          id: doc.id,
          ...userData,
          projectsCount
        });
      } catch (projectError) {
        console.error(`Ошибка загрузки проектов для пользователя ${doc.id}:`, projectError);
        // Добавляем пользователя даже если не удалось загрузить проекты
        allUsers.push({
          id: doc.id,
          ...userData,
          projectsCount: 0
        });
      }
    }

    // Сортируем вручную по дате создания (новые сверху)
    allUsers.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    });

    renderUsers(allUsers);
    console.log(`Загружено ${allUsers.length} пользователей:`, allUsers.map(u => ({ id: u.id, email: u.email, displayName: u.displayName })));
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
    tbody.innerHTML = '<tr><td colspan="7" class="loading" style="color: #ff5252;">Ошибка загрузки пользователей: ' + error.message + '</td></tr>';
  }
}

// Отображение пользователей
function renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Пользователи не найдены</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(user => `
    <tr>
      <td>
        <img src="${user.photoURL || 'img/default-avatar.png'}" alt="Аватар" 
             onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM0NDQiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiNmZmYiPjx0ZXh0IHg9IjEyIiB5PSIxNiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5GKPC90ZXh0Pjwvc3ZnPgo8L3N2Zz4K';">
      </td>
      <td>${user.displayName || 'Без имени'}</td>
      <td>${user.email || 'Не указан'}</td>
      <td>
        <select class="role-select" data-user-id="${user.id}" onchange="changeUserRole('${user.id}', this.value)">
          <option value="user" ${(user.role || 'user') === 'user' ? 'selected' : ''}>👤 Пользователь</option>
          <option value="admin" ${(user.role || 'user') === 'admin' ? 'selected' : ''}>🛠️ Администратор</option>
        </select>
      </td>
      <td>${formatDate(user.createdAt)}</td>
      <td>${user.projectsCount || 0}</td>
      <td>
        <button class="action-btn" onclick="viewUser('${user.id}')">👁️ Просмотр</button>
        <button class="action-btn danger" onclick="deleteUser('${user.id}')">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

// Загрузка проектов
async function loadProjects() {
  console.log('Загрузка проектов...');
  const tbody = document.getElementById('projects-table-body');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Загрузка проектов...</td></tr>';

  try {
    const usersSnapshot = await window.db.collection('users').get();
    allProjects = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      // Пропускаем удаленных пользователей
      if (userData.deleted) {
        continue;
      }
      
      const projectsSnapshot = await window.db.collection('users').doc(userDoc.id).collection('projects').orderBy('createdAt', 'desc').get();
      
      projectsSnapshot.forEach(projectDoc => {
        const projectData = projectDoc.data();
        
        // Пропускаем удаленные проекты
        if (projectData.deleted) {
          return;
        }
        
        allProjects.push({
          id: projectDoc.id,
          userId: userDoc.id,
          authorName: userData.displayName || userData.email?.split('@')[0] || 'Неизвестный',
          ...projectData
        });
      });
    }

    renderProjects(allProjects);
    console.log(`Загружено ${allProjects.length} проектов`);
  } catch (error) {
    console.error('Ошибка загрузки проектов:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="loading" style="color: #ff5252;">Ошибка загрузки проектов</td></tr>';
  }
}

// Отображение проектов
function renderProjects(projects) {
  const tbody = document.getElementById('projects-table-body');
  
  if (projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Проекты не найдены</td></tr>';
    return;
  }

  tbody.innerHTML = projects.map(project => `
    <tr>
      <td>
        <img src="${project.imgUrl || 'img/default-project.png'}" alt="Превью" class="project-img"
             onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNDQ0Ii8+Cjx0ZXh0IHg9IjIwIiB5PSIyNCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIj7wn5ODPC90ZXh0Pgo8L3N2Zz4K'">
      </td>
      <td>${project.name || 'Без названия'}</td>
      <td>${project.authorName}</td>
      <td>${formatDate(project.createdAt)}</td>
      <td>${calculateProjectSize(project)}</td>
      <td>
        <button class="action-btn" onclick="viewProject('${project.userId}', '${project.id}')">👁️ Просмотр</button>
        <button class="action-btn danger" onclick="deleteProject('${project.userId}', '${project.id}')">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

// Загрузка сообщений
async function loadMessages() {
  console.log('Загрузка сообщений...');
  const tbody = document.getElementById('messages-table-body');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Загрузка сообщений...</td></tr>';

  try {
    const snapshot = await window.db.collection('chat-messages').orderBy('created', 'desc').limit(100).get();
    allMessages = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(message => !message.deleted); // Исключаем удаленные сообщения

    renderMessages(allMessages);
    console.log(`Загружено ${allMessages.length} сообщений`);
  } catch (error) {
    console.error('Ошибка загрузки сообщений:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="loading" style="color: #ff5252;">Ошибка загрузки сообщений</td></tr>';
  }
}

// Отображение сообщений
function renderMessages(messages) {
  const tbody = document.getElementById('messages-table-body');
  
  if (messages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Сообщения не найдены</td></tr>';
    return;
  }

  tbody.innerHTML = messages.map(message => `
    <tr>
      <td>
        <img src="${message.photoURL || 'img/default-avatar.png'}" alt="Аватар"
             onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM0NDQiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiNmZmYiPjx0ZXh0IHg9IjEyIiB5PSIxNiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5GKPC90ZXh0Pjwvc3ZnPgo8L3N2Zz4K'">
      </td>
      <td>${message.user || 'Неизвестный'}</td>
      <td>${formatMessageContent(message)}</td>
      <td>${message.type === 'project' ? '📁 Проект' : '💬 Текст'}</td>
      <td>${formatDate(message.created)}</td>
      <td>
        <button class="action-btn danger" onclick="deleteMessage('${message.id}')">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

// Обновление статистики
async function updateStats() {
  try {
    // Количество пользователей
    const usersSnapshot = await window.db.collection('users').get();
    const usersCount = usersSnapshot.size;
    document.getElementById('users-count').textContent = usersCount;
    console.log(`Статистика: найдено ${usersCount} пользователей в коллекции users`);

    // Количество проектов
    let totalProjects = 0;
    for (const userDoc of usersSnapshot.docs) {
      const projectsSnapshot = await window.db.collection('users').doc(userDoc.id).collection('projects').get();
      totalProjects += projectsSnapshot.size;
    }
    document.getElementById('projects-count').textContent = totalProjects;

    // Количество сообщений
    const messagesSnapshot = await window.db.collection('chat-messages').get();
    document.getElementById('messages-count').textContent = messagesSnapshot.size;

    console.log(`Статистика обновлена: ${usersCount} пользователей, ${totalProjects} проектов, ${messagesSnapshot.size} сообщений`);
  } catch (error) {
    console.error('Ошибка обновления статистики:', error);
  }
}

// Фильтрация пользователей
function filterUsers() {
  const searchTerm = document.getElementById('users-search').value.toLowerCase();
  const filteredUsers = allUsers.filter(user => 
    (user.displayName || '').toLowerCase().includes(searchTerm) ||
    (user.email || '').toLowerCase().includes(searchTerm)
  );
  renderUsers(filteredUsers);
}

// Фильтрация проектов
function filterProjects() {
  const searchTerm = document.getElementById('projects-search').value.toLowerCase();
  const filterValue = document.getElementById('projects-filter').value;
  
  let filteredProjects = allProjects.filter(project => 
    (project.name || '').toLowerCase().includes(searchTerm) ||
    (project.authorName || '').toLowerCase().includes(searchTerm)
  );

  if (filterValue === 'recent') {
    filteredProjects = filteredProjects.slice(0, 20);
  } else if (filterValue === 'popular') {
    // Сортируем по размеру (как показатель популярности)
    filteredProjects.sort((a, b) => calculateProjectSize(b, true) - calculateProjectSize(a, true));
  }

  renderProjects(filteredProjects);
}

// Фильтрация сообщений
function filterMessages() {
  const searchTerm = document.getElementById('messages-search').value.toLowerCase();
  const filterValue = document.getElementById('messages-filter').value;
  
  let filteredMessages = allMessages.filter(message => 
    (message.user || '').toLowerCase().includes(searchTerm) ||
    (message.text || '').toLowerCase().includes(searchTerm)
  );

  if (filterValue === 'text') {
    filteredMessages = filteredMessages.filter(msg => msg.type !== 'project');
  } else if (filterValue === 'project') {
    filteredMessages = filteredMessages.filter(msg => msg.type === 'project');
  }

  renderMessages(filteredMessages);
}

// Изменение роли пользователя
async function changeUserRole(userId, newRole) {
  try {
    console.log(`Изменение роли пользователя ${userId} на ${newRole}`);
    
    // Обновляем роль в Firestore
    await window.db.collection('users').doc(userId).update({
      role: newRole
    });
    
    // Обновляем локальные данные
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      user.role = newRole;
    }
    
    console.log(`Роль пользователя ${userId} успешно изменена на ${newRole}`);
    
    // Показываем уведомление
    showNotification(`Роль пользователя изменена на "${newRole === 'admin' ? 'Администратор' : 'Пользователь'}"`, 'success');
    
  } catch (error) {
    console.error('Ошибка изменения роли пользователя:', error);
    
    // Возвращаем предыдущее значение в select
    const select = document.querySelector(`select[data-user-id="${userId}"]`);
    const user = allUsers.find(u => u.id === userId);
    if (select && user) {
      select.value = user.role || 'user';
    }
    
    showNotification('Ошибка при изменении роли пользователя', 'error');
  }
}

// Просмотр пользователя
function viewUser(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  const roleText = user.role === 'admin' ? 'Администратор' : 'Пользователь';

  alert(`Информация о пользователе:
Имя: ${user.displayName || 'Не указано'}
Email: ${user.email || 'Не указан'}
Роль: ${roleText}
Дата регистрации: ${formatDate(user.createdAt)}
Количество проектов: ${user.projectsCount || 0}
Фото: ${user.photoURL || 'Не указано'}`);
}

// Удаление пользователя - функция перенесена в секцию мягкого удаления

// Просмотр проекта
async function viewProject(userId, projectId) {
  try {
    const doc = await window.db.collection('users').doc(userId).collection('projects').doc(projectId).get();
    if (!doc.exists) {
      alert('Проект не найден');
      return;
    }

    const project = doc.data();
    
    // Заполняем модальное окно
    document.getElementById('project-modal-title').textContent = `Проект: ${project.name || 'Без названия'}`;
    
    // Форматируем и отображаем HTML код
    const htmlCode = project.html || '<!-- HTML код отсутствует -->';
    document.getElementById('project-html-code').textContent = formatCode(htmlCode);
    
    // Форматируем и отображаем CSS код
    const cssCode = project.css || '/* CSS код отсутствует */';
    document.getElementById('project-css-code').textContent = formatCode(cssCode);
    
    // Создаем превью
    const iframe = document.getElementById('project-preview-frame');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 10px; font-family: Arial, sans-serif; }
          ${project.css || ''}
        </style>
      </head>
      <body>
        ${project.html || '<p style="color: #666; text-align: center; padding: 20px;">Контент отсутствует</p>'}
      </body>
      </html>
    `;
    
    iframe.srcdoc = htmlContent;
    
    // Добавляем обработчик загрузки iframe для масштабирования
    iframe.onload = function() {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const body = iframeDoc.body;
        
        if (body) {
          // Получаем размеры контента
          const contentWidth = body.scrollWidth;
          const contentHeight = body.scrollHeight;
          const frameWidth = iframe.clientWidth;
          const frameHeight = iframe.clientHeight;
          
          // Если контент больше фрейма, масштабируем
          if (contentWidth > frameWidth || contentHeight > frameHeight) {
            const scaleX = frameWidth / contentWidth;
            const scaleY = frameHeight / contentHeight;
            const scale = Math.min(scaleX, scaleY, 1);
            
            if (scale < 1) {
              body.style.transform = `scale(${scale})`;
              body.style.transformOrigin = 'top left';
              body.style.width = `${100 / scale}%`;
              body.style.height = `${100 / scale}%`;
            }
          }
        }
      } catch (e) {
        // Игнорируем ошибки cross-origin
        console.log('Не удалось получить доступ к содержимому iframe');
      }
    };
    
    // Показываем модальное окно
    document.getElementById('project-modal').classList.add('show');
  } catch (error) {
    console.error('Ошибка загрузки проекта:', error);
    alert('Ошибка при загрузке проекта');
  }
}

// Функции удаления перенесены в секцию мягкого удаления

// Вспомогательные функции
function formatDate(dateString) {
  if (!dateString) return 'Не указана';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'Неверная дата';
  }
}

function formatCode(code) {
  if (!code || code.trim() === '') return code;
  
  // Простое форматирование для лучшей читаемости
  let formatted = code
    .replace(/></g, '>\n<')  // Разделяем теги
    .replace(/\{/g, ' {\n')  // Открывающие скобки CSS
    .replace(/\}/g, '\n}\n') // Закрывающие скобки CSS
    .replace(/;/g, ';\n')    // Точки с запятой CSS
    .replace(/\n\s*\n/g, '\n') // Убираем лишние пустые строки
    .trim();
  
  return formatted;
}

function formatMessageContent(message) {
  if (message.type === 'project' && message.project) {
    return `📁 ${message.project.name || 'Без названия'}`;
  }
  
  const text = message.text || '';
  return text.length > 50 ? text.substring(0, 50) + '...' : text;
}

function calculateProjectSize(project, returnNumber = false) {
  const htmlSize = (project.html || '').length;
  const cssSize = (project.css || '').length;
  const totalSize = htmlSize + cssSize;
  
  if (returnNumber) return totalSize;
  
  if (totalSize < 1024) {
    return `${totalSize} б`;
  } else if (totalSize < 1024 * 1024) {
    return `${Math.round(totalSize / 1024)} КБ`;
  } else {
    return `${Math.round(totalSize / (1024 * 1024))} МБ`;
  }
}

// Закрытие модальных окон
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('show');
  });
}

// Закрытие модальных окон по клику вне их
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// Функция показа уведомлений
function showNotification(message, type = 'info') {
  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Добавляем стили
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-weight: 500;
    max-width: 300px;
    word-wrap: break-word;
    animation: slideIn 0.3s ease;
  `;
  
  // Добавляем анимацию
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Добавляем на страницу
  document.body.appendChild(notification);
  
  // Удаляем через 3 секунды
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Обработка изменения периода
function handlePeriodChange() {
  const period = document.getElementById('report-period').value;
  const customRange = document.getElementById('custom-date-range');
  
  if (period === 'custom') {
    customRange.style.display = 'block';
    // Устанавливаем значения по умолчанию
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('date-to').value = today.toISOString().split('T')[0];
    document.getElementById('date-from').value = weekAgo.toISOString().split('T')[0];
  } else {
    customRange.style.display = 'none';
  }
}

// Генерация быстрых отчетов
async function generateQuickReport(type, format) {
  console.log(`Генерация быстрого отчета: ${type} в формате ${format}`);
  
  showProgressModal();
  updateProgress(0, 'Подготовка данных...');
  
  try {
    // Получаем данные в зависимости от типа отчета
    let data;
    let reportName;
    
    switch (type) {
      case 'users':
        data = await prepareUsersReportData();
        reportName = 'Отчет по пользователям';
        break;
      case 'projects':
        data = await prepareProjectsReportData();
        reportName = 'Отчет по проектам';
        break;
      case 'messages':
        data = await prepareMessagesReportData();
        reportName = 'Отчет по сообщениям';
        break;
      case 'summary':
        data = await prepareSummaryReportData();
        reportName = 'Общая статистика';
        break;
    }
    
    updateProgress(50, 'Формирование отчета...');
    
    // Генерируем отчет в нужном формате
    const reportFile = await generateReportFile(data, format, reportName);
    
    updateProgress(90, 'Сохранение отчета...');
    
    // Сохраняем в историю
    await saveToReportsHistory({
      name: reportName,
      type: type,
      period: 'all',
      format: format,
      size: reportFile.size,
      createdAt: new Date().toISOString()
    });
    
    updateProgress(100, 'Готово!');
    
    // Скачиваем файл
    downloadFile(reportFile.blob, reportFile.filename);
    
    setTimeout(() => {
      closeModal('report-progress-modal');
      showNotification('Отчет успешно сгенерирован!', 'success');
      loadReportsHistory();
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка генерации отчета:', error);
    closeModal('report-progress-modal');
    showNotification('Ошибка при генерации отчета: ' + error.message, 'error');
  }
}

// Генерация кастомного отчета
async function generateCustomReport() {
  const reportType = document.getElementById('report-type').value;
  const reportPeriod = document.getElementById('report-period').value;
  const reportFormat = document.getElementById('report-format').value;
  const reportName = document.getElementById('report-name').value || `Отчет ${new Date().toLocaleDateString()}`;
  
  console.log('Генерация кастомного отчета:', { reportType, reportPeriod, reportFormat, reportName });
  
  showProgressModal();
  updateProgress(0, 'Подготовка данных...');
  
  try {
    // Получаем период для фильтрации
    const dateRange = getDateRange(reportPeriod);
    
    // Получаем данные с учетом периода
    let data;
    switch (reportType) {
      case 'users':
        data = await prepareUsersReportData(dateRange);
        break;
      case 'projects':
        data = await prepareProjectsReportData(dateRange);
        break;
      case 'messages':
        data = await prepareMessagesReportData(dateRange);
        break;
      case 'activity':
        data = await prepareActivityReportData(dateRange);
        break;
      case 'custom':
        data = await prepareCustomReportData(dateRange);
        break;
    }
    
    updateProgress(50, 'Формирование отчета...');
    
    // Генерируем отчет
    const reportFile = await generateReportFile(data, reportFormat, reportName);
    
    updateProgress(90, 'Сохранение отчета...');
    
    // Сохраняем в историю
    await saveToReportsHistory({
      name: reportName,
      type: reportType,
      period: reportPeriod,
      format: reportFormat,
      size: reportFile.size,
      createdAt: new Date().toISOString()
    });
    
    updateProgress(100, 'Готово!');
    
    // Скачиваем файл
    downloadFile(reportFile.blob, reportFile.filename);
    
    setTimeout(() => {
      closeModal('report-progress-modal');
      showNotification('Отчет успешно сгенерирован!', 'success');
      loadReportsHistory();
      clearCustomReportForm();
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка генерации кастомного отчета:', error);
    closeModal('report-progress-modal');
    showNotification('Ошибка при генерации отчета: ' + error.message, 'error');
  }
}

// Подготовка данных для отчета по пользователям
async function prepareUsersReportData(dateRange = null) {
  updateProgress(10, 'Загрузка данных пользователей...');
  
  let users = allUsers;
  if (dateRange) {
    users = users.filter(user => {
      const userDate = new Date(user.createdAt);
      return userDate >= dateRange.from && userDate <= dateRange.to;
    });
  }
  
  updateProgress(30, 'Анализ данных...');
  
  // Статистика по ролям
  const roleStats = users.reduce((acc, user) => {
    const role = user.role || 'user';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  
  // Статистика по датам регистрации
  const registrationStats = users.reduce((acc, user) => {
    const date = new Date(user.createdAt).toISOString().split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  
  return {
    title: 'Отчет по пользователям',
    summary: {
      totalUsers: users.length,
      admins: roleStats.admin || 0,
      regularUsers: roleStats.user || 0,
      averageProjectsPerUser: users.reduce((sum, u) => sum + (u.projectsCount || 0), 0) / users.length || 0
    },
    users: users,
    roleStats,
    registrationStats,
    generatedAt: new Date().toISOString()
  };
}

// Подготовка данных для отчета по проектам
async function prepareProjectsReportData(dateRange = null) {
  updateProgress(10, 'Загрузка данных проектов...');
  
  let projects = allProjects;
  if (dateRange) {
    projects = projects.filter(project => {
      const projectDate = new Date(project.createdAt);
      return projectDate >= dateRange.from && projectDate <= dateRange.to;
    });
  }
  
  updateProgress(30, 'Анализ данных...');
  
  // Статистика по размерам
  const sizeStats = projects.reduce((acc, project) => {
    const size = calculateProjectSize(project, true);
    if (size < 1024) acc.small++;
    else if (size < 10240) acc.medium++;
    else acc.large++;
    return acc;
  }, { small: 0, medium: 0, large: 0 });
  
  // Топ авторов
  const authorStats = projects.reduce((acc, project) => {
    acc[project.authorName] = (acc[project.authorName] || 0) + 1;
    return acc;
  }, {});
  
  return {
    title: 'Отчет по проектам',
    summary: {
      totalProjects: projects.length,
      averageSize: projects.reduce((sum, p) => sum + calculateProjectSize(p, true), 0) / projects.length || 0,
      topAuthor: Object.keys(authorStats).reduce((a, b) => authorStats[a] > authorStats[b] ? a : b, ''),
      sizeDistribution: sizeStats
    },
    projects: projects,
    authorStats,
    generatedAt: new Date().toISOString()
  };
}

// Подготовка данных для отчета по сообщениям
async function prepareMessagesReportData(dateRange = null) {
  updateProgress(10, 'Загрузка данных сообщений...');
  
  let messages = allMessages;
  if (dateRange) {
    messages = messages.filter(message => {
      const messageDate = new Date(message.created);
      return messageDate >= dateRange.from && messageDate <= dateRange.to;
    });
  }
  
  updateProgress(30, 'Анализ данных...');
  
  // Статистика по типам
  const typeStats = messages.reduce((acc, message) => {
    const type = message.type || 'text';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  
  // Активность по пользователям
  const userActivity = messages.reduce((acc, message) => {
    acc[message.user] = (acc[message.user] || 0) + 1;
    return acc;
  }, {});
  
  return {
    title: 'Отчет по сообщениям',
    summary: {
      totalMessages: messages.length,
      textMessages: typeStats.text || 0,
      projectMessages: typeStats.project || 0,
      activeUsers: Object.keys(userActivity).length,
      averageMessagesPerUser: messages.length / Object.keys(userActivity).length || 0
    },
    messages: messages,
    typeStats,
    userActivity,
    generatedAt: new Date().toISOString()
  };
}

// Подготовка сводного отчета
async function prepareSummaryReportData(dateRange = null) {
  updateProgress(10, 'Подготовка сводных данных...');
  
  const usersData = await prepareUsersReportData(dateRange);
  const projectsData = await prepareProjectsReportData(dateRange);
  const messagesData = await prepareMessagesReportData(dateRange);
  
  updateProgress(40, 'Формирование сводки...');
  
  return {
    title: 'Сводный отчет по платформе Together',
    summary: {
      totalUsers: usersData.summary.totalUsers,
      totalProjects: projectsData.summary.totalProjects,
      totalMessages: messagesData.summary.totalMessages,
      adminUsers: usersData.summary.admins,
      averageProjectsPerUser: usersData.summary.averageProjectsPerUser,
      averageMessagesPerUser: messagesData.summary.averageMessagesPerUser
    },
    users: usersData,
    projects: projectsData,
    messages: messagesData,
    generatedAt: new Date().toISOString()
  };
}

// Генерация файла отчета
async function generateReportFile(data, format, reportName) {
  updateProgress(60, `Генерация ${format.toUpperCase()} файла...`);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `${reportName}_${timestamp}.${format}`;
  
  let blob;
  let size;
  
  switch (format) {
    case 'pdf':
      blob = await generatePDFReport(data);
      break;
    case 'excel':
      blob = await generateExcelReport(data);
      break;
    case 'csv':
      blob = await generateCSVReport(data);
      break;
    default:
      throw new Error('Неподдерживаемый формат отчета');
  }
  
  size = blob.size;
  
  return { blob, filename, size };
}

// Генерация PDF отчета с использованием pdfMake
async function generatePDFReport(data) {
  try {
    // Проверяем доступность pdfMake
    if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
      console.warn('pdfMake не доступен, используем fallback');
      throw new Error('pdfMake не инициализирован');
    }
    
    // Переводим ключи на русский
    const russianLabels = {
      totalUsers: 'Всего пользователей',
      totalProjects: 'Всего проектов', 
      totalMessages: 'Всего сообщений',
      admins: 'Администраторов',
      regularUsers: 'Обычных пользователей',
      averageProjectsPerUser: 'Проектов на пользователя',
      averageSize: 'Средний размер проекта (байт)',
      topAuthor: 'Топ автор',
      sizeDistribution: 'Распределение по размерам',
      textMessages: 'Текстовых сообщений',
      projectMessages: 'Сообщений с проектами',
      activeUsers: 'Активных пользователей',
      averageMessagesPerUser: 'Сообщений на пользователя',
      activeDays: 'Активных дней',
      averageUsersPerDay: 'Пользователей в день',
      averageProjectsPerDay: 'Проектов в день',
      averageMessagesPerDay: 'Сообщений в день'
    };
    
    // Формируем содержимое PDF
    const content = [
      // Заголовок
      {
        text: data.title,
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },
      
      // Дата генерации
      {
        text: `Сгенерирован: ${new Date(data.generatedAt).toLocaleString('ru-RU')}`,
        style: 'subheader',
        margin: [0, 0, 0, 20]
      },
      
      // Сводная информация
      {
        text: 'Сводная информация',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10]
      }
    ];
    
    // Добавляем сводные данные
    Object.entries(data.summary).forEach(([key, value]) => {
      const label = russianLabels[key] || key;
      
      let displayValue;
      if (typeof value === 'number') {
        displayValue = value % 1 === 0 ? value : value.toFixed(2);
      } else if (typeof value === 'object' && value !== null) {
        // Обрабатываем объекты (например, sizeDistribution)
        if (key === 'sizeDistribution') {
          displayValue = `Малые: ${value.small || 0}, Средние: ${value.medium || 0}, Большие: ${value.large || 0}`;
        } else {
          displayValue = JSON.stringify(value);
        }
      } else {
        displayValue = String(value);
      }
      
      content.push({
        text: `${label}: ${displayValue}`,
        margin: [0, 2, 0, 2]
      });
    });
    
    // Добавляем таблицу пользователей
    if (data.users && Array.isArray(data.users) && data.users.length > 0) {
      content.push(
        { text: '', margin: [0, 20, 0, 0] }, // Отступ
        {
          text: 'Пользователи',
          style: 'sectionHeader',
          margin: [0, 0, 0, 10]
        }
      );
      
      const usersTable = {
        table: {
          headerRows: 1,
          widths: ['*', '*', 'auto'],
          body: [
            ['Имя', 'Email', 'Роль'], // Заголовки
            ...data.users.slice(0, 20).map(user => [
              user.displayName || 'Без имени',
              user.email || 'Не указан',
              user.role === 'admin' ? 'Админ' : 'Пользователь'
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      };
      
      content.push(usersTable);
    }
    
    // Добавляем таблицу проектов
    if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
      content.push(
        { text: '', margin: [0, 20, 0, 0] }, // Отступ
        {
          text: 'Проекты',
          style: 'sectionHeader',
          margin: [0, 0, 0, 10]
        }
      );
      
      const projectsTable = {
        table: {
          headerRows: 1,
          widths: ['*', '*', 'auto'],
          body: [
            ['Название', 'Автор', 'Размер'], // Заголовки
            ...data.projects.slice(0, 15).map(project => [
              project.name || 'Без названия',
              project.authorName || 'Неизвестный',
              calculateProjectSize(project)
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      };
      
      content.push(projectsTable);
    }
    
    // Добавляем детальную статистику размеров если есть
    if (data.summary && data.summary.sizeDistribution) {
      content.push(
        { text: '', margin: [0, 20, 0, 0] }, // Отступ
        {
          text: 'Статистика размеров проектов',
          style: 'sectionHeader',
          margin: [0, 0, 0, 10]
        }
      );
      
      const sizeStats = data.summary.sizeDistribution;
      const sizeTable = {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['Категория размера', 'Количество проектов'],
            ['Малые проекты (< 1 КБ)', sizeStats.small || 0],
            ['Средние проекты (1-10 КБ)', sizeStats.medium || 0],
            ['Большие проекты (> 10 КБ)', sizeStats.large || 0]
          ]
        },
        layout: 'lightHorizontalLines'
      };
      
      content.push(sizeTable);
    }
    
    // Определение документа
    const docDefinition = {
      content: content,
      styles: {
        header: {
          fontSize: 20,
          bold: true,
          color: '#333333'
        },
        subheader: {
          fontSize: 12,
          color: '#666666'
        },
        sectionHeader: {
          fontSize: 16,
          bold: true,
          color: '#333333'
        }
      },
      defaultStyle: {
        fontSize: 10,
        font: 'Roboto'
      },
      pageMargins: [40, 60, 40, 60]
    };
    
    // Генерируем PDF
    return new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(docDefinition).getBlob((blob) => {
          resolve(blob);
        });
      } catch (pdfError) {
        reject(pdfError);
      }
    });
    
  } catch (error) {
    console.error('Ошибка генерации PDF с pdfMake:', error);
    
    // Fallback к jsPDF с упрощенным содержимым
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Используем только ASCII символы для совместимости
      doc.setFont('helvetica');
      
      let yPos = 20;
      
      // Заголовок (транслитерация)
      doc.setFontSize(16);
      doc.text('Report: ' + transliterateRussian(data.title), 20, yPos);
      yPos += 20;
      
      doc.setFontSize(12);
      doc.text('Generated: ' + new Date(data.generatedAt).toLocaleDateString(), 20, yPos);
      yPos += 20;
      
      // Сводная информация
      doc.text('Summary:', 20, yPos);
      yPos += 10;
      
      Object.entries(data.summary).forEach(([key, value]) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${key}: ${value}`, 20, yPos);
        yPos += 8;
      });
      
      return new Blob([doc.output('blob')], { type: 'application/pdf' });
      
    } catch (fallbackError) {
      console.error('Ошибка fallback генерации PDF:', fallbackError);
      
      // Последний fallback - HTML
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <title>${data.title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; }
            .item { margin: 5px 0; }
          </style>
        </head>
        <body>
          <h1>${data.title}</h1>
          <p>Сгенерирован: ${new Date(data.generatedAt).toLocaleString('ru-RU')}</p>
          <div class="summary">
            <h2>Сводная информация</h2>
            ${Object.entries(data.summary).map(([key, value]) => 
              `<div class="item"><strong>${key}:</strong> ${value}</div>`
            ).join('')}
          </div>
        </body>
        </html>
      `;
      
      return new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    }
  }
}

// Функция транслитерации для fallback
function transliterateRussian(text) {
  const translitMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  
  return text.split('').map(char => translitMap[char] || char).join('');
}

// Генерация Excel отчета с использованием SheetJS
async function generateExcelReport(data) {
  try {
    const workbook = XLSX.utils.book_new();
    
    // Переводим ключи на русский для Excel
    const russianLabels = {
      totalUsers: 'Всего пользователей',
      totalProjects: 'Всего проектов', 
      totalMessages: 'Всего сообщений',
      admins: 'Администраторов',
      regularUsers: 'Обычных пользователей',
      averageProjectsPerUser: 'Проектов на пользователя',
      averageSize: 'Средний размер проекта (байт)',
      topAuthor: 'Топ автор',
      sizeDistribution: 'Распределение по размерам',
      textMessages: 'Текстовых сообщений',
      projectMessages: 'Сообщений с проектами',
      activeUsers: 'Активных пользователей',
      averageMessagesPerUser: 'Сообщений на пользователя',
      activeDays: 'Активных дней',
      averageUsersPerDay: 'Пользователей в день',
      averageProjectsPerDay: 'Проектов в день',
      averageMessagesPerDay: 'Сообщений в день'
    };

    // Лист сводной информации
    const summaryData = [
      ['Отчет', data.title],
      ['Дата генерации', new Date(data.generatedAt).toLocaleString('ru-RU')],
      [''],
      ['Сводная информация', ''],
      ...Object.entries(data.summary).map(([key, value]) => {
        const label = russianLabels[key] || key;
        let displayValue;
        
        if (typeof value === 'number') {
          displayValue = value % 1 === 0 ? value : value.toFixed(2);
        } else if (typeof value === 'object' && value !== null) {
          if (key === 'sizeDistribution') {
            displayValue = `Малые: ${value.small || 0}, Средние: ${value.medium || 0}, Большие: ${value.large || 0}`;
          } else {
            displayValue = JSON.stringify(value);
          }
        } else {
          displayValue = String(value);
        }
        
        return [label, displayValue];
      })
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');
    
    // Лист пользователей
    if (data.users && Array.isArray(data.users)) {
      const usersData = [
        ['Имя', 'Email', 'Роль', 'Дата регистрации', 'Проектов'],
        ...data.users.map(user => [
          user.displayName || 'Без имени',
          user.email || 'Не указан',
          user.role || 'user',
          formatDate(user.createdAt),
          user.projectsCount || 0
        ])
      ];
      
      const usersSheet = XLSX.utils.aoa_to_sheet(usersData);
      XLSX.utils.book_append_sheet(workbook, usersSheet, 'Пользователи');
    }
    
    // Лист проектов
    if (data.projects && Array.isArray(data.projects)) {
      const projectsData = [
        ['Название', 'Автор', 'Дата создания', 'Размер'],
        ...data.projects.map(project => [
          project.name || 'Без названия',
          project.authorName || 'Неизвестный',
          formatDate(project.createdAt),
          calculateProjectSize(project)
        ])
      ];
      
      const projectsSheet = XLSX.utils.aoa_to_sheet(projectsData);
      XLSX.utils.book_append_sheet(workbook, projectsSheet, 'Проекты');
    }
    
    // Лист сообщений
    if (data.messages && Array.isArray(data.messages)) {
      const messagesData = [
        ['Пользователь', 'Тип', 'Время', 'Содержание'],
        ...data.messages.slice(0, 1000).map(message => [ // Ограничиваем для производительности
          message.user || 'Неизвестный',
          message.type || 'text',
          formatDate(message.created),
          message.type === 'project' ? 
            `Проект: ${message.project?.name || 'Без названия'}` : 
            (message.text || '').substring(0, 100)
        ])
      ];
      
      const messagesSheet = XLSX.utils.aoa_to_sheet(messagesData);
      XLSX.utils.book_append_sheet(workbook, messagesSheet, 'Сообщения');
    }
    
    // Генерируем Excel файл
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
  } catch (error) {
    console.error('Ошибка генерации Excel:', error);
    // Fallback к CSV
    let csvContent = `${data.title}\n`;
    csvContent += `Сгенерирован: ${new Date(data.generatedAt).toLocaleString('ru-RU')}\n\n`;
    
    csvContent += "Сводная информация\n";
    Object.entries(data.summary).forEach(([key, value]) => {
      let displayValue;
      if (typeof value === 'object' && value !== null) {
        if (key === 'sizeDistribution') {
          displayValue = `Малые: ${value.small || 0} Средние: ${value.medium || 0} Большие: ${value.large || 0}`;
        } else {
          displayValue = JSON.stringify(value);
        }
      } else {
        displayValue = value;
      }
      csvContent += `${key},${displayValue}\n`;
    });
    
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  }
}

// Генерация CSV отчета
async function generateCSVReport(data) {
  return await generateExcelReport(data); // Используем тот же метод
}

// Вспомогательные функции для генерации HTML
function generateSummaryHTML(summary) {
  return Object.entries(summary).map(([key, value]) => 
    `<div class="stat-item"><strong>${key}:</strong> ${value}</div>`
  ).join('');
}

function generateDataTablesHTML(data) {
  let html = '';
  
  if (data.users && Array.isArray(data.users)) {
    html += `
      <div class="section">
        <h3>Пользователи</h3>
        <table>
          <thead>
            <tr><th>Имя</th><th>Email</th><th>Роль</th><th>Дата регистрации</th><th>Проектов</th></tr>
          </thead>
          <tbody>
            ${data.users.map(user => `
              <tr>
                <td>${user.displayName || 'Без имени'}</td>
                <td>${user.email || 'Не указан'}</td>
                <td>${user.role || 'user'}</td>
                <td>${formatDate(user.createdAt)}</td>
                <td>${user.projectsCount || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  return html;
}

// Получение диапазона дат
function getDateRange(period) {
  const now = new Date();
  let from, to = new Date(now);
  
  switch (period) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'quarter':
      from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case 'year':
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'custom':
      from = new Date(document.getElementById('date-from').value);
      to = new Date(document.getElementById('date-to').value);
      break;
    default:
      return null; // Все время
  }
  
  return { from, to };
}

// Управление прогрессом
function showProgressModal() {
  document.getElementById('report-progress-modal').classList.add('show');
}

function updateProgress(percentage, text, step = null) {
  document.getElementById('progress-fill').style.width = percentage + '%';
  document.getElementById('progress-percentage').textContent = percentage + '%';
  document.getElementById('progress-text').textContent = text;
  
  if (step) {
    const details = document.getElementById('progress-details');
    const stepElement = document.createElement('div');
    stepElement.className = 'progress-step current';
    stepElement.textContent = step;
    details.appendChild(stepElement);
    
    // Помечаем предыдущие шаги как завершенные
    const steps = details.querySelectorAll('.progress-step');
    steps.forEach((s, index) => {
      if (index < steps.length - 1) {
        s.className = 'progress-step completed';
      }
    });
  }
}

// Скачивание файла
function downloadFile(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// Работа с шаблонами
function showAddTemplateModal() {
  document.getElementById('template-modal').classList.add('show');
}

async function handleSaveTemplate() {
  const name = document.getElementById('template-name').value.trim();
  const description = document.getElementById('template-description').value.trim();
  const type = document.getElementById('template-type').value;
  const format = document.getElementById('template-format').value;
  
  if (!name) {
    showNotification('Введите название шаблона', 'error');
    return;
  }
  
  const template = {
    id: Date.now().toString(),
    name,
    description,
    type,
    format,
    includeSummary: document.getElementById('include-summary').checked,
    includeCharts: document.getElementById('include-charts').checked,
    includeDetails: document.getElementById('include-details').checked,
    includeTrends: document.getElementById('include-trends').checked,
    createdAt: new Date().toISOString()
  };
  
  try {
    // Сохраняем шаблон в localStorage (в реальном проекте - в базу данных)
    reportTemplates.push(template);
    localStorage.setItem('reportTemplates', JSON.stringify(reportTemplates));
    
    closeModal('template-modal');
    showNotification('Шаблон успешно сохранен!', 'success');
    loadReportTemplates();
    clearTemplateForm();
  } catch (error) {
    console.error('Ошибка сохранения шаблона:', error);
    showNotification('Ошибка при сохранении шаблона', 'error');
  }
}

// Загрузка данных для отчетов
async function loadReportsData() {
  console.log('Загрузка данных для отчетов...');
  
  try {
    // Загружаем шаблоны и историю из localStorage
    const savedTemplates = localStorage.getItem('reportTemplates');
    if (savedTemplates) {
      reportTemplates = JSON.parse(savedTemplates);
    }
    
    const savedHistory = localStorage.getItem('reportsHistory');
    if (savedHistory) {
      reportsHistory = JSON.parse(savedHistory);
    }
    
    loadReportTemplates();
    loadReportsHistory();
    
    showNotification('Данные отчетов обновлены', 'success');
  } catch (error) {
    console.error('Ошибка загрузки данных отчетов:', error);
    showNotification('Ошибка при загрузке данных отчетов', 'error');
  }
}

// Загрузка шаблонов отчетов
function loadReportTemplates() {
  const grid = document.getElementById('report-templates-grid');
  
  // Очищаем, оставляя только кнопку добавления
  const addButton = grid.querySelector('.add-template');
  grid.innerHTML = '';
  grid.appendChild(addButton);
  
  // Добавляем шаблоны
  reportTemplates.forEach(template => {
    const templateCard = document.createElement('div');
    templateCard.className = 'template-card';
    templateCard.innerHTML = `
      <div class="template-icon">📋</div>
      <div class="template-title">${template.name}</div>
      <div class="template-description">${template.description || 'Без описания'}</div>
      <div class="template-actions">
        <button class="template-btn" onclick="useTemplate('${template.id}')">Использовать</button>
        <button class="template-btn" onclick="editTemplate('${template.id}')">Изменить</button>
        <button class="template-btn" onclick="deleteTemplate('${template.id}')">Удалить</button>
      </div>
    `;
    grid.appendChild(templateCard);
  });
}

// Загрузка истории отчетов
function loadReportsHistory() {
  const tbody = document.getElementById('reports-history-body');
  
  if (reportsHistory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">История отчетов пуста</td></tr>';
    return;
  }
  
  tbody.innerHTML = reportsHistory.map(report => `
    <tr>
      <td>${report.name}</td>
      <td>${getReportTypeLabel(report.type)}</td>
      <td>${getPeriodLabel(report.period)}</td>
      <td>${report.format.toUpperCase()}</td>
      <td>${formatDate(report.createdAt)}</td>
      <td>${formatFileSize(report.size)}</td>
      <td>
        <button class="action-btn" onclick="downloadReport('${report.id}')">💾 Скачать</button>
        <button class="action-btn danger" onclick="deleteReport('${report.id}')">🗑️ Удалить</button>
      </td>
    </tr>
  `).join('');
}

// Сохранение в историю отчетов
async function saveToReportsHistory(reportData) {
  reportData.id = Date.now().toString();
  reportsHistory.unshift(reportData); // Добавляем в начало
  
  // Ограничиваем историю 50 записями
  if (reportsHistory.length > 50) {
    reportsHistory = reportsHistory.slice(0, 50);
  }
  
  localStorage.setItem('reportsHistory', JSON.stringify(reportsHistory));
}

// Вспомогательные функции
function getReportTypeLabel(type) {
  const labels = {
    users: 'Пользователи',
    projects: 'Проекты',
    messages: 'Сообщения',
    activity: 'Активность',
    custom: 'Комбинированный',
    summary: 'Сводный'
  };
  return labels[type] || type;
}

function getPeriodLabel(period) {
  const labels = {
    today: 'Сегодня',
    week: 'Неделя',
    month: 'Месяц',
    quarter: 'Квартал',
    year: 'Год',
    all: 'Все время',
    custom: 'Настраиваемый'
  };
  return labels[period] || period;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Б';
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function clearCustomReportForm() {
  document.getElementById('report-name').value = '';
  document.getElementById('report-type').value = 'users';
  document.getElementById('report-period').value = 'all';
  document.getElementById('report-format').value = 'pdf';
  document.getElementById('custom-date-range').style.display = 'none';
}

function clearTemplateForm() {
  document.getElementById('template-name').value = '';
  document.getElementById('template-description').value = '';
  document.getElementById('template-type').value = 'users';
  document.getElementById('template-format').value = 'pdf';
  document.getElementById('include-summary').checked = true;
  document.getElementById('include-charts').checked = true;
  document.getElementById('include-details').checked = false;
  document.getElementById('include-trends').checked = false;
}

// Использование шаблона
function useTemplate(templateId) {
  const template = reportTemplates.find(t => t.id === templateId);
  if (!template) return;
  
  // Заполняем форму данными шаблона
  document.getElementById('report-type').value = template.type;
  document.getElementById('report-format').value = template.format;
  document.getElementById('report-name').value = template.name;
  
  // Переключаемся на раздел кастомных отчетов
  switchSection('reports');
  
  showNotification(`Шаблон "${template.name}" применен`, 'success');
}

// Редактирование шаблона
function editTemplate(templateId) {
  const template = reportTemplates.find(t => t.id === templateId);
  if (!template) return;
  
  // Заполняем модальное окно данными шаблона
  document.getElementById('template-name').value = template.name;
  document.getElementById('template-description').value = template.description || '';
  document.getElementById('template-type').value = template.type;
  document.getElementById('template-format').value = template.format;
  document.getElementById('include-summary').checked = template.includeSummary;
  document.getElementById('include-charts').checked = template.includeCharts;
  document.getElementById('include-details').checked = template.includeDetails;
  document.getElementById('include-trends').checked = template.includeTrends;
  
  // Показываем модальное окно
  document.getElementById('template-modal').classList.add('show');
  
  // Меняем обработчик кнопки сохранения
  const saveBtn = document.getElementById('save-template');
  saveBtn.textContent = '✏️ Обновить шаблон';
  saveBtn.onclick = () => updateTemplate(templateId);
}

// Обновление шаблона
async function updateTemplate(templateId) {
  const name = document.getElementById('template-name').value.trim();
  const description = document.getElementById('template-description').value.trim();
  const type = document.getElementById('template-type').value;
  const format = document.getElementById('template-format').value;
  
  if (!name) {
    showNotification('Введите название шаблона', 'error');
    return;
  }
  
  const templateIndex = reportTemplates.findIndex(t => t.id === templateId);
  if (templateIndex === -1) return;
  
  // Обновляем шаблон
  reportTemplates[templateIndex] = {
    ...reportTemplates[templateIndex],
    name,
    description,
    type,
    format,
    includeSummary: document.getElementById('include-summary').checked,
    includeCharts: document.getElementById('include-charts').checked,
    includeDetails: document.getElementById('include-details').checked,
    includeTrends: document.getElementById('include-trends').checked,
    updatedAt: new Date().toISOString()
  };
  
  try {
    localStorage.setItem('reportTemplates', JSON.stringify(reportTemplates));
    
    closeModal('template-modal');
    showNotification('Шаблон успешно обновлен!', 'success');
    loadReportTemplates();
    resetTemplateSaveButton();
    clearTemplateForm();
  } catch (error) {
    console.error('Ошибка обновления шаблона:', error);
    showNotification('Ошибка при обновлении шаблона', 'error');
  }
}

// Удаление шаблона
function deleteTemplate(templateId) {
  const template = reportTemplates.find(t => t.id === templateId);
  if (!template) return;
  
  if (!confirm(`Вы уверены, что хотите удалить шаблон "${template.name}"?`)) {
    return;
  }
  
  try {
    reportTemplates = reportTemplates.filter(t => t.id !== templateId);
    localStorage.setItem('reportTemplates', JSON.stringify(reportTemplates));
    
    showNotification('Шаблон успешно удален', 'success');
    loadReportTemplates();
  } catch (error) {
    console.error('Ошибка удаления шаблона:', error);
    showNotification('Ошибка при удалении шаблона', 'error');
  }
}

// Сброс кнопки сохранения шаблона
function resetTemplateSaveButton() {
  const saveBtn = document.getElementById('save-template');
  saveBtn.textContent = '💾 Сохранить шаблон';
  saveBtn.onclick = handleSaveTemplate;
}

// Скачивание отчета из истории (заглушка)
function downloadReport(reportId) {
  const report = reportsHistory.find(r => r.id === reportId);
  if (!report) return;
  
  showNotification(`Функция скачивания отчета "${report.name}" будет реализована в следующих версиях`, 'info');
}

// Удаление отчета из истории
function deleteReport(reportId) {
  const report = reportsHistory.find(r => r.id === reportId);
  if (!report) return;
  
  if (!confirm(`Вы уверены, что хотите удалить отчет "${report.name}"?`)) {
    return;
  }
  
  try {
    reportsHistory = reportsHistory.filter(r => r.id !== reportId);
    localStorage.setItem('reportsHistory', JSON.stringify(reportsHistory));
    
    showNotification('Отчет удален из истории', 'success');
    loadReportsHistory();
  } catch (error) {
    console.error('Ошибка удаления отчета:', error);
    showNotification('Ошибка при удалении отчета', 'error');
  }
}

// Сохранение шаблона отчета (из кастомной формы)
async function saveReportTemplate() {
  const reportType = document.getElementById('report-type').value;
  const reportFormat = document.getElementById('report-format').value;
  const reportName = document.getElementById('report-name').value || 'Новый шаблон';
  
  const template = {
    id: Date.now().toString(),
    name: `Шаблон: ${reportName}`,
    description: `Автоматически созданный шаблон для отчетов типа "${getReportTypeLabel(reportType)}"`,
    type: reportType,
    format: reportFormat,
    includeSummary: true,
    includeCharts: true,
    includeDetails: false,
    includeTrends: false,
    createdAt: new Date().toISOString()
  };
  
  try {
    reportTemplates.push(template);
    localStorage.setItem('reportTemplates', JSON.stringify(reportTemplates));
    
    showNotification('Шаблон отчета сохранен!', 'success');
    loadReportTemplates();
  } catch (error) {
    console.error('Ошибка сохранения шаблона:', error);
    showNotification('Ошибка при сохранении шаблона', 'error');
  }
}

// Подготовка данных для отчета активности
async function prepareActivityReportData(dateRange = null) {
  updateProgress(10, 'Анализ активности пользователей...');
  
  let users = allUsers;
  let projects = allProjects;
  let messages = allMessages;
  
  if (dateRange) {
    users = users.filter(user => {
      const userDate = new Date(user.createdAt);
      return userDate >= dateRange.from && userDate <= dateRange.to;
    });
    
    projects = projects.filter(project => {
      const projectDate = new Date(project.createdAt);
      return projectDate >= dateRange.from && projectDate <= dateRange.to;
    });
    
    messages = messages.filter(message => {
      const messageDate = new Date(message.created);
      return messageDate >= dateRange.from && messageDate <= dateRange.to;
    });
  }
  
  updateProgress(30, 'Формирование статистики активности...');
  
  // Активность по дням
  const dailyActivity = {};
  
  // Регистрации пользователей
  users.forEach(user => {
    const date = new Date(user.createdAt).toISOString().split('T')[0];
    if (!dailyActivity[date]) dailyActivity[date] = { users: 0, projects: 0, messages: 0 };
    dailyActivity[date].users++;
  });
  
  // Создание проектов
  projects.forEach(project => {
    const date = new Date(project.createdAt).toISOString().split('T')[0];
    if (!dailyActivity[date]) dailyActivity[date] = { users: 0, projects: 0, messages: 0 };
    dailyActivity[date].projects++;
  });
  
  // Сообщения
  messages.forEach(message => {
    const date = new Date(message.created).toISOString().split('T')[0];
    if (!dailyActivity[date]) dailyActivity[date] = { users: 0, projects: 0, messages: 0 };
    dailyActivity[date].messages++;
  });
  
  return {
    title: 'Отчет по активности',
    summary: {
      totalUsers: users.length,
      totalProjects: projects.length,
      totalMessages: messages.length,
      activeDays: Object.keys(dailyActivity).length,
      averageUsersPerDay: users.length / Object.keys(dailyActivity).length || 0,
      averageProjectsPerDay: projects.length / Object.keys(dailyActivity).length || 0,
      averageMessagesPerDay: messages.length / Object.keys(dailyActivity).length || 0
    },
    dailyActivity,
    generatedAt: new Date().toISOString()
  };
}

// Подготовка комбинированного отчета
async function prepareCustomReportData(dateRange = null) {
  updateProgress(10, 'Подготовка комбинированного отчета...');
  
  const usersData = await prepareUsersReportData(dateRange);
  const projectsData = await prepareProjectsReportData(dateRange);
  const messagesData = await prepareMessagesReportData(dateRange);
  const activityData = await prepareActivityReportData(dateRange);
  
  updateProgress(40, 'Объединение данных...');
  
  // Правильно объединяем данные без перезаписи
  return {
    title: 'Комбинированный отчет',
    summary: {
      // Пользователи
      totalUsers: usersData.summary.totalUsers,
      admins: usersData.summary.admins,
      regularUsers: usersData.summary.regularUsers,
      averageProjectsPerUser: usersData.summary.averageProjectsPerUser,
      
      // Проекты
      totalProjects: projectsData.summary.totalProjects,
      averageSize: projectsData.summary.averageSize,
      topAuthor: projectsData.summary.topAuthor,
      sizeDistribution: projectsData.summary.sizeDistribution,
      
      // Сообщения
      totalMessages: messagesData.summary.totalMessages,
      textMessages: messagesData.summary.textMessages,
      projectMessages: messagesData.summary.projectMessages,
      activeUsers: messagesData.summary.activeUsers,
      averageMessagesPerUser: messagesData.summary.averageMessagesPerUser,
      
      // Активность
      activeDays: activityData.summary.activeDays,
      averageUsersPerDay: activityData.summary.averageUsersPerDay,
      averageProjectsPerDay: activityData.summary.averageProjectsPerDay,
      averageMessagesPerDay: activityData.summary.averageMessagesPerDay
    },
    users: usersData,
    projects: projectsData,
    messages: messagesData,
    activity: activityData,
    charts: generateChartsData(usersData, projectsData, messagesData, activityData),
    generatedAt: new Date().toISOString()
  };
}

// Генерация данных для графиков
function generateChartsData(usersData, projectsData, messagesData, activityData) {
  return {
    // Круговая диаграмма ролей пользователей
    userRoles: {
      type: 'pie',
      title: 'Распределение пользователей по ролям',
      data: [
        { label: 'Администраторы', value: usersData.summary.admins || 0 },
        { label: 'Пользователи', value: usersData.summary.regularUsers || 0 }
      ]
    },
    
    // Столбчатая диаграмма размеров проектов
    projectSizes: {
      type: 'bar',
      title: 'Распределение проектов по размерам',
      data: [
        { label: 'Малые (< 1 КБ)', value: projectsData.summary.sizeDistribution?.small || 0 },
        { label: 'Средние (1-10 КБ)', value: projectsData.summary.sizeDistribution?.medium || 0 },
        { label: 'Большие (> 10 КБ)', value: projectsData.summary.sizeDistribution?.large || 0 }
      ]
    },
    
    // Круговая диаграмма типов сообщений
    messageTypes: {
      type: 'pie',
      title: 'Типы сообщений',
      data: [
        { label: 'Текстовые', value: messagesData.summary.textMessages || 0 },
        { label: 'С проектами', value: messagesData.summary.projectMessages || 0 }
      ]
    },
    
    // Линейный график активности по дням
    dailyActivity: {
      type: 'line',
      title: 'Активность по дням',
      data: Object.entries(activityData.dailyActivity || {}).map(([date, activity]) => ({
        date,
        users: activity.users || 0,
        projects: activity.projects || 0,
        messages: activity.messages || 0
      })).sort((a, b) => new Date(a.date) - new Date(b.date))
    }
  };
}

// Генерация CSV для пользователей
function generateUsersCSV(users) {
  let csv = "Пользователи\n";
  csv += "Имя,Email,Роль,Дата регистрации,Проектов\n";
  
  if (Array.isArray(users)) {
    users.forEach(user => {
      csv += `"${user.displayName || 'Без имени'}","${user.email || 'Не указан'}","${user.role || 'user'}","${formatDate(user.createdAt)}","${user.projectsCount || 0}"\n`;
    });
  }
  
  return csv + "\n";
}

// Генерация CSV для проектов
function generateProjectsCSV(projects) {
  let csv = "Проекты\n";
  csv += "Название,Автор,Дата создания,Размер\n";
  
  if (Array.isArray(projects)) {
    projects.forEach(project => {
      csv += `"${project.name || 'Без названия'}","${project.authorName || 'Неизвестный'}","${formatDate(project.createdAt)}","${calculateProjectSize(project)}"\n`;
    });
  }
  
  return csv + "\n";
}

// Генерация CSV для сообщений
function generateMessagesCSV(messages) {
  let csv = "Сообщения\n";
  csv += "Пользователь,Тип,Время,Содержание\n";
  
  if (Array.isArray(messages)) {
    messages.forEach(message => {
      const content = message.type === 'project' ? 
        `Проект: ${message.project?.name || 'Без названия'}` : 
        (message.text || '').substring(0, 50);
      csv += `"${message.user || 'Неизвестный'}","${message.type || 'text'}","${formatDate(message.created)}","${content}"\n`;
    });
  }
  
  return csv + "\n";
}

// Инициализация системы отчетов при загрузке
function initializeReportsSystem() {
  console.log('Инициализация системы отчетов...');
  
  // Загружаем сохраненные данные
  loadReportsData();
  
  // Устанавливаем сегодняшнюю дату по умолчанию для кастомного периода
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  document.getElementById('date-to').value = today;
  document.getElementById('date-from').value = weekAgo;
}

// Переменные для хранения графиков
let chartsInstances = {};

// Показать модальное окно с графиками
async function showChartsModal() {
  try {
    showProgressModal();
    updateProgress(10, 'Подготовка данных для графиков...');
    
    // Получаем данные для комбинированного отчета
    const reportData = await prepareCustomReportData();
    
    updateProgress(50, 'Создание графиков...');
    
    // Показываем модальное окно
    document.getElementById('charts-modal').classList.add('show');
    
    // Небольшая задержка для отображения модального окна
    setTimeout(() => {
      createCharts(reportData.charts);
      updateProgress(100, 'Графики готовы!');
      
      setTimeout(() => {
        document.getElementById('report-progress-modal').classList.remove('show');
      }, 500);
    }, 100);
    
  } catch (error) {
    console.error('Ошибка создания графиков:', error);
    showNotification('Ошибка при создании графиков', 'error');
    document.getElementById('report-progress-modal').classList.remove('show');
  }
}

// Создание всех графиков
function createCharts(chartsData) {
  // Уничтожаем существующие графики
  Object.values(chartsInstances).forEach(chart => {
    if (chart) chart.destroy();
  });
  chartsInstances = {};
  
  // Создаем новые графики
  if (chartsData.userRoles) {
    chartsInstances.userRoles = createPieChart('userRolesChart', chartsData.userRoles);
  }
  
  if (chartsData.projectSizes) {
    chartsInstances.projectSizes = createBarChart('projectSizesChart', chartsData.projectSizes);
  }
  
  if (chartsData.messageTypes) {
    chartsInstances.messageTypes = createPieChart('messageTypesChart', chartsData.messageTypes);
  }
  
  if (chartsData.dailyActivity) {
    chartsInstances.dailyActivity = createLineChart('dailyActivityChart', chartsData.dailyActivity);
  }
}

// Создание круговой диаграммы
function createPieChart(canvasId, chartData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const colors = ['#ffd700', '#ffed4e', '#ffe066', '#ffd633', '#ffcc00'];
  
  return new Chart(ctx, {
    type: 'pie',
    data: {
      labels: chartData.data.map(item => item.label),
      datasets: [{
        data: chartData.data.map(item => item.value),
        backgroundColor: colors.slice(0, chartData.data.length),
        borderColor: '#1a1a1a',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#ccc',
            padding: 20,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: '#2a2a2a',
          titleColor: '#ffd700',
          bodyColor: '#ccc',
          borderColor: '#ffd700',
          borderWidth: 1
        }
      }
    }
  });
}

// Создание столбчатой диаграммы
function createBarChart(canvasId, chartData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.data.map(item => item.label),
      datasets: [{
        label: 'Количество',
        data: chartData.data.map(item => item.value),
        backgroundColor: 'rgba(255, 215, 0, 0.8)',
        borderColor: '#ffd700',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#2a2a2a',
          titleColor: '#ffd700',
          bodyColor: '#ccc',
          borderColor: '#ffd700',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#ccc',
            stepSize: 1
          },
          grid: {
            color: '#444'
          }
        },
        x: {
          ticks: {
            color: '#ccc'
          },
          grid: {
            color: '#444'
          }
        }
      }
    }
  });
}

// Создание линейного графика
function createLineChart(canvasId, chartData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const dates = chartData.data.map(item => {
    const date = new Date(item.date);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  });
  
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Пользователи',
          data: chartData.data.map(item => item.users),
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255, 215, 0, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Проекты',
          data: chartData.data.map(item => item.projects),
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Сообщения',
          data: chartData.data.map(item => item.messages),
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#ccc',
            padding: 20,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: '#2a2a2a',
          titleColor: '#ffd700',
          bodyColor: '#ccc',
          borderColor: '#ffd700',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#ccc',
            stepSize: 1
          },
          grid: {
            color: '#444'
          }
        },
        x: {
          ticks: {
            color: '#ccc'
          },
          grid: {
            color: '#444'
          }
        }
      }
    }
  });
}

// Экспорт графиков как изображений
async function exportCharts() {
  try {
    const zip = new JSZip();
    
    for (const [name, chart] of Object.entries(chartsInstances)) {
      if (chart) {
        const canvas = chart.canvas;
        const dataURL = canvas.toDataURL('image/png');
        const base64Data = dataURL.split(',')[1];
        zip.file(`${name}.png`, base64Data, { base64: true });
      }
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    downloadFile(content, 'charts.zip');
    
    showNotification('Графики экспортированы!', 'success');
  } catch (error) {
    console.error('Ошибка экспорта графиков:', error);
    showNotification('Ошибка при экспорте графиков', 'error');
  }
}

// Обработчик для кнопки экспорта графиков
document.addEventListener('DOMContentLoaded', function() {
  const exportChartsBtn = document.getElementById('export-charts');
  if (exportChartsBtn) {
    exportChartsBtn.addEventListener('click', exportCharts);
  }
});

// ========== СИСТЕМА МЯГКОГО УДАЛЕНИЯ ==========

// Настройка обработчиков для системы мягкого удаления
function setupPendingDeletionEventListeners() {
  console.log('Настройка обработчиков для системы мягкого удаления...');
  
  // Обновление данных
  const refreshPendingBtn = document.getElementById('refresh-pending');
  if (refreshPendingBtn) {
    refreshPendingBtn.onclick = loadPendingDeletionData;
    console.log('Обработчик refresh-pending установлен');
  } else {
    console.warn('Элемент refresh-pending не найден');
  }
  
  // Очистка всех элементов на удалении
  const clearAllBtn = document.getElementById('clear-all-pending');
  if (clearAllBtn) {
    clearAllBtn.onclick = clearAllPendingDeletion;
    console.log('Обработчик clear-all-pending установлен');
  } else {
    console.warn('Элемент clear-all-pending не найден');
  }
  
  // Вкладки
  const pendingTabs = document.querySelectorAll('.pending-tab');
  console.log('Найдено вкладок pending-tab:', pendingTabs.length);
  pendingTabs.forEach(tab => {
    tab.onclick = () => switchPendingTab(tab.dataset.type);
    console.log('Обработчик установлен для вкладки:', tab.dataset.type);
  });
  
  // Поиск
  const pendingUsersSearch = document.getElementById('pending-users-search');
  if (pendingUsersSearch) {
    pendingUsersSearch.oninput = filterPendingUsers;
    console.log('Обработчик pending-users-search установлен');
  } else {
    console.warn('Элемент pending-users-search не найден');
  }
  
  const pendingProjectsSearch = document.getElementById('pending-projects-search');
  if (pendingProjectsSearch) {
    pendingProjectsSearch.oninput = filterPendingProjects;
    console.log('Обработчик pending-projects-search установлен');
  } else {
    console.warn('Элемент pending-projects-search не найден');
  }
  
  const pendingMessagesSearch = document.getElementById('pending-messages-search');
  if (pendingMessagesSearch) {
    pendingMessagesSearch.oninput = filterPendingMessages;
    console.log('Обработчик pending-messages-search установлен');
  } else {
    console.warn('Элемент pending-messages-search не найден');
  }
  
  // Массовое восстановление
  const restoreAllUsersBtn = document.getElementById('restore-all-users');
  if (restoreAllUsersBtn) {
    restoreAllUsersBtn.onclick = () => restoreAllItems('users');
    console.log('Обработчик restore-all-users установлен');
  } else {
    console.warn('Элемент restore-all-users не найден');
  }
  
  const restoreAllProjectsBtn = document.getElementById('restore-all-projects');
  if (restoreAllProjectsBtn) {
    restoreAllProjectsBtn.onclick = () => restoreAllItems('projects');
    console.log('Обработчик restore-all-projects установлен');
  } else {
    console.warn('Элемент restore-all-projects не найден');
  }
  
  const restoreAllMessagesBtn = document.getElementById('restore-all-messages');
  if (restoreAllMessagesBtn) {
    restoreAllMessagesBtn.onclick = () => restoreAllItems('messages');
    console.log('Обработчик restore-all-messages установлен');
  } else {
    console.warn('Элемент restore-all-messages не найден');
  }
  
  console.log('Настройка обработчиков завершена');
}

// Переключение вкладок в секции удаления
function switchPendingTab(type) {
  console.log('Переключение вкладки на тип:', type);
  
  // Убираем активный класс со всех вкладок
  document.querySelectorAll('.pending-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Скрываем весь контент
  document.querySelectorAll('.pending-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Активируем выбранную вкладку
  const selectedTab = document.querySelector(`[data-type="${type}"]`);
  const selectedContent = document.getElementById(`pending-${type}`);
  
  if (selectedTab) {
    selectedTab.classList.add('active');
    console.log('Вкладка активирована:', type);
  } else {
    console.error('Вкладка не найдена:', `[data-type="${type}"]`);
  }
  
  if (selectedContent) {
    selectedContent.classList.add('active');
    console.log('Контент активирован:', `pending-${type}`);
  } else {
    console.error('Контент не найден:', `pending-${type}`);
  }
}

// Загрузка данных элементов на удалении
async function loadPendingDeletionData() {
  try {
    // Загружаем из localStorage (в реальном проекте это была бы база данных)
    const savedPendingUsers = localStorage.getItem('pendingDeletionUsers');
    const savedPendingProjects = localStorage.getItem('pendingDeletionProjects');
    const savedPendingMessages = localStorage.getItem('pendingDeletionMessages');
    
    pendingDeletionUsers = savedPendingUsers ? JSON.parse(savedPendingUsers) : [];
    pendingDeletionProjects = savedPendingProjects ? JSON.parse(savedPendingProjects) : [];
    pendingDeletionMessages = savedPendingMessages ? JSON.parse(savedPendingMessages) : [];
    
    // Обновляем отображение
    renderPendingUsers();
    renderPendingProjects();
    renderPendingMessages();
    updatePendingStats();
    
  } catch (error) {
    console.error('Ошибка загрузки данных на удалении:', error);
    showNotification('Ошибка загрузки данных на удалении', 'error');
  }
}

// Обновление статистики элементов на удалении
function updatePendingStats() {
  document.getElementById('pending-users-count').textContent = pendingDeletionUsers.length;
  document.getElementById('pending-projects-count').textContent = pendingDeletionProjects.length;
  document.getElementById('pending-messages-count').textContent = pendingDeletionMessages.length;
}

// Отображение пользователей на удалении
function renderPendingUsers() {
  const tbody = document.getElementById('pending-users-table-body');
  
  if (pendingDeletionUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Нет пользователей на удалении</td></tr>';
    return;
  }
  
  tbody.innerHTML = pendingDeletionUsers.map(user => `
    <tr>
      <td>
        <img src="${user.photoURL || 'https://via.placeholder.com/40x40?text=👤'}" 
             alt="Аватар" class="user-avatar">
      </td>
      <td>${user.displayName || 'Без имени'}</td>
      <td>${user.email || 'Не указан'}</td>
      <td>
        <span class="role-badge ${user.role}">${user.role === 'admin' ? 'Админ' : 'Пользователь'}</span>
      </td>
      <td>
        <div class="deletion-date">${formatDate(user.deletedAt)}</div>
        <div class="deletion-info">Удалил: <span class="deletion-admin">${user.deletedBy}</span></div>
      </td>
      <td><span class="deletion-admin">${user.deletedBy}</span></td>
      <td>
        <button class="restore-btn" onclick="restoreUser('${user.uid || user.id}')">↩️ Восстановить</button>
        <button class="permanent-delete-btn" onclick="permanentDeleteUser('${user.uid || user.id}')">🗑️ Удалить навсегда</button>
      </td>
    </tr>
  `).join('');
}

// Отображение проектов на удалении
function renderPendingProjects() {
  const tbody = document.getElementById('pending-projects-table-body');
  
  if (pendingDeletionProjects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Нет проектов на удалении</td></tr>';
    return;
  }
  
  tbody.innerHTML = pendingDeletionProjects.map(project => `
    <tr>
      <td>
        <div class="project-img">
          <div class="project-preview-mini">${project.name ? project.name.charAt(0).toUpperCase() : '?'}</div>
        </div>
      </td>
      <td>${project.name || 'Без названия'}</td>
      <td>${project.authorName || 'Неизвестный'}</td>
      <td>
        <div class="deletion-date">${formatDate(project.deletedAt)}</div>
        <div class="deletion-info">Удалил: <span class="deletion-admin">${project.deletedBy}</span></div>
      </td>
      <td><span class="deletion-admin">${project.deletedBy}</span></td>
      <td>${calculateProjectSize(project)}</td>
      <td>
        <button class="restore-btn" onclick="restoreProject('${project.userId}', '${project.id}')">↩️ Восстановить</button>
        <button class="permanent-delete-btn" onclick="permanentDeleteProject('${project.userId}', '${project.id}')">🗑️ Удалить навсегда</button>
      </td>
    </tr>
  `).join('');
}

// Отображение сообщений на удалении
function renderPendingMessages() {
  const tbody = document.getElementById('pending-messages-table-body');
  
  if (pendingDeletionMessages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Нет сообщений на удалении</td></tr>';
    return;
  }
  
  tbody.innerHTML = pendingDeletionMessages.map(message => `
    <tr>
      <td>
        <img src="${message.avatar || 'https://via.placeholder.com/40x40?text=👤'}" 
             alt="Аватар" class="user-avatar">
      </td>
      <td>${message.user || 'Неизвестный'}</td>
      <td>
        <div class="message-content">${formatMessageContent(message)}</div>
      </td>
      <td>
        <span class="message-type ${message.type}">${message.type === 'project' ? 'Проект' : 'Текст'}</span>
      </td>
      <td>
        <div class="deletion-date">${formatDate(message.deletedAt)}</div>
        <div class="deletion-info">Удалил: <span class="deletion-admin">${message.deletedBy}</span></div>
      </td>
      <td><span class="deletion-admin">${message.deletedBy}</span></td>
      <td>
        <button class="restore-btn" onclick="restoreMessage('${message.id}')">↩️ Восстановить</button>
        <button class="permanent-delete-btn" onclick="permanentDeleteMessage('${message.id}')">🗑️ Удалить навсегда</button>
      </td>
    </tr>
  `).join('');
}

// Модифицированные функции удаления (теперь мягкое удаление)
async function deleteUser(userId) {
  try {
    const user = allUsers.find(u => u.id === userId || u.uid === userId);
    if (!user) {
      showNotification('Пользователь не найден', 'error');
      return;
    }
    
    // Добавляем поле deleted в Firebase вместо физического удаления
    const userDocId = user.id || user.uid;
    await window.db.collection('users').doc(userDocId).update({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    });
    
    // Добавляем в список на удаление
    const pendingUser = {
      ...user,
      uid: user.id || user.uid, // Убеждаемся что uid есть
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    };
    
    pendingDeletionUsers.push(pendingUser);
    localStorage.setItem('pendingDeletionUsers', JSON.stringify(pendingDeletionUsers));
    
    // Убираем из основного списка
    allUsers = allUsers.filter(u => u.id !== userId && u.uid !== userId);
    
    renderUsers(allUsers);
    updateStats();
    updatePendingStats();
    
    showNotification(`Пользователь ${user.displayName || user.email} помещен в корзину`, 'success');
    
  } catch (error) {
    console.error('Ошибка мягкого удаления пользователя:', error);
    showNotification('Ошибка при удалении пользователя', 'error');
  }
}

async function deleteProject(userId, projectId) {
  try {
    const project = allProjects.find(p => p.userId === userId && p.id === projectId);
    if (!project) {
      showNotification('Проект не найден', 'error');
      return;
    }
    
    // Добавляем поле deleted в Firebase вместо физического удаления
    await window.db.collection('users').doc(userId).collection('projects').doc(projectId).update({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    });
    
    // Добавляем в список на удаление
    const pendingProject = {
      ...project,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    };
    
    pendingDeletionProjects.push(pendingProject);
    localStorage.setItem('pendingDeletionProjects', JSON.stringify(pendingDeletionProjects));
    
    // Убираем из основного списка
    allProjects = allProjects.filter(p => !(p.userId === userId && p.id === projectId));
    
    renderProjects(allProjects);
    updateStats();
    updatePendingStats();
    
    showNotification(`Проект "${project.name || 'Без названия'}" помещен в корзину`, 'success');
    
  } catch (error) {
    console.error('Ошибка мягкого удаления проекта:', error);
    showNotification('Ошибка при удалении проекта', 'error');
  }
}

async function deleteMessage(messageId) {
  try {
    const message = allMessages.find(m => m.id === messageId);
    if (!message) {
      showNotification('Сообщение не найдено', 'error');
      return;
    }
    
    // Добавляем поле deleted в Firebase вместо физического удаления
    await window.db.collection('chat-messages').doc(messageId).update({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    });
    
    // Находим пользователя для получения аватара
    const messageUser = allUsers.find(u => u.email === message.user || u.displayName === message.user);
    
    // Добавляем в список на удаление
    const pendingMessage = {
      ...message,
      avatar: messageUser?.photoURL || message.avatar || 'https://via.placeholder.com/40x40?text=👤',
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser.email
    };
    
    pendingDeletionMessages.push(pendingMessage);
    localStorage.setItem('pendingDeletionMessages', JSON.stringify(pendingDeletionMessages));
    
    // Убираем из основного списка
    allMessages = allMessages.filter(m => m.id !== messageId);
    
    renderMessages(allMessages);
    updateStats();
    updatePendingStats();
    
    showNotification('Сообщение помещено в корзину', 'success');
    
  } catch (error) {
    console.error('Ошибка мягкого удаления сообщения:', error);
    showNotification('Ошибка при удалении сообщения', 'error');
  }
}

// Функции восстановления
async function restoreUser(userId) {
  try {
    const userIndex = pendingDeletionUsers.findIndex(u => u.uid === userId || u.id === userId);
    if (userIndex === -1) {
      showNotification('Пользователь не найден в корзине', 'error');
      return;
    }
    
    const user = pendingDeletionUsers[userIndex];
    
    // Убираем поле deleted из Firebase
    const userDocId = user.uid || user.id;
    await window.db.collection('users').doc(userDocId).update({
      deleted: firebase.firestore.FieldValue.delete(),
      deletedAt: firebase.firestore.FieldValue.delete(),
      deletedBy: firebase.firestore.FieldValue.delete()
    });
    
    // Убираем метаданные удаления
    delete user.deletedAt;
    delete user.deletedBy;
    
    // Возвращаем в основной список
    allUsers.push(user);
    pendingDeletionUsers.splice(userIndex, 1);
    
    // Сохраняем изменения
    localStorage.setItem('pendingDeletionUsers', JSON.stringify(pendingDeletionUsers));
    
    renderUsers(allUsers);
    renderPendingUsers();
    updateStats();
    updatePendingStats();
    
    showNotification(`Пользователь ${user.displayName || user.email} восстановлен`, 'success');
    
  } catch (error) {
    console.error('Ошибка восстановления пользователя:', error);
    showNotification('Ошибка при восстановлении пользователя', 'error');
  }
}

async function restoreProject(userId, projectId) {
  try {
    const projectIndex = pendingDeletionProjects.findIndex(p => p.userId === userId && p.id === projectId);
    if (projectIndex === -1) {
      showNotification('Проект не найден в корзине', 'error');
      return;
    }
    
    const project = pendingDeletionProjects[projectIndex];
    
    // Убираем поле deleted из Firebase
    await window.db.collection('users').doc(userId).collection('projects').doc(projectId).update({
      deleted: firebase.firestore.FieldValue.delete(),
      deletedAt: firebase.firestore.FieldValue.delete(),
      deletedBy: firebase.firestore.FieldValue.delete()
    });
    
    // Убираем метаданные удаления
    delete project.deletedAt;
    delete project.deletedBy;
    
    // Возвращаем в основной список
    allProjects.push(project);
    pendingDeletionProjects.splice(projectIndex, 1);
    
    // Сохраняем изменения
    localStorage.setItem('pendingDeletionProjects', JSON.stringify(pendingDeletionProjects));
    
    renderProjects(allProjects);
    renderPendingProjects();
    updateStats();
    updatePendingStats();
    
    showNotification(`Проект "${project.name || 'Без названия'}" восстановлен`, 'success');
    
  } catch (error) {
    console.error('Ошибка восстановления проекта:', error);
    showNotification('Ошибка при восстановлении проекта', 'error');
  }
}

async function restoreMessage(messageId) {
  try {
    const messageIndex = pendingDeletionMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      showNotification('Сообщение не найдено в корзине', 'error');
      return;
    }
    
    const message = pendingDeletionMessages[messageIndex];
    
    // Убираем поле deleted из Firebase
    await window.db.collection('chat-messages').doc(messageId).update({
      deleted: firebase.firestore.FieldValue.delete(),
      deletedAt: firebase.firestore.FieldValue.delete(),
      deletedBy: firebase.firestore.FieldValue.delete()
    });
    
    // Убираем метаданные удаления
    delete message.deletedAt;
    delete message.deletedBy;
    
    // Возвращаем в основной список
    allMessages.push(message);
    pendingDeletionMessages.splice(messageIndex, 1);
    
    // Сохраняем изменения
    localStorage.setItem('pendingDeletionMessages', JSON.stringify(pendingDeletionMessages));
    
    renderMessages(allMessages);
    renderPendingMessages();
    updateStats();
    updatePendingStats();
    
    showNotification('Сообщение восстановлено', 'success');
    
  } catch (error) {
    console.error('Ошибка восстановления сообщения:', error);
    showNotification('Ошибка при восстановлении сообщения', 'error');
  }
}

// Функции окончательного удаления
async function permanentDeleteUser(userId) {
  if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить этого пользователя? Это действие нельзя отменить!')) {
    return;
  }
  
  try {
    const userIndex = pendingDeletionUsers.findIndex(u => u.uid === userId || u.id === userId);
    if (userIndex === -1) {
      showNotification('Пользователь не найден в корзине', 'error');
      return;
    }
    
    const user = pendingDeletionUsers[userIndex];
    
    // Удаляем из Firebase окончательно
    const userDocId = user.uid || user.id;
    await window.db.collection('users').doc(userDocId).delete();
    
    // Удаляем из корзины
    pendingDeletionUsers.splice(userIndex, 1);
    localStorage.setItem('pendingDeletionUsers', JSON.stringify(pendingDeletionUsers));
    
    renderPendingUsers();
    updatePendingStats();
    
    showNotification(`Пользователь ${user.displayName || user.email} удален навсегда`, 'success');
    
  } catch (error) {
    console.error('Ошибка окончательного удаления пользователя:', error);
    showNotification('Ошибка при окончательном удалении пользователя', 'error');
  }
}

async function permanentDeleteProject(userId, projectId) {
  if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить этот проект? Это действие нельзя отменить!')) {
    return;
  }
  
  try {
    const projectIndex = pendingDeletionProjects.findIndex(p => p.userId === userId && p.id === projectId);
    if (projectIndex === -1) {
      showNotification('Проект не найден в корзине', 'error');
      return;
    }
    
    const project = pendingDeletionProjects[projectIndex];
    
    // Удаляем из Firebase окончательно
    await window.db.collection('users').doc(userId).collection('projects').doc(projectId).delete();
    
    // Удаляем из корзины
    pendingDeletionProjects.splice(projectIndex, 1);
    localStorage.setItem('pendingDeletionProjects', JSON.stringify(pendingDeletionProjects));
    
    renderPendingProjects();
    updatePendingStats();
    
    showNotification(`Проект "${project.name || 'Без названия'}" удален навсегда`, 'success');
    
  } catch (error) {
    console.error('Ошибка окончательного удаления проекта:', error);
    showNotification('Ошибка при окончательном удалении проекта', 'error');
  }
}

async function permanentDeleteMessage(messageId) {
  if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить это сообщение? Это действие нельзя отменить!')) {
    return;
  }
  
  try {
    const messageIndex = pendingDeletionMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      showNotification('Сообщение не найдено в корзине', 'error');
      return;
    }
    
    // Удаляем из Firebase окончательно
    await window.db.collection('chat-messages').doc(messageId).delete();
    
    // Удаляем из корзины
    pendingDeletionMessages.splice(messageIndex, 1);
    localStorage.setItem('pendingDeletionMessages', JSON.stringify(pendingDeletionMessages));
    
    renderPendingMessages();
    updatePendingStats();
    
    showNotification('Сообщение удалено навсегда', 'success');
    
  } catch (error) {
    console.error('Ошибка окончательного удаления сообщения:', error);
    showNotification('Ошибка при окончательном удалении сообщения', 'error');
  }
}

// Массовое восстановление
async function restoreAllItems(type) {
  if (!confirm(`Вы уверены, что хотите восстановить все ${type === 'users' ? 'пользователей' : type === 'projects' ? 'проекты' : 'сообщения'}?`)) {
    return;
  }
  
  try {
    let count = 0;
    
    if (type === 'users') {
      count = pendingDeletionUsers.length;
      pendingDeletionUsers.forEach(user => {
        delete user.deletedAt;
        delete user.deletedBy;
        allUsers.push(user);
      });
      pendingDeletionUsers = [];
      localStorage.setItem('pendingDeletionUsers', JSON.stringify(pendingDeletionUsers));
      renderUsers(allUsers);
      renderPendingUsers();
    } else if (type === 'projects') {
      count = pendingDeletionProjects.length;
      pendingDeletionProjects.forEach(project => {
        delete project.deletedAt;
        delete project.deletedBy;
        allProjects.push(project);
      });
      pendingDeletionProjects = [];
      localStorage.setItem('pendingDeletionProjects', JSON.stringify(pendingDeletionProjects));
      renderProjects(allProjects);
      renderPendingProjects();
    } else if (type === 'messages') {
      count = pendingDeletionMessages.length;
      pendingDeletionMessages.forEach(message => {
        delete message.deletedAt;
        delete message.deletedBy;
        allMessages.push(message);
      });
      pendingDeletionMessages = [];
      localStorage.setItem('pendingDeletionMessages', JSON.stringify(pendingDeletionMessages));
      renderMessages(allMessages);
      renderPendingMessages();
    }
    
    updateStats();
    updatePendingStats();
    
    showNotification(`Восстановлено ${count} элементов`, 'success');
    
  } catch (error) {
    console.error('Ошибка массового восстановления:', error);
    showNotification('Ошибка при массовом восстановлении', 'error');
  }
}

// Очистка всех элементов на удалении
async function clearAllPendingDeletion() {
  if (!confirm('Вы уверены, что хотите НАВСЕГДА удалить ВСЕ элементы из корзины? Это действие нельзя отменить!')) {
    return;
  }
  
  try {
    const totalCount = pendingDeletionUsers.length + pendingDeletionProjects.length + pendingDeletionMessages.length;
    
    pendingDeletionUsers = [];
    pendingDeletionProjects = [];
    pendingDeletionMessages = [];
    
    localStorage.setItem('pendingDeletionUsers', JSON.stringify(pendingDeletionUsers));
    localStorage.setItem('pendingDeletionProjects', JSON.stringify(pendingDeletionProjects));
    localStorage.setItem('pendingDeletionMessages', JSON.stringify(pendingDeletionMessages));
    
    renderPendingUsers();
    renderPendingProjects();
    renderPendingMessages();
    updatePendingStats();
    
    showNotification(`Удалено навсегда ${totalCount} элементов`, 'success');
    
  } catch (error) {
    console.error('Ошибка очистки корзины:', error);
    showNotification('Ошибка при очистке корзины', 'error');
  }
}

// Функции поиска в корзине
function filterPendingUsers() {
  const searchTerm = document.getElementById('pending-users-search').value.toLowerCase();
  const filteredUsers = pendingDeletionUsers.filter(user => 
    (user.displayName || '').toLowerCase().includes(searchTerm) ||
    (user.email || '').toLowerCase().includes(searchTerm)
  );
  
  // Временно заменяем массив для отображения
  const originalUsers = [...pendingDeletionUsers];
  pendingDeletionUsers = filteredUsers;
  renderPendingUsers();
  pendingDeletionUsers = originalUsers;
}

function filterPendingProjects() {
  const searchTerm = document.getElementById('pending-projects-search').value.toLowerCase();
  const filteredProjects = pendingDeletionProjects.filter(project => 
    (project.name || '').toLowerCase().includes(searchTerm) ||
    (project.authorName || '').toLowerCase().includes(searchTerm)
  );
  
  // Временно заменяем массив для отображения
  const originalProjects = [...pendingDeletionProjects];
  pendingDeletionProjects = filteredProjects;
  renderPendingProjects();
  pendingDeletionProjects = originalProjects;
}

function filterPendingMessages() {
  const searchTerm = document.getElementById('pending-messages-search').value.toLowerCase();
  const filteredMessages = pendingDeletionMessages.filter(message => 
    (message.user || '').toLowerCase().includes(searchTerm) ||
    (message.text || '').toLowerCase().includes(searchTerm)
  );
  
  // Временно заменяем массив для отображения
  const originalMessages = [...pendingDeletionMessages];
  pendingDeletionMessages = filteredMessages;
  renderPendingMessages();
  pendingDeletionMessages = originalMessages;
}



console.log('Админ панель инициализирована');

// ========== ЭКСПОРТ ФУНКЦИЙ ДЛЯ ONCLICK АТРИБУТОВ ==========
// Делаем функции доступными глобально для onclick атрибутов в HTML

// Основные функции управления
window.generateQuickReport = generateQuickReport;
window.showChartsModal = showChartsModal;
window.showAddTemplateModal = showAddTemplateModal;
window.closeModal = closeModal;

// Функции пользователей
window.viewUser = viewUser;
window.deleteUser = deleteUser;
window.changeUserRole = changeUserRole;

// Функции проектов
window.viewProject = viewProject;
window.deleteProject = deleteProject;

// Функции сообщений
window.deleteMessage = deleteMessage;

// Функции отчетов и шаблонов
window.useTemplate = useTemplate;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.downloadReport = downloadReport;
window.deleteReport = deleteReport;

// Функции корзины (мягкое удаление)
window.restoreUser = restoreUser;
window.restoreProject = restoreProject;
window.restoreMessage = restoreMessage;
window.permanentDeleteUser = permanentDeleteUser;
window.permanentDeleteProject = permanentDeleteProject;
window.permanentDeleteMessage = permanentDeleteMessage; 