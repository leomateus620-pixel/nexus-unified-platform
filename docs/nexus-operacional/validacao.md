# Validação do checkpoint operacional

## Checkpoint43 — Almoxarifado e qualidade de arquivos

| Método | Resultado e alcance |
|---|---|
| PostgreSQL16.15 descartável | Instalação limpa43, upgrade42→43, prefixo/checksums preservados, regressões antigas;49 cenários de estoque,38 arquivos e10 concorrências/transações passaram |
| Compatibilidade relacional | Nove pares FK únicos, nomes/colunas/ações históricas preservados, seis DMLs diretos entre tenants rejeitados; trigger interno sem EXECUTE público |
| Metadados conectados |0023 aplicada13:16:47.507078 UTC;0024 aplicada13:29:30.366847 UTC. Ledger43, catálogo, RLS, grants, Storage e relações conferidos às13:30:19.277589 UTC, sem fixtures operacionais |
| DTOs reais locais |25 respostas SQL de listas/detalhes/opções/comando aceitas pelos schemas; resumo sem fixtures em `almoxarifado-dto-zod.json` |
| Domínio e handlers isolados | Estoque28, anexos26, aceite6 e guard AST3 passaram; PE arquivos9 passaram. Quatro dos28 testes de estoque exercitam respostas tardias/purge/mudança de acesso, sem provar logout real conectado |
| UI final isolada | Almoxarifado228 layouts/17 comportamentos; anexos seis layouts/cinco comportamentos; arquivos PE oito comportamentos; zero erros JS/overflow nas verificações executadas |
| Regressão preservada | Orçamento59+catálogo5 passaram. A tentativa UI completa passou Comercial/Catálogo/autosave,36 layouts/nove comportamentos operacionais, Levantamentos30/10, Estudos61/14 e ação vinculada3; parou na expectativa textual antiga do novo teste de estoque. A fatia corrigida passou em `ui-43-final/`; não se declara exit0 da tentativa completa |
| Compilação | Tipos oficiais43:108 tabelas/161 funções RPC/quatro enums, AST preservada. Typecheck global e build passaram. ESLint dos48 arquivos de código alterados/novos: zero erros, um aviso preexistente em `operacao/components.tsx` |

Evidências de banco: `banco-local-43.json`, `schema-diff-43.json`, `verificacao-remota-0024.json`; catálogo42 e preflight permanecem como histórico discriminado. UI: `ui-43/` para as etapas gerais e `ui-43-final/` para a fatia final. A primeira tentativa42 foi interrompida por HMR enquanto arquivos de laboratório mudavam e não conta como aprovação. A falha43 da nova expectativa textual foi corrigida preservando as verificações de versão/payload/retomada. O CI do novo commit deve ser acompanhado separadamente; o CI41 aprovado não comprova o head seguinte.

Product Design: inspeção e capturas reais dos componentes no navegador integrado em390×845/1440×900, incluindo lista, ficha, reserva e consulta de política. As capturas usam transporte de laboratório e não comprovam backend operacional. Arquivos privados canônicos agora distinguem ler/adicionar/retomar/cancelar e PE preserva a identidade original quando nomes locais diferentes são deduplicados.

Conforme decisão do usuário, não foram criadas fixtures no banco operacional e não foi executado E2E conectado de Auth/Storage HTTP. Dispositivo físico, teclado virtual real, leitor de tela, p95 sob carga e todas as jornadas integradas da plataforma continuam sem comprovação. Compra independente, OS/custo, paginação das coleções de detalhe e consumidores da Agenda permanecem pendentes.

## Checkpoint 41 — Estudos Técnicos

