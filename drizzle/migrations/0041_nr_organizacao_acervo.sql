-- Modelos globais permanecem visíveis dentro do cliente/unidade selecionados.
-- Os demais recursos possuem cliente/unidade NOT NULL; seu isolamento permanece idêntico.
create or replace function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);rid uuid:=nullif(p_filtros->>'id','')::uuid;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;busca text:=coalesce(p_filtros->>'busca','');situacao text:=nullif(p_filtros->>'estado','');lixeira boolean:=coalesce((p_filtros->>'lixeira')::boolean,false);r jsonb;extras text:='';begin
 if p_norma is null or p_norma not in('NR33','NR35') or not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 or length(busca)>300 or jsonb_typeof(p_filtros)<>'object' then raise exception 'Filtros inválidos.' using errcode='23514';end if;
 if p_recurso='contexto' then return jsonb_build_object(
  'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'razao_social',c.razao_social,'nome_exibicao',c.nome_exibicao) order by c.razao_social),'[]') from public.clientes c where c.organization_id=p_org),
  'unidades',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'cliente_id',u.cliente_id,'nome',u.nome) order by u.nome),'[]') from public.unidades u where u.organization_id=p_org),
  'permissoes',jsonb_build_object('visualizar',true,'cadastrar',public.pode(p_org,'cadastrar_nr'),'editar',public.pode(p_org,'editar_nr'),'anexar',public.pode(p_org,'anexar_nr'),'mover',public.pode(p_org,'mover_nr'),'arquivar',public.pode(p_org,'arquivar_nr'),'restaurar',public.pode(p_org,'restaurar_nr'),'revisar',public.pode(p_org,'revisar_nr'),'aprovar',false,'emitir',false,'configurar',public.pode(p_org,'configurar_nr')));end if;
 if p_recurso='painel' then return jsonb_build_object(
  'locais',(select count(*) from public.nr_locais where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'documentos',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_abertas',(select count(*) from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'levantamentos',(select count(*) from public.nr_levantamentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'em_revisao',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_prioritarias',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,prazo,criticidade,unidade_id from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by case criticidade when 'critica' then 0 when 'alta' then 1 else 2 end,prazo nulls last,id limit 8)q),
  'documentos_revisao',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,unidade_id from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by updated_at desc,id limit 8)q));end if;
 if p_recurso='historico' then
  select count(*) into total from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and coalesce(h.depois->'normas',h.antes->'normas','[]'::jsonb) @> to_jsonb(array[p_norma]) and(cliente is null or nullif(coalesce(h.depois->>'cliente_id',h.antes->>'cliente_id'),'') is null or coalesce(h.depois->>'cliente_id',h.antes->>'cliente_id')=cliente::text) and(unidade is null or nullif(coalesce(h.depois->>'unidade_id',h.antes->>'unidade_id'),'') is null or coalesce(h.depois->>'unidade_id',h.antes->>'unidade_id')=unidade::text);
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into linhas from(select h.* from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and coalesce(h.depois->'normas',h.antes->'normas','[]'::jsonb) @> to_jsonb(array[p_norma]) and(cliente is null or nullif(coalesce(h.depois->>'cliente_id',h.antes->>'cliente_id'),'') is null or coalesce(h.depois->>'cliente_id',h.antes->>'cliente_id')=cliente::text) and(unidade is null or nullif(coalesce(h.depois->>'unidade_id',h.antes->>'unidade_id'),'') is null or coalesce(h.depois->>'unidade_id',h.antes->>'unidade_id')=unidade::text)order by id desc offset pagina*limite limit limite)q;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
 end if;
 if p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas') then raise exception 'Recurso inválido.' using errcode='23514';end if;tabela:='nr_'||p_recurso;
 if rid is not null then
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 and $3=any(normas)',tabela) into r using p_org,rid,p_norma;
  if r is null or(cliente is not null and cliente is distinct from coalesce((r->>'cliente_id')::uuid,cliente))or(unidade is not null and unidade is distinct from coalesce((r->>'unidade_id')::uuid,unidade)) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  r:=public.nr_linha(p_recurso,r);
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into linhas from(select * from public.nr_historico h where organization_id=p_org and registro_id=rid order by id desc limit 100)q;r:=r||jsonb_build_object('historico',linhas);
  if p_recurso='documentos' then select coalesce(jsonb_agg(to_jsonb(v) order by numero desc),'[]') into linhas from public.nr_documento_revisoes v where organization_id=p_org and documento_id=rid;r:=r||jsonb_build_object('revisoes',linhas);
  elsif p_recurso='modelos' then select coalesce(jsonb_agg(to_jsonb(v) order by numero desc),'[]') into linhas from public.nr_modelo_versoes v where organization_id=p_org and modelo_id=rid;r:=r||jsonb_build_object('revisoes',linhas);
  elsif p_recurso='pendencias' then select coalesce(jsonb_agg(to_jsonb(v) order by created_at,id),'[]') into linhas from public.nr_tratativas v where organization_id=p_org and pendencia_id=rid;r:=r||jsonb_build_object('tratativas',linhas);end if;
  return r;
 end if;
 if p_filtros?'pasta_id' and p_recurso in('pastas','documentos') then extras:=extras||format(' and to_jsonb(t)->>%L is not distinct from %L',case p_recurso when 'pastas' then 'parent_id' else 'pasta_id' end,nullif(p_filtros->>'pasta_id','')::uuid::text);end if;
 if p_filtros?'local_id' then extras:=extras||format(' and to_jsonb(t)->>''local_id''=%L',(p_filtros->>'local_id')::uuid::text);end if;
 if nullif(p_filtros->>'tipo','') is not null then extras:=extras||format(' and to_jsonb(t)->>''tipo''=%L',p_filtros->>'tipo');end if;
 execute format('select count(*) from public.%I t where organization_id=$1 and $2=any(normas) and ($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s',tabela,extras) into total using p_org,p_norma,cliente,unidade,busca,situacao,lixeira;
 execute format('select coalesce(jsonb_agg((to_jsonb(q)-array[''dados'',''conteudo''])||jsonb_build_object(''dados'',''{}''::jsonb)),''[]'') from(select t.* from public.%I t where organization_id=$1 and $2=any(normas) and($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s order by updated_at desc,id offset $8 limit $9)q',tabela,extras) into linhas using p_org,p_norma,cliente,unidade,busca,situacao,lixeira,pagina*limite,limite;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

