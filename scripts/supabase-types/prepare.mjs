import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../migrations/executor.mjs";
import { loadManifest, sqlChecksum } from "../migrations/manifest.mjs";
import { localContext } from "./contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { directory, port } = localContext(process.env, process.argv[2]);
const require = createRequire(path.join(root, "package.json"));
const postgres = require("postgres");
const migrations = await loadManifest(root);
const sql = postgres({
  host: "127.0.0.1",
  port,
  username: "postgres",
  password: "",
  ssl: false,
  database: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
try {
  await sql.unsafe(await readFile(path.join(root, "tests/db/bootstrap.sql"), "utf8"));
  const applied = await applyMigrations(sql, migrations);
  const tables = await sql`
    select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f') order by c.relname
  `;
  const columns = await sql`
    select table_name, column_name from information_schema.columns
    where table_schema='public' order by table_name,ordinal_position
  `;
  const functions = await sql`
    select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
    order by p.proname
  `;
  const enums = await sql`
    select t.typname as name from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typtype='e' order by t.typname
  `;
  const [{ server_version }] = await sql`show server_version`;
  // Subsequent introspection connections are read-only; no operational fixture is loaded.
  await sql.unsafe("alter role postgres set default_transaction_read_only=on");
  const manifest = migrations.map(({ path: migrationPath, sha256, position }) => ({
    path: migrationPath,
    sha256,
    position,
  }));
  await writeFile(
    path.join(directory, "schema-provenance.json"),
    JSON.stringify(
      {
        schema: "public",
        server_version,
        manifest,
        manifestHash: sqlChecksum(JSON.stringify(manifest)),
        appliedCount: applied.length,
        tables,
        columns,
        functions,
        enums,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Schema descartável preparado: ${applied.length} migrações; PostgreSQL ${server_version}`,
  );
} finally {
  await sql.end({ timeout: 3 });
}
