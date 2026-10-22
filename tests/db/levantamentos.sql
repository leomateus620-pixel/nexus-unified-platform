-- Jornada real SQL/RLS em cluster descartável. Não comprova Auth/Storage HTTP remoto.
\set ON_ERROR_STOP on
begin;
create function pg_temp.lv_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'LEV FAIL: %',label;end if;raise notice 'LEV PASS: %',label;end $$;
create function pg_temp.lv_reject(q text,code text,label text) returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then raise notice 'LEV PASS: %',label;return;end if;raise exception 'LEV FAIL: % expected %, got %: %',label,code,sqlstate,sqlerrm;end;
 raise exception 'LEV FAIL: % accepted',label;end $$;
insert into auth.users(id,email) values
 ('9a000000-0000-0000-0000-000000000001','lev-eng@test.invalid'),('9a000000-0000-0000-0000-000000000002','lev-field@test.invalid'),
 ('9a000000-0000-0000-0000-000000000003','lev-other@test.invalid'),('9a000000-0000-0000-0000-000000000004','lev-b@test.invalid');
insert into public.organizations(id,nome) values('9a000000-0000-0000-0000-000000000010','Lev test A'),('9a000000-0000-0000-0000-000000000011','Lev test B');
insert into public.memberships(organization_id,user_id) select '9a000000-0000-0000-0000-000000000010',id from auth.users where id in ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000002','9a000000-0000-0000-0000-000000000003');
insert into public.memberships(organization_id,user_id) values('9a000000-0000-0000-0000-000000000011','9a000000-0000-0000-0000-000000000004');
insert into public.user_roles(organization_id,user_id,role) values
 ('9a000000-0000-0000-0000-000000000010','9a000000-0000-0000-0000-000000000001','engenharia'),
 ('9a000000-0000-0000-0000-000000000010','9a000000-0000-0000-0000-000000000002','campo'),
 ('9a000000-0000-0000-0000-000000000010','9a000000-0000-0000-0000-000000000003','campo'),
 ('9a000000-0000-0000-0000-000000000011','9a000000-0000-0000-0000-000000000004','admin');
