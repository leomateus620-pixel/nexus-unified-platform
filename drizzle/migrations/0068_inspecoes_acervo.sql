-- Atribuições técnicas explícitas e acervo histórico isolado dos contextos NR33/NR35.
create table public.inspecoes_perfis_competencias (
  organization_id uuid not null references public.organizations(id),
  perfil text not null check (perfil in ('EST','TST')),
  competencia_id uuid not null,
  primary key (organization_id,perfil,competencia_id),
  foreign key (organization_id,competencia_id) references public.competencias(organization_id,id)
);

create table public.inspecoes_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  pessoa_id uuid not null,
  qualificacao_id uuid not null,
  perfil text not null check (perfil in ('EST','TST')),
  cliente_id uuid,
  unidade_id uuid,
  ensaios boolean not null default false,
  biblioteca boolean not null default false,
  importacao boolean not null default false,
  comunicacao boolean not null default false,
  inicio date not null,
  fim date,
  revogada_em timestamptz,
  designacao text not null check (length(trim(designacao)) between 5 and 2000),
  concedido_por uuid not null references auth.users(id),
  concedido_em timestamptz not null default now(),
  foreign key (organization_id,user_id) references public.memberships(organization_id,user_id) on delete cascade,
  foreign key (organization_id,pessoa_id) references public.pessoas(organization_id,id),
  foreign key (organization_id,qualificacao_id) references public.pessoa_qualificacoes(organization_id,id),
  foreign key (organization_id,cliente_id) references public.clientes(organization_id,id),
  foreign key (organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
  check (unidade_id is null or cliente_id is not null),
  check (fim is null or fim >= inicio),
  check (perfil = 'EST' or not (biblioteca or importacao or comunicacao))
);
create index inspecoes_atribuicoes_usuario on public.inspecoes_atribuicoes(organization_id,user_id)
  where revogada_em is null;

create function public.inspecoes_atribuicoes_validas(p_org uuid,p_user uuid)
returns setof public.inspecoes_atribuicoes language sql stable security definer set search_path='' as $$
  select a.* from public.inspecoes_atribuicoes a
  join public.memberships m using (organization_id,user_id)
  join public.pessoas p on p.organization_id=a.organization_id and p.id=a.pessoa_id and p.user_id=a.user_id
  join public.pessoa_qualificacoes q on q.organization_id=a.organization_id and q.id=a.qualificacao_id and q.pessoa_id=p.id
  join public.inspecoes_perfis_competencias pc
    on pc.organization_id=a.organization_id and pc.perfil=a.perfil and pc.competencia_id=q.competencia_id
  join public.competencias c on c.organization_id=pc.organization_id and c.id=pc.competencia_id
  where a.organization_id=p_org and a.user_id=p_user and p.ativa and c.ativa
    and a.revogada_em is null and a.inicio <= (now() at time zone 'America/Sao_Paulo')::date
    and (a.fim is null or a.fim >= (now() at time zone 'America/Sao_Paulo')::date)
    and q.estado='validada' and q.conclusao <= (now() at time zone 'America/Sao_Paulo')::date
    and (not c.exige_validade or q.validade is not null)
    and (q.validade is null or q.validade >= (now() at time zone 'America/Sao_Paulo')::date)
    and (a.perfil <> 'EST' or nullif(trim(p.registro_profissional),'') is not null)
$$;

create function public.inspecoes_acesso(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'perfil',a.perfil,'pessoa_id',a.pessoa_id,'cliente_id',a.cliente_id,'unidade_id',a.unidade_id,
    'ensaios',a.ensaios,'biblioteca',a.biblioteca,'importacao',a.importacao,'comunicacao',a.comunicacao
  ) order by a.perfil,a.id),'[]'::jsonb)
  from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
$$;

create function public.inspecoes_pode(
  p_org uuid,p_cliente uuid default null,p_unidade uuid default null,p_capacidade text default 'consultar'
) returns boolean language sql stable security definer set search_path='' as $$
  select (p_unidade is null or p_cliente is not null) and exists(
    select 1 from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
    where (
      (p_cliente is null and p_capacidade='consultar')
      or ((a.cliente_id is null or a.cliente_id=p_cliente) and (a.unidade_id is null or a.unidade_id=p_unidade))
    ) and case p_capacidade
      when 'consultar' then true
      when 'levantar' then true
      when 'est' then a.perfil='EST'
      when 'ensaio' then a.ensaios
      when 'biblioteca' then a.perfil='EST' and a.biblioteca
      when 'importar' then a.perfil='EST' and a.importacao
      when 'comunicar' then a.perfil='EST' and a.comunicacao
      else false end
  )
