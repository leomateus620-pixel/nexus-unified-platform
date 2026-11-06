# Modo dedicado de preenchimento da PET

## Objetivo
Quando o usuário estiver preenchendo uma PET, ele poderá abrir a PET em tela dedicada. Só fica visível o cabeçalho branco principal (Workspace, norma, cliente, unidade, troca de norma e conta). O restante da altura vai para o formulário.

## O que muda na tela
- **Novo botão "Tela dedicada"** na barra "Nova PET · Demonstração" e na PET operacional, ao lado de "Histórico do silo".
- **Em tela dedicada, somem:**
  - o card do equipamento (EC, título, aliases, enquadrar/minimizar/fechar);
  - as abas Visão geral · Acervo · PET · Histórico;
  - a faixa "Referências e limites da implantação" no rodapé da página.
- **Uma barra fina da PET concentra:**
  - EC 24 · Silo pulmão externo — SA 01 (resumido);
  - etapa atual;
  - Histórico do silo;
  - "Sair da tela dedicada".
- **Formulário:** as etapas ficam à esquerda no desktop e no topo compacto no celular. O conteúdo ocupa toda a largura e altura entre o cabeçalho principal e o rodapé Voltar / Salvar / Salvar e continuar. O rodapé fica sempre fixo e visível, também com o teclado aberto no celular.
- **Sair da tela dedicada** (botão ou Escape, quando nenhum menu estiver aberto) volta à ficha expandida na mesma etapa, sem perder o que já foi preenchido.

## Comportamento
- O modo fica registrado no endereço da página. Recarregar ou compartilhar o link abre a PET já em tela dedicada.
- Vale para NR-33 e NR-35, na demonstração e na PET operacional. A demonstração continua identificada e separada da operação real.
- Ao trocar de norma, cliente ou unidade, o modo é encerrado.

## Validação
- Desktop 1440×900 e 1280×720; celular 390×844 e 320×640.
- Conferir que só o cabeçalho principal aparece, que não há rolagem lateral e que o rodapé Salvar fica alcançável.
- Conferir que sair volta à mesma etapa e mantém o rascunho.
- Medir quantos pixels de formulário a mais aparecem, antes e depois.

## Detalhes técnicos
- Novo parâmetro `ficha=pet-foco` (ou `foco=pet`) em `src/features/nr/route-state.ts`, com testes de links antigos.
- `UnitMapPanel.tsx` deixa de renderizar `.unit-map-panel-top` e as abas quando estiver em foco. `UnitMapWorkspace.tsx` oculta o `<details>` de referências e aplica a classe `is-pet-focus`.
- Grid em `mapa.css`: cabeçalho da PET (auto), conteúdo (`minmax(0,1fr)`), rodapé (auto), com altura `100dvh` menos a altura real do shell. O canvas continua montado e inativo.
- O botão é adicionado em `PetDemoWorkspace.tsx` e em `PetEditor.tsx`. O foco retorna ao botão de origem ao sair.
