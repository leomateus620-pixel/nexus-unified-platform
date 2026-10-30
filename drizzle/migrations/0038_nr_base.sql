-- NR-33/NR-35: inventário e acervo independentes de propostas comerciais.
-- Sem dados fictícios, critérios normativos presumidos ou emissão de PET.
create or replace function public.pode(_org uuid,_acao text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_member(_org) and exists(
  select 1 from public.user_roles r where r.organization_id=_org and r.user_id=auth.uid()
  and (r.role='admin' or r.role::text=any(case _acao
   when 'editar_cadastro' then array['comercial','engenharia','compras']
   when 'importar_catalogo' then array['engenharia','compras']
   when 'criar_proposta' then array['comercial','engenharia']
   when 'editar_revisao' then array['comercial','engenharia']
   when 'aprovar_tecnica' then array['engenharia']
   when 'aceitar_comercial' then array['comercial']
   when 'planejar_suprimentos' then array['compras','engenharia']
   when 'emitir_ordem' then array['compras','engenharia']
   when 'receber' then array['compras','engenharia']
   when 'produzir' then array['compras','engenharia','campo']
   when 'ver_custos' then array['comercial','engenharia','compras','financeiro']
   when 'ver_nr' then array['engenharia','campo','compras']
   when 'cadastrar_nr' then array['engenharia']
   when 'editar_nr' then array['engenharia']
   when 'anexar_nr' then array['engenharia']
   when 'mover_nr' then array['engenharia']
   when 'arquivar_nr' then array['engenharia']
   when 'restaurar_nr' then array['engenharia']
   when 'revisar_nr' then array['engenharia']
   when 'aprovar_nr' then array['engenharia']
   when 'emitir_nr' then array['engenharia']
   when 'configurar_nr' then array['engenharia']
   else array[]::text[] end)));
$$;

create table public.nr_locais (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 cliente_id uuid not null, unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),
 titulo text not null check(length(trim(titulo)) between 2 and 240), descricao text not null default '' check(length(descricao)<=20000),
 tag text not null default '' check(length(tag)<=120), tipo text not null default 'a_classificar', familia text not null default '', aliases text[] not null default '{}',
 pet_espaco_id uuid, estado text not null default 'ativo' check(estado in('ativo','arquivado')),
 dados jsonb not null default '{}' check(jsonb_typeof(dados)='object' and octet_length(dados::text)<=2000000),
 version integer not null default 1 check(version>0), arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,cliente_id,unidade_id,id),unique(organization_id,pet_espaco_id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,unidade_id,pet_espaco_id) references public.pet_espacos(organization_id,unidade_id,id),
 check(pet_espaco_id is null or 'NR33'=any(normas))
);
create table public.nr_pastas (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), cliente_id uuid not null, unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),
 titulo text not null check(length(trim(titulo)) between 2 and 240), descricao text not null default '' check(length(descricao)<=20000),parent_id uuid,
 estado text not null default 'ativo' check(estado in('ativo','arquivado')), dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,parent_id) references public.nr_pastas(organization_id,cliente_id,unidade_id,id),check(parent_id is distinct from id)
);
create unique index nr_pasta_nome_ativo on public.nr_pastas(organization_id,unidade_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(titulo)) where arquivado_em is null;
create table public.nr_documentos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),cliente_id uuid not null,unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),
 titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null default '' check(length(descricao)<=20000),tipo text not null default 'documento',
 local_id uuid,pasta_id uuid,estado text not null default 'rascunho' check(estado in('rascunho','em_revisao','emitido_origem','arquivado')),
 estado_origem text,recebimento text not null default 'nativo' check(recebimento in('nativo','referencia','pendente','recebido','indisponivel')),
 origem_url text check(origem_url is null or (length(origem_url)<=4000 and origem_url~'^https://')),
 dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),revisao_atual_id uuid,
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,pasta_id) references public.nr_pastas(organization_id,cliente_id,unidade_id,id)
);
create table public.nr_documento_revisoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,documento_id uuid not null,numero integer not null check(numero>0),
 estado text not null default 'rascunho' check(estado in('rascunho','em_revisao','emitido_origem','emitido')),
 vigencia text not null default 'vigente' check(vigencia in('vigente','superada')),substitui_id uuid,
 conteudo jsonb not null default '{"schema_version":1,"blocos":[]}' check(jsonb_typeof(conteudo)='object' and conteudo->>'schema_version'='1' and jsonb_typeof(conteudo->'blocos')='array' and octet_length(conteudo::text)<=4000000),
 snapshot jsonb,sha256 text check(sha256 is null or sha256~'^[0-9a-f]{64}$'),autor_historico text, data_origem timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,documento_id,id),unique(documento_id,numero),
 foreign key(organization_id,documento_id) references public.nr_documentos(organization_id,id),
 foreign key(organization_id,documento_id,substitui_id) references public.nr_documento_revisoes(organization_id,documento_id,id)
);
alter table public.nr_documentos add constraint nr_doc_revisao_fk foreign key(organization_id,id,revisao_atual_id) references public.nr_documento_revisoes(organization_id,documento_id,id);
create table public.nr_modelos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),cliente_id uuid,unidade_id uuid,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null default '' check(length(descricao)<=20000),
 tipo text not null default 'documento' check(tipo in('documento','levantamento','regra','criterio','familia','configuracao')),
 estado text not null default 'rascunho' check(estado in('rascunho','em_revisao','publicado','arquivado')),dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 conteudo jsonb not null default '{"schema_version":1,"blocos":[]}' check(jsonb_typeof(conteudo)='object' and conteudo->>'schema_version'='1' and jsonb_typeof(conteudo->'blocos')='array'),
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),check(unidade_id is null or cliente_id is not null),
 foreign key(organization_id,cliente_id) references public.clientes(organization_id,id),foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id)
);
create table public.nr_modelo_versoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,modelo_id uuid not null,numero integer not null,
 conteudo jsonb not null,dados jsonb not null,fonte text,responsavel_id uuid,sha256 text not null,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,modelo_id,id),unique(modelo_id,numero),foreign key(organization_id,modelo_id) references public.nr_modelos(organization_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.nr_levantamentos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),cliente_id uuid not null,unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null default '' check(length(descricao)<=20000),
 local_id uuid,modelo_id uuid,modelo_versao_id uuid,levantamento_canonico_id uuid,
 estado text not null default 'rascunho' check(estado in('rascunho','em_revisao','arquivado')),dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,modelo_id) references public.nr_modelos(organization_id,id),foreign key(organization_id,modelo_id,modelo_versao_id) references public.nr_modelo_versoes(organization_id,modelo_id,id),
 foreign key(organization_id,levantamento_canonico_id) references public.levantamentos(organization_id,id)
);
create table public.nr_respostas (
 organization_id uuid not null,levantamento_id uuid not null,campo_id text not null check(length(campo_id) between 1 and 160),valor jsonb not null,
 existencia text,aplicabilidade text,condicao text,acao text,validacao text,
 updated_by uuid not null default auth.uid() references auth.users(id),updated_at timestamptz not null default now(),
 primary key(organization_id,levantamento_id,campo_id),foreign key(organization_id,levantamento_id) references public.nr_levantamentos(organization_id,id)
);
create table public.nr_sistemas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),cliente_id uuid not null,unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null default '' check(length(descricao)<=20000),
 local_id uuid,tipo text not null default 'a_classificar',estado text not null default 'ativo' check(estado in('ativo','arquivado')),dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
