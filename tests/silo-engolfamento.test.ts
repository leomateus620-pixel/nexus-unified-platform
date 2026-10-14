import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_AREA,
  DEPRESSION_MEAN,
  dischargeAt,
  flowAt,
  grainVolume,
  HOPPER_VOLUME,
  INITIAL_GRAIN_VOLUME,
  seededValue,
  SILO,
  surfaceAt,
} from "../src/silo-engolfamento/GrainField.ts";
import { educationalVitals } from "../src/silo-engolfamento/educationalVitals.ts";
import {
  CONNECTION_LENGTH,
  evaluateFrame,
  SiloSimulation,
  type SiloFrame,
} from "../src/silo-engolfamento/simulation.ts";

const close = (a: number, b: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const domainValues = (frame: SiloFrame) => ({
  time: frame.time,
  incident: frame.incidentTime,
  stage: frame.stage,
  volume: frame.volume,
  gate: frame.gate,
  A: { ...frame.workers.A.position },
  B: { ...frame.workers.B.position },
  Afeet: structuredClone(frame.workers.A.feet),
  Bfeet: structuredClone(frame.workers.B.feet),
  depth: frame.workers.B.depth,
  tension: frame.connection.tension,
});

test("essential readiness gates start; resource failures pause instead of advancing", () => {
  const simulation = new SiloSimulation();
  assert.equal(simulation.start(), false);
  simulation.advance(1 / 60);
  assert.equal(simulation.getFrame().time, 0);
  simulation.setReady(true);
  assert.equal(simulation.start(), true);
  simulation.advance(0.1);
  const time = simulation.getFrame().time;
  simulation.setReady("error", "Falha do técnico");
  simulation.advance(0.1);
  assert.equal(simulation.getFrame().time, time);
  assert.equal(simulation.getSnapshot().status, "paused");
  assert.equal(simulation.resume(), false);
  simulation.setReady("ready");
  assert.equal(simulation.resume(), true);
});

test("different live FPS reproduce the same time, positions, volume and event", () => {
  const results = [30, 60, 120].map((fps) => {
    const simulation = new SiloSimulation();
    simulation.setReady(true);
    simulation.start();
    for (let f = 0; f < fps * 18; f++) simulation.advance(1 / fps);
    return domainValues(simulation.getFrame());
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(results[0]!.time, 18);
});

test("pause, resume and slow playback use one clock without suspended-frame debt", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.start();
  simulation.advance(0.023);
  simulation.pause("Aba oculta");
  const held = domainValues(simulation.getFrame());
  simulation.advance(500);
  assert.deepEqual(domainValues(simulation.getFrame()), held);
  assert.equal(simulation.getSnapshot().reason, "Aba oculta");
  simulation.resume();
  simulation.setPlaybackRate(0.5);
  for (let i = 0; i < 60; i++) simulation.advance(1 / 60);
  close(simulation.getFrame().time, 0.523);
  assert.equal(simulation.getSnapshot().status, "running");
});

test("overload pauses at the last presented instant; it never jumps or drains a queue", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.start();
  simulation.advance(0.05);
  const held = domainValues(simulation.getFrame());
  simulation.advance(0.5);
  assert.equal(simulation.getSnapshot().status, "paused");
  assert.match(simulation.getSnapshot().reason, /Carga elevada/);
  assert.deepEqual(domainValues(simulation.getFrame()), held);
  simulation.resume();
  simulation.advance(1 / 60);
  close(simulation.getFrame().time, 0.05 + 1 / 60);
});

test("seek reconstructs gate, volume, surface, both technicians, connection and logs", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.seek(24);
  assert.ok(simulation.getFrame().workers.B.occluded);
  assert.equal(simulation.getFrame().connection.limited, true);
  simulation.seek(4.75);
  const reconstructed = evaluateFrame(4.75);
  assert.deepEqual(simulation.getFrame(), reconstructed);
  assert.equal(simulation.getFrame().gate, 0);
  assert.equal(simulation.getFrame().volume, INITIAL_GRAIN_VOLUME);
  assert.equal(simulation.getFrame().workers.B.occluded, false);
  assert.equal(simulation.getFrame().connection.limited, false);
  assert.ok(simulation.getSnapshot().events.every((event) => event.at <= 4.75));
  assert.equal(simulation.getSnapshot().vitals.reading, "Ilustração de esforço");
  simulation.seek(24);
  assert.deepEqual(simulation.getFrame(), evaluateFrame(24));
});

