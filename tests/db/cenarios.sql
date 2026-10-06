-- Cenários de integração com banco/RLS (executados como 'authenticated' com auth.uid() simulado).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only off
create or replace function pg_temp.como(_uid text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', _uid, false); $$;

-- ---------- dados: duas organizações e perfis ----------
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','admin@a'),('00000000-0000-0000-0000-00000000000c','campo@a'),
 ('00000000-0000-0000-0000-00000000000d','comercial@a'),('00000000-0000-0000-0000-00000000000e','compras@a'),
 ('00000000-0000-0000-0000-00000000000f','eng@a'),('00000000-0000-0000-0000-0000000000b0','admin@b');
insert into organizations(id,nome) values ('10000000-0000-0000-0000-000000000001','A'),('10000000-0000-0000-0000-000000000002','B');
insert into memberships(organization_id,user_id) select '10000000-0000-0000-0000-000000000001', id from auth.users where email like '%@a';
insert into memberships(organization_id,user_id) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b0');
insert into user_roles(organization_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','admin'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','campo'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','comercial'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000e','compras'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000f','engenharia'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b0','admin');

-- base operacional (como superusuário, para montar o cenário)
insert into clientes(id,organization_id,razao_social) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Cliente A');
insert into clientes(id,organization_id,razao_social) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Cliente B');
insert into fornecedores(id,organization_id,nome) values ('21000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Forn');
set session_replication_role = replica; -- fixture: código fixo de teste (gatilho de código protegido)
insert into produtos(id,organization_id,codigo,descricao,unidade,indivisivel) values ('22000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','COMP-01','Pilar','PÇ',true);
set session_replication_role = origin;
insert into propostas(id,organization_id,numero,cliente_id) values ('23000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','001/26','20000000-0000-0000-0000-000000000001');
insert into proposta_revisoes(id,organization_id,proposta_id,numero,parametros,textos,totais,desatualizada)
  values ('24000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001',1,'{}','{}','{"final":1}',false);
insert into revisao_componentes(id,organization_id,revisao_id,produto_id,codigo,descricao,unidade,modalidade,custo_adotado,indivisivel,multiplo_compra)
  values ('25000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','COMP-01','Pilar','PÇ','comprar',100,true,1);
insert into sistemas_dimensionados(id,organization_id,revisao_id,ordem,identificacao,tipo,metragem,trechos,origem)
  values ('26000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001',1,'S1','TELHADO',60,1,'manual');
insert into sistema_componentes(organization_id,revisao_id,sistema_id,revisao_componente_id,regra_chave,quantidade_tecnica,quantidade)
  values ('10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','pilar_telhado',7,7);
insert into demandas(id,organization_id,revisao_id,revisao_componente_id,modalidade,quantidade_necessaria,quantidade_planejada)
  values ('27000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','comprar',10,10);
insert into ordens_compra(id,organization_id,numero,revisao_id,fornecedor_id) values ('28000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','OC-T-1','24000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001');
insert into ordem_compra_itens(id,organization_id,ordem_id,demanda_id,quantidade,preco_unitario) values ('29000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001',10,100);
update ordens_compra set status='emitida' where id='28000000-0000-0000-0000-000000000001';

create temp table resultado(cenario text, esperado text, obtido text);
grant all on resultado to authenticated;
create or replace function pg_temp.tenta(_c text, _sql text, _deve_falhar boolean, _motivo text default '') returns void language plpgsql as $$
declare esp text := case when _deve_falhar then 'negado:'||_motivo else 'ok' end;
begin
  begin execute _sql;
    insert into resultado values (_c, esp, 'ok');
  exception when others then
    insert into resultado values (_c, esp, 'negado: '||sqlerrm);
  end;
end $$;

set role authenticated;
-- S02: campo não cria proposta nem vê custos; admin na empresa não amplia campo
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.tenta('S02 campo cria cliente', $$insert into clientes(organization_id,razao_social) values ('10000000-0000-0000-0000-000000000001','x')$$, true);
insert into resultado select 'S04 campo lê custos (linhas)', '0', count(*)::text from revisao_componentes;
insert into resultado select 'S04 campo lê revisões/totais (linhas)', '0', count(*)::text from proposta_revisoes;
insert into resultado select 'S04 campo lê OC com preço (linhas)', '0', count(*)::text from ordem_compra_itens;
select pg_temp.tenta('S02 campo registra recebimento', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',1,'k-campo')$$, true, 'Acesso negado');
-- S03: admin da org B não vê nem escreve na org A
select pg_temp.como('00000000-0000-0000-0000-0000000000b0');
insert into resultado select 'S03 admin B lê clientes de A', '0', count(*)::text from clientes where organization_id='10000000-0000-0000-0000-000000000001';
select pg_temp.tenta('S03 admin B cria proposta em A', $$insert into propostas(organization_id,numero,cliente_id) values ('10000000-0000-0000-0000-000000000001','x','20000000-0000-0000-0000-000000000001')$$, true);
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.tenta('S03 proposta A com cliente de B', $$insert into propostas(organization_id,numero,cliente_id) values ('10000000-0000-0000-0000-000000000001','y','20000000-0000-0000-0000-000000000002')$$, true);
-- S05: revisão/OC emitidas
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
-- The fixture's calculation is complete after its child inputs have been inserted.
-- Real application calculations clear this flag through concluir_revisao.
update proposta_revisoes set desatualizada=false where id='24000000-0000-0000-0000-000000000001';
update proposta_revisoes set status='enviada' where id='24000000-0000-0000-0000-000000000001';
select pg_temp.tenta('S05 enviada→rascunho', $$update proposta_revisoes set status='rascunho' where id='24000000-0000-0000-0000-000000000001'$$, true, 'Transição');
select pg_temp.tenta('S05 alterar totais da enviada', $$update proposta_revisoes set totais='{"final":2}' where id='24000000-0000-0000-0000-000000000001'$$, true);
select pg_temp.tenta('S05 excluir sistema da enviada', $$delete from sistemas_dimensionados where id='26000000-0000-0000-0000-000000000001'$$, true);
select pg_temp.tenta('S05 alterar preço de OC emitida', $$update ordem_compra_itens set preco_unitario=1 where id='29000000-0000-0000-0000-000000000001'$$, true);
select pg_temp.tenta('S05 alterar saldo recebido direto', $$update ordem_compra_itens set quantidade_recebida=5 where id='29000000-0000-0000-0000-000000000001'$$, true, 'movimento registrado');
select pg_temp.tenta('S05 incluir item em OC emitida', $$insert into ordem_compra_itens(organization_id,ordem_id,demanda_id,quantidade,preco_unitario) values ('10000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001',1,1)$$, true);
-- C06/T08: movimentos
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.tenta('C06 receber 1,5 peça', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',1.5,'k-frac')$$, true, 'fração');
select pg_temp.tenta('T08 receber 4', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',4,'k-1')$$, false);
select pg_temp.tenta('T08 repetir chave k-1', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',4,'k-1')$$, false);
select pg_temp.tenta('T05 chave k-1 com dados diferentes', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',3,'k-1')$$, true, 'dados diferentes');
select pg_temp.tenta('T08 receber 6', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',6,'k-2')$$, false);
select pg_temp.tenta('T08 excesso após saldo zero', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',1,'k-3')$$, true, 'saldo');
insert into resultado select 'T08 total recebido', '10', trim_scale(quantidade_recebida)::text from ordem_compra_itens where id='29000000-0000-0000-0000-000000000001';
select pg_temp.tenta('T08 estornar 2', $$select registrar_movimento('recebimento','29000000-0000-0000-0000-000000000001',2,'k-est',(select id from recebimentos where chave='k-1'))$$, false);
insert into resultado select 'T08 saldo após estorno', '2', trim_scale(quantidade - quantidade_recebida)::text from ordem_compra_itens where id='29000000-0000-0000-0000-000000000001';
insert into resultado select 'T08 movimentos preservados', '3', count(*)::text from recebimentos;
-- numeração atômica
insert into resultado select 'T06 números distintos', 'OC-…-001,002', string_agg(n, ',') from (select proximo_numero('10000000-0000-0000-0000-000000000001','OC') n union all select proximo_numero('10000000-0000-0000-0000-000000000001','OC')) x;
reset role;

select cenario, esperado,
  case when (esperado like 'negado:%' and obtido like 'negado%' and position(substr(esperado,8) in obtido) > 0) or esperado = obtido
         or (cenario like 'T06%' and obtido ~ '^OC-\d{4}-001,OC-\d{4}-002$') then 'PASSOU' else 'FALHOU' end as status,
  obtido
from resultado;
