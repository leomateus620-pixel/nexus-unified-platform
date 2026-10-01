// Codificação dos itens: [SEGMENTO]-NXS-[TIPO][SEQ]. A geração definitiva é sempre do servidor
// (função cadastrar_produto_codificado); este módulo só descreve o padrão e a correspondência histórica.

export type TipoItem = "M" | "S" | "P";
export const TIPOS_ITEM: { valor: TipoItem; nome: string }[] = [
  { valor: "M", nome: "Montagem" },
  { valor: "S", nome: "Conjunto soldado" },
  { valor: "P", nome: "Peça" },
];
export const nomeTipo = (t: string | null | undefined) =>
  TIPOS_ITEM.find((x) => x.valor === t)?.nome ?? "—";

export const PADRAO_CODIGO = /^([A-Z]{2,5})-NXS-([MSP])(\d{3,})$/;

export function formatarCodigo(familia: string, tipo: TipoItem, seq: number) {
  return `${familia}-NXS-${tipo}${String(seq).padStart(3, "0")}`;
}

/**
 * Correspondência COMP → NXS aplicada no catálogo (rastreabilidade). Nenhum COMP tinha
 * correspondência técnica comprovada com a planilha: todos receberam número novo após o limite.
 * COMP-15 (lacre) e COMP-20 (LVHR Bonier 12 m) aguardam decisão e mantêm o código antigo.
 */
export const CODIGO_NXS: Record<string, { codigo: string; familia: string; tipo: TipoItem }> = {
  "COMP-01": { codigo: "LVHF-NXS-S007", familia: "LVHF", tipo: "S" },
  "COMP-02": { codigo: "COM-NXS-P009", familia: "COM", tipo: "P" },
  "COMP-03": { codigo: "LVHF-NXS-M001", familia: "LVHF", tipo: "M" },
  "COMP-04": { codigo: "LVHF-NXS-M002", familia: "LVHF", tipo: "M" },
  "COMP-05": { codigo: "COM-NXS-P010", familia: "COM", tipo: "P" },
  "COMP-06": { codigo: "LVHF-NXS-P050", familia: "LVHF", tipo: "P" },
  "COMP-07": { codigo: "LVHF-NXS-P051", familia: "LVHF", tipo: "P" },
  "COMP-08": { codigo: "COM-NXS-M009", familia: "COM", tipo: "M" },
  "COMP-09": { codigo: "LVHF-NXS-P052", familia: "LVHF", tipo: "P" },
  "COMP-10": { codigo: "LVHF-NXS-P053", familia: "LVHF", tipo: "P" },
  "COMP-11": { codigo: "LVHF-NXS-S008", familia: "LVHF", tipo: "S" },
  "COMP-12": { codigo: "COM-NXS-P011", familia: "COM", tipo: "P" },
  "COMP-13": { codigo: "COM-NXS-M010", familia: "COM", tipo: "M" },
  "COMP-14": { codigo: "PLA-NXS-P001", familia: "PLA", tipo: "P" },
  "COMP-16": { codigo: "COM-NXS-P012", familia: "COM", tipo: "P" },
  "COMP-17": { codigo: "COM-NXS-P013", familia: "COM", tipo: "P" },
  "COMP-18": { codigo: "COM-NXS-P014", familia: "COM", tipo: "P" },
  "COMP-19": { codigo: "COM-NXS-M011", familia: "COM", tipo: "M" },
  "COMP-21": { codigo: "LVHR-NXS-P009", familia: "LVHR", tipo: "P" },
};

/** Código atual de um código histórico (COMP pendente retorna ele mesmo). */
export const codigoAtual = (legado: string) => CODIGO_NXS[legado]?.codigo ?? legado;
