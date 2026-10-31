# Fichas, levantamento e acessos secundários

Base de comparação: `476cd7ecde56aae5a235af906157d39e4072a40c` (PR 20). Este documento descreve a árvore de trabalho desta PR; não afirma publicação. A revisão visual usa os componentes reais com transporte sintético isolado em `tests/ui`; não escreve em Auth, banco ou Storage de produção.

## Matriz de conversão

| Coleção anterior                                       | Campos preservados e apresentação                                                                                                                               | Fluxo preservado                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Conferência: tabela de candidatos                      | TAG e nome no cabeçalho; evidência de TAG/alias e divergência de nome no corpo; ação de abrir ficha no rodapé. A referência externa permanece acima da coleção. | Mesma unidade, busca, ordem e paginação de 25 candidatos. Nenhuma associação ou confiança inventada.               |
| Ficha: relacionados em linhas                          | Título/TAG e situação; revisão; vigência documental; contagem de cópias editáveis e alerta de correspondência pendente.                                         | Mesmos links de registro, recorte de 25 e acesso à lista completa. Sem consulta adicional por card.                |
| Versões do registro em linhas                          | Número, estado, vigência, data de criação, declaração técnica interna; data/autoria histórica e fonte quando presentes no DTO.                                  | Metadados sob demanda; conteúdo integral apenas ao abrir a revisão.                                                |
| Auditoria do registro em linhas                        | Comando, data, motivo, indicação de motivo resumido e escopo não classificado; autoria histórica quando disponível.                                             | Paginação incremental de 25; evento integral carregado individualmente.                                            |
| Histórico técnico em linhas                            | Acontecimento, texto integral, data, autoria e informações complementares preservadas.                                                                          | Ordem da origem e ocorrências repetidas mantidas. Nenhum evento técnico vira importação ou assinatura.             |
| Lista estruturada do levantamento em tabela de leitura | Número do item, todos os subcampos definidos, unidades, valores zero, informações extras e conteúdos históricos fora do formato.                                | Cards de leitura; editor continua repetidor. Remover devolve o foco ao próximo controle de remoção ou a Adicionar. |
| Versões históricas de arquivo em linhas                | Identificação da versão, nome original, data/autoria, disponibilidade individual e motivo; MIME, tamanho, retenção e captura em expansão.                       | Download oferecido somente para o binário histórico disponível; nunca usa o arquivo atual como substituto.         |
| Cópias editáveis ligadas ao original em linhas         | Título e estado; identificação de cópia derivada com identidade própria.                                                                                        | Mesmo documento e linhagem comprovada; ação explícita para abrir a cópia.                                          |
| Conciliação: lotes/itens em linhas                     | Lote: origem, estado e atualização. Item: tipo, resultado, ID externo, motivo e indicação de resumo.                                                            | Filtros, paginação, inspeção autorizada e retorno de foco preservados.                                             |
| Importação: prévia de mapeamentos em tabela            | Tipo/ID externo; entidade e título do destino declarado. Quantidade exibida corretamente como até 25 de N.                                                      | Mesmo manifesto, dependências, hash, confirmação e staging.                                                        |
| Importação: filas/itens em linhas                      | Origem ou sequência/tipo/ID externo; estado/resultado e motivo; ação de abrir fila.                                                                             | Mesmos comandos, contagens, lotes, paginação e controle de execução.                                               |
| Consumo por unidade em tabela                          | Cliente e unidade no cabeçalho; quantidade de objetos e MiB medidos em metadados.                                                                               | Mesmo resumo consolidado da organização, sem nova consulta por unidade nem mudança de quota.                       |
| Consumo por bucket em tabela                           | Identificação do bucket privado; quantidade de objetos e MiB medidos.                                                                                           | Mesmo painel de configurações e mesma ordem do resumo recebido.                                                    |

As matrizes de avaliação e de cálculo, a comparação campo/valor anterior/valor proposto e as tabelas integrantes do conteúdo documental permanecem tabulares porque os eixos são necessários à interpretação. A árvore de pastas mantém sua semântica hierárquica. Avisos textuais da conversão continuam listas de texto; não são coleções de registros. A identificação da ficha mantém a sequência dos campos; as seções técnicas recebem superfície e espaçamento por grupo. Apenas o conteúdo complementar do levantamento histórico ganhou expansão explícita.

