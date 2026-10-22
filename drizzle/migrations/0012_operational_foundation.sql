-- Fundação operacional aditiva. Aplicar após as 30 migrações históricas.
-- Nenhum registro de demonstração; comandos autenticados, FKs por tenant e histórico oficial.
-- Privilégios de manutenção não pertencem a sessões de aplicação, mesmo com RLS.
revoke truncate,references,trigger on all tables in schema public from anon,authenticated;
-- A chave composta de memberships já existe na base histórica; não duplicar seu índice.
-- Desligamento de membership deve revogar também os helpers históricos, mesmo com role órfã.
create or replace function public.has_org_role(_org uuid,_role public.app_role) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_member(_org) and exists(select 1 from public.user_roles where organization_id=_org and user_id=auth.uid() and role=_role);
$$;
create or replace function public.can_see_costs(_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_member(_org) and exists(select 1 from public.user_roles where organization_id=_org and user_id=auth.uid() and role in ('admin','comercial','engenharia','compras','financeiro'));
$$;
create or replace function public.pode(_org uuid,_acao text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_member(_org) and exists(
    select 1 from public.user_roles r where r.organization_id=_org and r.user_id=auth.uid()
    and (r.role='admin' or r.role::text=any(case _acao
      when 'editar_cadastro' then array['comercial','engenharia','compras']
      when 'importar_catalogo' then array['engenharia','compras']
      when 'criar_proposta' then array['comercial','engenharia']
      when 'editar_revisao' then array['comercial','engenharia']
      when 'aprovar_tecnica' then array['engenharia']
      when 'aceitar_comercial' then array['comercial']
      when 'planejar_suprimentos' then array['compras','engenharia']
      when 'emitir_ordem' then array['compras','engenharia']
      when 'receber' then array['compras','engenharia']
      when 'produzir' then array['compras','engenharia','campo']
      when 'ver_custos' then array['comercial','engenharia','compras','financeiro']
      else array[]::text[] end)));
$$;

create table public.user_capacidades (
  organization_id uuid not null,
  user_id uuid not null,
  capacidade text not null check (capacidade in ('coordenar_operacao')),
  concedido_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id,capacidade),
  foreign key (organization_id,user_id) references public.memberships(organization_id,user_id) on delete cascade
);

create function public.operacao_pode(_org uuid,_acao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m where m.organization_id=_org and m.user_id=auth.uid()
  ) and _acao in ('ver_equipe','gerir_equipe','ver_operacao','gerir_operacao','revisar_operacao','gerir_documentos','ver_projetos_engenharia','gerir_projetos_engenharia') and (
    exists (select 1 from public.user_roles r where r.organization_id=_org and r.user_id=auth.uid() and (
      r.role='admin' or r.role::text=any(case _acao
        when 'ver_equipe' then array['engenharia','compras','campo']
        when 'gerir_equipe' then array['engenharia']
        when 'ver_operacao' then array['engenharia','compras','campo']
        when 'gerir_operacao' then array['engenharia']
        when 'revisar_operacao' then array['engenharia']
        when 'gerir_documentos' then array['engenharia']
        when 'ver_projetos_engenharia' then array['engenharia']
        when 'gerir_projetos_engenharia' then array['engenharia']
        else array[]::text[] end)))
    or (_acao in ('ver_equipe','gerir_equipe','ver_operacao','gerir_operacao') and exists (
      select 1 from public.user_capacidades c where c.organization_id=_org and c.user_id=auth.uid() and c.capacidade='coordenar_operacao'))
  );
$$;

create table public.pessoas (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  nome text not null check(length(trim(nome)) between 2 and 200),
  vinculo text not null check(vinculo in ('colaborador','prestador','parceiro')),
  funcao text, email_profissional text, telefone_profissional text,
  user_id uuid, ativa boolean not null default true,
  registro_profissional text,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,user_id),
  foreign key(organization_id,user_id) references public.memberships(organization_id,user_id) on delete restrict
);
create index pessoas_lista on public.pessoas(organization_id,ativa,nome,id);

