-- Exclusivo do runner de integração em PostgreSQL isolado. Nenhuma fixture operacional remota.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('13100000-0000-0000-0000-000000000001','cliente-admin-a@example.invalid'),
 ('13100000-0000-0000-0000-000000000002','cliente-admin-b@example.invalid'),
 ('13100000-0000-0000-0000-000000000003','cliente-campo@example.invalid');
insert into public.organizations(id,nome) values
 ('13200000-0000-0000-0000-000000000001','Cliente teste A'),
 ('13200000-0000-0000-0000-000000000002','Cliente teste B');
insert into public.memberships(organization_id,user_id) values
 ('13200000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000001'),
 ('13200000-0000-0000-0000-000000000002','13100000-0000-0000-0000-000000000002'),
 ('13200000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000003');
insert into public.user_roles(organization_id,user_id,role) values
 ('13200000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000001','admin'),
 ('13200000-0000-0000-0000-000000000002','13100000-0000-0000-0000-000000000002','admin'),
 ('13200000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000003','campo');
set local role authenticated;
select set_config('request.jwt.claim.sub','13100000-0000-0000-0000-000000000001',true);
do $$
declare
  a uuid:='13200000-0000-0000-0000-000000000001'; b uuid:='13200000-0000-0000-0000-000000000002';
  chave uuid:=gen_random_uuid(); dados jsonb:='{"razao_social":"Cliente teste alfanumérico","nome_exibicao":"Acervo operacional","cnpj":"AB.12-CD/34","cidade":"Santa Rosa","uf":"rs","observacoes":"Registro de integração isolada"}';
  c jsonb; u jsonb; contato jsonb; outro jsonb; estrangeiro jsonb; unidade_b jsonb; r jsonb; cid uuid; uid uuid; tid uuid;