create table public.nr_pendencias (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),cliente_id uuid not null,unidade_id uuid not null,
 normas text[] not null check(cardinality(normas) between 1 and 2 and (cardinality(normas)=1 or normas[1]<>normas[2]) and normas<@array['NR33','NR35']::text[]),titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null default '' check(length(descricao)<=20000),
 local_id uuid,documento_id uuid,responsavel_id uuid,prazo date,criticidade text not null default 'a_classificar' check(criticidade in('a_classificar','baixa','media','alta','critica')),
 estado text not null default 'aberta' check(estado in('aberta','encerrada','arquivado')),dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 version integer not null default 1 check(version>0),arquivado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.nr_tratativas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pendencia_id uuid not null,tipo text not null check(tipo in('comentario','encerramento','reabertura','historico_importado')),
 texto text not null check(length(trim(texto)) between 2 and 20000),autor_historico text,data_origem timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,pendencia_id) references public.nr_pendencias(organization_id,id)
);
create table public.nr_import_lotes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),origem text not null,chave text not null,
 estado text not null default 'extracao' check(estado in('extracao','staging','validacao','correspondencia','importacao','conciliacao','concluido','com_pendencias','falhou')),
 snapshot_inicio timestamptz,snapshot_fim timestamptz,checkpoint jsonb not null default '{}',resumo jsonb not null default '{}',
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,origem,chave)
);
create table public.nr_import_itens (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,lote_id uuid not null,origem text not null,tipo text not null,externo_id text not null,
 cliente_id uuid,unidade_id uuid,norma text,pai_externo_id text,caminho_original text,payload jsonb not null,sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 destino_tipo text,destino_id uuid,snapshot_destino jsonb,resultado text not null default 'identificado' check(resultado in('identificado','extraido','importado','ja_existente','duplicado_legitimo','conflito','indisponivel','erro','sem_correspondencia')),
 motivo text,evidencia jsonb not null default '{}',capturado_em timestamptz not null,updated_at timestamptz not null default now(),
 unique(organization_id,lote_id,tipo,externo_id),foreign key(organization_id,lote_id) references public.nr_import_lotes(organization_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id)
);
create table public.nr_fontes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),origem text not null,tipo text not null,externo_id text not null,
 destino_tipo text not null,destino_id uuid not null,payload jsonb not null,sha256 text not null,autor_historico text,capturado_em timestamptz not null,
 caminho_original text,pai_externo_id text,lote_id uuid,unique(organization_id,origem,tipo,externo_id),
 foreign key(organization_id,lote_id) references public.nr_import_lotes(organization_id,id)
);
create table public.nr_historico (
 id bigint generated always as identity primary key,organization_id uuid not null references public.organizations(id),recurso text not null,registro_id uuid not null,
 comando text not null,antes jsonb,depois jsonb,motivo text,autor uuid references auth.users(id),autor_historico text,created_at timestamptz not null default now()
);

