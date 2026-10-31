import { assinarMarcas } from "@/features/clientes/marca.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  nrConsultaSchema,
  nrAssociarContextoSchema,
  nrContextoSchema,
  nrExecutarSchema,
  nrHistoricoSchema,
  nrListaSchema,
  nrPainelSchema,
  nrRowSchema,
} from "./schemas";
import type { NrJson } from "./domain";

// A fronteira valida os tipos aditivos até o procedimento oficial regenerar o schema.
const client = (value: unknown) => value as SupabaseClient;
export function nrResult(response: {
  data: unknown;
  error: { code?: string; message: string } | null;
}): unknown {
  if (!response.error) return response.data;
  const code = response.error.code;
  if (code === "40001")
    throw new Error(
      "Outra pessoa alterou este registro. Seu preenchimento foi preservado. Recarregue e compare as versões antes de salvar novamente.",
    );
  if (["42501", "23503"].includes(code ?? ""))
    throw new Error("Registro indisponível ou sem permissão no contexto atual.");
  if (code === "23505")
    throw new Error(
      "Identidade ou chave já utilizada. Confira o registro existente e a operação anterior antes de repetir.",
    );
  if (["PGRST202", "42P01", "42883"].includes(code ?? ""))
    throw new Error(
      "Integração não configurada: o fluxo NR-33/NR-35 ainda não está disponível nesta versão do banco. Seu preenchimento foi preservado.",
    );
  if (["23514", "22023"].includes(code ?? "")) throw new Error(response.error.message);
  throw new Error(
    response.error.message ||
      "Não foi possível concluir a operação. Seu preenchimento foi preservado.",
  );
}

export const nrConsultar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrConsultaSchema)
  .handler(async ({ context, data }) => {
    const { organization_id, norma, recurso, operacao: _operacao, ...filtros } = data;
    const response = nrResult(
      await client(context.supabase)
        .rpc("nr_consultar", {
          p_org: organization_id,
          p_norma: norma,
          p_recurso: recurso,
          p_filtros: Object.fromEntries(
            Object.entries(filtros).filter(([, value]) => value !== undefined),
          ),
        })
        .abortSignal(getRequest().signal),
    );
    if (recurso === "contexto") {
      const parsed = nrContextoSchema.parse(response);
      // Contexto já delimita os IDs autorizados. Consulta única, sem detalhe por card.
      let brandRows: { id: string; marca?: unknown }[] = [];
      if (parsed.clientes.length) {
        try {
          const responseBrands = await client(context.supabase)
            .from("clientes")
            .select("id,marca")
            .eq("organization_id", organization_id)
            .in(
              "id",
              parsed.clientes.map((row) => row.id),
            );
          if (!responseBrands.error) brandRows = responseBrands.data as typeof brandRows;
        } catch {
          // Sem prévia de marca, o contexto e o nome do cadastro continuam disponíveis.
        }
      }
      const marcas = await assinarMarcas(client(context.supabase), brandRows);
      return {
        ...parsed,
        clientes: parsed.clientes.map((cliente) => ({
          ...cliente,
          marca: marcas.find((row) => row.id === cliente.id)?.marca ?? null,
          nome:
            cliente.nome ??
            cliente.nome_exibicao ??
            cliente.razao_social ??
            "Cliente sem nome informado",
        })),
      };
    }
    if (recurso === "painel") return nrPainelSchema.parse(response);
    if (recurso === "historico" || recurso === "historico_tecnico")
      return nrHistoricoSchema.parse(response);
    if (data.id) {
      const wrapped = z.object({ registro: nrRowSchema }).safeParse(response);
      return wrapped.success ? wrapped.data : { registro: nrRowSchema.parse(response) };
    }
    return nrListaSchema.parse(response);
  });

/** Associa um cadastro existente ao módulo, sem alterar o cadastro global. */
export const nrAssociarContexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrAssociarContextoSchema)
  .handler(async ({ context, data }) =>
    z.object({ cliente_id: z.string().uuid(), unidade_id: z.string().uuid() }).parse(
      nrResult(
        await client(context.supabase).rpc("nr_contexto_associar", {
          p_org: data.organization_id,
          p_cliente: data.cliente_id,
          p_unidade: data.unidade_id,
          p_normas: data.normas,
          p_chave: data.chave,
        }),
      ),
    ),
  );

export const nrExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrExecutarSchema)
  .handler(async ({ context, data }) => {
    const comando =
      data.comando === "criar_revisao"
        ? "nova_revisao"
        : data.comando === "lixeira"
          ? "arquivar"
          : data.comando === "tratar_pendencia"
            ? data.dados["estado"] === "aberta"
              ? "reabrir"
              : "encerrar"
            : data.comando;
    const dados: Record<string, NrJson> = { ...data.dados };
    if (data.comando === "tratar_pendencia") delete dados["estado"];
    const response = nrResult(
      await client(context.supabase).rpc("nr_executar", {
        p_org: data.organization_id,
        p_norma: data.norma,
        p_recurso: data.recurso,
        p_comando: comando,
        p_id: data.id ?? null,
        p_expected_version: data.expected_version ?? null,
        p_chave: data.chave,
        p_dados: dados,
      }),
    );
    const wrapped = z.object({ registro: nrRowSchema }).safeParse(response);
    return wrapped.success ? wrapped.data : { registro: nrRowSchema.parse(response) };
  });
