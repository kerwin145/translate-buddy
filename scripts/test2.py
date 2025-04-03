
import json
dictionary_path = "../cedict.json"
# Load dictionary
with open(dictionary_path, "r", encoding="utf-8") as file:
    dictionary_data = json.load(file)

indexed_dictionary = {}
for obj in dictionary_data:
    # Index by simplified characters
    key = obj["simplified"]
    indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})

    # Index by traditional characters (if different)
    if obj["simplified"] != obj["traditional"]:
        key = obj["traditional"]
        indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})

def getUserPrompt(term):
    item = indexed_dictionary[term]
    # For display purposes, join any provided pinyin variants with a separator
    pinyin = " / ".join([entry['pinyin'] for entry in item])
    definition = ""
    if len(item) == 1:
        definition = f" 词语定义：{" / ".join(item[0]['definitions'][0:3])}"
    
    return f'''使用中文词汇 "{term}" 造句。请确保每个句子都包含 "{term}"。(参考信息："{term}" 的拼音: {pinyin}.{definition})'''

print(getUserPrompt("残毒"))

