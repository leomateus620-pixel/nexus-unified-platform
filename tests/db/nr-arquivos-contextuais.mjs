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
const opts = {
    host: "127.0.0.1",
    port: Number(process.env.PGTEST_PORT),
    user: "postgres",
    max: 3,
    prepare: false,
    onnotice: () => {},
  },
  admin = postgres({ ...opts, database: "postgres" }),
  database = `nr_arquivos_contextuais_${process.pid}`;
const migrations = (await loadManifest(process.cwd())).slice(0, 70);
assert.equal(migrations[69].path, "drizzle/migrations/0051_nr_arquivos_contextuais.sql");
let sql,
  checks = 0;
const check = (a, b, message) => {
    assert.deepEqual(a, b, message);
    checks++;
  },
  reject = async (fn, code) => {
    await assert.rejects(fn, (e) => e.code === code);
    checks++;
  };
const [
  org,
  otherOrg,
  user,
  outsider,
  client,
  unit,
  otherUnit,
  local1,
  local2,
  folder1,
  folder2,
  doc1,
  doc2,
  doc3,
  rev1,
  rev2,
  rev3,
  file1,
  file2,
] = Array.from({ length: 19 }, randomUUID);
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...opts, database });
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  check((await applyMigrations(sql, migrations.slice(0, 69))).length, 69);
  await sql`insert into auth.users(id,email)values(${user},'context-engineer@test.invalid'),(${outsider},'context-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Synthetic file context'),(${otherOrg},'Synthetic other context')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${otherOrg},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic file client')`;
  for (const id of [unit, otherUnit])
    await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${id},${org},${client},${id === unit ? "Synthetic unit" : "Synthetic other unit"})`;
  for (const id of [local1, local2])
    await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo)values(${id},${org},${client},${unit},array['NR33'],${id === local1 ? "Synthetic place1" : "Synthetic place2"})`;
  for (const id of [folder1, folder2])
    await sql`insert into public.nr_pastas(id,organization_id,cliente_id,unidade_id,normas,titulo)values(${id},${org},${client},${unit},array['NR33'],${id === folder1 ? "Synthetic folder1" : "Synthetic folder2"})`;
  for (const [d, r, l, p, norm] of [
    [doc1, rev1, local1, folder1, "NR33"],
    [doc2, rev2, local2, folder2, "NR35"],
    [doc3, rev3, local1, folder1, "NR33"],
  ]) {
    await sql`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,local_id,pasta_id)values(${d},${org},${client},${unit},${[norm]},'Synthetic context document',${l},${p})`;
    await sql`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero)values(${r},${org},${d},1)`;
    await sql`update public.nr_documentos set revisao_atual_id=${r} where id=${d}`;
  }
  for (const id of [file1, file2])
    await sql`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,documento_id,revisao_id,local_id,pasta_id,nome,mime,extensao,tamanho,sha256,caminho,estado,bytes_verificados,verificado_em,origem,chave,request_hash,created_at)values(${id},${org},${client},${unit},array['NR33'],${doc1},${rev1},${local1},${folder1},'synthetic.jpg','image/jpeg','jpg',123,${"b".repeat(64)},${`${org}/acervo/${id}.jpg`},'vinculado',true,now(),'importacao',${randomUUID()},'synthetic-context',${id === file1 ? "2026-10-01T00:00:00Z" : "2026-10-02T00:00:00Z"})`;
  for (const [d, r, l, p] of [
    [doc2, rev2, local2, folder2],
    [doc3, rev3, local1, folder1],
  ])
    await sql`insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,local_id,pasta_id,origem_chave,evidencia)values(${org},${client},${unit},${file1},${d},${r},${l},${p},${d},'{"fixture":"exact source identity"}')`;
  const snapshot = async () =>
    (
      await sql`select(select jsonb_agg(to_jsonb(a)order by id)from public.nr_arquivos a)files,(select jsonb_agg(to_jsonb(v)order by id)from public.nr_arquivo_vinculos v)links,(select jsonb_agg(to_jsonb(r)order by id)from public.nr_documento_revisoes r)revisions`
    )[0];
  const before = await snapshot(),
    oldDefinition = (
      await sql`select pg_get_functiondef('public.nr_arquivo_listar(uuid,text,jsonb)'::regprocedure)def`
    )[0].def;
  const broken = { ...migrations[69], source: migrations[69].source + "\nselect 1/0;\n" };
  broken.sha256 = sqlChecksum(broken.source);
  await reject(() => applyMigrations(sql, [...migrations.slice(0, 69), broken]), "22012");
  check(
    (
      await sql`select pg_get_functiondef('public.nr_arquivo_listar(uuid,text,jsonb)'::regprocedure)def`
    )[0].def,
    oldDefinition,
    "rollback restores canonical function",
  );
  check((await sql`select count(*)::int n from nexus_migrations.applied`)[0].n, 69);
  check(await snapshot(), before);
  check((await applyMigrations(sql, migrations)).length, 1);
  check(
    await snapshot(),
    before,
    "read projection migration writes no files, relationships or revision contents",
  );
  const as = (actor, fn) =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
  const list = (norm = "NR33", filters = {}, actor = user) =>
    as(
      actor,
      async (tx) =>
        (await tx`select public.nr_arquivo_listar(${org},${norm},${tx.json(filters)})r`)[0].r,
    );
  const query = {
    documento_id: doc2,
    revisao_id: rev2,
    cliente_id: client,
    unidade_id: unit,
    local_id: local2,
    pasta_id: folder2,
  };
  const selected = await list("NR35", query);
  check(selected.total, 1);
  check(selected.rows[0].id, file1);
  const context = selected.rows[0].contextos[0];
  for (const [k, v] of Object.entries({
    organization_id: org,
    cliente_id: client,
    unidade_id: unit,
    documento_id: doc2,
    revisao_id: rev2,
    local_id: local2,
    pasta_id: folder2,
    revisao_numero: 1,
  }))
    check(context[k], v, k + " belongs to same exact relationship");
  check(selected.rows[0].contextos.length, 1, "DTO projects matching context only");
  check(context.evidencia, { fixture: "exact source identity" });
  for (const filters of [
    { ...query, revisao_id: rev1 },
    { ...query, local_id: local1 },
    { ...query, pasta_id: folder1 },
    { ...query, cliente_id: randomUUID() },
    { ...query, unidade_id: otherUnit },
  ])
    check((await list("NR35", filters)).total, 0, "never combine two associations");
  check(
    (await list("NR35", { documento_id: doc3, revisao_id: rev3 })).total,
    0,
    "NR35 of unrelated secondary document does not authorize selected NR33 relationship",
  );
  check(
    (await list("NR35", { documento_id: doc1, revisao_id: rev1 })).total,
    0,
    "primary association cannot borrow another document norm",
  );
  check(
    (await list("NR33", { documento_id: doc1, revisao_id: rev1 })).total,
    2,
    "physical norm/primary association preserved",
  );
  check(
    (await list("NR33", { arquivo_ids: [file1], limite: 1 })).rows.map((x) => x.id),
    [file1],
    "requested identity filtered before page/limit despite older timestamp",
  );
  check(
    (await list("NR33", { arquivo_ids: [file1, file1], limite: 1 })).total,
    1,
    "repeated requested IDs never duplicate physical rows",
  );
  check((await list("NR33", { arquivo_ids: [] })).total, 0);
  check((await list("NR33", { arquivo_ids: [randomUUID()] })).total, 0);
  check(
    (await list("NR33", { pagina: 1, limite: 1 })).rows.map((x) => x.id),
    [file1],
    "stable created_at/id pagination retained",
  );
  await reject(
    () => list("NR33", { arquivo_ids: Array.from({ length: 101 }, randomUUID) }),
    "23514",
  );
  await reject(() => list("NR33", { arquivo_ids: "not-an-array" }), "23514");
  await reject(() => list("NR33", { arquivo_ids: ["not-a-uuid"] }), "22P02");
  await reject(() => list("NR33", { pagina: -1 }), "23514");
  await reject(() => list("NR33", { pagina: 1000001 }), "23514");
  await reject(() => list("NR33", { limite: 101 }), "23514");
  await reject(() => list("NR40"), "42501");
  await reject(() => list("NR33", {}, outsider), "42501");
  check(
    (
      await as(
        outsider,
        (tx) => tx`select id from public.nr_arquivo_vinculos where organization_id=${org}`,
      )
    ).length,
    0,
    "junction RLS denies other organization",
  );
  check(
    (await as(outsider, (tx) => tx`select id from public.nr_arquivos where organization_id=${org}`))
      .length,
    0,
    "file RLS denies other organization",
  );
  await reject(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        await tx`select public.nr_arquivo_listar(${org},'NR33','{}')`;
      }),
    "42501",
  );
  await reject(
    () =>
      sql`insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,local_id,origem_chave,evidencia)values(${org},${client},${otherUnit},${file1},${local1},'invalid-cross-unit','{}')`,
    "23503",
  );
  check(await snapshot(), before, "FK remains intact; no cross-unit association fabricated");
  const concurrent = await Promise.all([list("NR35", query), list("NR35", query)]);
  check(
    concurrent.map((x) => x.rows.map((r) => r.id)),
    [[file1], [file1]],
    "concurrent reads agree without writes",
  );
  check((await applyMigrations(sql, migrations)).length, 0);
  await sql.unsafe(migrationEnvelope(migrations, migrations[69]));
  check(await snapshot(), before, "runner and connector replay preserve complete records");
  console.log(
    JSON.stringify({
      suite: "NR canonical file relationship projection upgrade70",
      assertions: checks,
      passed: true,
      scope:
        "Synthetic disposable PostgreSQL: upgrade/rollback/replay, RLS/permissions, same-binding norm and relational filters, full context DTO, bounded IDs before pagination, concurrent reads, unchanged FK rejection of cross-unit secondary links; no bytes obtained or production changes.",
    }),
  );
} finally {
  await sql?.end({ timeout: 3 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end();
}
