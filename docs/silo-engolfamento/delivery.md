# Entrega e validação — Silo de Grãos: Engolfamento

Implementação revisável de 14/10/2026, branch `codex/silo-engolfamento`. Rota pública **`/mapas-3d/silo-engolfamento`**, com card em **`/mapas-3d/unidades`**. Preview local não é implantação. Nenhuma migração ou alteração de produção foi executada.

## Comportamento entregue

Silo elevado paramétrico com corpo corrugado, cobertura, tremonha, pilares, contraventamentos, acessos, registro aberto e pórtico independente da proteção. Dois técnicos articulados e um vigia exterior usam a anatomia CC0 da LC-02 em cópias próprias de até 1K; modelos e controladores originais permanecem intactos. Materiais, cinturão, conector, linha, massa granular, detalhes de soja e saída são preparados no módulo.

Um domínio determinístico governa descarga, volume, apoio dos pés, postura, aprisionamento e restrição. Pausa, retomada, reinício, busca e câmera lenta restauram o mesmo estado. As quatro câmeras preservam o instante; primeira pessoa fecha o silo e mantém HUD/saída acessíveis quando a vítima está encoberta. Há replay da mesma trajetória sem conexão e replay preventivo com entrada/descarga impedidas. Qualidade, som opcional, fontes e análise têm controles próprios.

O conjunto local Purdue 2022–2025 tem 124 casos documentados em grãos nos EUA, 51 fatais e 73 não fatais, com edições, páginas, hashes e limitações em [sources.md](sources.md). Frequência cardíaca usa presets de esforço explicitamente ilustrativos; SpO₂ permanece indisponível. A hipótese quantitativa começa vazia e recolhida, exige escolha explícita e não atribui eficácia ao equipamento.

## Arquivos e isolamento

| Área                 | Arquivos                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Integração mínima    | `src/routes/mapas-3d_.silo-engolfamento.tsx`, novo card em `mapas-3d_.unidades.tsx`, pathname dedicado em `__root.tsx`, árvore de rotas gerada |
| Domínio              | `src/silo-engolfamento/simulation.ts`, `GrainField.ts`, `educationalVitals.ts`                                                                 |
| Cena/representação   | `SiloScene.ts`, `SiloModel.ts`, `GrainRenderer.ts`, `Workers.ts`, `ProtectionSystem.ts`, `CameraController.ts`, `performance.ts`, `Sound.ts`   |
| Interface/evidências | `SiloViewer.tsx`, `silo.css`, `IncidentAnalysis.tsx`, `incidentStatistics.ts`, `sources.ts`                                                    |
| Recursos             | `public/models/silo-engolfamento/worker-a.glb`, `worker-b.glb`, `manifest.json`, `thumbnail.svg`                                               |
| Verificação          | `tests/silo-engolfamento.test.ts`, `tests/silo-evidence.test.ts`, `tests/silo-engolfamento/`, `scripts/silo-engolfamento/`, workflow dedicado  |

Não foram editados `src/industrial/`, `src/escada/`, `src/trevisan/`, seus modelos originais, funções comerciais, permissões, fórmulas ou migrações. O diretório preexistente sem rastreamento `docs/casos-comerciais/` foi preservado e não faz parte da entrega. Não há importação da cena industrial ou singleton de métricas no silo. O mapa de reutilização, unidades, pivôs, LODs, propriedade e descarte estão em [README.md](README.md) e [resources.md](resources.md).

## Comandos e resultados reais

| Comando/verificação                                          | Resultado                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                          | Passou                                                                                                      |
| `npm run test:silo`                                          | 34/34: relógio, FPS distintos, seek, volume, apoios reais, linha, recursos, dados e hipótese                |
| `npm run test:silo:ui`                                       | 29/29 grupos; ciclo completo de 30 s em 30,098 s; dois replays; quatro câmeras; recuperação; layout e toque |
| `npm run test:silo:touch`                                    | 7/7, incluindo comandos após arrastar canvas e Enter após toque                                             |
| `node scripts/silo-engolfamento/validate-connected-line.mjs` | Linha/dispositivo/suporte visíveis na câmera de A, t=9 s preservado                                         |
| `npm run test:escada`                                        | 10/10                                                                                                       |
| `npm run test:industrial`                                    | 16/16                                                                                                       |
| `npm run test:trevisan`                                      | 8/8                                                                                                         |
| ESLint direcionado aos arquivos alterados, scripts e testes  | Passou                                                                                                      |
| `npm run build`                                              | Passou; etapa final registrada em 40,20 s                                                                   |
| `npm run test:silo:loading`                                  | Biblioteca sem Canvas/GLB antecipado; frio/quente prontos, um Canvas, zero erros                            |
| `git diff --check`                                           | Passou                                                                                                      |

