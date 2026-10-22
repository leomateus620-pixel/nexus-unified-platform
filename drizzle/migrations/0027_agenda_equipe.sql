-- CANDIDATA TEMP. Requer0016,0018,0023,0026; não aplicar sem testes e revisão.
-- OS/inspeções/manutenção/viagens não são origens implementadas desta entrega.
alter table public.organizations add column timezone text not null default 'America/Sao_Paulo';
alter table public.indisponibilidades add column cancelada_em timestamptz,add column cancelada_por uuid references auth.users(id),add column motivo_cancelamento text,add column version integer not null default 1;
alter table public.indisponibilidades add constraint agenda_indisponibilidade_cancelamento check((cancelada_em is null and cancelada_por is null and motivo_cancelamento is null) or(cancelada_em is not null and cancelada_por is not null and length(trim(motivo_cancelamento)) between 5 and 1000)),add constraint agenda_indisponibilidade_version check(version>0);
alter table public.projetos add constraint agenda_projeto_contexto unique(organization_id,cliente_id,id);
alter table public.levantamentos add constraint agenda_levantamento_contexto unique(organization_id,cliente_id,unidade_id,id);
alter table public.agenda_eventos add column levantamento_id uuid,add column cliente_id uuid,add column unidade_id uuid,add column projeto_id uuid,
 add column visibilidade text not null default 'participantes' check(visibilidade in('participantes','organizacao')),
 add column serie_id uuid,add column serie_versao_id uuid,add column ocorrencia_data date,add column excecao boolean not null default false,add column gerado_automaticamente boolean not null default false,add column geracao_job_id uuid references public.job_execucoes(id);
do $$declare n text;begin
 select conname into strict n from pg_constraint where conrelid='public.agenda_eventos'::regclass and contype='c' and pg_get_constraintdef(oid) like '%acao_id IS NULL%' and pg_get_constraintdef(oid) like '%origem_ocorrencia IS NULL%';
 execute format('alter table public.agenda_eventos drop constraint %I',n);
end$$;
alter table public.agenda_eventos add constraint agenda_origem_real check(num_nonnulls(acao_id,levantamento_id)<=1 and((num_nonnulls(acao_id,levantamento_id)=0)=(origem_ocorrencia is null))),
 add constraint agenda_levantamento_contexto_presente check(levantamento_id is null or(cliente_id is not null and unidade_id is not null)),
 add constraint agenda_unidade_contexto_presente check(unidade_id is null or cliente_id is not null),
 add constraint agenda_projeto_contexto_presente check(projeto_id is null or cliente_id is not null),
 add constraint agenda_periodo_finito check(isfinite(inicio) and isfinite(fim)),
 add constraint agenda_cliente foreign key(organization_id,cliente_id) references public.clientes(organization_id,id),
 add constraint agenda_unidade foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 add constraint agenda_projeto foreign key(organization_id,cliente_id,projeto_id) references public.projetos(organization_id,cliente_id,id),
 add constraint agenda_levantamento foreign key(organization_id,cliente_id,unidade_id,levantamento_id) references public.levantamentos(organization_id,cliente_id,unidade_id,id),
 add constraint agenda_visita_levantamento unique(organization_id,levantamento_id,origem_ocorrencia);
alter table public.agenda_participantes add column equipe_origem_id uuid,add column equipe_inicio date,
 add constraint agenda_equipe_temporal foreign key(organization_id,equipe_origem_id,pessoa_id,equipe_inicio) references public.equipe_membros(organization_id,equipe_id,pessoa_id,inicio),
 add constraint agenda_equipe_origem_pares check((equipe_origem_id is null)=(equipe_inicio is null));
alter table public.agenda_requisitos add column nome text,add column exige_evidencia boolean,add column exige_validade boolean;
update public.agenda_requisitos r set nome=c.nome,exige_evidencia=c.exige_evidencia,exige_validade=c.exige_validade from public.competencias c where c.organization_id=r.organization_id and c.id=r.competencia_id;
alter table public.agenda_requisitos alter column nome set not null,alter column exige_evidencia set not null,alter column exige_validade set not null;
create table public.agenda_series(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),versao_atual_id uuid,
 estado text not null default 'ativa' check(estado in('ativa','cancelada')),cancelamento_corte date,version integer not null default 1 check(version>0),check((estado='ativa' and cancelamento_corte is null)or(estado='cancelada' and cancelamento_corte is not null and isfinite(cancelamento_corte))),materializado_ate date,materializacao_pendente boolean not null default false,ultima_falha_codigo text,ultima_tentativa timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id)
);
create table public.agenda_serie_versoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,serie_id uuid not null,numero integer not null check(numero>0),
 regra jsonb not null,evento_modelo jsonb not null,timezone text not null,inicio_aplicacao date not null,publicar boolean not null,motivo text,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),unique(organization_id,serie_id,numero),unique(organization_id,serie_id,id),unique(organization_id,id),
 foreign key(organization_id,serie_id) references public.agenda_series(organization_id,id)
);
alter table public.agenda_series add constraint agenda_serie_atual foreign key(organization_id,id,versao_atual_id) references public.agenda_serie_versoes(organization_id,serie_id,id);
alter table public.agenda_eventos add constraint agenda_evento_serie foreign key(organization_id,serie_id,serie_versao_id) references public.agenda_serie_versoes(organization_id,serie_id,id),
 add constraint agenda_evento_serie_campos check((serie_id is null and serie_versao_id is null and ocorrencia_data is null) or(serie_id is not null and serie_versao_id is not null and ocorrencia_data is not null)),
 add constraint agenda_serie_ocorrencia_unica unique(organization_id,serie_versao_id,ocorrencia_data);
create table public.agenda_serie_ocorrencias(
 organization_id uuid not null,serie_versao_id uuid not null,data date not null,evento_id uuid,estado text not null check(estado in('materializada','bloqueada','ignorada')),
 tentativas integer not null default 0,codigo text,proxima_tentativa timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(organization_id,serie_versao_id,data),foreign key(organization_id,serie_versao_id) references public.agenda_serie_versoes(organization_id,id),foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id)
);
create table public.agenda_excecoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,serie_id uuid not null,serie_versao_id uuid not null,evento_id uuid not null,data_original date not null,
 tipo text not null check(tipo in('alterada','cancelada')),motivo text not null,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,serie_id,serie_versao_id) references public.agenda_serie_versoes(organization_id,serie_id,id),foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id)
);
create index agenda_excecao_data on public.agenda_excecoes(organization_id,serie_id,data_original);
create table public.agenda_ferramentas(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,evento_id uuid not null,ferramenta_id uuid not null,pessoa_id uuid not null,custodia_id uuid,
 vigente boolean not null default true,version integer not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id),foreign key(organization_id,ferramenta_id) references public.ferramentas(organization_id,id),foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),foreign key(organization_id,custodia_id) references public.ferramenta_custodias(organization_id,id)
);
create unique index agenda_ferramenta_vigente on public.agenda_ferramentas(organization_id,evento_id,ferramenta_id) where vigente;
-- Projeção de reservas reais somente quando já cobrem exatamente o compromisso.
-- Não muda intervalo/estado de custódia e não presume devolução nem amplia reserva parcial.
insert into public.agenda_ferramentas(organization_id,evento_id,ferramenta_id,pessoa_id,custodia_id,created_by)
select c.organization_id,c.agenda_evento_id,c.ferramenta_id,c.pessoa_id,c.id,c.created_by
from public.ferramenta_custodias c join public.agenda_eventos e on e.organization_id=c.organization_id and e.id=c.agenda_evento_id
where c.estado='reservada' and e.estado in('rascunho','publicado','em_andamento') and c.inicio=e.inicio and c.fim=e.fim and c.timezone=e.timezone
 and exists(select 1 from public.agenda_participantes p where p.organization_id=e.organization_id and p.evento_id=e.id and p.pessoa_id=c.pessoa_id and p.vigente and p.funcao<>'observador');

create table public.agenda_comentarios(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,evento_id uuid not null,texto text not null check(length(trim(texto)) between 3 and 4000),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id)
);
create table public.agenda_preferencias(
 organization_id uuid not null,user_id uuid not null,antecedencia_minutos integer not null default 60 check(antecedencia_minutos between 0 and 10080),notificar_atrasos boolean not null default true,notificar boolean not null default true,
 updated_at timestamptz not null default now(),primary key(organization_id,user_id),foreign key(organization_id,user_id) references public.memberships(organization_id,user_id)
);
-- Contexto privado verificável do job. XID/backend impede uso posterior e nenhum cliente pode criá-lo.
create table public.agenda_automacoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,serie_id uuid not null,serie_versao_id uuid not null,evento_id uuid not null,custodia_id uuid not null,
 job_execucao_id uuid not null references public.job_execucoes(id),solicitante_id uuid not null references auth.users(id),backend_pid integer not null,transaction_id xid8 not null,
 operacao text not null check(operacao='RESERVA_SERIE'),created_at timestamptz not null default now(),unique(custodia_id),
 foreign key(organization_id,serie_id,serie_versao_id) references public.agenda_serie_versoes(organization_id,serie_id,id),foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id),
 foreign key(organization_id,custodia_id) references public.ferramenta_custodias(organization_id,id) deferrable initially deferred
);

create function public.ag_payload(_d jsonb,_keys text[]) returns void language plpgsql set search_path='' as $$begin
 if jsonb_typeof(_d) is distinct from 'object' or exists(select 1 from jsonb_object_keys(_d) k where not(k=any(_keys))) then raise exception 'Campos desconhecidos no comando.' using errcode='23514';end if;end$$;
create function public.ag_texto(_d jsonb,_key text,_min integer,_max integer) returns text language plpgsql set search_path='' as $$declare v text:=trim(coalesce(_d->>_key,''));begin
 if (_d?_key and jsonb_typeof(_d->_key) not in('string','null')) or length(v)<_min or length(v)>_max then raise exception 'Confira o campo % (% a % caracteres).',_key,_min,_max using errcode='23514';end if;return v;end$$;
create function public.ag_fuso(_tz text) returns text language plpgsql stable set search_path='' as $$begin
 if _tz is null or length(_tz)>80 or not exists(select 1 from pg_catalog.pg_timezone_names where name=_tz) then raise exception 'Fuso IANA inválido.' using errcode='23514';end if;return _tz;end$$;
create function public.ag_pessoa(_org uuid,_autor uuid) returns uuid language sql stable security definer set search_path='' as $$select id from public.pessoas where organization_id=_org and user_id=_autor and ativa and public.operacao_autor_pode(_org,_autor,'ver_operacao');$$;
create function public.ag_autor_acao(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(select 1 from public.acoes_operacionais a where a.organization_id=_org and a.id=_id and(public.operacao_autor_pode(_org,_autor,'gerir_operacao') or a.responsavel_id=public.ag_pessoa(_org,_autor) or exists(select 1 from public.acao_colaboradores c where c.organization_id=_org and c.acao_id=a.id and c.pessoa_id=public.ag_pessoa(_org,_autor))));
$$;
create function public.ag_autor_ler(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.id=_id
 and(e.acao_id is null or public.ag_autor_acao(_org,e.acao_id,_autor)) and(e.levantamento_id is null or public.lev_autor_ler(_org,e.levantamento_id,_autor))
 and(public.operacao_autor_pode(_org,_autor,'gerir_operacao') or e.visibilidade='organizacao' or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,_autor))));
$$;
create or replace function public.agenda_ler_evento(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$select public.ag_autor_ler(_org,_id,auth.uid());$$;
create function public.ag_imutavel() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Histórico congelado; registre nova versão ou exceção.' using errcode='23514';end$$;
do $$declare t text;begin
 foreach t in array array['agenda_serie_versoes','agenda_excecoes','agenda_comentarios','agenda_automacoes','agenda_evento_revisoes'] loop execute format('create trigger ag_imutavel before update or delete on public.%I for each row execute function public.ag_imutavel()',t);end loop;
end$$;
create function public.ag_auditar_custodia() returns trigger language plpgsql security definer set search_path='' as $$declare ctx public.agenda_automacoes;begin
 if auth.uid() is not null then
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_anterior,estado_atual,motivo)
  values(new.organization_id,tg_table_name,new.id,tg_op,new.version,case when tg_op='UPDATE' then to_jsonb(old)->>'estado' end,new.estado,new.motivo);
 else
  select a.* into ctx from public.agenda_automacoes a join public.job_execucoes j on j.id=a.job_execucao_id join public.agenda_eventos e on e.organization_id=a.organization_id and e.id=a.evento_id
  where a.organization_id=new.organization_id and a.custodia_id=new.id and a.backend_pid=pg_backend_pid() and a.transaction_id=pg_current_xact_id() and j.estado='em_execucao' and j.job='agenda-notificacoes'
   and e.serie_id=a.serie_id and e.serie_versao_id=a.serie_versao_id and e.id=new.agenda_evento_id and e.gerado_automaticamente and e.geracao_job_id=j.id and e.created_by=a.solicitante_id and new.created_by=a.solicitante_id;
  if tg_op<>'INSERT' or ctx.id is null or not public.operacao_autor_pode(new.organization_id,ctx.solicitante_id,'gerir_operacao') then raise exception 'Contexto de automação inválido.' using errcode='42501';end if;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_atual,motivo,autor) values(new.organization_id,tg_table_name,new.id,'GERACAO_AUTOMATICA',new.version,new.estado,'Reserva por série; execução '||ctx.job_execucao_id::text,ctx.solicitante_id);
 end if;return new;
end$$;
drop trigger alm_audit on public.ferramenta_custodias;
create trigger alm_audit after insert or update on public.ferramenta_custodias for each row execute function public.ag_auditar_custodia();

