import os
import json
import re

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
        definitions[i] = re.sub(r"CL:", "Measure word: ", definitions[i])

    return {
        'traditional': traditional,
        'simplified': simplified,
        'pinyin': parse_pinyin(pinyin),
        'definitions': [d for d in definitions if d],
        'HSK_level': None,
        'HSK_conf': None
    }

## merging hsk data

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

# Parse cedict file and put into JSON database
with open('data/cedict_ts.u8', 'r', encoding='utf-8') as f:
    for line in f:
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

print("FOUND:", found)
# Write JSON data to file
with open('cedict.json', 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)