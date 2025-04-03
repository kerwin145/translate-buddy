import json
import re
import regex
sentenceDB_txt = open("sentence_db_4.txt", "r", encoding="utf-8")

sentencesDB = {}
entry = {}
indexed_dictionary = {}

DELIMETER = "###delimeter###"
dictionary_path = "../../cedict.json"
# Load dictionary
with open(dictionary_path, "r", encoding="utf-8") as file:
    dictionary_data = json.load(file)

for obj in dictionary_data:
    # Index by simplified characters
    key = obj["simplified"]
    indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})

    # Index by traditional characters (if different)
    if obj["simplified"] != obj["traditional"]:
        key = obj["traditional"]
        indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})


pinyinPattern = r"[a-zA-Z0-9⁻₂₄〢πμńm̀…βδüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ乚_]+" # Underscore is a special character for if I want to group pinyin together
pinyinRegex = regex.compile(pinyinPattern)
termPattern = r"""
    [a-zA-Z0-9⁻₂₄〢πμńm̀…βδüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ]+    
    | \p{Han}            # Match Chinese characters
    | [\u2E80-\u2EFF]    # Match CJK Radicals Supplement (including ⺮)
    | [\u2F00-\u2FDF]    # Match Kangxi Radicals
"""
# excludePattern = r"""
#     [\p{P}]  # Match punctuation and symbols to exclude
# """
termRegex = regex.compile(termPattern, regex.VERBOSE)
# excludeRegex = regex.compile(excludePattern, regex.VERBOSE)
wordPresenceExceptions = ["拿你没办法", "天上不会掉馅饼", "给你点颜色看看", "摆了一道", "一对儿"]

def verifySentencePinyin(sentence, pinyin, term, log_error):
    matches = termRegex.findall(sentence)
    # filtered_matches = [m for m in matches if not excludeRegex.fullmatch(m)]
    wordCount = len(matches)
    splitPiniyin = [s for s in regex.findall(pinyinRegex, pinyin) if s]
    pinyinCount = len(splitPiniyin)  
    valid = True 
    if wordCount != pinyinCount:
        if log_error:
            # print(wordCount, pinyinCount)
            # print(matches, splitPiniyin)
            sentence_out = [" "] * len(matches)
            for idx in range(len(matches)):
                if matches[idx] in indexed_dictionary:
                    entry = indexed_dictionary[matches[idx]]
                else:
                    break

                possible_pinyin = [item['pinyin'].lower() for item in entry]
                if idx >= len(splitPiniyin) or not splitPiniyin[idx].lower() in possible_pinyin:
                    sentence_out[idx] = "#"
                    break
                else:
                    sentence_out[idx] = matches[idx]
            print(matches)
            print(splitPiniyin)
            print(f"Sentence mismatch found:\n{"".join(sentence_out)} | {sentence}\n{pinyin}")
        valid = False
    if term.lower() not in wordPresenceExceptions and not all(char.lower() in sentence.lower() for char in term):
        if log_error:
            print(f"Word absence found:\n{term}\n{sentence}")
        valid = False
    return valid

def pinyinHotfixes(sentence, pinyin, current_term):
    # pinyin = re.sub(r'\bTáiwān\b', 'Tái Wān', pinyin)
    # pinyin = re.sub(r'\bTáidōng\b', 'Tái Dōng', pinyin)
    # pinyin = re.sub(r'\bTáiběi\b', 'Tái Běi', pinyin)
    pinyin = re.sub(r'\bbǔ捞\b', 'bǔ lāo', pinyin)
    pinyin = re.sub(r'\bl笼\b', 'lóng', pinyin)
    pinyin = re.sub(r'\by晕n\b', 'yūn', pinyin)
    pinyin = re.sub(r'\by诱导\b', 'yòu dǎo', pinyin)
    pinyin = re.sub(r'\blián hé guó ān quán lǐ shì huì\b', 'lián hé guó ān lǐ huì', pinyin)
    pinyin = re.sub(r'\bxiàn zhèng zài\b', 'xiàn zhèng fǔ zhèng zài', pinyin)
    pinyin = re.sub(r'\bkě néng dǎo\b', 'kě néng huì dǎo', pinyin)
    pinyin = re.sub(r'\byōu diǎn hé quē diǎn\b', 'yōu quē diǎn', pinyin)
    pinyin = re.sub(r'\byī bù yī bù\b', 'yī bù bù', pinyin)
    pinyin = re.sub(r'\byīng gāi wàng jì\b', 'yīng wàng jì', pinyin)
    pinyin = re.sub(r'\bπ\b', 'Pài', pinyin)
    pinyin = re.sub(r'\ble yī gè\b', 'le gè', pinyin) # 了一个 -> 了个
    pinyin = re.sub(r'\b([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]{2,})r\b', r'\1 r', pinyin) # wanr -> wan r
    pinyin = re.sub(r'\b([A-Z]) ([A-Z])\b', r'\1\2', pinyin) # AB -> AB
    pinyin = re.sub(r'\bjìnxíng\b', 'jìn xíng', pinyin) # AB -> AB

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
            entry["sentence"] = re.sub(r" 。$", "。", entry["sentence"])
            verifySentencePinyin(entry["sentence"], entry["pinyin"], current_term, True)

        sentencesDB[current_term].append(entry)
        entry = {}  # Reset entry for the next sentence

sentenceDB_txt.close()

with open("sentence_db_4.json", "w", encoding="utf-8") as f:
    json.dump(sentencesDB, f, ensure_ascii=False, indent=2)

print("Conversion to JSON complete")
