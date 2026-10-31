import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";

// Dedicated upgrade test: requires an EMPTY disposable cluster, not the normal scenario DB.
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Upgrade0058 requires an empty disposable loopback PostgreSQL cluster");
const root = fileURLToPath(new URL("../../", import.meta.url));
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  prepare: false,
  onnotice: () => {},
});
let assertions = 0;
try {
  assert.equal(
    (
      await sql`select to_regclass('public.organizations')is null and to_regrole('authenticated')is null empty`
    )[0].empty,
    true,
    "Refuse to bootstrap or migrate an existing application/test cluster",
  );
  await sql.unsafe(await readFile(new URL("./bootstrap.sql", import.meta.url), "utf8"));
  const migrations = await loadManifest(root);
  assert.equal(
    migrations[76].path,
    "drizzle/migrations/0058_nr_imagem_processamento_automatico.sql",
  );
  await applyMigrations(sql, migrations.slice(0, 76));
  const org = randomUUID(),
    client = randomUUID(),
    unit = randomUUID();
  await sql`insert into public.organizations(id,nome)values(${org},'Pre0058 isolated')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Pre0058 isolated client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Pre0058 isolated unit')`;
  const metadata = {
    cliente_id: client,
    unidade_id: unit,
    normas: ["NR33"],
    nome: "isolated-legacy.jpg",
    mime: "image/jpeg",
    tamanho: 100,
    sha256: "f".repeat(64),
    papel: "foto",
  };
  const file = (
    await sql`select public.nr_arquivo_importar_preparar(${org},${randomUUID()},${sql.json(metadata)}) r`
  )[0].r;
  await sql`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${file.caminho},${sql.json({ size: 100, mimetype: "image/jpeg" })})`;
  await sql`select public.nr_arquivo_importar_confirmar(${org},${file.id},${file.sha256},${file.tamanho},${file.mime})`;
  await sql`update public.nr_imagem_representacoes set estado='disponivel',mime='image/webp',tamanho=25,largura=200,altura=384,
    sha256=${"e".repeat(64)},processado_em=clock_timestamp()where arquivo_id=${file.id} and variante='miniatura_384'`;
  await sql`update public.nr_imagem_representacoes set estado='processando',tentativas=2,lease=${randomUUID()},
    lease_ate=clock_timestamp()+interval'5 minutes'where arquivo_id=${file.id} and variante='previa_768'`;
  const before =
    await sql`select * from public.nr_imagem_representacoes where arquivo_id=${file.id} order by id`;
  const fileBefore = (await sql`select * from public.nr_arquivos where id=${file.id}`)[0];
  // Model the extension's documented PUBLIC grants, not an HTTP/cron service.
  await sql.unsafe(`create schema net;create schema vault;
    create table net.http_request_queue(id bigint);create table net._http_response(id bigint);
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    grant usage on schema net,vault to public,anon,authenticated,service_role;
    grant all on all tables in schema net to public,anon,authenticated;
    grant select on all tables in schema vault to public,anon,authenticated;`);
  const applied = await applyMigrations(sql, migrations.slice(0, 77));
  assert.equal(applied.length, 1);
  assert.deepEqual(
    await sql`select * from public.nr_imagem_representacoes where arquivo_id=${file.id} order by id`,
    before,
  );
  assert.deepEqual(
    (await sql`select * from public.nr_arquivos where id=${file.id}`)[0],
    fileBefore,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_imagem_representacoes where arquivo_id=${file.id} and processador='nexus-storage-transform-v1'`
    )[0].n,
    0,
  );
  assertions += 4;
  for (const role of ["anon", "authenticated"])
    for (const relation of [
      "vault.decrypted_secrets",
      "net.http_request_queue",
      "net._http_response",
    ]) {
      assert.equal(
        (await sql`select has_table_privilege(${role},${relation},'select') allowed`)[0].allowed,
        false,
      );
      assertions++;
    }
  for (const relation of [
    "vault.decrypted_secrets",
    "net.http_request_queue",
    "net._http_response",
  ]) {
    assert.equal(
      (await sql`select has_table_privilege('service_role',${relation},'select') allowed`)[0]
        .allowed,
      true,
    );
    assertions++;
  }
  for (const role of ["anon", "authenticated"])
    for (const relation of ["net.http_request_queue", "net._http_response"])
      for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        assert.equal(
          (await sql`select has_table_privilege(${role},${relation},${privilege}) allowed`)[0]
            .allowed,
          false,
        );
        assertions++;
      }
  for (const relation of ["net.http_request_queue", "net._http_response"])
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      assert.equal(
        (await sql`select has_table_privilege('service_role',${relation},${privilege}) allowed`)[0]
          .allowed,
        true,
      );
      assertions++;
    }
  assert.equal(
    (
      await sql`select estado from public.scheduler_configuracao where nome='nr-imagem-representacoes'`
    )[0].estado,
    "indisponivel",
  );
  assertions++;
  await sql.unsafe("drop schema net cascade;drop schema vault cascade;");
  console.log(
    JSON.stringify({
      suite: "NR image0058 upgrade",
      passed: true,
      assertions,
      migrationCount: 77,
      sha256: migrations[76].sha256,
      legacyRowsAndOriginalUnchanged: true,
      serviceRoleEffectivePermissionsPreserved: true,
      cronAndHttpExecutionProven: false,
    }),
  );
} finally {
  await sql.end();
}
