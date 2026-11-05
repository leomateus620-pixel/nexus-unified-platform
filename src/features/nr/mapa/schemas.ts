import { z } from "zod";
export const unitScopeSchema = z.object({
  organization_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
  norma: z.enum(["NR33", "NR35"]),
});
