import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const migrationDirectories = ["supabase/migrations", "drizzle/migrations"];

// Git may check SQL out with CRLF on Windows. The ledger hashes the same SQL on all hosts.
export function sqlChecksum(source) {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export async function discoverMigrations(root) {
  const groups = await Promise.all(
    migrationDirectories.map(async (directory) =>
      (await readdir(path.join(root, directory)))
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .map((name) => `${directory}/${name}`),
    ),
  );
  return groups.flat();
}

export async function loadManifest(root, manifestPath = "scripts/migrations/manifest.json") {
  const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
  return validateManifest(root, manifest);
}

export async function validateManifest(root, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.migrations)) {
    throw new Error("Manifesto de migrações inválido");
  }
  const actual = await discoverMigrations(root);
  const seen = new Set();
  const migrations = [];
  for (const entry of manifest.migrations) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !/^(supabase|drizzle)\/migrations\/[A-Za-z0-9_-]+\.sql$/.test(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      (entry.nativeVersion !== undefined &&
        (!entry.path.startsWith("supabase/") || !/^[0-9]{14}$/.test(entry.nativeVersion))) ||
      seen.has(entry.path)
    ) {
      throw new Error(`Entrada inválida ou duplicada no manifesto: ${entry?.path}`);
    }
    seen.add(entry.path);
    const source = await readFile(path.join(root, entry.path), "utf8");
    if (sqlChecksum(source) !== entry.sha256) {
      throw new Error(`Checksum divergente: ${entry.path}. Não altere migração publicada.`);
    }
    if (/^\s*(?:begin|commit|rollback|start\s+transaction)\s*;/im.test(source)) {
      throw new Error(`Controle de transação pertence ao runner: ${entry.path}`);
    }
    migrations.push({ ...entry, source, position: migrations.length + 1 });
  }
  const missing = actual.filter((file) => !seen.has(file));
  if (missing.length) {
    throw new Error(
      `Migrações sem manifesto: ${missing.join(", ")}. Acrescente-as ao final do manifesto.`,
    );
  }
  return migrations;
}

export function pendingMigrations(migrations, applied) {
  if (applied.length > migrations.length) throw new Error("Ledger contém migrações desconhecidas");
  for (let index = 0; index < applied.length; index += 1) {
    const expected = migrations[index];
    const found = applied[index];
    if (
      found.position !== index + 1 ||
      found.path !== expected.path ||
      found.sha256 !== expected.sha256
    ) {
      throw new Error(`Drift no ledger na posição ${index + 1}: ${found.path}`);
    }
  }
  return migrations.slice(applied.length);
}
