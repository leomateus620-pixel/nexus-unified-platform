# PET operacional — itens da ficha Cotrirosa

Com a sua aprovação técnica como responsável pelo desenvolvimento, o modelo da unidade COTRIROSA · Fábrica de Ração — Santa Rosa passa a incluir os itens da ficha em papel, e a PET operacional passa a preenchê-los igual à demonstração.

## O que muda para o usuário
- Na PET operacional (EC 28 e demais locais da unidade), aparecem os mesmos blocos da demonstração:
  - Perigos: cinco famílias (Químicos, Físicos, Ergonômicos, Biológicos, Acidentes) com "Outros" descritivo.
  - Medidas de controle: EPC e EPI com uma resposta por item (Sim / Não / Não se aplica / Não verificado), começando pendentes.
  - Antes da entrada: Teste inicial e Teste após ventilação/isolamento separados, leituras sempre vazias, instrumento/série, confirmação do supervisor; checklist de bloqueio, purga, ventilação (tipo, insuflador, tempo), comunicação, resgate, movimentação vertical, treinamentos e monitoramento.
  - Durante o trabalho: Trabalho a quente (S/N/NA/NV, com nº e validade da permissão quando aplicável) e contatos de emergência.
- Pendências na Conferência levam direto ao campo; itens "Não" impeditivos bloqueiam a emissão no servidor.
- PETs antigas continuam abrindo como estavam; respostas agrupadas antigas não marcam os novos itens.

## Etapas
1. Conferir o modelo vigente da unidade e a estrutura em que a PET operacional guarda preparação e leituras.
2. Publicar nova versão do modelo da unidade com os itens da ficha, registrando você como aprovador técnico e marcando como ativa; a versão anterior fica preservada no histórico.
3. Ligar o mesmo componente da ficha (já usado na demo) às etapas operacionais existentes, salvando no rascunho da PET.
4. Validação no servidor: pendências e itens impeditivos impedem emissão; O₂ segue a faixa NR-33 (19,5–23 %); demais limites vêm do modelo.
5. Resumo e PDF mostram os novos blocos.
6. Testes: salvar/reabrir, item impeditivo, trabalho a quente NA, PET antiga, e capturas da PET operacional de teste no EC 28 (390 px e 1280 px), sem emitir PET real.

## Limites que permanecem
- Assinatura digital por teste continua como confirmação do supervisor (sem ICP-Brasil).
- Telefones de Ambulância e Segurança da unidade não existem no cadastro; aparecem como "não cadastrado" até serem informados.

## Detalhes técnicos
- Nova migration em `drizzle/migrations` (0067) adicionando o campo `ficha` (jsonb, versão `cotrirosa-ficha-1`) à PET operacional se ausente, e inserindo nova versão do modelo da unidade via função existente de versionamento (aprovador = seu usuário).
- IDs vêm só de `src/features/pet/cotrirosa-ficha.ts`; `fichaPendencias` reutilizada no servidor (`pet.functions.ts`) e no cliente.
- `PetEditor.tsx`/`PetOperations.tsx` renderizam `FichaChecklist`; `pdf-v2.ts`/`PetResumo.tsx` incluem a seção.
- Atualizar `matriz-cotrirosa.md` de "aprovação pendente" para "operação".
