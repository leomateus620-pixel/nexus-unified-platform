"""Independent private OOXML body/text coverage check; no DB/network access."""
import collections
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(sys.argv[1]).resolve(strict=True)
repository = Path(__file__).resolve().parents[2]
if root == repository or repository in root.parents:
    raise ValueError('Customer data must remain outside Git')
audit = json.loads((root / 'docx-bindings-audit.json').read_text())
bindings = {item['arquivo_id']: item for item in audit['files']}
index = json.loads((root / 'docx-conversions/index.json').read_text())
records = []
namespace = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
normalize = lambda value: re.sub(r'\s+', '', value)
for row in index['records']:
    if row['resultado'] != 'convertido':
        continue
    binding = bindings[row['arquivo_id']]
    source = Path(binding['local_path']).resolve(strict=True)
    conversion = Path(row['conversion_path']).resolve(strict=True)
    if root not in source.parents or root not in conversion.parents:
        raise ValueError('Original or conversion escaped private staging')
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != binding['sha256']:
        raise ValueError('Original hash differs from conversion audit')
    with zipfile.ZipFile(source) as archive:
        xml = archive.read('word/document.xml')
    if len(xml) > 8_000_000 or b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise ValueError('Unsafe or oversized Office XML')
    document = ET.fromstring(xml)
    body = document.find(namespace + 'body')
    if body is None:
        raise ValueError('Office body missing')
    # DrawingML/OfficeMath also store visible source text in their own t nodes.
    original_text = ''.join(item.text or '' for item in body.iter() if item.tag.rsplit('}', 1)[-1] == 't')
    converted = json.loads(conversion.read_text())
    native_text = ''.join(
        ''.join(''.join(line) for line in block.get('linhas', []))
        if block['tipo'] == 'tabela'
        else block.get('texto', '') if block['tipo'] in ('titulo', 'paragrafo') else ''
        for block in converted['conteudo']['blocos']
    )
    original_text, native_text = normalize(original_text), normalize(native_text)
    missing = collections.Counter(original_text) - collections.Counter(native_text)
    additional = collections.Counter(native_text) - collections.Counter(original_text)
    records.append({
        'arquivo_id': row['arquivo_id'],
        'source_characters': len(original_text),
        'derived_characters': len(native_text),
        'exact_sequence': original_text == native_text,
        'missing_characters': sum(missing.values()),
        'additional_characters': sum(additional.values()),
        'source_normalized_sha256': hashlib.sha256(original_text.encode()).hexdigest(),
        'derived_normalized_sha256': hashlib.sha256(native_text.encode()).hexdigest(),
    })
summary = {
    'format': 'nexus-docx-text-coverage/1',
    'converter': index['converter'],
    'method': 'Independent Python OOXML body text-node extraction, including Word/DrawingML/OfficeMath t nodes; native paragraph/title/table text excludes generated reference messages; whitespace removed; no visual or mathematical-notation equivalence claim',
    'files': len(records),
    'exact_sequence': sum(row['exact_sequence'] for row in records),
    'missing_character_files': sum(row['missing_characters'] > 0 for row in records),
    'missing_characters': sum(row['missing_characters'] for row in records),
    'additional_characters': sum(row['additional_characters'] for row in records),
    'source_characters': sum(row['source_characters'] for row in records),
    'derived_characters': sum(row['derived_characters'] for row in records),
}
target = root / 'docx-conversions/text-coverage.json'
target.write_text(json.dumps({**summary, 'records': records}, indent=2) + '\n')
os.chmod(target, 0o600)
print(json.dumps(summary))
if summary['missing_characters']:
    sys.exit(2)
