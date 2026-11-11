# Corrigir erro "Cannot read properties of undefined (reading 'coleta_revisao')" nas telas NR-33 e NR-35

## Causa
A nova etiqueta de situação da coleta de campo (`Status` em `src/features/nr/NrRecordCards.tsx`) lê `row.dados["coleta_revisao"]` sem verificar se `dados` existe. As listas de NR-33/NR-35 recebem registros resumidos, sem esse campo, e a tela inteira cai no erro.

## Correção
- `NrRecordCards.tsx` (`Status`): ler `row.dados?.["coleta_revisao"]`.
- `NrWorkspace.tsx` (linhas ~1097-1110, link do relatório de campo): usar `row.dados?.[...]` nas três leituras.
- Procurar outros acessos `row.dados[` em `src/features/nr/` usados em listas e aplicar a mesma proteção.

## Verificação
Abrir NR-33 e NR-35 na prévia autenticada e confirmar que a lista aparece e permite interação, sem o quadro de erro.
