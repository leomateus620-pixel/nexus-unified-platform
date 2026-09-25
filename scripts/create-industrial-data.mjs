import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = process.cwd();
const out = path.join(root, "src/industrial/data");
const existingSite = path.join(out, "site.json");
if (
  fs.existsSync(existingSite) &&
  JSON.parse(fs.readFileSync(existingSite, "utf8")).cadRegistration
) {
  throw new Error(
    "Bootstrap interrompido: site.json contém integração CAD. Use scripts/cad/integrate-site.mjs; o cadastro e a base existentes não podem ser substituídos pelo bootstrap fotográfico.",
  );
}
fs.mkdirSync(out, { recursive: true });
// Photo B ground anchors, hand traced. Pixel coordinates are NOT an orthophoto.
const origin = [616, 539];
const scale = 0.16;
const point = ([x, z], y = 0) => [
  +((x - origin[0]) * scale).toFixed(3),
  y,
  +((z - origin[1]) * scale).toFixed(3),
];
const polygon = (ps) =>
  ps.map((p) => {
    const v = point(p);
    return [v[0], v[2]];
  });
const elements = [];
const add = (
  id,
  name,
  category,
  p,
  geometry,
  photos,
  description,
  functionStatus = "unknown",
  assumptions = [],
  pending = [],
) => {
  const e = {
    id,
    name,
    category,
    photos,
    position: point(p),
    rotation: [0, 0, 0],
    geometry,
    existence: "visible",
    dimensionStatus: "estimated",
    functionStatus,
    description,
    assumptions,
    pending: ["Medidas independentes e identificação em campo.", ...pending],
  };
  elements.push(e);
  return e;
};
[
  [550, 475],
  [680, 475],
  [550, 603],
  [680, 603],
].forEach((p, i) =>
  add(
    `SILO-0${i + 1}`,
    `Silo ${String(i + 1).padStart(2, "0")}`,
    "silos",
    p,
    {
      radius: 8.8,
      bodyHeight: 17.6,
      coneHeight: 3.8,
      baseHeight: 0.35,
      topHeight: 1.65,
      segments: 96,
    },
    ["A", "B", "C", "D"],
    "Corpo de chapas com anéis horizontais, montantes, cobertura cônica e coroamento. Numeração provisória.",
    "visible",
    [
      "Diâmetro de 17,6 unidades adotado apenas como escala visual; quatro corpos inicialmente iguais.",
      "A Foto D comprova detalhes de dois silos visíveis, mas não permite vincular sua numeração.",
    ],
    ["Confirmar diferenças entre os quatro silos e correspondência exata da Foto D."],
  ),
);
add(
  "EQ-01",
  "Conjunto central de elevação",
  "equipment",
  [615, 545],
  { height: 34, width: 1.4, depth: 1.5 },
  ["A", "B", "C", "D"],
  "Estruturas verticais distintas, tubos inclinados conectados aos quatro topos e plataformas amarelas.",
  "probable",
  ["Seções e alturas estimadas; carenagens não revelam o processo interno."],
);
add(
  "EQ-02",
  "Ligação elevada com o galpão",
  "equipment",
  [615, 700],
  { height: 24, span: 36 },
  ["A", "B", "C"],
  "Estrutura elevada longitudinal apoiada junto ao galpão; carenagem e suportes visíveis.",
  "probable",
  ["Tipo operacional e conexões ocultas permanecem desconhecidos."],
);
add(
  "ED-01",
  "Galpão adjacente",
  "buildings",
  [612, 706],
  { width: 27.2, depth: 17.2, height: 6.5, rise: 1.8, roof: "gable" },
  ["A", "B", "C"],
  "Galpão com cobertura em duas águas, fachadas metálicas e acessos aparentes.",
  "unknown",
  ["Portas reproduzidas somente nas fachadas visíveis; sem interiores."],
);
add(
  "ED-02",
  "Edificação superior 01",
  "buildings",
  [256, 246],
  { width: 11, depth: 10.6, height: 3.4, rise: 0.65, roof: "flat" },
  ["A", "B", "C"],
  "Volume superior esquerdo, com composição de cobertura em níveis.",
);
add(
  "ED-03",
  "Edificação superior 02",
  "buildings",
  [264, 328],
  { width: 7.5, depth: 11.2, height: 3.3, rise: 0.65, roof: "flat" },
  ["A", "B", "C"],
  "Segundo volume do setor superior esquerdo. Função não confirmada.",
);
add(
  "ED-04",
  "Edificação lateral",
  "buildings",
  [984, 503],
  { width: 10.2, depth: 13, height: 3.5, rise: 1, roof: "hip" },
  ["A", "B", "C"],
  "Edificação junto à faixa longitudinal de concreto e ao canteiro de palmeiras.",
);
add(
  "PV-01",
  "Faixa de provável pesagem",
  "terrain",
  [936, 503],
  { width: 3.2, depth: 24, height: 0.18 },
  ["A", "B", "C"],
  "Faixa pavimentada alongada. A identificação como balança é uma hipótese.",
  "probable",
  ["Limites exatos, mecanismos e operação não confirmados."],
);
add(
  "ED-05",
  "Edificação inferior direita",
  "buildings",
  [932, 855],
  { width: 11.8, depth: 11.6, height: 3.7, rise: 0.9, roof: "gable" },
  ["A", "B", "C"],
  "Volume periférico próximo ao elemento circular, com cobertura clara.",
);
add(
  "EQ-03",
  "Elemento circular",
  "equipment",
  [923, 800],
  { radius: 2.35, height: 2.2 },
  ["A", "B", "C"],
  "Forma cilíndrica aparente, provisoriamente descrita como possível reservatório.",
  "probable",
  ["Conteúdo, uso e conexões não confirmados."],
);
add(
  "TR-01",
  "Pátio de circulação",
  "terrain",
  [760, 710],
  { material: "agregado mineral aparente" },
  ["A", "B", "C"],
  "Pátio cinza com transições para solo avermelhado e áreas amplas de manobra.",
  "visible",
);
add(
  "TR-02",
  "Acesso externo superior",
  "terrain",
  [700, 134],
  { width: 7.2 },
  ["A", "B", "C"],
  "Ligação pela parte superior da Foto B, distinta da circulação interna e da rodovia.",
  "visible",
);
add(
  "TR-03",
  "Rodovia lateral",
  "terrain",
  [1267, 550],
  { width: 9.8 },
  ["A", "B", "C"],
  "Pista externa contínua à direita da Foto B. Orientação geográfica desconhecida.",
  "visible",
);
add(
  "VG-01",
  "Alinhamentos de palmeiras",
  "vegetation",
  [1110, 570],
  { seed: 31028 },
  ["A", "B", "C", "D"],
  "Palmeiras ornamentais da faixa lateral e do canteiro da edificação.",
  "visible",
  ["Espécies não identificadas; altura e frondes estimadas."],
);
add(
  "VG-02",
  "Árvores e vegetação periférica",
  "vegetation",
  [272, 577],
  { seed: 31028 },
  ["A", "B", "C", "D"],
  "Copas densas à esquerda, alinhamentos podados e faixas ajardinadas.",
  "visible",
);
add(
  "CE-01",
  "Cercamento externo visível",
  "fences",
  [900, 936],
  { height: 1.45 },
  ["A", "B", "C", "D"],
  "Trechos com postes e fios/tela. Não representa divisa jurídica.",
  "unknown",
  ["Tipo de malha não resolvido em todos os trechos."],
);
add(
  "CE-02",
  "Subdivisões e portões",
  "fences",
  [731, 243],
  { height: 1.5 },
  ["A", "B", "C"],
  "Subdivisão do acesso superior, portões e cercamento interno visível.",
);
const yard = polygon([
  [360, 420],
  [450, 380],
  [752, 383],
  [796, 403],
  [871, 383],
  [891, 330],
  [857, 302],
  [426, 292],
  [389, 275],
  [376, 241],
  [398, 205],
  [444, 204],
  [943, 212],
  [1002, 247],
  [1041, 288],
  [1041, 416],
  [1003, 424],
  [985, 443],
  [946, 424],
  [927, 440],
  [926, 555],
  [947, 591],
  [986, 653],
  [1004, 751],
  [993, 790],
  [1014, 881],
  [987, 905],
  [423, 895],
  [354, 869],
  [325, 817],
  [337, 714],
  [333, 523],
]);
const islands = [
  polygon([
    [336, 298],
    [435, 297],
    [794, 301],
    [862, 315],
    [874, 330],
    [862, 347],
    [784, 354],
    [442, 365],
    [339, 380],
  ]),
  polygon([
    [436, 405],
    [727, 400],
    [761, 442],
    [807, 534],
    [770, 624],
    [727, 641],
    [462, 642],
    [426, 615],
    [413, 473],
  ]),
  polygon([
    [938, 426],
    [914, 429],
    [892, 450],
    [880, 481],
    [880, 533],
    [900, 561],
    [927, 575],
    [929, 439],
  ]),
];
const fences = [
  {
    id: "CE-01",
    points: polygon([
      [197, 384],
      [197, 931],
      [1080, 947],
      [1079, 211],
      [464, 207],
    ]),
    type: "wire",
  },
  {
    id: "CE-01",
    points: polygon([
      [198, 383],
      [198, 164],
      [365, 164],
      [377, 205],
    ]),
    type: "wire",
  },
  {
    id: "CE-02",
    points: polygon([
      [338, 293],
      [730, 293],
      [730, 270],
    ]),
    type: "wire",
  },
  {
    id: "CE-02",
    points: polygon([
      [730, 233],
      [730, 207],
    ]),
    type: "gate",
  },
  {
    id: "CE-02",
    points: polygon([
      [730, 234],
      [730, 269],
    ]),
    type: "gate-open",
  },
];
const trees = [];
function tree(x, z, type, height, variant = 0) {
  trees.push({
    position: point([x, z]),
    type,
    height,
    variant,
    rotation: +((trees.length * 2.399) % (Math.PI * 2)).toFixed(6),
    id: type === "palm" ? "VG-01" : "VG-02",
  });
}
// Anchored groups rather than unrestricted procedural scattering.
for (let j = 0; j < 16; j++) {
  const z = 205 + j * 45;
  tree(1118 + (j % 3) * 7, z, "palm", 7 + (j % 4) * 0.65, j % 3);
}
[
  [894, 468],
  [894, 501],
  [894, 539],
  [970, 590],
  [1026, 586],
  [1009, 632],
  [1003, 711],
  [1110, 872],
  [1089, 842],
].forEach((p, i) => tree(...p, "palm", 5.4 + (i % 3), i % 3));
for (let j = 0; j < 22; j++)
  tree(440 + j * 25, 202 + (j % 3) * 3, "trimmed", 3.2 + (j % 3) * 0.3, j % 3);
