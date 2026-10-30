-- Histórico e revisões: listas limitadas a metadados; snapshots apenas sob demanda autorizada.
-- Contexto derivado STORED evita descompactar snapshots JSONB nas listas. Não reinterpreta seu conteúdo.
alter table public.nr_historico
 add column normas_contexto jsonb generated always as(coalesce(depois->'normas',antes->'normas','[]'::jsonb))stored,
 add column cliente_contexto text generated always as(nullif(coalesce(depois->>'cliente_id',antes->>'cliente_id'),''))stored,
 add column unidade_contexto text generated always as(nullif(coalesce(depois->>'unidade_id',antes->>'unidade_id'),''))stored;
create index nr_historico_cronologia on public.nr_historico(organization_id,created_at desc,id desc);
create index nr_historico_registro_cronologia on public.nr_historico(organization_id,recurso,registro_id,created_at desc,id desc);
create index nr_historico_normas_contexto on public.nr_historico using gin(normas_contexto jsonb_path_ops);
create index nr_historico_contexto_cronologia on public.nr_historico(organization_id,cliente_contexto,unidade_contexto,created_at desc,id desc);

-- Eventos novos herdam contexto somente de sua identidade/organização comprovadas, nunca por TAG/nome.
create function public.nr_historico_incluir_contexto()returns trigger language plpgsql security definer set search_path=''as $$declare contexto jsonb;k text;begin
 if new.recurso in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas','arquivos')and(new.depois is null or jsonb_typeof(new.depois)='object')then
  execute format('select jsonb_build_object(''normas'',normas,''cliente_id'',cliente_id,''unidade_id'',unidade_id)from public.%I where organization_id=$1 and id=$2','nr_'||new.recurso)into contexto using new.organization_id,new.registro_id;
  if contexto is not null then
   new.depois:=coalesce(new.depois,'{}'::jsonb);
   foreach k in array array['normas','cliente_id','unidade_id']loop if not(new.depois?k)then new.depois:=new.depois||jsonb_build_object(k,contexto->k);end if;end loop;
  end if;
 end if;return new;
end$$;
create trigger nr_historico_incluir_contexto before insert on public.nr_historico for each row execute function public.nr_historico_incluir_contexto();
revoke all on function public.nr_historico_incluir_contexto()from public,anon,authenticated,service_role;
-- Payloads brutos e recibos agregados mantêm a capacidade de configuração exigida pelas fontes.
drop policy nr_ler on public.nr_historico;
create policy nr_ler on public.nr_historico for select to authenticated using(public.pode(organization_id,'ver_nr')and(recurso not in('fontes','recibos_storage','import_lotes','import_itens')or public.pode(organization_id,'configurar_nr')));

create function public.nr_registro_visivel(p_org uuid,p_norma text,p_recurso text,p_registro uuid)returns boolean
language plpgsql stable security definer set search_path=''as $$declare visivel boolean;begin
 if p_norma is null or p_norma not in('NR33','NR35')or p_registro is null or p_recurso is null or p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas','arquivos')then return false;end if;
 execute format('select exists(select 1 from public.%I where organization_id=$1 and id=$2 and $3=any(normas))','nr_'||p_recurso)into visivel using p_org,p_registro,p_norma;
 return coalesce(visivel,false);
end$$;
revoke all on function public.nr_registro_visivel(uuid,text,text,uuid)from public,anon,authenticated,service_role;

create function public.nr_historico_listar(p_org uuid,p_norma text,p_recurso text,p_registro uuid,p_pagina integer default 0,p_limite integer default 25)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare linhas jsonb;total bigint;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or not public.nr_registro_visivel(p_org,p_norma,p_recurso,p_registro)then raise exception 'Registro indisponível.'using errcode='42501';end if;
 if p_pagina is null or p_limite is null or p_pagina not between 0 and 1000000 or p_limite not between 1 and 100 then raise exception 'Paginação inválida.'using errcode='23514';end if;
 select count(*)into total from public.nr_historico where organization_id=p_org and recurso=p_recurso and registro_id=p_registro;
 select coalesce(jsonb_agg(to_jsonb(q)-'ordem_id'order by q.created_at desc,q.ordem_id desc),'[]')into linhas from(
  select h.id::text id,h.id ordem_id,h.recurso,h.registro_id,h.comando,left(h.motivo,1000) motivo,coalesce(length(h.motivo)>1000,false) motivo_resumido,h.autor,left(h.autor_historico,240) autor_historico,h.created_at,h.normas_contexto normas,h.cliente_contexto cliente_id,h.unidade_contexto unidade_id
  from public.nr_historico h where h.organization_id=p_org and h.recurso=p_recurso and h.registro_id=p_registro order by h.created_at desc,h.id desc offset p_pagina::bigint*p_limite limit p_limite
 )q;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',p_pagina,'limite',p_limite);
