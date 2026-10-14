import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import validator from "gltf-validator";

// Copies of the existing CC0 assets. Source models and their stair usage are untouched.
const source = "public/models/escada-lc02/people";
const output = "public/models/silo-engolfamento";
await mkdir(output, { recursive: true });
const io = new NodeIO();
const sourceManifest = JSON.parse(await readFile(`${source}/manifest.json`, "utf8"));
const models = [];
for (const variant of ["a", "b"]) {
  const file = `worker-${variant}.glb`;
  const document = await io.read(`${source}/${file}`);
  const textures = [];
  for (const texture of document.getRoot().listTextures()) {
    const data = texture.getImage();
    if (!data) continue;
    const before = await sharp(data).metadata();
    const resized = await sharp(data)
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    texture.setImage(resized).setMimeType("image/jpeg");
    const after = await sharp(resized).metadata();
    textures.push({
      name: texture.getName(),
      sourceSize: [before.width, before.height],
      size: [after.width, after.height],
      bytes: resized.length,
      sha256: createHash("sha256").update(resized).digest("hex"),
    });
  }
  const bytes = await io.writeBinary(document);
  const validation = await validator.validateBytes(bytes, { uri: file });
  if (validation.issues.numErrors > 0) throw new Error(JSON.stringify(validation.issues));
  await writeFile(`${output}/${file}`, bytes);
  models.push({
    ...sourceManifest.models.find((model) => model.variant === variant),
    sourceFile: `${source}/${file}`,
    sourceSha256: sourceManifest.models.find((model) => model.variant === variant).sha256,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    textures,
    errors: validation.issues.numErrors,
    warnings: validation.issues.numWarnings,
  });
}
await writeFile(
  `${output}/manifest.json`,
  `${JSON.stringify({ license: "CC0-1.0", generator: "scripts/silo-engolfamento/prepare-workers.mjs", upstreamGenerator: sourceManifest.generator, textureLimit: 1024, sourceManifest: `${source}/manifest.json`, models }, null, 2)}\n`,
);
console.log(
  models.map(({ variant, bytes, errors, warnings }) => ({ variant, bytes, errors, warnings })),
);
