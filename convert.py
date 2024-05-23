import json

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
        'pinyin': pinyin,
        'definitions': [d for d in definitions if d]
    }

def convert_cedict_to_json(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    entries = []
    for line in lines:
        if line.startswith('#') or not line.strip():
            continue
        entry = parse_cedict_line(line)
        entries.append(entry)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

# Convert CC-CEDICT to JSON
convert_cedict_to_json('cedict_ts.u8', 'cedict.json')
