"""PUT a verified private package to its authorized connector URL. Does not log URLs."""
import hashlib, json, sys, urllib.request
from pathlib import Path

config = json.loads(sys.argv[1])
data = Path(config['path']).read_bytes()
if len(data) != config['bytes'] or hashlib.sha256(data).hexdigest() != config['sha256']:
    raise ValueError('Package changed before transfer')
headers = dict(config.get('headers', {}))
headers['Content-Type'] = config.get('content_type', 'application/zip')
headers['Content-Length'] = str(len(data))
request = urllib.request.Request(config['url'], data=data, headers=headers, method='PUT')
try:
    with urllib.request.urlopen(request, timeout=60) as response:
        print(json.dumps({'file_id':config['file_id'],'part':config.get('part'),'bytes':len(data),'sha256':config['sha256'],'status':response.status,'resultado':'pacote_privado_anexado_ao_lovable'}))
except Exception as exc:
    print(json.dumps({'file_id':config['file_id'],'part':config.get('part'),'resultado':'erro','motivo':type(exc).__name__,'http':getattr(exc,'code',None)}))
    sys.exit(1)
