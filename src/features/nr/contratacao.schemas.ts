import { z } from "zod";
import { unitScopeSchema } from "./mapa/schemas";
export const contratacaoSchema = z.object({
  confirmada: z.boolean(),
  version: z.number().int(),
  documentos: z.array(z.string()),
  fonte: z.string().nullable(),
  updated_at: z.string().nullable(),
  pode_alterar: z.boolean(),
  bloqueio: z.string().nullable(),
  responsavel: z
    .object({
      id: z.string().uuid(),
      nome: z.string(),
      registro_profissional: z.string().nullable(),
    })
    .nullable(),
  catalogo: z.array(
    z.object({
      codigo: z.string(),
      titulo: z.string(),
      escopo: z.enum(["local", "unidade"]),
      normas: z.array(z.string()),
      blocos: z.array(z.string()),
      obrigatorio: z.boolean(),
      ordem: z.number(),
    }),
  ),
  blocos: z.array(z.string()),
  historico: z.array(
    z.object({
      version: z.number(),
      fonte: z.string(),
      documentos: z.array(z.string()),
      created_at: z.string(),
    }),
  ),
});
export type NrContratacao = z.infer<typeof contratacaoSchema>;
export const contratacaoSalvarSchema = unitScopeSchema
  .extend({
    expected_version: z.number().int().nonnegative(),
    chave: z.string().uuid(),
    documentos: z
      .array(z.string().max(50))
      .min(1)
      .max(13)
      .refine((v) => v.includes("memorial") && new Set(v).size === v.length),
    fonte: z.string().trim().min(10).max(4000),
  })
  .strict();
