#!/usr/bin/env python3
"""Extract the verified 3Tentos 3MF model without changing source geometry.

Requires Python 3, numpy and lxml. No Blender or browser is involved.

Cache API (ignored by git):
  geometry-cache.npz: v_<objectId> float64 Nx3 LOCAL METERS;
                      f_<objectId> uint32 Mx3 vertex indices.
  cad-manifest.json: objects keyed by source object ID; instances keyed by
    sourceInstancePath. localMatrixMeters/worldMatrixMeters are nested 4x4
    ROW-MAJOR matrices acting on COLUMN vectors, in the original CAD Y-up
    basis. Do not apply both accumulated world placement and parent placement.
  cad-geometry-costs.json: unique and expanded costs, to guide simplification.

Goldens contain 13 root children, 25 selected measurements and four silo axes.
All values are recalculated from the source vertices, independently of Blender
and the generated GLBs. Selection paths come from the supplied CAD audit.
No registration to Nexus is applied here; that is a separate application step.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import time

from lxml import etree
import numpy as np


EXPECTED_SHA256 = "bd6767218d609c1e4180e27169fcc5345c56e554e6f320a812e7a7da1ae2702b"
REPOSITORY = Path(__file__).resolve().parents[2]
CORE_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
METRIC_PATHS = [
    "build0/1/0:2", "build0/1/1:5", "build0/1/2:858", "build0/1/3:903",
    "build0/1/4:912", "build0/1/5:1009", "build0/1/6:1531", "build0/1/7:4113",
    "build0/1/8:4117", "build0/1/9:4120", "build0/1/10:4125",
    "build0/1/11:4136", "build0/1/12:4147",
    "build0/1/1:5/8:480", "build0/1/1:5/8:480/0:481",
    "build0/1/1:5/8:480/2:485", "build0/1/1:5/8:480/3:487",
    "build0/1/1:5/9:489", "build0/1/1:5/11:505",
    "build0/1/3:903/1:906", "build0/1/3:903/3:910",
    "build0/1/5:1009/11:1508", "build0/1/5:1009/12:1511",
    "build0/1/9:4120/0:4121", "build0/1/9:4120/1:4123",
]
SILO_ROOTS = [
    ("CAD-SILO-01", "build0/1/6:1531"),
    ("CAD-SILO-02", "build0/1/12:4147"),
    ("CAD-SILO-03", "build0/1/10:4125"),
    ("CAD-SILO-04", "build0/1/11:4136"),
]


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def source_matrix(raw: str | None) -> np.ndarray:
    """3MF serializes its 3x4 column-vector affine map as four rows of three."""
    result = np.eye(4, dtype=np.float64)
    if raw:
        values = np.fromstring(raw, sep=" ", dtype=np.float64)
        if values.size != 12 or not np.isfinite(values).all():
            raise ValueError("Expected twelve finite 3MF transform coefficients")
        result[:3, :4] = values.reshape(4, 3).T
    return result


def metric_matrix(source: np.ndarray) -> np.ndarray:
    """S @ source @ inverse(S), where S converts mm to meters."""
    result = source.copy()
    result[:3, 3] *= 0.001
    return result


def bounds_dict(low: np.ndarray, high: np.ndarray) -> dict:
    return {"min": low.tolist(), "max": high.tolist(), "size": (high-low).tolist()}


def clear_element(element) -> None:
    element.clear()
    parent = element.getparent()
    if parent is not None:
        while element.getprevious() is not None:
            del parent[0]


def write_json(path: Path, value: dict, *, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                                   indent=2 if pretty else None) + "\n", encoding="utf-8")
    temporary.replace(path)


@dataclass
class Model:
    objects: dict
    resources: list
    build: list
    attributes: dict
    metadata: list
    sha256: str
    size: int


def parse_model(path: Path, expected_sha256: str) -> Model:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    sha256 = digest.hexdigest()
    if sha256 != expected_sha256:
        raise ValueError(f"Source SHA-256 mismatch: got {sha256}; expected {expected_sha256}")
    print(f"Source verified: {sha256}", flush=True)

    objects, resources, build, metadata = {}, [], [], []
    resource_ids, attributes = set(), {}
    current, vertices, faces, components = None, [], [], []
    for event, element in etree.iterparse(
        str(path), events=("start", "end"), resolve_entities=False,
        load_dtd=False, no_network=True, huge_tree=False,
    ):
        name = local_name(element.tag)
        if event == "start":
            if name == "model":
                if element.tag != f"{{{CORE_NAMESPACE}}}model":
                    raise ValueError("Unsupported 3MF core namespace")
                attributes = dict(element.attrib)
                if attributes.get("unit") != "millimeter":
                    raise ValueError("This extractor requires explicit millimeter source units")
            parent = element.getparent()
            if parent is not None and local_name(parent.tag) == "resources":
                resource_id = element.get("id")
                if resource_id is None or resource_id in resource_ids:
                    raise ValueError(f"Missing/duplicate resource ID: {resource_id}")
                resource_ids.add(resource_id)
                resources.append({"type": name, "id": int(resource_id),
                                  "attributes": dict(element.attrib)})
            if name == "object":
                current = {"id": int(element.get("id")), "name": element.get("name", ""),
                           "attributes": dict(element.attrib)}
                vertices, faces, components = [], [], []
            continue
        if name == "vertex":
            vertices.append(tuple(float(element.get(axis)) for axis in "xyz"))
        elif name == "triangle":
            faces.append(tuple(int(element.get(key)) for key in ("v1", "v2", "v3")))
        elif name == "component":
            raw = element.get("transform")
            components.append({"objectId": int(element.get("objectid")),
                               "matrix": source_matrix(raw), "sourceTransformString": raw})
        elif name == "item":
            raw = element.get("transform")
            build.append({"objectId": int(element.get("objectid")),
                          "matrix": source_matrix(raw), "sourceTransformString": raw})
        elif name == "metadata":
            metadata.append({"name": element.get("name"), "text": element.text})
        elif name == "object":
            if current is None or current["id"] in objects:
                raise ValueError("Malformed or duplicate object definition")
            positions = np.asarray(vertices, dtype=np.float64).reshape((-1, 3))
            indices = np.asarray(faces, dtype=np.int64).reshape((-1, 3))
            if not np.isfinite(positions).all():
                raise ValueError(f"Nonfinite vertex coordinates in {current['id']}")
            if len(indices) and (indices.min() < 0 or indices.max() >= len(positions)):
                raise ValueError(f"Triangle index outside vertex array in {current['id']}")
            if len(positions) and components:
                raise ValueError(f"Object {current['id']} has both mesh and components")
            current.update(vertices=positions, faces=indices.astype(np.uint32), components=components)
            objects[current["id"]] = current
            current, vertices, faces, components = None, [], [], []
            if len(objects) % 500 == 0:
                print(f"Parsed {len(objects)} objects", flush=True)
        clear_element(element)
    if not build:
        raise ValueError("Source has no build items")
    referenced = {c["objectId"] for obj in objects.values() for c in obj["components"]}
    referenced.update(item["objectId"] for item in build)
    missing = sorted(referenced - objects.keys())
    if missing:
        raise ValueError(f"Missing object references: {missing}")
    return Model(objects, resources, build, attributes, metadata, sha256, path.stat().st_size)


def expand_instances(model: Model) -> dict:
    instances = {}

    def walk(object_id, world, local, path, parent, active):
        if object_id in active:
            raise ValueError(f"Cyclic component reference at {path}")
        obj = model.objects[object_id]
        low, high = np.full(3, np.inf), np.full(3, -np.inf)
        vertex_count = triangle_count = mesh_count = 0
        if len(obj["vertices"]):
            # Deliberately measure real source vertices, not transformed AABB corners.
            transformed = obj["vertices"] @ world[:3, :3].T + world[:3, 3]
            low, high = transformed.min(axis=0), transformed.max(axis=0)
            vertex_count, triangle_count, mesh_count = len(transformed), len(obj["faces"]), 1
        children = []
        for ordinal, component in enumerate(obj["components"]):
            child_id = component["objectId"]
            child_path = f"{path}/{ordinal}:{child_id}"
            child = walk(child_id, world @ component["matrix"], component["matrix"],
                         child_path, path, active | {object_id})
            children.append(child_path)
            low, high = np.minimum(low, child["low"]), np.maximum(high, child["high"])
            vertex_count += child["vertexCount"]
            triangle_count += child["triangleCount"]
            mesh_count += child["meshCount"]
        if not np.isfinite(low).all() or not np.isfinite(high).all():
            raise ValueError(f"Empty or nonfinite occurrence: {path}")
        result = {"objectId": object_id, "name": obj["name"], "path": path, "parent": parent,
                  "local": local, "world": world, "low": low, "high": high,
                  "children": children, "vertexCount": vertex_count,
                  "triangleCount": triangle_count, "meshCount": mesh_count}
        instances[path] = result
        return result

    for index, item in enumerate(model.build):
        object_id = item["objectId"]
        walk(object_id, item["matrix"], item["matrix"], f"build{index}/{object_id}", None, set())
    # Audit definitions outside the build as well; unreachable cycles are invalid too.
    checked = set()
    def check_graph(object_id, active):
        if object_id in active:
            raise ValueError(f"Cycle outside build at source object {object_id}")
        if object_id in checked:
            return
        for child in model.objects[object_id]["components"]:
            check_graph(child["objectId"], active | {object_id})
        checked.add(object_id)
    for object_id in model.objects:
        check_graph(object_id, set())
    return instances


def measurement(item: dict) -> dict:
    low, high = item["low"] * 0.001, item["high"] * 0.001
    return {"sourceObjectId": item["objectId"], "sourceInstancePath": item["path"],
            "sourceName": item["name"], "parentSourceInstancePath": item["parent"],
            "worldMatrixMeters": metric_matrix(item["world"]).tolist(),
            "boundsMeters": bounds_dict(low, high), "centerAabbMeters": ((low+high)/2).tolist(),
            "meshInstances": item["meshCount"], "expandedVertices": item["vertexCount"],
            "expandedTriangles": item["triangleCount"]}


def make_goldens(model: Model, instances: dict) -> dict:
    if model.sha256 != EXPECTED_SHA256:
        raise ValueError("The fixed 3Tentos golden selection requires the verified source revision")
    roots = [item for item in instances.values() if item["parent"] == "build0/1"]
    selected = [measurement(instances[path]) for path in METRIC_PATHS]
    silos = []
    for review_id, root_path in SILO_ROOTS:
        assembly = instances[root_path]
        body = next(instances[p] for p in assembly["children"] if instances[p]["objectId"] == 3727)
        shell = next(instances[p] for p in body["children"] if instances[p]["objectId"] == 3730)
        roof = next(instances[p] for p in body["children"] if instances[p]["objectId"] == 3728)
        axis = body["world"][:3, 3] * 0.001
        transformed = model.objects[3730]["vertices"] @ shell["world"][:3, :3].T + shell["world"][:3, 3]
        radius = np.linalg.norm(transformed[:, [0, 2]] * 0.001 - axis[[0, 2]], axis=1).max()
        silos.append({"reviewId": review_id, "sourceParentObjectId": assembly["objectId"],
                      "sourceInstancePath": root_path, "sourceBodyAssemblyId": 3727,
                      "sourceBodyMeshId": 3730, "sourceRoofMeshId": 3728,
                      "axisAtBaseMeters": axis.tolist(),
                      "axisDefinition": "Transformed local origin of source body assembly 3727, corroborated by circular lower roof rings in the Phase 1 audit.",
                      "assemblyWorldMatrixMeters": metric_matrix(assembly["world"]).tolist(),
                      "bodyWorldMatrixMeters": metric_matrix(body["world"]).tolist(),
                      "bodyOuterRadialEnvelopeDiameterMeters": float(radius * 2),
                      "diameterDefinition": "Twice maximum horizontal distance of mesh 3730 vertices from the modeled axis; includes external details, not nominal bin diameter.",
                      "bodyEnvelopeHeightMeters": float((shell["high"][1]-shell["low"][1]) * 0.001),
                      "roofBaseYMeters": float(roof["low"][1] * 0.001),
                      "roofTopYMeters": float(roof["high"][1] * 0.001),
                      "roofEnvelopeHeightMeters": float((roof["high"][1]-roof["low"][1]) * 0.001),
                      "assemblyBaseYMeters": float(assembly["low"][1] * 0.001),
                      "assemblyTopYMeters": float(assembly["high"][1] * 0.001),
                      "nominalDiameterStatus": "NOT DETERMINABLE FROM SOURCE",
                      "nominalShellOnlyHeightStatus": "UNRESOLVED"})
    distances = []
    for index, first in enumerate(silos):
        for second in silos[index+1:]:
            delta = np.array(second["axisAtBaseMeters"]) - first["axisAtBaseMeters"]
            distances.append({"fromReviewId": first["reviewId"], "toReviewId": second["reviewId"],
                              "deltaXYZMeters": delta.tolist(),
                              "axisDistanceXZMeters": float(np.linalg.norm(delta[[0, 2]]))})
    return {"schemaVersion": "3tentos-cad-source-goldens-1",
            "source": {"sha256": model.sha256, "bytes": model.size, "unit": "millimeter",
                       "rootObjectId": 1, "rootName": model.objects[1]["name"]},
            "coordinateSystem": {"unit": "meter", "basis": "original CAD X/Y/Z; Y up by geometric evidence",
                                 "groundReferenceY": 0.01, "registrationApplied": False,
                                 "matrixConvention": "nested row-major 4x4; column vectors"},
            "method": "Selection paths from the supplied verified audit; all measurement values recalculated directly from original mesh vertices using accumulated build/component transforms, before any Blender simplification or Nexus registration.",
            "roots": [measurement(item) for item in sorted(roots, key=lambda x: int(x["path"].split("/")[-1].split(":")[0]))],
            "metrics": selected, "silos": silos, "siloAxisDistances": distances,
            "limitations": ["Source tessellation, not field/as-built certification.",
                            "No operational Nexus IDs inferred from CAD review numbering.",
                            "AABBs are aggregate bounds, not architecture-only dimensions or collision solids.",
                            "No OBB, projected footprint, solid clearance or volume recomputed here."]}


def verify_references(goldens: dict, directory: Path | None) -> dict:
    if directory is None:
        return {"performed": False}
    supplied = json.loads((directory / "cad-major-metrics.json").read_text(encoding="utf-8-sig"))
    by_path = {item["instancePath"]: item for item in supplied}
    maximum = 0.0
    for actual in goldens["metrics"]:
        expected = by_path[actual["sourceInstancePath"]]
        for key in ("min", "max"):
            maximum = max(maximum, float(np.abs(np.array(actual["boundsMeters"][key]) - expected[key+"Meters"]).max()))
    supplied_silos = json.loads((directory / "cad-silos.json").read_text(encoding="utf-8-sig"))
    by_review = {s["id"]: s for s in supplied_silos}
    axis_error = radial_error = 0.0
    for actual in goldens["silos"]:
        expected = by_review[actual["reviewId"]]
        axis_error = max(axis_error, float(np.abs(np.array(actual["axisAtBaseMeters"]) - expected["bodyCenterAtBaseMeters"]).max()))
        radial_error = max(radial_error, abs(actual["bodyOuterRadialEnvelopeDiameterMeters"] - expected["bodyOuterRadialEnvelopeDiameterMeters"]))
    if max(maximum, axis_error, radial_error) > 1e-9:
        raise ValueError("Original-source measurements disagree with supplied audit")
    return {"performed": True, "majorBoundsMaxErrorMeters": maximum,
            "siloAxisMaxErrorMeters": axis_error, "siloRadialEnvelopeMaxErrorMeters": radial_error}


def export_cache(model: Model, instances: dict, directory: Path, source_path: Path) -> tuple[dict, dict]:
    directory.mkdir(parents=True, exist_ok=True)
    arrays, objects = {}, {}
    occurrences_by_id = Counter(item["objectId"] for item in instances.values())
    geometry_costs = []
    for object_id, obj in sorted(model.objects.items()):
        entry = {"sourceObjectId": object_id, "sourceName": obj["name"],
                 "sourceAttributes": obj["attributes"], "components": []}
        if len(obj["vertices"]):
            vertex_key, face_key = f"v_{object_id}", f"f_{object_id}"
            arrays[vertex_key] = obj["vertices"] * 0.001
            arrays[face_key] = obj["faces"]
            entry["geometry"] = {"verticesKey": vertex_key, "facesKey": face_key,
                                 "vertexCount": len(obj["vertices"]), "triangleCount": len(obj["faces"]),
                                 "localBoundsMeters": bounds_dict(arrays[vertex_key].min(axis=0), arrays[vertex_key].max(axis=0))}
            parents = [{"sourceObjectId": parent_id, "sourceName": parent["name"]}
                       for parent_id, parent in model.objects.items()
                       if any(child["objectId"] == object_id for child in parent["components"])]
            geometry_costs.append({"sourceObjectId": object_id, "sourceName": obj["name"],
                                   "vertices": len(obj["vertices"]), "triangles": len(obj["faces"]),
                                   "occurrences": occurrences_by_id[object_id],
                                   "localBoundsMeters": entry["geometry"]["localBoundsMeters"],
                                   "parentDefinitions": parents,
                                   "expandedTriangles": len(obj["faces"]) * occurrences_by_id[object_id]})
        else:
            entry["geometry"] = None
        for ordinal, component in enumerate(obj["components"]):
            entry["components"].append({"ordinal": ordinal, "sourceObjectId": component["objectId"],
                                        "sourceTransformString": component["sourceTransformString"],
                                        "localMatrixMeters": metric_matrix(component["matrix"]).tolist()})
        objects[str(object_id)] = entry
    exported_instances = {}
    for path, item in instances.items():
        record = measurement(item)
        record.update(localMatrixMeters=metric_matrix(item["local"]).tolist(),
                      childrenSourceInstancePaths=item["children"],
                      geometryObjectId=item["objectId"] if len(model.objects[item["objectId"]]["vertices"]) else None)
        exported_instances[path] = record
    build = [{"sourceObjectId": item["objectId"], "sourceTransformString": item["sourceTransformString"],
              "matrixMeters": metric_matrix(item["matrix"]).tolist(),
              "sourceInstancePath": f"build{index}/{item['objectId']}"}
             for index, item in enumerate(model.build)]
    counts = {"objects": len(objects), "meshes": len(geometry_costs),
              "assemblies": sum(bool(obj["components"]) for obj in model.objects.values()),
              "componentReferences": sum(len(obj["components"]) for obj in model.objects.values()),
              "uniqueVertices": sum(row["vertices"] for row in geometry_costs),
              "uniqueTriangles": sum(row["triangles"] for row in geometry_costs),
              "nodeOccurrences": len(instances),
              "meshOccurrences": sum(row["occurrences"] for row in geometry_costs),
              "expandedVertices": sum(row["vertices"]*row["occurrences"] for row in geometry_costs),
              "expandedTriangles": sum(row["expandedTriangles"] for row in geometry_costs)}
    manifest = {"schemaVersion": "3tentos-cad-cache-1", "geometryCacheFile": "geometry-cache.npz",
                "source": {"path": str(source_path), "sha256": model.sha256, "bytes": model.size,
                           "rootAttributes": model.attributes, "metadata": model.metadata},
                "coordinateSystem": {"unit": "meter", "sourceUnit": "millimeter", "scaleFactor": 0.001,
                                     "basis": "original CAD X/Y/Z; Y up by geometric evidence",
                                     "matrixConvention": "nested row-major 4x4; column vectors",
                                     "registrationApplied": False},
                "resources": model.resources, "counts": counts, "build": build,
                "objects": objects, "instances": exported_instances,
                "validation": {"sourceHashVerified": True, "finiteVertices": True,
                               "triangleIndicesValid": True, "resourceIdsUnique": True,
                               "objectReferencesResolve": True, "componentGraphAcyclic": True,
                               "reachableObjectDefinitions": len(occurrences_by_id),
                               "boundsMethod": "Transformed real vertices of every mesh occurrence, unioned through ancestors; no AABB-corner approximation"}}
    costs = {"schemaVersion": "3tentos-cad-costs-1", "sourceSha256": model.sha256, "counts": counts,
             "topUniqueMeshes": sorted(geometry_costs, key=lambda row: row["triangles"], reverse=True)[:30],
             "topExpandedMeshes": sorted(geometry_costs, key=lambda row: row["expandedTriangles"], reverse=True)[:30],
             "topFrequentMeshes": sorted(geometry_costs, key=lambda row: row["occurrences"], reverse=True)[:30],
             "allMeshDefinitions": geometry_costs,
             "rootAssemblies": [measurement(item) for item in instances.values() if item["parent"] == "build0/1"],
             "interpretation": "Expanded triangles count occurrences, not unique buffers. Simplification must preserve assembly placement and source-path provenance; costs alone do not justify deleting components."}
    temporary = directory / "geometry-cache.tmp.npz"
    np.savez_compressed(temporary, **arrays)
    temporary.replace(directory / "geometry-cache.npz")
    write_json(directory / "cad-manifest.json", manifest, pretty=False)
    write_json(directory / "cad-geometry-costs.json", costs)
    return manifest, costs


def validate_cache(directory: Path, manifest: dict, goldens: dict) -> dict:
    """Check the saved binary and its metric placement against source goldens."""
    vertices, validated_faces = {}, 0
    with np.load(directory / "geometry-cache.npz", allow_pickle=False) as cache:
        expected_keys = {key for obj in manifest["objects"].values() if obj["geometry"]
                         for key in (obj["geometry"]["verticesKey"], obj["geometry"]["facesKey"])}
        if set(cache.files) != expected_keys:
            raise ValueError("NPZ cache key mismatch")
        for object_id, obj in manifest["objects"].items():
            geometry = obj["geometry"]
            if geometry is None:
                continue
            positions, faces = cache[geometry["verticesKey"]], cache[geometry["facesKey"]]
            if positions.dtype != np.float64 or faces.dtype != np.uint32:
                raise ValueError(f"NPZ cache dtype mismatch in {object_id}")
            if positions.shape != (geometry["vertexCount"], 3) or faces.shape != (geometry["triangleCount"], 3):
                raise ValueError(f"NPZ cache shape mismatch in {object_id}")
            if not np.isfinite(positions).all() or (len(faces) and faces.max() >= len(positions)):
                raise ValueError(f"NPZ cache coordinate/index failure in {object_id}")
            vertices[int(object_id)] = positions
            validated_faces += len(faces)
    measured = {}
    def measure(path):
        if path in measured:
            return measured[path]
        item = manifest["instances"][path]
        low, high = np.full(3, np.inf), np.full(3, -np.inf)
        object_id = item["geometryObjectId"]
        if object_id is not None:
            matrix = np.array(item["worldMatrixMeters"])
            transformed = vertices[object_id] @ matrix[:3, :3].T + matrix[:3, 3]
            low, high = transformed.min(axis=0), transformed.max(axis=0)
        for child_path in item["childrenSourceInstancePaths"]:
            child_low, child_high = measure(child_path)
            low, high = np.minimum(low, child_low), np.maximum(high, child_high)
        measured[path] = low, high
        return low, high
    maximum = 0.0
    for expected in goldens["metrics"]:
        low, high = measure(expected["sourceInstancePath"])
        maximum = max(maximum, float(np.abs(low-expected["boundsMeters"]["min"]).max()),
                      float(np.abs(high-expected["boundsMeters"]["max"]).max()))
    if maximum > 1e-9:
        raise ValueError(f"Metric NPZ vertices/matrices differ from source goldens: {maximum}m")
    result = {"sourceSha256": manifest["source"]["sha256"], "meshDefinitionsChecked": len(vertices),
              "triangleIndicesChecked": validated_faces * 3, "goldenMetricCount": len(goldens["metrics"]),
              "maxWorldBoundErrorMeters": maximum,
              "method": "Reload all NPZ arrays with allow_pickle=False; verify dtype/shape/finite coordinates/indices; transform cached metric vertices with metric matrices and compare aggregate bounds to independently extracted source goldens."}
    write_json(directory / "cad-cache-validation.json", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True, help="Original unpacked 3MF .model file; read only")
    parser.add_argument("--expected-sha256", default=EXPECTED_SHA256)
    parser.add_argument("--cache-dir", type=Path, default=REPOSITORY / "assets/industrial/raw/cad")
    parser.add_argument("--goldens", type=Path, default=REPOSITORY / "docs/industrial/evidence/cad-source-goldens.json")
    parser.add_argument("--reference-dir", type=Path, help="Optional directory of verified cad-major-metrics.json and cad-silos.json")
    args = parser.parse_args()
    started = time.monotonic()
    source_path = args.source.resolve(strict=True)
    model = parse_model(source_path, args.expected_sha256.lower())
    instances = expand_instances(model)
    goldens = make_goldens(model, instances)
    goldens["referenceComparison"] = verify_references(goldens, args.reference_dir)
    manifest, costs = export_cache(model, instances, args.cache_dir, source_path)
    write_json(args.goldens, goldens)
    cache_validation = validate_cache(args.cache_dir, manifest, goldens)
    print(json.dumps({"cacheDirectory": str(args.cache_dir.resolve()), "goldens": str(args.goldens.resolve()),
                      "counts": manifest["counts"], "referenceComparison": goldens["referenceComparison"],
                      "cacheValidation": cache_validation,
                      "topUniqueMesh": costs["topUniqueMeshes"][0], "topExpandedMesh": costs["topExpandedMeshes"][0],
                      "elapsedSeconds": round(time.monotonic()-started, 3)}, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
