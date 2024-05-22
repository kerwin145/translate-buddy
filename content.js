chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "showTranslationPanel") {
      showTranslationPanel(message.selectedText);
    } 
  });
  
  let translationPanel = null;
  
  async function showTranslationPanel(selectedText) {
    if (translationPanel) return;
  
    // Load the HTML content
    const container = document.createElement('div')
    container.id = "translation-panel"
    document.body.appendChild(container)

    try {
      const html = 
      `
        <h2 class = "translate-selectedText">${selectedText}</h2>
        <div class="close-btn">&times;</div>
        <p id="translation-text">Content here</p>
      `

      container.innerHTML = html

      const responseCSS = await fetch(chrome.runtime.getURL('styles.css'));
      const css = await responseCSS.text();
      const styleElement = document.createElement('style');
      styleElement.innerHTML = css;
      document.querySelector('head').appendChild(styleElement);

      document.addEventListener("click", handleOutsideClick);
      container.querySelector(".close-btn").addEventListener("click", hideTranslationPanel);
    
      translationPanel = container

    }catch(err){console.log(err)}
  }
  
  function hideTranslationPanel() {
    if (!translationPanel) return;
    
    document.removeEventListener("click", handleOutsideClick);
    translationPanel.querySelector(".close-btn").removeEventListener("click", hideTranslationPanel);
  
    translationPanel.remove();
    translationPanel = null;
  }
  
  function handleOutsideClick(event) {
    if (translationPanel && !translationPanel.contains(event.target)) {
      hideTranslationPanel();
    }
  }