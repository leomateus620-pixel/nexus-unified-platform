-- Storage privado: confirmado somente por serviço após leitura/verificação do binário.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nexus-operacional','nexus-operacional',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp']);

create function public.preparar_anexo_operacional(_org uuid,_chave uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.anexos; r jsonb; pid uuid:=nullif(_dados->>'pessoa_id','')::uuid; aid uuid:=nullif(_dados->>'acao_id','')::uuid; qid uuid:=nullif(_dados->>'qualificacao_id','')::uuid; novo uuid:=gen_random_uuid(); begin
  if not public.is_member(_org) or num_nonnulls(pid,aid,qid)<>1 then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if pid is not null and not (public.operacao_pode(_org,'ver_equipe') and (public.operacao_pode(_org,'gerir_equipe') or public.operacao_minha_pessoa(_org,pid))) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if qid is not null and not exists(select 1 from public.pessoa_qualificacoes q where q.organization_id=_org and q.id=qid and q.estado in ('enviada','em_conferencia') and public.operacao_pode(_org,'ver_equipe') and (public.operacao_pode(_org,'gerir_equipe') or public.operacao_minha_pessoa(_org,q.pessoa_id))) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if aid is not null and not public.operacao_ler_acao(_org,aid) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if aid is not null and exists(select 1 from public.acoes_operacionais where organization_id=_org and id=aid and estado in ('concluida','cancelada')) then raise exception 'Ação encerrada não recebe novas evidências.' using errcode='23514'; end if;
  r:=public.operacao_repetir(_org,_chave,'preparar_anexo',_dados); if r is not null then return r; end if;
  insert into public.anexos(id,organization_id,pessoa_id,acao_id,qualificacao_id,nome,mime,tamanho,sha256,caminho)
  values(novo,_org,pid,aid,qid,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/anexos/'||novo::text) returning * into a;
  return public.operacao_concluir(_org,_chave,'preparar_anexo',_dados,to_jsonb(a));
end $$;
create function public.confirmar_anexo_operacional(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.anexos; begin
  select * into a from public.anexos where organization_id=_org and id=_id for update;
  if not found or a.created_by<>_autor or a.sha256<>_sha256 or a.estado='cancelado' then raise exception 'Arquivo indisponível.' using errcode='23514'; end if;
  if not exists(select 1 from public.memberships where organization_id=_org and user_id=_autor) then raise exception 'Acesso revogado.' using errcode='42501'; end if;
  if a.estado='vinculado' then return; end if;
  if a.acao_id is not null and exists(select 1 from public.acoes_operacionais where organization_id=_org and id=a.acao_id and estado in ('concluida','cancelada')) then raise exception 'Ação encerrada não recebe novas evidências.' using errcode='23514'; end if;
  if a.qualificacao_id is not null and exists(select 1 from public.pessoa_qualificacoes where organization_id=_org and id=a.qualificacao_id and estado in ('validada','revogada')) then raise exception 'Qualificação conferida não recebe novas evidências.' using errcode='23514'; end if;
  if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then raise exception 'Armazenamento ainda não confirmado.' using errcode='23514'; end if;
  update public.anexos set estado='vinculado',confirmado_em=coalesce(confirmado_em,now()) where id=_id;
end $$;
revoke all on function public.preparar_anexo_operacional(uuid,uuid,jsonb) from public,anon;
grant execute on function public.preparar_anexo_operacional(uuid,uuid,jsonb) to authenticated;
revoke all on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) to service_role;

create policy nexus_operacional_upload on storage.objects for insert to authenticated with check(
  bucket_id='nexus-operacional' and exists(select 1 from public.anexos a where a.caminho=name and a.estado='pendente' and a.created_by=auth.uid() and public.operacao_ler_anexo(a.organization_id,a.id))
);
create policy nexus_operacional_download on storage.objects for select to authenticated using(
  bucket_id='nexus-operacional' and exists(select 1 from public.anexos a where a.caminho=name and a.estado='vinculado' and public.operacao_ler_anexo(a.organization_id,a.id))
);
-- Sem UPDATE/DELETE para usuários: versões emitidas nunca têm binários sobrescritos.
