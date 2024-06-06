//store state for translation results
let tr_data = {text: "", page: null, entries: [], compounds: []}

function handleTranslate(text){
  tr_data = {text, page: null, entries: [], compounds: []}
  searchWord(text)
  showTranslationPanel();
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showTranslationPanel") {
    handleTranslate(message.selectedText)
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

    if (tr_data.entries.length == 0){
      DOMresults.innerHTML = "Not in my dictionary, sorry! :("
      generateCompoundList(DOMresults)
      return
    }

    DOMresults.innerHTML = ""

    let {simplified, traditional, pinyin, definitions} = tr_data.entries[tr_data.page]

    DOMheader.innerHTML = `
      <span>${pinyin}</span>
      <div id = "trans-simp-char">${simplified}</div>
      <div id = "trans-trad-char">${traditional}</div>
      <small>Simplified</small>
      <small>Traditional</small>
    `
    DOMheader.classList.add('translate-header')

    const DOMdefinitions = document.createElement('ul')
    for(const d of definitions) DOMdefinitions.innerHTML += `<li>${d}</li>`

    DOMresults.insertAdjacentHTML("beforeend", `<h3>Definitions</h3>`)
    DOMresults.appendChild(DOMdefinitions)
    generateCompoundList(DOMresults)

    if(tr_data.entries.length > 1){
      const DOMcontrol = document.createElement('div')
      DOMcontrol.classList.add("trans-control")

      const rightArrow = document.createElement('span')
      const counter = document.createElement('span')
      const leftArrow = document.createElement('span')
      rightArrow.innerHTML = ">"
      counter.innerHTML = `${tr_data.page + 1} / ${tr_data.entries.length}`
      leftArrow.innerHTML = "<"
      
      if(tr_data.page == 0)
        leftArrow.classList.add('tr-nav-disabled')
      if(tr_data.page < tr_data.entries.length - 1)
        rightArrow.addEventListener('click', () => {tr_data.page++; showTranslationPanel()})
      if(tr_data.page == tr_data.entries.length - 1)
        rightArrow.classList.add('tr-nav-disabled')
      if(tr_data.page > 0)
        leftArrow.addEventListener('click', () => {tr_data.page--; showTranslationPanel()})

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

//HTML helpers. I wish i could write this in react ;-;
function generateCompoundList(parent){
  let DOMcompounds = document.createElement('div')
  parent.appendChild(DOMcompounds)
  DOMcompounds.className = "translate-compounds"

  if(tr_data.compounds.length == 0){
    DOMcompounds.className = "translate-compounds"

    if(tr_data.text.length >= 10)
      DOMcompounds.innerHTML = `No compound words using ${tr_data.text.substring(0,10)}... found!`
    else
      DOMcompounds.innerHTML = `No compound words using ${tr_data.text} found!`

    DOMcompounds.classList.add('translate-no-compounds')
    return
  }

  let DOMcompounds_header = document.createElement('h5')
  DOMcompounds_header.innerHTML = `Compound words using ${tr_data.text}`
  let DOMcompounds_elements = document.createElement('div')
  DOMcompounds_elements.className = "translate-comp-entry-container"

  DOMcompounds.appendChild(DOMcompounds_header)
  DOMcompounds.appendChild(DOMcompounds_elements)

  for(let compound of tr_data.compounds){
    let DOMcomp = document.createElement('div')
    DOMcomp.className = "translate-comp"
    DOMcomp.addEventListener("dblclick", () => {handleTranslate(compound.word)})

    DOMcompounds_elements.appendChild(DOMcomp)

    let DOMcomp_word = document.createElement('span')
    DOMcomp_word.innerHTML = compound.word
    DOMcomp.appendChild(DOMcomp_word)

    let DOMcomp_definitions = document.createElement('ul')
    DOMcomp_definitions.innerHTML = `(${compound.pinyin}) Definitions:`
    DOMcomp_definitions.className = "translate-comp-definitions"
    DOMcomp.appendChild(DOMcomp_definitions)
    for (let def of compound.definitions){
      let DOM_comp_def = document.createElement('li')
      DOM_comp_def.innerHTML = def
      DOMcomp_definitions.append(DOM_comp_def)
    }
  }
}


 //Diciontary stuff  
let dictionaryData = null;
let translationPanel = null;

fetch(chrome.runtime.getURL('cedict.json'))
  .then(res => res.json())
  .then(data => {dictionaryData = data})
  .catch(err => console.error("Error loading dictionary data"))

function searchWord(word){
  if(!dictionaryData) return null
  tr_data.page = 0;
  tr_data.entries = sortEntries(dictionaryData.filter(x => x.simplified === word || x.traditional === word))
  tr_data.compounds = sortEntries(searchAdjWords(word))
}

function searchAdjWords(word){
  if(!dictionaryData) return null
  //returns [{compound word, definitions, HSK_level, HSK_conf}, {compound word, definitions, HSK_level, HSK_conf} ...]
  let compounds = []

  for (let entry of dictionaryData){
    if (entry.simplified.length === 1 || entry.simplified === word || entry.traditional === word)
      continue

    if (entry.simplified.includes(word) || entry.traditional.includes(word))
        compounds.push({ word: entry.simplified, pinyin: entry.pinyin, definitions: [...entry.definitions], HSK_level: entry.HSK_level, HSK_conf: entry.HSK_conf });
  }

  return compounds
}

function sortEntries(entries){
  if (tr_data.text == "" || entries.length <= 1)
      return entries

  //Remove translations with "surname" and "variant of", as they are least useful
  let { lowPriority, highPriority } = entries.reduce((acc, x) => {
    if (x.definitions.some(D => {
        let d = D.toLowerCase()
        return d.includes("surname") || d.includes("variant of") || d.includes("used in ")
    })) 
        acc.lowPriority.push(x);
     else 
        acc.highPriority.push(x);
    return acc;
  }, { lowPriority: [], highPriority: [] });

  lowPriority = lowPriority.map( x => {
    if (x.definitions.some(d => d.toLowerCase().includes("used in")))
      return {defs: x, val: 1}
    if (x.definitions.some(d => d.toLowerCase().includes("surname")))
      return {defs: x, val: 2}
    if (x.definitions.some(d => d.toLowerCase().includes("variant of")))
      return {defs: x, val: 3}
    else return {defs: x,  val: 99}
  }).sort((a,b) => a.val - b.val).map(x => x.defs)

  highPriority = highPriority.sort((a, b) => {
    if(a.HSK_level != null && b.HSK_level == null) return -1
    if(a.HSK_level == null && b.HSK_level != null) return 1
    if (a.HSK_level - b.HSK_level !== 0) return a.HSK_level - b.HSK_level;
    
    if (b.HSK_conf - a.HSK_conf !== 0) return b.HSK_conf - a.HSK_conf; //higher conf goes first
    return b.definitions.length - a.definitions.length; // Longer list of definitions goes first 
  });

  
  return highPriority.concat(lowPriority);
}