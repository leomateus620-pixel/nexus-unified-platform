import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("NR workflow tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const [org, otherOrg, user, reader, outsider, client, unit, otherUnit, foreignClient, foreignUnit] =
  Array.from({ length: 10 }, () => randomUUID());
let checks = 0;
const check = (a, b, m) => {
  assert.deepEqual(a, b, m);
  checks++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
};
const rollback = new Error("rollback workflow fixtures");
try {
  await sql.begin(async (tx) => {
    await tx`insert into auth.users(id,email)values(${user},'flow-eng@test.invalid'),(${reader},'flow-reader@test.invalid'),(${outsider},'flow-other@test.invalid')`;
    await tx`insert into public.organizations(id,nome)values(${org},'Isolated workflow'),(${otherOrg},'Isolated other workflow')`;
    await tx`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${org},${reader}),(${otherOrg},${outsider})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${org},${reader},'campo'),(${otherOrg},${outsider},'engenharia')`;
    await tx`insert into public.clientes(id,organization_id,razao_social,nome_exibicao)values(${client},${org},'Isolated client','Isolated display'),(${foreignClient},${otherOrg},'Foreign isolated client','Foreign display')`;
    await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Isolated unit'),(${otherUnit},${org},${client},'Other isolated unit'),(${foreignUnit},${otherOrg},${foreignClient},'Foreign isolated unit')`;
    const as = (actor, fn) =>
      tx.savepoint(async (t) => {
        await t.unsafe("set local role authenticated");
        await t`select set_config('request.jwt.claim.sub',${actor},true)`;
        const r = await fn(t);
        await t.unsafe("reset role");
        return r;
      });
    const cmd = (
      resource,
      action,
      data = {},
      id = null,
      version = null,
      actor = user,
      norma = "NR33",
      organization = org,
    ) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_executar(${organization},${norma},${resource},${action},${id},${version},${randomUUID()},${t.json(data)})r`
          )[0].r,
      );
    const get = (resource, id, actor = user) =>
      as(
        actor,
        async (t) =>
          (await t`select public.nr_consultar(${org},'NR33',${resource},${t.json({ id })})r`)[0].r,
      );
    const scope = (titulo, more = {}) => ({
      titulo,
      cliente_id: client,
      unidade_id: unit,
      ...more,
    });
    const local = await cmd(
      "locais",
      "salvar",
      scope("Isolated place", { tag: "EC 13A", tipo: "EC", familia: "family-A" }),
    );
    const local2 = await cmd(
      "locais",
      "salvar",
      scope("Second place", { tag: "EC 27B", tipo: "EC", familia: "family-B" }),
    );
    const content = {
      schema_version: 1,
      blocos: [
        { id: "head", tipo: "titulo", texto: "Template heading" },
        { id: "body", tipo: "paragrafo", texto: "Template original body" },
        {
          id: "field",
          tipo: "campo",
          chave: "local.tag",
          modo: "vinculado",
          valor_snapshot: "model placeholder",
        },
        {
          id: "client",
          tipo: "campo",
          chave: "cliente.razao_social",
          modo: "snapshot",
          valor_snapshot: "model client placeholder",
        },
      ],
    };
    const blocks = Array.from({ length: 15 }, (_, i) => ({
      id: "B" + i,
      codigo: "B" + i,
      titulo: "Block " + i,
      campos: [],
    }));
    blocks[0].campos = [
      { id: "B0.tag", nome: "TAG field", tipo: "texto", obrigatorio: true },
      { id: "B0.flag", nome: "Conditional switch", tipo: "texto", obrigatorio: true },
      { id: "B0.zero", nome: "Zero measurement", tipo: "numero", obrigatorio: true },
    ];
    blocks[1].campos = [
      {
        id: "B1.height",
        nome: "Conditional height",
        tipo: "numero",
        obrigatorio: true,
        mostrar_se: { campo: "B0.flag", valor: [true] },
      },
    ];
    blocks[8].aplica_se = { familias: ["family-B"] };
    blocks[8].campos = [
      { id: "B8.fan", nome: "Family-specific fan", tipo: "texto", obrigatorio: true },
    ];
    const model = await cmd("modelos", "salvar", {
      titulo: "Fifteen-block frozen survey",
      tipo: "levantamento",
      dados: { blocos: blocks },
      conteudo: { schema_version: 1, blocos: [] },
    });
    let survey = await cmd(
      "levantamentos",
      "salvar",
      scope("Survey partial", { local_id: local.id, modelo_id: model.id, respostas: {} }),
    );
    const diag = (id = survey.id, actor = user, organization = org, norma = "NR33") =>
      as(
        actor,
        async (t) =>
          (await t`select public.nr_levantamento_validacao(${organization},${norma},${id})r`)[0].r,
      );
    check((await diag()).pode_submeter, false, "missing required answers block review");
    check(
      (await diag()).pendencias.some((p) => p.campo_id === "B0.tag"),
      true,
      "diagnostic points at field/block",
    );
    check((await diag()).blocos_ignorados, ["B8"], "nonapplicable family block excluded");
    await reject(
      () =>
        cmd("levantamentos", "submeter", { motivo: "Review attempt" }, survey.id, survey.version),
      "23514",
    );
    survey = await cmd(
      "levantamentos",
      "salvar",
      { respostas: { "B0.tag": "EC 13A", "B0.flag": false, "B0.zero": 0 } },
      survey.id,
      survey.version,
    );
    check(
      (await diag()).pode_submeter,
      true,
      "zero and false are informed values; hidden conditional field not required",
    );
    check((await diag()).campos_obrigatorios, 3, "required count respects frozen15 blocks");
    const changedModel = await cmd(
      "modelos",
      "salvar",
      {
        dados: {
          blocos: [
            ...blocks,
            {
              id: "B16",
              codigo: "B16",
              titulo: "New block",
              campos: [
                { id: "B16.new", nome: "New required field", obrigatorio: true, tipo: "texto" },
              ],
            },
          ],
        },
      },
      model.id,
      model.version,
    );
    check(
      (await diag()).campos_obrigatorios,
      3,
      "later model edit does not reinterpret frozen survey",
    );
    const newerSurvey = await cmd(
      "levantamentos",
      "salvar",
      scope("New current-model snapshot", {
        local_id: local.id,
        modelo_id: model.id,
        respostas: { "B0.tag": "EC13", "B0.flag": false, "B0.zero": 0 },
      }),
    );
    const newDiag = await diag(newerSurvey.id);
    check(
      newDiag.pendencias.some((p) => p.campo_id === "B16.new"),
      true,
      "new survey actually fixes newly edited model snapshot",
    );
    check(
      newerSurvey.modelo_versao_id === survey.modelo_versao_id,
      false,
      "different model versions remain distinct",
    );
    survey = await cmd(
      "levantamentos",
      "submeter",
      { motivo: "Complete required fields" },
      survey.id,
      survey.version,
    );
    check(survey.estado, "em_revisao", "complete frozen version submitted");
    survey = await cmd(
      "levantamentos",
      "reabrir",
      { motivo: "Review conditional applicability" },
      survey.id,
      survey.version,
    );
    survey = await cmd(
      "levantamentos",
      "salvar",
      { respostas: { "B0.flag": true } },
      survey.id,
      survey.version,
    );
    check(
      (await diag()).pendencias.some((p) => p.campo_id === "B1.height"),
      true,
      "conditional required field activates exactly",
    );
    await reject(
      () =>
        cmd(
          "levantamentos",
          "submeter",
          { motivo: "Missing conditional field" },
          survey.id,
          survey.version,
        ),
      "23514",
    );
    survey = await cmd(
      "levantamentos",
      "salvar",
      { respostas: { "B1.height": 0 } },
      survey.id,
      survey.version,
    );
    check((await diag()).pode_submeter, true, "conditional zero preserved");
    const noFields = await cmd("modelos", "salvar", {
      titulo: "Legacy observed15 blocks",
      tipo: "levantamento",
      dados: {
        campos_nao_expostos: true,
        blocos: Array.from({ length: 15 }, (_, i) => ({
          id: "legacy" + i,
          titulo: "Observed block",
          campos: [],
        })),
      },
    });
    const historic = await cmd(
      "levantamentos",
      "salvar",
      scope("Legacy survey", { modelo_id: noFields.id, local_id: local.id }),
    );
    check((await diag(historic.id)).modelo_conhecido, false, "unknown legacy fields not invented");
    check(
      (await diag(historic.id)).pendencias.length,
      1,
      "unknown legacy schema has one precise blocker, not104 missing fields",
    );
    await reject(
      () =>
        cmd(
          "levantamentos",
          "submeter",
          { motivo: "No exposed fields" },
          historic.id,
          historic.version,
        ),
      "23514",
    );
    await reject(() => diag(survey.id, outsider), "42501");
    await reject(() => diag(survey.id, user, org, "NR35"), "42501");
    const dm = await cmd("modelos", "salvar", {
      titulo: "Editable document template",
      tipo: "documento",
      conteudo: content,
      dados: { fonte: "Isolated template reference" },
    });
    const create = (data, key = randomUUID(), actor = user, organization = org, norma = "NR33") =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_documento_de_modelo(${organization},${norma},${key},${t.json(data)})r`
          )[0].r,
      );
    const args = {
      cliente_id: client,
      unidade_id: unit,
      local_id: local.id,
      titulo: "Document from template",
      modelo_id: dm.id,
      modelo_expected_version: dm.version,
      usar_rascunho: true,
    };
    await reject(() => create({ ...args, usar_rascunho: false }), "23514");
    const key = randomUUID(),
      created = await create(args, key);
    let doc = created.registro;
    check(doc.estado, "rascunho", "template does not confer issuance/approval");
    check(doc.conteudo.blocos[0].texto, "Template heading", "template heading copied");
    check(doc.conteudo.blocos[1].texto, "Template original body", "template body copied");
    check(
      doc.conteudo.blocos[2].valor_snapshot,
      "EC 13A",
      "linked value resolved from exact local",
    );
    check(
      doc.conteudo.blocos[3].valor_snapshot,
      "Isolated client",
      "client field captured as snapshot",
    );
    check(doc.conteudo.blocos[2].fonte_snapshot.id, local.id, "source UUID captured");
    check(doc.conteudo.blocos[2].fonte_snapshot.version, local.version, "source version captured");
    check(doc.conteudo.blocos[2].fonte_snapshot.sha256.length, 64, "source hash captured");
    check(
      (await create(args, key)).registro.id,
      doc.id,
      "same document creation request idempotent",
    );
    await reject(() => create({ ...args, titulo: "Different request" }, key), "23505");
    const provenance = (
      await tx`select * from public.nr_documento_modelos where organization_id=${org} and documento_id=${doc.id}`
    )[0];
    check(provenance.modelo_id, dm.id, "relational model identity");
    check(provenance.modelo_estado_capturado, "rascunho", "draft source state explicit");
    check(provenance.rascunho_reconhecido, true, "draft recognition retained");
    check(
      (
        await tx`select snapshot->'modelo_origem'->>'herda_aprovacao'as inherited from public.nr_documento_revisoes where id=${doc.revisao_atual_id}`
      )[0].inherited,
      "false",
      "approval never inherited",
    );
    await reject(
      () =>
        tx.savepoint(
          (t) =>
            t`update public.nr_documento_modelos set modelo_estado_capturado='publicado'where organization_id=${org} and documento_id=${doc.id}`,
        ),
      "23514",
    );
    await reject(() => create(args, randomUUID(), reader), "42501");
    await reject(() => create(args, randomUUID(), outsider), "42501");
    await reject(
      () => create({ ...args, cliente_id: foreignClient, unidade_id: foreignUnit }),
      "42501",
    );
    await reject(() => create({ ...args, modelo_expected_version: dm.version + 1 }), "40001");
    await reject(
      () => create({ ...args, modelo_id: model.id, modelo_expected_version: changedModel.version }),
      "42501",
    );
    const fields = (actor = user, localId = local.id, organization = org) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_documento_campos(${organization},'NR33',${client},${unit},${localId})r`
          )[0].r,
      );
    const values = await fields();
    check(values.campos.length, 9, "exact documented field allowlist");
    check(
      values.campos.find((v) => v.chave === "local.tag").valor,
      "EC 13A",
      "authorized capture value",
    );
    await reject(() => fields(outsider), "42501");
    await reject(() => fields(user, randomUUID()), "42501");
    const forged = structuredClone(doc.conteudo);
    forged.blocos[2].valor_snapshot = "FORGED LOCAL TAG";
    doc = await cmd("documentos", "salvar", { conteudo: forged }, doc.id, doc.version);
    check(
      doc.conteudo.blocos[2].valor_snapshot,
      "EC 13A",
      "direct RPC forged linked value cannot persist",
    );
    const stale = structuredClone(doc.conteudo);
    stale.blocos[2].fonte_snapshot.version += 1;
    await reject(
      () => cmd("documentos", "salvar", { conteudo: stale }, doc.id, doc.version),
      "40001",
    );
    await reject(
      () => cmd("documentos", "salvar", { local_id: local2.id }, doc.id, doc.version),
      "23514",
    );
    const originalCaptured = structuredClone(doc.conteudo.blocos[2]);
    await cmd("locais", "salvar", { tag: "EC 13A corrected" }, local.id, local.version);
    const unchanged = structuredClone(doc.conteudo);
    unchanged.blocos[1].texto = "Edited paragraph, old captured data retained";
    doc = await cmd("documentos", "salvar", { conteudo: unchanged }, doc.id, doc.version);
    check(
      doc.conteudo.blocos[2],
      originalCaptured,
      "unmodified linked snapshot not regenerated silently",
    );
    check(doc.revisao_necessaria, true, "local edit marks dependent document for explicit review");
    const refresh = structuredClone(doc.conteudo);
    refresh.blocos[2].valor_snapshot = "ask capture";
    delete refresh.blocos[2].fonte_snapshot;
    doc = await cmd("documentos", "salvar", { conteudo: refresh }, doc.id, doc.version);
    check(
      doc.conteudo.blocos[2].valor_snapshot,
      "EC 13A corrected",
      "explicit recapture obtains current value",
    );
    const manual = structuredClone(doc.conteudo);
    manual.blocos[2].modo = "livre";
    manual.blocos[2].valor_snapshot = "Manual technical value";
    manual.blocos[2].motivo_substituicao = "";
    await reject(
      () => cmd("documentos", "salvar", { conteudo: manual }, doc.id, doc.version),
      "23514",
    );
    manual.blocos[2].motivo_substituicao = "Declared reason for manual substitution";
    doc = await cmd("documentos", "salvar", { conteudo: manual }, doc.id, doc.version);
    check(
      doc.conteudo.blocos[2].valor_snapshot,
      "Manual technical value",
      "justified manual override persists",
    );
    const versionBefore =
      await tx`select id,conteudo from public.nr_documento_revisoes where id=${doc.revisao_atual_id}`;
    doc = await cmd(
      "documentos",
      "nova_revisao",
      { motivo: "New version preserves original revision" },
      doc.id,
      doc.version,
    );
    check(
      (
        await tx`select conteudo from public.nr_documento_revisoes where id=${versionBefore[0].id}`
      )[0].conteudo,
      versionBefore[0].conteudo,
      "new version preserves prior content",
    );
    await reject(
      () =>
        tx.savepoint(
          (t) =>
            t`update public.nr_documento_revisoes set conteudo='{"schema_version":1,"blocos":[]}'where id=${versionBefore[0].id}`,
        ),
      "23514",
    );
    const folders = [];
    for (const title of ["Alpha", "Beta", "Gamma"])
      folders.push(await cmd("pastas", "salvar", scope(title)));
    const order = (p, direction, key = randomUUID(), actor = user, version = p.version) =>
      as(
        actor,
        async (t) =>
          (
            await t`select public.nr_pasta_ordenar(${org},'NR33',${p.id},${version},${direction},${key})r`
          )[0].r,
      );
    const list = () =>
      as(
        user,
        async (t) =>
          (
            await t`select public.nr_consultar(${org},'NR33','pastas',${t.json({ cliente_id: client, unidade_id: unit, pasta_id: null })})r`
          )[0].r,
      );
    check(
      (await list()).rows.map((r) => r.titulo),
      ["Alpha", "Beta", "Gamma"],
      "default folder order stable",
    );
    const orderKey = randomUUID();
    const ordered = await order(folders[1], "subir", orderKey);
    check(
      (await list()).rows.map((r) => r.titulo),
      ["Beta", "Alpha", "Gamma"],
      "manual order persists",
    );
    check(
      (await order(folders[1], "subir", orderKey)).registro.id,
      folders[1].id,
      "folder order retry idempotent",
    );
    await reject(() => order(folders[1], "descer", randomUUID()), "40001");
    await reject(() => order(ordered.registro, "subir"), "23514");
    await reject(() => order(ordered.registro, "descer", randomUUID(), reader), "42501");
    check(ordered.registro.parent_id, null, "ordering preserves parent");
    await reject(
      () => as(user, (t) => t`update public.nr_pastas set ordem=999 where id=${folders[1].id}`),
      "42501",
    );
    throw rollback;
  });
} catch (e) {
  if (e !== rollback) throw e;
} finally {
  await sql.end();
}
console.log(
  JSON.stringify({
    suite: "NR workflows/model/capture/folder order",
    assertions: checks,
    passed: true,
    scope:
      "isolated synthetic fixtures rolled back; no production data, approval, emission or safety conclusion",
  }),
);
