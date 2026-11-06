import { writeFileSync } from "node:fs";
import { cotrirosa } from "../../src/features/nr/mapa/cotrirosa.server";
import {
  sa05Access,
  sa05Connections,
  SA05_REFERENCE,
} from "../../src/features/nr/mapa/sa05-access";
const silo = cotrirosa.silos.find((s) => s.key === "sa05")!;
const a = sa05Access(silo),
  tower = sa05Connections(silo);
const p = (x: number, z: number) => `${180 + x * 18},${290 + z * 18}`;
const path = a.segments.flatMap((s) =>
  Array.from({ length: 12 }, (_, i) => a.point(s.from + ((s.to - s.from) * i) / 11, s.low)),
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760"><rect width="1000" height="760" fill="#f5f5eb"/><style>text{font:15px sans-serif;fill:#203d32}</style><text x="25" y="30">SA 05 / EC 28 · planta local em metros · +Y vertical · aproximação visual</text>${cotrirosa.buildings
  .filter((b) => b.kind === "union")
  .map(
    (b) =>
      `<rect x="${180 + (b.position[0] - b.size[0] / 2) * 18}" y="${290 + (b.position[2] - b.size[2] / 2) * 18}" width="${b.size[0] * 18}" height="${b.size[2] * 18}" fill="#e37d37" stroke="#155b3b"/><text x="${180 + b.position[0] * 18}" y="${290 + b.position[2] * 18}">${b.key}</text>`,
  )
  .join(
    "",
  )}<circle cx="180" cy="290" r="86.4" fill="#c6d1d3" stroke="#61777b"/><polyline points="${path.map((v) => p(v[0], v[2])).join(" ")}" stroke="#bd8207" stroke-width="18" fill="none"/><line x1="180" y1="290" x2="${180 - 22 * 4}" y2="${290 + 62 * 4}" stroke="#5c82b3" stroke-dasharray="6 5"/>${[
  ["Início 170.6° / 7.36m", a.lower],
  ["Frente +Z", a.front],
  ["Fim 17.2° / 23.79m", a.upper],
  ["Escotilha preservada", a.hatch],
]
  .map(
    ([label, v]) =>
      `<circle cx="${180 + v[0] * 18}" cy="${290 + v[2] * 18}" r="5" fill="#15462c"/><text x="${190 + v[0] * 18}" y="${285 + v[2] * 18}">${label}</text>`,
  )
  .join(
    "",
  )}<rect x="${180 + (tower.origin[0] - 0.7) * 18}" y="${290 + (tower.origin[2] - 0.7) * 18}" width="25.2" height="25.2" fill="#325b7c"/><line x1="${180 + tower.towerSocket[0] * 18}" y1="${290 + tower.towerSocket[2] * 18}" x2="180" y2="290" stroke="#738289" stroke-width="7"/><text x="25" y="700">Arco percorre a frente (+Z), da esquerda para a direita no anexo 5.</text><text x="25" y="725">Torre e fachadas usam a implantação existente. Apoios ocultos e dimensões do acesso dependem de campo.</text></svg>`;
writeFileSync("docs/cotrirosa/visual-local/access-plan.svg", svg);
writeFileSync(
  "docs/cotrirosa/visual-local/access-controls.json",
  JSON.stringify(
    { reference: SA05_REFERENCE, center: silo.position, access: a, connections: tower },
    null,
    2,
  ),
);
console.log("Planta e pontos locais exportados.");
