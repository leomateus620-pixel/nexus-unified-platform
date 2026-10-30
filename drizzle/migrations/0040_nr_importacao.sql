-- Importação privada, retomável e por item. Sem contas Auth ou aprovações retroativas.
-- O executor de manutenção é registrado separadamente da autoria histórica.
do $$declare t text;begin
 foreach t in array array['nr_locais','nr_pastas','nr_documentos','nr_documento_revisoes','nr_modelos','nr_modelo_versoes','nr_levantamentos','nr_sistemas','nr_pendencias','nr_tratativas','nr_import_lotes'] loop
  execute format('alter table public.%I alter column created_by drop not null',t);
 end loop;
end$$;
alter table public.nr_respostas alter column updated_by drop not null;
alter table public.pet_espacos add column import_origem text,alter column created_by drop not null,
 add constraint pet_espaco_autoria_origem check(created_by is not null or coalesce(length(trim(import_origem)),0)>=3);
alter table public.nr_import_lotes add column executor text not null default current_user,add column manifesto jsonb not null default '{}';
alter table public.nr_fontes add column snapshot_destino jsonb;
alter table public.nr_import_itens add column executor text not null default current_user;
create table public.nr_documento_relacoes (
 organization_id uuid not null,documento_id uuid not null,documento_relacionado_id uuid not null,tipo text not null check(tipo in('substituido_por','referencia','depende')),
 evidencia jsonb not null,created_at timestamptz not null default now(),executor text not null default current_user,
 primary key(organization_id,documento_id,documento_relacionado_id,tipo),check(documento_id<>documento_relacionado_id),
 foreign key(organization_id,documento_id)references public.nr_documentos(organization_id,id),foreign key(organization_id,documento_relacionado_id)references public.nr_documentos(organization_id,id)
);
alter table public.nr_documento_relacoes enable row level security;
revoke all on public.nr_documento_relacoes from public,anon,authenticated,service_role;
grant select on public.nr_documento_relacoes to authenticated;
create policy nr_ler on public.nr_documento_relacoes for select to authenticated using(public.pode(organization_id,'ver_nr'));
create trigger nr_imutavel before update or delete on public.nr_documento_relacoes for each row execute function public.pet_imutavel();

create function public.nr_iniciar_importacao(p_org uuid,p_origem text,p_chave text,p_snapshot_inicio timestamptz,p_snapshot_fim timestamptz,p_manifesto jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare lote public.nr_import_lotes;begin
 if length(trim(coalesce(p_origem,''))) not between 3 and 500 or length(coalesce(p_chave,'')) not between 8 and 200 or jsonb_typeof(p_manifesto) is distinct from 'object' or p_snapshot_fim<p_snapshot_inicio then raise exception 'Manifesto de importação inválido.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-import:'||p_org::text||':'||p_origem||':'||p_chave,0));
 select * into lote from public.nr_import_lotes where organization_id=p_org and origem=p_origem and chave=p_chave for update;
 if found then
  if lote.manifesto is distinct from p_manifesto then raise exception 'Chave de lote reutilizada com outro manifesto.' using errcode='23505';end if;return lote.id;
 end if;
 insert into public.nr_import_lotes(organization_id,origem,chave,estado,snapshot_inicio,snapshot_fim,manifesto,executor)values(p_org,p_origem,p_chave,'staging',p_snapshot_inicio,p_snapshot_fim,p_manifesto,session_user)returning * into lote;
 return lote.id;end$$;

