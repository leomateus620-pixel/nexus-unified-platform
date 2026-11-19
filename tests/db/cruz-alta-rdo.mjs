import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Este cenário requer PostgreSQL descartável no loopback.");

const connection = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  username: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
const database = `cruz_alta_rdo_${process.pid}`;
const control = postgres({ ...connection, database: "postgres" });
const sql = postgres({ ...connection, database });
const migrations = await loadManifest(process.cwd());
const org = "abab473b-8baa-4781-aed2-c1243338af65";
const client = "c3d779b6-c407-8ab4-8545-6bdfd6068013";
const unit = "a9f6603b-6497-8e9e-822a-dfc860510c1a";
const [editor, consultant, restricted, outsider] = Array.from({ length: 4 }, randomUUID);
const key = "lvhf-11";
const root = "fixture-rdo-root-sql";
const folder = "fixture-rdo-pasta-11";
const sibling = "fixture-rdo-pasta-56";
const entries = [
  { id: folder, code: "11", name: "11 - Montagem fixture", category: "montagem" },
  { id: sibling, code: "56", name: "56 - RDO fixture", category: "lancada" },
];
const fotos = Array.from({ length: 7 }, (_, index) => ({
  id: `fixture-rdo-foto-${index}`,
  name: `Registro ${index}.png`,
  version: "1",
  modifiedAt: `2026-11-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
  path: ["fixture-rdo-subpasta-11"],
}));
const deny = (run, code) => assert.rejects(run, (error) => error.code === code);
async function as(role = "postgres", user = null) {
  await sql.unsafe("reset role");
  await sql`select set_config('request.jwt.claim.sub',${user ?? ""},false)`;
  if (role !== "postgres") await sql.unsafe(`set role ${role}`);
}

async function claim() {
  const token = randomBytes(32).toString("hex");
  await as();
  await sql`insert into ca_rdo_tickets values(encode(sha256(convert_to(${token},'UTF8')),'hex'),now()+interval '1 minute')`;
  await as("service_role");
  const [{ result }] = await sql`select ca_rdo_claim(${token}) result`;
  assert.equal(result.authorized, true);
  assert.deepEqual((await sql`select ca_rdo_claim(${token}) result`)[0].result, {
    authorized: false,
    job: null,
  });
  assert.ok(result.job);
  return result.job;
}

async function finish(job, result, lease = job.lease) {
  await as("service_role");
  return (await sql`select ca_rdo_finish(${job.id},${lease},${sql.json(result)}) result`)[0].result;
}

async function list(page = 0, user = editor, selected = key) {
  await as("authenticated", user);
  return (await sql`select ca_rdo_listar(${org},${selected},${page}) result`)[0].result;
}

async function resolve(refs, selected = key) {
  await as("authenticated", editor);
  return (await sql`select ca_rdo_material(${org},${selected},${sql.json(refs)}) result`)[0].result;
}

await control.unsafe(`create database ${database}`);
try {
  await control.unsafe(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  await applyMigrations(sql, migrations);
  for (const user of [editor, consultant, restricted, outsider])
    await sql`insert into auth.users(id,email) values(${user},${user + "@rdo.test.invalid"})`;
  await sql`insert into organizations(id,nome) values(${org},'RDO TESTE LOCAL')`;
  for (const user of [editor, consultant, restricted])
    await sql`insert into memberships(organization_id,user_id) values(${org},${user})`;
  await sql`insert into user_roles(organization_id,user_id,role) values(${org},${editor},'engenharia')`;
  await sql`insert into clientes(id,organization_id,razao_social) values(${client},${org},'RDO TESTE')`;
  await sql`insert into unidades(id,organization_id,cliente_id,nome) values(${unit},${org},${client},'RDO TESTE')`;
  await sql`insert into nr_cenas_unidade(organization_id,cliente_id,unidade_id,cena,estado)
    values(${org},${client},${unit},'tres-tentos-cruz-alta','publicada') on conflict do nothing`;
  await sql`insert into nr_cena_consultores values(${org},${client},${unit},${consultant},true),(${org},${client},${unit},${restricted},false)`;
  await sql`insert into ca_inspecao_raizes(drive_id,tipo,pasta_lancada_id) values(${root},'rdo','fixture-rdo-publicadas-sql')`;
  const [{ id: lot }] =
    await sql`insert into ca_inspecao_lotes(raiz,estado,terminou_em) values(${root},'concluido',now()) returning id`;
  await sql`insert into ca_inspecao_rdo_acervo values(${org},${client},${unit},${lot},${sql.json(entries)})`;

  assert.equal((await list()).ready, false);
  await deny(() => list(0, outsider), "42501");
  assert.deepEqual((await list(0, restricted)).photos, []);
  await deny(() => sql`select * from ca_rdo_fotos`, "42501");
  await deny(() => sql`select ca_rdo_claim(${"1".repeat(64)})`, "42501");
  await as("anon");
  await deny(() => sql`select ca_rdo_listar(${org},${key},0)`, "42501");
  await as("service_role");
  assert.equal(
    (await sql`select public from storage.buckets where id='nexus-cruz-alta-rdo'`)[0].public,
    false,
  );
  await sql`select ca_rdo_agendar()`;
  await sql`select ca_rdo_agendar()`;
  for (let index = 0; index < 2; index++) {
    const job = await claim();
    assert.equal(job.kind, "catalogo");
    const photos = job.folderId === folder ? fotos : [];
    assert.equal(await finish(job, { fotos: photos }, randomUUID()), "obsoleto");
    if (photos.length) {
      await deny(() => finish(job, { fotos: [...photos, photos[0]] }), "23514");
      await deny(() => finish(job, { fotos: [{ ...photos[0], path: [job.folderId] }] }), "23514");
      assert.equal((await list()).ready, false);
    }
    assert.equal(await finish(job, { fotos: photos }), "concluido");
  }
  const page = await list(0, consultant);
  assert.equal(page.ready, true);
  assert.equal(page.total, 7);
  assert.deepEqual(
    page.photos.map((photo) => photo.id),
    fotos
      .slice(1)
      .reverse()
      .map((photo) => photo.id),
  );
  assert.equal((await list(1)).photos[0].id, fotos[0].id);
  assert.deepEqual((await list(0, editor, "lvhf-56")).photos, []);
  assert.deepEqual((await resolve([{ ...fotos[0], folderId: folder }])).assets, []);

  const media = await claim();
  assert.equal(media.kind, "midia");
  const ref = media.foto;
  const assets = {
    original: { mime: "image/png", bytes: 123, sha256: "a".repeat(64) },
    thumbnail: { mime: "image/webp", bytes: 41, sha256: "b".repeat(64) },
  };
  await deny(() => finish(media, { variants: assets, retry: false }), "23514");
  await as();
  const storedPaths = [];
  for (const [variant, info] of Object.entries(assets)) {
    const path = `${org}/${unit}/${folder}/${ref.id}/${ref.version}/${variant === "original" ? variant : `${variant}.webp`}`;
    storedPaths.push(path);
    await sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-cruz-alta-rdo',${path},${sql.json({ size: info.bytes, mimetype: info.mime })})`;
  }
  assert.equal(await finish(media, { variants: assets, retry: true }), "fila");
  assert.deepEqual((await resolve([ref])).assets[0].variants, assets);
  assert.deepEqual((await resolve([ref], "lvhf-56")).assets, []);
  assert.deepEqual((await resolve([{ ...ref, path: [] }])).assets, []);
  await as("authenticated", editor);
  assert.equal(
    (await sql`select name from storage.objects where bucket_id='nexus-cruz-alta-rdo'`).length,
    0,
  );
  await deny(
    () =>
      sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-cruz-alta-rdo','arquivo-adulterado','{}')`,
    "42501",
  );

  await as();
  await sql`update ca_rdo_catalogos set conferido_em=now()-interval '16 minutes' where pasta=${folder}`;
  await sql`update ca_rdo_trabalhos set alterado_em=now()-interval '16 minutes' where pasta=${folder} and tipo='catalogo'`;
  await as("service_role");
  await sql`select ca_rdo_agendar()`;
  const refreshed = await claim();
  assert.equal(refreshed.kind, "catalogo");
  assert.equal(refreshed.folderId, folder);
  assert.equal(
    await finish(refreshed, {
      fotos: fotos.map((photo) => (photo.id === ref.id ? { ...photo, version: "2" } : photo)),
    }),
    "concluido",
  );
  assert.deepEqual((await resolve([ref])).assets, []);
  const purge = await claim();
  assert.equal(purge.kind, "limpeza");
  assert.deepEqual(purge.foto, ref);
  await deny(() => finish(purge, {}), "23514");
  await as("service_role");
  await sql`delete from storage.objects where bucket_id='nexus-cruz-alta-rdo' and name in ${sql(storedPaths)}`;
  assert.equal(await finish(purge, {}), "concluido");
  await as();
  assert.equal(
    (await sql`select count(*)::int total from ca_rdo_fotos where foto=${ref.id} and versao='1'`)[0]
      .total,
    0,
  );
  await sql`update ca_inspecao_rdo_acervo set pastas=${sql.json(entries.filter((entry) => entry.id !== folder))}`;
  await as("service_role");
  await sql`select ca_rdo_agendar()`;
  assert.equal((await list()).total, 0);
  assert.deepEqual((await resolve([{ ...ref, version: "2" }])).assets, []);
  await as();
  assert.equal(
    (
      await sql`select count(*)::int total from ca_rdo_trabalhos where pasta=${folder} and tipo='limpeza' and estado='fila'`
    )[0].total,
    7,
  );
  console.log(
    "PASS RDO escopo, paginação, lease, vínculo exato, confirmação privada e descarte de versão",
  );
} finally {
  await sql.end();
  await control.unsafe(`drop database if exists ${database} with (force)`);
  await control.end();
}
