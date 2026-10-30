-- Listagem PET: escopo e busca literal antes da paginação. Não altera atos,
-- regras de segurança, snapshots, assinaturas ou documentos da permissão.
-- O contrato mantém página zero e limite padrão 50 para clientes existentes.
create or replace function public.pet_listar(p_org uuid,p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_pagina integer:=greatest(0,coalesce((p_filtros->>'pagina')::integer,0));
 v_limite integer:=least(100,greatest(1,coalesce((p_filtros->>'limite')::integer,50)));
 v_os uuid:=nullif(p_filtros->>'os_id','')::uuid;
 v_unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;
 v_busca text:=lower(trim(coalesce(p_filtros->>'busca','')));
 v_agora timestamptz:=clock_timestamp();
 r jsonb;
begin
 if not public.operacao_pode(p_org,'ver_operacao') then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 with filtradas as materialized (
  select p.*,e.identificacao as espaco_nome
  from public.pet_permissoes p
  join public.pet_espacos e on e.organization_id=p.organization_id and e.id=p.espaco_id
  where p.organization_id=p_org and public.pet_ler(p_org,p.id)
   and(v_os is null or p.os_id=v_os)
   and(v_unidade is null or p.unidade_id=v_unidade)
   -- strpos trata %, _ e barras como caracteres literais, sem padrões LIKE.
   and(v_busca='' or strpos(lower(concat_ws(' ',p.numero,p.atividade,e.identificacao)),v_busca)>0)
 ), pagina as (
  select * from filtradas order by created_at desc,id
  limit v_limite offset v_pagina::bigint*v_limite
 ), registros as (
  select p.*,
   (select pt.nome_snapshot from public.pet_participantes pt where pt.organization_id=p_org
     and pt.pet_id=p.id and pt.funcao='supervisor' and pt.fim is null limit 1) as responsavel_nome,
   (select count(*) from public.pet_intervalos i where i.organization_id=p_org
     and i.pet_id=p.id and i.saida_em is null) as presentes,
   case when p.emitida_em is null then 'nao_emitida' when p.termino_previsto<=v_agora
     then 'expirada' else 'vigente' end as validade_temporal
  from pagina p
 )
 select jsonb_build_object(
  'registros',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from registros x),'[]'),
  'ordens',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.ordens_servico o
    where o.organization_id=p_org and public.os_ler(p_org,o.id)),'[]'),
  'total',(select count(*) from filtradas),
  'pagina',v_pagina,'limite',v_limite
 ) into r;
 return r;
end$$;
revoke all on function public.pet_listar(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pet_listar(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
