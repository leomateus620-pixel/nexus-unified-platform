
-- ============ Organizações e papéis ============
create type public.app_role as enum ('admin','comercial','engenharia','compras','financeiro','campo');
create type public.modalidade_suprimento as enum ('comprar','fabricar','terceirizar');
create type public.tipo_sistema as enum ('TELHADO','OVERHEAD');
create type public.status_revisao as enum ('rascunho','em_revisao','enviada','aceita','recusada','substituida');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  nome text,
  email text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null,
  unique (organization_id, user_id, role)
);
grant select, insert, update, delete on public.organizations, public.memberships, public.user_roles to authenticated;
grant all on public.organizations, public.memberships, public.user_roles to service_role;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.is_member(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.memberships where organization_id=_org and user_id=auth.uid())
$$;
create or replace function public.has_org_role(_org uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where organization_id=_org and user_id=auth.uid() and role=_role)
$$;
create or replace function public.can_see_costs(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where organization_id=_org and user_id=auth.uid()
    and role in ('admin','comercial','engenharia','compras','financeiro'))
$$;

create policy "membros veem org" on public.organizations for select to authenticated using (public.is_member(id));
create policy "admin altera org" on public.organizations for update to authenticated using (public.has_org_role(id,'admin'));
create policy "membros veem membros" on public.memberships for select to authenticated using (public.is_member(organization_id));
create policy "admin gerencia membros" on public.memberships for all to authenticated using (public.has_org_role(organization_id,'admin')) with check (public.has_org_role(organization_id,'admin'));
create policy "membros veem papeis" on public.user_roles for select to authenticated using (public.is_member(organization_id));
create policy "admin gerencia papeis" on public.user_roles for all to authenticated using (public.has_org_role(organization_id,'admin')) with check (public.has_org_role(organization_id,'admin'));

create or replace function public.criar_organizacao(_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid; _email text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists(select 1 from public.memberships where user_id=auth.uid()) then
    raise exception 'usuário já pertence a uma organização';
  end if;
  select email into _email from auth.users where id=auth.uid();
  insert into public.organizations(nome) values (_nome) returning id into _id;
  insert into public.memberships(organization_id,user_id,email) values (_id,auth.uid(),_email);
  insert into public.user_roles(organization_id,user_id,role) values (_id,auth.uid(),'admin');
  return _id;
end $$;
grant execute on function public.criar_organizacao(text) to authenticated;

-- helper genérico de policies por organização
-- ============ Cadastros ============
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  razao_social text not null,
  cnpj text,
  cidade text,
  uf text,
  situacao text not null default 'Ativo',
  created_at timestamptz not null default now()
);
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  endereco text,
  distancia_ida_volta_km numeric,
  created_at timestamptz not null default now()
);
create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  email text,
  telefone text,
  created_at timestamptz not null default now()
);
create table public.fabricantes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  unique (organization_id, nome)
);
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  cnpj text,
  contato text,
  created_at timestamptz not null default now(),
  unique (organization_id, nome)
);
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  unidade text not null,
  fabricante_id uuid references public.fabricantes(id),
  ncm text,
  modalidade public.modalidade_suprimento not null default 'comprar',
  fornecedor_padrao_id uuid references public.fornecedores(id),
  indivisivel boolean not null default true,
  multiplo_compra numeric not null default 1,
  ativo boolean not null default true,
  origem text,
  created_at timestamptz not null default now(),
  unique (organization_id, codigo)
);
create table public.produto_custos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  custo numeric(18,6) not null check (custo >= 0),
  vigencia date not null default current_date,
  fornecedor_id uuid references public.fornecedores(id),
  origem text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.produto_custos(produto_id, vigencia desc);

-- ============ Regras e configurações ============
create table public.regras_versionadas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  versao int not null,
  descricao text,
  regras jsonb not null,
  ativa boolean not null default false,
  origem text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, versao)
);
create table public.config_orcamento (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  parametros jsonb not null default '{}'::jsonb,
  proximo_numero int not null default 1,
  updated_at timestamptz not null default now()
);

-- ============ Propostas ============
create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero text not null,
  cliente_id uuid not null references public.clientes(id),
  unidade_id uuid references public.unidades(id),
  contato_id uuid references public.contatos(id),
  titulo text,
  revisao_corrente_id uuid,
  projeto_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, numero)
);
create table public.proposta_revisoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  numero int not null,
  status public.status_revisao not null default 'rascunho',
  parametros jsonb not null default '{}'::jsonb,
  regras_id uuid references public.regras_versionadas(id),
  regras_snapshot jsonb,
  textos jsonb not null default '{}'::jsonb,
  totais jsonb,
  calculado_em timestamptz,
  desatualizada boolean not null default true,
  version int not null default 1,
  enviada_em timestamptz,
  aceita_em timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposta_id, numero)
);
alter table public.propostas add constraint propostas_rev_fk foreign key (revisao_corrente_id) references public.proposta_revisoes(id) on delete set null;

