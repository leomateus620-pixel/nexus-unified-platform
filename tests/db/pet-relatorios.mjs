/** Disposable PostgreSQL only. Storage is represented by canonical metadata;
 * this does not prove HTTP uploads or any certified signature. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432" ||
  !["127.0.0.1", undefined].includes(process.env.PGTEST_HOST)
)
  throw Error("Use PostgreSQL descartável de loopback");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  onnotice() {},
});
const org = randomUUID(),
  user = randomUUID(),
  outsider = randomUUID();
let checks = 0;
const q = (source, args = []) => sql.unsafe(source, args);
const pass = (condition, label) => {
  assert.ok(condition, label);
  checks++;
  console.log("PET REPORT PASS " + label);
};
const denied = async (fn, code, label) => {
  await assert.rejects(fn, (e) => e.code === code, label);
  checks++;
  console.log("PET REPORT PASS " + label);
};
const auth = async (id = user) => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await q("set role authenticated");
};
const root = async () => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
};
const command = async (comando, dados) =>
  (
    await q("select public.pet_executar($1,$2::jsonb) r", [
      org,
      { chave: randomUUID(), comando, dados },
    ])
  )[0].r;
try {
  await root();
  for (const id of [user, outsider])
    await q("insert into auth.users(id,email) values($1,$2)", [
      id,
      `report-${id.slice(-1)}@test.invalid`,
    ]);
  await q(
    "insert into public.organizations(id,nome) values($1,'Relatório PET - TESTE DESCARTÁVEL')",
    [org],
  );
  for (const [id, role] of [
    [user, "admin"],
    [outsider, "comercial"],
  ]) {
    await q("insert into public.memberships(organization_id,user_id) values($1,$2)", [org, id]);
    await q(
      "insert into public.user_roles(organization_id,user_id,role) values($1,$2,$3::public.app_role)",
      [org, id, role],
    );
  }
  await auth();
  const client = (
    await q("select public.salvar_cliente_operacional($1,$2,$3::jsonb) r", [
      org,
      randomUUID(),
      { razao_social: "Cliente relatório teste" },
    ])
  )[0].r;
  const unit = (
    await q("select public.salvar_unidade_operacional($1,$2,$3,$4::jsonb) r", [
      org,
      randomUUID(),
      client.id,
      { nome: "Unidade relatório teste" },
    ])
  )[0].r;
  const os = await command("criar_os", {
    cliente_id: client.id,
    unidade_id: unit.id,
    titulo: "OS de teste do relatório",
  });
  const space = await command("salvar_espaco", {
    unidade_id: unit.id,
    identificacao: "EC relatório teste",
    localizacao: "Ambiente de teste isolado",
  });
  const pet = await command("criar_pet", {
    os_id: os.id,
    espaco_id: space.id,
    atividade: "Rascunho de teste sem emissão",
    termino_previsto: new Date(Date.now() + 3600e3).toISOString(),
    timezone: "America/Sao_Paulo",
  });
  const id = pet.id,
    key = randomUUID();
  const prepare = async (chave = key, expected = 1) =>
    (await q("select public.pet_preparar_relatorio($1,$2,$3,$4) r", [org, id, expected, chave]))[0]
      .r;
  const prepared = await prepare(),
    doc = prepared.documento;
  pass(
    doc.tipo === "relatorio_derivado" && doc.estado === "gerando",
    "job cria documento derivado em geração, sem fingir arquivo disponível",
  );
  pass(
    prepared.snapshot.pet.emitida_em === null &&
      prepared.snapshot.pet.revisao_atual_id === null &&
      prepared.snapshot.pet.version === 1,
    "gerar relatório não emite PET nem muda revisão operacional",
  );
  const repeat = await prepare();
  pass(
    repeat.documento.id === doc.id &&
      JSON.stringify(repeat.snapshot) === JSON.stringify(prepared.snapshot),
    "retry preserva documento e snapshot exatos",
  );
  await denied(() => prepare(key, 2), "23505", "mesma chave com outra versão é recusada");
  await denied(() => prepare(randomUUID(), 99), "40001", "versão desatualizada não gera novo job");
  await auth(outsider);
  await denied(() => prepare(), "42501", "endpoint direto sem acesso não expõe snapshot");
  await auth();
  const bytes = Buffer.from("%PDF-1.7\nDERIVED DATABASE TEST\n%%EOF"),
    hash = createHash("sha256").update(bytes).digest("hex");
  const item = `documento:${doc.id}`,
    uploadKey = randomUUID();
  const upload = async (chave = uploadKey, petItem = item, mime = "application/pdf") =>
    (
      await q("select public.iniciar_anexo_pet($1,$2,$3,$4::jsonb) r", [
        org,
        id,
        chave,
        {
          nome: "relatorio-derivado-teste.pdf",
          mime,
          tamanho: bytes.length,
          sha256: hash,
          pet_item: petItem,
        },
      ])
    )[0].r;
  await denied(
    () => upload(randomUUID(), `documento:${randomUUID()}`),
    "42501",
    "prefixo documento não abre upload sem job próprio",
  );
  await denied(
    () => upload(randomUUID(), item, "image/png"),
    "23514",
    "job de relatório não recebe fotografia disfarçada",
  );
  const file = await upload();
  pass(
    (await upload()).id === file.id && (await upload(randomUUID())).id === file.id,
    "intenção de arquivo única por job, inclusive com outra chave",
  );
  await denied(
    () =>
      q("select public.pet_finalizar_relatorio($1,$2,$3,$4,$5)", [
        org,
        doc.id,
        user,
        file.id,
        hash,
      ]),
    "42501",
    "browser não pode promover documento a disponível",
  );
  await root();
  await denied(
    () =>
      q("update public.pet_relatorio_jobs set snapshot='{}'::jsonb where documento_id=$1", [
        doc.id,
      ]),
    "23514",
    "snapshot do relatório é imutável",
  );
  await q("set role service_role");
  await denied(
    () =>
      q("select public.pet_finalizar_relatorio($1,$2,$3,$4,$5)", [
        org,
        doc.id,
        user,
        file.id,
        hash,
      ]),
    "23514",
    "arquivo pendente não é documento disponível",
  );
  await root();
  await q(
    "insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',$1,$2::jsonb)",
    [file.caminho, { size: bytes.length, mimetype: "application/pdf" }],
  );
  await q("set role service_role");
  await q("select public.confirmar_anexo_operacional($1,$2,$3,$4)", [org, file.id, user, hash]);
  await denied(
    () =>
      q("select public.pet_finalizar_relatorio($1,$2,$3,$4,$5)", [
        org,
        doc.id,
        user,
        file.id,
        "a".repeat(64),
      ]),
    "23514",
    "hash divergente não promove documento",
  );
  const finish = async () =>
    (
      await q("select public.pet_finalizar_relatorio($1,$2,$3,$4,$5) r", [
        org,
        doc.id,
        user,
        file.id,
        hash,
      ])
    )[0].r;
  pass(
    (await finish()).estado === "disponivel" && (await finish()).anexo_id === file.id,
    "finalização validada é idempotente e preserva arquivo/hash",
  );
  await root();
  await denied(
    () => q("update public.pet_documentos set sha256=$2 where id=$1", [doc.id, "b".repeat(64)]),
    "23514",
    "arquivo disponível do relatório não é sobrescrito",
  );
  // Closed-state fixture tests the scope exception. This is not a real issued permit.
  await q(
    "update public.pet_permissoes set estado_documental='encerrada',condicao_operacional='terminada',encerrada_em=clock_timestamp() where id=$1",
    [id],
  );
  const version = (await q("select version from public.pet_permissoes where id=$1", [id]))[0]
    .version;
  await auth();
  const after = await prepare(randomUUID(), version);
  await denied(
    () => upload(randomUUID(), "isolamento"),
    "42501",
    "PET encerrada continua recusando novos anexos comuns",
  );
  const afterFile = await upload(randomUUID(), `documento:${after.documento.id}`);
  pass(
    afterFile.pet_id === id && afterFile.pet_item === `documento:${after.documento.id}`,
    "exceção após encerramento aceita somente PDF do job autorizado",
  );
  await q("select public.pet_relatorio_falhar($1,$2,'Arquivamento privado não configurado')", [
    org,
    after.documento.id,
  ]);
  pass(
    (await q("select estado from public.pet_documentos where id=$1", [after.documento.id]))[0]
      .estado === "falha",
    "falta de configuração permanece falha explícita, sem arquivo disponível",
  );
  await root();
  await q("insert into public.user_roles(organization_id,user_id,role) values($1,$2,'admin')", [
    org,
    outsider,
  ]);
  await q("delete from public.user_roles where organization_id=$1 and user_id=$2", [org, user]);
  await auth();
  await denied(() => prepare(key, 1), "42501", "retry revalida acesso atual após revogação");
  console.log(
    `PET REPORT DB ${checks} assertions passed. Storage metadata only; no HTTP or certificate validated.`,
  );
} finally {
  await sql.end();
}
