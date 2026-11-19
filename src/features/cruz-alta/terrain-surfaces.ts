import type { GroundPoint } from "./scene-types";
import { sheetToGround } from "./registro";

export type GroundCover =
  | "lavoura"
  | "campo"
  | "solo"
  | "saibro"
  | "concretoDique"
  | "pisoMineral"
  | "concreto"
  | "asfalto"
  | "lastro"
  | "mata"
  | "agua"
  | "urbano";
export interface GroundPatch {
  surface: GroundCover;
  footprint: GroundPoint[];
  /** Bordas duras de pavimentação ou irregulares quando o limite é vegetado. */
  soft?: boolean;
}

function wide(surface: GroundCover, p: GroundPoint[], soft = false): GroundPatch {
  return {
    surface,
    soft,
    footprint: p.map(([x, y]) => [
      ((x * 1792) / 1200 - 932.5170014426112) * 1.047965343635514,
      ((y * 1536) / 1029 - 967.9787659868598) * 1.047965343635514,
    ]),
  };
}
function sheet(surface: GroundCover, p: GroundPoint[], soft = false): GroundPatch {
  return { surface, soft, footprint: p.map(sheetToGround) };
}

// Polígonos interpretados para visualização. Perímetro patrimonial indisponível.
// Dique claro no vídeo (150 s), piso e borda visíveis junto ao corpo norte 6.
export const northReservoirBund = (
  [
    [139, 350],
    [199, 330],
    [229, 402],
    [158, 426],
  ] as GroundPoint[]
).map(sheetToGround);
export const groundPatches: GroundPatch[] = [
  wide(
    "lavoura",
    [
      [-280, -30],
      [255, -22],
      [158, 146],
      [-190, 530],
    ],
    true,
  ),
  wide(
    "campo",
    [
      [12, 461],
      [110, 118],
      [158, 152],
      [37, 432],
    ],
    true,
  ),
  wide(
    "lavoura",
    [
      [264, -20],
      [584, 150],
      [382, 241],
      [314, 220],
    ],
    true,
  ),
  wide(
    "lavoura",
    [
      [52, 469],
      [171, 207],
      [241, 51],
      [282, 207],
      [321, 255],
      [163, 332],
    ],
    true,
  ),
  wide(
    "lavoura",
    [
      [-100, 571],
      [53, 416],
      [361, 277],
      [462, 424],
      [510, 458],
      [457, 519],
      [301, 490],
      [246, 597],
      [124, 658],
    ],
    true,
  ),
  wide(
    "campo",
    [
      [75, 717],
      [243, 632],
      [329, 669],
      [483, 643],
      [471, 751],
      [417, 766],
      [270, 749],
      [191, 702],
      [126, 732],
    ],
    true,
  ),
  wide(
    "campo",
    [
      [799, 208],
      [864, 229],
      [846, 343],
      [898, 382],
      [851, 398],
      [771, 342],
    ],
    true,
  ),
  wide(
    "campo",
    [
      [870, 480],
      [992, 493],
      [1017, 635],
      [1103, 650],
      [1101, 896],
      [878, 851],
    ],
    true,
  ),
  wide(
    "lavoura",
    [
      [877, 866],
      [1099, 904],
      [1103, 1007],
      [1174, 1080],
      [933, 1090],
      [869, 940],
    ],
    true,
  ),
  wide(
    "lavoura",
    [
      [713, 882],
      [863, 953],
      [994, 1076],
      [700, 1090],
    ],
    true,
  ),
  wide(
    "urbano",
    [
      [771, -80],
      [1340, -80],
      [1326, 636],
      [1062, 652],
      [1006, 528],
      [951, 478],
      [973, 424],
      [880, 363],
      [875, 234],
      [780, 202],
    ],
    true,
  ),
  // Chão aparente da implantação, incluindo pátios de tráfego. Rótulos de titularidade não fazem parte da malha.
  sheet(
    "saibro",
    [
      [39, 446],
      [89, 406],
      [106, 222],
      [177, 173],
      [255, 149],
      [286, 62],
      [369, 39],
      [722, 29],
      [949, 41],
      [1061, 67],
      [1142, 145],
      [1215, 218],
      [1240, 329],
      [1254, 617],
      [1220, 763],
      [1070, 818],
      [892, 799],
      [713, 711],
      [602, 742],
      [510, 787],
      [423, 869],
      [335, 862],
      [195, 817],
      [41, 792],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [193, 202],
      [284, 124],
      [308, 106],
      [449, 100],
      [593, 50],
      [732, 38],
      [719, 119],
      [608, 164],
      [521, 197],
      [456, 150],
      [395, 165],
      [291, 237],
      [246, 302],
      [224, 332],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [517, 187],
      [687, 124],
      [702, 172],
      [618, 217],
      [591, 250],
      [550, 264],
      [511, 242],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [865, 44],
      [1031, 53],
      [1113, 102],
      [1172, 163],
      [1223, 225],
      [1229, 352],
      [1199, 375],
      [1106, 326],
      [1042, 273],
      [969, 231],
      [891, 228],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [917, 252],
      [1019, 229],
      [1084, 218],
      [1154, 200],
      [1196, 266],
      [1201, 331],
      [1110, 359],
      [1062, 382],
      [1013, 354],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [878, 273],
      [906, 246],
      [948, 242],
      [967, 248],
      [950, 264],
      [915, 275],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [931, 409],
      [1071, 365],
      [1146, 345],
      [1155, 353],
      [1063, 381],
      [928, 424],
    ],
    true,
  ),
  sheet("concreto", [
    [112, 198],
    [185, 189],
    [211, 301],
    [129, 324],
  ]),
  { surface: "concretoDique", footprint: northReservoirBund },
  sheet("concreto", [
    [621, 140],
    [686, 114],
    [708, 173],
    [669, 188],
    [638, 182],
  ]),
  sheet("concreto", [
    [708, 101],
    [845, 59],
    [860, 119],
    [746, 156],
    [725, 164],
  ]),
  sheet("concreto", [
    [646, 540],
    [710, 521],
    [725, 568],
    [663, 588],
  ]),
  sheet("asfalto", [
    [79, 621],
    [214, 577],
    [351, 538],
    [470, 501],
    [477, 508],
    [347, 549],
    [219, 591],
    [81, 635],
  ]),
  sheet(
    "asfalto",
    [
      [128, 743],
      [316, 691],
      [477, 646],
      [538, 631],
      [548, 640],
      [486, 663],
      [325, 709],
      [139, 758],
    ],
    true,
  ),
  sheet("asfalto", [
    [543, 696],
    [622, 677],
    [736, 696],
    [933, 733],
    [1090, 759],
    [1092, 773],
    [933, 749],
    [730, 712],
    [625, 692],
    [561, 707],
  ]),
  sheet(
    "campo",
    [
      [38, 660],
      [60, 650],
      [102, 642],
      [94, 687],
      [72, 705],
      [66, 750],
      [40, 761],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [295, 787],
      [360, 764],
      [409, 758],
      [488, 717],
      [529, 710],
      [490, 800],
      [466, 842],
      [361, 846],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [1086, 554],
      [1188, 530],
      [1241, 514],
      [1244, 655],
      [1219, 702],
      [1170, 688],
      [1140, 649],
      [1090, 616],
    ],
    true,
  ),
];

