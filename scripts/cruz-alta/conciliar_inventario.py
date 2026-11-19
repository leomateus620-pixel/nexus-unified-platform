"""Concilia a árvore recursiva obtida pelo Drive com o inventário técnico revisado.

Entrada da listagem: JSON com id, title, mime_type, size, modified_time, folder
por arquivo. "folder" é o caminho relativo obtido durante a recursão. Os originais
locais são nomeados por ID e extensão MIME ou estão no caminho relativo original.
Somente leitura da árvore e dos binários. A confirmação editorial ocorre no Nexus.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


def digest(path):
    hash_value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hash_value.update(chunk)
    return hash_value.hexdigest()


def under(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Caminho fora da pasta selecionada: {relative}")
    return path


def reconcile(source, originals, reviewed):
    previous = {row["sourceId"]: row for row in reviewed}
    result = [row for row in reviewed if row["folder"] == "Anexo recebido"]
    seen = set()
    for item in source:
        key, mime, size = item["id"], item["mime_type"], int(item["size"])
        if key in seen:
            raise ValueError(f"ID de origem repetido: {key}")
        seen.add(key)
        candidates = [under(originals, key + "." + mime.split("/")[-1]),
                      under(originals, Path(item["folder"]) / item["title"])]
        path = next((file for file in candidates if file.is_file() and file.stat().st_size == size), None)
        sha = digest(path) if path else None
        old = previous.get(key)
        if old and sha and old["sha256"] == sha:
            result.append(dict(old, size=size, originalName=item["title"], folder=item["folder"]))
            continue
        result.append(dict(sourceId=key, sha256=sha, size=size, mime=mime, originalName=item["title"],
                           folder=item["folder"], documentKey=old["documentKey"] if old else "origem-" + key,
                           title=item["title"], revision=None, date=None, pages=None, page=None,
                           scope=old["scope"] if old else "evidencia", objectKeys=[], status="pendente",
                           note="Conferir conteúdo alterado, carimbo, data e destinos antes da publicação."
                           if sha else "Original local ausente ou tamanho divergente da fonte."))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--arvore", required=True, type=Path)
    parser.add_argument("--originais", required=True, type=Path)
    parser.add_argument("--revisado", required=True, type=Path)
    parser.add_argument("--saida", required=True, type=Path)
    args = parser.parse_args()
    if args.saida.exists():
        parser.error("Escolha um novo caminho de saída para preservar o inventário revisado.")
    prior = json.loads(args.revisado.read_text())
    rows = reconcile(json.loads(args.arvore.read_text()), args.originais.resolve(), prior)
    with args.saida.open("x") as out:
        out.write(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    sources = {r["sourceId"] for r in rows}
    print(json.dumps({"registros": len(rows), "situacoes": Counter(r["status"] for r in rows),
                      "ausentes_na_arvore_atual": [r["sourceId"] for r in prior if r["sourceId"] not in sources]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
