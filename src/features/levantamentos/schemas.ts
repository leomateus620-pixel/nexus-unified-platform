import { z } from "zod";

const uuid = z.string().uuid("Selecione um registro válido.");
const texto = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const version = z.number().int().positive("Recarregue a versão atual do registro.");
export type LevantamentoJson =
  string | number | boolean | null | LevantamentoJson[] | { [key: string]: LevantamentoJson };
const jsonSchema: z.ZodType<LevantamentoJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);
export const estadoLevantamentoSchema = z.enum([
  "rascunho",
  "programado",
  "em_coleta",
  "em_revisao",
  "aprovado",
  "cancelado",
]);
export const grandezaSchema = z.enum(["comprimento", "area", "contagem", "angulo", "forca"]);
export const origemMedicaoSchema = z.enum(["campo", "documento", "modelo_3d"]);
export const naturezaMedicaoSchema = z.enum(["medida", "estimativa"]);
export const unidadesPorGrandeza = {
  comprimento: ["m", "cm", "mm"],
  area: ["m2"],
  contagem: ["un"],
  angulo: ["grau"],
  forca: ["kN", "N"],
} as const;

// Decimal permanece texto; PostgreSQL é a autoridade de precisão e conversão.
export const decimalTextoSchema = texto(64)
  .regex(
    /^\d{1,12}(?:[.,]\d{1,6})?$/,
    "Use até 12 inteiros e seis casas decimais, sem milhar ou notação científica.",
  )
  .transform((value) => value.replace(",", "."));
const decimalRascunho = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  decimalTextoSchema.nullable(),
);
const instante = z
  .string()
  .datetime({ offset: true, message: "Informe data, horário e fuso válidos." });
const instanteRascunho = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  instante.nullable(),
);

export const medicaoDadosSchema = z
  .object({
    chave: texto(120).min(1, "Identifique a medida."),
    grandeza: grandezaSchema,
    valor: decimalRascunho,
    unidade: texto(20).default(""),
    precisao: decimalRascunho,
    metodo: texto(1000).default(""),
    origem: origemMedicaoSchema.default("campo"),
    natureza: naturezaMedicaoSchema.default("medida"),
    coletado_em: instanteRascunho,
    observacoes: texto(4000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.precisao !== null && !/[1-9]/.test(value.precisao))
      ctx.addIssue({
        code: "custom",
        path: ["precisao"],
        message: "A precisão informada precisa ser maior que zero.",
      });
    if (value.grandeza === "contagem" && value.valor !== null && /\.\d*[1-9]/.test(value.valor))
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message: "Contagem deve ser um número inteiro.",
      });
    if (
      value.unidade &&
      !(unidadesPorGrandeza[value.grandeza] as readonly string[]).includes(value.unidade)
    )
      ctx.addIssue({
        code: "custom",
        path: ["unidade"],
        message: "Unidade incompatível com a grandeza.",
      });
    if (value.origem === "modelo_3d" && value.natureza !== "estimativa")
      ctx.addIssue({
        code: "custom",
        path: ["natureza"],
        message: "Informação de modelo 3D deve permanecer identificada como estimativa.",
      });
  });

const medicaoCampos = medicaoDadosSchema.innerType().shape;
export const medicaoBulkSchema = z
  .object({
    medicao_id: uuid.nullable().optional(),
    expected_version: version.nullable().optional(),
    ...medicaoCampos,
  })
  .strict()
  .superRefine((value, ctx) => {
    const checked = medicaoDadosSchema.safeParse({
      ...Object.fromEntries(
        Object.keys(medicaoCampos).map((key) => [key, Reflect.get(value, key)]),
      ),
    });
    if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue(issue);
    if (value.medicao_id && !value.expected_version)
      ctx.addIssue({
        code: "custom",
        path: ["expected_version"],
        message: "Recarregue a medida antes de editar.",
      });
  });

export const pontoDadosSchema = z.object({
  codigo: texto(40).min(1, "Informe o código local do ponto."),
  nome: texto(200).min(2, "Informe ao menos dois caracteres para o ponto."),
  area: texto(200).default(""),
  localizacao: texto(1000).default(""),
  tipo_sistema: texto(120).default(""),
  observacoes: texto(4000).default(""),
  exige_foto: z.boolean().default(false),
});

export const levantamentoArquivoRow = z.object({
  id: uuid,
  organization_id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid,
  ponto_id: uuid.nullable(),
  nome: z.string(),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  tamanho: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  caminho: z.string(),
  estado: z.enum(["pendente", "enviado", "vinculado", "cancelado"]),
  created_by: uuid,
  created_at: z.string(),
  confirmado_em: z.string().nullable(),
});

