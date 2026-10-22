import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const testDatabase = process.env.PGTEST_DATABASE || "postgres";
const testPort = Number(process.env.PGTEST_PORT);
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !Number.isInteger(testPort) ||
  testPort < 1024 ||
  testPort > 65535 ||
  testPort === 5432 ||
  !/^(?:postgres|agenda47_[a-z0-9_]+)$/.test(testDatabase)
)
  throw new Error(
    "Requer PGTEST_EPHEMERAL=1, PGTEST_HOST=127.0.0.1, porta não padrão e banco postgres descartável ou agenda47_*.",
  );
const settings = {
  host: "127.0.0.1",
  port: testPort,
  user: "postgres",
  database: testDatabase,
  max: 1,
  prepare: false,
  idle_timeout: 0,
  onnotice: () => {},
};
const observer = postgres(settings);
const a = postgres({ ...settings, connection: { application_name: "agenda47-edge-writer-a" } });
const b = postgres({ ...settings, connection: { application_name: "agenda47-edge-writer-b" } });
const report = {
  method:
    "Two actual PostgreSQL mutation sessions, with third read-only lock observer, isolated random organization and canonical commands. No connected-backend proof.",
  database: settings.database,
  host: "127.0.0.1",
  port: settings.port,
  captured_at: new Date().toISOString(),
  checks: [],
};
const org = randomUUID(),
  actor = randomUUID(),
  fieldA = randomUUID(),
  fieldB = randomUUID();
let personA, personB, tool;
const errorResult = (work) =>
  work.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
