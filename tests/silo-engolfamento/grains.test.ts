import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createGrains } from "../../src/silo-engolfamento/GrainRenderer.ts";
import { createSiloModel } from "../../src/silo-engolfamento/SiloModel.ts";
import {
  evaluateExplorationFrame,
  evaluateDemonstrationFrame,
  evaluateFrame,
  SILO,
} from "../../src/silo-engolfamento/simulation.ts";
import { surfaceAt } from "../../src/silo-engolfamento/GrainField.ts";

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
    assert.equal(
      grains.root.children.filter((mesh) => mesh instanceof THREE.InstancedMesh).length,
      1,
      "no hidden hopper discharge pool in the local collapse scenario",
    );
    const matrix = new THREE.Matrix4(),
      position = new THREE.Vector3();
    for (const time of [0, 8, 15, 30, 2]) {
      const frame = evaluateFrame(time);
      grains.update(frame, "economic", true, false, camera);
      assert.equal(local.visible, true);
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
      grains.update(evaluateExplorationFrame(8), "economic", true, false, camera);
      assert.equal(local.visible, false, "low fill levels cannot carry detail at floating workers");
    }
    grains.dispose();
  }));

test("visible flat-floor bulk mesh follows conserved domain volume within the two-percent tolerance", (t) =>
  withCanvas(() => {
    const grains = createGrains(),
      camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 9, 15);
    const top = grains.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    let previous = Infinity,
      maximumRelativeError = 0,
      maximumIncrease = 0;
    for (const time of [0, 8, 15, 22, 30]) {
      const frame = evaluateFrame(time);
      grains.update(frame, "economic", false, false, camera);
      const p = top.geometry.getAttribute("position"),
        index = top.geometry.index!;
      let displayed = 0;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        const area =
          Math.abs(
            (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
              (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a)),
          ) / 2;
        displayed += area * ((p.getY(a) + p.getY(b) + p.getY(c)) / 3 - SILO.floorY);
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

test("continuous grain bulk stays inside every corrugated wall sector and height valley", (t) =>
  withCanvas(() => {
    const grains = createGrains(),
      model = createSiloModel();
    const wall = model.bindings.get("structure.shell")![0] as THREE.Mesh<THREE.BufferGeometry>;
    const vertices = wall.geometry.getAttribute("position"),
      indices = wall.geometry.index!;
    const triangle = new THREE.Triangle(),
      nearest = new THREE.Vector3(),
      origin = new THREE.Vector3();
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    let minimumContinuousWallRadius = Infinity,
      maximumBulkRadius = 0;
    // The XZ projection of each actual wall triangle contains every radial
    // position it can occupy at any interpolated height. Its closest point to
    // the axis bounds the complete triangle, including sector chord midpoints
    // and corrugation valleys, rather than checking only shell vertices.
    for (let index = 0; index < indices.count; index += 3) {
      for (const [offset, point] of [
        [0, a],
        [1, b],
        [2, c],
      ] as const) {
        const vertex = indices.getX(index + offset);
        point.set(vertices.getX(vertex), 0, vertices.getZ(vertex));
      }
      triangle.set(a, b, c).closestPointToPoint(origin, nearest);
      assert.ok(nearest.toArray().every(Number.isFinite));
      minimumContinuousWallRadius = Math.min(minimumContinuousWallRadius, nearest.length());
    }
    for (const mesh of grains.root.children) {
      if (!(mesh instanceof THREE.Mesh) || mesh instanceof THREE.InstancedMesh) continue;
      const positions = mesh.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex++)
        maximumBulkRadius = Math.max(
          maximumBulkRadius,
          Math.hypot(positions.getX(vertex), positions.getZ(vertex)),
        );
    }
    const clearance = minimumContinuousWallRadius - maximumBulkRadius;
    assert.ok(
      clearance > 0.004,
      `bulk R${maximumBulkRadius}m must remain inside continuous wall R${minimumContinuousWallRadius}m with >4mm clearance; actual ${clearance}m`,
    );
    t.diagnostic(
      `Continuous wall/bulk containment: wall minimum R${minimumContinuousWallRadius}m; bulk maximum R${maximumBulkRadius}m; clearance=${clearance}m across ${indices.count / 3} triangles`,
    );
    grains.dispose();
    model.dispose();
  }));

test("unchanged bulk retains exact geometry and normals while local detail moves; mode changes and reverse seeks invalidate the right buffers", () =>
  withCanvas(() => {
    const grains = createGrains(),
      camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 24, -8);
    const top = grains.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const detail = grains.root.children.find(
      (mesh) => mesh instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh;
    const position = top.geometry.getAttribute("position") as THREE.BufferAttribute;
    grains.update(evaluateFrame(10), "economic", true, false, camera);
    const normal = top.geometry.getAttribute("normal") as THREE.BufferAttribute;
    const positionVersion = position.version,
      normalVersion = normal.version,
      detailVersion = detail.instanceMatrix.version;
    const exactPositions = new Float32Array(position.array as Float32Array),
      exactNormals = new Float32Array(normal.array as Float32Array);
    grains.update(evaluateFrame(15), "economic", true, false, camera);
    assert.equal(position.version, positionVersion, "constant bulk does not upload vertices again");
    assert.equal(
      normal.version,
      normalVersion,
      "constant bulk does not recompute or upload normals",
    );
    assert.deepEqual(position.array, exactPositions);
    assert.deepEqual(normal.array, exactNormals);
    assert.ok(
      detail.instanceMatrix.version > detailVersion,
      "local grain motion remains active independently of bulk caching",
    );
    const changing = evaluateFrame(8);
    grains.update(changing, "economic", true, false, camera);
    assert.ok(position.version > positionVersion);
    for (let vertex = 0; vertex < position.count; vertex++)
      assert.ok(
        Math.abs(
          position.getY(vertex) - surfaceAt(position.getX(vertex), position.getZ(vertex), changing),
        ) < 0.000002,
      );
    const incidentPositions = new Float32Array(position.array as Float32Array);
    grains.update(evaluateDemonstrationFrame(8), "economic", true, false, camera);
    assert.notDeepEqual(
      position.array,
      incidentPositions,
      "same elapsed time in another mode has a different bulk shape",
    );
    grains.update(evaluateFrame(8), "economic", true, false, camera);
    assert.deepEqual(
      position.array,
      incidentPositions,
      "reverse mode/seek reconstructs the identical bulk buffer",
    );
    grains.dispose();
  }));

test("localized dirty normals are Float32-identical to a full Three rebuild through deformation and reverse seeks", (t) =>
  withCanvas(() => {
    const grains = createGrains(),
      camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 24, -8);
    const top = grains.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const frames = [0, 6, 6.1, 7, 8, 9, 9.9, 10, 15, 22, 23, 25, 27.9, 28, 8, 0].map((time) =>
      evaluateFrame(time),
    );
    frames.push(
      evaluateExplorationFrame(5),
      evaluateDemonstrationFrame(8),
      evaluateFrame(8),
      evaluateFrame(0),
    );
    for (const frame of frames) {
      grains.update(frame, "economic", true, false, camera);
      const positions = top.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex++)
        assert.ok(
          Math.abs(
            positions.getY(vertex) -
              surfaceAt(positions.getX(vertex), positions.getZ(vertex), frame),
          ) < 0.000002,
        );
      const reference = top.geometry.clone();
      reference.computeVertexNormals();
      assert.deepEqual(
        top.geometry.getAttribute("normal").array,
        reference.getAttribute("normal").array,
        `dirty normal buffer must equal complete geometric rebuild at ${frame.time}s / depression ${frame.depression}`,
      );
      reference.dispose();
    }
    const stats = grains.bulkStats;
    assert.equal(stats.fullNormalBuilds, 1);
    assert.ok(stats.activeVertices < stats.positionVertices * 0.02);
    assert.ok(stats.normalVertices < stats.positionVertices * 0.03);
    t.diagnostic(`Exact dirty normal workload: ${JSON.stringify(stats)}`);
    grains.dispose();
  }));
