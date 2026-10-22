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
const db = postgres({
  host: "127.0.0.1",
  port: testPort,
  user: "postgres",
  database: testDatabase,
  max: 1,
  prepare: false,
  idle_timeout: 0,
  onnotice: () => {},
});
const report = {
  database: testDatabase,
  host: "127.0.0.1",
  port: testPort,
  captured_at: new Date().toISOString(),
  method:
    "Public canonical recurrence commands and direct read-only PostgreSQL snapshots in a random disposable organization. No fake clock, remote write or copied recurrence algorithm.",
  checks: [],
};
const org = randomUUID(),
  actor = randomUUID(),
  field = randomUUID();
let person;
const result = (work) =>
  work.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
async function authorized(work) {
  return db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    return work(tx);
  });
}
async function cmd(command, data) {
  return authorized(
    async (tx) =>
      (
        await tx`select public.ag_executar(${org}::uuid,${randomUUID()}::uuid,${command},${tx.json(data)}) as value`
      )[0].value,
  );
}
const instant = (date, hour) => date + "T" + String(hour).padStart(2, "0") + ":00:00-03:00";
const input = (title, date, hour) => ({
  titulo: title,
  descricao: "",
  tipo: "visita_tecnica",
  inicio: instant(date, hour),
  fim: instant(date, hour + 1),
  timezone: "America/Sao_Paulo",
  dia_inteiro: false,
  local: "",
  responsavel_id: person,
  participantes: [],
  competencias: [],
  bloqueia_recursos: true,
});
const rule = {
  frequencia: "diaria",
  intervalo: 1,
  dias_semana: [],
  dia_mes: null,
  termina_em: null,
  quantidade: 10,
  politica_mes: "pular",
  hora_ambigua: "posterior",
  hora_inexistente: "pular",
};
async function day(offset) {
  return (
    await db`select ((clock_timestamp() at time zone 'America/Sao_Paulo')::date+${offset}::integer)::text as d`
  )[0].d;
}
async function event(id) {
  return (
    await db`select to_jsonb(e) as value from public.agenda_eventos e where id=${id}::uuid`
  )[0].value;
}
async function series(id) {
  return (await db`select to_jsonb(s) as value from public.agenda_series s where id=${id}::uuid`)[0]
    .value;
}
async function occurrence(serie, date) {
  const rows =
    await db`select to_jsonb(e) as value from public.agenda_eventos e where serie_id=${serie}::uuid and ocorrencia_data=${date}::date and estado<>'cancelado' order by created_at`;
  assert.equal(rows.length, 1, "one live occurrence per civil date");
  return rows[0].value;
}
async function snapshot(serie) {
  return JSON.stringify({
    series: await series(serie),
    versions:
      await db`select to_jsonb(v) as row from public.agenda_serie_versoes v where serie_id=${serie}::uuid order by id`,
    events:
      await db`select to_jsonb(e) as row from public.agenda_eventos e where serie_id=${serie}::uuid order by id`,
    reservations:
      await db`select to_jsonb(r) as row from public.agenda_reservas_pessoas r join public.agenda_eventos e on e.id=r.evento_id where e.serie_id=${serie}::uuid order by r.id`,
  });
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
async function createSeries(title, hour) {
  const date = await day(-3),
    r = await cmd("salvar_evento", { evento: input(title, date, hour) }),
    id = r.evento_id || r.id;
  await cmd("publicar", { evento_id: id, expected_version: 1 });
  const created = await cmd("criar_serie", { evento_id: id, expected_version: 2, regra: rule });
  return { anchor: id, id: created.id || created.detalhe?.serie?.id };
}
try {
  const guard = (
    await db`select current_database() as database,host(inet_server_addr()) as host,to_regprocedure('public.ag_executar(uuid,uuid,text,jsonb)')::text as api`
  )[0];
  assert.equal(guard.database, testDatabase);
  assert.equal(guard.host, "127.0.0.1");
  assert.ok(guard.api);
  await db`insert into auth.users(id,email) values(${actor}::uuid,${"series-admin-" + actor + "@example.invalid"}),(${field}::uuid,${"series-field-" + field + "@example.invalid"})`;
  await db`insert into public.organizations(id,nome) values(${org}::uuid,'Series exception isolated organization')`;
  for (const [id, role] of [
    [actor, "admin"],
    [field, "campo"],
  ]) {
    await db`insert into public.memberships(organization_id,user_id) values(${org}::uuid,${id}::uuid)`;
    await db`insert into public.user_roles(organization_id,user_id,role) values(${org}::uuid,${id}::uuid,${role})`;
  }
  person = await authorized(
    async (tx) =>
      (
        await tx`select public.salvar_pessoa(${org}::uuid,${randomUUID()}::uuid,${tx.json({ nome: "Series person", vinculo: "colaborador", user_id: field })}) as value`
      )[0].value.id,
  );
  await check(
    "editing all future occurrences preserves a completed past visit and an individual future exception exactly",
    async () => {
      const s = await createSeries("Daily original series", 8);
      let anchor = await event(s.anchor);
      await cmd("iniciar", { evento_id: anchor.id, expected_version: anchor.version });
      anchor = await event(anchor.id);
      await cmd("concluir", { evento_id: anchor.id, expected_version: anchor.version });
      const completed = await event(anchor.id);
      assert.equal(completed.estado, "concluido");
      const exceptionDate = await day(2),
        exception = await occurrence(s.id, exceptionDate);
      await cmd("salvar_evento", {
        evento_id: exception.id,
        expected_version: exception.version,
        evento: input("Only this occurrence exception", exceptionDate, 9),
      });
      const frozenException = await event(exception.id);
      assert.equal(frozenException.excecao, true);
      const current = await series(s.id);
      await cmd("editar_serie", {
        serie_id: s.id,
        expected_version: current.version,
        escopo: "todas_futuras",
        evento: input("Updated future series", await day(0), 10),
        regra: rule,
        motivo: "Update future plan and preserve prior execution",
      });
      assert.deepEqual(await event(completed.id), completed);
      assert.deepEqual(await event(frozenException.id), frozenException);
      const future = await occurrence(s.id, await day(3));
      assert.equal(future.titulo, "Updated future series");
      assert.equal(
        (
          await db`select extract(hour from ${future.inicio}::timestamptz at time zone 'America/Sao_Paulo')::integer as hour`
        )[0].hour,
        10,
      );
      const updated = await series(s.id);
      await cmd("cancelar_serie", {
        serie_id: s.id,
        expected_version: updated.version,
        escopo: "todas_futuras",
        motivo: "Cancel future plan without altering completed history",
      });
      assert.deepEqual(await event(completed.id), completed);
    },
  );
  await check(
    "this and future scope preserves earlier future occurrences and versions",
    async () => {
      const s = await createSeries("Scoped daily original", 12),
        cutDate = await day(3),
        cut = await occurrence(s.id, cutDate),
        before = await occurrence(s.id, await day(1));
      const current = await series(s.id);
      await cmd("editar_serie", {
        serie_id: s.id,
        expected_version: current.version,
        escopo: "esta_e_futuras",
        evento_id: cut.id,
        evento: input("Scoped future replacement", cutDate, 13),
        regra: rule,
        motivo: "Change from this occurrence onward only",
      });
      assert.deepEqual(await event(before.id), before);
      const next = await occurrence(s.id, cutDate);
      assert.equal(next.titulo, "Scoped future replacement");
      assert.equal((await occurrence(s.id, await day(4))).titulo, "Scoped future replacement");
    },
  );
  await check(
    "one conflicting future reservation rolls back the whole series revision and all prior reservations",
    async () => {
      const s = await createSeries("Atomic series edit original", 15),
        blockDate = await day(3);
      const blocked = await cmd("salvar_evento", {
        evento: input("Independent real conflict", blockDate, 17),
      });
      await cmd("publicar", { evento_id: blocked.evento_id || blocked.id, expected_version: 1 });
      const before = await snapshot(s.id),
        current = await series(s.id);
      const attempt = await result(
        cmd("editar_serie", {
          serie_id: s.id,
          expected_version: current.version,
          escopo: "todas_futuras",
          evento: input("Must roll back entire revision", await day(0), 17),
          regra: rule,
          motivo: "Conflict test must preserve all prior series content",
        }),
      );
      assert.ok(["23P01", "23514"].includes(attempt.error?.code));
      assert.match(attempt.error.message, /reserva|conflito|recorr|ocorr|dispon/i);
      assert.equal(await snapshot(s.id), before);
    },
  );
  console.log(JSON.stringify({ checks: report.checks.length }));
} catch (e) {
  report.failure = { message: e.message, code: e.code };
  throw e;
} finally {
  if (process.env.PGTEST_EVIDENCE_DIR) {
    await mkdir(process.env.PGTEST_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      resolve(process.env.PGTEST_EVIDENCE_DIR, "agenda-series-results.json"),
      JSON.stringify(report, null, 2),
    );
  }
  await db.end({ timeout: 2 });
}