create function public.nr_import_snapshot(p_org uuid,p_entidade text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;r jsonb;x jsonb;begin
 if p_entidade in('clientes','unidades')then tabela:=p_entidade;
 elsif p_entidade in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas')then tabela:='nr_'||p_entidade;
 else return null;end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',tabela)into r using p_org,p_id;
 if p_entidade='documentos' then select to_jsonb(v)into x from public.nr_documento_revisoes v where organization_id=p_org and id=(r->>'revisao_atual_id')::uuid;r:=r||jsonb_build_object('revisao',x);
 elsif p_entidade='levantamentos' then select coalesce(jsonb_object_agg(campo_id,valor),'{}')into x from public.nr_respostas where organization_id=p_org and levantamento_id=p_id;r:=r||jsonb_build_object('respostas',x);end if;
 return r;end$$;

create function public.nr_importar_item(p_org uuid,p_lote uuid,p_tipo text,p_externo_id text,p_payload jsonb,p_destino jsonb,p_hash text,p_capturado_em timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
<<importacao>>
declare lote public.nr_import_lotes;fonte public.nr_fontes;item public.nr_import_itens;entidade text:=p_destino->>'entidade';d jsonb:=p_destino->'registro';revisao jsonb:=p_destino->'revisao';tabela text;permitidos text[];campos text[];k text;colunas text;valores text;atribuicoes text;id_destino uuid;atual jsonb;depois jsonb;resultado text;cnpj text;ids uuid[];n integer;rv public.nr_documento_revisoes;x jsonb;campo text;valor jsonb;espaco uuid;passo text;begin
 if length(coalesce(p_tipo,'')) not between 1 and 100 or length(coalesce(p_externo_id,'')) not between 1 and 1000 or p_hash!~'^[a-f0-9]{64}$' or p_capturado_em is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(d) is distinct from 'object' or octet_length(p_payload::text)>10000000 then raise exception 'Item de staging inválido.' using errcode='23514';end if;
 if entidade not in('clientes','unidades','locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas','referencias')then raise exception 'Destino não suportado.' using errcode='23514';end if;
 select * into lote from public.nr_import_lotes where organization_id=p_org and id=p_lote;
 if not found or lote.estado in('concluido','falhou')then raise exception 'Lote indisponível para importação.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-fonte:'||p_org::text||':'||lote.origem||':'||p_tipo||':'||p_externo_id,0));
 select * into fonte from public.nr_fontes where organization_id=p_org and origem=lote.origem and tipo=p_tipo and externo_id=p_externo_id for update;
 if found then
  if fonte.destino_tipo<>entidade then raise exception 'Identidade de origem já associada a outro domínio.' using errcode='23505';end if;
  id_destino:=fonte.destino_id;atual:=public.nr_import_snapshot(p_org,entidade,id_destino);
  if fonte.sha256=p_hash then resultado:='ja_existente';
  elsif entidade<>'referencias' and atual is distinct from fonte.snapshot_destino then resultado:='conflito';end if;
 end if;
 if entidade='referencias' and resultado is null then resultado:='sem_correspondencia';id_destino:=coalesce(id_destino,gen_random_uuid());end if;
 if resultado is null then
  if entidade='clientes' then
   tabela:='clientes';permitidos:=array['razao_social','nome_exibicao','cnpj','cidade','uf','observacoes','situacao'];
   cnpj:=nullif(upper(regexp_replace(coalesce(d->>'cnpj',''),'[^A-Za-z0-9]','','g')),'');
   if id_destino is null and cnpj is not null then
    select array_agg(id) into ids from public.clientes where organization_id=p_org and identificador_normalizado=importacao.cnpj;
    if cardinality(ids)>1 then resultado:='conflito';elsif cardinality(ids)=1 then id_destino:=ids[1];resultado:='ja_existente';end if;
   end if;
  elsif entidade='unidades'then tabela:='unidades';permitidos:=array['cliente_id','nome','endereco','observacoes'];
  else tabela:='nr_'||entidade;permitidos:=array['titulo','descricao','cliente_id','unidade_id','normas','dados'];
   permitidos:=permitidos||case entidade when 'locais'then array['tag','tipo','familia','aliases','pet_espaco_id']when 'pastas'then array['parent_id']when 'documentos'then array['tipo','pasta_id','local_id','estado_origem','recebimento','origem_url','estado']when 'modelos'then array['tipo','conteudo']when 'levantamentos'then array['local_id','modelo_id','modelo_versao_id']when 'sistemas'then array['local_id','tipo']when 'pendencias'then array['local_id','documento_id','criticidade','prazo','responsavel_id','estado']end;
  end if;
  perform public.ag_payload(d,permitidos);
  if entidade='documentos' and coalesce(d->>'estado','rascunho') not in('rascunho','em_revisao','emitido_origem')then raise exception 'Importação não cria emissão Nexus.'using errcode='23514';end if;
  if entidade='pendencias' and coalesce(d->>'estado','aberta')not in('aberta','encerrada')then raise exception 'Situação da pendência inválida.'using errcode='23514';end if;
  if resultado is null then
   select array_agg(key order by key)into campos from jsonb_object_keys(d)key;
   if id_destino is null then
    id_destino:=gen_random_uuid();colunas:='id,organization_id';valores:='$2,$3';
    foreach k in array coalesce(campos,'{}')loop colunas:=colunas||','||quote_ident(k);valores:=valores||format(',(jsonb_populate_record(null::public.%I,$1)).%I',tabela,k);end loop;
    execute format('insert into public.%I(%s)select %s',tabela,colunas,valores)using d,id_destino,p_org;
   else
    if entidade='documentos'then
     select * into rv from public.nr_documento_revisoes where organization_id=p_org and id=(atual->>'revisao_atual_id')::uuid for update;
     if rv.vigencia='vigente'then update public.nr_documento_revisoes set vigencia='superada'where id=rv.id;end if;
     -- Move the pointer before updating issued logical metadata; the old snapshot is retained.
     insert into public.nr_documento_revisoes(organization_id,documento_id,numero,substitui_id,conteudo)values(p_org,id_destino,rv.numero+1,rv.id,'{"schema_version":1,"blocos":[]}')returning * into rv;
     update public.nr_documentos set revisao_atual_id=rv.id,estado='rascunho'where organization_id=p_org and id=id_destino;
    end if;
    atribuicoes:='updated_at=clock_timestamp()';foreach k in array coalesce(campos,'{}')loop atribuicoes:=atribuicoes||format(',%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,tabela,k);end loop;
    execute format('update public.%I set %s where organization_id=$2 and id=$3',tabela,atribuicoes)using d,p_org,id_destino;
   end if;
   if entidade='locais' and coalesce((p_destino->>'integrar_pet')::boolean,false)then
    if not d->'normas'@>'["NR33"]'::jsonb then raise exception 'Local exclusivamente NR35 não pode gerar espaço PET.'using errcode='23514';end if;
    select pet_espaco_id into espaco from public.nr_locais where organization_id=p_org and id=id_destino;
    if espaco is null then
     insert into public.pet_espacos(organization_id,unidade_id,identificacao,localizacao,caracteristicas,created_by,import_origem)values(p_org,(d->>'unidade_id')::uuid,left(trim(coalesce(d->>'tag','')||' '||(d->>'titulo')),200),coalesce(nullif(p_destino->>'localizacao_pet',''),nullif(d->>'descricao',''),'Localização a conferir no levantamento importado'),coalesce(d->>'descricao',''),(select created_by from public.nr_import_lotes where id=p_lote),lote.origem||':'||p_tipo||':'||p_externo_id)returning id into espaco;
     update public.nr_locais set pet_espaco_id=espaco where organization_id=p_org and id=id_destino;
    end if;
   end if;
   if entidade='documentos'then
    select * into rv from public.nr_documento_revisoes where organization_id=p_org and documento_id=id_destino order by numero desc limit 1;
    if not found then
     insert into public.nr_documento_revisoes(organization_id,documento_id,numero,conteudo)values(p_org,id_destino,coalesce((revisao->>'numero')::integer,1),coalesce(revisao->'conteudo','{"schema_version":1,"blocos":[]}'))returning * into rv;
    end if;
    update public.nr_documento_revisoes set conteudo=coalesce(revisao->'conteudo',conteudo),snapshot=coalesce(revisao->'snapshot',p_payload),sha256=p_hash,autor_historico=p_destino->>'autor_historico',data_origem=nullif(revisao->>'data_origem','')::timestamptz,estado=case d->>'estado'when 'emitido_origem'then 'emitido_origem'when 'em_revisao'then 'em_revisao'else 'rascunho'end,vigencia=coalesce(revisao->>'vigencia','vigente') where id=rv.id;
    update public.nr_documentos set revisao_atual_id=rv.id where organization_id=p_org and id=id_destino;
   elsif entidade='modelos'then
    select coalesce(max(numero),0)+1 into n from public.nr_modelo_versoes where organization_id=p_org and modelo_id=id_destino;
    insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,fonte,sha256)values(p_org,id_destino,greatest(coalesce((p_destino->>'modelo_numero')::integer,n),n),coalesce(d->'conteudo','{"schema_version":1,"blocos":[]}'),coalesce(d->'dados','{}'),coalesce(p_destino->>'modelo_fonte',lote.origem),p_hash);
   elsif entidade='pendencias' and jsonb_typeof(p_destino->'tratativas')='array'then
    for x in select value from jsonb_array_elements(p_destino->'tratativas')loop
     insert into public.nr_tratativas(organization_id,pendencia_id,tipo,texto,autor_historico,data_origem)values(p_org,id_destino,'historico_importado',x->>'texto',x->>'autor_historico',nullif(x->>'data_origem','')::timestamptz);
    end loop;
   elsif entidade='levantamentos'then
    if nullif(d->>'modelo_id','')is not null and nullif(d->>'modelo_versao_id','')is null then
     update public.nr_levantamentos set modelo_versao_id=(select id from public.nr_modelo_versoes where organization_id=p_org and modelo_id=(d->>'modelo_id')::uuid order by numero desc limit 1)where organization_id=p_org and id=id_destino;
    end if;
    if jsonb_typeof(p_destino->'respostas')='object'then
     for campo,valor in select * from jsonb_each(p_destino->'respostas')loop insert into public.nr_respostas(organization_id,levantamento_id,campo_id,valor)values(p_org,id_destino,campo,valor)on conflict(organization_id,levantamento_id,campo_id)do update set valor=excluded.valor,updated_by=null,updated_at=clock_timestamp();end loop;
    end if;
   end if;
   resultado:='importado';
  end if;
 end if;
 depois:=public.nr_import_snapshot(p_org,entidade,id_destino);
 insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,cliente_id,unidade_id,norma,pai_externo_id,caminho_original,payload,sha256,destino_tipo,destino_id,snapshot_destino,resultado,motivo,evidencia,capturado_em,executor)
 values(p_org,p_lote,lote.origem,p_tipo,p_externo_id,nullif(d->>'cliente_id','')::uuid,nullif(d->>'unidade_id','')::uuid,p_destino->>'norma',p_destino->>'pai_externo_id',p_destino->>'caminho_original',p_payload,p_hash,entidade,id_destino,depois,resultado,case resultado when 'conflito'then 'Origem e destino mudaram desde o último snapshot; decisão de conciliação necessária.'when 'sem_correspondencia'then coalesce(p_destino->>'motivo','Referência preservada sem entidade de destino.')end,coalesce(p_destino->'evidencia','{}'),p_capturado_em,session_user)
 on conflict(organization_id,lote_id,tipo,externo_id)do update set
 resultado=case when nr_import_itens.sha256=excluded.sha256 and nr_import_itens.resultado in('importado','ja_existente','duplicado_legitimo','sem_correspondencia','indisponivel')then nr_import_itens.resultado else excluded.resultado end,
 motivo=case when nr_import_itens.sha256=excluded.sha256 and nr_import_itens.resultado in('sem_correspondencia','indisponivel')then nr_import_itens.motivo else excluded.motivo end,
 updated_at=clock_timestamp()returning * into item;
 if resultado='importado' or(fonte.id is null and resultado in('ja_existente','sem_correspondencia'))then
  insert into public.nr_fontes(organization_id,origem,tipo,externo_id,destino_tipo,destino_id,payload,sha256,autor_historico,capturado_em,caminho_original,pai_externo_id,lote_id,snapshot_destino)values(p_org,lote.origem,p_tipo,p_externo_id,entidade,id_destino,p_payload,p_hash,p_destino->>'autor_historico',p_capturado_em,p_destino->>'caminho_original',p_destino->>'pai_externo_id',p_lote,depois)
  on conflict(organization_id,origem,tipo,externo_id)do update set payload=excluded.payload,sha256=excluded.sha256,capturado_em=excluded.capturado_em,lote_id=excluded.lote_id,snapshot_destino=excluded.snapshot_destino;
 end if;
 if resultado='importado'then insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,motivo,autor_historico)values(p_org,entidade,id_destino,'importar',atual,depois,'Lote '||p_lote::text||'; executor '||session_user,p_destino->>'autor_historico');end if;
 update public.nr_import_lotes set estado='importacao',checkpoint=jsonb_build_object('ultimo_item',item.id,'tipo',p_tipo,'externo_id',p_externo_id),updated_at=clock_timestamp()where id=p_lote;
 return jsonb_build_object('resultado',resultado,'destino_id',id_destino,'item_id',item.id);
 exception when check_violation or foreign_key_violation or invalid_text_representation or unique_violation then
  -- Failure is item-local: the PL/pgSQL subtransaction rolls back all destination effects.
  get stacked diagnostics passo=message_text;
  insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,payload,sha256,destino_tipo,resultado,motivo,capturado_em,executor)values(p_org,p_lote,coalesce(lote.origem,'desconhecida'),p_tipo,p_externo_id,p_payload,p_hash,entidade,'erro',passo,p_capturado_em,session_user)
  on conflict(organization_id,lote_id,tipo,externo_id)do update set resultado='erro',motivo=excluded.motivo,updated_at=clock_timestamp()returning * into item;
  return jsonb_build_object('resultado','erro','item_id',item.id,'motivo',passo);
