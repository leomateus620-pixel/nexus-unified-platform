"""Exact convex XZ envelopes of source vertices owned by each CAD partition.

Reads the extracted metric NPZ. No AABBs, registration scaling or geometry edits.
The output is a compact, versioned input for integrate-site.mjs.
"""
import argparse
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--cache', type=Path, default=ROOT/'assets/industrial/raw/cad')
parser.add_argument('--output', type=Path, default=ROOT/'assets/industrial/cad/partition-footprints.json')
args = parser.parse_args()
site = json.loads((ROOT/'src/industrial/data/site.json').read_text(encoding='utf8'))
manifest = json.loads((args.cache/'cad-manifest.json').read_text(encoding='utf8'))
archive = np.load(args.cache/'geometry-cache.npz')


def hull(points):
    unique = np.unique(np.asarray(points, dtype=np.float64), axis=0)
    if len(unique) <= 2:
        return unique
    lower, upper = [], []
    for target, values in ((lower, unique), (upper, unique[::-1])):
        for p in values:
            while len(target) >= 2:
                a, b = target[-2], target[-1]
                if (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) > 0:
                    break
                target.pop()
            target.append(p)
    return np.asarray(lower[:-1]+upper[:-1])


cache = {}
partitions = []
for owner in site['elements']:
    binding = owner.get('cad')
    if not binding:
        continue
    polygons, paths = [], []
    for path, item in manifest['instances'].items():
        if not any(path == p or path.startswith(p+'/') for p in binding['sourcePaths']):
            continue
        if any(path == p or path.startswith(p+'/') for p in binding['excludedPaths']):
            continue
        obj = manifest['objects'][str(item['sourceObjectId'])]
        geometry = obj.get('geometry')
        if not geometry:
            continue
        matrix = np.asarray(item['worldMatrixMeters'], dtype=np.float64)
        # Y may contribute to XZ for tilted CAD meshes. Cache the complete two
        # projected matrix rows, not merely a guessed yaw or planar rotation.
        projection = matrix[[0, 2], :3]
        key = (item['sourceObjectId'], tuple(projection.ravel()))
        if key not in cache:
            vertices = archive[geometry['verticesKey']]
            cache[key] = hull(vertices @ projection.T)
        polygons.append(cache[key] + matrix[[0, 2], 3])
        paths.append(path)
    if not polygons:
        raise ValueError('Empty partition '+owner['id'])
    polygon = hull(np.concatenate(polygons))
    partitions.append({'id': owner['id'], 'sourcePaths': binding['sourcePaths'],
                       'excludedPaths': binding['excludedPaths'], 'sourceOccurrences': len(paths),
                       'convexHullXZCadMeters': polygon.tolist()})
    print(owner['id'], len(paths), 'source occurrences;', len(polygon), 'hull vertices', flush=True)
archive.close()
report = {'schemaVersion': 1, 'sourceHash': manifest['source']['sha256'],
          'method': 'Convex hull of actual source mesh vertices transformed into CAD world meters, restricted to sourcePaths minus excludedPaths. A convex projected envelope, not an architectural ground-contact footprint.',
          'partitions': partitions}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(args.output, flush=True)
