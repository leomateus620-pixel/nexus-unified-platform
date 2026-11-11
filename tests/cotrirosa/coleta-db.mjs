import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, ids } from "./fixture.mjs";

const f = await fixture(process.env.NEXUS_COTRIROSA_LAB_DB || `cotrirosa_test_${Date.now()}`);
const { sql } = f;
const { org, client, unit, user, reader, other, locals, person } = ids;
const run = async (fn, actor = user) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
const args = { modelo: randomUUID(), moega: randomUUID(), altura: randomUUID() };
const local = locals[4];
const mk = (id, nome, tipo = "texto", obrigatorio = true) => ({ id, nome, tipo, obrigatorio });
const roteiro = {
  blocos: [
    { id: "B01", codigo: "B01", titulo: "Identificação", campos: [mk("B01.tag", "TAG")] },
    {
      id: "B09",
      codigo: "B09",
      titulo: "Ventilação fixa por aeração",
      aplica_se: { familias: ["silos"] },
      campos: [{ ...mk("B09.instalada", "Quantidade instalada", "numero"), unidade: "un" }],
    },
    {
      id: "B14",
      codigo: "B14",
      titulo: "Adequações",
      campos: [mk("B14.itens", "Matriz de adequações", "checklist", false)],
    },
    {
      id: "B16",
      codigo: "B16",
      titulo: "Ancoragens e linhas de vida",
      campos: [mk("B16.observacao", "Situação observada", "texto_longo", false)],
    },
  ],
};
const context = (id, norma = "NR33", u = unit) =>
  run((tx) => tx`select nr_coleta_contexto(${org},${client},${u},${norma},${id}) result`).then(
    (r) => r[0].result,
  );
const start = (id, norma, model, dual = false, key = randomUUID(), actor = user) =>
  run(
    (tx) =>
      tx`select nr_coleta_iniciar(${org},${client},${unit},${norma},${id},${model},${model ? 1 : null},${dual},null,${key}) result`,
    actor,
  ).then((r) => r[0].result);
const survey = (id, norma = "NR33") =>
  run(
    (tx) =>
      tx`select nr_consultar(${org},${norma},'levantamentos',${tx.json({ id, unidade_id: unit })}) result`,
  ).then((r) => r[0].result);
const save = (id, version, answers, norma = "NR33", key = randomUUID(), target = unit) =>
  run(
    (tx) =>
      tx`select nr_coleta_salvar(${org},${client},${target},${norma},${id},${version},${key},${tx.json({ respostas: answers, bloco: "B09", medidas: { "B09.instalada": { natureza: "Medida em campo", referencia: "Contagem visual" } } })}) result`,
  ).then((r) => r[0].result);
const finish = (id, v, key = randomUUID(), u = unit, norma = "NR33") =>
  run(
    (tx) => tx`select nr_coleta_concluir(${org},${client},${u},${norma},${id},${v},${key}) result`,
  ).then((r) => r[0].result);
const review = (id, rev, v, decisao, key = randomUUID(), actor = user, items = []) =>
  run(
    (tx) =>
      tx`select nr_coleta_revisar(${org},${client},${unit},'NR33',${id},${rev},${v},${decisao},'Nota da revisão',${key},${tx.json(items)}) result`,
    actor,
  ).then((r) => r[0].result);
