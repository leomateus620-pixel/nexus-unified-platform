# Acesso do Ricardo (Engenharia)

## O que será feito
1. Criar a conta engenharia@nexusagroindustrial.com.br já confirmada, com a senha informada, vinculada à empresa NEXUS com o papel **engenharia**.
2. Menu lateral para ele mostra somente: Dashboard, Comercial, Produtos e Soluções, Engenharia e Configurações. Os demais menus ficam ocultos e, se acessados pelo endereço, mostram "Sem acesso".
3. Dentro de uma proposta comercial, ele vê e edita só 5 etapas: **Itens, Dimensionamento, Orçamento, Compras, Produção**. Resumo, Parâmetros e Histórico ficam ocultos e bloqueados.
4. Produtos e Soluções: visualizar, cadastrar, editar, compor e anexar arquivos.
5. Engenharia: acesso total (regras de dimensionamento e dimensionamentos).
6. Configurações: acesso às telas de Usuários e Orçamentos.
7. Testar entrando com a conta dele: navegar por cada menu liberado, editar um item, salvar, e confirmar que os bloqueados não aparecem.

## Permissões nas ações (servidor)
Para as etapas Compras e Produção funcionarem de verdade, o papel engenharia passa a poder também: emitir ordem de compra/produção e receber (hoje só Compras). Ele já pode criar proposta, editar revisão, aprovar técnica, planejar suprimentos, produzir, importar catálogo e ver custos. Aceite comercial continua só para Comercial.

## Observações
- A senha "Nexus2026!" é simples e pode estar em listas de senhas vazadas; se o sistema recusar, uso uma variação e te informo. Recomendo que o Ricardo troque no primeiro acesso.
- A senha é usada só uma vez e não fica no código.

## Detalhes técnicos
- Conta criada por rotina única no servidor (`auth.admin.createUser`, `email_confirm: true`), idempotente, removida depois; upsert em `memberships` e `user_roles`.
- Nova matriz de visibilidade por papel em `src/lib/nexus-nav.ts` (menus) e na lista de etapas da revisão (abas), lida de `useOrg().roles`; admin continua vendo tudo.
- Bloqueio por rota: componente de guarda nas rotas ocultas (resumo-executivo, parametros, historico e menus fora da lista).
- `MATRIZ` em `autorizacao.ts` + função SQL `pode()` atualizadas juntas (migration) para incluir engenharia em `emitir_ordem` e `receber`; testes de autorização ajustados.
