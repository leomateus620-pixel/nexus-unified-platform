# Desempenho antes e depois

Uma execução por perfil em cada versão. A referência foi compilada no commit `b9e6990822f319f3064b6200b4416880cef6fcc1` antes das alterações. Os dois builds serviram a rota pública de produção em loopback. Chrome headless com ANGLE Metal na GPU Apple M5, macOS 26.6, 16 GB, WebGL 2 com MSAA de quatro amostras. Viewport de 1.440 × 900 CSS, DPR de dispositivo 2, cache desativado, 50 Mbit/s de download, 15 Mbit/s de upload e latência de 20 ms. A gravação do vídeo foi executada à parte.

O percurso tem 60 s. A órbita medida percorre os silos e a galeria durante 15 s. O trecho de pátio mede o deslocamento lateral com o teclado. Os intervalos são entre renders efetivamente submetidos pela cena. O primeiro render e a primeira resposta são medidos a partir da navegação.

| Perfil                   | 1º render, s | 1ª resposta, s | Órbita, FPS médios | Órbita, p95 ms | Pátio, FPS médios | Pátio, p95 ms |
| ------------------------ | -----------: | -------------: | -----------------: | -------------: | ----------------: | ------------: |
| Automática (equilibrada) |  0,90 → 1,04 |    1,16 → 1,23 |        60,0 → 60,0 |    17,2 → 17,3 |       60,0 → 60,0 |   17,4 → 17,3 |
| Econômica                |  0,88 → 0,97 |    1,14 → 1,15 |        60,0 → 60,0 |    17,5 → 17,4 |       60,0 → 60,0 |   17,8 → 17,5 |
| Detalhada                |  1,21 → 0,96 |    1,48 → 1,14 |        60,0 → 60,0 |    17,4 → 17,4 |       60,0 → 60,0 |   17,4 → 17,9 |

| Perfil                   | Órbita, GPU tela mediana ms | Órbita, chamadas máximas | Órbita, triângulos máximos | Pátio, GPU tela mediana ms | Bytes no 1º render | Texturas residentes ao fim |
| ------------------------ | --------------------------: | -----------------------: | -------------------------: | -------------------------: | -----------------: | -------------------------: |
| Automática (equilibrada) |                 4,29 → 6,30 |                  58 → 70 |          278.147 → 294.138 |                4,03 → 8,03 |  538.192 → 569.087 |                    19 → 38 |
| Econômica                |                 3,91 → 2,72 |                  58 → 69 |          277.261 → 215.270 |                4,08 → 2,49 |  538.193 → 569.086 |                    19 → 38 |
| Detalhada                |                11,17 → 7,91 |                  58 → 70 |          278.605 → 294.670 |                8,42 → 8,52 |  538.192 → 569.086 |                    19 → 38 |

Os arquivos em `build-medido.json` identificam os bundles de produção usados na referência e na revisão final. A contagem de texturas é a do renderer. O custo em bytes da alocação GPU varia conforme formato, mipmaps, buffers e driver.

A diferença de transferência vem dos bundles e do HTML da aplicação. Os detalhes de solo, ferrovia, chapa e copas são gerados em memória. O mosaico geográfico continua sendo carregado após o primeiro quadro da implantação. Os resultados correspondem ao equipamento e à rede simulada acima. A validação mobile exercita a interface e o WebGL em viewport emulado.

Os arquivos de medição preservam cada quadro, a posição da câmera, o número de chamadas e as amostras de tempo de GPU. [Antes](medicoes/antes/) · [Depois](medicoes/depois/)

```sh
for perfil in auto economico detalhado; do
  CRUZ_PERFIL="$perfil" CRUZ_REPETICOES=1 CRUZ_EXIGIR_CBERS=1 CRUZ_EXIGIR_HORIZONTE=1 \
    NEXUS_TEST_BASE_URL=http://127.0.0.1:4432 CRUZ_SAIDA=/tmp/cruz-desempenho \
    node tests/cruz-alta/desempenho.mjs
done
```
