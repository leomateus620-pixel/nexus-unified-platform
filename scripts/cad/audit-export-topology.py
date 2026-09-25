"""Inspect, without changing, the final Blender mesh and its reduced source faces.

Run with Blender --background --disable-autoexec
assets/industrial/source/3tentos-reconstruction.blend --python
scripts/cad/audit-export-topology.py. Requires the local extraction/reduction cache.
The compact evidence is versioned so the GLB audit remains usable in CI.
"""
import hashlib
import json
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

generation_path = ROOT / 'docs/industrial/evidence/cad-generation.json'
generation = json.loads(generation_path.read_text(encoding='utf8'))
prefix = (ROOT / 'scripts/blender/cad_geometry.py').read_text(encoding='utf8').split('def _paths(')[0].encode()
cache_key = hashlib.sha256(generation['sourceHash'].encode() + prefix).hexdigest()[:24]
cache = ROOT / 'assets/industrial/raw/cad/reduced' / cache_key
definitions = {}
rows = []
for partition in generation['partitions']:
    collection = bpy.data.collections[partition['sector']]
    roots = [obj for obj in collection.objects if obj.get('cadSourceHash') and obj.get('elementId') == partition['id']]
    if len(roots) != 1:
        raise ValueError('Expected one saved Blender owner: ' + partition['id'])
    triangles = 0
    for obj in roots[0].children:
        if obj.type != 'MESH':
            continue
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    source_omissions = []
    for source_path in partition['sourcePaths']:
        oid = int(source_path.rsplit(':', 1)[1])
        key = str(oid) + '-' + partition['lod']
        if key not in definitions:
            file = cache / (key + '.npz')
            if not file.exists():
                raise ValueError('Missing reduction input: ' + str(file))
            with np.load(file, allow_pickle=False) as reduced:
                faces = reduced['faces']
                degenerate = (faces[:, 0] == faces[:, 1]) | (faces[:, 0] == faces[:, 2]) | (faces[:, 1] == faces[:, 2])
                valid_indices = np.flatnonzero(~degenerate)
                _, inverse, counts = np.unique(np.sort(faces[~degenerate], axis=1), axis=0, return_inverse=True, return_counts=True)
                duplicate_groups = [valid_indices[inverse == index].tolist() for index in np.flatnonzero(counts > 1)]
                definitions[key] = {
                    'sourceObjectId': oid, 'lod': partition['lod'], 'inputSha256': sha(file),
                    'inputTriangles': len(faces),
                    'repeatedIndexTriangles': np.flatnonzero(degenerate).tolist(),
                    'duplicateFaceGroups': duplicate_groups,
                    'omittedDegenerateTriangles': int(degenerate.sum()),
                    'omittedDuplicateTriangles': sum(len(group) - 1 for group in duplicate_groups),
                }
        definition = definitions[key]
        if definition['omittedDegenerateTriangles'] or definition['omittedDuplicateTriangles']:
            source_omissions.append({'sourceInstancePath': source_path, 'definition': key})
    degenerate_count = sum(definitions[item['definition']]['omittedDegenerateTriangles'] for item in source_omissions)
    duplicate_count = sum(definitions[item['definition']]['omittedDuplicateTriangles'] for item in source_omissions)
    if triangles + degenerate_count + duplicate_count != partition['triangles']:
        raise ValueError('Saved Blender topology differs beyond identified invalid/duplicate input faces: ' + partition['sector'] + '/' + partition['id'])
    rows.append({'id': partition['id'], 'sector': partition['sector'], 'lod': partition['lod'],
                 'generatedInputTriangles': partition['triangles'], 'blenderTriangles': triangles,
                 'omittedDegenerateTriangles': degenerate_count, 'omittedDuplicateTriangles': duplicate_count,
                 'sourceOmissions': source_omissions})

report = {
    'status': 'passed', 'sourceHash': generation['sourceHash'], 'generationSha256': sha(generation_path),
    'blendSha256': sha(Path(bpy.data.filepath)), 'reductionCacheKey': cache_key,
    'method': 'Read-only inspection of final saved Blender loop triangles. Count differences exactly equal repeated-index input triangles and duplicate unordered vertex-index faces in the source reduction cache; no geometric tolerance is used.',
    'definitions': [d for d in definitions.values() if d['omittedDegenerateTriangles'] or d['omittedDuplicateTriangles']],
    'partitions': rows,
    'limits': 'Repeated-index and duplicate topology accounting only; other zero-area triangles already in CAD are not silently removed or certified here.',
}
(ROOT / 'docs/industrial/evidence/cad-export-topology.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('CAD_EXPORT_TOPOLOGY', len(rows), 'partitions; exact face accounting passed')
