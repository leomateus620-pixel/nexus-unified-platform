import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  fitBoxDistance,
  constrainExterior,
  NO_INSETS,
  trolleyCameraOffset,
} from "../../src/silo-engolfamento/cameraGeometry";
import { INCIDENT_VIEW_DIRECTION } from "../../src/silo-engolfamento/CameraController";
import { createSiloModel, CUT_PLANE_Z } from "../../src/silo-engolfamento/SiloModel";
import { SiloSimulation } from "../../src/silo-engolfamento/simulation";

test("box fitting protects the free CSS viewport in desktop, mobile and centimeter inspection", () => {
  for (const [width, height, right, bottom] of [
    [1440, 800, 340, 0],
    [390, 740, 0, 285],
    [844, 300, 300, 0],
  ]) {
    for (const halfSize of [0.1, 15]) {
      const box = new T.Box3(
        new T.Vector3(-halfSize, -halfSize, -halfSize),
        new T.Vector3(halfSize, halfSize, halfSize),
      );
      const direction = new T.Vector3(0.8, 0.35, 1).normalize();
      const camera = new T.PerspectiveCamera(42, width / height, 0.002, 500);
      const insets = { left: 0, right, top: 0, bottom };
      const distance = fitBoxDistance(
        box,
        direction,
        camera.fov,
        camera.aspect,
        width,
        height,
        insets,
      );
      camera.position.copy(direction).multiplyScalar(distance);
      camera.setViewOffset(width, height, right / 2, bottom / 2, width, height);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let i = 0; i < 8; i++) {
        const point = new T.Vector3(
          i & 1 ? halfSize : -halfSize,
          i & 2 ? halfSize : -halfSize,
          i & 4 ? halfSize : -halfSize,
        ).project(camera);
        const x = ((point.x + 1) * width) / 2,
          y = ((1 - point.y) * height) / 2;
        assert.ok(x >= 0 && x <= width - right, `x=${x} outside free width ${width - right}`);
        assert.ok(y >= 0 && y <= height - bottom, `y=${y} outside free height ${height - bottom}`);
      }
      const unobstructed = fitBoxDistance(
        box,
        direction,
        camera.fov,
        camera.aspect,
        width,
        height,
        NO_INSETS,
      );
      assert.ok(distance >= unobstructed);
    }
  }
});

test("exterior navigation respects the opaque shell and roof, and ground", () => {
  for (let angle = -Math.PI; angle <= Math.PI; angle += Math.PI / 18) {
    const point = new T.Vector3(3 * Math.sin(angle), 10, 3 * Math.cos(angle));
    constrainExterior(point, 11.32, 24.88, 30.403, 1);
    assert.ok(Math.hypot(point.x, point.z) >= 11.62 - 1e-9);
  }
  const above = new T.Vector3(0, 33, 0);
  constrainExterior(above, 11.32, 24.88, 30.403, 1);
  assert.deepEqual(above.toArray(), [0, 33, 0]);
  const below = new T.Vector3(20, -2, 0);
  constrainExterior(below, 11.32, 24.88, 30.403, 1);
  assert.equal(below.y, 0.35);
});

test("frontal incident framing sees both rigs and the connection through the actual section", () => {
  const model = createSiloModel();
  model.root.updateMatrixWorld(true);
  const simulation = new SiloSimulation();
  for (const time of [4, 12]) {
    simulation.seek(time);
    const frame = simulation.getFrame();
    const center = new T.Vector3(
      (frame.workers.A.position.x + frame.workers.B.position.x) / 2,
      frame.surfaceHeight,
      (frame.workers.A.position.z + frame.workers.B.position.z) / 2,
    );
    const box = new T.Box3(
      center.clone().add(new T.Vector3(-2, -0.9, -1)),
      center.clone().add(new T.Vector3(2, 2.3, 1.2)),
    );
    for (const [width, height] of [
      [390, 710],
      [844, 275],
      [1366, 640],
      [1440, 772],
    ]) {
      const camera = new T.PerspectiveCamera(42, width! / height!, 0.01, 150);
      const direction = new T.Vector3().fromArray(INCIDENT_VIEW_DIRECTION).normalize();
      const target = box.getCenter(new T.Vector3());
      camera.position
        .copy(target)
        .addScaledVector(
          direction,
          fitBoxDistance(box, direction, 42, camera.aspect, width!, height!),
        );
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const point of [
        frame.workers.A.eye,
        frame.workers.B.eye,
        frame.workers.A.harness,
        frame.connection.anchor,
      ]) {
        const world = new T.Vector3(point.x, point.y, point.z);
        const projected = world.clone().project(camera);
        assert.ok(
          Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z < 1,
          `incident point is clipped at ${width}x${height}`,
        );
        const delta = world.clone().sub(camera.position);
        const ray = new T.Raycaster(
          camera.position,
          delta.clone().normalize(),
          0,
          delta.length() - 0.01,
        );
        const opaque = ray
          .intersectObjects(
            [...model.bindings.get("structure.shell")!, ...model.bindings.get("structure.roof")!],
            true,
          )
          .filter((hit) => hit.point.z <= CUT_PLANE_Z + 0.001);
        assert.equal(
          opaque.length,
          0,
          `incident rig or rope is hidden by intact metal at ${width}x${height}`,
        );
      }
    }
  }
  model.dispose();
});

test("the trolley camera stays inside the closed silo around eleven supports and the angular seam", () => {
  const model = createSiloModel();
  model.root.updateMatrixWorld(true);
  const r = 10.9415,
    y = 24.281;
  for (const angle of [
    ...Array.from({ length: 11 }, (_, i) => (i * Math.PI * 2) / 11),
    -1e-8,
    0,
    Math.PI * 2 - 1e-8,
    Math.PI * 2 + 1e-8,
  ]) {
    const point = new T.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
    const position = point.clone().add(trolleyCameraOffset(point));
    assert.ok(Math.hypot(position.x, position.z) < 11);
    assert.ok(Math.abs(position.distanceTo(point) - 1.15) < 1e-10);
    const ray = new T.Raycaster(position, point.clone().sub(position).normalize(), 0, 1.14);
    assert.equal(
      ray.intersectObjects(
        [...model.bindings.get("structure.shell")!, ...model.bindings.get("structure.roof")!],
        true,
      ).length,
      0,
      `closed shell/roof occludes trolley at angle ${angle}`,
    );
  }
  const before = new T.Vector3(Math.sin(-1e-8) * r, y, Math.cos(-1e-8) * r);
  const after = new T.Vector3(Math.sin(1e-8) * r, y, Math.cos(1e-8) * r);
  assert.ok(
    before.add(trolleyCameraOffset(before)).distanceTo(after.add(trolleyCameraOffset(after))) <
      1e-6,
  );
  model.dispose();
});
