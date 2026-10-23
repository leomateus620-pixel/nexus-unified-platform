-- Fundação temporal: eventos independentes ou ligados à ação canônica.
-- Não representa a experiência final Agenda Equipe, recorrência, OS, frota ou ferramentas.
create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  titulo text not null check(length(trim(titulo)) between 3 and 200), descricao text not null default '' check(length(descricao)<=4000),
  tipo text not null check(tipo in ('visita_tecnica','levantamento','execucao','inspecao','manutencao','reuniao','treinamento','acao_interna','deslocamento')),
  inicio timestamptz not null, fim timestamptz not null, timezone text not null default 'America/Sao_Paulo',
  dia_inteiro boolean not null default false, data_inicio date, data_fim date,
  local text not null default '' check(length(local)<=1000), responsavel_id uuid not null,
  acao_id uuid, origem_ocorrencia text,
  bloqueia_recursos boolean not null default true,
  estado text not null default 'rascunho' check(estado in ('rascunho','publicado','em_andamento','concluido','cancelado')),
  motivo text, version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,acao_id,origem_ocorrencia),
  check(fim>inicio), check(bloqueia_recursos or tipo='reuniao'),
  check((dia_inteiro and data_inicio is not null and data_fim>data_inicio) or (not dia_inteiro and data_inicio is null and data_fim is null)),
  check((acao_id is null)=(origem_ocorrencia is null)),
  foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id),
  foreign key(organization_id,acao_id) references public.acoes_operacionais(organization_id,id)
);
create index agenda_periodo on public.agenda_eventos(organization_id,inicio,id);
create index agenda_responsavel on public.agenda_eventos(organization_id,responsavel_id,estado,inicio);
create index agenda_acao on public.agenda_eventos(organization_id,acao_id,inicio) where acao_id is not null;
create trigger operacao_guard before update on public.agenda_eventos for each row execute function public.operacao_guard();

-- Cada edição de planejamento preserva os participantes anteriores em linhas encerradas.
create table public.agenda_participantes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, evento_id uuid not null, pessoa_id uuid not null,
  funcao text not null check(funcao in ('responsavel','participante','observador')),
  confirmacao text not null default 'pendente' check(confirmacao in ('pendente','confirmada','recusada')),
  ciencia_em timestamptz, vigente boolean not null default true, retirado_em timestamptz,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,evento_id,id,pessoa_id), check(vigente=(retirado_em is null)),
  foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create unique index agenda_participante_vigente on public.agenda_participantes(organization_id,evento_id,pessoa_id) where vigente;
create unique index agenda_responsavel_vigente on public.agenda_participantes(organization_id,evento_id) where vigente and funcao='responsavel';
create index agenda_participante_pessoa on public.agenda_participantes(organization_id,pessoa_id,vigente,evento_id);

create table public.agenda_requisitos (
  organization_id uuid not null, evento_id uuid not null, competencia_id uuid not null,
  primary key(organization_id,evento_id,competencia_id),
  foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id),
  foreign key(organization_id,competencia_id) references public.competencias(organization_id,id)
);
create table public.agenda_reservas_pessoas (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, evento_id uuid not null,
  participante_id uuid not null, pessoa_id uuid not null, evento_version integer not null,
  inicio timestamptz not null, fim timestamptz not null, ativa boolean not null default true,
  created_at timestamptz not null default now(), liberada_em timestamptz,
  check(fim>inicio), check(ativa=(liberada_em is null)),
  foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id),
  foreign key(organization_id,evento_id,participante_id,pessoa_id) references public.agenda_participantes(organization_id,evento_id,id,pessoa_id),
  foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create unique index agenda_reserva_ativa on public.agenda_reservas_pessoas(organization_id,evento_id,participante_id) where ativa;
create index agenda_conflitos_pessoa on public.agenda_reservas_pessoas(organization_id,pessoa_id,inicio,fim) where ativa;

create table public.agenda_evento_revisoes (
  organization_id uuid not null, evento_id uuid not null, versao integer not null, snapshot jsonb not null,
  autor uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  primary key(organization_id,evento_id,versao), foreign key(organization_id,evento_id) references public.agenda_eventos(organization_id,id)
);

