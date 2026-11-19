-- Catálogo privado de fotos verificadas. O Drive continua sendo a autoridade da origem.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nexus-cruz-alta-rdo','nexus-cruz-alta-rdo',false,25165824,
  array['image/jpeg','image/png','image/webp','image/gif']);

create table public.ca_rdo_catalogos (
  organization_id uuid not null, unidade_id uuid not null, pasta text not null,
  origem jsonb not null, conferido_em timestamptz not null default clock_timestamp(),
  primary key (organization_id,unidade_id,pasta)
);
create table public.ca_rdo_fotos (
  organization_id uuid not null, unidade_id uuid not null, pasta text not null,
  foto text not null, versao text not null, caminho text[] not null,
  nome text not null, modificada_em timestamptz not null, ativa boolean not null default true,
  variantes jsonb not null default '{}'::jsonb,
  primary key(organization_id,unidade_id,pasta,foto,versao),
  check(pasta ~ '^[A-Za-z0-9_-]{10,250}$' and foto ~ '^[A-Za-z0-9_-]{10,250}$' and versao ~ '^\d{1,24}$'),
  check(cardinality(caminho)<=4), check(length(nome) between 1 and 500),
  check(jsonb_typeof(variantes)='object')
);
create unique index ca_rdo_foto_ativa on public.ca_rdo_fotos(organization_id,unidade_id,pasta,foto) where ativa;
create table public.ca_rdo_trabalhos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unidade_id uuid not null,
  pasta text not null, foto text not null default '', versao text not null default '',
  tipo text not null check(tipo in('catalogo','midia','limpeza')),
  origem jsonb, estado text not null default 'fila' check(estado in('fila','processando','concluido','falhou')),
  tentativas integer not null default 0 check(tentativas between 0 and 3),
  criado_em timestamptz not null default clock_timestamp(), alterado_em timestamptz not null default clock_timestamp(),
  tentar_em timestamptz not null default clock_timestamp(), lease uuid, lease_ate timestamptz, erro text,
  unique(organization_id,unidade_id,pasta,foto,versao,tipo),
  check((tipo='catalogo' and foto='' and versao='') or
        (tipo<>'catalogo' and foto ~ '^[A-Za-z0-9_-]{10,250}$' and versao ~ '^\d{1,24}$')),
  check(pasta ~ '^[A-Za-z0-9_-]{10,250}$')
);
create index ca_rdo_trabalho_fila on public.ca_rdo_trabalhos(estado,tentar_em,criado_em,id);
create table public.ca_rdo_tickets(hash text primary key check(hash~'^[a-f0-9]{64}$'), expira_em timestamptz not null);

alter table public.ca_rdo_catalogos enable row level security;
alter table public.ca_rdo_fotos enable row level security;
alter table public.ca_rdo_trabalhos enable row level security;
alter table public.ca_rdo_tickets enable row level security;
revoke all on public.ca_rdo_catalogos,public.ca_rdo_fotos,public.ca_rdo_trabalhos,public.ca_rdo_tickets
  from public,anon,authenticated,service_role;

create function public.ca_rdo_origens() returns table(organization_id uuid,unidade_id uuid,pasta text,origem jsonb)
language sql stable security definer set search_path='' as $$
  select a.organization_id,a.unidade_id,p.dados->>'id',p.dados
  from public.ca_inspecao_rdo_acervo a
  join public.ca_inspecao_lotes l on l.id=a.lote_id and l.estado='concluido'
  cross join lateral jsonb_array_elements(a.pastas) p(dados)
  where (a.organization_id,a.cliente_id,a.unidade_id)=(select c.organization_id,c.cliente_id,c.unidade_id from public.ca_inspecao_sync_contexto() c)
    and p.dados->>'id' ~ '^[A-Za-z0-9_-]{10,250}$'
$$;

