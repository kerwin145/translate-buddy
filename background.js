//initializing this here to show structure. Who needs object oriented programming?
let tr_data = {text: "", page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: ""}
const invertedIndex = new Map()
let dictionaryData = null;
let dictionaryDataIndexed = new Map() //allows O(1) retrieval where the key is the simplified word. The value is a list of entries with that key (as a single word can have multiple entries)

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate",
    contexts: ["selection"]
  });
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translate") {
    handleTranslate(request.text, sender.tab.id)
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate" && info.selectionText) {
    handleTranslate(info.selectionText, tab.id)
  }
});

function handleTranslate(text, tabId){
  if(!dictionaryData){
    chrome.tabs.sendMessage(tabId, { action: "nodata"})
  }

  let tr_data = {text: "", page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: ""}
  tr_data.text = text;
  tr_data.page = 0;
  tr_data.entries = sortEntries(dictionaryData.filter(x => x.simplified === text || x.traditional === text), true)
  tr_data.compounds = sortEntries(searchAdjWords(text))
  tr_data.subCompounds = searchSubCompounds(text) 
  if(text.length === 1)
    tr_data.strokeImgUrl = `https://www.strokeorder.com/assets/bishun/guide/${text.charCodeAt(0)}.png`
  
  chrome.storage.local.set({ text }, () => {
    chrome.tabs.sendMessage(tabId, { action: "showTranslationPanel", data: tr_data });
  });
}

fetch(chrome.runtime.getURL('cedict.json'))
  .then(res => res.json())
  .then(data => {dictionaryData = data; buildIndexedDictionary(); buildInvertedIndex()})
  .catch(err => console.error(err))

  //inverted index keeps track of phrases starting with a pair of words
function buildInvertedIndex(){
  console.time('buildInvertedIndexTimer');
  for(const obj of dictionaryData){
    let {simplified, traditional} = obj
    if(simplified.length <= 1) continue

    let s = simplified.substring(0,2)
    let t = traditional.substring(0,2)
    let curValues = invertedIndex.get(s) || []
    curValues.push(simplified)
    invertedIndex.set(s, curValues)
    if(s !== t){
      curValues = invertedIndex.get(t) || []
      curValues.push(traditional)
      invertedIndex.set(t, curValues)
    }
  }
  console.timeEnd('buildInvertedIndexTimer');
  console.log(`${invertedIndex.size} keys in inverted index`)
}

function buildIndexedDictionary(){
  console.time('buildIndexedDictionaryTimer');
  for(const obj of dictionaryData){
    let key = obj.simplified
    let entry = dictionaryDataIndexed.get(key) || []
    entry.push(obj)
    dictionaryDataIndexed.set(key, entry)
    if(obj.simplified !== obj.traditional){
      key = obj.traditional
      entry = dictionaryDataIndexed.get(key) || []
      entry.push(obj)
      dictionaryDataIndexed.set(key, entry)
    }
  }
  console.timeEnd('buildIndexedDictionaryTimer');
  console.log(`${dictionaryDataIndexed.size} keys in indexed dictionary`)
}

function searchAdjWords(word){
  if(!dictionaryData) return null
  let out = dictionaryData.filter(
    entry => (!(entry.simplified.length === 1 || entry.simplified === word || entry.traditional === word))
            && (entry.simplified.includes(word) || entry.traditional.includes(word)))
  // console.log(out)
  return out
}

function searchSubCompounds(sentence = ""){
  if(!dictionaryData || sentence.length <= 2) return []
          
  //first populate wordmap. Each element is a group of 2 words mapped to the position they appear
  let wordMap = new Map();
  for (let i = 0; i < sentence.length - 1; i++) {
    let key = sentence.substring(i, i + 2);
    if (!invertedIndex.has(key))
      continue
    let positions = wordMap.get(key) || [];
    positions.push(i);
    wordMap.set(key, positions);
  }
  
  let candidates = [] //elements include: {Phrase, indexes where the phrase could start at}
  for(let word of wordMap.keys()){
    let allPhrases = invertedIndex.get(word)
    let possibleIndexes = wordMap.get(word)
    //walk through all phrases including the word
    for(let phrase of allPhrases){
      if(phrase !== sentence)
          candidates.push({phrase, indexes: possibleIndexes})
    }
  }

  let compounds = []
  //see if candidates match
  for(let c of candidates){
    let validIndexes = []
    for (let idx of c.indexes){
      if(idx + c.phrase.length > sentence.length) continue

      let testStr = sentence.substring(idx, idx + c.phrase.length)
      if(testStr === c.phrase){  
        validIndexes.push(idx)
      }
    }
    if(validIndexes.length > 0){
      compounds.push({phrase: c.phrase, indexes: validIndexes})
    }
  }

  //do a join on these with the dictionary. 
  compounds = compounds.map(compound =>{
    let entry = sortEntries(dictionaryDataIndexed.get(compound.phrase))[0]
    return {...entry, indexes: compound.indexes}
  })

  return compounds.sort((a,b) => a.indexes[0] - b.indexes[0])
}

function isProperNoun(pinyin){
  const capitalRegex = /[A-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙÜǗǙǛ]/;
  return capitalRegex.test(pinyin)
}

function sortEntries(entries, properNounPenealty = false){
  if (tr_data.text == "" || entries.length <= 1)
      return entries

  //Remove translations consisting only of "surname" and "variant of", as they are least useful
  let { lowPriority, highPriority } = entries.reduce((acc, x) => {
    let count = 0
    for (let d of x.definitions){
      //differentiate old variant of and variant of
      if (d.includes("surname") || d.includes("variant of") || d.includes("used in ") || d.includes("(archaic)"))
        count++
    }

    if (count == x.definitions.length || (properNounPenealty && isProperNoun(x.pinyin)))
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
    if (a.HSK_level != null && b.HSK_level != null && a.HSK_level - b.HSK_level !== 0) return a.HSK_level - b.HSK_level;
    
    if (a.HSK_conf == 1 && b.HSK_conf == 0) return -1
    if (a.HSK_conf == 0 && b.HSK_conf == 1) return 1

    return b.word_rank - a.word_rank
  });

  return highPriority.concat(lowPriority);
}
