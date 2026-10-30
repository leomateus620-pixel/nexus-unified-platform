import { z } from "zod";
import type { NrJson } from "./domain";

export const normaSchema = z.enum(["NR33", "NR35"]);
export const recursoSchema = z.enum([
  "locais",
  "pastas",
  "documentos",
  "pendencias",
  "modelos",
  "levantamentos",
  "sistemas",
]);
const uuid = z.string().uuid();
const optionalId = uuid.nullable().optional();
const text = (max: number) => z.string().max(max);
const titulo = z.string().trim().min(2, "Informe um título com ao menos dois caracteres.").max(240);
const json: z.ZodType<NrJson> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)]),
);
/** Limites estruturais também são aplicados pelo comando SQL; conteúdo nunca é HTML executável. */
export const nrJsonSchema = z
  .unknown()
  .superRefine((value, context) => {
    const pending: { item: unknown; depth: number }[] = [{ item: value, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const current = pending.pop()!;
      nodes += 1;
      if (nodes > 30_000 || current.depth > 24) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Conteúdo excede o tamanho ou a complexidade suportada. Divida o documento em seções menores.",
        });
        return;
      }
      if (current.item && typeof current.item === "object") {
        for (const child of Object.values(current.item))
          pending.push({ item: child, depth: current.depth + 1 });
      }
    }
    try {
      if ((JSON.stringify(value)?.length ?? 0) > 2_000_000)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Conteúdo excede o tamanho suportado. Divida o documento em seções menores.",
        });
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conteúdo deve ser JSON sem referências circulares.",
      });
    }
  })
  .pipe(json);
export const conteudoNrSchema = z
  .object({
    schema_version: z.literal(1),
    blocos: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            tipo: z.enum(["titulo", "paragrafo", "tabela", "imagem", "referencia", "campo"]),
            texto: text(100_000).optional(),
            nivel: z.number().int().min(1).max(6).optional(),
            linhas: z
              .array(z.array(text(20_000)).max(30))
              .max(1000)
              .optional(),
            arquivo_id: uuid.optional(),
            legenda: text(2000).optional(),
            referencia_id: uuid.optional(),
            chave: text(200).optional(),
            modo: z.enum(["vinculado", "snapshot", "livre"]).optional(),
            valor_snapshot: nrJsonSchema.optional(),
            fonte_snapshot: nrJsonSchema.optional(),
            motivo_substituicao: text(4000).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((content, context) => {
    const ids = new Set<string>();
    content.blocos.forEach((block, index) => {
      if (ids.has(block.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocos", index, "id"],
          message: "Identificador de bloco repetido.",
        });
      ids.add(block.id);
      if (block.tipo === "imagem" && !block.arquivo_id)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocos", index, "arquivo_id"],
          message: "Vincule um arquivo verificado para a imagem.",
        });
      if (block.tipo === "tabela" && !block.linhas)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocos", index, "linhas"],
          message: "Informe as linhas da tabela.",
        });
      if (block.tipo === "campo" && !block.chave)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocos", index, "chave"],
          message: "Informe o campo vinculado.",
        });
      if (
        block.tipo === "campo" &&
        block.modo === "livre" &&
        (block.motivo_substituicao?.trim().length ?? 0) < 3
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocos", index, "motivo_substituicao"],
          message: "Informe o motivo da substituição manual do campo vinculado.",
        });
    });
  });
const normas = z
  .array(normaSchema)
  .min(1)
  .max(2)
  .refine((value) => new Set(value).size === value.length, "Norma repetida.");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data no formato AAAA-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida.");
