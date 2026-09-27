// Motor de cálculo NEXUS — funções puras, determinísticas e versionadas.
// Usado tanto na prévia (navegador) quanto no cálculo canônico (servidor).
// Categorias: EXISTENTE (planilha), CORREÇÃO (auditoria), EVOLUÇÃO (nova capacidade).

export const MOTOR_VERSAO = "nexus-calc-1.0.0";

export type TipoSistema = "TELHADO" | "OVERHEAD";

export type Regras = {
  telhado: {
    cabo_extra_m: number;
    espacamento_pilar_m: number;
    espacamento_intermediaria_m: number;
    interfaces_por_pilar: number;
    absorvedores_por_sistema: number;
    esticadores_por_sistema: number;
    links_por_sistema: number;
    placas_por_sistema: number;
    lacres_por_sistema: number;
    mosquetoes_por_sistema: number;
  };
  overhead: {
    cabo_extra_m_por_trecho: number;
    espacamento_ancoragem_trelica_m: number;
    espacamento_intermediaria_m: number;
    espacamento_pilar_alongador_m: number;
    absorvedores_por_trecho: number;
    esticadores_por_trecho: number;
    proll_por_sistema: number;
    placas_por_sistema: number;
    lacres_por_sistema: number;
    mosquetoes_por_sistema: number;
  };
  /** Consumíveis por metro de cabo (LISTA_COMPRAS). Quantidade técnica fracionada. */
  consumiveis_por_m_cabo: { clipe: number; anilha: number; prensa: number };
  /** Código do componente no catálogo para cada saída. */
  componentes: Record<ChaveSaida, string>;
};

export type ChaveSaida =
  | "pilar_telhado"
  | "flange"
  | "cabo"
  | "intermediaria"
  | "interface_montante"
  | "absorvedor"
  | "esticador"
  | "link"
  | "placa"
  | "lacre"
  | "mosquetao"
  | "ancoragem_trelica"
  | "pilar_alongador"
  | "proll"
  | "clipe"
  | "anilha"
  | "prensa";

export type Parametros = {
  aliquota_precificacao: number; // provisão legada (C19)
  aliquota_interestadual: number;
  aliquota_interna_destino: number;
  difal_ativo: boolean;
  markup: number;
  frete_materiais: number;
  desconto: number;
  montagem_percentual: number; // CORREÇÃO F11: independente do markup
  preco_item_tecnico: number;
  custo_hora_tecnico: number;
  custo_hora_engenheiro: number;
  alimentacao_dia: number;
  hospedagem_dia: number;
  preco_combustivel: number;
  km_por_litro: number;
  tecnicos_por_equipe: number;
  produtividade_telhado_m_dia: number;
  produtividade_overhead_m_dia: number;
  horas_por_dia: number;
  horas_engenharia: number;
  distancia_ida_volta_km: number;
  dias_por_viagem: number;
};

/** Valores EXISTENTES no modelo (PARAMETROS / DIMENSIONAMENTO), rev. 05 da proposta 054/26. */
export const PARAMETROS_MODELO: Parametros = {
  aliquota_precificacao: 0.18,
  aliquota_interestadual: 0.12,
  aliquota_interna_destino: 0.17,
  difal_ativo: false,
  markup: 0.4,
  frete_materiais: 0,
  desconto: 0,
  montagem_percentual: 0.4,
  preco_item_tecnico: 19750,
  custo_hora_tecnico: 48,
  custo_hora_engenheiro: 180,
  alimentacao_dia: 75,
  hospedagem_dia: 140,
  preco_combustivel: 6.76,
  km_por_litro: 9,
  tecnicos_por_equipe: 3,
  produtividade_telhado_m_dia: 40,
  produtividade_overhead_m_dia: 25,
  horas_por_dia: 8.8,
  horas_engenharia: 24,
  distancia_ida_volta_km: 236,
  dias_por_viagem: 5,
};

