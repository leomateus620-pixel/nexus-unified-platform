/** Verify the limited, approved landscaping changes against preserved tree geometry. */
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Matrix4, Quaternion, Vector3 } from "three";

const site = JSON.parse(fs.readFileSync("src/industrial/data/site.json", "utf8"));
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read("public/models/3tentos/vegetation-prototypes.glb");
const inside = ([x, z], polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      result = !result;
  }
  return result;
};
const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const fenceSegments = site.terrain.fences.flatMap((f) =>
  f.points.slice(1).map((p, i) => [f.points[i], p]),
);
const walls = site.elements.find((e) => e.id === "ED-05").collider;
const plantReport = [];
for (const change of site.cadRegistration.localAdjustments.trees) {
  const plant = site.trees[change.index];
  const group = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === `${plant.type}-${plant.variant}`);
  if (!group) throw new Error("Missing preserved vegetation prototype");
  const item = {
    index: change.index,
    before: change.before.position,
    after: plant.position,
    verticesBeforeInsideWalls: 0,
    verticesAfterInsideWalls: 0,
    minFenceDistance: Infinity,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const placement = new Matrix4().compose(
    new Vector3(...plant.position),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), plant.rotation),
    new Vector3().setScalar(plant.height),
  );
  const vertex = new Vector3(),
    value = [0, 0, 0];
  group.traverse((n) => {
    const matrix = new Matrix4().multiplyMatrices(
      placement,
      new Matrix4().fromArray(n.getWorldMatrix()),
    );
    for (const primitive of n.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION");
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, value);
        vertex.fromArray(value).applyMatrix4(matrix);
        const p = vertex.toArray();
        p.forEach((v, k) => {
          item.min[k] = Math.min(item.min[k], v);
          item.max[k] = Math.max(item.max[k], v);
        });
        const before = [
          p[0] - plant.position[0] + change.before.position[0],
          p[2] - plant.position[2] + change.before.position[2],
        ];
        if (p[1] >= walls.minY && p[1] <= walls.maxY) {
          if (inside(before, walls.points)) item.verticesBeforeInsideWalls++;
          if (inside([p[0], p[2]], walls.points)) item.verticesAfterInsideWalls++;
        }
        for (const [a, b] of fenceSegments)
          item.minFenceDistance = Math.min(
            item.minFenceDistance,
            segmentDistance([p[0], p[2]], a, b),
          );
      }
    }
  });
  if (item.verticesAfterInsideWalls || item.minFenceDistance < 0.5)
    throw new Error(`Tree ${change.index} still conflicts`);
  plantReport.push(item);
}
const tank = site.elements.find((e) => e.id === "CAD-WATER-TANK");
const corners = [
  [tank.bounds.min[0], tank.bounds.min[2]],
  [tank.bounds.max[0], tank.bounds.min[2]],
  [tank.bounds.max[0], tank.bounds.max[2]],
  [tank.bounds.min[0], tank.bounds.max[2]],
];
const tankFenceClearance = Math.min(
  ...corners.flatMap((p) => fenceSegments.map(([a, b]) => segmentDistance(p, a, b))),
);
if (corners.some((p) => !inside(p, site.terrain.site)) || tankFenceClearance < 0.5)
  throw new Error("Tank enclosure lacks clearance");
const area = (points) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0),
  ) / 2;
const added = site.cadRegistration.localAdjustments.siteAddedPoints;
const siteExtensionArea = area([added[0], added[1], added[2], added[3]]);
const report = {
  source:
    "preserved vegetation-prototypes.glb decoded positions, CAD registry bounds and local Nexus fence/site geometry",
  limits:
    "Tree checks count mesh vertices within the closed wall footprint and measure projected fence distance. Tank clearance uses the full assembly bounding rectangle; no claim of a full triangle intersection audit.",
  trees: plantReport,
  tank: {
    axis: tank.position,
    bounds: tank.bounds,
    minFenceClearanceMeters: tankFenceClearance,
    allBoundsCornersInsideSite: true,
  },
  siteExtensionAreaSquareMeters: siteExtensionArea,
  patch: site.terrain.localPatches.find((p) => p.id === "CAD-WATER-TANK-PAD"),
  originalBoundaryVerticesRetained: true,
};
fs.writeFileSync(
  "docs/industrial/evidence/cad-local-compatibility.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
