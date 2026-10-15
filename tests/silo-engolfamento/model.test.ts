import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createSiloModel } from "../../src/silo-engolfamento/SiloModel.ts";
import { SILO } from "../../src/silo-engolfamento/simulation.ts";

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) result.push(node);
  });
  return result;
}
function visible(node: THREE.Object3D) {
  let ancestor: THREE.Object3D | null = node;
  while (ancestor) {
    if (!ancestor.visible) return false;
    ancestor = ancestor.parent;
  }
  return true;
}
function renderedBudget(root: THREE.Object3D) {
  let calls = 0;
  let triangles = 0;
  let shadowCalls = 0;
  for (const mesh of meshes(root)) {
    if (!visible(mesh)) continue;
    calls += Array.isArray(mesh.material) ? mesh.material.length : 1;
    triangles +=
      ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3) *
      (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
    if (mesh.castShadow) shadowCalls++;
  }
  return { calls, triangles, shadowCalls };
}

test("new parametric silo stays inside its static budget without DOM or industrial scene", () => {
  const model = createSiloModel();
  const budget = renderedBudget(model.root);
  assert.ok(budget.calls <= 26, `${budget.calls} static calls`);
  // Large grounded shell + real corrugated silhouette + 32 stiffeners and full
  // access. This is a model-only ceiling, NOT approval of the complete scene's
  // 250k economic target (measured separately with grains, rigs and LVHF).
  assert.ok(budget.triangles <= 130000, `${budget.triangles} static triangles including instances`);
  assert.ok(budget.shadowCalls <= 7, `${budget.shadowCalls} shadow calls`);
  assert.ok(budget.triangles > 10000, "the industrial shell must retain its structural silhouette");
  model.dispose();
});

test("every merged attribute is finite and the complete assembly keeps metre-scale proportions", () => {
  const model = createSiloModel();
  for (const mesh of meshes(model.root)) {
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
      const array = "data" in attribute ? attribute.data.array : attribute.array;
      assert.ok(Array.from(array).every(Number.isFinite), `${name} contains nonfinite values`);
    }
  }
  const bounds = new THREE.Box3().setFromObject(model.root);
  assert.ok(Math.abs(bounds.min.y + 0.18) < 1e-5, "base contacts the yard at −0.18m");
  assert.ok(bounds.max.y > SILO.roofTop && bounds.max.y < SILO.roofTop + 0.5);
  assert.ok(bounds.getSize(new THREE.Vector3()).x >= SILO.radius * 2);
  assert.ok(bounds.getSize(new THREE.Vector3()).x < 24.5);
  model.dispose();
});

test("didactic cut clips wall, roof and structure on one plane; first person restores enclosure", () => {
  const model = createSiloModel();
  const [shell, roof, access] = model.root.children;
  assert.ok(shell && roof && access);
  model.setView(false, false, false);
  const modelMaterials = new Set<THREE.Material>();
  for (const mesh of meshes(model.root))
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      modelMaterials.add(material);
  assert.ok([...modelMaterials].every((material) => !material.clippingPlanes?.length));
  model.setView(true, false, false);
  // Intact geometry is clipped by one material plane; the section is not an
  // opening or physical grain outlet. Foundation/floor stay grounded.
  assert.equal(shell.visible, true);
  assert.equal(roof.visible, true);
  const clipped = [...modelMaterials].filter((material) => material.clippingPlanes?.length);
  assert.ok(clipped.length >= 4, "steel, structure and accesses share the cut");
  for (const object of model.bindings.get("structure.extraction")!)
    for (const mesh of meshes(object))
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        assert.ok(!material.clippingPlanes?.length, "external channel stays with floor context");
  const plane = clipped[0]!.clippingPlanes![0]!;
  assert.ok(clipped.every((material) => material.clippingPlanes![0] === plane));
  assert.ok(plane.distanceToPoint(new THREE.Vector3(0, 6, 2)) < 0, "front side removed");
  assert.ok(plane.distanceToPoint(new THREE.Vector3(0, 6, -2)) > 0, "rear enclosure retained");
  model.setView(true, true, false);
  assert.equal(shell.visible, true);
  assert.equal(roof.visible, true);
  assert.equal(access.visible, true, "external access is still part of the enclosure");
  assert.ok([...modelMaterials].every((material) => !material.clippingPlanes?.length));
  model.setView(true, false, true);
  assert.equal(roof.visible, false);
  assert.equal(shell.visible, true);
  model.dispose();
});

test("flat internal floor and cylinder replace the suspended hopper and ground columns", () => {
  const model = createSiloModel();
  const shell = model.bindings.get("structure.shell")![0]!;
  const bottomRadii: number[] = [];
  for (const mesh of meshes(shell)) {
    const attribute = mesh.geometry.getAttribute("position");
    for (let i = 0; i < attribute.count; i++)
      if (Math.abs(attribute.getY(i) - SILO.floorY) < 1e-5)
        bottomRadii.push(Math.hypot(attribute.getX(i), attribute.getZ(i)));
  }
  assert.ok(bottomRadii.length > 30, "full diameter cylinder meets the base");
  assert.ok(
    bottomRadii.every((r) => Math.abs(r - SILO.radius) < 0.013),
    `wall base retains 11m radius, observed ${Math.max(...bottomRadii)}m`,
  );
  const internalFloor = new THREE.Box3().setFromObject(model.bindings.get("structure.floor")![0]!);
  assert.ok(Math.abs(internalFloor.max.y - SILO.floorY) < 1e-5);
  assert.ok(!model.root.getObjectByName("Estrutura_independente_ancoragem"));
  model.dispose();
});

test("gate uses the domain opening and keeps a reproducible transform after reverse seeking", () => {
  const model = createSiloModel();
  const original = model.gate.position.clone();
  model.update(1);
  assert.ok(model.gate.position.x > original.x);
  assert.equal(model.gate.position.y, original.y);
  model.update(0);
  assert.deepEqual(model.gate.position.toArray(), original.toArray());
  model.dispose();
});

test("silo owners release every live geometry, material and texture without disposing another session", () => {
  const model = createSiloModel();
  const second = createSiloModel();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const mesh of meshes(model.root)) {
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  }
  let geometriesDisposed = 0;
  let materialsDisposed = 0;
  let texturesDisposed = 0;
  let secondDisposed = 0;
  geometries.forEach((geometry) =>
    geometry.addEventListener("dispose", () => geometriesDisposed++),
  );
  materials.forEach((material) => material.addEventListener("dispose", () => materialsDisposed++));
  textures.forEach((texture) => texture.addEventListener("dispose", () => texturesDisposed++));
  for (const mesh of meshes(second.root))
    mesh.geometry.addEventListener("dispose", () => secondDisposed++);
  model.dispose();
  assert.equal(geometriesDisposed, geometries.size);
  assert.equal(materialsDisposed, materials.size);
  assert.equal(texturesDisposed, textures.size);
  assert.equal(secondDisposed, 0);
  assert.equal(model.root.children.length, 0);
  assert.ok(second.root.children.length > 0);
  second.dispose();
});
