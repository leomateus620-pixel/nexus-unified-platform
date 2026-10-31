import { z } from "zod";
export const nrSearchSchema = z.object({
  cliente: z.string().uuid().or(z.literal("")).catch(""),
  unidade: z.string().uuid().or(z.literal("")).catch(""),
  busca: z.string().max(120).catch(""),
  estado: z.string().max(80).catch(""),
  pagina: z.coerce.number().int().min(0).max(100000).catch(0),
  pasta: z.string().uuid().or(z.literal("")).catch(""),
  lixeira: z.boolean().catch(false),
  local: z.string().uuid().or(z.literal("")).catch(""),
  ficha: z
    .enum([
      "identificacao",
      "geometria",
      "avaliacao",
      "memorial",
      "resgate",
      "fotos",
      "documentos",
      "historico",
    ])
    .catch("identificacao"),
  escopo: z.enum(["", "unidade", "todos"]).catch(""),
  tipo: z.string().max(100).catch(""),
  familia: z.string().max(120).catch(""),
  vinculo: z.enum(["", "unidade"]).catch(""),
  copias: z.boolean().catch(false),
  aplicabilidade: z.boolean().catch(false),
  grupo: z.enum(["", "vigentes", "emitidos", "recebidos", "em_revisao", "anteriores"]).catch(""),
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
