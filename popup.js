document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get('selectedText', (data) => {
      const selectedText = data.selectedText || 'No text selected';
      document.getElementById('definition').innerText = selectedText;
  
      // Here you would call your translation API
      // fetchTranslation(selectedText).then(translation => {
      //   document.getElementById('definition').innerText = translation;
      // });
    });
  });

function fetchTranslation(text) {
    
}