create table public.equipes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  nome text not null check(length(trim(nome)) between 2 and 120), lider_id uuid,
  ativa boolean not null default true, version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,nome),
  foreign key(organization_id,lider_id) references public.pessoas(organization_id,id)
);
create table public.equipe_membros (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  equipe_id uuid not null, pessoa_id uuid not null, inicio date not null, fim date,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  check(fim is null or fim>=inicio), unique(organization_id,equipe_id,pessoa_id,inicio),
  foreign key(organization_id,equipe_id) references public.equipes(organization_id,id),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create index equipe_membros_pessoa on public.equipe_membros(organization_id,pessoa_id,inicio,fim);

create table public.competencias (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  nome text not null check(length(trim(nome)) between 2 and 160), descricao text,
  exige_evidencia boolean not null default true, exige_validade boolean not null default false,
  version integer not null default 1, ativa boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,nome)
);
create table public.pessoa_qualificacoes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  pessoa_id uuid not null, competencia_id uuid not null, emissor text not null,
  conclusao date not null, validade date, estado text not null default 'enviada'
    check(estado in ('enviada','em_conferencia','validada','revogada')),
  conferido_por uuid references auth.users(id), conferido_em timestamptz, motivo text,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(validade is null or validade>=conclusao), unique(organization_id,id),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
  foreign key(organization_id,competencia_id) references public.competencias(organization_id,id)
);
create index qualificacoes_pessoa on public.pessoa_qualificacoes(organization_id,pessoa_id,estado,validade);

create table public.indisponibilidades (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, pessoa_id uuid not null,
  inicio timestamptz not null, fim timestamptz not null, motivo_operacional text not null,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  check(fim>inicio), foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);

create table public.acoes_operacionais (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  titulo text not null check(length(trim(titulo)) between 3 and 200), descricao text not null default '',
  responsavel_id uuid not null, prazo date, prioridade text not null default 'normal' check(prioridade in ('baixa','normal','alta','critica')),
  estado text not null default 'aberta' check(estado in ('aberta','em_execucao','aguardando_verificacao','concluida','cancelada')),
  exige_verificacao boolean not null default true, conclusao text, verificado_por uuid references auth.users(id),
  motivo text, version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create index acoes_fila on public.acoes_operacionais(organization_id,estado,prazo,id);
create index acoes_responsavel on public.acoes_operacionais(organization_id,responsavel_id,estado);
create table public.acao_colaboradores (
  organization_id uuid not null, acao_id uuid not null, pessoa_id uuid not null,
  primary key(organization_id,acao_id,pessoa_id),
  foreign key(organization_id,acao_id) references public.acoes_operacionais(organization_id,id),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);

create table public.operacao_historico (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
  entidade text not null, entidade_id uuid not null, operacao text not null, versao integer,
  estado_anterior text, estado_atual text, motivo text,
  autor uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create index operacao_historico_pai on public.operacao_historico(organization_id,entidade,entidade_id,id);
create table public.operacoes_idempotentes (
  organization_id uuid not null references public.organizations(id), autor uuid not null references auth.users(id),
  chave uuid not null, comando text not null, request_hash text not null, resultado jsonb not null,
  created_at timestamptz not null default now(), primary key(organization_id,autor,chave)
);

create function public.operacao_minha_pessoa(_org uuid,_pessoa uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.pessoas p join public.memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
    where p.organization_id=_org and p.id=_pessoa and p.user_id=auth.uid() and p.ativa);
$$;
create function public.operacao_ler_acao(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_pode(_org,'ver_operacao') and exists(select 1 from public.acoes_operacionais a where a.organization_id=_org and a.id=_id and (
    public.operacao_pode(_org,'gerir_operacao') or public.operacao_minha_pessoa(_org,a.responsavel_id) or exists(
      select 1 from public.acao_colaboradores c where c.organization_id=_org and c.acao_id=a.id and public.operacao_minha_pessoa(_org,c.pessoa_id))));
$$;

create table public.anexos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  pessoa_id uuid, acao_id uuid, qualificacao_id uuid,
  nome text not null check(length(nome) between 1 and 240), mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),
  tamanho bigint not null check(tamanho between 1 and 20971520), sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
  caminho text not null unique, estado text not null default 'pendente' check(estado in ('pendente','enviado','vinculado','cancelado')),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), confirmado_em timestamptz,
  unique(organization_id,id), check(num_nonnulls(pessoa_id,acao_id,qualificacao_id)=1),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
  foreign key(organization_id,acao_id) references public.acoes_operacionais(organization_id,id),
  foreign key(organization_id,qualificacao_id) references public.pessoa_qualificacoes(organization_id,id)
);
create index anexos_pessoa on public.anexos(organization_id,pessoa_id,estado);
create index anexos_acao on public.anexos(organization_id,acao_id,estado);

