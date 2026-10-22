# Checkpoint de execução

## Consolidação48 — entrega focada e evidências locais

Agenda e Equipe estão integradas às identidades, ações, levantamentos,
qualificações, indisponibilidades e ferramentas existentes. Cadastro, edição,
presença, execução do compromisso, arquivos, recorrência, conflitos e lembretes
usam backend canônico. Pendências por versão informam data/código/tentativas;
a paginação se recupera quando o worker reduz o total.

Migrações0027/0028/0029 aplicadas e verificadas no projeto confirmado; prefixo48.
Tipos oficiais48, instalação limpa/upgrade48 e regressão SQL completa passaram.
Agenda66 e Pessoas66 testes; paridade23 e leitura medida30payloads idênticos.
UI consolidada493layouts/138verificações exit0; Agenda30/17 e anexos6/6 final,
complemento de pendências6/4 após correção do retorno de página/cache.
Build e typecheck passaram; lint dos arquivos alterados passou. Baseline CRLF
do lint amplo permanece declarada. CI final será conferido no SHA publicado
da PR13, sem tomar o sucesso do commit35f7ffd como prova da nova revisão.

Cinco destinos incompletos estão em off no mapa de disponibilidade e na URL:
Execução/OS, Inspeções, Documentação, Segurança e Projetos de Engenharia. O
acervo/leitor PE e a fundação de ações ficam preservados no código; ações
continuam utilizáveis pela Agenda. Módulos anteriores utilizáveis permanecem.
Não há expansão do funil/catalogo, alteração de motor ou modificação de cena3D.

Checkpoint publicado anterior:35f7ffd; branch desta entrega:
`codex/nexus-operacao-integrada-agenda-equipe`. O SHA final está na PR e nas
execuções CI vinculadas, evitando uma referência circular no próprio commit.
Validação de usuário conectado/hardware/StorageHTTP não foi exercitada, conforme
decisão do usuário. Sem merge, forcepush ou publicação de frontend.

O escopo integral original continua como backlog. As notas seguintes são
históricas e não substituem o recorte e as evidências desta consolidação.

## Recorte vigente — Agenda Equipe e Pessoas/Equipes

O pedido mais recente concentra a entrega na Agenda Equipe completa e integrada
às pessoas, equipes, qualificações, ações, levantamentos e recursos canônicos
que já funcionam. Ampliações dos outros módulos ficam adiadas. Execução/OS,
Inspeções, Documentação e os novos menus parciais Segurança/Projetos de Engenharia
ficam fora da navegação, com rotas e fontes preservadas. A disponibilidade é
centralizada no mapa de acesso, inclusive para URL direta.

A candidata de OS está preservada somente em TEMP e não integra esta entrega.
Não se promete agendamento de OS, manutenção, inspeção ou viagem inexistentes.
O acervo e o leitor PE já implementados são preservados; OCR, IA e editor
geométrico não recebem novas ampliações neste recorte.

## Consolidação45 — identidade e conferência de qualificação

A0026 preserva associações pessoa/usuário atuais e conhecidas em recibos e
auditoria do servidor. Remover o login não permite autoconferência posterior.
O histórico é privado, imutável e não concede acesso; desligamento continua
removendo membership. Associações antigas sem registro verificável não são
inferidas por nome. Aprovações anteriores não são reescritas.

Instalação limpa e atualização44→45 passaram no PostgreSQL16.15 descartável,
junto da suíte completa de banco, isolamento, reservas e concorrência. Onze
verificações de identidade e59 testes isolados de Pessoas passaram. A fonte
0026 foi aplicada ao projeto confirmado em22/10/2026 às17:41:22.74252UTC,
ledger45, checksum980e98d4036027aba1e0d54e16cc363abde4ae41f004938a8fabad3cd5efa41b.
SELECT pós-aplicação confirmou RLS, trigger, helper sem execução pública e
projeção booleana autorizada. Nenhuma fixture foi enviada ao banco operacional.

A segunda tentativa UI46 também interrompeu com ERR_NETWORK_IO_SUSPENDED
em navegação Chromium local. A retomada delimitada dos testes de dimensionamento,
32 vistas de workspace e16 cenários de autosave passou. A rodada operacional
separada terminou exit0:11 relatórios,451 layouts e108 comportamentos, sem
erros JS. O transporte é de teste e não comprova Auth/Storage conectado.
O próximo commit e seus checks Linux serão identificados pela revisão publicada.

