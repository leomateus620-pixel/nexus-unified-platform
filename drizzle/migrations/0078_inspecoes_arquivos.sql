-- Acervo privado de Inspeções: alvos explícitos, confirmação binária e histórico de envio.
alter table public.inspecoes_arquivos
  add column contrato_id uuid,
  add column anexo_unidade boolean not null default false,
  drop constraint inspecoes_arquivos_destino,
  drop constraint inspecoes_arquivos_papel_check;

alter table public.inspecoes_arquivos
  add constraint inspecoes_arquivos_destino check (
    num_nonnulls(registro_id,levantamento_id,contrato_id) + anexo_unidade::integer = 1
    and (registro_id is not null or (cliente_id is not null and unidade_id is not null))
  ),
  add constraint inspecoes_arquivos_papel_check check (
    papel in ('original','documento','contrato','foto','certificado','art','projeto',
      'fabricante','modelo','piloto','prancha','ensaio','evidencia')
  ),
  add constraint inspecoes_arquivos_contexto_fk
    foreign key (organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id),
  add constraint inspecoes_arquivos_contrato_fk
    foreign key (organization_id,cliente_id,unidade_id,contrato_id)
    references public.inspecoes_contratos_operacionais(organization_id,cliente_id,unidade_id,id);

create index inspecoes_arquivos_contrato on public.inspecoes_arquivos(organization_id,contrato_id,ordem,id)
  where contrato_id is not null;
create index inspecoes_arquivos_unidade on public.inspecoes_arquivos(organization_id,unidade_id,ordem,id)
  where anexo_unidade;

create table public.inspecoes_arquivo_eventos (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  cliente_id uuid,
  unidade_id uuid,
  registro_id uuid,
  levantamento_id uuid,
  contrato_id uuid,
  anexo_unidade boolean not null,
  arquivo_id uuid not null references public.inspecoes_arquivos(id),
  arquivo_nome text not null,
  autor_id uuid references auth.users(id),
  autor_nome text,
  evento text not null check (evento in (
    'envio_reservado','envio_cancelado','original_verificado','miniaturas_verificadas','falha_miniaturas'
  )),
  ocorrido_em timestamptz not null default clock_timestamp()
);
create index inspecoes_arquivo_eventos_arquivo
  on public.inspecoes_arquivo_eventos(organization_id,arquivo_id,ocorrido_em desc,id desc);
create index inspecoes_arquivo_eventos_registro
  on public.inspecoes_arquivo_eventos(organization_id,registro_id,ocorrido_em desc,id desc) where registro_id is not null;
create index inspecoes_arquivo_eventos_levantamento
  on public.inspecoes_arquivo_eventos(organization_id,levantamento_id,ocorrido_em desc,id desc) where levantamento_id is not null;
create index inspecoes_arquivo_eventos_contrato
  on public.inspecoes_arquivo_eventos(organization_id,contrato_id,ocorrido_em desc,id desc) where contrato_id is not null;
create index inspecoes_arquivo_eventos_unidade
  on public.inspecoes_arquivo_eventos(organization_id,unidade_id,ocorrido_em desc,id desc) where anexo_unidade;
create trigger inspecoes_arquivo_evento_imutavel before update or delete on public.inspecoes_arquivo_eventos
  for each row execute function public.inspecoes_historico_imutavel();

alter table public.inspecoes_arquivo_eventos enable row level security;
revoke all on public.inspecoes_arquivo_eventos from public,anon,authenticated,service_role;
grant select on public.inspecoes_arquivo_eventos to authenticated;
create policy inspecoes_arquivo_eventos_leitura on public.inspecoes_arquivo_eventos
  for select to authenticated using (
    exists(select 1 from public.inspecoes_arquivos a
      where a.organization_id=inspecoes_arquivo_eventos.organization_id and a.id=arquivo_id)
  );

create function public.inspecoes_arquivo_auditar() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_evento text;
  v_autor uuid:=coalesce(auth.uid(),new.created_by);
  v_nome text;
