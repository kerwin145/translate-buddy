import os
import json
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content
from dotenv import load_dotenv
from pathlib import Path
from tqdm import tqdm

load_dotenv()
api_key = os.getenv("GEMINI_KEY")
genai.configure(api_key=api_key)

generation_config = {
  "temperature": 1,
  "top_p": 0.95,
  "top_k": 40,
  "max_output_tokens": 8192,
  "response_schema": content.Schema(
    type = content.Type.OBJECT,
    enum = [],
    required = ["sentences"],
    properties = {
      "sentences": content.Schema(
        type = content.Type.ARRAY,
        items = content.Schema(
          type = content.Type.OBJECT,
          enum = [],
          required = ["chinese-sentence", "sentence-pinyin", "english-translation"],
          properties = {
            "chinese-sentence": content.Schema(
              type = content.Type.STRING,
            ),
            "sentence-pinyin": content.Schema(
              type = content.Type.STRING,
            ),
            "english-translation": content.Schema(
              type = content.Type.STRING,
            ),
          },
        ),
      ),
    },
  ),
  "response_mime_type": "application/json",
}

model = genai.GenerativeModel(
  model_name="gemini-2.0-flash",
  generation_config=generation_config,
  system_instruction="You are a helpful and insightful Chinese AI language teacher. Your responses must strictly follow the JSON format provided in the user's instructions.",
)

def getUserPrompt(term):
    return f'''Use the Chinese term {term} to make some sentences in Chinese with pinyin. Include the English translation as well. 

It is absolutely critical that the sentence contains {term}, and the pinyin matches the characters in the sentence. However, if the term is unknown or uncommon, don't return any sentences; I'd rather not have sentences than have ones with incorrect pinyin or translations. Otherwise, your Chinese sentence selection should be varied. Give 3 to 5 sentences, depending on how many you think is necessary/sufficient to provide a good understanding of usage and meaning. 

Here's some specific rules for sentence-pinyin:
1. For contractions with 儿,  for example: 玩儿, 个儿 etc..., treat the pinyin 儿 as it's own seperate pinyin, "r". For example: 玩儿 is wǎn r; 个儿 is gè r; 点儿 is diǎn r. 
2. For the pinyin, make sure that it includes the tones and that each pinyin is always separated by a space. For example:  Nǐ hǎo , wǒ de péng yǒu.
3. If there's a number, just show the number. For example, 2024

Output only the JSON. The following is an example output for reference; pay close attention to the formatting, especially for the pinyin:
{{"sentences":[
{{"chinese-sentence": "我喜欢学中文","sentence-pinyin": "wǒ xǐ huān xué zhōng wén","english-translation": "I like learning Chinese."}},
{{"chinese-sentence": "他在公园里跑步","sentence-pinyin": "tā zài gōng yuán lǐ pǎo bù","english-translation": "He is running in the park."}},
{{"chinese-sentence": "我2001年出生","sentence-pinyin": "wǒ 2001 nián chū shēng", "english-translation": "I was born in 2001."}},
{{"chinese-sentence": "你住在哪儿？","sentence-pinyin": "nǐ zhù zài nǎ r","english-translation": "Where do you live?"}},
]}}

Here's an example of no sentences if {term} is unknown or uncommon:
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
    
for term in tqdm(terms[startIndex:40]):
    response = model.generate_content(getUserPrompt(term))
    saveSentences(response.text, term)
