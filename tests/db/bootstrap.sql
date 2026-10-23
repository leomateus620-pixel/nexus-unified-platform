-- Stub mínimo do ambiente Supabase para aplicar as migrations reais num Postgres vazio.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Somente metadados do Supabase Storage para testar SQL/RLS isoladamente.
-- Não representa upload binário nem comprova operação do serviço Storage conectado.
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
  name text not null, metadata jsonb, owner uuid, unique(bucket_id,name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on storage.buckets,storage.objects to service_role;
