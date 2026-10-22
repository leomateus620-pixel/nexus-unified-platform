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

    // Genuine browser-independent job path: no Auth user is invented or installed in claims.
    const today = (
      await tx`select (clock_timestamp() at time zone 'America/Sao_Paulo')::date::text d`
    )[0].d;
    const dates = (
      await tx`select (${today}::date+1)::text tomorrow,(${today}::date+60)::text initial_end,(${today}::date+65)::text later_end,(${today}::date-65)::text old_day,(${today}::date-41)::text yesterday`
    )[0];
    const event = {
      ...base,
      titulo: "Série automática com ferramenta",
      inicio_local: `${dates.tomorrow}T10:00`,
      fim_local: `${dates.tomorrow}T11:00`,
      participantes: [],
    };
    const rule = {
      frequencia: "diaria",
      intervalo: 1,
      dias_semana: [],
      dia_mes: null,
      quantidade: 100,
      termina_em: null,
      politica_mes: "pular",
      hora_ambigua: "posterior",
      hora_inexistente: "pular",
    };
    const anchor = await exec("salvar_evento", { evento: event });
    const published = await exec("publicar", {
      evento_id: anchor.evento_id,
      expected_version: anchor.detalhe.evento.version,
    });
    const series = await exec("criar_serie", {
      evento_id: anchor.evento_id,
      expected_version: published.detalhe.evento.version,
      regra: rule,
    });
    const sid = series.id;
    check(
      (await tx`select count(*)::int n from public.agenda_eventos where serie_id=${sid}`)[0].n ===
        60,
      "initial horizon materializes only 60 occurrences including anchor",
    );
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    const job = (
      await tx`insert into public.job_execucoes(job,estado)values('agenda-notificacoes','em_execucao')returning id`
    )[0].id;
    const more = await rpc("ag_materializar", {
      _org: org,
      _serie: sid,
      _ate: dates.later_end,
      _job: job,
    });
    check(
      more.processados === 5 && more.falhas === 0,
      "backend extends finite horizon without browser or fake Auth uid",
    );
    const automations =
      await tx`select e.id,e.created_by,e.geracao_job_id,c.estado,c.created_by custodian_author,h.operacao,h.autor,a.backend_pid,a.transaction_id::text xid from public.agenda_eventos e join public.agenda_ferramentas f on f.organization_id=e.organization_id and f.evento_id=e.id and f.vigente join public.ferramenta_custodias c on c.organization_id=f.organization_id and c.id=f.custodia_id join public.agenda_automacoes a on a.organization_id=c.organization_id and a.custodia_id=c.id join public.operacao_historico h on h.organization_id=c.organization_id and h.entidade_id=c.id where e.serie_id=${sid} and e.gerado_automaticamente`;
    check(
      automations.length === 5 &&
        automations.every(
          (a) =>
            a.created_by === admin &&
            a.custodian_author === admin &&
            a.autor === admin &&
            a.operacao === "GERACAO_AUTOMATICA" &&
            a.geracao_job_id === job &&
            a.estado === "reservada",
        ),
      "automatic reservation uses canonical custody and explicit requester/job audit",
    );
    const humanVersion = (await tx`select version from public.agenda_series where id=${sid}`)[0]
      .version;
    const repeated = await rpc("ag_materializar", {
      _org: org,
      _serie: sid,
      _ate: dates.later_end,
      _job: job,
    });
    check(
      repeated.processados === 0 &&
        (
          await tx`select count(*)::int n from public.ferramenta_custodias c join public.agenda_eventos e on e.organization_id=c.organization_id and e.id=c.agenda_evento_id where e.serie_id=${sid}`
        )[0].n === 65,
      "repeated backend generation creates no duplicate event or custody",
    );
    check(
      (await tx`select version from public.agenda_series where id=${sid}`)[0].version ===
        humanVersion,
      "worker no-op and generation do not change human series expected_version",
    );
    await tx`update public.job_execucoes set estado='sucesso',finalizado_em=clock_timestamp()where id=${job}`;
    await reject(
      () => rpc("ag_materializar", { _org: org, _serie: sid, _ate: dates.later_end, _job: job }),
      "42501",
      "completed job context cannot be reused",
    );
    await auth(admin);
    await reject(
      () => rpc("executar_job_agenda_notificacoes", {}),
      "42501",
      "interactive user cannot execute backend job",
    );
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub',${admin},true)`;
    await reject(
      () => rpc("executar_job_agenda_notificacoes", {}),
      "42501",
      "owner job also refuses non-null session uid",
    );
    // Reconstruct a valid unmaterialized series state, as after backend downtime. No global fake clock.
    await auth(admin);
    const blocker = await exec("salvar_evento", {
      evento: {
        ...event,
        titulo: "Conflito anterior ao retorno do job",
        ferramentas: [],
        inicio_local: `${dates.yesterday}T14:00`,
        fim_local: `${dates.yesterday}T15:00`,
      },
    });
    const bp = await exec("publicar", {
      evento_id: blocker.evento_id,
      expected_version: blocker.detalhe.evento.version,
    });
    const lateModel = {
      ...event,
      titulo: "Retomada após indisponibilidade do backend",
      ferramentas: [],
      inicio_local: `${dates.old_day}T14:00`,
      fim_local: `${dates.old_day}T15:00`,
    };
    await tx.unsafe("reset role");
    const normalized = await rpc("ag_resolver_periodo", { _d: lateModel });
    delete lateModel.inicio_local;
    delete lateModel.fim_local;
    Object.assign(lateModel, normalized);
    const lateSid = randomUUID(),
      lateVersion = randomUUID();
    await tx`insert into public.agenda_series(id,organization_id,created_by)values(${lateSid},${org},${admin})`;
    await tx`insert into public.agenda_serie_versoes(id,organization_id,serie_id,numero,regra,evento_modelo,timezone,inicio_aplicacao,publicar,created_by)values(${lateVersion},${org},${lateSid},1,${tx.json({ ...rule, quantidade: 26 })},${tx.json(lateModel)},'America/Sao_Paulo',${dates.old_day},true,${admin})`;
    await tx`update public.agenda_series set versao_atual_id=${lateVersion} where id=${lateSid}`;
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    const workerDurations = [];
    let delayedJob, backlog;
    for (let attempt = 0; attempt < 30; attempt++) {
      const started = Date.now();
      delayedJob = await rpc("executar_job_agenda_notificacoes", {});
      workerDurations.push(Date.now() - started);
      backlog = (
        await tx`select materializacao_pendente from public.agenda_series where id=${lateSid}`
      )[0].materializacao_pendente;
      if (!backlog) break;
    }
    check(
      !backlog && workerDurations.length > 1,
      "bounded worker batches preserve and drain explicit downtime backlog",
    );
    const slots =
      await tx`select data::text,estado,codigo from public.agenda_serie_ocorrencias where serie_versao_id=${lateVersion} order by data`;
    check(
      slots.length === 26 && slots[0].data === dates.old_day && slots[0].estado === "materializada",
      "job catches up missed dates older than 60 days without silently discarding backlog",
    );
    check(
      slots.find((s) => s.data === dates.yesterday)?.estado === "bloqueada" &&
        slots.find((s) => s.data === dates.yesterday)?.codigo === "23P01",
      "past conflict remains an observable pending occurrence",
    );
    check(
      (
        await tx`select coalesce(sum(falhas),0)::int n from public.job_execucoes where iniciado_em>=transaction_timestamp()`
      )[0].n >= 1,
      "backend reports blocked occurrence as failure rather than false success",
    );
    await auth(admin);
    const shown = await rpc("ag_obter", {
      _org: org,
      _id: (
        await tx`select id from public.agenda_eventos where serie_id=${lateSid} order by inicio limit 1`
      )[0].id,
    });
    check(
      shown.serie.pendencias === 1,
      "past blocked occurrence remains visible in series diagnostics",
    );
    const cancelledSeries = await exec("cancelar_serie", {
      serie_id: lateSid,
      expected_version: shown.serie.version,
      escopo: "todas_futuras",
      motivo: "Suspender somente compromissos futuros",
    });
    check(
      cancelledSeries.detalhe.serie.estado === "cancelada" &&
        cancelledSeries.detalhe.serie.pendencias === 1 &&
        cancelledSeries.detalhe.serie.permissoes.reprocessar,
      "future cancellation preserves earlier pending occurrence and its recovery command",
    );
    await exec("cancelar", {
      evento_id: blocker.evento_id,
      expected_version: bp.detalhe.evento.version,
      motivo: "Conflito corrigido após revisão",
    });
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    // Make the existing pending backoff due; this is a disposable fixture change, not a clock replacement.
    await tx`update public.agenda_serie_ocorrencias set proxima_tentativa=clock_timestamp()-interval '1 second' where serie_versao_id=${lateVersion} and estado='bloqueada'`;
    await rpc("executar_job_agenda_notificacoes", {});
    const recovered = (
      await tx`select estado,tentativas,evento_id from public.agenda_serie_ocorrencias where serie_versao_id=${lateVersion} and data=${dates.yesterday}`
    )[0];
    check(
      recovered.estado === "materializada" && recovered.tentativas === 2 && !!recovered.evento_id,
      "backend retries and recovers the same past occurrence identity after conflict removal",
    );
    // Notification and outbox effects remain idempotent without a browser session.
    await auth(admin);
    const soon = (
      await tx`select to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') inicio,to_char((clock_timestamp()+interval '40 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') fim`
    )[0];
    const soonEvent = {
      ...event,
      titulo: "Lembrete backend isolado",
      ferramentas: [],
      inicio: soon.inicio,
      fim: soon.fim,
    };
    delete soonEvent.inicio_local;
    delete soonEvent.fim_local;
    const nr = await exec("salvar_evento", { evento: soonEvent });
    await exec("publicar", {
      evento_id: nr.evento_id,
      expected_version: nr.detalhe.evento.version,
    });
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    await rpc("executar_job_agenda_notificacoes", {});
    const notificationCount = async () =>
      (
        await tx`select count(*)::int n from public.notificacoes where agenda_evento_id=${nr.evento_id}`
      )[0].n;
    const before = await notificationCount();
    check(before === 2, "published notification and reminder persist for the actual participant");
    await rpc("executar_job_agenda_notificacoes", {});
    check(
      (await notificationCount()) === before,
      "repeated backend job does not duplicate notification effects",
    );
    await auth(field);
    const ownNotice = await rpc("ag_notificacoes", { _org: org, _limite: 25 });
    check(
      ownNotice.total > 0 &&
        (
          await tx`select count(*)::int n from public.notificacoes where agenda_evento_id=${nr.evento_id}`
        )[0].n === 2,
      "participant reads current authorized backend notifications independently of first-page position",
    );
    await reject(
      () => tx`select * from public.agenda_automacoes`,
      "42501",
      "automation context is never exposed to authenticated roles",
    );
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    await tx.unsafe("set local role service_role");
    await reject(
      () => rpc("executar_job_agenda_notificacoes", {}),
      "42501",
      "service RPC role cannot trigger private scheduler owner function",
    );
    await evidence("agenda-job-durations.json", {
      database,
      workerDurations,
      classification: "Local disposable backend batches, not production latency or field metrics",
    });
    throw Object.assign(new Error("ROLLBACK_FIXTURES"), { fixtureRollback: true });
  });
} catch (error) {
  if (!error.fixtureRollback) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await evidence("agenda-jobs.json", {
    database,
    checks: results,
    passed: pass,
    allPassed: process.exitCode !== 1,
    classification:
      "PostgreSQL integration in disposable loopback cluster; not connected Auth/Storage/browser E2E",
  });
  console.log(
    JSON.stringify({ suite: "agenda-jobs", passed: pass, allPassed: process.exitCode !== 1 }),
  );
  await db.end();
}
