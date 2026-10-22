# Checkpoint de execução

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
- `SUPABASE_URL` está no `.env`, sem exportação no processo inspecionado; `SUPABASE_SERVICE_ROLE_KEY` está ausente em ambos. Não foi executada regeneração de `src/integrations/supabase/types.ts`; o arquivo gerado não foi modificado manualmente. As capacidades expostas do conector não incluem geração de tipos; essa etapa segue pendente pelo mecanismo do projeto. Nenhum segredo foi copiado aos relatórios.
- O acervo nativo foi refinado para priorizar o editor no celular, preservação de conteúdo em conflito/falha e feedback junto ao botão Salvar. As capturas do laboratório usam dados isolados; não provam persistência nem dispositivo móvel físico.

## Próximos requisitos

PR draft aberta: [#13 — Estrutura a operação técnica, o acervo de engenharia e a qualidade da Nexus](https://github.com/leomateus620-pixel/nexus-unified-platform/pull/13), base `main`, evidências no commit `c18723b`. Nenhum merge ou deploy executado. Na primeira rodada CI, `verify` passou types/domínios e chegou ao banco, mas parou na proteção do teste concorrente porque o runner POSIX não exportava `PGTEST_EPHEMERAL` aos novos filhos. A correção exporta o marcador somente após criar o cluster descartável; a proteção permanece. Resultado remoto final deve ser conferido no HEAD atual da PR.

Código consolidado nos commits `6b4c951` (fundação, domínios, migrações e autorização) e `05f69c9` (frame, biblioteca e qualidade UI). Typecheck final passou; 49 testes operacionais + nove de manifesto + 134 arquivos protegidos passaram; orçamento 59+5, silo69 e build passaram. Lint delimitado de 63 arquivos: zero erros/um aviso. A suíte UI completa encerrou exit0 com capturas desktop/mobile, 32 vistas comerciais, 16 cenários de autosave e 36 layouts operacionais. Evidências e limites estão em `validacao.md`; CI remoto será registrado separadamente após abrir a PR.

Consolidar gates e PR revisável, regenerar tipos e validar arquivos privados por E2E autenticado no ambiente disponível. Continuam pendentes as jornadas de Levantamentos, estudos técnicos, OS/RDO, estoque/ferramentas, ativos, inspeções/ocorrências, manutenção, logística, financeiro operacional e Agenda completa. No menu Projetos de Engenharia faltam OCR/IA/leitura por página e imagem, sugestões com evidência, PDF/dossiê emitido, editor geométrico/paramétrico e 3D próprio. Não considerar os menus finalizados por existirem tabelas ou telas iniciais; esta branch representa um checkpoint parcial do escopo integral.
