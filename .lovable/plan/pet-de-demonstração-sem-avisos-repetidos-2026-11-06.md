# PET de demonstração sem avisos repetidos

A PET de demonstração passa a funcionar como um fluxo completo e limpo, sem textos de alerta repetidos em cada campo.

## O que sai da tela
- O aviso "Catálogo de demonstração — não validado tecnicamente" acima de Perigos e de Procedimentos.
- O selo "Não verificado" repetido ao lado de cada item ainda não respondido. O item continua sem resposta marcada, e a Conferência mostra as pendências.
- Na lista de pendências, o texto vira "Item: responder" em vez de "Item: não verificado".

## O que fica
- Um único selo "Demonstração" no topo da PET, para não confundir com uma PET real. Se você preferir, ele também pode sair.
- As regras do fluxo: um "Não" impede a entrada, "Não se aplica" pede justificativa e O₂ fora de 19,5–23 % bloqueia.
- O botão "Não verificado" continua como opção de resposta, mas não aparece mais escrito em cada linha.

## Detalhes técnicos
- `PetDemoWorkspace.tsx`: remover os dois usos de `DEMO_CATALOGO_AVISO` (o `aviso` passado ao seletor e o `<p className="pet-hz-aviso">`).
- `mobile/FichaChecklist.tsx`: remover o span `pet-fc-nv`.
- `cotrirosa-ficha.ts`: trocar o texto das pendências NV por "responder" e ajustar os testes que conferem esse texto.
- O comentário de código em `demo/catalogo.ts` fica, porque não aparece na tela.
