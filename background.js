chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate" && info.selectionText) {
    if(tab.id <= 0){
      
    }  
    
    chrome.storage.local.set({ selectedText: info.selectionText }, () => {
      chrome.tabs.sendMessage(tab.id, 
        { action: "showTranslationPanel", selectedText: info.selectionText}
      );
    });
  }
});

