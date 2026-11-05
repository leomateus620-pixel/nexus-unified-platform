import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../cotrirosa/fixture.mjs";
const f = await fixture(`cotrirosa_test_${Date.now()}`, {
    procedure: {
      itens: [
        { id: "foto", rotulo: "Foto de teste", foto_obrigatoria: true, gps_obrigatorio: true },
      ],
      agentes: [],
      qualificacoes: [],
      procedimento_resgate: "FIXTURE",
    },
  }),
  { sql, org, user, reader, client, unit, other, locals, spaces, version } = f;
let checks = 0;
const end = new Date(Date.now() + 4 * 3600000).toISOString();
const as = (who, fn) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${who},true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
const denied = async (fn, code) => {
  await assert.rejects(fn, (e) => e.code === code);
  checks++;
};
const create = (norm = "NR33", key = randomUUID()) =>
  as(user, (tx) =>
    tx`select pet_executar(${org},${tx.json({ comando: "criar_pet", chave: key, dados: { cliente_id: client, unidade_id: unit, local_id: locals[1], espaco_id: spaces[1], norma: norm, os_id: null, atividade: "FIXTURE V2 - inspeção controlada", termino_previsto: end, timezone: "America/Sao_Paulo", modelo_versao_id: version } })}) r`.then(
      (r) => r[0].r,
    ),
  );
try {
  await denied(() => create(), "23514");
  await sql`update nr_locais set normas=array['NR33'] where organization_id=${org}`;
  assert.equal(
    (await as(user, (tx) => tx`select nr_mapa_contexto(${org},${client},${unit},'NR35') r`))[0].r
      .objetos.length,
    0,
  );
  checks++;
  await sql`insert into nr_documentos(organization_id,cliente_id,unidade_id,local_id,normas,titulo,tipo)values(${org},${client},${unit},${locals[1]},array['NR35'],'Correspondência NR35 fixture','anexo_pgssta')`;
  assert.equal(
    (await as(user, (tx) => tx`select nr_mapa_contexto(${org},${client},${unit},'NR35') r`))[0].r
      .objetos.length,
    1,
  );
  checks++;
  await f.authorizeModel();
  const key = randomUUID(),
    p = await create("NR35", key);
  assert.equal(p.detalhe.pet.norma_origem, "NR35");
  checks++;
  assert.equal(
    (await sql`select normas from nr_locais where id=${locals[1]}`)[0].normas.join(","),
    "NR33",
  );
  checks++;
  assert.ok(p.detalhe.pendencias.some((x) => x.codigo === "foto_documentada"));
  checks++;
  const anexo = randomUUID();
  await sql`insert into anexos(id,organization_id,pet_id,pet_item,nome,mime,tamanho,sha256,caminho,estado,confirmado_em)values(${anexo},${org},${p.id},'foto','imagem-fixture-sem-original-real.png','image/png',100,${"b".repeat(64)},${`fixture/${anexo}.png`},'vinculado',now())`;
  const data = {
      capturada_em: new Date().toISOString(),
      latitude: -27.8,
      longitude: -54.4,
      precisao_m: null,
      origem: "declarada",
      legenda: "Metadados fixture controlada",
    },
    k = randomUUID();
  const photo = (who = user, v = p.detalhe.pet.version, d = data, a = anexo, receipt = k) =>
    as(who, (tx) =>
      tx`select pet_foto_registrar(${org},${p.id},${a},${v},${receipt},${tx.json(d)}) r`.then(
        (r) => r[0].r,
      ),
    );
  await denied(() => photo(reader), "42501");
  await denied(() => photo(user, 99), "40001");
  await denied(() => photo(user, p.detalhe.pet.version, { ...data, latitude: 100 }), "23514");
  const a = await photo();
  assert.equal((await photo()).id, a.id);
  checks++;
  assert.equal(
    (
      await sql`select count(*)::int n from pet_eventos_operacionais where pet_id=${p.id} and tipo='foto_documentada'`
    )[0].n,
    1,
  );
  checks++;
  assert.equal(
    (await as(user, (tx) => tx`select pet_obter(${org},${p.id}) r`))[0].r.pendencias.some(
      (x) => x.codigo === "foto_documentada",
    ),
    false,
  );
  checks++;
  await denied(
    () => sql`update pet_foto_metadados set legenda='mudança indevida' where id=${a.id}`,
    "23514",
  );
  await denied(() => as(user, (tx) => tx`select * from pet_foto_metadados`), "42501");
  await sql`update nr_contratacoes set documentos=array['memorial'] where organization_id=${org} and unidade_id=${unit}`;
  assert.equal((await create("NR35", key)).id, p.id);
  checks++;
  await denied(() => create("NR35"), "23514");
  // Controlled records beyond the first page, never actual operational permits.
  await sql`insert into pet_permissoes(organization_id,cliente_id,unidade_id,espaco_id,local_nr_id,atividade,timezone,termino_previsto,snapshot_identificacao)select ${org},${client},${unit},${spaces[1]},${locals[1]},'Fixture paginação '||n,'America/Sao_Paulo',now()+interval '4 hours','{"local":{"tag":"EC 25"}}'::jsonb from generate_series(1,105)n`;
  const exp = (u = unit, space = spaces[1]) =>
    as(user, (tx) =>
      tx`select pet_exportar_unidade(${org},${client},${u},'NR33',${tx.json({ espaco_id: space })}) r`.then(
        (r) => r[0].r,
      ),
    );
  assert.equal((await exp()).total, 106);
  checks++;
  assert.equal(
    (await exp()).registros.every((x) => x.espaco_id === spaces[1]),
    true,
  );
  checks++;
  assert.equal((await exp(unit, spaces[0])).total, 1);
  checks++;
  await denied(() => exp(other), "42501");
  await denied(() => as(reader, (tx) => tx`select pet_fotos_listar(${org},${p.id})`), "42501");
  console.log(
    JSON.stringify({
      passed: checks,
      scope:
        "contratação, contexto NR35 relacional, idempotência, foto/GPS, original imutável, RLS, CSV completo e isolamento",
    }),
  );
} finally {
  await sql.end();
}
