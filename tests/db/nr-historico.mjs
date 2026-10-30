import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("NR history tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const [
  org,
  otherOrg,
  user,
  reader,
  noRole,
  outsider,
  client,
  client2,
  foreignClient,
  unit,
  unit2,
  unit3,
  foreignUnit,
  doc,
  model,
  foreignDoc,
] = Array.from({ length: 16 }, () => randomUUID());
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  assertions++;
};
const rollback = new Error("rollback synthetic NR history fixtures");
try {
  await sql.begin(async (tx) => {
    await tx`insert into auth.users(id,email)values(${user},'history-eng@test.invalid'),(${reader},'history-campo@test.invalid'),(${noRole},'history-commercial@test.invalid'),(${outsider},'history-other@test.invalid')`;
    await tx`insert into public.organizations(id,nome)values(${org},'Isolated history organization'),(${otherOrg},'Isolated other history organization')`;
    await tx`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${org},${reader}),(${org},${noRole}),(${otherOrg},${outsider})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${org},${reader},'campo'),(${org},${noRole},'comercial'),(${otherOrg},${outsider},'engenharia')`;
    await tx`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Isolated client'),(${client2},${org},'Isolated second client'),(${foreignClient},${otherOrg},'Isolated foreign client')`;
    await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Isolated unit'),(${unit2},${org},${client},'Isolated second unit'),(${unit3},${org},${client2},'Isolated other client unit'),(${foreignUnit},${otherOrg},${foreignClient},'Isolated foreign unit')`;
    const secret = "privatePayload-" + randomBytes(24000).toString("hex");
    const content = (n) => ({
      schema_version: 1,
      blocos: [{ id: randomUUID(), tipo: "paragrafo", texto: `revision-${n}-${secret}` }],
    });
    await tx`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,created_by)values(${doc},${org},${client},${unit},array['NR33'],'Isolated document',${user}),(${foreignDoc},${otherOrg},${foreignClient},${foreignUnit},array['NR33'],'Foreign document',${outsider})`;
    await tx`insert into public.nr_modelos(id,organization_id,normas,titulo,dados,conteudo,created_by)values(${model},${org},array['NR33'],'Isolated current model',${tx.json({ blocos: [{ codigo: "B01", campos: Array.from({ length: 104 }, (_, i) => ({ id: "field-" + i, nome: "Field " + i })) }] })},${tx.json(content("current"))},${user})`;
    const documentRevisions = [],
      modelRevisions = [];
    for (let n = 1; n <= 31; n++) {
      const id = randomUUID(),
        mid = randomUUID();
      documentRevisions.push(id);
      modelRevisions.push(mid);
      await tx`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,vigencia,conteudo,snapshot,created_by)values(${id},${org},${doc},${n},${n === 31 ? "vigente" : "superada"},${tx.json(content(n))},${tx.json({ original: secret })},${user})`;
      await tx`insert into public.nr_modelo_versoes(id,organization_id,modelo_id,numero,conteudo,dados,sha256,created_by)values(${mid},${org},${model},${n},${tx.json(content(n))},${tx.json({ snapshot: secret })},${"a".repeat(64)},${user})`;
    }
    await tx`update public.nr_documentos set revisao_atual_id=${documentRevisions.at(-1)} where id=${doc}`;
    const as = async (actor, fn) =>
      tx.savepoint(async (t) => {
        await t.unsafe("set local role authenticated");
        await t`select set_config('request.jwt.claim.sub',${actor},true)`;
        const result = await fn(t);
        await t.unsafe("reset role");
        return result;
      });
    const historyIds = [];
    for (let n = 0; n < 35; n++) {
      const data = {
        normas: ["NR33"],
        ...(n < 5 ? {} : { cliente_id: client, unidade_id: unit }),
        snapshot: secret,
      };
      const row = (
        await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,motivo,created_at)values(${org},'documentos',${doc},'isolated_update',${tx.json(data)},'Isolated test audit',${new Date(Date.UTC(2026, 0, 1, 0, 0, 35 - n))})returning id::text`
      )[0];
      historyIds.push(row.id);
    }
    // Missing context is completed only from exact same-org parent ID, without touching existing snapshots.
    const filled = (
      await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois)values(${org},'documentos',${doc},'isolated_exact_parent',${tx.json({ snapshot: secret })})returning id::text,normas_contexto,cliente_contexto,unidade_contexto,depois`
    )[0];
    check(filled.normas_contexto, ["NR33"], "new action inherits only exact existing parent norm");
    check(filled.unidade_contexto, unit, "new action inherits exact parent unit");
    check(filled.depois.snapshot, secret, "original audit payload preserved");
    const unknownId = (
      await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois)values(${org},'eventos_origem',${randomUUID()},'isolated_source',${tx.json({ payload_origem: { date: "unparsed legacy date", text: secret } })})returning id::text`
    )[0].id;
    const restrictedId = (
      await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois)values(${org},'recibos_storage',${randomUUID()},'isolated_private',${tx.json({ normas: ["NR33"], snapshot: secret })})returning id::text`
    )[0].id;
    const isolated = async (normas, cliente, unidade, organization = org) =>
      (
        await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois)values(${organization},'eventos_isolados',${randomUUID()},'test',${tx.json({ normas, cliente_id: cliente, unidade_id: unidade, snapshot: secret })})returning id::text`
      )[0].id;
    const otherNorm = await isolated(["NR35"], client, unit),
      otherUnit = await isolated(["NR33"], client, unit2),
      otherClient = await isolated(["NR33"], client2, unit3),
      otherOrgEvent = await isolated(["NR33"], foreignClient, foreignUnit, otherOrg);
    const globalEvent = (
      await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois)values(${org},'eventos_isolados',${randomUUID()},'isolated_global',${tx.json({ normas: ["NR33"] })})returning id::text`
    )[0].id;
    const hugeId = "9007199254740995";
    await tx`insert into public.nr_historico(id,organization_id,recurso,registro_id,comando,depois,created_at)overriding system value values(${hugeId},${org},'eventos_isolados',${randomUUID()},'large_identifier',${tx.json({ normas: ["NR33"] })},'2025-01-01T00:00:00Z')`;
    const q = (filters = {}, norma = "NR33", actor = user, organization = org) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_consultar(${organization},${norma},'historico',${t.json(filters)})r`
          )[0].r,
      );
    const hs = (
      page = 0,
      limit = 25,
      actor = user,
      organization = org,
      norma = "NR33",
      resource = "documentos",
      id = doc,
    ) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_historico_listar(${organization},${norma},${resource},${id},${page},${limit})r`
          )[0].r,
      );
    const hd = (id, actor = user, organization = org, norma = "NR33") =>
      as(
        actor,
        async (t) =>
          (await t`select public.nr_historico_detalhe(${organization},${norma},${id}::bigint)r`)[0]
            .r,
      );
    const rs = (
      resource = "documentos",
      id = doc,
      page = 0,
      limit = 25,
      actor = user,
      organization = org,
      norma = "NR33",
    ) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_revisoes_listar(${organization},${norma},${resource},${id},${page},${limit})r`
          )[0].r,
      );
    const rd = (
      revision,
      resource = "documentos",
      id = doc,
      actor = user,
      organization = org,
      norma = "NR33",
    ) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_revisao_detalhe(${organization},${norma},${resource},${id},${revision})r`
          )[0].r,
      );
    const first = await hs(),
      second = await hs(1);
    check(first.rows.length, 25, "first event page limited25");
    check(second.rows.length, 11, "second event page returns remainder");
    check(first.total, 36, "event total server-side");
    check(
      new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
      36,
      "pages do not overlap",
    );
    check(first.rows[1].id, historyIds[0], "date order wins over increasing identity order");
    check(
      first.rows.every((r) => typeof r.id === "string"),
      true,
      "event bigint IDs are serialized as strings",
    );
    check(JSON.stringify(first).includes(secret), false, "event list excludes both snapshots");
    check(Object.hasOwn(first.rows[0], "depois"), false, "event metadata has no after payload");
    const full = await hd(historyIds[0]);
    check(full.depois.snapshot, secret, "full event snapshot fetched on demand");
    check((await hd(hugeId)).id, hugeId, "bigint survives exact roundtrip");
    const r1 = await rs(),
      r2 = await rs("documentos", doc, 1);
    check(r1.rows.length, 25, "revision list first25");
    check(r2.rows.length, 6, "revision list remainder");
    check(r1.rows[0].numero, 31, "revision ordering newestnumber first");
    check(
      JSON.stringify(r1).includes(secret),
      false,
      "revision list excludes content and raw snapshot",
    );
    check(
      (await rd(documentRevisions[0])).snapshot.original,
      secret,
      "past document snapshot available on demand",
    );
    check(
      (await rd(documentRevisions[0])).vigencia,
      "superada",
      "past version remains explicitly superseded",
    );
    const mr = await rs("modelos", model);
    check(mr.rows.length, 25, "model version pagination");
    check(
      JSON.stringify(mr).includes(secret),
      false,
      "model metadata excludes historical dados/content",
    );
    check(
      (await rd(modelRevisions[0], "modelos", model)).dados.snapshot,
      secret,
      "model immutable snapshot fetched on demand",
    );
    check(
      (await rd(modelRevisions[0], "modelos", model)).fontes_publicacao,
      [],
      "model detail has scoped publication references",
    );
    const detail = await as(
      user,
      async (t) =>
        (await t`select public.nr_consultar(${org},'NR33','documentos',${t.json({ id: doc })})r`)[0]
          .r,
    );
    check(detail.revisoes.length, 25, "automatic document detail revision metadata capped25");
    check(detail.historico.length, 25, "automatic document detail audit metadata capped25");
    check(detail.revisoes_total, 31, "document revision total retained");
    check(detail.historico_total, 36, "document event total retained");
    check(
      detail.conteudo.blocos[0].texto.includes("revision-31-"),
      true,
      "current content preserved for editor/export",
    );
    check(
      JSON.stringify(detail.revisoes).includes(secret),
      false,
      "current detail does not eager-load past revisions",
    );
    const md = await as(
      user,
      async (t) =>
        (await t`select public.nr_consultar(${org},'NR33','modelos',${t.json({ id: model })})r`)[0]
          .r,
    );
    check(md.dados.blocos[0].campos.length, 104, "current editable model fields remain complete");
    check(
      md.conteudo.blocos[0].texto.includes("revision-current-"),
      true,
      "current model body preserved",
    );
    const all = await q({ limite: 100 });
    check(
      all.rows.some((r) => r.id === unknownId && r.escopo === "nao_classificado"),
      true,
      "unclassified source events visible without client/unit filters",
    );
    check(
      (await hd(unknownId)).escopo,
      "nao_classificado",
      "unclassified source detail is explicit",
    );
    const scoped = await q({ cliente_id: client, unidade_id: unit, limite: 100 });
    check(
      scoped.rows.some((r) => r.id === unknownId),
      false,
      "unknown source scope not assigned to selected unit",
    );
    check(
      scoped.rows.some((r) => r.id === otherNorm),
      false,
      "global history norm filter preserved",
    );
    check(
      scoped.rows.some((r) => r.id === otherUnit),
      false,
      "global history unit filter preserved",
    );
    check(
      scoped.rows.some((r) => r.id === otherClient),
      false,
      "global history client filter preserved",
    );
    check(
      scoped.rows.some((r) => r.id === globalEvent),
      true,
      "global-null context remains visible in filtered history",
    );
    check(
      all.rows.some((r) => r.id === otherOrgEvent),
      false,
      "other organization events absent",
    );
    check(JSON.stringify(all).includes(secret), false, "global event list excludes full snapshots");
    const raw = await q({ limite: 100 }, "NR33", reader);
    check(
      raw.rows.some((r) => r.id === restrictedId),
      false,
      "viewer list excludes private migration receipts",
    );
    await reject(() => hd(restrictedId, reader), "42501");
    check(
      (await hd(restrictedId)).depois.snapshot,
      secret,
      "configurator can inspect private receipt on demand",
    );
    check(
      (
        await as(
          reader,
          (t) => t`select id from public.nr_historico where id=${restrictedId}::bigint`,
        )
      ).length,
      0,
      "RLS blocks direct private audit read",
    );
    await reject(() => hs(0, 25, outsider), "42501");
    await reject(() => hs(0, 25, user, otherOrg), "42501");
    await reject(() => hs(0, 25, noRole), "42501");
    await reject(() => hs(0, 25, user, org, "NR35"), "42501");
    await reject(() => hd(otherOrgEvent), "42501");
    await reject(() => hd(historyIds[0], user, org, "NR35"), "42501");
    await reject(() => rs("documentos", foreignDoc), "42501");
    await reject(() => rd(documentRevisions[0], "modelos", model), "42501");
    await reject(() => hs(-1), "23514");
    await reject(() => rs("documentos", doc, 0, 101), "23514");
    await reject(() => rs("documentos", doc, null), "23514");
    await reject(
      () =>
        as(
          user,
          (t) =>
            t`update public.nr_documento_revisoes set conteudo='{}'where id=${documentRevisions[0]}`,
        ),
      "42501",
    );
    await reject(
      () =>
        tx.savepoint(
          (t) =>
            t`update public.nr_historico set motivo='overwrite'where id=${historyIds[0]}::bigint`,
        ),
      "23514",
    );
    const generated =
      await tx`select is_generated from information_schema.columns where table_schema='public'and table_name='nr_historico'and column_name in('normas_contexto','cliente_contexto','unidade_contexto')`;
    check(
      generated.every((r) => r.is_generated === "ALWAYS") && generated.length === 3,
      true,
      "indexed context is generated from immutable audit records",
    );
    const lot = randomUUID(),
      foreignLot = randomUUID(),
      items = [];
    await tx`insert into public.nr_import_lotes(id,organization_id,origem,chave,estado,manifesto,checkpoint,created_by)values(${lot},${org},'Isolated source','history-inspection','com_pendencias',${tx.json({ raw: secret })},${tx.json({ payload: secret })},${user}),(${foreignLot},${otherOrg},'Foreign isolated source','history-inspection','com_pendencias','{}','{}',${outsider})`;
    for (let n = 0; n < 31; n++) {
      const id = randomUUID();
      items.push(id);
      await tx`insert into public.nr_import_itens(id,organization_id,lote_id,origem,tipo,externo_id,cliente_id,unidade_id,payload,sha256,snapshot_destino,resultado,motivo,evidencia,capturado_em)values(${id},${org},${lot},'Isolated source',${n < 20 ? "local" : "registro_documental"},${"external-" + n},${client},${unit},${tx.json({ raw: secret })},${"b".repeat(64)},${tx.json({ snapshot: secret })},${n < 20 ? "importado" : "indisponivel"},'Isolated source outcome',${tx.json({ raw: secret })},now())`;
    }
    const inspect = (lote = null, item = null, filters = {}, actor = user, organization = org) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_importacao_inspecionar(${organization},${lote},${item},${t.json(filters)})r`
          )[0].r,
      );
    const lots = await inspect();
    check(lots.total, 1, "import lots scoped by organization");
    check(
      JSON.stringify(lots).includes(secret),
      false,
      "lot metadata omits raw checkpoint and manifest",
    );
    const inspected = await inspect(lot),
      inspected2 = await inspect(lot, null, { pagina: 1 });
    check(inspected.rows.length, 25, "import item metadata first25");
    check(inspected2.rows.length, 6, "import item metadata next page");
    check(inspected.total, 31, "import total counts actual records");
    check(
      JSON.stringify(inspected).includes(secret),
      false,
      "item metadata omits source payload, evidence and snapshots",
    );
    check(
      inspected.por_resultado,
      [
        { resultado: "importado", quantidade: 20 },
        { resultado: "indisponivel", quantidade: 11 },
      ],
      "import results aggregate all lot outcomes",
    );
    check(
      (await inspect(lot, null, { resultado: "indisponivel" })).total,
      11,
      "terminal result filter",
    );
    check((await inspect(lot, null, { tipo: "local" })).total, 20, "source category filter");
    check((await inspect(lot, null, { busca: "external-30" })).total, 1, "external ID search");
    check(
      (await inspect(lot, null, { unidade_id: unit2 })).total,
      0,
      "unit filter does not cross context",
    );
    check(
      (await inspect(lot, items[0])).item.payload.raw,
      secret,
      "raw source payload only on demand",
    );
    check((await inspect(lot, items[0])).item.evidencia.raw, secret, "raw evidence only on demand");
    await reject(() => inspect(lot, null, {}, reader), "42501");
    await reject(() => inspect(lot, null, {}, outsider), "42501");
    await reject(() => inspect(lot, null, {}, user, otherOrg), "42501");
    await reject(() => inspect(foreignLot), "42501");
    await reject(() => inspect(foreignLot, items[0]), "42501");
    await reject(() => inspect(null, items[0]), "23514");
    await reject(() => inspect(lot, null, { limite: 101 }), "23514");
    await reject(() => inspect(lot, null, { resultado: "inventado" }), "23514");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await sql.end();
}
console.log(
  JSON.stringify({
    suite: "nr-historico-paginado",
    assertions,
    result: "passed",
    fixtures: "synthetic isolated rollback",
    production_writes: false,
  }),
);
