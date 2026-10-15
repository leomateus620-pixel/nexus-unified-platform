import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import { createSiloModel } from "../../src/silo-engolfamento/SiloModel";
import { createProtection } from "../../src/silo-engolfamento/ProtectionSystem";
import { InspectionController } from "../../src/silo-engolfamento/InspectionController";
import { COMPONENTS } from "../../src/silo-engolfamento/ComponentRegistry";
import { SILO_CONFIG } from "../../src/silo-engolfamento/SiloConfig";

test("grounded model has physical shell scale, capped roof and genuine hatch perforation", () => {
  const model = createSiloModel();
  model.root.updateMatrixWorld(true);
  const body = new T.Box3().setFromObject(model.bindings.get("structure.shell")![0]!);
  assert.ok(Math.abs(body.min.y - 0.18) < 1e-5);
  assert.ok(Math.abs(body.max.y - 24.88) < 1e-5);
  assert.ok(body.max.x > 11 && body.max.x < 11.02);
  const base = new T.Box3().setFromObject(model.bindings.get("structure.foundation")![0]!);
  assert.ok(base.min.y < 0 && base.max.y > 0);
  const ray = new T.Raycaster(new T.Vector3(1.548, 32, 10.486), new T.Vector3(0, -1, 0));
  const roofHits = ray.intersectObjects(model.bindings.get("structure.roof")!, true);
  assert.equal(roofHits.length, 0, "roof surface must really be absent inside the hatch");
  assert.ok(
    ray.intersectObjects(model.bindings.get("structure.manhole")!, true).length > 0,
    "the closed lid covers the opening",
  );
  model.setPresentation({ hatchOpen: true });
  model.root.updateMatrixWorld(true);
  assert.equal(
    ray.intersectObjects(model.bindings.get("structure.manhole")!, true).length,
    0,
    "explicit inspection opens the hinged lid and reveals the aperture",
  );
  model.setPresentation({ hatchOpen: false });
  model.root.updateMatrixWorld(true);
  assert.ok(
    ray.intersectObjects(model.bindings.get("structure.manhole")!, true).length > 0,
    "closing inspection restores the same lid",
  );
  assert.ok(new T.Box3().setFromObject(model.root).max.y < 30.46);
  model.dispose();
  model.dispose();
});

test("protection has eleven support identities and exact moving eye, without a pórtico", () => {
  const protection = createProtection([0, 24.285, 10.926], 0.95);
  const passants = [...protection.bindings.keys()].filter((id) => id.startsWith("lvhf.passant."));
  assert.equal(passants.length, 10);
  assert.ok(protection.bindings.has("lvhf.anchor"));
  assert.ok(protection.bindings.has("lvhf.tensioner"));
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 2 - 1e-8, Math.PI * 2 + 1e-8, -0.5]) {
    const anchor = new T.Vector3(Math.sin(angle) * 10.926, 24.285, Math.cos(angle) * 10.926);
    const harness = anchor
      .clone()
      .add(new T.Vector3(-0.4 * Math.sin(angle), -0.6, -0.4 * Math.cos(angle)));
    protection.update(harness, 0, true, anchor, angle * 10.926);
    protection.root.updateMatrixWorld(true);
    const rope = protection.bindings.get("lvhf.rope")![0] as T.Mesh;
    const positions = rope.geometry.getAttribute("position");
    const first = new T.Vector3(),
      last = new T.Vector3();
    for (let i = 0; i < 6; i++) {
      first.add(new T.Vector3().fromBufferAttribute(positions, i));
      last.add(new T.Vector3().fromBufferAttribute(positions, positions.count - 6 + i));
    }
    first.divideScalar(6);
    last.divideScalar(6);
    assert.ok(first.distanceTo(protection.ropeAttachment) < 2e-6);
    assert.ok(
      Math.abs(protection.ropeAttachment.distanceTo(anchor) - protection.connectorReach) < 1e-8,
    );
    assert.ok(last.distanceTo(harness) < 2e-6);
    assert.ok(Math.abs(protection.endpointDistance - harness.distanceTo(anchor)) < 1e-8);
  }
  const bounds = new T.Box3().setFromObject(protection.root);
  assert.ok(bounds.min.y > 23.4, "there must be no leftover external columns at ground level");
  protection.dispose();
  protection.dispose();
});

