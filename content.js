//store state for translation results
let tr_data = {text: "", page: null, definitions: []}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showTranslationPanel") {
    let text = message.selectedText
    tr_data = {text, page: null, definitions: []}

    let info = searchDict(text)
    if (info){
      tr_data.definitions = info
      tr_data.page = 0
    }

    tr_data.definitions.sort((a, b) => {
      Math.min(a.char_HSK_level, a.word_HSK_level) - Math.min(b.char_HSK_level, b.word_HSK_level)
    })

    showTranslationPanel();
  } else if (message.action === "noMessage"){
    alert("No highlighted text detected.")
  }
});

async function showTranslationPanel() {
  if (translationPanel) 
    closeTranslationPanel();

  // Load the HTML content
  const container = document.createElement('div')
  container.id = "translation-panel"
  document.body.appendChild(container)

  try {
    let html = 
    `
      <h2 class = "translate-selectedText">${tr_data.text}</h2>
      <div class="close-btn">&times;</div>
      <div class="translate-results">
        Loading...
      </div>
    `
    container.innerHTML = html
    document.addEventListener("mousedown", handleOutsideClick)
    container.querySelector(".close-btn").addEventListener("click", closeTranslationPanel);
    translationPanel = container

    let DOMresults = document.querySelector(".translate-results")
    let DOMheader = document.querySelector(".translate-selectedText")

    if (tr_data.definitions.length == 0){
      DOMresults.innerHTML = "Not in my dictionary, sorry! :("
      return
    }

    DOMresults.innerHTML = ""

    let {simplified, traditional, pinyin, definitions} = tr_data.definitions[tr_data.page]

    DOMheader.innerHTML = `
      <span>${pinyin}</span>
      <div id = "trans-trad-char">${traditional}</div>
      <div id = "trans-simp-char">${simplified}</div>
      <small id = "">Traditional</small>
      <small>Simplified</small>
    `
    DOMheader.classList.add('translate-header')

    const DOMdefinitions = document.createElement('ol')
    for(const d of definitions) DOMdefinitions.innerHTML += `<li>${d}</li>`

    DOMresults.insertAdjacentHTML("beforeend", `<h3>Definitions</h3>`)
    DOMresults.appendChild(DOMdefinitions)

    if(tr_data.definitions.length > 1){
      const DOMcontrol = document.createElement('div')
      DOMcontrol.classList.add("trans-control")

      const rightArrow = document.createElement('span')
      const counter = document.createElement('span')
      const leftArrow = document.createElement('span')
      rightArrow.innerHTML = ">"
      counter.innerHTML = `${tr_data.page + 1} / ${tr_data.definitions.length}`
      leftArrow.innerHTML = "<"
      
      if(tr_data.page == 0)
        leftArrow.classList.add('tr-nav-disabled')
      if(tr_data.page < tr_data.definitions.length - 1)
        rightArrow.addEventListener('click', () => {tr_data.page++; closeTranslationPanel(); showTranslationPanel()})
      if(tr_data.page == tr_data.definitions.length - 1)
        rightArrow.classList.add('tr-nav-disabled')
      if(tr_data.page > 0)
        leftArrow.addEventListener('click', () => {tr_data.page--; closeTranslationPanel(); showTranslationPanel()})

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

  return dictionaryData.filter(x => x.simplified === word || x.traditional === word);
}
