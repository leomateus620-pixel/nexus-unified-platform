\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
-- Test-only isolated records. Never run this file against a deployed database.
insert into auth.users(id,email) values ('30000000-0000-0000-0000-000000000001','save-a@test.invalid'),('30000000-0000-0000-0000-000000000002','save-b@test.invalid'),('30000000-0000-0000-0000-000000000003','restricted@test.invalid');
insert into organizations(id,nome) values('31000000-0000-0000-0000-000000000001','Checkpoint isolated test');
insert into memberships(organization_id,user_id) select '31000000-0000-0000-0000-000000000001',id from auth.users where email like '%@test.invalid';
insert into user_roles(organization_id,user_id,role) values
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','admin'),
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','comercial'),
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','campo');
insert into clientes(id,organization_id,razao_social) values('32000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Test client');
insert into propostas(id,organization_id,cliente_id,numero) values('33000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','SAVE-TEST');
insert into proposta_revisoes(id,organization_id,proposta_id,numero,parametros,textos) values('34000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',1,'{"desconto":0,"markup":1}','{"objeto":"initial"}');
insert into sistemas_dimensionados(id,organization_id,revisao_id,ordem,identificacao,tipo,metragem,trechos) values
('35000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001',1,'Original','TELHADO',10,1);
-- The fixture is the initial checkpoint, just as the migration baselines real existing revisions.
update proposta_checkpoints set snapshot=snapshot_rascunho(revisao_id),versao_salva=versao where revisao_id='34000000-0000-0000-0000-000000000001';
create temp table captured(v jsonb); grant all on captured to authenticated;
select pg_temp.assert((select count(*)=0 from diferencas_comerciais('34000000-0000-0000-0000-000000000001',
 '{"override:35000000-0000-0000-0000-000000000001:35000000-0000-0000-0000-000000000002":{"nome":"Removed derived composition","campos":{"override_quantidade":5}}}', '{}')),
 'derived composition removal does not inflate manual differences');
select pg_temp.assert((select count(*)=1 from diferencas_comerciais('34000000-0000-0000-0000-000000000001', '{}',
 '{"override:35000000-0000-0000-0000-000000000001:35000000-0000-0000-0000-000000000002":{"nome":"Manual override","campos":{"override_quantidade":5}}}')),
 'manual override remains a commercial difference');
