// Administratively closed-state fixture, NEVER an issued/valid permit.
// Runs only in the explicitly isolated loopback laboratory, not an application command.
import postgres from "postgres";
import { writeFile } from "node:fs/promises";
import { ids, options } from "./fixture.mjs";
const database = process.env.NEXUS_COTRIROSA_LAB_DB || "cotrirosa_lab";
if (!/^cotrirosa_(lab|test_\d+)$/.test(database)) throw Error("Banco fora do laboratório");
const db = postgres({ ...options(), database });
try {
  await db`select set_config('request.jwt.claim.sub',${ids.user},false)`;
  const local = (
    await db`select pet_espaco_id from nr_locais where organization_id=${ids.org} and id=${ids.locals[1]}`
  )[0];
  const closed = "a0300000-0000-4000-8000-000000000801";
  await db`insert into pet_permissoes(id,organization_id,cliente_id,unidade_id,espaco_id,local_nr_id,atividade,timezone,termino_previsto,snapshot_identificacao,estado_documental,condicao_operacional,encerrada_em)
 values(${closed},${ids.org},${ids.client},${ids.unit},${local.pet_espaco_id},${ids.locals[1]},'FIXTURE CONTROLADA · encerrada por carga administrativa, sem emissão ou assinatura','America/Sao_Paulo',now(),'{"fixture":"encerrada administrativamente; sem validade operacional","espaco":{"identificacao":"SA 02 · fixture"},"local":{"tag":"EC 25"}}','encerrada','terminada',now()) on conflict(id)do nothing`;
  const legacy = (
    await db`select id from pet_permissoes where organization_id=${ids.org} and atividade='Legado antes da migração'`
  )[0].id;
  await writeFile(
    "docs/cotrirosa/controlled-fixtures.json",
    JSON.stringify({ closed, legacy }, null, 2),
  );
  console.log(
    "Closed-state fixture ready; no emission, signature, original or presence generated.",
  );
} finally {
  await db.end();
}
