# Mapa 3D NR-33/NR-35 — cabeçalho único e ficha expandida

Cenário de validação: COTRIROSA · Fábrica de Ração — Santa Rosa · EC 26 Silo pulmão externo — SA 03.

## 1. Reprodução (antes)
- Medir na prévia autenticada, em 1440×900, 1280×720, 390×844 e 320×640, NR-33 e NR-35: altura das duas barras, altura do topo da ficha expandida e distância topo da viewport → primeiro documento em Acervo → Documentos.
- Ponto de partida: `tests/cotrirosa/validate-ui.mjs`, só leitura em produção.
- Observação: uma regra anterior do projeto proibia Playwright. A captura de tela pedida agora depende dele. Vou usá-lo apenas para esta validação, salvo orientação contrária.

## 2. Cabeçalho branco único (AppShell)
- Criar um slot de contexto no shell (`MapHeaderContext` em provider dentro do AppShell) que a rota do Mapa 3D registra ao montar e limpa ao desmontar, ao trocar cliente/unidade e ao perder acesso. Ele recebe chaves `cliente/unidade/norma` e só é exibido quando corresponde à rota atual, sem mostrar nomes antigos.
- Ordem: menu (celular) · Voltar à unidade · Workspace · cards Norma / Cliente / Unidade (unidade flexível, truncada, com o nome inteiro disponível por toque e teclado via botão/popover) · troca de norma · conta.
- Fundo branco por tokens semânticos, borda inferior discreta, cards com borda leve. Altura de 56–64 px no desktop; no celular, até 2 linhas, com código da norma (NR-33) e nome completo no grupo, alvos ≥44 px e `env(safe-area-inset-*)`.
- Remover `.unit-map-header` do `UnitMapWorkspace`. Manter o h1 semântico (sr-only ou no card) e o link de salto.
- Troca de norma usa a navegação existente e preserva cliente, unidade e câmera. O local e o recorte de destino são validados antes de restaurar a seleção.
- Revisar os descontos fixos em `mapa.css` (`calc(100dvh - 152px/143px)`) e trocá-los por grid de altura real: shell `100dvh` → header auto → mapa `minmax(0,1fr)`.

## 3. Ficha expandida horizontal (`UnitMapPanel`)
- Painel expandido ocupa toda a largura do workspace. O layout é um grid de 3 linhas: card de identidade (auto), abas (auto) e conteúdo `minmax(0,1fr)` com rolagem própria.
- Card de identidade com alvo ≤88 px:
  - à esquerda: tag EC 26, título, aliases em linha secundária e o selo Demonstração só no fluxo demo;
  - à direita: botão PET em tamanho de barra de ferramentas (Iniciar, Continuar ou Abrir, conforme o estado e as permissões), e Enquadrar, Minimizar e Fechar com ícones e `aria-label`.
- Remover o `max-width: 560px` do intro no modo expandido. `PetDemoEntry` ganha uma variante `toolbar` explícita.
- Abas Visão geral · Acervo · PET · Histórico em uma faixa única. No celular, só essa faixa rola na horizontal, e a aba ativa usa `scrollIntoView`.
- Celular: ficha quase em tela cheia abaixo do cabeçalho, identidade e ações em até 2 linhas, título quebra em vez de truncar.
- Com o editor PET aberto, o corpo externo não cria uma segunda rolagem e o rodapé continua alcançável com teclado virtual (`dvh`/`visualViewport`).
- O canvas permanece montado e inativo por trás da ficha. Minimizar preserva a seleção e o enquadramento.

## 4. Conteúdo por aba
- `NrLocalDetail` ganha `variant="mapa-acervo"` (ou extração de `NrLocalAcervo`). A variante não repete identidade/unidade nem a navegação de 8 itens. Mostra primeiro o título "Documentos vinculados ao local" com a contagem e, logo abaixo, a lista. Documentos/Fotos ficam num controle segmentado compacto. "Documentos contratados" vira um expansível junto ao título. A consulta à outra norma fica junto ao título. Mesmas consultas, ações e estados vazio/erro/sem permissão.
- Visão geral: identificação e resumo técnico primeiro. Geometria, Itens de avaliação, Memorial, Resgate e Abrir levantamento ficam na navegação técnica, com o histórico técnico rotulado.
- Histórico: seções separadas "Histórico de PET" e "Histórico técnico e operacional".
- A ficha acessada pelo inventário (`/locais/:id`) fica inalterada (variante padrão).

## 5. Estado, teclado e foco
- `route-state.ts` continua sendo o contrato. Testes cobrem links antigos e combinações de `painel/ficha/visualizacao/petDemo/etapaDemo/retorno`.
- Esc: fecha primeiro menus e diálogos internos, depois minimiza. O foco volta ao controle de origem.

## 6. Validação e entrega
- Testes unitários de normalização do route-state e do registro/limpeza do contexto do cabeçalho.
- Ampliar `validate-ui.mjs`: matriz de viewports × normas × 4 abas, ausência de rolagem lateral, primeiro documento visível sem rolagem, card ≤88 px, nomes acessíveis, Esc/foco, recarregar/Voltar.
- Entregar: link da prévia, capturas antes/depois (mesma viewport, norma, EC e aba), ganho em px CSS até o primeiro documento e casos dependentes de fixture ou de aparelho físico (teclado virtual real).

## Arquivos
`AppShell.tsx`, novo `nr/mapa/MapHeaderContext.tsx`, `UnitMapWorkspace.tsx`, `UnitMapPanel.tsx`, `mapa.css`, `NrLocalDetail.tsx` (variante), `PetDemoPanel.tsx` (variante toolbar), `tests/cotrirosa/validate-ui.mjs` e testes do route-state.
