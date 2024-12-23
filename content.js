//store state for translation results
let tr_data; //data format is defined in background.js
let translationPanel = null;
let sentencesOnlyWords = false; //variable to toggle for showing only words in sentences tab
let windowSize = 0;
let previousSearchTerm = "" //set in showTranslationPanel for wordbank back button to work

let sesssionEventQueue = []
let queueProcessing = false

// see if resync is needed on page refresh
chrome.storage.local.get('wordbankQueue', (result) => {
  const wordbankQueue = result.wordbankQueue || [];
  if (wordbankQueue.length > 0) { 
    chrome.runtime.sendMessage({ action: "resyncWordBank" })
  }
});

function processEventQueue(){
  while(sesssionEventQueue.length > 0){
    // console.log(document.visibilityState)
    let event = sesssionEventQueue.shift()

    if(document.visibilityState.toLowerCase() !== "visible")
      continue

    let {action, data} = event

    switch(action){
      case "showLoadingPanel":
        tr_data = data
        showTranslationPanel(true)
        break
      case "showTranslationPanel":
        tr_data = data
        showTranslationPanel()
        break
      case "loadSentences":
        if(event.isCached){
          tr_data.sentenceData = processSentenceData(data)
        }else{
          let $html = $(data);
          const table = $html.find('.table').text();
          tr_data.sentenceData = processSentenceData(table)
          chrome.runtime.sendMessage({action: "setCache", data: {key: tr_data.text, value: table}}) //we store table rather than the processed data b/c table is smaller, and processing won't take too long
        }
        processSentences(tr_data.sentenceData, tr_data.sentenceQuery)
        break
      case "showLoadingPanelBasic":
        let $targetElementLoading = $("#wordbank-content")
        $targetElementLoading.text("Loading up dictionary data...")
        break
      case "translate-basic-response":
        tr_data = data
        loadWordBankPanel(data)
        break
      default: 
        // console.log("I don't know...! ;-;")
    }
  }

  queueProcessing = false
}

document.addEventListener('keydown', (event) => {
  if ((event.altKey && event.shiftKey && event.ctrlKey && (event.key === 'd' || event.key === 'D')) ||
    (event.metaKey && event.shiftKey && event.altKey && (event.key === 'd' || event.key === 'D'))) {
    showWordbankPanel();
  }
  else if ((event.altKey && event.shiftKey && event.ctrlKey) || (event.metaKey && event.shiftKey && event.altKey)) {
    const selectedText = window.getSelection().toString();
    if(selectedText){
      sendQuery(selectedText)
    }
  }
});

chrome.storage.session.onChanged.addListener(
  (changes) => {
    sesssionEventQueue.push(changes.data.newValue)
    if(!queueProcessing){
      queueProcessing = true
      processEventQueue()
    }
  });

//check history could be "BACK" "FORWARD" or null
function sendQuery(text, updateHistoryAction = "NEW"){  
  chrome.runtime.sendMessage({action: "translate", updateHistoryAction, text})
}

function panelSetUp(preHtml, postHtml){
  if (translationPanel) 
    closeTranslationPanel();

  // Load the HTML content
  const container = document.createElement('div')
  container.id = "translation-panel"
  container.className = windowSize === 1 ? "translation-panel-expand" : windowSize == 2 ? "translation-panel-expand-2" : ""

  document.body.appendChild(container)

  let baseHtml = `
    <div class = "translate-panel-control">
        <div class="tr-close-btn" title = "Close">&times;</div>
        <div class = "tr-resize-control">
          <div id="tr-size-increase-btn" class = "${windowSize === 2 ? " tr-hide" : ""}" title = "Enlarge window (shortcut: =)">&#128474;</div>
          <div id="tr-size-decrease-btn" class = "${windowSize === 0 ? " tr-hide" : ""}" title = "Reduce window (shortcut: -)">&#128475;</div>
        </div>
    </div>
  `

  container.innerHTML = preHtml + baseHtml + postHtml
  translationPanel = container
  document.addEventListener("dblclick", handleOutsideClick)
  container.querySelector(".tr-close-btn").addEventListener("click", closeTranslationPanel);
  container.querySelector("#tr-size-increase-btn").addEventListener("click", () => resizeWindow(1));
  container.querySelector("#tr-size-decrease-btn").addEventListener("click", () => resizeWindow(-1));
  
  translationPanel.addEventListener('keydown', (e)=>{
    if (e.key === '=') resizeWindow(1)
    else if (e.key === '-') resizeWindow(-1)
    else if (e.key === 'd') showWordbankPanel()
  })

  translationPanel.setAttribute('tabindex', 0);
  translationPanel.focus()
}

