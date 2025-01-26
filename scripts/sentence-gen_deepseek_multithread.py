import os
import json
from dotenv import load_dotenv
from pathlib import Path
from tqdm import tqdm
from openai import OpenAI
import multiprocessing
import signal

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


def worker(task, api_key, lock):
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    original_index, term = task
    try:
        response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": "You are a helpful and insightful Chinese AI language teacher. Your responses must strictly follow the JSON format provided in the user's instructions."},
            {"role": "user", "content": f'''Use the Chinese term {term} to make some sentences in Chinese with pinyin. Include the English translation as well. For the pinyin, make sure that it includes the tones and that each pinyin is separated by a space; example:  Nǐ hǎo , wǒ de péng yǒu.

It is absolutely critical that the sentence contains {term}, and the pinyin matches the characters in the sentence. However, if the term is unknown or uncommon (for example if it belongs to CJK ideograph extensions), don't return any sentences; I'd rather not have sentences than have ones with incorrect pinyin or translations. Otherwise, your Chinese sentence selection should be varied (3 to 5 sentences) to provide a good understanding of usage and meaning. Avoid highly controversial and innapropriate topics.

Output only the JSON. The following is an example output for reference; pay close attention to the formatting, especially for the pinyin:
{{"sentences":[
{{"chinese-sentence": "我喜欢学中文","sentence-pinyin": "wǒ xǐ huān xué zhōng wén","english-translation": "I like learning Chinese."}},
{{"chinese-sentence": "他在公园里跑步","sentence-pinyin": "tā zài gōng yuán lǐ pǎo bù","english-translation": "He is running in the park."}},
{{"chinese-sentence": "我2001年出生","sentence-pinyin": "wǒ 2001 nián chū shēng": "I was born in 2001."}},
]}}

Here's an example of no sentences if {term} is unknown, uncommon, highly controversial, or innapropriate:
{{"sentences":[]}}'''},
        ],
        stream=False
    )
        content = response.choices[0].message.content
        return original_index, {'status': 'success', 'content': content.strip("```json\n").strip("\n```")}
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
    api_key = os.getenv("API_KEY")

    # Paths and constants
    sentences_path = Path("sentence_db.txt")
    terms_path = "terms.txt"
    DELIMITER = "###delimeter###"

    # Load terms and index
    terms, start_index = load_terms_and_index(sentences_path, terms_path, DELIMITER)

    # Tasks
    terms_to_process = terms[start_index:15000]
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
             multiprocessing.Pool(processes=6, maxtasksperchild=2) as pool:

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