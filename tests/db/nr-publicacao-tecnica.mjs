import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL required");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 8,
  prepare: false,
  onnotice: () => {},
});
const org = randomUUID(),
  foreign = randomUUID(),
  engineer = randomUUID(),
  admin = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID(),
  person = randomUUID(),
  client = randomUUID(),
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
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  assertions++;
};
const cmd = (
  resource,
  action,
  data = {},
  id = null,
  version = null,
  user = engineer,
  key = randomUUID(),
) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},'NR33',${resource},${action},${id},${version},${key},${tx.json(data)}) r`
      )[0].r,
  );
const context = (model, user = engineer) =>
  as(
    user,
    async (tx) =>
      (await tx`select public.nr_modelo_publicacao_contexto(${org},'NR33',${model.id}) r`)[0].r,
  );
const publish = (model, evidence, key = randomUUID(), user = engineer, version = model.version) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_modelo_publicar_tecnico(${org},'NR33',${model.id},${version},${key},${tx.json(evidence)}) r`
      )[0].r,
  );
const base =
  "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/";
const official = (norm, today) => ({
  natureza: "oficial",
  normas: [norm],
  titulo: "Fonte oficial para ensaio isolado",
  versao: "Versão sintética do ensaio, sem conteúdo normativo",
  data_fonte: "2020-01-01",
  consultado_em: today,
  confronto: "Confronto sintético de campos e validações; não é parecer técnico real.",
  url:
    base +
    "normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-" +
    norm.slice(-2) +
    "-nr-" +
    norm.slice(-2),
});
async function file(
  name,
  scopedUnit = unit,
  organization = org,
  scopedClient = client,
  confirmed = true,
) {
  const data = {
    cliente_id: scopedClient,
    unidade_id: scopedUnit,
    normas: ["NR33", "NR35"],
    nome: name,
    mime: "application/pdf",
    tamanho: 101,
    sha256: "a".repeat(64),
    papel: "original",
  };
  const f = (
    await sql`select public.nr_arquivo_importar_preparar(${organization},${randomUUID()},${sql.json(data)}) r`
  )[0].r;
  if (!confirmed) return f;
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${f.caminho},${sql.json({ size: 101, mimetype: "application/pdf" })})`;
  return (
    await sql`select public.nr_arquivo_importar_confirmar(${organization},${f.id},${f.sha256},${f.tamanho},${f.mime}) r`
  )[0].r;
}
try {
  await sql`insert into auth.users(id,email)values(${engineer},'technical-engineer@test.invalid'),(${admin},'technical-admin@test.invalid'),(${field},'technical-field@test.invalid'),(${outsider},'technical-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Technical isolated'),(${foreign},'Technical foreign')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${admin}),(${org},${field}),(${foreign},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${admin},'admin'),(${org},${field},'campo'),(${foreign},${outsider},'engenharia')`;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,user_id,ativa,registro_profissional,vinculo,created_by)values(${person},${org},'Professional isolated',${engineer},true,'REG-ISOLATED-0044','colaborador',${engineer})`;
  });
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Technical client'),(${foreignClient},${foreign},'Technical foreign client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Technical unit'),(${unit2},${org},${client},'Technical second'),(${foreignUnit},${foreign},${foreignClient},'Technical foreign unit')`;
  const today = (await sql`select to_char(now()at time zone'UTC','YYYY-MM-DD') d`)[0].d;
  const evidence = {
    motivo: "Revisão interna sintética para verificar o fluxo SQL",
    escopo: "Somente fixture isolada sem uso operacional",
    excecoes: "Não se aplica a situações reais",
    confrontado_em: today,
    declaracao_revisao: true,
    fontes: [official("NR33", today), official("NR35", today)],
  };
  let model = await cmd("modelos", "salvar", {
    titulo: "Technical criterion fixture",
    tipo: "criterio",
    normas: ["NR33", "NR35"],
    cliente_id: client,
    unidade_id: unit,
    conteudo: {
      schema_version: 1,
      blocos: [
        {
          id: "criterion",
          tipo: "paragrafo",
          texto: "Conteúdo sintético, sem regra de segurança real.",
        },
      ],
    },
    dados: { validacao_normativa: "pendente", ativacao_automatica: false },
  });
  assert.equal((await context(model)).pode_publicar, true);
  assertions++;
  const adminContext = await context(model, admin);
  assert.equal(adminContext.pode_publicar, false);
  assert.equal(adminContext.profissional, null);
  assertions++;
  await reject(() => publish(model, evidence, randomUUID(), admin), "42501");
  await reject(() => publish(model, evidence, randomUUID(), field), "42501");
  await reject(() => publish(model, evidence, randomUUID(), outsider), "42501");
  await reject(() => context(model, outsider), "42501");
  await reject(() => publish(model, { ...evidence, fontes: [official("NR33", today)] }), "23514");
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [
          { ...official("NR33", today), url: "https://example.org/nr33" },
          official("NR35", today),
        ],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [
          { ...official("NR33", today), url: "https://www.gov.br/qualquer-pagina/nr33" },
          official("NR35", today),
        ],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [
          { ...official("NR33", today), url: official("NR35", today).url },
          official("NR35", today),
        ],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [
          { ...official("NR33", today), url: official("NR33", today).url + "?token=temporary" },
          official("NR35", today),
        ],
      }),
    "23514",
  );
  await reject(() => publish(model, { ...evidence, confrontado_em: "2999-01-01" }), "23514");
  await reject(() => publish(model, { ...evidence, declaracao_revisao: false }), "23514");
  await reject(
    () => cmd("modelos", "salvar", { estado: "ativo" }, model.id, model.version),
    "23514",
  );
  await reject(
    () =>
      cmd(
        "modelos",
        "salvar",
        { dados: { publicacao_tecnica: { aprovado: true } } },
        model.id,
        model.version,
      ),
    "23514",
  );
  await reject(
    () =>
      cmd(
        "modelos",
        "salvar",
        { dados: { validacao_normativa: "validado", ativacao_automatica: true } },
        model.id,
        model.version,
      ),
    "23514",
  );
  await reject(
    () => cmd("modelos", "salvar", { tipo: "documento" }, model.id, model.version),
    "23514",
  );
  await reject(
    () =>
      cmd(
        "modelos",
        "publicar",
        { fonte: "Tentativa de contornar o fluxo profissional" },
        model.id,
        model.version,
      ),
    "23514",
  );
  const license = await file("Licensed reference fixture.pdf"),
    pending = await file("Unconfirmed reference.pdf", unit, org, client, false),
    wrongUnit = await file("Other unit reference.pdf", unit2),
    wrongOrg = await file("Foreign reference.pdf", foreignUnit, foreign, foreignClient);
  const licensed = {
    natureza: "licenciada",
    normas: ["NR33"],
    titulo: "Licensed synthetic reference",
    versao: "Fixture1",
    data_fonte: "2020-01-01",
    consultado_em: today,
    confronto: "Ensaio de evidência declarada e arquivo privado; nenhum conteúdo licenciado real.",
    arquivo_id: license.id,
    licenca_referencia: "Autorização sintética de uso no ensaio isolado",
    licenca_confirmada: true,
  };
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [...evidence.fontes, { ...licensed, arquivo_id: null }],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [...evidence.fontes, { ...licensed, licenca_confirmada: false }],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [...evidence.fontes, { ...licensed, arquivo_id: pending.id }],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [...evidence.fontes, { ...licensed, arquivo_id: wrongUnit.id }],
      }),
    "23514",
  );
  await reject(
    () =>
      publish(model, {
        ...evidence,
        fontes: [...evidence.fontes, { ...licensed, arquivo_id: wrongOrg.id }],
      }),
    "23514",
  );
  const key = randomUUID();
  const firstEvidence = { ...evidence, fontes: [...evidence.fontes, licensed] };
  const first = await publish(model, firstEvidence, key);
  assert.equal(first.estado, "publicado");
  assertions++;
  const audit = (
    await sql`select depois from public.nr_historico where organization_id=${org} and registro_id=${model.id} and comando='publicar_tecnico'order by id desc limit 1`
  )[0].depois;
  assert.deepEqual(audit.normas, ["NR33", "NR35"]);
  assert.equal(audit.cliente_id, client);
  assert.equal(audit.unidade_id, unit);
  assertions++;
  const firstContext = await context(first);
  assert.equal(firstContext.pode_publicar, false);
  assert.equal(firstContext.fontes.length, 3);
  assert.equal(firstContext.versoes[0].responsavel_id, person);
  assert.equal(
    firstContext.versoes[0].dados.publicacao_tecnica.profissional_snapshot
      .registro_profissional_declarado,
    "REG-ISOLATED-0044",
  );
  assert.equal(firstContext.versoes[0].dados.publicacao_tecnica.certificacao_externa, false);
  assertions++;
  const initialVersion = firstContext.versoes[0],
    fileProof = firstContext.fontes.find((f) => f.arquivo_id === license.id);
  assert.equal(fileProof.arquivo_sha256, license.sha256);
  assert.equal(fileProof.arquivo_contexto.unidade_id, unit);
  assertions++;
  assert.equal((await publish(model, firstEvidence, key)).version, first.version);
  assert.equal((await context(first)).versoes.length, 1);
  assertions++;
  await reject(
    () =>
      publish(model, { ...firstEvidence, motivo: "Different payload must not reuse receipt" }, key),
    "23505",
  );
  await reject(
    () =>
      cmd(
        "modelos",
        "salvar",
        { descricao: "Cannot change published criterion" },
        first.id,
        first.version,
      ),
    "23514",
  );
  await reject(
    () => sql`update public.nr_modelo_versoes set fonte='Changed'where id=${initialVersion.id}`,
    "23514",
  );
  await reject(
    () => sql`delete from public.nr_modelo_publicacao_fontes where id=${fileProof.id}`,
    "23514",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`update public.nr_modelo_publicacao_fontes set confronto='Forged'where id=${fileProof.id}`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`select public.nr_arquivo_cancelar(${org},${license.id},'Cannot hide retained publication source',${randomUUID()})`,
      ),
    "23514",
  );
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::int n from public.nr_modelo_publicacao_fontes where organization_id=${org}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  model = await cmd(
    "modelos",
    "nova_revisao",
    { motivo: "Prepare later editable draft" },
    first.id,
    first.version,
  );
  assert.equal(model.estado, "rascunho");
  assert.equal((await context(model)).pode_publicar, true);
  assertions++;
  model = await cmd(
    "modelos",
    "salvar",
    {
      conteudo: {
        schema_version: 1,
        blocos: [
          {
            id: "updated",
            tipo: "paragrafo",
            texto: "Later synthetic edition, no change to history.",
          },
        ],
      },
    },
    model.id,
    model.version,
  );
  await reject(() => publish(model, evidence, randomUUID(), engineer, model.version - 1), "40001");
  const second = await publish(model, {
    ...evidence,
    motivo: "Second internally reviewed synthetic edition",
  });
  const versions = (await context(second)).versoes;
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[1], initialVersion);
  assertions++;
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`select public.nr_arquivo_cancelar(${org},${license.id},'Old published reference remains retained',${randomUUID()})`,
      ),
    "23514",
  );
  // These transactions use separate actors so the test isolates the file lock,
  // rather than serializing accidentally on the same actor's capability lock.
  const racingFile = await file("Archive before publication.pdf");
  const racingModel = await cmd("modelos", "salvar", {
    titulo: "Concurrent publication fixture",
    tipo: "regra",
    normas: ["NR33"],
    descricao: "Only synthetic concurrency validation",
  });
  const racingEvidence = {
    ...evidence,
    fontes: [official("NR33", today), { ...licensed, arquivo_id: racingFile.id }],
  };
  let unlockArchive;
  const archiveBarrier = new Promise((resolve) => {
    unlockArchive = resolve;
  });
  let archiveLocked;
  const archiveReady = new Promise((resolve) => {
    archiveLocked = resolve;
  });
  const archiving = as(admin, async (tx) => {
    await tx`select public.nr_arquivo_cancelar(${org},${racingFile.id},'Concurrent archive before publication',${randomUUID()})`;
    archiveLocked();
    await archiveBarrier;
  });
  await archiveReady;
  let done = false;
  const publishing = publish(racingModel, racingEvidence).then(
    () => {
      done = true;
      return null;
    },
    (error) => {
      done = true;
      return error;
    },
  );
  await sql`select pg_sleep(0.06)`;
  assert.equal(done, false);
  assertions++;
  unlockArchive();
  await archiving;
  assert.equal((await publishing).code, "23514");
  assert.equal((await context(racingModel)).versoes.length, 0);
  assertions++;
  const retainedFile = await file("Publication before archive.pdf");
  const retainedEvidence = {
    ...racingEvidence,
    fontes: [official("NR33", today), { ...licensed, arquivo_id: retainedFile.id }],
  };
  let unlockPublication;
  const publicationBarrier = new Promise((resolve) => {
    unlockPublication = resolve;
  });
  let publicationLocked;
  const publicationReady = new Promise((resolve) => {
    publicationLocked = resolve;
  });
  const publishingFirst = as(engineer, async (tx) => {
    await tx`select public.nr_modelo_publicar_tecnico(${org},'NR33',${racingModel.id},${racingModel.version},${randomUUID()},${tx.json(retainedEvidence)})`;
    publicationLocked();
    await publicationBarrier;
  });
  await publicationReady;
  const archiveSecond = as(
    admin,
    (tx) =>
      tx`select public.nr_arquivo_cancelar(${org},${retainedFile.id},'Concurrent archive after publication',${randomUUID()})`,
  ).then(
    () => null,
    (error) => error,
  );
  await sql`select pg_sleep(0.06)`;
  unlockPublication();
  await publishingFirst;
  assert.equal((await archiveSecond).code, "23514");
  assertions++;
  const draft = await cmd(
    "modelos",
    "nova_revisao",
    { motivo: "New draft after publication" },
    second.id,
    second.version,
  );
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`update public.pessoas set ativa=false where organization_id=${org} and id=${person}`;
  });
  await reject(() => publish(draft, evidence), "42501");
  assert.equal((await context(draft)).pode_publicar, false);
  assert.equal(
    (await context(draft)).versoes[1].dados.publicacao_tecnica.profissional_snapshot
      .registro_profissional_declarado,
    "REG-ISOLATED-0044",
  );
  assertions++;
  const all = (
    await sql`select count(*)filter(where estado='publicado')::int published from public.nr_modelos where organization_id=${org} and id=${model.id}`
  )[0];
  assert.equal(all.published, 0);
  assertions++;
  assert.equal(
    (await sql`select count(*)::int n from public.pet_permissoes where organization_id=${org}`)[0]
      .n,
    0,
  );
  assert.equal(
    (await sql`select count(*)::int n from public.pet_assinaturas where organization_id=${org}`)[0]
      .n,
    0,
  );
  assertions++;
  console.log(
    JSON.stringify({
      suite: "NR internal technical publication PostgreSQL",
      assertions,
      passed: true,
      scope:
        "isolated fixtures only; professional authority, official NR references/date/version/confrontation, licensed evidence context, server-derived publication snapshots, immutable history, retention, idempotence, stale versions, RLS and generic bypass rejection; no normative certification or document/PET emission",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
