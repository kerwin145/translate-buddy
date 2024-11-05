async function saveSyncWordbank(key, data) {
    const online = await isOnline();

    // Get or initialize wordbank from local storage
    const { wordbank = {} } = await chrome.storage.local.get('wordbank');
    pushDataToWordbank(wordbank, key, data);

    if (online) {
        // Save to both sync and local storage when online
        await chrome.storage.sync.set({ wordbank });
        await chrome.storage.local.set({ wordbank });
    } else {
        // Save to local storage queue if offline
        const { wordbankQueue = [] } = await chrome.storage.local.get('wordbankQueue');
        wordbankQueue.push({ key, data });
        await chrome.storage.local.set({ wordbankQueue });
        console.log(`Connection lost. Saved ${data} to local queue with key ${key}.`);
    }
}

async function handleOnline(){    
    const { wordbankQueue = [] } = await chrome.storage.local.get('wordbankQueue');
    console.log(wordbankQueue)

    if (wordbankQueue.length > 0) {
        const res = await chrome.storage.sync.get('wordbank');
        const wordbank = res.wordbank || {};
        for (const item of wordbankQueue) {
            pushDataToWordbank(wordbank, item.key, item.data)
        }

        await chrome.storage.sync.set({ wordbank });
        await chrome.storage.local.set({ wordbankQueue: [] });
        console.log('Wordbank queue synced to cloud.');
    }
}

function pushDataToWordbank(wordbank, key, data){
    if(wordbank.hasOwnProperty(key)){
        const curData = wordbank[key]
        curData.time = data.time
        if (data.sentence && !curData.mySentences.includes(data.sentence)){
            curData.mySentences.push(data.sentence)
        }
        if (!curData.url.includes(data.url)){
            curData.url.push(data.url)
        }
    }else{
        wordbank[key] = {
            time: data.time,
            url: [data.url],
            mySentences: data.sentence ? [data.sentence] : []
        }
    }
    //has a return for debugging purposes?
    return wordbank
}
async function isOnline() {
    try {
        const response = await fetch('https://www.google.com/generate_204');
        return response.ok;
    } catch (error) {
        return false;
    }
}

// // Event listeners for online and offline events

