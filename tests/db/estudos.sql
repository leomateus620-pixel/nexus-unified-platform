-- PostgreSQL real descartável: regras, isolamento e histórico. Sem dados no banco operacional.
\set ON_ERROR_STOP on
begin;
create function pg_temp.est_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'EST FAIL: %',label;end if;raise notice 'EST PASS: %',label;end $$;
create function pg_temp.est_reject(q text,code text,label text) returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then raise notice 'EST PASS: %',label;return;end if;raise exception 'EST FAIL: % expected %, got %: %',label,code,sqlstate,sqlerrm;end;
 raise exception 'EST FAIL: % accepted',label;end $$;
insert into auth.users(id,email) select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'est-'||n||'@test.invalid' from generate_series(1,8) n;
insert into public.organizations(id,nome) values('93000000-0000-4000-8000-000000000010','Study A'),('93000000-0000-4000-8000-000000000011','Study B');
insert into public.memberships(organization_id,user_id) select '93000000-0000-4000-8000-000000000010',('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into public.memberships(organization_id,user_id) values('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000008');
insert into public.user_roles(organization_id,user_id,role) values
 ('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000001','engenharia'),
 ('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002','engenharia'),
 ('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000003','admin'),
 ('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000004','campo'),
 ('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000006','engenharia'),
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000008','admin');
insert into public.user_capacidades(organization_id,user_id,capacidade,concedido_por) values('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000007','coordenar_operacao','93000000-0000-4000-8000-000000000003');
insert into public.clientes(id,organization_id,razao_social) values('93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000010','Historical study client'),('93000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000011','Other client');
insert into public.unidades(id,organization_id,cliente_id,nome) values('93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000012','Historical unit'),('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000013','Other unit');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare
 org uuid:='93000000-0000-4000-8000-000000000010';eng uuid:='93000000-0000-4000-8000-000000000001';reviewer uuid:='93000000-0000-4000-8000-000000000002';
 p1 uuid;p2 uuid;pf uuid;met jsonb;met2 jsonb;data jsonb;result jsonb;original jsonb;eid uuid;rid uuid;pid uuid;mid uuid;sid uuid;rev2 uuid;measure2 uuid;action jsonb;acdata jsonb;
 key uuid:=gen_random_uuid();snap jsonb;hash text;sub1 jsonb;lev jsonb;levr uuid;pe jsonb;pev uuid;sourceid uuid;doc uuid;legacydoc uuid;prop uuid;pr uuid;
 action_detail jsonb;action_receipt jsonb;action_transition jsonb;action_key uuid;
begin
 p1:=(public.salvar_pessoa(org,gen_random_uuid(),jsonb_build_object('nome','Author professional','vinculo','colaborador','user_id',eng,'registro_profissional','TEST declared author'))->>'id')::uuid;
 p2:=(public.salvar_pessoa(org,gen_random_uuid(),jsonb_build_object('nome','Independent reviewer','vinculo','colaborador','user_id',reviewer,'registro_profissional','TEST declared reviewer'))->>'id')::uuid;
 pf:=(public.salvar_pessoa(org,gen_random_uuid(),'{"nome":"Field recipient","vinculo":"colaborador","user_id":"93000000-0000-4000-8000-000000000004"}')->>'id')::uuid;
 data:='{"nome":"Validated internal procedure","tipo":"apreciacao_riscos","instrucoes":"Apply the explicitly approved procedure; no automatic normative conclusion.","fontes":[{"titulo":"Authorized internal reference","edicao":"V1","emissor":"Test engineering","url":"https://example.org/reference","consultado_em":"2026-10-22"}],"requisitos":{"exige_perigos":true,"exige_medidas":true,"revisao_independente":true}}';
 perform pg_temp.est_reject(format('select public.est_publicar_metodo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),jsonb_set(data,'{fontes,0,url}','"javascript:alert(1)"')),'23514','E01 unsafe bibliographic URL rejected');
 perform pg_temp.est_reject(format('select public.est_publicar_metodo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),jsonb_set(data,'{fontes,0,url}','"https://#"')),'23514','E02 missing URL authority rejected');
 perform pg_temp.est_reject(format('select public.est_publicar_metodo(%L,%L,null,%L::jsonb)',org,gen_random_uuid(),jsonb_set(data,'{requisitos,exige_perigos}','"true"')),'23514','E03 method policy must be boolean');
 met:=public.est_publicar_metodo(org,key,null,data);
 perform pg_temp.est_assert(met=public.est_publicar_metodo(org,key,null,data),'E04 method publication is retry safe');
 perform pg_temp.est_reject(format('select public.est_publicar_metodo(%L,%L,null,%L::jsonb)',org,key,data||'{"instrucoes":"changed"}'),'23505','E05 same key different method conflicts');
 data:=jsonb_build_object('titulo','Appreciation of observed condition','tipo','apreciacao_riscos','cliente_id','93000000-0000-4000-8000-000000000012','unidade_id','93000000-0000-4000-8000-000000000014','responsavel_id',p1,'metodo_versao_id',met->'versao'->>'id','visibilidade','organizacao');key:=gen_random_uuid();
 result:=public.est_executar(org,key,'criar',data);eid:=(result->'estudo'->>'id')::uuid;rid:=(result->'revisao'->>'id')::uuid;
 perform pg_temp.est_assert(result=public.est_executar(org,key,'criar',data),'E06 one study identity on repeated create');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,key,'criar',data||'{"titulo":"Other"}'),'23505','E07 same key different study conflicts');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'criar',data||'{"unidade_id":"93000000-0000-4000-8000-000000000015"}'),'23514','E08 foreign tenant unit rejected');
 perform pg_temp.est_assert(result->'revisao'->>'estado'='elaboracao' and jsonb_array_length(result->'bloqueios')>0 and result->'estudo'->>'codigo' like 'EST-%','E09 incomplete draft is real and readiness is explicit');
 original:=result;
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_revisao',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',99,'responsavel_tecnico_id',p1)),'40001','E10 revision expected version rejects stale edit');
 result:=public.est_executar(org,gen_random_uuid(),'salvar_perigo',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'codigo','P1','descricao','Observed physical condition','local','Work area','exposicao','Exposure documented by the professional','avaliacao','Assessment based on the selected validated method','critico',true,'medidas',jsonb_build_array(jsonb_build_object('descricao','Correct the observed condition','fundamento','Explicit basis under the selected procedure','prioridade','critica','responsavel_id',pf))));
 pid:=(result->'perigos'->0->>'id')::uuid;mid:=(result->'medidas'->0->>'id')::uuid;
 original:=result;
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_perigo',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'perigo_id',pid,'expected_version',1,'codigo','P1','descricao','Must roll back','medidas',jsonb_build_array(jsonb_build_object('medida_id',mid,'expected_version',99,'descricao','stale nested change')))),'40001','E11 bulk child conflict rolls back entire parent write');
 perform pg_temp.est_assert(original=public.est_obter(org,eid),'E12 failed bulk leaves content, versions and history intact');
 result:=public.est_executar(org,gen_random_uuid(),'salvar_medida',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'perigo_id',pid,'medida_id',mid,'expected_version',1,'descricao','Correct condition with reviewed instructions','fundamento','Procedure V1','prioridade','critica','responsavel_id',pf));
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'excluir_perigo',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'perigo_id',pid,'expected_version',1,'expected_revision_version',original->'revisao'->'version')),'40001','E13 parent delete cannot erase a new measure edit');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'submeter',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version')),'23514','E14 submission rejects missing technical scope/reviewer');
 result:=public.est_executar(org,gen_random_uuid(),'salvar_revisao',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','metodo_versao_id',met->'versao'->>'id','escopo','Specific observed installation scope','premissas','Only supplied and reviewed sources were considered','analise','Professional assessment of identified condition','conclusao','Proposed measures require execution and later verification','responsavel_tecnico_id',p1,'revisor_id',p2,'responsabilidade_tecnica','Declared technical responsibility; not a software-issued registry'));
 result:=public.est_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version'));sub1:=result->'submissoes'->0;
 perform pg_temp.est_assert(result->'revisao'->>'estado'='em_revisao' and sub1->>'sha256'=encode(sha256(convert_to((sub1->'snapshot')::text,'UTF8')),'hex'),'E15 submission has immutable content and hash');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_perigo',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'codigo','P2')),'23514','E16 submitted content cannot be edited');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'aprovar',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','motivo','Administrator without professional assignment')),'42501','E17 admin alone cannot approve technical study');
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 result:=public.est_executar(org,gen_random_uuid(),'devolver',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','motivo','Clarify the assumptions and source limitations'));
 perform pg_temp.est_assert(result->'revisao'->>'estado'='elaboracao' and result->'submissoes'->0=sub1 and result->'decisoes'->0->>'decisao'='devolver','E18 return preserves original submission and professional decision');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 result:=public.est_executar(org,gen_random_uuid(),'salvar_medida',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'perigo_id',pid,'medida_id',mid,'expected_version',2,'descricao','Revised control instruction','fundamento','Professional source and limitation clarified','prioridade','alta','responsavel_id',pf));
 result:=public.est_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version'));
 perform pg_temp.est_assert(jsonb_array_length(result->'submissoes')=2 and result->'submissoes'->0=sub1,'E19 revised submission does not overwrite first one');
 perform set_config('request.jwt.claim.sub',reviewer::text,true);key:=gen_random_uuid();data:=jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','motivo','Reviewed against the declared validated method');
 result:=public.est_executar(org,key,'aprovar',data);snap:=result->'revisao'->'snapshot';hash:=result->'revisao'->>'snapshot_sha256';
 perform pg_temp.est_assert(result=public.est_executar(org,key,'aprovar',data) and hash=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'E20 approval is atomic, hashed and retry safe');
 execute 'reset role';
 perform pg_temp.est_reject(format('update public.estudo_revisoes set conclusao=%L where id=%L','forged',rid),'23514','E21 approved revision protected by database trigger');
 perform pg_temp.est_reject(format('update public.estudo_submissoes set snapshot=%L::jsonb where id=%L','{}',sub1->>'id'),'23514','E22 prior submission immutable even under privileged direct write');
 update public.clientes set razao_social='Current client after V1' where id='93000000-0000-4000-8000-000000000012';
 execute 'set local role authenticated';
 acdata:=jsonb_build_object('titulo','Released corrective work','descricao','Explicit released work instructions, without private assessment contents','responsavel_id',pf,'prioridade','alta');key:=gen_random_uuid();
 action:=public.est_vincular_acao(org,key,mid,acdata);
 perform pg_temp.est_assert(action=public.est_vincular_acao(org,key,mid,acdata),'E23 canonical action retry reuses one identity');
 perform pg_temp.est_reject(format('select public.est_vincular_acao(%L,%L,%L,%L::jsonb)',org,key,mid,acdata||'{"descricao":"different"}'),'23505','E24 same action key with different payload conflicts');
 result:=public.est_executar(org,gen_random_uuid(),'nova_revisao',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','motivo','Technical assessment expanded with new evidence'));rev2:=(result->'revisao'->>'id')::uuid;measure2:=(result->'medidas'->0->>'id')::uuid;
 perform pg_temp.est_assert(result->'revisao'->>'numero'='2' and result->'revisao'->>'base_id'=rid::text and result->'medidas'->0->>'acao_id'=action->>'acao_id' and jsonb_array_length(result->'arquivos')=0,'E25 new revision keeps measure lineage, not approvals/files');
 result:=public.est_executar(org,gen_random_uuid(),'contexto',jsonb_build_object('estudo_id',eid,'revisao_id',rev2,'expected_version',result->'estudo'->'version','titulo','New V2 title','responsavel_id',p2,'visibilidade','organizacao'));
 perform pg_temp.est_assert(public.est_obter(org,eid,rid)->'estudo'->>'titulo'='Appreciation of observed condition' and public.est_obter(org,eid,rid)->'estudo'->>'cliente_nome'='Historical study client' and public.est_obter(org,eid,rid)->'revisao'->'snapshot'=snap,'E26 V1 reader uses frozen context after root/source changes');
 perform set_config('request.jwt.claim.sub',eng::text,true);result:=public.est_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('estudo_id',eid,'revisao_id',rev2,'expected_version',result->'revisao'->'version'));
 perform set_config('request.jwt.claim.sub',reviewer::text,true);result:=public.est_executar(org,gen_random_uuid(),'aprovar',jsonb_build_object('estudo_id',eid,'revisao_id',rev2,'expected_version',result->'revisao'->'version','motivo','Replacement assessment professionally reviewed'));
 perform pg_temp.est_assert(public.est_obter(org,eid,rid)->'revisao'->>'estado'='substituido' and public.est_obter(org,eid,rid)->'revisao'->>'snapshot_sha256'=hash and (select estado='aprovado' from public.estudo_revisoes where id=rid),'E27 supersession is a relation; old approved row/hash remain intact');
 perform pg_temp.est_assert((public.est_vincular_acao(org,gen_random_uuid(),measure2,acdata)->>'acao_id')=action->>'acao_id' and(select count(*)=1 from public.acoes_operacionais where organization_id=org),'E28 same measure across revisions never creates second action');
 perform pg_temp.est_assert(result->'entrega_documental'->>'estado'='aguardando_emissao','E29 approved study does not claim PDF emission');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000004',true);
 perform pg_temp.est_assert((select count(*)=0 from public.estudos_tecnicos) and(select count(*)=0 from public.estudo_submissoes),'E30 field payload cannot read technical assessment');
 perform pg_temp.est_assert((select descricao='Explicit released work instructions, without private assessment contents' from public.acoes_operacionais where id=(action->>'acao_id')::uuid),'E31 assigned field person receives only explicitly released canonical task');
 perform pg_temp.est_reject(format('select public.est_obter(%L,%L)',org,eid),'42501','E32 direct technical detail denied to field');
 -- A mesma ação liberada do estudo abre e executa pela Agenda, sem carregar a análise técnica.
 action_detail:=public.ag_obter_acao(org,(action->>'acao_id')::uuid);
 perform pg_temp.est_assert(action_detail->'acao'->>'id'=action->>'acao_id' and action_detail->'acao'->>'descricao'=acdata->>'descricao'
  and (action_detail->'permissoes'->>'iniciar')::boolean and not(action_detail::text like '%Professional assessment of identified condition%')
  and not(action_detail ? 'estudo' or action_detail ? 'revisao' or action_detail ? 'snapshot'),'E57 study action opens in Agenda with its canonical identity and only released instructions');
 action_key:=gen_random_uuid();action_transition:=jsonb_build_object('acao_id',action->>'acao_id','expected_version',action_detail->'acao'->'version','estado','em_execucao');
 action_receipt:=public.ag_executar(org,action_key,'transicionar_acao',action_transition);
 perform pg_temp.est_assert(action_receipt->>'tipo'='acao' and action_receipt->>'acao_id'=action->>'acao_id'
  and action_receipt->'detalhe'->'acao'->>'id'=action->>'acao_id' and action_receipt->'detalhe'->'acao'->>'estado'='em_execucao'
  and action_receipt->'detalhe'->'acao'->>'descricao'=acdata->>'descricao' and action_receipt->>'evento_id' is null
  and not(action_receipt::text like '%Professional assessment of identified condition%')
  and (select count(*)=1 from public.acoes_operacionais where organization_id=org),'E58 assigned field executes the released study action through Agenda without copying task or creating an event');
 action_detail:=public.ag_obter_acao(org,(action->>'acao_id')::uuid);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform pg_temp.est_assert(action_detail->'acao'->>'estado'='em_execucao' and (action_detail->'acao'->>'version')::integer=2
  and (select acao_id=(action->>'acao_id')::uuid from public.estudo_medida_linhagens where id=(action->>'linhagem_id')::uuid),'E59 Agenda mutation preserves the approved measure lineage and current action version');
 perform public.salvar_acao_operacional(org,gen_random_uuid(),acdata||jsonb_build_object('responsavel_id',p2),(action->>'acao_id')::uuid,(action_detail->'acao'->>'version')::integer);
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000004',true);
 perform pg_temp.est_reject(format('select public.ag_obter_acao(%L,%L)',org,action->>'acao_id'),'42501','E60 study task reassignment revokes the former field recipient Agenda detail');
 perform pg_temp.est_reject(format('select public.ag_executar(%L,%L,%L,%L::jsonb)',org,action_key,'transicionar_acao',action_transition),'42501','E61 study task reassignment denies an earlier successful Agenda command replay');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000005',true);
 perform pg_temp.est_reject(format('select public.est_listar(%L)',org),'42501','E33 member without role has no default access');
 perform pg_temp.est_reject(format('select public.ag_obter_acao(%L,%L)',org,action->>'acao_id'),'42501','E62 roleless member cannot open the released study task in Agenda');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000007',true);
 perform pg_temp.est_reject(format('select public.est_listar(%L)',org),'42501','E34 coordination capability is not technical permission');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000008',true);
 perform pg_temp.est_assert((select count(*)=0 from public.estudos_tecnicos) and(select count(*)=0 from public.estudo_medidas),'E35 other tenant sees neither root nor children');
 perform pg_temp.est_reject(format('select public.est_obter(%L,%L)',org,eid),'42501','E36 foreign tenant direct detail denied');
 perform pg_temp.est_reject(format('select public.ag_obter_acao(%L,%L)',org,action->>'acao_id'),'42501','E63 foreign tenant cannot open the study task through Agenda');
 perform pg_temp.est_reject(format('select public.ag_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'transicionar_acao',action_transition),'42501','E64 foreign tenant cannot execute the study task through Agenda');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 perform pg_temp.est_assert((public.est_listar(org,'%',null,null,0,25)->>'total')::int=0,'E37 search wildcard is literal');
 perform pg_temp.est_assert((public.est_opcoes(org,'pessoas')->>'total')::int=3 and(public.est_metodos(org)->>'total')::int=1,'E38 selectors expose paginated canonical metadata');
 perform pg_temp.est_reject(format('insert into public.estudo_eventos(organization_id,estudo_id,comando) values(%L,%L,%L)',org,eid,'forged'),'42501','E39 browser cannot forge official history');
 -- Fontes operacionais reais: a aprovação vem dos comandos canônicos existentes.
 lev:=public.lev_executar(org,gen_random_uuid(),'criar',jsonb_build_object('cliente_id','93000000-0000-4000-8000-000000000012','unidade_id','93000000-0000-4000-8000-000000000014','responsavel_id',p1,'finalidade','Approved source for engineering study'));
 lev:=public.lev_executar(org,gen_random_uuid(),'salvar_ponto',jsonb_build_object('levantamento_id',lev->'levantamento'->>'id','revisao_id',lev->'revisao'->>'id','codigo','P1','nome','Source point','medicoes',jsonb_build_array(jsonb_build_object('chave','comprimento','grandeza','comprimento','valor','10.5','unidade','m','precisao','0.1','metodo','Reviewed physical collection','coletado_em','2026-10-22T12:00:00Z'))));
 lev:=public.lev_executar(org,gen_random_uuid(),'programar',jsonb_build_object('levantamento_id',lev->'levantamento'->>'id','revisao_id',lev->'revisao'->>'id','expected_version',lev->'revisao'->'version','inicio_previsto','2026-10-22T12:00:00Z','fim_previsto','2026-10-22T13:00:00Z'));
 lev:=public.lev_executar(org,gen_random_uuid(),'iniciar_coleta',jsonb_build_object('levantamento_id',lev->'levantamento'->>'id','revisao_id',lev->'revisao'->>'id','expected_version',lev->'revisao'->'version'));
 lev:=public.lev_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('levantamento_id',lev->'levantamento'->>'id','revisao_id',lev->'revisao'->>'id','expected_version',lev->'revisao'->'version'));
 levr:=(lev->'revisao'->>'id')::uuid;
 data:=jsonb_build_object('titulo','Engineering study with fixed operational sources','tipo','apreciacao_riscos','cliente_id','93000000-0000-4000-8000-000000000012','unidade_id','93000000-0000-4000-8000-000000000014','responsavel_id',p1,'metodo_versao_id',met->'versao'->>'id','levantamento_revisao_id',levr,'visibilidade','organizacao');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'criar',data),'23514','E40 unapproved survey is not a technical source');
 lev:=public.lev_executar(org,gen_random_uuid(),'aprovar',jsonb_build_object('levantamento_id',lev->'levantamento'->>'id','revisao_id',levr,'expected_version',lev->'revisao'->'version'));
 result:=public.est_executar(org,gen_random_uuid(),'criar',data);eid:=(result->'estudo'->>'id')::uuid;rid:=(result->'revisao'->>'id')::uuid;
 perform pg_temp.est_assert(result->'fontes'->0->>'levantamento_revisao_id'=levr::text and result->'fontes'->0->>'sha256'=lev->'revisao'->>'snapshot_sha256' and not(result::text like '%Reviewed physical collection%'),'E41 approved source has FK/hash metadata, without uncontrolled raw snapshot copy');
 pe:=public.pe_executar(org,gen_random_uuid(),'criar',jsonb_build_object('titulo','Controlled PE source','cliente_id','93000000-0000-4000-8000-000000000012','unidade_id','93000000-0000-4000-8000-000000000014','responsavel_id',p1,'visibilidade','organizacao','resumo','Frozen technical input','modelo',jsonb_build_object('schema_version',1,'familia','documental','finalidade','estudo','secoes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'titulo','Private content','texto','PRIVATE_PE_RAW_NOT_COPIED')),'parametros','[]'::jsonb)));
 pev:=(pe->'versao'->>'id')::uuid;
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'vincular_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','tipo','projeto_engenharia','pe_versao_id',pev,'justificativa','Pending model source')),'23514','E42 editable PE version cannot become fixed technical source');
 pe:=public.pe_executar(org,gen_random_uuid(),'submeter',jsonb_build_object('projeto_id',pe->'projeto'->>'id','versao_id',pev,'expected_version',pe->'versao'->'version'));
 pe:=public.pe_executar(org,gen_random_uuid(),'congelar',jsonb_build_object('projeto_id',pe->'projeto'->>'id','versao_id',pev,'expected_version',pe->'versao'->'version'));
 result:=public.est_executar(org,gen_random_uuid(),'vincular_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','tipo','projeto_engenharia','pe_versao_id',pev,'justificativa','Frozen layout supporting the assessment'));
 select id into sourceid from public.estudo_fontes where revisao_id=rid and pe_versao_id=pev;
 execute 'reset role';
 insert into public.propostas(organization_id,numero,cliente_id,unidade_id) values(org,'ESTSOURCE/26','93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000014') returning id into prop;
 insert into public.proposta_revisoes(organization_id,proposta_id,numero) values(org,prop,1) returning id into pr;
 insert into public.documentos(organization_id,tipo,revisao_id,versao,interno,snapshot,emitido_por) values(org,'technical-source-test',pr,1,true,'{"PRIVATE_COST_NOT_COPIED":"12345.67"}',eng) returning id into doc;
 legacydoc:=doc;
 execute 'set local role authenticated';
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'vincular_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','tipo','documento','documento_id',legacydoc,'justificativa','Legacy names do not prove frozen identity')),'23514','E55 legacy document without canonical frozen IDs is not a technical source');
 perform pg_temp.est_assert((public.est_opcoes(org,'documentos')->>'total')::int=0 and (select snapshot='{"PRIVATE_COST_NOT_COPIED":"12345.67"}'::jsonb from public.documentos where id=legacydoc),'E56 legacy document excluded from source selector while original remains intact');
 -- Contrato contextual futuro exercitado exclusivamente como fixture SQL, sem fingir emissor implementado.
 execute 'reset role';
 insert into public.documentos(organization_id,tipo,revisao_id,versao,interno,snapshot,emitido_por) values(org,'contextual-technical-source-test',pr,1,true,jsonb_build_object('PRIVATE_COST_NOT_COPIED','12345.67','contexto',jsonb_build_object('organization_id',org,'cliente_id','93000000-0000-4000-8000-000000000012','unidade_id','93000000-0000-4000-8000-000000000014','proposta_id',prop,'revisao_id',pr)),eng) returning id into doc;
 execute 'set local role authenticated';
 result:=public.est_executar(org,gen_random_uuid(),'vincular_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','tipo','documento','documento_id',doc,'justificativa','Issued reference with controlled context'));
 perform pg_temp.est_assert(jsonb_array_length(result->'fontes')=3 and not(result::text like '%PRIVATE_PE_RAW_NOT_COPIED%') and not(result::text like '%PRIVATE_COST_NOT_COPIED%'),'E43 sources whitelist excludes raw private PE content and financial snapshot');
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000006',true);
 perform pg_temp.est_assert(public.est_obter(org,eid)->'estudo'->>'id'=eid::text,'E44 same-tenant engineer can read study while all source ACLs allow');
 execute 'reset role';update public.pe_projetos set visibilidade='restrito' where id=(pe->'projeto'->>'id')::uuid;execute 'set local role authenticated';
 perform pg_temp.est_assert((select count(*)=0 from public.estudos_tecnicos where id=eid) and(select count(*)=0 from public.estudo_fontes where estudo_id=eid),'E45 source access revocation hides study and source list through RLS');
 perform pg_temp.est_reject(format('select public.est_obter(%L,%L)',org,eid),'42501','E46 source access revocation denies direct study endpoint');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 result:=public.est_executar(org,gen_random_uuid(),'desativar_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','fonte_id',sourceid,'motivo','Source superseded, retained for submission history'));
 perform set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000006',true);
 perform pg_temp.est_reject(format('select public.est_obter(%L,%L)',org,eid),'42501','E47 deactivating private source cannot bypass historical inheritance');
 perform set_config('request.jwt.claim.sub',eng::text,true);
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'vincular_fonte',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','tipo','levantamento','levantamento_revisao_id',levr,'justificativa','Duplicate source attempt')),'23505','E48 duplicate source is explicit conflict, not a second identity');
 original:=result;
 result:=public.est_executar(org,gen_random_uuid(),'cancelar',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'expected_version',result->'revisao'->'version','motivo','Study scope cancelled with retained sources'));
 perform pg_temp.est_assert(result->'revisao'->>'estado'='cancelado' and jsonb_array_length(result->'fontes')=3,'E49 cancellation preserves source history');
 perform pg_temp.est_reject(format('select public.est_executar(%L,%L,%L,%L::jsonb)',org,gen_random_uuid(),'salvar_perigo',jsonb_build_object('estudo_id',eid,'revisao_id',rid,'codigo','P99')),'23514','E50 cancelled revision cannot be edited');
 met2:=public.est_publicar_metodo(org,gen_random_uuid(),(met->'metodo'->>'id')::uuid,jsonb_build_object('tipo','apreciacao_riscos','instrucoes','Procedure revised with approved source edition','fontes',jsonb_build_array(jsonb_build_object('titulo','Authorized internal reference','edicao','V2','emissor','Test engineering')),'requisitos','{}'::jsonb));
 perform pg_temp.est_assert(met2->'versao'->>'numero'='2' and(result->'revisao'->>'metodo_versao_id')=met->'versao'->>'id','E51 publishing procedure V2 never reclassifies existing V1 study');
 execute 'reset role';
 perform pg_temp.est_reject(format('update public.est_metodo_versoes set instrucoes=%L where id=%L','forged',met->'versao'->>'id'),'23514','E52 published method immutable at database boundary');
 perform pg_temp.est_reject(format('insert into public.estudo_perigos(organization_id,estudo_id,revisao_id,codigo,created_by) values(%L,%L,%L,%L,%L)','93000000-0000-4000-8000-000000000011',eid,rid,'cross-fk',eng),'23514','E53 privileged cross-tenant child write rejected by parent guard');
 perform pg_temp.est_assert(not has_function_privilege('authenticated','public.est_confirmar_arquivo(uuid,uuid,uuid,text)','EXECUTE') and has_function_privilege('service_role','public.est_confirmar_arquivo(uuid,uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.est_autor_ler(uuid,uuid,uuid)','EXECUTE'),'E54 privileged functions have minimum explicit grants');
end $$;
reset role;
rollback;
