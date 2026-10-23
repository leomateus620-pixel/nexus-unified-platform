-- Continuidade dos cadastros canônicos. Depende da fundação operacional 0012.
-- Compatibilidade: inserts legados continuam sujeitos a RLS e aos novos guards.
-- Edição/exclusão pelo browser são revogadas; correções e arquivo usam RPC com versão.
alter table public.clientes
  add column nome_exibicao text,
  add column observacoes text,
  add column identificador_normalizado text generated always as (nullif(upper(regexp_replace(coalesce(cnpj,''),'[^A-Za-z0-9]','','g')),'')) stored,
  add column version integer not null default 1 check(version>0),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now(),
  add column arquivado_em timestamptz,
  add column motivo_arquivo text,
  add constraint clientes_org_id_operacional unique(organization_id,id);
alter table public.unidades
  add column observacoes text,
  add column version integer not null default 1 check(version>0),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now(),
  add column arquivado_em timestamptz,
  add column motivo_arquivo text,
  add constraint unidades_org_id_operacional unique(organization_id,id),
  add constraint unidades_org_cliente_id_operacional unique(organization_id,cliente_id,id),
  add constraint unidades_cliente_tenant_operacional foreign key(organization_id,cliente_id) references public.clientes(organization_id,id);
alter table public.contatos
  add column cargo text,
  add column unidade_id uuid,
  add column observacoes text,
  add column version integer not null default 1 check(version>0),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now(),
  add column arquivado_em timestamptz,
  add column motivo_arquivo text,
  add constraint contatos_org_id_operacional unique(organization_id,id),
  add constraint contatos_cliente_tenant_operacional foreign key(organization_id,cliente_id) references public.clientes(organization_id,id),
  add constraint contatos_unidade_cliente_operacional foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id);

comment on column public.clientes.identificador_normalizado is 'Chave alfanumérica para detecção de duplicidade por organização; preserva o identificador original em cnpj. Não representa validação fiscal.';
comment on column public.unidades.distancia_ida_volta_km is 'Distância de referência estimada, em km de ida e volta; não é quilometragem realizada.';
comment on column public.clientes.created_by is 'Autoria de inserções posteriores a 0013; NULL significa autoria histórica não conhecida, sem backfill fictício.';

create index clientes_lista_operacional on public.clientes(organization_id,situacao,razao_social,id);
create index clientes_identificador_operacional on public.clientes(organization_id,identificador_normalizado) where identificador_normalizado is not null;
create index unidades_lista_operacional on public.unidades(organization_id,cliente_id,arquivado_em,nome,id);
create index contatos_lista_operacional on public.contatos(organization_id,cliente_id,arquivado_em,nome,id);
create index contatos_unidade_operacional on public.contatos(organization_id,unidade_id) where unidade_id is not null;

create table public.cliente_historico (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  cliente_id uuid not null, unidade_id uuid, contato_id uuid,
  operacao text not null check(operacao in ('criado','alterado','arquivado','reativado')),
  versao integer not null, motivo text, antes jsonb, depois jsonb not null,
  autor uuid references auth.users(id), created_at timestamptz not null default now(),
  check(num_nonnulls(unidade_id,contato_id)<=1),
  foreign key(organization_id,cliente_id) references public.clientes(organization_id,id),
  foreign key(organization_id,unidade_id) references public.unidades(organization_id,id),
  foreign key(organization_id,contato_id) references public.contatos(organization_id,id)
);
create index cliente_historico_lista on public.cliente_historico(organization_id,cliente_id,id desc);
alter table public.cliente_historico enable row level security;
revoke all on public.cliente_historico from public,anon,authenticated;
grant select on public.cliente_historico to authenticated;
create policy ler_cliente_historico on public.cliente_historico for select to authenticated
  using(public.is_member(organization_id) and public.pode(organization_id,'editar_cadastro'));

