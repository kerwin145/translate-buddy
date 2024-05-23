
const responseCSS = await fetch(chrome.runtime.getURL('styles.css'));
const css = await responseCSS.text();
const styleElement = document.createElement('style');
styleElement.innerHTML = css;
document.querySelector('head').appendChild(styleElement);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "showTranslationPanel") {
      showTranslationPanel(message.selectedText);
    } 
  });
  
  async function showTranslationPanel(selectedText) {
    if (translationPanel) 
      closeTranslationPanel();
  
    // Load the HTML content
    const container = document.createElement('div')
    container.id = "translation-panel"
    document.body.appendChild(container)

    try {
      let html = 
      `
        <h2 class = "translate-selectedText">${selectedText}</h2>
        <div class="close-btn">&times;</div>
        <div class="translate-results">
          Loading...
        </div>
      `
      container.innerHTML = html
      document.addEventListener("click", handleOutsideClick);
      container.querySelector(".close-btn").addEventListener("click", closeTranslationPanel);
      translationPanel = container

      DOMresults = document.querySelector(".translate-results")

      //Search db
      let info = searchDict(text)
      if (!info){
        DOMresults.innerHTML = "Not in my dictionary, sorry! :("
        return
      }

      let {simplified, traditional, pinyin, definitions} = info
      pinyin = parsePinyin(pinyin)
        

    }catch(err){console.log(err)}
  }
  
  function closeTranslationPanel() {
    if (!translationPanel) return;
    
    document.removeEventListener("click", handleOutsideClick);
    translationPanel.querySelector(".close-btn").removeEventListener("click", closeTranslationPanel);
  
    translationPanel.remove();
    translationPanel = null;
  }
  
  function handleOutsideClick(event) {
    if (translationPanel && !translationPanel.contains(event.target)) {
      closeTranslationPanel();
    }
  }

 //Diciontary stuff  
let dictionaryData = null;
let translationPanel = null;

fetch(chrome.runtime.getURL('cedict.json'))
  .then(res => res.json())
  .then(data => {dictionaryData = data})
  .catch(err => console.error("Error loading dictionary data"))

function searchDict(word){
  if(!dictionaryData) return null

  return dictionaryData.find(x => x.simplified === word || x.traditional === word);
}

const pinyinMap = {
  'a': 'āáǎà',
  'e': 'ēéěè',
  'i': 'īíǐì',
  'o': 'ōóǒò',
  'u': 'ūúǔù',
  'ü': 'ǖǘǚǜ'
};

function parsePinyin(text){
  const vowels = ['a', 'e', 'i', 'o', 'u', 'ü']
  const regex = /u:/g;

  return text.split(" ").map(str => {
    tone = str.slice(-1)
    str = str.replace(regex, "ü")
    if(tone < '1' || tone > '5')
      return str

    str = str.slice(0,-1)

    if(tone === '5') return str

    let out = ""
    let vowelFound = false
    for (const c of str){
      if (!vowels.includes(c) || vowelFound){
        out += c
        continue
      } 

      vowelFound = true
      out += pinyinMap[c][tone-1]
    }

    return out
  }).join(" ")
}