-- Autorizações transitórias de transferência, criadas apenas pelo executor do banco.
-- O caminho opaco funciona como credencial e permanece privado durante a transferência.
create schema if not exists nexus_inspecoes_transferencia;
revoke all on schema nexus_inspecoes_transferencia from public,anon,authenticated,service_role;

create table nexus_inspecoes_transferencia.objetos (
  caminho text primary key check (caminho ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[A-Za-z0-9_-]{24,64}/[a-z0-9_.-]+$'),
  bytes bigint not null check (bytes between 1 and 52428800),
  mime text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  check (expira_em > criado_em and expira_em <= criado_em + interval '2 hours')
);
revoke all on nexus_inspecoes_transferencia.objetos from public,anon,authenticated,service_role;

create function public.inspecoes_transferencia_permite(p_caminho text,p_metadata jsonb,p_leitura boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from nexus_inspecoes_transferencia.objetos o
    where o.caminho=p_caminho and o.expira_em>now()
      and ((not p_leitura and coalesce(p_metadata,'{}'::jsonb)='{}'::jsonb)
        or (p_metadata->>'size'=o.bytes::text and p_metadata->>'mimetype'=o.mime))
  ) and (
    not p_leitura
    or replace(coalesce(current_setting('storage.operation',true),''),'storage.','')
      in ('object.get_authenticated','object.get_authenticated_info')
  )
$$;
revoke all on function public.inspecoes_transferencia_permite(text,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_transferencia_permite(text,jsonb,boolean) to anon;

create policy inspecoes_transferencia_inserir on storage.objects for insert to anon
  with check(bucket_id='inspecoes-acervo' and public.inspecoes_transferencia_permite(name,metadata,false));
create policy inspecoes_transferencia_conferir on storage.objects for select to anon
  using(bucket_id='inspecoes-acervo' and public.inspecoes_transferencia_permite(name,metadata,true));
