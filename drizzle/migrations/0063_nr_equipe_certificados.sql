-- Pessoas/certificados canônicos. Associação de unidade não concede acesso à organização.
alter table public.pessoa_qualificacoes add column carga_horaria numeric(7,2) check(carga_horaria>0 and carga_horaria<=10000);
alter table public.pessoa_qualificacoes add column tipo_treinamento text check(tipo_treinamento in('inicial','periodico','eventual'));
alter table public.pessoa_qualificacoes add column modalidade text check(modalidade in('presencial','semipresencial','distancia'));
create or replace function public.salvar_qualificacao(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null)returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes;r jsonb;payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version);begin
 perform public.lev_travar_autor(_org,auth.uid());
 if not(public.operacao_pode(_org,'gerir_equipe')or(public.operacao_pode(_org,'ver_equipe')and public.operacao_minha_pessoa(_org,(_dados->>'pessoa_id')::uuid)))then raise exception 'Acesso negado.'using errcode='42501';end if;
 perform public.ag_payload(_dados,array['pessoa_id','competencia_id','emissor','conclusao','validade','carga_horaria','tipo_treinamento','modalidade']);
 r:=public.operacao_repetir(_org,_chave,'salvar_qualificacao',payload);if r is not null then return r;end if;
 if length(trim(coalesce(_dados->>'emissor','')))<2 then raise exception 'Informe o emissor.'using errcode='23514';end if;
 if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'pessoa_id')::uuid and ativa)or not exists(select 1 from public.competencias where organization_id=_org and id=(_dados->>'competencia_id')::uuid and ativa)then raise exception 'Pessoa ou competência indisponível.'using errcode='23514';end if;
 if _id is null then
  insert into public.pessoa_qualificacoes(organization_id,pessoa_id,competencia_id,emissor,conclusao,validade,carga_horaria,tipo_treinamento,modalidade)
  values(_org,(_dados->>'pessoa_id')::uuid,(_dados->>'competencia_id')::uuid,trim(_dados->>'emissor'),(_dados->>'conclusao')::date,nullif(_dados->>'validade','')::date,(_dados->>'carga_horaria')::numeric,_dados->>'tipo_treinamento',_dados->>'modalidade')returning * into q;
 else
  select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
  if not found or(not public.operacao_pode(_org,'gerir_equipe')and not public.operacao_minha_pessoa(_org,q.pessoa_id))then raise exception 'Registro indisponível.'using errcode='42501';end if;
  if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.'using errcode='40001';end if;
  if q.estado<>'enviada'then raise exception 'Qualificação em conferência ou concluída é imutável; devolva ou registre nova qualificação.'using errcode='23514';end if;
  if q.pessoa_id<>(_dados->>'pessoa_id')::uuid or q.competencia_id<>(_dados->>'competencia_id')::uuid then raise exception 'Pessoa e competência de origem são imutáveis.'using errcode='23514';end if;
  update public.pessoa_qualificacoes set emissor=trim(_dados->>'emissor'),conclusao=(_dados->>'conclusao')::date,validade=nullif(_dados->>'validade','')::date,
   carga_horaria=case when _dados?'carga_horaria'then(_dados->>'carga_horaria')::numeric else carga_horaria end,
   tipo_treinamento=case when _dados?'tipo_treinamento'then _dados->>'tipo_treinamento'else tipo_treinamento end,
   modalidade=case when _dados?'modalidade'then _dados->>'modalidade'else modalidade end where id=_id returning * into q;
 end if;
 return public.operacao_concluir(_org,_chave,'salvar_qualificacao',payload,to_jsonb(q));
