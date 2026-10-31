import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Brand tests require disposable loopback PostgreSQL");
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
  editor = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID(),
  client = randomUUID();
let assertions = 0;
const as = (user, work) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return work(tx);
  });
const rejects = async (work, code) => {
  await assert.rejects(work, (error) => error.code === code);
  assertions++;
};
try {
  await sql`insert into auth.users(id,email)values(${editor},'brand-editor@test.invalid'),(${field},'brand-field@test.invalid'),(${outsider},'brand-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Brand isolated'),(${other},'Other brand isolated')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${editor}),(${org},${field}),(${other},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${editor},'engenharia'),(${org},${field},'campo'),(${other},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Brand isolated client')`;
  const path = `${org}/${editor}/${"a".repeat(64)}.png`;
  const meta = { size: 100, mimetype: "image/png" };
  const brand = {
    caminho: path,
    origem: "Arquivo sintético de teste isolado",
    sha256: "a".repeat(64),
    mime: "image/png",
    largura: 100,
    altura: 40,
    tamanho: 100,
    superficie: "escura",
  };
  assert.equal(
    (
      await as(editor, (tx) => tx`select public.cliente_marca_pode_enviar('not-a-uuid/file') value`)
    )[0].value,
    false,
  );
  assertions++;
  await as(
    editor,
    (tx) =>
      tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-clientes-marcas',${path},${tx.json(meta)})`,
  );
  assert.equal(
    (
      await as(
        editor,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    1,
  );
  assertions++;
  assert.equal(
    (
      await as(
        field,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  await rejects(
    () =>
      as(
        field,
        (tx) =>
          tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-clientes-marcas',${`${org}/${field}/${"b".repeat(64)}.png`},${tx.json(meta)})`,
      ),
    "42501",
  );
  await rejects(
    () =>
      as(
        editor,
        (tx) =>
          tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-clientes-marcas',${`${other}/${editor}/${"b".repeat(64)}.png`},${tx.json(meta)})`,
      ),
    "42501",
  );
  const data = { razao_social: "Brand isolated client", marca: brand };
  const key = randomUUID();
  const saved = (
    await as(
      editor,
      (tx) =>
        tx`select public.salvar_cliente_operacional(${org},${key},${tx.json(data)},${client},1) value`,
    )
  )[0].value;
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.marca, brand);
  assertions += 2;
  const retry = (
    await as(
      editor,
      (tx) =>
        tx`select public.salvar_cliente_operacional(${org},${key},${tx.json(data)},${client},1) value`,
    )
  )[0].value;
  assert.equal(retry.version, 2);
  assertions++;
  assert.equal(
    (
      await as(
        field,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    1,
  );
  assertions++;
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  const edited = (
    await as(
      editor,
      (tx) =>
        tx`select public.salvar_cliente_operacional(${org},${randomUUID()},${tx.json({ razao_social: "Brand changed name" })},${client},2) value`,
    )
  )[0].value;
  assert.deepEqual(edited.marca, brand);
  assertions++;
  await rejects(
    () =>
      as(
        editor,
        (tx) =>
          tx`select public.salvar_cliente_operacional(${org},${randomUUID()},${tx.json({ razao_social: "Stale name" })},${client},2)`,
      ),
    "40001",
  );
  await rejects(
    () =>
      as(
        editor,
        (tx) =>
          tx`select public.salvar_cliente_operacional(${org},${randomUUID()},${tx.json({ ...data, marca: { ...brand, caminho: `${other}/${editor}/${brand.sha256}.png` } })},${client},3)`,
      ),
    "23514",
  );
  await rejects(
    () =>
      as(
        field,
        (tx) =>
          tx`select public.salvar_cliente_operacional(${org},${randomUUID()},${tx.json(data)},${client},3)`,
      ),
    "42501",
  );
  const removed = (
    await as(
      editor,
      (tx) =>
        tx`select public.salvar_cliente_operacional(${org},${randomUUID()},${tx.json({ razao_social: "Brand changed name", marca: null })},${client},3) value`,
    )
  )[0].value;
  assert.equal(removed.marca, null);
  assertions++;
  assert.equal(
    (
      await as(
        field,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  assert.equal(
    (
      await as(
        editor,
        (tx) =>
          tx`select count(*)::integer n from storage.objects where bucket_id='nexus-clientes-marcas' and name=${path}`,
      )
    )[0].n,
    1,
  );
  assertions++;
  console.log(
    JSON.stringify({
      suite: "Client brand RLS, version and idempotency",
      assertions,
      passed: true,
      storage_bytes_proven: false,
    }),
  );
} finally {
  await sql.end();
}
