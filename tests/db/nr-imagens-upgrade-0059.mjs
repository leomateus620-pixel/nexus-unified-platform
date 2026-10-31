import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";

// Follows the isolated0058 upgrade fixture. Never run against an application database.
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Upgrade0059 requires disposable loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  onnotice: () => {},
});
try {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const migrations = await loadManifest(root);
  assert.equal(migrations[77].path, "drizzle/migrations/0059_nr_imagem_tickets_descartaveis.sql");
  const [{ count }] = await sql`select count(*)::int count from nexus_migrations.applied`;
  assert.equal(count, 77, "This scenario only applies0059 after the dedicated0058 fixture");
  const snapshot = async () =>
    (
      await sql`select
    (select jsonb_agg(to_jsonb(a)order by a.id)from public.nr_arquivos a) arquivos,
    (select jsonb_agg(to_jsonb(r)order by r.id)from public.nr_imagem_representacoes r) representacoes,
    (select jsonb_agg(to_jsonb(o)order by o.id)from storage.objects o) storage_metadata,
    pg_get_functiondef('public.nr_imagem_trabalho_obter(integer)'::regprocedure) legacy_claim,
    pg_get_functiondef('public.nr_imagem_trabalho_obter(integer,text)'::regprocedure) native_claim,
    pg_get_functiondef('public.nr_imagem_trabalho_concluir(uuid,uuid,jsonb)'::regprocedure) conclusion`
    )[0];
  const before = await snapshot();
  const applied = await applyMigrations(sql, migrations.slice(0, 78));
  assert.deepEqual(applied, [migrations[77].path]);
  assert.deepEqual(await snapshot(), before);
  const [{ validator, dispatcher }] = await sql`select
    pg_get_functiondef('public.nr_imagem_worker_validar(text)'::regprocedure) validator,
    pg_get_functiondef('public.nr_imagem_worker_disparar()'::regprocedure) dispatcher`;
  assert.equal(validator.includes("vault.decrypted_secrets"), false);
  assert.equal(dispatcher.includes("nexus_nr_image_worker_token"), false);
  assert.equal((await sql`select count(*)::int n from public.nr_imagem_worker_tickets`)[0].n, 0);
  console.log(
    JSON.stringify({
      suite: "NR image0059 upgrade",
      passed: true,
      assertions: 7,
      migrationCount: 78,
      sha256: migrations[77].sha256,
      originalsJobsAndClaimContractsUnchanged: true,
      permanentVaultTokenUnused: true,
      realManagedNetAclNotClaimed: true,
    }),
  );
} finally {
  await sql.end();
}
