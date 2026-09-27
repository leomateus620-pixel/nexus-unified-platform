// Referência independente do código de produção.
// Fonte: "MODELO Orçamento 2026 Automatizado - NEXUS.xlsx"
// SHA-256 b42b1ae5b9083c07945bb274a44ef809841906e78968735609e1a73314dab549
// Entradas: DIMENSIONAMENTO!B18:E34. Totais: DIMENSIONAMENTO!F44:O44 e LISTA_COMPRAS!G*.
// Os totais foram obtidos avaliando as fórmulas lidas do XLSX (sem valores em cache no arquivo).

export const SISTEMAS_PLANILHA: [string, "TELHADO" | "OVERHEAD", number, number][] = [
  ["Pav.I / Ensaque - Telhado 60m", "TELHADO", 60, 1],
  ["Pav.II - Telhado 80m", "TELHADO", 80, 1],
  ["Pav.III - Telhado 105m", "TELHADO", 105, 1],
  ["Pav.IV - Overhead 4x120m", "OVERHEAD", 120, 4],
  ["Pav.IV - Telhado 120m", "TELHADO", 120, 1],
  ["Pav.V - Telhado 65m", "TELHADO", 65, 1],
  ["Pav.VI - Telhado 60m", "TELHADO", 60, 1],
  ["Pav.VII - Overhead 4x100m", "OVERHEAD", 100, 4],
  ["Pav.VII - Telhado 100m", "TELHADO", 100, 1],
  ["IBS - Telhado 40m", "TELHADO", 40, 1],
  ["Recebimento - Telhado 25m", "TELHADO", 25, 1],
  ["Recebimento - Overhead 25m", "OVERHEAD", 25, 1],
  ["Pav.I - Overhead 2x60m", "OVERHEAD", 60, 2],
  ["Pav.II - Overhead 4x80m", "OVERHEAD", 80, 4],
  ["Pav.III - Overhead 4x105m", "OVERHEAD", 105, 4],
  ["Pav.VI - Overhead 2x60m", "OVERHEAD", 60, 2],
  ["TSI - Telhado 40m", "TELHADO", 40, 1],
];

/** Quantidade total por componente (LISTA_COMPRAS!G), com a célula de origem. */
export const TOTAIS_PLANILHA: Record<string, { qtd: number; origem: string }> = {
  "COMP-01": { qtd: 81, origem: "DIMENSIONAMENTO!F44" },
  "COMP-02": { qtd: 81, origem: "DIMENSIONAMENTO!G44" },
  "COMP-05": { qtd: 2725, origem: "DIMENSIONAMENTO!H44" },
  "COMP-06": { qtd: 210, origem: "DIMENSIONAMENTO!I44" },
  "COMP-07": { qtd: 162, origem: "DIMENSIONAMENTO!J44" },
  "COMP-03": { qtd: 31, origem: "DIMENSIONAMENTO!K44 / LISTA_COMPRAS!G12" },
  "COMP-04": { qtd: 31, origem: "DIMENSIONAMENTO!L44 / LISTA_COMPRAS!G13" },
  "COMP-10": { qtd: 219, origem: "DIMENSIONAMENTO!M44 / LISTA_COMPRAS!G14" },
  "COMP-11": { qtd: 187, origem: "DIMENSIONAMENTO!N44 / LISTA_COMPRAS!G15" },
  "COMP-13": { qtd: 7, origem: "DIMENSIONAMENTO!O44 / LISTA_COMPRAS!G16" },
  "COMP-12": { qtd: 17, origem: "LISTA_COMPRAS!G17 = COUNTA(B18:B42)" },
  "COMP-14": { qtd: 17, origem: "LISTA_COMPRAS!G18 = COUNTA(B18:B42)" },
  "COMP-15": { qtd: 17, origem: "LISTA_COMPRAS!G19 = COUNTA(B18:B42)" },
  "COMP-09": { qtd: 34, origem: "LISTA_COMPRAS!G20 = COUNTA(B18:B42)*2" },
  "COMP-08": { qtd: 81, origem: "LISTA_COMPRAS!G21 = DIMENSIONAMENTO!F44" },
  "COMP-16": { qtd: 163.5, origem: "LISTA_COMPRAS!G22 = H44*0,06" },
  "COMP-17": { qtd: 54.5, origem: "LISTA_COMPRAS!G23 = H44*0,02" },
  "COMP-18": { qtd: 54.5, origem: "LISTA_COMPRAS!G24 = H44*0,02" },
};

/** Parciais só dos 7 registros OVERHEAD (Comparacao_Formulas.md). */
export const OVERHEAD_PLANILHA = { intermediaria: 158, trelica: 219, alongador: 187 };
export const CUSTO_COMP08_HIST = 125.25; // ITENS_COMERCIAIS!F10
