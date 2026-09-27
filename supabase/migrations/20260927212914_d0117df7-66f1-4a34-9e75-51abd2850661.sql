create policy "ler" on public.numeracao for select to authenticated using (is_member(organization_id));
grant select on public.numeracao to authenticated;