end$$;

create function public.nr_historico_detalhe(p_org uuid,p_norma text,p_id bigint)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare h public.nr_historico;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_norma is null or p_norma not in('NR33','NR35')then raise exception 'Acesso negado.'using errcode='42501';end if;
 select * into h from public.nr_historico where organization_id=p_org and id=p_id;
 if not found or(h.recurso in('fontes','recibos_storage','import_lotes','import_itens')and not coalesce(public.pode(p_org,'configurar_nr'),false))or not(coalesce(h.normas_contexto @> to_jsonb(array[p_norma]),false)or(h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb)or public.nr_registro_visivel(p_org,p_norma,h.recurso,h.registro_id))then raise exception 'Evento indisponível.'using errcode='42501';end if;
 return(to_jsonb(h)-array['normas_contexto','cliente_contexto','unidade_contexto'])||jsonb_build_object('id',h.id::text,'escopo',case when h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb then 'nao_classificado'else 'vinculado'end);
end$$;

create function public.nr_revisoes_listar(p_org uuid,p_norma text,p_recurso text,p_registro uuid,p_pagina integer default 0,p_limite integer default 25)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare linhas jsonb;total bigint;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_recurso is null or p_recurso not in('documentos','modelos')or not public.nr_registro_visivel(p_org,p_norma,p_recurso,p_registro)then raise exception 'Registro indisponível.'using errcode='42501';end if;
 if p_pagina is null or p_limite is null or p_pagina not between 0 and 1000000 or p_limite not between 1 and 100 then raise exception 'Paginação inválida.'using errcode='23514';end if;
 if p_recurso='documentos'then
  select count(*)into total from public.nr_documento_revisoes where organization_id=p_org and documento_id=p_registro;
  select coalesce(jsonb_agg(to_jsonb(q)order by q.numero desc,q.id desc),'[]')into linhas from(select id,numero,estado,vigencia,substitui_id,sha256,autor_historico,data_origem,created_by,created_at from public.nr_documento_revisoes where organization_id=p_org and documento_id=p_registro order by numero desc,id desc offset p_pagina::bigint*p_limite limit p_limite)q;
 else
  select count(*)into total from public.nr_modelo_versoes where organization_id=p_org and modelo_id=p_registro;
  select coalesce(jsonb_agg(to_jsonb(q)order by q.numero desc,q.id desc),'[]')into linhas from(select v.id,v.numero,v.fonte,v.responsavel_id,v.sha256,v.created_by,v.created_at,exists(select 1 from public.nr_modelo_publicacao_fontes f where f.organization_id=v.organization_id and f.modelo_versao_id=v.id)publicacao_tecnica_interna from public.nr_modelo_versoes v where v.organization_id=p_org and v.modelo_id=p_registro order by v.numero desc,v.id desc offset p_pagina::bigint*p_limite limit p_limite)q;
 end if;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',p_pagina,'limite',p_limite);
end$$;

