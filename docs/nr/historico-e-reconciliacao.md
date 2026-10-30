# Histórico, revisões e inspeção da importação

A migração aditiva `0045_nr_historico_paginado.sql`, efetivamente aplicada pelo Lovable na posição 64 do ledger em 30/10/2026 às 20:54 UTC, separa os metadados de navegação dos snapshots completos. A consulta de uma ficha conserva o conteúdo atual necessário ao editor e às exportações, mas inclui somente a primeira página de 25 metadados de eventos e revisões, com suas contagens totais. As páginas seguintes e o conteúdo de uma versão anterior são solicitados explicitamente. A leitura de uma revisão não permite alterá-la, aprová-la ou torná-la vigente.

## Contratos de leitura

| RPC                         | Resultado e autorização                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nr_historico_listar`       | Eventos de um registro existente da mesma organização e norma; metadados paginados, sem `antes` ou `depois`.                                                                                |
| `nr_historico_detalhe`      | Um evento completo autorizado, identificado pelo BIGINT serializado como texto para preservar precisão JavaScript.                                                                          |
| `nr_revisoes_listar`        | Metadados paginados das revisões de um documento ou modelo autorizado.                                                                                                                      |
| `nr_revisao_detalhe`        | Snapshot completo da revisão selecionada e suas fontes de publicação técnica, quando existentes.                                                                                            |
| `nr_importacao_inspecionar` | Somente quem possui `ver_nr` e `configurar_nr`: lotes, itens e resultados terminais paginados; payload, evidência e snapshot de um item apenas sob demanda. Não altera ou reexecuta o lote. |

Os metadados de eventos são ordenados por `created_at DESC, id DESC`. O texto de motivo exibido na lista limita-se a 1.000 caracteres, com indicador de resumo; o evento completo preserva seu texto original. Revisões são ordenadas pelo número, com identidade estável. O padrão de paginação é 25, com limite máximo de 100; filtros, contagens e busca da importação são processados no servidor.

## Contexto e retenção

As colunas geradas `normas_contexto`, `cliente_contexto` e `unidade_contexto` materializam os mesmos campos de contexto dos snapshots históricos, sem atualizar seu conteúdo. Os índices de contexto, norma e cronologia permitem filtrar listas sem descompactar cada payload de auditoria. Eventos novos podem receber campos de contexto ausentes somente quando `recurso` e `registro_id` identificam exatamente um registro da mesma organização; nomes e TAGs não participam dessa decisão.

Os eventos de origem cujo escopo não foi classificado são apresentados como **Origem · escopo não classificado**, apenas quando não há filtro de cliente ou unidade. Sua exibição em um menu não atribui norma, cliente ou unidade ao evento. O payload original e suas datas continuam preservados, sem interpretar fuso horário desconhecido.

A política RLS de auditoria e as RPCs exigem capacidade de configuração para os recursos de fontes brutas, recibos agregados de Storage e registros internos de importação. Os demais eventos seguem a permissão de visualização NR e a organização ativa. Identidades, revisões, conteúdo emitido e histórico imutável mantêm os bloqueios anteriores.

## Verificação

`tests/db/nr-historico.mjs` executa fixtures sintéticas exclusivamente em PostgreSQL descartável e encerra-as com rollback. Cobre paginação, ordenação cronológica, identificadores superiores ao limite inteiro seguro do JavaScript, payloads grandes ausentes das listas, snapshots sob demanda, preservação dos 104 campos do modelo atual, organizações e normas distintas, papéis sem permissão, RLS direto, resultados e filtros da importação, e imutabilidade. A instalação e atualização do manifesto completo são verificadas separadamente pelo harness de migrações.

A [aplicação remota](evidencias/production-migrations-63-64.json) preservou o prefixo histórico de 62 entradas. O [upgrade isolado 62→64](evidencias/upgrade-62-64.log) conferiu JSON, identidade, datas e hash de auditoria preexistente sem alterá-los; a [suíte completa](evidencias/postgresql-nr-64.log) inclui 79 verificações específicas deste fluxo, dentro de 301 verificações PostgreSQL em dez suítes.
