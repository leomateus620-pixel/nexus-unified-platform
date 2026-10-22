import assert from "node:assert/strict";
import postgres from "postgres";

// Only the disposable loopback cluster created by run.ps1/run.sh is accepted.
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("Execute apenas no PostgreSQL local descartável.");
const settings = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
  idle_timeout: 0,
};
const db = postgres(settings),
  admin = postgres(settings);
const org = "e1000000-0000-4000-8000-000000000001";
const adminId = "e1000000-0000-4000-8000-000000000002";
const actor = "e1000000-0000-4000-8000-000000000003";
const person = "e1000000-0000-4000-8000-000000000004";
const team = "e1000000-0000-4000-8000-000000000005";
const secondTeam = "e1000000-0000-4000-8000-000000000009";
const competence = "e1000000-0000-4000-8000-000000000006";
const member = "e1000000-0000-4000-8000-000000000007";
const qualification = "e1000000-0000-4000-8000-000000000008";
const baseline = process.env.PGTEST_PESSOAS_BASELINE === "1";
const cases = [
  [
    "salvar_pessoa",
    (key) =>
      `select public.salvar_pessoa('${org}','${key}','{"nome":"Pessoa da disputa","vinculo":"prestador"}')`,
  ],
  [
    "salvar_equipe",
    (key) => `select public.salvar_equipe('${org}','${key}','{"nome":"Equipe da disputa"}')`,
  ],
  [
    "vincular_membro_equipe",
    (key) =>
      `select public.vincular_membro_equipe('${org}','${key}','${secondTeam}','${person}','2027-01-01')`,
  ],
  [
    "encerrar_membro_equipe",
    (key) =>
      `select public.encerrar_membro_equipe('${org}','${key}','${member}','2026-10-22','Encerrar vínculo de teste')`,
  ],
  [
    "salvar_competencia",
    (key) =>
      `select public.salvar_competencia('${org}','${key}','{"nome":"Competência da disputa"}')`,
  ],
  [
    "salvar_qualificacao",
    (key) =>
      `select public.salvar_qualificacao('${org}','${key}','{"pessoa_id":"${person}","competencia_id":"${competence}","emissor":"Emissor de teste","conclusao":"2026-10-01"}')`,
  ],
  [
    "transicionar_qualificacao",
    (key) =>
      `select public.transicionar_qualificacao('${org}','${key}','${qualification}',1,'em_conferencia')`,
  ],
];
async function authenticate(tx, user) {
  await tx.unsafe("set local role authenticated");
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
}
async function snapshot() {
  const result = {};
  for (const name of [
    "pessoas",
    "equipes",
    "equipe_membros",
    "competencias",
    "pessoa_qualificacoes",
    "operacao_historico",
    "operacoes_idempotentes",
  ])
    result[name] = await db.unsafe(
      `select to_jsonb(t) as row from public.${name} t where organization_id=$1 ${name === "operacoes_idempotentes" ? "and autor='" + actor + "'" : ""} order by to_jsonb(t)::text`,
      [org],
    );
  return JSON.stringify(result);
}
try {
  await db.unsafe(`
    insert into auth.users(id,email) values('${adminId}','people-race-admin@test.invalid'),('${actor}','people-race-actor@test.invalid');
    insert into public.organizations(id,nome) values('${org}','Disposable people concurrency');
    insert into public.memberships(organization_id,user_id) values('${org}','${adminId}'),('${org}','${actor}');
    insert into public.user_roles(organization_id,user_id,role) values('${org}','${adminId}','admin'),('${org}','${actor}','engenharia');
    select set_config('request.jwt.claim.sub','${adminId}',false);
    insert into public.pessoas(id,organization_id,nome,vinculo) values('${person}','${org}','Pessoa sem login da disputa','prestador');
    insert into public.equipes(id,organization_id,nome) values('${team}','${org}','Equipe existente da disputa'),('${secondTeam}','${org}','Segunda equipe da disputa');
    insert into public.competencias(id,organization_id,nome) values('${competence}','${org}','Política existente da disputa');
    insert into public.equipe_membros(id,organization_id,equipe_id,pessoa_id,inicio) values('${member}','${org}','${team}','${person}','2026-10-01');
    insert into public.pessoa_qualificacoes(id,organization_id,pessoa_id,competencia_id,emissor,conclusao)
      values('${qualification}','${org}','${person}','${competence}','Emissor de teste','2026-10-01');
  `);
  for (const [index, [name, command]] of cases.entries()) {
    // Reset role between independent cases; no operational data or external URL is used.
    await db`insert into public.user_roles(organization_id,user_id,role) values(${org},${actor},'engenharia') on conflict do nothing`;
    const key = `e2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const adminKey = `e3000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const app = `nexus-people-revocation-${process.pid}-${index}`;
    const writer = postgres({ ...settings, connection: { application_name: app } });
    const before = await snapshot();
    let release, ready, rejectReady;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    const prepared = new Promise((resolve, reject) => {
      ready = resolve;
      rejectReady = reject;
    });
    const revocation = admin.begin(async (tx) => {
      await authenticate(tx, adminId);
      await tx`select public.administrar_vinculo_operacional(${org},${adminKey},'papel',${tx.json({ user_id: actor, role: "engenharia", habilitar: false })})`;
      // The published command waits here after its old permission check. The fixed
      // command waits on nexus-admin before checking its current permission.
      await tx`select pg_advisory_xact_lock(hashtextextended(${org + actor + key},0))`;
      ready();
      await released;
    });
    revocation.catch(rejectReady);
    try {
      await prepared;
      const write = writer
        .begin(async (tx) => {
          await tx.unsafe("set local statement_timeout='12s'");
          await authenticate(tx, actor);
          return tx.unsafe(command(key));
        })
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      const deadline = Date.now() + 8_000;
      let waiting = false;
      while (Date.now() < deadline) {
        const rows =
          await db`select wait_event_type from pg_stat_activity where application_name=${app} and state='active'`;
        if (rows.some((row) => row.wait_event_type === "Lock")) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(waiting, true, `${name}: writer reached a real PostgreSQL lock`);
      release();
      await revocation;
      const result = await write;
      if (baseline) {
        assert.equal(result.error, undefined, `${name}: reproduce the published pre-fix behavior`);
        assert.notEqual(
          await snapshot(),
          before,
          `${name}: baseline demonstrates an unauthorized persisted effect`,
        );
        console.log(`REPRODUCED baseline: ${name} persists after committed role revocation`);
      } else {
        assert.equal(
          result.error?.code,
          "42501",
          `${name}: current permission is checked after the lock`,
        );
        assert.equal(
          await snapshot(),
          before,
          `${name}: no write, audit event or receipt after revocation`,
        );
        console.log(
          `PASS: ${name} rejects revoked permission after a concurrent wait, without persisted effect`,
        );
      }
    } finally {
      release();
      await revocation;
      await writer.end({ timeout: 2 });
    }
  }
  await db.unsafe(`
    insert into public.user_roles(organization_id,user_id,role) values('${org}','${actor}','engenharia') on conflict do nothing;
    select set_config('request.jwt.claim.sub','${adminId}',false);
    insert into public.pessoas(id,organization_id,nome,vinculo,user_id,ativa)
      values('e1000000-0000-4000-8000-000000000010','${org}','Conferente arquivado','colaborador','${actor}',false);
    insert into public.competencias(id,organization_id,nome,exige_evidencia,exige_validade)
      values('e1000000-0000-4000-8000-000000000011','${org}','Política documental de teste',false,false);
    insert into public.pessoa_qualificacoes(id,organization_id,pessoa_id,competencia_id,emissor,conclusao,estado)
      values('e1000000-0000-4000-8000-000000000012','${org}','e1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000011','Emissor de teste','2026-10-01','em_conferencia');
  `);
  const selfBefore = await snapshot();
  const selfValidation = await db
    .begin(async (tx) => {
      await authenticate(tx, actor);
      return tx`select public.transicionar_qualificacao(${org},'e2000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000012',1,'validada')`;
    })
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  if (baseline) {
    assert.equal(selfValidation.error, undefined);
    assert.notEqual(await snapshot(), selfBefore);
    console.log(
      "REPRODUCED baseline: archived operational person can validate their own qualification",
    );
  } else {
    assert.equal(selfValidation.error?.code, "42501");
    assert.equal(await snapshot(), selfBefore);
    console.log("PASS: archiving a person never removes the independent-review requirement");
  }
} finally {
  await Promise.all([db.end({ timeout: 2 }), admin.end({ timeout: 2 })]);
}
