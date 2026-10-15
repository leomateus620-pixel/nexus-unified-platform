# Silo de Grãos — Engolfamento

> **Arquitetura histórica da PR #11**, head `bc90e2d20403cfb9a2941263e71ad2984ac71b80`, de 14/10/2026. Este documento preserva o reconhecimento, a geometria elevada e os resultados originais. Para a arquitetura vigente do silo no chão com LVHF circular, consulte a [entrega do upgrade](upgrade-delivery.md), o [domínio atual](upgrade-domain.md) e a [auditoria do modelo](model-and-reference-audit.md).

Experiência educativa independente em **`/mapas-3d/silo-engolfamento`**, com card próprio em **`/mapas-3d/unidades`**. Implementação local em 14/10/2026, sem implantação em produção. A rota usa `mapas-3d_.silo-engolfamento.tsx`: o sublinhado do TanStack evita renderizá-la dentro da cena `/mapas-3d`. `ssr: false` e `React.lazy` impedem a criação do contexto WebGL no servidor; a biblioteca carrega apenas a miniatura SVG.

## Reconhecimento e reutilização

A inspeção incluiu o AGENTS.md da raiz, package.json, configurações Vite/TypeScript/ESLint, rotas públicas, shell, modelos industriais, navegação, iluminação, métricas, cena LC-02, circulação, scripts, GLBs e manifestos. Não existem instruções AGENTS.md adicionais nos diretórios envolvidos. Estado inicial: branch `codex/catalogo-itens-comerciais`, HEAD `8d625c483949f70f8d1117b5292138e30bbc03f5`; apenas `docs/casos-comerciais/` estava sem rastreamento e foi preservado. Trabalho em `codex/silo-engolfamento`, sem reescrita de histórico.

| Arquivo existente                       | Recurso aproveitado                                 | Adaptação                                               | Risco de regressão                                   |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| `src/routes/mapas-3d.tsx`               | Rota pública, importação preguiçosa, SSR desativado | Nova rota dedicada com o padrão de arquivo não aninhado | A cena industrial não é importada pelo simulador     |
| `src/routes/mapas-3d_.unidades.tsx`     | Biblioteca e identidade visual                      | Card exclusivo com SVG local                            | Cards existentes preservados                         |
| `src/routes/__root.tsx`                 | Visualizadores dedicados fora do rail comercial     | Inclusão de um pathname exato                           | Guards e rotas comerciais preservados                |
| `src/industrial/scene/assets.ts`        | Carga cancelável e descarte por proprietário        | Pool próprio de recursos                                | Nenhum singleton ou recurso industrial compartilhado |
| `src/industrial/performance/metrics.ts` | Contagem de passes e estimativa de recursos         | Métricas por instância do silo                          | Não importa nem modifica métricas globais            |
| `src/escada/lc02-people.ts` e GLBs      | Anatomia, rig, materiais e conceitos de IK/LOD      | Cópias 1K e postura de grãos; implementação isolada     | IK de degraus, circulação e originais preservados    |

Three.js 0.186.0, React 19.2.8 e TanStack Router 1.170.41 já estavam instalados. Nenhum motor de física ou dependência de execução foi adicionado. A cena usa Three.js diretamente para controlar um único renderer e a invalidação sob demanda. Consulte [recursos e propriedade](resources.md) para licença, pivôs, escala, LODs, hashes e cadeia completa da proteção.

As seis imagens anexadas foram inspecionadas no caminho Downloads indicado pelo usuário: `03_32_15`, `03_32_07`, `03_32_02`, `03_31_50`, `03_31_42`, `03_31_38`, todas de 14/10/2026. Os nomes `IMG_0126.jpeg` etc. não estavam entre os anexos recebidos; não foi alegada sua leitura. As fotos orientaram galvanização, montantes, tremonha, pilares, contraventamentos e acessos amarelos; a maquete orientou a composição didática. Nenhuma parede acrílica foi atribuída ao silo real. As imagens não foram redistribuídas nem utilizadas como desenho cotado.

## Contratos

| Camada                 | Arquivos                                                                        | Autoridade                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Domínio                | `simulation.ts`, `GrainField.ts`                                                | Relógio, comandos, estados, volume, apoio, aprisionamento e limite da conexão; sem DOM/React/Three |
| Representação          | `SiloModel.ts`, `GrainRenderer.ts`, `Workers.ts`, `ProtectionSystem.ts`         | Consome o estado e aplica geometria/postura; não decide o desfecho                                 |
| Câmeras                | `CameraController.ts`                                                           | Somente uma perspectiva por vez; órbita desativada em primeira pessoa                              |
| Interface              | `SiloViewer.tsx`, `IncidentAnalysis.tsx`                                        | Comandos, HUD, timeline, análise e acessibilidade                                                  |
| Recursos/ciclo de vida | `SiloScene.ts`, `Workers.ts`, `Sound.ts`                                        | Contexto, prontidão, cancelamento, propriedade e descarte                                          |
| Evidências             | `sources.ts`, `incidentStatistics.ts`, `educationalVitals.ts`, `performance.ts` | Fontes versionadas, hipóteses separadas e métricas da sessão                                       |

