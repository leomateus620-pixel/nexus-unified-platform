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
  throw Error("Contextual NR tests require disposable loopback PostgreSQL");
const options = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  max: 4,
  prepare: false,
  onnotice: () => {},
};
const admin = postgres({ ...options, database: "postgres" });
const database = `nr_experiencia_${process.pid}`;
const migrations = (await loadManifest(process.cwd())).slice(0, 67);
assert.equal(migrations.at(-1).path, "drizzle/migrations/0048_nr_experiencia_contextual.sql");
let sql,
  checks = 0;
const check = (a, b, message) => {
  assert.deepEqual(a, b, message);
  checks++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
};
const [
  org,
  otherOrg,
  user,
  reader,
  outsider,
  client,
  unrelatedClient,
  unit,
  unit2,
  emptyUnit,
  unrelatedUnit,
  foreignClient,
  foreignUnit,
] = Array.from({ length: 13 }, randomUUID);
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...options, database });
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  check(
    (await applyMigrations(sql, migrations.slice(0, 66))).length,
    66,
    "upgrade begins from actual PR19 schema",
  );
  await sql`insert into auth.users(id,email)values(${user},'context-eng@test.invalid'),(${reader},'context-reader@test.invalid'),(${outsider},'context-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Synthetic NR context'),(${otherOrg},'Synthetic other organization')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${org},${reader}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${org},${reader},'campo'),(${otherOrg},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic archive client'),(${unrelatedClient},${org},'Synthetic unrelated client'),(${foreignClient},${otherOrg},'Synthetic foreign client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic first unit'),(${unit2},${org},${client},'Synthetic second unit'),(${emptyUnit},${org},${client},'Synthetic no places unit'),(${unrelatedUnit},${org},${unrelatedClient},'Synthetic unrelated unit'),(${foreignUnit},${otherOrg},${foreignClient},'Synthetic foreign unit')`;
  const events = Array.from({ length: 7 }, (_, i) => ({
    data: `2026-09-${String(i + 1).padStart(2, "0")}`,
    autor: "Autor histórico sintético",
    acao: `Acontecimento ${i + 1}`,
    detalhe: "Texto integral de uma atualização técnica; não é auditoria de importação.",
  }));
  const local = randomUUID(),
    otherLocal = randomUUID();
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag,dados)values(${local},${org},${client},${unit},array['NR33'],'Synthetic local one','EC 01',${sql.json({ setor: "Setor técnico", enquadramento: "EC", fotos: [{ arquivo: "field/a.jpg", legenda: "Ocorrência original" }], historico: events, levantamento: { situacao: "concluido" } })}),(${otherLocal},${org},${client},${unit2},array['NR33'],'Same tag different unit','EC 01','{}')`;
  for (const tag of ["EC 10", "EC 02", "EC 13B", "EC 13A", "EC 001"])
    await sql`insert into public.nr_locais(organization_id,cliente_id,unidade_id,normas,titulo,tag)values(${org},${client},${unit},array['NR33'],${`Synthetic ${tag}`},${tag})`;
  const doc = randomUUID(),
    rev = randomUUID(),
    generalDoc = randomUUID(),
    generalRev = randomUUID(),
    otherDoc = randomUUID(),
    otherRev = randomUUID(),
    derived = randomUUID(),
    derivedRev = randomUUID(),
    heightDoc = randomUUID(),
    heightRev = randomUUID();
  for (const [id, revision, ownerUnit, ownerLocal, norma, title] of [
    [doc, rev, unit, local, "NR33", "Documento sem TAG no título"],
    [generalDoc, generalRev, emptyUnit, null, "NR33", "Documento da unidade sem locais"],
    [otherDoc, otherRev, unit2, otherLocal, "NR33", "Outro documento EC 01"],
    [derived, derivedRev, unit, local, "NR33", "Cópia editável"],
    [heightDoc, heightRev, unit, local, "NR35", "Procedimento de altura"],
  ]) {
    await sql`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,local_id,estado_origem,dados)values(${id},${org},${client},${ownerUnit},array[${norma}],${title},${ownerLocal},'emitido',${sql.json(id === derived ? { documentos_originais: [{ documento_id: doc, revisao_id: rev, externo_id: "document-exact" }], tipo: "derivado_docx_editavel" } : id === doc ? { desatualizado: "Substituído pelo procedimento Rev.02; sucessor sem ID confirmado." } : {})})`;
    await sql`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,estado,conteudo,snapshot,sha256,data_origem)values(${revision},${org},${id},1,'emitido_origem','{"schema_version":1,"blocos":[]}',${sql.json({ criado_em: "2026-09-01", preservado: true })},${"a".repeat(64)},'2026-09-01T00:00:00Z')`;
    await sql`update public.nr_documentos set revisao_atual_id=${revision},estado=${id === derived ? "rascunho" : "emitido_origem"} where id=${id}`;
  }
  const sameUnitOtherLocal = (
    await sql`select id from public.nr_locais where organization_id=${org} and unidade_id=${unit} and tag='EC 02'`
  )[0].id;
  const originalFile = randomUUID(),
    pdf = randomUUID(),
    image = randomUUID();
  for (const [id, ext, mime, originalDoc, originalRev] of [
    [
      originalFile,
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc,
      rev,
    ],
    [pdf, "pdf", "application/pdf", doc, rev],
    [image, "jpg", "image/jpeg", null, null],
  ]) {
    await sql`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,documento_id,revisao_id,local_id,nome,mime,extensao,tamanho,sha256,caminho,estado,bytes_verificados,verificado_em,origem,chave,request_hash,origem_metadata)values(${id},${org},${client},${unit},array['NR33'],${originalDoc},${originalRev},${local},${`synthetic.${ext}`},${mime},${ext},123,${"b".repeat(64)},${`${org}/acervo/${id}.${ext}`},'vinculado',true,now(),'importacao',${randomUUID()},'synthetic-request',${sql.json({ legenda: "Legenda da ocorrência", data_origem: "2026-09-01", autor_historico: "Autor histórico", drive_id: originalDoc ? "drive-fixture" : "drive-image", drive_revision_id: "current-head" })})`;
  }
  await sql`update public.nr_documentos set dados=dados||${sql.json({ arquivo_original_id: originalFile })} where id=${derived}`;
  await sql`insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,local_id,origem_chave,evidencia)values(${org},${client},${unit},${image},${heightDoc},${heightRev},${sameUnitOtherLocal},'exact-shared-image',${sql.json({ correspondencia: "identidade de arquivo explícita", legenda: "Legenda no contexto de altura" })})`;
  await sql`insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,local_id,origem_chave,evidencia)values(${org},${client},${unit},${image},${doc},${rev},${local},'exact-second-context',${sql.json({ legenda: "Legenda documental original" })})`;
  const historicalLot = randomUUID();
  await sql`insert into public.nr_import_lotes(id,organization_id,origem,chave)values(${historicalLot},${org},'synthetic-source','synthetic-historical-versions')`;
  for (const number of [1, 2]) {
    const payload = {
      file_id: "drive-fixture",
      revision_id: `historical-${number}`,
      head: false,
      mime: "application/pdf",
      size: "123",
      modified_time: `2026-08-0${number}T00:00:00Z`,
      keep_forever: false,
      original_filename: "Historical original.pdf",
      last_modifying_user: {
        displayName: "Autor histórico",
        emailAddress: "must-not-be-exposed@test.invalid",
      },
      estado: "bloqueado_api_retencao",
    };
    const evidence = {
      drive_file_id: "drive-fixture",
      drive_revision_id: payload.revision_id,
      arquivo_historico_id: originalFile,
      contextos: [{ arquivo_id: originalFile, cliente_id: client, unidade_id: unit }],
    };
    await sql`insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,payload,sha256,resultado,motivo,evidencia,capturado_em)values(${org},${historicalLot},'synthetic-source','versao_arquivo',${`drive-fixture/historical-${number}`},${sql.json(payload)},${"a".repeat(64)},'indisponivel','Motivo histórico preservado; sem bytes desta revisão.',${sql.json(evidence)},now())`;
  }
  const pendingCandidate = randomUUID(),
    dimensionPending = randomUUID();
  await sql`insert into public.nr_pendencias(id,organization_id,cliente_id,unidade_id,normas,titulo,descricao,local_id)values(${pendingCandidate},${org},${client},${unit},array['NR33'],'Synthetic height-related concern','Conferir a linha de vida e ancoragem descrita no PGSSTA.',${local}),(${dimensionPending},${org},${client},${unit},array['NR33'],'Synthetic geometric height','Confirmar a altura geométrica do reservatório.',${local})`;
  for (const [id, external, payload] of [
    [
      pendingCandidate,
      "unit/P-height",
      {
        titulo: "Synthetic height-related concern",
        descricao: "Conferir a linha de vida e ancoragem descrita no PGSSTA.",
      },
    ],
    [
      dimensionPending,
      "unit/P-dimension",
      {
        titulo: "Synthetic geometric height",
        descricao: "Confirmar a altura geométrica do reservatório.",
      },
    ],
  ])
    await sql`insert into public.nr_fontes(organization_id,origem,tipo,externo_id,destino_tipo,destino_id,payload,sha256,capturado_em)values(${org},'synthetic-source','pendencia',${external},'pendencias',${id},${sql.json(payload)},${"c".repeat(64)},now())`;
  const model = randomUUID(),
    modelVersion = randomUUID(),
    legacyModel = randomUUID(),
    legacyVersion = randomUUID(),
    survey = randomUUID();
  const modelData = {
    id: "MLT-EC-R00",
    versao: 2,
    blocos: [
      { codigo: "B07", campos: [{ id: "B07.forma", nome: "Forma", tipo: "selecao" }] },
      { codigo: "B16", campos: [{ id: "B16.sistemas", nome: "Sistemas", tipo: "lista" }] },
    ],
  };
  await sql`insert into public.nr_modelos(id,organization_id,normas,tipo,titulo,dados)values(${model},${org},array['NR33','NR35'],'levantamento','Synthetic full model',${sql.json(modelData)}),(${legacyModel},${org},array['NR33'],'levantamento','Synthetic historical model',${sql.json({ blocos: [{ codigo: "B07", titulo: "Historical matrix", campos: [] }] })})`;
  await sql`insert into public.nr_modelo_versoes(id,organization_id,modelo_id,numero,conteudo,dados,sha256)values(${modelVersion},${org},${model},2,'{"schema_version":1,"blocos":[]}',${sql.json(modelData)},${"c".repeat(64)}),(${legacyVersion},${org},${legacyModel},1,'{"schema_version":1,"blocos":[]}',${sql.json({ blocos: [{ codigo: "B07", titulo: "Historical matrix", campos: [] }] })},${"d".repeat(64)})`;
  await sql`insert into public.nr_levantamentos(id,organization_id,cliente_id,unidade_id,normas,titulo,local_id,modelo_id,modelo_versao_id,dados)values(${survey},${org},${client},${unit},array['NR33'],'Synthetic imported survey',${local},${legacyModel},${legacyVersion},${sql.json({ modelo_legado: true, respostas_extraidas_por_caminho: true, estado_historico: "concluido" })})`;
  await sql`insert into public.nr_respostas(organization_id,levantamento_id,campo_id,valor)values(${org},${survey},'B07.forma','"prismatica"'),(${org},${survey},'B16.sistemas','[{"tipo":"ancoragem","quantidade":0}]'),(${org},${survey},'campo_futuro','false')`;
  for (const [kind, external, resource, id, payload, hash] of [
    ["modelo_levantamento", "MLT-EC-R00", "modelos", model, modelData, "c"],
    [
      "levantamento",
      "unit/place",
      "levantamentos",
      survey,
      { respostas: { "B07.forma": "prismatica", "B16.sistemas": [] } },
      "d",
    ],
    [
      "unidade",
      "source-unit",
      "unidades",
      unit,
      {
        cnpj: "identificação histórica",
        documentacao: { revisoes: "Revisão histórica", responsavel_nr33: "Responsável histórico" },
      },
      "e",
    ],
    [
      "evento",
      "global-1",
      "referencias",
      randomUUID(),
      {
        data: "2026-09-01",
        autor: "Autor global",
        acao: "Narrativa global sem vínculo comprovado",
      },
      "f",
    ],
  ])
    await sql`insert into public.nr_fontes(organization_id,origem,tipo,externo_id,destino_tipo,destino_id,payload,sha256,capturado_em)values(${org},'synthetic-source',${kind},${external},${resource},${id},${sql.json(payload)},${hash.repeat(64)},now())`;
  const snapshots = async () =>
    (
      await sql`select (select to_jsonb(l)from public.nr_locais l where id=${local})local,(select to_jsonb(v)from public.nr_documento_revisoes v where id=${rev})revision,(select to_jsonb(l)from public.nr_levantamentos l where id=${survey})survey,(select jsonb_agg(to_jsonb(r)order by campo_id)from public.nr_respostas r where levantamento_id=${survey})answers`
    )[0];
  const fileOnlyUnit = randomUUID(),
    modelOnlyUnit = randomUUID(),
    fileOnlyId = randomUUID();
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${fileOnlyUnit},${org},${client},'Synthetic file-only unit'),(${modelOnlyUnit},${org},${client},'Synthetic model-only unit')`;
  await sql`insert into public.nr_modelos(organization_id,cliente_id,unidade_id,normas,tipo,titulo)values(${org},${client},${modelOnlyUnit},array['NR35'],'documento','Synthetic unit template only')`;
  await sql`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,nome,mime,extensao,tamanho,sha256,caminho,estado,bytes_verificados,verificado_em,origem,chave,request_hash)values(${fileOnlyId},${org},${client},${fileOnlyUnit},array['NR35'],'synthetic-file-only.jpg','image/jpeg','jpg',123,${"e".repeat(64)},${`${org}/acervo/${fileOnlyId}.jpg`},'vinculado',true,now(),'importacao',${randomUUID()},'synthetic-file-only')`;
  const before = await snapshots();
  const petBefore =
    await sql`select p.oid,md5(pg_get_functiondef(p.oid))hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'pet\_%'order by p.oid`;
  const broken = { ...migrations[66], source: migrations[66].source + "\nselect 1/0;\n" };
  broken.sha256 = sqlChecksum(broken.source);
  await reject(() => applyMigrations(sql, [...migrations.slice(0, 66), broken]), "22012");
  check(
    (await sql`select to_regclass('public.nr_contextos')relation`)[0].relation,
    null,
    "failed upgrade rolls back new table",
  );
  check(
    (await sql`select count(*)::integer n from nexus_migrations.applied`)[0].n,
    66,
    "failed upgrade retains ledger prefix",
  );
  check((await applyMigrations(sql, migrations)).length, 1, "actual upgrade67 applies once");
  check(
    await snapshots(),
    before,
    "upgrade preserves snapshots, technical narrative, authors, dates and answers exactly",
  );
  check(
    await sql`select p.oid,md5(pg_get_functiondef(p.oid))hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'pet\_%'order by p.oid`,
    petBefore,
    "PET definitions and signatures unchanged",
  );
  check((await applyMigrations(sql, migrations)).length, 0, "manifest replay writes nothing");
  await sql.unsafe(migrationEnvelope(migrations, migrations[66]));
  check(await snapshots(), before, "connector envelope replay is idempotent");
  const as = (actor, fn) =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
  const query = (resource, filters = {}, norma = "NR33", actor = user, organization = org) =>
    as(
      actor,
      async (tx) =>
        (
          await tx`select public.nr_consultar(${organization},${norma},${resource},${tx.json(filters)})r`
        )[0].r,
    );
  let ctx = await query("contexto");
  check(
    ctx.clientes.map((c) => c.id),
    [client],
    "unrelated global client stays outside NR navigation",
  );
  check(ctx.unidades.length, 5, "unit with document and zero places remains accessible");
  check(
    ctx.unidades.some((u) => u.id === fileOnlyUnit),
    true,
    "unit with only loose files remains accessible",
  );
  check(
    ctx.unidades.some((u) => u.id === modelOnlyUnit),
    true,
    "unit-specific model is explicit module association",
  );
  check(ctx.unidades.find((u) => u.id === emptyUnit).locais, 0);
  check(ctx.unidades.find((u) => u.id === emptyUnit).documentos, 1);
  check(
    ctx.unidades.find((u) => u.id === unit).documentacao.responsavel_nr33,
    "Responsável histórico",
    "unit provenance is projected by exact ID",
  );
  check(
    (await query("contexto", {}, "NR35")).unidades.map((u) => u.id).sort(),
    ctx.unidades.map((u) => u.id).sort(),
    "switching NR retains associated contexts even when recorte is empty",
  );
  const tags = (await query("locais", { unidade_id: unit, limite: 100 })).rows.map((l) => l.tag);
  check(
    tags,
    ["EC 001", "EC 01", "EC 02", "EC 10", "EC 13A", "EC 13B"],
    "server natural order preserves zeros and suffixes",
  );
  check(
    (await query("locais", { unidade_id: unit, pagina: 1, limite: 2 })).rows.map((l) => l.tag),
    tags.slice(2, 4),
    "stable page boundaries",
  );
  check(
    (await query("locais", { busca: "Setor técnico" })).rows[0].id,
    local,
    "sector is searchable without snapshots in listing",
  );
  const listed = (await query("locais", { unidade_id: unit })).rows.find((l) => l.id === local);
  check(listed.dados, {}, "list does not load complete local snapshot");
  check(listed.resumo_tecnico.historico_tecnico_total, 7);
  check(listed.resumo_tecnico.imagens_total, 1);
  const timeline = await query("historico_tecnico", {
    unidade_id: unit,
    local_id: local,
    limite: 100,
  });
  check(timeline.total, 7, "all narrative events are directly queryable");
  check(timeline.rows[0].data, "2026-09-07", "date-only source stays date-only");
  check(timeline.rows[0].autor_historico, events[0].autor);
  check(timeline.rows[0].texto, events[0].detalhe, "full technical text survives projection");
  check(
    (await query("historico_tecnico", { unidade_id: unit2 })).total,
    0,
    "same TAG cannot leak events between units",
  );
  const docs = await query("documentos", {
    local_id: local,
    unidade_id: unit,
    copias_editaveis: false,
  });
  check(
    docs.total,
    1,
    "relational document filter finds documents without TAG and groups proved copies",
  );
  check(docs.rows[0].id, doc);
  const summary = docs.rows[0].resumo_documental;
  check(summary.arquivos_word, 1);
  check(summary.arquivos_pdf, 1);
  check(summary.vigencia, "vigente", "issued structured metadata remains preserved");
  check(
    summary.vigencia_apresentacao,
    "substituicao_declarada",
    "replacement note cannot appear as unqualified current version",
  );
  check(summary.copias_editaveis[0].id, derived);
  check(
    summary.data_origem_texto,
    "2026-09-01",
    "original date presentation survives timestamp ingestion",
  );
  check(docs.rows[0].recebimento, "nativo", "bytes do not silently reclassify receipt");
  check(
    (
      await query("documentos", {
        unidade_id: unit,
        grupo_documental: "vigentes",
        copias_editaveis: false,
      })
    ).total,
    0,
  );
  check(
    (
      await query("documentos", {
        unidade_id: unit,
        grupo_documental: "anteriores",
        copias_editaveis: false,
      })
    ).total,
    1,
  );
  check((await query("documentos", { unidade_id: emptyUnit, somente_unidade: true })).total, 1);
  check((await query("documentos", { unidade_id: unit2, local_id: local })).total, 0);
  const replacedDraft = randomUUID(),
    replacedDraftRevision = randomUUID();
  await sql`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,dados)values(${replacedDraft},${org},${client},${unit},array['NR33'],'Synthetic replaced draft',${sql.json({ desatualizado: "Substituído pelo procedimento revisado." })})`;
  await sql`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,snapshot,conteudo)values(${replacedDraftRevision},${org},${replacedDraft},1,'{"historico":true}','{"schema_version":1,"blocos":[]}')`;
  await sql`update public.nr_documentos set revisao_atual_id=${replacedDraftRevision} where id=${replacedDraft}`;
  const draftBefore = await query("documentos", { id: replacedDraft });
  await reject(
    () =>
      as(
        user,
        (tx) =>
          tx`select public.nr_executar(${org},'NR33','documentos','submeter',${replacedDraft},${draftBefore.version},${randomUUID()},'{"motivo":"Synthetic invalid historical transition"}')`,
      ),
    "23514",
  );
  const newRevision = await as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},'NR33','documentos','nova_revisao',${replacedDraft},${draftBefore.version},${randomUUID()},'{"motivo":"Synthetic intentional new revision"}')r`
      )[0].r,
  );
  check(
    newRevision.revisao_numero,
    2,
    "new revision remains the supported path for replaced draft",
  );
  check(
    newRevision.resumo_documental.vigencia_apresentacao,
    "vigente",
    "new draft does not inherit old revision replacement badge",
  );
  check(
    newRevision.resumo_documental.motivo_substituicao,
    null,
    "old note remains provenance without classifying the new revision",
  );
  const resubmitted = await as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},'NR33','documentos','submeter',${replacedDraft},${newRevision.version},${randomUUID()},'{"motivo":"Synthetic reviewed new draft"}')r`
      )[0].r,
  );
  check(
    resubmitted.estado,
    "em_revisao",
    "intentional new draft can follow authorized review flow",
  );
  const projectedSurvey = await query("levantamentos", { id: survey });
  check(projectedSurvey.modelo_id, legacyModel, "reading never swaps historical model identity");
  check(
    projectedSurvey.modelo_snapshot.dados.blocos[0].titulo,
    "Historical matrix",
    "historical B07 identity stays separate",
  );
  check(
    projectedSurvey.modelo_apresentacao.id,
    model,
    "proven source model supplies presentation only",
  );
  check(projectedSurvey.modelo_apresentacao.projecao_versao, "nr-levantamento-apresentacao-1");
  check(
    projectedSurvey.respostas.campo_futuro,
    false,
    "unknown later answers survive presentation adapter",
  );
  check(projectedSurvey.local_tag, "EC 01", "relations resolve outside first list page");
  check(
    projectedSurvey.local_contexto.normas,
    ["NR33"],
    "selected local's canonical norm is resolved by identity",
  );
  check(
    (await query("documentos", { id: heightDoc }, "NR35")).local_contexto.normas,
    ["NR33"],
    "height document can open its NR33 EC by canonical context without duplication",
  );
  const panel = await query("painel", { unidade_id: unit });
  check(panel.historico_tecnico_total, 7);
  check(panel.documentos_origem, 2);
  check(panel.copias_editaveis, 1);
  check(
    panel.eventos_globais[0].escopo,
    "global_sem_associacao",
    "source global narrative never receives inferred unit relation",
  );
  const files = await as(
    reader,
    async (tx) =>
      (
        await tx`select public.nr_arquivo_listar(${org},'NR35',${tx.json({ documento_id: heightDoc, unidade_id: unit })})r`
      )[0].r,
  );
  check(files.total, 1, "shared image follows exact authorized NR35 document relationship");
  check(
    files.rows[0].contextos.find((c) => c.documento_id === heightDoc).evidencia.legenda,
    "Legenda no contexto de altura",
    "shared occurrence retains its own caption",
  );
  check(
    files.rows[0].contextos.find((c) => c.documento_id === heightDoc).revisao_numero,
    1,
    "secondary revision number projected",
  );
  const fileQuery = (filters) =>
    as(
      reader,
      async (tx) =>
        (await tx`select public.nr_arquivo_listar(${org},'NR33',${tx.json(filters)})r`)[0].r,
    );
  check(
    (await fileQuery({ documento_id: doc, revisao_id: heightRev })).total,
    0,
    "document and revision cannot match different relationships of same physical file",
  );
  check(
    (await fileQuery({ documento_id: doc, revisao_id: rev })).total,
    3,
    "matching revision includes only its explicit primary/secondary representations",
  );
  check(
    (await fileQuery({ documento_id: heightDoc, local_id: local })).total,
    0,
    "document and local cannot be combined from distinct occurrences",
  );
  check(
    (await fileQuery({ documento_id: heightDoc, local_id: sameUnitOtherLocal })).total,
    1,
    "exact documented occurrence remains visible",
  );
  const historical = (page = 0, actor = reader) =>
    as(
      actor,
      async (tx) =>
        (
          await tx`select public.nr_arquivo_versoes_listar(${org},'NR33',${originalFile},${page},1)r`
        )[0].r,
    );
  const historicalFirst = await historical();
  check(
    historicalFirst.total,
    2,
    "historical version metadata paginated per proved original identity",
  );
  check(historicalFirst.rows[0].versao_origem, "historical-2");
  check((await historical(1)).rows[0].versao_origem, "historical-1", "historical pages stable");
  check(
    historicalFirst.rows[0].bytes_disponiveis,
    false,
    "current head bytes never stand in for historical revision",
  );
  check(historicalFirst.rows[0].arquivo_historico_id, null);
  check(historicalFirst.rows[0].autor_historico, "Autor histórico");
  check(
    JSON.stringify(historicalFirst).includes("must-not-be-exposed"),
    false,
    "historical DTO excludes identity/email/permission payload",
  );
  await reject(() => historical(0, outsider), "42501");
  check(
    (await query("pendencias", { unidade_id: unit }, "NR35")).total,
    0,
    "NR35 navigation does not silently assert candidate applicability",
  );
  const candidates = await query(
    "pendencias",
    { unidade_id: unit, revisao_aplicabilidade: true },
    "NR35",
  );
  check(candidates.total, 1, "explicit review list considers only own source evidence");
  check(candidates.rows[0].id, pendingCandidate);
  check(candidates.rows[0].normas, ["NR33"], "candidature never changes recorded norms");
  check(candidates.rows[0].revisao_aplicabilidade.decisao_automatica, false);
  check(
    candidates.rows[0].revisao_aplicabilidade.evidencias[0].texto,
    "Conferir a linha de vida e ancoragem descrita no PGSSTA.",
  );
  await reject(() => query("historico_tecnico", {}, "NR33", outsider), "42501");
  await reject(() => query("locais", { id: local }, "NR33", outsider, otherOrg), "42501");
  check(
    await as(
      outsider,
      async (tx) =>
        (
          await tx`select count(*)::integer n from public.nr_contextos where organization_id=${org}`
        )[0].n,
    ),
    0,
    "RLS denies direct cross-organization reads",
  );
  await reject(
    () =>
      as(
        reader,
        (tx) =>
          tx`select public.nr_contexto_associar(${org},${unrelatedClient},${unrelatedUnit},array['NR35'],${randomUUID()})`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        user,
        (tx) =>
          tx`select public.nr_contexto_associar(${org},${foreignClient},${foreignUnit},array['NR35'],${randomUUID()})`,
      ),
    "42501",
  );
  const key = randomUUID();
  const associate = () =>
    as(
      user,
      (tx) =>
        tx`select public.nr_contexto_associar(${org},${unrelatedClient},${unrelatedUnit},array['NR35'],${key})r`,
    );
  const parallel = await Promise.all([associate(), associate(), associate()]);
  check(
    parallel.map((r) => r[0].r.unidade_id),
    [unrelatedUnit, unrelatedUnit, unrelatedUnit],
    "concurrent retries return same context",
  );
  check(
    (
      await sql`select count(*)::integer n from public.nr_contextos where organization_id=${org} and unidade_id=${unrelatedUnit}`
    )[0].n,
    1,
    "one explicit association after concurrent retries",
  );
  check(
    (await query("contexto")).clientes.length,
    2,
    "new associated client appears without global archival",
  );
  await reject(
    () =>
      as(
        user,
        (tx) =>
          tx`select public.nr_contexto_associar(${org},${unrelatedClient},${unrelatedUnit},array['NR33'],${key})`,
      ),
    "23505",
  );
  check(
    await snapshots(),
    before,
    "all reads, context writes and retries preserve historical material",
  );
  console.log(
    JSON.stringify({
      suite: "NR contextual projections upgrade67",
      assertions: checks,
      passed: true,
      scope:
        "Synthetic disposable PostgreSQL; upgrade/replay/rollback/RLS/relational context/lineage/natural order/narrative history/source model proof/concurrent association. Storage metadata fixtures do not claim binary retrieval.",
    }),
  );
} finally {
  await sql?.end({ timeout: 3 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end();
}
