// 插件核心邏輯

// 模式狀態 (射擊模式/炸彈模式)
let currentMode = 'shooting'; // 預設為射擊模式

// 炸彈文字儲存
let bombTextStorage = [];

// 儲存每個元素的命中次數
let elementHitCounts = new Map();
// 儲存每個父容器的能量
let parentEnergies = new Map();

// 插件 UI 元素
let shooterElement = null;
let controlPanelElement = null;
let counterElement = null;

// 物理模擬相關
let fallingElements = []; // 儲存正在掉落的元素及其物理狀態

// 儲存滑鼠的最後位置，用於射擊
let lastMouseX = 0;
let lastMouseY = 0;

let isDraggingShooter = false;
let dragStartX = 0;
let dragStartY = 0;
let shooterVX = 0;
let shooterVY = 0;
let shooterMoveInterval = null;
let shooterFriction = 0.95; // 慣性摩擦力

// 動態載入 Matter.js
(function loadMatterJS() {
  if (!window.Matter) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js';
    script.onload = () => { window._matterReady = true; initializeMatterPlugin(); };
    document.head.appendChild(script);
  } else {
    window._matterReady = true;
    initializeMatterPlugin();
  }
})();

function initializeMatterPlugin() {
  if (!window.Matter) return;
  const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;
  const engine = Engine.create();
  const world = engine.world;

  // 射擊體
  const shooter = Bodies.rectangle(window.innerWidth/2, window.innerHeight/2, 4, 4, { restitution: 0.7, friction: 0.05, label: 'shooter' });
  World.add(world, shooter);
  let shooterEl = document.createElement('div');
  shooterEl.style.position = 'fixed';
  shooterEl.style.width = '4px';
  shooterEl.style.height = '4px';
  shooterEl.style.background = '#888';
  shooterEl.style.zIndex = '9999';
  shooterEl.style.borderRadius = '1px';
  document.body.appendChild(shooterEl);

  // 地板
  let ground = Bodies.rectangle(window.innerWidth/2, window.innerHeight-10, window.innerWidth, 20, { isStatic: true });
  World.add(world, ground);

  // 目標框管理
  let targetBodies = [];
  function addVisibleTargets() {
    // 先找所有可見文字節點
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
        const rect = node.parentElement && node.parentElement.getBoundingClientRect();
        if (!rect || rect.width < 20 || rect.height < 10) return NodeFilter.FILTER_SKIP;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    const blockTags = ['DIV','SECTION','ARTICLE','MAIN','ASIDE','NAV','HEADER','FOOTER','P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE','TD','TH'];
    const added = new Set();
    while (node = walker.nextNode()) {
      let el = node.parentElement;
      while (el && !blockTags.includes(el.tagName)) {
        el = el.parentElement;
      }
      if (el && !el._matterBody && !added.has(el)) {
        added.add(el);
        el.classList.add('matter-target');
        el.style.outline = '2px dashed #0af';
        const rect = el.getBoundingClientRect();
        const body = Matter.Bodies.rectangle(
          rect.left + rect.width/2,
          rect.top + rect.height/2,
          rect.width,
          rect.height,
          { isStatic: true, label: 'target', plugin: { el, hp: 3 } }
        );
        el._matterBody = body;
        Matter.World.add(engine.world, body);
        targetBodies.push(body);
      }
    }
  }
  addVisibleTargets();
  window.addEventListener('scroll', addVisibleTargets);
  window.addEventListener('resize', addVisibleTargets);
  document.addEventListener('DOMContentLoaded', addVisibleTargets);

  // 地板 DOM
  let groundEl = document.createElement('div');
  groundEl.style.position = 'fixed';
  groundEl.style.left = '0px';
  groundEl.style.width = '100vw';
  groundEl.style.height = '20px';
  groundEl.style.bottom = '0px';
  groundEl.style.background = '#222';
  groundEl.style.zIndex = '9998';
  document.body.appendChild(groundEl);

  // 目標框自動標記
  document.querySelectorAll('p, h2, h3, div').forEach(el => {
    if (!el.classList.contains('matter-target') && el.offsetHeight > 20 && el.offsetWidth > 40) {
      el.classList.add('matter-target');
      el.style.outline = '2px dashed #0af';
    }
  });

  // 滑鼠加速度控制
  let mouseDown = false;
  let mouseX = window.innerWidth/2, mouseY = window.innerHeight/2;
  window.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
  window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Matter.js 運行
  Runner.run(engine);

  // 動畫渲染
  function renderLoop() {
    // 射擊體位置
    shooterEl.style.left = (shooter.position.x - 2) + 'px';
    shooterEl.style.top = (shooter.position.y - 2) + 'px';
    // 地板位置
    Matter.Body.setPosition(ground, { x: window.innerWidth/2, y: window.innerHeight-10 });
    groundEl.style.top = (window.innerHeight-20) + 'px';
    // 目標框位置同步
    targetBodies.forEach(body => {
      if (body.plugin && body.plugin.el) {
        const el = body.plugin.el;
        const x = body.position.x - body.bounds.min.x;
        const y = body.position.y - body.bounds.min.y;
        el.style.position = 'fixed';
        el.style.left = (body.position.x - body.bounds.max.x + body.bounds.min.x/2) + 'px';
        el.style.top = (body.position.y - body.bounds.max.y + body.bounds.min.y/2) + 'px';
      }
    });
    requestAnimationFrame(renderLoop);
  }
  renderLoop();

  // 持續朝滑鼠方向施加力
  setInterval(() => {
    if (mouseDown) {
      const dx = mouseX - shooter.position.x;
      const dy = mouseY - shooter.position.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 10) {
        Body.applyForce(shooter, shooter.position, { x: dx/len*0.002, y: dy/len*0.002 });
      }
    }
  }, 16);

  // 射擊文字功能
  function shootText(char) {
    const shooterPos = shooter.position;
    const dx = mouseX - shooterPos.x;
    const dy = mouseY - shooterPos.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const speed = 12;
    const vx = (dx/len) * speed;
    const vy = (dy/len) * speed;
    const bullet = Bodies.circle(shooterPos.x, shooterPos.y, 10, {
      restitution: 0.2, friction: 0.05, label: 'bullet', plugin: { char }
    });
    World.add(world, bullet);
    let bulletEl = document.createElement('span');
    bulletEl.className = 'matter-bullet';
    bulletEl.textContent = char;
    bulletEl.style.fontSize = '1.2rem';
    bulletEl.style.zIndex = '9999';
    bulletEl.style.position = 'fixed';
    document.body.appendChild(bulletEl);
    bulletEl._matterBody = bullet;
    Body.setVelocity(bullet, { x: vx, y: vy });
  }

  // 攔截射擊事件（例如按下 a-z, 0-9, 符號）
  window.addEventListener('keydown', e => {
    if (currentMode === 'shooting' && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      shootText(e.key);
      e.preventDefault();
    }
  });

  // 子彈碰撞到目標框時停止並觸發攻擊
  Events.on(engine, 'collisionStart', function(event) {
    event.pairs.forEach(pair => {
      let bullet, target;
      if (pair.bodyA.label === 'bullet' && pair.bodyB.label === 'target') {
        bullet = pair.bodyA; target = pair.bodyB;
      } else if (pair.bodyB.label === 'bullet' && pair.bodyA.label === 'target') {
        bullet = pair.bodyB; target = pair.bodyA;
      }
      if (bullet && target && target.plugin && target.plugin.hp > 0) {
        target.plugin.hp--;
        if (target.plugin.hp <= 0) {
          releaseElementText(target.plugin.el, target.position.x, target.position.y);
          World.remove(world, target);
          if (target.plugin.el) target.plugin.el.remove();
        }
        // 停止子彈
        World.remove(world, bullet);
        document.querySelectorAll('.matter-bullet').forEach(el => {
          if (el._matterBody === bullet) el.remove();
        });
      }
    });
  });

  // TODO: 炸彈釋放、碰撞、爆炸、掉落等進階互動
}

