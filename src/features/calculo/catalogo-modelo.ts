// Biblioteca EXISTENTE na planilha "MODELO Orçamento 2026 Automatizado - NEXUS.xlsx" (Anexo C da auditoria).
// Custos transcritos do arquivo, sem atualização de mercado. Importação opcional e rastreada.
export const ORIGEM_PLANILHA = "Planilha MODELO Orçamento 2026 rev.05 (SHA-256 b42b1ae5…)";

import { codigoAtual } from "../catalogo/codigos";

type Modalidade = "comprar" | "fabricar" | "terceirizar";
export const CATALOGO_MODELO: {
  codigo: string;
  codigo_legado: string;
  descricao: string;
  unidade: string;
  fabricante: string;
  ncm: string;
  custo: number;
  modalidade: Modalidade;
  indivisivel: boolean;
}[] = [
  [
    "COMP-01",
    "Estrutura Pilar 600mm - Base NR-35 (LVHF Telhado)",
    "PÇ",
    "NEXUS",
    "7308.90.90",
    192.47,
  ],
  [
    "COMP-02",
    "Flange Master Flash Standard EPDM - Vedação passagem telhado",
    "PÇ",
    "HARD",
    "4016.93.00",
    151.64,
  ],
  ["COMP-03", "Absorvedor de Energia INOX 304 - Sistema LVHF", "PÇ", "NEXUS", "8308.90.90", 597.02],
  ["COMP-04", "Esticador com Indicador de Tensão - INOX 304", "PÇ", "NEXUS", "8308.90.90", 1269.2],
  [
    "COMP-05",
    'Cabo de Aço Ø 5/16" 6x19S AACI Galvanizado - m linear',
    "M",
    "CIMAF",
    "7312.10.90",
    12.94,
  ],
  [
    "COMP-06",
    "Ancoragem Intermediária de Passagem Reta - INOX 304",
    "PÇ",
    "NEXUS",
    "7326.90.90",
    187.88,
  ],
  ["COMP-07", "Interface Fixação Montante - Aço Galvanizado", "PÇ", "NEXUS", "7308.90.90", 25.05],
  [
    "COMP-08",
    "Conjunto Fixadores (parafusos, arruelas, porcas) INOX",
    "CJ",
    "CISER",
    "7318.15.00",
    125.25,
  ],
  ["COMP-09", "Link Passante - Elo Terminação Cabo INOX", "PÇ", "NEXUS", "7326.90.90", 126.08],
  [
    "COMP-10",
    "Dispositivo de Ancoragem Fixado Treliça - Aço Estrutural",
    "PÇ",
    "NEXUS",
    "7308.90.90",
    116.65,
  ],
  ["COMP-11", "Estrutura Pilar Treliça Alongadores (Overhead)", "PÇ", "NEXUS", "7308.90.90", 341.2],
  [
    "COMP-12",
    "Mosquetão Oval 25kN Aço Trava Rosca CE NBR 15837",
    "PÇ",
    "KSTRONG",
    "7326.90.90",
    22.21,
  ],
  ["COMP-13", "PROLL Ancoragem - Trole Transfer INOX 304", "PÇ", "BONIER", "8425.19.90", 709.75],
  ["COMP-14", "Placa de Identificação em Aço INOX Gravada", "PÇ", "NEXUS", "8310.00.00", 29.22],
  ["COMP-15", "Lacre de Rastreabilidade do Sistema", "PÇ", "NEXUS", "8309.90.00", 4.17],
  ["COMP-16", 'Clipe para Cabo de Aço Ø 5/16" Forjado Pesado', "PÇ", "CISER", "7326.90.90", 3.79],
  ["COMP-17", 'Anilha Leve para Cabo de Aço Ø 5/16"', "PÇ", "CISER", "7318.22.00", 2.04],
  ["COMP-18", 'Prensa Cabo em Alumínio Ø 5/16"', "PÇ", "CIMAF", "7616.99.00", 1.87],
  ["COMP-19", 'Troller Viga I 4" - BONIER (LVHR Calagem)', "PÇ", "BONIER", "8425.19.90", 653.24],
  [
    "COMP-20",
    "LVHR - Linha de Vida Rígida 12m - BONIER TRILLION",
    "M",
    "BONIER",
    "7308.90.90",
    262.46,
  ],
  ["COMP-21", "Interface de Fixação nas Treliças (LVHR)", "PÇ", "NEXUS", "7308.90.90", 145.81],
].map(([codigo, descricao, unidade, fabricante, ncm, custo]) => ({
  // Código atual NXS (o COMP original fica como codigo_legado para rastreabilidade).
  codigo: codigoAtual(codigo as string),
  codigo_legado: codigo as string,
  descricao: descricao as string,
  unidade: unidade as string,
  fabricante: fabricante as string,
  ncm: ncm as string,
  custo: custo as number,
  // Modalidade não é inferida pelo fabricante (CORREÇÃO F10): padrão "comprar", classificar no catálogo.
  modalidade: "comprar" as Modalidade,
  indivisivel: unidade !== "M",
}));