export const REGRAS_MODELO: Regras = {
  telhado: {
    cabo_extra_m: 4,
    espacamento_pilar_m: 10,
    espacamento_intermediaria_m: 12,
    interfaces_por_pilar: 2,
    absorvedores_por_sistema: 1,
    esticadores_por_sistema: 1,
    links_por_sistema: 2,
    placas_por_sistema: 1,
    lacres_por_sistema: 1,
    mosquetoes_por_sistema: 1,
  },
  overhead: {
    cabo_extra_m_por_trecho: 5,
    espacamento_ancoragem_trelica_m: 9,
    espacamento_intermediaria_m: 13,
    espacamento_pilar_alongador_m: 10.9,
    absorvedores_por_trecho: 1,
    esticadores_por_trecho: 1,
    proll_por_sistema: 1,
    placas_por_sistema: 1,
    lacres_por_sistema: 1,
    mosquetoes_por_sistema: 1,
  },
  consumiveis_por_m_cabo: { clipe: 0.06, anilha: 0.02, prensa: 0.02 },
  componentes: {
    pilar_telhado: "COMP-01",
    flange: "COMP-02",
    absorvedor: "COMP-03",
    esticador: "COMP-04",
    cabo: "COMP-05",
    intermediaria: "COMP-06",
    interface_montante: "COMP-07",
    link: "COMP-09",
    ancoragem_trelica: "COMP-10",
    pilar_alongador: "COMP-11",
    mosquetao: "COMP-12",
    proll: "COMP-13",
    placa: "COMP-14",
    lacre: "COMP-15",
    clipe: "COMP-16",
    anilha: "COMP-17",
    prensa: "COMP-18",
  },
};

export type SistemaEntrada = {
  id: string;
  identificacao: string;
  tipo: TipoSistema;
  metragem: number; // TELHADO: metragem total; OVERHEAD: metragem de cada trecho
  trechos: number;
};

export type LinhaComposicao = {
  chave: ChaveSaida;
  codigo: string;
  quantidade_tecnica: number;
  memoria: string;
};

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const vaos = (m: number, esp: number) => (m > 0 && esp > 0 ? Math.ceil(m / esp) : 0);

/** Extensão instalada (m): TELHADO usa a metragem uma vez; OVERHEAD multiplica por trechos. */
export function extensaoInstalada(s: Pick<SistemaEntrada, "tipo" | "metragem" | "trechos">) {
  const m = pos(s.metragem);
  return s.tipo === "TELHADO" ? m : m * Math.max(1, Math.floor(s.trechos));
}

export function consumoCabo(s: Pick<SistemaEntrada, "tipo" | "metragem" | "trechos">, r: Regras) {
  const m = pos(s.metragem);
  if (m === 0) return 0;
  if (s.tipo === "TELHADO") return m + r.telhado.cabo_extra_m;
  return (m + r.overhead.cabo_extra_m_por_trecho) * Math.max(1, Math.floor(s.trechos));
}

/** Um sistema sem identificação ou sem metragem é rascunho parcial e não gera composição (CORREÇÃO F13). */
export function sistemaValido(s: SistemaEntrada) {
  return s.identificacao.trim().length > 0 && pos(s.metragem) > 0 && s.trechos >= 1;
}