-- O nome recebido e o caminho físico continuam imutáveis; apenas a apresentação é editável.
alter table public.nr_arquivos add column nome_exibicao text
 check(nome_exibicao is null or(length(trim(nome_exibicao)) between 1 and 500 and nome_exibicao!~E'[\\\\/\x01-\x1f]'));
create or replace function public.nr_arquivo_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Originais são retidos; use arquivamento recuperável.' using errcode='23514';end if;
 if (to_jsonb(new)-array['nome_exibicao','pasta_id','estado','bytes_verificados','verificado_em','confirmado_em','erro','version','updated_at','arquivado_em']) is distinct from (to_jsonb(old)-array['nome_exibicao','pasta_id','estado','bytes_verificados','verificado_em','confirmado_em','erro','version','updated_at','arquivado_em']) then raise exception 'Identidade e bytes do arquivo são imutáveis.' using errcode='23514';end if;
 if old.estado='vinculado' and new.estado not in('vinculado','arquivado') then raise exception 'Arquivo confirmado não pode ser sobrescrito ou desconfirmado.' using errcode='23514';end if;
 new.version:=old.version+1;new.updated_at:=clock_timestamp();return new;
end$$;

create function public.nr_arquivo_alterar(p_org uuid,p_id uuid,p_expected_version integer,p_chave uuid,p_comando text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;antes jsonb;r jsonb;destino uuid;nome_novo text;payload jsonb;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if p_comando is null or p_comando not in('renomear','mover','restaurar') or p_chave is null or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Comando inválido.' using errcode='23514';end if;
 if not public.pode(p_org,'ver_nr') or not public.pode(p_org,case p_comando when 'restaurar' then 'restaurar_nr' when 'mover' then 'mover_nr' else 'editar_nr' end) then raise exception 'Acesso negado.' using errcode='42501';end if;
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_id for update;
 if not found or not coalesce(a.bytes_verificados or a.created_by=auth.uid(),false) then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
 payload:=jsonb_build_object('id',p_id,'version',p_expected_version,'comando',p_comando,'dados',p_dados);
 r:=public.operacao_repetir(p_org,p_chave,'nr_arquivo_alterar',payload);if r is not null then return to_jsonb(a);end if;
 if p_expected_version is distinct from a.version then raise exception 'Outra pessoa alterou o arquivo. Recarregue e compare antes de salvar.' using errcode='40001';end if;
 antes:=to_jsonb(a);destino:=a.pasta_id;nome_novo:=coalesce(a.nome_exibicao,a.nome);
 if p_comando='renomear' then
  perform public.ag_payload(p_dados,array['nome_exibicao']);nome_novo:=trim(p_dados->>'nome_exibicao');
  if nome_novo is null or length(nome_novo) not between 1 and 500 or nome_novo~E'[\\\\/\x01-\x1f]' then raise exception 'Nome de exibição inválido.' using errcode='23514';end if;
 elsif p_comando='mover' then
  perform public.ag_payload(p_dados,array['pasta_id']);if not p_dados?'pasta_id' then raise exception 'Informe a pasta de destino ou a raiz.' using errcode='23514';end if;
  destino:=nullif(p_dados->>'pasta_id','')::uuid;
 else
  perform public.ag_payload(p_dados,array[]::text[]);
  if a.estado<>'arquivado' then raise exception 'Arquivo não está na lixeira.' using errcode='23514';end if;
 end if;
 perform 1 from public.unidades where organization_id=p_org and cliente_id=a.cliente_id and id=a.unidade_id and arquivado_em is null for share;
 if not found then raise exception 'Unidade indisponível.' using errcode='23514';end if;
 if destino is not null then
  perform 1 from public.nr_pastas where organization_id=p_org and cliente_id=a.cliente_id and unidade_id=a.unidade_id and id=destino and arquivado_em is null for share;
  if not found then raise exception 'Pasta indisponível ou de outro contexto.' using errcode='23514';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-arquivo-pasta:'||p_org::text||':'||a.unidade_id::text||':'||coalesce(destino::text,'raiz'),0));
 if exists(select 1 from public.nr_arquivos f where f.organization_id=p_org and f.unidade_id=a.unidade_id and f.id<>a.id and f.pasta_id is not distinct from destino and f.arquivado_em is null and lower(coalesce(f.nome_exibicao,f.nome))=lower(nome_novo)) then raise exception 'Já existe um arquivo com este nome na pasta. Escolha outro nome de exibição antes de restaurar ou mover; nenhum arquivo foi sobrescrito.' using errcode='23505';end if;
 update public.nr_arquivos set nome_exibicao=case when p_comando='renomear' then nome_novo else nome_exibicao end,pasta_id=destino,
  estado=case when p_comando='restaurar' then case when bytes_verificados then 'vinculado' else 'preparado' end else estado end,
  arquivado_em=case when p_comando='restaurar' then null else arquivado_em end,erro=case when p_comando='restaurar' then null else erro end
 where organization_id=p_org and id=p_id returning * into a;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,autor)values(p_org,'arquivos',a.id,p_comando,antes,to_jsonb(a),auth.uid());
 return public.operacao_concluir(p_org,p_chave,'nr_arquivo_alterar',payload,to_jsonb(a));
