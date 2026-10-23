\set ON_ERROR_STOP on
\set QUIET on
create function pg_temp.ad_assert(_ok boolean,_label text) returns void language plpgsql as $$
begin if _ok is distinct from true then raise exception 'ADMIN FAIL: %',_label; end if; raise notice 'ADMIN PASS: %',_label; end $$;
create function pg_temp.ad_reject(_sql text,_state text,_label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute _sql; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=_state then raise notice 'ADMIN PASS: %',_label; return; end if;
    raise exception 'ADMIN FAIL: % expected %, got % (%)',_label,_state,actual,sqlerrm;
  end;
  raise exception 'ADMIN FAIL: % accepted',_label;
end $$;
insert into auth.users(id,email) values
 ('70000000-0000-0000-0000-000000000001','admin-a@test.invalid'),
 ('70000000-0000-0000-0000-000000000002','admin-b@test.invalid'),
 ('70000000-0000-0000-0000-000000000003','existing-user@test.invalid'),
 ('70000000-0000-0000-0000-000000000004','eng-user@test.invalid'),
 ('70000000-0000-0000-0000-000000000005','admin-other@test.invalid');
insert into public.organizations(id,nome) values('71000000-0000-0000-0000-000000000001','Admin test A'),('71000000-0000-0000-0000-000000000002','Admin test B');
insert into public.memberships(organization_id,user_id) values
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001'),
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002'),
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004'),
 ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000005');
insert into public.user_roles(organization_id,user_id,role) values
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','admin'),
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','admin'),
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','engenharia'),
 ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000005','admin');
set role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',false);
select (public.salvar_pessoa('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Pessoa com autoria preservada","vinculo":"colaborador","user_id":"70000000-0000-0000-0000-000000000002"}')->>'id') as authored_person \gset
select (public.salvar_pessoa('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"nome":"Pessoa antes de login","vinculo":"prestador"}')->>'id') as new_person \gset
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000004',false);
select pg_temp.ad_reject($q$select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'vincular','{"user_id":"70000000-0000-0000-0000-000000000003","nome":"Existing user","role":"campo"}')$q$,'42501','engineering cannot administer membership');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000005',false);
select pg_temp.ad_reject($q$select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'vincular','{"user_id":"70000000-0000-0000-0000-000000000003","nome":"Existing user","role":"campo"}')$q$,'42501','other tenant admin cannot administer membership');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',false);
select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','vincular',jsonb_build_object('user_id','70000000-0000-0000-0000-000000000003','nome','Conta Auth existente','role','campo','pessoa_id',:'new_person')) as linked \gset
select pg_temp.ad_assert(public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','vincular',jsonb_build_object('user_id','70000000-0000-0000-0000-000000000003','nome','Conta Auth existente','role','campo','pessoa_id',:'new_person'))=:'linked'::jsonb,'administrative link retry is idempotent');
select pg_temp.ad_assert((select count(*)=1 from public.memberships where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000003'),'existing Auth account linked once');
select pg_temp.ad_assert((select user_id='70000000-0000-0000-0000-000000000003' from public.pessoas where id=:'new_person'),'later user link preserves canonical person identity');
select pg_temp.ad_reject($q$select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','papel','{"user_id":"70000000-0000-0000-0000-000000000003","role":"admin"}')$q$,'23505','same administrative key cannot switch command or payload');
select pg_temp.ad_reject($q$select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'vincular','{"user_id":"70000000-0000-0000-0000-000000000099","nome":"Unknown account","role":"campo"}')$q$,'23514','nonexistent Auth account does not create membership');
select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'coordenacao','{"user_id":"70000000-0000-0000-0000-000000000003","habilitar":true}');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000003',false);
select pg_temp.ad_assert(public.operacao_pode('71000000-0000-0000-0000-000000000001','gerir_operacao') and not public.has_org_role('71000000-0000-0000-0000-000000000001','admin'),'coordination is a capability without global admin');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',false);
select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'desligar','{"user_id":"70000000-0000-0000-0000-000000000002","motivo":"Desligamento operacional de teste"}');
select pg_temp.ad_assert((select user_id is null and created_by='70000000-0000-0000-0000-000000000002' from public.pessoas where id=:'authored_person'),'offboarding preserves historical author and person while removing login link');
select pg_temp.ad_assert((select count(*)>0 from public.operacao_historico where entidade='pessoas' and entidade_id=:'authored_person' and autor='70000000-0000-0000-0000-000000000002'),'offboarding does not rewrite previous audit author');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',false);
select pg_temp.ad_assert(not public.is_member('71000000-0000-0000-0000-000000000001') and not public.has_org_role('71000000-0000-0000-0000-000000000001','admin'),'offboarded admin immediately loses membership and admin permission');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',false);
select pg_temp.ad_reject($q$select public.administrar_vinculo_operacional('71000000-0000-0000-0000-000000000001',gen_random_uuid(),'desligar','{"user_id":"70000000-0000-0000-0000-000000000001","motivo":"Cannot remove last admin"}')$q$,'23514','last admin cannot offboard self');
select pg_temp.ad_reject($q$delete from public.user_roles where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000001' and role='admin'$q$,'23514','direct last-admin role deletion blocked');
select pg_temp.ad_reject($q$delete from public.memberships where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000001'$q$,'23514','direct last-admin membership deletion blocked');
select pg_temp.ad_reject($q$update public.memberships set user_id='70000000-0000-0000-0000-000000000002' where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000001'$q$,'23514','membership identity UPDATE cannot bypass last-admin protection');
update public.memberships set nome='Administrador atualizado' where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000001';
select pg_temp.ad_assert((select nome='Administrador atualizado' from public.memberships where organization_id='71000000-0000-0000-0000-000000000001' and user_id='70000000-0000-0000-0000-000000000001'),'last admin can still edit membership metadata');
reset role;
\echo 'Administrative membership SQL passed.'
