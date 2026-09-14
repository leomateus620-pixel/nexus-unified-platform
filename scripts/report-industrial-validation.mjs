import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const dir = "docs/industrial/evidence";
const read = async (name) => JSON.parse(await fs.readFile(`${dir}/${name}`, "utf8"));
const profiles = await read("performance-summary.json");
const glbs = await read("gltf-validation.json");
const ui = await read("interface-tests.json");
const cycles = await read("resource-cycles.json");
const cameras = await read("camera-fitting.json");
if (ui.stats.unexpected || glbs.some((g) => g.errors || g.warnings))
  throw new Error("Resolve validation failures before reporting delivery.");
const n = (v, digits = 1) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const mb = (v) => n(v / 1e6, 2);
const network = (p) => p.loading.resources.concat(p.loading.navigation).reduce((s, r) => s + (r.transferSize || 0), 0);
const modelBytes = (p) => Object.values(p.loading.assets).reduce((s, a) => s + a.bytes, 0);
const row = (label, fn) => `| ${label} | ${profiles.map(fn).join(" | ")} |`;
const files = ["package.json", "package-lock.json", "bun.lock", "src/industrial/data/site.json", "scripts/blender/generate_unit.py", "scripts/optimize-industrial.mjs", "scripts/benchmark-industrial.mjs", "scripts/capture-industrial-views.mjs", "scripts/audit-industrial-geometry.mjs", "tests/industrial/contracts.test.ts", "tests/industrial/interface.spec.ts"];
for (const base of ["src/industrial", "public/models/3tentos", "public/textures/3tentos", "assets/industrial/source"]) {
  for (const entry of await fs.readdir(base, { recursive: true, withFileTypes: true }))
    if (entry.isFile() && !/\.blend\d+$/.test(entry.name)) files.push(`${entry.parentPath}/${entry.name}`.replaceAll("\\", "/"));
}
const manifest = [];
for (const file of [...new Set(files)].sort()) {
  const raw = await fs.readFile(file);
  const binary = /\.(blend|glb|png)$/.test(file);
  const bytes = binary ? raw : Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"));
  manifest.push({ file, normalization: binary ? "binary" : "UTF-8, LF line endings", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await fs.writeFile(`${dir}/delivery-manifest.json`, JSON.stringify(manifest, null, 2));
const report = `# Auditoria da reconstrução 3D

Versão funcional entregue em **/mapas-3d**. Auditoria local em ${new Date().toISOString().slice(0, 10)}, a partir da base Git d3b66400d7fc00cf5fbf806cdf04d7c3646c3b0e. Os arquivos efetivamente avaliados são identificados por SHA-256 em [delivery-manifest.json](evidence/delivery-manifest.json).

## Estado de verificação

- Checagem TypeScript, build Vite/Nitro e ESLint dos arquivos da implementação: executados com sucesso. O lint global das demais áreas não integra esta auditoria.
- Sete testes de contratos: implantação 2 × 2, rastreabilidade, hashes das quatro fotos, colisões e regressão de coordenadas da vegetação comprimida.
- ${ui.stats.expected} testes Playwright aprovados, ${ui.stats.unexpected} falhas, ${ui.stats.flaky} resultados instáveis. Incluem busca, seleção real de malha, minimapa por teclado, zoom orbital, vistas, camadas, blockout, iluminação, qualidade, sobreposição/opacidade, exportação JSON, WASD/Esc, toque emulado, movimento reduzido, recuperação HTTP 503, carregamento interrompido e retorno ao Nexus.
- Dez GLBs produzidos no Blender 4.5.10 LTS e otimizados com glTF Transform/meshoptimizer. Validação Khronos dos arquivos compactados e de sua geometria decodificada: **zero erros e zero avisos**. IDs preservados. [Relatório GLB](evidence/gltf-validation.json).
- Limites externos dos quatro silos idênticos entre os dois LODs; zero vértices da vegetação dentro das caixas de paredes no teste geométrico. Essa consulta não prova ausência de toda interseção entre triângulos/telhados. [Auditoria geométrica](evidence/geometry-audit.json).
- Seis ciclos de qualidade/iluminação; contadores estabilizados após aquecimento em ${cycles.snapshots[1].geometries} geometrias, ${cycles.snapshots[1].textures} texturas e ${cycles.snapshots[1].programs} programas. Três saídas e reentradas na rota funcionaram sem perda de contexto. Isso não equivale a uma prova de ausência de vazamento de heap/GPU. [Ciclos](evidence/resource-cycles.json).

## Desempenho observado

Windows ${profiles[0].host.release}, ${profiles[0].host.cpu}, ${mb(profiles[0].host.ramBytes)} MB de RAM. Chrome ${profiles[0].browserVersion}, headless, WebGL2 com **${profiles[0].renderer}**. Desktop: 1448 × 1000; econômico: 390 × 844 com toque emulado e DPR 1. Ambos executados no mesmo computador. Não houve teste em telefone físico, Safari/iOS ou WebGPU.

Percurso automatizado de passeio com comandos de movimento e rotação, por pelo menos dois minutos por perfil. Contexto novo e cache HTTP desabilitado; prévia local do build de produção em Wrangler, sem emulação de rede móvel. Cache de driver/compilação do sistema não foi controlado.

| Medida do percurso | Desktop equilibrado | Econômico emulado |
|---|---:|---:|
${row("Duração (s)", p => n(p.summary.durationMs / 1000))}
${row("Quadros amostrados", p => n(p.summary.sampledFrames, 0))}
${row("FPS pela mediana dos intervalos", p => n(p.summary.medianFps))}
${row("Intervalo p50 / p95 / p99 (ms)", p => [p.summary.p50Ms, p.summary.p95Ms, p.summary.p99Ms].map(v => n(v)).join(" / "))}
${row("Maior intervalo (ms)", p => n(p.summary.maxMs))}
${row("Intervalos acima de 50 ms", p => n(p.summary.framesOver50Ms, 0))}
${row("Máximo de chamadas, incluindo sombras", p => n(p.summary.maxCalls, 0))}
${row("Máximos de chamadas: principal / sombras", p => n(p.summary.maxMainCalls, 0) + " / " + n(p.summary.maxShadowCalls, 0))}
${row("Máximo de triângulos, incluindo sombras", p => n(p.summary.maxTriangles, 0))}
${row("Máximos de triângulos: principal / sombras", p => n(p.summary.maxMainTriangles, 0) + " / " + n(p.summary.maxShadowTriangles, 0))}
${row("Novos quadros em 2,5 s de repouso", p => p.idleFrames)}
${row("Perdas de contexto / erros JS", p => p.contextLosses + " / " + p.errors.length)}

Os máximos de cada coluna são calculados separadamente e podem ocorrer em quadros diferentes. A quantidade visível depende do enquadramento; o perfil móvel possui campo de visão horizontal menor. Estes números não são uma comparação isolada do custo dos perfis, nem garantem 60 FPS constantes. Os picos longos permanecem na amostra; a causa de cada pausa não foi atribuída a GPU, compilação, GC ou automação sem perfilamento adicional. Os JSONs completos contêm os intervalos e tempos de submissão CPU; não são tempos de GPU.

As vistas amplas A/B/C no perfil equilibrado registraram 214 chamadas e 761.250 triângulos **com sombras**. D registrou 179 chamadas e 721.558 triângulos. Não há passes permanentes de reflexão local, bloom ou pós-processamento; PMREM é preparado quando o ambiente muda. As metas de 1 milhão/250 no desktop e 350 mil/150 no móvel continuam orçamentos de projeto, sem certificação de todos os dispositivos/enquadramentos.

## Carregamento e memória

| Medida | Desktop equilibrado | Econômico emulado |
|---|---:|---:|
${row("Estado pronto desde navigationStart (s)", p => n(p.loading.readyMs / 1000, 2))}
${row("Carga dos setores desde montagem da cena (s)", p => n(p.loading.modelLoadMs / 1000, 2))}
${row("GLBs disponíveis ao ficar pronto (MB)", p => mb(modelBytes(p)))}
${row("Transferência Resource/Navigation Timing até pronto (MB)", p => mb(network(p)))}
${row("Decodificação/parse do setor terreno (ms)", p => n(p.loading.assets.terrain.decodeMs))}
${row("Buffers de geometria estimados (MB)", p => mb(p.estimatedGeometryBytes))}
${row("Texturas de materiais estimadas (MB)", p => mb(p.estimatedTextureBytes))}
${row("Heap JavaScript usado no fim (MB)", p => mb(p.jsHeap.usedJSHeapSize))}

MB decimais. A transferência observada fica abaixo da referência inicial de aproximadamente 8 MB nesta prévia; não inclui fotos abertas posteriormente, detalhes carregados depois ou garantia de cache/rede de produção. Recursos de fontes existentes no shell podem não expor todos os bytes entre origens. O estado pronto confirma carregamento da cena, não mede isoladamente a primeira apresentação GPU. Fetch e decodificação estão separados por setor nos JSONs; tempo de compilação de shaders não foi isolado.

Os GLBs completos somam ${mb(glbs.reduce((s, g) => s + g.bytes, 0))} MB depois da otimização, contra ${mb(glbs.reduce((s, g) => s + g.sourceBytes, 0))} MB intermediários. Esse é tamanho de arquivo, não memória GPU nem ganho de FPS demonstrado. A base anterior não possuía essa reconstrução; não há comparação de desempenho antes/depois de uma cena equivalente.

Geometria estima buffers únicos visitados; texturas estimam largura × altura × RGBA e mipmaps. Não incluem alinhamento de driver, todas as cópias, targets de sombra/ambiente ou memória do sistema gráfico. Heap JavaScript é uma medida separada do Chrome. Não se somam essas categorias como se fossem uma medição direta de VRAM.

## Auditoria visual

Capturas posteriores à otimização: [A](evidence/view-A.png), [B](evidence/view-B.png), [C](evidence/view-C.png), [D](evidence/view-D.png) e [visão geral](evidence/overview-initial.png). A–C usam canvas 1448 × 1086; D usa 941 × 1672. A interface permite sobreposição das fotografias originais com opacidade regulável.

| Aspecto | Resultado e limite |
|---|---|
| Implantação | Quatro silos em 2 × 2, galpão adjacente, cinco edificações, faixa provável de pesagem, elemento circular, ilhas, rodovia e acesso superior reconstruídos. B é referência visual, não ortofoto. |
| Silhueta e profundidade | A/C ajustadas apenas por câmera, sem espelhar/deformar objetos. RMS dos oito pontos de ajuste: A ${n(cameras.views.A.rmsPixels, 2)} px; C ${n(cameras.views.C.rmsPixels, 2)} px. Incluem apoios e ápices separados. São resíduos do ajuste manual, sem pontos independentes de validação. |
| Foto D | Chapas, montantes, telhados, tubos, coroamentos e guarda-corpos modelados. Registro de câmera e identidade exata dos silos dessa fotografia ainda precisam de confirmação. |
| Acabamento | Famílias PBR autorais, cercamentos segmentados, árvores/folhas e palmeiras ancoradas. A variação de terreno e o detalhe de copas ainda são aproximações procedurais; não se declara equivalência fotográfica. |

Correções de robustez incluídas: transformação de folhas em Float32 antes de aplicar as matrizes dos GLBs quantizados; posições do terreno preservadas sem quantização que colapse camadas; separação entre pisos; descarte de instâncias ao trocar geometria; renderização por demanda e suspensão em aba oculta. O vento altera somente folhas e usa a mesma deformação nas sombras.

**Pendências externas:** medidas confiáveis, confirmação das funções/identificadores operacionais, fachadas ocultas, detalhes de equipamentos, orientação geográfica e direitos de redistribuição ampla das fotos. A escala é estimada e a medição permanece desativada. Esta entrega é uma reconstrução visual inicial funcional, não levantamento validado, modelo as built, certificação de segurança ou gêmeo digital conectado.
`;
await fs.writeFile("docs/industrial/validation.md", report);
console.log("Validation report and delivery manifest written.");
