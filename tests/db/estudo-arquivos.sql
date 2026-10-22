\set ON_ERROR_STOP on
\set QUIET on
-- Somente PostgreSQL descartável: Storage abaixo representa metadados, nunca upload HTTP real.
begin;
reset role;
create function pg_temp.sfa(_ok boolean,_label text) returns void language plpgsql as $$ begin
 if _ok is distinct from true then raise exception 'EST FILES FAIL: %',_label;end if;
 raise notice 'EST FILES PASS: %',_label;
end $$;
create function pg_temp.sfe(_sql text,_code text,_label text) returns void language plpgsql as $$ begin
 begin execute _sql;exception when others then
  if sqlstate=_code then raise notice 'EST FILES PASS: %',_label;return;end if;
  raise exception 'EST FILES FAIL: % expected %, got % (%)',_label,_code,sqlstate,sqlerrm;
 end;raise exception 'EST FILES FAIL: % accepted',_label;
end $$;
create temp table sf_estado(chave text primary key,valor jsonb not null);
grant all on sf_estado to authenticated,service_role;
insert into auth.users(id,email) values
 ('af000000-0000-4000-8000-000000000001','study-files-author@test.invalid'),
 ('af000000-0000-4000-8000-000000000002','study-files-reviewer@test.invalid'),
 ('af000000-0000-4000-8000-000000000003','study-files-field@test.invalid'),
 ('af000000-0000-4000-8000-000000000004','study-files-other-org@test.invalid');
insert into public.organizations(id,nome) values
 ('af100000-0000-4000-8000-000000000001','Study files isolated A'),
 ('af100000-0000-4000-8000-000000000002','Study files isolated B');
insert into public.memberships(organization_id,user_id) values
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000001'),
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000002'),
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000003'),
 ('af100000-0000-4000-8000-000000000002','af000000-0000-4000-8000-000000000004');
insert into public.user_roles(organization_id,user_id,role) values
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000001','engenharia'),
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000002','engenharia'),
 ('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000003','campo'),
 ('af100000-0000-4000-8000-000000000002','af000000-0000-4000-8000-000000000004','admin');
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
insert into public.clientes(id,organization_id,razao_social) values('af200000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001','Client study files fixture');
insert into public.unidades(id,organization_id,cliente_id,nome) values('af210000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000001','Unit study files fixture');
insert into public.pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional) values
 ('af220000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001','Author isolated fixture','colaborador','af000000-0000-4000-8000-000000000001','FIXTURE-REG-A'),
 ('af220000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000001','Reviewer isolated fixture','colaborador','af000000-0000-4000-8000-000000000002','FIXTURE-REG-B');
create function pg_temp.sfc(_command text,_study uuid,_revision uuid,_extra jsonb default '{}') returns jsonb language plpgsql as $$ begin
 return public.est_executar('af100000-0000-4000-8000-000000000001',gen_random_uuid(),_command,
  jsonb_build_object('estudo_id',_study,'revisao_id',_revision,'expected_version',(select version from public.estudo_revisoes where id=_revision))||_extra);
end $$;
set local role authenticated;
insert into sf_estado select 'metodo',public.est_publicar_metodo('af100000-0000-4000-8000-000000000001',gen_random_uuid(),null,
 '{"nome":"Fixture documentary method","tipo":"memorial","instrucoes":"Critérios exclusivos de teste isolado, sem validade normativa.","fontes":[{"titulo":"Internal test fixture","edicao":"1","emissor":"Isolated suite"}],"requisitos":{}}');
insert into sf_estado select 'estudo',public.est_executar('af100000-0000-4000-8000-000000000001',gen_random_uuid(),'criar',jsonb_build_object(
 'titulo','Study with private evidence fixture','tipo','memorial','cliente_id','af200000-0000-4000-8000-000000000001','unidade_id','af210000-0000-4000-8000-000000000001',
 'responsavel_id','af220000-0000-4000-8000-000000000001','visibilidade','organizacao','metodo_versao_id',valor->'versao'->>'id')) from sf_estado where chave='metodo';
