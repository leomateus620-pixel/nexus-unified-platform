# Refinar o formulário de cadastro de item (direção "Precisão industrial")

## Objetivo

Aplicar a direção visual escolhida ("Precisão industrial") ao editor de produto compartilhado (`ProductEditor`), usado em Itens Comerciais e em Produtos e Soluções. Somente apresentação: nenhuma regra de negócio, campo, validação ou fluxo de salvamento muda.

## O que muda visualmente

1. **Cabeçalho do formulário** — título "Cadastro de Item Comercial" (ou "Editar cadastro" na edição) em Saira, maiúsculo, com faixa separadora, dando identidade de ficha técnica.
2. **Seletor de tipo** — os três botões (Peça / Conjunto soldado / Montagem) viram cartões com hierarquia clara: nome em destaque, selo pequeno com o apoio (ex.: "CJ SD") e linha de apoio em maiúsculas; o selecionado recebe borda e fundo em `primary` com anel suave.
3. **Identificação** — família e prévia de código lado a lado; a prévia do código vira um bloco escuro de destaque (fundo `foreground`, código em verde `primary` mono, etiqueta "PRÉVIA"), reforçando que o número é gerado e confirmado só ao salvar.
4. **Campos** — rótulos em Saira, maiúsculos, tamanho reduzido e espaçamento de letras; inputs com altura e respiro maiores, foco com anel em `primary`; unidade centralizada; custo com prefixo "R$" dentro do campo.
5. **Detalhes complementares** — a seção colapsável vira um cartão com cabeçalho próprio (seta que gira ao abrir, legenda "Ver mais campos" quando fechado) e grade de campos alinhada.
6. **Composição do produto** — mesma linguagem de cartão: título em Saira, opções de custo (composto/completo) como escolha clara, lista de componentes com linhas divisórias e busca em campo amplo.
7. **Barra de ações** — rodapé com fundo `muted`, separador superior, botão salvar em `primary` em maiúsculas com espaçamento de letras, cancelar discreto, mensagens de sucesso/erro mantidas.

## Restrições

- Tipografia Saira (títulos/rótulos) e Barlow (corpo) mantidas — já carregadas no projeto.
- Somente tokens semânticos (`primary`, `foreground`, `muted`, `border`, `input`, `card`); nenhuma cor fixa em hexadecimal nos componentes. Se faltar um token, ele é adicionado em `src/styles.css`.
- Nenhuma mudança em lógica, permissões, RPCs ou textos funcionais (avisos de permissão, erros e estados de salvamento permanecem).
- Acessibilidade preservada: `aria-pressed`, `aria-live` na prévia, labels associados, navegação por teclado.

## Detalhes técnicos

- Arquivo principal: `src/features/catalogo/ProductEditor.tsx` (reestruturação do JSX e das classes; classes utilitárias `input`/`btn` atualizadas).
- Possível ajuste pontual em `src/styles.css` apenas se um token semântico necessário não existir.
- Verificação: typecheck, build e conferência visual no preview em Itens Comerciais (cadastro novo) e na ficha de um produto (edição), incluindo o sub-cadastro de componente.
