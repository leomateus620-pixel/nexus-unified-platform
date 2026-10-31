-- Marca vinculada ao cadastro canônico; identidade técnica e nome comercial preservados.
alter table public.clientes add column marca jsonb;
comment on column public.clientes.marca is 'Mídia de identidade por cliente, com origem e SHA-256; URL assinada nunca é persistida.';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nexus-clientes-marcas','nexus-clientes-marcas',false,1048576,array['image/png','image/jpeg']);
create policy cliente_marca_enviar on storage.objects for insert to authenticated
with check(bucket_id='nexus-clientes-marcas' and public.pode(split_part(name,'/',1)::uuid,'editar_cadastro')
 and split_part(name,'/',2)=auth.uid()::text
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}\.(png|jpg)$');
create policy cliente_marca_ler on storage.objects for select to authenticated
using(bucket_id='nexus-clientes-marcas' and exists(select 1 from public.clientes c
 where c.marca->>'caminho'=name and public.is_member(c.organization_id)
 and (public.pode(c.organization_id,'ver_nr') or public.pode(c.organization_id,'editar_cadastro'))));

create or replace function public.salvar_cliente_operacional(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clientes; r jsonb; m jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
 if not public.is_member(_org) or not public.pode(_org,'editar_cadastro') then raise exception 'Acesso negado.' using errcode='42501'; end if;
 r:=public.operacao_repetir(_org,_chave,'salvar_cliente',payload); if r is not null then return r; end if;
 if _id is not null then
  select * into c from public.clientes where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if c.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue e compare antes de salvar.' using errcode='40001'; end if;
 end if;
 m:=case when _dados ? 'marca' then nullif(_dados->'marca','null'::jsonb) else c.marca end;
 if m is not null and m is distinct from c.marca then
  if jsonb_typeof(m)<>'object' or length(m::text)>2500 or m ? 'url' or m->>'sha256' !~ '^[a-f0-9]{64}$'
   or not (m ?& array['caminho','origem','sha256','mime','largura','altura','tamanho'])
   or jsonb_typeof(m->'largura') is distinct from 'number' or jsonb_typeof(m->'altura') is distinct from 'number' or jsonb_typeof(m->'tamanho') is distinct from 'number'
   or jsonb_typeof(m->'origem') is distinct from 'string' or jsonb_typeof(m->'sha256') is distinct from 'string' or jsonb_typeof(m->'caminho') is distinct from 'string' or jsonb_typeof(m->'mime') is distinct from 'string'
   or m->>'mime' not in('image/png','image/jpeg') or (m->>'largura')::integer not between 1 and 8192
   or (m->>'altura')::integer not between 1 and 8192 or (m->>'tamanho')::integer not between 1 and 1048576
   or nullif(m->>'origem','') is null
   or m->>'caminho' !~ ('^'||_org::text||'/'||auth.uid()::text||'/'||(m->>'sha256')||'\.(png|jpg)$') then
   raise exception 'Metadados da marca inválidos.' using errcode='23514'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='nexus-clientes-marcas' and o.name=m->>'caminho'
   and (o.metadata->>'size')::integer=(m->>'tamanho')::integer and o.metadata->>'mimetype'=m->>'mime') then
   raise exception 'Arquivo da marca ainda não confirmado.' using errcode='23514'; end if;
 end if;
 if _id is null then
  insert into public.clientes(organization_id,razao_social,nome_exibicao,cnpj,cidade,uf,observacoes,marca)
  values(_org,trim(_dados->>'razao_social'),nullif(trim(_dados->>'nome_exibicao'),''),nullif(trim(_dados->>'cnpj'),''),nullif(trim(_dados->>'cidade'),''),nullif(upper(trim(_dados->>'uf')),''),nullif(trim(_dados->>'observacoes'),''),m) returning * into c;
 else
  update public.clientes set razao_social=trim(_dados->>'razao_social'),nome_exibicao=nullif(trim(_dados->>'nome_exibicao'),''),cnpj=nullif(trim(_dados->>'cnpj'),''),cidade=nullif(trim(_dados->>'cidade'),''),uf=nullif(upper(trim(_dados->>'uf')),''),observacoes=nullif(trim(_dados->>'observacoes'),''),marca=m where id=_id returning * into c;
 end if;
 return public.operacao_concluir(_org,_chave,'salvar_cliente',payload,to_jsonb(c));
end $$;

-- IDs e relação empresarial confirmados por leitura do cadastro no conector Nexus em 31/10/2026 UTC.
-- A atribuição é por ID+organização, nunca por texto de nome no frontend.
update public.clientes set marca=jsonb_build_object(
 'caminho','/brands/cotrirosa.png','origem','https://cdn.siterapido.rs/wp-content/uploads/sites/210/2023/11/cotrirosa-logo.png',
 'sha256','8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7','mime','image/png','largura',211,'altura',40,'tamanho',8349)
where organization_id='abab473b-8baa-4781-aed2-c1243338af65' and id='9d6dfbe8-285a-44e5-9ea1-2574daa7cb28' and marca is null;
update public.clientes set marca=jsonb_build_object(
 'caminho','/brands/camera.svg','origem','https://www.camera.ind.br/src/img/home/logo.svg',
 'sha256','a7965c6dc0d707d83d4320f2ea5e8119ec6cbbdb216999c4b033b73dabb2d917','mime','image/svg+xml','largura',258,'altura',42,'tamanho',4023)
where organization_id='abab473b-8baa-4781-aed2-c1243338af65' and id='56fc28f9-f5ef-44b2-a5ea-8bfc6bfb94e0' and marca is null;
notify pgrst,'reload schema';
