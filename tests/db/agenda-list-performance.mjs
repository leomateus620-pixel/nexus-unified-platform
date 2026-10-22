import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const host = process.env.PGTEST_HOST || "127.0.0.1";
const port = Number(process.env.PGTEST_PORT),
  database = process.env.PGTEST_DATABASE || "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  host !== "127.0.0.1" ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  port === 5432 ||
  !/^(postgres|(?:db)?agenda47(?:_[a-z0-9_]+)?)$/.test(database)
)
  throw new Error("Explicit disposable loopback cluster required");
const db = postgres({
  host,
  port,
  user: "postgres",
  database,
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const connection = (await db`select current_database() name,host(inet_server_addr()) address`)[0];
if (connection.name !== database || connection.address !== "127.0.0.1") {
  await db.end();
  throw new Error("Unexpected test connection");
}
const org = randomUUID(),
  otherOrg = randomUUID();
const admin = randomUUID(),
  field = randomUUID(),
  other = randomUUID(),
  outside = randomUUID(),
  noRole = randomUUID();
const principal = randomUUID(),
  second = randomUUID(),
  engPerson = randomUUID(),
  client = randomUUID(),
  unit = randomUUID(),
  tool = randomUUID(),
  local = randomUUID();
const results = [];
let pass = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  results.push({ label, result: "passed" });
  pass++;
  console.log(`PASS ${pass}: ${label}`);
};
const installedDefinition = (
  await db`select pg_get_functiondef('public.ag_listar(uuid,date,date,text,boolean,text,text,text,uuid,integer,integer)'::regprocedure) definition`
)[0].definition;
const baselineSource = await readFile(
  new URL("../../drizzle/migrations/0027_agenda_equipe.sql", import.meta.url),
  "utf8",
);
const originalDefinition = baselineSource
  .replace(/\r\n/g, "\n")
  .match(/create function public\.ag_listar\([\s\S]*?\nend\$\$;/)?.[0]
  ?.replace("create function", "create or replace function");
if (!originalDefinition) {
  await db.end();
  throw new Error("Frozen migration27 ag_listar definition not found");
}
const candidateSource = await readFile(
  new URL("../../drizzle/migrations/0029_agenda_listagem_performance.sql", import.meta.url),
  "utf8",
);
const candidateDefinition = candidateSource
  .replace(/\r\n/g, "\n")
  .match(/create or replace function public\.ag_listar\([\s\S]*?\nend\$\$;/)?.[0];
const oldPredicate = "where e.organization_id=_org and public.agenda_ler_evento(_org,e.id)";
const newPredicate =
  "where e.organization_id=_org and(case when gestor and e.acao_id is null and e.levantamento_id is null then true else public.agenda_ler_evento(_org,e.id) end)";
assert.equal(
  candidateDefinition,
  originalDefinition.replace(oldPredicate, newPredicate),
  "Migration29 must change only the authorized independent-event list predicate",
);
try {
  await db.begin(async (tx) => {
    for (const id of [admin, field, other, outside, noRole])
      await tx`insert into auth.users(id,email)values(${id},${`test-${id}@invalid.test`})`;
    await tx`insert into public.organizations(id,nome)values(${org},'Agenda isolated A'),(${otherOrg},'Agenda isolated B')`;
    for (const id of [admin, field, other, noRole])
      await tx`insert into public.memberships(organization_id,user_id)values(${org},${id})`;
    await tx`insert into public.memberships(organization_id,user_id)values(${otherOrg},${outside})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},'admin'),(${org},${field},'campo'),(${org},${other},'campo'),(${otherOrg},${outside},'admin')`;
    const auth = async (id) => {
      await tx.unsafe("reset role");
      await tx`select set_config('request.jwt.claim.sub',${id},true)`;
      await tx.unsafe("set local role authenticated");
    };
    await tx`select set_config('request.jwt.claim.sub',${admin},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional)values(${principal},${org},'Pessoa principal teste','colaborador',${field},null),(${second},${org},'Outra pessoa teste','colaborador',${other},null),(${engPerson},${org},'Gestora teste','colaborador',${admin},'Registro isolado')`;
    await tx`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Cliente isolado')`;
    await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Unidade isolada')`;
    await tx`insert into public.almoxarifados(id,organization_id,nome)values(${local},${org},'Local isolado')`;
    await tx`insert into public.ferramentas(id,organization_id,patrimonio,descricao,local_id,proprietario,exige_calibracao)values(${tool},${org},'TEST-47','Ferramenta isolada',${local},'nexus',false)`;
    const rpc = async (name, args) => {
      const entries = Object.entries(args);
      const placeholders = entries.map(([k], i) => `${k} => $${i + 1}`).join(",");
      return (
        await tx.unsafe(
          `select public.${name}(${placeholders}) r`,
          entries.map(([, v]) => (typeof v === "object" && v !== null ? tx.json(v) : v)),
        )
      )[0].r;
    };
    const exec = async (command, data, key = randomUUID()) =>
      rpc("ag_executar", { _org: org, _chave: key, _comando: command, _dados: data });
    const reject = async (fn, code, label) => {
      let caught;
      try {
        await tx.savepoint(async () => fn());
      } catch (error) {
        caught = error;
      }
      check(caught?.code === code, `${label}: ${caught?.code || "accepted"}`);
    };
    await auth(admin);
    const base = {
      titulo: "Visita técnica isolada",
      descricao: "Execução de teste SQL",
      tipo: "visita_tecnica",
      inicio_local: "2026-11-10T10:00",
      fim_local: "2026-11-10T11:00",
      timezone: "America/Sao_Paulo",
      dia_inteiro: false,
      local: "Local de teste",
      responsavel_id: principal,
      acao_id: null,
      levantamento_id: null,
      origem_ocorrencia: null,
      bloqueia_recursos: true,
      participantes: [{ pessoa_id: second, funcao: "participante" }],
      competencias: [],
      equipes: [],
      ferramentas: [{ ferramenta_id: tool, pessoa_id: principal }],
      cliente_id: client,
      unidade_id: unit,
      projeto_id: null,
      visibilidade: "participantes",
    };

    const isolated = {
      ...base,
      titulo: "Independente participante",
      ferramentas: [],
      participantes: [],
    };
    const own = await exec("salvar_evento", { evento: isolated });
    await exec("salvar_evento", {
      evento: {
        ...isolated,
        titulo: "Visível à organização",
        visibilidade: "organizacao",
        inicio_local: "2026-11-11T10:00",
        fim_local: "2026-11-11T11:00",
        responsavel_id: second,
      },
    });
    const action = await exec("criar_acao", {
      acao: {
        titulo: "Ação matriz de paridade",
        descricao: "Origem protegida",
        responsavel_id: principal,
        prazo: "2026-11-25",
        prioridade: "normal",
        exige_verificacao: true,
      },
    });
    const actionEvent = await exec("salvar_evento", {
      evento: {
        ...isolated,
        titulo: "Evento da ação",
        acao_id: action.acao_id,
        inicio_local: "2026-11-12T10:00",
        fim_local: "2026-11-12T11:00",
      },
    });
    const lev = await rpc("lev_executar", {
      _org: org,
      _chave: randomUUID(),
      _comando: "criar",
      _dados: {
        cliente_id: client,
        unidade_id: unit,
        responsavel_id: principal,
        finalidade: "Origem autorizada para matriz de leitura",
      },
    });
    const levEvent = await exec("salvar_evento", {
      evento: {
        ...isolated,
        titulo: "Visita do levantamento",
        levantamento_id: lev.levantamento.id,
        inicio_local: "2026-11-13T10:00",
        fim_local: "2026-11-13T11:00",
      },
    });
    await exec("salvar_evento", {
      evento: {
        ...isolated,
        titulo: "Evento de dia inteiro",
        dia_inteiro: true,
        inicio_local: undefined,
        fim_local: undefined,
        data_inicio: "2026-11-14",
        data_fim: "2026-11-15",
        timezone: "America/New_York",
      },
    });
    await exec("salvar_evento", {
      evento: {
        ...isolated,
        titulo: "Evento noturno",
        inicio_local: "2026-11-15T23:30",
        fim_local: "2026-11-16T01:00",
      },
    });
    const keeper = randomUUID(),
      coordinator = randomUUID();
    await tx.unsafe("reset role");
    for (const id of [keeper, coordinator]) {
      await tx`insert into auth.users(id,email)values(${id},${`parity-${id}@invalid.test`})`;
      await tx`insert into public.memberships(organization_id,user_id)values(${org},${id})`;
    }
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${keeper},'admin')`;
    await tx`insert into public.user_capacidades(organization_id,user_id,capacidade,concedido_por)values(${org},${coordinator},'coordenar_operacao',${admin})`;
    const baseArgs = {
      _org: org,
      _inicio: "2026-11-01",
      _fim: "2026-12-01",
      _timezone: "America/Sao_Paulo",
      _limite: 2,
    };
    const capture = async (actor, args) => {
      await auth(actor);
      try {
        return { data: await tx.savepoint(() => rpc("ag_listar", args)) };
      } catch (error) {
        return { error: { code: error.code, message: error.message } };
      }
    };
    const parity = async (actor, extra, label) => {
      await tx.unsafe("reset role");
      await tx.unsafe(originalDefinition);
      const before = await capture(actor, { ...baseArgs, ...extra });
      await tx.unsafe("reset role");
      await tx.unsafe(candidateSource);
      const after = await capture(actor, { ...baseArgs, ...extra });
      assert.equal(JSON.stringify(after), JSON.stringify(before), label);
      check(true, label);
      await tx.unsafe("reset role");
      await tx.unsafe(originalDefinition);
      return before;
    };
    for (const [actor, label] of [
      [admin, "admin"],
      [field, "assigned field"],
      [other, "other field"],
      [noRole, "roleless member"],
      [outside, "cross-tenant admin"],
      [coordinator, "explicit coordination capability"],
    ]) {
      await parity(
        actor,
        {},
        `${label}: exact list, counts, pagination and current permissions unchanged`,
      );
    }
    await parity(admin, { _minha: true }, "manager own-agenda filter remains canonical");
    await parity(field, { _minha: true }, "field own-agenda filter remains canonical");
    await parity(admin, { _pagina: 1 }, "second page retains complete authorized daily totals");
    await parity(
      admin,
      { _busca: "levantamento" },
      "source search and title projection remain unchanged",
    );
    await parity(admin, { _tipo: "reuniao" }, "empty type filter remains an explicit zero");
    await parity(
      admin,
      { _timezone: "America/New_York" },
      "display timezone and whole-day civil dates are unchanged",
    );
    await parity(
      admin,
      { _inicio: "2026-11-15", _fim: "2026-11-17" },
      "overnight half-open window and days are unchanged",
    );
    await parity(
      outside,
      { _org: otherOrg },
      "other organization never receives the first organization records",
    );
    await tx.unsafe("reset role");
    await auth(admin);
    await rpc("salvar_acao_operacional", {
      _org: org,
      _chave: randomUUID(),
      _id: action.acao_id,
      _expected_version: 1,
      _dados: {
        titulo: "Ação matriz de paridade",
        descricao: "Origem protegida",
        responsavel_id: second,
        prazo: "2026-11-25",
        prioridade: "normal",
        exige_verificacao: true,
      },
    });
    const revokedAction = await parity(
      field,
      { _limite: 50 },
      "action reassignment revokes original participant source access identically",
    );
    check(
      !revokedAction.data.registros.some((e) => e.id === actionEvent.evento_id),
      "actual canonical action ACL filters the retained invitation after reassignment",
    );
    await auth(admin);
    await rpc("lev_executar", {
      _org: org,
      _chave: randomUUID(),
      _comando: "contexto",
      _dados: {
        levantamento_id: lev.levantamento.id,
        expected_version: lev.levantamento.version,
        responsavel_id: second,
        finalidade: "Origem reatribuída para matriz de leitura",
      },
    });
    const revokedLev = await parity(
      field,
      { _limite: 50 },
      "lev context reassignment retains current parent ACL in both implementations",
    );
    check(
      !revokedLev.data.registros.some((e) => e.id === levEvent.evento_id),
      "actual canonical levantamento ACL filters the retained invitation after reassignment",
    );
    for (const role of ["engenharia", "compras", "campo"]) {
      await tx.unsafe("reset role");
      await tx`delete from public.user_roles where organization_id=${org} and user_id=${admin}`;
      await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},${role})`;
      await parity(
        admin,
        { _limite: 50 },
        `${role}: reduced manager role is re-evaluated without cached permission`,
      );
    }
    await tx.unsafe("reset role");
    await tx`delete from public.user_roles where organization_id=${org} and user_id=${admin}`;
    const revoked = await parity(
      admin,
      {},
      "full role revocation denies list before fast-path evaluation",
    );
    check(revoked.error?.code === "42501", "revoked current access is actually denied");
    throw Object.assign(new Error("ROLLBACK_FIXTURES"), { fixtureRollback: true });
  });
} catch (error) {
  if (!error.fixtureRollback) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  const restored = (
    await db`select pg_get_functiondef('public.ag_listar(uuid,date,date,text,boolean,text,text,text,uuid,integer,integer)'::regprocedure) definition`
  )[0].definition;
  assert.equal(
    restored,
    installedDefinition,
    "ROLLBACK must restore the installed function and all fixtures",
  );
  const report = {
    database,
    host,
    port,
    checks: results,
    passed: pass,
    allPassed: process.exitCode !== 1,
    restored: true,
    baseline:
      "Frozen migration27; independently applied in each comparison even when29 is installed",
    classification:
      "Exact before/after JSON via real authenticated SQL RPCs in disposable database; not remote E2E",
  };
  if (process.env.PGTEST_EVIDENCE_DIR) {
    await mkdir(process.env.PGTEST_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      resolve(process.env.PGTEST_EVIDENCE_DIR, "agenda-list-performance.json"),
      JSON.stringify(report, null, 2),
    );
  }
  console.log(JSON.stringify(report));
  await db.end();
}
