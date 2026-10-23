import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadManifest, pendingMigrations, sqlChecksum } from "./manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nexus-migration-unit-"));
  try {
    await Promise.all(
      ["supabase/migrations", "drizzle/migrations", "scripts/migrations"].map((name) =>
        mkdir(path.join(directory, name), { recursive: true }),
      ),
    );
    const migrationPath = "drizzle/migrations/0012_test.sql";
    const source = "select 1;\n";
    const entry = { path: migrationPath, sha256: sqlChecksum(source) };
    await writeFile(path.join(directory, migrationPath), source);
    const setManifest = (entries) =>
      writeFile(
        path.join(directory, "scripts/migrations/manifest.json"),
        JSON.stringify({ version: 1, migrations: entries }),
      );
    await setManifest([entry]);
    await run({ directory, entry, migrationPath, setManifest });
  } finally {
    // mkdtemp returned this dedicated directory; no computed project paths are removed.
    await rm(directory, { recursive: true, force: true });
  }
}

test("manifesto real contém 18 Supabase antes de 12 Drizzle históricas", async () => {
  const migrations = await loadManifest(root);
  assert.equal(
    migrations.slice(0, 18).every((entry) => entry.path.startsWith("supabase/")),
    true,
  );
  assert.equal(
    migrations.slice(18, 30).every((entry) => entry.path.startsWith("drizzle/")),
    true,
  );
  assert.equal(
    migrations[29].path,
    "drizzle/migrations/0011_ordens_idempotencia_contexto_trava_revisao.sql",
  );
  assert.ok(migrations.length >= 30);
});

test("hash é igual para checkout CRLF e LF, e muda com SQL diferente", () => {
  assert.equal(sqlChecksum("select 1;\r\n"), sqlChecksum("select 1;\n"));
  assert.notEqual(sqlChecksum("select 1;\n"), sqlChecksum("select 2;\n"));
});

test("edição de migração publicada é rejeitada", async () => {
  await fixture(async ({ directory, migrationPath }) => {
    await writeFile(path.join(directory, migrationPath), "select 2;\n");
    await assert.rejects(loadManifest(directory), /Checksum divergente/);
  });
});

test("SQL novo não pode ser aplicado sem inscrição explícita", async () => {
  await fixture(async ({ directory }) => {
    await writeFile(path.join(directory, "drizzle/migrations/0013_unregistered.sql"), "select 3;");
    await assert.rejects(loadManifest(directory), /Migrações sem manifesto/);
  });
});

test("manifesto rejeita duplicação e caminhos fora das pastas SQL", async () => {
  await fixture(async ({ directory, entry, setManifest }) => {
    await setManifest([entry, entry]);
    await assert.rejects(loadManifest(directory), /duplicada/);
    await setManifest([{ ...entry, path: "../../outside.sql" }]);
    await assert.rejects(loadManifest(directory), /Entrada inválida/);
  });
});

test("migração não pode terminar a transação do ledger", async () => {
  await fixture(async ({ directory, migrationPath, entry, setManifest }) => {
    const source = "select 1;\nCOMMIT;\n";
    await writeFile(path.join(directory, migrationPath), source);
    await setManifest([{ ...entry, sha256: sqlChecksum(source) }]);
    await assert.rejects(loadManifest(directory), /Controle de transação/);
  });
});

test("upgrade retorna apenas sufixo pendente; retry não retorna SQL", async () => {
  const migrations = await loadManifest(root);
  const applied = migrations.map(({ path: migrationPath, sha256, position }) => ({
    path: migrationPath,
    sha256,
    position,
  }));
  assert.equal(pendingMigrations(migrations, applied.slice(0, 18)).length, migrations.length - 18);
  assert.deepEqual(pendingMigrations(migrations, applied), []);
  assert.equal(pendingMigrations(migrations, []).length, migrations.length);
});

test("drift, lacuna, reordenação e migração desconhecida no ledger bloqueiam upgrade", async () => {
  const migrations = await loadManifest(root);
  const first = { ...migrations[0] };
  assert.throws(
    () => pendingMigrations(migrations, [{ ...first, sha256: "0".repeat(64) }]),
    /Drift/,
  );
  assert.throws(() => pendingMigrations(migrations, [{ ...first, position: 2 }]), /Drift/);
  assert.throws(() => pendingMigrations(migrations, [migrations[1]]), /Drift/);
  assert.throws(() => pendingMigrations([], [first]), /desconhecidas/);
});

test("arquivos históricos permanecem fora de duplicação nas duas trilhas", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "scripts/migrations/manifest.json"), "utf8"),
  );
  const hashes = manifest.migrations.slice(0, 30).map((entry) => entry.sha256);
  assert.equal(new Set(hashes).size, hashes.length);
});
