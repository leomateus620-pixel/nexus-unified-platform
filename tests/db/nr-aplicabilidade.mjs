import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { digest } from "../../scripts/nr/inventory.mjs";
import { loadManifest, sqlChecksum } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
import { migrationEnvelope } from "../../scripts/migrations/connector-batch.mjs";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw Error("Disposable loopback PostgreSQL required");
const options = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  max: 8,
  prepare: false,
  onnotice: () => {},
};
const admin = postgres({ ...options, database: "postgres" }),
  database = `nr_aplicabilidade_${process.pid}`;
const migrations = (await loadManifest(process.cwd())).slice(0, 68);
assert.equal(migrations[67].path, "drizzle/migrations/0049_nr_aplicabilidade_documental.sql");
let sql,
  checks = 0;
const check = (a, b, message) => {
  assert.deepEqual(a, b, message);
  checks++;
};
const reject = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
};
const [org, otherOrg, user, reader, outsider, client, unit, local, lot] = Array.from(
  { length: 9 },
  randomUUID,
);
const source = "synthetic-reviewed-source",
  version = "synthetic-explicit-decisions-v1";
try {
  await admin.unsafe(`create database ${database}`);
  sql = postgres({ ...options, database });
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  check((await applyMigrations(sql, migrations.slice(0, 67))).length, 67);
  await sql`insert into auth.users(id,email)values(${user},'applicability-eng@test.invalid'),(${reader},'applicability-reader@test.invalid'),(${outsider},'applicability-outsider@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'Synthetic applicability'),(${otherOrg},'Synthetic other applicability')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${user}),(${org},${reader}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${user},'engenharia'),(${org},${reader},'campo'),(${otherOrg},${outsider},'engenharia')`;
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Synthetic applicability client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Synthetic applicability unit')`;
  await sql`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag)values(${local},${org},${client},${unit},array['NR33'],'Synthetic confined space','EC 01')`;
  await sql`insert into public.nr_import_lotes(id,organization_id,origem,chave)values(${lot},${org},${source},'synthetic-applicability-import')`;
  const entries = [],
    parents = new Map();
  const seed = async (
    name,
    decision,
    { closed = false, edited = false, invalidHash = false, invalidEvidence = false } = {},
  ) => {
    const id = randomUUID(),
      external = `unit/${name}`;
    const payload = {
      id: name,
      unidade_id: "unit",
      local_id: "place",
      titulo: `Synthetic ${name}`,
      descricao:
        decision === "incluir_nr35"
          ? "Pendência documental do PGSSTA, sem aprovação operacional."
          : "Evidência preservada para análise.",
      situacao: closed ? "encerrada" : "aberta",
      autor: "Autor histórico sintético",
      data: "2026-09-01",
    };
    await sql`insert into public.nr_pendencias(id,organization_id,cliente_id,unidade_id,normas,titulo,descricao,local_id,estado,dados)values(${id},${org},${client},${unit},array['NR33'],${payload.titulo},${payload.descricao},${local},${payload.situacao},${sql.json(payload)})`;
    if (closed)
      await sql`insert into public.nr_tratativas(organization_id,pendencia_id,tipo,texto,autor_historico,data_origem)values(${org},${id},'historico_importado','Tratativa e diagnóstico integral preservado.','Autor histórico sintético','2026-09-02T00:00:00Z')`;
    const snapshot = (await sql`select to_jsonb(p)r from public.nr_pendencias p where id=${id}`)[0]
      .r;
    await sql`insert into public.nr_fontes(organization_id,origem,tipo,externo_id,destino_tipo,destino_id,payload,sha256,capturado_em,snapshot_destino,lote_id)values(${org},${source},'pendencia',${external},'pendencias',${id},${sql.json(payload)},${digest(payload)},now(),${sql.json(snapshot)},${lot})`;
    if (edited)
      await sql`update public.nr_pendencias set titulo='Edição posterior feita na Nexus' where id=${id}`;
    const evidence =
      decision === "incluir_nr35"
        ? [
            {
              campo: "descricao",
              trecho: "PGSSTA",
              campo_sha256: invalidEvidence ? "0".repeat(64) : digest(payload.descricao),
            },
          ]
        : [];
    const entry = {
      externo_id: external,
      destino_id: id,
      cliente_id: client,
      unidade_id: unit,
      local_id: local,
      fonte_sha256: invalidHash ? "0".repeat(64) : digest(payload),
      decisao: decision,
      normas: decision === "incluir_nr35" ? ["NR33", "NR35"] : ["NR33"],
      justificativa: "Decisão documental sintética, sem emissão nem validação de segurança.",
      evidencias: evidence,
    };
    entries.push(entry);
    parents.set(name, { id, payload, snapshot, entry });
    return id;
  };
  const open = await seed("open", "incluir_nr35"),
    closed = await seed("closed", "incluir_nr35", { closed: true });
  const maintained = await seed("maintained", "manter_recorte"),
    ambiguous = await seed("ambiguous", "revisao_pendente");
  const edited = await seed("edited", "incluir_nr35", { edited: true }),
    invalidHash = await seed("wrong-hash", "incluir_nr35", { invalidHash: true }),
    invalidEvidence = await seed("wrong-evidence", "incluir_nr35", { invalidEvidence: true });
  entries.push({
    ...parents.get("maintained").entry,
    externo_id: "unit/missing",
    destino_id: randomUUID(),
  });
  const state = async () =>
    (
      await sql`select jsonb_agg(to_jsonb(p)order by id)pendencias,(select jsonb_agg(to_jsonb(t)order by id)from public.nr_tratativas t where organization_id=${org})tratativas,(select jsonb_agg(to_jsonb(f)order by id)from public.nr_fontes f where organization_id=${org})fontes from public.nr_pendencias p where organization_id=${org}`
    )[0];
  const before = await state();
  const petBefore =
    await sql`select p.oid,md5(pg_get_functiondef(p.oid))hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'pet\_%'order by p.oid`;
  const broken = { ...migrations[67], source: migrations[67].source + "\nselect 1/0;\n" };
  broken.sha256 = sqlChecksum(broken.source);
  await reject(() => applyMigrations(sql, [...migrations.slice(0, 67), broken]), "22012");
  check(
    (await sql`select to_regclass('public.nr_aplicabilidade_decisoes')r`)[0].r,
    null,
    "failed migration rolls back table and helper rename",
  );
  check(await state(), before, "failed upgrade cannot alter source or current records");
  check((await sql`select count(*)::integer n from nexus_migrations.applied`)[0].n, 67);
  check((await applyMigrations(sql, migrations)).length, 1);
  check(
    await state(),
    before,
    "production-specific manifest never affects unrelated synthetic identities",
  );
  check(
    await sql`select p.oid,md5(pg_get_functiondef(p.oid))hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'pet\_%'order by p.oid`,
    petBefore,
    "PET unchanged",
  );
  const apply = (manifest = entries, ver = version) =>
    sql.begin(
      async (tx) =>
        (
          await tx`select public.nr_aplicabilidade_manifesto_aplicar(${org},${source},${ver},${tx.json(manifest)})r`
        )[0].r,
    );
  const results = await Promise.all([apply(), apply(), apply()]);
  check(
    results.filter((r) => r.novas_decisoes === entries.length).length,
    1,
    "one effects transaction across concurrent replays",
  );
  check(results.filter((r) => r.decisoes_ja_registradas === entries.length).length, 2);
  check(
    (
      await sql`select count(*)::integer n from public.nr_aplicabilidade_decisoes where organization_id=${org}`
    )[0].n,
    entries.length,
  );
  const after = await state(),
    byId = new Map(after.pendencias.map((p) => [p.id, p]));
  check(byId.get(open).normas, ["NR33", "NR35"]);
  check(byId.get(closed).normas, ["NR33", "NR35"]);
  check(byId.get(closed).estado, "encerrada", "historically closed concern stays closed");
  check(
    byId.get(open).version,
    parents.get("open").snapshot.version + 1,
    "one version increment despite concurrent retries",
  );
  for (const name of ["open", "closed"]) {
    const expected = { ...parents.get(name).snapshot },
      actual = { ...byId.get(parents.get(name).id) };
    for (const key of ["normas", "version", "updated_at"]) {
      delete expected[key];
      delete actual[key];
    }
    check(actual, expected, "only recorded norms and normal version metadata changed");
  }
  check(after.tratativas, before.tratativas, "all closed treatments/authors/dates preserved");
  check(
    after.fontes,
    before.fontes,
    "raw origin and frozen import snapshots remain byte-for-byte JSON equivalent",
  );
  for (const id of [maintained, ambiguous, edited, invalidHash, invalidEvidence])
    check(byId.get(id).normas, ["NR33"], "unproved or divergent records remain unmodified");
  check(byId.get(edited).titulo, "Edição posterior feita na Nexus");
  const decisions =
    await sql`select pendencia_id,resultado,aprovacao_profissional,autoriza_operacao from public.nr_aplicabilidade_decisoes where organization_id=${org}`;
  check(decisions.filter((d) => d.resultado === "aplicada").length, 2);
  check(decisions.filter((d) => d.resultado === "pendente_divergencia").length, 3);
  check(decisions.filter((d) => d.resultado === "pendente_analise").length, 1);
  check(decisions.filter((d) => d.resultado === "sem_correspondencia").length, 1);
  check(
    decisions.every((d) => !d.aprovacao_profissional && !d.autoriza_operacao),
    true,
  );
  const command = {
    entidade: "pendencias",
    registro: {
      cliente_id: client,
      unidade_id: unit,
      normas: ["NR33"],
      titulo: parents.get("open").payload.titulo,
      descricao: parents.get("open").payload.descricao,
      local_id: local,
      dados: parents.get("open").payload,
    },
  };
  const imported = (
    await sql`select public.nr_importar_item(${org},${lot},'pendencia','unit/open',${sql.json(parents.get("open").payload)},${sql.json(command)},${digest(parents.get("open").payload)},now())r`
  )[0].r;
  check(
    imported.resultado,
    "ja_existente",
    "same source import replay cannot overwrite reconciled applicability",
  );
  check((await sql`select normas from public.nr_pendencias where id=${open}`)[0].normas, [
    "NR33",
    "NR35",
  ]);
  const as = (actor, fn) =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
  check(
    await as(
      reader,
      async (tx) =>
        (
          await tx`select count(*)::integer n from public.nr_aplicabilidade_decisoes where organization_id=${org}`
        )[0].n,
    ),
    entries.length,
    "authorized viewer reads decision evidence",
  );
  check(
    await as(
      outsider,
      async (tx) =>
        (
          await tx`select count(*)::integer n from public.nr_aplicabilidade_decisoes where organization_id=${org}`
        )[0].n,
    ),
    0,
    "decision RLS isolates organizations",
  );
  await reject(
    () =>
      as(
        user,
        (tx) =>
          tx`select public.nr_aplicabilidade_manifesto_aplicar(${org},${source},${version},${tx.json(entries)})`,
      ),
    "42501",
  );
  await reject(
    () =>
      as(
        user,
        (tx) =>
          tx`update public.nr_aplicabilidade_decisoes set justificativa='Alteração não autorizada'where organization_id=${org}`,
      ),
    "42501",
  );
  await reject(
    () =>
      sql`update public.nr_aplicabilidade_decisoes set justificativa='Histórico não reescrevível'where organization_id=${org}`,
    "23514",
  );
  await reject(
    () => apply([{ ...entries[0], justificativa: "Outro conteúdo usando mesma versão" }]),
    "23505",
  );
  const detail = await as(
    reader,
    async (tx) =>
      (
        await tx`select public.nr_consultar(${org},'NR35','pendencias',${tx.json({ id: closed })})r`
      )[0].r,
  );
  check(detail.decisoes_aplicabilidade[0].resultado, "aplicada");
  check(detail.tratativas[0].autor_historico, "Autor histórico sintético");
  check(detail.estado, "encerrada");
  check((await applyMigrations(sql, migrations)).length, 0);
  await sql.unsafe(migrationEnvelope(migrations, migrations[67]));
  check(
    await state(),
    after,
    "manifest/envelope replay keeps revised records and original evidence intact",
  );
  // Concurrent legitimate edit wins over old import snapshot; no blind retry applies its old decision.
  const race = await seed("race-edit", "incluir_nr35"),
    raceEntry = parents.get("race-edit").entry;
  const holding = sql.begin(async (tx) => {
    await tx`update public.nr_pendencias set titulo='Edição concorrente preservada'where id=${race}`;
    await tx`select pg_sleep(0.15)`;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const racing = apply([raceEntry], "synthetic-concurrent-edit-v1");
  await holding;
  const raceResult = await racing;
  check(raceResult.resultados.pendente_divergencia, 1);
  check((await sql`select normas,titulo from public.nr_pendencias where id=${race}`)[0], {
    normas: ["NR33"],
    titulo: "Edição concorrente preservada",
  });
  const importing = await seed("race-import", "incluir_nr35"),
    importingData = parents.get("race-import");
  const heldDecision = sql.begin(async (tx) => {
    const r = (
      await tx`select public.nr_aplicabilidade_manifesto_aplicar(${org},${source},'synthetic-import-race-v1',${tx.json([importingData.entry])})r`
    )[0].r;
    await tx`select pg_sleep(0.15)`;
    return r;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const newPayload = {
    ...importingData.payload,
    descricao: "Nova evidência externa que exige conciliação",
  };
  const incoming = sql.begin(
    async (tx) =>
      (
        await tx`select public.nr_importar_item(${org},${lot},'pendencia','unit/race-import',${tx.json(newPayload)},${tx.json({ entidade: "pendencias", registro: { ...command.registro, titulo: newPayload.titulo, descricao: newPayload.descricao, dados: newPayload } })},${digest(newPayload)},now())r`
      )[0].r,
  );
  await heldDecision;
  check(
    (await incoming).resultado,
    "conflito",
    "new source import observes reviewed norms after canonical source lock",
  );
  check(
    (await sql`select normas from public.nr_pendencias where id=${importing}`)[0].normas,
    ["NR33", "NR35"],
    "concurrent new source cannot overwrite reviewed applicability",
  );
  console.log(
    JSON.stringify({
      suite: "NR applicability reviewed manifest upgrade68",
      assertions: checks,
      passed: true,
      scope:
        "Synthetic isolated PostgreSQL only; exact source identity/hash/excerpt, no normative inference, whole-snapshot conflicts, historical closed state/treatments, RLS, owner-only execution, migration failure/replay, import replay, concurrent duplicate and concurrent edit preservation; no production writes or operational approval.",
    }),
  );
} finally {
  await sql?.end({ timeout: 3 });
  await admin.unsafe(`drop database if exists ${database} with(force)`);
  await admin.end();
}
