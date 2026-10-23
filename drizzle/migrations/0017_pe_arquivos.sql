-- Originais privados de Projetos de Engenharia. Mesmo bucket da fundação; limite inicial 20 MiB.
-- O serviço confirma somente após verificar bytes, tamanho, MIME e SHA-256 no servidor.
create function public.pe_autor_acessa(_org uuid,_projeto uuid,_autor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where organization_id=_org and user_id=_autor)
    and exists(select 1 from public.user_roles where organization_id=_org and user_id=_autor and role in ('admin','engenharia'))
    and exists(select 1 from public.pe_projetos p where p.organization_id=_org and p.id=_projeto and
      (p.visibilidade='organizacao' or p.created_by=_autor or exists(select 1 from public.user_roles r where r.organization_id=_org and r.user_id=_autor and r.role='admin')
      or exists(select 1 from public.pessoas x where x.organization_id=_org and x.id=p.responsavel_id and x.user_id=_autor and x.ativa)));
$$;
create function public.pe_pode_enviar_arquivo(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.pe_arquivos a join public.pe_versoes v on v.organization_id=a.organization_id and v.id=a.versao_id
    join public.pe_projetos p on p.organization_id=a.organization_id and p.id=a.projeto_id
    where a.organization_id=_org and a.id=_id and a.created_by=auth.uid() and a.estado in ('pendente','enviado')
    and v.estado='rascunho' and not p.arquivado and public.pe_ler_projeto(_org,p.id)
    and public.operacao_pode(_org,'gerir_projetos_engenharia'));
$$;

create function public.pe_preparar_arquivo(_org uuid,_versao uuid,_chave uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.pe_versoes; p public.pe_projetos; a public.pe_arquivos; r jsonb; novo uuid:=gen_random_uuid();
  payload jsonb:=jsonb_build_object('versao',_versao,'arquivo',_dados); begin
  if not public.operacao_pode(_org,'gerir_projetos_engenharia') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select * into v from public.pe_versoes where organization_id=_org and id=_versao;
  if not found or not public.pe_ler_projeto(_org,v.projeto_id) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'pe_preparar_arquivo',payload); if r is not null then return r; end if;
  select * into p from public.pe_projetos where organization_id=_org and id=v.projeto_id for update;
  select * into v from public.pe_versoes where organization_id=_org and id=_versao for update;
  if p.arquivado or v.estado<>'rascunho' then raise exception 'Novos arquivos exigem versão em rascunho e projeto ativo.' using errcode='23514'; end if;
  if (_dados->>'tamanho')::bigint not between 1 and 20971520 then raise exception 'Limite inicial de 20 MiB por arquivo.' using errcode='23514'; end if;
  select * into a from public.pe_arquivos where organization_id=_org and versao_id=_versao and sha256=_dados->>'sha256' and estado<>'cancelado' order by created_at limit 1;
  if found then
    if a.tamanho<>(_dados->>'tamanho')::bigint or a.mime<>_dados->>'mime' then raise exception 'Metadados divergentes para o mesmo arquivo.' using errcode='23514'; end if;
    if a.estado<>'vinculado' and a.created_by<>auth.uid() then raise exception 'Este arquivo já está sendo enviado por outra pessoa autorizada.' using errcode='23514'; end if;
  else
    insert into public.pe_arquivos(id,organization_id,projeto_id,versao_id,nome,mime,tamanho,sha256,caminho)
    values(novo,_org,p.id,v.id,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',
      _org::text||'/projetos-engenharia/'||p.id::text||'/'||v.id::text||'/'||novo::text) returning * into a;
    insert into public.pe_eventos(organization_id,projeto_id,versao_id,comando,motivo) values(_org,p.id,v.id,'arquivo_pendente',a.nome);
  end if;
  return public.operacao_concluir(_org,_chave,'pe_preparar_arquivo',payload,to_jsonb(a));
end $$;

