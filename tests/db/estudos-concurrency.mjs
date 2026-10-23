import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const sql = postgres(options);
const clients = Array.from({ length: 10 }, () => postgres(options));
const blocker = postgres(options);
const waiter = postgres({ ...options, connection: { application_name: "nexus-study-lock-test" } });
const org = randomUUID();
const author = randomUUID();
const reviewer = randomUUID();
const third = randomUUID();
const client = randomUUID();
const unit = randomUUID();
let sequence = 100;
const key = () => `94000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
async function asUser(db, actor, fn) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    return fn(tx);
  });
}
async function call(db, actor, command, data, idempotencyKey = key()) {
  return asUser(db, actor, async (tx) => {
    const [r] =
      await tx`select public.est_executar(${org},${idempotencyKey},${command},${tx.json(data)}) as value`;
    return r.value;
  });
}
const result = (promise) =>
  promise.then(
    (value) => ({ accepted: true, value }),
    (error) => ({ accepted: false, code: error.code }),
  );
async function deniedAfterWait(mutate, invoke, label) {
  let release, ready, fail;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  const mutation = blocker
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${author},true)`;
      await mutate(tx);
      ready();
      await gate;
    })
    .catch((error) => {
      fail(error);
      throw error;
    });
  await started;
  const pending = result(invoke(waiter));
  let waited = false;
  try {
    for (let n = 0; n < 150; n++) {
      const [r] =
        await sql`select exists(select 1 from pg_stat_activity where application_name='nexus-study-lock-test' and cardinality(pg_blocking_pids(pid))>0) as waiting`;
      if (r.waiting) {
        waited = true;
        break;
      }
      await setTimeout(20);
    }
  } finally {
    release();
  }
  await mutation;
  assert.equal(waited, true, `${label}: must observe real PostgreSQL lock wait`);
  assert.deepEqual(await pending, { accepted: false, code: "42501" });
  console.log(`EST CONCURRENCY PASS: ${label}; real lock wait + current authorization`);
}
try {
  await sql`insert into auth.users(id,email) values(${author},'est-race-author@test.invalid'),(${reviewer},'est-race-reviewer@test.invalid'),(${third},'est-race-third@test.invalid')`;
  await sql`insert into public.organizations(id,nome) values(${org},'Engineering concurrency test')`;
  for (const user of [author, reviewer, third]) {
    await sql`insert into public.memberships(organization_id,user_id) values(${org},${user})`;
    await sql`insert into public.user_roles(organization_id,user_id,role) values(${org},${user},'engenharia')`;
  }
  await sql`insert into public.clientes(id,organization_id,razao_social) values(${client},${org},'Engineering concurrent client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome) values(${unit},${org},${client},'Engineering concurrent unit')`;
  await sql`select set_config('request.jwt.claim.sub',${author},false)`;
  const people = [];
  for (const [i, user] of [author, reviewer, third].entries()) {
    people.push(
      await asUser(sql, author, async (tx) => {
        const [r] =
          await tx`select public.salvar_pessoa(${org},${key()},${tx.json({ nome: `Test professional ${i}`, vinculo: "colaborador", user_id: user, registro_profissional: `TEST declared ${i}` })}) as value`;
        return r.value;
      }),
    );
  }
  const method = await asUser(sql, author, async (tx) => {
    const [r] =
      await tx`select public.est_publicar_metodo(${org},${key()},null,${tx.json({ nome: "Concurrent validated procedure", tipo: "memorial", instrucoes: "Review declared technical premises, with no normative automation", fontes: [{ titulo: "Authorized test procedure", edicao: "1", emissor: "Test engineering" }], requisitos: {} })}) as value`;
    return r.value.versao;
  });
  const create = {
    titulo: "Concurrent technical study",
    tipo: "memorial",
    cliente_id: client,
    unidade_id: unit,
    responsavel_id: people[0].id,
    metodo_versao_id: method.id,
    visibilidade: "organizacao",
    escopo: "Scope supplied at initial creation",
  };
  const creationKey = key();
  const created = await Promise.all(
    clients.map((db) => call(db, author, "criar", create, creationKey)),
  );
  assert.equal(new Set(created.map((x) => JSON.stringify(x))).size, 1);
  const study = created[0].estudo.id,
    revision = created[0].revisao.id;
  assert.equal(created[0].revisao.escopo, create.escopo);
  const [count] =
    await sql`select count(*)::int as count from public.estudos_tecnicos where organization_id=${org}`;
  assert.equal(count.count, 1);
  console.log(
    "EST CONCURRENCY PASS: ten retries create one study, official number and receipt; initial scope persists",
  );

  const pointKey = key();
  const hazard = {
    estudo_id: study,
    revisao_id: revision,
    codigo: "P1",
    descricao: "Observed condition",
    local: "Work area",
    exposicao: "Exposure recorded",
    avaliacao: "Professional assessment",
    medidas: [
      { descricao: "Control proposal", fundamento: "Declared approved basis", prioridade: "alta" },
    ],
  };
  const bulk = await Promise.all(
    clients.map((db) => call(db, author, "salvar_perigo", hazard, pointKey)),
  );
  assert.equal(new Set(bulk.map((x) => JSON.stringify(x))).size, 1);
  assert.equal(bulk[0].perigos.length, 1);
  assert.equal(bulk[0].medidas.length, 1);
  console.log("EST CONCURRENCY PASS: ten bulk retries create one danger and one measure lineage");

  const measure = bulk[0].medidas[0];
  const edits = await Promise.all(
    clients.slice(0, 2).map((db, i) =>
      result(
        call(db, author, "salvar_medida", {
          estudo_id: study,
          revisao_id: revision,
          perigo_id: measure.perigo_id,
          medida_id: measure.id,
          expected_version: 1,
          descricao: `Reviewed instruction ${i}`,
          fundamento: "Explicit assessed basis",
        }),
      ),
    ),
  );
  assert.equal(edits.filter((x) => x.accepted).length, 1);
  assert.equal(edits.find((x) => !x.accepted).code, "40001");
  console.log("EST CONCURRENCY PASS: competing measure edits cannot silently overwrite each other");

  async function readyStudy() {
    let r = await call(sql, author, "criar", create);
    r = await call(sql, author, "salvar_revisao", {
      estudo_id: r.estudo.id,
      revisao_id: r.revisao.id,
      expected_version: r.revisao.version,
      metodo_versao_id: method.id,
      escopo: "Specific scope",
      premissas: "Declared premises",
      analise: "Professional analysis",
      conclusao: "Technical conclusion, without automatic compliance",
      responsavel_tecnico_id: people[0].id,
      revisor_id: people[1].id,
      responsabilidade_tecnica: "Declared responsibility for test review",
    });
    return call(sql, author, "submeter", {
      estudo_id: r.estudo.id,
      revisao_id: r.revisao.id,
      expected_version: r.revisao.version,
    });
  }
  const ready = await readyStudy();
  const decisionData = {
    estudo_id: ready.estudo.id,
    revisao_id: ready.revisao.id,
    expected_version: ready.revisao.version,
    motivo: "Professional decision after verification",
  };
  const approvals = await Promise.all(
    clients.slice(0, 2).map((db) => result(call(db, reviewer, "aprovar", decisionData))),
  );
  assert.equal(approvals.filter((x) => x.accepted).length, 1);
  assert.equal(approvals.find((x) => !x.accepted).code, "40001");
  const [decisions] =
    await sql`select count(*)::int as count from public.estudo_decisoes where revisao_id=${ready.revisao.id}`;
  assert.equal(decisions.count, 1);
  console.log(
    "EST CONCURRENCY PASS: concurrent approvals create exactly one decision and one approved snapshot",
  );

  const dispute = await readyStudy();
  const disputeData = {
    estudo_id: dispute.estudo.id,
    revisao_id: dispute.revisao.id,
    expected_version: dispute.revisao.version,
    motivo: "Concurrent professional decisions must not diverge",
  };
  const competing = await Promise.all([
    result(call(clients[0], reviewer, "aprovar", disputeData)),
    result(call(clients[1], reviewer, "devolver", disputeData)),
  ]);
  assert.equal(competing.filter((x) => x.accepted).length, 1);
  assert.equal(competing.find((x) => !x.accepted).code, "40001");
  console.log(
    "EST CONCURRENCY PASS: competing approval and return cannot produce divergent decisions",
  );

  let actionable = await call(sql, author, "salvar_revisao", {
    estudo_id: study,
    revisao_id: revision,
    expected_version: edits.find((x) => x.accepted).value.revisao.version,
    metodo_versao_id: method.id,
    escopo: "Specified control scope",
    premissas: "Declared assumptions",
    analise: "Review of the observed hazard",
    conclusao: "Proposed instruction for correction",
    responsavel_tecnico_id: people[0].id,
    revisor_id: people[1].id,
    responsabilidade_tecnica: "Declared responsibility for this instruction",
  });
  actionable = await call(sql, author, "submeter", {
    estudo_id: study,
    revisao_id: revision,
    expected_version: actionable.revisao.version,
  });
  actionable = await call(sql, reviewer, "aprovar", {
    estudo_id: study,
    revisao_id: revision,
    expected_version: actionable.revisao.version,
    motivo: "Reviewed correction instruction",
  });
  const taskData = {
    titulo: "Explicit released corrective work",
    descricao: "Released work instruction without source snapshot",
    responsavel_id: people[2].id,
  };
  const tasks = await Promise.all(
    clients.map((db) =>
      asUser(db, reviewer, async (tx) => {
        const [r] =
          await tx`select public.est_vincular_acao(${org},${key()},${measure.id},${tx.json(taskData)}) as value`;
        return r.value;
      }),
    ),
  );
  assert.equal(new Set(tasks.map((x) => x.acao_id)).size, 1);
  const [taskCount] =
    await sql`select count(*)::int as count from public.acoes_operacionais where organization_id=${org}`;
  assert.equal(taskCount.count, 1);
  console.log(
    "EST CONCURRENCY PASS: ten independent action requests converge on one canonical task per measure lineage",
  );

  const roleReady = await readyStudy();
  const roleData = {
    estudo_id: roleReady.estudo.id,
    revisao_id: roleReady.revisao.id,
    expected_version: roleReady.revisao.version,
    motivo: "Role revocation must win",
  };
  await deniedAfterWait(
    (tx) => tx`delete from public.user_roles where organization_id=${org} and user_id=${reviewer}`,
    (db) => call(db, reviewer, "aprovar", roleData),
    "approval waits while reviewer role is revoked",
  );
  await sql`insert into public.user_roles(organization_id,user_id,role) values(${org},${reviewer},'engenharia')`;
  const [stillReview] =
    await sql`select estado from public.estudo_revisoes where id=${roleReady.revisao.id}`;
  assert.equal(stillReview.estado, "em_revisao");

  await deniedAfterWait(
    (tx) => tx`update public.pessoas set registro_profissional=null where id=${people[1].id}`,
    (db) => call(db, reviewer, "aprovar", roleData),
    "approval waits while professional registration is revoked",
  );
  await sql`update public.pessoas set registro_profissional='TEST restored reviewer' where id=${people[1].id}`;

  const receiptKey = key();
  await call(sql, reviewer, "aprovar", roleData, receiptKey);
  await deniedAfterWait(
    (tx) => tx`update public.pessoas set registro_profissional=null where id=${people[1].id}`,
    (db) => call(db, reviewer, "aprovar", roleData, receiptKey),
    "approval receipt replay revalidates professional registration",
  );
  await sql`update public.pessoas set registro_profissional='TEST restored reviewer' where id=${people[1].id}`;

  let fileStudy = await call(sql, author, "criar", create);
  const pe = await asUser(sql, author, async (tx) => {
    let [r] =
      await tx`select public.pe_executar(${org},${key()},'criar',${tx.json({ titulo: "Private source concurrency", cliente_id: client, unidade_id: unit, responsavel_id: people[0].id, visibilidade: "organizacao", resumo: "Source for current access test", modelo: { schema_version: 1, familia: "documental", finalidade: "estudo", secoes: [{ id: key(), titulo: "Controlled source", texto: "Source contents must not leak into action" }], parametros: [] } })}) as value`;
    let data = {
      projeto_id: r.value.projeto.id,
      versao_id: r.value.versao.id,
      expected_version: r.value.versao.version,
    };
    [r] = await tx`select public.pe_executar(${org},${key()},'submeter',${tx.json(data)}) as value`;
    data.expected_version = r.value.versao.version;
    [r] = await tx`select public.pe_executar(${org},${key()},'congelar',${tx.json(data)}) as value`;
    return r.value;
  });
  fileStudy = await call(sql, author, "vincular_fonte", {
    estudo_id: fileStudy.estudo.id,
    revisao_id: fileStudy.revisao.id,
    expected_version: fileStudy.revisao.version,
    tipo: "projeto_engenharia",
    pe_versao_id: pe.versao.id,
    justificativa: "Frozen source used in review",
  });
  const sourceId = fileStudy.fontes[0].id;
  fileStudy = await call(sql, author, "desativar_fonte", {
    estudo_id: fileStudy.estudo.id,
    revisao_id: fileStudy.revisao.id,
    expected_version: fileStudy.revisao.version,
    fonte_id: sourceId,
    motivo: "Historical source still controls its previous content",
  });
  const files = [];
  for (const hash of ["a".repeat(64), "b".repeat(64)]) {
    files.push(
      await asUser(sql, reviewer, async (tx) => {
        const [r] =
          await tx`select public.est_preparar_arquivo(${org},${fileStudy.revisao.id},null,${key()},${tx.json({ nome: "Evidence.pdf", mime: "application/pdf", tamanho: 12, sha256: hash })}) as value`;
        return r.value;
      }),
    );
  }
  for (const a of files)
    await sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',${a.caminho},${sql.json({ mimetype: a.mime, size: a.tamanho })})`;
  const confirm = (db, file) =>
    db.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      const [r] =
        await tx`select public.est_confirmar_arquivo(${org},${file.id},${reviewer},${file.sha256}) as value`;
      return r.value;
    });
  await confirm(sql, files[1]);
  for (const file of files) {
    await deniedAfterWait(
      (tx) => tx`update public.pe_projetos set visibilidade='restrito' where id=${pe.projeto.id}`,
      (db) => confirm(db, file),
      `file ${file.id === files[0].id ? "pending" : "linked retry"} waits while historical PE source access is revoked`,
    );
    const [r] = await sql`select estado from public.estudo_arquivos where id=${file.id}`;
    assert.equal(r.estado, file.id === files[0].id ? "pendente" : "vinculado");
    await sql`update public.pe_projetos set visibilidade='organizacao' where id=${pe.projeto.id}`;
  }

  const privateStudy = await call(sql, author, "criar", { ...create, visibilidade: "restrito" });
  const assigned = await call(sql, author, "salvar_revisao", {
    estudo_id: privateStudy.estudo.id,
    revisao_id: privateStudy.revisao.id,
    expected_version: privateStudy.revisao.version,
    metodo_versao_id: method.id,
    responsavel_tecnico_id: people[0].id,
    revisor_id: people[1].id,
  });
  const file = await asUser(sql, reviewer, async (tx) => {
    const [r] =
      await tx`select public.est_preparar_arquivo(${org},${assigned.revisao.id},null,${key()},${tx.json({ nome: "Assigned.pdf", mime: "application/pdf", tamanho: 12, sha256: "c".repeat(64) })}) as value`;
    return r.value;
  });
  await sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',${file.caminho},${sql.json({ mimetype: file.mime, size: file.tamanho })})`;
  await deniedAfterWait(
    (tx) =>
      tx`update public.estudo_revisoes set revisor_id=${people[2].id} where id=${assigned.revisao.id}`,
    (db) => confirm(db, file),
    "file confirmation waits while restricted study reviewer assignment is replaced",
  );

  const approved = approvals.find((x) => x.accepted).value;
  const [before] =
    await sql`select snapshot,snapshot_sha256 from public.estudo_revisoes where id=${approved.revisao.id}`;
  assert.equal(before.snapshot_sha256, approved.revisao.snapshot_sha256);
  console.log(
    "EST CONCURRENCY PASS: all rejected races preserve approved snapshots and pending/linked states",
  );
} finally {
  await Promise.all([sql, blocker, waiter, ...clients].map((db) => db.end({ timeout: 5 })));
}
