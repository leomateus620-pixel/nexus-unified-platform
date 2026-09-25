import assert from "node:assert/strict";
import test from "node:test";
import { Document, NodeIO } from "@gltf-transform/core";
import validator from "gltf-validator";
import { repairIndustrialTangents } from "../../scripts/repair-industrial-tangents.mjs";

function fixture({ positions, uvs, normals, tangents, indices = [0, 1, 2] }) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type, values) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values.flat())).setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", positions))
    .setAttribute("NORMAL", accessor("VEC3", normals))
    .setAttribute("TEXCOORD_0", accessor("VEC2", uvs))
    .setAttribute("TANGENT", accessor("VEC4", tangents))
    .setIndices(
      doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer),
    );
  doc
    .createScene()
    .addChild(doc.createNode().setMesh(doc.createMesh("fixture").addPrimitive(primitive)));
  return { doc, primitive };
}

test("repairs the real narrow CAD triangle while preserving valid tangents and geometry", async () => {
  // Source 3730, low export triangle 2632: Blender 4.5.10 reproduces a zero
  // third-corner tangent despite nonzero geometric and UV areas.
  const { doc, primitive } = fixture({
    positions: [
      [-7.364377021789551, 14.600000381469727, -2.5217456817626953],
      [-7.361337184906006, 14.600000381469727, -2.5165719985961914],
      [-7.364616394042969, 0.6000000238418579, -2.49385929107666],
    ],
    uvs: [
      [0.31072336435317993, -2.299999952316284],
      [0.3107317388057709, -2.299999952316284],
      [0.31271234154701233, 4.699999809265137],
    ],
    normals: Array.from({ length: 3 }, () => [
      0.8622986674308777, -0.0009999985340982676, -0.5063992142677307,
    ]),
    tangents: [
      [0.5063999891281128, 0, 0.8622999787330627, -1],
      [0.5063999891281128, 0, 0.8622999787330627, -1],
      [0, 0, 0, -1],
    ],
  });
  const tangent = primitive.getAttribute("TANGENT");
  const validBefore = tangent.getArray().slice(0, 8);
  const report = repairIndustrialTangents(doc);
  assert.equal(report.repairedVertices, 1);
  assert.equal(report.geometryHashBefore, report.geometryHashAfter);
  assert.deepEqual(tangent.getArray().slice(0, 8), validBefore);
  // Derive the sign from the actual stored UVs, rather than copying the
  // placeholder sign attached to the invalid exported tangent.
  assert.equal(tangent.getElement(2, [])[3], 1);
  assert.ok(report.primitives[0].maxNormalDot < 0.000002);
  const result = await validator.validateBytes(await new NodeIO().writeBinary(doc));
  assert.equal(result.issues.numErrors, 0);
  assert.equal(repairIndustrialTangents(doc).repairedVertices, 0);
});

test("derives the handedness of mirrored UV coordinates", () => {
  const { doc, primitive } = fixture({
    positions: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    uvs: [
      [0, 0],
      [-1, 0],
      [0, 1],
    ],
    normals: [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ],
    tangents: [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ],
  });
  assert.equal(repairIndustrialTangents(doc).repairedVertices, 3);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(primitive.getAttribute("TANGENT").getElement(i, []), [-1, 0, 0, -1]);
  }
});

test("uses the incident triangle with the largest valid UV area", () => {
  const { doc, primitive } = fixture({
    positions: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 1, 0],
      [-1, 0, 0],
    ],
    uvs: [
      [0, 0],
      [0.01, 0],
      [0, 0.01],
      [1, 0],
      [0, 1],
    ],
    normals: Array.from({ length: 5 }, () => [0, 0, 1]),
    tangents: [[0, 0, 0, 1], ...Array.from({ length: 4 }, () => [1, 0, 0, 1])],
    indices: [0, 1, 2, 0, 3, 4],
  });
  assert.equal(repairIndustrialTangents(doc).repairedVertices, 1);
  assert.deepEqual(primitive.getAttribute("TANGENT").getElement(0, []), [0, 1, 0, 1]);
});

test("rejects a missing UV derivative instead of inventing a tangent", () => {
  const { doc, primitive } = fixture({
    positions: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    uvs: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    normals: [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ],
    tangents: [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ],
  });
  const before = primitive.getAttribute("TANGENT").getArray().slice();
  assert.throws(() => repairIndustrialTangents(doc), /No non-degenerate UV triangle/);
  assert.deepEqual(primitive.getAttribute("TANGENT").getArray(), before);
});