test("individual highlight restores shared materials and isolation restores exact visibility", () => {
  const protection = createProtection([0, 24.285, 10.926], 0.95);
  const inspector = new InspectionController(protection.bindings);
  const first = protection.bindings.get("lvhf.passant.01")![0] as T.Mesh;
  const second = protection.bindings.get("lvhf.passant.02")![0] as T.Mesh;
  const original = first.material;
  assert.equal(original, second.material);
  inspector.select("lvhf.passant.01");
  assert.notEqual(first.material, second.material);
  assert.equal(second.material, original);
  inspector.select(null);
  assert.equal(first.material, original);
  second.visible = false;
  inspector.isolate("lvhf.trolley");
  assert.equal(first.visible, false);
  inspector.restore();
  assert.equal(first.visible, true);
  assert.equal(second.visible, false);
  assert.ok(inspector.getBounds("lvhf.trolley").getSize(new T.Vector3()).length() < 0.3);
  inspector.dispose();
  protection.dispose();
});

test("registry IDs are unique and cover every selectable required subsystem", () => {
  assert.equal(new Set(COMPONENTS.map((c) => c.id)).size, COMPONENTS.length);
  for (const id of [
    "structure.shell",
    "structure.foundation",
    "structure.floor",
    "structure.manhole",
    "lvhf.cable",
    "lvhf.anchor",
    "lvhf.tensioner",
    "lvhf.trolley",
    "lvhf.connector",
    "lvhf.rope",
    "lvhf.harness",
  ])
    assert.ok(COMPONENTS.find((item) => item.id === id));
});

test("parametric passants, anchor and tensioner stay outside the trolley solid sweep at every angle", () => {
  const r = SILO_CONFIG.ringRadius.value,
    y = SILO_CONFIG.ringY.value;
  const offset = SILO_CONFIG.trolleyEyeRadialOffset.value;
  const protection = createProtection(
    [0, y - SILO_CONFIG.trolleyEyeOffset.value, r + offset],
    0.95,
  );
  protection.update(
    new T.Vector3(0, y - 0.6, r - 0.5),
    0,
    true,
    { x: 0, y: y - SILO_CONFIG.trolleyEyeOffset.value, z: r + offset },
    0,
  );
  protection.root.updateMatrixWorld(true);
  let movingMaxRadius = 0,
    movingMaxY = -Infinity;
  for (const id of ["lvhf.trolley", "lvhf.connector"])
    for (const object of protection.bindings.get(id)!) {
      const mesh = object as T.Mesh,
        positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const p = new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        movingMaxRadius = Math.max(movingMaxRadius, Math.hypot(p.x, p.z));
        movingMaxY = Math.max(movingMaxY, p.y);
      }
    }
  let trianglesChecked = 0;
  for (const [id, objects] of protection.bindings) {
    if (!(id.startsWith("lvhf.passant.") || id === "lvhf.anchor" || id === "lvhf.tensioner"))
      continue;
    for (const object of objects) {
      const mesh = object as T.Mesh,
        positions = mesh.geometry.getAttribute("position"),
        indices = mesh.geometry.index;
      const angle = Math.atan2(mesh.parent!.position.x, mesh.parent!.position.z);
      const radial = new T.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const count = indices?.count ?? positions.count;
      for (let i = 0; i < count; i += 3) {
        const points = [0, 1, 2].map((k) =>
          new T.Vector3()
            .fromBufferAttribute(positions, indices ? indices.getX(i + k) : i + k)
            .applyMatrix4(mesh.matrixWorld),
        );
        // A triangle wholly above the maximum moving Y, or wholly outside its
        // maximum swept radius, is separated for ALL angular positions. This
        // half-space proof is stronger than a few screenshots or AABB samples.
        const above = points.every((p) => p.y > movingMaxY + 0.0001);
        const outside = points.every((p) => p.dot(radial) > movingMaxRadius + 0.0001);
        assert.ok(
          above || outside,
          `${id} triangle ${i / 3} intersects conservative swept corridor`,
        );
        trianglesChecked++;
      }
    }
  }
  assert.ok(trianglesChecked > 2000);
  protection.dispose();
});

