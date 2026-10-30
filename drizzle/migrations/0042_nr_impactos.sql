-- Impactos explícitos de alterações da base em documentos. Nenhum snapshot emitido é regenerado.
create table public.nr_documento_impactos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 cliente_id uuid not null, unidade_id uuid not null, documento_id uuid not null, revisao_origem_id uuid not null, local_id uuid not null,
 base_version_anterior integer not null check(base_version_anterior>0), base_version_nova integer not null check(base_version_nova>base_version_anterior),
 campos_alterados text[] not null check(cardinality(campos_alterados)>0), alteracoes jsonb not null check(jsonb_typeof(alteracoes)='object'),
 autor uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,documento_id,id), unique(organization_id,documento_id,local_id,base_version_nova),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,documento_id,revisao_origem_id) references public.nr_documento_revisoes(organization_id,documento_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
create table public.nr_documento_impacto_revisoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, documento_id uuid not null, impacto_id uuid not null,
 revisao_destino_id uuid not null, base_version_conferida integer not null check(base_version_conferida>0),
 revisao_sha256 text not null check(revisao_sha256~'^[a-f0-9]{64}$'), motivo text not null check(length(trim(motivo)) between 3 and 4000),
 responsavel_id uuid not null, autor uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,impacto_id),
 foreign key(organization_id,documento_id,impacto_id) references public.nr_documento_impactos(organization_id,documento_id,id),
 foreign key(organization_id,documento_id,revisao_destino_id) references public.nr_documento_revisoes(organization_id,documento_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create index nr_impactos_documento on public.nr_documento_impactos(organization_id,documento_id,created_at desc,id);
create index nr_impactos_local on public.nr_documento_impactos(organization_id,local_id,base_version_nova,documento_id);
create index nr_impactos_contexto on public.nr_documento_impactos(organization_id,cliente_id,unidade_id,created_at desc);
create index nr_impacto_revisoes_documento on public.nr_documento_impacto_revisoes(organization_id,documento_id,revisao_destino_id);
do $$declare t text;begin
 foreach t in array array['nr_documento_impactos','nr_documento_impacto_revisoes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy nr_impactos_ler on public.%I for select to authenticated using(public.pode(organization_id,''ver_nr''))',t);
  execute format('create trigger nr_impactos_imutavel before update or delete on public.%I for each row execute function public.pet_imutavel()',t);
 end loop;
end$$;

create function public.nr_registrar_impactos_local() returns trigger language plpgsql security definer set search_path='' as $$
declare campos text[];alteracoes jsonb;doc record;begin
 select array_agg(chave order by chave),jsonb_object_agg(chave,jsonb_build_object('anterior',to_jsonb(old)->chave,'novo',to_jsonb(new)->chave)) into campos,alteracoes
 from unnest(array['titulo','descricao','tag','tipo','familia','aliases','normas','pet_espaco_id','dados'])chave where to_jsonb(old)->chave is distinct from to_jsonb(new)->chave;
 if campos is null then return new;end if;
 -- A ordem local -> documento também é respeitada pelo comando de conferência.
 for doc in select d.id,d.revisao_atual_id from public.nr_documentos d where d.organization_id=new.organization_id and d.cliente_id=new.cliente_id and d.unidade_id=new.unidade_id and d.local_id=new.id and d.revisao_atual_id is not null order by d.id for share loop
  insert into public.nr_documento_impactos(organization_id,cliente_id,unidade_id,documento_id,revisao_origem_id,local_id,base_version_anterior,base_version_nova,campos_alterados,alteracoes,autor)
  values(new.organization_id,new.cliente_id,new.unidade_id,doc.id,doc.revisao_atual_id,new.id,old.version,new.version,campos,alteracoes,auth.uid());
 end loop;
 return new;
end$$;
create trigger nr_local_impactos after update on public.nr_locais for each row execute function public.nr_registrar_impactos_local();

create or replace function public.nr_linha(p_recurso text,p_linha jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:=p_linha;x jsonb;pendentes integer;prof uuid;begin
 if p_recurso='documentos' then
  select to_jsonb(v) into x from public.nr_documento_revisoes v where v.organization_id=(r->>'organization_id')::uuid and v.id=(r->>'revisao_atual_id')::uuid;
  r:=r||jsonb_build_object('conteudo',x->'conteudo','revisao_numero',x->'numero','vigencia',x->'vigencia');
  select count(*) into pendentes from public.nr_documento_impactos i where i.organization_id=(r->>'organization_id')::uuid and i.documento_id=(r->>'id')::uuid and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into x from(
   select i.id,i.revisao_origem_id,i.local_id,i.base_version_anterior,i.base_version_nova,i.campos_alterados,i.alteracoes,i.created_at,
    case when c.id is null then 'pendente' else 'revisado' end estado,c.revisao_destino_id,c.responsavel_id,c.motivo,c.created_at revisado_em
   from public.nr_documento_impactos i left join public.nr_documento_impacto_revisoes c on c.organization_id=i.organization_id and c.impacto_id=i.id
   where i.organization_id=(r->>'organization_id')::uuid and i.documento_id=(r->>'id')::uuid order by i.created_at desc,i.id limit 100
  )q;
  prof:=public.lev_profissional((r->>'organization_id')::uuid);
  r:=r||jsonb_build_object('impactos',x,'impactos_pendentes',pendentes,'revisao_necessaria',pendentes>0,
   'base_version_atual',(select version from public.nr_locais where organization_id=(r->>'organization_id')::uuid and id=(r->>'local_id')::uuid),
   'pode_revisar_impactos',public.pode((r->>'organization_id')::uuid,'revisar_nr') and public.pode((r->>'organization_id')::uuid,'editar_nr') and prof is not null,
   'bloqueio_revisao_impactos',case when not public.pode((r->>'organization_id')::uuid,'revisar_nr') then 'Seu papel não permite registrar a revisão técnica de impactos.' when prof is null then 'A conferência exige pessoa ativa vinculada ao usuário, com registro profissional e permissão de revisão operacional.' else null end);
 elsif p_recurso='levantamentos' then
  select coalesce(jsonb_object_agg(campo_id,valor),'{}') into x from public.nr_respostas where organization_id=(r->>'organization_id')::uuid and levantamento_id=(r->>'id')::uuid;
  r:=r||jsonb_build_object('respostas',x);
  select jsonb_build_object('id',v.id,'numero',v.numero,'conteudo',v.conteudo,'dados',v.dados) into x from public.nr_modelo_versoes v where v.organization_id=(r->>'organization_id')::uuid and v.id=(r->>'modelo_versao_id')::uuid;
  r:=r||jsonb_build_object('modelo_snapshot',x);
 end if;return r;
end$$;

create function public.nr_documento_revisar_impactos(p_org uuid,p_norma text,p_documento uuid,p_revisao uuid,p_expected_version integer,p_base_expected_version integer,p_chave uuid,p_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare doc public.nr_documentos;local public.nr_locais;rev public.nr_documento_revisoes;prof uuid;r jsonb;payload jsonb;ids uuid[];quantidade integer;digest text;begin
 if p_norma not in('NR33','NR35') or p_chave is null or length(trim(coalesce(p_motivo,''))) not between 3 and 4000 then raise exception 'Informe norma, chave e motivo da conferência.' using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'ver_nr') or not public.pode(p_org,'revisar_nr') or not public.pode(p_org,'editar_nr') then raise exception 'Acesso negado para revisão de impactos.' using errcode='42501';end if;
 prof:=public.lev_profissional(p_org);if prof is null then raise exception 'Conferência exige profissional ativo vinculado ao usuário com registro profissional e permissão de revisão.' using errcode='42501';end if;
 select * into doc from public.nr_documentos where organization_id=p_org and id=p_documento and p_norma=any(normas);
 if not found or doc.local_id is null then raise exception 'Documento ou vínculo local indisponível.' using errcode='42501';end if;
 select * into local from public.nr_locais where organization_id=p_org and cliente_id=doc.cliente_id and unidade_id=doc.unidade_id and id=doc.local_id for update;
 if not found or local.arquivado_em is not null then raise exception 'Base local indisponível para conferência.' using errcode='42501';end if;
 select * into doc from public.nr_documentos where organization_id=p_org and id=p_documento and local_id=local.id and p_norma=any(normas) for update;
 if not found or doc.arquivado_em is not null then raise exception 'Documento indisponível para conferência.' using errcode='42501';end if;
 payload:=jsonb_build_object('documento_id',p_documento,'norma',p_norma,'revisao_id',p_revisao,'expected_version',p_expected_version,'base_expected_version',p_base_expected_version,'motivo',p_motivo);
 r:=public.operacao_repetir(p_org,p_chave,'nr_documento_revisar_impactos',payload);
 if r is not null then return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'documentos',jsonb_build_object('id',p_documento)),'impactos_revisados',r->'impactos_revisados','revisao_conferida_id',r->'revisao_conferida_id');end if;
 if doc.version is distinct from p_expected_version or local.version is distinct from p_base_expected_version then raise exception 'Documento ou base técnica mudou. Recarregue e compare antes de registrar a conferência.' using errcode='40001';end if;
 if doc.revisao_atual_id is distinct from p_revisao then raise exception 'A conferência exige a revisão atual do documento.' using errcode='40001';end if;
 select * into rev from public.nr_documento_revisoes where organization_id=p_org and documento_id=p_documento and id=p_revisao for update;
 if not found or rev.estado<>'rascunho' or rev.vigencia<>'vigente' then raise exception 'Crie uma nova revisão em rascunho para tratar os impactos. Revisões emitidas e superadas permanecem imutáveis.' using errcode='23514';end if;
 select array_agg(i.id order by i.id) into ids from public.nr_documento_impactos i where i.organization_id=p_org and i.documento_id=p_documento and i.local_id=local.id and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id);
 if ids is null then raise exception 'Não há impactos pendentes para esta base vinculada.' using errcode='23514';end if;
 if exists(select 1 from public.nr_documento_impactos i where i.organization_id=p_org and i.id=any(ids) and i.revisao_origem_id=p_revisao) then raise exception 'A base mudou durante esta revisão. Crie nova revisão antes de registrar a conferência.' using errcode='23514';end if;
 digest:=public.pet_sha256(jsonb_build_object('documento_id',doc.id,'revisao_id',rev.id,'conteudo',rev.conteudo,'local_id',local.id,'base_version',local.version));
 insert into public.nr_documento_impacto_revisoes(organization_id,documento_id,impacto_id,revisao_destino_id,base_version_conferida,revisao_sha256,motivo,responsavel_id,autor)
 select p_org,p_documento,impacto,rev.id,local.version,digest,p_motivo,prof,auth.uid() from unnest(ids)impacto;
 get diagnostics quantidade=row_count;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,motivo,depois,autor)values(p_org,'documentos',p_documento,'revisar_impactos',p_motivo,jsonb_build_object('impactos',ids,'revisao_id',rev.id,'base_version',local.version,'sha256',digest,'responsavel_id',prof),auth.uid());
 r:=jsonb_build_object('impactos_revisados',quantidade,'revisao_conferida_id',rev.id);
 perform public.operacao_concluir(p_org,p_chave,'nr_documento_revisar_impactos',payload,r);
 return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'documentos',jsonb_build_object('id',p_documento)))||r;
