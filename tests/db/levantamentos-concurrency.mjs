import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";

if (process.env.PGTEST_EPHEMERAL !== "1") throw new Error("Use o runner PostgreSQL descartável");
const options = {
  host: process.env.PGTEST_HOST || "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
};
const root = postgres(options);
const clients = Array.from({ length: 10 }, () => postgres(options));
const blocker = postgres(options);
const service = postgres({
  ...options,
  connection: { application_name: "nexus-levantamento-confirm-race" },
});
const org = "9c000000-0000-4000-8000-000000000010";
const engineer = "9c000000-0000-4000-8000-000000000001";
const field = "9c000000-0000-4000-8000-000000000002";
const client = "9c000000-0000-4000-8000-000000000011";
const unit = "9c000000-0000-4000-8000-000000000012";
let sequence = 20;
const key = () => `9c000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
async function call(db, actor, command, data, idempotencyKey = key()) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    const [row] =
      await tx`select public.lev_executar(${org},${idempotencyKey},${command},${tx.json(data)}) as value`;
    return row.value;
  });
}
async function person(data) {
  return root.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    const [row] = await tx`select public.salvar_pessoa(${org},${key()},${tx.json(data)}) as value`;
    return row.value;
  });
}
async function confirmationRace(attachment, mutate, label) {
  let release, ready;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (ready = resolve));
  const mutation = blocker.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await mutate(tx);
    ready();
    await gate;
  });
  await started;
  const confirmation = service
    .begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      await tx`select public.lev_confirmar_arquivo(${org},${attachment.id},${field},${attachment.sha256})`;
    })
    .then(
      () => ({ accepted: true }),
      (error) => ({ accepted: false, code: error.code }),
    );
  let waited = false;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const [row] =
        await root`select exists(select 1 from pg_stat_activity where application_name='nexus-levantamento-confirm-race' and cardinality(pg_blocking_pids(pid))>0) as waiting`;
      if (row.waiting) {
        waited = true;
        break;
      }
      await setTimeout(20);
    }
  } finally {
    release();
  }
  await mutation;
  assert.equal(waited, true);
  assert.deepEqual(await confirmation, { accepted: false, code: "42501" });
  const [row] =
    await root`select estado from public.levantamento_arquivos where id=${attachment.id}`;
  assert.equal(row.estado, "pendente");
  console.log(`LEV CONCURRENCY PASS: ${label}; real lock wait and no false confirmation`);
}
async function commandRace(
  actor,
  command,
  data,
  mutate,
  label,
  repeatedKey = key(),
  invoke = null,
) {
  let release, ready;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (ready = resolve));
  const mutation = blocker.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await mutate(tx);
    ready();
    await gate;
  });
  await started;
  await clients[0].unsafe("set application_name='nexus-lev-command-race'");
  const result = (
    invoke ? invoke(clients[0]) : call(clients[0], actor, command, data, repeatedKey)
  ).then(
    () => ({ accepted: true }),
    (error) => ({ accepted: false, code: error.code }),
  );
  let waited = false;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const [row] =
        await root`select exists(select 1 from pg_stat_activity where application_name='nexus-lev-command-race' and cardinality(pg_blocking_pids(pid))>0) as waiting`;
      if (row.waiting) {
        waited = true;
        break;
      }
      await setTimeout(20);
    }
  } finally {
    release();
  }
  await mutation;
  assert.equal(waited, true);
  assert.deepEqual(await result, { accepted: false, code: "42501" });
  console.log(`LEV CONCURRENCY PASS: ${label}; authorization rechecked after real lock wait`);
}
try {
  await root`insert into auth.users(id,email) values(${engineer},'lev-race-eng@test.invalid'),(${field},'lev-race-field@test.invalid')`;
  await root`insert into public.organizations(id,nome) values(${org},'Levantamento concurrency test')`;
  await root`insert into public.memberships(organization_id,user_id) values(${org},${engineer}),(${org},${field})`;
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${engineer},'engenharia'),(${org},${field},'campo')`;
  await root`insert into public.clientes(id,organization_id,razao_social) values(${client},${org},'Levantamento concurrent client')`;
  await root`insert into public.unidades(id,organization_id,cliente_id,nome) values(${unit},${org},${client},'Levantamento concurrent unit')`;
  const responsible = await person({
    nome: "Assigned collector",
    vinculo: "colaborador",
    user_id: field,
  });
  const other = await person({ nome: "Other operational person", vinculo: "prestador" });
  const professional = await person({
    nome: "Reviewer professional",
    vinculo: "colaborador",
    user_id: engineer,
    registro_profissional: "TEST registration",
  });
  const createKey = key();
  const data = {
    cliente_id: client,
    unidade_id: unit,
    finalidade: "Collect concurrent technical evidence",
    responsavel_id: responsible.id,
  };
  const created = await Promise.all(
    clients.map((db) => call(db, engineer, "criar", data, createKey)),
  );
  assert.equal(new Set(created.map((value) => JSON.stringify(value))).size, 1);
  const survey = created[0].levantamento.id,
    revision = created[0].revisao.id;
  const [count] =
    await root`select count(*)::int as count from public.levantamentos where organization_id=${org}`;
  assert.equal(count.count, 1);
  console.log(
    "LEV CONCURRENCY PASS: ten create retries use one identity, one official number and one receipt",
  );
  const pointKey = key();
  const pointData = {
    levantamento_id: survey,
    revisao_id: revision,
    codigo: "P1",
    nome: "Concurrent point",
    medicoes: [
      {
        chave: "length",
        grandeza: "comprimento",
        valor: "100.123456",
        unidade: "m",
        precisao: "0.001",
        metodo: "Tape measurement",
        coletado_em: "2026-10-22T12:00:00Z",
      },
    ],
  };
  const points = await Promise.all(
    clients.map((db) => call(db, field, "salvar_ponto", pointData, pointKey)),
  );
  assert.equal(new Set(points.map((value) => JSON.stringify(value))).size, 1);
  assert.equal(points[0].pontos.length, 1);
  assert.equal(points[0].medicoes.length, 1);
  const point = points[0].pontos[0];
  console.log("LEV CONCURRENCY PASS: ten atomic point+measurement retries create one of each");
  const edits = await Promise.allSettled(
    ["A", "B"].map((suffix, index) =>
      call(clients[index], field, "salvar_ponto", {
        ...pointData,
        medicoes: undefined,
        ponto_id: point.id,
        expected_version: 1,
        nome: `Edited ${suffix}`,
      }),
    ),
  );
  assert.equal(edits.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(edits.find((entry) => entry.status === "rejected").reason.code, "40001");
  console.log(
    "LEV CONCURRENCY PASS: competing same-point edits reject stale version without overwriting data",
  );
  const second = await call(root, field, "salvar_ponto", {
    levantamento_id: survey,
    revisao_id: revision,
    codigo: "P2",
    nome: "Second independent point",
  });
  const point2 = second.pontos.find((entry) => entry.codigo === "P2");
  const separate = await Promise.all([
    call(clients[0], field, "salvar_ponto", {
      levantamento_id: survey,
      revisao_id: revision,
      ponto_id: point.id,
      expected_version: 2,
      codigo: "P1",
      nome: "Independent A",
    }),
    call(clients[1], field, "salvar_ponto", {
      levantamento_id: survey,
      revisao_id: revision,
      ponto_id: point2.id,
      expected_version: 1,
      codigo: "P2",
      nome: "Independent B",
    }),
  ]);
  assert.equal(separate.length, 2);
  console.log(
    "LEV CONCURRENCY PASS: edits to separate points retain independent expected versions",
  );
  const beforeDelete = await root.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${field},true)`;
    const [row] = await tx`select public.lev_obter(${org},${survey}) as value`;
    return row.value;
  });
  const originalPoint = beforeDelete.pontos.find((entry) => entry.id === point.id);
  const originalMeasure = beforeDelete.medicoes[0];
  const afterMeasureEdit = await call(clients[1], field, "salvar_medicao", {
    ...pointData.medicoes[0],
    levantamento_id: survey,
    revisao_id: revision,
    ponto_id: point.id,
    medicao_id: originalMeasure.id,
    expected_version: originalMeasure.version,
    valor: "101.123456",
  });
  assert.equal(
    afterMeasureEdit.pontos.find((entry) => entry.id === point.id).version,
    originalPoint.version,
  );
  await assert.rejects(
    call(clients[0], field, "excluir_ponto", {
      levantamento_id: survey,
      revisao_id: revision,
      ponto_id: point.id,
      expected_version: originalPoint.version,
      expected_revision_version: beforeDelete.revisao.version,
    }),
    (error) => error.code === "40001",
  );
  const [remainingMeasure] =
    await root`select valor::text as valor from public.levantamento_medicoes where id=${originalMeasure.id}`;
  assert.equal(remainingMeasure.valor, "101.123456");
  console.log(
    "LEV CONCURRENCY PASS: stale point deletion preserves a measurement edited by the other session",
  );
  const conflictingKey = key();
  const collisions = await Promise.allSettled(
    ["A", "B"].map((suffix, index) =>
      call(
        clients[index],
        field,
        "salvar_ponto",
        {
          levantamento_id: survey,
          revisao_id: revision,
          codigo: "P3",
          nome: `Conflicting ${suffix}`,
        },
        conflictingKey,
      ),
    ),
  );
  assert.equal(collisions.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(collisions.find((entry) => entry.status === "rejected").reason.code, "23505");
  console.log(
    "LEV CONCURRENCY PASS: concurrent same key with different payloads rejects the conflicting intent",
  );
  const attachment = await root.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${field},true)`;
    const [row] =
      await tx`select public.lev_preparar_arquivo(${org},${revision},${point.id},${key()},'{"nome":"proof.jpg","mime":"image/jpeg","tamanho":100,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') as value`;
    return row.value;
  });
  await root`insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',${attachment.caminho},'{"size":100,"mimetype":"image/jpeg"}')`;
  await confirmationRace(
    attachment,
    (tx) => tx`delete from public.user_roles where organization_id=${org} and user_id=${field}`,
    "role revoked during pending confirmation",
  );
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${field},'campo')`;
  await confirmationRace(
    attachment,
    (tx) => tx`update public.levantamentos set responsavel_id=${other.id} where id=${survey}`,
    "survey reassigned during pending confirmation",
  );
  let reviewed = await call(root, engineer, "criar", data);
  const reviewSurvey = reviewed.levantamento.id,
    reviewRevision = reviewed.revisao.id;
  reviewed = await call(root, field, "salvar_ponto", {
    ...pointData,
    levantamento_id: reviewSurvey,
    revisao_id: reviewRevision,
    medicoes: [{ ...pointData.medicoes[0], valor: "100.123000" }],
  });
  reviewed = await call(root, field, "programar", {
    levantamento_id: reviewSurvey,
    revisao_id: reviewRevision,
    expected_version: reviewed.revisao.version,
    inicio_previsto: "2026-10-22T12:00:00Z",
    fim_previsto: "2026-10-22T13:00:00Z",
  });
  reviewed = await call(root, field, "iniciar_coleta", {
    levantamento_id: reviewSurvey,
    revisao_id: reviewRevision,
    expected_version: reviewed.revisao.version,
  });
  reviewed = await call(root, field, "submeter", {
    levantamento_id: reviewSurvey,
    revisao_id: reviewRevision,
    expected_version: reviewed.revisao.version,
  });
  const approvalData = {
    levantamento_id: reviewSurvey,
    revisao_id: reviewRevision,
    expected_version: reviewed.revisao.version,
  };
  await commandRace(
    engineer,
    "aprovar",
    approvalData,
    (tx) => tx`update public.pessoas set registro_profissional=null where id=${professional.id}`,
    "professional registration revoked during approval",
  );
  await root.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`update public.pessoas set registro_profissional='TEST registration' where id=${professional.id}`;
  });
  await commandRace(
    engineer,
    "aprovar",
    approvalData,
    (tx) => tx`delete from public.user_roles where organization_id=${org} and user_id=${engineer}`,
    "review role revoked during approval",
  );
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${engineer},'engenharia')`;
  const coordinator = "9c000000-0000-4000-8000-000000000003";
  await root`insert into auth.users(id,email) values(${coordinator},'lev-race-coord@test.invalid')`;
  await root`insert into public.memberships(organization_id,user_id) values(${org},${coordinator})`;
  await root.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`insert into public.user_capacidades(organization_id,user_id,capacidade) values(${org},${coordinator},'coordenar_operacao')`;
  });
  const contextSurvey = await call(root, engineer, "criar", data);
  await commandRace(
    coordinator,
    "contexto",
    {
      levantamento_id: contextSurvey.levantamento.id,
      expected_version: contextSurvey.levantamento.version,
      finalidade: "Must not save after revocation",
      responsavel_id: responsible.id,
    },
    (tx) =>
      tx`delete from public.user_capacidades where organization_id=${org} and user_id=${coordinator}`,
    "coordination capability revoked during context write",
  );
  reviewed = await call(root, engineer, "aprovar", approvalData);
  assert.equal(reviewed.revisao.estado, "aprovado");
  const proposalId = key(),
    destinationRevision = key(),
    destinationSystem = key();
  await root`insert into public.propostas(id,organization_id,numero,cliente_id,unidade_id) values(${proposalId},${org},'LEV-CONCURRENT-ADOPTION',${client},${unit})`;
  await root`insert into public.proposta_revisoes(id,organization_id,proposta_id,numero) values(${destinationRevision},${org},${proposalId},1)`;
  await root`insert into public.sistemas_dimensionados(id,organization_id,revisao_id,ordem,tipo,metragem) values(${destinationSystem},${org},${destinationRevision},1,'TELHADO',10)`;
  const [sourceMeasurement] = reviewed.medicoes;
  const preview = await root.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    const [row] =
      await tx`select public.lev_prever_adocao(${org},${reviewRevision},${sourceMeasurement.id},${destinationSystem},'metragem') as value`;
    return row.value;
  });
  const adoptionKey = key();
  const adopt = (db) =>
    db.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
      const [row] =
        await tx`select public.lev_adotar_medicao(${org},${adoptionKey},${reviewRevision},${sourceMeasurement.id},${destinationSystem},'metragem',${preview.preview_hash}) as value`;
      return row.value;
    });
  await adopt(root);
  await commandRace(
    engineer,
    "adoption-replay",
    {},
    (tx) => tx`delete from public.user_roles where organization_id=${org} and user_id=${engineer}`,
    "role revoked during adoption receipt replay",
    adoptionKey,
    adopt,
  );
  const [adoptionCount] =
    await root`select count(*)::int as count from public.levantamento_adocoes where revisao_id=${reviewRevision}`;
  assert.equal(adoptionCount.count, 1);
} finally {
  await Promise.all([root, blocker, service, ...clients].map((db) => db.end({ timeout: 5 })));
}
