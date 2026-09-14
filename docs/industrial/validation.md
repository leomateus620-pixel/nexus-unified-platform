# Auditoria da reconstrução 3D

Versão funcional entregue em **/mapas-3d**. Auditoria local em 2026-09-14, a partir da base Git d3b66400d7fc00cf5fbf806cdf04d7c3646c3b0e. Os arquivos efetivamente avaliados são identificados por SHA-256 em [delivery-manifest.json](evidence/delivery-manifest.json).

## Estado de verificação

- Checagem TypeScript, build Vite/Nitro e ESLint dos arquivos da implementação: executados com sucesso. O lint global das demais áreas não integra esta auditoria.
- Sete testes de contratos: implantação 2 × 2, rastreabilidade, hashes das quatro fotos, colisões e regressão de coordenadas da vegetação comprimida.
- 6 testes Playwright aprovados, 0 falhas, 0 resultados instáveis. Incluem busca, seleção real de malha, minimapa por teclado, zoom orbital, vistas, camadas, blockout, iluminação, qualidade, sobreposição/opacidade, exportação JSON, WASD/Esc, toque emulado, movimento reduzido, recuperação HTTP 503, carregamento interrompido e retorno ao Nexus.
- Dez GLBs produzidos no Blender 4.5.10 LTS e otimizados com glTF Transform/meshoptimizer. Validação Khronos dos arquivos compactados e de sua geometria decodificada: **zero erros e zero avisos**. IDs preservados. [Relatório GLB](evidence/gltf-validation.json).
- Limites externos dos quatro silos idênticos entre os dois LODs; zero vértices da vegetação dentro das caixas de paredes no teste geométrico. Essa consulta não prova ausência de toda interseção entre triângulos/telhados. [Auditoria geométrica](evidence/geometry-audit.json).
- Seis ciclos de qualidade/iluminação; contadores estabilizados após aquecimento em 115 geometrias, 18 texturas e 18 programas. Três saídas e reentradas na rota funcionaram sem perda de contexto. Isso não equivale a uma prova de ausência de vazamento de heap/GPU. [Ciclos](evidence/resource-cycles.json).

## Desempenho observado

Windows 10.0.26200, Intel(R) Core(TM) i5-1035G1 CPU @ 1.00GHz, 8.375,11 MB de RAM. Chrome 152.0.7977.83, headless, WebGL2 com **ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11)**. Desktop: 1448 × 1000; econômico: 390 × 844 com toque emulado e DPR 1. Ambos executados no mesmo computador. Não houve teste em telefone físico, Safari/iOS ou WebGPU.

Percurso automatizado de passeio com comandos de movimento e rotação, por pelo menos dois minutos por perfil. Contexto novo e cache HTTP desabilitado; prévia local do build de produção em Wrangler, sem emulação de rede móvel. Cache de driver/compilação do sistema não foi controlado.

| Medida do percurso | Desktop equilibrado | Econômico emulado |
|---|---:|---:|
| Duração (s) | 120,7 | 120,1 |
| Quadros amostrados | 6.849 | 7.205 |
| FPS pela mediana dos intervalos | 58,8 | 59,9 |
| Intervalo p50 / p95 / p99 (ms) | 17 / 21,9 / 24,4 | 16,7 / 16,9 / 17,2 |
| Maior intervalo (ms) | 751,1 | 828,5 |
| Intervalos acima de 50 ms | 1 | 1 |
| Máximo de chamadas, incluindo sombras | 198 | 125 |
| Máximos de chamadas: principal / sombras | 97 / 101 | 59 / 66 |
| Máximo de triângulos, incluindo sombras | 774.790 | 65.382 |
| Máximos de triângulos: principal / sombras | 390.982 / 383.808 | 32.660 / 32.722 |
| Novos quadros em 2,5 s de repouso | 0 | 0 |
| Perdas de contexto / erros JS | 0 / 0 | 0 / 0 |

Os máximos de cada coluna são calculados separadamente e podem ocorrer em quadros diferentes. A quantidade visível depende do enquadramento; o perfil móvel possui campo de visão horizontal menor. Estes números não são uma comparação isolada do custo dos perfis, nem garantem 60 FPS constantes. Os picos longos permanecem na amostra; a causa de cada pausa não foi atribuída a GPU, compilação, GC ou automação sem perfilamento adicional. Os JSONs completos contêm os intervalos e tempos de submissão CPU; não são tempos de GPU.