create function public.ca_rdo_caminho(p_org uuid,p_unidade uuid,p_pasta text,p_foto text,p_versao text,p_variante text) returns text
language sql immutable set search_path='' as $$
 select p_org::text||'/'||p_unidade::text||'/'||p_pasta||'/'||p_foto||'/'||p_versao||'/'||
   case p_variante when 'original' then 'original' when 'thumbnail' then 'thumbnail.webp' when 'preview' then 'preview.webp' end
$$;

create function public.ca_rdo_listar(p_org uuid,p_chave text,p_pagina integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); escopo jsonb; resultado jsonb; total integer;
begin
  if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página de fotos inválida.' using errcode='23514'; end if;
  escopo:=public.ca_inspecao_rdo_summary(p_org,p_chave);
  if exists(select 1 from jsonb_array_elements(escopo) p(dados)
    where not exists(select 1 from public.ca_rdo_catalogos k
      where (k.organization_id,k.unidade_id,k.pasta)=(p_org,c.unidade_id,p.dados->>'id')
        and k.origem-'name'=p.dados-'name' and k.conferido_em>=now()-interval '45 minutes')) then
    return jsonb_build_object('ready',false,'photos','[]'::jsonb,'total',0,'partial',false);
  end if;
  with ordenadas as (
    select f.*, p.dados->>'code' codigo, p.dados->>'category' categoria,
      row_number() over(order by split_part(p.dados->>'code','.',1)::int,
        coalesce(nullif(split_part(p.dados->>'code','.',2),'')::int,-1), p.dados->>'category' desc,
        f.modificada_em desc,f.nome,f.pasta,f.foto) ordem
    from jsonb_array_elements(escopo) p(dados) join public.ca_rdo_fotos f
      on (f.organization_id,f.unidade_id,f.pasta)=(p_org,c.unidade_id,p.dados->>'id') and f.ativa
  ) select count(*),coalesce(jsonb_agg(jsonb_build_object('id',foto,'folderId',pasta,'version',versao,
    'path',caminho,'name',nome,'modifiedAt',modificada_em,'code',codigo,'category',categoria,
    'representations',(select coalesce(jsonb_agg(q.chave order by q.chave),'[]'::jsonb) from jsonb_object_keys(variantes) q(chave))) order by ordem)
    filter(where ordem between p_pagina*6+1 and p_pagina*6+6),'[]'::jsonb)
  into total,resultado from ordenadas;
  return jsonb_build_object('ready',true,'photos',resultado,'total',total,'partial',false);
end $$;

create function public.ca_rdo_material(p_org uuid,p_chave text,p_fotos jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); escopo jsonb; encontrados jsonb;
begin
  if jsonb_typeof(p_fotos) is distinct from 'array' or jsonb_array_length(p_fotos) not between 1 and 6
    or octet_length(p_fotos::text)>15000 then raise exception 'Seleção de fotos inválida.' using errcode='23514'; end if;
  escopo:=public.ca_inspecao_rdo_summary(p_org,p_chave);
  select coalesce(jsonb_agg(jsonb_build_object('id',f.foto,'folderId',f.pasta,'version',f.versao,
    'path',f.caminho,'unit',f.unidade_id,'variants',f.variantes)),'[]'::jsonb) into encontrados
  from jsonb_array_elements(escopo) p(dados)
  join public.ca_rdo_fotos f on (f.organization_id,f.unidade_id,f.pasta)=(p_org,c.unidade_id,p.dados->>'id') and f.ativa
  where f.variantes ? 'original' and exists(select 1 from jsonb_array_elements(p_fotos) r(dados)
    where (r.dados->>'id',r.dados->>'folderId',r.dados->>'version',r.dados->'path')=(f.foto,f.pasta,f.versao,to_jsonb(f.caminho)));
  return jsonb_build_object('folders',escopo,'assets',encontrados);
end $$;