// 初始化插件
function initializePlugin() {
  console.log('插件已啟動');
  // 注入 UI
  injectUI();
  // 掃描 DOM 並識別目標元素
  identifyTargetElements();
  // 設定事件監聽器
  setupEventListeners();
  // 開始物理模擬循環
  startPhysicsLoop();
}

// 注入插件 UI
function injectUI() {
  // 創建射擊物元素並添加到頁面
  shooterElement = document.createElement('div');
  shooterElement.id = 'shooter';
  document.body.appendChild(shooterElement);

  // 創建控制面板 (包含模式切換圖標)
  controlPanelElement = document.createElement('div');
  controlPanelElement.id = 'control-panel';
  // 使用 emoji 作為圖標
  controlPanelElement.innerHTML = `
    <span id="shooting-mode-icon" class="mode-icon">🔫</span>
    <span id="bomb-mode-icon" class="mode-icon">💣</span>
  `;
  document.body.appendChild(controlPanelElement);

  // 創建計數器元素
  counterElement = document.createElement('div');
  counterElement.id = 'bomb-counter';
  counterElement.textContent = `炸彈文字: ${bombTextStorage.length}`;
  document.body.appendChild(counterElement);

  // 設定模式切換圖標的事件監聽器
  document.getElementById('shooting-mode-icon').addEventListener('click', () => switchMode('shooting'));
  document.getElementById('bomb-mode-icon').addEventListener('click', () => switchMode('bomb'));

  // 初始化模式圖標狀態
  updateModeIcons();
}

