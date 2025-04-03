importScripts('saveSync.js')
// Get data from local storage
/*
chrome.storage.local.get(null).then((localData) => {
  console.log("Local Storage:", localData);

  // Get data from sync storage
  chrome.storage.sync.get(null).then((syncData) => {
      console.log("Sync Storage:", syncData);
  }).catch((error) => {
      console.error("Error fetching sync storage:", error);
  });
}).catch((error) => {
  console.error("Error fetching local storage:", error);
});
*/

//initializing this here to show structure. Who needs object oriented programming?
tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", useImgCache: false, sentenceData: null, history: {}}
const invertedIndex = new Map()
let dictionaryData = null;
let dictionaryDataIndexed = new Map() //allows O(1) retrieval where the key is the simplified word. The value is a list of entries with that key (as a single word can have multiple entries)
let translationProcessingKilled = false
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
// sentence partitions; will cache 5 partitions max. {partition_idx : {Sentence dict, priority})
class SentenceDB {
  constructor(maxSize = 5) {
      this.maxSize = maxSize;
      this.cache = new Map();
  }

  // Get sentence and update LRU order if partition exists. Else, remove LRU and add new partition
  async #queryPartition(partition_idx){
      const sentenceDict = this.cache.get(partition_idx);
      if(sentenceDict){
          console.log(`Partition ${partition_idx} already loaded in cache: ${Array.from(this.cache.keys())}`)
          this.cache.delete(partition_idx);
          this.cache.set(partition_idx, sentenceDict);
          return sentenceDict
      }

      // partition idx doesn't exist and we are full cache. we shall push out LRU
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        console.log(`LRU cache full. Pushing out ${firstKey}`)
          this.cache.delete(firstKey);
      }

      try{
        console.log(`Loading in partition ${partition_idx}`)
        const res = await fetch(chrome.runtime.getURL(`partitions/${partition_idx}.json`))
        const newSentenceDict = await res.json();
        this.cache.set(partition_idx, newSentenceDict);
        return newSentenceDict
      }catch(e){console.log(e)}

      return null

  }

  async getExampleSentence(term, partition_idx){
      const partition = await this.#queryPartition(partition_idx)
      return partition[term]
  }
}
const sentenceDB = new SentenceDB()

// Add right click menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate",
    contexts: ["selection"]
  });
});
// Message Listeners
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  const {action, data} = request
  if (action === "translate") {
    console.log("Recieved translate request")
    translationProcessingKilled = false
    processTranslation(request.text, request.updateHistoryAction)
  } 
  else if (action === "translate-basic-request"){
    processTranslationBasic(request.text)
  }
  else if(action === "sort-wordbank"){
    sortForWordBank()
  }
  else if(action === "kill-translation"){
    console.log("Request to kill translation recieved")
    translationProcessingKilled = true
  } else if (action === "saveSync"){
    console.log("SaveSync requested")
    saveSyncWordbank(data.key, data.data)
  } else if (action === "resyncWordBank"){
    handleOnline()
  }
});
// Click listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate" && info.selectionText) {
    translationProcessingKilled = false
    console.log("TRANSLATING")
    processTranslation(info.selectionText)
  }
});

performVersionCheck()

//Version checks
async function performVersionCheck() {
  try {
      const currentVersionData = {
          Word_Bank: 2,
      };

      const storedVersionData = await new Promise((resolve, reject) => {
        chrome.storage.sync.get(['versionData'], (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result ? result.versionData : null);
        });
      });

      //version 1 is when sync storage has been implemented.
      if(!storedVersionData || !storedVersionData.Word_Bank || storedVersionData.Word_Bank < 1){
        console.log("Updating version")
        //clear cache
        const {wordbank} = await chrome.storage.local.get('wordbank')
        if(wordbank){
          console.log("Syncing deprecated local word bank to cloud")
          for (const [key, value] of Object.entries(wordbank)) {
            console.log(key)
            await saveSyncWordbank(key, value)
          }
        }
      }

      if(!storedVersionData || !storedVersionData.Word_Bank || storedVersionData.Word_Bank < 2){
        console.log("Clearing cache")
        await chrome.storage.local.set({cache: {}})
      }

      await new Promise((resolve, reject) => {
        const updatedVersionData = {
          ...storedVersionData,
          Word_Bank: currentVersionData["Word_Bank"]
        };
        chrome.storage.sync.set({ "versionData": updatedVersionData }, () => {
          if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError);
          }
          resolve();
        });
      });

  } catch (error) {
      console.error('Error during version check:', error);
  }
}

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
    buildIndexedDictionary()
    buildInvertedIndex()
  }
}