`start`, `pause`, `resume`, `reset`, `seek`, `setPlaybackRate`, `setCamera`, `setScenario` e `setReady` são métodos do controlador único. Carga e reprodução são estados distintos; a interface não libera início 3D antes da geometria, dos dois técnicos e do controlador. A sequência leve pode ser escolhida explicitamente quando WebGL ou recursos falham, com os mesmos estados, relógio, indicadores e fontes.

Passo fixo de 1/60 s, acumulador e máximo de oito subpassos. A configuração é avaliável analiticamente, permitindo interpolação e busca exata sem um histórico futuro residual. Se um quadro exigir mais de oito passos, o domínio pausa no último instante apresentado e informa sobrecarga; não recupera atraso em uma fila ilimitada, acelera o evento ou salta estágios. Aba oculta pausa domínio, som e efeitos; retorno exige continuar. Snapshots são imutáveis e publicados a 10 Hz de tempo real, inclusive em câmera lenta. A cena lê o buffer mutável de apresentação sem atualizar a árvore React por quadro.

## Hipóteses e mecanismo

Tudo usa metros, Y vertical e origem no centro da fundação. Raio 3 m; saída Y=1,2 m e raio 0,18 m; topo da tremonha 3,5 m; corpo até 9,5 m; cobertura até 11,2 m. Nível médio inicial 6,35 m. São dimensões estimadas de composição, sem associação a um modelo comercial ou projeto de fabricação. O acesso exterior inspirado nas fotografias não recebe declaração de conformidade atual. A NR-31 vigente exige avaliação específica da solução de acesso.

O volume é a soma de um tronco de cone e um cilindro até o nível médio. A vazão ilustrativa de 0,65 m³/s acompanha a abertura suave do registro entre 6–7 s; o fechamento ocorre entre 21–22 s. O volume decresce pelo integral da abertura, sem alimentação. A depressão radial usa compensação analítica de média zero, portanto redistribui sem criar massa. O total retirado neste roteiro é 9,75 m³. A discretização visual da superfície aproxima esse campo; instâncias e partículas apenas dão detalhe e não contam como massa adicional.

A massa visual fica recuada 15 mm da chapa do corpo e 3 mm da saída para evitar z-fighting entre grãos e metal. A integração numérica da geometria visual encontrou erro relativo absoluto máximo de **1,105239%**, dentro do alvo de **menos de 2%** em relação ao volume do domínio. Após a descarga cessar, a redistribuição da superfície discretizada produziu uma pequena variação residual de **0,00487381 m³**, inferior a 0,01%; o volume do domínio nunca aumenta. Esses números verificam a aproximação geométrica, sem validar fisicamente o escoamento de soja. O registro usa guia em moldura aberta, sem uma placa fechando o caminho do jato quando a descarga está liberada.

Ambos os técnicos têm exposição radial espelhada e o mesmo roteiro livre. O domínio define o apoio dos pés: durante a caminhada curta, cada apoio plantado fica fixo em coordenadas mundiais enquanto o corpo avança; os balanços alternados acompanham a superfície. Depois da descarga, os pés preservam seus deslocamentos relativos ao corpo e acompanham seu transporte e afundamento, sem outra passada. A profundidade cinemática ilustrativa progride com a descarga integrada e limita amplitude e alcance dos membros. A conexão de A limita geometricamente o ponto dorsal antes da representação, com comprimento de aproximadamente 1,959 m. Não há mola, liberação automática de cabo, cálculo de cargas ou içamento. O replay sem conexão usa a mesma seed e trajetória livre de A; o replay preventivo mantém todos do lado de fora e a descarga bloqueada. Entrada sobre grãos em movimento permanece uma condição insegura, inclusive com cinturão.

O corte visual usa um único plano Z=0,70 m para parede, cobertura, estrutura e massa. Esse recuo deixa os técnicos envolvidos pela massa e revela o engolfamento; o setor é aproximadamente meia seção, não uma abertura física. Na primeira pessoa, o invólucro e a massa são restaurados. Olhos acompanham o esqueleto; cabeça/rosto próprios são removidos da representação. Quando encoberto, o ambiente fica ocluído e os controles permanecem acima da camada de oclusão.

Grãos: campo contínuo mais 900/1.800/3.000 instâncias máximas, com menos instâncias à distância e histerese de LOD; pool adicional de 180 grãos da saída. Diâmetro visual próximo aproximadamente 7–9,4 mm, variação discreta, textura gerada localmente e buffers reutilizados. As matrizes locais só mudam com tempo, perfil, corte ou faixa de LOD. Nenhum corpo rígido individual representa o interior oculto. Os técnicos usam esqueletos independentes, mas imagens e geometrias são compartilhadas dentro do pool.