// 掃描 DOM 並識別目標元素
function identifyTargetElements() {
  // 遍歷所有元素（不只是特定標籤）
  const allElements = document.querySelectorAll('*');
  allElements.forEach(element => {
    // 跳過 script, style, link, meta, head, title, noscript 等不應包裹的元素
    if ([
      'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'BR', 'HR', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION', 'DATALIST', 'OBJECT', 'EMBED', 'PARAM', 'BASE', 'COL', 'COLGROUP', 'FRAME', 'FRAMESET', 'MAP', 'AREA', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TH', 'TD' 
    ].includes(element.tagName)) return;
    // 將每個文字節點包裹在 <span class="shootable-text">
    const childNodes = Array.from(element.childNodes);
    childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        const text = node.textContent;
        const frag = document.createDocumentFragment();
        for (let char of text) {
          const span = document.createElement('span');
          span.textContent = char;
          span.className = 'shootable-text';
          frag.appendChild(span);
        }
        element.replaceChild(frag, node);
      }
    });
  });
  // 監聽 shootable-text 點擊事件
  document.querySelectorAll('.shootable-text').forEach(span => {
    span.addEventListener('click', handleShootableTextClick);
  });
}

// 設定事件監聽器
function setupEventListeners() {
  // 滑鼠事件監聽器 (用於射擊物控制和炸彈施放)
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('click', handleClick); // 用於炸彈施放

  // 鍵盤事件監聽器 (用於觸發射擊和結束插件)
  document.addEventListener('keydown', handleKeyDown);
}

// 處理滑鼠按下事件 (用於射擊物控制)
function handleMouseDown(event) {
  if (currentMode === 'shooting' && event.button === 0) {
    isDraggingShooter = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    shooterVX = 0;
    shooterVY = 0;
    event.preventDefault();
  }
}

// 處理滑鼠移動事件 (用於射擊物控制和瞄準)
function handleMouseMove(event) {
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (isDraggingShooter) {
    // 拖曳方向決定射擊體移動速度
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    // 固定速度（可調整）
    const speed = 6;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len > 5) { // 有明顯拖曳才移動
      shooterVX = (dx / len) * speed;
      shooterVY = (dy / len) * speed;
    } else {
      shooterVX = 0;
      shooterVY = 0;
    }
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    // 啟動移動計時器
    if (!shooterMoveInterval) {
      shooterMoveInterval = setInterval(moveShooter, 16);
    }
  }
}

// 處理滑鼠釋放事件 (用於射擊物控制)
function handleMouseUp(event) {
  if (isDraggingShooter) {
    isDraggingShooter = false;
    // 拖曳結束後，射擊體繼續以目前速度滑行
    if (shooterMoveInterval) {
      clearInterval(shooterMoveInterval);
      shooterMoveInterval = null;
    }
    // 啟動慣性滑行動畫
    requestAnimationFrame(inertiaMoveShooter);
  }
}

function inertiaMoveShooter() {
  if (!shooterElement) return;
  let left = parseFloat(shooterElement.style.left || 0);
  let top = parseFloat(shooterElement.style.top || 0);
  left += shooterVX;
  top += shooterVY;
  shooterVX *= shooterFriction;
  shooterVY *= shooterFriction;
  // 邊界限制
  left = Math.max(0, Math.min(window.innerWidth - shooterElement.offsetWidth, left));
  top = Math.max(0, Math.min(window.innerHeight - shooterElement.offsetHeight, top));
  shooterElement.style.left = `${left}px`;
  shooterElement.style.top = `${top}px`;
  if (Math.abs(shooterVX) > 0.2 || Math.abs(shooterVY) > 0.2) {
    requestAnimationFrame(inertiaMoveShooter);
  } else {
    shooterVX = 0;
    shooterVY = 0;
  }
}

