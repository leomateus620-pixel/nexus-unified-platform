-- Processamento interno por PostgreSQL. Nenhuma credencial/canal externo é configurado.
-- Ambientes sem pg_cron preservam o worker, registrando scheduler indisponível.
create table public.job_execucoes (
  id uuid primary key default gen_random_uuid(), job text not null,
  iniciado_em timestamptz not null default now(), finalizado_em timestamptz,
  estado text not null check(estado in ('em_execucao','sucesso','falha')),
  processados integer not null default 0, falhas integer not null default 0, erro_codigo text,
  check(processados>=0 and falhas>=0)
);
comment on table public.job_execucoes is 'Infraestrutura global privada, sem payload de tenant. Somente job owner/service consultam; UI recebe resumo filtrado por organização.';
create index job_execucoes_ultima on public.job_execucoes(job,iniciado_em desc);
create table public.scheduler_configuracao (
  nome text primary key, estado text not null check(estado in ('ativo','indisponivel')),
  extensao text not null, job_id bigint, verificado_em timestamptz not null default now(), detalhe text not null
);
alter table public.job_execucoes enable row level security;
alter table public.scheduler_configuracao enable row level security;
revoke all on public.job_execucoes,public.scheduler_configuracao from public,anon,authenticated;
grant select on public.job_execucoes,public.scheduler_configuracao to service_role;

create function public.executar_job_agenda_notificacoes() returns jsonb
language plpgsql security definer set search_path='' as $$
declare execucao uuid; r jsonb; codigo text; begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nexus:job:agenda-notificacoes',0)) then
    return jsonb_build_object('ignorado',true,'motivo','execucao_em_andamento');
  end if;
  insert into public.job_execucoes(job,estado) values('agenda-notificacoes','em_execucao') returning id into execucao;
  begin
    r:=public.processar_notificacoes_agenda(100);
    update public.job_execucoes set finalizado_em=now(),estado=case when (r->>'falhas')::integer>0 then 'falha' else 'sucesso' end,
      processados=(r->>'processados')::integer,falhas=(r->>'falhas')::integer where id=execucao;
    return jsonb_build_object('execucao_id',execucao,'resultado',r);
  exception when others then
    get stacked diagnostics codigo=returned_sqlstate;
    update public.job_execucoes set finalizado_em=now(),estado='falha',erro_codigo=codigo where id=execucao;
    return jsonb_build_object('execucao_id',execucao,'erro_codigo',codigo);
  end;
end $$;
-- O cron executa como o mesmo proprietário que instalou a migração.
revoke all on function public.executar_job_agenda_notificacoes() from public,anon,authenticated,service_role;

create function public.consultar_jobs_operacionais(_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare status_scheduler jsonb; ultima jsonb; fila jsonb; begin
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select jsonb_build_object('estado',estado,'extensao',extensao,'verificado_em',verificado_em,'detalhe',detalhe) into status_scheduler
    from public.scheduler_configuracao where nome='agenda-notificacoes';
  -- Sem totais de outras organizações ou erro com payload de execução.
  select jsonb_build_object('iniciado_em',iniciado_em,'finalizado_em',finalizado_em,'estado',estado) into ultima
    from public.job_execucoes where job='agenda-notificacoes' order by iniciado_em desc limit 1;
  select jsonb_build_object('pendentes',count(*) filter(where estado='pendente'),'falhas',count(*) filter(where estado='falha'),
    'concluidos',count(*) filter(where estado='concluido')) into fila from public.outbox_eventos where organization_id=_org;
  return jsonb_build_object('scheduler',status_scheduler,'ultima_execucao',ultima,'fila_organizacao',fila);
end $$;
revoke all on function public.consultar_jobs_operacionais(uuid) from public,anon;
grant execute on function public.consultar_jobs_operacionais(uuid) to authenticated;

do $scheduler$
declare configuracao record; job_id bigint; begin
  if not exists(select 1 from pg_catalog.pg_available_extensions where name='pg_cron') then
    insert into public.scheduler_configuracao(nome,estado,extensao,detalhe)
    values('agenda-notificacoes','indisponivel','pg_cron','Extensão pg_cron não disponível neste PostgreSQL; nenhum agendamento automático foi criado.');
    return;
  end if;
  -- Se a extensão estiver disponível mas sua ativação falhar, a migração falha e reverte.
  if not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then execute 'create extension pg_cron'; end if;
  execute 'select jobid,schedule,command,active from cron.job where jobname=$1 and username=current_user'
    into configuracao using 'nexus-agenda-notificacoes';
  if configuracao.jobid is not null then
    if configuracao.schedule<>'* * * * *' or configuracao.command<>'select public.executar_job_agenda_notificacoes();' or not configuracao.active then
      raise exception 'Job Nexus existente diverge do agendamento esperado; reconcilie antes de ativar.' using errcode='23514';
    end if;
    job_id:=configuracao.jobid;
  else
    execute 'select cron.schedule($1,$2,$3)' into job_id using 'nexus-agenda-notificacoes','* * * * *','select public.executar_job_agenda_notificacoes();';
  end if;
  insert into public.scheduler_configuracao(nome,estado,extensao,job_id,detalhe)
  values('agenda-notificacoes','ativo','pg_cron',job_id,'Outbox de notificações internas a cada minuto; sem e-mail, WhatsApp ou recorrência automática.');
end $scheduler$;
