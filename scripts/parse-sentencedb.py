import json
import re
import regex
sentenceDB_txt = open("sentence_db.txt", "r", encoding="utf-8")

sentencesDB = {}
entry = {}
DELIMETER = "###delimeter###"

pinyinPattern = r"[a-zA-Z0-9⁻₂₄ńβüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ乚]+"
termPattern = r"""
    [a-zA-Z0-9⁻₂₄βπüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ]+    # Match terms with Latin letters, numbers, subscripts, Greek letters, etc.
    | \p{Han}            # Match Chinese characters
    | [\u2E80-\u2EFF]    # Match CJK Radicals Supplement (including ⺮)
    | [\u2F00-\u2FDF]    # Match Kangxi Radicals
"""
excludePattern = r"""
    [\p{P}]  # Match punctuation and symbols to exclude
"""
termRegex = regex.compile(termPattern, regex.VERBOSE)
excludeRegex = regex.compile(excludePattern, regex.VERBOSE)

def verifySentencePinyin(sentence, pinyin, term, log_error):
    matches = termRegex.findall(sentence)
    filtered_matches = [m for m in matches if not excludeRegex.fullmatch(m)]
    wordCount = len(filtered_matches)
    splitPiniyin = [s for s in re.findall(pinyinPattern, pinyin) if s] 
    pinyinCount = len(splitPiniyin)  
    valid = True 
    if wordCount != pinyinCount:
        if log_error:
            print(f"Sentence mismatch found:\n{sentence}\n{pinyin}")
        valid = False
    if not all(char in sentence for char in term):
        if log_error:
            print(f"Word absence found:\n{term}\n{sentence}")
        valid = False
    return valid

def pinyinHotfixes(sentence, pinyin, current_term):
    # pinyin = re.sub(r'\bTáiwān\b', 'Tái Wān', pinyin)
    # pinyin = re.sub(r'\bTáidōng\b', 'Tái Dōng', pinyin)
    # pinyin = re.sub(r'\bTáiběi\b', 'Tái Běi', pinyin)
    pinyin = re.sub(r'\bbǔ捞\b', 'bǔ lāo', pinyin)
    pinyin = re.sub(r'\blián hé guó ān quán lǐ shì huì\b', 'lián hé guó ān lǐ huì', pinyin)
    pinyin = re.sub(r'\bkě néng\b', 'kě néng huì', pinyin)
    pinyin = re.sub(r'\byī bù yī bù\b', 'yī bù bù', pinyin)
    pinyin = re.sub(r'\byīng gāi wàng jì\b', 'yīng wàng jì', pinyin)
    pinyin = re.sub(r'\bπ\b', 'Pài', pinyin)
    pinyin = re.sub(r'\ble yī gè\b', 'le gè', pinyin) # 了一个 -> 了个
    pinyin = re.sub(r'\b([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]{2,})r\b', r'\1 r', pinyin) # wanr -> wan r
    pinyin = re.sub(r'\b([A-Z]) ([A-Z])\b', r'\1\2', pinyin) # AB -> AB

    sentence = re.sub(r'\b~\b', current_term, sentence)
    return sentence, pinyin

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
        valid = verifySentencePinyin(entry["sentence"], entry["pinyin"], current_term, False)
        if not valid:
            entry["sentence"], entry["pinyin"] = pinyinHotfixes(entry["sentence"], entry["pinyin"], current_term)
            verifySentencePinyin(entry["sentence"], entry["pinyin"], current_term, True)

        sentencesDB[current_term].append(entry)
        entry = {}  # Reset entry for the next sentence

sentenceDB_txt.close()

with open("sentence_db.json", "w", encoding="utf-8") as f:
    json.dump(sentencesDB, f, ensure_ascii=False, indent=2)

print("Conversion to JSON complete")
