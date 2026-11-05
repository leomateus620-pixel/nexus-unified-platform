import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../cotrirosa/fixture.mjs";
const f = await fixture(`cotrirosa_test_${Date.now()}`),
  { sql, org, user, reader, person, client, unit, other } = f;
let checks = 0;
async function as(who, fn) {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${who},true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
}
const read = (tx, u = unit, n = "NR33") =>
  tx`select nr_contratacao_obter(${org},${client},${u},${n}) r`.then((x) => x[0].r);
const save = (
  tx,
  docs,
  version,
  key = randomUUID(),
  source = "Contrato de teste controlado - não operacional",
) =>
  tx`select nr_contratacao_salvar(${org},${client},${unit},'NR33',${version},${key},${docs},${source}) r`.then(
    (x) => x[0].r,
  );
async function denied(fn, code) {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
}
try {
  const initial = await as(user, (tx) => read(tx));
  assert.equal(initial.catalogo.length, 13);
  assert.equal(initial.confirmada, false);
  assert.equal(initial.pode_alterar, false);
  assert.deepEqual(initial.documentos, ["memorial"]);
  checks += 4;
  await denied(() => as(user, (tx) => save(tx, ["memorial"], 0)), "42501");
  await sql`update pessoas set registro_profissional='FIXTURE-RT-001' where id=${person}`;
  await sql`insert into pet_responsaveis_tecnicos(organization_id,pessoa_id,designacao,inicio)values(${org},${person},'DESIGNAÇÃO FICTÍCIA EXCLUSIVA DE TESTE',now()-interval '1 hour')`;
  await denied(() => as(user, (tx) => save(tx, ["pet"], 0)), "23514");
  await denied(() => as(user, (tx) => save(tx, ["memorial", "inventado"], 0)), "23514");
  await denied(() => as(reader, (tx) => save(tx, ["memorial"], 0)), "42501");
  const key = randomUUID(),
    a = await as(user, (tx) => save(tx, ["memorial", "cadastro_ec", "pet"], 0, key));
  assert.equal(a.version, 1);
  assert.equal(a.confirmada, true);
  checks += 2;
  const again = await as(user, (tx) => save(tx, ["memorial", "cadastro_ec", "pet"], 0, key));
  assert.equal(again.version, 1);
  assert.equal(again.historico.length, 1);
  checks += 2;
  const nr35 = await as(user, (tx) => read(tx, unit, "NR35"));
  assert.deepEqual(nr35.documentos, a.documentos);
  checks++;
  assert.equal((await as(user, (tx) => read(tx, other))).confirmada, false);
  checks++;
  await denied(() => as(user, (tx) => save(tx, ["memorial", "pae"], 0)), "40001");
  await denied(() => as(user, (tx) => save(tx, ["memorial", "pae"], 1, key)), "23505");
  const doc = (tipo) =>
    as(
      user,
      (tx) =>
        tx`select nr_executar(${org},'NR33','documentos','salvar',null,null,${randomUUID()},${tx.json({ cliente_id: client, unidade_id: unit, titulo: "Documento de teste", tipo, conteudo: { schema_version: 1, blocos: [] } })}) r`,
    );
  await denied(() => doc("PAE"), "23514");
  await denied(() => doc("Tipo arbitrário"), "23514");
  await doc("Cadastro de EC");
  checks++;
  const original = (
    await sql`select id from nr_documentos where organization_id=${org} and tipo='Cadastro de EC' limit 1`
  )[0].id;
  const derived = (
    await sql`insert into nr_documentos(organization_id,cliente_id,unidade_id,normas,titulo,tipo)values(${org},${client},${unit},array['NR33'],'Cópia controlada de teste','derivado_docx')returning id`
  )[0].id;
  const revision = (
    await sql`insert into nr_documento_revisoes(organization_id,documento_id,numero)values(${org},${derived},1)returning id`
  )[0].id;
  await sql`update nr_documentos set revisao_atual_id=${revision} where id=${derived}`;
  await sql`insert into nr_documento_relacoes(organization_id,documento_id,documento_relacionado_id,tipo,evidencia)values(${org},${derived},${original},'referencia','{"tipo":"derivado_docx_editavel"}')`;
  const revise = async () => {
    const v = (await sql`select version from nr_documentos where id=${derived}`)[0].version;
    return as(
      user,
      (tx) =>
        tx`select nr_executar(${org},'NR33','documentos','nova_revisao',${derived},${v},${randomUUID()},'{"motivo":"Revisão controlada de cópia rastreada"}')`,
    );
  };
  await revise();
  checks++;
  const before = await sql`select count(*)::int n from nr_documentos where organization_id=${org}`;
  await as(user, (tx) => save(tx, ["memorial"], 1));
  assert.equal(
    (await sql`select count(*)::int n from nr_documentos where organization_id=${org}`)[0].n,
    before[0].n,
  );
  checks++;
  await denied(() => revise(), "23514");
  await denied(
    () => sql`update nr_contratacao_eventos set depois='{}' where organization_id=${org}`,
    "23514",
  );
  await denied(() => as(user, (tx) => tx`select * from nr_contratacoes`), "42501");
  await denied(
    () =>
      as(
        user,
        (tx) =>
          tx`select nr_executar_ate61(${org},'NR33','documentos','salvar',null,null,'bypass-test','{}')`,
      ),
    "42501",
  );
  await sql`update pet_responsaveis_tecnicos set fim=now() where organization_id=${org}`;
  await denied(() => as(user, (tx) => save(tx, ["memorial"], 2)), "42501");
  console.log(
    JSON.stringify({
      passed: checks,
      scope:
        "catálogo, RT autenticado, retry, conflito, unidade, NR35, bloqueio de geração, RLS e revogação",
    }),
  );
} finally {
  await sql.end();
}
