import { z } from "zod";

const uuid = z.string().uuid("Selecione um registro válido.");
const texto = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const version = z.number().int().positive("Recarregue a versão atual do registro.");

/** Numeric(18,6): sem conversão para float na fronteira de comandos ou DTOs. */
export const quantidadeEstoqueSchema = texto(40)
  .regex(
    /^\d{1,12}(?:[.,]\d{1,6})?$/,
    "Use até 12 inteiros e seis casas decimais, sem milhar ou notação científica.",
  )
  .transform((value) => value.replace(",", "."));
export const quantidadePositivaEstoqueSchema = quantidadeEstoqueSchema.refine(
  (value) => /[1-9]/.test(value),
  "Informe uma quantidade maior que zero.",
);
export const quantidadeMovimentoEstoqueSchema = texto(40)
  .regex(/^-?\d{1,12}(?:[.,]\d{1,6})?$/, "Quantidade fora da precisão do estoque.")
  .transform((value) => value.replace(",", "."));
const fatorEstoqueSchema = texto(120)
  .regex(/^\d+(?:\.\d+)?$/, "Fator de conversão inválido.")
  .refine((value) => /[1-9]/.test(value), "O fator deve ser maior que zero.");

const instante = z
  .string()
  .datetime({ offset: true, message: "Informe data, horário e fuso válidos." });
export const periodoRecursoEstoqueSchema = z
  .object({ inicio: instante, fim: instante })
  .strict()
  .refine((value) => Date.parse(value.fim) > Date.parse(value.inicio), {
    path: ["fim"],
    message: "O fim deve ser posterior ao início.",
  });