$$;

create table public.inspecoes_contextos (
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  segmento text check (segmento in ('CC','AG-A','AG-B','IN')),
  snapshot jsonb not null default '{}' check (jsonb_typeof(snapshot)='object'),
  primary key (organization_id,cliente_id,unidade_id),
  foreign key (organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id)
);

create function public.inspecoes_contexto(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id',i.organization_id,'cliente_id',i.cliente_id,'unidade_id',i.unidade_id,
    'segmento',i.segmento,'snapshot',i.snapshot,'cliente_nome',coalesce(c.nome_exibicao,c.razao_social),
    'unidade_nome',u.nome,'marca',c.marca,'cliente_arquivado_em',c.arquivado_em,'unidade_arquivada_em',u.arquivado_em
  ) order by coalesce(c.nome_exibicao,c.razao_social),u.nome,i.unidade_id),'[]'::jsonb)
  from public.inspecoes_contextos i
  join public.clientes c on c.organization_id=i.organization_id and c.id=i.cliente_id
  join public.unidades u on u.organization_id=i.organization_id and u.cliente_id=i.cliente_id and u.id=i.unidade_id
  where i.organization_id=p_org and public.inspecoes_pode(i.organization_id,i.cliente_id,i.unidade_id)
$$;

create table public.inspecoes_registros (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cliente_id uuid,
  unidade_id uuid,
  colecao text not null check (colecao in (
    'documentos','ativos','inspecoes','pendencias','importacoes','plantas','equipamentos','servicos','familias',
    'tipos','pacotes','matrizes','regras','parametros','textos','listas','registro','avisos','contratos','ensaios',
    'os','configuracoes'
  )),
  source_id text not null check (length(trim(source_id)) between 1 and 200),
  titulo text not null check (length(trim(titulo)) between 1 and 1000),
  codigo text,
  familia text,
  situacao text,
  data_ref date,
  vigente boolean not null default true,
  existente boolean not null default true,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  schema_version integer not null default 1 check (schema_version > 0),
  origem_autor text,
  origem_data text,
  importado_em timestamptz not null default now(),
  importado_por uuid references auth.users(id),
  unique(organization_id,colecao,source_id),
  unique(organization_id,id),
  unique(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id),
  check ((cliente_id is null) = (unidade_id is null)),
  check (
    (colecao in ('documentos','ativos','inspecoes','pendencias','importacoes','plantas','avisos','contratos','ensaios','os') and unidade_id is not null)
    or (colecao in ('equipamentos','servicos','familias','tipos','pacotes','matrizes','regras','parametros','textos','listas','registro','configuracoes') and unidade_id is null)
  )
);
create index inspecoes_registros_lista on public.inspecoes_registros(organization_id,colecao,cliente_id,unidade_id,titulo,id);
create index inspecoes_registros_data on public.inspecoes_registros(organization_id,colecao,data_ref desc nulls last,id);
create index inspecoes_registros_ativos_vigentes on public.inspecoes_registros(organization_id,unidade_id,codigo,id)
  where colecao='ativos' and vigente and existente;

