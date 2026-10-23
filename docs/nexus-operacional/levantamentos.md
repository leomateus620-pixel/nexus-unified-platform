# Levantamentos Técnicos — evolução em andamento

## Auditoria da experiência existente

Product Design aplicado ao código existente, sem novo template. Captura CUA no navegador integrado em 22/10/2026, laboratório local `/?page=levantamentos`, usando a rota real e sessão de teste isolada. Não é jornada autenticada conectada. Dimensões CSS conferidas no DOM: 1440×900 e 390×845.

1. **Lista inicial — bloqueada para operação.** [Desktop antes](evidencias/levantamentos/01-antes-desktop.jpg) e [celular antes](evidencias/levantamentos/02-antes-mobile.jpg): cabeçalho e navegação legíveis; o único conteúdo é “Integração não configurada”. Não há cadastro, coleta ou revisão. Impacto estrutural alto em todo levantamento.
2. **Cadastro/coleta/revisão — indisponíveis.** Sem controles para percorrer essas etapas, não foi possível avaliar seus estados de erro, salvamento, teclado ou persistência na baseline. Ausência de implementação não foi atribuída a uma integração externa.

Prioridade: implementar uma jornada contínua a partir do cadastro canônico de cliente/unidade/pessoa, preservar medições e evidências por revisão e diferenciar coleta, estimativa e aprovação. Padrões compartilhados já verificados de formulário, foco, erro recuperável e navegação são a referência visual. As verificações posteriores serão registradas separadamente.

## Limite acordado

Validação local autorizada pelo usuário. Fixtures pertencem aos testes/laboratório e ao PostgreSQL descartável. E2E Auth/Storage HTTP conectado não comprovado. Nenhum critério normativo, periodicidade legal ou certificação é inferido pelo cadastro do levantamento.

## Verificação do fluxo implementado

1. **Lista — utilizável no laboratório.** Busca e estado mantidos na URL, identificação por código, cliente/unidade e responsável; ação de criação conforme capacidade. [Desktop depois](evidencias/levantamentos/03-depois-lista-desktop.jpg), nas mesmas dimensões da baseline. Persistência é exercitada separadamente no banco local.
2. **Cadastro — validação recuperável.** Seletores canônicos dependentes e seções opcionais; erros junto aos campos, foco no resumo e preservação ao falhar. Formulário fixa a versão aberta: refetch concorrente não permite sobrescrever uma edição mais nova.
3. **Coleta — área de trabalho móvel.** [Celular depois](evidencias/levantamentos/04-coleta-mobile.jpg): contexto recolhível e pontos em sequência; seleção leva ao editor e permite voltar aos pontos. Medidas distinguem confirmado/estimado e arquivos distinguem pendente/confirmado.
4. **Revisão e adoção — regras separadas.** Devolução exige motivo; aprovação registra profissional e snapshot. Adoção apresenta comparação e altera somente um rascunho compatível pela trava existente; não certifica medição nem recalcula fora do motor canônico.

Os testes de interface cobrem 30 combinações de padrão/largura e dez comportamentos, sem overflow observado. Regressão completa também passou. [Resultados e limites](levantamentos-tecnicos/validacao.md) discriminam UI isolada, banco real local e verificação de schema conectado. Capturas não demonstram teclado virtual físico, leitor de tela ou acessibilidade integral.
