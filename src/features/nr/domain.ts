/** Domínio compartilhado NR-33/NR-35. Não emite PET nem conclui segurança operacional. */
export const NR_CALCULO_VERSAO = "nr-geometria-ventilacao-1.0.0";
export type Norma = "NR33" | "NR35";
export type NrJson = null | boolean | number | string | NrJson[] | { [key: string]: NrJson };
export type NrRecurso =
  "locais" | "pastas" | "documentos" | "pendencias" | "modelos" | "levantamentos" | "sistemas";
export type NrRecord = {
  id: string;
  organization_id: string;
  cliente_id: string | null;
  unidade_id: string | null;
  normas: Norma[];
  titulo: string;
  descricao: string;
  estado: string;
  dados: Record<string, NrJson>;
  version: number;
  created_at: string;
  updated_at: string;
  arquivado_em: string | null;
  tag?: string | null;
  tipo?: string;
  familia?: string | null;
  aliases?: string[];
  parent_id?: string | null;
  local_id?: string | null;
  pasta_id?: string | null;
  pet_espaco_id?: string | null;
  modelo_id?: string | null;
  documento_id?: string | null;
  criticidade?: string;
  prazo?: string | null;
  responsavel_id?: string | null;
  tratativa?: string;
  conteudo?: NrJson;
  respostas?: NrJson;
  modelo_snapshot?: NrJson;
  estado_origem?: string | null;
  recebimento?: string;
  origem_url?: string | null;
  revisao_numero?: number;
  revisao_atual_id?: string | null;
  impactos?: NrJson[];
  impactos_pendentes?: number;
  revisao_necessaria?: boolean;
  base_version_atual?: number | null;
  pode_revisar_impactos?: boolean;
  bloqueio_revisao_impactos?: string | null;
  revisoes?: NrJson[];
  revisoes_total?: number;
  historico?: NrJson[];
  historico_total?: number;
  tratativas?: NrJson[];
};
export type NrConsulta = { rows: NrRecord[]; total: number; pagina: number; limite: number };
export type NrContexto = {
  clientes: { id: string; nome: string }[];
  unidades: { id: string; cliente_id: string; nome: string }[];
  permissoes: {
    visualizar: boolean;
    cadastrar: boolean;
    editar: boolean;
    anexar: boolean;
    mover: boolean;
    arquivar: boolean;
    restaurar: boolean;
    revisar: boolean;
    aprovar: boolean;
    emitir: boolean;
    configurar: boolean;
  };
};

/** Os eixos não são equivalentes e nunca são derivados uns dos outros. */
export type AvaliacaoNr = {
  existencia: "nao_verificado" | "presente" | "ausente";
  aplicabilidade: "nao_verificado" | "aplicavel" | "nao_aplicavel";
  condicao: "nao_verificado" | "conforme" | "nao_conforme";
  acao: "nao_definida" | "manter" | "adequar" | "instalar" | "remover";
  validacao: "nao_validado" | "em_revisao" | "validado" | "rejeitado";
};
export function avaliacaoNrInicial(): AvaliacaoNr {
  return {
    existencia: "nao_verificado",
    aplicabilidade: "nao_verificado",
    condicao: "nao_verificado",
    acao: "nao_definida",
    validacao: "nao_validado",
  };
}

export type EstadoParametro = "nao_verificado" | "informado" | "proposto" | "validado";
export type Parametro<U extends string> = {
  valor: number | null;
  unidade: U;
  estado: EstadoParametro;
  fonte: string;
  autor: string;
};
export type Comprimento = Parametro<"m" | "cm" | "mm">;
export type Volume = Parametro<"m3" | "L">;
export type Vazao = Parametro<"m3/h" | "m3/s" | "L/s">;
export type DimensaoRadial = { tipo: "diametro" | "raio"; medida: Comprimento };
export type GeometriaNr =
  | { tipo: "cilindro"; radial: DimensaoRadial; altura: Comprimento }
  | { tipo: "cone"; radial: DimensaoRadial; altura: Comprimento }
  | { tipo: "paralelepipedo"; comprimento: Comprimento; largura: Comprimento; altura: Comprimento };
