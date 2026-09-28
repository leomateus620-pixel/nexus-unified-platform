# NEXUS — Catálogo Operacional

Base conferida: `5286881c4133c3d123812226b20081d67bc61c07` (`main` e `origin/main`). Checkout limpo antes da branch `codex/nexus-catalogo-operacional`. As mudanças recentes de bloqueios OC/OP são parte da base e não serão revertidas.

## Matriz de preservação

| Tela | Objeto / visualização | Editor / ações preservadas | Persistência |
| --- | --- | --- | --- |
| Itens comerciais | Componentes da revisão em catálogo | Modalidade, fornecedor, custo com justificativa, memória, filtro, seleção, lote, colagem | Rascunho de `revisao_componentes`; custo recalcula |
| Dimensionamento | Sistemas e composição | Identificação, tipo, metragem, trechos, adicionar, duplicar, excluir, colar, override com justificativa | Rascunho de sistemas/overrides; motor canônico |
| Orçamento | Sistemas ou componentes calculados | Agrupamento, recálculo, recursos e resultado interno | Leitura de `totais`, sem novo motor |
| Compras | Demandas de compra/terceirização | Atualizar demanda, gerar ordens e abrir OC | Ações e estados existentes |
| Produção | Demandas de fabricação | Atualizar demanda, gerar ordens e abrir OP | Ações e estados existentes |
| Resumo | Documento e painel de textos | Cinco textos, impressão, emissão, aceite, recusa, documentos imutáveis | Controle de versão e transições existentes |
| Parâmetros | Quatro grupos | 22 campos, unidades, validação e autosave | Parâmetros da revisão, não globais |
| Histórico | Revisões formais e salvamentos | Nova revisão com motivo, antes/depois e logs técnicos recolhidos | Checkpoint atômico, separado de cálculo |

## Evidência

Capturas e medições do laboratório usam JSX e hooks da aplicação com fronteiras de rede substituídas em `tests/ui`. Fixtures ficam exclusivamente em testes. Não representam registros reais nem validação da autenticação de produção. Ensaios SQL devem aplicar as migrations reais em PostgreSQL isolado; nenhum schema de produção será modificado nesta entrega.

## Invariantes

URLs, parâmetros de rota, guards, motor, precisão, estados documentais e condições de OC/OP permanecem. Nenhum arquivo de CAD, Trevisan ou Mapas 3D faz parte do escopo. Revisão documental e versão de checkpoint são conceitos distintos.