const timestamps = {
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  created_by: uuid.optional(),
};
export const levantamentoRow = z.object({
  id: uuid,
  organization_id: uuid,
  codigo: z.string(),
  cliente_id: uuid,
  unidade_id: uuid,
  finalidade: z.string(),
  responsavel_id: uuid,
  proposta_id: uuid.nullable().optional(),
  projeto_id: uuid.nullable().optional(),
  revisao_atual_id: uuid.nullable(),
  aprovada_id: uuid.nullable(),
  version,
  cliente_nome: z.string().nullable().optional(),
  unidade_nome: z.string().nullable().optional(),
  responsavel_nome: z.string().nullable().optional(),
  ...timestamps,
});
export const levantamentoListaRow = levantamentoRow.extend({
  estado: estadoLevantamentoSchema,
  numero_revisao: z.number().int().positive(),
  inicio_previsto: z.string().nullable(),
  fim_previsto: z.string().nullable(),
});
export const levantamentoRevisaoRow = z.object({
  id: uuid,
  organization_id: uuid,
  levantamento_id: uuid,
  numero: z.number().int().positive(),
  modelo_versao_id: uuid.nullable().optional(),
  estado: estadoLevantamentoSchema,
  inicio_previsto: z.string().nullable(),
  fim_previsto: z.string().nullable(),
  snapshot: z.record(jsonSchema).nullable().optional(),
  snapshot_sha256: z.string().nullable().optional(),
  aprovado_por: uuid.nullable().optional(),
  aprovado_em: z.string().nullable().optional(),
  version,
  ...timestamps,
});
export const levantamentoPontoRow = z.object({
  id: uuid,
  organization_id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid,
  codigo: z.string(),
  nome: z.string(),
  area: z.string(),
  localizacao: z.string(),
  tipo_sistema: z.string(),
  observacoes: z.string(),
  exige_foto: z.boolean(),
  version,
});
export const levantamentoMedicaoRow = z.object({
  id: uuid,
  organization_id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid,
  ponto_id: uuid,
  chave: z.string(),
  grandeza: grandezaSchema,
  valor: z.string().nullable(),
  unidade: z.string(),
  precisao: z.string().nullable(),
  metodo: z.string(),
  origem: origemMedicaoSchema,
  natureza: naturezaMedicaoSchema,
  coletado_em: z.string().nullable(),
  observacoes: z.string(),
  version,
});
export const pendenciaSchema = z.object({
  ponto_id: uuid.nullable().optional(),
  medicao_id: uuid.nullable().optional(),
  descricao: texto(2000).min(3, "Descreva a pendência."),
});
export const levantamentoAvaliacaoRow = z.object({
  id: z.number().int(),
  levantamento_id: uuid,
  revisao_id: uuid,
  decisao: z.string(),
  comentario: z.string().nullable(),
  pendencias: pendenciaSchema.array(),
  autor: uuid,
  created_at: z.string(),
});
export const levantamentoAdocaoRow = z.object({
  id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid,
  medicao_id: uuid,
  sistema_id: uuid,
  revisao_destino_id: uuid,
  campo: z.enum(["metragem", "trechos"]),
  valor_anterior: z.string(),
  valor_adotado: z.string(),
  preview_hash: z.string(),
  autor: uuid,
  created_at: z.string(),
});
export const requisitoModeloSchema = z.object({
  chave: texto(80).min(1),
  grandeza: grandezaSchema,
  unidade: texto(20).min(1),
  obrigatoria: z.boolean().optional(),
  exige_foto: z.boolean().optional(),
  minimo: decimalTextoSchema.nullable().optional(),
  maximo: decimalTextoSchema.nullable().optional(),
});
export const levantamentoModeloRow = z.object({
  id: uuid,
  modelo_id: uuid,
  nome: z.string().optional(),
  numero: z.number().int().positive(),
  fonte: z.string(),
  requisitos: requisitoModeloSchema.array(),
});
export const levantamentoPermissoesSchema = z.object({
  editar: z.boolean(),
  coletar: z.boolean(),
  revisar: z.boolean(),
  adotar: z.boolean(),
  gerir: z.boolean(),
});
export const levantamentoDetalheSchema = z.object({
  levantamento: levantamentoRow,
  revisao: levantamentoRevisaoRow,
  revisoes: z.array(
    z.object({
      id: uuid,
      numero: z.number().int().positive(),
      estado: estadoLevantamentoSchema,
      version,
      created_at: z.string(),
    }),
  ),
  pontos: levantamentoPontoRow.array(),
  medicoes: levantamentoMedicaoRow.array(),
  avaliacoes: levantamentoAvaliacaoRow.array(),
  arquivos: levantamentoArquivoRow.array(),
  adocoes: levantamentoAdocaoRow.array(),
  modelo: levantamentoModeloRow.nullable(),
  permissoes: levantamentoPermissoesSchema,
});

