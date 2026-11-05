-- Catálogo v2: contratação não é aprovação técnica nem apaga acervo anterior.
create table public.nr_catalogo_documental (
 codigo text primary key, titulo text not null unique, escopo text not null check(escopo in('local','unidade')),
 normas text[] not null, blocos text[] not null, obrigatorio boolean not null default false, ordem integer not null unique
);
insert into public.nr_catalogo_documental values
 ('cadastro_ec','Cadastro de EC','local',array['NR33'],array['B05','B06','B10','B11','B12','B13'],false,1),
 ('procedimento','Procedimento específico','local',array['NR33'],array['B05','B06','B10','B11','B12','B13'],false,2),
 ('memorial','Memorial de Cálculo','local',array['NR33'],array[]::text[],true,3),
 ('analise_risco','Análise de Risco','local',array['NR33','NR35'],array['B06','B10','B13'],false,4),
 ('pet','PET','local',array['NR33'],array['B05','B06','B10','B11','B13'],false,5),
 ('pendencias','Lista de pendências','local',array['NR33','NR35'],array['B14'],false,6),
 ('anexo_pprec','Anexo PPREC','local',array['NR33'],array['B06','B11','B12'],false,7),
 ('anexo_pgssta','Anexo PGSSTA','local',array['NR35'],array['B14','B16'],false,8),
 ('pprec','PPREC','unidade',array['NR33'],array['B05','B06','B10','B11','B12','B13'],false,9),
 ('pgssta','PGSSTA','unidade',array['NR35'],array['B14','B16'],false,10),
 ('pae','PAE','unidade',array['NR33','NR35'],array['B11','B12'],false,11),
 ('pta','PTA','unidade',array['NR35'],array['B16'],false,12),
 ('ventilacao_fixa','Laudo de ventilação fixa','unidade',array['NR33'],array['B09'],false,13);
create table public.nr_contratacoes (
 organization_id uuid not null, cliente_id uuid not null, unidade_id uuid not null,
 documentos text[] not null, version integer not null check(version>0), fonte text not null check(length(trim(fonte))between 10 and 4000),
 responsavel_id uuid not null, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,unidade_id),
 foreign key(organization_id,cliente_id,unidade_id)references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,responsavel_id)references public.pessoas(organization_id,id),
 check(documentos@>array['memorial'] and cardinality(documentos)between 1 and 13)
);
create table public.nr_contratacao_eventos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, unidade_id uuid not null,
 version integer not null, antes jsonb, depois jsonb not null, autor uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,unidade_id,version),foreign key(organization_id,unidade_id)references public.nr_contratacoes(organization_id,unidade_id)
);
alter table public.nr_catalogo_documental enable row level security;
alter table public.nr_contratacoes enable row level security;
alter table public.nr_contratacao_eventos enable row level security;
revoke all on public.nr_catalogo_documental,public.nr_contratacoes,public.nr_contratacao_eventos from public,anon,authenticated,service_role;

create function public.nr_contratacao_rt(p_org uuid)returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.pessoas p join public.pet_responsaveis_tecnicos t on t.organization_id=p.organization_id and t.pessoa_id=p.id
 where p.organization_id=p_org and p.user_id=auth.uid() and p.ativa and length(trim(coalesce(p.registro_profissional,'')))>=3
 and t.inicio<=now()and(t.fim is null or t.fim>now())and public.pode(p_org,'configurar_nr')and public.pode(p_org,'revisar_nr') limit 1
$$;
create function public.nr_contratacao_obter(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.nr_contratacoes;prof uuid;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma)then raise exception 'Unidade indisponível.'using errcode='42501';end if;
 select * into c from public.nr_contratacoes where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade;
 prof:=public.nr_contratacao_rt(p_org);
 return jsonb_build_object('confirmada',c.version is not null,'version',coalesce(c.version,0),'documentos',coalesce(c.documentos,array['memorial']),
 'fonte',c.fonte,'updated_at',c.updated_at,'pode_alterar',prof is not null,
 'bloqueio',case when prof is null then 'A seleção exige responsável técnico formalmente designado, com registro profissional e permissões de configuração e revisão, em sua própria sessão.'else null end,
 'responsavel',(select jsonb_build_object('id',id,'nome',nome,'registro_profissional',registro_profissional)from public.pessoas where organization_id=p_org and id=coalesce(prof,c.responsavel_id)),
 'catalogo',(select jsonb_agg(to_jsonb(d)order by ordem)from public.nr_catalogo_documental d),
 'blocos',case when c.version is null then to_jsonb(array['B01','B02','B03','B04','B07','B08','B15'])else(select jsonb_agg(x order by x)from(select distinct unnest(array['B01','B02','B03','B04','B07','B08','B15']||d.blocos)x from public.nr_catalogo_documental d where d.codigo=any(c.documentos))b)end,
 'historico',coalesce((select jsonb_agg(to_jsonb(e)order by version desc)from(select version,depois->>'fonte'fonte,depois->'documentos'documentos,created_at from public.nr_contratacao_eventos where organization_id=p_org and unidade_id=p_unidade order by version desc limit 20)e),'[]'));
