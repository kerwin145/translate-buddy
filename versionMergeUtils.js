//UNUSED AS OF NOW

export async function ensureHistoryUsesSync() {
    try {
        const { history } = await new Promise((resolve, reject) => {
            chrome.storage.local.get('history', (result) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(result);
            });
        });

        // Check if 'history' exists in local storage
        if (history) {
            // Step 2: Copy 'history' to sync storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({ history }, () => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    console.log('Copied history to sync storage.');
                    resolve();
                });
            });
        } else {
            console.log('No history found in local storage.');
        }

    } catch (error) {
        console.error('Error copying history to sync:', error);
    }
}