insert into public.clientes(id,organization_id,razao_social) values('9a000000-0000-0000-0000-000000000012','9a000000-0000-0000-0000-000000000010','Lev client A'),('9a000000-0000-0000-0000-000000000013','9a000000-0000-0000-0000-000000000011','Lev client B');
insert into public.unidades(id,organization_id,cliente_id,nome) values('9a000000-0000-0000-0000-000000000014','9a000000-0000-0000-0000-000000000010','9a000000-0000-0000-0000-000000000012','Lev unit A'),('9a000000-0000-0000-0000-000000000015','9a000000-0000-0000-0000-000000000011','9a000000-0000-0000-0000-000000000013','Lev unit B');
select set_config('request.jwt.claim.sub','9a000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$
declare org uuid:='9a000000-0000-0000-0000-000000000010';eng uuid:='9a000000-0000-0000-0000-000000000001';field uuid:='9a000000-0000-0000-0000-000000000002';
 responsible uuid;engineer uuid;model jsonb;model2 jsonb;data jsonb;result jsonb;original jsonb;p jsonb;rev uuid;lid uuid;pid uuid;mid uuid;preview jsonb;adopt jsonb;snap jsonb;hash text;draft uuid;issued uuid;system_id uuid;issued_system uuid;key uuid:=gen_random_uuid();
begin
 responsible:=(public.salvar_pessoa(org,gen_random_uuid(),jsonb_build_object('nome','Collector','vinculo','colaborador','user_id',field))->>'id')::uuid;
 engineer:=(public.salvar_pessoa(org,gen_random_uuid(),jsonb_build_object('nome','Reviewer','vinculo','colaborador','user_id',eng,'registro_profissional','Declared TEST registry'))->>'id')::uuid;
 perform pg_temp.lv_reject(format('select public.lev_publicar_modelo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),'{"nome":"Invalid range","fonte":"Test procedure","requisitos":[{"chave":"x","grandeza":"comprimento","unidade":"m","minimo":"NaN"}]}'),'23514','L35 NaN model range rejected by SQL');
 perform pg_temp.lv_reject(format('select public.lev_publicar_modelo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),'{"nome":"Invalid range type","fonte":"Test procedure","requisitos":[{"chave":"x","grandeza":"comprimento","unidade":"m","minimo":1}]}'),'23514','L36 model decimal policy must remain text');
 perform pg_temp.lv_reject(format('select public.lev_publicar_modelo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),jsonb_build_object('nome','Long model key','fonte','Test source','requisitos',jsonb_build_array(jsonb_build_object('chave',repeat('x',81),'grandeza','comprimento','unidade','m')))),'23514','L44 model key longer than DTO contract rejected');
 perform pg_temp.lv_reject(format('select public.lev_publicar_modelo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),'{"nome":"Model range overflow","fonte":"Test procedure","requisitos":[{"chave":"x","grandeza":"comprimento","unidade":"m","maximo":"1234567890123"}]}'),'23514','L45 model range exceeding DTO precision rejected');
 perform pg_temp.lv_reject(format('select public.lev_publicar_modelo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),'{"nome":"Empty range text","fonte":"Test procedure","requisitos":[{"chave":"x","grandeza":"comprimento","unidade":"m","maximo":""}]}'),'23514','L47 optional decimal policy accepts null or omission, never unparsable empty text');
 model:=public.lev_publicar_modelo(org,gen_random_uuid(),null,'{"nome":"Modelo dimensional aprovado de teste","fonte":"Procedimento interno de teste autorizado","requisitos":[{"chave":"comprimento","grandeza":"comprimento","unidade":"cm","obrigatoria":true}]}');
 data:=jsonb_build_object('cliente_id','9a000000-0000-0000-0000-000000000012','unidade_id','9a000000-0000-0000-0000-000000000014','finalidade','Coleta de teste com dois pontos','responsavel_id',responsible,'modelo_versao_id',model->'versao'->>'id');
 result:=public.lev_executar(org,key,'criar',data);lid:=(result->'levantamento'->>'id')::uuid;rev:=(result->'revisao'->>'id')::uuid;
 perform pg_temp.lv_assert(result=public.lev_executar(org,key,'criar',data),'L01 repeated create returns one persisted identity');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,key,'criar',data||'{"finalidade":"different"}'),'23505','L02 reused key with different payload rejected');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'criar',data||'{"unidade_id":"9a000000-0000-0000-0000-000000000015"}'),'23514','L03 foreign tenant unit rejected');
 perform pg_temp.lv_assert(result->'revisao'->>'estado'='rascunho' and result->'levantamento'->>'codigo' like 'LEV%','L04 initial draft has server-issued code');
 model2:=public.lev_publicar_modelo(org,gen_random_uuid(),(model->'modelo'->>'id')::uuid,'{"fonte":"Next approved procedure version","requisitos":[{"chave":"comprimento","grandeza":"comprimento","unidade":"m","obrigatoria":true}]}');
 perform pg_temp.lv_assert((public.lev_obter(org,lid)->'revisao'->>'modelo_versao_id')=model->'versao'->>'id','L05 publishing model V2 does not alter started V1');
 perform set_config('request.jwt.claim.sub',field::text,true);
 perform pg_temp.lv_assert((public.lev_listar(org)->>'total')::int=1,'L06 assigned field person finds own survey');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'criar',data),'42501','L07 field cannot create unassigned survey');
 result:=public.lev_executar(org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'codigo','P1','nome','Point one','medicoes',jsonb_build_array(jsonb_build_object('chave','comprimento','grandeza','comprimento','valor',null,'unidade','cm'))));
 pid:=(result->'pontos'->0->>'id')::uuid;mid:=(result->'medicoes'->0->>'id')::uuid;
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_medicao',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'chave','overprecision','grandeza','comprimento','valor','1.1234567','unidade','cm')),'23514','L37 SQL rejects silent precision loss beyond six decimal places');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_medicao',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'chave','notfinite','grandeza','comprimento','valor','NaN','unidade','cm')),'23514','L38 SQL rejects non-finite measurement');
 perform pg_temp.lv_assert(result->'medicoes'->0->'valor'='null'::jsonb,'L08 incomplete measurement persists as draft');
 original:=result;
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'expected_version',1,'codigo','P1','nome','Must roll back','medicoes',jsonb_build_array(jsonb_build_object('medicao_id',mid,'expected_version',1,'chave','comprimento','grandeza','comprimento','valor','10','unidade','un')))),'23514','L09 failed nested measure rolls back point write');
 perform pg_temp.lv_assert(public.lev_obter(org,lid)=original,'L10 failed bulk write leaves versions/data/history unchanged');
 result:=public.lev_executar(org,gen_random_uuid(),'programar',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version','inicio_previsto','2026-10-22T22:00:00-03:00','fim_previsto','2026-10-23T01:00:00-03:00'));
 result:=public.lev_executar(org,gen_random_uuid(),'iniciar_coleta',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version'));
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'submeter',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version')),'23514','L11 submission rejects incomplete measure');
 result:=public.lev_executar(org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'expected_version',1,'codigo','P1','nome','Point one complete','medicoes',jsonb_build_array(jsonb_build_object('medicao_id',mid,'expected_version',1,'chave','comprimento','grandeza','comprimento','valor','1234.567890','unidade','cm','precisao','0.1','metodo','Tape measurement','coletado_em','2026-10-22T22:30:00-03:00'))));
 perform pg_temp.lv_assert(result->'medicoes'->0->>'valor'='1234.567890','L12 decimal measurement returns exact text');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'excluir_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'expected_version',2,'expected_revision_version',original->'revisao'->'version')),'40001','L46 point deletion cannot remove measurements changed since the reviewed revision version');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'expected_version',1,'codigo','P1','nome','Stale point')),'40001','L13 stale point edit rejected');
 result:=public.lev_executar(org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'codigo','P2','nome','Point two','medicoes',jsonb_build_array(jsonb_build_object('chave','comprimento','grandeza','comprimento','valor','2000','unidade','cm','precisao','0.1','metodo','Tape measurement','coletado_em','2026-10-22T23:00:00-03:00'),jsonb_build_object('chave','fraction','grandeza','comprimento','valor','0.000001','unidade','m','precisao','0.000001','metodo','Precision measurement','coletado_em','2026-10-22T23:00:00-03:00'),jsonb_build_object('chave','3d-estimate','grandeza','comprimento','valor','12','unidade','m','natureza','estimativa','origem','modelo_3d','metodo','Scene estimate only','coletado_em','2026-10-22T23:00:00-03:00'))));
 result:=public.lev_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version'));
 perform pg_temp.lv_assert(result->'revisao'->>'estado'='em_revisao' and jsonb_array_length(result->'pontos')=2,'L14 two completed points enter technical review');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'aprovar',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version')),'42501','L15 assigned field person cannot approve');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'devolver',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version','motivo','no')),'23514','L16 return requires actionable reason');
 result:=public.lev_executar(org,gen_random_uuid(),'devolver',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version','motivo','Review collection metadata','pendencias',jsonb_build_array(jsonb_build_object('ponto_id',pid,'medicao_id',mid,'descricao','Confirm method source'))));
 perform pg_temp.lv_assert(result->'revisao'->>'estado'='em_coleta' and exists(select 1 from public.levantamento_avaliacoes where revisao_id=rev and decisao='devolver' and jsonb_array_length(pendencias)=1),'L17 returned review retains structured findings and author');
 result:=public.lev_executar(org,gen_random_uuid(),'salvar_medicao',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'medicao_id',mid,'expected_version',2,'chave','comprimento','grandeza','comprimento','valor','1234.500000','unidade','cm','precisao','0.1','metodo','Tape measurement with reference verified','coletado_em','2026-10-22T22:30:00-03:00'));
 result:=public.lev_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version'));
 result:=public.lev_executar(org,gen_random_uuid(),'aprovar',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',result->'revisao'->'version'));
 snap:=result->'revisao'->'snapshot';hash:=result->'revisao'->>'snapshot_sha256';
 perform pg_temp.lv_assert(result->'revisao'->>'estado'='aprovado' and hash=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'L18 approval fixes consistent snapshot and SHA256');
 perform pg_temp.lv_reject(format('select public.lev_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'ponto_id',pid,'expected_version',2,'codigo','P1','nome','Illegal change')),'23514','L19 approved point cannot be edited');
 -- Destination is the canonical proposal/system, no quantity/calculation engine introduced.
 execute 'reset role';
 perform pg_temp.lv_reject(format('insert into public.levantamento_medicoes(organization_id,levantamento_id,revisao_id,ponto_id,chave,grandeza,created_by) values(%L,%L,%L,%L,%L,%L,%L)','9a000000-0000-0000-0000-000000000011',lid,rev,pid,'cross-fk','comprimento',eng),'23514','L42 privileged cross-tenant child insert rejected by parent guard');
 insert into public.propostas(id,organization_id,numero,cliente_id,unidade_id) values('9a000000-0000-0000-0000-000000000030',org,'LEVTEST/26','9a000000-0000-0000-0000-000000000012','9a000000-0000-0000-0000-000000000014');
 insert into public.proposta_revisoes(organization_id,proposta_id,numero) values(org,'9a000000-0000-0000-0000-000000000030',1) returning id into draft;
 insert into public.sistemas_dimensionados(organization_id,revisao_id,ordem,identificacao,tipo,metragem) values(org,draft,1,'Canonical destination','TELHADO',10) returning id into system_id;
 insert into public.proposta_revisoes(organization_id,proposta_id,numero,status) values(org,'9a000000-0000-0000-0000-000000000030',2,'enviada') returning id into issued;
 -- Issued fixture was never modified by this journey.
 insert into public.sistemas_dimensionados(organization_id,revisao_id,ordem,identificacao,tipo,metragem) values(org,draft,2,'Other editable system','TELHADO',20) returning id into issued_system;
 update public.clientes set razao_social='Name after survey approval' where id='9a000000-0000-0000-0000-000000000012';
 perform pg_temp.lv_assert((select snapshot=snap and snapshot_sha256=hash from public.levantamento_revisoes where id=rev),'L20 later catalog change preserves approved snapshot');
 perform pg_temp.lv_reject(format('update public.levantamento_revisoes set snapshot=%L::jsonb where id=%L','{}',rev),'23514','L21 database trigger protects approved revision even from direct privileged update');
 execute 'set local role authenticated';
 preview:=public.lev_prever_adocao(org,rev,mid,system_id,'metragem');
 perform pg_temp.lv_assert(preview->>'atual'='10.000' and preview->>'proposto'='12.345' and preview->'origem'->>'unidade'='cm','L22 adoption preview compares old/new/unit/provenance without rounding');
 perform pg_temp.lv_reject(format('select public.lev_prever_adocao(%L,%L,%L,%L,%L)',org,rev,(select id from public.levantamento_medicoes where revisao_id=rev and chave='fraction'),system_id,'metragem'),'23514','L39 adoption rejects a value not representable at destination precision');
 perform pg_temp.lv_reject(format('select public.lev_prever_adocao(%L,%L,%L,%L,%L)',org,rev,(select id from public.levantamento_medicoes where revisao_id=rev and chave='3d-estimate'),system_id,'metragem'),'23514','L43 approved 3D estimate still cannot be adopted as a measured input');
 execute 'reset role';update public.sistemas_dimensionados set metragem=11 where id=system_id;execute 'set local role authenticated';
 perform pg_temp.lv_reject(format('select public.lev_adotar_medicao(%L,%L,%L,%L,%L,%L,%L)',org,gen_random_uuid(),rev,mid,system_id,'metragem',preview->>'preview_hash'),'40001','L23 stale adoption preview rejected after target edit');
 preview:=public.lev_prever_adocao(org,rev,mid,system_id,'metragem');key:=gen_random_uuid();
 adopt:=public.lev_adotar_medicao(org,key,rev,mid,system_id,'metragem',preview->>'preview_hash');
 perform pg_temp.lv_assert(adopt=public.lev_adotar_medicao(org,key,rev,mid,system_id,'metragem',preview->>'preview_hash') and (select count(*)=1 from public.levantamento_adocoes where revisao_id=rev),'L24 adoption retry has one immutable source record');
 perform pg_temp.lv_assert((select metragem=12.345 and origem='levantamento_aprovado' from public.sistemas_dimensionados where id=system_id) and (select desatualizada from public.proposta_revisoes where id=draft),'L25 adoption changes canonical input and requires existing calculation engine');
 perform pg_temp.lv_assert((select status='enviada' and totais is null from public.proposta_revisoes where id=issued),'L26 issued revision remains unchanged');
 perform pg_temp.lv_reject(format('select public.lev_adotar_medicao(%L,%L,%L,%L,%L,%L,%L)',org,key,rev,mid,issued_system,'metragem',preview->>'preview_hash'),'23505','L27 adoption same key/different payload conflicts');
 result:=public.lev_executar(org,gen_random_uuid(),'nova_revisao',jsonb_build_object('levantamento_id',lid,'revisao_id',rev,'expected_version',(public.lev_obter(org,lid)->'revisao'->'version'),'modelo_versao_id',model2->'versao'->>'id'));
 perform pg_temp.lv_assert(result->'revisao'->>'estado'='rascunho' and result->'revisao'->>'numero'='2' and jsonb_array_length(result->'pontos')=2 and jsonb_array_length(result->'arquivos')=0,'L28 new revision preserves source links without copying approvals/files');
 perform pg_temp.lv_assert((public.lev_obter(org,lid,rev)->'revisao'->'snapshot')=snap,'L29 V1 remains recoverable after V2');
 result:=public.lev_executar(org,gen_random_uuid(),'contexto',jsonb_build_object('levantamento_id',lid,'expected_version',result->'levantamento'->'version','finalidade','Changed V2 collection scope','responsavel_id',responsible));
 perform pg_temp.lv_assert((public.lev_obter(org,lid,rev)->'levantamento'->>'finalidade')='Coleta de teste com dois pontos' and (public.lev_obter(org,lid,rev)->'levantamento'->>'cliente_nome')='Lev client A' and (public.lev_obter(org,lid,rev)->'levantamento'->>'revisao_atual_id')=result->'revisao'->>'id','L40 historical detail uses frozen context with current revision pointers');
 perform set_config('request.jwt.claim.sub','9a000000-0000-0000-0000-000000000003',true);
 perform pg_temp.lv_assert((public.lev_listar(org)->>'total')::int=0,'L30 unassigned field user cannot list survey');
 perform pg_temp.lv_reject(format('select public.lev_obter(%L,%L)',org,lid),'42501','L31 unassigned user direct detail denied');
 perform set_config('request.jwt.claim.sub','9a000000-0000-0000-0000-000000000004',true);
 perform pg_temp.lv_assert((select count(*)=0 from public.levantamentos) and (select count(*)=0 from public.levantamento_medicoes),'L41 direct cross-tenant root/child reads are filtered by RLS');
 perform pg_temp.lv_reject(format('select public.lev_obter(%L,%L)',org,lid),'42501','L32 other tenant cannot fetch root or child payload');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 perform pg_temp.lv_assert((public.lev_listar(org,'%',null,null,0,25)->>'total')::int=0,'L33 search treats percent literally');
 perform pg_temp.lv_reject(format('insert into public.levantamento_medicoes(organization_id,levantamento_id,revisao_id,ponto_id,chave,grandeza) values(%L,%L,%L,%L,%L,%L)',org,lid,rev,pid,'forged','comprimento'),'42501','L34 browser cannot bypass command audit with direct write');
end $$;
reset role;
rollback;
