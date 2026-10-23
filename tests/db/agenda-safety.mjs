import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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

    await reject(
      () =>
        tx.unsafe(
          "select public.ag_listar($1,'-infinity'::date,'2026-11-01'::date,'America/Sao_Paulo')",
          [org],
        ),
      "23514",
      "calendar refuses unbounded civil-date query",
    );

    // A custody created by the existing warehouse command is not an implicit new Agenda plan.
    const externalData = {
      ...base,
      titulo: "Reserva externa parcial",
      ferramentas: [],
      participantes: [],
    };
    const ed = await exec("salvar_evento", { evento: externalData });
    const ep = await exec("publicar", {
      evento_id: ed.evento_id,
      expected_version: ed.detalhe.evento.version,
    });
    const partial = await rpc("alm_executar", {
      _org: org,
      _chave: randomUUID(),
      _comando: "reservar_ferramenta",
      _dados: {
        ferramenta_id: tool,
        expected_version: 1,
        pessoa_id: principal,
        inicio: ep.detalhe.evento.inicio,
        fim: new Date(Date.parse(ep.detalhe.evento.inicio) + 30 * 60 * 1000).toISOString(),
        timezone: "America/Sao_Paulo",
        agenda_evento_id: ed.evento_id,
      },
    });
    const partialId = partial.detalhe.custodias[0].id;
    const withoutTools = {
      ...externalData,
      inicio_local: "2026-11-11T10:00",
      fim_local: "2026-11-11T11:00",
    };
    delete withoutTools.ferramentas;
    await reject(
      () =>
        rpc("salvar_evento_agenda", {
          _org: org,
          _chave: randomUUID(),
          _dados: withoutTools,
          _id: ed.evento_id,
          _expected_version: ep.detalhe.evento.version,
        }),
      "23514",
      "legacy save cannot silently cancel or expand an externally managed partial custody",
    );
    const rawPartial = (
      await tx`select estado,inicio,fim from public.ferramenta_custodias where id=${partialId}`
    )[0];
    check(
      rawPartial.estado === "reservada" &&
        new Date(rawPartial.fim) - new Date(rawPartial.inicio) === 30 * 60 * 1000,
      "rejected planning change leaves exact original external custody intact",
    );
    await reject(
      () =>
        exec("salvar_evento", {
          evento_id: ed.evento_id,
          expected_version: ep.detalhe.evento.version,
          evento: { ...withoutTools, ferramentas: [{ ferramenta_id: tool, pessoa_id: principal }] },
        }),
      "23514",
      "explicit Agenda edit cannot adopt a mismatched partial period",
    );
    await rpc("alm_executar", {
      _org: org,
      _chave: randomUUID(),
      _comando: "cancelar_custodia",
      _dados: {
        custodia_id: partialId,
        expected_version: 1,
        motivo: "Reserva parcial conferida e cancelada explicitamente",
      },
    });
    const released = await rpc("salvar_evento_agenda", {
      _org: org,
      _chave: randomUUID(),
      _dados: withoutTools,
      _id: ed.evento_id,
      _expected_version: ep.detalhe.evento.version,
    });
    check(
      released.version === ep.detalhe.evento.version + 1,
      "explicit warehouse release enables legacy calendar replanning",
    );
    const exactData = {
      ...externalData,
      titulo: "Reserva externa exata",
      inicio_local: "2026-11-12T10:00",
      fim_local: "2026-11-12T11:00",
    };
    const ex = await exec("salvar_evento", { evento: exactData });
    const exp = await exec("publicar", {
      evento_id: ex.evento_id,
      expected_version: ex.detalhe.evento.version,
    });
    const exact = await rpc("alm_executar", {
      _org: org,
      _chave: randomUUID(),
      _comando: "reservar_ferramenta",
      _dados: {
        ferramenta_id: tool,
        expected_version: (await rpc("alm_obter", { _org: org, _tipo: "ferramentas", _id: tool }))
          .registro.version,
        pessoa_id: principal,
        inicio: exp.detalhe.evento.inicio,
        fim: exp.detalhe.evento.fim,
        timezone: "America/Sao_Paulo",
        agenda_evento_id: ex.evento_id,
      },
    });
    const exactId = exact.detalhe.custodias.find(
      (c) => c.agenda_evento_id === ex.evento_id && c.estado === "reservada",
    ).id;
    const adopted = await exec("salvar_evento", {
      evento_id: ex.evento_id,
      expected_version: exp.detalhe.evento.version,
      evento: {
        ...exactData,
        inicio_local: "2026-11-13T10:00",
        fim_local: "2026-11-13T11:00",
        ferramentas: [{ ferramenta_id: tool, pessoa_id: principal }],
      },
    });
    check(
      adopted.detalhe.ferramentas[0].custodia_id !== exactId &&
        (await tx`select estado from public.ferramenta_custodias where id=${exactId}`)[0].estado ===
          "cancelada",
      "explicit Agenda adopts only the matching canonical reservation and retains its cancelled predecessor",
    );
    const active = (
      await tx`select inicio,fim from public.ferramenta_custodias where id=${adopted.detalhe.ferramentas[0].custodia_id}`
    )[0];
    check(
      new Date(active.inicio).getTime() === Date.parse(adopted.detalhe.evento.inicio) &&
        new Date(active.fim).getTime() === Date.parse(adopted.detalhe.evento.fim),
      "replacement custody has the exact explicit new event interval",
    );
    const legacyData = {
      ...exactData,
      inicio_local: "2026-11-14T10:00",
      fim_local: "2026-11-14T11:00",
    };
    delete legacyData.ferramentas;
    const retained = await rpc("salvar_evento_agenda", {
      _org: org,
      _chave: randomUUID(),
      _dados: legacyData,
      _id: ex.evento_id,
      _expected_version: adopted.detalhe.evento.version,
    });
    const retainedDetail = await rpc("ag_obter", { _org: org, _id: ex.evento_id });
    check(
      retainedDetail.ferramentas.length === 1 &&
        retainedDetail.ferramentas[0].estado === "reservada" &&
        retained.version === adopted.detalhe.evento.version + 1,
      "legacy omission preserves a canonical planned tool while explicit empty arrays remain removal intent",
    );

    const dates = (
      await tx`select ((clock_timestamp() at time zone 'America/Sao_Paulo')::date-10)::text conclusion,((clock_timestamp() at time zone 'America/Sao_Paulo')::date-5)::text planned,((clock_timestamp() at time zone 'America/Sao_Paulo')::date-2)::text expiry,((clock_timestamp() at time zone 'America/Sao_Paulo')::date+1)::text future,((clock_timestamp() at time zone 'America/Sao_Paulo')::date+10)::text future_expiry`
    )[0];
    const skill = await rpc("salvar_competencia", {
      _org: org,
      _chave: randomUUID(),
      _dados: {
        nome: "Competência configurada teste",
        exige_evidencia: false,
        exige_validade: true,
      },
    });
    const q = await rpc("salvar_qualificacao", {
      _org: org,
      _chave: randomUUID(),
      _dados: {
        pessoa_id: principal,
        competencia_id: skill.id,
        emissor: "Emissor isolado",
        conclusao: dates.conclusion,
        validade: dates.expiry,
      },
    });
    await rpc("transicionar_qualificacao", {
      _org: org,
      _chave: randomUUID(),
      _id: q.id,
      _expected_version: 1,
      _estado: "em_conferencia",
    });
    await rpc("transicionar_qualificacao", {
      _org: org,
      _chave: randomUUID(),
      _id: q.id,
      _expected_version: 2,
      _estado: "validada",
    });
    const late = await exec("salvar_evento", {
      evento: {
        ...base,
        titulo: "Visita atrasada qualificação",
        inicio_local: `${dates.planned}T10:00`,
        fim_local: `${dates.planned}T11:00`,
        ferramentas: [],
        participantes: [],
        competencias: [skill.id],
      },
    });
    // Isolated historical fixture: a visit published when the qualification covered its planned date.
    // No fake global/session clock is used and no connected record is changed.
    await tx.unsafe("reset role");
    const published = (
      await tx`update public.agenda_eventos set estado='publicado'where id=${late.evento_id} returning version,inicio,fim`
    )[0];
    await auth(admin);
    const preview = await rpc("ag_obter", { _org: org, _id: late.evento_id });
    check(
      preview.bloqueios.some((b) => b.codigo === "competencia"),
      "late published visit shows qualification expired between planned day and actual start",
    );
    await reject(
      () => exec("iniciar", { evento_id: late.evento_id, expected_version: published.version }),
      "23514",
      "actual start revalidates qualification civil date without shifting original window",
    );
    const unchanged = (
      await tx`select estado,version,inicio,fim from public.agenda_eventos where id=${late.evento_id}`
    )[0];
    check(
      unchanged.estado === "publicado" &&
        unchanged.version === published.version &&
        new Date(unchanged.inicio).getTime() === new Date(published.inicio).getTime() &&
        new Date(unchanged.fim).getTime() === new Date(published.fim).getTime(),
      "rejected late start preserves planned instants and concurrency version",
    );
    const future = await rpc("salvar_qualificacao", {
      _org: org,
      _chave: randomUUID(),
      _dados: {
        pessoa_id: second,
        competencia_id: skill.id,
        emissor: "Emissor isolado futuro",
        conclusao: dates.future,
        validade: dates.future_expiry,
      },
    });
    await rpc("transicionar_qualificacao", {
      _org: org,
      _chave: randomUUID(),
      _id: future.id,
      _expected_version: 1,
      _estado: "em_conferencia",
    });
    check(
      !(await rpc("qualificacao_validacao_permitida", { _org: org, _id: future.id })),
      "current validation flag refuses future completion in organization timezone",
    );
    await reject(
      () =>
        rpc("transicionar_qualificacao", {
          _org: org,
          _chave: randomUUID(),
          _id: future.id,
          _expected_version: 2,
          _estado: "validada",
        }),
      "23514",
      "server rejects future completion before qualification validation",
    );
    // Current authorization governs source/history/notifications, including when an invite remains.
    const action = await exec("criar_acao", {
      acao: {
        titulo: "Ação com origem protegida",
        descricao: "Teste de acesso atual",
        responsavel_id: principal,
        prazo: dates.future_expiry,
        prioridade: "normal",
        exige_verificacao: true,
      },
    });
    const aevent = await exec("salvar_evento", {
      evento: {
        ...base,
        titulo: "Ação canônica na agenda",
        ferramentas: [],
        participantes: [],
        acao_id: action.acao_id,
        inicio_local: `${dates.future}T10:00`,
        fim_local: `${dates.future}T11:00`,
      },
    });
    const ap = await exec("publicar", {
      evento_id: aevent.evento_id,
      expected_version: aevent.detalhe.evento.version,
    });
    const transitionKey = randomUUID();
    await exec(
      "transicionar_acao",
      {
        acao_id: action.acao_id,
        expected_version: action.detalhe.acao.version,
        estado: "em_execucao",
      },
      transitionKey,
    );
    await auth(field);
    check(
      (await rpc("ag_obter", { _org: org, _id: aevent.evento_id })).evento.id === aevent.evento_id,
      "assigned participant reads current canonical action context",
    );
    await tx.unsafe("reset role");
    await tx`update public.acoes_operacionais set responsavel_id=${second} where id=${action.acao_id}`;
    await auth(field);
    await reject(
      () => rpc("ag_obter", { _org: org, _id: aevent.evento_id }),
      "42501",
      "revoked source assignment removes event detail despite retained participation",
    );
    await reject(
      () => rpc("ag_historico", { _org: org, _id: aevent.evento_id, _tipo: "revisoes" }),
      "42501",
      "source revocation also removes immutable history access",
    );
    check(
      (await tx`select count(*)::int n from public.agenda_eventos where id=${aevent.evento_id}`)[0]
        .n === 0,
      "direct event RLS respects current source assignment",
    );
    await auth(admin);
    const anotherAdmin = randomUUID();
    await tx.unsafe("reset role");
    await tx`insert into auth.users(id,email)values(${anotherAdmin},${`another-${anotherAdmin}@invalid.test`})`;
    await tx`insert into public.memberships(organization_id,user_id)values(${org},${anotherAdmin})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${anotherAdmin},'admin')`;
    await tx`delete from public.user_roles where organization_id=${org} and user_id=${admin}`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},'campo')`;
    // Former manager still reads their own action but no longer may execute an action assigned elsewhere.
    await auth(admin);
    await reject(
      () =>
        exec(
          "transicionar_acao",
          {
            acao_id: action.acao_id,
            expected_version: action.detalhe.acao.version,
            estado: "em_execucao",
          },
          transitionKey,
        ),
      "42501",
      "manager receipt replay is reauthorized after reduction of role and assignment",
    );
    throw Object.assign(new Error("ROLLBACK_FIXTURES"), { fixtureRollback: true });
  });
} catch (error) {
  if (!error.fixtureRollback) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await evidence("agenda-safety.json", {
    database,
    checks: results,
    passed: pass,
    allPassed: process.exitCode !== 1,
    classification:
      "PostgreSQL integration in disposable loopback cluster; not connected Auth/Storage/browser E2E",
  });
  console.log(
    JSON.stringify({ suite: "agenda-safety", passed: pass, allPassed: process.exitCode !== 1 }),
  );
  await db.end();
}
