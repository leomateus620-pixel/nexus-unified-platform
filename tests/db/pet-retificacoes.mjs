/** Formal correction integration. These records are isolated DB fixtures, not
 * production data or real certified signatures. Original events are never edited. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  (process.env.PGTEST_HOST && process.env.PGTEST_HOST !== "127.0.0.1") ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL required");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  onnotice() {},
});
const q = (s, p = []) => sql.unsafe(s, p),
  org = randomUUID(),
  author = randomUUID(),
  requester = randomUUID(),
  reviewer = randomUUID(),
  outside = randomUUID();
const wp = randomUUID(),
  rp = randomUUID(),
  ap = randomUUID(),
  client = randomUUID(),
  unit = randomUUID(),
  order = randomUUID(),
  space = randomUUID(),
  model = randomUUID(),
  modelVersion = randomUUID(),
  pet = randomUUID(),
  rev = randomUUID(),
  participant = randomUUID(),
  file = randomUUID();
const earlierIn = randomUUID(),
  earlierOut = randomUUID(),
  lastIn = randomUUID(),
  lastOut = randomUUID();
const at = Date.now(),
  time = (m) => new Date(at + m * 60000).toISOString();
let count = 0;
const pass = (v, s) => {
  assert.ok(v, s);
  count++;
  console.log("PET CORRECTION PASS " + s);
};
const rejects = async (fn, code, s) => {
  await assert.rejects(fn, (e) => e.code === code, s);
  count++;
  console.log("PET CORRECTION PASS " + s);
};
const auth = async (id) => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await q("set role authenticated");
};
const owner = async () => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [author]);
};
const get = async () => (await q("select public.pet_obter($1,$2) r", [org, pet]))[0].r;
const ver = async () => (await get()).pet.version;
const cmd = async (comando, dados, chave = randomUUID()) =>
  (await q("select public.pet_retificar($1,$2::jsonb) r", [org, { chave, comando, dados }]))[0].r;
try {
  await owner();
  for (const id of [author, requester, reviewer, outside])
    await q("insert into auth.users(id,email) values($1,$2)", [id, id + "@test.invalid"]);
  await q("insert into public.organizations(id,nome) values($1,'Correções PET - TESTE ISOLADO')", [
    org,
  ]);
  for (const id of [author, requester, reviewer, outside])
    await q("insert into public.memberships(organization_id,user_id) values($1,$2)", [org, id]);
  for (const id of [author, requester, reviewer])
    await q("insert into public.user_roles(organization_id,user_id,role) values($1,$2,'admin')", [
      org,
      id,
    ]);
  await q(
    "insert into public.pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional) values($1,$2,'Trabalhador TESTE','colaborador',null,null),($3,$2,'Revisor independente TESTE','colaborador',$4,'REG-TESTE'),($5,$2,'Registrante original TESTE','colaborador',$6,'REG-TESTE')",
    [wp, org, rp, reviewer, ap, author],
  );
  for (const pessoa of [rp, ap])
    await q(
      "insert into public.pet_responsaveis_tecnicos(organization_id,pessoa_id,designacao,inicio) values($1,$2,'Designação TESTE',now()-interval '1 day')",
      [org, pessoa],
    );
  await q(
    "insert into public.clientes(id,organization_id,razao_social) values($1,$2,'Cliente TESTE')",
    [client, org],
  );
  await q(
    "insert into public.unidades(id,organization_id,cliente_id,nome) values($1,$2,$3,'Unidade TESTE')",
    [unit, org, client],
  );
  await q(
    "insert into public.ordens_servico(id,organization_id,cliente_id,unidade_id,titulo) values($1,$2,$3,$4,'OS TESTE correção')",
    [order, org, client, unit],
  );
  await q(
    "insert into public.pet_espacos(id,organization_id,unidade_id,identificacao,localizacao) values($1,$2,$3,'EC TESTE','Local de cenário isolado')",
    [space, org, unit],
  );
  await q(
    "insert into public.pet_modelos(id,organization_id,nome) values($1,$2,'PROCEDIMENTO TESTE')",
    [model, org],
  );
  const procedure = {
    retificacao: {
      permitida: true,
      metodo: "revisao_independente_pre_encerramento",
      exige_evidencia: true,
      tolerancia_max_segundos: 300,
    },
  };
  await q(
    "insert into public.pet_modelo_versoes(id,organization_id,modelo_id,versao,procedimento,estado,aprovado_por,aprovado_em,declaracao_aprovacao,sha256) values($1,$2,$3,1,$4::jsonb,'aprovado',$5,now(),'Aprovação exclusivamente em fixture de teste',$6)",
    [modelVersion, org, model, procedure, rp, "a".repeat(64)],
  );
  await q(
    "insert into public.pet_permissoes(id,organization_id,os_id,cliente_id,unidade_id,espaco_id,modelo_versao_id,atividade,timezone,termino_previsto,snapshot_identificacao) values($1,$2,$3,$4,$5,$6,$7,'Atividade TESTE','America/Sao_Paulo',$8,'{}')",
    [pet, org, order, client, unit, space, modelVersion, time(60)],
  );
  await q(
    "insert into public.pet_revisoes(id,organization_id,pet_id,versao,conteudo,sha256,finalidade) values($1,$2,$3,1,'{}',$4,'conferencia')",
    [rev, org, pet, "a".repeat(64)],
  );
  await q(
    "update public.pet_permissoes set revisao_atual_id=$1,emitida_em=$2,termino_operacional_em=$3,estado_documental='encerramento_pendente',condicao_operacional='terminada' where id=$4",
    [rev, time(-60), time(-7), pet],
  );
  await q(
    "insert into public.pet_participantes(id,organization_id,pet_id,pessoa_id,nome_snapshot,funcao,classificacao,inicio) values($1,$2,$3,$4,'Trabalhador TESTE','trabalhador','interno',$5)",
    [participant, org, pet, wp, time(-60)],
  );
  for (const [id, type, moment] of [
    [earlierIn, "entrada", time(-20)],
    [earlierOut, "saida", time(-11)],
    [lastIn, "entrada", time(-10)],
    [lastOut, "saida", time(-8)],
  ]) {
    await q(
      "insert into public.pet_eventos_presenca(id,organization_id,pet_id,pessoa_id,participante_id,revisao_id,tipo,momento_declarado,origem) values($1,$2,$3,$4,$5,$6,$7,$8,'informado_posteriormente')",
      [id, org, pet, wp, participant, rev, type, moment],
    );
  }
  await q(
    "insert into public.pet_intervalos(organization_id,pet_id,pessoa_id,entrada_id,saida_id,entrada_em,saida_em) values($1,$2,$3,$4,$5,$6,$7),($1,$2,$3,$8,$9,$10,$11)",
    [
      org,
      pet,
      wp,
      earlierIn,
      earlierOut,
      time(-20),
      time(-11),
      lastIn,
      lastOut,
      time(-10),
      time(-8),
    ],
  );
  await q(
    "insert into public.anexos(id,organization_id,pet_id,nome,mime,tamanho,sha256,caminho,estado) values($1,$2,$3,'EVIDÊNCIA TESTE.pdf','application/pdf',32,$4,$5,'vinculado')",
    [file, org, pet, "b".repeat(64), org + "/anexos/" + file],
  );
  await auth(outside);
  await rejects(
    () =>
      cmd("solicitar", {
        pet_id: pet,
        expected_version: 2,
        evento_id: lastIn,
        momento_corrigido: time(-9.5),
        motivo: "Correção com evidência independente",
        evidencia_id: file,
      }),
    "42501",
    "endpoint sem capacidade operacional é recusado",
  );
  await auth(requester);
  const baseline = (await get()).metricas.horas_pessoa_segundos;
  const proposal = {
    pet_id: pet,
    expected_version: await ver(),
    evento_id: lastIn,
    momento_corrigido: time(-9.5),
    motivo: "Horário digitado incorretamente; evidência conferida",
    evidencia_id: file,
  };
  await rejects(
    () => cmd("solicitar", { ...proposal, momento_corrigido: time(-4) }),
    "23514",
    "tolerância máxima do procedimento é reavaliada",
  );
  await rejects(
    () => cmd("solicitar", { ...proposal, momento_corrigido: time(-7.5) }),
    "23514",
    "saída não pode preceder entrada corrigida",
  );
  await rejects(
    () => cmd("solicitar", { ...proposal, momento_corrigido: time(-12) }),
    "23P01",
    "sobreposição com outro intervalo individual é recusada",
  );
  await rejects(
    () => cmd("solicitar", { ...proposal, evidencia_id: randomUUID() }),
    "23514",
    "evidência deve estar confirmada na mesma PET",
  );
  const key = randomUUID(),
    r = await cmd("solicitar", proposal, key),
    r2 = await cmd("solicitar", { ...proposal, expected_version: await ver() });
  pass(
    (await get()).metricas.horas_pessoa_segundos === baseline,
    "solicitar correção não altera tempo oficial",
  );
  pass(
    (await cmd("solicitar", proposal, key)).retificacao.id === r.retificacao.id,
    "retry da proposta não duplica registro",
  );
  await rejects(
    () =>
      q("insert into public.pet_retificacoes(organization_id,pet_id) values($1,$2)", [org, pet]),
    "42501",
    "DML direto não fabrica correção",
  );
  await rejects(
    () =>
      cmd("decidir", {
        retificacao_id: r.retificacao.id,
        expected_version: 3,
        responsavel_id: rp,
        decisao: "aprovar",
        motivo: "Revisão de evidência confirmada",
      }),
    "42501",
    "solicitante não aprova sua própria correção",
  );
  await auth(author);
  await rejects(
    async () =>
      cmd("decidir", {
        retificacao_id: r.retificacao.id,
        expected_version: await ver(),
        responsavel_id: ap,
        decisao: "aprovar",
        motivo: "Revisão de evidência confirmada",
      }),
    "42501",
    "registrante original não aprova correção do próprio evento",
  );
  await auth(reviewer);
  const decision = {
      retificacao_id: r.retificacao.id,
      expected_version: await ver(),
      responsavel_id: rp,
      decisao: "aprovar",
      motivo: "Conferi evidência e ordenação dos intervalos de teste",
    },
    decisionKey = randomUUID();
  const approved = await cmd("decidir", decision, decisionKey);
  pass(
    approved.decisao.decisao === "aprovada" && approved.decisao.revisao_id !== null,
    "decisão independente vincula revisão formal por FK",
  );
  pass(
    (await get()).metricas.horas_pessoa_segundos === baseline - 30,
    "tempo oficial aplica overlay aprovado em segundos",
  );
  const effective = (await get()).intervalos.find((i) => i.entrada_id === lastIn);
  pass(
    Date.parse(effective.entrada_original_em) === Date.parse(time(-10)) &&
      Date.parse(effective.entrada_em) === Date.parse(time(-9.5)),
    "consulta distingue horário original do efetivo",
  );
  pass(
    (await cmd("decidir", decision, decisionKey)).decisao.id === approved.decisao.id,
    "retry decisão mantém um efeito",
  );
  await rejects(
    async () =>
      cmd("decidir", {
        retificacao_id: r2.retificacao.id,
        expected_version: await ver(),
        responsavel_id: rp,
        decisao: "aprovar",
        motivo: "Conferência de segunda proposta anterior",
      }),
    "40001",
    "decisão sobre base alterada exige nova proposta",
  );
  await owner();
  pass(
    (
      await q("select momento_declarado from public.pet_eventos_presenca where id=$1", [lastIn])
    )[0].momento_declarado.getTime() === Date.parse(time(-10)),
    "evento original permanece intocado",
  );
  await rejects(
    () =>
      q("update public.pet_retificacao_decisoes set motivo='Sobrescrita de teste' where id=$1", [
        approved.decisao.id,
      ]),
    "23514",
    "decisão aprovada é imutável até para serviço",
  );
  await auth(requester);
  await q("select public.pet_executar($1,$2::jsonb)", [
    org,
    {
      chave: randomUUID(),
      comando: "encerrar",
      dados: {
        pet_id: pet,
        expected_version: await ver(),
        motivo: "Encerramento controlado após revisão independente",
        condicao_final: "Condição final conferida no cenário isolado",
        conferencia_presenca: true,
      },
    },
  ]);
  const final = await get(),
    finalRevision = final.revisoes.find((r) => r.id === final.pet.revisao_atual_id);
  pass(
    final.pet.estado_documental === "encerramento_pendente",
    "correção não simula assinatura ou conclusão documental",
  );
  pass(
    finalRevision.finalidade === "encerramento" &&
      finalRevision.conteudo.retificacoes.length === 1 &&
      Date.parse(
        finalRevision.conteudo.intervalos.find((i) => i.entrada_id === lastIn).entrada_em,
      ) === Date.parse(time(-9.5)),
    "snapshot final a assinar inclui correção e intervalos efetivos",
  );
  await rejects(
    async () => cmd("solicitar", { ...proposal, expected_version: await ver() }),
    "23514",
    "depois do snapshot final exige aditamento certificado próprio",
  );
  console.log(
    "PET CORRECTION DB " + count + " assertions passed; provider/certificates not exercised.",
  );
} finally {
  await sql.end();
}
