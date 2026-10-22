import assert from "node:assert/strict";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL only");
const db = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  database: process.env.PGTEST_DATABASE || "postgres",
  user: "postgres",
  max: 1,
  prepare: false,
  onnotice() {},
});
const org = "f7000000-0000-4000-8000-000000000001",
  otherOrg = "f7000000-0000-4000-8000-000000000002",
  admin = "f7000000-0000-4000-8000-000000000003",
  field = "f7000000-0000-4000-8000-000000000004",
  outsider = "f7000000-0000-4000-8000-000000000005";
const results = [],
  key = () => crypto.randomUUID();
function check(name, value = true) {
  assert.equal(value, true, name);
  results.push({ name, pass: true });
  console.log("PASS " + name);
}
async function as(user, work) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return work(tx);
  });
}
async function command(user, operation, data, uuid = key(), tenant = org) {
  const [r] = await as(
    user,
    (tx) =>
      tx`select public.eq_executar_indisponibilidade(${tenant},${uuid},${operation},${data}::jsonb) as value`,
  );
  return r.value;
}
async function reject(work, code) {
  await assert.rejects(work, (e) => e.code === code);
}
try {
  await db`insert into auth.users(id,email) values(${admin},'availability-admin@test.invalid'),(${field},'availability-field@test.invalid'),(${outsider},'availability-outsider@test.invalid')`;
  await db`insert into public.organizations(id,nome) values(${org},'Isolated availability'),(${otherOrg},'Isolated other availability')`;
  await db`insert into public.memberships(organization_id,user_id) values(${org},${admin}),(${org},${field}),(${otherOrg},${outsider})`;
  await db`insert into public.user_roles(organization_id,user_id,role) values(${org},${admin},'admin'),(${org},${field},'campo'),(${otherOrg},${outsider},'admin')`;
  const createPerson = async (user, tenant, userId = null) => {
    const [r] = await as(
      user,
      (tx) =>
        tx`select public.salvar_pessoa(${tenant},${key()},${{ nome: "Pessoa isolada de disponibilidade", vinculo: "colaborador", user_id: userId }}::jsonb) as value`,
    );
    return r.value;
  };
  const person = await createPerson(admin, org, field),
    peer = await createPerson(admin, org),
    foreign = await createPerson(outsider, otherOrg);
  const data = {
      pessoa_id: person.id,
      inicio_local: "2026-12-02T09:00",
      fim_local: "2026-12-02T12:00",
      timezone: "America/Sao_Paulo",
      motivo: "Atividade externa operacional",
    },
    creationKey = key();
  const record = await command(admin, "registrar", data, creationKey);
  check(
    "local IANA period persists exact instants",
    new Date(record.inicio).toISOString() === "2026-12-02T12:00:00.000Z" && record.version === 1,
  );
  const replay = await command(admin, "registrar", data, creationKey);
  check(
    "retry creates one canonical availability record",
    replay.id === record.id &&
      (
        await db`select count(*)::int n from public.indisponibilidades where organization_id=${org}`
      )[0].n === 1,
  );
  await reject(
    command(admin, "registrar", { ...data, motivo: "Outro conteúdo operacional" }, creationKey),
    "23505",
  );
  check("same key with changed payload is rejected");
  const [own] = await as(
    field,
    (tx) => tx`select public.eq_listar_indisponibilidades(${org},${person.id}) as value`,
  );
  check(
    "field reads only own availability without management privilege",
    own.value.total === 1 && own.value.pode_gerir === false,
  );
  await reject(
    as(field, (tx) => tx`select public.eq_listar_indisponibilidades(${org},${peer.id})`),
    "42501",
  );
  check("field cannot enumerate another person's availability");
  await reject(command(admin, "registrar", { ...data, pessoa_id: foreign.id }), "42501");
  check("cross-tenant person rejected before any write");
  await reject(command(outsider, "registrar", data, key(), org), "42501");
  check("another tenant cannot write availability");
  await reject(
    command(admin, "registrar", {
      ...data,
      timezone: "America/New_York",
      inicio_local: "2027-03-14T02:15",
      fim_local: "2027-03-14T03:15",
    }),
    "23514",
  );
  check("nonexistent DST clock time is rejected without a false reservation");
  await reject(
    command(field, "cancelar", {
      id: record.id,
      expected_version: 1,
      motivo: "Cancelamento não autorizado",
    }),
    "42501",
  );
  check("field cannot cancel managed availability");
  await reject(
    command(admin, "cancelar", {
      id: record.id,
      expected_version: 2,
      motivo: "Alteração concorrente isolada",
    }),
    "40001",
  );
  check("stale cancellation preserves current record");
  await reject(
    command(admin, "cancelar", { id: record.id, expected_version: 1, motivo: "x" }),
    "23514",
  );
  check("cancellation requires an operational reason");
  const cancelKey = key(),
    cancelData = {
      id: record.id,
      expected_version: 1,
      motivo: "Atividade reprogramada pela coordenação",
    };
  const canceled = await command(admin, "cancelar", cancelData, cancelKey);
  check(
    "cancel preserves original period and reason with traceable version",
    canceled.cancelada_em !== null &&
      canceled.version === 2 &&
      canceled.motivo_operacional === data.motivo &&
      new Date(canceled.inicio).getTime() === new Date(record.inicio).getTime(),
  );
  check(
    "cancel retry does not append another adjustment",
    (await command(admin, "cancelar", cancelData, cancelKey)).version === 2,
  );
  await reject(
    command(admin, "cancelar", { ...cancelData, motivo: "Outra intenção" }, cancelKey),
    "23505",
  );
  check("cancel retry with changed content is rejected");
  await reject(
    as(
      field,
      (tx) =>
        tx`update public.indisponibilidades set motivo_operacional='Forged direct edit' where id=${record.id}`,
    ),
    "42501",
  );
  check("application cannot bypass commands with direct update");
  const [history] =
    await db`select count(*)::int n from public.operacao_historico where organization_id=${org} and entidade='indisponibilidades' and entidade_id=${record.id}`;
  check("creation and cancellation are audited once each", history.n === 2);
  await db`insert into public.user_roles(organization_id,user_id,role) values(${org},${field},'admin')`;
  await db`delete from public.memberships where organization_id=${org} and user_id=${admin}`;
  await reject(command(admin, "registrar", data, creationKey), "42501");
  check("revocation rejects replay despite a prior valid receipt");
  console.log(
    JSON.stringify({
      method:
        "Disposable PostgreSQL integration with real SQL/RLS, not connected Auth/Storage HTTP",
      results,
      success: true,
    }),
  );
} finally {
  await db.end();
}
