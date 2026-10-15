import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import { InspectionController } from "../../src/silo-engolfamento/InspectionController";

test("isolation snapshots late rig meshes before hiding them and restores exact owner visibility", () => {
  const geometry = new T.BoxGeometry(0.1, 0.1, 0.1);
  const material = new T.MeshStandardMaterial();
  const foundation = new T.Mesh(geometry, material);
  const strap = new T.Mesh(geometry, material);
  const hiddenFitting = new T.Mesh(geometry, material);
  hiddenFitting.visible = false;
  const lateRig = new T.Group();
  lateRig.add(strap, hiddenFitting);
  lateRig.visible = false; // The scene owns the pending shader-compilation gate.
  const inspector = new InspectionController(
    new Map<string, T.Object3D[]>([["structure.foundation", [foundation]]]),
  );

  inspector.isolate("structure.foundation");
  inspector.bind("lvhf.harness", [lateRig]);
  assert.equal(inspector.isolation, "structure.foundation");
  assert.equal(lateRig.visible, false, "binding must not release the scene's readiness gate");
  lateRig.visible = true; // Simulate the compiled rig becoming available.
  assert.equal(strap.visible, false, "the new procedural strap respects existing isolation");
  assert.equal(hiddenFitting.visible, false);
  inspector.restore();
  assert.equal(strap.visible, true, "restore includes meshes that arrived after isolation began");
  assert.equal(hiddenFitting.visible, false, "owner-hidden fittings remain hidden");
  assert.equal(foundation.visible, true);

  // Rebinding while already isolated cannot overwrite the saved true value
  // with the temporary hidden value left by the inspection filter.
  inspector.isolate("structure.foundation");
  inspector.bind("lvhf.harness", [lateRig]);
  inspector.sync();
  inspector.restore();
  assert.equal(strap.visible, true);
  assert.equal(hiddenFitting.visible, false);
  inspector.dispose();
  geometry.dispose();
  material.dispose();
});

test("a selection made before a rig arrives highlights its binding and restores shared materials", () => {
  const geometry = new T.BoxGeometry(0.1, 0.1, 0.1);
  const material = new T.MeshStandardMaterial({ emissive: "#000000" });
  const unrelated = new T.Mesh(geometry, material);
  const first = new T.Mesh(geometry, material);
  const replacement = new T.Mesh(geometry, material);
  let sourceDisposals = 0;
  material.addEventListener("dispose", () => sourceDisposals++);
  const inspector = new InspectionController(
    new Map<string, T.Object3D[]>([["structure.foundation", [unrelated]]]),
  );

  inspector.select("lvhf.harness");
  assert.equal(inspector.selection, "lvhf.harness");
  inspector.bind("lvhf.harness", [first]);
  const firstHighlight = first.material;
  assert.notEqual(firstHighlight, material);
  assert.equal(firstHighlight.emissive.getHexString(), "92c83e");
  assert.equal(firstHighlight.emissiveIntensity, 0.23);
  assert.equal(unrelated.material, material, "a shared original material is not recolored");
  assert.equal(material.emissive.getHexString(), "000000");

  let firstCloneDisposals = 0;
  firstHighlight.addEventListener("dispose", () => firstCloneDisposals++);
  inspector.bind("lvhf.harness", [replacement]);
  assert.equal(first.material, material, "replacing a binding restores its old material");
  assert.equal(firstCloneDisposals, 1);
  assert.notEqual(replacement.material, material);
  assert.equal(replacement.material.emissive.getHexString(), "92c83e");
  inspector.select(null);
  assert.equal(replacement.material, material);
  assert.equal(sourceDisposals, 0, "inspection only disposes its own highlight clones");
  inspector.dispose();
  geometry.dispose();
  material.dispose();
});
