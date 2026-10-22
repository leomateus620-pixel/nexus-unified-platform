import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Executado exclusivamente no cluster descartável de run.sh/run.ps1, após operacional.sql.
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
const org = "51000000-0000-0000-0000-000000000001";
const auth =
  "set role authenticated; select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);";
function sql(source) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.env.PGTEST_PSQL || "psql", args);
    let stdout = "",
      stderr = "";
    processHandle.stdout.on("data", (data) => (stdout += data));
    processHandle.stderr.on("data", (data) => (stderr += data));
    processHandle.on("error", reject);
    processHandle.on("exit", (code) =>
      code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)),
    );
    processHandle.stdin.end(source);
  });
}
const repeatedKey = "53000000-0000-0000-0000-000000000001";
const create = `${auth} select public.salvar_pessoa('${org}','${repeatedKey}','{"nome":"Pessoa concorrência","vinculo":"prestador"}');`;
const responses = await Promise.all(Array.from({ length: 10 }, () => sql(create)));
assert.equal(new Set(responses).size, 1, "ten retries return identical server response");
assert.equal(
  await sql(`select count(*) from public.operacoes_idempotentes where chave='${repeatedKey}'`),
  "1",
);
assert.equal(
  await sql("select count(*) from public.pessoas where nome='Pessoa concorrência'"),
  "1",
);
const personId = JSON.parse(responses[0].split(/\r?\n/).at(-1)).id;
assert.equal(
  await sql(
    `select count(*) from public.operacao_historico where entidade='pessoas' and entidade_id='${personId}'`,
  ),
  "1",
);
console.log("PASS: ten PostgreSQL sessions create one person, one receipt and one audit event");

const edits = await Promise.allSettled(
  ["A", "B"].map((suffix, index) =>
    sql(
      `${auth} begin; select public.salvar_pessoa('${org}','53000000-0000-0000-0000-00000000000${index + 2}','{"nome":"Concurrent edit ${suffix}","vinculo":"prestador"}','${personId}',1); select pg_sleep(0.2); commit;`,
    ),
  ),
);
assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
assert.match(
  edits.find((result) => result.status === "rejected").reason.message,
  /Recarregue antes de salvar/,
);
assert.equal(await sql(`select version from public.pessoas where id='${personId}'`), "2");
assert.equal(
  await sql(
    `select count(*) from public.operacao_historico where entidade='pessoas' and entidade_id='${personId}'`,
  ),
  "2",
);
console.log(
  "PASS: concurrent expected_version edits preserve one winner and reject the stale writer",
);

const teamId = await sql(
  `select id from public.equipes where organization_id='${org}' and nome='Equipe operacional A'`,
);
const memberships = await Promise.allSettled(
  ["4", "5"].map((suffix) =>
    sql(
      `${auth} begin; select public.vincular_membro_equipe('${org}','53000000-0000-0000-0000-00000000000${suffix}','${teamId}','${personId}','2026-11-01'); select pg_sleep(0.2); commit;`,
    ),
  ),
);
assert.equal(memberships.filter((result) => result.status === "fulfilled").length, 1);
assert.match(
  memberships.find((result) => result.status === "rejected").reason.message,
  /já pertence à equipe/,
);
assert.equal(
  await sql(
    `select count(*) from public.equipe_membros where equipe_id='${teamId}' and pessoa_id='${personId}'`,
  ),
  "1",
);
console.log("PASS: simultaneous overlapping team memberships confirm a single temporal link");

const conflictingRetries = await Promise.allSettled(
  ["Original", "Different"].map((name) =>
    sql(
      `${auth} select public.salvar_pessoa('${org}','53000000-0000-0000-0000-000000000006','{"nome":"${name} idempotency payload","vinculo":"prestador"}');`,
    ),
  ),
);
assert.equal(conflictingRetries.filter((result) => result.status === "fulfilled").length, 1);
assert.match(
  conflictingRetries.find((result) => result.status === "rejected").reason.message,
  /Chave reutilizada com conteúdo diferente/,
);
console.log(
  "PASS: simultaneous same-key requests with different payloads conflict without returning another result",
);
