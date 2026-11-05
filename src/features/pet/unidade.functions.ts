import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nrResult } from "@/features/nr/nr.functions";
import { unitScopeSchema } from "@/features/nr/mapa/schemas";
const local = z.object({
  id: z.string().uuid(),
  tag: z.string(),
  titulo: z.string(),
  pet_espaco_id: z.string().uuid().nullable(),
});
export const petUnitResult = z.object({
  local_id: z.string().uuid().nullable(),
  espaco_id: z.string().uuid().nullable(),
  pode_criar: z.boolean(),
  pode_consultar: z.boolean(),
  bloqueio: z.string().nullable(),
  assinatura_configurada: z.boolean(),
  locais: z.array(local),
  modelos: z.array(z.object({ id: z.string().uuid(), nome: z.string(), versao: z.number() })),
  ordens: z.array(
    z.object({ id: z.string().uuid(), numero: z.coerce.string(), titulo: z.string() }),
  ),
});
export type PetUnitContext = z.infer<typeof petUnitResult>;
export const petContextoUnidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(unitScopeSchema.extend({ local_id: z.string().uuid().optional() }))
  .handler(async ({ context, data }) =>
    petUnitResult.parse(
      nrResult(
        await (context.supabase as SupabaseClient)
          .rpc("pet_contexto_unidade", {
            p_org: data.organization_id,
            p_cliente: data.cliente_id,
            p_unidade: data.unidade_id,
            p_norma: data.norma,
            p_local: data.local_id ?? null,
          })
          .abortSignal(getRequest().signal),
      ),
    ),
  );
