do $$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    execute 'revoke execute on function public.importar_produto_oficial(uuid,text,jsonb) from sandbox_exec';
  end if;
end $$;