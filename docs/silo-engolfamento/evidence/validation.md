# Evidência automatizada do silo

Execução: 2026-10-14T10:34:11.589Z. Navegador: 155.0.8059.41.
Resultado: 29 verificações passaram; 0 falhas.

Local Chrome headless; 390×844 and touch are Chromium emulation, not a physical telephone.

Os valores abaixo incluem somente quadros de reprodução ativa. Pausa e transições prévias foram excluídas. Reprodução em 0,5× para limitar sobrecarga sem alterar a seed ou o domínio.

| Perfil   | Câmera  | Ambiente              | Quadros | Mediana ms | p95 ms | CPU p95 ms | Draw calls totais máx. | Triângulos sem sombra máx. |
| -------- | ------- | --------------------- | ------: | ---------: | -----: | ---------: | ---------------------: | -------------------------: |
| economic | frontal | Desktop 1440×1000     |     150 |      16.70 |  16.70 |       2.50 |                     61 |                     147398 |
| economic | victim  | Desktop 1440×1000     |     150 |      16.70 |  16.80 |       1.90 |                     44 |                     178531 |
| balanced | frontal | Desktop 1440×1000     |     150 |      16.70 |  16.80 |       2.40 |                     61 |                     162518 |
| balanced | victim  | Desktop 1440×1000     |     150 |      16.70 |  16.80 |       2.10 |                     44 |                     216331 |
| high     | frontal | Desktop 1440×1000     |     150 |      16.70 |  16.80 |       2.60 |                     61 |                     182678 |
| high     | victim  | Desktop 1440×1000     |     150 |      16.70 |  16.80 |       2.00 |                     44 |                     266731 |
| economic | frontal | 390×844 touch emulado |     150 |      16.70 |  16.70 |       1.90 |                     61 |                     147398 |
| economic | victim  | 390×844 touch emulado |     150 |      16.70 |  16.80 |       1.80 |                     44 |                     178531 |
| balanced | frontal | 390×844 touch emulado |     150 |      16.70 |  16.80 |       1.70 |                     61 |                     162518 |
| balanced | victim  | 390×844 touch emulado |     150 |      16.70 |  16.80 |       1.40 |                     44 |                     216331 |
| high     | frontal | 390×844 touch emulado |     150 |      16.70 |  16.80 |       1.50 |                     61 |                     182678 |
| high     | victim  | 390×844 touch emulado |     150 |      16.70 |  16.80 |       1.50 |                     44 |                     266731 |

## Resultados das verificações

- PASSOU: Direct public route; cold and warm readiness; exactly one canvas
- PASSOU: Start, pause, resume and reset retain one controller/canvas
- PASSOU: Deterministic timeline restores volume, connection, HUD and incident stage
- PASSOU: Stable pause renders on demand instead of an idle frame loop
- PASSOU: Four cameras preserve a paused instant; keyboard look and Escape
- PASSOU: Harness close-up, active accident and fully occluded internal view keep controls
- PASSOU: Final analysis has documented scope and explicitly chosen hypothetical arithmetic
- PASSOU: Preventive replay blocks grain movement and entry
- PASSOU: Unmount releases previous metrics/resources; library card reenters independently
- PASSOU: WebGL context loss pauses time and restores the existing scene
- PASSOU: Context loss during delayed GLB loading keeps resource readiness authoritative
- PASSOU: Complete 30-second normal reproduction reaches analysis; two resets/replays keep one canvas
- PASSOU: Desktop active benchmark: economic/frontal
- PASSOU: Desktop active benchmark: economic/victim
- PASSOU: Desktop active benchmark: balanced/frontal
- PASSOU: Desktop active benchmark: balanced/victim
- PASSOU: Desktop active benchmark: high/frontal
- PASSOU: Desktop active benchmark: high/victim
- PASSOU: 390×844 touch layout; four cameras, occlusion and persistent exit
- PASSOU: Mobile emulation active benchmark: economic/frontal
- PASSOU: Mobile emulation active benchmark: economic/victim
- PASSOU: Mobile emulation active benchmark: balanced/frontal
- PASSOU: Mobile emulation active benchmark: balanced/victim
- PASSOU: Mobile emulation active benchmark: high/frontal
- PASSOU: Mobile emulation active benchmark: high/victim
- PASSOU: Hidden-tab handler pauses and requires explicit continuation
- PASSOU: No unexpected page errors in normal desktop/mobile sessions
- PASSOU: GLB HTTP 404 disables start; retry aborts old scene and recovers
- PASSOU: WebGL disabled: accessible educational sequence and same timeline stages

## Limites da evidência

- Frame time is the module's RAF interval during active reproduction. It is not GPU query time.
- cpuMs is synchronous renderer.render duration. GPU completion is asynchronous.
- Shadow counters are scene estimates; total draw calls and triangles come from renderer.info and include shadow passes.
- Resource Timing counts this development-server run and browser cache state; it is not a compressed production bundle measurement.
- Short fixed-view samples do not establish universal desktop/mobile FPS or thermal stability.

O relatório completo, snapshots de estado e erros estão em [ui.json](./ui.json). Capturas são evidência visual local; não provam dispositivo físico ou conformidade física/médica/normativa.

## Verificação adicional dos comandos por toque

Execução de 2026-10-14T10:37:20.073Z: 7/7 verificações passaram; 0 falhas.

Comando: `node scripts/silo-engolfamento/validate-touch-commands.mjs`. Após arrastar o canvas: fontes, fechamento de modal, opções, comandos laterais, continuar/pausar e reiniciar foram verificados por toque, incluindo Enter logo após toque. Esta rodada cobre a ampliação de CommandButton; não repete benchmarks nem substitui a identificação de emulação de celular.

Dados completos: [touch-commands.json](./touch-commands.json). A cena e o orçamento 3D permanecem os da medição principal em ui.json.

## Inspeção interna da linha de A

O script `validate-connected-line.mjs` confirma em t=9 pausado que olhar para trás e acima mantém domínio, HUD e saída acessível. A captura adicional [desktop-connected-line.png](./desktop-connected-line.png) preserva também a captura interna padrão do relatório principal. Imagem inspecionada: linha, dispositivo superior e estrutura de suporte visíveis; cobertura fechada, HUD e saída persistente preservados. Esta verificação não mede desempenho nem certifica o conjunto representado.
