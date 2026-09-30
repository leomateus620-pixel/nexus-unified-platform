# Workspace comercial de propostas — 30/09/2026

Esta entrega reorganiza as oito áreas da revisão e conclui a coordenação de salvamento automático, cálculo e checkpoints. Ações comerciais e operacionais continuam explícitas: emissão, aceite, demanda e ordens não são efeitos do autosave.

## Base e escopo

- Base revalidada: `origin/main`, `e4dea2acae5b6649674e4d5640f2b8f02aac03e2`.
- Branch de trabalho: `codex/proposal-workspace-autosave`, em worktree separado. O checkout original e `docs/casos-comerciais/` foram preservados.
- Runtime local: Node 24.15.0, npm 11.12.1; dependências instaladas pelo `bun.lock` congelado com Bun 1.4.2. Nenhuma dependência foi acrescentada.
- As capturas fornecidas pelo briefing pertencem à demonstração P03. A referência autenticada pertence à proposta 001/26, revisão 01. As imagens abaixo usam somente os mesmos registros isolados de teste antes/depois; seus valores não representam nenhuma dessas propostas.
- A nova tentativa de inspeção da referência redirecionou para o acesso ao sistema. Não houve acesso autenticado novo nem escrita em produção. A implementação parte das capturas, do diagnóstico de leitura fornecido e do código atual.

## Implementação

| Área / arquivos                                                              | Resultado                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota da revisão, `Workspace.tsx`, `revision.css`                             | Identidade compacta, título completo em Detalhes, total canônico dedicado, navegação com oito ícones e áreas auxiliares distintas. Status comercial, persistência e cálculo separados.                                                                |
| `ItensComerciais.tsx`, `ProductComponentCard.tsx`                            | Cartões compactos, pesquisa por código em controle recolhido, filtro de modalidade, inclusão comercial distinta de seleção em lote e um único inspetor editável.                                                                                      |
| `Dimensionamento.tsx`, `ObjectCards.tsx`, `EditorWorkspace.tsx`              | Sistemas identificados por ordem e referência, medidas e composição em foco, entradas inválidas/pendências/resultado antigo/cálculo válido distintos. Expansão intencional, Escape e retorno do foco.                                                 |
| `Etapas.tsx`, `stages.css`                                                   | Cinco valores canônicos no orçamento; grupos recolhidos e subtotal de materiais identificado. Compras e Produção com listas e estados vazios compactos. Documento e textos com foco, parâmetros em quatro categorias e histórico real de checkpoints. |
| `ProposalSaveProvider.tsx`, `save-queue.ts`, `hooks.ts`, `revision-patch.ts` | Um coordenador por revisão, rascunhos preservados entre áreas, fila FIFO, edição agrupada após pausa, controle de concorrência e recuperação de resposta perdida.                                                                                     |
| `propostas.functions.ts`                                                     | Ajuste localizado para confirmar sem evento um snapshot sem diferenças cujo cálculo estava ausente/desatualizado, usando o motor canônico e uma única tentativa adicional protegida por versão.                                                       |

## Confirmação e recuperação

A pausa padrão é de 800 ms, com captura adicional em blur, fechamento e troca de área. Os formulários registram flushers no coordenador da revisão. Entrada inválida fica local e impede confirmação; uma justificativa ainda aberta também permanece pendente. A fila grava as entradas antes de solicitar o checkpoint, que usa o cálculo canônico existente.

O agrupamento registra diferenças confirmadas por objeto/campo, autores e versões existentes no banco. Não registra cada tecla. No-op não cria evento comercial. O identificador do checkpoint é reutilizado após resposta perdida. Escritas capturam seus valores e guardam campos/versão esperados; uma confirmação antiga não apaga edição posterior. Mudanças externas em campos intocados são preservadas, inclusive quando parâmetros antigos usam defaults implícitos.

Falhas retêm o rascunho e mostram recuperação explícita. Chaves de operações incluem os campos afetados, para que sucesso em outro campo do mesmo objeto não apague a falha anterior. Saída da revisão tenta confirmar e, se não conseguir, oferece continuar editando ou sair sem concluir. Fechamento abrupto usa aviso e flush de melhor esforço; dados ainda locais não têm garantia de persistir se o processo for encerrado antes da confirmação.

Impressão, emissão e os comandos de demanda/ordens aguardam a confirmação das entradas e do cálculo. Isso não dispara essas ações automaticamente. Revisões protegidas continuam somente leitura e o banco mantém seus bloqueios, RLS e permissões de custos.

## Capturas comparáveis

Cada par usa a mesma área, viewport e registros isolados, no commit base e na implementação. As métricas também incluem 320 e 1920 px.

