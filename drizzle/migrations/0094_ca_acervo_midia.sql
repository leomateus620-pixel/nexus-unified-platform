-- O acervo 3D resolve os bytes no mesmo escopo da ficha, inclusive para consultores da cena.
create function public.ca_arquivo_da_revisao(p_org uuid, p_chave text, p_doc uuid, p_rev uuid)
returns public.nr_arquivos language plpgsql stable security definer set search_path='' as $$
declare
  l public.nr_locais := public.ca_local(p_org, p_chave);
  a public.nr_arquivos;
begin
  if not exists (select 1 from public.ca_relacoes(p_org, p_chave) d where d.documento_id=p_doc) then
    raise exception 'Revisão indisponível neste destino.' using errcode='42501';
  end if;
  select f.* into a from public.ca_revisoes(p_org, p_doc) r join public.nr_arquivos f on f.id=r.arquivo_id
  where r.id=p_rev and (f.organization_id, f.cliente_id, f.unidade_id)=(p_org, l.cliente_id, l.unidade_id);
  if not found then
    raise exception 'Prévia indisponível para esta revisão.' using errcode='55000';
  end if;
  if not (public.nr_arquivo_ler(p_org, a.id) or exists (
    select 1 from public.nr_cena_consultores v
    where (v.organization_id, v.cliente_id, v.unidade_id, v.usuario_id)=(p_org, l.cliente_id, l.unidade_id, auth.uid())
      and v.permite_original
  )) then
    raise exception 'Seu perfil não permite abrir os bytes originais desta revisão.' using errcode='42501';
  end if;
  return a;
end$$;
revoke all on function public.ca_arquivo_da_revisao(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.ca_previa(p_org uuid, p_chave text, p_doc uuid, p_rev uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.nr_arquivos := public.ca_arquivo_da_revisao(p_org, p_chave, p_doc, p_rev);
begin
  if a.mime <> 'application/pdf' and a.mime not like 'image/%' then
    raise exception 'Prévia indisponível para este formato.' using errcode='55000';
  end if;
  return jsonb_build_object('arquivo_id', a.id, 'tamanho', a.tamanho, 'mime', a.mime, 'sha256', a.sha256, 'caminho', a.caminho);
end$$;

create function public.ca_acervo_midia(p_org uuid, p_chave text, p_doc uuid, p_rev uuid, p_variante text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  a public.nr_arquivos := public.ca_arquivo_da_revisao(p_org, p_chave, p_doc, p_rev);
  r public.nr_imagem_representacoes;
begin
  if p_variante = 'anexo_office' then
    if a.mime not in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then
      raise exception 'Formato indisponível para este download.' using errcode='55000';
    end if;
  elsif p_variante is null or p_variante not in ('miniatura_384', 'previa_768', 'original') or a.mime not like 'image/%' then
    raise exception 'Representação indisponível para esta revisão.' using errcode='55000';
  end if;
  if p_variante in ('miniatura_384', 'previa_768') then
    select i.* into r from public.nr_imagem_representacoes i
    where (i.organization_id, i.arquivo_id, i.original_sha256, i.variante, i.estado) =
          (p_org, a.id, a.sha256, p_variante, 'disponivel')
      and i.processador in ('nexus-storage-transform-v1', 'nexus-pillow-v1')
    order by (i.processador='nexus-storage-transform-v1') desc, i.id limit 1;
    if found then
      return jsonb_build_object('arquivo_id', a.id, 'nome', a.nome, 'caminho', r.caminho,
        'mime', r.mime, 'sha256', r.sha256, 'variante', r.variante);
    elsif p_variante = 'miniatura_384' then
      return null;
    end if;
  end if;
  return jsonb_build_object('arquivo_id', a.id, 'nome', a.nome, 'caminho', a.caminho,
    'mime', a.mime, 'sha256', a.sha256, 'variante', case when p_variante = 'anexo_office' then p_variante else 'original' end);
end$$;
revoke all on function public.ca_acervo_midia(uuid, text, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.ca_acervo_midia(uuid, text, uuid, uuid, text) to authenticated;
