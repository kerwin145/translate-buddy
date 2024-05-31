//store state for translation results
let translations = {text: "", page: null, definitions: []}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showTranslationPanel") {
    translations = {text: selectedText, page: null, definitions: []}

    let info = searchDict(selectedText)
    if (info){
      translations.definitions = info
      translations.page = 0
    }

    showTranslationPanel(message.selectedText);
  } else if (message.action === "noMessage"){
    alert("No highlighted text detected.")
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
    DOMheader = document.querySelector(".translate-selectedText")

    if (translations.definitions.length == 0){
      DOMresults.innerHTML = "Not in my dictionary, sorry! :("
      return
    }

    DOMresults.info = ""

    let {simplified, traditional, pinyin, definitions} = translations.definitions[translations.page]

    DOMheader.innerHTML = `
      <small>Traditional</small>
      <small>Simplified</small>
      <div>${traditional}</div>
      <div>${simplified}</div>
    `
    DOMheader.classList.add('translate-header')

    const DOMpinyin = document.createElement('small')
    DOMpinyin.innerHTML = pinyin
    DOMpinyin.classList.add("translate-pinyin")

    const DOMdefinitions = document.createElement('ol')
    for(const d of definitions) DOMdefinitions.innerHTML += `<li>${d}</li>`

    DOMresults.appendChild(DOMpinyin)
    DOMresults.insertAdjacentHTML("beforeend", `<h3>Definitions</h3>`)
    DOMresults.appendChild(DOMdefinitions)

    if(translations.definitions.length > 1){
      const DOMcontrol = document.createElement('div')

      const rightArrow = document.createElement('span')
      const counter = document.createElement('span')
      const leftArrow = document.createElement('span')
      rightArrow.innerHTML = ">"
      counter.innerHTML = `${translations.page + 1} / ${translations.definitions.length}`
      leftArrow.innerHTML = "<"
      
      if(translations.page == 0){
        leftArrow.classList.add('tr-nav-disabled')
      if(translations.page < translations.definitions.length - 1)
        rightArrow.addEventListener('click', () => {translations.page++; showTranslationPanel()})
      if(translations.page == translations.definitions.length - 1)
        rightArrow.classList.add('tr-nav-disabled')
      if(translations.page > 0)
        leftArrow.addEventListener('click', () => {translations.page--; showTranslationPanel()})

      DOMcontrol.appendChild(leftArrow)
      DOMcontrol.appendChild(counter)
      DOMcontrol.appendChild(rightArrow)
      DOMresults.appendChild(DOMcontrol)
    }

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

  return dictionaryData.findAll(x => x.simplified === word || x.traditional === word);
}