test("audited trolley envelope and underside wheel tangency survive reconstruction", () => {
  const r = SILO_CONFIG.ringRadius.value,
    y = SILO_CONFIG.ringY.value;
  const protection = createProtection([0, y - 0.094, r + 0.0155], 0.95);
  protection.update(
    new T.Vector3(0, y - 0.6, r - 0.5),
    0,
    true,
    { x: 0, y: y - 0.094, z: r + 0.0155 },
    0,
  );
  protection.root.updateMatrixWorld(true);
  const bounds = new T.Box3();
  for (const object of protection.bindings.get("lvhf.trolley")!) bounds.expandByObject(object);
  const size = bounds.getSize(new T.Vector3());
  assert.ok(Math.abs(size.x - 0.105) < 1e-5, `travel envelope ${size.x}`);
  assert.ok(Math.abs(size.y - 0.1) < 1e-5, `vertical envelope ${size.y}`);
  assert.ok(Math.abs(size.z - 0.062) < 1e-5, `radial envelope ${size.z}`);
  assert.ok(
    Math.abs(bounds.max.y - (y - 0.004)) < 1e-5,
    "roller tops touch underside of cable Ø8mm",
  );
  protection.update(new T.Vector3(), 0, false, { x: r + 0.0155, y: y - 0.094, z: 0 }, 0);
  assert.equal(protection.bindings.get("lvhf.rope")![0]!.visible, false);
  assert.ok(
    protection.bindings.get("lvhf.trolley")!.every((object) => object.parent!.visible),
    "hardware remains inspectable without a connected worker",
  );
  protection.dispose();
});

test("underside roller spin cancels local tangent contact velocity forward and in reverse", () => {
  const radius = SILO_CONFIG.ringRadius.value,
    wheelRadius = SILO_CONFIG.wheelDiameter.value / 2,
    eyeRadius = radius + SILO_CONFIG.trolleyEyeRadialOffset.value,
    eyeY = SILO_CONFIG.ringY.value - SILO_CONFIG.trolleyEyeOffset.value;
  const protection = createProtection([0, eyeY, eyeRadius], 0.95);
  const wheels = protection.bindings
    .get("lvhf.trolley")!
    .filter((object) => (object as T.Mesh).geometry.type === "CylinderGeometry") as T.Mesh[];
  assert.equal(wheels.length, 2);
  let previousDistance = 0;
  const previousSpin = [0, 0];
  for (const distance of [
    0.17,
    0.34,
    -0.17,
    radius * (Math.PI * 2 - 0.002),
    radius * (Math.PI * 2 + 0.002),
    radius * (Math.PI * 2 - 0.002),
  ]) {
    const angle = distance / radius;
    const anchor = new T.Vector3(Math.sin(angle) * eyeRadius, eyeY, Math.cos(angle) * eyeRadius);
    const harness = anchor
      .clone()
      .add(new T.Vector3(-0.5 * Math.sin(angle), -0.6, -0.5 * Math.cos(angle)));
    protection.update(harness, 0, true, anchor, distance);
    const localTravelVelocity = new T.Vector3(distance - previousDistance, 0, 0);
    wheels.forEach((wheel, index) => {
      // Unit time is sufficient: v + omega cross r must vanish at the upper
      // contact's tangent component. This tests direction as well as arc/radius.
      const omega = new T.Vector3(0, 0, wheel.rotation.z - previousSpin[index]!);
      const contactVelocity = localTravelVelocity
        .clone()
        .add(omega.cross(new T.Vector3(0, wheelRadius, 0)));
      assert.ok(contactVelocity.length() < 1e-10, `upper contact slips at arc ${distance}`);
      previousSpin[index] = wheel.rotation.z;
    });
    previousDistance = distance;
  }
  protection.dispose();
});

test("scene picking agrees with index identity and filters clipped hits", () => {
  const steel = new T.MeshStandardMaterial();
  const front = new T.Mesh(new T.BoxGeometry(3, 3, 0.1), steel);
  front.position.z = 2;
  const back = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), steel);
  back.position.z = 0;
  const root = new T.Group();
  root.add(front, back);
  root.updateMatrixWorld(true);
  const inspector = new InspectionController(
    new Map([
      ["structure.shell", [front]],
      ["lvhf.passant.04", [back]],
    ]),
  );
  const camera = new T.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
  } as HTMLCanvasElement;
  assert.equal(inspector.pick(500, 500, camera, canvas, false), "structure.shell");
  const selected = inspector.pick(500, 500, camera, canvas, true);
  assert.equal(selected, "lvhf.passant.04");
  inspector.select(selected);
  assert.equal(inspector.selection, "lvhf.passant.04");
  inspector.isolate("lvhf.passant.04");
  front.visible = true;
  inspector.sync();
  assert.equal(front.visible, false, "LOD visibility changes cannot escape isolation");
  inspector.restore();
  assert.equal(front.visible, true);
  inspector.dispose();
  front.geometry.dispose();
  back.geometry.dispose();
  steel.dispose();
});

