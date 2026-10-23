// Explicitly isolated demonstration. No production URL or application fixture import.
import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.PGTEST_EPHEMERAL !== "1") throw Error("PGTEST_EPHEMERAL=1 obrigatório");
const admin = postgres({
  host: "127.0.0.1",
  port: 55439,
  database: "postgres",
  user: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
});
await admin.unsafe("create database pet_demo");
await admin.end();
const db = postgres({
  host: "127.0.0.1",
  port: 55439,
  database: "pet_demo",
  user: "postgres",
  prepare: false,
  max: 1,
  onnotice: () => {},
});
try {
  const bootstrap = (await readFile(path.join(root, "tests/db/bootstrap.sql"), "utf8")).replace(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;",
    "",
  );
  await db.unsafe(bootstrap);
  for (const dir of ["supabase/migrations", "drizzle/migrations"])
    for (const file of (await readdir(path.join(root, dir)))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.unsafe(await readFile(path.join(root, dir, file), "utf8"));
  const org = "a0300000-0000-4000-8000-000000000001",
    user = "a0300000-0000-4000-8000-000000000002",
    supervisor = "a0300000-0000-4000-8000-000000000003",
    vigia = "a0300000-0000-4000-8000-000000000004",
    trabalhador = "a0300000-0000-4000-8000-000000000005",
    cliente = "a0300000-0000-4000-8000-000000000006",
    unidade = "a0300000-0000-4000-8000-000000000007";
  await db`insert into auth.users(id,email) values(${user},'demonstracao@example.invalid')`;
  await db`insert into organizations(id,nome) values(${org},'DEMONSTRAÇÃO PET Nexus')`;
  await db`insert into memberships(organization_id,user_id) values(${org},${user})`;
  await db`insert into user_roles(organization_id,user_id,role) values(${org},${user},'admin')`;
  await db`select set_config('request.jwt.claim.sub',${user},false)`;
  await db`insert into clientes(id,organization_id,razao_social,nome_exibicao) values(${cliente},${org},'Unidade de demonstração isolada','Cliente Demonstração')`;
  await db`insert into unidades(id,organization_id,cliente_id,nome,endereco) values(${unidade},${org},${cliente},'Unidade Campo · DEMONSTRAÇÃO','Ambiente isolado de homologação local')`;
  for (const [id, nome, funcao, login] of [
    [supervisor, "Supervisor Demonstração", "Supervisor de entrada", user],
    [vigia, "Vigia Demonstração", "Vigia", null],
    [trabalhador, "Trabalhador Demonstração", "Trabalhador autorizado", null],
  ])
    await db`insert into pessoas(id,organization_id,nome,vinculo,funcao,user_id,created_by) values(${id},${org},${nome},'colaborador',${funcao},${login},${user})`;
  await db.unsafe("set role authenticated");
  const cmd = async (comando, dados) =>
    (
      await db`select pet_executar(${org}::uuid,${db.json({ chave: crypto.randomUUID(), comando, dados })}::jsonb) r`
    )[0].r;
  const os = await cmd("criar_os", {
    cliente_id: cliente,
    unidade_id: unidade,
    titulo: "Inspeção técnica · DEMONSTRAÇÃO",
    escopo:
      "Planejar inspeção do espaço. Sem autorização operacional: provedor ICP-Brasil não configurado.",
    responsavel_id: supervisor,
  });
  const espaco = await cmd("salvar_espaco", {
    unidade_id: unidade,
    identificacao: "EC-01 · DEMONSTRAÇÃO",
    localizacao: "Área isolada de homologação, acesso identificado",
    caracteristicas: "Cadastro demonstrativo sem validade técnica operacional.",
  });
  const pet = await cmd("criar_pet", {
    os_id: os.id,
    espaco_id: espaco.id,
    atividade: "Inspeção interna planejada · demonstração de preparação e bloqueios",
    termino_previsto: new Date(Date.now() + 4 * 3600000).toISOString(),
    timezone: "America/Sao_Paulo",
  });
  console.log(JSON.stringify({ org, user, os: os.id, espaco: espaco.id, pet: pet.id }, null, 2));
} finally {
  await db.end();
}
