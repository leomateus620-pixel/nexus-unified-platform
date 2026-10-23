import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonValue, objectResult, orgInput } from "./schemas";
import { petResult } from "./pet.functions";
const input = orgInput.extend({
  comando: z
    .object({
      chave: z.string().uuid(),
      comando: z.enum(["solicitar", "decidir"]),
      dados: z.record(jsonValue),
    })
    .strict(),
});
export const petRetificar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ context, data }) =>
    objectResult.parse(
      petResult(
        await (context.supabase as unknown as SupabaseClient).rpc("pet_retificar", {
          p_org: data.organization_id,
          p_comando: data.comando,
        }),
      ),
    ),
  );