test("all four camera changes preserve every domain value and seed", () => {
  const simulation = new SiloSimulation();
  simulation.seek(16.25);
  const before = structuredClone(simulation.getFrame());
  for (const camera of ["frontal", "top", "connected", "victim"] as const) {
    simulation.setCamera(camera);
    assert.deepEqual(simulation.getFrame(), before);
    assert.equal(simulation.getSnapshot().camera, camera);
  }
});

test("immutable HUD snapshots do not alias mutable rendering buffers; HUD publishes at 10Hz", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.start();
  const previous = simulation.getSnapshot();
  let publications = 0;
  const unsubscribe = simulation.subscribe(() => publications++);
  for (let i = 0; i < 120; i++) simulation.advance(1 / 120);
  assert.ok(publications >= 9 && publications <= 11, `${publications} publications/s`);
  assert.equal(previous.frame.time, 0);
  assert.equal(previous.frame.workers.A.position.y, SILO.initialSurface);
  assert.ok(Object.isFrozen(previous.frame.workers.A.position));
  assert.ok(Object.isFrozen(previous.frame.workers.A.feet));
  assert.ok(Object.isFrozen(previous.frame.workers.A.feet.left.position));
  assert.ok(Object.isFrozen(previous.events));
  unsubscribe();
  simulation.advance(0.1);
  assert.equal(publications, 10);
});

test("walking support is fixed in world during stance while the body moves", () => {
  for (const id of ["A", "B"] as const) {
    for (const [side, start, end] of [
      ["left", 3.25, 3.8],
      ["right", 3.9, 4.4],
      ["left", 4.7, 5.2],
    ] as const) {
      const first = evaluateFrame(start).workers[id];
      const last = evaluateFrame(end).workers[id];
      assert.notEqual(first.position.x, last.position.x, "body must advance during stance");
      assert.deepEqual(first.feet[side].position, last.feet[side].position);
      assert.equal(first.feet[side].locked, true);
      assert.equal(last.feet[side].locked, true);
      close(first.feet[side].position.y, SILO.initialSurface);
    }
  }
});

test("swing support lifts from the surface and stays continuous across every phase and walking endpoint", () => {
  const swing = evaluateFrame(4.2);
  assert.equal(swing.workers.A.feet.left.locked, false);
  assert.ok(swing.workers.A.feet.left.position.y > SILO.initialSurface + 0.06);
  for (const time of [3, 3.15, 3.75, 3.9, 4.5, 4.65, 5.25, 5.4, 6]) {
    const before = evaluateFrame(time - 1e-7);
    const after = evaluateFrame(time + 1e-7);
    for (const id of ["A", "B"] as const)
      for (const side of ["left", "right"] as const)
        for (const axis of ["x", "y", "z"] as const)
          close(
            before.workers[id].feet[side].position[axis],
            after.workers[id].feet[side].position[axis],
            1e-6,
          );
  }
  for (let tick = 0; tick <= 180; tick++) {
    const frame = evaluateFrame(3 + tick / 60);
    for (const technician of Object.values(frame.workers))
      for (const support of Object.values(technician.feet)) {
        assert.ok(Object.values(support.position).every(Number.isFinite));
        assert.ok(support.position.y >= SILO.initialSurface - 1e-9);
        assert.ok(support.position.y <= SILO.initialSurface + 0.065 + 1e-9);
      }
  }
});

test("after loss of support the final footprint sinks and advects with its own body without another gait", () => {
  const initial = evaluateFrame(6);
  for (const time of [6.25, 7, 12, 18, 22, 30]) {
    const frame = evaluateFrame(time);
    for (const id of ["A", "B"] as const)
      for (const side of ["left", "right"] as const) {
        const person = frame.workers[id];
        const support = person.feet[side];
        assert.equal(support.locked, true);
        for (const axis of ["x", "y", "z"] as const)
          close(
            support.position[axis] - person.position[axis],
            initial.workers[id].feet[side].position[axis] - initial.workers[id].position[axis],
          );
      }
  }
  const prevention = evaluateFrame(12, "prevention");
  assert.ok(
    Object.values(prevention.workers).every(
      (w) => w.feet.left.position.y === 0 && w.feet.right.position.y === 0,
    ),
  );
});

