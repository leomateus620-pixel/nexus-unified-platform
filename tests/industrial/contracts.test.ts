import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { elements, references, site } from "../../src/industrial/data/index.ts";
import {
  blocked,
  moveWithCollisions,
  colliderBlocks,
  polygonBlocks,
} from "../../src/industrial/navigation/collision.ts";
import { groundHeightAt, navigationBounds } from "../../src/industrial/scene/spatial.ts";
import { BufferGeometry, Int16BufferAttribute, Matrix4, Vector3 } from "three";
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

const goldens = JSON.parse(
  readFileSync("docs/industrial/evidence/cad-source-goldens.json", "utf8"),
);
const registration = new Matrix4().fromArray(site.cadRegistration.matrixColumnMajorMeters);
const registered = (v: number[]) => new Vector3(...v).applyMatrix4(registration).toArray();
const close = (a: number[], b: number[], epsilon = 1e-6) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) <= epsilon, `${a} != ${b}`));

test("stable silo IDs map to independently extracted CAD axes at real scale", () => {
  const silos = elements.filter((e) => e.category === "silos");
  assert.equal(silos.length, 4);
  assert.deepEqual(
    silos.map((e) => e.id),
    ["SILO-01", "SILO-02", "SILO-03", "SILO-04"],
  );
  assert.deepEqual(
    silos.map((e) => e.cad?.sourceObjectId),
    [4136, 4125, 4147, 1531],
  );
  for (const silo of silos) {
    const source = goldens.silos.find(
      (s: { sourceParentObjectId: number }) => s.sourceParentObjectId === silo.cad?.sourceObjectId,
    );
    close(silo.position, registered(source.axisAtBaseMeters));
    assert.equal(silo.dimensionStatus, "cad_verified");
    assert.equal(silo.geometry["nominalDiameterStatus"], "UNRESOLVED");
    assert.ok(Math.abs(silo.position[1] - 0.1) < 1e-9);
  }
  for (const a of silos)
    for (const b of silos)
      if (a.id !== b.id)
        assert.ok(
          Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) >
            Number(a.geometry["radius"]) + Number(b.geometry["radius"]) + 1.2,
        );
});
test("user-confirmed plant identity stays separate from CAD measurements and operational numbering", () => {
  assert.equal(new Set(elements.map((e) => e.id)).size, elements.length);
  for (const e of elements) {
    assert.ok(e.photos.length > 0 || e.cad);
    e.photos.forEach((p) => assert.ok(references.some((r) => r.id === p)));
    assert.equal(e.dimensionStatus, e.cad ? "cad_verified" : "estimated");
    assert.equal(e.position.length, 3);
    assert.ok(e.pending.length > 0);
  }
  assert.equal(site.calibration.measurementEnabled, false);
  assert.equal(site.cadRegistration.identityStatus, "user_confirmed");
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
  assert.equal(blocked(navigationBounds.max[0] + 1, 0), true);
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
      if (e.category === "buildings") {
        if (e.collider)
          assert.equal(
            colliderBlocks(e.collider, t.position[0]!, t.position[2]!, 0.1),
            false,
            `${t.type} enters ${e.id}`,
          );
        else
          assert.ok(
            Math.abs(x) > Number(e.geometry["width"]) / 2 + 0.1 ||
              Math.abs(z) > Number(e.geometry["depth"]) / 2 + 0.1,
            `${t.type} enters ${e.id}`,
          );
      }
    }
});

test("registration is proper rigid motion with a separate CAD ground datum", () => {
  assert.ok(Math.abs(registration.determinant() - 1) < 1e-12);
  const origin = registered([0, 0.01, 0]);
  close(
    registered([1, 0.01, 0]).map((v, i) => v - origin[i]!),
    [-1, 0, 0],
  );
  close(
    registered([0, 1.01, 0]).map((v, i) => v - origin[i]!),
    [0, 1, 0],
  );
  close(
    registered([0, 0.01, 1]).map((v, i) => v - origin[i]!),
    [0, 0, -1],
  );
  const axes = elements.filter((e) => e.category === "silos");
  close(
    [
      axes.reduce((s, e) => s + e.position[0], 0) / 4,
      axes.reduce((s, e) => s + e.position[2], 0) / 4,
    ],
    [-0.16, 0],
  );
  assert.equal(origin[1], 0);
});

