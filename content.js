// 插件核心邏輯

let currentMode = 'shooting'; // 'shooting' or 'bomb'
let bombTextStorage = [];
let elementHitCounts = new Map();
let parentEnergies = new Map();

let shooterElement = null;
let controlPanelElement = null;
let counterElement = null;
let fallingElements = [];
let lastMouseX = 0;
let lastMouseY = 0;
let isDraggingShooter = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function initializePlugin() {
  injectUI();
  setupEventListeners();
  startPhysicsLoop();
}

function injectUI() {
  shooterElement = document.createElement('div');
  shooterElement.id = 'shooter';
  document.body.appendChild(shooterElement);

  controlPanelElement = document.createElement('div');
  controlPanelElement.id = 'control-panel';
  controlPanelElement.innerHTML = `
    <span id="shooting-mode-icon" class="mode-icon">槍</span>
    <span id="bomb-mode-icon" class="mode-icon">手榴彈</span>
  `;
  document.body.appendChild(controlPanelElement);

  counterElement = document.createElement('div');
  counterElement.id = 'bomb-counter';
  counterElement.textContent = `炸彈文字: ${bombTextStorage.length}`;
  document.body.appendChild(counterElement);

  document.getElementById('shooting-mode-icon').addEventListener('click', () => switchMode('shooting'));
  document.getElementById('bomb-mode-icon').addEventListener('click', () => switchMode('bomb'));
  updateModeIcons();
}

function setupEventListeners() {
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown);
}

function handleMouseDown(event) {
  if (currentMode === 'shooting' && event.target === shooterElement) {
    isDraggingShooter = true;
    const rect = shooterElement.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    event.preventDefault();
  }
}

function handleMouseMove(event) {
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (isDraggingShooter && shooterElement) {
    shooterElement.style.left = `${event.clientX - dragOffsetX + window.scrollX}px`;
    shooterElement.style.top = `${event.clientY - dragOffsetY + window.scrollY}px`;
  }
}

function handleMouseUp(event) {
  if (isDraggingShooter) isDraggingShooter = false;
}

function handleClick(event) {
  if (event.target.closest('#control-panel')) return; // 避免點擊控制面板觸發炸彈
  if (currentMode === 'bomb' && bombTextStorage.length > 0) {
    triggerBombEffect(event.clientX, event.clientY);
    bombTextStorage = [];
    updateCounter();
  }
}

function handleKeyDown(event) {
  if (event.key === 'Escape') {
    exitPlugin();
  } else if (currentMode === 'shooting' && event.key === ' ') {
    triggerShooting(lastMouseX, lastMouseY);
    event.preventDefault();
  }
}

function switchMode(mode) {
  currentMode = mode;
  updateModeIcons();
}

function updateModeIcons() {
  const shootingIcon = document.getElementById('shooting-mode-icon');
  const bombIcon = document.getElementById('bomb-mode-icon');
  shootingIcon.classList.toggle('active', currentMode === 'shooting');
  bombIcon.classList.toggle('active', currentMode === 'bomb');
}

function triggerShooting(mouseX, mouseY) {
  const hitElement = document.elementFromPoint(mouseX, mouseY);
  if (hitElement && (hitElement.tagName === 'P' || hitElement.tagName === 'H2' || hitElement.tagName === 'H3' || hitElement.tagName === 'IMG')) {
    // 命中效果
    hitElement.style.transition = 'transform 0.1s, outline 0.1s';
    hitElement.style.transform = 'scale(0.95)';
    hitElement.style.outline = '2px solid red';
    setTimeout(() => {
      hitElement.style.transform = 'scale(1)';
      hitElement.style.outline = '';
    }, 200);

    // 累積命中次數
    const elementId = hitElement.id || `element-${Math.random().toString(36).substr(2, 9)}`;
    if (!hitElement.id) hitElement.id = elementId;
    const currentHitCount = (elementHitCounts.get(elementId) || 0) + 1;
    elementHitCounts.set(elementId, currentHitCount);

    // 計算所需命中次數
    let requiredHits = 5;
    if (hitElement.tagName !== 'IMG') {
      const textLength = hitElement.textContent.length;
      requiredHits = Math.max(5, Math.ceil(textLength / 20));
    }

    // 收集炸彈文字
    if (hitElement.textContent && hitElement.tagName !== 'IMG') {
      bombTextStorage.push(hitElement.textContent.trim());
      updateCounter();
    }

    // 父容器能量
    let parentElement = hitElement.parentElement;
    while (parentElement && !['DIV', 'ARTICLE', 'SECTION', 'MAIN', 'BODY'].includes(parentElement.tagName)) {
      parentElement = parentElement.parentElement;
    }
    if (parentElement) {
      const parentId = parentElement.id || `parent-${Math.random().toString(36).substr(2, 9)}`;
      if (!parentElement.id) parentElement.id = parentId;
      const currentEnergy = (parentEnergies.get(parentId) || 0) + 1;
      parentEnergies.set(parentId, currentEnergy);
      if (currentEnergy >= requiredHits) {
        triggerParentCollapse(parentElement);
        parentEnergies.delete(parentId);
        elementHitCounts.delete(elementId);
      }
    }
  }
}

function triggerParentCollapse(parentElement) {
  const textContent = parentElement.textContent;
  const rect = parentElement.getBoundingClientRect();
  const parentX = rect.left + window.scrollX;
  const parentY = rect.top + window.scrollY;
  parentElement.remove();
  for (let i = 0; i < textContent.length; i++) {
    const char = textContent[i];
    if (char.trim() === '') continue;
    const charElement = document.createElement('span');
    charElement.textContent = char;
    charElement.style.position = 'absolute';
    charElement.style.left = `${parentX + rect.width / 2}px`;
    charElement.style.top = `${parentY + rect.height / 2}px`;
    charElement.style.pointerEvents = 'none';
    charElement.style.userSelect = 'none';
    charElement.style.zIndex = '1000';
    document.body.appendChild(charElement);
    fallingElements.push({
      element: charElement,
      x: parentX + rect.width / 2,
      y: parentY + rect.height / 2,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      gravity: 0.5,
      alpha: 1,
      fadeSpeed: 0.01
    });
  }
}

function triggerBombEffect(x, y) {
  bombTextStorage.forEach(text => {
    const textElement = document.createElement('span');
    textElement.classList.add('falling-text');
    textElement.textContent = text;
    textElement.style.left = `${x}px`;
    textElement.style.top = `${y}px`;
    document.body.appendChild(textElement);
    fallingElements.push({
      element: textElement,
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      gravity: 0.5,
      alpha: 1,
      fadeSpeed: 0.01
    });
  });
}

function updateCounter() {
  if (counterElement) {
    counterElement.textContent = `炸彈文字: ${bombTextStorage.length}`;
  }
}

function startPhysicsLoop() {
  function gameLoop() {
    fallingElements.forEach(item => {
      item.vy += item.gravity;
      item.x += item.vx;
      item.y += item.vy;
      item.alpha -= item.fadeSpeed;
      item.element.style.left = `${item.x}px`;
      item.element.style.top = `${item.y}px`;
      item.element.style.opacity = item.alpha;
      if (item.y > window.innerHeight || item.alpha <= 0) {
        item.shouldRemove = true;
        item.element.remove();
      }
    });
    fallingElements = fallingElements.filter(item => !item.shouldRemove);
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);
}

function exitPlugin() {
  if (shooterElement) shooterElement.remove();
  if (controlPanelElement) controlPanelElement.remove();
  if (counterElement) counterElement.remove();
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown);
}

initializePlugin();