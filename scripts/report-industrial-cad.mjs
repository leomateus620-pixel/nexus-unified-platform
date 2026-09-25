/** Consolidate fresh CAD implementation evidence. Does not run the checks. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const directory = "docs/industrial/evidence";
const read = async (name) => JSON.parse(await fs.readFile(`${directory}/${name}`, "utf8"));
const site = JSON.parse(await fs.readFile("src/industrial/data/site.json", "utf8"));
const [cad, glbs, ui, profiles, cycles, checks, generation, compatibility] = await Promise.all(
  [
    "cad-glb-audit.json",
    "gltf-validation.json",
    "interface-tests.json",
    "performance-summary.json",
    "resource-cycles.json",
    "cad-execution.json",
    "cad-generation.json",
    "cad-local-compatibility.json",
  ].map(read),
);
if (
  cad.status !== "passed" ||
  checks.status !== "completed" ||
  ui.stats.expected !== 7 ||
  ui.stats.skipped ||
  ui.stats.unexpected ||
  ui.stats.flaky ||
  glbs.some((g) => g.errors) ||
  checks.commands.some((c) => c.exitCode !== 0)
)
  throw new Error("Resolve current validation failures before consolidating CAD delivery.");
if (
  profiles.length !== 2 ||
  profiles.some(
    (p) =>
      p.summary.durationMs < 120000 ||
      p.errors.length ||
      p.contextLosses ||
      !p.summary.sampledFrames,
  )
)
  throw new Error("Performance evidence is incomplete or contains runtime failures.");
for (const file of cad.files) {
  const filename = file.file.startsWith("public/")
    ? file.file
    : `public/models/3tentos/${file.file}`;
  const hash = createHash("sha256")
    .update(await fs.readFile(filename))
    .digest("hex");
  if (hash !== file.sha256) throw new Error(`Evidence is stale: ${filename}`);
}
const files = new Set([
  "package.json",
  "package-lock.json",
  ".github/workflows/industrial-map.yml",
]);
for (const base of [
  "src/industrial",
  "scripts",
  "public/models/3tentos",
  "public/textures/3tentos",
  "assets/industrial/source",
  "assets/industrial/cad",
  "tests/industrial",
]) {
  for (const entry of await fs.readdir(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || /\.blend\d+$|__pycache__/.test(entry.parentPath + entry.name)) continue;
    files.add(`${entry.parentPath}/${entry.name}`.replaceAll("\\", "/"));
  }
}
const manifest = [];
for (const file of [...files].sort()) {
  const raw = await fs.readFile(file),
    binary = /\.(blend|glb|png)$/.test(file);
  const bytes = binary ? raw : Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"));
  manifest.push({
    file,
    normalization: binary ? "binary" : "UTF-8, LF line endings",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await fs.writeFile(`${directory}/delivery-manifest.json`, JSON.stringify(manifest, null, 2));
const changedFiles = [
  ...new Set([
    ...execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" })
      .trim()
      .split("\n"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
      .trim()
      .split("\n"),
    "docs/industrial/cad-implementation.md",
    "docs/industrial/validation.md",
    "docs/industrial/evidence/changed-files.json",
    "docs/industrial/evidence/delivery-manifest.json",
  ]),
]
  .filter(Boolean)
  .sort();
await fs.writeFile(
  `${directory}/changed-files.json`,
  JSON.stringify(
    {
      baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      stage: "local_uncommitted",
      files: changedFiles,
    },
    null,
    2,
  ),
);
const n = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const vector = (v) => v?.map(n).join("; ") ?? "—";
const cell = (v) =>
  String(v ?? "—")
    .replaceAll("|", "/")
    .replaceAll("\n", " ");
const geometry = (g) =>
  g.radius
    ? `Ø paramétrico ${n(g.radius * 2)}; altura paramétrica ${n(g.height ?? g.bodyHeight + g.baseHeight + g.coneHeight + g.topHeight)}`
    : ["width", "depth", "height", "rise"]
        .filter((k) => g[k] !== undefined)
        .map((k) => `${k}=${n(g[k])}`)
        .join("; ") || "ver cadastro";
const finalGeometry = (e) => {
  const g = e.geometry;
  const envelope = e.bounds
    ? `envolvente X×Z×Y ${vector([0, 2, 1].map((axis) => e.bounds.max[axis] - e.bounds.min[axis]))}`
    : "";
  if (e.cad && e.category === "silos")
    return `corpo: Ø radial externo ${n(2 * g.radius)}, H ${n(g.bodyHeight)}; cobertura H ${n(g.coneHeight)}; conjunto H ${n(g.assemblyHeight)}; ${envelope}`;
  if (e.id === "CAD-WATER-TANK")
    return `corpo: Ø ${n(2 * g.radius)}, H ${n(g.bodyHeight)}; conjunto com escada e acessórios: ${envelope}`;
  if (e.cad && ["ED-01", "ED-04", "ED-05"].includes(e.id))
    return `paredes X×Z×Y ${vector([g.width, g.depth, g.height])}; elevação da cobertura ${n(g.rise)}; conjunto: ${envelope}`;
  if (e.id === "TR-02")
    return `largura estimada histórica ${n(g.width)}; largura renderizada preservada ${n(g.renderedWidth)}`;
  return geometry(g);
};
const sourceReference = (e) =>
  e.cad
    ? `${e.cad.sourceName} · ${e.cad.sourcePaths.join(", ")}${e.cad.excludedPaths?.length ? `; exclui: ${e.cad.excludedPaths.join(", ")}` : ""}`
    : "Sem associação CAD";
const changeRows = site.elements.map((e) => {
  const old = e.cad?.legacySnapshot;
  const validation = e.cad
    ? "Geometria/ID aferidos (≤5 mm); suíte UI geral aprovada"
    : "Identidade preservada; contratos e suíte UI geral aprovados";
  const before = old
    ? `${old.name}; ${geometry(old.geometry)}; (${vector(old.position)})`
    : e.cad
      ? "Ausente do cadastro anterior"
      : "Componente existente";
  const reference = e.cad ? sourceReference(e) : "Base fotográfica existente (estimada)";
  const action = e.cad
    ? old
      ? "Geometria CAD, posição, cota, rotação, nome e proveniência integrados"
      : "Adicionado com hierarquia e ocorrência próprias"
    : ["CE-01", "TR-01", "VG-02"].includes(e.id)
      ? "Compatibilização localizada; ver evidência"
      : "Preservado";
  return `| ${[e.id, before, reference, action, validation].map(cell).join(" | ")} |`;
});
const catalogRows = site.elements.map(
  (e) =>
    `| ${[e.id, e.name, sourceReference(e), vector(e.position), vector(e.rotation.map((r) => (r * 180) / Math.PI)), finalGeometry(e), e.bounds ? `${n(e.bounds.min[1])} / ${n(e.bounds.max[1])}` : "Estimado; ver cadastro"].map(cell).join(" | ")} |`,
);
const r = site.cadRegistration;
const implementation = `# 3Tentos — implementação incremental CAD

Edição local na branch ${execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim()}. Identidade da unidade **CONFIRMADA PELO USUÁRIO**. Mesmo mapa, mesmo cadastro e IDs anteriores. Sem commit, push, merge ou deploy nesta entrega.

## Registro espacial

Convenção local de integração; não é georreferenciamento. CAD em milímetros → metros uma vez, escala geométrica 1, rotação Y de 180°. Âncora CAD: (${vector(r.cadAnchor)}) m; âncora Nexus: (${vector(r.nexusAnchor)}) m. Translação: (${vector(r.translation)}) m. Critério: centro dos quatro eixos e orientação consistente com moegas, escritório e agrotóxicos. Matriz coluna maior: ${r.matrixColumnMajorMeters.join(", ")}.

Terreno CAD Y=0,010 m corresponde a Nexus Y=0. Eixos dos silos ficam em Y=0,100 m. Espaçamentos corrigidos para 24 × 20,994996 m. A rotação abaixo é a orientação da ocorrência; o placement está incorporado aos vértices dos GLBs, sem reaplicação no React. Corpo e cobertura dos silos vêm de peças CAD próprias; Ø é envolvente radial externa, não diâmetro nominal.

## Alterações executadas

Os valores anteriores são parâmetros da representação fotográfica estimada; não são medições da envolvente completa nem dimensões nominais certificadas.

| Estrutura/ID | O que existia | Medida ou referência CAD utilizada | Alteração executada | Estado de validação |
|---|---|---|---|---|
${changeRows.join("\n")}

## Cadastro final

Posições e dimensões em metros; rotações XYZ em graus. Medidas de partes (corpo, paredes e cobertura) estão identificadas separadamente da envolvente mundial do conjunto. X×Z×Y segue os eixos Nexus; não se reaplica a rotação da ocorrência a essas dimensões mundiais. Footprints/colliders de paredes são separados. Bases/topos são cotas Nexus da geometria completa. Subárvores excluídas pertencem aos demais IDs indicados no cadastro, evitando duplicação.

| ID Nexus | Nome exibido | Nome e ocorrência CAD | Posição final Nexus | Rotação | Dimensões | Base/topo |
|---|---|---|---|---|---|---|
${catalogRows.join("\n")}

## Preservação e complementação

Preservados: todos os 20 IDs anteriores, seleção e vínculos, materiais PBR/texturas, fotos originais, vegetação com seus protótipos, vias e pátios, entorno rural, iluminação e interface. [Conferência de preservação](evidence/cad-preservation.json). Sete novos IDs de componentes CAD completam moegas, elevadores, poços/túneis, conexões, caixa d’água e acessório do escritório. O elemento circular EQ-03 mantém identidade provisória independente da caixa CAD.

Intervenções locais: árvores 70/71 deslocadas apenas a Z=61 m; desvio CE-01 entre X=-63 e -57 m até Z=65 m; contorno adjacente até Z=65,5 m, acrescentando 15,89664 m²; piso localizado da caixa d’água. Copas verificadas sem vértices dentro das paredes; caixa/escada mantêm 1,32967 m de folga à cerca. [Evidência](evidence/cad-local-compatibility.json).

## Pipeline e limites

Partições por sourceInstancePath impedem peças duplicadas. CAD completo permanece fora de public; o cache intermediário é ignorado pelo Git. Gerador seleciona setores/dependências, inclui high/low/blockout no .blend e preserva GLBs não afetados. [Auditoria numérica](evidence/cad-glb-audit.json), [geração](evidence/cad-generation.json), [integração](cad-integration.md).

Pendências específicas: numeração operacional oficial; norte/georreferenciamento e datum de campo; diâmetro nominal/separação nominal da base dos silos; associação individual da Foto D; identificação do EQ-03 e edificações sem associação CAD. Não impedem a integração local realizada. A tolerância de exportação de 5 mm não representa precisão de campo. Simplificação gráfica não certifica o erro de toda a superfície CAD.

## Arquivos e execução

A lista completa de arquivos locais alterados/adicionados está em [changed-files.json](evidence/changed-files.json). O manifesto de integridade de fontes e ativos (incluindo arquivos preservados) está em [delivery-manifest.json](evidence/delivery-manifest.json); comandos realmente executados em [cad-execution.json](evidence/cad-execution.json). Resultados atuais: [validação](validation.md).

- Cadastro/contratos: site.json, data/index.ts e types/index.ts; registro compacto em assets/industrial/cad.
- Geração: generate_unit.py, cad_geometry.py, run-blender.mjs, run-cad.mjs, scripts/cad, optimize-industrial.mjs e repair-industrial-tangents.mjs; fonte .blend e oito GLBs.
- Aplicação: IndustrialScene.tsx, spatial.ts, Navigation.tsx, collision.ts, Minimap.tsx, IndustrialMap.tsx, industrial.css e atualização explícita das instâncias em Vegetation.tsx.
- Proteções/validação: create-industrial-data.mjs, auditorias CAD/geometria, testes industriais/interface/tangentes, package.json, workflow industrial e .gitignore.
- Documentação/evidências: docs/industrial e README da fonte Blender.
`;
await fs.writeFile("docs/industrial/cad-implementation.md", implementation);
const performanceRows = profiles.map(
  (p) =>
    `| ${p.profile} | ${n(p.loading.readyMs / 1000)} | ${n(p.summary.medianFps)} | ${n(p.summary.p95Ms)} | ${n(p.summary.p99Ms)} | ${p.summary.maxMainTriangles} / ${p.summary.maxTriangles} | ${p.summary.maxCalls} | ${p.contextLosses} / ${p.errors.length} |`,
);
await fs.writeFile(
  "docs/industrial/validation.md",
  `# Validação da integração CAD

Evidências locais atuais em ${new Date().toISOString()}. [Entrega e tabelas](cad-implementation.md). O consolidador apenas lê resultados; os comandos estão registrados com código de saída em [cad-execution.json](evidence/cad-execution.json).

- TypeScript, 16 testes industriais (12 contratos e 4 regressões de tangentes), ESLint direcionado e build: aprovados.
- Playwright: ${ui.stats.expected} aprovados, ${ui.stats.unexpected} falhas, ${ui.stats.flaky} instáveis.
- Auditoria CAD/GLB: ${cad.partitions.length} partições verificadas, tolerância 5 mm, maior diferença de envolvente observada ${n(Math.max(...cad.partitions.map((p) => p.sourceErrorMeters)) * 1000)} mm. Transformações e cotas conferidas contra fontes independentes. [Detalhes](evidence/cad-glb-audit.json).
- Silos high/low/blockout: maior diferença de envolvente entre níveis ${n(Math.max(...cad.lod.flatMap((p) => [p.highLowErrorMeters, p.highBlockoutErrorMeters])) * 1000)} mm; erro máximo nas alturas medidas de corpo/cobertura ${n(Math.max(...cad.siloParts.map((p) => p.heightErrorMeters)) * 1000)} mm. Base do corpo 0,100 m, topo do corpo 14,600 m, topo da cobertura 20,103 m; topo do conjunto com acessórios 21,279475 m.
- GLBs: ${glbs.filter((g) => g.validationStatus === "validated-current-generation").length} setores gerados/validados nesta execução; ${glbs.filter((g) => g.validationStatus !== "validated-current-generation").length} preservados. ${glbs.reduce((s, g) => s + g.errors, 0)} erros e ${glbs.reduce((s, g) => s + g.warnings, 0)} avisos na geometria decodificada; limitações do validador meshopt registradas separadamente. [Relatório](evidence/gltf-validation.json).
- Ciclos de recursos e reentrada: [evidência atual](evidence/resource-cycles.json). Vistas [A](evidence/view-A.png), [B](evidence/view-B.png), [C](evidence/view-C.png), [D](evidence/view-D.png). As câmeras fotográficas são referências visuais; não alteram as medidas CAD.
- Inspeção visual atual: [visão geral](evidence/cad-overview-ui.png), [silos high](evidence/cad-silo-high.png), [silos low](evidence/cad-silo-low.png), [blockout](evidence/cad-silo-blockout.png), [caixa d’água](evidence/cad-water-tank-ui.png) e [interface móvel emulada](evidence/mobile.png). [Registro das capturas](evidence/cad-visual-captures.json).
- Vegetação presente desde a entrada e na troca de perfis sem movimentar câmera: [checagem específica](evidence/cad-vegetation-profiles.json). Dois reparos de integração: atualização explícita do quadro após preencher as instâncias e correspondência low pelo nome original preservado no GLB. Os protótipos binários permanecem idênticos.

## Desempenho observado

Chrome headless, Windows, ${profiles[0].renderer}; computador ${profiles[0].host.cpu}. Prévia local do build, contexto novo/cache HTTP desabilitado, percurso de pelo menos 120 s por perfil. Econômico usa viewport/toque emulados; não é teste de telefone físico ou Safari. Estado pronto inclui carregamento e não isola primeira apresentação GPU. FPS calculado pela mediana dos intervalos.

| Perfil | Pronto (s) | FPS mediana | p95 (ms) | p99 (ms) | Máx. triângulos principais / com sombras | Máx. chamadas com sombras | Contextos perdidos / erros JS |
|---|---:|---:|---:|---:|---:|---:|---:|
${performanceRows.join("\n")}

Arquivos de GLBs: ${n(glbs.reduce((s, g) => s + g.bytes, 0) / 1e6)} MB. Tamanho em disco não é memória GPU. Métricas completas em [performance-summary.json](evidence/performance-summary.json). A [baseline anterior](evidence/cad-preimplementation-baseline.json) é histórica e está identificada pelo commit; não foi repetida como teste atual e não permite atribuir causalidade aos tempos entre sessões. O perfil econômico também corrige a identificação dos protótipos vegetais low pelo nome original do GLB; as medidas anteriores à correção omitiam essas árvores e não representam conteúdo visual equivalente.

Os orçamentos históricos de 1 milhão de triângulos no desktop e 350 mil no móvel foram excedidos nesta revisão: mesmo sem contar sombras, os máximos foram ${n(profiles.find((p) => p.profile === "balanced").summary.maxMainTriangles)} e ${n(profiles.find((p) => p.profile === "economy").summary.maxMainTriangles)}. As chamadas totais ficaram em ${profiles.find((p) => p.profile === "balanced").summary.maxCalls}/${profiles.find((p) => p.profile === "economy").summary.maxCalls}, diante dos orçamentos anteriores de 250/150. Não se declara cumprimento do orçamento de triângulos nem 60 FPS constantes. O detalhamento CAD e seus acessórios aumentam o custo; redução adicional deve preservar as dimensões críticas e ser aferida em outra iteração. Os ${profiles.map((p) => `${p.profile}: ${p.summary.framesOver50Ms}/${p.summary.sampledFrames}`).join("; ")} quadros acima de 50 ms permanecem na amostra, sem atribuir sua causa a GPU, compilação, GC ou automação sem perfilamento. Não houve quadros adicionais nos intervalos de repouso medidos (${profiles.map((p) => `${p.profile}: ${p.idleFrames}`).join("; ")}).

Geometria CAD utiliza unidades métricas, sem esticar estruturas. O erro de exportação aferido não certifica levantamento, capacidade ou precisão de campo. Não há publicação remota nesta entrega.
`,
);
console.log("Current CAD evidence consolidated; implementation tables and manifest written.");