end$$;

create or replace function public.nr_conteudo_arquivos_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare bloco jsonb;c uuid;u uuid;ids text[]:='{}';begin
 if tg_table_name='nr_documento_revisoes' then select cliente_id,unidade_id into c,u from public.nr_documentos where organization_id=new.organization_id and id=new.documento_id;else c:=new.cliente_id;u:=new.unidade_id;end if;
 for bloco in select value from jsonb_array_elements(new.conteudo->'blocos') loop
  if nullif(trim(bloco->>'id'),'') is null or bloco->>'id'=any(ids) then raise exception 'Identificadores de bloco são obrigatórios e únicos.' using errcode='23514';end if;ids:=array_append(ids,bloco->>'id');
  if bloco->>'tipo' is null or bloco->>'tipo' not in('titulo','paragrafo','tabela','imagem','referencia','campo') then raise exception 'Tipo de bloco inválido.' using errcode='23514';end if;
  if bloco->>'tipo'='campo' then
   if nullif(trim(bloco->>'chave'),'') is null or bloco->>'modo' is null or bloco->>'modo' not in('vinculado','snapshot','livre') then raise exception 'Campo precisa de chave e modo explícitos.' using errcode='23514';end if;
   if bloco->>'modo'='livre' and length(trim(coalesce(bloco->>'motivo_substituicao','')))<3 then raise exception 'Substituição manual de campo técnico exige motivo.' using errcode='23514';end if;
  end if;
  if bloco->>'tipo'='imagem' then
   if bloco->>'arquivo_id' is null or not exists(select 1 from public.nr_arquivos a where a.organization_id=new.organization_id and a.id=(bloco->>'arquivo_id')::uuid and a.estado='vinculado' and a.bytes_verificados and a.mime like 'image/%' and a.cliente_id is not distinct from c and a.unidade_id is not distinct from u) then raise exception 'Imagem sem bytes verificados ou de outro contexto.' using errcode='23514';end if;
  end if;
 end loop;return new;
