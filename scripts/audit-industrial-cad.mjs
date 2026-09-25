/** Audit decoded, published GLBs against CAD registration and source partitions.
 * Default: versioned inputs only, suitable for a clone/CI without private CAD.
 * --source: additionally verify every occurrence against the local extraction cache.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { Matrix4, Vector3 } from "three";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const tolerance = 0.005;
const numericTolerance = 0.000001;
const sourceMode = process.argv.includes("--source");
const site = read("src/industrial/data/site.json");
const goldens = read("docs/industrial/evidence/cad-source-goldens.json");
const registry = read("assets/industrial/cad/registry-source.json");
const projection = read("assets/industrial/cad/partition-footprints.json");
const generation = read("docs/industrial/evidence/cad-generation.json");
const topology = read("docs/industrial/evidence/cad-export-topology.json");
const report = {
  status: "passed",
  generatedAt: new Date().toISOString(),
  sourceHash: goldens.source.sha256,
  toleranceMeters: tolerance,
  sourceCacheValidated: false,
  files: [],
  partitions: [],
  lod: [],
  siloParts: [],
  siloAxisDistances: [],
  registration: {
    matrixColumnMajorMeters: site.cadRegistration.matrixColumnMajorMeters,
    goldenMaxErrorMeters: 0,
    axisMaxErrorMeters: 0,
  },
  ownership: { sourceOccurrences: 0, uniqueOwners: 0, duplicates: [] },
  errors: [],
  limits:
    "Decoded GLB bounds, partition ownership, metadata, source-derived anchors and LOD envelope agreement. This is not a complete surface-distance, nominal-dimension, triangle-intersection or performance certification. Default mode uses versioned source evidence; --source also checks the local original-CAD extraction manifest.",
};
const check = (condition, message) => {
  if (!condition) report.errors.push(message);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const boundError = (a, b) =>
  Math.max(...["min", "max"].flatMap((k) => a[k].map((v, i) => Math.abs(v - b[k][i]))));
const finiteBounds = (b) =>
  b && [...b.min, ...b.max].every(Number.isFinite) && b.min.every((v, i) => v <= b.max[i]);
const columnMajor = (matrix) => matrix[0].flatMap((_, c) => matrix.map((row) => row[c]));
const registration = new Matrix4().fromArray(site.cadRegistration.matrixColumnMajorMeters);
const transformPoint = (p) => new Vector3(...p).applyMatrix4(registration).toArray();
const transformBounds = (bounds) => {
  const vertices = [];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) vertices.push(transformPoint([x, y, z]));
  return {
    min: [0, 1, 2].map((i) => Math.min(...vertices.map((p) => p[i]))),
    max: [0, 1, 2].map((i) => Math.max(...vertices.map((p) => p[i]))),
  };
};
const union = (bounds) => ({
  min: [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i]))),
  max: [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i]))),
});
const includes = (binding, p) =>
  binding.sourcePaths.some((s) => p === s || p.startsWith(s + "/")) &&
  !binding.excludedPaths.some((s) => p === s || p.startsWith(s + "/"));
const cadElements = site.elements.filter((e) => e.cad);
const byId = new Map(site.elements.map((e) => [e.id, e]));
const sourceNodes = new Map(registry.nodes.map((n) => [n.path, n]));
const getPartitionBounds = (binding) => {
  const bounds = [];
  const visit = (p) => {
    if (binding.excludedPaths.some((s) => p === s || p.startsWith(s + "/"))) return;
    const n = sourceNodes.get(p);
    if (!n) throw new Error(`Missing versioned source bounds: ${p}`);
    if (binding.excludedPaths.some((s) => s.startsWith(p + "/"))) n.children.forEach(visit);
    else bounds.push({ min: n.min, max: n.max });
  };
  binding.sourcePaths.forEach(visit);
  return transformBounds(union(bounds));
};

check(
  site.cadRegistration.source.sha256 === report.sourceHash,
  "Site registration source hash differs from independently extracted goldens",
);
check(
  registry.source.sha256 === report.sourceHash &&
    projection.sourceHash === report.sourceHash &&
    generation.sourceHash === report.sourceHash,
  "Versioned source/generation hashes disagree",
);
check(
  topology.status === "passed" &&
    topology.sourceHash === report.sourceHash &&
    topology.generationSha256 ===
      createHash("sha256")
        .update(fs.readFileSync(path.join(root, "docs/industrial/evidence/cad-generation.json")))
        .digest("hex"),
  "Blender topology inspection is missing or refers to another generation",
);
check(
  site.cadRegistration.vertexScale === 0.001 && site.cadRegistration.registrationScale === 1,
  "CAD unit conversion or real scale changed",
);
check(
  Math.abs(registration.determinant() - 1) < 1e-10,
  "Registration contains reflection, non-unit scale or a singular transform",
);
check(
  same(
    site.cadRegistration.matrixColumnMajorMeters.slice(0, 12),
    [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0],
  ),
  "This audit expects the approved rigid pi-yaw registration; recompute source mesh extrema for another rotation",
);
check(
  same(
    generation.registration.matrixColumnMajorMeters,
    site.cadRegistration.matrixColumnMajorMeters,
  ),
  "Published generation uses another CAD registration",
);
check(
  new Set(site.elements.map((e) => e.id)).size === site.elements.length,
  "Nexus identifiers are not unique",
);
for (const id of [
  "SILO-01",
  "SILO-02",
  "SILO-03",
  "SILO-04",
  "EQ-01",
  "EQ-02",
  "EQ-03",
  "ED-01",
  "ED-02",
  "ED-03",
  "ED-04",
  "ED-05",
  "PV-01",
  "TR-01",
  "TR-02",
  "TR-03",
  "VG-01",
  "VG-02",
  "CE-01",
  "CE-02",
])
  check(byId.has(id), `Lost existing Nexus identity ${id}`);

// Verify the registry independently against the original-CAD extractor's goldens.
for (const g of [...goldens.roots, ...goldens.metrics]) {
  const n = sourceNodes.get(g.sourceInstancePath);
  check(Boolean(n), `Missing golden source instance ${g.sourceInstancePath}`);
  if (!n) continue;
  const error = boundError({ min: n.min, max: n.max }, g.boundsMeters);
  report.registration.goldenMaxErrorMeters = Math.max(
    report.registration.goldenMaxErrorMeters,
    error,
  );
  check(
    error <= numericTolerance,
    `Registry bounds differ from original CAD: ${g.sourceInstancePath} (${error} m)`,
  );
  const gm = columnMajor(g.worldMatrixMeters);
  check(
    n.worldMatrixCadMeters.every((v, i) => Math.abs(v - gm[i]) <= numericTolerance),
    `Registry matrix differs from original CAD: ${g.sourceInstancePath}`,
  );
}
for (const g of goldens.silos) {
  const e = cadElements.find((x) => x.cad.sourceObjectId === g.sourceParentObjectId);
  check(Boolean(e), `Missing silo source root ${g.sourceParentObjectId}`);
  if (!e) continue;
  const axis = transformPoint(g.axisAtBaseMeters);
  const error = Math.max(...axis.map((v, i) => Math.abs(v - e.anchors.base[i])));
  report.registration.axisMaxErrorMeters = Math.max(report.registration.axisMaxErrorMeters, error);
  check(error <= numericTolerance, `Silo axis transformed incorrectly: ${e.id}`);
  check(
    Math.abs(e.geometry.radius * 2 - g.bodyOuterRadialEnvelopeDiameterMeters) <= numericTolerance,
    `Silo radial envelope changed: ${e.id}`,
  );
  check(
    Math.abs(e.anchors.top[1] - (g.assemblyTopYMeters - site.cadRegistration.sourceGroundY)) <=
      numericTolerance,
    `Silo top elevation changed: ${e.id}`,
  );
}

const occurrences = new Map(Object.entries(generation.occurrenceOwners));
report.ownership.sourceOccurrences = occurrences.size;
report.ownership.uniqueOwners = new Set(occurrences.values()).size;
for (const [p, id] of occurrences) {
  const candidates = cadElements.filter((e) => includes(e.cad, p));
  if (candidates.length > 1)
    report.ownership.duplicates.push({ path: p, owners: candidates.map((e) => e.id) });
  check(
    candidates.length === 1 && candidates[0].id === id,
    `Invalid or duplicated CAD occurrence owner ${p}`,
  );
}
for (const e of cadElements) {
  check(
    e.cad.renderOwnerId === e.id,
    `Render ownership no longer preserves Nexus identity: ${e.id}`,
  );
  const projected = projection.partitions.find((p) => p.id === e.id);
  check(
    projected &&
      same(projected.sourcePaths, e.cad.sourcePaths) &&
      same(projected.excludedPaths, e.cad.excludedPaths),
    `Stale projected footprint partition: ${e.id}`,
  );
  const count = [...occurrences.values()].filter((id) => id === e.id).length;
  check(
    projected?.sourceOccurrences === count && count > 0,
    `CAD occurrence count differs from vertex projection extraction: ${e.id}`,
  );
  const s = Object.values(registry.structures).find(
    (entry) => entry.sourceObjectId === e.cad.sourceObjectId,
  );
  check(
    s && same(s.matrixColumnMajorMeters, e.cad.worldMatrixCadMeters),
    `Catalog source matrix changed: ${e.id}`,
  );
  if (s) {
    const composed = registration
      .clone()
      .multiply(new Matrix4().fromArray(s.matrixColumnMajorMeters))
      .toArray();
    check(
      composed.every((v, i) => Math.abs(v - e.cad.worldMatrixNexus[i]) <= numericTolerance),
      `Catalog matrix applies registration incorrectly: ${e.id}`,
    );
  }
}

if (sourceMode) {
  const cache = read("assets/industrial/raw/cad/cad-manifest.json");
  check(
    cache.source.sha256 === report.sourceHash,
    "Local extraction cache has a different CAD source hash",
  );
  for (const [p, n] of Object.entries(cache.instances)) {
    if (!cache.objects[String(n.sourceObjectId)]?.geometry) continue;
    const candidates = cadElements.filter((e) => includes(e.cad, p));
    const isTerrain = p.startsWith("build0/1/0:2/");
    check(
      isTerrain ? candidates.length === 0 : candidates.length === 1,
      `Unexpected original-CAD source coverage: ${p}`,
    );
    if (candidates.length === 1)
      check(
        occurrences.get(p) === candidates[0].id,
        `Original CAD occurrence missing from generation: ${p}`,
      );
  }
  for (const e of cadElements) {
    const bounds = Object.entries(cache.instances)
      .filter(([p, n]) => includes(e.cad, p) && cache.objects[String(n.sourceObjectId)]?.geometry)
      .map(([, n]) => n.boundsMeters);
    const error = boundError(transformBounds(union(bounds)), getPartitionBounds(e.cad));
    check(
      error <= numericTolerance,
      `Source extraction partition disagrees with versioned registry: ${e.id} (${error} m)`,
    );
  }
  report.sourceCacheValidated = true;
}

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const decoded = new Map();
for (const sector of ["silos-high", "silos-low", "buildings", "grain-handling", "blockout"]) {
  const file = `public/models/3tentos/${sector}.glb`;
  const bytes = fs.readFileSync(path.join(root, file));
  const doc = await io.read(path.join(root, file));
  const ids = [
    ...new Set(
      doc
        .getRoot()
        .listNodes()
        .map((n) => n.getExtras().elementId)
        .filter(Boolean),
    ),
  ].sort();
  report.files.push({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    ids,
  });
  decoded.set(sector, doc);
  for (const id of ids) check(byId.has(id), `GLB refers to an unknown Nexus ID: ${sector}/${id}`);
}
const parentHasId = (node, id) => {
  for (let p = node.getParentNode(); p; p = p.getParentNode())
    if (p.getExtras().elementId === id) return true;
  return false;
};
const observed = new Map();
const measureReferencedVertices = (nodes, axis) => {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let maxRadius = 0,
    referencedVertices = 0;
  const value = [0, 0, 0],
    point = new Vector3();
  for (const node of nodes) {
    const world = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION");
      if (!positions) continue;
      const indices = primitive.getIndices();
      // Ignore unused accessor vertices: only vertices referenced by rendered faces count.
      const active = indices
        ? new Set(indices.getArray())
        : Array.from({ length: positions.getCount() }, (_, i) => i);
      for (const index of active) {
        positions.getElement(index, value);
        point.fromArray(value).applyMatrix4(world);
        const p = point.toArray();
        for (let k = 0; k < 3; k++) {
          bounds.min[k] = Math.min(bounds.min[k], p[k]);
          bounds.max[k] = Math.max(bounds.max[k], p[k]);
        }
        maxRadius = Math.max(maxRadius, Math.hypot(p[0] - axis[0], p[2] - axis[2]));
        referencedVertices++;
      }
    }
  }
  return { bounds, maxRadius, referencedVertices };
};
const criticalIds = new Set([481, 483, 485, 487, 1509, 3728, 3730, 4118, 906, 910, 4121, 4123]);
for (const e of cadElements) {
  const sectors =
    e.category === "silos"
      ? ["silos-high", "silos-low", "blockout"]
      : [e.category === "buildings" ? "buildings" : "grain-handling", "blockout"];
  const expectedBounds = getPartitionBounds(e.cad);
  check(
    boundError(expectedBounds, e.bounds) <= numericTolerance,
    `Catalog envelope differs from its own source partition: ${e.id}`,
  );
  for (const sector of sectors) {
    const doc = decoded.get(sector);
    const roots = doc
      .getRoot()
      .listNodes()
      .filter((n) => n.getExtras().elementId === e.id && !parentHasId(n, e.id));
    check(
      roots.length === 1,
      `Expected one CAD identity root, got ${roots.length}: ${sector}/${e.id}`,
    );
    if (roots.length !== 1) continue;
    const node = roots[0],
      extras = node.getExtras();
    check(
      extras.placement === "baked-nexus-meters",
      `Placement contract missing: ${sector}/${e.id}`,
    );
    check(
      extras.cadSourceHash === report.sourceHash &&
        extras.sourceInstancePath === e.cad.sourceInstancePath,
      `CAD provenance missing or stale in GLB: ${sector}/${e.id}`,
    );
    let triangles = 0;
    node.traverse((n) => {
      for (const p of n.getMesh()?.listPrimitives() ?? []) {
        check(
          n.getExtras().elementId === e.id,
          `Child mesh lost identity: ${sector}/${n.getName()}`,
        );
        check(p.getMode() === 4, `Unexpected nontriangle CAD primitive: ${sector}/${e.id}`);
        triangles +=
          (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3;
      }
    });
    const bounds = getBounds(node);
    check(
      finiteBounds(bounds) && triangles > 0,
      `Empty or invalid decoded CAD geometry: ${sector}/${e.id}`,
    );
    if (!finiteBounds(bounds)) continue;
    const partitions = generation.partitions.filter((p) => p.id === e.id && p.sector === sector);
    check(partitions.length === 1, `Expected one generation partition report: ${sector}/${e.id}`);
    const generated = partitions[0];
    if (!generated) continue;
    const catalogError = boundError(bounds, e.bounds),
      sourceError = boundError(bounds, expectedBounds),
      generationError = boundError(bounds, generated.bounds);
    check(
      catalogError <= tolerance && sourceError <= tolerance && generationError <= tolerance,
      `Decoded envelope exceeds 5 mm: ${sector}/${e.id} (catalog ${catalogError}, source ${sourceError}, generation ${generationError})`,
    );
    check(
      boundError(generated.targetBounds, expectedBounds) <= numericTolerance,
      `Blender target envelope does not match the original source partition: ${sector}/${e.id}`,
    );
    check(
      generated.maxEnvelopeErrorMeters <= 0.002001,
      `Source simplification exceeds its 2 mm envelope budget: ${sector}/${e.id}`,
    );
    const retained = new Set(generated.sourcePaths),
      omitted = new Set(generated.omittedMicroDetailPaths);
    check(
      retained.size === generated.retainedOccurrences &&
        retained.size === generated.sourcePaths.length,
      `Retained source occurrences repeat: ${sector}/${e.id}`,
    );
    const expectedPaths = [...occurrences].filter(([, owner]) => owner === e.id).map(([p]) => p);
    check(
      expectedPaths.length === generated.sourceOccurrences &&
        extras.cadOccurrenceCount === expectedPaths.length,
      `Source occurrence count mismatch: ${sector}/${e.id}`,
    );
    check(
      expectedPaths.every((p) => retained.has(p) !== omitted.has(p)) &&
        retained.size + omitted.size === expectedPaths.length,
      `Lost or duplicated retained/omitted source path: ${sector}/${e.id}`,
    );
    for (const p of omitted)
      check(
        !criticalIds.has(Number(p.split(":").at(-1))),
        `Critical structural mesh omitted from ${sector}/${e.id}: ${p}`,
      );
    const topologyRows = topology.partitions.filter((p) => p.id === e.id && p.sector === sector);
    check(
      topologyRows.length === 1,
      `Expected one inspected Blender topology record: ${sector}/${e.id}`,
    );
    const topologyRow = topologyRows[0];
    if (topologyRow) {
      check(
        triangles === topologyRow.blenderTriangles &&
          topologyRow.generatedInputTriangles === generated.triangles &&
          triangles +
            topologyRow.omittedDegenerateTriangles +
            topologyRow.omittedDuplicateTriangles ===
            generated.triangles,
        `Triangle count changed beyond independently inspected input topology: ${sector}/${e.id} (${triangles} exported vs ${generated.triangles} input)`,
      );
      for (const omission of topologyRow.sourceOmissions)
        check(
          retained.has(omission.sourceInstancePath),
          `Topology omission belongs to another source partition: ${sector}/${e.id}`,
        );
    }
    observed.set(`${sector}/${e.id}`, bounds);
    if (e.category === "silos") {
      const golden = goldens.silos.find((g) => g.sourceParentObjectId === e.cad.sourceObjectId);
      const axis = transformPoint(golden.axisAtBaseMeters);
      for (const [part, suffix, sourceObjectId, expectedBaseY, expectedTopY, expectedHeight] of [
        [
          "body",
          "zinc",
          3730,
          axis[1],
          axis[1] + golden.bodyEnvelopeHeightMeters,
          golden.bodyEnvelopeHeightMeters,
        ],
        [
          "roof",
          "roof",
          3728,
          transformPoint([0, golden.roofBaseYMeters, 0])[1],
          transformPoint([0, golden.roofTopYMeters, 0])[1],
          golden.roofEnvelopeHeightMeters,
        ],
      ]) {
        // Generator buckets reserve zinc for 3730 and roof for 3728 within each silo.
        // Blockout retains these source-bucket names while using the concrete material.
        const partNodes = [];
        node.traverse((n) => {
          if (n.getMesh() && n.getName().replace(/\.\d+$/, "") === `${e.id}-${suffix}-cad`)
            partNodes.push(n);
        });
        check(partNodes.length === 1, `Expected one ${part} source bucket: ${sector}/${e.id}`);
        if (partNodes.length !== 1) continue;
        for (const primitive of partNodes[0].getMesh().listPrimitives())
          check(
            primitive.getMaterial()?.getName() === (sector === "blockout" ? "concrete" : suffix),
            `Unexpected material in source ${sourceObjectId} bucket: ${sector}/${e.id}`,
          );
        const measured = measureReferencedVertices(partNodes, axis);
        check(
          finiteBounds(measured.bounds) && measured.referencedVertices > 0,
          `Empty ${part} source bucket: ${sector}/${e.id}`,
        );
        const height = measured.bounds.max[1] - measured.bounds.min[1];
        const baseError = Math.abs(measured.bounds.min[1] - expectedBaseY);
        const topError = Math.abs(measured.bounds.max[1] - expectedTopY);
        const heightError = Math.abs(height - expectedHeight);
        check(
          Math.max(baseError, topError, heightError) <= tolerance,
          `Silo ${part} base/top/height exceeds 5 mm: ${sector}/${e.id} (${baseError}, ${topError}, ${heightError} m)`,
        );
        const radialDiameter = measured.maxRadius * 2;
        const radialError =
          part === "body"
            ? Math.abs(radialDiameter - golden.bodyOuterRadialEnvelopeDiameterMeters)
            : undefined;
        if (part === "body")
          check(
            radialError <= tolerance,
            `Silo body radial envelope exceeds 5 mm: ${sector}/${e.id} (${radialError} m)`,
          );
        report.siloParts.push({
          id: e.id,
          sector,
          part,
          sourceObjectId,
          bounds: measured.bounds,
          expectedBaseY,
          expectedTopY,
          heightMeters: height,
          expectedHeightMeters: expectedHeight,
          baseErrorMeters: baseError,
          topErrorMeters: topError,
          heightErrorMeters: heightError,
          ...(part === "body"
            ? {
                outerRadialEnvelopeDiameterMeters: radialDiameter,
                expectedOuterRadialEnvelopeDiameterMeters:
                  golden.bodyOuterRadialEnvelopeDiameterMeters,
                radialDiameterErrorMeters: radialError,
                diameterDefinition: golden.diameterDefinition,
              }
            : {}),
          referencedVertices: measured.referencedVertices,
        });
      }
    }
    report.partitions.push({
      id: e.id,
      sector,
      lod: generated.lod,
      bounds,
      expectedBounds,
      catalogErrorMeters: catalogError,
      sourceErrorMeters: sourceError,
      generationErrorMeters: generationError,
      triangles,
      omittedDegenerateTriangles: topologyRow?.omittedDegenerateTriangles,
      omittedDuplicateTriangles: topologyRow?.omittedDuplicateTriangles,
      sourceOccurrences: expectedPaths.length,
      retainedOccurrences: retained.size,
      omittedMicroDetails: omitted.size,
    });
  }
}
for (const e of cadElements.filter((e) => e.category === "silos")) {
  const high = observed.get(`silos-high/${e.id}`),
    low = observed.get(`silos-low/${e.id}`),
    block = observed.get(`blockout/${e.id}`);
  if (!high || !low || !block) continue;
  const highLowError = boundError(high, low),
    highBlockoutError = boundError(high, block);
  check(
    highLowError <= tolerance && highBlockoutError <= tolerance,
    `Silo LOD/blockout envelope disagreement exceeds 5 mm: ${e.id}`,
  );
  report.lod.push({
    id: e.id,
    highLowErrorMeters: highLowError,
    highBlockoutErrorMeters: highBlockoutError,
  });
}
for (const distance of goldens.siloAxisDistances) {
  const fromGolden = goldens.silos.find((g) => g.reviewId === distance.fromReviewId);
  const toGolden = goldens.silos.find((g) => g.reviewId === distance.toReviewId);
  const from = cadElements.find((e) => e.cad.sourceObjectId === fromGolden.sourceParentObjectId);
  const to = cadElements.find((e) => e.cad.sourceObjectId === toGolden.sourceParentObjectId);
  const actual = Math.hypot(
    from.anchors.base[0] - to.anchors.base[0],
    from.anchors.base[2] - to.anchors.base[2],
  );
  const error = Math.abs(actual - distance.axisDistanceXZMeters);
  check(error <= numericTolerance, `Registered silo distance changed: ${from.id}/${to.id}`);
  report.siloAxisDistances.push({
    from: from.id,
    to: to.id,
    actualMeters: actual,
    expectedMeters: distance.axisDistanceXZMeters,
    errorMeters: error,
  });
}
for (const e of cadElements.filter((e) => e.bounds.max[1] < 2 && e.bounds.min[1] < -1)) {
  const b = observed.get(`blockout/${e.id}`);
  check(
    b && b.min[1] < -1 && Math.abs(b.min[1] - e.bounds.min[1]) <= tolerance,
    `Underground geometry was flattened or lost: ${e.id}`,
  );
}
if (report.errors.length) report.status = "failed";
fs.writeFileSync(
  path.join(root, "docs/industrial/evidence/cad-glb-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      partitions: report.partitions.length,
      lod: report.lod.length,
      siloParts: report.siloParts.length,
      siloAxisDistances: report.siloAxisDistances.length,
      sourceCacheValidated: report.sourceCacheValidated,
      maxDecodedEnvelopeErrorMeters: Math.max(
        0,
        ...report.partitions.map((p) => p.sourceErrorMeters),
      ),
      errors: report.errors,
    },
    null,
    2,
  ),
);
if (report.errors.length) process.exitCode = 1;
