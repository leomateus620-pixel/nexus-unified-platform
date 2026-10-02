alter table public.produtos drop constraint produtos_sequencia_check;
alter table public.produtos add constraint produtos_sequencia_check check (sequencia >= 0);