export const listarLevantamentosSchema = z.object({
  organization_id: uuid,
  busca: texto(120).default(""),
  estado: estadoLevantamentoSchema.nullable().default(null),
  responsavel_id: uuid.nullable().default(null),
  cliente_id: uuid.nullable().default(null),
  pagina: z.number().int().min(0).max(10000).default(0),
  limite: z.number().int().min(1).max(50).default(25),
});
export const detalheLevantamentoSchema = z.object({
  organization_id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid.nullable().default(null),
});
export const comandoLevantamentoSchema = z
  .object({
    organization_id: uuid,
    chave: uuid,
    comando: z.enum([
      "criar",
      "contexto",
      "programar",
      "iniciar_coleta",
      "salvar_ponto",
      "salvar_medicao",
      "excluir_medicao",
      "excluir_ponto",
      "submeter",
      "devolver",
      "aprovar",
      "cancelar",
      "nova_revisao",
    ]),
    levantamento_id: uuid.optional(),
    revisao_id: uuid.optional(),
    ponto_id: uuid.nullable().optional(),
    medicao_id: uuid.nullable().optional(),
    expected_version: version.nullable().optional(),
    expected_revision_version: version.optional(),
    cliente_id: uuid.optional(),
    unidade_id: uuid.optional(),
    finalidade: texto(2000).min(3).optional(),
    responsavel_id: uuid.optional(),
    proposta_id: uuid.nullable().optional(),
    projeto_id: uuid.nullable().optional(),
    modelo_versao_id: uuid.nullable().optional(),
    inicio_previsto: instante.optional(),
    fim_previsto: instante.optional(),
    codigo: texto(40).min(1).optional(),
    nome: texto(200).min(2).optional(),
    area: texto(200).optional(),
    localizacao: texto(1000).optional(),
    tipo_sistema: texto(120).optional(),
    observacoes: texto(4000).optional(),
    exige_foto: z.boolean().optional(),
    chave_medicao: texto(120).optional(),
    grandeza: grandezaSchema.optional(),
    valor: decimalRascunho.optional(),
    unidade: texto(20).optional(),
    precisao: decimalRascunho.optional(),
    metodo: texto(1000).optional(),
    origem: origemMedicaoSchema.optional(),
    natureza: naturezaMedicaoSchema.optional(),
    coletado_em: instanteRascunho.optional(),
    medicoes: medicaoBulkSchema.array().max(100).optional(),
    excluir_medicoes: z
      .array(z.object({ medicao_id: uuid, expected_version: version }).strict())
      .max(100)
      .optional(),
    motivo: texto(4000).optional(),
    pendencias: pendenciaSchema.array().max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requireField = (field: keyof typeof value) => {
      if (value[field] === undefined || value[field] === null || value[field] === "")
        ctx.addIssue({ code: "custom", path: [field], message: "Preencha este campo." });
    };
    if (value.comando === "criar") {
      for (const field of ["cliente_id", "unidade_id", "finalidade", "responsavel_id"] as const)
        requireField(field);
      return;
    }
    requireField("levantamento_id");
    if (value.comando === "contexto") {
      for (const field of ["expected_version", "finalidade", "responsavel_id"] as const)
        requireField(field);
      return;
    }
    requireField("revisao_id");
    if (value.comando === "salvar_ponto") {
      requireField("codigo");
      requireField("nome");
      if (value.ponto_id) requireField("expected_version");
    } else if (value.comando === "salvar_medicao") {
      requireField("ponto_id");
      requireField("chave_medicao");
      requireField("grandeza");
      if (value.medicao_id) requireField("expected_version");
      const checked = medicaoDadosSchema.safeParse({
        ...Object.fromEntries(
          Object.keys(medicaoCampos).map((key) => [key, Reflect.get(value, key)]),
        ),
        chave: value.chave_medicao,
      });
      if (!checked.success)
        for (const issue of checked.error.issues)
          ctx.addIssue({
            ...issue,
            path: issue.path.map((part) => (part === "chave" ? "chave_medicao" : part)),
          });
    } else {
      requireField("expected_version");
      if (value.comando === "excluir_medicao") requireField("medicao_id");
      if (value.comando === "excluir_ponto") {
        requireField("ponto_id");
        requireField("expected_revision_version");
      }
      if (value.comando === "programar") {
        requireField("inicio_previsto");
        requireField("fim_previsto");
        if (
          value.inicio_previsto &&
          value.fim_previsto &&
          Date.parse(value.fim_previsto) <= Date.parse(value.inicio_previsto)
        )
          ctx.addIssue({
            code: "custom",
            path: ["fim_previsto"],
            message: "O fim deve ser posterior ao início.",
          });
      }
      if (["devolver", "cancelar"].includes(value.comando) && (value.motivo?.length ?? 0) < 5)
        ctx.addIssue({
          code: "custom",
          path: ["motivo"],
          message: "Explique o motivo com ao menos cinco caracteres.",
        });
    }
    const ids = value.medicoes?.flatMap((m) => (m.medicao_id ? [m.medicao_id] : [])) ?? [];
    const excluded = value.excluir_medicoes?.map((m) => m.medicao_id) ?? [];
    if (new Set([...ids, ...excluded]).size !== ids.length + excluded.length)
      ctx.addIssue({
        code: "custom",
        path: ["medicoes"],
        message:
          "Uma medida não pode aparecer duas vezes ou ser editada e excluída na mesma operação.",
      });
    const keys = value.medicoes?.map((m) => m.chave.trim().toLowerCase()) ?? [];
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        path: ["medicoes"],
        message: "Cada medida do ponto precisa de chave distinta.",
      });
  });