create function public.ca_rdo_dispatch() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:rdo:dispatch',0)) then return; end if;
  delete from public.ca_rdo_tickets where expira_em<=clock_timestamp();
  update public.ca_rdo_trabalhos set estado='falhou',lease=null,lease_ate=null,alterado_em=clock_timestamp(),erro='lease_expirado'
    where estado='processando' and lease_ate<clock_timestamp() and tentativas>=3;
  if exists(select 1 from public.ca_rdo_tickets) or exists(select 1 from public.ca_rdo_trabalhos
    where estado='processando' and lease_ate>=clock_timestamp()) then return; end if;
  if not exists(select 1 from public.ca_rdo_trabalhos where tentativas<3 and
    (estado='fila' and tentar_em<=clock_timestamp() or estado='processando' and lease_ate<clock_timestamp())) then return; end if;
  endpoint:=public.ca_inspecao_sync_url();
  if endpoint is null or pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.ca_rdo_tickets values(encode(sha256(convert_to(token,'UTF8')),'hex'),clock_timestamp()+interval '2 minutes');
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=60000)'
    using endpoint,jsonb_build_object('Content-Type','application/json','X-Nexus-Job-Token',token,'X-Nexus-Job-Queue','rdo'),'{}'::jsonb;
exception when others then
  -- O cron retenta o despacho sem descartar trabalhos nem publicar dados incompletos.
  return;
end $$;