function moveShooter() {
  if (!shooterElement) return;
  let left = parseFloat(shooterElement.style.left || 0);
  let top = parseFloat(shooterElement.style.top || 0);
  left += shooterVX;
  top += shooterVY;
  // 邊界限制
  left = Math.max(0, Math.min(window.innerWidth - shooterElement.offsetWidth, left));
  top = Math.max(0, Math.min(window.innerHeight - shooterElement.offsetHeight, top));
  shooterElement.style.left = `${left}px`;
  shooterElement.style.top = `${top}px`;
}

// 處理滑鼠點擊事件 (用於炸彈施放)
function handleClick(event) {
  if (currentMode === 'bomb') {
    // 檢查炸彈數量
    if (bombTextStorage.length > 0) {
      // 在射擊物位置施放炸彈（炸彈文字從射擊物飛出並四散落下）
      const shooterRect = shooterElement.getBoundingClientRect();
      const shooterX = shooterRect.left + shooterRect.width / 2 + window.scrollX;
      const shooterY = shooterRect.top + shooterRect.height / 2 + window.scrollY;
      triggerBombEffect(shooterX, shooterY);
      // 重置炸彈文字儲存
      bombTextStorage = [];
      // 更新計數器
      updateCounter();
    }
  }
}

// 處理鍵盤按下事件 (用於觸發射擊和結束插件)
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    exitPlugin();
  } else if (currentMode === 'shooting') {
    const key = event.key;
    if (!event.ctrlKey && !event.altKey && !event.metaKey &&
      !['Shift','Control','Alt','Meta','CapsLock','Tab','Enter','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Insert','Delete','ContextMenu','ScrollLock','Pause','NumLock','PrintScreen'].includes(key)
      && key.length === 1
    ) {
      const shooterRect = shooterElement.getBoundingClientRect();
      const shooterX = shooterRect.left + shooterRect.width / 2 + window.scrollX;
      const shooterY = shooterRect.top + shooterRect.height / 2 + window.scrollY;
      // 射擊方向永遠指向滑鼠游標
      shootFlyingText(key, shooterX, shooterY, lastMouseX, lastMouseY, () => {
        bombTextStorage.push(key);
        updateCounter();
      });
      event.preventDefault();
    }
  }
}

// 切換模式
function switchMode(mode) {
  currentMode = mode;
  console.log(`切換到 ${currentMode} 模式`);
  // 更新 UI 顯示 (高亮當前模式圖標)
  updateModeIcons();
}

// 更新模式圖標的視覺狀態
function updateModeIcons() {
  const shootingIcon = document.getElementById('shooting-mode-icon');
  const bombIcon = document.getElementById('bomb-mode-icon');

  if (currentMode === 'shooting') {
    shootingIcon.classList.add('active');
    bombIcon.classList.remove('active');
    shootingIcon.style.fontSize = '2rem';
    bombIcon.style.fontSize = '1.5rem';
    shootingIcon.style.filter = 'drop-shadow(0 0 4px #0af)';
    bombIcon.style.filter = '';
  } else {
    bombIcon.classList.add('active');
    shootingIcon.classList.remove('active');
    bombIcon.style.fontSize = '2rem';
    shootingIcon.style.fontSize = '1.5rem';
    bombIcon.style.filter = 'drop-shadow(0 0 4px #fa0)';
    shootingIcon.style.filter = '';
  }
}

