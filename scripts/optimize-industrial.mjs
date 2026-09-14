import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt, reorder } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import validator from "gltf-validator";
await MeshoptEncoder.ready;
const root = process.cwd(),
  raw = path.join(root, "assets/industrial/raw"),
  out = path.join(root, "public/models/3tentos");
await fs.mkdir(out, { recursive: true });
await fs.mkdir("docs/industrial/evidence", { recursive: true });
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const report = [];
for (const file of (await fs.readdir(raw)).filter((f) => f.endsWith(".glb"))) {
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
  await io.write(path.join(out, file), doc);
  // Validator cannot decompress EXT_meshopt; validate an uncompressed round trip as well.
  const packed = await fs.readFile(path.join(out, file));
  const packedResult = await validator.validateBytes(new Uint8Array(packed), {
    uri: file,
    maxIssues: 100,
  });
  const decoded = await io.read(path.join(out, file));
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
  };
  report.push(record);
  if (record.errors) throw new Error(`Invalid glTF ${file}: ${JSON.stringify(result.issues)}`);
}
await fs.writeFile(
  "docs/industrial/evidence/gltf-validation.json",
  JSON.stringify(report, null, 2),
);
console.log(report.map(({ file, bytes, errors, warnings }) => ({ file, bytes, errors, warnings })));
