import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "../nr.functions";
import { cotrirosa } from "./cotrirosa.server";
import { unitScopeSchema } from "./schemas";
const mapResult = z.object({
  cena: z.string().nullable(),
  versao: z.number().optional(),
  objetos: z.array(
    z.object({
      chave: z.string(),
      local_id: z.string().uuid(),
      tag: z.string(),
      titulo: z.string(),
      aliases: z.array(z.string()),
      posicao_confirmada: z.boolean(),
    }),
  ),
});
export const nrMapaContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(unitScopeSchema.extend({ manifesto: z.boolean().default(false) }))
  .handler(async ({ context, data }) => {
    const response = mapResult.parse(
      nrResult(
        await (context.supabase as SupabaseClient)
          .rpc("nr_mapa_contexto", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
          })
          .abortSignal(getRequest().signal),
      ),
    );
    if (response.cena !== cotrirosa.key || data.unidade_id !== cotrirosa.unit)
      return { cena: null, objetos: [] };
    return { ...response, ...(data.manifesto ? { manifest: cotrirosa } : {}) };
  });
