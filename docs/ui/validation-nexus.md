# Validação da apresentação operacional NEXUS

## Escopo e isolamento

O harness em `tests/ui/` monta os componentes reais de `src`, incluindo `AppShell`, o componente da rota de revisão, as oito páginas da proposta, a lista de propostas e detalhes de OC/OP. Somente as fronteiras de sessão, router, Supabase e funções de servidor são substituídas no Vite de teste. Hooks, formulários, validações, formatadores e handlers de negócio vêm da aplicação. Os dados sintéticos existem exclusivamente em `tests/ui/data.ts`; nenhum arquivo de produção importa esse módulo.

As requisições do navegador são limitadas ao servidor local e aos dois hosts das fontes já usadas pela aplicação. As mutations são registradas em memória; não há escrita no Supabase, criação de usuário, envio, emissão real ou alteração de autorização. Os perfis representam condições de apresentação; não constituem prova de autenticação, RLS ou homologação ponta a ponta.

## Reprodução

Instale as dependências canônicas de `bun.lock`. Em dois terminais PowerShell, use `node node_modules/vite/bin/vite.js --config tests/ui/vite.config.mjs` com:

- Antes: `NEXUS_UI_SOURCE` apontando para um checkout limpo de `e6c765f4` e `NEXUS_UI_PORT=4181`.
- Depois: `NEXUS_UI_SOURCE` ausente, `NEXUS_UI_PORT=4182`.

Execute, sequencialmente, `node tests/ui/capture.mjs before` e `node tests/ui/capture.mjs after`. `NEXUS_UI_CHROMIUM` permite selecionar um executável Chromium já instalado; sem essa variável, o Playwright usa o navegador da sua instalação. Os dois servidores usam caches separados no diretório temporário. Não edite os fontes nem execute builds durante a medição.

`node tests/ui/accessibility.mjs` verifica contraste calculado a partir das cores efetivas dos tokens no navegador, foco, menu, inspetor, perfis de apresentação e movimentos de OC/OP. `node tests/ui/stages-checks.mjs` verifica callbacks documentais, cancelamento, validações de parâmetros e impressão. `node tests/ui/contracts.mjs e6c765f4` compara os contratos por AST e hashes normalizados para LF dos arquivos protegidos.

Para validar a versão atual com servidor gerenciado, use `npm run test:ui`: o runner abre uma porta local isolada (4190), executa os três scripts de navegador e encerra o servidor. A comparação pontual de contratos usa `npm run test:ui:contracts -- e6c765f4`; esse baseline não fica imposto como contrato permanente no CI. `NEXUS_UI_PHASE=visual` ou `performance` repete somente essa parte de uma execução anterior completa, preservando as demais evidências; requer `results.json` existente.

## Matriz e evidências

Cada versão percorre 11 telas em 360, 390, 768, 1024, 1366, 1440 e 1920 px, incluindo altura de notebook de 768 px. As capturas `*-viewport.png` mostram a primeira dobra; as demais preservam o documento completo. Estados adicionais: cálculo pendente/indisponível, erro, conflito, conteúdo vazio, revisão somente leitura, perfil sem custos, OC emitida e OP liberada. O conjunto usa descrições extensas e valores grandes.

As capturas são produzidas pelo Chromium sobre a aplicação e fixtures isoladas. Não são imagens geradas, mocks gráficos ou evidência de dados de produção.

Na matriz final, as 77 combinações de tela/largura não apresentam overflow horizontal da página; o baseline tinha 14. Tabelas que precisam de largura mantêm rolagem interna com nome acessível e foco de teclado. A correção foi verificada também em 768 e 1024 px, onde uma legenda absoluta de cabeçalho causava extravasamento na primeira implementação.

