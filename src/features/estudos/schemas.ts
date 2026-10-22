import { z } from "zod";

const uuid = z.string().uuid("Selecione um registro válido.");
const texto = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const version = z.number().int().positive("Recarregue a versão atual do registro.");
const metadata = {
  created_by: uuid,
  created_at: z.string(),
  updated_at: z.string().optional(),
};

export type EstudoJson =
  string | number | boolean | null | EstudoJson[] | { [key: string]: EstudoJson };
export const estudoJsonSchema: z.ZodType<EstudoJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(estudoJsonSchema),
    z.record(estudoJsonSchema),
  ]),
);
export const tipoEstudoSchema = z.enum([
  "apreciacao_riscos",
  "classificacao",
  "memorial",
  "solucao",
]);
export const estadoEstudoSchema = z.enum([
  "elaboracao",
  "em_revisao",
  "aprovado",
  "substituido",
  "cancelado",
]);
export const prioridadeMedidaSchema = z.enum(["baixa", "normal", "alta", "critica"]);
export const fonteBibliograficaSchema = z
  .object({
    titulo: texto(200).min(3, "Identifique a fonte técnica."),
    edicao: texto(120).min(1, "Identifique a edição ou versão."),
    emissor: texto(200).min(1, "Identifique o emissor da fonte."),
    url: z.preprocess(
      (value) => (value === "" ? null : value),
      texto(2000)
        .url("Informe uma URL válida.")
        .refine(
          (value) =>
            /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^\s]*)?$/i.test(value),
          "Use uma URL http ou https com host, sem usuário ou senha.",
        )
        .nullable()
        .optional(),
    ),
    consultado_em: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().date("Informe uma data válida.").nullable().optional(),
    ),
  })
  .strict();
export const requisitosMetodoSchema = z
  .object({
    exige_levantamento: z.boolean().default(false),
    exige_perigos: z.boolean().default(false),
    exige_medidas: z.boolean().default(false),
    exige_art: z.boolean().default(false),
    revisao_independente: z.boolean().default(false),
  })
  .strict();
export const metodoEstudoVersaoRow = z.object({
  id: uuid,
  organization_id: uuid,
  metodo_id: uuid,
  numero: z.number().int().positive(),
  nome: z.string(),
  tipo: tipoEstudoSchema,
  instrucoes: z.string(),
  fontes: fonteBibliograficaSchema.array().min(1).max(50),
  requisitos: requisitosMetodoSchema,
  responsavel_id: uuid,
  registro_profissional: z.string(),
  ...metadata,
});
export const metodoEstudoRow = z.object({
  id: uuid,
  organization_id: uuid,
  nome: z.string(),
  descricao: z.string(),
  ...metadata,
});
export const publicarMetodoEstudoSchema = z
  .object({
    organization_id: uuid,
    chave: uuid,
    metodo_id: uuid.nullable().default(null),
    nome: texto(160).min(3, "Informe o nome do método."),
    descricao: texto(2000).default(""),
    tipo: tipoEstudoSchema,
    instrucoes: texto(20000).min(3, "Descreva as instruções e os critérios conferidos."),
    fontes: fonteBibliograficaSchema
      .array()
      .min(1, "Informe ao menos uma fonte autorizada.")
      .max(50),
    requisitos: requisitosMetodoSchema.default({}),
  })
  .strict();
