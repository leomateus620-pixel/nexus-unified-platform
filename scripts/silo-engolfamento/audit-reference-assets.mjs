import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";

// Read-only measurements of published resources. Binaries remain in TEMP and
// must never be copied to public/ without a verified redistribution licence.
const io = new NodeIO();
const round = (a) => a.map((value) => Number(value.toFixed(8)));
const size = (bounds) => round(bounds.max.map((v, i) => v - bounds.min[i]));
const measureRoof = (root) => {
  let triangles = 0,
    eaveVertexOccurrences = 0,
    minimumRadius = Infinity,
    maximumRadius = 0;
  const eave = new Map();
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute("POSITION"),
        indices = primitive.getIndices();
      if (!positions) continue;
      for (let i = 0; i < (indices?.getCount() ?? positions.getCount()); i += 3) {
        const points = [0, 1, 2].map((offset) =>
          positions.getElement(indices ? indices.getScalar(i + offset) : i + offset, []),
        );
        if (
          Math.max(...points.map((p) => p[1])) <= 24.8751 ||
          Math.min(...points.map((p) => p[1])) < 24.8749
        )
          continue;
        triangles++;
        for (const point of points) {
          const radius = Math.hypot(point[0], point[2]);
          minimumRadius = Math.min(minimumRadius, radius);
          maximumRadius = Math.max(maximumRadius, radius);
          if (Math.abs(point[1] - 24.875) < 0.0001) {
            eaveVertexOccurrences++;
            eave.set(point.join(","), radius);
          }
        }
      }
    }
  return {
    method:
      "Triangles with maxY > 24.8751m and minY >= 24.8749m; rim vertices satisfy abs(Y - 24.875m) < .0001m. Duplicate triangle-corner occurrences are counted separately from unique positions.",
    triangles,
    eaveY: 24.875,
    eaveVertexOccurrences,
    uniqueEavePositions: eave.size,
    eaveRadiusRange: [Math.min(...eave.values()), Math.max(...eave.values())],
    roofRadiusRange: [minimumRadius, maximumRadius],
    interpretation:
      "Measured eave radius is 11.103m. The published 11.32m external assembly envelope is not interpreted as this rim radius or as plate thickness.",
  };
};
const measureEye = (root) => {
  const vertices = new Map();
  for (const primitive of root
    .listMeshes()
    .find((mesh) => mesh.getName() === "corpo")
    .listPrimitives()) {
    const positions = primitive.getAttribute("POSITION");
    for (let i = 0; i < positions.getCount(); i++) {
      const point = positions.getElement(i, []);
      if (Math.abs(point[0]) < 1e-7 && point[2] > -0.095 && point[2] < -0.07)
        vertices.set(point.join(","), point);
    }
  }
  const z = [...vertices.values()].map((point) => point[2]),
    sourceExtremaZ = [Math.min(...z), Math.max(...z)],
    sourceCentreZ = (sourceExtremaZ[0] + sourceExtremaZ[1]) / 2;
  return {
    method:
      "In the body mesh, source centreline vertices abs(X)<1e-7m and -.095m<Z<-.07m delimit the circular hole on both plate faces.",
    sourceVertices: [...vertices.values()],
    sourceExtremaZ,
    sourceCentreZ,
    holeRadius: (sourceExtremaZ[1] - sourceExtremaZ[0]) / 2,
    mountedCentreY: sourceCentreZ - 0.004,
    mountedBearingDatumY: -0.094,
    interpretation:
      "The aperture centre is 86mm below the cable axis, radius 8.5mm; the 94mm lower bearing datum is a separate attachment reference.",
  };
};
const results = [];
for (const name of ["lvhf_silo", "silo_com_chapeu", "trole_passante"]) {
  const file = join(process.env.TEMP ?? "/tmp", `nexus-reference-${name}.glb`);
  const bytes = await readFile(file);
  const sourceJson = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const document = await io.readBinary(bytes),
    root = document.getRoot();
  const bounds = getBounds(root.listScenes()[0]);
  const geometry = (mesh) =>
    mesh
      ?.listPrimitives()
      .reduce(
        (total, p) =>
          total + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3,
        0,
      ) ?? 0;
  results.push({
    name,
    url: `https://lvhfinternsilo.pplx.app/assets/${name}.glb`,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    authorisation:
      "Published URL only. No asset licence or redistribution authorisation found. Audit in TEMP; not included in runtime.",
    generator: sourceJson.asset.generator,
    units: "metres: measured 22.64m silo envelope and 0.105m trolley agree with published scale",
    axes:
      name === "trole_passante"
        ? "Source X travel, Y axle, Z vertical down body. Reference mounting Rx(-90deg), then translation(0,-.004,+.0205). Eye local mounted offset=(0,-.094,+.0155)."
        : "Y up, origin ground centre; all node transforms identity; positions baked in world metres.",
    bounds: { min: round(bounds.min), max: round(bounds.max), size: size(bounds) },
    triangles: root.listMeshes().reduce((n, mesh) => n + geometry(mesh), 0),
    materials: root.listMaterials().map((m) => ({
      name: m.getName(),
      metallic: m.getMetallicFactor(),
      roughness: m.getRoughnessFactor(),
    })),
    textures: root.listTextures().length,
    animations: root.listAnimations().length,
    ...(name === "silo_com_chapeu" ? { roofMeasurement: measureRoof(root) } : {}),
    ...(name === "trole_passante" ? { eyeMeasurement: measureEye(root) } : {}),
    nodes: root.listNodes().map((node) => {
      const b = getBounds(node);
      return {
        name: node.getName(),
        translation: round(node.getTranslation()),
        rotation: round(node.getRotation()),
        scale: round(node.getScale()),
        worldMatrix: round(node.getWorldMatrix()),
        bounds: { min: round(b.min), max: round(b.max), size: size(b) },
        triangles: geometry(node.getMesh()),
      };
    }),
  });
}
const assemblyBytes = await readFile(join(process.env.TEMP ?? "/tmp", "nexus-reference-scene.js"));
const assemblyAudit = {
  url: "https://lvhfinternsilo.pplx.app/scene.js",
  bytes: assemblyBytes.length,
  sha256: createHash("sha256").update(assemblyBytes).digest("hex"),
  policy: "Read-only source inspection; no external source redistributed or imported at runtime.",
  observedTrolleyMount: {
    sourceToYUpRotationXRad: -Math.PI / 2,
    translation: [0, -0.004, 0.0205],
    rollerCentresSource: [
      [-0.0355, 0.0205, -0.017],
      [0.0355, 0.0205, -0.017],
    ],
    rollerRadius: 0.017,
    nominalCableRadius: 0.004,
    mountedEyeOffset: [0, -0.094, 0.0155],
    sourceLineRange: [467, 503],
  },
};
const output = "docs/silo-engolfamento/evidence/reference-assets-audit.json";
await mkdir("docs/silo-engolfamento/evidence", { recursive: true });
await writeFile(
  output,
  `${JSON.stringify({ inspectedAt: "2026-10-15", policy: "Read-only public resource geometry audit, not manufacturer certification or permission to redistribute.", assemblyAudit, assets: results }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      name: r.name,
      bytes: r.bytes,
      triangles: r.triangles,
      bounds: r.bounds,
      nodes: r.nodes.map((n) => ({
        name: n.name,
        translation: n.translation,
        rotation: n.rotation,
        scale: n.scale,
        bounds: n.bounds,
      })),
    })),
    null,
    2,
  ),
);
