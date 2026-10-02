# Fluxo de componentes comerciais de ponta a ponta

Uma entrega única e integrada: cadastrar, comprar, compor, orçar e gerar demanda pelo sistema. Fica preservado o que já funciona: os 99 produtos, os códigos oficiais (inclusive os que começam com 000), os identificadores internos, as compras, as propostas, o editor guiado e o gerador central de códigos.

## 0. Conferência inicial (antes de alterar)
- Contar produtos, referências, conversões, compras e pendências; confirmar que as séries começam depois dos números já reservados.
- Listar possíveis correspondências entre produtos importados e antigos (mesma referência de fornecedor, mesmo NCM e descrição parecida) e marcá-las como "a conferir". Nada é unificado automaticamente.
- Conferir o que o cálculo e a geração de demanda já fazem com itens avulsos e estruturas, para atacar só as lacunas reais.

## 1. Itens Comerciais (proposta)
- Três ações sempre visíveis, mesmo com a proposta vazia: **Adicionar do catálogo**, **Cadastrar novo** e **Cadastrar e incluir**. A última salva o produto e o inclui na proposta numa única operação no servidor; se for enviada de novo, não duplica.
- Busca por código NEXUS, descrição, referência do fornecedor e descrição original. O código aparece apenas como informação.
- Cada linha mostra nome, código, tipo por extenso, unidade, fornecimento e custo, além de dois botões separados: **Editar produto (catálogo)**, com aviso de que vale para novas inclusões, e **Ajustar nesta proposta**, que muda só esta revisão.

## 2. Formação do custo sem duplicidade
- Cada compra registra suas parcelas: produto, desconto, frete, IPI, DIFAL e outras. Para cada parcela ficam a origem, a data e se ela já está **incluída no custo**.
- O custo adotado na proposta passa a levar a lista de despesas que já contém.
- No cálculo compartilhado entre a tela e o servidor (nova versão do motor), frete e DIFAL de aquisição não são somados de novo quando já estão no custo. Imposto de venda, montagem e margem continuam como hoje, porque não são duplicação.
- A média ponderada continua como sugestão: soma dos custos totais válidos ÷ soma das quantidades em unidades compatíveis. A última compra e a origem aparecem ao lado.
- Compra em embalagem (por exemplo CT) sem fator confirmado fica com **custo pendente**, nunca zero. O total de uma nota nunca vira custo unitário de um fixador.

## 3. Aviso "Custo do catálogo mudou"
- Em uma revisão editável, os itens cujo custo adotado difere do custo sugerido atual recebem uma faixa com: custo anterior, custo sugerido, fonte, data e impacto estimado no total.
- **Adotar** funciona para um item ou para os selecionados: atualiza o custo, recalcula pelo motor atual e grava no histórico de salvamentos. Os itens não escolhidos mantêm o ajuste local.
- Uma compra nova não altera propostas sozinha. Revisões enviadas ou aceitas e documentos emitidos continuam bloqueados pelo banco de dados.

## 4. Estrutura na proposta e na demanda
- Ao incluir um item composto, a estrutura válida é carregada com as quantidades multiplicadas nível a nível e a origem de cada componente (caminho pai › filho). A mesma peça vinda por caminhos diferentes soma na demanda sem perder as ocorrências.
- **Conjunto fabricado:** gera a demanda dos componentes conforme a estrutura.
- **Kit comprado completo:** gera compra e custo apenas do kit; os componentes internos são só informativos.
- Item com estrutura incompleta mostra exatamente o que falta. Composições nunca são deduzidas pelo nome, família ou código.
- Peça, Conjunto soldado e Montagem continuam independentes de Comprar, Fabricar ou Terceirizar.

## 5. Compras e produção
- A geração de demanda passa a usar a expansão do cálculo oficial, guardando a quantidade técnica, a operacional e a de compra, com a origem (proposta, item e caminho).
- Múltiplos, indivisibilidade e conversões entram depois da consolidação, como já acontece nos sistemas.
- A demanda planejada é recalculada. Demandas alocadas e ordens emitidas não são reescritas: as diferenças aparecem para reconciliação. Editar a proposta nunca emite ordens.

