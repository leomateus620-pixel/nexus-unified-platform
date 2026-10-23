import { z } from "zod";

export const DISPONIBILIDADE_NEGADA = "Disponibilidade indisponível para seu acesso atual.";
const id = z.string().uuid();
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e horário.");
const motivo = z.string().trim().min(5, "Descreva o motivo com ao menos 5 caracteres.").max(1000);
export const registro = z.object({
  id,
  organization_id: id,
  pessoa_id: id,
  inicio: z.string(),
  fim: z.string(),
  motivo_operacional: z.string(),
  version: z.number().int().positive(),
  cancelada_em: z.string().nullable(),
  motivo_cancelamento: z.string().nullable(),
  created_at: z.string(),
});
export const listaInput = z
  .object({
    organization_id: id,
    pessoa_id: id,
    pagina: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const lista = z.object({
  registros: registro.array(),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
  pode_gerir: z.boolean(),
  timezone: z.string(),
});
export const criarDados = z
  .object({
    pessoa_id: id,
    inicio_local: local,
    fim_local: local,
    timezone: z.string().min(1).max(80),
    motivo,
  })
  .strict()
  .refine((d) => d.fim_local > d.inicio_local, {
    path: ["fim_local"],
    message: "O fim deve ser posterior ao início.",
  });
export const cancelarDados = z
  .object({ id, expected_version: z.number().int().positive(), motivo })
  .strict();
export const comandoInput = z.discriminatedUnion("comando", [
  z
    .object({ organization_id: id, chave: id, comando: z.literal("registrar"), dados: criarDados })
    .strict(),
  z
    .object({
      organization_id: id,
      chave: id,
      comando: z.literal("cancelar"),
      dados: cancelarDados,
    })
    .strict(),
]);
export type Indisponibilidade = z.infer<typeof registro>;
