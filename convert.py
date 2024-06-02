import os
import json
import re

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

    #I love regex ;-;
    pattern_sth = r"(?<!\w)sth(?!\w)" #replace sth with something if not in a word
    pattern_sb  = r"(?<!\w)sb(?!\w)" #same as above but with sb and somebody
    pattern_pinyin_group = r"\[((?:[a-zA-Z:]+\d\s?)+)\]"  # look for stuff like [Huang2Shi2gong1 San1 lu:e4] 
    pattern_pinyin_single = r"(?:[a-zA-Z:]+\d)" # allow splittng of above into individual words
    for i in range(len(definitions)):
        pinyin_group = re.findall(pattern_pinyin_group, definitions[i])
        if len(pinyin_group) > 0:
            definitions[i] = re.sub(pattern_pinyin_group, "[" + parse_pinyin(' '.join(re.findall(pattern_pinyin_single, pinyin_group[0]))) + "]", definitions[i])
        definitions[i] = re.sub(pattern_sth, "something", definitions[i])
        definitions[i] = re.sub(pattern_sb, "somebody", definitions[i])

    return {
        'traditional': traditional,
        'simplified': simplified,
        'pinyin': parse_pinyin(pinyin),
        'definitions': [d for d in definitions if d],
        'HSK_level': "",
    }

## merging hsk data

HSK_LEVELS = 6
words_levels = [set() for _ in range(HSK_LEVELS)]

# Populate HSK level data for words, where you have word and pinyin combo
for idx in range(HSK_LEVELS):
    with open(f"resources/{idx+1}", 'r', encoding='utf-8') as file:
        for line in file:
            # print(line.strip().split(None, 3))
            word, pinyin = line.strip().split(None, 3)[1:3]
            print((word, pinyin))
            words_levels[idx].add((word, pinyin))

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
    for i, level_set in enumerate(words_levels):
        if (entry['simplified'], entry['pinyin']) in level_set:
            entry['HSK_level'] = i+1
        else:
            entry['HSK_level'] = None

# Write JSON data to file
with open('cedict.json', 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
