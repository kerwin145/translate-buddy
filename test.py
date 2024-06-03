
output_file_path = "test_out.txt"
pattern = re.compile(r'[\u4E00-\u9FFF]')

with open(f"resources/1", 'r', encoding='utf-8') as file:
    with open(output_file_path, 'a', encoding='utf-8') as output_file:
        for line in file:
            groups = line.split("\t")[1:3]
            output_file.write(".".join(groups) + "\n")  # Write the groups to the output file, joined by a tab and followed by a newline

