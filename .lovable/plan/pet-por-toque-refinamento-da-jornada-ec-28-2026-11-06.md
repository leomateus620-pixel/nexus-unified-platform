# PET por toque — refinamento da jornada EC 28

A PET de demonstração já tem perigos por grupo, checklist da ficha, dois testes e contatos. Este plano completa a experiência por toque pedida, sem mudar as regras do fluxo. A digitação fica só para leituras, tempo de ventilação e descrições de exceção.

## 1. Perigos
- Os cinco grupos da ficha aparecem sempre como blocos expansíveis, cada um com o contador de selecionados ("Químicos · 2"). Hoje eles ficam escondidos atrás de "Adicionar perigo".
- "Outro perigo" fica ao final, com descrição curta.
- Cada perigo escolhido aparece numa linha com um seletor de toque "Previsto na avaliação / Identificado na entrada" e o botão **Adicionar medida** na mesma linha.

## 2. Medidas e EPC/EPI
- **Adicionar medida** abre primeiro as medidas ligadas àquele perigo, e "Ver todas as medidas aplicáveis" mostra o restante, com busca opcional.
- A medida escolhida aparece como **Prevista**. A confirmação em campo começa sem resposta, e é feita separadamente, com Sim / Não / Não se aplica.
- No checklist EPC/EPI, cada item é uma linha com botões grandes. Justificativa ou evidência abre logo abaixo do item quando a resposta exige.
- O estado aparece com ícone e texto (respondido, pendente, impeditivo), não só com cor.

## 3. Antes da entrada
- A etapa fica em quatro grupos: **Teste inicial**, **Bloqueio, purga e ventilação**, **Teste após ventilação e isolamento** e **Demais verificações**.
- No topo aparece o andamento: "4 de 7 verificações obrigatórias respondidas · 1 impedimento", com o botão **Ir para pendências**, que abre o grupo certo e destaca o item.
- Cada teste tem um resumo com horário, responsável e situação (Completo, Incompleto ou Bloqueado). Aparelho, tipo de ventilação e equipamento são escolhidos por botões. Leitura e tempo usam teclado decimal, com agente e unidade ao lado.
- Se a ventilação mudar, o teste após ventilação é marcado como "conferir novamente".

## 4. Durante o trabalho
- A etapa fica em cartões: **Monitoramento**, **Trabalho a quente**, **Emergência e resgate** e **Ocorrências**.
- A situação do monitoramento e os impedimentos aparecem acima do histórico.
- **Ver plano e contatos** abre num toque uma janela com o plano de resgate e os contatos (SAMU 192, Bombeiros 193 e os da unidade, quando houver).
- O tipo de ocorrência é escolhido por botões. As ações seguem o estado da PET.

## 5. Layout e persistência
- No celular, uma coluna com alvos de 44 px. No desktop, a partir de 1024 px, o rótulo fica à esquerda e as respostas à direita.
- As escolhas são mantidas ao trocar de etapa ou voltar de um documento (já ficam no rascunho). Se o salvamento falhar, o preenchimento continua na tela para nova tentativa.

## 6. Verificação
Na demo do EC 28, a 375 px e a 1280 px, vou:
- selecionar um perigo e associar uma medida;
- responder dois controles;
- registrar o teste inicial;
- deixar um item pendente e um "Não" impeditivo;
- abrir o plano de resgate;
- salvar e recarregar, conferindo que tudo reaparece no bloco certo.

As capturas vão no retorno.

## Detalhes técnicos
- `mobile/HazardMeasurePicker.tsx`:
  - catálogo sempre visível;
  - toggle de origem e "Adicionar medida" por linha;
  - folha de medidas com "relacionadas" e "todas" mais busca.
- `mobile/FichaChecklist.tsx`:
  - ícones de estado;
  - novo `FichaProgresso` (contagem de obrigatórios e impedimentos, a partir de `fichaPendencias`) e `irParaPendencia`, que abre o `<details>` e destaca o item;
  - grid de rótulo e respostas a partir de 1024 px.
- `cotrirosa-ficha.ts`:
  - grupos de "antes" separados (bloqueio/purga/ventilação vs. demais);
  - `resumoTeste(momento)` e marcação de dependentes ao mudar a ventilação;
  - testes unitários novos.
- `demo/PetDemoWorkspace.tsx`:
  - reordenar a etapa 3 nos quatro grupos;
  - cartões e o diálogo "Ver plano e contatos" na etapa de acompanhamento.
- CSS em `mobile/pet-mobile.css`.
- Sem mudanças no banco: os dados continuam no campo `ficha` e nas leituras do rascunho.
- A PET operacional recebe os mesmos componentes quando a unidade tiver um modelo com os itens da ficha.
