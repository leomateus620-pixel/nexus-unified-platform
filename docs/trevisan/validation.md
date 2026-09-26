# Validação local — Trevisan

Sessão de 25/09/2026 (America/Sao_Paulo). Implementação inicial na branch `codex/trevisan-moega-3`, baseada no `main` local `d3b6640`. Para publicação, a branch `codex/trevisan-moega-3-pr` integra o trabalho ao `origin/main` `833389b`, que já contém a unidade 3Tentos. O mapa existente permanece em `/mapas-3d`; o catálogo fica em `/mapas-3d/unidades` e a Trevisan tem visualização independente em `/mapas-3d/trevisan`.

## Verificações

- Baseline: `npx tsc --noEmit` passou antes da implementação.
- `npm run test:trevisan`: **8/8 passaram**. Dimensões, encosto, alturas, eixos, grupos/setores, sem extrusões para alturas ausentes, passagem de veículos livre por raycast, cinco pilares azuis, centro geográfico S1 e hash do PDF.
- `npx tsc --noEmit`: passou após a implementação.
- ESLint nos módulos Trevisan, nas duas rotas e no layout raiz: passou.
- `npm run build`: passou (cliente, SSR e worker Cloudflare). Avisos: chunk assíncrono de Three.js acima de 500 kB, configuração existente de caminhos TS e `inlineDynamicImports` do preset. Não houve publicação do worker.
- Navegador Chrome local, Playwright, desktop 1440 × 1000: entrada pelo menu e pelo catálogo; seis vistas; órbita, pan e zoom; foco em setor; inspeção estrutural; camadas; isolamento; qualidade econômica; ficha de origem; PDF servido integralmente; retorno sem Canvas residual.
- Emulação 390 × 844 com toque: sem overflow horizontal, painel e controles operantes, órbita por eventos de toque. O limite de câmera foi ampliado e coerente com o ajuste à proporção de tela. Após estabilização: **zero renderizações adicionais em dois segundos**.
- Duas perdas/restaurações forçadas com `WEBGL_lose_context`: recuperou prontidão, manteve o mesmo Canvas, 73 geometrias e 4 texturas. Sem aumento desses contadores nos dois ciclos.
- **Zero erros JavaScript e zero requisições locais falhas** no roteiro completo.
- Revisão final: objetos de camadas/conjuntos ocultos não interceptam seleção; três legendas principais na vista móvel; ausência de overflow e contador de frames estacionário reconfirmados.

## Orçamento e amostra local

| Métrica | Resultado |
| --- | --- |
| Instâncias de elementos repetidos | 3.231 |
| Triângulos do modelo (sem passes de sombra / piso de apresentação) | 38.889 |
| Agrupamentos de instâncias/superfícies | 43 |
| Chamadas de desenho, vista geral com sombras | 152 |
| Chamadas de desenho, modo econômico | 81 |
| Triângulos contabilizados pelo renderer com sombras | 76.460 |
| Triângulos contabilizados no modo econômico | 38.987 |
| Intervalos rAF durante interação, 925 amostras | mediana 16,7 ms; p95 33,3 ms; máximo 249,9 ms |
| Módulo assíncrono da cena na implementação inicial | aproximadamente 932 kB minificado / 249 kB gzip |

O renderer conta passes de sombra; isso não equivale à quantidade única de triângulos. A amostra de rAF não mede tempo exclusivo de GPU e ocorreu em ambiente compartilhado com outros processos. Não prova FPS sustentado em todos os dispositivos nem estabilidade absoluta de heap/GPU. Contadores iguais após duas recuperações não são teste prolongado de vazamento.

## Evidências e limites

- `evidence/ui-report.json`: saída das verificações de interação, recursos e recuperação.
- `evidence/mobile-idle.json`: câmera final enquadrada e contador de frames estacionário.
- `evidence/moega.png` e `evidence/structure.png`: inspeção visual da envoltória e da estrutura.
- `evidence/overview.png` e `evidence/mobile.png`: apresentação final e enquadramento responsivo.

A validação móvel é emulação Chromium, não telefone físico ou Safari. Não houve publicação em produção. O CI remoto deve ser consultado nos checks da PR. As dimensões preliminares do documento continuam sujeitas a conferência em campo. Os arquivos preexistentes não rastreados em `assets/`, `scripts/` e `test-results/` do checkout original foram preservados e não integram a PR.

## Integração para publicação

- TypeScript e ESLint dos módulos, rotas e testes de ambas as unidades: passaram. Os finais de linha do checkout Windows foram normalizados localmente para executar o lint; isso não altera o conteúdo dos arquivos preexistentes na PR.
- Contratos Trevisan: **8/8**; contratos industriais existentes: **16/16**.
- Auditorias de geometria e CAD: passaram, incluindo 36 partições, quatro LODs e seis distâncias entre silos do 3Tentos. O cache CAD intermediário não está disponível neste checkout; a auditoria utiliza os ativos e os hashes versionados.
- Build integrado de cliente, SSR e worker: passou. A cena Trevisan ficou em aproximadamente 17,79 kB minificado / 6,95 kB gzip, além dos chunks compartilhados de Three.js/controles. O maior chunk compartilhado mede aproximadamente 542,75 kB / 145 kB gzip e mantém o aviso de tamanho acima de 500 kB.
- O workflow existente agora também executa os contratos e o lint da Trevisan.
- Navegação integrada em Chrome local, 1440 × 1000 e 390 × 844: 3Tentos → catálogo → Trevisan → catálogo → 3Tentos → Nexus, com retorno pelo menu existente. Apenas um Canvas na visualização ativa e nenhum Canvas no catálogo/Nexus após a transição; acesso ao catálogo legível na largura de 390 px; zero erros JavaScript e zero respostas HTTP locais de erro. Evidência: `evidence/pr-integration.json`.
