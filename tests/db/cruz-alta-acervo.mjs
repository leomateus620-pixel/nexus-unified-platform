import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { loadManifest } from "../../scripts/migrations/manifest.mjs";
import { applyMigrations } from "../../scripts/migrations/executor.mjs";
import { migrationEnvelope } from "../../scripts/migrations/connector-batch.mjs";

if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
) {
  throw Error("Este cenário requer PostgreSQL descartável no loopback.");
}
const options = {
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  database: process.env.PGTEST_DATABASE || "postgres",
  username: "postgres",
  max: 1,
  prepare: false,
  onnotice: () => {},
};
const database = "cruz_alta_acervo_" + process.pid;
const control = postgres(options),
  sql = postgres({ ...options, database }),
  other = postgres({ ...options, database });
const migrations = (await loadManifest(process.cwd())).slice(0, 106);
assert.equal(migrations.at(-1).path, "drizzle/migrations/0082_nr_cena_evidencias.sql");
// Correspondência exclusiva do catálogo, testada somente no cluster descartável acima.
const org = "abab473b-8baa-4781-aed2-c1243338af65",
  client = "c3d779b6-c407-8ab4-8545-6bdfd6068013",
  unit = "a9f6603b-6497-8e9e-822a-dfc860510c1a";
const [otherUnit, editor, viewer, outsider] = Array.from({ length: 4 }, randomUUID);
const original = "cobertura-11",
  shared = "cobertura-56",
  roof = "cobertura-28.1";
