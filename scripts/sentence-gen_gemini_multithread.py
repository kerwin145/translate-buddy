import os
import json
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content
from dotenv import load_dotenv
from pathlib import Path
from tqdm import tqdm
import multiprocessing
import signal

with open("../cedict.json", "r", encoding="utf-8") as file:
    dictionary_data = json.load(file)

SYSTEM_PROMPT = ('''
你是一位知识渊博、理解力强、教学高效的中文教师。请严格按照以下要求作答：

【输出格式】
1. 只输出 JSON 格式，不要包含任何额外说明或注释。JSON 必须为一个对象，包含键 "sentences"，其值为一个句子数组。
   例如：
   {
     "sentences": [
       {"chinese-sentence": "我应该学好中文。", "sentence-pinyin": "wǒ yīng gāi xué hǎo zhōng wén。", "english-translation": "I should learn Chinese well."},
       {"chinese-sentence": "每天早晨，他一步一步地向山上走去。", "sentence-pinyin": "měi tiān zǎo chén, tā yī bù yī bù dì xiàng shān shàng zǒu qù。", "english-translation": "Every morning, he walked up the mountain step by step."},
       {"chinese-sentence": "我2001年出生，在一个充满活力的城市里长大。", "sentence-pinyin": "wǒ 2001 nián chū shēng, zài yī gè chōng mǎn huó lì de chéng shì lǐ zhǎng dà。", "english-translation": "I was born in 2001, and I grew up in a vibrant city."},
       {"chinese-sentence": "马村区是河南省焦作市的一个市辖区。", "sentence-pinyin": "mǎ cūn qū shì hé nán shěng jiāo zuò shì de yī gè shì xiá qū。", "english-translation": "Macun District is a district under the jurisdiction of Jiaozuo City, Henan Province."}
     ]
   }

【句子要求】
2. 每个生成的中文句子必须包含指定的词汇。
3. 如果指定的词汇非常生僻、未知，或是古代不常用的字词，则输出空的句子列表，即 {"sentences": []}。
4. 针对 "{term}" 的句子应具有多样性。请根据需要提供 3 到 5 个句子，以充分传达用法和含义。

【拼音要求】
5. 为每个中文句子提供一个完全对应的拼音版本，要求：
    - 每个拼音音节之间必须用单个空格隔开；
    - 拼音中必须包含声调；
    - 汉字与拼音一一对应；
    - 如果句子中包含数字或英文字母，则保持其原样。
    - 对于带儿化音的词，例如“玩儿”或“个儿”，拼音中的“儿”应作为独立的音节（写作 r）。例如：
        - 中文句子："他在公园里玩儿得特别高兴，还买了点儿吃的。"
        - 对应拼音："tā zài gōng yuán lǐ wán r de tè bié gāo xìng, hái mǎi le diǎn r chī de。"
【参考信息中的多音】
6. 如果参考信息中提供了多种拼音读音，请使用斜杠（/）分隔，例如 "nǐ hǎo / ní hǎo"。这种表示方式是可以接受的，但在生成的句子中，每个汉字只应对应一种正确的发音。

请严格按照以上要求生成输出。
'''
    )
    
indexed_dictionary = {}
for obj in dictionary_data:
    # Index by simplified characters
    key = obj["simplified"]
    indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})

    # Index by traditional characters (if different)
    if obj["simplified"] != obj["traditional"]:
        key = obj["traditional"]
        indexed_dictionary.setdefault(key, []).append({"pinyin": obj['pinyin'], "definitions": obj['definitions']})

def load_terms_and_index(sentences_path, terms_path, delimiter):
    start_index = 0
    # Load terms
    with open(terms_path, "r", encoding="utf-8") as input_file:
        terms = [line.strip() for line in input_file]

    # Determine start index
    if sentences_path.exists():
        with open(sentences_path, "r", encoding="utf-8") as file:
            for line in file:
                if line.strip() == delimiter:
                    start_index += 1
    else:
        with open(sentences_path, "w", encoding="utf-8") as file:
            print(f"{sentences_path} created and initialized.")
    return terms, start_index

def getUserPrompt(term):
    item = indexed_dictionary[term]
    # For display purposes, join any provided pinyin variants with a separator
    pinyin = " / ".join([entry['pinyin'] for entry in item])
    definition = ""
    if len(item) == 1:
        definition = f" 词语定义：{" / ".join(item[0]['definitions'][0:3])}"

    return f'''使用中文词汇 "{term}" 造句。参考信息："{term}" 的拼音: {pinyin}.{definition}
请严格按照系统提示要求输出 JSON，并确保句子正确地使用 "{term}"'''