## Checkpoint46 — leitor privado PE com validação local aprovada

Ler original integra a versão PE a PDF/imagem preservados, com página, zoom,
rotação e texto extraível. GET de metadados por ID revalida pai e identidade;
bytes/hash são conferidos antes de renderizar. Não há SQL nova; ledger44 até0025.
Contratos e limites em [projetos-engenharia-leitor.md](projetos-engenharia-leitor.md).

Passaram47 casos isolados do leitor,28 de handlers PE, typecheck global,
ESLint dos67 arquivos de código alterados e build final após fronteira cliente/
SSR. Operacional49 + nove manifesto + três tipos passaram;134 arquivos
protegidos conferidos. SELECT conectado reconfirmou ledger44/0025/checksum igual.
Bundle local final:541231bytes gzip,199 recursos estáticos/3059136bytes;
não são métricas de rede/campo. A UI inicial6/8 passou mas revelou canvas300
em revisão visual; callback de contêiner e asserção de largura corrigidos.
Tentativa refinada interrompida por HMR não é final. `ui-46-leitor-final/`
terminou EXIT0: seis larguras/oito jornadas, widthfit conferido e sem HMR no
laboratório4193. Capturas finais CUA: `pe-leitor/03-original-mobile-enquadrado.jpg`
e `04-prancha-desktop.jpg`, em390×845/1440×900 CSS px, DPR1,14;01/02 rejeitadas.
Anexos6/8 passaram, incluindo continuidade de download após mudança do pai.
Equipes passou36 layouts/17 cenários em `ui-46-equipes/estavel/`, incluindo
atualização antiga da lista sem fechar o próximo editor. A primeira suíte UI
completa46 interrompeu em navegação local de `capture.mjs` com
`ERR_NETWORK_IO_SUSPENDED`; não foi PASS completo. A reexecução
`ui-46-consolidacao/` também interrompeu por transporte Chromium. A retomada
operacional e a cauda de regressão legado passaram separadamente. Paths/hashes
e limites estão em `evidencias/checkpoint-46.json`; a correção de identidade45
aplicada está descrita acima e não é uma alteração SQL do leitor.

Auth/Storage HTTP conectado, OCR/IA, evidência por página persistida, geometria/
editor3D próprio e emissão PDF/dossiê continuam pendentes. Nenhuma declaração de
conclusão integral de PE ou nova implantação frontend decorre desta fatia.

## Checkpoint45 — equipes e qualificações com validação local aprovada

Base publicada347e347, PR13 draft. CI347: verify/circulation passaram; presentation
parou no locator mobile antigo de anexos. Teste atualizado e seis layouts/cinco
comportamentos passaram; resultado antigo preservado em `ci-44.json`.

Equipes/vigências e competências/qualificações usam as tabelas/RPCs existentes,
sem cadastros paralelos. UI com URL, consulta atual, versão congelada, evidência
privada e conferência independente. Passaram57 testes isolados,36 layouts/16
cenários de Equipes,30 layouts/seis cenários de Qualificações, build e lint
delimitado. `npm run test:ui` completo terminou EXIT0:19 relatórios conferidos,
445 entradas de layout operacional,88 capturas de catálogo e32 vistas de
workspace, sem erros JS registrados nas matrizes. Relatórios e hashes estão no
[resumo da execução](evidencias/ui-45-completa-resumo.json). As contagens têm
unidades e jornadas sobrepostas. A árvore de trabalho recebeu HMR durante a
execução; o PASS local não substitui CI do próximo commit nem E2E conectado.
O proxy separado de CSS zoom200 do catálogo ainda registra overflow1730 em
viewport1366. Capturas CUA finais selecionadas:01/03/04/09/10 em
`pessoas-equipes/`; são emulação desktop/mobile, não aparelho físico.

Oito falhas foram reproduzidas na fonte43 e corrigidas por0025, aplicada às
15:06:58.253153 UTC e conferida15:07:25.869853 UTC: ledger44/checksums exatos,
catálogo compatível e nenhuma fixture operacional. FullSQL44 e upgrade43→44
passaram; geração oficial manteve tipos públicos. Fonte aplicada congelada;
correções posteriores0026+. Limite do E2E Auth/Storage conectado permanece.

