import { z } from "zod";
import { normaSchema, nrJsonSchema, recursoSchema } from "./schemas";
import type { NrJson } from "./domain";
export const nrHistoryId = z.union([
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => {
      try {
        return BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n;
      } catch {
        return false;
      }
    }, "Identificador de evento inválido."),
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform(String),
]);
export const nrRecordHistoryInput = z
  .object({
    organization_id: z.string().uuid(),
    norma: normaSchema,
    recurso: recursoSchema,
    registro_id: z.string().uuid(),
    pagina: z.number().int().min(0).max(1000000).default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const nrRevisionsInput = nrRecordHistoryInput
  .extend({ recurso: z.enum(["documentos", "modelos"]) })
  .strict();
export const nrEventDetailInput = z
  .object({ organization_id: z.string().uuid(), norma: normaSchema, evento_id: nrHistoryId })
  .strict();
export const nrRevisionDetailInput = nrRevisionsInput
  .omit({ pagina: true, limite: true })
  .extend({ revisao_id: z.string().uuid() })
  .strict();
export const nrHistoryMetadata = z.record(nrJsonSchema).superRefine((row, context) => {
  for (const key of ["conteudo", "snapshot", "antes", "depois", "dados"]) {
    if (row[key] !== undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "O conteúdo integral deve ser consultado apenas ao abrir um evento ou revisão.",
      });
  }
});
export const nrHistoryPage = z.object({
  rows: z.array(nrHistoryMetadata),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});
// RPC returns inert JSON. A retained audit snapshot can exceed the budget of an editable form;
// it is authorized and fetched individually, then rendered in a lazily expanded read-only tree.
export const nrHistoryDetail = z
  .record(z.unknown())
  .transform((value) => value as Record<string, NrJson>);
