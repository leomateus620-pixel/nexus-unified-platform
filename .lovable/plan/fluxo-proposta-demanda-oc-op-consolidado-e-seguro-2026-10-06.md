# Fluxo proposta → demanda → OC/OP consolidado e seguro

Base revalidada: HEAD atual = `bd1610e`. Escopo: `propostas.functions.ts`, `Etapas.tsx` (Planejamento), cálculo canônico, aprovação técnica e telas de Compras/Produção. Catálogo e fluxo de proposta não são recriados.

## Estado atual confirmado
- `gerarDemanda` grava por upsert e apaga demandas planejadas que saíram; para demandas já alocadas só devolve `{id, nova}` e a tela não usa esse retorno.
- `gerarOrdens` faz várias gravações separadas pelo navegador do servidor (sem transação): procura OC por `revisao_id + fornecedor` com `maybeSingle()` (quebra se houver OC complementar e reaproveita OC emitida), procura a OP só por revisão, grava a quantidade planejada inteira (não o saldo) e marca **todas** as demandas como alocadas.
- `hash_tecnico` considera apenas sistemas, códigos, quantidades de sistema e regras — ignora itens avulsos, estrutura local e inclusão no orçamento.
- O gatilho de liberação de OP compara a aprovação com o hash **atual** da revisão, não com o conteúdo que originou a OP.
- Migrations: `supabase/migrations` (base) + `drizzle/migrations` 0000–0009; `tests/db/run.sh` aplica só a primeira pasta.

## O que muda para o usuário
1. **Reconciliação visível** em Planejamento de compras/produção: por item, necessidade atual, em ordens (comprometida), realizada e saldo sem ordem; selos "novo", "aumentou", "reduziu abaixo do comprometido", "mudou fornecedor/modalidade", com a origem (sistema ou item avulso/caminho da estrutura). Redução abaixo do comprometido vira pendência clara — nada é cancelado ou apagado.
2. **Botão de geração explicativo**: "Gerar 2 OC (Fornecedor A, B) e 1 OP" calculado pelo saldo descoberto; desabilitado com motivo quando não há saldo. Após confirmar, lista das ordens **criadas, reutilizadas (rascunho) ou complementadas**, com links.
3. **Geração segura**: um clique, retry, duplo clique ou duas sessões produzem o mesmo resultado. Ordens emitidas/liberadas nunca recebem itens; o saldo vai para um rascunho compatível ou uma nova ordem complementar.
4. **Aprovação técnica completa**: mudança de quantidade, avulso, estrutura local ou inclusão de item invalida a aprovação; mudança só de custo/preço/textos não invalida. Cada OP guarda o fingerprint aprovado que a originou; liberação exige que esse mesmo conteúdo esteja aprovado.
5. Estados distintos de carregamento, erro (com tentar de novo, mantendo o preenchido) e "sem demanda"; layout compacto e legível no celular.

## Detalhes técnicos

### Banco (uma migration nova em `drizzle/migrations`, aditiva)
- `hash_tecnico(_rev)` v2: inclui sistemas (tipo/metragem/trechos/ordem), `sistema_componentes` (quantidade técnica, quantidade, override), `revisao_componentes` técnicos (codigo, produto_id, modalidade, incluido_orcamento, quantidade_avulsa, estrutura, indivisivel, multiplo_compra), `regras_snapshot`. Exclui custo, fornecedor, preço, textos. Aprovações existentes: comparação continua no hash gravado; ao trocar a função, aprovações antigas ficam inválidas de forma explícita (registro em auditoria) — **decisão pendente** abaixo.
- `ordens_producao.hash_tecnico text` e `ordens_compra.hash_tecnico text` (nullable) gravados na geração; `demandas.versao_revisao bigint` (versão da revisão usada no planejamento).
- Gatilho `op_exige_aprovacao` v2: exige aprovação técnica não invalidada com `hash_conteudo = new.hash_tecnico` **e** igual ao hash atual da revisão; OP antiga sem hash é bloqueada até replanejar.
- RPC `gerar_ordens(_rev uuid, _chave text, _versao bigint) returns jsonb` (SECURITY DEFINER, `pode(org,'emitir_ordem')`): `pg_advisory_xact_lock` por revisão; idempotência por `_chave` (tabela `geracao_ordens(chave unique, resposta jsonb)`); valida `rev.version = _versao`, `desatualizada = false` e versão das demandas; por demanda calcula saldo = planejada − Σ itens de ordens não canceladas; arredonda por múltiplo/indivisível; reutiliza só OC `rascunho` do mesmo fornecedor (ou OP `rascunho`) com mesmo `hash_tecnico`, senão cria nova com `proximo_numero`; incrementa item existente em rascunho; atualiza status da demanda (`alocada`/`parcial`) só quando coberta; auditoria; retorna `{criadas, reutilizadas, complementadas, itens}`. Tudo numa transação: falha = nada gravado.
- RPC `reconciliar_demanda(_rev)` leitura (ou view) com necessidade, comprometida, realizada, saldo, pendência de redução.
- `gerarDemanda`: passa a atualizar `quantidade_necessaria` também das alocadas (sem tocar ordens), registra origem/fornecedor/modalidade anterior para diff, e não apaga demandas com itens em ordem. Grants/RLS conforme padrão.

### Servidor / interface
- `gerarOrdens` vira chamada única à RPC com `chave` gerada no cliente e fixada na mutação (mesmo padrão de `registrarMovimento`) e `versao` lida da revisão.
- `previaOrdens(revisao_id)` server fn: diz quantas OC/OP e para quais fornecedores, sem gravar.
- `Etapas.tsx` (Planejamento): tabela/cartões de reconciliação, aviso de pendências de redução, botão explicativo, painel de resultado com links para `/compras/ordens-compra/$id` e `/compras/ordens-producao/$id` e para o item da proposta.
- Detalhe da OP: mostra se a aprovação do conteúdo de origem é válida e o motivo do bloqueio.

### Validação
- `tests/db/run.sh` e `run.ps1`: aplicar também `drizzle/migrations/*.sql` em ordem após `supabase/migrations`, sem duplicar o que já foi espelhado (conferir sobreposição antes).
- Cenários SQL novos: avulsos + BOM gerando demanda; aumento → complemento em rascunho; aumento com OC emitida → nova OC complementar; redução abaixo do comprometido → pendência sem cancelamento; 10 sessões paralelas com mesma chave e com chaves diferentes → nenhuma duplicação; revisão desatualizada/versão divergente → recusa; mudança técnica invalida aprovação, mudança de custo não; OP antiga não libera com aprovação nova; recebimentos/apontamentos preservados.
- Vitest para cálculo de saldo/arredondamento (função pura no domínio), typecheck, lint, build. Sem emissão de ordens reais nem alteração de contas; migration aplicada só ao ambiente após aprovação deste plano.

## Decisões pendentes (não bloqueiam a implementação)
- Aprovações técnicas já existentes ficarão inválidas ao adotar o novo fingerprint; será preciso reaprovar as revisões em andamento.
- OPs em rascunho criadas antes desta mudança não têm fingerprint de origem: proposta é exigir "replanejar" antes de liberar.
- Redução abaixo do comprometido: o cancelamento/ajuste da ordem continua manual (não há fluxo de cancelamento de item hoje).
