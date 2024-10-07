
//TODO: Make it so super key only is important in fallback
async function saveToSync(key, value, superKey = null) {
    if (superKey) {
        const { [superKey]: existingData = [] } = await chrome.storage.sync.get(superKey);
        existingData.push(value); 

        // Check online status before saving
        if (navigator.onLine) {
            await chrome.storage.sync.set({ [superKey]: existingData });
            console.log(`Saved ${value} to ${superKey} in sync storage.`);
        } else {
            // Fallback to local storage if the connection drops
            const { queue = [] } = await chrome.storage.local.get('queue');
            queue.push({ key: superKey, value, superKey });
            await chrome.storage.local.set({ queue });
            console.log(`Connection lost. Saved ${value} to local queue under ${superKey}.`);
        }
    } else {
        // Check online status before saving
        if (navigator.onLine) {
            await chrome.storage.sync.set({ [key]: value });
            console.log(`Saved ${key} to sync storage.`);
        } else {
            // Fallback to local storage if the connection drops
            const { queue = [] } = await chrome.storage.local.get('queue');
            queue.push({ key, value, superKey });
            await chrome.storage.local.set({ queue });
            console.log(`Connection lost. Saved ${value} to local queue with key ${key}.`);
        }
    }
}

window.saveToSync = saveToSync

/*
Usage of Super key. Suppose data is like
{
books: {{name: "book1"}, {name: "book2"}},
cache: ["Item 1", "Item 2"]
}

We can save to books directly if we specify superkey as "books"

NOTE: Superkey must not be nested in another super key , ie it must be top level
*/
async function handleOnline() {
    const { queue = [] } = await chrome.storage.local.get('queue');

    while (queue.length > 0) {
        const {key, value, superKey} = queue.pop()
        
        if (!superKey){
            await chrome.storage.sync.set({ [key]: value });
            if(!navigator.onLine){
                console.log("Stopping merge as we are offline")
                break
            }
            //If user is still online at this point, then we can safely say the item from queue is processed
            await chrome.storage.local.set({ queue });
            console.log(`Merged ${value} from queue to ${key} in sync storage.`);
            continue
        }
        //else
        switch(superKey){
            //Update value format: "{sentence: "abc", time: JS-TIME, url: "test-url"}"
            case "wordbank":
                const { [superKey]: existingData = {} } = await chrome.storage.sync.get(superKey);

                if (!existingData.hasOwnProperty(key)) {
                    existingData.key.mySentences = [value.sentence]
                    existingData.key.time = value.time
                    existingData.key.url = [value.url]
                    await chrome.storage.sync.set({ [superKey]: existingData });
                    console.log(`Added ${value} to ${superKey} in sync storage.`);
                } else {
                    // Kinda inefficient but who cares at this point ;-;
                    if (!existingData.key.mySentences.includes(value.sentence)){
                        existingData.key.mySentences.push(value.sentence)
                    }
                    existingData.key.time = value.time
                    if (!existingData.key.url.includes(value.url)){
                        existingData.key.url.push(value.url)
                    }
                    await chrome.storage.sync.set({ [superKey]: existingData });
                }
            break;
        }
        if(!navigator.onLine){
            console.log("Stopping merge as we are offline")
            break
        }
        await chrome.storage.local.set({ queue });
        console.log(`Merged ${value} from queue to ${key} in sync storage.`);
    }
}

// Event listeners for online and offline events
window.addEventListener('online', handleOnline);

// Example usage
// async function performSave() {
//     const dataToSave = { /* your data here */ };
//     const superKey = 'mySuperKey'; // Example super key
//     await saveToSync('myData', dataToSave, superKey);
// }
