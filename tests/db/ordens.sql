-- Geração transacional de OC/OP, reconciliação e aprovação técnica v2 (ids 4x...).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
\pset fieldsep ' | '
set session_replication_role = replica;
insert into produtos(id,organization_id,codigo,descricao,unidade) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','TST-C1','Chapa','PÇ'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','TST-F1','Conjunto','PÇ');
set session_replication_role = origin;
insert into propostas(id,organization_id,numero,cliente_id) values ('41000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','T-ORD','20000000-0000-0000-0000-000000000001');
insert into proposta_revisoes(id,organization_id,proposta_id,numero,parametros,textos,totais,desatualizada)
  values ('42000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',1,'{}','{}','{"final":1}',false);
insert into revisao_componentes(id,organization_id,revisao_id,produto_id,codigo,descricao,unidade,modalidade,custo_adotado,indivisivel,multiplo_compra,fornecedor_id,quantidade_avulsa) values
 ('43000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','TST-C1','Chapa','PÇ','comprar',10,true,5,'21000000-0000-0000-0000-000000000001',3),
 ('43000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','TST-F1','Conjunto','PÇ','fabricar',50,true,1,null,2);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
insert into demandas(id,organization_id,revisao_id,revisao_componente_id,modalidade,quantidade_necessaria,quantidade_planejada,hash_tecnico) values
 ('44000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001','comprar',3,3,hash_tecnico('42000000-0000-0000-0000-000000000001')),
 ('44000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000002','fabricar',2,2,hash_tecnico('42000000-0000-0000-0000-000000000001'));
update proposta_revisoes set desatualizada=false where id='42000000-0000-0000-0000-000000000001';
create temp table h0 as select hash_tecnico('42000000-0000-0000-0000-000000000001') h;
grant select on h0 to authenticated;
create or replace function pg_temp.oc_qtd() returns numeric language sql as $$ select coalesce(sum(i.quantidade),0) from ordem_compra_itens i where demanda_id='44000000-0000-0000-0000-000000000001' $$;
set role authenticated;
select 'G01 gera OC e OP do saldo (múltiplo 5)', case when (gerar_ordens('42000000-0000-0000-0000-000000000001','k1-aaaaaa')->>'itens')::int=2 and pg_temp.oc_qtd()=5 then 'PASSOU' else 'FALHOU' end;
select 'G02 mesma chave não duplica', case when (gerar_ordens('42000000-0000-0000-0000-000000000001','k1-aaaaaa')->>'repetido')='true' and (select count(*) from ordens_compra where revisao_id='42000000-0000-0000-0000-000000000001')=1 then 'PASSOU' else 'FALHOU' end;
select 'G03 chave nova sem saldo não cria nada', case when (gerar_ordens('42000000-0000-0000-0000-000000000001','k2-aaaaaa')->>'itens')::int=0 then 'PASSOU' else 'FALHOU' end;
reset role;
update demandas set quantidade_planejada=8 where id='44000000-0000-0000-0000-000000000001';
set role authenticated;
select 'G04 aumento complementa rascunho', case when (gerar_ordens('42000000-0000-0000-0000-000000000001','k3-aaaaaa')->'ordens'->0->>'acao')='complementada' and pg_temp.oc_qtd()=10 then 'PASSOU' else 'FALHOU' end;
reset role;
update ordens_compra set entrega_prevista=current_date, condicoes='x', status='emitida' where revisao_id='42000000-0000-0000-0000-000000000001';
update demandas set quantidade_planejada=12 where id='44000000-0000-0000-0000-000000000001';
set role authenticated;
select gerar_ordens('42000000-0000-0000-0000-000000000001','k4-aaaaaa'), (select count(*) from ordens_compra where revisao_id='42000000-0000-0000-0000-000000000001'), (select string_agg(status||':'||i.quantidade,',') from ordem_compra_itens i join ordens_compra o on o.id=i.ordem_id where o.revisao_id='42000000-0000-0000-0000-000000000001');
select 'G05 OC emitida intacta; saldo vai a OC complementar', case when (select resposta->'ordens'->0->>'acao' from geracao_ordens where chave='k4-aaaaaa')='criada'
  and (select count(*) from ordens_compra where revisao_id='42000000-0000-0000-0000-000000000001')=2
  and (select sum(i.quantidade) from ordem_compra_itens i join ordens_compra o on o.id=i.ordem_id where o.status='emitida' and o.revisao_id='42000000-0000-0000-0000-000000000001')=10
  and pg_temp.oc_qtd()=15 then 'PASSOU' else 'FALHOU' end;
reset role;
update demandas set quantidade_planejada=4 where id='44000000-0000-0000-0000-000000000001';
set role authenticated;
select 'G06 redução abaixo do comprometido: sem cancelamento', case when (gerar_ordens('42000000-0000-0000-0000-000000000001','k5-aaaaaa')->>'itens')::int=0 and pg_temp.oc_qtd()=15 then 'PASSOU' else 'FALHOU' end;
reset role;
update revisao_componentes set custo_adotado=99 where id='43000000-0000-0000-0000-000000000001';
select 'A01 mudança comercial preserva fingerprint', case when hash_tecnico('42000000-0000-0000-0000-000000000001')=(select h from h0) then 'PASSOU' else 'FALHOU' end;
insert into aprovacoes(organization_id,revisao_id,tipo,hash_conteudo,autor) values ('10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','tecnica',(select h from h0),'00000000-0000-0000-0000-00000000000f');
update revisao_componentes set quantidade_avulsa=4 where id='43000000-0000-0000-0000-000000000002';
select 'A02 avulso altera fingerprint', case when hash_tecnico('42000000-0000-0000-0000-000000000001')<>(select h from h0) then 'PASSOU' else 'FALHOU' end;
update proposta_revisoes set desatualizada=false where id='42000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin perform gerar_ordens('42000000-0000-0000-0000-000000000001','k6-aaaaaa'); raise exception 'sem erro'; exception when others then
  if sqlerrm like '%composição técnica mudou%' then create temp table g07 as select 1; end if; end $$;
select 'G07 demanda desatualizada recusa geração', case when exists(select 1 from pg_tables where tablename='g07') then 'PASSOU' else 'FALHOU' end;
reset role;
do $$ begin update ordens_producao set status='liberada', responsavel='x', prazo=current_date where revisao_id='42000000-0000-0000-0000-000000000001'; raise exception 'sem erro'; exception when others then
  if sqlerrm like '%mudou desde que esta OP%' then create temp table a03 as select 1; end if; end $$;
select 'A03 OP antiga não libera após mudança técnica', case when exists(select 1 from pg_tables where tablename='a03') then 'PASSOU' else 'FALHOU' end;
update revisao_componentes set quantidade_avulsa=2 where id='43000000-0000-0000-0000-000000000002';
update ordens_producao set status='liberada', responsavel='x', prazo=current_date where revisao_id='42000000-0000-0000-0000-000000000001';
select 'A04 OP libera com aprovação do conteúdo de origem', case when (select status from ordens_producao where revisao_id='42000000-0000-0000-0000-000000000001')='liberada' then 'PASSOU' else 'FALHOU' end;
update proposta_revisoes set desatualizada=false where id='42000000-0000-0000-0000-000000000001';
update demandas set quantidade_planejada=30, hash_tecnico=(select h from h0) where id='44000000-0000-0000-0000-000000000001';
update demandas set hash_tecnico=(select h from h0) where revisao_id='42000000-0000-0000-0000-000000000001';
