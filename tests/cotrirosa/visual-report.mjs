// Sanitized report + private local gallery. Never uploads the supplied photographs.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
const dir = "docs/cotrirosa/visual-local";
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const before = await json(`${dir}/before-performance.json`),
  after = await json(`${dir}/verified-performance.json`);
const ui = await json(`${dir}/visual-ui-results.json`),
  demo = await json("docs/cotrirosa/demo-ui-report.json"),
  resilience = await json("docs/cotrirosa/demo-resilience-report.json"),
  db = await json("docs/cotrirosa/demo-db-report.json");
const preview =
  "http://127.0.0.1:4197/nr-33/mapa-3d?cliente=9d6dfbe8-285a-44e5-9ea1-2574daa7cb28&unidade=6a454dcc-82b2-4506-aca3-410a3cc820f2&camera=normal";
const report = {
  dateLocal: "2026-11-05",
  originalCheckout: "dbe4560d3fc4c5e8eaab3e4b16b0c35d72ddb2a9",
  executionBase: "9cc9603e42c4930c6d7df5986c176aac5b1ea635",
  branch: "codex/cotrirosa-visual-quality",
  preview,
  environment:
    "Compiled Cotrirosa SQL laboratory; real Nexus components/routes/domain RPCs, isolated fixtures and test authentication; no production writes",
  before,
  after,
  checks: {
    nr: 193,
    pet: 95,
    visual: ui.checks,
    v2: 13,
    demo: demo.checks,
    resilience: resilience.checks,
    mapSql: 30,
    demoSql: db.checks.length,
    typecheck: true,
    scopedLint: true,
    mainBuild: true,
    labBuild: true,
  },
  resources: ui.resources,
  legacySuite: {
    status: "pre-existing obsolete selector",
    passedMapChecks: 8,
    selector: "Operação da PET",
    evidence:
      "The baseline 9cc9603e UnitMapPanel.tsx has no such control; neither that component nor validate-ui.mjs was changed. Current demo/v2/resilience suites pass.",
  },
  limits: [
    "Mobile measurements use the same Intel UHD and an emulated 390px viewport, not a physical phone.",
    "Cold first-gesture frame spikes remain in the recorded timing; median FPS does not imply every frame meets budget.",
    "Hidden supports, unmeasured stair/platform/tower dimensions and facade master artwork require field/brand confirmation.",
    "Preview is loopback-only, not deployed production or a remote staging URL.",
  ],
  confirmedTerrainCause:
    "Different recursive triangulations interpolated the nonlinear terrace differently, crossing nominally separated ground layers. Common world Z contour strips retain parallel 4cm spacing; verified over >250 points and the same orbit.",
  rejectedExperiment: {
    feature: "extra GPU fence before interaction",
    automaticFirstInteractionMs: 5299,
    result:
      "Did not remove the timing spike and exceeded 5s. Removed from delivered code. Experiment video kept locally under final-auto-desktop.webm.",
  },
};
report.measuredSourceHashes = {};
for (const name of [
  "UnitScene.tsx",
  "model.ts",
  "graphics.ts",
  "UnitEnvironment.tsx",
  "UnitMapWorkspace.tsx",
  "mapa.css",
])
  report.measuredSourceHashes[name] = createHash("sha256")
    .update(await readFile(`src/features/nr/mapa/${name}`))
    .digest("hex");
if (after.sourceHashes) report.measuredSourceHashes = after.sourceHashes;
await writeFile("docs/cotrirosa/refinamento-validacao.json", JSON.stringify(report, null, 2));
const rows = before.runs
  .map((r, i) => {
    const a = after.runs[i];
    return `<tr><td>${r.mobileEmulation ? "390×844 · emulação na mesma GPU" : r.choice === "auto" ? "1440×1000 · Automática" : "1440×1000 · Equilibrada"}</td><td>${(r.interactionMs / 1000).toFixed(3)} → ${(a.interactionMs / 1000).toFixed(3)} s</td><td>${r.medianFps} → ${a.medianFps}</td><td>${r.p95FrameMs.toFixed(1)} → ${a.p95FrameMs.toFixed(1)} ms</td><td>${r.maxFrameMs.toFixed(1)} → ${a.maxFrameMs.toFixed(1)} ms</td></tr>`;
  })
  .join("");
const pair = (title, a, b) =>
  `<h2>${title}</h2><div class="pair"><figure><img src="${a}"/><figcaption>Antes · 9cc9603e</figcaption></figure><figure><img src="${b}"/><figcaption>Depois · cena da prévia</figcaption></figure></div>`;
