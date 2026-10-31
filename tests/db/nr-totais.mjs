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
  max: 2,
  prepare: false,
  onnotice: () => {},
};
const admin = postgres({ ...options, database: "postgres" }),
  database = `nr_totais_${process.pid}`;
const migrations = (await loadManifest(process.cwd())).slice(0, 69);
assert.equal(migrations[68].path, "drizzle/migrations/0050_nr_totais_linhagem.sql");
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
  local,
  original,
  linked,
  unmatched,
  native,
  file,
  standalone,
  pending,
] = Array.from({ length: 14 }, randomUUID);
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...options, database });
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  check((await applyMigrations(sql, migrations.slice(0, 68))).length, 68);
  await sql`insert into auth.users(id,email)values(${user},'totals-eng@test.invalid'),(${outsider},'totals-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Synthetic document totals'),(${otherOrg},'Synthetic other totals')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${otherOrg},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic totals client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic totals unit')`;
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag)values(${local},${org},${client},${unit},array['NR33'],'Synthetic totals place','EC 01')`;
  const originalRevision = randomUUID();
  const metadata = new Map([
    [original, {}],
    [
      linked,
      {
        tipo: "derivado_docx_editavel",
        arquivo_original_id: file,
        documentos_originais: [{ documento_id: original, revisao_id: originalRevision }],
      },
    ],
    [
      unmatched,
      { tipo: "derivado_docx_editavel", arquivo_original_id: standalone, documentos_originais: [] },
    ],
    [
      native,
      {
        conversao: {
          original_arquivo_id: file,
          documento_origem_id: original,
          conversor: "synthetic-converter",
        },
      },
    ],
  ]);
  for (const id of [original, linked, unmatched, native]) {
    await sql`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,tipo,local_id,dados)values(${id},${org},${client},${unit},array['NR33'],${id === original ? "Original do cenário" : "Cópia do cenário"},${[linked, unmatched].includes(id) ? "derivado_docx" : "Cadastro de EC"},${local},${sql.json(metadata.get(id))})`;
    const revision = id === original ? originalRevision : randomUUID();
    await sql`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,conteudo,snapshot)values(${revision},${org},${id},1,'{"schema_version":1,"blocos":[]}','{"valor_origem":true}')`;
    await sql`update public.nr_documentos set revisao_atual_id=${revision} where id=${id}`;
  }
  for (const id of [file, standalone])
    await sql`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,documento_id,revisao_id,local_id,nome,mime,extensao,tamanho,sha256,caminho,estado,bytes_verificados,verificado_em,origem,chave,request_hash)values(${id},${org},${client},${unit},array['NR33'],${id === file ? original : null},${id === file ? originalRevision : null},${local},'synthetic.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx',123,${"a".repeat(64)},${`${org}/acervo/${id}.docx`},'vinculado',true,now(),'importacao',${randomUUID()},'synthetic-totals')`;
  await sql`update public.nr_documento_revisoes set snapshot='{"data":"11/10/2026","valor_origem":true}',sha256=${"c".repeat(64)},data_origem='2026-10-11T00:00:00Z' where id=${originalRevision}`;
  await sql`insert into public.nr_fontes(organization_id,origem,tipo,externo_id,destino_tipo,destino_id,payload,sha256,capturado_em)values(${org},'synthetic-date-source','registro_documental','unit/original','documentos',${original},'{"emitido_em":"2026-10-11","criado_em":"2026-10-11"}',${"c".repeat(64)},now())`;
  await sql`insert into public.nr_pendencias(id,organization_id,cliente_id,unidade_id,normas,titulo,criticidade,local_id)values(${pending},${org},${client},${unit},array['NR33','NR35'],'Synthetic lightweight priority','alta',${local})`;
  await sql`update public.nr_documentos set estado='em_revisao'where id=${original}`;
  await sql`update public.nr_documento_revisoes set estado='em_revisao'where id=${originalRevision}`;
  const snapshot = async () =>
    (
      await sql`select(select jsonb_agg(to_jsonb(d)order by id)from public.nr_documentos d where organization_id=${org})documents,(select jsonb_agg(to_jsonb(v)order by id)from public.nr_documento_revisoes v where organization_id=${org})revisions,(select jsonb_agg(to_jsonb(a)order by id)from public.nr_arquivos a where organization_id=${org})files,(select jsonb_agg(to_jsonb(p)order by id)from public.nr_pendencias p where organization_id=${org})concerns`
    )[0];
  const before = await snapshot(),
    oldLinks =
      await sql`select id,public.nr_documento_copia_comprovada(organization_id,dados)proved from public.nr_documentos where organization_id=${org} order by id`;
  const broken = { ...migrations[68], source: migrations[68].source + "\nselect 1/0;\n" };
  broken.sha256 = sqlChecksum(broken.source);
  await reject(() => applyMigrations(sql, [...migrations.slice(0, 68), broken]), "22012");
  check(
    (
      await sql`select to_regprocedure('public.nr_painel_contadores_documentos(uuid,text,jsonb)')r`
    )[0].r,
    null,
    "failed upgrade rolls back helpers and renamed functions",
  );
  check(await snapshot(), before);
  check((await applyMigrations(sql, migrations)).length, 1);
  check(await snapshot(), before, "all records, issued bodies and file metadata unchanged");
  check(
    await sql`select id,public.nr_documento_copia_comprovada(organization_id,dados)proved from public.nr_documentos where organization_id=${org} order by id`,
    oldLinks,
    "indexed lookup retains exactly the same proved relationships",
  );
  const counts = (
    await sql`select public.nr_painel_contadores_documentos(${org},'NR33',${sql.json({ unidade_id: unit })})r`
  )[0].r;
  check(
    counts,
    {
      documentos_logicos: 4,
      documentos_origem: 1,
      copias_editaveis: 3,
      copias_correspondencia_pendente: 1,
      documentos_principais: 2,
    },
    "copy provenance, original records and proved lineage counted independently",
  );
  const summary = (await sql`select public.nr_documento_resumo(${org},'NR33',${unmatched})r`)[0].r;
  check(
    (await sql`select public.nr_documento_resumo(${org},'NR33',${original})r`)[0].r
      .data_origem_texto,
    "2026-10-11",
    "original date-only source is not converted from a midnight timestamp",
  );
  check(summary.copia_editavel, true);
  check(summary.linhagem_comprovada, false);
  check(summary.correspondencia_pendente, true);
  check(
    (await sql`select public.nr_documento_resumo(${org},'NR33',${linked})r`)[0].r
      .correspondencia_pendente,
    false,
  );
  check(
    (
      await sql`select public.nr_documento_copia_comprovada(${org},'{"arquivo_original_id":"invalid","documentos_originais":{"future":true}}')r`
    )[0].r,
    false,
    "unknown or invalid identity never produces a guessed relationship",
  );
  const as = (actor, fn) =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
  const query = (resource, actor = user) =>
    as(
      actor,
      async (tx) =>
        (
          await tx`select public.nr_consultar(${org},'NR33',${resource},${tx.json({ unidade_id: unit })})r`
        )[0].r,
    );
  const panel = await query("painel");
  check(panel.documentos_origem, 1);
  check(panel.copias_editaveis, 3);
  check(panel.copias_correspondencia_pendente, 1);
  check(
    panel.pendencias_prioritarias[0].normas,
    ["NR33", "NR35"],
    "lightweight priority row includes actual applicable scopes",
  );
  check(panel.pendencias_prioritarias[0].cliente_id, client);
  check(panel.pendencias_prioritarias[0].unidade_id, unit);
  check(panel.pendencias_prioritarias[0].local_id, local);
  check(
    "dados" in panel.pendencias_prioritarias[0],
    false,
    "panel does not load snapshots as a workaround for missing metadata",
  );
  check(panel.documentos_revisao[0].normas, ["NR33"]);
  check(panel.documentos_revisao[0].unidade_id, unit);
  const context = await query("contexto");
  check(context.unidades[0].documentos, 4);
  check(context.unidades[0].documentos_origem, 1);
  check(context.unidades[0].copias_editaveis, 3);
  const localSummary = (await sql`select public.nr_local_resumo(${org},'NR33',${local})r`)[0].r;
  check(localSummary.documentos_total, 4);
  check(localSummary.documentos_origem, 1);
  check(localSummary.copias_editaveis, 3);
  await reject(() => query("painel", outsider), "42501");
  await reject(
    () => as(user, (tx) => tx`select public.nr_consultar_base_68(${org},'NR33','painel','{}')`),
    "42501",
  );
  check((await applyMigrations(sql, migrations)).length, 0);
  await sql.unsafe(migrationEnvelope(migrations, migrations[68]));
  check(await snapshot(), before, "runner and connector replay preserve all application data");
  console.log(
    JSON.stringify({
      suite: "NR factual document totals upgrade69",
      assertions: checks,
      passed: true,
      scope:
        "Synthetic disposable PostgreSQL; classification separate from parent-proof, indexed UUID relationship equivalence, sparse panel DTO scopes, no snapshots in panel, auth/RLS, complete DDL rollback and replay without data writes. Performance requires separate real-acervo measurement.",
    }),
  );
} finally {
  await sql?.end({ timeout: 3 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end();
}