| Método | Resultado e alcance |
|---|---|
| Banco real local PostgreSQL 16.15 | 56 cenários principais, 32 de arquivos, 12 concorrências; instalação limpa 41/upgrade 40→41, envelopes e regressões antigas, exit 0 |
| Fonte e histórico | PE legado anterior ao upgrade mantém hash/snapshot e é recusado como fonte sem IDs; nova revisão congela IDs e é aceita. Documento legado não é reatribuído pelo pai mutável |
| Metadados conectados | Aplicação 0022 em 12:12:30.11955 UTC, ledger 41 e schema/RLS/grants/Storage conferidos; sem dados de demonstração ou sessão Auth |
| Testes isolados de domínio/handler | `npm run test:estudos`: 22 + 15, exit 0; transportes substituídos não comprovam RLS |
| DTOs de banco | Cinco formatos reais do PostgreSQL local aceitos pelos schemas; evidência `evidencias/engenharia/dto-postgresql-local.json` |
| UI isolada | 61 layouts em 360/390/768/1024/1366/1440, 12 comportamentos, zero erros JS/overflow; inclui rede vs revogação, versão fixa do formulário e ação canônica |
| Ação por URL | Três cenários adicionais: seleção após recarga, conflito após refetch e recuperação explícita mantendo justificativa, cache oculto quando leitura falha |
| Compilação e geração | Typecheck global/build exit 0; tipos oficiais de 95 tabelas/131 funções/quatro enums, AST preservada, sem credenciais operacionais |
| Regressão | Operacional 49 + manifesto 9 + tipos 3 + contratos 134 passaram. Suíte UI completa posterior exit 0 em `evidencias/ui-41/`; repetição delimitada após remover título duplicado também exit 0 em `evidencias/ui-41-final/` |

Evidências: `evidencias/banco-local-41.json`, `schema-diff-41.json`, `verificacao-remota-0022.json`, `geracao-tipos-41.json` e `ui-estudos/`. Capturas são de componentes reais com backend de laboratório; não comprovam dispositivo físico, teclado virtual real, leitor de tela, carga de produção ou Auth/Storage HTTP conectado. A interface não anuncia conformidade normativa automática, ART emitida ou PDF inexistente.

Rodada local de regressão em 22/10/2026, Windows, Node 24.15.0. Branch `codex/nexus-operacao-integrada-agenda-equipe`, a partir de `820c79d60055a25e2d56bf60a091f032c5e7a8bf`, com as alterações da entrega no working tree. Os comandos abaixo usam dependências existentes; não houve atualização de lockfile para executar os checks.

Esta rodada comprova compilação, testes de domínio/contratos e preservação de código conforme cada gate. Não declara a evolução inteira concluída, persistência no banco conectado, frontend publicado ou homologação em dispositivo físico. Escopo e pendências permanecem em `inventario.md` e `progresso.md`.

## Checkpoint 40 — Levantamentos Técnicos

Coleta, modelos, revisão, arquivos e adoção agora têm implementação e evidência local própria em [levantamentos-tecnicos/validacao.md](levantamentos-tecnicos/validacao.md). Passaram typecheck/build, vinte testes da feature, 47 cenários SQL, 28 de arquivos e 12 concorrências; UI isolada com 30 layouts e dez comportamentos. O schema da migração `0021` foi aplicado e conferido com ledger40. Isso não comprova E2E autenticado conectado, Storage HTTP ou frontend publicado. A decisão de validar localmente está registrada abaixo; nenhuma fixture operacional foi usada.

A regressão UI completa do checkpoint 40 encerrou exit 0, com relatórios em `evidencias/ui-40/`. Tipos foram regenerados oficialmente em cluster local somente com schema; [geracao-tipos.md](geracao-tipos.md) documenta a reprodução, comparação de catálogo e hashes. Depois da regeneração passaram typecheck, lint delimitado, orçamento 59+5 e build. Três testes do executor validam loopback, isolamento de credenciais e equivalência AST da formatação. A geração oficial não comprova o comportamento de Auth, RPC ou Storage HTTP conectados.

## Reexecução após os ajustes de QA

Rodada posterior às mudanças de identidade do frame, biblioteca com busca na URL, retorno da ficha de pessoa e retomada de arquivo PE. Nenhum teste full UI foi executado por esta rodada; sua execução permanece separada.

| Comando / recorte                                                                                                     | Resultado final                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                                                   | Exit 0 após corrigir o contrato opcional de busca da biblioteca                                                                |
| `npm run test:operacional`                                                                                            | Exit 0: **49 testes**, nove de manifesto e **134 arquivos protegidos** sem alteração                                           |
| `npm run build`                                                                                                       | Exit 0; mesmos avisos de chunks acima de 500 kB e `inlineDynamicImports`/`codeSplitting`                                       |
| ESLint dos TS/TSX/JS/MJS/CJS alterados ou novos da entrega, excluindo gerados e arquivos preexistentes fora do escopo | Exit 0: **63 arquivos**, zero erros e um aviso de Fast Refresh; biblioteca e teste de paridade rechecados após o último ajuste |

