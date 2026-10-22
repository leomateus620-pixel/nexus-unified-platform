-- Correção 0020: confirmação service-only revalida o autor, sem bytes HTTP neste teste.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create function pg_temp.file_assert(_ok boolean,_label text) returns void language plpgsql as $$
begin if _ok is distinct from true then raise exception 'FAIL: %',_label; end if; raise notice 'PASS: %',_label; end $$;
create function pg_temp.file_reject(_sql text,_state text,_label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute _sql; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=_state then raise notice 'PASS: %',_label; return; end if;
    raise exception 'FAIL: % (expected %, got %: %)',_label,_state,actual,sqlerrm;
  end;
  raise exception 'FAIL: % (accepted)',_label;
end $$;
insert into auth.users(id,email) values
 ('82000000-0000-0000-0000-000000000001','file-engineer@test.invalid'),
 ('82000000-0000-0000-0000-000000000002','file-field@test.invalid'),
 ('82000000-0000-0000-0000-000000000003','file-coord@test.invalid');
insert into public.organizations(id,nome) values('82000000-0000-0000-0000-000000000010','File authorization test');
insert into public.memberships(organization_id,user_id) select '82000000-0000-0000-0000-000000000010',id from auth.users where id::text like '82000000-%';
insert into public.user_roles(organization_id,user_id,role) values
 ('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000001','engenharia'),
 ('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000002','campo');
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
insert into public.user_capacidades(organization_id,user_id,capacidade) values('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000003','coordenar_operacao');
set local role authenticated;
select (public.salvar_pessoa('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000020','{"nome":"Field person","vinculo":"colaborador","user_id":"82000000-0000-0000-0000-000000000002"}')->>'id') as field_id \gset
select (public.salvar_pessoa('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000021','{"nome":"Other person","vinculo":"prestador"}')->>'id') as other_id \gset
select (public.preparar_anexo_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000022',jsonb_build_object('pessoa_id',:'other_id','nome','person.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('a',64)))->>'id') as person_file \gset
select pg_temp.file_reject($q$select public.operacao_autor_ler_anexo('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001')$q$,'42501','explicit-author reader is not an authenticated RPC');
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',caminho,'{"size":100,"mimetype":"application/pdf"}'::jsonb from public.anexos where id=:'person_file';
delete from public.user_roles where user_id='82000000-0000-0000-0000-000000000001';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000001',repeat('a',64))$q$,:'person_file'),'42501','membership without current role cannot confirm staged file');
select pg_temp.file_reject($q$select public.operacao_autor_pode('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000001','ver_equipe')$q$,'42501','explicit-author permission helper is private even to service role');
reset role;
select pg_temp.file_assert((select estado='pendente' from public.anexos where id=:'person_file'),'denied confirmation leaves pending state unchanged');
insert into public.user_roles(organization_id,user_id,role) values('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000001','engenharia');
set local role service_role;
select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',:'person_file','82000000-0000-0000-0000-000000000001',repeat('a',64));
select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',:'person_file','82000000-0000-0000-0000-000000000001',repeat('a',64));
reset role;
select pg_temp.file_assert((select estado='vinculado' from public.anexos where id=:'person_file'),'authorized service confirmation and retry still work');
delete from public.user_roles where user_id='82000000-0000-0000-0000-000000000001';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000001',repeat('a',64))$q$,:'person_file'),'42501','already-linked retry also revalidates revoked author role');
reset role;
insert into public.user_roles(organization_id,user_id,role) values('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000001','engenharia');
set local role authenticated;
select (public.salvar_acao_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000023',jsonb_build_object('titulo','Action attachment scope','responsavel_id',:'field_id'))->>'id') as action_id \gset
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000002',true);
select (public.preparar_anexo_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000024',jsonb_build_object('acao_id',:'action_id','nome','action.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('a',64)))->>'id') as action_file \gset
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
select public.salvar_acao_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000025',jsonb_build_object('titulo','Action attachment scope','responsavel_id',:'other_id'),:'action_id',1);
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000002',repeat('a',64))$q$,:'action_file'),'42501','reassigning action revokes former responsible upload confirmation');
reset role;
insert into public.acao_colaboradores(organization_id,acao_id,pessoa_id) values('82000000-0000-0000-0000-000000000010',:'action_id',:'field_id');
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000002',true);
select pg_temp.file_assert(public.operacao_ler_anexo('82000000-0000-0000-0000-000000000010',:'action_file'),'current collaborator retains canonical attachment read scope');
reset role;
delete from public.acao_colaboradores where acao_id=:'action_id' and pessoa_id=:'field_id';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000002',repeat('a',64))$q$,:'action_file'),'42501','removing collaborator revokes upload confirmation');
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000003',true);
select (public.preparar_anexo_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000026',jsonb_build_object('pessoa_id',:'other_id','nome','coord.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('a',64)))->>'id') as coord_file \gset
reset role;
delete from public.user_capacidades where user_id='82000000-0000-0000-0000-000000000003';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000003',repeat('a',64))$q$,:'coord_file'),'42501','revoking coordination capability prevents privileged confirmation');
reset role;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
insert into public.user_capacidades(organization_id,user_id,capacidade) values('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000003','coordenar_operacao');
delete from public.memberships where user_id='82000000-0000-0000-0000-000000000003';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000003',repeat('a',64))$q$,:'coord_file'),'42501','offboarding prevents privileged confirmation');
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000002',true);
select (public.preparar_anexo_operacional('82000000-0000-0000-0000-000000000010','82000000-0000-0000-0000-000000000027',jsonb_build_object('pessoa_id',:'field_id','nome','own.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('a',64)))->>'id') as own_file \gset
reset role;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
update public.pessoas set ativa=false where id=:'field_id';
set local role service_role;
select pg_temp.file_reject(format($q$select public.confirmar_anexo_operacional('82000000-0000-0000-0000-000000000010',%L,'82000000-0000-0000-0000-000000000002',repeat('a',64))$q$,:'own_file'),'42501','inactive person loses self attachment confirmation scope');
reset role;
rollback;
\echo 'Attachment confirmation authorization: all assertions passed (isolated metadata SQL).'