begin
  if tg_op='INSERT' then
    if new.estado='envio_pendente' then v_evento:='envio_reservado';
    elsif new.estado in ('original_verificado','falha_processamento') then v_evento:='original_verificado';
    end if;
  elsif new.estado='envio_cancelado' and old.estado<>'envio_cancelado' then
    v_evento:='envio_cancelado';
  elsif new.estado in ('original_verificado','falha_processamento')
      and old.estado not in ('original_verificado','falha_processamento') then
    v_evento:='original_verificado';
  elsif new.miniatura_caminho is not null and new.previa_caminho is not null
      and (old.miniatura_caminho is null or old.previa_caminho is null) then
    v_evento:='miniaturas_verificadas';
  elsif new.estado='falha_processamento' and old.estado<>'falha_processamento' then
    v_evento:='falha_miniaturas';
  end if;
  if v_evento is not null then
    select nome into v_nome from public.pessoas
      where organization_id=new.organization_id and user_id=v_autor order by ativa desc,id limit 1;
    insert into public.inspecoes_arquivo_eventos(
      organization_id,cliente_id,unidade_id,registro_id,levantamento_id,contrato_id,
      anexo_unidade,arquivo_id,arquivo_nome,autor_id,autor_nome,evento
    ) values (
      new.organization_id,new.cliente_id,new.unidade_id,new.registro_id,new.levantamento_id,new.contrato_id,
      new.anexo_unidade,new.id,new.nome,v_autor,v_nome,v_evento
    );
  end if;
  return new;
end
$$;
create trigger inspecoes_arquivo_auditar after insert or update on public.inspecoes_arquivos
  for each row execute function public.inspecoes_arquivo_auditar();

alter policy inspecoes_arquivos_leitura on public.inspecoes_arquivos using(
  (levantamento_id is not null and public.inspecoes_lev_acesso(organization_id,levantamento_id))
  or (levantamento_id is null and public.inspecoes_pode(organization_id,cliente_id,unidade_id)
    and (papel not in ('modelo','piloto') or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'est')
      or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'gerir_acervo'))
    and (estado not in ('envio_pendente','envio_cancelado') or created_by=auth.uid()
      or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'gerir_acervo'))
    and (registro_id is null or exists(
      select 1 from public.inspecoes_registros r where r.organization_id=inspecoes_arquivos.organization_id
        and r.id=inspecoes_arquivos.registro_id
    )))
);

-- A ordem e a legenda atuais são resolvidas no banco antes da paginação.
create view public.inspecoes_arquivos_apresentados with (security_invoker=true) as
select a.id,a.organization_id,a.cliente_id,a.unidade_id,a.registro_id,a.levantamento_id,a.contrato_id,a.anexo_unidade,
  a.nome,a.papel,a.estado,a.bytes,a.mime,a.sha256,a.caminho,a.created_by,a.created_at,
  a.miniatura_caminho,a.previa_caminho,
  case when p.versao is null then a.legenda else p.legenda end as legenda,
  case when p.versao is null then a.ordem else p.ordem end as ordem,
  coalesce(p.versao,0) as apresentacao_versao
from public.inspecoes_arquivos a left join public.inspecoes_apresentacao_atual p
  on p.organization_id=a.organization_id and p.arquivo_id=a.id;
revoke all on public.inspecoes_arquivos_apresentados from public,anon,authenticated,service_role;
grant select on public.inspecoes_arquivos_apresentados to authenticated;

