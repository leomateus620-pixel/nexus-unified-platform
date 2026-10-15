# Domínio, grãos e conexão — upgrade LVHF Nexus

Configuração: `nexus-lvhf-2.0.0`. Verificação local: 15/10/2026. Este documento registra o comportamento implementado e as verificações numéricas; capturas, navegação e desempenho gráfico têm evidências próprias e não são inferidos destes testes.

## Contrato dimensional

`src/silo-engolfamento/SiloConfig.ts` distingue `published`, `mesh-verified` e `presentation-assumption` por parâmetro, com unidade, fonte e nota. Metros, Y vertical, origem no centro da fundação; θ = 0 em +Z, crescendo em direção a +X: `x = R sin θ`, `z = R cos θ`.

| Parâmetro                |                Valor | Proveniência/limite                                                                           |
| ------------------------ | -------------------: | --------------------------------------------------------------------------------------------- |
| Raio interno             |                 11 m | Publicado na referência                                                                       |
| Envelope externo         |              11,32 m | Publicado; não representa chapa de 320 mm                                                     |
| Altura do costado / topo |     24,88 / 30,403 m | Publicado                                                                                     |
| Anel LVHF                | R10,926 m; y24,375 m | Publicado                                                                                     |
| Cabo                     |                Ø8 mm | Publicado                                                                                     |
| Pontos principais        |                   11 | Uma ancoragem em zero e dez passantes em `i × 2π / 11`                                        |
| Esticador                |                10,3° | Adjacente; não é um suporte equidistante adicional                                            |
| Superfície inicial       |              22,60 m | Preset publicado                                                                              |
| Piso interno / pátio     |     y0,18 / −0,177 m | Hipóteses de apresentação                                                                     |
| Percurso dos técnicos    |             R10,15 m | Hipótese para afastamento humano do costado                                                   |
| Conexão total            |         0,95 m fixos | Conector vertical de 0,052 m + corda de até 0,898 m; hipótese Nexus, não especificação de uso |

