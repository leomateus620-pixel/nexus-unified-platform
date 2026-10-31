# Upgrade visual NR33 / NR35

A base usada é o commit `476cd7ecde56aae5a235af906157d39e4072a40c`, merge da PR20. O checkout estava limpo em `main`; a implementação está na branch `codex/nr-cards-brand-media`. As capturas de baseline foram feitas nesta execução, com o código desse commit e a sessão autorizada da Nexus. Uma cópia isolada do commit manteve a baseline estável durante o desenvolvimento.

A comparação autenticada usa COTRIROSA / Fábrica de Ração na NR33 e Camera Alimentos / São Luiz Gonzaga na NR35, em 1440×900. As capturas reais e seu índice comparável ficam fora do Git, na pasta de evidências local entregue no chat; contêm dados de clientes e não são artefatos públicos da PR. Os screenshots versionados no repositório usam exclusivamente registros sintéticos do laboratório.

## Contrato visual

`nr.css` substitui a cascata anterior por um contrato único. `AppShell.tsx`, `operational.css`, `styles.css` e a identidade da lateral global não mudaram. Contexto, menus, busca, filtros, conteúdo, ações e painéis mantêm sua ordem e seus destinos. A mudança estrutural é a coleção de registros em cards dentro dos contêineres existentes.

| Token                                                                       | Papel                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `--nr-frame`, `--nr-frame-text`, `--nr-frame-muted`                         | Superfície verde profunda do contexto e dos oito destinos internos |
| `--nr-context-control`, `--nr-context-control-hover`, `--nr-context-marker` | Superfície verde suave e marcador de identidade dos seletores      |
| `--nr-surface-workspace`, `--nr-surface-panel`, `--nr-surface-card`         | Área tonal de trabalho, painéis existentes e registros claros      |
| `--nr-surface-field`, `--nr-border-strong`                                  | Controle em repouso com limite visível                             |
| `--nr-text`, `--nr-text-subtle`                                             | Leitura principal e metadados legíveis                             |
| `--nr-selection`, `--nr-focus`                                              | Seleção por superfície/marcador e foco por anel                    |
| `--nr-critical`, `--nr-warning`                                             | Atenção localizada; não representam aprovação técnica              |
| `--nr-radius`, `--nr-radius-control`                                        | Raios dos grupos e controles                                       |
| `--nr-motion-fast`, `--nr-motion`, `--nr-ease`                              | Base Nexus 140/200 ms, sem deslocar cards, com movimento reduzido  |

Os controles de cliente e unidade usam `--nr-context-control` verde suave e `--nr-context-marker`, com a marca real e um marcador de localização. Hover e foco mantêm a superfície tonal; não reaparece o preenchimento branco genérico. Todas as cores novas usam OKLCH. Barlow permanece a fonte de leitura; Saira fica restrita à norma/TAG. `NrCards.tsx` oferece `NrCard` com variantes tipadas, `NrCardMeta` e `NrCardActions`. O recurso controla sua identidade e suas evidências. Não há um cartão universal que transforme todo conteúdo em título/número/ícone.

As grades usam CSS Grid por largura disponível, com mínimo `min(100%,21rem)` e gap 16 px. Elas preservam ordem DOM/visual e paginação, sem masonry ou largura mínima que exceda o painel. Os rodapés alinham com `margin-top:auto`, sem cortar texto por altura fixa.

## Matriz das listagens principais

| Antes                                | Depois e de-para dos campos                                                                                                                      | Comportamento                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Clientes: ícone genérico e cabeçalho | Marca oficial+nome na mesma ação; razão social e CNPJ secundários; quantidade de unidades                                                        | A identidade expande o agrupamento por ID; não abre rota nova nem escolhe unidade                                  |
| Unidades em tabela                   | Nome/localidade, endereço, CNPJ, escopo/normas, situação documental, locais, documentos totais/origem/cópias e detalhes existentes               | Abrir unidade, Documentos, Pendências com contagem e Editar continuam controles independentes                      |
| Locais em tabela                     | TAG e nome; setor, família, enquadramento, avaliações, situação do levantamento, memorial histórico; acessos Fotos/Documentos com contagens      | Mesmos filtros, ordenação natural, paginação e ficha; sem foto genérica                                            |
| Levantamentos em linhas              | Identidade/TAG/local, situação, contexto disponível e atualização                                                                                | Responsável/progresso/família só aparecem quando fornecidos pelo DTO; a lista não faz consulta de detalhe por item |
| Documentos em tabela                 | Tipo e título, contexto local/unidade, revisão junto da identidade, situação/vigência, data de origem, Word/PDF, cópias e motivo de substituição | Linhagem comprovada e avisos de correspondência preservados; abrir usa o mesmo detalhe                             |
| Pendências em linhas                 | Título/contexto, estado aberto/encerrado, criticidade localizada, normas, prazo/revisão quando existentes                                        | Tratativa continua no detalhe; nenhum encerramento inferido pela aparência                                         |
| Biblioteca em linhas semelhantes     | Categoria explícita (regra/critério/família/roteiro/modelo), título, revisão/código/origem se disponíveis, atualização e situação                | Mesma ordenação/filtros; campos ausentes do resumo não são inventados nem buscados por card                        |
| Pastas em linhas                     | Nome, subpastas, documentos, arquivos físicos e imagens do resumo real                                                                           | Pasta com imagens e zero documentos lógicos continua reconhecível; árvore/breadcrumb preservados                   |
| Painel: coleções internas            | Mesmos cards de documento/pendência dentro dos dois painéis existentes; histórico em eventos                                                     | Indicadores continuam usando totais do servidor, nunca o tamanho de uma amostra                                    |
| Histórico global em linhas           | Evento, data/autoria, contexto, texto e motivo integral/resumido; acesso à auditoria                                                             | Cronologia, filtros e paginação preservados                                                                        |

