//initializing this here to show structure. Who needs object oriented programming?
tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", useImgCache: false, sentenceData: null, sentenceQuery: null, history: {}}
const invertedIndex = new Map()
let dictionaryData = null;
let dictionaryDataIndexed = new Map() //allows O(1) retrieval where the key is the simplified word. The value is a list of entries with that key (as a single word can have multiple entries)
let translationProcessingKilled = false

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate",
    contexts: ["selection"]
  });
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translate") {
    console.log("Recieved translate request")
    translationProcessingKilled = false
    processTranslation(request.text, request.updateHistoryAction)
  } 
  else if (request.action === "translate-basic-request"){
    processTranslationBasic(request.text)
  }
  else if(request.action === "setCache"){
    updateCache(request.data.key, request.data.value)
  }else if(request.action === "kill-translation"){
    console.log("Request to kill translation recieved")
    translationProcessingKilled = true
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate" && info.selectionText) {
    translationProcessingKilled = false
    processTranslation(info.selectionText)
  }
});

async function loadDictionaryData(text, basic = false){
  if(!dictionaryData){  
    if(!basic){
      await chrome.storage.session.set({data: {action: "showLoadingPanel", data: {text}}})
    }else{
      await chrome.storage.session.set({data: {action: "showLoadingPanelBasic"}})
    }

    const res = await fetch(chrome.runtime.getURL('cedict.json'))
    const data = await res.json()
    dictionaryData = data; 
    buildIndexedDictionary(); 
    buildInvertedIndex()
  }
}

async function processTranslation(text, updateHistoryAction = "NEW"){
  await loadDictionaryData(text)

  text = text.replace(/\s/g, "")
  const sentenceQuery = `https://www.purpleculture.net/sample_sentences/?word=${text}`
  let targetEntries = searchWordAndProcessHSK(text)

  tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", sentenceData: null, sentenceQuery, history: null}
  tr_data.text = text;
  tr_data.page = 0;
  tr_data.entries = sortEntries(targetEntries, true)
  tr_data.compounds = sortEntries(searchAdjWords(text))
  tr_data.subCompounds = searchSubCompounds(text) 
  tr_data.strokeImgUrl = `https://www.strokeorder.com/assets/bishun/guide/${text.charCodeAt(0)}.png`

  
  if(text.length === 1)
    tr_data.strokeImgUrl = `https://www.strokeorder.com/assets/bishun/guide/${text.charCodeAt(0)}.png`

  tr_data.history = await updateHistory(text, targetEntries.length == 0 ? "NONE" : updateHistoryAction)
  
  if(translationProcessingKilled)
    return

  await chrome.storage.session.set({data: {action: "showTranslationPanel", data: tr_data}})
  if(targetEntries.length == 0)
    return

  try{
    //get sentences
    let data = await queryCache(text)
    if(data){
      console.log("Hit sentence cache :o")
      await chrome.storage.session.set({data: { action: "loadSentences", data, isCached: true }})
    }else{
      console.log("Missed sentence cache :(")
      let sentenceData = await fetch(sentenceQuery)
      let html = await sentenceData.text()
      await chrome.storage.session.set({data: { action: "loadSentences", data: html, isCached: false}})
    }
  } catch (e) {console.log(e)}
}

async function processTranslationBasic(text){
  await loadDictionaryData(text, true)

  text = text.replace(/\s/g, "")
  const sentenceQuery = `https://www.purpleculture.net/sample_sentences/?word=${text}`
  let targetEntries = searchWordAndProcessHSK(text)

  tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", sentenceData: null, sentenceQuery, history: null}
  tr_data.text = text;
  tr_data.page = 0;
  tr_data.entries = sortEntries(targetEntries, true)
  tr_data.compounds = sortEntries(searchAdjWords(text))
  await chrome.storage.session.set({data: { action: "translate-basic-response", data: tr_data }})
}