const shots = [
  "light-Baixa-day",
  "light-Baixa-late",
  "light-Equilibrada-day",
  "light-Equilibrada-late",
  "light-Alta-day",
  "light-Alta-late",
  "final-mobile-quality",
];
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cotrirosa · refinamento visual</title><style>body{margin:0;background:#f5f5ed;color:#18392d;font:16px/1.5 system-ui}main{max-width:1500px;margin:auto;padding:25px}h1{font-size:28px}h2{margin-top:36px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img,video{max-width:100%;display:block;border-radius:10px}figcaption{padding:8px}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #b9c7b9}a{color:#186950}.strip{display:flex;gap:18px;overflow:auto}.strip figure{min-width:550px}.portrait{max-height:650px} @media(max-width:750px){.pair{grid-template-columns:1fr}.strip figure{min-width:300px}table{font-size:12px}}</style><main><h1>Fábrica de Ração — Santa Rosa</h1><p>05/11/2026 · cena real do Nexus no laboratório SQL isolado · <a href="${preview}">Abrir a prévia navegável</a></p><p>Caminho: NR-33 ou NR-35 → COTRIROSA → Fábrica de Ração — Santa Rosa → Mapa 3D. As fotografias e gravações deste arquivo são locais; não foram publicadas na PR.</p>${pair("Escada, torre e fachada · mesmo enquadramento", "before-inspection.png", "verified-inspection.png")}${pair("Vista superior · arco frontal e encaixes", "before-upper.png", "verified-upper.png")}<h2>Direção visual fornecida</h2><p>Comparar a escada e a torre com o anexo 5; plano frontal e identidade com o anexo 6. Mestres tipográficos e detalhes ocultos continuam pendentes.</p><div class="pair"><img class="portrait" src="reference-5.jpg"/><img class="portrait" src="reference-6.jpg"/></div><h2>Fachada · enquadramento final sem a edificação frontal encobrindo</h2><img src="verified-facade.png"/><h2>Luz · câmera fixa, hora alterada; depois órbita com sol fixo</h2><div class="strip">${shots.map((name) => `<figure><img src="${name}.png"/><figcaption>${name}</figcaption></figure>`).join("")}</div><p>Os 29 checks confirmam câmera preservada, direção/cor do sol e ambiente alterados sem compensação por exposição, e somente dois PMREMs gerados durante todas as órbitas e trocas de perfil.</p><h2>Primeiro zoom e giro · cache frio · gravação anterior à rota</h2><div class="pair"><figure><video controls src="before-balanced-desktop.webm"></video><figcaption>Antes · Normal · primeiro gesto imediato</figcaption></figure><figure><video controls src="verified-balanced-desktop.webm"></video><figcaption>Depois · Normal · Equilibrada · mesmo roteiro</figcaption></figure></div><h2>Desempenho observado</h2><p>Chromium 153 / Windows / Intel UHD D3D11. Rede emulada 20 Mb/s e RTT 40ms; backend loopback; 30s de órbita, sem espera de estabilização. A base usa o perfil legado por largura; a versão final usa Equilibrada nos três casos abaixo. Emulação não prova telefone físico.</p><table><tr><th>Caso</th><th>Até interação</th><th>FPS mediano</th><th>p95 quadro</th><th>Maior intervalo</th></tr>${rows}</table><p>Renderização pausada em repouso nos seis casos. Ainda existem picos de tempo de quadro no primeiro percurso; não confundir mediana com ausência total de travamento. A causa visual confirmada do pátio foi o cruzamento de triangulações; a versão final usa faixas comuns de relevo. O teste adicional de espera por cerca GPU foi rejeitado (5,30s na abertura automática, sem remover o pico).</p><h2>Planta e limites</h2><img src="access-plan.png"/><p>Escotilha mantida em (-4,86; 8,26; 0,90)m locais; arco de 170,6° a 17,2°, alturas 7,36m a 23,79m. Apoios ocultos, escada, plataformas e torre são aproximações fotográficas. Não representam dimensionamento executivo ou acesso operacional certificado. Cadastro, implantação, fórmulas, permissões e fluxos comerciais permanecem preservados.</p></main></html>`;
await writeFile(`${dir}/comparativos.html`, html);
for (const [name, target] of [
  ["Imagem do ChatGPT 5 de nov. de 2026, 20_20_30.jpg", "reference-5.jpg"],
  ["Imagem do ChatGPT 5 de nov. de 2026, 20_20_36.jpg", "reference-6.jpg"],
]) {
  const source = path.join(homedir(), "Downloads", name);
  try {
    await copyFile(source, `${dir}/${target}`);
  } catch {
    /* Source photos stay optional and private. */
  }
}
console.log("Sanitized validation report and private comparison gallery written.");
