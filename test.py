import json
count = 1
f = open('cedict.json', 'r', encoding = 'utf-8')
jsonData = json.load(f)
words = set()
for el in jsonData:
    count += 1
    str = el['simplified']
    if len(str) < 2:
        continue
    words.add(str[0:2])
    words.add(el['traditional'][0:2])
print(len(words))
print(count)