import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { QUALIFICACAO_ACESSO_INDISPONIVEL } from "./domain";
import {
  competenciaDetalhe,
  competenciaRow,
  detalheInput,
  listarCompetenciasInput,
  listarQualificacoesInput,
  opcaoRow,
  opcoesInput,
  qualificacaoDetalhe,
  qualificacaoListaRow,
  salvarCompetenciaInput,
  salvarQualificacaoInput,
  transicionarQualificacaoInput,
} from "./schemas";

const client = (db: unknown) => db as SupabaseClient;
const competenceColumns =
  "id,organization_id,nome,descricao,exige_evidencia,exige_validade,ativa,version,created_by,created_at,updated_at";
const qualificationColumns =
  "id,organization_id,pessoa_id,competencia_id,emissor,conclusao,validade,estado,conferido_por,conferido_em,motivo,version,created_by,created_at,updated_at,pessoa:pessoas(id,nome,user_id,ativa),competencia:competencias(id,nome,ativa,exige_evidencia,exige_validade)";
function result(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): unknown {
  if (response.error) {
    if (["42501", "23503", "PGRST116"].includes(response.error.code ?? ""))
      throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
    if (response.error.code === "40001")
      throw new Error(
        "O registro mudou. Seu preenchimento foi preservado; compare a versão atual antes de salvar.",
      );
    if (response.error.code === "23505")
      throw new Error(
        "Cadastro já existente ou chave repetida com outro conteúdo. Confira o registro antes de repetir.",
      );
    if (response.error.code === "23514") throw new Error(response.error.message);
    if (["42P01", "42883", "PGRST202"].includes(response.error.code ?? ""))
      throw new Error(
        "O banco não disponibilizou os comandos canônicos de competências e qualificações. Seu preenchimento foi preservado.",
      );
    throw new Error(
      "Não foi possível confirmar a consulta ou alteração. Tente novamente; seu preenchimento foi preservado.",
    );
  }
  return response.data;
}
const literalSearch = (value: string) =>
  "%" + value.replace(/[%_\\]/g, (character) => "\\" + character) + "%";
async function access(db: SupabaseClient, org: string, userId: string) {
  const signal = getRequest().signal;
  const [read, manage, review, person] = await Promise.all([
    db.rpc("operacao_pode", { _org: org, _acao: "ver_equipe" }).abortSignal(signal),
    db.rpc("operacao_pode", { _org: org, _acao: "gerir_equipe" }).abortSignal(signal),
    db.rpc("operacao_pode", { _org: org, _acao: "revisar_operacao" }).abortSignal(signal),
    db
      .from("pessoas")
      .select("id")
      .eq("organization_id", org)
      .eq("user_id", userId)
      .eq("ativa", true)
      .abortSignal(signal)
      .maybeSingle(),
  ]);
  if (result(read) !== true) throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
  const owner = z.object({ id: z.string().uuid() }).nullable().parse(result(person));
  return {
    gerirEquipe: result(manage) === true,
    revisarOperacao: result(review) === true,
    pessoaId: owner?.id ?? null,
  };
}
async function manterAcesso(
  db: SupabaseClient,
  org: string,
  user: string,
  previous: Awaited<ReturnType<typeof access>>,
) {
  const current = await access(db, org, user);
  if (JSON.stringify(current) !== JSON.stringify(previous))
    throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
}
function exactList<T>(
  response: {
    data: unknown;
    error: { code?: string; message: string } | null;
    count: number | null;
  },
  schema: z.ZodType<T>,
) {
  const data = result(response);
  if (
    !Array.isArray(data) ||
    !Number.isSafeInteger(response.count) ||
    response.count === null ||
    response.count < 0
  )
    throw new Error("A consulta não confirmou os registros e sua contagem. Tente novamente.");
  return { rows: schema.array().max(25).parse(data), total: response.count };
}
async function readCompetence(db: SupabaseClient, org: string, id: string, user: string) {
  const permissions = await access(db, org, user);
  const row = competenciaRow
    .nullable()
    .parse(
      result(
        await db
          .from("competencias")
          .select(competenceColumns)
          .eq("organization_id", org)
          .eq("id", id)
          .abortSignal(getRequest().signal)
          .maybeSingle(),
      ),
    );
  if (!row) throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
  const used = result(
    await db
      .from("pessoa_qualificacoes")
      .select("id")
      .eq("organization_id", org)
      .eq("competencia_id", id)
      .limit(1)
      .abortSignal(getRequest().signal),
  );
  if (!Array.isArray(used))
    throw new Error("A consulta não confirmou o uso desta política. Tente novamente.");
  await manterAcesso(db, org, user, permissions);
  return competenciaDetalhe.parse({
    registro: row,
    usada: z.object({ id: z.string().uuid() }).array().parse(used).length > 0,
    permissoes: { editar: permissions.revisarOperacao },
  });
}
async function readQualification(db: SupabaseClient, org: string, id: string, user: string) {
  const permissions = await access(db, org, user);
  const row = qualificacaoListaRow
    .nullable()
    .parse(
      result(
        await db
          .from("pessoa_qualificacoes")
          .select(qualificationColumns)
          .eq("organization_id", org)
          .eq("id", id)
          .abortSignal(getRequest().signal)
          .maybeSingle(),
      ),
    );
  if (!row) throw new Error(QUALIFICACAO_ACESSO_INDISPONIVEL);
  const validar = permissions.revisarOperacao
    ? z.boolean().parse(
        result(
          await db
            .rpc("qualificacao_validacao_permitida", {
              _org: org,
              _id: id,
            })
            .abortSignal(getRequest().signal),
        ),
      )
    : false;
  await manterAcesso(db, org, user, permissions);
  return qualificacaoDetalhe.parse({
    registro: row,
    permissoes: {
      editar:
        row.estado === "enviada" &&
        row.pessoa?.ativa === true &&
        row.competencia?.ativa === true &&
        (permissions.gerirEquipe || row.pessoa.user_id === user),
      conferir: permissions.revisarOperacao && row.estado !== "revogada",
      // The SQL projection also checks known former user/person associations.
      validar,
    },
  });
}
export const listarCompetencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarCompetenciasInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const permissions = await access(db, data.organization_id, context.userId);
    let query = db
      .from("competencias")
      .select(competenceColumns, { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("ativa", !data.arquivadas);
    if (data.busca) query = query.ilike("nome", literalSearch(data.busca));
    const response = await query
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24)
      .abortSignal(getRequest().signal);
    const page = exactList(response, competenciaRow);
    await manterAcesso(db, data.organization_id, context.userId, permissions);
    return { ...page, permissoes: { criar: permissions.revisarOperacao } };
  });
