# Padronização da barra lateral NEXUS

## Objetivo

Manter uma única barra lateral Cyber-Industrial em todas as áreas do sistema, sem alterar o conteúdo, os submenus ou as particularidades de cada página.

## Diagnóstico confirmado

A barra muda porque o contêiner principal classifica apenas algumas rotas como “operacionais”. Nessas rotas, ele ativa outra marca, outras medidas e regras tipográficas; a Dashboard fica fora dessa classificação e recebe a variante antiga.

## Implementação

- Remover da barra lateral a variação visual baseada na rota atual.
- Aplicar a mesma estrutura, largura, tipografia Saira/Barlow, espaçamentos e cores em Dashboard, Comercial e demais módulos autenticados.
- Adotar a direção Cyber-Industrial escolhida: fundo verde quase preto, divisores precisos, logo NEXUS nítida com X neon, grupos compactos e seleção ativa com linha verde.
- Preservar todos os menus, ícones, ordem, links e regras de destaque da página ativa.
- Usar a mesma identidade no menu móvel, mantendo abertura, fechamento e navegação acessíveis.
- Manter os estilos específicos de conteúdo somente nas páginas que já os utilizam; nenhuma tela interna será redesenhada.

## Validação

- Conferir Dashboard e Comercial lado a lado para garantir barra, logo e tipografia idênticas, variando somente o item ativo.
- Conferir ao menos uma rota de cada grupo de menu e uma página interna de proposta.
- Validar desktop e celular, incluindo rolagem do menu e abertura/fechamento móvel.
- Confirmar que navegação, autenticação, dados e conteúdo das páginas permanecem inalterados e que a aplicação continua sem erros.
