# Desempenho do mapa de Cruz Alta no MacBook

O percurso do mapa foi repetido nove vezes com cache de navegador desabilitado e processo novo de Chrome. Na órbita contínua dos silos e da galeria, 9 de 9 execuções atingiram juntas as referências de abertura interativa de até 5 s, mediana de pelo menos 50 FPS e p95 de até 28 ms por quadro.

A geometria, os materiais, os rasters regionais e a navegação medidos correspondem ao commit 93e9f37. O arquivo build.json identifica o bundle exato usado no ensaio. A versão de entrega recebeu depois ajustes na miniatura do catálogo e na exibição do nome de uma origem documental autenticada. O percurso abre a rota da cena diretamente, sem sessão.

[Ver o percurso de 60 s](percurso-macbook.mp4) · [Ver o piso e a vegetação junto ao reservatório](piso-reservatorio.jpg)

## Equipamento e condições

MacBook Air Mac17,3 com Apple M5, CPU de 10 núcleos, GPU integrada de 8 núcleos, 16 GB de memória e tela Retina de 2.560 × 1.664. macOS 26.6, alimentação por bateria e modo de baixo consumo desligado. Chrome 157.0.8103.79 isolado em modo headless com aceleração nativa ANGLE Metal na GPU Apple M5. A página permaneceu visível ao longo dos nove percursos.

WebGL 2 informou MSAA com 4 amostras em todos os perfis. Os perfis usam DPR efetivo de 1 (econômico), 1,5 (automático neste equipamento) e 2 (detalhado).

A ordem dos perfis foi alternada a cada rodada. Na primeira, automática, econômica e detalhada. Na segunda, detalhada, automática e econômica. Na terceira, econômica, detalhada e automática.

Viewport de 1.440 × 900 CSS com DPR 2, sem limitação de CPU. A rota pública foi servida pelo build de produção de TanStack/Cloudflare no loopback. O CDP aplicou 50 Mbit/s de download, 15 Mbit/s de upload e 20 ms de latência configurada. O workerd local aceitou a data de compatibilidade de 18/09/2026. A gravação foi executada separadamente para retirar seu custo das medições.

## Medições na órbita de 15 s

A abertura termina quando a primeira rolagem efetivamente altera a posição da câmera. O primeiro render corresponde à submissão do quadro de implantação pelo Three.js. A mediana de FPS da cena e o p95 de quadro usam os intervalos entre renders confirmados. A coluna rAF usa os callbacks de animação do navegador, inclusive quando o motor conserva o último quadro. A apresentação física de cada quadro no painel Retina não foi instrumentada.

| Qualidade | Execução | 1º render (s) | 1ª resposta (s) | FPS médios da cena | FPS medianos da cena | FPS medianos rAF | Quadro p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Automática (equilibrada) | 1 | 1,88 | 2,07 | 57,72 | 59,88 | 59,88 | 17,70 |
| Automática (equilibrada) | 2 | 1,79 | 1,95 | 56,32 | 59,88 | 59,88 | 17,80 |
| Automática (equilibrada) | 3 | 0,99 | 1,20 | 60,01 | 59,88 | 59,88 | 17,10 |
| Econômica | 1 | 1,32 | 1,46 | 59,94 | 59,88 | 59,88 | 17,40 |
| Econômica | 2 | 1,03 | 1,18 | 60,01 | 59,88 | 59,88 | 17,40 |
| Econômica | 3 | 0,96 | 1,16 | 60,01 | 59,88 | 59,88 | 17,60 |
| Detalhada | 1 | 1,03 | 1,17 | 59,07 | 59,88 | 59,88 | 17,30 |
| Detalhada | 2 | 1,35 | 1,53 | 57,20 | 59,88 | 59,88 | 17,60 |
| Detalhada | 3 | 0,94 | 1,16 | 60,01 | 60,24 | 59,88 | 17,50 |

Os FPS médios contam o número de intervalos entre renders por segundo decorrido. A mediana descreve o intervalo típico e o p95 inclui os quadros mais longos durante o movimento. Os p95 abaixo são resumidos pela mediana das três execuções em cada perfil.

| Qualidade | rAF p95 (ms) | CPU render p95 (ms) | CPU cena p95 (ms) | GPU tela mediana (ms) | Variação da mediana de GPU (ms) | GPU tela p95 (ms) | Amostras GPU de tela |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Automática (equilibrada) | 16,70 | 0,90 | 1,50 | 6,31 | 4,88–8,19 | 8,80 | 65 |
| Econômica | 16,70 | 0,80 | 1,20 | 2,81 | 2,29–7,10 | 4,62 | 68 |
| Detalhada | 16,80 | 0,90 | 1,30 | 8,58 | 5,32–11,24 | 13,66 | 65 |

## Resolução, carga e transições

| Qualidade | Buffer inicial (px) | Lado da sombra (px) | Chamadas máx. | Desenhos de sombra máx. | Triângulos máx. | Geometrias finais | Texturas finais | Grupos detalhados no recuo | Grupos distantes no recuo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Automática (equilibrada) | 2160 × 1233 | 1.536 | 58 | 0 | 278.147 | 95 | 19 | 5–15 | 6–16 |
| Econômica | 1440 × 822 | 768 | 58 | 0 | 277.261 | 95 | 19 | 0–15 | 6–21 |
| Detalhada | 2880 × 1645 | 2.048 | 58 | 0 | 278.605 | 95 | 19 | 9–15 | 6–12 |

