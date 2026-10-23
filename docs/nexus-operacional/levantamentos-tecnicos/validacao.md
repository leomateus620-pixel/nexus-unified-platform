# Evidências de Levantamentos Técnicos

22/10/2026, Windows, Node 24.15.0 e PostgreSQL 16.15 descartável. Conforme decisão do usuário, testar localmente e registrar o limite do E2E conectado. Nenhuma fixture foi criada no banco operacional.

| Método                               | Resultado e alcance                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitário/contrato de handler isolado | `npm run test:levantamentos`: 17 testes de domínio/schema/handler + três de intenção de arquivo, exit 0. Handler substitui transporte, não RLS.     |
| Banco real local                     | 47 cenários de levantamento/modelo/adoção/RLS/precisão/imutabilidade, 28 de arquivos e 12 concorrências; full runner exit 0.                        |
| Instalação e upgrade                 | 40 migrações em banco limpo e upgrade39→40, com pessoa/auditoria preservadas, retry, checksum, rollback DDL/ledger e envelopes DO.                  |
| Metadados conectados                 | `0021` aplicada em 11:19:38.549955 UTC, ledger40/checksums/RLS/Storage verificados; diff sem divergência estrutural. Isso não é E2E.                |
| UI com fixtures isoladas             | 30 layouts em seis larguras (360/390/768/1024/1366/1440), dez comportamentos, zero erro/overflow observados.                                        |
| Compilação                           | Typecheck e build local exit 0. Avisos de chunks, APIs de validação deprecadas e configuração Vite/Nitro permanecem discriminados; não é benchmark. |
| Regressão                            | Operacional49 + manifesto9 + 134 arquivos protegidos, exit 0. UI completa exit 0: 11 telas/oito larguras, 32 vistas, 16 autosaves, 36 layouts operacionais e 30 de Levantamentos. Relatórios em `evidencias/ui-40/`. |
| Lint delimitado                      | Novos TS/TSX da feature, rota, seletor, hook e componentes compartilhados: zero erros; um aviso Fast Refresh preexistente no arquivo compartilhado. |

Banco: [banco-local-40.json](../evidencias/banco-local-40.json). Contratos preservados: [contratos-preservados.json](../evidencias/contratos-preservados.json). UI: [results.json](../evidencias/ui-levantamentos/levantamentos/results.json). Os testes concorrentes incluem perda de papel/capacidade/registro durante espera, replay após revogação e exclusão de ponto depois de edição de medida.

A UI exercitou criação/validação/foco, descarte, erro recuperável, comparação de conflito, ponto/medida, filtros após recarga, vazio distinto de erro, staging/reverificação/cancelamento/nova intenção e adoção explícita. Na regressão de refetch, o detalhe passa para versão2 enquanto o formulário preserva versão1; Save recebe conflito e mantém o texto local.

Capturas CUA Product Design: [baseline desktop](../evidencias/levantamentos/01-antes-desktop.jpg), [baseline celular](../evidencias/levantamentos/02-antes-mobile.jpg), [lista desktop](../evidencias/levantamentos/03-depois-lista-desktop.jpg), [coleta celular](../evidencias/levantamentos/04-coleta-mobile.jpg). As capturas de lista/detalhe/formulário e falha do laboratório estão no diretório de evidências UI. A baseline não possuía jornada funcional equivalente.

Não comprovados: autenticação/Storage HTTP conectado, persistência ponta a ponta pelo frontend conectado, dispositivo/teclado virtual real, leitor de tela, carga representativa e metas de produção. Agenda vinculada, PDF/dossiê, offline completo e limpeza de órfãos continuam requisitos de integração posteriores.
