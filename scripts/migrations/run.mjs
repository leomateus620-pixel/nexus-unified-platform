import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./manifest.mjs";
import { applyMigrations } from "./executor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [command = "--check", ...args] = process.argv.slice(2);

async function main() {
  const through =
    command === "--apply" && args.length === 2 && args[0] === "--through" ? args[1] : null;
  if (!["--check", "--plan", "--apply"].includes(command) || (args.length && !through)) {
    throw new Error(
      "Uso: node scripts/migrations/run.mjs --check|--plan|--apply [--through caminho.sql]",
    );
  }
  const allMigrations = await loadManifest(root);
  const throughIndex = through
    ? allMigrations.findIndex((entry) => entry.path === through)
    : allMigrations.length - 1;
  if (throughIndex < 0) throw new Error(`Migração de destino ausente do manifesto: ${through}`);
  const migrations = allMigrations.slice(0, throughIndex + 1);
  if (command === "--check") {
    console.log(`${migrations.length} migrações: ordem explícita e checksums conferidos`);
    return;
  }
  if (command === "--plan") {
    for (const migration of migrations) {
      console.log(`${migration.position}\t${migration.sha256}\t${migration.path}`);
    }
    return;
  }
  const connectionString = process.env.LOVABLE_DB_MIGRATION_URL;
  if (!connectionString)
    throw new Error("LOVABLE_DB_MIGRATION_URL ausente; nenhum banco foi alterado");
  const { default: postgres } = await import("postgres");
  const sql = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const result = await applyMigrations(sql, migrations);
    // Report only after the encompassing transaction committed successfully.
    console.log(JSON.stringify({ result: "committed", applied: result }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  // PostgreSQL errors can contain row values or credentials. Publish only a code for driver errors.
  console.error(
    error.code
      ? `Migração rejeitada pelo PostgreSQL (${error.code}); transação revertida.`
      : error.message,
  );
  process.exitCode = 1;
});