test("connector and rope meet at a tangent plane without bow penetration through the circuit", () => {
  const y = SILO_CONFIG.ringY.value,
    r = SILO_CONFIG.ringRadius.value + SILO_CONFIG.trolleyEyeRadialOffset.value;
  const protection = createProtection([0, y - 0.094, r], 0.95);
  const rope = protection.bindings.get("lvhf.rope")![0] as T.Mesh;
  const termination = protection.bindings.get("lvhf.rope")![1] as T.Mesh;
  for (const angle of [0, 0.2, Math.PI / 2, Math.PI, Math.PI * 2 - 1e-8, -0.5])
    for (const relative of [
      [0, -0.3, -0.8],
      [0.14, -0.34, -0.78],
      [-0.14, -0.5, -0.75],
      [0, -0.91, 0],
    ]) {
      const anchor = new T.Vector3(Math.sin(angle) * r, y - 0.094, Math.cos(angle) * r);
      const delta = new T.Vector3()
        .fromArray(relative)
        .applyAxisAngle(new T.Vector3(0, 1, 0), angle);
      const harness = anchor.clone().add(delta);
      protection.update(harness, 0, true, anchor, angle * SILO_CONFIG.ringRadius.value);
      protection.root.updateMatrixWorld(true);
      const bowContact = new T.Vector3(),
        ropeContact = new T.Vector3();
      let minimumBowY = Infinity;
      for (const object of protection.bindings.get("lvhf.connector")!) {
        const mesh = object as T.Mesh,
          p = mesh.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const v = new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          if (v.y < minimumBowY) {
            minimumBowY = v.y;
            bowContact.copy(v);
          }
          assert.ok(
            v.y >= anchor.y - 0.047 - 0.000003,
            "every connector vertex lies above the lower bow tangent plane",
          );
        }
      }
      const capPositions = termination.geometry.getAttribute("position");
      let maximumCapY = -Infinity;
      for (let i = 0; i < capPositions.count; i++) {
        const v = new T.Vector3()
          .fromBufferAttribute(capPositions, i)
          .applyMatrix4(termination.matrixWorld);
        assert.ok(v.y <= minimumBowY + 1e-8, "rounded rope and bow have no area penetration");
        if (v.y > maximumCapY) {
          maximumCapY = v.y;
          ropeContact.copy(v);
        }
      }
      assert.ok(
        bowContact.distanceTo(ropeContact) < 1e-8,
        "rounded rope termination really contacts the bow, including a vertical rope",
      );
      const p = rope.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(p, i);
        assert.ok(
          v.y <= anchor.y - 0.047 + 0.000003,
          "every rope vertex lies below the bow tangent plane, with contact only at the boundary",
        );
      }
      assert.ok(Math.abs(protection.ropeAttachment.distanceTo(anchor) - 0.052) < 1e-8);
      assert.ok(Math.abs(protection.ropeAttachment.x - anchor.x) < 1e-8);
      assert.ok(Math.abs(protection.ropeAttachment.z - anchor.z) < 1e-8);
    }
  protection.dispose();
});