// 觸發射擊
function triggerShooting(mouseX, mouseY) {
  console.log(`觸發射擊，位置: (${mouseX}, ${mouseY})`);

  // 找到滑鼠游標下的元素
  const hitElement = document.elementFromPoint(mouseX, mouseY);

  // 檢查是否命中目標元素 (p, h2, h3, img)
  if (hitElement && (hitElement.tagName === 'P' || hitElement.tagName === 'H2' || hitElement.tagName === 'H3' || hitElement.tagName === 'IMG')) {
    console.log('命中目標:', hitElement.tagName, hitElement.textContent.substring(0, 20) + '...');

    // 獲取或生成元素的唯一 ID
    const elementId = hitElement.id || `element-${Math.random().toString(36).substr(2, 9)}`;
    if (!hitElement.id) {
      hitElement.id = elementId; // 為沒有 ID 的元素設置 ID
    }

    // 累積命中次數
    const currentHitCount = (elementHitCounts.get(elementId) || 0) + 1;
    elementHitCounts.set(elementId, currentHitCount);
    console.log(`元素 ${elementId} 命中次數: ${currentHitCount}`);

    // 計算所需的命中次數 (基於內容數量)
    let requiredHits = 5; // 圖片的預設命中次數
    if (hitElement.tagName !== 'IMG') {
      const textLength = hitElement.textContent.length;
      requiredHits = Math.max(5, Math.ceil(textLength / 20)); // 每 20 個字需要 1 次額外命中，最少 5 次
    }
    console.log(`元素 ${elementId} 所需命中次數: ${requiredHits}`);

    // 更新命中元素的視覺效果 (使用 CSS 過渡)
    hitElement.style.transition = 'transform 0.1s ease-in-out, outline 0.1s ease-in-out';
    hitElement.style.transform = 'scale(0.95)'; // 縮小效果
    hitElement.style.outline = '2px solid red'; // 添加紅色外框

    setTimeout(() => {
        hitElement.style.transform = 'scale(1)'; // 恢復大小
        hitElement.style.outline = ''; // 移除外框
    }, 200);


    // 尋找合適的父容器來累積能量 (例如，最近的 block 級元素)
    let parentElement = hitElement.parentElement;
    while (parentElement && !['DIV', 'ARTICLE', 'SECTION', 'MAIN', 'BODY'].includes(parentElement.tagName)) {
        parentElement = parentElement.parentElement;
    }

    if (parentElement) {
        const parentId = parentElement.id || `parent-${Math.random().toString(36).substr(2, 9)}`;
         if (!parentElement.id) {
            parentElement.id = parentId; // 為沒有 ID 的父元素設置 ID
        }

        // 累積父容器能量 (例如，每次命中增加能量)
        const currentEnergy = (parentEnergies.get(parentId) || 0) + 1;
        parentEnergies.set(parentId, currentEnergy);
        console.log(`父容器 ${parentId} 能量: ${currentEnergy}`);

        // 檢查父容器能量是否達到崩解閾值 (例如，達到元素所需命中次數的總和)
        // 這裡簡化為當前命中元素的所需命中次數
        if (currentEnergy >= requiredHits) {
            console.log(`父容器 ${parentId} 能量達到閾值，觸發崩解`);
            triggerParentCollapse(parentElement);
            // 重置父容器能量
            parentEnergies.delete(parentId);
            elementHitCounts.delete(elementId); // 崩解後重置元素命中次數
        }
    } else {
        console.log('未找到合適的父容器來累積能量');
    }

    // TODO: 實現命中後的物理效果 (例如，文字震動)
  } else {
    console.log('未命中目標元素');
  }
}


// 觸發父容器崩解效果
function triggerParentCollapse(parentElement) {
  console.log('觸發父容器崩解');

  // 獲取父容器的文字內容
  const textContent = parentElement.textContent;

  // 獲取父容器的位置和尺寸
  const rect = parentElement.getBoundingClientRect();
  const parentX = rect.left + window.scrollX;
  const parentY = rect.top + window.scrollY;

  // 將父容器從 DOM 中移除
  parentElement.remove();

  // 創建文字碎片並添加到 fallingElements
  for (let i = 0; i < textContent.length; i++) {
    const char = textContent[i];
    if (char.trim() === '') continue; // 忽略空白字元

    const charElement = document.createElement('span');
    charElement.textContent = char;
    charElement.style.position = 'absolute';
    charElement.style.left = `${parentX + rect.width / 2}px`; // 初始位置在父容器中心
    charElement.style.top = `${parentY + rect.height / 2}px`;
    charElement.style.pointerEvents = 'none'; // 避免干擾滑鼠事件
    charElement.style.userSelect = 'none'; // 避免文字被選取
    charElement.style.zIndex = '1000'; // 確保文字在最上層

    document.body.appendChild(charElement);

    // 為文字碎片添加初始物理狀態
    fallingElements.push({
      element: charElement,
      x: parentX + rect.width / 2,
      y: parentY + rect.height / 2,
      vx: (Math.random() - 0.5) * 10, // 隨機水平速度
      vy: (Math.random() - 0.5) * 10, // 隨機垂直速度
      gravity: 0.5, // 重力加速度
      alpha: 1, // 透明度
      fadeSpeed: 0.01 // 淡出速度
    });
  }
}

