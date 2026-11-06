# PET abre em tela dedicada por padrão

## O que muda
- Ao tocar em **Iniciar PET**, **Continuar PET** ou **Abrir PET** (pelo mapa, pela ficha ou pelo histórico do silo), a PET já abre em tela dedicada.
- O botão **Sair da tela dedicada** e a tecla Esc continuam levando à ficha expandida, na mesma etapa.
- Voltar ao **Histórico do silo** dentro da PET sai da tela dedicada e mostra a ficha expandida com as abas, para que a lista de PETs não fique sem navegação.
- Abrir a ficha, o Acervo ou a Visão geral continua como hoje (expandida, sem tela dedicada).

## Detalhes técnicos
- `UnitMapPanel.tsx`: `open()` (linha ~111) e o botão "Abrir PET" (linha ~166) passam a usar `visualizacao: "dedicada"`.
- `PetDemoPanel.tsx` (linha ~87): ao abrir ou continuar uma PET pela lista, usar `"dedicada"`.
- `PetDemoWorkspace.tsx`: o botão "Histórico do silo" também define `visualizacao: "expandida"`.
- Validar no EC 24 e no EC 28 (desktop e celular) que iniciar uma PET mostra só o cabeçalho principal e o formulário.