create function public.ca_rdo_enfileirar_fotos(p_org uuid,p_unidade uuid,p_pasta text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.ca_rdo_trabalhos(organization_id,unidade_id,pasta,foto,versao,tipo)
    select f.organization_id,f.unidade_id,f.pasta,f.foto,f.versao,case when f.ativa then 'midia' else 'limpeza' end
    from public.ca_rdo_fotos f where f.organization_id=p_org and f.unidade_id=p_unidade
      and (p_pasta is null or f.pasta=p_pasta) and (not f.ativa or not(f.variantes ? 'original'))
  on conflict(organization_id,unidade_id,pasta,foto,versao,tipo) do nothing;
end $$;

create function public.ca_rdo_agendar() returns void
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:rdo:agenda',0)) then return; end if;
  update public.ca_rdo_fotos f set ativa=false where f.ativa and not exists(select 1 from public.ca_rdo_origens() o
    where (o.organization_id,o.unidade_id,o.pasta)=(f.organization_id,f.unidade_id,f.pasta));
  delete from public.ca_rdo_catalogos k where not exists(select 1 from public.ca_rdo_origens() o
    where (o.organization_id,o.unidade_id,o.pasta)=(k.organization_id,k.unidade_id,k.pasta));
  insert into public.ca_rdo_trabalhos(organization_id,unidade_id,pasta,foto,versao,tipo)
    select f.organization_id,f.unidade_id,f.pasta,f.foto,f.versao,'limpeza' from public.ca_rdo_fotos f where not f.ativa
    on conflict(organization_id,unidade_id,pasta,foto,versao,tipo) do nothing;
  delete from public.ca_rdo_trabalhos t where t.estado<>'processando' and (
    (t.tipo='catalogo' and not exists(select 1 from public.ca_rdo_origens() o
      where (o.organization_id,o.unidade_id,o.pasta)=(t.organization_id,t.unidade_id,t.pasta))) or
    (t.tipo<>'catalogo' and not exists(select 1 from public.ca_rdo_fotos f
      where (f.organization_id,f.unidade_id,f.pasta,f.foto,f.versao)=(t.organization_id,t.unidade_id,t.pasta,t.foto,t.versao)
        and f.ativa=(t.tipo='midia'))));
  if c.organization_id is not null then
    insert into public.ca_rdo_trabalhos(organization_id,unidade_id,pasta,tipo)
      select o.organization_id,o.unidade_id,o.pasta,'catalogo' from public.ca_rdo_origens() o
      where not exists(select 1 from public.ca_rdo_catalogos k
        where (k.organization_id,k.unidade_id,k.pasta)=(o.organization_id,o.unidade_id,o.pasta)
          and k.origem=o.origem and k.conferido_em>clock_timestamp()-interval '15 minutes')
    on conflict(organization_id,unidade_id,pasta,foto,versao,tipo) do update set
      estado='fila',tentativas=0,tentar_em=clock_timestamp(),alterado_em=clock_timestamp(),erro=null
    where ca_rdo_trabalhos.estado in('concluido','falhou') and
      ca_rdo_trabalhos.alterado_em<clock_timestamp()-interval '15 minutes';
    perform public.ca_rdo_enfileirar_fotos(c.organization_id,c.unidade_id);
  end if;
  -- Retenta descarte físico sem tornar o conteúdo elegível para leitura.
  update public.ca_rdo_trabalhos set estado='fila',tentativas=0,tentar_em=clock_timestamp(),alterado_em=clock_timestamp()
    where tipo='limpeza' and estado='falhou' and alterado_em<clock_timestamp()-interval '1 day';
  perform public.ca_rdo_dispatch();
end $$;

create function public.ca_rdo_claim(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ca_rdo_trabalhos; f public.ca_rdo_fotos; dados jsonb;
begin
  if coalesce(p_token,'')!~'^[a-f0-9]{64}$' then return jsonb_build_object('authorized',false,'job',null); end if;
  delete from public.ca_rdo_tickets where hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expira_em>clock_timestamp();
  if not found then return jsonb_build_object('authorized',false,'job',null); end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:rdo:claim',0)) or exists(
    select 1 from public.ca_rdo_trabalhos where estado='processando' and lease_ate>=clock_timestamp()) then
    return jsonb_build_object('authorized',true,'job',null);
  end if;
  select t.* into j from public.ca_rdo_trabalhos t where t.tentativas<3 and
    (t.estado='fila' and t.tentar_em<=clock_timestamp() or t.estado='processando' and t.lease_ate<clock_timestamp())
    and (t.tipo='limpeza' or exists(select 1 from public.ca_rdo_origens() o
      where (o.organization_id,o.unidade_id,o.pasta)=(t.organization_id,t.unidade_id,t.pasta)))
    and (t.tipo='catalogo' or exists(select 1 from public.ca_rdo_fotos a
      where (a.organization_id,a.unidade_id,a.pasta,a.foto,a.versao)=(t.organization_id,t.unidade_id,t.pasta,t.foto,t.versao)
        and a.ativa=(t.tipo='midia')))
    order by case t.tipo when 'limpeza' then 0 when 'catalogo' then 1 else 2 end,t.criado_em,t.id
    limit 1 for update skip locked;
  if not found then return jsonb_build_object('authorized',true,'job',null); end if;
  select o.origem into dados from public.ca_rdo_origens() o where (o.organization_id,o.unidade_id,o.pasta)=
    (j.organization_id,j.unidade_id,j.pasta);
  update public.ca_rdo_trabalhos set estado='processando',tentativas=tentativas+1,
    lease=gen_random_uuid(),lease_ate=clock_timestamp()+interval '3 minutes',alterado_em=clock_timestamp(),origem=dados
    where id=j.id returning * into j;
  if j.tipo<>'catalogo' then
    select * into strict f from public.ca_rdo_fotos a where (a.organization_id,a.unidade_id,a.pasta,a.foto,a.versao)=
      (j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao);
  end if;
  return jsonb_build_object('authorized',true,'job',jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.tipo,
    'organization',j.organization_id,'unit',j.unidade_id,'folderId',j.pasta,'code',dados->>'code','resourceKey',dados->>'resourceKey',
    'foto',case when j.tipo<>'catalogo' then jsonb_build_object('id',f.foto,'folderId',f.pasta,'version',f.versao,'path',f.caminho) end));
end $$;

