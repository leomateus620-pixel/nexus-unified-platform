import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("Retention checks require isolated loopback PostgreSQL");
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
  other = randomUUID(),
  engineer = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID(),
  client = randomUUID(),
  unit = randomUUID();
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
const document = async (title) =>
  as(
    engineer,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},'NR33','documentos','salvar',null,null,${randomUUID()},${tx.json({ titulo: title, cliente_id: client, unidade_id: unit })}) r`
      )[0].r,
  );
const archive = (
  file,
  key = randomUUID(),
  user = engineer,
  motivo = "Arquivar rascunho sem retenção",
) =>
  as(
    user,
    async (tx) =>
      (await tx`select public.nr_arquivo_cancelar(${org},${file.id},${motivo},${key}) r`)[0].r,
  );
const link = (file, doc, key = randomUUID()) =>
  sql`select public.nr_arquivo_importar_vinculo(${org},${file.id},${key},${sql.json({ documento_id: doc.id, revisao_id: doc.revisao_atual_id })},${sql.json({ decisao: "Identidade confirmada pelo ID de origem no cenário isolado" })}) r`;
async function file(name, extra = {}, verified = true) {
  const data = {
    cliente_id: client,
    unidade_id: unit,
    normas: ["NR33"],
    nome: name,
    mime: "application/pdf",
    tamanho: 101,
    sha256: "a".repeat(64),
    papel: "original",
    ...extra,
  };
  const prepared = (
    await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json(data)}) r`
  )[0].r;
  if (!verified) return prepared;
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${prepared.caminho},${sql.json({ size: 101, mimetype: "application/pdf" })})`;
  return (
    await sql`select public.nr_arquivo_importar_confirmar(${org},${prepared.id},${prepared.sha256},${prepared.tamanho},${prepared.mime}) r`
  )[0].r;
}
try {
  await sql`insert into auth.users(id,email)values(${engineer},'retention-eng@test.invalid'),(${field},'retention-field@test.invalid'),(${outsider},'retention-other@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Retention isolated'),(${other},'Retention other')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${field}),(${other},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${field},'campo'),(${other},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Retention client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Retention unit')`;
  const issued = await document("Historical issued document"),
    old = await document("Superseded draft"),
    draft = await document("Current draft");
  await sql`update public.nr_documento_revisoes set estado='emitido_origem' where id=${issued.revisao_atual_id}`;
  await sql`update public.nr_documento_revisoes set vigencia='superada' where id=${old.revisao_atual_id}`;
  const retained = await file("Secondary issued original.pdf");
  assert.equal(retained.revisao_id, null);
  assert.equal(retained.created_by, null);
  assertions++;
  await link(retained, issued);
  await reject(() => archive(retained), "23514");
  assert.equal(
    (await as(engineer, (tx) => tx`select public.nr_arquivo_ler(${org},${retained.id}) r`))[0].r,
    true,
  );
  assertions++;
  assert.equal(
    (await sql`select estado from public.nr_arquivos where id=${retained.id}`)[0].estado,
    "vinculado",
  );
  assertions++;
  const superada = await file("Secondary superseded original.pdf");
  await link(superada, old);
  await reject(() => archive(superada), "23514");
  const primary = await file("Primary issued original.pdf", {
    documento_id: issued.id,
    revisao_id: issued.revisao_atual_id,
  });
  await reject(() => archive(primary), "23514");
  const disposable = await file("Draft original.pdf");
  await link(disposable, draft);
  const key = randomUUID();
  const archived = await archive(disposable, key);
  assert.equal(archived.estado, "arquivado");
  assertions++;
  assert.equal((await archive(disposable, key)).version, archived.version);
  assertions++;
  await reject(() => archive(disposable, key, engineer, "Motivo diferente"), "23505");
  await reject(() => link(disposable, issued), "23514");
  const pending = await file("Unverified import.pdf", {}, false);
  await reject(() => archive(pending), "42501");
  await reject(() => archive(retained, randomUUID(), field), "42501");
  await reject(() => archive(retained, randomUUID(), outsider), "42501");
  await reject(() => archive(retained, randomUUID(), engineer, null), "42501");
  await reject(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        return tx`select public.nr_arquivo_importar_vinculo(${org},${retained.id},'forbidden','{}'::jsonb,'{}'::jsonb)`;
      }),
    "42501",
  );
  const invalid = await file("Invalid missing evidence.pdf");
  await reject(() => link(invalid, draft, null), "23514");
  // A paused archive owns the file lock. A concurrent association must wait and
  // then reject the archived object, rather than publish a retained hidden source.
  const racing = await file("Race original.pdf");
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let locked;
  const ready = new Promise((resolve) => {
    locked = resolve;
  });
  const archiving = as(engineer, async (tx) => {
    const row = (
      await tx`select public.nr_arquivo_cancelar(${org},${racing.id},'Concorrência controlada',${randomUUID()}) r`
    )[0].r;
    locked();
    await barrier;
    return row;
  });
  await ready;
  const linking = link(racing, issued);
  let finished = false;
  const outcome = linking.then(
    () => {
      finished = true;
      return null;
    },
    (e) => {
      finished = true;
      return e;
    },
  );
  await sql`select pg_sleep(0.08)`;
  assert.equal(finished, false);
  assertions++;
  release();
  await archiving;
  assert.equal((await outcome).code, "23514");
  assertions++;
  // The reverse lock order retains a freshly linked issued revision before the
  // archive evaluates it, even when its statement began before the link committed.
  const reverse = await file("Reverse race original.pdf");
  let releaseLink;
  const linkBarrier = new Promise((resolve) => {
    releaseLink = resolve;
  });
  let linked;
  const linkReady = new Promise((resolve) => {
    linked = resolve;
  });
  const linkingFirst = sql.begin(async (tx) => {
    await tx`select public.nr_arquivo_importar_vinculo(${org},${reverse.id},'race:retained',${tx.json({ documento_id: issued.id, revisao_id: issued.revisao_atual_id })},${tx.json({ decisao: "Vínculo confirmado antes do arquivamento" })})`;
    linked();
    await linkBarrier;
  });
  await linkReady;
  const reverseOutcome = archive(reverse).then(
    () => null,
    (e) => e,
  );
  await sql`select pg_sleep(0.08)`;
  releaseLink();
  await linkingFirst;
  assert.equal((await reverseOutcome).code, "23514");
  assertions++;
  console.log(
    JSON.stringify({
      suite: "NR retention PostgreSQL",
      assertions,
      passed: true,
      scope:
        "isolated SQL: primary/secondary issued and superseded retention; owner-only junction; pending staging; archive replay and two-session association races; no Storage HTTP claim",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
