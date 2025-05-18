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
    script.onload = () => { window._matterReady = true; initializeMatterPlugin(); initializePlugin(); };
    document.head.appendChild(script);
  } else {
    window._matterReady = true;
    initializeMatterPlugin();
    initializePlugin();
  }
})();

function initializeMatterPlugin() {
  console.log('initializeMatterPlugin 函式被呼叫'); // 偵錯日誌
  if (!window.Matter) return;
  const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;
  const engine = Engine.create();
  window._matterEngine = engine;
  const world = engine.world;

  // Inject UI elements
  injectUI();

  // Setup event listeners
  setupEventListeners();

  // 射擊體（灰色方塊，僅移動，不受重力與碰撞影響）
  // Removed conflicting shooter DOM creation. The shooter DOM element is now created in injectUI.

  // 地板
  let ground = Bodies.rectangle(window.innerWidth/2, window.innerHeight-10, window.innerWidth, 20, { isStatic: true });
  World.add(world, ground);

  // 目標框管理
  let targetBodies = [];
  function addVisibleTargets() {
    // 先找所有可見文字節點
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        // Basic filter: avoid script/style tags, and very short texts
        if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue || node.nodeValue.trim().length < 3) { // Ignore very short or empty text nodes
            return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    const blockTags = ['DIV','SECTION','ARTICLE','MAIN','ASIDE','NAV','HEADER','FOOTER','P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE','TD','TH', 'SPAN', 'A']; // Added SPAN and A
    const added = new Set(); // Keep track of elements already added to Matter world
    while (node = walker.nextNode()) {
      let el = node.parentElement;
      let potentialTarget = null;
      // Traverse up to find a suitable block-level or significant inline-level parent
      while (el && el !== document.body) {
        if (blockTags.includes(el.tagName)) {
            potentialTarget = el;
            break;
        }
        el = el.parentElement;
      }
      if (!potentialTarget && node.parentElement !== document.body) { // If no block tag found, consider direct parent if it's not body
        potentialTarget = node.parentElement;
      }

      if (potentialTarget && !potentialTarget._matterBody && !added.has(potentialTarget)) {
        const rect = potentialTarget.getBoundingClientRect();
        // Filter for visible elements of a certain size
        if (rect.width > 20 && rect.height > 10 && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0) {
          const bodyWidth = rect.width;
          const bodyHeight = rect.height;
          const body = Bodies.rectangle(
            rect.left + bodyWidth / 2 + window.scrollX,
            rect.top + bodyHeight / 2 + window.scrollY,
            bodyWidth,
            bodyHeight,
            { isStatic: true, label: 'target', plugin: { el: potentialTarget, hp: 5 } } // 設定 isStatic 為 true, label 為 'target', 加入 plugin 儲存 DOM 元素和生命值
          );
          potentialTarget._matterBody = body;
          body.domElement = potentialTarget; // 將 DOM 元素儲存在 body 的 domElement 屬性中
          body.domWidth = bodyWidth;   // Store original dimensions
          body.domHeight = bodyHeight;  // Store original dimensions

          World.add(world, body);
          // targetBodies.push(body); // targetBodies array seems unused in renderLoop, Composite.allBodies is sufficient
          added.add(potentialTarget);
        }
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

  // 目標框自動標記 (此段程式碼似乎未被使用，且與 Matter.js 的目標處理邏輯重複，暫時保留但需注意)
  document.querySelectorAll('p, h2, h3, div').forEach(el => {
    if (!el.classList.contains('matter-target') && el.offsetHeight > 20 && el.offsetWidth > 40) {
      el.classList.add('matter-target');
      el.style.outline = '2px dashed #0af';
    }
  });

  // 滑鼠推動射擊體移動 (此段程式碼似乎與 Matter.js 的射擊體控制邏輯重複，暫時保留但需注意)

  // Matter.js 運行
  Runner.run(engine);

  // Matter.js 內部滑鼠事件處理和射擊體位置更新
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let shooterX = window.innerWidth / 2; // 初始化射擊體位置
  let shooterY = window.innerHeight / 2; // 初始化射擊體位置

  window.addEventListener('mousedown', (e) => {
    if (currentMode === 'shooting' && e.button === 0) {
      mouseDown = true;
    }
  });

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      mouseDown = false;
    }
  });

  // 定時更新射擊體位置以跟隨滑鼠
  // 定時更新射擊體位置以跟隨滑鼠 (相對於文件)
  setInterval(() => {
    if (mouseDown) {
      // 計算從射擊體中心到滑鼠位置的向量 (滑鼠位置是視口座標，需要加上捲動偏移量轉換為文件座標)
      const shooterCenterX = shooterX + shooterElement.offsetWidth / 2;
      const shooterCenterY = shooterY + shooterElement.offsetHeight / 2;
      const targetMouseX = mouseX + window.scrollX;
      const targetMouseY = mouseY + window.scrollY;
      const dx = targetMouseX - shooterCenterX;
      const dy = targetMouseY - shooterCenterY;
      const len = Math.sqrt(dx * dx + dy * dy);

      const threshold = 1; // 很小的閾值
      const trackingSpeed = 8; // 恆定的移動速度 (每幀像素)
      const moveDistance = trackingSpeed; // 計算每幀移動距離

      if (len > threshold) {
        // 計算正規化的方向向量
        const dirX = dx / len;
        const dirY = dy / len;

        // 更新射擊體位置 (左上角座標，文件座標)
        shooterX += dirX * moveDistance;
        shooterY += dirY * moveDistance;
      } else {
        // 如果非常接近，直接設定位置對齊滑鼠中心 (文件座標)
        shooterX = targetMouseX - shooterElement.offsetWidth / 2;
        shooterY = targetMouseY - shooterElement.offsetHeight / 2;
      }
      // 同步 DOM 元素位置
      if (shooterElement && shooterElement.parentElement) {
          shooterElement.style.left = shooterX + 'px';
          shooterElement.style.top = shooterY + 'px';
      }
    }
  }, 1000 / 60); // 每秒更新 60 次

  // 射擊文字功能
  function shootText(char) {
    console.log(`shootText 函式被呼叫，字元: ${char}`); // 偵錯日誌
    // 使用滑鼠的當前位置計算方向 (滑鼠位置是視口座標，需要加上捲動偏移量轉換為文件座標)
    const targetMouseX = mouseX + window.scrollX;
    const targetMouseY = mouseY + window.scrollY;
    const dx = targetMouseX - (shooterX + shooterElement.offsetWidth / 2); // 使用射擊體中心的文件座標
    const dy = targetMouseY - (shooterY + shooterElement.offsetHeight / 2); // 使用射擊體中心的文件座標
    const len = Math.sqrt(dx*dx + dy*dy);
    const speed = 12;
    let vx = 0, vy = 0;
    if (len > 0) { // 避免除以零
        vx = (dx/len) * speed;
        vy = (dy/len) * speed;
    }

    // 子彈的初始位置應該是射擊體中心的文件座標
    const bullet = Bodies.circle(shooterX + shooterElement.offsetWidth / 2, shooterY + shooterElement.offsetHeight / 2, 12, {
      restitution: 0.2, friction: 0.05, label: 'bullet', plugin: { char }
    });
    World.add(world, bullet);
    console.log(`Matter.js 子彈 body 已創建並加入世界，字元: ${char}`); // 偵錯日誌

    let bulletEl = document.createElement('span');
    bulletEl.className = 'matter-bullet';
    bulletEl.textContent = char;
    bulletEl.style.fontSize = '1.2rem';
    bulletEl.style.zIndex = '9999';
    bulletEl.style.position = 'fixed';
    document.body.appendChild(bulletEl);
    bullet.domElement = bulletEl; // 將 DOM 元素儲存在 body 的 domElement 屬性中
    console.log(`子彈 DOM 元素已創建並加入頁面，字元: ${char}`); // 偵錯日誌

    Body.setVelocity(bullet, { x: vx, y: vy });
    console.log(`子彈初始速度已設定: vx=${vx}, vy=${vy}`); // 偵錯日誌
  }

  // 攔截鍵盤射擊
  // 攔截鍵盤射擊
  window.addEventListener('keydown', e => {
    // 根據按下的鍵觸發射擊
    shootText(e.key);
  });

  // 子彈和追蹤物體碰撞到目標框時處理
  Events.on(engine, 'collisionStart', function(event) {
    event.pairs.forEach(pair => {
      // console.log('檢測到碰撞事件'); // 偵錯日誌
      let bodyA = pair.bodyA;
      let bodyB = pair.bodyB;

      // 檢查是否是子彈與目標的碰撞
      if ((bodyA.label === 'bullet' && bodyB.label === 'target') || (bodyB.label === 'bullet' && bodyA.label === 'target')) {
        let projectile = bodyA.label === 'bullet' ? bodyA : bodyB;
        let target = bodyA.label === 'target' ? bodyA : bodyB;

        // console.log(`物體 (${projectile.label}) 與目標 (${target.label}) 發生碰撞`); // 偵錯日誌
        // 移除物體的 Matter body 和 DOM 元素
        World.remove(world, projectile);
        // console.log(`${projectile.label} Matter body 已移除`); // 偵錯日誌
        if (projectile.domElement && projectile.domElement.parentElement) {
          projectile.domElement.remove();
          // console.log(`${projectile.label} DOM 元素已移除`); // 偵錯日誌
        }

        // 目標框生命值-1
        if (target.plugin && target.plugin.hp !== undefined) {
          // console.log(`目標 ${target.label} 碰撞前生命值: ${target.plugin.hp}`); // 偵錯日誌
          target.plugin.hp--;
          // console.log(`目標 ${target.label} 碰撞後剩餘生命值: ${target.plugin.hp}`); // 偵錯日誌
          if (target.plugin.hp <= 0) {
            console.log(`目標 ${target.label} 生命值歸零，觸發文字分解`); // 偵錯日誌
            // 從 Matter.js 世界中移除目標 body
            World.remove(world, target);
            console.log('目標 Matter body 已移除'); // 偵錯日誌
            // 觸發文字分解和物理效果
            breakDownTargetText(target);
          }
        }
      }

      // 檢查是否是掉落文字與地板的碰撞
      if ((bodyA.label === 'fallingChar' && bodyB === ground) || (bodyB.label === 'fallingChar' && bodyA === ground)) {
          let fallingCharBody = bodyA.label === 'fallingChar' ? bodyA : bodyB;
          // console.log(`掉落文字 (${fallingCharBody.label}) 與地板發生碰撞`); // 偵錯日誌
          // 標記為已落地並記錄時間
          if (!fallingCharBody.landedAt) {
              fallingCharBody.landedAt = Date.now();
              // console.log(`掉落文字已標記落地時間: ${fallingCharBody.landedAt}`); // 偵錯日誌
          }
      }
    });
  });

  // 動畫渲染（射擊體只做位置同步）
  function renderLoop() {
    // Sync shooter position
    // Sync shooter position (handled in afterUpdate)
    // if (shooterElement && shooterElement.parentElement) {
    //   shooterElement.style.left = (shooterX - shooterElement.offsetWidth/2) + 'px';
    //   shooterElement.style.top = (shooterY - shooterElement.offsetHeight/2) + 'px';
    // }
    // 只同步有 domElement 的 body（即每個炸出的字元和子彈）
    Composite.allBodies(world).forEach(body => {
      // 靜態元素不需要同步 DOM 位置，它們的 DOM 位置是固定的
      if (body.isStatic || !body.domElement || !body.domElement.parentElement) return;

      const el = body.domElement;
      const pos = body.position;
      const angle = body.angle;

      // 計算固定位置（相對於視口）
      // Matter.js 的位置是相對於世界原點，DOM 元素需要相對於視口定位
      const fixedX = pos.x - window.scrollX - (el.offsetWidth / 2);
      const fixedY = pos.y - window.scrollY - (el.offsetHeight / 2);

      el.style.position = 'fixed'; // 確保是固定定位
      el.style.left = fixedX + 'px';
      el.style.top = fixedY + 'px';
      el.style.transform = `rotate(${angle}rad)`;
      // 如果需要，添加 transform-origin 以確保圍繞中心旋轉
      el.style.transformOrigin = 'center center';
    });
    requestAnimationFrame(renderLoop);
  }
  renderLoop();

  // Removed conflicting setInterval logic that applied force to the Matter.js shooter body.

  // TODO: 炸彈釋放、碰撞、爆炸、掉落等進階互動

  // Matter.js Events: 每次更新後處理掉落文字、子彈和追蹤物體的移除以及 DOM 同步和追蹤邏輯
  Events.on(engine, 'afterUpdate', function() {
      const bodiesToRemove = [];
      const currentTime = Date.now();
      const removalDelay = 1000; // 1 秒延遲

      Matter.Composite.allBodies(engine.world).forEach(body => {
          // 檢查是否是掉落文字或炸彈文字，並且超出視口
          if ((body.label === 'fallingChar' || body.label === 'bombChar') && body.position.y > window.scrollY + window.innerHeight + 100) { // 添加緩衝區
              bodiesToRemove.push(body);
               // 移除對應的 DOM 元素
               if (body.domElement && body.domElement.parentElement) {
                   body.domElement.remove();
               }
          }
          // 檢查子彈是否超出視口 (碰撞時已移除，此處作為額外清理)
          if (body.label === 'bullet' && (body.position.y < window.scrollY - 100 || body.position.y > window.scrollY + window.innerHeight + 100 || body.position.x < window.scrollX - 100 || body.position.x > window.scrollX + window.innerWidth + 100)) {
              bodiesToRemove.push(body);
               // 移除對應的 DOM 元素
               if (body.domElement && body.domElement.parentElement) {
                    body.domElement.remove();
               }
          }

          // 檢查是否是已落地的掉落文字，並且已超過移除延遲
          if ((body.label === 'fallingChar' || body.label === 'bombChar') && body.landedAt && (currentTime - body.landedAt > removalDelay)) {
              // console.log(`掉落文字已落地超過 ${removalDelay}ms，準備移除`); // 偵錯日誌
              bodiesToRemove.push(body);
              // 移除對應的 DOM 元素
              if (body.domElement && body.domElement.parentElement) {
                  body.domElement.remove();
                  // console.log('掉落文字 DOM 元素已移除'); // 偵錯日誌
              }
          }
      });

      // 從世界中移除標記的 body
      bodiesToRemove.forEach(body => World.remove(world, body));

      // 同步 DOM 元素位置與 Matter body 位置 (已移至 renderLoop 函式)
      // Composite.allBodies(world).forEach(body => {
      //   // Only sync bodies that have a DOM element and are not static (static elements' DOM position is handled once)
      //   if (body.isStatic || !body.plugin || !body.plugin.el || !body.plugin.el.parentElement) return;
      //
      //   const el = body.plugin.el;
      //   const pos = body.position;
      //   const angle = body.angle;
      //
      //   // Calculate fixed position relative to the viewport
      //   const fixedX = pos.x - window.scrollX - (el.offsetWidth / 2);
      //   const fixedY = pos.y - window.scrollY - (el.offsetHeight / 2);
      //
      //   el.style.position = 'fixed'; // Ensure fixed position
      //   el.style.left = fixedX + 'px';
      //   el.style.top = fixedY + 'px';
      //   el.style.transform = `rotate(${angle}rad)`;
      //   // Add transform-origin if necessary for correct rotation around center
      //   el.style.transformOrigin = 'center center';
      // });

      // 根據滾動更新地板 body 位置
      if (ground) {
          const groundHeight = ground.bounds.max.y - ground.bounds.min.y;
          const targetGroundY = window.scrollY + window.innerHeight - groundHeight / 2; // 定位在視口底部
          Matter.Body.setPosition(ground, { x: ground.position.x, y: targetGroundY });
      }

      // 移除射擊體 DOM 位置同步，已在 setInterval 中處理
      // if (shooterElement && shooterElement.parentElement) {
      //   const calculatedLeft = shooterX + 'px';
      //   const calculatedTop = shooterY + 'px';
      //   shooterElement.style.left = calculatedLeft;
      //   shooterElement.style.top = calculatedTop;
      //   console.log(`afterUpdate 同步 shooterElement 位置，shooterElement 存在: ${!!shooterElement}，計算出的 left: ${calculatedLeft}, top: ${calculatedTop}`); // 偵錯日誌
      // }
      // 地板 DOM 元素也是固定的，無需同步其 Matter body 位置

  });

}

