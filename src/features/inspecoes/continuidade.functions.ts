import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const civil = z.string().date().optional();
const title = z.string().trim().min(3).max(200);
const scope = z.object({ organizationId: uuid, clienteId: uuid, unidadeId: uuid });
const page = scope.extend({ pagina: z.number().int().min(0).max(10000) });
const contractFields = {
  titulo: title,
  referencia: z.string().trim().min(3).max(200).optional(),
  proposta_id: uuid.optional(),
  pacote_id: uuid.optional(),
  inicio: civil,
  fim: civil,
};
const contractState = { contrato_id: uuid, version };
const command = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("criar_contrato"), ...contractFields }),
  z.object({ acao: z.literal("editar_contrato"), ...contractState, ...contractFields }),
  z.object({ acao: z.literal("ativar_contrato"), ...contractState }),
  z.object({
    acao: z.literal("cancelar_contrato"),
    ...contractState,
    motivo: z.string().trim().min(8).max(2000),
  }),
  z.object({
    acao: z.literal("planejar_ciclo"),
    ...contractState,
    titulo: title,
    recorte: z.string().trim().min(2).max(200),
    janela_inicio: civil,
    janela_fim: civil,
    detalhes: z.string().max(2000).optional(),
    os_id: uuid.optional(),
  }),
  z.object({
    acao: z.literal("vincular_os"),
    ...contractState,
    ciclo_id: uuid,
    ciclo_version: version,
    os_id: uuid,
  }),
]);

export type ContinuidadeComando = z.infer<typeof command>;
export type ContinuidadeEscopo = z.infer<typeof scope>;
export type ContinuidadeSegmento = "CC" | "AG-A" | "AG-B" | "IN";
export type ContinuidadeProposta = { id: string; numero: string; titulo: string | null };
export type ContinuidadePacote = { id: string; codigo: string | null; titulo: string };
export type ContinuidadeOS = { id: string; numero: number; titulo: string; estado: string };
export type ContinuidadeContrato = {
  id: string;
  titulo: string;
  referencia: string | null;
  segmento: ContinuidadeSegmento;
  estado: "rascunho" | "vigente" | "cancelado";
  version: number;
  inicio: string | null;
  fim: string | null;
  situacao_prazo: "a_iniciar" | "sem_prazo" | "vencido" | "em_aviso" | "em_dia" | null;
  cancelado_em: string | null;
  cancelamento_motivo: string | null;
  proposta: ContinuidadeProposta | null;
  pacote: ContinuidadePacote | null;
};
export type ContinuidadeCiclo = {
  id: string;
  titulo: string;
  recorte: string;
  janela_inicio: string | null;
  janela_fim: string | null;
  detalhes: string;
  version: number;
  tem_ordem: boolean;
  ordem: ContinuidadeOS | null;
};
type Contratos = {
  contratos: ContinuidadeContrato[];
  segmento: ContinuidadeSegmento | null;
  total: number;
  limite: number;
};
type Ciclos = { ciclos: ContinuidadeCiclo[]; total: number; limite: number };
type Options = {
  propostas: ContinuidadeProposta[];
  pacotes: ContinuidadePacote[];
  ordens: ContinuidadeOS[];
};

function result<T>(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): T {
  const error = response.error;
  if (!error) return response.data as T;
  if (["42501", "23503", "PGRST116"].includes(error.code ?? "")) {
    throw new Error("Vínculo indisponível no contexto autorizado.");
  }
  if (error.code === "23505") throw new Error("A OS ou a chave de operação já está vinculada.");
  if (error.code === "40001") throw new Error(error.message);
  if (error.code === "23514" || error.code === "22023") throw new Error(error.message);
  if (["42883", "PGRST202", "42P01"].includes(error.code ?? "")) {
    throw new Error("Integração de continuidade não configurada.");
  }
  throw new Error("Não foi possível concluir a operação de continuidade.");
}

function rpcScope(data: ContinuidadeEscopo) {
  return { p_org: data.organizationId, p_cliente: data.clienteId, p_unidade: data.unidadeId };
}

export const inspecoesContinuidadeContratos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(page)
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    return result<Contratos>(
      await db.rpc("inspecoes_continuidade_consultar", {
        ...rpcScope(data),
        p_pagina: data.pagina,
      }),
    );
  });

export const inspecoesContinuidadeCiclos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(page.extend({ contratoId: uuid }))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    return result<Ciclos>(
      await db.rpc("inspecoes_ciclos_consultar", {
        ...rpcScope(data),
        p_contrato: data.contratoId,
        p_pagina: data.pagina,
      }),
    );
  });

export const inspecoesContinuidadeOpcoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope.extend({ busca: z.string().trim().max(80) }))
  .handler(async ({ context, data }): Promise<Options> => {
    const db = context.supabase as unknown as SupabaseClient;
    const allowed = result<boolean>(
      await db.rpc("inspecoes_pode", { ...rpcScope(data), p_capacidade: "est" }),
    );
    if (!allowed) throw new Error("A seleção de vínculos exige atribuição EST nesta unidade.");
    let propostas = db
      .from("propostas")
      .select("id,numero,titulo")
      .eq("organization_id", data.organizationId)
      .eq("cliente_id", data.clienteId)
      .eq("unidade_id", data.unidadeId);
    let ordens = db
      .from("ordens_servico")
      .select("id,numero,titulo,estado")
      .eq("organization_id", data.organizationId)
      .eq("cliente_id", data.clienteId)
      .eq("unidade_id", data.unidadeId)
      .neq("estado", "cancelada");
    if (data.busca) {
      const literal = data.busca.replace(/[\\%_]/g, "\\$&");
      propostas = propostas.ilike("titulo", "%" + literal + "%");
      ordens = ordens.ilike("titulo", "%" + literal + "%");
    }
    const [proposalRows, orderRows, packageRows] = await Promise.all([
      propostas.order("numero", { ascending: false }).limit(30),
      ordens.order("numero", { ascending: false }).limit(30),
      db
        .from("inspecoes_registros")
        .select("id,codigo,titulo")
        .eq("organization_id", data.organizationId)
        .eq("colecao", "pacotes")
        .order("codigo")
        .limit(30),
    ]);
    return {
      propostas: result<ContinuidadeProposta[]>(proposalRows) ?? [],
      ordens: result<ContinuidadeOS[]>(orderRows) ?? [],
      pacotes: result<ContinuidadePacote[]>(packageRows) ?? [],
    };
  });

export const inspecoesContinuidadeExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope.extend({ chave: uuid, comando: command }))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient;
    return result<{ contrato_id: string; ciclo_id: string | null; version: number }>(
      await db.rpc("inspecoes_continuidade_comando", {
        ...rpcScope(data),
        p_chave: data.chave,
        p_dados: data.comando,
      }),
    );
  });