create function public.cliente_cadastro_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare normalizado text; parent_id uuid; begin
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.id<>old.id or new.created_at<>old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Identidade, organização e autoria são imutáveis.' using errcode='23514';
    end if;
    if tg_table_name<>'clientes' then
      if new.cliente_id<>old.cliente_id then
        raise exception 'O vínculo ao cliente é imutável. Cadastre a transferência em fluxo próprio.' using errcode='23514';
      end if;
    end if;
    new.version:=old.version+1;
  else
    new.version:=1; new.created_by:=auth.uid(); new.created_at:=now();
  end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
  if tg_table_name='clientes' then
    new.razao_social:=trim(new.razao_social);
    if length(new.razao_social) not between 2 and 200 then raise exception 'Razão social deve ter de 2 a 200 caracteres.' using errcode='23514'; end if;
    if length(coalesce(new.nome_exibicao,''))>200 or length(coalesce(new.cidade,''))>100 or length(coalesce(new.observacoes,''))>4000 then raise exception 'Campo do cliente excede o tamanho permitido.' using errcode='23514'; end if;
    if coalesce(new.uf,'') !~ '^([A-Z]{2})?$' then raise exception 'UF deve conter duas letras.' using errcode='23514'; end if;
    if length(coalesce(new.cnpj,''))>32 or coalesce(new.cnpj,'') !~ '^[A-Za-z0-9 ./-]*$' then raise exception 'Identificador fiscal deve conter letras, números ou pontuação de formato.' using errcode='23514'; end if;
    normalizado:=nullif(upper(regexp_replace(coalesce(new.cnpj,''),'[^A-Za-z0-9]','','g')),'');
    -- Registros históricos duplicados não são fundidos ou renomeados silenciosamente.
    -- O lock impede duas criações/alterações concorrentes da mesma identidade.
    if normalizado is not null and (tg_op='INSERT' or normalizado is distinct from old.identificador_normalizado or (new.situacao='Ativo' and old.situacao<>'Ativo')) then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.organization_id::text||':cliente:'||normalizado,0));
      if exists(select 1 from public.clientes c where c.organization_id=new.organization_id and c.identificador_normalizado=normalizado and c.id<>new.id) then
        raise exception 'Identificador fiscal já cadastrado nesta organização. Localize o cadastro existente antes de continuar.' using errcode='23505';
      end if;
    end if;
  else
    new.nome:=trim(new.nome);
    if length(new.nome) not between 2 and 200 or length(coalesce(new.observacoes,''))>4000 then raise exception 'Confira o nome e as observações do cadastro.' using errcode='23514'; end if;
    if tg_table_name='unidades' then
      if length(coalesce(new.endereco,''))>500 or new.distancia_ida_volta_km<0 or new.distancia_ida_volta_km>99999999 then raise exception 'Confira endereço e distância de referência.' using errcode='23514'; end if;
    else
      if length(coalesce(new.cargo,''))>150 or length(coalesce(new.telefone,''))>40 or length(coalesce(new.email,''))>254 then raise exception 'Campo do contato excede o tamanho permitido.' using errcode='23514'; end if;
      if nullif(trim(new.email),'') is not null and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'E-mail inválido.' using errcode='23514'; end if;
    end if;
    if tg_op='INSERT' or (new.arquivado_em is null and old.arquivado_em is not null) then
      select id into parent_id from public.clientes where organization_id=new.organization_id and id=new.cliente_id and situacao='Ativo' for share;
      if parent_id is null then raise exception 'Cliente indisponível para novos vínculos. Reative-o antes de continuar.' using errcode='23514'; end if;
    end if;
    if tg_table_name='contatos' then
      if new.unidade_id is not null and (tg_op='INSERT' or new.unidade_id is distinct from old.unidade_id) then
        if not exists(select 1 from public.unidades where organization_id=new.organization_id and cliente_id=new.cliente_id and id=new.unidade_id and arquivado_em is null) then
          raise exception 'Unidade indisponível para o contato deste cliente.' using errcode='23514';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create function public.cliente_cadastro_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare acao text:='alterado'; old_data jsonb; begin
  if tg_op='INSERT' then acao:='criado';
  else
    old_data:=to_jsonb(old);
    if tg_table_name='clientes' then
      if new.situacao='Arquivado' and old.situacao<>'Arquivado' then acao:='arquivado';
      elsif new.situacao='Ativo' and old.situacao<>'Ativo' then acao:='reativado'; end if;
    else
      if new.arquivado_em is not null and old.arquivado_em is null then acao:='arquivado';
      elsif new.arquivado_em is null and old.arquivado_em is not null then acao:='reativado'; end if;
    end if;
  end if;
  insert into public.cliente_historico(organization_id,cliente_id,unidade_id,contato_id,operacao,versao,motivo,antes,depois,autor)
  values(new.organization_id,case when tg_table_name='clientes' then new.id else (to_jsonb(new)->>'cliente_id')::uuid end,
    case when tg_table_name='unidades' then new.id end,case when tg_table_name='contatos' then new.id end,
    acao,new.version,new.motivo_arquivo,old_data,to_jsonb(new),auth.uid());
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['clientes','unidades','contatos'] loop
    execute format('create trigger cliente_cadastro_guard before insert or update on public.%I for each row execute function public.cliente_cadastro_guard()',t);
    execute format('create trigger cliente_cadastro_audit after insert or update on public.%I for each row execute function public.cliente_cadastro_audit()',t);
    execute format('revoke update,delete on public.%I from authenticated',t);
  end loop;
