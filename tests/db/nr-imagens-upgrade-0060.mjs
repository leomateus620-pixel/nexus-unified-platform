import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Upgrade0060 requires disposable loopback PostgreSQL");
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
  assert.equal(migrations[78].path, "drizzle/migrations/0060_nr_imagem_runtime_nexus.sql");
  assert.equal((await sql`select count(*)::int n from nexus_migrations.applied`)[0].n, 78);
  assert.equal((await sql`select to_regnamespace('vault')is null clean`)[0].clean, true);
  await sql.unsafe(
    "create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text);insert into vault.decrypted_secrets values('nexus_nr_image_worker_url','');",
  );
  await sql`insert into public.nr_imagem_worker_tickets(ticket_sha256,expira_em,consumido_em)
    values(${"1".repeat(64)},clock_timestamp()+interval'120 seconds',null),
      (${"2".repeat(64)},clock_timestamp()+interval'120 seconds',clock_timestamp())`;
  const snapshot = async () =>
    (
      await sql`select
    (select jsonb_agg(to_jsonb(a)order by a.id)from public.nr_arquivos a) arquivos,
    (select jsonb_agg(to_jsonb(r)order by r.id)from public.nr_imagem_representacoes r) representacoes,
    (select jsonb_agg(to_jsonb(t)order by t.ticket_sha256)from public.nr_imagem_worker_tickets t) tickets,
    (select jsonb_agg(to_jsonb(o)order by o.id)from storage.objects o) storage_metadata,
    (select jsonb_agg(to_jsonb(s)order by s.nome)from public.scheduler_configuracao s) scheduler,
    (select jsonb_agg(to_jsonb(v)order by v.name)from vault.decrypted_secrets v) vault_hold,
    pg_get_functiondef('public.nr_imagem_trabalho_obter(integer)'::regprocedure) legacy_claim,
    pg_get_functiondef('public.nr_imagem_trabalho_obter(integer,text)'::regprocedure) native_claim,
    pg_get_functiondef('public.nr_imagem_worker_validar(text)'::regprocedure) validator,
    pg_get_functiondef('public.nr_imagem_trabalho_concluir(uuid,uuid,jsonb)'::regprocedure) conclusion,
    pg_get_functiondef('public.nr_imagem_worker_continuar()'::regprocedure) callback,
    (select to_jsonb(proacl)from pg_proc where oid='public.nr_imagem_worker_disparar()'::regprocedure) dispatcher_acl`
    )[0];
  const before = await snapshot();
  const originalDefinition = (
    await sql`select pg_get_functiondef('public.nr_imagem_worker_disparar()'::regprocedure) source`
  )[0].source;
  const oldUrl = "https://yhtgijtllvgzoqtfcgal.supabase.co/functions/v1/nr-image-worker";
  const newUrl = "https://nexusgestao.app/api/public/nr/image-worker";
  assert.equal(originalDefinition.split(oldUrl).length, 2);
  const applied = await applyMigrations(sql, migrations.slice(0, 79));
  assert.deepEqual(applied, [migrations[78].path]);
  assert.deepEqual(await snapshot(), before);
  const currentDefinition = (
    await sql`select pg_get_functiondef('public.nr_imagem_worker_disparar()'::regprocedure) source`
  )[0].source;
  assert.equal(
    currentDefinition,
    originalDefinition.replace(oldUrl, newUrl),
    "The complete deployed dispatcher changes only its exact URL literal",
  );
  assert.equal(
    (
      await sql`select decrypted_secret from vault.decrypted_secrets where name='nexus_nr_image_worker_url'`
    )[0].decrypted_secret,
    "",
  );
  assert.equal((await sql`select count(*)::int n from public.nr_imagem_worker_tickets`)[0].n, 2);
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_imagem_representacoes where processador='nexus-storage-transform-v1'`
    )[0].n,
    0,
  );
  await sql.unsafe("drop schema vault cascade;");
  await sql`delete from public.nr_imagem_worker_tickets where ticket_sha256 in(${"1".repeat(64)},${"2".repeat(64)})`;
  console.log(
    JSON.stringify({
      suite: "NR image0060 upgrade",
      passed: true,
      assertions: 10,
      migrationCount: 79,
      sha256: migrations[78].sha256,
      onlyExactUrlChanged: true,
      originalsJobsTicketsClaimsAclsAndVaultHoldUnchanged: true,
      realRuntimeInvocationProven: false,
    }),
  );
} finally {
  await sql.end();
}
