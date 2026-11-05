// Reproducible review artifacts. Never imports client/customer document binaries.
import { writeFile } from "node:fs/promises";
import { cotrirosa as scene } from "../../src/features/nr/mapa/cotrirosa.server";
import { cotrirosaGeoreference as reference } from "../../src/features/nr/mapa/cotrirosa-georeference.server";
import type { Vec2 } from "../../src/features/nr/mapa/types";
const origin = reference.origin;
const geographic = ([x, z]: Vec2) => [
  origin.longitude + x / (111320 * Math.cos((origin.latitude * Math.PI) / 180)),
  origin.latitude - z / 110810,
];
const ring = (p: Vec2[]) => [...p, p[0]!].map(geographic);
const footprints = scene.buildings.map((b) => {
  const [x, , z] = b.position,
    [w, , d] = b.size,
    a = b.rotationY ?? 0;
  return {
    b,
    points: (
      [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ] as Vec2[]
    ).map(
      ([u, v]) =>
        [x + u * Math.cos(a) + v * Math.sin(a), z - u * Math.sin(a) + v * Math.cos(a)] as Vec2,
    ),
  };
});
const features = [
  {
    type: "Feature",
    properties: {
      name: "Perímetro de trabalho incluindo campo norte",
      nature: "Traçado visual aproximado; não cadastral",
      source: "Google Earth / Airbus 19/03/2026, consulta 05/11/2026",
      measuredAreaM2: reference.measuredAreaM2,
      measuredPerimeterM: reference.measuredPerimeterM,
    },
    geometry: { type: "Polygon", coordinates: [ring(scene.site.outline)] },
  },
  ...footprints.map(({ b, points }) => ({
    type: "Feature",
    properties: { name: b.name, sceneKey: b.key, source: b.note, heightApproxM: b.size[1] },
    geometry: { type: "Polygon", coordinates: [ring(points)] },
  })),
  ...scene.silos.map((s) => ({
    type: "Feature",
    properties: { name: s.aliases[0], sceneKey: s.key, source: s.source, note: s.note },
    geometry: { type: "Point", coordinates: geographic([s.position[0], s.position[2]]) },
  })),
  ...scene.site.roads.map((r) => ({
    type: "Feature",
    properties: {
      name: r.key,
      widthApproxM: r.width,
      nature: r.public ? "Via pública de contexto" : "Via interna aproximada",
    },
    geometry: { type: "LineString", coordinates: r.points.map(geographic) },
  })),
];
await writeFile(
  "docs/cotrirosa/implantacao.geojson",
  JSON.stringify({ type: "FeatureCollection", features }, null, 2),
);
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const kml = features
  .map((f) => {
    const g = f.geometry,
      coords = (p: number[][]) => p.map((v) => `${v[0]},${v[1]},0`).join(" ");
    const shape =
      g.type === "Polygon"
        ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(g.coordinates[0] as number[][])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
        : g.type === "Point"
          ? `<Point><coordinates>${coords([g.coordinates as number[]])}</coordinates></Point>`
          : `<LineString><coordinates>${coords(g.coordinates as number[][])}</coordinates></LineString>`;
    return `<Placemark><name>${escape(String(f.properties.name))}</name><description>Estimativa visual de trabalho. Não representa divisa cadastral nem certifica medidas externas.</description><styleUrl>#work</styleUrl>${shape}</Placemark>`;
  })
  .join("\n");
await writeFile(
  "docs/cotrirosa/implantacao.kml",
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cotrirosa · implantação visual de trabalho</name><Style id="work"><LineStyle><color>ff469ada</color><width>2</width></LineStyle><PolyStyle><color>3064a870</color></PolyStyle></Style>${kml}</Document></kml>`,
);
const points = (p: Vec2[]) => p.map((v) => v.join(",")).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -440 450 770" role="img" aria-label="Implantação de trabalho aproximada, norte para cima"><rect x="-130" y="-440" width="450" height="770" fill="#f3f1e7"/><defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#758975" stroke-opacity=".17" stroke-width=".5"/></pattern></defs><rect x="-130" y="-440" width="450" height="770" fill="url(#grid)"/><polygon points="${points(scene.site.outline)}" fill="#c7d4ae" stroke="#496541" stroke-dasharray="3 2" stroke-width="1.2"/>${scene.site.roads.map((r) => `<polyline points="${points(r.points)}" fill="none" stroke="#66706b" stroke-width="${r.width}" stroke-linejoin="round"/>`).join("")}${footprints.map(({ b, points: p }) => `<polygon points="${points(p)}" fill="${b.kind === "union" ? "#cc602d" : "#9ea9ac"}" stroke="#59655f" stroke-width=".6"/>`).join("")}${scene.silos.map((s, i) => `<circle cx="${s.position[0]}" cy="${s.position[2]}" r="${s.diameter / 2}" fill="#e3e4d7" stroke="#455344" stroke-width=".5"/><text x="${s.position[0] - 25}" y="${s.position[2] + 2}" font-size="4" fill="#223c2d">EC ${24 + i}</text>`).join("")}<g font-family="Arial" fill="#263c2e"><text x="-110" y="-410" font-size="10" font-weight="bold">COTRIROSA · IMPLANTAÇÃO DE TRABALHO</text><text x="-110" y="-395" font-size="5.5">Norte para cima · grade 50 m · estimativas em metros</text><text x="45" y="-260" font-size="8">Campo ao norte incluído</text><text x="45" y="-247" font-size="6">Perímetro visual total ≈ 11,6 ha</text><text x="110" y="-60" font-size="5">Galpão cinza</text><text x="100" y="46" font-size="6">Centro de Distribuição</text><text x="8" y="16" font-size="5">Fábrica Union</text><text x="80" y="185" font-size="7">Acesso</text><text x="170" y="156" font-size="6" transform="rotate(-45 170 156)">BR-472</text><text x="-110" y="290" font-size="6">Google Earth / Airbus 19/03/2026 + fotografias fornecidas</text><text x="-110" y="302" font-size="6">Não cadastral · cotas internas não são dimensões externas certificadas</text><path d="M260 -340 v-45 l-5 12 m5 -12 l5 12" stroke="#263c2e" stroke-width="1.5"/><text x="256" y="-393" font-size="9">N</text></g></svg>`;
await writeFile("docs/cotrirosa/implantacao.svg", svg);
const rows = scene.buildings
  .map(
    (b) =>
      `| ${b.key} | ${b.name} | ${b.position.map((v) => v.toFixed(1)).join(", ")} | ${b.size.map((v) => v.toFixed(1)).join(" × ")} | ${(((b.rotationY ?? 0) * 180) / Math.PI).toFixed(1)}° | ${b.note} |`,
  )
  .join("\n");
await writeFile(
  "docs/cotrirosa/posicoes.md",
  `# Transformações de implantação\n\nGerado de um único manifesto servidor. Origem: centro visual da cobertura SA 05. +X leste aproximado, +Z sul, +Y vertical. Valores externos e alturas são estimativas visuais, sem uso operacional.\n\n| Chave estável | Identidade | Posição X,Y,Z (m) | Largura × altura × profundidade (m) | Giro Y | Evidência e limite |\n|---|---|---|---|---|---|\n${rows}\n\nRecalibrar estas transformações não altera os UUIDs NR/PET. Câmeras reproduzíveis: normal, angular, unit, patio, aerial, facade, base e sa05 no mesmo manifesto.\n`,
);
console.log("GeoJSON, KML, planta SVG e matriz de transformações exportados.");
