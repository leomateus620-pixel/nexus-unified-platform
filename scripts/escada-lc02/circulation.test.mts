import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { LC02Simulation, PERSON_GAP } from "../../src/escada/lc02-simulation.ts";
import {
  DOOR_WAIT_S,
  feetAt,
  routeAt,
  WALK_LENGTH,
  WALK_STATIONS,
} from "../../src/escada/lc02-walkway.ts";
import { createLC02Model } from "../../src/escada/lc02-model.ts";

for (const count of [1, 5, 10] as const)
  test(`${count} people enter in order with spacing and an open door`, () => {
    const sim = new LC02Simulation();
    sim.setAsset("ready");
    sim.start(count);
    let maxConcurrent = 0;
    const entered: number[] = [];
    for (let frame = 0; frame < 6000 && sim.getSnapshot().status !== "completed"; frame++) {
      const old = sim.people.map((p) => ({ ...p }));
      sim.tick(1 / 60);
      maxConcurrent = Math.max(
        maxConcurrent,
        sim.people.filter((p) => p.state === "walking").length,
      );
      sim.people.forEach((p, i) => {
        assert.ok(Number.isFinite(p.s) && p.s >= 0 && p.s <= WALK_LENGTH);
        if (i > 0 && p.state === "walking" && sim.people[i - 1]!.state === "walking")
          assert.ok(sim.people[i - 1]!.s - p.s >= PERSON_GAP - 1e-7);
        if (old[i]!.s <= DOOR_WAIT_S && p.s > DOOR_WAIT_S) assert.ok(sim.door >= 0.98);
        if (p.state === "entered" && old[i]!.state !== "entered") entered.push(i);
      });
    }
    assert.equal(sim.getSnapshot().status, "completed");
    assert.equal(sim.getSnapshot().entered, count);
    assert.equal(sim.door, 0);
    assert.deepEqual(
      entered,
      Array.from({ length: count }, (_, i) => i),
    );
    assert.equal(maxConcurrent, count);
  });
test("Pause, manual advance/reverse and replacing a scenario preserve a bounded queue", () => {
  const sim = new LC02Simulation();
  sim.setAsset("ready");
  sim.start(10);
  for (let i = 0; i < 1200; i++) sim.tick(1 / 60);
  sim.pause();
  const paused = sim.people.map((p) => p.s);
  for (let i = 0; i < 120; i++) sim.tick(1 / 60);
  assert.deepEqual(
    sim.people.map((p) => p.s),
    paused,
  );
  sim.select(2);
  sim.mode("manual");
  sim.resume();
  const held = sim.people[2]!.s;
  for (let i = 0; i < 120; i++) sim.tick(1 / 60);
  assert.equal(sim.people[2]!.s, held);
  sim.drive = -1;
  for (let i = 0; i < 120; i++) sim.tick(1 / 60);
  assert.ok(sim.people[2]!.s <= held);
  assert.ok(sim.people[2]!.s - sim.people[3]!.s >= PERSON_GAP - 1e-7);
  sim.drive = 1;
  for (let i = 0; i < 120; i++) sim.tick(1 / 60);
  assert.ok(sim.people[2]!.s > held);
  sim.start(1);
  assert.equal(sim.people.length, 1);
  assert.equal(sim.people[0]!.s, 0);
  assert.equal(sim.getSnapshot().mode, "wide");
  assert.equal(sim.drive, 0);
  sim.stop();
  assert.equal(sim.people.length, 0);
  assert.equal(sim.getSnapshot().status, "idle");
});
test("Failure/loading never advance people; resume does not accrue suspended time", () => {
  const sim = new LC02Simulation();
  sim.start(5);
  sim.tick(30);
  assert.equal(sim.people[0]!.state, "waiting");
  sim.setAsset("error");
  sim.tick(30);
  assert.equal(sim.people[0]!.s, 0);
  sim.setAsset("ready");
  sim.tick(1 / 60);
  sim.pause("Hidden");
  const s = sim.people[0]!.s;
  sim.tick(30);
  assert.equal(sim.people[0]!.s, s);
  sim.resume();
  sim.tick(30);
  assert.ok(sim.people[0]!.s - s <= 0.09 + 1e-8);
});
test("Planted feet are supported by the rendered treads, landings and interior arrival floor", () => {
  const model = createLC02Model();
  model.root.updateMatrixWorld(true);
  const floor = [
    model.layers.stairs,
    model.layers.landings,
    model.layers.existing,
    ...model.layers.references.children.filter((o) => o.name === "references:tread"),
  ];
  const ray = new THREE.Raycaster();
  try {
    for (let s = 0; s < WALK_LENGTH; s += 0.025) {
      const feet = feetAt(s),
        foot = feet.stance === "left" ? feet.left : feet.right;
      const hits: THREE.Intersection[] = [];
      for (const dx of [-0.055, -0.035, -0.015, 0, 0.015, 0.035, 0.055])
        for (const dz of [-0.025, 0, 0.025]) {
          ray.set(
            new THREE.Vector3(foot[0] + dx, foot[1] + 0.15, foot[2] + dz),
            new THREE.Vector3(0, -1, 0),
          );
          ray.far = 0.22;
          hits.push(...ray.intersectObjects(floor, true));
        }
      assert.ok(
        hits.some((h) => Math.abs(h.point.y - foot[1]) < 0.025),
        `Unsupported plant at ${s}: ${foot}`,
      );
    }
    assert.equal(WALK_STATIONS.filter((p) => p.stair).length, 36);
    assert.equal(routeAt(WALK_LENGTH).p[1], 6);
  } finally {
    model.dispose();
  }
});
