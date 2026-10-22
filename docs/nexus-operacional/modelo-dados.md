# Modelo de dados do checkpoint operacional

## Controle físico — migrações 0023/0024, checkpoint 43

Treze tabelas: `almoxarifados`, `estoque_produto_politicas`, `estoque_inventarios`, `estoque_conferencias`, `estoque_reservas`, `estoque_reserva_itens`, `estoque_operacoes`, `estoque_movimentos`, `estoque_estorno_alocacoes`, `ferramentas`, `ferramenta_custodias`, `ferramenta_calibracoes` e `ferramenta_calibracao_politicas`. Todas têm organização e FKs compostas. As duas migrações foram aplicadas ao projeto confirmado e verificadas por metadados; o E2E conectado de Auth/Storage não foi executado.

A0024 mantém uma única FK em nove relações existentes de suprimentos, com nomes históricos e ações de exclusão preservadas. As colunas de organização/revisão continuam obrigatórias na integridade composta; foram removidas somente representações redundantes das mesmas relações. Isso permite os embeds existentes do PostgREST sem modificar as consultas antigas.

Conferência possui exatamente uma origem: recebimento, apontamento de produção ou inventário aprovado. Registra unidade/fator de origem e classificações em unidade canônica. Movimento imutável pertence a operação e conferência, com produto, posição, local/reserva/pessoa conforme a natureza. Transferência e estorno mantêm proveniência; saldo não é coluna editável. Reservas alocam quantidades por conferência para projeto ou OP, com pessoa, validade e versão. Não há saldo presumido de aquisição.

Cadastros/reservas têm concorrência e auditoria; eventos, classificações e políticas publicadas preservam histórico. Eventos usam `numeric(18,6)`; comandos respeitam essa precisão, sem arredondamento de conversão. Saldos agregados são texto decimal e podem exceder um evento. Dinheiro não pertence às projeções deste domínio. Índices atendem produto/local/proveniência, reserva, responsável/estado/prazo e custódia. O lock conservador do estoque por organização serializa comandos; desempenho com carga representativa ainda precisa de medição.

Custódia guarda pessoa, intervalo semiaberto, timezone IANA e estado; devolução registra condição sem apagar retirada. Calibração guarda política, emissor, execução/validade civil, certificado e conferência. Cobertura usa o fuso preservado da custódia. Evento opcional exige origem autorizada, participante, janela contida e fuso coerente; reagendamento conjunto pertence à entrega posterior da Agenda.

`anexos` recebe pais FK de ferramenta/calibração; XOR entre cinco pais. Ler difere de enviar e o vínculo atual é revalidado. Requests legados mantêm ausentes os novos campos opcionais, preservando seus hashes idempotentes.

Descrição do schema aditivo `0012`–`0024`, após as 30 migrações históricas. SQL e manifesto são a fonte executável; este dicionário registra decisões e limites. Status de aplicação por ambiente fica em `migracoes.md`.

## Estudos técnicos — migração 0022

As 13 tabelas são `est_metodos`, `est_metodo_versoes`, `estudos_tecnicos`, `estudo_revisoes`, `estudo_perigos`, `estudo_medida_linhagens`, `estudo_medidas`, `estudo_fontes`, `estudo_arquivos`, `estudo_submissoes`, `estudo_decisoes`, `estudo_substituicoes` e `estudo_eventos`. Todas possuem organização e vínculos compostos. Métodos/fontes/requisitos são versionados; raízes têm código gerado no servidor e concorrência. Conteúdo e medidas pertencem à revisão, sem cadastro paralelo de pessoa ou ação.

Submissões, decisões e substituições são eventos preservados; revisão aprovada não é atualizada para indicar substituição. Fontes têm FKs explícitas e guardam versão/hash, sem copiar o conteúdo privado de PE ou snapshots financeiros. Linha de medida liga uma única ação canônica entre revisões. Arquivos pertencem à revisão e, opcionalmente, a um perigo; staging/confirmar/cancelar incrementam a revisão, sem recontar retries.

