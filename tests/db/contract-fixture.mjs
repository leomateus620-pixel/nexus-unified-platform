import { randomUUID } from "node:crypto";

/** Test prerequisite, never imported by the application or migration code.
 * A synthetic contract permits the older OS command regression scenarios.
 * It does not designate an RT or approve a real client's contracted scope. */
export async function contractFixture(q, { org, client, unit, user }) {
  if (process.env.PGTEST_EPHEMERAL !== "1" || process.env.PGTEST_HOST !== "127.0.0.1")
    throw Error("Contract fixture requires disposable loopback PostgreSQL");
  const person = randomUUID();
  await q("reset role");
  try {
    await q(
      "insert into pessoas(id,organization_id,nome,vinculo) values($1,$2,'Responsável contratual FIXTURE DESCARTÁVEL','colaborador')",
      [person, org],
    );
    await q(
      "insert into nr_contratacoes(organization_id,cliente_id,unidade_id,documentos,version,fonte,responsavel_id,updated_by) values($1,$2,$3,array['memorial','pet'],1,'Contrato sintético de regressão da API legada; não operacional',$4,$5)",
      [org, client, unit, person, user],
    );
  } finally {
    await q("set role authenticated");
  }
}
