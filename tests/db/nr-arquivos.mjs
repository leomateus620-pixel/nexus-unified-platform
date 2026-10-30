import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("NR file tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  max: 5,
  onnotice: () => {},
});
const org = randomUUID(),
  other = randomUUID(),
  engineer = randomUUID(),
  second = randomUUID(),
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
const service = (fn) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    return fn(tx);
  });
const prepare = (data, key = randomUUID(), user = engineer) =>
  as(
    user,
    async (tx) =>
      (await tx`select public.nr_arquivo_preparar(${org},${key},${tx.json(data)}) r`)[0].r,
  );
const confirm = (file, user = engineer) =>
  service(
    async (tx) =>
      (
        await tx`select public.nr_arquivo_confirmar(${org},${file.id},${user},${file.sha256},${file.tamanho},${file.mime}) r`
      )[0].r,
  );
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  assertions++;
};
const metadata = {
  cliente_id: client,
  unidade_id: unit,
  normas: ["NR33"],
  nome: "Original Rev03.pdf",
  mime: "application/pdf",
  tamanho: 123,
  sha256: "a".repeat(64),
  papel: "original",
};
try {
  await sql`insert into auth.users(id,email)values(${engineer},'nr-file-eng@test.invalid'),(${second},'nr-file-second@test.invalid'),(${field},'nr-file-field@test.invalid'),(${outsider},'nr-file-other@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'NR files isolated'),(${other},'NR files other')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${second}),(${org},${field}),(${other},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${second},'engenharia'),(${org},${field},'campo'),(${other},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'NR files client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'NR files unit')`;
  const key = randomUUID(),
    file = await prepare(metadata, key);
  assert.equal(file.estado, "preparado");
  assert.equal(file.bytes_verificados, false);
  assertions++;
  assert.equal((await prepare(metadata, key)).id, file.id);
  assertions++;
  await reject(() => prepare({ ...metadata, sha256: "b".repeat(64) }, key), "23505");
  await reject(() => prepare(metadata, randomUUID(), field), "42501");
  await reject(() => prepare({ ...metadata, nome: "original.docx" }), "23514");
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${tx.json(metadata)})`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) =>
          tx`select public.nr_arquivo_confirmar(${org},${file.id},${engineer},${file.sha256},${file.tamanho},${file.mime})`,
      ),
    "42501",
  );
  await reject(() => confirm(file), "23514");
  await reject(
    () =>
      as(
        second,
        (tx) =>
          tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${tx.json({ size: 123, mimetype: "application/pdf" })})`,
      ),
    "42501",
  );
  await as(
    engineer,
    (tx) =>
      tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${tx.json({ size: 123, mimetype: "application/pdf" })})`,
  );
  assertions++;
  const confirmed = await confirm(file);
  assert.equal(confirmed.bytes_verificados, true);
  assert.equal(confirmed.estado, "vinculado");
  assertions++;
  assert.equal((await confirm(file)).id, file.id);
  assertions++;
  assert.equal(
    (
      await as(
        outsider,
        (tx) => tx`select count(*)::int n from public.nr_arquivos where organization_id=${org}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  assert.equal(
    (await as(engineer, (tx) => tx`select public.nr_arquivo_ler(${org},${file.id}) r`))[0].r,
    true,
  );
  assertions++;
  const consumo = (await as(engineer, (tx) => tx`select public.nr_arquivo_consumo(${org}) r`))[0].r;
  assert.equal(consumo.bytes_fisicos_medidos, 123);
  assert.equal(consumo.quota_aplicada, false);
  assert.equal(consumo.escopo_capacidade, "nao_confirmado");
  assertions++;
  await reject(() => as(field, (tx) => tx`select public.nr_arquivo_consumo(${org})`), "42501");
  await reject(
    () =>
      as(
        engineer,
        (tx) => tx`update public.nr_arquivos set sha256=${"c".repeat(64)} where id=${file.id}`,
      ),
    "42501",
  );
  await reject(
    () => sql`update public.nr_arquivos set sha256=${"c".repeat(64)} where id=${file.id}`,
    "23514",
  );
  const secondFile = await prepare({ ...metadata, nome: "Revogacao.pdf" });
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${secondFile.caminho},${sql.json({ size: 123, mimetype: "application/pdf" })})`;
  await sql`delete from public.user_roles where organization_id=${org} and user_id=${engineer}`;
  await reject(() => confirm(secondFile), "42501");
  assert.equal(
    (await as(engineer, (tx) => tx`select public.nr_arquivo_ler(${org},${file.id}) r`))[0].r,
    false,
  );
  assertions++;
  const imported = (
    await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json({ ...metadata, origem_metadata: { sistema: "origem-autorizada", id_externo: "file-1" } })}) r`
  )[0].r;
  assert.equal(imported.created_by, null);
  assert.equal(imported.origem, "importacao");
  assertions++;
  await reject(
    () =>
      service(
        (tx) =>
          tx`select public.nr_arquivo_importar_confirmar(${org},${imported.id},${imported.sha256},${imported.tamanho},${imported.mime})`,
      ),
    "42501",
  );
  console.log(
    JSON.stringify({
      suite: "NR files PostgreSQL",
      assertions,
      passed: true,
      scope:
        "isolated SQL metadata/RLS/permissions; does not prove Storage HTTP or actual blob bytes",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
