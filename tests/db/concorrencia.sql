-- T07: item novo de 10 unidades, duas sessões simultâneas tentam receber 7.
insert into ordens_compra(id,organization_id,numero,revisao_id,fornecedor_id) values ('28000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','OC-T-2','24000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001');
insert into ordem_compra_itens(id,organization_id,ordem_id,demanda_id,quantidade,preco_unitario) values ('29000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000001',10,100);
update ordens_compra set status='emitida' where id='28000000-0000-0000-0000-000000000002';