try {
  await sql`update pessoas set registro_profissional='Registro de teste' where id=${person}`;
  await sql`update nr_locais set familia='silos' where id=${local}`;
  await sql`insert into nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag,familia,tipo)
    values(${args.moega},${org},${client},${unit},array['NR33'],'Moega 01','EC 29','moegas','espaco_confinado'),
    (${args.altura},${org},${client},${unit},array['NR35'],'Cobertura de teste','ALT 01','telhado_laje','altura')`;
  await sql`insert into nr_modelos(id,organization_id,normas,titulo,tipo,estado,dados)
    values(${args.modelo},${org},array['NR33','NR35'],'Roteiro controlado','levantamento','publicado',${sql.json(roteiro)})`;
  assert.equal((await context(local)).modelos[0].id, args.modelo);
  await assert.rejects(context(local, "NR33", other), { code: "42501" });
  const startKey = randomUUID();
  const x = await start(local, "NR33", args.modelo, true, startKey);
  assert.deepEqual(await start(local, "NR33", args.modelo, true, startKey), x);
  assert.equal((await start(local, "NR33", args.modelo, true)).id, x.id);
  assert.equal((await survey(x.id, "NR35")).id, x.id);
  await assert.rejects(start(args.moega, "NR35", args.modelo), { code: "42501" });
  await assert.rejects(start(args.moega, "NR33", args.modelo, false, randomUUID(), reader), {
    code: "42501",
  });
  const startRow = await survey(x.id);
  await assert.rejects(finish(x.id, startRow.version), { code: "23514" });
  const payload = {
    "B01.tag": "EC 28",
    "B09.instalada": 2,
    "B14.itens": { SRG: { acao: "verificar", aplicabilidade: "pendente" } },
  };
  const saveKey = randomUUID();
  await assert.rejects(save(x.id, startRow.version, payload, "NR33", saveKey, other), {
    code: "42501",
  });
  await assert.rejects(save(x.id, startRow.version, { "B99.falso": "Campo desconhecido" }), {
    code: "23514",
  });
  const saved = await save(x.id, startRow.version, payload, "NR33", saveKey);
  assert.equal(
    (await save(x.id, startRow.version, payload, "NR33", saveKey)).version,
    saved.version,
  );
  await assert.rejects(save(x.id, startRow.version, { "B09.instalada": 3 }), { code: "40001" });
  await assert.rejects(finish(x.id, saved.version, randomUUID(), other), { code: "42501" });
  const k = randomUUID();
  const closed = await finish(x.id, saved.version, k);
  assert.deepEqual(await finish(x.id, saved.version, k), closed);
  assert.equal(
    (
      await sql`select count(*)::int n from nr_pendencias where documento_id=${closed.documento_id}`
    )[0].n,
    1,
  );
  const report = (
    await sql`select revisao_atual_id from nr_documentos where id=${closed.documento_id}`
  )[0];
  const hash = "0".repeat(64);
  const prepare = () =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return (
        await tx`select nr_coleta_pdf_preparar(${org},${closed.documento_id},${report.revisao_atual_id},${user},${hash},100) result`
      )[0].result;
    });
  await assert.rejects(
    run(
      (tx) =>
        tx`select nr_coleta_pdf_preparar(${org},${closed.documento_id},${report.revisao_atual_id},${user},${hash},100)`,
    ),
    { code: "42501" },
  );
  const asset = await prepare();
  await sql`select nr_arquivo_falhar(${org},${asset.id},${user},'Falha simulada antes do envio')`;
  assert.equal(
    (await sql`select estado from nr_arquivos where id=${asset.id}`)[0].estado,
    "falhou",
  );
  assert.equal((await survey(x.id)).estado, "em_revisao");
  assert.equal((await prepare()).id, asset.id);
  await sql`insert into storage.objects(bucket_id,name,metadata) values ('nexus-nr-acervo',${asset.caminho},${sql.json({ size: 100, mimetype: "application/pdf" })})`;
  assert.equal(
    (
      await sql`select nr_arquivo_confirmar(${org},${asset.id},${user},${hash},100,'application/pdf') result`
    )[0].result.estado,
    "vinculado",
  );
  const locked = await survey(x.id);
  assert.equal(locked.estado, "em_revisao");
  await assert.rejects(
    run(
      (tx) =>
        tx`select nr_executar(${org},'NR33','levantamentos','reabrir',${x.id},${locked.version},${randomUUID()},'{"motivo":"teste"}')`,
    ),
    { code: "23514" },
  );
  await assert.rejects(review(x.id, closed.id, locked.version, "aprovar", randomUUID(), reader), {
    code: "42501",
  });
  await review(x.id, closed.id, locked.version, "devolver");
  const returned = await survey(x.id);
  assert.equal(returned.estado, "rascunho");
  assert.equal(returned.respostas["B09.instalada"], 2);
  const image = randomUUID();
  await sql`insert into nr_modelos(organization_id,normas,tipo,titulo,estado,dados)
    values(${org},array['NR33'],'familia','SRG · Catálogo de teste','publicado','{"cod":"SRG"}')`;
  await sql`insert into nr_arquivos(id,organization_id,cliente_id,unidade_id,local_id,normas,nome,mime,extensao,tamanho,sha256,caminho,estado,
    bytes_verificados,verificado_em,confirmado_em,chave,request_hash,created_by)
    values(${image},${org},${client},${unit},${local},array['NR33','NR35'],'fixture.png','image/png','png',50,${hash},
      ${`${org}/acervo/${image}.png`},'vinculado',true,now(),now(),${randomUUID()},${hash},${user})`;
  const item = {
    acao: "instalar",
    aplicabilidade: "aplicavel",
    quantidade: 2,
    unidade: "un",
    evidencias: [{ arquivo_id: image, legenda: "Foto de teste" }],
  };
  const changed = await save(x.id, returned.version, {
    "B09.instalada": 4,
    "B14.itens": { SRG: item },
  });
  const next = await finish(x.id, changed.version);
  const v = (await survey(x.id)).version;
  await assert.rejects(
    review(x.id, next.id, v, "aprovar", randomUUID(), user, [
      { campo: "B14.itens", codigo: "OUTRO" },
    ]),
    { code: "23514" },
  );
  const reviewed = await review(x.id, next.id, v, "aprovar", randomUUID(), user, [
    { campo: "B14.itens", codigo: "SRG" },
  ]);
  assert.notEqual(reviewed.documento_id, next.documento_id);
  const listByState = async (estado) =>
    (
      await run(
        (tx) =>
          tx`select nr_coleta_listar(${org},${client},${unit},'NR33',${tx.json({ estado })}) result`,
      )
    )[0].result;
  assert.ok((await listByState("aprovada")).rows.some((row) => row.id === x.id));
  assert.ok((await listByState("em_revisao")).rows.every((row) => row.id !== x.id));
  const snapshots =
    await sql`select numero,estado,snapshot from nr_coleta_revisoes where levantamento_id=${x.id} order by numero`;
  assert.deepEqual(
    snapshots.map((r) => [r.numero, r.estado, r.snapshot.valores["B09.instalada"]]),
    [
      [1, "devolvida", 2],
      [2, "aprovada", 4],
    ],
  );
  const documents =
    await sql`select tipo,local_id from nr_documentos where id in (${closed.documento_id},${next.documento_id},${reviewed.documento_id})`;
  assert.equal(documents.filter((d) => d.tipo === "relatorio_campo").length, 2);
  assert.ok(documents.every((d) => d.local_id === local));
  const frozen = (
    await run(
      (tx) =>
        tx`select nr_coleta_snapshot(${org},${client},${unit},'NR33',${x.id},${closed.id}) result`,
    )
  )[0].result;
  assert.equal(frozen.valores["B09.instalada"], 2);
  const modelDoc = (
    await sql`insert into nr_modelos(organization_id,normas,tipo,titulo,estado,dados,conteudo)
    values(${org},array['NR33'],'documento','Memorial de teste','publicado','{"tipo_documento":"memorial"}',
      '{"schema_version":1,"blocos":[{"id":"texto","tipo":"paragrafo","texto":"Rascunho de teste"}]}') returning *`
  )[0];
  const modelVer = (
    await sql`insert into nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,sha256)
    values(${org},${modelDoc.id},1,${sql.json(modelDoc.conteudo)},${sql.json(modelDoc.dados)},${hash}) returning id`
  )[0];
  const derive = (rev) =>
    run(
      (tx) =>
        tx`select nr_coleta_documento(${org},${client},${unit},'NR33',${x.id},${rev},${modelDoc.id},1,${modelVer.id}) result`,
    ).then((r) => r[0].result);
  await assert.rejects(derive(closed.id), { code: "23514" });
  const derived = await derive(next.id);
  assert.deepEqual(await derive(next.id), derived);
  assert.equal(
    (await sql`select local_id from nr_documentos where id=${derived.id}`)[0].local_id,
    local,
  );
  const moega = await start(args.moega, "NR33", args.modelo);
  const m = await survey(moega.id);
  const ms = await save(m.id, m.version, { "B01.tag": "EC 29" });
  const mf = await finish(m.id, ms.version);
  const doc = (
    await sql`select v.conteudo from nr_documentos d join nr_documento_revisoes v on v.id=d.revisao_atual_id where d.id=${mf.documento_id}`
  )[0];
  assert.ok(!JSON.stringify(doc.conteudo).includes("Ventilação fixa por aeração"));
  const a = await start(args.altura, "NR35", null);
  assert.equal((await survey(a.id, "NR35")).modelo_snapshot.dados.id, "NXS-ALT-COLETA-01");
  await assert.rejects(survey(a.id, "NR33"), { code: "42501" });
  const l = (
    await run(
      (tx) =>
        tx`select nr_coleta_listar(${org},${client},${unit},'NR35','{"busca":"SA 05"}') result`,
    )
  )[0].result;
  assert.equal(l.total, 1);
  assert.equal(l.rows[0].dados.coleta_revisao, "aprovada");
  await assert.rejects(
    run((tx) => tx`select * from nr_coleta_revisoes`),
    { code: "42501" },
  );
  const reinspection = (
    await run(
      (tx) =>
        tx`select nr_coleta_iniciar(${org},${client},${unit},'NR33',${local},${args.modelo},1,true,${x.id},${randomUUID()},true) result`,
    )
  )[0].result;
  const inspection = await survey(reinspection.id);
  assert.equal(inspection.dados.finalidade, "reinspecao");
  assert.equal(inspection.dados.coleta_origem_id, x.id);
  assert.deepEqual(inspection.respostas, {});
  console.log(
    "PASS coleta: modelos, recortes, autorização, retry, conflito, validação, revisão, relatórios e RLS",
  );
  console.log("DATABASE=" + sql.options.database);
} finally {
  await sql.end();
}
