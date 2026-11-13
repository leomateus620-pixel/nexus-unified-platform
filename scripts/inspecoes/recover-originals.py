#!/usr/bin/env python3
"""Restore pending inspection PDF originals from an authorized export; private inputs/receipts only."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[2]
PROJECT = "yhtgijtllvgzoqtfcgal"
ORG = "abab473b-8baa-4781-aed2-c1243338af65"
ROOT = f"https://{PROJECT}.supabase.co/storage/v1"
DIRECT = f"https://{PROJECT}.storage.supabase.co/storage/v1"
BUCKET = "inspecoes-acervo"
MIB = 1024 * 1024
MAX_PDF = 150 * MIB
TUS_CHUNK = 6 * MIB


def private(path):
    path = Path(path).expanduser().resolve()
    if path.is_relative_to(REPO):
        raise ValueError("Use um diretório privado, fora do repositório.")
    return path


def digest_stream(stream, destination=None, cap=MAX_PDF):
    md5, sha = hashlib.md5(), hashlib.sha256()
    prefix = stream.read(8)
    if not prefix.startswith(b"%PDF-"):
        raise ValueError("Candidato não é PDF.")
    size = 0
    block = prefix
    while block:
        size += len(block)
        if size > cap:
            raise ValueError("PDF excede o limite histórico.")
        md5.update(block)
        sha.update(block)
        if destination:
            destination.write(block)
        block = stream.read(MIB)
    return md5.hexdigest(), sha.hexdigest(), size


def write_private(path, data):
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf8")
    tmp.replace(path)


def plan(archive, pending, folder):
    folder.mkdir(parents=True, exist_ok=True)
    rows = json.loads(private(pending).read_text())
    expected = {row["md5"]: row for row in rows}
    if len(rows) != len(expected) or not all(re.fullmatch(r"[a-f0-9]{32}", k or "") for k in expected):
        raise ValueError("O mapa remoto exige um MD5 distinto por original pendente.")
    previous = folder / "lote.json"
    old = {row["id"]: row for row in json.loads(previous.read_text())} if previous.is_file() else {}
    jobs = []
    with ZipFile(private(archive)) as zipped:
        for entry in zipped.infolist():
            parts = entry.filename.split("/")
            if entry.is_dir() or len(parts) != 3 or parts[1] != "01-laudos-originais" or not parts[2].lower().endswith(".pdf"):
                continue
            if entry.file_size > MAX_PDF:
                raise ValueError("Candidato excede o limite histórico.")
            with zipped.open(entry) as source:
                md5, sha, size = digest_stream(source)
            row = expected.get(md5)
            if not row:
                continue
            ident = row["id"]
            if not re.fullmatch(r"[a-f0-9-]{36}", ident) or any(job["id"] == ident for job in jobs):
                raise ValueError("Identidade de destino inválida ou repetida.")
            path = folder / (ident + ".pdf")
            with zipped.open(entry) as source, path.open("wb") as output:
                if digest_stream(source, output) != (md5, sha, size):
                    raise ValueError("Falha na releitura do ZIP.")
            existing = old.get(ident)
            if existing and existing["sha256"] != sha:
                raise ValueError("O arquivo de uma transferência existente divergiu.")
            name = existing["caminho"] if existing else f"{ORG}/{ident}/{secrets.token_urlsafe(24)}/original.pdf"
            jobs.append({**row, "caminho": name, "sha256": sha, "bytes": size, "mime": "application/pdf"})
    if len(jobs) != len(rows):
        raise ValueError(f"Foram conferidos {len(jobs)} de {len(rows)} originais pendentes.")
    write_private(previous, jobs)
    print(json.dumps({"originais": len(jobs), "bytes": sum(x["bytes"] for x in jobs),
                      "acima_de_50_mib": sum(x["bytes"] > 50 * MIB for x in jobs)}))


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def plan_jobs(folder, group):
    rows = json.loads((folder / "lote.json").read_text())
    return [r for r in rows if group == "all" or (r["bytes"] > 50 * MIB) == (group == "large")]


def sql_grants(rows):
    values = ",\n".join("(" + ",".join(quote(x) for x in (r["caminho"], str(r["bytes"]), r["mime"], r["sha256"])) +
                       ",now()+interval '35 minutes')" for r in rows)
    return ("insert into nexus_inspecoes_transferencia.objetos(caminho,bytes,mime,sha256,expira_em) values\n" + values +
            "\non conflict(caminho) do update set criado_em=now(),expira_em=excluded.expira_em "
            "where (objetos.bytes,objetos.mime,objetos.sha256)=(excluded.bytes,excluded.mime,excluded.sha256);")


def sql_verify(folder, rows):
    confirmed = json.loads((folder / "releitura.json").read_text())
    statements = []
    for row in rows:
        if confirmed.get(row["id"]) != row["sha256"]:
            continue
        payload = {k: row[k] for k in ("id","nome","legenda","ordem","origem","caminho","sha256","bytes","mime")}
        payload.update({"estado": "original_verificado", "papel": "original"})
        statements.append(
            "  if not exists(select 1 from storage.objects where bucket_id='inspecoes-acervo' and name="
            + quote(row["caminho"]) + " and metadata->>'size'=" + quote(str(row["bytes"]))
            + " and metadata->>'mimetype'='application/pdf') then raise exception 'Binário do lote indisponível.'; end if;\n"
            + "  perform public.inspecoes_importar_arquivo(" + quote(ORG) + ",'documentos'," + quote(row["source_id"])
            + "," + quote(json.dumps(payload, ensure_ascii=False)) + "::jsonb);")
    if not statements:
        raise ValueError("Nenhum original relido nesta etapa.")
    cleanup = "  delete from nexus_inspecoes_transferencia.objetos where caminho in (" + ",".join(
        quote(r["caminho"]) for r in rows) + ");"
    return "do $restauracao$ begin\n" + "\n".join(statements) + "\n" + cleanup + "\nend $restauracao$;"


def headers():
    key = os.environ.get("INSPECOES_STORAGE_PUBLISHABLE", "")
    if not key:
        raise ValueError("A credencial pública do projeto é necessária apenas no transporte.")
    return {"apikey": key, **({"Authorization": "Bearer " + key} if key.count(".") == 2 else {})}


def request(url, method, common, extra=None, data=None):
    return urllib.request.urlopen(
        urllib.request.Request(url, data=data, headers={**common, **(extra or {})}, method=method),
        timeout=90,
    )


def verified_remote(row, common):
    url = f"{ROOT}/object/authenticated/{BUCKET}/{row['caminho']}"
    try:
        with request(url, "GET", common) as reply:
            if reply.headers.get_content_type() != "application/pdf":
                raise ValueError("MIME remoto divergente.")
            md5, sha, size = digest_stream(reply, cap=row["bytes"])
            if (md5, sha, size) != (row["md5"], row["sha256"], row["bytes"]):
                raise ValueError("Bytes remotos divergentes.")
            return True
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 403, 404):
            return False
        raise


def upload_resumable(folder, row, path, common):
    endpoint = f"{DIRECT}/upload/resumable"
    tus = {**common, "Tus-Resumable": "1.0.0"}
    resume = folder / (row["id"] + ".tus")
    location = resume.read_text().strip() if resume.is_file() else ""
    allowed = {urllib.parse.urlparse(DIRECT).netloc, urllib.parse.urlparse(ROOT).netloc}

    def check_location(value):
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme != "https" or parsed.netloc not in allowed or not parsed.path.startswith("/storage/v1/upload/resumable/"):
            raise ValueError("O servidor devolveu um destino não autorizado.")
        return value

    def head():
        with request(check_location(location), "HEAD", tus) as response:
            offset = int(response.headers["Upload-Offset"])
            if not 0 <= offset <= row["bytes"]:
                raise ValueError("Deslocamento remoto inválido.")
            return offset

    if location:
        try:
            offset = head()
        except urllib.error.HTTPError as exc:
            if exc.code not in (404, 410):
                raise
            location = ""
    if not location:
        metadata = {"bucketName": BUCKET, "objectName": row["caminho"],
                    "contentType": "application/pdf", "cacheControl": "private, max-age=0"}
        encoded = ",".join(k + " " + base64.b64encode(v.encode()).decode() for k, v in metadata.items())
        with request(endpoint, "POST", tus, {
            "Upload-Length": str(row["bytes"]), "Upload-Metadata": encoded,
            "x-upsert": "false",
        }, b"") as response:
            location = check_location(urllib.parse.urljoin(endpoint, response.headers["Location"]))
            resume.write_text(location, encoding="utf8")
            offset = int(response.headers.get("Upload-Offset", "0"))
    with path.open("rb") as stream:
        retries = 0
        while offset < row["bytes"]:
            stream.seek(offset)
            block = stream.read(TUS_CHUNK)
            try:
                with request(location, "PATCH", tus, {
                    "Content-Type": "application/offset+octet-stream", "Upload-Offset": str(offset),
                }, block) as response:
                    actual = int(response.headers["Upload-Offset"])
                    if actual != offset + len(block):
                        raise ValueError("Deslocamento remoto não confirmou este bloco.")
                    offset = actual
                    retries = 0
            except (OSError, urllib.error.HTTPError) as exc:
                if retries >= 3 or isinstance(exc, urllib.error.HTTPError) and exc.code not in (409, 429, 500, 502, 503, 504):
                    raise
                retries += 1
                time.sleep(retries)
                offset = head()
    resume.unlink(missing_ok=True)


def upload(folder, rows):
    common = headers()
    receipt = folder / "releitura.json"
    checked = json.loads(receipt.read_text()) if receipt.is_file() else {}

    def transfer(row):
        try:
            path = folder / (row["id"] + ".pdf")
            with path.open("rb") as original:
                if digest_stream(original, cap=row["bytes"]) != (row["md5"], row["sha256"], row["bytes"]):
                    raise ValueError("Bytes locais divergentes.")
            if not verified_remote(row, common):
                if row["bytes"] > 6 * MIB:
                    try:
                        upload_resumable(folder, row, path, common)
                    except urllib.error.HTTPError as exc:
                        if row["bytes"] > 50 * MIB or exc.code not in (400, 401, 403, 404):
                            raise
                        with request(f"{ROOT}/object/{BUCKET}/{row['caminho']}", "POST", common,
                                     {"Content-Type": "application/pdf", "x-upsert": "false"}, path.read_bytes()):
                            pass
                else:
                    with request(f"{ROOT}/object/{BUCKET}/{row['caminho']}", "POST", common,
                                 {"Content-Type": "application/pdf", "x-upsert": "false"}, path.read_bytes()):
                        pass
                if not verified_remote(row, common):
                    raise ValueError("Original ainda indisponível após envio.")
            return row["id"], row["sha256"], None
        except urllib.error.HTTPError as exc:
            return row["id"], None, f"HTTP_{exc.code}"
        except (OSError, ValueError) as exc:
            return row["id"], None, type(exc).__name__

    with ThreadPoolExecutor(max_workers=3) as pool:
        tasks = [pool.submit(transfer, row) for row in rows]
        errors = []
        for task in as_completed(tasks):
            ident, sha, error = task.result()
            if sha:
                checked[ident] = sha
                write_private(receipt, checked)
            else:
                errors.append(error)
            print(json.dumps({"releituras": len(checked), "erros": errors}), flush=True)
    return 1 if errors else 0


def main():
    os.umask(0o077)
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("action", choices=["plan","grants","transfer","verify","cleanup"])
    cli.add_argument("folder")
    cli.add_argument("--archive")
    cli.add_argument("--pending")
    cli.add_argument("--group", choices=["small","large","all"], default="all")
    args = cli.parse_args()
    folder = private(args.folder)
    if args.action == "plan":
        plan(args.archive, args.pending, folder)
        return 0
    rows = plan_jobs(folder, args.group)
    if args.action == "transfer":
        return upload(folder, rows)
    if args.action == "cleanup":
        sql = "delete from nexus_inspecoes_transferencia.objetos where caminho in (" + ",".join(
            quote(r["caminho"]) for r in rows) + ");"
    else:
        sql = sql_grants(rows) if args.action == "grants" else sql_verify(folder, rows)
    (folder / f"{args.action}-{args.group}.sql").write_text(sql, encoding="utf8")
    print(json.dumps({"lote": args.group, "total": len(rows)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
