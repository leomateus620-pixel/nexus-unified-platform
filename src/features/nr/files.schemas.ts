import { z } from "zod";
import { NR_ARQUIVO_MAX_BYTES } from "./files";
import { nrJsonSchema } from "./schemas";
const uuid = z.string().uuid();
const optionalId = uuid.optional();
export const nrFileOrg = z.object({ organization_id: uuid }).strict();
export const nrFileId = nrFileOrg.extend({ id: uuid }).strict();
export const nrFileImage = nrFileId
  .extend({
    variante: z.enum(["miniatura_384", "previa_768", "original"]).default("miniatura_384"),
  })
  .strict();
export const nrFileDownload = nrFileId.extend({ visualizar: z.boolean().default(false) }).strict();
export const nrFileChange = nrFileId
  .extend({
    expected_version: z.number().int().positive(),
    chave: uuid,
    comando: z.enum(["renomear", "mover", "restaurar"]),
    dados: z
      .object({
        nome_exibicao: z.string().trim().min(1).max(500).optional(),
        pasta_id: uuid.nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.comando === "renomear" && !input.dados.nome_exibicao)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dados", "nome_exibicao"],
        message: "Informe o nome de exibição.",
      });
    if (input.comando === "mover" && !("pasta_id" in input.dados))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dados", "pasta_id"],
        message: "Selecione a pasta de destino ou a raiz.",
      });
  });
export const nrFilePrepare = nrFileOrg
  .extend({
    norma: z.enum(["NR33", "NR35"]),
    cliente_id: uuid,
    unidade_id: uuid,
    pasta_id: optionalId,
    documento_id: optionalId,
    revisao_id: optionalId,
    local_id: optionalId,
    nome: z.string().min(1).max(500),
    mime: z.string().max(200),
    tamanho: z.number().int().positive().max(NR_ARQUIVO_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    chave: uuid,
    papel: z.enum(["original", "derivado", "foto", "anexo", "representacao"]).default("original"),
  })
  .strict();
/** Resolve apenas identidades do manifesto; a autorização permanece na listagem canônica. */
export const nrDocumentImagesInput = nrFileOrg
  .extend({
    norma: z.enum(["NR33", "NR35"]),
    documento_id: uuid,
    revisao_id: uuid,
    arquivo_ids: z.array(uuid).max(100),
  })
  .strict();
export const nrFileList = nrFileOrg
  .extend({
    norma: z.enum(["NR33", "NR35"]),
    cliente_id: optionalId,
    unidade_id: optionalId,
    pasta_id: optionalId,
    documento_id: optionalId,
    revisao_id: optionalId,
    local_id: optionalId,
    arquivo_ids: z.array(uuid).max(100).optional(),
    pagina: z.number().int().min(0).max(1000000).default(0),
    limite: z.number().int().min(1).max(100).default(25),
    lixeira: z.boolean().default(false),
    busca: z.string().max(200).default(""),
  })
  .strict();
export const nrFileCancel = nrFileId
  .extend({ motivo: z.string().trim().min(2).max(4000), chave: uuid })
  .strict();
export const nrFileRow = z.object({
  id: uuid,
  organization_id: uuid,
  cliente_id: uuid,
  unidade_id: uuid,
  normas: z.array(z.enum(["NR33", "NR35"])),
  pasta_id: uuid.nullable(),
  documento_id: uuid.nullable(),
  revisao_id: uuid.nullable(),
  revisao_numero: z.number().int().positive().nullable().optional(),
  documento_titulo: z.string().nullable().optional(),
  local_id: uuid.nullable(),
  nome: z.string(),
  nome_exibicao: z.string().nullable().default(null),
  mime: z.string(),
  extensao: z.string(),
  tamanho: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  caminho: z.string(),
  estado: z.enum(["preparado", "verificado", "vinculado", "falhou", "arquivado"]),
  papel: z.enum(["original", "derivado", "foto", "anexo", "representacao"]),
  bytes_verificados: z.boolean(),
  created_by: uuid.nullable(),
  created_at: z.string(),
  confirmado_em: z.string().nullable(),
  erro: z.string().nullable(),
  version: z.number().int().positive(),
  origem_metadata: z.record(nrJsonSchema).optional(),
  contextos: z.array(z.record(nrJsonSchema)).optional(),
});
export const nrFileLimits = z.object({
  bucket: z.literal("nexus-nr-acervo"),
  max_bytes: z.number().int().positive().max(NR_ARQUIVO_MAX_BYTES),
  mime_types: z.array(z.string()),
  extensoes: z.array(z.string()),
});
export const nrFileListResult = z.object({
  rows: z.array(nrFileRow),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});
export const nrFileHistoricalInput = nrFileId
  .extend({
    norma: z.enum(["NR33", "NR35"]),
    pagina: z.number().int().min(0).max(1_000_000).default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const nrFileHistoricalPage = z.object({
  rows: z.array(
    z.object({
      id: uuid,
      arquivo_id: uuid,
      versao_origem: z.string(),
      nome_original: z.string().nullable(),
      mime: z.string().nullable(),
      tamanho_declarado: z.string().nullable(),
      modificado_em: z.string().nullable(),
      autor_historico: z.string().nullable(),
      estado: z.string(),
      bytes_disponiveis: z.boolean(),
      arquivo_historico_id: uuid.nullable(),
      motivo: z.string().nullable(),
      retencao_origem: z.boolean().nullable(),
      capturado_em: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});
export const nrFileConsumption = z.object({
  bytes_fisicos_medidos: z.number().int().nonnegative(),
  objetos_fisicos: z.number().int().nonnegative(),
  objetos_sem_tamanho: z.number().int().nonnegative(),
  medido_em: z.string(),
  escopo_medicao: z.string(),
  capacidade_informada: z.string(),
  escopo_capacidade: z.literal("nao_confirmado"),
  quota_aplicada: z.literal(false),
  ram_banco_informada: z.string(),
  ram_banco_medida: z.literal(false),
  por_unidade: z
    .array(
      z.object({
        cliente_id: uuid,
        unidade_id: uuid,
        objetos: z.number().int().nonnegative(),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  por_bucket: z
    .array(
      z.object({
        bucket_id: z.string(),
        objetos: z.number().int().nonnegative(),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  quantidade_revisoes: z.number().int().nonnegative().optional(),
  uploads_em_andamento: z.number().int().nonnegative().optional(),
  falhas: z.number().int().nonnegative().optional(),
  lotes_em_andamento: z.number().int().nonnegative().optional(),
  lotes_com_pendencias: z.number().int().nonnegative().optional(),
});

export const nrPhotoScope = nrFileOrg.extend({ local_id: uuid }).strict();
export const nrPhotoOccurrenceLinks = z.array(
  z.object({
    id: uuid,
    ordem: z.number().int().nonnegative(),
    campo: z.string(),
    referencia_original: z.string(),
    referencia_miniatura: z.string().nullable(),
    arquivo_id: uuid.nullable(),
    miniatura_arquivo_id: uuid.nullable(),
    miniatura_proveniencia: z.enum(["origem", "nexus"]).nullable(),
  }),
);
