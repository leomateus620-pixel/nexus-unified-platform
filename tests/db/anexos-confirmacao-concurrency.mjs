import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";

// Sessões reais exclusivamente no PostgreSQL descartável. Storage contém só metadados.
if (process.env.PGTEST_EPHEMERAL !== "1") throw new Error("Use o runner descartável");
const options = {
  host: process.env.PGTEST_HOST || "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
};
const root = postgres(options);
const blocker = postgres(options);
const service = postgres({
  ...options,
  connection: { application_name: "nexus-file-confirmation-race" },
});
const org = "83000000-0000-0000-0000-000000000010";
const engineer = "83000000-0000-0000-0000-000000000001";
const field = "83000000-0000-0000-0000-000000000002";
const coordinator = "83000000-0000-0000-0000-000000000003";
let key = 20;
const nextKey = () => `83000000-0000-0000-0000-${String(key++).padStart(12, "0")}`;
async function asUser(user, command) {
  return root.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return command(tx);
  });
}
async function prepare(user, parent) {
  const [row] = await asUser(
    user,
    (tx) =>
      tx`select public.preparar_anexo_operacional(${org},${nextKey()},${tx.json({ ...parent, nome: "concurrency.pdf", mime: "application/pdf", tamanho: 100, sha256: "a".repeat(64) })}::jsonb) as value`,
  );
  await root`insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',${row.value.caminho},'{"size":100,"mimetype":"application/pdf"}')`;
  return row.value;
}
async function deniedAfterWaiting(attachment, author, mutate, label, pe = false) {
  let release, ready;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (ready = resolve));
  const mutation = blocker.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await mutate(tx);
    ready();
    await gate;
  });
  await started;
  const confirmation = service
    .begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      if (pe)
        await tx`select public.pe_confirmar_arquivo(${org},${attachment.id},${author},${"a".repeat(64)})`;
      else
        await tx`select public.confirmar_anexo_operacional(${org},${attachment.id},${author},${"a".repeat(64)})`;
    })
    .then(
      () => ({ accepted: true }),
      (error) => ({ accepted: false, code: error.code }),
    );
  let waiting = false;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const [state] =
        await root`select exists(select 1 from pg_stat_activity where application_name='nexus-file-confirmation-race' and cardinality(pg_blocking_pids(pid))>0) as waiting`;
      if (state.waiting) {
        waiting = true;
        break;
      }
      await setTimeout(20);
    }
  } finally {
    release();
  }
  await mutation;
  assert.equal(waiting, true, `${label}: confirmation really waited on the competing session`);
  assert.deepEqual(await confirmation, { accepted: false, code: "42501" });
  const [state] = pe
    ? await root`select estado from public.pe_arquivos where id=${attachment.id}`
    : await root`select estado from public.anexos where id=${attachment.id}`;
  assert.equal(state.estado, attachment.estado);
  console.log(`PASS: ${label}; concurrent confirmation waits, rechecks and preserves state`);
}
try {
  await root`insert into auth.users(id,email) values(${engineer},'race-eng@test.invalid'),(${field},'race-field@test.invalid'),(${coordinator},'race-coord@test.invalid')`;
  await root`insert into public.organizations(id,nome) values(${org},'File confirmation race fixtures')`;
  for (const user of [engineer, field, coordinator]) {
    await root`insert into public.memberships(organization_id,user_id) values(${org},${user})`;
  }
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${engineer},'engenharia'),(${org},${field},'campo')`;
  await root.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`insert into public.user_capacidades(organization_id,user_id,capacidade) values(${org},${coordinator},'coordenar_operacao')`;
  });
  const [person] = await asUser(
    engineer,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${nextKey()},'{"nome":"Race field person","vinculo":"colaborador","user_id":"83000000-0000-0000-0000-000000000002"}') as value`,
  );
  const [other] = await asUser(
    engineer,
    (tx) =>
      tx`select public.salvar_pessoa(${org},${nextKey()},'{"nome":"Other race person","vinculo":"prestador"}') as value`,
  );
  const personFile = await prepare(engineer, { pessoa_id: other.value.id });
  await deniedAfterWaiting(
    personFile,
    engineer,
    (tx) => tx`delete from public.user_roles where organization_id=${org} and user_id=${engineer}`,
    "role revoked while service confirmation is in flight",
  );
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${engineer},'engenharia')`;
  const [action] = await asUser(
    engineer,
    (tx) =>
      tx`select public.salvar_acao_operacional(${org},${nextKey()},${tx.json({ titulo: "Reassign during confirmation", responsavel_id: person.value.id })}::jsonb) as value`,
  );
  const actionFile = await prepare(field, { acao_id: action.value.id });
  await deniedAfterWaiting(
    actionFile,
    field,
    (tx) =>
      tx`update public.acoes_operacionais set responsavel_id=${other.value.id} where id=${action.value.id}`,
    "action reassigned while service confirmation is in flight",
  );
  const coordFile = await prepare(coordinator, { pessoa_id: other.value.id });
  await deniedAfterWaiting(
    coordFile,
    coordinator,
    (tx) =>
      tx`delete from public.user_capacidades where organization_id=${org} and user_id=${coordinator}`,
    "coordination capability revoked while service confirmation is in flight",
  );

  // Projeto restrito criado por outra pessoa: acesso do autor vem da responsabilidade atual.
  const client = nextKey();
  await root`insert into public.clientes(id,organization_id,razao_social) values(${client},${org},'PE confirmation race client')`;
  await root`insert into public.user_roles(organization_id,user_id,role) values(${org},${field},'engenharia')`;
  const [project] = await asUser(
    engineer,
    (tx) =>
      tx`select public.pe_executar(${org},${nextKey()},'criar',${tx.json({ titulo: "Restricted confirmation race project", cliente_id: client, responsavel_id: person.value.id, local_descritivo: "Test site", resumo: "Test original", modelo: { schema_version: 1, familia: "documental", finalidade: "estudo", secoes: [{ id: nextKey(), titulo: "Scope", texto: "Isolated confirmation test" }], parametros: [] } })}::jsonb) as value`,
  );
  const [peFile] = await asUser(
    field,
    (tx) =>
      tx`select public.pe_preparar_arquivo(${org},${project.value.versao.id},${nextKey()},'{"nome":"original.pdf","mime":"application/pdf","tamanho":100,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') as value`,
  );
  await root`insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',${peFile.value.caminho},'{"size":100,"mimetype":"application/pdf"}')`;
  const reassignProject = (tx) =>
    tx`update public.pe_projetos set responsavel_id=${other.value.id} where id=${project.value.projeto.id}`;
  await deniedAfterWaiting(
    peFile.value,
    field,
    reassignProject,
    "restricted PE reassignment during pending confirmation",
    true,
  );
  await root.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`update public.pe_projetos set responsavel_id=${person.value.id} where id=${project.value.projeto.id}`;
  });
  await service.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    await tx`select public.pe_confirmar_arquivo(${org},${peFile.value.id},${field},${"a".repeat(64)})`;
  });
  peFile.value.estado = "vinculado";
  await deniedAfterWaiting(
    peFile.value,
    field,
    reassignProject,
    "restricted PE reassignment during already-linked retry",
    true,
  );
} finally {
  await Promise.all([
    root.end({ timeout: 5 }),
    blocker.end({ timeout: 5 }),
    service.end({ timeout: 5 }),
  ]);
}
