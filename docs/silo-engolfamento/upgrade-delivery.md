# Entrega do upgrade Nexus — silo interno LVHF

Data da execução: 15/10/2026. Configuração `nexus-lvhf-2.0.0`. Base publicada conferida: PR #11, head `bc90e2d20403cfb9a2941263e71ad2984ac71b80`, integrada em `4b663b9d0386900997c2113fda86c7a5a1f00d4c`. Desenvolvimento na branch `codex/silo-lvhf-upgrade`, criada sobre `origin/main`; sem reescrever histórico Lovable, merge ou publicação em produção.

A [tabela final de critérios](upgrade-validation.md) reúne condição testada, resultado medido, evidência e pendência. Os relatórios brutos abaixo permitem conferir cada aprovação e seus limites.

## Comportamento entregue

A biblioteca `/mapas-3d/unidades` abre uma experiência independente em `/mapas-3d/silo-engolfamento`, com shell isolado, carregamento lazy e SSR desativado. O módulo continua em Three.js direto 0.186.0, com um renderer, um controlador de câmera e um ciclo de vida por instância. O catálogo não cria canvas nem antecipa modelos da cena.

| Área               | PR #11                                         | Implementação do upgrade                                                                                                        |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Implantação        | Silo elevado R3 m, tremonha, pilares e pórtico | Silo de fundo plano R11 m, costado 24,88 m, topo 30,403 m, fundação apoiada no pátio                                            |
| Proteção           | Ponto externo fixo                             | Anel interno R10,926 m/y24,375 m, cabo Ø8 mm, ancoragem, dez passantes, esticador, trole e conexão dorsal                       |
| Caminho            | Caminhada central curta                        | Percurso periférico, volta determinística de 80 s e incidente local coerente com a nova posição                                 |
| Incidente          | Descarga central/tremonha                      | Colapso localizado ilustrativo, com redistribuição de integral nula e comparativo com mesmo roteiro livre                       |
| Inspeção           | Quatro destaques                               | Registro único de sistema/estrutura; busca, seleção no modelo/índice, foco, isolamento e restauração                            |
| Navegação          | Órbita frontal limitada                        | Órbita externa 360°, sete vistas técnicas, quatro perspectivas do incidente, vista anterior e acompanhamento explícito do trole |
| Interface          | Laterais/HUD permanentes                       | Identidade Nexus escura, cena ampla, painéis sob demanda, inspetor 336 px e bottom sheet móvel                                  |
| Geometria/recursos | Composição do silo pequeno                     | Chapas corrugadas, fundação, abertura real na cobertura, acesso de apresentação e materiais/ambiente procedurais locais         |
| Falhas             | Base anterior                                  | Erros recuperáveis de WebGL/recursos, timeout explícito, perda/restauração de contexto e descarte dos recursos próprios         |

Os técnicos continuam usando os GLBs articulados existentes; não foram substituídos por manequins geométricos. A conexão limita deslocamento geométrico, sem declarar salvamento ou animar extração de vítima aprisionada. Prevenção mantém ambos fora da massa. Níveis de exploração incompatíveis retiram os técnicos da superfície em vez de alongar a corda.

## Arquitetura e contratos

| Autoridade                | Arquivos                                                                                  | Contrato                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Configuração/proveniência | `SiloConfig.ts`, `LifeLinePath.ts`                                                        | Metros, Y vertical, origem na fundação, θ0 em +Z crescendo para +X; fonte/unidade/fidelidade por parâmetro                  |
| Domínio                   | `simulation.ts`, `GrainField.ts`                                                          | Relógio determinístico, passo limitado, seek/replay, suporte/volume e extremos da conexão; sem DOM/Three                    |
| Representação             | `SiloModel.ts`, `ProtectionSystem.ts`, `Workers.ts`, `GrainRenderer.ts`, `Environment.ts` | Geometria e rig derivados do domínio; buffers/materiais reutilizados; sem autoridade própria de tempo                       |
| Câmeras                   | `CameraController.ts`, `cameraGeometry.ts`                                                | Enquadramento por bounds/aspecto/região livre, transições interrompidas por gesto, near/far de inspeção, olhos reais do rig |
| Inspeção                  | `ComponentRegistry.ts`, `InspectionController.ts`                                         | IDs estáveis, fontes/relações, bindings da cena, proxies de toque, isolamento reversível e seleção sem arraste acidental    |
| Interface                 | `SiloViewer.tsx`, `silo.css`, `IncidentAnalysis.tsx`                                      | Comandos explícitos, um painel secundário por vez, HUD publicado em 10 Hz, relatórios sem destruir a cena                   |
| Recursos                  | `SiloScene.ts`, `performance.ts`, `contextResources.ts`                                   | Prontidão progressiva, histerese de qualidade, pausa oculta, render sob demanda, cancelamento e descarte por proprietário   |

