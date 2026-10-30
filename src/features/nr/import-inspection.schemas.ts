import { z } from "zod";
import type { NrJson } from "./domain";

export const importResults = [
  "identificado",
  "extraido",
  "importado",
  "ja_existente",
  "duplicado_legitimo",
  "conflito",
  "indisponivel",
  "erro",
  "sem_correspondencia",
] as const;
export const nrImportInspectionInput = z
  .object({
    organization_id: z.string().uuid(),
    lote_id: z.string().uuid().optional(),
    item_id: z.string().uuid().optional(),
    pagina: z.number().int().min(0).max(100000).default(0),
    limite: z.number().int().min(1).max(100).default(25),
    resultado: z.enum(importResults).optional(),
    busca: z.string().trim().max(300).default(""),
  })
  .refine((value) => !value.item_id || !!value.lote_id, "Informe o lote do item.");

export type NrImportMeta = Record<string, NrJson>;
export type NrImportInspectionData = {
  rows?: NrImportMeta[];
  lote?: NrImportMeta;
  item?: NrImportMeta;
  total?: number;
  pagina?: number;
  limite?: number;
  por_resultado?: { resultado: string; quantidade: number }[];
};
// These are inert JSONB snapshots from the authorized RPC, not editable form input.
// A full audit item can exceed a form's structural node budget; it is fetched only on demand.
export const nrImportInspectionResponse = z
  .object({
    rows: z.array(z.record(z.unknown())).optional(),
    lote: z.record(z.unknown()).optional(),
    item: z.record(z.unknown()).optional(),
    total: z.number().int().nonnegative().optional(),
    pagina: z.number().int().nonnegative().optional(),
    limite: z.number().int().min(1).max(100).optional(),
    por_resultado: z
      .array(z.object({ resultado: z.string(), quantidade: z.number().int().nonnegative() }))
      .optional(),
  })
  .refine((value) => Array.isArray(value.rows) || !!value.item, "Resposta de conciliação inválida.")
  .transform((value) => value as NrImportInspectionData);