def worker(task, api_key, lock):
    original_index, term = task

    genai.configure(api_key=api_key)
        # Create the model
    generation_config = {
    "temperature": 0,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 4094,
    "response_mime_type": "text/plain",
    }

    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=generation_config,
        system_instruction=SYSTEM_PROMPT,
    )

    chat_session = model.start_chat(
    history=[
        {
        "role": "user",
        "parts": [getUserPrompt(term),
        ],
        }
    ]
    )
    try:
        response = chat_session.send_message("INSERT_INPUT_HERE")
        answer = response.text
        return original_index, {'status': 'success', 'content': answer.strip("```json\n").strip("\n```")}
    except Exception as e:
        print(f"Error with term {term}: {e}")
        return original_index, {'status': 'error', 'term': term}

def save_sentences(response, term, file_handle, delimiter):
    try:
        json_data = json.loads(response)
        sentences = json_data.get("sentences", [])
        file_handle.write(f"{term}\n")
        for s in sentences:
            chinese = s.get("chinese-sentence", "")
            pinyin = s.get("sentence-pinyin", "")
            translation = s.get("english-translation", "")
            file_handle.write(f"{chinese}\n{pinyin}\n{translation}\n")
        file_handle.write(f"{delimiter}\n")
        file_handle.flush()
    except json.JSONDecodeError:
        print(f"Failed to parse JSON for term: {term}")
        with open(Path("error_terms.txt"), "a", encoding="utf-8") as errFile:
            errFile.write(f"{term}\n")
        file_handle.write(f"{term}\n{delimiter}\n")
    except Exception as e:
        print(f"Error processing {term}: {str(e)}")
        with open(Path("error_terms.txt"), "a", encoding="utf-8") as errFile:
            errFile.write(f"{term}\n")
        file_handle.write(f"{term}\n{delimiter}\n")

def sigint_handler(sig, frame, pool, shutdown_flag):
    print("\nReceived shutdown signal, finishing current tasks...")
    shutdown_flag.set()
    pool.terminate()
    pool.join()

if __name__ == '__main__':
    # Load environment variables
    load_dotenv()
    api_key = os.getenv("GEMINI_KEY")
    # Create the model
    genai.configure(api_key=api_key)
    generation_config = {
        "temperature": 0,
        "top_p": 0.95,
        "top_k": 50,
        "max_output_tokens": 4096,
        "response_mime_type": "text/plain",
    }

    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=generation_config,
        system_instruction=SYSTEM_PROMPT
    )

    # Paths and constants
    sentences_path = Path("sentence_db.txt")
    terms_path = "terms.txt"
    DELIMITER = "###delimeter###"
            
    # Load terms and index
    terms, start_index = load_terms_and_index(sentences_path, terms_path, DELIMITER)
    print(f"Starting at term {start_index}, {terms[start_index]}")

    # Tasks
    terms_to_process = terms[start_index:36000]
    tasks = [(start_index + i, term) for i, term in enumerate(terms_to_process)]

    # Multiprocessing setup
    shutdown_flag = multiprocessing.Event()
    manager = multiprocessing.Manager()
    buffer = manager.dict()
    lock = manager.Lock()
    current_index = manager.Value('i', start_index)

    try:
        with open(sentences_path, "a", encoding="utf-8") as sentences_file, \
             tqdm(total=len(tasks)) as pbar, \
             multiprocessing.Pool(processes=5, maxtasksperchild=2) as pool:

            def result_handler(result):
                idx, response = result
                with lock:
                    term = terms[idx]
                    buffer[idx] = (response, term)
                    while current_index.value in buffer:
                        data, term = buffer.pop(current_index.value)
                        if data['status'] == 'success':
                            save_sentences(data['content'], term, sentences_file, DELIMITER)
                        else:
                            with open(Path("error_terms.txt"), "a", encoding="utf-8") as error_file:
                                error_file.write(f"{term}\n")
                                error_file.flush()
                            sentences_file.write(f"{term}\n{DELIMITER}\n")
                            sentences_file
                        current_index.value += 1
                        pbar.update(1)

            signal.signal(signal.SIGINT, lambda sig, frame: sigint_handler(sig, frame, pool, shutdown_flag))
            for task in tasks:
                pool.apply_async(worker, args=(task, api_key, lock), callback=result_handler)

            pool.close()
            pool.join()

    except KeyboardInterrupt:
        pass
    finally:
        with lock:
            while current_index.value in buffer:
                data, term = buffer.pop(current_index.value)
                if data['status'] == 'success':
                    save_sentences(data['content'], term, sentences_file, DELIMITER)
                else:
                    with open(Path("error_terms.txt"), "a", encoding="utf-8") as error_file:
                        error_file.write(f"{term}\n")
                    sentences_file.write(f"{term}\n{DELIMITER}\n")
                current_index.value += 1