O typecheck inicialmente encontrou cinco erros após a busca da biblioteca tornar `search` obrigatório para os links antigos, além de acesso por ponto a `q` vindo de index signature. A correção ficou somente na biblioteca: entrada opcional com `SearchSchemaInput` e acesso por chave. IndustrialMap, Trevisan e Silo não foram modificados. Typecheck, ESLint e Prettier do trecho passaram depois da correção. O build já havia passado; não foi repetido após essa correção de tipos e acesso equivalente à mesma propriedade.

O teste de paridade passou a verificar a matriz vigente em `operacao_autor_pode`, na migração `0020`, e ganhou teste de delegação exclusiva de `operacao_pode` com `auth.uid()`. Por isso o total operacional aumentou de 48 para 49. A migração histórica `0012` não foi alterada para acomodar o teste.

A seleção inicial ampla de lint alcançou também dois scripts preexistentes em `docs/casos-comerciais/`, fora desta entrega: `calcular_protecao.mjs` e `qa-concorrencia.mjs`, com 77 erros de formatação. Eles foram preservados. O recorte de 63 arquivos corresponde ao código da tarefa, inclui scripts de migração/UI novos e não redefine o baseline global como aprovado. Lista exata, resultados, tentativa de typecheck anterior e exclusão explícita estão em [regressao-final-qa.json](evidencias/regressao-final-qa.json); logs TEMP têm prefixo `nexus-final2-`.

## Rodada anterior de regressão

| Comando                                                         | Categoria                               | Resultado                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                             | Compilação TS                           | Exit 0, sem erro                                                                                               |
| `npm run test:operacional`                                      | Unitário/contratos estáticos            | Exit 0: 48 testes em seis arquivos; nove testes de manifesto; 134 arquivos protegidos sem alteração inesperada |
| `npm run test:orcamento`                                        | Domínio/motores/catálogo                | Exit 0: 59 testes da suíte principal e cinco da configuração de catálogo                                       |
| `npm run test:silo`                                             | Domínio, contratos, assets e cinemática | Exit 0: 69 testes; não é ensaio visual de browser nem homologação profissional                                 |
| `npm run build`                                                 | Build de produção local                 | Exit 0; bundles client/server e artefatos Nitro gerados localmente; nenhum deploy executado                    |
| ESLint dos TS/TSX alterados, incluindo novos, excluindo gerados | Análise estática delimitada             | Exit 0: 47 arquivos, zero erros, um aviso                                                                      |

O aviso do lint delimitado é `react-refresh/only-export-components`, em `src/features/operacao/components.tsx`, pelo hook `useCommandKey` exportado junto aos componentes. Não foi tratado como erro nem ocultado. O build emitiu aviso de chunks acima de 500 kB e de `inlineDynamicImports` ignorado por existir `codeSplitting`; build aprovado não comprova meta de LCP/INP/FPS ou ausência de custo de carregamento.

Logs completos desta rodada ficam no diretório TEMP local, com prefixo `nexus-final-` (`typecheck`, `operacional`, `orcamento`, `silo`, `build` e `lint.json`). O resumo compartilhável, com a lista exata de arquivos do lint, está em [regressao-local.json](evidencias/regressao-local.json). Os comandos foram executados em paralelo; suas durações não são benchmark de desempenho do produto.

## Requisitos cobertos por esses gates

| Requisito / risco                               | Teste ou evidência                                                         | Alcance comprovado nesta rodada                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| T04: papel ausente/desconhecido e rota indevida | `nexus-nav.test.ts`, `autorizacao.test.ts`, `operacao-permissions.test.ts` | Matriz TS, paridade declarada com SQL operacional, fronteiras `/projetos` e `/projetos-engenharia`; não substitui E2E com usuário real |
| T05/T35: perda/troca de contexto                | `session-access.test.ts`                                                   | Remoção de cache, cancelamento de resposta pendente e revogação de capacidade em QueryClient isolado                                   |
| T06: contratos de cliente/unidade/contato       | `clientes-operacionais.test.ts`                                            | Campos, identificador alfanumérico, erros e limites; persistência/FKs exigem integração SQL                                            |
| T08: motores e catálogo preservados             | `test:orcamento` e contrato de 134 arquivos                                | Referências de cálculo/custo, estrutura, importação, salvamento e identidade do código protegido                                       |
| T20: modelo/versionamento do acervo             | `projetos-engenharia.test.ts`                                              | Schema documental, fonte, precisão textual, IDs estáveis e comparação; não comprova PDF ou aprovação técnica                           |
| T21: validação de upload                        | `operacao-files.test.ts`                                                   | Bytes, MIME, tamanho, hash e pai único; não comprova Storage conectado                                                                 |
| T01: ordem/integridade de migração              | Nove testes do manifesto                                                   | Checksum, caminhos, ordem, prefixo e rejeição de mudança; instalação/upgrade reais pertencem ao relatório SQL                          |
| T34: preservação das cenas e motores            | `contratos-preservados.json` e `test:silo`                                 | 134 arquivos protegidos e contratos numéricos/assets; não comprova navegação/câmera em browser ou desempenho de dispositivo            |