function showTranslationPanel(loading = false) {
  previousSearchTerm = tr_data.text
  let historyEmpty = (!tr_data.history) || (tr_data.history.pref.length == 0 && tr_data.history.suff.length == 0)

  let preHtml = `<h2 class = "translate-selectedText">${tr_data.text || ""}</h2>
    <div class = "translate-panel-nav-wrapper">
      <p> ☰ </p>
      <div class = "translate-panel-nav">
        ${tr_data.history?.pref.length > 0 ? `<div id = "tr-nav-back" class = "div-btn">🡠</div>` : ""}
        ${tr_data.history?.suff.length > 0 ? `<div id = "tr-nav-forward" class = "div-btn">🡢</div>` : ""}
        <!-- <div id = "abcdex"> C </div> -->
        <div id = "tr-bank-controls" ${historyEmpty ? `class = "tr-no-border"` : ""}></div>
      </div>
    </div>`
  let postHtml = `<div class="translate-results">
      Loading data...
    </div>`

  panelSetUp(preHtml, postHtml)

  var showBank = $('<img>', { src: chrome.runtime.getURL('images/bank_show.png'), id: 'tr-show-bank', class: 'tr-bank', title: "Show word bank (shortcut: d)" });
  $(".translate-panel-control").append(showBank)
  showBank.on('click', function() {
    showWordbankPanel()  
  });

  translationPanel.querySelector('#tr-nav-back')?.addEventListener("click", () => sendQuery(tr_data.history.pref[tr_data.history.pref.length - 1], "BACK"))
  translationPanel.querySelector('#tr-nav-forward')?.addEventListener("click", () => sendQuery(tr_data.history.suff[0], "FORWARD"))
  //TESTING  translationPanel.querySelector('#abcdex').addEventListener("click", () => chrome.storage.local.set({'history': null}))

  let DOMresults = document.querySelector(".translate-results")
  let DOMheader = document.querySelector(".translate-selectedText")

  if(loading){
    DOMheader.innerHTML = trimText(tr_data.text)
    return
  }

  if (tr_data.entries.length == 0){
    DOMheader.innerHTML = trimText(tr_data.text)

    let DOMcompounds = document.createElement('div')
    DOMcompounds.className = 'translate-compounds-container'
    
    DOMresults.innerHTML = `<div class = "translate-noresults"> Not in my dictionary, sorry! :-( </div>`
    DOMresults.appendChild(DOMcompounds)
    if(tr_data.text.length > 2)
      makeCompoundListHTML(DOMcompounds, tr_data.subCompounds, `Compounds used in ${trimText(tr_data.text)}`, `No compound words used in ${trimText(tr_data.text)} found!`, true)
    makeCompoundListHTML(DOMcompounds, tr_data.compounds, `Compounds using ${trimText(tr_data.text)}`, `No compound words using ${trimText(tr_data.text)} found!`)

    $(".translate-results").addClass('skew-compound-container')

    return
  }

  if(tr_data.HSK_levels){
    let $DOM_HSK = $('<div></div>').addClass('tr-HSK-Lvl').text(`HSK ${tr_data.HSK_levels}`);
    $(translationPanel).prepend($DOM_HSK)
  }

  DOMresults.innerHTML = ""

  let {simplified, traditional, pinyin, definitions} = tr_data.entries[tr_data.page]

  let charResize = ""
  if(windowSize === 0){
    if(tr_data.text.length === 5) charResize = " tr-reduced-size-5"
    if(tr_data.text.length === 6) charResize = " tr-reduced-size-6"
    if(tr_data.text.length > 6) charResize = " tr-reduced-size-max"
  }

  DOMheader.innerHTML = `
    <span>${pinyin}</span>
    <div id = "trans-simp-char" class = "${charResize}">${simplified}</div>
    <div id = "trans-trad-char" class = "${charResize}">${traditional}</div>
    <small>Simplified</small>
    <small>Traditional</small>
  `
  DOMheader.classList.add('translate-header')

  if(simplified.length >= 6){
    DOMheader.classList.add('tranlsate-fontsmall')
  }

  const $DOMdefinitions = $('<div></div>').addClass('translation-definitions');
  const $DOMdefinitionsList =  $('<ul></ul>')
  $.each(definitions, function(index, d) {
      $DOMdefinitionsList.append(`<li>${d}</li>`);
  });
  const $header = $('<h3></h3>').text("Definitions").addClass("header-definitions");
  $(DOMresults).append($header)
  $DOMdefinitions.append($DOMdefinitionsList)
  $(DOMresults).append($DOMdefinitions)
    
  if(tr_data.entries.length > 1)
    makeNavChip($header.get(0))

  let DOMcompounds = document.createElement('div')
  DOMcompounds.className = 'translate-compounds-container'

  if(tr_data.text.length > 2)
    makeCompoundListHTML(DOMcompounds, tr_data.subCompounds, `Compounds used in ${trimText(tr_data.text)}`, `No compound words used in ${trimText(tr_data.text)} found!`, true)
  makeCompoundListHTML(DOMcompounds, tr_data.compounds, `Compounds using ${trimText(tr_data.text)}`, `No compound words using ${trimText(tr_data.text)} found!`)
  DOMresults.appendChild(DOMcompounds)
  if ($('.translate-compounds').length == 1) {
    $('.translate-compounds h3').addClass('tr-sticky');
  }

  const DOMstrokeOrderContainer = document.createElement('a')
  DOMstrokeOrderContainer.setAttribute("href", `https://www.strokeorder.com/chinese/${tr_data.text}`)

  const DOMstrokeOrder = document.createElement('img')
  DOMstrokeOrder.src = tr_data.strokeImgUrl
  DOMstrokeOrder.classList.add('translate-stroke-order')

  DOMstrokeOrderContainer.appendChild(DOMstrokeOrder)

  const DOMsentences = document.createElement('div')
  DOMsentences.innerHTML = "Sentences loading..."
  DOMsentences.classList.add('translate-sentences')

  const exploreChildren = []
  const exploreTitles = []

  if(tr_data.text.length == 1){
    exploreChildren.push(DOMstrokeOrderContainer)
    exploreTitles.push("Stroke order")
  }

  exploreChildren.push(DOMsentences)
  exploreTitles.push("Sentences")

  makeExploreBar(DOMresults, exploreChildren, exploreTitles)
  addWordBankControl();  //async
}

