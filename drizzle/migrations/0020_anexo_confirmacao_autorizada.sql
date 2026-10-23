-- Correção append-only da confirmação privilegiada de anexos operacionais.
-- A autorização anterior no handler não cobre revogação/reatribuição durante o upload.
-- A matriz continua única: sessões e confirmação por serviço usam o mesmo predicado.
create function public.operacao_autor_pode(_org uuid,_autor uuid,_acao text) returns boolean
language sql stable security definer set search_path='' as $$
  select _autor is not null and exists (
    select 1 from public.memberships m where m.organization_id=_org and m.user_id=_autor
  ) and _acao in ('ver_equipe','gerir_equipe','ver_operacao','gerir_operacao','revisar_operacao','gerir_documentos','ver_projetos_engenharia','gerir_projetos_engenharia') and (
    exists (select 1 from public.user_roles r where r.organization_id=_org and r.user_id=_autor and (
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
      select 1 from public.user_capacidades c where c.organization_id=_org and c.user_id=_autor and c.capacidade='coordenar_operacao'))
  );
$$;
create or replace function public.operacao_pode(_org uuid,_acao text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_autor_pode(_org,auth.uid(),_acao);
$$;
create function public.operacao_autor_ler_anexo(_org uuid,_id uuid,_autor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.estado<>'cancelado' and (
    (a.pessoa_id is not null and public.operacao_autor_pode(_org,_autor,'ver_equipe') and (
      public.operacao_autor_pode(_org,_autor,'gerir_equipe') or exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=a.pessoa_id and p.user_id=_autor and p.ativa))) or
    (a.qualificacao_id is not null and public.operacao_autor_pode(_org,_autor,'ver_equipe') and exists(
      select 1 from public.pessoa_qualificacoes q where q.organization_id=_org and q.id=a.qualificacao_id and (
        public.operacao_autor_pode(_org,_autor,'gerir_equipe') or exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=q.pessoa_id and p.user_id=_autor and p.ativa)))) or
    (a.acao_id is not null and public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(
      select 1 from public.acoes_operacionais x where x.organization_id=_org and x.id=a.acao_id and (
        public.operacao_autor_pode(_org,_autor,'gerir_operacao') or exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=x.responsavel_id and p.user_id=_autor and p.ativa) or exists(
          select 1 from public.acao_colaboradores c join public.pessoas p on p.organization_id=c.organization_id and p.id=c.pessoa_id
          where c.organization_id=_org and c.acao_id=x.id and p.user_id=_autor and p.ativa))))
  ));
$$;
create or replace function public.operacao_ler_anexo(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_autor_ler_anexo(_org,_id,auth.uid());
$$;
-- Predicados de autor explícito são internos, sem RPC de descoberta de autorização alheia.
revoke all on function public.operacao_autor_pode(uuid,uuid,text),public.operacao_autor_ler_anexo(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.confirmar_anexo_operacional(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.anexos; estado_pai text; begin
  -- Mesma trava da administração: desligamento e troca de papéis não atravessam a confirmação.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
  -- Bloqueios de linha também cobrem revogações diretas autorizadas nas tabelas históricas.
  perform 1 from public.user_roles where organization_id=_org and user_id=_autor order by role for share;
  perform 1 from public.user_capacidades where organization_id=_org and user_id=_autor order by capacidade for share;
  perform 1 from public.pessoas where organization_id=_org and user_id=_autor order by id for share;
  select * into a from public.anexos where organization_id=_org and id=_id for update;
  if not found or a.created_by is distinct from _autor or a.sha256 is distinct from _sha256 or a.estado='cancelado' then
    raise exception 'Arquivo indisponível.' using errcode='23514';
  end if;
  -- Estado e atribuição do pai ficam estáveis até o commit, inclusive após esperar outra sessão.
  if a.pessoa_id is not null then
    perform 1 from public.pessoas where organization_id=_org and id=a.pessoa_id for share;
  elsif a.qualificacao_id is not null then
    select estado into estado_pai from public.pessoa_qualificacoes where organization_id=_org and id=a.qualificacao_id for share;
  elsif a.acao_id is not null then
    select estado into estado_pai from public.acoes_operacionais where organization_id=_org and id=a.acao_id for share;
    perform 1 from public.acao_colaboradores where organization_id=_org and acao_id=a.acao_id order by pessoa_id for share;
  end if;
  perform 1 from public.memberships where organization_id=_org and user_id=_autor for share;
  if not found or not public.operacao_autor_ler_anexo(_org,_id,_autor) then
    raise exception 'Acesso revogado.' using errcode='42501';
  end if;
  -- Retry não amplia acesso: só retorna após conferir o escopo atual do autor.
  if a.estado='vinculado' then return; end if;
  if a.acao_id is not null and estado_pai in ('concluida','cancelada') then
    raise exception 'Ação encerrada não recebe novas evidências.' using errcode='23514';
  end if;
  if a.qualificacao_id is not null and estado_pai in ('validada','revogada') then
    raise exception 'Qualificação conferida não recebe novas evidências.' using errcode='23514';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then
    raise exception 'Armazenamento ainda não confirmado.' using errcode='23514';
  end if;
  update public.anexos set estado='vinculado',confirmado_em=coalesce(confirmado_em,now()) where id=_id;
end $$;
revoke all on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) to service_role;

-- O mesmo contrato vale para originais de engenharia, inclusive retry já vinculado.
create or replace function public.pe_confirmar_arquivo(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.pe_arquivos; p public.pe_projetos; v public.pe_versoes; begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
  perform 1 from public.user_roles where organization_id=_org and user_id=_autor order by role for share;
  perform 1 from public.pessoas where organization_id=_org and user_id=_autor order by id for share;
  perform 1 from public.memberships where organization_id=_org and user_id=_autor for share;
  select * into a from public.pe_arquivos where organization_id=_org and id=_id;
  if not found or a.created_by is distinct from _autor or a.sha256 is distinct from _sha256 or not public.pe_autor_acessa(_org,a.projeto_id,_autor) then
    raise exception 'Arquivo indisponível.' using errcode='42501';
  end if;
  select * into p from public.pe_projetos where organization_id=_org and id=a.projeto_id for update;
  select * into v from public.pe_versoes where organization_id=_org and id=a.versao_id for update;
  select * into a from public.pe_arquivos where organization_id=_org and id=_id for update;
  if not public.pe_autor_acessa(_org,a.projeto_id,_autor) then raise exception 'Acesso revogado.' using errcode='42501'; end if;
  if a.estado='vinculado' then return; end if;
  if a.estado='cancelado' or p.arquivado or v.estado<>'rascunho' then raise exception 'O destino não aceita novos arquivos.' using errcode='23514'; end if;
  if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then
    raise exception 'Armazenamento ainda não confirmado.' using errcode='23514';
  end if;
  update public.pe_arquivos set estado='vinculado',confirmado_em=now() where id=a.id;
  insert into public.pe_eventos(organization_id,projeto_id,versao_id,comando,motivo,autor) values(_org,p.id,v.id,'arquivo_confirmado',a.nome,_autor);
end $$;
revoke all on function public.pe_confirmar_arquivo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pe_confirmar_arquivo(uuid,uuid,uuid,text) to service_role;
