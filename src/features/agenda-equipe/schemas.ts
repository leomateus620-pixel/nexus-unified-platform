import { z } from "zod";
import { acaoRow } from "@/features/operacao/schemas";
import { civilDate, daysInWindow } from "./calendar-domain";
export const agendaErrorMap: z.ZodErrorMap = (issue, context) => {
  if (issue.code === "too_small")
    return {
      message:
        issue.type === "string"
          ? `Informe ao menos ${issue.minimum} caracteres.`
          : issue.type === "array"
            ? `Selecione ao menos ${issue.minimum} opções.`
            : `Informe um valor a partir de ${issue.minimum}.`,
    };
  if (issue.code === "too_big")
    return {
      message:
        issue.type === "string"
          ? `Use até ${issue.maximum} caracteres.`
          : issue.type === "array"
            ? `Selecione no máximo ${issue.maximum} opções.`
            : `Informe um valor de até ${issue.maximum}.`,
    };
  if (issue.code === "invalid_string")
    return {
      message:
        issue.validation === "uuid"
          ? "Selecione um cadastro válido."
          : "Confira o formato informado.",
    };
  if (issue.code === "invalid_type")
    return {
      message:
        issue.expected === "number"
          ? "Informe um número válido."
          : "Preencha este campo com o formato indicado.",
    };
  if (issue.code === "invalid_enum_value" || issue.code === "invalid_literal")
    return { message: "Escolha uma opção válida." };
  if (issue.code === "invalid_union")
    return { message: "Confira o formato dos campos informados." };
  if (issue.code === "unrecognized_keys")
    return { message: "O conteúdo contém campos que não são permitidos nesta operação." };
  return { message: context.defaultError };
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
const uuid = z
    .string({
      required_error: "Selecione um cadastro.",
      invalid_type_error: "Selecione um cadastro válido.",
    })
    .uuid("Selecione um cadastro válido."),
  version = z
    .number()
    .int("A versão precisa ser um número inteiro.")
    .positive("Selecione uma versão válida.");
export const date = z.string().refine((s) => {
  try {
    civilDate(s);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data civil válida.");
export const instant = z.string().datetime({ offset: true });
export const timezone = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }, "Informe um fuso IANA válido, como America/Sao_Paulo.");
const localInstant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, "Informe data e horário locais.")
  .refine((s) => {
    try {
      civilDate(s.slice(0, 10));
      const [h, m, sec = "0"] = s.slice(11).split(":");
      return Number(h) < 24 && Number(m) < 60 && Number(sec) < 60;
    } catch {
      return false;
    }
  });
export const tiposEvento = z.enum([
  "sem_categoria",
  "visita_tecnica",
  "levantamento",
  "execucao",
  "inspecao",
  "manutencao",
  "reuniao",
  "treinamento",
  "acao_interna",
  "deslocamento",
]);
export const estadosEvento = z.enum([
  "rascunho",
  "publicado",
  "em_andamento",
  "concluido",
  "cancelado",
]);
export const confirmacao = z.enum(["pendente", "confirmada", "recusada"]);
const funcao = z.enum(["responsavel", "participante", "observador"]);
export const permissoesAgenda = z.object({
  criar: z.boolean(),
  criar_acao: z.boolean(),
  gerir_series: z.boolean(),
});
export const permissoesEvento = z.object({
  editar: z.boolean(),
  publicar: z.boolean(),
  iniciar: z.boolean(),
  concluir: z.boolean(),
  cancelar: z.boolean(),
  confirmar: z.boolean(),
  comentar: z.boolean(),
  editar_serie: z.boolean(),
  abrir_origem: z.boolean(),
});
export const eventoInput = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(3, "Informe ao menos três caracteres para o título.")
      .max(200, "O título pode ter até 200 caracteres."),
    descricao: z.string().trim().max(4000),
    tipo: tiposEvento,
    inicio: instant.optional(),
    fim: instant.optional(),
    inicio_local: localInstant.optional(),
    fim_local: localInstant.optional(),
    timezone,
    dia_inteiro: z.boolean(),
    data_inicio: date.nullable().optional(),
    data_fim: date.nullable().optional(),
    local: z.string().trim().max(1000),
    responsavel_id: uuid,
    acao_id: uuid.nullable().optional(),
    levantamento_id: uuid.nullable().optional(),
    origem_ocorrencia: z.string().trim().max(120).nullable().optional(),
    bloqueia_recursos: z.boolean(),
    participantes: z.array(z.object({ pessoa_id: uuid, funcao }).strict()).max(100),
    competencias: z.array(uuid).max(50),
    equipes: z.array(uuid).max(20).optional(),
    ferramentas: z
      .array(z.object({ ferramenta_id: uuid, pessoa_id: uuid }).strict())
      .max(30)
      .optional(),
    cliente_id: uuid.nullable().optional(),
    unidade_id: uuid.nullable().optional(),
    projeto_id: uuid.nullable().optional(),
    visibilidade: z.enum(["participantes", "organizacao"]).default("participantes"),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: string, msg: string) =>
      ctx.addIssue({ code: "custom", path: [path], message: msg });
    if (v.acao_id && v.levantamento_id)
      issue("levantamento_id", "Escolha somente uma origem operacional.");
    if (!v.bloqueia_recursos && v.tipo !== "reuniao")
      issue("bloqueia_recursos", "Somente reuniões podem não reservar as pessoas participantes.");
    if (new Set(v.participantes.map((p) => p.pessoa_id)).size !== v.participantes.length)
      issue("participantes", "Uma pessoa não pode aparecer duas vezes.");
    if (
      v.participantes.filter((p) => p.funcao === "responsavel").length !== 1 ||
      !v.participantes.some((p) => p.pessoa_id === v.responsavel_id && p.funcao === "responsavel")
    )
      issue(
        "responsavel_id",
        "Inclua o responsável principal entre os participantes, com a função de responsável.",
      );
    if (v.dia_inteiro) {
      if (!v.data_inicio || !v.data_fim || v.data_fim <= v.data_inicio)
        issue("data_fim", "O fim exclusivo deve ser posterior à primeira data.");
      if (v.inicio || v.fim || v.inicio_local || v.fim_local)
        issue("inicio_local", "Um evento de dia inteiro usa somente datas civis.");
    } else {
      const iso = !!v.inicio || !!v.fim,
        local = !!v.inicio_local || !!v.fim_local;
      if (iso === local)
        issue("inicio_local", "Informe um único período, local ou com fuso explícito.");
      if (iso && (!v.inicio || !v.fim || Date.parse(v.fim) <= Date.parse(v.inicio)))
        issue("fim", "O fim deve ser posterior ao início.");
      if (local && (!v.inicio_local || !v.fim_local || v.fim_local <= v.inicio_local))
        issue("fim_local", "O fim deve ser posterior ao início local.");
      if (v.data_inicio || v.data_fim)
        issue("data_inicio", "Eventos com horário não usam datas de dia inteiro.");
    }
    if (new Set(v.competencias).size !== v.competencias.length)
      issue("competencias", "A competência foi selecionada mais de uma vez.");
    if (new Set(v.ferramentas?.map((f) => f.ferramenta_id)).size !== (v.ferramentas?.length ?? 0))
      issue("ferramentas", "Uma ferramenta não pode ser reservada duas vezes na mesma visita.");
  });
