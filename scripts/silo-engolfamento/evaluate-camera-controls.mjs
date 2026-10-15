import * as T from "three";
import CameraControls from "camera-controls";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// DOMRect is data-only here: this is a CPU adapter evaluation, not a gesture test.
globalThis.DOMRect = class DOMRect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    Object.assign(this, { x, y, width, height });
  }
};
CameraControls.install({ THREE: T });
const cases = [];
for (const [name, size, aspect] of [
  ["silo", [24.64, 31, 24.64], 1440 / 834],
  ["trolley", [0.105, 0.1, 0.062], 1440 / 834],
  ["portrait-trolley", [0.105, 0.1, 0.062], 390 / 786],
]) {
  const camera = new T.PerspectiveCamera(42, aspect, 0.002, 500);
  camera.position.set(0, 0, 60);
  const controls = new CameraControls(camera);
  const box = new T.Box3().setFromCenterAndSize(new T.Vector3(), new T.Vector3().fromArray(size));
  const fit = controls.fitToBox(box, false);
  controls.update(1 / 60);
  await fit;
  camera.updateMatrixWorld();
  let maxAbsNDC = 0;
  for (let i = 0; i < 8; i++) {
    const point = new T.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).project(camera);
    maxAbsNDC = Math.max(maxAbsNDC, Math.abs(point.x), Math.abs(point.y));
  }
  assert.ok(maxAbsNDC <= 1.00001, `${name}: candidate bbox fit clips corners`);
  const savedPosition = camera.position.clone(),
    savedTarget = controls.getTarget(new T.Vector3());
  controls.saveState();
  const move = controls.setLookAt(2, 3, 4, 0, 0, 0, false);
  controls.update(1 / 60);
  await move;
  const reset = controls.reset(false);
  controls.update(1 / 60);
  await reset;
  assert.ok(camera.position.distanceTo(savedPosition) < 1e-7);
  assert.ok(controls.getTarget(new T.Vector3()).distanceTo(savedTarget) < 1e-7);
  void controls.setLookAt(4, 4, 4, 0, 0, 0, true);
  controls.update(1 / 60);
  controls.stop();
  const stoppedPosition = camera.position.clone();
  controls.update(1 / 60);
  const stopJumpMetres = camera.position.distanceTo(stoppedPosition);
  // In installed 3.1.2 stop() copies pending end-state into the current state.
  // A gesture-cancel adapter must explicitly hold the current pose instead.
  void controls.setLookAt(8, 8, 8, 1, 1, 1, true);
  controls.update(1 / 60);
  const current = camera.position.clone(),
    currentTarget = controls.getTarget(new T.Vector3(), false);
  const hold = controls.setLookAt(
    current.x,
    current.y,
    current.z,
    currentTarget.x,
    currentTarget.y,
    currentTarget.z,
    false,
  );
  controls.update(1 / 60);
  await hold;
  assert.ok(camera.position.distanceTo(current) < 1e-7);
  cases.push({
    name,
    sizeMetres: size,
    aspect,
    distanceMetres: savedPosition.length(),
    maxAbsNDC,
    fit: "passed",
    restore: "passed",
    installedStopJumpMetres: stopJumpMetres,
    cancellationAdapterHold: "passed",
  });
  controls.dispose();
}
const report = {
  evaluatedAt: new Date().toISOString(),
  runtime: process.version,
  package: "camera-controls",
  version: "3.1.2",
  license: "MIT",
  authority: "Candidate adapter only; no DOM connection, second renderer or production import",
  cases,
  notVerified: [
    "Native pointer/touch gesture behavior of camera-controls; production keeps the existing OrbitControls gesture contract",
    "Candidate panel offsets; production pixel-inset fitting has its own eight-corner projection tests",
    "Relative runtime FPS or bundle reduction; no such benefit claimed",
  ],
  decision:
    "Candidate supports small/large box fit, stop and restore. Keep the established single OrbitControls adapter: current requirements are already implemented/tested and no concrete benefit justifies migrating gesture/lifecycle authority. camera-controls remains a documented candidate, not a dependency added for attribution.",
};
await mkdir("docs/silo-engolfamento/evidence/upgrade", { recursive: true });
await writeFile(
  "docs/silo-engolfamento/evidence/upgrade/camera-controls-evaluation.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
