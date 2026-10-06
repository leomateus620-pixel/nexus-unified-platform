# Ocultar Configurações para o Ricardo (Engenharia)

## O que muda
- As telas "Usuários e permissões" e "Orçamentos" deixam de aparecer para o papel Engenharia e ficam bloqueadas ("Sem acesso") se abertas pelo endereço.
- Sem essas duas telas, Configurações ficaria só com o atalho "Regras técnicas", que já existe no menu Engenharia. Por isso o item Configurações sai do menu lateral dele.
- Menu final do Ricardo: Dashboard, Comercial, Produtos e Soluções e Engenharia.
- Administradores continuam vendo tudo como hoje.

## Verificação
Entrar com a conta do Ricardo, confirmar o menu sem Configurações e que /configuracoes e /configuracoes/orcamentos mostram "Sem acesso".

## Detalhes técnicos
- Remover "/configuracoes" da lista `menus` do papel engenharia em `ACESSO_POR_PAPEL` (`src/lib/nexus-nav.ts`); o bloqueio por rota já existente no gate cobre as duas subtelas.