test("vertical connector threads the measured eye without crossing its metal bridge", () => {
  const y = SILO_CONFIG.ringY.value,
    r = SILO_CONFIG.ringRadius.value + SILO_CONFIG.trolleyEyeRadialOffset.value;
  const protection = createProtection([0, y - 0.094, r], 0.95);
  const body = protection.bindings
    .get("lvhf.trolley")!
    .find((object) => (object as T.Mesh).geometry.type === "ExtrudeGeometry") as T.Mesh<
    T.ExtrudeGeometry,
    T.MeshStandardMaterial
  >;
  const side = body.material.side;
  body.material.side = T.DoubleSide;
  let edgesChecked = 0;
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 2 - 1e-8]) {
    const anchor = new T.Vector3(Math.sin(angle) * r, y - 0.094, Math.cos(angle) * r);
    protection.update(
      anchor.clone().add(new T.Vector3(0, -0.3, -0.8)),
      0,
      true,
      anchor,
      angle * SILO_CONFIG.ringRadius.value,
    );
    protection.root.updateMatrixWorld(true);
    for (const object of protection.bindings.get("lvhf.connector")!) {
      const mesh = object as T.Mesh,
        positions = mesh.geometry.getAttribute("position"),
        indices = mesh.geometry.index!;
      for (let i = 0; i < indices.count; i += 3) {
        const vertices = [0, 1, 2].map((k) =>
          new T.Vector3()
            .fromBufferAttribute(positions, indices.getX(i + k))
            .applyMatrix4(mesh.matrixWorld),
        );
        for (let edge = 0; edge < 3; edge++) {
          const a = vertices[edge]!,
            b = vertices[(edge + 1) % 3]!,
            direction = b.clone().sub(a),
            length = direction.length();
          if (length < 1e-6) continue;
          const ray = new T.Raycaster(a, direction.normalize(), 1e-6, length - 1e-6);
          assert.equal(
            ray.intersectObject(body, false).length,
            0,
            `connector edge crosses trolley plate at angle ${angle}`,
          );
          edgesChecked++;
        }
      }
    }
  }
  assert.ok(edgesChecked > 5000);
  body.material.side = side;
  protection.dispose();
});

test("floor isolation excludes opaque grain and coincident foundation, then restores both", () => {
  const geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial();
  const floor = new T.Mesh(geometry, material),
    grain = new T.Mesh(geometry, material),
    foundation = new T.Mesh(geometry, material),
    extraction = new T.Mesh(geometry, material);
  const inspector = new InspectionController(
    new Map([
      ["structure.floor", [floor]],
      ["structure.grain", [grain]],
      ["structure.foundation", [foundation]],
      ["structure.extraction", [extraction]],
    ]),
  );
  const record = COMPONENTS.find((item) => item.id === "structure.floor")!;
  assert.ok(
    record.related.includes("structure.grain") && record.related.includes("structure.foundation"),
    "physical relationships remain recorded",
  );
  inspector.isolate("structure.floor");
  assert.equal(floor.visible, true);
  assert.equal(extraction.visible, true);
  assert.equal(grain.visible, false);
  assert.equal(foundation.visible, false);
  grain.visible = foundation.visible = true;
  inspector.sync();
  assert.equal(grain.visible, false);
  assert.equal(foundation.visible, false);
  inspector.restore();
  assert.equal(grain.visible, true);
  assert.equal(foundation.visible, true);
  inspector.dispose();
  geometry.dispose();
  material.dispose();
});

test("external extraction remains rendered and selectable through shell section and isolation", () => {
  const model = createSiloModel();
  model.setView(true, false, false);
  model.setPresentation({ roof: "revealed" });
  model.root.updateMatrixWorld(true);
  const inspector = new InspectionController(model.bindings);
  const bounds = inspector.getBounds("structure.extraction");
  assert.ok(bounds.min.z > 10.5 && bounds.max.z > 12);
  assert.ok(bounds.min.y >= SILO_CONFIG.floorY.value - 1e-7);
  for (const object of model.bindings.get("structure.extraction")!) {
    const mesh = object as T.Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      assert.equal(material.clippingPlanes?.length ?? 0, 0);
  }
  const camera = new T.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 2, 15);
  camera.lookAt(bounds.getCenter(new T.Vector3()));
  camera.updateProjectionMatrix();
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
  } as HTMLCanvasElement;
  assert.equal(inspector.pick(500, 500, camera, canvas, true), "structure.extraction");
  inspector.select("structure.extraction");
  inspector.isolate("structure.extraction");
  inspector.sync();
  for (const object of model.bindings.get("structure.extraction")!) {
    assert.equal(object.visible, true);
    const mesh = object as T.Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      assert.equal(material.clippingPlanes?.length ?? 0, 0, "highlight keeps uncut channel");
  }
  inspector.restore();
  inspector.dispose();
  model.dispose();
});
