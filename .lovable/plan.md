# Criar acessos de administrador

## O que será feito
1. Criar as duas contas já confirmadas (sem precisar clicar no e-mail de confirmação), com as senhas informadas:
   - diego.jose.reginaldo@gmail.com
   - leomateus620@gmail.com
2. Criar a empresa NEXUS (se ainda não existir) e vincular as duas contas a ela.
3. Dar o papel **admin** às duas contas na empresa, o que libera todos os menus, custos, margens e Configurações.
4. Testar a entrada com as duas contas na tela de login e confirmar que o Dashboard abre.

## Observações
- As senhas serão usadas só uma vez para criar as contas e não ficarão salvas no código.
- Recomendo que cada um troque a senha depois do primeiro acesso, porque elas foram enviadas pelo chat.
- As mesmas contas também poderão entrar com "Continuar com Google" (mesmo e-mail) no endereço publicado.

## Detalhes técnicos
- Uma rotina única no servidor, que roda uma vez e depois é removida, usa a API administrativa de autenticação (`auth.admin.createUser` com `email_confirm: true`). É idempotente: se a conta já existir, só atualiza a senha e a confirmação.
- A empresa, os vínculos e os papéis são gravados nas tabelas `organizations`, `memberships` e `user_roles` (role `admin`) com upsert nas chaves únicas.
- A confirmação automática vale só para essas duas contas; o cadastro público continua exigindo confirmação por e-mail.
