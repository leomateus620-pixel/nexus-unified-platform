# Contratos compartilhados do checkpoint

Estado local em 22/10/2026. Este registro descreve objetos reais; nomes propostos no escopo sem implementação não são tabelas disponíveis. Migrações aplicadas/checksums e evidências executadas ficam em `migracoes.md`, manifesto e `validacao.md`.

## Propriedade das identidades

| Conceito                     | Fonte / proprietário                                       | Contrato de integração                                                                                             |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Organização e usuário        | `organizations`, Auth, `memberships`, `user_roles`; acesso | Toda operação recebe contexto de organização e revalida membership do ator autenticado                             |
| Pessoa                       | `pessoas`; operação                                        | Login opcional, único por organização; demais módulos referenciam pessoa, nunca criam colaborador paralelo         |
| Cliente/local/contato        | `clientes`, `unidades`, `contatos`; clientes               | Unidade pertence ao cliente; contato pode ter unidade do mesmo cliente; novas referências recusam arquivo          |
| Produto/sistema dimensionado | Catálogo e motores existentes                              | Nenhuma réplica de produto ou fórmula; ainda não existe ativo físico instalado                                     |
| Ação atribuível              | `acoes_operacionais`; operação                             | Um responsável principal; Agenda referencia a ação, sem copiar tarefa/estado                                       |
| Acervo de engenharia         | `pe_projetos` e `pe_versoes`; engenharia documental        | Independente de `projetos` operacionais e revisões comerciais; não altera cenas existentes                         |
| Arquivo                      | `anexos` ou `pe_arquivos`, conforme pai                    | Metadado com FK explícita, SHA-256 e binário privado; pai determina acesso                                         |
| Evento temporal              | `agenda_eventos`; agenda                                   | Independente ou FK de ação + chave de ocorrência; várias visitas possíveis; execução pertence ao domínio de origem |

## Comandos e consultas disponíveis

As funções de servidor usam middleware autenticado, schemas Zod e Supabase com token do usuário. SQL produz autoria, verifica capacidades e vínculos. Entradas não podem escolher autor oficial. Nas escritas versionadas, `id` nulo cria; `expected_version` acompanha alterações. Chave UUID idempotente identifica a intenção; repetir chave com dados diferentes produz conflito.

| Domínio               | RPCs de escrita                                                                                                                               | Consultas / consumidor                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pessoas               | `salvar_pessoa`                                                                                                                               | `listarPessoas`, `obterPessoa`; tela Pessoas e seletor autorizado de responsável                                                                                         |
| Equipes/qualificações | `salvar_equipe`, `vincular_membro_equipe`, `encerrar_membro_equipe`, `salvar_competencia`, `salvar_qualificacao`, `transicionar_qualificacao` | RLS das entidades; UI completa ainda pendente; requisitos usados na fundação da Agenda                                                                                   |
| Ações                 | `salvar_acao_operacional`, `transicionar_acao_operacional`                                                                                    | `listarAcoes`, `obterAcao`; fila por responsável e origem temporal                                                                                                       |
| Clientes              | `salvar_cliente_operacional`, `salvar_unidade_operacional`, `salvar_contato_operacional`, `arquivar_cadastro_cliente`                         | `listar_cadastros_cliente`, `obter_cliente_operacional`, `obter_cadastro_cliente`; lista/ficha/formulários                                                               |
| Anexos                | `preparar_anexo_operacional`, `confirmar_anexo_operacional`                                                                                   | Server functions de preparo, retomada, confirmação, listagem e download; confirmação privilegiada só após verificar binário; cancelamento de pendência ainda sem comando |
| Engenharia documental | `pe_executar` com comando discriminado                                                                                                        | Server functions do domínio; listagem, ficha, conteúdo autorizado e export JSON                                                                                          |
| Arquivos PE           | `pe_preparar_arquivo`, `pe_confirmar_arquivo`, `pe_cancelar_arquivo`                                                                          | `listarArquivosPe`, `prepararArquivoPe`, `retomarArquivoPe`, `confirmarArquivoPe`, `baixarArquivoPe`                                                                     |
| Agenda                | `salvar_evento_agenda`, `transicionar_evento_agenda`, `confirmar_participacao_agenda`, `registrar_indisponibilidade`                          | `listar_eventos_agenda`; backend sem tela final                                                                                                                          |
| Notificações          | `processar_notificacoes_agenda`, `marcar_notificacao_lida`                                                                                    | Destinatário autorizado; processamento não acessível a sessões de aplicação                                                                                              |
| Administração         | `administrar_vinculo_operacional`                                                                                                             | `listarVinculos` paginado/admin; vínculo existente, papel, coordenação e desligamento                                                                                    |
| Jobs                  | `executar_job_agenda_notificacoes`                                                                                                            | `consultar_jobs_operacionais`; execução pelo proprietário/scheduler, sem grants à aplicação                                                                              |

