# Levantamentos Técnicos: contratos implementados

Rota autenticada `/levantamentos`, feature `src/features/levantamentos`, migração append-only `0021`. A identidade é independente das revisões. Cliente, unidade, pessoa, proposta e projeto são referências aos cadastros canônicos.

## Modelo e histórico

| Tabela                                                 | Conteúdo e integridade                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `levantamentos`                                        | Código LEV gerado no servidor, cliente/unidade imutáveis, finalidade, responsável, origens opcionais e ponteiros de revisão. `version` protege contexto concorrente. |
| `levantamento_revisoes`                                | Número/base, modelo fixado, período previsto, estado e versão. Aprovação grava snapshot/SHA-256, autor e instante; revisão final não muda.                           |
| `levantamento_pontos`                                  | Código local único por revisão, área/localização, sistema descrito, observações e exigência de foto. FK composta ao levantamento/revisão.                            |
| `levantamento_medicoes`                                | Ponto/revisão, grandeza, valor e precisão `numeric(18,6)`, unidade, método, origem, natureza e data. DTO decimal em texto; sem arredondamento implícito da coleta.   |
| `levantamento_modelos` / `levantamento_modelo_versoes` | Nome e versões publicadas por profissional, fonte e requisitos declarados. Não há norma ou tolerância técnica inventada/precarregada.                                |
| `levantamento_avaliacoes`                              | Eventos imutáveis de comando, decisão, comentário e pendências, produzidos no banco.                                                                                 |
| `levantamento_arquivos`                                | Original privado por revisão/ponto, staging, MIME, tamanho e hash verificados. Ver `arquivos.md`.                                                                    |
| `levantamento_adocoes`                                 | Origem aprovada, sistema/revisão comercial de destino, valores anterior/adotado e hash do preview. Imutável e idempotente.                                           |

FKs centrais usam organização e pai; índices atendem lista por atualização, responsável, estado/período e filhos. Limites por revisão: 100 pontos, 1.000 medidas e 500 arquivos. Lista paginada 25/50; arquivos paginados por ponto/revisão. Não se carregam todos os levantamentos da organização no browser.

## Comandos e jornada

`lev_executar` implementa criar/contexto/programar/iniciar_coleta/salvar_ponto/salvar_medicao/exclusões/submeter/devolver/aprovar/cancelar/nova_revisao. O estado pertence à revisão:

`rascunho → programado → em_coleta → em_revisao → aprovado`; devolução justificada retorna à coleta, cancelamento exige motivo e nova revisão preserva a anterior. A cópia de estrutura não renova evidências, valores medidos ou aprovação.

O ponto admite salvamento atômico com medidas; cada edição verifica sua versão. Excluir ponto também verifica a versão da revisão para impedir apagar uma medida alterada por outra pessoa. Submissão valida medidas/metadados, modelo e fotos exigidas; upload pendente bloqueia a submissão. Uma estimativa tem identificação explícita e um modelo 3D nunca vira medida confirmada automaticamente.

`lev_publicar_modelo` publica versões com fonte, requisitos, grandeza/unidade, foto e faixa opcional declarada. A publicação posterior não altera uma coleta iniciada. O formulário exige conferência explícita; cadastrar um parâmetro não comprova sua adequação normativa.

## Permissões e concorrência

Coordenação gerencia contexto e planejamento; Campo consulta/coleta somente levantamentos de sua responsabilidade. Navegação concede `/levantamentos` explicitamente a Campo e à capacidade de coordenação; as linhas continuam protegidas pelo banco. A criação não dá acesso global a pessoas/clientes para um coletor.

Revisar/aprovar exige capacidade e pessoa ativa vinculada ao ator, com registro profissional declarado. Admin sem esse vínculo não satisfaz a conferência profissional. Essa declaração não substitui verificação externa de habilitação, ART ou laudo.

Locks de autorização estabilizam membership, papéis, capacidades e pessoa antes dos comandos/retries. Raiz/revisão/filhos são travados na ordem definida. Idempotência usa autor+organização+chave e rejeita payload diferente. Snapshot aprovado inclui o contexto congelado; alterar a fonte ou uma revisão posterior não muda a apresentação histórica.

## Adoção e consumidores

`lev_prever_adocao` apresenta atual/proposto/origem e componentes afetados. `lev_adotar_medicao` reautoriza, trava a revisão comercial pelo mecanismo canônico, confere o hash atual e altera somente `metragem` ou `trechos` de sistema em rascunho do mesmo cliente/unidade. Conversão para metros rejeita perda de precisão além de 0,001 m. Estimativa/3D não é adotado como medição verificada.

A adoção marca o cálculo desatualizado e preserva `sistema_componentes`/motor existentes. A interface abre o dimensionamento exato e pede recálculo canônico; não existe outro motor nesta feature. Cache invalida `['levantamentos', org]`, arquivos do contexto e `['rev', revisãoDestino]`.

## Produto e limites

Busca/estado/página/revisão/ponto permanecem na URL. Formulário conserva a versão que abriu mesmo após polling; erro/conflito preserva texto e oferece comparação. Contexto recolhível e foco no ponto priorizam a coleta móvel. Horários são instantes com offset; entrada/exibição identificam o fuso do dispositivo.

Agenda ainda não consome o período previsto como visita canônica; a tela não anuncia reserva de pessoas. PDF/dossiê dependem de Documentação; offline completo, limpeza física de órfãos e E2E Auth/Storage HTTP continuam pendentes. Esses limites não são apresentados como integrações executadas.