create table public.inspecoes_relacoes (
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  origem_id uuid not null,
  destino_id uuid not null,
  tipo text not null check (tipo in ('documento','ativo','planta','pendencia','principal','substituido_por')),
  primary key (organization_id,origem_id,destino_id,tipo),
  foreign key (organization_id,cliente_id,unidade_id,origem_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,destino_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  check (origem_id <> destino_id)
);
create index inspecoes_relacoes_destino on public.inspecoes_relacoes(organization_id,destino_id,tipo,origem_id);

create table public.inspecoes_arquivos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid,
  unidade_id uuid,
  registro_id uuid not null,
  papel text not null check (papel in ('original','foto','certificado','art','projeto','fabricante','modelo','piloto','prancha','ensaio','evidencia')),
  ordem integer check (ordem >= 0),
  nome text not null check (length(trim(nome)) between 1 and 255 and nome !~ '[/\\[:cntrl:]]'),
  legenda text,
  estado text not null check (estado in ('original_verificado','referencia_externa','snapshot_textual','original_pendente','falha_processamento')),
  origem text not null check (length(trim(origem)) between 1 and 2000),
  caminho text unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint check (bytes between 1 and 52428800),
  mime text check (mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png','image/webp','video/mp4','video/webm','application/json')),
  miniatura_caminho text unique,
  miniatura_sha256 text check (miniatura_sha256 ~ '^[0-9a-f]{64}$'),
  previa_caminho text unique,
  previa_sha256 text check (previa_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,registro_id) references public.inspecoes_registros(organization_id,id),
  foreign key (organization_id,cliente_id,unidade_id,registro_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  check ((cliente_id is null) = (unidade_id is null)),
  check (estado <> 'original_verificado' or (caminho is not null and sha256 is not null and bytes is not null and mime is not null)),
  check (caminho is null or caminho like (organization_id::text||'/'||id::text||'/%')),
  check ((miniatura_caminho is null) = (miniatura_sha256 is null)),
  check ((previa_caminho is null) = (previa_sha256 is null)),
  check (miniatura_caminho is null or (miniatura_caminho like (organization_id::text||'/'||id::text||'/%') and miniatura_caminho <> caminho)),
  check (previa_caminho is null or (previa_caminho like (organization_id::text||'/'||id::text||'/%') and previa_caminho <> caminho
    and previa_caminho is distinct from miniatura_caminho))
);
create index inspecoes_arquivos_registro on public.inspecoes_arquivos(organization_id,registro_id,ordem,id);

create function public.inspecoes_arquivo_contexto() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.registro_id is not null and not exists (
    select 1 from public.inspecoes_registros r
    where r.organization_id=new.organization_id and r.id=new.registro_id
      and r.cliente_id is not distinct from new.cliente_id and r.unidade_id is not distinct from new.unidade_id
  ) then
    raise exception 'Contexto incompatível com o registro do arquivo.' using errcode='23503';
  end if;
  if new.estado in ('original_verificado','falha_processamento') and new.caminho is not null
    and not exists (select 1 from storage.objects o where o.bucket_id='inspecoes-acervo'
      and o.name=new.caminho and o.metadata->>'size'=new.bytes::text
      and o.metadata->>'mimetype'=new.mime)
  then
    raise exception 'Original ainda não confirmado no armazenamento.' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger inspecoes_arquivo_contexto before insert or update on public.inspecoes_arquivos
  for each row execute function public.inspecoes_arquivo_contexto();

create function public.inspecoes_historico_imutavel() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'O registro de origem é imutável. Conserve o histórico e crie uma revisão.' using errcode='23514';
end
$$;
create trigger inspecoes_registro_imutavel before update or delete on public.inspecoes_registros
  for each row execute function public.inspecoes_historico_imutavel();
create trigger inspecoes_relacao_imutavel before update or delete on public.inspecoes_relacoes
  for each row execute function public.inspecoes_historico_imutavel();

alter table public.inspecoes_perfis_competencias enable row level security;
alter table public.inspecoes_atribuicoes enable row level security;
alter table public.inspecoes_contextos enable row level security;
alter table public.inspecoes_registros enable row level security;
alter table public.inspecoes_relacoes enable row level security;
alter table public.inspecoes_arquivos enable row level security;
revoke all on public.inspecoes_perfis_competencias,public.inspecoes_atribuicoes,public.inspecoes_contextos,
  public.inspecoes_registros,public.inspecoes_relacoes,public.inspecoes_arquivos from public,anon,authenticated,service_role;
grant select on public.inspecoes_contextos,public.inspecoes_registros,public.inspecoes_relacoes,public.inspecoes_arquivos to authenticated;
grant select,insert on public.inspecoes_arquivos to service_role;
revoke all on function public.inspecoes_atribuicoes_validas(uuid,uuid),public.inspecoes_arquivo_contexto(),
  public.inspecoes_historico_imutavel(),public.inspecoes_acesso(uuid),public.inspecoes_pode(uuid,uuid,uuid,text),
  public.inspecoes_contexto(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_acesso(uuid),public.inspecoes_pode(uuid,uuid,uuid,text),public.inspecoes_contexto(uuid) to authenticated;

create policy inspecoes_contextos_leitura on public.inspecoes_contextos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));
create policy inspecoes_registros_leitura on public.inspecoes_registros for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id)
    and (colecao <> 'registro' or public.inspecoes_pode(organization_id,null,null,'importar')));
create policy inspecoes_relacoes_leitura on public.inspecoes_relacoes for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));
create policy inspecoes_arquivos_leitura on public.inspecoes_arquivos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id)
    and (papel not in ('modelo','piloto') or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'est')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('inspecoes-acervo','inspecoes-acervo',false,52428800,array['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp',
  'video/mp4','video/webm','application/json']);

create policy inspecoes_storage_leitura on storage.objects for select to authenticated using (
  bucket_id='inspecoes-acervo' and exists (
    select 1 from public.inspecoes_arquivos a
    where a.estado in ('original_verificado','falha_processamento')
      and a.sha256 is not null and a.bytes is not null and a.mime is not null
      and name in (a.caminho,a.miniatura_caminho,a.previa_caminho)
  )
);