Os índices atendem organização, atualização da lista, responsável, estado/revisor, pai e origens únicas. Documentos e PE sem IDs congelados verificáveis não são atribuídos retroativamente pelo contexto mutável de seus pais. Novas congelações PE incluem IDs, preservando hashes anteriores. Detalhes e evidências em `engenharia-estudos.md`, `arquivos-estudos.md` e `engenharia/banco-validacao.md`.

## Fontes canônicas preservadas

Organização proprietária continua em `organizations`; acesso em Auth, `memberships` e `user_roles`; cliente/local/contato em `clientes`, `unidades` e `contatos`. Produtos, códigos, estrutura e custos continuam no catálogo existente. `sistema_componentes` continua fonte das quantidades dimensionadas. Propostas, revisões, geração de OC/OP e `documentos` emitidos conservam seus contratos.

Projetos comerciais existentes continuam em `projetos`. O novo acervo `pe_projetos` é independente: sua versão editorial não substitui revisão comercial, documento emitido, ativo instalado ou projeto operacional. Não foram criadas tabelas paralelas para pessoa, cliente, produto ou tarefa da Agenda.

## Pessoas e ações — migração 0012

| Entidade                 | Campos e cardinalidade principais                                                                             | Integridade / consulta                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_capacidades`       | Organização + usuário + capacidade; autoria e criação                                                         | PK composta e FK para membership; valor atual permitido `coordenar_operacao`; remoção do vínculo remove capacidade                           |
| `pessoas`                | Nome, vínculo profissional, função, contatos profissionais, registro profissional, situação, usuário opcional | Uma pessoa pode existir sem login; login único por organização, FK para membership da mesma organização; índice organização/situação/nome/id |
| `equipes`                | Nome, líder opcional, situação e versão                                                                       | Nome único na organização, líder por FK composta                                                                                             |
| `equipe_membros`         | Equipe, pessoa, início/fim em `date`                                                                          | Múltiplos vínculos temporais; comando impede sobreposição da mesma pessoa/equipe; fim não precede início                                     |
| `competencias`           | Nome, descrição, exigência de evidência/validade, situação                                                    | Nome único por organização; não contém periodicidade legal presumida                                                                         |
| `pessoa_qualificacoes`   | Pessoa, competência, emissor, conclusão, validade opcional, estado, conferente                                | FKs compostas; validade não anterior à conclusão; índice pessoa/estado/validade                                                              |
| `indisponibilidades`     | Pessoa, início/fim em `timestamptz`, motivo operacional                                                       | Fim posterior ao início; compartilhada com reservas da Agenda                                                                                |
| `acoes_operacionais`     | Título, descrição, responsável principal, prazo `date`, prioridade, estado, conclusão, verificador            | Responsável por FK composta; índices organização/estado/prazo e responsável/estado; revisão independente quando exigida                      |
| `acao_colaboradores`     | Ação + pessoa                                                                                                 | PK organização/ação/pessoa e FKs explícitas                                                                                                  |
| `operacao_historico`     | Entidade, ID, operação, versão, estados, motivo, autor, instante                                              | Evento servidor; índice organização/entidade/ID/ordem; sem edição pela aplicação                                                             |
| `operacoes_idempotentes` | Organização, autor, chave UUID, comando, hash do pedido, resultado                                            | PK organização/autor/chave; lock transacional e rejeição de mesma chave com payload/comando diferente; sem leitura pela aplicação            |
| `anexos`                 | Exatamente um pai pessoa/ação/qualificação; nome, MIME, tamanho, SHA-256, caminho, estado, autor              | FKs compostas, caminho único, 1–20 MiB, hash hexadecimal de 64 caracteres; índices por pai e estado                                          |

Pessoas, equipes, competências, qualificações e ações têm identidade, autoria e criação imutáveis; updates incrementam `version` e registram histórico. Comandos editáveis recebem `expected_version`. Vencimento de qualificação é avaliado pelas datas e estado de conferência; não se reescreve o estado histórico diariamente.

## Clientes — migração 0013

As três tabelas originais recebem `version`, autoria/alteração e dados de arquivamento compatíveis. Autoria de criação anterior desconhecida permanece nula; não é atribuída ao executor da migração.

| Entidade            | Acréscimos                                                                                                    | Invariantes                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientes`          | Nome de exibição, observações, identificador normalizado derivado do campo histórico `cnpj`, versão e arquivo | Mantém representação informada; normalização alfanumérica para comparação, sem certificar validade fiscal; concorrência de novo identificador controlada por lock |
| `unidades`          | Versão, autoria/alteração e arquivo                                                                           | FK organização/cliente; índice/chave composta inclui cliente para validar contatos e futuras origens                                                              |
| `contatos`          | Unidade opcional, versão, autoria/alteração e arquivo                                                         | Unidade precisa pertencer ao mesmo cliente e organização                                                                                                          |
| `cliente_historico` | Cliente, unidade/contato opcionais, operação, versão, snapshots antes/depois, autor, instante                 | FKs explícitas; snapshot serve auditoria do cadastro, não copia histórico operacional de outros domínios                                                          |