create function public.ca_rdo_finish(p_id uuid,p_lease uuid,p_result jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare j public.ca_rdo_trabalhos; item jsonb; variante record; caminhos text[]; estado_final text:='concluido';
begin
  select * into j from public.ca_rdo_trabalhos where id=p_id and lease=p_lease and estado='processando' and lease_ate>=clock_timestamp() for update;
  if not found then return 'obsoleto'; end if;
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>524288 then
    raise exception 'Resultado RDO inválido.' using errcode='23514'; end if;
  if j.tipo<>'limpeza' and not exists(select 1 from public.ca_rdo_origens() o
    where (o.organization_id,o.unidade_id,o.pasta,o.origem)=(j.organization_id,j.unidade_id,j.pasta,j.origem)) then
    estado_final:='falhou';
  elsif j.tipo='catalogo' then
    if jsonb_typeof(p_result->'fotos') is distinct from 'array' or jsonb_array_length(p_result->'fotos')>240
      or exists(select 1 from jsonb_array_elements(p_result->'fotos') a(dados) group by a.dados->>'id' having count(*)>1) then
      raise exception 'Catálogo RDO inválido.' using errcode='23514'; end if;
    update public.ca_rdo_fotos f set ativa=false where (f.organization_id,f.unidade_id,f.pasta)=(j.organization_id,j.unidade_id,j.pasta)
      and f.ativa and not exists(select 1 from jsonb_array_elements(p_result->'fotos') p(dados)
        where (p.dados->>'id',p.dados->>'version')=(f.foto,f.versao));
    for item in select jsonb_array_elements(p_result->'fotos') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')!~'^[A-Za-z0-9_-]{10,250}$' or item->>'id'=j.pasta
        or coalesce(item->>'version','')!~'^\d{1,24}$' or coalesce(length(item->>'name'),0) not between 1 and 500
        or (item->>'name')~'[[:cntrl:]]' or jsonb_typeof(item->'path') is distinct from 'array'
        or jsonb_array_length(item->'path')>4 or exists(select 1 from jsonb_array_elements_text(item->'path') k(id)
          group by k.id having count(*)>1 or coalesce(k.id,'')!~'^[A-Za-z0-9_-]{10,250}$' or k.id in(j.pasta,item->>'id')) then
        raise exception 'Foto RDO sem vínculo válido.' using errcode='23514'; end if;
      caminhos:=array(select jsonb_array_elements_text(item->'path'));
      insert into public.ca_rdo_fotos as f(organization_id,unidade_id,pasta,foto,versao,caminho,nome,modificada_em)
        values(j.organization_id,j.unidade_id,j.pasta,item->>'id',item->>'version',caminhos,item->>'name',(item->>'modifiedAt')::timestamptz)
      on conflict(organization_id,unidade_id,pasta,foto,versao) do update set
        ativa=true,caminho=excluded.caminho,nome=excluded.nome,modificada_em=excluded.modificada_em;
    end loop;
    insert into public.ca_rdo_catalogos(organization_id,unidade_id,pasta,origem) values(j.organization_id,j.unidade_id,j.pasta,j.origem)
    on conflict(organization_id,unidade_id,pasta) do update set origem=excluded.origem,conferido_em=clock_timestamp();
    perform public.ca_rdo_enfileirar_fotos(j.organization_id,j.unidade_id,j.pasta);
  elsif j.tipo='midia' then
    if jsonb_typeof(p_result->'variants') is distinct from 'object' or not (p_result->'variants' ? 'original')
      or jsonb_typeof(p_result->'retry') is distinct from 'boolean' then
      raise exception 'Binário RDO ausente.' using errcode='23514'; end if;
    for variante in select key,value from jsonb_each(p_result->'variants') loop
      if variante.key not in('original','thumbnail','preview') or jsonb_typeof(variante.value) is distinct from 'object'
        or coalesce(variante.value->>'sha256','')!~'^[a-f0-9]{64}$'
        or coalesce(variante.value->>'bytes','')!~'^[1-9][0-9]{0,7}$'
        or (variante.value->>'bytes')::bigint>(case variante.key when 'thumbnail' then 524288 when 'preview' then 2097152 else 25165824 end)
        or coalesce(variante.value->>'mime','') not in('image/jpeg','image/png','image/webp','image/gif')
        or (variante.key<>'original' and variante.value->>'mime'<>'image/webp')
        or not exists(select 1 from storage.objects o where o.bucket_id='nexus-cruz-alta-rdo'
          and o.name=public.ca_rdo_caminho(j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao,variante.key)
          and o.metadata->>'size'=variante.value->>'bytes' and o.metadata->>'mimetype'=variante.value->>'mime') then
        raise exception 'Binário RDO não confirmado no armazenamento.' using errcode='23514'; end if;
    end loop;
    update public.ca_rdo_fotos f set variantes=f.variantes||(p_result->'variants')
      where (f.organization_id,f.unidade_id,f.pasta,f.foto,f.versao)=(j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao) and f.ativa;
    if (p_result->>'retry')::boolean and j.tentativas<3 then estado_final:='fila'; end if;
  else
    if exists(select 1 from storage.objects o where o.bucket_id='nexus-cruz-alta-rdo' and o.name in
      (select public.ca_rdo_caminho(j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao,v) from unnest(array['original','thumbnail','preview']) v)) then
      raise exception 'Descarte RDO pendente no armazenamento.' using errcode='23514'; end if;
    delete from public.ca_rdo_fotos f where (f.organization_id,f.unidade_id,f.pasta,f.foto,f.versao)=
      (j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao) and not f.ativa;
    delete from public.ca_rdo_trabalhos t where (t.organization_id,t.unidade_id,t.pasta,t.foto,t.versao)=
      (j.organization_id,j.unidade_id,j.pasta,j.foto,j.versao);
  end if;
  update public.ca_rdo_trabalhos set estado=estado_final,lease=null,lease_ate=null,alterado_em=clock_timestamp(),
    tentar_em=clock_timestamp()+interval '2 minutes',erro=case when estado_final='falhou' then 'origem_obsoleta' end where id=j.id;
  perform public.ca_rdo_dispatch();
  return estado_final;
end $$;

create function public.ca_rdo_fail(p_id uuid,p_lease uuid,p_error text,p_retry boolean) returns text
language plpgsql security definer set search_path='' as $$
declare novo text;
begin
  update public.ca_rdo_trabalhos set estado=case when p_retry and tentativas<3 then 'fila' else 'falhou' end,
    lease=null,lease_ate=null,alterado_em=clock_timestamp(),tentar_em=clock_timestamp()+interval '2 minutes',erro=left(p_error,160)
    where id=p_id and lease=p_lease and estado='processando' and lease_ate>=clock_timestamp() returning estado into novo;
  perform public.ca_rdo_dispatch();
  return coalesce(novo,'obsoleto');
end $$;

revoke all on function public.ca_rdo_origens(),public.ca_rdo_caminho(uuid,uuid,text,text,text,text),
  public.ca_rdo_listar(uuid,text,integer),public.ca_rdo_material(uuid,text,jsonb),public.ca_rdo_dispatch(),
  public.ca_rdo_enfileirar_fotos(uuid,uuid,text),public.ca_rdo_agendar(),public.ca_rdo_claim(text),
  public.ca_rdo_finish(uuid,uuid,jsonb),public.ca_rdo_fail(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ca_rdo_listar(uuid,text,integer),public.ca_rdo_material(uuid,text,jsonb) to authenticated;
grant execute on function public.ca_rdo_claim(text),public.ca_rdo_finish(uuid,uuid,jsonb),
  public.ca_rdo_fail(uuid,uuid,text,boolean),public.ca_rdo_agendar() to service_role;

do $$ begin
  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('nexus-ca-rdo-midia','* * * * *','select public.ca_rdo_agendar();');
  end if;
end $$;
notify pgrst,'reload schema';