async function login(db, id) {
  await db.unsafe("reset role");
  await db`select set_config('request.jwt.claim.sub',${id},false)`;
  await db.unsafe("set role authenticated");
}
const get = async (db, key) => (await db`select ca_ficha(${org},${key}) r`)[0].r;
const denied = async (fn, code) => assert.rejects(fn, (e) => e.code === code);
let checks = 0;
const passed = (name) => {
  checks++;
  console.log("PASS " + name);
};
await control.unsafe("create database " + database);
try {
  await sql.unsafe(
    (await readFile("tests/db/bootstrap.sql", "utf8")).replace(/^create role anon[^\n]*\n/m, ""),
  );
  await applyMigrations(sql, migrations.slice(0, 103));
  for (const u of [editor, viewer, outsider])
    await sql`insert into auth.users(id,email) values(${u},${u + "@cruz-alta.test.invalid"})`;
  await sql`insert into organizations(id,nome) values(${org},'TESTE CRUZ ALTA DESCARTÁVEL')`;
  for (const u of [editor, viewer, outsider])
    await sql`insert into memberships(organization_id,user_id) values(${org},${u})`;
  await sql`insert into user_roles(organization_id,user_id,role) values(${org},${editor},'engenharia')`;
  await sql`insert into clientes(id,organization_id,razao_social) values(${client},${org},'TESTE ACERVO')`;
  for (const id of [unit, otherUnit])
    await sql`insert into unidades(id,organization_id,cliente_id,nome) values(${id},${org},${client},${"TESTE " + id})`;
  await sql`insert into nr_cenas_unidade(organization_id,cliente_id,unidade_id,cena,estado) values(${org},${client},${otherUnit},'outra-cena-teste','publicada')`;
  for (const m of migrations.slice(103)) {
    const envelope = migrationEnvelope(migrations, m);
    await sql.unsafe(envelope);
    await sql.unsafe(envelope);
  }
  assert.deepEqual(await applyMigrations(sql, migrations), []);
  assert.equal((await sql`select count(*)::int n from nr_cena_elementos`)[0].n, 213);
  assert.equal(
    (await sql`select cena from nr_cenas_unidade where unidade_id=${otherUnit}`)[0].cena,
    "outra-cena-teste",
  );
  passed(
    "0080/0081/0082 aplicadas e repetidas pelo envelope e runner com preservação da cena legada",
  );
  for (const [id, user] of [
    [unit, viewer],
    [otherUnit, outsider],
  ])
    await sql`insert into nr_cena_consultores values(${org},${client},${id},${user},true)`;

  await login(sql, editor);
  assert.ok((await sql`select ca_provisionar(${org}) r`)[0].r.quantidade > 0);
  assert.equal((await sql`select ca_provisionar(${org}) r`)[0].r.quantidade, 0);
  passed("provisionamento sem duplicação");
  const inventory = (rows) => sql`select ca_conciliar_inventario(${org},${sql.json(rows)}) r`;
  const sources = [
    { sourceId: "teste-1", revision: 5 },
    { sourceId: "teste-2", revision: 3 },
  ];
  const initial = (await inventory(sources))[0].r;
  assert.equal((await inventory([...sources].reverse()))[0].r.id, initial.id);
  assert.equal((await sql`select ca_inventario(${org}) r`)[0].r.length, 2);
  passed("inventário privado por conteúdo e reconciliação sem duplicação");
  await login(other, editor);
  const before = await get(sql, roof),
    concurrent = await get(other, roof);
  const after = (
    await sql`select ca_salvar(${org},${roof},${before.version},'{"observacoes":"TESTE de persistência"}') r`
  )[0].r;
  assert.equal(after.version, before.version + 1);
  await denied(
    () =>
      other`select ca_salvar(${org},${roof},${concurrent.version},'{"observacoes":"versão obsoleta"}')`,
    "40001",
  );
  assert.equal((await get(other, roof)).observacoes, "TESTE de persistência");
  passed("edição concorrente em duas conexões e auditoria");

  async function prepare(op, hash, key = original) {
    return (
      await sql`select ca_preparar(${org},${key},${op},${sql.json({ nome: "teste.pdf", mime: "application/pdf", tamanho: 400, sha256: hash })}) r`
    )[0].r;
  }
  async function verify(a, hash) {
    await sql.unsafe("reset role");
    await sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-nr-acervo',${a.caminho},'{"size":400,"mimetype":"application/pdf"}')`;
    await sql.unsafe("set role service_role");
    await sql`select ca_bytes_verificados(${org},${a.id},${editor},${hash},400,'application/pdf')`;
    await login(sql, editor);
  }
  const op = randomUUID(),
    hash = "a".repeat(64),
    a = await prepare(op, hash);
  const meta = {
    titulo: "Desenho TESTE",
    rotulo: "01",
    data: "2026-10-28",
    escopo: "conjunto",
    origem: {
      sistema: "google_drive",
      id: "teste-externo",
      pagina: 1,
      documento_chave: "conj-teste",
    },
  };
  const publish = async (key, k, id, data) =>
    (await sql`select ca_publicar(${org},${key},${k},${id},${sql.json(data)}) r`)[0].r;
  await denied(() => publish(original, op, a.id, meta), "23514");
  assert.equal((await prepare(op, hash)).id, a.id);
  assert.equal((await get(sql, original)).documentos.length, 0);
  const bad = randomUUID(),
    badHash = "f".repeat(64),
    oldPath = await prepare(bad, badHash);
  assert.equal(
    (await sql`select ca_retirar_pendente(${org},${original},${bad},${oldPath.id}) r`)[0].r,
    oldPath.caminho,
  );
  const recovered = await prepare(bad, badHash);
  assert.notEqual(recovered.caminho, oldPath.caminho);
  assert.equal((await prepare(bad, badHash)).id, recovered.id);
  passed("caminho incompleto retirado e retomado com a mesma operação");
  await verify(a, hash);
  const first = await publish(original, op, a.id, meta);
  assert.deepEqual(await publish(original, op, a.id, meta), first);
  passed("interrupção antes do commit, retomada e repetição idempotente");
  const fromOrigin = (
    await sql`select ca_localizar_origem(${org},${original},'conj-teste','teste-externo',${hash}) r`
  )[0].r;
  assert.equal(fromOrigin.revisao_id, first.revisao_id);
  const parallelHash = "c".repeat(64);
  const contenders = await Promise.all(
    [sql, other].map(
      (db) =>
        db`select ca_preparar(${org},${original},${randomUUID()},${db.json({ nome: "paralelo.pdf", mime: "application/pdf", tamanho: 404, sha256: parallelHash })}) r`,
    ),
  );
  assert.equal(contenders[0][0].r.id, contenders[1][0].r.id);
  assert.equal(
    (
      await sql`select count(*)::int n from nr_arquivos where organization_id=${org} and sha256=${parallelHash}`
    )[0].n,
    1,
  );
  passed("preparos simultâneos de conteúdo idêntico reservam um único caminho");
  const copy = await prepare(randomUUID(), hash, shared);
  assert.equal(copy.id, a.id);
  await sql`select ca_vinculo(${org},${shared},${first.documento_id},'conjunto',false)`;
  const op2 = randomUUID(),
    hash2 = "b".repeat(64),
    b = await prepare(op2, hash2);
  await verify(b, hash2);
  const second = await publish(original, op2, b.id, {
    ...meta,
    rotulo: "02",
    data: "2026-11-18",
    documento_id: first.documento_id,
    anterior_id: first.revisao_id,
  });
  const s = await get(other, shared);
  assert.equal(s.documentos.length, 1);
  assert.equal(s.documentos[0].vigente_id, second.revisao_id);
  assert.equal(s.documentos[0].revisoes.length, 2);
  assert.equal(
    (await sql`select ca_previa(${org},${shared},${first.documento_id},${first.revisao_id}) r`)[0].r
      .arquivo_id,
    a.id,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from nr_arquivos where organization_id=${org} and estado='vinculado'`
    )[0].n,
    2,
  );
  passed("duas revisões, dois itens, deduplicação e prévia histórica");
  const edited = (
    await sql`select ca_metadados(${org},${original},${first.documento_id},${s.documentos[0].version},'Desenho corrigido','Descrição de teste') r`
  )[0].r.documentos[0];
  assert.equal(edited.titulo, "Desenho corrigido");
  assert.equal(edited.vigente_id, second.revisao_id);
  assert.equal(edited.revisoes.length, 2);
  assert.equal((await get(other, shared)).documentos[0].descricao, "Descrição de teste");
  assert.ok(
    (await sql`select ca_disponiveis(${org},${original}) r`)[0].r.some(
      (d) => d.titulo === edited.titulo,
    ),
  );
  await denied(
    () =>
      other`select ca_metadados(${org},${shared},${first.documento_id},${s.documentos[0].version},'Título concorrente','')`,
    "40001",
  );
  passed("errata de metadados entre objetos sem alterar a revisão original");
  const imgIntent = randomUUID(),
    imgHash = "d".repeat(64);
  const img = (
    await sql`select ca_preparar(${org},${roof},${imgIntent},${sql.json({ nome: "sem-data.png", mime: "image/png", tamanho: 302, sha256: imgHash })}) r`
  )[0].r;
  await sql.unsafe("reset role");
  await sql`insert into storage.objects(bucket_id,name,metadata) values('nexus-nr-acervo',${img.caminho},'{"size":302,"mimetype":"image/png"}')`;
  await sql.unsafe("set role service_role");
  await sql`select ca_bytes_verificados(${org},${img.id},${editor},${imgHash},302,'image/png')`;
  await login(sql, editor);
  const noDate = {
    ...meta,
    titulo: "TESTE · Foto sem data",
    rotulo: "Original",
    data: null,
    categoria: "foto",
    escopo: "individual",
    origem: {
      sistema: "google_drive",
      id: "imagem-teste",
      pagina: 1,
      documento_chave: "img-1",
      nota: "Suporta o alinhamento entre esta galeria e o beiral.",
    },
  };
  await denied(
    () => publish(roof, imgIntent, img.id, { ...noDate, categoria: "individual" }),
    "23514",
  );
  await publish(roof, imgIntent, img.id, noDate);
  const evidence = (await get(sql, roof)).documentos[0].revisoes[0];
  assert.equal(evidence.data, null);
  assert.equal(evidence.nota, noDate.origem.nota);
  assert.equal(evidence.autor, editor);
  assert.ok(evidence.publicado_em);
  passed(
    "foto conferida sem data interna mantém NULL e apresenta nota, autoria e data da inclusão",
  );
  await login(other, viewer);
  assert.equal((await get(other, shared)).documentos.length, 1);
  await denied(
    () => other`select ca_salvar(${org},${shared},1,'{"observacoes":"indevido"}')`,
    "42501",
  );
  assert.ok(
    (
      await other`select ca_previa(${org},${shared},${first.documento_id},${second.revisao_id}) r`
    )[0].r.arquivo_id,
  );
  await denied(
    () => other`select ca_previa(${org},${roof},${first.documento_id},${second.revisao_id})`,
    "42501",
  );
  await sql.unsafe("reset role");
  await sql`update nr_cena_consultores set permite_original=false where usuario_id=${viewer}`;
  assert.equal((await get(other, shared)).documentos.length, 1);
  await denied(
    () => other`select ca_previa(${org},${shared},${first.documento_id},${second.revisao_id})`,
    "42501",
  );
  assert.equal(
    (await other`select count(*)::int n from nr_arquivos where organization_id=${org}`)[0].n,
    0,
  );
  assert.equal(
    (await other`select count(*)::int n from storage.objects where bucket_id='nexus-nr-acervo'`)[0]
      .n,
    0,
  );
  await denied(() => other`select ca_inventario(${org})`, "42501");
  await denied(
    () => other`update nr_cena_consultores set permite_original=true where usuario_id=${viewer}`,
    "42501",
  );
  await sql`delete from nr_cena_consultores where usuario_id=${viewer}`;
  await denied(() => get(other, shared), "42501");
  await login(sql, editor);
  passed("revogação da prévia, bloqueio de download direto e revogação da unidade");
  await login(other, outsider);
  await denied(() => get(other, shared), "42501");
  assert.equal(
    (await other`select count(*)::int n from nr_arquivos where organization_id=${org}`)[0].n,
    0,
  );
  assert.equal(
    (await other`select count(*)::int n from storage.objects where bucket_id='nexus-nr-acervo'`)[0]
      .n,
    0,
  );
  passed("consulta delegada, integridade do link e isolamento de outra unidade");
  await sql`select ca_vinculo(${org},${shared},${first.documento_id},'conjunto',true)`;
  assert.equal((await get(sql, shared)).documentos.length, 0);
  assert.equal((await get(sql, original)).documentos[0].revisoes.length, 2);
  assert.ok(
    (await get(sql, shared)).historico.some(
      (h) => h.comando === "desvincular_documento" && h.autor === editor,
    ),
  );
  passed("desvinculação com retenção dos demais vínculos, revisões e autoria");
  console.log(
    checks +
      " cenários de banco passaram. Storage simulado apenas por metadados no cluster descartável.",
  );
} finally {
  await Promise.all([sql.end(), other.end()]);
  try {
    await control.unsafe("drop database " + database);
  } finally {
    await control.end();
  }
}