Sair do incidente pausa e conserva seu instante. Voltar exige comando para retomar. A exploração conserva sua vista e seleção quando possível. Câmera, corte, painéis e qualidade não mudam cenário, tempo, massa, comprimento ou desfecho. A câmera não troca automaticamente durante a simulação.

O fundo plano usa volume cilíndrico e não conserva fórmulas da tremonha antiga. O perfil local tem integral analítica zero; a superfície contínua envolve os membros. A representação granular mantém escala milimétrica em regiões relevantes, sem um corpo rígido por grão. A configuração dos suportes e a transposição continuam identificadas como representação cinemática paramétrica.

## Recursos e cinco referências complementares

O anexo dos cinco repositórios foi lido integralmente e suas recomendações foram avaliadas contra as versões instaladas. A [matriz de referências](upgrade-references.md) liga cada prática a arquivos, licença, revisão consultada, teste e limite: ThatOpen para responsabilidades/inspeção; camera-controls para foco/cancelamento; three-mesh-bvh para consultas limitadas; glTF Transform para preparação/auditoria; three-gltf-viewer para diagnóstico de materiais/rig. Nenhum código foi copiado para o runtime e nenhuma dependência foi acrescentada.

Três GLBs públicos da referência foram auditados somente em TEMP, com hashes, medidas, eixos e pivôs em [reference-assets-audit.json](evidence/reference-assets-audit.json). O [relatório geométrico](model-and-reference-audit.md) explica quais dados foram medidos e quais são aproximações Nexus. Os binários da referência não foram redistribuídos; licença das ferramentas não autoriza seus modelos. Os técnicos CC0 já isolados na PR anterior foram preservados e auditados em [asset-audit.json](evidence/upgrade/asset-audit.json). O [manifesto](../../public/models/silo-engolfamento/upgrade-manifest.json) registra origem, direitos disponíveis, hashes, bytes, triângulos, materiais, texturas, eixos, pivôs e fidelidade.

O raio externo publicado de 11,32 m é envelope, não espessura de chapa. Piso, fundação, extração de apresentação e acessos sem desenho executivo estão rotulados como hipóteses. Não há rede suspensa adicionada nem atribuição de capacidade/certificação à chapa.

## Verificação e evidências

As tabelas executáveis separam aprovado, não atingido e não verificado. A [tabela de navegador](evidence/upgrade/validation-table.md) contém condição, resultado medido, evidência e pendência por critério. A [tabela de toque](evidence/upgrade/touch-validation-table.md) registra os gestos e comandos emulados. Os resultados numéricos de volume, trajetória, rig e conexão estão em [upgrade-domain.md](upgrade-domain.md). Screenshots não certificam transposição mecânica; testes numéricos não aprovam acabamento visual.

A execução integral de navegador terminou com **34 verificações aprovadas, oito amostras de desempenho e zero erros inesperados**. O toque emulado passou **19 verificações**, em retrato e paisagem. A volta contínua de 80 s não recebeu comandos de seek, câmera ou qualidade durante a reprodução: vinte checkpoints mantiveram a câmera dentro do costado e a conexão coincidente com o rig; o fechamento da câmera teve resíduo de 1,12 × 10⁻¹⁴ m. Capturas em 16/32/48/64/80 s e os valores brutos estão em `ui.json`. A [tentativa anterior](evidence/upgrade/attempt-before-recovery-fixes/ui.json) pausou em 39,7486 s sem registrar o motivo; a causa permanece indeterminada. O protocolo final registra visibilidade, motivo e últimos tempos de quadro. Duas voltas completas posteriores, diagnóstica e integral, passaram sem pausa; não se atribui esse resultado a uma correção causal não demonstrada.