end$$;
revoke all on function public.nr_registrar_impactos_local(),public.nr_documento_revisar_impactos(uuid,text,uuid,uuid,integer,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nr_documento_revisar_impactos(uuid,text,uuid,uuid,integer,integer,uuid,text) to authenticated;

-- Consulta preserva integralmente os escopos e filtros da migração 0041.
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
 if p_recurso='documentos' then
  with selecionados as(select e.value registro,(e.value->>'id')::uuid id,e.ordinality pos from jsonb_array_elements(linhas) with ordinality e),
  pendentes as(select i.documento_id,count(*)::integer quantidade from public.nr_documento_impactos i join selecionados s on s.id=i.documento_id where i.organization_id=p_org and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)group by i.documento_id)
  select coalesce(jsonb_agg(s.registro||jsonb_build_object('revisao_necessaria',coalesce(p.quantidade,0)>0,'impactos_pendentes',coalesce(p.quantidade,0)) order by s.pos),'[]') into linhas from selecionados s left join pendentes p on p.documento_id=s.id;
 end if;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

-- Impede que uma troca de vínculo torne pendências de impacto inacessíveis à conferência.
create function public.nr_impacto_vinculo_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.local_id is distinct from old.local_id and exists(select 1 from public.nr_documento_impactos i where i.organization_id=old.organization_id and i.documento_id=old.id and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)) then raise exception 'Conclua a conferência dos impactos em nova revisão antes de substituir o vínculo local.' using errcode='23514';end if;
 return new;
end$$;
create trigger nr_impacto_vinculo before update of local_id on public.nr_documentos for each row execute function public.nr_impacto_vinculo_guard();
revoke all on function public.nr_impacto_vinculo_guard() from public,anon,authenticated,service_role;
