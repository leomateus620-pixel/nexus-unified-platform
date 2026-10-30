import { z } from "zod";
export const nrSearchSchema = z.object({
  cliente: z.string().uuid().or(z.literal("")).catch(""),
  unidade: z.string().uuid().or(z.literal("")).catch(""),
  busca: z.string().max(120).catch(""),
  estado: z.string().max(80).catch(""),
  pagina: z.coerce.number().int().min(0).max(100000).catch(0),
  pasta: z.string().uuid().or(z.literal("")).catch(""),
  lixeira: z.boolean().catch(false),
  importLote: z.string().uuid().or(z.literal("")).catch(""),
  importItem: z.string().uuid().or(z.literal("")).catch(""),
  importResultado: z
    .enum([
      "",
      "identificado",
      "extraido",
      "importado",
      "ja_existente",
      "duplicado_legitimo",
      "conflito",
      "indisponivel",
      "erro",
      "sem_correspondencia",
    ])
    .catch(""),
  importBusca: z.string().max(300).catch(""),
  importPagina: z.coerce.number().int().min(0).max(100000).catch(0),
});
