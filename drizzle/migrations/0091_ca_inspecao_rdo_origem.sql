-- O servidor confere no Drive o pai da pasta autorizada antes de acessar as fotos.
create function public.ca_inspecao_rdo_origem(p_pastas text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare contexto public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
  origens jsonb; total integer:=cardinality(p_pastas); correspondencias integer; distintas integer;
begin
  if array_ndims(p_pastas) is distinct from 1 or total not between 1 and 1000
    or exists(select 1 from unnest(p_pastas) as solicitada(id) group by solicitada.id
      having count(*)<>1 or coalesce(solicitada.id,'') !~ '^[A-Za-z0-9_-]{5,250}$') then
    raise exception 'Pastas inválidas para consulta de origem.' using errcode='42501';
  end if;

  select jsonb_agg(jsonb_build_object(
    'id',solicitada.id,
    'parentId',case pasta.dados->>'category' when 'montagem' then r.drive_id else r.pasta_lancada_id end,
    'rootId',r.drive_id
  ) order by solicitada.ordem),count(*),count(distinct solicitada.id)
  into origens,correspondencias,distintas
  from public.ca_inspecao_rdo_acervo a
  join public.ca_inspecao_lotes l on l.id=a.lote_id and l.estado='concluido'
  join public.ca_inspecao_raizes r on r.drive_id=l.raiz and r.tipo='rdo'
  cross join lateral jsonb_array_elements(a.pastas) as pasta(dados)
  join unnest(p_pastas) with ordinality as solicitada(id,ordem) on solicitada.id=pasta.dados->>'id'
  where (a.organization_id,a.cliente_id,a.unidade_id)=
    (contexto.organization_id,contexto.cliente_id,contexto.unidade_id)
    and pasta.dados->>'category' in ('montagem','lancada')
    and jsonb_typeof(pasta.dados->'id')='string'
    and solicitada.id not in (r.drive_id,r.pasta_lancada_id);

  if correspondencias<>total or distintas<>total then
    raise exception 'Pasta indisponível no acervo vigente de fotos e RDO.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'credential',public.ca_inspecao_rdo_credencial(origens#>>'{0,id}'),
    'folders',origens
  );
end $$;

revoke all on function public.ca_inspecao_rdo_origem(text[]) from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_rdo_origem(text[]) to service_role;
notify pgrst,'reload schema';
