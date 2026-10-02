# Cadastro Comercial NXS: compras, custos e importação assistida

## O que o usuário verá
- **Importar planilha** (Produtos e Soluções, admin/compras): uma prévia com quatro listas antes de gravar: "Já existe", "Possível correspondência", "Novo" e "Pendente". Nada é gravado sem confirmar.
- **Ficha do produto** com abas: Cadastro, Referências de fornecedor, Compras, Composição e Onde é usado. A ficha mostra três custos lado a lado: última compra, média ponderada e custo adotado. Cada custo informa de onde veio.
- **Registrar compra**: escolha do produto, do fornecedor e da nota fiscal, depois quantidade, unidade, preço, desconto, frete, IPI, ICMS e outras parcelas. O valor original da nota e o valor calculado ficam separados.
- **Custo pendente** aparece em destaque quando falta preço unitário, quando a quantidade é zero ou quando a unidade não tem fator de conversão. Nesses casos o custo nunca vira zero.
- **Busca** por nome, código Nexus, código anterior, referência do fornecedor e características.
- **Na proposta**, ao incluir um item, o custo sugerido é a média ponderada, com a origem visível. Depois de uma compra nova, a revisão mostra "Custo do catálogo mudou" com a diferença e o impacto no total. Só muda ao clicar "Adotar".
- **Fila de pendências** com o problema explicado em linguagem simples: Outros Itens, fornecedor não individualizado, nota sem identidade fiscal, unidade sem fator e divergências fiscais.

## Decisões já tomadas
- Os códigos da planilha são oficiais, incluindo os números 000 (ex.: ARR-NXS-P000, CSD-NXS-P002). As séries continuam a partir do maior número, pelo gerador central.
- ARR, POR, PAR, BRC, CHB, GON, CSB, CSD e os demais prefixos da planilha viram prefixos oficiais de código. A família técnica (LVHF, LVHR...) é uma classificação separada e opcional, que não é exigida na importação.
- O custo sugerido para novas seleções é a média ponderada: soma dos custos válidos dividida pela soma das quantidades compatíveis.

## Etapas
1. **Banco (migration incremental)**
   - Prefixos comerciais: incluídos como siglas em `familias_codigo` (grupo "comercial"), mais a coluna `produtos.familia_tecnica`, opcional.
   - `produto_referencias`: produto, fornecedor, código do fornecedor e descrição original. A chave única é fornecedor + código, nunca o código sozinho.
   - `documentos_fiscais`: fornecedor, número, série, chave NF-e (se houver), data e indicador de "provisório". Notas repetidas são detectadas pela chave NF-e ou por fornecedor + série + número.
   - `aquisicoes`: produto, documento, quantidade e unidade originais, fator de conversão, quantidade na unidade de uso, parcelas originais (em jsonb), valores calculados, versão da política, origem (aba/linha/arquivo) e situação (válida/pendente).
   - `produto_conversoes`: produto, unidade de compra, unidade de uso e fator confirmado.
   - `politicas_custo`: versão, fórmula, quais parcelas entram no custo e situação (validada/a validar).
   - `importacoes` e `importacao_linhas`: prévia, decisão por linha e resultado. A importação é idempotente.
   - Visão `produto_custos_resumo`: última compra válida, média ponderada e quantidade de compras. Ela ignora linhas pendentes ou sem conversão.
   - RPC `importar_codigo_oficial` para gravar um código existente com segurança, avançando a série para max(série, seq) sem nunca reduzi-la. Código com 4 ou mais dígitos é permitido.
   - RPC `registrar_aquisicao`, idempotente, que também grava `produto_custos` com origem "compra".
2. **Importação da planilha**: ler Cadastro Geral, DoisDez, Bonier, Elementos de Fixação e Histórico Fixação.
   - 78 produtos com código oficial.
   - 31 aquisições de segurança (DoisDez/Bonier) com parcelas e custo.
   - 226 ocorrências de fixação gravadas como aquisições "Custo pendente". O valor da NF fica guardado como memória, sem virar custo unitário nem rateio.
   - Outros Itens vão só para a fila de pendências.
   - Os resultados das fórmulas da planilha ficam guardados como histórico, versão "planilha-2026-10-01".
3. **Absorvedor**: comparar LVHF-NXS-P054 (antigo COMP-03) com CSD-NXS-P002 (DoisDez DD.12.14.034.01, inox 304) quanto a fabricante, referência, material e aplicação. A comparação aparece na tela como decisão com duas opções. "Mesmo produto": um único produto, códigos ligados por equivalência, vínculos e propostas preservados. "Distintos": nomes que explicam a diferença. Nada é unificado sem a sua confirmação.
4. **Política fiscal**: a política da planilha fica como "histórica, a validar". As duas divergências ficam registradas: ICMS (base × alíquota interestadual vs. ICMS destacado) e a detecção de IPI incluído afetada pelo frete. O orçamento passa a marcar quais parcelas já estão no custo de aquisição (frete de compra, IPI não recuperável), para que frete e impostos de venda não sejam cobrados duas vezes. Os impostos de venda continuam como hoje.
5. **Motor e proposta**: `revisao_componentes` ganha a origem do custo (média, última compra ou manual) e a referência da versão. A prévia "Atualizar custo" mostra antes e depois e o impacto, e aplica pela atualização já existente. Itens avulsos e estruturas já entram no cálculo. Falta ajustar a unidade técnica × a unidade de compra pelo fator. O arredondamento por sistema não muda.
6. **Compras e produção**: `gerarDemanda` já soma os itens avulsos. Falta expandir os conjuntos fabricados pela estrutura até as peças compradas e manter o kit comprado inteiro. A rastreabilidade de origem fica gravada na demanda. Demandas alocadas e ordens emitidas não são reescritas: aparece um aviso de diferença.
7. **Telas**: assistente de importação, ficha do produto com abas, formulário de compra, fila de pendências e indicação de origem do custo na proposta. São reaproveitados o `ProductEditor`, a busca e o coordenador de salvamento.
8. **Validação**:
   - Testes puros: média ponderada, conversão só com fator, custo pendente e não-duplicação de frete/IPI.
   - Testes SQL em transação revertida: importar duas vezes sem duplicar, nova compra no mesmo produto, mesmo número de NF em fornecedores diferentes e série que não regride.
   - Os 17 sistemas continuam passando.
   - No navegador: um exemplo de produto comprado (âncora DoisDez) e um conjunto fabricado incluídos numa proposta, salvos e reabertos.

## Pendências que continuarão para decisão
- Absorvedor: mesmo produto ou produtos distintos.
- Política fiscal: ICMS/DIFAL e detecção de IPI.
- Fatores CT/PC/UN dos fixadores.
- Fornecedores ZUK / Casa das Mangueiras não individualizados.
- Outros Itens.
- Pendências anteriores: lacre, Bonier COMP-20, CON/ESC, PAT P47/P047, EMA/ESC M1000+.

## Detalhes técnicos
- Fórmulas de custo em um novo módulo puro `src/features/custos/domain.ts`, versionado e testado. Nenhuma página calcula valores.
- A importação roda em uma função de servidor com o arquivo lido no navegador (planilha → JSON). A gravação é feita por RPC com chave idempotente por aba+linha.
- Arquivos: migration nova, `custos/domain.ts`, `custos.functions.ts`, `ImportarPlanilha.tsx`, `produtos.$produtoId.tsx`, `ProductEditor.tsx`, `ItemEstrutura.tsx`, `propostas.functions.ts` (`gerarDemanda`) e testes.
- Regras novas no AGENTS.md: custos de aquisição como fonte única do custo sugerido; códigos importados só via RPC.
