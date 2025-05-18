# Google 插件架構設計：解壓射擊與炸彈

## 1. 插件基本結構與組件

*   **`manifest.json`**: 定義插件元數據、權限（如 `activeTab`, `storage`）、Content Script 和 Background Script 的入口點、Browser Action 配置（用於「開始」按鈕）。
*   **`background.js`**: 監聽 Browser Action 的點擊事件，當點擊時，向當前活動的 Tab 注入 Content Script。可選地用於狀態持久化或跨 Tab 通信。
*   **`content.js`**: 插件的核心邏輯所在。負責：
    *   DOM 掃描與目標元素識別 (`<p>`, `<h2>`, `<h3>`, `<img>`)。
    *   注入插件 UI (射擊物、控制面板、計數器)。
    *   處理滑鼠事件 (拖曳控制射擊物移動/瞄準，點擊施放炸彈)。
    *   處理鍵盤事件 (觸發射擊，ESC 結束)。
    *   管理模式狀態 (射擊模式/炸彈模式)。
    *   實現射擊邏輯、碰撞檢測、父容器能量累積與崩解。
    *   實現元素掉落的 2D 物理模擬。
    *   處理元素的淡出與 DOM 移除。
    *   管理炸彈文字的收集、儲存與計數。
    *   更新計數器 UI。
    *   處理模式切換邏輯。
    *   應用視覺回饋 (邊框顏色變化)。
*   **`ui.css`**: 定義插件 UI 元素的樣式 (射擊物、控制面板、計數器、掉落元素的動畫效果)。
*   **`physics.js` (可選)**: 一個獨立的模組，封裝 2D 物理模擬的邏輯，提供更新元素位置的方法。

## 2. 兩種模式（炸彈模式和射擊模式）的切換機制

*   在網頁中注入一個小型控制面板，包含槍和手榴彈圖標。
*   Content Script 監聽這兩個圖標的點擊事件。
*   點擊槍圖標時，將內部模式狀態設置為「射擊模式」。
*   點擊手榴彈圖標時，將內部模式狀態設置為「炸彈模式」。
*   根據當前模式狀態，Content Script 中的事件監聽器會執行不同的邏輯 (例如，滑鼠點擊在射擊模式下無效，但在炸彈模式下用於施放炸彈)。

## 3. 每種模式的基本功能框架和交互設計

### 3.1 射擊模式

*   **啟動:** 插件啟動後，Content Script 注入射擊物 UI 到頁面中。
*   **射擊物控制:**
    *   監聽 `mousedown`, `mousemove`, `mouseup` 事件。
    *   `mousedown`: 記錄拖曳起始點。
    *   `mousemove` (在拖曳過程中): 計算從起始點到當前滑鼠位置的向量，更新射擊物的位置和朝向。應用簡單的物理模擬 (慣性、加速度) 使移動更流暢。
    *   `mouseup`: 停止移動控制，射擊物保持當前速度和位置。
*   **射擊觸發:**
    *   監聽鍵盤的 `keydown` 事件。
    *   當任意鍵按下時，計算從射擊物當前位置到滑鼠游標位置的射擊軌跡。
    *   進行碰撞檢測：判斷射擊軌跡是否與頁面上的可射擊元素 (`<p>` 內的文字、`<img>` 等) 相交。
*   **命中效果:**
    *   如果命中可射擊元素：
        *   被命中的元素或其最近的可視父級元素邊框暫時變色，約 1 秒後淡回。
        *   將被命中文本的內容添加到炸彈文字儲存中。
        *   更新左下角的炸彈文字計數器。
        *   找到被命中元素所屬的父容器。
        *   增加父容器的能量值。
        *   如果父容器能量達到預設閾值：
            *   觸發父容器的崩解視覺效果。
            *   將父容器及其所有子元素從正常文檔流中分離 (例如，設置 `position: fixed` 或 `absolute`)。
            *   為這些分離的元素啟動 2D 物理模擬，使其朝螢幕底部掉落。
        *   如果父容器能量未達到閾值，但子元素被命中：
            *   將被命中的子元素從正常文檔流中分離。
            *   為這個分離的子元素啟動 2D 物理模擬，使其朝螢幕底部掉落。
*   **元素掉落與移除:**
    *   使用 `requestAnimationFrame` 循環更新掉落元素的位置。
    *   當元素掉落到螢幕底部或超出可視區域時，啟動淡出動畫 (CSS `opacity` 過渡)。
    *   淡出完成後，從 DOM 中徹底移除元素。
