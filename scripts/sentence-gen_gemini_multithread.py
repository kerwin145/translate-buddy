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

SYSTEM_PROMPT = "你是一位知识渊博、理解力强、教学高效的中文教师。如果指定的词汇非常生僻，请不返回任何句子。此外，每个拼音（即使是专有名词）都必须单独分开，各音节之间以空格隔开。"
    
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
    pinyin = " / ".join([entry['pinyin'] for entry in item])
    definition = ""
    if len(item) == 1 and len(item[0]['definitions']) == 1:
        definition = "词语定义是 " + item[0]['definitions'][0]

    return f'''使用中文词汇 "{term}" 来造一些中文句子。请在不同的字段中分别提供句子的拼音和英文翻译。
参考信息：它的拼音是 {pinyin}。{definition if definition != "" else ""}

只输出 JSON。以下是一个参考输出示例；请特别注意格式，尤其是拼音部分。请确保每个拼音音节之间都用空格隔开。
{{"sentences":[
{{"chinese-sentence": "我应该学好中文。","sentence-pinyin": "wǒ yīng gāi xué hǎo zhōngwén。","english-translation": "I should learn Chinese well."}},
{{"chinese-sentence": "每天早晨，他一步一步地向山上走去。","sentence-pinyin": "Měi tiān zǎo chén, tā yī bù yī bù dì xiàng shān shàng zǒu qù。","english-translation": "Every morning, he walked up the mountain step by step."}},
{{"chinese-sentence": "我2001年出生，在一个充满活力的城市里长大。","sentence-pinyin": "wǒ 2001 nián chū shēng，zài yī gè chōng mǎn huó lì de chéng shì lǐ zhǎng dà。","english-translation": "I was born in 2001, and I grew up in a vibrant city."}},
{{"chinese-sentence": "有点饿了，去吃点东西吧。","sentence-pinyin": "yǒu diǎn è le，qù chī diǎn dōng xī ba。","english-translation": "I'm a little hungry, let's go eat something."}},
{{"chinese-sentence": "马村区是河南省焦作市的一个市辖区。", "sentence-pinyin": "Mǎ cūn qū shì Hé Nán shěng Jiāo Zuò shì de yī gè shì xiá qū。", "english-translation": "Macun District is a district under the jurisdiction of Jiaozuo City, Henan Province."}}
]}}

如果 "{term}" 不常用或未知，以下是没有句子的示例：
{{"sentences":[]}}

以下是关于中文句子的一些重要规则：
1. 句子中必须包含 "{term}"，并且拼音必须与句子中的汉字完全匹配。
2. 如果 "{term}" 不常用或未知，不要返回任何句子；我宁愿没有句子，也不要返回拼音或翻译不正确的句子。
3. 针对 "{term}" 的句子应具有多样性。请根据需要提供 3 到 5 个句子，以充分传达用法和含义。

关于句子拼音的一些重要规则：
1. 不要在原始中文句子中添加不存在的拼音。
2. 对于带儿化音的词，例如：玩儿、个儿等，拼音中的“儿”应作为单独的部分，用空格隔开，即 "r"。例如：玩儿 应写作 wǎn r。
3. 确保拼音包含声调，并且每个拼音之间始终用空格分隔。例如：Nǐ hǎo , wǒ de péng yǒu.
4. 如果出现数字，则直接显示数字。例如：2024。
5. 对于包含英文字母的缩写（如 ABCDE），请保持字母连在一起。'''

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
    terms_to_process = terms[start_index:3000]
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