create function public.ag_resolver_periodo(_d jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare tz text:=public.ag_fuso(coalesce(_d->>'timezone','America/Sao_Paulo'));s timestamptz;e timestamptz;sl timestamp;el timestamp;di boolean:=coalesce((_d->>'dia_inteiro')::boolean,false);begin
 if _d?'dia_inteiro' and jsonb_typeof(_d->'dia_inteiro')<>'boolean' then raise exception 'Dia inteiro deve ser booleano.' using errcode='23514';end if;
 if di then
  s:=(_d->>'data_inicio')::date::timestamp at time zone tz;e:=(_d->>'data_fim')::date::timestamp at time zone tz;
 elsif _d?'inicio_local' or _d?'fim_local' then
  if nullif(_d->>'inicio','') is not null or nullif(_d->>'fim','') is not null then raise exception 'Escolha período local ou instantes, sem misturar.' using errcode='23514';end if;
  if coalesce(_d->>'inicio_local','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' or coalesce(_d->>'fim_local','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then raise exception 'Informe data e hora local completas.' using errcode='23514';end if;
  sl:=(_d->>'inicio_local')::timestamp;el:=(_d->>'fim_local')::timestamp;s:=sl at time zone tz;e:=el at time zone tz;
  if s at time zone tz<>sl or e at time zone tz<>el then raise exception 'Horário local inexistente no fuso; escolha outro horário.' using errcode='23514';end if;
 else
  if coalesce(_d->>'inicio','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(_d->>'fim','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Informe instantes com fuso explícito.' using errcode='23514';end if;s:=(_d->>'inicio')::timestamptz;e:=(_d->>'fim')::timestamptz;
 end if;
 if s is null or e is null or not isfinite(s) or not isfinite(e) or e<=s or e>s+interval '93 days' then raise exception 'Período deve ser finito, com fim posterior e duração até93dias.' using errcode='23514';end if;
 return jsonb_build_object('inicio',s,'fim',e,'timezone',tz,'dia_inteiro',di,'data_inicio',case when di then(_d->>'data_inicio')::date end,'data_fim',case when di then(_d->>'data_fim')::date end);
end$$;

create function public.ag_validar_regra(_evento jsonb,_regra jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare a date:=((_evento->>'inicio')::timestamptz at time zone(_evento->>'timezone'))::date;f text:=_regra->>'frequencia';n integer:=(_regra->>'intervalo')::integer;d integer;x jsonb;dias jsonb;possiveis integer;begin
 perform public.ag_payload(_regra,array['frequencia','intervalo','dias_semana','dia_mes','termina_em','quantidade','politica_mes','hora_ambigua','hora_inexistente']);
 if f not in('diaria','semanal','mensal') or n is null or n not between 1 and 12 then raise exception 'Recorrência inválida.' using errcode='23514';end if;
 if jsonb_typeof(_regra->'intervalo') is distinct from 'number' or(_regra->>'intervalo')!~'^[0-9]+$' then raise exception 'Intervalo deve ser inteiro.' using errcode='23514';end if;
 if nullif(_regra->>'quantidade','') is not null and(jsonb_typeof(_regra->'quantidade')<>'number' or(_regra->>'quantidade')!~'^[0-9]+$') then raise exception 'Quantidade deve ser inteira.' using errcode='23514';end if;
 if num_nonnulls(nullif(_regra->>'termina_em',''),nullif(_regra->>'quantidade',''))<>1 then raise exception 'Defina término por data ou quantidade.' using errcode='23514';end if;
 if nullif(_regra->>'termina_em','') is not null and((_regra->>'termina_em')::date<a or(_regra->>'termina_em')::date>a+730) then raise exception 'Término deve estar entre a âncora e730dias.' using errcode='23514';end if;
 if nullif(_regra->>'quantidade','') is not null and(_regra->>'quantidade')::integer not between 1 and 200 then raise exception 'Quantidade deve estar entre1e200.' using errcode='23514';end if;
 if coalesce(_regra->>'politica_mes','pular')<>'pular' or coalesce(_regra->>'hora_ambigua','posterior')<>'posterior' or coalesce(_regra->>'hora_inexistente','pular')<>'pular' then raise exception 'Política temporal não suportada.' using errcode='23514';end if;
 if f='semanal' then
  if jsonb_typeof(_regra->'dias_semana') is distinct from 'array' or jsonb_array_length(_regra->'dias_semana') not between 1 and 7 then raise exception 'Escolha dias da semana.' using errcode='23514';end if;
  for x in select value from jsonb_array_elements(_regra->'dias_semana') loop if jsonb_typeof(x)<>'number' or(x#>>'{}')!~'^[1-7]$' then raise exception 'Dia da semana inválido.' using errcode='23514';end if;end loop;
 end if;
 if f='mensal' and coalesce((_regra->>'dia_mes')::integer,extract(day from a)::integer) not between 1 and 31 then raise exception 'Dia do mês inválido.' using errcode='23514';end if;
 select coalesce(jsonb_agg(dia order by dia),'[]'::jsonb) into dias from(select distinct(value#>>'{}')::integer dia from jsonb_array_elements(case when f='semanal' then _regra->'dias_semana' else '[]'::jsonb end))q;
 if nullif(_regra->>'quantidade','') is not null then
  select count(*) into possiveis from generate_series(a::timestamp,(a+730)::timestamp,interval '1 day') ds where case f when 'diaria' then(ds::date-a)%n=0 when 'semanal' then((ds::date-(a-extract(isodow from a)::integer+1))/7)%n=0 and exists(select 1 from jsonb_array_elements_text(dias) v where v::integer=extract(isodow from ds)::integer) else((extract(year from ds)::integer-extract(year from a)::integer)*12+extract(month from ds)::integer-extract(month from a)::integer)%n=0 and extract(day from ds)::integer=coalesce((_regra->>'dia_mes')::integer,extract(day from a)::integer) end;
  if(_regra->>'quantidade')::integer>possiveis then raise exception 'Quantidade ultrapassa a vigência técnica de730dias; reduza quantidade ou intervalo.' using errcode='23514';end if;
 end if;
 return _regra||jsonb_build_object('intervalo',n,'dias_semana',dias,'dia_mes',case when f='mensal' then coalesce((_regra->>'dia_mes')::integer,extract(day from a)::integer) end,'termina_em',nullif(_regra->>'termina_em','')::date,'quantidade',nullif(_regra->>'quantidade','')::integer,'politica_mes','pular','hora_ambigua','posterior','hora_inexistente','pular');
end$$;
create function public.ag_expandir_datas(_evento jsonb,_regra jsonb,_de date,_ate date) returns table(data date,ordinal integer,inicio timestamptz,fim timestamptz,ignorada boolean)
language plpgsql stable set search_path='' as $$
declare regra jsonb:=public.ag_validar_regra(_evento,_regra);tz text:=public.ag_fuso(_evento->>'timezone');sl timestamp:=(_evento->>'inicio')::timestamptz at time zone tz;el timestamp:=(_evento->>'fim')::timestamptz at time zone tz;
 anchor date:=sl::date;limite date;d date;ord integer:=0;ok boolean;n integer:=(regra->>'intervalo')::integer;mes integer;begin
 if _de is null or _ate is null or _ate<_de or _ate>_de+60 then raise exception 'Expansão limitada a60dias.' using errcode='23514';end if;
 limite:=least(coalesce(nullif(regra->>'termina_em','')::date,anchor+730),anchor+730,_ate);
 for d in select generate_series(anchor,limite,interval '1 day')::date loop
  mes:=(extract(year from d)::integer-extract(year from anchor)::integer)*12+extract(month from d)::integer-extract(month from anchor)::integer;
  ok:=case regra->>'frequencia' when 'diaria' then(d-anchor)%n=0 when 'semanal' then((d-(anchor-extract(isodow from anchor)::integer+1))/7)%n=0 and exists(select 1 from jsonb_array_elements_text(regra->'dias_semana') x where x::integer=extract(isodow from d)::integer) when 'mensal' then mes%n=0 and extract(day from d)::integer=(regra->>'dia_mes')::integer end;
  if not ok then continue;end if;ord:=ord+1;if nullif(regra->>'quantidade','') is not null and ord>(regra->>'quantidade')::integer then exit;end if;if d<_de then continue;end if;
  data:=d;ordinal:=ord;
  if coalesce((_evento->>'dia_inteiro')::boolean,false) then inicio:=d::timestamp at time zone tz;fim:=(d+((_evento->>'data_fim')::date-(_evento->>'data_inicio')::date))::timestamp at time zone tz;ignorada:=false;
  else inicio:=(d+sl::time) at time zone tz;fim:=((d+sl::time)+(el-sl)) at time zone tz;ignorada:=(inicio at time zone tz)<>(d+sl::time) or(fim at time zone tz)<>((d+sl::time)+(el-sl));end if;
  if ignorada then inicio:=null;fim:=null;end if;return next;
 end loop;
end$$;

create function public.ag_travar_origem(_org uuid,_acao uuid,_lev uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if _acao is not null then perform 1 from public.acoes_operacionais where organization_id=_org and id=_acao for share;perform 1 from public.acao_colaboradores where organization_id=_org and acao_id=_acao order by pessoa_id for share;end if;
 if _lev is not null then perform 1 from public.levantamentos where organization_id=_org and id=_lev for share;end if;
end$$;
create function public.ag_travar_ferramentas(_org uuid,_id uuid,_dados jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path='' as $$declare fid uuid;begin
 for fid in select ferramenta_id from public.ferramenta_custodias where organization_id=_org and agenda_evento_id=_id and estado in('reservada','retirada')
 union select ferramenta_id from public.agenda_ferramentas where organization_id=_org and evento_id=_id and vigente
 union select(value->>'ferramenta_id')::uuid from jsonb_array_elements(coalesce(_dados->'ferramentas','[]'::jsonb)) order by ferramenta_id loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-ferramenta:'||_org::text||fid::text,0));perform 1 from public.ferramentas where organization_id=_org and id=fid for update;
  if not found then raise exception 'Ferramenta indisponível.' using errcode='42501';end if;
 end loop;
end$$;
create function public.ag_liberar_ferramentas(_org uuid,_id uuid,_motivo text,_preservar_retiradas boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 if not _preservar_retiradas and exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.agenda_evento_id=_id and c.estado in('reservada','retirada') and not exists(select 1 from public.agenda_ferramentas ext_af where ext_af.organization_id=_org and ext_af.evento_id=_id and ext_af.custodia_id=c.id and ext_af.vigente)) then raise exception 'Há custódia gerenciada fora deste planejamento. Confira/cancele a reserva no Almoxarifado antes de alterar a visita; período parcial ou retirada não são convertidos automaticamente.' using errcode='23514';end if;
 if not _preservar_retiradas and exists(select 1 from public.ferramenta_custodias where organization_id=_org and agenda_evento_id=_id and estado='retirada') then raise exception 'Devolva a ferramenta retirada antes de alterar/cancelar esta visita.' using errcode='23514';end if;
 update public.ferramenta_custodias set estado='cancelada',motivo=_motivo where organization_id=_org and agenda_evento_id=_id and estado='reservada';
end$$;
create function public.ag_bloqueios(_org uuid,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.agenda_eventos;p record;r record;outj jsonb:='[]';f record;begin
 select * into e from public.agenda_eventos where organization_id=_org and id=_id;if not found then return jsonb_build_array(jsonb_build_object('codigo','indisponivel','mensagem','Evento indisponível.'));end if;
 if exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.agenda_evento_id=_id and c.estado in('reservada','retirada') and not exists(select 1 from public.agenda_ferramentas ext_af where ext_af.organization_id=_org and ext_af.evento_id=_id and ext_af.custodia_id=c.id and ext_af.vigente)) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','custodia_externa','mensagem','Há custódia externa ao planejamento. Confira no Almoxarifado antes de iniciar/reprogramar; a Agenda não amplia período parcial nem registra devolução automática.'));end if;
 if e.acao_id is not null and exists(select 1 from public.acoes_operacionais where organization_id=_org and id=e.acao_id and estado in('concluida','cancelada')) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','origem_encerrada','mensagem','A ação de origem está encerrada; revise esta visita.'));end if;
 if e.levantamento_id is not null and exists(select 1 from public.levantamentos l join public.levantamento_revisoes v on v.id=l.revisao_atual_id where l.organization_id=_org and l.id=e.levantamento_id and v.estado in('aprovado','cancelado')) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','origem_encerrada','mensagem','O levantamento está aprovado ou cancelado; revise esta visita.'));end if;
 for p in select pa.*,pe.ativa from public.agenda_participantes pa join public.pessoas pe on pe.organization_id=pa.organization_id and pe.id=pa.pessoa_id where pa.organization_id=_org and pa.evento_id=_id and pa.vigente loop
  if not p.ativa then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','pessoa_inativa','mensagem','Há participante inativo.'));end if;if p.funcao='observador' then continue;end if;
  for r in select * from public.agenda_requisitos where organization_id=_org and evento_id=_id loop
   if not exists(select 1 from public.pessoa_qualificacoes q join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id
    where q.organization_id=_org and q.pessoa_id=p.pessoa_id and q.competencia_id=r.competencia_id and q.estado='validada' and c.ativa and q.conclusao<=least((e.inicio at time zone e.timezone)::date,(clock_timestamp() at time zone e.timezone)::date)
    and(not r.exige_validade or q.validade is not null) and(q.validade is null or q.validade>=greatest(((e.fim-interval '1 microsecond') at time zone e.timezone)::date,case when e.estado='em_andamento' or(e.estado='publicado' and e.inicio<clock_timestamp()) then(clock_timestamp() at time zone e.timezone)::date else((e.fim-interval '1 microsecond') at time zone e.timezone)::date end))
    and(not r.exige_evidencia or exists(select 1 from public.anexos a where a.organization_id=_org and a.qualificacao_id=q.id and a.estado='vinculado')))
   then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','competencia','mensagem','Falta qualificação válida em toda a janela: '||r.nome));end if;
  end loop;
  if e.bloqueia_recursos then
   if exists(select 1 from public.indisponibilidades i where i.organization_id=_org and i.pessoa_id=p.pessoa_id and i.cancelada_em is null and tstzrange(i.inicio,i.fim,'[)')&&tstzrange(e.inicio,e.fim,'[)')) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','indisponibilidade','mensagem','Pessoa indisponível no período.'));end if;
   if exists(select 1 from public.agenda_reservas_pessoas rp where rp.organization_id=_org and rp.pessoa_id=p.pessoa_id and rp.evento_id<>_id and rp.ativa and tstzrange(rp.inicio,rp.fim,'[)')&&tstzrange(e.inicio,e.fim,'[)')) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','conflito_pessoa','mensagem','Há outra reserva exclusiva para uma pessoa.'));end if;
  end if;
 end loop;
 for f in select af.*,t.condicao from public.agenda_ferramentas af join public.ferramentas t on t.organization_id=af.organization_id and t.id=af.ferramenta_id where af.organization_id=_org and af.evento_id=_id and af.vigente loop
  if f.condicao<>'disponivel' then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','ferramenta_condicao','mensagem','Ferramenta indisponível pela condição atual.'));end if;
  if exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.ferramenta_id=f.ferramenta_id and c.agenda_evento_id is distinct from _id and(c.estado='retirada' or(c.estado='reservada' and tstzrange(c.inicio,c.fim,'[)')&&tstzrange(e.inicio,e.fim,'[)')))) then outj:=outj||jsonb_build_array(jsonb_build_object('codigo','conflito_ferramenta','mensagem','Ferramenta já reservada ou retirada.'));end if;
 end loop;return outj;
end$$;
create or replace function public.agenda_reservar(_org uuid,_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos;p record;person uuid;b jsonb;begin
 select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 for person in select pessoa_id from public.agenda_reservas_pessoas where organization_id=_org and evento_id=_id and ativa union select pessoa_id from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente order by pessoa_id loop perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:pessoa:'||_org::text||person::text,0));end loop;
 update public.agenda_reservas_pessoas set ativa=false,liberada_em=clock_timestamp() where organization_id=_org and evento_id=_id and ativa;
 if e.estado not in('publicado','em_andamento') then return;end if;b:=public.ag_bloqueios(_org,_id);
 if b<>'[]'::jsonb then
  if exists(select 1 from jsonb_array_elements(b) x where x->>'codigo' in('conflito_pessoa','indisponibilidade','conflito_ferramenta')) then raise exception 'Conflito de disponibilidade: %',b using errcode='23P01';end if;
  raise exception 'Pendências impedem publicação/início: %',b using errcode='23514';
 end if;
 if e.bloqueia_recursos then
  for p in select * from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente and funcao<>'observador' loop insert into public.agenda_reservas_pessoas(organization_id,evento_id,participante_id,pessoa_id,evento_version,inicio,fim) values(_org,_id,p.id,p.pessoa_id,e.version,e.inicio,e.fim);end loop;
 end if;
end$$;
create function public.ag_reservar_ferramentas(_org uuid,_id uuid,_autor uuid,_job uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos;f record;cid uuid;begin
 select * into e from public.agenda_eventos where organization_id=_org and id=_id;if e.estado not in('publicado','em_andamento') then return;end if;
 if e.estado='em_andamento' then for f in select ferramenta_id from public.agenda_ferramentas where organization_id=_org and evento_id=_id and vigente order by ferramenta_id loop perform public.alm_ferramenta_liberada(_org,f.ferramenta_id,clock_timestamp(),clock_timestamp()+interval '1 microsecond',e.timezone);end loop;end if;
 for f in select * from public.agenda_ferramentas where organization_id=_org and evento_id=_id and vigente order by ferramenta_id loop
  if f.custodia_id is not null and exists(select 1 from public.ferramenta_custodias where organization_id=_org and id=f.custodia_id and estado in('reservada','retirada')) then
   perform public.alm_ferramenta_liberada(_org,f.ferramenta_id,e.inicio,e.fim,e.timezone);continue;
  end if;
  if not exists(select 1 from public.agenda_participantes where organization_id=_org and evento_id=_id and pessoa_id=f.pessoa_id and vigente and funcao<>'observador') then raise exception 'Custodiante deve ser participante responsável ou executante.' using errcode='23514';end if;
  perform public.alm_ferramenta_liberada(_org,f.ferramenta_id,e.inicio,e.fim,e.timezone);
  if exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.ferramenta_id=f.ferramenta_id and(c.estado='retirada' or(c.estado='reservada' and tstzrange(c.inicio,c.fim,'[)')&&tstzrange(e.inicio,e.fim,'[)')))) then raise exception 'Ferramenta já reservada ou retirada.' using errcode='23P01';end if;
  cid:=gen_random_uuid();
  if _job is not null then insert into public.agenda_automacoes(organization_id,serie_id,serie_versao_id,evento_id,custodia_id,job_execucao_id,solicitante_id,backend_pid,transaction_id,operacao) values(_org,e.serie_id,e.serie_versao_id,e.id,cid,_job,_autor,pg_backend_pid(),pg_current_xact_id(),'RESERVA_SERIE');end if;
  insert into public.ferramenta_custodias(id,organization_id,ferramenta_id,pessoa_id,agenda_evento_id,inicio,fim,timezone,created_by) values(cid,_org,f.ferramenta_id,f.pessoa_id,_id,e.inicio,e.fim,e.timezone,_autor);
  update public.agenda_ferramentas set custodia_id=cid,version=version+1 where id=f.id;
 end loop;
end$$;
create function public.ag_registrar(_org uuid,_id uuid,_autor uuid,_anterior text,_efeito text) returns void language plpgsql security definer set search_path='' as $$declare e public.agenda_eventos;begin
 select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 insert into public.agenda_evento_revisoes(organization_id,evento_id,versao,snapshot,autor) values(_org,_id,e.version,jsonb_build_object('evento',to_jsonb(e),'participantes',coalesce((select jsonb_agg(to_jsonb(p) order by p.pessoa_id) from public.agenda_participantes p where p.organization_id=_org and p.evento_id=_id and p.vigente),'[]'::jsonb),'competencias',coalesce((select jsonb_agg(to_jsonb(r) order by r.competencia_id) from public.agenda_requisitos r where r.organization_id=_org and r.evento_id=_id),'[]'::jsonb),'ferramentas',coalesce((select jsonb_agg(to_jsonb(f) order by f.ferramenta_id) from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.vigente),'[]'::jsonb)),_autor);
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_anterior,estado_atual,motivo,autor) values(_org,'agenda_eventos',_id,case when e.gerado_automaticamente and e.version=1 then 'GERACAO_AUTOMATICA' when e.version=1 then 'INSERT' else 'UPDATE' end,e.version,_anterior,e.estado,e.motivo,_autor);
 if _efeito is not null then insert into public.outbox_eventos(organization_id,agenda_evento_id,entidade_version,tipo) values(_org,_id,e.version,_efeito);end if;
end$$;

create function public.ag_gravar(_org uuid,_autor uuid,_dados jsonb,_id uuid default null,_expected integer default null,_job uuid default null,_serie uuid default null,_serie_versao uuid default null,_data date default null) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare e public.agenda_eventos;novo uuid:=coalesce(_id,gen_random_uuid());periodo jsonb;resp uuid:=(_dados->>'responsavel_id')::uuid;item jsonb;pessoa uuid;papel text;compet uuid;eq uuid;m record;ant text;lev public.levantamentos;ferramentas_explicitas boolean:=_dados?'ferramentas';cliente uuid:=nullif(_dados->>'cliente_id','')::uuid;unidade uuid:=nullif(_dados->>'unidade_id','')::uuid;acao uuid:=nullif(_dados->>'acao_id','')::uuid;levant uuid:=nullif(_dados->>'levantamento_id','')::uuid;begin
 perform public.lev_travar_autor(_org,_autor);
 if not public.operacao_autor_pode(_org,_autor,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _id is not null and not ferramentas_explicitas then
  _dados:=_dados||jsonb_build_object('ferramentas',coalesce((select jsonb_agg(jsonb_build_object('ferramenta_id',f.ferramenta_id,'pessoa_id',f.pessoa_id) order by f.ferramenta_id) from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.vigente and(f.custodia_id is null or exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.id=f.custodia_id and c.estado in('reservada','retirada')))),'[]'::jsonb));
 end if;
 perform public.ag_payload(_dados,array['titulo','descricao','tipo','inicio','fim','inicio_local','fim_local','timezone','dia_inteiro','data_inicio','data_fim','local','responsavel_id','acao_id','levantamento_id','origem_ocorrencia','bloqueia_recursos','participantes','competencias','equipes','ferramentas','cliente_id','unidade_id','projeto_id','visibilidade']);
 perform public.ag_texto(_dados,'titulo',3,200);perform public.ag_texto(_dados,'descricao',0,4000);perform public.ag_texto(_dados,'local',0,1000);
 if jsonb_typeof(_dados->'participantes') is distinct from 'array' or jsonb_array_length(_dados->'participantes')>100 or jsonb_typeof(coalesce(_dados->'competencias','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'competencias','[]'))>50 or jsonb_typeof(coalesce(_dados->'equipes','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'equipes','[]'))>20 or jsonb_typeof(coalesce(_dados->'ferramentas','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'ferramentas','[]'))>30 then raise exception 'Confira listas de participantes,competências,equipes e ferramentas.' using errcode='23514';end if;
 if _dados?'bloqueia_recursos' and jsonb_typeof(_dados->'bloqueia_recursos')<>'boolean' then raise exception 'Bloqueio de recurso deve ser booleano.' using errcode='23514';end if;
 periodo:=public.ag_resolver_periodo(_dados);
 if num_nonnulls(acao,levant)>1 then raise exception 'Selecione uma origem operacional principal.' using errcode='23514';end if;
 perform public.ag_travar_origem(_org,acao,levant);
 if acao is not null and not public.ag_autor_acao(_org,acao,_autor) then raise exception 'Origem indisponível.' using errcode='42501';end if;
 if levant is not null then
  if not public.lev_autor_ler(_org,levant,_autor) then raise exception 'Origem indisponível.' using errcode='42501';end if;select * into lev from public.levantamentos where organization_id=_org and id=levant;
  if(cliente is not null and cliente<>lev.cliente_id) or(unidade is not null and unidade<>lev.unidade_id) then raise exception 'Contexto diverge do levantamento.' using errcode='23514';end if;cliente:=lev.cliente_id;unidade:=lev.unidade_id;
 end if;
 if not exists(select 1 from public.pessoas where organization_id=_org and id=resp and ativa) then raise exception 'Responsável ativo é obrigatório.' using errcode='23514';end if;
 perform public.ag_travar_ferramentas(_org,_id,_dados);
 if _id is not null then
  select * into e from public.agenda_eventos where organization_id=_org and id=_id for update;
  if not found or not public.ag_autor_ler(_org,_id,_autor) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if e.version is distinct from _expected then raise exception 'Versão desatualizada; recarregue e compare.' using errcode='40001';end if;
  if e.estado not in('rascunho','publicado') then raise exception 'Planejamento iniciado/encerrado é imutável.' using errcode='23514';end if;
  if e.acao_id is distinct from acao or e.levantamento_id is distinct from levant then raise exception 'Origem é imutável; cancele e crie outra visita.' using errcode='23514';end if;
  if ferramentas_explicitas then
   -- O comando explícito pode gerir somente uma custódia que já corresponde à janela anterior.
   insert into public.agenda_ferramentas(organization_id,evento_id,ferramenta_id,pessoa_id,custodia_id,created_by)
   select c.organization_id,c.agenda_evento_id,c.ferramenta_id,c.pessoa_id,c.id,_autor from public.ferramenta_custodias c
   where c.organization_id=_org and c.agenda_evento_id=_id and c.estado='reservada' and c.inicio=e.inicio and c.fim=e.fim and c.timezone=e.timezone
    and exists(select 1 from public.agenda_participantes pa where pa.organization_id=_org and pa.evento_id=_id and pa.pessoa_id=c.pessoa_id and pa.vigente and pa.funcao<>'observador')
    and not exists(select 1 from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.ferramenta_id=c.ferramenta_id and f.vigente);
  end if;
  perform public.ag_liberar_ferramentas(_org,_id,'Reserva substituída por revisão do evento');ant:=e.estado;
  update public.agenda_eventos set titulo=trim(_dados->>'titulo'),descricao=coalesce(_dados->>'descricao',''),tipo=_dados->>'tipo',inicio=(periodo->>'inicio')::timestamptz,fim=(periodo->>'fim')::timestamptz,timezone=periodo->>'timezone',dia_inteiro=(periodo->>'dia_inteiro')::boolean,data_inicio=(periodo->>'data_inicio')::date,data_fim=(periodo->>'data_fim')::date,local=coalesce(_dados->>'local',''),responsavel_id=resp,bloqueia_recursos=coalesce((_dados->>'bloqueia_recursos')::boolean,true),cliente_id=cliente,unidade_id=unidade,projeto_id=nullif(_dados->>'projeto_id','')::uuid,visibilidade=coalesce(_dados->>'visibilidade','participantes'),motivo='Planejamento atualizado',excecao=e.serie_id is not null where id=_id returning * into e;
  update public.agenda_participantes set vigente=false,retirado_em=clock_timestamp() where organization_id=_org and evento_id=_id and vigente;
  delete from public.agenda_requisitos where organization_id=_org and evento_id=_id;
  update public.agenda_ferramentas set vigente=false,version=version+1 where organization_id=_org and evento_id=_id and vigente;
  if e.serie_id is not null then insert into public.agenda_excecoes(organization_id,serie_id,serie_versao_id,evento_id,data_original,tipo,motivo,created_by) values(_org,e.serie_id,e.serie_versao_id,e.id,e.ocorrencia_data,'alterada','Somente esta ocorrência',_autor);end if;
 else
  if cliente is not null and not exists(select 1 from public.clientes where organization_id=_org and id=cliente and arquivado_em is null) then raise exception 'Cliente indisponível.' using errcode='23514';end if;
  if unidade is not null and not exists(select 1 from public.unidades where organization_id=_org and cliente_id=cliente and id=unidade and arquivado_em is null) then raise exception 'Unidade indisponível.' using errcode='23514';end if;
  insert into public.agenda_eventos(id,organization_id,titulo,descricao,tipo,inicio,fim,timezone,dia_inteiro,data_inicio,data_fim,local,responsavel_id,acao_id,levantamento_id,origem_ocorrencia,bloqueia_recursos,cliente_id,unidade_id,projeto_id,visibilidade,serie_id,serie_versao_id,ocorrencia_data,gerado_automaticamente,geracao_job_id,created_by)
  values(novo,_org,trim(_dados->>'titulo'),coalesce(_dados->>'descricao',''),_dados->>'tipo',(periodo->>'inicio')::timestamptz,(periodo->>'fim')::timestamptz,periodo->>'timezone',(periodo->>'dia_inteiro')::boolean,(periodo->>'data_inicio')::date,(periodo->>'data_fim')::date,coalesce(_dados->>'local',''),resp,acao,levant,case when num_nonnulls(acao,levant)>0 then coalesce(nullif(_dados->>'origem_ocorrencia',''),novo::text) end,coalesce((_dados->>'bloqueia_recursos')::boolean,true),cliente,unidade,nullif(_dados->>'projeto_id','')::uuid,coalesce(_dados->>'visibilidade','participantes'),_serie,_serie_versao,_data,_job is not null,_job,_autor) returning * into e;
 end if;
 insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,created_by) values(_org,novo,resp,'responsavel',_autor);
 for item in select value from jsonb_array_elements(_dados->'participantes') loop
  perform public.ag_payload(item,array['pessoa_id','funcao']);pessoa:=(item->>'pessoa_id')::uuid;papel:=coalesce(item->>'funcao','participante');
  if pessoa=resp then if papel<>'responsavel' then raise exception 'Responsável deve manter sua função única.' using errcode='23514';end if;continue;end if;
  if papel not in('participante','observador') or not exists(select 1 from public.pessoas where organization_id=_org and id=pessoa and ativa) then raise exception 'Participante/função indisponível.' using errcode='23514';end if;
  insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,created_by) values(_org,novo,pessoa,papel,_autor);
 end loop;
 for eq in select(value#>>'{}')::uuid from jsonb_array_elements(coalesce(_dados->'equipes','[]')) loop
  if not exists(select 1 from public.equipes where organization_id=_org and id=eq and ativa) then raise exception 'Equipe indisponível.' using errcode='23514';end if;
  for m in select em.* from public.equipe_membros em where em.organization_id=_org and em.equipe_id=eq and em.inicio<=(e.inicio at time zone e.timezone)::date and(em.fim is null or em.fim>=(e.inicio at time zone e.timezone)::date) order by em.pessoa_id,em.inicio loop
   if m.fim is not null and m.fim<((e.fim-interval '1 microsecond') at time zone e.timezone)::date then raise exception 'Vínculo de equipe termina antes da atividade; confira participantes.' using errcode='23514';end if;
   if not exists(select 1 from public.pessoas where organization_id=_org and id=m.pessoa_id and ativa) then raise exception 'Equipe contém pessoa inativa.' using errcode='23514';end if;
   if exists(select 1 from public.agenda_participantes where organization_id=_org and evento_id=novo and pessoa_id=m.pessoa_id and vigente) then continue;end if;
   insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,equipe_origem_id,equipe_inicio,created_by) values(_org,novo,m.pessoa_id,'participante',eq,m.inicio,_autor);
  end loop;
 end loop;
 if(select count(*) from public.agenda_participantes where organization_id=_org and evento_id=novo and vigente)>100 then raise exception 'Expansão excede100participantes.' using errcode='23514';end if;
 for compet in select(value#>>'{}')::uuid from jsonb_array_elements(coalesce(_dados->'competencias','[]')) loop
  insert into public.agenda_requisitos(organization_id,evento_id,competencia_id,nome,exige_evidencia,exige_validade) select _org,novo,c.id,c.nome,c.exige_evidencia,c.exige_validade from public.competencias c where c.organization_id=_org and c.id=compet and c.ativa;
  if not found then raise exception 'Competência indisponível.' using errcode='23514';end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(_dados->'ferramentas','[]')) loop
  perform public.ag_payload(item,array['ferramenta_id','pessoa_id']);
  if not exists(select 1 from public.agenda_participantes where organization_id=_org and evento_id=novo and pessoa_id=(item->>'pessoa_id')::uuid and vigente and funcao<>'observador') then raise exception 'Custodiante deve ser participante do evento.' using errcode='23514';end if;
  insert into public.agenda_ferramentas(organization_id,evento_id,ferramenta_id,pessoa_id,created_by) values(_org,novo,(item->>'ferramenta_id')::uuid,(item->>'pessoa_id')::uuid,_autor);
 end loop;
 perform public.agenda_reservar(_org,novo);perform public.ag_reservar_ferramentas(_org,novo,_autor,_job);perform public.ag_registrar(_org,novo,_autor,ant,case when e.estado='publicado' then 'agenda_alterada' end);return novo;
end$$;

create function public.ag_transicionar(_org uuid,_autor uuid,_id uuid,_expected integer,_estado text,_motivo text default null,_excecao boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos;ant text;gestor boolean:=public.operacao_autor_pode(_org,_autor,'gerir_operacao');begin
 perform public.lev_travar_autor(_org,_autor);select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 perform public.ag_travar_origem(_org,e.acao_id,e.levantamento_id);perform public.ag_travar_ferramentas(_org,_id);
 select * into e from public.agenda_eventos where organization_id=_org and id=_id for update;
 if not found or not public.ag_autor_ler(_org,_id,_autor) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if not gestor and not(_estado in('em_andamento','concluido') and e.responsavel_id=public.ag_pessoa(_org,_autor)) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if e.version is distinct from _expected then raise exception 'Versão desatualizada; recarregue e compare.' using errcode='40001';end if;
 if not((e.estado='rascunho' and _estado='publicado') or(e.estado='publicado' and _estado='em_andamento') or(e.estado='em_andamento' and _estado='concluido') or(e.estado in('rascunho','publicado') and _estado='cancelado')) then raise exception 'Transição não permitida.' using errcode='23514';end if;
 if _estado='cancelado' and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo com pelo menos5caracteres.' using errcode='23514';end if;
 ant:=e.estado;
 if _estado in('cancelado','concluido') then perform public.ag_liberar_ferramentas(_org,_id,case when _estado='cancelado' then _motivo else 'Visita concluída; reserva não retirada liberada' end,_estado='concluido');end if;
 update public.agenda_eventos set estado=_estado,motivo=_motivo,excecao=case when _excecao and serie_id is not null and _estado='cancelado' then true else excecao end where id=_id returning * into e;
 perform public.agenda_reservar(_org,_id);perform public.ag_reservar_ferramentas(_org,_id,_autor);
 if _excecao and e.serie_id is not null and _estado='cancelado' then insert into public.agenda_excecoes(organization_id,serie_id,serie_versao_id,evento_id,data_original,tipo,motivo,created_by) values(_org,e.serie_id,e.serie_versao_id,_id,e.ocorrencia_data,'cancelada',_motivo,_autor);end if;
 perform public.ag_registrar(_org,_id,_autor,ant,case _estado when 'publicado' then 'agenda_publicada' when 'em_andamento' then 'agenda_iniciada' when 'concluido' then 'agenda_concluida' when 'cancelado' then 'agenda_cancelada' end);return _id;
end$$;

create function public.ag_obter_acao(_org uuid,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.acoes_operacionais;g boolean:=public.operacao_pode(_org,'gerir_operacao');propria boolean;begin
 if not public.ag_autor_acao(_org,_id,auth.uid()) then raise exception 'Registro indisponível.' using errcode='42501';end if;select * into a from public.acoes_operacionais where organization_id=_org and id=_id;propria:=a.responsavel_id=public.ag_pessoa(_org,auth.uid());
 return jsonb_build_object('acao',to_jsonb(a),'responsavel_nome',(select nome from public.pessoas where organization_id=_org and id=a.responsavel_id),'permissoes',jsonb_build_object('iniciar',a.estado='aberta' and(g or propria),'devolver',a.estado='aguardando_verificacao' and(g or propria),'enviar_verificacao',a.estado='em_execucao' and(g or propria) and exists(select 1 from public.anexos where organization_id=_org and acao_id=_id and estado='vinculado'),'concluir',a.estado='aguardando_verificacao' and public.operacao_pode(_org,'revisar_operacao') and(not a.exige_verificacao or not public.operacao_identidade_propria(_org,a.responsavel_id)),'cancelar',g and a.estado not in('concluida','cancelada'),'agendar',g and a.estado not in('concluida','cancelada')));
end$$;
create function public.ag_opcoes(_org uuid,_tipo text,_busca text default '',_cliente uuid default null,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;begin
 if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _tipo not in('pessoas','equipes','acoes','levantamentos','ferramentas','clientes','unidades','projetos','competencias') or _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Opções/filtro inválido.' using errcode='23514';end if;
 with q as(
 select p.id,p.nome,coalesce(p.funcao,p.vinculo) contexto,null::uuid cliente_id,null::uuid unidade_id,p.id pessoa_id from public.pessoas p where _tipo='pessoas' and p.organization_id=_org and p.ativa
 union all select e.id,e.nome,'Equipe por vigência',null,null,null from public.equipes e where _tipo='equipes' and e.organization_id=_org and e.ativa
 union all select a.id,a.titulo,a.estado,null,null,a.responsavel_id from public.acoes_operacionais a where _tipo='acoes' and a.organization_id=_org and a.estado not in('concluida','cancelada') and public.ag_autor_acao(_org,a.id,auth.uid())
 union all select l.id,l.codigo||' · '||l.finalidade,r.estado,l.cliente_id,l.unidade_id,l.responsavel_id from public.levantamentos l join public.levantamento_revisoes r on r.organization_id=l.organization_id and r.id=l.revisao_atual_id where _tipo='levantamentos' and l.organization_id=_org and r.estado not in('aprovado','cancelado') and public.lev_ler(_org,l.id) and(_cliente is null or l.cliente_id=_cliente)
 union all select f.id,f.patrimonio||' · '||f.descricao,f.condicao,null,null,null from public.ferramentas f where _tipo='ferramentas' and f.organization_id=_org and f.condicao<>'desativada'
 union all select c.id,c.razao_social,c.situacao,c.id,null,null from public.clientes c where _tipo='clientes' and c.organization_id=_org and c.arquivado_em is null
 union all select u.id,u.nome,c.razao_social,u.cliente_id,u.id,null from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id where _tipo='unidades' and u.organization_id=_org and c.arquivado_em is null and u.arquivado_em is null and(_cliente is null or u.cliente_id=_cliente)
 union all select p.id,p.codigo,p.status,p.cliente_id,null,null from public.projetos p where _tipo='projetos' and p.organization_id=_org and(_cliente is null or p.cliente_id=_cliente)
 union all select c.id,c.nome,coalesce(c.descricao,''),null,null,null from public.competencias c where _tipo='competencias' and c.organization_id=_org and c.ativa
 ),filtered as(select * from q where strpos(lower(nome||' '||contexto),lower(coalesce(_busca,'')))>0)
 select(select count(*) from filtered),coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(x)) order by nome,id) from(select * from filtered order by nome,id offset _pagina*_limite limit _limite)x),'[]'::jsonb) into tot,arr;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite);
end$$;
create function public.ag_pendentes(_org uuid,_minhas boolean default true,_busca text default '',_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 with q as(
 select a.id,'acao'::text tipo,a.titulo,a.estado,a.responsavel_id,p.nome responsavel_nome,a.prazo,null::uuid cliente_id,null::uuid unidade_id from public.acoes_operacionais a join public.pessoas p on p.organization_id=a.organization_id and p.id=a.responsavel_id where a.organization_id=_org and a.estado not in('cancelada','concluida') and public.ag_autor_acao(_org,a.id,auth.uid()) and(not _minhas or a.responsavel_id=public.ag_pessoa(_org,auth.uid())) and not exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.acao_id=a.id and((e.estado='publicado' and e.fim>clock_timestamp()) or e.estado='em_andamento'))
 union all select l.id,'levantamento',l.codigo||' · '||l.finalidade,r.estado,l.responsavel_id,p.nome,null,l.cliente_id,l.unidade_id from public.levantamentos l join public.levantamento_revisoes r on r.organization_id=l.organization_id and r.id=l.revisao_atual_id join public.pessoas p on p.organization_id=l.organization_id and p.id=l.responsavel_id where l.organization_id=_org and r.estado not in('aprovado','cancelado') and public.lev_ler(_org,l.id) and(not _minhas or l.responsavel_id=public.ag_pessoa(_org,auth.uid())) and not exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.levantamento_id=l.id and((e.estado='publicado' and e.fim>clock_timestamp()) or e.estado='em_andamento'))
 ),filtered as(select * from q where strpos(lower(titulo),lower(coalesce(_busca,'')))>0)
 select(select count(*) from filtered),coalesce((select jsonb_agg(to_jsonb(x) order by prazo nulls last,titulo,id) from(select * from filtered order by prazo nulls last,titulo,id offset _pagina*_limite limit _limite)x),'[]'::jsonb) into tot,arr;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite);
end$$;
create function public.ag_notificacoes(_org uuid,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;n bigint;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;if _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 50 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 select count(*),count(*)filter(where lida_em is null) into tot,n from public.notificacoes where organization_id=_org and destinatario_id=auth.uid() and public.agenda_ler_evento(_org,agenda_evento_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'lida_em',x.lida_em,'created_at',x.created_at,'evento',public.ag_evento_json(_org,x.agenda_evento_id)) order by x.created_at desc,x.id),'[]') into arr from(select * from public.notificacoes where organization_id=_org and destinatario_id=auth.uid() and public.agenda_ler_evento(_org,agenda_evento_id) order by created_at desc,id offset _pagina*_limite limit _limite)x;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite,'nao_lidas',n);
end$$;

create function public.ag_modelo(_org uuid,_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('titulo',e.titulo,'descricao',e.descricao,'tipo',e.tipo,'inicio',e.inicio,'fim',e.fim,'timezone',e.timezone,'dia_inteiro',e.dia_inteiro,'data_inicio',e.data_inicio,'data_fim',e.data_fim,'local',e.local,'responsavel_id',e.responsavel_id,'acao_id',e.acao_id,'levantamento_id',e.levantamento_id,'bloqueia_recursos',e.bloqueia_recursos,'cliente_id',e.cliente_id,'unidade_id',e.unidade_id,'projeto_id',e.projeto_id,'visibilidade',e.visibilidade,
 'participantes',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',pessoa_id,'funcao',funcao) order by pessoa_id) from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente and equipe_origem_id is null),'[]'::jsonb),
 'competencias',coalesce((select jsonb_agg(competencia_id order by competencia_id) from public.agenda_requisitos where organization_id=_org and evento_id=_id),'[]'::jsonb),
 'equipes',coalesce((select jsonb_agg(eq order by eq) from(select distinct equipe_origem_id eq from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente and equipe_origem_id is not null)x),'[]'::jsonb),
 'ferramentas',coalesce((select jsonb_agg(jsonb_build_object('ferramenta_id',ferramenta_id,'pessoa_id',pessoa_id) order by ferramenta_id) from public.agenda_ferramentas where organization_id=_org and evento_id=_id and vigente),'[]'::jsonb)) from public.agenda_eventos e where e.organization_id=_org and e.id=_id;
$$;
create function public.ag_materializar(_org uuid,_serie uuid,_ate date,_job uuid default null,_estrito boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.agenda_series;v public.agenda_serie_versoes;d record;dados jsonb;eid uuid;existente public.agenda_serie_ocorrencias;de date;ate date;corte date;pedaco date;limite_pedaco date;n integer:=0;f integer:=0;codigo text;executor uuid;iniciado timestamptz:=clock_timestamp();incompleto boolean:=false;begin
 select * into s from public.agenda_series where organization_id=_org and id=_serie;
 if not found then return jsonb_build_object('processados',0,'falhas',0);end if;
 if _ate is null or not isfinite(_ate) then raise exception 'Horizonte inválido.' using errcode='23514';end if;
 if _job is not null and(auth.uid() is not null or not exists(select 1 from public.job_execucoes where id=_job and estado='em_execucao' and job='agenda-notificacoes')) then raise exception 'Contexto de job inválido.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
 select * into s from public.agenda_series where organization_id=_org and id=_serie for update;
 -- Não descartar pendências de versões anteriores ao corte. Cada versão conserva modelo e autor.
 for v in select * from public.agenda_serie_versoes where organization_id=_org and serie_id=_serie and(not _estrito or id=s.versao_atual_id) order by numero loop
  executor:=coalesce(auth.uid(),v.created_by);
  select min(inicio_aplicacao)-1 into corte from public.agenda_serie_versoes where organization_id=_org and serie_id=_serie and numero>v.numero;
  de:=v.inicio_aplicacao;ate:=least(_ate,coalesce(corte,_ate),coalesce(s.cancelamento_corte-1,_ate),((v.evento_modelo->>'inicio')::timestamptz at time zone v.timezone)::date+730);
  if ate<de then continue;end if;
  pedaco:=de;
  while pedaco<=ate loop
   limite_pedaco:=least(pedaco+59,ate);
   for d in select * from public.ag_expandir_datas(v.evento_modelo,v.regra,pedaco,limite_pedaco) loop
    if exists(select 1 from public.agenda_excecoes where organization_id=_org and serie_id=_serie and data_original=d.data) then continue;end if;
    select * into existente from public.agenda_serie_ocorrencias where organization_id=_org and serie_versao_id=v.id and data=d.data;
    if existente.estado in('materializada','ignorada') or(existente.estado='bloqueada' and existente.proxima_tentativa>clock_timestamp() and not _estrito) then continue;end if;
    if d.ignorada then
     insert into public.agenda_serie_ocorrencias(organization_id,serie_versao_id,data,estado,codigo,tentativas) values(_org,v.id,d.data,'ignorada','HORARIO_CIVIL_INEXISTENTE',1) on conflict(organization_id,serie_versao_id,data) do nothing;continue;
    end if;
    begin
     if _job is not null then perform public.lev_travar_autor(_org,v.created_by);if not public.operacao_autor_pode(_org,v.created_by,'gerir_operacao') then raise exception 'Solicitante da série sem autorização atual; confira a responsabilidade do planejamento.' using errcode='42501';end if;end if;
     dados:=v.evento_modelo||jsonb_build_object('inicio',d.inicio,'fim',d.fim,'data_inicio',case when(v.evento_modelo->>'dia_inteiro')::boolean then d.data end,'data_fim',case when(v.evento_modelo->>'dia_inteiro')::boolean then d.data+((v.evento_modelo->>'data_fim')::date-(v.evento_modelo->>'data_inicio')::date) end,'origem_ocorrencia',case when num_nonnulls(nullif(v.evento_modelo->>'acao_id',''),nullif(v.evento_modelo->>'levantamento_id',''))>0 then v.id::text||':'||d.data::text end);
     eid:=public.ag_gravar(_org,executor,dados,null,null,_job,s.id,v.id,d.data);
     if v.publicar then
      update public.agenda_eventos set estado='publicado' where organization_id=_org and id=eid;
      perform public.agenda_reservar(_org,eid);perform public.ag_reservar_ferramentas(_org,eid,executor,_job);perform public.ag_registrar(_org,eid,executor,'rascunho','agenda_publicada');
     end if;
     insert into public.agenda_serie_ocorrencias(organization_id,serie_versao_id,data,evento_id,estado,tentativas) values(_org,v.id,d.data,eid,'materializada',1)
      on conflict(organization_id,serie_versao_id,data) do update set evento_id=excluded.evento_id,estado='materializada',tentativas=public.agenda_serie_ocorrencias.tentativas+1,codigo=null,updated_at=clock_timestamp();n:=n+1;
    exception when others then
     if _estrito then raise;end if;get stacked diagnostics codigo=returned_sqlstate;
     insert into public.agenda_serie_ocorrencias(organization_id,serie_versao_id,data,estado,codigo,tentativas,proxima_tentativa) values(_org,v.id,d.data,'bloqueada',codigo,1,clock_timestamp()+interval '5 minutes')
      on conflict(organization_id,serie_versao_id,data) do update set estado='bloqueada',codigo=excluded.codigo,tentativas=public.agenda_serie_ocorrencias.tentativas+1,proxima_tentativa=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp();f:=f+1;
    end;
    if n+f>=200 or(not _estrito and(n+f>=25 or clock_timestamp()>iniciado+interval '10 seconds')) then incompleto:=true;exit;end if;
   end loop;
   exit when incompleto;pedaco:=limite_pedaco+1;
  end loop;
  exit when incompleto;
 end loop;
 update public.agenda_series set materializado_ate=greatest(materializado_ate,_ate),materializacao_pendente=incompleto,ultima_tentativa=clock_timestamp(),ultima_falha_codigo=null,updated_at=clock_timestamp() where organization_id=_org and id=_serie;
 return jsonb_build_object('processados',n,'falhas',f,'pendente',incompleto,'duracao_ms',floor(extract(epoch from clock_timestamp()-iniciado)*1000));
end$$;

create or replace function public.salvar_evento_agenda(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;eid uuid;payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version);begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 r:=public.operacao_repetir(_org,_chave,'salvar_evento_agenda',payload);
 if r is not null then eid:=(r->>'id')::uuid;if not public.agenda_ler_evento(_org,eid) then raise exception 'Acesso revogado.' using errcode='42501';end if;return(select to_jsonb(e) from public.agenda_eventos e where organization_id=_org and id=eid);end if;
 eid:=public.ag_gravar(_org,auth.uid(),_dados,_id,_expected_version);r:=(select to_jsonb(e) from public.agenda_eventos e where organization_id=_org and id=eid);perform public.operacao_concluir(_org,_chave,'salvar_evento_agenda',payload,jsonb_build_object('id',eid));return r;
end$$;
create or replace function public.transicionar_evento_agenda(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare e public.agenda_eventos;r jsonb;payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo);begin
 perform public.lev_travar_autor(_org,auth.uid());select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 if not public.agenda_ler_evento(_org,_id) or not(public.operacao_pode(_org,'gerir_operacao') or(_estado in('em_andamento','concluido') and e.responsavel_id=public.ag_pessoa(_org,auth.uid()))) then raise exception 'Acesso negado.' using errcode='42501';end if;
 r:=public.operacao_repetir(_org,_chave,'transicionar_evento_agenda',payload);if r is not null then return(select to_jsonb(x) from public.agenda_eventos x where x.organization_id=_org and x.id=_id);end if;
 perform public.ag_transicionar(_org,auth.uid(),_id,_expected_version,_estado,_motivo);r:=(select to_jsonb(x) from public.agenda_eventos x where x.organization_id=_org and x.id=_id);perform public.operacao_concluir(_org,_chave,'transicionar_evento_agenda',payload,jsonb_build_object('id',_id));return r;
end$$;
create or replace function public.confirmar_participacao_agenda(_org uuid,_chave uuid,_id uuid,_expected_version integer,_confirmacao text) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.agenda_participantes;r jsonb;payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'confirmacao',_confirmacao);begin
 perform public.lev_travar_autor(_org,auth.uid());select * into p from public.agenda_participantes where organization_id=_org and id=_id;
 perform 1 from public.agenda_eventos where organization_id=_org and id=p.evento_id for share;select * into p from public.agenda_participantes where organization_id=_org and id=_id for update;
 if not found or not p.vigente or p.pessoa_id is distinct from public.ag_pessoa(_org,auth.uid()) or not public.agenda_ler_evento(_org,p.evento_id) then raise exception 'Participação indisponível.' using errcode='42501';end if;
 r:=public.operacao_repetir(_org,_chave,'confirmar_participacao_agenda',payload);if r is not null then return to_jsonb(p);end if;
 if p.version is distinct from _expected_version then raise exception 'Participação alterada.' using errcode='40001';end if;
 if _confirmacao not in('confirmada','recusada') then raise exception 'Confirmação inválida.' using errcode='23514';end if;
 update public.agenda_participantes set confirmacao=_confirmacao,ciencia_em=clock_timestamp(),version=version+1 where id=_id returning * into p;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_atual) values(_org,'agenda_participantes',p.id,'UPDATE',p.version,_confirmacao);
 perform public.operacao_concluir(_org,_chave,'confirmar_participacao_agenda',payload,jsonb_build_object('id',p.id));return to_jsonb(p);
end$$;

create or replace function public.processar_notificacoes_agenda(_limite integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.outbox_eventos;n integer:=0;f integer:=0;codigo text;begin
 if _limite not between 1 and 200 then raise exception 'Lote inválido.' using errcode='23514';end if;
 for o in select * from public.outbox_eventos where estado='pendente' and disponivel_em<=clock_timestamp() order by id limit _limite for update skip locked loop
  begin
   insert into public.notificacoes(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo)
   select distinct o.organization_id,p.user_id,o.agenda_evento_id,o.entidade_version,o.tipo from public.agenda_participantes pa join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id left join public.agenda_preferencias pr on pr.organization_id=p.organization_id and pr.user_id=p.user_id
   where pa.organization_id=o.organization_id and pa.evento_id=o.agenda_evento_id and pa.vigente and p.ativa and p.user_id is not null and coalesce(pr.notificar,true) and public.ag_autor_ler(o.organization_id,o.agenda_evento_id,p.user_id)
   on conflict(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo) do nothing;
   update public.outbox_eventos set estado='concluido',tentativas=tentativas+1,concluido_em=clock_timestamp(),erro_codigo=null where id=o.id;n:=n+1;
  exception when others then get stacked diagnostics codigo=returned_sqlstate;update public.outbox_eventos set estado=case when tentativas>=5 then 'falha' else 'pendente' end,tentativas=tentativas+1,disponivel_em=clock_timestamp()+make_interval(secs=>least(3600,power(2,tentativas+1)::integer*30)),erro_codigo=codigo where id=o.id;f:=f+1;end;
 end loop;return jsonb_build_object('processados',n,'falhas',f);
end$$;
create function public.ag_lembretes(_limite integer default 200) returns jsonb language plpgsql security definer set search_path='' as $$declare n integer:=0;q integer;begin
 if _limite not between 1 and 500 then raise exception 'Lote inválido.' using errcode='23514';end if;
 insert into public.notificacoes(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo)
 select distinct e.organization_id,p.user_id,e.id,e.version,'agenda_lembrete' from public.agenda_eventos e join public.agenda_participantes pa on pa.organization_id=e.organization_id and pa.evento_id=e.id and pa.vigente join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id left join public.agenda_preferencias pr on pr.organization_id=p.organization_id and pr.user_id=p.user_id
 where e.estado='publicado' and e.inicio>=clock_timestamp() and e.inicio<=clock_timestamp()+make_interval(mins=>coalesce(pr.antecedencia_minutos,60)) and p.ativa and p.user_id is not null and coalesce(pr.notificar,true) and public.ag_autor_ler(e.organization_id,e.id,p.user_id) and not exists(select 1 from public.notificacoes n where n.organization_id=e.organization_id and n.destinatario_id=p.user_id and n.agenda_evento_id=e.id and n.entidade_version=e.version and n.tipo='agenda_lembrete')
 order by e.organization_id,p.user_id,e.id,e.version limit _limite on conflict(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo) do nothing;get diagnostics q=row_count;n:=n+q;
 insert into public.notificacoes(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo)
 select distinct e.organization_id,p.user_id,e.id,e.version,'agenda_atrasada' from public.agenda_eventos e join public.agenda_participantes pa on pa.organization_id=e.organization_id and pa.evento_id=e.id and pa.vigente join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id left join public.agenda_preferencias pr on pr.organization_id=p.organization_id and pr.user_id=p.user_id
 where((e.estado='publicado' and e.inicio<clock_timestamp()) or(e.estado='em_andamento' and e.fim<clock_timestamp())) and e.fim>clock_timestamp()-interval '93 days' and p.ativa and p.user_id is not null and coalesce(pr.notificar,true) and coalesce(pr.notificar_atrasos,true) and public.ag_autor_ler(e.organization_id,e.id,p.user_id) and not exists(select 1 from public.notificacoes n where n.organization_id=e.organization_id and n.destinatario_id=p.user_id and n.agenda_evento_id=e.id and n.entidade_version=e.version and n.tipo='agenda_atrasada')
 order by e.organization_id,p.user_id,e.id,e.version limit _limite on conflict(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo) do nothing;get diagnostics q=row_count;n:=n+q;
 return jsonb_build_object('processados',n,'falhas',0);
end$$;
create or replace function public.executar_job_agenda_notificacoes() returns jsonb language plpgsql security definer set search_path='' as $$
declare execucao uuid;r jsonb;sr record;v public.agenda_serie_versoes;n integer:=0;f integer:=0;codigo text;inicio_job timestamptz:=clock_timestamp();begin
 if auth.uid() is not null then raise exception 'O job requer contexto de backend sem sessão de usuário.' using errcode='42501';end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nexus:job:agenda-notificacoes',0)) then return jsonb_build_object('ignorado',true,'motivo','execucao_em_andamento');end if;
 insert into public.job_execucoes(job,estado) values('agenda-notificacoes','em_execucao') returning id into execucao;
 for sr in select s.id,s.organization_id from public.agenda_series s where s.estado='ativa' or(s.cancelamento_corte is not null and(s.materializacao_pendente or s.ultima_falha_codigo is not null or s.materializado_ate<s.cancelamento_corte-1 or exists(select 1 from public.agenda_serie_ocorrencias o join public.agenda_serie_versoes sv on sv.organization_id=o.organization_id and sv.id=o.serie_versao_id where sv.organization_id=s.organization_id and sv.serie_id=s.id and o.estado='bloqueada' and o.data<s.cancelamento_corte))) order by s.ultima_tentativa nulls first,s.id limit 20 loop
  begin
   select vv.* into v from public.agenda_serie_versoes vv join public.agenda_series s on s.versao_atual_id=vv.id where s.id=sr.id;
   r:=public.ag_materializar(sr.organization_id,sr.id,(clock_timestamp() at time zone v.timezone)::date+60,execucao,false);n:=n+coalesce((r->>'processados')::integer,0);f:=f+coalesce((r->>'falhas')::integer,0);
  exception when others then get stacked diagnostics codigo=returned_sqlstate;update public.agenda_series set ultima_tentativa=clock_timestamp(),ultima_falha_codigo=codigo where id=sr.id;f:=f+1;end;
  exit when n+f>=200 or clock_timestamp()>inicio_job+interval '20 seconds';
 end loop;
 begin
  r:=public.ag_lembretes(200);n:=n+(r->>'processados')::integer;
  r:=public.processar_notificacoes_agenda(100);n:=n+(r->>'processados')::integer;f:=f+(r->>'falhas')::integer;
 exception when others then get stacked diagnostics codigo=returned_sqlstate;f:=f+1;end;
 update public.job_execucoes set finalizado_em=clock_timestamp(),estado=case when f>0 then 'falha' else 'sucesso' end,processados=n,falhas=f,erro_codigo=codigo where id=execucao;
 return jsonb_build_object('execucao_id',execucao,'resultado',jsonb_build_object('processados',n,'falhas',f));
end$$;

create function public.ag_permissoes(_org uuid,_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('editar',g and e.estado in('rascunho','publicado'),'publicar',g and e.estado='rascunho','iniciar',(g or propria) and e.estado='publicado','concluir',(g or propria) and e.estado='em_andamento','cancelar',g and e.estado in('rascunho','publicado'),'confirmar',exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid())),'comentar',true,'editar_serie',g and exists(select 1 from public.agenda_series s where s.organization_id=_org and s.id=e.serie_id and s.estado='ativa'),'abrir_origem',num_nonnulls(e.acao_id,e.levantamento_id)>0)
 from public.agenda_eventos e cross join lateral(select public.operacao_pode(_org,'gerir_operacao') g,e.responsavel_id=public.ag_pessoa(_org,auth.uid()) propria)x where e.organization_id=_org and e.id=_id and public.agenda_ler_evento(_org,_id);
$$;
create function public.ag_evento_json(_org uuid,_id uuid,_de date default null,_ate date default null,_tz text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('responsavel_nome',p.nome,'cliente_nome',c.razao_social,'unidade_nome',u.nome,'minha_confirmacao',(select pa.confirmacao from public.agenda_participantes pa where pa.organization_id=_org and pa.evento_id=e.id and pa.vigente and pa.pessoa_id=public.ag_pessoa(_org,auth.uid())),
 'dias_visiveis',case when _de is null or _ate is null then '[]'::jsonb else coalesce((select jsonb_agg(d::date order by d) from generate_series(_de::timestamp,(_ate-1)::timestamp,interval '1 day')d where(e.dia_inteiro and d::date>=e.data_inicio and d::date<e.data_fim) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(d at time zone _tz,(d+interval '1 day') at time zone _tz,'[)'))),'[]'::jsonb) end,
 'origem',jsonb_build_object('tipo',case when e.acao_id is not null then 'acao' when e.levantamento_id is not null then 'levantamento' else 'independente' end,'id',coalesce(e.acao_id,e.levantamento_id),'titulo',case when e.acao_id is not null then a.titulo when e.levantamento_id is not null then l.codigo||' · '||l.finalidade end,'estado',case when e.acao_id is not null then a.estado when e.levantamento_id is not null then lr.estado end),'permissoes',public.ag_permissoes(_org,e.id))
 from public.agenda_eventos e join public.pessoas p on p.organization_id=e.organization_id and p.id=e.responsavel_id left join public.clientes c on c.organization_id=e.organization_id and c.id=e.cliente_id left join public.unidades u on u.organization_id=e.organization_id and u.id=e.unidade_id left join public.acoes_operacionais a on a.organization_id=e.organization_id and a.id=e.acao_id left join public.levantamentos l on l.organization_id=e.organization_id and l.id=e.levantamento_id left join public.levantamento_revisoes lr on lr.organization_id=l.organization_id and lr.id=l.revisao_atual_id where e.organization_id=_org and e.id=_id and public.agenda_ler_evento(_org,_id);
$$;
create function public.ag_serie_json(_org uuid,_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('versao_id',v.id,'numero',v.numero,'regra',v.regra,'timezone',v.timezone,'inicio_aplicacao',v.inicio_aplicacao,'pendencias',q.n+case when s.ultima_falha_codigo is not null or s.materializacao_pendente then 1 else 0 end,'permissoes',jsonb_build_object('editar',public.operacao_pode(_org,'gerir_operacao') and s.estado='ativa','cancelar',public.operacao_pode(_org,'gerir_operacao') and s.estado='ativa','reprocessar',public.operacao_pode(_org,'gerir_operacao') and(s.estado='ativa' or q.n>0 or s.ultima_falha_codigo is not null or s.materializacao_pendente)))
 from public.agenda_series s join public.agenda_serie_versoes v on v.organization_id=s.organization_id and v.id=s.versao_atual_id
 cross join lateral(select count(*) n from public.agenda_serie_ocorrencias o join public.agenda_serie_versoes ov on ov.organization_id=o.organization_id and ov.id=o.serie_versao_id where o.organization_id=_org and ov.serie_id=s.id and o.estado='bloqueada' and(s.cancelamento_corte is null or o.data<s.cancelamento_corte) and not exists(select 1 from public.agenda_serie_versoes nv where nv.organization_id=_org and nv.serie_id=s.id and nv.numero>ov.numero and nv.inicio_aplicacao<=o.data))q
 where s.organization_id=_org and s.id=_id;
$$;
create function public.ag_historico(_org uuid,_id uuid,_tipo text,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;begin
 if not public.agenda_ler_evento(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if _pagina<0 or _pagina is null or _limite not between 1 and 100 or _limite is null then raise exception 'Paginação inválida.' using errcode='23514';end if;
 if _tipo='revisoes' then
  select count(*) into tot from public.agenda_evento_revisoes where organization_id=_org and evento_id=_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by versao desc),'[]') into arr from(select versao,snapshot,autor,created_at from public.agenda_evento_revisoes where organization_id=_org and evento_id=_id order by versao desc offset _pagina*_limite limit _limite)q;
 elsif _tipo='comentarios' then
  select count(*) into tot from public.agenda_comentarios where organization_id=_org and evento_id=_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id),'[]') into arr from(select c.*,coalesce(p.nome,'Usuário da organização') autor_nome from public.agenda_comentarios c left join public.pessoas p on p.organization_id=c.organization_id and p.user_id=c.created_by where c.organization_id=_org and c.evento_id=_id order by c.created_at desc,c.id offset _pagina*_limite limit _limite)q;
 else raise exception 'Histórico inválido.' using errcode='23514';end if;return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite);
end$$;
create function public.ag_obter(_org uuid,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare e public.agenda_eventos;begin
 if not public.agenda_ler_evento(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 return jsonb_build_object('evento',public.ag_evento_json(_org,_id),
 'participantes',coalesce((select jsonb_agg(to_jsonb(pa)||jsonb_build_object('pessoa_nome',p.nome,'pode_confirmar',pa.vigente and pa.pessoa_id=public.ag_pessoa(_org,auth.uid())) order by case pa.funcao when 'responsavel' then 0 when 'participante' then 1 else 2 end,p.nome,pa.id) from public.agenda_participantes pa join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id where pa.organization_id=_org and pa.evento_id=_id and pa.vigente),'[]'::jsonb),
 'competencias',coalesce((select jsonb_agg(jsonb_build_object('competencia_id',r.competencia_id,'nome',r.nome,'exige_evidencia',r.exige_evidencia,'exige_validade',r.exige_validade) order by r.nome,r.competencia_id) from public.agenda_requisitos r where r.organization_id=_org and r.evento_id=_id),'[]'::jsonb),
 'ferramentas',coalesce((select jsonb_agg(jsonb_build_object('id',af.id,'ferramenta_id',af.ferramenta_id,'patrimonio',f.patrimonio,'descricao',f.descricao,'pessoa_id',af.pessoa_id,'pessoa_nome',p.nome,'custodia_id',af.custodia_id,'estado',coalesce(c.estado,'planejada'),'version',af.version) order by f.patrimonio,af.id) from public.agenda_ferramentas af join public.ferramentas f on f.organization_id=af.organization_id and f.id=af.ferramenta_id join public.pessoas p on p.organization_id=af.organization_id and p.id=af.pessoa_id left join public.ferramenta_custodias c on c.organization_id=af.organization_id and c.id=af.custodia_id where af.organization_id=_org and af.evento_id=_id and af.vigente),'[]'::jsonb),
 'historico',public.ag_historico(_org,_id,'revisoes'),'comentarios',public.ag_historico(_org,_id,'comentarios'),'serie',public.ag_serie_json(_org,e.serie_id),'bloqueios',public.ag_bloqueios(_org,_id),'permissoes',public.ag_permissoes(_org,_id),'server_now',clock_timestamp());
end$$;
create function public.ag_listar(_org uuid,_inicio date,_fim date,_timezone text,_minha boolean default false,_busca text default '',_estado text default null,_tipo text default null,_equipe uuid default null,_pagina integer default 0,_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare arr jsonb;dias jsonb;tot bigint;gestor boolean:=public.operacao_pode(_org,'gerir_operacao');begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;perform public.ag_fuso(_timezone);
 if _inicio is null or _fim is null or not isfinite(_inicio) or not isfinite(_fim) or _fim<=_inicio or _fim>_inicio+93 or _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 100 or length(coalesce(_busca,''))>200 then raise exception 'Informe janela de até93dias e paginação válida.' using errcode='23514';end if;
 with q as(select e.id,e.inicio from public.agenda_eventos e where e.organization_id=_org and public.agenda_ler_evento(_org,e.id)
 and((e.dia_inteiro and daterange(e.data_inicio,e.data_fim,'[)')&&daterange(_inicio,_fim,'[)')) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(_inicio::timestamp at time zone _timezone,_fim::timestamp at time zone _timezone,'[)')))
 and(_estado is null or e.estado=_estado) and(_tipo is null or e.tipo=_tipo) and strpos(lower(e.titulo||' '||e.local),lower(coalesce(_busca,'')))>0
 and(not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid())))
 and(_equipe is null or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.equipe_origem_id=_equipe)))
 select(select count(*) from q),coalesce((select jsonb_agg(public.ag_evento_json(_org,x.id,_inicio,_fim,_timezone) order by x.inicio,x.id) from(select * from q order by inicio,id offset _pagina*_limite limit _limite)x),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('data',d::date,'total',(select count(*) from q join public.agenda_eventos e on e.id=q.id where(e.dia_inteiro and d::date>=e.data_inicio and d::date<e.data_fim) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(d at time zone _timezone,(d+interval '1 day') at time zone _timezone,'[)')))) order by d) from generate_series(_inicio::timestamp,(_fim-1)::timestamp,interval '1 day')d),'[]'::jsonb) into tot,arr,dias;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite,'inicio',_inicio,'fim',_fim,'timezone',_timezone,'dias',dias,'permissoes',jsonb_build_object('criar',gestor,'criar_acao',gestor,'gerir_series',gestor),'minha_pessoa_id',public.ag_pessoa(_org,auth.uid()));