## Contrato de interação e apresentação

- `NrCard`, `NrCardMeta` e `NrCardActions` fornecem a estrutura comum; o conteúdo e os níveis de título pertencem a cada recurso.
- `survey.css` foi consolidado no lugar das regras anteriores. Usa superfícies, bordas, seleção, foco, raios e movimento semântico do workspace; não adiciona `!important` nem outra camada de overrides.
- Labels persistentes têm identificação própria; ajuda, unidade e avisos usam `aria-describedby`. Campos equivalentes alinham pelo topo e controles preservam sua altura quando um textarea cresce.
- Escolhas mantêm checkbox nativo, sinal de seleção, texto e área de 44 px. A aplicabilidade e a contagem de respostas vêm de `surveyBlockProgress`, sem nova regra de cálculo ou indicação de aprovação.
- Ações de histórico capturam o foco antes de abrir o diálogo; o editor recebe o acionador explícito. Isso cobre o comportamento do WebKit em que clicar um botão não o torna automaticamente focado.
- Rótulos conhecidos usam mapeamentos explícitos. Chaves desconhecidas permanecem exatas nos dados complementares; nenhum algoritmo transforma códigos internos em frases.
- O aviso de medição histórica agora aparece apenas em campos numéricos. Texto livre não recebe mais uma instrução de substituição de medição.

## Verificação reproduzível

`npm run test:ui:nr-details` inicia o laboratório e executa `tests/ui/nr-details-quality.mjs`. O script bloqueia rede externa da aplicação; permite somente o laboratório e as fontes Google. As evidências desta entrega estão em `evidencias/upgrade-visual/details/nr-details/`.

Foram verificados, em Chromium/Chrome com perfil isolado e WebKit 26.6:

1. Os oito nomes, a ordem e os destinos em NR33 e NR35.
2. Filtro, página 2, ação secundária de Fotos sem propagação, retorno ao card com contexto/rolagem/foco e ausência de consultas de detalhe por card antes da abertura.
3. Candidatos com correspondência e divergência de nome, sem aprovação automática.
4. Documentos relacionados e sete narrativas históricas integrais.
5. Leitura de B07/B16, quantidade zero e propriedades desconhecidas preservadas.
6. Remoção de repetidor, Cancelar, Continuar editando, Escape e descarte explícito sem mudar o registro salvo.
7. Salvamento parcial de B07 com clique repetido produzindo uma versão; B16 continua intacto ao reabrir.
8. Layout de formulário em 1366×768, 1440×900, 1920×1080, 2560×1440, 1024×768 e 390×844 sem overflow da página. O caso 720×450 exercita a largura CSS equivalente a 200% em 1440×900.
9. Cópias editáveis e linhagem preservadas.
10. Metadados de versão histórica indisponível sem download enganoso; revisão em leitura com retorno de foco.
11. Auditoria de 28 eventos em duas páginas, sem carregar snapshots antes da abertura.
12. Conciliação e staging de manifesto exclusivamente sintético, com mapeamentos/itens em cards; consumo agregado por unidade/bucket em cards, legível também em 390 px.
13. Erro de revisão concorrente preservando o preenchimento e o fluxo explícito de descarte.
14. Treze combinações de cores computadas em sRGB por canvas. Texto secundário no workspace: 6,228:1; texto da moldura: 12,819:1; borda de controle sobre campo: 3,183:1; foco sobre campo: 6,812:1. Texto sobre o seletor contextual tonal: 11,189:1; texto/marcador contextual: 8,714:1. Os demais pares também passam os limiares de 4,5:1 para texto ou 3:1 para controle/foco.

O relatório registra 28 verificações (14 por engine), sem erros. Os testes unitários relevantes somam 53 verificações aprovadas em nove arquivos; lint dos componentes alterados não apresenta erros. A medição dos tokens não certifica conformidade integral com WCAG. Esta suíte automatizada não exercita o aplicativo Safari nem dispositivos físicos; verificações manuais adicionais são registradas no relatório geral da entrega. O teste de 720×450 não é uma automação do zoom nativo do navegador. Persistência e autorização de produção exigem evidência própria; fixtures não as certificam. A revisão de fotos e representações está em [revisao-midia.md](revisao-midia.md).
