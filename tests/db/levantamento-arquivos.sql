\set ON_ERROR_STOP on
\set QUIET on
-- Somente no runner PostgreSQL descartável. Não envia binários nem dados ao projeto conectado.
begin;
reset role;
create function pg_temp.lfa(_ok boolean,_label text) returns void language plpgsql as $$ begin
  if _ok is distinct from true then raise exception 'LEV FILES FAIL: %',_label; end if;
  raise notice 'LEV FILES PASS: %',_label;
end $$;
create function pg_temp.lfe(_sql text,_code text,_label text) returns void language plpgsql as $$ begin
  begin execute _sql; exception when others then
    if sqlstate=_code then raise notice 'LEV FILES PASS: %',_label;return;end if;
    raise exception 'LEV FILES FAIL: % expected %, got % (%)',_label,_code,sqlstate,sqlerrm;
  end;
  raise exception 'LEV FILES FAIL: % accepted',_label;
end $$;
create temp table lf_estado(chave text primary key,valor jsonb not null);
grant all on lf_estado to authenticated,service_role;
insert into auth.users(id,email) values
 ('9f000000-0000-4000-8000-000000000001','lev-eng@test.invalid'),
 ('9f000000-0000-4000-8000-000000000002','lev-field@test.invalid'),
 ('9f000000-0000-4000-8000-000000000003','lev-other-field@test.invalid'),
 ('9f000000-0000-4000-8000-000000000004','lev-other-tenant@test.invalid');
insert into public.organizations(id,nome) values
 ('9f100000-0000-4000-8000-000000000001','Levantamento arquivos teste A'),
 ('9f100000-0000-4000-8000-000000000002','Levantamento arquivos teste B');
insert into public.memberships(organization_id,user_id) values
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000001'),
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000002'),
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000003'),
 ('9f100000-0000-4000-8000-000000000002','9f000000-0000-4000-8000-000000000004');
insert into public.user_roles(organization_id,user_id,role) values
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000001','engenharia'),
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000002','campo'),
 ('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000003','campo'),
 ('9f100000-0000-4000-8000-000000000002','9f000000-0000-4000-8000-000000000004','admin');
select set_config('request.jwt.claim.sub','9f000000-0000-4000-8000-000000000001',true);
insert into public.clientes(id,organization_id,razao_social) values('9f200000-0000-4000-8000-000000000001','9f100000-0000-4000-8000-000000000001','Cliente arquivos de teste');
insert into public.unidades(id,organization_id,cliente_id,nome) values('9f210000-0000-4000-8000-000000000001','9f100000-0000-4000-8000-000000000001','9f200000-0000-4000-8000-000000000001','Unidade arquivos de teste');
insert into public.pessoas(id,organization_id,nome,vinculo,user_id,registro_profissional) values
 ('9f220000-0000-4000-8000-000000000001','9f100000-0000-4000-8000-000000000001','Profissional da fixture','colaborador','9f000000-0000-4000-8000-000000000001','REG-TESTE'),
 ('9f220000-0000-4000-8000-000000000002','9f100000-0000-4000-8000-000000000001','Responsável da coleta de teste','colaborador','9f000000-0000-4000-8000-000000000002',null);
create function pg_temp.lfc(_command text,_lev uuid,_rev uuid,_extra jsonb default '{}') returns jsonb language plpgsql as $$ begin
  return public.lev_executar('9f100000-0000-4000-8000-000000000001',gen_random_uuid(),_command,
    jsonb_build_object('levantamento_id',_lev,'revisao_id',_rev,'expected_version',(select version from public.levantamento_revisoes where id=_rev))||_extra);
end $$;
set local role authenticated;
insert into lf_estado select 'base',public.lev_executar('9f100000-0000-4000-8000-000000000001',gen_random_uuid(),'criar',
 '{"cliente_id":"9f200000-0000-4000-8000-000000000001","unidade_id":"9f210000-0000-4000-8000-000000000001","responsavel_id":"9f220000-0000-4000-8000-000000000002","finalidade":"Coleta com arquivos privados em teste isolado"}');
