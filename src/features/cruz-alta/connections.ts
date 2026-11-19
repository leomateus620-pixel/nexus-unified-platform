import { sheetToGround } from "./registro";
import type { CruzObject, CruzPart, GroundPoint } from "./scene-types";

const tower = "estrutura-torre-silos-sul",
  battery = "estrutura-galeria-silos-sul",
  crossing = "estrutura-galeria-transversal";
export const galleryObjects: CruzObject[] = [
  {
    id: tower,
    kind: "estrutura",
    parent: "setor-armazenagem",
    name: "Torre junto à bateria sul",
    aliases: ["elevador", "torre", "silos"],
    related: [battery],
    note: "Designação descritiva. O encontro com a galeria aparece no layout rev. 56, folha 1. Base, altura e fechamento superiores estimados; detalhamento e função dependem da planta do equipamento e de corte cotado.",
  },
  {
    id: battery,
    related: [tower, "silo-sul-1", "silo-sul-2", "silo-sul-3", "silo-sul-4"],
    kind: "estrutura",
    parent: "setor-armazenagem",
    name: "Galeria da bateria sul",
    aliases: ["galeria", "silos", "transportador"],
    note: "Designação descritiva. A fotografia da folha 1, rev. 56, mostra o eixo sobre os quatro silos e o encontro com a torre. A projeção acompanha os centros corrigidos da bateria. Largura, seção da treliça e nível são estimativas visuais. Conferir no corte longitudinal do transportador e no levantamento das bases.",
  },
  {
    id: crossing,
    kind: "estrutura",
    parent: "setor-armazenagem",
    name: "Galeria transversal",
    aliases: ["travessia", "ferrovia", "transportador"],
    note: "Designação descritiva. O eixo elevado é visível na folha 1, rev. 56, e nas fotografias panorâmicas de fevereiro. Altura e seção são estimativas para leitura volumétrica. Para conferir extremidades, vãos e níveis, obter planta de bases e corte longitudinal.",
  },
];
function gallery(
  id: string,
  start: GroundPoint,
  end: GroundPoint,
  width: number,
  deck: number,
): CruzPart {
  const a = sheetToGround(start),
    b = sheetToGround(end);
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz);
  const w: GroundPoint = [((-dz / length) * width) / 2, ((dx / length) * width) / 2];
  const corner = (p: GroundPoint, sign: number): GroundPoint => [
    p[0] + w[0] * sign,
    p[1] + w[1] * sign,
  ];
  return {
    id,
    footprint: [corner(a, 1), corner(b, 1), corner(b, -1), corner(a, -1)],
    axis: [dx / length, dz / length],
    base: deck,
    eave: deck + 1.8,
    rise: 0.12,
    roof: "gable",
    layer: "equipamentos",
    bracing: "gallery",
  };
}
const towerFootprint = (
  [
    [916, 506],
    [926, 503],
    [929, 514],
    [919, 517],
  ] as GroundPoint[]
).map((p) => sheetToGround(p));
export const galleryParts: CruzPart[] = [
  {
    id: tower,
    layer: "equipamentos",
    footprint: towerFootprint,
    base: 0,
    eave: 25.8,
    rise: 0,
    roof: "flat",
    bracing: "tower",
  },
  {
    id: tower,
    layer: "equipamentos",
    footprint: towerFootprint,
    base: 25.8,
    eave: 28.1,
    rise: 0.35,
    roof: "gable",
  },
  gallery(battery, [920, 510], [1192, 426], 1.8, 24.2),
  gallery(crossing, [524, 324], [620, 428], 1.6, 15.1),
  gallery(crossing, [620, 428], [652, 540], 1.6, 15.1),
];
