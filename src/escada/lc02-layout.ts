/** LC-02, pp. 1–4. Metres; Y is height; ±0.00 is the departure datum.
 * Plan: departure → +Z → turn +X → door at Z=0. Unquoted sizes are visual assumptions.
 */
export type Point = [number, number, number];
export const LC02 = {
  width: 1.2,
  levels: [0, 3, 6],
  referenceEdgeX: 0,
  p1: [3, 0, 0] as Point,
  p2: [8, 0, 0] as Point,
  // Equal run chosen for representation, NOT measured from the unscaled PDF.
  illustrativeRun: 4.6,
  ground: -1.65,
  facadeZ: 0,
  source: "Escada_Layout_preliminar_para_aprovacao_LC02 (1).pdf",
} as const;

/** Rendering subdivisions only: the source PDF does not specify a final tread count. */
export const VISUAL_TREADS = 18;
export const FLIGHTS = [
  { start: [0.6, 0, -4.6] as Point, end: [0.6, 3, 0] as Point, axis: "z" },
  { start: [1.2, 3, 0.6] as Point, end: [5.8, 6, 0.6] as Point, axis: "x" },
] as const;
export function treadCenter(flight: number, index: number): Point {
  const f = FLIGHTS[flight]!;
  const run = LC02.illustrativeRun / VISUAL_TREADS;
  return [
    f.start[0] + (f.axis === "x" ? run * (index + 0.5) : 0),
    f.start[1] + (3 * (index + 1)) / VISUAL_TREADS,
    f.start[2] + (f.axis === "z" ? run * (index + 0.5) : 0),
  ];
}

export type ElementId =
  | "existing"
  | "new"
  | "flight1"
  | "intermediate"
  | "flight2"
  | "upper"
  | "door"
  | "building"
  | "p1"
  | "p2"
  | "rails"
  | "supports";
export type LayerId = "existing" | "stairs" | "landings" | "rails" | "supports" | "references";
export const LAYERS: { id: LayerId; name: string }[] = [
  { id: "existing", name: "Estrutura existente" },
  { id: "stairs", name: "Escada e degraus" },
  { id: "landings", name: "Patamares" },
  { id: "rails", name: "Guarda-corpos e corrimãos" },
  { id: "supports", name: "Apoios e diagonais" },
  { id: "references", name: "Pontos de referência" },
];
export const INITIAL_LAYERS: Record<LayerId, boolean> = {
  existing: true,
  stairs: true,
  landings: true,
  rails: true,
  supports: true,
  references: true,
};

