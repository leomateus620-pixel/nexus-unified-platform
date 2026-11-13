import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Use um PostgreSQL descartável no loopback.");

const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  onnotice: () => {},
});

const org = randomUUID();
const client = randomUUID();
const unit = randomUUID();
const otherUnit = randomUUID();
const est = randomUUID();
const tst = randomUUID();
const otherTst = randomUUID();
const admin = randomUUID();
const otherOrg = randomUUID();
const otherOrgAdmin = randomUUID();
const asset = randomUUID();
const otherAsset = randomUUID();
const historicalDoc = randomUUID();
const historicalFile = randomUUID();
const historicalPath = `${org}/${historicalFile}/original.pdf`;
const fixtureDigest = createHash("sha256").update("metadados de teste").digest("hex");
let checks = 0;

const as = (user, run) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return run(tx);
  });

const reject = async (work, code) => {
  await assert.rejects(work, { code });
  checks++;
};
const equal = (value, expected) => {
  assert.deepEqual(value, expected);
  checks++;
};
const exec = (user, comando, dados, row, chave = randomUUID(), atribuicaoId) =>
  as(user, async (tx) => {
    const request = {
      comando,
      chave,
      dados,
      ...(row && { id: row.id, expected_version: row.version }),
      ...(atribuicaoId && { atribuicao_id: atribuicaoId }),
    };
    return (await tx`select inspecoes_executar(${org},${tx.json(request)}) r`)[0].r;
  });

