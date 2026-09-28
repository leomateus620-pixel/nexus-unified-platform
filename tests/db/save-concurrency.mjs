import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Run ONLY in the ephemeral database created by tests/db/run.sh or run.ps1.
const bin = process.env.PGTEST_PSQL || "psql";
const args = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  process.env.PGTEST_HOST || "127.0.0.1",
  "-p",
  process.env.PGTEST_PORT || "55432",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
function sql(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let output = "",
      errors = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (errors += b));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(errors))));
    child.stdin.end(source);
  });
}
const fixture = (await readFile(new URL("./save-checkpoints.sql", import.meta.url), "utf8")).split(
  "create temp table captured",
)[0];
await sql(fixture + "\ncommit;");
const auth =
  "set role authenticated; select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false);";
await sql(
  auth +
    "update sistemas_dimensionados set identificacao='Concurrent' where id='35000000-0000-0000-0000-000000000001';",
);
const op = "36000000-0000-0000-0000-000000000099";
const query =
  auth +
  `with c as (select capturar_revisao('34000000-0000-0000-0000-000000000001','${op}') v)
select case when v?'confirmacao' then v->'confirmacao' else concluir_revisao('34000000-0000-0000-0000-000000000001',(v->>'versao')::bigint,(v->>'versao_salva')::bigint,v->'snapshot','{"motor_versao":"concurrency-test","entradas":{},"itens":[],"resumo":{"totais":{"final":1},"pendencias":[],"por_sistema":[],"por_componente":[]}}','${op}') end from c;`;
const responses = await Promise.all(Array.from({ length: 10 }, () => sql(query)));
assert.equal(
  new Set(responses).size,
  1,
  "ten simultaneous retries must return exactly the same operation",
);
assert.equal(await sql(`select count(*) from proposta_salvamentos where id='${op}';`), "1");
assert.equal(
  await sql(
    `select count(*) from calculo_execucoes where revisao_id='34000000-0000-0000-0000-000000000001';`,
  ),
  "1",
);
console.log(
  "PASS: ten PostgreSQL sessions, one operation/event/calculation, identical persistent response",
);