create table public.revisao_componentes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revisao_id uuid not null references public.proposta_revisoes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  codigo text not null,
  descricao text not null,
  unidade text not null,
  ncm text,
  fabricante text,
  modalidade public.modalidade_suprimento not null,
  fornecedor_id uuid references public.fornecedores(id),
  custo_adotado numeric(18,6) not null default 0,
  custo_origem_id uuid references public.produto_custos(id),
  justificativa text,
  indivisivel boolean not null default true,
  multiplo_compra numeric not null default 1,
  unique (revisao_id, produto_id)
);
create table public.sistemas_dimensionados (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revisao_id uuid not null references public.proposta_revisoes(id) on delete cascade,
  ordem int not null,
  identificacao text not null default '',
  tipo public.tipo_sistema not null,
  metragem numeric(14,3) not null default 0 check (metragem >= 0),
  trechos int not null default 1 check (trechos >= 1),
  origem text not null default 'manual',
  created_at timestamptz not null default now()
);
create index on public.sistemas_dimensionados(revisao_id, ordem);
create table public.sistema_componentes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revisao_id uuid not null references public.proposta_revisoes(id) on delete cascade,
  sistema_id uuid not null references public.sistemas_dimensionados(id) on delete cascade,
  revisao_componente_id uuid not null references public.revisao_componentes(id) on delete cascade,
  regra_chave text not null,
  quantidade_tecnica numeric(18,6) not null,
  quantidade numeric(18,6) not null,
  override_quantidade numeric(18,6),
  override_justificativa text,
  memoria text,
  unique (sistema_id, revisao_componente_id)
);
create table public.calculo_execucoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revisao_id uuid not null references public.proposta_revisoes(id) on delete cascade,
  motor_versao text not null,
  regras_id uuid,
  entradas jsonb not null,
  resultado jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ============ Projetos, demandas e ordens ============
create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null,
  proposta_id uuid not null references public.propostas(id),
  revisao_id uuid not null references public.proposta_revisoes(id),
  cliente_id uuid not null references public.clientes(id),
  status text not null default 'Planejamento',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, codigo),
  unique (revisao_id)
);
alter table public.propostas add constraint propostas_proj_fk foreign key (projeto_id) references public.projetos(id) on delete set null;

create table public.demandas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revisao_id uuid not null references public.proposta_revisoes(id) on delete cascade,
  revisao_componente_id uuid not null references public.revisao_componentes(id),
  modalidade public.modalidade_suprimento not null,
  quantidade_necessaria numeric(18,6) not null,
  quantidade_planejada numeric(18,6) not null,
  status text not null default 'planejada',
  created_at timestamptz not null default now(),
  unique (revisao_id, revisao_componente_id)
);
create table public.ordens_compra (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero text not null,
  revisao_id uuid not null references public.proposta_revisoes(id),
  projeto_id uuid references public.projetos(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  status text not null default 'rascunho',
  frete numeric(18,2) not null default 0,
  entrega_prevista date,
  condicoes text,
  emitida_em timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, numero),
  unique (revisao_id, fornecedor_id)
);
create table public.ordem_compra_itens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ordem_id uuid not null references public.ordens_compra(id) on delete cascade,
  demanda_id uuid not null references public.demandas(id),
  quantidade numeric(18,6) not null check (quantidade > 0),
  preco_unitario numeric(18,6) not null default 0,
  quantidade_recebida numeric(18,6) not null default 0,
  quantidade_cancelada numeric(18,6) not null default 0,
  unique (ordem_id, demanda_id)
);
create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.ordem_compra_itens(id) on delete cascade,
  quantidade numeric(18,6) not null check (quantidade > 0),
  recebido_em date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero text not null,
  revisao_id uuid not null references public.proposta_revisoes(id),
  projeto_id uuid references public.projetos(id),
  responsavel text,
  prazo date,
  status text not null default 'rascunho',
  liberada_em timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, numero),
  unique (revisao_id)
);
create table public.ordem_producao_itens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ordem_id uuid not null references public.ordens_producao(id) on delete cascade,
  demanda_id uuid not null references public.demandas(id),
  quantidade numeric(18,6) not null check (quantidade > 0),
  ficha_tecnica text,
  quantidade_produzida numeric(18,6) not null default 0,
  unique (ordem_id, demanda_id)
);
create table public.apontamentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.ordem_producao_itens(id) on delete cascade,
  quantidade numeric(18,6) not null check (quantidade > 0),
  apontado_em date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tipo text not null,
  revisao_id uuid references public.proposta_revisoes(id),
  versao int not null default 1,
  interno boolean not null default false,
  snapshot jsonb not null,
  emitido_por uuid default auth.uid(),
  emitido_em timestamptz not null default now(),
  unique (revisao_id, tipo, versao)
);
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  motivo text,
  dados jsonb,
  autor uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- documentos emitidos são imutáveis
