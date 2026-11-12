-- Reproduz fronteiras do calendário e mantém a vigência independente da conclusão técnica.
begin;

insert into public.organizations(id,nome) values ('e1640000-0000-0000-0000-000000000001','R64 teste');
insert into auth.users(id,email) values ('e1640000-0000-0000-0000-000000000010','r64-teste@example.invalid');
insert into public.clientes(id,organization_id,razao_social) values
 ('e1640000-0000-0000-0000-000000000002','e1640000-0000-0000-0000-000000000001','Cliente de teste');
insert into public.unidades(id,organization_id,cliente_id,nome) values
 ('e1640000-0000-0000-0000-000000000003','e1640000-0000-0000-0000-000000000001','e1640000-0000-0000-0000-000000000002','Unidade de teste');
insert into public.inspecoes_contextos(organization_id,cliente_id,unidade_id)
values ('e1640000-0000-0000-0000-000000000001','e1640000-0000-0000-0000-000000000002','e1640000-0000-0000-0000-000000000003');

insert into public.inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,codigo,situacao,data_ref,vigente,existente,snapshot)
select ('e1640000-0000-0000-0000-000000000'||x.key)::uuid,'e1640000-0000-0000-0000-000000000001',
 'e1640000-0000-0000-0000-000000000002','e1640000-0000-0000-0000-000000000003',
 x.colecao,x.key,x.key,x.key,x.situacao,x.data_ref,x.vigente,x.existente,x.snapshot
from (values
 ('101','documentos','emitido',null::date,true,true,'{}'::jsonb),
 ('102','documentos','emitido',null,true,true,'{}'),
 ('103','documentos','emitido',null,true,true,'{}'),
 ('201','ativos','em_uso',null,true,true,'{"resultado":"nao_apto"}'),
 ('202','ativos','em_uso',null,true,true,'{"resultado":"apto"}'),
 ('203','ativos','em_uso',null,true,true,'{}'),
 ('204','ativos','inexistente',null,true,false,'{}'),
 ('205','ativos','cancelado',null,true,true,'{"cancelado":true}'),
 ('206','ativos','substituido',null,false,true,'{}'),
 ('301','inspecoes',null,date '2024-02-29',true,true,'{"tipo_inspecao":"T1","data_precisao":"dia"}'),
 ('302','inspecoes',null,date '2024-04-01',true,true,'{"tipo_inspecao":"T2"}'),
 ('303','inspecoes',null,date '2024-01-01',true,true,'{"tipo_inspecao":"T4"}'),
 ('304','inspecoes',null,date '2024-01-01',true,true,'{"tipo_inspecao":"T4"}'),
 ('305','inspecoes',null,date '2024-01-01',true,true,'{"tipo_inspecao":"T4"}'),
 ('306','inspecoes',null,date '2024-01-01',true,true,'{"tipo_inspecao":"T4"}'),
 ('307','inspecoes',null,date '2024-07-01',true,true,'{"tipo_inspecao":"T4","cancelado":true}'),
 ('308','inspecoes',null,date '2024-08-01',true,true,'{"tipo_inspecao":"T6"}')
) x(key,colecao,situacao,data_ref,vigente,existente,snapshot);

insert into public.inspecoes_registros(id,organization_id,colecao,source_id,titulo,codigo,snapshot)
values ('e1640000-0000-0000-0000-000000000401','e1640000-0000-0000-0000-000000000001',
 'familias','ANC','Ancoragem','ANC','{}');

insert into public.inspecoes_relacoes(organization_id,cliente_id,unidade_id,origem_id,destino_id,tipo)
select 'e1640000-0000-0000-0000-000000000001','e1640000-0000-0000-0000-000000000002','e1640000-0000-0000-0000-000000000003',
 ('e1640000-0000-0000-0000-000000000'||x.origem)::uuid,('e1640000-0000-0000-0000-000000000'||x.destino)::uuid,x.tipo
from (values
 ('102','101','principal'),('103','101','substituido_por'),
 ('301','201','ativo'),('301','101','documento'),('302','202','ativo'),('302','102','documento'),
 ('303','203','ativo'),('303','103','documento'),('304','204','ativo'),('304','101','documento'),
 ('305','205','ativo'),('305','101','documento'),('306','206','ativo'),('306','101','documento'),
 ('307','201','ativo'),('307','101','documento'),('308','201','ativo'),('308','101','documento')
) x(origem,destino,tipo);

do $$
declare
 org uuid:='e1640000-0000-0000-0000-000000000001';
 g record;
 ciclo uuid;
begin
 select * into strict g from public.inspecoes_r64_grupos(org,'2024-11-29');
 if g.vence <> date '2025-02-28' or g.aviso_em <> date '2024-11-30' or g.situacao <> 'em_dia'
    or jsonb_array_length(g.ativos) <> 2 or not (g.ativos->0->>'sem_validade')::boolean
    or g.documento_id <> 'e1640000-0000-0000-0000-000000000101'::uuid
 then raise exception 'R64 FALHOU: calendário, complementos, filtros ou validade.'; end if;
 if (select situacao from public.inspecoes_r64_grupos(org,'2024-11-30')) <> 'em_aviso'
    or (select situacao from public.inspecoes_r64_grupos(org,'2025-02-28')) <> 'em_aviso'
    or (select situacao from public.inspecoes_r64_grupos(org,'2025-03-01')) <> 'vencido'
 then raise exception 'R64 FALHOU: fronteira de aviso ou vencimento.'; end if;

 perform public.inspecoes_r64_recalcular(org,'2024-11-30');
 select id into strict ciclo from public.inspecoes_r64_ciclos where organization_id=org;
 perform public.inspecoes_r64_recalcular(org,'2024-11-30');
 if (select id from public.inspecoes_r64_ciclos where organization_id=org) <> ciclo
 then raise exception 'R64 FALHOU: ciclo não idempotente.'; end if;

 insert into public.inspecoes_levantamentos(organization_id,cliente_id,unidade_id,ativo_id,tipo,data_inspecao,
   familia_registro_id,checklist,created_by)
 values(org,'e1640000-0000-0000-0000-000000000002','e1640000-0000-0000-0000-000000000003',
   'e1640000-0000-0000-0000-000000000201','T4','2025-02-27',
   'e1640000-0000-0000-0000-000000000401','[]','e1640000-0000-0000-0000-000000000010');
 perform public.inspecoes_r64_recalcular(org,'2025-03-01');
 if (select situacao from public.inspecoes_r64_ciclos where id=ciclo) <> 'vencido'
    or (select vence from public.inspecoes_r64_grupos(org,'2025-03-01')) <> date '2025-02-28'
 then raise exception 'R64 FALHOU: rascunho alterou o ciclo.'; end if;
 raise notice 'R64 PASSOU: bissexto, D3, vencimento, complemento, substituição, cancelamento, inexistência, não apto, idempotência e rascunho.';
end
$$;
rollback;