end $$;

create function public.salvar_cliente_operacional(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clientes; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_cliente',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.clientes(organization_id,razao_social,nome_exibicao,cnpj,cidade,uf,observacoes)
    values(_org,trim(_dados->>'razao_social'),nullif(trim(_dados->>'nome_exibicao'),''),nullif(trim(_dados->>'cnpj'),''),nullif(trim(_dados->>'cidade'),''),nullif(upper(trim(_dados->>'uf')),''),nullif(trim(_dados->>'observacoes'),'')) returning * into c;
  else
    select * into c from public.clientes where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if c.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue e compare antes de salvar.' using errcode='40001'; end if;
    update public.clientes set razao_social=trim(_dados->>'razao_social'),nome_exibicao=nullif(trim(_dados->>'nome_exibicao'),''),cnpj=nullif(trim(_dados->>'cnpj'),''),cidade=nullif(trim(_dados->>'cidade'),''),uf=nullif(upper(trim(_dados->>'uf')),''),observacoes=nullif(trim(_dados->>'observacoes'),'') where id=_id returning * into c;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_cliente',payload,to_jsonb(c));
end $$;

create function public.salvar_unidade_operacional(_org uuid,_chave uuid,_cliente uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.unidades; r jsonb; payload jsonb:=jsonb_build_object('cliente',_cliente,'dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if not exists(select 1 from public.clientes where organization_id=_org and id=_cliente) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_unidade',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.unidades(organization_id,cliente_id,nome,endereco,distancia_ida_volta_km,observacoes)
    values(_org,_cliente,trim(_dados->>'nome'),nullif(trim(_dados->>'endereco'),''),nullif(_dados->>'distancia_ida_volta_km','')::numeric,nullif(trim(_dados->>'observacoes'),'')) returning * into u;
  else
    select * into u from public.unidades where organization_id=_org and cliente_id=_cliente and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if u.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue e compare antes de salvar.' using errcode='40001'; end if;
    update public.unidades set nome=trim(_dados->>'nome'),endereco=nullif(trim(_dados->>'endereco'),''),distancia_ida_volta_km=nullif(_dados->>'distancia_ida_volta_km','')::numeric,observacoes=nullif(trim(_dados->>'observacoes'),'') where id=_id returning * into u;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_unidade',payload,to_jsonb(u));
end $$;

create function public.salvar_contato_operacional(_org uuid,_chave uuid,_cliente uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contatos; r jsonb; payload jsonb:=jsonb_build_object('cliente',_cliente,'dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if not exists(select 1 from public.clientes where organization_id=_org and id=_cliente) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_contato',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.contatos(organization_id,cliente_id,nome,cargo,email,telefone,unidade_id,observacoes)
    values(_org,_cliente,trim(_dados->>'nome'),nullif(trim(_dados->>'cargo'),''),nullif(trim(_dados->>'email'),''),nullif(trim(_dados->>'telefone'),''),nullif(_dados->>'unidade_id','')::uuid,nullif(trim(_dados->>'observacoes'),'')) returning * into c;
  else
    select * into c from public.contatos where organization_id=_org and cliente_id=_cliente and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if c.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue e compare antes de salvar.' using errcode='40001'; end if;
    update public.contatos set nome=trim(_dados->>'nome'),cargo=nullif(trim(_dados->>'cargo'),''),email=nullif(trim(_dados->>'email'),''),telefone=nullif(trim(_dados->>'telefone'),''),unidade_id=nullif(_dados->>'unidade_id','')::uuid,observacoes=nullif(trim(_dados->>'observacoes'),'') where id=_id returning * into c;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_contato',payload,to_jsonb(c));
end $$;

create function public.arquivar_cadastro_cliente(_org uuid,_chave uuid,_entidade text,_id uuid,_expected_version integer,_arquivar boolean,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; v integer; payload jsonb:=jsonb_build_object('entidade',_entidade,'id',_id,'version',_expected_version,'arquivar',_arquivar,'motivo',_motivo); begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if _entidade is null or _entidade not in ('clientes','unidades','contatos') or _id is null or _arquivar is null or length(trim(coalesce(_motivo,''))) not between 3 and 1000 then raise exception 'Informe o cadastro, a operação e um motivo de 3 a 1000 caracteres.' using errcode='23514'; end if;
  r:=public.operacao_repetir(_org,_chave,'arquivar_cadastro_cliente',payload); if r is not null then return r; end if;
  -- Tipo é uma escolha fechada de comando, nunca um nome de tabela recebido livremente.
  if _entidade='clientes' then
    select version into v from public.clientes where organization_id=_org and id=_id for update;
  elsif _entidade='unidades' then
    select version into v from public.unidades where organization_id=_org and id=_id for update;
  else
    select version into v from public.contatos where organization_id=_org and id=_id for update;
  end if;
  if v is null then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if v is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue e compare antes de salvar.' using errcode='40001'; end if;
  if _entidade='clientes' then
    update public.clientes set situacao=case when _arquivar then 'Arquivado' else 'Ativo' end,arquivado_em=case when _arquivar then now() end,motivo_arquivo=trim(_motivo) where id=_id returning to_jsonb(clientes.*) into r;
  elsif _entidade='unidades' then
    update public.unidades set arquivado_em=case when _arquivar then now() end,motivo_arquivo=trim(_motivo) where id=_id returning to_jsonb(unidades.*) into r;
  else
    update public.contatos set arquivado_em=case when _arquivar then now() end,motivo_arquivo=trim(_motivo) where id=_id returning to_jsonb(contatos.*) into r;
  end if;
  return public.operacao_concluir(_org,_chave,'arquivar_cadastro_cliente',payload,r);
end $$;

-- Busca literal, paginação no servidor e contagem sobre o mesmo recorte autorizado.
create function public.listar_cadastros_cliente(_org uuid,_grupo text default 'clientes',_cliente uuid default null,_busca text default '',_situacao text default 'ativos',_pagina integer default 0,_limite integer default 25) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb; begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if _grupo is null or _grupo not in ('clientes','unidades','contatos','historico') or _situacao is null or _situacao not in ('ativos','arquivados','todos') or _pagina is null or _pagina not between 0 and 100000 or _limite is null or _limite not between 1 and 50 or _busca is null or length(_busca)>120 then raise exception 'Consulta inválida.' using errcode='22023'; end if;
  if _grupo<>'clientes' and not exists(select 1 from public.clientes where organization_id=_org and id=_cliente) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if _grupo='clientes' then
    with filtrados as materialized (
      select c.* from public.clientes c where c.organization_id=_org
      and (_situacao='todos' or (_situacao='ativos' and c.situacao='Ativo') or (_situacao='arquivados' and c.situacao<>'Ativo'))
      and (trim(_busca)='' or position(lower(trim(_busca)) in lower(concat_ws(' ',c.razao_social,c.nome_exibicao,c.cnpj,c.identificador_normalizado,c.cidade)))>0)
    ), pagina as (select * from filtrados order by razao_social,id limit _limite offset (_pagina*_limite))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.razao_social,p.id) from pagina p),'[]'::jsonb),'total',(select count(*) from filtrados)) into resultado;
  elsif _grupo='unidades' then
    with filtrados as materialized (
      select u.* from public.unidades u where u.organization_id=_org and u.cliente_id=_cliente
      and (_situacao='todos' or (_situacao='ativos' and u.arquivado_em is null) or (_situacao='arquivados' and u.arquivado_em is not null))
      and (trim(_busca)='' or position(lower(trim(_busca)) in lower(concat_ws(' ',u.nome,u.endereco)))>0)
    ), pagina as (select * from filtrados order by nome,id limit _limite offset (_pagina*_limite))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.nome,p.id) from pagina p),'[]'::jsonb),'total',(select count(*) from filtrados)) into resultado;
  elsif _grupo='contatos' then
    with filtrados as materialized (
      select c.*,u.nome as unidade_nome from public.contatos c left join public.unidades u on u.organization_id=c.organization_id and u.cliente_id=c.cliente_id and u.id=c.unidade_id
      where c.organization_id=_org and c.cliente_id=_cliente
      and (_situacao='todos' or (_situacao='ativos' and c.arquivado_em is null) or (_situacao='arquivados' and c.arquivado_em is not null))
      and (trim(_busca)='' or position(lower(trim(_busca)) in lower(concat_ws(' ',c.nome,c.cargo,c.email,c.telefone,u.nome)))>0)
    ), pagina as (select * from filtrados order by nome,id limit _limite offset (_pagina*_limite))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.nome,p.id) from pagina p),'[]'::jsonb),'total',(select count(*) from filtrados)) into resultado;
  else
    with filtrados as materialized (select h.* from public.cliente_historico h where h.organization_id=_org and h.cliente_id=_cliente),
    pagina as (select * from filtrados order by id desc limit _limite offset (_pagina*_limite))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.id desc) from pagina p),'[]'::jsonb),'total',(select count(*) from filtrados)) into resultado;
  end if;
  return resultado||jsonb_build_object('page',_pagina,'pageSize',_limite);
