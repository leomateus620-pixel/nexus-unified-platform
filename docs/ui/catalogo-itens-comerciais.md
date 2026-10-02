# Catálogo e Itens Comerciais

Refinamento integrado sobre `fe81267`, preservando as rotas, o cadastro compartilhado, os códigos emitidos pelo servidor e o coordenador de salvamento da revisão.

## Experiência entregue

- Catálogo como conteúdo principal: busca, filtros, contagem real, linhas no desktop, blocos no celular e cadastro em painel contextual. Importação, séries e pendências ficam em acessos secundários.
- Um `ProductEditor` compartilhado entre catálogo, composição e proposta, com identificação, classificação, fornecimento e composição. Criar um componente faltante preserva o formulário principal e retorna à estrutura.
- Grupo comercial / prefixo do código separado da família técnica. A prévia informa que o número será confirmado ao salvar; a confirmação usa o código retornado pelo servidor.
- Ficha com composição, custos, compras e fornecedores em abas. Última compra, média ponderada e custo sugerido têm papéis distintos. O registro de custo usa formulário acessível com validação, erro recuperável e confirmação.
- Importação por conteúdo colado, mapeamento e prévia. Os estados explicam conflitos e incompletudes por linha; “Já existente” identifica a compra já importada. O resumo de conclusão permanece após atualizar a prévia.
- Uma entrada “Adicionar item”, com busca ou cadastro compartilhado, inclusão com quantidade manual ou disponibilidade fora do orçamento. Produtos existentes mostram a quantidade atual e a ação de substituição. A inclusão pode ser retomada após falhar, usando o produto já criado.
- Itens Comerciais em coleção compacta e inspetor “Esta revisão”. Cadastro mestre tem uma superfície separada. Quantidade manual, dimensionada e consolidada, base da árvore e quantidade por unidade do pai são identificadas conforme os dados disponíveis.
- Custo por composição e produto comprado completo aparecem separados da modalidade de fornecimento. Novas referências exigem adoção explícita, inclusive quando o valor informado é zero. Impacto monetário depende de cálculo e salvamento atualizados.

## Correções necessárias ao comportamento apresentado

1. A operação existente `adicionarComponenteRevisao` agora insere `incluido_orcamento: false`. O padrão do banco era `true`, incompatível com a opção “Somente disponibilizar”. A inclusão no orçamento continua na operação existente `incluirNaRevisao`; itens já presentes não são modificados pela disponibilidade.
2. A atualização da prévia de importação mantém o resultado da gravação. O painel impede fechamento durante a operação e preserva a conclusão ao reabrir.
3. Datas de documento e vigência sem horário são exibidas como dias do calendário, sem recuar um dia por conversão de fuso. Timestamps mantêm a formatação local existente.

Não foram alterados os motores de cálculo/custo, geração de códigos, esquema, políticas, triggers, permissões, filas de salvamento ou fontes de dados. Os dados simulados ficam exclusivamente no laboratório `tests/ui`.

## Evidência visual comparável

Mesmos dados isolados, viewport e fonte anterior extraída de `fe81267`. As posições são a coordenada vertical do primeiro item; não são medidas de desempenho nem evidência de produção.

| Fluxo            | Largura |   Antes | Depois |
| ---------------- | ------: | ------: | -----: |
| Catálogo         | 1440 px |  730 px | 370 px |
| Catálogo         |  390 px | 1143 px | 524 px |
| Itens Comerciais | 1440 px | 1578 px | 483 px |
| Itens Comerciais |  390 px | 3708 px | 707 px |

[Capturas e resultados](evidence/commerce-refinement/) incluem catálogo, proposta e ficha, além do inspetor e cadastro mestre no celular. O cenário de proposta contém avisos de novas referências de custo.

## Verificação e limites

- `npm run typecheck` e `npm run build`: aprovados.
- `npm run test:orcamento`: 63 testes aprovados, incluindo motores, fila, patches, importação, disponibilidade e datas.
- ESLint nos arquivos de produção alterados: zero erros; nove avisos de organização para Fast Refresh.
- Interface: 15 cenários integrados e 12 combinações de tela/largura entre 320 e 1440 px; as regressões existentes verificaram 88 combinações gerais, 32 vistas de editores, 14 cenários de acessibilidade e 16 pares de contraste. Resultados em `evidence/commerce-refinement/checks.json` e `regression.json`.
- Salvamento: 16 cenários aprovados com os arquivos congelados. A primeira execução foi interrompida por uma recarga do servidor de desenvolvimento; a repetição isolada confirmou os cenários sem alterar a fila ou ampliar timeouts.

Família técnica usa o suporte de edição já existente na ficha. O cadastro inicial não ganhou um novo contrato de gravação para esse campo. Fontes sem quantidade consolidada ou origem de custo confirmada continuam identificadas como pendentes/desconhecidas.

As verificações usam Chromium local e fronteiras externas simuladas. Não confirmam dados reais, permissões em uma sessão de produção, comportamento em aparelhos físicos ou implantação. Nenhuma migração, escrita de dados de produção, merge ou deploy foi executado.
