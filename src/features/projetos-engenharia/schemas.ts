import { z } from "zod";

const texto = (max: number) => z.string().trim().max(max);
const id = z.string().uuid();
export const documentoNativoSchema = z
  .object({
    schema_version: z.literal(1),
    familia: z.literal("documental"),
    finalidade: z.enum(["estudo", "layout_preliminar", "referencia_documental"]),
    secoes: z
      .array(z.object({ id, titulo: texto(160).min(1), texto: texto(20000) }).strict())
      .min(1)
      .max(50),
    parametros: z
      .array(
        z
          .object({
            id,
            nome: texto(120).min(1),
            valor_original: texto(120).min(1),
            unidade: texto(30).min(1),
            natureza: z.enum(["declarado", "medido", "estimado", "proposto"]),
            validacao: z.enum(["a_confirmar", "conferido", "divergente"]),
            fonte: texto(1000).min(1),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = [...v.secoes, ...v.parametros].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Cada seção e parâmetro precisa de identidade única.",
      });
  });

export type DocumentoNativo = z.infer<typeof documentoNativoSchema>;
export const listarPeSchema = z.object({
  organization_id: id,
  busca: texto(100).default(""),
  pagina: z.number().int().min(0).max(10000).default(0),
  arquivados: z.boolean().default(false),
});
export const detalhePeSchema = z.object({ organization_id: id, projeto_id: id });
export const comandoPeSchema = z.object({
  organization_id: id,
  chave: id,
  comando: z.enum([
    "criar",
    "salvar",
    "submeter",
    "devolver",
    "congelar",
    "nova_versao",
    "vigente",
    "arquivar",
    "reativar",
    "criar_cenario",
    "salvar_cenario",
    "promover_cenario",
    "descartar_cenario",
  ]),
  projeto_id: id.optional(),
  versao_id: id.optional(),
  cenario_id: id.optional(),
  expected_version: z.number().int().positive().optional(),
  titulo: texto(200).optional(),
  cliente_id: id.optional(),
  unidade_id: id.nullable().optional(),
  responsavel_id: id.optional(),
  local_descritivo: texto(1000).optional(),
  descricao: texto(4000).optional(),
  visibilidade: z.enum(["organizacao", "restrito"]).optional(),
  elaborado_em: z.string().date().nullable().optional(),
  autor_declarado: texto(200).optional(),
  revisao_declarada: texto(40).optional(),
  resumo: texto(2000).optional(),
  motivo: texto(2000).optional(),
  modelo: documentoNativoSchema.optional(),
});
export type ComandoPe = z.infer<typeof comandoPeSchema>;