Cadastros usados são arquivados e reativáveis, sem DELETE. Arquivamento do cliente impede novas seleções ordinárias de seus filhos. Registros anteriores e propostas históricas permanecem íntegros. Duplicidades antigas não são fundidas nem apagadas na migração: comandos impedem criação, alteração ou reativação que introduza nova colisão; saneamento anterior continua uma decisão explícita. Trigger em propostas impede nova referência arquivada sem bloquear atualizações não relacionadas de registros antigos.

## Acervo de engenharia — migrações 0014 e 0017

| Entidade      | Papel e vínculos                                                                                          | Histórico                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pe_projetos` | Cliente, unidade opcional/local descritivo, título, finalidade, responsável, visibilidade, versão vigente | Mestre editável com versão; arquivo/reativação preservam o acervo                                                |
| `pe_versoes`  | Projeto, número sequencial, modelo nativo JSON validado, estado, snapshot e SHA-256                       | `rascunho → em_revisao → congelada`; versão congelada imutável; nova edição abre outra versão                    |
| `pe_cenarios` | Projeto, versão congelada de origem, modelo variante e diferença                                          | Isolado da fonte; promoção cria rascunho de versão, sem alterar versão anterior                                  |
| `pe_eventos`  | Projeto, versão/cenário conforme operação, autor, motivo e instante                                       | Linha do tempo produzida no banco                                                                                |
| `pe_arquivos` | Projeto e versão por FKs, original privado, MIME/tamanho/SHA-256/estado/autor                             | Confirmação exige bytes verificados; arquivo confirmado não é sobrescrito; manifesto entra no snapshot congelado |

O modelo nativo atual é **documental**, `schema_version=1`: seções com IDs estáveis, texto e parâmetros com valor textual, unidade, natureza, validação e fonte. Há limites de quantidade/tamanho validados no banco. Não é um modelo geométrico/CAD nem um novo motor de dimensionamento. O limite efetivo de envio é 20 MiB, nos comandos e bucket. Congelamento é revisão editorial interna, sem alegar aprovação técnica, ART, conformidade ou emissão de PDF.

Numeração, criação de nova versão, promoção de cenário e congelamento tomam lock do projeto. O snapshot inclui contexto do cliente/local, modelo e manifesto de arquivos confirmados. Alteração posterior do cadastro não muda versões congeladas. Pendência de upload impede submissão/congelamento. Índices priorizam listagem por organização, cliente, situação e relações projeto/versão.

## Agenda e processamento interno — migrações 0016 e 0018

| Entidade                  | Contrato implementado                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agenda_eventos`          | Tipo, período, timezone IANA, datas exclusivas de dia inteiro, responsável, estado, versão; independente ou FK para ação com chave estável de visita/ocorrência |
| `agenda_participantes`    | Pessoa real; função responsável/participante/observador, confirmação separada, vigência e retirada; um responsável ativo por evento                             |
| `agenda_requisitos`       | Competências exigidas por FK; publicação/início avaliam qualificação durante o período                                                                          |
| `agenda_reservas_pessoas` | Evento, versão, participante e pessoa por FKs compostas; intervalo `[início,fim)` e liberação sem apagar histórico                                              |
| `agenda_evento_revisoes`  | Snapshot imutável por evento/versão, com autor e instante                                                                                                       |
| `outbox_eventos`          | ID do evento, versão, tipo, estado, tentativas, disponibilidade e SQLSTATE; unicidade por evento/versão/efeito                                                  |
| `notificacoes`            | Destinatário, evento, versão, tipo e leitura; chave única de efeito e RLS pela origem atual                                                                     |
| `job_execucoes`           | Execução do job interno, estado, contagens e SQLSTATE; acesso restrito, sem payload operacional                                                                 |
| `scheduler_configuracao`  | Estado de capacidade/configuração do scheduler e verificação, sem simular execução quando indisponível                                                          |