async function updateHistory(text, updateHistoryAction){
  const res = await chrome.storage.local.get('history')
  const history = res.history || { entries: [], idx: 0 };
  let { idx, entries } = history;

  if(updateHistoryAction === "BACK" && idx > 0){
    if(text === entries[idx])
      idx -= 2
    else
      idx -= 1
  }
  else if(updateHistoryAction === "FORWARD" && idx < entries.length)
    idx += 1
  else if(updateHistoryAction === "NEW" && entries[entries.length - 1] !== text){
    entries = entries.slice(0, idx) //remove all forward
    entries.push(text)
    if(entries.length > 16)
      entries.shift() //the array shall be maxed at 16
    idx = entries.length 

  }else if(updateHistoryAction === "NONE" && idx === entries.length){ //Don't ask how I got to this, but it works. The goal is for non-result words to not impede the history
    idx = entries.length + 1
  }
  
  const pref = entries.slice(0, idx-1)
  const suff = updateHistoryAction === "NEW" ? [] : entries.slice(idx, entries.length)

  chrome.storage.local.set({ history: {entries, idx}})

  return {pref, suff}
}

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

function searchWordAndProcessHSK(text){
  let entries = dictionaryData.filter(x => x.simplified === text || x.traditional === text)
  let levels = []
  entries.forEach(entry => {
    if(entry.HSK_level != null && !levels.some(x => x === entry.HSK_level)) levels.push(entry.HSK_level)
  });
  levels = levels.sort((a,b) => a-b)
  tr_data.HSK_levels = levels.join(", ")
  return entries
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
      d = d.toLowerCase()
      //differentiate old variant of and variant of
      if (d.includes("surname") || d.includes("variant of") || d.includes("used in") || d.includes("(archaic)"))
        count++
    }

    if (count == x.definitions.length || (properNounPenealty && isProperNoun(x.pinyin)))
        acc.lowPriority.push(x);
     else 
        acc.highPriority.push(x);
    return acc;
  }, { lowPriority: [], highPriority: [] });

  lowPriority = lowPriority.map( x => {
    //high values go last
    if (x.definitions.some(d => d.toLowerCase().includes("used in")))
      return {defs: x, val: 1}
    if (x.definitions.some(d => d.toLowerCase().includes("surname")))
      return {defs: x, val: 2}
    if (x.definitions.some(d => d.toLowerCase().includes("variant of")))
      return {defs: x, val: 3}
    if (x.definitions.some(d => d.toLowerCase().includes("(archaic)")))
      return {defs: x, val: 4}
    else return {defs: x,  val: 99}
  }).sort((a,b) => a.val - b.val).map(x => x.defs)

  highPriority = highPriority.sort((a, b) => {
    if(a.HSK_level != null && b.HSK_level == null) return -1
    if(a.HSK_level == null && b.HSK_level != null) return 1
    if (a.HSK_level != null && b.HSK_level != null && a.HSK_level - b.HSK_level !== 0) return a.HSK_level - b.HSK_level;
    
    if (a.HSK_conf == 1 && b.HSK_conf == 0) return -1
    if (a.HSK_conf == 0 && b.HSK_conf == 1) return 1

    if(b.word_score_ex !== a.word_score_ex)
      return b.word_score_ex - a.word_score_ex
    
    return b.word_score_in - a.word_score_in
  });

  return highPriority.concat(lowPriority);
}

//Handle cache
const MAX_CACHE_SIZE = 500;
async function getCache() {
  // await chrome.storage.local.clear() 
  const result = await chrome.storage.local.get('cache')
  return result.cache || {}
}

async function setCache(cache) {
  await chrome.storage.local.set({ cache })
  // console.log(await chrome.storage.local.getBytesInUse())
}

async function updateCache(key, value) {
  let cache = await getCache();
  if (Object.keys(cache).length >= MAX_CACHE_SIZE) {
      let oldestKey = null
      let oldestTimestamp = Infinity
      for (const [k, v] of Object.entries(cache)) {
          if (v.timestamp < oldestTimestamp) {
              oldestTimestamp = v.timestamp
              oldestKey = k
          }
      }
      if (oldestKey) 
        delete cache[oldestKey]
    }

  // console.log(cache)
  cache[key] = { data: value, timestamp: Date.now() }
  await setCache(cache)
}

async function queryCache(key) {
  let cache = await getCache()
  if (cache[key]) {
      // Update timestamp
      cache[key].timestamp = Date.now()
      await setCache(cache)
      return cache[key].data
  }
  return null
}