Também foram verificados perda de WebGL durante execução e **durante carga** nas duas ordens de recuperação, HTTP 404 dos GLBs com retry, ausência de WebGL com sequência leve, cancelamento/desmontagem/reentrada, oclusão completa com controles, pausa sob sobrecarga e aba oculta. No fallback, callbacks RAF foram retidos por 650 ms; o tempo não avançou e um único comando Continuar retomou sem dívida antiga. A suíte da cena roda no Chrome local; os testes de regressão das cenas existentes são os testes específicos acima, sem alegação de nova inspeção visual completa desses módulos.

O build conserva avisos preexistentes de `inputValidator()` depreciado e chunks grandes. O preview usa `npm run preview -- --port 5190 --compatibility-date 2026-09-18`, porque o workerd instalado aceita essa data e o build gera `2026-10-11`. Trata-se de override do comando local, sem alteração da configuração ou prova de execução em produção.

## Medições ativas por perfil

Chrome 155.0.8059.41 headless, Windows 10.0.26200, Intel Core i5-1035G1, 8,375 GB de RAM, ANGLE / Intel UHD Graphics / Direct3D11. Desktop 1440×1000; emulação móvel 390×844 com toque, **na mesma máquina e GPU**. Não é telefone físico, iOS ou medição térmica.

Doze amostras de 150 quadros ativos, reprodução a 0,5× identificada; pausa e transições prévias excluídas. Frame time é intervalo RAF. CPU render é duração síncrona de `renderer.render`, não tempo GPU nem toda a CPU do módulo. Resumo completo por ambiente em [evidence/validation.md](evidence/validation.md) e quadros brutos em [evidence/ui.json](evidence/ui.json).

| Perfil      | Câmera  | Mediana / p95 desktop (ms) | Mediana / p95 emulado (ms) | Triângulos principais máx. | Total com sombras máx. | Draw calls totais máx. |
| ----------- | ------- | -------------------------- | -------------------------- | -------------------------: | ---------------------: | ---------------------: |
| Econômico   | Frontal | 16,7 / 16,7                | 16,7 / 16,7                |                    147.398 |                190.158 |                     61 |
| Econômico   | Vítima  | 16,7 / 16,8                | 16,7 / 16,8                |                    178.531 |                221.291 |                     44 |
| Equilibrado | Frontal | 16,7 / 16,8                | 16,7 / 16,8                |                    162.518 |                205.278 |                     61 |
| Equilibrado | Vítima  | 16,7 / 16,8                | 16,7 / 16,8                |                    216.331 |                259.091 |                     44 |
| Alto        | Frontal | 16,7 / 16,8                | 16,7 / 16,8                |                    182.678 |                225.438 |                     61 |
| Alto        | Vítima  | 16,7 / 16,8                | 16,7 / 16,8                |                    266.731 |                309.491 |                     44 |

Passes de sombra: até cinco chamadas e 42.760 triângulos por atualização, limitados a cerca de 8 Hz em reprodução. CPU render p95: 1,9–2,6 ms desktop e 1,4–1,9 ms emulado. Houve quadros isolados até 50,1 ms no equilibrado frontal; não foram removidos dos dados. P95, geometria principal e chamadas ficaram dentro dos orçamentos iniciais nesta medição. O perfil alto ultrapassa 300 mil **quando se somam passes de sombra**, explicitamente separados do orçamento principal.

DPR observado: 0,8 econômico e 1,0 equilibrado/alto, limitados pelo DPR=1 deste contexto. Os limites configurados são 0,8/1,15/1,5; estes resultados não comprovam o custo de telas físicas com DPR maior. Estimativas: 5.069.320 bytes de buffers de geometria/matrizes e 35.042.645 bytes de texturas RGBA com mipmaps. Não são VRAM real e excluem, entre outros, driver, PMREM, shadow maps e texturas de ossos. Não há query de tempo GPU ou contagem independente de overdraw.

## Carga e recursos

Auditoria do **build de produção em Wrangler local**, separada do benchmark de desenvolvimento. Chrome novo com cache frio, seguido de recarga no mesmo contexto. Cada linha é uma observação, não média ou promessa.

