import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { createProtection } from "../../src/silo-engolfamento/ProtectionSystem";
import { createWorkers, type WorkerPose } from "../../src/silo-engolfamento/Workers";
import {
  evaluateDemonstrationFrame,
  evaluateFrame,
  SILO,
  CONNECTION_LENGTH,
} from "../../src/silo-engolfamento/simulation";
import { SUPPORT_ANGLES } from "../../src/silo-engolfamento/SiloConfig";
import { surfaceAt } from "../../src/silo-engolfamento/GrainField";

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

test("rope follows the connector lower attachment and exact dorsal in one reusable buffer", () => {
  const frame = evaluateFrame(0);
  const anchor = new THREE.Vector3(
    frame.connection.anchor.x,
    frame.connection.anchor.y,
    frame.connection.anchor.z,
  );
  const system = createProtection(anchor.toArray() as [number, number, number], CONNECTION_LENGTH);
  const line = system.bindings.get("lvhf.rope")![0] as THREE.Mesh;
  const attribute = line.geometry.getAttribute("position");
  const originalBuffer = attribute.array;
  const harness = new THREE.Vector3(
    frame.connection.harness.x,
    frame.connection.harness.y,
    frame.connection.harness.z,
  );
  const sides = 6;
  const segments = attribute.count / sides - 1;
  const center = (ring: number) => {
    const result = new THREE.Vector3();
    for (let k = 0; k < sides; k++)
      result.add(new THREE.Vector3().fromBufferAttribute(attribute, ring * sides + k));
    return result.divideScalar(sides);
  };
  system.update(harness, 0);
  assert.ok(center(0).distanceTo(system.ropeAttachment) < 0.000005);
  assert.ok(Math.abs(system.ropeAttachment.distanceTo(anchor) - system.connectorReach) < 1e-10);
  const expectedAttachment = anchor.clone().add(new THREE.Vector3(0, -system.connectorReach, 0));
  assert.ok(
    system.ropeAttachment.distanceTo(expectedAttachment) < 1e-10,
    "connector remains vertical through the trolley hole and rope starts below its rigid bow",
  );
  assert.ok(center(segments).distanceTo(harness) < 0.000005);
  const midpoint = system.ropeAttachment.clone().lerp(harness, 0.5);
  assert.ok(
    center(segments / 2).distanceTo(midpoint) > 0.04,
    "slack is visibly bowed, including nearly vertical lines",
  );
  let arcLength = 0;
  for (let i = 1; i <= segments; i++) arcLength += center(i).distanceTo(center(i - 1));
  assert.ok(
    system.connectorReach + arcLength <= CONNECTION_LENGTH,
    "connector reach plus rope curve cannot exceed the fixed total connection length",
  );
  harness.copy(anchor).add(new THREE.Vector3(0, -0.9, 0));
  const copy = harness.clone();
  system.update(harness, 1);
  assert.equal(attribute.array, originalBuffer);
  assert.ok(center(0).distanceTo(system.ropeAttachment) < 0.000005);
  assert.ok(center(segments).distanceTo(harness) < 0.000005);
  assert.ok(
    center(segments / 2).distanceTo(system.ropeAttachment.clone().lerp(harness, 0.5)) < 0.000005,
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

test("connector plus rendered rope stay inside fixed total length through incident, full circuit and reverse seeks", (t) => {
  const initial = evaluateFrame(0);
  const system = createProtection(
    [initial.connection.anchor.x, initial.connection.anchor.y, initial.connection.anchor.z],
    CONNECTION_LENGTH,
  );
  const line = system.bindings.get("lvhf.rope")![0] as THREE.Mesh;
  const attribute = line.geometry.getAttribute("position");
  const first = new THREE.Vector3(),
    previous = new THREE.Vector3(),
    point = new THREE.Vector3();
  const harness = new THREE.Vector3();
  const anchor = new THREE.Vector3(),
    expectedAttachment = new THREE.Vector3();
  let maximumCurveLength = 0,
    maximumTotalLength = 0;
  for (const evaluator of [evaluateFrame, evaluateDemonstrationFrame]) {
    const duration = evaluator === evaluateFrame ? 30 : 80;
    for (const time of [
      ...Array.from({ length: duration * 2 + 1 }, (_, index) => index / 2),
      0,
      duration,
      3,
      0,
    ]) {
      const frame = evaluator(time);
      harness.set(
        frame.connection.harness.x,
        frame.connection.harness.y,
        frame.connection.harness.z,
      );
      system.update(
        harness,
        frame.connection.tension,
        true,
        frame.connection.anchor,
        frame.trolley.distance,
      );
      anchor.set(frame.connection.anchor.x, frame.connection.anchor.y, frame.connection.anchor.z);
      expectedAttachment.copy(anchor).add(new THREE.Vector3(0, -system.connectorReach, 0));
      assert.ok(system.ropeAttachment.distanceTo(expectedAttachment) < 1e-10);
      assert.ok(Math.abs(system.ropeAttachment.distanceTo(anchor) - system.connectorReach) < 1e-10);
      assert.ok(
        Math.abs(system.endpointDistance - anchor.distanceTo(harness)) < 1e-10,
        "domain budget still starts at the true eye",
      );
      assert.ok(
        system.ropeAttachment.distanceTo(
          new THREE.Vector3(
            frame.connection.ropeAnchor.x,
            frame.connection.ropeAnchor.y,
            frame.connection.ropeAnchor.z,
          ),
        ) < 1e-10,
        "render and domain share the exact lower connector tangent",
      );
      assert.ok(
        frame.connection.totalDistance <= CONNECTION_LENGTH + 1e-9,
        "domain constrains the complete connector-plus-rope chain before rendering",
      );
      let length = 0;
      for (let ring = 0; ring < attribute.count / 6; ring++) {
        point.set(0, 0, 0);
        for (let side = 0; side < 6; side++)
          point.add(first.fromBufferAttribute(attribute, ring * 6 + side));
        point.divideScalar(6);
        if (ring > 0) length += point.distanceTo(previous);
        else
          assert.ok(
            point.distanceTo(system.ropeAttachment) < 0.000005,
            "rope begins at the connector lower attachment, outside its rigid bow",
          );
        previous.copy(point);
      }
      maximumCurveLength = Math.max(maximumCurveLength, length);
      maximumTotalLength = Math.max(maximumTotalLength, system.connectorReach + length);
      assert.ok(
        system.connectorReach + length <= CONNECTION_LENGTH + 0.00005,
        `connector ${system.connectorReach}m + rope ${length}m exceeds fixed total ${CONNECTION_LENGTH}m at ${time}s`,
      );
      assert.ok(previous.distanceTo(harness) < 0.000005);
    }
  }
  t.diagnostic(
    `Rendered rope maximum centreline length=${maximumCurveLength}m; connector reach=${system.connectorReach}m; maximum total=${maximumTotalLength}m; Float32 tolerance=0.05mm`,
  );
  system.dispose();
});

test("untensioned diagonal slack uses the remaining rope budget up to near-taut lengths", () => {
  const frame = evaluateFrame(0),
    eye = new THREE.Vector3(
      frame.connection.anchor.x,
      frame.connection.anchor.y,
      frame.connection.anchor.z,
    );
  const system = createProtection(eye.toArray() as [number, number, number], CONNECTION_LENGTH);
  const line = system.bindings.get("lvhf.rope")![0] as THREE.Mesh;
  const positions = line.geometry.getAttribute("position"),
    point = new THREE.Vector3(),
    scratch = new THREE.Vector3(),
    previous = new THREE.Vector3();
  const ropeOrigin = eye.clone().add(new THREE.Vector3(0, -system.connectorReach, 0));
  const ropeBudget = CONNECTION_LENGTH - system.connectorReach;
  for (const vector of [
    [0, -1, 0],
    [0.8, -0.2, 0.5],
    [-0.7, -0.1, 0.4],
    [1, -0.01, 0],
    [0.01, -1, -0.01],
  ])
    for (const distance of [0.1, 0.5, 0.75, 0.89, ropeBudget - 0.0001, ropeBudget - 0.0000001]) {
      const harness = new THREE.Vector3()
        .fromArray(vector)
        .normalize()
        .multiplyScalar(distance)
        .add(ropeOrigin);
      system.update(harness, 0, true, eye);
      let ropeCurveLength = 0;
      for (let ring = 0; ring < positions.count / 6; ring++) {
        point.set(0, 0, 0);
        for (let side = 0; side < 6; side++)
          point.add(scratch.fromBufferAttribute(positions, ring * 6 + side));
        point.divideScalar(6);
        if (ring) ropeCurveLength += point.distanceTo(previous);
        previous.copy(point);
      }
      assert.ok(
        system.connectorReach + ropeCurveLength <= CONNECTION_LENGTH + 0.00005,
        `tension=0 diagonal ${vector} at rope chord ${distance}m cannot create artificial extra slack: total=${system.connectorReach + ropeCurveLength}m`,
      );
    }
  system.dispose();
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
        dorsal: [worker.harness.x, worker.harness.y, worker.harness.z],
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
    const samples = [];
    let maximumEyeError = 0;
    for (const time of [0, 6, 6.5, 7, 10, 15, 20, 30]) {
      const domain = evaluateFrame(time);
      workers.update({ A: adapt(domain, "A"), B: adapt(domain, "B") }, camera);
      const anchor = new THREE.Vector3(
        domain.connection.anchor.x,
        domain.connection.anchor.y,
        domain.connection.anchor.z,
      );
      const actual = workers.getHarness("A", new THREE.Vector3());
      const ropeAnchor = new THREE.Vector3(
        domain.connection.ropeAnchor.x,
        domain.connection.ropeAnchor.y,
        domain.connection.ropeAnchor.z,
      );
      const actualTotal = domain.connection.connectorReach + actual.distanceTo(ropeAnchor);
      const excess = Math.max(0, actualTotal - CONNECTION_LENGTH);
      const nominal = new THREE.Vector3(
        domain.workers.A.harness.x,
        domain.workers.A.harness.y,
        domain.workers.A.harness.z,
      );
      samples.push({
        time,
        actualLength: actualTotal,
        straightEyeDistance: actual.distanceTo(anchor),
        maximumLength: CONNECTION_LENGTH,
        excess,
        dorsalDifference: actual.distanceTo(nominal),
      });
      assert.ok(
        excess < 0.005,
        `Actual skeletal harness exceeds line budget at ${time}s: ${excess}m`,
      );
      assert.ok(
        actual.distanceTo(nominal) < 0.005,
        `Actual dorsal endpoint differs from constrained domain at ${time}s`,
      );
      for (const id of ["A", "B"] as const) {
        const actualEye = workers.getEye(id, new THREE.Vector3());
        const desiredEye = new THREE.Vector3(
          domain.workers[id].eye.x,
          domain.workers[id].eye.y,
          domain.workers[id].eye.z,
        );
        maximumEyeError = Math.max(maximumEyeError, actualEye.distanceTo(desiredEye));
        assert.ok(
          actualEye.distanceTo(desiredEye) < 0.005,
          `First-person ${id} eye differs from domain at ${time}s by ${actualEye.distanceTo(desiredEye)}m`,
        );
        assert.equal(
          actualEye.y <= surfaceAt(actualEye.x, actualEye.z, domain),
          domain.workers[id].occluded,
          "grain occlusion and actual skeletal eye agree",
        );
      }
    }
    t.diagnostic(`Dorsal constraint audit: ${JSON.stringify(samples)}`);
    t.diagnostic(
      `Actual first-person eye/domain maximum difference=${maximumEyeError}m; all sampled skeletal eye occlusion states agree with the grain surface`,
    );
    let maximumDemonstrationDorsalError = 0;
    let maximumDemonstrationFootError = 0;
    for (const angle of SUPPORT_ANGLES) {
      const tau = Math.PI * 2;
      const crossing = (((angle - Math.PI - 0.2 + tau) % tau) / tau) * 80;
      for (const time of [Math.max(0, crossing - 0.01), crossing, Math.min(80, crossing + 0.01)]) {
        const domain = evaluateDemonstrationFrame(time);
        workers.update({ A: adapt(domain, "A"), B: adapt(domain, "B") }, camera);
        const actual = workers.getHarness("A", new THREE.Vector3());
        const desired = new THREE.Vector3(
          domain.connection.harness.x,
          domain.connection.harness.y,
          domain.connection.harness.z,
        );
        maximumDemonstrationDorsalError = Math.max(
          maximumDemonstrationDorsalError,
          actual.distanceTo(desired),
        );
        assert.ok(actual.distanceTo(desired) < 0.005, `Demonstration dorsal mismatch at ${time}s`);
        const eye = new THREE.Vector3(
          domain.trolley.eye.x,
          domain.trolley.eye.y,
          domain.trolley.eye.z,
        );
        assert.ok(actual.distanceTo(eye) <= CONNECTION_LENGTH + 0.005);
        const ropeAnchor = new THREE.Vector3(
          domain.connection.ropeAnchor.x,
          domain.connection.ropeAnchor.y,
          domain.connection.ropeAnchor.z,
        );
        assert.ok(
          domain.connection.connectorReach + actual.distanceTo(ropeAnchor) <=
            CONNECTION_LENGTH + 0.005,
        );
        for (const id of ["A", "B"] as const)
          for (const side of ["left", "right"] as const) {
            const goal = domain.workers[id].feet[side];
            const actualFoot = workers.getFoot(id, side, new THREE.Vector3());
            const desiredFoot = new THREE.Vector3(
              goal.position.x,
              goal.position.y,
              goal.position.z,
            );
            maximumDemonstrationFootError = Math.max(
              maximumDemonstrationFootError,
              actualFoot.distanceTo(desiredFoot),
            );
            assert.ok(
              actualFoot.distanceTo(desiredFoot) < 0.03,
              `Demonstration ${id}/${side} foot support mismatch at ${time}s: ${actualFoot.distanceTo(desiredFoot)}m; locked=${goal.locked}; desired=${desiredFoot.toArray()}; actual=${actualFoot.toArray()}`,
            );
          }
      }
    }
    t.diagnostic(
      `Full-circuit real rig dorsal endpoint maximum error=${maximumDemonstrationDorsalError}m; foot target maximum error=${maximumDemonstrationFootError}m; numerical kinematics only, no certified support transposition`,
    );
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
