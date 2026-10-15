/** CPU diagnostic: actual deformed near-LOD vertices, not a full contact test.
 * Usage: npx tsx scripts/silo-engolfamento/audit-clearance.mts [report.json] */
import * as T from "three";
import { NodeIO } from "@gltf-transform/core";
import { writeFile } from "node:fs/promises";
import { createWorkers, type WorkerPose } from "../../src/silo-engolfamento/Workers.ts";
import {
  evaluateFrame,
  evaluateDemonstrationFrame,
  type SiloFrame,
} from "../../src/silo-engolfamento/simulation.ts";
import { SILO_CONFIG } from "../../src/silo-engolfamento/SiloConfig.ts";

const io = new NodeIO(),
  assets = new Map<string, Uint8Array>();
for (const variant of ["a", "b"]) {
  const document = await io.read(`public/models/silo-engolfamento/worker-${variant}.glb`);
  for (const material of document.getRoot().listMaterials())
    material
      .setBaseColorTexture(null)
      .setNormalTexture(null)
      .setMetallicRoughnessTexture(null)
      .setOcclusionTexture(null)
      .setEmissiveTexture(null);
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  assets.set(variant, await io.writeBinary(document));
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) =>
  new Response(assets.get(String(input).includes("worker-a") ? "a" : "b"), { status: 200 });
function adapt(frame: SiloFrame, id: "A" | "B"): WorkerPose {
  const worker = frame.workers[id];
  const foot = (side: "left" | "right") => ({
    position: [
      worker.feet[side].position.x,
      worker.feet[side].position.y,
      worker.feet[side].position.z,
    ] as const,
    yaw: worker.feet[side].yaw,
    locked: worker.feet[side].locked,
  });
  return {
    position: [worker.position.x, worker.position.y, worker.position.z],
    heading: worker.yaw,
    walkPhase: worker.walkPhase,
    mobility: worker.mobility,
    depth: worker.depth,
    tension: worker.tension,
    lean: worker.lean,
    connected: worker.connected,
    dorsal: [worker.harness.x, worker.harness.y, worker.harness.z],
    feet: { left: foot("left"), right: foot("right") },
  };
}
const samples: { mode: string; evaluate: (time: number) => SiloFrame; times: number[] }[] = [
  { mode: "incident", evaluate: evaluateFrame, times: [0, 3.25, 4.2, 6, 7, 10, 15, 20, 30] },
  {
    mode: "lvhf",
    evaluate: evaluateDemonstrationFrame,
    times: Array.from({ length: 17 }, (_, index) => index * 5),
  },
];
const result = {
  kind: "actual-rig-deformed-vertex-clearance",
  testedAt: new Date().toISOString(),
  configuration: SILO_CONFIG.version,
  frames: 0,
  vertices: 0,
  minWall: Infinity,
  minRing: Infinity,
  minHelmetRing: Infinity,
  minRoof: Infinity,
  samples: samples.map(({ mode, times }) => ({ mode, times })),
  critical: {} as Record<
    string,
    { mode: string; time: number; id: string; mesh: string; point: number[] }
  >,
  limitations: [
    "Deformed rendered vertex samples, not certified triangle contact/CAD support mechanics.",
    "Cylinder wall, nominal cable torus and analytical conical roof only; guides, rope and connectors need separate inspection.",
    "No GPU or physical device.",
  ],
};
const workers = await createWorkers(),
  camera = new T.PerspectiveCamera(),
  point = new T.Vector3();
try {
  for (const { mode, evaluate, times } of samples)
    for (const time of times) {
      const frame = evaluate(time);
      camera.position.set(
        frame.workers.A.position.x,
        frame.surfaceHeight + 2,
        frame.workers.A.position.z + 2,
      );
      workers.update({ A: adapt(frame, "A"), B: adapt(frame, "B") }, camera);
      workers.root.updateMatrixWorld(true);
      result.frames++;
      for (const id of ["A", "B"] as const)
        workers.getTechnician(id).traverse((mesh) => {
          if (!(mesh instanceof T.Mesh) || !mesh.visible || !mesh.name.startsWith("near_")) return;
          for (let index = 0; index < mesh.geometry.getAttribute("position").count; index++) {
            mesh.getVertexPosition(index, point);
            point.applyMatrix4(mesh.matrixWorld);
            const radius = Math.hypot(point.x, point.z);
            const wall = SILO_CONFIG.radius.value - radius;
            const ring =
              Math.hypot(radius - SILO_CONFIG.ringRadius.value, point.y - SILO_CONFIG.ringY.value) -
              SILO_CONFIG.cableDiameter.value / 2;
            const roof =
              SILO_CONFIG.roofTop.value -
              ((SILO_CONFIG.roofTop.value - SILO_CONFIG.bodyTop.value) *
                (Math.max(SILO_CONFIG.collarRadius.value, radius) -
                  SILO_CONFIG.collarRadius.value)) /
                (SILO_CONFIG.radius.value - SILO_CONFIG.collarRadius.value) -
              point.y;
            result.vertices++;
            for (const [key, value] of [
              ["minWall", wall],
              ["minRing", ring],
              ["minRoof", roof],
            ] as const)
              if (value < result[key]) {
                result[key] = value;
                result.critical[key] = { mode, time, id, mesh: mesh.name, point: point.toArray() };
              }
            if (mesh.name.includes("helmet") && ring < result.minHelmetRing) {
              result.minHelmetRing = ring;
              result.critical["minHelmetRing"] = {
                mode,
                time,
                id,
                mesh: mesh.name,
                point: point.toArray(),
              };
            }
          }
        });
    }
} finally {
  workers.dispose();
  globalThis.fetch = originalFetch;
}
const json = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv[2]) await writeFile(process.argv[2], json);
console.log(json);
if (
  ![result.minWall, result.minRing, result.minHelmetRing, result.minRoof].every(
    (value) => Number.isFinite(value) && value > 0,
  )
)
  process.exitCode = 1;
