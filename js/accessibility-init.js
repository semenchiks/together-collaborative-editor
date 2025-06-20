/**
 * Простой скрипт для инициализации доступности на любой странице
 * Подключается как обычный script без модулей
 */

// Проверяем, загружен ли Font Awesome, если нет - загружаем
if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);
}

// Класс AccessibilityManager (упрощенная версия)
class SimpleAccessibilityManager {
    constructor() {
        this.settings = {
            fontSize: 'normal',
            contrast: 'normal', 
            colorblind: 'normal',
            animations: true,
        };

        this.loadSettings();
        this.injectHTML();
        this.injectCSS();
        this.initPanel();
        this.applySettings();
    }

    injectHTML() {
        if (document.getElementById('accessibility-btn')) return;

        const html = `
            <svg style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true">
                <defs>
                    <filter id="protanopia-filter">
                        <feColorMatrix type="matrix" values="0.367, 0.633, 0, 0, 0, 0.367, 0.633, 0, 0, 0, 0, 0.167, 0.833, 0, 0, 0, 0, 0, 1, 0" />
                    </filter>
                    <filter id="deuteranopia-filter">
                        <feColorMatrix type="matrix" values="0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0, 0, 0, 0, 1, 0" />
                    </filter>
                    <filter id="tritanopia-filter">
                        <feColorMatrix type="matrix" values="1, 0, 0, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0, 1, 0" />
                    </filter>
                </defs>
            </svg>
            
            <button id="accessibility-btn" class="accessibility-btn" aria-label="Настройки доступности">
                <i class="fas fa-universal-access"></i>
            </button>
            
            <div id="accessibility-panel" class="accessibility-panel">
                <h3>Настройки доступности</h3>
                
                <div class="accessibility-section">
                    <h4>Размер шрифта</h4>
                    <div class="accessibility-btn-group">
                        <button id="font-normal" class="font-size-btn active">Обычный</button>
                        <button id="font-large" class="font-size-btn">Большой</button>
                        <button id="font-xlarge" class="font-size-btn">Очень большой</button>
                    </div>
                </div>
                
                <div class="accessibility-section">
                    <h4>Контрастность</h4>
                    <div class="accessibility-btn-group">
                        <button id="contrast-normal" class="contrast-btn active">Обычная</button>
                        <button id="contrast-high" class="contrast-btn">Высокая</button>
                    </div>
                </div>
                
                <div class="accessibility-section">
                    <h4>Режим для дальтонизма</h4>
                    <select id="colorblind-mode" class="accessibility-select">
                        <option value="normal">Обычный режим</option>
                        <option value="protanopia">Протанопия (не видит красный)</option>
                        <option value="deuteranopia">Дейтеранопия (не видит зеленый)</option>
                        <option value="tritanopia">Тританопия (не видит синий)</option>
                    </select>
                </div>
                
                <div class="accessibility-section">
                    <h4>Анимации</h4>
                    <div class="accessibility-toggle">
                        <input type="checkbox" id="animations-toggle" checked>
                        <label for="animations-toggle">Включить анимации</label>
                    </div>
                </div>
                
                <button id="accessibility-reset" class="accessibility-reset">Сбросить настройки</button>
            </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', html);
    }

    injectCSS() {
        if (document.getElementById('accessibility-styles')) return;

        const css = `
            .accessibility-btn {
                position: fixed; top: 80px; right: 20px; width: 50px; height: 50px;
                background: #ffe000; border: none; border-radius: 50%; cursor: pointer;
                z-index: 9999; display: flex; align-items: center; justify-content: center;
                font-size: 20px; color: #222; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transition: all 0.3s ease;
            }
            .accessibility-btn:hover { background: #ffd600; transform: scale(1.1); }
            .accessibility-btn:focus { outline: 3px solid #0066cc; outline-offset: 2px; }
            
            .accessibility-panel {
                position: fixed; top: 140px; right: 20px; width: 300px; background: #fff;
                border: 2px solid #ffe000; border-radius: 12px; padding: 20px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15); z-index: 9998; display: none;
                max-height: 70vh; overflow-y: auto;
            }
            .accessibility-panel.show { display: block; }
            .accessibility-panel h3 { margin: 0 0 20px 0; color: #222; font-size: 1.2em; font-weight: 700; }
            .accessibility-panel h4 { margin: 0 0 10px 0; color: #444; font-size: 1em; font-weight: 600; }
            .accessibility-section { margin-bottom: 20px; }
            .accessibility-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
            
            .font-size-btn, .contrast-btn {
                padding: 8px 12px; border: 2px solid #ddd; background: #fff;
                border-radius: 6px; cursor: pointer; font-size: 0.9em; transition: all 0.2s ease;
            }
            .font-size-btn:hover, .contrast-btn:hover { border-color: #ffe000; background: #fff7d6; }
            .font-size-btn.active, .contrast-btn.active {
                background: #ffe000; border-color: #ffe000; color: #222; font-weight: 600;
            }
            
            .accessibility-select {
                width: 100%; padding: 8px 12px; border: 2px solid #ddd;
                border-radius: 6px; font-size: 0.9em; background: #fff;
            }
            .accessibility-select:focus { border-color: #ffe000; outline: none; }
            
            .accessibility-toggle { display: flex; align-items: center; gap: 8px; }
            .accessibility-toggle input[type="checkbox"] { width: 18px; height: 18px; accent-color: #ffe000; }
            .accessibility-toggle label { font-size: 0.9em; color: #444; cursor: pointer; }
            
            .accessibility-reset {
                width: 100%; padding: 10px; background: #ff4444; color: #fff;
                border: none; border-radius: 6px; cursor: pointer; font-size: 0.9em;
                font-weight: 600; margin-top: 10px;
            }
            .accessibility-reset:hover { background: #cc3333; }
            
            html.font-size-large { font-size: 1.25em; }
            html.font-size-xlarge { font-size: 1.5em; }
            html.contrast-high { filter: contrast(1.4) brightness(1.1); }
            html.contrast-high body { background: #000 !important; color: #fff !important; }
            html.reduce-animations * { 
                animation: none !important; 
                transition: none !important; 
                transform: none !important;
            }
            html.reduce-animations .yellow-shape,
            html.reduce-animations .shape1,
            html.reduce-animations .shape2,
            html.reduce-animations .shape3,
            html.reduce-animations .shape4,
            html.reduce-animations .shape5,
            html.reduce-animations .shape6 {
                animation: none !important;
                transform: none !important;
            }
            /* Применяем фильтры дальтонизма селективно, исключая интерактивные элементы */
            html.colorblind-protanopia body::before,
            html.colorblind-protanopia body::after,
            html.colorblind-protanopia .container::before,
            html.colorblind-protanopia .container::after,
            html.colorblind-protanopia .right,
            html.colorblind-protanopia .editor-header,
            html.colorblind-protanopia .accessibility-panel,
            html.colorblind-protanopia .accessibility-btn,
            html.colorblind-protanopia .login-modal { filter: url(#protanopia-filter); }
            
            html.colorblind-deuteranopia body::before,
            html.colorblind-deuteranopia body::after,
            html.colorblind-deuteranopia .container::before,
            html.colorblind-deuteranopia .container::after,
            html.colorblind-deuteranopia .right,
            html.colorblind-deuteranopia .editor-header,
            html.colorblind-deuteranopia .accessibility-panel,
            html.colorblind-deuteranopia .accessibility-btn,
            html.colorblind-deuteranopia .login-modal { filter: url(#deuteranopia-filter); }
            
            html.colorblind-tritanopia body::before,
            html.colorblind-tritanopia body::after,
            html.colorblind-tritanopia .container::before,
            html.colorblind-tritanopia .container::after,
            html.colorblind-tritanopia .right,
            html.colorblind-tritanopia .editor-header,
            html.colorblind-tritanopia .accessibility-panel,
            html.colorblind-tritanopia .accessibility-btn,
            html.colorblind-tritanopia .login-modal { filter: url(#tritanopia-filter); }
            
            /* Специальные стили для редакторов в режимах дальтонизма */
            html.colorblind-protanopia .monaco-editor .view-lines,
            html.colorblind-protanopia .monaco-editor .overflow-guard { filter: url(#protanopia-filter); }
            html.colorblind-deuteranopia .monaco-editor .view-lines,
            html.colorblind-deuteranopia .monaco-editor .overflow-guard { filter: url(#deuteranopia-filter); }
            html.colorblind-tritanopia .monaco-editor .view-lines,
            html.colorblind-tritanopia .monaco-editor .overflow-guard { filter: url(#tritanopia-filter); }
            
            /* Убеждаемся, что основные контейнеры редакторов остаются интерактивными */
            html.colorblind-protanopia .monaco-editor,
            html.colorblind-deuteranopia .monaco-editor,
            html.colorblind-tritanopia .monaco-editor { filter: none !important; pointer-events: auto !important; }
            
            @media (max-width: 768px) {
                .accessibility-panel { right: 10px; left: 10px; width: auto; top: 120px; }
                .accessibility-btn { right: 15px; top: 70px; width: 45px; height: 45px; font-size: 18px; }
            }
        `;

        const style = document.createElement('style');
        style.id = 'accessibility-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    initPanel() {
        const btn = document.getElementById('accessibility-btn');
        const panel = document.getElementById('accessibility-panel');

        btn.addEventListener('click', () => {
            panel.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !btn.contains(e.target) && panel.classList.contains('show')) {
                panel.classList.remove('show');
            }
        });

        // Размер шрифта
        document.getElementById('font-normal').addEventListener('click', () => this.setFontSize('normal'));
        document.getElementById('font-large').addEventListener('click', () => this.setFontSize('large'));
        document.getElementById('font-xlarge').addEventListener('click', () => this.setFontSize('xlarge'));

        // Контрастность
        document.getElementById('contrast-normal').addEventListener('click', () => this.setContrast('normal'));
        document.getElementById('contrast-high').addEventListener('click', () => this.setContrast('high'));

        // Дальтонизм
        document.getElementById('colorblind-mode').addEventListener('change', (e) => {
            this.settings.colorblind = e.target.value;
            this.applySettings();
            this.saveSettings();
        });

        // Анимации
        document.getElementById('animations-toggle').addEventListener('change', (e) => {
            this.settings.animations = e.target.checked;
            this.applySettings();
            this.saveSettings();
        });

        // Сброс
        document.getElementById('accessibility-reset').addEventListener('click', () => this.resetSettings());
    }

    setFontSize(size) {
        this.settings.fontSize = size;
        this.applySettings();
        this.saveSettings();
        this.updateButtons();
    }

    setContrast(contrast) {
        this.settings.contrast = contrast;
        this.applySettings();
        this.saveSettings();
        this.updateButtons();
    }

    updateButtons() {
        document.querySelectorAll('.font-size-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.contrast-btn').forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(`font-${this.settings.fontSize}`).classList.add('active');
        document.getElementById(`contrast-${this.settings.contrast}`).classList.add('active');
        document.getElementById('colorblind-mode').value = this.settings.colorblind;
        document.getElementById('animations-toggle').checked = this.settings.animations;
    }

    applySettings() {
        const html = document.documentElement;

        html.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge');
        html.classList.add(`font-size-${this.settings.fontSize}`);

        html.classList.remove('contrast-normal', 'contrast-high');
        html.classList.add(`contrast-${this.settings.contrast}`);

        html.classList.remove('colorblind-normal', 'colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia');
        html.classList.add(`colorblind-${this.settings.colorblind}`);

        if (this.settings.animations) {
            html.classList.remove('reduce-animations');
        } else {
            html.classList.add('reduce-animations');
        }

        this.updateButtons();
    }

    saveSettings() {
        try {
            localStorage.setItem('accessibility-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('Ошибка сохранения настроек доступности:', e);
        }
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('accessibility-settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error('Ошибка загрузки настроек доступности:', e);
        }
    }

    resetSettings() {
        this.settings = { fontSize: 'normal', contrast: 'normal', colorblind: 'normal', animations: true };
        this.applySettings();
        this.saveSettings();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    if (!window.accessibilityManager) {
        window.accessibilityManager = new SimpleAccessibilityManager();
    }
}); 