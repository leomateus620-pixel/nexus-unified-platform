# PET mobile com preenchimento por toque (EC 28 · SA 05)

## Objetivo
Ao abrir Segurança ou Atmosfera no celular, o operador vê o nome da etapa e o primeiro grupo de controles sem rolar, escolhe perigos, medidas, procedimentos, agentes e instrumentos tocando na tela, e digita só a medição real e as exceções.

## O que muda para o usuário

1. **Topo compacto da PET (celular)**
   - Uma faixa com EC, estado da PET e retorno ao silo.
   - Uma linha de progresso com a contagem real do fluxo ("3 de 6 · Segurança") e o botão "Ver etapas". Ele abre uma folha inferior com a lista de etapas e a situação de cada uma: Concluída, Atual ou Pendente.
   - A faixa horizontal de etapas, que hoje fica cortada, sai no celular e continua no desktop.
   - Rodapé fixo na área visível, com "Salvar e continuar" como ação principal e Salvar e Voltar ao lado. Ele mostra Salvando, Salvo ou o erro real.

2. **Segurança por seleção**
   - Perigos sugeridos aparecem em grupos recolhíveis: atmosfera, energias perigosas, engolfamento/soterramento, acesso e queda, temperatura/agentes físicos e outros.
   - Cada perigo indica se já estava previsto na avaliação de riscos ou se foi identificado na entrada.
   - Cada perigo selecionado tem "Adicionar medidas", com os controles daquele perigo exibidos como chips removíveis.
   - Cada medida começa como **Pendente** e pode passar a Confirmado em campo, Condição impeditiva ou Não se aplica (este com justificativa).
   - "Outro perigo" e "Outra medida" pedem texto e motivo.
   - Medidas pendentes ou impeditivas aparecem na Conferência.

3. **Atmosfera por linhas prontas**
   - Os agentes exigidos pelo modelo aparecem como linhas: agente em uma linha e, abaixo, "Valor medido" com a unidade fixa do modelo (% vol, % LIE, ppm).
   - O valor começa vazio, abre o teclado decimal e aceita vírgula e zero. Não há conversão entre unidades.
   - Instrumento, ponto de amostragem e hora da coleta são escolhidos de opções cadastradas, quando o modelo prevê.
   - A leitura antes da entrada fica separada do monitoramento contínuo.

4. **Procedimentos por seleção**
   - Grupos: Controle de energias, Ventilação e monitoramento, Comunicação, Emergência e resgate e Trabalho em altura (quando aplicável).
   - Cada grupo mostra nome e revisão do documento, "Ver procedimento" com volta à mesma etapa e a verificação registrada separadamente.
   - Observações ficam disponíveis para exceções.

5. **Bloco NR-35**
   - Aparece só quando a atividade ou a análise de risco indicar trabalho em altura.
   - Liga a AR, o procedimento e a PT sem mudar a natureza da PET.
   - Abrir pelo menu NR-35 ou tocar num silo não ativa o bloco por si só.

## Limites
- **Catálogo:** perigos, medidas, procedimentos e limites vêm do modelo aprovado da unidade. Hoje não há modelo PET aprovado nem RT designado para a COTRIROSA, então:
  - na **Demonstração**, o catálogo é de exemplo, marcado como "Catálogo de demonstração — não validado tecnicamente";
  - na **Operação**, sem modelo aprovado a tela mostra "Modelo aprovado ausente" e nada é inventado.
- **Medições:** nenhuma medição vem preenchida, nem do catálogo, nem de PET anterior, nem da demonstração. Nenhum limite de teste vira padrão.
- **Emissão e entrada:** as regras continuam no servidor. Seleção não confirma execução, não inspeciona ancoragem e não libera entrada.

## Detalhes técnicos
- **Demonstração** (`demo/domain.ts`, `PetDemoWorkspace.tsx`):
  - `perigos`, `medidas` e `procedimentos` passam a aceitar a forma estruturada (perigo → medidas com estado e justificativa) mantendo a forma antiga em texto. Rascunhos antigos são convertidos na leitura em "Outro perigo" e "Outra medida", e o texto não se perde.
  - `leituras` ganham agente vindo do catálogo, unidade fixa, `valor` como texto decimal pt-BR com a precisão informada, instrumento, ponto e horário.
  - O validador SQL `pet_demo_validar` ganha uma migration nova, compatível com os rascunhos antigos.
- **Operação** (`PetEditor.tsx`, `PetOperations.tsx`): reaproveita os perigos sugeridos, os registros ligados às medidas e as leituras do modelo aprovado. Entra apenas a camada visual compartilhada; os contratos do servidor ficam iguais, salvo onde já existir campo para estado e justificativa.
- **Componentes compartilhados novos** em `src/features/pet/mobile/`:
  - `PetStepProgress` (progresso + folha "Ver etapas");
  - `HazardMeasurePicker` (perigo → medidas);
  - `ReadingRow` (agente/valor/unidade empilhados);
  - `ProcedurePicker`;
  - `BottomSheetSelect` (busca acima de 8 opções, lista aberta nas listas curtas).
- **Layout** (`mapa.css` e `pet-*.css`):
  - grade com cabeçalho e rodapé de altura própria e corpo `minmax(0,1fr)` como único responsável pela rolagem;
  - altura baseada em `100dvh` e `visualViewport` para o teclado, com `env(safe-area-inset-*)`;
  - folga no fim do corpo para o último campo;
  - alvos de 44 px e fonte de 16 px nos campos.
- **Foco:** o erro relevante recebe foco no "Salvar e continuar". O rascunho é preservado na troca de orientação, no teclado e no retorno do visualizador. Os dados ficam no rascunho e em `sessionStorage` só durante falha de rede, nunca como fonte oficial.
- **Testes:**
  - vitest: conversão de rascunho antigo, vírgula/zero/unidade incompatível, medida começando Pendente, NR-35 só por AR;
  - Playwright em 320, 375 e 390 px e em paisagem: Segurança e Atmosfera com a etapa e a primeira ação visíveis sem rolar, e rodapé alcançável;
  - rota operacional direta e Mapa 3D (EC 28).
- Safari iOS e Chrome Android reais ficam pendentes de aparelho físico, porque só há emulação. Emissão e entrada são testadas apenas com registros de teste.
