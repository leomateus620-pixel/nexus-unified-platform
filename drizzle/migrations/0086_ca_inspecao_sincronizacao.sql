-- Raízes privadas, conferências por árvore, trabalhos recuperáveis e chamadas de uso único.
create table public.ca_inspecao_raizes (
  drive_id text primary key check(drive_id ~ '^[A-Za-z0-9_-]{5,250}$'),
  tipo text not null unique check(tipo in ('laudo','montada','layout'))
);
create table public.ca_inspecao_lotes (
  id uuid primary key default gen_random_uuid(), raiz text not null references public.ca_inspecao_raizes(drive_id),
  criado_em timestamptz not null default clock_timestamp(), terminou_em timestamptz,
  estado text not null default 'andamento' check(estado in ('andamento','concluido','parcial'))
);
create unique index ca_inspecao_lote_unico on public.ca_inspecao_lotes(raiz) where estado='andamento';
create table public.ca_inspecao_trabalhos (
  id uuid primary key default gen_random_uuid(), lote_id uuid not null references public.ca_inspecao_lotes(id),
  tipo text not null check(tipo in ('scan','process')), chave text not null,
  payload jsonb not null, estado text not null default 'fila' check(estado in ('fila','processando','concluido','falhou')),
  criado_em timestamptz not null default clock_timestamp(), tentar_em timestamptz not null default clock_timestamp(),
  tentativas integer not null default 0, lease uuid, lease_ate timestamptz, erro text,
  unique(lote_id,tipo,chave)
);
create index ca_inspecao_trabalho_fila on public.ca_inspecao_trabalhos(tentar_em,criado_em) where estado='fila';
create index ca_inspecao_trabalho_lote on public.ca_inspecao_trabalhos(lote_id,estado);
create table public.ca_inspecao_tickets (
  hash text primary key check(hash~'^[a-f0-9]{64}$'),
  expira_em timestamptz not null
);

alter table public.ca_inspecao_raizes enable row level security;
alter table public.ca_inspecao_lotes enable row level security;
alter table public.ca_inspecao_trabalhos enable row level security;
alter table public.ca_inspecao_tickets enable row level security;
revoke all on public.ca_inspecao_raizes,public.ca_inspecao_lotes,public.ca_inspecao_trabalhos,public.ca_inspecao_tickets
  from public,anon,authenticated,service_role;

create function public.ca_inspecao_sync_contexto() returns public.nr_cenas_unidade
language sql stable security definer set search_path='' as $$
  select c from public.nr_cenas_unidade c
  join public.unidades u on (u.organization_id,u.cliente_id,u.id)=(c.organization_id,c.cliente_id,c.unidade_id)
  join public.clientes k on (k.organization_id,k.id)=(c.organization_id,c.cliente_id)
  where c.cena='tres-tentos-cruz-alta' and c.estado='publicada'
    and u.arquivado_em is null and k.arquivado_em is null
$$;

create function public.ca_inspecao_sync_invalidar(p_fonte uuid) returns void
language sql security definer set search_path='' as $$
  update public.ca_inspecao_linhas l set versao=l.versao+1
  where exists(select 1 from public.ca_inspecao_vinculos v
    join public.ca_inspecao_evidencias e on e.id=v.evidencia_id and e.fonte_id=p_fonte
    where (l.organization_id,l.unidade_id,l.chave)=(v.organization_id,v.unidade_id,v.chave))
$$;

create function public.ca_inspecao_sync_encerrar(p_lote uuid) returns void
language plpgsql security definer set search_path='' as $$
declare l public.ca_inspecao_lotes; falta uuid; incompleto boolean;
begin
  select * into l from public.ca_inspecao_lotes where id=p_lote for update;
  if not found or l.estado<>'andamento' or exists(select 1 from public.ca_inspecao_trabalhos
    where lote_id=p_lote and estado in ('fila','processando')) then return; end if;
  if not exists(select 1 from public.ca_inspecao_trabalhos
    where lote_id=p_lote and tipo='scan' and estado='falhou') then
    for falta in update public.ca_inspecao_fontes set disponivel=false
      where raiz=l.raiz and visto_lote<>l.id and disponivel returning id
    loop
      perform public.ca_inspecao_sync_invalidar(falta);
    end loop;
  end if;
  select exists(select 1 from public.ca_inspecao_trabalhos where lote_id=p_lote and estado='falhou') into incompleto;
  update public.ca_inspecao_lotes set terminou_em=clock_timestamp(),estado=case when incompleto then 'parcial' else 'concluido' end
    where id=p_lote;
