-- Fundação temporal em banco descartável; não representa a Agenda Equipe completa.
\set ON_ERROR_STOP on
\set QUIET on
create function pg_temp.ag_assert(_ok boolean,_label text) returns void language plpgsql as $$
begin if _ok is distinct from true then raise exception 'AGENDA FAIL: %',_label; end if; raise notice 'AGENDA PASS: %',_label; end $$;
create function pg_temp.ag_reject(_sql text,_state text,_label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute _sql; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=_state then raise notice 'AGENDA PASS: %',_label; return; end if;
    raise exception 'AGENDA FAIL: % expected %, got % (%)',_label,_state,actual,sqlerrm;
  end;
  raise exception 'AGENDA FAIL: % accepted',_label;
end $$;
insert into auth.users(id,email) values
 ('60000000-0000-0000-0000-000000000001','agenda-eng@test.invalid'),
 ('60000000-0000-0000-0000-000000000002','agenda-field@test.invalid'),
 ('60000000-0000-0000-0000-000000000003','agenda-other@test.invalid'),
 ('60000000-0000-0000-0000-000000000004','agenda-b@test.invalid');
insert into public.organizations(id,nome) values('61000000-0000-0000-0000-000000000001','Agenda test A'),('61000000-0000-0000-0000-000000000002','Agenda test B');
insert into public.memberships(organization_id,user_id) select '61000000-0000-0000-0000-000000000001',id from auth.users where id::text like '60000000-%' and id<>'60000000-0000-0000-0000-000000000004';
insert into public.memberships(organization_id,user_id) values('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000004');
insert into public.user_roles(organization_id,user_id,role) values
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','engenharia'),
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','campo'),
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003','campo'),
 ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000004','admin');
set role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',false);
select (public.salvar_pessoa('61000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Agenda pessoa principal","vinculo":"colaborador","user_id":"60000000-0000-0000-0000-000000000002"}')->>'id') as principal \gset
select (public.salvar_pessoa('61000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Agenda pessoa substituída","vinculo":"colaborador","user_id":"60000000-0000-0000-0000-000000000003"}')->>'id') as previous_person \gset
select (public.salvar_pessoa('61000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Agenda prestador sem login","vinculo":"prestador"}')->>'id') as future_person \gset
select jsonb_build_object('titulo','Visita planejada','tipo','visita_tecnica','inicio','2026-11-01T10:00:00Z','fim','2026-11-01T11:00:00Z','timezone','America/Sao_Paulo','responsavel_id',:'principal','participantes',jsonb_build_array(jsonb_build_object('pessoa_id',:'previous_person','funcao','participante'),jsonb_build_object('pessoa_id',:'future_person','funcao','observador'))) as event_data \gset
select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',:'event_data') as draft \gset
select (:'draft'::jsonb->>'id') as event_id \gset
select pg_temp.ag_assert(public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',:'event_data')=:'draft'::jsonb,'create retry returns same event');
select pg_temp.ag_reject(format($q$select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',%L::jsonb||'{"titulo":"Other payload"}')$q$,:'event_data'),'23505','same key with different event payload conflicts');
select pg_temp.ag_assert((select count(*)=3 from public.agenda_participantes where evento_id=:'event_id' and vigente),'principal plus two participants share canonical people');
select pg_temp.ag_assert((select count(*)=0 from public.agenda_reservas_pessoas where evento_id=:'event_id'),'draft has no confirmed resource reservation');
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_id',1,'publicado');
select pg_temp.ag_assert((select count(*)=2 from public.agenda_reservas_pessoas where evento_id=:'event_id' and ativa),'publication reserves principal and participant, observer does not block');
select pg_temp.ag_reject($q$insert into public.agenda_eventos(organization_id) values('61000000-0000-0000-0000-000000000001')$q$,'42501','direct calendar writes cannot bypass command');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"inicio":"2026-11-01T11:00:00Z","fim":"2026-11-01T12:00:00Z","participantes":[]}')->>'id') as adjacent_id \gset
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'adjacent_id',1,'publicado');
select pg_temp.ag_assert((select estado='publicado' from public.agenda_eventos where id=:'adjacent_id'),'semi-open intervals permit adjacent visits');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"inicio":"2026-11-01T10:30:00Z","fim":"2026-11-01T11:30:00Z","participantes":[]}')->>'id') as overlap_id \gset
select pg_temp.ag_reject(format($q$select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,1,'publicado')$q$,:'overlap_id'),'23P01','exclusive overlapping person reservation rejected');
select pg_temp.ag_assert((select estado='rascunho' and version=1 from public.agenda_eventos where id=:'overlap_id'),'failed publication rolls back status and version');
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'adjacent_id',2,'cancelado','Visita cancelada pelo planejamento');
select pg_temp.ag_assert((select count(*)=0 from public.agenda_reservas_pessoas where evento_id=:'adjacent_id' and ativa),'cancellation releases current resources');
select pg_temp.ag_assert((select count(*)=1 from public.agenda_reservas_pessoas where evento_id=:'adjacent_id'),'cancellation retains resource history');
select (select id from public.agenda_participantes where evento_id=:'event_id' and pessoa_id=:'previous_person' and vigente) as participant_id \gset
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000003',false);
select public.confirmar_participacao_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'participant_id',1,'confirmada');
select pg_temp.ag_assert((select estado='publicado' from public.agenda_eventos where id=:'event_id'),'participation confirmation does not complete activity');
select pg_temp.ag_reject(format($q$select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,2,'em_andamento')$q$,:'event_id'),'42501','field participant cannot change planning state');
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',false);
select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"inicio":"2026-11-01T12:00:00Z","fim":"2026-11-01T13:00:00Z","participantes":[]}',:'event_id',2);
select pg_temp.ag_assert((select count(*)=4 from public.agenda_participantes where evento_id=:'event_id'),'replanning preserves previous participant rows');
select pg_temp.ag_assert((select (snapshot->'evento'->>'inicio')::timestamptz='2026-11-01T10:00:00Z'::timestamptz from public.agenda_evento_revisoes where evento_id=:'event_id' and versao=2),'replanning preserves historical period snapshot');
select pg_temp.ag_assert((select count(*)=1 from public.agenda_reservas_pessoas where evento_id=:'event_id' and ativa),'replacement releases removed people without deleting past participation');
select pg_temp.ag_reject(format($q$select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,%L,2)$q$,:'event_data',:'event_id'),'40001','stale calendar edit rejected');
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000003',false);
select pg_temp.ag_assert((select count(*)=0 from public.agenda_eventos where id=:'event_id'),'removed future participant loses event detail');
select pg_temp.ag_reject(format($q$select public.confirmar_participacao_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,2,'confirmada')$q$,:'participant_id'),'42501','old participation cannot confirm a new plan');
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000004',false);
select pg_temp.ag_assert((select count(*)=0 from public.agenda_eventos where organization_id='61000000-0000-0000-0000-000000000001'),'other tenant cannot read events');
select pg_temp.ag_reject($q$select public.listar_eventos_agenda('61000000-0000-0000-0000-000000000001','2026-11-01','2026-11-02')$q$,'42501','other tenant cannot invoke period query');

