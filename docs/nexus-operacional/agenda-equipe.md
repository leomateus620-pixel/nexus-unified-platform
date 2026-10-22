# Fundação temporal da Agenda Equipe

## Entrega desta etapa

`0016_agenda_foundation.sql` prepara o backend temporal para eventos independentes e visitas ligadas
à mesma `acoes_operacionais`. A experiência completa do menu continua na etapa final do plano;
esta fundação não entrega recorrência, vínculos com OS/inspeção/manutenção, frota, ferramentas,
exportação ICS ou calendário desktop/mobile.

Fontes canônicas:

| Entidade                  | Contrato                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `agenda_eventos`          | Título, tipo, período, timezone, responsável, estado, versão e FK opcional da ação       |
| `agenda_participantes`    | Pessoa real, função, confirmação e vigência; substituição encerra a linha anterior       |
| `agenda_requisitos`       | FKs às competências configuradas; não adiciona exigências normativas automáticas         |
| `agenda_reservas_pessoas` | Intervalos exclusivos confirmados, com FK ao mesmo evento/participante/pessoa            |
| `agenda_evento_revisoes`  | Snapshot histórico de cada versão, com participantes e competências daquele planejamento |
| `outbox_eventos`          | Efeito por evento/versão/tipo, produzido na transação do comando                         |
| `notificacoes`            | Destinatário Auth e link ao evento; sem cópia de relato ou título sensível               |

O responsável é sempre incluído entre os participantes. Observador não ocupa recurso exclusivo.
Somente reunião pode ser explicitamente informativa, sem reserva de recursos. Não existe exceção
que permita sobreposição operacional exclusiva silenciosa.

## Comandos

- `salvar_evento_agenda(org,chave,dados,id?,expected_version?)`: representação completa do
  planejamento, incluindo `participantes`; cria rascunho ou edita rascunho/publicado. Editar
  publicado revalida e troca as reservas atomicamente. As confirmações do novo planejamento
  começam pendentes, enquanto as linhas anteriores permanecem históricas.
- `transicionar_evento_agenda(org,chave,id,expected_version,estado,motivo?)`:
  rascunho → publicado → em andamento → concluído; rascunho/publicado podem ser cancelados com motivo.
- `confirmar_participacao_agenda(org,chave,participante_id,expected_version,confirmacao)`:
  confirma/recusa a própria participação vigente; não muda o estado do evento ou da ação.
- `registrar_indisponibilidade(org,chave,pessoa,inicio,fim,motivo_operacional)`: registra um
  impedimento por pessoa. Uma indisponibilidade posterior ao planejamento impede iniciar;
  não apaga reservas nem cancela compromissos automaticamente.
- `listar_eventos_agenda(org,inicio,fim,pagina,tamanho,minha)`: período máximo de 93 dias,
  página de 1–100 registros, contagem e itens com a mesma autorização.

Os campos de `dados` são `titulo`, `descricao`, `tipo`, `inicio`, `fim`, `timezone`,
`responsavel_id`, `local`, `participantes` (`pessoa_id`,`funcao`), `competencias` (IDs),
`bloqueia_recursos`, `acao_id` e `origem_ocorrencia`. Eventos de dia inteiro usam
`dia_inteiro=true`, `data_inicio` e `data_fim` exclusiva. Instantes de evento com horário exigem
offset explícito. A origem não pode ser trocada depois da criação.

Uma ação permite várias visitas com chaves de ocorrência distintas. A chave
organização+ação+ocorrência impede repetir a mesma visita. Concluir uma visita nunca conclui a ação:
execução, evidência e verificação continuam nos comandos canônicos de ações.

## Concorrência, qualificação e privacidade

Publicação, reagendamento e início adquirem locks por organização+pessoa em ordem estável.
A consulta de sobreposição e a reserva ocorrem na mesma transação, com intervalos `[início,fim)`.
Um evento pode terminar às 11h e outro começar às 11h. A reserva rejeitada reverte estado, versão,
participantes, outbox e recursos, preservando o planejamento anterior.

Competências são verificadas para o período completo na publicação e novamente ao iniciar.
Qualificação revogada, vencida antes do serviço ou pessoa inativa bloqueiam a etapa pertinente.
Sem requisito configurado não há declaração de aptidão ou conformidade legal universal.

Coordenação/engenharia administram pelo mesmo mapa de capacidades da fundação. Campo lê somente
eventos atribuídos. Uma ação de origem inacessível também oculta seu evento e notificações.
Revogar papel ou membership remove acesso atual; os recibos idempotentes não são cache público.
Trocar participantes futuros preserva o histórico e não concede ao substituído acesso ao novo plano.

## Notificações e scheduler

`processar_notificacoes_agenda(limite)` é service-only, processa efeitos internos com row locks,
deduplicação por destinatário/evento/versão/tipo, tentativas e backoff. Não faz chamada a provedor
externo. Como seleção e efeito são PostgreSQL na mesma transação, não mantém lease externo.
Adicionar envio externo exige outbox/lease e confirmação próprios, sem presumir entrega única.

`0018_scheduler.sql` prepara o job privado `nexus-agenda-notificacoes` a cada minuto quando
`pg_cron` está disponível. A ativação falha se já existir job divergente ou se a extensão disponível
não puder ser habilitada. Em PostgreSQL sem a extensão, registra `indisponivel` e não cria cron fictício.
`job_execucoes` contém somente metadados mínimos e não é consultável por usuários autenticados.
`consultar_jobs_operacionais(org)` oferece capacidade/última execução e contagens da própria organização.

O teste local prova worker manual, autorização e deduplicação. Ele não prova disparo automático:
a instalação conectada foi verificada separadamente, com `pg_cron` 1.6.4 e disparo real às 09:05:00 UTC
em 22/10/2026, sucesso com fila vazia (zero processados/falhas). Isso não prova entrega a uma pessoa
real. Lembretes temporais, recorrência e regras de notificação corporativa
ainda precisam da etapa integrada; o job atual processa atribuições e mudanças já persistidas.

## Evidências locais

`tests/db/agenda-foundation.sql` cobre 38 cenários, incluindo data de dia inteiro em mudança de
horário de verão, vencimento/revogação de competência, cancelamento e separação ação/evento.
`tests/db/agenda-concurrency.mjs` usa sessões PostgreSQL reais para publicação exclusiva,
reagendamento concorrente e dez retries da mesma publicação. Não usa mocks de reserva.
Os mesmos runners executam instalação limpa e upgrade com ledger, isolamento entre tenants e
revogação de acesso. A evidência é PostgreSQL isolado; não equivale a homologação do menu ou produção.
