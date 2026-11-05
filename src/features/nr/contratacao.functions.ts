import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { unitScopeSchema } from "./mapa/schemas";
import { contratacaoSchema, contratacaoSalvarSchema } from "./contratacao.schemas";
export const nrContratacaoObter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(unitScopeSchema)
  .handler(async ({ context, data }) =>
    contratacaoSchema.parse(
      nrResult(
        await (context.supabase as SupabaseClient)
          .rpc("nr_contratacao_obter", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
export const nrContratacaoSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(contratacaoSalvarSchema)
  .handler(async ({ context, data }) =>
    contratacaoSchema.parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("nr_contratacao_salvar", {
          p_org: data.organization_id,
          p_cliente: data.cliente_id,
          p_unidade: data.unidade_id,
          p_norma: data.norma,
          p_expected_version: data.expected_version,
          p_chave: data.chave,
          p_documentos: data.documentos,
          p_fonte: data.fonte,
        }),
      ),
    ),
  );
