import os
import json
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content
from dotenv import load_dotenv
from pathlib import Path
from tqdm import tqdm

load_dotenv()
api_key = os.getenv("API_KEY")
genai.configure(api_key=api_key)

model = genai.GenerativeModel(
  model_name="gemini-1.5-flash",
  generation_config=generation_config,
  system_instruction="You are an effective Chinese language AI instructor",
)

def getUserPrompt(term):
    return f'''Please use the Chinese term {term} to make some sentences in Chinese with pinyin. Include the English translation as well. For the pinyin, make sure that it includes the tones (example: nǐ hǎo), and that there is space between each pinyin, in other words, it is ungrouped. It is absolutely critical that the sentence contains {term} , and the pinyin matches the sentence with no extra pinyin. If the term is uncommon, then don't return any sentences; I'd rather not have sentences than have ones with incorrect pinyin or translations. Otherwise, your sentence selection should be varied to give me a good understanding of usage and meaning.
Output only the JSON. The following is an example output for reference. Note the formatting:
{{"sentences":[
{{"chinese-sentence": "我喜欢学中文","sentence-pinyin": "wǒ xǐ huān xué zhōng wén","english-translation": "I like learning Chinese."}},
{{"chinese-sentence": "他在公园里跑步","sentence-pinyin": "tā zài gōng yuán lǐ pǎo bù","english-translation": "He is running in the park."}}
]}}
Here's an example of no sentences:
{{"sentences":[]}}'''


sentences_path = Path("sentence_db.txt")
startIndex = 0
DELIMETER = "###delimeter###"

# Load terms
with open("terms.txt", "r", encoding="utf-8") as input_file:
    terms = [line.strip() for line in input_file]
# Get start index 
if not sentences_path.exists():
    with open(sentences_path, "w", encoding="utf-8") as file:
        print(f"{sentences_path} created and initialized.")
else:
    with open(sentences_path, "r", encoding="utf-8") as file:
        for line in file:
            if line.strip() == DELIMETER:
                startIndex+=1
        print(f"Starting at index {startIndex}, term {terms[startIndex]}")

sentences_file = open(sentences_path, "a", encoding="utf-8")

def saveSentences(response, term):
        jsonData = json.loads(response)
        sentences = jsonData["sentences"]

        sentences_file.write(term + '\n')
        for sentence in sentences:
            sentences_file.write(sentence["chinese-sentence"] + '\n')
            sentences_file.write(sentence["sentence-pinyin"] + '\n')
            sentences_file.write(sentence["english-translation"] + '\n')
        sentences_file.write(DELIMETER + '\n')
    
for term in tqdm(terms[startIndex:14]):
    response = model.generate_content(getUserPrompt(term))
    saveSentences(response.text, term)
