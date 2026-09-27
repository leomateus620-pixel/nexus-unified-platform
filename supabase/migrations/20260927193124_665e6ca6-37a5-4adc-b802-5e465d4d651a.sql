
create or replace function public.revisao_version() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('enviada','aceita','recusada','substituida') and (new.parametros is distinct from old.parametros or new.textos is distinct from old.textos) then
    raise exception 'Revisão enviada ou aceita não pode ser alterada.';
  end if;
  if new.parametros is distinct from old.parametros or new.textos is distinct from old.textos then
    new.version := old.version + 1;
    new.desatualizada := true;
  end if;
  new.updated_at := now();
  return new;
end $$;