| Área            | Notebook 1366 px                                                                                                                                  | Móvel 390 px                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Itens           | [Antes](evidence/2026-09-30/workspace-before/itens-comerciais-1366.png) · [Depois](evidence/2026-09-30/workspace-after/itens-comerciais-1366.png) | [Antes](evidence/2026-09-30/workspace-before/itens-comerciais-390.png) · [Depois](evidence/2026-09-30/workspace-after/itens-comerciais-390.png) |
| Dimensionamento | [Antes](evidence/2026-09-30/workspace-before/dimensionamento-1366.png) · [Depois](evidence/2026-09-30/workspace-after/dimensionamento-1366.png)   | [Antes](evidence/2026-09-30/workspace-before/dimensionamento-390.png) · [Depois](evidence/2026-09-30/workspace-after/dimensionamento-390.png)   |
| Orçamento       | [Antes](evidence/2026-09-30/workspace-before/orcamento-1366.png) · [Depois](evidence/2026-09-30/workspace-after/orcamento-1366.png)               | [Antes](evidence/2026-09-30/workspace-before/orcamento-390.png) · [Depois](evidence/2026-09-30/workspace-after/orcamento-390.png)               |
| Compras         | [Antes](evidence/2026-09-30/workspace-before/compras-1366.png) · [Depois](evidence/2026-09-30/workspace-after/compras-1366.png)                   | [Antes](evidence/2026-09-30/workspace-before/compras-390.png) · [Depois](evidence/2026-09-30/workspace-after/compras-390.png)                   |
| Produção        | [Antes](evidence/2026-09-30/workspace-before/producao-1366.png) · [Depois](evidence/2026-09-30/workspace-after/producao-1366.png)                 | [Antes](evidence/2026-09-30/workspace-before/producao-390.png) · [Depois](evidence/2026-09-30/workspace-after/producao-390.png)                 |
| Resumo          | [Antes](evidence/2026-09-30/workspace-before/resumo-executivo-1366.png) · [Depois](evidence/2026-09-30/workspace-after/resumo-executivo-1366.png) | [Antes](evidence/2026-09-30/workspace-before/resumo-executivo-390.png) · [Depois](evidence/2026-09-30/workspace-after/resumo-executivo-390.png) |
| Parâmetros      | [Antes](evidence/2026-09-30/workspace-before/parametros-1366.png) · [Depois](evidence/2026-09-30/workspace-after/parametros-1366.png)             | [Antes](evidence/2026-09-30/workspace-before/parametros-390.png) · [Depois](evidence/2026-09-30/workspace-after/parametros-390.png)             |
| Histórico       | [Antes](evidence/2026-09-30/workspace-before/historico-1366.png) · [Depois](evidence/2026-09-30/workspace-after/historico-1366.png)               | [Antes](evidence/2026-09-30/workspace-before/historico-390.png) · [Depois](evidence/2026-09-30/workspace-after/historico-390.png)               |

Outras vistas: [Parâmetros em foco](evidence/2026-09-30/workspace-after/parametros-focused.png), [textos no móvel](evidence/2026-09-30/workspace-after/resumo-textos-focused-390.png), [Compras vazia](evidence/2026-09-30/workspace-after/compras-empty.png), [Produção vazia](evidence/2026-09-30/workspace-after/producao-empty.png), [Histórico sem checkpoint](evidence/2026-09-30/workspace-after/historico-empty.png).

### Medidas observadas

Valores em pixels arredondados, obtidos dos [registros anteriores](evidence/2026-09-30/workspace-before/metrics.json) e [finais](evidence/2026-09-30/workspace-after/metrics.json), com os mesmos cinco itens/sistemas:

| Viewport / área           | Início do primeiro cartão, antes → depois | Altura do cartão, antes → depois |
| ------------------------- | ----------------------------------------- | -------------------------------- |
| 390 px · Itens            | 774 → 496                                 | 505 → 270                        |
| 390 px · Dimensionamento  | 703 → 488                                 | 429 → 274                        |
| 1366 px · Itens           | 386 → 353                                 | 509 → 270                        |
| 1366 px · Dimensionamento | 398 → 375                                 | 450 → 275                        |

O cabeçalho móvel passou de 356 para 264 px. Com título curto em notebook, a faixa passou de 155 para 166 px ao incorporar total dedicado e navegação por cartões com alvos confortáveis; o conteúdo aparece mais cedo pela redução da toolbar e dos cartões. Títulos longos usam uma linha e acesso integral em Detalhes. As 32 vistas finais não apresentaram overflow da página ou recorte monetário. As medidas são de Chromium local, sem promessa de desempenho em dispositivo físico.

## Validação dirigida

