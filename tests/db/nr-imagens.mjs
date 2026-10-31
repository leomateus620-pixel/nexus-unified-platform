import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { testImageDispatch } from "./nr-imagem-dispatch.mjs";
import { testImageTickets } from "./nr-imagem-tickets.mjs";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Image tests require disposable loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  max: 3,
  onnotice: () => {},
});
const org = randomUUID(),
  other = randomUUID(),
  eng = randomUUID(),
  outsider = randomUUID(),
  client = randomUUID(),
  unit = randomUUID(),
  local = randomUUID();
let assertions = 0;
const as = (user, fn) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return fn(tx);
  });
const service = (fn) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    return fn(tx);
  });
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  assertions++;
};
try {
  await sql`insert into auth.users(id,email)values(${eng},'image-engineer@test.invalid'),(${outsider},'image-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Images isolated'),(${other},'Other images isolated')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${eng}),(${other},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${eng},'engenharia'),(${other},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Image isolated client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Image isolated unit')`;
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tipo)values(${local},${org},${client},${unit},array['NR33'],'Image isolated local','EC')`;
  const meta = {
    cliente_id: client,
    unidade_id: unit,
    normas: ["NR33"],
    local_id: local,
    nome: "campo.jpg",
    mime: "image/jpeg",
    tamanho: 100,
    sha256: "a".repeat(64),
    papel: "foto",
  };
  const file = (
    await as(
      eng,
      (tx) => tx`select public.nr_arquivo_preparar(${org},${randomUUID()},${tx.json(meta)}) r`,
    )
  )[0].r;
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${sql.json({ size: meta.tamanho, mimetype: meta.mime })})`;
  await service(
    (tx) =>
      tx`select public.nr_arquivo_confirmar(${org},${file.id},${eng},${file.sha256},${file.tamanho},${file.mime})`,
  );
  // Simulate pre0058 rows alongside the new processor; the legacy worker must keep its queue.
  await sql`insert into public.nr_imagem_representacoes(organization_id,arquivo_id,original_sha256,variante,processador)
    select ${org},${file.id},${file.sha256},v,'nexus-pillow-v1'
    from unnest(array['miniatura_384','previa_768'])v`;
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_imagem_representacoes where arquivo_id=${file.id}`
    )[0].n,
    4,
  );
  assertions++;
  await reject(() => as(eng, (tx) => tx`select public.nr_imagem_trabalho_obter(1)`), "42501");
  await reject(() => service((tx) => tx`select public.nr_imagem_trabalho_obter(null)`), "23514");
  await reject(
    () =>
      as(
        outsider,
        (tx) => tx`select public.nr_imagem_representacao_ler(${org},${file.id},'miniatura_384')`,
      ),
    "42501",
  );
  const pending = (
    await as(
      eng,
      (tx) => tx`select public.nr_imagem_representacao_ler(${org},${file.id},'miniatura_384') r`,
    )
  )[0].r;
  assert.equal(pending.estado, "fila");
  assert.equal("lease" in pending, false);
  assertions += 2;
  const jobs = (await service((tx) => tx`select public.nr_imagem_trabalho_obter(3) r`))[0].r;
  assert.equal(jobs.length, 2);
  assertions++;
  assert.equal(
    (await service((tx) => tx`select public.nr_imagem_trabalho_obter(1) r`))[0].r.length,
    0,
  );
  assertions++;
  const thumb = jobs.find((j) => j.variante === "miniatura_384");
  const result = {
    estado: "disponivel",
    mime: "image/webp",
    tamanho: 25,
    largura: 200,
    altura: 384,
    sha256: "b".repeat(64),
  };
  await reject(
    () =>
      service(
        (tx) =>
          tx`select public.nr_imagem_trabalho_concluir(${thumb.id},${randomUUID()},${tx.json(result)})`,
      ),
    "40001",
  );
  await reject(
    () =>
      service(
        (tx) =>
          tx`select public.nr_imagem_trabalho_concluir(${thumb.id},${thumb.lease},${tx.json({ ...result, largura: 500 })})`,
      ),
    "23514",
  );
  await service(
    (tx) =>
      tx`select public.nr_imagem_trabalho_concluir(${thumb.id},${thumb.lease},${tx.json(result)})`,
  );
  await reject(
    () =>
      service(
        (tx) =>
          tx`select public.nr_imagem_trabalho_concluir(${thumb.id},${thumb.lease},${tx.json(result)})`,
      ),
    "40001",
  );
  const ready = (
    await as(
      eng,
      (tx) => tx`select public.nr_imagem_representacao_ler(${org},${file.id},'miniatura_384') r`,
    )
  )[0].r;
  assert.equal(ready.estado, "disponivel");
  assert.equal(ready.sha256, result.sha256);
  assertions += 2;
  await sql`insert into storage.objects(bucket_id,name)values('nexus-nr-acervo',${ready.caminho})`;
  assert.equal(
    (
      await as(
        eng,
        (tx) => tx`select count(*)::int n from storage.objects where name=${ready.caminho}`,
      )
    )[0].n,
    1,
  );
  assertions++;
  assert.equal(
    (
      await as(
        outsider,
        (tx) => tx`select count(*)::int n from storage.objects where name=${ready.caminho}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  const previewJob = jobs.find((job) => job.variante === "previa_768");
  await sql`update public.nr_imagem_representacoes set tentativas=3,lease_ate=clock_timestamp()+interval '5 minutes' where id=${previewJob.id}`;
  assert.equal(
    (await service((tx) => tx`select public.nr_imagem_trabalho_obter(1) r`))[0].r.length,
    0,
  );
  const activeLease = (
    await sql`select estado,lease,tentativas from public.nr_imagem_representacoes where id=${previewJob.id}`
  )[0];
  assert.equal(activeLease.estado, "processando");
  assert.equal(activeLease.lease, previewJob.lease);
  assert.equal(activeLease.tentativas, 3);
  assertions += 4;
  await sql`update public.nr_imagem_representacoes set lease_ate=clock_timestamp()-interval '1 second' where id=${previewJob.id}`;
  assert.equal(
    (await service((tx) => tx`select public.nr_imagem_trabalho_obter(1) r`))[0].r.length,
    0,
  );
  const exhausted = (
    await sql`select estado,lease,lease_ate,tentativas,erro from public.nr_imagem_representacoes where id=${previewJob.id}`
  )[0];
  assert.equal(exhausted.estado, "falhou");
  assert.equal(exhausted.lease, null);
  assert.equal(exhausted.lease_ate, null);
  assert.equal(exhausted.tentativas, 3);
  assert.equal(exhausted.erro, "Lease expirado após o limite de tentativas");
  assertions += 6;
  const oldLease = randomUUID();
  await sql`update public.nr_imagem_representacoes set estado='processando',tentativas=1,lease=${oldLease},lease_ate=clock_timestamp()-interval '1 second' where id=${previewJob.id}`;
  const resumed = (await service((tx) => tx`select public.nr_imagem_trabalho_obter(1) r`))[0].r;
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].id, previewJob.id);
  assert.equal(resumed[0].estado, "processando");
  assert.equal(resumed[0].tentativas, 2);
  assert.notEqual(resumed[0].lease, oldLease);
  assert.equal(resumed[0].original_sha256, file.sha256);
  assert.equal(
    (await sql`select estado from public.nr_imagem_representacoes where id=${thumb.id}`)[0].estado,
    "disponivel",
  );
  assertions += 7;
  const newJobsBefore =
    await sql`select id,estado,lease,lease_ate,tentativas,caminho from public.nr_imagem_representacoes
    where arquivo_id=${file.id} and processador='nexus-storage-transform-v1' order by id`;
  assert.equal(newJobsBefore.length, 2);
  assert.equal(
    newJobsBefore.every((job) => job.estado === "fila" && job.tentativas === 0),
    true,
  );
  assert.equal(
    newJobsBefore.every((job) => job.caminho.includes("/nexus-storage-transform-v1/")),
    true,
  );
  assert.equal(ready.caminho.includes("/nexus-pillow-v1/"), true);
  assertions += 4;
  await reject(
    () =>
      as(eng, (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1')`),
    "42501",
  );
  await reject(
    () => service((tx) => tx`select public.nr_imagem_trabalho_obter(1,'unknown-worker')`),
    "23514",
  );
  await reject(
    () =>
      service((tx) => tx`select public.nr_imagem_trabalho_obter(2,'nexus-storage-transform-v1')`),
    "23514",
  );
  await reject(
    () =>
      as(
        eng,
        (tx) => tx`select lease from public.nr_imagem_representacoes where arquivo_id=${file.id}`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        eng,
        (tx) =>
          tx`select tentativas from public.nr_imagem_representacoes where arquivo_id=${file.id}`,
      ),
    "42501",
  );
  const nativeJobs = [];
  for (let index = 0; index < 2; index++) {
    const claimed = (
      await service(
        (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
      )
    )[0].r;
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].processador, "nexus-storage-transform-v1");
    assert.equal(claimed[0].original_sha256, file.sha256);
    assert.equal(
      (
        await service(
          (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
        )
      )[0].r.length,
      0,
      "A second invocation cannot claim work while a native lease is active",
    );
    assertions += 4;
    await service(
      (tx) =>
        tx`select public.nr_imagem_trabalho_concluir(${claimed[0].id},${claimed[0].lease},${tx.json(result)})`,
    );
    nativeJobs.push(claimed[0]);
  }
  const nativeReady = (
    await as(
      eng,
      (tx) => tx`select public.nr_imagem_representacao_ler(${org},${file.id},'miniatura_384') r`,
    )
  )[0].r;
  assert.equal(nativeReady.processador, "nexus-storage-transform-v1");
  assert.equal(
    "tentativas" in nativeReady || "lease" in nativeReady || "erro" in nativeReady,
    false,
  );
  assert.equal(nativeReady.caminho.includes("/nexus-storage-transform-v1/"), true);
  assert.equal(
    (await sql`select lease from public.nr_imagem_representacoes where id=${previewJob.id}`)[0]
      .lease,
    resumed[0].lease,
  );
  assertions += 4;
  await sql`insert into storage.objects(bucket_id,name)values('nexus-nr-acervo',${nativeReady.caminho})`;
  assert.equal(
    (
      await as(
        eng,
        (tx) => tx`select count(*)::int n from storage.objects where name=${nativeReady.caminho}`,
      )
    )[0].n,
    1,
  );
  assert.equal(
    (
      await as(
        outsider,
        (tx) => tx`select count(*)::int n from storage.objects where name=${nativeReady.caminho}`,
      )
    )[0].n,
    0,
  );
  assertions += 2;
  const nativeSnapshot =
    await sql`select * from public.nr_imagem_representacoes where arquivo_id=${file.id} order by id`;
  await sql`update public.nr_arquivos set estado='vinculado',bytes_verificados=true where id=${file.id}`;
  assert.deepEqual(
    await sql`select * from public.nr_imagem_representacoes where arquivo_id=${file.id} order by id`,
    nativeSnapshot,
  );
  assertions++;
  await sql`insert into public.nr_imagem_representacoes(organization_id,arquivo_id,original_sha256,variante,processador)
    values(${org},${file.id},${"0".repeat(64)},'miniatura_384','nexus-storage-transform-v1')`;
  assert.equal(
    (
      await service(
        (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
      )
    )[0].r.length,
    0,
  );
  assert.equal(
    (
      await as(
        eng,
        (tx) => tx`select public.nr_imagem_representacao_ler(${org},${file.id},'miniatura_384') r`,
      )
    )[0].r.id,
    nativeReady.id,
  );
  assertions += 2;
  const concurrentMeta = { ...meta, nome: "concurrent-native.jpg", sha256: "d".repeat(64) };
  const concurrentFile = (
    await as(
      eng,
      (tx) =>
        tx`select public.nr_arquivo_preparar(${org},${randomUUID()},${tx.json(concurrentMeta)}) r`,
    )
  )[0].r;
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${concurrentFile.caminho},${sql.json({ size: concurrentMeta.tamanho, mimetype: concurrentMeta.mime })})`;
  await service(
    (tx) =>
      tx`select public.nr_arquivo_confirmar(${org},${concurrentFile.id},${eng},${concurrentFile.sha256},${concurrentFile.tamanho},${concurrentFile.mime})`,
  );
  let markNativeHeld, releaseNative;
  const nativeHeld = new Promise((resolve) => {
    markNativeHeld = resolve;
  });
  const nativeGate = new Promise((resolve) => {
    releaseNative = resolve;
  });
  const nativeWriter = service(async (tx) => {
    const claimed = (
      await tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`
    )[0].r;
    markNativeHeld(claimed);
    await nativeGate;
    return claimed;
  });
  const writerJobs = await nativeHeld;
  try {
    assert.equal(writerJobs.length, 1);
    assert.equal(writerJobs[0].arquivo_id, concurrentFile.id);
    assert.deepEqual(
      (
        await service(
          (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
        )
      )[0].r,
      [],
      "A concurrent transaction cannot claim before the first native claim commits",
    );
    assertions += 3;
  } finally {
    releaseNative();
  }
  await nativeWriter;
  await service(
    (tx) =>
      tx`select public.nr_imagem_trabalho_concluir(${writerJobs[0].id},${writerJobs[0].lease},${tx.json(result)})`,
  );
  const remainingNative = (
    await service(
      (tx) => tx`select public.nr_imagem_trabalho_obter(1,'nexus-storage-transform-v1') r`,
    )
  )[0].r;
  assert.equal(remainingNative.length, 1);
  assert.equal(remainingNative[0].arquivo_id, concurrentFile.id);
  await service(
    (tx) =>
      tx`select public.nr_imagem_trabalho_concluir(${remainingNative[0].id},${remainingNative[0].lease},${tx.json(result)})`,
  );
  assertions += 2;
  assertions += await testImageDispatch({ sql, org, eng, client, unit, local, as, service });
  assertions += await testImageTickets({ sql, eng, as, service });
  const occurrence = {
    local_id: local,
    origem: "isolated",
    ocorrencia_origem: "stable-pointer-1",
    referencia_original: "fotos/unit/a.jpg",
    referencia_miniatura: "fotos/unit/thumb/a.jpg",
    ordem: 0,
    miniatura_arquivo_id: file.id,
    miniatura_proveniencia: "origem",
    legenda_origem: "Uma ocorrência, original ainda pendente",
    evidencia: { tipo: "teste-isolado" },
  };
  const occurrenceId = (
    await sql`select public.nr_foto_ocorrencia_importar(${org},${sql.json(occurrence)}) id`
  )[0].id;
  assert.equal(
    (await sql`select public.nr_foto_ocorrencia_importar(${org},${sql.json(occurrence)}) id`)[0].id,
    occurrenceId,
  );
  assertions++;
  await reject(
    () =>
      as(eng, (tx) => tx`select public.nr_foto_ocorrencia_importar(${org},${tx.json(occurrence)})`),
    "42501",
  );
  const projected = (
    await as(eng, (tx) => tx`select public.nr_foto_ocorrencias_ler(${org},${local}) r`)
  )[0].r;
  assert.equal(projected[0].arquivo_id, null);
  assert.equal(projected[0].miniatura_arquivo_id, file.id);
  assertions += 2;
  await reject(
    () => as(outsider, (tx) => tx`select public.nr_foto_ocorrencias_ler(${org},${local})`),
    "42501",
  );
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_importar(${org},${sql.json({ ...occurrence, referencia_original: "fotos/other/a.jpg" })})`,
    "23505",
  );
  // Real SQL completion: no writes to the occurrence's source metadata or local snapshot.
  async function importedImage({
    tipo = "original_origem",
    reference = occurrence.referencia_original,
    targetUnit = unit,
    confirmed = true,
    source = "isolated",
    snapshot = "d".repeat(64),
  } = {}) {
    const sha256 = randomUUID().replaceAll("-", "").repeat(2);
    const metadata = {
      cliente_id: client,
      unidade_id: targetUnit,
      normas: ["NR33"],
      nome: `fixture-${randomUUID()}.jpg`,
      mime: "image/jpeg",
      tamanho: 100,
      sha256,
      papel: "foto",
      origem_metadata: {
        sistema: source,
        tipo,
        referencia_source: reference,
        source_snapshot_sha256: snapshot,
      },
    };
    const prepared = (
      await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json(metadata)}) r`
    )[0].r;
    if (confirmed) {
      await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${prepared.caminho},${sql.json({ size: metadata.tamanho, mimetype: metadata.mime })})`;
      await sql`select public.nr_arquivo_importar_confirmar(${org},${prepared.id},${prepared.sha256},${prepared.tamanho},${prepared.mime})`;
    }
    return prepared;
  }
  const originalA = await importedImage(),
    originalB = await importedImage();
  const wrongReference = await importedImage({ reference: "fotos/unit/wrong.jpg" });
  const wrongSource = await importedImage({ source: "other-source" });
  const pendingOriginal = await importedImage({ confirmed: false });
  const falseOriginal = await importedImage({ tipo: "miniatura_origem" });
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_imagem_representacoes where arquivo_id=${falseOriginal.id}`
    )[0].n,
    0,
  );
  assertions++;
  const foreignUnit = randomUUID();
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${foreignUnit},${org},${client},'Other image unit')`;
  const foreignImage = await importedImage({ targetUnit: foreignUnit });
  const completion = {
    origem: occurrence.origem,
    ocorrencia_origem: occurrence.ocorrencia_origem,
    referencia_original: occurrence.referencia_original,
    arquivo_id: originalA.id,
  };
  for (const role of ["anon", "authenticated", "service_role"]) {
    await reject(
      () =>
        sql.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          return tx`select public.nr_foto_ocorrencia_completar(${org},${tx.json(completion)})`;
        }),
      "42501",
    );
  }
  for (const rejected of [
    wrongReference,
    wrongSource,
    pendingOriginal,
    falseOriginal,
    foreignImage,
  ]) {
    await reject(
      () =>
        sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...completion, arquivo_id: rejected.id })})`,
      "23514",
    );
  }
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...completion, referencia_original: "wrong-reference" })})`,
    "23505",
  );
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...completion, legenda_origem: "Forbidden overwrite" })})`,
    "23514",
  );
  const beforeOccurrence = (
    await sql`select to_jsonb(o) r from public.nr_foto_ocorrencias o where id=${occurrenceId}`
  )[0].r;
  const localSnapshot = (await sql`select dados from public.nr_locais where id=${local}`)[0].dados;
  const originalSnapshot = (
    await sql`select to_jsonb(a) r from public.nr_arquivos a where id=${originalA.id}`
  )[0].r;
  assert.equal(
    (await sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json(completion)}) id`)[0]
      .id,
    occurrenceId,
  );
  const completed = (
    await sql`select to_jsonb(o) r from public.nr_foto_ocorrencias o where id=${occurrenceId}`
  )[0].r;
  assert.equal(completed.arquivo_id, originalA.id);
  assert.equal(completed.miniatura_arquivo_id, file.id);
  const sourceFields = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          !["arquivo_id", "miniatura_arquivo_id", "miniatura_proveniencia", "evidencia"].includes(
            key,
          ),
      ),
    );
  assert.deepEqual(sourceFields(completed), sourceFields(beforeOccurrence));
  const { complementacoes_nexus: receipts, ...preservedEvidence } = completed.evidencia;
  assert.deepEqual(preservedEvidence, beforeOccurrence.evidencia);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].arquivo_sha256, originalA.sha256);
  assert.deepEqual(
    (await sql`select dados from public.nr_locais where id=${local}`)[0].dados,
    localSnapshot,
  );
  assert.deepEqual(
    (await sql`select to_jsonb(a) r from public.nr_arquivos a where id=${originalA.id}`)[0].r,
    originalSnapshot,
  );
  assertions += 9;
  assert.equal(
    (await sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json(completion)}) id`)[0]
      .id,
    occurrenceId,
  );
  assert.deepEqual(
    (await sql`select to_jsonb(o) r from public.nr_foto_ocorrencias o where id=${occurrenceId}`)[0]
      .r,
    completed,
  );
  assertions += 2;
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...completion, arquivo_id: originalB.id })})`,
    "23505",
  );
  const miniA = await importedImage({
    tipo: "miniatura_origem",
    reference: occurrence.referencia_miniatura,
  });
  const miniB = await importedImage({
    tipo: "miniatura_origem",
    reference: occurrence.referencia_miniatura,
  });
  const secondOccurrence = {
    ...occurrence,
    ocorrencia_origem: "completion-mini",
    ordem: 1,
    arquivo_id: originalA.id,
    miniatura_arquivo_id: null,
    miniatura_proveniencia: null,
    evidencia: { tipo: "source-unchanged", snapshot_sha256: "d".repeat(64) },
  };
  const secondId = (
    await sql`select public.nr_foto_ocorrencia_importar(${org},${sql.json(secondOccurrence)}) id`
  )[0].id;
  const miniCompletion = {
    origem: occurrence.origem,
    ocorrencia_origem: secondOccurrence.ocorrencia_origem,
    referencia_original: occurrence.referencia_original,
    referencia_miniatura: occurrence.referencia_miniatura,
    miniatura_arquivo_id: miniA.id,
    miniatura_proveniencia: "origem",
  };
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...miniCompletion, miniatura_proveniencia: "nexus" })})`,
    "23514",
  );
  const wrongMiniSnapshot = await importedImage({
    tipo: "miniatura_origem",
    reference: occurrence.referencia_miniatura,
    snapshot: "e".repeat(64),
  });
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...miniCompletion, miniatura_arquivo_id: wrongMiniSnapshot.id })})`,
    "23514",
  );
  assert.equal(
    (
      await sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json(miniCompletion)}) id`
    )[0].id,
    secondId,
  );
  const miniCompleted = (
    await sql`select *from public.nr_foto_ocorrencias where id=${secondId}`
  )[0];
  assert.equal(miniCompleted.arquivo_id, originalA.id);
  assert.equal(miniCompleted.miniatura_arquivo_id, miniA.id);
  assert.equal(miniCompleted.miniatura_proveniencia, "origem");
  assert.equal(miniCompleted.evidencia.complementacoes_nexus.length, 1);
  assertions += 5;
  await reject(
    () =>
      sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json({ ...miniCompletion, miniatura_arquivo_id: miniB.id })})`,
    "23505",
  );
  assert.equal(
    (
      await sql`select public.nr_foto_ocorrencia_completar(${org},${sql.json(miniCompletion)}) id`
    )[0].id,
    secondId,
  );
  assert.equal(
    (
      await sql`select jsonb_array_length(evidencia->'complementacoes_nexus') n from public.nr_foto_ocorrencias where id=${secondId}`
    )[0].n,
    1,
  );
  assertions += 2;
  async function concurrentCompletion(sequence, competingFile, conflict) {
    const sourceOccurrence = {
      ...occurrence,
      ocorrencia_origem: `concurrent-${sequence}`,
      ordem: sequence,
      miniatura_arquivo_id: null,
      miniatura_proveniencia: null,
    };
    const target = (
      await sql`select public.nr_foto_ocorrencia_importar(${org},${sql.json(sourceOccurrence)}) id`
    )[0].id;
    const firstPayload = { ...completion, ocorrencia_origem: sourceOccurrence.ocorrencia_origem };
    const secondPayload = { ...firstPayload, arquivo_id: competingFile.id };
    let signalHeld, release, signalContender;
    const held = new Promise((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const contenderReady = new Promise((resolve) => {
      signalContender = resolve;
    });
    const writer = sql.begin(async (tx) => {
      const result = (
        await tx`select public.nr_foto_ocorrencia_completar(${org},${tx.json(firstPayload)}) id`
      )[0].id;
      signalHeld();
      await gate;
      return result;
    });
    await held;
    const application = `nr-completion-${randomUUID()}`;
    const contender = sql
      .begin(async (tx) => {
        await tx`select set_config('application_name',${application},true)`;
        signalContender();
        return (
          await tx`select public.nr_foto_ocorrencia_completar(${org},${tx.json(secondPayload)}) id`
        )[0].id;
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await contenderReady;
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        waiting =
          (
            await sql`select wait_event_type='Lock' waiting from pg_stat_activity where application_name=${application}`
          )[0]?.waiting === true;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(
        waiting,
        true,
        "the competing completion must wait on the real occurrence row lock",
      );
      assertions++;
    } finally {
      release();
    }
    assert.equal(await writer, target);
    const result = await contender;
    if (conflict) assert.equal(result.error?.code, "23505");
    else assert.equal(result.value, target);
    const current = (
      await sql`select arquivo_id,evidencia from public.nr_foto_ocorrencias where id=${target}`
    )[0];
    assert.equal(current.arquivo_id, originalA.id);
    assert.equal(current.evidencia.complementacoes_nexus.length, 1);
    assertions += 4;
  }
  await concurrentCompletion(2, originalB, true);
  await concurrentCompletion(3, originalA, false);
  await sql`update public.nr_arquivos set estado='arquivado'where id=${file.id}`;
  assert.equal(
    (
      await as(
        eng,
        (tx) => tx`select count(*)::int n from storage.objects where name=${ready.caminho}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  const revoked = (
    await as(eng, (tx) => tx`select public.nr_foto_ocorrencias_ler(${org},${local}) r`)
  )[0].r;
  assert.equal(revoked[0].miniatura_arquivo_id, null);
  assertions++;
  console.log(
    JSON.stringify({
      suite: "NR image representations and occurrences",
      assertions,
      passed: true,
      storage_bytes_proven: false,
    }),
  );
} finally {
  await sql.end();
}
