import os
import json
import re

file_suffixes = ["lvl1.txt", "lvl2.txt", "lvl3.txt", "lvl4.txt", "lvl5.txt", "lvl6.txt", "lvl7-9.txt"]
char_lvls = [set() for _ in range(7)]
word_lvls = [set() for _ in range(7)]

# Populate HSK level data for chars and words
for idx, fname in enumerate(file_suffixes):
    char_file, word_file = f"resources/chars/{fname}", f"resources/words/{fname}"

    with open(char_file, 'r', encoding='utf-8') as file:
        print(char_file)
        char_data = {line.strip().split(None, 1)[1] for line in file}
        char_lvls[idx].update(char_data)

    with open(word_file, 'r', encoding='utf-8') as file:
        print(char_file)
        word_data = {line.strip().split(None, 1)[1] for line in file}
        word_lvls[idx].update(word_data)

pinyin_map = {
    'a': 'āáǎà',
    'e': 'ēéěè',
    'i': 'īíǐì',
    'o': 'ōóǒò',
    'u': 'ūúǔù',
    'ü': 'ǖǘǚǜ'
}

def parse_pinyin(pinyin):
    words = pinyin.split()
    import re

    out = []
    for w in words:
        w = re.sub(r'u:', "ü", w)
        
        if not w[-1].isdigit():
            out.append(w)
            continue
        tone = int(w[-1])
        w = w[:-1]
        if tone == 5:
            out.append(w)
            continue
        
        cur = ""
        vowelFound = False
        for c in w:
            if vowelFound or not c in pinyin_map:
                cur += c
                continue
            vowelFound = True
            cur += pinyin_map[c][tone-1]
        out.append(cur)
    
    return " ".join(out)

def parse_cedict_line(line):
    parts = line.split(' ')
    traditional = parts[0]
    simplified = parts[1]
    pinyin_start = line.find('[')
    pinyin_end = line.find(']')
    pinyin = line[pinyin_start+1:pinyin_end]
    definitions = line[pinyin_end+1:].strip().split('/')
    return {
        'traditional': traditional,
        'simplified': simplified,
        'pinyin': parse_pinyin(pinyin),
        'definitions': [d for d in definitions if d],
        'char_HSK_level': [],
        'word_HSK_level': []
    }

entries = []

# Parse cedict file and put into JSON database
with open('resources/cedict_ts.u8', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('#') or not line.strip():
            continue
        entry = parse_cedict_line(line)
        entries.append(entry)

# Merge HSK info with cedict file
for entry in entries:
    for i, char_set in enumerate(char_lvls):
        if entry['simplified'] in char_set:
            entry['char_HSK_level'].append(i+1)
    for i, word_set in enumerate(word_lvls):
        if entry['simplified'] in word_set:
            entry['word_HSK_level'].append(i+1)

# Write JSON data to file
with open('cedict.json', 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
