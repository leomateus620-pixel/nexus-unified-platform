import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Production output only: a development import graph cannot establish the shipped budget.
const root = path.resolve(".output/public");
const assets = path.join(root, "assets");
const names = await readdir(assets);
const patterns = [/^pdf\.min-.*\.js$/, /^pdf\.worker\.min-.*\.mjs$/, /^renderer\.client-.*\.js$/];
const files = [];
for (const pattern of patterns) {
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`Expected one production reader resource: ${pattern}`);
  const name = matches[0];
  const bytes = await readFile(path.join(assets, name));
  files.push({
    name,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const gzipBytes = files.reduce((total, file) => total + file.gzipBytes, 0);
if (gzipBytes > 700 * 1024)
  throw new Error(`Reader API/worker/renderer exceed 700 KiB gzip: ${gzipBytes}`);
const manifest = JSON.parse(
  await readFile(path.join(root, "pdfjs/6.4.299/nexus-assets.json"), "utf8"),
);
if (manifest.version !== "6.4.299" || manifest.package !== "pdfjs-dist")
  throw new Error("Unexpected reader resource version");
for (const file of manifest.files) {
  const bytes = await readFile(path.join(root, "pdfjs/6.4.299", file.path));
  if (
    bytes.length !== file.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw new Error(`Changed production PDF resource: ${file.path}`);
  if (/quickjs|\.map$/.test(file.path)) throw new Error("Scripting or source maps were published");
}
const serverNames = await readdir(".output/server/_ssr");
const readerServer = serverNames.filter((name) => /^LeitorOriginalPe-.*\.mjs$/.test(name));
if (readerServer.length !== 1) throw new Error("Missing reader SSR boundary");
const serverCode = await readFile(path.join(".output/server/_ssr", readerServer[0]), "utf8");
if (/import\([^)]*(?:renderer\.client|pdf\.min|pdf\.worker)/.test(serverCode))
  throw new Error("Reader client renderer leaked through the SSR boundary");
const report = {
  method:
    "Production Vite/Nitro artifacts; gzip measured individually with Node zlib, no transfer or field-latency claim",
  files,
  gzipBytes,
  maxGzipBytes: 700 * 1024,
  staticResources: {
    version: manifest.version,
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    checksumsMatch: true,
  },
  ssrClientBoundary: true,
  limits:
    "Lazy network behavior, worker execution, CSP at the deployed edge, memory and physical devices require runtime evidence separately",
  success: true,
};
const output = process.env.NEXUS_PE_BUNDLE_EVIDENCE || "docs/ui/evidence/pe-reader-bundle.json";
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({ success: true, gzipBytes, staticFiles: manifest.files.length, output }),
);
