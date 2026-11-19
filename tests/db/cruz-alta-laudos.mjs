import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
) {
  throw Error("Este cenário requer PostgreSQL descartável no loopback.");
}
const connection = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  username: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
const database = "cruz_alta_laudos_" + process.pid;
const control = postgres({ ...connection, database: "postgres" });
const sql = postgres({ ...connection, database });
const migrations = await loadManifest(process.cwd());
const org = "abab473b-8baa-4781-aed2-c1243338af65";
const client = "c3d779b6-c407-8ab4-8545-6bdfd6068013";
const unit = "a9f6603b-6497-8e9e-822a-dfc860510c1a";
const users = Object.fromEntries(
  ["reviewer", "engineerWithoutRecord", "viewer", "outsider"].map((name) => [name, randomUUID()]),
);
const key = "lvhf-08";
const folderId = "test-root-laudos";
const fileId = "test-source-laudo";
const plateId = "test-source-placa";
const warning = { text: "Restrição de movimentação", page: 2 };
const deny = (operation, code) => assert.rejects(operation, (error) => error.code === code);
async function role(user = null, service = false) {
  await sql.unsafe("reset role");
  await sql`select set_config('request.jwt.claim.sub',${user ?? ""},false)`;
  if (user) await sql.unsafe("set role authenticated");
  if (service) await sql.unsafe("set role service_role");
}
async function summary(user, scope = key) {
  await role(user);
  return (await sql`select ca_inspecao_summary(${org},${scope}) r`)[0].r;
}
async function current(user = users.reviewer) {
  return (await summary(user)).items[0];
}
function doc({
  version = 1,
  revision = version,
  byte = "a",
  id = fileId,
  kind = "laudo",
  name = "LAUDO TESTE LVHF 08.pdf",
} = {}) {
  return {
    id,
    name,
    kind,
    mimeType: "application/pdf",
    parents: [folderId],
    version: String(version),
    modifiedAt: "2026-11-18T00:00:00Z",
    size: 400,
    sha256: byte.repeat(64),
    resourceKey: null,
    code: "08",
    revision,
  };
}
async function enqueue(reset = false) {
  await role();
  if (reset) await sql`update ca_inspecao_lotes set criado_em=now()-interval '20 minutes'`;
  await role(null, true);
  const result = (
    await sql`select ca_inspecao_sync_start(${sql.json([{ folderId, kind: "laudo" }])}) r`
  )[0].r;
  assert.equal(result.queued, 1);
}
async function job() {
  const ticket = randomBytes(32).toString("hex");
  await role();
  await sql`insert into ca_inspecao_tickets values(encode(sha256(convert_to(${ticket},'UTF8')),'hex'),now()+interval '1 minute')`;
  await role(null, true);
  const result = (await sql`select ca_inspecao_sync_claim(${ticket}) r`)[0].r;
  assert.equal(result.authorized, true);
  assert.deepEqual((await sql`select ca_inspecao_sync_claim(${ticket}) r`)[0].r, {
    authorized: false,
    job: null,
  });
  assert.ok(result.job);
  return result.job;
}
async function finish(j, result, lease = j.lease) {
  await role(null, true);
  return (await sql`select ca_inspecao_sync_finish(${j.id},${lease},${sql.json(result)}) r`)[0].r;
}
async function scan(children, nextPageToken = null) {
  const j = await job();
  assert.equal(j.kind, "scan");
  assert.equal(
    (await finish(j, { kind: "scan", children, nextPageToken }, randomUUID())).state,
    "obsolete",
  );
  assert.equal((await finish(j, { kind: "scan", children, nextPageToken })).state, "completed");
}
function payload(j, restriction, due, overrides = {}) {
  return {
    kind: "process",
    status: "verified",
    sha256: j.source.sha256,
    size: j.source.size,
    itemKeys: [key],
    fields: {
      inspection: { value: "2026-11-18", page: 1, label: "Data da inspeção" },
      due: { value: due, page: 1, label: "Próxima inspeção" },
    },
    restriction,
    issues: [],
    pages: 3,
    ...overrides,
  };
}
async function processDoc(restriction, due = "2027-11-18", overrides = {}) {
  const j = await job();
  assert.equal(j.kind, "process");
  const result = payload(j, restriction, due, overrides);
  await deny(() => finish(j, result), "23514");
  await role();
  await sql`insert into storage.objects(bucket_id,name,metadata)
    values('nexus-cruz-alta-laudos',${j.source.sha256 + ".pdf"},${sql.json({ size: j.source.size, mimetype: "application/pdf" })})
    on conflict do nothing`;
  assert.equal((await finish(j, result)).state, "completed");
}
async function review(
  item,
  evidence,
  restriction,
  {
    user = users.reviewer,
    note = "Conferência do cenário descartável",
    adopt = [],
    action = "approve",
  } = {},
) {
  await role(user);
  const decision = {
    evidence,
    action,
    adopt,
    ...(restriction ? { restriction: { action: restriction } } : {}),
  };
  return (
    await sql`select ca_inspecao_review(${org},${key},${item.version},${sql.json(decision)},${note}) r`
  )[0].r;
}
async function preview(user, evidence, line = key) {
  await role(user);
  return (await sql`select ca_inspecao_preview(${org},${line},${evidence}) r`)[0].r;
}

