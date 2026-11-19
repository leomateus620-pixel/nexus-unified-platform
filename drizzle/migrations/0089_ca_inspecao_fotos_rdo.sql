-- Fotos e RDO usam a mesma fila privada, com uma leitura completa por lote.
alter table public.ca_inspecao_raizes
  drop constraint ca_inspecao_raizes_tipo_check,
  add column pasta_lancada_id text,
  add constraint ca_inspecao_raizes_tipo_check check(tipo in ('laudo','montada','layout','rdo')),
  add constraint ca_inspecao_raizes_rdo_valida check(
    (tipo='rdo')=(pasta_lancada_id is not null)
    and (pasta_lancada_id is null or
      (pasta_lancada_id ~ '^[A-Za-z0-9_-]{5,250}$' and pasta_lancada_id<>drive_id))
  );

create table public.ca_inspecao_rdo_acervo (
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  lote_id uuid not null unique references public.ca_inspecao_lotes(id),
  pastas jsonb not null check(jsonb_typeof(pastas)='array'),
  primary key(organization_id,unidade_id),
  foreign key(organization_id,cliente_id,unidade_id)
    references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id)
);
alter table public.ca_inspecao_rdo_acervo enable row level security;
revoke all on public.ca_inspecao_rdo_acervo from public,anon,authenticated,service_role;

