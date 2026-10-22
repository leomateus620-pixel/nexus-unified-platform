import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { applyMigrations } from "./executor.mjs";
import { loadManifest, sqlChecksum } from "./manifest.mjs";
import { baselineEnvelope, migrationEnvelope } from "./connector-batch.mjs";

// This harness never reads a production URL. Only the dedicated local test cluster is accepted.
if (process.env.PGTEST_EPHEMERAL !== "1" || !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "")) {
  throw new Error("Execute apenas pelo runner de PostgreSQL descartável");
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrations = await loadManifest(root);
const options = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
const sql = postgres({ ...options, database: "postgres" });
const cleanName = `nexus_migrations_clean_${process.pid}`;
const connectorName = `nexus_connector_${process.pid}`;
let clean;
let connector;
try {
  const appliedBaseline = await applyMigrations(sql, migrations.slice(0, 30));
  assert.equal(appliedBaseline.length, 30);
  await sql.unsafe(`
    insert into public.organizations(id,nome) values('58000000-0000-0000-0000-000000000001','Legacy upgrade fixture');
    insert into public.clientes(id,organization_id,razao_social)
    values('58000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','Client retained across upgrade');
  `);
  const operationalCheckpoint = Math.min(39, migrations.length);
  const beforeLatest = await applyMigrations(sql, migrations.slice(0, operationalCheckpoint));
  if (operationalCheckpoint === 39) {
    // Prova adicional do upgrade do checkpoint operacional efetivamente publicado.
    await sql.begin(async (tx) => {
      await tx.unsafe(`insert into auth.users(id,email) values('58000000-0000-0000-0000-000000000003','upgrade-operational@test.invalid');
        insert into public.memberships(organization_id,user_id) values('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000003');
        insert into public.user_roles(organization_id,user_id,role) values('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000003','engenharia');
        select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true);
        insert into public.pessoas(id,organization_id,nome,vinculo) values('58000000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001','Operational person retained across upgrade','prestador');`);
    });
  }
  const upgrade = [...beforeLatest, ...(await applyMigrations(sql, migrations))];
  if (operationalCheckpoint === 39) {
    const [{ retainedPerson }] =
      await sql`select count(*)::int as "retainedPerson" from public.pessoas where id='58000000-0000-0000-0000-000000000004' and nome='Operational person retained across upgrade'`;
    assert.equal(retainedPerson, 1);
    const [{ retainedAudit }] =
      await sql`select count(*)::int as "retainedAudit" from public.operacao_historico where entidade='pessoas' and entidade_id='58000000-0000-0000-0000-000000000004' and autor='58000000-0000-0000-0000-000000000003'`;
    assert.equal(retainedAudit, 1);
    console.log(
      `PASS: operational checkpoint 39 → ${migrations.length}; canonical person and audit retained`,
    );
  }
  assert.equal(upgrade.length, migrations.length - 30);
  const [{ retained }] =
    await sql`select count(*)::int as retained from public.clientes where id='58000000-0000-0000-0000-000000000002' and razao_social='Client retained across upgrade'`;
  assert.equal(retained, 1);
  assert.deepEqual(await applyMigrations(sql, migrations), []);
  const [{ count }] = await sql`select count(*)::int as count from nexus_migrations.applied`;
  assert.equal(count, migrations.length);
  console.log(
    `PASS: historical baseline (30) → upgrade (${upgrade.length}); existing client preserved; retry executes no migration SQL`,
  );

  const badSource = "create table public.nexus_rollback_probe(id int); select 1/0;";
  await assert.rejects(
    applyMigrations(sql, [
      ...migrations,
      {
        path: "test/rollback-probe.sql",
        position: migrations.length + 1,
        source: badSource,
        sha256: sqlChecksum(badSource),
      },
    ]),
    (error) => error.code === "22012",
  );
  const [{ absent }] =
    await sql`select to_regclass('public.nexus_rollback_probe') is null as absent`;
  assert.equal(absent, true);
  const [{ afterFailure }] =
    await sql`select count(*)::int as "afterFailure" from nexus_migrations.applied`;
  assert.equal(afterFailure, migrations.length);
  const drifted = migrations.map((migration, index) =>
    index === 0 ? { ...migration, sha256: "0".repeat(64) } : migration,
  );
  await assert.rejects(applyMigrations(sql, drifted), /Drift no ledger/);
  console.log(
    "PASS: failed DDL rolls back objects and ledger; altered historical checksum blocks execution",
  );

  await sql`create database ${sql(cleanName)}`;
  clean = postgres({ ...options, database: cleanName });
  await clean.unsafe("create table public.organizations(id uuid)");
  await assert.rejects(applyMigrations(clean, migrations), /Banco existente sem ledger/);
  await clean.unsafe("drop table public.organizations");
  const bootstrap = (await readFile(path.join(root, "tests/db/bootstrap.sql"), "utf8")).replace(
    /^create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;\r?\n/m,
    "",
  );
  // Roles are cluster-wide and were already installed by the parent harness.
  await clean.unsafe(bootstrap);
  const fresh = await applyMigrations(clean, migrations);
  assert.equal(fresh.length, migrations.length);
  await assert.rejects(
    clean.begin(async (transaction) => {
      await transaction.unsafe("set role authenticated");
      await transaction.unsafe("select * from nexus_migrations.applied");
    }),
    (error) => error.code === "42501",
  );
  console.log(
    `PASS: clean installation (${fresh.length}) and private ledger; preexisting schema without reconciliation rejected`,
  );

  // Platform-style historical ledgers are metadata fixtures in a third isolated database.
  // Historical application SQL is real; no operational fixtures reach the connected project.
  await sql`create database ${sql(connectorName)}`;
  connector = postgres({ ...options, database: connectorName });
  await connector.unsafe(bootstrap);
  await connector.begin(async (transaction) => {
    for (const migration of migrations.slice(0, 30)) await transaction.unsafe(migration.source);
  });
  await connector.unsafe(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    create schema drizzle;
    create table drizzle.__drizzle_migrations(id integer primary key,hash text not null,created_at bigint not null);
  `);
  for (const migration of migrations.slice(0, 18)) {
    const version = migration.nativeVersion ?? migration.path.split("/").at(-1).split("_")[0];
    await connector`insert into supabase_migrations.schema_migrations(version) values(${version})`;
  }
  for (const [index, migration] of migrations.slice(18, 30).entries()) {
    await connector`insert into drizzle.__drizzle_migrations(id,hash,created_at) values(${index + 1},${migration.sha256},${index + 1})`;
  }
  const fingerprintSql = await readFile(
    path.join(root, "scripts/migrations/schema-fingerprint.sql"),
    "utf8",
  );
  const [catalogRow] = await connector.unsafe(fingerprintSql);
  const snapshot = Object.values(catalogRow)[0];
  const evidenceHash = sqlChecksum(JSON.stringify(snapshot));
  const baseline = baselineEnvelope(migrations, snapshot, fingerprintSql, evidenceHash);
  const wrongSnapshot = {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      relations: { ...snapshot.summary.relations, md5: "0".repeat(32) },
    },
  };
  await assert.rejects(
    connector.unsafe(baselineEnvelope(migrations, wrongSnapshot, fingerprintSql, evidenceHash)),
    (error) => error.code === "55000",
  );
  const [{ noLedger }] =
    await connector`select to_regclass('nexus_migrations.applied') is null as "noLedger"`;
  assert.equal(noLedger, true, "failed reconciliation rolls back ledger DDL");
  await connector`update drizzle.__drizzle_migrations set hash=${"0".repeat(64)} where id=1`;
  await assert.rejects(connector.unsafe(baseline), (error) => error.code === "55000");
  await connector`update drizzle.__drizzle_migrations set hash=${migrations[18].sha256} where id=1`;
  await connector.unsafe(baseline);
  const [{ reconciled }] =
    await connector`select count(*)::int as reconciled from nexus_migrations.applied where origin='baseline_reconciled' and evidence_sha256=${evidenceHash}`;
  assert.equal(reconciled, 30);
  for (const migration of migrations.slice(30))
    await connector.unsafe(migrationEnvelope(migrations, migration));
  for (const migration of migrations.slice(30))
    await connector.unsafe(migrationEnvelope(migrations, migration));
  await connector.unsafe(baseline);
  const [{ connectorCount }] =
    await connector`select count(*)::int as "connectorCount" from nexus_migrations.applied`;
  assert.equal(connectorCount, migrations.length);
  const failedEnvelope = {
    path: "test/connector-failure.sql",
    position: migrations.length + 1,
    source: "create table public.nexus_connector_rollback(id int); select 1/0;",
  };
  failedEnvelope.sha256 = sqlChecksum(failedEnvelope.source);
  await assert.rejects(
    connector.unsafe(migrationEnvelope([...migrations, failedEnvelope], failedEnvelope)),
    (error) => error.code === "22012",
  );
  const [{ rolledBack }] =
    await connector`select to_regclass('public.nexus_connector_rollback') is null and (select count(*) from nexus_migrations.applied)=${migrations.length} as "rolledBack"`;
  assert.equal(rolledBack, true);
  console.log(
    "PASS: connector single-DO envelopes validate native ledgers/schema, register provenance, apply once and roll back failed DDL with ledger",
  );
} finally {
  if (connector) {
    await connector.end({ timeout: 5 });
    await sql`drop database ${sql(connectorName)} with (force)`;
  }
  if (clean) {
    await clean.end({ timeout: 5 });
    // This exact database was created above in the dedicated ephemeral cluster.
    await sql`drop database ${sql(cleanName)} with (force)`;
  }
  await sql.end({ timeout: 5 });
}
