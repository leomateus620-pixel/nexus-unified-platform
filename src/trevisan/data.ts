/** Metres, Y up. X and Z follow sheet 05 (G1 = origin), not true east/north. */
export type Vec3 = [number, number, number];
export type GroupId = "moega" | "principal" | "bloco" | "transportes" | "silo" | "auxiliares";
export type LayerId = "estrutura" | "coberturas" | "fechamentos" | "piso" | "referencias";
export type Evidence = "croqui" | "estimado" | "sem-cota";
export interface Sector {
  id: string;
  name: string;
  group: GroupId;
  point: Vec3;
  radius: number;
  evidence: Evidence;
  sheets: string;
  dimensions: string;
  description: string;
}
export const SOURCE = {
  title: "Trevisan – Moega 3 e Coberturas (Conjunto Completo)",
  date: "25/09/2026",
  url: "/models/trevisan/levantamento.pdf",
  pages: 8,
  origin: { latitude: -30.048043, longitude: -52.919763 },
  googlePoint: { latitude: -30.0482997, longitude: -52.9193496 },
};
export const DIM = {
  moega: {
    length: 19.438,
    width: 17,
    bays: [6, 5.1, 3.435, 4.903],
    axes: [0, 6, 11.1, 14.535, 19.438],
    columnTop: 4.365,
    ridge: 6.925,
    roofEdge: 4.03,
    overhang: 3,
    gableOverhang: 0.4,
    roofLength: 19.838,
    roofWidth: 23,
    gate: 1.8,
    wall: 0.2,
    x: 37.3,
    z: -19.438,
  },
  main: {
    width: 62.7,
    depth: 41.5,
    naves: [21.2, 20.7, 20.8],
    eave: 5.68,
    ridge: 9.395,
    frames: Array.from({ length: 9 }, (_, i) => 0.75 + i * 5),
    column: 0.6,
    truss: 0.8,
  },
  high: {
    x: 40.9,
    z: 0,
    width: 21.8,
    depth: 11,
    ridge: 12.2,
    eave: 10.4,
    wallTop: 5.68,
    beam: 7.2,
  },
  lantern: { x: 31.1, z: 30.2, width: 33.9, depth: 6.2, eave: 9.395, ridge: 10.2 },
  silo: { x: 23, z: -49.7, diameter: 21, height: null },
  gallery: { x: 0, z: -1.7, width: 37.3, depth: 1.7, height: null },
  tower: { x: 66, z: -2.8, width: 2.8, depth: 2.5, height: null },
  auxiliaries: [
    { id: "anexo", x: 62.7, z: 17, width: 13, depth: 17, roof: "mono", height: null },
    { id: "leste", x: 85.5, z: 6.7, width: 11, depth: 9.5, roof: "z", height: null },
    { id: "norte", x: 56, z: -91.5, width: 9.5, depth: 34, roof: "x", height: null },
    { id: "sul", x: 39.4, z: 54, width: 13, depth: 7, roof: "z", height: null },
  ],
} as const;
export const GROUPS: { id: GroupId; name: string }[] = [
  { id: "moega", name: "Moega 3" },
  { id: "principal", name: "Galpão principal" },
  { id: "bloco", name: "Bloco alto" },
  { id: "transportes", name: "Transportadores e torre" },
  { id: "silo", name: "Silo metálico" },
  { id: "auxiliares", name: "Edificações auxiliares" },
];
export const LAYERS: { id: LayerId; name: string }[] = [
  { id: "estrutura", name: "Estrutura metálica" },
  { id: "coberturas", name: "Coberturas" },
  { id: "fechamentos", name: "Alvenaria / fechamentos" },
  { id: "piso", name: "Pisos e grelha" },
  { id: "referencias", name: "Elementos sem cota vertical" },
];
export const EVIDENCE: Record<Evidence, string> = {
  croqui: "Cota do croqui",
  estimado: "Estimado no PDF",
  "sem-cota": "Altura / geometria sem cota",
};
export const SECTORS: Sector[] = [
  {
    id: "moega",
    name: "Moega 3",
    group: "moega",
    point: [45.8, 3, -9.7],
    radius: 23,
    evidence: "croqui",
    sheets: "01–06",
    dimensions: "19,438 × 17,00 m · cumeeira +6,925 m",
    description:
      "Recebimento de grãos. Vãos 6,000 / 5,100 / 3,435 / 4,903 m; parede no eixo 14,535. Beirais de 3 m adotados no PDF. Cobertura do D1: 23,00 × 19,838 m, encostada no galpão.",
  },
  {
    id: "descarga",
    name: "Área de descarga",
    group: "moega",
    point: [42, 1, -16.4],
    radius: 10,
    evidence: "croqui",
    sheets: "01, 03",
    dimensions: "Primeiro vão · 6,000 m",
    description:
      "Portões de duas folhas na fachada oeste. Altura dos portões ≈ 1,80 m, adotada no levantamento.",
  },
  {
    id: "interna",
    name: "Área interna",
    group: "moega",
    point: [46, 1, -6.6],
    radius: 10,
    evidence: "croqui",
    sheets: "01, 04",
    dimensions: "Vão de 3,435 m",
    description:
      "Setor entre o eixo 3 e a parede em 14,535 m. Remova cobertura e fechamentos para conferir a organização.",
  },
  {
    id: "passagem",
    name: "Passagem de veículos",
    group: "moega",
    point: [37.3, 1, -10.9],
    radius: 11,
    evidence: "croqui",
    sheets: "01, 03",
    dimensions: "Vão livre · 5,100 m",
    description:
      "Entrada a oeste e saída a leste. Passagem livre até a cobertura, sem pilar central no corredor.",
  },
  {
    id: "grelha",
    name: "Grelha da moega",
    group: "moega",
    point: [45.8, 0.2, -10.9],
    radius: 12,
    evidence: "estimado",
    sheets: "01, 04",
    dimensions: "Limites indicativos · sem dimensionamento",
    description:
      "Contorno transcrito da proporção da folha 01 (aprox. 4,70 × 15 m). Malha apenas representativa; quantidade e seção das barras não especificadas.",
  },
  {
    id: "fosso",
    name: "Fosso sob grelha",
    group: "moega",
    point: [45.8, 0, -10.9],
    radius: 12,
    evidence: "sem-cota",
    sheets: "04",
    dimensions: "Profundidade e geometria a levantar",
    description:
      "Representado por área escura e contorno sob a grelha, sem extrusão ou profundidade inventada. A folha 04 exige levantamento.",
  },
  {
    id: "elevadores",
    name: "Elevadores",
    group: "moega",
    point: [46, 2, -2.45],
    radius: 11,
    evidence: "sem-cota",
    sheets: "01, 04",
    dimensions: "Setor de alvenaria · vão 4,903 m",
    description:
      "Compartimento indicado; layout dos equipamentos a confirmar. Não há máquinas dimensionadas no PDF.",
  },
  {
    id: "cabine",
    name: "Cabine metálica",
    group: "moega",
    point: [45.8, 7, -2.85],
    radius: 10,
    evidence: "sem-cota",
    sheets: "02, 06",
    dimensions: "≈ 1,80 × 1,80 m · altura ausente",
    description:
      "Contorno sobre a cobertura conforme D1 da folha 06. A posição difere da planta local da folha 02; conferir em campo.",
  },
  {
    id: "torre-moega",
    name: "Torre treliçada da Moega",
    group: "transportes",
    point: [50.3, 7, -4.9],
    radius: 13,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: "≈ 1,60 × 1,60 m",
    description:
      "Posição pelo ponto M5 / detalhe D1. A indicação ≈ 13,80 não tem referência altimétrica inequívoca; altura não adotada.",
  },
  {
    id: "principal",
    name: "Galpão principal",
    group: "principal",
    point: [31.35, 4, 20.75],
    radius: 44,
    evidence: "estimado",
    sheets: "05–07",
    dimensions: "≈ 62,70 × 41,50 m",
    description:
      "Três naves contíguas. Nove eixos T1–T9 a cada 5 m com recuos de 0,75 m. Implantação de imagem, precisão declarada ± 0,50 a 1,00 m.",
  },
  ...DIM.main.naves.map((width, i): Sector => ({
    id: `nave-${i + 1}`,
    name: `Nave ${i + 1}`,
    group: "principal",
    point: [i === 0 ? 10.6 : i === 1 ? 31.55 : 52.3, 4, 21],
    radius: 28,
    evidence: "estimado",
    sheets: "05–07",
    dimensions: `≈ ${width.toFixed(2).replace(".", ",")} m · +5,680 / +9,395 m`,
    description:
      "Pilares treliçados ≈ 0,60 × 0,60 m; treliças de banzos paralelos ≈ 0,80 m e vigas longitudinais. Alturas do rascunho; perfis a confirmar.",
  })),
  {
    id: "bloco",
    name: "Bloco alto",
    group: "bloco",
    point: [51.8, 6, 5.5],
    radius: 23,
    evidence: "estimado",
    sheets: "05, 06, 08",
    dimensions: "≈ 21,80 × 11,00 m · cumeeira +12,200 m",
    description:
      "Pórticos vermelhos e vigas I; beiral ≈ +10,40 m, base ≈ +5,68 m e viga creme ≈ +7,20 m. Fechamento branco e faixa translúcida superior; contraventamento em X.",
  },
  {
    id: "lanternim",
    name: "Lanternim elevado",
    group: "principal",
    point: [48, 9.8, 33.3],
    radius: 24,
    evidence: "estimado",
    sheets: "06, 07",
    dimensions: "≈ 33,90 × 6,20 m · +9,395 / ≈ +10,20 m",
    description:
      "Duas águas transversais, eólicos e faixas translúcidas. Galeria interna ≈ 2 × 1,40 m entre +7,80 e +9,20. Eólicos são símbolos, sem dimensões de fabricação.",
  },
  {
    id: "galeria",
    name: "Galeria treliçada",
    group: "transportes",
    point: [18.65, 0, -0.85],
    radius: 25,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: "≈ 1,70 × 37,30 m · altura ausente",
    description:
      "Contorno do D2 adotado. A folha 05 desenha uma extensão maior; comprimento explicitamente cotado na folha 06 tem prioridade.",
  },
  {
    id: "torre",
    name: "Torre / elevador",
    group: "transportes",
    point: [67.4, 0, -1.55],
    radius: 14,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: "≈ 2,80 × 2,50 m · altura ausente",
    description:
      "Implantação exterior a leste conforme folha 05. A folha 06 a representa junto ao lanternim; divergência pendente, sem duplicar a torre.",
  },
  {
    id: "transportador",
    name: "Transportador para o silo",
    group: "transportes",
    point: [36.65, 0, -27.3],
    radius: 35,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: "Traçado em projeção · níveis a confirmar",
    description:
      "Ligação gráfica entre a torre da Moega e o silo, conforme folha 05. Não há cota de seção, inclinação ou altura; representado como projeção tracejada.",
  },
  {
    id: "silo",
    name: "Silo metálico",
    group: "silo",
    point: [23, 0, -49.7],
    radius: 22,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: "Ø ≈ 21,00 m · altura ausente",
    description:
      "Centro S1 e cobertura cônica indicados. Contorno e geratrizes em planta; corpo, altura e inclinação do cone aguardam levantamento.",
  },
  ...DIM.auxiliaries.map((a): Sector => ({
    id: a.id,
    name: (
      {
        anexo: "Anexo leste",
        leste: "Edificação leste",
        norte: "Galpão norte",
        sul: "Galpão sul",
      } as Record<string, string>
    )[a.id]!,
    group: "auxiliares",
    point: [a.x + a.width / 2, 0, a.z + a.depth / 2],
    radius: Math.max(a.width, a.depth) * 0.8,
    evidence: "sem-cota",
    sheets: "05, 06",
    dimensions: `≈ ${a.width.toFixed(2).replace(".", ",")} × ${a.depth.toFixed(2).replace(".", ",")} m · altura ausente`,
    description: `Contorno e ${a.roof === "mono" ? "cobertura em uma água" : "cobertura em duas águas"} transcritos da planta. Implantação aproximada pela folha 05; sem extrusão vertical arbitrária.`,
  })),
];
export interface View {
  id: string;
  name: string;
  eye: Vec3;
  target: Vec3;
}
export const VIEWS: View[] = [
  { id: "geral", name: "Geral superior", eye: [-95, 116, -124], target: [37, 0, -13] },
  { id: "moega", name: "Moega 3", eye: [8, 26, -42], target: [45.8, 2.8, -9] },
  { id: "frontal", name: "Frontal da Moega", eye: [7, 7, -9.719], target: [45.8, 3, -9.719] },
  { id: "principal", name: "Galpão principal", eye: [-27, 46, 84], target: [31, 4, 20] },
  { id: "bloco", name: "Bloco alto", eye: [90, 32, -22], target: [51.8, 6, 5.5] },
  { id: "silo", name: "Silo e transportadores", eye: [-18, 53, -80], target: [30, 1, -31] },
];
export const ISSUES = [
  "Cobertura da Moega: 20,238 m na folha 02 versus 19,838 m no D1/06. Adotado D1, com 0,40 m apenas na empena externa e encosto no galpão.",
  "Moega: +4,365 m é o banzo inferior, não a borda da telha. A borda +4,030 m e cumeeira +6,925 m (folha 03) resultam em 25,17% sobre 11,50 m; ≈ 25% é arredondado.",
  "A posição da cabine e da torre/elevador diverge entre as pranchas. Foram adotados D1/06 para a cabine e 05 para a torre exterior. Não se duplicaram equipamentos.",
  "Alturas do silo, anexos, torres e galeria exterior e a profundidade do fosso não foram cotadas. São contornos/símbolos, sem escala vertical.",
  "Seções de perfis, barras da grelha, fixações, telhas e eólicos são representação visual, não dimensionamento estrutural ou quantitativo de fabricação.",
];