create function public.nr_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare ancestral uuid;begin
 if tg_op='DELETE' then raise exception 'Use arquivo/lixeira; exclusão física não está habilitada.' using errcode='23514';end if;
 if tg_op='UPDATE' then
  if (new.id,new.organization_id,new.created_by,new.created_at,new.cliente_id,new.unidade_id) is distinct from(old.id,old.organization_id,old.created_by,old.created_at,old.cliente_id,old.unidade_id) then raise exception 'Identidade, autoria e contexto são imutáveis.' using errcode='23514';end if;
  new.version:=old.version+1;new.updated_at:=clock_timestamp();
 end if;
 if tg_table_name='nr_pastas' then
 if new.parent_id is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-pastas:'||new.organization_id::text||':'||new.unidade_id::text,0));
  with recursive pais as(select p.id,p.parent_id from public.nr_pastas p where p.organization_id=new.organization_id and p.id=new.parent_id union select p.id,p.parent_id from public.nr_pastas p join pais x on p.id=x.parent_id where p.organization_id=new.organization_id) select id into ancestral from pais where id=new.id limit 1;
  if ancestral is not null then raise exception 'Mover criaria ciclo na árvore de pastas.' using errcode='23514';end if;
  if not exists(select 1 from public.nr_pastas where organization_id=new.organization_id and id=new.parent_id and arquivado_em is null and cliente_id=new.cliente_id and unidade_id=new.unidade_id) then raise exception 'Pasta pai indisponível ou de outro contexto.' using errcode='23514';end if;
 end if;end if;
 if tg_table_name='nr_documentos' then
 if tg_op='UPDATE' and old.estado='emitido_origem' and new.revisao_atual_id is not distinct from old.revisao_atual_id and (new.titulo,new.descricao,new.tipo,new.local_id,new.dados) is distinct from(old.titulo,old.descricao,old.tipo,old.local_id,old.dados) then raise exception 'Documento emitido exige nova revisão.' using errcode='23514';end if;end if;
 return new;end$$;