export const listarMetodosEstudoSchema = z
  .object({
    organization_id: uuid,
    busca: texto(120).default(""),
    pagina: z.number().int().min(0).max(10000).default(0),
    limite: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const buscarOpcoesEstudoSchema = z
  .object({
    organization_id: uuid,
    tipo: z.enum([
      "clientes",
      "unidades",
      "pessoas",
      "metodos",
      "levantamentos",
      "projetos_engenharia",
      "documentos",
      "projetos",
      "acoes",
    ]),
    busca: texto(120).default(""),
    cliente_id: uuid.nullable().default(null),
    unidade_id: uuid.nullable().default(null),
    pagina: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const opcaoEstudoRow = z.object({
  id: uuid,
  nome: z.string(),
  contexto: z.string(),
  cliente_id: uuid.nullable().optional(),
  unidade_id: uuid.nullable().optional(),
  pai_id: uuid.nullable().optional(),
  numero: z.number().int().nullable().optional(),
  sha256: z.string().nullable().optional(),
});
export const estudoRow = z.object({
  id: uuid,
  organization_id: uuid,
  codigo: z.string(),
  titulo: z.string(),
  tipo: tipoEstudoSchema,
  cliente_id: uuid,
  unidade_id: uuid,
  projeto_id: uuid.nullable(),
  responsavel_id: uuid,
  visibilidade: z.enum(["organizacao", "restrito"]),
  revisao_atual_id: uuid,
  aprovada_id: uuid.nullable(),
  version,
  cliente_nome: z.string().nullable(),
  unidade_nome: z.string().nullable(),
  responsavel_nome: z.string().nullable(),
  ...metadata,
});
export const estudoRevisaoRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  numero: z.number().int().positive(),
  base_id: uuid.nullable(),
  metodo_versao_id: uuid.nullable(),
  estado: estadoEstudoSchema,
  escopo: z.string(),
  premissas: z.string(),
  analise: z.string(),
  conclusao: z.string(),
  responsavel_tecnico_id: uuid,
  responsavel_tecnico_nome: z.string().nullable().optional(),
  revisor_id: uuid.nullable(),
  revisor_nome: z.string().nullable().optional(),
  responsabilidade_tecnica: z.string(),
  art_referencia: z.string(),
  version,
  submissao_atual_id: uuid.nullable(),
  snapshot: z.record(estudoJsonSchema).nullable(),
  snapshot_sha256: z.string().nullable(),
  aprovado_por: uuid.nullable(),
  aprovado_em: z.string().nullable(),
  substituida_por: uuid.nullable().optional(),
  ...metadata,
});
export const estudoPerigoRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  base_id: uuid.nullable(),
  codigo: z.string(),
  descricao: z.string(),
  local: z.string(),
  exposicao: z.string(),
  avaliacao: z.string(),
  critico: z.boolean(),
  version,
  ...metadata,
});
export const estudoMedidaRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  perigo_id: uuid,
  linhagem_id: uuid,
  base_id: uuid.nullable(),
  descricao: z.string(),
  fundamento: z.string(),
  prioridade: prioridadeMedidaSchema,
  responsavel_id: uuid.nullable(),
  responsavel_nome: z.string().nullable().optional(),
  prazo: z.string().nullable(),
  exige_acao: z.boolean(),
  version,
  acao_id: uuid.nullable(),
  ...metadata,
});

