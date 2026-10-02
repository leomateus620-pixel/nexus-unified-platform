alter table public.produtos add column if not exists familia_tecnica text references public.familias_codigo(sigla);
alter table public.produtos add column if not exists descricao_original text;
alter table public.revisao_componentes add column if not exists custo_base text;

create table public.produto_referencias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  produto_id uuid not null references public.produtos(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  codigo_fornecedor text not null,
  descricao_original text,
  created_at timestamptz not null default now(),
  unique (organization_id, fornecedor_id, codigo_fornecedor)
);
grant select, insert, update on public.produto_referencias to authenticated;
grant all on public.produto_referencias to service_role;
alter table public.produto_referencias enable row level security;
create policy "membros leem referencias" on public.produto_referencias for select to authenticated using (public.is_member(organization_id));
create policy "catalogo grava referencias" on public.produto_referencias for insert to authenticated with check (public.pode(organization_id,'importar_catalogo'));
create policy "catalogo altera referencias" on public.produto_referencias for update to authenticated using (public.pode(organization_id,'importar_catalogo'));

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  fornecedor_id uuid references public.fornecedores(id),
  fornecedor_texto text,
  numero text not null,
  serie text,
  chave_acesso text,
  emitido_em date,
  provisorio boolean not null default false,
  observacao text,
  origem jsonb,
  created_at timestamptz not null default now()
);
create unique index documentos_fiscais_chave on public.documentos_fiscais(organization_id, chave_acesso) where chave_acesso is not null;
create unique index documentos_fiscais_ident on public.documentos_fiscais(organization_id, coalesce(fornecedor_id::text, fornecedor_texto), coalesce(serie,''), numero);
grant select, insert, update on public.documentos_fiscais to authenticated;
grant all on public.documentos_fiscais to service_role;
alter table public.documentos_fiscais enable row level security;
create policy "membros leem documentos fiscais" on public.documentos_fiscais for select to authenticated using (public.is_member(organization_id));
create policy "catalogo grava documentos fiscais" on public.documentos_fiscais for insert to authenticated with check (public.pode(organization_id,'importar_catalogo'));

create table public.politicas_custo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  versao text not null,
  descricao text not null,
  parcelas_no_custo text[] not null,
  situacao text not null default 'a_validar' check (situacao in ('a_validar','validada','historica')),
  divergencias jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (organization_id, versao)
);
grant select, insert, update on public.politicas_custo to authenticated;
grant all on public.politicas_custo to service_role;
alter table public.politicas_custo enable row level security;
create policy "membros leem politicas" on public.politicas_custo for select to authenticated using (public.is_member(organization_id));
create policy "admin valida politicas" on public.politicas_custo for update to authenticated using (public.has_org_role(organization_id,'admin') or public.has_org_role(organization_id,'financeiro'));

create table public.produto_conversoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  produto_id uuid not null references public.produtos(id),
  unidade_compra text not null,
  fator numeric not null check (fator > 0),
  confirmado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (produto_id, unidade_compra)
);
grant select, insert, update on public.produto_conversoes to authenticated;
grant all on public.produto_conversoes to service_role;
alter table public.produto_conversoes enable row level security;
create policy "membros leem conversoes" on public.produto_conversoes for select to authenticated using (public.is_member(organization_id));
create policy "catalogo grava conversoes" on public.produto_conversoes for insert to authenticated with check (public.pode(organization_id,'importar_catalogo'));
create policy "catalogo altera conversoes" on public.produto_conversoes for update to authenticated using (public.pode(organization_id,'importar_catalogo'));

create table public.aquisicoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  produto_id uuid not null references public.produtos(id),
  documento_id uuid references public.documentos_fiscais(id),
  chave text not null,
  quantidade numeric not null,
  unidade text not null,
  parcelas jsonb not null default '{}',
  valores_calculados jsonb,
  custo_total numeric,
  custo_unitario numeric,
  politica_versao text,
  situacao text not null check (situacao in ('valida','pendente')),
  pendencia text,
  lote text,
  origem jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, chave)
);
create index aquisicoes_produto on public.aquisicoes(produto_id);
grant select on public.aquisicoes to authenticated;
grant all on public.aquisicoes to service_role;
alter table public.aquisicoes enable row level security;
create policy "membros leem aquisicoes" on public.aquisicoes for select to authenticated using (public.is_member(organization_id));

create table public.importacao_registros (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  chave text not null,
  arquivo text not null,
  aba text not null,
  linha text,
  situacao text not null check (situacao in ('importado','pendente','resolvido','ignorado')),
  tema text not null,
  explicacao text,
  dados jsonb not null,
  produto_id uuid references public.produtos(id),
  created_at timestamptz not null default now(),
  unique (organization_id, chave)
);
grant select, update on public.importacao_registros to authenticated;
grant all on public.importacao_registros to service_role;
alter table public.importacao_registros enable row level security;
create policy "membros leem importacao" on public.importacao_registros for select to authenticated using (public.is_member(organization_id));
create policy "catalogo resolve importacao" on public.importacao_registros for update to authenticated using (public.pode(organization_id,'importar_catalogo'));

