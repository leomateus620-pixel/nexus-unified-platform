insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nexus-cruz-alta-pdf-previas','nexus-cruz-alta-pdf-previas',false,2097152,array['application/pdf']);

create table public.ca_pdf_representacoes (
  organization_id uuid not null references public.organizations(id),
  bucket text not null check (bucket in ('nexus-nr-acervo','nexus-cruz-alta-laudos')),
  caminho text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  tamanho bigint not null check (tamanho between 5 and 52428800),
  paginas_solicitadas integer[] not null check (cardinality(paginas_solicitadas) between 1 and 16),
  estado text not null default 'fila' check (estado in ('fila','processando','disponivel','falhou')),
  tentativas integer not null default 0,
  tentar_em timestamptz not null default now(),
  lease uuid,
  lease_ate timestamptz,
  resultado jsonb,
  primary key (organization_id,bucket,caminho,sha256)
);
alter table public.ca_pdf_representacoes enable row level security;
revoke all on public.ca_pdf_representacoes from public,anon,authenticated,service_role;

-- Include published historical revisions and immutable inspection evidence still linked to the scene.
create function public.ca_pdf_fontes()
returns table(organization_id uuid,bucket text,caminho text,sha256 text,tamanho bigint,paginas integer[])
language sql stable security definer set search_path='' as $$
  with cena as (select (public.ca_inspecao_sync_contexto()).*),
  documentos as (
    select distinct c.organization_id,v.documento_id
    from cena c join public.nr_cena_documentos v
      on (v.organization_id,v.cliente_id,v.unidade_id)=(c.organization_id,c.cliente_id,c.unidade_id)
    join public.nr_documentos d on (d.organization_id,d.id)=(c.organization_id,v.documento_id)
    where v.removido_em is null and d.arquivado_em is null
  ),
  evidencias as (
    select distinct c.organization_id,e.id
    from cena c join public.ca_inspecao_vinculos v
      on (v.organization_id,v.unidade_id)=(c.organization_id,c.unidade_id)
    join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
    join public.ca_inspecao_fontes f on f.id=e.fonte_id
      and (f.organization_id,f.unidade_id)=(c.organization_id,c.unidade_id)
  ),
  fontes as (
    select distinct a.organization_id,'nexus-nr-acervo'::text bucket,
      a.caminho,a.sha256,a.tamanho,array[1] paginas
    from documentos d cross join lateral public.ca_revisoes(d.organization_id,d.documento_id) r
    join public.nr_arquivos a on (a.organization_id,a.id)=(d.organization_id,r.arquivo_id)
    where a.mime='application/pdf' and a.tamanho between 5 and 52428800
    union
    select i.organization_id,'nexus-cruz-alta-laudos',e.caminho,e.sha256,e.tamanho,
      array(select distinct p from (
        select 1 p
        union all
        select case when (f.value->>'page') ~ '^[1-9][0-9]{0,3}$' then (f.value->>'page')::integer end
        from jsonb_each(e.campos) f
        union all
        select case when (e.restricao->>'page') ~ '^[1-9][0-9]{0,3}$' then (e.restricao->>'page')::integer end
      ) pages where p between 1 and greatest(e.paginas,1) order by p limit 16)
    from evidencias i join public.ca_inspecao_evidencias e on e.id=i.id
  )
  select f.organization_id,f.bucket,f.caminho,f.sha256,f.tamanho,
    (array_agg(distinct p order by p))[1:16]
  from fontes f cross join lateral unnest(f.paginas) p
  group by f.organization_id,f.bucket,f.caminho,f.sha256,f.tamanho
$$;

create function public.ca_pdf_pendente() returns boolean
language sql stable security definer set search_path='' as $$
  -- Compare requested pages, not the available previews. Oversized pages can use verified ranges.
  select exists(
    select 1 from public.ca_pdf_fontes() f
    left join public.ca_pdf_representacoes r using (organization_id,bucket,caminho,sha256)
    where r.estado is null or (r.estado='fila' and r.tentar_em<=now())
      or (r.estado='processando' and r.lease_ate<=now())
      or not (f.paginas <@ r.paginas_solicitadas)
  ) and not exists(select 1 from public.ca_pdf_representacoes r where r.estado='processando' and r.lease_ate>now())
$$;

