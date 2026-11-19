-- Laudos externos permanecem privados. O leitor contextual assina somente a revisão autorizada.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nexus-cruz-alta-laudos','nexus-cruz-alta-laudos',false,52428800,array['application/pdf']);

create table public.ca_inspecao_fontes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  cliente_id uuid not null, unidade_id uuid not null, raiz text not null, drive_id text not null,
  tipo text not null check (tipo in ('laudo','placa','montada','layout')),
  versao numeric(30,0) not null, versao_processada numeric(30,0),
  nome text not null, meta jsonb not null, visto_lote uuid not null,
  disponivel boolean not null default true, conferido_em timestamptz not null default now(),
  evidencia_atual uuid, problemas jsonb not null default '[]',
  chaves text[] not null default '{}',
  foreign key(organization_id,cliente_id,unidade_id)
    references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id),
  unique(organization_id,unidade_id,raiz,drive_id)
);

create table public.ca_inspecao_evidencias (
  id uuid primary key default gen_random_uuid(), fonte_id uuid not null references public.ca_inspecao_fontes(id),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  tamanho bigint not null check(tamanho between 10 and 52428800),
  caminho text generated always as (sha256 || '.pdf') stored,
  nome text not null, tipo text not null check(tipo in ('laudo','placa','montada','layout')),
  versao numeric(30,0) not null, revisao integer check(revisao is null or revisao >= 0),
  modificado_em timestamptz not null, recebido_em timestamptz not null default now(),
  paginas integer not null check(paginas between 0 and 5000),
  campos jsonb not null check(jsonb_typeof(campos)='object'),
  restricao jsonb check(restricao is null or (tipo in ('laudo','placa') and jsonb_typeof(restricao)='object')),
  problemas jsonb not null check(jsonb_typeof(problemas)='array'),
  extracao_inequivoca boolean not null default false,
  unique(fonte_id,sha256), unique(fonte_id,id)
);
alter table public.ca_inspecao_fontes add foreign key(id,evidencia_atual)
  references public.ca_inspecao_evidencias(fonte_id,id);

create table public.ca_inspecao_linhas (
  organization_id uuid not null, cliente_id uuid not null, unidade_id uuid not null,
  cena text not null default 'tres-tentos-cruz-alta' check(cena='tres-tentos-cruz-alta'), chave text not null,
  versao integer not null default 0, campos jsonb not null default '{}', restricao jsonb,
  primary key(organization_id,unidade_id,chave),
  foreign key(organization_id,cliente_id,unidade_id)
    references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id),
  foreign key(cena,chave) references public.nr_cena_elementos(cena,chave)
);

create table public.ca_inspecao_vinculos (
  organization_id uuid not null, unidade_id uuid not null, chave text not null,
  evidencia_id uuid not null references public.ca_inspecao_evidencias(id),
  primary key(organization_id,unidade_id,chave,evidencia_id),
  foreign key(organization_id,unidade_id,chave)
    references public.ca_inspecao_linhas(organization_id,unidade_id,chave)
);
create index ca_inspecao_vinculos_evidencia on public.ca_inspecao_vinculos(evidencia_id);
create index ca_inspecao_fontes_conferencia on public.ca_inspecao_fontes(organization_id,unidade_id,conferido_em);

create table public.ca_inspecao_decisoes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unidade_id uuid not null,
  chave text not null, versao integer not null, evidencia_id uuid not null,
  autor uuid not null references auth.users(id), profissional_id uuid not null references public.pessoas(id),
  criado_em timestamptz not null default now(), acao text not null check(acao in ('approve','dismiss')),
  nota text not null check(length(nota) <= 2500),
  antes jsonb not null, depois jsonb not null, pedido jsonb not null,
  unique(organization_id,unidade_id,chave,versao),
  foreign key(organization_id,unidade_id,chave,evidencia_id)
    references public.ca_inspecao_vinculos(organization_id,unidade_id,chave,evidencia_id)
);
create index ca_inspecao_decisoes_evidencia
  on public.ca_inspecao_decisoes(organization_id,unidade_id,chave,evidencia_id,versao desc);

create function public.ca_inspecao_imutavel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  raise exception 'A evidência e a decisão publicadas são imutáveis.' using errcode='23514';
end $$;
create trigger ca_inspecao_evidencia_preservar before update or delete on public.ca_inspecao_evidencias
  for each row execute function public.ca_inspecao_imutavel();
