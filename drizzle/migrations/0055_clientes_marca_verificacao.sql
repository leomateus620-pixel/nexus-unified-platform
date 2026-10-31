-- Readback privado antes de adotar a mídia no cadastro. O autor pode retomar um envio pelo hash.
-- Valida formato antes dos casts; políticas deste bucket não afetam nomes de objetos de outros módulos.
create function public.cliente_marca_pode_enviar(p_caminho text) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 if p_caminho is null or p_caminho !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}\.(png|jpg)$' then return false; end if;
 if split_part(p_caminho,'/',1) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or split_part(p_caminho,'/',2) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
 return auth.uid() is not null and split_part(p_caminho,'/',2)=auth.uid()::text
  and public.pode(split_part(p_caminho,'/',1)::uuid,'editar_cadastro');
end $$;
revoke all on function public.cliente_marca_pode_enviar(text) from public,anon,service_role;
grant execute on function public.cliente_marca_pode_enviar(text) to authenticated;
drop policy cliente_marca_enviar on storage.objects;
create policy cliente_marca_enviar on storage.objects for insert to authenticated
with check(bucket_id='nexus-clientes-marcas' and public.cliente_marca_pode_enviar(name));
create policy cliente_marca_ler_envio on storage.objects for select to authenticated
using(bucket_id='nexus-clientes-marcas' and public.cliente_marca_pode_enviar(name));
notify pgrst,'reload schema';