// 觸發炸彈效果
function triggerBombEffect(x, y) {
  console.log(`在 (${x}, ${y}) 施放炸彈`);
  // 將 bombTextStorage 內所有字元掉落到螢幕底部
  let chars = bombTextStorage.join('').split('');
  const total = chars.length;
  const spread = Math.min(120, window.innerWidth - 40);
  chars.forEach((char, i) => {
    const textElement = document.createElement('span');
    textElement.classList.add('falling-text');
    textElement.textContent = char;
    textElement.style.position = 'absolute';
    // 均勻分布在螢幕上方
    const tx = 20 + (i * spread / Math.max(1, total - 1));
    textElement.style.left = `${tx}px`;
    textElement.style.top = `${y}px`;
    textElement.style.pointerEvents = 'none';
    textElement.style.zIndex = '1000';
    textElement.style.fontSize = '2rem';
    document.body.appendChild(textElement);
    // 掉落動畫（不會自動消失）
    let vy = 0;
    let posY = y;
    function fall() {
      vy += 0.7;
      posY += vy;
      textElement.style.top = `${posY}px`;
      if (posY < window.innerHeight - 40) {
        requestAnimationFrame(fall);
      } else {
        textElement.style.top = `${window.innerHeight - 40}px`;
      }
    }
    fall();
  });
}

// 更新計數器 UI
function updateCounter() {
  if (counterElement) {
    counterElement.textContent = `炸彈文字: ${bombTextStorage.length}`;
  }
}

// 開始物理模擬循環
function startPhysicsLoop() {
  function gameLoop() {
    // 更新掉落元素的位置和狀態 (應用物理模擬)
    fallingElements.forEach(item => {
      item.vy += item.gravity; // 應用重力
      item.x += item.vx; // 更新水平位置
      item.y += item.vy; // 更新垂直位置
      item.alpha -= item.fadeSpeed; // 淡出

      // 更新元素樣式
      item.element.style.left = `${item.x}px`;
      item.element.style.top = `${item.y}px`;
      item.element.style.opacity = item.alpha;

      // 檢查是否超出螢幕或完成淡出
      if (item.y > window.innerHeight || item.alpha <= 0) {
        // 如果是，標記為待移除
        item.shouldRemove = true;
        item.element.remove(); // 從 DOM 中移除元素
      }
    });

    // 移除已完成掉落或淡出的元素
    fallingElements = fallingElements.filter(item => !item.shouldRemove);

    // 請求下一幀動畫
    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

// 結束插件
function exitPlugin() {
  console.log('插件已結束');
  // 移除 UI 元素
  if (shooterElement) shooterElement.remove();
  if (controlPanelElement) controlPanelElement.remove();
  if (counterElement) counterElement.remove();

  // 移除事件監聽器 (重要，防止內存洩漏)
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('click', handleClick);
  document.removeEventListener('keydown', handleKeyDown);

  // 停止物理模擬循環 (如果需要)
  // 清理其他狀態
}

function handleShootableTextClick(event) {
  if (currentMode !== 'shooting') return;
  event.stopPropagation();
  const targetSpan = event.target;
  // 取得目標位置
  const rect = targetSpan.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2 + window.scrollX;
  const targetY = rect.top + rect.height / 2 + window.scrollY;
  // 取得射擊物位置
  const shooterRect = shooterElement.getBoundingClientRect();
  const shooterX = shooterRect.left + shooterRect.width / 2 + window.scrollX;
  const shooterY = shooterRect.top + shooterRect.height / 2 + window.scrollY;
  // 產生飛行文字
  shootFlyingText(targetSpan.textContent, shooterX, shooterY, targetX, targetY);
}

function shootFlyingText(char, fromX, fromY, toX, toY, onHit) {
  const span = document.createElement('span');
  span.textContent = char;
  span.className = 'flying-text';
  span.style.position = 'absolute';
  span.style.left = `${fromX}px`;
  span.style.top = `${fromY}px`;
  span.style.pointerEvents = 'none';
  span.style.zIndex = '9999';
  document.body.appendChild(span);
  // 計算飛行向量
  const dx = toX - fromX;
  const dy = toY - fromY;
  const steps = 30;
  let step = 0;
  function animate() {
    step++;
    const progress = step / steps;
    // 線性插值
    span.style.left = `${fromX + dx * progress}px`;
    span.style.top = `${fromY + dy * progress}px`;
    if (step < steps) {
      requestAnimationFrame(animate);
    } else {
      // 到達目標後掉落
      if (typeof onHit === 'function') onHit();
      startFallingText(span, toX, toY);
    }
  }
  animate();
}

function startFallingText(span, startX, startY) {
  let x = startX;
  let y = startY;
  let vy = 0;
  const gravity = 0.8;
  function fall() {
    vy += gravity;
    y += vy;
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    if (y < window.innerHeight) {
      requestAnimationFrame(fall);
    } else {
      span.remove();
    }
  }
  fall();
}

// 插件啟動時執行初始化
initializePlugin();