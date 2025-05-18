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
*   
