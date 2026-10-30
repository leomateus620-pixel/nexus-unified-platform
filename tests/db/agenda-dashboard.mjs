import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const host = process.env.PGTEST_HOST || "127.0.0.1",
  port = Number(process.env.PGTEST_PORT);
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  host !== "127.0.0.1" ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port === 5432
)
  throw new Error("Explicit disposable loopback cluster required");
const db = postgres({
  host,
  port,
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const client = randomUUID(),
  client2 = randomUUID(),
  unit = randomUUID(),
  proposal = randomUUID(),
  revision = randomUUID(),
  project = randomUUID();
const org = randomUUID(),
  otherOrg = randomUUID(),
  admin = randomUUID(),
  field = randomUUID(),
  outside = randomUUID(),
  p1 = randomUUID(),
  p2 = randomUUID(),
  p3 = randomUUID(),
  observer = randomUUID(),
  zero = randomUUID();
let passed = 0;
const check = (v, label) => {
  assert.ok(v, label);
  console.log(`PASS ${++passed}: ${label}`);
};
try {
  await db.begin(async (tx) => {
    for (const id of [admin, field, outside])
      await tx`insert into auth.users(id,email)values(${id},${id + "@invalid.test"})`;
    await tx`insert into public.organizations(id,nome)values(${org},'Agenda Dashboard isolated'),(${otherOrg},'Other tenant isolated')`;
    await tx`insert into public.memberships(organization_id,user_id)values(${org},${admin}),(${org},${field}),(${otherOrg},${outside})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},'admin'),(${org},${field},'campo'),(${otherOrg},${outside},'admin')`;
    await tx`select set_config('request.jwt.claim.sub',${admin},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,vinculo,user_id)values(${p1},${org},'Principal','colaborador',${field}),(${p2},${org},'Participante','colaborador',null),(${p3},${org},'Terceira pessoa','colaborador',null),(${observer},${org},'Observadora','colaborador',null),(${zero},${org},'Sem eventos','colaborador',null)`;
    await tx`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Cliente canônico'),(${client2},${org},'Outro cliente')`;
    await tx`insert into public.unidades(id,organization_id,cliente_id,nome,endereco)values(${unit},${org},${client},'Unidade canônica','Rua de teste 100')`;
    await tx`insert into public.propostas(id,organization_id,numero,cliente_id,unidade_id)values(${proposal},${org},'PROP-DASH-TEST',${client},${unit})`;
    await tx`insert into public.proposta_revisoes(id,organization_id,proposta_id,numero)values(${revision},${org},${proposal},1)`;
    await tx`insert into public.projetos(id,organization_id,codigo,proposta_id,revisao_id,cliente_id)values(${project},${org},'PROJ-DASH-TEST',${proposal},${revision},${client})`;
    const auth = async (id) => {
      await tx.unsafe("reset role");
      await tx`select set_config('request.jwt.claim.sub',${id},true)`;
      await tx.unsafe("set local role authenticated");
    };
    const rpc = async (name, args) =>
      (
        await tx.unsafe(
          `select public.${name}(${Object.keys(args)
            .map((k, i) => `${k}=>$${i + 1}`)
            .join(",")}) result`,
          Object.values(args).map((v) => (v && typeof v === "object" ? tx.json(v) : v)),
        )
      )[0].result;
    const exec = (command, data, key = randomUUID()) =>
      rpc("ag_executar", { _org: org, _chave: key, _comando: command, _dados: data });
    const event = (start, end, patch = {}) => ({
      titulo: "Compromisso real de teste",
      descricao: "",
      tipo: "reuniao",
      inicio_local: start,
      fim_local: end,
      timezone: "America/Sao_Paulo",
      dia_inteiro: false,
      local: "",
      responsavel_id: p1,
      bloqueia_recursos: false,
      participantes: [
        { pessoa_id: p1, funcao: "responsavel" },
        { pessoa_id: p2, funcao: "participante" },
        { pessoa_id: p3, funcao: "participante" },
        { pessoa_id: observer, funcao: "observador" },
      ],
      competencias: [],
      equipes: [],
      ferramentas: [],
      cliente_id: null,
      unidade_id: null,
      projeto_id: null,
      visibilidade: "participantes",
      ...patch,
    });
    const dashboard = (from = "2026-10-01", to = "2026-11-01", filters = {}) =>
      rpc("ag_dashboard", { _org: org, _inicio: from, _fim: to, _filtros: filters });
    const list = (filters = {}, page = 0) =>
      rpc("ag_listar_v2", {
        _org: org,
        _inicio: "2026-10-01",
        _fim: "2026-11-01",
        _filtros: filters,
        _pagina: page,
        _limite: 2,
      });
    await auth(admin);
    let d = await dashboard();
    check(
      d.total === 0 &&
        d.dias.length === 31 &&
        d.dias.every((x) => x.total === 0) &&
        d.horas.length === 24,
      "empty month has real zero buckets and no invented winner",
    );
    const key = randomUUID(),
      input = event("2026-10-05T09:30", "2026-10-05T11:30");
    const a = await exec("agendar", { evento: input }, key),
      repeat = await exec("agendar", { evento: input }, key);
    check(
      a.evento_id === repeat.evento_id && a.detalhe.evento.estado === "publicado",
      "atomic create/publish retries keep one canonical event",
    );
    const b = await exec("agendar", { evento: event("2026-10-05T10:00", "2026-10-05T12:00") });
    await exec("salvar_evento", { evento: event("2026-10-05T08:00", "2026-10-05T09:00") });
    const cancelled = await exec("agendar", {
      evento: event("2026-10-05T07:00", "2026-10-05T08:00"),
    });
    await exec("cancelar", {
      evento_id: cancelled.evento_id,
      expected_version: 2,
      motivo: "Cancelado no teste",
    });
    d = await dashboard();
    check(
      d.total === 2 &&
        d.pessoas.find((p) => p.pessoa_id === p1).total === 2 &&
        d.pessoas.find((p) => p.pessoa_id === p2).total === 2 &&
        d.pessoas.find((p) => p.pessoa_id === p3).total === 2,
      "three eligible people each count an event once; responsible is not duplicated",
    );
    check(
      !d.pessoas.some((p) => p.pessoa_id === observer && p.total > 0) &&
        d.pessoas.find((p) => p.pessoa_id === zero).total === 0,
      "observers excluded and eligible people with zero remain visible",
    );
    check(
      d.horas[9].total === 1 &&
        d.horas[10].total === 2 &&
        d.horas[11].total === 2 &&
        d.horas[12].total === 0,
      "hour demand counts intersection, excluding exclusive end at 12:00",
    );
    check(
      d.semanas.find((w) => w.inicio === "2026-10-05").pessoas.find((p) => p.pessoa_id === p1)
        .minutos === 150,
      "weekly hours merge overlaps for the same person",
    );
    const before = await rpc("ag_obter", { _org: org, _id: a.evento_id });
    await tx.unsafe("reset role");
    await tx`update public.agenda_participantes set confirmacao='recusada' where organization_id=${org} and evento_id=${a.evento_id} and pessoa_id=${p3}`;
    await auth(admin);
    const edited = await exec("salvar_evento", {
      evento_id: a.evento_id,
      expected_version: before.evento.version,
      evento: { ...input, titulo: "Título editado sem alterar relações" },
    });
    check(
      edited.detalhe.participantes.some(
        (p) => p.vigente && p.pessoa_id === p3 && p.confirmacao === "recusada",
      ),
      "editing hidden fields preserves declined confirmation and observer roles",
    );
    d = await dashboard();
    check(
      d.pessoas.find((p) => p.pessoa_id === p3).total === 1,
      "declined participation does not reserve aggregate load",
    );
    await exec("agendar", { evento: event("2026-10-11T23:00", "2026-10-12T01:00") });
    d = await dashboard();
    check(
      d.dias.find((x) => x.data === "2026-10-11").total === 1 &&
        d.dias.find((x) => x.data === "2026-10-12").total === 1,
      "23h–01h event intersects both local days",
    );
    check(
      d.semanas.find((w) => w.inicio === "2026-10-05").pessoas.find((p) => p.pessoa_id === p1)
        .minutos === 210 &&
        d.semanas.find((w) => w.inicio === "2026-10-12").pessoas.find((p) => p.pessoa_id === p1)
          .minutos === 60,
      "Sunday/Monday interval is clipped at Monday local midnight",
    );
    const whole = event("2026-10-14T00:00", "2026-10-16T00:00", {
      dia_inteiro: true,
      data_inicio: "2026-10-14",
      data_fim: "2026-10-16",
    });
    delete whole.inicio_local;
    delete whole.fim_local;
    await exec("agendar", { evento: whole });
    d = await dashboard();
    check(
      d.dias.find((x) => x.data === "2026-10-14").total === 1 &&
        d.dias.find((x) => x.data === "2026-10-15").total === 1 &&
        d.dias.find((x) => x.data === "2026-10-16").total === 0,
      "all-day inclusive presentation uses exclusive persistence end",
    );
    check(
      d.semanas.find((w) => w.inicio === "2026-10-12").pessoas.find((p) => p.pessoa_id === p1)
        .minutos === 60,
      "all-day records do not become 24 working hours",
    );
    const unscheduled = await exec("criar_acao", {
      acao: {
        titulo: "Ação sem horário",
        descricao: "",
        responsavel_id: p1,
        prioridade: "normal",
        exige_verificacao: true,
        participantes: [{ pessoa_id: p2, funcao: "participante" }],
        local: "Local real",
      },
    });
    const scheduled = await exec("criar_acao", {
      acao: {
        titulo: "Ação agendada",
        descricao: "",
        responsavel_id: p1,
        prioridade: "normal",
        exige_verificacao: true,
      },
      evento: event("2026-10-20T09:00", "2026-10-20T10:00"),
    });
    check(
      scheduled.detalhe.acao.version === 1,
      "creating a legacy action without additional context keeps initial version 1",
    );
    d = await dashboard();
    check(
      d.total === 5,
      "scheduled action counts its linked event once; unscheduled action does not inflate events",
    );
    const pending = await rpc("ag_pendentes_v2", {
      _org: org,
      _minhas: false,
      _filtros: {},
      _pagina: 0,
      _limite: 25,
    });
    check(
      pending.registros.some((x) => x.id === unscheduled.acao_id) &&
        !pending.registros.some((x) => x.id === scheduled.acao_id),
      "identity deduplication removes scheduled action from unscheduled queue",
    );
    check(
      (await list({ demanda: true })).total === d.total &&
        (await list({ demanda: true }, 1)).registros.length === 2,
      "aggregate covers more records than page limit; drilldown uses same demand universe",
    );
    const person = await dashboard("2026-10-01", "2026-11-01", { pessoa_id: p3 });
    check(
      (await list({ demanda: true, pessoa_id: p3 })).total === person.total,
      "person drilldown shares exact authorized event universe",
    );
    const hour = await dashboard("2026-10-01", "2026-11-01", { hora: 9 });
    check(
      (await list({ demanda: true, hora: 9 })).total === hour.total,
      "hour drilldown uses occupied bin, not starts-at-hour",
    );
    const recurring = await exec("agendar", {
      evento: event("2026-10-22T15:00", "2026-10-22T16:00"),
    });
    await exec("criar_serie", {
      evento_id: recurring.evento_id,
      expected_version: 2,
      regra: {
        frequencia: "diaria",
        intervalo: 1,
        dias_semana: [],
        dia_mes: null,
        termina_em: null,
        quantidade: 3,
        politica_mes: "pular",
        hora_ambigua: "posterior",
        hora_inexistente: "pular",
      },
    });
    d = await dashboard();
    check(d.total === 8, "recurrence counts actual occurrences without an extra series parent");
    const tied = await dashboard("2026-10-22", "2026-10-25");
    check(
      tied.dias.length === 3 && tied.dias.every((x) => x.total === 1),
      "ties remain explicit as equal daily values",
    );
    const clipped = await dashboard("2026-10-06", "2026-10-10");
    check(
      clipped.semanas[0].parcial === true &&
        clipped.semanas[0].pessoas.find((p) => p.pessoa_id === p1).minutos === 0,
      "partial weeks expose clip and never include outside-period minutes",
    );
    const options = await rpc("ag_opcoes", {
      _org: org,
      _tipo: "projetos",
      _busca: "Cliente canônico",
    });
    check(
      options.registros.some(
        (x) =>
          x.id === project &&
          x.cliente_id === client &&
          x.unidade_id === unit &&
          x.endereco === "Rua de teste 100",
      ),
      "project picker searches real client and exposes canonical relationship and project unit address",
    );
    const contextEvent = await exec("agendar", {
      evento: event("2026-10-28T13:00", "2026-10-28T14:00", {
        tipo: "sem_categoria",
        bloqueia_recursos: true,
        cliente_id: client,
        projeto_id: project,
        unidade_id: unit,
        local: "Local editável",
      }),
    });
    const restored = await rpc("ag_obter", { _org: org, _id: contextEvent.evento_id });
    check(
      restored.evento.projeto_id === project &&
        restored.evento.cliente_id === client &&
        restored.evento.local === "Local editável" &&
        restored.evento.projeto_nome === "PROJ-DASH-TEST" &&
        restored.evento.tipo === "sem_categoria",
      "client/project/local and honest unclassified category persist in detail after server reread",
    );
    let invalidRelation = false;
    try {
      await tx.savepoint(() =>
        exec("agendar", {
          evento: event("2026-10-29T13:00", "2026-10-29T14:00", {
            cliente_id: client2,
            projeto_id: project,
          }),
        }),
      );
    } catch (e) {
      invalidRelation = e.code === "23503";
    }
    check(
      invalidRelation,
      "server rejects a project from another client using canonical composite FK",
    );
    const contextAction = await exec("criar_acao", {
      acao: {
        titulo: "Ação com contexto",
        descricao: "",
        responsavel_id: p1,
        prioridade: "normal",
        exige_verificacao: true,
        cliente_id: client,
        projeto_id: project,
        unidade_id: unit,
        local: "Sala real",
        participantes: [{ pessoa_id: p2, funcao: "participante" }],
      },
    });
    const actionDetail = await rpc("ag_obter_acao", { _org: org, _id: contextAction.acao_id });
    check(
      actionDetail.acao.cliente_id === client &&
        actionDetail.acao.projeto_id === project &&
        actionDetail.acao.local === "Sala real",
      "unscheduled action keeps canonical client/project and local",
    );
    check(
      (await dashboard()).categorias.some((x) => x.tipo === "sem_categoria" && x.total === 1),
      "unclassified category has explicit aggregation bucket",
    );
    check(
      actionDetail.cliente_nome === "Cliente canônico" &&
        actionDetail.projeto_nome === "PROJ-DASH-TEST" &&
        actionDetail.unidade_nome === "Unidade canônica" &&
        actionDetail.pessoas.some((p) => p.pessoa_id === p2) &&
        actionDetail.pessoas.filter((p) => p.pessoa_id === p1).length === 1,
      "reopening unscheduled action resolves real names and canonical collaborators without duplicate responsible",
    );
    const persistedBefore = (
      await tx`select count(*)::int count from public.acoes_operacionais where organization_id=${org}`
    )[0].count;
    let partialRejected = false;
    try {
      await tx.savepoint(() =>
        exec("criar_acao", {
          acao: {
            titulo: "Ação em horário ocupado",
            descricao: "",
            responsavel_id: p1,
            prioridade: "normal",
            exige_verificacao: true,
          },
          evento: event("2026-10-28T13:00", "2026-10-28T14:00", {
            tipo: "sem_categoria",
            bloqueia_recursos: true,
          }),
        }),
      );
    } catch (error) {
      partialRejected = error.code === "23P01";
    }
    check(
      partialRejected &&
        (
          await tx`select count(*)::int count from public.acoes_operacionais where organization_id=${org}`
        )[0].count === persistedBefore,
      "publication conflict atomically rolls back new action and event; no partial draft remains",
    );
    await auth(field);
    d = await dashboard();
    check(d.total === 9, "field user sees only authorized participations");
    await auth(admin);
    const privateEvent = await exec("agendar", {
      evento: event("2026-10-27T15:00", "2026-10-27T16:00", {
        responsavel_id: p2,
        participantes: [{ pessoa_id: p2, funcao: "responsavel" }],
      }),
    });
    await auth(field);
    d = await dashboard();
    check(
      d.total === 9 &&
        !(await list({ demanda: true })).registros.some((x) => x.id === privateEvent.evento_id),
      "partial access does not leak another person private event through aggregates",
    );
    await auth(outside);
    let denied = false;
    try {
      await tx.savepoint(() => dashboard());
    } catch (e) {
      denied = e.code === "42501";
    }
    check(denied, "other organization cannot read aggregate");
    await tx.unsafe("reset role");
    // Rollback every synthetic record in the isolated test transaction.
    throw { rollbackTest: true };
  });
} catch (e) {
  if (!e.rollbackTest) throw e;
} finally {
  await db.end();
}
console.log(`Agenda Dashboard: ${passed} assertions passed.`);
