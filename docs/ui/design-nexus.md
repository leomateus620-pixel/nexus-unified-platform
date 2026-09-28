# NEXUS — Precisão operacional

## Base e limites

Base: `e6c765f4f3b3abb5fbd14195f947143f70d24794` em `origin/main`, registrada em 27/09/2026. Implementação em `codex/nexus-operational-ui`, worktree isolada. O histórico publicado é preservado (Lovable).

O redesign altera composição e interação de apresentação. Não altera árvores de rotas, URLs, loaders, guards, autenticação, RLS, migrations, APIs, consultas, invalidações, permissões, cálculos, arredondamentos, snapshots nem sequência operacional. `features/calculo/domain.ts`, `features/propostas/hooks.ts` e `propostas.functions.ts` continuam fontes canônicas. Fixtures são exclusivamente de teste; não há usuários ou gravações de produção na validação visual.

Diagnóstico inicial: cabeçalhos translúcidos sobrepostos, tabelas sem acesso equivalente por teclado, painéis laterais permanentemente reservados e campos de edição competindo com leitura. As oito páginas já existem e continuam livres para navegação. O motor e o estado persistido não podem ser inferidos pela aparência.

## Direção

Ferramenta de engenharia, com superfícies opacas, hierarquia editorial, divisores precisos e verde de marca reservado a seleção e ações. Saira estrutura títulos; Barlow sustenta leitura e controles. Números usam algarismos tabulares e formatação existente. Não são usados vidro, efeitos de brilho, gradientes decorativos ou animações financeiras.

Três assinaturas: régua numerada de páginas (links, nunca tabs falsas); área de edição conectada ao inspetor do objeto selecionado; faixa de valores com total dominante. No notebook, edição tem prioridade sobre uma terceira coluna. No celular, o inspetor usa diálogo opaco e uma única instância dos controles.

## Tokens

O tema vive em `src/components/nexus/operational.css`, sob `.nexus-operational`, inclusive em portais que o declarem. A ativação acompanha exclusivamente caminhos operacionais; estilos de CAD/3D, fullscreen, canvas e overlays permanecem fora desse escopo. `:root` e `.dark` originais são preservados.

| Token                                      | Uso                                               |
| ------------------------------------------ | ------------------------------------------------- |
| `--background`                             | Grafite de fundo                                  |
| `--card`, `--popover`, `--muted`           | Trabalho, painel elevado e agrupamento opacos     |
| `--foreground`, `--muted-foreground`       | Texto principal e secundário legíveis             |
| `--border`, `--input`                      | Divisores e contornos essenciais distintos        |
| `--primary`, `--ring`                      | Verde NEXUS aprovado e foco                       |
| `--warning`, `--destructive`, `--info`     | Atenção, erro e informação, acompanhados de texto |
| `--nx-space-*`                             | Escala de 4, 8, 12, 16, 24 e 32 px                |
| `--nx-radius-control`, `--nx-radius-panel` | 8 e 12 px                                         |
| `--nx-motion-control`, `--nx-motion-panel` | 140 e 200 ms                                      |
| `--nx-paper`, `--nx-ink`                   | Documento comercial claro e tinta escura          |

Não há importação adicional de fontes: a folha já carregada usa `display=swap`, Saira e Barlow, incluindo português. Pesos globais usados por marca e outros módulos são preservados.

## Componentes e contratos de apresentação

- `AppShell`: navegação global estável, 240 px, menu móvel com foco gerenciado, salto para conteúdo e cabeçalho sólido.
- `Page`: títulos, seções, feedback e tabela com cabeçalhos associados, rolagem sinalizada e acionamento por teclado. Campos/links/checkboxes internos não acionam seleção da linha.
- `Workspace`: contexto da revisão, régua das oito rotas existentes e estado de salvamento confirmado pelo contexto existente.
- Editores e etapas usam os mesmos dados e callbacks da base. Inspecionar, abrir/fechar e agrupar são estados locais de apresentação.

### Edição e inspeção

`EditorWorkspace.tsx` concentra o inspetor contextual, `EditorInput` e `EditorSaveState`. O inspetor mantém uma única instância do formulário: painel lateral em telas amplas e diálogo opaco nas menores. Ao redimensionar, conserva o mesmo campo e rascunho; ao fechar, devolve o foco ao disparador. O indicador “Edição local” identifica texto ainda no controle, sem se confundir com confirmação do servidor. Os callbacks originais continuam responsáveis por blur, validação e gravação.

`CommercialItemRow.tsx` separa a leitura da edição. Código, descrição completa, fornecedor e valores adotados permanecem legíveis na linha; o botão “Editar / ver preço” abre os controles na mesma rota. A seleção em lote exibe apenas ações já existentes. A memoização é restrita à apresentação das linhas e à formatação já utilizada, sem consultas adicionais nem cópia do motor de cálculo.

No Dimensionamento, “Composição” conecta o sistema selecionado aos componentes. Os rótulos “m/trecho”, “trechos” e “m instalados” seguem o tipo e os valores atuais. As confirmações e justificativas síncronas existentes permanecem nos handlers originais, preservando o significado de entrada vazia, cancelamento e momento de gravação.

### Etapas, documentos e cadastros

`OperationalDetails.tsx` reúne três componentes sem consultas próprias. `ValuesBand` recebe somente valores já formatados do resultado canônico, distingue o último cálculo desatualizado e reserva maior peso tipográfico ao total. `RecordIdentity` organiza identificação e contexto sem truncar descrições. `PromptAction` usa Dialog/Radix com retorno de foco e entrega `string | null` ao callback existente, preservando confirmação vazia versus cancelamento; não valida nem grava por conta própria.

Em `Etapas.tsx`, Orçamento conserva as duas visões e as condições de permissão de custo. Compras/Produção mantêm a geração indisponível antes do aceite e tornam o impedimento visível fora de tooltip. Parâmetros usa quatro fieldsets com os mesmos 22 campos, validações e salvamento de 800 ms; erros continuam abertos, identificam o controle e o feedback vem do contexto de gravação existente. Histórico usa uma cronologia compacta sem inferir autor ou inventar comparação.

O resumo usa papel opaco (`--nx-paper`) e tinta (`--nx-ink`), com controles de emissão e edição fora do artigo e da impressão. A visão comercial/interna mantém a permissão original. A impressão ainda representa a visão corrente, sem reconstrução do snapshot de documentos emitidos; essa limitação aparece junto ao controle em revisões não rascunho.

As telas de OC/OP usam o mesmo callback para recebimento/apontamento e preservam criação/reutilização de chave idempotente na mutation. Os diálogos apenas substituem o prompt de quantidade. O prompt do Histórico também entrega o motivo ao mesmo teste de tamanho e mutation. As sequências nativas de prompts em Clientes e no registro de novo custo do Catálogo foram preservadas: seus cancelamentos intermediários atualmente significam campos opcionais vazios, e converter essas sequências não foi tratado como autorização para mudar essa semântica.

`stages.css` permanece sob `.nexus-operational`. Estiliza a faixa de investimento, linhas de identidade, filtros com labels persistentes, formulários de cadastro, ficha de produto, cronologia e documento. Tabelas mantêm rolagem horizontal interna e a mesma lista de registros; informações agrupadas não são removidas.

## Validação

Evidências, resultados e limites estão em [validation-nexus.md](validation-nexus.md). O laboratório isolado importa os componentes reais e substitui apenas dependências externas durante testes. Isso valida apresentação e interações locais, sem constituir homologação autenticada, validação de banco ou confirmação de latência de gravação.
