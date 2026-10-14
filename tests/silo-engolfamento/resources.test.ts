import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { createProtection } from "../../src/silo-engolfamento/ProtectionSystem";
import { createWorkers, type WorkerPose } from "../../src/silo-engolfamento/Workers";
import { evaluateFrame, SILO, CONNECTION_LENGTH } from "../../src/silo-engolfamento/simulation";

test("optimized CC0 assets preserve rig and LOD budgets, and common texture identity", async () => {
  const directory = "public/models/silo-engolfamento";
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  assert.equal(manifest.license, "CC0-1.0");
  assert.equal(
    manifest.models.reduce((sum: number, model: { bytes: number }) => sum + model.bytes, 0),
    3_992_572,
  );
  const shared = new Map<string, string>();
  for (const model of manifest.models) {
    const bytes = await readFile(`${directory}/worker-${model.variant}.glb`);
    assert.equal(bytes.length, model.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), model.sha256);
    assert.equal(model.errors, 0);
    assert.equal(model.bones, 53);
    assert.ok(model.nearTriangles <= 20_000 && model.farTriangles <= 8_000);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    for (const name of [
      "pelvis",
      "spine_03",
      "head",
      "thigh_l",
      "calf_l",
      "foot_l",
      "thigh_r",
      "calf_r",
      "foot_r",
      "upperarm_l",
      "lowerarm_l",
      "hand_l",
      "upperarm_r",
      "lowerarm_r",
      "hand_r",
    ]) {
      assert.ok(
        json.nodes.some((node: { name: string }) => node.name === name),
        name,
      );
    }
    assert.equal(
      json.animations?.length ?? 0,
      0,
      "Domain posture has no baked root-motion authority",
    );
    for (const texture of model.textures) {
      assert.ok(Math.max(...texture.size) <= 1024);
      if (!texture.name.startsWith("young_")) {
        const hash = shared.get(texture.name);
        if (hash)
          assert.equal(texture.sha256, hash, `${texture.name}: cross-worker sharing contract`);
        else shared.set(texture.name, texture.sha256);
      }
    }
  }
  assert.equal(shared.size, 4);
});

test("line follows exact dorsal and anchor positions in one reusable buffer", () => {
  const anchor = new THREE.Vector3(-0.7, 9.25, 0);
  const system = createProtection([-0.7, 9.25, 0], 2.1);
  const line = system.root.getObjectByName("Linha_ancoragem_ao_ponto_dorsal") as THREE.Mesh;
  const attribute = line.geometry.getAttribute("position");
  const originalBuffer = attribute.array;
  const harness = new THREE.Vector3(-0.46, 7.77, 0.1);
  const center = (ring: number) => {
    const result = new THREE.Vector3();
    for (let k = 0; k < 5; k++)
      result.add(new THREE.Vector3().fromBufferAttribute(attribute, ring * 5 + k));
    return result.divideScalar(5);
  };
  system.update(harness, 0);
  assert.ok(center(0).distanceTo(anchor) < 1e-6);
  assert.ok(center(16).distanceTo(harness) < 1e-6);
  const midpoint = anchor.clone().lerp(harness, 0.5);
  assert.ok(
    center(8).distanceTo(midpoint) > 0.1,
    "slack is visibly bowed, including nearly vertical lines",
  );
  let arcLength = 0;
  for (let i = 1; i <= 16; i++) arcLength += center(i).distanceTo(center(i - 1));
  assert.ok(arcLength <= 2.1, "illustrative slack curve cannot exceed its configured line length");
  harness.set(-0.5, 7.15, 0.1);
  const copy = harness.clone();
  system.update(harness, 1);
  assert.equal(attribute.array, originalBuffer);
  assert.ok(center(16).distanceTo(harness) < 1e-6);
  assert.ok(
    center(8).distanceTo(anchor.clone().lerp(harness, 0.5)) < 1e-6,
    "tension removes the illustrative bow",
  );
  assert.ok(harness.equals(copy), "Presentation does not mutate the domain point");
  for (const value of attribute.array) assert.ok(Number.isFinite(value));
  for (const value of line.geometry.getAttribute("normal").array) assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(system.endpointDistance - harness.distanceTo(anchor)) < 1e-10);
  system.update(harness, 0, false);
  assert.equal(line.visible, false);
  system.dispose();
  system.dispose();
  assert.equal(system.root.children.length, 0);
});