-- Dates preserve the declared day; a DST day can contain 25 hours.
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',false);
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"dia_inteiro":true,"data_inicio":"2026-11-01","data_fim":"2026-11-02","timezone":"America/New_York","participantes":[]}')->>'id') as day_id \gset
select pg_temp.ag_assert((select data_inicio='2026-11-01' and data_fim='2026-11-02' and fim-inicio=interval '25 hours' from public.agenda_eventos where id=:'day_id'),'whole-day date survives timezone conversion and DST');
select pg_temp.ag_reject(format($q$select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L::jsonb||'{"inicio":"2026-11-02T10:00:00"}')$q$,:'event_data'),'23514','ambiguous instant without offset rejected');
select pg_temp.ag_reject($q$select public.listar_eventos_agenda('61000000-0000-0000-0000-000000000001','2026-01-01','2027-01-01')$q$,'23514','period query bounded to visible horizon');
select pg_temp.ag_assert((public.listar_eventos_agenda('61000000-0000-0000-0000-000000000001','2026-11-01','2026-12-01',0,1)->>'total')::int>=3 and jsonb_array_length(public.listar_eventos_agenda('61000000-0000-0000-0000-000000000001','2026-11-01','2026-12-01',0,1)->'items')=1,'period list paginates before returning records');

-- One canonical action can have multiple visits; concluding a visit does not conclude it.
select (public.salvar_acao_operacional('61000000-0000-0000-0000-000000000001',gen_random_uuid(),jsonb_build_object('titulo','Ação com visitas reais','responsavel_id',:'principal'))->>'id') as action_id \gset
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||jsonb_build_object('acao_id',:'action_id','origem_ocorrencia','visita-1','inicio','2026-11-02T10:00:00Z','fim','2026-11-02T11:00:00Z','participantes','[]'::jsonb))->>'id') as action_visit \gset
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'action_visit',1,'publicado');
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'action_visit',2,'em_andamento');
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'action_visit',3,'concluido');
select pg_temp.ag_assert((select estado='aberta' from public.acoes_operacionais where id=:'action_id'),'calendar completion never updates action execution state');
select pg_temp.ag_reject(format($q$select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L::jsonb||jsonb_build_object('acao_id',%L,'origem_ocorrencia','visita-1','participantes','[]'::jsonb))$q$,:'event_data',:'action_id'),'23505','stable visit key cannot duplicate action occurrence');
select public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||jsonb_build_object('acao_id',:'action_id','origem_ocorrencia','visita-2','inicio','2026-11-03T10:00:00Z','fim','2026-11-03T11:00:00Z','participantes','[]'::jsonb));
select pg_temp.ag_assert((select count(*)=2 from public.agenda_eventos where acao_id=:'action_id'),'multiple distinct visits reuse same action identity');

