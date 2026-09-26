import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { DIM, GROUPS, LAYERS, SECTORS, VIEWS } from "../src/trevisan/data.ts";
import { buildTrevisanModel } from "../src/trevisan/model.ts";

test("transcription preserves the measured Moega chain and adopted envelope", () => {
  assert.equal(
    DIM.moega.bays.reduce((a, b) => a + b, 0),
    19.438,
  );
  assert.deepEqual(DIM.moega.axes, [0, 6, 11.1, 14.535, 19.438]);
  assert.equal(DIM.moega.width, 17);
  assert.equal(DIM.moega.columnTop, 4.365);
  assert.equal(DIM.moega.ridge, 6.925);
  assert.equal(DIM.moega.width + 2 * DIM.moega.overhang, 23);
  assert.ok(Math.abs(DIM.moega.length + DIM.moega.gableOverhang - 19.838) < 1e-9);
  assert.ok(Math.abs((6.925 - 4.03) / 11.5 - 0.25) < 0.002);
});
test("three naves, field-draft levels and nine frames retain the source dimensions", () => {
  assert.equal(
    DIM.main.naves.reduce((a, b) => a + b, 0),
    62.7,
  );
  assert.deepEqual(DIM.main.frames, [0.75, 5.75, 10.75, 15.75, 20.75, 25.75, 30.75, 35.75, 40.75]);
  assert.equal(DIM.main.eave, 5.68);
  assert.equal(DIM.main.ridge, 9.395);
  assert.equal(DIM.high.ridge, 12.2);
  assert.equal(DIM.high.beam, 7.2);
  assert.equal(DIM.lantern.width, 33.9);
  assert.equal(DIM.lantern.depth, 6.2);
});
test("all requested sectors are focusable, sourced and grouped, and six camera presets exist", () => {
  const ids = new Set(SECTORS.map((s) => s.id));
  assert.equal(ids.size, SECTORS.length);
  for (const id of [
    "moega",
    "descarga",
    "interna",
    "passagem",
    "grelha",
    "fosso",
    "elevadores",
    "principal",
    "nave-1",
    "nave-2",
    "nave-3",
    "bloco",
    "galeria",
    "torre",
    "silo",
    "anexo",
    "leste",
    "norte",
    "sul",
    "cabine",
    "transportador",
    "lanternim",
  ])
    assert.ok(ids.has(id), id);
  for (const s of SECTORS) {
    assert.ok(s.sheets);
    assert.ok(s.description);
    assert.ok(GROUPS.some((g) => g.id === s.group));
    assert.ok(s.point.every(Number.isFinite));
  }
  assert.equal(VIEWS.length, 6);
});
test("unknown heights stay null and unknown buildings are only horizontal line symbols", () => {
  assert.equal(DIM.silo.height, null);
  assert.equal(DIM.gallery.height, null);
  assert.equal(DIM.tower.height, null);
  const model = buildTrevisanModel();
  for (const id of [
    "silo",
    "anexo",
    "leste",
    "norte",
    "sul",
    "galeria",
    "torre",
    "transportador",
  ]) {
    const group = model.entities.get(id);
    assert.ok(group);
    group.traverse((o) => {
      if (o === group) return;
      assert.ok(o instanceof THREE.Line, `${id} must not become an arbitrary volume`);
      const p = o.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) assert.ok(p.getY(i) >= 0 && p.getY(i) < 0.1);
    });
  }
  const pit = new THREE.Box3().setFromObject(model.entities.get("fosso"));
  assert.ok(pit.min.y > -0.05);
  model.dispose();
});
test("vehicle passage is unobstructed across the full Moega at truck-entry level", () => {
  const model = buildTrevisanModel();
  model.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(30, 2, -10.888),
    new THREE.Vector3(1, 0, 0),
    0,
    29,
  );
  const hits = ray.intersectObjects(
    [...model.entities.values()].filter((g) => g.userData.group === "moega"),
    true,
  );
  assert.equal(hits.length, 0, "Vehicle corridor cannot contain a central pillar or a gate");
  model.dispose();
});
test("source envelope has five blue gable pillars, roofs meet the hall, and all children have layer metadata", () => {
  const model = buildTrevisanModel();
  let blueCount = 0;
  model.root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      assert.ok(
        LAYERS.some((l) => l.id === o.userData.layer),
        o.name,
      );
      if (o.name === "moega/estrutura/blue") blueCount = o.count;
    }
  });
  assert.equal(blueCount, 5);
  const surfaces = model.entities
    .get("moega")
    .children.find((o) => o.name === "moega/coberturas/surfaces");
  surfaces.geometry.computeBoundingBox();
  const b = surfaces.geometry.boundingBox;
  assert.ok(Math.abs(b.min.z + 19.838) < 0.00001);
  assert.ok(Math.abs(b.max.z) < 0.00001);
  assert.ok(Math.abs(b.max.y - 6.925) < 0.00001);
  assert.ok(model.stats.instances > 3000);
  assert.ok(model.stats.triangles < 50000);
  assert.ok(model.stats.batches < 60);
  model.dispose();
});
test("geographic anchors match the interpreted plan within source image precision", () => {
  const origin = [-30.048043, -52.919763],
    g2 = [-30.048282, -52.919173];
  const en = ([lat, lon]) => [
    (lon - origin[1]) * 111320 * Math.cos((origin[0] * Math.PI) / 180),
    (lat - origin[0]) * 111320,
  ];
  const axis = en(g2),
    length = Math.hypot(...axis),
    u = axis.map((v) => v / length);
  const xy = (point) => {
    const [east, north] = en(point);
    return [east * u[0] + north * u[1], east * u[1] - north * u[0]];
  };
  const [x, z] = xy([-30.047726, -52.919329]);
  assert.ok(Math.abs(x - DIM.silo.x) < 1);
  assert.ok(Math.abs(z - DIM.silo.z) < 1);
});
test("the bundled source is the exact user PDF, not an altered reconstruction", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("../public/models/trevisan/levantamento.pdf", import.meta.url)))
      .digest("hex"),
    "70ddb807c9915d4683340980836eed4cd214efe576779d95ce0a7585d33c69ca",
  );
});