A transição da vista geral para o acompanhamento também foi medida quadro a quadro. O limite de distância anterior causava um salto de 69,95 para 15 m no primeiro quadro; o limite agora acompanha a aproximação amortecida até assumir o orçamento de close-up. A posição final fica a 1,15 m do olhal, usando referencial tangente/radial, com passagem pelos onze pontos e pelo fechamento angular. Gestos interrompem o acompanhamento explicitamente.

Nas oito amostras finais, o p95 RAF foi **16,8 ms**: navegação externa, incidente e close-up do trole no desktop; incidente equilibrado e alto; e os três cenários com viewport móvel emulado. O perfil econômico chegou a **95 chamadas e 244.108 triângulos principais**; equilibrado e alto chegaram a 248.748 e 269.148 triângulos. Esses máximos pertencem a vistas diferentes e não são somados. Sombras, CPU de atualização, submissão, tick completo, duração, buffer real e recursos estimados constam por amostra em `ui.json`. DPR efetivo econômico 0,8; os perfis equilibrado/alto usam DPR 1 neste host de DPR 1.

Com os painéis fechados, a menor área líquida de cena entre Explorar/Simulação/primeira pessoa foi **81,88%** em 1366×768, **85,11%** em 1440×900, **83,24%** em 390×844 e **75,78%** em 844×390. O cálculo desconta controles sobrepostos, cabeçalho e transporte, sem reduzir os alvos de 44 px. Inspetor, leitura expandida, todas as quatro câmeras e saída após encobrimento foram exercitados nessas composições.

Os perfis CPU do algoritmo localizado usaram Chrome 155.0.8059.41, Windows 10.0.26200, Core i5-1035G1, Intel UHD/ANGLE Direct3D11, DPR 1, 1440×900 e qualidade econômica, sem outro teste de navegador concorrente. São amostras locais curtas, sem isolamento completo do sistema nem telefone físico. Esses perfis antecedem a reorganização da inicialização; a reprodução e as oito amostras canônicas de UI foram repetidas com o ambiente preparado e a compilação assíncrona.

| Segmento ativo                | Duração / velocidade | RAF p50 / p95 / p99   | CPU do tick p95 | Evidência                                |
| ----------------------------- | -------------------- | --------------------- | --------------: | ---------------------------------------- |
| Incidente 8–16 s              | 8 s / 1×             | 16,7 / 16,8 / 16,8 ms |          4,4 ms | `cpu-economic-after-dirty.json`          |
| Superfície variável 6–10 s    | 8 s / 0,5×           | 16,7 / 16,8 / 17,3 ms |          5,0 ms | `cpu-economic-after-dirty-changing.json` |
| Retenção/encobrimento 10–22 s | 12 s / 1×            | 16,7 / 16,8 / 16,9 ms |          4,1 ms | `cpu-economic-after-dirty-late.json`     |

Na coleta variável houve um pico de 66,8 ms de intervalo e 60,5 ms no tick, dos quais 58,8 ms na submissão do renderer. O p95 cumpre a meta nessa condição; esse pico continua registrado, sem atribuição causal à GPU porque seu tempo não foi medido.

A investigação anterior encontrou a reconstrução integral das normais como custo dominante. Cache da massa estável resolveu somente parte do roteiro: a fase variável ainda tinha p95 de 33,3 ms. O atualizador final modifica 96 vértices e 158 normais dos 18.761, usando todas as faces adjacentes na mesma ordem de soma Float32. Vinte estados de avanço, retorno, mudança de modo e nível produziram buffers de posições/normais exatamente iguais ao cálculo completo. O contador instrumentado encontrou zero reconstruções integrais do bulk nas três coletas finais; a pequena face de corte tem 130 vértices e orçamento separado.

O [benchmark CPU isolado](evidence/upgrade/bulk-cpu-benchmark.json), com 200 amostras por método, duas rodadas de aquecimento e ordem alternada, comparou a mesma malha e os mesmos 20 estados: p50/p95 de 8,956/10,072 ms no atualizador integral e 0,0193/0,0473 ms no localizado. Isso mede apenas a atualização da massa, não FPS da cena. A câmera frontal também foi corrigida durante o desenvolvimento; por isso a diferença entre perfis completos anteriores e finais não é atribuída exclusivamente ao algoritmo.

