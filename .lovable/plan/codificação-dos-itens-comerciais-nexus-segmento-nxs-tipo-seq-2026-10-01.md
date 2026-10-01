# Codificação dos itens comerciais Nexus — [SEGMENTO]-NXS-[TIPO][SEQ]

## Objetivo
Catálogo organizado por família técnica e tipo (Montagem, Conjunto soldado, Peça), com códigos gerados com segurança no servidor, continuando as séries da planilha, e substituição real dos códigos COMP-xx em todo o fluxo comercial.

## O que o usuário verá
- **Produtos e Soluções**: busca por código/descrição, filtros por família e tipo, linhas compactas que expandem ao toque para detalhes/edição. Formulário: família pesquisável (sigla + descrição), tipo por nome completo, prévia do código, descrição, unidade, suprimento, custo. Código definitivo confirmado ao salvar.
- **Configuração de famílias e séries** (painel compacto para admin): família, tipo, último reservado, próximo número, pendência.
- **Itens Comerciais**: busca no catálogo para localizar e adicionar componentes à revisão editável; novos produtos não entram sozinhos em propostas.
- Códigos novos exibidos no dimensionamento, orçamento, resumo, OC/OP de revisões editáveis. Documentos emitidos mantêm o texto original.

## Etapas
1. **Leitura da planilha** (abas Resumo, Relação de Códigos, Fora do Padrão, Critérios): extrair as 26 famílias com descrição literal e, por família+tipo, o maior sequencial válido. Excluir dos contadores: números com cara de medida (EMA/ESC M1000+, PAT S1500), prefixos "Mirror", e marcar P47/P047 como pendência. Famílias sem descrição confirmada (CON, ESC) ficam com marcação "a confirmar".
2. **Banco** (migration incremental):
   - `familias_codigo` (sigla, descrição, grupo, situação) e `series_codigo` (organização, família, tipo, último reservado, pendência, origem) por organização.
   - Em `produtos`: `familia`, `tipo_item` (M/S/P), `sequencia`, `codigo_legado`; código único por organização.
   - Função de servidor `cadastrar_produto_codificado` com bloqueio da série (sem duplicidade em concorrência), chave idempotente (retry não duplica), nunca reduz série, nunca reutiliza número. Trigger impede inserir/alterar código fora do padrão por fora da função.
   - Registro de correspondência COMP→novo para rastreabilidade.
3. **Mapeamento dos 21 COMP**: comparar cada componente atual (descrição, medidas, aplicação) com a planilha. Correspondência comprovada → código histórico; sem correspondência → próximo da série correta; dúvida → listado como pendência para decisão (não atribuído silenciosamente). Itens comprados de terceiros (cabo, mosquetão, clipes, fixadores) tendem a COM ou à família do sistema — decisão caso a caso com justificativa.
4. **Troca efetiva**: atualizar `produtos.codigo` mantendo o mesmo ID, custos e vínculos; atualizar `revisao_componentes.codigo` só em revisões editáveis (rascunho/em revisão). Revisões enviadas/aceitas e documentos emitidos ficam intactos.
5. **Motor de cálculo**: as regras hoje usam COMP-xx como chave (`domain.ts`, `catalogo-modelo.ts`, fixture da planilha). Trocar para os novos códigos via tabela única de correspondência, sem mudar quantidades; os testes de fidelidade (17 sistemas, COMP-08 = 81, R$ 10.145,25) precisam continuar idênticos.
6. **Telas**: novo formulário e listagem de produtos, painel de séries, busca/adição no Itens Comerciais, exibição uniforme nas demais telas.
7. **Verificação**: testes do motor; teste de concorrência e retry na geração; checagem de ausência de códigos duplicados; totais da revisão antes/depois iguais; cadastro real salvo e reaberto no navegador.

## Pendências que serão apresentadas (não decididas sozinho)
- EMA/ESC M1000/M2000/M3000 e PAT S1500: medida ou sequência.
- PAT P47 × P047 com descrições diferentes.
- CON e ESC: significado/classificação.
- Componentes COMP sem correspondência técnica clara.

## Fora do escopo
Aba "Controle Códigos Projetos" e numeração de projetos/propostas/ordens. Não importar os ~805 itens históricos nem criar produtos vazios.

## Detalhes técnicos
- Formato: `lpad(seq, 3, '0')`, sem truncar ≥1000.
- Série inicial = max(planilha válida, códigos já cadastrados no padrão); séries novas começam em 001.
- Prévia via leitura sem consumo; reserva só dentro da função com `SELECT … FOR UPDATE` na série.
- Arquivos afetados: `produtos.index.tsx`, `produtos.$produtoId.tsx`, `ItensComerciais.tsx`, `ProductComponentCard.tsx`, `domain.ts`, `catalogo-modelo.ts`, `propostas.functions.ts`, fixtures/testes de cálculo.
- Regra registrada em AGENTS.md: código de item gerado apenas pela função de servidor.
