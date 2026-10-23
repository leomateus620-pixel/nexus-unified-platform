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
    "Private SQL recurrence expansion across explicit calendar windows plus public canonical save/list commands in a random disposable organization. No copied JS recurrence algorithm or connected-backend proof.",
  checks: [],
};
const base = (inicio, fim, timezone = "America/Sao_Paulo", extra = {}) => ({
  titulo: "Temporal isolated occurrence",
  descricao: "",
  tipo: "visita_tecnica",
  inicio,
  fim,
  timezone,
  dia_inteiro: false,
  local: "",
  responsavel_id: "f8470000-0000-4000-8000-000000000001",
  participantes: [],
  competencias: [],
  bloqueia_recursos: true,
  ...extra,
});
const rule = (frequencia, quantidade, extra = {}) => ({
  frequencia,
  intervalo: 1,
  dias_semana: [],
  dia_mes: null,
  termina_em: null,
  quantidade,
  politica_mes: "pular",
  hora_ambigua: "posterior",
  hora_inexistente: "pular",
  ...extra,
});
async function expand(event, r, de, ate) {
  return db`select data::text as data,ordinal,to_char(inicio at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as inicio,to_char(fim at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as fim,ignorada from public.ag_expandir_datas(${db.json(event)},${db.json(r)},${de}::date,${ate}::date) order by data,ordinal`;
}
async function check(name, work) {
  await work();
  report.checks.push({ name, pass: true });
  console.log("PASS: " + name);
}
const dates = (rows) => rows.filter((x) => !x.ignorada).map((x) => x.data);
try {
  const guard = (
    await db`select current_database() as database,host(inet_server_addr()) as host,to_regprocedure('public.ag_expandir_datas(jsonb,jsonb,date,date)')::text as helper,to_regprocedure('public.ag_executar(uuid,uuid,text,jsonb)')::text as api`
  )[0];
  assert.equal(guard.database, testDatabase);
  assert.equal(guard.host, "127.0.0.1");
  assert.ok(guard.helper, "Private expansion helper must be installed before this test");
  assert.ok(guard.api, "Canonical command API must be installed before this test");

  await check(
    "monthly day31 skips February rather than moving it to February28; ordinal includes earlier windows",
    async () => {
      const event = base("2027-01-31T09:00:00-03:00", "2027-01-31T10:00:00-03:00"),
        r = rule("mensal", 3, { dia_mes: 31 });
      assert.deepEqual(dates(await expand(event, r, "2027-02-01", "2027-02-28")), []);
      const march = await expand(event, r, "2027-03-01", "2027-03-31");
      assert.deepEqual(dates(march), ["2027-03-31"]);
      assert.equal(march[0].ordinal, 2);
      const may = await expand(event, r, "2027-05-01", "2027-05-31");
      assert.deepEqual(dates(may), ["2027-05-31"]);
      assert.equal(may[0].ordinal, 3);
      assert.deepEqual(dates(await expand(event, r, "2027-07-01", "2027-07-31")), []);
    },
  );
  await check("monthly leap day29 is present in2028 and absent in non-leap2027", async () => {
    const r = rule("mensal", 3, { dia_mes: 29 });
    assert.deepEqual(
      dates(
        await expand(
          base("2028-01-29T09:00:00-03:00", "2028-01-29T10:00:00-03:00"),
          r,
          "2028-02-01",
          "2028-02-29",
        ),
      ),
      ["2028-02-29"],
    );
    assert.deepEqual(
      dates(
        await expand(
          base("2027-01-29T09:00:00-03:00", "2027-01-29T10:00:00-03:00"),
          r,
          "2027-02-01",
          "2027-02-28",
        ),
      ),
      [],
    );
  });
  await check(
    "daily recurrence crosses leap February28→29→March1 without duplicate or missing date",
    async () => {
      const rows = await expand(
        base("2028-02-28T09:00:00-03:00", "2028-02-28T10:00:00-03:00"),
        rule("diaria", 3),
        "2028-02-27",
        "2028-03-02",
      );
      assert.deepEqual(dates(rows), ["2028-02-28", "2028-02-29", "2028-03-01"]);
      assert.deepEqual(
        rows.map((x) => x.ordinal),
        [1, 2, 3],
      );
    },
  );
  await check("weekly ISO weekdays and interval retain calendar alignment", async () => {
    const rows = await expand(
      base("2026-10-26T09:00:00-03:00", "2026-10-26T10:00:00-03:00"),
      rule("semanal", 4, { dias_semana: [1, 3] }),
      "2026-10-25",
      "2026-11-05",
    );
    assert.deepEqual(dates(rows), ["2026-10-26", "2026-10-28", "2026-11-02", "2026-11-04"]);
    const everyTwo = await expand(
      base("2026-10-26T09:00:00-03:00", "2026-10-26T10:00:00-03:00"),
      rule("semanal", 3, { intervalo: 2, dias_semana: [1] }),
      "2026-10-25",
      "2026-11-25",
    );
    assert.deepEqual(dates(everyTwo), ["2026-10-26", "2026-11-09", "2026-11-23"]);
  });
  await check(
    "NewYork missing02:30 is an observable ignored occurrence and later civil hours do not drift",
    async () => {
      const rows = await expand(
        base("2027-03-13T02:30:00-05:00", "2027-03-13T03:00:00-05:00", "America/New_York"),
        rule("diaria", 3),
        "2027-03-12",
        "2027-03-16",
      );
      const gap = rows.find((x) => x.data === "2027-03-14");
      assert.equal(gap?.ignorada, true);
      assert.deepEqual(dates(rows), ["2027-03-13", "2027-03-15"]);
      assert.equal(rows.find((x) => x.data === "2027-03-15").inicio, "2027-03-15T06:30:00Z");
    },
  );
  await check("NewYork ambiguous01:30 selects posterior06:30Z exactly once", async () => {
    const rows = await expand(
      base("2026-10-31T01:30:00-04:00", "2026-10-31T02:30:00-04:00", "America/New_York"),
      rule("diaria", 3),
      "2026-10-30",
      "2026-11-03",
    );
    const fold = rows.filter((x) => x.data === "2026-11-01");
    assert.equal(fold.length, 1);
    assert.equal(fold[0].ignorada, false);
    assert.equal(fold[0].inicio, "2026-11-01T06:30:00Z");
    assert.equal(fold[0].fim, "2026-11-01T07:30:00Z");
  });
  await check(
    "LordHowe half-hour DST gap is handled without assuming every transition is one hour",
    async () => {
      const rows = await expand(
        base("2026-10-03T02:15:00+10:30", "2026-10-03T02:45:00+10:30", "Australia/Lord_Howe"),
        rule("diaria", 3),
        "2026-10-02",
        "2026-10-06",
      );
      assert.equal(rows.find((x) => x.data === "2026-10-04")?.ignorada, true);
      assert.deepEqual(dates(rows), ["2026-10-03", "2026-10-05"]);
      assert.equal(rows.find((x) => x.data === "2026-10-05").inicio, "2026-10-04T15:15:00Z");
    },
  );
  await check("quarter-hour IANA offset preserves an overnight civil duration", async () => {
    const rows = await expand(
      base("2026-11-01T23:45:00+05:45", "2026-11-02T00:15:00+05:45", "Asia/Kathmandu"),
      rule("diaria", 2),
      "2026-10-31",
      "2026-11-03",
    );
    assert.deepEqual(dates(rows), ["2026-11-01", "2026-11-02"]);
    assert.equal(rows[0].inicio, "2026-11-01T18:00:00Z");
    assert.equal(rows[0].fim, "2026-11-01T18:30:00Z");
    assert.equal(rows[1].fim, "2026-11-02T18:30:00Z");
  });
  await check("whole-day recurrence preserves civil dates across a25-hour DST day", async () => {
    const rows = await expand(
      base("2026-10-31T00:00:00-04:00", "2026-11-01T00:00:00-04:00", "America/New_York", {
        dia_inteiro: true,
        data_inicio: "2026-10-31",
        data_fim: "2026-11-01",
      }),
      rule("diaria", 3),
      "2026-10-30",
      "2026-11-03",
    );
    const fold = rows.find((x) => x.data === "2026-11-01");
    assert.equal(fold.inicio, "2026-11-01T04:00:00Z");
    assert.equal(fold.fim, "2026-11-02T05:00:00Z");
    assert.equal(Date.parse(fold.fim) - Date.parse(fold.inicio), 25 * 60 * 60 * 1000);
  });
  if (guard.api) {
    // Public-list cases use canonical writes only in their own organization.
    const org = randomUUID(),
      actor = randomUUID(),
      field = randomUUID();
    await db`insert into auth.users(id,email) values(${actor}::uuid,${"temporal-admin-" + actor + "@example.invalid"}),(${field}::uuid,${"temporal-person-" + field + "@example.invalid"})`;
    await db`insert into public.organizations(id,nome) values(${org}::uuid,'Temporal isolated organization')`;
    for (const [id, role] of [
      [actor, "admin"],
      [field, "campo"],
    ]) {
      await db`insert into public.memberships(organization_id,user_id) values(${org}::uuid,${id}::uuid)`;
      await db`insert into public.user_roles(organization_id,user_id,role) values(${org}::uuid,${id}::uuid,${role})`;
    }
    async function authorized(work, timeZone = "UTC") {
      return db.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
        await tx`select set_config('TimeZone',${timeZone},true)`;
        return work(tx);
      });
    }
    const person = await authorized(
      async (tx) =>
        (
          await tx`select public.salvar_pessoa(${org}::uuid,${randomUUID()}::uuid,${tx.json({ nome: "Temporal person", vinculo: "colaborador", user_id: field })}) as value`
        )[0].value.id,
    );
    async function save(event) {
      return authorized(async (tx) => {
        const r = (
          await tx`select public.ag_executar(${org}::uuid,${randomUUID()}::uuid,'salvar_evento',${tx.json({ evento: { ...event, responsavel_id: person } })}) as value`
        )[0].value;
        return r.evento_id || r.id;
      });
    }
    async function list(de, ate, zone, sessionZone = "UTC") {
      return authorized(
        async (tx) =>
          (
            await tx`select public.ag_listar(${org}::uuid,${de}::date,${ate}::date,${zone},false,'',null,null,null,0,100) as value`
          )[0].value,
        sessionZone,
      );
    }
    await check(
      "an event ending exactly at midnight does not occupy the next civil day",
      async () => {
        const id = await save(base("2026-11-02T23:30:00-03:00", "2026-11-03T00:00:00-03:00"));
        const rows = await list("2026-11-02", "2026-11-04", "America/Sao_Paulo");
        assert.deepEqual(rows.registros.find((x) => x.id === id).dias_visiveis, ["2026-11-02"]);
        assert.equal(
          (await list("2026-11-03", "2026-11-04", "America/Sao_Paulo")).registros.some(
            (x) => x.id === id,
          ),
          false,
        );
      },
    );
    await check(
      "overnight events occupy both local days and explicit timezone is independent of sessionTimeZone",
      async () => {
        const id = await save(base("2026-11-02T23:30:00-03:00", "2026-11-03T00:30:00-03:00"));
        const utc = await list("2026-11-02", "2026-11-04", "America/Sao_Paulo", "UTC"),
          kir = await list("2026-11-02", "2026-11-04", "America/Sao_Paulo", "Pacific/Kiritimati");
        assert.deepEqual(utc.registros.find((x) => x.id === id).dias_visiveis, [
          "2026-11-02",
          "2026-11-03",
        ]);
        assert.deepEqual(
          kir.registros.find((x) => x.id === id).dias_visiveis,
          utc.registros.find((x) => x.id === id).dias_visiveis,
        );
      },
    );
    await check(
      "whole-day dates stay civil when the calendar is viewed in a distant IANA timezone",
      async () => {
        const id = await save(
          base("2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00", "America/New_York", {
            dia_inteiro: true,
            data_inicio: "2026-11-01",
            data_fim: "2026-11-02",
          }),
        );
        for (const zone of ["America/New_York", "Pacific/Kiritimati", "America/Adak"])
          assert.deepEqual(
            (await list("2026-10-31", "2026-11-03", zone)).registros.find((x) => x.id === id)
              .dias_visiveis,
            ["2026-11-01"],
          );
      },
    );
  } else {
    report.pending = [
      "Public list midnight exclusive boundary",
      "Public list overnight/session timezone",
      "Public list whole-day civil dates",
    ];
  }
  console.log(JSON.stringify({ checks: report.checks.length, pending: report.pending ?? [] }));
} catch (e) {
  report.failure = { message: e.message, code: e.code };
  throw e;
} finally {
  if (process.env.PGTEST_EVIDENCE_DIR) {
    await mkdir(process.env.PGTEST_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      resolve(process.env.PGTEST_EVIDENCE_DIR, "agenda-temporal-results.json"),
      JSON.stringify(report, null, 2),
    );
  }
  await db.end({ timeout: 2 });
}
