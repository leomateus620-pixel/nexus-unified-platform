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
let legacyEngineeringVersion;
let legacyWarehouseReceipt;
try {
  const legacyPeSource = await readFile(
    path.join(root, "drizzle/migrations/0014_projetos_engenharia.sql"),
    "utf8",
  );
  const peopleCorrection = migrations.find((item) =>
    item.path.endsWith("0025_pessoas_autorizacao_atual.sql"),
  );
  if (peopleCorrection) {
    const legacyPeople = (
      await readFile(path.join(root, "drizzle/migrations/0012_operational_foundation.sql"), "utf8")
    ).replace(/\r\n/g, "\n");
    const names = [
      "salvar_pessoa",
      "salvar_equipe",
      "vincular_membro_equipe",
      "encerrar_membro_equipe",
      "salvar_competencia",
      "salvar_qualificacao",
      "transicionar_qualificacao",
    ];
    for (const name of names) {
      const original = legacyPeople.match(
        new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
      )[0];
      const updated = peopleCorrection.source
        .replace(/\r\n/g, "\n")
        .match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
      let expected = original
        .replace("create function", "create or replace function")
        .replace(" begin\n", " begin\n  perform public.lev_travar_autor(_org,auth.uid());\n");
      if (name === "transicionar_qualificacao")
        expected = expected.replace(
          "if public.operacao_minha_pessoa(_org,q.pessoa_id) then",
          "if exists(select 1 from public.pessoas where organization_id=_org and id=q.pessoa_id and user_id=auth.uid()) then",
        );
      assert.equal(
        updated,
        expected,
        `${name}: correction preserves its canonical payload, signature and business rules`,
      );
    }
    assert.equal((peopleCorrection.source.match(/create or replace function/g) || []).length, 7);
  }
  const studiesSource = migrations.find((item) =>
    item.path.endsWith("0022_estudos_tecnicos.sql"),
  )?.source;
  if (studiesSource) {
    const oldCommand = legacyPeSource.match(/create function public\.pe_executar[\s\S]*?\$\$;/)[0];
    const newCommand = studiesSource.match(
      /create or replace function public\.pe_executar[\s\S]*?\$\$;/,
    )[0];
    assert.equal(
      newCommand
        .replace("create or replace function", "create function")
        .replace(
          "'organization_id',p.organization_id,'cliente_id',p.cliente_id,'unidade_id',p.unidade_id,",
          "",
        )
        .replace(/\r\n/g, "\n"),
      oldCommand.replace(/\r\n/g, "\n"),
      "PE command must preserve every branch except the explicit frozen context IDs",
    );
  }
  const appliedBaseline = await applyMigrations(sql, migrations.slice(0, 30));
  assert.equal(appliedBaseline.length, 30);
  await sql.unsafe(`
    insert into public.organizations(id,nome) values('58000000-0000-0000-0000-000000000001','Legacy upgrade fixture');
    insert into public.clientes(id,organization_id,razao_social)
    values('58000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','Client retained across upgrade');
  `);
  const operationalCheckpoint = Math.min(40, migrations.length);
  const beforeLatest = await applyMigrations(sql, migrations.slice(0, operationalCheckpoint));
  if (operationalCheckpoint === 40) {
    // Prova adicional do upgrade do checkpoint operacional efetivamente publicado.
    await sql.begin(async (tx) => {
      await tx.unsafe(`insert into auth.users(id,email) values('58000000-0000-0000-0000-000000000003','upgrade-operational@test.invalid');
        insert into public.memberships(organization_id,user_id) values('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000003');
        insert into public.user_roles(organization_id,user_id,role) values('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000003','engenharia');
        select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true);
        insert into public.pessoas(id,organization_id,nome,vinculo) values('58000000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001','Operational person retained across upgrade','prestador');`);
    });
    legacyEngineeringVersion = await sql.begin(async (tx) => {
      await tx.unsafe(`insert into public.unidades(id,organization_id,cliente_id,nome)
        values('58000000-0000-0000-0000-000000000005','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000002','Unit retained from checkpoint40');
        set local role authenticated;
        select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true);`);
      const org = "58000000-0000-0000-0000-000000000001";
      const data = {
        titulo: "Legacy frozen engineering archive",
        cliente_id: "58000000-0000-0000-0000-000000000002",
        unidade_id: "58000000-0000-0000-0000-000000000005",
        responsavel_id: "58000000-0000-0000-0000-000000000004",
        resumo: "Frozen before context IDs were recorded",
        modelo: {
          schema_version: 1,
          familia: "documental",
          finalidade: "estudo",
          secoes: [
            {
              id: "58000000-0000-0000-0000-000000000006",
              titulo: "Legacy content",
              texto: "Preserved original archive",
            },
          ],
          parametros: [],
        },
      };
      let [row] =
        await tx`select public.pe_executar(${org},'58000000-0000-0000-0000-000000000007','criar',${tx.json(data)}) as value`;
      let payload = {
        projeto_id: row.value.projeto.id,
        versao_id: row.value.versao.id,
        expected_version: row.value.versao.version,
      };
      [row] =
        await tx`select public.pe_executar(${org},'58000000-0000-0000-0000-000000000008','submeter',${tx.json(payload)}) as value`;
      payload.expected_version = row.value.versao.version;
      [row] =
        await tx`select public.pe_executar(${org},'58000000-0000-0000-0000-000000000009','congelar',${tx.json(payload)}) as value`;
      assert.equal(row.value.versao.snapshot.projeto.cliente_id, undefined);
      return row.value.versao;
    });
  }
  // The currently published checkpoint41 must upgrade without inventing physical balances.
  const warehouseCheckpoint = migrations.some((entry) =>
    entry.path.endsWith("0023_almoxarifado.sql"),
  )
    ? await applyMigrations(sql, migrations.slice(0, 41))
    : [];
  if (warehouseCheckpoint.length) {
    legacyWarehouseReceipt = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
      await tx.unsafe(`
        set local session_replication_role=replica;
        insert into public.produtos(id,organization_id,codigo,descricao,unidade,indivisivel)
        values('58000000-0000-0000-0000-000000000020','58000000-0000-0000-0000-000000000001','UPGRADE-PHYSICAL','Legacy received product','PÇ',true);
        set local session_replication_role=origin;
        insert into public.fornecedores(id,organization_id,nome) values('58000000-0000-0000-0000-000000000021','58000000-0000-0000-0000-000000000001','Legacy receiving supplier');
        insert into public.propostas(id,organization_id,numero,cliente_id) values('58000000-0000-0000-0000-000000000022','58000000-0000-0000-0000-000000000001','UPGRADE-PHYSICAL/26','58000000-0000-0000-0000-000000000002');
        insert into public.proposta_revisoes(id,organization_id,proposta_id,numero,totais,desatualizada) values('58000000-0000-0000-0000-000000000023','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000022',1,'{}',false);
        insert into public.revisao_componentes(id,organization_id,revisao_id,produto_id,codigo,descricao,unidade,modalidade,custo_adotado,indivisivel,multiplo_compra) values('58000000-0000-0000-0000-000000000024','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000023','58000000-0000-0000-0000-000000000020','UPGRADE-PHYSICAL','Legacy received product','PÇ','comprar',100,true,1);
        insert into public.demandas(id,organization_id,revisao_id,revisao_componente_id,modalidade,quantidade_necessaria,quantidade_planejada) values('58000000-0000-0000-0000-000000000025','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000023','58000000-0000-0000-0000-000000000024','comprar',10,10);
        insert into public.ordens_compra(id,organization_id,numero,revisao_id,fornecedor_id) values('58000000-0000-0000-0000-000000000026','58000000-0000-0000-0000-000000000001','OC-UPGRADE-PHYSICAL','58000000-0000-0000-0000-000000000023','58000000-0000-0000-0000-000000000021');
        insert into public.ordem_compra_itens(id,organization_id,ordem_id,demanda_id,quantidade) values('58000000-0000-0000-0000-000000000027','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000026','58000000-0000-0000-0000-000000000025',10);
        update public.ordens_compra set status='emitida' where id='58000000-0000-0000-0000-000000000026';
        set local role authenticated;`);
      const [received] =
        await tx`select public.registrar_movimento('recebimento','58000000-0000-0000-0000-000000000027',10,'upgrade-checkpoint41-receipt') value`;
      return (
        await tx`select to_jsonb(r) value from public.recebimentos r where id=${received.value.id}`
      )[0].value;
    });
  }
  let warehouseRelationsCheckpoint = [];
  if (migrations.some((entry) => entry.path.endsWith("0024_suprimentos_relacoes_univocas.sql"))) {
    warehouseRelationsCheckpoint = await applyMigrations(sql, migrations.slice(0, 42));
    const [before] =
      await sql`select count(*)::int count from pg_constraint where contype='f' and conrelid='public.ordem_compra_itens'::regclass and confrelid='public.ordens_compra'::regclass`;
    assert.equal(
      before.count,
      2,
      "checkpoint42 must reproduce the ambiguous PostgREST relationship before the corrective upgrade",
    );
  }
  let peopleAuthorizationCheckpoint = [];
  let identityCheckpoint = [];
  let historicalIdentity;
  if (peopleCorrection) {
    peopleAuthorizationCheckpoint = await applyMigrations(sql, migrations.slice(0, 43));
    const [oldCommand] =
      await sql`select pg_get_functiondef('public.salvar_equipe(uuid,uuid,jsonb,uuid,integer)'::regprocedure) as definition`;
    assert.equal(
      oldCommand.definition.includes("perform public.lev_travar_autor(_org,auth.uid())"),
      false,
    );
  }
  if (migrations.some((item) => item.path.endsWith("0026_pessoas_identidade_conferencia.sql"))) {
    identityCheckpoint = await applyMigrations(sql, migrations.slice(0, 44));
    historicalIdentity = await sql.begin(async (tx) => {
      await tx.unsafe(`insert into auth.users(id,email) values('58000000-0000-0000-0000-000000000101','identity-upgrade@test.invalid');
        insert into public.memberships(organization_id,user_id) values('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000101');
        set local role authenticated;
        select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true);`);
      const data = {
        nome: "Person with a server-recorded former association",
        vinculo: "prestador",
        user_id: "58000000-0000-0000-0000-000000000101",
      };
      const [created] =
        await tx`select public.salvar_pessoa('58000000-0000-0000-0000-000000000001',gen_random_uuid(),${data}::jsonb) as value`;
      await tx`select public.salvar_pessoa('58000000-0000-0000-0000-000000000001',gen_random_uuid(),${{ ...data, user_id: null }}::jsonb,${created.value.id},1)`;
      return created.value.id;
    });
  }
  const upgrade = [
    ...beforeLatest,
    ...warehouseCheckpoint,
    ...warehouseRelationsCheckpoint,
    ...peopleAuthorizationCheckpoint,
    ...identityCheckpoint,
    ...(await applyMigrations(sql, migrations)),
  ];
  if (historicalIdentity) {
    const [retained] =
      await sql`select count(*)::integer as count from public.pessoa_usuario_identidades where organization_id='58000000-0000-0000-0000-000000000001' and pessoa_id=${historicalIdentity} and user_id='58000000-0000-0000-0000-000000000101'`;
    assert.equal(retained.count, 1);
    const [person] = await sql`select user_id from public.pessoas where id=${historicalIdentity}`;
    assert.equal(person.user_id, null);
    console.log(
      "PASS: checkpoint44 → 45 preserves known identity from private receipts without rebinding the operational person",
    );
  }
  if (peopleCorrection) {
    const [currentCommand] =
      await sql`select pg_get_functiondef('public.salvar_equipe(uuid,uuid,jsonb,uuid,integer)'::regprocedure) as definition`;
    assert.equal(
      currentCommand.definition.includes("perform public.lev_travar_autor(_org,auth.uid())"),
      true,
    );
    console.log(
      "PASS: checkpoint43 → 44 hardens current authorization without changing existing records or RPC signatures",
    );
  }
  if (warehouseRelationsCheckpoint.length) {
    const [after] =
      await sql`select count(*)::int count from pg_constraint where contype='f' and conrelid='public.ordem_compra_itens'::regclass and confrelid='public.ordens_compra'::regclass`;
    assert.equal(after.count, 1);
    await sql.begin(async (tx) => {
      // DML direto no cluster descartável: isolar as FKs dos guards de autoria/imutabilidade.
      // DISABLE TRIGGER USER mantém todos os triggers internos de integridade referencial ativos.
      await tx.unsafe(`
        insert into public.organizations(id,nome) values('58000000-0000-0000-0000-000000000090','Cross tenant FK test');
        alter table public.ordens_compra disable trigger user;
        alter table public.ordens_producao disable trigger user;
        alter table public.ordem_compra_itens disable trigger user;
        alter table public.ordem_producao_itens disable trigger user;
        alter table public.recebimentos disable trigger user;
        alter table public.apontamentos disable trigger user;
        insert into public.ordens_producao(id,organization_id,numero,revisao_id)
        values('58000000-0000-0000-0000-000000000091','58000000-0000-0000-0000-000000000001','FK-UPGRADE-OP','58000000-0000-0000-0000-000000000023');
        insert into public.ordem_producao_itens(id,organization_id,ordem_id,demanda_id,quantidade)
        values('58000000-0000-0000-0000-000000000092','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000091','58000000-0000-0000-0000-000000000025',1);
        insert into public.apontamentos(id,organization_id,item_id,quantidade)
        values('58000000-0000-0000-0000-000000000093','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000092',1);
      `);
      for (const [table, id] of [
        ["ordens_compra", "58000000-0000-0000-0000-000000000026"],
        ["ordem_compra_itens", "58000000-0000-0000-0000-000000000027"],
        ["recebimentos", legacyWarehouseReceipt.id],
        ["ordens_producao", "58000000-0000-0000-0000-000000000091"],
        ["ordem_producao_itens", "58000000-0000-0000-0000-000000000092"],
        ["apontamentos", "58000000-0000-0000-0000-000000000093"],
      ]) {
        await assert.rejects(
          tx.savepoint((sp) =>
            sp.unsafe(
              `update public.${table} set organization_id='58000000-0000-0000-0000-000000000090' where id=$1`,
              [id],
            ),
          ),
          (error) => error.code === "23503",
        );
      }
      // Esvaziar apenas estas três fixtures novas antes de reativar os guards.
      await tx.unsafe(`delete from public.apontamentos where id='58000000-0000-0000-0000-000000000093';
        delete from public.ordem_producao_itens where id='58000000-0000-0000-0000-000000000092';
        delete from public.ordens_producao where id='58000000-0000-0000-0000-000000000091';
        delete from public.organizations where id='58000000-0000-0000-0000-000000000090';
        alter table public.ordens_compra enable trigger user;
        alter table public.ordens_producao enable trigger user;
        alter table public.ordem_compra_itens enable trigger user;
        alter table public.ordem_producao_itens enable trigger user;
        alter table public.recebimentos enable trigger user;
        alter table public.apontamentos enable trigger user;`);
    });
    console.log(
      "PASS: six direct cross-tenant supply writes remain rejected by real composite FKs after removing redundant relationships",
    );
    console.log(
      "PASS: checkpoint42 → 43 reproduces duplicate relationships before correction and retains one composite relationship afterwards",
    );
  }
  if (legacyWarehouseReceipt) {
    const [preserved] =
      await sql`select to_jsonb(r) value from public.recebimentos r where id=${legacyWarehouseReceipt.id}`;
    assert.deepEqual(preserved.value, legacyWarehouseReceipt);
    const [physical] =
      await sql`select count(*)::int count from public.estoque_movimentos where organization_id='58000000-0000-0000-0000-000000000001'`;
    assert.equal(physical.count, 0);
    const [received] =
      await sql`select quantidade_recebida::text quantity from public.ordem_compra_itens where id='58000000-0000-0000-0000-000000000027'`;
    assert.equal(Number(received.quantity), 10);
    console.log(
      "PASS: checkpoint41 receipt and accumulator preserved on upgrade; no stock balance or conference inferred",
    );
  }
  if (operationalCheckpoint === 40) {
    const [{ retainedPerson }] =
      await sql`select count(*)::int as "retainedPerson" from public.pessoas where id='58000000-0000-0000-0000-000000000004' and nome='Operational person retained across upgrade'`;
    assert.equal(retainedPerson, 1);
    const [{ retainedAudit }] =
      await sql`select count(*)::int as "retainedAudit" from public.operacao_historico where entidade='pessoas' and entidade_id='58000000-0000-0000-0000-000000000004' and autor='58000000-0000-0000-0000-000000000003'`;
    assert.equal(retainedAudit, 1);
    console.log(
      `PASS: operational checkpoint 40 → ${migrations.length}; canonical person and audit retained`,
    );
    if (studiesSource) {
      const [legacy] =
        await sql`select snapshot,snapshot_sha256,public.est_pe_fonte_valida(organization_id,id,'58000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000005') as valid_source from public.pe_versoes where id=${legacyEngineeringVersion.id}`;
      assert.deepEqual(legacy.snapshot, legacyEngineeringVersion.snapshot);
      assert.equal(legacy.snapshot_sha256, legacyEngineeringVersion.snapshot_sha256);
      assert.equal(legacy.valid_source, false);
      await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
        const [options] =
          await tx`select public.est_opcoes('58000000-0000-0000-0000-000000000001','projetos_engenharia') as value`;
        assert.equal(
          options.value.registros.some((item) => item.id === legacyEngineeringVersion.id),
          false,
        );
      });
      const draftStudy = await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
        const [r] =
          await tx`select public.est_executar('58000000-0000-0000-0000-000000000001',gen_random_uuid(),'criar',jsonb_build_object('titulo','Upgrade source verification','tipo','memorial','cliente_id','58000000-0000-0000-0000-000000000002','unidade_id','58000000-0000-0000-0000-000000000005','responsavel_id','58000000-0000-0000-0000-000000000004')) as value`;
        return r.value;
      });
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe("set local role authenticated");
          await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
          await tx`select public.est_executar('58000000-0000-0000-0000-000000000001',gen_random_uuid(),'vincular_fonte',${tx.json({ estudo_id: draftStudy.estudo.id, revisao_id: draftStudy.revisao.id, expected_version: draftStudy.revisao.version, tipo: "projeto_engenharia", pe_versao_id: legacyEngineeringVersion.id, justificativa: "A name match is not sufficient identity evidence" })})`;
        }),
        (error) => error.code === "23514" && /IDs congelados/.test(error.message),
      );
      const recovered = await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
        const org = "58000000-0000-0000-0000-000000000001";
        let [r] =
          await tx`select public.pe_executar(${org},gen_random_uuid(),'nova_versao',${tx.json({ projeto_id: legacyEngineeringVersion.projeto_id, versao_id: legacyEngineeringVersion.id, resumo: "Context reviewed before new freeze" })}) as value`;
        const payload = {
          projeto_id: r.value.projeto.id,
          versao_id: r.value.versao.id,
          expected_version: r.value.versao.version,
        };
        [r] =
          await tx`select public.pe_executar(${org},gen_random_uuid(),'submeter',${tx.json(payload)}) as value`;
        payload.expected_version = r.value.versao.version;
        [r] =
          await tx`select public.pe_executar(${org},gen_random_uuid(),'congelar',${tx.json(payload)}) as value`;
        return r.value.versao;
      });
      assert.equal(recovered.snapshot.projeto.cliente_id, "58000000-0000-0000-0000-000000000002");
      assert.equal(recovered.snapshot.projeto.unidade_id, "58000000-0000-0000-0000-000000000005");
      await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claim.sub','58000000-0000-0000-0000-000000000003',true)`;
        const [r] =
          await tx`select public.est_executar('58000000-0000-0000-0000-000000000001',gen_random_uuid(),'vincular_fonte',${tx.json({ estudo_id: draftStudy.estudo.id, revisao_id: draftStudy.revisao.id, expected_version: draftStudy.revisao.version, tipo: "projeto_engenharia", pe_versao_id: recovered.id, justificativa: "New frozen revision with verified canonical context IDs" })}) as value`;
        assert.equal(r.value.fontes[0].pe_versao_id, recovered.id);
      });
      console.log(
        "PASS: pre-0022 frozen PE snapshot/hash preserved; legacy source rejected by selector and command; reviewed new version freezes canonical IDs and links correctly",
      );
    }
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
