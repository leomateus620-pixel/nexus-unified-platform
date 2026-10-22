import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buscarPessoasEquipeInput,
  encerrarMembroInput,
  equipeDetalheSchema,
  equipeListagemSchema,
  equipeRow,
  listarEquipesInput,
  membroEquipeRow,
  obterEquipeInput,
  pessoaEquipeRow,
  pessoasEquipeOpcoesSchema,
  salvarEquipeInput,
  vincularMembroInput,
} from "./schemas";
import { EQUIPE_ACESSO_INDISPONIVEL, escapeEquipeSearch } from "./domain";

const equipeColumns =
  "id,organization_id,nome,lider_id,ativa,version,created_by,created_at,updated_at";
const membroColumns = "id,organization_id,equipe_id,pessoa_id,inicio,fim,created_by,created_at";
function dbClient(db: unknown) {
  return db as SupabaseClient;
}
function result<T>(r: { data: T; error: { code?: string; message: string } | null }): T {
  if (r.error) {
    if (["42501", "PGRST116", "23503"].includes(r.error.code ?? ""))
      throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
    if (r.error.code === "40001")
      throw new Error(
        "Outra pessoa alterou a equipe. Consulte a versão atual e compare antes de salvar.",
      );
    if (r.error.code === "23P01")
      throw new Error(
        "A pessoa já pertence à equipe nesse período. Confira as datas, incluindo o último dia.",
      );
    if (r.error.code === "23505")
      throw new Error(
        "Já existe esse nome ou a chave foi usada com outro conteúdo. Confira o registro antes de repetir.",
      );
    throw new Error(r.error.message);
  }
  return r.data;
}
type Acesso = { gerir: boolean; pessoaId: string | null };
function collection(r: { data: unknown; error: { code?: string; message: string } | null }) {
  const rows = result(r);
  if (!Array.isArray(rows))
    throw new Error("A consulta não retornou uma lista válida. Tente novamente.");
  return rows;
}
function exactCollection(r: {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
}) {
  const rows = collection(r);
  if (!Number.isSafeInteger(r.count) || r.count! < rows.length || r.count! < 0)
    throw new Error("A consulta não retornou a contagem dos registros. Tente novamente.");
  return { rows, total: r.count! };
}
async function acesso(
  db: SupabaseClient,
  org: string,
  user: string,
  signal: AbortSignal,
): Promise<Acesso> {
  const [read, manage] = await Promise.all([
    db.rpc("operacao_pode", { _org: org, _acao: "ver_equipe" }).abortSignal(signal),
    db.rpc("operacao_pode", { _org: org, _acao: "gerir_equipe" }).abortSignal(signal),
  ]);
  if (result(read) !== true) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
  const gerir = result(manage) === true;
  if (gerir) return { gerir, pessoaId: null };
  const person = result(
    await db
      .from("pessoas")
      .select("id")
      .eq("organization_id", org)
      .eq("user_id", user)
      .eq("ativa", true)
      .abortSignal(signal)
      .maybeSingle(),
  );
  return { gerir, pessoaId: (person as { id: string } | null)?.id ?? null };
}
async function manterAcesso(
  db: SupabaseClient,
  org: string,
  user: string,
  signal: AbortSignal,
  before: Acesso,
) {
  const current = await acesso(db, org, user, signal);
  if (current.gerir !== before.gerir || current.pessoaId !== before.pessoaId)
    throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
}
async function lerDetalhe(
  db: SupabaseClient,
  org: string,
  id: string,
  pagina: number,
  user: string,
  signal: AbortSignal,
) {
  const before = await acesso(db, org, user, signal);
  const raw = result(
    await db
      .from("equipes")
      .select(equipeColumns)
      .eq("organization_id", org)
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (!raw) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
  const equipe = equipeRow.parse(raw);
  const membersResult = await db
    .from("equipe_membros")
    .select(membroColumns, { count: "exact" })
    .eq("organization_id", org)
    .eq("equipe_id", id)
    .order("inicio", { ascending: false })
    .order("id")
    .range(pagina * 25, pagina * 25 + 24)
    .abortSignal(signal);
  const memberCollection = exactCollection(membersResult);
  const members = membroEquipeRow.array().parse(memberCollection.rows);
  const ids = [
    ...new Set([...members.map((m) => m.pessoa_id), ...(equipe.lider_id ? [equipe.lider_id] : [])]),
  ];
  const people = ids.length
    ? pessoaEquipeRow
        .array()
        .parse(
          collection(
            await db
              .from("pessoas")
              .select("id,nome,funcao,ativa")
              .eq("organization_id", org)
              .in("id", ids)
              .abortSignal(signal),
          ),
        )
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  await manterAcesso(db, org, user, signal, before);
  return equipeDetalheSchema.parse({
    equipe,
    lider: equipe.lider_id ? (byId.get(equipe.lider_id) ?? null) : null,
    membros: {
      rows: members.map((m) => ({
        ...m,
        pessoa_nome: byId.get(m.pessoa_id)?.nome ?? null,
        pessoa_funcao: byId.get(m.pessoa_id)?.funcao ?? null,
        pessoa_ativa: byId.get(m.pessoa_id)?.ativa ?? null,
        pode_encerrar: before.gerir && m.fim === null,
      })),
      total: memberCollection.total,
      pagina,
      limite: 25,
    },
    permissoes: {
      gerir: before.gerir,
      editar: before.gerir,
      incluir: before.gerir && equipe.ativa,
    },
  });
}

export const listarEquipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarEquipesInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase),
      signal = getRequest().signal;
    const before = await acesso(db, data.organization_id, context.userId, signal);
    let q = db
      .from("equipes")
      .select(equipeColumns, { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("ativa", !data.arquivadas);
    if (data.busca) q = q.ilike("nome", `%${escapeEquipeSearch(data.busca)}%`);
    const rows = await q
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24)
      .abortSignal(signal);
    const list = exactCollection(rows);
    const items = equipeRow.array().parse(list.rows);
    await manterAcesso(db, data.organization_id, context.userId, signal, before);
    return equipeListagemSchema.parse({
      rows: items,
      total: list.total,
      pagina: data.pagina,
      limite: 25,
      permissoes: { gerir: before.gerir },
    });
  });
