import json
import re
import regex
sentenceDB_txt = open("sentence_db.txt", "r", encoding="utf-8")

sentencesDB = {}
entry = {}
DELIMETER = "###delimeter###"

pinyinPattern = r"[a-zA-Z0-9⁻₂₄βüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ]+"
termPattern = r"""
    [a-zA-Z0-9⁻₂₄β]+    # Match terms with Latin letters, numbers, subscripts, Greek letters, etc.
    | \p{Han}         # Match Chinese characters
"""
excludePattern = r"""
    [\p{P}\p{S}]  # Match punctuation and symbols to exclude
"""
termRegex = regex.compile(termPattern, regex.VERBOSE)
excludeRegex = regex.compile(excludePattern, regex.VERBOSE)

def verifySentencePinyin(sentence, pinyin):
    matches = termRegex.findall(sentence)
    filtered_matches = [m for m in matches if not excludeRegex.fullmatch(m)]
    wordCount = len(filtered_matches)
    splitPiniyin = [s for s in re.findall(pinyinPattern, pinyin) if s] 
    pinyinCount = len(splitPiniyin)   
    if wordCount != pinyinCount:
        print(f"Issue found:\nSentence:{sentence}\nPinyin:{pinyin}\n")

def pinyinHotfixes(pinyin):
    pinyin = re.sub(r'\bTáiwān\b', 'tái wān', pinyin)
    pinyin = re.sub(r'\bTáidōng\b', 'tái dōng', pinyin)
    return pinyin

current_term = None 

for line in sentenceDB_txt:
    line = line.strip() 
    if line == DELIMETER:
        if current_term and entry:
            sentencesDB[current_term].append(entry)
        entry = {}
        current_term = None  
    elif current_term is None:
        current_term = line
        sentencesDB[current_term] = []  
    elif "sentence" not in entry:
        entry["sentence"] = line
    elif "pinyin" not in entry:
        # line = re.sub('#', ' ', line)
        entry["pinyin"] = line
    elif "translation" not in entry:
        entry["translation"] = line
        sentence, pinyin = entry["sentence"], entry["pinyin"]
        pinyin = pinyinHotfixes(pinyin)
        verifySentencePinyin(sentence, pinyin)
        sentencesDB[current_term].append(entry)
        entry = {}  # Reset entry for the next sentence

sentenceDB_txt.close()

with open("sentence_db.json", "w", encoding="utf-8") as f:
    json.dump(sentencesDB, f, ensure_ascii=False, indent=2)

print("Conversion to JSON complete")