Preparação independente do leitor PE começou: PDF.js6.4.299 instalado exatamente
com Bun1.4.3 (três dependências, sem atualização em massa); módulo ainda não
integrado/validado. GET de metadados por ID preparado com testes próprios, sem
URLs ou bytes. Não declarar leitura por página entregue antes do QA dessa fatia.

## Checkpoint44 — consulta e edição de pessoas

Checkpoint43 publicado no commit `88d8ccf14b0d630166b8cf7205579b9d2e4c35d0`, na PR13 draft. Verify, presentation e circulation passaram; evidência `evidencias/ci-43.json`. A suíte UI completa passou no CI desse head. O CI do novo checkpoint44 deve ser observado separadamente.

A nova fatia remove a cópia estática da pessoa selecionada, preserva recorte na URL e apresenta lista mobile/ficha com consultas próprias. Rede preserva o formulário; negação oculta cache/arquivos e fecha o editor. O servidor revalida leituras e retorna a pessoa atual após retry de escrita. Não há migração nova ou alteração remota de dados/schema.

Passaram12 testes isolados (oito de pessoa, quatro do guard compartilhado),18 layouts/oito comportamentos UI, typecheck global e build. A regressão de estrutura/formulários existentes passou36 layouts, nove comportamentos e sete pares de contraste, sem erros JS; operacional49 + manifesto9 + tipos3 + contratos134 também passaram. Auditoria/capturas e alcance em `pessoas-competencias.md`. Equipes/competências/qualificações e leitor PE continuam próximos fluxos, sem serem marcados implementados por estas correções.

## Checkpoint 43 — controle físico e integração de aceite

Último checkpoint publicado antes desta consolidação: `07d91f8e666ad6aa9d882dc2155c863d57af99b4`; verify, presentation e circulation passaram (`evidencias/ci-41.json`). PR13 continua draft. A nova jornada de Almoxarifado/Ferramentas integra este checkpoint. Migração0023 aplicada ao projeto confirmado em22/10/2026 às13:16:47.507078 UTC, posição42, SHA-256 `4dc7c8a98483a97c74791b46102c75099387fbcf08dca6398dcf4e25f4f9a2c8`; nenhum registro operacional fictício foi criado.

Foram reproduzidos localmente dois problemas preexistentes: leitura direta de custo de aquisição por Campo e aceite de revisão com vínculos persistidos em requests separados. A 0023 restringe a leitura por `ver_custos` e acrescenta comando transacional de aceite/vínculo. O handler altera somente o ramo de aceite, preservando seu contrato público; guard de AST/hash compara todo o restante do arquivo com a baseline publicada. As 30 migrações históricas, motores, catálogo e cenas permanecem intactos.

O refinamento Product Design e as capturas estão em `almoxarifado.md`. Anexos canônicos admitem ferramenta/calibração por FK, mantendo o hash dos payloads legados. Banco43 passou instalação limpa/upgrade42→43, regressões antigas,49 cenários de estoque,38 de arquivos e10 concorrências, além de nove pares de FK e seis DMLs diretos entre tenants. A geração oficial de tipos42 revelou29 erros por FKs redundantes; a correção append-only0024 foi aplicada em13:29:30.366847 UTC e conferida em13:30:19.277589 UTC, preservando nomes históricos, ações de exclusão e integridade composta. A0023 permanece intacta. Tipos43 e análise global de tipos passaram sem modificar as consultas históricas.

A rodada final isolada passou228 layouts e17 comportamentos de Almoxarifado, seis layouts/cinco comportamentos de anexos e oito comportamentos de arquivos PE. Consulta de política antes de editar, negação da lista durante criação e comparação por versão têm regressões específicas. Respostas tardias não repovoam o cache após remoção do contexto de acesso; quatro testes locais exercitam purge/recriação/mudança de permissão/erro, sem declarar T35 E2E. A tentativa da suíte UI completa parou numa expectativa textual antiga do novo teste; a expectativa foi corrigida e a fatia final passou. As etapas anteriores de Comercial/Catálogo/autosave e operação passaram nessa tentativa; CI completo do próximo commit ainda precisa ser observado.

O usuário confirmou validação local e registro do limite do E2E conectado. SQL/ledger/metadados aplicados não comprovam Auth/Storage HTTP ou as jornadas autenticadas no ambiente operacional. Fixtures continuam exclusivamente nos ambientes descartáveis.

