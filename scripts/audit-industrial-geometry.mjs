import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { Matrix4, Vector3, Quaternion } from "three";
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const data = JSON.parse(fs.readFileSync("src/industrial/data/site.json", "utf8"));
const high = await io.read("public/models/3tentos/silos-high.glb"),
  low = await io.read("public/models/3tentos/silos-low.glb");
const lod = [];
for (const e of data.elements.filter((e) => e.category === "silos")) {
  const a = high
      .getRoot()
      .listNodes()
      .find((n) => n.getName().replace(/\.\d+$/, "") === e.id),
    b = low
      .getRoot()
      .listNodes()
      .find((n) => n.getName().replace(/\.\d+$/, "") === e.id);
  if (!a || !b) throw new Error("Missing silo identity in one of the GLB LODs: " + e.id);
  const ha = getBounds(a),
    lb = getBounds(b);
  const delta = Math.max(
    ...ha.min.map((v, i) => Math.abs(v - lb.min[i])),
    ...ha.max.map((v, i) => Math.abs(v - lb.max[i])),
  );
  lod.push({ id: e.id, high: ha, low: lb, maxBoundsDifference: delta });
  const tolerance = e.cad ? 0.005 : 0.08;
  if (delta > tolerance) throw new Error("LOD silhouette bounds changed: " + e.id);
}
const inside = ([x, z], polygon) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      hit = !hit;
  }
  return hit;
};
const wallVolumes = data.elements
  .filter((e) => e.category === "buildings" && e.collider?.kind !== "none")
  .map((e) => {
    const points = e.collider?.points ?? [
      [e.position[0] - e.geometry.width / 2, e.position[2] - e.geometry.depth / 2],
      [e.position[0] + e.geometry.width / 2, e.position[2] - e.geometry.depth / 2],
      [e.position[0] + e.geometry.width / 2, e.position[2] + e.geometry.depth / 2],
      [e.position[0] - e.geometry.width / 2, e.position[2] + e.geometry.depth / 2],
    ];
    return {
      id: e.id,
      points,
      minY: e.collider?.minY ?? e.position[1],
      maxY: (e.collider?.maxY ?? e.position[1] + e.geometry.height) + 0.24,
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minZ: Math.min(...points.map((p) => p[1])),
      maxZ: Math.max(...points.map((p) => p[1])),
    };
  });
const vegetation = await io.read("public/models/3tentos/vegetation-prototypes.glb");
const intersections = [];
for (const type of ["dense", "trimmed", "pruned", "palm"])
  for (let variant = 0; variant < 3; variant++) {
    const group = vegetation
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === `${type}-${variant}`);
    const plants = data.trees.filter((t) => t.type === type && t.variant === variant);
    for (let i = 0; i < plants.length; i++) {
      const plant = plants[i];
      const matrix = new Matrix4().compose(
        new Vector3(...plant.position),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), plant.rotation),
        new Vector3().setScalar(plant.height),
      );
      const candidates = wallVolumes.filter(
        (e) =>
          plant.position[0] + plant.height > e.minX &&
          plant.position[0] - plant.height < e.maxX &&
          plant.position[2] + plant.height > e.minZ &&
          plant.position[2] - plant.height < e.maxZ,
      );
      if (!candidates.length) continue;
      for (const node of group.listChildren())
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
          const positions = primitive.getAttribute("POSITION"),
            world = new Matrix4().multiplyMatrices(
              matrix,
              new Matrix4().fromArray(node.getWorldMatrix()),
            );
          for (const e of candidates) {
            let count = 0;
            const p = new Vector3(),
              value = [0, 0, 0];
            for (let j = 0; j < positions.getCount(); j++) {
              positions.getElement(j, value);
              p.fromArray(value).applyMatrix4(world);
              if (p.y > e.minY && p.y < e.maxY && inside([p.x, p.z], e.points)) count++;
            }
            if (count)
              intersections.push({
                plant,
                building: e.id,
                mesh: node.getName(),
                verticesInside: count,
              });
          }
        }
    }
  }
const report = {
  lod,
  vegetationBuildingVertexIntersections: intersections,
  scope:
    "Checks preserved prototype vertices against closed outer wall footprints at their actual elevations; canopy/complete-assembly bounds are not wall volumes. Legacy unassociated buildings retain their previous wall boxes. Not a triangle/roof intersection proof or surveying validation.",
};
fs.writeFileSync("docs/industrial/evidence/geometry-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (intersections.length) process.exitCode = 1;
