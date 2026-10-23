# Autorização atual nos comandos de pessoas

Em 22/10/2026, oito falhas foram reproduzidas exclusivamente no PostgreSQL16.15
descartável. Não foram cadastradas pessoas ou qualificações no banco operacional.

## Revogação durante espera

Os sete comandos de `0012` verificavam o papel antes de esperar pela chave de
idempotência. Duas sessões reais reproduziram a sequência: administração revoga
Engenharia em transação ainda aberta e segura a chave; escritor vê o papel antigo
e espera; administração confirma; escritor antigo persiste mesmo sem o papel.
O teste observa `pg_stat_activity.wait_event_type='Lock'`, sem depender de uma
pausa para presumir concorrência.

Foram afetados `salvar_pessoa`, `salvar_equipe`, `vincular_membro_equipe`,
`encerrar_membro_equipe`, `salvar_competencia`, `salvar_qualificacao` e
`transicionar_qualificacao`. A migração append-only `0025` adquire primeiro
`lev_travar_autor`, já privada e usada pelos levantamentos, na mesma ordem da
administração: trava organizacional de acesso, identidade do autor, idempotência
e entidade/par. A permissão existente é conferida depois dessa espera.

Após a correção, as sete disputas retornam SQLSTATE42501. Um snapshot ordenado
dos registros, histórico e recibos do escritor permanece idêntico; o recibo da
revogação administrativa é excluído dessa comparação por ser um efeito esperado.
Não houve mudança de assinatura, grants, payload/hash de idempotência, estados ou
regras de negócio desses comandos. O teste de instalação compara os sete corpos
com a fonte histórica, permitindo apenas as duas correções documentadas aqui.

## Conferência independente e pessoa arquivada

A conferência usava `operacao_minha_pessoa`, que exige pessoa ativa. Uma pessoa
arquivada mantendo seu vínculo de usuário e papel técnico conseguia validar a
própria qualificação em conferência. A reprodução local confirmou esse efeito.
O comando agora verifica a identidade estável `pessoas.user_id=auth.uid()`,
independentemente da situação ativa. Arquivamento não remove a exigência de outro
conferente autorizado. O teste exige42501 e nenhuma alteração/histórico/recibo.

## Evidências e limites

`evidencias/pessoas-autorizacao-44.json` distingue a reprodução vulnerável43 dos
testes corrigidos44, com hashes dos logs. O runner completo passou as suítes
históricas e operacionais, e o runner focado provou instalação limpa e upgrade
explícito43→44. A geração oficial preservou o hash dos tipos43, pois não mudou o
contrato das funções. Metadados/migração conectados possuem registro separado em
`migracoes.md`; estes testes não comprovam Auth/Storage HTTP operacional.
