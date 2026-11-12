\set ON_ERROR_STOP on
begin;

do $$
declare
  org uuid := gen_random_uuid();
  cliente uuid := gen_random_uuid();
  unidade uuid := gen_random_uuid();
  outra_unidade uuid := gen_random_uuid();
  est uuid := gen_random_uuid();
  tst uuid := gen_random_uuid();
  outro uuid := gen_random_uuid();
  pessoa uuid;
  competencia uuid;
  qualificacao uuid;
  profissional uuid;
  perfil text;
  ordem uuid := gen_random_uuid();
  outra_ordem uuid := gen_random_uuid();
  proposta uuid := gen_random_uuid();
  outra_proposta uuid := gen_random_uuid();
  pacote uuid := gen_random_uuid();
  contrato uuid;
  ciclo uuid;
  chave uuid := gen_random_uuid();
  resposta jsonb;
  pedido jsonb;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.organizations(id,nome) values(org,'Inspeções F4 — teste');
  insert into auth.users(id) values(est),(tst),(outro);
  insert into public.memberships(organization_id,user_id) values(org,est),(org,tst),(org,outro);
  insert into public.user_roles(organization_id,user_id,role) values(org,est,'admin');
  insert into public.clientes(id,organization_id,razao_social) values(cliente,org,'Cliente F4 Teste');
  insert into public.unidades(id,organization_id,cliente_id,nome)
    values(unidade,org,cliente,'Unidade Teste'),(outra_unidade,org,cliente,'Outra Unidade Teste');
  insert into public.inspecoes_contextos(organization_id,cliente_id,unidade_id,segmento)
    values(org,cliente,unidade,'CC'),(org,cliente,outra_unidade,'IN');
  insert into public.inspecoes_registros(id,organization_id,colecao,source_id,titulo,codigo,snapshot)
    values(pacote,org,'pacotes','P1','Pacote Teste','P1','{}');
  insert into public.ordens_servico(id,organization_id,cliente_id,unidade_id,titulo,created_by)
    values(ordem,org,cliente,unidade,'Ordem Teste',est),(outra_ordem,org,cliente,outra_unidade,'Outra Ordem Teste',est);
  insert into public.propostas(id,organization_id,cliente_id,unidade_id,numero,titulo)
    values(proposta,org,cliente,unidade,'TESTE-1','Proposta Teste'),
      (outra_proposta,org,cliente,outra_unidade,'TESTE-2','Outra Proposta Teste');
  perform set_config('request.jwt.claim.sub',est::text,true);
  foreach profissional in array array[est,tst] loop
    perfil:=case when profissional=est then 'EST' else 'TST' end;
    insert into public.competencias(organization_id,nome,exige_evidencia,created_by)
      values(org,perfil,false,est) returning id into competencia;
    insert into public.inspecoes_perfis_competencias values(org,perfil,competencia);
    insert into public.pessoas(organization_id,nome,vinculo,user_id,registro_profissional,created_by)
      values(org,perfil,'colaborador',profissional,'REG-F4-TESTE',est) returning id into pessoa;
    insert into public.pessoa_qualificacoes(organization_id,pessoa_id,competencia_id,emissor,conclusao,
      validade,estado,conferido_por,conferido_em,created_by)
      values(org,pessoa,competencia,'fixture',hoje-30,hoje+30,'validada',est,now(),est)
      returning id into qualificacao;
    insert into public.inspecoes_atribuicoes(organization_id,user_id,pessoa_id,qualificacao_id,perfil,
      cliente_id,unidade_id,inicio,designacao,concedido_por)
      values(org,profissional,pessoa,qualificacao,perfil,cliente,unidade,hoje-5,'Designação local F4',est);
  end loop;

  set local role authenticated;
  pedido:=jsonb_build_object('acao','criar_contrato','titulo','Contrato Teste','referencia','Referência documental',
    'proposta_id',proposta,'pacote_id',pacote,'inicio',hoje,'fim',hoje+60);
  begin
    perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
      pedido||jsonb_build_object('proposta_id',outra_proposta));
    raise exception 'proposta de outra unidade vinculada';
  exception when insufficient_privilege then null;
  end;
  resposta:=public.inspecoes_continuidade_comando(org,cliente,unidade,chave,pedido);
  contrato:=(resposta->>'contrato_id')::uuid;
  assert resposta=public.inspecoes_continuidade_comando(org,cliente,unidade,chave,pedido);
  assert (public.inspecoes_continuidade_consultar(org,cliente,unidade)->>'total')::integer=1;

  pedido:=pedido||jsonb_build_object('acao','editar_contrato','contrato_id',contrato,'version',1,
    'titulo','Contrato Teste Revisado');
  perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
  assert public.inspecoes_continuidade_consultar(org,cliente,unidade)->'contratos'->0->>'titulo'='Contrato Teste Revisado';
  pedido:=jsonb_build_object('acao','ativar_contrato','contrato_id',contrato,'version',2);
  perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
  assert public.inspecoes_continuidade_consultar(org,cliente,unidade)->'contratos'->0->>'situacao_prazo'='em_aviso';
  pedido:=jsonb_build_object('acao','planejar_ciclo','contrato_id',contrato,'version',3,
    'titulo','Visita Teste','recorte','Pavimento 2');
  begin
    perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
      pedido||jsonb_build_object('os_id',outra_ordem));
    raise exception 'OS de outra unidade vinculada';
  exception when insufficient_privilege then null;
  end;
  resposta:=public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
  ciclo:=(resposta->>'ciclo_id')::uuid;
  pedido:=jsonb_build_object('acao','vincular_os','contrato_id',contrato,'version',3,
    'ciclo_id',ciclo,'ciclo_version',1,'os_id',ordem);
  perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
  assert (public.inspecoes_ciclos_consultar(org,cliente,unidade,contrato)->'ciclos'->0->'ordem'->>'id')::uuid=ordem;

  perform set_config('request.jwt.claim.sub',tst::text,true);
  assert public.inspecoes_ciclos_consultar(org,cliente,unidade,contrato)->'ciclos'->0->'ordem'='null'::jsonb;
  pedido:=jsonb_build_object('acao','cancelar_contrato','contrato_id',contrato,'version',3,
    'motivo','Cancelamento formal de teste');
  begin
    perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
    raise exception 'TST cancelou contrato';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',outro::text,true);
  begin
    perform public.inspecoes_continuidade_consultar(org,cliente,unidade);
    raise exception 'usuário sem atribuição consultou continuidade';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',est::text,true);
  begin
    perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),
      pedido||jsonb_build_object('version',1));
    raise exception 'versão antiga cancelou contrato';
  exception when serialization_failure then null;
  end;
  perform public.inspecoes_continuidade_comando(org,cliente,unidade,gen_random_uuid(),pedido);
  assert public.inspecoes_continuidade_consultar(org,cliente,unidade)->'contratos'->0->>'estado'='cancelado';
  assert public.inspecoes_ciclos_consultar(org,cliente,unidade,contrato)->'ciclos'->0->'ordem'->>'estado'='aberta';
  reset role;
  assert (select count(*) from public.inspecoes_continuidade_eventos where contrato_id=contrato)=6;
  assert (select cancelado_por from public.inspecoes_contratos_operacionais where id=contrato)=est;
end
$$;

rollback;