end$$;

create or replace function public.nr_arquivo_consumo(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bytes bigint;objetos bigint;desconhecidos bigint;unidades jsonb;modulos jsonb;begin
 if not public.pode(p_org,'configurar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0),count(*),count(*) filter(where metadata->>'size' is null or metadata->>'size'!~'^[0-9]+$') into bytes,objetos,desconhecidos
 from storage.objects where bucket_id='nexus-nr-acervo' and split_part(name,'/',1)=p_org::text;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into unidades from(
  select a.cliente_id,a.unidade_id,count(*) objetos,sum(case when o.metadata->>'size'~'^[0-9]+$' then(o.metadata->>'size')::bigint else 0 end) bytes
  from storage.objects o join public.nr_arquivos a on a.organization_id=p_org and a.caminho=o.name
  where o.bucket_id='nexus-nr-acervo' group by a.cliente_id,a.unidade_id)q;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]')into modulos from(
  select bucket_id,count(*)objetos,coalesce(sum(case when metadata->>'size'~'^[0-9]+$'then(metadata->>'size')::bigint else 0 end),0)bytes
  from storage.objects where split_part(name,'/',1)=p_org::text group by bucket_id)q;
 return jsonb_build_object('bytes_fisicos_medidos',bytes,'objetos_fisicos',objetos,'objetos_sem_tamanho',desconhecidos,'medido_em',now(),
  'escopo_medicao','bucket nexus-nr-acervo; organização ativa; inclui lixeira e derivados; cada caminho físico contado uma vez',
  'capacidade_informada','10 GB','escopo_capacidade','nao_confirmado','quota_aplicada',false,'ram_banco_informada','2 GB','ram_banco_medida',false,
  'por_unidade',unidades,'por_bucket',modulos,
  'quantidade_revisoes',(select count(*)from public.nr_documento_revisoes where organization_id=p_org),
  'uploads_em_andamento',(select count(*)from public.nr_arquivos where organization_id=p_org and estado in('preparado','verificado')),
  'falhas',(select count(*)from public.nr_arquivos where organization_id=p_org and estado='falhou'),
  'lotes_em_andamento',(select count(*)from public.nr_import_lotes where organization_id=p_org and estado not in('concluido','falhou','com_pendencias')),
  'lotes_com_pendencias',(select count(*)from public.nr_import_lotes where organization_id=p_org and estado='com_pendencias'));
