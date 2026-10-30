-- Acervo NR privado. Metadados nunca constituem prova de bytes: confirmação é privilegiada.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('nexus-nr-acervo','nexus-nr-acervo',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create table public.nr_arquivos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 cliente_id uuid not null,unidade_id uuid not null,normas text[] not null check(cardinality(normas) between 1 and 2 and normas<@array['NR33','NR35']::text[]),
 pasta_id uuid,documento_id uuid,revisao_id uuid,local_id uuid,lote_id uuid,
 nome text not null check(length(trim(nome)) between 1 and 500 and nome!~E'[\\\\/\x01-\x1f]'),
 mime text not null check(mime in('application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 extensao text not null check(extensao in('pdf','png','jpg','jpeg','webp','docx','xlsx')),
 tamanho bigint not null check(tamanho between 1 and 52428800),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 caminho text not null unique,estado text not null default 'preparado' check(estado in('preparado','verificado','vinculado','falhou','arquivado')),
 papel text not null default 'original' check(papel in('original','derivado','foto','anexo','representacao')),
 origem text not null default 'upload' check(origem in('upload','importacao')),origem_metadata jsonb not null default '{}' check(jsonb_typeof(origem_metadata)='object'),
 bytes_verificados boolean not null default false,verificado_em timestamptz,confirmado_em timestamptz,erro text,
 chave uuid not null,request_hash text not null,created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),arquivado_em timestamptz,
 unique(organization_id,id),unique(organization_id,cliente_id,unidade_id,id),unique(organization_id,chave),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,pasta_id) references public.nr_pastas(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,documento_id,revisao_id) references public.nr_documento_revisoes(organization_id,documento_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,lote_id) references public.nr_import_lotes(organization_id,id),
 check((documento_id is null)=(revisao_id is null)),
 check((origem='upload' and created_by is not null) or origem='importacao'),
 check(estado not in('verificado','vinculado') or (bytes_verificados and verificado_em is not null)),
 check(caminho=organization_id::text||'/acervo/'||id::text||'.'||extensao)
);
create index nr_arquivo_contexto on public.nr_arquivos(organization_id,unidade_id,estado,created_at desc,id);
create index nr_arquivo_pasta on public.nr_arquivos(organization_id,pasta_id,created_at desc,id);
create index nr_arquivo_documento on public.nr_arquivos(organization_id,documento_id,revisao_id,id);
create index nr_arquivo_local on public.nr_arquivos(organization_id,local_id,id);
create index nr_arquivo_hash on public.nr_arquivos(organization_id,sha256);
create index nr_arquivo_normas on public.nr_arquivos using gin(normas);
alter table public.nr_arquivos enable row level security;
revoke all on public.nr_arquivos from public,anon,authenticated,service_role;
grant select on public.nr_arquivos to authenticated;
create policy nr_arquivo_metadata on public.nr_arquivos for select to authenticated using(
 public.pode(organization_id,'ver_nr') and (estado in('vinculado','arquivado') or created_by=auth.uid())
);

create function public.nr_arquivo_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Originais são retidos; use arquivamento recuperável.' using errcode='23514';end if;
 if (to_jsonb(new)-array['estado','bytes_verificados','verificado_em','confirmado_em','erro','version','updated_at','arquivado_em']) is distinct from (to_jsonb(old)-array['estado','bytes_verificados','verificado_em','confirmado_em','erro','version','updated_at','arquivado_em']) then raise exception 'Identidade e bytes do arquivo são imutáveis.' using errcode='23514';end if;
 if old.estado='vinculado' and new.estado not in('vinculado','arquivado') then raise exception 'Arquivo confirmado não pode ser sobrescrito ou desconfirmado.' using errcode='23514';end if;
 new.version:=old.version+1;new.updated_at:=clock_timestamp();return new;
end$$;
create trigger nr_arquivo_guard before update or delete on public.nr_arquivos for each row execute function public.nr_arquivo_guard();