create function public.operacao_ler_anexo(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.estado<>'cancelado' and (
    (a.pessoa_id is not null and public.operacao_pode(_org,'ver_equipe') and (public.operacao_pode(_org,'gerir_equipe') or public.operacao_minha_pessoa(_org,a.pessoa_id))) or
    (a.acao_id is not null and public.operacao_ler_acao(_org,a.acao_id)) or
    (a.qualificacao_id is not null and public.operacao_pode(_org,'ver_equipe') and exists(select 1 from public.pessoa_qualificacoes q where q.organization_id=_org and q.id=a.qualificacao_id and (
      public.operacao_pode(_org,'gerir_equipe') or public.operacao_minha_pessoa(_org,q.pessoa_id))))));
$$;

create function public.operacao_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then
      raise exception 'Identidade e autoria são imutáveis.' using errcode='23514';
    end if;
    new.version:=old.version+1; new.updated_at:=now();
  end if;
  return new;
end $$;
create function public.operacao_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_anterior,estado_atual,motivo)
  values(new.organization_id,tg_table_name,new.id,tg_op,new.version,case when tg_op='UPDATE' then to_jsonb(old)->>'estado' end,to_jsonb(new)->>'estado',to_jsonb(new)->>'motivo');
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['pessoas','equipes','competencias','pessoa_qualificacoes','acoes_operacionais'] loop
    execute format('create trigger operacao_guard before update on public.%I for each row execute function public.operacao_guard()',t);
    execute format('create trigger operacao_audit after insert or update on public.%I for each row execute function public.operacao_audit()',t);
  end loop;
  foreach t in array array['user_capacidades','pessoas','equipes','equipe_membros','competencias','pessoa_qualificacoes','indisponibilidades','acoes_operacionais','acao_colaboradores','operacao_historico','operacoes_idempotentes','anexos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy ler on public.user_capacidades for select to authenticated using(public.is_member(organization_id) and (user_id=auth.uid() or public.has_org_role(organization_id,'admin')));
create policy ler on public.pessoas for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe') and (public.operacao_pode(organization_id,'gerir_equipe') or public.operacao_minha_pessoa(organization_id,id)));
create policy ler on public.equipes for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe'));
create policy ler on public.equipe_membros for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe') and (public.operacao_pode(organization_id,'gerir_equipe') or public.operacao_minha_pessoa(organization_id,pessoa_id)));
create policy ler on public.competencias for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe'));
create policy ler on public.pessoa_qualificacoes for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe') and (public.operacao_pode(organization_id,'gerir_equipe') or public.operacao_minha_pessoa(organization_id,pessoa_id)));
create policy ler on public.indisponibilidades for select to authenticated using(public.operacao_pode(organization_id,'ver_equipe') and (public.operacao_pode(organization_id,'gerir_equipe') or public.operacao_minha_pessoa(organization_id,pessoa_id)));
create policy ler on public.acoes_operacionais for select to authenticated using(public.operacao_ler_acao(organization_id,id));
create policy ler on public.acao_colaboradores for select to authenticated using(public.operacao_ler_acao(organization_id,acao_id));
create policy ler on public.anexos for select to authenticated using(public.operacao_ler_anexo(organization_id,id));
create policy ler on public.operacao_historico for select to authenticated using(public.operacao_pode(organization_id,'gerir_operacao') or (entidade='pessoas' and public.operacao_minha_pessoa(organization_id,entidade_id)) or (entidade='acoes_operacionais' and public.operacao_ler_acao(organization_id,entidade_id)));
-- Recibos podem conter snapshot sensível. Só comandos privilegiados os consultam,
-- depois de validar a permissão atual; revogar papel não pode deixar um cache legível.
revoke select on public.operacoes_idempotentes from authenticated;

-- Retorno idempotente protegido por lock até o término da transação do comando.
create function public.operacao_repetir(_org uuid,_chave uuid,_comando text,_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anterior public.operacoes_idempotentes; begin
  if auth.uid() is null or not public.is_member(_org) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_org::text||auth.uid()::text||_chave::text,0));
  select * into anterior from public.operacoes_idempotentes where organization_id=_org and autor=auth.uid() and chave=_chave;
  if found then
    if anterior.comando<>_comando or anterior.request_hash<>md5(_payload::text) then raise exception 'Chave reutilizada com conteúdo diferente.' using errcode='23505'; end if;
    return anterior.resultado;
  end if; return null;