create function public.ca_inspecao_rdo_registrar(p_raiz text,p_lancadas text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(p_raiz,'') !~ '^[A-Za-z0-9_-]{5,250}$' or coalesce(p_lancadas,'') !~ '^[A-Za-z0-9_-]{5,250}$'
    or p_raiz=p_lancadas then
    raise exception 'Raiz ou pasta de RDO lançadas inválida.' using errcode='23514';
  end if;
  insert into public.ca_inspecao_raizes(drive_id,tipo,pasta_lancada_id)
    values(p_raiz,'rdo',p_lancadas) on conflict do nothing;
  if not exists(select 1 from public.ca_inspecao_raizes r
    where (r.drive_id,r.tipo,r.pasta_lancada_id)=(p_raiz,'rdo',p_lancadas)) then
    raise exception 'A origem cadastrada requer conciliação antes de substituição.' using errcode='PT409';
  end if;
  return public.ca_inspecao_sync_start();
end $$;

create or replace function public.ca_inspecao_sync_claim(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ca_inspecao_trabalhos; lancadas text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('authorized',false,'job',null);
  end if;
  delete from public.ca_inspecao_tickets
    where hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expira_em>clock_timestamp();
  if not found then return jsonb_build_object('authorized',false,'job',null); end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:drive:claim',0)) then
    return jsonb_build_object('authorized',true,'job',null);
  end if;
  perform public.ca_inspecao_sync_expirar();
  if exists(select 1 from public.ca_inspecao_trabalhos where estado='processando' and lease_ate>=clock_timestamp())
    or (public.ca_inspecao_sync_contexto()).organization_id is null then
    return jsonb_build_object('authorized',true,'job',null);
  end if;
  select * into j from public.ca_inspecao_trabalhos where tentativas<3 and
    ((estado='fila' and tentar_em<=clock_timestamp()) or (estado='processando' and lease_ate<clock_timestamp()))
    order by criado_em,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('authorized',true,'job',null); end if;
  update public.ca_inspecao_trabalhos set estado='processando',tentativas=tentativas+1,
    lease=gen_random_uuid(),lease_ate=clock_timestamp()+interval '3 minutes'
  where id=j.id returning * into j;
  if j.tipo='scan' and j.payload->>'kind'='rdo' then
    select r.pasta_lancada_id into lancadas
    from public.ca_inspecao_lotes l join public.ca_inspecao_raizes r on r.drive_id=l.raiz
    where l.id=j.lote_id and l.estado='andamento' and r.tipo='rdo' and r.drive_id=j.payload->>'folderId';
    j.payload:=j.payload||jsonb_build_object('rdoPublishedId',lancadas);
  end if;
  return jsonb_build_object('authorized',true,'job',jsonb_build_object(
    'id',j.id,'lease',j.lease,'kind',j.tipo,case when j.tipo='scan' then 'scan' else 'source' end,j.payload));
end $$;

create function public.ca_inspecao_rdo_conferir(p_lote uuid,p_scan jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
  pasta jsonb; vistas text[]:='{}'; codigo_pasta text; prefixo text[]; lancadas text;
begin
  select r.pasta_lancada_id into lancadas
  from public.ca_inspecao_lotes l join public.ca_inspecao_raizes r on r.drive_id=l.raiz
    where l.id=p_lote and l.estado='andamento' and r.tipo='rdo'
      and r.drive_id=p_scan->>'folderId' and not (p_scan ? 'pageToken')
    for update of l;
  if not found or c.organization_id is null then
    raise exception 'Conferência fora da raiz ou do lote de fotos e RDO.' using errcode='23514';
  end if;
  perform public.ag_payload(p_result,array['kind','rdoFolders']);
  if jsonb_typeof(p_result->'rdoFolders') is distinct from 'array'
    or jsonb_array_length(p_result->'rdoFolders')>1000 then
    raise exception 'Lista de pastas de fotos e RDO inválida.' using errcode='23514';
  end if;
  for pasta in select jsonb_array_elements(p_result->'rdoFolders') loop
    perform public.ag_payload(pasta,array['id','code','name','category','resourceKey']);
    codigo_pasta:=pasta->>'code';
    -- O identificador é o primeiro segmento numérico do nome original.
    prefixo:=regexp_match(
      regexp_replace(pasta->>'name',U&'[\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',' ','g'),
      U&'^ *([0-9]{1,2})(?:[.,]([0-9]{1,2}))?(?: +[\002D\2010-\2015\2212] +| *$)'
    );
    if jsonb_typeof(pasta->'id') is distinct from 'string' or coalesce(pasta->>'id','') !~ '^[A-Za-z0-9_-]{5,250}$'
      or (pasta->>'id')=any(vistas) or (pasta->>'id') in (p_scan->>'folderId',lancadas)
      or jsonb_typeof(pasta->'name') is distinct from 'string' or length(pasta->>'name') not between 1 and 500
      or (pasta->>'name') ~ '[[:cntrl:]]'
      or jsonb_typeof(pasta->'code') is distinct from 'string'
      or codigo_pasta is distinct from (lpad(prefixo[1],2,'0') || coalesce('.'||(prefixo[2]::integer)::text,''))
      or not exists(select 1 from public.nr_cena_elementos e where e.cena=c.cena and e.tipo='lvhf'
        and e.chave='lvhf-'||codigo_pasta and e.codigo=codigo_pasta and e.situacao is distinct from 'Retirada')
      or jsonb_typeof(pasta->'category') is distinct from 'string'
      or coalesce(pasta->>'category','') not in ('montagem','lancada')
      or (pasta->>'resourceKey' is not null and (jsonb_typeof(pasta->'resourceKey') is distinct from 'string'
        or (pasta->>'resourceKey') !~ '^[A-Za-z0-9_-]{1,250}$')) then
      raise exception 'Pasta de fotos e RDO sem identificação válida ou repetida.' using errcode='23514';
    end if;
    vistas:=array_append(vistas,pasta->>'id');
  end loop;
  insert into public.ca_inspecao_rdo_acervo(organization_id,cliente_id,unidade_id,lote_id,pastas)
    values(c.organization_id,c.cliente_id,c.unidade_id,p_lote,p_result->'rdoFolders')
    on conflict(organization_id,unidade_id) do update set lote_id=excluded.lote_id,pastas=excluded.pastas;
end $$;

create or replace function public.ca_inspecao_sync_finish(p_id uuid,p_lease uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ca_inspecao_trabalhos;
begin
  select * into j from public.ca_inspecao_trabalhos
  where id=p_id and lease=p_lease and estado='processando' and lease_ate>=clock_timestamp() for update;
  if not found then return jsonb_build_object('state','obsolete'); end if;
  if jsonb_typeof(p_result) is distinct from 'object' or p_result->>'kind' is distinct from j.tipo
    or octet_length(p_result::text)>4194304 then
    raise exception 'Resultado de sincronização inválido.' using errcode='23514';
  end if;
  if j.tipo='scan' and j.payload->>'kind'='rdo' then
    perform public.ca_inspecao_rdo_conferir(j.lote_id,j.payload,p_result);
  elsif j.tipo='scan' then
    perform public.ca_inspecao_sync_scan(j.lote_id,j.payload,p_result);
  else
    perform public.ca_inspecao_sync_processar(j.lote_id,j.payload,p_result);
  end if;
  update public.ca_inspecao_trabalhos set estado='concluido',lease=null,lease_ate=null,erro=null where id=j.id;
  perform public.ca_inspecao_sync_encerrar(j.lote_id);
  perform public.ca_inspecao_sync_dispatch();
  return jsonb_build_object('state','completed');
end $$;

create or replace function public.ca_inspecao_sync_status(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
  ultima timestamptz; atividade boolean; falhas boolean; cfg boolean;
begin
  select case when count(*)=count(g.terminou_em) then min(g.terminou_em) end,
    coalesce(bool_or(l.estado='andamento'),false),
    coalesce(bool_or(l.estado='parcial'),false)
  into ultima,atividade,falhas from public.ca_inspecao_raizes r
  left join lateral(select t.estado from public.ca_inspecao_lotes t where t.raiz=r.drive_id
    order by t.criado_em desc limit 1) l on true
  left join lateral(select max(t.terminou_em) terminou_em from public.ca_inspecao_lotes t
    where t.raiz=r.drive_id and t.estado='concluido') g on true
  where r.tipo<>'rdo';
  cfg:=exists(select 1 from public.ca_inspecao_raizes where tipo='laudo') and public.ca_inspecao_sync_url() is not null
    and pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null;
  return jsonb_build_object('state',case when not cfg then 'not_configured' when atividade then 'syncing'
    when falhas then 'partial' when ultima is null or ultima<now()-interval '45 minutes' then 'stale'
    else 'verified' end,'lastCheckedAt',ultima);
end $$;

create function public.ca_inspecao_rdo_summary(p_org uuid,p_chave text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); itens jsonb;
begin
  if not exists(select 1 from public.nr_cena_elementos where cena=c.cena and chave=p_chave) then
    raise exception 'Objeto indisponível nesta unidade.' using errcode='42501';
  end if;
  if not (public.pode(p_org,'ver_nr') or exists(
    select 1 from public.nr_cena_consultores v where
      (v.organization_id,v.cliente_id,v.unidade_id,v.usuario_id)=(p_org,c.cliente_id,c.unidade_id,auth.uid())
      and v.permite_original
  )) then return '[]'::jsonb; end if;
  with recursive descendentes as (
    select e.chave,e.tipo,e.codigo from public.nr_cena_elementos e where e.cena=c.cena and e.chave=p_chave
    union
    select e.chave,e.tipo,e.codigo from public.nr_cena_elementos e join descendentes d on e.pai=d.chave
    where e.cena=c.cena
  )
  select coalesce(jsonb_agg(p.pasta order by p.pasta->>'code',p.pasta->>'category',p.pasta->>'name',p.pasta->>'id'),'[]')
  into itens
  from public.ca_inspecao_rdo_acervo a
  cross join lateral jsonb_array_elements(a.pastas) as p(pasta)
  where (a.organization_id,a.unidade_id)=(p_org,c.unidade_id)
    and exists(select 1 from descendentes d where d.tipo='lvhf' and d.codigo=p.pasta->>'code');
  return itens;
end $$;

revoke all on function public.ca_inspecao_rdo_registrar(text,text),public.ca_inspecao_rdo_conferir(uuid,jsonb,jsonb),
  public.ca_inspecao_rdo_summary(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_rdo_registrar(text,text) to service_role;
grant execute on function public.ca_inspecao_rdo_summary(uuid,text) to authenticated;
notify pgrst,'reload schema';
