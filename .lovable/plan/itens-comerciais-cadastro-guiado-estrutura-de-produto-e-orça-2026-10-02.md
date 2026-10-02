# Itens Comerciais: cadastro guiado, estrutura de produto e orçamento integrado

## O que muda para o usuário
- **Itens Comerciais nunca fica sem ações**: mesmo sem itens, aparecem "Adicionar item existente", "Criar novo item" e "Criar e adicionar à proposta".
- **Um único editor de produto**, aberto em Produtos e Soluções ou em painel lateral dentro da proposta (sem sair dela). Começa com "O que você quer cadastrar?" (Peça / Conjunto soldado — CJ SD / Montagem, com explicação curta), depois família por nome ou sigla ("Linha de Vida Horizontal Flexível — LVHF"), nome, unidade e modalidade (Comprar/Fabricar/Terceirizar, independente da família). "Detalhes complementares" recolhidos: material, dimensões, acabamento, fabricante, fornecedor, NCM, custo (custo só para quem pode ver custos).
- **Prévia do código** em segundo plano; número reservado só ao salvar. Nome sugerido apenas a partir dos campos preenchidos (ex.: "Pilar soldado — 600 mm").
- **Listagem e busca**: nome em destaque, código + tipo por extenso em segundo plano; busca por nome, código, código antigo (COMP), família e atributos.
- **Composição do produto** (conjunto e montagem): árvore expansível "Peças deste conjunto" / "Componentes desta montagem", com quantidade por unidade, buscar, cadastrar faltante sem sair, substituir, remover, reordenar. Sem composição: salvo como "Composição pendente".
- **Na proposta**: montagem aparece como linha principal compacta com componentes recolhidos; quantidade principal multiplica pelos níveis (3 montagens × 2 conjuntos × 4 peças = 6 conjuntos, 24 peças). Item avulso com quantidade própria, sem sistema TELHADO/OVERHEAD. Origem visível ("Dimensionamento", "Inclusão manual", "Estrutura de X"). Distinção clara "No catálogo da revisão" vs "No orçamento".
- **Alcance explícito**: "Editar cadastro do produto" (mestre, versionado) vs "Editar somente nesta proposta" (local, com "Restaurar composição original"). "Atualizar a partir do catálogo" mostra diferenças e impacto antes de aplicar.
- **Permissões visíveis antes de preencher**: botões desabilitados com motivo ("Cadastro de produto exige papel Engenharia, Compras ou Admin"). Hoje o cadastro exige `importar_catalogo` (engenharia/compras); comercial tem `editar_revisao`. Não amplio acessos — ver pergunta abaixo.
- **Salvamento**: estados separados "Rascunho salvo", "Cálculo pendente", "Proposta consolidada". Erro de sistema incompleto passa a dizer "Sistema 3 — metragem inválida" com link para o Dimensionamento, sem bloquear cadastro/inclusão. Se o cadastro salvar e a inclusão falhar, os dois resultados aparecem e "Tentar incluir novamente" reutiliza o produto já criado.

## Correção do absorvedor
Hoje o produto (antigo COMP-03) está como `LVHF-NXS-M001`, tipo M. Nova função controlada `reclassificar_produto` (admin/engenharia, motivo obrigatório, auditoria) reserva o próximo número da série LVHF-P, mantém o mesmo produto/custos/vínculos, grava a equivalência M001→novo, atualiza revisões editáveis, nova versão ativa de `regras_versionadas` e o mapa no motor. Revisões aceitas e documentos emitidos intactos. M001 fica consumido (não reutilizado).

## Etapas
1. Banco (migration incremental): `produto_estrutura` (pai, filho, quantidade por unidade, ordem, versão) com trigger anti-ciclo/autorreferência; `produtos` ganha atributos (material, dimensões, acabamento), `composicao_status`, `base_custo` (composto | comprado completo), `versao`; histórico `produto_versoes`; `codigo_equivalencias`. Revisão: tabela de ocorrências `revisao_item_ocorrencias` (componente, origem manual/estrutura/dimensionamento, caminho, quantidade local, item pai) — `revisao_componentes` continua consolidado por produto, sem quebrar a unicidade atual. RPCs atômicas e idempotentes: salvar produto + composição, incluir item na revisão (expande estrutura), editar local, restaurar, atualizar do catálogo (prévia e aplicação), reclassificar.
2. Motor `domain.ts` (nova versão do motor): recebe itens manuais e árvore; multiplica quantidades por nível, consolida demanda por produto preservando caminhos; produto comprado completo não soma componentes; tipo M não gera cobrança de montagem/instalação; respeita múltiplos e indivisibilidade (técnica × compra). Testes novos + fidelidade dos 17 sistemas inalterada.
3. Servidor: `recalcularRevisao` passa a incluir ocorrências manuais; mensagens de validação por sistema/campo; cópia de revisão e snapshots/checkpoints/histórico levam a estrutura e ajustes locais.
4. Telas: `ProductEditor` compartilhado; Produtos e Soluções; Itens Comerciais (sem retorno vazio, árvore recolhida, painel lateral); integração ao coordenador de salvamento.
5. Absorvedor: aplicar reclassificação real.
6. Verificação: testes do motor (multi-nível, sem custo duplicado, avulso), testes SQL de ciclo/idempotência/permissão em transação revertida, navegador autenticado: proposta vazia → criar peça → criar conjunto/montagem → incluir → salvar → reabrir → nova revisão.

## Pendências mantidas (não resolvidas automaticamente)
Lacre COMP-15, Bonier COMP-20, famílias CON/ESC, PAT P47×P047, EMA/ESC M1000+ e PAT S1500 — continuam listadas com explicação e opções.

## Detalhes técnicos
- Regras em AGENTS.md: estrutura de produto é fonte única de composição; ocorrências da revisão guardam origem/caminho; reclassificação só por RPC.
- Arquivos: `ItensComerciais.tsx`, `AdicionarDoCatalogo.tsx` (vira seletor + editor), novo `features/catalogo/ProductEditor.tsx`, `produtos.index.tsx`, `catalogo.functions.ts`, `propostas.functions.ts`, `domain.ts`, `codigos.ts`, `autorizacao.ts` (só leitura de permissões para a UI), testes.