test("all six silo distances preserve source geometry instead of the estimated layout", () => {
  const silos = elements.filter((e) => e.category === "silos");
  for (let i = 0; i < silos.length; i++)
    for (let j = i + 1; j < silos.length; j++) {
      const a = silos[i]!,
        b = silos[j]!;
      const sa = goldens.silos.find(
        (s: { sourceParentObjectId: number }) => s.sourceParentObjectId === a.cad!.sourceObjectId,
      ).axisAtBaseMeters;
      const sb = goldens.silos.find(
        (s: { sourceParentObjectId: number }) => s.sourceParentObjectId === b.cad!.sourceObjectId,
      ).axisAtBaseMeters;
      assert.ok(
        Math.abs(
          Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) -
            Math.hypot(sa[0] - sb[0], sa[2] - sb[2]),
        ) < 1e-6,
      );
    }
});

test("buried and overhead colliders do not become ground walls; rotated footprints are respected", () => {
  const points: [number, number][] = [
    [0, -2],
    [2, 0],
    [0, 2],
    [-2, 0],
  ];
  assert.equal(polygonBlocks(0, 1.5, points, 0), true);
  assert.equal(polygonBlocks(1.7, 1.7, points, 0), false);
  assert.equal(colliderBlocks({ kind: "polygon", points, minY: -7, maxY: -2 }, 0, 0, 0), false);
  assert.equal(colliderBlocks({ kind: "polygon", points, minY: 10, maxY: 20 }, 0, 0, 0), false);
  assert.equal(colliderBlocks({ kind: "polygon", points, minY: 0, maxY: 4 }, 0, 0, 0), true);
  assert.ok(groundHeightAt(37, 40) > 0);
});

test("source occurrence partitions cannot duplicate the same CAD component", () => {
  const bindings = elements.filter((e) => e.cad);
  for (const a of bindings)
    for (const b of bindings)
      if (a.id !== b.id)
        for (const rootA of a.cad!.sourcePaths)
          for (const rootB of b.cad!.sourcePaths)
            if (rootB === rootA || rootB.startsWith(rootA + "/"))
              assert.ok(
                a.cad!.excludedPaths.some((p) => rootB === p || rootB.startsWith(p + "/")),
                `${a.id} duplicates ${b.id}: ${rootB}`,
              );
});

test("underground depth, old circular identity and all legacy IDs are retained", () => {
  const pits = elements.find((e) => e.id === "CAD-HOPPER-PITS")!;
  const tunnels = elements.find((e) => e.id === "CAD-SILO-PIT-TUNNELS")!;
  assert.ok(Math.abs(pits.bounds!.min[1] + 9.825) < 1e-6);
  assert.ok(Math.abs(tunnels.bounds!.min[1] + 6.764) < 1e-6);
  assert.equal(elements.find((e) => e.id === "EQ-03")?.name, "Elemento circular");
  assert.equal(elements.find((e) => e.id === "EQ-03")?.cad, undefined);
  for (const id of [
    "SILO-01",
    "SILO-02",
    "SILO-03",
    "SILO-04",
    "EQ-01",
    "EQ-02",
    "EQ-03",
    "ED-01",
    "ED-02",
    "ED-03",
    "ED-04",
    "ED-05",
    "PV-01",
    "TR-01",
    "TR-02",
    "TR-03",
    "VG-01",
    "VG-02",
    "CE-01",
    "CE-02",
  ])
    assert.ok(elements.some((e) => e.id === id));
});
