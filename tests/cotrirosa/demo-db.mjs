// Disposable loopback DB only. Tests the additive migration against preexisting real-domain fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { fixture, options } from "./fixture.mjs";
const name = `cotrirosa_test_${Date.now()}`,
  f = await fixture(name),
  { sql, org, user, reader, client, unit, other, locals } = f;
const report = {
  database: name,
  checks: [],
  environment: "PostgreSQL 18 loopback; controlled fixtures, no production writes",
};
const ok = (value, label) => {
  assert.ok(value, label);
  report.checks.push(label);
  console.log("PASS " + label);
};
const as = async (uid, fn, db = sql) =>
  db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${uid},true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
const context = (u = unit, l = null, uid = user) =>
  as(
    uid,
    async (tx) => (await tx`select pet_demo_contexto(${org},${client},${u},'NR33',${l}) r`)[0].r,
  );
const get = (id, norm = "NR33", uid = user) =>
  as(uid, async (tx) => (await tx`select pet_demo_obter(${org},${id},${norm}) r`)[0].r);
const execute = (c, uid = user, db = sql) =>
  as(uid, async (tx) => (await tx`select pet_demo_executar(${org},${tx.json(c)}) r`)[0].r, db);
const workers = [
  { id: randomUUID(), nome: "Trabalhador da fixture", funcao: "trabalhador" },
  { id: randomUUID(), nome: "Vigia da fixture", funcao: "vigia" },
];
const draft = {
  atividade: "DEMONSTRAÇÃO CONTROLADA: inspeção visual",
  inicio_previsto: "2026-11-05T12:00:00Z",
  termino_previsto: "2026-11-05T13:00:00Z",
  equipe: [],
  perigos: "",
  medidas: "",
  leituras: [],
  procedimentos: "",
};
const create = (local = locals[1], content = draft) => ({
  comando: "criar",
  norma: "NR33",
  chave: randomUUID(),
  dados: { cliente_id: client, unidade_id: unit, local_id: local, conteudo: content },
});
const list = (local = null, norm = "NR33", group = "andamento", term = "", page = 0, u = unit) =>
  as(
    user,
    async (tx) =>
      (
        await tx`select pet_demo_listar(${org},${client},${u},${norm},${local},${term},${group},${page}) r`
      )[0].r,
  );