Arquivos `ui.json`, `touch-commands.json`, `production-loading.json` e os perfis CPU preservam suas condições reais. Os resultados históricos da PR #11 não são atribuídos ao upgrade. O baseline foi reexecutado em checkout separado do head exato: [comparação PR11](evidence/baseline-pr11/comparison.json) e [carga PR11](evidence/baseline-pr11/production-loading.json). Vite regenerou somente os finais de linha de `routeTree.gen.ts`; o blob normalizado e o diff confirmaram igualdade com o head. O checkout temporário foi arquivado depois da coleta.

O preview Wrangler-local precisou do argumento `--compatibility-date 2026-09-18`: o workerd instalado não suporta a data 2026-10-12 configurada no build. Essa substituição ocorreu somente no comando de teste, igualmente para baseline e upgrade. A configuração de publicação foi preservada. Os bytes e tempos desse preview não comprovam uma implantação nem rede móvel.

## Carga final e preparação de shaders

A investigação de partida encontrou aproximadamente 958 ms de espera síncrona nos programas do PMREM e 1.319 ms no primeiro render, contra cerca de 4 ms nas chamadas CPU de upload de geometria. A [instrumentação de startup](startup.md) registra o sobrecusto do profiler e distingue essas chamadas de tempo GPU. A solução mantém o ambiente original de 256 pixels por face, preparado uma vez como [recurso local](environment-map.md), com 75.806 bytes. Três sondas PBR no WebGL real diferiram no máximo um nível RGB8; não foi necessário um material provisório ou reduzir a qualidade final.

O renderer prepara os programas com `compileAsync`, desenha a cena essencial e só então inicia os técnicos. Rigs e conexão ficam ocultos até sua preparação; a prontidão da simulação só é publicada após um quadro com os técnicos. É o mesmo renderer e o mesmo relógio. Nove contratos de inicialização e oito de recuperação passaram, incluindo descarte durante compilação, perda/restauração de contexto, ausência da extensão paralela, timeout, ambiente ausente e corte durante a espera pelos GLBs.

| Medida desde a origem do documento |  Frio HTTP | Quente HTTP | Meta / interpretação                                    |
| ---------------------------------- | ---------: | ----------: | ------------------------------------------------------- |
| Primeira exploração desenhada      | 2.429,7 ms |  1.321,3 ms | Abaixo do alvo local de 3.000 ms                        |
| Primeiro quadro com técnicos       | 4.126,3 ms |  2.217,6 ms | Abaixo do alvo local de 5.000 ms                        |
| Bytes de rede codificados          |  4.857.736 |     191.176 | Inclui o ambiente local; GLBs continuam 3.992.572 bytes |
| Construção CPU da cena             |   224,3 ms |    157,2 ms | Não é prontidão visual                                  |
| Espera dos programas essenciais    |   527,9 ms |     52,7 ms | Tempo transcorrido, não timer GPU                       |
| Espera dos programas dos técnicos  |   566,4 ms |     32,3 ms | Técnicos ocultos até a preparação                       |

A [coleta final](evidence/upgrade/production-loading.json) usou o build de produção local, Chrome 155, 1440×900, mesmo host/driver das medições ativas, DPR do dispositivo 1 e perfil inicial econômico. Frio significa contexto HTTP novo, sem expurgar caches de SO/driver; quente é reload no mesmo contexto. Não houve emulação de rede móvel. O maior long task inicial foi 696 ms, durante a carga dos rigs; heap JS usado na leitura de prontidão foi 40,14 MB frio/66,02 MB quente. Isso não mede pico de VRAM, heap máximo ou conclusão GPU.

A tentativa anterior do upgrade tinha exploração em 4.472,5 ms e declarava recursos prontos em 5.281,7 ms; ambos os registros foram preservados em [production-loading-before-startup.json](evidence/upgrade/production-loading-before-startup.json). A versão 3 corrigiu a semântica de prontidão: o indicador antigo não incluía o primeiro desenho dos técnicos. O baseline PR #11 também mede disponibilidade de recursos/domínio, portanto seus 4.808,7 ms não são apresentados como latência visual comparável ao quadro final. Bytes e reprodução ativa possuem comparações próprias sob as mesmas condições.

O build final, typecheck e lint direcionado passaram. A suíte completa passou **69/69**, sem falhas ou skips; regressões automatizadas industrial/Trevisan/escada passaram **16/16, 8/8 e 10/10**. Os comandos e logs estão em [final-verification.json](evidence/upgrade/final-verification.json). O build preserva avisos de depreciação/configuração existentes nas ferramentas e funções comerciais. Uma primeira tentativa encontrou o preview anterior mantendo `.output/public` aberto no Windows; encerrar esse processo e repetir resolveu o bloqueio, sem alterações no código para contorná-lo.