// Define handler functions
// Global mouseDown, shooterX, shooterY are used

// 處理滑鼠點擊事件 (用於炸彈施放)
function handleClick(e) {
  if (currentMode === 'bomb') {
    // Bomb mode logic here
    console.log(`炸彈模式點擊，位置: (${e.clientX}, ${e.clientY})`);
    // TODO: Implement bomb placement logic
  }
}


// 設定事件監聽器
function setupEventListeners() {
  console.log('設定事件監聽器');
  // Matter.js 內部已處理 mousedown, mousemove, mouseup 事件
  window.addEventListener('click', handleClick); // Add click listener for bomb mode
  // handleKeyDown is already added in initializeMatterPlugin
}


// 初始化插件
function initializePlugin() {
  console.log('initializePlugin 函式被呼叫'); // 偵錯日誌
  console.log('插件已啟動');
  // 注入 UI
  injectUI();
  // 掃描 DOM 並識別目標元素 (此函式似乎未被呼叫，且與 addVisibleTargets 功能重複，已在 Matter.js 初始化後呼叫 addVisibleTargets)
  // identifyTargetElements();
  // 設定事件監聽器 (此函式似乎未被呼叫，事件監聽器已在 Matter.js 初始化後設定)
  // setupEventListeners();
  // 開始物理模擬循環 (Matter.js Runner.run 已經啟動物理循環，此函式似乎未被呼叫)
  // startPhysicsLoop();
}

