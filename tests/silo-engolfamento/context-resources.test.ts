import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { releaseContextGpuResources } from "../../src/silo-engolfamento/contextResources";

test("lost-context GPU release deduplicates resources and preserves CPU mesh, pixels and instance transforms", () => {
  const scene = new T.Scene(),
    geometry = new T.BoxGeometry(1, 1, 1);
  const pixels = new Uint8Array([120, 130, 140, 255]),
    texture = new T.DataTexture(pixels, 1, 1);
  const material = new T.MeshStandardMaterial({ map: texture }),
    target = new T.WebGLRenderTarget(8, 8);
  scene.environment = target.texture;
  const mesh = new T.Mesh(geometry, material),
    instances = new T.InstancedMesh(geometry, material, 2);
  instances.setMatrixAt(0, new T.Matrix4().makeTranslation(1, 2, 3));
  instances.setMatrixAt(1, new T.Matrix4().makeTranslation(4, 5, 6));
  scene.add(mesh, instances);
  const lineGeometry = new T.BufferGeometry().setFromPoints([
    new T.Vector3(),
    new T.Vector3(1, 1, 1),
  ]);
  const lineMaterial = new T.LineBasicMaterial();
  scene.add(new T.LineSegments(lineGeometry, lineMaterial));
  const storedVariant = new T.BoxGeometry(0.4, 1.7, 0.3),
    storedPositions = storedVariant.getAttribute("position").array;
  const positions = geometry.getAttribute("position").array,
    matrices = instances.instanceMatrix.array;
  const expectedMatrices = [...matrices],
    counts = { geometry: 0, material: 0, texture: 0, target: 0, instance: 0 };
  geometry.addEventListener("dispose", () => counts.geometry++);
  material.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  target.addEventListener("dispose", () => counts.target++);
  instances.addEventListener("dispose", () => counts.instance++);
  const released = releaseContextGpuResources(scene, [
    storedVariant,
    geometry,
    material,
    texture,
    target,
    target.texture,
  ]);
  assert.deepEqual(released, {
    geometries: 3,
    materials: 2,
    textures: 1,
    targets: 1,
    instances: 1,
  });
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, target: 1, instance: 1 });
  assert.equal(geometry.getAttribute("position").array, positions);
  assert.equal(texture.image.data, pixels);
  assert.equal(instances.instanceMatrix.array, matrices);
  assert.deepEqual([...matrices], expectedMatrices);
  assert.equal(scene.children.length, 3);
  assert.equal(mesh.material, material);
  assert.equal(mesh.geometry, geometry);
  assert.equal(
    storedVariant.getAttribute("position").array,
    storedPositions,
    "unmounted FP variants retain their CPU geometry",
  );
});