As vistas amplas A/B/C no perfil equilibrado registraram 214 chamadas e 761.250 triângulos **com sombras**. D registrou 179 chamadas e 721.558 triângulos. Não há passes permanentes de reflexão local, bloom ou pós-processamento; PMREM é preparado quando o ambiente muda. As metas de 1 milhão/250 no desktop e 350 mil/150 no móvel continuam orçamentos de projeto, sem certificação de todos os dispositivos/enquadramentos.

## Carregamento e memória

| Medida | Desktop equilibrado | Econômico emulado |
|---|---:|---:|
| Estado pronto desde navigationStart (s) | 3,57 | 1,92 |
| Carga dos setores desde montagem da cena (s) | 2,22 | 0,66 |
| GLBs disponíveis ao ficar pronto (MB) | 6,35 | 6,35 |
| Transferência Resource/Navigation Timing até pronto (MB) | 6,81 | 6,81 |
| Decodificação/parse do setor terreno (ms) | 223,5 | 97,3 |
| Buffers de geometria estimados (MB) | 4,8 | 1,55 |
| Texturas de materiais estimadas (MB) | 14,68 | 14,33 |
| Heap JavaScript usado no fim (MB) | 28,82 | 23,46 |

MB decimais. A transferência observada fica abaixo da referência inicial de aproximadamente 8 MB nesta prévia; não inclui fotos abertas posteriormente, detalhes carregados depois ou garantia de cache/rede de produção. Recursos de fontes existentes no shell podem não expor todos os bytes entre origens. O estado pronto confirma carregamento da cena, não mede isoladamente a primeira apresentação GPU. Fetch e decodificação estão separados por setor nos JSONs; tempo de compilação de shaders não foi isolado.

Os GLBs completos somam 6,66 MB depois da otimização, contra 16,17 MB intermediários. Esse é tamanho de arquivo, não memória GPU nem ganho de FPS demonstrado. A base anterior não possuía essa reconstrução; não há comparação de desempenho antes/depois de uma cena equivalente.

Geometria estima buffers únicos visitados; texturas estimam largura × altura × RGBA e mipmaps. Não incluem alinhamento de driver, todas as cópias, targets de sombra/ambiente ou memória do sistema gráfico. Heap JavaScript é uma medida separada do Chrome. Não se somam essas categorias como se fossem uma medição direta de VRAM.

## Auditoria visual

Capturas posteriores à otimização: [A](evidence/view-A.png), [B](evidence/view-B.png), [C](evidence/view-C.png), [D](evidence/view-D.png) e [visão geral](evidence/overview-initial.png). A–C usam canvas 1448 × 1086; D usa 941 × 1672. A interface permite sobreposição das fotografias originais com opacidade regulável.

| Aspecto | Resultado e limite |
|---|---|
| Implantação | Quatro silos em 2 × 2, galpão adjacente, cinco edificações, faixa provável de pesagem, elemento circular, ilhas, rodovia e acesso superior reconstruídos. B é referência visual, não ortofoto. |
| Silhueta e profundidade | A/C ajustadas apenas por câmera, sem espelhar/deformar objetos. RMS dos oito pontos de ajuste: A 16,13 px; C 29,44 px. Incluem apoios e ápices separados. São resíduos do ajuste manual, sem pontos independentes de validação. |
| Foto D | Chapas, montantes, telhados, tubos, coroamentos e guarda-corpos modelados. Registro de câmera e identidade exata dos silos dessa fotografia ainda precisam de confirmação. |
| Acabamento | Famílias PBR autorais, cercamentos segmentados, árvores/folhas e palmeiras ancoradas. A variação de terreno e o detalhe de copas ainda são aproximações procedurais; não se declara equivalência fotográfica. |

Correções de robustez incluídas: transformação de folhas em Float32 antes de aplicar as matrizes dos GLBs quantizados; posições do terreno preservadas sem quantização que colapse camadas; separação entre pisos; descarte de instâncias ao trocar geometria; renderização por demanda e suspensão em aba oculta. O vento altera somente folhas e usa a mesma deformação nas sombras.

**Pendências externas:** medidas confiáveis, confirmação das funções/identificadores operacionais, fachadas ocultas, detalhes de equipamentos, orientação geográfica e direitos de redistribuição ampla das fotos. A escala é estimada e a medição permanece desativada. Esta entrega é uma reconstrução visual inicial funcional, não levantamento validado, modelo as built, certificação de segurança ou gêmeo digital conectado.