export type EstadoResultado = "incompleto" | "proposto" | "nao_validado" | "validado";
export type RastreioCalculo = {
  motor_versao: typeof NR_CALCULO_VERSAO;
  /** Parâmetros completos preservam unidade, fonte, estado e autor. */
  parametros: unknown;
  estado: EstadoResultado;
  pendencias: string[];
  premissas: string[];
  precisao: "IEEE-754 binary64; sem arredondamento intermediário";
  autoriza_entrada: false;
};

function conhecido(p: Parametro<string>, campo: string, pendencias: string[], admiteZero = false) {
  if (p.valor === null) {
    pendencias.push(`${campo}: informe o valor e sua fonte.`);
    return null;
  }
  if (!Number.isFinite(p.valor) || (admiteZero ? p.valor < 0 : p.valor <= 0)) {
    pendencias.push(
      `${campo}: valor deve ser finito e ${admiteZero ? "não negativo" : "maior que zero"}.`,
    );
    return null;
  }
  if (!p.fonte.trim() || !p.autor.trim()) pendencias.push(`${campo}: registre a fonte e o autor.`);
  return p.valor;
}
function metros(p: Comprimento, campo: string, pendencias: string[]) {
  const valor = conhecido(p, campo, pendencias);
  if (valor === null) return null;
  const fator = { m: 1, cm: 0.01, mm: 0.001 }[p.unidade];
  if (fator === undefined) {
    pendencias.push(`${campo}: unidade de comprimento não suportada.`);
    return null;
  }
  return valor * fator;
}
function volumeM3(p: Volume, campo: string, pendencias: string[], admiteZero = false) {
  const valor = conhecido(p, campo, pendencias, admiteZero);
  if (valor === null) return null;
  const fator = { m3: 1, L: 0.001 }[p.unidade];
  if (fator === undefined) {
    pendencias.push(`${campo}: unidade de volume não suportada.`);
    return null;
  }
  return valor * fator;
}
function estadoResultado(parametros: Parametro<string>[], completo: boolean): EstadoResultado {
  if (!completo) return "incompleto";
  if (parametros.some((p) => p.estado === "proposto")) return "proposto";
  return parametros.every((p) => p.estado === "validado" && p.fonte.trim() && p.autor.trim())
    ? "validado"
    : "nao_validado";
}
const rastreio = (
  parametros: unknown,
  estado: EstadoResultado,
  pendencias: string[],
): RastreioCalculo => ({
  motor_versao: NR_CALCULO_VERSAO,
  parametros,
  estado,
  pendencias,
  premissas: [
    "Resultado matemático dos parâmetros registrados; não constitui conclusão geral de segurança.",
    "Nenhum valor é transferido automaticamente de outro local ou equipamento.",
  ],
  precisao: "IEEE-754 binary64; sem arredondamento intermediário",
  autoriza_entrada: false,
});

/** Deduções null = desconhecidas. [] = nenhuma dedução declarada, não inferida. */
export function calcularGeometriaNr(geometria: GeometriaNr, deducoes: Volume[] | null) {
  const pendencias: string[] = [];
  const parametros: Parametro<string>[] = [geometria.altura];
  const altura = metros(geometria.altura, "Altura", pendencias);
  let bruto: number | null = null;
  let formula: string;
  if (geometria.tipo === "paralelepipedo") {
    parametros.push(geometria.comprimento, geometria.largura);
    const comprimento = metros(geometria.comprimento, "Comprimento", pendencias);
    const largura = metros(geometria.largura, "Largura", pendencias);
    formula = "V = comprimento × largura × altura; V líquido = V bruto − Σ deduções";
    if (altura !== null && comprimento !== null && largura !== null)
      bruto = altura * comprimento * largura;
  } else {
    parametros.push(geometria.radial.medida);
    const radial = metros(
      geometria.radial.medida,
      geometria.radial.tipo === "raio" ? "Raio" : "Diâmetro",
      pendencias,
    );
    const raio =
      radial === null ? null : geometria.radial.tipo === "diametro" ? radial / 2 : radial;
    const divisor = geometria.tipo === "cone" ? 3 : 1;
    formula = `${geometria.radial.tipo === "diametro" ? "r = diâmetro / 2; " : ""}V = π × r² × altura${divisor === 3 ? " / 3" : ""}; V líquido = V bruto − Σ deduções`;
    if (altura !== null && raio !== null) bruto = (Math.PI * raio ** 2 * altura) / divisor;
  }
  let totalDeducoes: number | null = null;
  if (deducoes === null)
    pendencias.push(
      "Deduções: declare as deduções ou confirme explicitamente que não há deduções.",
    );
  else {
    parametros.push(...deducoes);
    const valores = deducoes.map((p, index) =>
      volumeM3(p, `Dedução ${index + 1}`, pendencias, true),
    );
    if (valores.every((valor) => valor !== null))
      totalDeducoes = (valores as number[]).reduce((a, b) => a + b, 0);
  }
  let liquido = bruto !== null && totalDeducoes !== null ? bruto - totalDeducoes : null;
  if (
    (bruto !== null && !Number.isFinite(bruto)) ||
    (liquido !== null && !Number.isFinite(liquido))
  ) {
    pendencias.push("Volume: parâmetros excedem a precisão numérica suportada.");
    bruto = null;
    liquido = null;
  }
  if (liquido !== null && liquido <= 0) {
    pendencias.push(
      "Deduções: volume líquido deve ser maior que zero; confira unidades e deduções.",
    );
    liquido = null;
  }
  return {
    ...rastreio(
      { geometria, deducoes },
      estadoResultado(parametros, liquido !== null && pendencias.length === 0),
      pendencias,
    ),
    formula,
    volume_bruto_m3: bruto,
    deducoes_m3: totalDeducoes,
    volume_liquido_m3: liquido,
  };
}