*   **目標元素識別:**
    *   插件啟動時，遍歷 DOM，找到所有 `<p>`, `<h2>`, `<h3>`, `<img>` 元素。
    *   對於包含文本的元素，可能需要將文本節點或單詞包裹在 `<span>` 中，以便精確地將文字作為獨立的射擊目標。

### 3.2 炸彈模式

*   **啟動:** 透過控制面板切換到炸彈模式。射擊物可能隱藏或改變外觀。
*   **炸彈施放:**
    *   監聽滑鼠的 `click` 事件。
    *   當滑鼠點擊頁面時：
        *   檢查炸彈文字數量是否大於 0。
        *   如果大於 0：
            *   在點擊位置觸發炸彈視覺效果，使用儲存的文字內容 (例如，將文字分散並向外拋出)。
            *   將炸彈文字數量重置為 0。
            *   更新左下角的炸彈文字計數器。
*   **炸彈文字累積:** 在射擊模式下命中文字時自動進行。
*   **計數器:** 左下角固定顯示一個半透明的計數器，實時顯示炸彈模式下儲存的文字數量。

## 4. 架構圖

```mermaid
graph TD
    A[Browser Action Click] --> B(Background Script)
    B --> C{Inject Content Script}
    C --> D(Content Script)
    D --> E(DOM Scan & Target Identification)
    D --> F(Inject UI: Shooter, Controls, Counter)
    D --> G(Setup Event Listeners: Mouse, Keyboard)
    D --> H(Initialize State: Mode=Shooting, Bomb Text Count=0, Parent Energies={})

    subgraph Shooting Mode
        I(Mouse Drag) --> J(Update Shooter Pos/Aim)
        K(Keyboard Press) --> L{Check Collision with Targets}
        L -- Hit --> M(Apply Hit Feedback)
        M --> N(Identify Parent Container)
        N --> O(Increase Parent Energy)
        O --> P(Add Text to Bomb Storage)
        P --> Q(Update Counter UI)
        O -- Parent Threshold Reached --> R(Trigger Parent Collapse Effect)
        R --> S(Detach Parent/Children)
        L -- Hit, No Parent Collapse --> T(Detach Hit Element)
        S --> U(Start Physics Simulation)
        T --> U
        U --> V(Physics Loop: Update Element Pos)
        V --> W{Check Screen Boundary/Fade Out}
        W -- Off-screen/Faded --> X(Remove from DOM)
    end

    subgraph Bomb Mode
        Y(Mouse Click) --> Z{Bomb Text Count > 0?}
        Z -- Yes --> AA(Trigger Bomb Visual Effect)
        AA --> AB(Reset Bomb Text Count)
        AB --> AC(Update Counter UI)
    end

    G -- Mouse Events --> D
    G -- Keyboard Events --> D

    F -- Mode Icons Click --> AE{Switch Mode}
    AE -- To Shooting --> D
    AE -- To Bomb --> D

    G -- ESC Key Press --> AF(Exit Plugin)
    AF --> AG(Remove UI, Elements, Listeners)
    AF --> AH(Reset State)
```

## 5. 結束插件

*   監聽鍵盤的 `keydown` 事件，檢查是否按下 ESC 鍵。
*   如果按下 ESC 鍵：
    *   移除所有注入的 UI 元素 (射擊物、控制面板、計數器)。
    *   停止所有正在進行的物理模擬和動畫。
    *   移除所有注入的事件監聽器。
    *   重置 Content Script 的內部狀態。

## 技術選型考慮

*   **物理引擎:** 可以使用現有的輕量級 2D 物理引擎庫 (如 Matter.js, p2.js 的精簡版本) 或自己實現一個簡單的基於 Verlet Integration 的物理模擬。
*   **動畫:** 使用 CSS Transitions/Animations 或 JavaScript 動畫庫 (如 GreenSock - GSAP) 來實現元素的掉落、淡出和爆炸效果。
*   **DOM 操作:** 使用原生的 JavaScript DOM API 進行元素的創建、插入、修改和移除。

## 潛在挑戰與考慮