const origemUrl = z
  .string()
  .url()
  .max(4000)
  .refine((url) => /^https:\/\//i.test(url), "Use uma referência HTTPS.")
  .nullable()
  .optional();
const dadosComuns = z.object({
  titulo: titulo.optional(),
  descricao: text(20_000).optional(),
  cliente_id: optionalId,
  unidade_id: optionalId,
  normas: normas.optional(),
  dados: z.record(nrJsonSchema).optional(),
});
export const dadosPorRecurso = {
  locais: dadosComuns
    .extend({
      tag: text(120).optional(),
      tipo: text(80).optional(),
      familia: text(100).optional(),
      aliases: z.array(text(300)).max(200).optional(),
      pet_espaco_id: optionalId,
    })
    .strict(),
  pastas: dadosComuns.extend({ parent_id: optionalId }).strict(),
  documentos: dadosComuns
    .extend({
      tipo: text(100).optional(),
      pasta_id: optionalId,
      local_id: optionalId,
      estado_origem: text(100).nullable().optional(),
      recebimento: z
        .enum(["nativo", "referencia", "pendente", "recebido", "indisponivel"])
        .optional(),
      origem_url: origemUrl,
      conteudo: conteudoNrSchema.optional(),
    })
    .strict(),
  modelos: dadosComuns
    .extend({
      tipo: z
        .enum(["documento", "levantamento", "regra", "criterio", "familia", "configuracao"])
        .optional(),
      conteudo: conteudoNrSchema.optional(),
    })
    .strict(),
  levantamentos: dadosComuns
    .extend({ local_id: optionalId, modelo_id: optionalId, respostas: nrJsonSchema.optional() })
    .strict(),
  sistemas: dadosComuns.extend({ local_id: optionalId, tipo: text(100).optional() }).strict(),
  pendencias: dadosComuns
    .extend({
      local_id: optionalId,
      documento_id: optionalId,
      criticidade: z.enum(["a_classificar", "baixa", "media", "alta", "critica"]).optional(),
      prazo: date.nullable().optional(),
      responsavel_id: optionalId,
      tratativa: text(20_000).optional(),
    })
    .strict(),
} as const;

export const nrConsultaSchema = z
  .object({
    organization_id: uuid,
    norma: normaSchema,
    recurso: z.enum(["contexto", "painel", "historico", ...recursoSchema.options]),
    operacao: z.enum(["listar", "detalhe"]).default("listar"),
    id: uuid.optional(),
    cliente_id: optionalId,
    unidade_id: optionalId,
    pasta_id: optionalId,
    parent_id: optionalId,
    local_id: optionalId,
    tipo: z.string().max(100).optional(),
    busca: z.string().max(200).default(""),
    estado: z.string().max(80).default(""),
    pagina: z.number().int().min(0).max(1_000_000).default(0),
    limite: z.number().int().min(1).max(100).default(25),
    lixeira: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.operacao === "detalhe" && !input.id)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "Informe o registro que deseja abrir.",
      });
  });
const comandos = z.enum([
  "salvar",
  "arquivar",
  "lixeira",
  "restaurar",
  "nova_revisao",
  "criar_revisao",
  "submeter",
  "publicar",
  "reabrir",
  "encerrar",
  "tratar_pendencia",
]);
export const nrExecutarSchema = z
  .object({
    organization_id: uuid,
    norma: normaSchema,
    recurso: recursoSchema,
    comando: comandos,
    id: uuid.optional(),
    expected_version: z.number().int().positive().optional(),
    chave: z.string().min(8).max(200),
    dados: z.record(nrJsonSchema).default({}),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.id && input.expected_version === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expected_version"],
        message: "Recarregue o registro para conferir sua versão antes de salvar.",
      });
    if (input.comando !== "salvar" && !input.id)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "Selecione um registro existente.",
      });
    const schema =
      input.comando === "salvar"
        ? dadosPorRecurso[input.recurso]
        : z
            .object({
              motivo: text(4000).optional(),
              fonte: text(4000).optional(),
              tratativa: text(20_000).optional(),
              estado: z.enum(["aberta", "encerrada"]).optional(),
            })
            .strict();
    const parsed = schema.safeParse(input.dados);
    if (!parsed.success)
      parsed.error.issues.forEach((issue) =>
        context.addIssue({ ...issue, path: ["dados", ...issue.path] }),
      );
    if (input.comando === "salvar" && !input.id && !input.dados["titulo"])
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dados", "titulo"],
        message: "Informe um título para o novo registro.",
      });
  });

