import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { elements, references, site } from "../../src/industrial/data/index.ts";
import { blocked, moveWithCollisions } from "../../src/industrial/navigation/collision.ts";
import { BufferGeometry, Int16BufferAttribute, Matrix4 } from "three";
import { bakePrototypeGeometry } from "../../src/industrial/vegetation/prototypeGeometry.ts";

test("quantized foliage keeps crown coordinates beyond one unit after node transforms", () => {
  const source = new BufferGeometry();
  source.setAttribute("position", new Int16BufferAttribute([0, 32767, 0, 0, -32767, 0], 3, true));
  const geometry = bakePrototypeGeometry(source, new Matrix4().makeTranslation(0, 0.25, 0));
  assert.equal(geometry.getAttribute("position").getY(0), 1.25);
  assert.equal(geometry.getAttribute("position").getY(1), -0.75);
  assert.equal(source.getAttribute("position").getY(0), 1);
  geometry.dispose();
  source.dispose();
});

test("four provisional silos retain a 2 by 2 layout and non-overlapping bases", () => {
  const silos = elements.filter((e) => e.category === "silos");
  assert.equal(silos.length, 4);
  assert.deepEqual(
    silos.map((e) => e.id),
    ["SILO-01", "SILO-02", "SILO-03", "SILO-04"],
  );
  assert.equal(new Set(silos.map((e) => e.position[0])).size, 2);
  assert.equal(new Set(silos.map((e) => e.position[2])).size, 2);
  for (const a of silos)
    for (const b of silos)
      if (a.id !== b.id)
        assert.ok(
          Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) >
            Number(a.geometry["radius"]) + Number(b.geometry["radius"]) + 1.2,
        );
});
test("all stable identifiers have traceable evidence and estimated dimensions", () => {
  assert.equal(new Set(elements.map((e) => e.id)).size, elements.length);
  for (const e of elements) {
    assert.ok(e.photos.length > 0);
    e.photos.forEach((p) => assert.ok(references.some((r) => r.id === p)));
    assert.equal(e.dimensionStatus, "estimated");
    assert.equal(e.position.length, 3);
    assert.ok(e.pending.length > 0);
  }
  assert.equal(site.calibration.measurementEnabled, false);
  assert.equal(site.calibration.status, "estimated");
  assert.equal(elements.find((e) => e.id === "PV-01")?.functionStatus, "probable");
  assert.equal(elements.find((e) => e.id === "EQ-03")?.functionStatus, "probable");
});
test("original references retain the supplied bytes", () => {
  for (const r of references) {
    const bytes = readFileSync("public" + r.url);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), r.sha256);
  }
});
test("walk cannot enter cylinders, buildings, supporting frame or cross fences", () => {
  for (const e of elements.filter((e) => ["buildings", "silos"].includes(e.category)))
    assert.equal(blocked(e.position[0], e.position[2]), true, e.id);
  const silo = elements[0]!;
  const x = silo.position[0],
    z = silo.position[2];
  const [rx, rz] = moveWithCollisions([x - 22, z], [50, 0]);
  assert.ok(rx < x);
  assert.equal(blocked(rx, rz), false);
  const building = elements.find((e) => e.id === "ED-01")!;
  const end = moveWithCollisions([building.position[0] + 22, building.position[2]], [-40, 0]);
  assert.ok(end[0] > building.position[0]);
  assert.equal(blocked(110, 0), true);
});
test("walking reference is outside colliders and moves consistently with substeps", () => {
  const p = site.cameras.walk.position;
  assert.equal(blocked(p[0]!, p[2]!), false);
  let many: [number, number] = [p[0]!, p[2]!];
  for (let i = 0; i < 20; i++) many = moveWithCollisions(many, [-0.1, 0]);
  const once = moveWithCollisions([p[0]!, p[2]!], [-2, 0]);
  assert.ok(Math.hypot(many[0] - once[0], many[1] - once[1]) < 1e-6);
});
test("anchored vegetation trunks do not enter major footprints", () => {
  for (const t of site.trees)
    for (const e of elements) {
      const x = t.position[0]! - e.position[0],
        z = t.position[2]! - e.position[2];
      if (e.category === "silos")
        assert.ok(
          Math.hypot(x, z) > Number(e.geometry["radius"]) + 0.5,
          `${t.type} enters ${e.id}`,
        );
      if (e.category === "buildings")
        assert.ok(
          Math.abs(x) > Number(e.geometry["width"]) / 2 + 0.1 ||
            Math.abs(z) > Number(e.geometry["depth"]) / 2 + 0.1,
          `${t.type} enters ${e.id}`,
        );
    }
});