end$$;
create function public.ag_configuracao(_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p jsonb;g boolean:=public.operacao_pode(_org,'gerir_operacao');begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select jsonb_build_object('antecedencia_minutos',antecedencia_minutos,'notificar_atrasos',notificar_atrasos,'notificar',notificar) into p from public.agenda_preferencias where organization_id=_org and user_id=auth.uid();
 return jsonb_build_object('minha_pessoa_id',public.ag_pessoa(_org,auth.uid()),'timezone',(select timezone from public.organizations where id=_org),'server_now',clock_timestamp(),'permissoes',jsonb_build_object('criar',g,'criar_acao',g,'gerir_series',g),'preferencias',coalesce(p,jsonb_build_object('antecedencia_minutos',60,'notificar_atrasos',true,'notificar',true)),'jobs',case when g then public.consultar_jobs_operacionais(_org) end);
end$$;

create function public.ag_serie_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.organization_id<>old.organization_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Identidade da série é imutável.' using errcode='23514';end if;
 new.version:=old.version+case when new.versao_atual_id is distinct from old.versao_atual_id or new.estado is distinct from old.estado then 1 else 0 end;new.updated_at:=clock_timestamp();return new;end$$;
create trigger ag_serie_guard before update on public.agenda_series for each row execute function public.ag_serie_guard();
create function public.ag_serie_comando(_org uuid,_autor uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare s public.agenda_series;v public.agenda_serie_versoes;e public.agenda_eventos;x record;novo uuid;regra jsonb;modelo jsonb;periodo jsonb;boundary date;anchor date;scope text;mot text;dia date;resultado jsonb;begin
 perform public.lev_travar_autor(_org,_autor);if not public.operacao_autor_pode(_org,_autor,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _comando='criar_serie' then
  perform public.ag_payload(_dados,array['evento_id','expected_version','regra']);select * into e from public.agenda_eventos where organization_id=_org and id=(_dados->>'evento_id')::uuid;
  perform public.ag_travar_ferramentas(_org,e.id);select * into e from public.agenda_eventos where organization_id=_org and id=e.id for update;
  if e.id is null or not public.ag_autor_ler(_org,e.id,_autor) then raise exception 'Evento indisponível.' using errcode='42501';end if;
  if e.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Versão desatualizada.' using errcode='40001';end if;
  if e.serie_id is not null or e.estado not in('rascunho','publicado') then raise exception 'Escolha evento independente em rascunho/publicado.' using errcode='23514';end if;
  modelo:=public.ag_modelo(_org,e.id);regra:=public.ag_validar_regra(modelo,_dados->'regra');anchor:=(e.inicio at time zone e.timezone)::date;
  if not exists(select 1 from public.ag_expandir_datas(modelo,regra,anchor,anchor)) then raise exception 'A data inicial deve corresponder aos dias escolhidos na recorrência.' using errcode='23514';end if;
  if anchor<(clock_timestamp() at time zone e.timezone)::date-93 then raise exception 'Âncora anterior a93dias; escolha nova atividade futura.' using errcode='23514';end if;
  insert into public.agenda_series(organization_id,created_by) values(_org,_autor) returning * into s;
  insert into public.agenda_serie_versoes(organization_id,serie_id,numero,regra,evento_modelo,timezone,inicio_aplicacao,publicar,created_by) values(_org,s.id,1,regra,modelo,e.timezone,anchor,e.estado='publicado',_autor) returning * into v;
  update public.agenda_series set versao_atual_id=v.id where id=s.id;
  update public.agenda_eventos set serie_id=s.id,serie_versao_id=v.id,ocorrencia_data=anchor where id=e.id returning * into e;
  perform public.ag_registrar(_org,e.id,_autor,e.estado,case when e.estado='publicado' then 'agenda_alterada' end);
  insert into public.agenda_serie_ocorrencias(organization_id,serie_versao_id,data,evento_id,estado,tentativas) values(_org,v.id,anchor,e.id,'materializada',1);
  resultado:=public.ag_materializar(_org,s.id,(clock_timestamp() at time zone e.timezone)::date+60,null,true);
  return jsonb_build_object('id',s.id,'evento_id',e.id,'serie',public.ag_serie_json(_org,s.id));
 end if;
 select * into s from public.agenda_series where organization_id=_org and id=(_dados->>'serie_id')::uuid for update;
 if not found then raise exception 'Série indisponível.' using errcode='42501';end if;
 select * into v from public.agenda_serie_versoes where organization_id=_org and id=s.versao_atual_id;
 if not public.operacao_autor_pode(_org,_autor,'gerir_operacao') or(nullif(v.evento_modelo->>'acao_id','') is not null and not public.ag_autor_acao(_org,(v.evento_modelo->>'acao_id')::uuid,_autor)) or(nullif(v.evento_modelo->>'levantamento_id','') is not null and not public.lev_autor_ler(_org,(v.evento_modelo->>'levantamento_id')::uuid,_autor)) then raise exception 'Origem indisponível.' using errcode='42501';end if;
 if s.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Série alterada; recarregue antes de salvar.' using errcode='40001';end if;
 if s.estado<>'ativa' and _comando<>'reprocessar_serie' then raise exception 'Série cancelada é imutável.' using errcode='23514';end if;
 if _comando='reprocessar_serie' then
  perform public.ag_payload(_dados,array['serie_id','expected_version']);update public.agenda_serie_ocorrencias set proxima_tentativa=clock_timestamp() where organization_id=_org and serie_versao_id in(select id from public.agenda_serie_versoes where organization_id=_org and serie_id=s.id) and estado='bloqueada';resultado:=public.ag_materializar(_org,s.id,(clock_timestamp() at time zone v.timezone)::date+60,null,false);
  return jsonb_build_object('id',s.id,'evento_id',null,'serie',public.ag_serie_json(_org,s.id));
 end if;
 if _comando not in('editar_serie','cancelar_serie') then raise exception 'Comando de série inválido.' using errcode='23514';end if;
 perform public.ag_payload(_dados,array['serie_id','expected_version','escopo','evento_id','evento','regra','motivo']);mot:=public.ag_texto(_dados,'motivo',5,2000);scope:=_dados->>'escopo';
 if scope not in('esta_e_futuras','todas_futuras') then raise exception 'Escopo de série inválido.' using errcode='23514';end if;
 boundary:=(clock_timestamp() at time zone v.timezone)::date;
 if scope='esta_e_futuras' then
  select * into e from public.agenda_eventos where organization_id=_org and serie_id=s.id and id=(_dados->>'evento_id')::uuid;
  if not found or not public.ag_autor_ler(_org,e.id,_autor) or e.inicio<clock_timestamp() or e.estado not in('rascunho','publicado') then raise exception 'Escolha uma ocorrência futura ainda não iniciada.' using errcode='23514';end if;boundary:=e.ocorrencia_data;
 end if;
 -- Uma única transação cancela as reservas antigas e aplica a nova versão. Retirada impede tudo.
 for x in select id,version from public.agenda_eventos where organization_id=_org and serie_id=s.id and ocorrencia_data>=boundary and inicio>=clock_timestamp() and estado in('rascunho','publicado') and(_comando='cancelar_serie' or not excecao) order by id loop
  perform public.ag_transicionar(_org,_autor,x.id,x.version,'cancelado',mot,false);
 end loop;
 if _comando='cancelar_serie' then
  update public.agenda_series set estado='cancelada',cancelamento_corte=boundary where id=s.id;
  return jsonb_build_object('id',s.id,'evento_id',null,'serie',public.ag_serie_json(_org,s.id));
 end if;
 periodo:=public.ag_resolver_periodo(_dados->'evento');modelo:=((_dados->'evento')-'inicio_local'-'fim_local')||periodo;
 if nullif(modelo->>'acao_id','') is distinct from nullif(v.evento_modelo->>'acao_id','') or nullif(modelo->>'levantamento_id','') is distinct from nullif(v.evento_modelo->>'levantamento_id','') then raise exception 'Origem da série é imutável.' using errcode='23514';end if;
 -- O novo horário civil aplica-se desde o corte; não perde ocorrências anteriores ao item aberto.
 anchor:=case when scope='esta_e_futuras' then boundary else greatest(boundary,v.inicio_aplicacao) end;
 if not coalesce((modelo->>'dia_inteiro')::boolean,false) then
  modelo:=modelo||jsonb_build_object('inicio',(anchor+((periodo->>'inicio')::timestamptz at time zone(periodo->>'timezone'))::time) at time zone(periodo->>'timezone'),'fim',((anchor+((periodo->>'inicio')::timestamptz at time zone(periodo->>'timezone'))::time)+(((periodo->>'fim')::timestamptz at time zone(periodo->>'timezone'))-((periodo->>'inicio')::timestamptz at time zone(periodo->>'timezone')))) at time zone(periodo->>'timezone'));
 else
  dia:=(periodo->>'data_fim')::date-(periodo->>'data_inicio')::date+anchor;modelo:=modelo||jsonb_build_object('data_inicio',anchor,'data_fim',dia,'inicio',anchor::timestamp at time zone(periodo->>'timezone'),'fim',dia::timestamp at time zone(periodo->>'timezone'));
 end if;
 regra:=public.ag_validar_regra(modelo,_dados->'regra');
 insert into public.agenda_serie_versoes(organization_id,serie_id,numero,regra,evento_modelo,timezone,inicio_aplicacao,publicar,motivo,created_by) values(_org,s.id,v.numero+1,regra,modelo,modelo->>'timezone',anchor,v.publicar,mot,_autor) returning id into novo;
 update public.agenda_series set versao_atual_id=novo where id=s.id;
 resultado:=public.ag_materializar(_org,s.id,(clock_timestamp() at time zone(modelo->>'timezone'))::date+60,null,true);
 return jsonb_build_object('id',s.id,'evento_id',null,'serie',public.ag_serie_json(_org,s.id));
end$$;

-- As ações continuam na entidade canônica. Só endurecer o lock/autorização do caminho existente.
alter function public.salvar_acao_operacional(uuid,uuid,jsonb,uuid,integer) rename to ag_salvar_acao_base;
alter function public.transicionar_acao_operacional(uuid,uuid,uuid,integer,text,text) rename to ag_transicionar_acao_base;
create function public.salvar_acao_operacional(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;r:=public.ag_salvar_acao_base(_org,_chave,_dados,_id,_expected_version);
 if not public.ag_autor_acao(_org,(r->>'id')::uuid,auth.uid()) then raise exception 'Acesso revogado.' using errcode='42501';end if;return(select to_jsonb(a) from public.acoes_operacionais a where a.organization_id=_org and a.id=(r->>'id')::uuid);
end$$;
create function public.transicionar_acao_operacional(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.acoes_operacionais;r jsonb;begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.ag_autor_acao(_org,_id,auth.uid()) then raise exception 'Registro indisponível.' using errcode='42501';end if;select * into a from public.acoes_operacionais where organization_id=_org and id=_id for update;
 if not(public.operacao_pode(_org,'gerir_operacao') or public.operacao_minha_pessoa(_org,a.responsavel_id)) or(_estado='cancelada' and not public.operacao_pode(_org,'gerir_operacao')) or(_estado='concluida' and(not public.operacao_pode(_org,'revisar_operacao') or(a.exige_verificacao and public.operacao_identidade_propria(_org,a.responsavel_id)))) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if a.estado='aguardando_verificacao' and _estado='em_execucao' and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe o motivo da devolução com pelo menos 5 caracteres.' using errcode='23514';end if;
 r:=public.ag_transicionar_acao_base(_org,_chave,_id,_expected_version,_estado,_motivo);return(select to_jsonb(x) from public.acoes_operacionais x where x.organization_id=_org and x.id=_id);
end$$;

create function public.ag_resultado(_org uuid,_r jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$declare detalhe jsonb;begin
 case _r->>'tipo'
 when 'evento' then detalhe:=public.ag_obter(_org,(_r->>'evento_id')::uuid);
 when 'acao' then detalhe:=jsonb_build_object('acao',public.ag_obter_acao(_org,(_r->>'acao_id')::uuid)->'acao','evento',case when nullif(_r->>'evento_id','') is not null then public.ag_obter(_org,(_r->>'evento_id')::uuid) end);
 when 'serie' then
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  detalhe:=jsonb_build_object('serie',public.ag_serie_json(_org,(_r->>'id')::uuid),'evento',case when nullif(_r->>'evento_id','') is not null then public.ag_obter(_org,(_r->>'evento_id')::uuid) end);
 when 'comentario' then detalhe:=jsonb_build_object('comentario',(select to_jsonb(c) from public.agenda_comentarios c where c.organization_id=_org and c.id=(_r->>'id')::uuid),'evento',public.ag_obter(_org,(_r->>'evento_id')::uuid));
 when 'preferencias' then detalhe:=public.ag_configuracao(_org)->'preferencias';
 when 'job' then detalhe:=public.consultar_jobs_operacionais(_org);
 when 'leitura' then select jsonb_build_object('notificacao_id',id,'lida_em',lida_em) into detalhe from public.notificacoes where organization_id=_org and id=(_r->>'id')::uuid and destinatario_id=auth.uid() and public.agenda_ler_evento(_org,agenda_evento_id);if detalhe is null then raise exception 'Registro indisponível.' using errcode='42501';end if;
 else raise exception 'Recibo inválido.' using errcode='23514';end case;return _r||jsonb_build_object('detalhe',detalhe);
end$$;
create function public.ag_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;ret jsonb;payload jsonb:=jsonb_build_object('dados',_dados);eid uuid:=nullif(_dados->>'evento_id','')::uuid;aid uuid;cid uuid;sid uuid;tipo text;gestor boolean;p public.agenda_participantes;e public.agenda_eventos;x jsonb;estado text;begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;gestor:=public.operacao_pode(_org,'gerir_operacao');
 if _chave is null then raise exception 'Chave idempotente obrigatória.' using errcode='23514';end if;
 if _comando in('salvar_evento','publicar','cancelar','criar_acao','criar_serie','editar_serie','cancelar_serie','reprocessar_serie','reprocessar_notificacoes') and not gestor then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _comando in('iniciar','concluir') then select * into e from public.agenda_eventos where organization_id=_org and id=eid;if not public.agenda_ler_evento(_org,eid) or(not gestor and e.responsavel_id is distinct from public.ag_pessoa(_org,auth.uid())) then raise exception 'Acesso negado.' using errcode='42501';end if;end if;
 if _comando in('salvar_evento','publicar','cancelar','comentar') and eid is not null and not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if _comando='confirmar' then
  select * into p from public.agenda_participantes where organization_id=_org and id=(_dados->>'participante_id')::uuid;
  if p.id is null or not p.vigente or p.pessoa_id is distinct from public.ag_pessoa(_org,auth.uid()) or not public.agenda_ler_evento(_org,p.evento_id) then raise exception 'Participação indisponível.' using errcode='42501';end if;eid:=p.evento_id;
 end if;
 if _comando='transicionar_acao' then
  aid:=(_dados->>'acao_id')::uuid;
  if not public.ag_autor_acao(_org,aid,auth.uid()) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  perform 1 from public.acoes_operacionais where organization_id=_org and id=aid for update;
  x:=public.ag_obter_acao(_org,aid);
  if not(gestor or public.operacao_minha_pessoa(_org,(x->'acao'->>'responsavel_id')::uuid)) or(_dados->>'estado'='cancelada' and not gestor) or(_dados->>'estado'='concluida' and(not public.operacao_pode(_org,'revisar_operacao') or((x->'acao'->>'exige_verificacao')::boolean and public.operacao_identidade_propria(_org,(x->'acao'->>'responsavel_id')::uuid)))) then raise exception 'Acesso negado.' using errcode='42501';end if;
 end if;
 r:=public.operacao_repetir(_org,_chave,'ag:'||_comando,payload);if r is not null then return public.ag_resultado(_org,r);end if;
 if _comando='salvar_evento' then
  perform public.ag_payload(_dados,array['evento_id','expected_version','evento']);eid:=public.ag_gravar(_org,auth.uid(),_dados->'evento',eid,(_dados->>'expected_version')::integer);tipo:='evento';cid:=eid;
 elsif _comando in('publicar','iniciar','concluir','cancelar') then
  perform public.ag_payload(_dados,array['evento_id','expected_version','motivo']);estado:=case _comando when 'publicar' then 'publicado' when 'iniciar' then 'em_andamento' when 'concluir' then 'concluido' else 'cancelado' end;
  perform public.ag_transicionar(_org,auth.uid(),eid,(_dados->>'expected_version')::integer,estado,_dados->>'motivo');tipo:='evento';cid:=eid;
 elsif _comando='confirmar' then
  perform public.ag_payload(_dados,array['participante_id','expected_version','confirmacao']);perform public.confirmar_participacao_agenda(_org,gen_random_uuid(),p.id,(_dados->>'expected_version')::integer,_dados->>'confirmacao');tipo:='evento';cid:=eid;
 elsif _comando='comentar' then
  perform public.ag_payload(_dados,array['evento_id','texto']);if not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  insert into public.agenda_comentarios(organization_id,evento_id,texto) values(_org,eid,public.ag_texto(_dados,'texto',3,4000)) returning id into cid;tipo:='comentario';
 elsif _comando='criar_acao' then
  perform public.ag_payload(_dados,array['acao','evento']);x:=public.salvar_acao_operacional(_org,gen_random_uuid(),_dados->'acao');aid:=(x->>'id')::uuid;
  if _dados->'evento' is not null and jsonb_typeof(_dados->'evento')<>'null' then eid:=public.ag_gravar(_org,auth.uid(),(_dados->'evento')||jsonb_build_object('acao_id',aid,'levantamento_id',null));end if;tipo:='acao';cid:=aid;
 elsif _comando='transicionar_acao' then
  perform public.ag_payload(_dados,array['acao_id','expected_version','estado','motivo']);aid:=(_dados->>'acao_id')::uuid;x:=public.transicionar_acao_operacional(_org,gen_random_uuid(),aid,(_dados->>'expected_version')::integer,_dados->>'estado',_dados->>'motivo');tipo:='acao';cid:=aid;
 elsif _comando in('criar_serie','editar_serie','cancelar_serie','reprocessar_serie') then
  x:=public.ag_serie_comando(_org,auth.uid(),_comando,_dados);cid:=(x->>'id')::uuid;eid:=nullif(x->>'evento_id','')::uuid;tipo:='serie';
 elsif _comando='preferencias' then
  perform public.ag_payload(_dados,array['antecedencia_minutos','notificar_atrasos','notificar']);if jsonb_typeof(_dados->'notificar_atrasos') is distinct from 'boolean' or jsonb_typeof(_dados->'notificar') is distinct from 'boolean' then raise exception 'Preferências devem usar booleanos.' using errcode='23514';end if;
  insert into public.agenda_preferencias(organization_id,user_id,antecedencia_minutos,notificar_atrasos,notificar) values(_org,auth.uid(),(_dados->>'antecedencia_minutos')::integer,(_dados->>'notificar_atrasos')::boolean,(_dados->>'notificar')::boolean) on conflict(organization_id,user_id) do update set antecedencia_minutos=excluded.antecedencia_minutos,notificar_atrasos=excluded.notificar_atrasos,notificar=excluded.notificar,updated_at=clock_timestamp();tipo:='preferencias';cid:=null;
 elsif _comando='marcar_lida' then
  perform public.ag_payload(_dados,array['notificacao_id']);cid:=(_dados->>'notificacao_id')::uuid;perform public.marcar_notificacao_lida(_org,cid);tipo:='leitura';
 elsif _comando='reprocessar_notificacoes' then
  perform public.ag_payload(_dados,array['evento_id']);if not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  update public.outbox_eventos set estado='pendente',disponivel_em=clock_timestamp(),erro_codigo=null where organization_id=_org and agenda_evento_id=eid and estado='falha';
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'agenda_eventos',eid,'REPROCESSAR','Reprocessamento de notificações solicitado');tipo:='job';cid:=eid;
 else raise exception 'Comando não reconhecido.' using errcode='23514';end if;
 ret:=jsonb_build_object('tipo',tipo,'id',cid,'evento_id',eid,'acao_id',aid);perform public.operacao_concluir(_org,_chave,'ag:'||_comando,payload,ret);return public.ag_resultado(_org,ret);
end$$;

-- A validação continua independente; uma formação futura não equivale à conclusão realizada.
create or replace function public.qualificacao_validacao_permitida(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_pode(_org,'revisar_operacao') and exists(select 1 from public.pessoa_qualificacoes q join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id where q.organization_id=_org and q.id=_id and c.ativa and q.conclusao<=(clock_timestamp() at time zone(select timezone from public.organizations where id=_org))::date and not public.operacao_identidade_propria(_org,q.pessoa_id));
$$;
create or replace function public.transicionar_qualificacao(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes; c public.competencias; r jsonb;
  payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'transicionar_qualificacao',payload); if r is not null then return r; end if;
  select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  if not ((q.estado='enviada' and _estado='em_conferencia') or (q.estado='em_conferencia' and _estado in ('enviada','validada')) or (q.estado='validada' and _estado='revogada')) then raise exception 'Transição não permitida.' using errcode='23514'; end if;
  if _estado in ('enviada','revogada') and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  if _estado='validada' then
    if q.conclusao>(clock_timestamp() at time zone(select timezone from public.organizations where id=_org))::date then raise exception 'A conclusão da qualificação ainda é futura no fuso da organização; mantenha em conferência até a conclusão real.' using errcode='23514';end if;
    if public.operacao_identidade_propria(_org,q.pessoa_id) then raise exception 'Conferência exige outra pessoa autorizada.' using errcode='42501'; end if;
    select * into c from public.competencias where organization_id=_org and id=q.competencia_id;
    if not c.ativa then raise exception 'Competência arquivada.' using errcode='23514'; end if;
    if c.exige_validade and q.validade is null then raise exception 'A política exige data de validade.' using errcode='23514'; end if;
    if c.exige_evidencia and not exists(select 1 from public.anexos where organization_id=_org and qualificacao_id=_id and estado='vinculado') then raise exception 'Anexe evidência conferida antes da validação.' using errcode='23514'; end if;
  end if;
  update public.pessoa_qualificacoes set estado=_estado,motivo=_motivo,
    conferido_por=case when _estado in ('validada','revogada') then auth.uid() else conferido_por end,
    conferido_em=case when _estado in ('validada','revogada') then now() else conferido_em end
    where id=_id returning * into q;
  return public.operacao_concluir(_org,_chave,'transicionar_qualificacao',payload,to_jsonb(q));
end $$;

-- FINAL_ASSEMBLY_EQ_SECURITY
-- Availability uses the canonical person and reservation locks. No medical details.
create function public.eq_listar_indisponibilidades(_org uuid,_pessoa uuid,_pagina integer default 0,_limite integer default 25) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint; gestor boolean:=public.operacao_pode(_org,'gerir_equipe');begin
 if not public.operacao_pode(_org,'ver_equipe') or not exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=_pessoa and(gestor or public.operacao_minha_pessoa(_org,p.id))) then raise exception 'Pessoa indisponível para seu acesso atual.' using errcode='42501';end if;
 if _pagina is null or _pagina<0 or _pagina>10000 or _limite is null or _limite not between 1 and 100 then raise exception 'Confira a página solicitada.' using errcode='23514';end if;
 select count(*) into n from public.indisponibilidades where organization_id=_org and pessoa_id=_pessoa;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio desc,x.id),'[]') into r from(select id,organization_id,pessoa_id,inicio,fim,motivo_operacional,version,cancelada_em,motivo_cancelamento,created_at from public.indisponibilidades where organization_id=_org and pessoa_id=_pessoa order by inicio desc,id limit _limite offset _pagina::bigint*_limite)x;
 return jsonb_build_object('registros',r,'total',n,'pagina',_pagina,'limite',_limite,'pode_gerir',gestor,'timezone',(select timezone from public.organizations where id=_org));
end $$;

create or replace function public.registrar_indisponibilidade(_org uuid,_chave uuid,_pessoa uuid,_inicio timestamptz,_fim timestamptz,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.indisponibilidades;r jsonb;payload jsonb:=jsonb_build_object('pessoa',_pessoa,'inicio',_inicio,'fim',_fim,'motivo',_motivo);begin
 perform public.lev_travar_autor(_org,auth.uid());
 if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501';end if;
 r:=public.operacao_repetir(_org,_chave,'registrar_indisponibilidade',payload);
 if r is not null then select * into i from public.indisponibilidades where organization_id=_org and id=(r->>'id')::uuid;return to_jsonb(i);end if;
 if _inicio is null or _fim is null or not isfinite(_inicio) or not isfinite(_fim) or _fim<=_inicio or length(trim(coalesce(_motivo,''))) not between 5 and 1000 then raise exception 'Informe período válido e motivo operacional de5a1000caracteres, sem informação de saúde detalhada.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:pessoa:'||_org::text||_pessoa::text,0));
 if not exists(select 1 from public.pessoas where organization_id=_org and id=_pessoa and ativa) then raise exception 'Pessoa indisponível para seu acesso atual.' using errcode='42501';end if;
 if exists(select 1 from public.agenda_reservas_pessoas r where r.organization_id=_org and r.pessoa_id=_pessoa and r.ativa and tstzrange(r.inicio,r.fim,'[)')&&tstzrange(_inicio,_fim,'[)')) then raise exception 'A pessoa já tem compromisso confirmado neste período. Reprograme a visita antes de registrar a indisponibilidade.' using errcode='23P01';end if;
 insert into public.indisponibilidades(organization_id,pessoa_id,inicio,fim,motivo_operacional) values(_org,_pessoa,_inicio,_fim,trim(_motivo)) returning * into i;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,motivo) values(_org,'indisponibilidades',i.id,'INSERT',i.version,'Indisponibilidade operacional registrada');
 return public.operacao_concluir(_org,_chave,'registrar_indisponibilidade',payload,to_jsonb(i));
end $$;

create function public.eq_executar_indisponibilidade(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.indisponibilidades;r jsonb;periodo jsonb;payload jsonb:=jsonb_build_object('comando',_comando,'dados',_dados);begin
 perform public.lev_travar_autor(_org,auth.uid());
 if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _comando='registrar' then
  perform public.ag_payload(_dados,array['pessoa_id','inicio_local','fim_local','timezone','motivo']);
  periodo:=public.ag_resolver_periodo(_dados);
  return public.registrar_indisponibilidade(_org,_chave,(_dados->>'pessoa_id')::uuid,(periodo->>'inicio')::timestamptz,(periodo->>'fim')::timestamptz,_dados->>'motivo');
 elsif _comando='cancelar' then
  perform public.ag_payload(_dados,array['id','expected_version','motivo']);
  r:=public.operacao_repetir(_org,_chave,'cancelar_indisponibilidade',payload);
  if r is not null then select * into i from public.indisponibilidades where organization_id=_org and id=(r->>'id')::uuid;return to_jsonb(i);end if;
  select * into i from public.indisponibilidades where organization_id=_org and id=(_dados->>'id')::uuid;
  if not found then raise exception 'Registro indisponível para seu acesso atual.' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:pessoa:'||_org::text||i.pessoa_id::text,0));
  select * into i from public.indisponibilidades where organization_id=_org and id=i.id for update;
  if i.version is distinct from (_dados->>'expected_version')::integer then raise exception 'A indisponibilidade mudou. Recarregue antes de cancelar.' using errcode='40001';end if;
  if i.cancelada_em is not null then raise exception 'Esta indisponibilidade já foi cancelada.' using errcode='23514';end if;
  if length(trim(coalesce(_dados->>'motivo',''))) not between 5 and 1000 then raise exception 'Informe motivo de cancelamento com5a1000caracteres.' using errcode='23514';end if;
  update public.indisponibilidades set cancelada_em=now(),cancelada_por=auth.uid(),motivo_cancelamento=trim(_dados->>'motivo'),version=version+1 where id=i.id returning * into i;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_anterior,estado_atual,motivo) values(_org,'indisponibilidades',i.id,'CANCELAR',i.version,'ativa','cancelada',i.motivo_cancelamento);
  return public.operacao_concluir(_org,_chave,'cancelar_indisponibilidade',payload,to_jsonb(i));
 else raise exception 'Comando indisponível.' using errcode='23514';end if;
end $$;
revoke all on function public.eq_listar_indisponibilidades(uuid,uuid,integer,integer),public.eq_executar_indisponibilidade(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.eq_listar_indisponibilidades(uuid,uuid,integer,integer),public.eq_executar_indisponibilidade(uuid,uuid,text,jsonb) to authenticated;

-- Segurança e compatibilidade pública da candidata, sempre ao final da montagem.
create or replace function public.listar_eventos_agenda(_org uuid,_inicio timestamptz,_fim timestamptz,_pagina integer default 0,_tamanho integer default 50,_minha boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;n bigint;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _inicio is null or _fim is null or not isfinite(_inicio) or not isfinite(_fim) or _fim<=_inicio or _fim>_inicio+interval '93 days' or _pagina is null or _pagina<0 or _tamanho is null or _tamanho not between 1 and 100 then raise exception 'Período/página inválidos.' using errcode='23514';end if;
 select count(*) into n from public.agenda_eventos e where e.organization_id=_org and public.agenda_ler_evento(_org,e.id) and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(_inicio,_fim,'[)') and(not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid())));
 select coalesce(jsonb_agg(to_jsonb(x) order by inicio,id),'[]') into arr from(select e.* from public.agenda_eventos e where e.organization_id=_org and public.agenda_ler_evento(_org,e.id) and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(_inicio,_fim,'[)') and(not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid()))) order by inicio,id offset _pagina::bigint*_tamanho limit _tamanho)x;
 return jsonb_build_object('items',arr,'total',n,'pagina',_pagina,'tamanho',_tamanho);