select valor->'estudo'->>'id' as sf_study,valor->'revisao'->>'id' as sf_rev from sf_estado where chave='estudo' \gset
select pg_temp.sfc('salvar_revisao',:'sf_study',:'sf_rev','{"escopo":"Documentary fixture scope","premissas":"Declared test assumptions","analise":"Evidence reviewed in isolated test","conclusao":"Test conclusion without regulatory claim","responsavel_tecnico_id":"af220000-0000-4000-8000-000000000001","revisor_id":"af220000-0000-4000-8000-000000000002","responsabilidade_tecnica":"Responsibility stated only within isolated test"}'||jsonb_build_object('metodo_versao_id',valor->'versao'->>'id')) is not null from sf_estado where chave='metodo';
select pg_temp.sfc('salvar_perigo',:'sf_study',:'sf_rev','{"codigo":"P01","descricao":"First fixture hazard","exposicao":"Test exposure","avaliacao":"Professional fixture assessment"}') is not null;
select pg_temp.sfc('salvar_perigo',:'sf_study',:'sf_rev','{"codigo":"P02","descricao":"Second fixture hazard","exposicao":"Test exposure","avaliacao":"Professional fixture assessment"}') is not null;
select id as sf_p1,version as sf_pversion from public.estudo_perigos where revisao_id=:'sf_rev' and codigo='P01' \gset
select id as sf_p2 from public.estudo_perigos where revisao_id=:'sf_rev' and codigo='P02' \gset
select version as sf_before from public.estudo_revisoes where id=:'sf_rev' \gset
insert into sf_estado values('meta','{"nome":"evidence-original.jpg","mime":"image/jpeg","tamanho":100,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
insert into sf_estado select 'arquivo',public.est_preparar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p1','af300000-0000-4000-8000-000000000001',valor) from sf_estado where chave='meta';
select valor->>'id' as sf_file,valor->>'caminho' as sf_path from sf_estado where chave='arquivo' \gset
select pg_temp.sfa(valor->>'estado'='pendente' and valor->>'perigo_id'=:'sf_p1' and public.est_pode_enviar_arquivo('af100000-0000-4000-8000-000000000001',(valor->>'id')::uuid),'staging retains exact study/revision/danger identity') from sf_estado where chave='arquivo';
select pg_temp.sfa(version=:'sf_before'::int+1,'new staging increments revision once') from public.estudo_revisoes where id=:'sf_rev';
select pg_temp.sfa(public.est_preparar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p1','af300000-0000-4000-8000-000000000001',valor)->>'id'=:'sf_file','lost staging response retries the same file identity') from sf_estado where chave='meta';
select pg_temp.sfa(version=:'sf_before'::int+1,'staging retry does not touch revision again') from public.estudo_revisoes where id=:'sf_rev';
select pg_temp.sfe(format('select public.est_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p1','af300000-0000-4000-8000-000000000001',valor||'{"nome":"different.jpg"}'),'23505','same staging key rejects different payload') from sf_estado where chave='meta';
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)),'42501','browser cannot invoke privileged confirmation');
select pg_temp.sfe(format('select pg_temp.sfc(%L,%L,%L)','submeter',:'sf_study',:'sf_rev'),'23514','unconfirmed pending original blocks submission');
set local role service_role;
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)),'23514','missing private object never becomes confirmed');
set local role authenticated;
insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',:'sf_path','{"size":100,"mimetype":"image/jpeg"}');
select pg_temp.sfa((select count(*) from storage.objects where name=:'sf_path')=0,'pending Storage object is not downloadable');
select version as sf_before_confirm from public.estudo_revisoes where id=:'sf_rev' \gset
set local role service_role;
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('b',64)),'42501','service confirmation cannot change declared hash');
select public.est_confirmar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)) is not null;
select public.est_confirmar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)) is not null;
set local role authenticated;
select pg_temp.sfa(version=:'sf_before_confirm'::int+1,'confirmation effect increments revision once across retries') from public.estudo_revisoes where id=:'sf_rev';
select pg_temp.sfa(version=:'sf_pversion'::int,'file workflow preserves danger edit version') from public.estudo_perigos where id=:'sf_p1';
select pg_temp.sfa(public.est_ler_arquivo('af100000-0000-4000-8000-000000000001',:'sf_file') and(select count(*) from storage.objects where name=:'sf_path')=1,'confirmed original uses current parent authorization');
update storage.objects set metadata='{"size":999}' where name=:'sf_path';
select pg_temp.sfa((select metadata->>'size' from storage.objects where name=:'sf_path')='100','authenticated user cannot overwrite confirmed original');
insert into sf_estado select 'cancelar',public.est_preparar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p2',gen_random_uuid(),valor) from sf_estado where chave='meta';
select pg_temp.sfa(valor->>'id'<>:'sf_file' and valor->>'perigo_id'=:'sf_p2','same bytes at another danger keep explicit association') from sf_estado where chave='cancelar';
select version as sf_before_cancel from public.estudo_revisoes where id=:'sf_rev' \gset
select public.est_cancelar_arquivo('af100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,'af300000-0000-4000-8000-000000000002','Cancel isolated pending upload') is not null from sf_estado where chave='cancelar';
select public.est_cancelar_arquivo('af100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,'af300000-0000-4000-8000-000000000002','Cancel isolated pending upload') is not null from sf_estado where chave='cancelar';
select pg_temp.sfa(version=:'sf_before_cancel'::int+1,'cancellation touches revision once, preserving its retry receipt') from public.estudo_revisoes where id=:'sf_rev';
insert into sf_estado select 'novo',public.est_preparar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p2',gen_random_uuid(),valor) from sf_estado where chave='meta';
select pg_temp.sfa(n.valor->>'id'<>a.valor->>'id','new intention after cancellation creates another staging record') from sf_estado n,sf_estado a where n.chave='novo' and a.chave='cancelar';
select public.est_cancelar_arquivo('af100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,gen_random_uuid(),'Clear isolated fixture pending upload') is not null from sf_estado where chave='novo';
-- Source ACL is an intersection, including deactivated historical links.
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000002',true);
insert into sf_estado select 'pe',public.pe_executar('af100000-0000-4000-8000-000000000001',gen_random_uuid(),'criar',
 '{"titulo":"Private source fixture","cliente_id":"af200000-0000-4000-8000-000000000001","unidade_id":"af210000-0000-4000-8000-000000000001","responsavel_id":"af220000-0000-4000-8000-000000000002","visibilidade":"organizacao","resumo":"Source for isolated study files","modelo":{"schema_version":1,"familia":"documental","finalidade":"estudo","secoes":[{"id":"af400000-0000-4000-8000-000000000001","titulo":"Source","texto":"Isolated fixture"}],"parametros":[]}}');
select valor->'projeto'->>'id' as sf_pe,valor->'versao'->>'id' as sf_pev from sf_estado where chave='pe' \gset
select public.pe_executar('af100000-0000-4000-8000-000000000001',gen_random_uuid(),'submeter',jsonb_build_object('projeto_id',:'sf_pe','versao_id',:'sf_pev','expected_version',1)) is not null;
select public.pe_executar('af100000-0000-4000-8000-000000000001',gen_random_uuid(),'congelar',jsonb_build_object('projeto_id',:'sf_pe','versao_id',:'sf_pev','expected_version',2)) is not null;
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
select pg_temp.sfc('vincular_fonte',:'sf_study',:'sf_rev',jsonb_build_object('tipo','projeto_engenharia','pe_versao_id',:'sf_pev','justificativa','Source retained in isolated file history')) is not null;
select id as sf_fonte from public.estudo_fontes where revisao_id=:'sf_rev' and pe_versao_id=:'sf_pev' \gset
select pg_temp.sfc('desativar_fonte',:'sf_study',:'sf_rev',jsonb_build_object('fonte_id',:'sf_fonte','motivo','Retain source in history, not current analysis')) is not null;
insert into sf_estado select 'acl_pending',public.est_preparar_arquivo('af100000-0000-4000-8000-000000000001',:'sf_rev',null,gen_random_uuid(),valor) from sf_estado where chave='meta';
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',valor->>'caminho','{"size":100,"mimetype":"image/jpeg"}' from sf_estado where chave='acl_pending';
reset role;
update public.pe_projetos set visibilidade='restrito' where id=:'sf_pe';
set local role authenticated;
select pg_temp.sfa((select count(*) from public.estudo_arquivos where id=:'sf_file')=0 and(select count(*) from storage.objects where name=:'sf_path')=0,'revoked historical source removes file metadata and Storage access');
set local role service_role;
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)),'42501','historical source revocation rejects linked confirmation retry');
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',valor->>'id','af000000-0000-4000-8000-000000000001',repeat('a',64)),'42501','historical source revocation rejects pending confirmation') from sf_estado where chave='acl_pending';
set local role authenticated;
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000002',true);
select pg_temp.sfa(public.est_ler_arquivo('af100000-0000-4000-8000-000000000001',:'sf_file'),'another authorized source holder retains access');
reset role;
update public.pe_projetos set visibilidade='organizacao' where id=:'sf_pe';
delete from public.user_roles where organization_id='af100000-0000-4000-8000-000000000001' and user_id='af000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.sfe(format('select public.est_confirmar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file','af000000-0000-4000-8000-000000000001',repeat('a',64)),'42501','role revoked with membership retained rejects linked retry');
reset role;
insert into public.user_roles(organization_id,user_id,role) values('af100000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000001','engenharia');
set local role authenticated;
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000003',true);
select pg_temp.sfa((select count(*) from public.estudo_arquivos where id=:'sf_file')=0 and(select count(*) from storage.objects where name=:'sf_path')=0,'field role receives no technical evidence');
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000004',true);
select pg_temp.sfa((select count(*) from public.estudo_arquivos where id=:'sf_file')=0 and not public.est_ler_arquivo('af100000-0000-4000-8000-000000000001',:'sf_file'),'other tenant admin cannot read file identity');
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000001',true);
select public.est_cancelar_arquivo('af100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,gen_random_uuid(),'Cancel pending fixture before review') is not null from sf_estado where chave='acl_pending';
select pg_temp.sfc('submeter',:'sf_study',:'sf_rev') is not null;
select pg_temp.sfa(jsonb_array_length(s.snapshot->'arquivos')=1 and s.snapshot->'arquivos'->0->>'sha256'=repeat('a',64),'submission snapshot fixes only confirmed file manifest') from public.estudo_submissoes s where s.revisao_id=:'sf_rev';
select pg_temp.sfe(format('select public.est_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','af100000-0000-4000-8000-000000000001',:'sf_rev',:'sf_p1',gen_random_uuid(),valor),'23514','reviewed revision rejects new files') from sf_estado where chave='meta';
select set_config('request.jwt.claim.sub','af000000-0000-4000-8000-000000000002',true);
select pg_temp.sfc('aprovar',:'sf_study',:'sf_rev','{"motivo":"Approve isolated checked evidence"}') is not null;
insert into sf_estado select 'approved_snapshot',snapshot from public.estudo_revisoes where id=:'sf_rev';
select pg_temp.sfa(snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),'approved snapshot hash includes original manifest') from public.estudo_revisoes where id=:'sf_rev';
select pg_temp.sfe(format('select public.est_cancelar_arquivo(%L,%L,%L,%L)','af100000-0000-4000-8000-000000000001',:'sf_file',gen_random_uuid(),'Do not remove approved original'),'23514','approved original cannot be cancelled');
reset role;
select pg_temp.sfe(format('update public.estudo_arquivos set nome=%L where id=%L','overwrite.jpg',:'sf_file'),'23514','database prevents direct metadata replacement after approval');
set local role authenticated;
select pg_temp.sfc('nova_revisao',:'sf_study',:'sf_rev','{"motivo":"New isolated review preserves originals"}') is not null;
select revisao_atual_id as sf_rev2 from public.estudos_tecnicos where id=:'sf_study' \gset
select pg_temp.sfa((select count(*) from public.estudo_arquivos where revisao_id=:'sf_rev2')=0,'new revision references lineage without copying private originals');
select pg_temp.sfe(format('select public.est_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','af100000-0000-4000-8000-000000000001',:'sf_rev2',:'sf_p1',gen_random_uuid(),valor),'42501','danger from prior revision cannot be attached to the new revision') from sf_estado where chave='meta';
select pg_temp.sfa(snapshot=(select valor from sf_estado where chave='approved_snapshot'),'new revision leaves original snapshot byte-for-byte unchanged') from public.estudo_revisoes where id=:'sf_rev';
reset role;
rollback;
\echo 'Study evidence SQL passed.'
