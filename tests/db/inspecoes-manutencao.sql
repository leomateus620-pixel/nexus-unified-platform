begin;
do $$
declare
  org uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid();
  externo uuid:=gen_random_uuid(); comum uuid:=gen_random_uuid(); cliente uuid:=gen_random_uuid();
  unidade uuid:=gen_random_uuid(); ativo uuid:=gen_random_uuid(); foto uuid:=gen_random_uuid();
  chave uuid:=gen_random_uuid(); doc uuid; contrato uuid; v jsonb;
begin
  insert into auth.users(id) values(admin),(externo),(comum);
  insert into organizations(id,nome) values(org,'Teste manutenção'),(outra,'Teste externo');
  insert into memberships(organization_id,user_id) values(org,admin),(outra,externo),(org,comum);
  insert into user_roles(organization_id,user_id,role) values(org,admin,'admin'),(outra,externo,'admin');
  insert into clientes(id,organization_id,razao_social) values(cliente,org,'Cliente sintético');
  insert into unidades(id,organization_id,cliente_id,nome) values(unidade,org,cliente,'Unidade sintética');
  perform set_config('request.jwt.claim.sub',admin::text,true);
  execute 'set local role authenticated';
  v:=inspecoes_ativar_unidade(org,cliente,unidade,'IN','Inclusão de teste',chave);
  if v->>'id'<>unidade::text then raise exception 'Contexto não criado.'; end if;
  perform inspecoes_ativar_unidade(org,cliente,unidade,'IN','Inclusão de teste',chave);
  if (select count(*) from inspecoes_contexto_eventos where organization_id=org)<>1 then raise exception 'Duplicação de histórico.'; end if;
  execute 'reset role';
  insert into inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,snapshot)
    values(ativo,org,cliente,unidade,'ativos','fixture-a','Ativo na origem','{"resultado":"apto","tag":"S-1"}');
  insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',org::text||'/'||foto::text||'/original.jpg','{"size":1024,"mimetype":"image/jpeg"}');
  insert into inspecoes_arquivos(id,organization_id,cliente_id,unidade_id,registro_id,papel,nome,legenda,ordem,
    estado,origem,caminho,sha256,bytes,mime)
    values(foto,org,cliente,unidade,ativo,'foto','teste.jpg','Legenda original',1,'original_verificado','Fixture',
      org::text||'/'||foto::text||'/original.jpg',repeat('a',64),1024,'image/jpeg');
  execute 'set local role authenticated';
  v:=inspecoes_acervo_salvar(org,cliente,unidade,ativo,0,gen_random_uuid(),
    '{"titulo":"Ativo corrigido","nota":"Nota rastreável","motivo":"Acertar nome"}');
  if (v->>'versao')::int<>1 or (select titulo from inspecoes_acervo_consulta where id=ativo)<>'Ativo corrigido'
    or (select snapshot->>'resultado' from inspecoes_registros where id=ativo)<>'apto'
    or (select titulo from inspecoes_registros where id=ativo)<>'Ativo na origem'
  then raise exception 'Revisão alterou a origem ou não foi projetada.'; end if;
  begin
    perform inspecoes_acervo_salvar(org,cliente,unidade,ativo,0,gen_random_uuid(),
      '{"titulo":"Edição concorrente","motivo":"Acertar nome"}');
    raise exception 'Conflito de versão passou.';
  exception when serialization_failure then null; end;
  chave:=gen_random_uuid();
  v:=inspecoes_acervo_salvar(org,cliente,unidade,null,0,chave,
    jsonb_build_object('titulo','Documento de referência','motivo','Inclusão sintética','relacionado_id',ativo));
  doc:=(v->>'id')::uuid;
  if inspecoes_acervo_salvar(org,cliente,unidade,null,0,chave,
    jsonb_build_object('titulo','Documento de referência','motivo','Inclusão sintética','relacionado_id',ativo))<>v
    or not exists(select 1 from inspecoes_relacoes where origem_id=ativo and destino_id=doc)
    or (select situacao from inspecoes_registros where id=doc)<>'cadastrado'
  then raise exception 'Cadastro/vínculo não preservou o fluxo.'; end if;
  perform inspecoes_apresentacao_salvar(org,foto,0,gen_random_uuid(),null,4,'Revisar legenda');
  if (select ordem from inspecoes_apresentacao_atual where arquivo_id=foto)<>4
    or (select legenda from inspecoes_apresentacao_atual where arquivo_id=foto) is not null
    or (select legenda from inspecoes_arquivos where id=foto)<>'Legenda original'
  then raise exception 'Apresentação sobrescreveu a origem.'; end if;
  begin
    perform inspecoes_apresentacao_salvar(org,foto,0,gen_random_uuid(),'Conflito',2,'Revisar legenda');
    raise exception 'Conflito de fotografia passou.';
  exception when serialization_failure then null; end;
  v:=inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
    '{"acao":"criar_contrato","titulo":"Contrato de teste","inicio":"2027-01-01","referencia":"TST-001"}');
  contrato:=(v->>'contrato_id')::uuid;
  perform inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
    jsonb_build_object('acao','editar_contrato','contrato_id',contrato,'version',1,'titulo','Minuta de teste'));
  if (select count(*) from inspecoes_continuidade_eventos where contrato_id=contrato)<>2
    or (select dados#>>'{antes,titulo}' from inspecoes_continuidade_eventos
      where contrato_id=contrato and evento='editar_contrato')<>'Contrato de teste'
  then raise exception 'Alterações do contrato ficaram sem histórico.'; end if;
  begin
    perform inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
      jsonb_build_object('acao','ativar_contrato','contrato_id',contrato,'version',2));
    raise exception 'Admin sem EST ativou contrato.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',externo::text,true);
  if exists(select 1 from inspecoes_acervo_revisoes where registro_id=ativo)
    or exists(select 1 from inspecoes_arquivo_apresentacoes where arquivo_id=foto)
    or exists(select 1 from inspecoes_contexto_eventos where unidade_id=unidade)
    or exists(select 1 from inspecoes_continuidade_eventos where contrato_id=contrato)
  then raise exception 'Admin de outro tenant acessou histórico.'; end if;
  begin
    perform inspecoes_ativar_unidade(org,cliente,unidade,'IN','Inclusão de teste',gen_random_uuid());
    raise exception 'Admin externo alterou o contexto.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',comum::text,true);
  if exists(select 1 from inspecoes_acervo_consulta where id=ativo) then raise exception 'Usuário sem atribuição viu a ficha.'; end if;
  execute 'reset role';
  begin
    update inspecoes_acervo_revisoes set motivo='Alterado' where registro_id=ativo;
    raise exception 'Revisão anterior deixou de ser imutável.';
  exception when check_violation then null; end;
  raise notice 'Manutenção Inspeções: ativação, idempotência, acervo, fotos, contratos, histórico, conflitos e escopo OK.';
end $$;
rollback;
