/** Incrementally apply the approved local CAD registration. Never rebuild the photo base.
 * Usage: node scripts/cad/integrate-site.mjs [--check]
 * Inputs are the audited, compact registry-source.json snapshot; CAD matrices are
 * column-major and already expressed in meters. Geometry vertices still need mm→m.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const siteFile = path.join(root, "src/industrial/data/site.json");
const source = JSON.parse(
  fs.readFileSync(path.join(root, "assets/industrial/cad/registry-source.json"), "utf8"),
);
const site = JSON.parse(fs.readFileSync(siteFile, "utf8"));
const projected = JSON.parse(
  fs.readFileSync(path.join(root, "assets/industrial/cad/partition-footprints.json"), "utf8"),
);
if (projected.sourceHash !== source.source.sha256)
  throw new Error("Projected footprint source hash mismatch");
const projectedById = new Map(projected.partitions.map((p) => [p.id, p]));
const original = structuredClone(site);
const nodeByPath = new Map(source.nodes.map((n) => [n.path, n]));
const structures = new Map(Object.values(source.structures).map((s) => [s.sourceObjectId, s]));
const regId = "3tentos-local-cad-v1";
const round = (n) => (Math.abs(n) < 1e-11 ? 0 : Number(n.toFixed(11)));
const vround = (v) => v.map(round);
const mean = (points) =>
  points[0].map((_, k) => points.reduce((n, p) => n + p[k], 0) / points.length);
const legacy = (e) =>
  e.cad?.legacySnapshot ??
  Object.fromEntries(
    [
      "name",
      "position",
      "rotation",
      "geometry",
      "dimensionStatus",
      "existence",
      "functionStatus",
      "description",
      "assumptions",
      "pending",
    ].map((key) => [key, structuredClone(e[key])]),
  );
const siloLegacy = site.elements.filter((e) => /^SILO-0[1-4]$/.test(e.id)).map(legacy);
const nexusAnchor = site.cadRegistration?.nexusAnchor ?? mean(siloLegacy.map((e) => e.position));
const cadAnchor = mean(source.silos.map((s) => s.bodyCenterAtBaseMeters));
cadAnchor[1] = source.sourceSite.groundReferenceY;
const translation = [
  nexusAnchor[0] + cadAnchor[0],
  nexusAnchor[1] - cadAnchor[1],
  nexusAnchor[2] + cadAnchor[2],
];
const registrationMatrix = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, ...translation, 1];
const convert = (p) =>
  vround([translation[0] - p[0], translation[1] + p[1], translation[2] - p[2]]);
const xz = (p) => [round(translation[0] - p[0]), round(translation[2] - p[1])];
const multiply = (a, b) =>
  Array.from({ length: 16 }, (_, k) => {
    const r = k % 4,
      c = Math.floor(k / 4);
    return round([0, 1, 2, 3].reduce((sum, i) => sum + a[i * 4 + r] * b[c * 4 + i], 0));
  });
const normalizedYaw = (yaw) => round(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
const pathFor = (id) => structures.get(id)?.sourceInstancePath;
const boundsForPaths = (paths, excluded = []) => {
  const selected = [];
  const descend = (p) => {
    if (excluded.some((x) => p === x || p.startsWith(x + "/"))) return;
    const n = nodeByPath.get(p);
    if (!n) throw new Error(`Missing source node ${p}`);
    if (excluded.some((x) => x.startsWith(p + "/"))) n.children.forEach(descend);
    else selected.push(n);
  };
  paths.forEach(descend);
  if (!selected.length) throw new Error("Empty render partition");
  const min = [0, 1, 2].map((i) => Math.min(...selected.map((n) => n.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...selected.map((n) => n.max[i])));
  const a = convert(min),
    b = convert(max);
  return { min: a.map((v, i) => Math.min(v, b[i])), max: a.map((v, i) => Math.max(v, b[i])) };
};
const outerRing = (s) => {
  const f = s.footprintXZ;
  if (f.geojson?.type === "Polygon") return f.geojson.coordinates[0];
  if (f.convexEnvelopeXZ) return f.convexEnvelopeXZ;
  return (
    s.horizontalOBB?.cornersXZ ?? [
      [s.boundsMeters.min[0], s.boundsMeters.min[2]],
      [s.boundsMeters.max[0], s.boundsMeters.min[2]],
      [s.boundsMeters.max[0], s.boundsMeters.max[2]],
      [s.boundsMeters.min[0], s.boundsMeters.max[2]],
    ]
  );
};
const colliderFor = (id) => {
  const s = structures.get(id);
  return {
    kind: "polygon",
    points: outerRing(s).map(xz),
    minY: round(s.boundsMeters.min[1] + translation[1]),
    maxY: round(s.boundsMeters.max[1] + translation[1]),
    sourceInstancePath: s.sourceInstancePath,
  };
};
const unresolved =
  "Identificação operacional e levantamento georreferenciado permanecem UNRESOLVED; o nome exibido é uma convenção técnica baseada no CAD.";
const bind = ({
  id,
  sourceId,
  name,
  paths = [pathFor(sourceId)],
  excluded = [],
  category = "equipment",
  parentId,
  colliderId,
  geometry = {},
  partition,
}) => {
  const s = structures.get(sourceId);
  if (!s) throw new Error(`Missing CAD structure ${sourceId}`);
  const prior = site.elements.find((e) => e.id === id);
  const baseline = prior?.cad ? prior.cad.legacySnapshot : prior && legacy(prior);
  const bounds = boundsForPaths(paths, excluded);
  const center = mean([bounds.min, bounds.max]);
  const reference = colliderId ? convert(structures.get(colliderId).anchorBaseMeters) : center;
  const base = [reference[0], bounds.min[1], reference[2]],
    top = [reference[0], bounds.max[1], reference[2]];
  const size = bounds.max.map((v, i) => round(v - bounds.min[i]));
  const projectedPartition = projectedById.get(id);
  if (
    !projectedPartition ||
    JSON.stringify(projectedPartition.sourcePaths) !== JSON.stringify(paths) ||
    JSON.stringify(projectedPartition.excludedPaths) !== JSON.stringify(excluded)
  )
    throw new Error(`Projected source footprint partition mismatch for ${id}`);
  const entry = {
    ...(prior ?? { id, category, photos: [], assumptions: [], pending: [] }),
    name,
    category: prior?.category ?? category,
    position: vround(base),
    rotation: [0, normalizedYaw((s.rotationRadians?.[1] ?? 0) + Math.PI), 0],
    geometry: { width: size[0], depth: size[2], height: size[1], ...geometry },
    existence: prior?.existence ?? "cad_verified",
    dimensionStatus: "cad_verified",
    functionStatus: "visible",
    description: `${name}. Geometria verificada no CAD, registrada no Nexus por convenção local aprovada; cotas relativas preservadas.`,
    assumptions: [
      "Associação da unidade confirmada pelo usuário. Orientação local escolhida pelos eixos dos silos e pelos setores de moegas, escritório e agrotóxicos; não é registro geográfico.",
      "As dimensões são envelopes da geometria CAD, não capacidades ou dimensões nominais de fabricante.",
    ],
    pending: [unresolved],
    ...(parentId ? { parentId } : {}),
    identification: {
      cadName: s.name,
      technicalIdentifier: `CAD-OBJ-${sourceId}`,
      associationStatus: "HIGH_CONFIDENCE",
      identityStatus: "user_confirmed",
      nameStatus: "technical_convention",
      aliases: [...new Set([baseline?.name, s.name, `CAD-OBJ-${sourceId}`].filter(Boolean))],
    },
    cad: {
      sourceObjectId: sourceId,
      sourceInstancePath: s.sourceInstancePath,
      sourcePaths: paths,
      excludedPaths: excluded,
      worldMatrixCadMeters: s.matrixColumnMajorMeters,
      worldMatrixNexus: multiply(registrationMatrix, s.matrixColumnMajorMeters),
      registrationId: regId,
      renderOwnerId: id,
      renderPartition: partition ?? name,
      associationStatus: "HIGH_CONFIDENCE",
      sourceSha256: source.source.sha256,
      sourceName: s.name,
      geometryFrame: {
        dimensions: "nexus_world_axes",
        rotation: "source_occurrence_root",
        placement: "baked_in_glb",
        note: "width/depth describe the selected parts or envelope along final Nexus world axes; rotation and worldMatrixNexus describe the original occurrence pivot. Do not rotate these world dimensions again or derive an OBB from width/depth plus rotation.",
      },
      ...(baseline ? { legacySnapshot: baseline } : {}),
    },
    bounds,
    anchors: { base: vround(base), center: vround(center), top: vround(top) },
    footprint: {
      kind: "polygon",
      points: projectedPartition.convexHullXZCadMeters.map(xz),
      definition:
        "convex projection of actual vertices owned by this CAD partition; not a ground-contact footprint",
    },
    collider: colliderId
      ? colliderFor(colliderId)
      : { kind: "none", minY: bounds.min[1], maxY: bounds.max[1] },
  };
  if (prior) site.elements[site.elements.indexOf(prior)] = entry;
  else site.elements.push(entry);
  if (id === "ED-04")
    entry.assumptions.push(
      "Aberturas e recessos seguem o CAD. O acabamento de vidro nos seis painéis existentes do escritório reutiliza o material anterior e permanece INFERRED, sem identificação operacional oficial.",
    );
  if (["ED-01", "ED-05"].includes(id))
    entry.assumptions.push(
      "Formas, aberturas e fechamentos de fachada seguem a malha CAD, sem portas ou painéis adicionais.",
    );
  return entry;
};

// IDs are tied to the legacy quadrants; the numbering is not an operational silo number.
const siloAssignments = [];
for (const s of source.silos) {
  const axis = convert(s.bodyCenterAtBaseMeters);
  const right = axis[0] > nexusAnchor[0],
    lower = axis[2] > nexusAnchor[2];
  const id = `SILO-0${(lower ? 2 : 0) + (right ? 2 : 1)}`;
  const e = bind({
    id,
    sourceId: s.sourceParentId,
    name: `Silo ${id.slice(-2)}`,
    category: "silos",
    geometry: {
      radius: s.bodyOuterRadialEnvelopeDiameterMeters / 2,
      bodyHeight: s.bodyEnvelopeHeightMeters,
      coneHeight: s.roofHeightMeters,
      baseHeight: 0,
      baseHeightDefinition:
        "no separate procedural base; CAD body mesh includes its base region, nominal split UNRESOLVED",
      topHeight: round(s.assemblyTopYMeters - s.roofMeshMaxYMeters),
      nominalDiameterStatus: "UNRESOLVED",
      diameterDefinition: "outer_radial_envelope_including_details",
      assemblyHeight: s.assemblyHeightMeters,
      segments: 96,
    },
    partition: "complete silo assembly",
  });
  e.position = axis;
  e.anchors = {
    base: axis,
    center: [axis[0], round((e.bounds.min[1] + e.bounds.max[1]) / 2), axis[2]],
    top: [axis[0], round(s.assemblyTopYMeters + translation[1]), axis[2]],
  };
  e.footprint = {
    kind: "polygon",
    points: s.shellConvexFootprintXZ.map(xz),
    definition: "convex projection of the CAD body mesh; assembly accessories remain in bounds",
  };
  e.collider = {
    kind: "circle",
    center: [axis[0], axis[2]],
    radius: s.bodyOuterRadialEnvelopeDiameterMeters / 2,
    minY: axis[1],
    maxY: round(axis[1] + s.bodyEnvelopeHeightMeters),
    sourceInstancePath: `${e.cad.sourceInstancePath}/2:3727/1:3730`,
  };
  e.pending.push(
    "Diâmetro nominal e separação nominal entre base e chaparia não são determináveis somente pelo envelope CAD.",
    "A correspondência individual dos silos visíveis na Foto D permanece UNRESOLVED; a convenção por quadrante não estabelece uma numeração operacional.",
  );
  siloAssignments.push({
    nexusId: id,
    sourceObjectId: s.sourceParentId,
    sourceAxisMeters: s.bodyCenterAtBaseMeters,
    nexusAxis: axis,
  });
}

bind({
  id: "ED-01",
  sourceId: 480,
  name: "Pavilhão das moegas",
  excluded: [pathFor(487)],
  colliderId: 481,
  geometry: { width: 24.2, depth: 18.3, height: 6, rise: 5.95, roof: "gable" },
  partition: "pavilion architecture, excluding underground hoppers",
});
bind({
  id: "ED-04",
  sourceId: 4120,
  name: "Escritório",
  colliderId: 4123,
  geometry: { width: 7.7, depth: 11.75, height: 2.85, rise: 1, roof: "hip" },
});
bind({
  id: "ED-05",
  sourceId: 903,
  name: "Pavilhão de agrotóxicos",
  colliderId: 906,
  geometry: { width: 10.4, depth: 10.4, height: 6, rise: 1.5, roof: "gable" },
});
bind({ id: "EQ-01", sourceId: 1511, name: "Elevador dos silos", colliderId: 1511 });
bind({
  id: "EQ-02",
  sourceId: 1009,
  name: "Conexões e acessos dos silos",
  excluded: [pathFor(1508), pathFor(1511)],
  partition: "silo assembly connections and access, excluding elevator and underground pit/tunnels",
});
bind({ id: "CAD-HOPPER-PITS", sourceId: 487, name: "Moegas e poços", parentId: "ED-01" });
bind({
  id: "CAD-HOPPER-ELEVATOR-01",
  sourceId: 489,
  name: "Elevador das moegas 01",
  parentId: "ED-01",
  colliderId: 489,
});
bind({
  id: "CAD-HOPPER-ELEVATOR-02",
  sourceId: 505,
  name: "Elevador das moegas 02",
  parentId: "ED-01",
  colliderId: 505,
});
bind({
  id: "CAD-SILO-PIT-TUNNELS",
  sourceId: 1508,
  name: "Poço e túneis dos silos",
  parentId: "EQ-01",
});
bind({
  id: "CAD-HOPPER-CONNECTIONS",
  sourceId: 5,
  name: "Conexões e acessos das moegas",
  parentId: "ED-01",
  excluded: [pathFor(480), pathFor(489), pathFor(505)],
  partition:
    "hopper connections, stairs, platforms and roof equipment; excluding architecture, pits and elevators",
});
bind({
  id: "CAD-WATER-TANK",
  sourceId: 4117,
  name: "Caixa d’água",
  paths: [pathFor(4117), pathFor(4113), pathFor(858)],
  colliderId: 4117,
  geometry: {
    radius: 0.81,
    height: 7.8,
    bodyWidth: 1.62,
    bodyDepth: 1.62,
    bodyHeight: 7.8,
    dimensionDefinition:
      "body dimensions exclude ladder and upper assembly; full assembly uses bounds",
  },
  partition: "water tank with its ladder and superior assembly",
});
bind({
  id: "CAD-OFFICE-ROOF",
  sourceId: 912,
  name: "Conjunto superior da cobertura do escritório",
  parentId: "ED-04",
  category: "buildings",
});

// Preserve unassociated objects and their original geometry. Missing CAD does not erase photo evidence.
for (const id of ["ED-02", "ED-03", "PV-01", "EQ-03"]) {
  const e = site.elements.find((x) => x.id === id);
  const note =
    id === "EQ-03"
      ? "UNRESOLVED: o elemento circular fotográfico não corresponde espacialmente à caixa d’água CAD-OBJ-4117; ambos são preservados como identidades distintas."
      : "UNRESOLVED: não há associação inequívoca com objeto do CAD para este registro fotográfico; preservar identidade e geometria atuais.";
  if (!e.pending.includes(note)) e.pending.push(note);
}
site.version = 2;
const accessRecord = site.elements.find((e) => e.id === "TR-02");
accessRecord.geometry.renderedWidth = 9;
accessRecord.geometry.renderedWidthDefinition =
  "preserved historical procedural width; photo width parameter 7.2 remains estimated, not a CAD correction";
site.calibration = {
  ...site.calibration,
  status: "mixed",
  unitLabel: "metro CAD / base fotográfica estimada",
  source:
    "Estruturas associadas: CAD em milímetros convertido para metros e integrado por convenção local aprovada. Base cartográfica fotográfica preservada, sem calibração geográfica ou altimétrica de campo.",
  measurementEnabled: false,
};
site.terrain.surfaceHeights = {
  site: 0.005,
  yard: 0.08,
  islands: 0.12,
  access: 0.085,
  highway: 0.0875,
  environment: -0.1,
  northSoil: -0.07,
  yardShoulder: 0.04,
};
site.terrain.northSoilEdgeZ = -68;
// Explicitly approved local compatibility corrections; no global cartographic rescale.
const localAdjustments = site.cadRegistration?.localAdjustments ?? {
  status: "user_authorized_local_compatibility",
  trees: [70, 71].map((index) => ({
    index,
    before: structuredClone(site.trees[index]),
    afterPosition: [site.trees[index].position[0], site.trees[index].position[1], 61],
  })),
  fenceOriginalSegment: [
    [-67.04, 62.72],
    [74.24, 65.28],
  ],
  siteOriginalSegment: [
    [91.84, 65.28],
    [-68.16, 62.72],
  ],
  relatedElementId: "CAD-WATER-TANK",
};
for (const correction of localAdjustments.trees) {
  const t = site.trees[correction.index];
  if (
    t.id !== correction.before.id ||
    t.type !== correction.before.type ||
    t.variant !== correction.before.variant
  )
    throw new Error(`Tree identity changed at approved index ${correction.index}`);
  t.position = [...correction.afterPosition];
}
const pointEqual = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const zOnLine = (x, a, b) => round(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
const fenceEnds = localAdjustments.fenceOriginalSegment,
  siteEnds = localAdjustments.siteOriginalSegment;
const fenceAdded = [
  [-63, zOnLine(-63, ...fenceEnds)],
  [-63, 65],
  [-57, 65],
  [-57, zOnLine(-57, ...fenceEnds)],
];
const siteAdded = [
  [-57, zOnLine(-57, ...siteEnds)],
  [-57, 65.5],
  [-63, 65.5],
  [-63, zOnLine(-63, ...siteEnds)],
];
const insertDetour = (points, [a, b], added) => {
  if (added.every((p) => points.some((q) => pointEqual(p, q)))) return;
  const i = points.findIndex(
    (p, k) => pointEqual(p, a) && pointEqual(points[(k + 1) % points.length], b),
  );
  if (i < 0)
    throw new Error(
      "Approved local segment no longer matches; review before changing the boundary",
    );
  points.splice(i + 1, 0, ...added);
};
const fence = site.terrain.fences.find(
  (f) => f.id === "CE-01" && f.points.some((p) => pointEqual(p, fenceEnds[0])),
);
if (!fence) throw new Error("CE-01 front fence is missing");
insertDetour(fence.points, fenceEnds, fenceAdded);
insertDetour(site.terrain.site, siteEnds, siteAdded);
const tankBounds = site.elements.find((e) => e.id === "CAD-WATER-TANK").bounds;
const pad = {
  id: "CAD-WATER-TANK-PAD",
  relatedElementId: "CAD-WATER-TANK",
  material: "concrete",
  height: 0.008,
  points: [
    [tankBounds.min[0] - 0.5, tankBounds.min[2] - 0.5],
    [tankBounds.max[0] + 0.5, tankBounds.min[2] - 0.5],
    [tankBounds.max[0] + 0.5, tankBounds.max[2] + 0.5],
    [tankBounds.min[0] - 0.5, tankBounds.max[2] + 0.5],
  ].map(vround),
};
site.terrain.localPatches ??= [];
const padIndex = site.terrain.localPatches.findIndex((p) => p.id === pad.id);
if (padIndex < 0) site.terrain.localPatches.push(pad);
else site.terrain.localPatches[padIndex] = pad;
localAdjustments.fenceAddedPoints = fenceAdded;
localAdjustments.siteAddedPoints = siteAdded;
localAdjustments.patchId = pad.id;
site.cadRegistration = {
  id: regId,
  status: "local_integration",
  identityStatus: "user_confirmed",
  associationStatus: "HIGH_CONFIDENCE",
  source: { ...source.source, filename: "3dmodel.model", auditFilename: source.source.filename },
  auditInputs: source.auditInputs,
  sourceUnit: "millimeter",
  vertexScale: 0.001,
  registrationScale: 1,
  upAxis: "Y",
  sourceGroundY: source.sourceSite.groundReferenceY,
  groundY: 0,
  localAdjustments,
  cadAnchor: vround(cadAnchor),
  nexusAnchor: vround(nexusAnchor),
  translation: vround(translation),
  rotationRadians: [0, Math.PI, 0],
  matrixColumnMajorMeters: vround(registrationMatrix),
  geographicOrientation: "UNRESOLVED",
  fieldVerticalDatum: "UNRESOLVED",
  registrationDefinition:
    "Local rigid convention: mean of four silo axes retained at original Nexus center, pi yaw agrees with hopper (+Z), office (+X/-Z) and pesticide pavilion (+X/+Z) sectors. No geographic fit or independent survey implied.",
  siloAssignments: siloAssignments.sort((a, b) => a.nexusId.localeCompare(b.nexusId)),
  renderPolicy:
    "CAD world matrices in meters, then this registration exactly once in Blender. React does not transform already placed GLBs. One owner per source instance path; children override only via disjoint excludedPaths.",
  groundCollisionPolicy:
    "Closed outer footprints of building wall meshes preserve no-interior walking; roofs and complete-assembly AABBs are not ground obstacles. Underground assemblies retain negative elevation and do not block their entire horizontal envelopes.",
};

// Validate disjoint partitions against all retained source nodes, including shared numeric object IDs.
const bindings = site.elements.filter((e) => e.cad);
for (const n of source.nodes) {
  const owners = bindings.filter(
    (e) =>
      e.cad.sourcePaths.some((p) => n.path === p || n.path.startsWith(p + "/")) &&
      !e.cad.excludedPaths.some((p) => n.path === p || n.path.startsWith(p + "/")),
  );
  if (owners.length > 1)
    throw new Error(`Duplicate CAD owner ${n.path}: ${owners.map((e) => e.id).join(", ")}`);
}
if (new Set(site.elements.map((e) => e.id)).size !== site.elements.length)
  throw new Error("Duplicate Nexus ID");
for (const key of ["yard", "islands", "access", "highwayX"]) {
  if (JSON.stringify(site.terrain[key]) !== JSON.stringify(original.terrain[key]))
    throw new Error(`Unexpected terrain edit ${key}`);
}
const pointOrderPreserved = (before, after) => {
  let cursor = 0;
  return before.every((p) => {
    const found = after.findIndex((q, i) => i >= cursor && pointEqual(p, q));
    cursor = found + 1;
    return found >= 0;
  });
};
if (!pointOrderPreserved(original.terrain.site, site.terrain.site))
  throw new Error("Original site vertices changed");
original.terrain.fences.forEach((f, i) => {
  if (!pointOrderPreserved(f.points, site.terrain.fences[i].points))
    throw new Error("Original fence vertices changed");
});
site.trees.forEach((t, i) => {
  const expected = structuredClone(original.trees[i]);
  if (i === 70 || i === 71) expected.position[2] = 61;
  if (JSON.stringify(t) !== JSON.stringify(expected))
    throw new Error(`Unexpected vegetation edit at ${i}`);
});
const result = JSON.stringify(site, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (JSON.stringify(site) !== JSON.stringify(original))
    throw new Error("site.json is not up to date with the approved CAD integration");
  console.log(
    `CAD integration is reproducible: ${site.elements.length} IDs, ${bindings.length} CAD bindings, one owner per source partition.`,
  );
} else {
  fs.writeFileSync(siteFile, result);
  console.log(
    `Updated ${site.elements.length} IDs, ${bindings.length} CAD bindings. Original boundary vertices preserved; two approved trees and the local tank pad/fence detour applied.`,
  );
}