test("feet reuse presentation buffers and seek rebuilds every support target without future residues", () => {
  const reusable = evaluateFrame(0);
  const firstFeet = reusable.workers.A.feet;
  const firstPosition = firstFeet.left.position;
  evaluateFrame(20, "comparison", reusable);
  assert.equal(reusable.workers.A.feet, firstFeet);
  assert.equal(reusable.workers.A.feet.left.position, firstPosition);
  const simulation = new SiloSimulation();
  simulation.seek(20);
  const futureSnapshot = simulation.getSnapshot();
  simulation.seek(3.5);
  assert.deepEqual(simulation.getFrame(), evaluateFrame(3.5));
  assert.ok(simulation.getFrame().workers.A.feet.left.locked);
  assert.notEqual(
    futureSnapshot.frame.workers.B.feet.left.position.y,
    simulation.getFrame().workers.B.feet.left.position.y,
  );
  simulation.seek(20);
  assert.deepEqual(simulation.getFrame(), evaluateFrame(20));
});

test("HUD keeps real-time 10Hz publication under slow playback and clears its cadence on pause/seek", () => {
  for (const rate of [0.25, 0.5, 1]) {
    const simulation = new SiloSimulation();
    simulation.setReady(true);
    simulation.start();
    simulation.setPlaybackRate(rate);
    let publications = 0;
    const unsubscribe = simulation.subscribe(() => publications++);
    for (let i = 0; i < 120; i++) simulation.advance(1 / 120);
    assert.equal(publications, 10, `${rate}× must publish ten snapshots per real second`);
    close(simulation.getFrame().time, rate);
    simulation.advance(0.05);
    simulation.pause();
    simulation.resume();
    publications = 0;
    simulation.advance(0.05);
    assert.equal(publications, 0, "pause must discard publication debt");
    simulation.advance(0.05);
    assert.equal(publications, 1);
    simulation.seek(3);
    simulation.resume();
    publications = 0;
    simulation.advance(0.05);
    assert.equal(publications, 0, "seek starts a fresh publication interval");
    simulation.advance(0.05);
    assert.equal(publications, 1);
    unsubscribe();
  }
});

test("volume never increases without feeding and exactly follows integrated gate discharge", () => {
  let previous = INITIAL_GRAIN_VOLUME;
  for (let tick = 0; tick <= 1800; tick++) {
    const time = tick / 60;
    const frame = evaluateFrame(time);
    assert.ok(frame.volume >= 0 && frame.volume <= previous + 1e-10);
    close(frame.volume, INITIAL_GRAIN_VOLUME - dischargeAt(time).discharged);
    close(frame.volume, grainVolume(frame.surfaceHeight));
    assert.ok(frame.surfaceHeight > SILO.hopperTop);
    previous = frame.volume;
  }
  close(grainVolume(SILO.hopperTop), HOPPER_VOLUME);
  close(grainVolume(SILO.outletY), 0);
  assert.ok(grainVolume(2.4) < HOPPER_VOLUME);
});

test("surface redistribution conserves mass; increasing depression does not create grain", () => {
  const frame = evaluateFrame(18);
  // Independent polar midpoint quadrature of the rendered surface volume.
  const rings = 600;
  let mean = 0;
  for (let i = 0; i < rings; i++) {
    const r = ((i + 0.5) * SILO.radius) / rings;
    mean += (surfaceAt(r, 0, frame) * 2 * r * (SILO.radius / rings)) / SILO.radius ** 2;
  }
  close(mean, frame.surfaceHeight, 1e-6);
  close(HOPPER_VOLUME + BODY_AREA * (mean - SILO.hopperTop), frame.volume, 0.00003);
  assert.ok(surfaceAt(0, 0, frame) < frame.surfaceHeight);
  close(surfaceAt(SILO.radius, 0, frame), frame.surfaceHeight + frame.depression * DEPRESSION_MEAN);
});