function closeTranslationPanel() {
  if (!translationPanel) return;
  
  document.removeEventListener("dblclick", handleOutsideClick);
  translationPanel.querySelector(".tr-close-btn").removeEventListener("click", closeTranslationPanel);

  translationPanel.remove();
  translationPanel = null;
}

async function showWordbankPanel(){ 
  chrome.runtime.sendMessage({action: "kill-translation"})
  const res = await chrome.storage.sync.get('wordbank');
  let bank_words = []
  if(res && res.wordbank){
    bank_words = Object.keys(res.wordbank)
  }

  console.log("DEBUG WORDBANK")
  console.log(res.wordbank)
  chrome.runtime.sendMessage({action: "sort-wordbank"})

  let preHtml = 
  `  
    <div class = "translate-panel-nav-wrapper">
      <div id = "word-bank-back" class = "div-btn">🡠</div>
    </div>
  `

  let postHtml = 
  `
    <div id ="tr-wordbank">
      <h3>Word Bank</h3>
      <div id = 'wordbank-container'>  
        ${bank_words.length == 0 ?
         `<div>No terms saved to your word bank ... yet! </div>`
          :
          `<div id = 'wordbank-wordlist'></div>
          <div id = 'wordbank-content'> Loading up dictionary data... </div>`
        }
        </div>
      </div>
    </div>
  `
  panelSetUp(previousSearchTerm.length > 0 ? preHtml : "", postHtml)

  $('#word-bank-back').on('click', ()=>{sendQuery(previousSearchTerm)})

  if(bank_words.length == 0) return

  var wordListContainer = $('#wordbank-wordlist')
  bank_words.forEach((term, idx) => {
    let $button = $('<button>', { class: `wordbank-wordlist-row ${idx == 0 ? "tr-wordbank-selected" : ""}`, text: term})
    wordListContainer.append($button)
    $button.on('click', ()=>{
      chrome.runtime.sendMessage({action: "translate-basic-request", text: term})
      $('.wordbank-wordlist-row').removeClass('tr-wordbank-selected')
      $button.addClass("tr-wordbank-selected")
    })
  })

  if(bank_words.length > 0){
    //automatically search the first word 
    chrome.runtime.sendMessage({action: "translate-basic-request", text: bank_words[0]})
  }

}

