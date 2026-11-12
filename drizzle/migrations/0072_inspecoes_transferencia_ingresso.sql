-- Storage autoriza o caminho antes de calcular os metadados dos bytes recebidos.
-- A leitura de conferência continua condicionada a MIME e tamanho exatos.
create or replace function public.inspecoes_transferencia_permite(p_caminho text,p_metadata jsonb,p_leitura boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from nexus_inspecoes_transferencia.objetos o
    where o.caminho=p_caminho and o.expira_em>now()
      and (not p_leitura or (p_metadata->>'size'=o.bytes::text and p_metadata->>'mimetype'=o.mime))
  ) and (
    not p_leitura
    or replace(coalesce(current_setting('storage.operation',true),''),'storage.','')
      in ('object.get_authenticated','object.get_authenticated_info')
  )
$$;