create function public.nr_arquivo_limites(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare b storage.buckets;begin
 if not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select * into b from storage.buckets where id='nexus-nr-acervo' and not public;
 if not found then raise exception 'Integração não configurada: acervo privado indisponível.' using errcode='55000';end if;
 return jsonb_build_object('bucket',b.id,'max_bytes',least(b.file_size_limit,52428800),'mime_types',b.allowed_mime_types,'extensoes',array['pdf','png','jpg','jpeg','webp','docx','xlsx']);
end$$;
create function public.nr_arquivo_destino(p_org uuid,p_id uuid,p_importacao boolean default false) returns boolean language plpgsql security definer set search_path='' as $$declare a public.nr_arquivos;v public.nr_documento_revisoes;begin
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_id;
 if not found then return false;end if;
 perform 1 from public.unidades where organization_id=p_org and cliente_id=a.cliente_id and id=a.unidade_id and arquivado_em is null for share;
 if not found then return false;end if;
 if a.pasta_id is not null then perform 1 from public.nr_pastas where organization_id=p_org and id=a.pasta_id and arquivado_em is null for share;if not found then return false;end if;end if;
 if a.local_id is not null then perform 1 from public.nr_locais where organization_id=p_org and id=a.local_id and arquivado_em is null for share;if not found then return false;end if;end if;
 if a.documento_id is not null then
  perform 1 from public.nr_documentos where organization_id=p_org and id=a.documento_id and (p_importacao or arquivado_em is null) for share;if not found then return false;end if;
  select * into v from public.nr_documento_revisoes where organization_id=p_org and documento_id=a.documento_id and id=a.revisao_id for share;
  if not found or (not p_importacao and (v.estado<>'rascunho' or v.vigencia<>'vigente')) then return false;end if;
 end if;return true;
end$$;
create function public.nr_arquivo_pode_enviar(p_org uuid,p_id uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if not public.pode(p_org,'anexar_nr') then return false;end if;
 return exists(select 1 from public.nr_arquivos where organization_id=p_org and id=p_id and created_by=auth.uid() and estado in('preparado','falhou') and origem='upload') and public.nr_arquivo_destino(p_org,p_id,false);
end$$;
create function public.nr_arquivo_ler(p_org uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pode(p_org,'ver_nr') and exists(select 1 from public.nr_arquivos where organization_id=p_org and id=p_id and estado='vinculado' and bytes_verificados);
$$;

create function public.nr_arquivo_preparar_interno(p_org uuid,p_chave uuid,p_dados jsonb,p_autor uuid,p_importacao boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;novo uuid:=gen_random_uuid();hash text:=encode(sha256(convert_to(p_dados::text,'UTF8')),'hex');ext text;mime_esperado text;revisao uuid;normas_efetivas text[];begin
 if p_chave is null or jsonb_typeof(p_dados)<>'object' then raise exception 'Metadados inválidos.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-arquivo:'||p_org::text||':'||p_chave::text,0));
 select * into a from public.nr_arquivos where organization_id=p_org and chave=p_chave for update;
 if found then
  if a.request_hash<>hash or a.created_by is distinct from p_autor or (a.origem='importacao')<>p_importacao then raise exception 'Chave reutilizada com conteúdo diferente.' using errcode='23505';end if;
  if a.estado='arquivado' then raise exception 'Envio arquivado; gere uma nova intenção de upload.' using errcode='23514';end if;
  return to_jsonb(a);
 end if;
 if exists(select 1 from jsonb_object_keys(p_dados) k where k not in('cliente_id','unidade_id','normas','pasta_id','documento_id','revisao_id','local_id','lote_id','nome','mime','tamanho','sha256','papel','origem_metadata')) then raise exception 'Campo de metadados não permitido.' using errcode='23514';end if;
 ext:=lower(regexp_replace(p_dados->>'nome','^.*\.',''));
 mime_esperado:=case ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'webp' then 'image/webp' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' else null end;
 if mime_esperado is null or p_dados->>'mime' is distinct from mime_esperado then raise exception 'MIME/extensão não suportado.' using errcode='23514';end if;
 if not exists(select 1 from storage.buckets where id='nexus-nr-acervo' and not public and (p_dados->>'tamanho')::bigint<=file_size_limit and mime_esperado=any(allowed_mime_types)) then raise exception 'Formato/tamanho não habilitado no acervo privado.' using errcode='23514';end if;
 revisao:=nullif(p_dados->>'revisao_id','')::uuid;
 normas_efetivas:=array(select jsonb_array_elements_text(p_dados->'normas'));
 if nullif(p_dados->>'documento_id','') is not null and revisao is null then select revisao_atual_id into revisao from public.nr_documentos where organization_id=p_org and id=(p_dados->>'documento_id')::uuid for share;end if;
 if nullif(p_dados->>'documento_id','') is not null then select normas into normas_efetivas from public.nr_documentos where organization_id=p_org and id=(p_dados->>'documento_id')::uuid;
 elsif nullif(p_dados->>'local_id','') is not null then select normas into normas_efetivas from public.nr_locais where organization_id=p_org and id=(p_dados->>'local_id')::uuid;
 elsif nullif(p_dados->>'pasta_id','') is not null then select normas into normas_efetivas from public.nr_pastas where organization_id=p_org and id=(p_dados->>'pasta_id')::uuid;end if;
 insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,pasta_id,documento_id,revisao_id,local_id,lote_id,nome,mime,extensao,tamanho,sha256,caminho,papel,origem,origem_metadata,chave,request_hash,created_by)
 values(novo,p_org,(p_dados->>'cliente_id')::uuid,(p_dados->>'unidade_id')::uuid,normas_efetivas,nullif(p_dados->>'pasta_id','')::uuid,nullif(p_dados->>'documento_id','')::uuid,revisao,nullif(p_dados->>'local_id','')::uuid,nullif(p_dados->>'lote_id','')::uuid,p_dados->>'nome',p_dados->>'mime',ext,(p_dados->>'tamanho')::bigint,p_dados->>'sha256',p_org::text||'/acervo/'||novo::text||'.'||ext,coalesce(p_dados->>'papel','original'),case when p_importacao then 'importacao' else 'upload' end,coalesce(p_dados->'origem_metadata','{}'),p_chave,hash,p_autor) returning * into a;
 if not public.nr_arquivo_destino(p_org,a.id,p_importacao) then raise exception 'O destino não aceita novos arquivos ou pertence a outro contexto.' using errcode='23514';end if;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor) values(p_org,'arquivos',a.id,'preparar',to_jsonb(a),p_autor);
 return to_jsonb(a);
