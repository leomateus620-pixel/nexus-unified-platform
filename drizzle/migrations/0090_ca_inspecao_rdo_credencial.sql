-- O servidor valida o acesso a originais na ficha antes de consultar o Vault.
create function public.ca_inspecao_rdo_credencial(p_pasta text) returns text
language plpgsql stable security definer set search_path='' as $$
declare contexto public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
  conteudo text; credencial jsonb;
begin
  if coalesce(p_pasta,'') !~ '^[A-Za-z0-9_-]{5,250}$' or not exists(
    select 1 from public.ca_inspecao_rdo_acervo a
    join public.ca_inspecao_lotes l on l.id=a.lote_id and l.estado='concluido'
    where (a.organization_id,a.cliente_id,a.unidade_id)=
      (contexto.organization_id,contexto.cliente_id,contexto.unidade_id)
      and a.pastas @> jsonb_build_array(jsonb_build_object('id',p_pasta))
  ) then
    raise exception 'Pasta indisponível no acervo vigente de fotos e RDO.' using errcode='42501';
  end if;

  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then return null; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name=$1'
      into conteudo using 'nexus_ca_inspecao_drive_service_account';
    credencial:=conteudo::jsonb;
    if jsonb_typeof(credencial) is distinct from 'object'
      or credencial->>'type' is distinct from 'service_account'
      or jsonb_typeof(credencial->'client_email') is distinct from 'string'
      or jsonb_typeof(credencial->'private_key') is distinct from 'string' then return null; end if;
    return jsonb_strip_nulls(jsonb_build_object('type',credencial->>'type','client_email',credencial->>'client_email',
      'private_key',credencial->>'private_key','private_key_id',credencial->>'private_key_id'))::text;
  exception when others then
    return null;
  end;
end $$;

revoke all on function public.ca_inspecao_rdo_credencial(text) from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_rdo_credencial(text) to service_role;
notify pgrst,'reload schema';
