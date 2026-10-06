/** Regras puras de reconciliação de suprimentos (espelham a RPC gerar_ordens). */
export function arredondarCompra(saldo: number, multiplo: number, indivisivel: boolean) {
  if (!(saldo > 0)) return 0;
  if (multiplo > 0) return Math.ceil(saldo / multiplo - 1e-9) * multiplo;
  return indivisivel ? Math.ceil(saldo - 1e-9) : saldo;
}

export type Reconciliacao = {
  necessidade: number;
  comprometida: number;
  realizada: number;
  semOrdem: number;
  /** Comprometido acima da necessidade atual: pendência manual, nunca cancelamento automático. */
  excedente: number;
};

export function reconciliar(planejada: number, comprometida: number, realizada: number): Reconciliacao {
  return {
    necessidade: planejada,
    comprometida,
    realizada,
    semOrdem: Math.max(0, planejada - comprometida),
    excedente: Math.max(0, comprometida - planejada),
  };
}

export type DemandaPrevia = {
  modalidade: string;
  planejada: number;
  comprometida: number;
  fornecedor: { id: string; nome: string } | null;
};

/** O que "Gerar ordens" fará agora: OCs por fornecedor e/ou OP, apenas para saldo descoberto. */
export function previaGeracao(ds: DemandaPrevia[]) {
  const fornecedores = new Map<string, string>();
  let op = false;
  let semFornecedor = 0;
  for (const d of ds) {
    if (!(d.planejada - d.comprometida > 0)) continue;
    if (d.modalidade === "fabricar") op = true;
    else if (d.fornecedor) fornecedores.set(d.fornecedor.id, d.fornecedor.nome);
    else semFornecedor++;
  }
  return { fornecedores: [...fornecedores.values()], op, semFornecedor };
}