export function composicaoSistema(s: SistemaEntrada, r: Regras): LinhaComposicao[] {
  if (!sistemaValido(s)) return [];
  const out: LinhaComposicao[] = [];
  const add = (chave: ChaveSaida, q: number, memoria: string) => {
    if (q > 0) out.push({ chave, codigo: r.componentes[chave], quantidade_tecnica: q, memoria });
  };
  const m = s.metragem;
  const cabo = consumoCabo(s, r);

  if (s.tipo === "TELHADO") {
    const t = r.telhado;
    const pilares = vaos(m, t.espacamento_pilar_m) + 1;
    add("pilar_telhado", pilares, `⌈${m} ÷ ${t.espacamento_pilar_m}⌉ + 1`);
    add("flange", pilares, `1 por pilar = ${pilares}`);
    add("cabo", cabo, `${m} + ${t.cabo_extra_m} m`);
    add(
      "intermediaria",
      Math.max(0, vaos(m, t.espacamento_intermediaria_m) - 1),
      `⌈${m} ÷ ${t.espacamento_intermediaria_m}⌉ − 1`,
    );
    add(
      "interface_montante",
      pilares * t.interfaces_por_pilar,
      `${pilares} pilares × ${t.interfaces_por_pilar}`,
    );
    add("absorvedor", t.absorvedores_por_sistema, "por sistema");
    add("esticador", t.esticadores_por_sistema, "por sistema");
    add("link", t.links_por_sistema, "por sistema (CORREÇÃO F04)");
    add("placa", t.placas_por_sistema, "por sistema (CORREÇÃO F04)");
    add("lacre", t.lacres_por_sistema, "por sistema (CORREÇÃO F04)");
    add("mosquetao", t.mosquetoes_por_sistema, "por sistema (CORREÇÃO F04)");
  } else {
    const o = r.overhead;
    const n = Math.max(1, Math.floor(s.trechos));
    add("cabo", cabo, `(${m} + ${o.cabo_extra_m_por_trecho}) × ${n} trechos`);
    add(
      "ancoragem_trelica",
      (vaos(m, o.espacamento_ancoragem_trelica_m) + 1) * n,
      `(⌈${m} ÷ ${o.espacamento_ancoragem_trelica_m}⌉ + 1) × ${n}`,
    );
    add(
      "intermediaria",
      Math.max(0, vaos(m, o.espacamento_intermediaria_m) - 1) * n,
      `(⌈${m} ÷ ${o.espacamento_intermediaria_m}⌉ − 1) × ${n}`,
    );
    add(
      "pilar_alongador",
      (vaos(m, o.espacamento_pilar_alongador_m) + 1) * n,
      `(⌈${m} ÷ ${o.espacamento_pilar_alongador_m}⌉ + 1) × ${n}`,
    );
    add("absorvedor", o.absorvedores_por_trecho * n, `${o.absorvedores_por_trecho} × ${n} trechos`);
    add("esticador", o.esticadores_por_trecho * n, `${o.esticadores_por_trecho} × ${n} trechos`);
    add("proll", o.proll_por_sistema, "por sistema");
    add("placa", o.placas_por_sistema, "por sistema (CORREÇÃO F04)");
    add("lacre", o.lacres_por_sistema, "por sistema (CORREÇÃO F04)");
    add("mosquetao", o.mosquetoes_por_sistema, "por sistema (CORREÇÃO F04)");
  }
  const c = r.consumiveis_por_m_cabo;
  add("clipe", cabo * c.clipe, `${cabo} m × ${c.clipe}`);
  add("anilha", cabo * c.anilha, `${cabo} m × ${c.anilha}`);
  add("prensa", cabo * c.prensa, `${cabo} m × ${c.prensa}`);
  return out;
}

/** Peça indivisível: arredonda para cima e aplica múltiplo de compra. Nunca fraciona (CORREÇÃO F05). */
export function quantidadeOperacional(tecnica: number, indivisivel: boolean, multiplo = 1) {
  if (!indivisivel) return round(tecnica, 6);
  const base = Math.ceil(round(tecnica, 9));
  const mult = multiplo > 0 ? multiplo : 1;
  return Math.ceil(base / mult) * mult;
}

export const round = (v: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};

export type ComponenteAdotado = {
  id: string;
  codigo: string;
  custo: number;
  indivisivel: boolean;
  multiplo: number;
};

export function precoUnitario(custo: number, p: Parametros) {
  const frete = custo * p.frete_materiais;
  const base = custo + frete;
  const imposto = base * p.aliquota_precificacao;
  const difal = p.difal_ativo
    ? base * Math.max(0, p.aliquota_interna_destino - p.aliquota_interestadual)
    : 0;
  const composto = base + imposto + difal;
  return { frete, imposto, difal, composto, preco: composto * (1 + p.markup) };
}

export type ItemCalculado = {
  sistema_id: string;
  componente_id: string;
  chave: ChaveSaida;
  quantidade_tecnica: number;
  quantidade: number;
  memoria: string;
};

export type Override = { sistema_id: string; componente_id: string; quantidade: number };

export type ResultadoRevisao = {
  itens: ItemCalculado[];
  pendencias: string[];
  por_componente: {
    componente_id: string;
    codigo: string;
    quantidade: number;
    custo: number;
    preco_unit: number;
    total_venda: number;
    total_custo: number;
  }[];
  por_sistema: {
    sistema_id: string;
    extensao_m: number;
    cabo_m: number;
    venda_materiais: number;
    custo_materiais: number;
  }[];
  totais: Totais;
};

