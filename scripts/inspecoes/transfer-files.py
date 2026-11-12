#!/usr/bin/env python3
"""Prepare and transfer the private Inspeções archive, with resumable readback."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

REPO = Path(__file__).resolve().parents[2]
PROJECT = 'yhtgijtllvgzoqtfcgal.supabase.co'
MAX_BYTES = 50 * 1024 * 1024
BUCKET = 'inspecoes-acervo'
DATA = 'modulo-inspecoes/data/'
OTMAR = DATA + 'laudos/otmar-vier/'
ORIGINAL = 'exemplos-laudo-pac-pal/modelo-original-R00/'
PILOT = 'exemplos-laudo-pac-pal/piloto-gerado-pela-base/'
MODEL = 'modulo-inspecoes/modelos/laudo-pac-pal/'
PRODUCT = MODEL + 'produtos/anchor-fix-a1/'
TYPES = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.json': 'application/json',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def private(path):
    actual = Path(path).resolve()
    if actual.is_relative_to(REPO):
        raise ValueError('Arquivos reais e manifestos privados precisam ficar fora do repositório.')
    return actual


def bounded_read(path):
    with path.open('rb') as stream:
        result = stream.read(MAX_BYTES + 1)
    if not result or len(result) > MAX_BYTES:
        raise ValueError('Arquivo vazio ou acima de 50 MiB.')
    return result


def verify_type(data, suffix):
    if suffix == '.json':
        json.loads(data)
        return
    signatures = {
        '.pdf': b'%PDF-',
        '.jpg': b'\xff\xd8\xff',
        '.png': b'\x89PNG\r\n\x1a\n',
        '.docx': b'PK\x03\x04',
    }
    if not data.startswith(signatures[suffix]):
        raise ValueError('Tipo real do arquivo diverge da extensão.')
    if suffix == '.docx':
        from io import BytesIO
        from zipfile import ZipFile
        with ZipFile(BytesIO(data)) as zipped:
            if 'word/document.xml' not in zipped.namelist():
                raise ValueError('DOCX sem documento Word.')


def image_derivative(data, expected_hash, mime, edge):
    # Reuse the same EXIF, pixel and WebP behavior used by NR33/NR35.
    import importlib.util
    spec = importlib.util.spec_from_file_location('nr_image_worker', REPO / 'scripts/nr/image-worker.py')
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker.representation(data, expected_hash, mime, edge)[0]


def atomic_json(path, value):
    temp = path.with_suffix('.part')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def sql_row(org, item, verified):
    fields = ['id', 'papel', 'ordem', 'nome', 'legenda', 'origem']
    row = {field: item.get(field) for field in fields}
    objects = {obj['variant']: obj for obj in item['objects'] if obj['caminho'] in verified}
    original = objects.get('original')
    row['estado'] = item['estado']
    if original:
        row.update({field: original[field] for field in ['caminho', 'sha256', 'bytes', 'mime']})
        row['estado'] = 'original_verificado'
        for kind in ('miniatura', 'previa'):
            if kind in objects:
                row.update({kind + '_' + field: objects[kind][field] for field in ['caminho', 'sha256', 'bytes']})
            elif item['papel'] == 'foto':
                row['estado'] = 'falha_processamento'
    args = [org, item['colecao'], item['source_id'], json.dumps(row, ensure_ascii=False)]
    return 'select public.inspecoes_importar_arquivo(' + ','.join(map(quote, args)) + '::jsonb);\n'


def prepare(source, output, org, originals_path):
    root = private(source)
    dest = private(output)
    dest.mkdir(parents=True, exist_ok=True)
    originals = json.loads(private(originals_path).read_bytes()) if originals_path else {}
    source_bytes = (root / 'base-completa-2026-11-01/db.json').read_bytes()
    snapshot = json.loads(source_bytes)
    manifest_file = dest / 'manifesto-privado.json'
    previous = {}
    if manifest_file.exists():
        prior = json.loads(manifest_file.read_bytes())
        if prior['organization_id'] != org or prior['snapshot_sha256'] != digest(source_bytes):
            raise ValueError('Manifesto existente pertence a outro snapshot ou organização.')
        previous = {item['id']: item for item in prior['files']}
    files = []
    otmar = next(doc for doc in snapshot['documentos'] if doc['id'] == 'DI-otmar-vier-O1')
    equipment = next(record for record in snapshot['insp_equipamentos'] if record['codigo'] == 'EQ-01')

    def add(collection, source_id, role, file, name=None, label=None, order=None, expected_md5=None, external=None):
        ident = str(uuid.uuid5(uuid.NAMESPACE_URL, f'nexus-inspecoes:{org}:{collection}:{source_id}:{role}:{order}'))
        item = {
            'id': ident, 'colecao': collection, 'source_id': source_id, 'papel': role, 'ordem': order,
            'nome': name or Path(file).name, 'legenda': label,
            'origem': ('Snapshot 2026-11-01: ' + ('referência do PDF original' if role == 'original' else str(file))),
            'estado': 'original_pendente', 'objects': [],
        }
        item['md5_origem'] = expected_md5
        files.append(item)
        if not file and not external:
            return
        filename = private(external) if external else root / file
        data = bounded_read(filename)
        suffix = filename.suffix.lower()
        verify_type(data, suffix)
        if expected_md5 and hashlib.md5(data).hexdigest() != expected_md5:
            raise ValueError('O PDF candidato diverge do MD5 de origem.')
        old = previous.get(ident, {}).get('objects', [])
        prefix = old[0]['caminho'].rsplit('/', 1)[0] if old else f'{org}/{ident}/{secrets.token_urlsafe(24)}'
        obj_dir = dest / 'objects' / ident
        obj_dir.mkdir(parents=True, exist_ok=True)

        def add_object(variant, basename, blob, mime):
            target = obj_dir / basename
            sha = digest(blob)
            previous_obj = next((x for x in old if x['variant'] == variant), None)
            if previous_obj and previous_obj['sha256'] != sha:
                raise ValueError('Os bytes de um destino já preparado divergem. Crie um vínculo versionado.')
            target.write_bytes(blob)
            item['objects'].append({
                'variant': variant, 'caminho': f'{prefix}/{basename}', 'arquivo': target.relative_to(dest).as_posix(),
                'sha256': sha, 'bytes': len(blob), 'mime': mime,
            })

        add_object('original', 'original' + suffix, data, TYPES[suffix])
        if role == 'foto':
            for variant, basename, edge in [('miniatura', 'miniatura_384.webp', 384), ('previa', 'previa_768.webp', 768)]:
                try:
                    derived = image_derivative(data, digest(data), TYPES[suffix], edge)
                    add_object(variant, basename, derived, TYPES['.webp'])
                except (OSError, ValueError, ImportError):
                    item['erro_derivados'] = 'Derivado indisponível. Original preservado. Verifique Pillow e integridade da imagem.'

    for doc in snapshot['documentos']:
        is_otmar = doc['id'] == otmar['id']
        filename = PureWindowsPath(doc['arquivo']['nome']).name
        add('documentos', doc['id'], 'original', ORIGINAL + filename if is_otmar else None,
            name=filename, expected_md5=doc['arquivo']['md5'], external=originals.get(doc['id']))

    config = json.loads((root / (OTMAR + 'laudo.json')).read_bytes())
    for number, photo in enumerate(config['fotos'], 1):
        add('documentos', otmar['id'], 'foto', OTMAR + photo['arquivo'],
            label=photo.get('legenda') or 'Teste de carga com dinamômetro.', order=number)
    cert = DATA + 'equipamentos/EQ-01/certificados-2026021902-e-padrao-11140-25.pdf'
    add('equipamentos', equipment['id'], 'certificado', cert)
    add('documentos', otmar['id'], 'certificado', cert, label='Anexo B — Calibração')
    add('documentos', otmar['id'], 'fabricante', PRODUCT + 'anexo-fabricante-manual-tecpar-art.pdf', label='Anexo C — Fabricante')
    add('documentos', otmar['id'], 'art', OTMAR + 'art-14542310.pdf', label='Anexo D — ART')
    add('documentos', otmar['id'], 'projeto', OTMAR + 'projeto-folha-1-2-original.pdf', label='Anexo E — Projeto')
    add('documentos', otmar['id'], 'modelo', MODEL + 'base-nexus.docx', order=1)
    add('documentos', otmar['id'], 'modelo', MODEL + 'modelo.json', order=2)
    add('documentos', otmar['id'], 'modelo', PRODUCT + 'produto.json', order=3)
    add('documentos', otmar['id'], 'modelo', PRODUCT + 'figura-olhal.png', order=4)
    add('documentos', otmar['id'], 'modelo', OTMAR + 'laudo.json', order=5)
    add('documentos', otmar['id'], 'modelo', OTMAR + 'ultima-geracao.json', order=6)
    pilot_stem = 'PILOTO-LAUDO-PONTOS-ANCORAGEM-PAC-PAL-OTMAR-VIER-NEXUS-R00'
    add('documentos', otmar['id'], 'piloto', PILOT + pilot_stem + '.docx', order=1)
    add('documentos', otmar['id'], 'piloto', PILOT + pilot_stem + '.pdf', order=2)
    add('documentos', otmar['id'], 'prancha', PILOT + 'piloto-planta-folha-1-de-2.pdf', order=1)
    add('documentos', otmar['id'], 'prancha', PILOT + 'piloto-planta-folha-2-de-2.pdf', order=2)
    manifest = {'format': 'nexus-inspecoes-private-v1', 'organization_id': org,
                'snapshot_sha256': digest(source_bytes), 'files': files}
    atomic_json(manifest_file, manifest)
    (dest / '06-arquivos-pendentes.sql').write_text(
        ''.join(sql_row(org, item, set()) for item in files), encoding='utf-8',
    )
    objects = [obj for item in files for obj in item['objects']]
    print(json.dumps({
        'anexos': len(files), 'objetos': len(objects), 'bytes': sum(obj['bytes'] for obj in objects),
        'originais_localizados': sum(item['papel'] == 'original' and bool(item['objects']) for item in files),
        'fotos': sum(item['papel'] == 'foto' for item in files),
        'derivados': sum(obj['variant'] != 'original' for obj in objects),
        'falhas_derivados': sum('erro_derivados' in item for item in files),
    }))


def request(base, headers, obj, body=None):
    read = body is None
    route = '/storage/v1/object/' + ('authenticated/' if read else '') + BUCKET + '/' + obj['caminho']
    req = urllib.request.Request(base + route, data=body, headers={
        **headers, **({} if read else {'Content-Type': obj['mime'], 'x-upsert': 'false'}),
    }, method='GET' if read else 'POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.headers.get_content_type(), response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as error:
        return error.code, None, error.read(8192)


def transfer(output, anon):
    dest = private(output)
    manifest = json.loads((dest / 'manifesto-privado.json').read_bytes())
    if manifest['format'] != 'nexus-inspecoes-private-v1':
        raise ValueError('Manifesto de arquivos desconhecido.')
    base = os.environ.get('SUPABASE_URL', 'https://' + PROJECT).rstrip('/')
    key = os.environ.get('SUPABASE_ANON_KEY' if anon else 'SUPABASE_SERVICE_ROLE_KEY')
    if not key or base != 'https://' + PROJECT:
        raise ValueError('Integração não configurada para o projeto confirmado.')
    headers = {'apikey': key, **({} if key.startswith('sb_') else {'Authorization': 'Bearer ' + key})}
    org = str(uuid.UUID(manifest['organization_id']))
    jobs = []
    targets = set()
    for item in manifest['files']:
        ident = str(uuid.UUID(item['id']))
        for obj in item['objects']:
            target = obj['caminho']
            if target in targets or not re.fullmatch(rf'{org}/{ident}/[A-Za-z0-9_-]{{32}}/[a-z0-9_]+\.[a-z]+', target):
                raise ValueError('Destino fora do formato do armazenamento privado.')
            targets.add(target)
            file = (dest / obj['arquivo']).resolve()
            if not file.is_relative_to(dest) or obj['mime'] not in TYPES.values():
                raise ValueError('Manifesto de transferência com origem ou MIME inválido.')
            jobs.append((obj, file))

    def run(job):
        obj, file = job
        try:
            data = bounded_read(file)
            if len(data) != obj['bytes'] or digest(data) != obj['sha256']:
                return obj['caminho'], 'bytes_locais_divergentes'
            status, _, msg = request(base, headers, obj, data)
            if status not in (200, 201) and not (
                status in (400, 409) and re.search(b'(?i)already.exists|duplicate', msg)
            ):
                return obj['caminho'], 'envio_http_' + str(status)
            status, mime, received = request(base, headers, obj)
            if status != 200:
                return obj['caminho'], 'leitura_http_' + str(status)
            if mime != obj['mime'] or len(received) != obj['bytes'] or digest(received) != obj['sha256']:
                return obj['caminho'], 'leitura_divergente'
            return obj['caminho'], 'verificado'
        except (OSError, ValueError):
            return obj['caminho'], 'erro_transitorio'

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for target, status in pool.map(run, jobs):
            results[target] = status
            atomic_json(dest / 'leitura-storage.json', results)
    verified = {target for target, status in results.items() if status == 'verificado'}
    (dest / '07-arquivos-verificados.sql').write_text(
        ''.join(sql_row(org, item, verified) for item in manifest['files'] if any(
            obj['variant'] == 'original' and obj['caminho'] in verified for obj in item['objects']
        )), encoding='utf-8',
    )
    failures = len(jobs) - len(verified)
    print(json.dumps({'verificados': len(verified), 'falhas': failures, 'bytes': sum(
        obj['bytes'] for obj, _ in jobs if obj['caminho'] in verified
    ), 'motivos': sorted(set(results.values()) - {'verificado'})}))
    return 2 if failures else 0


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    sub = cli.add_subparsers(dest='operation', required=True)
    plan = sub.add_parser('prepare')
    plan.add_argument('source')
    plan.add_argument('output')
    plan.add_argument('organization', type=lambda value: str(uuid.UUID(value)))
    plan.add_argument('--originais-localizados')
    upload = sub.add_parser('transfer')
    upload.add_argument('output')
    upload.add_argument('--anon-temporario', action='store_true')
    args = cli.parse_args()
    if args.operation == 'prepare':
        prepare(args.source, args.output, args.organization, args.originais_localizados)
        return 0
    return transfer(args.output, args.anon_temporario)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError) as exc:
        raise SystemExit(str(exc)) from None
