"""Receive an authorized connector download into private staging. Never saves signed URLs."""
import hashlib, json, os, sys, urllib.request, zipfile
from pathlib import Path

request = json.loads(sys.argv[1])
root = Path(request['directory'])
root.mkdir(parents=True, exist_ok=True, mode=0o700)
target = root / (request['id'] + '.bin')
partial = target.with_suffix('.part')
try:
    h = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(request['download_url'], timeout=50) as response, partial.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > 100 * 1024 * 1024:
                raise ValueError('File exceeds private staging limit 100 MiB; manual large-file handling required')
            output.write(chunk)
            h.update(chunk)
    if request.get('expected_bytes') is not None and total != int(request['expected_bytes']):
        raise ValueError('Connector byte count differs from received bytes')
    head = partial.open('rb').read(32)
    magic = ('application/pdf' if head.startswith(b'%PDF-') else 'image/jpeg' if head.startswith(b'\xff\xd8\xff') else 'image/png' if head.startswith(b'\x89PNG\r\n\x1a\n') else 'image/webp' if head.startswith(b'RIFF') and head[8:12] == b'WEBP' else 'application/zip' if head.startswith(b'PK\x03\x04') else 'unknown')
    integrity = 'signature_verified'
    if magic == 'application/zip':
        with zipfile.ZipFile(partial) as archive:
            info = archive.infolist()
            if sum(x.file_size for x in info) > 512 * 1024 * 1024 or len(info) > 20000:
                raise ValueError('ZIP expansion exceeds inspection limit')
            if archive.testzip() is not None:
                raise ValueError('ZIP CRC failure')
            names = {x.filename for x in info}
            if 'word/document.xml' in names:
                magic = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif 'xl/workbook.xml' in names:
                magic = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            integrity = 'zip_crc_verified'
    if head.lstrip().lower().startswith((b'<!doctype html', b'<html')):
        raise ValueError('HTML/login page is not an original binary')
    if total == 0:
        raise ValueError('Empty response')
    partial.replace(target)
    os.chmod(target, 0o600)
    result = {k:v for k,v in request.items() if k not in ('download_url','directory')}
    result.update(estado='validado',path=str(target),bytes=total,sha256=h.hexdigest(),mime_detectado=magic,integridade=integrity)
except Exception as exc:
    partial.unlink(missing_ok=True)
    result = {'id':request['id'],'estado':'indisponivel','motivo':type(exc).__name__ + ': ' + ('HTTP '+str(exc.code) if hasattr(exc,'code') else str(exc).split('https:')[0])}
metadata = root / (request['id'] + '.json')
metadata.write_text(json.dumps(result, ensure_ascii=False, indent=2))
os.chmod(metadata,0o600)
print(json.dumps(result, ensure_ascii=False))
