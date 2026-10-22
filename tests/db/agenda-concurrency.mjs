import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const args = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  process.env.PGTEST_HOST || "127.0.0.1",
  "-p",
  process.env.PGTEST_PORT || "55432",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const org = "61000000-0000-0000-0000-000000000001";
const auth =
  "set role authenticated; select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',false);";
function sql(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PGTEST_PSQL || "psql", args);
    let output = "",
      errors = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (errors += data));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(errors))));
    child.stdin.end(source);
  });
}
const literal = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
const person = await sql(
  `select id from public.pessoas where organization_id='${org}' and nome='Agenda pessoa principal'`,
);
const data = (title, start, end) => ({
  titulo: title,
  tipo: "acao_interna",
  inicio: start,
  fim: end,
  timezone: "America/Sao_Paulo",
  responsavel_id: person,
  participantes: [],
});
const created = await Promise.all(
  ["A", "B"].map((suffix) =>
    sql(
      `${auth} select public.salvar_evento_agenda('${org}',gen_random_uuid(),${literal(data(`Concurrent publication ${suffix}`, "2027-01-01T10:00:00Z", "2027-01-01T11:00:00Z"))})->>'id';`,
    ),
  ),
);
const ids = created.map((value) => value.split(/\r?\n/).at(-1));
const attempts = await Promise.allSettled(
  ids.map((id) =>
    sql(
      `${auth} begin; select public.transicionar_evento_agenda('${org}',gen_random_uuid(),'${id}',1,'publicado'); select pg_sleep(0.2); commit;`,
    ),
  ),
);
assert.equal(attempts.filter((value) => value.status === "fulfilled").length, 1);
assert.match(
  attempts.find((value) => value.status === "rejected").reason.message,
  /Conflito de disponibilidade:.*conflito_pessoa/,
);
assert.equal(
  await sql(
    `select count(*) from public.agenda_eventos where id in ('${ids.join("','")}') and estado='publicado'`,
  ),
  "1",
);
assert.equal(
  await sql(
    `select count(*) from public.agenda_reservas_pessoas where evento_id in ('${ids.join("','")}') and ativa`,
  ),
  "1",
);
console.log("PASS: concurrent exclusive publication confirms one event and one person reservation");

const winner = await sql(
  `select id from public.agenda_eventos where id in ('${ids.join("','")}') and estado='publicado'`,
);
const second = (
  await sql(
    `${auth} select public.salvar_evento_agenda('${org}',gen_random_uuid(),${literal(data("Concurrent reschedule second", "2027-01-01T14:00:00Z", "2027-01-01T15:00:00Z"))})->>'id';`,
  )
)
  .split(/\r?\n/)
  .at(-1);
await sql(
  `${auth} select public.transicionar_evento_agenda('${org}',gen_random_uuid(),'${second}',1,'publicado');`,
);
const reschedules = await Promise.allSettled(
  [winner, second].map((id) =>
    sql(
      `${auth} begin; select public.salvar_evento_agenda('${org}',gen_random_uuid(),${literal(data("Concurrent target", "2027-01-02T10:00:00Z", "2027-01-02T11:00:00Z"))},'${id}',2); select pg_sleep(0.2); commit;`,
    ),
  ),
);
assert.equal(reschedules.filter((value) => value.status === "fulfilled").length, 1);
assert.match(
  reschedules.find((value) => value.status === "rejected").reason.message,
  /Conflito de disponibilidade:.*conflito_pessoa/,
);
assert.equal(
  await sql(
    `select count(*) from public.agenda_reservas_pessoas where evento_id in ('${winner}','${second}') and ativa`,
  ),
  "2",
);
assert.equal(
  await sql(
    `select count(*) from public.agenda_reservas_pessoas where pessoa_id='${person}' and ativa and inicio='2027-01-02T10:00:00Z'`,
  ),
  "1",
);
console.log(
  "PASS: concurrent rescheduling rejects the conflict and retains the losing event's original reservation",
);

const repeated = (
  await sql(
    `${auth} select public.salvar_evento_agenda('${org}',gen_random_uuid(),${literal(data("Repeated publication", "2027-01-03T10:00:00Z", "2027-01-03T11:00:00Z"))})->>'id';`,
  )
)
  .split(/\r?\n/)
  .at(-1);
const publish = `${auth} select public.transicionar_evento_agenda('${org}','63000000-0000-0000-0000-000000000001','${repeated}',1,'publicado');`;
const responses = await Promise.all(Array.from({ length: 10 }, () => sql(publish)));
assert.equal(new Set(responses).size, 1);
assert.equal(
  await sql(
    `select count(*) from public.agenda_reservas_pessoas where evento_id='${repeated}' and ativa`,
  ),
  "1",
);
assert.equal(
  await sql(`select count(*) from public.outbox_eventos where agenda_evento_id='${repeated}'`),
  "1",
);
console.log(
  "PASS: ten publication retries produce one reservation, one version effect and identical responses",
);

// Last administrator: two real sessions remove different admins under the same organization lock.
await sql(`insert into public.organizations(id,nome) values('73000000-0000-0000-0000-000000000001','Concurrent admin fixture');
  insert into public.memberships(organization_id,user_id) values('73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001'),('73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002');
  insert into public.user_roles(organization_id,user_id,role) values('73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','admin'),('73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','admin');`);
const removals = await Promise.allSettled(
  ["1", "2"].map((suffix) =>
    sql(
      `set role authenticated; select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-00000000000${suffix}',false); begin; delete from public.user_roles where organization_id='73000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-00000000000${suffix}' and role='admin'; select pg_sleep(0.2); commit;`,
    ),
  ),
);
assert.equal(removals.filter((value) => value.status === "fulfilled").length, 1);
assert.match(
  removals.find((value) => value.status === "rejected").reason.message,
  /ao menos um administrador/,
);
assert.equal(
  await sql(
    "select count(*) from public.user_roles where organization_id='73000000-0000-0000-0000-000000000001' and role='admin'",
  ),
  "1",
);
console.log("PASS: simultaneous removals preserve one active administrator");