end$$;

create function public.nr_concluir_importacao(p_org uuid,p_lote uuid)returns jsonb language plpgsql security definer set search_path='' as $$
<<conclusao_nr>>
declare resumo jsonb;pendentes bigint;begin
 perform 1 from public.nr_import_lotes where organization_id=p_org and id=p_lote for update;if not found then raise exception 'Lote indisponível.'using errcode='23514';end if;
 select coalesce(jsonb_object_agg(resultado,n),'{}')into resumo from(select resultado,count(*)n from public.nr_import_itens where organization_id=p_org and lote_id=p_lote group by resultado)q;
 select count(*)into pendentes from public.nr_import_itens where organization_id=p_org and lote_id=p_lote and resultado in('identificado','extraido','conflito','indisponivel','erro','sem_correspondencia');
 update public.nr_import_lotes set estado=case when pendentes=0 then 'concluido'else 'com_pendencias'end,resumo=conclusao_nr.resumo,updated_at=clock_timestamp()where organization_id=p_org and id=p_lote;
 return resumo;end$$;
create function public.nr_vincular_documentos_importados(p_org uuid,p_origem text,p_tipo text,p_externo_de text,p_externo_para text,p_relacao text,p_evidencia jsonb)returns void language plpgsql security definer set search_path='' as $$
declare de uuid;para uuid;begin
 if p_relacao not in('substituido_por','referencia','depende')or jsonb_typeof(p_evidencia) is distinct from 'object'or p_evidencia='{}'::jsonb then raise exception 'Relação exige evidência explícita.'using errcode='23514';end if;
 select destino_id into de from public.nr_fontes where organization_id=p_org and origem=p_origem and tipo=p_tipo and externo_id=p_externo_de and destino_tipo='documentos';
 select destino_id into para from public.nr_fontes where organization_id=p_org and origem=p_origem and tipo=p_tipo and externo_id=p_externo_para and destino_tipo='documentos';
 if de is null or para is null then raise exception 'Identidade documental de origem ainda não conciliada.'using errcode='23514';end if;
 insert into public.nr_documento_relacoes(organization_id,documento_id,documento_relacionado_id,tipo,evidencia,executor)values(p_org,de,para,p_relacao,p_evidencia,session_user)on conflict do nothing;
end$$;
revoke all on function public.nr_iniciar_importacao(uuid,text,text,timestamptz,timestamptz,jsonb),public.nr_importar_item(uuid,uuid,text,text,jsonb,jsonb,text,timestamptz),public.nr_concluir_importacao(uuid,uuid),public.nr_import_snapshot(uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_iniciar_importacao(uuid,text,text,timestamptz,timestamptz,jsonb),public.nr_importar_item(uuid,uuid,text,text,jsonb,jsonb,text,timestamptz),public.nr_concluir_importacao(uuid,uuid)to service_role;
revoke all on function public.nr_vincular_documentos_importados(uuid,text,text,text,text,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_vincular_documentos_importados(uuid,text,text,text,text,text,jsonb)to service_role;
