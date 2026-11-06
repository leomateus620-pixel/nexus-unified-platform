// Reproducible vector approximation of confirmed facade marks, not official artwork.
// Reference: user attachment 6 (05/11/2026). Barlow OFL font already bundled in Nexus.
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const font = fontkit.create(readFileSync("src/features/pet/assets/fonts/Barlow-SemiBold.ttf"));
function word(text, x, baseline, width, height, color = "#f4f4ef") {
  const run = font.layout(text),
    total = run.positions.reduce((s, p) => s + p.xAdvance, 0);
  let cursor = 0;
  const paths = run.glyphs
    .map((g, i) => {
      const path = `<path d="${g.path.toSVG()}" transform="translate(${cursor},0)"/>`;
      cursor += run.positions[i].xAdvance;
      return path;
    })
    .join("");
  return `<g fill="${color}" transform="translate(${x},${baseline}) scale(${width / total},${-height / 700})">${paths}</g>`;
}
const wrapper = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="280" viewBox="0 0 600 280"><!-- Approximate vector facade reconstruction from attachment 6; not an official brand master. -->${content}</svg>`;
mkdirSync("src/features/nr/mapa/assets", { recursive: true });
writeFileSync(
  "src/features/nr/mapa/assets/union-facade.svg",
  wrapper(
    `<path fill="#00633e" d="M320 6C297 38 269 63 289 88L321 114L350 86C369 64 341 38 320 6Z"/><path fill="#003d2a" d="M321 17L321 104L299 65L302 61L318 88L319 33Z"/>` +
      word("Rações", 34, 139, 135, 28) +
      word("Union", 28, 263, 544, 115),
  ),
);
writeFileSync(
  "src/features/nr/mapa/assets/cotrirosa-facade.svg",
  wrapper(
    `<path fill="#007342" d="M61 46L89 91L66 130L39 86Z"/><path fill="#005033" d="M33 99L68 101L89 139L8 139Z"/><path fill="#138a47" d="M86 103L112 146L86 146L65 109Z"/>` +
      word("Nutrição Animal", 139, 69, 304, 31) +
      word("Cotrirosa", 125, 150, 458, 70) +
      word("NUTRIÇÃO COM RESULTADOS", 145, 184, 371, 18),
  ),
);
console.log("Facade contours generated; proportions remain photo-derived.");
