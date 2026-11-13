import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const perfil = z.enum(["EST", "TST"]);
const dataCivil = z.string().date();
const pagina = z.number().int().min(0).max(10_000);
const base = z.object({ organizationId: uuid });
const meta = { chave: uuid, motivo: z.string().trim().min(5).max(2000) };
const comando = z.discriminatedUnion("acao", [
  z.object({
    ...meta,
    acao: z.literal("designar"),
    user_id: uuid,
    qualificacao_id: uuid,
    perfil,
    cliente_id: uuid.nullable(),
    unidade_id: uuid.nullable(),
    inicio: dataCivil.optional(),
    fim: dataCivil.nullable(),
    vincular_competencia: z.boolean(),
    ensaios: z.boolean(),
    biblioteca: z.boolean(),
    importacao: z.boolean(),
  }),
  z.object({ ...meta, acao: z.literal("revogar"), atribuicao_id: uuid }),
]);
const qualificacao = z.object({
  id: uuid,
  nome: z.string(),
  validade: dataCivil.nullable(),
  perfis: perfil.array(),
  perfis_para_associar: perfil.array(),
});
const atribuicao = z.object({
  id: uuid,
  perfil,
  cliente_id: uuid.nullable(),
  unidade_id: uuid.nullable(),
  designacao: z.string(),
  inicio: dataCivil,
  fim: dataCivil.nullable(),
  concedido_em: z.string(),
  revogada_em: z.string().nullable(),
  valida: z.boolean(),
});
const membro = z.object({
  user_id: uuid,
  nome: z.string(),
  email: z.string().nullable(),
  pessoa_id: uuid.nullable(),
  tem_registro: z.boolean(),
  qualificacoes: qualificacao.array(),
  atribuicoes: atribuicao.array(),
});
const membros = z.object({ total: z.number(), membros: membro.array() });
const historico = z.object({
  total: z.number(),
  eventos: z
    .object({
      id: uuid,
      acao: z.enum(["designada", "revogada"]),
      motivo: z.string(),
      criado_em: z.string(),
      autor: z.string(),
      perfil,
    })
    .array(),
});

export type InspecoesMembro = z.infer<typeof membro>;
export type InspecoesAcessoComando = z.infer<typeof comando>;

function result(response: { data: unknown; error: { code?: string; message: string } | null }) {
  const { data, error } = response;
  if (!error) return data;
  if (error.code === "42501") throw new Error(error.message);
  if (["22023", "23503", "23505", "23514"].includes(error.code ?? ""))
    throw new Error(error.message);
  if (["PGRST202", "42P01", "42883"].includes(error.code ?? ""))
    throw new Error("Integração não configurada para administrar os acessos de Inspeções.");
  throw new Error("Não foi possível concluir a operação de acesso de Inspeções.");
}

export const inspecoesAcessosListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(base.extend({ busca: z.string().trim().max(100), pagina }))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    return membros.parse(
      result(
        await db.rpc("inspecoes_acessos_listar", {
          p_org: data.organizationId,
          p_busca: data.busca,
          p_pagina: data.pagina,
        }),
      ),
    );
  });

export const inspecoesAcessosHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(base.extend({ usuarioId: uuid, pagina }))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    return historico.parse(
      result(
        await db.rpc("inspecoes_acessos_historico", {
          p_org: data.organizationId,
          p_usuario: data.usuarioId,
          p_pagina: data.pagina,
        }),
      ),
    );
  });

export const inspecoesAcessosExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(base.extend({ comando }))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { chave, ...dados } = data.comando;
    return z.object({ id: uuid, user_id: uuid, acao: z.enum(["designar", "revogar"]) }).parse(
      result(
        await db.rpc("inspecoes_acessos_executar", {
          p_org: data.organizationId,
          p_chave: chave,
          p_dados: dados,
        }),
      ),
    );
  });