create function public.pe_confirmar_arquivo(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.pe_arquivos; p public.pe_projetos; v public.pe_versoes; begin
  select * into a from public.pe_arquivos where organization_id=_org and id=_id;
  if not found or a.created_by<>_autor or a.sha256<>_sha256 or not public.pe_autor_acessa(_org,a.projeto_id,_autor) then raise exception 'Arquivo indisponível.' using errcode='42501'; end if;
  select * into p from public.pe_projetos where organization_id=_org and id=a.projeto_id for update;
  select * into v from public.pe_versoes where organization_id=_org and id=a.versao_id for update;
  select * into a from public.pe_arquivos where organization_id=_org and id=_id for update;
  if a.estado='vinculado' then return; end if;
  if a.estado='cancelado' or p.arquivado or v.estado<>'rascunho' then raise exception 'O destino não aceita novos arquivos.' using errcode='23514'; end if;
  if not public.pe_autor_acessa(_org,a.projeto_id,_autor) then raise exception 'Acesso revogado.' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then
    raise exception 'Armazenamento ainda não confirmado.' using errcode='23514';
  end if;
  update public.pe_arquivos set estado='vinculado',confirmado_em=now() where id=a.id;
  insert into public.pe_eventos(organization_id,projeto_id,versao_id,comando,motivo,autor) values(_org,p.id,v.id,'arquivo_confirmado',a.nome,_autor);
end $$;

create function public.pe_cancelar_arquivo(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.pe_arquivos; p public.pe_projetos; v public.pe_versoes; r jsonb; payload jsonb:=jsonb_build_object('id',_id,'motivo',_motivo); begin
  select * into a from public.pe_arquivos where organization_id=_org and id=_id;
  if not found or not public.pe_ler_projeto(_org,a.projeto_id) or not public.operacao_pode(_org,'gerir_projetos_engenharia') then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'pe_cancelar_arquivo',payload); if r is not null then return r; end if;
  select * into p from public.pe_projetos where organization_id=_org and id=a.projeto_id for update;
  select * into v from public.pe_versoes where organization_id=_org and id=a.versao_id for update;
  select * into a from public.pe_arquivos where organization_id=_org and id=_id for update;
  if p.arquivado or v.estado<>'rascunho' or a.estado not in ('pendente','enviado') then raise exception 'Somente envio pendente em rascunho pode ser cancelado.' using errcode='23514'; end if;
  if length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe o motivo do cancelamento.' using errcode='23514'; end if;
  update public.pe_arquivos set estado='cancelado' where id=_id returning * into a;
  insert into public.pe_eventos(organization_id,projeto_id,versao_id,comando,motivo) values(_org,p.id,v.id,'arquivo_cancelado',_motivo);
  return public.operacao_concluir(_org,_chave,'pe_cancelar_arquivo',payload,to_jsonb(a));
end $$;

create function public.pe_arquivo_guard() returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'Original técnico não pode ser apagado por alteração de cadastro.' using errcode='23514'; end if;
  if old.estado in ('vinculado','cancelado') then raise exception 'Metadados de original confirmado são imutáveis.' using errcode='23514'; end if;
  if (to_jsonb(new)-'estado'-'confirmado_em') is distinct from (to_jsonb(old)-'estado'-'confirmado_em') then raise exception 'Identidade e integridade do arquivo são imutáveis.' using errcode='23514'; end if;
  return new;
end $$;
create trigger pe_arquivo_guard before update or delete on public.pe_arquivos for each row execute function public.pe_arquivo_guard();

create function public.pe_snapshot_arquivos() returns trigger language plpgsql set search_path='' as $$
declare manifesto jsonb; begin
  if new.estado in ('em_revisao','congelada') and new.estado<>old.estado and exists(
    select 1 from public.pe_arquivos where organization_id=new.organization_id and versao_id=new.id and estado in ('pendente','enviado')) then
    raise exception 'Confirme ou cancele os envios pendentes antes da revisão ou congelamento.' using errcode='23514';
  end if;
  if new.estado='congelada' and old.estado<>'congelada' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'mime',mime,'tamanho',tamanho,'sha256',sha256) order by id),'[]'::jsonb) into manifesto
      from public.pe_arquivos where organization_id=new.organization_id and versao_id=new.id and estado='vinculado';
    new.snapshot:=jsonb_set(new.snapshot,'{arquivos}',manifesto);
    new.snapshot_sha256:=encode(sha256(convert_to(new.snapshot::text,'UTF8')),'hex');
  end if;
  return new;
end $$;
create trigger pe_snapshot_arquivos before update on public.pe_versoes for each row execute function public.pe_snapshot_arquivos();

create policy nexus_pe_upload on storage.objects for insert to authenticated with check(
  bucket_id='nexus-operacional' and exists(select 1 from public.pe_arquivos a where a.caminho=name and public.pe_pode_enviar_arquivo(a.organization_id,a.id))
);
create policy nexus_pe_download on storage.objects for select to authenticated using(
  bucket_id='nexus-operacional' and exists(select 1 from public.pe_arquivos a where a.caminho=name and a.estado='vinculado' and public.pe_ler_arquivo(a.organization_id,a.id))
);

revoke all on function public.pe_autor_acessa(uuid,uuid,uuid),public.pe_arquivo_guard(),public.pe_snapshot_arquivos() from public,anon,authenticated;
revoke all on function public.pe_preparar_arquivo(uuid,uuid,uuid,jsonb),public.pe_cancelar_arquivo(uuid,uuid,uuid,text),public.pe_pode_enviar_arquivo(uuid,uuid) from public,anon;
grant execute on function public.pe_preparar_arquivo(uuid,uuid,uuid,jsonb),public.pe_cancelar_arquivo(uuid,uuid,uuid,text),public.pe_pode_enviar_arquivo(uuid,uuid) to authenticated;
revoke all on function public.pe_confirmar_arquivo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pe_confirmar_arquivo(uuid,uuid,uuid,text) to service_role;
