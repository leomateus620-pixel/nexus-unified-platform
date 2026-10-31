-- Manutenção de mídia da origem; derivados Nexus continuam em nr_imagem_representacoes.
-- Completar mídia não reimporta nem reescreve os metadados históricos da ocorrência.
create function public.nr_foto_ocorrencia_completar(p_org uuid,p_dados jsonb)returns uuid
 language plpgsql security definer set search_path=''as $$
declare o public.nr_foto_ocorrencias;a public.nr_arquivos;m public.nr_arquivos;
 original uuid;mini uuid;proveniencia text;novo_original boolean;nova_mini boolean;recibo jsonb;
begin
 if p_org is null or jsonb_typeof(p_dados)is distinct from'object'then
  raise exception'Organização e objeto de complementação são obrigatórios.'using errcode='23514';end if;
 if nullif(p_dados->>'origem','')is null or nullif(p_dados->>'ocorrencia_origem','')is null
  or nullif(p_dados->>'referencia_original','')is null
  or exists(select 1 from jsonb_object_keys(p_dados)k where k not in(
   'origem','ocorrencia_origem','referencia_original','referencia_miniatura',
   'arquivo_id','miniatura_arquivo_id','miniatura_proveniencia'))then
  raise exception'Identidade e referências exatas da ocorrência são obrigatórias; metadados de origem não podem ser editados.'using errcode='23514';
 end if;
 original:=nullif(p_dados->>'arquivo_id','')::uuid;
 mini:=nullif(p_dados->>'miniatura_arquivo_id','')::uuid;
 if original is null and mini is null then raise exception'Informe uma mídia verificada para completar.'using errcode='23514';end if;
 select *into o from public.nr_foto_ocorrencias where organization_id=p_org
  and origem=p_dados->>'origem'and ocorrencia_origem=p_dados->>'ocorrencia_origem'for update;
 if not found then raise exception'Ocorrência não conciliada.'using errcode='23514';end if;
 if o.referencia_original is distinct from p_dados->>'referencia_original'
  or(p_dados?'referencia_miniatura'and o.referencia_miniatura is distinct from p_dados->>'referencia_miniatura')then
  raise exception'Referência da origem divergente; revisão explícita obrigatória.'using errcode='23505';
 end if;
 if(original is not null and o.arquivo_id is not null and o.arquivo_id<>original)
  or(mini is not null and o.miniatura_arquivo_id is not null and o.miniatura_arquivo_id<>mini)then
  raise exception'Ocorrência já conciliada com outra mídia; substituição não permitida.'using errcode='23505';
 end if;
 if original is not null then
  select *into a from public.nr_arquivos where organization_id=p_org and id=original for share;
  if not found or a.cliente_id<>o.cliente_id or a.unidade_id<>o.unidade_id
   or a.estado<>'vinculado'or not a.bytes_verificados or a.mime not like'image/%'
   or a.origem_metadata->>'tipo'is distinct from'original_origem'
   or a.origem_metadata->>'sistema'is distinct from o.origem
   or a.origem_metadata->>'referencia_source'is distinct from o.referencia_original
   or(o.evidencia?'snapshot_sha256'and a.origem_metadata->>'source_snapshot_sha256'is distinct from o.evidencia->>'snapshot_sha256')then
   raise exception'Original não verificado, contexto ou referência de origem divergente.'using errcode='23514';
  end if;
 end if;
 if mini is not null then
  proveniencia:=coalesce(nullif(p_dados->>'miniatura_proveniencia',''),o.miniatura_proveniencia);
  if proveniencia is distinct from'origem'or o.referencia_miniatura is null
   or not(p_dados?'referencia_miniatura')then
   raise exception'Este completador aceita apenas miniatura da origem com sua referência exata preservada.'using errcode='23514';
  end if;
  if o.miniatura_proveniencia is not null and o.miniatura_proveniencia<>proveniencia then
   raise exception'Proveniência já conciliada; substituição não permitida.'using errcode='23505';end if;
  select *into m from public.nr_arquivos where organization_id=p_org and id=mini for share;
  if not found or m.cliente_id<>o.cliente_id or m.unidade_id<>o.unidade_id
   or m.estado<>'vinculado'or not m.bytes_verificados or m.mime not like'image/%'
   or m.origem_metadata->>'sistema'is distinct from o.origem
   or m.origem_metadata->>'referencia_source'is distinct from o.referencia_miniatura
   or m.origem_metadata->>'tipo'is distinct from'miniatura_origem'
   or(o.evidencia?'snapshot_sha256'and m.origem_metadata->>'source_snapshot_sha256'is distinct from o.evidencia->>'snapshot_sha256')then
   raise exception'Miniatura não verificada, contexto, proveniência ou referência de origem divergente.'using errcode='23514';
  end if;
 end if;
 novo_original:=original is not null and o.arquivo_id is null;
 nova_mini:=mini is not null and o.miniatura_arquivo_id is null;
 if not novo_original and not nova_mini then return o.id;end if;
 if o.evidencia?'complementacoes_nexus'and jsonb_typeof(o.evidencia->'complementacoes_nexus')is distinct from'array'then
  raise exception'Recibos existentes precisam de revisão; evidência preservada.'using errcode='23514';end if;
 recibo:=jsonb_strip_nulls(jsonb_build_object('tipo','complementacao_midia_nexus','registrado_em',clock_timestamp(),
  'arquivo_id',case when novo_original then original end,'arquivo_sha256',case when novo_original then a.sha256 end,
  'miniatura_arquivo_id',case when nova_mini then mini end,'miniatura_sha256',case when nova_mini then m.sha256 end));
 update public.nr_foto_ocorrencias set arquivo_id=coalesce(arquivo_id,original),
  miniatura_arquivo_id=coalesce(miniatura_arquivo_id,mini),
  miniatura_proveniencia=case when nova_mini then coalesce(miniatura_proveniencia,proveniencia)else miniatura_proveniencia end,
  evidencia=evidencia||jsonb_build_object('complementacoes_nexus',coalesce(evidencia->'complementacoes_nexus','[]'::jsonb)||jsonb_build_array(recibo))
 where id=o.id and organization_id=p_org;
 return o.id;
end$$;
revoke all on function public.nr_foto_ocorrencia_completar(uuid,jsonb)from public,anon,authenticated,service_role;
