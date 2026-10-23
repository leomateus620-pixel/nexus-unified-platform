import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
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
const evidence = async (name, value) => {
  if (process.env.PGTEST_EVIDENCE_DIR) {
    const { mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(process.env.PGTEST_EVIDENCE_DIR, { recursive: true });
    await writeFile(join(process.env.PGTEST_EVIDENCE_DIR, name), JSON.stringify(value, null, 2));
  }
};
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
const results = [],
  dtos = {};
let pass = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  results.push({ label, result: "passed" });
  pass++;
  console.log(`PASS ${pass}: ${label}`);
};
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
    const key = randomUUID();
    const draft = await exec("salvar_evento", { evento: base }, key);
    const id = draft.evento_id;
    check(
      !!id && draft.detalhe.evento.estado === "rascunho",
      "draft persists with canonical people",
    );
    const same = await exec("salvar_evento", { evento: base }, key);
    check(same.evento_id === id, "retry does not duplicate event");
    await reject(
      () => exec("salvar_evento", { evento: { ...base, titulo: "Different" } }, key),
      "23505",
      "same key different payload conflicts",
    );
    check(
      draft.detalhe.participantes.length === 2 &&
        draft.detalhe.participantes.some((p) => p.funcao === "responsavel"),
      "principal automatically participates",
    );
    const pub = await exec("publicar", {
      evento_id: id,
      expected_version: draft.detalhe.evento.version,
    });
    check(
      pub.detalhe.evento.estado === "publicado" &&
        pub.detalhe.ferramentas[0].estado === "reservada",
      "publication reserves canonical tool",
    );
    const reserved = (
      await tx`select count(*)::int n from public.agenda_reservas_pessoas where evento_id=${id} and ativa`
    )[0].n;
    check(reserved === 2, "publication reserves exactly two people");
    await reject(
      () => exec("salvar_evento", { evento_id: id, expected_version: 1, evento: base }),
      "40001",
      "stale version cannot overwrite plan",
    );
    const changed = await exec("salvar_evento", {
      evento_id: id,
      expected_version: pub.detalhe.evento.version,
      evento: { ...base, inicio_local: "2026-11-10T12:00", fim_local: "2026-11-10T13:00" },
    });
    check(
      changed.detalhe.ferramentas[0].custodia_id !== pub.detalhe.ferramentas[0].custodia_id,
      "reschedule replaces reservation atomically",
    );
    check(
      (
        await tx`select count(*)::int n from public.ferramenta_custodias where agenda_evento_id=${id}`
      )[0].n === 2,
      "prior canonical custody is retained",
    );
    await auth(field);
    const mine = await rpc("ag_obter", { _org: org, _id: id });
    check(
      mine.permissoes.iniciar && !mine.permissoes.editar,
      "field principal receives exact commands",
    );
    const pp = mine.participantes.find((p) => p.pessoa_id === principal);
    await exec("confirmar", {
      participante_id: pp.id,
      expected_version: pp.version,
      confirmacao: "confirmada",
    });
    check(
      (await rpc("ag_obter", { _org: org, _id: id })).evento.estado === "publicado",
      "attendance does not complete work",
    );
    await reject(
      () =>
        exec("salvar_evento", {
          evento_id: id,
          expected_version: changed.detalhe.evento.version,
          evento: base,
        }),
      "42501",
      "field cannot edit plan",
    );
    await exec("comentar", { evento_id: id, texto: "Comentário de teste isolado" });
    check(
      (await rpc("ag_historico", { _org: org, _id: id, _tipo: "comentarios" })).total === 1,
      "comment persists with canonical event",
    );
    await auth(noRole);
    await reject(() => rpc("ag_obter", { _org: org, _id: id }), "42501", "roleless member denied");
    await auth(outside);
    await reject(
      () => rpc("ag_obter", { _org: org, _id: id }),
      "42501",
      "cross tenant read denied",
    );
    await auth(admin);
    const action = await exec("criar_acao", {
      acao: {
        titulo: "Ação canônica teste",
        descricao: "Sem evento fictício",
        responsavel_id: principal,
        prazo: "2026-11-20",
        prioridade: "normal",
        exige_verificacao: true,
      },
    });
    check(action.acao_id && !action.evento_id, "action without time has no fake event");
    const pending = await rpc("ag_pendentes", { _org: org, _minhas: false });
    check(
      pending.registros.some((a) => a.id === action.acao_id),
      "canonical action appears unscheduled",
    );
    const linked = await exec("salvar_evento", {
      evento: {
        ...base,
        titulo: "Visita da ação",
        ferramentas: [],
        acao_id: action.acao_id,
        inicio_local: "2026-11-11T10:00",
        fim_local: "2026-11-11T11:00",
      },
    });
    const linkedid = linked.evento_id;
    const lp = await exec("publicar", { evento_id: linkedid, expected_version: 1 });
    const ls = await exec("iniciar", {
      evento_id: linkedid,
      expected_version: lp.detalhe.evento.version,
    });
    await exec("concluir", { evento_id: linkedid, expected_version: ls.detalhe.evento.version });
    check(
      (await rpc("ag_obter_acao", { _org: org, _id: action.acao_id })).acao.estado === "aberta",
      "calendar completion never completes action",
    );
    await auth(second === principal ? field : other);
    await reject(
      () => rpc("ag_obter", { _org: org, _id: linkedid }),
      "42501",
      "source ACL intersects invitation (other participant)",
    );
    await auth(admin);
    const cancel = await exec("cancelar", {
      evento_id: id,
      expected_version: changed.detalhe.evento.version,
      motivo: "Cancelar visita de teste",
    });
    check(
      cancel.detalhe.evento.estado === "cancelado" &&
        (
          await tx`select count(*)::int n from public.agenda_reservas_pessoas where evento_id=${id} and ativa`
        )[0].n === 0,
      "cancellation releases people and preserves history",
    );
    await reject(
      () =>
        exec("salvar_evento", {
          evento_id: id,
          expected_version: cancel.detalhe.evento.version,
          evento: base,
        }),
      "23514",
      "canceled event cannot be edited",
    );
    const allDay = await exec("salvar_evento", {
      evento: {
        ...base,
        titulo: "Dia civil",
        ferramentas: [],
        participantes: [],
        dia_inteiro: true,
        inicio_local: undefined,
        fim_local: undefined,
        data_inicio: "2026-11-01",
        data_fim: "2026-11-02",
        timezone: "America/New_York",
      },
    });
    check(
      new Date(allDay.detalhe.evento.fim) - new Date(allDay.detalhe.evento.inicio) ===
        25 * 3600 * 1000,
      "whole-day preserves 25-hour DST civil day",
    );
    await reject(
      () =>
        exec("salvar_evento", {
          evento: {
            ...base,
            timezone: "America/New_York",
            inicio_local: "2027-03-14T02:30",
            fim_local: "2027-03-14T03:30",
          },
        }),
      "23514",
      "nonexistent civil time rejected",
    );
    const config = await rpc("ag_configuracao", { _org: org });
    check(config.timezone === "America/Sao_Paulo", "organization timezone is canonical");
    const list = await rpc("ag_listar", {
      _org: org,
      _inicio: "2026-11-01",
      _fim: "2026-12-01",
      _timezone: "America/Sao_Paulo",
      _limite: 1,
    });
    check(
      list.registros.length === 1 && list.total >= 3 && list.dias.length === 30,
      "calendar page and complete daily counts remain distinct",
    );
    check(
      !JSON.stringify(list).includes("custo_unitario") &&
        !JSON.stringify(list).includes("custo_total"),
      "operational DTO contains no financial fields",
    );
    await reject(
      () => tx`insert into public.agenda_eventos(organization_id,titulo)values(${org},'Bypass')`,
      "42501",
      "direct event writes denied",
    );
    await reject(
      () => rpc("ag_materializar", { _org: org, _serie: randomUUID(), _ate: "2026-12-01" }),
      "42501",
      "private materializer is not authenticated RPC",
    );
    dtos.configuracao = config;
    dtos.lista = list;
    dtos.detalhe = await rpc("ag_obter", { _org: org, _id: id });
    dtos.acao = await rpc("ag_obter_acao", { _org: org, _id: action.acao_id });
    dtos.pendentes = pending;
    dtos.notificacoes = await rpc("ag_notificacoes", { _org: org });
    dtos.opcoes = await rpc("ag_opcoes", { _org: org, _tipo: "pessoas" });
    dtos.historico_revisoes = await rpc("ag_historico", { _org: org, _id: id, _tipo: "revisoes" });
    dtos.historico_comentarios = await rpc("ag_historico", {
      _org: org,
      _id: id,
      _tipo: "comentarios",
    });
    dtos.recibos = [draft, pub, changed, action, linked, cancel, allDay];
    await evidence("agenda-dto-postgres.json", dtos);
    throw Object.assign(new Error("ROLLBACK_FIXTURES"), { fixtureRollback: true });
  });
} catch (error) {
  if (!error.fixtureRollback) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await evidence("agenda-basic.json", {
    database,
    checks: results,
    passed: pass,
    allPassed: process.exitCode !== 1,
    classification:
      "PostgreSQL integration in disposable loopback cluster; not connected Auth/Storage/browser E2E",
  });
  console.log(
    JSON.stringify({ suite: "agenda-basic", passed: pass, allPassed: process.exitCode !== 1 }),
  );
  await db.end();
}