Os 13 controles de foco, menu, seleção mobile, rascunho no redimensionamento, navegação de etapas e perfis passaram. Os 16 pares de contraste medidos passaram: texto principal entre 12,92:1 e 17,13:1 nas três superfícies; secundário entre 8,36:1 e 11,08:1; bordas de campos entre 4,04:1 e 5,36:1; foco acima de 11:1 nos pares verificados. No documento claro, texto secundário apresenta 7,93:1. Esses resultados não abrangem automaticamente todo estado visual possível.

| Tela               | Antes desktop                                              | Depois desktop                                            | Antes mobile                                             | Depois mobile                                           |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Dimensionamento    | [1366](evidence/before/dimensionamento-1366-viewport.png)  | [1366](evidence/after/dimensionamento-1366-viewport.png)  | [390](evidence/before/dimensionamento-390-viewport.png)  | [390](evidence/after/dimensionamento-390-viewport.png)  |
| Itens comerciais   | [1366](evidence/before/itens-comerciais-1366-viewport.png) | [1366](evidence/after/itens-comerciais-1366-viewport.png) | [390](evidence/before/itens-comerciais-390-viewport.png) | [390](evidence/after/itens-comerciais-390-viewport.png) |
| Lista de propostas | [1366](evidence/before/list-1366-viewport.png)             | [1366](evidence/after/list-1366-viewport.png)             | [390](evidence/before/list-390-viewport.png)             | [390](evidence/after/list-390-viewport.png)             |
| Orçamento          | [1366](evidence/before/orcamento-1366-viewport.png)        | [1366](evidence/after/orcamento-1366-viewport.png)        | [390](evidence/before/orcamento-390-viewport.png)        | [390](evidence/after/orcamento-390-viewport.png)        |
| Resumo             | [1366](evidence/before/resumo-executivo-1366-viewport.png) | [1366](evidence/after/resumo-executivo-1366-viewport.png) | [390](evidence/before/resumo-executivo-390-viewport.png) | [390](evidence/after/resumo-executivo-390-viewport.png) |

## Método de desempenho

O mesmo gerador produz 17, 100 e 500 componentes. Para cada quantidade são observados cinco eventos de digitação no filtro, seleção em lote, abertura do inspetor e rolagem. O intervalo medido vai da emissão do evento DOM ao segundo `requestAnimationFrame`, uma aproximação conservadora do feedback visual local. A seleção e a abertura provocam o React real; não se mede latência de rede, salvamento ou capacidade do backend.

As amostras, mediana, máximo, número de nós e alterações de layout após o evento ficam nos arquivos `evidence/before/results.json` e `evidence/after/results.json`, com navegador, CPU e sistema operacional. Alterações de layout incluem eventos com entrada recente; não devem ser interpretadas como o CLS oficial de Web Vitals. A execução é em Chromium headless sem redução artificial da CPU. Cinco amostras não representam distribuição estatística de produção.

A máquina usada foi Intel Core i5-1035G1, quatro processadores lógicos, Windows 10.0.26200, Chromium 149.0.7827.55 e Node 24.15.0. As duas versões usam as mesmas dependências de `bun.lock`, instaladas com Bun 1.4.2 em modo frozen. As cinco amostras incluem a primeira interação; não há aquecimento artificial excluído do resultado. O antivírus do Windows tentou injetar scripts Kaspersky durante a navegação: todos foram bloqueados pelo harness. Os relatórios registram essa interferência de ambiente, sem parâmetros de rastreamento; ela não é uma consulta da aplicação nem uma chamada permitida ao backend.

