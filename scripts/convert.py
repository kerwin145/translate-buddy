#TODO: 不 when followed by a word w/ a 4th tone will take 2nd tone instead, except for proper nouns

import os
import json
import re
import math

vowel_map = {
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
        vowels = [c for c in w if c in vowel_map]

        if not w[-1].isdigit():
            out.append(w)
            continue
        tone = int(w[-1])
        w = w[:-1]
        if tone == 5 or len(vowels) == 0:
            out.append(w)
            continue


        # vowel rules from https://web.mit.edu/jinzhang/www/pinyin/spellingrules/index.html
        w_list = list(w)
        idx = w_list.index(vowels[0])

        if len(vowels) == 1:
            w_list[idx] = vowel_map[w_list[idx]][tone-1]
            out.append("".join(w_list))
            continue
        
        medials = ['i', 'u', 'ü']
        if vowels[0] in medials:
            idx2 = w_list.index(vowels[1], idx + 1)
            w_list[idx2] = vowel_map[w_list[idx2]][tone-1]
        else:
            w_list[idx] = vowel_map[w_list[idx]][tone-1]
        
        out.append("".join(w_list))

    return " ".join(out)

def isValidChar(char):
    return (ord('\u4E00') <= ord(char) <= ord('\u9FFF')) or (ord('a') <= ord(char) <= ord('z')) or (ord('A') <= ord(char) <= ord('Z'))

word_count = {}

def parse_cedict_line(line):
    parts = line.split(' ')
    traditional = parts[0]
    simplified = parts[1]
    pinyin_start = line.find('[')
    pinyin_end = line.find(']')
    pinyin = line[pinyin_start+1:pinyin_end]
    definitions = line[pinyin_end+1:].strip().split('/')

    #I love regex ;-;
    pattern_sth = r"(?<!\w)sth(?!\w)" #replace sth with something if not in a word
    pattern_sb  = r"(?<!\w)sb(?!\w)" #same as above but with sb and somebody
    pattern_pinyin_group = r"\[((?:[a-zA-Z:·\-]+\d\s?)+)\]"  # look for stuff like [Huang2Shi2gong1 San1 lu:e4] 
    pattern_pinyin_single = r"(?:[a-zA-Z:·\-]+\d)" # allow splittng of above into individual words
    for i in range(len(definitions)):
        pinyin_group = re.findall(pattern_pinyin_group, definitions[i])
        if len(pinyin_group) > 0:
            definitions[i] = re.sub(pattern_pinyin_group, "[" + parse_pinyin(' '.join(re.findall(pattern_pinyin_single, pinyin_group[0]))) + "]", definitions[i])
        definitions[i] = re.sub(pattern_sth, "something", definitions[i])
        definitions[i] = re.sub(pattern_sb, "somebody", definitions[i])
        definitions[i] = re.sub(r"CL:", "Measure word: ", definitions[i])
        definitions[i] = re.sub(r"\(derog.\)", "(derogatory)", definitions[i])

    for char in simplified:
        if isValidChar(char):
            word_count[char] = word_count.get(char, 0) + 1

    return {
        'traditional': traditional,
        'simplified': simplified,
        'pinyin': parse_pinyin(pinyin),
        'definitions': [d for d in definitions if d],
        'HSK_level': None,
        'HSK_conf': None,
        'word_score_in': 0, #kinda like page rank but not really, low bad high good
        'word_score_ex': 0 
    }

## Prepping hsk data
HSK_LEVELS = 6
words_pinyin_levels = [set() for _ in range(HSK_LEVELS)]
words_levels = [set() for _ in range(HSK_LEVELS)]

# Populate HSK level data for words, where you have word and pinyin combo
for idx in range(HSK_LEVELS):
    with open(f"data/{idx+1}", 'r', encoding='utf-8') as file:
        for line in file:
            groups = line.split("\t")
            words_pinyin_levels[idx].add((groups[0], groups[3].replace(" ", "")))
            words_levels[idx].add(groups[0])

entries = []

cedict_file = open('data/cedict_ts.u8', 'r', encoding='utf-8')
# Parse cedict file and put into JSON database
for line in cedict_file:
    if line.startswith('#') or not line.strip():
        continue
    entry = parse_cedict_line(line)
    entries.append(entry)

# Merge HSK info with cedict file
# First pass will require word and pinyin to match. Second pass only checks pinyin
found = [0] * 6
for entry in entries:
    for i in range(HSK_LEVELS):
        level_set_wp = words_pinyin_levels[i]
        level_set_w = words_levels[i]
        if (entry['simplified'], entry['pinyin'].replace(" ", "")) in level_set_wp and entry['HSK_level'] is None:
            entry['HSK_level'] = i + 1
            entry['HSK_conf'] = 1
            found[i] += 1
            break
        if entry['simplified'] in level_set_w and entry['HSK_level'] is None:
            entry['HSK_level'] = i + 1
            entry['HSK_conf'] = 0
            found[i] += 1
            break
# add word frequency score
word_count_external = {}
with open('data/Char_Freq.txt', 'r', encoding='utf-8-sig') as f:
    for line in f:
        line = line.strip()
        if line.startswith('/*'):
            continue
        tokens = line.split()
        word_count_external[tokens[1]] = int(int(tokens[2]) ** .5) * 2

# update word score
for entry in entries:
    score = 0
    score_ex = 0
    for char in entry['simplified']:
        if isValidChar(char):
            score += 1/word_count[char]
            score_ex += 1/word_count_external.get(char, 1)
    if score > 0:
        entry['word_score_in'] = (1/score * 10000) // 100
        entry['word_score_ex'] = (1/score_ex * 10000) // 100

# give pinyin popularity scores
pinyin_popularities = {}
for entry in entries:
    pinyins = [p for p in entry['pinyin'].split() if p != '-']
    if  len(entry['simplified']) != len(pinyins):
        print(entry['simplified'])
        print(pinyins)
        continue

    for idx, c in enumerate(entry['simplified']):
        pinyin_popularities[(c, pinyins[idx])] = pinyin_popularities.get((c, pinyins[idx]), 0) + 1
for entry in entries:
    if len(entry['simplified']) > 1 or (entry['simplified'], entry['pinyin']) not in pinyin_popularities:
        entry['pinyin_popularity'] = 0
        continue

    entry['pinyin_popularity'] = pinyin_popularities[(entry['simplified'], entry['pinyin'])]
    


print("FOUND:", found)
# Write JSON data to file
if os.path.exists('cedict.json'):
    os.remove('cedict.json')

with open('cedict.json', 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