-- Requirements are configured capabilities, never invented legal periodicities.
select (public.salvar_competencia('61000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Agenda competência teste","exige_evidencia":false,"exige_validade":true}')->>'id') as skill_id \gset
select (public.salvar_qualificacao('61000000-0000-0000-0000-000000000001',gen_random_uuid(),jsonb_build_object('pessoa_id',:'principal','competencia_id',:'skill_id','emissor','Emissor teste','conclusao','2026-10-01','validade','2026-11-05'))->>'id') as qualification_id \gset
select public.transicionar_qualificacao('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'qualification_id',1,'em_conferencia');
select public.transicionar_qualificacao('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'qualification_id',2,'validada');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||jsonb_build_object('inicio','2026-11-06T10:00:00Z','fim','2026-11-06T11:00:00Z','participantes','[]'::jsonb,'competencias',jsonb_build_array(:'skill_id')))->>'id') as expired_id \gset
select pg_temp.ag_reject(format($q$select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,1,'publicado')$q$,:'expired_id'),'23514','qualification expiring before service blocks publication');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||jsonb_build_object('inicio','2026-11-04T10:00:00Z','fim','2026-11-04T11:00:00Z','participantes','[]'::jsonb,'competencias',jsonb_build_array(:'skill_id')))->>'id') as qualified_id \gset
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'qualified_id',1,'publicado');
select public.transicionar_qualificacao('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'qualification_id',3,'revogada','Revogação conferida pelo emissor');
select pg_temp.ag_reject(format($q$select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,2,'em_andamento')$q$,:'qualified_id'),'23514','qualification is revalidated when activity starts');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"inicio":"2026-11-07T10:00:00Z","fim":"2026-11-07T11:00:00Z","participantes":[]}')->>'id') as unavailable_id \gset
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'unavailable_id',1,'publicado');
select pg_temp.ag_reject(format($q$select public.registrar_indisponibilidade('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,'2026-11-07T09:00:00Z','2026-11-07T12:00:00Z','Indisponibilidade operacional')$q$,:'principal'),'23P01','availability change cannot silently invalidate a confirmed reservation');
select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'unavailable_id',2,'cancelado','Visita será reprogramada antes do bloqueio');
select public.registrar_indisponibilidade('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'principal','2026-11-07T09:00:00Z','2026-11-07T12:00:00Z','Indisponibilidade operacional');
select (public.salvar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),:'event_data'::jsonb||'{"inicio":"2026-11-07T10:00:00Z","fim":"2026-11-07T11:00:00Z","participantes":[]}')->>'id') as blocked_id \gset
select pg_temp.ag_reject(format($q$select public.transicionar_evento_agenda('61000000-0000-0000-0000-000000000001',gen_random_uuid(),%L,1,'publicado')$q$,:'blocked_id'),'23P01','registered unavailability prevents a new publication');

-- Persisted outbox is processed server-side; no browser timer or external channel involved.
select pg_temp.ag_reject($q$select public.processar_notificacoes_agenda()$q$,'42501','notification worker restricted to service role');
set role service_role;
select public.processar_notificacoes_agenda(200);
select pg_temp.ag_assert((public.processar_notificacoes_agenda(200)->>'processados')::int=0,'repeating worker creates no duplicate effect');
set role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',false);
select pg_temp.ag_assert((select count(*)>0 from public.notificacoes),'assigned person receives persisted notifications');
select pg_temp.ag_assert((select count(*)=count(distinct (agenda_evento_id,entidade_version,tipo)) from public.notificacoes),'notification key deduplicates each version and effect');
select (select id from public.notificacoes limit 1) as notification_id \gset
select public.marcar_notificacao_lida('61000000-0000-0000-0000-000000000001',:'notification_id');
select pg_temp.ag_assert((select lida_em is not null from public.notificacoes where id=:'notification_id'),'notification read acknowledgement persists');
reset role;
delete from public.user_roles where organization_id='61000000-0000-0000-0000-000000000001' and user_id='60000000-0000-0000-0000-000000000002';
set role authenticated;
select pg_temp.ag_assert((select count(*)=0 from public.agenda_eventos),'role revocation removes calendar detail');
select pg_temp.ag_assert((select count(*)=0 from public.notificacoes),'role revocation removes notification context');
reset role;
\echo 'Agenda foundation SQL passed; recurrence, final UI and automatic scheduler remain separate.'
