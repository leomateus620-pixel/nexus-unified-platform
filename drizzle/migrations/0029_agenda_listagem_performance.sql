-- Fast path somente para gestor atual em evento independente.
-- ver_operacao/tenant permanecem obrigatórios; fontes e demais perfis usam a ACL canônica.
-- Novas origens exigem revisar este predicado e seus testes de paridade.
create or replace function public.ag_listar(_org uuid,_inicio date,_fim date,_timezone text,_minha boolean default false,_busca text default '',_estado text default null,_tipo text default null,_equipe uuid default null,_pagina integer default 0,_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare arr jsonb;dias jsonb;tot bigint;gestor boolean:=public.operacao_pode(_org,'gerir_operacao');begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;perform public.ag_fuso(_timezone);
 if _inicio is null or _fim is null or not isfinite(_inicio) or not isfinite(_fim) or _fim<=_inicio or _fim>_inicio+93 or _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 100 or length(coalesce(_busca,''))>200 then raise exception 'Informe janela de até93dias e paginação válida.' using errcode='23514';end if;
 with q as(select e.id,e.inicio from public.agenda_eventos e where e.organization_id=_org and(case when gestor and e.acao_id is null and e.levantamento_id is null then true else public.agenda_ler_evento(_org,e.id) end)
 and((e.dia_inteiro and daterange(e.data_inicio,e.data_fim,'[)')&&daterange(_inicio,_fim,'[)')) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(_inicio::timestamp at time zone _timezone,_fim::timestamp at time zone _timezone,'[)')))
 and(_estado is null or e.estado=_estado) and(_tipo is null or e.tipo=_tipo) and strpos(lower(e.titulo||' '||e.local),lower(coalesce(_busca,'')))>0
 and(not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid())))
 and(_equipe is null or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.equipe_origem_id=_equipe)))
 select(select count(*) from q),coalesce((select jsonb_agg(public.ag_evento_json(_org,x.id,_inicio,_fim,_timezone) order by x.inicio,x.id) from(select * from q order by inicio,id offset _pagina*_limite limit _limite)x),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('data',d::date,'total',(select count(*) from q join public.agenda_eventos e on e.id=q.id where(e.dia_inteiro and d::date>=e.data_inicio and d::date<e.data_fim) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(d at time zone _timezone,(d+interval '1 day') at time zone _timezone,'[)')))) order by d) from generate_series(_inicio::timestamp,(_fim-1)::timestamp,interval '1 day')d),'[]'::jsonb) into tot,arr,dias;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite,'inicio',_inicio,'fim',_fim,'timezone',_timezone,'dias',dias,'permissoes',jsonb_build_object('criar',gestor,'criar_acao',gestor,'gerir_series',gestor),'minha_pessoa_id',public.ag_pessoa(_org,auth.uid()));
end$$;
notify pgrst,'reload schema';