export type EntradaVentilacaoNr = {
  volume_liquido: Volume;
  vazao_nominal: Vazao;
  /** Não pressupor vazão efetiva igual à nominal quando o fator for desconhecido. */
  fator_efetividade: Parametro<"fracao">;
  duracao: Parametro<"h" | "min">;
};
export function calcularVentilacaoNr(entrada: EntradaVentilacaoNr) {
  const pendencias: string[] = [];
  const volume = volumeM3(entrada.volume_liquido, "Volume líquido", pendencias);
  const nominal = conhecido(entrada.vazao_nominal, "Vazão nominal", pendencias);
  const fator = conhecido(entrada.fator_efetividade, "Fator de efetividade", pendencias);
  const duracao = conhecido(entrada.duracao, "Duração", pendencias, true);
  const fatorVazao = { "m3/h": 1, "m3/s": 3600, "L/s": 3.6 }[entrada.vazao_nominal.unidade];
  const fatorTempo = { h: 1, min: 1 / 60 }[entrada.duracao.unidade];
  if (fatorVazao === undefined) pendencias.push("Vazão: unidade não suportada.");
  if (fatorTempo === undefined) pendencias.push("Duração: unidade não suportada.");
  if (entrada.fator_efetividade.unidade !== "fracao" || (fator !== null && fator > 1))
    pendencias.push(
      "Fator de efetividade: informe uma fração maior que zero e no máximo um, com fonte técnica.",
    );
  const nominalM3h = nominal !== null && fatorVazao !== undefined ? nominal * fatorVazao : null;
  const efetiva =
    nominalM3h !== null &&
    fator !== null &&
    fator <= 1 &&
    entrada.fator_efetividade.unidade === "fracao"
      ? nominalM3h * fator
      : null;
  const renovacoesHora = volume !== null && efetiva !== null ? efetiva / volume : null;
  const horas = duracao !== null && fatorTempo !== undefined ? duracao * fatorTempo : null;
  const volumesAcumulados =
    renovacoesHora !== null && horas !== null ? renovacoesHora * horas : null;
  const resultados = [nominalM3h, efetiva, renovacoesHora, volumesAcumulados];
  const finitos = resultados.every((value) => value === null || Number.isFinite(value));
  if (!finitos) pendencias.push("Ventilação: parâmetros excedem a precisão numérica suportada.");
  return {
    ...rastreio(
      entrada,
      estadoResultado(
        [entrada.volume_liquido, entrada.vazao_nominal, entrada.fator_efetividade, entrada.duracao],
        finitos && volumesAcumulados !== null && pendencias.length === 0,
      ),
      pendencias,
    ),
    formula:
      "Q efetiva = Q nominal × fator; taxa horária = Q efetiva / V líquido; volumes acumulados = taxa horária × duração em horas",
    vazao_nominal_m3_h: finitos ? nominalM3h : null,
    vazao_efetiva_m3_h: finitos ? efetiva : null,
    renovacoes_por_hora: finitos ? renovacoesHora : null,
    volumes_acumulados: finitos ? volumesAcumulados : null,
    duracao_horas: horas,
  };
}
