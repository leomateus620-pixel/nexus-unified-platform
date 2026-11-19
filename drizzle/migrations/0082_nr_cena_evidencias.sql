-- Fotografia sem data interna mantém NULL. A data de inclusão no acervo é independente.
create or replace function public.ca_publicar(p_org uuid,p_chave text,p_operacao uuid,p_arquivo uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); dest public.nr_locais;
 op public.nr_cena_envios; a public.nr_arquivos; d public.nr_documentos; r public.nr_documento_revisoes;
 doc uuid:=(p_dados->>'documento_id')::uuid; prev uuid:=(p_dados->>'anterior_id')::uuid;
 v_titulo text:=trim(p_dados->>'titulo'); rotulo text:=trim(p_dados->>'rotulo'); origem jsonb:=p_dados->'origem';
 origem_chave text:=origem->>'documento_chave'; v_resultado jsonb; foto_sem_data boolean; n integer:=1; reutilizada boolean:=false;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') or not public.pode(p_org,'revisar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.ag_payload(p_dados,array['documento_id','anterior_id','titulo','rotulo','data','escopo','origem','categoria']);
 dest:=public.ca_destino(p_org,p_chave,p_dados->>'escopo');
 foto_sem_data:=p_dados?'data' and p_dados->'data'='null'::jsonb and p_dados->>'categoria'='foto'
 and origem is not null and rotulo='Original';
 if coalesce(length(v_titulo),0) not between 2 and 240 or coalesce(length(rotulo),0) not between 1 and 100 or (not coalesce(foto_sem_data,false) and coalesce(p_dados->>'data','')!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Título, revisão interna e data obrigatórios.' using errcode='23514';end if;
 if origem is not null then
  perform public.ag_payload(origem,array['sistema','id','pagina','autor','documento_chave','nota']);
  if coalesce(origem->>'sistema','') not in('google_drive','anexo') or coalesce(length(trim(origem->>'id')),0) not between 1 and 500
  or coalesce((origem->>'pagina')::integer,0)<1 or length(origem_chave)>500 or (origem?'nota' and (jsonb_typeof(origem->'nota')<>'string' or length(origem->>'nota')>4000)) then raise exception 'Proveniência incompleta.' using errcode='23514';end if;
 end if;
 select * into op from public.nr_cena_envios where organization_id=p_org and operacao=p_operacao for update;
 if not found or (op.autor,op.arquivo_id,op.local_id) is distinct from(auth.uid(),p_arquivo,l.id) then raise exception 'Envio indisponível neste destino.' using errcode='42501';end if;
 if op.resultado is not null then
  if op.publicacao is distinct from p_dados then raise exception 'Operação já confirmada com outro pedido.' using errcode='23505';end if;
  return op.resultado;
 end if;
 select * into strict a from public.nr_arquivos where id=p_arquivo for update;
 if foto_sem_data and (a.mime not like 'image/%' or doc is not null) then
  raise exception 'Data desconhecida só se aplica à fotografia original recebida. Confira a cronologia antes de substituí-la.' using errcode='23514';
 end if;
 if a.estado not in('verificado','vinculado') or not a.bytes_verificados then raise exception 'Bytes ainda não validados no servidor.' using errcode='23514';end if;
 if a.estado='verificado' then perform public.nr_arquivo_confirmar_interno(p_org,a.id,a.sha256,a.tamanho,a.mime,auth.uid(),false);end if;
 if origem_chave is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-doc:'||l.unidade_id::text||origem_chave,0));
  select * into d from public.nr_documentos where (organization_id,cliente_id,unidade_id)=(p_org,l.cliente_id,l.unidade_id) and dados->>'acervo'='cena' and dados->>'documento_chave'=origem_chave;
  if d.id is not null and d.id is distinct from doc then raise exception 'Conflito de origem. Confira o documento e a revisão vigente.' using errcode='40001';end if;
 end if;
 if doc is not null then
  select * into d from public.nr_documentos where (organization_id,cliente_id,unidade_id,id)=(p_org,l.cliente_id,l.unidade_id,doc)
  and dados->>'acervo'='cena' and arquivado_em is null and 'NR35'=any(normas) for update;
  if not found or not exists(select 1 from public.ca_relacoes(p_org,p_chave) v where v.documento_id=doc) then raise exception 'Documento indisponível para revisão neste destino.' using errcode='42501';end if;
  if d.revisao_atual_id is distinct from prev or prev is null then raise exception 'Conflito de revisão. Confira a revisão vigente.' using errcode='40001';end if;
  select * into strict r from public.nr_documento_revisoes where id=prev;
  if origem is not null and ((rotulo~'^[0-9]+$' and (r.snapshot->>'rotulo')~'^[0-9]+$' and rotulo::numeric<=(r.snapshot->>'rotulo')::numeric)
  or (p_dados->>'data')::date<r.data_origem::date) then raise exception 'Revisão anterior ou ambígua. Concilie a fonte antes da publicação.' using errcode='23514';end if;
  n:=r.numero+1;
  update public.nr_documento_revisoes set vigencia='superada' where id=prev;
 else
  -- Outra intenção para o mesmo original, destino e revisão recupera o primeiro registro.
  select v.* into r from public.nr_documento_revisoes v join public.nr_documentos original on original.id=v.documento_id
  join public.nr_cena_documentos link on link.documento_id=original.id
  where link.local_id=dest.id and link.escopo=p_dados->>'escopo' and link.removido_em is null and original.arquivado_em is null
  and original.dados->>'acervo'='cena' and original.titulo=v_titulo and v.snapshot->>'arquivo_id'=a.id::text and v.snapshot->>'rotulo'=rotulo
  and v.data_origem::date is not distinct from (p_dados->>'data')::date and (original.dados->>'documento_chave') is not distinct from origem_chave limit 1;
  if found then doc:=r.documento_id;reutilizada:=true;
  else
   insert into public.nr_documentos(organization_id,cliente_id,unidade_id,normas,titulo,tipo,estado,recebimento,dados)
   values(p_org,l.cliente_id,l.unidade_id,array['NR35'],v_titulo,'original_externo','emitido_origem','recebido',
   jsonb_strip_nulls(jsonb_build_object('acervo','cena','categoria',coalesce(p_dados->>'categoria',p_dados->>'escopo'),'documento_chave',origem_chave))) returning id into doc;
  end if;
 end if;
 if not reutilizada then
  insert into public.nr_documento_revisoes(organization_id,documento_id,numero,estado,substitui_id,sha256,data_origem,snapshot)
  values(p_org,doc,n,'emitido_origem',prev,a.sha256,(p_dados->>'data')::date,
  jsonb_strip_nulls(jsonb_build_object('rotulo',rotulo,'arquivo_id',a.id,'origem',origem,'nome_original',op.pedido->>'nome','titulo',v_titulo,'mime',a.mime,'bytes',a.tamanho))) returning * into r;
  insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,origem_chave,evidencia)
  values(p_org,l.cliente_id,l.unidade_id,a.id,doc,r.id,'cena:'||r.id::text,jsonb_build_object('autor',auth.uid(),'sha256',a.sha256,'origem',origem));
  update public.nr_documentos set revisao_atual_id=r.id,titulo=v_titulo where id=doc;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor) values
  (p_org,'documentos',doc,'publicar_original_recebido',jsonb_build_object('revisao',r.id,'arquivo',a.id,'rotulo',rotulo,'substitui',prev,'origem',origem),auth.uid());
 end if;
 if origem is not null then
  insert into public.nr_cena_origens values(p_org,l.cliente_id,l.unidade_id,origem->>'sistema',origem->>'id',a.sha256,doc,r.id)
  on conflict do nothing;
  if not exists(select 1 from public.nr_cena_origens s where (s.organization_id,s.unidade_id,s.sistema,s.externo_id,s.sha256,s.documento_id,s.revisao_id)=
  (p_org,l.unidade_id,origem->>'sistema',origem->>'id',a.sha256,doc,r.id)) then raise exception 'Origem já associada a outra revisão.' using errcode='23505';end if;
 end if;
 perform public.ca_vinculo(p_org,p_chave,doc,p_dados->>'escopo',false);
 v_resultado:=jsonb_build_object('documento_id',doc,'revisao_id',r.id);
 update public.nr_cena_envios set publicacao=p_dados,resultado=v_resultado where organization_id=p_org and operacao=p_operacao;
 return v_resultado;
