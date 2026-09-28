# Corrigir salvamento/histórico e integrar itens selecionados ao orçamento

## Veredito da auditoria somente leitura

**Classificação: NÃO APLICADA.**

- O domínio publicado e o código local apontam para a mesma instância de produção do Lovable Cloud.
- A versão `20260928010000` não consta no histórico de migrations do banco.
- As tabelas `proposta_checkpoints`, `proposta_rascunho_autores`, `proposta_salvamentos` e `proposta_operacoes` não existem.
- As funções `capturar_revisao` e `concluir_revisao` também não existem; por isso “Salvar proposta” falha antes de consolidar as alterações.
- O site publicado está em um deployment identificável, mas não há metadado público suficiente para associá-lo com segurança a um SHA específico. A integração funcional foi confirmada pelo erro: o frontend publicado chama o novo contrato, enquanto o banco ainda está no contrato antigo.
- Existem 2 revisões reais, ambas editáveis. Não serão criados dados fictícios nem executados testes destrutivos nelas.

## Correção do salvamento e histórico

1. Aplicar **sem modificar** o conteúdo de `supabase/migrations/20260928010000_proposta_checkpoints.sql`.
2. Confirmar no banco:
   - registro da versão da migration;
   - tabelas, funções e assinaturas instaladas;
   - triggers, RLS, políticas e privilégios mínimos;
   - checkpoint inicial das 2 revisões existentes, sem inventar eventos históricos.
3. Verificar que “Salvar proposta” continua chamando `consolidarProposta`, que usa `capturar_revisao` e `concluir_revisao`, e que Histórico lê `proposta_salvamentos` persistente.
4. Preservar a separação atual: autosave e recálculo técnico não geram evento comercial; somente “Salvar proposta” consolida um evento idempotente.
5. Melhorar a mensagem de falha para não exibir erro bruto de função ausente caso haja incompatibilidade futura entre aplicação e banco.

## Itens selecionados no orçamento

- Adicionar, em migration incremental separada, um estado persistente por item da revisão indicando se ele está incluído no orçamento; itens existentes começam incluídos para não alterar propostas atuais silenciosamente.
- A caixa “Selecionar” deixa de ser uma seleção temporária para edição em lote e passa a representar inclusão real no orçamento.
- “Selecionar todos” inclui todos os itens filtrados; desmarcar remove o item dos valores, composição, demanda e resumo da revisão.
- Manter edição em lote por uma seleção operacional separada, sem confundir as duas funções.
- Registrar inclusão/remoção no checkpoint e no histórico comercial, com autoria, antes/depois e contagem correta.
- Copiar esse estado ao criar nova revisão.
- O cálculo canônico receberá apenas itens incluídos. Produtos excluídos não gerarão custo, preço, composição ou demanda; o catálogo mestre permanecerá intacto.
- Se uma regra técnica exigir um código excluído, a revisão mostrará pendência explícita em vez de substituir o produto ou inventar quantidade.

## Atualização automática de valores

- Após incluir/excluir item, alterar custo, modalidade, fornecedor ou parâmetros que afetam preço, persistir a alteração e enfileirar o recálculo canônico da revisão.
- Atualizar preço unitário, totais, composição e resumo pela mesma versão do motor já usada no servidor.
- Não adotar automaticamente custos novos do catálogo: o custo versionado da revisão continua sendo a fonte, conforme solicitado.
- Evitar corridas: alterações passam pela fila atual; falha ou conflito mantém o rascunho e não mostra confirmação falsa.

## Validação e evidências

- Antes da mudança de seleção: adicionar testes que comprovem que a marcação atual não afeta o cálculo.
- Depois: testar inclusão/exclusão, selecionar todos filtrados, nova revisão, recálculo automático, histórico e demanda apenas dos itens incluídos.
- Executar a suíte isolada de checkpoints, incluindo ausência de diferenças, reversão, retry idempotente, conflito, rollback, autoria, permissões e revisão emitida imutável.
- Executar testes unitários do orçamento, typecheck, lint, build e regressões Industrial/Trevisan.
- No ambiente publicado, usar a sessão real somente para um fluxo não destrutivo: abrir a revisão, confirmar carregamento e disponibilidade do histórico. Qualquer alteração comercial real exigida para validar o clique será identificada separadamente; não será fabricada.
- Entregar relatório atualizado distinguindo: evidência em produção, teste isolado e validação autenticada publicada, com pendências declaradas sem promover homologação parcial a total.

## Limites preservados

- Sem mudanças em fórmulas, permissões operacionais, emissão de OC/OP, CAD, Trevisan ou Mapas 3D.
- Sem apagar eventos, documentos ou registros existentes.
- Sem reaplicar migrations às cegas e sem marcar manualmente uma migration como concluída.