function loadWordBankPanel(data){
  let $targetElement = $("#wordbank-content")
  if($targetElement){
    let $definitions = $('<div></div>')
    $.each(tr_data.entries, (idx, entry) => {
      $definitions.append($('<div style = "line-height: 1; margin-bottom: 4px" ></div>').text(entry.pinyin))
      let $def = $('<ul></ul>')
      $.each(entry.definitions, (idx, d) => {
        $def.append($('<li></li>').text(d))
      })

      $definitions.append($def)
      if(idx < tr_data.entries.length - 1)
        $definitions.append($('<br>'))
    })
    $targetElement.text('')
    $targetElement.append($definitions)

    let $deleteTerm = $('<div></div>', {class: 'wordbank-delete', text: 'Remove'})
    $deleteTerm.on('click', async ()=>{
      if($deleteTerm.hasClass('wordbank-delete-confirm')){
        await deleteFromWordBank(data.text)
        showWordbankPanel()
      }else{
        $deleteTerm.addClass('wordbank-delete-confirm')
        $deleteTerm.text('Remove term? (Click again to confirm)')
      }
    })

    $deleteTerm.on('mouseleave', ()=>{
      $deleteTerm.removeClass('wordbank-delete-confirm')
      $deleteTerm.text('Remove')
    })

    $targetElement.append($deleteTerm)
    // targetElement.text(tr_data.entries[0].definitions) 
  }
}

function resizeWindow(change){
  const DOMsize_decrease = translationPanel.querySelector("#tr-size-decrease-btn")
  const DOMsize_increase = translationPanel.querySelector("#tr-size-increase-btn")

  windowSize = Math.max(0, Math.min(2, windowSize + change)) //clamp [0,2]
  translationPanel.classList.remove("translation-panel-expand")
  translationPanel.classList.remove("translation-panel-expand-2")

  if(windowSize === 0){
    DOMsize_increase.className = ""
    DOMsize_decrease.className = "tr-hide"
  }
  else if(windowSize === 1){
    DOMsize_increase.className = ""
    DOMsize_decrease.className = ""
    translationPanel.classList.add("translation-panel-expand")
  }else{
    DOMsize_increase.className = "tr-hide"
    DOMsize_decrease.className = ""
    translationPanel.classList.add("translation-panel-expand-2")
  }
}

function handleOutsideClick(event) {
  if (translationPanel && !translationPanel.contains(event.target)) {
    closeTranslationPanel();
  }
}

function trimText(text, limit = 6){
  if(text.length >= limit) return text.substring(0, limit) + "..."
  return text
}

function isProperNoun(pinyin){
  const capitalRegex = /[A-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙÜǗǙǛ]/;
  return capitalRegex.test(pinyin)
}