O pórtico independente alcança as fundações e passa pelo acesso superior; não atribui ancoragem à chapa, ao guarda-corpo ou ao telhado. Dispositivo ilustrativo com comprimento previamente ajustado, cinturão, conector dorsal, linha e meios de retirada recolhidos. A retenção precoce ilustrada continua exigindo interrupção do fluxo e retirada planejada; não certifica equipamento ou dimensionamento. A pequena diferença entre ponto dorsal nominal e esquelético é quantificada em [resources.md](resources.md).

Frequência cardíaca usa apenas três presets de encenação de esforço (82/104/118 bpm), que ficam indisponíveis com aprisionamento. SpO₂ permanece indisponível porque não há curva médica validada utilizada. Não há ECG, leitura atmosférica deduzida, morte simulada, probabilidade de resgate ou contagem regressiva de sobrevivência. O roteiro não foi calibrado ao exemplo de 5/11 s da OSHA, que tem condições próprias e não representa prazo até morte.

Os dados históricos documentados e a aritmética hipotética de prevenção estão separados dos resultados ilustrativos. Veja [fontes e critérios](sources.md) para conferência das tabelas/figuras, NR-31, NR-33, OSHA, fabricante, FDA e limitações da série da Purdue.

## Reprodução e verificação

```powershell
npm run dev -- --host 127.0.0.1 --port 5185
# /mapas-3d/unidades → card Silo de Grãos — Engolfamento
npm run typecheck
npm run test:silo
npx eslint src/silo-engolfamento src/routes/mapas-3d_.silo-engolfamento.tsx src/routes/mapas-3d_.unidades.tsx src/routes/__root.tsx
npm run build
npm run test:silo:ui
npm run test:silo:touch
node scripts/silo-engolfamento/validate-connected-line.mjs
npm run test:escada
npm run test:industrial
npm run test:trevisan
# Após o build, em outro terminal:
npm run preview -- --port 5190 --compatibility-date 2026-09-18
npm run test:silo:loading
# SILO_URL e SILO_OUTPUT permitem escolher servidor e destino da evidência.
```

O comando de preview usa a data máxima suportada pelo workerd instalado localmente, **2026-09-18**. A configuração gerada pelo build informa **2026-10-11**; o argumento acima ajusta somente a execução local para esse runtime. Nenhuma configuração de implantação ou ambiente de produção foi alterada.

Baseline antes das mudanças: typecheck, 10 testes LC-02 e 16 testes industriais passaram. Os módulos industriais, a escada e as funções comerciais não foram editados. Build produz os mesmos avisos preexistentes de `inputValidator()` depreciado e chunks grandes; não foram alterados para esta entrega. Não se tratam de erros de build.

Validação final: **34 testes do módulo** de domínio, recursos, geometria de grãos e fontes passaram; **29 verificações da interface** e **7 verificações adicionais por toque** passaram. A regressão existente reuniu **34 testes aprovados**: 10 LC-02, 16 industriais e 8 Trevisan. A inspeção da linha na primeira pessoa usa exatamente `node scripts/silo-engolfamento/validate-connected-line.mjs`; seu registro exige também a revisão visual da captura e não repete o benchmark.

Capturas, medições e resultados reais da execução ficam em [evidence/validation.md](evidence/validation.md) e [evidence/ui.json](evidence/ui.json). O benchmark distingue quadros ativos de pausa, perfil, câmera, DPR, chamadas/passes de sombra, triângulos, estimativas de memória e navegador/GPU observados. Memória é estimativa de arrays/texturas, não medição de VRAM, e exclui alinhamento do driver, PMREM e shadow map. CPU de render não equivale a tempo GPU. O modo automático usa janelas de 120 amostras, duas janelas lentas ou três rápidas e espera mínima de 8 s para mudar de nível; não altera tempo, seed ou restrições.

Consulte [delivery.md](delivery.md) para o registro final da entrega, capturas e resultados medidos.

## Limites práticos

Modelo de treinamento cinemático e de superfície, sem DEM, validação de fluxo de soja ou biomecânica. Acesso, fundações, sistema de proteção e resgate exigiriam projeto específico para uso real. O replay preventivo representa a entrada impedida, não autorização/PET efetivamente emitida. Não existe sensor atmosférico real, integração comercial ou número de produção neste módulo.

Medições locais e emulação de tela/touch não comprovam desempenho em telefone físico, iOS, estabilidade térmica ou desempenho universal. Perda de contexto e recursos são testadas por injeção controlada; renderização em ambiente de produção e operação real não são inferidas dessas verificações. Não houve migração, publicação, mudança de produção ou alteração dos originais industriais.