-- O chamador autenticado sempre deriva a identidade e o contexto dos registros.
create function public.inspecoes_arquivo_reservar_alvo(
  p_org uuid,p_tipo text,p_alvo uuid,p_chave uuid,p_papel text,p_nome text,p_mime text,
  p_bytes bigint,p_sha256 text,p_legenda text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_arquivos;
  v_cliente uuid;
  v_unidade uuid;
  v_registro uuid;
  v_contrato uuid;
  v_extensao text;
  v_nome text:=trim(p_nome);
  v_legenda text:=nullif(trim(p_legenda),'');
begin
  if p_tipo='levantamento' then
    if p_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document' then
      raise exception 'O levantamento aceita PDF, imagens e vídeos.' using errcode='23514';
    end if;
    return public.inspecoes_arquivo_reservar(p_org,p_alvo,p_chave,p_papel,p_nome,p_mime,p_bytes,p_sha256,p_legenda);
  end if;

  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.inspecoes_admin(p_org,auth.uid()) then
    raise exception 'Sem permissão para anexar ao acervo de Inspeções.' using errcode='42501';
  end if;

  case p_tipo
    when 'registro' then
      select r.cliente_id,r.unidade_id,r.id into v_cliente,v_unidade,v_registro
        from public.inspecoes_registros r
        where r.organization_id=p_org and r.id=p_alvo and r.colecao<>'registro';
    when 'contrato' then
      select c.cliente_id,c.unidade_id,c.id into v_cliente,v_unidade,v_contrato
        from public.inspecoes_contratos_operacionais c
        where c.organization_id=p_org and c.id=p_alvo and c.estado<>'cancelado' for update;
    when 'unidade' then
      select i.cliente_id,i.unidade_id into v_cliente,v_unidade
        from public.inspecoes_contextos i where i.organization_id=p_org and i.unidade_id=p_alvo;
    else
      raise exception 'Tipo de destino desconhecido.' using errcode='22023';
  end case;
  if not found or (v_unidade is not null and not exists(
    select 1 from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id
      where u.organization_id=p_org and u.cliente_id=v_cliente and u.id=v_unidade
        and u.arquivado_em is null and c.arquivado_em is null
  )) then
    raise exception 'Destino indisponível para anexar.' using errcode='42501';
  end if;

  v_extensao:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4'
    when 'video/webm' then 'webm'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' end;
  if p_chave is null or v_extensao is null or not coalesce(p_sha256 ~ '^[a-f0-9]{64}$',false)
    or not coalesce(p_bytes between 1 and 20971520,false)
    or not coalesce(length(v_nome) between 1 and 255,false) or length(v_legenda)>2000
    or p_papel is null or p_papel not in ('documento','contrato','foto','art','certificado','projeto','evidencia')
    or (p_papel='foto' and v_extensao not in ('jpg','png','webp'))
    or (p_papel='art' and v_extensao<>'pdf')
    or (p_papel in ('documento','contrato','certificado','projeto') and v_extensao not in ('pdf','docx'))
  then raise exception 'Arquivo inválido para este vínculo (limite de 20 MiB).' using errcode='23514';
  end if;

  insert into public.inspecoes_arquivos(
    id,organization_id,cliente_id,unidade_id,registro_id,contrato_id,anexo_unidade,papel,nome,legenda,
    estado,origem,caminho,sha256,bytes,mime,created_by
  ) values (
    p_chave,p_org,v_cliente,v_unidade,v_registro,v_contrato,p_tipo='unidade',p_papel,v_nome,v_legenda,
    'envio_pendente','Acervo Nexus',p_org::text||'/'||p_chave::text||'/original.'||v_extensao,
    p_sha256,p_bytes,p_mime,auth.uid()
  ) on conflict(id) do nothing;

  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_chave;
  if not found or (a.cliente_id,a.unidade_id,a.registro_id,a.contrato_id,a.anexo_unidade,a.levantamento_id,
    a.papel,a.nome,a.legenda,a.sha256,a.bytes,a.mime,a.created_by) is distinct from
    (v_cliente,v_unidade,v_registro,v_contrato,p_tipo='unidade',null::uuid,
    p_papel,v_nome,v_legenda,p_sha256,p_bytes,p_mime,auth.uid())
  then raise exception 'A chave de envio já pertence a outro arquivo.' using errcode='23505';
  end if;
  return to_jsonb(a);
end
$$;

-- Uso interno para confirmar anexos com a identidade do autor, mesmo no cliente service_role.
create function public.inspecoes_arquivo_autor_pode(a public.inspecoes_arquivos,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select a.created_by=p_actor and case when a.levantamento_id is not null then
    exists(select 1 from public.inspecoes_levantamentos l
      join public.inspecoes_atribuicoes_validas(a.organization_id,p_actor) g
        on (g.cliente_id is null or g.cliente_id=l.cliente_id)
        and (g.unidade_id is null or g.unidade_id=l.unidade_id)
      where l.organization_id=a.organization_id and l.id=a.levantamento_id
        and (g.perfil='EST' or (a.papel<>'original' and (l.atribuido_a=p_actor or l.created_by=p_actor)))
        and (a.estado<>'envio_pendente' or l.estado='rascunho' or (l.estado='aprovado' and a.papel='original'))
    )
  else
    public.inspecoes_admin(a.organization_id,p_actor)
    and (a.contrato_id is null or exists(select 1 from public.inspecoes_contratos_operacionais c
      where c.organization_id=a.organization_id and c.id=a.contrato_id and c.estado<>'cancelado'))
    and (a.unidade_id is null or exists(select 1 from public.unidades u
      join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id
      where u.organization_id=a.organization_id and u.cliente_id=a.cliente_id and u.id=a.unidade_id
        and u.arquivado_em is null and c.arquivado_em is null))
  end
$$;

create or replace function public.inspecoes_arquivo_pode_enviar(p_caminho text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.inspecoes_arquivos a where a.caminho=p_caminho and a.estado='envio_pendente'
    and public.inspecoes_arquivo_autor_pode(a,auth.uid()))
$$;

-- Mantém a ordem de bloqueio pai → arquivo das rotinas de levantamento.
create function public.inspecoes_arquivo_travar_alvo(a public.inspecoes_arquivos) returns void
language plpgsql security definer set search_path='' as $$
begin
  if a.levantamento_id is not null then
    perform 1 from public.inspecoes_levantamentos l
      where l.organization_id=a.organization_id and l.id=a.levantamento_id for update;
  elsif a.contrato_id is not null then
    perform 1 from public.inspecoes_contratos_operacionais c
      where c.organization_id=a.organization_id and c.id=a.contrato_id for update;
  end if;
end
$$;

create or replace function public.inspecoes_arquivo_atestar(
  p_org uuid,p_id uuid,p_actor uuid,p_sha256 text,p_bytes bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.inspecoes_arquivos;
begin
  perform public.lev_travar_autor(p_org,p_actor);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id;
  if not found or a.created_by is distinct from p_actor or a.sha256 is distinct from p_sha256
    or a.bytes is distinct from p_bytes
  then raise exception 'Envio indisponível ou bytes divergentes.' using errcode='42501';
  end if;
  perform public.inspecoes_arquivo_travar_alvo(a);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id for update;
  if not coalesce(public.inspecoes_arquivo_autor_pode(a,p_actor),false) then
    raise exception 'Envio indisponível para confirmação.' using errcode='42501';
  end if;
  if a.estado='envio_pendente' then
    update public.inspecoes_arquivos set estado='original_verificado' where id=p_id returning * into a;
  elsif a.estado not in ('original_verificado','falha_processamento') then
    raise exception 'O envio já foi encerrado.' using errcode='23514';
  end if;
  return to_jsonb(a);
end
$$;

create or replace function public.inspecoes_arquivo_cancelar(p_org uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_arquivos;
  l public.inspecoes_levantamentos;
  est boolean;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id;
  if not found then raise exception 'Envio indisponível.' using errcode='42501'; end if;
  perform public.inspecoes_arquivo_travar_alvo(a);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id for update;
  if a.levantamento_id is not null then
    select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=a.levantamento_id;
    est:=public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id,'est');
    if not (public.inspecoes_lev_acesso(p_org,l.id,true) and (est or a.created_by=auth.uid())
      or l.estado='aprovado' and est and a.papel='original')
    then raise exception 'Envio indisponível.' using errcode='42501'; end if;
  elsif not public.inspecoes_admin(p_org,auth.uid()) then
    raise exception 'Envio indisponível.' using errcode='42501';
  end if;
  if a.estado='envio_cancelado' then return to_jsonb(a); end if;
  if a.estado<>'envio_pendente' then raise exception 'Somente envios pendentes podem ser cancelados.' using errcode='23514'; end if;
  update public.inspecoes_arquivos set estado='envio_cancelado' where id=p_id returning * into a;
  return to_jsonb(a);
end
$$;

-- O executor confere SHA-256 e bytes do Storage; aqui os vínculos e escopos são revalidados.
create function public.inspecoes_arquivo_derivados(
  p_org uuid,p_id uuid,p_actor uuid,p_derivados jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_arquivos;
  v_prefixo text;
  v_tipo text;
  v_derivado jsonb;
  v_caminho text;
  v_hash text;
  v_tamanho integer;
  v_miniatura text;
  v_miniatura_hash text;
  v_previa text;
  v_previa_hash text;
begin
  perform public.lev_travar_autor(p_org,p_actor);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id;
  if not found or a.created_by is distinct from p_actor or a.papel<>'foto'
    or a.estado not in ('original_verificado','falha_processamento') or a.caminho is null
  then raise exception 'Fotografia indisponível para processamento.' using errcode='42501';
  end if;
  perform public.inspecoes_arquivo_travar_alvo(a);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id for update;
  if not coalesce(public.inspecoes_arquivo_autor_pode(a,p_actor),false) then
    raise exception 'Fotografia indisponível para processamento.' using errcode='42501';
  end if;
  perform public.ag_payload(p_derivados,array['miniatura_384','previa_768']);
  v_prefixo:=left(a.caminho,length(a.caminho)-length(regexp_replace(a.caminho,'^.*/','')));
  v_miniatura:=a.miniatura_caminho;
  v_miniatura_hash:=a.miniatura_sha256;
  v_previa:=a.previa_caminho;
  v_previa_hash:=a.previa_sha256;

  foreach v_tipo in array array['miniatura_384','previa_768'] loop
    if not p_derivados ? v_tipo then continue; end if;
    v_derivado:=p_derivados->v_tipo;
    perform public.ag_payload(v_derivado,array['caminho','sha256','bytes']);
    v_caminho:=v_derivado->>'caminho';
    v_hash:=v_derivado->>'sha256';
    v_tamanho:=(v_derivado->>'bytes')::integer;
    if v_caminho is distinct from v_prefixo||v_tipo||'.webp' or not coalesce(v_hash ~ '^[a-f0-9]{64}$',false)
      or not coalesce(v_tamanho between 1 and 4194304,false) or not exists(
        select 1 from storage.objects o where o.bucket_id='inspecoes-acervo' and o.name=v_caminho
          and o.metadata->>'size'=v_tamanho::text and o.metadata->>'mimetype'='image/webp')
    then raise exception 'Derivado ainda não confirmado no armazenamento.' using errcode='23514';
    end if;
    if v_tipo='miniatura_384' then
      v_miniatura:=v_caminho;
      v_miniatura_hash:=v_hash;
    else
      v_previa:=v_caminho;
      v_previa_hash:=v_hash;
    end if;
  end loop;

  update public.inspecoes_arquivos set
    miniatura_caminho=v_miniatura,miniatura_sha256=v_miniatura_hash,
    previa_caminho=v_previa,previa_sha256=v_previa_hash,
    estado=case when v_miniatura is not null and v_previa is not null
      then 'original_verificado' else 'falha_processamento' end
  where id=p_id returning * into a;
  return to_jsonb(a);
end
$$;

revoke all on function public.inspecoes_arquivo_auditar(),
  public.inspecoes_arquivo_reservar_alvo(uuid,text,uuid,uuid,text,text,text,bigint,text,text),
  public.inspecoes_arquivo_autor_pode(public.inspecoes_arquivos,uuid),
  public.inspecoes_arquivo_travar_alvo(public.inspecoes_arquivos),
  public.inspecoes_arquivo_derivados(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_arquivo_reservar_alvo(uuid,text,uuid,uuid,text,text,text,bigint,text,text)
  to authenticated;
grant execute on function public.inspecoes_arquivo_derivados(uuid,uuid,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
