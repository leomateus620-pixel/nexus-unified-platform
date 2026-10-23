import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";

if (process.env.PGTEST_EPHEMERAL !== "1")
  throw new Error("Use apenas o cluster descartável do runner");
const options = {
  host: process.env.PGTEST_HOST || "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
};
const sql = postgres(options),
  a = postgres(options),
  b = postgres(options),
  blocker = postgres(options),
  waiter = postgres({ ...options, connection: { application_name: "nexus-stock-waiter" } });
const org = randomUUID(),
  actor = randomUUID(),
  buyer = randomUUID(),
  field = randomUUID(),
  product = randomUUID(),
  client = randomUUID(),
  supplier = randomUUID(),
  proposal = randomUUID(),
  revision = randomUUID(),
  rc = randomUUID(),
  demand = randomUUID(),
  oc = randomUUID(),
  oci = randomUUID(),
  op = randomUUID();
let local, pessoa, buyerPessoa;
async function asUser(db, user, fn) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return fn(tx);
  });
}
async function command(db, user, name, data, key = randomUUID()) {
  return asUser(
    db,
    user,
    async (tx) =>
      (await tx`select public.alm_executar(${org},${key},${name},${tx.json(data)}) value`)[0].value,
  );
}
const settled = (p) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, code: error.code }),
  );
