# Validação — Escada LC-02 e circulação de pessoas

Execução local em 26.09.2026: Windows, Node 24.15.0, Blender 4.5.10 LTS, Three.js r186 e Chrome headless. Branch `codex/escada-lc02-pessoas`, criada da `main` `f0d8264`. O visualizador LC-02 antes local foi incorporado seletivamente, preservando as rotas e os arquivos de Trevisan e 3Tentos.

## Escopo verificado

| Verificação | Resultado local |
| --- | --- |
| TypeScript e ESLint do escopo alterado | Passaram |
| Build client + SSR + Nitro/Cloudflare | Passou, com heap Node de 1.536 MB |
| Geometria LC-02 e nova circulação | 10 testes passaram |
| Contratos industriais existentes | 16 testes passaram |
| Contratos Trevisan existentes | 8 testes passaram |
| Auditorias CAD e geometria industrial | Passaram; os relatórios dos outros mapas foram preservados fora desta alteração |
| Cenários 1, 5 e 10 | Quantidade exata em circulação, espera sem sobreposição, pausa e retomada |
| Chegada | Ordem e contagem final exatas nos três cenários; dez pessoas também completaram a travessia no navegador |
| Controle e seleção | Clique no personagem, seletor, W/S, liberação de tecla, avanço/recuo e retorno à vista geral |
| Recuperação | Dois ciclos WebGL, mesmo Canvas e contexto, retomada explícita e recursos equivalentes após aquecer os dois LODs |
| Falha de recursos | HTTP 503 nos GLBs humanos preserva a escada; nova tentativa carrega os modelos e libera a fila |
| Aba oculta e perda de foco | Aba oculta pausa; foco perdido libera a tecla; retorno não provoca salto |
| Toque emulado 390 × 844 | Avançar/soltar e interface sem transbordamento horizontal |
| GLBs | Zero erros; avisos de hierarquia dos personagens descritos abaixo |

O lint global também foi executado, excluindo apenas `.cache/lc02`: encontrou 15.325 erros de formatação e seis avisos em arquivos existentes sem alterações nesta branch, incluindo finais de linha CRLF do checkout Windows. O lint dos arquivos alterados passou. Os caminhos e o comando estão em `evidence/people/repository-lint.json`; os checks do projeto usam lint por escopo, sem reformatar os outros módulos nesta entrega.

As verificações de percurso amostram os pisos efetivamente renderizados, os apoios alternados dos pés, a continuidade entre patamares, o espaçamento longitudinal de 0,90 m e a abertura da porta antes da travessia. O avanço manual respeita a pessoa à frente e a que vem atrás. Isso não é uma análise de cargas, biomecânica ou certificação de circulação.

## Recursos e desempenho

O arquivo `evidence/people/ui.json` contém a comparação reproduzível entre cena vazia e 1/5/10 pessoas, com 150 intervalos de quadro por cenário, renderer reportado, chamadas, triângulos e recursos. A cena vazia é movimentada durante a medição para compará-la com os cenários em movimento. Carregamento e aquecimento precedem a amostra; ela não mede o tempo de primeiro acesso.

A GPU local reportada é **ANGLE / Intel UHD Graphics / Direct3D 11**. As amostras locais ficaram abaixo da meta de **p95 de 33,3 ms** com dez pessoas. São amostras curtas da mesma máquina; não demonstram desempenho universal, estabilidade prolongada ou experiência em celulares físicos. O CI seleciona explicitamente Chromium/SwiftShader: seus resultados funcionais não substituem a medição nativa.

| Pessoas | p50 / p95 (ms) | Chamadas | Triângulos por quadro | Geometrias / texturas |
| --- | --- | --- | --- | --- |
| 0 | 16,7 / 16,8 | 18 | 10.290 | 18 / 3 |
| 1 | 16,7 / 16,8 | 26 | 17.996 | 26 / 10 |
| 5 | 16,7 / 16,8 | 54 | 48.564 | 32 / 19 |
| 10 | 16,7 / 16,8 | 89 | 86.774 | 32 / 24 |