*   **性能:** 在複雜的網頁上處理大量元素和物理模擬可能會影響性能。需要優化 DOM 操作和物理計算。
*   **兼容性:** 確保插件在不同網站和不同版本的瀏覽器上都能正常工作。
*   **目標元素識別的準確性:** 如何準確地識別「文章或對話框」以及其中的可射擊文字。可能需要更複雜的邏輯來處理嵌套元素和非標準結構。
*   **文字包裹:** 將文本節點包裹在 `<span>` 中可能會改變頁面的佈局和樣式，需要小心處理。

function initializeMatterPlugin() {
  if (!window.Matter) return;
  const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;
  const engine = Engine.create();
  const world = engine.world;

  // 射擊體（灰色方塊，僅移動，不受重力與碰撞影響）
  let shooterX = window.innerWidth/2;
  let shooterY = window.innerHeight/2;
  // 這兩個變數被重複宣告了，應該使用外層的 shooterVX, shooterVY
  // let shooterVX = 0, shooterVY = 0; // 移除這行
  // 創建 shooter DOM 元素 (保持不變)
  let shooterEl = document.createElement('div');
  shooterEl.style.position = 'fixed';
  shooterEl.style.width = '24px';
  shooterEl.style.height = '24px';
  shooterEl.style.background = '#888';
  shooterEl.style.zIndex = '9999';
  shooterEl.style.borderRadius = '4px';
  document.body.appendChild(shooterEl);

  // 地板 (保持不變)
  let ground = Bodies.rectangle(window.innerWidth/2, window.innerHeight-10, window.innerWidth, 20, { isStatic: true, label: 'ground' }); // 加個 label 方便區分
  World.add(world, ground);

  // 目標框管理
  let targetBodies = []; // 儲存目標 Matter bodies
  // 更新 目標 block 標籤列表
  const targetBlockTags = ['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE','TD','TH'];

  function addVisibleTargets() {
    // 這裡的邏輯是遍歷文字節點找父元素，我們希望它找的是指定標籤的父元素
    // 更直接的方式是遍歷指定的標籤元素，檢查它們是否有可見文字
    const potentialTargets = document.querySelectorAll(targetBlockTags.join(','));
    const added = new Set();

    potentialTargets.forEach(el => {
        // 檢查元素是否可見且包含文字
        const rect = el.getBoundingClientRect();
        const hasText = el.textContent.trim() !== '';
        const isVisible = rect.width >= 20 && rect.height >= 10 && rect.bottom >= 0 && rect.top <= window.innerHeight;

        if (el && !el._matterBody && !added.has(el) && hasText && isVisible) {
             // 檢查是否有文字節點在其內部 (避免選中空的容器)
             let hasActualTextNode = false;
             const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
             while(walker.nextNode()) {
                 if (walker.currentNode.textContent.trim() !== '') {
                     hasActualTextNode = true;
                     break;
                 }
             }
             if (!hasActualTextNode) return; // 沒有實際文字節點則跳過

            added.add(el);
            // el.classList.add('matter-target'); // 保留樣式標記或移除看需求
            el.style.outline = '2px dashed #0af'; // 保留視覺標記

            const body = Matter.Bodies.rectangle(
              rect.left + rect.width/2 + window.scrollX, // 注意這裡需要加上 scrollX/Y
              rect.top + rect.height/2 + window.scrollY,
              rect.width,
              rect.height,
              { isStatic: true, label: 'target', plugin: { el: el, hp: 3 } } // 儲存原始元素和生命值
            );

            el._matterBody = body; // 在 DOM 元素上儲存 Matter body 引用
            Matter.World.add(engine.world, body);
            targetBodies.push(body); // 儲存到目標 body 列表
        }
    });
    // 移除滾動和 resize 事件監聽器，因為我們現在 Matter.js 管理目標
    // window.removeEventListener('scroll', addVisibleTargets); // 考慮移除或調整邏輯
    // window.removeEventListener('resize', addVisibleTargets); // 考慮移除或調整邏輯
    // document.removeEventListener('DOMContentLoaded', addVisibleTargets); // 考慮移除或調整邏輯

    // 如果需要動態添加新目標，可以考慮在特定事件（如 DOM MutationObserver）觸發時重新掃描或添加新元素
  }

  // 初始掃描
  addVisibleTargets();

  // 這裡的舊版目標自動標記可以移除，因為 Matter.js 已經在處理
  // document.querySelectorAll('p, h2, h3, div').forEach(el => { ... }); // 移除這段或註解掉

  // 地板 DOM (保持不變)
  let groundEl = document.createElement('div');
  groundEl.style.position = 'fixed';
  groundEl.style.left = '0px';
  groundEl.style.width = '100vw';
  groundEl.style.height = '20px';
  groundEl.style.bottom = '0px';
  groundEl.style.background = '#222';
  groundEl.style.zIndex = '9998';
  document.body.appendChild(groundEl);

  // 射擊體移動邏輯 (保留 Matter.js 版本的 setInterval 推動)
  // 這裡的 shooterElement 變數是舊版的，我們應該使用 shooterEl
  // setInterval(() => { ... }, 16); // 保留這段，但確保使用 shooterEl 和 shooterX/Y/VX/VY

  // Matter.js 運行 (保持不變)
  Runner.run(engine);

  // 射擊文字功能 (改為創建 Matter body)
  function shootText(char) {
    // 確保 shooterEl 存在並且 Matter 引擎已初始化
    if (!shooterEl || !Matter) return;

    // 根據 shooterEl 的當前 DOM 位置計算 Matter body 的起始位置
    const shooterRect = shooterEl.getBoundingClientRect();
    const startX = shooterRect.left + shooterRect.width / 2;
    const startY = shooterRect.top + shooterRect.height / 2;

    // 計算射擊方向向量
    const dx = lastMouseX - startX; // 使用 lastMouseX/Y 作為目標點
    const dy = lastMouseY - startY;
    const len = Math.sqrt(dx*dx + dy*dy);
    const speed = 18; // 子彈速度

    const vx = (dx/len) * speed;
    const vy = (dy/len) * speed;

    // 創建子彈 Matter body (使用 circle，更像子彈)
    const bulletRadius = 12;
    const bullet = Bodies.circle(startX, startY, bulletRadius, {
      restitution: 0.2,
      friction: 0.05,
      label: 'bullet',
      density: 0.01, // 讓子彈輕一些
      // isSleeping: true, // 剛創建時不模擬物理，直到設置速度
      plugin: { char: char } // 儲存對應字元
    });

    // 將子彈 body 加入 World
    World.add(world, bullet);

    // 創建子彈 DOM 元素 (span)
    let bulletEl = document.createElement('span');
    bulletEl.className = 'matter-bullet';
    bulletEl.textContent = char;
    bulletEl.style.fontSize = '1.2rem';
    bulletEl.style.zIndex = '9999';
    bulletEl.style.position = 'fixed'; // 使用 fixed 定位方便同步 Matter body 位置
    bulletEl.style.top = `${startY - bulletRadius}px`; // 初始位置
    bulletEl.style.left = `${startX - bulletRadius}px`;
    document.body.appendChild(bulletEl);

    // 在 DOM 元素上儲存 Matter body 引用，方便後續同步和移除
    bulletEl._matterBody = bullet;

    // 設置子彈初始速度
    // Body.setSleeping(bullet, false); // 喚醒 body
    Body.setVelocity(bullet, { x: vx, y: vy });

    console.log(`發射子彈: ${char} 從 (${startX}, ${startY}) 飛向 (${lastMouseX}, ${lastMouseY})`);
  }

  // 攔截鍵盤射擊 (保持不變，但調用新的 shootText)
  window.addEventListener('keydown', e => {
    if (currentMode === 'shooting' && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // 確保不是功能鍵等
      if (!['Shift','Control','Alt','Meta','CapsLock','Tab','Enter','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Insert','Delete','ContextMenu','ScrollLock','Pause','NumLock','PrintScreen'].includes(e.key)
      ) {
         shootText(e.key); // 調用 Matter.js 版本的 shootText
         e.preventDefault(); // 阻止默認行為 (如輸入文字)
      }
    }
  });

  // 子彈碰撞到目標框時停止並處理目標生命值
  Events.on(engine, 'collisionStart', function(event) {
    event.pairs.forEach(pair => {
      let bullet = null;
      let target = null;
      let fallingChar = null; // 新增，處理掉落文字碰撞

      // 判斷碰撞體類型
      if (pair.bodyA.label === 'bullet' && pair.bodyB.label === 'target') {
        bullet = pair.bodyA; target = pair.bodyB;
      } else if (pair.bodyB.label === 'bullet' && pair.bodyA.label === 'target') {
        bullet = pair.bodyB; target = pair.bodyA;
      } else if (pair.bodyA.label === 'fallingChar' || pair.bodyB.label === 'fallingChar') {
          // 掉落文字之間的碰撞或與其他物體的碰撞 (如果 isSensor: true 就不會觸發這個)
          // 這裡可以處理掉落文字與地面的碰撞，或者與其他物體的互動
      }

      // 處理子彈與目標的碰撞
      if (bullet && target) {
        console.log('子彈擊中目標');
        // 停止並移除子彈
        // Body.setVelocity(bullet, { x: 0, y: 0 }); // 不再停止，直接移除
        // Body.setStatic(bullet, true); // 不再設為 static

        // 找到子彈對應的 DOM 元素並移除
        document.querySelectorAll('.matter-bullet').forEach(el => {
            if (el._matterBody === bullet) {
                el.remove();
            }
        });
        // 從 Matter World 中移除子彈 body
        World.remove(world, bullet);

        // 目標框生命值-1
        if (target.plugin && target.plugin.hp > 0) {
          target.plugin.hp--;
          console.log(`目標生命值: ${target.plugin.hp}`);
          if (target.plugin.hp <= 0) {
            console.log('目標被摧毀');
            // 觸發文字掉落效果
            if (target.plugin.el) {
               releaseElementText(target.plugin.el, target.position.x, target.position.y); // 調用新的掉落文字函式
               // 從 Matter World 中移除目標 body
               World.remove(world, target);
               // 移除目標對應的 DOM 元素
               target.plugin.el.remove();
               // 從 targetBodies 列表中移除
               targetBodies = targetBodies.filter(b => b !== target);
            }
          }
        }
        // 將擊中的字元加入炸彈儲存 (從子彈 plugin 讀取字元)
         if (bullet.plugin && bullet.plugin.char) {
             bombTextStorage.push(bullet.plugin.char);
             updateCounter();
             console.log(`收集到字元: ${bullet.plugin.char}`);
         }
      }
    });
  });

  // Matter.js 事件：每次更新後處理掉落文字的移除
  Events.on(engine, 'afterUpdate', function() {
      const bodiesToRemove = [];
      World.allBodies(engine.world).forEach(body => {
          // 檢查是否是掉落文字 body 且超出螢幕底部
          if (body.label === 'fallingChar' && body.position.y > window.innerHeight + 50) { // 加一點緩衝
              bodiesToRemove.push(body);
               // 移除對應的 DOM 元素
               if (body.plugin && body.plugin.el) {
                   body.plugin.el.remove();
               }
          }
          // 檢查子彈是否超出螢幕 (防止子彈沒擊中目標一直飛)
          if (body.label === 'bullet' && (body.position.y < -50 || body.position.y > window.innerHeight + 50 || body.position.x < -50 || body.position.x > window.innerWidth + 50)) {
              bodiesToRemove.push(body);
               // 移除對應的 DOM 元素
               document.querySelectorAll('.matter-bullet').forEach(el => {
                    if (el._matterBody === body) {
                        el.remove();
                    }
                });
          }
      });

      // 移除標記的 bodies
      bodiesToRemove.forEach(body => World.remove(world, body));
  });


  // 動畫渲染 (同步 Matter body 位置到 DOM 元素)
  function renderLoop() {
    // 同步 shooter DOM 位置
    shooterEl.style.left = shooterX + 'px';
    shooterEl.style.top = shooterY + 'px';

    // 同步地板 DOM 位置 (如果地板是 fixed 定位，這段可能不需要 Matter body)
    // Matter.Body.setPosition(ground, { x: window.innerWidth/2, y: window.innerHeight-10 }); // 如果地板是 static 且 DOM 是 fixed，不需要同步它的 Matter body
    // groundEl.style.top = (window.innerHeight-20) + 'px'; // 如果地板是 fixed 定位，保持這樣

    // 同步目標框 DOM 位置 (Matter bodies 是 static 的，只需初始設定位置)
    // 目標框的位置應該由 Matter engine 管理，但因為是 static，創建後位置不變
    // 所以這裡不需要 Matter.Body.setPosition 或讀取 body.position 來更新 DOM
    // 初始創建時設定 DOM 位置即可，除非目標不是 static 或會移動

    // 同步子彈和掉落文字 DOM 位置
    World.allBodies(engine.world).forEach(body => {
        // 找到對應的 DOM 元素 (這裡需要一個通用的方法來找到 Matter body 對應的 DOM 元素)
        // 我們可以在創建 body 時，將 DOM 元素的引用儲存在 body 的 plugin 中，或者使用 data 屬性

        if (body.label === 'bullet') {
             // 找到對應的子彈 DOM
             const bulletEl = document.querySelector(`.matter-bullet[data-matter-body-id="${body.id}"]`);
             if (bulletEl) {
                 // 子彈中心與 body 中心對齊
                 bulletEl.style.left = (body.position.x - bulletEl.offsetWidth / 2) + 'px';
                 bulletEl.style.top = (body.position.y - bulletEl.offsetHeight / 2) + 'px';
             }
        } else if (body.label === 'fallingChar') {
            // 找到對應的掉落文字 DOM (我們會在創建時把 DOM 元素儲存在 body.plugin.el)
            if (body.plugin && body.plugin.el) {
                 const charEl = body.plugin.el;
                 // 文字中心與 body 中心對齊
                 charEl.style.left = (body.position.x - charEl.offsetWidth / 2) + 'px';
                 charEl.style.top = (body.position.y - charEl.offsetHeight / 2) + 'px';
                 // 更新透明度 (如果需要淡出效果)
                 // charEl.style.opacity = body.plugin.alpha;
            }
        } else if (body.label === 'target') {
             // Matter static body 的 DOM 位置同步 (如果目標元素是 normal flow，這段可能不需要)
             // 如果目標元素因為 Matter body 被改為 fixed/absolute 定位，則需要同步
             if (body.plugin && body.plugin.el) {
                 const el = body.plugin.el;
                 // 因為 Matter body 創建時位置已經考慮了滾動，這裡同步應該使用 body.position
                 // 並減去元素寬高的一半使 Matter body 中心與元素中心對齊
                 // 注意這裡的計算可能需要根據元素的 box-sizing 和定位方式調整
                 // 假設元素定位已經被 Matter target 樣式改為 fixed/absolute
                 el.style.left = (body.position.x - body.bounds.max.x + body.bounds.min.x/2) + 'px'; // 這個計算方式可能不對，應該是 body.position.x - body.width/2
                 el.style.top = (body.position.y - body.bounds.max.y + body.bounds.min.y/2) + 'px'; // 這個計算方式可能不對，應該是 body.position.y - body.height/2
                 // 更簡單的同步方式：讓 Matter body 的位置與元素的 margin-box 左上角對齊
                 // El.style.left = `${body.position.x - body.bounds.max.x + body.bounds.min.x}px`;
                 // El.style.top = `${body.position.y - body.bounds.max.y + body.bounds.min.y}px`;
                 // 或者直接使用 body 的中心位置減去 DOM 元素自身尺寸的一半 (如果 Matter body 尺寸和 DOM 元素尺寸一致)
                 el.style.left = (body.position.x - el.offsetWidth / 2) + 'px';
                 el.style.top = (body.position.y - el.offsetHeight / 2) + 'px';
             }
        }
    });

    // 移除舊的子彈位置同步迴圈
    // document.querySelectorAll('.matter-bullet').forEach(el => { ... }); // 移除這段

    requestAnimationFrame(renderLoop);
  }
  renderLoop(); // 啟動渲染迴圈

  // 持續朝滑鼠方向推動射擊體 (保留，但確保使用正確的變數)
  // setInterval(() => { ... }, 16); // 保留這段，但確保使用 shooterX/Y/VX/VY 變數，而不是 Matter body

  // TODO: 炸彈釋放、碰撞、爆炸等進階互動 (這裡需要修改 triggerBombEffect 使用 Matter.js)

  // Matter.js shooter 的移動邏輯 (保留)
  setInterval(() => {
    if (mouseDown) {
      // ... 推動邏輯 ...
    }
    // 慣性 friction (保留)
    shooterVX *= 0.85;
    shooterVY *= 0.85;
    shooterX += shooterVX;
    shooterY += shooterVY;
    // 邊界限制 (保留)
    shooterX = Math.max(0, Math.min(window.innerWidth-24, shooterX));
    shooterY = Math.max(0, Math.min(window.innerHeight-24, shooterY));
  }, 16);

    // 釋放文字（被破壞的目標） - 使用 Matter.js
    function releaseElementText(parentElement, startX, startY) {
      const textContent = parentElement.textContent;
      const chars = textContent.trim().split(''); // 只處理非空白字元

      chars.forEach(char => {
        const charElement = document.createElement('span');
        charElement.classList.add('falling-char'); // 新的 class 名稱
        charElement.textContent = char;
        charElement.style.position = 'fixed'; // 使用 fixed 定位同步 Matter body
        charElement.style.left = `${startX}px`; // 初始位置在破壞點
        charElement.style.top = `${startY}px`;
        charElement.style.pointerEvents = 'none';
        charElement.style.userSelect = 'none';
        charElement.style.zIndex = '1000';
        // charElement.style.fontSize = '1rem'; // 可以設定字體大小

        document.body.appendChild(charElement);

        // 創建文字碎片的 Matter body
        const charBody = Bodies.circle(startX, startY, 8, { // 使用小圓形 body
           density: 0.001, // 輕一點
           frictionAir: 0.01, // 空氣阻力小一點
           restitution: 0.3, // 輕微彈性
           label: 'fallingChar', // 標記為掉落文字
           isSensor: true, // 設置為傳感器，可以相互重疊穿透
           plugin: { el: charElement, alpha: 1, fadeSpeed: 0 } // 儲存 DOM 元素和淡出狀態 (如果需要)
        });

        // 為每個字元添加一個隨機的初始速度
        const speed = Math.random() * 8 + 2; // 速度範圍 2-10
        const angle = Math.random() * Math.PI * 2; // 隨機方向
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        Body.setVelocity(charBody, { x: vx, y: vy });

        // 將文字 body 加入 World
        World.add(world, charBody);

        // 儲存 Matter body 引用到 DOM 元素 (方便在 renderLoop 中找到)
        charElement._matterBody = charBody;
      });
    }

    // 觸發炸彈效果 - 使用 Matter.js
    function triggerBombEffect(x, y) {
      console.log(`在 (${x}, ${y}) 施放炸彈`);
      const chars = bombTextStorage; // 使用儲存的炸彈文字

      chars.forEach(char => {
        const charElement = document.createElement('span');
        charElement.classList.add('bomb-char'); // 新的 class 名稱
        charElement.textContent = char;
        charElement.style.position = 'fixed'; // 使用 fixed 定位同步 Matter body
        // 初始位置在炸彈施放點 (射擊物位置)
        charElement.style.left = `${x}px`;
        charElement.style.top = `${y}px`;
        charElement.style.pointerEvents = 'none';
        charElement.style.zIndex = '1000';
        charElement.style.fontSize = '2rem'; // 炸彈文字可能大一些

        document.body.appendChild(charElement);

        // 創建炸彈文字的 Matter body
        const charBody = Bodies.circle(x, y, 15, { // 使用稍大的圓形 body
           density: 0.002,
           frictionAir: 0.02,
           restitution: 0.5,
           label: 'bombChar', // 標記為炸彈文字
           isSensor: true, // 設置為傳感器，可以相互重疊穿透
           plugin: { el: charElement } // 儲存 DOM 元素
        });

        // 為每個炸彈文字添加一個向外擴散的隨機初始速度
        const speed = Math.random() * 15 + 5; // 速度範圍 5-20
        const angle = Math.random() * Math.PI * 2; // 隨機方向
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        Body.setVelocity(charBody, { x: vx, y: vy });

        // 將炸彈文字 body 加入 World
        World.add(world, charBody);

        // 儲存 Matter body 引用到 DOM 元素
        charElement._matterBody = charBody;
      });

       // 炸彈文字掉落後也需要在 Matter 事件中檢查移除
    }

    // 這裡需要更新 handleClick 函式來調用 Matter.js 版本的 triggerBombEffect
    // handleMouseUp 和其他舊的物理/動畫函式 (inertiaMoveShooter, moveShooter, startPhysicsLoop, shootFlyingText, startFallingText) 應該移除或註解掉，因為 Matter.js 負責物理模擬和位置同步。


} // 結束 initializeMatterPlugin 函式


