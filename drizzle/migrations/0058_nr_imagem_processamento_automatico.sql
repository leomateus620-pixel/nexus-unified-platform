-- Novos uploads usam Transform do Storage por um worker de I/O privado.
-- Trabalhos Pillow existentes, seus leases e caminhos não são reenfileirados.
do $$begin
 if current_setting('server_version_num')::integer<170000 then
  raise exception'Esta migração requer PostgreSQL 17 para preservar a coluna gerada.'using errcode='0A000';
 end if;
end$$;
alter table public.nr_imagem_representacoes
 drop constraint nr_imagem_representacoes_processador_check,
 add constraint nr_imagem_representacoes_processador_check
  check(processador in('nexus-pillow-v1','nexus-storage-transform-v1')),
 alter column processador set default 'nexus-storage-transform-v1';
alter table public.nr_imagem_representacoes alter column caminho set expression as
 (organization_id::text||'/representacoes/'||arquivo_id::text||'/'||original_sha256||'/'||processador||'/'||variante||'.webp');

-- A aplicação lê somente metadados, nunca credenciais temporárias do worker.
revoke select on public.nr_imagem_representacoes from authenticated;
grant select(id,organization_id,arquivo_id,original_sha256,variante,processador,proveniencia,
 estado,caminho,mime,tamanho,largura,altura,sha256,created_at,processado_em)
 on public.nr_imagem_representacoes to authenticated;

create or replace function public.nr_imagem_representacao_ler(p_org uuid,p_arquivo uuid,p_variante text)returns jsonb
 language plpgsql stable security definer set search_path=''as $$declare r public.nr_imagem_representacoes;begin
 if not public.nr_arquivo_ler(p_org,p_arquivo)then raise exception'Acesso negado.'using errcode='42501';end if;
 if p_variante is null or p_variante not in('miniatura_384','previa_768')then raise exception'Variante inválida.'using errcode='23514';end if;
 select i.*into r from public.nr_imagem_representacoes i join public.nr_arquivos a
 on a.organization_id=i.organization_id and a.id=i.arquivo_id and a.sha256=i.original_sha256
 where i.organization_id=p_org and i.arquivo_id=p_arquivo and i.variante=p_variante
 order by(i.estado='disponivel')desc,(i.processador='nexus-storage-transform-v1')desc,i.id limit 1;
 if not found then return jsonb_build_object('estado','sem_representacao');end if;
 return to_jsonb(r)-array['lease','lease_ate','erro','tentativas'];
end$$;

-- O overload explícito separa os processadores; o contrato antigo continua só Pillow.
create function public.nr_imagem_trabalho_obter(p_limite integer,p_processador text)returns jsonb
 language plpgsql security definer set search_path=''as $$declare result jsonb;begin
 if p_limite is null or p_limite not between 1 and 3 then raise exception'Lote inválido.'using errcode='23514';end if;
 if p_processador is null or p_processador not in('nexus-pillow-v1','nexus-storage-transform-v1')then
  raise exception'Processador inválido.'using errcode='23514';end if;
 if p_processador='nexus-storage-transform-v1'then
  if p_limite<>1 then raise exception'O worker nativo processa uma imagem por invocação.'using errcode='23514';end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nexus:nr:storage-transform:claim',0))then
   return '[]'::jsonb;end if;
 end if;
 update public.nr_imagem_representacoes
 set estado='falhou',lease=null,lease_ate=null,erro='Lease expirado após o limite de tentativas'
 where processador=p_processador and estado='processando'and tentativas>=3 and lease_ate<clock_timestamp();
 if p_processador='nexus-storage-transform-v1'and exists(select 1 from public.nr_imagem_representacoes
  where processador=p_processador and estado='processando'and lease_ate>=clock_timestamp())then
  return '[]'::jsonb;end if;
 with jobs as(select r.id from public.nr_imagem_representacoes r join public.nr_arquivos a
  on a.organization_id=r.organization_id and a.id=r.arquivo_id and a.sha256=r.original_sha256
  where r.processador=p_processador and a.estado='vinculado'and a.bytes_verificados
   and a.mime like'image/%'and coalesce(a.origem_metadata->>'tipo','')<>'miniatura_origem'
   and r.tentativas<3 and(r.estado='fila'or(r.estado='processando'and r.lease_ate<clock_timestamp()))
  order by r.created_at,r.id limit p_limite for update of r skip locked),claimed as(
 update public.nr_imagem_representacoes r set estado='processando',tentativas=tentativas+1,
  lease=gen_random_uuid(),lease_ate=clock_timestamp()+interval'5 minutes',erro=null
 from jobs where r.id=jobs.id returning r.*)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('original_caminho',a.caminho,
  'original_mime',a.mime,'original_tamanho',a.tamanho)),'[]')into result
 from claimed c join public.nr_arquivos a on a.organization_id=c.organization_id and a.id=c.arquivo_id;
 return result;
