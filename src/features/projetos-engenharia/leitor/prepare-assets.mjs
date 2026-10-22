import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "6.4.299";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** Copies versioned library resources only. Never deletes or overwrites a different existing asset. */
export async function preparePdfAssets(packageDirectory, outputDirectory) {
  const metadata = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  if (metadata.name !== "pdfjs-dist" || metadata.version !== VERSION)
    throw new Error(`A preparação exige pdfjs-dist ${VERSION} exata.`);
  const destination = path.resolve(outputDirectory);
  if (
    path.basename(destination) !== VERSION ||
    path.basename(path.dirname(destination)) !== "pdfjs"
  )
    throw new Error("Escolha uma pasta versionada pdfjs/6.4.299.");
  const files = [];
  async function copy(relative) {
    const bytes = await readFile(path.join(packageDirectory, relative));
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    let existing;
    try {
      existing = await readFile(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing && sha(existing) !== sha(bytes))
      throw new Error(`Recurso versionado divergente: ${relative}. Não foi sobrescrito.`);
    if (!existing) await copyFile(path.join(packageDirectory, relative), target);
    files.push({
      path: relative.split(path.sep).join("/"),
      bytes: bytes.byteLength,
      sha256: sha(bytes),
    });
  }
  for (const name of await readdir(packageDirectory))
    if (/^(LICENSE|NOTICE)(\.|$)/i.test(name)) await copy(name);
  for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    for (const name of (await readdir(path.join(packageDirectory, folder))).sort()) {
      // The custom reader never executes PDF JavaScript or imports the scripting sandbox.
      if (name.startsWith("quickjs") || name.endsWith(".map")) continue;
      await copy(path.join(folder, name));
    }
  }
  const manifest = {
    package: "pdfjs-dist",
    version: VERSION,
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  await writeFile(
    path.join(destination, "nexus-assets.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return {
    version: VERSION,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    outputDirectory: destination,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--output") {
    console.error(
      "Uso: node src/features/projetos-engenharia/leitor/prepare-assets.mjs --output public/pdfjs/6.4.299",
    );
    process.exitCode = 1;
  } else {
    preparePdfAssets(path.join(root, "node_modules/pdfjs-dist"), process.argv[3]).then(
      (result) => console.log(JSON.stringify(result)),
      (error) => {
        console.error(error.message);
        process.exitCode = 1;
      },
    );
  }
}
