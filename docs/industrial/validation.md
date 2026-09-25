# Validação da integração CAD

Evidências locais atuais em 2026-09-16T00:29:04.071Z. [Entrega e tabelas](cad-implementation.md). O consolidador apenas lê resultados; os comandos estão registrados com código de saída em [cad-execution.json](evidence/cad-execution.json).

- TypeScript, 16 testes industriais (12 contratos e 4 regressões de tangentes), ESLint direcionado e build: aprovados.
- Playwright: 7 aprovados, 0 falhas, 0 instáveis.
- Auditoria CAD/GLB: 36 partições verificadas, tolerância 5 mm, maior diferença de envolvente observada 0,4664 mm. Transformações e cotas conferidas contra fontes independentes. [Detalhes](evidence/cad-glb-audit.json).
- Silos high/low/blockout: maior diferença de envolvente entre níveis 0,4665 mm; erro máximo nas alturas medidas de corpo/cobertura 0,1976 mm. Base do corpo 0,100 m, topo do corpo 14,600 m, topo da cobertura 20,103 m; topo do conjunto com acessórios 21,279475 m.
- GLBs: 8 setores gerados/validados nesta execução; 2 preservados. 0 erros e 0 avisos na geometria decodificada; limitações do validador meshopt registradas separadamente. [Relatório](evidence/gltf-validation.json).
- Ciclos de recursos e reentrada: [evidência atual](evidence/resource-cycles.json). Vistas [A](evidence/view-A.png), [B](evidence/view-B.png), [C](evidence/view-C.png), [D](evidence/view-D.png). As câmeras fotográficas são referências visuais; não alteram as medidas CAD.
- Inspeção visual atual: [visão geral](evidence/cad-overview-ui.png), [silos high](evidence/cad-silo-high.png), [silos low](evidence/cad-silo-low.png), [blockout](evidence/cad-silo-blockout.png), [caixa d’água](evidence/cad-water-tank-ui.png) e [interface móvel emulada](evidence/mobile.png). [Registro das capturas](evidence/cad-visual-captures.json).
- Vegetação presente desde a entrada e na troca de perfis sem movimentar câmera: [checagem específica](evidence/cad-vegetation-profiles.json). Dois reparos de integração: atualização explícita do quadro após preencher as instâncias e correspondência low pelo nome original preservado no GLB. Os protótipos binários permanecem idênticos.

## Desempenho observado

Chrome headless, Windows, ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11); computador Intel(R) Core(TM) i5-1035G1 CPU @ 1.00GHz. Prévia local do build, contexto novo/cache HTTP desabilitado, percurso de pelo menos 120 s por perfil. Econômico usa viewport/toque emulados; não é teste de telefone físico ou Safari. Estado pronto inclui carregamento e não isola primeira apresentação GPU. FPS calculado pela mediana dos intervalos.

| Perfil | Pronto (s) | FPS mediana | p95 (ms) | p99 (ms) | Máx. triângulos principais / com sombras | Máx. chamadas com sombras | Contextos perdidos / erros JS |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 5,3273 | 59,5238 | 29,4 | 138,7 | 1798818 / 3593310 | 182 | 0 / 0 |
| economy | 2,3935 | 59,8802 | 17,1 | 75,2 | 1126794 / 2318056 | 149 | 0 / 0 |

Arquivos de GLBs: 42,3064 MB. Tamanho em disco não é memória GPU. Métricas completas em [performance-summary.json](evidence/performance-summary.json). A [baseline anterior](evidence/cad-preimplementation-baseline.json) é histórica e está identificada pelo commit; não foi repetida como teste atual e não permite atribuir causalidade aos tempos entre sessões. O perfil econômico também corrige a identificação dos protótipos vegetais low pelo nome original do GLB; as medidas anteriores à correção omitiam essas árvores e não representam conteúdo visual equivalente.

Os orçamentos históricos de 1 milhão de triângulos no desktop e 350 mil no móvel foram excedidos nesta revisão: mesmo sem contar sombras, os máximos foram 1.798.818 e 1.126.794. As chamadas totais ficaram em 182/149, diante dos orçamentos anteriores de 250/150. Não se declara cumprimento do orçamento de triângulos nem 60 FPS constantes. O detalhamento CAD e seus acessórios aumentam o custo; redução adicional deve preservar as dimensões críticas e ser aferida em outra iteração. Os balanced: 180/6014; economy: 118/7038 quadros acima de 50 ms permanecem na amostra, sem atribuir sua causa a GPU, compilação, GC ou automação sem perfilamento. Não houve quadros adicionais nos intervalos de repouso medidos (balanced: 0; economy: 0).

Geometria CAD utiliza unidades métricas, sem esticar estruturas. O erro de exportação aferido não certifica levantamento, capacidade ou precisão de campo. Não há publicação remota nesta entrega.
