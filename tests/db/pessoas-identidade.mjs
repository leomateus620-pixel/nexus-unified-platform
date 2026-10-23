import assert from "node:assert/strict";
import postgres from "postgres";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^[0-9]{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable local cluster only");
const settings = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
};
const db = postgres({ ...settings, database: "postgres" });
const org = "f6000000-0000-4000-8000-000000000001",
  admin = "f6000000-0000-4000-8000-000000000003",
  actor = "f6000000-0000-4000-8000-000000000004",
  reviewer = "f6000000-0000-4000-8000-000000000005";
const results = [];
const check = (name, value) => {
  assert.equal(value, true, name);
  results.push({ name, pass: true });
  console.log("PASS " + name);
};
async function as(user, work) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return work(tx);
  });
}
const key = () => crypto.randomUUID();
try {
  await db.begin(async (tx) => {
    await tx`insert into auth.users(id,email) values(${admin},'identity-admin@test.invalid'),(${actor},'identity-person@test.invalid'),(${reviewer},'identity-reviewer@test.invalid')`;
    await tx`insert into public.organizations(id,nome) values(${org},'Isolated identity review')`;
    await tx`insert into public.memberships(organization_id,user_id) values(${org},${admin}),(${org},${actor}),(${org},${reviewer})`;
    await tx`insert into public.user_roles(organization_id,user_id,role) values(${org},${admin},'admin'),(${org},${actor},'engenharia'),(${org},${reviewer},'engenharia')`;
  });
  const [created] = await as(
    admin,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${key()},${{ nome: "Pessoa de revisão isolada", vinculo: "colaborador", user_id: actor }}::jsonb) as value`,
  );
  const person = created.value.id;
  const [comp] = await as(
    admin,
    (tx) =>
      tx`select public.salvar_competencia(${org},${key()},${{ nome: "Competência documental de teste", exige_evidencia: false, exige_validade: false }}::jsonb) as value`,
  );
  const [saved] = await as(
    admin,
    (tx) =>
      tx`select public.salvar_qualificacao(${org},${key()},${{ pessoa_id: person, competencia_id: comp.value.id, emissor: "Emissor isolado", conclusao: "2026-10-01" }}::jsonb) as value`,
  );
  const qid = saved.value.id;
  await as(
    reviewer,
    (tx) => tx`select public.transicionar_qualificacao(${org},${key()},${qid},1,'em_conferencia')`,
  );
  await as(
    actor,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${key()},${{ nome: "Pessoa de revisão isolada", vinculo: "colaborador", user_id: null }}::jsonb,${person},1)`,
  );
  const [history] =
    await db`select count(*)::int as n from public.pessoa_usuario_identidades where organization_id=${org} and pessoa_id=${person} and user_id=${actor}`;
  check("known association is preserved without a current link", history.n === 1);
  const snapshot = async () =>
    JSON.stringify(
      await db`select estado,version,conferido_por from public.pessoa_qualificacoes where id=${qid}`,
    );
  const before = await snapshot();
  const [flag] = await as(
    actor,
    (tx) => tx`select public.qualificacao_validacao_permitida(${org},${qid}) as value`,
  );
  check("permission projection retains independent review after unlink", flag.value === false);
  await assert.rejects(
    as(
      actor,
      (tx) => tx`select public.transicionar_qualificacao(${org},${key()},${qid},2,'validada')`,
    ),
    (e) => e.code === "42501",
  );
  check("former association cannot approve its own qualification", (await snapshot()) === before);
  const [peerFlag] = await as(
    reviewer,
    (tx) => tx`select public.qualificacao_validacao_permitida(${org},${qid}) as value`,
  );
  check("another authorized reviewer remains available", peerFlag.value === true);
  const [approved] = await as(
    reviewer,
    (tx) =>
      tx`select public.transicionar_qualificacao(${org},${key()},${qid},2,'validada') as value`,
  );
  check(
    "independent reviewer approves a record registered by another administrator",
    approved.value.estado === "validada",
  );
  await assert.rejects(
    as(actor, (tx) => tx`select * from public.pessoa_usuario_identidades`),
    (e) => e.code === "42501",
  );
  check("association history is not directly readable to application roles", true);
  await assert.rejects(
    as(actor, (tx) => tx`select public.operacao_identidade_propria(${org},${person})`),
    (e) => e.code === "42501",
  );
  check("internal identity helper has no public execution privilege", true);
  await assert.rejects(
    db`delete from public.pessoa_usuario_identidades where organization_id=${org}`,
    (e) => e.code === "23514",
  );
  check("recorded associations remain immutable", true);
  const [newPerson] = await as(
    admin,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${key()},${{ nome: "Pessoa inicialmente sem login", vinculo: "prestador" }}::jsonb) as value`,
  );
  await as(
    admin,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${key()},${{ nome: "Pessoa inicialmente sem login", vinculo: "prestador", user_id: actor }}::jsonb,${newPerson.value.id},1)`,
  );
  await as(
    admin,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${key()},${{ nome: "Pessoa inicialmente sem login", vinculo: "prestador", user_id: null }}::jsonb,${newPerson.value.id},2)`,
  );
  const [newHistory] =
    await db`select count(*)::int as n from public.pessoa_usuario_identidades where organization_id=${org} and pessoa_id=${newPerson.value.id} and user_id=${actor}`;
  check("later association and removal preserve the same operational person", newHistory.n === 1);
  await as(
    admin,
    (tx) =>
      tx`select public.administrar_vinculo_operacional(${org},${key()},'desligar',${{ user_id: actor, motivo: "Desligamento isolado de teste" }}::jsonb)`,
  );
  const [detached] =
    await db`select count(*)::int as n from public.memberships where organization_id=${org} and user_id=${actor}`;
  check("historical association does not prevent authorized offboarding", detached.n === 0);
  const [afterAccess] = await as(
    actor,
    (tx) => tx`select public.qualificacao_validacao_permitida(${org},${qid}) as value`,
  );
  check("history does not grant review access after offboarding", afterAccess.value === false);
  console.log(JSON.stringify({ results, success: true }));
} finally {
  await db.end();
}