test("real rig clones remain independent through seek, burial and first person", async (t) => {
  // Decode the actual GLBs without image maps for this CPU-only rig test.
  // Browser captures validate appearance; this test validates skeletal ownership.
  const io = new NodeIO();
  const assets = new Map<string, Uint8Array>();
  for (const variant of ["a", "b"]) {
    const document = await io.read(`public/models/silo-engolfamento/worker-${variant}.glb`);
    document
      .getRoot()
      .listMaterials()
      .forEach((material) =>
        material
          .setBaseColorTexture(null)
          .setNormalTexture(null)
          .setMetallicRoughnessTexture(null)
          .setOcclusionTexture(null)
          .setEmissiveTexture(null),
      );
    document
      .getRoot()
      .listTextures()
      .forEach((texture) => texture.dispose());
    assets.set(variant, await io.writeBinary(document));
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const variant = String(input).includes("worker-a") ? "a" : "b";
    return new Response(assets.get(variant), { status: 200 });
  };
  try {
    const workers = await createWorkers();
    const A = workers.root.getObjectByName("Tecnico_A")!;
    const B = workers.root.getObjectByName("Tecnico_B")!;
    const aBody = A.getObjectByName("near_body") as THREE.SkinnedMesh;
    const bBody = B.getObjectByName("near_body") as THREE.SkinnedMesh;
    const watchBody = workers.root
      .getObjectByName("Vigia_externo")!
      .getObjectByName("near_body") as THREE.SkinnedMesh;
    assert.notEqual(aBody.skeleton, bBody.skeleton);
    assert.notEqual(aBody.skeleton, watchBody.skeleton);
    assert.notEqual(A.getObjectByName("head"), B.getObjectByName("head"));
    assert.equal(
      aBody.geometry,
      watchBody.geometry,
      "Source geometry is shared across variant A clones",
    );
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 8, 2);
    const frame = {
      A: {
        position: [-0.46, 6.35, 0.24] as const,
        heading: 0,
        walkPhase: 1.7,
        mobility: 0,
        depth: 0.3,
        tension: 1,
        lean: 0,
      },
      B: {
        position: [0.46, 4.3, 0.24] as const,
        heading: 0,
        walkPhase: 1.7,
        mobility: 0,
        depth: 2,
        tension: 0,
        lean: 0.2,
      },
    };
    workers.update(frame, camera);
    const ring = workers.getHarness("A", new THREE.Vector3());
    assert.ok(
      ring.distanceTo(new THREE.Vector3(-0.46, 7.77, 0.1)) < 1e-6,
      "Dorsal ring is the nominal domain point at rest",
    );
    const originalGeometry = aBody.geometry;
    workers.update(frame, camera, "A");
    assert.notEqual(aBody.geometry, originalGeometry);
    assert.ok(aBody.geometry.index!.count > 100, "Hands/body remain visible");
    assert.ok(
      aBody.geometry.index!.count < originalGeometry.index!.count,
      "Wearer head has been removed",
    );
    assert.equal(A.getObjectByName("near_helmet")!.visible, false);
    assert.equal(B.getObjectByName("near_helmet")!.visible, true);
    const previousEye = workers.getEye("B", new THREE.Vector3()).clone();
    workers.update(
      {
        A: { ...frame.A, position: [-0.7, 6.4, 0.3] },
        B: { ...frame.B, position: [0.7, 6.4, 0.3], depth: 0, mobility: 1, lean: 0 },
      },
      camera,
    );
    assert.ok(
      workers.getEye("B", new THREE.Vector3()).y > previousEye.y + 1.5,
      "Backward seek restores the buried rig",
    );
    assert.equal(aBody.geometry, originalGeometry);
    workers.update(frame, camera);
    assert.ok(
      workers.getEye("B", new THREE.Vector3()).distanceTo(previousEye) < 1e-8,
      "Same frame restores identical skeletal eye pose",
    );
    const eye = workers.getEye("A", new THREE.Vector3());
    assert.ok([eye.x, eye.y, eye.z].every(Number.isFinite));
    const adapt = (domain: ReturnType<typeof evaluateFrame>, id: "A" | "B"): WorkerPose => {
      const worker = domain.workers[id];
      const foot = (side: "left" | "right") => {
        const support = worker.feet[side];
        return {
          position: [support.position.x, support.position.y, support.position.z] as const,
          yaw: support.yaw,
          locked: support.locked,
        };
      };
      return {
        position: [worker.position.x, worker.position.y, worker.position.z],
        heading: worker.heading,
        walkPhase: worker.walkPhase,
        mobility: worker.mobility,
        depth: worker.depth,
        tension: worker.tension,
        lean: worker.lean,
        connected: worker.connected,
        feet: { left: foot("left"), right: foot("right") },
      };
    };
    let maximumFootError = 0;
    let maximumStanceDrift = 0;
    for (const side of ["left", "right"] as const) {
      const times = side === "left" ? [3.25, 3.5, 3.8] : [3.9, 4.1, 4.4];
      const firstActual = new Map<string, THREE.Vector3>();
      for (const time of times) {
        const domain = evaluateFrame(time);
        workers.update({ A: adapt(domain, "A"), B: adapt(domain, "B") }, camera);
        for (const id of ["A", "B"] as const) {
          const goal = domain.workers[id].feet[side];
          assert.equal(goal.locked, true);
          const actual = workers.getFoot(id, side, new THREE.Vector3());
          const desired = new THREE.Vector3(goal.position.x, goal.position.y, goal.position.z);
          const error = actual.distanceTo(desired);
          maximumFootError = Math.max(maximumFootError, error);
          assert.ok(error < 0.03, `Actual ${id}/${side} sole goal error at ${time}s: ${error}m`);
          const previous = firstActual.get(id);
          if (previous) {
            const drift = actual.distanceTo(previous);
            maximumStanceDrift = Math.max(maximumStanceDrift, drift);
            assert.ok(
              drift < 0.01,
              `Actual planted ${id}/${side} foot drift at ${time}s: ${drift}m`,
            );
          } else firstActual.set(id, actual.clone());
        }
      }
    }
    t.diagnostic(
      `Real-rig planted soles: maximum target error=${maximumFootError}m; maximum stance drift=${maximumStanceDrift}m`,
    );
    const anchor = new THREE.Vector3().fromArray(SILO.anchor);
    const samples = [];
    for (const time of [0, 6, 6.5, 7, 10, 15, 20, 30]) {
      const domain = evaluateFrame(time);
      workers.update({ A: adapt(domain, "A"), B: adapt(domain, "B") }, camera);
      const actual = workers.getHarness("A", new THREE.Vector3());
      const excess = Math.max(0, actual.distanceTo(anchor) - CONNECTION_LENGTH);
      const nominal = new THREE.Vector3(
        domain.workers.A.harness.x,
        domain.workers.A.harness.y,
        domain.workers.A.harness.z,
      );
      samples.push({
        time,
        actualLength: actual.distanceTo(anchor),
        maximumLength: CONNECTION_LENGTH,
        excess,
        dorsalDifference: actual.distanceTo(nominal),
      });
      assert.ok(
        excess < 0.1,
        `Actual skeletal harness exceeds line budget at ${time}s: ${excess}m`,
      );
    }
    t.diagnostic(`Dorsal constraint audit: ${JSON.stringify(samples)}`);
    const preventive = evaluateFrame(20, "prevention");
    workers.update({ A: adapt(preventive, "A"), B: adapt(preventive, "B") }, camera);
    assert.ok(
      Math.abs(A.position.x) > SILO.radius && Math.abs(B.position.x) > SILO.radius,
      "Preventive replay remains outside the silo",
    );
    workers.dispose();
    workers.dispose();
    assert.equal(workers.root.children.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