create trigger ca_inspecao_decisao_preservar before update or delete on public.ca_inspecao_decisoes
  for each row execute function public.ca_inspecao_imutavel();

alter table public.ca_inspecao_fontes enable row level security;
alter table public.ca_inspecao_evidencias enable row level security;
alter table public.ca_inspecao_linhas enable row level security;
alter table public.ca_inspecao_vinculos enable row level security;
alter table public.ca_inspecao_decisoes enable row level security;
revoke all on public.ca_inspecao_fontes,public.ca_inspecao_evidencias,public.ca_inspecao_linhas,
  public.ca_inspecao_vinculos,public.ca_inspecao_decisoes from public,anon,authenticated,service_role;

create function public.ca_inspecao_revisor(p_org uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select case when public.pode(p_org,'revisar_nr') then public.lev_profissional(p_org) end
$$;

create function public.ca_inspecao_item(p_org uuid,p_unit uuid,p_key text,p_reviewer boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  with registro as (
    select campos,restricao from public.ca_inspecao_linhas
    where (organization_id,unidade_id,chave)=(p_org,p_unit,p_key)
  ), revisoes as (
    select e.*,s.disponivel,s.evidencia_atual,s.conferido_em,s.problemas as problemas_fonte,
      s.versao as versao_fonte,s.versao_processada,d.acao,r.restricao as aviso_adotado,
      divergencias.campos as campos_divergentes,
      max(e.revisao) filter(where e.extracao_inequivoca and s.disponivel and s.evidencia_atual=e.id
        and d.acao is distinct from 'dismiss') over(partition by e.tipo) as ultima_revisao
    from public.ca_inspecao_vinculos v
    join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
    join public.ca_inspecao_fontes s on s.id=e.fonte_id
      and (s.organization_id,s.unidade_id)=(v.organization_id,v.unidade_id)
    left join lateral (
      select dd.acao from public.ca_inspecao_decisoes dd
      where (dd.organization_id,dd.unidade_id,dd.chave,dd.evidencia_id)=(v.organization_id,v.unidade_id,v.chave,e.id)
      order by dd.versao desc limit 1
    ) d on true
    left join registro r on true
    cross join lateral (
      select exists(select 1 from jsonb_each(e.campos) f
        where regexp_replace(lower(trim(f.value->>'value')),'\s+',' ','g') is distinct from
          regexp_replace(lower(trim(r.campos->f.key->>'value')),'\s+',' ','g')) as campos
    ) divergencias
    where (v.organization_id,v.unidade_id,v.chave)=(p_org,p_unit,p_key)
  ),
  documentos as (
    select e.*,
      concorrente.outra,
      case when e.acao='dismiss' then 'dismissed'
           when e.id is distinct from e.evidencia_atual or e.revisao<e.ultima_revisao then 'historical'
           when e.acao='approve' then 'approved'
           when not e.extracao_inequivoca or e.campos_divergentes or concorrente.outra
             or e.restricao is not null and regexp_replace(lower(trim(e.restricao->>'text')),'\s+',' ','g')
                is distinct from regexp_replace(lower(trim(e.aviso_adotado->>'text')),'\s+',' ','g')
             or e.tipo='laudo' and e.restricao is null and e.aviso_adotado is not null
           then 'pending' else 'approved' end as estado
    from revisoes e
    cross join lateral (
      select exists(select 1 from revisoes r where r.tipo=e.tipo and r.revisao=e.revisao
        and r.sha256<>e.sha256 and r.acao is distinct from 'dismiss') as outra
    ) concorrente
  ),
  achados as (
    select max(s.conferido_em) checked, count(*)>0 as pendente
    from public.ca_inspecao_fontes s where (s.organization_id,s.unidade_id)=(p_org,p_unit)
      and s.tipo in ('laudo','placa') and p_key=any(s.chaves) and s.disponivel
      and jsonb_array_length(s.problemas)>0
  ), resumo as (
    select max(conferido_em) checked,
      coalesce(bool_or(disponivel and estado='pending'),false) as pendente,
      coalesce(bool_or(estado<>'historical' and evidencia_atual=id and (not disponivel or versao_processada is distinct from versao_fonte
        or jsonb_array_length(problemas_fonte)>0)),false) as obsoleto,
      coalesce(bool_or(evidencia_atual=id and jsonb_array_length(problemas_fonte)>0),false) as problema,
      coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',id,'kind',tipo,'sourceName',nome,'revision',coalesce(revisao::text,versao::text),
        'sha256',sha256,'checkedAt',conferido_em,'modifiedAt',modificado_em,
        'state',estado,'available',disponivel,'pages',paginas,
        'fields',case when p_reviewer then campos end,
        'restriction',case when p_reviewer then restricao end,
        'issues',case when p_reviewer then problemas || problemas_fonte ||
          case when outra then jsonb_build_array('A mesma revisão técnica tem originais diferentes.') else '[]' end ||
          case when campos_divergentes then jsonb_build_array('Há dados ou datas divergentes entre as fontes.') else '[]' end end
      )) order by modificado_em desc,id) filter(where p_reviewer or acao='approve'
         or extracao_inequivoca and acao is distinct from 'dismiss'),'[]') as arquivos
    from documentos
  )
  select jsonb_build_object(
    'key',e.chave,'code',e.codigo,'version',coalesce(l.versao,0),
    'status',case when l.restricao is not null then 'restricted'
                  when r.obsoleto then 'stale'
                  when r.pendente or r.problema or a.pendente then 'review'
                  when coalesce(l.campos,'{}') ? 'due'
                    and (l.campos#>>'{due,value}')::date < (now() at time zone 'America/Sao_Paulo')::date then 'expired'
                  when coalesce(l.campos,'{}') ? 'due' and coalesce(l.campos,'{}') ? 'inspection' then 'verified'
                  else 'unconfirmed' end,
    'availability',case when r.obsoleto then 'stale' when r.pendente or r.problema or a.pendente then 'review'
                         when r.checked is not null then 'verified' else 'unconfirmed' end,
    'fields',coalesce(l.campos,'{}'),'restriction',l.restricao,
    'documents',r.arquivos,'reviewRequired',r.pendente or r.problema or r.obsoleto or a.pendente,
    'checkedAt',greatest(r.checked,a.checked),
    'mounted',exists(select 1 from public.ca_inspecao_fontes s where
      (s.organization_id,s.unidade_id,s.tipo)=(p_org,p_unit,'montada') and s.disponivel and p_key=any(s.chaves)),
    'issues',case when r.pendente or r.problema or r.obsoleto or a.pendente
      then jsonb_build_array('Há evidência que requer conferência no acervo.') else '[]'::jsonb end
  )
  from public.nr_cena_elementos e
  left join public.ca_inspecao_linhas l on (l.organization_id,l.unidade_id,l.chave)=(p_org,p_unit,e.chave)
  cross join resumo r
  cross join achados a
  where e.cena='tres-tentos-cruz-alta' and e.chave=p_key and e.tipo='lvhf'
$$;

create function public.ca_inspecao_summary(p_org uuid,p_chave text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
  reviewer boolean:=public.ca_inspecao_revisor(p_org) is not null;
  itens jsonb; pendientes jsonb;
begin
  if not exists(select 1 from public.nr_cena_elementos where cena=c.cena and chave=p_chave) then
    raise exception 'Objeto indisponível nesta unidade.' using errcode='42501';
  end if;
  with recursive descendentes as (
    select e.chave,e.tipo from public.nr_cena_elementos e where e.cena=c.cena and e.chave=p_chave
    union
    select e.chave,e.tipo from public.nr_cena_elementos e join descendentes d on e.pai=d.chave
    where e.cena=c.cena
  )
  select coalesce(jsonb_agg(public.ca_inspecao_item(p_org,c.unidade_id,chave,reviewer) order by chave),'[]')
  into itens from descendentes where tipo='lvhf';
  if reviewer then
    select coalesce(jsonb_agg(f),'[]') into pendientes from (
      select s.id,s.nome as "sourceName",s.tipo as kind,s.conferido_em as "checkedAt",s.problemas as issues
      from public.ca_inspecao_fontes s where (s.organization_id,s.unidade_id)=(p_org,c.unidade_id)
        and jsonb_array_length(s.problemas)>0
        and not exists(select 1 from public.ca_inspecao_vinculos v where v.evidencia_id=s.evidencia_atual)
      order by s.conferido_em desc,s.id limit 100
    ) f;
  end if;
  return jsonb_build_object('items',itens,'canReview',reviewer,'unmatched',coalesce(pendientes,'[]'),
    'lastCheckedAt',(select max(s.conferido_em) from public.ca_inspecao_fontes s
      where (s.organization_id,s.unidade_id)=(p_org,c.unidade_id)));
end $$;

create function public.ca_inspecao_preview(p_org uuid,p_key text,p_evidence uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); r public.ca_inspecao_evidencias;
begin
  if not (public.pode(p_org,'ver_nr') or exists(
    select 1 from public.nr_cena_consultores v where
      (v.organization_id,v.cliente_id,v.unidade_id,v.usuario_id)=(p_org,c.cliente_id,c.unidade_id,auth.uid())
      and v.permite_original
  )) then raise exception 'Seu perfil não permite abrir os bytes originais.' using errcode='42501'; end if;
  select e.* into r from public.ca_inspecao_evidencias e join public.ca_inspecao_vinculos v on v.evidencia_id=e.id
  join public.ca_inspecao_fontes s on s.id=e.fonte_id and (s.organization_id,s.unidade_id)=(v.organization_id,v.unidade_id)
  where (v.organization_id,v.unidade_id,v.chave,v.evidencia_id)=(p_org,c.unidade_id,p_key,p_evidence)
  and (public.ca_inspecao_revisor(p_org) is not null or
    coalesce((select d.acao from public.ca_inspecao_decisoes d where
      (d.organization_id,d.unidade_id,d.chave,d.evidencia_id)=(p_org,c.unidade_id,p_key,p_evidence)
      order by d.versao desc limit 1),case when e.extracao_inequivoca then 'approve' end)='approve');
  if not found then raise exception 'Laudo indisponível neste destino.' using errcode='42501'; end if;
  return jsonb_build_object('path',r.caminho,'sha256',r.sha256,'size',r.tamanho,'pages',r.paginas,'name',r.nome);
end $$;

create function public.ca_inspecao_review(
  p_org uuid,p_key text,p_version integer,p_decisions jsonb,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
  perfil uuid; l public.ca_inspecao_linhas; r public.ca_inspecao_evidencias;
  s public.ca_inspecao_fontes; eid uuid; campo text; novos_campos jsonb; novo_aviso jsonb;
  nota text:=trim(coalesce(p_note,'')); acao text:=p_decisions->>'action';
  decisao text:=coalesce(p_decisions#>>'{restriction,action}','keep'); anterior jsonb;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  perfil:=public.ca_inspecao_revisor(p_org);
  if perfil is null then raise exception 'A conferência exige um revisor técnico autorizado.' using errcode='42501'; end if;
  perform public.ag_payload(p_decisions,array['evidence','action','adopt','restriction']);
  if p_decisions ? 'restriction' then perform public.ag_payload(p_decisions->'restriction',array['action']); end if;
  if p_version is null or acao is null or acao not in ('approve','dismiss') or decisao not in ('keep','adopt','remove')
    or length(nota)>2500 or (acao='dismiss' or decisao='remove') and nota=''
    or jsonb_typeof(coalesce(p_decisions->'adopt','[]')) is distinct from 'array'
    or coalesce(p_decisions->>'evidence','') !~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'
  then raise exception 'Decisão técnica inválida ou justificativa ausente.' using errcode='23514'; end if;
  eid:=(p_decisions->>'evidence')::uuid;
  select * into l from public.ca_inspecao_linhas
    where (organization_id,unidade_id,chave)=(p_org,c.unidade_id,p_key) for update;
  if not found then raise exception 'Linha indisponível nesta revisão.' using errcode='42501'; end if;
  if l.versao is distinct from p_version then
    raise exception 'A linha mudou. Atualize antes de confirmar.' using errcode='PT409';
  end if;
  select e.* into r from public.ca_inspecao_evidencias e join public.ca_inspecao_vinculos v on v.evidencia_id=e.id
    where (v.organization_id,v.unidade_id,v.chave,v.evidencia_id)=(p_org,c.unidade_id,p_key,eid);
  if not found then raise exception 'Laudo indisponível neste destino.' using errcode='42501'; end if;
  begin
    select * into s from public.ca_inspecao_fontes where id=r.fonte_id for share nowait;
  exception when lock_not_available then
    raise exception 'A fonte está sendo conferida. Atualize antes de decidir.' using errcode='PT409';
  end;
  if (s.organization_id,s.unidade_id) is distinct from (p_org,c.unidade_id)
     or not s.disponivel or s.evidencia_atual is distinct from eid or s.versao_processada is distinct from s.versao then
    raise exception 'A fonte foi alterada ou está indisponível. Confira a revisão atual.' using errcode='PT409';
  end if;
  if exists(select 1 from public.ca_inspecao_vinculos v join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
    join public.ca_inspecao_fontes f on f.evidencia_atual=e.id
    where (v.organization_id,v.unidade_id,v.chave)=(p_org,c.unidade_id,p_key)
      and e.tipo=r.tipo and e.revisao>r.revisao and e.extracao_inequivoca and f.disponivel
      and coalesce((select dd.acao from public.ca_inspecao_decisoes dd where
        (dd.organization_id,dd.unidade_id,dd.chave,dd.evidencia_id)=(p_org,c.unidade_id,p_key,e.id)
        order by dd.versao desc limit 1),'')<>'dismiss') then
    raise exception 'Existe uma revisão documental mais recente nesta linha.' using errcode='PT409';
  end if;

  novos_campos:=l.campos;
  novo_aviso:=l.restricao;
  anterior:=jsonb_build_object('fields',novos_campos,'restriction',novo_aviso);
  if acao='dismiss' and (decisao<>'keep' or jsonb_array_length(coalesce(p_decisions->'adopt','[]'))>0
    or l.restricao->>'evidence'=eid::text or exists(
      select 1 from jsonb_each(l.campos) f where f.value->>'evidence'=eid::text
    )) then
    raise exception 'Descartar uma evidência não altera dados publicados.' using errcode='23514';
  end if;
  if acao='approve' then
    for campo in select jsonb_array_elements_text(coalesce(p_decisions->'adopt','[]')) loop
      if campo not in ('installation','rt','inspection','due') or not r.campos ? campo then
        raise exception 'O campo não consta da revisão conferida.' using errcode='23514';
      end if;
      novos_campos:=jsonb_set(novos_campos,array[campo],r.campos->campo || jsonb_build_object('evidence',r.id),true);
    end loop;
    if r.restricao is not null and not p_decisions ? 'restriction' then
      raise exception 'Escolha como tratar o aviso da revisão.' using errcode='23514';
    end if;
    if decisao='adopt' then
      if r.restricao is null or r.tipo not in ('laudo','placa') then
        raise exception 'O aviso deve constar da revisão conferida.' using errcode='23514';
      end if;
      novo_aviso:=r.restricao || jsonb_build_object('evidence',r.id);
    elsif decisao='remove' then
      if l.restricao is null or r.tipo<>'laudo' or r.restricao is not null or jsonb_array_length(r.problemas)>0 then
        raise exception 'A remoção exige um laudo atual sem aviso ou pendência de leitura.' using errcode='23514';
      end if;
      novo_aviso:=null;
    end if;
  end if;
  if novos_campos ? 'due' and novos_campos ? 'inspection' and
    (novos_campos#>>'{due,value}')::date < (novos_campos#>>'{inspection,value}')::date then
    raise exception 'Validade anterior à inspeção. Confira os dois campos.' using errcode='23514';
  end if;
  update public.ca_inspecao_linhas ll set campos=novos_campos,restricao=novo_aviso,
    versao=ll.versao+1 where (ll.organization_id,ll.unidade_id,ll.chave)=(p_org,c.unidade_id,p_key);
  insert into public.ca_inspecao_decisoes(organization_id,unidade_id,chave,versao,evidencia_id,autor,profissional_id,
    acao,nota,antes,depois,pedido)
  values(p_org,c.unidade_id,p_key,l.versao+1,eid,auth.uid(),perfil,acao,nota,anterior,
    jsonb_build_object('fields',novos_campos,'restriction',novo_aviso),p_decisions);
  return public.ca_inspecao_item(p_org,c.unidade_id,p_key,true);
end $$;

revoke all on function public.ca_inspecao_imutavel(),public.ca_inspecao_revisor(uuid),
  public.ca_inspecao_item(uuid,uuid,text,boolean),public.ca_inspecao_summary(uuid,text),
  public.ca_inspecao_preview(uuid,text,uuid),public.ca_inspecao_review(uuid,text,integer,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_summary(uuid,text),
  public.ca_inspecao_preview(uuid,text,uuid),public.ca_inspecao_review(uuid,text,integer,jsonb,text)
  to authenticated;
notify pgrst,'reload schema';