begin
  c:=public.salvar_cliente_operacional(a,chave,dados); cid:=(c->>'id')::uuid;
  if c->>'identificador_normalizado'<>'AB12CD34' or c->>'cnpj'<>'AB.12-CD/34' or c->>'uf'<>'RS' then raise exception 'C01 normalização/representação incorreta'; end if;
  r:=public.salvar_cliente_operacional(a,chave,dados);
  if r->>'id'<>cid::text or r->>'version'<>'1' then raise exception 'C02 retry duplicou ou alterou cadastro'; end if;
  begin
    perform public.salvar_cliente_operacional(a,chave,dados||'{"cidade":"Outra"}');
    raise exception 'C03 chave diferente aceita';
  exception when unique_violation then null; end;
  begin
    perform public.salvar_cliente_operacional(a,gen_random_uuid(),dados||'{"cnpj":"ab12cd34"}');
    raise exception 'C04 duplicidade normalizada aceita';
  exception when unique_violation then null; end;
  c:=public.salvar_cliente_operacional(a,gen_random_uuid(),dados||'{"cidade":"Ijuí"}',cid,1);
  if c->>'version'<>'2' then raise exception 'C05 versão não avançou'; end if;
  begin
    perform public.salvar_cliente_operacional(a,gen_random_uuid(),dados,cid,1);
    raise exception 'C06 atualização desatualizada aceita';
  exception when serialization_failure then null; end;
  begin
    update public.clientes set cidade='Sobrescrita' where id=cid;
    raise exception 'C07 update direto sem versão aceito';
  exception when insufficient_privilege then null; end;
  u:=public.salvar_unidade_operacional(a,gen_random_uuid(),cid,'{"nome":"Unidade de campo","endereco":"Endereço teste","distancia_ida_volta_km":12.5}'); uid:=(u->>'id')::uuid;
  contato:=public.salvar_contato_operacional(a,gen_random_uuid(),cid,jsonb_build_object('nome','Contato técnico','cargo','Operação','email','tecnico@example.invalid','telefone','555','unidade_id',uid)); tid:=(contato->>'id')::uuid;
  contato:=public.salvar_contato_operacional(a,gen_random_uuid(),cid,jsonb_build_object('nome','Contato atualizado','cargo','Coordenação','email','coord@example.invalid','telefone','556','unidade_id',uid),tid,1);
  if contato->>'version'<>'2' or contato->>'email'<>'coord@example.invalid' then raise exception 'C08 contato não persistiu'; end if;
  outro:=public.salvar_cliente_operacional(a,gen_random_uuid(),'{"razao_social":"Segundo cliente"}');
  begin
    perform public.salvar_contato_operacional(a,gen_random_uuid(),(outro->>'id')::uuid,jsonb_build_object('nome','Contato inválido','unidade_id',uid));
    raise exception 'C09 unidade de outro cliente aceita';
  exception when check_violation then null; end;
  perform public.arquivar_cadastro_cliente(a,gen_random_uuid(),'unidades',uid,1,true,'Unidade encerrada');
  if (select unidade_id from public.contatos where id=tid) is distinct from uid then raise exception 'C10 arquivo perdeu vínculo histórico'; end if;
  begin
    perform public.salvar_contato_operacional(a,gen_random_uuid(),cid,jsonb_build_object('nome','Novo contato','unidade_id',uid));
    raise exception 'C11 nova seleção de unidade arquivada aceita';
  exception when check_violation then null; end;
  perform public.arquivar_cadastro_cliente(a,gen_random_uuid(),'unidades',uid,2,false,'Unidade retomada');
  perform public.arquivar_cadastro_cliente(a,gen_random_uuid(),'contatos',tid,2,true,'Contato substituído');
  perform public.arquivar_cadastro_cliente(a,gen_random_uuid(),'contatos',tid,3,false,'Contato reconfirmado');
  c:=public.arquivar_cadastro_cliente(a,gen_random_uuid(),'clientes',cid,2,true,'Cadastro temporariamente arquivado');
  if c->>'situacao'<>'Arquivado' then raise exception 'C12 cliente não arquivado'; end if;
  begin
    perform public.salvar_unidade_operacional(a,gen_random_uuid(),cid,'{"nome":"Unidade indevida"}');
    raise exception 'C13 novo vínculo a cliente arquivado aceito';
  exception when check_violation then null; end;
  begin
    insert into public.propostas(organization_id,numero,cliente_id) values(a,'C-ARQUIVADO',cid);
    raise exception 'C14 nova proposta com cliente arquivado aceita';
  exception when check_violation then null; end;
  perform public.arquivar_cadastro_cliente(a,gen_random_uuid(),'clientes',cid,3,false,'Cadastro reativado');
  r:=public.obter_cliente_operacional(a,cid);
  if r->>'version'<>'4' or r->>'cidade'<>'Ijuí' then raise exception 'C15 recarga não preservou dados'; end if;
  if (public.listar_cadastros_cliente(a,'unidades',cid)->>'total')::integer<>1 then raise exception 'C16 vínculo não reencontrado'; end if;
  if (select count(*) from public.cliente_historico where cliente_id=cid)<10 then raise exception 'C17 histórico incompleto'; end if;
  begin
    insert into public.cliente_historico(organization_id,cliente_id,operacao,versao,depois,autor) values(a,cid,'alterado',999,'{}',auth.uid());
    raise exception 'C18 histórico forjável';
  exception when insufficient_privilege then null; end;
  -- Outro tenant pode ter o mesmo identificador, mas não o vínculo da organização A.
  perform set_config('request.jwt.claim.sub','13100000-0000-0000-0000-000000000002',true);
  estrangeiro:=public.salvar_cliente_operacional(b,gen_random_uuid(),dados);
  unidade_b:=public.salvar_unidade_operacional(b,gen_random_uuid(),(estrangeiro->>'id')::uuid,'{"nome":"Unidade B"}');
  if (select count(*) from public.clientes where id=cid)<>0 then raise exception 'C19 RLS cruzada'; end if;
  begin
    perform public.obter_cliente_operacional(b,cid);
    raise exception 'C20 RPC leu outro tenant';
  exception when insufficient_privilege then null; end;
  begin
    perform public.salvar_unidade_operacional(b,gen_random_uuid(),cid,'{"nome":"Vínculo cruzado"}');
    raise exception 'C21 RPC vinculou outro tenant';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','13100000-0000-0000-0000-000000000001',true);
  begin
    perform public.salvar_contato_operacional(a,gen_random_uuid(),cid,jsonb_build_object('nome','Contato cruzado','unidade_id',unidade_b->>'id'));
    raise exception 'C22 unidade de outro tenant aceita';
  exception when check_violation then null; end;
  -- Busca literal e contagem global do recorte, sem transformar % em wildcard.
  perform public.salvar_cliente_operacional(a,gen_random_uuid(),jsonb_build_object('razao_social','Cliente de paginação '||n)) from generate_series(1,26) n;
  r:=public.listar_cadastros_cliente(a,'clientes',null,'Cliente de paginação','ativos',0,25);
  if (r->>'total')::integer<>26 or jsonb_array_length(r->'rows')<>25 then raise exception 'C23 primeira página/contagem incorreta'; end if;
  r:=public.listar_cadastros_cliente(a,'clientes',null,'Cliente de paginação','ativos',1,25);
  if jsonb_array_length(r->'rows')<>1 then raise exception 'C24 segunda página incorreta'; end if;
  if (public.listar_cadastros_cliente(a,'clientes',null,'%')->>'total')::integer<>0 then raise exception 'C25 busca permitiu wildcard'; end if;
  begin
    perform public.listar_cadastros_cliente(a,'clientes',null,'','ativos',0,null);
    raise exception 'C26 paginação ilimitada aceita';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub','13100000-0000-0000-0000-000000000003',true);
  begin
    perform public.salvar_cliente_operacional(a,gen_random_uuid(),dados);
    raise exception 'C27 campo criou cliente';
  exception when insufficient_privilege then null; end;
  begin
    perform public.listar_cadastros_cliente(a);
    raise exception 'C28 campo consultou diretório integral por RPC';
  exception when insufficient_privilege then null; end;
  raise notice 'Clientes operacionais C01-C28 | PASSOU';
end $$;
rollback;
