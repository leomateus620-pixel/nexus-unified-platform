// Controlled fixtures ONLY in disposable loopback PostgreSQL. Never imported by src.
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
import { migrationEnvelope } from "../../scripts/migrations/connector-batch.mjs";
export const ids = {
  org: "a0300000-0000-4000-8000-000000000001",
  user: "a0300000-0000-4000-8000-000000000002",
  person: "a0300000-0000-4000-8000-000000000003",
  reader: "a0300000-0000-4000-8000-000000000004",
  client: "9d6dfbe8-285a-44e5-9ea1-2574daa7cb28",
  unit: "6a454dcc-82b2-4506-aca3-410a3cc820f2",
  other: "a0300000-0000-4000-8000-000000000007",
  locals: [
    "ed835456-14f5-430a-a12b-55a92c86c018",
    "8b0ed1b7-53df-4743-8be1-6b34221e471e",
    "18f64e04-8674-4870-a7cd-8b633e1b2282",
    "d1977ff8-36ab-4241-a884-bee802df1b94",
    "c640b3bd-2731-490d-ab3a-d47a7953bce0",
  ],
};
export const options = () => {
  if (
    process.env.PGTEST_EPHEMERAL !== "1" ||
    process.env.PGTEST_HOST !== "127.0.0.1" ||
    !/^55\d{3}$/.test(process.env.PGTEST_PORT || "")
  )
    throw Error("Dedicated loopback cluster required");
  return {
    host: "127.0.0.1",
    port: Number(process.env.PGTEST_PORT),
    user: "postgres",
    prepare: false,
    max: 1,
    onnotice() {},
  };
};
export async function fixture(
  name,
  {
    procedure = {
      itens: [],
      agentes: [],
      qualificacoes: [],
      procedimento_resgate: "FIXTURE - não operacional",
    },
  } = {},
) {
  if (!/^cotrirosa_(lab|test_\d+)$/.test(name)) throw Error("Invalid disposable DB");
  const admin = postgres({ ...options(), database: "postgres" });
  try {
    await admin.unsafe(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const sql = postgres({ ...options(), database: name });
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  const migrations = await loadManifest(process.cwd());
  const unitMigration = migrations.findIndex((m) =>
    m.path.endsWith("/0061_nr_mapa_pet_unidade.sql"),
  );
  if (unitMigration < 0) throw Error("Migração de referência não encontrada");
  await applyMigrations(sql, migrations.slice(0, unitMigration));
  const { org, user, reader, person, client, unit, other, locals } = ids;
  await sql`insert into auth.users(id,email)values(${user},'operator@test.invalid'),(${reader},'reader@test.invalid')`;
  await sql`insert into organizations(id,nome)values(${org},'FIXTURE CONTROLADA - sem validade operacional')`;
  await sql`insert into memberships(organization_id,user_id)values(${org},${user}),(${org},${reader})`;
  await sql`insert into user_roles(organization_id,user_id,role)values(${org},${user},'admin'),(${org},${reader},'campo')`;
  await sql`select set_config('request.jwt.claim.sub',${user},false)`;
  await sql`insert into clientes(id,organization_id,razao_social,nome_exibicao)values(${client},${org},'Cliente de teste isolado','COTRIROSA · laboratório')`;
  await sql`insert into unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Fábrica de Ração — Santa Rosa'),(${other},${org},${client},'Outra unidade · fixture')`;
  await sql`insert into nr_contextos(organization_id,cliente_id,unidade_id,normas)values(${org},${client},${unit},array['NR33','NR35']),(${org},${client},${other},array['NR33','NR35'])`;
  await sql`insert into pessoas(id,organization_id,nome,vinculo,user_id)values(${person},${org},'Operador de teste','colaborador',${user})`;
  const spaces = [];
  for (let i = 0; i < 5; i++) {
    const e = randomUUID();
    spaces.push(e);
    await sql`insert into pet_espacos(id,organization_id,unidade_id,identificacao,localizacao)values(${e},${org},${unit},${`SA 0${i + 1} · fixture`},'Posição ilustrativa do laboratório')`;
    await sql`insert into nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag,aliases,pet_espaco_id,dados)values(${locals[i]},${org},${client},${unit},array['NR33','NR35'],${i === 4 ? "Silo de milho · SA 05" : "Silo de matéria-prima · SA 0" + (i + 1)},${"EC " + (24 + i)},${["SA 0" + (i + 1)]},${e},'{}')`;
  }
  const os = (
    await sql`insert into ordens_servico(organization_id,cliente_id,unidade_id,titulo)values(${org},${client},${unit},'OS real de teste')returning id`
  )[0].id;
  const legacy = (
    await sql`insert into pet_permissoes(organization_id,os_id,cliente_id,unidade_id,espaco_id,atividade,timezone,termino_previsto,snapshot_identificacao)values(${org},${os},${client},${unit},${spaces[0]},'Legado antes da migração','America/Sao_Paulo',now()+interval '4 hours','{"fixture":"anterior","espaco":{"identificacao":"SA 01 legado"}}')returning *`
  )[0];
  for (const migration of migrations.slice(unitMigration))
    await sql.unsafe(migrationEnvelope(migrations, migration));
  const model = (
    await sql`insert into pet_modelos(organization_id,nome)values(${org},'FIXTURE CONTROLADA · procedimento não operacional')returning id`
  )[0].id;
  const version = (
    await sql`insert into pet_modelo_versoes(organization_id,modelo_id,versao,procedimento,sha256)values(${org},${model},1,${sql.json(procedure)},${"a".repeat(64)})returning id`
  )[0].id;
  const authorizeModel = () =>
    sql.begin(async (tx) => {
      await tx`insert into nr_contratacoes(organization_id,cliente_id,unidade_id,documentos,version,fonte,responsavel_id,updated_by)values(${org},${client},${unit},array['memorial','pet'],1,'FIXTURE CONTROLADA - contratação de teste',${person},${user})on conflict do nothing`;
      return tx`update pet_modelo_versoes set estado='aprovado',aprovado_por=${person},aprovado_em=now(),declaracao_aprovacao='FIXTURE CONTROLADA. Não é aprovação real nem habilita emissão.' where id=${version}`;
    });
  return { sql, ...ids, spaces, os, legacy, model, version, authorizeModel };
}
