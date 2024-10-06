# Setup
To set up, you will have to download the chinese english dictionary from https://www.mdbg.net/chinese/dictionary?page=cedict

Unzip, and run convert.py

# Todo

The stuff below here are QoL future features that would differentiate this app from the common translating website
### Phase 2: Personalized app, using local storage
- Personal word bank: User can add word to their word bank
    - Automatically saves the website it is translated from, and allow user to input, as an example sentence, the entire sentence where the word appeared from. If possible, allow seeking to that sentence when user clicks the link (most possible to do for static html pages)
- Clicking extension icon will show popup of words in word bank
    - Clicking words would display its relevant info, allowing user to add more example sentences should they like (reject if word is not present in example sentence)
- If user translates a word already in the word bank, an icon will appear to show that, and allow them to add current website and another example sentence to the entry in local storage
- Add search function for word list
- Add export function for user's word list

### Phase 3: translate + study buddy
- Improve popup UI to display a randomized set of words each day for review
    - User can tick a word of the day (wotd) if they feel confident (the word will still stay, but it's just a visual thing)
    - User can also decide to target and choose a wotd if they don't think a certain wotd is worth reviewing. 
    -  If user doesn't like the entire list or wants to study a new list, user can refresh it
    - The number of wotd will grow a rate of O(sqrt(n)), or O(log(n)) to keep pace with the size of the user's dictionary, but not be overwhelming
- User can have a list of favorited words (capped at a certain number, maybe proportional to number of words saved)
    - Make a UI feature to only show those favorited words.
    - User can possibly allow the favorite status to auto disappear after a set time period
- User can have a list of unfavored words
    - Useful for later, in flash cards 
- Statistics
    - Save how many times a word has appeared as a wotd, and also times it has been ticked off
    - Potentially, include number of times user has initiated interactions on that word, whether it be translated from a website, or clicked from the user's word list. This allows a new sorting option, for how common/important the word is to the user
- Flash cards
    - Basically simplified quizlet. The user can decide to quiz themselves on a randomized set of words from the word list, or their entire word list
    - Allow an option to exclude unfavored words from appearing
    - Possibly allow saving the result of the quiz, including words quizzed, for future review or stat analysis on performance
- Tagging (idk if I want to implement, as the feature is kind of bloating)
    - Users can tag words, so they can be grouped
    - Allows for flash card quiz generation on a group of tagged words

### Future direction
Phase 2 and 3, and parts of Phase 1 (excluding HSK stuff) can be generalized. Ideally, this code could be easily remodified to support another dictionary for a different langauge.

# Remarks
Big thanks to 
- https://github.com/glxxyz/hskhsk.com/tree/main/website/public for the 2012 HSK word list data, allowing translation entries to be assigned with their HSK levels
- https://www.purpleculture.net/ for example sentence data
- https://www.strokeorder.com/chinese/ for stroke order diagrams