async function processTranslation(text, updateHistoryAction = "NEW"){
  await loadDictionaryData(text)

  text = text.replace(/\s/g, "")
  tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", sentenceData: null, history: null}
  let targetEntries = searchWordAndProcessHSK(text)
  tr_data.text = text;
  tr_data.page = 0;
  tr_data.entries = sortEntries(targetEntries, true)
  tr_data.compounds = sortEntries(searchAdjWords(text))
  tr_data.subCompounds = searchSubCompounds(text) 
  tr_data.strokeImgUrl = `https://www.strokeorder.com/assets/bishun/guide/${text.charCodeAt(0)}.png`

  if(text.length === 1)
    tr_data.strokeImgUrl = `https://www.strokeorder.com/assets/bishun/guide/${text.charCodeAt(0)}.png`

  tr_data.history = await updateHistory(text, targetEntries.length == 0 ? "NONE" : updateHistoryAction)

  if(translationProcessingKilled){
    console.log("Trasnlation killed")
    return
  }

  await chrome.storage.session.set({data: {action: "showTranslationPanel", data: tr_data}})

  if(targetEntries.length == 0)
    return

  try{
    //get sentences
    simplified_text = tr_data.entries[0]["simplified"]
    let data = await queryCache(simplified_text)
    if(data){ console.log("Hit generic sentence cache :o")}
    else{
      console.log("Missed generic cache :(")
      data = await processSentencedbRequest(simplified_text)
      updateCache(simplified_text, data)
    }
    chrome.storage.session.set({data: { action: "loadSentences", data}})
  } catch (e) {console.log(e)}
}

async function processTranslationBasic(text){
  await loadDictionaryData(text, basic = true)

  text = text.replace(/\s/g, "")
  let targetEntries = searchWordAndProcessHSK(text)

  tr_data = {text: "", HSK_levels: null, page: null, entries: [], compounds: [], subCompounds: [], strokeImgUrl: "", sentenceData: null, history: null}
  tr_data.text = text;
  tr_data.page = 0;
  tr_data.entries = sortEntries(targetEntries, true)
  tr_data.compounds = sortEntries(searchAdjWords(text))
  await chrome.storage.session.set({data: { action: "translate-basic-response", data: tr_data }})
}

async function updateHistory(text, updateHistoryAction){
  const res = await chrome.storage.sync.get('history')
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

  chrome.storage.sync.set({ history: {entries, idx}})

  return {pref, suff}
}

async function processSentencedbRequest(term){
  const partitionPercentiles = [0.0, 1000.0, 2460.0, 3754.0, 4935.5, 6070.0, 7210.5, 8364.28125, 9593.0, 10950.0, 12523.5, 14283.5, 16476.5, 19241.0, 23184.0625, 30196.6875, 290200.0]
  const entry = dictionaryDataIndexed.get(term)[0]
  const score = (entry["word_score_ex"] + entry["word_score_in"])/2
  partition_idx = 0
  while (partition_idx < 15 &&  score > partitionPercentiles[partition_idx + 1])
    partition_idx += 1
  const sentences = await sentenceDB.getExampleSentence(term, partition_idx)
  return sentences
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
 
async function sortForWordBank(sortMode = "default"){
  await loadDictionaryData(null, basic = true)
  console.log("Sorting wordbank")
  const res = await chrome.storage.sync.get('wordbank') || [];
  if (!res || res.wordbank.length == 0){
    return []
  }

  const entries = Object.keys(res.wordbank).map(word => dictionaryDataIndexed.get(word)).filter(Boolean) //aka filter out falsey values
  console.log(entries)
}

function searchAdjWords(word){
  if(!dictionaryData) return null
  let out = dictionaryData.filter(
    entry => (!(entry.simplified.length === 1 || entry.simplified === word || entry.traditional === word))
            && (entry.simplified.includes(word) || entry.traditional.includes(word)))
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
    
    if(b.word_score_in !== a.word_score_in)
      return b.word_score_in - a.word_score_in
    return b.pinyin_popularity - a.pinyin_popularity
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