## Baseline e comparadores históricos separados

Na auditoria inicial, `npm run lint` global falhou com **34.043 erros e 17 avisos**, predominantemente formatação CRLF. Esse é um resultado da base registrado em `progresso.md`, distinto do lint delimitado acima. A rodada final não reexecutou nem declarou aprovado o lint global; não foi feita reformatação em massa para eliminar o baseline.

O antigo `test:ui:contracts` falhava antes de emitir relatório por nó AST sem inicializador. O crash foi corrigido com marcador explícito; o comparador permanece em `npm run test:ui:legacy-contracts` e continua com **exit 1**: oito hashes diferentes entre 56 arquivos, transições diferentes e 13 diferenças funcionais em 70 arquivos comparados contra `e4dea2a`. O perfil operacional explícito usa a base auditada `820c79d`, preserva 134 arquivos e passou. Essa separação e o relatório integral estão em [contratos-validacao.md](contratos-validacao.md); não transforma a reprovação histórica em aprovação.

## Integração, UI e ambiente conectado

Integração SQL, instalação limpa/upgrade, aplicação remota e verificação de buckets/jobs devem ser registradas com o ambiente efetivo e o SQL correspondente; os testes unitários acima não os substituem. O estado de aplicação fica em `migracoes.md`.

O laboratório UI usa fixtures e fronteiras de backend substituídas. As capturas e execuções UI da entrega são registradas separadamente pelo responsável por essa rodada; **esta rodada de regressão não executou `test:ui`** nem alterou superfícies durante as capturas. Persistência/Storage com backend conectado, convites externos, performance com carga representativa e dispositivos físicos não são comprovados por build ou capturas locais.

Nenhuma fixture desta rodada foi inserida no banco operacional. Não houve merge, force push, deploy ou publicação automática. Menus que ainda não possuem jornada real permanecem pendentes, independentemente destes gates aprovados.

## Banco local e schema conectado

Segunda rodada remota (`39757117641`, HEAD `dceb633`): banco, instalação/upgrade e concorrência passaram após corrigir o marcador do runner. O job parou adiante em 17 erros de Prettier de `src/features/importacao/mapeamento.ts` e `src/features/propostas/hooks.ts`. Correção limitada à formatação desses dois arquivos; hashes de árvores de sintaxe antes/depois são idênticos, ESLint dos dois passou e orçamento59+5 foi reexecutado com exit0. Evidência em [formatacao-ci.json](evidencias/formatacao-ci.json).

O job `circulation` dessa rodada exercitou a cena, mas parou ao reentrar pela biblioteca, pois o link público da Escada dependia do menu antigo sem autorização. Foi incluído acesso explícito na biblioteca; nenhum código de cena, câmera ou controle foi alterado. A verificação visual operacional final passou novamente (36 layouts/nove comportamentos). O resultado final em CI deve ser lido no HEAD posterior a essas correções.

Primeira execução remota de `verify` (run `39756851694`, HEAD `c18723b`) interrompida em `anexos-confirmacao-concurrency.mjs`: `Use o runner descartável`. A criação/migração e assertions anteriores passaram, mas o runner POSIX só fornecia `PGTEST_EPHEMERAL=1` ao processo de instalação. A correção exporta o marcador após criar o cluster temporário para os filhos seguintes, mantendo a proteção contra execução avulsa. Isso é uma falha real de portabilidade do runner; não foi ocultada como erro preexistente nem corrigida reduzindo a autorização.

