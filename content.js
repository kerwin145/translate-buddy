chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "showTranslationPanel") {
      showTranslationPanel();
    } 
  });
  
  let translationPanel = null;
  
  function showTranslationPanel() {
    if (translationPanel) return;
  
    translationPanel = document.createElement("div");
    translationPanel.id = "translation-panel";
    translationPanel.innerHTML = `
      <div id="panel-content">
        <span id="close-btn">&times;</span>
        <p>Translation Panel</p>
      </div>
    `;
  
    translationPanel.style.position = "fixed";
    translationPanel.style.top = "20px";
    translationPanel.style.right = "20px";
    translationPanel.style.zIndex = "9999";
    translationPanel.style.background = "white";
    translationPanel.style.padding = "10px";
    translationPanel.style.border = "1px solid #ccc";
    translationPanel.style.borderRadius = "5px";
  
    document.body.appendChild(translationPanel);
    document.addEventListener("click", handleOutsideClick);
    translationPanel.querySelector("#close-btn").addEventListener("click", hideTranslationPanel);
  }
  
  function hideTranslationPanel() {
    if (!translationPanel) return;
    
    document.removeEventListener("click", handleOutsideClick);
    translationPanel.querySelector("#close-btn").removeEventListener("click", hideTranslationPanel);
  
    translationPanel.remove();
    translationPanel = null;
  }
  
  function handleOutsideClick(event) {
    if (translationPanel && !translationPanel.contains(event.target)) {
      hideTranslationPanel();
    }
  }