| Registros | Ação             | Antes mediana / máximo (ms) | Depois mediana / máximo (ms) |
| --------: | ---------------- | --------------------------: | ---------------------------: |
|        17 | Digitação        |                 28,7 / 31,3 |                  29,4 / 31,4 |
|        17 | Selecionar todos |                 25,4 / 31,7 |                  31,2 / 31,7 |
|        17 | Abrir inspetor   |                 27,3 / 32,0 |                  19,9 / 30,5 |
|        17 | Rolagem          |                 31,6 / 32,0 |                  31,5 / 31,7 |
|       100 | Digitação        |                 64,9 / 91,1 |                  31,2 / 31,7 |
|       100 | Selecionar todos |                 64,5 / 67,7 |                  27,5 / 31,5 |
|       100 | Abrir inspetor   |                 53,7 / 64,6 |                  25,4 / 34,8 |
|       100 | Rolagem          |                 31,3 / 32,3 |                  31,5 / 31,9 |
|       500 | Digitação        |                73,1 / 341,9 |                  46,1 / 52,7 |
|       500 | Selecionar todos |                80,1 / 314,4 |                 87,9 / 121,6 |
|       500 | Abrir inspetor   |                87,3 / 282,3 |                  74,5 / 81,8 |
|       500 | Rolagem          |                 31,2 / 31,4 |                  30,9 / 31,5 |

A primeira implementação do inspetor piorou o caso de 500 registros (127,7 ms de mediana). Esse resultado foi mantido em `evidence/after/initial-performance.json` e levou à memoização das linhas e células estáticas, callbacks visuais estáveis e reutilização da formatação existente. Não houve virtualização nem alteração de consultas. A versão final reduziu a mediana para 74,5 ms e o máximo para 81,8 ms.

A meta de feedback de até 100 ms **não foi atingida em todas as amostras**: a primeira seleção em lote dos 500 registros levou 121,6 ms. A mediana dessa ação foi 87,9 ms. O passo intermediário com memoização somente das linhas havia registrado máximo de 215,7 ms e está preservado em `evidence/after/row-memo-performance.json`. Essa limitação permanece registrada; não é escondida por média, animação ou alteração de payload. Digitação e abertura do inspetor nos três tamanhos ficaram abaixo de 100 ms em todas as amostras finais. A seleção de 17/100 registros também ficou abaixo desse limite. Não se trata de garantia em qualquer dispositivo ou rede.

## Contratos e regressões

A auditoria preserva 48 arquivos de backend, domínio, integração, sessão, guard, árvore/rotas públicas e mapas. Declarações de rota, queries, mutations, chamadas de servidor, argumentos de persistência/invalidação e os oito handlers principais dos editores são equivalentes por AST. Além disso, digitação seguida de blur e colagem registraram os mesmos payloads antes/depois. Recebimento e apontamento preservaram decimal, tipo, item e chave UUID; cancelamento e entrada vazia não escreveram.

Typecheck passou no baseline e na implementação. Build e regressões existentes passaram: 24 de orçamento, 16 industriais e 8 de Trevisan. O lint dos arquivos alterados passou, com um aviso preexistente de React Refresh em `Etapas.tsx`. O lint completo continua falhando em formatação/CRLF e uma ocorrência preexistente de `prefer-const` em `src/integrations/supabase/previewAuthStorage.ts:38`, fora do escopo; não foi tratado como verde. Os testes SQL não puderam rodar localmente por indisponibilidade de `bash`; o CI existente é responsável pelo Postgres isolado.

## Limitações de verificação

- Não foi disponibilizado um ambiente autenticado isolado com contas reais por perfil. Permissões de backend, RLS, concorrência real, emissão e documentos históricos não foram homologados pelo harness.
- Zoom de 200% usa `zoom` CSS no Chromium, e o teclado virtual é aproximado por viewport de 390×420 com campo focado. Não equivalem a zoom de interface do navegador, teclado virtual real ou teste físico em Safari/iOS/Android.
- `prefers-reduced-motion` é emulado. Há revisão por teclado e medições de contraste, sem alegação de conformidade integral WCAG 2.2 AA ou cobertura de todos os leitores de tela.
- Confirmações/justificativas nativas dos editores que dependem de retorno síncrono foram preservadas para manter exatamente validação, cancelamento, payload e momento da gravação. Os novos formulários acessíveis cobrem apenas substituições cujo callback pôde ser mantido.
- Dados calculados das fixtures servem à apresentação; a equivalência numérica de domínio é coberta pelos testes existentes do motor, sem introdução de cálculo paralelo de produção.