export const regraSerie = z
  .object({
    frequencia: z.enum(["diaria", "semanal", "mensal"]),
    intervalo: z.number().int().min(1).max(12),
    dias_semana: z.array(z.number().int().min(1).max(7)).max(7),
    dia_mes: z.number().int().min(1).max(31).nullable(),
    termina_em: date.nullable(),
    quantidade: z.number().int().min(1).max(200).nullable(),
    politica_mes: z.literal("pular"),
    hora_ambigua: z.literal("posterior"),
    hora_inexistente: z.literal("pular"),
  })
  .strict()
  .superRefine((v, c) => {
    if (!!v.termina_em === !!v.quantidade)
      c.addIssue({
        code: "custom",
        path: ["termina_em"],
        message: "Escolha término por data ou por quantidade.",
      });
    if (v.frequencia === "semanal" && !v.dias_semana.length)
      c.addIssue({
        code: "custom",
        path: ["dias_semana"],
        message: "Selecione ao menos um dia da semana.",
      });
    if (v.frequencia === "mensal" && !v.dia_mes)
      c.addIssue({
        code: "custom",
        path: ["dia_mes"],
        message: "Informe o dia do mês.",
      });
    if (new Set(v.dias_semana).size !== v.dias_semana.length)
      c.addIssue({
        code: "custom",
        path: ["dias_semana"],
        message: "Há dias da semana repetidos.",
      });
  });