create or replace function public.importar_produto_oficial(_org uuid, _codigo text, _dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _m text[]; _id uuid; _seq int;
begin
  _m := regexp_match(_codigo, '^([A-Z]{2,5})-NXS-([MSP])(\d{3,})$');
  if _m is null then raise exception 'Código fora do padrão: %', _codigo; end if;
  _seq := _m[3]::int;
  select id into _id from produtos where organization_id = _org and codigo = _codigo;
  if _id is not null then return _id; end if;
  perform set_config('nexus.codigo_autorizado','1',true);
  insert into produtos(organization_id,codigo,descricao,descricao_original,unidade,ncm,modalidade,familia,tipo_item,sequencia,origem,base_custo,composicao_status)
  values (_org,_codigo,_dados->>'descricao',_dados->>'descricao_original',coalesce(nullif(_dados->>'unidade',''),'UN'),nullif(_dados->>'ncm',''),
          'comprar',_m[1],_m[2]::char,_seq,_dados->>'origem','completo','nao_aplicavel')
  returning id into _id;
  perform set_config('nexus.codigo_autorizado','',true);
  insert into series_codigo(organization_id,familia,tipo,ultimo) values (_org,_m[1],_m[2]::char,_seq)
  on conflict (organization_id,familia,tipo) do update set ultimo = greatest(series_codigo.ultimo, excluded.ultimo), updated_at = now();
  return _id;
end $$;
revoke all on function public.importar_produto_oficial(uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.registrar_aquisicao(_produto uuid, _chave text, _dados jsonb, _custo_sugerido numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _org uuid; _id uuid; _doc uuid; _forn uuid;
begin
  select organization_id into _org from produtos where id = _produto;
  if _org is null then raise exception 'Produto não encontrado.'; end if;
  if not public.pode(_org,'importar_catalogo') then raise exception 'Registrar compra exige papel Engenharia, Compras ou Admin.'; end if;
  select id into _id from aquisicoes where organization_id = _org and chave = _chave;
  if _id is not null then return jsonb_build_object('id',_id,'repetido',true); end if;
  _forn := nullif(_dados->>'fornecedor_id','')::uuid;
  if coalesce(_dados->>'nf_numero','') <> '' then
    select id into _doc from documentos_fiscais where organization_id = _org
      and ((nullif(_dados->>'nf_chave','') is not null and chave_acesso = _dados->>'nf_chave')
        or (coalesce(fornecedor_id::text,fornecedor_texto) = coalesce(_forn::text,_dados->>'fornecedor_texto') and coalesce(serie,'') = coalesce(_dados->>'nf_serie','') and numero = _dados->>'nf_numero'))
      limit 1;
    if _doc is null then
      insert into documentos_fiscais(organization_id,fornecedor_id,fornecedor_texto,numero,serie,chave_acesso,emitido_em,provisorio)
      values (_org,_forn,nullif(_dados->>'fornecedor_texto',''),_dados->>'nf_numero',nullif(_dados->>'nf_serie',''),nullif(_dados->>'nf_chave',''),nullif(_dados->>'emitido_em','')::date,coalesce((_dados->>'provisorio')::boolean,false))
      returning id into _doc;
    end if;
  end if;
  insert into aquisicoes(organization_id,produto_id,documento_id,chave,quantidade,unidade,parcelas,valores_calculados,custo_total,custo_unitario,politica_versao,situacao,pendencia,lote,origem)
  values (_org,_produto,_doc,_chave,(_dados->>'quantidade')::numeric,_dados->>'unidade',coalesce(_dados->'parcelas','{}'),_dados->'calculado',
          nullif(_dados->'calculado'->>'custo_total','')::numeric,nullif(_dados->'calculado'->>'custo_unitario','')::numeric,_dados->>'politica',
          case when _dados->'calculado'->>'pendencia' is null then 'valida' else 'pendente' end,_dados->'calculado'->>'pendencia',nullif(_dados->>'lote',''),_dados->'origem')
  returning id into _id;
  if _custo_sugerido is not null then
    insert into produto_custos(organization_id,produto_id,custo,vigencia,fornecedor_id,origem,created_by)
    values (_org,_produto,_custo_sugerido,current_date,_forn,'media_ponderada',auth.uid());
  end if;
  insert into auditoria(organization_id,entidade,entidade_id,acao,dados,autor) values (_org,'aquisicao',_id,'registrar',_dados,auth.uid());
  return jsonb_build_object('id',_id,'repetido',false);
end $$;
revoke all on function public.registrar_aquisicao(uuid,text,jsonb,numeric) from public, anon;
grant execute on function public.registrar_aquisicao(uuid,text,jsonb,numeric) to authenticated;