| Medida                                                |            Frio |        Quente |
| ----------------------------------------------------- | --------------: | ------------: |
| Transferência observada por CDP                       | 4.761.724 bytes | 190.983 bytes |
| Tempo da navegação até recursos essenciais/UI prontos |        6.516 ms |      4.812 ms |
| Tempo medido dentro da preparação da cena             |      3.518,7 ms |    2.844,1 ms |
| Início da cena após origem da navegação               |      1.918,6 ms |    1.013,6 ms |

GLBs próprios: **3.992.572 bytes**, redução de 30,2% frente aos originais; rig e LODs preservados. A biblioteca não requisita GLBs e não cria Canvas antes de abrir a experiência. Dados em [production-loading.json](evidence/production-loading.json), com tempos individuais de recursos e navegação.

A instrumentação inicial esperava DOMContentLoaded/networkidle e registrou 14.296/2.248 ms. [production-loading-first.json](evidence/production-loading-first.json) preserva essa rodada. A inspeção encontrou fonte externa herdada do shell e requisições injetadas pelo software de proteção web da máquina; esperas globais podem aguardar tráfego sem relação com os recursos essenciais. A auditoria final espera o commit de navegação e a prontidão explícita do módulo, mantendo todos os bytes observados. Identificadores transitórios de requisições injetadas foram omitidos; configurações do navegador e do software de proteção não foram alteradas. A variabilidade local de inicialização permanece registrada, sem atribuir uma causa única não medida.

## Capturas inspecionadas

| Perspectiva/estado                                                  | Captura                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Frontal com corpo, cobertura, tremonha, sustentação e dois técnicos | [desktop-frontal.png](evidence/desktop-frontal.png)                   |
| Superior, distribuição e conexão                                    | [desktop-top.png](evidence/desktop-top.png)                           |
| Primeira pessoa de A                                                | [desktop-connected.png](evidence/desktop-connected.png)               |
| A olhando linha/dispositivo sobre o ombro                           | [desktop-connected-line.png](evidence/desktop-connected-line.png)     |
| Primeira pessoa de B                                                | [desktop-victim.png](evidence/desktop-victim.png)                     |
| Vítima encoberta, HUD e saída disponíveis                           | [desktop-victim-occluded.png](evidence/desktop-victim-occluded.png)   |
| Engolfamento e retenção em andamento                                | [desktop-accident.png](evidence/desktop-accident.png)                 |
| Cinturão, conector e ponto dorsal em close                          | [desktop-harness-close.png](evidence/desktop-harness-close.png)       |
| Análise estatística                                                 | [desktop-final-analysis.png](evidence/desktop-final-analysis.png)     |
| Prevenção com entrada impedida                                      | [desktop-prevention.png](evidence/desktop-prevention.png)             |
| Celular emulado, frontal                                            | [mobile-frontal.png](evidence/mobile-frontal.png)                     |
| Celular emulado, vítima encoberta                                   | [mobile-victim-occluded.png](evidence/mobile-victim-occluded.png)     |
| Sequência leve sem WebGL                                            | [mobile-no-webgl-sequence.png](evidence/mobile-no-webgl-sequence.png) |

## Hipóteses e limites específicos

Dimensões, vazão, tempos, suporte, postura e profundidade são parâmetros educativos. O volume do domínio não cresce sem alimentação; a integração independente da malha visual mediu erro máximo de 1,105239% dentro da tolerância de 2%. A redistribuição ao relaxar a depressão apresentou residual de 0,00487381 m³, inferior a 0,01%; não representa alimentação. Não há DEM, calibração específica para soja, simulação de carga, biomecânica validada ou dimensionamento de fundações/acessos/proteção/resgate.

A conexão restringe o deslocamento antes da apresentação e não iça nem certifica o trabalhador. Diferença nominal/esquelética do ponto dorsal: até 19,8 cm enquanto orientado para caminhar e com folga; abaixo de 7,08 cm durante a retenção, sem exceder o comprimento real nas amostras testadas. A curva da folga é ilustrativa, sem solver de corda ou conservação exata do comprimento de arco. O anel dorsal do próprio corpo exige inspeção exterior; a primeira pessoa permite olhar linha/dispositivo sobre o ombro, mantendo os olhos na trajetória.

SpO₂ indisponível, pulso de encenação e estágios ventilatórios não fornecem diagnóstico, tempo até morte ou prazo de resgate. Purdue mede casos documentados em grãos nos EUA, com subnotificação e revisões; não mede eficácia da configuração nem produz série brasileira. As fotografias e fontes normativas orientam a apresentação e os conceitos, sem certificação de conformidade. Validação em aparelho físico, produção e uso real permanece fora da evidência obtida.
