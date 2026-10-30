import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("NR archive tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  max: 8,
  onnotice: () => {},
});
const org = randomUUID(),
  otherOrg = randomUUID(),
  engineer = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID(),
  client = randomUUID(),
  client2 = randomUUID(),
  unit = randomUUID(),
  unit2 = randomUUID(),
  foreignClient = randomUUID(),
  foreignUnit = randomUUID();
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
  await assert.rejects(fn, (error) => error.code === code);
  assertions++;
};
async function cmd(
  resource,
  command,
  data = {},
  id = null,
  version = null,
  key = randomUUID(),
  norm = "NR33",
  user = engineer,
) {
  return as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},${norm},${resource},${command},${id},${version},${key},${tx.json(data)}) r`
      )[0].r,
  );
}
async function query(resource, filters = {}, norm = "NR33", user = engineer) {
  return as(
    user,
    async (tx) =>
      (await tx`select public.nr_consultar(${org},${norm},${resource},${tx.json(filters)}) r`)[0].r,
  );
}
async function change(
  file,
  command,
  data = {},
  key = randomUUID(),
  version = file.version,
  user = engineer,
) {
  return as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_arquivo_alterar(${org},${file.id},${version},${key},${command},${tx.json(data)}) r`
      )[0].r,
  );
}
async function files(filters = {}, user = engineer) {
  return as(
    user,
    async (tx) =>
      (await tx`select public.nr_arquivo_listar(${org},'NR33',${tx.json(filters)}) r`)[0].r,
  );
}
async function consumption(user = engineer) {
  return as(user, async (tx) => (await tx`select public.nr_arquivo_consumo(${org}) r`)[0].r);
}
const scoped = (titulo, extra = {}) => ({ titulo, cliente_id: client, unidade_id: unit, ...extra });
async function makeFile(nome, extra = {}, imported = false) {
  const data = {
    cliente_id: client,
    unidade_id: unit,
    normas: ["NR33"],
    nome,
    mime: "application/pdf",
    tamanho: 101,
    sha256: "a".repeat(64),
    papel: "original",
    ...extra,
  };
  const prepared = imported
    ? (
        await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json(data)}) r`
      )[0].r
    : await as(
        engineer,
        async (tx) =>
          (
            await tx`select public.nr_arquivo_preparar(${org},${randomUUID()},${tx.json(data)}) r`
          )[0].r,
      );
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${prepared.caminho},${sql.json({ size: 101, mimetype: "application/pdf" })})`;
  return imported
    ? (
        await sql`select public.nr_arquivo_importar_confirmar(${org},${prepared.id},${prepared.sha256},${prepared.tamanho},${prepared.mime}) r`
      )[0].r
    : await service(
        async (tx) =>
          (
            await tx`select public.nr_arquivo_confirmar(${org},${prepared.id},${engineer},${prepared.sha256},${prepared.tamanho},${prepared.mime}) r`
          )[0].r,
      );
}
async function archive(file) {
  return as(
    engineer,
    async (tx) =>
      (
        await tx`select public.nr_arquivo_cancelar(${org},${file.id},'Arquivamento recuperável do cenário',${randomUUID()}) r`
      )[0].r,
  );
}
try {
  await sql`insert into auth.users(id,email)values(${engineer},'nr-archive-eng@test.invalid'),(${field},'nr-archive-field@test.invalid'),(${outsider},'nr-archive-other@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'NR archive isolated'),(${otherOrg},'NR archive foreign')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${field}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${field},'campo'),(${otherOrg},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'NR archive client'),(${client2},${org},'NR archive second client'),(${foreignClient},${otherOrg},'NR archive foreign client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'NR archive first unit'),(${unit2},${org},${client2},'NR archive second unit'),(${foreignUnit},${otherOrg},${foreignClient},'NR archive foreign unit')`;
  const global = await cmd("modelos", "salvar", { titulo: "Modelo global", tipo: "levantamento" }),
    localModel = await cmd(
      "modelos",
      "salvar",
      scoped("Modelo da primeira unidade", { tipo: "levantamento" }),
    ),
    secondModel = await cmd("modelos", "salvar", {
      titulo: "Modelo da segunda unidade",
      cliente_id: client2,
      unidade_id: unit2,
      tipo: "levantamento",
    });
  const list1 = await query("modelos", { cliente_id: client, unidade_id: unit }),
    list2 = await query("modelos", { cliente_id: client2, unidade_id: unit2 });
  assert.deepEqual(new Set(list1.rows.map((r) => r.id)), new Set([global.id, localModel.id]));
  assert.deepEqual(new Set(list2.rows.map((r) => r.id)), new Set([global.id, secondModel.id]));
  assertions++;
  assert.equal(
    (await query("modelos", { id: global.id, cliente_id: client, unidade_id: unit })).id,
    global.id,
  );
  assertions++;
  await reject(
    () => query("modelos", { id: secondModel.id, cliente_id: client, unidade_id: unit }),
    "42501",
  );
  const local = await cmd("locais", "salvar", scoped("Local da primeira unidade"));
  const secondLocal = await cmd("locais", "salvar", {
    titulo: "Local da segunda unidade",
    cliente_id: client2,
    unidade_id: unit2,
  });
  const height = await cmd(
    "locais",
    "salvar",
    scoped("Local exclusivo de altura"),
    null,
    null,
    randomUUID(),
    "NR35",
  );
  const history = await query("historico", { cliente_id: client, unidade_id: unit });
  assert.ok(history.rows.some((r) => r.registro_id === local.id));
  assert.ok(
    !history.rows.some((r) => r.registro_id === secondLocal.id || r.registro_id === height.id),
  );
  assertions++;
  await cmd("pendencias", "salvar", scoped("Pendência prioritária", { criticidade: "alta" }));
  assert.equal(
    (await query("painel", { unidade_id: unit })).pendencias_prioritarias[0].estado,
    "aberta",
  );
  assertions++;
  const folder = await cmd("pastas", "salvar", scoped("Pasta de origem")),
    destination = await cmd("pastas", "salvar", scoped("Pasta de destino")),
    wrongFolder = await cmd("pastas", "salvar", {
      titulo: "Pasta de outro cliente",
      cliente_id: client2,
      unidade_id: unit2,
    });
  const original = await makeFile("Recebido 13A Rev.03.pdf", { pasta_id: folder.id }),
    key = randomUUID();
  let renamed = await change(original, "renomear", { nome_exibicao: "Nome visível.pdf" }, key);
  assert.equal(renamed.nome, "Recebido 13A Rev.03.pdf");
  assert.equal(renamed.nome_exibicao, "Nome visível.pdf");
  assert.equal(renamed.sha256, original.sha256);
  assert.equal(renamed.caminho, original.caminho);
  assertions++;
  assert.equal(
    (await change(original, "renomear", { nome_exibicao: "Nome visível.pdf" }, key)).version,
    renamed.version,
  );
  assertions++;
  await reject(
    () => change(original, "renomear", { nome_exibicao: "Outro nome.pdf" }, key),
    "23505",
  );
  await reject(() => change(original, "renomear", { nome_exibicao: "Versão antiga.pdf" }), "40001");
  await reject(
    () =>
      change(
        renamed,
        "renomear",
        { nome_exibicao: "Campo sem poder.pdf" },
        randomUUID(),
        renamed.version,
        field,
      ),
    "42501",
  );
  await reject(
    () =>
      change(
        renamed,
        "renomear",
        { nome_exibicao: "Outra organização.pdf" },
        randomUUID(),
        renamed.version,
        outsider,
      ),
    "42501",
  );
  await reject(() => change(renamed, "mover", { pasta_id: wrongFolder.id }), "23514");
  renamed = await change(renamed, "mover", { pasta_id: destination.id });
  assert.equal(renamed.pasta_id, destination.id);
  assert.equal(renamed.caminho, original.caminho);
  assert.equal(renamed.sha256, original.sha256);
  assertions++;
  assert.equal((await files({ pasta_id: destination.id })).rows[0].id, original.id);
  assertions++;
  let trash = await archive(renamed);
  assert.equal((await files({ lixeira: true })).rows[0].id, original.id);
  assert.ok(!(await files()).rows.some((f) => f.id === original.id));
  assertions++;
  await makeFile("Nome visível.pdf", { pasta_id: destination.id });
  await reject(() => change(trash, "restaurar", {}), "23505");
  trash = await change(trash, "renomear", { nome_exibicao: "Nome recuperado.pdf" });
  let restored = await change(trash, "restaurar", {});
  assert.equal(restored.estado, "vinculado");
  assert.equal(restored.arquivado_em, null);
  assert.equal(restored.nome, original.nome);
  assert.equal(restored.sha256, original.sha256);
  assertions++;
  const archiveFolder = await cmd(
    "pastas",
    "arquivar",
    { motivo: "Simular retenção da pasta" },
    destination.id,
    destination.version,
  );
  assert.ok(archiveFolder.arquivado_em);
  trash = await archive(restored);
  await reject(() => change(trash, "restaurar", {}), "23514");
  trash = await change(trash, "mover", { pasta_id: folder.id });
  restored = await change(trash, "restaurar", {});
  assert.equal(restored.estado, "vinculado");
  assertions++;
  const technicalLocal = await cmd(
    "locais",
    "salvar",
    scoped("Local da captura técnica", { tag: "EC TESTE", tipo: "EC" }),
  );
  const doc = await cmd(
    "documentos",
    "salvar",
    scoped("Documento com campo técnico", {
      local_id: technicalLocal.id,
      conteudo: {
        schema_version: 1,
        blocos: [{ id: "campo1", tipo: "campo", chave: "local.tag", modo: "vinculado" }],
      },
    }),
  );
  await reject(
    () =>
      cmd(
        "documentos",
        "salvar",
        {
          conteudo: {
            schema_version: 1,
            blocos: [
              {
                id: "campo1",
                tipo: "campo",
                chave: "local.tag",
                modo: "livre",
                valor_snapshot: 123,
              },
            ],
          },
        },
        doc.id,
        doc.version,
      ),
    "23514",
  );
  const manual = await cmd(
    "documentos",
    "salvar",
    {
      conteudo: {
        schema_version: 1,
        blocos: [
          {
            id: "campo1",
            tipo: "campo",
            chave: "local.tag",
            modo: "livre",
            valor_snapshot: 123,
            motivo_substituicao: "Correção explícita da transcrição",
          },
        ],
      },
    },
    doc.id,
    doc.version,
  );
  assert.equal(manual.conteudo.blocos[0].motivo_substituicao, "Correção explícita da transcrição");
  assertions++;
  await reject(
    () =>
      cmd(
        "documentos",
        "salvar",
        {
          conteudo: {
            schema_version: 1,
            blocos: [
              { id: "same", tipo: "paragrafo", texto: "A" },
              { id: "same", tipo: "paragrafo", texto: "B" },
            ],
          },
        },
        doc.id,
        manual.version,
      ),
    "23514",
  );
  const pendingImport = (
    await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json({ cliente_id: client, unidade_id: unit, normas: ["NR33"], nome: "Pendente importado.pdf", mime: "application/pdf", tamanho: 101, sha256: "b".repeat(64), papel: "original" })}) r`
  )[0].r;
  await reject(
    () => change(pendingImport, "renomear", { nome_exibicao: "Não pode revelar staging.pdf" }),
    "42501",
  );
  await reject(
    () => as(engineer, (tx) => tx`select public.nr_consultar(${org},null,'contexto','{}'::jsonb)`),
    "42501",
  );
  const imported = await makeFile("Original importado compartilhado.pdf", {}, true),
    before = await consumption();
  const doc2 = await cmd("documentos", "salvar", scoped("Segundo documento lógico"));
  const linkData = { documento_id: doc.id, revisao_id: doc.revisao_atual_id };
  const evidence = { decisao: "Vínculo confirmado por ID no cenário isolado" };
  const link = (
    await sql`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:doc1',${sql.json(linkData)},${sql.json(evidence)}) r`
  )[0].r;
  assert.equal(
    (
      await sql`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:doc1',${sql.json(linkData)},${sql.json(evidence)}) r`
    )[0].r,
    link,
  );
  assertions++;
  await sql`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:doc2',${sql.json({ documento_id: doc2.id, revisao_id: doc2.revisao_atual_id })},${sql.json(evidence)})`;
  await reject(
    () =>
      sql`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:doc1',${sql.json({ local_id: local.id })},${sql.json(evidence)})`,
    "23505",
  );
  await reject(
    () =>
      sql`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:cruzado',${sql.json({ local_id: secondLocal.id })},${sql.json(evidence)})`,
    "23503",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`select public.nr_arquivo_importar_vinculo(${org},${imported.id},'origem:sem-poder',${tx.json(linkData)},${tx.json(evidence)})`,
      ),
    "42501",
  );
  const byDoc = await files({ documento_id: doc.id });
  assert.equal(byDoc.rows.filter((f) => f.id === imported.id).length, 1);
  assert.equal((await files({ documento_id: doc2.id })).rows[0].id, imported.id);
  assertions++;
  const after = await consumption();
  assert.equal(after.bytes_fisicos_medidos, before.bytes_fisicos_medidos);
  assert.equal(after.objetos_fisicos, before.objetos_fisicos);
  assert.equal(after.por_unidade[0].bytes, after.bytes_fisicos_medidos);
  assert.equal(
    after.por_bucket.find((b) => b.bucket_id === "nexus-nr-acervo").objetos,
    after.objetos_fisicos,
  );
  assert.ok(after.quantidade_revisoes >= 2);
  assertions++;
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  await reject(() => as(field, (tx) => tx`select public.nr_arquivo_consumo(${org})`), "42501");
  await reject(
    () =>
      as(
        engineer,
        (tx) => tx`update public.nr_arquivo_vinculos set origem_chave='alterada' where id=${link}`,
      ),
    "42501",
  );
  console.log(
    JSON.stringify({
      suite: "NR archive organization PostgreSQL",
      assertions,
      passed: true,
      scope:
        "isolated SQL; global model context, scoped history, file identity/version/replay/trash/move/RLS, manual field reason, physical consumption deduplication; no Storage HTTP proof",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
