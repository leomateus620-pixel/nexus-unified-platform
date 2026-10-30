import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "./nr.functions";
import { nrRowSchema } from "./schemas";
export const nrPastaOrdenar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        organization_id: z.string().uuid(),
        norma: z.enum(["NR33", "NR35"]),
        id: z.string().uuid(),
        expected_version: z.number().int().positive(),
        direcao: z.enum(["subir", "descer"]),
        chave: z.string().uuid(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    z.object({ registro: nrRowSchema }).parse(
      nrResult(
        await (context.supabase as SupabaseClient).rpc("nr_pasta_ordenar", {
          p_org: data.organization_id,
          p_norma: data.norma,
          p_id: data.id,
          p_expected_version: data.expected_version,
          p_direcao: data.direcao,
          p_chave: data.chave,
        }),
      ),
    ),
  );
