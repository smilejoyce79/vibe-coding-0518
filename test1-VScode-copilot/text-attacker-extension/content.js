// 全局狀態
let isEnabled = false; // 擴充功能啟用狀態
let currentMode = null; // 當前攻擊模式

// 創建控制按鈕
function createControls() {
    const controls = document.createElement('div');
    controls.className = 'text-attacker-controls';

    // 開關按鈕
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'text-attacker-btn toggle-btn';
    toggleBtn.innerHTML = '🎮';
    toggleBtn.title = '開啟/關閉文字攻擊模式';

    const bombBtn = document.createElement('button');
    bombBtn.className = 'text-attacker-btn bomb-btn';
    bombBtn.innerHTML = '💣';
    bombBtn.title = '炸彈攻擊';
    bombBtn.disabled = true;

    const shootBtn = document.createElement('button');
    shootBtn.className = 'text-attacker-btn shoot-btn';
    shootBtn.innerHTML = '🎯';
    shootBtn.title = '射擊攻擊';
    shootBtn.disabled = true;

    controls.appendChild(toggleBtn);
    controls.appendChild(bombBtn);
    controls.appendChild(shootBtn);
    document.body.appendChild(controls);

    return { toggleBtn, bombBtn, shootBtn };
}

// 更新所有按鈕狀態
function updateButtonsState(buttons) {
    const { toggleBtn, bombBtn, shootBtn } = buttons;
    
    // 更新開關按鈕外觀
    toggleBtn.style.backgroundColor = isEnabled ? '#44ff44' : '#666666';
    
    // 啟用/禁用攻擊按鈕
    bombBtn.disabled = !isEnabled;
    shootBtn.disabled = !isEnabled;
    
    // 更新攻擊按鈕外觀
    bombBtn.style.opacity = isEnabled ? '1' : '0.5';
    shootBtn.style.opacity = isEnabled ? '1' : '0.5';
    
    // 更新當前選中的攻擊模式按鈕
    if (isEnabled) {
        bombBtn.style.transform = currentMode === 'bomb' ? 'scale(1.1)' : 'scale(1)';
        shootBtn.style.transform = currentMode === 'shoot' ? 'scale(1.1)' : 'scale(1)';
        bombBtn.style.boxShadow = currentMode === 'bomb' ? '0 0 10px rgba(255, 255, 0, 0.5)' : 'none';
        shootBtn.style.boxShadow = currentMode === 'shoot' ? '0 0 10px rgba(255, 255, 0, 0.5)' : 'none';
    } else {
        bombBtn.style.transform = 'scale(1)';
        shootBtn.style.transform = 'scale(1)';
        bombBtn.style.boxShadow = 'none';
        shootBtn.style.boxShadow = 'none';
    }
}

// 切換擴充功能啟用狀態
function toggleExtension(buttons) {
    isEnabled = !isEnabled;
    currentMode = null;
    document.body.style.cursor = 'default';
    updateButtonsState(buttons);
}

// 切換攻擊模式
function toggleAttackMode(mode, buttons) {
    if (!isEnabled) return;
    
    currentMode = currentMode === mode ? null : mode;
    document.body.style.cursor = currentMode ? 'crosshair' : 'default';
    updateButtonsState(buttons);
}

// 處理點擊事件
function handleClick(e, buttons) {
    // 如果擴充功能已啟用，阻止所有連結和按鈕的預設行為
    if (isEnabled) {
        const clickedElement = e.target.closest('a, button');
        // 排除我們的控制按鈕
        if (clickedElement && !clickedElement.closest('.text-attacker-controls')) {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件繼續傳播
        }
    }

    // 如果沒有選擇攻擊模式，不執行後續操作
    if (!isEnabled || !currentMode) return;
    
    // 忽略控制按鈕的點擊
    if (e.target.closest('.text-attacker-controls')) return;

    // 確保點擊的是文字元素
    if (e.target.nodeType === Node.TEXT_NODE || 
        e.target.childNodes.length === 0 || 
        e.target === document.body) return;

    if (currentMode === 'bomb') {
        explodeText(e.target);
    } else if (currentMode === 'shoot') {
        shootText(e.target);
    }
}

// 炸彈效果
function explodeText(element) {
    const text = element.textContent;
    const rect = element.getBoundingClientRect();
    
    // 創建文字碎片
    const fragments = text.split('').map((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.className = 'text-fragment';
        span.style.position = 'fixed';
        span.style.left = `${rect.left + (i * 10)}px`;
        span.style.top = `${rect.top}px`;
        return span;
    });

    // 添加碎片到頁面
    fragments.forEach(fragment => {
        document.body.appendChild(fragment);
        
        // 隨機方向的爆炸效果
        requestAnimationFrame(() => {
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 100;
            fragment.style.transform = `translate(
                ${Math.cos(angle) * distance}px,
                ${Math.sin(angle) * distance}px
            ) rotate(${Math.random() * 360}deg)`;
            fragment.style.opacity = '0';
        });
    });

    // 清理碎片和原始元素
    element.classList.add('exploding');
    setTimeout(() => {
        fragments.forEach(f => f.remove());
        element.style.visibility = 'hidden';
    }, 500);
}

// 射擊效果
function shootText(element) {
    element.classList.add('shooting');
    setTimeout(() => {
        element.style.visibility = 'hidden';
    }, 300);
}

// 初始化
function init() {
    const buttons = createControls();
    
    // 設置開關按鈕事件
    buttons.toggleBtn.addEventListener('click', () => toggleExtension(buttons));
    
    // 設置攻擊按鈕事件
    buttons.bombBtn.addEventListener('click', () => toggleAttackMode('bomb', buttons));
    buttons.shootBtn.addEventListener('click', () => toggleAttackMode('shoot', buttons));
    
    // 設置全局點擊事件（使用捕獲階段來確保最先處理事件）
    document.addEventListener('click', (e) => handleClick(e, buttons), true);
    
    // 初始化按鈕狀態
    updateButtonsState(buttons);
}

// 啟動擴充功能
init();