end$$;
create function public.nr_contratacao_salvar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_expected_version integer,p_chave uuid,p_documentos text[],p_fonte text)returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.nr_contratacoes;n public.nr_contratacoes;prof uuid;r jsonb;payload jsonb;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma)then raise exception 'Unidade indisponível.'using errcode='42501';end if;
 prof:=public.nr_contratacao_rt(p_org);if prof is null then raise exception 'Alteração exclusiva do responsável técnico designado.'using errcode='42501';end if;
 if p_chave is null or p_expected_version is null or p_expected_version<0 or p_documentos is null or not p_documentos@>array['memorial'] or cardinality(p_documentos)not between 1 and 13 or length(trim(coalesce(p_fonte,'')))not between 10 and 4000 or exists(select 1 from unnest(p_documentos)d where d is null or not exists(select 1 from public.nr_catalogo_documental cat where cat.codigo=d))or cardinality(p_documentos)<>(select count(distinct x)from unnest(p_documentos)x)then raise exception 'Selecione os documentos do catálogo, mantenha o Memorial e informe a referência da contratação.'using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-contratacao:'||p_org||':'||p_unidade,0));
 payload:=jsonb_build_object('cliente',p_cliente,'unidade',p_unidade,'version',p_expected_version,'documentos',p_documentos,'fonte',p_fonte);
 r:=public.operacao_repetir(p_org,p_chave,'nr_contratacao_salvar',payload);if r is not null then return public.nr_contratacao_obter(p_org,p_cliente,p_unidade,p_norma);end if;
 select * into c from public.nr_contratacoes where organization_id=p_org and unidade_id=p_unidade for update;
 if coalesce(c.version,0)<>p_expected_version then raise exception 'Contratação alterada por outra pessoa. Compare as versões.'using errcode='40001';end if;
 insert into public.nr_contratacoes(organization_id,cliente_id,unidade_id,documentos,version,fonte,responsavel_id,updated_by)
 values(p_org,p_cliente,p_unidade,p_documentos,p_expected_version+1,trim(p_fonte),prof,auth.uid())
 on conflict(organization_id,unidade_id)do update set documentos=excluded.documentos,version=excluded.version,fonte=excluded.fonte,responsavel_id=excluded.responsavel_id,updated_by=excluded.updated_by,updated_at=clock_timestamp()returning * into n;
 insert into public.nr_contratacao_eventos(organization_id,unidade_id,version,antes,depois,autor)values(p_org,p_unidade,n.version,case when c.version is null then null else to_jsonb(c)end,to_jsonb(n),auth.uid());
 perform public.operacao_concluir(p_org,p_chave,'nr_contratacao_salvar',payload,jsonb_build_object('version',n.version));
 return public.nr_contratacao_obter(p_org,p_cliente,p_unidade,p_norma);
end$$;
create function public.nr_documento_exigir_contrato(p_org uuid,p_cliente uuid,p_unidade uuid,p_tipo text)returns void language plpgsql security definer set search_path='' as $$
declare cod text;begin
 select codigo into cod from public.nr_catalogo_documental where lower(titulo)=lower(trim(p_tipo))or codigo=p_tipo;
 if cod is null then raise exception 'Classifique o documento no catálogo contratado antes de gerar.'using errcode='23514';end if;
 -- Memorial e levantamento/cálculo permanecem essenciais mesmo sem contratação opcional.
 if cod='memorial'then return;end if;
 if not exists(select 1 from public.nr_contratacoes where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and cod=any(documentos))then
 raise exception 'Documento não contratado ou contratação ainda não confirmada pelo responsável técnico.'using errcode='23514';end if;
end$$;
alter function public.nr_executar(uuid,text,text,text,uuid,integer,text,jsonb)rename to nr_executar_ate61;
create function public.nr_executar(p_org uuid,p_norma text,p_recurso text,p_comando text,p_id uuid,p_expected_version integer,p_chave text,p_dados jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.nr_documentos;begin
 if p_recurso='documentos'and((p_comando='salvar'and p_id is null)or p_comando='nova_revisao')then
  if not public.pode(p_org,'ver_nr')then raise exception 'Acesso negado.'using errcode='42501';end if;
  if p_id is not null then select * into d from public.nr_documentos where organization_id=p_org and id=p_id and p_norma=any(normas);if not found then raise exception 'Documento indisponível.'using errcode='42501';end if;end if;
  if not public.nr_unidade_autorizada(p_org,coalesce(d.cliente_id,(p_dados->>'cliente_id')::uuid),coalesce(d.unidade_id,(p_dados->>'unidade_id')::uuid),p_norma)then raise exception 'Unidade indisponível.'using errcode='42501';end if;
  perform public.nr_documento_exigir_contrato(p_org,coalesce(d.cliente_id,(p_dados->>'cliente_id')::uuid),coalesce(d.unidade_id,(p_dados->>'unidade_id')::uuid),coalesce(d.tipo,p_dados->>'tipo'));
 end if;
 return public.nr_executar_ate61(p_org,p_norma,p_recurso,p_comando,p_id,p_expected_version,p_chave,p_dados);
end$$;
revoke all on function public.nr_contratacao_rt(uuid),public.nr_documento_exigir_contrato(uuid,uuid,uuid,text),public.nr_executar_ate61(uuid,text,text,text,uuid,integer,text,jsonb),public.nr_contratacao_obter(uuid,uuid,uuid,text),public.nr_contratacao_salvar(uuid,uuid,uuid,text,integer,uuid,text[],text),public.nr_executar(uuid,text,text,text,uuid,integer,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_contratacao_obter(uuid,uuid,uuid,text),public.nr_contratacao_salvar(uuid,uuid,uuid,text,integer,uuid,text[],text),public.nr_executar(uuid,text,text,text,uuid,integer,text,jsonb)to authenticated;
notify pgrst,'reload schema';