## 6. Tela de importação reutilizável (Produtos e Soluções › Importar)
- Envio do arquivo, escolha da aba, mapeamento das colunas (com um modelo salvo para a planilha NXS) e prévia classificada em **novo**, **existente**, **conflito** e **incompleto**, com contagem de produtos e compras a incluir ou vincular e do que fica pendente.
- O documento de origem é identificado por fornecedor + número + série, para que notas de mesmo número de fornecedores diferentes não sejam confundidas. Aba, linha e arquivo ficam guardados.
- Confirmar importa apenas os registros válidos e manda o restante para Pendências. Repetir a importação não duplica nada, porque cada registro tem uma chave única.
- A estrutura aceita outras planilhas compatíveis somente por meio de mapeamento; arquivos sem mapeamento não são interpretados.

## 7. Salvamento e histórico
- Custos adotados, ajustes locais de estrutura, quantidades avulsas e adoções passam pelo mecanismo de salvamento atual e pelas cópias de segurança das revisões, sobrevivendo a recarregar a página e a criar nova revisão.
- Estados visíveis: salvando, salvo, cálculo pendente ou falha. Em caso de erro, o preenchimento é mantido e é possível tentar de novo sem duplicar.

## 8. Pendências externas (sinalizadas, sem bloquear)
- Absorvedores LVHF-NXS-P054 e CSD-NXS-P002 continuam separados, os dois como Peça, com o aviso "identidade técnica a confirmar".
- ICMS destacado e IPI incluído ficam guardados como histórico da planilha, sem virar regra fiscal para novas operações.
- Fatores de CT por produto e fornecedor das notas (ZUK ou Casa das Mangueiras): ficam pendentes e visíveis.
- Registro de compra pelo admin: a regra atual continua, e o aviso aparece antes do formulário.

## 9. Validação
Testes automáticos do motor e dos custos cobrindo:
- custo já com frete, sem dupla cobrança;
- kit comprado sem explosão;
- conjunto fabricado com demanda correta;
- peça repetida por caminhos diferentes;
- custo pendente por falta de preço ou de conversão;
- média ponderada.

Testes no banco dentro de transação desfeita, para não deixar dados fictícios em produção:
- reenvio de compra sem duplicar;
- cadastrar e incluir em proposta vazia;
- adoção de custo e histórico;
- nova revisão preservando os dados;
- importação repetida sem duplicatas.

Também: verificação no preview autenticado do percurso pela tela, verificação de tipos, testes e build. O relatório final separa o que foi comprovado, o que ficou bloqueado e as decisões pendentes.

## Detalhes técnicos
- Migration (só acréscimos):
  - `aquisicoes.parcelas` com os campos `incluido` e `origem` por parcela (o que já existe em JSON é reaproveitado);
  - `revisao_componentes.custo_inclui text[] default '{}'`, `custo_fonte jsonb` e `custo_atualizado_em`;
  - `demandas.origem jsonb` e as quantidades `quantidade_tecnica` e `quantidade_compra`;
  - tabela `importacao_lotes`, com GRANT e RLS por organização;
  - RPCs transacionais `cadastrar_e_incluir`, `adotar_custo_catalogo(_rev, _ids, _esperados)` (verifica se a revisão é editável e grava auditoria) e `importar_lote`.
- `domain.ts`: `MOTOR_VERSAO` sobe de versão; `precoUnitario` recebe `inclui` e não soma frete/DIFAL já incluídos; `expandirAvulsos` devolve os caminhos de origem e respeita `base_custo = completo` (kit) contra `composto`.
- `gerarDemanda` usa `por_componente` mais as ocorrências de origem, e os registros não planejados entram apenas no relatório de diferenças.
- Componentes: `AvisoCustoCatalogo.tsx`, `ImportacaoAssistida.tsx` (mapeadores em `src/features/importacao/mapeadores/`); `ItensComerciais.tsx` e `ProductEditor.tsx` são reaproveitados.
- AGENTS.md: regras para custo já incluído, adoção explícita e lotes de importação.