test("connected technician shares exposure but line geometrically limits descent before representation", () => {
  const original = evaluateFrame(0);
  for (let tick = 0; tick <= 1800; tick++) {
    const frame = evaluateFrame(tick / 60);
    assert.ok(frame.connection.distance <= CONNECTION_LENGTH + 1e-9);
    close(frame.workers.A.position.x, -frame.workers.B.position.x);
    close(frame.workers.A.position.z, frame.workers.B.position.z);
    for (const technician of Object.values(frame.workers)) {
      assert.ok(Object.values(technician.position).every(Number.isFinite));
      assert.ok(technician.position.y >= SILO.hopperTop);
      assert.ok(technician.depth >= 0 && technician.mobility >= 0 && technician.mobility <= 1);
    }
  }
  const late = evaluateFrame(20);
  assert.equal(late.connection.limited, true);
  assert.equal(late.connection.tension, 1);
  assert.ok(original.workers.A.position.y - late.workers.A.position.y < 0.5);
  assert.ok(late.workers.B.depth > 1.8);
  assert.equal(late.workers.B.mobility, 0);
  assert.equal(late.workers.B.occluded, true);
});

test("same trajectory replay isolates connection, while prevention blocks entry and discharge", () => {
  for (const time of [0, 4, 8, 12, 18, 23]) {
    const retained = evaluateFrame(time, "comparison");
    const released = evaluateFrame(time, "no-connection");
    assert.deepEqual(retained.workers.B, released.workers.B);
    assert.equal(retained.volume, released.volume);
    assert.equal(retained.seed, released.seed);
    close(released.workers.A.depth, released.workers.B.depth);
    close(released.workers.A.position.x, -released.workers.B.position.x);
    assert.equal(released.connection.connected, false);
    const prevented = evaluateFrame(time, "prevention");
    assert.equal(prevented.volume, INITIAL_GRAIN_VOLUME);
    assert.equal(prevented.flow, 0);
    assert.equal(prevented.entryBlocked, true);
    assert.ok(Math.abs(prevented.workers.A.position.x) > SILO.radius);
  }
  const simulation = new SiloSimulation();
  simulation.seek(18);
  simulation.setScenario("no-connection");
  assert.equal(simulation.getFrame().time, 18);
  assert.deepEqual(simulation.getFrame(), evaluateFrame(18, "no-connection"));
});

test("reset eliminates late grain, entrapment, vitals and future events; completion remains seekable", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.seek(29.95);
  simulation.resume();
  simulation.advance(0.1);
  assert.equal(simulation.getFrame().time, 30);
  assert.equal(simulation.getSnapshot().status, "completed");
  simulation.reset();
  assert.deepEqual(simulation.getFrame(), evaluateFrame(0));
  assert.equal(simulation.getSnapshot().events.length, 1);
  assert.equal(simulation.getSnapshot().status, "idle");
  simulation.seek(15);
  assert.equal(simulation.getSnapshot().status, "paused");
});

test("vitals are explicitly illustrative and never provide a survival countdown or invented saturation", () => {
  const initial = educationalVitals(0, 0);
  const trapped = educationalVitals(14, 0.9);
  const covered = educationalVitals(19, 2.02);
  assert.equal(initial.heartRate, 82);
  assert.equal(initial.spo2, null);
  assert.equal(trapped.heartRate, null);
  assert.equal(covered.heartRate, null);
  assert.equal(covered.spo2, null);
  assert.equal(covered.reading, "Leitura indisponível");
  assert.equal(covered.ventilation, "Vias aéreas possivelmente obstruídas");
  assert.match(initial.label, /simulados/);
  assert.ok(!("survivalTime" in covered));
});

test("seeded grain attributes reproduce without PRNG consumption and flow reuses caller buffer", () => {
  const values = Array.from({ length: 100 }, (_, index) => seededValue(index));
  assert.deepEqual(
    values,
    Array.from({ length: 100 }, (_, index) => seededValue(index)),
  );
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(
    values,
    Array.from({ length: 100 }, (_, index) => seededValue(index, 123)),
  );
  const frame = evaluateFrame(14);
  const buffer = flowAt(0.7, 0.3, frame);
  assert.equal(flowAt(-0.7, 0.3, frame, buffer), buffer);
  assert.ok(buffer.x > 0 && buffer.y < 0 && buffer.z < 0);
  assert.equal(flowAt(4, 4, frame, buffer).y, 0);
});