async function auth(tx, user = actor) {
  await tx.unsafe("set local role authenticated");
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
}
async function execute(tx, command, data, key = randomUUID()) {
  return (
    await tx`select public.ag_executar(${org}::uuid,${key}::uuid,${command},${tx.json(data)}) as value`
  )[0].value;
}
async function command(command, data, user = actor) {
  return a.begin(async (tx) => {
    await auth(tx, user);
    return execute(tx, command, data);
  });
}
async function canonical(name, args, user = actor) {
  return a.begin(async (tx) => {
    await auth(tx, user);
    const params = args.map((value) =>
      typeof value === "string" && /^[{[]/.test(value) ? JSON.parse(value) : value,
    );
    return (
      await tx.unsafe(
        `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
        params,
      )
    )[0].value;
  });
}
const eventInput = (title, person, start, end, extra = {}) => ({
  titulo: title,
  descricao: "",
  tipo: "visita_tecnica",
  inicio: start,
  fim: end,
  timezone: "America/Sao_Paulo",
  dia_inteiro: false,
  local: "",
  responsavel_id: person,
  bloqueia_recursos: true,
  participantes: [],
  competencias: [],
  ...extra,
});
async function draft(input) {
  const r = await command("salvar_evento", { evento: input });
  const id = r.evento_id || r.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  return id;
}
async function detail(id) {
  return (await observer`select public.ag_obter(${org}::uuid,${id}::uuid) as value`)[0].value;
}
async function read(id) {
  return (
    await observer`select to_jsonb(e) as value from public.agenda_eventos e where id=${id}::uuid`
  )[0].value;
}
async function activePeople(id) {
  return Number(
    (
      await observer`select count(*) as n from public.agenda_reservas_pessoas where evento_id=${id}::uuid and ativa`
    )[0].n,
  );
}
async function activeTool(id) {
  return Number(
    (
      await observer`select count(*) as n from public.ferramenta_custodias where agenda_evento_id=${id}::uuid and estado in ('reservada','retirada')`
    )[0].n,
  );
}
async function recorded(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
async function orderedRace(first, second) {
  let release, ready, rejectReady;
  const held = new Promise((resolve) => (release = resolve)),
    prepared = new Promise((resolve, reject) => {
      ready = resolve;
      rejectReady = reject;
    });
  const leader = a.begin(async (tx) => {
    await auth(tx);
    await tx.unsafe("set local statement_timeout='15s'");
    const pid = (await tx`select pg_backend_pid() as pid`)[0].pid;
    const value = await first(tx);
    ready(pid);
    await held;
    return value;
  });
  leader.catch(rejectReady);
  try {
    const blocker = await prepared;
    const follower = errorResult(
      b.begin(async (tx) => {
        await auth(tx);
        await tx.unsafe("set local statement_timeout='15s'");
        return second(tx);
      }),
    );
    const deadline = Date.now() + 8000;
    let blocked = false;
    while (Date.now() < deadline) {
      const rows =
        await observer`select pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name='agenda47-edge-writer-b' and wait_event_type='Lock'`;
      if (rows.some((row) => row.blockers.includes(blocker))) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(
      blocked,
      true,
      "follower must wait on the first PostgreSQL transaction, not merely overlap in JS",
    );
    release();
    await leader;
    return await follower;
  } finally {
    release();
    await leader;
  }
}
try {
  const guard = (
    await observer`select current_database() as database,host(inet_server_addr()) as host,to_regprocedure('public.ag_executar(uuid,uuid,text,jsonb)')::text as api`
  )[0];
  assert.equal(guard.database, settings.database);
  assert.equal(guard.host, "127.0.0.1");
  assert.ok(
    guard.api,
    "Agenda47 API must already be installed; no migration is applied by this test",
  );
  await observer`insert into auth.users(id,email) values(${actor}::uuid,${"agenda-edge-admin-" + actor + "@example.invalid"}),(${fieldA}::uuid,${"agenda-edge-a-" + fieldA + "@example.invalid"}),(${fieldB}::uuid,${"agenda-edge-b-" + fieldB + "@example.invalid"})`;
  await observer`insert into public.organizations(id,nome) values(${org}::uuid,'Agenda edgecases disposable')`;
  for (const [id, role] of [
    [actor, "admin"],
    [fieldA, "campo"],
    [fieldB, "campo"],
  ]) {
    await observer`insert into public.memberships(organization_id,user_id) values(${org}::uuid,${id}::uuid)`;
    await observer`insert into public.user_roles(organization_id,user_id,role) values(${org}::uuid,${id}::uuid,${role})`;
  }
  personA = (
    await canonical("salvar_pessoa", [
      org,
      randomUUID(),
      JSON.stringify({ nome: "Edge person A", vinculo: "colaborador", user_id: fieldA }),
    ])
  ).id;
  personB = (
    await canonical("salvar_pessoa", [
      org,
      randomUUID(),
      JSON.stringify({ nome: "Edge person B", vinculo: "colaborador", user_id: fieldB }),
    ])
  ).id;
  const local = (
    await canonical("alm_executar", [
      org,
      randomUUID(),
      "salvar_local",
      JSON.stringify({
        nome: "Edge isolated store",
        descricao: "Only disposable fixtures",
        ativo: true,
      }),
    ])
  ).id;
  tool = (
    await canonical("alm_executar", [
      org,
      randomUUID(),
      "salvar_ferramenta",
      JSON.stringify({
        patrimonio: "EDGE-" + randomUUID(),
        descricao: "Edge exclusive tool",
        local_id: local,
        proprietario: "nexus",
        exige_calibracao: false,
      }),
    ])
  ).id;
  const date = (await observer`select (current_date+20)::text as d`)[0].d;
  const instant = (hour, day = date) => day + "T" + String(hour).padStart(2, "0") + ":00:00-03:00";
  await recorded(
    "last person reservation is revalidated after a real concurrent wait",
    async () => {
      const x = await draft(
          eventInput("Person contention winner", personA, instant(8), instant(9)),
        ),
        y = await draft(eventInput("Person contention loser", personA, instant(8), instant(9)));
      const result = await orderedRace(
        (tx) => execute(tx, "publicar", { evento_id: x, expected_version: 1 }),
        (tx) => execute(tx, "publicar", { evento_id: y, expected_version: 1 }),
      );
      assert.equal(result.error?.code, "23P01");
      assert.equal((await read(x)).estado, "publicado");
      assert.equal((await read(y)).estado, "rascunho");
      assert.equal((await read(y)).version, 1);
      assert.equal(await activePeople(x), 1);
      assert.equal(await activePeople(y), 0);
    },
  );
  await recorded(
    "last tool reservation cannot be won by two events with different people",
    async () => {
      const x = await draft(
          eventInput("Tool contention winner", personA, instant(10), instant(11), {
            ferramentas: [{ ferramenta_id: tool, pessoa_id: personA }],
          }),
        ),
        y = await draft(
          eventInput("Tool contention loser", personB, instant(10), instant(11), {
            ferramentas: [{ ferramenta_id: tool, pessoa_id: personB }],
          }),
        );
      const result = await orderedRace(
        (tx) => execute(tx, "publicar", { evento_id: x, expected_version: 1 }),
        (tx) => execute(tx, "publicar", { evento_id: y, expected_version: 1 }),
      );
      assert.ok(["23514", "23P01"].includes(result.error?.code));
      assert.match(result.error.message, /ferramenta|reserva|cust[oó]dia|conflito/i);
      assert.equal((await read(y)).estado, "rascunho");
      assert.equal(await activePeople(y), 0);
      assert.equal(await activeTool(x), 1);
      assert.equal(await activeTool(y), 0);
    },
  );
  await recorded(
    "cancel wins against stale reschedule without ghost person or tool reservation",
    async () => {
      const input = eventInput("Cancel versus reschedule", personA, instant(12), instant(13), {
          ferramentas: [{ ferramenta_id: tool, pessoa_id: personA }],
        }),
        id = await draft(input);
      await command("publicar", { evento_id: id, expected_version: 1 });
      const result = await orderedRace(
        (tx) =>
          execute(tx, "cancelar", {
            evento_id: id,
            expected_version: 2,
            motivo: "Cancelled by authorized planner",
          }),
        (tx) =>
          execute(tx, "salvar_evento", {
            evento_id: id,
            expected_version: 2,
            evento: { ...input, inicio: instant(13), fim: instant(14) },
          }),
      );
      assert.equal(result.error?.code, "40001");
      assert.equal((await read(id)).estado, "cancelado");
      assert.equal(await activePeople(id), 0);
      assert.equal(await activeTool(id), 0);
    },
  );
  await recorded(
    "reschedule wins against stale cancel and keeps the new canonical reservation",
    async () => {
      const input = eventInput("Reschedule versus cancel", personA, instant(14), instant(15), {
          ferramentas: [{ ferramenta_id: tool, pessoa_id: personA }],
        }),
        id = await draft(input);
      await command("publicar", { evento_id: id, expected_version: 1 });
      const result = await orderedRace(
        (tx) =>
          execute(tx, "salvar_evento", {
            evento_id: id,
            expected_version: 2,
            evento: { ...input, inicio: instant(15), fim: instant(16) },
          }),
        (tx) =>
          execute(tx, "cancelar", {
            evento_id: id,
            expected_version: 2,
            motivo: "Must not cancel a newer plan",
          }),
      );
      assert.equal(result.error?.code, "40001");
      const e = await read(id);
      assert.equal(e.estado, "publicado");
      assert.equal(e.version, 3);
      assert.equal(Date.parse(e.inicio), Date.parse(instant(15)));
      assert.equal(await activePeople(id), 1);
      assert.equal(await activeTool(id), 1);
      const r = (
        await observer`select inicio,fim from public.agenda_reservas_pessoas where evento_id=${id}::uuid and ativa`
      )[0];
      assert.equal(Date.parse(r.inicio), Date.parse(instant(15)));
      assert.equal(Date.parse(r.fim), Date.parse(instant(16)));
    },
  );
  async function qualified(title, hour) {
    const qualificationDates = (
      await observer`select (current_date-30)::text as conclusao,(current_date+365)::text as validade`
    )[0];
    const competence = (
      await canonical("salvar_competencia", [
        org,
        randomUUID(),
        JSON.stringify({ nome: title, exige_evidencia: false, exige_validade: true }),
      ])
    ).id;
    const qualification = (
      await canonical("salvar_qualificacao", [
        org,
        randomUUID(),
        JSON.stringify({
          pessoa_id: personA,
          competencia_id: competence,
          emissor: "Isolated reviewer",
          conclusao: qualificationDates.conclusao,
          validade: qualificationDates.validade,
        }),
      ])
    ).id;
    await canonical("transicionar_qualificacao", [
      org,
      randomUUID(),
      qualification,
      1,
      "em_conferencia",
    ]);
    await canonical("transicionar_qualificacao", [org, randomUUID(), qualification, 2, "validada"]);
    const id = await draft(
      eventInput(title, personA, instant(hour), instant(hour + 1), { competencias: [competence] }),
    );
    return { id, qualification };
  }
  await recorded(
    "qualification revoked before publication commit blocks the waiting publication atomically",
    async () => {
      const { id, qualification } = await qualified("Qualification publication race", 17);
      const result = await orderedRace(
        async (tx) =>
          (
            await tx`select public.transicionar_qualificacao(${org}::uuid,${randomUUID()}::uuid,${qualification}::uuid,3,'revogada','Revoked by issuer during real race') as value`
          )[0].value,
        (tx) => execute(tx, "publicar", { evento_id: id, expected_version: 1 }),
      );
      assert.equal(result.error?.code, "23514");
      assert.match(result.error.message, /qualifica|compet[eê]ncia|habilit/i);
      assert.equal((await read(id)).estado, "rascunho");
      assert.equal((await read(id)).version, 1);
      assert.equal(await activePeople(id), 0);
    },
  );
  await recorded(
    "qualification revoked before start commit blocks start and preserves the published plan",
    async () => {
      const { id, qualification } = await qualified("Qualification initiation race", 19);
      await command("publicar", { evento_id: id, expected_version: 1 });
      const result = await orderedRace(
        async (tx) =>
          (
            await tx`select public.transicionar_qualificacao(${org}::uuid,${randomUUID()}::uuid,${qualification}::uuid,3,'revogada','Revoked after publication before start') as value`
          )[0].value,
        (tx) => execute(tx, "iniciar", { evento_id: id, expected_version: 2 }),
      );
      assert.equal(result.error?.code, "23514");
      assert.match(result.error.message, /qualifica|compet[eê]ncia|habilit/i);
      assert.equal((await read(id)).estado, "publicado");
      assert.equal((await read(id)).version, 2);
      assert.equal(await activePeople(id), 1);
    },
  );
  await recorded(
    "withdrawn tool blocks cancel and reschedule; completing the event never fabricates physical return",
    async () => {
      const window = (
        await observer`select to_char((clock_timestamp()-interval '5 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as inicio,to_char((clock_timestamp()+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as fim,to_char((clock_timestamp()+interval '3 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as shifted_start,to_char((clock_timestamp()+interval '4 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as shifted_end`
      )[0];
      const input = eventInput(
          "Physical tool custody is independent of event conclusion",
          personA,
          window.inicio,
          window.fim,
          { ferramentas: [{ ferramenta_id: tool, pessoa_id: personA }] },
        ),
        id = await draft(input);
      await command("publicar", { evento_id: id, expected_version: 1 });
      const custody = (
        await observer`select id,version from public.ferramenta_custodias where agenda_evento_id=${id}::uuid and estado='reservada'`
      )[0];
      assert.ok(custody);
      await canonical(
        "alm_executar",
        [
          org,
          randomUUID(),
          "retirar_ferramenta",
          JSON.stringify({ custodia_id: custody.id, expected_version: custody.version }),
        ],
        fieldA,
      );
      const cancelled = await errorResult(
        command("cancelar", {
          evento_id: id,
          expected_version: 2,
          motivo: "Cannot cancel withdrawn physical custody",
        }),
      );
      assert.equal(cancelled.error?.code, "23514");
      assert.equal((await read(id)).version, 2);
      const moved = await errorResult(
        command("salvar_evento", {
          evento_id: id,
          expected_version: 2,
          evento: { ...input, inicio: window.shifted_start, fim: window.shifted_end },
        }),
      );
      assert.equal(moved.error?.code, "23514");
      assert.equal((await read(id)).version, 2);
      await command("iniciar", { evento_id: id, expected_version: 2 });
      await command("concluir", { evento_id: id, expected_version: 3 });
      assert.equal((await read(id)).estado, "concluido");
      const held = (
        await observer`select estado,version,devolvida_em from public.ferramenta_custodias where id=${custody.id}::uuid`
      )[0];
      assert.equal(held.estado, "retirada");
      assert.equal(held.devolvida_em, null);
      await canonical(
        "alm_executar",
        [
          org,
          randomUUID(),
          "devolver_ferramenta",
          JSON.stringify({
            custodia_id: custody.id,
            expected_version: held.version,
            condicao: "disponivel",
            motivo: "Physical return explicitly confirmed in isolated test",
          }),
        ],
        fieldA,
      );
      assert.equal(
        (
          await observer`select estado from public.ferramenta_custodias where id=${custody.id}::uuid`
        )[0].estado,
        "devolvida",
      );
      assert.equal((await read(id)).estado, "concluido");
    },
  );

  await recorded(
    "unavailability wins against waiting publication for the same person and interval",
    async () => {
      const nextDay = (await observer`select (current_date+21)::text as d`)[0].d,
        start = instant(8, nextDay),
        end = instant(9, nextDay),
        id = await draft(eventInput("Unavailable person publication race", personB, start, end));
      const result = await orderedRace(
        async (tx) =>
          (
            await tx`select public.registrar_indisponibilidade(${org}::uuid,${randomUUID()}::uuid,${personB}::uuid,${start}::timestamptz,${end}::timestamptz,'Operational unavailability wins planning race') as value`
          )[0].value,
        (tx) => execute(tx, "publicar", { evento_id: id, expected_version: 1 }),
      );
      assert.ok(["23P01", "23514"].includes(result.error?.code));
      assert.match(result.error.message, /indispon|conflito|reserva/i);
      assert.equal((await read(id)).estado, "rascunho");
      assert.equal((await read(id)).version, 1);
      assert.equal(await activePeople(id), 0);
      assert.equal(
        Number(
          (
            await observer`select count(*) as n from public.indisponibilidades where organization_id=${org}::uuid and pessoa_id=${personB}::uuid and inicio=${start}::timestamptz and fim=${end}::timestamptz and cancelada_em is null`
          )[0].n,
        ),
        1,
      );
    },
  );
  await recorded(
    "publication wins against waiting unavailability and leaves exactly one confirmed person reservation",
    async () => {
      const nextDay = (await observer`select (current_date+21)::text as d`)[0].d,
        start = instant(10, nextDay),
        end = instant(11, nextDay),
        id = await draft(eventInput("Publication wins unavailability race", personB, start, end));
      const result = await orderedRace(
        (tx) => execute(tx, "publicar", { evento_id: id, expected_version: 1 }),
        async (tx) =>
          (
            await tx`select public.registrar_indisponibilidade(${org}::uuid,${randomUUID()}::uuid,${personB}::uuid,${start}::timestamptz,${end}::timestamptz,'Unavailability must not overwrite confirmed planning') as value`
          )[0].value,
      );
      assert.ok(["23P01", "23514"].includes(result.error?.code));
      assert.match(result.error.message, /compromisso|conflito|reserva/i);
      assert.equal((await read(id)).estado, "publicado");
      assert.equal(await activePeople(id), 1);
      assert.equal(
        Number(
          (
            await observer`select count(*) as n from public.indisponibilidades where organization_id=${org}::uuid and pessoa_id=${personB}::uuid and inicio=${start}::timestamptz and fim=${end}::timestamptz`
          )[0].n,
        ),
        0,
      );
    },
  );

  console.log(JSON.stringify({ database: settings.database, checks: report.checks.length }));
} catch (e) {
  report.failure = { message: e.message, code: e.code };
  throw e;
} finally {
  if (process.env.PGTEST_EVIDENCE_DIR) {
    await mkdir(process.env.PGTEST_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      resolve(process.env.PGTEST_EVIDENCE_DIR, "agenda-concurrency-results.json"),
      JSON.stringify(report, null, 2),
    );
  }
  await Promise.all([observer.end({ timeout: 2 }), a.end({ timeout: 2 }), b.end({ timeout: 2 })]);
}
