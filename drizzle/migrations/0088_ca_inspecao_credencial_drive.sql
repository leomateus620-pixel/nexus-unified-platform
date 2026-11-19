-- Convite de instalação de uso único. Nenhum valor da credencial é persistido fora do Vault.
create table public.ca_inspecao_drive_convites (
  hash text primary key check(hash~'^[a-f0-9]{64}$'),
  conta text not null,
  expira_em timestamptz not null
);
alter table public.ca_inspecao_drive_convites enable row level security;
revoke all on public.ca_inspecao_drive_convites from public,anon,authenticated,service_role;

create function public.ca_inspecao_drive_vault_disponivel() returns boolean
language sql stable security definer set search_path='' as $$
  select pg_catalog.to_regclass('vault.secrets') is not null
    and pg_catalog.to_regclass('vault.decrypted_secrets') is not null
    and pg_catalog.to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null
$$;

-- O operador de banco cria o convite para uma conta específica. Um convite novo invalida o anterior.
create function public.ca_inspecao_drive_setup_emitir(p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare conta text:=lower(trim(p_email)); token text; expira timestamptz; configurada boolean;
begin
  if conta is null or length(conta)>254
    or conta!~'^[a-z0-9.+_-]+@[a-z0-9.-]+[.]gserviceaccount[.]com$' then
    raise exception 'Informe o e-mail da conta de serviço do Drive.' using errcode='23514';
  end if;
  if not public.ca_inspecao_drive_vault_disponivel() then
    raise exception 'Cofre de credenciais indisponível.' using errcode='55000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:drive:credencial',0));
  execute 'select exists(select 1 from vault.secrets where name=$1)' into configurada
    using 'nexus_ca_inspecao_drive_service_account';
  if configurada then
    raise exception 'A credencial do Drive já foi cadastrada.' using errcode='PT409';
  end if;
  delete from public.ca_inspecao_drive_convites;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  expira:=clock_timestamp()+interval '10 minutes';
  insert into public.ca_inspecao_drive_convites(hash,conta,expira_em)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),conta,expira);
  return jsonb_build_object('token',token,'expiresAt',expira);
end $$;

-- A resposta é booleana. O valor chega pelo RPC de backend, separado do SQL do operador.
create function public.ca_inspecao_drive_setup_concluir(p_token text,p_credential jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare convite public.ca_inspecao_drive_convites;
  ticket_hash text; pem text; der bytea; key_id text; dados jsonb; configurada boolean;
begin
  if p_token is null or p_token!~'^[a-f0-9]{64}$' or jsonb_typeof(p_credential) is distinct from 'object'
    or octet_length(p_credential::text)>16384 or not public.ca_inspecao_drive_vault_disponivel() then
    return false;
  end if;
  ticket_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:drive:credencial',0));
  select * into convite from public.ca_inspecao_drive_convites c where c.hash=ticket_hash
    and c.expira_em>clock_timestamp() for update;
  if not found or p_credential->>'type' is distinct from 'service_account'
    or p_credential->>'client_email' is distinct from convite.conta
    or jsonb_typeof(p_credential->'private_key') is distinct from 'string' then return false; end if;

  pem:=btrim(p_credential->>'private_key',E' \n\r\t');
  key_id:=p_credential->>'private_key_id';
  if length(pem)>8192
    or pem!~'^-----BEGIN PRIVATE KEY-----[[:space:]]+[A-Za-z0-9+/=[:space:]]+-----END PRIVATE KEY-----$'
    or (key_id is not null and (jsonb_typeof(p_credential->'private_key_id') is distinct from 'string'
      or key_id!~'^[A-Za-z0-9._-]{1,160}$')) then return false; end if;
  begin
    der:=decode(regexp_replace(substring(pem from
      '^-----BEGIN PRIVATE KEY-----([[:space:]A-Za-z0-9+/=]+)-----END PRIVATE KEY-----$'),
      '[[:space:]]+','','g'),'base64');
  exception when invalid_parameter_value or invalid_text_representation then
    return false;
  end;
  if der is null or octet_length(der) not between 512 and 6144 then return false; end if;
  if get_byte(der,0)<>48 or position(decode('06092a864886f70d010101','hex') in der)=0 then
    return false;
  end if;

  execute 'select exists(select 1 from vault.secrets where name=$1)' into configurada
    using 'nexus_ca_inspecao_drive_service_account';
  if configurada then return false; end if;
  dados:=jsonb_strip_nulls(jsonb_build_object('type','service_account','client_email',convite.conta,
    'private_key',pem,'private_key_id',key_id));
  begin
    execute 'select vault.create_secret($1,$2,$3,null::uuid)'
      using dados::text,'nexus_ca_inspecao_drive_service_account','Conta de leitura do acervo de Cruz Alta';
  exception when others then
    -- O detalhe do provedor pode conter parâmetros. Só devolve falha.
    return false;
  end;
  delete from public.ca_inspecao_drive_convites where hash=ticket_hash;
  return true;
end $$;

-- O worker já reclamou um trabalho emitido pelo agendador. Só esse lease permite o RPC.
create function public.ca_inspecao_drive_worker_secret(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare conteudo text; c jsonb;
begin
  if p_id is null or p_lease is null or not public.ca_inspecao_drive_vault_disponivel()
    or not exists(select 1 from public.ca_inspecao_trabalhos j where j.id=p_id and j.lease=p_lease
      and j.estado='processando' and j.lease_ate>=clock_timestamp()) then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1' into conteudo
    using 'nexus_ca_inspecao_drive_service_account';
  c:=conteudo::jsonb;
  if jsonb_typeof(c) is distinct from 'object' or c->>'type' is distinct from 'service_account'
    or jsonb_typeof(c->'client_email') is distinct from 'string'
    or jsonb_typeof(c->'private_key') is distinct from 'string' then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object('type',c->>'type','client_email',c->>'client_email',
    'private_key',c->>'private_key','private_key_id',c->>'private_key_id'));
exception when others then
  return null;
end $$;

revoke all on function public.ca_inspecao_drive_vault_disponivel(),public.ca_inspecao_drive_setup_emitir(text),
  public.ca_inspecao_drive_setup_concluir(text,jsonb),public.ca_inspecao_drive_worker_secret(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_drive_setup_concluir(text,jsonb),
  public.ca_inspecao_drive_worker_secret(uuid,uuid) to service_role;
notify pgrst,'reload schema';
