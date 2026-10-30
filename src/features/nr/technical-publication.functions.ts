import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { nrRowSchema } from "./schemas";
import {
  nrTechnicalContextInput,
  nrTechnicalContextOutput,
  nrTechnicalPublicationInput,
  nrTechnicalPublicationOutput,
} from "./technical-publication.schemas";

export const nrModeloPublicacaoContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrTechnicalContextInput)
  .handler(async ({ context, data }) =>
    nrTechnicalContextOutput.parse(
      nrResult(
        await (context.supabase as unknown as SupabaseClient)
          .rpc("nr_modelo_publicacao_contexto", {
            p_org: data.organization_id,
            p_norma: data.norma,
            p_id: data.modelo_id,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );

export const nrModeloPublicarTecnico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nrTechnicalPublicationInput)
  .handler(async ({ context, data }) => {
    const response = nrResult(
      await (context.supabase as unknown as SupabaseClient).rpc("nr_modelo_publicar_tecnico", {
        p_org: data.organization_id,
        p_norma: data.norma,
        p_id: data.modelo_id,
        p_expected_version: data.expected_version,
        p_chave: data.chave,
        p_evidencia: data.evidencia,
      }),
    );
    const wrapped = nrTechnicalPublicationOutput.safeParse(response);
    return wrapped.success ? wrapped.data : { registro: nrRowSchema.parse(response) };
  });
