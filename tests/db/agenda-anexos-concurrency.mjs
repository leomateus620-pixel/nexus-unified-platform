import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
if (process.env.PGTEST_EPHEMERAL !== "1") throw new Error("Requires PGTEST_EPHEMERAL=1");
const options = {
  host: process.env.PGTEST_HOST || "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  database: process.env.PGTEST_DATABASE || "postgres",
  user: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
if (
  options.host !== "127.0.0.1" ||
  !Number.isInteger(options.port) ||
  options.port < 1024 ||
  options.port > 65535 ||
  options.port === 5432 ||
  !/^(postgres|(?:db)?agenda(?:47|48)(?:_[a-z0-9_]+)?)$/.test(options.database)
)
  throw new Error("Requires an explicit ephemeral loopback PostgreSQL port");
const db = postgres(options),
  results = [];
const connection = (await db`select current_database() name,host(inet_server_addr()) address`)[0];
if (connection.name !== options.database || connection.address !== "127.0.0.1") {
  await db.end();
  throw new Error("Unexpected disposable test connection");
}
async function auth(tx, user) {
  await tx.unsafe("reset role");
  await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  await tx.unsafe("set local role authenticated");
}
async function rpc(tx, name, args) {
  const entries = Object.entries(args);
  return (
    await tx.unsafe(
      `select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")})r`,
      entries.map(([, v]) => (typeof v === "object" && v !== null ? tx.json(v) : v)),
    )
  )[0].r;
}
async function seed(kind) {
  const org = randomUUID(),
    admin = randomUUID(),
    user = randomUUID(),
    other = randomUUID(),
    person = randomUUID(),
    otherPerson = randomUUID();
  let event,
    file,
    source = null;
  await db.begin(async (tx) => {
    for (const u of [admin, user, other])
      await tx`insert into auth.users(id,email)values(${u},${`concurrency-${u}@invalid.test`})`;
    await tx`insert into public.organizations(id,nome)values(${org},'Agenda file race fixture')`;
    for (const u of [admin, user, other])
      await tx`insert into public.memberships(organization_id,user_id)values(${org},${u})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},'admin'),(${org},${user},'campo'),(${org},${other},'campo')`;
    await tx`select set_config('request.jwt.claim.sub',${admin},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,vinculo,user_id)values(${person},${org},'Race participant fixture','colaborador',${user}),(${otherPerson},${org},'Race replacement fixture','colaborador',${other})`;
    await auth(tx, admin);
    if (kind === "source") {
      source = (
        await rpc(tx, "ag_executar", {
          _org: org,
          _chave: randomUUID(),
          _comando: "criar_acao",
          _dados: {
            acao: {
              titulo: "Race source fixture",
              descricao: "",
              responsavel_id: person,
              prioridade: "normal",
              exige_verificacao: true,
            },
          },
        })
      ).acao_id;
    }
    event = (
      await rpc(tx, "ag_executar", {
        _org: org,
        _chave: randomUUID(),
        _comando: "salvar_evento",
        _dados: {
          evento: {
            titulo: "Race event fixture",
            descricao: "",
            tipo: "acao_interna",
            inicio_local: "2026-12-10T10:00",
            fim_local: "2026-12-10T11:00",
            timezone: "America/Sao_Paulo",
            dia_inteiro: false,
            local: "",
            responsavel_id: person,
            acao_id: source,
            bloqueia_recursos: true,
            participantes: [],
            competencias: [],
            ferramentas: [],
            visibilidade: kind === "participant" ? "participantes" : "organizacao",
          },
        },
      })
    ).evento_id;
    await auth(tx, user);
    file = await rpc(tx, "iniciar_anexo_agenda", {
      _org: org,
      _evento: event,
      _chave: randomUUID(),
      _dados: { nome: "race.jpg", mime: "image/jpeg", tamanho: 100, sha256: "a".repeat(64) },
    });
    await tx.unsafe("reset role");
    await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-operacional',${file.caminho},${tx.json({ size: 100, mimetype: "image/jpeg" })})`;
    if (kind === "source") {
      await tx.unsafe("set local role service_role");
      await rpc(tx, "confirmar_anexo_operacional", {
        _org: org,
        _id: file.id,
        _autor: user,
        _sha256: file.sha256,
      });
    }
  });
  return { org, admin, user, person, otherPerson, event, file, source };
}
try {
  for (const kind of ["participant", "source", "role"]) {
    const fixture = await seed(kind),
      label =
        kind === "participant"
          ? "participação removida durante confirmação pendente"
          : kind === "source"
            ? "fonte histórica revogada durante retry vinculado"
            : "papel revogado enquanto confirmação espera";
    const holder = postgres(options),
      application = `agenda48-confirm-${randomUUID()}`,
      confirmer = postgres({ ...options, connection: { application_name: application } });
    let release;
    const gate = new Promise((r) => (release = r));
    let ready;
    const locked = new Promise((r) => (ready = r));
    let hold;
    try {
      hold = holder.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${fixture.admin},true)`;
        if (kind === "participant") {
          await tx`select id from public.agenda_eventos where id=${fixture.event} for update`;
          await tx`update public.agenda_participantes set vigente=false,retirado_em=now()where organization_id=${fixture.org} and evento_id=${fixture.event} and pessoa_id=${fixture.person}`;
        } else if (kind === "source") {
          await tx`select id from public.acoes_operacionais where id=${fixture.source} for update`;
          await tx`update public.acoes_operacionais set responsavel_id=${fixture.otherPerson} where id=${fixture.source}`;
        } else
          await tx`delete from public.user_roles where organization_id=${fixture.org} and user_id=${fixture.user}`;
        ready();
        await gate;
      });
      await locked;
      const confirmation = confirmer
        .begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          return rpc(tx, "confirmar_anexo_operacional", {
            _org: fixture.org,
            _id: fixture.file.id,
            _autor: fixture.user,
            _sha256: fixture.file.sha256,
          });
        })
        .then(
          () => ({ code: null }),
          (error) => ({ code: error.code }),
        );
      let waiting = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        waiting = (
          await db`select exists(select 1 from pg_stat_activity where datname=current_database()and application_name=${application} and wait_event_type='Lock')ok`
        )[0].ok;
        if (waiting) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(waiting, `A confirmação deve aguardar lock real: ${label}`);
      results.push({ caso: `lock real: ${label}`, resultado: "passou" });
      release();
      await hold;
      const result = await confirmation;
      assert.equal(result.code, "42501", label);
      const current = (await db`select estado from public.anexos where id=${fixture.file.id}`)[0]
        .estado;
      assert.equal(current, kind === "source" ? "vinculado" : "pendente");
      results.push({ caso: `negação pós-lock: ${label}`, resultado: "passou" });
      console.log(`PASS ${label}`);
    } finally {
      release?.();
      await hold?.catch(() => {});
      await holder.end();
      await confirmer.end();
    }
  }
  if (process.env.PGTEST_EVIDENCE_JSON)
    await writeFile(
      process.env.PGTEST_EVIDENCE_JSON,
      JSON.stringify(
        {
          metodo:
            "Disputas reais PostgreSQL descartável loopback; fixtures só neste banco. Não Auth/Storage HTTP conectado.",
          resultado: true,
          checks: results,
        },
        null,
        2,
      ),
    );
} catch (error) {
  console.error({ error: error.message, code: error.code, where: error.where });
  process.exitCode = 1;
} finally {
  await db.end();
}
