# Nexus — Processo de orçamento integrado e remoção de dados fictícios

O processo da planilha (Itens comerciais → Dimensionamento → Orçamento → Compras → Produção → Resumo) passa a funcionar dentro dos menus que já existem, com dados salvos de verdade e login. Todos os dados de exemplo são removidos. Menus, identidade visual e os módulos 3D (Industrial, Trevisan, Mapas 3D) não mudam.

Hoje o projeto não tem backend nem login. A primeira etapa ativa o Lovable Cloud (banco PostgreSQL e autenticação únicos). Não será criado nenhum outro backend.

## Entregas por etapa

Cada etapa funciona e é verificada no navegador antes da próxima.

1. **Base: login, organização e remoção dos dados de exemplo**
   - Ativar o Lovable Cloud, com login por e-mail e senha, organizações e papéis de acesso em tabela própria (admin, comercial, engenharia, compras, financeiro, campo).
   - Remover `nexus-data.ts`. O `brl()` passa para um arquivo de formatação próprio, com a precisão ajustada.
   - Em todas as telas, trocar números e listas fixas por consultas reais, com estado de carregando, vazio, erro ou "—".
   - O cabeçalho mostra o usuário da sessão e um seletor de cliente autorizado. Sem sessão, o sistema leva para a tela de login.
   - Telas ainda sem serviço, como parte de Financeiro, Inspeções e Execução, mostram "Integração não configurada" e têm as ações desabilitadas.

2. **Cadastros**
   - Clientes, unidades e contatos.
   - Fornecedores e fabricantes, como entidades separadas.
   - Produtos, com histórico de custos e modalidade de suprimento (comprar, fabricar ou terceirizar).
   - Parâmetros padrão em /configuracoes/orcamentos.
   - Os 21 componentes e as 20 regras da planilha podem ser importados, com a origem registrada.

3. **Propostas e revisões**
   - /comercial/propostas, /nova e /$propostaId, que abre a revisão corrente.
   - Área de trabalho da revisão com as abas Itens comerciais, Dimensionamento, Orçamento, Compras, Produção, Resumo executivo, Parâmetros e Histórico.
   - Salvamento automático com os estados Salvando, Salvo, Erro e Conflito, controle de versão contra edições simultâneas e aviso antes de sair com alterações pendentes.

4. **Dimensionamento e motor de cálculo**
   - Funções de cálculo puras e versionadas, usadas tanto na prévia quanto no cálculo oficial no servidor.
   - Regras próprias de TELHADO e OVERHEAD.
   - Sem limite de 17 ou 25 linhas, e peças indivisíveis nunca ficam fracionadas.
   - Botões "Ver cálculo" e "Ver impacto", e justificativa obrigatória para valores alterados manualmente.
   - /engenharia/regras-dimensionamento e /engenharia/dimensionamentos usam os mesmos registros da proposta.

5. **Demandas, ordens e aprovação**
   - /compras/demandas, /ordens-compra(/$id), /ordens-producao(/$id) e /fornecedores.
   - Aceitação comercial, aprovação técnica e liberação operacional ficam separadas.
   - Projeto, ordens de compra e ordens de produção são gerados sem duplicar documentos.
   - Recebimento parcial e apontamentos de produção.
   - /projetos/$projetoId mostra os materiais e o andamento.

6. **Resumo executivo e documentos**
   - O resumo é montado a partir dos dados da revisão.
   - Há uma versão interna e uma versão para o cliente, sem custos nem margens.
   - A versão emitida é guardada e não muda depois. É possível imprimir.

7. **Painéis e refinamento**
   - Dashboard, Relatórios e Financeiro calculados a partir dos dados reais.
   - Ajustes de legibilidade, sem redesenho.

## Regras preservadas
- Sem novos menus principais, e nenhuma alteração nos módulos 3D.
- Inconsistências da auditoria só são corrigidas quando marcadas como CORREÇÃO aprovada.
- Nada de módulo fiscal completo, ERP de estoque ou integração com o RDO.
- Revisões enviadas ou aprovadas e ordens já emitidas nunca mudam em silêncio. Uma mudança gera nova revisão, com comparação de impacto.
- A exclusão de registros de demonstração no banco só acontece com uma prévia e a sua aprovação. Nunca usar TRUNCATE.

## Detalhes técnicos
- Rotas: `comercial.tsx`, `compras.tsx`, `engenharia.tsx`, `produtos.tsx`, `projetos.tsx` e `configuracoes.tsx` viram layouts com `<Outlet/>`, e a visão atual passa para `index.tsx`, mantendo as URLs. A base da revisão é `comercial.propostas.$propostaId.revisoes.$revisaoId.tsx`, que abre itens-comerciais, com filhos explícitos. Rotas logadas ficam sob `_authenticated/`. Os search params são validados com Zod.
- Módulos em `src/features/{cadastros,propostas,calculo,suprimentos,projetos,documentos}/`, com `domain/` (cálculo puro), `schemas.ts` (Zod), `*.functions.ts` (createServerFn com requireSupabaseAuth), `queries.ts` (TanStack Query) e `components/`.
- Tabelas com UUID, NUMERIC, chaves estrangeiras, códigos únicos por organização, RLS por organização e papel, e GRANTs explícitos:
  - organizations, memberships, user_roles
  - clientes, unidades, contatos, fornecedores, fabricantes, produtos, produto_custos
  - propostas, proposta_revisoes (com coluna version para concorrência), revisao_parametros, proposta_itens_comerciais
  - regras_versionadas, sistemas_dimensionados, sistema_componentes
  - calculo_execucoes, demandas, alocacoes_demanda
  - ordens_compra, oc_itens, recebimentos, ordens_producao, op_itens, apontamentos
  - projetos, condicoes_pagamento, aprovacoes, documentos (snapshot), auditoria
- A geração de projeto e ordens roda em funções SQL transacionais com chave de idempotência.
- Custos e margens são filtrados no servidor conforme o papel.
- `ActionButton` recebe as props de botão, `loading` e `disabled`. `DataTable` exige `getRowId`. É criada uma nova `EditableGrid` com React Hook Form e Zod, que aceita colagem tabular e edição em lote.
- Testes: vitest para o motor de cálculo (custo, tipo, metragem, 18º e 26º sistema, frações, parcelas, recebimento parcial, revisão imutável), além de lint, build e regressão dos testes industriais e Trevisan existentes.

## Pendências esperadas
- Validação tributária e de engenharia dos valores da planilha, que dependem de responsável técnico.
- A planilha .xlsx original não foi anexada. A importação usará os valores descritos na auditoria, a menos que você envie o arquivo.
