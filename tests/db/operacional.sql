-- Integração SQL em cluster descartável. Nenhum dado deste arquivo vai ao projeto conectado.
-- O stub Storage cobre somente metadados/políticas; upload binário requer E2E separado.
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.op_assert(_ok boolean,_label text) returns void language plpgsql as $$
begin if _ok is distinct from true then raise exception 'FAIL: %',_label; end if; raise notice 'PASS: %',_label; end $$;
create or replace function pg_temp.op_reject(_sql text,_state text,_label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute _sql;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=_state then raise notice 'PASS: %',_label; return; end if;
    raise exception 'FAIL: % (expected SQLSTATE %, got %: %)',_label,_state,actual,sqlerrm;
  end;
  raise exception 'FAIL: % (operation was accepted)',_label;
end $$;

insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000001','op-admin@test.invalid'),
 ('50000000-0000-0000-0000-000000000002','op-eng@test.invalid'),
 ('50000000-0000-0000-0000-000000000003','op-campo@test.invalid'),
 ('50000000-0000-0000-0000-000000000004','op-roleless@test.invalid'),
 ('50000000-0000-0000-0000-000000000005','op-b@test.invalid'),
 ('50000000-0000-0000-0000-000000000006','op-detached@test.invalid'),
 ('50000000-0000-0000-0000-000000000007','op-coord@test.invalid');
insert into public.organizations(id,nome) values
 ('51000000-0000-0000-0000-000000000001','Operational test A'),
 ('51000000-0000-0000-0000-000000000002','Operational test B');
insert into public.memberships(organization_id,user_id)
select '51000000-0000-0000-0000-000000000001',id from auth.users where id::text like '50000000-%' and id<>'50000000-0000-0000-0000-000000000005';
insert into public.memberships(organization_id,user_id) values('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005');
insert into public.user_roles(organization_id,user_id,role) values
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','admin'),
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','engenharia'),
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','campo'),
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000006','admin'),
 ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005','admin');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
insert into public.user_capacidades(organization_id,user_id,capacidade) values('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000007','coordenar_operacao');

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','{"nome":"Pessoa de campo","vinculo":"colaborador","user_id":"50000000-0000-0000-0000-000000000003","created_by":"50000000-0000-0000-0000-000000000005"}') as saved_person \gset
select (:'saved_person'::jsonb->>'id') as field_person \gset
select pg_temp.op_assert(:'saved_person'::jsonb->>'created_by'='50000000-0000-0000-0000-000000000002','author comes from authenticated server context');
select pg_temp.op_assert(public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','{"created_by":"50000000-0000-0000-0000-000000000005","user_id":"50000000-0000-0000-0000-000000000003","vinculo":"colaborador","nome":"Pessoa de campo"}')=:'saved_person'::jsonb,'retry returns identical result independent of JSON key order');
select pg_temp.op_reject($q$select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','{"nome":"Different payload","vinculo":"prestador"}')$q$,'23505','same idempotency key with different payload conflicts');
select (public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002','{"nome":"Pessoa sem login","vinculo":"prestador"}')->>'id') as offline_person \gset
select pg_temp.op_assert((select user_id is null from public.pessoas where id=:'offline_person'),'operational person exists before login');
select (public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','{"nome":"Engenheira revisora","vinculo":"colaborador","user_id":"50000000-0000-0000-0000-000000000002"}')->>'id') as engineer_person \gset
select pg_temp.op_reject($q$select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000004','{"nome":"Cross tenant user","vinculo":"colaborador","user_id":"50000000-0000-0000-0000-000000000005"}')$q$,'23503','cross-tenant membership rejected by composite FK');
select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000005',jsonb_build_object('nome','Pessoa de campo atualizada','vinculo','colaborador','user_id','50000000-0000-0000-0000-000000000003'),:'field_person',1);
select pg_temp.op_assert((select version=2 from public.pessoas where id=:'field_person'),'person edit increments version');
select pg_temp.op_reject(format($q$select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000006','{"nome":"Stale edit","vinculo":"colaborador"}',%L,1)$q$,:'field_person'),'40001','stale expected_version rejected');
select pg_temp.op_reject($q$insert into public.pessoas(organization_id,nome,vinculo) values('51000000-0000-0000-0000-000000000001','Direct forged write','colaborador')$q$,'42501','direct writes cannot bypass command audit');
select pg_temp.op_reject($q$select * from public.operacoes_idempotentes$q$,'42501','sensitive idempotency receipts are private');
select pg_temp.op_assert(not public.operacao_pode('51000000-0000-0000-0000-000000000001','unknown_action'),'unknown capability is denied');

-- Team membership remains temporal; overlap is serialized, identities are shared.
select (public.salvar_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000010',jsonb_build_object('nome','Equipe operacional A','lider_id',:'engineer_person'))->>'id') as team_id \gset
select (public.vincular_membro_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000011',:'team_id',:'field_person','2026-10-01')->>'id') as team_member \gset
select pg_temp.op_reject(format($q$select public.vincular_membro_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000012',%L,%L,'2026-10-02')$q$,:'team_id',:'field_person'),'23P01','overlapping team memberships rejected');
select public.encerrar_membro_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000013',:'team_member','2026-10-20','Substituição planejada');
select public.vincular_membro_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000014',:'team_id',:'field_person','2026-10-21');
select pg_temp.op_assert((select count(*)=2 from public.equipe_membros where equipe_id=:'team_id' and pessoa_id=:'field_person'),'replacement preserves past team membership');
select pg_temp.op_reject(format($q$select public.encerrar_membro_equipe('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000015',%L,'2026-10-19','Rewrite history')$q$,:'team_member'),'23514','closed team membership cannot be rewritten');

-- Role-specific read scope, cross-tenant denial, no-role denial.
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select pg_temp.op_assert((select count(*)=1 from public.pessoas where organization_id='51000000-0000-0000-0000-000000000001'),'field reads only own person');
select pg_temp.op_reject($q$select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000020','{"nome":"No field admin","vinculo":"colaborador"}')$q$,'42501','field cannot administer people');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',false);
select pg_temp.op_assert((select count(*)=0 from public.pessoas),'member with no role reads no operational people');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',false);
select pg_temp.op_assert((select count(*)=0 from public.pessoas where organization_id='51000000-0000-0000-0000-000000000001'),'tenant B reads no tenant A people');
select pg_temp.op_reject($q$select public.salvar_pessoa('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000021','{"nome":"Cross tenant command","vinculo":"colaborador"}')$q$,'42501','tenant B cannot command tenant A');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000007',false);
select pg_temp.op_assert(public.operacao_pode('51000000-0000-0000-0000-000000000001','gerir_equipe') and not public.operacao_pode('51000000-0000-0000-0000-000000000001','revisar_operacao'),'coordination capability does not grant technical review or admin');

-- Qualification submission, correction, independent evidence review and revocation.
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select (public.salvar_competencia('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000030','{"nome":"Competência política de teste","exige_evidencia":true,"exige_validade":true}')->>'id') as skill_id \gset
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select (public.salvar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000031',jsonb_build_object('pessoa_id',:'field_person','competencia_id',:'skill_id','emissor','Emissor de teste','conclusao','2026-10-01'))->>'id') as qualification_id \gset
select pg_temp.op_reject(format($q$select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000032',%L,1,'validada')$q$,:'qualification_id'),'42501','field cannot validate qualification');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000033',:'qualification_id',1,'em_conferencia');
select pg_temp.op_reject(format($q$select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000034',%L,2,'validada')$q$,:'qualification_id'),'23514','configured validity required for qualification approval');
select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000035',:'qualification_id',2,'enviada','Falta informar validade');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select public.salvar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000036',jsonb_build_object('pessoa_id',:'field_person','competencia_id',:'skill_id','emissor','Emissor de teste','conclusao','2026-10-01','validade','2026-10-31'),:'qualification_id',3);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000037',:'qualification_id',4,'em_conferencia');
select pg_temp.op_reject(format($q$select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000038',%L,5,'validada')$q$,:'qualification_id'),'23514','qualification evidence required before approval');

-- Private file staging validates metadata and parent scope; only service confirms.
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select (public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000040',jsonb_build_object('qualificacao_id',:'qualification_id','nome','evidencia.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('a',64)))->>'id') as attachment_id \gset
select pg_temp.op_reject(format($q$select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',%L,'50000000-0000-0000-0000-000000000003',repeat('a',64))$q$,:'attachment_id'),'42501','browser cannot forge upload confirmation');
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',caminho,'{"size":100,"mimetype":"application/pdf"}'::jsonb from public.anexos where id=:'attachment_id';
select pg_temp.op_assert((select count(*)=0 from storage.objects where name like '%/anexos/%'),'unconfirmed file cannot be downloaded');
set role service_role;
select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',:'attachment_id','50000000-0000-0000-0000-000000000003',repeat('a',64));
select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',:'attachment_id','50000000-0000-0000-0000-000000000003',repeat('a',64));
set role authenticated;
select pg_temp.op_assert((select count(*)=1 from storage.objects where name like '%/anexos/%'),'confirmed own file can be read');
select (public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000045',jsonb_build_object('qualificacao_id',:'qualification_id','nome','late-qualification.pdf','mime','application/pdf','tamanho',101,'sha256',repeat('c',64)))->>'id') as late_qualification_attachment \gset
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',caminho,'{"size":101,"mimetype":"application/pdf"}'::jsonb from public.anexos where id=:'late_qualification_attachment';
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',false);
select pg_temp.op_assert((select count(*)=0 from public.anexos where id=:'attachment_id'),'cross-tenant attachment metadata hidden');
select pg_temp.op_assert((select count(*)=0 from storage.objects),'cross-tenant object hidden by parent authorization');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000041',:'qualification_id',5,'validada');
select pg_temp.op_reject(format($q$select public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000046',jsonb_build_object('qualificacao_id',%L,'nome','after-approval.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('d',64)))$q$,:'qualification_id'),'42501','approved qualification cannot receive a new evidence upload');
set role service_role;
select pg_temp.op_reject(format($q$select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',%L,'50000000-0000-0000-0000-000000000003',repeat('c',64))$q$,:'late_qualification_attachment'),'23514','qualification approval blocks late upload confirmation');
select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',:'attachment_id','50000000-0000-0000-0000-000000000003',repeat('a',64));
set role authenticated;
select pg_temp.op_reject(format($q$select public.salvar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000042',jsonb_build_object('pessoa_id',%L,'competencia_id',%L,'emissor','Changed','conclusao','2026-10-01','validade','2027-10-31'),%L,6)$q$,:'field_person',:'skill_id',:'qualification_id'),'23514','approved qualification cannot silently renew');
select pg_temp.op_reject(format($q$select public.salvar_competencia('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000043','{"nome":"Competência política de teste","exige_evidencia":false,"exige_validade":true}',%L,1)$q$,:'skill_id'),'23514','used qualification policy cannot change historical criteria');
select public.transicionar_qualificacao('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000044',:'qualification_id',6,'revogada','Evidência revogada pelo emissor');

-- Canonical action: field execution and independent review remain separate.
select (public.salvar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000050',jsonb_build_object('titulo','Corrigir condição registrada','responsavel_id',:'field_person','prioridade','alta'))->>'id') as action_id \gset
select pg_temp.op_reject(format($q$select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000051',%L,1,'concluida','Invalid skip')$q$,:'action_id'),'23514','action cannot skip execution and review');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000052',:'action_id',1,'em_execucao');
select pg_temp.op_reject(format($q$select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000053',%L,2,'aguardando_verificacao','Correção executada')$q$,:'action_id'),'23514','action requires linked evidence for review');
select (public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000054',jsonb_build_object('acao_id',:'action_id','nome','acao.jpg','mime','image/jpeg','tamanho',200,'sha256',repeat('b',64)))->>'id') as action_attachment \gset
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',caminho,'{"size":200,"mimetype":"image/jpeg"}'::jsonb from public.anexos where id=:'action_attachment';
set role service_role;
select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',:'action_attachment','50000000-0000-0000-0000-000000000003',repeat('b',64));
set role authenticated;
select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000055',:'action_id',2,'aguardando_verificacao','Correção executada e fotografada');
select pg_temp.op_reject(format($q$select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000056',%L,3,'concluida','Approve own work')$q$,:'action_id'),'42501','field cannot approve own action');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000057',:'action_id',3,'em_execucao','Evidência precisa de complemento');
select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000058',:'action_id',4,'aguardando_verificacao','Complemento conferido na origem');
select (public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000061',jsonb_build_object('acao_id',:'action_id','nome','late-action.jpg','mime','image/jpeg','tamanho',201,'sha256',repeat('e',64)))->>'id') as late_action_attachment \gset
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',caminho,'{"size":201,"mimetype":"image/jpeg"}'::jsonb from public.anexos where id=:'late_action_attachment';
select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000059',:'action_id',5,'concluida','Resultado verificado pela engenharia');
select pg_temp.op_reject(format($q$select public.preparar_anexo_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000062',jsonb_build_object('acao_id',%L,'nome','after-closure.jpg','mime','image/jpeg','tamanho',200,'sha256',repeat('f',64)))$q$,:'action_id'),'23514','closed action cannot receive a new evidence upload');
set role service_role;
select pg_temp.op_reject(format($q$select public.confirmar_anexo_operacional('51000000-0000-0000-0000-000000000001',%L,'50000000-0000-0000-0000-000000000002',repeat('e',64))$q$,:'late_action_attachment'),'23514','action closure blocks late upload confirmation');
set role authenticated;
select pg_temp.op_assert((select estado='concluida' and verificado_por='50000000-0000-0000-0000-000000000002' from public.acoes_operacionais where id=:'action_id'),'action completion records independent reviewer');
select pg_temp.op_assert((select count(*)=6 from public.operacao_historico where entidade='acoes_operacionais' and entidade_id=:'action_id'),'action timeline preserves submission, return, resubmission and review');
select pg_temp.op_reject(format($q$select public.salvar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000060',jsonb_build_object('titulo','Changed after closure','responsavel_id',%L),%L,6)$q$,:'field_person',:'action_id'),'23514','closed action is immutable');

-- Membership removal leaves historical author/roles but revokes all helpers.
reset role;
delete from public.memberships where organization_id='51000000-0000-0000-0000-000000000001' and user_id='50000000-0000-0000-0000-000000000006';
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000006',false);
select pg_temp.op_assert(not public.pode('51000000-0000-0000-0000-000000000001','ver_custos') and not public.has_org_role('51000000-0000-0000-0000-000000000001','admin') and not public.can_see_costs('51000000-0000-0000-0000-000000000001'),'orphan role cannot retain historical permissions after membership removal');
reset role;
delete from public.user_roles where organization_id='51000000-0000-0000-0000-000000000001' and user_id='50000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
select pg_temp.op_assert((select count(*)=0 from public.pessoas),'role revocation removes own person detail');
select pg_temp.op_assert(not public.operacao_ler_anexo('51000000-0000-0000-0000-000000000001',:'attachment_id'),'role revocation removes attachment parent access');
select pg_temp.op_assert((select count(*)=0 from storage.objects),'role revocation removes private object access');
select pg_temp.op_reject(format($q$select public.transicionar_acao_operacional('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000052',%L,1,'em_execucao')$q$,:'action_id'),'42501','revoked permission checked before idempotent replay');
select set_config('request.jwt.claim.sub','',false);
select pg_temp.op_assert((select count(*)=0 from public.pessoas),'logout context reads no operational people');
reset role;
\echo 'Operational SQL: all assertions passed (isolated PostgreSQL; Storage metadata only).'