O olhal do trole foi conferido no recurso público `trole_passante.glb` e na montagem publicada de `scene.js`: fica 94 mm abaixo do eixo nominal do cabo e 15,5 mm radialmente para fora. Os 90 mm publicados são o datum da peça, aos quais a montagem acrescenta o deslocamento do cabo. Fonte: [GLB de referência](https://lvhfinternsilo.pplx.app/assets/trole_passante.glb), SHA-256 `8aa8c3393152958b511144be59363ace48b564118ddc3c1a1747a25ba0c4505c`. A auditoria de origem fica em `evidence/reference-assets-audit.json`. A conferência desse datum não certifica dimensões resistentes nem transposição mecânica do conjunto paramétrico Nexus.

## Motor e modos

`simulation.ts` continua independente de DOM, Three.js e React. Uma avaliação direta reconstrói cada instante, inclusive em seek reverso. O avanço mantém passo de 1/60 s com limite de oito subpassos; excesso de dívida pausa no último instante apresentado. O HUD publica em 10 Hz de tempo real, também em câmera lenta. Câmera e qualidade gráfica não participam das equações.

| Comando                            | Contrato                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `setExperience('explore')`         | Pausa a reprodução e mostra o nível de exploração; não altera o incidente salvo                |
| `setExplorationLevel(h)`           | Aceito somente em exploração; limita h ao piso/costado                                         |
| `setExperience('lvhf')`            | Demonstração determinística de uma volta em 80 s, com início/fim amortecidos                   |
| `setExperience('incident')`        | Restaura instante e cenário do incidente; não retoma automaticamente                           |
| `setExperience('prevention')`      | Ambos os técnicos permanecem fora da massa, apoiados no pátio; sem movimentação                |
| `setScenario(...)`                 | Pausa antes da alteração explícita; comparação e replay sem conexão usam o mesmo roteiro livre |
| `seek`, `reset`, `pause`, `resume` | Reconstrução sem resíduos de posição, volume, pés, rig ou conexão                              |

A duração é consultada em `getDuration()`: 80 s no percurso, 30 s no incidente/prevenção. `frame.trolley.distance` é a coordenada de arco absoluta, sem normalização destrutiva. `travelledDistance` começa em zero para os indicadores. A orientação usa a tangente analítica; o giro das roldanas deriva do deslocamento e do raio de 17 mm, sem relógio próprio.

Ao explorar níveis que diferem mais de 8 cm do preset, `supportAvailable` fica falso, os técnicos são retirados da massa e a conexão é desativada. A apresentação oculta A/B nessa condição; não há caminhada no ar ou alongamento automático. No modo prevenção `supportAvailable` é verdadeiro porque os técnicos estão apoiados no pátio externo, não nos grãos.

## Incidente único: perda localizada de apoio

A tremonha antiga deixa de participar do volume e da animação. O fundo é plano. Duas regiões espelhadas estão junto ao perímetro traseiro, em θ = π ± 0,12 rad, para exposição equivalente e visibilidade no corte técnico. Antes da perda de apoio cada técnico percorre aproximadamente 0,609 m sobre o mesmo raio.

O roteiro ilustra colapso localizado de crosta e aprisionamento progressivo. Não calcula resistência de uma crosta, contato entre grãos, vazio subterrâneo, força de retenção, dano humano ou resgate. Não há descarga externa nem emissor de grãos sob o piso. `frame.flow` representa intensidade visual de redistribuição interna. O nome histórico `dischargeAt` permanece como compatibilidade: `discharged` é zero; `mobilised` é a integral usada pelo roteiro. `hopperTop` é apenas alias do piso e `HOPPER_VOLUME` é zero; nenhuma fórmula de tremonha continua ativa.

A/B compartilham nível, seed, perfil local e roteiro livre. A comparação causal mais direta é o replay do próprio A com e sem conexão; os rigs de A/B têm pequenas diferenças antropométricas. A conexão limita a descida precocemente e não içará alguém profundamente aprisionado. Um técnico retido continua em emergência; não há declaração automática de salvamento.

## Conservação de massa e representação

Para o cilindro de fundo plano, `V = πR² × max(0, h − y_piso)`, limitado à altura do costado. O preset armazena aproximadamente 8.522,575 m³ e o incidente conserva esse volume.

Cada região tem raio externo b = 0,75 m e núcleo a = 0,48 m. Para `B(r,R) = max(0, 1 − r²/R²)²`, o perfil é:

`D × [(a²/b²) B(r,b) − B(r,a)] / [1 − a²/b²]`.

Como a integral de B é `πR²/3`, o perfil completo tem integral zero. A depressão central tem redistribuição positiva no próprio entorno; as duas regiões não se sobrepõem e permanecem contidas no costado. Fora delas a superfície permanece no nível original. A redução dos movimentos segue o aprisionamento; o ciclo dos pés cessa após a perda de apoio.

`GrainRenderer.ts` mantém superfície/volume contínuos, detalhe procedural de escala milimétrica e um conjunto fixo de até 3.000 instâncias concentradas nas regiões observáveis dos técnicos. Perfis e distância reduzem detalhe sem alterar o domínio. O corte usa a mesma referência do metal; ocultar os grãos não altera apoio ou volume.

## Rig, corda e primeira pessoa

O domínio emite o olhal móvel, o ponto dorsal transformado por yaw/lean e o comprimento fixo. A restrição é calculada antes da representação. `Workers.ts` reconcilia o ponto esquelético dorsal com o ponto restrito, depois da pose; a corda termina nesse mesmo extremo real. Na outra ponta, o conector permanece vertical, atravessando o furo conferido do trole. `connection.ropeAnchor` fica exatamente 52 mm abaixo do ponto de apoio no olhal, na tangência da curva inferior do conector. Esses 52 mm são hipótese visual Nexus e integram o comprimento total fixo de 0,95 m; restam até 0,898 m para a curva da corda.

O domínio restringe `0,052 + distância(ropeAnchor, dorsal) ≤ 0,95 m`, incluindo a direção vertical do conector. `connection.distance` conserva a distância reta olhal–dorsal para leitura; `ropeDistance` mede os extremos da corda e `totalDistance` soma o alcance do conector. A folga da curva é calculada pelo orçamento restante da corda, inclusive sem tensão e em vetores diagonais. A primeira pessoa usa os olhos do esqueleto, e os testes confrontam a oclusão pela superfície com os olhos efetivos.

O percurso usa leve flexão de joelhos, sem deslocar os alvos das solas da superfície, para respeitar o alcance dos dois rigs reais. Não há troca por manequins geométricos. Os recursos humanos CC0 e suas identidades/hashes/LODs continuam auditados.

## Resultados executados

Comando completo do módulo, incluindo domínio, grãos, rigs, inspeção, modelo, ciclo de vida e proveniência:

```powershell
npm run test:silo
npm run typecheck
```

Resultado final da suíte completa: **69 testes aprovados**, zero falhas, cancelamentos ou skips; execução em 5,798 s. O typecheck e o lint direcionado dos módulos e testes modificados também passaram. O log está em [test-silo.tap](evidence/upgrade/test-silo.tap). Os valores abaixo vêm das execuções locais, não de estimativas.

| Critério                           | Condição testada                                                                                               |                                                                                               Resultado medido | Evidência                                               | Estado/pendência                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Relógio, replay e FPS              | 30/60/120 FPS; pausa, seek, reset e sobrecarga                                                                 |                                                                     Quadros de domínio equivalentes; HUD 10 Hz | `silo-engolfamento.test.ts`                             | Aprovado no domínio                                                                |
| Anel fechado e pontos              | Onze ângulos; dez passantes + ancoragem; região do esticador                                                   |                                                                         Desenvolvimento nominal 68,650082666 m | `silo-engolfamento.test.ts`                             | Aprovado numericamente                                                             |
| Percurso completo/reverso          | Uma volta em 80 s; cruzamento angular e seek reverso                                                           |                                                                                     Posição/tangente contínuas | `silo-engolfamento.test.ts`                             | Aprovado numericamente; compatibilidade mecânica não certificada                   |
| Volume do domínio                  | Quadratura independente dos perfis locais                                                                      |                                                            Integral residual dentro de 0,0000002 m³ por região | `silo-engolfamento.test.ts`                             | Aprovado                                                                           |
| Volume representado                | Malha completa em 0/8/15/22/30 s                                                                               |                                                                                Erro relativo máximo 0,4640456% | `grains.test.ts`                                        | Aprovado, abaixo de 2%                                                             |
| Contenção contínua dos grãos       | Projeção XZ dos 81.920 triângulos reais do costado, incluindo cordas angulares e vales verticais               |                              Costado mínimo R10,9795283875 m; massa máxima R10,9750004151 m; folga 4,527972 mm | `grains.test.ts`                                        | Aprovado, folga >4 mm; domínio inalterado                                          |
| Extremos/corda do rig              | 0/6/6,5/7/10/15/20/30 s; demonstração junto aos onze pontos                                                    |                                       Trajeto conector + corda ≤0,95 m; diferença dorsal máxima 7,38 × 10⁻¹⁵ m | `resources.test.ts`                                     | Aprovado no rig CPU                                                                |
| Comprimento da conexão visual      | Amostras a cada 0,5 s no incidente e volta, mais seek reverso; vetores diagonais sem tensão próximos ao limite |               Corda máxima 0,898000291 m + conector 0,052 m = total 0,950000291 m; resíduo Float32 0,000291 mm | `resources.test.ts`                                     | Aprovado; tolerância 0,05 mm; sem aumentar o limite de 0,95 m                      |
| Normais localizadas da massa       | 20 estados de deformação, relaxamento, níveis, troca de modo e seek reverso                                    | Buffer Float32 inteiro idêntico ao `computeVertexNormals` completo; 96 vértices móveis e 158 normais de 18.761 | `grains.test.ts`                                        | Aprovado; uma construção completa inicial, sem aproximação da normal               |
| Olhos e oclusão                    | Ambos os rigs nas oito amostras do incidente                                                                   |                                                          Diferença máxima 2,668 × 10⁻¹⁰ m; oclusão concordante | `resources.test.ts`                                     | Aprovado no rig CPU                                                                |
| Apoio real dos pés                 | Instantes de apoio no incidente; amostras ao longo da volta                                                    |                                 Erro máximo 13,69 mm no incidente / 14,28 mm na volta; deriva em apoio 9,80 mm | `resources.test.ts`                                     | Aprovado nos limites mantidos: alvo <30 mm, deriva <10 mm                          |
| Afastamento humano amostrado       | 26 poses; 480.116 vértices deformados near-LOD dos GLBs reais                                                  |                Menor afastamento do costado 0,4694 m; do cabo/helmet 0,6646 m; da cobertura analítica 0,9559 m | `evidence/upgrade/clearance-audit.json`                 | Aprovado nesta amostragem de vértices; não é teste de todos os contatos/triângulos |
| Níveis incompatíveis e prevenção   | Exploração em 0,18/5/14/21/23,8 m; saída/retorno entre modos                                                   |               Sem técnicos caminhando na massa fora de alcance; prevenção no pátio; incidente salvo preservado | `silo-engolfamento.test.ts`                             | Aprovado                                                                           |
| Estatística e indicadores          | Totais anuais, fontes e hipóteses explícitas                                                                   |                                                                 Série preservada: EUA/grãos; SpO₂ indisponível | `silo-evidence.test.ts`                                 | Aprovado; sem nova leitura epidemiológica alegada                                  |
| Ausência de interpenetração visual | Malhas deformadas e curva contra todos os componentes                                                          |                                                                                Não verificada por estes testes | Capturas/inspeção do visualizador têm relatório próprio | Não verificado neste conjunto                                                      |
| Transposição mecânica exata        | Trole, guias, ancoragem e terminais com desenhos do fabricante                                                 |                                                                           Sem validação mecânica de fabricante | Auditoria de referência + manifesto                     | Não verificado; representação cinemática identificada                              |
| Desempenho em telefone físico      | Android/iOS intermediário                                                                                      |                                                                             Não executado por estes testes CPU | Medições gráficas têm relatório próprio                 | Não verificado neste conjunto                                                      |

## Perfil CPU e atualização localizada da massa

A coleta inicial encontrou `GrainRenderer` em 62,03% das amostras CPU e `computeVertexNormals` em 45,30%. O renderer submetia o quadro em p95 de 2,6 ms, enquanto a preparação consumia p95 de 13,6 ms: medir somente `render()` ocultava o custo principal. O cache por `surfaceHeight` e `depression` resolveu os trechos de superfície constante, mas o segmento variável de 6 a 10 s ainda apresentou p95 RAF de 33,3 ms e preparação de 14,1 ms. As evidências intermediárias foram preservadas em `cpu-economic-baseline.*` e `cpu-economic-after-cache*.{json,cpuprofile}`.

A atualização final pré-calcula o perfil espacial e as adjacências. Apenas 96 dos 18.761 vértices mudam durante a deformação localizada; 158 normais abrangem todas as faces adjacentes afetadas, incluindo as faces fora do núcleo. A ordem de soma e o arredondamento Float32 após cada face reproduzem o algoritmo completo de Three.js. Os testes confrontam o buffer inteiro em 20 estados de ida/volta e troca de modo/nível. A superfície e o volume conservados são os mesmos. O detalhe de grãos e os técnicos continuam se atualizando quando a massa principal permanece constante.

Os três perfis finais usaram Windows, Chrome 155.0.8059.41 headless, Intel Core i5-1035G1, Intel UHD via ANGLE/D3D11, viewport 1440×900 CSS, DPR do dispositivo 1 e qualidade econômica fixa, cujo DPR de renderer é limitado a 0,8. Aplicação local em `127.0.0.1:5185`, aquecimento de 2,5 s, sem outra tarefa de navegador ou teste pesado em paralelo. A rede foi local; estes perfis não são ensaios de carregamento frio. O profiler CDP amostrou CPU em intervalos nominais de 1 ms e acrescenta custo próprio. Não houve medição de tempo GPU.

| Segmento ativo               | Janela real / amostras RAF | RAF p50 / p95 / p99   | Maior intervalo RAF | Preparação CPU p95 / quadro completo CPU p95 | Evidência                                                 |
| ---------------------------- | -------------------------- | --------------------- | ------------------: | -------------------------------------------- | --------------------------------------------------------- |
| Incidente 8–16 s, 1×         | 8 s / 482                  | 16,7 / 16,8 / 16,8 ms |             17,4 ms | 2,0 / 4,4 ms                                 | `evidence/upgrade/cpu-economic-after-dirty.json`          |
| Deformação 6–10 s, 0,5×      | 8 s / 478                  | 16,7 / 16,8 / 17,3 ms |             66,8 ms | 2,4 / 5,0 ms                                 | `evidence/upgrade/cpu-economic-after-dirty-changing.json` |
| Incidente tardio 10–22 s, 1× | 12 s / 720                 | 16,7 / 16,8 / 16,9 ms |            33,23 ms | 2,0 / 4,1 ms                                 | `evidence/upgrade/cpu-economic-after-dirty-late.json`     |

O p95 local ficou abaixo da meta de 20 ms nos três segmentos. O pico isolado de 66,8 ms do segmento variável permanece registrado: seu quadro completo CPU chegou a 60,5 ms, com 58,8 ms dentro da submissão do renderer; os dados não separam a causa GPU/driver desse pico. Cada coleta terminou sem `pageerror`. O último quadro registrou 58 chamadas e 211.220 triângulos principais. A instrumentação observou zero chamadas dinâmicas de `computeVertexNormals` para a massa de 18.761 vértices; houve 122/476/1 chamadas na pequena face de corte de 130 vértices, respectivamente. Na janela variável, `GrainRenderer` representou 6,18% das amostras CPU, Workers 4,80%, React 12,10% e idle 53,85%.

O enquadramento frontal foi corrigido de −Z para +Z entre os perfis iniciais e finais, tornando a região real do corte visível. Portanto, o delta total entre essas coletas não é uma comparação de vistas idênticas e não é atribuído integralmente à otimização. Os relatórios finais registram câmera e hashes dos módulos para expor essa diferença. Os resultados também não comprovam telefone físico, todos os perfis gráficos ou todas as vistas.

Uma comparação CPU isolada controla essa diferença: clones idênticos da mesma geometria, atualização antiga completa `surfaceAt + computeVertexNormals` e a função privada real de produção, sem renderer, instâncias locais, rig ou React em qualquer alternativa. Foram dois aquecimentos e dez repetições por método, alternando a ordem, com os mesmos 20 estados. Os buffers Float32 de posição e normal foram exatamente iguais. Em 200 atualizações por método, o p50/p95 caiu de **8,9555/10,0718 ms** para **0,0193/0,0473 ms**. Isso mede somente CPU de atualização da massa em Node, sem equivaler a FPS ou aceleração global do visualizador. A implementação medida e o hash ficam em `evidence/upgrade/bulk-cpu-benchmark.json`.

Comandos reproduzíveis, executados em série e sem outro navegador ativo:

```powershell
$env:SILO_PROFILE_TAG='after-dirty'
$env:SILO_PROFILE_START='8'
$env:SILO_PROFILE_RATE='1'
$env:SILO_PROFILE_MS='8000'
node scripts/silo-engolfamento/profile-cpu.mjs

$env:SILO_PROFILE_TAG='after-dirty-changing'
$env:SILO_PROFILE_START='6'
$env:SILO_PROFILE_RATE='0.5'
node scripts/silo-engolfamento/profile-cpu.mjs

$env:SILO_PROFILE_TAG='after-dirty-late'
$env:SILO_PROFILE_START='10'
$env:SILO_PROFILE_RATE='1'
$env:SILO_PROFILE_MS='12000'
node scripts/silo-engolfamento/profile-cpu.mjs

npx tsx scripts/silo-engolfamento/benchmark-bulk.mts
```

## Fontes e limites mantidos

`IncidentAnalysis.tsx` explica o colapso e os controles preventivos; não descreve mais a descarga externa antiga como causa deste roteiro. `sources.ts` inclui a referência LVHF, distingue a fonte histórica do silo elevado e mantém a data/proveniência da série epidemiológica anterior. Os números de `incidentStatistics.ts` não foram alterados nem reinterpretados como estatística brasileira, de soja ou de eficácia do produto.

O [texto oficial OSHA 1910.272](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.272), consultado em 15/10/2026, foi usado para conferir a separação entre movimentação de grãos, bloqueio, condição de ponte/acúmulo, observador e resgate. É referência dos EUA; a aplicação brasileira e as regras setoriais dependem do estabelecimento e da atividade. O modelo não emite PET, capacidade admissível ou atestado de conformidade.

O STEP/CAD original e a documentação de aprovação do fabricante não foram obtidos. Alguns GLBs públicos foram somente examinados para dados de referência; o silo e o sistema Nexus continuam recursos paramétricos próprios. Os testes geométricos e de rig não substituem inspeção estética, avaliação de colisão mecânica, hardware físico ou validação de entrada/resgate.

Auditoria reproduzível dos afastamentos dos vértices deformados, executada sem GPU:

```powershell
npx tsx scripts/silo-engolfamento/audit-clearance.mts docs/silo-engolfamento/evidence/upgrade/clearance-audit.json
```

O script lê os GLBs locais, desativa apenas os mapas para a análise CPU e avalia costado cilíndrico, toro nominal do cabo e cobertura cônica analítica. Não testa cabo/corda contra cada triângulo do corpo, ferragens contra guias ou dimensões resistentes. O relatório retém instantes, quantidade de vértices e pontos críticos para auditoria.
