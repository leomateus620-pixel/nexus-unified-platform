import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { LC02, PATH, ELEMENTS } from "../../src/escada/lc02-layout.ts";
import { createLC02Model } from "../../src/escada/lc02-model.ts";

test("PDF dimensions and equal flights retain the 90-degree plan turn", () => {
  assert.deepEqual(LC02.levels, [0, 3, 6]);
  assert.equal(LC02.width, 1.2);
  assert.equal(LC02.p1[0] - LC02.referenceEdgeX, 3);
  assert.equal(LC02.p2[0] - LC02.p1[0], 5);
  const a = new THREE.Vector3(...PATH[2]!),
    b = new THREE.Vector3(...PATH[3]!);
  const c = new THREE.Vector3(...PATH[5]!),
    d = new THREE.Vector3(...PATH[6]!);
  assert.ok(Math.abs(a.distanceTo(b) - c.distanceTo(d)) < 1e-10);
  const ab = b.sub(a),
    cd = d.sub(c);
  ab.y = 0;
  cd.y = 0;
  assert.equal(ab.dot(cd), 0);
  const newLanding = ELEMENTS.find((e) => e.id === "new")!;
  assert.ok(newLanding.position[0] - 0.6 >= 0 && newLanding.position[0] + 0.6 < LC02.p1[0]);
});
test("Every walking segment has a tread or landing below it with no rail across the route", () => {
  const model = createLC02Model();
  model.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const surfaces = [model.layers.stairs, model.layers.landings, model.layers.existing];
  try {
    for (let k = 1; k < PATH.length; k++) {
      const a = new THREE.Vector3(...PATH[k - 1]!),
        b = new THREE.Vector3(...PATH[k]!);
      for (let i = 0; i <= 30; i++) {
        const p = a.clone().lerp(b, i / 30);
        // Probe a small foot area: open grating intentionally has voids.
        const hits = [];
        for (const [dx, dz] of [
          [0, 0],
          [0.055, 0],
          [-0.055, 0],
          [0.035, 0],
          [-0.035, 0],
          [0.015, 0],
          [-0.015, 0],
          [0, 0.055],
          [0, -0.055],
        ]) {
          ray.set(p.clone().add(new THREE.Vector3(dx, 0.45, dz)), new THREE.Vector3(0, -1, 0));
          hits.push(...ray.intersectObjects(surfaces, true).filter((h) => h.distance < 0.85));
        }
        const hit = hits.sort((a, b) => a.distance - b.distance)[0];
        assert.ok(hit, `Missing floor at segment ${k}: ${p.toArray()}`);
        assert.ok(Math.abs(hit.point.y - p.y) < 0.27, `Floor discontinuity at ${p.toArray()}`);
      }
      const length = a.distanceTo(b);
      const direction = b.clone().sub(a).normalize();
      for (const height of [0.4, 0.75, 1.05]) {
        ray.set(a.clone().add(new THREE.Vector3(0, height, 0)), direction);
        ray.far = length - 0.07;
        assert.equal(
          ray.intersectObject(model.layers.rails, true).length,
          0,
          `Guardrail across segment ${k}`,
        );
      }
      ray.far = Infinity;
    }
  } finally {
    model.dispose();
  }
});
test("Walking route stays outside the cladding and roof envelope", () => {
  const model = createLC02Model();
  model.root.updateMatrixWorld(true);
  const envelope = model.layers.existing.children.filter((o) =>
    ["existing:cladding", "existing:roof"].includes(o.name),
  );
  const ray = new THREE.Raycaster();
  try {
    for (let k = 1; k < PATH.length; k++) {
      const a = new THREE.Vector3(...PATH[k - 1]!),
        b = new THREE.Vector3(...PATH[k]!);
      for (const height of [0.1, 1, 2]) {
        ray.set(a.clone().add(new THREE.Vector3(0, height, 0)), b.clone().sub(a).normalize());
        ray.far = a.distanceTo(b);
        assert.equal(
          ray.intersectObjects(envelope, true).length,
          0,
          `Context intersection on route ${k}`,
        );
      }
    }
  } finally {
    model.dispose();
  }
});
test("Batched model is finite and inside the interactive geometry budget", () => {
  const model = createLC02Model();
  let triangles = 0,
    meshes = 0;
  try {
    assert.equal(model.root.children.length, 6);
    model.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
        for (const v of o.geometry.getAttribute("position").array) assert.ok(Number.isFinite(v));
      }
    });
    assert.ok(meshes <= 20, `${meshes} meshes`);
    assert.ok(triangles < 50000, `${triangles} triangles`);
    console.log(
      JSON.stringify({ meshes, triangles, materials: Object.keys(model.materials).length }),
    );
  } finally {
    model.dispose();
  }
});
