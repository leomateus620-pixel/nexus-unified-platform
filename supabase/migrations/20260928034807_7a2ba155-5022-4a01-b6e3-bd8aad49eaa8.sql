alter function public.atualizar_componentes_revisao(uuid,uuid[],jsonb) set schema nexus_private;
revoke all on function nexus_private.atualizar_componentes_revisao(uuid,uuid[],jsonb) from public,anon;
grant execute on function nexus_private.atualizar_componentes_revisao(uuid,uuid[],jsonb) to authenticated;

create or replace function public.atualizar_componentes_revisao(
  _rev uuid,
  _ids uuid[],
  _patch jsonb
)
returns integer
language sql
security invoker
set search_path = public, nexus_private
as $$
  select nexus_private.atualizar_componentes_revisao(_rev, _ids, _patch)
$$;
revoke all on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb) to authenticated;