-- Infraestrutura canônica de efeitos internos. Não contém títulos ou relatos nos payloads.
create table public.outbox_eventos (
  id bigint generated always as identity primary key, organization_id uuid not null,
  agenda_evento_id uuid not null, entidade_version integer not null,
  tipo text not null check(tipo in ('agenda_publicada','agenda_alterada','agenda_cancelada','agenda_iniciada','agenda_concluida')),
  estado text not null default 'pendente' check(estado in ('pendente','concluido','falha')),
  tentativas integer not null default 0, disponivel_em timestamptz not null default now(), erro_codigo text,
  created_at timestamptz not null default now(), concluido_em timestamptz,
  unique(organization_id,agenda_evento_id,entidade_version,tipo),
  foreign key(organization_id,agenda_evento_id) references public.agenda_eventos(organization_id,id)
);
create index outbox_agenda_pendente on public.outbox_eventos(estado,disponivel_em,id) where estado='pendente';
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  destinatario_id uuid not null references auth.users(id), agenda_evento_id uuid not null,
  entidade_version integer not null, tipo text not null, lida_em timestamptz, created_at timestamptz not null default now(),
  unique(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo),
  foreign key(organization_id,agenda_evento_id) references public.agenda_eventos(organization_id,id)
);
create index notificacoes_usuario on public.notificacoes(organization_id,destinatario_id,lida_em,created_at desc,id);

