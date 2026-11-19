import { outerContext } from "./entorno";
import { galleryObjects, galleryParts } from "./connections";
import type { CruzArea, CruzLine, CruzObject, CruzPart, GroundPoint } from "./scene-types";
import { photoCorners, sheetToGround } from "./registro";
import { surveyItems } from "./linhas";
import { roofs } from "./tracados";

export { photoCorners };
export const objects: CruzObject[] = [];
export const geometry: CruzPart[] = [];
export const lifelines: CruzLine[] = [];
export const context: CruzArea[] = [...outerContext];
const groups = [
  [
    "armazenagem",
    "Armazenagem",
    [
      ["armazem-01", "Armazém 01", "11 56"],
      ["armazem-02", "Armazém 02", "12 65"],
      ["farelo", "Armazém Farelo", "02 61"],
      ["casca", "Armazém Casca", "03 04 05 06 46 53"],
      ["fibra", "Fibra vegetal", "13 17"],
      ["barracao", "Barracão", "57 57.1"],
    ],
  ],
  ["preparacao", "Preparação", [["preparacao", "Torre da Preparação", "27 27.1 28 28.1"]]],
  [
    "extracao",
    "Extração e biodiesel",
    [
      ["extracao", "Extração", "29 29.1 30 31 64"],
      ["biodiesel", "Biodiesel", "32"],
      ["tanques", "Tanques da extração", "33 34 36"],
      ["diesel", "Tanque diesel", "37"],
    ],
  ],
  [
    "caldeiras",
    "Caldeiras",
    [
      ["caldeira-35", "Caldeira nova 35 t", "16 35"],
      ["caldeira-20", "Caldeira 20 t", "09 10 62"],
      ["cavaco", "Cavaco", "08"],
      ["predio-caldeira", "Prédio atrás da caldeira", "38"],
    ],
  ],
  [
    "recebimento",
    "Recebimento e expedição",
    [
      ["carregamento", "Carregamento rodoviário", "01 42 43"],
      ["expedicao-graos", "Expedição ferroviária de grãos", "18 19 54"],
      ["expedicao-casca", "Expedição ferroviária de casca", "20 44 45"],
      ["moegas-01-02", "Moegas 01 e 02", "14 15 63 66 67 68 69"],
      ["moega-nova", "Moega nova", "58"],
      ["supervisorio-novo", "Supervisório do recebimento novo", "39 39.1"],
      ["plataforma", "Plataformas de carregamento 01 e 02", "26"],
      ["balanca-nova", "Balança nova", "40 59"],
      ["abastecimento", "Abastecimento", "60"],
    ],
  ],
  [
    "utilidades",
    "Manutenção e utilidades",
    [
      ["manutencao", "Manutenção", "07"],
      ["manutencao-ar", "Manutenção AR", "55"],
      ["substacao-qgbt", "Subestação e QGBT", "21"],
      ["brigada", "Brigada de incêndio", "22"],
      ["sub-preparacao-23", "Subestação Preparação · laje 23", "23"],
      ["sub-preparacao-48", "Subestação Preparação · laje 48", "48"],
      ["subestacao", "Subestação", "41 49"],
      ["supervisorio", "Supervisório", "25"],
      ["terceiros", "Barracão terceiros", "47"],
    ],
  ],
  [
    "administracao",
    "Administração e balança",
    [
      ["sala-gerencia", "Sala da gerência", "24"],
      ["treinamento", "Sala de treinamento", "50"],
      ["administrativo", "Administrativo", "51"],
      ["balanca", "Balança", "52"],
    ],
  ],
] as const;
const notes: Record<string, string> = {
  "06": "O quadro da revisão 56 registra quatro linhas e 172 m. A descrição herdada diz seis unidades. O conjunto mostra quatro percursos nos pés de dois lanternins.",
  "11": "O conjunto 11/56 identifica cobertura em arco e vão estimado em 28,80 m. A posição e o comprimento do galpão provêm da imagem.",
  "56": "Divergência de comprimento da LVHF. A individual e o conjunto 11/56 indicam 13,20 m estimados. O quadro do layout 56 indica 15 m. Conferir a revisão aplicável antes de usar a medida.",
  "20": "Fora do projeto LVHF na revisão 56. Coberturas da expedição de casca visíveis. Posição individual do 20 pendente.",
  "28.1":
    "Introduzida no layout 47. Cobertura elevada de duas águas sobre pilares no alinhamento do 28. O conjunto de Preparação estima o nível em 12 m.",
  "39.1":
    "Aprovação registrada na revisão 49 do layout. Situação da instalação na revisão 56: a montar.",
  "62": "O conjunto 09/10/62 indica 12 m de LVHF e o quadro geral registra 15 m. O desenho posiciona 62 em frente ao 09 e perpendicular a ele.",
};
for (const [sector, sectorName, structures] of groups) {
  objects.push({ id: `setor-${sector}`, name: sectorName, kind: "setor" });
  for (const [building, name, codes] of structures) {
    const parent = `estrutura-${building}`;
    objects.push({
      id: parent,
      name,
      kind: "estrutura",
      parent: `setor-${sector}`,
      note: "Implantação interpretada na fotografia de 24/08/2026. Para comprovar pé-direito e níveis, obter corte transversal cotado com piso, beiral e cumeeira desta estrutura.",
    });
    for (const code of codes.split(" ")) {
      const row = surveyItems.find((candidate) => candidate.code === code)!;
      const id = `cobertura-${code}`;
      const note = [
        notes[code],
        row.approximate ? "O layout marca a posição como aproximada." : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      objects.push({
        id,
        kind: "componente",
        parent,
        name: row.name,
        aliases: [code, `Telhado ${code}`],
        ...(note ? { note } : {}),
      });
      objects.push({
        id: `lvhf-${code}`,
        kind: "lvhf",
        parent: id,
        code,
        name: `LVHF ${code} · ${row.name}`,
        status: row.status,
        ...(note ? { note } : {}),
      });
      for (const path of row.paths) {
        lifelines.push({
          id: `lvhf-${code}`,
          points: path.map(sheetToGround),
          status: row.status.startsWith("Montada") ? "montada" : "a-montar",
        });
      }
    }
  }
}
objects.push({
  id: "lvhf-29.2",
  kind: "lvhf",
  parent: "estrutura-extracao",
  code: "29.2",
  name: "LVHF 29.2 · Telhado extração",
  status: "Retirada",
  note: "Presente na revisão 43, retirada na revisão 44. A prancha individual permanece no histórico.",
});

for (const roof of roofs) {
  const footprint = roof.boundary.map(sheetToGround);
  const start = footprint[0]!,
    end = footprint[1]!;
  let dx = end[0] - start[0],
    dz = end[1] - start[1];
  if (roof.item === "28.1") [dx, dz] = [-dz, dx];
  const length = Math.hypot(dx, dz) * (roof.reverse ? -1 : 1);
  geometry.push({
    id: `cobertura-${roof.item}`,
    footprint,
    roof: roof.shape,
    eave: roof.eave,
    rise: roof.rise,
    ...(roof.base != null ? { base: roof.base } : {}),
    axis: [dx / length, dz / length],
    ...(roof.parapet ? { parapet: roof.parapet } : {}),
  });
}

// Centros de base interpretados. A elipse da borda superior e a sombra estão deslocadas na foto oblíqua.
function cylinder(
  id: string,
  name: string,
  sector: string,
  centre: GroundPoint,
  radius: number,
  roof: "silo" | "tank",
  eave: number,
  rise: number,
) {
  const footprint = Array.from({ length: 32 }, (_, i) =>
    sheetToGround([
      centre[0] + radius * Math.cos((2 * Math.PI * i) / 32),
      centre[1] + radius * Math.sin((2 * Math.PI * i) / 32),
    ]),
  );
  geometry.push({ id, footprint, roof, eave, rise, layer: "equipamentos" });
  objects.push({
    id,
    name,
    kind: "estrutura",
    parent: `setor-${sector}`,
    note: "Identificação visual provisória. Centro e diâmetro interpretados pelo contorno da base. Perfil mostrado por silhueta. Confirmar por planta e corte cadastral do equipamento. Conteúdo e capacidade pendentes.",
  });
}
const siloBases: GroundPoint[] = [
  [980, 491],
  [1050, 469],
  [1121, 447],
  [1191, 425],
];
siloBases.forEach((centre, i) =>
  cylinder(
    `silo-sul-${i + 1}`,
    `Silo da bateria sul · corpo ${i + 1}`,
    "armazenagem",
    centre,
    31,
    "silo",
    18.5,
    5.5,
  ),
);
const northTanks: Array<[number, number, number]> = [
  [136, 214, 16],
  [146, 247, 15],
  [159, 281, 16],
  [181, 228, 11],
  [193, 261, 11],
  [185, 372, 24],
];
northTanks.forEach(([x, y, r], i) =>
  cylinder(
    `reservatorio-norte-${i + 1}`,
    `Reservatório da faixa norte · corpo ${i + 1}`,
    "extracao",
    [x, y],
    r,
    "tank",
    r < 20 ? 6 : 9,
    0.6,
  ),
);
const centralTanks: Array<[number, number, number]> = [
  [647, 142, 10],
  [670, 136, 9],
  [687, 130, 8],
  [650, 163, 8],
  [670, 159, 10],
  [687, 151, 7],
];
centralTanks.forEach(([x, y, r], i) =>
  cylinder(
    `reservatorio-central-${i + 1}`,
    `Reservatório do núcleo · corpo ${i + 1}`,
    "extracao",
    [x, y],
    r,
    "tank",
    5.5,
    0.4,
  ),
);

function area(kind: CruzArea["kind"], polygon: GroundPoint[], mass?: CruzArea["mass"]) {
  context.push({ kind, footprint: polygon.map(sheetToGround), ...(mass ? { mass } : {}) });
}
// Faixa escura entre as naves. Os eixos convergem perto do término ao sul.
// Coordenadas do aço e do lastro foram lidas com a foto girada no sentido dos trilhos.
area("ferrovia", [
  [38, 646],
  [1062, 339],
  [1064, 344],
  [40, 651],
]);
area("ferrovia", [
  [38, 660],
  [1062, 353],
  [1064, 358],
  [40, 665],
]);
area("via", [
  [38, 759],
  [143, 783],
  [286, 804],
  [420, 839],
  [531, 900],
  [510, 905],
  [414, 853],
  [278, 821],
  [144, 802],
  [38, 781],
]);
area("via", [
  [113, 431],
  [202, 404],
  [327, 378],
  [375, 367],
  [377, 375],
  [330, 390],
  [205, 414],
  [116, 445],
]);
area("patio", [
  [689, 582],
  [899, 524],
  [933, 553],
  [947, 619],
  [925, 668],
  [883, 708],
  [737, 679],
]);
area("patio", [
  [1075, 540],
  [1218, 498],
  [1219, 695],
  [1109, 715],
  [1058, 689],
]);
area("vegetacao", [
  [24, 25],
  [278, 21],
  [283, 81],
  [297, 126],
  [265, 168],
  [205, 188],
  [120, 216],
  [95, 354],
  [42, 422],
  [17, 394],
]);
area("vegetacao", [
  [955, 28],
  [1239, 16],
  [1241, 256],
  [1205, 211],
  [1173, 157],
  [1112, 94],
  [1052, 65],
]);
area("vegetacao", [
  [284, 791],
  [376, 757],
  [446, 750],
  [511, 706],
  [535, 716],
  [480, 814],
  [420, 851],
  [355, 837],
]);
// Continued forms west of the yard are geographic context, pending cadastral ownership.
area(
  "vizinhanca",
  [
    [127, 674],
    [309, 620],
    [325, 679],
    [143, 732],
  ],
  { roof: "gable", eave: 5.8, rise: 1.9 },
);
area(
  "vizinhanca",
  [
    [622, 687],
    [684, 714],
    [611, 906],
    [530, 906],
  ],
  { roof: "arc", eave: 7.5, rise: 3.6 },
);
area(
  "vizinhanca",
  [
    [910, 755],
    [1051, 778],
    [1029, 901],
    [854, 901],
  ],
  { roof: "arc", eave: 7.2, rise: 3.4 },
);
for (const [x, y, r] of [
  [737, 755, 18],
  [781, 765, 17],
  [824, 779, 17],
] as const) {
  area(
    "vizinhanca",
    Array.from({ length: 24 }, (_, i): GroundPoint => [
      x + r * Math.cos((i * Math.PI) / 12),
      y + r * Math.sin((i * Math.PI) / 12),
    ]),
  );
}

objects.push(...galleryObjects);
geometry.push(...galleryParts);
