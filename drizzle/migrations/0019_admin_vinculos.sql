-- Administração de vínculo existente; não cria conta Auth nem simula convite por e-mail.
create function public.proteger_ultimo_administrador() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid:=old.organization_id; usuario uuid:=old.user_id; proteger boolean; begin
  if tg_op='UPDATE' and tg_table_name='memberships' then
    if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
      raise exception 'Identidade do vínculo é imutável; desligue e crie vínculo autorizado.' using errcode='23514';
    end if;
    return new;
  end if;
  proteger:=case when tg_table_name='memberships' then true else to_jsonb(old)->>'role'='admin' end;
  if tg_op='UPDATE' and tg_table_name='user_roles' then proteger:=proteger and (new.role<>'admin' or new.organization_id<>org or new.user_id<>usuario); end if;
  if proteger and exists(select 1 from public.user_roles r join public.memberships m using(organization_id,user_id) where r.organization_id=org and r.user_id=usuario and r.role='admin') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||org::text,0));
    if not exists(select 1 from public.user_roles r join public.memberships m using(organization_id,user_id) where r.organization_id=org and r.role='admin' and r.user_id<>usuario) then
      raise exception 'A organização precisa manter ao menos um administrador ativo.' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger proteger_ultimo_admin_papel before update or delete on public.user_roles for each row execute function public.proteger_ultimo_administrador();
create trigger proteger_ultimo_admin_membro before update or delete on public.memberships for each row execute function public.proteger_ultimo_administrador();
revoke all on function public.proteger_ultimo_administrador() from public,anon,authenticated;

create function public.administrar_vinculo_operacional(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare usuario uuid:=(_dados->>'user_id')::uuid; pessoa uuid:=nullif(_dados->>'pessoa_id','')::uuid; papel public.app_role; resultado jsonb; payload jsonb:=jsonb_build_object('comando',_comando,'dados',_dados); begin
  if not public.has_org_role(_org,'admin') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
  if not public.has_org_role(_org,'admin') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  resultado:=public.operacao_repetir(_org,_chave,'administrar_vinculo',payload); if resultado is not null then return resultado; end if;
  if _comando='vincular' then
    if not exists(select 1 from auth.users where id=usuario) then raise exception 'Conta existente não localizada. Confira o identificador com o titular.' using errcode='23514'; end if;
    if length(trim(coalesce(_dados->>'nome','')))<2 then raise exception 'Informe o nome do membro.' using errcode='23514'; end if;
    insert into public.memberships(organization_id,user_id,nome) values(_org,usuario,trim(_dados->>'nome')) on conflict(organization_id,user_id) do nothing;
  elsif not exists(select 1 from public.memberships where organization_id=_org and user_id=usuario) then raise exception 'Membro indisponível.' using errcode='42501'; end if;
  if _comando in ('vincular','papel') then
    papel:=(_dados->>'role')::public.app_role;
    if coalesce((_dados->>'habilitar')::boolean,true) then
      insert into public.user_roles(organization_id,user_id,role) values(_org,usuario,papel) on conflict(organization_id,user_id,role) do nothing;
    else delete from public.user_roles where organization_id=_org and user_id=usuario and role=papel; end if;
    if pessoa is not null then
      if not exists(select 1 from public.pessoas where organization_id=_org and id=pessoa and ativa and (user_id is null or user_id=usuario)) then raise exception 'Pessoa indisponível para este vínculo.' using errcode='23514'; end if;
      update public.pessoas set user_id=usuario where organization_id=_org and id=pessoa and user_id is distinct from usuario;
    end if;
  elsif _comando='coordenacao' then
    if (_dados->>'habilitar')::boolean then insert into public.user_capacidades(organization_id,user_id,capacidade) values(_org,usuario,'coordenar_operacao') on conflict do nothing;
    else delete from public.user_capacidades where organization_id=_org and user_id=usuario and capacidade='coordenar_operacao'; end if;
  elsif _comando='desligar' then
    if length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Informe o motivo do desligamento.' using errcode='23514'; end if;
    delete from public.user_roles where organization_id=_org and user_id=usuario;
    update public.pessoas set user_id=null where organization_id=_org and user_id=usuario;
    delete from public.memberships where organization_id=_org and user_id=usuario;
  else raise exception 'Comando não permitido.' using errcode='23514'; end if;
  insert into public.auditoria(organization_id,entidade,entidade_id,acao,dados,motivo)
    values(_org,'vinculo_usuario',usuario,_comando,_dados,_dados->>'motivo');
  return public.operacao_concluir(_org,_chave,'administrar_vinculo',payload,jsonb_build_object('user_id',usuario,'comando',_comando));
end $$;
revoke all on function public.administrar_vinculo_operacional(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.administrar_vinculo_operacional(uuid,uuid,text,jsonb) to authenticated;
