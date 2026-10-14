import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createGrains } from "../../src/silo-engolfamento/GrainRenderer.ts";
import { evaluateFrame, SILO } from "../../src/silo-engolfamento/simulation.ts";

// CPU-only geometry checks. A minimal drawing context supplies procedural
// texture creation; pixels and materials are inspected separately in Chrome.
function withCanvas(run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const context = {
    fillStyle: "",
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
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

test("grain detail remains inside the incident region and is absent when entry is blocked", () =>
  withCanvas(() => {
    const grains = createGrains(),
      camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 8, 2);
    const local = grains.root.children.find(
      (mesh) => mesh instanceof THREE.InstancedMesh && mesh.instanceMatrix.count === 3000,
    ) as THREE.InstancedMesh;
    const outlet = grains.root.children.find(
      (mesh) => mesh instanceof THREE.InstancedMesh && mesh.instanceMatrix.count === 180,
    ) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(),
      position = new THREE.Vector3();
    for (const time of [0, 8, 15, 30, 2]) {
      const frame = evaluateFrame(time);
      grains.update(frame, "economic", true, false, camera);
      assert.equal(local.visible, true);
      assert.equal(outlet.visible, frame.gate > 0.01);
      for (let i = 0; i < local.count; i++) {
        local.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        assert.ok(position.toArray().every(Number.isFinite));
        assert.ok(Math.hypot(position.x, position.z) < SILO.radius, "no grain outside enclosure");
      }
      const prevention = evaluateFrame(time, "prevention");
      assert.ok(
        Math.hypot(prevention.workers.A.position.x, prevention.workers.A.position.z) > SILO.radius,
      );
      grains.update(prevention, "economic", true, false, camera);
      assert.equal(
        local.visible,
        false,
        "external preventive workers cannot carry floating grain detail",
      );
      assert.equal(outlet.visible, false, "blocked discharge emits no pooled particles");
    }
    grains.dispose();
  }));

test("visible bulk mesh follows domain discharge within the documented two-percent volume tolerance", (t) =>
  withCanvas(() => {
    const grains = createGrains(),
      camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 9, 15);
    const top = grains.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const cone = grains.root.children[2] as THREE.Mesh<THREE.CylinderGeometry>;
    const { radiusTop: r, radiusBottom: b, height: h } = cone.geometry.parameters;
    const hopper = (Math.PI * h * (r * r + r * b + b * b)) / 3;
    let previous = Infinity,
      maximumRelativeError = 0,
      maximumIncrease = 0;
    for (const time of [0, 8, 15, 22, 30]) {
      const frame = evaluateFrame(time);
      grains.update(frame, "economic", false, false, camera);
      const p = top.geometry.getAttribute("position"),
        index = top.geometry.index!;
      let displayed = hopper;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        const area =
          Math.abs(
            (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
              (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a)),
          ) / 2;
        displayed += area * ((p.getY(a) + p.getY(b) + p.getY(c)) / 3 - SILO.hopperTop);
      }
      const relativeError = Math.abs(displayed - frame.volume) / frame.volume;
      maximumRelativeError = Math.max(maximumRelativeError, relativeError);
      maximumIncrease = Math.max(maximumIncrease, displayed - previous);
      assert.ok(relativeError < 0.02, `display=${displayed}, domain=${frame.volume}`);
      // Relaxing the depression has a small quadrature residual because the
      // mesh is inset from the physical wall. Limit it to 0.01%, independently
      // of the two-percent absolute volume approximation.
      assert.ok(
        displayed <= previous + frame.volume * 0.0001,
        "no meaningful visual bulk increase without feeding",
      );
      previous = displayed;
    }
    t.diagnostic(
      `Visual volume: maximum relative error=${maximumRelativeError}; maximum redistribution increase=${maximumIncrease}m³`,
    );
    grains.dispose();
  }));
