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
  CONNECTOR_REACH,
  evaluateDemonstrationFrame,
  evaluateExplorationFrame,
  evaluateFrame,
  SiloSimulation,
  type SiloFrame,
} from "../src/silo-engolfamento/simulation.ts";
import {
  INCIDENT_CENTRES,
  SILO_CONFIG,
  SUPPORT_ANGLES,
} from "../src/silo-engolfamento/SiloConfig.ts";
import { evaluateTrolley, LIFE_LINE_LENGTH, TAU } from "../src/silo-engolfamento/LifeLinePath.ts";

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
      (w) =>
        w.feet.left.position.y === SILO_CONFIG.groundY.value &&
        w.feet.right.position.y === SILO_CONFIG.groundY.value,
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

test("flat-floor local collapse conserves bulk volume and has no hidden external discharge", () => {
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
  close(grainVolume(2.4), BODY_AREA * (2.4 - SILO.floorY));
  close(grainVolume(-1), 0);
  close(grainVolume(100), BODY_AREA * (SILO.bodyTop - SILO.floorY));
});

test("surface redistribution conserves mass; increasing depression does not create grain", () => {
  const frame = evaluateFrame(18);
  // Independent local polar quadrature resolves each compact collapse and ridge.
  const rings = 1000;
  for (const centre of INCIDENT_CENTRES) {
    let redistributed = 0;
    for (let i = 0; i < rings; i++) {
      const r = ((i + 0.5) * SILO.flowRadius) / rings;
      redistributed +=
        ((surfaceAt(centre.x + r, centre.z, frame) - frame.surfaceHeight) *
          TAU *
          r *
          SILO.flowRadius) /
        rings;
    }
    close(redistributed, 0, 2e-7);
    assert.ok(surfaceAt(centre.x, centre.z, frame) < frame.surfaceHeight - 0.3);
    assert.ok(surfaceAt(centre.x + SILO.flowRadius * 0.8, centre.z, frame) > frame.surfaceHeight);
    assert.ok(Math.hypot(centre.x, centre.z) + SILO.flowRadius < SILO.radius);
  }
  close(surfaceAt(0, 0, frame), frame.surfaceHeight);
  close(surfaceAt(SILO.radius, 0, frame), frame.surfaceHeight + frame.depression * DEPRESSION_MEAN);
});

