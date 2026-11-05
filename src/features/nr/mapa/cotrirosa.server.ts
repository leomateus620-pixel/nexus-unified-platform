import type { SceneManifest, Vec2, Vec3 } from "./types";
import {
  cotrirosaGeoreference,
  workPerimeter,
  geographicToScene,
} from "./cotrirosa-georeference.server";
/** Single calibration source. Pixel controls refer to the user's second aerial image
 * (WhatsApp 05/11/2026 01:53:38, 900x1600). 0.46 m/px reconciled with Earth
 * manual roof-edge measurements; no cadastral or certified external dimensions.
 * Origin = SA05 centre; +X image right, +Z image down, +Y up. */
const scale = cotrirosaGeoreference.imageMetersPerPixel;
const xy = (u: number, v: number): Vec2 => [(u - 298) * scale, (v - 866) * scale];
const xyz = (u: number, v: number, y = 0): Vec3 =>
  [...xy(u, v).slice(0, 1), y, xy(u, v)[1]] as Vec3;
const polygon = (points: number[][]): Vec2[] => points.map((p) => xy(p[0]!, p[1]!));
// Close-up Earth / Airbus 19/03/2026, read on 05/11. Gate and junction were
// located with "Mais informações". Other entrance controls are visual offsets
// from that same frame (27.1422 degree heading, about 0.317 m per pixel).
const entrance = geographicToScene(-(27 + 50 / 60 + 3.23 / 3600), -(54 + 25 / 60 + 45.56 / 3600));
const junctionCenter = geographicToScene(
  -(27 + 50 / 60 + 5.72 / 3600),
  -(54 + 25 / 60 + 45.49 / 3600),
);
const entryPoint = (u: number, v: number): Vec2 => {
  const x = (u - 742) * 0.317,
    z = (v - 124) * 0.317,
    a = (27.1422 * Math.PI) / 180;
  return [
    entrance[0] + x * Math.cos(a) - z * Math.sin(a),
    entrance[1] + x * Math.sin(a) + z * Math.cos(a),
  ];
};
const entryPolygon = (p: number[][]) => p.map(([u, v]) => entryPoint(u!, v!));
const entryPosition = (u: number, v: number): Vec3 => {
  const [x, z] = entryPoint(u, v);
  return [x, 0, z];
};
const highwayBearing = (45 * Math.PI) / 180;
const highwayPoint = (distance: number): Vec2 => [
  junctionCenter[0] + Math.sin(highwayBearing) * distance,
  junctionCenter[1] - Math.cos(highwayBearing) * distance,
];
// Roof controls read on the dated Earth imagery take precedence over the
// supplied aerial's approximate pixel fit. Heights and unobserved depth remain estimates.
function roofFromEarth(nw: Vec2, ne: Vec2, depth: number, height: number) {
  const dx = ne[0] - nw[0],
    dz = ne[1] - nw[1],
    width = Math.hypot(dx, dz),
    across: Vec2 = [-dz / width, dx / width],
    position: Vec3 = [
      (nw[0] + ne[0]) / 2 + (across[0] * depth) / 2,
      0,
      (nw[1] + ne[1]) / 2 + (across[1] * depth) / 2,
    ];
  return { position, size: [width, height, depth] as Vec3, rotationY: -Math.atan2(dz, dx) };
}
const cdRoof = roofFromEarth(
  geographicToScene(-27.8329111111, -54.4292055556),
  geographicToScene(-27.832875, -54.4284083333),
  61.64,
  15,
);
const northRoof = roofFromEarth(
  geographicToScene(-27.8320444444, -54.4293194444),
  geographicToScene(-27.832, -54.4286777778),
  44.27,
  11,
);
function footprint(roof: typeof cdRoof, pad: number): Vec2[] {
  const [w, , d] = roof.size,
    a = roof.rotationY,
    [x, , z] = roof.position;
  return [
    [-w / 2 - pad, -d / 2 - pad],
    [w / 2 + pad, -d / 2 - pad],
    [w / 2 + pad, d / 2 + pad],
    [-w / 2 - pad, d / 2 + pad],
  ].map(([u, v]) => [
    x + u! * Math.cos(a) + v! * Math.sin(a),
    z - u! * Math.sin(a) + v! * Math.cos(a),
  ]);
}
const building = (
  key: string,
  name: string,
  u: number,
  v: number,
  w: number,
  h: number,
  d: number,
  kind: SceneManifest["buildings"][number]["kind"],
  note: string,
) => ({ key, name, position: xyz(u, v), size: [w * scale, h, d * scale] as Vec3, kind, note });
export const cotrirosa: SceneManifest = {
  key: "cotrirosa-racao-santa-rosa-v1",
  version: 4,
  unit: "6a454dcc-82b2-4506-aca3-410a3cc820f2",
  units: "m",
  bounds: { min: [-66, -30, -380], max: [225, 36, 265] },
  site: {
    outline: workPerimeter,
    surfaces: [
      {
        key: "patio-fabrica",
        kind: "blocks",
        outline: polygon([
          [264, 766],
          [395, 765],
          [411, 797],
          [421, 916],
          [273, 920],
          [259, 883],
        ]),
      },
      {
        key: "ilha-silos",
        kind: "grass",
        outline: polygon([
          [281, 777],
          [309, 777],
          [315, 882],
          [281, 887],
        ]),
      },
      {
        key: "patio-cd",
        kind: "concrete",
        outline: footprint(cdRoof, 2.4),
      },
      {
        key: "patio-galpao-traseiro",
        kind: "asphalt",
        outline: polygon([
          [449, 667],
          [614, 669],
          [638, 800],
          [450, 813],
        ]),
      },
      {
        key: "transicao-entre-galpoes",
        kind: "asphalt",
        outline: polygon([
          [450, 808],
          [637, 801],
          [674, 864],
          [656, 898],
          [454, 898],
        ]),
      },
      {
        key: "patio-edificio-frontal",
        kind: "concrete",
        outline: polygon([
          [273, 961],
          [403, 963],
          [414, 1050],
          [274, 1057],
        ]),
      },
      {
        key: "area-terra-norte",
        kind: "soil",
        outline: polygon([
          [236, 564],
          [395, 568],
          [401, 725],
          [342, 732],
          [284, 717],
          [252, 686],
        ]),
      },
      {
        key: "apoio-norte",
        kind: "concrete",
        outline: polygon([
          [274, 671],
          [322, 674],
          [325, 729],
          [274, 729],
        ]),
      },
      {
        key: "estacionamento",
        kind: "asphalt",
        outline: [
          [-33, 2],
          [-3.7, 2],
          [-3.7, 32],
          [-15, 35],
          [-40, 17],
        ].map(([x, z]) => [entrance[0] + x!, entrance[1] + z!] as Vec2),
      },
      {
        key: "passeio-recepcao",
        kind: "concrete",
        outline: entryPolygon([
          [585, 140],
          [638, 110],
          [680, 177],
          [624, 207],
        ]),
      },
      {
        key: "lavoura-oeste",
        kind: "field",
        outline: polygon([
          [-600, 0],
          [130, 100],
          [156, 790],
          [103, 1000],
          [-600, 700],
        ]),
      },
      {
        key: "lavoura-leste",
        kind: "field",
        outline: polygon([
          [730, 400],
          [1250, 100],
          [1300, 900],
          [712, 870],
        ]),
      },
    ],
    roads: [
      {
        key: "eixo-principal",
        width: 8.5,
        points: [
          ...polygon([
            [422, 590],
            [424, 718],
            [432, 905],
            [441, 1100],
          ]),
          entryPoint(706, 61),
          entrance,
          entryPoint(772, 180),
          entryPoint(798, 230),
          entryPoint(792, 296),
          entryPoint(788, 336),
        ],
      },
      {
        key: "circuito-oeste",
        width: 7,
        points: polygon([
          [425, 741],
          [331, 742],
          [260, 754],
          [246, 786],
          [250, 919],
          [255, 1030],
          [270, 1074],
          [360, 1076],
          [441, 1072],
        ]),
      },
      {
        key: "travessa-fabrica",
        width: 7,
        points: polygon([
          [252, 934],
          [324, 931],
          [426, 926],
        ]),
      },
      {
        key: "acesso-galpao-norte",
        width: 6.5,
        points: polygon([
          [426, 650],
          [493, 639],
          [594, 641],
          [617, 660],
          [625, 728],
          [627, 801],
        ]),
      },
      {
        key: "rodovia-nordeste",
        width: 10,
        public: true,
        points: [-300, -90, 0, 90, 370].map(highwayPoint),
      },
      {
        key: "via-publica-oeste",
        width: 7,
        public: true,
        points: [
          ...polygon([
            [-90, 818],
            [130, 1034],
            [249, 1156],
          ]),
          entryPoint(604, 249),
          entryPoint(706, 276),
          entryPoint(773, 305),
          entryPoint(788, 336),
        ],
      },
      {
        key: "estrada-rural-oeste",
        width: 6,
        public: true,
        points: polygon([
          [425, -50],
          [416, 143],
          [329, 294],
          [230, 440],
          [202, 629],
          [175, 879],
          [143, 1022],
        ]),
      },
    ],
    junction: {
      center: junctionCenter,
      radius: 26,
      islandRadius: 20,
      highwayHalfWidth: 5,
      bearing: highwayBearing,
    },
    landmarkTrees: [
      { position: entryPoint(650, 130), height: 12 },
      { position: entryPoint(692, 153), height: 7.5 },
      ...Array.from({ length: 30 }, (_, i) => ({
        position: entryPoint(580 + i * 4.5, 232 - i * 2.5),
        height: 3.2,
      })),
      ...Array.from({ length: 32 }, (_, i) => ({
        position: entryPoint(600 + i * 4.4, 246 + i * 1.2),
        height: 4.6,
      })),
      ...[
        [384, 174],
        [440, 194],
        [491, 210],
        [540, 224],
      ].map(([u, v]) => ({ position: entryPoint(u!, v!), height: 6.5 })),
    ],
    fences: [
      [...workPerimeter.slice(0, 7)],
      [...workPerimeter.slice(9), workPerimeter[0]!],
      [workPerimeter[6]!, workPerimeter[7]!],
      [workPerimeter[8]!, workPerimeter[9]!],
    ],
    vegetation: [
      [
        [45, -380],
        [74, -380],
        [20, -278],
        [-33, -210],
        [-45, -130],
        [-58, -145],
        [-45, -240],
      ],
      [
        [144, -350],
        [180, -320],
        [201, -255],
        [196, -160],
        [182, -164],
        [175, -247],
        [155, -310],
      ],
      polygon([
        [25, 925],
        [125, 1030],
        [215, 1125],
        [238, 1210],
        [158, 1175],
        [-20, 1030],
      ]),
      polygon([
        [655, 225],
        [753, 381],
        [804, 645],
        [717, 772],
        [665, 713],
        [621, 425],
      ]),
      polygon([
        [669, 825],
        [711, 824],
        [759, 927],
        [691, 1011],
      ]),
      entryPolygon([
        [580, 232],
        [715, 156],
        [727, 165],
        [604, 245],
      ]),
      entryPolygon([
        [600, 246],
        [742, 285],
        [736, 304],
        [590, 261],
      ]),
      polygon([
        [198, 542],
        [228, 541],
        [218, 937],
        [181, 957],
      ]),
    ],
    gate: entrance,
  },
  silos: [
    ...["sa01", "sa02", "sa03", "sa04"].map((key, i) => ({
      key,
      position: xyz(296, 793 + i * 16),
      diameter: 6,
      straight: 6.6,
      cone: 3.6,
      clearance: 3.1,
      roof: 1.1,
      aliases: [`SA 0${i + 1}`, `S0${i + 1}`],
      source: `Levantamento B07, cotas internas conferidas no cadastro do servidor em 05/11/2026; PDF fotos p. 3–${6 + i}.`,
      note: "Apoios, cobertura, espaçamento e ordem espacial aproximados. Confirmar TAG física antes de operar.",
    })),
    {
      key: "sa05",
      position: xyz(298, 866),
      diameter: 9.6,
      straight: 16.5,
      cone: 4.11,
      clearance: 3.1,
      roof: 1.3,
      aliases: ["SA 05", "AS 05"],
      source: "EC 28 · B07 e cadastro conferido em 05/11/2026; PDF fotos p. 10–13.",
      note: "Diâmetro interpretado por decisão técnica; medição a laser pendente. Cotas internas, não certificam dimensão externa. Legenda Nexus: 31 min; placa transcrita no PDF p. 13: 34 min. Conferir fontes; nenhum valor preenche PET.",
    },
  ],
  buildings: [
    building(
      "union-torre",
      "Fábrica de Ração · Rações Union",
      358,
      835,
      34,
      27,
      68,
      "union",
      "Identidade visual da fachada real. Cobertura verde observada na nova aérea; paredes laranja pela foto frontal. Dimensões externas aproximadas.",
    ),
    building(
      "union-medio",
      "Fábrica de Ração",
      332,
      817,
      42,
      17,
      65,
      "union",
      "Volume intermediário contíguo à torre, recalibrado pela aérea e fachada.",
    ),
    building(
      "union-baixo",
      "Fábrica de Ração",
      344,
      879,
      72,
      9,
      33,
      "union",
      "Volume frontal baixo; marquises e base clara pela foto frontal.",
    ),
    {
      ...building(
        "distribuicao",
        "Centro de Distribuição Cotrirosa",
        559,
        966,
        170.65,
        15,
        134,
        "distribution",
        "Inscrição confirmada na aérea oblíqua. Quinas norte, largura e giro da cobertura pelo Earth de 19/03/2026; profundidade e altura aproximadas.",
      ),
      ...cdRoof,
    },
    {
      ...building(
        "galpao-cinza",
        "Galpão cinza",
        526,
        736,
        138,
        11,
        96.3,
        "shed",
        "Grande galpão ao norte do CD. Três quinas da cobertura conferidas no Earth de 19/03/2026; função documental e altura pendentes.",
      ),
      ...northRoof,
    },
    building(
      "edificio-frontal",
      "Edificação cinza escalonada",
      342,
      999,
      109,
      7.5,
      54,
      "warehouse",
      "Construção ao sul da fábrica, do mesmo lado do eixo interno. Identificação funcional pendente.",
    ),
    building(
      "galpao-verde",
      "Galpão verde",
      299,
      700,
      34,
      6.5,
      53,
      "green-shed",
      "Edificação observada atrás da bateria. Função e acervo não atribuídos.",
    ),
    building(
      "apoio-norte",
      "Apoio ao norte",
      545,
      615,
      32,
      4,
      28,
      "support",
      "Pequeno volume visível na aérea; uso específico não comprovado.",
    ),
    {
      ...building(
        "apoio-entrada",
        "Recepção da unidade",
        374,
        1171,
        38,
        4,
        37,
        "support",
        "Atendimento na entrada identificado pelo usuário. Posição pela imagem Earth; altura, portas e acabamento aproximados.",
      ),
      position: entryPosition(631, 158),
      size: [16.5, 3.6, 19.2],
      rotationY: 0.045,
    },
    {
      ...building(
        "marquise-entrada",
        "Marquise do acesso",
        435,
        1182,
        31,
        4.5,
        15,
        "canopy",
        "Portaria coberta sobre a via, conferida no Earth. Pilares e altura aproximados.",
      ),
      position: entryPosition(742, 124),
      size: [18, 4.8, 5.3],
    },
    building(
      "apoio-lateral",
      "Apoio lateral",
      216,
      937,
      23,
      3.5,
      23,
      "support",
      "Pequena construção observada junto à via lateral.",
    ),
    building(
      "apoio-cd",
      "Apoio junto ao CD",
      490,
      1141,
      23,
      3.5,
      20,
      "support",
      "Pequeno volume a leste da via principal. Uso pendente.",
    ),
  ],
  cameras: {
    normal: { position: [-95, 125, 285], target: [58, 6, 12], fov: 43 },
    unit: { position: [-190, 405, 580], target: [74, 0, -65], fov: 43 },
    angular: { position: [-140, 155, 245], target: [48, 5, 22], fov: 43 },
    patio: { position: [-14, 2.1, -48], target: [1, 11, -13], fov: 66 },
    aerial: { position: [-28, 115, 310], target: [58, 6, 26], fov: 47 },
    facade: { position: [10, 3.5, 43], target: [17, 13, -6], fov: 50 },
    base: { position: [-8, 1.7, -39], target: [-1, 5, -31], fov: 55 },
    sa05: { position: [-14, 9.8, 11], target: [-3, 8.1, 0], fov: 46 },
    junction: { position: [15, 126, 292], target: [77, 8, 213], fov: 48 },
    arrival: { position: [77, 11, 207], target: [69, 9, 154], fov: 54 },
  },
  provenance: [
    "Implantação reconciliada com Google Earth / Airbus, imagem de 19/03/2026, consulta de 05/11/2026. Referência fornecida: 27°49′57,31″ S, 54°25′46,96″ W. Controles da aérea ajustados a aproximadamente 0,46 m/pixel; dimensões externas estimadas.",
    "Perímetro de trabalho inclui o campo ao norte, conforme solicitado: aproximadamente 11,6 ha e 1,42 km medidos por traçado visual de 14 vértices. Não comprova divisa, posse ou área cadastral. Trechos de cerca não visíveis são representação aproximada do perímetro de trabalho.",
    "Cobertura do CD: largura aproximada 78,5 m; galpão ao norte: aproximadamente 63,4 × 44,3 m; primeiro silo pequeno ao centro do SA 05: aproximadamente 33,3 m. Leituras manuais no Earth; bordas de telhado não equivalem a paredes ou medidas certificadas.",
    "Chegada revista pelo detalhe do Earth de março de 2026 e anexo do usuário: retorno circular atravessado pela rodovia, com dois canteiros, alças e ligação lateral à portaria. Centro visual 27°50′05,72″ S / 54°25′45,49″ W; cobertura da portaria 27°50′03,23″ S / 54°25′45,56″ W; distância visual aproximada 76,5 m. Raios e larguras são estimativas visuais, não projeto viário. Casa lateral identificada pelo usuário como recepção; árvore frontal e faixa verde posicionadas pela imagem.",
    "Fotografias reais: pátio, aérea com CD identificado e fachada Union; PDF de 20 páginas compilado em 04/11/2026.",
    "Dimensões dos corpos: B07 e cadastro consultados em 05/11/2026. Não equivalem a levantamento externo certificado, capacidade ou parâmetros de trabalho.",
    "Sem planta identificada: terreno, distâncias, níveis e posições são aproximações recalibráveis. Não representa divisa cadastral.",
    "Moega EC 29 e elevadores EC 23/30 permanecem no inventário: sua posição externa não está comprovada.",
    "Anexos 3–4 do briefing inicial não foram usados como planta. A nova aérea orienta posições relativas; fachada real prevalece para cor e identificação. Datas e limites físicos precisam de conferência de campo.",
  ],
};
