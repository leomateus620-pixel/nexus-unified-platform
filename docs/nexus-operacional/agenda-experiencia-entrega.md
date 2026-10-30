# Agenda Equipe — experiência e validação

## Diagnóstico e decisões

A branch foi relida a partir de `origin/main`. A composição repetia o título global, dividia criação em dois comandos, exibia configurações antes dos compromissos e usava `visita_tecnica` como categoria padrão. O contrato de projetos da Agenda precisava trazer cliente canônico, endereço realmente vinculado à proposta/unidade e contexto completo na releitura de ações.

O escopo permanece em Agenda e Dashboard. A navegação global não mudou. A direção final, refinada pelo usuário durante a implementação, usa grafite neutro, branco esverdeado na versão clara e tons de verde com contraste e hierarquia. Reutiliza Saira/Barlow, Lucide, Radix, React Query e Recharts existentes.

- `AgendaAppearance`: modo noite/claro persistido por organização/usuário em armazenamento local, propagado aos portais sem mudar o tema dos demais menus.
- `AgendaToolbar`/`AgendaFiltersPanel`: datas, lista/semana/mês, uma criação e filtros transacionais sincronizados com a URL.
- `AgendaCalendar`/`AgendaEventCard`/`AgendaPendingCard`: um card por ID real; intervalos completos; pessoas, cliente e local opcionais; fila explícita Sem horário.
- `AgendaForms`/`AgendaEventFields`/`AgendaPicker`/`composer-domain`: editor Evento/Ação, períodos, pessoas/responsabilidade, cliente/projeto e sugestão de local confirmada pelo usuário. Preserva os campos ocultos e o legado temporal.
- `AgendaDetail`/`AgendaActionPanel`: detalhe em modal com posição preservada, categoria opcional, transições canônicas, histórico, notificações, arquivos e contexto da origem.
- `AgendaDashboard`/`dashboard/`: cinco insights com drilldown, dados completos do período, tabelas equivalentes, empates e estados de erro/vazio. Carregamento sob demanda.

## Contratos e cálculos

`ag_universo` verifica organização e autorização atual por origem, aplica período civil em São Paulo e recortes comuns à lista e Dashboard. `ag_listar_v2` continua paginado; `ag_dashboard` agrega todo o universo sem varrer páginas/detalhes no cliente. `ag_pendentes_v2` consulta ações realmente sem evento não cancelado, com recortes suportados. A identidade é sempre ID/vínculo, nunca título.

A Dashboard considera ocorrências persistidas publicadas/em andamento/concluídas. Dias usam interseção; faixas horárias contam cada evento/data que ocupa a faixa semiaberta; dia inteiro fica fora de horas e demanda horária. Responsável e participantes elegíveis são deduplicados, sem observadores/recusas. Horas semanais usam `range_agg` e união de intervalos sobrepostos por pessoa, com segunda-feira como início e recorte pelo período. Categorias ausentes usam `sem_categoria`, sem reclassificar o legado. Cancelados e rascunhos continuam disponíveis na agenda.

`agendar` e criação de ação com evento são transações idempotentes. Falha na publicação reverte a criação parcial; tentativa com a mesma chave recupera a mesma operação. `expected_version`, bloqueios, confirmações, reservas e permissões permanecem ativos. Alterações invalidam os caches da lista, ações e Dashboard.

## Migrações conectadas

Projeto Lovable confirmado: Nexus Unified Platform (`91380c2d-559c-4527-b3a4-1a8bc1e19f69`), conta Primary. SQL aplicado diretamente por `query_database`, sem conversa no Lovable. Cada arquivo é aplicado por `migrationEnvelope`: DDL e ledger em uma transação, pré-requisitos e checksums conferidos. Nenhum dado sintético foi inserido no servidor conectado.

| Posição | Arquivo                         | SHA-256                                                            |
| ------- | ------------------------------- | ------------------------------------------------------------------ |
| 53      | `0034_agenda_experiencia.sql`   | `9568ff9541890b584ace87541cda468d2b4cd7aaaf055f88dff0165fe8a154b6` |
| 54      | `0035_agenda_acao_contexto.sql` | `1ef478f53a4c1b7b2841e4a364e34bf7bc9265c6fe5efaa459e603a8ad11bc1b` |

O ledger remoto confirmou as três posições e hashes. `anon` não possui execução de `ag_dashboard`; `authenticated` possui. As ACLs continuam sendo verificadas dentro das funções.

## Validação

Os comandos equivalentes de `typecheck`, `build` e `test:agenda`, e o lint do escopo, usam o Node fornecido pelo ambiente (o shell não disponibiliza npm). Vitest Agenda: 72 testes. Instalação SQL limpa, upgrade e envelopes do conector: 55 migrações. Dashboard SQL: 31 cenários/assertivas, incluindo limite de página, autorização parcial, meia-noite, domingo/segunda, sobreposições, dia inteiro, recorrência, empate, mês vazio, relacionamentos e rollback de publicação. Regressões de Agenda básica, segurança, temporal e séries também passaram.

UI usa as rotas, componentes e hooks reais com transporte de teste isolado: 82 verificações de layout e 41 grupos funcionais nas seis larguras requeridas; nenhum erro de página/console. Os relatórios e capturas estão em `evidencias/agenda-experiencia-2026-10-30/`. A comparação visual e suas iterações estão em `design-qa.md` na raiz.

A regressão completa `tests/db/run.sh` passou em PostgreSQL 18.4 descartável, com saída `RESULTADO: TODOS PASSARAM`. Ela encontrou uma atualização vazia que elevava indevidamente a versão inicial de ações; a migração incremental 0036 corrige esse caso sem alterar 0034/0035 já aplicadas. Inclui regressões de concorrência, reservas, recorrência, anexos, desempenho de listagem e demais módulos operacionais.

Limites: não foi realizado E2E com Auth/Storage HTTP conectado nem teclado virtual/VoiceOver em aparelho físico. As migrações e seus metadados foram verificados no servidor real; os cenários funcionais de persistência/permissão foram executados em PostgreSQL descartável. A abertura de PR não publica o frontend nem faz merge automaticamente.

### Resultado de lint e execução conectada

O lint de todos os arquivos alterados da Agenda e dos testes passou. O comando global `eslint .` foi interrompido ao processar os bundles gerados de PDF.js; a execução sobre as fontes, excluindo `public/**` e `docs/**`, terminou com 156 erros e 28 avisos existentes. Os 29 arquivos apontados estão intactos nesta branch; nenhum arquivo alterado possui achado de lint. Não foram feitas correções globais fora da Agenda.

Depois das migrações, um smoke de leitura SQL no servidor conectado confirmou configuração, opções de pessoas e contrato da Dashboard pelas funções autorizadas. A preferência de tema não exige migração nem altera perfis/permissões: persiste localmente por organização e usuário. O runner PowerShell recebeu o novo cenário em paridade com shell, mas não foi executado no macOS.
