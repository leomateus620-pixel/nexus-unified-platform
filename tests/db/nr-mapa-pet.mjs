import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { fixture, options } from "../cotrirosa/fixture.mjs";
const name = `cotrirosa_test_${process.pid}`,
  f = await fixture(name),
  { sql, org, client, unit, other, user, reader, locals, spaces, version, os } = f;
let checks = 0;
const check = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
  console.log("PASS " + label);
};
const auth = async (id = user) => {
  await sql.unsafe("reset role");
  await sql`select set_config('request.jwt.claim.sub',${id},false)`;
  await sql.unsafe("set role authenticated");
};
const rpc = async (d, k = randomUUID(), db = sql) =>
  (
    await db`select pet_executar(${org}::uuid,${db.json({ comando: "criar_pet", chave: k, dados: d })}::jsonb) r`
  )[0].r;
const context = async (local = locals[1], norm = "NR33", u = unit) =>
  (
    await sql`select pet_contexto_unidade(${org}::uuid,${client}::uuid,${u}::uuid,${norm},${local}::uuid) r`
  )[0].r;
const list = async (filters) =>
  (await sql`select pet_listar(${org}::uuid,${sql.json(filters)}::jsonb) r`)[0].r;
const payload = (i = 1) => ({
  cliente_id: client,
  unidade_id: unit,
  local_id: locals[i],
  espaco_id: spaces[i],
  norma: "NR33",
  os_id: null,
  atividade: "Inspeção FIXTURE controlada",
  termino_previsto: new Date(Date.now() + 4 * 3600000).toISOString(),
  timezone: "America/Sao_Paulo",
  modelo_versao_id: version,
});
const denied = async (fn, code, label) => {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
  console.log("PASS " + label);
};
try {
  const old = (await sql`select * from pet_permissoes where id=${f.legacy.id}`)[0];
  check(old.snapshot_identificacao, f.legacy.snapshot_identificacao, "snapshot legado preservado");
  check(old.os_id, os, "OS legada preservada");
  check(old.local_nr_id, locals[0], "backfill somente por FK comprovada");
  await auth();
  for (const norm of ["NR33", "NR35"]) {
    const m = (await sql`select nr_mapa_contexto(${org},${client},${unit},${norm}) r`)[0].r;
    check(m.objetos.length, 5, "cinco alvos em " + norm);
  }
  check(
    (await sql`select nr_mapa_contexto(${org},${client},${other},'NR33') r`)[0].r.cena,
    null,
    "outra unidade sem cena",
  );
  check((await context()).pode_criar, false, "modelo não aprovado bloqueia criação");
  await denied(() => rpc(payload()), "23514", "backend recusa procedimento não aprovado");
  await sql.unsafe("reset role");
  await f.authorizeModel();
  await auth();
  const data = payload(),
    key = randomUUID();
  const peer = postgres({ ...options(), database: name });
  await peer`select set_config('request.jwt.claim.sub',${user},false)`;
  await peer.unsafe("set role authenticated");
  const [a, b] = await Promise.all([rpc(data, key), rpc(data, key, peer)]);
  await peer.end();
  check(a.id, b.id, "duplo operador / mesma intenção cria um único registro");
  check((await rpc(data, key)).id, a.id, "retry após resposta perdida mantém pet_id");
  check(a.detalhe.pet.os_id, null, "criação sem OS fictícia");
  check(a.detalhe.pet.estado_documental, "rascunho", "criação não emite");
  check(a.detalhe.metricas.presentes, 0, "criação não registra entrada");
  check(
    (await list({ unidade_id: unit, espaco_id: spaces[1] })).total,
    1,
    "mesmo registro no silo correto",
  );
  check(
    (await list({ unidade_id: unit, espaco_id: spaces[0] })).registros.some((p) => p.id === a.id),
    false,
    "ausência no silo vizinho",
  );
  check(
    (await list({ unidade_id: other, espaco_id: spaces[1] })).total,
    0,
    "isolamento unidade + espaço",
  );
  await denied(
    () => rpc({ ...data, local_id: locals[0] }),
    "42501",
    "local/space manipulados recusados",
  );
  await denied(
    () => context(locals[1], "NR33", other),
    "42501",
    "contexto de outra unidade recusado",
  );
  const corn = await rpc(payload(4));
  check(
    (await list({ unidade_id: unit, busca: "AS 05" })).registros[0].id,
    corn.id,
    "apelido AS 05 resolve mesma PET",
  );
  check(
    (await list({ unidade_id: unit, busca: "SA 05" })).registros[0].id,
    corn.id,
    "grafia SA 05 preservada",
  );
  const linked = await rpc({ ...payload(3), os_id: os });
  check(linked.detalhe.pet.os_id, os, "OS elegível vinculada explicitamente");
  const command = async (cmd, d) =>
    (
      await sql`select pet_executar(${org},${sql.json({ chave: randomUUID(), comando: cmd, dados: d })}) r`
    )[0].r;
  await denied(
    () => command("concluir_os", { os_id: os, expected_version: 1 }),
    "23514",
    "OS não encerra com PET pendente",
  );
  const edit = {
    pet_id: a.id,
    expected_version: a.detalhe.pet.version,
    atividade: "Edição operador A",
    termino_previsto: data.termino_previsto,
    conteudo: {},
    participantes: [],
    respostas: [],
  };
  await command("salvar_rascunho", edit);
  await denied(
    () => command("salvar_rascunho", { ...edit, atividade: "Edição concorrente B" }),
    "40001",
    "versão concorrente não sobrescreve",
  );
  await denied(
    () => command("emitir", { pet_id: corn.id, expected_version: corn.detalhe.pet.version }),
    "23514",
    "emissão incompleta / integração ausente bloqueada",
  );
  await auth(reader);
  check((await context()).pode_criar, false, "consulta NR não concede criação");
  await denied(
    () => rpc(data, key),
    "42501",
    "revogação / outro papel não recupera recibo privilegiado",
  );
  check(
    (await sql`select count(*)::int n from pet_permissoes where id=${a.id}`)[0].n,
    0,
    "RLS protege permissão não atribuída",
  );
  await auth();
  const current = (await sql`select pet_obter(${org},${a.id}) r`)[0].r;
  await command("cancelar", {
    pet_id: a.id,
    expected_version: current.pet.version,
    motivo: "Cancelamento de fixture controlada",
  });
  check(
    (await list({ unidade_id: unit, espaco_id: spaces[1], grupo: "andamento" })).total,
    0,
    "cancelada sai de andamento",
  );
  check(
    (await list({ unidade_id: unit, espaco_id: spaces[1], grupo: "concluidas" })).total,
    1,
    "cancelada preservada no histórico",
  );
  await sql.unsafe("reset role");
  check(
    (
      await sql`select count(*)::int n from operacao_historico where entidade_id=${a.id} and operacao='criar_pet'`
    )[0].n,
    1,
    "retry não duplica auditoria",
  );
  console.log(
    `${checks} checks passed. PostgreSQL real; dados sintéticos; nenhuma assinatura simulada.`,
  );
} finally {
  await sql.end();
  const admin = postgres({ ...options(), database: "postgres" });
  await admin.unsafe(`drop database ${name} with (force)`);
  await admin.end();
}