Continuidade: completar Pessoas/Equipes/Competências com os comandos canônicos existentes e corrigir o tratamento de cache/erro da ficha antiga; leitor privado PE por página, inicialmente no limite real20MiB; depois OS/horas/RDO com FKs explícitas na Agenda/estoque/anexos. Compra independente, demais módulos e Agenda consolidada continuam no escopo. Propostas técnicas preparatórias não são implementação. Ainda não há PDF/OCR/IA/geometria entregue no PE.

## Checkpoint 41 — Estudos Técnicos

Último checkpoint publicado antes desta rodada: `b5a4bc4044cbbaa37c36d0f951382e77a7c26df1` (Levantamentos). Seus três checks remotos passaram; evidência em `evidencias/ci-40.json`. A branch continua em desenvolvimento e a PR13 permanece draft.

Migração 0022 aplicada em 22/10/2026 às 12:12:30.11955 UTC e conferida às 12:13:17.36794 UTC: ledger 41, schema/RLS/grants/Storage compatíveis com o testado. Fonte congelada SHA-256 `0ea1a9597eebb66f835a3d017c00d3697bff3a314522366889ffdd689d7e004b`; correções SQL posteriores usarão 0023+. Nenhuma fixture operacional foi criada.

Estudos têm métodos publicados, conteúdo versionado, perigos/medidas, arquivos privados, submissões e decisões profissionais. Ações canônicas recebem instrução liberada e URL exata. Novas versões PE congelam IDs de contexto; PE/documentos antigos sem IDs verificáveis não são reatribuídos pelo estado atual dos pais. Originais e hashes permanecem intactos. Fonte revogada oculta editores; erro de rede preserva o texto.

Passaram: 56 cenários SQL, 32 de arquivos e 12 concorrentes reais, instalação limpa/upgrade 40→41 e regressões de banco; 22 testes de estudo e 15 de arquivos; 61 layouts/seis larguras e 12 comportamentos UI; três cenários de URL/revalidação/conflito de ação; DTOs reais PostgreSQL 5/5. Typecheck global e build passaram após geração oficial de 95 tabelas/131 funções/quatro enums. Operacional 49 + manifesto 9 + tipos 3 + contratos 134 passaram. A regressão UI completa encerrou exit 0, com relatórios em `evidencias/ui-41/`: catálogo/propostas/autosave, shell, acervo PE, Clientes, Levantamentos, Estudos e ação vinculada. Após o refinamento do título de evidências, a suíte delimitada de Estudos também passou novamente; relatórios em `evidencias/ui-41-final/`.

E2E Auth/Storage HTTP conectado continua não comprovado conforme decisão do usuário. Emissão documental/PDF, ativos/OS, rastreio de origem em dimensionamentos e desempenho com carga representativa continuam pendentes desta jornada; o menu Engenharia não é declarado integralmente concluído. Próximas frentes independentes em preparação: Almoxarifado/Ferramentas e leitor privado por página do acervo PE, com seus contratos reais antes da expansão de interface.

Data: 22/10/2026 (America/Sao_Paulo). Branch de trabalho: `codex/nexus-operacao-integrada-agenda-equipe`. Base: `820c79d60055a25e2d56bf60a091f032c5e7a8bf`. Trabalho em andamento; este checkpoint não declara a plataforma operacional completa.

## Contrato preservado

Comercial e Produtos: preservação e integrações indispensáveis. Cenas, modelos, assets e controles 3D: protegidos. Projetos de Engenharia: domínio independente. Agenda: fundação temporal primeiro; experiência consolidada por último. Complemento de qualidade de produto incorporado à mesma entrega.

`docs/casos-comerciais/` era não rastreado antes da execução e permanece fora dos commits desta tarefa. Não houve reset, force push, merge ou publicação do frontend.

## Diagnóstico executado

