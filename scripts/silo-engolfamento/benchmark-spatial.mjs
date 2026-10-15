import * as T from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { createSiloModel } from "../../src/silo-engolfamento/SiloModel.ts";
import { COMPONENTS } from "../../src/silo-engolfamento/ComponentRegistry.ts";

// Developer CPU comparison only. BVH stays out of the production entry point.
const model = createSiloModel();
model.root.updateMatrixWorld(true);
const meshes = [];
model.root.traverse((object) => {
  if (object instanceof T.Mesh && !(object instanceof T.InstancedMesh)) meshes.push(object);
});
const proxyGeometry = new T.BoxGeometry(1, 1, 1);
const proxyMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide });
const proxies = COMPONENTS.filter(
  (record) => record.category === "structure" || record.id.startsWith("lvhf.passant"),
).map((record) => {
  const mesh = new T.Mesh(proxyGeometry, proxyMaterial);
  mesh.position.fromArray(record.selectionPoint);
  mesh.scale.fromArray(record.bounds);
  mesh.userData["componentId"] = record.id;
  mesh.updateMatrixWorld();
  return mesh;
});
const rays = Array.from({ length: 720 }, (_, i) => {
  const record = COMPONENTS[i % COMPONENTS.length];
  const target = new T.Vector3().fromArray(record.selectionPoint);
  const angle = i * 2.399963229728653;
  const origin = new T.Vector3(Math.sin(angle) * 36, 8 + (i % 29), Math.cos(angle) * 36);
  return new T.Raycaster(origin, target.sub(origin).normalize());
});
const percentile = (samples, ratio) =>
  samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * ratio))];
function measure(objects, firstHitOnly = false) {
  const samples = [],
    hits = [];
  for (let warm = 0; warm < 40; warm++) rays[warm].intersectObjects(objects, false);
  for (const ray of rays) {
    ray.firstHitOnly = firstHitOnly;
    const start = performance.now();
    const result = ray.intersectObjects(objects, false);
    samples.push(performance.now() - start);
    hits.push(result[0]?.distance ?? null);
  }
  samples.sort((a, b) => a - b);
  return {
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    worstMs: samples.at(-1),
    samples: samples.length,
    hits,
  };
}
const ordinary = measure(meshes);
const proxy = measure(proxies);
const start = performance.now();
const geometries = [...new Set(meshes.map((mesh) => mesh.geometry))];
for (const geometry of geometries) geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
for (const mesh of meshes) mesh.raycast = acceleratedRaycast;
const buildMs = performance.now() - start;
const bvh = measure(meshes, true);
let mismatches = 0,
  maxHitDeltaMetres = 0;
for (let index = 0; index < rays.length; index++) {
  const a = ordinary.hits[index],
    b = bvh.hits[index];
  if ((a === null) !== (b === null)) mismatches++;
  else if (a !== null && b !== null) {
    maxHitDeltaMetres = Math.max(maxHitDeltaMetres, Math.abs(a - b));
    if (Math.abs(a - b) > 1e-5) mismatches++;
  }
}
const clean = ({ hits, ...result }) => result;
const result = {
  measuredAt: new Date().toISOString(),
  condition: {
    runtime: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    samples: rays.length,
    scenario:
      "CPU raycasts over current static grounded silo; deterministic rays, no WebGL, no skin/grain/cut shaders; proxy comparison is broad-phase budget, not identical-hit equivalence",
    staticMeshes: meshes.length,
    simpleProxies: proxies.length,
    triangleCount: meshes.reduce(
      (sum, mesh) =>
        sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
      0,
    ),
    bvhVersion: "0.8.3 (existing transitive dev availability)",
  },
  ordinary: clean(ordinary),
  simpleProxies: clean(proxy),
  bvh: { ...clean(bvh), buildMs, staticGeometryCount: geometries.length },
  validation: { ordinaryVersusBVHMismatches: mismatches, maxHitDeltaMetres },
  decision:
    "Use selective simple proxies in runtime. BVH is faster for precise shell triangles, but current component inspection needs identity and touch envelopes; no detailed authorized CAD needing precision has been received. No global Mesh prototype mutation, new runtime import or dependency. Reevaluate on actual CAD with clipping-aware hit policy.",
};
await mkdir("docs/silo-engolfamento/evidence/upgrade", { recursive: true });
await writeFile(
  "docs/silo-engolfamento/evidence/upgrade/spatial-benchmark.json",
  `${JSON.stringify(result, null, 2)}\n`,
);
for (const geometry of geometries) {
  geometry.boundsTree?.dispose?.();
  delete geometry.boundsTree;
}
proxyGeometry.dispose();
proxyMaterial.dispose();
model.dispose();
console.log(JSON.stringify(result, null, 2));
