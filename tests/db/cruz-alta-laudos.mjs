import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
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

async function registerLayout(revision, hash, rows, user = null) {
  await role(user, !user);
  return (
    await sql`select ca_inspecao_layout_conferido(${revision},${hash},${sql.json(rows)}) r`
  )[0].r;
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
  const beforeSeals = migrations.findIndex((entry) =>
    entry.path.endsWith("/0087_ca_inspecao_lacres.sql"),
  );
  assert.ok(beforeSeals > 0);
  await applyMigrations(sql, migrations.slice(0, beforeSeals));
  assert.equal((await current()).seal, undefined);
  await role();
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

  const layout = [
    { code: "08", description: "Descrição sintética da linha de teste", seal: "00421" },
    { code: "11", description: "Descrição sintética sem laudo", seal: "00428 / 00426" },
  ];
  const layoutHash = "1".repeat(64);
  await deny(() => registerLayout(56, layoutHash, layout, users.reviewer), "42501");
  assert.equal((await registerLayout(56, layoutHash, layout)).state, "adopted");
  assert.equal((await registerLayout(56, layoutHash, [...layout].reverse())).state, "same");
  await deny(() => registerLayout(56, layoutHash, [layout[0]]), "23514");
  const noReport = (await summary(users.viewer, "lvhf-11")).items[0];
  assert.equal(noReport.description, layout[1].description);
  assert.deepEqual(noReport.seal, {
    value: layout[1].seal,
    page: 1,
    revision: 56,
    source: "layout",
  });
  assert.equal(noReport.documents.length, 0);
  const competing = [
    { ...layout[0], seal: "72345" },
    { ...layout[1], description: "Outra descrição sintética" },
  ];
  assert.equal((await registerLayout(56, "2".repeat(64), competing)).state, "conflict");
  assert.equal((await current()).seal.value, layout[0].seal);
  assert.equal((await current()).layoutConflict, true);
  assert.equal((await registerLayout(55, "3".repeat(64), competing)).state, "historical");
  assert.equal((await registerLayout(57, "4".repeat(64), layout)).state, "adopted");
  assert.equal((await current()).layoutConflict, false);
  console.log("PASS layout privado sem laudo, repetição e conflito preservam revisão conferida");

  await enqueue();
  await scan([doc()]);
  const pdfSeal = { value: "00983", page: 3, label: "Lacre de teste" };
  await processDoc(warning, "2027-11-18", { seal: pdfSeal });
  const first = await current();
  assert.equal(first.fields.due.value, "2027-11-18");
  assert.equal(first.restriction, null);
  assert.equal(first.availability, "review");
  assert.deepEqual(first.documents[0].restriction, warning);
  assert.deepEqual(first.documents[0].fields.seal, pdfSeal);
  assert.equal(first.seal.value, layout[0].seal);
  assert.equal(first.fields.seal, undefined);
  assert.equal((await current(users.viewer)).documents[0].restriction, undefined);
  assert.equal((await current(users.viewer)).documents[0].fields, undefined);
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
  const approved = await review(first, first.documents[0].id, "adopt", { adopt: ["seal"] });
  assert.equal(approved.restriction.text, warning.text);
  assert.equal(approved.status, "restricted");
  assert.equal(approved.seal.value, pdfSeal.value);
  assert.equal(approved.seal.page, pdfSeal.page);
  assert.equal(approved.seal.source, "pdf");
  assert.equal(approved.seal.evidence, first.documents[0].id);
  assert.equal(approved.layoutSeal.value, layout[0].seal);
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

  const layoutFolder = "test-root-layout";
  const newRows = [
    { ...layout[1], description: "Descrição da próxima revisão privada", seal: "00387" },
  ];
  const newHash = "5".repeat(64);
  await role(null, true);
  await sql`select ca_inspecao_sync_start(${sql.json([{ folderId: layoutFolder, kind: "layout" }])})`;
  await scan([
    {
      ...doc({ id: "test-layout-00", kind: "layout", name: "Layout TESTE.pdf", byte: "5" }),
      parents: [layoutFolder],
      code: null,
      revision: null,
    },
  ]);
  const layoutJob = await job();
  assert.equal(layoutJob.kind, "process");
  assert.equal(
    (
      await finish(layoutJob, {
        kind: "process",
        status: "ready",
        sha256: null,
        size: null,
        itemKeys: ["unidade"],
        fields: {},
        restriction: null,
        issues: [],
        pages: 0,
        layout: { revision: 58, sha256: newHash, rows: newRows },
      })
    ).state,
    "completed",
  );
  const automaticallyUpdated = (await summary(users.viewer, "lvhf-11")).items[0];
  assert.equal(automaticallyUpdated.description, newRows[0].description);
  assert.equal(automaticallyUpdated.seal.value, newRows[0].seal);
  assert.equal(automaticallyUpdated.seal.revision, 58);
  assert.equal((await current()).seal.evidence, first.documents[0].id);
  console.log("PASS atualização automática do layout e preservação do lacre decidido no PDF");

  const setupEmail = "laudos-fixture@local-fixture.iam.gserviceaccount.com";
  const fakeKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const fixture = {
    type: "service_account",
    client_email: setupEmail,
    private_key: fakeKey,
    private_key_id: "test-fixture-kid",
    token_uri: "https://fixture.invalid/",
  };
  const issue = async () =>
    (await sql`select ca_inspecao_drive_setup_emitir(${setupEmail}) r`)[0].r;
  const install = async (token, payload) =>
    (await sql`select ca_inspecao_drive_setup_concluir(${token},${sql.json(payload)}) r`)[0].r;
  const readWorker = async (id, leaseId) =>
    (await sql`select ca_inspecao_drive_worker_secret(${id},${leaseId}) r`)[0].r;
  await role();
  await deny(issue, "55000");

  // O cluster descartável simula a interface do Vault. A extensão de produção cifra os valores.
  await sql.unsafe(`create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),
      name text unique not null, secret text not null, description text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text,new_name text,new_description text,new_key_id uuid)
    returns uuid language sql as $vault$
      insert into vault.secrets(name,secret,description) values(new_name,new_secret,new_description) returning id
    $vault$;`);

  await role(users.reviewer);
  await deny(issue, "42501");
  await deny(() => install("a".repeat(64), fixture), "42501");
  await deny(() => readWorker(randomUUID(), randomUUID()), "42501");
  await role(null, true);
  await deny(issue, "42501");
  await role();
  const superseded = await issue();
  const expired = await issue();
  assert.match(expired.token, /^[a-f0-9]{64}$/);
  const timeRemaining = Date.parse(expired.expiresAt) - Date.now();
  assert.ok(timeRemaining > 590000 && timeRemaining <= 600000);
  assert.equal((await sql`select count(*)::int n from ca_inspecao_drive_convites`)[0].n, 1);
  assert.equal(
    (
      await sql`select hash=encode(sha256(convert_to(${expired.token},'UTF8')),'hex') match
    from ca_inspecao_drive_convites`
    )[0].match,
    true,
  );
  await sql`update ca_inspecao_drive_convites set expira_em=now()-interval '1 second'`;
  await role(null, true);
  assert.equal(await install(expired.token, fixture), false);
  assert.equal(await install(superseded.token, fixture), false);
  await role();
  const invitation = await issue();
  await role(null, true);
  assert.equal(
    await install(invitation.token, {
      ...fixture,
      client_email: "outro@fixture.iam.gserviceaccount.com",
    }),
    false,
  );
  assert.equal(await install(invitation.token, { ...fixture, private_key: "invalida" }), false);
  assert.equal(await install(invitation.token, fixture), true);
  assert.equal(await install(invitation.token, fixture), false);
  assert.equal(await readWorker(randomUUID(), randomUUID()), null);
  await role();
  await deny(issue, "PT409");
  assert.equal((await sql`select count(*)::int n from ca_inspecao_drive_convites`)[0].n, 0);
  assert.equal((await sql`select count(*)::int n from vault.secrets`)[0].n, 1);
  console.log("PASS convite vinculado à conta, expirável, uso único e cadastro sem sobrescrita");

  const setupBatch = (
    await sql`insert into ca_inspecao_lotes(raiz) values(${layoutFolder}) returning id`
  )[0].id;
  await sql`insert into ca_inspecao_trabalhos(lote_id,tipo,chave,payload)
    values(${setupBatch},'scan',${layoutFolder},${sql.json({ folderId: layoutFolder, kind: "layout", ancestorNames: [] })})`;
  const setupJob = await job();
  assert.equal(await readWorker(setupJob.id, randomUUID()), null);
  const credential = await readWorker(setupJob.id, setupJob.lease);
  assert.equal(credential.client_email, setupEmail);
  assert.ok(credential.private_key === fakeKey.trim());
  assert.equal(credential.token_uri, undefined);
  await finish(setupJob, { kind: "scan", children: [], nextPageToken: null });
  assert.equal(await readWorker(setupJob.id, setupJob.lease), null);
  console.log("PASS leitura da credencial isolada ao trabalho com lease vigente");

  const rdoRoot = "pasta-teste-raiz-rdo";
  const rdoPublishedId = "pasta-teste-filial-lancadas";
  const rdoScanJob = { folderId: rdoRoot, kind: "rdo", ancestorNames: [], rdoPublishedId };
  const rdoSummary = async (user = users.reviewer, scope = "unidade") => {
    await role(user);
    return (await sql`select ca_inspecao_rdo_summary(${org},${scope}) r`)[0].r;
  };
  const rdoRegister = async (root = rdoRoot, published = rdoPublishedId) =>
    (await sql`select ca_inspecao_rdo_registrar(${root},${published}) r`)[0].r;
  const rdoCredential = async (folder) =>
    (await sql`select ca_inspecao_rdo_credencial(${folder}) r`)[0].r;
  const rdoOrigin = async (folderIds) =>
    (await sql`select ca_inspecao_rdo_origem(${folderIds}::text[]) r`)[0].r;
  const rdoStatus = async () => {
    await role(users.reviewer);
    return (await sql`select ca_inspecao_sync_status(${org}) r`)[0].r;
  };
  const rdoRefresh = async () => {
    await role();
    await sql`update ca_inspecao_lotes set criado_em=now()-interval '16 minutes' where raiz=${rdoRoot}`;
    await role(null, true);
    assert.equal((await rdoRegister()).queued, 1);
    const pending = await job();
    assert.deepEqual(pending.scan, rdoScanJob);
    return pending;
  };
  const rdoScan = (folders) => ({ kind: "scan", rdoFolders: folders });

  await role();
  assert.equal(
    (await sql`select count(*)::int n from ca_inspecao_raizes where tipo='rdo'`)[0].n,
    0,
  );
  // A fila e o estado dos laudos usam a interface local simulada do Vault e pg_net.
  await sql`insert into vault.secrets(name,secret)
    values('nexus_ca_inspecao_worker_url','https://nexusgestao.app/api/public/cruz-alta/inspection-worker')`;
  await sql.unsafe(`create schema net;
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds integer default 1000)
    returns bigint language sql as $$select 42::bigint$$;`);
  await sql`insert into ca_inspecao_lotes(raiz,terminou_em,estado)
    select drive_id,clock_timestamp(),'concluido' from ca_inspecao_raizes`;
  const originalStatus = await rdoStatus();
  assert.equal(originalStatus.state, "verified");

  assert.deepEqual(await rdoSummary(), []);
  await deny(rdoRegister, "42501");
  await deny(() => rdoSummary(users.outsider), "42501");
  await deny(() => rdoSummary(users.reviewer, "lvhf-inexistente"), "42501");
  await role();
  await sql.unsafe("set role anon");
  await deny(() => sql`select ca_inspecao_rdo_summary(${org},'unidade')`, "42501");
  await role(null, true);
  await deny(() => sql`select * from ca_inspecao_rdo_acervo`, "42501");
  await deny(() => rdoRegister(rdoRoot, rdoRoot), "23514");
  await deny(() => rdoRegister(folderId, rdoPublishedId), "PT409");
  assert.equal((await rdoRegister()).queued, 1);
  assert.equal((await rdoRegister()).queued, 0);
  await deny(() => rdoRegister(rdoRoot, "pasta-teste-troca"), "PT409");
  await deny(() => rdoRegister("pasta-teste-nova-raiz", rdoPublishedId), "PT409");
  const firstRdo = await job();
  assert.deepEqual(firstRdo.scan, rdoScanJob);

  await role();
  const codes = await sql`select codigo from nr_cena_elementos
    where cena='tres-tentos-cruz-alta' and tipo='lvhf' and situacao is distinct from 'Retirada'
    order by codigo`;
  assert.equal(codes.length, 74);
  const folders = codes.map(({ codigo: code }) => ({
    id: "pasta-teste-" + code.replace(".", "-"),
    code,
    name: code === "28.1" ? "28,01\u00a0‒\u202fObra de teste" : code + " - Obra de teste",
    category: "montagem",
  }));
  const launched = {
    id: "pasta-teste-lancada-08",
    code: "08",
    name: "8 - Pasta conferida",
    category: "lancada",
    resourceKey: "0-chave-de-teste",
  };
  assert.equal((await finish(firstRdo, rdoScan(folders), randomUUID())).state, "obsolete");
  await deny(() => finish(firstRdo, rdoScan([...folders, folders[0]])), "23514");
  await deny(() => finish(firstRdo, rdoScan([{ ...launched, id: rdoPublishedId }])), "23514");
  await deny(
    () => finish(firstRdo, rdoScan([{ ...folders[0], code: "29.2", name: "29.2 - Retirada" }])),
    "23514",
  );
  await deny(
    () => finish(firstRdo, rdoScan([{ ...launched, name: "08.1 - Outra linha" }])),
    "23514",
  );
  assert.equal((await finish(firstRdo, rdoScan([...folders, launched]))).state, "completed");
  assert.equal((await rdoSummary()).length, 75);
  assert.deepEqual(await rdoSummary(users.reviewer, "lvhf-08"), [
    launched,
    folders.find((folder) => folder.code === "08"),
  ]);
  assert.deepEqual(await rdoSummary(users.reviewer, "cobertura-28.1"), [
    folders.find((folder) => folder.code === "28.1"),
  ]);
  assert.deepEqual(
    await rdoSummary(users.viewer, "lvhf-08"),
    await rdoSummary(users.reviewer, "lvhf-08"),
  );
  await role();
  await sql`update nr_cena_consultores set permite_original=false
    where organization_id=${org} and unidade_id=${unit} and usuario_id=${users.viewer}`;
  assert.deepEqual(await rdoSummary(users.viewer), []);
  console.log("PASS cadastro idempotente, 74 identidades ativas e acesso a originais por escopo");

  await role(users.reviewer);
  await deny(() => rdoCredential(launched.id), "42501");
  await deny(() => rdoOrigin([launched.id]), "42501");
  await role();
  await sql.unsafe("set role anon");
  await deny(() => rdoCredential(launched.id), "42501");
  await deny(() => rdoOrigin([launched.id]), "42501");
  await role(null, true);
  await deny(() => rdoCredential(null), "42501");
  await deny(() => rdoCredential(launched.id + "-nao-indexada"), "42501");
  await deny(() => rdoCredential(rdoPublishedId), "42501");
  assert.deepEqual(JSON.parse(await rdoCredential(launched.id)), credential);
  await deny(() => rdoOrigin(null), "42501");
  await deny(() => rdoOrigin([]), "42501");
  await deny(() => rdoOrigin([launched.id, launched.id]), "42501");
  await deny(() => rdoOrigin([launched.id, null]), "42501");
  await deny(() => rdoOrigin([launched.id, "id inválido"]), "42501");
  await deny(() => rdoOrigin([launched.id, "pasta-teste-nao-cadastrada"]), "42501");
  await deny(() => rdoOrigin([rdoRoot, rdoPublishedId]), "42501");
  const origin = await rdoOrigin([launched.id, folders[0].id]);
  assert.deepEqual(JSON.parse(origin.credential), credential);
  assert.deepEqual(origin.folders, [
    { id: launched.id, parentId: rdoPublishedId, rootId: rdoRoot },
    { id: folders[0].id, parentId: rdoRoot, rootId: rdoRoot },
  ]);
  await role();
  await sql`update nr_cenas_unidade set estado='rascunho' where organization_id=${org} and unidade_id=${unit}`;
  await role(null, true);
  await deny(() => rdoCredential(launched.id), "42501");
  await deny(() => rdoOrigin([launched.id]), "42501");
  await role();
  await sql`update nr_cenas_unidade set estado='publicada' where organization_id=${org} and unidade_id=${unit}`;
  await sql`update vault.secrets set name='credencial-de-teste-indisponivel'
    where name='nexus_ca_inspecao_drive_service_account'`;
  await role(null, true);
  assert.equal(await rdoCredential(launched.id), null);
  assert.deepEqual(await rdoOrigin([launched.id]), {
    credential: null,
    folders: [{ id: launched.id, parentId: rdoPublishedId, rootId: rdoRoot }],
  });
  await role();
  await sql`update vault.secrets set name='nexus_ca_inspecao_drive_service_account'
    where name='credencial-de-teste-indisponivel'`;
  console.log("PASS credencial e origem exigem serviço, pastas exatas e unidade publicada");

  const failedRdo = await rdoRefresh();
  await deny(() => finish(failedRdo, { ...rdoScan([]), nextPageToken: "incompleto" }), "23514");
  assert.equal(
    (
      await sql`select ca_inspecao_sync_fail(${failedRdo.id},${failedRdo.lease},'pagina_incompleta',false) r`
    )[0].r.state,
    "failed",
  );
  assert.equal((await rdoSummary()).length, 75);
  assert.deepEqual(await rdoStatus(), originalStatus);
  const changedRdo = await rdoRefresh();
  const moved = { ...launched, category: "montagem" };
  assert.equal((await finish(failedRdo, rdoScan([]))).state, "obsolete");
  assert.equal((await finish(changedRdo, rdoScan([moved]))).state, "completed");
  assert.deepEqual(await rdoSummary(), [moved]);
  await role(null, true);
  await deny(() => rdoCredential(folders[0].id), "42501");
  await deny(() => rdoOrigin([moved.id, folders[0].id]), "42501");
  assert.deepEqual(JSON.parse(await rdoCredential(moved.id)), credential);
  assert.deepEqual((await rdoOrigin([moved.id])).folders, [
    { id: moved.id, parentId: rdoRoot, rootId: rdoRoot },
  ]);
  const emptyRdo = await rdoRefresh();
  assert.equal((await finish(emptyRdo, rdoScan([]))).state, "completed");
  assert.deepEqual(await rdoSummary(), []);
  await role(null, true);
  await deny(() => rdoCredential(moved.id), "42501");
  await deny(() => rdoOrigin([moved.id]), "42501");
  console.log(
    "PASS leitura completa substitui pastas removidas ou movidas, preserva a anterior em falhas e isola o estado dos laudos",
  );
} finally {
  await sql.end();
  await control.unsafe("drop database " + database + " with (force)");
  await control.end();
}