try {
  await sql`insert into organizations(id,nome) values(${org},'Inspeções TESTE DESCARTÁVEL')`;
  await sql`insert into organizations(id,nome) values(${otherOrg},'Outra organização de teste')`;
  for (const user of [est, tst, otherTst, admin, otherOrgAdmin]) {
    await sql`insert into auth.users(id) values(${user})`;
    await sql`insert into memberships(organization_id,user_id) values(${user === otherOrgAdmin ? otherOrg : org},${user})`;
  }
  await sql`insert into user_roles(organization_id,user_id,role) values(${org},${admin},'admin')`;
  await sql`insert into user_roles(organization_id,user_id,role) values(${otherOrg},${otherOrgAdmin},'admin')`;
  await sql`insert into clientes(id,organization_id,razao_social) values(${client},${org},'Cliente teste')`;
  for (const id of [unit, otherUnit]) {
    await sql`insert into unidades(id,organization_id,cliente_id,nome) values(${id},${org},${client},${id})`;
    await sql`insert into inspecoes_contextos(organization_id,cliente_id,unidade_id) values(${org},${client},${id})`;
  }
  const checklist = [
    { id: "ANC-01", item: "Trinca", critico: true },
    { id: "ANC-02", item: "Placa", critico: false },
  ];
  await sql`insert into inspecoes_registros(organization_id,colecao,source_id,titulo,codigo,snapshot)
    values(${org},'familias','ANC','Ancoragem','ANC',${sql.json({ checklist })})`;
  for (const [id, context] of [
    [asset, unit],
    [otherAsset, otherUnit],
  ]) {
    await sql`insert into inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,codigo,familia,snapshot)
      values(${id},${org},${client},${context},'ativos',${id},'Ativo teste','ANC-TESTE','ANC','{}')`;
  }
  await sql`insert into inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,situacao,snapshot)
    values(${historicalDoc},${org},${client},${otherUnit},'documentos','HIST-TESTE','Histórico teste','recebido','{}')`;
  await sql`insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',${historicalPath},'{"size":24,"mimetype":"application/pdf"}')`;
  await sql`insert into inspecoes_arquivos(id,organization_id,cliente_id,unidade_id,registro_id,papel,nome,estado,
    origem,caminho,sha256,bytes,mime)
    values(${historicalFile},${org},${client},${otherUnit},${historicalDoc},'original','original.pdf',
      'original_verificado','fixture',${historicalPath},${fixtureDigest},24,'application/pdf')`;
  await sql.begin(async (fixture) => {
    await fixture`select set_config('request.jwt.claim.sub',${admin},true)`;
    for (const [perfil, users] of [
      ["EST", [est]],
      ["TST", [tst, otherTst]],
    ]) {
      const competencia = randomUUID();
      await fixture`insert into competencias(id,organization_id,nome,exige_evidencia,created_by)
      values(${competencia},${org},${perfil},false,${admin})`;
      await fixture`insert into inspecoes_perfis_competencias values(${org},${perfil},${competencia})`;
      for (const user of users) {
        const pessoa = randomUUID();
        const qualificacao = randomUUID();
        await fixture`insert into pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional,created_by)
        values(${pessoa},${org},${perfil},'colaborador',${user},'REG-TESTE',${admin})`;
        await fixture`insert into pessoa_qualificacoes(id,organization_id,pessoa_id,competencia_id,emissor,conclusao,
        validade,estado,conferido_por,conferido_em,created_by)
        values(${qualificacao},${org},${pessoa},${competencia},'fixture',current_date-30,current_date+30,
          'validada',${admin},now(),${admin})`;
        await fixture`insert into inspecoes_atribuicoes(organization_id,user_id,pessoa_id,qualificacao_id,perfil,
        cliente_id,unidade_id,biblioteca,inicio,designacao,concedido_por)
        values(${org},${user},${pessoa},${qualificacao},${perfil},
          ${perfil === "EST" ? null : client},${perfil === "EST" ? null : unit},${perfil === "EST"},
          current_date-7,'designação de teste',${admin})`;
      }
    }
  });

  equal(await as(admin, async (tx) => (await tx`select inspecoes_acesso(${org}) a`)[0].a), []);
  equal(
    await as(admin, async (tx) =>
      (await tx`select inspecoes_contexto(${org}) a`)[0].a.map((x) => x.unidade_id).sort(),
    ),
    [unit, otherUnit].sort(),
  );
  equal(
    await as(
      admin,
      async (tx) =>
        (
          await tx`select inspecoes_pode(${org},${client},${unit},'gerir_acervo') as gerir,
        inspecoes_pode(${org},${client},${unit},'est') as est,
        inspecoes_pode(${org},${client},${unit},'ensaio') as ensaio,
        inspecoes_pode(${org},null,null,'biblioteca') as biblioteca,
        inspecoes_pode(${org},null,null,'importar') as importar,
        inspecoes_pode(${org},null,null,'comunicar') as comunicar,
        inspecoes_pode(${org},${client},${randomUUID()},'gerir_acervo') as fora`
        )[0],
    ),
    {
      gerir: true,
      est: false,
      ensaio: false,
      biblioteca: false,
      importar: false,
      comunicar: false,
      fora: false,
    },
  );
  equal(
    await as(otherOrgAdmin, async (tx) => (await tx`select inspecoes_contexto(${org}) a`)[0].a),
    [],
  );
  equal(
    await as(
      admin,
      async (tx) =>
        (await tx`select name from storage.objects where name=${historicalPath}`).length,
    ),
    1,
  );
  equal(
    await as(
      otherOrgAdmin,
      async (tx) =>
        (await tx`select name from storage.objects where name=${historicalPath}`).length,
    ),
    0,
  );
  await reject(() => exec(admin, "criar", { ativo_id: asset, tipo: "T2" }), "42501");
  await reject(
    () => as(otherOrgAdmin, (tx) => tx`select inspecoes_acessos_listar(${org},'',0)`),
    "42501",
  );
  await reject(() => as(tst, (tx) => tx`select inspecoes_acessos_listar(${org},'',0)`), "42501");
  await reject(() => as(admin, (tx) => tx`select inspecoes_admin(${org},${admin})`), "42501");

  const membership = await as(
    admin,
    async (tx) => (await tx`select inspecoes_acessos_listar(${org},'',0) a`)[0].a,
  );
  equal(membership.total, 4);
  const tstQual = membership.membros.find((item) => item.user_id === tst).qualificacoes[0].id;
  const assignment = (comando, key = randomUUID(), actor = admin) =>
    as(
      actor,
      async (tx) =>
        (await tx`select inspecoes_acessos_executar(${org},${key},${tx.json(comando)}) a`)[0].a,
    );
  const requestGrant = {
    acao: "designar",
    user_id: tst,
    qualificacao_id: tstQual,
    perfil: "TST",
    cliente_id: client,
    unidade_id: otherUnit,
    motivo: "Designação temporária para ensaio de RLS",
  };
  await reject(() => assignment({ ...requestGrant, qualificacao_id: randomUUID() }), "23514");
  await reject(() => assignment({ ...requestGrant, unidade_id: randomUUID() }), "23503");
  await reject(() => assignment({ ...requestGrant, biblioteca: true }), "23514");
  await reject(() => assignment(requestGrant, randomUUID(), otherOrgAdmin), "42501");
  const grantKey = randomUUID();
  const grant = await assignment(requestGrant, grantKey);
  equal(await assignment(requestGrant, grantKey), grant);
  await reject(() => assignment(requestGrant), "23505");
  const revokeKey = randomUUID();
  const revoke = {
    acao: "revogar",
    atribuicao_id: grant.id,
    motivo: "Encerramento da designação temporária de teste",
  };
  const revoked = await assignment(revoke, revokeKey);
  equal(await assignment(revoke, revokeKey), revoked);
  const audit = await as(
    admin,
    async (tx) => (await tx`select inspecoes_acessos_historico(${org},${tst},0) a`)[0].a,
  );
  equal(
    audit.eventos.map((item) => item.acao),
    ["revogada", "designada"],
  );
  await reject(
    () =>
      sql`update inspecoes_acesso_eventos set motivo='alterado' where atribuicao_id=${grant.id}`,
    "23514",
  );
  const adminAsset = await as(
    admin,
    async (tx) =>
      (
        await tx`select inspecoes_ativo_criar(${org},${client},${otherUnit},${randomUUID()},
      ${tx.json({ tag: "ADMIN-01", nome: "Identidade de ativo cadastrada", familia: "ANC" })}) a`
      )[0].a,
  );
  equal(
    [adminAsset.situacao, adminAsset.importado_por, adminAsset.snapshot.resultado],
    ["existente", admin, undefined],
  );
  await reject(() => exec(admin, "criar", { ativo_id: adminAsset.id, tipo: "T2" }), "42501");

  const adminPessoa = randomUUID();
  const competenciaEst = randomUUID();
  const adminQual = randomUUID();
  await sql`insert into user_roles(organization_id,user_id,role) values(${org},${est},'engenharia')`;
  await sql.begin(async (fixture) => {
    await fixture`select set_config('request.jwt.claim.sub',${admin},true)`;
    await fixture`insert into pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional,created_by)
      values(${adminPessoa},${org},'Responsável de teste','colaborador',${admin},'REG-TESTE',${admin})`;
    await fixture`insert into competencias(id,organization_id,nome,created_by)
      values(${competenciaEst},${org},'Engenharia de Segurança do Trabalho',${est})`;
    await fixture`insert into pessoa_qualificacoes(id,organization_id,pessoa_id,competencia_id,emissor,conclusao,created_by)
      values(${adminQual},${org},${adminPessoa},${competenciaEst},'Conselho de teste',current_date-1,${admin})`;
  });
  const adminRequest = {
    acao: "designar",
    user_id: admin,
    qualificacao_id: adminQual,
    perfil: "EST",
    cliente_id: null,
    unidade_id: null,
    motivo: "Designação após conferência independente de teste",
    vincular_competencia: true,
    ensaios: true,
    biblioteca: true,
    importacao: true,
  };
  await reject(() => assignment(adminRequest), "23514");
  await as(
    est,
    (tx) =>
      tx`select transicionar_qualificacao(${org},${randomUUID()},${adminQual},1,'em_conferencia')`,
  );
  await reject(
    () =>
      as(
        admin,
        (tx) =>
          tx`select transicionar_qualificacao(${org},${randomUUID()},${adminQual},2,'validada')`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        est,
        (tx) =>
          tx`select transicionar_qualificacao(${org},${randomUUID()},${adminQual},2,'validada')`,
      ),
    "23514",
  );
  await sql`insert into anexos(organization_id,qualificacao_id,nome,mime,tamanho,sha256,caminho,estado,created_by,confirmado_em)
    values(${org},${adminQual},'evidencia-teste.pdf','application/pdf',24,${fixtureDigest},
      ${`${org}/evidencia-qualificacao.pdf`},'vinculado',${admin},now())`;
  await as(
    est,
    (tx) => tx`select transicionar_qualificacao(${org},${randomUUID()},${adminQual},2,'validada')`,
  );
  await reject(
    () => assignment({ ...adminRequest, perfil: "TST", biblioteca: false, importacao: false }),
    "42501",
  );
  const adminGrant = await assignment(adminRequest);
  equal(
    await as(
      admin,
      async (tx) => (await tx`select inspecoes_pode(${org},${client},${unit},'est') a`)[0].a,
    ),
    true,
  );
  equal(
    await as(
      admin,
      async (tx) => (await tx`select inspecoes_pode(${org},null,null,'biblioteca') a`)[0].a,
    ),
    true,
  );
  const adminDraft = await exec(
    admin,
    "criar",
    { ativo_id: adminAsset.id, tipo: "T2" },
    undefined,
    randomUUID(),
    adminGrant.id,
  );
  equal(adminDraft.created_by, admin);
  equal(
    await as(tst, async (tx) =>
      (await tx`select inspecoes_contexto(${org}) a`)[0].a.map((x) => x.unidade_id),
    ),
    [unit],
  );
  equal(
    await as(tst, async (tx) =>
      (
        await tx`select id from inspecoes_registros where organization_id=${org} and colecao='ativos'`
      ).map((x) => x.id),
    ),
    [asset],
  );
  equal(
    await as(
      tst,
      async (tx) =>
        (await tx`select name from storage.objects where name=${historicalPath}`).length,
    ),
    0,
  );
  equal(
    await as(
      est,
      async (tx) =>
        (await tx`select name from storage.objects where name=${historicalPath}`).length,
    ),
    1,
  );
  await reject(
    () =>
      as(est, (tx) => tx`update inspecoes_registros set titulo='mudou' where id=${historicalDoc}`),
    "42501",
  );
  await reject(
    () => sql`update inspecoes_registros set titulo='mudou' where id=${historicalDoc}`,
    "23514",
  );
  await reject(() => exec(tst, "criar", { ativo_id: asset, tipo: "T2" }), "42501");
  await reject(
    () => exec(est, "criar", { ativo_id: otherAsset, tipo: "T2", atribuido_a: tst }),
    "42501",
  );
  await reject(
    () => exec(est, "criar", { ativo_id: asset, tipo: "T2", documento_base_id: historicalDoc }),
    "42501",
  );

  const createKey = randomUUID();
  const creation = { ativo_id: asset, tipo: "T2", atribuido_a: tst };
  const estGrant = await as(
    est,
    async (tx) => (await tx`select inspecoes_acesso(${org}) a`)[0].a[0].id,
  );
  const tstGrant = await as(
    tst,
    async (tx) => (await tx`select inspecoes_acesso(${org}) a`)[0].a[0].id,
  );
  await reject(() => exec(est, "criar", creation, null, randomUUID(), tstGrant), "42501");
  let row = await exec(est, "criar", creation, null, createKey);
  equal(await exec(est, "criar", creation, null, createKey), row);
  equal(
    await as(
      otherTst,
      async (tx) => (await tx`select id from inspecoes_levantamentos where id=${row.id}`).length,
    ),
    0,
  );
  await reject(() => exec(otherTst, "salvar", {}, row), "42501");
  await reject(() => exec(tst, "salvar", {}, row, randomUUID(), estGrant), "42501");
  await reject(() => exec(tst, "salvar", { respostas: { "OUTRO-01": "C" } }, row), "23514");
  await reject(() => exec(tst, "submeter", {}, row), "23514");
  const versionOne = row;
  const dates = (await sql`select (current_date-2)::text dia,(current_date-1)::text inicio`)[0];
  const input = {
    data_inspecao: dates.dia,
    art: "ART-TESTE",
    art_inicio: dates.inicio,
    protocolo: "PR-TESTE",
    codigo_documento: "DOC-TESTE",
    revisao_documento: "R00",
    respostas: { "ANC-01": "NC", "ANC-02": "C" },
  };
  row = await exec(tst, "salvar", input, row, randomUUID(), tstGrant);
  equal(row.resultado_calculado, "nao_apto");
  equal(row.alertas, ["R19: inspeção anterior ao início da ART."]);
  await reject(() => exec(tst, "salvar", input, versionOne), "40001");
  row = await exec(tst, "submeter", {}, row);
  await reject(
    () => exec(tst, "aprovar", { parecer: "apto", motivo: "tentativa teste" }, row),
    "42501",
  );
  await reject(
    () => exec(est, "aprovar", { parecer: "nao_apto", motivo: "achado crítico" }, row),
    "23514",
  );
  row = await exec(est, "devolver", { motivo: "Conferir a ficha antes de submeter." }, row);
  equal(row.estado, "rascunho");
  equal(row.conteudo.respostas["ANC-01"], "NC");
  row = await exec(tst, "submeter", {}, row);
  await as(
    est,
    (tx) => tx`select inspecoes_homologar_protocolo(${org},'ANC','T2',
    'Protocolo de teste',true,false,'Fonte de homologação sintética',0)`,
  );
  await reject(
    () => exec(est, "aprovar", { parecer: "apto", motivo: "incompatível com NC" }, row),
    "23514",
  );
  row = await exec(est, "aprovar", { parecer: "nao_apto", motivo: "Trinca em item crítico." }, row);
  equal(row.estado, "aprovado");
  equal(row.parecer_est, "nao_apto");
  await reject(() => exec(est, "emitir", {}, row), "23514");

  const file = randomUUID();
  const reserved = await as(
    est,
    async (tx) =>
      (
        await tx`select inspecoes_arquivo_reservar(${org},${row.id},${file},
    'original','rascunho-verificado.pdf','application/pdf',24,${fixtureDigest}) a`
      )[0].a,
  );
  await reject(
    () =>
      as(
        otherTst,
        (tx) => tx`insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',${reserved.caminho},'{"size":24,"mimetype":"application/pdf"}')`,
      ),
    "42501",
  );
  await as(
    est,
    (tx) => tx`insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',${reserved.caminho},'{"size":24,"mimetype":"application/pdf"}')`,
  );
  await reject(
    () =>
      as(
        est,
        (tx) => tx`select inspecoes_arquivo_atestar(${org},${file},${est},${fixtureDigest},24)`,
      ),
    "42501",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    const a = (
      await tx`select inspecoes_arquivo_atestar(${org},${file},${est},${fixtureDigest},24) a`
    )[0].a;
    equal(a.estado, "original_verificado");
  });
  equal(
    await as(
      otherTst,
      async (tx) =>
        (await tx`select name from storage.objects where name=${reserved.caminho}`).length,
    ),
    0,
  );
  row = await exec(est, "emitir", {}, row);
  equal(row.estado, "emitido");
  equal(
    await as(
      otherTst,
      async (tx) =>
        (await tx`select name from storage.objects where name=${reserved.caminho}`).length,
    ),
    1,
  );
  const issue = (
    await sql`select snapshot,sha256 from inspecoes_emissoes where levantamento_id=${row.id}`
  )[0];
  equal(issue.snapshot.revisao_aprovada.parecer_est, "nao_apto");
  equal(issue.snapshot.arquivos[0].sha256, fixtureDigest);
  let adminRow = await exec(
    admin,
    "salvar",
    { ...input, codigo_documento: "ADMIN-DOC-TESTE" },
    adminDraft,
    randomUUID(),
    adminGrant.id,
  );
  adminRow = await exec(admin, "submeter", {}, adminRow, randomUUID(), adminGrant.id);
  adminRow = await exec(
    admin,
    "aprovar",
    { parecer: "nao_apto", motivo: "Trinca em item crítico." },
    adminRow,
    randomUUID(),
    adminGrant.id,
  );
  await reject(() => exec(admin, "emitir", {}, adminRow, randomUUID(), adminGrant.id), "23514");
  const adminPdf = randomUUID();
  const upload = await as(
    admin,
    async (tx) =>
      (
        await tx`select inspecoes_arquivo_reservar(${org},${adminRow.id},${adminPdf},
      'original','laudo-admin.pdf','application/pdf',24,${fixtureDigest}) a`
      )[0].a,
  );
  await as(
    admin,
    (tx) => tx`insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',${upload.caminho},'{"size":24,"mimetype":"application/pdf"}')`,
  );
  await sql.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    await tx`select inspecoes_arquivo_atestar(${org},${adminPdf},${admin},${fixtureDigest},24)`;
  });
  const emissionKey = randomUUID();
  adminRow = await exec(admin, "emitir", {}, adminRow, emissionKey, adminGrant.id);
  equal([adminRow.estado, adminRow.issued_by], ["emitido", admin]);
  await assignment({
    acao: "revogar",
    atribuicao_id: adminGrant.id,
    motivo: "Encerra o acesso técnico de teste",
  });
  equal(
    await as(
      admin,
      async (tx) => (await tx`select inspecoes_pode(${org},${client},${unit},'est') a`)[0].a,
    ),
    false,
  );
  await reject(() => exec(admin, "criar", { ativo_id: adminAsset.id, tipo: "T2" }), "42501");
  await reject(
    () =>
      sql`update inspecoes_levantamentos set conteudo='{}', version=version+1 where id=${row.id}`,
    "23514",
  );
  await reject(
    () => sql`update inspecoes_emissoes set snapshot='{}' where levantamento_id=${row.id}`,
    "23514",
  );

  const assetKey = randomUUID();
  const assetInput = {
    tag: "único A.01",
    nome: "Ancoragem do teste",
    familia: "ANC",
    local: "Pavimento de teste",
    componentes: [{ codigo: "C1", nome: "Suporte" }],
    pontos: [{ codigo: "P1", componente_codigo: "C1" }],
  };
  const createAsset = (user, data, key = assetKey) =>
    as(
      user,
      async (tx) =>
        (
          await tx`select inspecoes_ativo_criar(${org},${client},${unit},${key},${tx.json(data)}) a`
        )[0].a,
    );
  await reject(() => createAsset(tst, assetInput), "42501");
  const novoAtivo = await createAsset(est, assetInput);
  equal(novoAtivo.codigo, "UNICO-A-01");
  equal(await createAsset(est, assetInput), novoAtivo);
  await reject(() => createAsset(est, { ...assetInput, tag: "unico_A/01" }, randomUUID()), "23505");
  equal(
    await as(
      tst,
      async (tx) =>
        (await tx`select codigo from inspecoes_pontos where ativo_id=${novoAtivo.id}`)[0].codigo,
    ),
    "P1",
  );

  const draft = await exec(est, "criar", { ativo_id: novoAtivo.id, tipo: "T2", atribuido_a: tst });
  const pendingId = randomUUID();
  await as(
    tst,
    (tx) => tx`select inspecoes_arquivo_reservar(${org},${draft.id},${pendingId},
    'foto','foto.jpg','image/jpeg',24,${fixtureDigest})`,
  );
  await reject(
    () => as(otherTst, (tx) => tx`select inspecoes_arquivo_cancelar(${org},${pendingId})`),
    "42501",
  );
  equal(
    await as(
      tst,
      async (tx) =>
        (await tx`select inspecoes_arquivo_cancelar(${org},${pendingId}) a`)[0].a.estado,
    ),
    "envio_cancelado",
  );

  const assayId = randomUUID();
  const assayInput = {
    ponto_codigo: "P1",
    data_hora: `${dates.dia}T08:30:00-03:00`,
    equipamento_codigo: "EQ-02",
    carga_pico: "10.000",
    unidade_carga: "kN",
    resultado_app: "reprovado",
  };
  const saveAssay = (user, data, version = 0) =>
    as(
      user,
      async (tx) =>
        (
          await tx`select inspecoes_ensaio_salvar(${org},${draft.id},${assayId},${version},${tx.json(data)}) e`
        )[0].e,
    );
  await reject(() => saveAssay(tst, assayInput), "42501");
  await sql`update inspecoes_atribuicoes set ensaios=true where organization_id=${org} and user_id=${tst}`;
  await reject(() => saveAssay(tst, { ...assayInput, ponto_codigo: "P2" }), "23503");
  await reject(() => saveAssay(tst, { ...assayInput, relatorio_id: historicalFile }), "23503");
  const ensaio = await saveAssay(tst, assayInput);
  equal(ensaio.estado, "rascunho");
  equal(ensaio.carga_pico_kgf, 1019.7);
  equal(ensaio.conteudo.carga_pico, "10.000");
  equal(
    ensaio.bloqueios.some((x) => x.includes("EQ-02")),
    true,
  );
  equal(
    ensaio.alertas.some((x) => x.includes("R61")),
    true,
  );
  equal(await saveAssay(tst, assayInput), ensaio);
  equal(
    await as(
      otherTst,
      async (tx) => (await tx`select id from inspecoes_ensaios where id=${assayId}`).length,
    ),
    0,
  );
  const ensaioRev = await saveAssay(tst, { ...assayInput, carga_pico: "20.000" }, ensaio.version);
  equal(ensaioRev.carga_pico_kgf, 2039.4);
  equal(
    await as(
      tst,
      async (tx) =>
        (
          await tx`select count(*)::int n from inspecoes_ensaio_versoes where ensaio_id=${assayId}`
        )[0].n,
    ),
    2,
  );
  let reviewed = await exec(tst, "salvar", input, draft);
  reviewed = await exec(tst, "submeter", {}, reviewed);
  await reject(
    () =>
      exec(
        est,
        "aprovar",
        { parecer: "nao_apto", motivo: "Ensaio pendente de conferência." },
        reviewed,
      ),
    "23514",
  );

  await sql`update inspecoes_atribuicoes set revogada_em=now() where organization_id=${org} and user_id=${tst}`;
  equal(
    await as(
      tst,
      async (tx) => (await tx`select id from inspecoes_levantamentos where id=${row.id}`).length,
    ),
    0,
  );
  console.log(`Inspeções acervo, RLS, Storage (metadados) e revisão: ${checks} verificações.`);
} finally {
  await sql.end();
}
