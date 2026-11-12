\set ON_ERROR_STOP on
begin;

insert into public.organizations(id,nome)
values ('3e338feb-fd27-4b68-af76-030c1e251fea','Inspeções — teste transacional');

do $$
declare
  org constant uuid := '3e338feb-fd27-4b68-af76-030c1e251fea';
  cliente constant uuid := '037898c4-e212-4d60-a00b-4349b57f3b8a';
  unidade constant uuid := '792c9481-cefa-4c2e-9ee4-65bfc68d34d8';
  arquivo constant uuid := '541c7aaf-3883-40c0-9924-8e7ce695eea6';
  bloco jsonb := '[{"colecao":"documentos","source_id":"orig-1","titulo":"Acervo original","situacao":"emitido","cliente_source_id":"c","unidade_source_id":"u","snapshot":{"historico":[]}}]';
  metadados jsonb := jsonb_build_object('id',arquivo,'papel','original','nome','original.pdf',
    'origem','Verificação local da referência','estado','original_pendente');
  lote uuid;
  nova_versao uuid;
  r jsonb;
begin
  lote:=public.inspecoes_importar_iniciar(org,repeat('1',64),1,'2026-11-01',1);
  perform public.inspecoes_importar_estagiar(org,lote,1,bloco);
  r:=public.inspecoes_importar_aplicar(org,lote,1);
  assert (r->>'conflito')::integer=1, 'contexto não mapeado deve deixar item em conflito';
  assert public.inspecoes_importar_resumo(org,lote,true)->'lote'->>'concluido_em' is null,
    'lote não deve fechar enquanto houver conflito';

  perform public.inspecoes_importar_contexto(org,cliente,unidade,'Cadastro validado para o teste de retomada.',
    '{"id":"c","razao_social":"Cliente Teste","nome_fantasia":"Cliente Teste","segmento_codigo":"CC"}',
    '{"id":"u","nome":"Unidade Teste"}',true,true);
  r:=public.inspecoes_importar_aplicar(org,lote,1);
  assert (r->>'importado')::integer=1, 'item recuperado deve entrar após mapear o contexto';
  assert public.inspecoes_importar_resumo(org,lote,true)->'lote'->>'concluido_em' is not null;
  assert public.inspecoes_importar_estagiar(org,lote,1,bloco)->>'estado'='identico';
  assert (select count(*) from public.inspecoes_registros where organization_id=org)=1;

  nova_versao:=public.inspecoes_importar_iniciar(org,repeat('2',64),2,'2026-11-02',1);
  perform public.inspecoes_importar_estagiar(org,nova_versao,1,bloco);
  assert (public.inspecoes_importar_aplicar(org,nova_versao,1)->>'identico')::integer=1;
  perform public.inspecoes_importar_resumo(org,nova_versao,true);

  nova_versao:=public.inspecoes_importar_iniciar(org,repeat('3',64),3,'2026-11-03',1);
  perform public.inspecoes_importar_estagiar(org,nova_versao,1,jsonb_set(bloco,'{0,titulo}','"Alteração da origem"'));
  assert (public.inspecoes_importar_aplicar(org,nova_versao,1)->>'conflito')::integer=1;
  assert (select titulo from public.inspecoes_registros where organization_id=org)='Acervo original',
    'snapshot posterior não deve substituir registro anterior';

  perform public.inspecoes_importar_arquivo(org,'documentos','orig-1',metadados);
  begin
    perform public.inspecoes_importar_arquivo(org,'documentos','orig-1',metadados || jsonb_build_object(
      'estado','original_verificado','sha256',repeat('a',64),'bytes',12,'mime','application/pdf',
      'caminho',org::text||'/'||arquivo::text||'/original.pdf'));
    raise exception 'confirmação indevida sem objeto do Storage';
  exception when check_violation then
    assert (select estado from public.inspecoes_arquivos where id=arquivo)='original_pendente';
  end;
end
$$;

set local role authenticated;
do $$
begin
  begin
    perform public.inspecoes_importar_iniciar('3e338feb-fd27-4b68-af76-030c1e251fea',
      repeat('a',64),1,'2026-11-01',1);
    raise exception 'autenticação sem atribuição de importação concedeu escrita';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

set local role service_role;
do $$
begin
  begin
    perform public.inspecoes_importar_iniciar('3e338feb-fd27-4b68-af76-030c1e251fea',
      repeat('b',64),1,'2026-11-01',1);
    raise exception 'service_role sem JWT válido concedeu escrita';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
