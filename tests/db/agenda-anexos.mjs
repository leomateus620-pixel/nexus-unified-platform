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
  checks = [];
const connection = (await db`select current_database() name,host(inet_server_addr()) address`)[0];
if (connection.name !== options.database || connection.address !== "127.0.0.1") {
  await db.end();
  throw new Error("Unexpected disposable test connection");
}
const check = (ok, label) => {
  assert.ok(ok, label);
  checks.push({ label, resultado: "passou" });
  console.log(`PASS ${checks.length}: ${label}`);
};
const org = randomUUID(),
  outsideOrg = randomUUID(),
  admin = randomUUID(),
  field = randomUUID(),
  observer = randomUUID(),
  unassigned = randomUUID(),
  outside = randomUUID(),
  principal = randomUUID(),
  observerPerson = randomUUID(),
  unassignedPerson = randomUUID();
try {
  await db.begin(async (tx) => {
    for (const user of [admin, field, observer, unassigned, outside])
      await tx`insert into auth.users(id,email)values(${user},${`agenda-file-${user}@invalid.test`})`;
    await tx`insert into public.organizations(id,nome)values(${org},'Agenda files isolated A'),(${outsideOrg},'Agenda files isolated B')`;
    for (const user of [admin, field, observer, unassigned])
      await tx`insert into public.memberships(organization_id,user_id)values(${org},${user})`;
    await tx`insert into public.memberships(organization_id,user_id)values(${outsideOrg},${outside})`;
    await tx`insert into public.user_roles(organization_id,user_id,role)values(${org},${admin},'admin'),(${org},${field},'campo'),(${org},${observer},'campo'),(${org},${unassigned},'campo'),(${outsideOrg},${outside},'admin')`;
    await tx`select set_config('request.jwt.claim.sub',${admin},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,vinculo,user_id)values(${principal},${org},'Participante isolado','colaborador',${field}),(${observerPerson},${org},'Observador isolado','colaborador',${observer}),(${unassignedPerson},${org},'Pessoa não atribuída','colaborador',${unassigned})`;
    const auth = async (user) => {
      await tx.unsafe("reset role");
      await tx`select set_config('request.jwt.claim.sub',${user},true)`;
      await tx.unsafe("set local role authenticated");
    };
    const service = async () => {
      await tx.unsafe("reset role");
      await tx.unsafe("set local role service_role");
    };
    const rpc = async (name, args) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Unsafe RPC name");
      const entries = Object.entries(args);
      return (
        await tx.unsafe(
          `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) result`,
          entries.map(([, value]) =>
            typeof value === "object" && value !== null ? tx.json(value) : value,
          ),
        )
      )[0].result;
    };
    const reject = async (fn, code, label) => {
      let caught;
      try {
        await tx.savepoint(async () => fn());
      } catch (error) {
        caught = error;
      }
      check(caught?.code === code, `${label} (${caught?.code ?? "aceito"})`);
    };
    const execute = (command, data) =>
      rpc("ag_executar", { _org: org, _chave: randomUUID(), _comando: command, _dados: data });
    const metadata = {
      nome: "foto-isolada.jpg",
      mime: "image/jpeg",
      tamanho: 100,
      sha256: "a".repeat(64),
    };
    await auth(admin);
    const event = (
      await execute("salvar_evento", {
        evento: {
          titulo: "Evento com anexos isolados",
          descricao: "Teste SQL de arquivos canônicos",
          tipo: "visita_tecnica",
          inicio_local: "2026-12-10T08:00",
          fim_local: "2026-12-10T09:00",
          timezone: "America/Sao_Paulo",
          dia_inteiro: false,
          local: "Local isolado",
          responsavel_id: principal,
          bloqueia_recursos: true,
          participantes: [{ pessoa_id: observerPerson, funcao: "observador" }],
          competencias: [],
          ferramentas: [],
          visibilidade: "participantes",
        },
      })
    ).evento_id;
    await auth(field);
    const key = randomUUID();
    const file = await rpc("iniciar_anexo_agenda", {
      _org: org,
      _evento: event,
      _chave: key,
      _dados: metadata,
    });
    check(
      file.agenda_evento_id === event &&
        !file.acao_id &&
        !file.pessoa_id &&
        !file.qualificacao_id &&
        !file.ferramenta_id &&
        !file.calibracao_id,
      "A01 staging usa FK exclusiva do evento no cadastro canônico",
    );
    check(
      (
        await rpc("iniciar_anexo_agenda", {
          _org: org,
          _evento: event,
          _chave: key,
          _dados: metadata,
        })
      ).id === file.id,
      "A02 repetição mantém a mesma intenção",
    );
    await reject(
      () =>
        rpc("iniciar_anexo_agenda", {
          _org: org,
          _evento: event,
          _chave: key,
          _dados: { ...metadata, nome: "outro-nome.jpg" },
        }),
      "23505",
      "A03 mesma chave com outro conteúdo conflita",
    );
    await reject(
      () =>
        rpc("iniciar_anexo_agenda", {
          _org: org,
          _evento: event,
          _chave: randomUUID(),
          _dados: { ...metadata, created_by: admin },
        }),
      "23514",
      "A04 autoria não entra pelo payload",
    );
    let listing = await rpc("listar_anexos_operacionais", {
      _org: org,
      _pai: { agenda_evento_id: event },
    });
    check(
      listing.registros.length === 1 &&
        listing.permissoes.adicionar &&
        listing.registros[0].pode_retomar,
      "A05 leitor atual recebe capacidades reais de envio",
    );
    await reject(
      () =>
        rpc("confirmar_anexo_operacional", {
          _org: org,
          _id: file.id,
          _autor: field,
          _sha256: metadata.sha256,
        }),
      "42501",
      "A06 cliente autenticado não confirma armazenamento privilegiado",
    );
    await auth(unassigned);
    await reject(
      () => rpc("listar_anexos_operacionais", { _org: org, _pai: { agenda_evento_id: event } }),
      "42501",
      "A07 pai negado produz erro e não lista vazia",
    );
    check(
      (await tx`select count(*)::int n from public.anexos where id=${file.id}`)[0].n === 0,
      "A08 consulta direta aplica ACL do pai",
    );
    await auth(outside);
    await reject(
      () =>
        rpc("iniciar_anexo_agenda", {
          _org: outsideOrg,
          _evento: event,
          _chave: randomUUID(),
          _dados: metadata,
        }),
      "42501",
      "A09 staging cruzado é negado",
    );
    await tx.unsafe("reset role");
    await reject(
      () =>
        tx`insert into public.anexos(organization_id,agenda_evento_id,nome,mime,tamanho,sha256,caminho,created_by)values(${outsideOrg},${event},'cross.jpg','image/jpeg',100,${metadata.sha256},'fixture/cross',${outside})`,
      "23503",
      "A10 FK composta nega tenant cruzado direto",
    );
    await reject(
      () =>
        tx`insert into public.anexos(organization_id,agenda_evento_id,pessoa_id,nome,mime,tamanho,sha256,caminho,created_by)values(${org},${event},${principal},'xor.jpg','image/jpeg',100,${metadata.sha256},'fixture/xor',${admin})`,
      "23514",
      "A11 dois pais canônicos são rejeitados",
    );
    await auth(observer);
    listing = await rpc("listar_anexos_operacionais", {
      _org: org,
      _pai: { agenda_evento_id: event },
    });
    check(
      listing.registros.length === 1 &&
        !listing.permissoes.adicionar &&
        !listing.registros[0].pode_retomar,
      "A12 observador lê sem ganhar envio",
    );
    await reject(
      () =>
        rpc("iniciar_anexo_agenda", {
          _org: org,
          _evento: event,
          _chave: randomUUID(),
          _dados: metadata,
        }),
      "42501",
      "A13 observador não envia em nome da equipe",
    );
    await service();
    await reject(
      () =>
        rpc("confirmar_anexo_operacional", {
          _org: org,
          _id: file.id,
          _autor: field,
          _sha256: metadata.sha256,
        }),
      "23514",
      "A14 arquivo ausente não é vinculado",
    );
    await tx.unsafe("reset role");
    await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-operacional',${file.caminho},${tx.json({ size: 99, mimetype: "image/jpeg" })})`;
    await service();
    await reject(
      () =>
        rpc("confirmar_anexo_operacional", {
          _org: org,
          _id: file.id,
          _autor: field,
          _sha256: metadata.sha256,
        }),
      "23514",
      "A15 tamanho divergente não confirma",
    );
    await tx.unsafe("reset role");
    await tx`update storage.objects set metadata=${tx.json({ size: 100, mimetype: "image/jpeg" })} where name=${file.caminho}`;
    await service();
    await reject(
      () =>
        rpc("confirmar_anexo_operacional", {
          _org: org,
          _id: file.id,
          _autor: field,
          _sha256: "b".repeat(64),
        }),
      "42501",
      "A16 hash divergente não confirma",
    );
    await rpc("confirmar_anexo_operacional", {
      _org: org,
      _id: file.id,
      _autor: field,
      _sha256: metadata.sha256,
    });
    await rpc("confirmar_anexo_operacional", {
      _org: org,
      _id: file.id,
      _autor: field,
      _sha256: metadata.sha256,
    });
    await auth(field);
    check(
      (await tx`select estado from public.anexos where id=${file.id}`)[0].estado === "vinculado" &&
        (await tx`select count(*)::int n from storage.objects where name=${file.caminho}`)[0].n ===
          1,
      "A17 confirmação/retry preservam um objeto privado",
    );
    await tx.unsafe("reset role");
    await reject(
      () => tx`update public.anexos set nome='silencioso.jpg' where id=${file.id}`,
      "23514",
      "A18 metadados vinculados são imutáveis",
    );
    await auth(field);
    const pending = await rpc("iniciar_anexo_agenda", {
      _org: org,
      _evento: event,
      _chave: randomUUID(),
      _dados: { ...metadata, nome: "pendente.jpg" },
    });
    await auth(admin);
    const pub = await execute("publicar", {
      evento_id: event,
      expected_version: (await rpc("ag_obter", { _org: org, _id: event })).evento.version,
    });
    await auth(field);
    const started = await execute("iniciar", {
      evento_id: event,
      expected_version: pub.detalhe.evento.version,
    });
    await execute("concluir", {
      evento_id: event,
      expected_version: started.detalhe.evento.version,
    });
    listing = await rpc("listar_anexos_operacionais", {
      _org: org,
      _pai: { agenda_evento_id: event },
    });
    check(
      !listing.permissoes.adicionar && listing.registros.some((r) => r.id === file.id),
      "A19 conclusão preserva leitura histórica sem novos envios",
    );
    check(
      listing.registros.find((r) => r.id === pending.id).pode_cancelar &&
        !listing.registros.find((r) => r.id === pending.id).pode_retomar,
      "A20 staging fechado pode ser limpo sem reabrir upload",
    );
    await reject(
      () =>
        rpc("iniciar_anexo_agenda", {
          _org: org,
          _evento: event,
          _chave: randomUUID(),
          _dados: metadata,
        }),
      "42501",
      "A21 evento concluído recusa nova intenção",
    );
    const cancelKey = randomUUID();
    await rpc("cancelar_anexo_operacional", {
      _org: org,
      _id: pending.id,
      _chave: cancelKey,
      _motivo: "Envio não concluído antes do encerramento",
    });
    const cancelRetry = await rpc("cancelar_anexo_operacional", {
      _org: org,
      _id: pending.id,
      _chave: cancelKey,
      _motivo: "Envio não concluído antes do encerramento",
    });
    check(
      cancelRetry.estado === "cancelado",
      "A22 cancelamento pendente é auditável e repetível após conclusão",
    );
    await service();
    await rpc("confirmar_anexo_operacional", {
      _org: org,
      _id: file.id,
      _autor: field,
      _sha256: metadata.sha256,
    });
    check(true, "A23 retry já vinculado preserva leitura histórica autorizada");
    await tx.unsafe("reset role");
    await tx`update public.agenda_participantes set vigente=false,retirado_em=now()where organization_id=${org} and evento_id=${event} and pessoa_id=${principal}`;
    await service();
    await reject(
      () =>
        rpc("confirmar_anexo_operacional", {
          _org: org,
          _id: file.id,
          _autor: field,
          _sha256: metadata.sha256,
        }),
      "42501",
      "A24 retry vinculado revalida atribuição atual",
    );
    await auth(field);
    check(
      (await tx`select count(*)::int n from storage.objects where name=${file.caminho}`)[0].n === 0,
      "A25 objeto privado desaparece após revogação",
    );
    await auth(admin);
    const legacyPayload = {
        pessoa_id: principal,
        acao_id: null,
        qualificacao_id: null,
        nome: "legado.jpg",
        mime: "image/jpeg",
        tamanho: 100,
        sha256: metadata.sha256,
      },
      legacyKey = randomUUID();
    const legacy = await rpc("preparar_anexo_operacional", {
      _org: org,
      _chave: legacyKey,
      _dados: legacyPayload,
    });
    check(
      (
        await rpc("preparar_anexo_operacional", {
          _org: org,
          _chave: legacyKey,
          _dados: legacyPayload,
        })
      ).id === legacy.id,
      "A26 assinatura e retry legados permanecem válidos",
    );
    await tx.unsafe("reset role");
    check(
      (
        await tx`select request_hash=md5(${tx.json(legacyPayload)}::jsonb::text)ok from public.operacoes_idempotentes where organization_id=${org} and chave=${legacyKey}`
      )[0].ok,
      "A27 hash idempotente legado não recebe chave Agenda",
    );
    await auth(admin);
    await reject(
      () =>
        rpc("operacao_autor_destino_anexo_ate27", {
          _org: org,
          _pai: { pessoa_id: principal },
          _autor: admin,
          _escrever: false,
        }),
      "42501",
      "A28 helper legado delegado não vira bypass público",
    );
    throw Object.assign(new Error("ROLLBACK_FIXTURES"), { fixtureRollback: true });
  });
} catch (error) {
  if (!error.fixtureRollback) {
    console.error({ code: error.code, error: error.message, where: error.where });
    process.exitCode = 1;
  }
} finally {
  if (process.env.PGTEST_EVIDENCE_JSON)
    await writeFile(
      process.env.PGTEST_EVIDENCE_JSON,
      JSON.stringify(
        {
          metodo:
            "Integração SQL/RLS/metadata Storage, PostgreSQL descartável e transação revertida. Não é upload de bytes ou Auth/Storage HTTP conectado.",
          resultado: process.exitCode !== 1,
          checks,
        },
        null,
        2,
      ),
    );
  await db.end();
}