create or replace function public.bloquear_alteracao() returns trigger language plpgsql as $$
begin raise exception 'Documento emitido é imutável'; end $$;
create trigger documentos_imutaveis before update on public.documentos for each row execute function public.bloquear_alteracao();

-- revisões enviadas/aceitas não podem ter conteúdo alterado
create or replace function public.revisao_editavel(_rev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select status in ('rascunho','em_revisao') from public.proposta_revisoes where id=_rev
$$;

-- ============ Grants + RLS em lote ============
do $$
declare t text;
begin
  foreach t in array array['clientes','unidades','contatos','fabricantes','fornecedores','produtos','produto_custos',
    'regras_versionadas','config_orcamento','propostas','proposta_revisoes','revisao_componentes','sistemas_dimensionados',
    'sistema_componentes','calculo_execucoes','projetos','demandas','ordens_compra','ordem_compra_itens','recebimentos',
    'ordens_producao','ordem_producao_itens','apontamentos','documentos','auditoria']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "org select" on public.%I for select to authenticated using (public.is_member(organization_id))', t);
    execute format('create policy "org insert" on public.%I for insert to authenticated with check (public.is_member(organization_id))', t);
    execute format('create policy "org update" on public.%I for update to authenticated using (public.is_member(organization_id)) with check (public.is_member(organization_id))', t);
  end loop;
end $$;

-- delete: só em rascunho para conteúdo de revisão; demais apenas admin
create policy "org delete" on public.clientes for delete to authenticated using (public.has_org_role(organization_id,'admin'));
create policy "org delete" on public.unidades for delete to authenticated using (public.is_member(organization_id));
create policy "org delete" on public.contatos for delete to authenticated using (public.is_member(organization_id));
create policy "org delete" on public.fornecedores for delete to authenticated using (public.has_org_role(organization_id,'admin'));
create policy "org delete" on public.produtos for delete to authenticated using (public.has_org_role(organization_id,'admin'));
create policy "rascunho delete" on public.sistemas_dimensionados for delete to authenticated using (public.is_member(organization_id) and public.revisao_editavel(revisao_id));
create policy "rascunho delete" on public.sistema_componentes for delete to authenticated using (public.is_member(organization_id) and public.revisao_editavel(revisao_id));
create policy "rascunho delete" on public.revisao_componentes for delete to authenticated using (public.is_member(organization_id) and public.revisao_editavel(revisao_id));
create policy "rascunho delete" on public.propostas for delete to authenticated using (public.is_member(organization_id) and projeto_id is null and not exists(select 1 from public.proposta_revisoes r where r.proposta_id=propostas.id and r.status not in ('rascunho','em_revisao')));

-- escrita em conteúdo de revisão só quando editável
create or replace function public.exigir_revisao_editavel() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.revisao_editavel(coalesce(new.revisao_id, old.revisao_id)) then
    raise exception 'Revisão enviada ou aceita não pode ser alterada. Crie uma nova revisão.';
  end if;
  return coalesce(new, old);
end $$;
create trigger sd_editavel before insert or update on public.sistemas_dimensionados for each row execute function public.exigir_revisao_editavel();
create trigger rc_editavel before insert or update on public.revisao_componentes for each row execute function public.exigir_revisao_editavel();
create trigger sc_editavel before insert or update on public.sistema_componentes for each row execute function public.exigir_revisao_editavel();

-- concorrência otimista na revisão
create or replace function public.revisao_version() returns trigger language plpgsql as $$
begin
  if old.status in ('enviada','aceita','recusada','substituida') and (new.parametros is distinct from old.parametros or new.textos is distinct from old.textos) then
    raise exception 'Revisão enviada ou aceita não pode ser alterada.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger revisao_version before update on public.proposta_revisoes for each row execute function public.revisao_version();

-- numeração
create or replace function public.proximo_numero_proposta(_org uuid) returns text
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not public.is_member(_org) then raise exception 'sem acesso'; end if;
  insert into public.config_orcamento(organization_id) values (_org) on conflict do nothing;
  update public.config_orcamento set proximo_numero = proximo_numero + 1 where organization_id=_org returning proximo_numero - 1 into n;
  return lpad(n::text, 3, '0') || '/' || to_char(now(),'YY');
end $$;
grant execute on function public.proximo_numero_proposta(uuid) to authenticated;
