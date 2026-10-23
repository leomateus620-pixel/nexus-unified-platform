\set ON_ERROR_STOP on
\set QUIET on
-- Disposable PostgreSQL only. Storage rows below are metadata, not uploaded bytes or HTTP evidence.
begin;
reset role;
create function pg_temp.afa(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'ALM FILES FAIL: %',label;end if;
 raise notice 'ALM FILES PASS: %',label;
end$$;
create function pg_temp.afe(q text,code text,label text) returns void language plpgsql as $$begin
 begin execute q;exception when others then
  if sqlstate=code then raise notice 'ALM FILES PASS: %',label;return;end if;
  raise exception 'ALM FILES FAIL: % expected %, got %: %',label,code,sqlstate,sqlerrm;
 end;raise exception 'ALM FILES FAIL: % accepted',label;
end$$;
create temp table af_state(chave text primary key,valor jsonb not null);
grant all on af_state to authenticated,service_role;
insert into auth.users(id,email) select ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'warehouse-files-'||n||'@test.invalid' from generate_series(1,6)n;
insert into public.organizations(id,nome) values('a3100000-0000-4000-8000-000000000001','Warehouse files isolated A'),('a3100000-0000-4000-8000-000000000002','Warehouse files isolated B');
insert into public.memberships(organization_id,user_id) select 'a3100000-0000-4000-8000-000000000001',('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5)n;
insert into public.memberships(organization_id,user_id) values('a3100000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000006');
insert into public.user_roles(organization_id,user_id,role) values
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','admin'),
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','engenharia'),
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003','campo'),
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000004','campo'),
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000005','compras'),
 ('a3100000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000006','admin');
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000001',true);
insert into public.pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional) values
 ('a3200000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000001','Warehouse files professional fixture','colaborador','a3000000-0000-4000-8000-000000000001','TEST-REGISTRY-ONLY'),
 ('a3200000-0000-4000-8000-000000000003','a3100000-0000-4000-8000-000000000001','Assigned field fixture','colaborador','a3000000-0000-4000-8000-000000000003',null),
 ('a3200000-0000-4000-8000-000000000004','a3100000-0000-4000-8000-000000000001','Other field fixture','colaborador','a3000000-0000-4000-8000-000000000004',null);
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into af_state select 'local',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'salvar_local','{"nome":"Fixture private store","descricao":"Files test local","ativo":true}');
select valor->>'id' as af_local from af_state where chave='local' \gset
insert into af_state select 'tool',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'salvar_ferramenta',jsonb_build_object('patrimonio','AF-TOOL','descricao','Individual tool files fixture','local_id',:'af_local','proprietario','nexus','exige_calibracao',false));
select valor->>'id' as af_tool from af_state where chave='tool' \gset
insert into af_state values('legacy_payload',jsonb_build_object('pessoa_id','a3200000-0000-4000-8000-000000000003','acao_id',null,'qualificacao_id',null,'nome','legacy-original.jpg','mime','image/jpeg','tamanho',100,'sha256',repeat('a',64)));
insert into af_state select 'legacy_file',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000001',valor) from af_state where chave='legacy_payload';
select pg_temp.afa(public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000001',p.valor)->>'id'=a.valor->>'id','F01 legacy payload retry preserves old identity without new optional keys') from af_state p,af_state a where p.chave='legacy_payload' and a.chave='legacy_file';
select pg_temp.afe(format('select public.preparar_anexo_operacional(%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000001',valor||'{"ferramenta_id":null}'),'23505','F02 optional null changes payload and cannot reuse legacy key') from af_state where chave='legacy_payload';
reset role;
select pg_temp.afa(request_hash=(select md5(valor::text) from af_state where chave='legacy_payload'),'F03 legacy request hash remains exact JSONB payload hash') from public.operacoes_idempotentes where organization_id='a3100000-0000-4000-8000-000000000001' and chave='a3300000-0000-4000-8000-000000000001';
select pg_temp.afe(format('insert into public.anexos(organization_id,ferramenta_id,pessoa_id,nome,mime,tamanho,sha256,caminho,created_by) values(%L,%L,%L,%L,%L,100,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_tool','a3200000-0000-4000-8000-000000000003','xor.jpg','image/jpeg',repeat('a',64),'fixture/xor','a3000000-0000-4000-8000-000000000001'),'23514','F04 direct SQL cannot link two canonical parents');
select pg_temp.afe(format('insert into public.anexos(organization_id,ferramenta_id,nome,mime,tamanho,sha256,caminho,created_by) values(%L,%L,%L,%L,100,%L,%L,%L)','a3100000-0000-4000-8000-000000000002',:'af_tool','cross.jpg','image/jpeg',repeat('a',64),'fixture/cross','a3000000-0000-4000-8000-000000000006'),'23503','F05 composite FK prevents cross-organization attachment');
set local role authenticated;
insert into af_state values('tool_payload',jsonb_build_object('ferramenta_id',:'af_tool','nome','tool-evidence.jpg','mime','image/jpeg','tamanho',100,'sha256',repeat('a',64)));
insert into af_state select 'tool_file',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000002',valor) from af_state where chave='tool_payload';
select valor->>'id' as af_tool_file,valor->>'caminho' as af_tool_path from af_state where chave='tool_file' \gset
select pg_temp.afa(public.listar_anexos_operacionais('a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool'))->'permissoes'->>'adicionar'='true' and public.operacao_pode_enviar_anexo('a3100000-0000-4000-8000-000000000001',:'af_tool_file'),'F06 manager receives explicit parent upload capability');
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_tool_file','a3000000-0000-4000-8000-000000000001',repeat('a',64)),'42501','F07 authenticated client cannot confirm privileged storage');
insert into af_state select 'custody',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'reservar_ferramenta',jsonb_build_object('ferramenta_id',:'af_tool','expected_version',1,'pessoa_id','a3200000-0000-4000-8000-000000000003','inicio',now(),'fim',now()+interval '2 hours'));
select valor->'detalhe'->'custodias'->0->>'id' as af_custody from af_state where chave='custody' \gset
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000003',true);
select pg_temp.afa(public.listar_anexos_operacionais('a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool'))->'permissoes'->>'adicionar'='false','F08 reserved custody permits reading without condition uploads');
select pg_temp.afe(format('select public.preparar_anexo_operacional(%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',gen_random_uuid(),valor),'42501','F09 field cannot upload before actual withdrawal') from af_state where chave='tool_payload';
select public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'retirar_ferramenta',jsonb_build_object('custodia_id',:'af_custody','expected_version',1)) is not null;
insert into af_state select 'field_file',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000003',valor||'{"nome":"field-condition.jpg"}') from af_state where chave='tool_payload';
select valor->>'id' as af_field_file,valor->>'caminho' as af_field_path from af_state where chave='field_file' \gset
select pg_temp.afa(public.operacao_pode_enviar_anexo('a3100000-0000-4000-8000-000000000001',:'af_field_file'),'F10 withdrawn custody permits own condition evidence');
insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',:'af_field_path','{"size":100,"mimetype":"image/jpeg"}');
select pg_temp.afa((select count(*) from storage.objects where name=:'af_field_path')=0,'F11 unconfirmed object is not downloadable');
set local role service_role;
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_field_file','a3000000-0000-4000-8000-000000000003',repeat('a',64)) is null;
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_field_file','a3000000-0000-4000-8000-000000000003',repeat('a',64)) is null;
set local role authenticated;
select pg_temp.afa((select estado='vinculado' from public.anexos where id=:'af_field_file') and(select count(*) from storage.objects where name=:'af_field_path')=1,'F12 confirmed own original is private and retry-safe');
insert into af_state select 'field_pending',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000004',valor||'{"nome":"pending-before-return.jpg"}') from af_state where chave='tool_payload';
select valor->>'id' as af_pending_file,valor->>'caminho' as af_pending_path from af_state where chave='field_pending' \gset
select public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'devolver_ferramenta',jsonb_build_object('custodia_id',:'af_custody','expected_version',2,'condicao','avariada','motivo','Damage documented in local test')) is not null;
select pg_temp.afa((public.listar_anexos_operacionais('a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool'))->'permissoes'->>'adicionar')='false' and not public.operacao_pode_enviar_anexo('a3100000-0000-4000-8000-000000000001',:'af_pending_file'),'F13 returned custody preserves history while revoking upload capability');
select pg_temp.afe(format('insert into storage.objects(bucket_id,name,metadata) values(%L,%L,%L::jsonb)','nexus-operacional',:'af_pending_path','{"size":100,"mimetype":"image/jpeg"}'),'42501','F14 current upload policy rejects object after custody ended');
select pg_temp.afe(format('select public.cancelar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_pending_file',gen_random_uuid(),'Cancel after authority ended'),'42501','F15 cancellation rechecks current write access');
set local role service_role;
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_pending_file','a3000000-0000-4000-8000-000000000003',repeat('a',64)),'23514','F16 pending confirmation refuses ended write context');
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_field_file','a3000000-0000-4000-8000-000000000003',repeat('a',64)) is null;
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000004',true);
select pg_temp.afe(format('select public.listar_anexos_operacionais(%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool')),'42501','F17 unrelated field worker cannot enumerate tool files');
select pg_temp.afa((select count(*) from public.anexos where id=:'af_field_file')=0 and(select count(*) from storage.objects where name=:'af_field_path')=0,'F18 direct metadata and object reads also enforce parent access');
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000006',true);
select pg_temp.afe(format('select public.listar_anexos_operacionais(%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool')),'42501','F19 another organization cannot read by parent ID');
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000001',true);
insert into af_state select 'policy',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'publicar_politica_calibracao','{"nome":"Calibration fixture policy","metodo":"Controlled procedure only for isolated test","fonte":"Internal authorized fixture version one","exige_validade":false}');
select valor->>'id' as af_policy from af_state where chave='policy' \gset
insert into af_state select 'calibration_result',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'registrar_calibracao',jsonb_build_object('ferramenta_id',:'af_tool','politica_id',:'af_policy','emissor','Fixture calibration laboratory','execucao',current_date,'referencia','Reference alone does not prove a certificate'));
select valor->'detalhe'->'calibracoes'->0->>'id' as af_calibration from af_state where chave='calibration_result' \gset
select public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'conferir_calibracao',jsonb_build_object('calibracao_id',:'af_calibration','expected_version',1,'estado','em_conferencia')) is not null;
select pg_temp.afe(format('select public.alm_executar(%L,%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'conferir_calibracao',jsonb_build_object('calibracao_id',:'af_calibration','expected_version',2,'estado','validada')),'23514','F20 textual reference cannot replace confirmed private certificate');
insert into af_state values('cal_payload',jsonb_build_object('calibracao_id',:'af_calibration','nome','certificate.jpg','mime','image/jpeg','tamanho',100,'sha256',repeat('b',64)));
insert into af_state select 'cal_file',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000005',valor) from af_state where chave='cal_payload';
select valor->>'id' as af_cal_file,valor->>'caminho' as af_cal_path from af_state where chave='cal_file' \gset
set local role service_role;
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_cal_file','a3000000-0000-4000-8000-000000000001',repeat('b',64)),'23514','F21 missing object never becomes a confirmed certificate');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',:'af_cal_path','{"size":99,"mimetype":"image/jpeg"}');
set local role service_role;
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_cal_file','a3000000-0000-4000-8000-000000000001',repeat('b',64)),'23514','F22 storage size mismatch prevents confirmation');
reset role;
update storage.objects set metadata='{"size":100,"mimetype":"image/jpeg"}' where name=:'af_cal_path';
set local role service_role;
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_cal_file','a3000000-0000-4000-8000-000000000001',repeat('b',64)) is null;
set local role authenticated;
select pg_temp.afa(public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'conferir_calibracao',jsonb_build_object('calibracao_id',:'af_calibration','expected_version',2,'estado','validada'))->'detalhe'->'calibracoes'->0->>'estado'='validada','F23 calibration validates only after private certificate confirmation');
select pg_temp.afa(public.listar_anexos_operacionais('a3100000-0000-4000-8000-000000000001',jsonb_build_object('calibracao_id',:'af_calibration'))->'permissoes'->>'adicionar'='false','F24 validated calibration exposes no upload action');
select pg_temp.afe(format('select public.preparar_anexo_operacional(%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',gen_random_uuid(),valor),'42501','F25 validated calibration cannot receive another original') from af_state where chave='cal_payload';
set local role service_role;
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_cal_file','a3000000-0000-4000-8000-000000000001',repeat('b',64)) is null;
reset role;
select pg_temp.afe(format('update public.anexos set nome=%L where id=%L','forged-name.jpg',:'af_cal_file'),'23514','F26 linked filename is immutable at database boundary');
select pg_temp.afe(format('update public.anexos set ferramenta_id=%L,calibracao_id=null where id=%L',:'af_tool',:'af_cal_file'),'23514','F27 parent origin cannot be reassigned after staging');
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000005',true);
set local role authenticated;
insert into af_state select 'buyer_file',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000006',valor||'{"nome":"buyer-pending.jpg"}') from af_state where chave='tool_payload';
select valor->>'id' as af_buyer_file from af_state where chave='buyer_file' \gset
reset role;
delete from public.user_roles where organization_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.afe(format('select public.preparar_anexo_operacional(%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001','a3300000-0000-4000-8000-000000000006',valor||'{"nome":"buyer-pending.jpg"}'),'42501','F28 replay reauthorizes the actor before returning old receipt') from af_state where chave='tool_payload';
set local role service_role;
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_buyer_file','a3000000-0000-4000-8000-000000000005',repeat('a',64)),'42501','F29 service confirmation checks current actor role');
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.afe(format('select public.cancelar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_tool_file',gen_random_uuid(),'no'),'23514','F30 cancellation requires an operational reason');
select pg_temp.afa(public.cancelar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_tool_file','a3300000-0000-4000-8000-000000000007','Cancel isolated pending condition upload')->>'estado'='cancelado','F31 pending upload cancellation is explicit');
select pg_temp.afa(public.cancelar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_tool_file','a3300000-0000-4000-8000-000000000007','Cancel isolated pending condition upload')->>'estado'='cancelado','F32 cancellation retry is idempotent');
select pg_temp.afe(format('select public.cancelar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_tool_file','a3300000-0000-4000-8000-000000000007','Different cancellation reason'),'23505','F33 same cancel key cannot carry another reason');
select pg_temp.afa(not public.operacao_pode_enviar_anexo('a3100000-0000-4000-8000-000000000001',:'af_tool_file') and not exists(select 1 from jsonb_array_elements(public.listar_anexos_operacionais('a3100000-0000-4000-8000-000000000001',jsonb_build_object('ferramenta_id',:'af_tool'))->'registros')e where e->>'id'=:'af_tool_file'),'F34 cancelled staging is omitted and cannot receive uploads');
reset role;
delete from public.user_roles where organization_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000003';
set local role service_role;
select pg_temp.afe(format('select public.confirmar_anexo_operacional(%L,%L,%L,%L)','a3100000-0000-4000-8000-000000000001',:'af_field_file','a3000000-0000-4000-8000-000000000003',repeat('a',64)),'42501','F35 linked confirmation retry still revalidates revoked actor access');
set local role authenticated;
insert into af_state select 'tz_policy',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'publicar_politica_calibracao','{"nome":"Civil validity timezone fixture","metodo":"Procedure defined only for isolated timezone tests","fonte":"Authorized internal fixture version one","exige_validade":true}');
select valor->>'id' as af_tz_policy from af_state where chave='tz_policy' \gset
insert into af_state select 'tz_tool',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'salvar_ferramenta',jsonb_build_object('patrimonio','AF-TZ-TOOL','descricao','Tool with civil validity timezone fixture','local_id',:'af_local','proprietario','nexus','exige_calibracao',true,'politica_calibracao_id',:'af_tz_policy'));
select valor->>'id' as af_tz_tool from af_state where chave='tz_tool' \gset
insert into af_state select 'tz_calibration',public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'registrar_calibracao',jsonb_build_object('ferramenta_id',:'af_tz_tool','politica_id',:'af_tz_policy','emissor','Civil validity isolated fixture','execucao',current_date,'validade',current_date+30));
select valor->'detalhe'->'calibracoes'->0->>'id' as af_tz_calibration from af_state where chave='tz_calibration' \gset
select public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'conferir_calibracao',jsonb_build_object('calibracao_id',:'af_tz_calibration','expected_version',1,'estado','em_conferencia')) is not null;
insert into af_state select 'tz_certificate',public.preparar_anexo_operacional('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),jsonb_build_object('calibracao_id',:'af_tz_calibration','nome','timezone-certificate.jpg','mime','image/jpeg','tamanho',100,'sha256',repeat('c',64)));
select valor->>'id' as af_tz_file,valor->>'caminho' as af_tz_path from af_state where chave='tz_certificate' \gset
insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',:'af_tz_path','{"size":100,"mimetype":"image/jpeg"}');
set local role service_role;
select public.confirmar_anexo_operacional('a3100000-0000-4000-8000-000000000001',:'af_tz_file','a3000000-0000-4000-8000-000000000001',repeat('c',64));
set local role authenticated;
select public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'conferir_calibracao',jsonb_build_object('calibracao_id',:'af_tz_calibration','expected_version',2,'estado','validada')) is not null;
select pg_temp.afe(format('select public.alm_executar(%L,%L,%L,%L::jsonb)','a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'reservar_ferramenta',jsonb_build_object('ferramenta_id',:'af_tz_tool','expected_version',1,'pessoa_id','a3200000-0000-4000-8000-000000000001','inicio',((current_date+31)::timestamp at time zone 'UTC')+interval '1 hour','fim',((current_date+31)::timestamp at time zone 'UTC')+interval '2 hours','timezone','Pacific/Auckland')),'23514','F36 calibration expired on the declared New Zealand civil service date blocks reservation');
select pg_temp.afa(public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'reservar_ferramenta',jsonb_build_object('ferramenta_id',:'af_tz_tool','expected_version',1,'pessoa_id','a3200000-0000-4000-8000-000000000001','inicio',((current_date+31)::timestamp at time zone 'UTC')+interval '1 hour','fim',((current_date+31)::timestamp at time zone 'UTC')+interval '2 hours','timezone','America/Sao_Paulo'))->'detalhe'->'custodias'->0->>'timezone'='America/Sao_Paulo','F37 same instants still within valid Sao Paulo civil date are reservable');
select pg_temp.afa(public.alm_executar('a3100000-0000-4000-8000-000000000001',gen_random_uuid(),'reservar_ferramenta',jsonb_build_object('ferramenta_id',:'af_tz_tool','expected_version',2,'pessoa_id','a3200000-0000-4000-8000-000000000001','inicio',((current_date+31)::timestamp at time zone 'America/Sao_Paulo')-interval '1 hour','fim',(current_date+31)::timestamp at time zone 'America/Sao_Paulo','timezone','America/Sao_Paulo'))->>'id'=:'af_tz_tool','F38 end exactly at next civil midnight remains valid under half-open interval');
rollback;