export const tipoConsultaEstoqueSchema = z.enum([
  "materiais",
  "ferramentas",
  "movimentos",
  "conferencias",
  "reservas",
  "inventarios",
  "locais",
]);
export const tipoDetalheEstoqueSchema = z.enum([
  ...tipoConsultaEstoqueSchema.options,
  "politicas_calibracao",
]);
export const estadoReservaEstoqueSchema = z.enum(["ativa", "retirada", "concluida", "cancelada"]);
export const condicaoFerramentaSchema = z.enum([
  "disponivel",
  "avariada",
  "quarentena",
  "manutencao",
  "desativada",
]);
export const listarAlmoxarifadoSchema = z
  .object({
    organization_id: uuid,
    tipo: tipoConsultaEstoqueSchema,
    busca: texto(120).default(""),
    estado: texto(40).nullable().default(null),
    local_id: uuid.nullable().default(null),
    pagina: z.number().int().min(0).max(10000).default(0),
    limite: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const obterAlmoxarifadoSchema = z
  .object({ organization_id: uuid, tipo: tipoDetalheEstoqueSchema, id: uuid })
  .strict();
export const tipoOpcaoAlmoxarifadoSchema = z.enum([
  "produtos",
  "pessoas",
  "projetos",
  "ordens_producao",
  "recebimentos",
  "apontamentos",
  "locais",
  "ferramentas",
  "politicas_calibracao",
]);
export const buscarOpcoesAlmoxarifadoSchema = z
  .object({
    organization_id: uuid,
    tipo: tipoOpcaoAlmoxarifadoSchema,
    busca: texto(120).default(""),
    local_id: uuid.nullable().default(null),
    pagina: z.number().int().min(0).max(10000).default(0),
    limite: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const opcaoAlmoxarifadoRow = z.object({
  id: uuid,
  nome: z.string(),
  contexto: z.string(),
  produto_id: uuid.optional(),
  local_id: uuid.optional(),
  pessoa_id: uuid.optional(),
  projeto_id: uuid.optional(),
  op_id: uuid.optional(),
  recebimento_id: uuid.optional(),
  apontamento_id: uuid.optional(),
  quantidade: quantidadeEstoqueSchema.optional(),
  unidade: z.string().optional(),
});
export const permissoesAlmoxarifadoSchema = z.object({
  ler: z.boolean(),
  gerir: z.boolean(),
  conferir: z.boolean(),
  reservar: z.boolean(),
  aprovar_ajuste: z.boolean(),
  publicar_politica_calibracao: z.boolean(),
});
export const paginacaoAlmoxarifadoSchema = z.object({
  total: z.number().int().nonnegative(),
  pagina: z.number().int().nonnegative(),
  limite: z.number().int().min(1).max(50),
});
export const opcoesAlmoxarifadoRespostaSchema = paginacaoAlmoxarifadoSchema.extend({
  registros: opcaoAlmoxarifadoRow.array(),
});

// São projeções do ledger no PostgreSQL, nunca saldos recalculados pelo navegador.
// SUM(numeric(18,6)) pode superar a precisão de cada evento, preservando sua escala.
const saldoAgregadoEstoqueSchema = texto(120)
  .regex(/^\d+(?:[.,]\d{1,6})?$/, "Saldo fora da precisão do estoque.")
  .transform((value) => value.replace(",", "."));
export const saldoEstoqueRow = z.object({
  fisico: saldoAgregadoEstoqueSchema,
  aceito: saldoAgregadoEstoqueSchema,
  quarentena: saldoAgregadoEstoqueSchema,
  rejeitado: saldoAgregadoEstoqueSchema,
  em_poder: saldoAgregadoEstoqueSchema,
  reservado: saldoAgregadoEstoqueSchema,
  disponivel: saldoAgregadoEstoqueSchema,
  consumido: saldoAgregadoEstoqueSchema,
});
export const quantidadesReservaEstoqueRow = z.object({
  quantidade: quantidadePositivaEstoqueSchema,
  reservada: quantidadeEstoqueSchema,
  retirada: quantidadeEstoqueSchema,
  consumida: quantidadeEstoqueSchema,
  devolvida: quantidadeEstoqueSchema,
  em_poder: quantidadeEstoqueSchema,
  pendente_retirada: quantidadeEstoqueSchema,
});

export const produtoEstoqueRow = z.object({
  id: uuid,
  codigo: z.string(),
  descricao: z.string(),
  unidade: z.string(),
  indivisivel: z.boolean(),
});
export const localEstoqueRow = z.object({
  id: uuid,
  organization_id: uuid,
  nome: z.string(),
  descricao: z.string(),
  ativo: z.boolean(),
  version,
  created_at: z.string(),
  updated_at: z.string(),
});
export const politicaProdutoEstoqueRow = z.object({
  exige_lote: z.boolean(),
  exige_serie: z.boolean(),
  estoque_minimo: quantidadeEstoqueSchema,
  version: z.number().int().nonnegative(),
});
export const materialEstoqueRow = z.object({
  id: uuid,
  produto: produtoEstoqueRow,
  politica: politicaProdutoEstoqueRow,
  saldo: saldoEstoqueRow,
});
export const conferenciaEstoqueRow = z.object({
  id: uuid,
  organization_id: uuid,
  recebimento_id: uuid.nullable(),
  apontamento_id: uuid.nullable(),
  inventario_id: uuid.nullable(),
  produto_id: uuid,
  local_id: uuid,
  produto: produtoEstoqueRow,
  local_nome: z.string(),
  quantidade: quantidadePositivaEstoqueSchema,
  unidade_origem: z.string(),
  fator: fatorEstoqueSchema,
  aceita: quantidadeEstoqueSchema,
  quarentena: quantidadeEstoqueSchema,
  rejeitada: quantidadeEstoqueSchema,
  lote: z.string().nullable(),
  serie: z.string().nullable(),
  motivo: z.string().nullable(),
  reconciliacao: z.string().nullable(),
  created_by: uuid,
  created_at: z.string(),
});
export const posicaoEstoqueSchema = z.enum([
  "aceito",
  "quarentena",
  "rejeitado",
  "em_poder",
  "consumido",
]);
export const operacaoMovimentoEstoqueSchema = z.enum([
  "conferencia",
  "qualidade",
  "transferencia",
  "retirada",
  "consumo",
  "devolucao",
  "estorno",
  "inventario",
]);
export const movimentoEstoqueRow = z.object({
  id: uuid,
  organization_id: uuid,
  conferencia_id: uuid,
  produto_id: uuid,
  produto: produtoEstoqueRow,
  local_id: uuid.nullable(),
  local_nome: z.string().nullable(),
  reserva_id: uuid.nullable(),
  pessoa_id: uuid.nullable(),
  posicao: posicaoEstoqueSchema,
  quantidade: quantidadeMovimentoEstoqueSchema,
  operacao: operacaoMovimentoEstoqueSchema,
  motivo: z.string().nullable(),
  created_by: uuid,
  created_at: z.string(),
});
export const reservaEstoqueRow = z.object({
  id: uuid,
  organization_id: uuid,
  produto_id: uuid,
  local_id: uuid,
  projeto_id: uuid.nullable(),
  op_id: uuid.nullable(),
  pessoa_id: uuid,
  produto: produtoEstoqueRow,
  local_nome: z.string(),
  pessoa_nome: z.string(),
  projeto_nome: z.string().nullable(),
  op_numero: z.string().nullable(),
  lote: z.string().nullable(),
  validade: z.string(),
  estado: estadoReservaEstoqueSchema,
  version,
  quantidades: quantidadesReservaEstoqueRow,
  created_by: uuid,
  created_at: z.string(),
  updated_at: z.string(),
});
export const loteMaterialEstoqueRow = z.object({
  conferencia_id: uuid,
  local_id: uuid,
  local_nome: z.string(),
  lote: z.string().nullable(),
  serie: z.string().nullable(),
  saldo: saldoEstoqueRow,
});
export const alocacaoReservaEstoqueRow = z.object({
  conferencia_id: uuid,
  quantidade: quantidadePositivaEstoqueSchema,
  retirada: quantidadeEstoqueSchema,
  consumida: quantidadeEstoqueSchema,
  devolvida: quantidadeEstoqueSchema,
});
export const eventoHistoricoEstoqueRow = z.object({
  id: z.number().int().positive(),
  operacao: z.string(),
  motivo: z.string().nullable(),
  autor: uuid,
  created_at: z.string(),
});
export const permissoesDetalheAlmoxarifadoSchema = permissoesAlmoxarifadoSchema.extend({
  editar: z.boolean(),
  executar: z.boolean(),
});
export const disponibilidadeFerramentaSchema = z.enum([
  "disponivel",
  "reservada",
  "em_poder",
  "impedida",
]);
export const ferramentaEstoqueRow = z.object({
  id: uuid,
  organization_id: uuid,
  patrimonio: z.string(),
  descricao: z.string(),
  produto_id: uuid.nullable(),
  produto: produtoEstoqueRow.nullable(),
  local_id: uuid,
  local_nome: z.string(),
  proprietario: z.enum(["nexus", "terceiro"]),
  proprietario_nome: z.string().nullable(),
  condicao: condicaoFerramentaSchema,
  exige_calibracao: z.boolean(),
  politica_calibracao_id: uuid.nullable(),
  version,
  created_by: uuid,
  created_at: z.string(),
  updated_at: z.string(),
  disponibilidade: disponibilidadeFerramentaSchema,
});
export const custodiaFerramentaRow = z.object({
  id: uuid,
  ferramenta_id: uuid,
  pessoa_id: uuid,
  pessoa_nome: z.string(),
  inicio: z.string(),
  fim: z.string(),
  timezone: texto(80).min(1),
  estado: z.enum(["reservada", "retirada", "devolvida", "cancelada"]),
  retirada_em: z.string().nullable(),
  devolvida_em: z.string().nullable(),
  condicao_devolucao: condicaoFerramentaSchema.nullable(),
  motivo: z.string().nullable(),
  version,
});
export const calibracaoFerramentaRow = z.object({
  id: uuid,
  ferramenta_id: uuid,
  politica_id: uuid,
  emissor: z.string(),
  execucao: z.string(),
  validade: z.string().nullable(),
  referencia: z.string().nullable(),
  estado: z.enum(["enviada", "em_conferencia", "validada", "revogada"]),
  motivo: z.string().nullable(),
  version,
  created_by: uuid,
  created_at: z.string(),
  conferido_por: uuid.nullable(),
  conferido_em: z.string().nullable(),
});
export const politicaCalibracaoRow = z.object({
  id: uuid,
  nome: z.string(),
  numero: z.number().int().positive(),
  metodo: z.string(),
  fonte: z.string(),
  exige_validade: z.boolean(),
  profissional_id: uuid,
  created_at: z.string(),
});
export const inventarioEstoqueRow = z.object({
  id: uuid,
  produto_id: uuid,
  local_id: uuid,
  produto: produtoEstoqueRow,
  local_nome: z.string(),
  lote: z.string().nullable(),
  contada: quantidadeEstoqueSchema,
  baseline: quantidadeEstoqueSchema,
  diferenca: quantidadeMovimentoEstoqueSchema,
  estado: z.enum(["aberto", "aprovado", "cancelado"]),
  motivo: z.string(),
  version,
  created_by: uuid,
  created_at: z.string(),
  aprovado_por: uuid.nullable(),
  aprovado_em: z.string().nullable(),
});

const listaBase = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().min(1).max(50),
  permissoes: permissoesAlmoxarifadoSchema,
});
export const listaAlmoxarifadoSchema = z.discriminatedUnion("tipo", [
  listaBase.extend({ tipo: z.literal("materiais"), rows: materialEstoqueRow.array().max(50) }),
  listaBase.extend({ tipo: z.literal("ferramentas"), rows: ferramentaEstoqueRow.array().max(50) }),
  listaBase.extend({ tipo: z.literal("movimentos"), rows: movimentoEstoqueRow.array().max(50) }),
  listaBase.extend({
    tipo: z.literal("conferencias"),
    rows: conferenciaEstoqueRow.array().max(50),
  }),
  listaBase.extend({ tipo: z.literal("reservas"), rows: reservaEstoqueRow.array().max(50) }),
  listaBase.extend({ tipo: z.literal("inventarios"), rows: inventarioEstoqueRow.array().max(50) }),
  listaBase.extend({ tipo: z.literal("locais"), rows: localEstoqueRow.array().max(50) }),
]);
const detalheBase = z.object({
  id: uuid,
  historico: eventoHistoricoEstoqueRow.array(),
  permissoes: permissoesDetalheAlmoxarifadoSchema,
});
export const detalheAlmoxarifadoSchema = z.discriminatedUnion("tipo", [
  detalheBase.extend({
    tipo: z.literal("materiais"),
    registro: materialEstoqueRow,
    lotes: loteMaterialEstoqueRow.array(),
  }),
  detalheBase.extend({
    tipo: z.literal("ferramentas"),
    registro: ferramentaEstoqueRow,
    custodias: custodiaFerramentaRow.array(),
    calibracoes: calibracaoFerramentaRow.array(),
    politicas: politicaCalibracaoRow.array(),
  }),
  detalheBase.extend({ tipo: z.literal("movimentos"), registro: movimentoEstoqueRow }),
  detalheBase.extend({ tipo: z.literal("conferencias"), registro: conferenciaEstoqueRow }),
  detalheBase.extend({
    tipo: z.literal("reservas"),
    registro: reservaEstoqueRow,
    alocacoes: alocacaoReservaEstoqueRow.array(),
  }),
  detalheBase.extend({ tipo: z.literal("inventarios"), registro: inventarioEstoqueRow }),
  detalheBase.extend({ tipo: z.literal("locais"), registro: localEstoqueRow }),
  detalheBase.extend({ tipo: z.literal("politicas_calibracao"), registro: politicaCalibracaoRow }),
]);
export const resultadoComandoAlmoxarifadoSchema = z
  .object({
    tipo: tipoDetalheEstoqueSchema,
    id: uuid,
    detalhe: detalheAlmoxarifadoSchema,
  })
  .superRefine((value, ctx) => {
    if (
      value.tipo !== value.detalhe.tipo ||
      value.id !== value.detalhe.id ||
      value.id !== value.detalhe.registro.id
    )
      ctx.addIssue({
        code: "custom",
        path: ["detalhe"],
        message: "A resposta não corresponde ao registro confirmado.",
      });
  });

const comandoBase = z.object({ organization_id: uuid, chave: uuid });
const motivoObrigatorio = texto(2000).min(3, "Descreva o motivo da operação.");
const movimentosReserva = {
  reserva_id: uuid,
  expected_version: version,
  quantidade: quantidadePositivaEstoqueSchema,
  motivo: texto(2000).default(""),
};
const comandosMateriais = [
  comandoBase
    .extend({
      comando: z.literal("salvar_local"),
      local_id: uuid.nullable().default(null),
      expected_version: version.nullable().default(null),
      nome: texto(120).min(2, "Informe o nome do local."),
      descricao: texto(1000).default(""),
      ativo: z.boolean().default(true),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("configurar_produto"),
      produto_id: uuid,
      expected_version: version.nullable().default(null),
      exige_lote: z.boolean().default(false),
      exige_serie: z.boolean().default(false),
      estoque_minimo: quantidadeEstoqueSchema.default("0"),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("conferir_evento"),
      recebimento_id: uuid.nullable().default(null),
      apontamento_id: uuid.nullable().default(null),
      produto_id: uuid,
      local_id: uuid,
      quantidade: quantidadePositivaEstoqueSchema,
      aceita: quantidadeEstoqueSchema,
      quarentena: quantidadeEstoqueSchema,
      rejeitada: quantidadeEstoqueSchema,
      lote: texto(120).default(""),
      serie: texto(120).default(""),
      motivo: texto(2000).default(""),
      reconciliacao: texto(4000).default(""),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("reclassificar_quarentena"),
      conferencia_id: uuid,
      local_id: uuid,
      quantidade: quantidadePositivaEstoqueSchema,
      destino: z.enum(["aceito", "rejeitado"]),
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("transferir"),
      produto_id: uuid,
      origem_local_id: uuid,
      destino_local_id: uuid,
      quantidade: quantidadePositivaEstoqueSchema,
      lote: texto(120).default(""),
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("reservar"),
      produto_id: uuid,
      local_id: uuid,
      projeto_id: uuid.nullable().default(null),
      op_id: uuid.nullable().default(null),
      pessoa_id: uuid,
      quantidade: quantidadePositivaEstoqueSchema,
      validade: instante,
      lote: texto(120).default(""),
    })
    .strict(),
  comandoBase.extend({ comando: z.literal("retirar"), ...movimentosReserva }).strict(),
  comandoBase.extend({ comando: z.literal("consumir"), ...movimentosReserva }).strict(),
  comandoBase.extend({ comando: z.literal("devolver"), ...movimentosReserva }).strict(),
  comandoBase
    .extend({
      comando: z.literal("cancelar_reserva"),
      reserva_id: uuid,
      expected_version: version,
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("estornar_evento"),
      tipo: z.enum(["recebimento", "apontamento"]),
      evento_id: uuid,
      quantidade: quantidadePositivaEstoqueSchema,
      motivo: motivoObrigatorio,
    })
    .strict(),
] as const;

const comandosFerramentas = [
  comandoBase
    .extend({
      comando: z.literal("salvar_ferramenta"),
      ferramenta_id: uuid.nullable().default(null),
      expected_version: version.nullable().default(null),
      patrimonio: texto(80).min(1, "Informe o patrimônio."),
      descricao: texto(240).min(3, "Identifique a ferramenta com ao menos três caracteres."),
      produto_id: uuid.nullable().default(null),
      local_id: uuid,
      proprietario: z.enum(["nexus", "terceiro"]),
      proprietario_nome: texto(200).nullable().default(null),
      exige_calibracao: z.boolean().default(false),
      politica_calibracao_id: uuid.nullable().default(null),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("alterar_condicao"),
      ferramenta_id: uuid,
      expected_version: version,
      condicao: condicaoFerramentaSchema,
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("reservar_ferramenta"),
      ferramenta_id: uuid,
      expected_version: version,
      pessoa_id: uuid,
      inicio: instante,
      fim: instante,
      timezone: texto(80).min(1).default("America/Sao_Paulo"),
      agenda_evento_id: uuid.nullable().default(null),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("retirar_ferramenta"),
      custodia_id: uuid,
      expected_version: version,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("devolver_ferramenta"),
      custodia_id: uuid,
      expected_version: version,
      condicao: condicaoFerramentaSchema,
      motivo: texto(2000).default(""),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("cancelar_custodia"),
      custodia_id: uuid,
      expected_version: version,
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("publicar_politica_calibracao"),
      nome: texto(120).min(3),
      metodo: texto(4000).min(3),
      fonte: texto(2000).min(3),
      exige_validade: z.boolean(),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("registrar_calibracao"),
      ferramenta_id: uuid,
      politica_id: uuid,
      emissor: texto(200).min(2, "Informe o emissor da evidência."),
      execucao: z.string().date("Informe uma data válida."),
      validade: z.string().date("Informe uma data válida.").nullable().default(null),
      referencia: texto(1000).nullable().default(null),
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("conferir_calibracao"),
      calibracao_id: uuid,
      expected_version: version,
      estado: z.enum(["em_conferencia", "validada", "revogada"]),
      motivo: texto(2000).default(""),
    })
    .strict(),
] as const;
const comandosInventario = [
  comandoBase
    .extend({
      comando: z.literal("criar_inventario"),
      produto_id: uuid,
      local_id: uuid,
      lote: texto(120).default(""),
      contada: quantidadeEstoqueSchema,
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("aprovar_inventario"),
      inventario_id: uuid,
      expected_version: version,
      motivo: motivoObrigatorio,
    })
    .strict(),
  comandoBase
    .extend({
      comando: z.literal("cancelar_inventario"),
      inventario_id: uuid,
      expected_version: version,
      motivo: motivoObrigatorio,
    })
    .strict(),
] as const;

export const comandoAlmoxarifadoSchema = z
  .discriminatedUnion("comando", [
    ...comandosMateriais,
    ...comandosFerramentas,
    ...comandosInventario,
  ])
  .superRefine((value, ctx) => {
    if (
      value.comando === "salvar_local" &&
      value.local_id !== null &&
      value.expected_version === null
    )
      ctx.addIssue({
        code: "custom",
        path: ["expected_version"],
        message: "Recarregue o local antes de editar.",
      });
    if (
      value.comando === "conferir_evento" &&
      Number(value.recebimento_id !== null) + Number(value.apontamento_id !== null) !== 1
    )
      ctx.addIssue({
        code: "custom",
        path: ["recebimento_id"],
        message: "Selecione um recebimento ou apontamento real como origem.",
      });
    if (
      value.comando === "reservar" &&
      Number(value.projeto_id !== null) + Number(value.op_id !== null) !== 1
    )
      ctx.addIssue({
        code: "custom",
        path: ["projeto_id"],
        message: "Selecione um projeto ou uma ordem de produção como destino.",
      });
    if (value.comando === "transferir" && value.origem_local_id === value.destino_local_id)
      ctx.addIssue({
        code: "custom",
        path: ["destino_local_id"],
        message: "Selecione um local diferente da origem.",
      });
    if (
      value.comando === "salvar_ferramenta" &&
      value.ferramenta_id !== null &&
      value.expected_version === null
    )
      ctx.addIssue({
        code: "custom",
        path: ["expected_version"],
        message: "Recarregue a ferramenta antes de editar.",
      });
    if (
      value.comando === "salvar_ferramenta" &&
      value.proprietario === "terceiro" &&
      (value.proprietario_nome?.trim().length ?? 0) < 2
    )
      ctx.addIssue({
        code: "custom",
        path: ["proprietario_nome"],
        message: "Identifique o proprietário da ferramenta.",
      });
    if (
      value.comando === "salvar_ferramenta" &&
      value.exige_calibracao &&
      value.politica_calibracao_id === null
    )
      ctx.addIssue({
        code: "custom",
        path: ["politica_calibracao_id"],
        message: "Selecione a política de calibração conferida.",
      });
    if (
      value.comando === "devolver_ferramenta" &&
      value.condicao !== "disponivel" &&
      value.motivo.trim().length < 3
    )
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message: "Registre o motivo da condição observada na devolução.",
      });
    if (
      value.comando === "reservar_ferramenta" &&
      Date.parse(value.fim) <= Date.parse(value.inicio)
    )
      ctx.addIssue({
        code: "custom",
        path: ["fim"],
        message: "O fim deve ser posterior ao início.",
      });
    if (
      value.comando === "registrar_calibracao" &&
      value.validade !== null &&
      value.validade < value.execucao
    )
      ctx.addIssue({
        code: "custom",
        path: ["validade"],
        message: "A validade não pode anteceder a execução.",
      });
    if (
      value.comando === "conferir_calibracao" &&
      value.estado === "revogada" &&
      value.motivo.trim().length < 3
    )
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message: "Descreva o motivo da revogação.",
      });
  });