// 需要保留舊版的 UI 和模式切換邏輯，並確保它們與 Matter.js 整合的部分協同工作。
// 初始化插件函式 initializePlugin 應該只負責 UI 和事件監聽，不包含舊的物理模擬邏輯。
// initializeMatterPlugin 應該在 Matter.js 載入後被調用。

// 修改 initializePlugin 函式，移除舊的物理相關調用
function initializePlugin() {
  console.log('插件已啟動');
  // 注入 UI
  injectUI();
  // 掃描 DOM 並識別目標元素 (這段舊的掃描應該被 Matter.js 的 addVisibleTargets 取代)
  // identifyTargetElements(); // 移除或註解掉
  // 設定事件監聽器 (保留，但確保 handleMouseMove/Up/Click/KeyDown 使用 Matter.js 邏輯)
  setupEventListeners();
  // 開始物理模擬循環 (這段舊的物理循環應該被 Matter.js 取代)
  // startPhysicsLoop(); // 移除或註解掉
}

// 修改 setupEventListeners，確保滑鼠事件處理 Matter.js shooter 移動
function setupEventListeners() {
  // 滑鼠事件監聽器 (用於射擊物控制和瞄準)
  // handleMouseDown, handleMouseMove, handleMouseUp 需要更新，只處理 lastMouseX/Y 更新和 mouseDown 狀態
  // shooter 的 Matter.js 推動邏輯在 initializeMatterPlugin 的 setInterval 裡處理
  document.addEventListener('mousedown', handleMouseDown); // 保留，更新 handleMouseDown
  document.addEventListener('mousemove', handleMouseMove); // 保留，更新 handleMouseMove
  document.addEventListener('mouseup', handleMouseUp); // 保留，更新 handleMouseUp
  document.addEventListener('click', handleClick); // 保留，更新 handleClick

  // 鍵盤事件監聽器 (保留，更新 handleKeyDown)
  document.addEventListener('keydown', handleKeyDown);
}