export const ELEMENTS: {
  id: ElementId;
  label: string;
  short: string;
  position: Point;
  layer: LayerId;
  detail: string;
  level?: string;
}[] = [
  {
    id: "existing",
    label: "Patamar existente",
    short: "Existente",
    position: [-0.7, 0, -5.2],
    layer: "existing",
    level: "±0,00 m",
    detail:
      "Origem do acesso. O datum ±0,00 m é relativo a este piso; o terreno abaixo é apenas contexto visual das isométricas.",
  },
  {
    id: "new",
    label: "Novo patamar",
    short: "Novo patamar",
    position: [0.6, 0, -5.2],
    layer: "landings",
    level: "±0,00 m",
    detail:
      "Ao lado do existente, no mesmo nível. Inteiramente dentro do trecho de 3,00 m até o centro de P1.",
  },
  {
    id: "flight1",
    label: "Lance 1",
    short: "Lance 1",
    position: [0.6, 1.5, -2.3],
    layer: "stairs",
    detail:
      "Primeira subida, de ±0,00 m a +3,00 m. Largura útil de 1,20 m. Comprimento e repetição dos degraus são ilustrativos.",
  },
  {
    id: "intermediate",
    label: "Patamar intermediário",
    short: "Patamar +3,00 m",
    position: [0.6, 3, 0.6],
    layer: "landings",
    level: "+3,00 m",
    detail: "Mudança de direção entre os dois lances iguais, conforme a planta da página 4.",
  },
  {
    id: "flight2",
    label: "Lance 2",
    short: "Lance 2",
    position: [3.5, 4.5, 0.6],
    layer: "stairs",
    detail:
      "Segunda subida, de +3,00 m a +6,00 m. Mesmo desnível e mesmo comprimento ilustrativo do primeiro lance.",
  },
  {
    id: "upper",
    label: "Patamar superior único",
    short: "Patamar superior único",
    position: [7, 6, 0.6],
    layer: "landings",
    level: "+6,00 m",
    detail:
      "Uma plataforma contínua desde a chegada do lance 2 até a soleira da porta, sem degraus adicionais.",
  },
  {
    id: "door",
    label: "Porta de acesso",
    short: "Porta +6,00 m",
    position: [8.7, 6, 0.03],
    layer: "references",
    level: "+6,00 m",
    detail:
      "Soleira no nível +6,00 m. A abertura e o volume da edificação são representações de contexto, sem dimensões executivas.",
  },
  {
    id: "building",
    label: "Edificação existente",
    short: "Edificação existente",
    position: [7, 6.8, -2.4],
    layer: "existing",
    detail:
      "Fechamento corrugado e cobertura inclinada preservados em contexto. O percurso permanece fora do volume; folgas reais dependem de conferência em campo.",
  },
  {
    id: "p1",
    label: "P1",
    short: "P1",
    position: [3, -1.05, 0.02],
    layer: "references",
    detail:
      "Centro a 3,00 m da lateral de saída do patamar existente. Referência de locação, não especificação de perfil ou fundação.",
  },
  {
    id: "p2",
    label: "P2",
    short: "P2",
    position: [8, -1.05, 0.02],
    layer: "references",
    detail:
      "Centro a 5,00 m de P1. Bases e vinculações indicam apenas a concepção visual das páginas 2 e 3.",
  },
  {
    id: "rails",
    label: "Guarda-corpos e corrimãos",
    short: "Guarda-corpo / corrimão",
    position: [4.2, 5.8, 1.25],
    layer: "rails",
    detail:
      "Proteções amarelas acompanham os lances e contornam os patamares, mantendo livres as passagens. Alturas e seções apenas ilustrativas.",
  },
  {
    id: "supports",
    label: "Apoios e diagonais",
    short: "Apoios e diagonais",
    position: [5.2, 1.7, 1.35],
    layer: "supports",
    detail:
      "Pilares metálicos, diagonais, bases e ligação com a edificação seguem a leitura das isométricas. Sem cálculo, perfis normatizados, chumbadores ou soldas especificados.",
  },
];
export const ROUTE_STEPS: ElementId[] = [
  "existing",
  "new",
  "flight1",
  "intermediate",
  "flight2",
  "upper",
  "door",
];
export const PATH: Point[] = [
  [-0.7, 0.045, -5.2],
  [0.6, 0.045, -5.2],
  [0.6, 0.045, -4.6],
  [0.6, 3.045, 0],
  [0.6, 3.045, 0.6],
  [1.2, 3.045, 0.6],
  [5.8, 6.045, 0.6],
  [8.7, 6.045, 0.6],
  [8.7, 6.045, 0],
];

export const VIEWS = [
  { id: "iso", name: "Isométrica", position: [-10, 10, 15] as Point, target: [4, 3, -1] as Point },
  {
    id: "opposite",
    name: "Lado oposto",
    position: [16, 10, -15] as Point,
    target: [4, 3, -1] as Point,
  },
  {
    id: "front",
    name: "Frontal",
    position: [4.5, 3.8, 23] as Point,
    target: [4.5, 3.3, 0] as Point,
  },
  {
    id: "side",
    name: "Lateral",
    position: [-20, 4.8, -1.7] as Point,
    target: [3, 3.2, -1.7] as Point,
  },
  {
    id: "top",
    name: "Superior",
    position: [4.4, 28, -1.2] as Point,
    target: [4.4, 2, -1.7] as Point,
  },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];
