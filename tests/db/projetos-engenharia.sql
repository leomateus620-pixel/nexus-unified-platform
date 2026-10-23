-- Executar apenas no PostgreSQL isolado, após cenarios.sql e migrações reais.
\set ON_ERROR_STOP on
begin;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',true);
insert into public.pessoas(id,organization_id,nome,vinculo,user_id) values
 ('7e000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Engenharia teste PE','colaborador',null),
 ('7e000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Engenharia B PE','colaborador',null);
insert into public.unidades(id,organization_id,cliente_id,nome) values
 ('7e100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Unidade PE A'),
 ('7e100000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Unidade PE B');
create temp table pe_estado(chave text primary key, valor jsonb not null);
grant all on pe_estado to authenticated;
create function pg_temp.pe_assert(ok boolean,rotulo text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'PE FALHOU: %',rotulo; end if;
  raise notice 'PE PASSOU: %',rotulo;
end $$;
create function pg_temp.pe_erro(q text,codigo text,rotulo text) returns void language plpgsql as $$ begin
  begin execute q; exception when others then
    if sqlstate=codigo then raise notice 'PE PASSOU: %',rotulo; return; end if;
    raise exception 'PE FALHOU: %, código recebido %, esperado %, erro %',rotulo,sqlstate,codigo,sqlerrm;
  end;
  raise exception 'PE FALHOU: %, operação indevidamente permitida',rotulo;
end $$;
insert into pe_estado values('modelo','{"schema_version":1,"familia":"documental","finalidade":"estudo","secoes":[{"id":"7e200000-0000-0000-0000-000000000001","titulo":"Escopo","texto":"Estudo conceitual com dados a confirmar"}],"parametros":[{"id":"7e200000-0000-0000-0000-000000000002","nome":"Comprimento nominal","valor_original":"82,100000001","unidade":"m","natureza":"estimado","validacao":"a_confirmar","fonte":"Prancha de teste, nota 1"}]}');
insert into pe_estado select 'payload',jsonb_build_object('titulo','Projeto técnico independente','cliente_id','20000000-0000-0000-0000-000000000001','unidade_id','7e100000-0000-0000-0000-000000000001','responsavel_id','7e000000-0000-0000-0000-000000000001','resumo','Primeira versão documental','modelo',valor,'visibilidade','restrito') from pe_estado where chave='modelo';
set local role authenticated;
insert into pe_estado select 'criado',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000001','criar',valor) from pe_estado where chave='payload';
select pg_temp.pe_assert((valor->'versao'->>'numero')='1' and (valor->'versao'->>'estado')='rascunho','PE01 primeira versão sem proposta/obra') from pe_estado where chave='criado';
select pg_temp.pe_assert(public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000001','criar',p.valor)=r.valor,'PE03 retry retorna a mesma operação') from pe_estado p,pe_estado r where p.chave='payload' and r.chave='criado';
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000001','criar',valor||'{"titulo":"Payload alterado"}'),'23505','mesma chave com outro conteúdo gera conflito') from pe_estado where chave='payload';
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000002','criar',valor||'{"unidade_id":"7e100000-0000-0000-0000-000000000002"}'),'23514','PE29 unidade cruzada rejeitada') from pe_estado where chave='payload';
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000003','salvar',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',99,'modelo',(select valor from pe_estado where chave='modelo'),'resumo','Conflito de versão')),'40001','expected_version rejeita sobrescrita') from pe_estado where chave='criado';
insert into pe_estado select 'submetida',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000004','submeter',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',1)) from pe_estado where chave='criado';
insert into pe_estado select 'devolvida',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000005','devolver',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',2,'motivo','Conferir as fontes do levantamento')) from pe_estado where chave='submetida';
select pg_temp.pe_assert((valor->'versao'->>'estado')='rascunho','devolução preserva versão e retorna rascunho') from pe_estado where chave='devolvida';
insert into pe_estado select 'revisada',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000006','submeter',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',3)) from pe_estado where chave='devolvida';
insert into pe_estado select 'congelada',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000007','congelar',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',4)) from pe_estado where chave='revisada';
select pg_temp.pe_assert((valor->'versao'->>'estado')='congelada' and length(valor->'versao'->>'snapshot_sha256')=64,'snapshot congelado com SHA256') from pe_estado where chave='congelada';
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000008','salvar',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','expected_version',5,'modelo',(select valor from pe_estado where chave='modelo'),'resumo','Tentar reescrever congelada')),'23514','PE23 versão congelada não editável') from pe_estado where chave='congelada';
insert into pe_estado select 'v2',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000009','nova_versao',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','resumo','Segunda versão com mesma origem')) from pe_estado where chave='congelada';
select pg_temp.pe_assert((v.valor->'versao'->>'numero')='2' and v.valor->'versao'->>'parent_id'=b.valor->'versao'->>'id','PE02 V2 com lineage de V1') from pe_estado v,pe_estado b where v.chave='v2' and b.chave='congelada';
insert into pe_estado select 'cenario',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000010','criar_cenario',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','titulo','Alternativa documental')) from pe_estado where chave='congelada';
insert into pe_estado select 'promovida',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000011','promover_cenario',jsonb_build_object('projeto_id',valor->'projeto'->>'id','cenario_id',valor->'cenario'->>'id','expected_version',1,'resumo','Promoção do experimento')) from pe_estado where chave='cenario';
select pg_temp.pe_assert((valor->'versao'->>'numero')='3' and valor->'cenario'->>'promovida_id'=valor->'versao'->>'id','PE24 promoção produz nova versão e vincula cenário') from pe_estado where chave='promovida';
select pg_temp.pe_assert(v.snapshot_sha256=b.valor->'versao'->>'snapshot_sha256' and v.snapshot=b.valor->'versao'->'snapshot','PE27 V1 e hash preservados após V2 e cenário') from public.pe_versoes v,pe_estado b where b.chave='congelada' and v.id=(b.valor->'versao'->>'id')::uuid;
insert into pe_estado select 'cenario_descarte',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000014','criar_cenario',jsonb_build_object('projeto_id',valor->'projeto'->>'id','versao_id',valor->'versao'->>'id','titulo','Alternativa para descarte')) from pe_estado where chave='congelada';
insert into pe_estado select 'descartado',public.pe_executar('10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000015','descartar_cenario',jsonb_build_object('projeto_id',valor->'projeto'->>'id','cenario_id',valor->'cenario'->>'id','expected_version',1,'motivo','Alternativa não adotada na revisão')) from pe_estado where chave='cenario_descarte';
select pg_temp.pe_assert((valor->'cenario'->>'descartado')::boolean and (valor->'cenario'->>'promovida_id') is null,'PE23 descarte persiste sem promover ou apagar baseline') from pe_estado where chave='descartado';
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000016','salvar_cenario',jsonb_build_object('projeto_id',valor->'projeto'->>'id','cenario_id',valor->'cenario'->>'id','expected_version',2,'modelo',(select valor from pe_estado where chave='modelo'))),'23514','cenário descartado preserva história e não aceita escrita') from pe_estado where chave='descartado';
reset role;
update public.clientes set razao_social='Identificação atual alterada após congelamento' where id='20000000-0000-0000-0000-000000000001';
update public.unidades set arquivado_em=now() where id='7e100000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.pe_assert(v.snapshot=b.valor->'versao'->'snapshot','snapshot preserva identificação histórica após alteração de cadastro') from public.pe_versoes v,pe_estado b where b.chave='congelada' and v.id=(b.valor->'versao'->>'id')::uuid;
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000017','criar',valor),'23514','unidade arquivada não entra em novo projeto') from pe_estado where chave='payload';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',true);
select pg_temp.pe_assert((select count(*) from public.pe_projetos)=0 and (select count(*) from public.pe_versoes)=0,'PE29 campo não recebe dados técnicos privados');
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000012','criar',valor),'42501','PE29 campo não escreve por RPC') from pe_estado where chave='payload';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b0',true);
select pg_temp.pe_assert((select count(*) from public.pe_projetos)=0 and (select count(*) from public.pe_eventos)=0,'PE29 admin de outro tenant não vê projeto/histórico');
select pg_temp.pe_erro(format('select public.pe_executar(%L,%L,%L,%L::jsonb)','10000000-0000-0000-0000-000000000001','7e300000-0000-0000-0000-000000000013','criar',valor),'42501','PE29 admin externo não comanda tenant A') from pe_estado where chave='payload';
reset role;
rollback;
