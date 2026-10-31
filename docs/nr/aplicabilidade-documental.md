# Conciliação documental NR33/NR35

A migração `0049_nr_aplicabilidade_documental.sql`, posição **68**, registra decisões versionadas de organização do acervo. A decisão adicional NR35 permite encontrar a mesma pendência em ambos os recortes. Não duplica local, espaço PET, pendência ou tratativa; não representa validação normativa, assinatura ou autorização operacional.

O manifesto `nr-aplicabilidade-2026-10-30-v1` corresponde ao retrato fornecido de 30/10/2026. Seu SHA-256 de entradas é `ce6f5ebd6f11e5895d9584aab7e682c3e509cf72bfebaedb3d5cd1b04623a300`. Abrange 80 identidades já conciliadas naquele retrato, sem selecionar nem alterar registros adicionados depois. O resultado real da aplicação precisa ser conferido em `nr_aplicabilidade_decisoes`; os números do manifesto não substituem essa consulta.

| Decisão explícita     | Evidência na própria pendência de origem                         | Efeito pretendido                                                 |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Camera · P09          | Identificação de unidade no PGSSTA                               | Acrescentar NR35, conservar NR33.                                 |
| Camera · P12          | Orientações divergentes para descarte de corda no PGSSTA         | Acrescentar NR35, conservar diagnóstico e divergência.            |
| Camera · P13          | Inventário inclui trabalhos em altura fora de espaços confinados | Acrescentar NR35 ao contexto do inventário.                       |
| Fábrica · P36         | Ancoragens descritas no PGSSTA sem documentação                  | Acrescentar NR35 sem concluir conformidade das ancoragens.        |
| Fábrica · P41         | Abrangência documental PPREC/PGSSTA                              | Acrescentar NR35, conservar encerramento e tratativa histórica.   |
| Fábrica · P44         | Correção documental da corda citada no PGSSTA                    | Acrescentar NR35, conservar encerramento e diagnóstico histórico. |
| Fábrica · P-CTR-F2-05 | Linhas de vida sem identificação/ensaio                          | Acrescentar NR35, conservar vínculos NR33 com EC.                 |
| Camera · P-CAM-F2-10  | Registro fotográfico dos pontos de trabalho em altura            | Acrescentar NR35; não afirmar que as fotos foram recuperadas.     |

Outras sete identidades ficam com decisão `revisao_pendente`, sem ampliação normativa: P19, P37, P43, P55, P-CTR-F2-02, P-CTR-F2-03 e P-CAM-F2-02, sempre no seu contexto de unidade. As 65 restantes recebem `manter_recorte`: preservação administrativa de NR33, sem declarar que outra norma seja tecnicamente inaplicável. Nenhuma classificação adicional é aplicada por correspondência textual automática.

## Proteção de edições e reexecução

Cada entrada identifica o sistema, ID externo com unidade, UUID do destino, cliente/unidade/local, SHA-256 do payload de origem, decisão, justificativa e, nas ampliações, trecho literal com SHA-256 do próprio campo. `scripts/nr/prepare-applicability.mjs` reproduz o manifesto a partir do staging privado e recusa trecho ou identidade sem correspondência. A preparação não executa SQL nem escreve no banco.

O executor proprietário `nr_aplicabilidade_manifesto_aplicar` não é concedido aos papéis da aplicação. Sua ordem de trava acompanha o importador: chave canônica de fonte, fonte e registro. Só altera `normas` quando fonte/UUID/hash/contexto/trecho coincidem e o registro atual inteiro é igual ao snapshot de importação. Uma edição na Nexus, mesmo em outro campo, transforma a decisão em `pendente_divergencia` e mantém o registro atual integralmente. Relação ausente fica `sem_correspondencia`. Uma mesma versão com conteúdo diferente é rejeitada.

As ampliações preservam `estado`, `dados`, autoria histórica, datas originais, prazo, responsável e todas as tratativas. Apenas as normas e os metadados normais de versão/atualização mudam, com evento próprio de conciliação. Os snapshots em `nr_fontes` permanecem intactos. Reimportar o mesmo payload retorna `ja_existente` e não desfaz a classificação conciliada; uma fonte nova concorrente observa a mudança e retorna conflito.

`nr_aplicabilidade_decisoes` é imutável, usa RLS por organização e apresenta evidência, resultado e versão na ficha da pendência por `decisoes_aplicabilidade`. O responsável histórico não é transformado em executor da migração ou aprovador retroativo. As decisões registram explicitamente `aprovacao_profissional: false` e `autoriza_operacao: false`.

## Verificação

O [relatório isolado](evidencias/aplicabilidade-documental-isolada.json) registra instalação/upgrade até 68, falha injetada com rollback de DDL/ledger, replay do runner/envelope e 15 suítes NR, somando 615 verificações de cenários. `tests/db/nr-aplicabilidade.mjs` inclui 47 verificações específicas: estados encerrados e tratativas, JSON/autoria/datas de origem, preservação de edições, hashes e trechos divergentes, RLS, executor restrito, três reexecuções simultâneas, edição concorrente e importação nova concorrente. Todos os dados dessas provas são artificiais em PostgreSQL descartável. Os três testes de preparação comprovam que mera menção textual não amplia uma decisão não revisada.