end$$;

create or replace function public.ca_ficha(p_org uuid,p_chave text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 return jsonb_build_object('id',l.id,'chave',p_chave,'titulo',l.titulo,'descricao',l.descricao,'version',l.version,
 'observacoes',coalesce(l.dados->>'observacoes',''),'atributos',coalesce(l.dados->'atributos','{}'),
 'atualizado_em',l.updated_at,'atualizado_por',coalesce(l.dados->>'atualizado_por',l.created_by::text),
 'pode_editar',public.pode(p_org,'editar_nr'),'pode_publicar',public.pode(p_org,'anexar_nr') and public.pode(p_org,'revisar_nr'),
 'cliente_id',l.cliente_id,'unidade_id',l.unidade_id,
 'historico',coalesce((select jsonb_agg(to_jsonb(h) order by h.em desc) from
 (select comando,autor,created_at em from public.nr_historico where organization_id=p_org and recurso='locais' and registro_id=l.id order by created_at desc,id desc limit 30)h),'[]'),
 'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'titulo',coalesce(m.titulo,d.titulo),'descricao',coalesce(m.descricao,d.descricao),'version',d.version+coalesce(m.versao,0),'pode_corrigir',public.pode(p_org,'editar_nr'),'escopo',v.escopo,'objeto',v.objeto,
 'vigente_id',d.revisao_atual_id,'revisoes',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('nota',vdoc.snapshot#>>'{origem,nota}','autor',vdoc.created_by,'publicado_em',vdoc.created_at) order by r.numero desc)
 from public.ca_revisoes(p_org,d.id) r join public.nr_documento_revisoes vdoc on vdoc.id=r.id),'[]')) order by d.titulo,v.objeto)
 from public.ca_relacoes(p_org,p_chave) v join public.nr_documentos d on d.id=v.documento_id left join public.nr_cena_metadados m on m.documento_id=d.id),'[]'));
end$$;
notify pgrst,'reload schema';