Locks ordenados por pessoa serializam confirmação, reagendamento e indisponibilidade; a consulta de conflito não depende do navegador. Observador não reserva trabalho. Reunião pode não bloquear recursos. Índices atendem período visível, responsável, pessoa e outbox pendente. O processamento de notificações internas usa transação, locks de linha e deduplicação. `pg_cron`, quando disponível, executa a rotina do banco; ausência fica explícita.

Esta fundação não contém recorrência, reserva de veículo/ferramenta, OS, inspeção ou manutenção. Não há tabelas fictícias para representar esses domínios ausentes. O menu Agenda Equipe ainda não está entregue neste checkpoint.

## Histórico, retenção e correção

Tabelas editáveis usam versão; eventos oficiais e versões congeladas são preservados. Novas relações centrais carregam organização em FKs; identidade e organização não podem ser trocadas por edição. Cadastros são desativados/arquivados. Comandos corrigem estado com motivo, sem apagar autoria.

Não foi definida uma política universal de retenção, descarte legal ou limpeza automática de uploads órfãos. Cancelamento preserva metadados; não significa remoção imediata do binário. Essa rotina permanece pendente e deve considerar uploads em andamento e arquivos presentes em versões congeladas. Nenhuma migração insere dados de demonstração. Não há novas tabelas de dinheiro, estoque ou horas neste checkpoint; fórmulas e precisão financeiras existentes permanecem em seus motores canônicos.

A `0020` não cria outra identidade ou tabela de anexos. Endurece a confirmação existente de anexos operacionais e originais PE: locks estabilizam acesso/atribuição/estado do pai até o commit; o autor é reautorizado pelo predicado vigente antes de confirmar ou retornar retry. Isso preserva o modelo e evita que uma verificação anterior do handler sobreviva indevidamente à revogação durante o envio.

## Levantamentos — checkpoint 40

As nove tabelas de coleta/modelos/revisões/pontos/medidas/avaliações/arquivos/adoções foram acrescentadas por `0021`. Dicionário, precisão, FKs, índices e histórico estão em [levantamentos-tecnicos/arquitetura.md](levantamentos-tecnicos/arquitetura.md). Numeric da coleta é `numeric(18,6)`; DTO decimal é texto. Snapshots aprovados, modelos publicados, avaliações e adoções são imutáveis; contexto histórico é lido do snapshot.

Mudança concorrente não é resolvida por último salvamento: versões de raiz/revisão/filho e hash de adoção são conferidos. Excluir ponto exige versões do ponto e da revisão. O código LEV usa série do servidor sem alterar os procedimentos existentes de produtos/OC/OP. Não há cadastro duplicado de cliente/pessoa/sistema.