for (let j = 0; j < 25; j++)
  tree(
    380 + j * 24,
    j >= 21 ? 903 : 894 + (j % 2) * 4,
    j >= 21 ? "trimmed" : "dense",
    j >= 21 ? 1.8 : 4.1 + (j % 4) * 0.5,
    j % 3,
  );
for (let j = 0; j < 21; j++)
  tree(
    392 + j * 23,
    350 + (j % 3) * 4,
    j % 5 === 0 ? "pruned" : "trimmed",
    4.3 + (j % 4) * 0.35,
    j % 3,
  );
for (let j = 0; j < 14; j++) tree(435 + j * 22, 290, "trimmed", 2.2 + (j % 2) * 0.2, j % 3);
[
  [240, 173],
  [287, 173],
  [331, 185],
  [325, 245],
  [321, 301],
  [288, 377],
  [243, 386],
  [199, 402],
  [330, 401],
  [271, 415],
  [322, 452],
  [238, 493],
  [298, 535],
  [246, 550],
  [202, 587],
  [285, 602],
  [236, 635],
  [271, 662],
  [307, 680],
  [248, 712],
  [306, 749],
  [282, 797],
  [205, 347],
  [230, 755],
  [1001, 409],
  [1055, 366],
  [1049, 326],
  [1058, 277],
  [995, 692],
  [1198, 933],
].forEach((p, i) => tree(...p, "dense", 6.4 + (i % 5) * 0.7, i % 3));
for (let j = 0; j < 16; j++) tree(1316 + (j % 3) * 7, -80 + j * 80, "dense", 8 + (j % 3), j % 3);
const cameras = {
  overview: { position: [99, 119, 164], target: [5, 2, 0], fov: 43, label: "Visão geral" },
  A: { position: [22, 150, 181], target: [8, 0, -2], fov: 43, label: "Foto A · aérea oblíqua" },
  B: {
    position: [17.28, 250, 0.641],
    target: [17.28, 0, 0.64],
    fov: 43,
    orthographic: true,
    span: 173.76,
    label: "Foto B · implantação",
  },
  C: { position: [-23, 142, -186], target: [10, 1, 2], fov: 43, label: "Foto C · lado oposto" },
  D: { position: [7, 1.7, -68], target: [0, 11, 0], fov: 62, label: "Foto D · nível do solo" },
  walk: { position: [37, 1.7, 40], target: [0, 10, 0], fov: 62, label: "Passeio" },
};
const data = {
  version: 1,
  calibration: {
    status: "estimated",
    metersPerUnit: 1,
    unitLabel: "metro estimado",
    source: "Hipótese de diâmetro externo de 17,6 m, sem medida de campo. Não calibrado.",
    originPhotoB: origin,
    approximateUnitsPerPixel: scale,
    axes: { x: "direita da Foto B", y: "vertical", z: "baixo da Foto B" },
    groundPlane: "Plano conservador; altimetria desconhecida.",
    measurementEnabled: false,
  },
  elements,
  terrain: {
    site: polygon([
      [190, 155],
      [1190, 155],
      [1190, 947],
      [190, 931],
    ]),
    yard,
    islands,
    access: polygon([
      [400, 242],
      [398, 178],
      [437, 140],
      [1139, 139],
      [1193, 129],
      [1248, 121],
    ]),
    highwayX: point([1267, 0])[0],
    fences,
  },
  trees,
  cameras,
};
fs.writeFileSync(path.join(out, "site.json"), JSON.stringify(data, null, 2) + "\n");
fs.mkdirSync("public/references/3tentos", { recursive: true });
const names = [
  "DE8CBDEB-B80D-4584-A99F-C44956F484E3.png",
  "24C7F9DF-9669-47D7-93CF-C97B1812BE16.png",
  "6E762B60-F347-4E7B-AC1A-8ABEFB1B01EB.png",
  "90E869D1-CF44-4CDA-9BF7-C09E199A23B0.png",
];
// Originals are optional inputs on a fresh checkout; already supplied copies are retained.
const source = process.argv[2];
const refs = names.map((name, i) => {
  const dest = path.join("public/references/3tentos", name);
  if (source) fs.copyFileSync(path.join(source, name), dest);
  return {
    id: "ABCD"[i],
    originalName: name,
    url: `/references/3tentos/${name}`,
    sha256: fs.existsSync(dest)
      ? crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex")
      : null,
    rights:
      "Fotografia fornecida pelo usuário para esta reconstrução; autoria/licença de redistribuição ampla não informadas.",
  };
});
fs.writeFileSync(path.join(out, "references.json"), JSON.stringify(refs, null, 2) + "\n");
console.log(
  `Wrote ${elements.length} records, ${trees.length} anchored plants and four reference cameras.`,
);
