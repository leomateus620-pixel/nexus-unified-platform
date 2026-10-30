import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadManifest, sqlChecksum } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
import { migrationEnvelope } from "../../scripts/migrations/connector-batch.mjs";

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
  database = `nr_upgrade66_${process.pid}`;
const all = await loadManifest(process.cwd()),
  migrations = all.slice(0, 66);
assert.equal(migrations.length, 66);
assert.equal(migrations[64].path, "drizzle/migrations/0046_nr_fluxos_completos.sql");
assert.equal(migrations[65].path, "drizzle/migrations/0047_nr_fila_importacao.sql");
let sql,
  assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (error) => error.code === code);
  assertions++;
};
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...options, database });
  const bootstrap = (await readFile("tests/db/bootstrap.sql", "utf8")).replace(
    /^create role anon[^\n]*\n/m,
    "",
  );
  await sql.unsafe(bootstrap);
  check((await applyMigrations(sql, migrations.slice(0, 64))).length, 64);
  const [org, client, unit, local, folder, doc, rev, model, modelVersion, survey] = Array.from(
    { length: 10 },
    randomUUID,
  );
  await sql`insert into public.organizations(id,nome)values(${org},'Upgrade66 isolated')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic preserved client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic preserved unit')`;
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag,aliases,dados)values(${local},${org},${client},${unit},array['NR33','NR35'],'Synthetic preserved local','61 EFGHIJ',array['13A','27B','63CDEFGH'],${sql.json({ valor: 0, falso: false, origem: { geometria: { diametro: null }, texto: "Conteúdo original preservado" } })})`;
  await sql`insert into public.nr_pastas(id,organization_id,cliente_id,unidade_id,normas,titulo)values(${folder},${org},${client},${unit},array['NR33'],'Synthetic preserved folder')`;
  await sql`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,pasta_id,local_id)values(${doc},${org},${client},${unit},array['NR33'],'Synthetic historical document',${folder},${local})`;
  const content = {
    schema_version: 1,
    blocos: [
      { id: "p", tipo: "paragrafo", texto: "Documento emitido na origem; nenhuma aprovação Nexus" },
    ],
  };
  await sql`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,conteudo,snapshot,sha256,estado)values(${rev},${org},${doc},3,${sql.json(content)},${sql.json({ original: true, versao: "03", zeros: [0, "00"], nao_verificado: null })},${"a".repeat(64)},'emitido_origem')`;
  await sql`update public.nr_documentos set revisao_atual_id=${rev},estado='emitido_origem'where id=${doc}`;
  const legacyModel = {
    campos_nao_expostos: true,
    blocos: Array.from({ length: 15 }, (_, i) => ({
      codigo: `B${String(i + 1).padStart(2, "0")}`,
      campos: [],
    })),
  };
  await sql`insert into public.nr_modelos(id,organization_id,normas,tipo,titulo,dados)values(${model},${org},array['NR33'],'levantamento','Synthetic historical15 blocks',${sql.json(legacyModel)})`;
  await sql`insert into public.nr_modelo_versoes(id,organization_id,modelo_id,numero,conteudo,dados,sha256)values(${modelVersion},${org},${model},2,'{"schema_version":1,"blocos":[]}',${sql.json(legacyModel)},${"b".repeat(64)})`;
  await sql`insert into public.nr_levantamentos(id,organization_id,cliente_id,unidade_id,normas,titulo,local_id,modelo_id,modelo_versao_id)values(${survey},${org},${client},${unit},array['NR33'],'Synthetic existing survey',${local},${model},${modelVersion})`;
  await sql`insert into public.nr_respostas(organization_id,levantamento_id,campo_id,valor)values(${org},${survey},'medida','0'),(${org},${survey},'presente','false')`;
  const snapshot = async () =>
    (
      await sql`select
    (select to_jsonb(x)from public.nr_locais x where id=${local})local,
    (select to_jsonb(x)from public.nr_documentos x where id=${doc})documento,
    (select to_jsonb(x)from public.nr_documento_revisoes x where id=${rev})revisao,
    (select to_jsonb(x)from public.nr_modelos x where id=${model})modelo,
    (select to_jsonb(x)from public.nr_modelo_versoes x where id=${modelVersion})modelo_versao,
    (select to_jsonb(x)from public.nr_levantamentos x where id=${survey})levantamento,
    (select jsonb_agg(to_jsonb(x)order by campo_id)from public.nr_respostas x where levantamento_id=${survey})respostas`
    )[0];
  const before = await snapshot(),
    folderBefore = (await sql`select to_jsonb(x)r from public.nr_pastas x where id=${folder}`)[0].r;
  const defs = async () =>
    await sql`select p.proname,pg_get_function_identity_arguments(p.oid)args,md5(pg_get_functiondef(p.oid))hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'pet\_%'order by p.proname,pg_get_function_identity_arguments(p.oid)`;
  const petBefore = [...(await defs())];
  const consultBefore = (
    await sql`select md5(pg_get_functiondef('public.nr_consultar(uuid,text,text,jsonb)'::regprocedure))hash`
  )[0].hash;
  const broken46 = { ...migrations[64], source: migrations[64].source + "\nselect 1/0;\n" };
  broken46.sha256 = sqlChecksum(broken46.source);
  await reject(
    () => sql.unsafe(migrationEnvelope([...migrations.slice(0, 64), broken46], broken46)),
    "22012",
  );
  check(
    (await sql`select count(*)::int n from nexus_migrations.applied`)[0].n,
    64,
    "failed46 does not register a ledger row",
  );
  check(
    (await sql`select to_regclass('public.nr_documento_modelos')is null absent`)[0].absent,
    true,
  );
  check(
    (
      await sql`select count(*)::int n from pg_attribute where attrelid='public.nr_pastas'::regclass and attname='ordem'and not attisdropped`
    )[0].n,
    0,
    "failed46 rolls back table/column creation",
  );
  check(
    (
      await sql`select md5(pg_get_functiondef('public.nr_consultar(uuid,text,text,jsonb)'::regprocedure))hash`
    )[0].hash,
    consultBefore,
    "failed46 rolls back replacement functions",
  );
  check(await snapshot(), before);
  await sql.unsafe(migrationEnvelope(migrations, migrations[64]));
  check((await sql`select count(*)::int n from nexus_migrations.applied`)[0].n, 65);
  const broken47 = { ...migrations[65], source: migrations[65].source + "\nselect 1/0;\n" };
  broken47.sha256 = sqlChecksum(broken47.source);
  await reject(
    () => sql.unsafe(migrationEnvelope([...migrations.slice(0, 65), broken47], broken47)),
    "22012",
  );
  check(
    (await sql`select count(*)::int n from nexus_migrations.applied`)[0].n,
    65,
    "failed47 does not register a ledger row",
  );
  check(
    (
      await sql`select to_regclass('public.nr_import_filas')is null and to_regclass('public.nr_import_fila_itens')is null and to_regclass('public.nr_import_fila_eventos')is null absent`
    )[0].absent,
    true,
    "failed47 rolls back all queue tables",
  );
  check(
    (
      await sql`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname='nr_import_processar'`
    )[0].n,
    0,
    "failed47 rolls back worker and privileges",
  );
  await sql.unsafe(migrationEnvelope(migrations, migrations[65]));
  check((await sql`select count(*)::int n from nexus_migrations.applied`)[0].n, 66);
  check(
    await snapshot(),
    before,
    "64→66 preserves historical source, issued body, survey version and answers exactly",
  );
  check(
    (await sql`select to_jsonb(x)-'ordem'r from public.nr_pastas x where id=${folder}`)[0].r,
    folderBefore,
    "new ordering metadata does not reinterpret old folder identity/version",
  );
  check((await sql`select ordem from public.nr_pastas where id=${folder}`)[0].ordem, 0);
  check(
    [...(await defs())],
    petBefore,
    "every PET function definition remains byte-for-byte equivalent",
  );
  check(
    (await sql`select count(*)::int n from public.nr_modelo_publicacao_fontes`)[0].n,
    0,
    "no technical publication or approval fabricated by upgrade",
  );
  check(
    (await sql`select count(*)::int n from public.nr_import_filas`)[0].n,
    0,
    "no jobs or source fixtures seeded into queue tables",
  );
  check((await applyMigrations(sql, migrations)).length, 0, "runner replay is idempotent");
  await sql.unsafe(migrationEnvelope(migrations, migrations[64]));
  await sql.unsafe(migrationEnvelope(migrations, migrations[65]));
  check(await snapshot(), before, "connector replay is idempotent without modifying originals");
  const ledger = [
    ...(await sql`select position,path,sha256 from nexus_migrations.applied order by position`),
  ];
  check(
    ledger,
    migrations.map(({ position, path, sha256 }) => ({ position, path, sha256 })),
    "ledger paths/order/checksums exactly match all66 files",
  );
  const badPrefix = migrations.map((m, index) =>
    index === 63 ? { ...m, sha256: "0".repeat(64) } : m,
  );
  await reject(() => sql.unsafe(migrationEnvelope(badPrefix, badPrefix[65])), "55000");
  await reject(
    () =>
      sql`update public.nr_documento_revisoes set conteudo='{"schema_version":1,"blocos":[]}'where id=${rev}`,
    "23514",
  );
  check(await snapshot(), before, "issued revision remains protected after upgrade");
  console.log(
    JSON.stringify({
      suite: "Manifest64→66 PostgreSQL upgrade",
      assertions,
      passed: true,
      migrationCount: 66,
      scope:
        "disposable database; both actual connector envelopes; per-migration DDL/ledger rollback; exact64 source/snapshot/version/PET preservation; runner+connector replay; checksum-prefix rejection; pg_cron absent locally",
    }),
  );
} finally {
  if (sql) await sql.end({ timeout: 2 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end({ timeout: 2 });
}
