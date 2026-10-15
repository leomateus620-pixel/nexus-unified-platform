/** CPU-only comparison of the former full surface/normal rebuild and the exact
 * production bulk updater. No renderer, local grain instances, rig or React is
 * measured. Run alone after GPU captures: npx tsx scripts/silo-engolfamento/benchmark-bulk.mts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import * as T from "three";
import ts from "typescript";
import { createGrains } from "../../src/silo-engolfamento/GrainRenderer.ts";
import { surfaceAt, metres } from "../../src/silo-engolfamento/GrainField.ts";
import {
  evaluateFrame,
  evaluateExplorationFrame,
  evaluateDemonstrationFrame,
  type SiloFrame,
} from "../../src/silo-engolfamento/simulation.ts";

const source = await readFile("src/silo-engolfamento/GrainRenderer.ts", "utf8");
const functionStart = source.indexOf("function createBulkUpdater(");
const functionEnd = source.indexOf("/** Visible shell", functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, "production updater markers exist");
// Load the actual private production function without adding an application
// export or copying its implementation into this diagnostic.
const factoryBody = ts.transpileModule(source.slice(functionStart, functionEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const createBulkUpdater = new Function(
  "surfaceAt",
  "metres",
  `${factoryBody}\nreturn createBulkUpdater;`,
)(surfaceAt, metres) as (geometry: T.BufferGeometry) => {
  update(height: number, depression: number): boolean;
  stats: Record<string, number>;
};

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const context = {
  fillRect() {},
  save() {},
  translate() {},
  rotate() {},
  scale() {},
  beginPath() {},
  arc() {},
  fill() {},
  restore() {},
  createRadialGradient: () => ({ addColorStop() {} }),
};
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
});
try {
  const grains = createGrains();
  const template = (grains.root.children[0] as T.Mesh<T.BufferGeometry>).geometry;
  const fullGeometry = template.clone(),
    dirtyGeometry = template.clone();
  const dirty = createBulkUpdater(dirtyGeometry);
  const positions = fullGeometry.getAttribute("position");
  const full = (frame: SiloFrame) => {
    for (let vertex = 0; vertex < positions.count; vertex++)
      positions.setY(vertex, surfaceAt(positions.getX(vertex), positions.getZ(vertex), frame));
    positions.needsUpdate = true;
    fullGeometry.computeVertexNormals();
  };
  const localized = (frame: SiloFrame) => dirty.update(frame.surfaceHeight, frame.depression);
  const frames = [0, 6, 6.1, 7, 8, 9, 9.9, 10, 15, 22, 23, 25, 27.9, 28, 8, 0].map((time) =>
    evaluateFrame(time),
  );
  frames.push(
    evaluateExplorationFrame(5),
    evaluateDemonstrationFrame(8),
    evaluateFrame(8),
    evaluateFrame(0),
  );
  let maximumPositionDifference = 0,
    maximumNormalDifference = 0;
  for (const frame of frames) {
    full(frame);
    localized(frame);
    for (const name of ["position", "normal"] as const) {
      const a = fullGeometry.getAttribute(name).array,
        b = dirtyGeometry.getAttribute(name).array;
      let maximum = 0;
      for (let index = 0; index < a.length; index++)
        maximum = Math.max(maximum, Math.abs(a[index]! - b[index]!));
      if (name === "position")
        maximumPositionDifference = Math.max(maximumPositionDifference, maximum);
      else maximumNormalDifference = Math.max(maximumNormalDifference, maximum);
    }
  }
  assert.equal(
    maximumPositionDifference,
    0,
    "full and production updates have identical Float32 positions",
  );
  assert.equal(
    maximumNormalDifference,
    0,
    "full and production updates have identical Float32 normals",
  );
  const run = (update: (frame: SiloFrame) => unknown) => {
    const times: number[] = [];
    for (const frame of frames) {
      const before = performance.now();
      update(frame);
      times.push(performance.now() - before);
    }
    return times;
  };
  for (let warmup = 0; warmup < 2; warmup++) {
    run(full);
    run(localized);
  }
  const samples = { full: [] as number[], localized: [] as number[] };
  const repetitions: Array<{
    iteration: number;
    order: string[];
    fullMs: number;
    localizedMs: number;
  }> = [];
  for (let iteration = 0; iteration < 10; iteration++) {
    const order =
      iteration % 2 === 0 ? (["full", "localized"] as const) : (["localized", "full"] as const);
    const totals = { full: 0, localized: 0 };
    for (const method of order) {
      const times = run(method === "full" ? full : localized);
      samples[method].push(...times);
      totals[method] = times.reduce((sum, value) => sum + value, 0);
    }
    repetitions.push({
      iteration,
      order: [...order],
      fullMs: totals.full,
      localizedMs: totals.localized,
    });
  }
  const summary = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)]!;
    return {
      samples: sorted.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted.at(-1)!,
    };
  };
  const report = {
    schema: "nexus-silo-bulk-cpu-benchmark/1.0",
    testedAt: new Date().toISOString(),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    runtime: process.version,
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    method:
      "Identical cloned bulk geometry; former full surfaceAt plus computeVertexNormals versus exact private production updater; two warmup loops; ten loops each in alternating order; 20 forward/reverse/mode/level states per loop; time excludes setup and validation.",
    frames: frames.map((frame) => ({
      time: frame.time,
      height: frame.surfaceHeight,
      depression: frame.depression,
    })),
    stats: dirty.stats,
    equality: { maximumPositionDifference, maximumNormalDifference },
    cpuMillisecondsPerUpdate: {
      full: summary(samples.full),
      localized: summary(samples.localized),
    },
    repetitions,
    limitations: [
      "Node CPU microbenchmark, not browser frame time, GPU duration or physical mobile performance.",
      "Only bulk positions and normals are measured; no local grain detail, renderer upload, rig, camera, HUD or environment in either alternative.",
      "Previous browser profiles used a frontal camera subsequently corrected; their end-to-end delta is not an identical-view causal comparison.",
    ],
  };
  await writeFile(
    "docs/silo-engolfamento/evidence/upgrade/bulk-cpu-benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  fullGeometry.dispose();
  dirtyGeometry.dispose();
  grains.dispose();
} finally {
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
}