export const previaAdocaoSchema = z.object({
  organization_id: uuid,
  revisao_id: uuid,
  medicao_id: uuid,
  sistema_id: uuid,
  campo: z.enum(["metragem", "trechos"]),
});
export const adotarMedidaSchema = previaAdocaoSchema.extend({
  chave: uuid,
  preview_hash: texto(128).min(1, "Recalcule a comparação antes de adotar."),
});
export const adocaoPreviewRow = z.object({
  preview_hash: z.string(),
  levantamento_id: uuid,
  revisao_fonte_id: uuid,
  medicao_id: uuid,
  sistema_id: uuid,
  revisao_destino_id: uuid,
  proposta_destino_id: uuid,
  campo: z.enum(["metragem", "trechos"]),
  atual: z.string(),
  proposto: z.string(),
  unidade: z.string(),
  origem: z.record(jsonSchema),
  afetados: z.array(z.object({ id: uuid, regra_chave: z.string().nullable(), codigo: z.string() })),
  versao_destino: z.number().int().positive(),
});

export const buscarOpcoesLevantamentoSchema = z.object({
  organization_id: uuid,
  tipo: z.enum(["clientes", "unidades", "pessoas", "propostas", "projetos", "modelos"]),
  busca: texto(120).default(""),
  cliente_id: uuid.nullable().optional(),
  pagina: z.number().int().min(0).max(10000).default(0),
});
export const buscarSistemasAdocaoSchema = z.object({
  organization_id: uuid,
  levantamento_id: uuid,
  revisao_id: uuid,
  busca: texto(120).default(""),
  pagina: z.number().int().min(0).max(10000).default(0),
});
export const publicarModeloLevantamentoSchema = z
  .object({
    organization_id: uuid,
    chave: uuid,
    modelo_id: uuid.nullable().default(null),
    nome: texto(160).min(3, "Informe o nome do modelo."),
    descricao: texto(2000).default(""),
    fonte: texto(2000).min(3, "Identifique a fonte da política técnica."),
    requisitos: requisitoModeloSchema.array().max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = value.requisitos.map((r) => r.chave);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        path: ["requisitos"],
        message: "As chaves dos requisitos precisam ser únicas.",
      });
    for (const [index, req] of value.requisitos.entries())
      if (!(unidadesPorGrandeza[req.grandeza] as readonly string[]).includes(req.unidade))
        ctx.addIssue({
          code: "custom",
          path: ["requisitos", index, "unidade"],
          message: "Unidade incompatível com a grandeza.",
        });
    for (const [index, req] of value.requisitos.entries()) {
      if (req.minimo != null && req.maximo != null) {
        const scaled = (value: string) => {
          const [integer = "0", fraction = ""] = value.split(".");
          return BigInt(integer + fraction.padEnd(6, "0"));
        };
        if (scaled(req.minimo) > scaled(req.maximo))
          ctx.addIssue({
            code: "custom",
            path: ["requisitos", index, "maximo"],
            message: "O máximo não pode ser inferior ao mínimo configurado.",
          });
      }
    }
  });