export const obterCompetencia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detalheInput)
  .handler(({ context, data }) =>
    readCompetence(client(context.supabase), data.organization_id, data.id, context.userId),
  );
export const listarQualificacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listarQualificacoesInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const permissions = await access(db, data.organization_id, context.userId);
    let query = db
      .from("pessoa_qualificacoes")
      .select(qualificationColumns, { count: "exact" })
      .eq("organization_id", data.organization_id);
    if (data.pessoa_id) query = query.eq("pessoa_id", data.pessoa_id);
    if (data.competencia_id) query = query.eq("competencia_id", data.competencia_id);
    if (data.estado) query = query.eq("estado", data.estado);
    if (data.busca) query = query.ilike("emissor", literalSearch(data.busca));
    const response = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24)
      .abortSignal(getRequest().signal);
    const page = exactList(response, qualificacaoListaRow);
    await manterAcesso(db, data.organization_id, context.userId, permissions);
    return { ...page, permissoes: { criar: permissions.gerirEquipe || !!permissions.pessoaId } };
  });
export const obterQualificacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detalheInput)
  .handler(({ context, data }) =>
    readQualification(client(context.supabase), data.organization_id, data.id, context.userId),
  );
export const salvarCompetencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarCompetenciaInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const receipt = z.object({ id: z.string().uuid() }).parse(
      result(
        await db
          .rpc("salvar_competencia", {
            _org: data.organization_id,
            _chave: data.chave,
            _dados: data.dados,
            _id: data.id,
            _expected_version: data.expected_version,
          })
          .abortSignal(getRequest().signal),
      ),
    );
    return readCompetence(db, data.organization_id, receipt.id, context.userId);
  });
export const salvarQualificacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarQualificacaoInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const receipt = z.object({ id: z.string().uuid() }).parse(
      result(
        await db
          .rpc("salvar_qualificacao", {
            _org: data.organization_id,
            _chave: data.chave,
            _dados: data.dados,
            _id: data.id,
            _expected_version: data.expected_version,
          })
          .abortSignal(getRequest().signal),
      ),
    );
    return readQualification(db, data.organization_id, receipt.id, context.userId);
  });
export const transicionarQualificacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(transicionarQualificacaoInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const receipt = z.object({ id: z.string().uuid() }).parse(
      result(
        await db
          .rpc("transicionar_qualificacao", {
            _org: data.organization_id,
            _chave: data.chave,
            _id: data.id,
            _expected_version: data.expected_version,
            _estado: data.estado,
            _motivo: data.motivo,
          })
          .abortSignal(getRequest().signal),
      ),
    );
    return readQualification(db, data.organization_id, receipt.id, context.userId);
  });
export const buscarOpcoesQualificacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(opcoesInput)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const permissions = await access(db, data.organization_id, context.userId);
    let query = db
      .from(data.tipo === "pessoas" ? "pessoas" : "competencias")
      .select("id,nome", { count: "exact" })
      .eq("organization_id", data.organization_id)
      .eq("ativa", true);
    if (data.tipo === "pessoas" && !permissions.gerirEquipe) {
      if (!permissions.pessoaId) {
        await manterAcesso(db, data.organization_id, context.userId, permissions);
        return { rows: [], total: 0 };
      }
      query = query.eq("id", permissions.pessoaId);
    }
    if (data.busca) query = query.ilike("nome", literalSearch(data.busca));
    const response = await query
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24)
      .abortSignal(getRequest().signal);
    const page = exactList(response, z.object({ id: z.string().uuid(), nome: z.string() }));
    await manterAcesso(db, data.organization_id, context.userId, permissions);
    return {
      rows: page.rows.map((row) =>
        opcaoRow.parse({
          ...row,
          contexto: data.tipo === "pessoas" ? "Pessoa operacional ativa" : "Competência ativa",
        }),
      ),
      total: page.total,
    };
  });
