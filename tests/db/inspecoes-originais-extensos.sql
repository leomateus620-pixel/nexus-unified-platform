begin;
do $$
declare o uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
  doc uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
  p text:=o::text||'/'||a::text||'/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/original.pdf';
begin
  insert into organizations(id,nome) values(o,'Originais extensos – teste');
  insert into clientes(id,organization_id,razao_social) values(c,o,'Cliente sintético');
  insert into unidades(id,organization_id,cliente_id,nome) values(u,o,c,'Unidade sintética');
  insert into inspecoes_contextos(organization_id,cliente_id,unidade_id,segmento) values(o,c,u,'IN');
  insert into inspecoes_registros(id,organization_id,cliente_id,unidade_id,colecao,source_id,titulo,snapshot)
    values(doc,o,c,u,'documentos','extenso-fixture','Arquivo extenso sintético','{}');
  insert into inspecoes_arquivos(id,organization_id,cliente_id,unidade_id,registro_id,papel,nome,estado,origem)
    values(a,o,c,u,doc,'original','fixture.pdf','original_pendente','Fixture');
  insert into nexus_inspecoes_transferencia.objetos(caminho,bytes,mime,sha256,expira_em)
    values(p,136150508,'application/pdf',repeat('a',64),now()+interval '10 minutes');
  insert into storage.objects(bucket_id,name,metadata)
    values('inspecoes-acervo',p,'{"size":136150508,"mimetype":"application/pdf"}');
  perform inspecoes_importar_arquivo(o,'documentos','extenso-fixture',
    jsonb_build_object('id',a,'nome','fixture.pdf','papel','original','estado','original_verificado','origem','Fixture',
      'mime','application/pdf','bytes',136150508,'sha256',repeat('a',64),'caminho',p));
  if not exists(select 1 from inspecoes_arquivos where id=a and bytes=136150508)
    or not exists(select 1 from storage.buckets where id='inspecoes-acervo' and not public and file_size_limit=157286400)
  then raise exception 'Original extenso não confirmado.'; end if;
  begin
    insert into nexus_inspecoes_transferencia.objetos(caminho,bytes,mime,sha256,expira_em)
      values(o::text||'/'||a::text||'/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/original.pdf',
        157286401,'application/pdf',repeat('a',64),now()+interval '10 minutes');
    raise exception 'Tamanho fora do limite foi aceito.';
  exception when check_violation then null; end;
  begin
    insert into nexus_inspecoes_transferencia.objetos(caminho,bytes,mime,sha256,expira_em)
      values(o::text||'/'||a::text||'/cccccccccccccccccccccccccccccccc/original.jpg',
        136150508,'image/jpeg',repeat('a',64),now()+interval '10 minutes');
    raise exception 'Imagem foi aceita como original extenso.';
  exception when check_violation then null; end;
  raise notice 'Original histórico extenso, bucket privado, limites e vínculo conferidos.';
end $$;
rollback;