create function public.nr_revisao_detalhe(p_org uuid,p_norma text,p_recurso text,p_registro uuid,p_revisao uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare r jsonb;fontes jsonb;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_recurso is null or p_recurso not in('documentos','modelos')or not public.nr_registro_visivel(p_org,p_norma,p_recurso,p_registro)then raise exception 'Registro indisponível.'using errcode='42501';end if;
 if p_recurso='documentos'then
  select to_jsonb(v)into r from public.nr_documento_revisoes v where organization_id=p_org and documento_id=p_registro and id=p_revisao;
 else
  select to_jsonb(v)into r from public.nr_modelo_versoes v where organization_id=p_org and modelo_id=p_registro and id=p_revisao;
  select coalesce(jsonb_agg(to_jsonb(f)order by f.created_at,f.id),'[]')into fontes from public.nr_modelo_publicacao_fontes f where organization_id=p_org and modelo_id=p_registro and modelo_versao_id=p_revisao;
  if r is not null then r:=r||jsonb_build_object('fontes_publicacao',fontes);end if;
 end if;
 if r is null then raise exception 'Revisão indisponível.'using errcode='42501';end if;
 return r;
end$$;
revoke all on function public.nr_historico_listar(uuid,text,text,uuid,integer,integer),public.nr_historico_detalhe(uuid,text,bigint),public.nr_revisoes_listar(uuid,text,text,uuid,integer,integer),public.nr_revisao_detalhe(uuid,text,text,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_historico_listar(uuid,text,text,uuid,integer,integer),public.nr_historico_detalhe(uuid,text,bigint),public.nr_revisoes_listar(uuid,text,text,uuid,integer,integer),public.nr_revisao_detalhe(uuid,text,text,uuid,uuid)to authenticated;

-- A listagem de negócio e seus filtros permanecem os da0042. Somente históricos e versões mudam o payload.
create or replace function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);rid uuid:=nullif(p_filtros->>'id','')::uuid;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;busca text:=coalesce(p_filtros->>'busca','');situacao text:=nullif(p_filtros->>'estado','');lixeira boolean:=coalesce((p_filtros->>'lixeira')::boolean,false);r jsonb;extras text:='';begin
 if p_norma is null or p_norma not in('NR33','NR35') or not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 or length(busca)>300 or jsonb_typeof(p_filtros)<>'object' then raise exception 'Filtros inválidos.' using errcode='23514';end if;
 if p_recurso='contexto' then return jsonb_build_object(
  'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'razao_social',c.razao_social,'nome_exibicao',c.nome_exibicao) order by c.razao_social),'[]') from public.clientes c where c.organization_id=p_org),
  'unidades',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'cliente_id',u.cliente_id,'nome',u.nome) order by u.nome),'[]') from public.unidades u where u.organization_id=p_org),
  'permissoes',jsonb_build_object('visualizar',true,'cadastrar',public.pode(p_org,'cadastrar_nr'),'editar',public.pode(p_org,'editar_nr'),'anexar',public.pode(p_org,'anexar_nr'),'mover',public.pode(p_org,'mover_nr'),'arquivar',public.pode(p_org,'arquivar_nr'),'restaurar',public.pode(p_org,'restaurar_nr'),'revisar',public.pode(p_org,'revisar_nr'),'aprovar',false,'emitir',false,'configurar',public.pode(p_org,'configurar_nr')));end if;
 if p_recurso='painel' then return jsonb_build_object(
  'documentos_revisao_necessaria',(select count(distinct i.documento_id) from public.nr_documento_impactos i join public.nr_documentos d on d.organization_id=i.organization_id and d.id=i.documento_id where i.organization_id=p_org and p_norma=any(d.normas) and d.arquivado_em is null and(cliente is null or d.cliente_id=cliente)and(unidade is null or d.unidade_id=unidade) and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)),
  'locais',(select count(*) from public.nr_locais where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'documentos',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_abertas',(select count(*) from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'levantamentos',(select count(*) from public.nr_levantamentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'em_revisao',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_prioritarias',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,prazo,criticidade,unidade_id from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by case criticidade when 'critica' then 0 when 'alta' then 1 else 2 end,prazo nulls last,id limit 8)q),
  'documentos_revisao',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,unidade_id from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by updated_at desc,id limit 8)q));end if;
 if p_recurso='historico' then
  select count(*) into total from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and(h.normas_contexto @> to_jsonb(array[p_norma])or(h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb and cliente is null and unidade is null))and(h.recurso not in('fontes','recibos_storage','import_lotes','import_itens')or public.pode(p_org,'configurar_nr'))and(cliente is null or h.cliente_contexto is null or h.cliente_contexto=cliente::text) and(unidade is null or h.unidade_contexto is null or h.unidade_contexto=unidade::text);
  select coalesce(jsonb_agg(to_jsonb(q)order by q.created_at desc,q.ordem_id desc),'[]') into linhas from(select h.id::text id,h.id ordem_id,h.recurso,h.registro_id,h.comando,left(h.motivo,1000) motivo,coalesce(length(h.motivo)>1000,false) motivo_resumido,h.autor,left(h.autor_historico,240) autor_historico,h.created_at,h.normas_contexto normas,h.cliente_contexto cliente_id,h.unidade_contexto unidade_id,case when h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb then 'nao_classificado'else 'vinculado'end escopo from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and(h.normas_contexto @> to_jsonb(array[p_norma])or(h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb and cliente is null and unidade is null))and(h.recurso not in('fontes','recibos_storage','import_lotes','import_itens')or public.pode(p_org,'configurar_nr'))and(cliente is null or h.cliente_contexto is null or h.cliente_contexto=cliente::text) and(unidade is null or h.unidade_contexto is null or h.unidade_contexto=unidade::text)order by h.created_at desc,h.id desc offset pagina::bigint*limite limit limite)q;
  select coalesce(jsonb_agg(e.value-'ordem_id'order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
 end if;
 if p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas') then raise exception 'Recurso inválido.' using errcode='23514';end if;tabela:='nr_'||p_recurso;
 if rid is not null then
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 and $3=any(normas)',tabela) into r using p_org,rid,p_norma;
  if r is null or(cliente is not null and cliente is distinct from coalesce((r->>'cliente_id')::uuid,cliente))or(unidade is not null and unidade is distinct from coalesce((r->>'unidade_id')::uuid,unidade)) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  r:=public.nr_linha(p_recurso,r);
  linhas:=public.nr_historico_listar(p_org,p_norma,p_recurso,rid,0,25);
  r:=r||jsonb_build_object('historico',linhas->'rows','historico_total',linhas->'total','historico_pagina',0,'historico_limite',25);
  if p_recurso in('documentos','modelos')then
   linhas:=public.nr_revisoes_listar(p_org,p_norma,p_recurso,rid,0,25);
   r:=r||jsonb_build_object('revisoes',linhas->'rows','revisoes_total',linhas->'total','revisoes_pagina',0,'revisoes_limite',25);
  elsif p_recurso='pendencias' then select coalesce(jsonb_agg(to_jsonb(v) order by created_at,id),'[]') into linhas from public.nr_tratativas v where organization_id=p_org and pendencia_id=rid;r:=r||jsonb_build_object('tratativas',linhas);end if;
  return r;
 end if;
 if p_filtros?'pasta_id' and p_recurso in('pastas','documentos') then extras:=extras||format(' and to_jsonb(t)->>%L is not distinct from %L',case p_recurso when 'pastas' then 'parent_id' else 'pasta_id' end,nullif(p_filtros->>'pasta_id','')::uuid::text);end if;
 if p_filtros?'local_id' then extras:=extras||format(' and to_jsonb(t)->>''local_id''=%L',(p_filtros->>'local_id')::uuid::text);end if;
 if nullif(p_filtros->>'tipo','') is not null then extras:=extras||format(' and to_jsonb(t)->>''tipo''=%L',p_filtros->>'tipo');end if;
 execute format('select count(*) from public.%I t where organization_id=$1 and $2=any(normas) and ($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s',tabela,extras) into total using p_org,p_norma,cliente,unidade,busca,situacao,lixeira;
 execute format('select coalesce(jsonb_agg((to_jsonb(q)-array[''dados'',''conteudo''])||jsonb_build_object(''dados'',''{}''::jsonb)),''[]'') from(select t.* from public.%I t where organization_id=$1 and $2=any(normas) and($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s order by updated_at desc,id offset $8 limit $9)q',tabela,extras) into linhas using p_org,p_norma,cliente,unidade,busca,situacao,lixeira,pagina*limite,limite;
 if p_recurso='documentos' then
  with selecionados as(select e.value registro,(e.value->>'id')::uuid id,e.ordinality pos from jsonb_array_elements(linhas) with ordinality e),
  pendentes as(select i.documento_id,count(*)::integer quantidade from public.nr_documento_impactos i join selecionados s on s.id=i.documento_id where i.organization_id=p_org and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)group by i.documento_id)
  select coalesce(jsonb_agg(s.registro||jsonb_build_object('revisao_necessaria',coalesce(p.quantidade,0)>0,'impactos_pendentes',coalesce(p.quantidade,0)) order by s.pos),'[]') into linhas from selecionados s left join pendentes p on p.documento_id=s.id;
 end if;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

-- Inspeção administrativa dos lotes: resultados terminais acessíveis na interface, sem mutação.
create index nr_import_lote_cronologia on public.nr_import_lotes(organization_id,created_at desc,id desc);
create index nr_import_item_cronologia on public.nr_import_itens(organization_id,lote_id,updated_at desc,id desc);
create function public.nr_importacao_inspecionar(p_org uuid,p_lote uuid default null,p_item uuid default null,p_filtros jsonb default '{}')returns jsonb
language plpgsql stable security definer set search_path=''as $$
<<inspecao_nr>>
declare pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);resultado text:=nullif(p_filtros->>'resultado','');tipo text:=nullif(p_filtros->>'tipo','');busca text:=coalesce(p_filtros->>'busca','');cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;lote jsonb;item jsonb;linhas jsonb;total bigint;por_resultado jsonb;por_tipo jsonb;begin
 if not coalesce(public.pode(p_org,'ver_nr')and public.pode(p_org,'configurar_nr'),false)then raise exception 'Acesso negado à conciliação de importação.'using errcode='42501';end if;
 if jsonb_typeof(p_filtros)is distinct from'object'or pagina not between 0 and 1000000 or limite not between 1 and 100 or length(busca)>300 or length(coalesce(tipo,''))>100 or(resultado is not null and resultado not in('identificado','extraido','importado','ja_existente','duplicado_legitimo','conflito','indisponivel','erro','sem_correspondencia'))then raise exception 'Filtros de importação inválidos.'using errcode='23514';end if;
 perform public.ag_payload(p_filtros,array['pagina','limite','resultado','tipo','busca','cliente_id','unidade_id']);
 if p_lote is null then
  if p_item is not null then raise exception 'Informe o lote do item.'using errcode='23514';end if;
  select count(*)into total from public.nr_import_lotes where organization_id=p_org;
  select coalesce(jsonb_agg(to_jsonb(q)order by q.created_at desc,q.id desc),'[]')into linhas from(select id,origem,estado,snapshot_inicio,snapshot_fim,resumo,created_at,updated_at,executor from public.nr_import_lotes where organization_id=p_org order by created_at desc,id desc offset pagina::bigint*limite limit limite)q;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
 end if;
 select jsonb_build_object('id',l.id,'origem',l.origem,'estado',l.estado,'snapshot_inicio',l.snapshot_inicio,'snapshot_fim',l.snapshot_fim,'resumo',l.resumo,'created_at',l.created_at,'updated_at',l.updated_at,'executor',l.executor)into lote from public.nr_import_lotes l where organization_id=p_org and id=p_lote;
 if lote is null then raise exception 'Lote indisponível.'using errcode='42501';end if;
 if p_item is not null then
  select to_jsonb(i)into item from public.nr_import_itens i where organization_id=p_org and lote_id=p_lote and id=p_item;
  if item is null then raise exception 'Item indisponível.'using errcode='42501';end if;
  return jsonb_build_object('lote',lote,'item',item);
 end if;
 select count(*)into total from public.nr_import_itens i where organization_id=p_org and lote_id=p_lote and(inspecao_nr.resultado is null or i.resultado=inspecao_nr.resultado)and(inspecao_nr.tipo is null or i.tipo=inspecao_nr.tipo)and(cliente is null or i.cliente_id=cliente)and(unidade is null or i.unidade_id=unidade)and(busca=''or i.externo_id ilike '%'||busca||'%'or i.tipo ilike '%'||busca||'%'or i.caminho_original ilike '%'||busca||'%'or i.motivo ilike '%'||busca||'%');
 select coalesce(jsonb_agg(to_jsonb(q)order by q.updated_at desc,q.id desc),'[]')into linhas from(
  select i.id,i.tipo,left(i.externo_id,1000)externo_id,i.cliente_id,i.unidade_id,i.norma,i.pai_externo_id,left(i.caminho_original,1000)caminho_original,i.sha256,i.destino_tipo,i.destino_id,i.resultado,left(i.motivo,1000)motivo,coalesce(length(i.motivo)>1000,false)motivo_resumido,i.capturado_em,i.updated_at
  from public.nr_import_itens i where organization_id=p_org and lote_id=p_lote and(inspecao_nr.resultado is null or i.resultado=inspecao_nr.resultado)and(inspecao_nr.tipo is null or i.tipo=inspecao_nr.tipo)and(cliente is null or i.cliente_id=cliente)and(unidade is null or i.unidade_id=unidade)and(busca=''or i.externo_id ilike '%'||busca||'%'or i.tipo ilike '%'||busca||'%'or i.caminho_original ilike '%'||busca||'%'or i.motivo ilike '%'||busca||'%')order by i.updated_at desc,i.id desc offset pagina::bigint*limite limit limite
 )q;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.resultado),'[]')into por_resultado from(select i.resultado,count(*)::integer quantidade from public.nr_import_itens i where organization_id=p_org and lote_id=p_lote group by i.resultado)q;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.tipo,q.resultado),'[]')into por_tipo from(select i.tipo,i.resultado,count(*)::integer quantidade from public.nr_import_itens i where organization_id=p_org and lote_id=p_lote group by i.tipo,i.resultado)q;
 return jsonb_build_object('lote',lote,'rows',linhas,'total',total,'pagina',pagina,'limite',limite,'por_resultado',por_resultado,'por_tipo',por_tipo);
end$$;
revoke all on function public.nr_importacao_inspecionar(uuid,uuid,uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_importacao_inspecionar(uuid,uuid,uuid,jsonb)to authenticated;