await control.unsafe(`do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$`);
await control.unsafe("create database " + database);
try {
  const bootstrap = await readFile("tests/db/bootstrap.sql", "utf8");
  await sql.unsafe(bootstrap.replace(/^create role anon[^\n]*\n/m, ""));
  await applyMigrations(sql, migrations.slice(0, 103));
  for (const id of Object.values(users)) {
    await sql`insert into auth.users(id,email) values(${id},${id + "@teste.invalid"})`;
  }
  await sql`insert into organizations(id,nome) values(${org},'TESTE DE LAUDOS DESCARTÁVEL')`;
  for (const id of Object.values(users)) {
    await sql`insert into memberships(organization_id,user_id) values(${org},${id})`;
  }
  for (const id of [users.reviewer, users.engineerWithoutRecord]) {
    await sql`insert into user_roles(organization_id,user_id,role) values(${org},${id},'engenharia')`;
  }
  await sql`select set_config('request.jwt.claim.sub',${users.reviewer},false)`;
  await sql`insert into pessoas(organization_id,nome,vinculo,user_id,registro_profissional,created_by)
    values(${org},'Revisor de teste','colaborador',${users.reviewer},'CREA TESTE 123',${users.reviewer})`;
  await sql`insert into clientes(id,organization_id,razao_social) values(${client},${org},'TESTE LAUDOS')`;
  await sql`insert into unidades(id,organization_id,cliente_id,nome) values(${unit},${org},${client},'UNIDADE DE TESTE')`;
  await applyMigrations(sql, migrations);
  assert.deepEqual(await applyMigrations(sql, migrations), []);
  await sql`insert into nr_cena_consultores values(${org},${client},${unit},${users.viewer},false)`;
  await deny(() => summary(users.outsider), "42501");
  assert.equal((await summary(users.engineerWithoutRecord)).canReview, false);
  await role(users.viewer);
  await deny(() => sql`select * from ca_inspecao_evidencias`, "42501");
  await deny(() => sql`select ca_inspecao_sync_claim(${"a".repeat(64)})`, "42501");
  await deny(() => sql`select ca_inspecao_request_sync(${org})`, "42501");
  console.log("PASS migrações, escopo privado, papel e fila");

  await enqueue();
  await scan([doc()]);
  await processDoc(warning);
  const first = await current();
  assert.equal(first.fields.due.value, "2027-11-18");
  assert.equal(first.restriction, null);
  assert.equal(first.availability, "review");
  assert.deepEqual(first.documents[0].restriction, warning);
  assert.equal((await current(users.viewer)).documents[0].restriction, undefined);
  await deny(() => preview(users.viewer, first.documents[0].id), "42501");
  await role();
  await sql`update nr_cena_consultores set permite_original=true where usuario_id=${users.viewer}`;
  assert.equal((await preview(users.viewer, first.documents[0].id)).path, "a".repeat(64) + ".pdf");
  await deny(() => preview(users.viewer, first.documents[0].id, "lvhf-09"), "42501");
  await deny(
    () => review(first, first.documents[0].id, "adopt", { user: users.engineerWithoutRecord }),
    "42501",
  );
  await deny(() => review(first, first.documents[0].id, undefined), "23514");
  const approved = await review(first, first.documents[0].id, "adopt");
  assert.equal(approved.restriction.text, warning.text);
  assert.equal(approved.status, "restricted");
  console.log("PASS leitura privada com página e aviso somente após decisão técnica");

  await enqueue(true);
  await scan([doc({ version: 2, revision: 1, byte: "b" })]);
  await processDoc(null, "2028-11-18");
  const ambiguous = await current();
  assert.equal(ambiguous.fields.due.value, "2027-11-18");
  assert.ok(ambiguous.documents.some((d) => d.state === "pending" && d.issues.length > 0));
  await enqueue(true);
  await scan([doc({ version: 3, revision: 2, byte: "c" })]);
  await processDoc(null, "2028-11-18");
  const changed = await current();
  assert.equal(changed.fields.due.value, "2028-11-18");
  assert.equal(changed.restriction.text, warning.text);
  const changedDocument = changed.documents.find((d) => d.revision === "2");
  assert.ok(changedDocument);
  assert.equal(changedDocument.state, "pending");
  await deny(() => review(first, changedDocument.id, "remove"), "PT409");
  await deny(() => review(changed, changedDocument.id, "remove", { note: "" }), "23514");
  const cleared = await review(changed, changedDocument.id, "remove", { adopt: ["due"] });
  assert.equal(cleared.restriction, null);
  assert.equal(cleared.fields.due.value, "2028-11-18");
  assert.equal(cleared.fields.due.evidence, changedDocument.id);
  console.log("PASS distinção de revisão ambígua e mais recente, remoção explícita e concorrência");

  await enqueue(true);
  await scan([doc({ version: 4, revision: 3, byte: "c" })]);
  const repeat = await job();
  assert.equal((await finish(repeat, payload(repeat, null, "2028-11-18"))).state, "completed");
  await role();
  assert.equal((await sql`select count(*)::int n from ca_inspecao_evidencias`)[0].n, 3);
  assert.equal((await sql`select count(*)::int n from ca_inspecao_decisoes`)[0].n, 2);
  await deny(() => sql`update ca_inspecao_evidencias set nome='ALTERAÇÃO TESTE'`, "23514");
  console.log("PASS novos metadados com mesmos bytes preservam revisão e auditoria");

  await enqueue(true);
  await scan([], "segunda-pagina-teste");
  const page = await job();
  await role(null, true);
  assert.equal(
    (await sql`select ca_inspecao_sync_fail(${page.id},${page.lease},'falha_teste',false) r`)[0].r
      .state,
    "failed",
  );
  assert.equal((await current()).fields.due.evidence, changedDocument.id);
  assert.equal((await current()).availability, "verified");
  await enqueue(true);
  await scan([]);
  const absent = await current();
  assert.equal(absent.availability, "stale");
  assert.equal(absent.fields.due.evidence, changedDocument.id);
  await deny(() => review(absent, changedDocument.id, "keep"), "PT409");
  assert.equal((await preview(users.viewer, changedDocument.id)).sha256, "c".repeat(64));
  console.log("PASS falha parcial não infere retirada; ausência só após varredura completa");

  await enqueue(true);
  await scan([
    doc({ version: 4, revision: 3, byte: "c" }),
    doc({ byte: "d", id: plateId, kind: "placa", name: "PLACA TESTE LVHF 08.pdf" }),
  ]);
  await processDoc({ text: "  RESTRIÇÃO   DE MOVIMENTAÇÃO ", page: 1 }, "2028-11-18");
  const plate = await current();
  const candidate = plate.documents.find((d) => d.kind === "placa");
  assert.equal(plate.restriction, null);
  assert.equal(candidate.state, "pending");
  const final = await review(plate, candidate.id, "adopt");
  assert.equal(final.restriction.evidence, candidate.id);
  console.log("PASS placa vinculada à própria evidência e aviso submetido à mesma revisão");

  await enqueue(true);
  await scan([
    doc({ version: 5, revision: 4, byte: "e" }),
    doc({ byte: "d", id: plateId, kind: "placa", name: "PLACA TESTE LVHF 08.pdf" }),
  ]);
  await processDoc(warning, "2028-11-18");
  const duplicateWarning = await current();
  assert.equal(duplicateWarning.availability, "verified");
  assert.equal(duplicateWarning.restriction.evidence, candidate.id);
  await enqueue(true);
  await scan([
    doc({ version: 6, revision: 5, byte: "f" }),
    doc({ byte: "d", id: plateId, kind: "placa", name: "PLACA TESTE LVHF 08.pdf" }),
  ]);
  await processDoc(warning, "2029-11-18");
  const disputed = await current();
  assert.equal(disputed.fields.due.value, "2028-11-18");
  assert.equal(disputed.fields.due.evidence, changedDocument.id);
  assert.equal(disputed.availability, "review");
  assert.equal(disputed.restriction.evidence, candidate.id);
  console.log(
    "PASS aviso equivalente sem nova pendência e data aprovada preservada em nova divergência",
  );
} finally {
  await sql.end();
  await control.unsafe("drop database " + database + " with (force)");
  await control.end();
}