end$$;
create or replace function public.marcar_notificacao_lida(_org uuid,_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.lev_travar_autor(_org,auth.uid());update public.notificacoes set lida_em=coalesce(lida_em,clock_timestamp()) where organization_id=_org and id=_id and destinatario_id=auth.uid() and public.agenda_ler_evento(_org,agenda_evento_id);if not found then raise exception 'Registro indisponível.' using errcode='42501';end if;
end$$;
create function public.ag_evento_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform public.ag_fuso(new.timezone);
 if tg_op='UPDATE' then
  if old.estado in('concluido','cancelado') then raise exception 'Evento encerrado é imutável.' using errcode='23514';end if;
  if old.estado='em_andamento' and(to_jsonb(new)-array['estado','motivo','version','updated_at']) is distinct from(to_jsonb(old)-array['estado','motivo','version','updated_at']) then raise exception 'Execução iniciada preserva o planejamento.' using errcode='23514';end if;
  if new.acao_id is distinct from old.acao_id or new.levantamento_id is distinct from old.levantamento_id or new.origem_ocorrencia is distinct from old.origem_ocorrencia then raise exception 'Origem e identidade da visita são imutáveis.' using errcode='23514';end if;
 end if;return new;end$$;
create trigger ag_evento_guard before insert or update on public.agenda_eventos for each row execute function public.ag_evento_guard();
create function public.ag_org_fuso_guard() returns trigger language plpgsql security definer set search_path='' as $$begin perform public.ag_fuso(new.timezone);return new;end$$;
create trigger ag_org_fuso_guard before insert or update of timezone on public.organizations for each row execute function public.ag_org_fuso_guard();
create index agenda_indisponibilidade_pessoa on public.indisponibilidades(organization_id,pessoa_id,inicio desc,id);
create index agenda_series_trabalho on public.agenda_series(estado,ultima_tentativa,id);
create index agenda_comentarios_evento on public.agenda_comentarios(organization_id,evento_id,created_at desc,id);
do $$declare t text;begin
 foreach t in array array['agenda_series','agenda_serie_versoes','agenda_serie_ocorrencias','agenda_excecoes','agenda_ferramentas','agenda_comentarios','agenda_preferencias','agenda_automacoes'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  if t<>'agenda_automacoes' then execute format('grant select on public.%I to authenticated',t);end if;
 end loop;
 foreach t in array array['agenda_series','agenda_serie_versoes','agenda_serie_ocorrencias','agenda_excecoes'] loop execute format('create policy ag_ler on public.%I for select to authenticated using(public.operacao_pode(organization_id,''gerir_operacao''))',t);end loop;
 foreach t in array array['agenda_ferramentas','agenda_comentarios'] loop execute format('create policy ag_ler on public.%I for select to authenticated using(public.agenda_ler_evento(organization_id,evento_id))',t);end loop;
 create policy ag_ler on public.agenda_preferencias for select to authenticated using(user_id=auth.uid() and public.operacao_pode(organization_id,'ver_operacao'));
end$$;
-- Helpers com autor explícito, worker e contexto de automação jamais são RPCs de cliente.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'ag\_%' escape '\' or p.proname like 'eq\_%' escape '\' or p.proname in('agenda_reservar','agenda_registrar_revisao','executar_job_agenda_notificacoes','processar_notificacoes_agenda')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end$$;
grant execute on function public.ag_listar(uuid,date,date,text,boolean,text,text,text,uuid,integer,integer),public.ag_obter(uuid,uuid),public.ag_obter_acao(uuid,uuid),public.ag_historico(uuid,uuid,text,integer,integer),public.ag_opcoes(uuid,text,text,uuid,integer,integer),public.ag_pendentes(uuid,boolean,text,integer,integer),public.ag_notificacoes(uuid,integer,integer),public.ag_configuracao(uuid),public.ag_executar(uuid,uuid,text,jsonb),public.eq_listar_indisponibilidades(uuid,uuid,integer,integer),public.eq_executar_indisponibilidade(uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.salvar_evento_agenda(uuid,uuid,jsonb,uuid,integer),public.transicionar_evento_agenda(uuid,uuid,uuid,integer,text,text),public.confirmar_participacao_agenda(uuid,uuid,uuid,integer,text),public.salvar_acao_operacional(uuid,uuid,jsonb,uuid,integer),public.transicionar_acao_operacional(uuid,uuid,uuid,integer,text,text),public.registrar_indisponibilidade(uuid,uuid,uuid,timestamptz,timestamptz,text),public.listar_eventos_agenda(uuid,timestamptz,timestamptz,integer,integer,boolean),public.marcar_notificacao_lida(uuid,uuid) from public,anon,service_role;
grant execute on function public.salvar_evento_agenda(uuid,uuid,jsonb,uuid,integer),public.transicionar_evento_agenda(uuid,uuid,uuid,integer,text,text),public.confirmar_participacao_agenda(uuid,uuid,uuid,integer,text),public.salvar_acao_operacional(uuid,uuid,jsonb,uuid,integer),public.transicionar_acao_operacional(uuid,uuid,uuid,integer,text,text),public.registrar_indisponibilidade(uuid,uuid,uuid,timestamptz,timestamptz,text),public.listar_eventos_agenda(uuid,timestamptz,timestamptz,integer,integer,boolean),public.marcar_notificacao_lida(uuid,uuid) to authenticated;
grant execute on function public.processar_notificacoes_agenda(integer) to service_role;
update public.scheduler_configuracao set detalhe=case when estado='ativo' then 'Materialização limitada de séries, lembretes e outbox internos a cada minuto; sem canais externos.' else detalhe end where nome='agenda-notificacoes';
notify pgrst,'reload schema';
