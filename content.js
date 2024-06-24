//TODO Store all of the dictionary data structures into background.JS and make methods that query backgruond js
//store state for translation results
let tr_data; //data format is defined in background.js
let translationPanel = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showTranslationPanel") {
    tr_data = message.data
    showTranslationPanel()
  }
  else if (message.action === "showLoadingPanel"){
    tr_data = message.data
    showTranslationPanel(true)
  } 
  else{
    alert("Some error :(")
  }
});

function sendQuery(text){
  chrome.runtime.sendMessage({action: "translate", text})
}

function showTranslationPanel(loading = false) {
  let html = 
  `
    <h2 class = "translate-selectedText">${tr_data.text || ""}</h2>
    <div class="close-btn">&times;</div>
    <div class="translate-results">
      Loading data...
    </div>
  `
  if (translationPanel) 
    closeTranslationPanel();

  // Load the HTML content
  const container = document.createElement('div')
  container.id = "translation-panel"
  document.body.appendChild(container)

  container.innerHTML = html
  document.addEventListener("mousedown", handleOutsideClick)
  container.querySelector(".close-btn").addEventListener("click", closeTranslationPanel);
  translationPanel = container

  let DOMresults = document.querySelector(".translate-results")
  let DOMheader = document.querySelector(".translate-selectedText")

  if(loading){
    DOMheader.innerHTML = trimText(tr_data.text)
    return
  }

  if (tr_data.entries.length == 0){
    DOMheader.innerHTML = trimText(tr_data.text)
    DOMresults.innerHTML = `<div class = "translate-noresults"> Not in my dictionary, sorry! :-( </div>`
    makeCompoundListHTML(DOMresults, tr_data.compounds, `Compound words (词组) containing ${trimText(tr_data.text)}`, `No compound words using ${trimText(tr_data.text)} found!`)
    makeCompoundListHTML(DOMresults, tr_data.subCompounds, `Compound words (词组) contained in ${trimText(tr_data.text)}`, `No compound words contained in ${trimText(tr_data.text)} found!`)
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

  if(simplified.length >= 6){
    DOMheader.classList.add('tranlsate-fontsmall')
  }

  const DOMdefinitions = document.createElement('ul')
  DOMdefinitions.classList = "translation-definitions"
  for(const d of definitions) DOMdefinitions.innerHTML += `<li>${d}</li>`

  DOMresults.insertAdjacentHTML("beforeend", `<h3>Definitions</h3>`)
  DOMresults.appendChild(DOMdefinitions)
  makeCompoundListHTML(DOMresults, tr_data.compounds, `Compound words (词组) containing ${trimText(tr_data.text)}`, `No compound words using ${trimText(tr_data.text)} found!`)
  if(tr_data.text.length > 2)
    makeCompoundListHTML(DOMresults, tr_data.subCompounds, `Compound words (词组) contained in ${trimText(tr_data.text)}`, `No compound words contained in ${trimText(tr_data.text)} found!`)



  const DOMstrokeOrder = document.createElement('img')
  DOMstrokeOrder.src = tr_data.strokeImgUrl
  DOMstrokeOrder.classList.add('translate-stroke-order')
  DOMresults.appendChild(DOMstrokeOrder)


  if(tr_data.entries.length > 1)
    makeNavChip(DOMdefinitions)
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

function trimText(text, limit = 10){
  if(text.length >= limit) return text.substring(0, limit) + "..."
  return text
}

function isProperNoun(pinyin){
  const capitalRegex = /[A-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙÜǗǙǛ]/;
  return capitalRegex.test(pinyin)
}

/* Explore bar */
let activeExploreTab = 0
/** 
 * @param children is a list of DOM references
 * @param titles is a list of title for each children element
 */
function makeExploreBar(parent, children, titles){
  //make container divs
  const DOMexplore = document.createElement('div')
  DOMexplore.className = 'translation-explore'

  const DOMexploreControls = document.createElement('div')
  DOMexploreControls.classList.add('translation-explore-controls')
  const DOMexplorePanel = document.createElement('div')
  DOMexplorePanel.classList.add('translation-explore-panels')

  DOMexplore.appendChild(DOMexploreControls)
  DOMexplore.appendChild(DOMexplorePanel)
  parent.appendChild(DOMexplore)

  //populate content
  children.forEach((el, idx) => {
    //single control button
    const DOMcontrol = document.createElement('button')
    DOMcontrol.classList.add('explore-control-button')
    DOMcontrol.innerHTML = titles[idx]
    if(idx === 0) DOMcontrol.classList.add('tr-active')
    DOMexploreControls.appendChild(DOMcontrol)

    DOMexplorePanel.appendChild(el)
    if(idx !== 0) el.classList.add('tr-hide')

    DOMcontrol.addEventListener("click", () => {
      DOMexploreControls.childNodes.forEach(btn => {btn.classList.remove('tr-active')})
      DOMcontrol.classList.add('tr-active')
      // DOMexplorePanel.removeChild(DOMexplorePanel.firstChild)
      // DOMexplorePanel.appendChild(el)
    })
  });

}

//HTML helpers. I wish i could write this in react ;-;
function makeNavChip(parent){
  if(!translationPanel){console.log("Error making navchip because translation panel does not exist"); return;}

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

  translationPanel.addEventListener('keydown', (e) => {
    if (e.code === "ArrowRight" && tr_data.page < tr_data.entries.length - 1) {
        tr_data.page++;
        showTranslationPanel();
    } else if (e.code === "ArrowLeft" && tr_data.page > 0) {
        tr_data.page--;
        showTranslationPanel();
    }
  });
  translationPanel.setAttribute('tabindex', 0);
  translationPanel.focus()

  DOMcontrol.appendChild(leftArrow)
  DOMcontrol.appendChild(counter)
  DOMcontrol.appendChild(rightArrow)
  parent.appendChild(DOMcontrol)
}
function makeCompoundListHTML(parent, compounds, blockTitle, blockNoResultsText){
  let DOMcompounds = document.createElement('div')
  parent.appendChild(DOMcompounds)
  DOMcompounds.className = "translate-compounds"

  if(compounds.length == 0){
    DOMcompounds.className = "translate-compounds"
    DOMcompounds.innerHTML = blockNoResultsText
    DOMcompounds.classList.add('translate-no-compounds')
    return
  }

  let DOMcompounds_header = document.createElement('h3')
  DOMcompounds_header.innerHTML = `${blockTitle}`
  let DOMcompounds_elements = document.createElement('div')
  DOMcompounds_elements.className = "translate-comp-entry-container"

  DOMcompounds.appendChild(DOMcompounds_header)
  DOMcompounds.appendChild(DOMcompounds_elements)

  for(let compound of compounds){
    let DOMcomp = document.createElement('div')
    DOMcomp.className = "translate-comp"
    DOMcomp.addEventListener("dblclick", () => {sendQuery(compound.simplified)})

    DOMcompounds_elements.appendChild(DOMcomp)

    let DOMcomp_word = document.createElement('span')
    DOMcomp_word.innerHTML = compound.simplified
    if(isProperNoun(compound.pinyin))
      DOMcomp_word.classList.add('translate-propernoun')
    if(compound.HSK_level){
      DOMcomp_word.classList.add('compound-isHSK')
    }
    DOMcomp.appendChild(DOMcomp_word)

    let DOMcomp_definitions = document.createElement('ul')
    DOMcomp_definitions.innerHTML = `${compound.HSK_level ? "HSK" + compound.HSK_level + " | " : ""}(${compound.pinyin}) Definitions:`
    DOMcomp_definitions.className = "translate-comp-definitions"
    DOMcomp.appendChild(DOMcomp_definitions)
    for (let def of compound.definitions){
      let DOM_comp_def = document.createElement('li')
      DOM_comp_def.innerHTML = def
      DOMcomp_definitions.append(DOM_comp_def)
    }
  }
}

