import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import validator from "gltf-validator";
const root = "public/models/escada-lc02";
const report = [];
for (const name of ["escada-lc02.glb", "people/worker-a.glb", "people/worker-b.glb"]) {
  const bytes = await readFile(`${root}/${name}`);
  const validation = await validator.validateBytes(new Uint8Array(bytes), { uri: name });
  assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  if (name.startsWith("people")) {
    const triangles = { near: 0, far: 0 };
    json.nodes
      .filter((n) => n.mesh !== undefined)
      .forEach((n) => {
        const lod = n.name.startsWith("near_") ? "near" : "far";
        for (const p of json.meshes[n.mesh].primitives)
          triangles[lod] +=
            (json.accessors[p.indices]?.count ?? json.accessors[p.attributes.POSITION].count) / 3;
      });
    assert.ok(triangles.near <= 20000 && triangles.far <= 8000, JSON.stringify(triangles));
    assert.ok(json.skins.length > 0);
    const boneNames = json.nodes.map((n) => n.name);
    for (const bone of [
      "pelvis",
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
    ])
      assert.ok(boneNames.includes(bone));
    const animations = json.animations ?? [];
    assert.equal(
      animations.length,
      0,
      "Gait is driven by actual rendered treads, not baked root motion",
    );
  }
  report.push({
    name,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    validation,
  });
  console.log(
    name,
    validation.issues.numErrors,
    "errors",
    validation.issues.numWarnings,
    "warnings",
  );
}
await mkdir("docs/escada-lc02/evidence/people", { recursive: true });
await writeFile("docs/escada-lc02/evidence/people/assets.json", JSON.stringify(report, null, 2));
