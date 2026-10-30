/** Real PostgreSQL / RLS regression. Fixtures are confined to an explicitly
 * disposable loopback database; no operational permit is issued by this test. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
if (
  process.env.PGTEST_EPHEMERAL !== "1" ||
  !/^\d{4,5}$/.test(process.env.PGTEST_PORT || "") ||
  process.env.PGTEST_PORT === "5432" ||
  !["127.0.0.1", undefined].includes(process.env.PGTEST_HOST)
)
  throw Error("Use PostgreSQL descartável de loopback");
const sql = postgres({
  host: "127.0.0.1",
  port: Number(process.env.PGTEST_PORT),
  user: "postgres",
  database: process.env.PGTEST_DATABASE || "postgres",
  max: 1,
  onnotice() {},
});
const q = (source, args = []) => sql.unsafe(source, args);
const org = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  field = randomUUID(),
  outsider = randomUUID();
let checks = 0;
const pass = (value, message) => {
  assert.ok(value, message);
  checks++;
  console.log("PET LIST PASS " + message);
};
const denied = async (fn, message) => {
  await assert.rejects(fn, (error) => error.code === "42501", message);
  checks++;
  console.log("PET LIST PASS " + message);
};
const auth = async (user = admin) => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await q("set role authenticated");
};
const root = async () => {
  await q("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
};
const command = async (comando, dados, organization = org) =>
  (
    await q("select public.pet_executar($1,$2::jsonb) r", [
      organization,
      { chave: randomUUID(), comando, dados },
    ])
  )[0].r;
const list = async (filtros = {}, organization = org) =>
  (await q("select public.pet_listar($1,$2::jsonb) r", [organization, filtros]))[0].r;
const setupUnit = async (organization, suffix) => {
  const client = (
    await q("select public.salvar_cliente_operacional($1,$2,$3::jsonb) r", [
      organization,
      randomUUID(),
      { razao_social: `Cliente listagem ${suffix}` },
    ])
  )[0].r;
  const unit = (
    await q("select public.salvar_unidade_operacional($1,$2,$3,$4::jsonb) r", [
      organization,
      randomUUID(),
      client.id,
      { nome: `Unidade listagem ${suffix}` },
    ])
  )[0].r;
  const os = await command(
    "criar_os",
    { cliente_id: client.id, unidade_id: unit.id, titulo: `OS listagem ${suffix}` },
    organization,
  );
  const space = await command(
    "salvar_espaco",
    {
      unidade_id: unit.id,
      identificacao: `EC reservatório ${suffix}`,
      localizacao: "Local de teste isolado",
    },
    organization,
  );
  return { client, unit, os, space };
};
const createPet = async (context, atividade, space = context.space, organization = org) =>
  command(
    "criar_pet",
    {
      os_id: context.os.id,
      espaco_id: space.id,
      atividade,
      termino_previsto: new Date(Date.now() + 4 * 3600e3).toISOString(),
      timezone: "America/Sao_Paulo",
    },
    organization,
  );
try {
  await root();
  for (const id of [admin, field, outsider])
    await q("insert into auth.users(id,email) values($1,$2)", [id, `pet-list-${id}@test.invalid`]);
  await q(
    "insert into public.organizations(id,nome) values($1,'PET listagem teste'),($2,'PET listagem outro tenant')",
    [org, other],
  );
  for (const [organization, user, role] of [
    [org, admin, "admin"],
    [org, field, "campo"],
    [org, outsider, "comercial"],
    [other, admin, "admin"],
  ]) {
    await q("insert into public.memberships(organization_id,user_id) values($1,$2)", [
      organization,
      user,
    ]);
    await q(
      "insert into public.user_roles(organization_id,user_id,role) values($1,$2,$3::public.app_role)",
      [organization, user, role],
    );
  }
  await auth();
  const target = await setupUnit(org, "Alfa"),
    noise = await setupUnit(org, "Beta"),
    foreign = await setupUnit(other, "Outro tenant");
  const special = await command("salvar_espaco", {
    unidade_id: target.unit.id,
    identificacao: "EC Duto%_especial",
    localizacao: "Local exclusivo de teste",
  });
  const targetPets = [],
    noisePets = [];
  for (let i = 0; i < 65; i++) {
    const atividade =
      i === 1
        ? "Inspecionar 100% no equipamento"
        : i === 2
          ? "Conferir selo_primario"
          : i === 3
            ? "Conferir pasta C:\\equipamentos"
            : i >= 4 && i <= 6
              ? `Inspecionar BOMBA número ${i}`
              : `Inspeção industrial alvo ${i}`;
    targetPets.push(await createPet(target, atividade, i === 0 ? special : target.space));
  }
  for (let i = 0; i < 70; i++)
    noisePets.push(await createPet(noise, `Serviço mais recente sem vínculo alvo ${i}`));
  const foreignPet = await createPet(
    foreign,
    "Segredo de outra organização BOMBA 100%",
    foreign.space,
    other,
  );
  const all = await list();
  pass(
    all.registros.length === 50 && all.total === 135 && all.pagina === 0 && all.limite === 50,
    "contrato legado mantém primeira página zero, limite 50 e total autorizado",
  );
  pass(
    all.registros.every((p) => p.os_id === noise.os.id) &&
      !all.registros.some((p) => p.id === foreignPet.id),
    "primeira página geral não contém PETs antigas da OS nem registros de outro tenant",
  );
  const first = await list({ os_id: target.os.id }),
    second = await list({ os_id: target.os.id, pagina: 1 });
  pass(
    first.total === 65 &&
      first.registros.length === 50 &&
      first.registros.every((p) => p.os_id === target.os.id),
    "escopo OS aplicado antes da paginação recupera permissões além das primeiras 50 globais",
  );
  pass(
    second.total === 65 && second.registros.length === 15 && second.pagina === 1,
    "segunda página da OS mantém contagem e entrega as 15 restantes",
  );
  pass(
    new Set([...first.registros, ...second.registros].map((p) => p.id)).size === 65,
    "páginas não pulam nem repetem permissões",
  );
  const empty = await list({ os_id: target.os.id, pagina: 10 });
  pass(
    empty.registros.length === 0 && empty.total === 65,
    "página vazia mantém a contagem filtrada",
  );
  const unit = await list({ unidade_id: target.unit.id, limite: 100 });
  pass(
    unit.total === 65 &&
      unit.registros.length === 65 &&
      unit.registros.every((p) => p.unidade_id === target.unit.id),
    "filtro de unidade precede limite e usa o mesmo universo da contagem",
  );
  const mismatch = await list({ os_id: target.os.id, unidade_id: noise.unit.id });
  pass(
    mismatch.total === 0 && mismatch.registros.length === 0 && mismatch.ordens.length === 2,
    "filtros combinados inconsistentes não vazam registros; ordens legadas permanecem intactas",
  );
  const percent = await list({ busca: "%" }),
    underscore = await list({ busca: "_" }),
    slash = await list({ busca: "\\" });
  pass(
    percent.total === 2 && percent.registros.length === 2,
    "percentual é literal na atividade e no nome do espaço",
  );
  pass(
    underscore.total === 2 && underscore.registros.length === 2 && slash.total === 1,
    "sublinhado e barra são literais, sem expansão LIKE",
  );
  const space = await list({ busca: "duto%_ESPECIAL" });
  pass(
    space.total === 1 && space.registros[0].id === targetPets[0].id,
    "busca literal no espaço ignora caixa sem perder caracteres especiais",
  );
  const pump = await list({ os_id: target.os.id, busca: "  bomba  ", limite: 2 });
  const pumpNext = await list({ os_id: target.os.id, busca: "bomba", limite: 2, pagina: 1 });
  pass(
    pump.total === 3 &&
      pump.registros.length === 2 &&
      pumpNext.total === 3 &&
      pumpNext.registros.length === 1,
    "busca na atividade antes da página mantém o mesmo total filtrado",
  );
  const number = await list({ busca: targetPets[64].detalhe.pet.numero.toLowerCase() });
  pass(
    number.total === 1 && number.registros[0].id === targetPets[64].id,
    "busca por número encontra registro fora da primeira página geral",
  );
  const capped = await list({ limite: 1000 }),
    minimum = await list({ limite: 0, pagina: -1 });
  pass(
    capped.limite === 100 &&
      capped.registros.length === 100 &&
      minimum.limite === 1 &&
      minimum.pagina === 0 &&
      minimum.registros.length === 1,
    "limites SQL preservam clamp 1..100 e página mínima zero",
  );
  const person = (
    await q("select public.salvar_pessoa($1,$2,$3::jsonb) r", [
      org,
      randomUUID(),
      { nome: "Pessoa de campo com acesso parcial", vinculo: "colaborador", user_id: field },
    ])
  )[0].r;
  for (const pet of [targetPets[0], targetPets[2], noisePets[1]]) {
    const p = pet.detalhe.pet;
    await command("salvar_rascunho", {
      pet_id: pet.id,
      expected_version: p.version,
      atividade: p.atividade,
      termino_previsto: p.termino_previsto,
      conteudo: {},
      participantes: [{ pessoa_id: person.id, funcao: "trabalhador", classificacao: "interno" }],
      respostas: [],
    });
  }
  await auth(field);
  const partial = await list(),
    partialUnit = await list({ unidade_id: target.unit.id }),
    partialSearch = await list({ busca: "%" });
  pass(
    partial.total === 3 && partial.registros.length === 3 && partial.ordens.length === 2,
    "usuário de campo só conta e lista PETs e OS de que participa",
  );
  pass(
    partialUnit.total === 2 &&
      partialUnit.registros.length === 2 &&
      partialSearch.total === 1 &&
      partialSearch.registros[0].id === targetPets[0].id,
    "contagem parcial e busca respeitam pet_ler antes da paginação",
  );
  await denied(() => list({}, other), "mesmo usuário não consulta organização sem membership");
  await auth(outsider);
  await denied(() => list(), "papel sem ver_operacao não acessa listagem direta");
  await root();
  await q("set role anon");
  await denied(() => list(), "ACL continua negando execução para anon");
  await root();
  await q("update public.pessoas set ativa=false where organization_id=$1 and id=$2", [
    org,
    person.id,
  ]);
  await auth(field);
  const revoked = await list();
  pass(
    revoked.total === 0 && revoked.registros.length === 0 && revoked.ordens.length === 0,
    "pessoa desativada não recupera contagens nem registros por filtros",
  );
  console.log(
    JSON.stringify({ scenario: "pet-listagem", checks, status: "passed", totalFixturePets: 136 }),
  );
} finally {
  await sql.end();
}
