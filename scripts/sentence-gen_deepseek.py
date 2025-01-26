import os
import json
from dotenv import load_dotenv
from pathlib import Path
from tqdm import tqdm
from openai import OpenAI

load_dotenv()
api_key = os.getenv("API_KEY")

client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

def getSentenceResponse(term):
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": "You are a helpful and insightful Chinese AI language teacher. Your responses must strictly follow the JSON format provided in the user's instructions."},
            {"role": "user", "content": f'''Use the Chinese term {term} to make some sentences in Chinese with pinyin. Include the English translation as well. For the pinyin, make sure that it includes the tones and that each pinyin is separated by a space; example:  Nǐ hǎo , wǒ de péng yǒu.

It is absolutely critical that the sentence contains {term}, and the pinyin matches the characters in the sentence. If the term is unknown or uncommon, don't return any sentences; I'd rather not have sentences than have ones with incorrect pinyin or translations. Otherwise, your sentence selection should be varied (3 to 5 sentences) to provide a good understanding of usage and meaning.

Output only the JSON. The following is an example output for reference; pay close attention to the formatting, especially for the pinyin:
{{"sentences":[
{{"chinese-sentence": "我喜欢学中文","sentence-pinyin": "wǒ xǐ huān xué zhōng wén","english-translation": "I like learning Chinese."}},
{{"chinese-sentence": "他在公园里跑步","sentence-pinyin": "tā zài gōng yuán lǐ pǎo bù","english-translation": "He is running in the park."}},
{{"chinese-sentence": "我2001年出生","sentence-pinyin": "wǒ 2001 nián chū shēng": "I was born in 2001."}},
]}}

Here's an example of no sentences:
{{"sentences":[]}}'''},
        ],
        stream=False
    )
    # Extract the content field
    content = response.choices[0].message.content
    # Remove the Markdown-style JSON code block markers
    cleaned_content = content.strip("```json\n").strip("\n```")
    return cleaned_content


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
    try:
        # Attempt to parse the response as JSON
        jsonData = json.loads(response)
        
        # Ensure the "sentences" key exists
        if "sentences" not in jsonData:
            raise KeyError(f"The key 'sentences' is missing in the response for term: {term}")
        
        sentences = jsonData["sentences"]
        
        # Write the term and sentences to the file
        sentences_file.write(term + '\n')
        for sentence in sentences:
            sentences_file.write(sentence["chinese-sentence"] + '\n')
            sentences_file.write(sentence["sentence-pinyin"] + '\n')
            sentences_file.write(sentence["english-translation"] + '\n')
        sentences_file.write(DELIMETER + '\n')
    
    except json.JSONDecodeError as e:
        print(f"JSON decoding failed for term: {term}")
        print("Response content:")
        print(response)
        print(f"Error: {e}")
        raise
    except KeyError as e:
        print(f"Key error for term: {term}")
        print("Response content:")
        print(response)
        print(f"Error: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error for term: {term}")
        print("Response content:")
        print(response)
        print(f"Error: {e}")
        raise
    
for term in tqdm(terms[startIndex:1000]):
    response = getSentenceResponse(term)
    saveSentences(response, term)