export const tipoFonteEstudoSchema = z.enum(["levantamento", "projeto_engenharia", "documento"]);
export const estudoFonteRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  tipo: tipoFonteEstudoSchema,
  levantamento_id: uuid.nullable().optional(),
  levantamento_revisao_id: uuid.nullable().optional(),
  pe_projeto_id: uuid.nullable().optional(),
  pe_versao_id: uuid.nullable().optional(),
  documento_id: uuid.nullable().optional(),
  titulo: z.string(),
  numero: z.number().int().nullable().optional(),
  sha256: z.string().nullable().optional(),
  justificativa: z.string(),
  ativa: z.boolean(),
  desativada_motivo: z.string().nullable().optional(),
  ...metadata,
});
export const estudoSubmissaoRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  numero: z.number().int().positive(),
  snapshot: z.record(estudoJsonSchema),
  sha256: z.string(),
  autor: uuid,
  pessoa_id: uuid,
  registro_profissional: z.string(),
  created_at: z.string(),
});
export const estudoDecisaoRow = z.object({
  id: z.number().int(),
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  submissao_id: uuid.nullable(),
  decisao: z.enum(["devolver", "aprovar", "cancelar"]),
  motivo: z.string(),
  pessoa_id: uuid.nullable(),
  registro_profissional: z.string().nullable(),
  responsabilidade_tecnica: z.string(),
  autor: uuid,
  created_at: z.string(),
});
export const estudoArquivoRow = z.object({
  id: uuid,
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid,
  perigo_id: uuid.nullable(),
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
export const estudoAcaoRow = z.object({
  linhagem_id: uuid,
  acao_id: uuid,
  titulo: z.string(),
  estado: z.enum(["aberta", "em_execucao", "aguardando_verificacao", "concluida", "cancelada"]),
  version,
});
export const estudoEventoRow = z.object({
  id: z.number().int(),
  organization_id: uuid,
  estudo_id: uuid,
  revisao_id: uuid.nullable(),
  comando: z.string(),
  motivo: z.string().nullable(),
  autor: uuid,
  created_at: z.string(),
});
export const estudoPermissoesSchema = z.object({
  criar: z.boolean(),
  ler: z.boolean(),
  gerir: z.boolean(),
  editar: z.boolean(),
  revisar: z.boolean(),
  aprovar: z.boolean(),
  submeter: z.boolean(),
  nova_revisao: z.boolean(),
  vincular_acao: z.boolean(),
  publicar_metodo: z.boolean(),
});
export const estudoRevisaoResumoRow = z.object({
  id: uuid,
  numero: z.number().int().positive(),
  estado: estadoEstudoSchema,
  version,
  snapshot_sha256: z.string().nullable().optional(),
  aprovado_em: z.string().nullable().optional(),
  created_at: z.string(),
  substituida_por: uuid.nullable().optional(),
});
export const estudoDetalheSchema = z.object({
  estudo: estudoRow,
  revisao: estudoRevisaoRow,
  revisoes: estudoRevisaoResumoRow.array(),
  perigos: estudoPerigoRow.array(),
  medidas: estudoMedidaRow.array(),
  fontes: estudoFonteRow.array(),
  submissoes: estudoSubmissaoRow.array(),
  decisoes: estudoDecisaoRow.array(),
  arquivos: estudoArquivoRow.array(),
  acoes: estudoAcaoRow.array(),
  historico: estudoEventoRow.array(),
  metodo: metodoEstudoVersaoRow.nullable(),
  permissoes: estudoPermissoesSchema,
  bloqueios: z.string().array(),
  entrega_documental: z.object({
    estado: z.enum(["nao_aprovado", "aguardando_emissao"]),
    motivo: z.string(),
  }),
});
export const estudoListaRow = estudoRow.extend({
  estado: estadoEstudoSchema,
  numero_revisao: z.number().int().positive(),
});
export const listarEstudosSchema = z
  .object({
    organization_id: uuid,
    busca: texto(120).default(""),
    estado: estadoEstudoSchema.nullable().default(null),
    responsavel_id: uuid.nullable().default(null),
    cliente_id: uuid.nullable().default(null),
    pagina: z.number().int().min(0).max(10000).default(0),
    limite: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const detalheEstudoSchema = z
  .object({
    organization_id: uuid,
    estudo_id: uuid,
    revisao_id: uuid.nullable().default(null),
  })
  .strict();
export const medidaEstudoDadosSchema = z
  .object({
    descricao: texto(4000).default(""),
    fundamento: texto(4000).default(""),
    prioridade: prioridadeMedidaSchema.default("normal"),
    responsavel_id: uuid.nullable().default(null),
    prazo: z.string().date("Informe uma data válida.").nullable().default(null),
    exige_acao: z.boolean().default(true),
  })
  .strict();
export const medidaEstudoBulkSchema = medidaEstudoDadosSchema
  .extend({
    medida_id: uuid.nullable().optional(),
    expected_version: version.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.medida_id && !value.expected_version)
      ctx.addIssue({
        code: "custom",
        path: ["expected_version"],
        message: "Recarregue a versão da medida antes de editar.",
      });
  });
export const comandoEstudoSchema = z
  .object({
    organization_id: uuid,
    chave: uuid,
    comando: z.enum([
      "criar",
      "contexto",
      "salvar_revisao",
      "salvar_perigo",
      "salvar_medida",
      "excluir_medida",
      "excluir_perigo",
      "vincular_fonte",
      "desativar_fonte",
      "submeter",
      "devolver",
      "aprovar",
      "cancelar",
      "nova_revisao",
    ]),
    estudo_id: uuid.optional(),
    revisao_id: uuid.optional(),
    expected_version: version.nullable().optional(),
    expected_revision_version: version.optional(),
    titulo: texto(200).min(3, "Informe ao menos três caracteres para o título.").optional(),
    tipo: tipoEstudoSchema.optional(),
    cliente_id: uuid.optional(),
    unidade_id: uuid.optional(),
    responsavel_id: uuid.nullable().optional(),
    projeto_id: uuid.nullable().optional(),
    visibilidade: z.enum(["organizacao", "restrito"]).optional(),
    metodo_versao_id: uuid.nullable().optional(),
    levantamento_revisao_id: uuid.nullable().optional(),
    pe_versao_id: uuid.nullable().optional(),
    documento_id: uuid.nullable().optional(),
    escopo: texto(20000).optional(),
    premissas: texto(20000).optional(),
    analise: texto(40000).optional(),
    conclusao: texto(20000).optional(),
    responsavel_tecnico_id: uuid.optional(),
    revisor_id: uuid.nullable().optional(),
    responsabilidade_tecnica: texto(4000).optional(),
    art_referencia: texto(500).optional(),
    perigo_id: uuid.nullable().optional(),
    medida_id: uuid.nullable().optional(),
    codigo: texto(40).min(1, "Identifique o perigo.").optional(),
    descricao: texto(4000).optional(),
    local: texto(500).optional(),
    exposicao: texto(4000).optional(),
    avaliacao: texto(4000).optional(),
    critico: z.boolean().optional(),
    fundamento: texto(4000).optional(),
    prioridade: prioridadeMedidaSchema.optional(),
    prazo: z.string().date("Informe uma data válida.").nullable().optional(),
    exige_acao: z.boolean().optional(),
    medidas: medidaEstudoBulkSchema.array().max(100).optional(),
    tipo_fonte: tipoFonteEstudoSchema.optional(),
    fonte_id: uuid.optional(),
    justificativa: texto(2000).optional(),
    motivo: texto(4000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requireField = (key: keyof typeof value) => {
      if (value[key] === undefined || value[key] === null || value[key] === "")
        ctx.addIssue({ code: "custom", path: [key], message: "Preencha este campo." });
    };
    if (value.comando === "criar") {
      for (const key of ["titulo", "tipo", "cliente_id", "unidade_id", "responsavel_id"] as const)
        requireField(key);
      return;
    }
    requireField("estudo_id");
    requireField("revisao_id");
    if (value.comando === "salvar_perigo") {
      requireField("codigo");
      if (value.perigo_id) requireField("expected_version");
      const ids = value.medidas?.flatMap((m) => (m.medida_id ? [m.medida_id] : [])) ?? [];
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: ["medidas"],
          message: "Uma medida não pode ser editada duas vezes na mesma operação.",
        });
      return;
    }
    if (value.comando === "salvar_medida") {
      requireField("perigo_id");
      if (value.medida_id) requireField("expected_version");
      return;
    }
    requireField("expected_version");
    if (value.comando === "contexto")
      for (const key of ["titulo", "responsavel_id", "visibilidade"] as const) requireField(key);
    if (value.comando === "salvar_revisao") requireField("responsavel_tecnico_id");
    if (value.comando === "excluir_medida") requireField("medida_id");
    if (value.comando === "excluir_perigo") {
      requireField("perigo_id");
      requireField("expected_revision_version");
    }
    if (value.comando === "vincular_fonte") {
      requireField("tipo_fonte");
      const fields = {
        levantamento: "levantamento_revisao_id",
        projeto_engenharia: "pe_versao_id",
        documento: "documento_id",
      } as const;
      if (value.tipo_fonte) requireField(fields[value.tipo_fonte]);
      const selected = [
        value.levantamento_revisao_id,
        value.pe_versao_id,
        value.documento_id,
      ].filter(Boolean);
      if (selected.length !== 1)
        ctx.addIssue({
          code: "custom",
          path: ["tipo_fonte"],
          message: "Selecione somente uma fonte operacional.",
        });
      if ((value.justificativa?.length ?? 0) < 3)
        ctx.addIssue({
          code: "custom",
          path: ["justificativa"],
          message: "Explique a aplicação desta fonte no estudo.",
        });
    }
    if (value.comando === "desativar_fonte") requireField("fonte_id");
    if (
      ["desativar_fonte", "devolver", "aprovar", "cancelar", "nova_revisao"].includes(
        value.comando,
      ) &&
      (value.motivo?.length ?? 0) < 3
    )
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message: "Explique o motivo com ao menos três caracteres.",
      });
  });
export const vincularAcaoEstudoSchema = z
  .object({
    organization_id: uuid,
    chave: uuid,
    medida_id: uuid,
    acao_id: uuid.nullable().optional(),
    titulo: texto(200).min(3, "Informe ao menos três caracteres para a instrução.").optional(),
    descricao: texto(4000).default(""),
    responsavel_id: uuid.optional(),
    prazo: z.string().date("Informe uma data válida.").nullable().default(null),
    prioridade: prioridadeMedidaSchema.default("normal"),
    exige_verificacao: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.acao_id) {
      if (!value.titulo)
        ctx.addIssue({
          code: "custom",
          path: ["titulo"],
          message: "Informe a instrução liberada para a ação.",
        });
      if (!value.responsavel_id)
        ctx.addIssue({
          code: "custom",
          path: ["responsavel_id"],
          message: "Selecione o responsável pela ação.",
        });
    }
  });