export type Totais = {
  materiais: number;
  montagem: number;
  item_tecnico: number;
  base: number;
  desconto: number;
  final: number;
  custo_materiais: number;
  impostos_materiais: number;
  impostos_servicos: number;
  metragem_telhado: number;
  metragem_overhead: number;
  cabo_total: number;
  dias_equipe: number;
  viagens: number;
  mao_de_obra: number;
  alimentacao: number;
  hospedagem: number;
  combustivel: number;
  engenharia: number;
  operacao: number;
  resultado: number;
  margem: number | null;
  parcelas_12x: number[];
  parcelas_50_30_20: number[];
};

/** Distribui um total em parcelas de centavos cuja soma é exatamente o total. */
export function distribuirParcelas(total: number, pesos: number[]): number[] {
  const cents = Math.round(total * 100);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const brutas = pesos.map((p) => Math.floor((cents * p) / soma));
  let resto = cents - brutas.reduce((a, b) => a + b, 0);
  for (let i = 0; resto > 0; i = (i + 1) % brutas.length, resto--) brutas[i] = (brutas[i] ?? 0) + 1;
  return brutas.map((c) => c / 100);
}

export function calcularRevisao(
  sistemas: SistemaEntrada[],
  componentes: ComponenteAdotado[],
  regras: Regras,
  p: Parametros,
  overrides: Override[] = [],
): ResultadoRevisao {
  const porCodigo = new Map(componentes.map((c) => [c.codigo, c]));
  const pendencias = new Set<string>();
  const itens: ItemCalculado[] = [];
  const porSistema: ResultadoRevisao["por_sistema"] = [];
  const ov = new Map(overrides.map((o) => [`${o.sistema_id}:${o.componente_id}`, o.quantidade]));

  let mTelhado = 0;
  let mOverhead = 0;
  let caboTotal = 0;

  for (const s of sistemas) {
    if (!sistemaValido(s)) {
      pendencias.add(
        `Sistema ${s.identificacao || "(sem identificação)"}: informe identificação e metragem.`,
      );
      porSistema.push({
        sistema_id: s.id,
        extensao_m: 0,
        cabo_m: 0,
        venda_materiais: 0,
        custo_materiais: 0,
      });
      continue;
    }
    const ext = extensaoInstalada(s);
    const cabo = consumoCabo(s, regras);
    if (s.tipo === "TELHADO") mTelhado += ext;
    else mOverhead += ext;
    caboTotal += cabo;
    let venda = 0;
    let custo = 0;
    for (const l of composicaoSistema(s, regras)) {
      const comp = porCodigo.get(l.codigo);
      if (!comp) {
        pendencias.add(
          `Componente ${l.codigo} exigido pela regra "${l.chave}" não está na revisão.`,
        );
        continue;
      }
      const auto = quantidadeOperacional(l.quantidade_tecnica, comp.indivisivel, comp.multiplo);
      const q = ov.get(`${s.id}:${comp.id}`) ?? auto;
      itens.push({
        sistema_id: s.id,
        componente_id: comp.id,
        chave: l.chave,
        quantidade_tecnica: round(l.quantidade_tecnica, 6),
        quantidade: q,
        memoria: l.memoria,
      });
      const pu = precoUnitario(comp.custo, p);
      venda += q * pu.preco;
      custo += q * comp.custo;
    }
    porSistema.push({
      sistema_id: s.id,
      extensao_m: ext,
      cabo_m: cabo,
      venda_materiais: round(venda),
      custo_materiais: round(custo),
    });
  }

  const agreg = new Map<string, number>();
  for (const i of itens)
    agreg.set(i.componente_id, (agreg.get(i.componente_id) ?? 0) + i.quantidade);

  let materiais = 0;
  let custoMat = 0;
  let impMat = 0;
  const porComponente: ResultadoRevisao["por_componente"] = [];
  for (const c of componentes) {
    const q = agreg.get(c.id) ?? 0;
    if (q === 0) continue;
    if (!(c.custo > 0)) pendencias.add(`Componente ${c.codigo} sem custo adotado.`);
    const pu = precoUnitario(c.custo, p);
    materiais += q * pu.preco;
    custoMat += q * (c.custo + pu.frete); // CORREÇÃO F06: frete integra custo
    impMat += q * (pu.imposto + pu.difal); // CORREÇÃO F06: DIFAL deduzido
    porComponente.push({
      componente_id: c.id,
      codigo: c.codigo,
      quantidade: q,
      custo: c.custo,
      preco_unit: round(pu.preco, 6),
      total_venda: round(q * pu.preco),
      total_custo: round(q * c.custo),
    });
  }

  materiais = round(materiais);
  const montagem = round(materiais * p.montagem_percentual);
  const tecnico = round(sistemas.some(sistemaValido) ? p.preco_item_tecnico : 0);
  const base = round(materiais + montagem + tecnico);
  const desconto = round(base * p.desconto);
  const final = round(base - desconto);
  const impServ = round((montagem + tecnico) * (1 - p.desconto) * p.aliquota_precificacao);

  const dias =
    mTelhado + mOverhead > 0
      ? Math.ceil(
          round(
            mTelhado / p.produtividade_telhado_m_dia + mOverhead / p.produtividade_overhead_m_dia,
            9,
          ),
        )
      : 0;
  const viagens = dias > 0 ? Math.max(1, Math.ceil(dias / p.dias_por_viagem)) : 0; // CORREÇÃO F17
  const maoDeObra = round(dias * p.horas_por_dia * p.tecnicos_por_equipe * p.custo_hora_tecnico);
  const alimentacao = round(dias * p.tecnicos_por_equipe * p.alimentacao_dia);
  const hospedagem = round(dias * p.tecnicos_por_equipe * p.hospedagem_dia);
  const combustivel = round(
    p.km_por_litro > 0
      ? (viagens * p.distancia_ida_volta_km * p.preco_combustivel) / p.km_por_litro
      : 0,
  );
  const engenharia = round(dias > 0 ? p.horas_engenharia * p.custo_hora_engenheiro : 0);
  const operacao = round(maoDeObra + alimentacao + hospedagem + combustivel + engenharia);
  const resultado = round(final - round(custoMat) - round(impMat) - impServ - operacao);

  const baseParc = round((tecnico + materiais) * (1 - p.desconto));
  return {
    itens,
    pendencias: [...pendencias],
    por_componente: porComponente,
    por_sistema: porSistema,
    totais: {
      materiais,
      montagem,
      item_tecnico: tecnico,
      base,
      desconto,
      final,
      custo_materiais: round(custoMat),
      impostos_materiais: round(impMat),
      impostos_servicos: impServ,
      metragem_telhado: mTelhado,
      metragem_overhead: mOverhead,
      cabo_total: caboTotal,
      dias_equipe: dias,
      viagens,
      mao_de_obra: maoDeObra,
      alimentacao,
      hospedagem,
      combustivel,
      engenharia,
      operacao,
      resultado,
      margem: final > 0 ? resultado / final : null,
      parcelas_12x: final > 0 ? distribuirParcelas(final, Array(12).fill(1)) : [],
      parcelas_50_30_20: baseParc > 0 ? distribuirParcelas(baseParc, [50, 30, 20]) : [],
    },
  };
}

export function mesclarParametros(...fontes: unknown[]): Parametros {
  const out = { ...PARAMETROS_MODELO } as Record<string, unknown>;
  for (const f of fontes) if (f && typeof f === "object") Object.assign(out, f);
  return out as Parametros;
}
export function mesclarRegras(r: unknown): Regras {
  if (!r || typeof r !== "object") return REGRAS_MODELO;
  const o = r as Partial<Regras>;
  return {
    telhado: { ...REGRAS_MODELO.telhado, ...o.telhado },
    overhead: { ...REGRAS_MODELO.overhead, ...o.overhead },
    consumiveis_por_m_cabo: {
      ...REGRAS_MODELO.consumiveis_por_m_cabo,
      ...o.consumiveis_por_m_cabo,
    },
    componentes: { ...REGRAS_MODELO.componentes, ...o.componentes },
  };
}