| Verificação                   | Resultado / evidência                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`           | Passou na fonte final.                                                                                                                                                                                                                                                                                  |
| `npm run test:orcamento`      | 44 testes passaram: domínio, planilha, autorização, fila e patches de revisão.                                                                                                                                                                                                                          |
| `npm run build`               | Passou. Sem deploy.                                                                                                                                                                                                                                                                                     |
| ESLint dos arquivos alterados | Zero erros; um aviso já existente de Fast Refresh em `Etapas.tsx`.                                                                                                                                                                                                                                      |
| Lint global no Windows        | Falhou: 25.966 erros e 8 avisos, contra 32.955 erros e 8 avisos na base. Formatação/CRLF nos arquivos fora do escopo e um `prefer-const` preexistente. Não foi aplicada formatação global.                                                                                                              |
| Captura UI existente          | [88 combinações em oito larguras, 12 estados e medições locais](evidence/2026-09-30/catalog-workspace-after/results.json), sem erros de página.                                                                                                                                                         |
| Acessibilidade                | [14 verificações, 16 pares de contraste](evidence/2026-09-30/catalog-after/accessibility.json); teclado, foco, alvos de toque e movimento reduzido.                                                                                                                                                     |
| Etapas e documento            | [11 cenários](evidence/2026-09-30/catalog-stages/checks.json), incluindo autosave global fora do provider, emissão/impressão bloqueadas por falha e edição móvel focada.                                                                                                                                |
| Itens, filtros e lote         | [7 cenários](evidence/2026-09-30/workspace-catalog/checks.json), com cancelamento de justificativa, seleção independente e títulos longos.                                                                                                                                                              |
| Revisão e impressão           | [7 cenários](evidence/2026-09-30/revision-refinement/checks.json), incluindo painel aberto, identidades repetidas, zero, somente leitura, custos restritos e CSS A4 comercial/interno.                                                                                                                  |
| Dimensionamento               | [9 verificações](evidence/2026-09-30/catalog-after/dimension-final-checks.json), incluindo cinco larguras, estados distintos e editor único.                                                                                                                                                            |
| Autosave e concorrência       | [16 cenários com chamadas e diferenças registradas](evidence/2026-09-30/workspace-autosave/checks.json): digitação/navegação, resposta perdida, retry, falha por campo, no-op, reversão durante gravação, dados incompletos e edição concorrente.                                                       |
| Contratos protegidos          | [56 arquivos com hashes preservados](evidence/2026-09-30/catalog-contracts.json); rotas e transições comerciais/operacionais preservadas. Mudanças de coordenação são explicitamente delimitadas no relatório.                                                                                          |
| Banco descartável             | `tests/db/run.ps1`, PostgreSQL 17.11 local, porta 55452: script completo passou. [25 confirmações de checkpoints](evidence/2026-09-30/database-checks.txt), incluindo dez sessões concorrentes com uma operação/evento/cálculo, RLS, imutabilidade, autores, rollback e ausência de efeitos comerciais. |

O runner UI foi retomado a partir das etapas após corrigir dois comportamentos do laboratório de testes: leitura vazia retorna `null`, como o Supabase, e o papel admin expõe `isAdmin`. As capturas e a acessibilidade já aprovadas foram preservadas; todos os demais scripts passaram na execução final. Esses ajustes estão confinados a `tests/ui/` e não alteram autenticação ou permissões da aplicação.

A UI usa componentes reais com transporte/roteamento isolados. O banco descartável valida os RPCs/triggers/RLS reais sobre o bootstrap de teste. Isso não comprova E2E autenticado com Supabase publicado, navegação real com sessão, responsividade em aparelho físico ou encerramento abrupto do processo. Essas fronteiras precisam de homologação antes de deploy. Os checks remotos são consultados separadamente após publicar a PR.

## Categorias e limites de integração

Conforme decisão do usuário, esta PR mantém **TELHADO e OVERHEAD**. Não cria categoria nem botão cenográfico. TELHADO usa metragem total; OVERHEAD usa metros por trecho × trechos, com as regras e snapshots existentes. Categorias futuras de cálculo continuam exigindo contrato, unidades, validação e regras aprovadas.

O Resumo usa impressão do navegador. Os PDFs de teste verificam CSS de impressão, sem acrescentar gerador PDF à aplicação. Emitir registra documento/status; envio de e-mail não está integrado. A tela informa que a prévia/impressão usa a visão atual e não recupera o snapshot histórico dos documentos emitidos. Não há restauração de versões nesta entrega.

Não houve migração nova, aplicação de SQL em produção, emissão, aceite, geração de ordens, merge ou deploy. Evidência local, banco descartável, CI e comportamento publicado são fronteiras separadas.

O checkout auxiliar de comparação ficou preservado porque a revisão automática do ambiente bloqueou sua remoção. A implementação permanece no worktree da branch da PR; o checkout original do usuário não foi alterado.
