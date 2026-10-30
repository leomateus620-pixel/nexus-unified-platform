import { z } from "zod";
import { normaSchema, nrJsonSchema, nrRowSchema } from "./schemas";

/** Only these relational values can be captured; technical conclusions are never inferred. */
export const nrDocumentFieldLabels = {
  "local.tag": "TAG do local",
  "local.titulo": "Nome do local",
  "local.descricao": "Descrição do local",
  "local.tipo": "Classificação cadastrada do local",
  "local.familia": "Família cadastrada do local",
  "cliente.razao_social": "Razão social do cliente",
  "cliente.nome_exibicao": "Nome de exibição do cliente",
  "unidade.nome": "Nome da unidade",
  "unidade.endereco": "Endereço da unidade",
} as const;
export const nrDocumentFieldKey = z.enum([
  "local.tag",
  "local.titulo",
  "local.descricao",
  "local.tipo",
  "local.familia",
  "cliente.razao_social",
  "cliente.nome_exibicao",
  "unidade.nome",
  "unidade.endereco",
]);
const uuid = z.string().uuid();
export const nrDocumentFieldsInput = z
  .object({
    organization_id: uuid,
    norma: normaSchema,
    cliente_id: uuid,
    unidade_id: uuid,
    local_id: uuid.nullable().optional(),
  })
  .strict();
export const nrDocumentFieldSource = z
  .object({
    tipo: z.enum(["local", "cliente", "unidade"]),
    id: uuid,
    version: z.number().int().positive().nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    updated_at: z.string().nullable(),
  })
  .strict();
export const nrDocumentFieldsOutput = z.object({
  campos: z
    .array(
      z
        .object({
          chave: nrDocumentFieldKey,
          rotulo: z.string().min(1).max(300),
          valor: nrJsonSchema,
          fonte: nrDocumentFieldSource,
        })
        .strict()
        .superRefine((field, context) => {
          if (field.fonte.tipo !== field.chave.split(".")[0])
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["fonte", "tipo"],
              message: "A fonte não corresponde ao campo capturado.",
            });
          if (field.chave.startsWith("local.") && field.fonte.version === null)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["fonte", "version"],
              message: "O vínculo com o local exige sua versão.",
            });
        }),
    )
    .max(30),
  contexto: z.record(nrJsonSchema),
});
export type NrDocumentField = z.infer<typeof nrDocumentFieldsOutput>["campos"][number];
export const nrDocumentFromModelInput = z
  .object({
    organization_id: uuid,
    norma: normaSchema,
    chave: uuid,
    dados: z
      .object({
        cliente_id: uuid,
        unidade_id: uuid,
        local_id: uuid.nullable().optional(),
        pasta_id: uuid.nullable().optional(),
        titulo: z.string().trim().min(2).max(240),
        descricao: z.string().max(20000).optional(),
        tipo: z.string().max(100).optional(),
        normas: z.array(normaSchema).min(1).max(2).optional(),
        modelo_id: uuid,
        modelo_versao_id: uuid.optional(),
        modelo_expected_version: z.number().int().positive(),
        usar_rascunho: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.dados.normas &&
      (!input.dados.normas.includes(input.norma) ||
        new Set(input.dados.normas).size !== input.dados.normas.length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dados", "normas"],
        message: "Selecione as normas sem repetição, incluindo o módulo atual.",
      });
  });
export const nrDocumentFromModelOutput = z.object({ registro: nrRowSchema });
