-- Retenção alcança todas as revisões explicitamente vinculadas ao objeto físico.
-- Não altera bytes, identidades, recibos históricos ou permissões profissionais.
create or replace function public.nr_arquivo_cancelar(p_org uuid,p_id uuid,p_motivo text,p_chave uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;r jsonb;payload jsonb:=jsonb_build_object('id',p_id,'motivo',p_motivo);begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'arquivar_nr') or p_motivo is null or length(trim(p_motivo)) not between 2 and 4000 or p_chave is null then raise exception 'Permissão/motivo inválido.' using errcode='42501';end if;
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_id for update;
 if not found or not coalesce(a.bytes_verificados or a.created_by=auth.uid(),false) then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
 -- A mesma trava impede um vínculo secundário concorrente de atravessar a decisão.
 perform 1 from public.nr_documento_revisoes v where v.organization_id=p_org and (
  v.id=a.revisao_id or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=p_org and l.arquivo_id=a.id and l.documento_id=v.documento_id and l.revisao_id=v.id)
 ) order by v.id for share;
 if a.bytes_verificados and exists(select 1 from public.nr_documento_revisoes v where v.organization_id=p_org and (v.estado in('emitido','emitido_origem') or v.vigencia='superada') and (
  v.id=a.revisao_id or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=p_org and l.arquivo_id=a.id and l.documento_id=v.documento_id and l.revisao_id=v.id)
 )) then raise exception 'Original retido por revisão emitida/superada, inclusive vínculo secundário; arquive o documento sem ocultar suas evidências.' using errcode='23514';end if;
 r:=public.operacao_repetir(p_org,p_chave,'nr_arquivo_cancelar',payload);if r is not null then return to_jsonb(a);end if;
 if a.estado<>'arquivado' then
  update public.nr_arquivos set estado='arquivado',arquivado_em=now(),erro=p_motivo where id=a.id returning * into a;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,motivo,depois,autor)values(p_org,'arquivos',a.id,'arquivar',p_motivo,to_jsonb(a),auth.uid());
 end if;
 return public.operacao_concluir(p_org,p_chave,'nr_arquivo_cancelar',payload,to_jsonb(a));
end$$;
revoke all on function public.nr_arquivo_cancelar(uuid,uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_arquivo_cancelar(uuid,uuid,text,uuid)to authenticated;

create or replace function public.nr_arquivo_importar_vinculo(p_org uuid,p_arquivo uuid,p_chave text,p_destino jsonb,p_evidencia jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;v public.nr_arquivo_vinculos;begin
 -- Serializa com arquivamento e evita associar uma evidência já ocultada na lixeira.
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_arquivo for update;
 if not found or a.origem<>'importacao' or a.estado='arquivado' or a.arquivado_em is not null or p_chave is null or length(trim(p_chave)) not between 1 and 1000 or jsonb_typeof(p_destino) is distinct from 'object' or jsonb_typeof(p_evidencia) is distinct from 'object' or p_evidencia='{}'::jsonb then raise exception 'Vínculo de importação inválido ou arquivo arquivado.' using errcode='23514';end if;
 perform public.ag_payload(p_destino,array['documento_id','revisao_id','local_id','pasta_id']);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-vinculo:'||p_org::text||':'||p_arquivo::text||':'||p_chave,0));
 select * into v from public.nr_arquivo_vinculos where organization_id=p_org and arquivo_id=p_arquivo and origem_chave=p_chave;
 if found then
  if jsonb_build_object('documento_id',v.documento_id,'revisao_id',v.revisao_id,'local_id',v.local_id,'pasta_id',v.pasta_id) is distinct from jsonb_build_object('documento_id',nullif(p_destino->>'documento_id','')::uuid,'revisao_id',nullif(p_destino->>'revisao_id','')::uuid,'local_id',nullif(p_destino->>'local_id','')::uuid,'pasta_id',nullif(p_destino->>'pasta_id','')::uuid) or v.evidencia is distinct from p_evidencia then raise exception 'Vínculo de origem já registrado com outra decisão.' using errcode='23505';end if;return v.id;
 end if;
 insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,local_id,pasta_id,origem_chave,evidencia)
 values(p_org,a.cliente_id,a.unidade_id,a.id,nullif(p_destino->>'documento_id','')::uuid,nullif(p_destino->>'revisao_id','')::uuid,nullif(p_destino->>'local_id','')::uuid,nullif(p_destino->>'pasta_id','')::uuid,p_chave,p_evidencia)returning * into v;
 return v.id;
end$$;
revoke all on function public.nr_arquivo_importar_vinculo(uuid,uuid,text,jsonb,jsonb)from public,anon,authenticated,service_role;