const pass = (label) => console.log(`PASS: ${label}`);
async function stockCount(quantity) {
  let r = await command(sql, actor, "criar_inventario", {
    produto_id: product,
    local_id: local,
    contada: String(quantity),
    motivo: "Isolated authorized physical count",
  });
  return command(sql, actor, "aprovar_inventario", {
    inventario_id: r.id,
    expected_version: r.detalhe.registro.version,
    motivo: "Approve isolated physical count",
  });
}
async function blocked() {
  for (let i = 0; i < 150; i++) {
    const [r] =
      await sql`select exists(select 1 from pg_stat_activity where application_name='nexus-stock-waiter' and cardinality(pg_blocking_pids(pid))>0) waiting`;
    if (r.waiting) return;
    await setTimeout(20);
  }
  throw new Error("Expected real database lock wait was not observed");
}
try {
  await sql.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values(${actor},'stock-concurrent-admin@test.invalid'),(${buyer},'stock-concurrent-buyer@test.invalid'),(${field},'stock-concurrent-field@test.invalid')`;
    await tx`insert into public.organizations(id,nome) values(${org},'Isolated warehouse concurrency')`;
    for (const user of [actor, buyer, field])
      await tx`insert into public.memberships(organization_id,user_id) values(${org},${user})`;
    await tx`insert into public.user_roles(organization_id,user_id,role) values(${org},${actor},'admin'),(${org},${buyer},'compras'),(${org},${field},'campo')`;
    await tx`insert into public.clientes(id,organization_id,razao_social) values(${client},${org},'Isolated stock client')`;
    await tx`insert into public.fornecedores(id,organization_id,nome) values(${supplier},${org},'Isolated stock supplier')`;
    await tx.unsafe("set local session_replication_role=replica");
    await tx`insert into public.produtos(id,organization_id,codigo,descricao,unidade,indivisivel) values(${product},${org},'TEST-CONCURRENT','Isolated physical item','PÇ',true)`;
    await tx.unsafe("set local session_replication_role=origin");
    await tx`insert into public.propostas(id,organization_id,numero,cliente_id) values(${proposal},${org},'CONCURRENT/26',${client})`;
    await tx`insert into public.proposta_revisoes(id,organization_id,proposta_id,numero,totais,desatualizada) values(${revision},${org},${proposal},1,'{"totais":{"final":100}}',false)`;
    await tx`insert into public.revisao_componentes(id,organization_id,revisao_id,produto_id,codigo,descricao,unidade,modalidade,custo_adotado,indivisivel,multiplo_compra) values(${rc},${org},${revision},${product},'TEST-CONCURRENT','Isolated physical item','PÇ','comprar',100,true,1)`;
    await tx`insert into public.demandas(id,organization_id,revisao_id,revisao_componente_id,modalidade,quantidade_necessaria,quantidade_planejada) values(${demand},${org},${revision},${rc},'comprar',20,20)`;
    await tx`insert into public.ordens_compra(id,organization_id,numero,revisao_id,fornecedor_id) values(${oc},${org},'OC-CONCURRENT',${revision},${supplier})`;
    await tx`insert into public.ordem_compra_itens(id,organization_id,ordem_id,demanda_id,quantidade,preco_unitario) values(${oci},${org},${oc},${demand},20,100)`;
    await tx`update public.ordens_compra set status='emitida' where id=${oc}`;
    await tx`insert into public.ordens_producao(id,organization_id,numero,revisao_id) values(${op},${org},'OP-CONCURRENT',${revision})`;
    await tx`update public.proposta_revisoes set desatualizada=false where id=${revision}`;
  });
  for (const [user, name] of [
    [field, "Field stock recipient"],
    [buyer, "Buyer and own custodian"],
  ]) {
    const r = await asUser(
      sql,
      actor,
      async (tx) =>
        (
          await tx`select public.salvar_pessoa(${org},${randomUUID()},${tx.json({ nome: name, vinculo: "colaborador", user_id: user })}) value`
        )[0].value,
    );
    if (user === field) pessoa = r.id;
    else buyerPessoa = r.id;
  }
  local = (
    await command(sql, actor, "salvar_local", {
      nome: "Concurrent store",
      descricao: "No inferred opening balance",
      ativo: true,
    })
  ).id;
  await stockCount(1);
  let data = {
    produto_id: product,
    local_id: local,
    op_id: op,
    pessoa_id: pessoa,
    quantidade: "1",
    validade: new Date(Date.now() + 86400000).toISOString(),
  };
  let results = await Promise.all([
    settled(command(a, actor, "reservar", data)),
    settled(command(b, actor, "reservar", data)),
  ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.equal(results.find((x) => !x.ok).code, "23514");
  let [state] = await sql`select public.alm_saldo(${org},${product}) value`;
  assert.equal(Number(state.value.fisico), 1);
  assert.equal(Number(state.value.disponivel), 0);
  pass("S01 concurrent reservation of last unit: one confirmation, no negative balance");
  const reserve = results.find((x) => x.ok).value;
  await command(sql, actor, "cancelar_reserva", {
    reserva_id: reserve.id,
    expected_version: 1,
    motivo: "Release fixture reservation",
  });
  const receipt = await asUser(
    sql,
    actor,
    async (tx) =>
      (
        await tx`select public.registrar_movimento('recebimento',${oci},10,'stock-concurrency-receive') value`
      )[0].value,
  );
  await command(sql, actor, "conferir_evento", {
    recebimento_id: receipt.id,
    produto_id: product,
    local_id: local,
    quantidade: "10",
    aceita: "10",
    quarentena: "0",
    rejeitada: "0",
  });
  data = { ...data, quantidade: "11" };
  results = await Promise.all([
    settled(command(a, actor, "reservar", data)),
    settled(
      asUser(
        b,
        actor,
        (tx) =>
          tx`select public.registrar_movimento('recebimento',${oci},10,'stock-concurrency-reverse',${receipt.id})`,
      ),
    ),
  ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  [state] = await sql`select public.alm_saldo(${org},${product}) value`;
  assert.ok(Number(state.value.disponivel) >= 0);
  pass("S02 legacy receipt reversal versus reserve serializes against canonical provenance");
  let tool = await command(sql, actor, "salvar_ferramenta", {
    patrimonio: "TEST-TOOL-CONCURRENT",
    descricao: "Serialized exclusive resource",
    local_id: local,
    proprietario: "nexus",
    exige_calibracao: false,
  });
  const start = new Date(Date.now() + 60000),
    end = new Date(Date.now() + 3600000);
  data = {
    ferramenta_id: tool.id,
    expected_version: 1,
    pessoa_id: pessoa,
    inicio: start.toISOString(),
    fim: end.toISOString(),
  };
  results = await Promise.all([
    settled(command(a, actor, "reservar_ferramenta", data)),
    settled(command(b, actor, "reservar_ferramenta", data)),
  ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.ok(["23514", "40001"].includes(results.find((x) => !x.ok).code));
  pass("S03 two sessions cannot reserve one serialized tool for overlapping periods");
  tool = results.find((x) => x.ok).value;
  await command(sql, actor, "reservar_ferramenta", {
    ...data,
    expected_version: tool.detalhe.registro.version,
    inicio: end.toISOString(),
    fim: new Date(end.getTime() + 3600000).toISOString(),
  });
  pass("S04 half-open adjacent resource reservations are accepted");
  let unblock;
  const held = blocker.begin(async (tx) => {
    await tx`delete from public.user_roles where organization_id=${org} and user_id=${buyer} and role='compras'`;
    await new Promise((resolve) => {
      unblock = resolve;
    });
  });
  while (!unblock) await setTimeout(10);
  const pending = settled(
    command(waiter, buyer, "criar_inventario", {
      produto_id: product,
      local_id: local,
      contada: "1",
      motivo: "Revoked buyer must not approve new inventory",
    }),
  );
  await blocked();
  unblock();
  await held;
  const rejected = await pending;
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "42501");
  pass("S05 buyer role revoked during observed lock wait is revalidated before writing");
  await sql`insert into public.user_roles(organization_id,user_id,role) values(${org},${buyer},'compras')`;
  // Replays rebuild scope-sensitive detail; the receipt must not preserve a former manager's broad view.
  let t = await command(sql, actor, "salvar_ferramenta", {
    patrimonio: "TEST-REPLAY",
    descricao: "Tool replay scope check",
    local_id: local,
    proprietario: "nexus",
    exige_calibracao: false,
  });
  t = await command(sql, buyer, "reservar_ferramenta", {
    ferramenta_id: t.id,
    expected_version: 1,
    pessoa_id: buyerPessoa,
    inicio: new Date().toISOString(),
    fim: new Date(Date.now() + 600000).toISOString(),
  });
  const own = t.detalhe.custodias.find((x) => x.pessoa_id === buyerPessoa);
  t = await command(sql, buyer, "reservar_ferramenta", {
    ferramenta_id: t.id,
    expected_version: t.detalhe.registro.version,
    pessoa_id: pessoa,
    inicio: new Date(Date.now() + 600001).toISOString(),
    fim: new Date(Date.now() + 1200000).toISOString(),
  });
  await command(sql, buyer, "retirar_ferramenta", { custodia_id: own.id, expected_version: 1 });
  const replayKey = randomUUID(),
    returnData = {
      custodia_id: own.id,
      expected_version: 2,
      condicao: "disponivel",
      motivo: "Verified own return",
    };
  const before = await command(sql, buyer, "devolver_ferramenta", returnData, replayKey);
  assert.equal(before.detalhe.custodias.length, 2);
  await sql`delete from public.user_roles where organization_id=${org} and user_id=${buyer} and role='compras'`;
  await sql`insert into public.user_roles(organization_id,user_id,role) values(${org},${buyer},'campo')`;
  const after = await command(sql, buyer, "devolver_ferramenta", returnData, replayKey);
  assert.equal(after.detalhe.custodias.length, 1);
  assert.equal(after.detalhe.custodias[0].pessoa_id, buyerPessoa);
  const raw = await asUser(
    sql,
    buyer,
    (tx) => tx`select pessoa_id from public.ferramenta_custodias where ferramenta_id=${t.id}`,
  );
  assert.equal(raw.length, 1);
  assert.equal(raw[0].pessoa_id, buyerPessoa);
  pass("S06 role downgrade filters replay and direct custody SELECT to current own scope");
  // Each failure occurs after acceptance began; the whole commercial/project/link transaction must roll back.
  await asUser(
    sql,
    actor,
    (tx) => tx`update public.proposta_revisoes set status='enviada' where id=${revision}`,
  );
  for (const table of ["propostas", "ordens_compra", "ordens_producao"]) {
    await sql.unsafe(
      `create function public.alm_test_fail_acceptance() returns trigger language plpgsql as $$begin if new.organization_id='${org}'::uuid and new.projeto_id is not null then raise exception 'forced acceptance integration failure' using errcode='23514';end if;return new;end$$; create trigger alm_test_fail before update on public.${table} for each row execute function public.alm_test_fail_acceptance();`,
    );
    const attempt = await settled(
      asUser(
        sql,
        actor,
        (tx) =>
          tx`select public.aceitar_projeto_operacional(${org},${revision},${randomUUID()},null)`,
      ),
    );
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, "23514");
    const [current] =
      await sql`select r.status,(select count(*)::int from public.projetos where revisao_id=r.id) projects,(select count(*)::int from public.auditoria where organization_id=${org} and entidade_id=r.id and acao='aceitar') accepts,(select projeto_id from public.propostas where id=${proposal}) linked from public.proposta_revisoes r where r.id=${revision}`;
    assert.equal(current.status, "enviada");
    assert.equal(current.projects, 0);
    assert.equal(current.accepts, 0);
    assert.equal(current.linked, null);
    await sql.unsafe(
      `drop trigger alm_test_fail on public.${table};drop function public.alm_test_fail_acceptance();`,
    );
    pass(`S07 ${table} failure rolls back status, project, links, receipt and acceptance audit`);
  }
  results = await Promise.all([
    settled(
      asUser(
        a,
        actor,
        (tx) =>
          tx`select public.aceitar_projeto_operacional(${org},${revision},${revision},null) value`,
      ),
    ),
    settled(
      asUser(
        b,
        actor,
        (tx) =>
          tx`select public.aceitar_projeto_operacional(${org},${revision},${revision},null) value`,
      ),
    ),
  ]);
  assert.ok(results.every((x) => x.ok));
  const [final] =
    await sql`select (select count(*)::int from public.projetos where revisao_id=${revision}) projects,(select count(*)::int from public.auditoria where organization_id=${org} and entidade_id=${revision} and acao='aceitar') accepts,(select projeto_id from public.ordens_compra where id=${oc}) oc,(select projeto_id from public.ordens_producao where id=${op}) op`;
  assert.equal(final.projects, 1);
  assert.equal(final.accepts, 1);
  assert.equal(final.oc, final.op);
  assert.ok(final.oc);
  pass("S08 concurrent same acceptance creates one project, decision and consistent OC/OP links");
} finally {
  await Promise.all([sql, a, b, blocker, waiter].map((db) => db.end({ timeout: 3 })));
}
