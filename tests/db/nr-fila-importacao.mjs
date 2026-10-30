import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import postgres from "postgres";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("NR queue tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 5,
  prepare: false,
  onnotice: () => {},
});
const [org, otherOrg, engineer, reader, outsider] = Array.from({ length: 5 }, randomUUID);
const source = `isolated-queue-${randomUUID()}`,
  now = "2026-10-30T00:00:00.000Z";
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (error) => error.code === code);
  checks++;
};
const as = (user, fn, role = "authenticated") =>
  sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claim.sub',${user ?? ""},true)`;
    return fn(tx);
  });
const value = async (promise) => (await promise)[0].value;
const create = (total, key = randomUUID(), extras = {}, user = engineer, organization = org) =>
  as(user, (tx) =>
    value(
      tx`select public.nr_import_fila_criar(${organization},${extras.norma ?? "NR33"},${extras.origem ?? source},${key},${extras.inicio ?? now},${extras.fim ?? now},${tx.json(extras.manifesto ?? { versao: 1, fonte: "dados sintéticos isolados" })},${total})value`,
    ),
  );
const stage = (id, items, user = engineer, organization = org) =>
  as(user, (tx) =>
    value(tx`select public.nr_import_fila_staging(${organization},${id},${tx.json(items)})value`),
  );
const command = (id, action, user = engineer, organization = org) =>
  as(user, (tx) =>
    value(tx`select public.nr_import_fila_comandar(${organization},${id},${action})value`),
  );
const query = (id = null, page = 0, user = engineer, organization = org) =>
  as(user, (tx) =>
    value(tx`select public.nr_import_fila_consultar(${organization},${id},${page})value`),
  );
const work = (limit = 10) =>
  as(null, (tx) => value(tx`select public.nr_import_processar(${limit})value`), "service_role");
const item = (sequencia, tipo, externo_id, payload, destino) => ({
  sequencia,
  tipo,
  externo_id,
  payload,
  destino,
  sha256: digest(payload),
  capturado_em: now,
});
const sourceRow = async (tipo, externo_id) =>
  (
    await sql`select * from public.nr_fontes where organization_id=${org} and origem=${source} and tipo=${tipo} and externo_id=${externo_id}`
  )[0];
