-- Classificação de cópia e correspondência de linhagem são informações distintas.
-- Somente projeções/índices de leitura: nenhum documento ou snapshot é atualizado.
create function public.nr_uuid_seguro(p_valor text)returns uuid language sql immutable parallel safe set search_path=''as $$
 select case when p_valor~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then p_valor::uuid end
$$;
create function public.nr_documento_e_copia(p_tipo text,p_dados jsonb)returns boolean language sql immutable parallel safe set search_path=''as $$
 select coalesce(p_tipo='derivado_docx'or p_dados->>'tipo'='derivado_docx_editavel'or(public.nr_uuid_seguro(p_dados#>>'{conversao,original_arquivo_id}')is not null and nullif(p_dados#>>'{conversao,conversor}','')is not null),false)
$$;

-- Identidades são convertidas uma vez e consultadas pelas PKs. Não compara arquivo.id::text.
create or replace function public.nr_documento_copia_comprovada(p_org uuid,p_dados jsonb)returns boolean language sql stable security definer set search_path=''as $$
 with referencias as(
  select public.nr_uuid_seguro(p_dados#>>'{conversao,documento_origem_id}')documento_id
  union select public.nr_uuid_seguro(e->>'documento_id')from jsonb_array_elements(case when jsonb_typeof(p_dados->'documentos_originais')='array'then p_dados->'documentos_originais'else '[]'::jsonb end)e
  union select public.nr_uuid_seguro(e->>'documento_id')from jsonb_array_elements(case when jsonb_typeof(p_dados#>'{conversao,documentos_originais}')='array'then p_dados#>'{conversao,documentos_originais}'else '[]'::jsonb end)e
 )select exists(select 1 from public.nr_arquivos a join referencias r on r.documento_id is not null
 join public.nr_documentos d on d.id=r.documento_id and d.organization_id=p_org and d.cliente_id=a.cliente_id and d.unidade_id=a.unidade_id
 where a.organization_id=p_org and a.id=public.nr_uuid_seguro(coalesce(p_dados->>'arquivo_original_id',p_dados#>>'{conversao,original_arquivo_id}'))and a.estado='vinculado'and a.bytes_verificados
 and(a.documento_id=d.id or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=p_org and l.arquivo_id=a.id and l.documento_id=d.id)))
$$;

create function public.nr_painel_contadores_documentos(p_org uuid,p_norma text,p_filtros jsonb default '{}')returns jsonb
language sql stable security definer set search_path=''as $$
 with documentos as materialized(select d.id,public.nr_documento_e_copia(d.tipo,d.dados)copia,d.dados from public.nr_documentos d
 where d.organization_id=p_org and p_norma=any(d.normas)and d.arquivado_em is null
 and(nullif(p_filtros->>'cliente_id','')is null or d.cliente_id=(p_filtros->>'cliente_id')::uuid)
 and(nullif(p_filtros->>'unidade_id','')is null or d.unidade_id=(p_filtros->>'unidade_id')::uuid)
 and(nullif(p_filtros->>'local_id','')is null or d.local_id=(p_filtros->>'local_id')::uuid)),
 classificados as materialized(select id,copia,case when copia then public.nr_documento_copia_comprovada(p_org,dados)else false end linhagem from documentos)
 select jsonb_build_object('documentos_logicos',count(*),'documentos_origem',count(*)filter(where not copia),'copias_editaveis',count(*)filter(where copia),
 'copias_correspondencia_pendente',count(*)filter(where copia and not linhagem),'documentos_principais',count(*)filter(where not linhagem))from classificados
$$;

alter function public.nr_documento_resumo(uuid,text,uuid)rename to nr_documento_resumo_base_68;
create function public.nr_documento_resumo(p_org uuid,p_norma text,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare r jsonb:=public.nr_documento_resumo_base_68(p_org,p_norma,p_id);copia boolean;linhagem boolean;data_texto text;begin
 select public.nr_documento_e_copia(d.tipo,d.dados),public.nr_documento_copia_comprovada(p_org,d.dados),
 coalesce(nullif(v.snapshot->>'emitido_em',''),nullif(v.snapshot->>'criado_em',''),nullif(f.payload->>'emitido_em',''),nullif(f.payload->>'criado_em',''),nullif(v.snapshot->>'data',''),nullif(f.payload->>'data',''),nullif(f.payload#>>'{snapshot,data}',''))
 into copia,linhagem,data_texto from public.nr_documentos d left join public.nr_documento_revisoes v on v.organization_id=d.organization_id and v.id=d.revisao_atual_id
 left join lateral(select sf.payload from public.nr_fontes sf where sf.organization_id=d.organization_id and sf.destino_tipo='documentos'and sf.destino_id=d.id and sf.sha256=v.sha256 order by sf.capturado_em desc,sf.id limit 1)f on true where d.organization_id=p_org and d.id=p_id;
 return r||jsonb_build_object('copia_editavel',coalesce(copia,false),'linhagem_comprovada',coalesce(linhagem,false),'correspondencia_pendente',coalesce(copia and not linhagem,false),'data_origem_texto',data_texto);
end$$;

alter function public.nr_local_resumo(uuid,text,uuid)rename to nr_local_resumo_base_68;
create function public.nr_local_resumo(p_org uuid,p_norma text,p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select public.nr_local_resumo_base_68(p_org,p_norma,p_id)||jsonb_build_object('documentos_total',c->'documentos_logicos','documentos_origem',c->'documentos_origem','copias_editaveis',c->'copias_editaveis','copias_correspondencia_pendente',c->'copias_correspondencia_pendente')
 from(select public.nr_painel_contadores_documentos(p_org,p_norma,jsonb_build_object('local_id',p_id))c)x
$$;

-- O contrato público mantém autorização, paginação e filtros da versão68.
alter function public.nr_consultar(uuid,text,text,jsonb)rename to nr_consultar_base_68;
create function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}')returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare r jsonb:=public.nr_consultar_base_68(p_org,p_norma,p_recurso,p_filtros);c jsonb;linhas jsonb;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;begin
 if p_recurso='painel'then
  c:=public.nr_painel_contadores_documentos(p_org,p_norma,p_filtros);r:=r||c;
  select coalesce(jsonb_agg(to_jsonb(q)order by q.prioridade,q.prazo nulls last,q.id),'[]')into linhas from(
   select p.id,p.titulo,p.estado,p.normas,p.cliente_id,p.unidade_id,p.local_id,p.criticidade,p.prazo,p.updated_at,p.arquivado_em,case p.criticidade when 'critica'then 0 when 'alta'then 1 else 2 end prioridade
   from public.nr_pendencias p where p.organization_id=p_org and p_norma=any(p.normas)and p.estado='aberta'and p.arquivado_em is null and(cliente is null or p.cliente_id=cliente)and(unidade is null or p.unidade_id=unidade)
   order by case p.criticidade when 'critica'then 0 when 'alta'then 1 else 2 end,p.prazo nulls last,p.id limit 8)q;
  r:=r||jsonb_build_object('pendencias_prioritarias',linhas);
  select coalesce(jsonb_agg(to_jsonb(q)order by q.updated_at desc,q.id),'[]')into linhas from(
   select d.id,d.titulo,d.estado,d.normas,d.cliente_id,d.unidade_id,d.local_id,d.updated_at,d.arquivado_em from public.nr_documentos d where d.organization_id=p_org and p_norma=any(d.normas)and d.estado='em_revisao'and d.arquivado_em is null and(cliente is null or d.cliente_id=cliente)and(unidade is null or d.unidade_id=unidade)order by d.updated_at desc,d.id limit 8)q;
  r:=r||jsonb_build_object('documentos_revisao',linhas);
 elsif p_recurso='contexto'then
  select coalesce(jsonb_agg(e.value||jsonb_build_object('documentos',x.c->'documentos_logicos','documentos_origem',x.c->'documentos_origem','copias_editaveis',x.c->'copias_editaveis','copias_correspondencia_pendente',x.c->'copias_correspondencia_pendente')order by e.ordinality),'[]')into linhas
  from jsonb_array_elements(r->'unidades')with ordinality e cross join lateral(select public.nr_painel_contadores_documentos(p_org,p_norma,jsonb_build_object('unidade_id',e.value->>'id'))c)x;
  r:=r||jsonb_build_object('unidades',linhas);
 end if;return r;
end$$;
revoke all on function public.nr_uuid_seguro(text),public.nr_documento_e_copia(text,jsonb),public.nr_documento_copia_comprovada(uuid,jsonb),public.nr_painel_contadores_documentos(uuid,text,jsonb),public.nr_documento_resumo_base_68(uuid,text,uuid),public.nr_documento_resumo(uuid,text,uuid),public.nr_local_resumo_base_68(uuid,text,uuid),public.nr_local_resumo(uuid,text,uuid),public.nr_consultar_base_68(uuid,text,text,jsonb),public.nr_consultar(uuid,text,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_consultar(uuid,text,text,jsonb)to authenticated;