create function public.agenda_ler_evento(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_pode(_org,'ver_operacao') and exists(select 1 from public.agenda_eventos e
    where e.organization_id=_org and e.id=_id and (e.acao_id is null or public.operacao_ler_acao(_org,e.acao_id)) and (
      public.operacao_pode(_org,'gerir_operacao') or public.operacao_minha_pessoa(_org,e.responsavel_id) or exists(
        select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente
        and public.operacao_minha_pessoa(_org,p.pessoa_id))));
$$;

do $$ declare t text; begin
  foreach t in array array['agenda_eventos','agenda_participantes','agenda_requisitos','agenda_reservas_pessoas','agenda_evento_revisoes','outbox_eventos','notificacoes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
  foreach t in array array['agenda_eventos','agenda_participantes','agenda_requisitos','agenda_reservas_pessoas','agenda_evento_revisoes'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy ler on public.%I for select to authenticated using(public.agenda_ler_evento(organization_id,%I))',t,case when t='agenda_eventos' then 'id' else 'evento_id' end);
  end loop;
end $$;
grant select on public.notificacoes to authenticated;
create policy ler on public.notificacoes for select to authenticated using(destinatario_id=auth.uid() and public.agenda_ler_evento(organization_id,agenda_evento_id));

create function public.agenda_reservar(_org uuid,_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos; p record; lock_person uuid; begin
  select * into e from public.agenda_eventos where organization_id=_org and id=_id;
  -- Mesmo namespace e ordem em publicação, reagendamento, início e indisponibilidade.
  for lock_person in
    select pessoa_id from public.agenda_reservas_pessoas where organization_id=_org and evento_id=_id and ativa
    union select pessoa_id from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente
    order by pessoa_id
  loop perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:pessoa:'||_org::text||lock_person::text,0)); end loop;
  update public.agenda_reservas_pessoas set ativa=false,liberada_em=now() where organization_id=_org and evento_id=_id and ativa;
  if e.estado not in ('publicado','em_andamento') then return; end if;
  if e.acao_id is not null and exists(select 1 from public.acoes_operacionais where organization_id=_org and id=e.acao_id and estado in ('concluida','cancelada')) then
    raise exception 'A ação de origem está encerrada. Revise o agendamento.' using errcode='23514';
  end if;
  for p in select a.id,a.pessoa_id,a.funcao,person.ativa from public.agenda_participantes a join public.pessoas person on person.organization_id=a.organization_id and person.id=a.pessoa_id
    where a.organization_id=_org and a.evento_id=_id and a.vigente
  loop
    if not p.ativa then raise exception 'Participante inativo. Revise a alocação.' using errcode='23514'; end if;
    if p.funcao='observador' then continue; end if;
    if exists(select 1 from public.agenda_requisitos r join public.competencias c on c.organization_id=r.organization_id and c.id=r.competencia_id
      where r.organization_id=_org and r.evento_id=_id and (not c.ativa or not exists(
        select 1 from public.pessoa_qualificacoes q where q.organization_id=_org and q.pessoa_id=p.pessoa_id and q.competencia_id=r.competencia_id and q.estado='validada'
        and q.conclusao<=(e.inicio at time zone e.timezone)::date
        and (q.validade is null or q.validade>=((e.fim-interval '1 microsecond') at time zone e.timezone)::date)))) then
      raise exception 'Pessoa não atende às competências exigidas no período.' using errcode='23514';
    end if;
    if not e.bloqueia_recursos then continue; end if;
    if exists(select 1 from public.indisponibilidades i where i.organization_id=_org and i.pessoa_id=p.pessoa_id
      and tstzrange(i.inicio,i.fim,'[)') && tstzrange(e.inicio,e.fim,'[)')) then
      raise exception 'Pessoa indisponível no período solicitado.' using errcode='23P01';
    end if;
    if exists(select 1 from public.agenda_reservas_pessoas r where r.organization_id=_org and r.pessoa_id=p.pessoa_id and r.ativa
      and tstzrange(r.inicio,r.fim,'[)') && tstzrange(e.inicio,e.fim,'[)')) then
      raise exception 'Conflito de reserva de pessoa no período solicitado.' using errcode='23P01';
    end if;
    insert into public.agenda_reservas_pessoas(organization_id,evento_id,participante_id,pessoa_id,evento_version,inicio,fim)
    values(_org,_id,p.id,p.pessoa_id,e.version,e.inicio,e.fim);
  end loop;
end $$;

create function public.agenda_registrar_revisao(_org uuid,_id uuid,_anterior text,_efeito text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos; begin
  select * into e from public.agenda_eventos where organization_id=_org and id=_id;
  insert into public.agenda_evento_revisoes(organization_id,evento_id,versao,snapshot)
  values(_org,_id,e.version,jsonb_build_object('evento',to_jsonb(e),
    'participantes',(select coalesce(jsonb_agg(jsonb_build_object('pessoa_id',pessoa_id,'funcao',funcao) order by pessoa_id),'[]') from public.agenda_participantes where organization_id=_org and evento_id=_id and vigente),
    'competencias',(select coalesce(jsonb_agg(competencia_id order by competencia_id),'[]') from public.agenda_requisitos where organization_id=_org and evento_id=_id)));
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_anterior,estado_atual,motivo)
  values(_org,'agenda_eventos',_id,case when e.version=1 then 'INSERT' else 'UPDATE' end,e.version,_anterior,e.estado,e.motivo);
  if _efeito is not null then
    insert into public.outbox_eventos(organization_id,agenda_evento_id,entidade_version,tipo) values(_org,_id,e.version,_efeito);
  end if;
end $$;

create function public.salvar_evento_agenda(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos; anterior text; r jsonb; item jsonb; pessoa uuid; papel text; competencia uuid;
  tz text:=coalesce(_dados->>'timezone','America/Sao_Paulo'); novo uuid:=coalesce(_id,gen_random_uuid());
  com_dia boolean:=coalesce((_dados->>'dia_inteiro')::boolean,false); ini timestamptz; instante_fim timestamptz;
  resp uuid:=(_dados->>'responsavel_id')::uuid;
  payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_evento_agenda',payload); if r is not null then return r; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'Timezone inválido.' using errcode='23514'; end if;
  if jsonb_typeof(_dados->'participantes') is distinct from 'array' or jsonb_array_length(_dados->'participantes')>100 then raise exception 'Informe lista de até 100 participantes.' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(_dados->'competencias','[]')) is distinct from 'array' then raise exception 'Competências inválidas.' using errcode='23514'; end if;
  if com_dia then
    ini:=(_dados->>'data_inicio')::date::timestamp at time zone tz; instante_fim:=(_dados->>'data_fim')::date::timestamp at time zone tz;
  else
    if coalesce(_dados->>'inicio','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(_dados->>'fim','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Informe instantes com timezone explícito.' using errcode='23514'; end if;
    ini:=(_dados->>'inicio')::timestamptz; instante_fim:=(_dados->>'fim')::timestamptz;
  end if;
  if not exists(select 1 from public.pessoas where organization_id=_org and id=resp and ativa) then raise exception 'Responsável indisponível.' using errcode='23514'; end if;
  if nullif(_dados->>'acao_id','') is not null and not public.operacao_ler_acao(_org,(_dados->>'acao_id')::uuid) then raise exception 'Origem indisponível.' using errcode='42501'; end if;
  if _id is null then
    insert into public.agenda_eventos(id,organization_id,titulo,descricao,tipo,inicio,fim,timezone,dia_inteiro,data_inicio,data_fim,local,responsavel_id,acao_id,origem_ocorrencia,bloqueia_recursos)
    values(novo,_org,trim(_dados->>'titulo'),coalesce(_dados->>'descricao',''),_dados->>'tipo',ini,instante_fim,tz,com_dia,
      case when com_dia then (_dados->>'data_inicio')::date end,case when com_dia then (_dados->>'data_fim')::date end,
      coalesce(_dados->>'local',''),resp,nullif(_dados->>'acao_id','')::uuid,
      case when nullif(_dados->>'acao_id','') is not null then coalesce(nullif(_dados->>'origem_ocorrencia',''),novo::text) end,
      coalesce((_dados->>'bloqueia_recursos')::boolean,true)) returning * into e;
  else
    select * into e from public.agenda_eventos where organization_id=_org and id=_id for update;
    if not found or not public.agenda_ler_evento(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if e.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if e.estado not in ('rascunho','publicado') then raise exception 'Planejamento iniciado ou encerrado é imutável.' using errcode='23514'; end if;
    if e.acao_id is distinct from nullif(_dados->>'acao_id','')::uuid then raise exception 'Origem é imutável. Cancele e crie outro evento.' using errcode='23514'; end if;
    anterior:=e.estado;
    update public.agenda_eventos set titulo=trim(_dados->>'titulo'),descricao=coalesce(_dados->>'descricao',''),tipo=_dados->>'tipo',inicio=ini,fim=instante_fim,timezone=tz,
      dia_inteiro=com_dia,data_inicio=case when com_dia then (_dados->>'data_inicio')::date end,data_fim=case when com_dia then (_dados->>'data_fim')::date end,
      local=coalesce(_dados->>'local',''),responsavel_id=resp,bloqueia_recursos=coalesce((_dados->>'bloqueia_recursos')::boolean,true),motivo='Planejamento atualizado'
      where id=_id returning * into e;
    update public.agenda_participantes set vigente=false,retirado_em=now() where organization_id=_org and evento_id=_id and vigente;
    delete from public.agenda_requisitos where organization_id=_org and evento_id=_id;
  end if;
  insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao) values(_org,novo,resp,'responsavel');
  for item in select value from jsonb_array_elements(_dados->'participantes') loop
    pessoa:=(item->>'pessoa_id')::uuid; papel:=coalesce(item->>'funcao','participante');
    if pessoa=resp then
      if papel<>'responsavel' then raise exception 'Responsável possui função única no evento.' using errcode='23514'; end if;
      continue;
    end if;
    if papel not in ('participante','observador') then raise exception 'Função de participante inválida.' using errcode='23514'; end if;
    if not exists(select 1 from public.pessoas where organization_id=_org and id=pessoa and ativa) then raise exception 'Participante indisponível.' using errcode='23514'; end if;
    insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao) values(_org,novo,pessoa,papel);
  end loop;
  for competencia in select value::text::uuid from jsonb_array_elements_text(coalesce(_dados->'competencias','[]')) loop
    if not exists(select 1 from public.competencias where organization_id=_org and id=competencia and ativa) then raise exception 'Competência indisponível.' using errcode='23514'; end if;
    insert into public.agenda_requisitos(organization_id,evento_id,competencia_id) values(_org,novo,competencia);
  end loop;
  perform public.agenda_reservar(_org,novo);
  perform public.agenda_registrar_revisao(_org,novo,anterior,case when e.estado='publicado' then 'agenda_alterada' end);
  return public.operacao_concluir(_org,_chave,'salvar_evento_agenda',payload,to_jsonb(e));
end $$;

create function public.transicionar_evento_agenda(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.agenda_eventos; anterior text; r jsonb; efeito text;
  payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo); begin
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'transicionar_evento_agenda',payload); if r is not null then return r; end if;
  select * into e from public.agenda_eventos where organization_id=_org and id=_id for update;
  if not found or not public.agenda_ler_evento(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if e.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  if not ((e.estado='rascunho' and _estado='publicado') or (e.estado='publicado' and _estado='em_andamento') or (e.estado='em_andamento' and _estado='concluido') or (e.estado in ('rascunho','publicado') and _estado='cancelado')) then raise exception 'Transição não permitida.' using errcode='23514'; end if;
  if _estado='cancelado' and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo do cancelamento.' using errcode='23514'; end if;
  anterior:=e.estado;
  update public.agenda_eventos set estado=_estado,motivo=_motivo where id=_id returning * into e;
  perform public.agenda_reservar(_org,_id);
  efeito:=case _estado when 'publicado' then 'agenda_publicada' when 'cancelado' then 'agenda_cancelada' when 'em_andamento' then 'agenda_iniciada' when 'concluido' then 'agenda_concluida' end;
  perform public.agenda_registrar_revisao(_org,_id,anterior,efeito);
  return public.operacao_concluir(_org,_chave,'transicionar_evento_agenda',payload,to_jsonb(e));
end $$;

create function public.confirmar_participacao_agenda(_org uuid,_chave uuid,_id uuid,_expected_version integer,_confirmacao text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.agenda_participantes; r jsonb; payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'confirmacao',_confirmacao); begin
  select * into p from public.agenda_participantes where organization_id=_org and id=_id for update;
  if not found or not p.vigente or not public.agenda_ler_evento(_org,p.evento_id) or not public.operacao_minha_pessoa(_org,p.pessoa_id) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'confirmar_participacao_agenda',payload); if r is not null then return r; end if;
  if p.version is distinct from _expected_version then raise exception 'Participação alterada. Recarregue antes de confirmar.' using errcode='40001'; end if;
  if _confirmacao not in ('confirmada','recusada') then raise exception 'Confirmação inválida.' using errcode='23514'; end if;
  update public.agenda_participantes set confirmacao=_confirmacao,ciencia_em=now(),version=version+1 where id=_id returning * into p;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao,estado_atual) values(_org,'agenda_participantes',_id,'UPDATE',p.version,_confirmacao);
  return public.operacao_concluir(_org,_chave,'confirmar_participacao_agenda',payload,to_jsonb(p));
end $$;

create function public.registrar_indisponibilidade(_org uuid,_chave uuid,_pessoa uuid,_inicio timestamptz,_fim timestamptz,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.indisponibilidades; r jsonb; payload jsonb:=jsonb_build_object('pessoa',_pessoa,'inicio',_inicio,'fim',_fim,'motivo',_motivo); begin
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'registrar_indisponibilidade',payload); if r is not null then return r; end if;
  if length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo operacional, sem informação de saúde detalhada.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:pessoa:'||_org::text||_pessoa::text,0));
  insert into public.indisponibilidades(organization_id,pessoa_id,inicio,fim,motivo_operacional) values(_org,_pessoa,_inicio,_fim,_motivo) returning * into i;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'indisponibilidades',i.id,'INSERT','Indisponibilidade operacional registrada');
  return public.operacao_concluir(_org,_chave,'registrar_indisponibilidade',payload,to_jsonb(i));
end $$;

create function public.listar_eventos_agenda(_org uuid,_inicio timestamptz,_fim timestamptz,_pagina integer default 0,_tamanho integer default 50,_minha boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total bigint; begin
  if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if _inicio is null or _fim<=_inicio or _fim>_inicio+interval '93 days' or _pagina<0 or _tamanho not between 1 and 100 then raise exception 'Consulta exige período de até 93 dias e página de 1 a 100 registros.' using errcode='23514'; end if;
  select count(*) into total from public.agenda_eventos e where e.organization_id=_org and tstzrange(e.inicio,e.fim,'[)') && tstzrange(_inicio,_fim,'[)') and public.agenda_ler_evento(_org,e.id)
    and (not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and public.operacao_minha_pessoa(_org,p.pessoa_id)));
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio,x.id),'[]') into items from (
    select e.* from public.agenda_eventos e where e.organization_id=_org and tstzrange(e.inicio,e.fim,'[)') && tstzrange(_inicio,_fim,'[)') and public.agenda_ler_evento(_org,e.id)
      and (not _minha or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and public.operacao_minha_pessoa(_org,p.pessoa_id)))
    order by e.inicio,e.id limit _tamanho offset (_pagina::bigint*_tamanho)
  ) x;
  return jsonb_build_object('items',items,'total',total,'pagina',_pagina,'tamanho',_tamanho);