A revisão manual no navegador do build de produção conferiu a entrada pela biblioteca, trole, ficha, isolamento/restauração, encobrimento em primeira pessoa de B, saída e retorno à exploração. O retorno ao tamanho nativo do painel Codex revelou um cabeçalho apertado em 331×502; a legenda secundária agora é recolhida abaixo de 375 px. A [conferência final de layout](evidence/upgrade/layout-final/ui.json) repetiu os quatro formatos exigidos; [três estados no build de produção em 331×502](evidence/upgrade/layout-final/narrow-331x502.json) passaram com título e controles contidos. Apenas essa regra CSS mudou após a suíte integral; não houve alteração de JavaScript, física ou recursos. Build e carga foram repetidos após a correção.

## Reprodução local

Com as dependências do lockfile instaladas, executar na raiz do repositório, em terminais separados quando houver servidor ativo:

```powershell
npm run typecheck
npm run test:silo
npx eslint src/silo-engolfamento src/routes/mapas-3d_.silo-engolfamento.tsx src/routes/mapas-3d_.unidades.tsx scripts/silo-engolfamento tests/silo-engolfamento.test.ts tests/silo-evidence.test.ts tests/silo-engolfamento
npm run test:industrial
npm run test:trevisan
npm run test:escada
npm run build
```

Para as verificações funcionais e de toque, iniciar o Vite e manter somente uma execução de navegador de cada vez:

```powershell
npm run dev -- --host 127.0.0.1 --port 5185
```

```powershell
$env:SILO_URL = 'http://127.0.0.1:5185'
npm run test:silo:ui
npm run test:silo:touch
```

O comando de UI inclui a suíte de inicialização e suas falhas controladas. Os testes usam Chrome instalado e Chromium/Playwright; toque e viewports móveis são emulação desktop. Para repetir a medição de bytes e prontidão, encerrar qualquer preview anterior antes do build no Windows e iniciar o build pronto em outro terminal:

```powershell
npx wrangler dev --config .output/server/wrangler.json --ip 127.0.0.1 --port 5190 --local --compatibility-date 2026-09-18
```

```powershell
$env:SILO_URL = 'http://127.0.0.1:5190'
$env:SILO_RUNTIME_NOTE = 'Wrangler local; compatibility-date override only for the installed workerd'
npm run test:silo:loading
```

As medições sobrescrevem os arquivos de saída correspondentes e devem ser repetidas sob condições registradas, sem outro navegador de teste concorrente. `SILO_OUTPUT` permite preservar uma nova rodada em outro diretório. A preparação do ambiente próprio pode ser repetida com `node scripts/silo-engolfamento/bake-environment-map.mjs`; a conferência dos recursos locais usa `node scripts/silo-engolfamento/audit-assets.mjs`. Não é necessário baixar os GLBs da referência para executar a experiência.

## Comparação visual e vistas conferidas

O [baseline executado](evidence/baseline-pr11/comparison.json) usa o head exato da PR #11. As cenas têm geometrias, exposição e mecanismo diferentes; a comparação mostra apresentação e carga de renderização, sem atribuir resultados humanos à mudança de proteção.

Na amostra equivalente de 8 s ativos, 1440×900, perfil econômico e mesmo host/navegador, o RAF p95 permaneceu em 16,8 ms. A CPU de submissão p95 foi de 1,8 ms na PR #11 e 2,6 ms no upgrade; os triângulos principais passaram de 147.398 para 211.220. O modelo maior tem outro trabalho de renderização e outro roteiro: essa comparação não demonstra ganho global de FPS ou equivalência física dos incidentes. Os registros completos estão no [baseline](evidence/baseline-pr11/comparison.json) e na [coleta do upgrade](evidence/upgrade/comparison/comparison.json).

| Condição                           | Antes — PR #11                                                   | Depois — upgrade                                                   |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Desktop 1440×900, incidente em 8 s | [Captura anterior](evidence/baseline-pr11/1440x900-incident.png) | [Captura atual](evidence/upgrade/comparison/1440x900-incident.png) |
| Notebook 1366×768                  | [Captura anterior](evidence/baseline-pr11/1366x768-incident.png) | [Captura atual](evidence/upgrade/comparison/1366x768-incident.png) |
| Retrato 390×844                    | [Captura anterior](evidence/baseline-pr11/390x844-incident.png)  | [Captura atual](evidence/upgrade/comparison/390x844-incident.png)  |
| Paisagem 844×390                   | [Captura anterior](evidence/baseline-pr11/844x390-incident.png)  | [Captura atual](evidence/upgrade/comparison/844x390-incident.png)  |