end$$;
create or replace function public.nr_imagem_trabalho_obter(p_limite integer default 1)returns jsonb
 language sql security definer set search_path=''as $$
 select public.nr_imagem_trabalho_obter(p_limite,'nexus-pillow-v1');
$$;
revoke all on function public.nr_imagem_trabalho_obter(integer),public.nr_imagem_trabalho_obter(integer,text)
 from public,anon,authenticated,service_role;
grant execute on function public.nr_imagem_trabalho_obter(integer),public.nr_imagem_trabalho_obter(integer,text)to service_role;

-- Valores do Vault são configurados pelo conector; nenhum segredo é versionado.
-- A chamada assíncrona só transporta o processador e o limite. O worker reclama a fila.
create function public.nr_imagem_worker_validar(p_token text)returns boolean
 language plpgsql stable security definer set search_path=''as $$declare expected text;begin
 if p_token is null or p_token!~'^[a-f0-9]{64}$'or pg_catalog.to_regclass('vault.decrypted_secrets')is null then
  return false;end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
  into expected using'nexus_nr_image_worker_token';
 if expected is null or expected!~'^[a-f0-9]{64}$'then return false;end if;
 return pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8'))=
  pg_catalog.sha256(pg_catalog.convert_to(expected,'UTF8'));
exception when others then return false;
end$$;
revoke all on function public.nr_imagem_worker_validar(text)from public,anon,authenticated,service_role;
grant execute on function public.nr_imagem_worker_validar(text)to service_role;

create function public.nr_imagem_worker_disparar()returns jsonb
 language plpgsql security definer set search_path=''as $$
declare endpoint text;job_token text;request_id bigint;begin
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
   and(r.estado='fila'and r.tentativas<3 or r.estado='processando'and r.lease_ate<clock_timestamp()))then
  return jsonb_build_object('estado','sem_trabalho');end if;
 if pg_catalog.to_regclass('vault.decrypted_secrets')is null or
  pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')is null then
  return jsonb_build_object('estado','infraestrutura_indisponivel');end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
  into endpoint using'nexus_nr_image_worker_url';
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
  into job_token using'nexus_nr_image_worker_token';
 if endpoint is null or endpoint!~'^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/nr-image-worker$'
  or job_token is null or job_token!~'^[a-f0-9]{64}$'then
  return jsonb_build_object('estado','configuracao_privada_ausente');end if;
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=60000)'
  into request_id using endpoint,
   jsonb_build_object('Content-Type','application/json','X-Nexus-Job-Token',job_token),
   jsonb_build_object('processador','nexus-storage-transform-v1','limite',1);
 perform pg_catalog.set_config('nexus.nr_image_notified','1',true);
 return jsonb_build_object('estado','solicitado','request_id',request_id);
exception when others then
 return jsonb_build_object('estado','falha_no_disparo','sqlstate',sqlstate);
end$$;
revoke all on function public.nr_imagem_worker_disparar()from public,anon,authenticated,service_role;

create function public.nr_imagem_worker_continuar()returns trigger
 language plpgsql security definer set search_path=''as $$begin
 perform public.nr_imagem_worker_disparar();return new;