export const nrRowSchema = z.object({
  id: uuid,
  organization_id: uuid,
  cliente_id: uuid.nullable(),
  unidade_id: uuid.nullable(),
  normas,
  titulo: z.string(),
  descricao: z.string().default(""),
  estado: z.string(),
  dados: z.record(nrJsonSchema).default({}),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
  arquivado_em: z.string().nullable(),
  tag: z.string().nullable().optional(),
  tipo: z.string().optional(),
  familia: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  parent_id: optionalId,
  local_id: optionalId,
  pasta_id: optionalId,
  pet_espaco_id: optionalId,
  modelo_id: optionalId,
  documento_id: optionalId,
  responsavel_id: optionalId,
  criticidade: z.string().optional(),
  prazo: z.string().nullable().optional(),
  tratativa: z.string().optional(),
  conteudo: nrJsonSchema.optional(),
  respostas: nrJsonSchema.optional(),
  modelo_snapshot: nrJsonSchema.optional(),
  estado_origem: z.string().nullable().optional(),
  recebimento: z.string().optional(),
  origem_url: z.string().nullable().optional(),
  revisao_numero: z.number().int().optional(),
  revisao_atual_id: uuid.nullable().optional(),
  impactos: z.array(nrJsonSchema).optional(),
  impactos_pendentes: z.number().int().nonnegative().optional(),
  revisao_necessaria: z.boolean().optional(),
  base_version_atual: z.number().int().positive().nullable().optional(),
  pode_revisar_impactos: z.boolean().optional(),
  bloqueio_revisao_impactos: z.string().nullable().optional(),
  revisoes: z.array(nrJsonSchema).optional(),
  revisoes_total: z.number().int().nonnegative().optional(),
  historico: z.array(nrJsonSchema).optional(),
  historico_total: z.number().int().nonnegative().optional(),
  tratativas: z.array(nrJsonSchema).optional(),
});
export const nrListaSchema = z.object({
  rows: z.array(nrRowSchema),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});
export const nrContextoSchema = z.object({
  clientes: z.array(
    z.object({
      id: uuid,
      nome: z.string().optional(),
      razao_social: z.string().optional(),
      nome_exibicao: z.string().nullable().optional(),
    }),
  ),
  unidades: z.array(z.object({ id: uuid, cliente_id: uuid, nome: z.string() })),
  permissoes: z.object({
    visualizar: z.boolean(),
    cadastrar: z.boolean(),
    editar: z.boolean(),
    anexar: z.boolean(),
    mover: z.boolean(),
    arquivar: z.boolean(),
    restaurar: z.boolean(),
    revisar: z.boolean(),
    aprovar: z.boolean(),
    emitir: z.boolean(),
    configurar: z.boolean(),
  }),
});
const nrPainelItemSchema = z.object({
  id: uuid,
  titulo: z.string(),
  estado: z.string(),
  tag: z.string().nullable().optional(),
  tipo: z.string().optional(),
  criticidade: z.string().optional(),
  prazo: z.string().nullable().optional(),
  updated_at: z.string().optional(),
  arquivado_em: z.string().nullable().optional(),
  revisao_numero: z.number().int().optional(),
});
export const nrPainelSchema = z.object({
  documentos_revisao_necessaria: z.number().int().nonnegative().optional(),
  locais: z.number().int().nonnegative(),
  documentos: z.number().int().nonnegative(),
  pendencias_abertas: z.number().int().nonnegative(),
  levantamentos: z.number().int().nonnegative(),
  em_revisao: z.number().int().nonnegative(),
  pendencias_prioritarias: z.array(nrPainelItemSchema),
  documentos_revisao: z.array(nrPainelItemSchema),
});
export const nrHistoricoSchema = z.object({
  rows: z.array(z.record(nrJsonSchema)),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().positive(),
});