end$$;
create table public.nr_unidade_pessoas (
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,pessoa_id uuid not null,
 funcao text not null check(length(trim(funcao))between 2 and 160),ativa boolean not null default true,version integer not null default 1,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,unidade_id,pessoa_id),foreign key(organization_id,cliente_id,unidade_id)references public.unidades(organization_id,cliente_id,id),foreign key(organization_id,pessoa_id)references public.pessoas(organization_id,id)
);
create table public.nr_unidade_pessoa_eventos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,unidade_id uuid not null,pessoa_id uuid not null,version integer not null,
 antes jsonb,depois jsonb not null,autor uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,unidade_id,pessoa_id)references public.nr_unidade_pessoas(organization_id,unidade_id,pessoa_id)
);
alter table public.nr_unidade_pessoas enable row level security;
alter table public.nr_unidade_pessoa_eventos enable row level security;
revoke all on public.nr_unidade_pessoas,public.nr_unidade_pessoa_eventos from public,anon,authenticated,service_role;
create function public.nr_unidade_pessoa_salvar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_pessoa uuid,p_funcao text,p_ativa boolean,p_expected_version integer,p_chave uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.nr_unidade_pessoas;n public.nr_unidade_pessoas;r jsonb;payload jsonb;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma)or not public.operacao_pode(p_org,'gerir_equipe')then raise exception 'Acesso negado.'using errcode='42501';end if;
 if p_chave is null or p_expected_version is null or p_ativa is null or length(trim(coalesce(p_funcao,'')))not between 2 and 160 or not exists(select 1 from public.pessoas where organization_id=p_org and id=p_pessoa and ativa)then raise exception 'Pessoa, função ou versão inválida.'using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-pessoa:'||p_org||':'||p_unidade||':'||p_pessoa,0));
 payload:=jsonb_build_object('cliente',p_cliente,'unidade',p_unidade,'pessoa',p_pessoa,'funcao',p_funcao,'ativa',p_ativa,'version',p_expected_version);
 r:=public.operacao_repetir(p_org,p_chave,'nr_unidade_pessoa_salvar',payload);if r is not null then return r;end if;
 select * into a from public.nr_unidade_pessoas where organization_id=p_org and unidade_id=p_unidade and pessoa_id=p_pessoa for update;
 if coalesce(a.version,0)<>p_expected_version then raise exception 'Vínculo alterado. Compare as versões.'using errcode='40001';end if;
 insert into public.nr_unidade_pessoas(organization_id,cliente_id,unidade_id,pessoa_id,funcao,ativa,version,updated_by)values(p_org,p_cliente,p_unidade,p_pessoa,trim(p_funcao),p_ativa,p_expected_version+1,auth.uid())
 on conflict(organization_id,unidade_id,pessoa_id)do update set funcao=excluded.funcao,ativa=excluded.ativa,version=excluded.version,updated_by=excluded.updated_by,updated_at=clock_timestamp()returning * into n;
 insert into public.nr_unidade_pessoa_eventos(organization_id,unidade_id,pessoa_id,version,antes,depois,autor)values(p_org,p_unidade,p_pessoa,n.version,case when a.version is null then null else to_jsonb(a)end,to_jsonb(n),auth.uid());
 return public.operacao_concluir(p_org,p_chave,'nr_unidade_pessoa_salvar',payload,to_jsonb(n));
end$$;
create function public.nr_unidade_equipe(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_pagina integer default 0,p_busca text default '')returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gestor boolean:=public.operacao_pode(p_org,'gerir_equipe');r jsonb;hoje date;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma)or not public.operacao_pode(p_org,'ver_equipe')then raise exception 'Equipe indisponível para este acesso.'using errcode='42501';end if;
 if p_pagina is null or p_pagina not between 0 and 10000 or length(coalesce(p_busca,''))>120 then raise exception 'Filtro inválido.'using errcode='23514';end if;
 hoje:=(now()at time zone(select timezone from public.organizations where id=p_org))::date;
 with base as materialized(select p.id,p.nome,p.ativa,m.funcao,m.version,m.ativa vinculada from public.nr_unidade_pessoas m join public.pessoas p on p.organization_id=m.organization_id and p.id=m.pessoa_id
 where m.organization_id=p_org and m.cliente_id=p_cliente and m.unidade_id=p_unidade and(gestor or public.operacao_minha_pessoa(p_org,p.id))and strpos(lower(p.nome||' '||m.funcao),lower(coalesce(p_busca,'')))>0),
 pagina as(select * from base order by nome,id limit 10 offset p_pagina*10),
 qs as materialized(select q.*,c.nome competencia from public.pessoa_qualificacoes q join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id where q.organization_id=p_org and exists(select 1 from base b where b.id=q.pessoa_id and b.vinculada)),
 rows as(select b.*,(select count(*)from qs q where q.pessoa_id=b.id)certificados_total,
 coalesce((select jsonb_agg(to_jsonb(x)order by x.validade nulls last,x.id)from(select q.id,q.competencia,q.emissor,q.conclusao,q.validade,q.estado,q.carga_horaria,q.tipo_treinamento,q.modalidade,q.version,
 case when q.estado='revogada'then 'revogada'when q.validade<hoje then 'vencida'when q.validade<=hoje+30 then 'vence_em_30_dias'when q.validade is null then 'validade_nao_informada'else 'no_prazo'end alerta
 from qs q where q.pessoa_id=b.id order by q.validade nulls last,q.id limit 20)x),'[]')certificados from pagina b)
 select jsonb_build_object('pode_gerir',gestor,'data_referencia',hoje,'pagina',p_pagina,'total',(select count(*)from base),'registros',coalesce((select jsonb_agg(to_jsonb(rr)order by nome,id)from rows rr),'[]'),
 'vencidas',(select count(*)from qs where validade<hoje and estado<>'revogada'),'vence_em_30_dias',(select count(*)from qs where validade between hoje and hoje+30 and estado<>'revogada'))into r;
 return r;
end$$;
revoke all on function public.nr_unidade_pessoa_salvar(uuid,uuid,uuid,text,uuid,text,boolean,integer,uuid),public.nr_unidade_equipe(uuid,uuid,uuid,text,integer,text)from public,anon,authenticated,service_role;
grant execute on function public.nr_unidade_pessoa_salvar(uuid,uuid,uuid,text,uuid,text,boolean,integer,uuid),public.nr_unidade_equipe(uuid,uuid,uuid,text,integer,text)to authenticated;
notify pgrst,'reload schema';