create temp table confirmations(v jsonb); grant all on confirmations to authenticated;
create function pg_temp.calc() returns jsonb language sql as $$ select '{"motor_versao":"isolated-sql-test","entradas":{},"itens":[],"resumo":{"totais":{"final":123.4567},"pendencias":[],"por_sistema":[],"por_componente":[]}}'::jsonb $$;
create function pg_temp.save(op uuid) returns jsonb language plpgsql as $$ declare c jsonb; begin c:=capturar_revisao('34000000-0000-0000-0000-000000000001',op); if c?'confirmacao' then return c->'confirmacao'; end if;
return concluir_revisao('34000000-0000-0000-0000-000000000001',(c->>'versao')::bigint,(c->>'versao_salva')::bigint,c->'snapshot',pg_temp.calc(),op); end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((pg_temp.save('36000000-0000-0000-0000-000000000001')->>'evento')::boolean=false,'no changes: no event');
update sistemas_dimensionados set identificacao='Middle',metragem=20 where id='35000000-0000-0000-0000-000000000001';
select pg_temp.assert((select desatualizada from proposta_revisoes where id='34000000-0000-0000-0000-000000000001'),'input changes mark the previous calculation stale');
update sistemas_dimensionados set identificacao='Final' where id='35000000-0000-0000-0000-000000000001';
update proposta_revisoes set parametros='{"desconto":0.1,"markup":2}',textos='{"objeto":"Changed"}' where id='34000000-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*)=0 from proposta_salvamentos),'autosaves do not create commercial events');
insert into confirmations values(pg_temp.save('36000000-0000-0000-0000-000000000002'));
select pg_temp.assert((select count(*)=1 and max(objetos)=3 and max(campos)=5 from proposta_salvamentos),'five fields in three objects = one save');
select pg_temp.assert((select diferencas @> '[{"campo":"identificacao","antes":"Original","depois":"Final"}]' from proposta_salvamentos),'repeated field becomes initial/final diff');
select pg_temp.assert((select pg_temp.save('36000000-0000-0000-0000-000000000002')=v from confirmations limit 1),'lost response/retry returns identical operation');
select pg_temp.assert((select count(*)=1 from proposta_salvamentos),'retry does not duplicate');
select pg_temp.assert((pg_temp.save('36000000-0000-0000-0000-000000000003')->>'evento')::boolean=false,'repeated save with no changes stays empty');
update sistemas_dimensionados set metragem=30 where id='35000000-0000-0000-0000-000000000001';
update sistemas_dimensionados set metragem=20 where id='35000000-0000-0000-0000-000000000001';
select pg_temp.assert((pg_temp.save('36000000-0000-0000-0000-000000000004')->>'evento')::boolean=false,'reverting exactly to initial makes no event');
insert into captured select capturar_revisao('34000000-0000-0000-0000-000000000001');
select concluir_revisao('34000000-0000-0000-0000-000000000001',(v->>'versao')::bigint,(v->>'versao_salva')::bigint,v->'snapshot',pg_temp.calc(),null) from captured;
select pg_temp.assert((select count(*)=1 from proposta_salvamentos),'recalculation is technical, not commercial');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
update sistemas_dimensionados set metragem=25 where id='35000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
do $$ declare c jsonb; begin select v into c from captured limit 1; begin perform concluir_revisao('34000000-0000-0000-0000-000000000001',(c->>'versao')::bigint,(c->>'versao_salva')::bigint,c->'snapshot',pg_temp.calc(),'36000000-0000-0000-0000-000000000005'); raise exception 'conflict accepted'; exception when serialization_failure then null; end; end $$;
select pg_temp.assert((select count(*)=1 from proposta_salvamentos),'conflict does not increment history');
-- A technical calculation between checkpoints must not replace the saved comparison total.
update proposta_revisoes set totais='{"totais":{"final":999},"pendencias":[]}' where id='34000000-0000-0000-0000-000000000001';
select pg_temp.save('36000000-0000-0000-0000-000000000006');
select pg_temp.assert((select (impacto->>'total_anterior')::numeric=123.4567 from proposta_salvamentos where id='36000000-0000-0000-0000-000000000006'),'impact compares confirmed checkpoint, not intervening calculation');
select pg_temp.assert((select diferencas @> '[{"campo":"metragem","autores":[{"autor_nome":"save-b@test.invalid"}]}]' from proposta_salvamentos where id='36000000-0000-0000-0000-000000000006'),'actual author B preserved when A consolidates');
update sistemas_dimensionados set metragem=26 where id='35000000-0000-0000-0000-000000000001';
do $$ declare c jsonb; begin c:=capturar_revisao('34000000-0000-0000-0000-000000000001'); begin perform concluir_revisao('34000000-0000-0000-0000-000000000001',(c->>'versao')::bigint,(c->>'versao_salva')::bigint,c->'snapshot',null,'36000000-0000-0000-0000-000000000007'); raise exception 'invalid calculation accepted'; exception when raise_exception then if sqlerrm='invalid calculation accepted' then raise; end if; end; end $$;
select pg_temp.assert((select count(*)=2 from proposta_salvamentos),'calculation failure has no event');
reset role;
create function pg_temp.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'injected audit failure'; end $$;
create trigger fail_audit before insert on proposta_salvamentos for each row execute function pg_temp.fail_audit();
set local role authenticated;
do $$ declare n int; begin select count(*) into n from calculo_execucoes; begin perform pg_temp.save('36000000-0000-0000-0000-000000000008'); raise exception 'audit failure accepted'; exception when raise_exception then if sqlerrm<>'injected audit failure' then raise; end if; end; perform pg_temp.assert((select count(*)=n from calculo_execucoes),'audit failure rolls back calculation atomically'); end $$;
select pg_temp.assert((select metragem=26 from sistemas_dimensionados where id='35000000-0000-0000-0000-000000000001'),'failed consolidation preserves synchronized draft');
select pg_temp.assert((select count(*)=2 from proposta_salvamentos),'audit failure does not increment history');
reset role; drop trigger fail_audit on proposta_salvamentos; set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from proposta_salvamentos),'restricted user cannot see diffs OR counts');
do $$ begin begin perform capturar_revisao('34000000-0000-0000-0000-000000000001'); raise exception 'unauthorized capture'; exception when raise_exception then if sqlerrm<>'Acesso negado' then raise; end if; end; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b0',true);
select pg_temp.assert((select count(*)=0 from proposta_salvamentos),'other organization cannot see history');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=2 from proposta_salvamentos),'second authorized user sees same persistent history');
select pg_temp.save('36000000-0000-0000-0000-000000000009');
select pg_temp.assert((select numero=1 and status='rascunho' from proposta_revisoes where id='34000000-0000-0000-0000-000000000001'),'save does not issue or create a formal revision');
update proposta_revisoes set status='enviada' where id='34000000-0000-0000-0000-000000000001';
do $$ begin begin perform pg_temp.save('36000000-0000-0000-0000-000000000010'); raise exception 'issued revision accepted'; exception when raise_exception then if sqlerrm<>'Revisão emitida é imutável' then raise; end if; end; end $$;
select pg_temp.assert((select count(*)=3 from proposta_salvamentos),'issued revision remains unchanged');
rollback;