const bad = async (fn, pattern, label) => {
  await assert.rejects(fn, pattern);
  ok(true, label);
};
try {
  const realBefore = (
    await sql`select to_jsonb(p) r from pet_permissoes p where id=${f.legacy.id}`
  )[0].r;
  ok(
    (await context()).habilitado,
    "Factory demonstration enabled by existing five exact scene relations",
  );
  ok(!(await context(other)).habilitado, "Other unit not enabled");
  ok(
    (await sql`select count(*)::int n from pet_demo_habilitacoes`)[0].n === 5,
    "Only five authorized silos configured",
  );
  for (const l of locals)
    ok((await context(unit, l)).pode_editar, `Operator can open configured silo ${l}`);
  ok((await list()).total === 0, "Opening context/list does not create draft");
  ok(
    (await sql`select count(*)::int n from pet_modelo_versoes where estado='aprovado'`)[0].n === 0,
    "No approved procedure or contract configured in test",
  );
  const intention = create(),
    a = await execute(intention),
    repeat = await execute(intention);
  assert.deepEqual(repeat, a);
  ok(a.numero === "DEMO-000001", "Create and retry return one numbered demonstration");
  ok(
    (await get(a.id)).sessao.conteudo.equipe.length === 0,
    "First draft keeps team/technical fields empty",
  );
  const second = postgres({ ...options(), database: name }),
    concurrentIntent = create(locals[4]);
  try {
    const [x, y] = await Promise.all([
      execute(concurrentIntent),
      execute(concurrentIntent, user, second),
    ]);
    assert.deepEqual(x, y);
    ok(true, "Concurrent duplicate creation serialized by idempotency key");
  } finally {
    await second.end();
  }
  ok(
    (await list(locals[1])).total === 1 && (await list(locals[0])).total === 0,
    "Exact local filter before paging isolates EC25 from EC24",
  );
  ok((await list(null, "NR35")).total === 2, "Same demos in authorized NR35 context");
  ok((await list(null, "NR33", "andamento", "", 0, other)).total === 0, "Other unit history empty");
  await bad(
    () =>
      execute({
        ...intention,
        dados: { ...intention.dados, conteudo: { ...draft, atividade: "Outra intenção" } },
      }),
    /divergente/,
    "Reused key with different payload rejected",
  );
  await bad(
    () => execute({ ...create(), dados: { ...create().dados, unidade_id: other } }),
    /autorizado/,
    "Manipulated unit rejected",
  );
  await bad(
    () => execute(create(), reader),
    /autorizado/,
    "Read profile cannot create demonstration",
  );
  await bad(
    () => as(user, (tx) => tx`select pet_demo_obter(${randomUUID()},${a.id},'NR33')`),
    /indisponível/,
    "Cross-organization ID rejected",
  );
  await bad(
    () => as(user, (tx) => tx`select * from pet_demo_sessoes`),
    /permission denied/,
    "Direct table access denied to authenticated role",
  );
  const command = async (cmd, data = {}, expected) => {
    const d = await get(a.id);
    return execute({
      comando: cmd,
      norma: "NR33",
      chave: randomUUID(),
      id: a.id,
      expected_version: expected ?? d.sessao.version,
      dados: data,
    });
  };
  await bad(
    () => command("iniciar"),
    /trabalhador e vigia/,
    "Cannot start presence journey without manually entered participants",
  );
  await command("salvar", { conteudo: { ...draft, equipe: workers }, etapa: 4 });
  await bad(
    () => command("salvar", { conteudo: draft, etapa: 1 }, 1),
    /Outra pessoa/,
    "Stale edit reports conflict and preserves server content",
  );
  await command("iniciar");
  ok(
    (await get(a.id)).sessao.estado === "em_andamento",
    "Starts demo without certified signature, certificates or approved model",
  );
  await command("entrada", { participante_id: workers[0].id });
  await bad(
    () => command("encerrar", { texto: "Fim do teste" }),
    /saídas/,
    "Explicit closure refuses open presence",
  );
  await bad(
    () => command("entrada", { participante_id: workers[0].id }),
    /duplicate key/,
    "Second open presence rejected",
  );
  await command("medicao", { agente: "O2 preenchido pela fixture", valor: "20.9", unidade: "%" });
  await command("ocorrencia", { texto: "Registro demonstrativo" });
  await command("prorrogar", { termino_previsto: "2026-11-05T14:00:00Z" });
  await command("saida", { participante_id: workers[0].id });
  const file = randomUUID(),
    fileData = { id: file, nome: "evidencia-fixture.pdf", mime: "application/pdf", tamanho: 10 };
  const fileRpc = (cmd, d = fileData, uid = user) =>
    as(
      uid,
      async (tx) => (await tx`select pet_demo_arquivo(${org},${a.id},${cmd},${tx.json(d)}) r`)[0].r,
    );
  const prepared = await fileRpc("preparar");
  assert.deepEqual(await fileRpc("preparar"), prepared);
  ok(true, "Attachment preparation is retry-safe");
  await bad(() => fileRpc("confirmar"), /Envio ainda/, "Missing upload cannot be confirmed");
  await bad(
    () =>
      as(
        reader,
        (tx) =>
          tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-pet-demo',${prepared.caminho},'{"size":10,"mimetype":"application/pdf"}')`,
      ),
    /policy|permission/,
    "Another user cannot upload to reserved attachment path",
  );
  await as(
    user,
    (tx) =>
      tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-pet-demo',${prepared.caminho},'{"size":10,"mimetype":"application/pdf"}')`,
  );
  await fileRpc("confirmar");
  ok(
    (await fileRpc("abrir")).estado === "disponivel",
    "Private attachment confirmed against storage metadata",
  );
  await bad(
    () =>
      as(
        user,
        (tx) =>
          tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-pet-demo',${randomUUID()},'{}')`,
      ),
    /policy/,
    "Arbitrary storage path blocked",
  );
  await command("encerrar", { texto: "Encerramento explícito da fixture" });
  ok((await get(a.id)).sessao.estado === "encerrada", "Full journey explicitly closed");
  await bad(
    () => command("medicao", { agente: "O2", valor: "21", unidade: "%" }),
    /finalizada/,
    "Final demonstration immutable through command API",
  );
  ok(
    (await list(locals[1], "NR35", "concluidas")).registros[0].numero === a.numero,
    "Closed number persists in silo and NR35 unit history",
  );
  const b = (await list(locals[4])).registros[0];
  ok(
    (await list(locals[4], "NR33", "andamento", "AS 05")).total === 1 &&
      (await list(locals[4], "NR33", "andamento", "SA 05")).total === 1,
    "Both original silo aliases find EC28 demonstration",
  );
  for (let i = 0; i < 11; i++)
    await execute(create(locals[4], { ...draft, atividade: `Paginação ${i}` }));
  ok(
    (await list(locals[4])).registros.length === 10 &&
      (await list(locals[4], "NR33", "andamento", "", 1)).registros.length === 2,
    "Pagination includes only matching silo rows",
  );
  await sql`update nr_locais set titulo='Nome alterado após criação' where id=${locals[4]}`;
  ok(
    (await get(b.id)).sessao.identificacao.titulo === b.identificacao.titulo,
    "Historical identification frozen",
  );
  const secondUser = randomUUID();
  await sql`insert into auth.users(id,email)values(${secondUser},'second@test.invalid')`;
  await sql`insert into memberships(organization_id,user_id)values(${org},${secondUser})`;
  await sql`insert into user_roles(organization_id,user_id,role)values(${org},${secondUser},'admin')`;
  const second2 = postgres({ ...options(), database: name });
  try {
    const initial = (await get(b.id)).sessao;
    const c = {
      comando: "salvar",
      norma: "NR33",
      id: b.id,
      expected_version: initial.version,
      dados: { conteudo: draft, etapa: 2 },
    };
    const rs = await Promise.allSettled([
      execute({ ...c, chave: randomUUID() }),
      execute({ ...c, chave: randomUUID() }, secondUser, second2),
    ]);
    ok(
      rs.filter((r) => r.status === "fulfilled").length === 1 &&
        rs.filter((r) => r.status === "rejected" && r.reason.code === "40001").length === 1,
      "Two operators: one edit succeeds and the other conflicts",
    );
  } finally {
    await second2.end();
  }
  await sql`delete from user_roles where organization_id=${org} and user_id=${user}`;
  await bad(
    () => execute(intention),
    /divergente|negado|autor/,
    "Revoked operator cannot replay saved receipt",
  );
  await bad(
    () => fileRpc("abrir"),
    /indisponível/,
    "Revoked access cannot reopen private attachment",
  );
  await sql`insert into user_roles(organization_id,user_id,role)values(${org},${user},'admin')`;
  assert.deepEqual(
    (await sql`select to_jsonb(p) r from pet_permissoes p where id=${f.legacy.id}`)[0].r,
    realBefore,
  );
  ok(
    (await sql`select count(*)::int n from pet_permissoes`)[0].n === 1,
    "Legacy real PET and operational totals unchanged",
  );
  const security =
    await sql`select relname,relrowsecurity from pg_class where relname like 'pet_demo_%' and relkind='r'`;
  ok(
    security.length === 7 && security.every((x) => x.relrowsecurity),
    "RLS enabled on all seven demo tables",
  );
  await writeFile("docs/cotrirosa/demo-db-report.json", JSON.stringify(report, null, 2));
  console.log(`DATABASE=${name}`);
} finally {
  await sql.end();
}