end$$;
revoke all on function public.nr_imagem_worker_continuar()from public,anon,authenticated,service_role;
create trigger nr_imagem_worker_continuar after update of estado on public.nr_imagem_representacoes
 for each row when(old.processador='nexus-storage-transform-v1'and old.estado='processando'
  and new.estado in('disponivel','fila','falhou'))execute function public.nr_imagem_worker_continuar();

create or replace function public.nr_imagem_enfileirar()returns trigger
 language plpgsql security definer set search_path=''as $$declare inserted integer;begin
 if new.estado='vinculado'and new.bytes_verificados and new.mime like'image/%'
  and coalesce(new.origem_metadata->>'tipo','')<>'miniatura_origem'then
  insert into public.nr_imagem_representacoes(organization_id,arquivo_id,original_sha256,variante,processador)
  select new.organization_id,new.id,new.sha256,v,'nexus-storage-transform-v1'
   from unnest(array['miniatura_384','previa_768'])v
   where not exists(select 1 from public.nr_imagem_representacoes i
    where i.organization_id=new.organization_id and i.arquivo_id=new.id and i.original_sha256=new.sha256)
  on conflict(organization_id,arquivo_id,original_sha256,variante,processador)do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then perform public.nr_imagem_worker_disparar();end if;
 end if;return new;
end$$;
revoke all on function public.nr_imagem_enfileirar()from public,anon,authenticated,service_role;

do $scheduler$declare configuration record;job_id bigint;private_relation regclass;
 privileges text[];prior_service_privileges text[];privilege_name text;begin
 if exists(select 1 from pg_catalog.pg_available_extensions where name='pg_net')
  and not exists(select 1 from pg_catalog.pg_extension where extname='pg_net')then
  execute 'create extension pg_net';end if;
 foreach private_relation in array array[
  pg_catalog.to_regclass('vault.decrypted_secrets'),pg_catalog.to_regclass('net.http_request_queue'),
  pg_catalog.to_regclass('net._http_response')]loop
  if private_relation is not null then
   privileges:=case when private_relation=pg_catalog.to_regclass('vault.decrypted_secrets')then array['SELECT']
    else array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']end;
   select array_agg(p)into prior_service_privileges from unnest(privileges)p
    where pg_catalog.has_table_privilege('service_role',private_relation,p);
   execute pg_catalog.format('revoke %s on %s from public,anon,authenticated',
    case when private_relation=pg_catalog.to_regclass('vault.decrypted_secrets')then'SELECT'else'ALL'end,private_relation);
   -- Preserve inclusive permissões de backend anteriormente herdadas de PUBLIC.
   if prior_service_privileges is not null then foreach privilege_name in array prior_service_privileges loop
    execute pg_catalog.format('grant %s on %s to service_role',privilege_name,private_relation);
   end loop;end if;
  end if;
 end loop;
 if not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')
  or not exists(select 1 from pg_catalog.pg_extension where extname='pg_net')
  or not exists(select 1 from pg_catalog.pg_extension where extname='supabase_vault')then
  insert into public.scheduler_configuracao(nome,estado,extensao,detalhe)
   values('nr-imagem-representacoes','indisponivel','pg_cron/pg_net/vault',
    'Fila preservada; este ambiente não dispõe das extensões para invocação automática do worker privado.');
  return;end if;
 execute 'select jobid,schedule,command,active from cron.job where jobname=$1 and username=current_user'
  into configuration using'nexus-nr-image-worker';
 if configuration.jobid is not null then
  if configuration.schedule<>'* * * * *'or configuration.command<>'select public.nr_imagem_worker_disparar();'or not configuration.active then
   raise exception'Agendamento de imagens existente diverge do contrato.'using errcode='23514';end if;
  job_id:=configuration.jobid;
 else
  execute 'select cron.schedule($1,$2,$3)'into job_id
   using'nexus-nr-image-worker','* * * * *','select public.nr_imagem_worker_disparar();';
 end if;
 insert into public.scheduler_configuracao(nome,estado,extensao,job_id,detalhe)
  values('nr-imagem-representacoes','ativo','pg_cron/pg_net/vault',job_id,
   'Retry privado a cada minuto; invocação depende da URL e do token estreito configurados no Vault.');
end $scheduler$;
