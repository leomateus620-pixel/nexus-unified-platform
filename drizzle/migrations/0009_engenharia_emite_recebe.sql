create or replace function public.pode(_org uuid, _acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles ur
    where ur.organization_id = _org and ur.user_id = auth.uid()
      and (ur.role = 'admin' or ur.role::text = any (case _acao
        when 'editar_cadastro'      then array['comercial','engenharia','compras']
        when 'importar_catalogo'    then array['engenharia','compras']
        when 'criar_proposta'       then array['comercial','engenharia']
        when 'editar_revisao'       then array['comercial','engenharia']
        when 'aprovar_tecnica'      then array['engenharia']
        when 'aceitar_comercial'    then array['comercial']
        when 'planejar_suprimentos' then array['compras','engenharia']
        when 'emitir_ordem'         then array['compras','engenharia']
        when 'receber'              then array['compras','engenharia']
        when 'produzir'             then array['compras','engenharia','campo']
        when 'ver_custos'           then array['comercial','engenharia','compras','financeiro']
        else array[]::text[] end)));
$$;