- HEAD local, `origin/main` e projeto Lovable `91380c2d-559c-4527-b3a4-1a8bc1e19f69` coincidem na base acima.
- Projeto conectado tem PostgreSQL/Supabase habilitado, 18 migrações Supabase e 12 Drizzle. Não possuía buckets privados ou extensões `pg_cron`/`pg_net` instaladas. As extensões estão disponíveis no catálogo; disponibilidade não significa scheduler configurado.
- Fingerprints de relações, constraints, índices, políticas e triggers locais/remotos correspondem. Diferença em `diferencas_comerciais` é indentação; grants padrão do Supabase são mais amplos que os do bootstrap local. Evidências de catálogo não contêm registros operacionais.
- Arquivos anexados foram lidos. O PDF da escada está disponível; Telhado Dyno e `out_all.pdf` não foram encontrados nos caminhos pesquisados. Não foram declaradas análises desses PDFs ausentes.

## Implementação em validação

| Entrega                       | Implementação                                                                                     | Evidência / limite                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventário e recorte          | 24 menus e contratos mapeados                                                                     | `inventario.md`, `escopo.md`                                                                                                                                             |
| Migrações                     | Manifesto único, SHA256 com EOL normalizado, ledger privado e transação                           | Instalação limpa, upgrade, retry, rollback e checksum divergente testados localmente                                                                                     |
| Acesso                        | Navegação nega papel ausente/desconhecido; membership exigida no SQL; custos usam matriz          | Testes TS/SQL; limpeza de cache em mudança/revogação                                                                                                                     |
| Pessoas/equipes/qualificações | Fonte canônica, FKs de tenant, vigências, comandos e histórico                                    | Testes SQL e concorrência; UI de competências/equipes ainda pendente                                                                                                     |
| Ações                         | Responsável, prazo, execução, evidência e verificação independente                                | UI/SQL em validação; ocorrências/investigação ainda pendentes                                                                                                            |
| Anexos                        | Staging privado, confirmação de binário pelo servidor e retomada                                  | Storage real/E2E conectado ainda não exercitados; credencial de serviço ausente no ambiente local; correção append-only de revalidação privilegiada encaminhada ao banco |
| Clientes                      | Lista/ficha/formulários, edição, arquivo/reativação e conflitos                                   | 28 assertions SQL locais; backend conectado/E2E de usuário ainda exige evidência própria                                                                                 |
| Projetos de Engenharia        | Acervo nativo, versões, revisão editorial, comparação, cenários, originais privados e export JSON | SQL19 + arquivos19 passaram em PostgreSQL descartável; IA/OCR, templates geométricos, 3D próprio e PDF permanecem pendentes                                              |
| Shell e biblioteca            | Busca, grupos recolhíveis, fronteiras de rota e cards de acesso                                   | CUA/fixtures; 134 arquivos protegidos sem alteração                                                                                                                      |
| Agenda                        | Fundação SQL de eventos/ações, participantes, reservas de pessoas, impedimentos e notificações    | 38 assertions temporais locais; interface final, recorrência e integração com domínios ainda ausentes permanecem pendentes                                               |
| Administração                 | Vínculo de conta existente, papéis, coordenação e desligamento com último admin protegido         | 16 assertions SQL locais; convite externo por e-mail não configurado                                                                                                     |

## Baseline

Ambiente local Windows, Node 24.15.0. Bun 1.4.3 executado do pacote oficial em cache; `bun install --frozen-lockfile` concluiu sem mudar lockfile. Nenhuma atualização em massa de dependências foi solicitada.

- `npm run typecheck`: passou antes das alterações.
- `npm run build`: passou antes das alterações.
- `npm run test:orcamento`: 58 + 5 testes passaram antes das alterações.
- `npm run lint`: falha preexistente, 34.043 erros e 17 avisos, majoritariamente formatação CRLF. Não houve reformatação geral para ocultar esse resultado.
- `npm run test:ui:contracts`: falha preexistente no comparador ligado à base antiga `e4dea2a`, com AST de declaração sem inicializador. O contrato específico desta evolução protege a base correta e não substitui a evidência dessa falha.
- Laboratório UI inicialmente branco por ausência de `previaOrdens`/`revisarRascunhoOp` no adaptador de teste. Adaptador corrigido; testes completos serão repetidos após estabilização dos arquivos compartilhados.
- Banco histórico: suíte existente passou em PostgreSQL 16.15 descartável, incluindo RLS, imutabilidade e concorrência. Nenhuma fixture foi inserida no banco conectado.

## Revisão final deste checkpoint

