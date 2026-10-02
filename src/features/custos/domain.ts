// Custos de aquisição: fórmulas puras e versionadas. Páginas e servidor usam somente este módulo.
export const CUSTO_VERSAO = "custos-1.0.0";

/** Parcelas comprovadas de uma compra, em valores do documento (null = não informado). */
export interface Parcelas {
  produtos: number | null;
  desconto?: number | null;
  frete?: number | null;
  ipi?: number | null;
  difal?: number | null;
  outras?: number | null;
}

export type ParcelaChave = "frete" | "ipi" | "difal" | "outras";
/** Política histórica da planilha: custo = produtos − desconto + frete rateado + IPI + DIFAL base dupla. */
export const POLITICA_PLANILHA: { versao: string; parcelas: ParcelaChave[] } = {
  versao: "planilha-2026-10-01",
  parcelas: ["frete", "ipi", "difal", "outras"],
};

export interface AquisicaoCalculada {
  custo_total: number | null;
  quantidade_uso: number | null;
  custo_unitario: number | null;
  pendencia: string | null;
}

/**
 * Calcula uma compra. Nunca transforma ausência em zero: sem preço, quantidade zero
 * ou unidade sem fator de conversão confirmado, o resultado é pendente.
 */
export function calcularAquisicao(
  quantidade: number,
  unidadeCompra: string,
  unidadeUso: string,
  parcelas: Parcelas,
  fator: number | null,
  incluir: ParcelaChave[] = POLITICA_PLANILHA.parcelas,
): AquisicaoCalculada {
  const pend = (p: string): AquisicaoCalculada => ({
    custo_total: null,
    quantidade_uso: null,
    custo_unitario: null,
    pendencia: p,
  });
  if (parcelas.produtos == null) return pend("Custo pendente: preço do item não informado.");
  if (!(quantidade > 0)) return pend("Quantidade zero ou não informada.");
  const mesma = norm(unidadeCompra) === norm(unidadeUso);
  const f = mesma ? 1 : fator;
  if (!f || !(f > 0))
    return pend(`Unidade ${unidadeCompra} sem fator de conversão confirmado para ${unidadeUso}.`);
  let total = parcelas.produtos - (parcelas.desconto ?? 0);
  for (const k of incluir) total += parcelas[k] ?? 0;
  total = arred(total);
  const qtd = quantidade * f;
  return { custo_total: total, quantidade_uso: qtd, custo_unitario: total / qtd, pendencia: null };
}

export interface AquisicaoResumo {
  custo_total: number | null;
  quantidade_uso: number | null;
  data: string;
  situacao: "valida" | "pendente";
}

/** Média ponderada = Σ custos válidos / Σ quantidades compatíveis; última compra válida à parte. */
export function resumoCustos(lista: AquisicaoResumo[]) {
  const validas = lista.filter(
    (a) => a.situacao === "valida" && a.custo_total != null && (a.quantidade_uso ?? 0) > 0,
  );
  const soma = validas.reduce((s, a) => s + (a.custo_total as number), 0);
  const qtd = validas.reduce((s, a) => s + (a.quantidade_uso as number), 0);
  const ultima = [...validas].sort((a, b) => b.data.localeCompare(a.data))[0];
  return {
    media_ponderada: qtd > 0 ? soma / qtd : null,
    ultima_compra: ultima ? (ultima.custo_total as number) / (ultima.quantidade_uso as number) : null,
    compras_validas: validas.length,
    compras_pendentes: lista.length - validas.length,
  };
}

/** Parcelas já embutidas no custo de aquisição não podem voltar como encargo na formação do preço. */
export function parcelasDuplicadas(noCusto: ParcelaChave[], naVenda: ParcelaChave[]) {
  return naVenda.filter((p) => noCusto.includes(p));
}

export function linhaResumo(a: {
  custo_total: number | string | null;
  valores_calculados: { quantidade_uso?: number | null } | null;
  documentos_fiscais?: { emitido_em: string | null } | null;
  created_at: string;
  situacao: string;
}): AquisicaoResumo {
  return {
    custo_total: a.custo_total == null ? null : Number(a.custo_total),
    quantidade_uso:
      a.valores_calculados?.quantidade_uso == null ? null : Number(a.valores_calculados.quantidade_uso),
    data: a.documentos_fiscais?.emitido_em ?? String(a.created_at).slice(0, 10),
    situacao: a.situacao as "valida" | "pendente",
  };
}

const norm = (u: string) => u.trim().toUpperCase().replace("Ç", "C");
const arred = (v: number) => Math.round(v * 100) / 100;
