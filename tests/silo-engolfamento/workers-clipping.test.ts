import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { NodeIO } from "@gltf-transform/core";
import { createWorkers } from "../../src/silo-engolfamento/Workers";
import { InspectionController } from "../../src/silo-engolfamento/InspectionController";
import { CUT_PLANE_Z } from "../../src/silo-engolfamento/SiloModel";

test("the shared section clips both real rigs and highlight clones while preserving the external watchperson", async () => {
  const assets = new Map<string, Uint8Array>(),
    io = new NodeIO();
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
  globalThis.fetch = async (input) =>
    new Response(assets.get(String(input).includes("worker-a") ? "a" : "b"), { status: 200 });
  try {
    const pool = await createWorkers();
    const inspector = new InspectionController(
      new Map([["lvhf.harness", [pool.getTechnician("A")]]]),
    );
    const materials = (root: T.Object3D) => {
      const result = new Set<T.Material>();
      root.traverse((node) => {
        if (node instanceof T.Mesh)
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) =>
            result.add(m),
          );
      });
      return [...result];
    };
    const watch = pool.root.getObjectByName("Vigia_externo")!;
    const watchMaterials = materials(watch);
    const originals = materials(pool.getTechnician("A"));
    inspector.select("lvhf.harness");
    pool.setCut(true);
    inspector.sync();
    for (const id of ["A", "B"] as const)
      for (const material of materials(pool.getTechnician(id))) {
        assert.equal(material.clippingPlanes?.length, 1);
        assert.equal(material.clippingPlanes![0]!.constant, CUT_PLANE_Z);
        assert.deepEqual(material.clippingPlanes![0]!.normal.toArray(), [0, 0, -1]);
      }
    assert.ok(
      watchMaterials.every((material) => !material.clippingPlanes?.length),
      "watch materials must not inherit technician sections",
    );
    assert.ok(
      originals.every((material) => material.clippingPlanes?.length === 1),
      "retained highlight originals follow the same policy",
    );
    pool.setCut(false);
    inspector.sync();
    assert.ok(
      materials(pool.getTechnician("A")).every((material) => !material.clippingPlanes?.length),
      "first person/prevention can restore the full rig",
    );
    inspector.select(null);
    assert.ok(
      materials(pool.getTechnician("A")).every((material) => !material.clippingPlanes?.length),
      "closing highlight cannot restore stale clipping",
    );
    pool.setCut(true);
    pool.setCut(false);
    assert.ok(watchMaterials.every((material) => !material.clippingPlanes?.length));
    const a = pool.getTechnician("A"),
      b = pool.getTechnician("B");
    const aTransform = a.matrix.clone(),
      bTransform = b.matrix.clone();
    pool.setSupported(true, false);
    assert.equal(a.visible, true);
    assert.equal(b.visible, false, "inspection isolation must not leave unbound B floating");
    pool.setSupported(false, true);
    assert.equal(a.visible, false);
    assert.equal(b.visible, false, "restoring comparison cannot override unavailable support");
    pool.setSupported(false, false);
    pool.setSupported(true, true);
    assert.equal(a.visible, true);
    assert.equal(b.visible, true);
    assert.equal(watch.visible, true, "inspection support policy leaves the external watchperson");
    assert.ok(a.matrix.equals(aTransform) && b.matrix.equals(bTransform));
    inspector.dispose();
    pool.dispose();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
