# Agenda Equipe

## Escopo desta entrega

`/agenda-equipe` usa pessoas e equipes de `/equipe`, ações operacionais,
levantamentos autorizados e ferramentas do almoxarifado. Um evento pode ser
independente ou agendar uma visita de ação/levantamento. Ações sem horário
permanecem na fila Pendentes. Não se cria uma segunda tarefa para agendá-las.
OS, inspeção, manutenção e viagem não são origens selecionáveis enquanto seus
fluxos próprios estiverem adiados. Os tipos de atividade não criam tais registros.

Comercial, Produtos e cenas 3D mantêm seus contratos. A navegação usa uma
disponibilidade central por rota; Execução/OS, Inspeções, Documentação e os
novos menus parciais Segurança/Projetos de Engenharia ficam desativados,
inclusive no gate de URL autenticada. Ações canônicas continuam pela Agenda.
As fontes e URLs permanecem no repositório para evolução posterior.

## Uso diário

1. Em Pessoas e Competências, cadastre a pessoa operacional. Ela pode existir
   sem login. Organize equipes com vigência e confira qualificações conforme
   a política cadastrada. Cadastro de pessoa e treinamento não concedem papel.
2. Na ficha da pessoa, registre indisponibilidades com período e motivo
   operacional. Se já houver visita confirmada, reprograme-a antes do bloqueio.
   Cancelar o bloqueio exige motivo e preserva o registro original.
3. Na Agenda, escolha Minha agenda ou Equipe e o período. Semana é a vista
   de planejamento desktop; celular usa leitura cronológica. Mês e lista
   compartilham os mesmos filtros e dados paginados.
4. Novo evento cria rascunho com título, período, fuso, responsável e pessoas.
   Equipe expande membros com vigência, sem duplicar pessoas. Observador não
   bloqueia a jornada. Contexto, requisitos e ferramentas são progressivos.
5. Nova ação aceita prazo sem horário. Agendar registro existente reutiliza a
   ação ou levantamento; Abrir origem leva ao registro autorizado.
6. Publicar valida pessoas, qualificação durante a janela, indisponibilidade e
   reservas. Iniciar revalida os requisitos atuais. Presença não conclui a tarefa.
7. Concluir evento não muda diretamente o estado da ação ou levantamento.
   A ação usa o comando canônico de execução, evidência e verificação.

## Estados e responsabilidade

Evento: rascunho → publicado → em andamento → concluído. Cancelamento exige
motivo e libera reservas futuras. Uma ferramenta retirada exige devolução
física no almoxarifado; o calendário não simula esse retorno.

Responsável, participante e observador são distintos. A confirmação de presença
é registrada por pessoa e não representa execução. Trocar participante futuro
encerra o vínculo anterior, preservando revisões e confirmações históricas.

Cada edição usa `expected_version`. Um conflito mantém o preenchimento e exige
comparação com a versão atual. A mesma chave com outro payload é rejeitada.
Falha de rede não confirma salvamento; tentar novamente reutiliza a intenção.
As consultas e arquivos revalidam a autorização atual da organização e origem.

## Tempo, recorrência e reservas

Datas civis e instantes são distintos. Eventos de dia inteiro usam início e fim
civis com fim exclusivo. O formulário resolve horários locais no PostgreSQL
usando IANA; não usa o fuso do computador como autoridade. Uma edição somente
de texto preserva o instante original, inclusive em dobra de horário de verão.

Recorrência diária, semanal ou mensal tem intervalo e término por data ou
quantidade. A expansão tem horizonte limitado. Mensal no dia31 pula meses sem
esse dia; não vira dia28. Horário inexistente gera pendência/exceção observável;
hora ambígua segue a política posterior explicitada no formulário.

Somente esta ocorrência preserva exceção. Esta e futuras ou toda a série futura
criam nova versão e preservam realizadas, passadas e exceções. Reprocessamento
é idempotente. O backend recupera pendências e ocorrências atrasadas sem depender
de uma aba aberta. A materialização não representa um plano legal de manutenção.

Reservas usam intervalos semiabertos `[início,fim)`. Publicação concorrente usa
locks no banco para pessoas e ferramentas. A disponibilidade de ferramenta vem
da custódia canônica, com calibração/condição aplicáveis. Não há saldo paralelo
na Agenda, reserva de veículo fictício ou cálculo automático de rota.

Compatibilidade de custódia: a migração projeta somente reservas antigas cuja
janela, fuso e pessoa já correspondem exatamente ao evento, sem alterar o fato
físico. Custódias externas parciais ou retiradas impedem alteração/cancelamento
até conferência no almoxarifado. Omitir ferramentas em request legado preserva
as já vinculadas; lista vazia explícita é uma intenção diferente. Uma reserva
externa só pode ser adotada quando comprovadamente compatível; não há alargamento
automático do período nem devolução presumida.

## Notificações, operação e diagnóstico

Notificações internas têm persistência, deduplicação e leitura por destinatário,
sempre cruzada com o acesso atual ao evento/origem. Os payloads da fila guardam
identificadores e versão, sem títulos privados desnecessários. Preferências
individuais definem antecedência e atraso; não mudam política corporativa.

A configuração e o histórico de jobs mostram capacidade real, última execução,
estado e falhas para coordenação autorizada. Reprocessar uma falha não cria um
segundo compromisso ou notificação. E-mail, WhatsApp e push não são marcados
entregues sem provedor real. A execução é backend, pelo scheduler existente.

Em erro recuperável, tente novamente e mantenha o preenchimento. Em conflito de
recurso, escolha outra pessoa, ferramenta ou janela; em qualificação pendente,
abra Pessoas e Competências e resolva a conferência. Em acesso revogado, o
detalhe, editor e cache privado são removidos. Não contorne a permissão por URL.

## Evidência e limites

Os testes de SQL, concorrência e calendário usam PostgreSQL descartável. O
laboratório de UI usa componentes e rotas reais com transporte sintético. Os
DTOs são confrontados com respostas SQL e schemas de fronteira. Cada relatório
identifica seu método; captura visual não prova persistência ou RLS.

O usuário autorizou validação local, sem fixtures no banco operacional. A
aplicação de migração e leitura de metadados conectados são registradas em
migracoes.md; não equivalem a E2E Auth/Storage HTTP conectado, hardware físico,
leitor de tela ou desempenho de campo. Resultados finais ficam em validacao.md.