`tests/db/run.ps1 -PostgresBin <PostgreSQL16.15/bin> -Port 55450` encerrou exit 0 em cluster descartável: instalação de 39 migrações, upgrade de 30 para 39 com cliente histórico preservado, retry sem reexecutar SQL, rejeição de drift e rollback conjunto de DDL/ledger. Também foram executados os mesmos envelopes de uma instrução usados pelo conector. Relatório: [banco-local-final.json](evidencias/banco-local-final.json).

As suítes novas cobrem Clientes 28, Engenharia 19, arquivos de engenharia 19, fundação 45, Agenda 38, administração 16, scheduler 3 e confirmação de anexos 12 assertions, além dos cenários concorrentes reais de operações/confirmacão e das suítes históricas. Cinco disputas novas verificam revogação de papel/capacidade e reatribuição do pai enquanto a confirmação aguarda locks. Autorização também é reavaliada no retry de arquivo já vinculado.

No projeto Lovable `91380c2d-559c-4527-b3a4-1a8bc1e19f69`, `0012`–`0020` foram aplicadas: 39 entradas no ledger, fonte/hash conferidos, bucket privado de 20 MiB, `pg_cron` ativo. Execução automática do worker foi observada com zero itens/erros; não prova entrega de notificação de uma atividade real. A conferência final coincide em 73 relações, 406 constraints, 168 índices, 136 políticas e 63 triggers; das 108 funções, apenas a diferença histórica de indentação já reconciliada permanece. Grants extras de plataforma e privilégio de serviço estão discriminados, sem grants inesperados aos novos objetos para anon/auth. Ver [schema-diff-final39.json](evidencias/schema-diff-final39.json), [verificação 0020](evidencias/verificacao-remota-0020.json) e `migracoes.md`.

Essas verificações consultam catálogos, configuração e execução técnica do job; não inserem usuários, pessoas, incidentes, clientes ou documentos fictícios no banco operacional. Upload HTTP privado, sessão remota de dois perfis e E2E conectado permanecem sem comprovação.

## Produto, teclado e visual

**Execução completa: `npm run test:ui` encerrou exit 0.** O runner executou captura, acessibilidade, etapas, catálogo, comércio, revisões, comparação de workspace, autosave e qualidade operacional. Há 11 telas existentes em oito larguras (320–1920), 32 vistas de workspace sem erros/overflow, 16 cenários de autosave, 15 de comércio e sete de revisão. Os novos padrões operacionais foram exercitados ao final da mesma execução. [Resumo da execução](evidencias/ui-execucao-final.json) e relatórios completos em `evidencias/ui-regressao-final/`.

As tentativas intermediárias falharam por adapters ausentes/desatualizados e seletores ambíguos após incluir busca na navegação. Foram corrigidas as fronteiras de teste (sem modificar motores ou catálogo) e os seletores passaram a identificar a busca pelo nome acessível. O resultado final acima é posterior às correções e aos ajustes do shell; não reutiliza um resultado de antes da mudança.

`npm run test:ui:operacional` encerrou exit 0: **36 layouts**, **nove verificações de comportamento**, **sete pares de contraste**, zero erros de página. Há listas, formulário e workspace nas larguras 360/390/768/1024/1366/1440; detalhes em [qualidade-produto.md](qualidade-produto.md) e [results.json](evidencias/ui-final/qualidade-operacional/results.json). A recuperação de erro de rede mantém o texto; Escape restaura foco; alteração não salva exige descarte explícito; busca da biblioteca persiste na recarga. Comparação de frame confirma mesma largura/paleta/altura em Pessoas, Dimensionamento, Produtos e OC.

Texto a 200% foi simulado com viewport 390×480, com formulário rolável e botão Salvar alcançável. Não é prova de teclado virtual físico, leitor de tela, zoom nativo ou certificação de acessibilidade. Capturas CUA de antes/depois do menu e do workspace usam 390×845 efetivos; imagens automatizadas finais usam os viewports indicados no relatório. Fixtures somente no laboratório.

Comparação desktop do workspace preservado: [antes em 1440×900](evidencias/13-workspace-before-1440.png) / [depois em 1440×900](evidencias/14-workspace-after-1440.png), com mesma fixture, fonte e navegador. Os controles e valores comerciais permanecem; a identidade do frame fica constante.

## Limite de validação acordado