end$$;
create function public.nr_arquivo_preparar(p_org uuid,p_chave uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_dados ? 'origem_metadata' or p_dados ? 'lote_id' then raise exception 'Proveniência de importação é reservada ao importador.' using errcode='23514';end if;
 return public.nr_arquivo_preparar_interno(p_org,p_chave,p_dados,auth.uid(),false);
end$$;
create function public.nr_arquivo_importar_preparar(p_org uuid,p_chave uuid,p_dados jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.nr_arquivo_preparar_interno(p_org,p_chave,p_dados,null,true);
$$;

create function public.nr_arquivo_confirmar_interno(p_org uuid,p_id uuid,p_sha256 text,p_tamanho bigint,p_mime text,p_autor uuid,p_importacao boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;begin
 if not p_importacao then
  perform public.lev_travar_autor(p_org,p_autor);
  if not exists(select 1 from public.memberships m join public.user_roles r on r.organization_id=m.organization_id and r.user_id=m.user_id where m.organization_id=p_org and m.user_id=p_autor and r.role::text in('admin','engenharia')) then raise exception 'Acesso revogado.' using errcode='42501';end if;
 end if;
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_id for update;
 if not found or a.created_by is distinct from p_autor or (a.origem='importacao')<>p_importacao or a.sha256 is distinct from p_sha256 or a.tamanho is distinct from p_tamanho or a.mime is distinct from p_mime then raise exception 'Arquivo indisponível ou bytes divergentes.' using errcode='42501';end if;
 if a.estado='vinculado' then return to_jsonb(a);end if;
 if a.estado='arquivado' or not public.nr_arquivo_destino(p_org,p_id,p_importacao) then raise exception 'O destino não aceita a confirmação.' using errcode='23514';end if;
 if not exists(select 1 from storage.objects where bucket_id='nexus-nr-acervo' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then raise exception 'Bytes ainda não confirmados no Storage.' using errcode='23514';end if;
 update public.nr_arquivos set estado='vinculado',bytes_verificados=true,verificado_em=now(),confirmado_em=now(),erro=null where id=a.id returning * into a;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor) values(p_org,'arquivos',a.id,'bytes_verificados',to_jsonb(a),p_autor);
 return to_jsonb(a);
end$$;
create function public.nr_arquivo_confirmar(p_org uuid,p_id uuid,p_autor uuid,p_sha256 text,p_tamanho bigint,p_mime text) returns jsonb language sql security definer set search_path='' as $$
 select public.nr_arquivo_confirmar_interno(p_org,p_id,p_sha256,p_tamanho,p_mime,p_autor,false);
$$;
create function public.nr_arquivo_importar_confirmar(p_org uuid,p_id uuid,p_sha256 text,p_tamanho bigint,p_mime text) returns jsonb language sql security definer set search_path='' as $$
 select public.nr_arquivo_confirmar_interno(p_org,p_id,p_sha256,p_tamanho,p_mime,null,true);
$$;
create function public.nr_arquivo_falhar(p_org uuid,p_id uuid,p_autor uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.lev_travar_autor(p_org,p_autor);
 if not exists(select 1 from public.memberships m join public.user_roles r on r.organization_id=m.organization_id and r.user_id=m.user_id where m.organization_id=p_org and m.user_id=p_autor and r.role::text in('admin','engenharia')) then raise exception 'Acesso revogado.' using errcode='42501';end if;
 update public.nr_arquivos set estado='falhou',erro=left(p_motivo,4000) where organization_id=p_org and id=p_id and created_by=p_autor and estado in('preparado','falhou');
end$$;
create function public.nr_arquivo_cancelar(p_org uuid,p_id uuid,p_motivo text,p_chave uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.nr_arquivos;r jsonb;payload jsonb:=jsonb_build_object('id',p_id,'motivo',p_motivo);begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'arquivar_nr') or length(trim(p_motivo)) not between 2 and 4000 or p_chave is null then raise exception 'Permissão/motivo inválido.' using errcode='42501';end if;
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_id for update;
 if not found or (a.estado<>'vinculado' and a.created_by is distinct from auth.uid()) then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
 r:=public.operacao_repetir(p_org,p_chave,'nr_arquivo_cancelar',payload);if r is not null then return to_jsonb(a);end if;
 if a.estado='vinculado' and a.revisao_id is not null and exists(select 1 from public.nr_documento_revisoes where id=a.revisao_id and (estado in('emitido','emitido_origem') or vigencia='superada')) then raise exception 'Original retido por revisão emitida/superada; arquive o documento sem apagar evidências.' using errcode='23514';end if;
 if a.estado<>'arquivado' then update public.nr_arquivos set estado='arquivado',arquivado_em=now(),erro=p_motivo where id=a.id returning * into a;insert into public.nr_historico(organization_id,recurso,registro_id,comando,motivo,depois,autor) values(p_org,'arquivos',a.id,'arquivar',p_motivo,to_jsonb(a),auth.uid());end if;return public.operacao_concluir(p_org,p_chave,'nr_arquivo_cancelar',payload,to_jsonb(a));
end$$;
create function public.nr_arquivo_listar(p_org uuid,p_norma text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);begin
 if not public.pode(p_org,'ver_nr') or p_norma not in('NR33','NR35') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 with filtered as(select * from public.nr_arquivos a where a.organization_id=p_org and p_norma=any(a.normas)
 and (a.estado='vinculado' or (a.created_by=auth.uid() and a.estado in('preparado','falhou')))
 and (nullif(p_filtros->>'cliente_id','') is null or a.cliente_id=(p_filtros->>'cliente_id')::uuid)
 and (nullif(p_filtros->>'unidade_id','') is null or a.unidade_id=(p_filtros->>'unidade_id')::uuid)
 and (nullif(p_filtros->>'pasta_id','') is null or a.pasta_id=(p_filtros->>'pasta_id')::uuid)
 and (nullif(p_filtros->>'documento_id','') is null or a.documento_id=(p_filtros->>'documento_id')::uuid)
 and (nullif(p_filtros->>'local_id','') is null or a.local_id=(p_filtros->>'local_id')::uuid)),paged as(select * from filtered order by created_at desc,id offset pagina*limite limit limite)
 select (select count(*) from filtered),(select coalesce(jsonb_agg(to_jsonb(paged)),'[]') from paged) into n,rows;
 return jsonb_build_object('rows',rows,'total',n,'pagina',pagina,'limite',limite);
end$$;
create function public.nr_arquivo_consumo(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare bytes bigint;objetos bigint;desconhecidos bigint;begin
 if not public.pode(p_org,'configurar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0),count(*),count(*) filter(where metadata->>'size' is null or metadata->>'size'!~'^[0-9]+$') into bytes,objetos,desconhecidos
 from storage.objects where bucket_id='nexus-nr-acervo' and split_part(name,'/',1)=p_org::text;
 return jsonb_build_object('bytes_fisicos_medidos',bytes,'objetos_fisicos',objetos,'objetos_sem_tamanho',desconhecidos,'medido_em',now(),'escopo_medicao','bucket nexus-nr-acervo; organização ativa','capacidade_informada','10 GB','escopo_capacidade','nao_confirmado','quota_aplicada',false,'ram_banco_informada','2 GB','ram_banco_medida',false);
end$$;

-- Toda imagem referenciada precisa de bytes conferidos no mesmo cliente/unidade.
create function public.nr_conteudo_arquivos_guard() returns trigger language plpgsql security definer set search_path='' as $$declare bloco jsonb;c uuid;u uuid;begin
 if tg_table_name='nr_documento_revisoes' then select cliente_id,unidade_id into c,u from public.nr_documentos where organization_id=new.organization_id and id=new.documento_id;else c:=new.cliente_id;u:=new.unidade_id;end if;
 for bloco in select value from jsonb_array_elements(new.conteudo->'blocos') loop
  if bloco->>'tipo'='imagem' then
   if bloco->>'arquivo_id' is null or not exists(select 1 from public.nr_arquivos a where a.organization_id=new.organization_id and a.id=(bloco->>'arquivo_id')::uuid and a.estado='vinculado' and a.bytes_verificados and a.mime like 'image/%' and a.cliente_id is not distinct from c and a.unidade_id is not distinct from u) then raise exception 'Imagem sem bytes verificados ou de outro contexto.' using errcode='23514';end if;
  end if;
 end loop;return new;
end$$;
create trigger nr_conteudo_arquivos before insert or update of conteudo on public.nr_documento_revisoes for each row execute function public.nr_conteudo_arquivos_guard();
create trigger nr_modelo_arquivos before insert or update of conteudo on public.nr_modelos for each row execute function public.nr_conteudo_arquivos_guard();

create policy nr_arquivo_upload on storage.objects for insert to authenticated with check(bucket_id='nexus-nr-acervo' and exists(select 1 from public.nr_arquivos a where a.caminho=name and public.nr_arquivo_pode_enviar(a.organization_id,a.id)));
create policy nr_arquivo_download on storage.objects for select to authenticated using(bucket_id='nexus-nr-acervo' and exists(select 1 from public.nr_arquivos a where a.caminho=name and public.nr_arquivo_ler(a.organization_id,a.id)));
-- Sem UPDATE/DELETE de objetos para sessões; serviço não recebe funções de importação.
revoke all on function public.nr_arquivo_guard(),public.nr_arquivo_limites(uuid),public.nr_arquivo_destino(uuid,uuid,boolean),public.nr_arquivo_pode_enviar(uuid,uuid),public.nr_arquivo_ler(uuid,uuid),public.nr_arquivo_preparar_interno(uuid,uuid,jsonb,uuid,boolean),public.nr_arquivo_preparar(uuid,uuid,jsonb),public.nr_arquivo_importar_preparar(uuid,uuid,jsonb),public.nr_arquivo_confirmar_interno(uuid,uuid,text,bigint,text,uuid,boolean),public.nr_arquivo_confirmar(uuid,uuid,uuid,text,bigint,text),public.nr_arquivo_importar_confirmar(uuid,uuid,text,bigint,text),public.nr_arquivo_falhar(uuid,uuid,uuid,text),public.nr_arquivo_cancelar(uuid,uuid,text,uuid),public.nr_arquivo_listar(uuid,text,jsonb),public.nr_arquivo_consumo(uuid),public.nr_conteudo_arquivos_guard() from public,anon,authenticated,service_role;
grant execute on function public.nr_arquivo_limites(uuid),public.nr_arquivo_pode_enviar(uuid,uuid),public.nr_arquivo_ler(uuid,uuid),public.nr_arquivo_preparar(uuid,uuid,jsonb),public.nr_arquivo_cancelar(uuid,uuid,text,uuid),public.nr_arquivo_listar(uuid,text,jsonb),public.nr_arquivo_consumo(uuid) to authenticated;
grant execute on function public.nr_arquivo_confirmar(uuid,uuid,uuid,text,bigint,text),public.nr_arquivo_falhar(uuid,uuid,uuid,text) to service_role;
