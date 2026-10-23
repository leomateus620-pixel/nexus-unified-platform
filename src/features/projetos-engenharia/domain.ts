import type { DocumentoNativo } from "./schemas";

export function documentoInicial(): DocumentoNativo {
  return {
    schema_version: 1,
    familia: "documental",
    finalidade: "estudo",
    secoes: [
      { id: crypto.randomUUID(), titulo: "Objetivo e escopo", texto: "" },
      { id: crypto.randomUUID(), titulo: "Fontes e premissas", texto: "" },
      { id: crypto.randomUUID(), titulo: "Pendências de conferência", texto: "" },
    ],
    parametros: [],
  };
}

export type MudancaNativa = {
  id: string;
  campo: string;
  anterior: string;
  atual: string;
};

/** Compara por ID estável; reordenar não faz uma seção parecer outra. */
export function compararModelos(base: DocumentoNativo, atual: DocumentoNativo): MudancaNativa[] {
  const mudancas: MudancaNativa[] = [];
  if (base.finalidade !== atual.finalidade)
    mudancas.push({
      id: "finalidade",
      campo: "Finalidade",
      anterior: base.finalidade,
      atual: atual.finalidade,
    });
  for (const tipo of ["secoes", "parametros"] as const) {
    const antigos = new Map(base[tipo].map((item) => [item.id, item]));
    const novos = new Map(atual[tipo].map((item) => [item.id, item]));
    for (const [id, antigo] of antigos) {
      if (!novos.has(id))
        mudancas.push({ id, campo: "Removido", anterior: JSON.stringify(antigo), atual: "" });
    }
    for (const [id, novo] of novos) {
      const antigo = antigos.get(id);
      if (!antigo)
        mudancas.push({ id, campo: "Adicionado", anterior: "", atual: JSON.stringify(novo) });
      else {
        for (const campo of Object.keys(novo)) {
          const antes = (antigo as Record<string, unknown>)[campo];
          const depois = (novo as Record<string, unknown>)[campo];
          if (antes !== depois)
            mudancas.push({
              id,
              campo,
              anterior: String(antes ?? ""),
              atual: String(depois ?? ""),
            });
        }
      }
    }
  }
  const ordemAnterior = base.secoes.map((s) => s.id).join(",");
  const ordemAtual = atual.secoes.map((s) => s.id).join(",");
  if (ordemAnterior !== ordemAtual && base.secoes.length === atual.secoes.length)
    mudancas.push({
      id: "ordem",
      campo: "Ordem das seções",
      anterior: ordemAnterior,
      atual: ordemAtual,
    });
  return mudancas;
}