try {
  check(
    (await sql`select count(*)::int n from pg_extension where extname='pg_cron'`)[0].n,
    0,
    "this isolated suite deliberately does not claim pg_cron execution",
  );
  await sql`insert into auth.users(id,email)values(${engineer},'queue-eng@test.invalid'),(${reader},'queue-campo@test.invalid'),(${outsider},'queue-out@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Isolated queue organization'),(${otherOrg},'Isolated other queue organization')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${reader}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${reader},'campo'),(${otherOrg},${outsider},'engenharia')`;
  const key = randomUUID(),
    queue = await create(4, key);
  check(queue.estado, "preparando");
  check(queue.manifesto, undefined, "summary does not expose raw manifest");
  check((await create(4, key)).id, queue.id, "header replay preserves queue identity");
  await reject(() => create(3, key), "23505");
  await reject(() => create(4, key, { fim: "2026-10-30T00:00:01Z" }), "23505");
  await reject(() => create(4, key, { manifesto: { versao: 2 } }), "23505");
  await reject(() => create(1, randomUUID(), {}, reader), "42501");
  await reject(() => query(queue.id, 0, outsider), "42501");
  await reject(() => stage(queue.id, [], reader), "42501");
  await reject(() => create(1, randomUUID(), {}, engineer, otherOrg), "42501");
  await reject(() => as(engineer, (tx) => tx`select public.nr_import_processar(1)`), "42501");
  await reject(
    () => as(null, (tx) => tx`select public.nr_import_fila_consultar(${org})`, "anon"),
    "42501",
  );
  await reject(
    () =>
      as(engineer, (tx) => tx`insert into public.nr_import_filas(organization_id)values(${org})`),
    "42501",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`update public.nr_import_fila_itens set payload='{}' where organization_id=${org}`,
      ),
    "42501",
  );
  check(
    (
      await as(
        outsider,
        (tx) => tx`select count(*)::int n from public.nr_import_filas where organization_id=${org}`,
      )
    )[0].n,
    0,
    "direct RLS rejects other organization",
  );
  check(
    (
      await as(
        reader,
        (tx) => tx`select count(*)::int n from public.nr_import_filas where organization_id=${org}`,
      )
    )[0].n,
    0,
    "direct RLS rejects non-admin role",
  );
  const clientItem = item(
    1,
    "cliente",
    "client-1",
    { nome: "Cliente fonte sintético" },
    { entidade: "clientes", registro: { razao_social: "Cliente fonte sintético" } },
  );
  const unitItem = item(
    2,
    "unidade",
    "unit-1",
    { nome: "Unidade fonte sintética" },
    {
      entidade: "unidades",
      registro: { nome: "Unidade fonte sintética" },
      dependencias: { cliente_id: { tipo: "cliente", externo_id: "client-1" } },
    },
  );
  const localPayload = { codigo: "EC 13A", titulo: "Nome confirmado na fonte", versao: 1 };
  const localItem = item(3, "local", "unit-1:EC 13A", localPayload, {
    entidade: "locais",
    registro: {
      titulo: "Nome confirmado na fonte",
      tag: "EC 13A",
      aliases: ["61 EFGHIJ"],
      normas: ["NR33"],
    },
    dependencias: {
      cliente_id: { tipo: "cliente", externo_id: "client-1" },
      unidade_id: { tipo: "unidade", externo_id: "unit-1" },
    },
  });
  const documentItem = item(
    4,
    "documento",
    "unit-1:document-1",
    {
      titulo: "Documento histórico",
      texto: "Texto preservado",
      autor: "Autor histórico declarado",
    },
    {
      entidade: "documentos",
      registro: {
        titulo: "Documento histórico",
        normas: ["NR33"],
        estado: "emitido_origem",
        recebimento: "referencia",
      },
      dependencias: {
        cliente_id: { tipo: "cliente", externo_id: "client-1" },
        unidade_id: { tipo: "unidade", externo_id: "unit-1" },
        local_id: { tipo: "local", externo_id: "unit-1:EC 13A" },
      },
      revisao: {
        numero: 3,
        conteudo: {
          schema_version: 1,
          blocos: [{ id: "p", tipo: "paragrafo", texto: "Texto preservado" }],
        },
      },
      autor_historico: "Autor histórico declarado",
    },
  );
  check((await stage(queue.id, [clientItem])).recebidos, 1);
  check(
    (await stage(queue.id, [clientItem])).recebidos,
    1,
    "partial staging retry does not duplicate",
  );
  await reject(() => command(queue.id, "iniciar"), "23514");
  await reject(
    () => stage(queue.id, [{ ...clientItem, payload: { nome: "Conteúdo alterado" } }]),
    "23505",
  );
  await reject(
    () => stage(queue.id, [{ ...unitItem, destino: { entidade: "arquivos", registro: {} } }]),
    "23514",
  );
  check((await query(queue.id)).recebidos, 1, "failed staging step rolls back");
  check((await stage(queue.id, [unitItem, localItem, documentItem])).recebidos, 4);
  check((await command(queue.id, "iniciar")).estado, "fila");
  check((await command(queue.id, "iniciar")).estado, "fila", "starting again is idempotent");
  const before = await query(queue.id);
  check(before.agendador_ativo, false, "isolated UI reports absent scheduler honestly");
  await reject(() => stage(queue.id, [clientItem]), "23514");
  const staging = (
    await sql`select sha256,sha256_origem,staging_sha256,public.pet_sha256(payload)expected from public.nr_import_fila_itens where fila_id=${queue.id} and sequencia=1`
  )[0];
  check(
    staging.sha256,
    staging.expected,
    "effective source hash derives from actual staged payload",
  );
  check(staging.sha256_origem, clientItem.sha256, "declared source digest is preserved separately");
  check(
    staging.sha256 !== staging.sha256_origem,
    true,
    "SQL JSONB and historical JS digests are distinct in this fixture",
  );
  const interrupted = new Error("simulate terminated transaction");
  await assert.rejects(
    () =>
      sql.begin(async (tx) => {
        await tx`select public.nr_import_processar(1)`;
        throw interrupted;
      }),
    (error) => error === interrupted,
  );
  checks++;
  check(
    (await query(queue.id)).processados,
    0,
    "interrupted transaction leaves resumable checkpoint",
  );
  check(
    (await sql`select count(*)::int n from public.clientes where organization_id=${org}`)[0].n,
    0,
    "interruption rolls back destination and progress together",
  );
  check((await work(1)).processados, 1, "worker limit is bounded");
  check((await query(queue.id)).processados, 1, "progress survives another authenticated session");
  check((await work(1)).processados, 1);
  check((await work(1)).processados, 1);
  check((await work(1)).processados, 1);
  const complete = await query(queue.id);
  check(complete.fila.estado, "concluido");
  check(complete.processados, 4);
  check((await work(1)).processados, 0, "completed queue is not executed again");
  check(
    (
      await sql`select count(*)::int n from public.nr_import_itens where lote_id=${queue.lote_id}`
    )[0].n,
    4,
  );
  check(
    (await sql`select count(*)::int n from public.nr_arquivos where organization_id=${org}`)[0].n,
    0,
    "document links never claim physical bytes",
  );
  const localSource = await sourceRow("local", "unit-1:EC 13A"),
    clientSource = await sourceRow("cliente", "client-1"),
    unitSource = await sourceRow("unidade", "unit-1");
  check(
    (await sql`select aliases from public.nr_locais where id=${localSource.destino_id}`)[0].aliases,
    ["61 EFGHIJ"],
  );
  const docSource = await sourceRow("documento", "unit-1:document-1");
  check(
    (await sql`select estado from public.nr_documentos where id=${docSource.destino_id}`)[0].estado,
    "emitido_origem",
  );
  check(
    (
      await sql`select created_by,autor_historico from public.nr_documento_revisoes where documento_id=${docSource.destino_id}`
    )[0],
    { created_by: null, autor_historico: "Autor histórico declarado" },
    "historical authors are not fabricated Auth users",
  );
  const ctx = {
    cliente_id: clientSource.destino_id,
    unidade_id: unitSource.destino_id,
    normas: ["NR33"],
  };
  const version = (
    await sql`select version from public.nr_locais where id=${localSource.destino_id}`
  )[0].version;
  await as(
    engineer,
    (tx) =>
      tx`select public.nr_executar(${org},'NR33','locais','salvar',${localSource.destino_id},${version},${randomUUID()},${tx.json({ titulo: "Edição posterior no Nexus" })})`,
  );
  await sql`update public.nr_fontes set sha256=${digest(localPayload)} where id=${localSource.id}`;
  const editedVersion = (
    await sql`select version from public.nr_locais where id=${localSource.destino_id}`
  )[0].version;
  const same = await create(1);
  await stage(same.id, [{ ...localItem, sequencia: 1 }]);
  await command(same.id, "iniciar");
  await work(1);
  check(
    (await query(same.id)).rows[0].resultado,
    "ja_existente",
    "equal legacy snapshot reuses historical JS hash without mutating the source version",
  );
  check(
    (await sql`select version from public.nr_locais where id=${localSource.destino_id}`)[0].version,
    editedVersion,
  );
  check(
    (await sourceRow("local", "unit-1:EC 13A")).sha256,
    digest(localPayload),
    "legacy hash remains unchanged",
  );
  const conflict = await create(1),
    changed = {
      ...localItem,
      sequencia: 1,
      payload: { ...localPayload, versao: 2, titulo: "Fonte também mudou" },
      sha256: digest(localPayload),
      destino: {
        ...localItem.destino,
        registro: { ...localItem.destino.registro, titulo: "Fonte também mudou" },
      },
    };
  await stage(conflict.id, [changed]);
  await command(conflict.id, "iniciar");
  await work(1);
  check(
    (await query(conflict.id)).rows[0].resultado,
    "conflito",
    "spoofing old declared hash cannot hide changed payload",
  );
  check((await query(conflict.id)).fila.estado, "com_pendencias");
  check(
    (await sql`select titulo from public.nr_locais where id=${localSource.destino_id}`)[0].titulo,
    "Edição posterior no Nexus",
    "three-way conflict never overwrites Nexus edits",
  );
  await reject(() => command(conflict.id, "retomar"), "23514");
  const dependent = await create(2),
    unresolvedItem = item(
      1,
      "local",
      "dependency-child",
      { nome: "Local dependente" },
      {
        entidade: "locais",
        registro: { ...ctx, titulo: "Local dependente", unidade_id: undefined },
        dependencias: { unidade_id: { tipo: "unidade", externo_id: "future-unit" } },
      },
    );
  const futureUnit = item(
    2,
    "unidade",
    "future-unit",
    { nome: "Unidade dependência" },
    {
      entidade: "unidades",
      registro: { cliente_id: clientSource.destino_id, nome: "Unidade dependência" },
    },
  );
  await stage(dependent.id, [unresolvedItem, futureUnit]);
  await command(dependent.id, "iniciar");
  await work(2);
  check((await query(dependent.id)).erros, 1);
  check(
    (await sql`select resumo from public.nr_import_lotes where id=${dependent.lote_id}`)[0].resumo,
    { erro: 1, importado: 1 },
    "dependency failure is reconciled in the durable item ledger",
  );
  await command(dependent.id, "retomar");
  await work(1);
  check(
    (await query(dependent.id)).fila.estado,
    "concluido",
    "dependency can resume after its confirmed parent exists",
  );
  check((await query(dependent.id)).rows[0].tentativas, 2);
  const failing = await create(1),
    bad = item(
      1,
      "local",
      "permanent-error",
      { nome: "Dado inválido" },
      {
        entidade: "locais",
        registro: { ...ctx, unidade_id: randomUUID(), titulo: "Local inválido" },
      },
    );
  await stage(failing.id, [bad]);
  await command(failing.id, "iniciar");
  for (let attempt = 1; attempt <= 10; attempt++) {
    await work(1);
    check((await query(failing.id)).rows[0].tentativas, attempt);
    if (attempt < 10) await command(failing.id, "retomar");
  }
  await reject(() => command(failing.id, "retomar"), "23514");
  check((await query(failing.id)).fila.estado, "com_pendencias");
  const reference = await create(1);
  await stage(reference.id, [
    item(
      1,
      "referencia",
      "missing-original",
      { url: "https://example.invalid/original.pdf" },
      {
        entidade: "referencias",
        registro: {},
        motivo: "Original não obtido; bytes não verificados",
      },
    ),
  ]);
  await command(reference.id, "iniciar");
  await work(1);
  check((await query(reference.id)).rows[0].resultado, "sem_correspondencia");
  check(
    (await sql`select count(*)::int n from public.nr_arquivos where organization_id=${org}`)[0].n,
    0,
  );
  const normMismatch = await create(1);
  await stage(normMismatch.id, [
    item(
      1,
      "local",
      "wrong-norma",
      { nome: "Outra norma" },
      { entidade: "locais", registro: { ...ctx, titulo: "Outra norma", normas: ["NR35"] } },
    ),
  ]);
  await command(normMismatch.id, "iniciar");
  await work(1);
  check(
    (await query(normMismatch.id)).rows[0].resultado,
    "erro",
    "declared batch context cannot silently target another norm",
  );
  const revoked = await create(1);
  await stage(revoked.id, [
    item(
      1,
      "referencia",
      "revoked-original",
      { url: "https://example.invalid/file" },
      { entidade: "referencias", registro: {} },
    ),
  ]);
  await command(revoked.id, "iniciar");
  const lock = await sql.reserve();
  try {
    await lock.unsafe("begin");
    await lock`select pg_advisory_xact_lock(hashtextextended('nexus-admin:'||${org}::text,0))`;
    await lock`delete from public.user_roles where organization_id=${org} and user_id=${engineer} and role='engenharia'`;
    const processing = work(1);
    let blocked = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      blocked = (
        await sql`select exists(select 1 from pg_stat_activity where wait_event='advisory'and query like '%nr_import_processar%')v`
      )[0].v;
      if (blocked) break;
    }
    check(blocked, true, "worker waits for the same authorization lock as concurrent revocation");
    await lock.unsafe("commit");
    await processing;
  } finally {
    await lock.unsafe("rollback");
    lock.release();
  }
  check(
    (await sql`select estado from public.nr_import_filas where id=${revoked.id}`)[0].estado,
    "pausado",
    "committed role revocation blocks work before destination effects",
  );
  check(
    (
      await sql`select count(*)::int n from public.nr_fontes where organization_id=${org} and externo_id='revoked-original'`
    )[0].n,
    0,
  );
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia')`;
  await command(revoked.id, "retomar");
  await work(1);
  check((await query(revoked.id)).rows[0].resultado, "sem_correspondencia");
  const cancellation = await create(2);
  await stage(cancellation.id, [
    item(
      1,
      "referencia",
      "cancel-1",
      { texto: "Preservar staging" },
      { entidade: "referencias", registro: {} },
    ),
    item(
      2,
      "referencia",
      "cancel-2",
      { texto: "Sem execução" },
      { entidade: "referencias", registro: {} },
    ),
  ]);
  await command(cancellation.id, "iniciar");
  check((await command(cancellation.id, "cancelar")).estado, "cancelado");
  check((await command(cancellation.id, "cancelar")).estado, "cancelado");
  check(
    (
      await sql`select count(*)::int n from public.nr_import_fila_itens where fila_id=${cancellation.id}`
    )[0].n,
    2,
    "cancellation retains private payloads",
  );
  check(
    (
      await sql`select estado,checkpoint->>'fila_cancelada'cancelado from public.nr_import_lotes where id=${cancellation.lote_id}`
    )[0],
    { estado: "com_pendencias", cancelado: "true" },
  );
  check((await work(1)).processados, 0);
  await reject(() => command(cancellation.id, "retomar"), "23514");
  const large = await create(26);
  await reject(
    () =>
      stage(
        large.id,
        Array.from({ length: 26 }, (_, i) => ({
          ...clientItem,
          sequencia: i + 1,
          externo_id: `large-${i}`,
        })),
      ),
    "23514",
  );
  await reject(
    () => stage(large.id, [{ ...clientItem, payload: { texto: "X".repeat(2_000_001) } }]),
    "23514",
  );
  check((await query(large.id)).recebidos, 0);
  await command(large.id, "cancelar");
  await reject(() => work(null), "23514");
  await reject(() => work(0), "23514");
  await reject(() => work(26), "23514");
  const legacyKey = randomUUID();
  await sql`select public.nr_iniciar_importacao(${org},${source},${legacyKey},${now},${now},'{}')`;
  await reject(() => create(1, legacyKey, { manifesto: {} }), "23505");
  const mutex = await sql.reserve();
  try {
    await mutex.unsafe("begin");
    await mutex`select pg_advisory_xact_lock(hashtextextended('nexus-nr-import-worker',0))`;
    check(
      await work(1),
      { ocupado: true, processados: 0 },
      "concurrent scheduler invocation cannot duplicate effects",
    );
  } finally {
    await mutex.unsafe("rollback");
    mutex.release();
  }
  console.log(
    JSON.stringify({
      suite: "NR durable import queue PostgreSQL",
      assertions: checks,
      passed: true,
      scope:
        "isolated synthetic data; real RLS/RPC/transaction rollback/dependency retries/three-way conflict/role-lock concurrency; pg_cron intentionally absent, manual worker only; no Storage bytes claimed",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
