import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt, reorder } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import validator from "gltf-validator";
import { repairIndustrialTangents } from "./repair-industrial-tangents.mjs";
await MeshoptEncoder.ready;
const root = process.cwd(),
  raw = path.join(root, "assets/industrial/raw"),
  out = path.join(root, "public/models/3tentos");
const sectorIndex = process.argv.indexOf("--sectors");
const generation = JSON.parse(
  await fs.readFile(path.join(raw, "generation-manifest.json"), "utf8"),
);
const sectors = new Set(
  sectorIndex >= 0 ? process.argv[sectorIndex + 1].split(",") : generation.sectors,
);
if ([...sectors].some((name) => !generation.sectors.includes(name)))
  throw new Error("Requested sector was not produced by the current generation manifest");
const staging = path.join(raw, "optimized");
await fs.mkdir(staging, { recursive: true });
await fs.mkdir(out, { recursive: true });
await fs.mkdir("docs/industrial/evidence", { recursive: true });
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const report = [];
for (const file of (await fs.readdir(raw)).filter(
  (f) => f.endsWith(".glb") && sectors.has(f.slice(0, -4)),
)) {
  const source = await fs.readFile(path.join(raw, file));
  const doc = await io.read(path.join(raw, file));
  const ids = () =>
    doc
      .getRoot()
      .listNodes()
      .map((n) => n.getExtras().elementId)
      .filter(Boolean)
      .sort();
  const before = ids();
  const tangentRepairs = repairIndustrialTangents(doc);
  await doc.transform(weld(), dedup(), prune({ keepExtras: true }));
  if (file === "terrain.glb") {
    // Millimetric layer offsets must not collapse on a quantization grid spanning
    // the rural surroundings. Lossless compression retains original positions.
    await doc.transform(reorder({ encoder: MeshoptEncoder, target: "size" }));
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  } else
    await doc.transform(
      meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 16 }),
    );
  if (JSON.stringify(before) !== JSON.stringify(ids()))
    throw new Error(`Lost element IDs: ${file}`);
  await io.write(path.join(staging, file), doc);
  // Validator cannot decompress EXT_meshopt; validate an uncompressed round trip as well.
  const packed = await fs.readFile(path.join(staging, file));
  const packedResult = await validator.validateBytes(new Uint8Array(packed), {
    uri: file,
    maxIssues: 100,
  });
  const decoded = await io.read(path.join(staging, file));
  const ext = decoded
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === "EXT_meshopt_compression");
  ext?.dispose();
  const decodedBytes = await io.writeBinary(decoded);
  const result = await validator.validateBytes(decodedBytes, { uri: file, maxIssues: 100 });
  const record = {
    file,
    sourceBytes: source.length,
    bytes: packed.length,
    ids: [...new Set(before)],
    errors: result.issues.numErrors,
    warnings: result.issues.numWarnings,
    packedIssues: packedResult.issues,
    decodedIssues: result.issues,
    tangentRepairs,
    validationStatus: "validated-current-generation",
    validatedAt: new Date().toISOString(),
  };
  report.push(record);
  if (record.errors) throw new Error(`Invalid glTF ${file}: ${JSON.stringify(result.issues)}`);
}
if (report.length !== sectors.size) throw new Error("Incomplete sector export set");
// Validate the complete requested set before promoting any of its files.
for (const record of report)
  await fs.copyFile(path.join(staging, record.file), path.join(out, record.file));
const previous = JSON.parse(
  await fs.readFile("docs/industrial/evidence/gltf-validation.json", "utf8").catch(() => "[]"),
);
const combined = [
  ...previous
    .filter((record) => !sectors.has(record.file.slice(0, -4)))
    .map((record) => ({ ...record, validationStatus: "preserved-asset-prior-validation" })),
  ...report,
].sort((a, b) => a.file.localeCompare(b.file));
await fs.writeFile(
  "docs/industrial/evidence/gltf-validation.json",
  JSON.stringify(combined, null, 2),
);
console.log(report.map(({ file, bytes, errors, warnings }) => ({ file, bytes, errors, warnings })));
