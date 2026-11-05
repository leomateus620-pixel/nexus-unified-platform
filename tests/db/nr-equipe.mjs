import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../cotrirosa/fixture.mjs";
const f = await fixture(`cotrirosa_test_${Date.now()}`),
  { sql, org, user, reader, person, client, unit, other } = f;
let checks = 0;
const as = (who, fn) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${who},true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
const list = (tx, u = unit) =>
  tx`select nr_unidade_equipe(${org},${client},${u},'NR33',0,'') r`.then((x) => x[0].r);
const link = (tx, key = randomUUID(), version = 0, active = true) =>
  tx`select nr_unidade_pessoa_salvar(${org},${client},${unit},${"NR33"},${person},'Operação - fixture',${active},${version},${key}) r`.then(
    (x) => x[0].r,
  );
async function denied(fn, code) {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
}
try {
  assert.equal((await as(user, (tx) => list(tx))).total, 0);
  checks++;
  await denied(() => as(reader, (tx) => link(tx)), "42501");
  const key = randomUUID(),
    a = await as(user, (tx) => link(tx, key));
  assert.equal(a.version, 1);
  assert.equal((await as(user, (tx) => link(tx, key))).version, 1);
  checks += 2;
  await denied(() => as(user, (tx) => link(tx, randomUUID(), 0)), "40001");
  const c = (
    await sql`insert into competencias(organization_id,nome,exige_evidencia,exige_validade)values(${org},'Treinamento de teste',false,true)returning id`
  )[0].id;
  const qdata = {
    pessoa_id: person,
    competencia_id: c,
    emissor: "Emissor de teste",
    conclusao: "2026-01-01",
    validade: "2026-11-20",
    carga_horaria: 8,
    tipo_treinamento: "periodico",
    modalidade: "presencial",
  };
  const q = (
    await as(
      user,
      (tx) => tx`select salvar_qualificacao(${org},${randomUUID()},${tx.json(qdata)}) r`,
    )
  )[0].r;
  assert.equal(q.carga_horaria, 8);
  assert.equal(q.estado, "enviada");
  checks += 2;
  const page = await as(user, (tx) => list(tx));
  assert.equal(page.total, 1);
  assert.equal(page.registros[0].certificados[0].carga_horaria, 8);
  checks += 2;
  assert.equal((await as(user, (tx) => list(tx, other))).total, 0);
  assert.equal((await as(reader, (tx) => list(tx))).total, 0);
  checks += 2;
  await denied(
    () =>
      as(
        user,
        (tx) =>
          tx`select salvar_qualificacao(${org},${randomUUID()},${tx.json({ ...qdata, carga_horaria: -8 })})`,
      ),
    "23514",
  );
  const legacy = (
    await as(
      user,
      (tx) =>
        tx`select salvar_qualificacao(${org},${randomUUID()},${tx.json({ pessoa_id: person, competencia_id: c, emissor: "Legado teste", conclusao: "2026-01-01", validade: "2026-11-10" })}) r`,
    )
  )[0].r;
  assert.equal(legacy.carga_horaria, null);
  checks++;
  await sql`update pessoa_qualificacoes set validade=(now() at time zone 'America/Sao_Paulo')::date+15 where id=${legacy.id}`;
  assert.ok((await as(user, (tx) => list(tx))).vence_em_30_dias >= 1);
  checks++;
  await as(user, (tx) => link(tx, randomUUID(), 1, false));
  assert.equal((await as(user, (tx) => list(tx))).vence_em_30_dias, 0);
  checks++;
  await denied(() => as(user, (tx) => tx`select * from nr_unidade_pessoas`), "42501");
  console.log(
    JSON.stringify({
      passed: checks,
      scope: "vínculo explícito, pessoas canônicas, horas, alertas, legado, RLS e isolamento",
    }),
  );
} finally {
  await sql.end();
}