export const obterEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(obterEquipeInput)
  .handler(({ context, data }) =>
    lerDetalhe(
      dbClient(context.supabase),
      data.organization_id,
      data.id,
      data.paginaMembros,
      context.userId,
      getRequest().signal,
    ),
  );

export const salvarEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarEquipeInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase),
      signal = getRequest().signal;
    const current = await acesso(db, data.organization_id, context.userId, signal);
    if (!current.gerir) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
    const receipt = equipeRow.parse(
      result(
        await db
          .rpc("salvar_equipe", {
            _org: data.organization_id,
            _chave: data.chave,
            _dados: data.dados,
            _id: data.id,
            _expected_version: data.expected_version,
          })
          .abortSignal(signal),
      ),
    );
    await manterAcesso(db, data.organization_id, context.userId, signal, current);
    return lerDetalhe(db, data.organization_id, receipt.id, 0, context.userId, signal);
  });
export const vincularMembroEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vincularMembroInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase),
      signal = getRequest().signal;
    const current = await acesso(db, data.organization_id, context.userId, signal);
    if (!current.gerir) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
    const receipt = membroEquipeRow.parse(
      result(
        await db
          .rpc("vincular_membro_equipe", {
            _org: data.organization_id,
            _chave: data.chave,
            _equipe: data.equipe_id,
            _pessoa: data.pessoa_id,
            _inicio: data.inicio,
            _fim: data.fim,
          })
          .abortSignal(signal),
      ),
    );
    await manterAcesso(db, data.organization_id, context.userId, signal, current);
    return lerDetalhe(db, data.organization_id, receipt.equipe_id, 0, context.userId, signal);
  });
export const encerrarMembroEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(encerrarMembroInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase),
      signal = getRequest().signal;
    const current = await acesso(db, data.organization_id, context.userId, signal);
    if (!current.gerir) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
    const receipt = membroEquipeRow.parse(
      result(
        await db
          .rpc("encerrar_membro_equipe", {
            _org: data.organization_id,
            _chave: data.chave,
            _id: data.id,
            _fim: data.fim,
            _motivo: data.motivo,
          })
          .abortSignal(signal),
      ),
    );
    await manterAcesso(db, data.organization_id, context.userId, signal, current);
    return lerDetalhe(db, data.organization_id, receipt.equipe_id, 0, context.userId, signal);
  });
export const buscarPessoasEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(buscarPessoasEquipeInput)
  .handler(async ({ context, data }) => {
    const db = dbClient(context.supabase),
      signal = getRequest().signal;
    const before = await acesso(db, data.organization_id, context.userId, signal);
    if (!before.gerir) throw new Error(EQUIPE_ACESSO_INDISPONIVEL);
    let q = db
      .from("pessoas")
      .select("id,nome,funcao,ativa", { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("ativa", true);
    if (data.busca) q = q.ilike("nome", `%${escapeEquipeSearch(data.busca)}%`);
    const people = await q
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24)
      .abortSignal(signal);
    const collection = exactCollection(people);
    const rows = pessoaEquipeRow.array().parse(collection.rows);
    await manterAcesso(db, data.organization_id, context.userId, signal, before);
    return pessoasEquipeOpcoesSchema.parse({
      rows: rows.map((p) => ({
        id: p.id,
        nome: p.nome,
        contexto: p.funcao || "Pessoa operacional ativa",
      })),
      total: collection.total,
      pagina: data.pagina,
      limite: 25,
    });
  });