export const eventoRow = z.object({
  id: uuid,
  organization_id: uuid,
  titulo: z.string(),
  descricao: z.string(),
  tipo: tiposEvento,
  inicio: instant,
  fim: instant,
  timezone: z.string(),
  dia_inteiro: z.boolean(),
  data_inicio: date.nullable(),
  data_fim: date.nullable(),
  local: z.string(),
  responsavel_id: uuid,
  acao_id: uuid.nullable(),
  levantamento_id: uuid.nullable(),
  origem_ocorrencia: z.string().nullable(),
  bloqueia_recursos: z.boolean(),
  estado: estadosEvento,
  motivo: z.string().nullable(),
  version,
  created_by: uuid,
  created_at: instant,
  updated_at: instant,
  cliente_id: uuid.nullable(),
  unidade_id: uuid.nullable(),
  projeto_id: uuid.nullable(),
  visibilidade: z.enum(["participantes", "organizacao"]),
  serie_id: uuid.nullable(),
  serie_versao_id: uuid.nullable(),
  ocorrencia_data: date.nullable(),
  excecao: z.boolean(),
  gerado_automaticamente: z.boolean(),
  responsavel_nome: z.string(),
  cliente_nome: z.string().nullable(),
  unidade_nome: z.string().nullable(),
  projeto_nome: z.string().nullable().optional(),
  pessoas: z
    .array(z.object({ pessoa_id: uuid, nome: z.string(), funcao, confirmacao }))
    .default([]),
  minha_confirmacao: confirmacao.nullable(),
  dias_visiveis: date.array(),
  origem: z.object({
    tipo: z.enum(["independente", "acao", "levantamento"]),
    id: uuid.nullable(),
    titulo: z.string().nullable(),
    estado: z.string().nullable(),
  }),
  permissoes: permissoesEvento,
});
export const participanteRow = z.object({
  id: uuid,
  organization_id: uuid,
  evento_id: uuid,
  pessoa_id: uuid,
  funcao,
  confirmacao,
  ciencia_em: instant.nullable(),
  vigente: z.boolean(),
  retirado_em: instant.nullable(),
  version,
  created_by: uuid,
  created_at: instant,
  pessoa_nome: z.string(),
  equipe_origem_id: uuid.nullable(),
  equipe_inicio: date.nullable(),
  pode_confirmar: z.boolean(),
});
export const competenciaRow = z.object({
  competencia_id: uuid,
  nome: z.string(),
  exige_evidencia: z.boolean(),
  exige_validade: z.boolean(),
});
export const ferramentaRow = z.object({
  id: uuid,
  ferramenta_id: uuid,
  patrimonio: z.string(),
  descricao: z.string(),
  pessoa_id: uuid,
  pessoa_nome: z.string(),
  custodia_id: uuid.nullable(),
  estado: z.enum(["planejada", "reservada", "retirada", "devolvida", "cancelada"]),
  version,
});
export const serieRow = z.object({
  id: uuid,
  organization_id: uuid,
  version,
  estado: z.enum(["ativa", "cancelada"]),
  versao_id: uuid,
  numero: version,
  regra: regraSerie,
  timezone: z.string(),
  inicio_aplicacao: date,
  materializado_ate: date.nullable(),
  pendencias: z.number().int().nonnegative(),
  permissoes: z.object({
    editar: z.boolean(),
    cancelar: z.boolean(),
    reprocessar: z.boolean(),
  }),
});
export const revisaoRow = z.object({
  versao: version,
  snapshot: json,
  autor: uuid,
  created_at: instant,
});
export const comentarioRow = z.object({
  id: uuid,
  organization_id: uuid,
  evento_id: uuid,
  texto: z.string(),
  created_by: uuid,
  created_at: instant,
  autor_nome: z.string(),
});
const pageFields = {
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().min(1).max(100),
};
export const revisoesPage = z.object({
    ...pageFields,
    registros: revisaoRow.array().max(100),
  }),
  comentariosPage = z.object({
    ...pageFields,
    registros: comentarioRow.array().max(100),
  });
