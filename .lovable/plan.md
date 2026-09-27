# Correções da auditoria e homologação do fluxo de orçamento

## Situação verificada antes do plano
- `exigirPapel()` consulta `user_roles` só por organização, sem filtrar pelo usuário atual: qualquer admin da empresa libera a ação para todos. Defeito confirmado.
- Existem dois lockfiles (`bun.lock` e `package-lock.json`). Essa é a divergência apontada pelo CI.
- Há 3 migrations aplicadas. Elas serão preservadas, e as correções entram em migrations novas.
- Não estão no projeto: a planilha .xlsx, `Auditoria_Implementacao_NEXUS.md` e `Comparacao_Formulas.md`. Só está disponível `NEXUS_Analise_Funcional_e_Auditoria_1.md`. Sem a planilha, não dá para certificar os valores por célula (I21, M21, N21, F44, G21) nem as saídas completas dos 17 sistemas. Esses itens ficam marcados "pendente – fonte indisponível", e a liberação correspondente fica bloqueada até você enviar os arquivos.
- O ambiente tem um único backend, usado tanto pelo preview quanto pelo site publicado. Os testes de integração com o banco rodam num schema isolado, criado pelas próprias migrations em banco vazio (Postgres local no sandbox, com auth simulado por `request.jwt.claims`). Não serão criados usuários nem dados de teste no banco real.

## Etapas (cada uma começa com testes que falham e termina com eles passando)

1. **Inventário e relatório de achados.** Criar `docs/orcamento/achados.md`, com cada achado classificado como corrigido, pendente ou não reproduzido, junto com a evidência. Também uma fixture de referência independente em `tests/fixtures/planilha-referencia.ts`, com a aba e a célula de origem de cada valor, marcando os valores não confirmados.

2. **Autorização.**
   - `exigirPapel(db, userId, org, acao)` passa a filtrar por `user_id`, e um erro de consulta resulta em acesso negado.
   - Matriz explícita `acao → papéis`, compartilhada entre o servidor e o banco, na função SQL `pode(_org, _acao)`.
   - A migration remove as políticas genéricas e cria políticas por entidade e ação: ler, criar, editar, importar, aprovar, emitir, receber e produzir.
   - Custos, markup, margens e totais internos passam para tabelas ou views separadas, com política `can_see_costs`. `select('*')` e o JSON `totais` deixam de expô-los para quem não tem acesso.
   - Integridade de organização e relacionamento com FKs compostas `(organization_id, id)` e triggers: unidade e contato pertencem ao cliente, sistema e componente pertencem à revisão, demanda e ordem pertencem à revisão e ao projeto.
   - Funções SECURITY DEFINER passam a checar identidade, com `search_path` fixo e `REVOKE` de `public/anon`.
   - A troca de sessão ou de organização limpa todo o cache de consultas.

3. **Estados e imutabilidade.**
   - Máquina de estados SQL que bloqueia enviada/aceita → rascunho.
   - Triggers congelam o conteúdo, as regras, os totais e os filhos de revisões emitidas, de OCs emitidas e de OPs liberadas, inclusive inserção e exclusão de itens.
   - Tabela `aprovacoes` (técnica, comercial interna, aceite do cliente, liberação), com o hash do conteúdo aprovado. Os hashes são separados: geometria/composição e comercial.
   - Uma regra pendente bloqueia a liberação.

4. **Motor de cálculo v2.**
   - Modos legado, proposto e aprovado.
   - OVERHEAD legado com ceil por trecho × trechos, sem o ±1. O teste é 4×120 m → 40, 56 e 48.
   - COMP-08 = F44.
   - Quantidade técnica, aprovada e de aquisição separadas, com embalagem aplicada no agrupamento de suprimentos.
   - Bloqueio de fração em peças indivisíveis no domínio, no servidor e em CHECK/trigger no banco.
   - Validação de entradas, parsing pt-BR explícito, aritmética decimal em centavos inteiros e distribuição determinística de resíduos.
   - Base 50/30/20 separada da montagem.
   - Componente adicional com justificativa.
   - Testes gerativos com seed registrada.

5. **Transações e concorrência.** RPCs SQL atômicas, cada uma com `expected_version`, auditoria na mesma transação e rollback integral:
   - salvar entradas;
   - publicar cálculo (confere a versão e o hash das entradas);
   - criar ou copiar revisão, remapeando IDs e descartando overrides órfãos;
   - adotar catálogo ou regras, com prévia das diferenças;
   - aceitar e gerar projeto ou aditivo;
   - reconciliar demanda;
   - gerar ordens a partir do saldo elegível;
   - emitir e liberar;
   - registrar recebimento, apontamento e estorno.

   Numeração atômica por sequência de organização. Tabela `comandos_idempotentes` (chave, ação, hash do payload, resultado). Travas `FOR UPDATE` nos saldos. As server functions viram camadas finas sobre essas RPCs.

6. **Documentos e suprimentos.**
   - Snapshot completo (partes, condições, quantidades, valores e versão do modelo de apresentação), com payloads comercial e interno separados.
   - Ações distintas para "Emitir documento" e "Registrar envio".
   - Fornecedor e condições negociados na demanda ou na OC.
   - Custo previsto, negociado e realizado separados.
   - Validação dos campos obrigatórios antes de emitir ou liberar.

7. **Salvamento na interface.**
   - Estados pendente, salvando, salvo, erro e conflito.
   - Rascunho local não confirmado fica identificado. Numa resolução de conflito, a alteração é preservada.
   - Nenhum total desatualizado habilita emissão.
   - Menus, rotas e design ficam iguais.

8. **Testes, CI e evidências.**
   - Vitest unitário: C01–C09 e testes gerativos.
   - Integração com Postgres e RLS aplicando as migrations reais: S01–S06, T01–T08, F01–F07. A concorrência roda com conexões paralelas.
   - Playwright autenticado com contas de teste criadas só no banco isolado: F08–F10.
   - Padronizar em bun e remover `package-lock.json`.
   - Workflow de CI com instalação limpa, migrations em banco vazio e sobre uma cópia do schema anterior, typecheck, lint, testes, regressão Industrial/Trevisan e build.
   - Relatório `docs/orcamento/homologacao.md` com as tabelas antes/depois por cenário. Cenários pulados contam como reprovados.

## Limites declarados
- Sem a planilha, C01 fica parcial (metragem, cabo, dias, OVERHEAD 40/56/48 e 158/219/187, COMP-08 = 81 e R$ 10.145,25 vindos do seu texto) e marcado como pendente.
- O teste de navegador autenticado contra o backend real não é executado. Ele roda apenas no ambiente isolado.
- A validação técnica e fiscal continua fora do software.
- Dados já existentes não são apagados. Registros suspeitos recebem a marca `revisar`.

## Detalhes técnicos
- Migrations novas: `authz_matriz`, `integridade_fk_compostas`, `estados_imutabilidade`, `aprovacoes_hash`, `custos_separados`, `rpcs_transacionais`, `idempotencia_numeracao`, `movimentos_estorno`.
- Novos arquivos: `src/features/calculo/{decimal,parse,domain.v2}.ts`, `src/features/auth/matriz.ts`, `tests/db/*.test.ts` (runner pg + migrations) e `tests/e2e/orcamento.spec.ts`.
- `AGENTS.md` será atualizado: RPC transacional como única via de escrita multi-etapa, e matriz de permissões como fonte única.
