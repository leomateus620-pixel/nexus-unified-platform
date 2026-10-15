import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import { InspectionController } from "../../src/silo-engolfamento/InspectionController";

const canvas = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
} as HTMLCanvasElement;

test("an eye inside its own rig proxy can select the visible opaque wall", () => {
  const geometry = new T.BoxGeometry(1, 1, 1),
    material = new T.MeshBasicMaterial();
  const rig = new T.SkinnedMesh(geometry, material);
  rig.boundingBox = new T.Box3(new T.Vector3(-0.5, -0.5, -0.5), new T.Vector3(0.5, 0.5, 0.5));
  const wall = new T.Mesh(geometry, material);
  wall.position.z = 2;
  const root = new T.Group();
  root.add(rig, wall);
  root.updateMatrixWorld(true);
  const inspection = new InspectionController(
    new Map([
      ["lvhf.harness", [rig]],
      ["structure.shell", [wall]],
    ]),
  );
  const camera = new T.PerspectiveCamera(60, 1, 0.01, 20);
  camera.lookAt(0, 0, 2);
  assert.equal(inspection.pick(500, 500, camera, canvas, false), "structure.shell");
  inspection.dispose();
  geometry.dispose();
  material.dispose();
});

test("cut hides the actual front strap triangles even when the harness bounds span the plane", () => {
  const geometry = new T.BoxGeometry(0.3, 0.3, 0.1),
    material = new T.MeshBasicMaterial();
  const front = new T.Mesh(geometry, material),
    rearSide = new T.Mesh(geometry, material),
    support = new T.Mesh(geometry, material);
  front.position.z = 2;
  rearSide.position.x = 1;
  support.position.z = -1;
  const root = new T.Group();
  root.add(front, rearSide, support);
  root.updateMatrixWorld(true);
  const inspection = new InspectionController(
    new Map([
      ["lvhf.harness", [front, rearSide]],
      ["lvhf.passant.04", [support]],
    ]),
  );
  const camera = new T.PerspectiveCamera(60, 1, 0.01, 20);
  camera.position.z = 5;
  camera.lookAt(0, 0, 0);
  assert.equal(inspection.pick(500, 500, camera, canvas, false), "lvhf.harness");
  assert.equal(inspection.pick(500, 500, camera, canvas, true), "lvhf.passant.04");
  inspection.dispose();
  geometry.dispose();
  material.dispose();
});

test("the retained underfloor extraction remains selectable in a technical section", () => {
  const geometry = new T.BoxGeometry(0.7, 0.2, 1.55),
    material = new T.MeshBasicMaterial();
  const extraction = new T.Mesh(geometry, material);
  extraction.position.set(0, 0.28, 11.28);
  extraction.updateMatrixWorld();
  const inspection = new InspectionController(new Map([["structure.extraction", [extraction]]]));
  const camera = new T.PerspectiveCamera(60, 1, 0.01, 30);
  camera.position.set(0, 0.28, 14);
  camera.lookAt(extraction.position);
  assert.equal(inspection.pick(500, 500, camera, canvas, true), "structure.extraction");
  inspection.dispose();
  geometry.dispose();
  material.dispose();
});