end $$;

create function public.ca_inspecao_sync_expirar() returns void
language plpgsql security definer set search_path='' as $$
declare lote uuid;
begin
  for lote in update public.ca_inspecao_trabalhos
    set estado='falhou',lease=null,lease_ate=null,erro='Limite de tentativas após expiração do processamento.'
    where estado='processando' and lease_ate<clock_timestamp() and tentativas>=3 returning lote_id
  loop
    perform public.ca_inspecao_sync_encerrar(lote);
  end loop;
end $$;

create function public.ca_inspecao_sync_url() returns text
language plpgsql stable security definer set search_path='' as $$
declare endpoint text;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
    into endpoint using 'nexus_ca_inspecao_worker_url';
  if endpoint is distinct from 'https://nexusgestao.app/api/public/cruz-alta/inspection-worker'
    then return null; end if;
  return endpoint;
end $$;

create function public.ca_inspecao_sync_dispatch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text; request_id bigint;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:drive:dispatch',0))
    then return jsonb_build_object('state','busy'); end if;
  perform public.ca_inspecao_sync_expirar();
  delete from public.ca_inspecao_tickets where expira_em<=clock_timestamp();
  if exists(select 1 from public.ca_inspecao_tickets) or exists(select 1 from public.ca_inspecao_trabalhos
    where estado='processando' and lease_ate>=clock_timestamp()) then return jsonb_build_object('state','busy'); end if;
  if not exists(select 1 from public.ca_inspecao_trabalhos where
    (estado='fila' and tentar_em<=clock_timestamp()) or (estado='processando' and lease_ate<clock_timestamp()))
    then return jsonb_build_object('state','idle'); end if;
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

