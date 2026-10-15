import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import validator from "gltf-validator";

// Read-only audit: never joins, flattens, simplifies or moves an articulated rig.
const io = new NodeIO();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceDirectory = "public/models/escada-lc02/people";
const outputDirectory = "public/models/silo-engolfamento";
const lodManifest = JSON.parse(await readFile(`${outputDirectory}/manifest.json`, "utf8"));
const precision = (values) => values.map((value) => Number(value.toFixed(8)));
const summarize = async (path) => {
  const bytes = await readFile(path);
  const document = await io.readBinary(bytes);
  const root = document.getRoot();
  const validation = await validator.validateBytes(bytes, { uri: path });
  assert.equal(validation.issues.numErrors, 0, `${path} must be valid glTF`);
  const accessors = root.listAccessors().map((accessor) => {
    const array = accessor.getArray();
    return {
      name: accessor.getName(),
      type: accessor.getType(),
      count: accessor.getCount(),
      componentType: accessor.getComponentType(),
      sha256: array ? hash(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) : null,
    };
  });
  const nodes = root.listNodes().map((node) => ({
    name: node.getName(),
    translation: precision(node.getTranslation()),
    rotation: precision(node.getRotation()),
    scale: precision(node.getScale()),
    children: node.listChildren().map((child) => child.getName()),
    mesh: node.getMesh()?.getName() ?? null,
    skin: node.getSkin()?.getName() ?? null,
  }));
  const bounds = getBounds(root.listScenes()[0]);
  return {
    path,
    bytes: bytes.length,
    sha256: hash(bytes),
    units: "m",
    axes: "+Y up; +Z front",
    pivot: "source boot support origin; no automatic recentering",
    fidelity: "mesh audited; illustrative human, no manufacturer equipment geometry",
    boundsMetres: {
      min: precision(bounds.min),
      max: precision(bounds.max),
      size: precision(bounds.max.map((value, index) => value - bounds.min[index])),
    },
    meshCount: root.listMeshes().length,
    trianglesAllLODs: root
      .listMeshes()
      .reduce(
        (total, mesh) =>
          total +
          mesh
            .listPrimitives()
            .reduce(
              (subtotal, primitive) =>
                subtotal +
                (primitive.getIndices()?.getCount() ??
                  primitive.getAttribute("POSITION")?.getCount() ??
                  0) /
                  3,
              0,
            ),
        0,
      ),
    materials: root.listMaterials().map((material) => ({
      name: material.getName(),
      metallic: material.getMetallicFactor(),
      roughness: material.getRoughnessFactor(),
      alphaMode: material.getAlphaMode(),
      doubleSided: material.getDoubleSided(),
    })),
    textures: root.listTextures().map((texture) => ({
      name: texture.getName(),
      mimeType: texture.getMimeType(),
      size: texture.getSize(),
      bytes: texture.getImage()?.byteLength ?? 0,
      sha256: texture.getImage() ? hash(texture.getImage()) : null,
    })),
    skins: root.listSkins().map((skin) => ({
      name: skin.getName(),
      joints: skin.listJoints().map((joint) => joint.getName()),
      skeleton: skin.getSkeleton()?.getName() ?? null,
    })),
    animationCount: root.listAnimations().length,
    // NodeIO legitimately reorders accessors on export. Compare content multiset
    // and semantic primitive bindings separately rather than raw array indices.
    nodes,
    accessorDigest: hash(
      JSON.stringify(accessors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))),
    ),
    bindingDigest: hash(
      JSON.stringify(
        root.listMeshes().map((mesh) => ({
          name: mesh.getName(),
          primitives: mesh.listPrimitives().map((primitive) => ({
            indices: primitive.getIndices()
              ? hash(
                  new Uint8Array(
                    primitive.getIndices().getArray().buffer,
                    primitive.getIndices().getArray().byteOffset,
                    primitive.getIndices().getArray().byteLength,
                  ),
                )
              : null,
            attributes: primitive
              .listSemantics()
              .sort()
              .map((semantic) => {
                const array = primitive.getAttribute(semantic).getArray();
                return [
                  semantic,
                  hash(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)),
                ];
              }),
          })),
        })),
      ),
    ),
    validation: {
      errors: validation.issues.numErrors,
      warnings: validation.issues.numWarnings,
      warningCodes: [
        ...new Set(
          validation.issues.messages
            .filter((message) => message.severity === 1)
            .map((message) => message.code),
        ),
      ],
    },
  };
};
const models = [];
for (const variant of ["a", "b"]) {
  const file = `worker-${variant}.glb`;
  const before = await summarize(`${sourceDirectory}/${file}`);
  const after = await summarize(`${outputDirectory}/${file}`);
  assert.equal(
    after.accessorDigest,
    before.accessorDigest,
    `${file}: geometry/weights/inverse binds changed`,
  );
  assert.equal(
    after.bindingDigest,
    before.bindingDigest,
    `${file}: primitive/attribute association changed`,
  );
  let transformMaxDelta = 0;
  assert.equal(after.nodes.length, before.nodes.length, `${file}: node count changed`);
  for (let index = 0; index < before.nodes.length; index++) {
    const a = before.nodes[index],
      b = after.nodes[index];
    for (const property of ["translation", "rotation", "scale"]) {
      for (let axis = 0; axis < a[property].length; axis++)
        transformMaxDelta = Math.max(
          transformMaxDelta,
          Math.abs(a[property][axis] - b[property][axis]),
        );
    }
    const identity = ({ translation, rotation, scale, ...rest }) => rest;
    assert.deepEqual(identity(b), identity(a), `${file}: hierarchy/mesh/skin binding changed`);
  }
  // NodeIO normalizes float32 unit scales during its ordinary writeBinary pass.
  // This observed exporter tolerance is far below one millimetre at human scale.
  assert.ok(
    transformMaxDelta <= 2e-6,
    `${file}: transform drift ${transformMaxDelta} exceeds 2e-6`,
  );
  assert.deepEqual(after.skins, before.skins, `${file}: articulation changed`);
  const lod = lodManifest.models.find((model) => model.variant === variant);
  assert.equal(after.sha256, lod.sha256, `${file}: committed manifest hash drift`);
  models.push({
    variant,
    source: {
      origin: "MakeHuman/MPFB 2.0.17",
      commit: "80919fa4682335c41847f761a4d79dcad4124732",
      license: "CC0-1.0",
      evidence: "docs/escada-lc02/people-assets.md",
      generator: "scripts/escada-lc02/build-people.py",
    },
    before,
    after,
    lod: { nearTriangles: lod.nearTriangles, farTriangles: lod.farTriangles },
    preserved: {
      allAccessorBytes: true,
      primitiveBindings: true,
      hierarchy: true,
      joints: true,
      pivotTolerance: 2e-6,
      transformMaxDelta,
      bakedAnimationsAbsent: after.animationCount === 0,
    },
    reductionBytes: before.bytes - after.bytes,
  });
}
const report = {
  schema: "nexus-silo-assets/2.0.0",
  auditedAt: new Date().toISOString(),
  generator: "scripts/silo-engolfamento/audit-assets.mjs",
  toolVersions: { gltfTransform: "4.5.0", gltfValidator: "2.0.0-dev.3.10" },
  models,
  parametric: {
    source: "src/silo-engolfamento/SiloConfig.ts",
    units: "m",
    axes: "+Y up; angle zero +Z toward +X",
    pivot: "foundation centre",
    resources: [
      "silo",
      "LVHF cable",
      "supports",
      "anchor",
      "tensioner",
      "trolley",
      "connector",
      "rope",
      "rig-linked harness and PPE",
      "grain bulk and soybean instances",
      "environment",
      "offline prefiltered original neutral CubeUV environment map",
    ],
    sourceReference: "https://lvhfinternsilo.pplx.app/#visualizador",
    fidelity:
      "Published dimensions and measured bounds/assembly references from three public GLBs, plus explicitly identified presentation assumptions; no original manufacturer CAD or structural certification",
    textures:
      "Local procedural materials and original neutral environment prefiltered offline at 256px; no remote HDR or stock images",
    externalAssetBytes: 0,
    generators: await Promise.all(
      [
        "SiloConfig.ts",
        "SiloModel.ts",
        "ProtectionSystem.ts",
        "Workers.ts",
        "GrainField.ts",
        "GrainRenderer.ts",
        "Environment.ts",
        "EnvironmentMap.ts",
        "SiloScene.ts",
        "InspectionController.ts",
        "performance.ts",
        "ComponentRegistry.ts",
        "LifeLinePath.ts",
      ].map(async (file) => {
        const sourcePath = `src/silo-engolfamento/${file}`,
          sourceBytes = await readFile(sourcePath);
        return { path: sourcePath, bytes: sourceBytes.length, sha256: hash(sourceBytes) };
      }),
    ),
    bakedEnvironmentMap: {
      ...JSON.parse(
        await readFile(`${outputDirectory}/environment-pmrem-256.manifest.json`, "utf8"),
      ),
      units: "dimensionless linear RGB radiance; not metres",
      axes: "Packed CubeUV convention of Three.js0.186 PMREM; PNG row0 becomes GPU row0",
      pivot: "not applicable to a prefiltered environment texture",
      runtimeTriangles: 0,
      textureCount: 1,
    },
  },
  unavailable: {
    manufacturerCAD:
      "No original STEP/project CAD or engineering certification. Three public reference GLBs were subsequently audited read-only in TEMP; redistribution licence remains unverified and binaries are not included in runtime. See docs/silo-engolfamento/evidence/reference-assets-audit.json",
    attachedImages:
      "IMG_0183(2).png, IMG_0184.jpeg, IMG_0185.png, IMG_0187.png and IMG_0188.png not received in workspace/top-level Downloads",
    unrelatedCAD:
      "Existing 3tentos assets/industrial/source/3tentos-reconstruction.blend belongs to another visualizer; not used as LVHF CAD",
  },
  externalReferenceAudit: {
    evidence: "docs/silo-engolfamento/evidence/reference-assets-audit.json",
    policy:
      "Public GLBs measured read-only in TEMP; no runtime asset import or redistribution permission inferred",
    assets: JSON.parse(
      await readFile("docs/silo-engolfamento/evidence/reference-assets-audit.json", "utf8"),
    ).assets.map((asset) => ({
      name: asset.name,
      url: asset.url,
      bytes: asset.bytes,
      sha256: asset.sha256,
      triangles: asset.triangles,
      bounds: asset.bounds,
      axes: asset.axes,
      authorisation: asset.authorisation,
    })),
  },
};
await mkdir("docs/silo-engolfamento/evidence/upgrade", { recursive: true });
await writeFile(
  "docs/silo-engolfamento/evidence/upgrade/asset-audit.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  `${outputDirectory}/upgrade-manifest.json`,
  `${JSON.stringify({ ...report, models: models.map(({ before, after, ...rest }) => ({ ...rest, before: { path: before.path, sha256: before.sha256, bytes: before.bytes }, after })) }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    models.map(({ variant, before, after, preserved }) => ({
      variant,
      beforeBytes: before.bytes,
      afterBytes: after.bytes,
      nearTriangles: lodManifest.models.find((model) => model.variant === variant).nearTriangles,
      materials: after.materials.length,
      skins: after.skins.length,
      preserved,
      errors: after.validation.errors,
    })),
    null,
    2,
  ),
);
