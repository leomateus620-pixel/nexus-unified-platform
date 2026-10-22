# Qualidade de produto: evidências e padrões

Skill utilizada: Product Design (`index`, `user-context`, `audit` e orientações de revisão). Não há contexto visual salvo do plugin. O alvo é o código existente; nenhum novo aplicativo ou template foi inicializado.

## Captura e alcance

O laboratório isolado renderiza os componentes reais da aplicação com fronteiras de rede substituídas e fixtures somente em `tests/ui`. Isso permite inspecionar layout e interação, sem comprovar persistência Supabase, sessão remota, desempenho de produção ou dispositivo físico.

Baseline de código extraído de `820c79d` em pasta temporária, sem modificar o checkout compartilhado. O adaptador baseline recebeu apenas os exports ausentes que impediam renderização. A biblioteca pública também pode ser inspecionada no servidor normal; suas cenas não foram editadas.

Dimensão solicitada ao navegador e dimensão efetiva em CSS px são conferidas via DOM. O controle de viewport do navegador embutido aplica escala; as primeiras capturas de 330/342 px estão nomeadas pela dimensão observada. Comparações novas usam dimensões efetivas correspondentes, sem alegar equivalência com screenshots de telefone enviados anteriormente.

## Achados priorizados

| Prioridade / tipo   | Evidência atual                                                                                 | Impacto e resposta                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Alta / estrutural   | Menu móvel baseline exige rolagem extensa para chegar aos grupos finais                         | Busca por nome/finalidade e grupos recolhíveis; item atual preservado no grupo                                 |
| Alta / interação    | Unidades/contatos usavam `window.prompt`                                                        | Formulários rotulados com validação, conflito de versão, recorte preservado e edição recuperável               |
| Alta / interação    | Laboratório não renderizava por adaptador desatualizado                                         | Corrigir fronteira de teste e registrar falha original; fixture não passa a ser prova de backend               |
| Alta / privacidade  | Papel ausente/desconhecido abria navegação; custo inferido por qualquer papel distinto de campo | Concessões explícitas, matriz de ações e revogação de cache/estado local                                       |
| Alta / recuperação  | Upload interrompido podia criar pendentes duplicados                                            | Retomar identidade do arquivo, validar bytes e confirmar armazenamento antes de mostrar sucesso                |
| Média / estrutural  | Biblioteca apresenta dois cards extensos e um acesso com formato diferente                      | Grid responsivo, busca e estruturas de acesso alinhadas, sem importar ou alterar cenas                         |
| Média / refinamento | Marca e espaçamentos dos grupos consomem altura do drawer                                       | Padding menor, altura confortável de controles e grupos compactos                                              |
| Alta / consistência | Tema comercial alterava altura/cor do cabeçalho e largura do rail                               | Frame com dimensões/paleta próprias; conteúdo comercial claro preservado; paridade medida em quatro workspaces |
| Média / área útil   | Ficha vazia de Pessoas ocupava quase metade da listagem desktop                                 | Lista usa largura inteira até selecionar um registro; retorno recupera foco e mantém o recorte                 |
| Média / orientação  | Cards usavam apenas seta e busca se perdia na recarga                                           | Ação textual “Abrir visualização”, nome acessível e busca na URL da biblioteca                                 |

## Contrato de apresentação aplicado

Cabeçalho compacto, ação específica, busca e poucos filtros; lista e detalhe com vínculo real; formulários com labels permanentes e unidades junto aos campos; zero, ausência, falha e processamento tratados separadamente. Pessoas sem usuário permanecem pessoas operacionais. Versões congeladas de engenharia são identificadas como congelamento editorial, sem alegação de aprovação técnica.

Feedback de salvamento depende do retorno do servidor. Chaves estáveis permitem retry com o mesmo conteúdo; mudança de conteúdo usa outra operação. Conflitos preservam o preenchimento para comparação. Arquivos confirmados e arquivos pendentes têm rótulos diferentes. Percentuais de upload não são simulados.

Tokens OKLCH e componentes existentes foram mantidos. O shell mantém a mesma identidade entre rotas; o workspace pode ter suas superfícies próprias. Ícones usam Lucide. Novos diálogos usam Radix, foco visível e aviso antes de descartar formulário alterado.

## Verificação executada

`npm run test:ui:operacional` passou: 36 combinações (seis larguras × Pessoas, Clientes, Ações, Projetos de Engenharia, biblioteca e Configurações), sem overflow da página, nove verificações de comportamento e sete pares de contraste. O teste usa componentes reais e fixtures isoladas; não é E2E do banco conectado.

Verificados foco no primeiro campo/erro, Escape e retorno ao acionador, confirmação de descarte, preservação de formulário após erro, falha distinta de vazio, busca do menu, busca da biblioteca após recarga, erro de salvamento ao lado da ação em engenharia e paridade do frame entre Pessoas, Dimensionamento, Produtos e OC. Conferidos formulário a 390 × 480 px e simulação de texto a 200% (não equivale a teclado físico/zoom nativo). Resultado completo: [results.json](evidencias/ui-final/qualidade-operacional/results.json).

Pares medidos em Chromium: texto/base 17,13:1; auxiliar/card 9,83:1; ação principal 8,98:1; acento/card 8,11:1; erro/superfície 6,75:1; foco/base 9,14:1; input/card 4,76:1. Isso verifica os pares selecionados, não certifica WCAG completa ou todos os estados possíveis.

Comparação CUA em **390 × 845 CSS px**, mesma fixture e origem de fonte: [menu antes](evidencias/04-menu-before-390.png) / [depois](evidencias/10-menu-after-390.png); [workspace comercial antes](evidencias/11-workspace-before-390.png) / [depois](evidencias/12-workspace-after-390.png). Os dados e controles comerciais foram preservados, com cabeçalho constante. As telas novas não possuem equivalente funcional na baseline; suas capturas demonstram o estado implementado, sem comparação fictícia.

Capturas finais de desktop/celular: [Pessoas 1366](evidencias/ui-final/qualidade-operacional/equipe-1366.png), [Clientes 390](evidencias/ui-final/qualidade-operacional/clientes-390.png), [editor 390](evidencias/ui-final/qualidade-operacional/projetos-engenharia-390.png), [biblioteca 1366](evidencias/ui-final/qualidade-operacional/mapas-library-1366.png). A revisão visual humana dessas amostras complementa as medições automatizadas.

No desktop há também comparação no mesmo **1440×900**: [workspace antes](evidencias/13-workspace-before-1440.png) / [depois](evidencias/14-workspace-after-1440.png). A regressão UI completa encerrou exit0 após as alterações, incluindo catálogo, revisões e autosave. Relatórios detalhados e limites estão em `validacao.md`.

Permanecem sem comprovação: teclado virtual de dispositivo real, leitores de tela reais, testes físicos iOS/Android, desempenho de campo, 10 mil registros/anexos reais e persistência Auth/Storage pelo frontend conectado. Os módulos ainda sem backend operacional não foram apresentados como jornadas concluídas.