select valor->'levantamento'->>'id' as lf_lev,valor->'revisao'->>'id' as lf_rev from lf_estado where chave='base' \gset
select pg_temp.lfc('salvar_ponto',:'lf_lev',:'lf_rev',
 '{"codigo":"P01","nome":"Ponto com foto obrigatória","exige_foto":true,"medicoes":[{"chave":"Comprimento","grandeza":"comprimento","valor":"12.400000","unidade":"m","precisao":"0.001000","metodo":"Trena de teste","origem":"campo","natureza":"medida","coletado_em":"2026-10-22T12:00:00Z"}]}') is not null;
select pg_temp.lfc('salvar_ponto',:'lf_lev',:'lf_rev',
 '{"codigo":"P02","nome":"Segundo ponto da coleta","exige_foto":false,"medicoes":[{"chave":"Extensão","grandeza":"comprimento","valor":"8450.000000","unidade":"mm","precisao":null,"metodo":"Documento de teste","origem":"documento","natureza":"estimativa","coletado_em":"2026-10-22T12:00:00Z"}]}') is not null;
select id as lf_p1,version as lf_p1_version from public.levantamento_pontos where revisao_id=:'lf_rev' and codigo='P01' \gset
select id as lf_p2 from public.levantamento_pontos where revisao_id=:'lf_rev' and codigo='P02' \gset
select pg_temp.lfc('programar',:'lf_lev',:'lf_rev','{"inicio_previsto":"2026-10-22T11:00:00Z","fim_previsto":"2026-10-22T15:00:00Z"}') is not null;
select pg_temp.lfc('iniciar_coleta',:'lf_lev',:'lf_rev') is not null;
select set_config('request.jwt.claim.sub','9f000000-0000-4000-8000-000000000002',true);
insert into lf_estado select 'pdf',public.lev_preparar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1',gen_random_uuid(),jsonb_build_object('nome','referencia.pdf','mime','application/pdf','tamanho',100,'sha256',repeat('d',64)));
insert into storage.objects(bucket_id,name,metadata) select 'nexus-operacional',valor->>'caminho','{"size":100,"mimetype":"application/pdf"}' from lf_estado where chave='pdf';
set local role service_role;
select public.lev_confirmar_arquivo('9f100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,'9f000000-0000-4000-8000-000000000002',repeat('d',64)) from lf_estado where chave='pdf';
set local role authenticated;
select pg_temp.lfe(format('select pg_temp.lfc(%L,%L,%L)','submeter',:'lf_lev',:'lf_rev'),'23514','PDF reference does not satisfy mandatory point photo');
insert into lf_estado values('foto',jsonb_build_object('nome','foto-original.jpg','mime','image/jpeg','tamanho',100,'sha256',repeat('a',64)));
insert into lf_estado select 'arquivo',public.lev_preparar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1','9f300000-0000-4000-8000-000000000001',valor) from lf_estado where chave='foto';
select valor->>'id' as lf_file,valor->>'caminho' as lf_path from lf_estado where chave='arquivo' \gset
select pg_temp.lfa(valor->>'estado'='pendente' and valor->>'ponto_id'=:'lf_p1' and public.lev_pode_enviar_arquivo('9f100000-0000-4000-8000-000000000001',(valor->>'id')::uuid),'staging preserves exact parent and remains pending') from lf_estado where chave='arquivo';
select pg_temp.lfa(public.lev_preparar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1','9f300000-0000-4000-8000-000000000001',valor)->>'id'=:'lf_file','retry after response loss preserves staging identity') from lf_estado where chave='foto';
select pg_temp.lfe(format('select public.lev_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1','9f300000-0000-4000-8000-000000000001',valor||'{"nome":"outro.jpg"}'),'23505','same staging key with other payload is rejected') from lf_estado where chave='foto';
select pg_temp.lfe(format('select public.lev_confirmar_arquivo(%L,%L,%L,%L)','9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64)),'42501','browser cannot forge service confirmation');
select pg_temp.lfe(format('select pg_temp.lfc(%L,%L,%L)','submeter',:'lf_lev',:'lf_rev'),'23514','pending evidence blocks review submission');
set local role service_role;
select pg_temp.lfe(format('select public.lev_confirmar_arquivo(%L,%L,%L,%L)','9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64)),'23514','missing Storage object cannot become confirmed');
set local role authenticated;
insert into storage.objects(bucket_id,name,metadata) values('nexus-operacional',:'lf_path','{"size":100,"mimetype":"image/jpeg"}');
select pg_temp.lfa((select count(*) from storage.objects where name=:'lf_path')=0,'pending object is not downloadable through Storage select');
set local role service_role;
select public.lev_confirmar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64));
select public.lev_confirmar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64));
set local role authenticated;
select pg_temp.lfa((select count(*) from public.levantamento_avaliacoes where revisao_id=:'lf_rev' and decisao='arquivo_confirmado' and comentario='foto-original.jpg')=1,'repeated service confirmation records one official effect');
select pg_temp.lfa((select version from public.levantamento_pontos where id=:'lf_p1')=:'lf_p1_version'::int,'photo upload does not overwrite or increment point edit version');
select pg_temp.lfa((select count(*) from storage.objects where name=:'lf_path')=1,'confirmed original is authorized through its real parent');
update storage.objects set metadata='{"size":999}' where name=:'lf_path';
select pg_temp.lfa((select metadata->>'size' from storage.objects where name=:'lf_path')='100','confirmed object is not overwritten by authenticated user');
insert into lf_estado select 'outro_ponto',public.lev_preparar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p2',gen_random_uuid(),valor) from lf_estado where chave='foto';
select pg_temp.lfa(valor->>'id'<>:'lf_file' and valor->>'ponto_id'=:'lf_p2','same bytes on another point retain separate explicit association') from lf_estado where chave='outro_ponto';
select public.lev_cancelar_arquivo('9f100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,'9f300000-0000-4000-8000-000000000002','Fotografia de teste cancelada') is not null from lf_estado where chave='outro_ponto';
select pg_temp.lfa(public.lev_cancelar_arquivo('9f100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,'9f300000-0000-4000-8000-000000000002','Fotografia de teste cancelada')->>'estado'='cancelado','cancel retry preserves prior result') from lf_estado where chave='outro_ponto';
insert into lf_estado select 'novo_envio',public.lev_preparar_arquivo('9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p2',gen_random_uuid(),valor) from lf_estado where chave='foto';
select pg_temp.lfa(n.valor->>'id'<>a.valor->>'id','new intent after cancellation creates another staging identity') from lf_estado n,lf_estado a where n.chave='novo_envio' and a.chave='outro_ponto';
select public.lev_cancelar_arquivo('9f100000-0000-4000-8000-000000000001',(valor->>'id')::uuid,gen_random_uuid(),'Encerrar pendência da fixture') is not null from lf_estado where chave='novo_envio';
-- Autorização do mesmo tenant e revogação do autor: inclusive confirmação já vinculada.
select set_config('request.jwt.claim.sub','9f000000-0000-4000-8000-000000000003',true);
select pg_temp.lfa((select count(*) from public.levantamento_arquivos where id=:'lf_file')=0 and (select count(*) from storage.objects where name=:'lf_path')=0,'unassigned field member cannot read metadata or original');
select pg_temp.lfe(format('select public.lev_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1',gen_random_uuid(),'{"nome":"foto.jpg","mime":"image/jpeg","tamanho":100,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'),'42501','unassigned member cannot create evidence by direct RPC');
select set_config('request.jwt.claim.sub','9f000000-0000-4000-8000-000000000004',true);
select pg_temp.lfa((select count(*) from public.levantamento_arquivos where id=:'lf_file')=0 and (select count(*) from storage.objects where name=:'lf_path')=0,'other tenant admin cannot read evidence by URL identity');
reset role;
delete from public.user_roles where organization_id='9f100000-0000-4000-8000-000000000001' and user_id='9f000000-0000-4000-8000-000000000002';
set local role service_role;
select pg_temp.lfe(format('select public.lev_confirmar_arquivo(%L,%L,%L,%L)','9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64)),'42501','role revoked with membership retained denies linked confirmation retry');
reset role;
insert into public.user_roles(organization_id,user_id,role) values('9f100000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000002','campo');
update public.levantamentos set responsavel_id='9f220000-0000-4000-8000-000000000001' where id=:'lf_lev';
set local role service_role;
select pg_temp.lfe(format('select public.lev_confirmar_arquivo(%L,%L,%L,%L)','9f100000-0000-4000-8000-000000000001',:'lf_file','9f000000-0000-4000-8000-000000000002',repeat('a',64)),'42501','responsibility reassigned denies linked confirmation retry');
reset role;
update public.levantamentos set responsavel_id='9f220000-0000-4000-8000-000000000002' where id=:'lf_lev';
select set_config('request.jwt.claim.sub','9f000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.lfc('submeter',:'lf_lev',:'lf_rev') is not null;
select pg_temp.lfe(format('select public.lev_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','9f100000-0000-4000-8000-000000000001',:'lf_rev',:'lf_p1',gen_random_uuid(),'{"nome":"nova.jpg","mime":"image/jpeg","tamanho":100,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'),'23514','revision in review does not accept new evidence');
select pg_temp.lfc('aprovar',:'lf_lev',:'lf_rev') is not null;
insert into lf_estado select 'aprovada',snapshot from public.levantamento_revisoes where id=:'lf_rev';
select pg_temp.lfa((select count(*) from jsonb_array_elements(valor->'arquivos') a where a->>'estado'<>'vinculado')=0 and jsonb_array_length(valor->'arquivos')=2,'approved snapshot fixes confirmed manifest and excludes cancelled attempts') from lf_estado where chave='aprovada';
select pg_temp.lfa(snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),'approved snapshot hash includes evidence manifest') from public.levantamento_revisoes where id=:'lf_rev';
select pg_temp.lfe(format('select public.lev_cancelar_arquivo(%L,%L,%L,%L)','9f100000-0000-4000-8000-000000000001',:'lf_file',gen_random_uuid(),'Não apagar original aprovado'),'23514','approved original cannot be cancelled or replaced');
reset role;
select pg_temp.lfe(format('update public.levantamento_arquivos set nome=%L where id=%L','alterada.jpg',:'lf_file'),'23514','database preserves approved evidence metadata even through direct maintenance write');
set local role authenticated;
select pg_temp.lfc('nova_revisao',:'lf_lev',:'lf_rev') is not null;
select revisao_atual_id as lf_rev2 from public.levantamentos where id=:'lf_lev' \gset
select id as lf_p1_v2 from public.levantamento_pontos where revisao_id=:'lf_rev2' and codigo='P01' \gset
select pg_temp.lfe(format('select public.lev_preparar_arquivo(%L,%L,%L,%L,%L::jsonb)','9f100000-0000-4000-8000-000000000001',:'lf_rev2',:'lf_p1',gen_random_uuid(),'{"nome":"nova.jpg","mime":"image/jpeg","tamanho":100,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'),'42501','point from prior revision cannot be attached to new revision');
select pg_temp.lfa((select count(*) from public.levantamento_arquivos where revisao_id=:'lf_rev2')=0 and :'lf_p1_v2'<>:'lf_p1','new revision does not copy photos or reuse point identity');
select pg_temp.lfa((select snapshot from public.levantamento_revisoes where id=:'lf_rev')=(select valor from lf_estado where chave='aprovada'),'new revision preserves previous evidence snapshot exactly');
reset role;
rollback;
\echo 'Levantamento evidence SQL passed.'
