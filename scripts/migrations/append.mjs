import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqlChecksum, validateManifest } from "./manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "scripts/migrations/manifest.json");

try {
  const files = process.argv.slice(2);
  if (!files.length)
    throw new Error(
      "Uso: node scripts/migrations/append.mjs drizzle/migrations/0012_nome.sql [...]",
    );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const migrationPath of files) {
    if (!/^drizzle\/migrations\/[0-9]{4}_[A-Za-z0-9_-]+\.sql$/.test(migrationPath)) {
      throw new Error(
        `Novas migrações devem seguir a trilha Drizzle append-only: ${migrationPath}`,
      );
    }
    if (manifest.migrations.some((entry) => entry.path === migrationPath)) {
      throw new Error(`Migração já inscrita: ${migrationPath}`);
    }
    const source = await readFile(path.join(root, migrationPath), "utf8");
    manifest.migrations.push({ path: migrationPath, sha256: sqlChecksum(source) });
  }
  await validateManifest(root, manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Inscritas ao final do manifesto: ${files.join(", ")}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