end $$;

create function public.processar_notificacoes_agenda(_limite integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.outbox_eventos; processados integer:=0; falhas integer:=0; codigo text; begin
  if _limite not between 1 and 200 then raise exception 'Lote inválido.' using errcode='23514'; end if;
  -- Efeito apenas PostgreSQL: row lock cobre seleção e confirmação na mesma transação.
  -- Não há lease externo nem alegação de entrega exatamente uma vez.
  for o in select * from public.outbox_eventos where estado='pendente' and disponivel_em<=now() order by id limit _limite for update skip locked loop
    begin
      insert into public.notificacoes(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo)
      select distinct o.organization_id,p.user_id,o.agenda_evento_id,o.entidade_version,o.tipo
      from public.agenda_participantes a join public.pessoas p on p.organization_id=a.organization_id and p.id=a.pessoa_id
      join public.memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
      where a.organization_id=o.organization_id and a.evento_id=o.agenda_evento_id and a.vigente and p.ativa and p.user_id is not null
      on conflict(organization_id,destinatario_id,agenda_evento_id,entidade_version,tipo) do nothing;
      update public.outbox_eventos set estado='concluido',concluido_em=now(),tentativas=tentativas+1,erro_codigo=null where id=o.id;
      processados:=processados+1;
    exception when others then
      get stacked diagnostics codigo=returned_sqlstate;
      update public.outbox_eventos set tentativas=tentativas+1,estado=case when tentativas>=5 then 'falha' else 'pendente' end,
        disponivel_em=now()+make_interval(secs=>least(3600,power(2,tentativas+1)::integer*30)),erro_codigo=codigo where id=o.id;
      falhas:=falhas+1;
    end;
  end loop;
  return jsonb_build_object('processados',processados,'falhas',falhas);
end $$;

create function public.marcar_notificacao_lida(_org uuid,_id uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  update public.notificacoes set lida_em=coalesce(lida_em,now()) where organization_id=_org and id=_id and destinatario_id=auth.uid() and public.agenda_ler_evento(_org,agenda_evento_id);
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
end $$;

revoke all on function public.agenda_reservar(uuid,uuid),public.agenda_registrar_revisao(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.agenda_ler_evento(uuid,uuid),public.salvar_evento_agenda(uuid,uuid,jsonb,uuid,integer),public.transicionar_evento_agenda(uuid,uuid,uuid,integer,text,text),public.confirmar_participacao_agenda(uuid,uuid,uuid,integer,text),public.registrar_indisponibilidade(uuid,uuid,uuid,timestamptz,timestamptz,text),public.listar_eventos_agenda(uuid,timestamptz,timestamptz,integer,integer,boolean),public.marcar_notificacao_lida(uuid,uuid) from public,anon;
grant execute on function public.agenda_ler_evento(uuid,uuid),public.salvar_evento_agenda(uuid,uuid,jsonb,uuid,integer),public.transicionar_evento_agenda(uuid,uuid,uuid,integer,text,text),public.confirmar_participacao_agenda(uuid,uuid,uuid,integer,text),public.registrar_indisponibilidade(uuid,uuid,uuid,timestamptz,timestamptz,text),public.listar_eventos_agenda(uuid,timestamptz,timestamptz,integer,integer,boolean),public.marcar_notificacao_lida(uuid,uuid) to authenticated;
revoke all on function public.processar_notificacoes_agenda(integer) from public,anon,authenticated;
grant execute on function public.processar_notificacoes_agenda(integer) to service_role;