| Vista do upgrade                               | Evidência                                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silo externo, contato com o terreno e fundação | [Geral externa](evidence/upgrade/1440-inspection-general.png)                                                                                                                                              |
| Interior e percurso superior                   | [Corte interno](evidence/upgrade/1440-inspection-internal.png), [anel](evidence/upgrade/1440-inspection-ring.png)                                                                                          |
| Boca recortada, tampa e acesso                 | [Boca de visita](evidence/upgrade/1440-index-manhole.png)                                                                                                                                                  |
| Ancoragem, esticador e passante                | [Região de ancoragem](evidence/upgrade/1440-inspection-anchor.png), [passante selecionado](evidence/upgrade/1440-scene-selected-passant04.png)                                                             |
| Trole e transposição ilustrativa               | [Close-up](evidence/upgrade/1440-inspection-trolley.png), [suporte 0](evidence/upgrade/1440-follow-support-0.png), [suporte 10](evidence/upgrade/1440-follow-support-10.png)                               |
| Conexão dorsal e cinturão                      | [Dorsal](evidence/upgrade/1440-inspection-dorsal.png), [retrato](evidence/upgrade/390-inspection-dorsal.png)                                                                                               |
| Caminhada, perda de apoio e encobrimento       | [4 s](evidence/upgrade/1440-incident-time-4.png), [8 s](evidence/upgrade/1440-incident-time-8.png), [12 s](evidence/upgrade/1440-incident-time-12.png), [25 s](evidence/upgrade/1440-incident-time-25.png) |
| Primeiras pessoas e saída após oclusão         | [A](evidence/upgrade/1440-incident-connected.png), [B](evidence/upgrade/1440-incident-victim.png), [encobrimento](evidence/upgrade/1440-victim-occluded.png)                                               |
| Painel técnico nas quatro composições          | [390×844](evidence/upgrade/390x844-panel.png), [844×390](evidence/upgrade/844x390-panel.png), [1366×768](evidence/upgrade/1366x768-panel.png), [1440×900](evidence/upgrade/1440x900-panel.png)             |

## Limites externos concretos

| Critério                                 | Condição                                          | Estado         | Consequência / procedimento restante                                                                                                      |
| ---------------------------------------- | ------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| STEP e desenhos executivos               | Não recebidos/localizados                         | Não verificado | Conferir fixação, reforço, cargas, pivôs e passagem mecânica com recurso autorizado do fabricante                                         |
| Redistribuição do CAD da referência      | Autorização de uso não publicada/recebida         | Não verificado | Binários externos não entram no produto; mantém-se reconstrução paramétrica própria                                                       |
| Cinco anexos de imagem nomeados          | Ausentes na busca limitada ao workspace/Downloads | Não verificado | Referência pública e recursos locais usados; não se alega leitura de imagens não recebidas                                                |
| Android/iOS físico e rede móvel          | Hardware indisponível                             | Não verificado | Repetir navegação, incidente e close-ups no telefone intermediário, registrando aparelho, SO, navegador, DPR, rede, duração e temperatura |
| Tempo GPU/VRAM real                      | Sem timer GPU coletado                            | Não verificado | CPU de submissão, RAF e estimativa de buffers são registrados separadamente; não representam conclusão GPU                                |
| Dimensionamento/procedimento operacional | Fora da autoridade da simulação                   | Não verificado | Requer projeto, documentos do fabricante, controles de entrada, bloqueio e resgate específicos                                            |

O incidente é uma reconstituição educativa de condição insegura. Conexão não autoriza caminhar sobre grãos em movimentação. A interface mantém dados observáveis e hipóteses identificadas; SpO₂ permanece indisponível, sem prognóstico de sobrevivência. A série Purdue da PR anterior permanece EUA/grãos em geral, com proveniência/data preservadas, sem inferência sobre Brasil, soja ou vidas salvas. As fontes oficiais e suas datas ficam no painel técnico, sem carimbar conformidade normativa do modelo.
