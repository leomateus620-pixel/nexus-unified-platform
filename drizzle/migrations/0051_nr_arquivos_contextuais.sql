-- A identidade física não substitui o contexto de cada associação documental.
-- Mantém FKs, permissões, estados e bytes; altera somente a projeção de leitura.
create or replace function public.nr_arquivo_listar(p_org uuid,p_norma text,p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 linhas jsonb; n bigint;
 pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);
 limite integer:=coalesce((p_filtros->>'limite')::integer,25);
 cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;
 unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;
 documento uuid:=nullif(p_filtros->>'documento_id','')::uuid;
 revisao uuid:=nullif(p_filtros->>'revisao_id','')::uuid;
 local uuid:=nullif(p_filtros->>'local_id','')::uuid;
 pasta uuid:=nullif(p_filtros->>'pasta_id','')::uuid;
 ids uuid[];
begin
 if not public.pode(p_org,'ver_nr')or p_norma is null or p_norma not in('NR33','NR35')then
  raise exception 'Acesso negado.'using errcode='42501';
 end if;
 if pagina not between 0 and 1000000 or limite not between 1 and 100 then
  raise exception 'Paginação inválida.'using errcode='23514';
 end if;
 if p_filtros?'arquivo_ids'then
  if jsonb_typeof(p_filtros->'arquivo_ids')is distinct from'array'then
   raise exception 'Informe uma lista de identidades de arquivo.'using errcode='23514';
  end if;
  if jsonb_array_length(p_filtros->'arquivo_ids')>100 then
   raise exception 'Consulte até cem identidades de arquivo por vez.'using errcode='23514';
  end if;
  select coalesce(array_agg(distinct valor::uuid),'{}'::uuid[])into ids
   from jsonb_array_elements_text(p_filtros->'arquivo_ids')e(valor);
 end if;
 -- Todos os critérios, inclusive a norma do documento, pertencem à MESMA associação.
 with filtered as(
  select a.* from public.nr_arquivos a
  where a.organization_id=p_org and(ids is null or a.id=any(ids))
   and(case when coalesce((p_filtros->>'lixeira')::boolean,false)then a.estado='arquivado'
       else a.estado='vinculado'or(a.created_by=auth.uid()and a.estado in('preparado','falhou'))end)
   and(
    ((cliente is null or a.cliente_id=cliente)and(unidade is null or a.unidade_id=unidade)
     and(documento is null or a.documento_id=documento)and(revisao is null or a.revisao_id=revisao)
     and(local is null or a.local_id=local)and(pasta is null or a.pasta_id=pasta)
     and(p_norma=any(a.normas)or exists(select 1 from public.nr_documentos d
       where d.organization_id=p_org and d.id=a.documento_id and p_norma=any(d.normas))))
    or exists(select 1 from public.nr_arquivo_vinculos v
     where v.organization_id=p_org and v.arquivo_id=a.id
      and(cliente is null or v.cliente_id=cliente)and(unidade is null or v.unidade_id=unidade)
      and(documento is null or v.documento_id=documento)and(revisao is null or v.revisao_id=revisao)
      and(local is null or v.local_id=local)and(pasta is null or v.pasta_id=pasta)
      and(p_norma=any(a.normas)or exists(select 1 from public.nr_documentos d
       where d.organization_id=p_org and d.id=v.documento_id and p_norma=any(d.normas)))))
   and(coalesce(p_filtros->>'busca','')=''or position(lower(p_filtros->>'busca')in lower(coalesce(a.nome_exibicao,a.nome)))>0)
 ), paged as(
  select * from filtered order by created_at desc,id offset pagina::bigint*limite limit limite
 )
 select(select count(*)from filtered),(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
  'revisao_numero',(select r.numero from public.nr_documento_revisoes r where r.organization_id=p_org and r.id=p.revisao_id),
  'documento_titulo',(select d.titulo from public.nr_documentos d where d.organization_id=p_org and d.id=p.documento_id),
  'contextos',(select coalesce(jsonb_agg(jsonb_build_object(
   'organization_id',v.organization_id,'cliente_id',v.cliente_id,'unidade_id',v.unidade_id,
   'documento_id',v.documento_id,'revisao_id',v.revisao_id,
   'revisao_numero',(select r.numero from public.nr_documento_revisoes r where r.organization_id=p_org and r.id=v.revisao_id),
   'documento_titulo',(select d.titulo from public.nr_documentos d where d.organization_id=p_org and d.id=v.documento_id),
   'local_id',v.local_id,'pasta_id',v.pasta_id,'evidencia',v.evidencia)order by v.id),'[]')
   from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=p.id
    and(cliente is null or v.cliente_id=cliente)and(unidade is null or v.unidade_id=unidade)
    and(documento is null or v.documento_id=documento)and(revisao is null or v.revisao_id=revisao)
    and(local is null or v.local_id=local)and(pasta is null or v.pasta_id=pasta)
    and(p_norma=any(p.normas)or exists(select 1 from public.nr_documentos d
     where d.organization_id=p_org and d.id=v.documento_id and p_norma=any(d.normas))))
 )order by p.created_at desc,p.id),'[]')from paged p)into n,linhas;
 return jsonb_build_object('rows',linhas,'total',n,'pagina',pagina,'limite',limite);
end$$;