create function public.ca_inspecao_sync_start(p_sources jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ca_inspecao_raizes; s jsonb; d uuid; n integer:=0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:drive:start',0))
    then return jsonb_build_object('state','busy'); end if;
  if p_sources is not null then
    if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 3 then
      raise exception 'Raízes de sincronização inválidas.' using errcode='23514';
    end if;
    for s in select jsonb_array_elements(p_sources) loop
      perform public.ag_payload(s,array['folderId','kind']);
      if coalesce(s->>'folderId','') !~ '^[A-Za-z0-9_-]{5,250}$'
        or coalesce(s->>'kind','') not in ('laudo','montada','layout') then
        raise exception 'Raiz de sincronização inválida.' using errcode='23514';
      end if;
      insert into public.ca_inspecao_raizes values(s->>'folderId',s->>'kind') on conflict do nothing;
      if not exists(select 1 from public.ca_inspecao_raizes where (drive_id,tipo)=(s->>'folderId',s->>'kind'))
        then raise exception 'A raiz cadastrada requer conciliação antes de substituição.' using errcode='PT409'; end if;
    end loop;
  end if;
  if (public.ca_inspecao_sync_contexto()).organization_id is null then
    return jsonb_build_object('state','context_unavailable','queued',0);
  end if;
  for r in select * from public.ca_inspecao_raizes order by tipo loop
    if exists(select 1 from public.ca_inspecao_lotes where raiz=r.drive_id and
      (estado='andamento' or criado_em>clock_timestamp()-interval '15 minutes')) then continue; end if;
    insert into public.ca_inspecao_lotes(raiz) values(r.drive_id) returning id into d;
    insert into public.ca_inspecao_trabalhos(lote_id,tipo,chave,payload) values(
      d,'scan',r.drive_id,jsonb_build_object('folderId',r.drive_id,'kind',r.tipo,'ancestorNames','[]'::jsonb));
    n:=n+1;
  end loop;
  return public.ca_inspecao_sync_dispatch() || jsonb_build_object('queued',n);
end $$;

create function public.ca_inspecao_sync_claim(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ca_inspecao_trabalhos;
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
  return jsonb_build_object('authorized',true,'job',jsonb_build_object(
    'id',j.id,'lease',j.lease,'kind',j.tipo,case when j.tipo='scan' then 'scan' else 'source' end,j.payload));
end $$;

create function public.ca_inspecao_sync_scan(p_lote uuid,p_scan jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
  l public.ca_inspecao_lotes; s jsonb; dados public.ca_inspecao_fontes; s_id uuid;
  root_kind text:=p_scan->>'kind'; folder text:=p_scan->>'folderId'; pagina text:=p_result->>'nextPageToken';
  pais jsonb:=coalesce(p_scan->'ancestorNames','[]'); version numeric(30,0);
begin
  select * into strict l from public.ca_inspecao_lotes where id=p_lote;
  if c.organization_id is null then raise exception 'Contexto da unidade indisponível.' using errcode='42501'; end if;
  if jsonb_typeof(p_result->'children') is distinct from 'array'
    or jsonb_array_length(p_result->'children')>1000 or coalesce(length(pagina),0)>4096
  then raise exception 'Página do inventário inválida.' using errcode='23514'; end if;
  for s in select jsonb_array_elements(p_result->'children') loop
    s_id:=null;
    perform public.ag_payload(s,array['id','name','kind','mimeType','parents','modifiedAt','version','size',
      'sha256','resourceKey','code','revision']);
    if coalesce(s->>'id','') !~ '^[A-Za-z0-9_-]{5,250}$' or length(trim(coalesce(s->>'name',''))) not between 1 and 500
      or jsonb_typeof(s->'parents') is distinct from 'array'
      or not s->'parents' @> jsonb_build_array(folder)
      or coalesce(s->>'kind','') not in ('laudo','placa','montada','layout')
      or (s->>'kind'<>root_kind and not (root_kind='laudo' and s->>'kind'='placa'))
      or coalesce(s->>'mimeType','') not in ('application/pdf','application/vnd.google-apps.folder')
      or coalesce(length(s->>'resourceKey'),0)>500
    then raise exception 'Entrada fora do inventário desta pasta.' using errcode='23514'; end if;

    if s->>'mimeType'='application/vnd.google-apps.folder' then
      if root_kind<>'laudo' or jsonb_array_length(pais)>=4 or s->>'id'=folder
        then continue; end if;
      insert into public.ca_inspecao_trabalhos(lote_id,tipo,chave,payload) values(
        p_lote,'scan',s->>'id',jsonb_strip_nulls(jsonb_build_object(
          'folderId',s->>'id','kind',root_kind,'ancestorNames',pais || jsonb_build_array(s->>'name'),
          'parentFolderId',folder,'resourceKey',s->>'resourceKey')))
      on conflict(lote_id,tipo,chave) do nothing;
      continue;
    end if;
    if coalesce(s->>'version','') !~ '^\d{1,30}$' or coalesce(s->>'modifiedAt','')=''
      then raise exception 'Versão documental inválida.' using errcode='23514'; end if;
    version:=(s->>'version')::numeric(30,0);
    select * into dados from public.ca_inspecao_fontes
      where (organization_id,unidade_id,raiz,drive_id)=(c.organization_id,c.unidade_id,l.raiz,s->>'id') for update;
    if not found then
      insert into public.ca_inspecao_fontes(organization_id,cliente_id,unidade_id,raiz,drive_id,tipo,versao,nome,meta,visto_lote)
      values(c.organization_id,c.cliente_id,c.unidade_id,l.raiz,s->>'id',s->>'kind',version,s->>'name',s,p_lote)
      returning id into s_id;
    else
      s_id:=dados.id;
      if version<dados.versao then
        update public.ca_inspecao_fontes set visto_lote=p_lote where id=s_id;
        continue;
      end if;
      if version=dados.versao and s->>'sha256' is not null and dados.meta->>'sha256' is not null
        and s->>'sha256' is distinct from dados.meta->>'sha256' then
        raise exception 'A mesma versão informou outro conteúdo.' using errcode='23514';
      end if;
      if not dados.disponivel or version>dados.versao then perform public.ca_inspecao_sync_invalidar(s_id); end if;
      update public.ca_inspecao_fontes set visto_lote=p_lote,disponivel=true,conferido_em=clock_timestamp(),
        versao=greatest(versao,version),nome=case when version>=versao then s->>'name' else nome end,
        tipo=case when version>=versao then s->>'kind' else tipo end,
        meta=case when version>=versao then s else meta end
      where id=s_id;
    end if;
    if dados.id is null or (version>=dados.versao and dados.versao_processada is distinct from version) then
      insert into public.ca_inspecao_trabalhos(lote_id,tipo,chave,payload) values(
        p_lote,'process',s_id::text || ':' || version::text,s)
      on conflict(lote_id,tipo,chave) do nothing;
    end if;
  end loop;
  if pagina is not null then
    insert into public.ca_inspecao_trabalhos(lote_id,tipo,chave,payload) values(
      p_lote,'scan',folder || ':' || encode(sha256(convert_to(pagina,'UTF8')),'hex'),
      p_scan || jsonb_build_object('pageToken',pagina))
    on conflict(lote_id,tipo,chave) do nothing;
    if not found then raise exception 'Paginação repetida no inventário.' using errcode='23514'; end if;
  end if;
end $$;

create function public.ca_inspecao_sync_processar(p_lote uuid,p_source jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto(); l public.ca_inspecao_lotes;
  s public.ca_inspecao_fontes; eid uuid; code text; campo text; valor jsonb;
  hash text:=p_result->>'sha256'; bytes bigint:=(p_result->>'size')::bigint;
  paginas integer:=coalesce((p_result->>'pages')::integer,0); campos jsonb:=p_result->'fields';
  restricao jsonb:=nullif(p_result->'restriction','null'); issues jsonb:=p_result->'issues';
  keys text[]; antigo uuid; inequivoca boolean; novo_campos jsonb; rev integer;
begin
  select * into strict l from public.ca_inspecao_lotes where id=p_lote;
  if c.organization_id is null then raise exception 'Contexto da unidade indisponível.' using errcode='42501'; end if;
  select * into strict s from public.ca_inspecao_fontes where
    (organization_id,unidade_id,raiz,drive_id)=(c.organization_id,c.unidade_id,l.raiz,p_source->>'id') for update;
  if not s.disponivel or s.versao<>(p_source->>'version')::numeric(30,0) then return; end if;
  if s.versao_processada=s.versao then return; end if;
  perform public.ag_payload(p_result,array['kind','status','sha256','size','itemKeys','fields','restriction','issues','pages']);
  if coalesce(p_result->>'status','') not in ('verified','review','ready')
     or jsonb_typeof(p_result->'itemKeys') is distinct from 'array' or jsonb_array_length(p_result->'itemKeys')>100
     or jsonb_typeof(campos) is distinct from 'object' or paginas not between 0 and 5000
     or jsonb_typeof(issues) is distinct from 'array' or jsonb_array_length(issues)>30
     or exists(select 1 from jsonb_array_elements(issues) as e(i) where jsonb_typeof(i)<>'string' or length(i #>> '{}')>600)
  then raise exception 'Resultado documental inválido.' using errcode='23514'; end if;

  select coalesce(array_agg(distinct k),'{}') into keys from jsonb_array_elements_text(p_result->'itemKeys') as a(k);
  if cardinality(keys)>0 and (cardinality(keys)<>1 or
     keys[1] is distinct from case when s.tipo='layout' then 'unidade' else 'lvhf-'||(s.meta->>'code') end)
  then raise exception 'Associação distinta da identificação confirmada no inventário.' using errcode='23514'; end if;
  foreach code in array keys loop
    if not exists(select 1 from public.nr_cena_elementos e where e.cena=c.cena and e.chave=code
      and (e.tipo='lvhf' or (s.tipo='layout' and code='unidade'))) then
      raise exception 'Chave documental desconhecida.' using errcode='23514';
    end if;
  end loop;

  if hash is null then
    if bytes is not null or campos<>'{}' or restricao is not null or paginas<>0 then
      raise exception 'Extração sem original indisponível.' using errcode='23514';
    end if;
    if s.tipo in ('laudo','placa') and jsonb_array_length(issues)=0 then
      issues:=jsonb_build_array('Ausência de original validado para conferência.');
    end if;
    update public.ca_inspecao_fontes set versao_processada=s.versao,problemas=issues,chaves=keys
      where id=s.id;
    perform public.ca_inspecao_sync_invalidar(s.id);
    return;
  end if;

  if s.tipo not in ('laudo','placa') or hash !~ '^[a-f0-9]{64}$'
    or bytes is null or bytes not between 10 and 52428800
    or (s.meta->>'size' is not null and bytes is distinct from (s.meta->>'size')::bigint)
    or (s.meta->>'sha256' is not null and hash is distinct from s.meta->>'sha256')
    or not exists(select 1 from storage.objects o
      where o.bucket_id='nexus-cruz-alta-laudos' and o.name=hash||'.pdf'
        and o.metadata->>'size'=bytes::text and o.metadata->>'mimetype'='application/pdf')
  then raise exception 'PDF privado ainda não confirmado.' using errcode='23514'; end if;

  for campo,valor in select * from jsonb_each(campos) loop
    perform public.ag_payload(valor,array['value','page','label']);
    if campo not in ('installation','rt','inspection','due')
      or coalesce(length(trim(valor->>'value')),0) not between 1 and 300
      or coalesce(length(trim(valor->>'label')),0) not between 1 and 140
      or coalesce(valor->>'page','') !~ '^\d{1,4}$' or (valor->>'page')::integer not between 1 and paginas
      or (campo<>'rt' and valor->>'value' !~ '^\d{4}-\d{2}-\d{2}$')
      then raise exception 'Campo documental sem página ou valor válido.' using errcode='23514'; end if;
    if campo<>'rt' then perform (valor->>'value')::date; end if;
  end loop;
  if restricao is not null then
    perform public.ag_payload(restricao,array['text','page']);
    if coalesce(length(trim(restricao->>'text')),0) not between 1 and 6000
      or coalesce(restricao->>'page','') !~ '^\d{1,4}$' or (restricao->>'page')::integer not between 1 and paginas
    then raise exception 'Aviso documental sem página ou valor válido.' using errcode='23514'; end if;
  end if;

  if cardinality(keys)=0 and jsonb_array_length(issues)=0 then
    issues:=jsonb_build_array('Associação com item LVHF requer conferência.');
  end if;
  if campos ? 'due' and campos ? 'inspection' and
    (campos#>>'{due,value}')::date < (campos#>>'{inspection,value}')::date then
    issues:=issues || jsonb_build_array('A validade extraída é anterior à inspeção.');
  end if;
  inequivoca:=cardinality(keys)=1 and paginas>0 and jsonb_array_length(issues)=0 and campos<>'{}'
    and p_result->>'status'='verified';
  rev:=(s.meta->>'revision')::integer;
  antigo:=s.evidencia_atual;
  insert into public.ca_inspecao_evidencias(fonte_id,sha256,tamanho,nome,tipo,versao,revisao,modificado_em,
    paginas,campos,restricao,problemas,extracao_inequivoca)
  values(s.id,hash,bytes,s.nome,s.tipo,s.versao,rev,(s.meta->>'modifiedAt')::timestamptz,
    paginas,campos,restricao,issues,inequivoca)
  on conflict(fonte_id,sha256) do nothing returning id into eid;
  if eid is null then
    select e.id,e.campos,e.extracao_inequivoca,e.revisao into strict eid,campos,inequivoca,rev
    from public.ca_inspecao_evidencias e where e.fonte_id=s.id and e.sha256=hash;
  end if;
  foreach code in array keys loop
    insert into public.ca_inspecao_linhas(organization_id,cliente_id,unidade_id,chave)
    values(c.organization_id,c.cliente_id,c.unidade_id,code) on conflict do nothing;
    insert into public.ca_inspecao_vinculos(organization_id,unidade_id,chave,evidencia_id)
    values(c.organization_id,c.unidade_id,code,eid) on conflict do nothing;
    if inequivoca then
      select ll.campos into novo_campos from public.ca_inspecao_linhas ll
        where (ll.organization_id,ll.unidade_id,ll.chave)=(c.organization_id,c.unidade_id,code) for update;
      for campo,valor in select * from jsonb_each(campos) loop
        if (not novo_campos ? campo or (novo_campos->campo->>'origin'='drive'
          and exists(select 1 from public.ca_inspecao_evidencias prev
            where prev.id::text=novo_campos->campo->>'evidence' and (
              (prev.tipo=s.tipo and rev>prev.revisao)
              or lower(trim(novo_campos->campo->>'value'))=lower(trim(valor->>'value'))
                and (prev.id=eid or (prev.tipo='placa' and s.tipo='laudo'))
            )))) and not exists(
            select 1 from public.ca_inspecao_vinculos v join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
            join public.ca_inspecao_fontes f on f.id=e.fonte_id
            where (v.organization_id,v.unidade_id,v.chave)=(c.organization_id,c.unidade_id,code)
              and e.id<>eid and e.extracao_inequivoca
              and ((e.tipo=s.tipo and e.revisao=rev and e.sha256<>hash)
                or (f.evidencia_atual=e.id and f.disponivel and (e.tipo<>s.tipo or e.revisao>=rev)
                  and e.campos ? campo and lower(trim(e.campos->campo->>'value'))<>lower(trim(valor->>'value'))))
              and coalesce((select dd.acao from public.ca_inspecao_decisoes dd where
                (dd.organization_id,dd.unidade_id,dd.chave,dd.evidencia_id)=(v.organization_id,v.unidade_id,v.chave,e.id)
                order by dd.versao desc limit 1),'')<>'dismiss'
        ) then
          novo_campos:=jsonb_set(novo_campos,array[campo],
            valor || jsonb_build_object('evidence',eid,'origin','drive'),true);
        end if;
      end loop;
      if not (novo_campos ? 'due' and novo_campos ? 'inspection' and
        (novo_campos#>>'{due,value}')::date < (novo_campos#>>'{inspection,value}')::date) then
        update public.ca_inspecao_linhas ll set campos=novo_campos where
          (ll.organization_id,ll.unidade_id,ll.chave)=(c.organization_id,c.unidade_id,code);
      end if;
    end if;
  end loop;
  update public.ca_inspecao_fontes set evidencia_atual=eid,versao_processada=s.versao,
    problemas=case when cardinality(keys)=0 then issues else '[]'::jsonb end,chaves=keys where id=s.id;
  if antigo is distinct from eid or s.versao_processada is distinct from s.versao then
    perform public.ca_inspecao_sync_invalidar(s.id);
  end if;
end $$;

create function public.ca_inspecao_sync_finish(p_id uuid,p_lease uuid,p_result jsonb) returns jsonb
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
  if j.tipo='scan' then perform public.ca_inspecao_sync_scan(j.lote_id,j.payload,p_result);
  else perform public.ca_inspecao_sync_processar(j.lote_id,j.payload,p_result); end if;
  update public.ca_inspecao_trabalhos set estado='concluido',lease=null,lease_ate=null,erro=null where id=j.id;
  perform public.ca_inspecao_sync_encerrar(j.lote_id);
  perform public.ca_inspecao_sync_dispatch();
  return jsonb_build_object('state','completed');
end $$;

create function public.ca_inspecao_sync_fail(p_id uuid,p_lease uuid,p_error text,p_retryable boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ca_inspecao_trabalhos; novo text;
begin
  select * into j from public.ca_inspecao_trabalhos
  where id=p_id and lease=p_lease and estado='processando' and lease_ate>=clock_timestamp() for update;
  if not found then return jsonb_build_object('state','obsolete'); end if;
  novo:=case when p_retryable and j.tentativas<3 then 'fila' else 'falhou' end;
  -- Erros são internos. O worker envia códigos redigidos, sem cabeçalhos ou URLs.
  update public.ca_inspecao_trabalhos set estado=novo,lease=null,lease_ate=null,
    tentar_em=clock_timestamp()+make_interval(secs=>20*j.tentativas),erro=left(coalesce(p_error,'Falha na conferência'),450)
  where id=j.id;
  perform public.ca_inspecao_sync_encerrar(j.lote_id);
  perform public.ca_inspecao_sync_dispatch();
  return jsonb_build_object('state',case when novo='fila' then 'retry' else 'failed' end);
end $$;

create function public.ca_inspecao_sync_status(p_org uuid) returns jsonb
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
    where t.raiz=r.drive_id and t.estado='concluido') g on true;
  cfg:=exists(select 1 from public.ca_inspecao_raizes where tipo='laudo') and public.ca_inspecao_sync_url() is not null
    and pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null;
  return jsonb_build_object('state',case when not cfg then 'not_configured' when atividade then 'syncing'
    when falhas then 'partial' when ultima is null or ultima<now()-interval '45 minutes' then 'stale'
    else 'verified' end,'lastCheckedAt',ultima);
end $$;

create function public.ca_inspecao_request_sync(p_org uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if public.ca_inspecao_revisor(p_org) is null then
    raise exception 'A conferência imediata exige um revisor técnico autorizado.' using errcode='42501';
  end if;
  if public.ca_inspecao_sync_url() is null or
    not exists(select 1 from public.ca_inspecao_raizes where tipo='laudo') then
    return jsonb_build_object('state','not_configured','queued',0);
  end if;
  return public.ca_inspecao_sync_start();
end $$;

revoke all on function public.ca_inspecao_sync_contexto(),public.ca_inspecao_sync_invalidar(uuid),
  public.ca_inspecao_sync_encerrar(uuid),public.ca_inspecao_sync_expirar(),public.ca_inspecao_sync_url(),
  public.ca_inspecao_sync_dispatch(),public.ca_inspecao_sync_start(jsonb),public.ca_inspecao_sync_claim(text),
  public.ca_inspecao_sync_scan(uuid,jsonb,jsonb),public.ca_inspecao_sync_processar(uuid,jsonb,jsonb),
  public.ca_inspecao_sync_finish(uuid,uuid,jsonb),public.ca_inspecao_sync_fail(uuid,uuid,text,boolean),
  public.ca_inspecao_sync_status(uuid),public.ca_inspecao_request_sync(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_sync_start(jsonb),public.ca_inspecao_sync_claim(text),
  public.ca_inspecao_sync_finish(uuid,uuid,jsonb),public.ca_inspecao_sync_fail(uuid,uuid,text,boolean) to service_role;
grant execute on function public.ca_inspecao_sync_status(uuid),public.ca_inspecao_request_sync(uuid) to authenticated;

do $scheduler$
declare id bigint;
begin
  if not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')
    or pg_catalog.to_regclass('vault.decrypted_secrets') is null
    or pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    insert into public.scheduler_configuracao(nome,estado,extensao,detalhe)
      values('cruz-alta-laudos','indisponivel','pg_cron/pg_net/vault',
        'A fila privada aguarda as extensões do agendamento de laudos.');
    return;
  end if;
  execute 'select cron.schedule($1,$2,$3)' into id using 'nexus-ca-inspecao-drive','* * * * *',
    'select public.ca_inspecao_sync_start();';
  insert into public.scheduler_configuracao(nome,estado,extensao,job_id,detalhe)
    values('cruz-alta-laudos','ativo','pg_cron/pg_net/vault',id,
      'A fila é conferida a cada minuto. Novas leituras em intervalos de 15 minutos aguardam as raízes e a URL privadas.');
end $scheduler$;
notify pgrst,'reload schema';
