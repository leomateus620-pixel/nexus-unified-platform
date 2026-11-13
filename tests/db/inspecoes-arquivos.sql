-- Banco descartável. Os metadados de Storage simulam o executor, sem dados operacionais.
begin;

create function pg_temp.ok(condicao boolean, descricao text) returns void language plpgsql as $$
begin
  if not coalesce(condicao,false) then raise exception 'Inspeções arquivos: %',descricao; end if;
end $$;

insert into auth.users(id) values ('78000000-0000-4000-8000-000000000001'),('78000000-0000-4000-8000-000000000002');
insert into public.organizations(id,nome) values
  ('78000000-0000-4000-8000-000000000010','Inspeções arquivos teste'),
  ('78000000-0000-4000-8000-000000000011','Outra organização teste');
insert into public.memberships(organization_id,user_id) values
  ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000002'),
  ('78000000-0000-4000-8000-000000000011','78000000-0000-4000-8000-000000000002');
insert into public.user_roles(organization_id,user_id,role) values
  ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000001','admin'),
  ('78000000-0000-4000-8000-000000000011','78000000-0000-4000-8000-000000000002','admin');
insert into public.clientes(id,organization_id,razao_social)
  values ('78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000010','Cliente teste');
insert into public.unidades(id,organization_id,cliente_id,nome)
  values ('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000020','Unidade teste');
insert into public.inspecoes_contextos(organization_id,cliente_id,unidade_id,segmento)
  values ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000020',
    '78000000-0000-4000-8000-000000000030','IN');
insert into public.inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,snapshot)
  values ('78000000-0000-4000-8000-000000000040','78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000030',
    'documentos','TESTE-78','Registro teste','{}');
insert into public.inspecoes_contratos_operacionais(id,organization_id,cliente_id,unidade_id,segmento,titulo,created_by)
  values ('78000000-0000-4000-8000-000000000050','78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000030','IN',
    'Contrato teste','78000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000001',true);
do $$
declare
  org constant uuid:='78000000-0000-4000-8000-000000000010';
  unit constant uuid:='78000000-0000-4000-8000-000000000030';
  reg constant uuid:='78000000-0000-4000-8000-000000000040';
  contrato constant uuid:='78000000-0000-4000-8000-000000000050';
  foto constant uuid:='78000000-0000-4000-8000-000000000060';
  doc constant uuid:='78000000-0000-4000-8000-000000000061';
  arq_contrato constant uuid:='78000000-0000-4000-8000-000000000062';
  hash constant text:=repeat('a',64);
  original jsonb;
begin
  original:=public.inspecoes_arquivo_reservar_alvo(org,'unidade',unit,foto,'foto','foto.jpg','image/jpeg',24,hash,'Legenda');
  perform pg_temp.ok(original->>'unidade_id'=unit::text and original->>'anexo_unidade'='true'
    and original->>'estado'='envio_pendente','destino canônico e reserva de foto');
  perform pg_temp.ok(original=public.inspecoes_arquivo_reservar_alvo(
    org,'unidade',unit,foto,'foto','foto.jpg','image/jpeg',24,hash,'Legenda'),'repetição idempotente');
  perform pg_temp.ok(public.inspecoes_arquivo_pode_enviar(original->>'caminho'),'envio reservado do autor');
  perform pg_temp.ok(not public.inspecoes_arquivo_pode_enviar(original->>'caminho'||'.fora'),'negação de caminho arbitrário');
  perform pg_temp.ok(
    public.inspecoes_arquivo_reservar_alvo(org,'registro',reg,doc,'documento','doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',24,hash)->>'registro_id'=reg::text,
    'DOCX no registro');
  perform pg_temp.ok(
    public.inspecoes_arquivo_reservar_alvo(org,'contrato',contrato,arq_contrato,'contrato','contrato.pdf',
      'application/pdf',24,hash)->>'contrato_id'=contrato::text,
    'arquivo do contrato');
  perform pg_temp.ok(public.inspecoes_arquivo_cancelar(org,arq_contrato)->>'estado'='envio_cancelado','cancelamento auditado');
  begin
    perform public.inspecoes_arquivo_reservar_alvo(org,'registro',reg,foto,'documento','outro.pdf','application/pdf',24,hash);
    raise exception 'Reutilização de chave passou.';
  exception when unique_violation then null; end;
  begin
    perform public.inspecoes_arquivo_reservar_alvo(org,'registro',reg,gen_random_uuid(),'original','novo.pdf','application/pdf',24,hash);
    raise exception 'Arquivo operacional apresentado como original histórico.';
  exception when check_violation then null; end;
  begin
    perform public.inspecoes_arquivo_reservar_alvo(org,'unidade',gen_random_uuid(),gen_random_uuid(),'foto','nova.jpg','image/jpeg',24,hash);
    raise exception 'Unidade inexistente aceita.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.inspecoes_arquivo_reservar_alvo(org,'unidade',unit,gen_random_uuid(),'foto','nova.jpg','image/jpeg',22000000,hash);
    raise exception 'Limite operacional ignorado.';
  exception when check_violation then null; end;
  perform pg_temp.ok(not has_function_privilege('authenticated','public.inspecoes_arquivo_atestar(uuid,uuid,uuid,text,bigint)','execute'),
    'atestação reservada ao servidor');
  perform pg_temp.ok(not has_function_privilege('authenticated','public.inspecoes_arquivo_derivados(uuid,uuid,uuid,jsonb)','execute'),
    'derivados reservados ao servidor');
