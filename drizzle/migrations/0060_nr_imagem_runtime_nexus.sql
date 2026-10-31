-- Mesmo dispatcher privado e tickets descartáveis; apenas o destino fixo muda para o runtime Nexus.
-- Nenhuma URL do Vault é ativada e nenhum arquivo/job é criado por esta migração.
create or replace function public.nr_imagem_worker_disparar()returns jsonb
 language plpgsql security definer set search_path=''as $$
declare endpoint text;ticket text;crypto_schema text;request_id bigint;begin
 delete from public.nr_imagem_worker_tickets where expira_em<=clock_timestamp()-interval'10 minutes';
 if current_setting('nexus.nr_image_notified',true)='1'then
  return jsonb_build_object('estado','ja_solicitado_na_transacao');end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nexus:nr:image-worker',0))then
  return jsonb_build_object('estado','disparo_em_andamento');end if;
 if exists(select 1 from public.nr_imagem_representacoes where processador='nexus-storage-transform-v1'
  and estado='processando'and lease_ate>=clock_timestamp())then
  return jsonb_build_object('estado','processamento_em_andamento');end if;
 if not exists(select 1 from public.nr_imagem_representacoes r join public.nr_arquivos a
  on a.organization_id=r.organization_id and a.id=r.arquivo_id and a.sha256=r.original_sha256
  where r.processador='nexus-storage-transform-v1'and a.estado='vinculado'and a.bytes_verificados
   and a.mime like'image/%'and coalesce(a.origem_metadata->>'tipo','')<>'miniatura_origem'
   and(r.estado='fila'and r.tentativas<3 or r.estado='processando'and r.lease_ate<clock_timestamp()))then
  return jsonb_build_object('estado','sem_trabalho');end if;
 if pg_catalog.to_regclass('vault.decrypted_secrets')is null or
  pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')is null then
  return jsonb_build_object('estado','infraestrutura_indisponivel');end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
  into endpoint using'nexus_nr_image_worker_url';
 if endpoint is distinct from'https://nexusgestao.app/api/public/nr/image-worker'then
  return jsonb_build_object('estado','configuracao_privada_ausente');end if;
 select n.nspname into crypto_schema from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 if crypto_schema is null then raise exception'Gerador criptográfico indisponível.'using errcode='55000';end if;
 execute pg_catalog.format('select pg_catalog.encode(%I.gen_random_bytes(32),''hex'')',crypto_schema)into ticket;
 insert into public.nr_imagem_worker_tickets(ticket_sha256,expira_em)
  values(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(ticket,'UTF8')),'hex'),clock_timestamp()+interval'120 seconds');
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=60000)'
  into request_id using endpoint,
   jsonb_build_object('Content-Type','application/json','X-Nexus-Job-Token',ticket),
   jsonb_build_object('processador','nexus-storage-transform-v1','limite',1);
 if request_id is null then raise exception'Disparo não confirmado.'using errcode='08006';end if;
 perform pg_catalog.set_config('nexus.nr_image_notified','1',true);
 return jsonb_build_object('estado','solicitado','request_id',request_id);
exception when others then
 return jsonb_build_object('estado','falha_no_disparo','sqlstate',sqlstate);
end$$;