A comparação usa a vista ampla, com LOD distante. Depois de visitar ambos os personagens em detalhe, o conjunto aquecido registra 44 geometrias / 24 texturas; os mesmos contadores voltam após cada recuperação e novo aquecimento. O erro de alcance dos alvos IK foi 0,0000 m na precisão registrada durante as amostras; isso não é uma medição completa de deformação ou de folga do corpo.

O cache mantém as sombras estáticas da estrutura. A porta renova a sombra em até 10 Hz enquanto abre; pessoas têm sombra leve de contato. Ao pausar ou encerrar, a renderização volta a ocorrer sob demanda. Contadores estáveis após recuperação com os mesmos elementos visíveis não constituem prova absoluta de ausência de vazamentos de memória.

## Geometria e recursos locais

- Escada: **540.604 bytes**, 10.288 triângulos e 16 malhas. SHA-256 `cb71e8a42991ee948d9dbef9baf4eccb4bfffda90e07d7c30966e15072fc8914`.
- Dois personagens: **18.684 triângulos próximos / 7.640 distantes**, 53 ossos por base, texturas de até 2K e aproximadamente 5,72 MB no total. Os dez personagens compartilham geometrias/texturas e têm esqueletos independentes.
- Validador Khronos: zero erros nos três GLBs. Cada personagem registra dez avisos `NODE_SKINNED_MESH_NON_ROOT`, relativos à hierarquia de armadura exportada pelo Blender. Há informações de UV não utilizado em materiais sem textura. A hierarquia e os dois níveis de detalhe foram verificados no destino Three.js.
- Chunk específico `EscadaScene`: 44,14 kB minificado / 13,69 kB gzip no build registrado; dependências 3D compartilhadas aparecem em outros chunks. O build mantém os avisos de chunk grande e `inlineDynamicImports` do pipeline existente.

Origem CC0, arquivos de entrada, hashes e reprodução em [people-assets.md](people-assets.md). O PDF público preserva o SHA-256 `e6d19a618866d15912d905e71ba0cfb33ab4c6c203e144f817aa409ceceb6973`.

## Evidências e reprodução

- `evidence/people/ui.json`: cenários, câmera, controles, recuperação, recursos e medição local.
- `evidence/people/asset-recovery.json`: falha de carregamento e nova tentativa; liberação de entrada ao perder foco.
- `evidence/people/assets.json`: relatório integral do validador GLB.
- `evidence/people/build.txt`: build local concluído.
- `evidence/people/repository-lint.json`: limite do lint global no checkout Windows e escopo preservado.
- `evidence/validation.json`: verificações do visualizador, navegação, camadas e downloads.
- `evidence/people/integration.json`: abertura das rotas de 3Tentos, Trevisan e biblioteca de unidades.
- `evidence/people/scenario-*.png`, `manual-third-person.png`, `follow-upper-flight.png`, `door-opening.png`, `mobile-manual.png`: imagens de revisão.
- `evidence/people/walkthrough-1.webm` e `walkthrough-10.webm`: gravações da subida, curvas, acompanhamento e chegada; `videos.json` registra os estados observados.

Além dos comandos do [README](README.md), com o servidor local na porta 5183:

```powershell
node scripts/escada-lc02/ui-check.mjs
node scripts/escada-lc02/people-recovery.mjs
node scripts/escada-lc02/integration-ui.mjs
node scripts/escada-lc02/people-record.mjs
```

Safari, iOS/Android físicos e produção não foram validados. A porta abrindo para dentro, o pequeno piso interno, os movimentos humanos e os parâmetros de circulação são hipóteses visuais. As dimensões documentais e a condição de layout preliminar continuam explícitas. Não houve cálculo de capacidade, deformação da escada, aprovação formal, fabricação ou alteração de histórico publicado.
