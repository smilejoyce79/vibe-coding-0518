chrome.action.onClicked.addListener((tab) => {
  // 注入 CSS 檔案
console.log('Debugging insertCSS call:');
console.log('chrome.scripting:', chrome.scripting);
console.log('tab object:', tab);
console.log('typeof chrome.scripting.insertCSS:', typeof chrome.scripting.insertCSS);
  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["ui.css"]
  });

  // 注入 JavaScript 檔案
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});