test("connected technician shares exposure but line geometrically limits descent before representation", () => {
  const original = evaluateFrame(0);
  for (let tick = 0; tick <= 1800; tick++) {
    const frame = evaluateFrame(tick / 60);
    assert.ok(frame.connection.distance <= CONNECTION_LENGTH + 1e-9);
    close(frame.connection.ropeAnchor.x, frame.connection.anchor.x);
    close(frame.connection.ropeAnchor.y, frame.connection.anchor.y - CONNECTOR_REACH);
    close(frame.connection.ropeAnchor.z, frame.connection.anchor.z);
    close(
      frame.connection.totalDistance,
      frame.connection.connectorReach + frame.connection.ropeDistance,
    );
    assert.ok(
      frame.connection.totalDistance <= CONNECTION_LENGTH + 1e-9,
      "fixed total includes the vertical rigid connector",
    );
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
  const centre = INCIDENT_CENTRES[0]!;
  const buffer = flowAt(centre.x + 0.2, centre.z, frame);
  assert.equal(flowAt(centre.x + 0.2, centre.z, frame, buffer), buffer);
  assert.ok(buffer.x < 0 && buffer.y < 0);
  assert.equal(flowAt(4, 4, frame, buffer).y, 0);
});

test("versioned metre configuration and eleven support angles close without rounding accumulation", () => {
  assert.equal(SILO_CONFIG.coordinates.units, "m");
  assert.equal(SILO_CONFIG.coordinates.up, "Y");
  assert.equal(SILO_CONFIG.radius.value, 11);
  assert.equal(SILO_CONFIG.externalEnvelope.value, 11.32);
  assert.equal(SILO_CONFIG.bodyTop.value, 24.88);
  assert.equal(SILO_CONFIG.roofTop.value, 30.403);
  assert.equal(SUPPORT_ANGLES.length, 11);
  assert.equal(SUPPORT_ANGLES[0], 0);
  for (let index = 0; index < 11; index++) close(SUPPORT_ANGLES[index]!, (index * TAU) / 11);
  assert.ok(
    SILO_CONFIG.tensionerAngle.value > 0 && SILO_CONFIG.tensionerAngle.value < SUPPORT_ANGLES[1]!,
  );
  assert.ok(SILO_CONFIG.manholeAngle.value < SILO_CONFIG.tensionerAngle.value);
  assert.ok(
    Math.abs(
      Math.atan2(SILO_CONFIG.manholeX.value, SILO_CONFIG.manholeZ.value) -
        SILO_CONFIG.manholeAngle.value,
    ) < 0.002,
  );
  close(LIFE_LINE_LENGTH, 68.6500826662, 1e-6);
});

test("trolley path origin, eye, tangent and wheel rotation remain continuous over closure and reverse seeks", () => {
  const original = evaluateTrolley(-0.1);
  for (const support of SUPPORT_ANGLES) {
    const before = evaluateTrolley((support - 1e-7) * SILO.ringRadius);
    const after = evaluateTrolley((support + 1e-7) * SILO.ringRadius);
    assert.ok(
      Math.hypot(before.position.x - after.position.x, before.position.z - after.position.z) <
        0.000003,
    );
    assert.ok(
      Math.hypot(before.tangent.x - after.tangent.x, before.tangent.z - after.tangent.z) < 0.000001,
    );
    close(after.eye.y, 24.281);
    close(Math.hypot(after.eye.x, after.eye.z), SILO.ringRadius + 0.0155);
    close(after.position.x * after.tangent.x + after.position.z * after.tangent.z, 0, 1e-10);
    close(Math.cos(after.yaw), after.tangent.x);
    close(-Math.sin(after.yaw), after.tangent.z);
  }
  const closeStart = evaluateTrolley(-1e-6);
  const closeEnd = evaluateTrolley(1e-6);
  assert.ok(closeStart.angle > 6 && closeEnd.angle < 0.01);
  close(closeEnd.unwrappedAngle - closeStart.unwrappedAngle, 2e-6 / SILO.ringRadius);
  const buffer = evaluateTrolley(LIFE_LINE_LENGTH * 3);
  assert.deepEqual(evaluateTrolley(-0.1, buffer), original);
  close(evaluateTrolley(1).wheelRotation, 1 / 0.017);
});

test("whole LVHF demonstration follows a full circuit with a fixed reachable connection", () => {
  const start = evaluateDemonstrationFrame(0);
  const end = evaluateDemonstrationFrame(80);
  close(end.trolley.distance - start.trolley.distance, LIFE_LINE_LENGTH);
  close(start.trolley.travelledDistance, 0);
  close(end.trolley.travelledDistance, LIFE_LINE_LENGTH);
  close(start.workers.A.position.x, end.workers.A.position.x);
  close(start.workers.A.position.z, end.workers.A.position.z);
  for (let tick = 0; tick <= 4800; tick++) {
    const frame = evaluateDemonstrationFrame(tick / 60);
    assert.ok(frame.connection.distance <= CONNECTION_LENGTH);
    assert.ok(frame.connection.totalDistance <= CONNECTION_LENGTH);
    close(frame.workers.A.harness.x, frame.connection.harness.x);
    close(frame.connection.anchor.x, frame.trolley.eye.x);
    close(frame.volume, INITIAL_GRAIN_VOLUME);
    assert.equal(frame.depression, 0);
    for (const worker of Object.values(frame.workers))
      assert.ok(Math.hypot(worker.position.x, worker.position.z) + 0.35 < SILO.radius);
  }
});

test("incompatible exploration levels take workers out of mass; mode return preserves incident without automatic playback", () => {
  for (const level of [0.18, 5, 14, 21, 23.8]) {
    const frame = evaluateExplorationFrame(level);
    assert.equal(frame.supportAvailable, false);
    assert.equal(frame.connection.connected, false);
    close(frame.volume, grainVolume(level));
    assert.ok(
      Object.values(frame.workers).every(
        (worker) =>
          worker.position.y === SILO_CONFIG.groundY.value &&
          Math.hypot(worker.position.x, worker.position.z) > SILO.radius,
      ),
    );
  }
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.seek(18.25);
  const incident = structuredClone(simulation.getFrame());
  simulation.setExperience("explore");
  simulation.setExplorationLevel(5);
  assert.equal(simulation.start(), false);
  simulation.setExperience("lvhf");
  simulation.seek(65);
  assert.equal(simulation.getDuration(), 80);
  simulation.setExperience("incident");
  assert.deepEqual(simulation.getFrame(), incident);
  assert.equal(simulation.getSnapshot().status, "paused");
  assert.equal(simulation.setExplorationLevel(3), false);
});

test("prevention mode keeps both technicians outside on the apron and restores the saved incident scenario", () => {
  const simulation = new SiloSimulation();
  simulation.setReady(true);
  simulation.seek(13.2);
  simulation.resume();
  simulation.setScenario("no-connection");
  assert.equal(simulation.getSnapshot().status, "paused");
  simulation.setScenario("prevention");
  assert.equal(simulation.getSnapshot().experience, "prevention");
  assert.equal(simulation.getSnapshot().scenario, "prevention");
  const prevented = simulation.getFrame();
  assert.equal(
    prevented.supportAvailable,
    true,
    "external workers remain visible on supported ground",
  );
  assert.ok(
    Object.values(prevented.workers).every(
      (worker) =>
        worker.position.y === SILO_CONFIG.groundY.value &&
        Math.abs(worker.position.x) > SILO.radius,
    ),
  );
  simulation.setExperience("incident");
  assert.equal(simulation.getSnapshot().scenario, "no-connection");
  close(simulation.getFrame().time, 13.2);
  assert.deepEqual(simulation.getFrame(), evaluateFrame(13.2, "no-connection"));
  simulation.setExperience("lvhf");
  simulation.seek(25);
  assert.ok(
    !simulation
      .getSnapshot()
      .events.some((event) => /colapso|descarga|engolfamento/i.test(event.label)),
  );
});