// 注入插件 UI
function injectUI() {
  // 創建射擊物元素並添加到頁面
  shooterElement = document.createElement('div');
  shooterElement.id = 'shooter';
  // 設定基本樣式，與 Matter.js 中的 shooterEl 樣式一致
  shooterElement.style.position = 'absolute';
  shooterElement.style.width = '24px';
  shooterElement.style.height = '24px';
  shooterElement.style.background = '#888';
  shooterElement.style.zIndex = '9999';
  shooterElement.style.borderRadius = '4px';
  document.body.appendChild(shooterElement);
  console.log('shooterElement DOM 元素已創建並添加到 body'); // 偵錯日誌

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

// 掃描 DOM 並識別目標元素 (此函式似乎未被呼叫，且與 addVisibleTargets 功能重複)
function identifyTargetElements() {
  // 遍歷所有元素（不只是特定標籤）
  // const allElements = document.querySelectorAll('*');
  // allElements.forEach(element => {
  //   // 跳過 script, style, link, meta, head, title, noscript 等不應包裹的元素
  //   if ([
  //     'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'BR', 'HR', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION', 'DATALIST', 'OBJECT', 'EMBED', 'PARAM', 'BASE', 'COL', 'COLGROUP', 'FRAME', 'FRAMESET', 'MAP', 'AREA', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TH', 'TD'
  //   ].includes(element.tagName)) return;
  //   // 將每個文字節點包裹在 <span class="shootable-text">
  //   const childNodes = Array.from(element.childNodes);
  //   childNodes.forEach(node => {
  //     if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
  //       const text = node.textContent;
  //       const frag = document.createDocumentFragment();
  //       for (let char of text) {
  //         const span = document.createElement('span');
  //         span.textContent = char;
  //         span.className = 'shootable-text';
  //         frag.appendChild(span);
  //       }
  //       element.replaceChild(frag, node);
  //     }
  //   });
  // });
  // 監聽 shootable-text 點擊事件 (此處監聽器未被設定，且與 Matter.js 碰撞邏輯重複)
  // document.querySelectorAll('.shootable-text').forEach(span => {
  //   span.addEventListener('click', handleShootableTextClick);
  // });
}

// 設定事件監聽器 (此函式似乎未被呼叫)

// 處理滑鼠按下事件 (用於射擊物控制) (已在 initializeMatterPlugin 中處理)

// 處理滑鼠移動事件 (用於射擊物控制和瞄準) (已在 initializeMatterPlugin 中處理)

// 處理滑鼠釋放事件 (用於射擊物控制) (已在 initializeMatterPlugin 中處理)



// 處理滑鼠點擊事件 (用於炸彈施放) (此函式似乎未被呼叫，已在 initializeMatterPlugin 中設定)

// 處理鍵盤按下事件 (用於觸發射擊和結束插件)

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

// 觸發射擊 (此函式似乎未被使用，Matter.js 的 shootText 函式已實現射擊邏輯)
// function triggerShooting(mouseX, mouseY) {
//   console.log(`觸發射擊，位置: (${mouseX}, ${mouseY})`);

//   // 找到滑鼠游標下的元素
//   const hitElement = document.elementFromPoint(mouseX, mouseY);

//   // 檢查是否命中目標元素 (p, h2, h3, img)
//   if (hitElement && (hitElement.tagName === 'P' || hitElement.tagName === 'H2' || hitElement.tagName === 'H3' || hitElement.tagName === 'IMG')) {
//     console.log('命中目標:', hitElement.tagName, hitElement.textContent.substring(0, 20) + '...');

//     // 獲取或生成元素的唯一 ID
//     const elementId = hitElement.id || `element-${Math.random().toString(36).substr(2, 9)}`;
//     if (!hitElement.id) {
//       hitElement.id = elementId; // 為沒有 ID 的元素設置 ID
//     }

//     // 累積命中次數
//     const currentHitCount = (elementHitCounts.get(elementId) || 0) + 1;
//     elementHitCounts.set(elementId, currentHitCount);
//     console.log(`元素 ${elementId} 命中次數: ${currentHitCount}`);

//     // 計算所需的命中次數 (基於內容數量)
//     let requiredHits = 5; // 圖片的預設命中次數
//     if (hitElement.tagName !== 'IMG') {
//       const textLength = hitElement.textContent.length;
//       requiredHits = Math.max(5, Math.ceil(textLength / 20)); // 每 20 個字需要 1 次額外命中，最少 5 次
//     }
//     console.log(`元素 ${elementId} 所需命中次數: ${requiredHits}`);

//     // 更新命中元素的視覺效果 (使用 CSS 過渡)
//     hitElement.style.transition = 'transform 0.1s ease-in-out, outline 0.1s ease-in-out';
//     hitElement.style.transform = 'scale(0.95)'; // 縮小效果
//     hitElement.style.outline = '2px solid red'; // 添加紅色外框
//
//     setTimeout(() => {
//         hitElement.style.transform = 'scale(1)'; // 恢復大小
//         hitElement.style.outline = ''; // 移除外框
//     }, 200);


//     // 尋找合適的父容器來累積能量 (例如，最近的 block 級元素)
//     let parentElement = hitElement.parentElement;
//     while (parentElement && !['DIV', 'ARTICLE', 'SECTION', 'MAIN', 'BODY'].includes(parentElement.tagName)) {
//         parentElement = parentElement.parentElement;
//     }

//     if (parentElement) {
//         const parentId = parentElement.id || `parent-${Math.random().toString(36).substr(2, 9)}`;
//          if (!parentElement.id) {
//             parentElement.id = parentId; // 為沒有 ID 的父元素設置 ID
//         }

//         // 累積父容器能量 (例如，每次命中增加能量)
//         const currentEnergy = (parentEnergies.get(parentId) || 0) + 1;
//         parentEnergies.set(parentId, currentEnergy);
//         console.log(`父容器 ${parentId} 能量: ${currentEnergy}`);

//         // 檢查父容器能量是否達到崩解閾值 (例如，達到元素所需命中次數的總和)
//         // 這裡簡化為當前命中元素的所需命中次數
//         if (currentEnergy >= requiredHits) {
//             console.log(`父容器 ${parentId} 能量達到閾值，觸發崩解`);
//             triggerParentCollapse(parentElement);
//             // 重置父容器能量
//             parentEnergies.delete(parentId);
//             elementHitCounts.delete(elementId); // 崩解後重置元素命中次數
//         }
//     } else {
//         console.log('未找到合適的父容器來累積能量');
//     }

//     // TODO: 實現命中後的物理效果 (例如，文字震動)
//   } else {
//     console.log('未命中目標元素');
//   }
// }


// 觸發父容器崩解效果 (此函式名稱與需求中的 releaseElementText 不同，但功能相似，將進行修改以符合需求)

// 將單一字元 span 加入 Matter.js 世界
// 處理目標文字分解並應用物理效果
function breakDownTargetText(targetBody) {
  const targetElement = targetBody.domElement;
  if (!targetElement || !targetElement.parentElement) {
    console.warn('無法找到目標元素的 DOM 元素或其父元素');
    return;
  }

  const textContent = targetElement.textContent;
  const rect = targetElement.getBoundingClientRect();
  const originalX = rect.left + window.scrollX;
  const originalY = rect.top + window.scrollY;

  // 移除原始 DOM 元素
  targetElement.remove();
  console.log('原始目標 DOM 元素已移除'); // 偵錯日誌

  // 為每個字元創建新的 span 元素並應用物理效果
  for (let i = 0; i < textContent.length; i++) {
    const char = textContent[i];
    if (char.trim() === '') continue; // 忽略空白字元

    const charElement = document.createElement('span');
    charElement.textContent = char;
    charElement.className = 'falling-char'; // 添加 class 以便樣式控制
    charElement.style.position = 'absolute'; // 使用 absolute 定位以便 Matter.js 控制
    charElement.style.left = `${originalX + i * 10}px`; // 簡單估計每個字元的位置
    charElement.style.top = `${originalY}px`;
    charElement.style.whiteSpace = 'pre'; // 保留空白字元（如果未忽略）
    charElement.style.pointerEvents = 'none'; // 避免干擾滑鼠事件
    charElement.style.zIndex = '9999'; // 確保在最上層

    document.body.appendChild(charElement);

    // 將字元元素加入 Matter.js 世界
    addCharToPhysicsWorld(charElement, originalX + i * 10, originalY); // 使用估計位置
  }
  console.log(`已將文字分解為 ${textContent.length} 個字元並加入物理世界`); // 偵錯日誌
}
function addCharToPhysicsWorld(charElement, x, y) {
  if (!window.Matter || !window._matterReady || !window._matterEngine) return;
  const { Bodies, World, Body } = window.Matter;
  const world = window._matterEngine.world;
  // 以字元寬高建立 body
  const width = charElement.offsetWidth || 18;
  const height = charElement.offsetHeight || 24;
  const body = Bodies.rectangle(x, y, width, height, {
    restitution: 0.4,
    friction: 0.1,
    label: 'fallingChar', // 設定 label 為 fallingChar
  });
  body.domElement = charElement;
  body.domWidth = width;
  body.domHeight = height;

  // 給予隨機初始速度模擬爆破效果
  const speed = Math.random() * 5 + 2; // 速度範圍 2-7
  const angle = Math.random() * 2 * Math.PI; // 隨機方向
  const vx = speed * Math.cos(angle);
  const vy = speed * Math.sin(angle);
  Body.setVelocity(body, { x: vx, y: vy });

  World.add(world, body);
}