#!/usr/bin/env python3
"""Bounded private image worker. Requires Pillow; never logs keys, customer paths or signed URLs.

SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/nr/image-worker.py --max-jobs 30
A supervisor can run --watch for subsequent uploads. One image is decoded at a time.
"""
import argparse
import hashlib
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import warnings
from PIL import Image, ImageOps

PROCESSOR = 'nexus-pillow-v1'
MAX_BYTES = 50 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)


def representation(original, expected_hash, expected_mime, edge):
    if not original or len(original) > MAX_BYTES or hashlib.sha256(original).hexdigest() != expected_hash:
        raise ValueError('Original diverge do SHA-256/tamanho autorizado')
    with Image.open(io.BytesIO(original)) as probe:
        detected = Image.MIME.get(probe.format)
        if detected != expected_mime:
            raise ValueError('MIME real diverge do original autorizado')
        probe.verify()
    with Image.open(io.BytesIO(original)) as source:
        # This affects only the representation; original bytes and EXIF are retained unchanged.
        image = ImageOps.exif_transpose(source)
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS, reducing_gap=3)
        if image.mode not in ('RGB', 'RGBA'):
            image = image.convert('RGBA' if 'transparency' in source.info else 'RGB')
        output = io.BytesIO()
        image.save(output, format='WEBP', quality=88, method=4, exact=True)
        data = output.getvalue()
        return data, {'estado': 'disponivel', 'mime': 'image/webp', 'tamanho': len(data),
                      'largura': image.width, 'altura': image.height,
                      'sha256': hashlib.sha256(data).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-jobs', type=int, default=30)
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.max_jobs <= 5000:
        raise SystemExit('Limite de lote inválido')
    base, key = os.getenv('SUPABASE_URL', '').rstrip('/'), os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if urllib.parse.urlparse(base).hostname != 'yhtgijtllvgzoqtfcgal.supabase.co' or not key:
        raise SystemExit('Integração não configurada: projeto/credencial do worker ausentes')
    headers = {'apikey': key, **({} if key.startswith('sb_') else {'Authorization': 'Bearer ' + key})}

    def request(route, body=None, mime='application/json', method=None):
        req = urllib.request.Request(base + route, data=body,
                                     headers={**headers, 'Content-Type': mime, 'x-upsert': 'false'},
                                     method=method or ('POST' if body is not None else 'GET'))
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError('Resposta excede limite de memória')
            return data, response.headers.get_content_type()

    def rpc(name, payload):
        raw, _ = request('/rest/v1/rpc/' + name, json.dumps(payload).encode())
        return json.loads(raw) if raw else None

    processed = failed = total_bytes = 0
    while processed < args.max_jobs:
        jobs = rpc('nr_imagem_trabalho_obter', {'p_limite': 1})
        if not jobs:
            if args.watch:
                time.sleep(5)
                continue
            break
        for job in jobs:
            try:
                original_route = '/storage/v1/object/authenticated/nexus-nr-acervo/' + urllib.parse.quote(job['original_caminho'], safe='/')
                original, mime = request(original_route)
                if len(original) != job['original_tamanho'] or mime != job['original_mime']:
                    raise ValueError('Leitura do original diverge do inventário')
                edge = 384 if job['variante'] == 'miniatura_384' else 768
                data, result = representation(original, job['original_sha256'], mime, edge)
                route = '/storage/v1/object/nexus-nr-acervo/' + urllib.parse.quote(job['caminho'], safe='/')
                try:
                    request(route, data, 'image/webp')
                except urllib.error.HTTPError as exc:
                    if exc.code not in (400, 409):
                        raise
                    # A conflicting immutable object is acceptable only after exact readback below.
                readback, actual_mime = request(route.replace('/object/', '/object/authenticated/', 1))
                if actual_mime != 'image/webp' or readback != data:
                    raise ValueError('Representação privada diverge após upload')
                rpc('nr_imagem_trabalho_concluir', {'p_id': job['id'], 'p_lease': job['lease'], 'p_resultado': result})
                total_bytes += len(data)
            except Exception as exc:
                failed += 1
                # Exception strings may contain signed URLs or paths; persist only a bounded category.
                reason = 'HTTP ' + str(exc.code) if isinstance(exc, urllib.error.HTTPError) else type(exc).__name__
                rpc('nr_imagem_trabalho_concluir', {'p_id': job['id'], 'p_lease': job['lease'],
                                                 'p_resultado': {'estado': 'falhou', 'erro': reason}})
            processed += 1
            print(json.dumps({'processados': processed, 'falhas': failed, 'bytes_derivados': total_bytes}), flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