end $$;
create function public.operacao_concluir(_org uuid,_chave uuid,_comando text,_payload jsonb,_resultado jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  insert into public.operacoes_idempotentes(organization_id,autor,chave,comando,request_hash,resultado) values(_org,auth.uid(),_chave,_comando,md5(_payload::text),_resultado);
  return _resultado;
end $$;

create function public.salvar_pessoa(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.pessoas; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_pessoa',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.pessoas(organization_id,nome,vinculo,funcao,email_profissional,telefone_profissional,user_id,registro_profissional)
    values(_org,trim(_dados->>'nome'),_dados->>'vinculo',nullif(trim(_dados->>'funcao'),''),nullif(_dados->>'email_profissional',''),nullif(_dados->>'telefone_profissional',''),nullif(_dados->>'user_id','')::uuid,nullif(_dados->>'registro_profissional','')) returning * into p;
  else
    select * into p from public.pessoas where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if p.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    update public.pessoas set nome=trim(_dados->>'nome'),vinculo=_dados->>'vinculo',funcao=nullif(trim(_dados->>'funcao'),''),email_profissional=nullif(_dados->>'email_profissional',''),telefone_profissional=nullif(_dados->>'telefone_profissional',''),user_id=nullif(_dados->>'user_id','')::uuid,registro_profissional=nullif(_dados->>'registro_profissional',''),ativa=coalesce((_dados->>'ativa')::boolean,true) where id=_id returning * into p;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_pessoa',payload,to_jsonb(p));
end $$;

create function public.salvar_acao_operacional(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.acoes_operacionais; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_acao',payload); if r is not null then return r; end if;
  if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514'; end if;
  if _id is null then
    insert into public.acoes_operacionais(organization_id,titulo,descricao,responsavel_id,prazo,prioridade,exige_verificacao)
    values(_org,trim(_dados->>'titulo'),coalesce(_dados->>'descricao',''),(_dados->>'responsavel_id')::uuid,nullif(_dados->>'prazo','')::date,coalesce(_dados->>'prioridade','normal'),coalesce((_dados->>'exige_verificacao')::boolean,true)) returning * into a;
  else
    select * into a from public.acoes_operacionais where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if a.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if a.estado in ('concluida','cancelada') then raise exception 'Ação encerrada é imutável.' using errcode='23514'; end if;
    update public.acoes_operacionais set titulo=trim(_dados->>'titulo'),descricao=coalesce(_dados->>'descricao',''),responsavel_id=(_dados->>'responsavel_id')::uuid,prazo=nullif(_dados->>'prazo','')::date,prioridade=coalesce(_dados->>'prioridade','normal') where id=_id returning * into a;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_acao',payload,to_jsonb(a));
end $$;

create function public.transicionar_acao_operacional(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.acoes_operacionais; r jsonb; payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo); begin
  if not public.operacao_ler_acao(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'transicionar_acao',payload); if r is not null then return r; end if;
  select * into a from public.acoes_operacionais where organization_id=_org and id=_id for update;
  if a.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  if not (public.operacao_pode(_org,'gerir_operacao') or public.operacao_minha_pessoa(_org,a.responsavel_id)) then raise exception 'Apenas o responsável executa a ação.' using errcode='42501'; end if;
  if not ((a.estado='aberta' and _estado='em_execucao') or (a.estado='em_execucao' and _estado='aguardando_verificacao') or (a.estado='aguardando_verificacao' and _estado in ('em_execucao','concluida')) or (a.estado in ('aberta','em_execucao','aguardando_verificacao') and _estado='cancelada')) then raise exception 'Transição não permitida.' using errcode='23514'; end if;
  if _estado in ('aguardando_verificacao','concluida','cancelada') and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe resultado ou motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  if _estado='aguardando_verificacao' and not exists(select 1 from public.anexos where organization_id=_org and acao_id=_id and estado='vinculado') then raise exception 'Anexe evidência antes de enviar para verificação.' using errcode='23514'; end if;
  if _estado='concluida' and (not public.operacao_pode(_org,'revisar_operacao') or (a.exige_verificacao and public.operacao_minha_pessoa(_org,a.responsavel_id))) then raise exception 'A verificação exige outro responsável autorizado.' using errcode='42501'; end if;
  if _estado='cancelada' and not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Cancelamento exige coordenação.' using errcode='42501'; end if;
  update public.acoes_operacionais set estado=_estado,motivo=_motivo,conclusao=case when _estado='aguardando_verificacao' then _motivo else conclusao end,verificado_por=case when _estado='concluida' then auth.uid() else verificado_por end where id=_id returning * into a;
  return public.operacao_concluir(_org,_chave,'transicionar_acao',payload,to_jsonb(a));
end $$;

create function public.salvar_equipe(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.equipes; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_equipe',payload); if r is not null then return r; end if;
  if nullif(_dados->>'lider_id','') is not null and not exists(
    select 1 from public.pessoas where organization_id=_org and id=(_dados->>'lider_id')::uuid and ativa
  ) then raise exception 'Líder indisponível.' using errcode='23514'; end if;
  if _id is null then
    insert into public.equipes(organization_id,nome,lider_id)
    values(_org,trim(_dados->>'nome'),nullif(_dados->>'lider_id','')::uuid) returning * into e;
  else
    select * into e from public.equipes where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if e.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    update public.equipes set nome=trim(_dados->>'nome'),lider_id=nullif(_dados->>'lider_id','')::uuid,ativa=coalesce((_dados->>'ativa')::boolean,true)
    where id=_id returning * into e;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_equipe',payload,to_jsonb(e));
end $$;

create function public.vincular_membro_equipe(_org uuid,_chave uuid,_equipe uuid,_pessoa uuid,_inicio date,_fim date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.equipe_membros; r jsonb; payload jsonb:=jsonb_build_object('equipe',_equipe,'pessoa',_pessoa,'inicio',_inicio,'fim',_fim); begin
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'vincular_membro_equipe',payload); if r is not null then return r; end if;
  if _inicio is null or (_fim is not null and _fim<_inicio) then raise exception 'Período inválido.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('equipe:'||_org::text||_equipe::text||_pessoa::text,0));
  if not exists(select 1 from public.equipes where organization_id=_org and id=_equipe and ativa)
    or not exists(select 1 from public.pessoas where organization_id=_org and id=_pessoa and ativa)
    then raise exception 'Equipe ou pessoa indisponível.' using errcode='23514'; end if;
  if exists(select 1 from public.equipe_membros where organization_id=_org and equipe_id=_equipe and pessoa_id=_pessoa
    and daterange(inicio,fim,'[]') && daterange(_inicio,_fim,'[]')) then
    raise exception 'A pessoa já pertence à equipe nesse período.' using errcode='23P01';
  end if;
  insert into public.equipe_membros(organization_id,equipe_id,pessoa_id,inicio,fim) values(_org,_equipe,_pessoa,_inicio,_fim) returning * into m;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo)
    values(_org,'equipe_membros',m.id,'INSERT','Vínculo temporal criado');
  return public.operacao_concluir(_org,_chave,'vincular_membro_equipe',payload,to_jsonb(m));
end $$;

create function public.encerrar_membro_equipe(_org uuid,_chave uuid,_id uuid,_fim date,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.equipe_membros; r jsonb; payload jsonb:=jsonb_build_object('id',_id,'fim',_fim,'motivo',_motivo); begin
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'encerrar_membro_equipe',payload); if r is not null then return r; end if;
  select * into m from public.equipe_membros where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if m.fim is not null then raise exception 'Vínculo encerrado. O período histórico é imutável.' using errcode='23514'; end if;
  if _fim is null or _fim<m.inicio or length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe fim válido e motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  update public.equipe_membros set fim=_fim where id=_id returning * into m;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo)
    values(_org,'equipe_membros',m.id,'UPDATE',_motivo);
  return public.operacao_concluir(_org,_chave,'encerrar_membro_equipe',payload,to_jsonb(m));
end $$;

create function public.salvar_competencia(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.competencias; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_competencia',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.competencias(organization_id,nome,descricao,exige_evidencia,exige_validade)
    values(_org,trim(_dados->>'nome'),_dados->>'descricao',coalesce((_dados->>'exige_evidencia')::boolean,true),coalesce((_dados->>'exige_validade')::boolean,false)) returning * into c;
  else
    select * into c from public.competencias where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if c.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if exists(select 1 from public.pessoa_qualificacoes where organization_id=_org and competencia_id=_id)
      and (c.exige_evidencia is distinct from coalesce((_dados->>'exige_evidencia')::boolean,true) or c.exige_validade is distinct from coalesce((_dados->>'exige_validade')::boolean,false)) then
      raise exception 'Política já utilizada. Cadastre nova competência e preserve a anterior.' using errcode='23514';
    end if;
    update public.competencias set nome=trim(_dados->>'nome'),descricao=_dados->>'descricao',exige_evidencia=coalesce((_dados->>'exige_evidencia')::boolean,true),exige_validade=coalesce((_dados->>'exige_validade')::boolean,false),ativa=coalesce((_dados->>'ativa')::boolean,true)
    where id=_id returning * into c;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_competencia',payload,to_jsonb(c));
end $$;

create function public.salvar_qualificacao(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not (public.operacao_pode(_org,'gerir_equipe') or (public.operacao_pode(_org,'ver_equipe') and public.operacao_minha_pessoa(_org,(_dados->>'pessoa_id')::uuid))) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_qualificacao',payload); if r is not null then return r; end if;
  if length(trim(coalesce(_dados->>'emissor','')))<2 then raise exception 'Informe o emissor.' using errcode='23514'; end if;
  if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'pessoa_id')::uuid and ativa)
    or not exists(select 1 from public.competencias where organization_id=_org and id=(_dados->>'competencia_id')::uuid and ativa)
    then raise exception 'Pessoa ou competência indisponível.' using errcode='23514'; end if;
  if _id is null then
    insert into public.pessoa_qualificacoes(organization_id,pessoa_id,competencia_id,emissor,conclusao,validade)
    values(_org,(_dados->>'pessoa_id')::uuid,(_dados->>'competencia_id')::uuid,trim(_dados->>'emissor'),(_dados->>'conclusao')::date,nullif(_dados->>'validade','')::date) returning * into q;
  else
    select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
    if not found or (not public.operacao_pode(_org,'gerir_equipe') and not public.operacao_minha_pessoa(_org,q.pessoa_id)) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if q.estado<>'enviada' then raise exception 'Qualificação em conferência ou concluída é imutável; devolva ou registre nova qualificação.' using errcode='23514'; end if;
    if q.pessoa_id<>(_dados->>'pessoa_id')::uuid or q.competencia_id<>(_dados->>'competencia_id')::uuid then raise exception 'Pessoa e competência de origem são imutáveis.' using errcode='23514'; end if;
    update public.pessoa_qualificacoes set emissor=trim(_dados->>'emissor'),conclusao=(_dados->>'conclusao')::date,validade=nullif(_dados->>'validade','')::date
    where id=_id returning * into q;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_qualificacao',payload,to_jsonb(q));
end $$;

create function public.transicionar_qualificacao(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes; c public.competencias; r jsonb;
  payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo); begin
  if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'transicionar_qualificacao',payload); if r is not null then return r; end if;
  select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  if not ((q.estado='enviada' and _estado='em_conferencia') or (q.estado='em_conferencia' and _estado in ('enviada','validada')) or (q.estado='validada' and _estado='revogada')) then raise exception 'Transição não permitida.' using errcode='23514'; end if;
  if _estado in ('enviada','revogada') and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  if _estado='validada' then
    if public.operacao_minha_pessoa(_org,q.pessoa_id) then raise exception 'Conferência exige outra pessoa autorizada.' using errcode='42501'; end if;
    select * into c from public.competencias where organization_id=_org and id=q.competencia_id;
    if not c.ativa then raise exception 'Competência arquivada.' using errcode='23514'; end if;
    if c.exige_validade and q.validade is null then raise exception 'A política exige data de validade.' using errcode='23514'; end if;
    if c.exige_evidencia and not exists(select 1 from public.anexos where organization_id=_org and qualificacao_id=_id and estado='vinculado') then raise exception 'Anexe evidência conferida antes da validação.' using errcode='23514'; end if;
  end if;
  update public.pessoa_qualificacoes set estado=_estado,motivo=_motivo,
    conferido_por=case when _estado in ('validada','revogada') then auth.uid() else conferido_por end,
    conferido_em=case when _estado in ('validada','revogada') then now() else conferido_em end
    where id=_id returning * into q;
  return public.operacao_concluir(_org,_chave,'transicionar_qualificacao',payload,to_jsonb(q));
end $$;

-- Funções auxiliares são privadas: não oferecem escrita arbitrária por RPC.
revoke all on function public.operacao_repetir(uuid,uuid,text,jsonb),public.operacao_concluir(uuid,uuid,text,jsonb,jsonb),public.operacao_guard(),public.operacao_audit() from public,anon,authenticated;
revoke all on function public.salvar_pessoa(uuid,uuid,jsonb,uuid,integer),public.salvar_acao_operacional(uuid,uuid,jsonb,uuid,integer),public.transicionar_acao_operacional(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.salvar_pessoa(uuid,uuid,jsonb,uuid,integer),public.salvar_acao_operacional(uuid,uuid,jsonb,uuid,integer),public.transicionar_acao_operacional(uuid,uuid,uuid,integer,text,text) to authenticated;
revoke all on function public.operacao_pode(uuid,text),public.operacao_minha_pessoa(uuid,uuid),public.operacao_ler_acao(uuid,uuid),public.operacao_ler_anexo(uuid,uuid) from public,anon;
grant execute on function public.operacao_pode(uuid,text),public.operacao_minha_pessoa(uuid,uuid),public.operacao_ler_acao(uuid,uuid),public.operacao_ler_anexo(uuid,uuid) to authenticated;
revoke all on function public.salvar_equipe(uuid,uuid,jsonb,uuid,integer),public.vincular_membro_equipe(uuid,uuid,uuid,uuid,date,date),public.encerrar_membro_equipe(uuid,uuid,uuid,date,text),public.salvar_competencia(uuid,uuid,jsonb,uuid,integer),public.salvar_qualificacao(uuid,uuid,jsonb,uuid,integer),public.transicionar_qualificacao(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.salvar_equipe(uuid,uuid,jsonb,uuid,integer),public.vincular_membro_equipe(uuid,uuid,uuid,uuid,date,date),public.encerrar_membro_equipe(uuid,uuid,uuid,date,text),public.salvar_competencia(uuid,uuid,jsonb,uuid,integer),public.salvar_qualificacao(uuid,uuid,jsonb,uuid,integer),public.transicionar_qualificacao(uuid,uuid,uuid,integer,text,text) to authenticated;
