# Plano: Auth abrindo direto na primeira página + login Google

## Estado atual (verificado)
- `/` já resolve para a rota protegida `_authenticated/index.tsx`, cujo guarda (`_authenticated/route.tsx`) redireciona quem não está logado para `/auth`. Ou seja, ao abrir https://nexusgestao.app sem sessão, a tela de login já deve aparecer.
- A tela `/auth` já tem e-mail/senha e o botão "Continuar com Google" usando `lovable.auth.signInWithOAuth("google")`.
- O provedor Google foi habilitado no backend, mas ainda não foi validado de ponta a ponta no domínio publicado.

## O que será feito

1. **Entrada direta no login**
   - Confirmar que não existe nenhuma rota pública concorrente em `/` (não há `src/routes/index.tsx` — apenas a protegida).
   - Garantir que o redirecionamento para `/auth` ocorra sem tela de "carregando" presa: o guarda já redireciona em `beforeLoad`; ajustar apenas se o teste mostrar falha.
   - Se o usuário já estiver logado, `/auth` redireciona de volta para `/` (já implementado; validar).

2. **Login com Google**
   - Chamar a ferramenta de configuração de login social (`google`) para garantir o provedor ativo com as credenciais gerenciadas do Lovable Cloud.
   - Manter `redirect_uri: window.location.origin` (funciona no domínio customizado nexusgestao.app).
   - Após login Google, o usuário cai em `/`; se não tiver organização, vê a tela de criação da organização (fluxo já existente).

3. **Validação**
   - Typecheck e build sem erros.
   - Teste no navegador: abrir `/` deslogado → cai em `/auth`; clicar "Continuar com Google" → fluxo Google abre; login com e-mail/senha → entra em `/`.
   - Confirmar que o domínio publicado (nexusgestao.app) responde o mesmo comportamento após publicação.

## Detalhes técnicos
- Arquivos envolvidos: `src/routes/_authenticated/route.tsx` (guarda), `src/routes/auth.tsx` (login), ferramenta `configure_social_auth` (Google).
- Nenhuma alteração nos módulos industriais/Trevisan/Mapas 3D.
- Nenhuma mudança de configuração de confirmação de e-mail (cadastro por e-mail continua exigindo confirmação).
- Para o login Google funcionar no domínio publicado, o app precisa estar **publicado** (botão Publish) com a versão atual.