end $$;

select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000002',true);
do $$
declare org constant uuid:='78000000-0000-4000-8000-000000000010';
begin
  perform pg_temp.ok(not exists(select 1 from public.inspecoes_arquivos where organization_id=org),'RLS do acervo');
  perform pg_temp.ok(not exists(select 1 from public.inspecoes_arquivo_eventos where organization_id=org),'RLS do histórico');
  begin
    perform public.inspecoes_arquivo_reservar_alvo(org,'unidade','78000000-0000-4000-8000-000000000030',
      gen_random_uuid(),'foto','foto.jpg','image/jpeg',24,repeat('a',64));
    raise exception 'Admin de outra organização pode anexar.';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
insert into storage.objects(bucket_id,name,metadata)
select 'inspecoes-acervo',caminho,'{"size":24,"mimetype":"image/jpeg"}'
from public.inspecoes_arquivos where id='78000000-0000-4000-8000-000000000060';
insert into storage.objects(bucket_id,name,metadata)
select 'inspecoes-acervo',replace(caminho,'original.jpg',v), '{"size":32,"mimetype":"image/webp"}'
from public.inspecoes_arquivos cross join unnest(array['miniatura_384.webp','previa_768.webp']) as v
where id='78000000-0000-4000-8000-000000000060';

set local role service_role;
do $$
declare
  org constant uuid:='78000000-0000-4000-8000-000000000010';
  autor constant uuid:='78000000-0000-4000-8000-000000000001';
  foto constant uuid:='78000000-0000-4000-8000-000000000060';
  prefixo constant text:=org::text||'/'||foto::text||'/';
  thumb constant jsonb:=jsonb_build_object('caminho',prefixo||'miniatura_384.webp','sha256',repeat('b',64),'bytes',32);
  preview constant jsonb:=jsonb_build_object('caminho',prefixo||'previa_768.webp','sha256',repeat('c',64),'bytes',32);
begin
  begin
    perform public.inspecoes_arquivo_atestar(org,foto,autor,repeat('b',64),24);
    raise exception 'Hash divergente aceito.';
  exception when insufficient_privilege then null; end;
  perform pg_temp.ok(public.inspecoes_arquivo_atestar(org,foto,autor,repeat('a',64),24)->>'estado'='original_verificado',
    'confirmação do original');
  perform pg_temp.ok(public.inspecoes_arquivo_derivados(org,foto,autor,jsonb_build_object('miniatura_384',thumb))->>'estado'='falha_processamento',
    'falha parcial mantém o original');
  perform pg_temp.ok(public.inspecoes_arquivo_derivados(org,foto,autor,jsonb_build_object('previa_768',preview))->>'estado'='original_verificado',
    'retomada confirma as duas variantes');
  perform pg_temp.ok(public.inspecoes_arquivo_derivados(org,foto,autor,'{}')->>'miniatura_caminho'=prefixo||'miniatura_384.webp',
    'retomada preserva a miniatura verificada');
  begin
    perform public.inspecoes_arquivo_derivados(org,foto,autor,
      jsonb_build_object('miniatura_384',thumb||jsonb_build_object('sha256',repeat('d',64))));
    raise exception 'Troca de bytes verificados aceita.';
  exception when check_violation then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000001',true);
select pg_temp.ok(
  (select array_agg(evento order by id) from public.inspecoes_arquivo_eventos
    where arquivo_id='78000000-0000-4000-8000-000000000060')
    =array['envio_reservado','original_verificado','falha_miniaturas','miniaturas_verificadas'],
  'histórico com um evento por transição');
select pg_temp.ok(
  (select count(*)=3 from storage.objects where bucket_id='inspecoes-acervo'
    and name like '78000000-0000-4000-8000-000000000010/78000000-0000-4000-8000-000000000060/%'),
  'leitura privada de original, miniatura e prévia no contexto');
rollback;
