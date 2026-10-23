\set ON_ERROR_STOP on
\set QUIET on
-- Não simula cron. Confere o worker manual e a capacidade real do PostgreSQL isolado.
do $$ declare r jsonb; disponivel boolean; configurado text; begin
  select exists(select 1 from pg_catalog.pg_available_extensions where name='pg_cron') into disponivel;
  select estado into configurado from public.scheduler_configuracao where nome='agenda-notificacoes';
  if (disponivel and configurado<>'ativo') or (not disponivel and configurado<>'indisponivel') then raise exception 'SCHEDULER FAIL: capacidade divergente'; end if;
  r:=public.executar_job_agenda_notificacoes();
  if not exists(select 1 from public.job_execucoes where id=(r->>'execucao_id')::uuid and estado='sucesso' and finalizado_em is not null) then raise exception 'SCHEDULER FAIL: execução manual sem trilha'; end if;
  raise notice 'SCHEDULER PASS: worker manual registra execução; pg_cron disponível=%, configuração=% (sem simular disparo automático)',disponivel,configurado;
end $$;
set role authenticated;
do $$ begin
  begin perform public.executar_job_agenda_notificacoes(); raise exception 'SCHEDULER FAIL: authenticated executou job owner';
  exception when insufficient_privilege then raise notice 'SCHEDULER PASS: job owner não exposto ao usuário autenticado'; end;
  begin perform count(*) from public.job_execucoes; raise exception 'SCHEDULER FAIL: authenticated leu job global';
  exception when insufficient_privilege then raise notice 'SCHEDULER PASS: execuções globais não expõem contagens de outros tenants'; end;
end $$;
reset role;