end$$;
revoke all on function public.nr_arquivo_alterar(uuid,uuid,integer,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_arquivo_alterar(uuid,uuid,integer,uuid,text,jsonb)to authenticated;

-- Um objeto físico pode ter vários vínculos confirmados no mesmo contexto.
create table public.nr_arquivo_vinculos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,
 arquivo_id uuid not null,documento_id uuid,revisao_id uuid,local_id uuid,pasta_id uuid,
 origem_chave text not null check(length(origem_chave) between 1 and 1000),evidencia jsonb not null check(jsonb_typeof(evidencia)='object'),
 created_at timestamptz not null default now(),unique(organization_id,arquivo_id,origem_chave),
 foreign key(organization_id,cliente_id,unidade_id,arquivo_id) references public.nr_arquivos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,documento_id,revisao_id) references public.nr_documento_revisoes(organization_id,documento_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,pasta_id) references public.nr_pastas(organization_id,cliente_id,unidade_id,id),
 check((documento_id is null)=(revisao_id is null)),check(num_nonnulls(documento_id,local_id,pasta_id)>0)
);
alter table public.nr_arquivo_vinculos enable row level security;
revoke all on public.nr_arquivo_vinculos from public,anon,authenticated,service_role;
grant select on public.nr_arquivo_vinculos to authenticated;
create policy nr_vinculo_ler on public.nr_arquivo_vinculos for select to authenticated using(public.pode(organization_id,'ver_nr'));
create index nr_vinculo_documento on public.nr_arquivo_vinculos(organization_id,documento_id,revisao_id,arquivo_id);
create index nr_vinculo_local on public.nr_arquivo_vinculos(organization_id,local_id,arquivo_id);
create index nr_vinculo_pasta on public.nr_arquivo_vinculos(organization_id,pasta_id,arquivo_id);
create trigger nr_vinculo_imutavel before update or delete on public.nr_arquivo_vinculos for each row execute function public.pet_imutavel();
create function public.nr_arquivo_importar_vinculo(p_org uuid,p_arquivo uuid,p_chave text,p_destino jsonb,p_evidencia jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;v public.nr_arquivo_vinculos;begin
 select * into a from public.nr_arquivos where organization_id=p_org and id=p_arquivo;
 if not found or a.origem<>'importacao' or jsonb_typeof(p_destino) is distinct from 'object' or jsonb_typeof(p_evidencia) is distinct from 'object' then raise exception 'Vínculo de importação inválido.' using errcode='23514';end if;
 perform public.ag_payload(p_destino,array['documento_id','revisao_id','local_id','pasta_id']);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-vinculo:'||p_org::text||':'||p_arquivo::text||':'||p_chave,0));
 select * into v from public.nr_arquivo_vinculos where organization_id=p_org and arquivo_id=p_arquivo and origem_chave=p_chave;
 if found then
  if jsonb_build_object('documento_id',v.documento_id,'revisao_id',v.revisao_id,'local_id',v.local_id,'pasta_id',v.pasta_id) is distinct from jsonb_build_object('documento_id',nullif(p_destino->>'documento_id','')::uuid,'revisao_id',nullif(p_destino->>'revisao_id','')::uuid,'local_id',nullif(p_destino->>'local_id','')::uuid,'pasta_id',nullif(p_destino->>'pasta_id','')::uuid) or v.evidencia is distinct from p_evidencia then raise exception 'Vínculo de origem já registrado com outra decisão.' using errcode='23505';end if;return v.id;
 end if;
 insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,local_id,pasta_id,origem_chave,evidencia)
 values(p_org,a.cliente_id,a.unidade_id,a.id,nullif(p_destino->>'documento_id','')::uuid,nullif(p_destino->>'revisao_id','')::uuid,nullif(p_destino->>'local_id','')::uuid,nullif(p_destino->>'pasta_id','')::uuid,p_chave,p_evidencia)returning * into v;
 return v.id;end$$;
revoke all on function public.nr_arquivo_importar_vinculo(uuid,uuid,text,jsonb,jsonb)from public,anon,authenticated,service_role;

create or replace function public.nr_arquivo_listar(p_org uuid,p_norma text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);begin
 if not public.pode(p_org,'ver_nr') or p_norma is null or p_norma not in('NR33','NR35') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 with filtered as(select * from public.nr_arquivos a where a.organization_id=p_org and p_norma=any(a.normas)
 and (case when coalesce((p_filtros->>'lixeira')::boolean,false) then a.estado='arquivado' else (a.estado='vinculado' or (a.created_by=auth.uid() and a.estado in('preparado','falhou'))) end)
 and (nullif(p_filtros->>'cliente_id','') is null or a.cliente_id=(p_filtros->>'cliente_id')::uuid)
 and (nullif(p_filtros->>'unidade_id','') is null or a.unidade_id=(p_filtros->>'unidade_id')::uuid)
 and (nullif(p_filtros->>'pasta_id','') is null or a.pasta_id=(p_filtros->>'pasta_id')::uuid or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id and v.pasta_id=(p_filtros->>'pasta_id')::uuid))
 and (nullif(p_filtros->>'documento_id','') is null or a.documento_id=(p_filtros->>'documento_id')::uuid or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id and v.documento_id=(p_filtros->>'documento_id')::uuid))
 and (coalesce(p_filtros->>'busca','')='' or position(lower(p_filtros->>'busca') in lower(coalesce(a.nome_exibicao,a.nome)))>0)
 and (nullif(p_filtros->>'local_id','') is null or a.local_id=(p_filtros->>'local_id')::uuid or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id and v.local_id=(p_filtros->>'local_id')::uuid))),paged as(select * from filtered order by created_at desc,id offset pagina*limite limit limite)
 select (select count(*) from filtered),(select coalesce(jsonb_agg(to_jsonb(paged)),'[]') from paged) into n,rows;
 return jsonb_build_object('rows',rows,'total',n,'pagina',pagina,'limite',limite);
end$$;