create function public.ca_pdf_trabalho() returns jsonb
language plpgsql security definer set search_path='' as $$
declare fonte record; reserva uuid:=gen_random_uuid();
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:pdf:claim',0)) then return null; end if;
  update public.ca_pdf_representacoes set estado='falhou',lease=null,lease_ate=null
    where estado='processando' and lease_ate<=clock_timestamp() and tentativas>=3;
  if exists(select 1 from public.ca_pdf_representacoes where estado='processando' and lease_ate>clock_timestamp())
    then return null; end if;
  select f.*, r.resultado->'pages' paginas_conferidas into fonte from public.ca_pdf_fontes() f
  left join public.ca_pdf_representacoes r using (organization_id,bucket,caminho,sha256)
  where r.estado is null or (r.estado='fila' and r.tentar_em<=clock_timestamp())
    or (r.estado='processando' and r.lease_ate<=clock_timestamp())
    or not (f.paginas <@ r.paginas_solicitadas)
  order by f.tamanho,f.bucket,f.caminho limit 1;
  if not found then return null; end if;
  insert into public.ca_pdf_representacoes
    (organization_id,bucket,caminho,sha256,tamanho,paginas_solicitadas,estado,tentativas,lease,lease_ate)
    values(fonte.organization_id,fonte.bucket,fonte.caminho,fonte.sha256,fonte.tamanho,fonte.paginas,
      'processando',1,reserva,clock_timestamp()+interval '3 minutes')
    on conflict (organization_id,bucket,caminho,sha256) do update set
      estado='processando',
      tentativas=case when excluded.paginas_solicitadas <@ ca_pdf_representacoes.paginas_solicitadas
        then ca_pdf_representacoes.tentativas+1 else 1 end,
      paginas_solicitadas=excluded.paginas_solicitadas,
      lease=excluded.lease,lease_ate=excluded.lease_ate;
  return to_jsonb(fonte) || jsonb_build_object('lease',reserva);
end $$;

create function public.ca_pdf_finalizar(p_lease uuid,p_resultado jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare fonte public.ca_pdf_representacoes;
begin
  select * into fonte from public.ca_pdf_representacoes
    where estado='processando' and lease=p_lease and lease_ate>clock_timestamp() for update;
  if not found then return false; end if;
  if p_resultado is not null and (
    jsonb_typeof(p_resultado#>'{chunks}') is distinct from 'array'
    or jsonb_array_length(p_resultado->'chunks')<>(fonte.tamanho+262143)/262144
    or exists(select 1 from jsonb_array_elements_text(p_resultado->'chunks') h
      where h is null or h !~ '^[a-f0-9]{64}$')
    or jsonb_typeof(p_resultado#>'{pages}') is distinct from 'array'
    or jsonb_array_length(p_resultado->'pages')>16
    or (p_resultado?'retryPages' and jsonb_typeof(p_resultado->'retryPages') is distinct from 'boolean')
  ) then raise exception 'Representação de PDF inválida.' using errcode='23514'; end if;
  update public.ca_pdf_representacoes set
    estado=case
      when fonte.tentativas<3 and (p_resultado is null or p_resultado->'retryPages'='true'::jsonb) then 'fila'
      when p_resultado is not null or fonte.resultado is not null then 'disponivel'
      else 'falhou'
    end,
    lease=null,lease_ate=null,tentar_em=clock_timestamp()+interval '5 minutes',
    resultado=coalesce(p_resultado-'retryPages',fonte.resultado)
  where lease=p_lease;
  return true;
end $$;

create function public.ca_pdf_representacao(p_org uuid,p_bucket text,p_caminho text,p_sha256 text,p_tamanho bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  select resultado from public.ca_pdf_representacoes
    where (organization_id,bucket,caminho,sha256,tamanho)=(p_org,p_bucket,p_caminho,p_sha256,p_tamanho)
      and resultado is not null
$$;

-- Reuse the existing authenticated cron dispatch and one-use worker ticket.
alter function public.ca_inspecao_sync_dispatch() rename to ca_inspecao_sync_dispatch_drive;
create function public.ca_inspecao_sync_dispatch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare estado jsonb; endpoint text; token text; request_id bigint;
begin
  estado:=public.ca_inspecao_sync_dispatch_drive();
  if estado->>'state' is distinct from 'idle' or not public.ca_pdf_pendente() then return estado; end if;
  endpoint:=public.ca_inspecao_sync_url();
  if endpoint is null or pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    then return jsonb_build_object('state','not_configured'); end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.ca_inspecao_tickets values(
    encode(sha256(convert_to(token,'UTF8')),'hex'),clock_timestamp()+interval '2 minutes');
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=60000)'
    into request_id using endpoint,jsonb_build_object('Content-Type','application/json','X-Nexus-Job-Token',token),'{}'::jsonb;
  return jsonb_build_object('state','queued','requestId',request_id);
exception when others then
  return jsonb_build_object('state','dispatch_failed','code',sqlstate);
end $$;

revoke all on function public.ca_pdf_fontes(),public.ca_pdf_pendente(),public.ca_pdf_trabalho(),
  public.ca_pdf_finalizar(uuid,jsonb),public.ca_pdf_representacao(uuid,text,text,text,bigint),
  public.ca_inspecao_sync_dispatch() from public,anon,authenticated,service_role;
grant execute on function public.ca_pdf_trabalho(),public.ca_pdf_finalizar(uuid,jsonb),
  public.ca_pdf_representacao(uuid,text,text,text,bigint) to service_role;