async function addWordBankControl(){
  var container = $('#tr-bank-controls');
  var deleteWord = $('<img>', { src: chrome.runtime.getURL('images/bank_delete.png'), id: 'tr-delete-bank', class: 'tr-bank', title: "Delete from word bank (click twice to confirm)" });
  var addWord = $('<img>', { src: chrome.runtime.getURL('images/bank_add.png'), id: 'tr-add-bank', class: 'tr-bank', title: "Add term to word bank" });

  deleteWord.on("mouseleave", ()=>{
    deleteWord.removeClass('tr-bank-delete-confirm')
  })
  deleteWord.on("click", async () => {
    if(!deleteWord.hasClass("tr-bank-delete-confirm")){
      deleteWord.addClass("tr-bank-delete-confirm")
    }else{
      deleteFromWordBank(tr_data.text)
      deleteWord.toggleClass('tr-hide')
      deleteWord.toggleClass("tr-bank-delete-confirm")
      addWord.toggleClass('tr-hide')
    }

  });

  addWord.on("click", async () => {
    chrome.runtime.sendMessage({
      action: "saveSync", 
      data:{
        key: tr_data.text, 
        data: {
          time: new Date().toISOString(),
          url: window.location.href,
        }
      }
    })

    deleteWord.toggleClass('tr-hide')
    addWord.toggleClass('tr-hide')
  });

  container.append(deleteWord);
  container.append(addWord);

  const {wordbank = {}} = await chrome.storage.sync.get('wordbank');
  wordbank[tr_data.text] ? addWord.addClass('tr-hide') : deleteWord.addClass('tr-hide')
  
}

/* Explore bar */
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

  DOMexplore.appendChild(DOMexplorePanel)
  parent.appendChild(DOMexploreControls)
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
      children.forEach(c => {c.classList.add('tr-hide')})
      el.classList.remove('tr-hide')
      // DOMexplorePanel.removeChild(DOMexplorePanel.firstChild)
      // DOMexplorePanel.appendChild(el)
    })
  });

}

//HTML helpers. I wish i could write this in react ;-;
function makeNavChip(parent){
  if(!translationPanel){
    // console.log("Error making navchip because translation panel does not exist"); 
    return;
  }

  const DOMcontrol = document.createElement('div')
  DOMcontrol.classList.add("trans-control")

  const rightArrow = document.createElement('span')
  rightArrow.className = 'trans-control-navigate'
  rightArrow.innerHTML = ">"
  rightArrow.title = "Next definition, shortcut: right arrow"
  const leftArrow = document.createElement('span')
  leftArrow.className = 'trans-control-navigate'
  leftArrow.innerHTML = "<"
  leftArrow.title = "Previous definition, shortcut: left arrow"
  const counter = document.createElement('span')
  counter.innerHTML = `${tr_data.page + 1} / ${tr_data.entries.length}`
  
  if(tr_data.page == 0)
    leftArrow.classList.add('tr-nav-disabled')
  if(tr_data.page < tr_data.entries.length - 1)
    rightArrow.addEventListener('click', () => {tr_data.page++; showTranslationPanel(); processSentences(tr_data.sentenceData, tr_data.sentenceQuery)})
  if(tr_data.page == tr_data.entries.length - 1)
    rightArrow.classList.add('tr-nav-disabled')
  if(tr_data.page > 0)
    leftArrow.addEventListener('click', () => {tr_data.page--; showTranslationPanel(); processSentences(tr_data.sentenceData, tr_data.sentenceQuery)})

  translationPanel.addEventListener('keydown', (e) => {
    if (e.code === "ArrowRight" && tr_data.page < tr_data.entries.length - 1) {
        tr_data.page++;
        showTranslationPanel();
        processSentences(tr_data.sentenceData, tr_data.sentenceQuery)
    } else if (e.code === "ArrowLeft" && tr_data.page > 0) {
        tr_data.page--;
        showTranslationPanel();
        processSentences(tr_data.sentenceData, tr_data.sentenceQuery)
    }
  });

  DOMcontrol.appendChild(leftArrow)
  DOMcontrol.appendChild(counter)
  DOMcontrol.appendChild(rightArrow)
  parent.appendChild(DOMcontrol)
}