// 更新 handleMouseDown, handleMouseMove, handleMouseUp 只處理狀態和 lastMouse 位置
function handleMouseDown(event) {
    if (currentMode === 'shooting' && event.button === 0) {
        mouseDown = true; // 只更新狀態
        // 不再需要 dragStartX, dragStartY, isDraggingShooter, shooterVX, shooterVY, shooterMoveInterval 等舊版拖曳變數
        event.preventDefault(); // 阻止默認行為
    }
}

function handleMouseMove(event) {
    lastMouseX = event.clientX; // 更新滑鼠位置
    lastMouseY = event.clientY;
    // 不再需要舊版拖曳移動邏輯
}

function handleMouseUp(event) {
    if (currentMode === 'shooting' && event.button === 0) {
        mouseDown = false; // 只更新狀態
        // 不再需要舊版慣性移動邏輯
    }
}

// 更新 handleClick 函式來調用 Matter.js 版本的 triggerBombEffect
function handleClick(event) {
  if (currentMode === 'bomb') {
    // 檢查炸彈數量
    if (bombTextStorage.length > 0) {
      // 在射擊物位置施放炸彈 (使用 shooterEl 的當前位置)
      const shooterRect = shooterEl.getBoundingClientRect(); // 使用 shooterEl
      const sx = shooterRect.left + shooterRect.width / 2;
      const sy = shooterRect.top + shooterRect.height / 2;
      triggerBombEffect(sx, sy); // 調用 Matter.js 版本的炸彈效果
      // 重置炸彈文字儲存
      bombTextStorage = [];
      // 更新計數器
      updateCounter();
    }
  }
}