// Silhuetas baixas ao longo da rua oeste, transcritas da ortoimagem z18.
// Descrições e propriedade continuam externas ao cadastro técnico da unidade.
const houses = [
  [463, 270, 8, 6],
  [465, 250, 8, 6],
  [470, 239, 9, 7],
  [461, 287, 8, 7],
  [458, 300, 9, 6],
  [451, 331, 8, 7],
  [452, 347, 7, 6],
  [446, 365, 9, 6],
  [444, 382, 8, 6],
  [438, 399, 8, 7],
  [435, 418, 7, 5],
  [433, 433, 8, 7],
  [430, 458, 8, 7],
  [420, 473, 8, 6],
] as const;
export const roadsideMasses = houses.map(([u, v, w, l]) => ({
  x: ((u * 1536) / 1029 - 841.0340028852224) * 0.523982671817757,
  z: ((v * 1792) / 1200 - 911.9575319737196) * 0.523982671817757,
  width: w,
  length: l,
}));

// Divisões visíveis nos pátios em 24/08 e nas DJI 44/196. A superfície cinzenta
// junto às balanças tem acabamento mineral. Sua composição construtiva está pendente.
export const yardPatches: GroundPatch[] = [
  sheet(
    "saibro",
    [
      [123, 735],
      [301, 682],
      [320, 675],
      [311, 713],
      [318, 746],
      [281, 767],
      [205, 779],
      [98, 757],
    ],
    true,
  ),
  sheet(
    "pisoMineral",
    [
      [315, 678],
      [342, 674],
      [355, 689],
      [555, 626],
      [573, 636],
      [547, 682],
      [520, 706],
      [453, 727],
      [388, 746],
      [335, 758],
      [317, 741],
      [308, 718],
    ],
    true,
  ),
  sheet(
    "saibro",
    [
      [677, 582],
      [913, 518],
      [947, 569],
      [959, 660],
      [937, 701],
      [915, 728],
      [699, 682],
      [676, 657],
    ],
    true,
  ),
  sheet(
    "saibro",
    [
      [988, 549],
      [1146, 496],
      [1231, 471],
      [1231, 703],
      [1186, 715],
      [1104, 742],
      [978, 716],
      [940, 703],
      [966, 671],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [45, 547],
      [108, 553],
      [123, 587],
      [105, 604],
      [62, 604],
      [39, 594],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [40, 682],
      [72, 674],
      [125, 655],
      [133, 716],
      [117, 738],
      [77, 748],
      [41, 756],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [870, 431],
      [1017, 388],
      [1091, 366],
      [1082, 384],
      [983, 413],
      [910, 439],
    ],
    true,
  ),
  sheet(
    "solo",
    [
      [988, 226],
      [1082, 194],
      [1176, 250],
      [1200, 312],
      [1189, 373],
      [1155, 386],
      [1140, 330],
      [1110, 288],
      [1083, 250],
      [1039, 245],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [898, 251],
      [973, 234],
      [1002, 239],
      [996, 258],
      [973, 265],
      [954, 255],
      [904, 272],
    ],
    true,
  ),
  sheet(
    "campo",
    [
      [328, 757],
      [382, 742],
      [473, 712],
      [504, 714],
      [464, 745],
      [441, 778],
      [417, 801],
      [375, 810],
      [349, 796],
    ],
    true,
  ),
];
// Distintas descontinuidades de acabamento no pátio e bordas dos diques. Unidades: metros locais.
export const finishLines = [
  {
    type: "giro",
    points: [
      [792, 677],
      [786, 663],
      [788, 646],
      [794, 627],
      [810, 610],
      [830, 600],
      [856, 596],
    ],
  },
  {
    type: "giro",
    points: [
      [797, 677],
      [792, 660],
      [795, 644],
      [801, 629],
      [819, 612],
      [840, 605],
      [862, 603],
    ],
  },
  {
    type: "transicao",
    points: [
      [317, 679],
      [310, 701],
      [311, 718],
      [317, 742],
      [332, 755],
    ],
  },
  {
    type: "transicao",
    points: [
      [693, 683],
      [777, 704],
      [907, 732],
      [1018, 753],
      [1092, 772],
    ],
  },
  {
    type: "dique",
    points: [
      [122, 326],
      [207, 302],
      [191, 205],
    ],
  },
  {
    type: "dique",
    points: [
      [151, 421],
      [223, 403],
      [207, 326],
    ],
  },
  {
    type: "dique",
    points: [
      [653, 142],
      [684, 132],
      [698, 171],
      [662, 183],
    ],
  },
].map((entry) => ({ ...entry, points: (entry.points as GroundPoint[]).map(sheetToGround) }));