As chamadas e triângulos são máximos de um quadro na órbita densa. A contagem de chamadas usa as funções reais de desenho WebGL, incluindo instâncias e passagem de sombra. Os triângulos vêm de renderer.info com reinício a cada render. O custo de sombra via EXT_disjoint_timer_query_webgl2 corresponde a uma atualização do mapa de sombra. A GPU conserva o mapa em outros quadros. A primeira coluna de CPU cronometra renderer.render no thread principal. A segunda mede o callback completo de animação que submeteu desenhos 3D, incluindo navegação, LOD e atualização de rótulos. Os tempos de GPU medem a duração da passagem na GPU. As duas medidas podem se sobrepor.

| Qualidade | Amostras GPU de sombra em movimento | Tempo mediano da atualização (ms) | Tempo p95 da atualização (ms) | Pico de desenhos para atualizar a sombra |
| --- | --- | --- | --- | --- |
| Automática (equilibrada) | 61 | 0,97 | 4,91 | 79 |
| Econômica | 66 | 0,36 | 1,59 | 77 |
| Detalhada | 64 | 0,98 | 6,09 | 77 |

## Primeira textura e passeio

| Qualidade | Primeira textura HTTP | Transferência (bytes) | Duração HTTP med. (ms) | 1º envio da textura (ms de CPU, med.) | Lateral no pátio, FPS med. | Lateral, quadro p95 (ms, med.) |
| --- | --- | --- | --- | --- | --- | --- |
| Automática (equilibrada) | galvanized-normal.png | 2264 | 24,80 | 0,00 | 59,88 | 17,10 |
| Econômica | galvanized-normal.png | 2264 | 25,40 | 0,00 | 59,88 | 17,40 |
| Detalhada | galvanized-normal.png | 2264 | 23,20 | 0,00 | 59,88 | 17,60 |

A primeira transferência HTTP é a primeira resposta concluída no diretório de texturas. O primeiro envio à GPU inclui a primeira textura material ou ambiental com conteúdo e dimensões de pelo menos 8 × 8. O cronômetro mede o tempo síncrono de submissão dessa textura pelo JavaScript. Uma leitura de 0,00 ms fica abaixo da resolução observável do relógio nesse envio. Os arquivos JSON guardam o tamanho e o instante das duas operações.

## Referência anterior

A mesma órbita densa na versão 56b0b57, antes do refinamento regional, teve uma execução de referência. A abertura interativa levou 1,85 s, a órbita densa teve mediana de 59,88 FPS e p95 de 17,20 ms. O pico observado foi de 81 chamadas de desenho. O perfil automático anterior usava buffer de 2304 × 1316 px. As resoluções, materiais e política de LOD mudaram entre as versões.

## Piso, reservatório norte e vegetação

O trecho entra no pátio junto ao reservatório norte, gira até enquadrar a base, o encontro entre piso e gramado e as árvores, e percorre lateralmente o limite. A revisão intermediária já incluía o DEM. A versão final também ajustou a vegetação próxima, a nitidez, os materiais e a resolução de cada perfil. Os tempos refletem o conjunto dessas alterações.

| Qualidade | Buffer anterior (px) | Chamadas Anterior → Final | Triângulos Anterior → Final | GPU tela med. Anterior → Final (ms) | Quadro p95 Anterior → Final (ms) |
| --- | --- | --- | --- | --- | --- |
| Automática (equilibrada) | 1944 × 1110 | 40 → 47 | 408.718 → 445.941 | 4,52 → 8,09 | 17,40 → 17,50 |
| Econômica | 1296 × 740 | 40 → 47 | 408.718 → 445.941 | 3,96 → 3,29 | 17,10 → 17,60 |
| Detalhada | 2520 × 1439 | 40 → 47 | 409.870 → 447.093 | 4,23 → 8,68 | 17,30 → 26,70 |

## Paisagem regional

As nove execuções exibiram os créditos da paisagem e receberam 6 arquivos regionais distintos. Entre eles estão o mosaico CBERS próximo de 2 m e o mosaico local de aproximadamente 3,52 m. A transferência regional, com cabeçalhos, teve mediana de 3.622.149 bytes por execução.

Em 9 de 9 execuções, o navegador iniciou o manifesto regional depois da primeira submissão de quadro da unidade. O último recurso regional terminou a transferência entre 1,84 e 3,19 s da navegação.

## Reprodução

Com o build de produção em execução no loopback, rode o percurso a partir da raiz do repositório usando a instalação local de Chrome e Playwright.

```sh
for perfil in auto economico detalhado; do
  CRUZ_PERFIL="$perfil" CRUZ_REPETICOES=3 NEXUS_TEST_BASE_URL=http://127.0.0.1:4402 node tests/cruz-alta/desempenho.mjs
done
```

Use CRUZ_REPETICOES=1 e CRUZ_EXECUCAO_INICIAL para alternar os perfis entre rodadas e continuar no arquivo da rodada anterior. Os arquivos por perfil contêm as três execuções, a versão do navegador, as posições inicial e final das câmeras e os resultados de cada trecho. Os arquivos compactados preservam os registros por quadro de render e rAF e as consultas GPU. O vídeo separado em MP4, 1.280 × 800 e 25 FPS de captura, reproduz 60 segundos em velocidade normal. Mostra implantação, planta, Preparação 28.1, silos, galeria, deslocamento lateral a 1,70 m, encontro de piso, reservatório e vegetação, junção 11/56 e recuo para o conjunto.
