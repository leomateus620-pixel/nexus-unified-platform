import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import {
  nrDocumentFieldsInput,
  nrDocumentFieldsOutput,
  nrDocumentFromModelInput,
  nrDocumentFromModelOutput,
} from "./document-models.schemas";

export const nrDocumentoCampos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrDocumentFieldsInput)
  .handler(async ({ context, data }) =>
    nrDocumentFieldsOutput.parse(
      nrResult(
        await (context.supabase as unknown as SupabaseClient)
          .rpc("nr_documento_campos", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_local: data.local_id ?? null,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );

export const nrDocumentoDeModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrDocumentFromModelInput)
  .handler(async ({ context, data }) =>
    nrDocumentFromModelOutput.parse(
      nrResult(
        await (context.supabase as unknown as SupabaseClient).rpc("nr_documento_de_modelo", {
          p_org: data.organization_id,
          p_norma: data.norma,
          p_chave: data.chave,
          p_dados: data.dados,
        }),
      ),
    ),
  );