// @param display mode: if true, it means we are generating a compound list html for "compounds used in"
function makeCompoundListHTML(parent, compounds, blockTitle, blockNoResultsText, displayMode = false){
  let DOMcompounds = document.createElement('div')
  parent.appendChild(DOMcompounds)
  DOMcompounds.className = "translate-compounds"

  if(compounds.length == 0){
    if(displayMode)
      return
    DOMcompounds.innerHTML = blockNoResultsText
    DOMcompounds.classList.add('translate-no-compounds')
    return
  }

  let DOMcompounds_header = document.createElement('h3')
  DOMcompounds_header.innerHTML = `${blockTitle}`
  let DOMcompounds_elements = document.createElement('div')
  DOMcompounds_elements.className = `translate-comp-entry-container`

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

// MACRO where?
function isChineseChar(c){
  return c.codePointAt(0) >= 0x4E00 && c.codePointAt(0) <= 0x9FFF
}

function processSentenceData(str){
  let processed = str.split(/\d+\s{2,}/).filter(x => x.length > 1)
  .map(el => {let spl = el.split(/\n+/); return {rawChinese: spl[0].trim().replace(/\s([\p{P}\p{S}])/gu, '$1'), english:spl[1]}})
  .filter(x => x.rawChinese.length > 0)

  return processed.map(el => {
    const cur = el.rawChinese
    let reversedList = []
    let otherBuffer = []
    let mode = 0 //0 means processing non chinese chars. 1 means chinese char spotted, and keep on finding chinese chars. 2 means chinese char group finished, and now we associate it with pinyin
    let wordBuffer = []
    let pinyinBuffer = []
    for(let i = cur.length-1; i >= 0; i--){
      let c = cur[i]
      switch(mode){
        case 0:
          if(!isChineseChar(c)){ otherBuffer.push(c) }
          else{ 
            mode = 1
            wordBuffer = [c]
            if(otherBuffer.length > 0){
              otherBuffer = otherBuffer.reverse()
              reversedList.push({pinyin: "" , word: otherBuffer.join('')})
              otherBuffer = []
            }
          }
          break
        case 1:
          if(isChineseChar(c)){ wordBuffer.push(c) }
          else{ //time to gather pin yin
            wordBuffer = wordBuffer.reverse()
            pinyinBuffer.push(c)
            mode = 2
          }
          break
        case 2:
          if(c !== ' '){ pinyinBuffer.push(c) }
          else{
            pinyinBuffer = pinyinBuffer.reverse()
            reversedList.push({pinyin: pinyinBuffer.join(''), word: wordBuffer.pop()})
            pinyinBuffer = []
            if(wordBuffer.length === 0){
              mode = 0
            }
          }
          break
      }
    }
    //flush
    if(otherBuffer.length > 0){
      otherBuffer = otherBuffer.reverse()
      reversedList.push({pinyin: "" , word: otherBuffer.join('')})
    }
    if(pinyinBuffer.length > 0 && wordBuffer.length > 0){
      pinyinBuffer = pinyinBuffer.reverse()
      reversedList.push({pinyin: pinyinBuffer.join(''), word: wordBuffer.pop()})
    }

    return {words: reversedList.reverse(), english: el.english}
  })
}
async function processSentences(data, queryUrl){
  const DOMsentences = await  waitForElement('.translate-sentences')

  DOMsentences.innerHTML = ""

  const $attribution = $('<div></div>').addClass('sentences-attribution')
  const textBeforeLink = 'Sentences provided by ';
  const $link = $('<a></a>').attr('href', 'https://www.purpleculture.net').text('Purple Culture');
  $attribution.append(textBeforeLink).append($link);

  if(data.length == 0){
    const $noResults = $('<p></p>').addClass('sentences-no-results').text(`Wow, that's rare. No sentences have been found for ${tr_data.text}. Maybe try again?`)
    $(DOMsentences).append($noResults)
    $(DOMsentences).append($attribution)
    return
  }
  
  if(data.length > 4){
    let front = data.slice(0,2)
    let end = data.slice(2)
    //SHUFFLE IT!
    for(let i = 0; i < end.length/2; i++){
      let newIdx = Math.floor(Math.random() * end.length)
      let temp = end[newIdx]
      end[newIdx] = end[i]
      end[i] = temp
    }
    data = front.concat(end.slice(0,2))
  }

  const $sentencesBlockContainer = $('<div></div>').addClass('sentences-body')

  for(const p of data){
    //jquery hell yeah  
    const $sentenceBlock = $('<div></div>').addClass('sentences-block')
    const $wordsAndPinyin = $('<div></div>').addClass('sentences-line')
    for(let i = 0; i < p.words.length; i++){
      let entry = p.words[i]

      const $single = $('<span></span').addClass('sentences-single')

      const $top = $('<div></div>').addClass('sentences-pinyin')
      if(entry.pinyin.length === 0){
        $top.append($('<wbr>'));
      }
      else
        $top.text(entry.pinyin)

      const $bottom = $('<div></div>').addClass('sentences-words').text(entry.word)
      if(i === p.words.length-1 && entry.word.length === 1 && /[\p{P}\p{S}]/u.test(entry.word))
        $bottom.addClass('zero-width') //if last char is puncutation, make it zero width to stop wrapping behavior

      if(sentencesOnlyWords) 
        $top.addClass('tr-hide');

      $single.append($top).append($bottom)
      $wordsAndPinyin.append($single)
    }

    const $english = $('<div></div>').addClass('sentences-english-tr').text("⟶ " + p.english)
    if(sentencesOnlyWords) 
      $english.addClass('tr-hide');

    $sentenceBlock.append($wordsAndPinyin)
    $sentenceBlock.append($english)

    $sentencesBlockContainer.append($sentenceBlock)
  }
  
  const $sentences_control = $('<div></div>').addClass('sentences-control')
  const $moreLink = $('<a></a>').addClass('sentences-more')
  $moreLink.attr('href', queryUrl).attr('target', '_blank')
  $moreLink.text("More!")
  
  const $toggleContainer = $('<div></div>')
  const $toggleOnlyWords = $('<input>').attr({
    type: 'checkbox',
    id: 'toggle-only-words',
    name: 'Show only words'
  });
  
  if(sentencesOnlyWords) 
    $toggleOnlyWords.prop('checked', true)

  $toggleOnlyWords.on('click', function(){
    if ($(this).is(':checked')) {
      sentencesOnlyWords = true;
      $('.sentences-pinyin').addClass('tr-hide');
      $('.sentences-english-tr').addClass('tr-hide');
    } else {
      sentencesOnlyWords = false;
      $('.sentences-pinyin').removeClass('tr-hide');
      $('.sentences-english-tr').removeClass('tr-hide');
    }
  });
  const $label = $('<label></label>').attr('for', 'Show only words').text('Show only words');

  $toggleContainer.append($label)
  $toggleContainer.append($toggleOnlyWords)

  $sentences_control.append($moreLink)
  $sentences_control.append($toggleContainer)
  
  const $sentenceFooter = $('<div></div>').attr({class: 'sentences-footer'})

  $(DOMsentences).append($sentencesBlockContainer)
  $($sentenceFooter).append($sentences_control)
  $($sentenceFooter).append($attribution)
  $(DOMsentences).append($sentenceFooter)
}

function waitForElement(selector, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 120; // Interval time in milliseconds
    let elapsedTime = 0;

    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      } else {
        elapsedTime += intervalTime;
        if (elapsedTime >= timeout) {
          clearInterval(interval);
          // reject(new Error(`Element not found: ${selector}`));
        }
      }
    }, 100);
  });
}

async function deleteFromWordBank(text){
  const {wordbank = {}} = await chrome.storage.sync.get('wordbank');
  delete wordbank[text];
  await chrome.storage.sync.set({ wordbank });
}