export const detalheAgenda = z.object({
  evento: eventoRow,
  participantes: participanteRow.array().max(200),
  competencias: competenciaRow.array().max(50),
  ferramentas: ferramentaRow.array().max(30),
  historico: revisoesPage,
  comentarios: comentariosPage,
  serie: serieRow.nullable(),
  bloqueios: z.array(z.object({ codigo: z.string(), mensagem: z.string() })),
  permissoes: permissoesEvento,
  server_now: instant,
});
export const listaAgenda = z.object({
  ...pageFields,
  registros: eventoRow.array().max(100),
  inicio: date,
  fim: date,
  timezone: z.string(),
  dias: z.array(z.object({ data: date, total: z.number().int().nonnegative() })).max(93),
  permissoes: permissoesAgenda,
  minha_pessoa_id: uuid.nullable(),
});
export const preferencias = z
  .object({
    antecedencia_minutos: z.number().int().min(0).max(10080),
    notificar_atrasos: z.boolean(),
    notificar: z.boolean(),
  })
  .strict();
export const configuracaoAgenda = z.object({
  minha_pessoa_id: uuid.nullable(),
  minha_pessoa_nome: z.string().nullable().optional(),
  permissoes: permissoesAgenda,
  preferencias,
  jobs: z
    .object({
      scheduler: z
        .object({
          estado: z.enum(["ativo", "indisponivel"]),
          extensao: z.string(),
          verificado_em: instant,
          detalhe: z.string(),
        })
        .nullable(),
      ultima_execucao: z
        .object({
          iniciado_em: instant,
          finalizado_em: instant.nullable(),
          estado: z.enum(["em_execucao", "sucesso", "falha"]),
        })
        .nullable(),
      fila_organizacao: z.object({
        pendentes: z.number().int().nonnegative(),
        falhas: z.number().int().nonnegative(),
        concluidos: z.number().int().nonnegative(),
      }),
    })
    .nullable(),
  timezone: z.string(),
  server_now: instant,
});
export const opcaoRow = z.object({
  id: uuid,
  nome: z.string(),
  contexto: z.string(),
  cliente_id: uuid.optional(),
  cliente_nome: z.string().optional(),
  endereco: z.string().optional(),
  unidade_id: uuid.optional(),
  pessoa_id: uuid.optional(),
});
export const opcoesPage = z.object({
  ...pageFields,
  registros: opcaoRow.array().max(100),
});
export const pendenteRow = z.object({
  id: uuid,
  tipo: z.enum(["acao", "levantamento"]),
  titulo: z.string(),
  estado: z.string(),
  responsavel_id: uuid,
  responsavel_nome: z.string(),
  prazo: date.nullable(),
  cliente_id: uuid.nullable(),
  unidade_id: uuid.nullable(),
  projeto_id: uuid.nullable().optional(),
  local: z.string().optional(),
  cliente_nome: z.string().nullable().optional(),
  projeto_nome: z.string().nullable().optional(),
  pessoas: z.array(z.object({ pessoa_id: uuid, nome: z.string() })).optional(),
});
export const pendentesPage = z.object({
  ...pageFields,
  registros: pendenteRow.array().max(100),
});
export const notificacaoRow = z.object({
  id: uuid,
  tipo: z.string(),
  lida_em: instant.nullable(),
  created_at: instant,
  evento: eventoRow,
});
export const notificacoesPage = z.object({
  ...pageFields,
  registros: notificacaoRow.array().max(100),
  nao_lidas: z.number().int().nonnegative(),
});
const orgFields = { organization_id: uuid };
export const configuracaoInput = z.object(orgFields).strict();
export const agendaSearchSchema = z.object({
  fuso: timezone.or(z.literal("")).catch(""),
  pendentesEquipe: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().catch(false),
  ),
  data: date.or(z.literal("")).catch(""),
  vista: z.enum(["semana", "mes", "lista"]).catch("lista"),
  foco: z.enum(["minha", "equipe", "pendentes", "notificacoes"]).catch("minha"),
  busca: z.string().max(120).catch(""),
  estado: estadosEvento.or(z.literal("")).catch(""),
  tipo: tiposEvento.or(z.literal("")).catch(""),
  equipe: uuid.or(z.literal("")).catch(""),
  pessoa: uuid.or(z.literal("")).catch(""),
  cliente: uuid.or(z.literal("")).catch(""),
  projeto: uuid.or(z.literal("")).catch(""),
  natureza: z.enum(["evento", "acao", ""]).catch(""),
  hora: z.coerce.number().int().min(-1).max(23).catch(-1),
  painel: z.enum(["agenda", "dashboard"]).catch("agenda"),
  demanda: z.preprocess((v) => v === true || v === "true", z.boolean()).catch(false),
  inicio: date.or(z.literal("")).catch(""),
  fim: date.or(z.literal("")).catch(""),
  pagina: z.coerce.number().int().nonnegative().catch(0),
  evento: uuid.or(z.literal("")).catch(""),
  acao: uuid.or(z.literal("")).catch(""),
  dia: date.or(z.literal("")).catch(""),
});
export const obterInput = z.object({ ...orgFields, id: uuid }).strict();
export const listarInput = z
  .object({
    ...orgFields,
    inicio: date,
    fim: date,
    timezone,
    minha: z.boolean().default(false),
    demanda: z.boolean().default(false),
    busca: z.string().trim().max(120).default(""),
    estado: estadosEvento.nullable().default(null),
    tipo: tiposEvento.nullable().default(null),
    equipe_id: uuid.nullable().default(null),
    pessoa_id: uuid.nullable().default(null),
    cliente_id: uuid.nullable().default(null),
    projeto_id: uuid.nullable().default(null),
    natureza: z.enum(["evento", "acao"]).nullable().default(null),
    hora: z.number().int().min(0).max(23).nullable().default(null),
    pagina: z.number().int().nonnegative().default(0),
    limite: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine((v, c) => {
    try {
      daysInWindow(v.inicio, v.fim);
    } catch {
      c.addIssue({
        code: "custom",
        path: ["fim"],
        message: "Consulte um período posterior ao início, de até 93 dias.",
      });
    }
  });
export const opcoesInput = z
  .object({
    ...orgFields,
    tipo: z.enum([
      "pessoas",
      "equipes",
      "acoes",
      "levantamentos",
      "ferramentas",
      "clientes",
      "unidades",
      "projetos",
      "competencias",
    ]),
    busca: z.string().trim().max(120).default(""),
    cliente_id: uuid.nullable().default(null),
    pagina: z.number().int().nonnegative().default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const pendentesInput = z
  .object({
    ...orgFields,
    minhas: z.boolean().default(true),
    demanda: z.boolean().default(false),
    estado: estadosEvento.nullable().default(null),
    tipo: tiposEvento.nullable().default(null),
    equipe_id: uuid.nullable().default(null),
    pessoa_id: uuid.nullable().default(null),
    cliente_id: uuid.nullable().default(null),
    projeto_id: uuid.nullable().default(null),
    natureza: z.enum(["evento", "acao"]).nullable().default(null),
    hora: z.number().int().min(0).max(23).nullable().default(null),
    busca: z.string().trim().max(120).default(""),
    pagina: z.number().int().nonnegative().default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const notificacoesInput = z
  .object({
    ...orgFields,
    pagina: z.number().int().nonnegative().default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const historicoInput = z
  .object({
    ...orgFields,
    id: uuid,
    tipo: z.enum(["revisoes", "comentarios"]),
    pagina: z.number().int().nonnegative().default(0),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
const motive = z.string().trim().min(5).max(2000),
  eventVersion = { evento_id: uuid, expected_version: version },
  seriesVersion = { serie_id: uuid, expected_version: version };
const actionInput = z
  .object({
    titulo: z.string().trim().min(3).max(200),
    descricao: z.string().trim().max(4000),
    responsavel_id: uuid,
    prazo: date.nullable().optional(),
    prioridade: z.enum(["baixa", "normal", "alta", "critica"]),
    exige_verificacao: z.boolean(),
    participantes: z
      .array(z.object({ pessoa_id: uuid, funcao }))
      .max(100)
      .optional(),
    cliente_id: uuid.nullable().optional(),
    projeto_id: uuid.nullable().optional(),
    unidade_id: uuid.nullable().optional(),
    local: z.string().trim().max(1000).optional(),
  })
  .strict();
export const comandoBody = z.discriminatedUnion("comando", [
  z.object({ comando: z.literal("agendar"), dados: z.object({ evento: eventoInput }).strict() }),
  z.object({
    comando: z.literal("salvar_evento"),
    dados: z
      .object({
        evento_id: uuid.optional(),
        expected_version: version.optional(),
        evento: eventoInput,
      })
      .strict()
      .superRefine((v, c) => {
        if (!!v.evento_id !== !!v.expected_version)
          c.addIssue({
            code: "custom",
            path: ["expected_version"],
            message:
              "Uma edição exige a versão de origem; um evento novo não possui versão anterior.",
          });
      }),
  }),
  ...(["publicar", "iniciar", "concluir"] as const).map((c) =>
    z.object({
      comando: z.literal(c),
      dados: z
        .object({
          ...eventVersion,
          motivo: z.string().trim().max(2000).optional(),
        })
        .strict(),
    }),
  ),
  z.object({
    comando: z.literal("cancelar"),
    dados: z.object({ ...eventVersion, motivo: motive }).strict(),
  }),
  z.object({
    comando: z.literal("confirmar"),
    dados: z
      .object({
        participante_id: uuid,
        expected_version: version,
        confirmacao: z.enum(["confirmada", "recusada"]),
      })
      .strict(),
  }),
  z.object({
    comando: z.literal("comentar"),
    dados: z.object({ evento_id: uuid, texto: z.string().trim().min(3).max(4000) }).strict(),
  }),
  z.object({
    comando: z.literal("criar_acao"),
    dados: z.object({ acao: actionInput, evento: eventoInput.nullable().optional() }).strict(),
  }),
  z.object({
    comando: z.literal("transicionar_acao"),
    dados: z
      .object({
        acao_id: uuid,
        expected_version: version,
        estado: z.enum(["em_execucao", "aguardando_verificacao", "concluida", "cancelada"]),
        motivo: z.string().trim().max(10000).optional(),
      })
      .strict(),
  }),
  z.object({
    comando: z.literal("criar_serie"),
    dados: z.object({ ...eventVersion, regra: regraSerie }).strict(),
  }),
  z.object({
    comando: z.literal("editar_serie"),
    dados: z
      .object({
        ...seriesVersion,
        escopo: z.enum(["esta_e_futuras", "todas_futuras"]),
        evento_id: uuid.optional(),
        evento: eventoInput,
        regra: regraSerie,
        motivo: motive,
      })
      .strict(),
  }),
  z.object({
    comando: z.literal("cancelar_serie"),
    dados: z
      .object({
        ...seriesVersion,
        escopo: z.enum(["esta_e_futuras", "todas_futuras"]),
        evento_id: uuid.optional(),
        motivo: motive,
      })
      .strict(),
  }),
  z.object({
    comando: z.literal("reprocessar_serie"),
    dados: z.object(seriesVersion).strict(),
  }),
  z.object({ comando: z.literal("preferencias"), dados: preferencias }),
  z.object({
    comando: z.literal("marcar_lida"),
    dados: z.object({ notificacao_id: uuid }).strict(),
  }),
  z.object({
    comando: z.literal("reprocessar_notificacoes"),
    dados: z.object({ evento_id: uuid }).strict(),
  }),
]);
export const comandoInput = z
  .object({
    ...orgFields,
    chave: uuid,
    comando: z.string(),
    dados: z.record(z.string(), json.optional()),
  })
  .strict()
  .transform((v, c) => {
    const p = comandoBody.safeParse(
      { comando: v.comando, dados: v.dados },
      { errorMap: agendaErrorMap },
    );
    if (!p.success) {
      p.error.issues.forEach((i) => c.addIssue(i));
      return z.NEVER;
    }
    return { organization_id: v.organization_id, chave: v.chave, ...p.data };
  });
// O recibo não é usado como cache de autorização: a interface relê a ficha atual.
const receiptFields = {
  id: uuid.nullable(),
  evento_id: uuid.nullable(),
  acao_id: uuid.nullable(),
};
export const reciboAgenda = z.discriminatedUnion("tipo", [
  z.object({
    ...receiptFields,
    tipo: z.literal("evento"),
    detalhe: detalheAgenda.nullable(),
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("acao"),
    detalhe: z.object({ acao: acaoRow, evento: detalheAgenda.nullable() }).nullable(),
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("serie"),
    detalhe: z.object({ serie: serieRow, evento: detalheAgenda.nullable() }).nullable(),
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("comentario"),
    detalhe: z.object({ comentario: comentarioRow, evento: detalheAgenda }).nullable(),
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("preferencias"),
    detalhe: preferencias.nullable(),
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("job"),
    detalhe: configuracaoAgenda.shape.jobs,
  }),
  z.object({
    ...receiptFields,
    tipo: z.literal("leitura"),
    detalhe: z.object({ notificacao_id: uuid, lida_em: instant }).nullable(),
  }),
]);
export const acaoAgenda = z.object({
  responsavel_nome: z.string(),
  cliente_nome: z.string().nullable().optional(),
  projeto_nome: z.string().nullable().optional(),
  unidade_nome: z.string().nullable().optional(),
  pessoas: z.array(z.object({ pessoa_id: uuid, nome: z.string() })).optional(),
  acao: acaoRow.extend({
    cliente_id: uuid.nullable().optional(),
    projeto_id: uuid.nullable().optional(),
    unidade_id: uuid.nullable().optional(),
    local: z.string().optional(),
  }),
  permissoes: z.object({
    iniciar: z.boolean(),
    devolver: z.boolean(),
    enviar_verificacao: z.boolean(),
    concluir: z.boolean(),
    cancelar: z.boolean(),
    agendar: z.boolean(),
  }),
});

export const dashboardInput = z
  .object({
    organization_id: uuid,
    inicio: date,
    fim: date,
    minha: z.boolean().default(false),
    busca: z.string().trim().max(120).default(""),
    estado: estadosEvento.nullable().default(null),
    tipo: tiposEvento.nullable().default(null),
    equipe_id: uuid.nullable().default(null),
    pessoa_id: uuid.nullable().default(null),
    cliente_id: uuid.nullable().default(null),
    projeto_id: uuid.nullable().default(null),
    natureza: z.enum(["evento", "acao"]).nullable().default(null),
    hora: z.number().int().min(0).max(23).nullable().default(null),
  })
  .strict()
  .superRefine((v, c) => {
    try {
      daysInWindow(v.inicio, v.fim);
    } catch {
      c.addIssue({ code: "custom", path: ["fim"], message: "Consulte um período de até 93 dias." });
    }
  });
const dashboardPerson = z.object({
  pessoa_id: uuid,
  nome: z.string(),
  total: z.number().int().nonnegative(),
});
export const dashboardAgenda = z.object({
  inicio: date,
  fim: date,
  timezone: z.literal("America/Sao_Paulo"),
  total: z.number().int().nonnegative(),
  pessoas: dashboardPerson.array(),
  dias: z.object({ data: date, total: z.number().int().nonnegative() }).array(),
  horas: z
    .object({ hora: z.number().int().min(0).max(23), total: z.number().int().nonnegative() })
    .array(),
  categorias: z.object({ tipo: tiposEvento, total: z.number().int().nonnegative() }).array(),
  semanas: z
    .object({
      inicio: date,
      fim: date,
      parcial: z.boolean(),
      pessoas: z
        .object({ pessoa_id: uuid, nome: z.string(), minutos: z.number().nonnegative() })
        .array(),
    })
    .array(),
});
