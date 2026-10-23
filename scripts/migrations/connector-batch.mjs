import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./manifest.mjs";

function quoted(value, prefix = "nexus_value") {
  let index = 0;
  while (value.includes(`$${prefix}_${index}$`)) index += 1;
  const delimiter = `$${prefix}_${index}$`;
  return `${delimiter}${value}${delimiter}`;
}
const literal = (value) => `'${value.replace(/'/g, "''")}'`;
const prefixJson = (migrations) =>
  JSON.stringify(
    migrations.map(({ path: migrationPath, sha256, position }) => ({
      path: migrationPath,
      sha256,
      position,
    })),
  );
const ledgerSql = `
  create schema if not exists nexus_migrations;
  revoke all on schema nexus_migrations from public,anon,authenticated,service_role;
  create table if not exists nexus_migrations.applied (
    path text primary key, position integer not null unique check(position>0),
    sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
    origin text not null default 'applied' check(origin in ('applied','baseline_reconciled')),
    evidence_sha256 text check(evidence_sha256 is null or evidence_sha256~'^[a-f0-9]{64}$'),
    applied_at timestamptz not null default now(), applied_by text not null default current_user
  );
  revoke all on nexus_migrations.applied from public,anon,authenticated,service_role;
`;
function validatePrefix(migrations) {
  return `
    select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('path',path,'position',position,'sha256',sha256) order by position),'[]')
      into applied_count,actual_prefix from nexus_migrations.applied;
    select coalesce(jsonb_agg(value order by ord),'[]') into expected_prefix
      from jsonb_array_elements(${quoted(prefixJson(migrations))}::jsonb) with ordinality as expected(value,ord) where ord<=applied_count;
    if applied_count>${migrations.length} or actual_prefix is distinct from expected_prefix then
      raise exception 'Ledger Nexus diverge da ordem/checksums revisados.' using errcode='55000';
    end if;
  `;
}

export function migrationEnvelope(migrations, migration) {
  const body = `
  declare applied_count integer; actual_prefix jsonb; expected_prefix jsonb;
  begin
    perform pg_catalog.pg_advisory_xact_lock(735278172,1);
    if to_regclass('nexus_migrations.applied') is null then raise exception 'Baseline Nexus ainda não reconciliada.' using errcode='55000'; end if;
    ${validatePrefix(migrations)}
    if applied_count>=${migration.position} then return; end if;
    if applied_count<>${migration.position - 1} then raise exception 'Pré-requisito da migração ainda não aplicado.' using errcode='55000'; end if;
    execute ${quoted(migration.source, "nexus_source")};
    insert into nexus_migrations.applied(path,position,sha256,origin)
      values(${literal(migration.path)},${migration.position},${literal(migration.sha256)},'applied');
  end`;
  return `-- One PostgreSQL statement: source DDL and ledger commit or roll back together.\nDO ${quoted(body, "nexus_envelope")};\n`;
}

export function baselineEnvelope(migrations, snapshot, fingerprintSql, evidenceSha256) {
  if (
    snapshot.format !== "nexus-public-catalog-v1" ||
    !snapshot.summary ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256)
  ) {
    throw new Error("Baseline exige snapshot explícito do projeto confirmado e seu SHA-256");
  }
  const historical = migrations.slice(0, 30);
  const versions = historical
    .filter((entry) => entry.path.startsWith("supabase/"))
    .map((entry) => entry.nativeVersion ?? entry.path.split("/").at(-1).split("_")[0]);
  const hashes = historical
    .filter((entry) => entry.path.startsWith("drizzle/"))
    .map((entry) => entry.sha256);
  const body = `
  declare applied_count integer; actual_prefix jsonb; expected_prefix jsonb; current_snapshot jsonb; native_versions jsonb; native_hashes jsonb;
  begin
    perform pg_catalog.pg_advisory_xact_lock(735278172,1);
    ${ledgerSql}
    ${validatePrefix(migrations)}
    if applied_count>=30 then return; end if;
    if applied_count<>0 then raise exception 'Baseline parcial não pode ser presumida.' using errcode='55000'; end if;
    if to_regclass('supabase_migrations.schema_migrations') is null or to_regclass('drizzle.__drizzle_migrations') is null then
      raise exception 'Históricos nativos ausentes; reconciliação obrigatória.' using errcode='55000';
    end if;
    execute 'select coalesce(jsonb_agg(version::text order by version),''[]'') from supabase_migrations.schema_migrations' into native_versions;
    execute 'select coalesce(jsonb_agg(hash order by created_at,id),''[]'') from drizzle.__drizzle_migrations' into native_hashes;
    if native_versions is distinct from ${quoted(JSON.stringify(versions))}::jsonb or native_hashes is distinct from ${quoted(JSON.stringify(hashes))}::jsonb then
      raise exception 'Históricos nativos diferem dos 18+12 arquivos reconciliados.' using errcode='55000';
    end if;
    execute ${quoted(fingerprintSql.trim().replace(/;$/, ""), "nexus_fingerprint")} into current_snapshot;
    if current_snapshot->'summary' is distinct from ${quoted(JSON.stringify(snapshot.summary))}::jsonb then
      raise exception 'Schema mudou desde a captura revisada; recapture e reconcilie antes da baseline.' using errcode='55000';
    end if;
    insert into nexus_migrations.applied(path,position,sha256,origin,evidence_sha256)
    select value->>'path',(value->>'position')::integer,value->>'sha256','baseline_reconciled',${literal(evidenceSha256)}
      from jsonb_array_elements(${quoted(prefixJson(historical))}::jsonb) as historical(value);
  end`;
  return `-- Registers only the reviewed native baseline; never reexecutes historical application DDL.\nDO ${quoted(body, "nexus_baseline")};\n`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--output" || args[2] !== "--baseline-evidence") {
    throw new Error(
      "Uso: node scripts/migrations/connector-batch.mjs --output DIRETORIO --baseline-evidence SNAPSHOT_REMOTO.json",
    );
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const migrations = await loadManifest(root);
  const evidenceSource = await readFile(path.resolve(args[3]), "utf8");
  const snapshot = JSON.parse(evidenceSource.replace(/^\uFEFF/, ""));
  const fingerprintSql = await readFile(
    path.join(root, "scripts/migrations/schema-fingerprint.sql"),
    "utf8",
  );
  const evidenceSha256 = createHash("sha256").update(evidenceSource).digest("hex");
  await mkdir(path.resolve(args[1]), { recursive: true });
  const batches = [
    {
      name: "0000_baseline_reconciliada.sql",
      sql: baselineEnvelope(migrations, snapshot, fingerprintSql, evidenceSha256),
    },
    ...migrations.slice(30).map((entry) => ({
      name: `${String(entry.position).padStart(4, "0")}_${path.basename(entry.path)}`,
      sql: migrationEnvelope(migrations, entry),
    })),
  ];
  for (const batch of batches)
    await writeFile(path.join(path.resolve(args[1]), batch.name), batch.sql);
  console.log(
    JSON.stringify({
      baselineEvidenceSha256: evidenceSha256,
      outputDirectory: path.resolve(args[1]),
      statements: batches.map(({ name }) => name),
    }),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
