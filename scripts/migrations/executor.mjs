import { pendingMigrations } from "./manifest.mjs";

export async function applyMigrations(sql, migrations) {
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(735278172, 1)`;
    const [state] = await transaction`
      select to_regclass('nexus_migrations.applied') is not null as has_ledger,
             to_regclass('public.organizations') is not null as has_application
    `;
    if (!state.has_ledger && state.has_application) {
      throw new Error(
        "Banco existente sem ledger Nexus. Reconcilie schema e históricos antes de registrar baseline; nenhuma migração aplicada.",
      );
    }
    if (!state.has_ledger)
      await transaction.unsafe(`
      create schema if not exists nexus_migrations;
      revoke all on schema nexus_migrations from public,anon,authenticated,service_role;
      create table if not exists nexus_migrations.applied (
        path text primary key,
        position integer not null unique check (position > 0),
        sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
        origin text not null default 'applied' check (origin in ('applied','baseline_reconciled')),
        evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz not null default now(),
        applied_by text not null default current_user
      );
      revoke all on nexus_migrations.applied from public,anon,authenticated,service_role;
    `);
    const applied = await transaction`
      select path, position, sha256 from nexus_migrations.applied order by position
    `;
    const pending = pendingMigrations(migrations, applied);
    for (const migration of pending) {
      await transaction.unsafe(migration.source);
      await transaction`
        insert into nexus_migrations.applied(path, position, sha256)
        values (${migration.path}, ${migration.position}, ${migration.sha256})
      `;
    }
    return pending.map(({ path: migrationPath }) => migrationPath);
  });
}
