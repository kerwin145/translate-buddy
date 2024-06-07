import os

out_path = 'compounds_out.txt'

if os.path.exists(out_path):
    os.remove(out_path)


with open('data/cedict_ts.u8', 'r', encoding='utf-8') as f:
    with open(out_path, 'a', encoding='utf-8') as output_file:
        charCount = 0
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            parts = line.split(' ')
            simplified = parts[1]
            if len(simplified) > 1:
                charCount += len(simplified) + 2
                if charCount > 2000:
                    output_file.write(simplified + '\n')
                    charCount = 0
                else:
                    output_file.write(simplified + '|')