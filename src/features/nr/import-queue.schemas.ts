import { z } from "zod";
import { nrJsonSchema } from "./schemas";

const id = z.string().uuid();
export const importQueueContext = z.object({ organization_id: id }).strict();
const dependency = z
  .object({ tipo: z.string().min(1).max(100), externo_id: z.string().min(1).max(1000) })
  .strict();
export const importQueueItem = z
  .object({
    sequencia: z.number().int().positive().max(100000),
    tipo: z.string().min(1).max(100),
    externo_id: z.string().min(1).max(1000),
    payload: z.record(nrJsonSchema),
    destino: z
      .object({
        entidade: z.enum([
          "clientes",
          "unidades",
          "locais",
          "pastas",
          "documentos",
          "pendencias",
          "modelos",
          "levantamentos",
          "sistemas",
          "referencias",
        ]),
        registro: z.record(nrJsonSchema),
        dependencias: z
          .object({
            cliente_id: dependency.optional(),
            unidade_id: dependency.optional(),
            local_id: dependency.optional(),
            pasta_id: dependency.optional(),
            parent_id: dependency.optional(),
            documento_id: dependency.optional(),
            modelo_id: dependency.optional(),
          })
          .strict()
          .optional(),
      })
      .catchall(nrJsonSchema),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    capturado_em: z.string().datetime({ offset: true }),
  })
  .strict();
export const importQueuePlan = z
  .object({
    format: z.literal("nexus-nr-import-plan-v1"),
    organization_id: id.optional(),
    origem: z.string().trim().min(3).max(500),
    snapshot_inicio: z.string().datetime({ offset: true }),
    snapshot_fim: z.string().datetime({ offset: true }),
    manifesto: z.record(nrJsonSchema),
    itens: z.array(importQueueItem).min(1).max(100000),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.snapshot_fim) < Date.parse(value.snapshot_inicio))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snapshot_fim"],
        message: "O fim da captura antecede seu início.",
      });
    const identities = new Set<string>();
    value.itens.forEach((item, index) => {
      if (item.sequencia !== index + 1)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["itens", index, "sequencia"],
          message: "Ordene os itens de 1 até o total, na ordem de dependências.",
        });
      const key = JSON.stringify([item.tipo, item.externo_id]);
      if (identities.has(key))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["itens", index, "externo_id"],
          message: "Identidade de origem repetida no manifesto.",
        });
      identities.add(key);
    });
  });
export const importQueuePrepare = importQueueContext
  .extend({
    norma: z.enum(["NR33", "NR35"]),
    origem: z.string().trim().min(3).max(500),
    chave: z.string().regex(/^[a-f0-9]{64}$/),
    inicio: z.string().datetime({ offset: true }),
    fim: z.string().datetime({ offset: true }),
    manifesto: z.record(nrJsonSchema),
    total: z.number().int().min(1).max(100000),
  })
  .strict();
export const importQueueStage = importQueueContext
  .extend({ fila_id: id, itens: z.array(importQueueItem).min(1).max(25) })
  .strict();
export const importQueueCommand = importQueueContext
  .extend({ fila_id: id, acao: z.enum(["iniciar", "pausar", "retomar", "cancelar"]) })
  .strict();
export const importQueueQuery = importQueueContext
  .extend({ id: id.optional(), pagina: z.number().int().min(0).max(1000000).default(0) })
  .strict();
export const importQueueRow = z
  .object({
    id,
    lote_id: id,
    norma: z.enum(["NR33", "NR35"]),
    origem: z.string(),
    estado: z.enum([
      "preparando",
      "fila",
      "processando",
      "pausado",
      "concluido",
      "com_pendencias",
      "cancelado",
    ]),
    total: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
    recebidos: z.number().int().nonnegative().optional(),
    processados: z.number().int().nonnegative().optional(),
  })
  .strip();
export const importQueueResponse = z
  .object({
    rows: z.array(z.record(nrJsonSchema)),
    total: z.number().int().nonnegative(),
    pagina: z.number().int().nonnegative(),
    agendador_ativo: z.boolean(),
    fila: importQueueRow.optional(),
    recebidos: z.number().int().nonnegative().optional(),
    processados: z.number().int().nonnegative().optional(),
    erros: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ImportQueuePlan = z.infer<typeof importQueuePlan>;