A matriz complementar de 11 coleções, fichas, repetidores, versões, conferência e importações está em [upgrade-visual-detalhes.md](upgrade-visual-detalhes.md).

## Marca, seleção e campos

[Proveniência das marcas](visual/brands.md) documenta os binários oficiais, SHA-256, limites de resolução e associação ao cadastro canônico. Camera usa o ativo corporativo Camera Agroindustrial; o nome comercial Camera Alimentos permanece. A COTRIROSA oficial fornecida tem letras brancas e recebe superfície escura, sem filtro/recoloração. A Nexus serve cópias locais verificadas, sem hotlink. Marca ausente/com falha mostra monograma e mantém nome/seleção.

O seletor usa Radix Popover+cmdk, busca, ID como valor, identificação da opção atual, teclado/Escape e retorno de foco. Abrir ou pesquisar não muda o cliente. A escolha limpa a unidade para seleção explícita. O fluxo de cadastro existente permite selecionar uma marca local e salvar com verificação de bytes; Cancelar segue o descarte explícito e não envia o arquivo.

Campos preservam posição/sequência, label persistente, valor, unidade, ajuda e validação. Controles equivalentes têm altura 44 px e alinhamento pelo topo. O contexto usa 46 px para alinhar seletor com marca e unidade. Textareas crescem sem esticar o vizinho. Foco é localizado; readonly/disabled/erro têm apresentação distinta. O erro numérico só é mostrado para campo numérico; nenhum obrigatório vazio recebe erro antecipado. `technical-display.tsx` contém mapas explícitos; chaves desconhecidas ficam exatas no conteúdo complementar.

`useCollectionReturn` complementa a restauração do router para Voltar à lista: contexto/filtro/página/card/rolagem/foco por usuário e organização. Os controles secundários não ficam dentro de um link que envolve o card. O editor recebe seu acionador explicitamente e aplica a resposta salva no cache antes de reabrir, preservando a versão confirmada e os enriquecimentos do DTO.

## Validação e limites

O laboratório usa componentes reais, transporte sintético e bloqueio de redes externas da aplicação. Edição, descarte, gravação repetida, revisão concorrente, repetidores e staging são testados somente nesse ambiente. A sessão conectada é usada para jornadas de leitura e comparação, sem criação de registros artificiais.

As larguras verificadas incluem 1366×768,1440×900,1920×1080,2560×1440,1024×768 e390×844. O caso 720×450 verifica a largura CSS equivalente a 200% em 1440×900; não é uma afirmação de zoom nativo automatizado. Chromium e WebKit 26.6 foram exercitados. Uma jornada manual adicional no Safari nativo confirmou o zoom de 200% nos ajustes da página e exercitou busca, abertura da ficha, edição, Escape, descarte explícito e retorno de foco, somente com dados sintéticos. Dispositivos físicos móveis e os demais fluxos completos no Safari nativo continuam limites.

Os 13 pares de contraste medidos no navegador passam os alvos: texto principal/card 14,918:1; secundário/workspace 6,228:1; foco/campo 6,812:1; borda de controle/campo 3,183:1. Texto sobre o seletor tonal alcança 11,189:1 e sobre seu marcador 8,714:1. Isso é uma verificação objetiva de tokens e não certifica toda a WCAG 2.2 AA.

O lint global já falhava na PR20, incluindo a formatação dos tipos Supabase gerados. A execução desta entrega compara a baseline e os arquivos alterados; o relatório de validação distingue essa dívida preexistente de novos erros. Assets PDF.js gerados pelo build agora são excluídos do lint; são os mesmos arquivos já ignorados no Git e verificados pelo preparador próprio.

Migrações são versionadas e aplicadas no banco Nexus pelo conector Lovable com ledger/hash; não se fornece SQL manual no chat. Aplicação de migração, sincronização Git, merge e publicação são estados independentes. Esta PR não afirma que o frontend foi publicado.