create function public.nr_revisao_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Revisões documentais são preservadas.' using errcode='23514';end if;
 if old.estado in('emitido','emitido_origem') and (to_jsonb(new)-'vigencia') is distinct from(to_jsonb(old)-'vigencia') then raise exception 'Revisão emitida é imutável; crie nova revisão.' using errcode='23514';end if;
 if old.vigencia='superada' and new is distinct from old then raise exception 'Revisão superada é imutável e não pode ser aprovada.' using errcode='23514';end if;
 return new;end$$;
create trigger nr_revisao_guard before update or delete on public.nr_documento_revisoes for each row execute function public.nr_revisao_guard();
do $$declare t text;begin
 foreach t in array array['nr_locais','nr_pastas','nr_documentos','nr_modelos','nr_levantamentos','nr_sistemas','nr_pendencias'] loop
  execute format('create trigger nr_guard before update or delete on public.%I for each row execute function public.nr_guard()',t);
  execute format('create index %I on public.%I(organization_id,cliente_id,unidade_id,estado,updated_at desc,id)',t||'_contexto',t);
  execute format('create index %I on public.%I using gin(normas)',t||'_normas',t);
  execute format('create index %I on public.%I using gin(to_tsvector(''portuguese'',titulo||'' ''||descricao))',t||'_busca',t);
 end loop;
 foreach t in array array['nr_locais','nr_pastas','nr_documentos','nr_documento_revisoes','nr_modelos','nr_modelo_versoes','nr_levantamentos','nr_respostas','nr_sistemas','nr_pendencias','nr_tratativas','nr_fontes','nr_import_lotes','nr_import_itens','nr_historico'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy nr_ler on public.%I for select to authenticated using(public.pode(organization_id,%L))',t,case when t in('nr_fontes','nr_import_lotes','nr_import_itens') then 'configurar_nr' else 'ver_nr' end);
 end loop;
 foreach t in array array['nr_modelo_versoes','nr_tratativas','nr_historico'] loop
  execute format('create trigger nr_imutavel before update or delete on public.%I for each row execute function public.pet_imutavel()',t);
 end loop;
end$$;
create index nr_doc_revisoes_pai on public.nr_documento_revisoes(organization_id,documento_id,numero desc);
create index nr_pendencias_prazo on public.nr_pendencias(organization_id,unidade_id,estado,prazo,id);
create index nr_historico_registro on public.nr_historico(organization_id,recurso,registro_id,id desc);
create index nr_import_item_resultado on public.nr_import_itens(organization_id,lote_id,resultado,id);
create index nr_fontes_destino on public.nr_fontes(organization_id,destino_tipo,destino_id);

create function public.nr_linha(p_recurso text,p_linha jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=p_linha;x jsonb;begin
 if p_recurso='documentos' then
  select to_jsonb(v) into x from public.nr_documento_revisoes v where v.organization_id=(r->>'organization_id')::uuid and v.id=(r->>'revisao_atual_id')::uuid;
  r:=r||jsonb_build_object('conteudo',x->'conteudo','revisao_numero',x->'numero','vigencia',x->'vigencia');
 elsif p_recurso='levantamentos' then
  select coalesce(jsonb_object_agg(campo_id,valor),'{}') into x from public.nr_respostas where organization_id=(r->>'organization_id')::uuid and levantamento_id=(r->>'id')::uuid;
  r:=r||jsonb_build_object('respostas',x);
  select jsonb_build_object('id',v.id,'numero',v.numero,'conteudo',v.conteudo,'dados',v.dados) into x from public.nr_modelo_versoes v where v.organization_id=(r->>'organization_id')::uuid and v.id=(r->>'modelo_versao_id')::uuid;
  r:=r||jsonb_build_object('modelo_snapshot',x);
 end if;return r;end$$;

create function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);rid uuid:=nullif(p_filtros->>'id','')::uuid;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;busca text:=coalesce(p_filtros->>'busca','');situacao text:=nullif(p_filtros->>'estado','');lixeira boolean:=coalesce((p_filtros->>'lixeira')::boolean,false);r jsonb;extras text:='';begin
 if p_norma not in('NR33','NR35') or not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
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
  'pendencias_prioritarias',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,prazo,criticidade,unidade_id from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by case criticidade when 'critica' then 0 when 'alta' then 1 else 2 end,prazo nulls last,id limit 8)q),
  'documentos_revisao',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,unidade_id from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by updated_at desc,id limit 8)q));end if;
 if p_recurso='historico' then
  select count(*) into total from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid);
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into linhas from(select h.* from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid)order by id desc offset pagina*limite limit limite)q;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
 end if;
 if p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas') then raise exception 'Recurso inválido.' using errcode='23514';end if;tabela:='nr_'||p_recurso;
 if rid is not null then
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 and $3=any(normas)',tabela) into r using p_org,rid,p_norma;
  if r is null or(cliente is not null and cliente is distinct from(r->>'cliente_id')::uuid)or(unidade is not null and unidade is distinct from(r->>'unidade_id')::uuid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
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
 execute format('select count(*) from public.%I t where organization_id=$1 and $2=any(normas) and ($3 is null or cliente_id=$3) and($4 is null or unidade_id=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s',tabela,extras) into total using p_org,p_norma,cliente,unidade,busca,situacao,lixeira;
 execute format('select coalesce(jsonb_agg((to_jsonb(q)-array[''dados'',''conteudo''])||jsonb_build_object(''dados'',''{}''::jsonb)),''[]'') from(select t.* from public.%I t where organization_id=$1 and $2=any(normas) and($3 is null or cliente_id=$3) and($4 is null or unidade_id=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s order by updated_at desc,id offset $8 limit $9)q',tabela,extras) into linhas using p_org,p_norma,cliente,unidade,busca,situacao,lixeira,pagina*limite,limite;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

create function public.nr_executar(p_org uuid,p_norma text,p_recurso text,p_comando text,p_id uuid,p_expected_version integer,p_chave text,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<comando_nr>>
declare tabela text;permitidos text[];campos text[];k text;colunas text;valores text;atribuicoes text;antes jsonb;depois jsonb;payload jsonb;r jsonb;novo uuid:=coalesce(p_id,gen_random_uuid());rv public.nr_documento_revisoes;conteudo jsonb;respostas jsonb;estado_novo text;acao text;modelo public.nr_modelos;versao_modelo uuid;begin
 if p_norma not in('NR33','NR35') or p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas') then raise exception 'Recurso/norma inválidos.' using errcode='23514';end if;
 if p_comando not in('salvar','arquivar','restaurar','nova_revisao','submeter','reabrir','encerrar','publicar') or length(coalesce(p_chave,'')) not between 8 and 200 or jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>6000000 then raise exception 'Comando inválido.' using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 acao:=case p_comando when 'arquivar' then 'arquivar_nr' when 'restaurar' then 'restaurar_nr' when 'submeter' then 'revisar_nr' when 'publicar' then 'configurar_nr' else case when p_id is null then 'cadastrar_nr' else 'editar_nr' end end;
 if not public.pode(p_org,'ver_nr') or not public.pode(p_org,acao) or(p_recurso='modelos' and not public.pode(p_org,'configurar_nr')) then raise exception 'Acesso negado.' using errcode='42501';end if;
 tabela:='nr_'||p_recurso;
 if p_recurso='pastas' then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-pastas:'||p_org::text||':'||coalesce(p_dados->>'unidade_id',''),0));end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 for update',tabela) into antes using p_org,p_id;
  if antes is null or not p_norma=any(array(select jsonb_array_elements_text(antes->'normas'))) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 end if;
 payload:=jsonb_build_object('norma',p_norma,'recurso',p_recurso,'id',p_id,'version',p_expected_version,'dados',p_dados);
 r:=public.operacao_repetir(p_org,md5('nr:'||p_chave)::uuid,'nr:'||p_recurso||':'||p_comando,payload);
 if r is not null then return public.nr_consultar(p_org,p_norma,p_recurso,jsonb_build_object('id',r->>'id'));end if;
 if p_id is not null and p_expected_version is distinct from(antes->>'version')::integer then raise exception 'Outra pessoa alterou este registro. Recarregue e compare antes de salvar.' using errcode='40001';end if;
 if p_comando<>'restaurar' and antes->>'arquivado_em' is not null then raise exception 'Registro na lixeira. Restaure antes de editar.' using errcode='23514';end if;
 if p_comando='salvar' then
  permitidos:=array['titulo','descricao','cliente_id','unidade_id','normas','dados'];
  permitidos:=permitidos||case p_recurso when 'locais' then array['tag','tipo','familia','aliases','pet_espaco_id'] when 'pastas' then array['parent_id'] when 'documentos' then array['tipo','pasta_id','local_id','estado_origem','recebimento','origem_url','conteudo'] when 'modelos' then array['tipo','conteudo'] when 'levantamentos' then array['local_id','modelo_id','respostas'] when 'sistemas' then array['local_id','tipo'] when 'pendencias' then array['local_id','documento_id','criticidade','prazo','responsavel_id','tratativa'] end;
  perform public.ag_payload(p_dados,permitidos);
  if p_id is null and(p_dados->>'titulo' is null or(p_recurso<>'modelos' and(p_dados->>'cliente_id' is null or p_dados->>'unidade_id' is null))) then raise exception 'Título, cliente e unidade são obrigatórios.' using errcode='23514';end if;
  if p_dados?'normas' and(not p_dados->'normas' @> to_jsonb(array[p_norma]) or jsonb_typeof(p_dados->'normas')<>'array') then raise exception 'Norma atual deve permanecer vinculada.' using errcode='23514';end if;
  if p_id is not null and((p_dados?'cliente_id' and p_dados->'cliente_id' is distinct from antes->'cliente_id')or(p_dados?'unidade_id' and p_dados->'unidade_id' is distinct from antes->'unidade_id')) then raise exception 'Contexto é imutável.' using errcode='23514';end if;
  if p_recurso='documentos' and p_id is not null then select * into rv from public.nr_documento_revisoes where organization_id=p_org and id=(antes->>'revisao_atual_id')::uuid for update;if rv.estado<>'rascunho' or rv.vigencia<>'vigente' then raise exception 'Revisão não editável. Crie uma nova revisão.' using errcode='23514';end if;end if;
  if p_recurso='modelos' and antes->>'estado'='publicado' then raise exception 'Modelo publicado é imutável; crie nova versão.' using errcode='23514';end if;
  if p_recurso='levantamentos' and antes->>'estado'='em_revisao' then raise exception 'Levantamento em revisão precisa ser reaberto antes de editar.' using errcode='23514';end if;
  conteudo:=p_dados->'conteudo';respostas:=p_dados->'respostas';
  if conteudo is not null and(jsonb_typeof(conteudo) is distinct from 'object' or conteudo->>'schema_version' is distinct from '1' or jsonb_typeof(conteudo->'blocos') is distinct from 'array' or octet_length(conteudo::text)>4000000) then raise exception 'Conteúdo deve conter schema_version 1 e blocos.' using errcode='23514';end if;
  if respostas is not null and(jsonb_typeof(respostas)<>'object' or octet_length(respostas::text)>2000000) then raise exception 'Respostas inválidas.' using errcode='23514';end if;
  select array_agg(key order by key) into campos from jsonb_object_keys(p_dados) key where key not in('conteudo','respostas','tratativa') or(p_recurso='modelos' and key='conteudo');
  if p_id is null then
   colunas:='id,organization_id,normas';valores:='$2,$3,ARRAY[$4]::text[]';
   foreach k in array coalesce(campos,'{}') loop
    if k='normas' then continue;end if;
    colunas:=colunas||','||quote_ident(k);valores:=valores||format(',(jsonb_populate_record(null::public.%I,$1)).%I',tabela,k);
   end loop;
   if p_dados?'normas' then valores:=replace(valores,'ARRAY[$4]::text[]','(jsonb_populate_record(null::public.'||quote_ident(tabela)||',$1)).normas');end if;
   execute format('insert into public.%I(%s)select %s returning to_jsonb(%I)',tabela,colunas,valores,tabela) into depois using p_dados,novo,p_org,p_norma;
   if p_recurso='documentos' then
    insert into public.nr_documento_revisoes(organization_id,documento_id,numero,conteudo) values(p_org,novo,1,coalesce(conteudo,'{"schema_version":1,"blocos":[]}')) returning * into rv;
    update public.nr_documentos set revisao_atual_id=rv.id where id=novo;
   end if;
  else
   atribuicoes:='updated_at=clock_timestamp()';foreach k in array coalesce(campos,'{}') loop atribuicoes:=atribuicoes||format(',%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,tabela,k);end loop;
   if p_recurso='pastas' and p_dados?'parent_id' and not public.pode(p_org,'mover_nr') then raise exception 'Sem permissão para mover.' using errcode='42501';end if;
   execute format('update public.%I set %s where organization_id=$2 and id=$3 returning to_jsonb(%I)',tabela,atribuicoes,tabela) into depois using p_dados,p_org,novo;
   if p_recurso='documentos' and conteudo is not null then update public.nr_documento_revisoes set conteudo=comando_nr.conteudo where id=rv.id;end if;
  end if;
  if p_recurso='levantamentos' then
   if p_dados?'modelo_id' and nullif(p_dados->>'modelo_id','') is not null and(p_id is null or p_dados->'modelo_id' is distinct from antes->'modelo_id') then
    select * into modelo from public.nr_modelos where organization_id=p_org and id=(p_dados->>'modelo_id')::uuid;
    if not found or modelo.arquivado_em is not null or not p_norma=any(modelo.normas) or(modelo.cliente_id is not null and modelo.cliente_id is distinct from(depois->>'cliente_id')::uuid)or(modelo.unidade_id is not null and modelo.unidade_id is distinct from(depois->>'unidade_id')::uuid) then raise exception 'Modelo incompatível com o contexto.' using errcode='23514';end if;
    select id into versao_modelo from public.nr_modelo_versoes where organization_id=p_org and modelo_id=modelo.id order by numero desc limit 1;
    if versao_modelo is null then insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,sha256)values(p_org,modelo.id,modelo.version,modelo.conteudo,modelo.dados,public.pet_sha256(jsonb_build_object('conteudo',modelo.conteudo,'dados',modelo.dados)))returning id into versao_modelo;end if;
    update public.nr_levantamentos set modelo_versao_id=versao_modelo where id=novo;
   end if;
   if respostas is not null then
    for k,r in select * from jsonb_each(respostas) loop
     insert into public.nr_respostas(organization_id,levantamento_id,campo_id,valor) values(p_org,novo,k,r) on conflict(organization_id,levantamento_id,campo_id) do update set valor=excluded.valor,updated_by=auth.uid(),updated_at=clock_timestamp();
    end loop;
   end if;
  end if;
  if p_recurso='pendencias' and length(trim(coalesce(p_dados->>'tratativa','')))>0 then insert into public.nr_tratativas(organization_id,pendencia_id,tipo,texto)values(p_org,novo,'comentario',p_dados->>'tratativa');end if;
 elsif p_comando in('arquivar','restaurar') then
  if p_id is null then raise exception 'Registro obrigatório.' using errcode='23514';end if;perform public.ag_payload(p_dados,array['motivo']);
  if length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Informe o motivo.' using errcode='23514';end if;
  execute format('update public.%I set arquivado_em=case when $3 then clock_timestamp() else null end where organization_id=$1 and id=$2',tabela) using p_org,p_id,p_comando='arquivar';
 elsif p_comando='nova_revisao' and p_recurso='documentos' then
  if p_id is null then raise exception 'Documento obrigatório.' using errcode='23514';end if;perform public.ag_payload(p_dados,array['motivo']);
  select * into rv from public.nr_documento_revisoes where organization_id=p_org and id=(antes->>'revisao_atual_id')::uuid for update;
  if rv.vigencia<>'vigente' then raise exception 'Revisão superada não pode originar alteração silenciosa.' using errcode='23514';end if;
  update public.nr_documento_revisoes set vigencia='superada' where id=rv.id;
  insert into public.nr_documento_revisoes(organization_id,documento_id,numero,substitui_id,conteudo)values(p_org,p_id,rv.numero+1,rv.id,rv.conteudo)returning * into rv;
  update public.nr_documentos set revisao_atual_id=rv.id,estado='rascunho' where id=p_id;
 elsif p_comando='nova_revisao' and p_recurso='modelos' then
  perform public.ag_payload(p_dados,array['motivo']);if p_id is null then raise exception 'Modelo obrigatório.' using errcode='23514';end if;update public.nr_modelos set estado='rascunho' where organization_id=p_org and id=p_id;
 elsif p_comando='submeter' and p_recurso in('documentos','levantamentos','modelos') then
  perform public.ag_payload(p_dados,array['motivo']);if p_id is null or antes->>'estado'<>'rascunho' then raise exception 'Somente rascunho pode ser enviado.' using errcode='23514';end if;
  execute format('update public.%I set estado=''em_revisao'' where organization_id=$1 and id=$2',tabela) using p_org,p_id;
  if p_recurso='documentos' then update public.nr_documento_revisoes set estado='em_revisao' where id=(antes->>'revisao_atual_id')::uuid and vigencia='vigente';end if;
 elsif p_comando='publicar' and p_recurso='modelos' then
  perform public.ag_payload(p_dados,array['fonte']);if p_id is null or antes->>'estado'='publicado' then raise exception 'Modelo não editável.' using errcode='23514';end if;
  if antes->>'tipo' in('regra','criterio') then raise exception 'Ativação de critério técnico depende de revisão normativa e responsável designado; fluxo ainda indisponível.' using errcode='23514';end if;
  insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,fonte,sha256)values(p_org,p_id,(select coalesce(max(numero),0)+1 from public.nr_modelo_versoes where organization_id=p_org and modelo_id=p_id),antes->'conteudo',antes->'dados',p_dados->>'fonte',public.pet_sha256(jsonb_build_object('conteudo',antes->'conteudo','dados',antes->'dados')));
  update public.nr_modelos set estado='publicado' where id=p_id;
 elsif p_comando in('encerrar','reabrir') and p_recurso='pendencias' then
  perform public.ag_payload(p_dados,array['tratativa']);if p_id is null or length(trim(coalesce(p_dados->>'tratativa','')))<3 then raise exception 'Informe a tratativa.' using errcode='23514';end if;
  estado_novo:=case p_comando when 'encerrar' then 'encerrada' else 'aberta' end;if antes->>'estado'=estado_novo then raise exception 'Pendência já está neste estado.' using errcode='23514';end if;
  update public.nr_pendencias set estado=estado_novo where id=p_id;
  insert into public.nr_tratativas(organization_id,pendencia_id,tipo,texto)values(p_org,p_id,case p_comando when 'encerrar' then 'encerramento' else 'reabertura' end,p_dados->>'tratativa');
 elsif p_comando='reabrir' and p_recurso in('documentos','levantamentos','modelos') then
  perform public.ag_payload(p_dados,array['motivo']);if p_id is null or antes->>'estado'<>'em_revisao' then raise exception 'Somente item em revisão pode ser reaberto.' using errcode='23514';end if;
  execute format('update public.%I set estado=''rascunho'' where organization_id=$1 and id=$2',tabela) using p_org,p_id;
  if p_recurso='documentos' then update public.nr_documento_revisoes set estado='rascunho' where id=(antes->>'revisao_atual_id')::uuid and vigencia='vigente';end if;
 else raise exception 'Transição indisponível para este recurso.' using errcode='23514';end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2',tabela) into depois using p_org,novo;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,motivo,autor)values(p_org,p_recurso,novo,p_comando,antes,depois,p_dados->>'motivo',auth.uid());
 perform public.operacao_concluir(p_org,md5('nr:'||p_chave)::uuid,'nr:'||p_recurso||':'||p_comando,payload,jsonb_build_object('id',novo));
 return public.nr_consultar(p_org,p_norma,p_recurso,jsonb_build_object('id',novo));
end$$;
revoke all on function public.nr_linha(text,jsonb),public.nr_guard(),public.nr_revisao_guard() from public,anon,authenticated,service_role;
revoke all on function public.nr_consultar(uuid,text,text,jsonb),public.nr_executar(uuid,text,text,text,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nr_consultar(uuid,text,text,jsonb),public.nr_executar(uuid,text,text,text,uuid,integer,text,jsonb) to authenticated;
