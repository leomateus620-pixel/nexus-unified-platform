import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acaoRow,
  listInput,
  pessoaRow,
  orgInput,
  salvarAcaoInput,
  salvarPessoaInput,
  transicaoInput,
} from "./schemas";

// Boundary for additive schema; generated integration files remain owned by Lovable.
export function operationalDb(db: unknown): SupabaseClient {
  return db as SupabaseClient;
}
export async function exigirOperacao(db: SupabaseClient, org: string, acao: string) {
  const permitido = result(await db.rpc("operacao_pode", { _org: org, _acao: acao }));
  if (!permitido) throw new Error("Seu acesso atual não permite consultar esta área.");
}
export function result<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "40001")
      throw new Error("Outra pessoa alterou este registro. Recarregue e compare antes de salvar.");
    if (["42501", "23503"].includes(r.error.code ?? ""))
      throw new Error("Registro indisponível ou sem permissão para esta ação.");
    throw new Error(r.error.message);
  }
  return r.data;
}

export const consultarAcessoOperacional = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    const [equipe, operacao, revisao, pessoa] = await Promise.all([
      db.rpc("operacao_pode", { _org: data.organization_id, _acao: "gerir_equipe" }),
      db.rpc("operacao_pode", { _org: data.organization_id, _acao: "gerir_operacao" }),
      db.rpc("operacao_pode", { _org: data.organization_id, _acao: "revisar_operacao" }),
      db
        .from("pessoas")
        .select("id")
        .eq("organization_id", data.organization_id)
        .eq("user_id", context.userId)
        .eq("ativa", true)
        .maybeSingle(),
    ]);
    return {
      gerirEquipe: result(equipe) === true,
      gerirOperacao: result(operacao) === true,
      revisarOperacao: result(revisao) === true,
      pessoaId: (result(pessoa) as { id: string } | null)?.id ?? null,
    };
  });

export const obterPessoa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgInput.extend({ id: pessoaRow.shape.id }))
  .handler(async ({ context, data }) =>
    pessoaRow.parse(
      result(
        await operationalDb(context.supabase)
          .from("pessoas")
          .select(
            "id,organization_id,nome,vinculo,funcao,email_profissional,telefone_profissional,registro_profissional,user_id,ativa,version",
          )
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    ),
  );
export const obterAcao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgInput.extend({ id: acaoRow.shape.id }))
  .handler(async ({ context, data }) =>
    acaoRow.parse(
      result(
        await operationalDb(context.supabase)
          .from("acoes_operacionais")
          .select(
            "id,organization_id,titulo,descricao,responsavel_id,prazo,prioridade,exige_verificacao,estado,conclusao,motivo,version",
          )
          .eq("organization_id", data.organization_id)
          .eq("id", data.id)
          .single(),
      ),
    ),
  );

export const listarPessoas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listInput)
  .handler(async ({ context, data }) => {
    const db = operationalDb(context.supabase);
    await exigirOperacao(db, data.organization_id, "ver_equipe");
    let query = db
      .from("pessoas")
      .select(
        "id,organization_id,nome,vinculo,funcao,email_profissional,telefone_profissional,registro_profissional,user_id,ativa,version",
        { count: "exact" },
      )
      .eq("organization_id", data.organization_id)
      .eq("ativa", !data.arquivados);
    if (data.busca) query = query.ilike("nome", `%${data.busca.replace(/[%_\\]/g, "\\$&")}%`);
    const r = await query
      .order("nome")
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24);
    result(r);
    return { rows: pessoaRow.array().parse(r.data ?? []), total: r.count ?? 0 };
  });
export const salvarPessoa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarPessoaInput)
  .handler(async ({ context, data }) => {
    return pessoaRow.parse(
      result(
        await operationalDb(context.supabase).rpc("salvar_pessoa", {
          _org: data.organization_id,
          _chave: data.chave,
          _dados: data.dados,
          _id: data.id,
          _expected_version: data.expected_version,
        }),
      ),
    );
  });
export const listarAcoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(listInput)
  .handler(async ({ context, data }) => {
    await exigirOperacao(operationalDb(context.supabase), data.organization_id, "ver_operacao");
    let query = operationalDb(context.supabase)
      .from("acoes_operacionais")
      .select(
        "id,organization_id,titulo,descricao,responsavel_id,prazo,prioridade,exige_verificacao,estado,conclusao,motivo,version",
        { count: "exact" },
      )
      .eq("organization_id", data.organization_id);
    query = data.arquivados
      ? query.in("estado", ["concluida", "cancelada"])
      : query.in("estado", ["aberta", "em_execucao", "aguardando_verificacao"]);
    if (data.busca) query = query.ilike("titulo", `%${data.busca.replace(/[%_\\]/g, "\\$&")}%`);
    const r = await query
      .order("prazo", { nullsFirst: false })
      .order("id")
      .range(data.pagina * 25, data.pagina * 25 + 24);
    result(r);
    return { rows: acaoRow.array().parse(r.data ?? []), total: r.count ?? 0 };
  });
export const salvarAcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(salvarAcaoInput)
  .handler(async ({ context, data }) =>
    acaoRow.parse(
      result(
        await operationalDb(context.supabase).rpc("salvar_acao_operacional", {
          _org: data.organization_id,
          _chave: data.chave,
          _dados: data.dados,
          _id: data.id,
          _expected_version: data.expected_version,
        }),
      ),
    ),
  );
export const transicionarAcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(transicaoInput)
  .handler(async ({ context, data }) =>
    acaoRow.parse(
      result(
        await operationalDb(context.supabase).rpc("transicionar_acao_operacional", {
          _org: data.organization_id,
          _chave: data.chave,
          _id: data.id,
          _expected_version: data.expected_version,
          _estado: data.estado,
          _motivo: data.motivo,
        }),
      ),
    ),
  );
