// Инициализация Firebase (заглушка)
// Для работы нужен реальный config из Firebase Console

// Подключение через CDN (вставьте в <head> вашего HTML):
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>

// Конфигурация (замените на свою)
const firebaseConfig = {
    apiKey: "AIzaSyDWosDr8lRwaX6osiBRCUPV6kQSAKobSt0",
    authDomain: "livecodecollab-v2-0.firebaseapp.com",
    projectId: "livecodecollab-v2-0",
    storageBucket: "livecodecollab-v2-0.firebasestorage.app",
    messagingSenderId: "870679952062",
    appId: "1:870679952062:web:f81a945ed33a117d9bfcef"
};

// Инициализация
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
window.auth = auth;

// Firestore
const db = firebase.firestore();
window.db = db;
