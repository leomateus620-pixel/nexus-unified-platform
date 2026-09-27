set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_sleep(0.3);
select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000002',7, :'chave');