- `0012`–`0020` foram aplicadas no projeto Lovable confirmado, com 39 entradas no ledger e bucket privado de 20 MiB. `0020` foi confirmada às 09:23:13 UTC com checksum idêntico ao testado. `pg_cron` ativo e disparo do worker com fila vazia foram observados. Esta verificação de schema/scheduler não comprova upload HTTP, RLS remoto com usuários distintos ou E2E das jornadas.
- A rodada local registrada em `evidencias/banco-local-final.json` encerrou exit0: instalação limpa, upgrade, retry/rollback/checksum, PE19 e arquivos19, além das suítes de fundação/clientes/agenda/administração e concorrência. Fixtures permaneceram nos bancos descartáveis.
- Revisão somente leitura de PE/arquivos confirmou encadeamento de hash, pais autorizados, snapshots imutáveis, promoção de cenário e locks coerentes. Nova tentativa do mesmo arquivo após cancelar o pendente recebeu correção localizada da chave de intenção; recibos e originais confirmados não são alterados.
- Revisão encontrou janelas de revalidação na confirmação privilegiada dos anexos operacionais de `0015` e no retry já vinculado dos arquivos PE de `0017` após espera de lock. A correção `0020` acrescenta locks de autorização e conferência de papel/escopo antes de confirmar ou retornar retry nos dois fluxos. A revisão estática não identificou ampliação de acesso. A rodada local full39, porta 55450, encerrou exit0 com 12 assertions novas e cinco disputas reais de autorização, incluindo PE pendente e já vinculado; PE19/arquivos19 e regressões também passaram. A aplicação compartilhada permanece registrada separadamente em `migracoes.md`; esta prova SQL local não substitui Auth/Storage HTTP remoto.
- Testes focados de navegação/capacidades/cache/permissões/PE passaram 39/39; eslint escopado e typecheck global passaram nesta rodada. Os demais gates e capturas finais têm resultados próprios, sem substituir backend real por fixture.
- Na auditoria inicial, `SUPABASE_URL` estava no `.env`, sem exportação no processo inspecionado, e a credencial privilegiada estava ausente. Posteriormente os tipos foram regenerados pelo processo oficial sobre catálogo local descartável, até o manifesto43; não houve edição manual do gerado nem uso de credencial operacional nessa geração. Isso não resolve ou comprova a confirmação binária no runtime conectado. Nenhum segredo foi copiado aos relatórios.
- O acervo nativo foi refinado para priorizar o editor no celular, preservação de conteúdo em conflito/falha e feedback junto ao botão Salvar. As capturas do laboratório usam dados isolados; não provam persistência nem dispositivo móvel físico.

## Decisão de validação — 22/10/2026

O usuário orientou: “Validar localmente e registrar o limite do E2E conectado”. A implementação continua com fixtures exclusivamente isoladas e PostgreSQL descartável. Não há autorização para cadastrar demonstrações no banco operacional. Auth/Storage HTTP e jornadas autenticadas no projeto conectado permanecem não comprovados, com evidência local discriminada por método em `validacao.md`.

Jornada seguinte implementada: Levantamentos Técnicos, com coleta, revisão e adoção explícita no dimensionamento. Evidências locais e limites em `levantamentos-tecnicos/validacao.md`. A PR permanece draft enquanto o escopo funcional indispensável estiver incompleto.

## Próximos requisitos

Reconciliação posterior: uma consulta em `plan_mode` ao Lovable, solicitada sem edição, gerou automaticamente commits `a2d0a91`/`d0de471`/`7fbf58f` em `main`. O diff foi conferido: pacote de configuração `2.25.2→2.26.5`, lockfile, arquivo gerado de armazenamento de autenticação do preview e `.lovable/plan.md`. A base foi incorporada à **branch da PR** por merge `5cb9de2`, preservando o histórico; não houve merge da PR em `main`, deploy ou aprovação da execução do plano. Instalação frozen, typecheck, build e 49+9 testes foram repetidos e passaram; revisão independente/smoke de nove casos do broker está em `evidencias/preview-auth-smoke.json`. Broker real e runtime publicado continuam sem E2E.

Na rodada CI seguinte, as suites PostgreSQL passaram. O `verify` encontrou 17 erros de formatação preexistentes em `mapeamento.ts` e `hooks.ts`; foram formatados somente esses arquivos, com ASTs sem diferença e orçamento59+5 revalidado (`evidencias/formatacao-ci.json`). A circulação 3D chegou até a reentrada pública, mas não encontrou mais o link da Escada em uma navegação sem papel. O acesso explícito à Escada foi acrescentado à biblioteca pública, preservando menus de negócio fechados e cenas intactas. A suíte operacional de 36 layouts/nove comportamentos passou novamente após o ajuste.