// 更新 handleKeyDown 函式，確保射擊調用 Matter.js 的 shootText
// 這段在 initializeMatterPlugin 裡已經添加了 Matter.js 版本的 keydown 監聽器
// 所以外層這個 handleKeyDown 函式可以移除或註解掉，避免重複監聽和混淆邏輯。
/*
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    exitPlugin();
  } else if (currentMode === 'shooting') {
    const key = event.key;
    if (!event.ctrlKey && !event.altKey && !event.metaKey &&
      !['Shift','Control','Alt','Meta','CapsLock','Tab','Enter','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Insert','Delete','ContextMenu','ScrollLock','Pause','NumLock','PrintScreen'].includes(key)
      && key.length === 1
    ) {
       // 這裡的射擊邏輯應該被 Matter.js 的 keydown 監聽器取代
      // shootText(key); // 這行應該移除
      // event.preventDefault();
    }
  }
}
*/

// 移除舊版的物理和動畫相關函式
/*
function inertiaMoveShooter() { ... }
function moveShooter() { ... }
function triggerParentCollapse(parentElement) { ... } // 這段邏輯應該被 releaseElementText 取代
function startPhysicsLoop() { ... }
function handleShootableTextClick(event) { ... } // 這段邏輯應該被 Matter.js 的 collisionStart 取代
function shootFlyingText(char, fromX, fromY, toX, toY, onHit) { ... } // 舊版動畫，移除
function startFallingText(span, startX, startY) { ... } // 舊版動畫，移除
*/

// 插件啟動時執行初始化 (保持不變)
// initializePlugin();

