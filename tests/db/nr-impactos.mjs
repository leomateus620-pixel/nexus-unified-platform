import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  process.env.PGTEST_HOST !== "127.0.0.1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") ||
  process.env.PGTEST_PORT === "5432"
)
  throw new Error("NR impact tests require isolated loopback PostgreSQL");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 6,
  prepare: false,
  onnotice: () => {},
});
const org = randomUUID(),
  otherOrg = randomUUID(),
  engineer = randomUUID(),
  admin = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID(),
  person = randomUUID(),
  client = randomUUID(),
  unit = randomUUID(),
  secondUnit = randomUUID(),
  foreignClient = randomUUID(),
  foreignUnit = randomUUID();
let assertions = 0;
const as = (user, fn) =>
  sql.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub',${user},true)`;
    return fn(tx);
  });
const query = (resource, filters = {}, norma = "NR33", user = engineer, organization = org) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_consultar(${organization},${norma},${resource},${tx.json(filters)}) r`
      )[0].r,
  );
const command = (resource, action, data = {}, id = null, version = null, user = engineer) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_executar(${org},'NR33',${resource},${action},${id},${version},${randomUUID()},${tx.json(data)}) r`
      )[0].r,
  );
const review = (
  doc,
  revision,
  docVersion,
  baseVersion,
  key = randomUUID(),
  reason = "Conferência técnica documentada no ambiente isolado",
  user = engineer,
  norma = "NR33",
  organization = org,
) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select public.nr_documento_revisar_impactos(${organization},${norma},${doc},${revision},${docVersion},${baseVersion},${key},${reason}) r`
      )[0].r,
  );
const reject = async (fn, code) => {
  await assert.rejects(fn, (error) => error.code === code);
  assertions++;
};
const scoped = (titulo, unidade = unit, extra = {}) => ({
  titulo,
  cliente_id: client,
  unidade_id: unidade,
  ...extra,
});
try {
  await sql`insert into auth.users(id,email)values(${engineer},'impact-eng@test.invalid'),(${admin},'impact-admin@test.invalid'),(${field},'impact-campo@test.invalid'),(${outsider},'impact-other@test.invalid')`;
  await sql`insert into public.organizations(id,nome)values(${org},'NR impact isolated'),(${otherOrg},'NR impact other')`;
  await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${admin}),(${org},${field}),(${otherOrg},${outsider})`;
  await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${admin},'admin'),(${org},${field},'campo'),(${otherOrg},${outsider},'engenharia')`;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`insert into public.pessoas(id,organization_id,nome,user_id,ativa,registro_profissional,vinculo,created_by)values(${person},${org},'Profissional isolado',${engineer},true,'REG-TESTE-0042','colaborador',${engineer})`;
  });
  await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'Impact client'),(${foreignClient},${otherOrg},'Impact other client')`;
  await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'Impact unit one'),(${secondUnit},${org},${client},'Impact unit two'),(${foreignUnit},${otherOrg},${foreignClient},'Impact foreign unit')`;
  const local = await command(
    "locais",
    "salvar",
    scoped("Local vinculado", unit, {
      tag: "EC 13A",
      normas: ["NR33", "NR35"],
      dados: { geometria: { diametro: "3", unidade: "m" } },
    }),
  );
  const unrelated = await command("locais", "salvar", scoped("Local sem relação"));
  const otherLocal = await command(
    "locais",
    "salvar",
    scoped("Mesmo TAG em outra unidade", secondUnit, { tag: "EC 13A" }),
  );
  const content = {
    schema_version: 1,
    blocos: [
      { id: randomUUID(), tipo: "paragrafo", texto: "Snapshot documental original preservado" },
    ],
  };
  const doc = await command(
    "documentos",
    "salvar",
    scoped("Documento de origem", unit, {
      local_id: local.id,
      normas: ["NR33", "NR35"],
      conteudo: content,
    }),
  );
  await command(
    "documentos",
    "salvar",
    scoped("Documento local não relacionado", unit, { local_id: unrelated.id, conteudo: content }),
  );
  await command(
    "documentos",
    "salvar",
    scoped("Documento de outra unidade", secondUnit, {
      local_id: otherLocal.id,
      conteudo: content,
    }),
  );
  await command(
    "documentos",
    "salvar",
    scoped("Documento geral sem vínculo", unit, { conteudo: content }),
  );
  const originalSnapshot = { origem: "emitido na origem", tag: "EC 13A", diametro: "3" };
  await sql`update public.nr_documento_revisoes set estado='emitido_origem',snapshot=${sql.json(originalSnapshot)},sha256=${"a".repeat(64)} where id=${doc.revisao_atual_id}`;
  await sql`update public.nr_documentos set estado='emitido_origem' where id=${doc.id}`;
  let issued = await query("documentos", { id: doc.id });
  assert.equal(issued.revisao_necessaria, false);
  assertions++;
  const changed = await command(
    "locais",
    "salvar",
    { titulo: "Local com base alterada", dados: { geometria: { diametro: "4", unidade: "m" } } },
    local.id,
    local.version,
  );
  issued = await query("documentos", { id: doc.id });
  assert.equal(issued.revisao_necessaria, true);
  assert.equal(issued.impactos_pendentes, 1);
  assert.equal(issued.impactos.length, 1);
  assert.deepEqual(issued.impactos[0].campos_alterados, ["dados", "titulo"]);
  assert.equal(issued.impactos[0].base_version_nova, changed.version);
  assertions++;
  const frozen = (
    await sql`select conteudo,snapshot,sha256,estado from public.nr_documento_revisoes where id=${doc.revisao_atual_id}`
  )[0];
  assert.deepEqual(frozen.conteudo, content);
  assert.deepEqual(frozen.snapshot, originalSnapshot);
  assert.equal(frozen.sha256, "a".repeat(64));
  assert.equal(frozen.estado, "emitido_origem");
  assertions++;
  assert.equal((await query("painel")).documentos_revisao_necessaria, 1);
  assert.equal(
    (await query("painel", { unidade_id: secondUnit })).documentos_revisao_necessaria,
    0,
  );
  assertions++;
  const list = await query("documentos");
  assert.equal(list.rows.filter((row) => row.revisao_necessaria).length, 1);
  assert.equal(list.rows.find((row) => row.id === doc.id).conteudo, undefined);
  assert.equal(
    (await query("documentos", {}, "NR35")).rows.find((row) => row.id === doc.id)
      .revisao_necessaria,
    true,
  );
  assertions++;
  await reject(
    () => review(doc.id, doc.revisao_atual_id, issued.version, changed.version),
    "23514",
  );
  await reject(
    () =>
      review(
        doc.id,
        doc.revisao_atual_id,
        issued.version,
        changed.version,
        randomUUID(),
        "Admin sem pessoa não confere",
        admin,
      ),
    "42501",
  );
  await reject(
    () =>
      review(
        doc.id,
        doc.revisao_atual_id,
        issued.version,
        changed.version,
        randomUUID(),
        "Campo não confere",
        field,
      ),
    "42501",
  );
  await reject(
    () =>
      review(
        doc.id,
        doc.revisao_atual_id,
        issued.version,
        changed.version,
        randomUUID(),
        "Outra organização",
        outsider,
      ),
    "42501",
  );
  const draft = await command(
    "documentos",
    "nova_revisao",
    { motivo: "Conferir impacto em revisão própria" },
    doc.id,
    issued.version,
  );
  await reject(
    () => review(doc.id, draft.revisao_atual_id, issued.version, changed.version),
    "40001",
  );
  await reject(() => review(doc.id, draft.revisao_atual_id, draft.version, local.version), "40001");
  await reject(
    () => command("documentos", "salvar", { local_id: unrelated.id }, doc.id, draft.version),
    "23514",
  );
  const key = randomUUID(),
    reason = "Conferido parâmetro alterado na nova revisão; nenhum original foi regenerado";
  const checked = await review(
    doc.id,
    draft.revisao_atual_id,
    draft.version,
    changed.version,
    key,
    reason,
    engineer,
    "NR35",
  );
  assert.equal(checked.impactos_revisados, 1);
  assert.equal(checked.registro.revisao_necessaria, false);
  assert.equal(checked.registro.impactos[0].revisao_destino_id, draft.revisao_atual_id);
  assert.equal(checked.registro.impactos[0].responsavel_id, person);
  assertions++;
  assert.equal(
    (
      await review(
        doc.id,
        draft.revisao_atual_id,
        draft.version,
        changed.version,
        key,
        reason,
        engineer,
        "NR35",
      )
    ).impactos_revisados,
    1,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_documento_impacto_revisoes where organization_id=${org}`
    )[0].n,
    1,
  );
  assertions++;
  await reject(
    () =>
      review(
        doc.id,
        draft.revisao_atual_id,
        draft.version,
        changed.version,
        key,
        "Outro motivo",
        engineer,
        "NR35",
      ),
    "23505",
  );
  await reject(
    () =>
      as(
        engineer,
        (tx) => tx`insert into public.nr_documento_impactos(organization_id)values(${org})`,
      ),
    "42501",
  );
  await reject(
    () =>
      sql`update public.nr_documento_impactos set campos_alterados=array['falso'] where organization_id=${org}`,
    "23514",
  );
  await reject(
    () => sql`delete from public.nr_documento_impacto_revisoes where organization_id=${org}`,
    "23514",
  );
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::int n from public.nr_documento_impactos where organization_id=${org}`,
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await as(
        outsider,
        (tx) =>
          tx`select count(*)::int n from public.nr_documento_impacto_revisoes where organization_id=${org}`,
      )
    )[0].n,
    0,
  );
  assertions++;
  const alteredAgain = await command(
    "locais",
    "salvar",
    { familia: "SRG" },
    local.id,
    changed.version,
  );
  const retried = await review(
    doc.id,
    draft.revisao_atual_id,
    draft.version,
    changed.version,
    key,
    reason,
    engineer,
    "NR35",
  );
  assert.equal(retried.registro.revisao_necessaria, true);
  assert.equal(retried.registro.impactos_pendentes, 1);
  assert.equal(
    (
      await sql`select count(*)::int n from public.nr_documento_impacto_revisoes where organization_id=${org}`
    )[0].n,
    1,
  );
  assertions++;
  await reject(
    () => review(doc.id, draft.revisao_atual_id, draft.version, alteredAgain.version),
    "23514",
  );
  const nextDraft = await command(
    "documentos",
    "nova_revisao",
    { motivo: "Nova alteração exige conferência" },
    doc.id,
    draft.version,
  );
  const connection = await sql.reserve();
  try {
    await connection.unsafe("begin;set local role authenticated");
    await connection`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await connection`select public.nr_executar(${org},'NR33','locais','salvar',${local.id},${alteredAgain.version},${randomUUID()},${connection.json({ tag: "EC 13A - conferência posterior" })})`;
    const stale = review(
      doc.id,
      nextDraft.revisao_atual_id,
      nextDraft.version,
      alteredAgain.version,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await connection.unsafe("commit");
    await reject(() => stale, "40001");
  } finally {
    connection.release();
  }
  assert.deepEqual(
    (
      await sql`select snapshot from public.nr_documento_revisoes where id=${doc.revisao_atual_id}`
    )[0].snapshot,
    originalSnapshot,
  );
  assertions++;
  const finalDraft = await command(
    "documentos",
    "nova_revisao",
    { motivo: "Revisão após nova mudança concorrente" },
    doc.id,
    nextDraft.version,
  );
  const currentLocal = await query("locais", { id: local.id });
  const finalCheck = await review(
    doc.id,
    finalDraft.revisao_atual_id,
    finalDraft.version,
    currentLocal.version,
  );
  assert.equal(finalCheck.impactos_revisados, 2);
  assert.equal(finalCheck.registro.revisao_necessaria, false);
  assertions++;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;
    await tx`update public.pessoas set ativa=false where id=${person}`;
  });
  await reject(
    () => review(doc.id, finalDraft.revisao_atual_id, finalDraft.version, currentLocal.version),
    "42501",
  );
  console.log(
    JSON.stringify({
      suite: "NR impactos PostgreSQL",
      assertions,
      passed: true,
      scope:
        "isolated real constraints/RLS/RPC/locks; preserves issued content/snapshot; review is not emission or signature",
    }),
  );
} finally {
  await sql.end({ timeout: 3 });
}
