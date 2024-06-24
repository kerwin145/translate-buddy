freqMap = {}
with open('data/Char_Freq.txt', 'r', encoding='utf-8-sig') as f:
    for line in f:
        line = line.strip()
        if line.startswith('/*'):
            continue
        tokens = line.split()
        freqMap[tokens[1]] = int(int(tokens[2]) ** .5) * 2