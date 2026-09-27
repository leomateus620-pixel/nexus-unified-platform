
alter function public.bloquear_alteracao() set search_path = public;
alter function public.revisao_version() set search_path = public;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.app_role) from public, anon;
revoke execute on function public.can_see_costs(uuid) from public, anon;
revoke execute on function public.criar_organizacao(text) from public, anon;
revoke execute on function public.revisao_editavel(uuid) from public, anon;
revoke execute on function public.proximo_numero_proposta(uuid) from public, anon;
revoke execute on function public.exigir_revisao_editavel() from public, anon, authenticated;
grant execute on function public.is_member(uuid), public.has_org_role(uuid, public.app_role), public.can_see_costs(uuid), public.revisao_editavel(uuid) to authenticated;