`pe_executar` aceita criar/salvar/submeter/devolver/congelar/nova_versao/vigente/arquivar/reativar/criar_cenario/salvar_cenario/promover_cenario/descartar_cenario. Cada comando valida seus estados e versões; não há UPDATE livre do modelo. O retorno idempotente é autorizado antes de consultar o recibo, e comandos de arquivo relêem estado atual antes de emitir novo token.

Erros de autorização usam SQLSTATE `42501`; regras usam `23514`, colisões/mesma chave com outro payload usam `23505`, e conflito de versão é distinguido pelo comando. A interface preserva preenchimento e oferece recuperação. Mensagens não devem ser usadas como único contrato de permissão no browser.

## Cache e privacidade

| Query key                                                                                                              | Invalidação                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `['clientes', org, 'operacional', grupo, cliente, busca, situacao, pagina, limite]` e `['clientes', org, 'ficha', id]` | Escrita invalida prefixo `['clientes', org]`, preservando recorte da URL                           |
| `['pessoas', org, busca, pagina, arquivados]`                                                                          | Escrita invalida pessoas da organização; seletor usa mesmo prefixo e termo/página próprios         |
| `['acoes-operacionais', org, busca, pagina, encerradas]`                                                               | Escrita/transição invalida ações da organização                                                    |
| `['anexos', pai]`                                                                                                      | Pai inclui organização e FK explícita; confirmações/cancelamento invalidam esse pai                |
| `['operacao-acesso', org, user]`                                                                                       | Revalida em 30 segundos/foco; alteração remove pessoas, ações e anexos antes de reapresentar dados |
| `['pe', org, ...]`, `['pe-opcoes', org, tipo, termo, clienteId]` e `['pe-files', org, versaoId]`                       | Escrita invalida acervo; arquivo invalida arquivos da versão e acervo                              |
| `['membros', org, ...]` e contexto `org`                                                                               | Administração invalida vínculo/contexto; mudanças de sessão removem caches sensíveis               |

Cancelamento de requisição usa sinal do TanStack Query nos fluxos novos. `useOrg` limpa caches em logout, troca de usuário/organização, papéis e perda de contexto. Capacidade de UI não expõe custos por ausência de papel; RLS continua a proteger respostas diretas. URLs temporárias não entram em assets públicos. Não há novo canal realtime global nem feed de calendário público.

Listagens novas usam recortes finitos: clientes até 50 por página, vínculos 25; outras consultas possuem limites explícitos e busca. Algumas listas filhas de engenharia param em 100 registros e não representam paginação completa de todo o acervo; ampliar esse contrato exige paginação real, sem apresentar limite como total.

## Temporalidade e efeitos

Agenda grava `timestamptz` e timezone IANA; dia inteiro guarda datas com fim exclusivo. Reservas de pessoas usam `[início,fim)` e locks ordenados; indisponibilidade usa o mesmo namespace. Publicação/início verificam qualificação no período. Observação/presença não executa a origem.

Uma transação grava alteração, versão e outbox. Consumidor atual cria notificações internas por destinatário/evento/versão/tipo, com chave única e processamento repetível; payload leva IDs, não relato/título privado. Falha registra SQLSTATE, tentativa e próximo processamento. `pg_cron` foi configurado e seu disparo com fila vazia observado no projeto confirmado; `job_execucoes` registra resultado e `estado_scheduler_operacional` fornece resumo autorizado. Não há promessa de entrega exatamente uma vez, e-mail, WhatsApp ou lembrete temporal ainda não implementado.

## Migrações e contratos ausentes

Ordem append-only: `0012` fundação/permissões, `0013` clientes, `0014` acervo PE, `0015` Storage operacional, `0016` Agenda, `0017` arquivos PE, `0018` scheduler, `0019` administração e `0020` reautorização transacional na confirmação de arquivos. A matriz operacional vigente está em `operacao_autor_pode` da `0020`; o wrapper `operacao_pode` usa o mesmo predicado com o usuário autenticado. Testes de paridade leem essa definição vigente. Aplicar depois das 18 Supabase e 12 Drizzle históricas pelo manifesto único, sem duplicar DDL. Checksum, ledger, ambiente e estado efetivo pertencem a `migracoes.md` e `scripts/migrations/manifest.json`.

Ainda não há contrato executável de OS/horas/RDO, ativos, inspeções/achados, ocorrências, manutenção, estoque/ferramentas, frota/viagens, títulos/baixas/apropriações, recorrência ou documentação técnica/PDF. Os próximos módulos devem acrescentar FKs explícitas e testes de integração com essas identidades, sem transformar um campo `tipo + id` em substituto de integridade. A aprovação técnica exige desenvolvimento próprio; a revisão editorial do acervo não a supre.