PR draft aberta: [#13 — Estrutura a operação técnica, o acervo de engenharia e a qualidade da Nexus](https://github.com/leomateus620-pixel/nexus-unified-platform/pull/13), base `main`, evidências no commit `c18723b`. Nenhum merge ou deploy executado. Na primeira rodada CI, `verify` passou types/domínios e chegou ao banco, mas parou na proteção do teste concorrente porque o runner POSIX não exportava `PGTEST_EPHEMERAL` aos novos filhos. A correção exporta o marcador somente após criar o cluster descartável; a proteção permanece. Resultado remoto final deve ser conferido no HEAD atual da PR.

Código consolidado nos commits `6b4c951` (fundação, domínios, migrações e autorização) e `05f69c9` (frame, biblioteca e qualidade UI). Typecheck final passou; 49 testes operacionais + nove de manifesto + 134 arquivos protegidos passaram; orçamento 59+5, silo69 e build passaram. Lint delimitado de 63 arquivos: zero erros/um aviso. A suíte UI completa encerrou exit0 com capturas desktop/mobile, 32 vistas comerciais, 16 cenários de autosave e 36 layouts operacionais. Evidências e limites estão em `validacao.md`; CI remoto será registrado separadamente após abrir a PR.

Consolidar gates e PR revisável. A regeneração de tipos foi resolvida no checkpoint 40 pelo processo oficial local descrito abaixo. O E2E autenticado conectado não será exigido nesta rodada conforme decisão do usuário, e permanece não comprovado. Levantamentos possui fluxo local de coleta/revisão/adoção; Agenda vinculada, PDF/offline/limpeza de órfãos seguem pendentes. Continuam pendentes as jornadas de estudos técnicos, OS/RDO, estoque/ferramentas, ativos, inspeções/ocorrências, manutenção, logística, financeiro operacional e Agenda completa. No menu Projetos de Engenharia faltam OCR/IA/leitura por página e imagem, sugestões com evidência, PDF/dossiê emitido, editor geométrico/paramétrico e 3D próprio. Não considerar os menus finalizados por existirem tabelas ou telas iniciais; esta branch representa um checkpoint parcial do escopo integral.

## Checkpoint 40 — Levantamentos Técnicos

Migração0021 aplicada e schema verificado em 22/10/2026 às 11:19:38.549955 UTC; ledger40 e fonte imutável a partir da aplicação. Código novo em `src/features/levantamentos`; navegação Campo/coordenação explícita, escopo de leitura/coleta pelo responsável e aprovação profissional separada do papel admin. Não houve alteração de motores ou cenas.

Passaram typecheck/build, 49 testes operacionais, nove do manifesto, 134 arquivos protegidos e vinte testes de Levantamentos (17 core/handler + três de intenção). No PostgreSQL descartável passaram 47 cenários SQL, 28 de arquivos e 12 concorrências. A regressão UI completa encerrou exit 0: 11 telas em oito larguras, 32 vistas comerciais, 16 cenários de autosave, 36 layouts operacionais e 30 de Levantamentos com dez verificações de comportamento. Evidências desta execução em `evidencias/ui-40/`. SQL local, UI isolada e metadados conectados são provas distintas.

Próxima jornada: estudos técnicos em Engenharia, preservando o acervo editorial PE e as regras/motores existentes. A evolução integral permanece incompleta e a PR draft13 continua revisável; nenhuma publicação de frontend/merge foi executada.

Tipos Supabase regenerados pelo pacote oficial a partir do catálogo local do manifesto 40, estruturalmente conciliado com o conectado. O processo só exporta `public`, não usa credenciais operacionais e formata a saída automaticamente com prova de AST equivalente. Três testes protegem o executor/ambiente/formatação. A tipagem revelou o embed ambíguo de unidades/contatos na criação de proposta; hints explícitos preservam os aliases e usam as FKs de tenant. Patch de JSON recebeu somente correção de tipo NOT NULL. Typecheck, lint delimitado e orçamento 59+5 passaram; build posterior também encerrou exit 0. Processo, hashes e limites em `geracao-tipos.md`.
