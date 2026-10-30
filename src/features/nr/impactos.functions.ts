import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { normaSchema, nrRowSchema } from "./schemas";
export const nrRevisarImpactos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        organization_id: z.string().uuid(),
        norma: normaSchema,
        documento_id: z.string().uuid(),
        revisao_id: z.string().uuid(),
        expected_version: z.number().int().positive(),
        base_expected_version: z.number().int().positive(),
        chave: z.string().uuid(),
        motivo: z.string().trim().min(3).max(4000),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    z
      .object({
        registro: nrRowSchema,
        impactos_revisados: z.number().int().nonnegative(),
        revisao_conferida_id: z.string().uuid(),
      })
      .parse(
        nrResult(
          await (context.supabase as unknown as SupabaseClient).rpc(
            "nr_documento_revisar_impactos",
            {
              p_org: data.organization_id,
              p_norma: data.norma,
              p_documento: data.documento_id,
              p_revisao: data.revisao_id,
              p_expected_version: data.expected_version,
              p_base_expected_version: data.base_expected_version,
              p_chave: data.chave,
              p_motivo: data.motivo,
            },
          ),
        ),
      ),
  );
