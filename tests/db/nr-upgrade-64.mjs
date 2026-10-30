import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL required");
const options = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
const admin = postgres({ ...options, database: "postgres" }),
  database = `nr_upgrade_${process.pid}`;
const migrations = await loadManifest(process.cwd());
assert.equal(migrations.length, 64);
let sql,
  assertions = 0;
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...options, database });
  const bootstrap = (await readFile("tests/db/bootstrap.sql", "utf8")).replace(
    /^create role anon[^\n]*\n/m,
    "",
  );
  await sql.unsafe(bootstrap);
  assert.equal((await applyMigrations(sql, migrations.slice(0, 62))).length, 62);
  assertions++;
  const org = randomUUID(),
    client = randomUUID(),
    unit = randomUUID(),
    local = randomUUID();
  await sql`insert into public.organizations(id,nome)values(${org},'Upgrade64 isolated')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic upgrade client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic upgrade unit')`;
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag)values(${local},${org},${client},${unit},array['NR33','NR35'],'Synthetic preserved local','61 EFGHIJ')`;
  const before = {
    normas: ["NR33", "NR35"],
    cliente_id: client,
    unidade_id: unit,
    tag: "13A",
    valor: 0,
    sufixos: ["27B", "63CDEFGH"],
    snapshot: { falso: false, nulo: null, descricao: "Acentuação preservada" },
  };
  const after = { ...before, tag: "61 EFGHIJ", snapshot: { ...before.snapshot, medida: "0.00" } };
  const inserted = (
    await sql`insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,motivo,created_at)values(${org},'locais',${local},'importar',${sql.json(before)},${sql.json(after)},'Synthetic immutable audit preserved','2026-01-01T00:00:00Z')returning id,antes,depois,motivo,created_at,public.pet_sha256(jsonb_build_object('antes',antes,'depois',depois))hash`
  )[0];
  const applied = await applyMigrations(sql, migrations);
  assert.equal(applied.length, 2);
  assertions++;
  const result = (
    await sql`select id,antes,depois,motivo,created_at,public.pet_sha256(jsonb_build_object('antes',antes,'depois',depois))hash,normas_contexto,cliente_contexto,unidade_contexto from public.nr_historico where id=${inserted.id}`
  )[0];
  for (const key of ["id", "antes", "depois", "motivo", "created_at", "hash"])
    assert.deepEqual(result[key], inserted[key]);
  assertions++;
  assert.deepEqual(result.normas_contexto, ["NR33", "NR35"]);
  assert.equal(result.cliente_contexto, client);
  assert.equal(result.unidade_contexto, unit);
  assertions++;
  assert.equal((await applyMigrations(sql, migrations)).length, 0);
  assertions++;
  await assert.rejects(
    () => sql`update public.nr_historico set motivo='Forbidden rewrite'where id=${inserted.id}`,
    (e) => e.code === "23514",
  );
  assertions++;
  assert.equal(
    (
      await sql`select public.pet_sha256(jsonb_build_object('antes',antes,'depois',depois))hash from public.nr_historico where id=${inserted.id}`
    )[0].hash,
    inserted.hash,
  );
  assertions++;
  const index = (
    await sql`select count(*)::int n from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname in('nr_historico_cronologia','nr_historico_registro_cronologia','nr_historico_normas_contexto','nr_historico_contexto_cronologia')and i.indisvalid`
  )[0].n;
  assert.equal(index, 4);
  assertions++;
  const generated = (
    await sql`select count(*)::int n from pg_attribute where attrelid='public.nr_historico'::regclass and attname in('normas_contexto','cliente_contexto','unidade_contexto')and attgenerated='s'`
  )[0].n;
  assert.equal(generated, 3);
  assertions++;
  assert.equal((await sql`select count(*)::int n from public.nr_modelo_publicacao_fontes`)[0].n, 0);
  assertions++;
  const ledger =
    await sql`select position,path,sha256 from nexus_migrations.applied order by position`;
  assert.deepEqual(
    [...ledger],
    migrations.map(({ position, path, sha256 }) => ({ position, path, sha256 })),
  );
  assertions++;
  console.log(
    JSON.stringify({
      suite: "Manifest62→64 PostgreSQL upgrade",
      assertions,
      passed: true,
      scope:
        "fresh disposable database; preexisting audit JSON/id/date/hash preserved by generated-column rewrite; immutable trigger retained; new indexes valid; empty publication history; exact ledger; retry no DDL",
    }),
  );
} finally {
  if (sql) await sql.end({ timeout: 2 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end({ timeout: 2 });
}