Em 22/10/2026, o usuário definiu: “Validar localmente e registrar o limite do E2E conectado”. As próximas jornadas serão verificadas com PostgreSQL descartável, testes de domínio e componentes reais no laboratório isolado. Não serão inseridas fixtures no banco operacional para produzir evidência. O E2E autenticado conectado (Auth, dois tenants/perfis e Storage HTTP) permanece **não comprovado**; validação local não demonstra esse comportamento remoto. Esta decisão não encerra as pendências funcionais dos módulos nem altera as permissões exigidas.

## Situação dos cenários do escopo integral

| Cenário     | Evidência deste checkpoint                                                    | Limite / próxima prova                                         |
| ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T01         | Instalação limpa, upgrade e envelopes reais PostgreSQL                        | Schema conectado conferido; não equivale a deploy do frontend  |
| T02–T05/T35 | RLS/FKs/roles/último admin/revogação SQL, matriz TS e cache                   | E2E de usuários e arquivos HTTP conectado pendente             |
| T06         | 28 assertions SQL e formulários reais no laboratório                          | Jornada autenticada remota pendente                            |
| T07         | Comercial direto preservado                                                   | Oportunidades ampliadas adiadas pelo recorte                   |
| T08/T11     | Motores, catálogo e geração OC/OP históricos preservados/testados             | Sem alteração dos motores ou cena                              |
| T09–T10     | Coleta/revisão/adoção local implementada em T09; T10 segue pendente           | E2E conectado de Levantamentos e estudos técnicos pendentes    |
| T12         | Recebimento/estorno histórico testado                                         | Novo vínculo com estoque/qualidade ainda pendente              |
| T13–T19     | Agenda reserva pessoas sob concorrência; sem OS/estoque novos                 | Compra operacional, materiais, horas, RDO e execução pendentes |
| T20         | Versões/snapshot/hash do acervo PE em SQL                                     | PDF técnico/dossiê emitido ainda ausente                       |
| T21         | Bytes/hash/MIME e pai no domínio; staging/RLS e revogação em SQL; retomada UI | Storage HTTP/E2E conectado e limpeza de órfãos pendentes       |
| T22–T23     | Sem implementação nova                                                        | PDF/job e checklist versionado pendentes                       |
| T24         | Ação canônica com evidência/verificação em SQL/UI                             | Origem em inspeção/ocorrência ainda pendente                   |
| T25         | Worker/outbox local deduplicado e cron remoto observado com fila vazia        | Recorrência de manutenção e notificação real pendentes         |
| T26–T28     | Sem implementação nova                                                        | Financeiro gerencial, custos e viagens pendentes               |
| T29–T31     | Fundação Agenda: ação/evento, reserva semiaberta, qualificação e conflito SQL | UI, origens OS/inspeção, recursos e recorrência pendentes      |
| T32         | Formulário preservado em erro; versão/idempotência SQL; foco/descarte UI      | Offline completo e retomada HTTP não certificados              |
| T33         | Agregações históricas preservadas                                             | Novos dashboards/relatórios operacionais pendentes             |
| T34         | 134 arquivos protegidos, domínio silo/escada/industrial preservado            | Sem alteração de cenas; não é ensaio físico de GPU/gestos      |

A PR deste checkpoint deve permanecer draft enquanto essas lacunas indispensáveis da evolução consolidada estiverem abertas. Aprovação dos gates descritos não altera essa situação.

## Base atualizada pelo Lovable

Mesmo em consulta de planejamento solicitada sem mudanças, a plataforma produziu três commits em `main`, atualizando seu pacote de configuração, lockfile e armazenamento gerado de autenticação do preview, além do plano auxiliar. Os quatro arquivos foram conferidos e a base incorporada à branch de trabalho por merge `5cb9de2`, sem reescrita de histórico e sem aprovar o plano. Apenas um pacote foi instalado pelo lockfile frozen. Typecheck, build e operacional49+manifest9 passaram depois da reconciliação.

A revisão do broker e nove testes smoke em VM passaram: SSR/host comum, iframe de preview, seed/revogação da sessão, concorrência local e origem não autorizada. São respostas simuladas do editor, sem login real. [preview-auth-smoke.json](evidencias/preview-auth-smoke.json) registra fonte, método e limites.

O agente Lovable informou presença das duas variáveis no sandbox/dev; isso não foi tratado como comprovação do runtime publicado. Informou também que `supabase--get_types` escreve o arquivo gerado na branch conectada. Nenhuma regeneração ou aprovação de execução desse plano foi solicitada; o Codex continua editor da branch da PR.
