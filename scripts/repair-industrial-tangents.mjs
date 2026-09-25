import { createHash } from "node:crypto";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((value, index) => value - b[index]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (value) => {
  const length = Math.hypot(...value);
  return length > 0 && Number.isFinite(length) ? value.map((x) => x / length) : null;
};
const invalidTangent = (value) =>
  !value.every(Number.isFinite) ||
  Math.abs(Math.hypot(...value.slice(0, 3)) - 1) > 0.001 ||
  Math.abs(value[3]) !== 1;

function geometryHash(doc) {
  const hash = createHash("sha256");
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const attributes = primitive
        .listSemantics()
        .filter((semantic) => semantic !== "TANGENT")
        .sort()
        .map((semantic) => [semantic, primitive.getAttribute(semantic)]);
      attributes.push(["INDICES", primitive.getIndices()]);
      hash.update(JSON.stringify({ mode: primitive.getMode(), attributes: attributes.length }));
      for (const [semantic, accessor] of attributes) {
        hash.update(semantic);
        if (!accessor) {
          hash.update("implicit");
          continue;
        }
        const array = accessor.getArray();
        hash.update(
          JSON.stringify([accessor.getType(), accessor.getNormalized(), array.constructor.name]),
        );
        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
    }
  }
  return hash.digest("hex");
}

/**
 * Repair invalid exported tangent frames without changing source geometry.
 * Blender 4.5 can emit a zero corner tangent on a valid, very narrow triangle;
 * this was reproduced with one CAD triangle and non-degenerate UV coordinates.
 * Valid MikkTSpace tangents are retained. Only invalid corners are reconstructed
 * from an incident UV derivative in double precision, projected onto the stored
 * normal and normalized. A missing usable UV derivative is a hard failure.
 */
export function repairIndustrialTangents(doc) {
  const before = geometryHash(doc);
  const repairs = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const tangent = primitive.getAttribute("TANGENT");
      if (!tangent) continue;
      const invalid = new Set();
      for (let index = 0; index < tangent.getCount(); index++) {
        if (invalidTangent(tangent.getElement(index, []))) invalid.add(index);
      }
      if (!invalid.size) continue;
      const position = primitive.getAttribute("POSITION");
      const normal = primitive.getAttribute("NORMAL");
      const uv = primitive.getAttribute("TEXCOORD_0");
      const indices = primitive.getIndices();
      const indexCount = indices?.getCount() ?? position?.getCount();
      if (
        primitive.getMode() !== 4 ||
        !position ||
        !normal ||
        !uv ||
        indexCount % 3 ||
        [position, normal, uv].some((accessor) => accessor.getCount() !== tangent.getCount())
      ) {
        throw new Error(`Cannot reconstruct tangent frame: ${mesh.getName()}/${primitiveIndex}`);
      }
      const candidates = new Map();
      for (let offset = 0; offset < indexCount; offset += 3) {
        const ids = [0, 1, 2].map((corner) =>
          indices ? indices.getScalar(offset + corner) : offset + corner,
        );
        if (!ids.some((index) => invalid.has(index))) continue;
        const points = ids.map((index) => position.getElement(index, []));
        const texcoords = ids.map((index) => uv.getElement(index, []));
        const e1 = sub(points[1], points[0]);
        const e2 = sub(points[2], points[0]);
        const du1 = texcoords[1][0] - texcoords[0][0];
        const dv1 = texcoords[1][1] - texcoords[0][1];
        const du2 = texcoords[2][0] - texcoords[0][0];
        const dv2 = texcoords[2][1] - texcoords[0][1];
        const determinant = du1 * dv2 - du2 * dv1;
        if (!Number.isFinite(determinant) || determinant === 0 || !unit(cross(e1, e2))) continue;
        const dpdu = e1.map((value, axis) => (value * dv2 - e2[axis] * dv1) / determinant);
        const dpdv = e2.map((value, axis) => (value * du1 - e1[axis] * du2) / determinant);
        for (const index of ids) {
          if (!invalid.has(index)) continue;
          if ((candidates.get(index)?.uvArea ?? 0) >= Math.abs(determinant)) continue;
          const n = unit(normal.getElement(index, []));
          if (!n) continue;
          const tangentDirection = unit(dpdu.map((value, axis) => value - n[axis] * dot(n, dpdu)));
          if (!tangentDirection) continue;
          const handedness = dot(cross(n, tangentDirection), dpdv);
          if (!Number.isFinite(handedness) || handedness === 0) continue;
          candidates.set(index, {
            uvArea: Math.abs(determinant),
            value: [...tangentDirection, handedness < 0 ? -1 : 1],
          });
        }
      }
      // Validate every candidate before mutating even one tangent in this primitive.
      for (const index of invalid) {
        if (!candidates.has(index)) {
          throw new Error(
            `No non-degenerate UV triangle for tangent ${mesh.getName()}/${primitiveIndex}/${index}`,
          );
        }
      }
      let maxLengthError = 0;
      let maxNormalDot = 0;
      for (const index of invalid) {
        tangent.setElement(index, candidates.get(index).value);
        const stored = tangent.getElement(index, []);
        const n = unit(normal.getElement(index, []));
        const lengthError = Math.abs(Math.hypot(...stored.slice(0, 3)) - 1);
        const normalDot = Math.abs(dot(stored, n));
        if (invalidTangent(stored) || Math.max(lengthError, normalDot) > 0.000002) {
          throw new Error(`Tangent is not orthonormal after storage: ${mesh.getName()}/${index}`);
        }
        maxLengthError = Math.max(maxLengthError, lengthError);
        maxNormalDot = Math.max(maxNormalDot, normalDot);
      }
      repairs.push({
        mesh: mesh.getName(),
        primitive: primitiveIndex,
        repairedVertices: invalid.size,
        maxLengthError,
        maxNormalDot,
      });
    }
  }
  const after = geometryHash(doc);
  if (before !== after) throw new Error("Tangent repair changed geometry, UVs, normals or indices");
  return {
    method:
      "Invalid corners only: largest valid incident UV derivative, double precision Gram-Schmidt, bitangent handedness",
    repairedVertices: repairs.reduce((sum, repair) => sum + repair.repairedVertices, 0),
    geometryHashBefore: before,
    geometryHashAfter: after,
    unchangedAttributes: "All attributes except TANGENT, plus indices and primitive mode",
    primitives: repairs,
  };
}