end $$;

create function public.obter_cliente_operacional(_org uuid,_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select to_jsonb(c.*) into r from public.clientes c where organization_id=_org and id=_id;
  if r is null then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  return r;
end $$;

create function public.obter_cadastro_cliente(_org uuid,_entidade text,_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
  if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if _entidade='clientes' then
    select to_jsonb(c.*) into r from public.clientes c where organization_id=_org and id=_id;
  elsif _entidade='unidades' then
    select to_jsonb(u.*) into r from public.unidades u where organization_id=_org and id=_id;
  elsif _entidade='contatos' then
    select to_jsonb(c.*) into r from public.contatos c where organization_id=_org and id=_id;
  else raise exception 'Consulta inválida.' using errcode='22023'; end if;
  if r is null then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  return r;
end $$;

-- Uma referência histórica pode continuar arquivada. Apenas seleção nova exige cadastro ativo.
create function public.cliente_nova_referencia() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.cliente_id is distinct from old.cliente_id then
    perform 1 from public.clientes where organization_id=new.organization_id and id=new.cliente_id and situacao='Ativo' for share;
    if not found then raise exception 'Cliente arquivado ou indisponível para nova proposta.' using errcode='23514'; end if;
  end if;
  if new.unidade_id is not null and (tg_op='INSERT' or new.unidade_id is distinct from old.unidade_id or new.cliente_id is distinct from old.cliente_id) then
    perform 1 from public.unidades where organization_id=new.organization_id and cliente_id=new.cliente_id and id=new.unidade_id and arquivado_em is null for share;
    if not found then raise exception 'Unidade arquivada ou indisponível para nova proposta.' using errcode='23514'; end if;
  end if;
  if new.contato_id is not null and (tg_op='INSERT' or new.contato_id is distinct from old.contato_id or new.cliente_id is distinct from old.cliente_id) then
    perform 1 from public.contatos where organization_id=new.organization_id and cliente_id=new.cliente_id and id=new.contato_id and arquivado_em is null for share;
    if not found then raise exception 'Contato arquivado ou indisponível para nova proposta.' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger cliente_nova_referencia before insert or update on public.propostas for each row execute function public.cliente_nova_referencia();

revoke all on function public.cliente_cadastro_guard(),public.cliente_cadastro_audit(),public.cliente_nova_referencia() from public,anon,authenticated;
revoke all on function public.salvar_cliente_operacional(uuid,uuid,jsonb,uuid,integer),public.salvar_unidade_operacional(uuid,uuid,uuid,jsonb,uuid,integer),public.salvar_contato_operacional(uuid,uuid,uuid,jsonb,uuid,integer),public.arquivar_cadastro_cliente(uuid,uuid,text,uuid,integer,boolean,text),public.listar_cadastros_cliente(uuid,text,uuid,text,text,integer,integer),public.obter_cliente_operacional(uuid,uuid) from public,anon;
grant execute on function public.salvar_cliente_operacional(uuid,uuid,jsonb,uuid,integer),public.salvar_unidade_operacional(uuid,uuid,uuid,jsonb,uuid,integer),public.salvar_contato_operacional(uuid,uuid,uuid,jsonb,uuid,integer),public.arquivar_cadastro_cliente(uuid,uuid,text,uuid,integer,boolean,text),public.listar_cadastros_cliente(uuid,text,uuid,text,text,integer,integer),public.obter_cliente_operacional(uuid,uuid) to authenticated;
revoke all on function public.obter_cadastro_cliente(uuid,text,uuid) from public,anon;
grant execute on function public.obter_cadastro_cliente(uuid,text,uuid) to authenticated;
