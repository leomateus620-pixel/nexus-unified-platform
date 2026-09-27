
-- ============ 1. Matriz de permissões ============
create or replace function public.pode(_org uuid, _acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles ur
    where ur.organization_id = _org and ur.user_id = auth.uid()
      and (ur.role = 'admin' or ur.role::text = any (case _acao
        when 'editar_cadastro'      then array['comercial','engenharia','compras']
        when 'importar_catalogo'    then array['engenharia','compras']
        when 'criar_proposta'       then array['comercial','engenharia']
        when 'editar_revisao'       then array['comercial','engenharia']
        when 'aprovar_tecnica'      then array['engenharia']
        when 'aceitar_comercial'    then array['comercial']
        when 'planejar_suprimentos' then array['compras','engenharia']
        when 'emitir_ordem'         then array['compras']
        when 'receber'              then array['compras']
        when 'produzir'             then array['compras','engenharia','campo']
        when 'ver_custos'           then array['comercial','engenharia','compras','financeiro']
        else array[]::text[] end)));
$$;

-- remove políticas genéricas "org *"
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname='public' and policyname in ('org select','org insert','org update','org delete')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- cadastros
do $$ declare t text; begin
  foreach t in array array['clientes','unidades','contatos','fornecedores','fabricantes','produtos'] loop
    execute format('create policy "ler" on public.%I for select to authenticated using (is_member(organization_id))', t);
    execute format('create policy "criar" on public.%I for insert to authenticated with check (pode(organization_id,''editar_cadastro''))', t);
    execute format('create policy "editar" on public.%I for update to authenticated using (pode(organization_id,''editar_cadastro'')) with check (pode(organization_id,''editar_cadastro''))', t);
    execute format('create policy "excluir" on public.%I for delete to authenticated using (has_org_role(organization_id,''admin''))', t);
  end loop;
end $$;

create policy "ler" on public.produto_custos for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.produto_custos for insert to authenticated with check (pode(organization_id,'importar_catalogo'));

create policy "ler" on public.config_orcamento for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.config_orcamento for insert to authenticated with check (has_org_role(organization_id,'admin'));
create policy "editar" on public.config_orcamento for update to authenticated using (has_org_role(organization_id,'admin')) with check (has_org_role(organization_id,'admin'));

create policy "ler" on public.regras_versionadas for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.regras_versionadas for insert to authenticated with check (pode(organization_id,'importar_catalogo'));
create policy "editar" on public.regras_versionadas for update to authenticated using (pode(organization_id,'aprovar_tecnica')) with check (pode(organization_id,'aprovar_tecnica'));

create policy "ler" on public.propostas for select to authenticated using (is_member(organization_id));
create policy "criar" on public.propostas for insert to authenticated with check (pode(organization_id,'criar_proposta'));
create policy "editar" on public.propostas for update to authenticated using (pode(organization_id,'editar_revisao')) with check (pode(organization_id,'editar_revisao'));
create policy "excluir" on public.propostas for delete to authenticated using (has_org_role(organization_id,'admin'));

-- revisões contêm totais/margens/parâmetros internos
create policy "ler" on public.proposta_revisoes for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.proposta_revisoes for insert to authenticated with check (pode(organization_id,'editar_revisao'));
create policy "editar" on public.proposta_revisoes for update to authenticated using (pode(organization_id,'editar_revisao') or pode(organization_id,'aceitar_comercial')) with check (pode(organization_id,'editar_revisao') or pode(organization_id,'aceitar_comercial'));

create policy "ler" on public.revisao_componentes for select to authenticated using (pode(organization_id,'ver_custos'));
do $$ declare t text; begin
  foreach t in array array['revisao_componentes','sistemas_dimensionados','sistema_componentes'] loop
    if t <> 'revisao_componentes' then
      execute format('create policy "ler" on public.%I for select to authenticated using (is_member(organization_id))', t);
    end if;
    execute format('create policy "criar" on public.%I for insert to authenticated with check (pode(organization_id,''editar_revisao''))', t);
    execute format('create policy "editar" on public.%I for update to authenticated using (pode(organization_id,''editar_revisao'')) with check (pode(organization_id,''editar_revisao''))', t);
    execute format('create policy "excluir" on public.%I for delete to authenticated using (pode(organization_id,''editar_revisao''))', t);
  end loop;
end $$;

create policy "ler" on public.calculo_execucoes for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.calculo_execucoes for insert to authenticated with check (pode(organization_id,'editar_revisao'));

create policy "ler" on public.demandas for select to authenticated using (is_member(organization_id));
create policy "criar" on public.demandas for insert to authenticated with check (pode(organization_id,'planejar_suprimentos'));
create policy "editar" on public.demandas for update to authenticated using (pode(organization_id,'planejar_suprimentos')) with check (pode(organization_id,'planejar_suprimentos'));

create policy "ler" on public.ordens_compra for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.ordens_compra for insert to authenticated with check (pode(organization_id,'emitir_ordem'));
create policy "editar" on public.ordens_compra for update to authenticated using (pode(organization_id,'emitir_ordem')) with check (pode(organization_id,'emitir_ordem'));
create policy "ler" on public.ordem_compra_itens for select to authenticated using (pode(organization_id,'ver_custos'));
create policy "criar" on public.ordem_compra_itens for insert to authenticated with check (pode(organization_id,'emitir_ordem'));
create policy "editar" on public.ordem_compra_itens for update to authenticated using (pode(organization_id,'emitir_ordem')) with check (pode(organization_id,'emitir_ordem'));

create policy "ler" on public.ordens_producao for select to authenticated using (is_member(organization_id));
create policy "criar" on public.ordens_producao for insert to authenticated with check (pode(organization_id,'planejar_suprimentos'));
create policy "editar" on public.ordens_producao for update to authenticated using (pode(organization_id,'planejar_suprimentos')) with check (pode(organization_id,'planejar_suprimentos'));
create policy "ler" on public.ordem_producao_itens for select to authenticated using (is_member(organization_id));
create policy "criar" on public.ordem_producao_itens for insert to authenticated with check (pode(organization_id,'planejar_suprimentos'));
create policy "editar" on public.ordem_producao_itens for update to authenticated using (pode(organization_id,'planejar_suprimentos')) with check (pode(organization_id,'planejar_suprimentos'));

-- movimentos: leitura por membros; escrita apenas pela RPC registrar_movimento
create policy "ler" on public.recebimentos for select to authenticated using (is_member(organization_id));
create policy "ler" on public.apontamentos for select to authenticated using (is_member(organization_id));

create policy "ler" on public.projetos for select to authenticated using (is_member(organization_id));
create policy "criar" on public.projetos for insert to authenticated with check (pode(organization_id,'aceitar_comercial'));
create policy "editar" on public.projetos for update to authenticated using (pode(organization_id,'aceitar_comercial')) with check (pode(organization_id,'aceitar_comercial'));

create policy "ler" on public.documentos for select to authenticated
  using (is_member(organization_id) and (interno = false or pode(organization_id,'ver_custos')));
create policy "criar" on public.documentos for insert to authenticated
  with check (pode(organization_id,'editar_revisao') and emitido_por = auth.uid());

create policy "ler" on public.auditoria for select to authenticated using (has_org_role(organization_id,'admin'));
create policy "criar" on public.auditoria for insert to authenticated with check (is_member(organization_id) and autor = auth.uid());

-- ============ 2. Integridade de relacionamento ============
create or replace function public.validar_vinculos() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if tg_table_name = 'propostas' then
    if not exists(select 1 from clientes where id=new.cliente_id and organization_id=new.organization_id) then raise exception 'Cliente de outra organização'; end if;
    if new.unidade_id is not null and not exists(select 1 from unidades where id=new.unidade_id and cliente_id=new.cliente_id) then raise exception 'Unidade não pertence ao cliente'; end if;
    if new.contato_id is not null and not exists(select 1 from contatos where id=new.contato_id and cliente_id=new.cliente_id) then raise exception 'Contato não pertence ao cliente'; end if;
  elsif tg_table_name in ('unidades','contatos') then
    if not exists(select 1 from clientes where id=new.cliente_id and organization_id=new.organization_id) then raise exception 'Cliente de outra organização'; end if;
  elsif tg_table_name = 'proposta_revisoes' then
    if not exists(select 1 from propostas where id=new.proposta_id and organization_id=new.organization_id) then raise exception 'Proposta de outra organização'; end if;
  elsif tg_table_name in ('sistemas_dimensionados','revisao_componentes') then
    if not exists(select 1 from proposta_revisoes where id=new.revisao_id and organization_id=new.organization_id) then raise exception 'Revisão de outra organização'; end if;
  elsif tg_table_name = 'sistema_componentes' then
    select exists(select 1 from sistemas_dimensionados s join revisao_componentes rc on rc.revisao_id=s.revisao_id
      where s.id=new.sistema_id and rc.id=new.revisao_componente_id and s.revisao_id=new.revisao_id and s.organization_id=new.organization_id) into ok;
    if not ok then raise exception 'Sistema/componente não pertencem à revisão'; end if;
  elsif tg_table_name = 'demandas' then
    if not exists(select 1 from revisao_componentes where id=new.revisao_componente_id and revisao_id=new.revisao_id and organization_id=new.organization_id) then raise exception 'Componente não pertence à revisão'; end if;
  elsif tg_table_name = 'ordem_compra_itens' then
    if not exists(select 1 from ordens_compra o join demandas d on d.revisao_id=o.revisao_id
      where o.id=new.ordem_id and d.id=new.demanda_id and o.organization_id=new.organization_id) then raise exception 'Demanda não pertence à revisão da OC'; end if;
  elsif tg_table_name = 'ordem_producao_itens' then
    if not exists(select 1 from ordens_producao o join demandas d on d.revisao_id=o.revisao_id
      where o.id=new.ordem_id and d.id=new.demanda_id and o.organization_id=new.organization_id) then raise exception 'Demanda não pertence à revisão da OP'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['propostas','unidades','contatos','proposta_revisoes','sistemas_dimensionados','revisao_componentes','sistema_componentes','demandas','ordem_compra_itens','ordem_producao_itens'] loop
    execute format('create trigger validar_vinculos before insert or update on public.%I for each row execute function public.validar_vinculos()', t);
  end loop;
end $$;

-- peças indivisíveis não recebem override fracionado
create or replace function public.validar_indivisivel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.override_quantidade is not null then
    if new.override_quantidade < 0 then raise exception 'Quantidade negativa'; end if;
    if exists(select 1 from revisao_componentes where id=new.revisao_componente_id and indivisivel)
       and new.override_quantidade <> trunc(new.override_quantidade) then
      raise exception 'Peça indivisível não aceita quantidade fracionada';
    end if;
    if coalesce(trim(new.override_justificativa),'') = '' then raise exception 'Ajuste manual exige justificativa'; end if;
  end if;
  return new;
end $$;
create trigger validar_indivisivel before insert or update on public.sistema_componentes for each row execute function public.validar_indivisivel();

-- ============ 3. Estados e imutabilidade ============
create or replace function public.revisao_transicao() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status='rascunho' and new.status in ('em_revisao','enviada'))
         or (old.status='em_revisao' and new.status in ('rascunho','enviada'))
         or (old.status='enviada' and new.status in ('aceita','recusada','substituida'))
         or (old.status='aceita' and new.status='substituida')) then
      raise exception 'Transição de % para % não permitida', old.status, new.status;
    end if;
    if new.status in ('enviada') and (old.desatualizada or old.totais is null) then
      raise exception 'Revisão sem cálculo atual não pode ser enviada';
    end if;
  end if;
  if old.status not in ('rascunho','em_revisao') and (
       new.totais is distinct from old.totais or new.regras_snapshot is distinct from old.regras_snapshot
    or new.regras_id is distinct from old.regras_id or new.calculado_em is distinct from old.calculado_em
    or new.proposta_id is distinct from old.proposta_id or new.numero is distinct from old.numero
    or new.desatualizada is distinct from old.desatualizada) then
    raise exception 'Revisão emitida é imutável. Crie nova revisão.';
  end if;
  return new;
end $$;
create trigger revisao_transicao before update on public.proposta_revisoes for each row execute function public.revisao_transicao();

create trigger rc_editavel_del before delete on public.revisao_componentes for each row execute function public.exigir_revisao_editavel();
create trigger sc_editavel_del before delete on public.sistema_componentes for each row execute function public.exigir_revisao_editavel();
create trigger sd_editavel_del before delete on public.sistemas_dimensionados for each row execute function public.exigir_revisao_editavel();

-- ordens: conteúdo congelado após emissão/liberação; saldos só via RPC
create or replace function public.ordem_cabecalho_imutavel() returns trigger
language plpgsql set search_path = public as $$
declare travado text[] := array['emitida','liberada','concluida','cancelada'];
begin
  if old.status = any(travado) then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Ordem emitida/liberada é imutável; use aditivo ou cancelamento';
    end if;
    if new.status is distinct from old.status and not (new.status in ('concluida','cancelada') and old.status in ('emitida','liberada')) then
      raise exception 'Transição de ordem não permitida';
    end if;
  end if;
  return new;
end $$;
create trigger oc_imutavel before update on public.ordens_compra for each row execute function public.ordem_cabecalho_imutavel();
create trigger op_imutavel before update on public.ordens_producao for each row execute function public.ordem_cabecalho_imutavel();

create or replace function public.ordem_item_imutavel() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; acum text[];
begin
  if tg_table_name = 'ordem_compra_itens' then
    select status into st from ordens_compra where id = coalesce(new.ordem_id, old.ordem_id);
    acum := array['quantidade_recebida','quantidade_cancelada'];
  else
    select status into st from ordens_producao where id = coalesce(new.ordem_id, old.ordem_id);
    acum := array['quantidade_produzida'];
  end if;
  if tg_op in ('INSERT','DELETE') then
    if st <> 'rascunho' then raise exception 'Itens de ordem emitida/liberada não podem ser incluídos ou excluídos'; end if;
    return coalesce(new, old);
  end if;
  if (to_jsonb(new) - acum) is distinct from (to_jsonb(old) - acum) and st <> 'rascunho' then
    raise exception 'Item de ordem emitida/liberada é imutável';
  end if;
  if (to_jsonb(new) - (to_jsonb(new) - acum) ) is distinct from (to_jsonb(old) - (to_jsonb(old) - acum))
     and coalesce(current_setting('nexus.movimento', true),'') <> '1' then
    raise exception 'Saldos só mudam por movimento registrado';
  end if;
  return new;
end $$;
create trigger oci_imutavel before insert or update or delete on public.ordem_compra_itens for each row execute function public.ordem_item_imutavel();
create trigger opi_imutavel before insert or update or delete on public.ordem_producao_itens for each row execute function public.ordem_item_imutavel();

-- permitir complementos legítimos
alter table public.ordens_compra drop constraint if exists ordens_compra_revisao_id_fornecedor_id_key;
alter table public.ordens_producao drop constraint if exists ordens_producao_revisao_id_key;

-- ============ 4. Aprovações vinculadas a hash ============
create table public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  revisao_id uuid not null references public.proposta_revisoes(id),
  tipo text not null check (tipo in ('tecnica','comercial_interna','aceite_cliente','liberacao_operacional')),
  hash_conteudo text not null,
  autor uuid not null,
  observacao text,
  invalidada_em timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert on public.aprovacoes to authenticated;
grant all on public.aprovacoes to service_role;
alter table public.aprovacoes enable row level security;
create policy "ler" on public.aprovacoes for select to authenticated using (is_member(organization_id));
create policy "criar" on public.aprovacoes for insert to authenticated with check (
  autor = auth.uid() and case tipo
    when 'tecnica' then pode(organization_id,'aprovar_tecnica')
    when 'comercial_interna' then pode(organization_id,'aceitar_comercial')
    when 'aceite_cliente' then pode(organization_id,'aceitar_comercial')
    else pode(organization_id,'planejar_suprimentos') end);

create or replace function public.hash_tecnico(_rev uuid) returns text
language sql stable security definer set search_path = public as $$
  select md5(coalesce(string_agg(s.tipo::text||':'||s.metragem||':'||s.trechos||'|'||rc.codigo||':'||coalesce(sc.override_quantidade, sc.quantidade), ';'
         order by s.ordem, rc.codigo),'') || coalesce((select regras_snapshot::text from proposta_revisoes where id=_rev),''))
  from sistemas_dimensionados s
  join sistema_componentes sc on sc.sistema_id = s.id
  join revisao_componentes rc on rc.id = sc.revisao_componente_id
  where s.revisao_id = _rev and public.is_member(s.organization_id);
$$;

create or replace function public.op_exige_aprovacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'liberada' and old.status is distinct from 'liberada' then
    if not exists(select 1 from aprovacoes a where a.revisao_id=new.revisao_id and a.tipo='tecnica'
                  and a.invalidada_em is null and a.hash_conteudo = public.hash_tecnico(new.revisao_id)) then
      raise exception 'Liberação exige aprovação técnica válida para a composição atual';
    end if;
  end if;
  return new;
end $$;
create trigger op_exige_aprovacao before update on public.ordens_producao for each row execute function public.op_exige_aprovacao();

-- ============ 5. Numeração atômica ============
create table public.numeracao (
  organization_id uuid not null references public.organizations(id),
  prefixo text not null,
  ano int not null,
  proximo int not null default 1,
  primary key (organization_id, prefixo, ano)
);
grant all on public.numeracao to service_role;
alter table public.numeracao enable row level security;

create or replace function public.proximo_numero(_org uuid, _prefixo text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; y int := extract(year from now())::int;
begin
  if not public.is_member(_org) then raise exception 'sem acesso'; end if;
  if _prefixo not in ('OC','OP') then raise exception 'prefixo inválido'; end if;
  insert into numeracao(organization_id,prefixo,ano,proximo) values (_org,_prefixo,y,2)
    on conflict (organization_id,prefixo,ano) do update set proximo = numeracao.proximo + 1
    returning proximo - 1 into n;
  return _prefixo || '-' || y || '-' || lpad(n::text, 3, '0');
end $$;

-- ============ 6. Movimentos atômicos e idempotentes ============
alter table public.recebimentos add column chave text, add column estorno_de uuid references public.recebimentos(id), add column sinal smallint not null default 1 check (sinal in (1,-1));
alter table public.apontamentos add column chave text, add column estorno_de uuid references public.apontamentos(id), add column sinal smallint not null default 1 check (sinal in (1,-1));
create unique index recebimentos_chave on public.recebimentos(organization_id, chave) where chave is not null;
create unique index apontamentos_chave on public.apontamentos(organization_id, chave) where chave is not null;

create or replace function public.registrar_movimento(_tipo text, _item uuid, _quantidade numeric, _chave text, _estorno_de uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org uuid; st text; qtd numeric; acum numeric; canc numeric := 0; indiv boolean; mov uuid; prev record; sinal smallint := 1; saldo numeric;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if _quantidade is null or _quantidade <= 0 or _quantidade > 1e9 then raise exception 'Quantidade inválida'; end if;
  if coalesce(trim(_chave),'') = '' then raise exception 'Chave idempotente obrigatória'; end if;
  if _estorno_de is not null then sinal := -1; end if;

  if _tipo = 'recebimento' then
    select i.organization_id, o.status, i.quantidade, i.quantidade_recebida, i.quantidade_cancelada, rc.indivisivel
      into org, st, qtd, acum, canc, indiv
      from ordem_compra_itens i join ordens_compra o on o.id=i.ordem_id
      join demandas d on d.id=i.demanda_id join revisao_componentes rc on rc.id=d.revisao_componente_id
      where i.id=_item for update of i;
    if org is null then raise exception 'Item não encontrado'; end if;
    if not pode(org,'receber') then raise exception 'Acesso negado'; end if;
    select id, item_id, quantidade, sinal, estorno_de into prev from recebimentos where organization_id=org and chave=_chave;
  elsif _tipo = 'apontamento' then
    select i.organization_id, o.status, i.quantidade, i.quantidade_produzida, rc.indivisivel
      into org, st, qtd, acum, indiv
      from ordem_producao_itens i join ordens_producao o on o.id=i.ordem_id
      join demandas d on d.id=i.demanda_id join revisao_componentes rc on rc.id=d.revisao_componente_id
      where i.id=_item for update of i;
    if org is null then raise exception 'Item não encontrado'; end if;
    if not pode(org,'produzir') then raise exception 'Acesso negado'; end if;
    select id, item_id, quantidade, sinal, estorno_de into prev from apontamentos where organization_id=org and chave=_chave;
  else raise exception 'Tipo inválido'; end if;

  if prev.id is not null then
    if prev.item_id = _item and prev.quantidade = _quantidade and prev.sinal = sinal and prev.estorno_de is not distinct from _estorno_de then
      return jsonb_build_object('id', prev.id, 'repetido', true);
    end if;
    raise exception 'Chave já usada com dados diferentes' using errcode = '23505';
  end if;

  if st not in ('emitida','liberada') then raise exception 'Ordem em estado incompatível (%)', st; end if;
  if indiv and _quantidade <> trunc(_quantidade) then raise exception 'Peça indivisível não aceita fração'; end if;

  if sinal = 1 then
    saldo := qtd - acum - canc;
    if _quantidade > saldo then raise exception 'Quantidade acima do saldo (%)', saldo; end if;
  else
    if _tipo = 'recebimento' then
      if not exists(select 1 from recebimentos where id=_estorno_de and item_id=_item and sinal=1) then raise exception 'Movimento original inválido'; end if;
      if _quantidade > (select quantidade from recebimentos where id=_estorno_de) - coalesce((select sum(quantidade) from recebimentos where estorno_de=_estorno_de),0) then raise exception 'Estorno acima do movimento original'; end if;
    else
      if not exists(select 1 from apontamentos where id=_estorno_de and item_id=_item and sinal=1) then raise exception 'Movimento original inválido'; end if;
      if _quantidade > (select quantidade from apontamentos where id=_estorno_de) - coalesce((select sum(quantidade) from apontamentos where estorno_de=_estorno_de),0) then raise exception 'Estorno acima do movimento original'; end if;
    end if;
  end if;

  perform set_config('nexus.movimento','1',true);
  if _tipo = 'recebimento' then
    insert into recebimentos(organization_id,item_id,quantidade,created_by,chave,estorno_de,sinal)
      values (org,_item,_quantidade,auth.uid(),_chave,_estorno_de,sinal) returning id into mov;
    update ordem_compra_itens set quantidade_recebida = quantidade_recebida + sinal*_quantidade where id=_item;
  else
    insert into apontamentos(organization_id,item_id,quantidade,created_by,chave,estorno_de,sinal)
      values (org,_item,_quantidade,auth.uid(),_chave,_estorno_de,sinal) returning id into mov;
    update ordem_producao_itens set quantidade_produzida = quantidade_produzida + sinal*_quantidade where id=_item;
  end if;
  perform set_config('nexus.movimento','',true);
  insert into auditoria(organization_id,entidade,entidade_id,acao,dados,autor)
    values (org,_tipo,mov,case when sinal=1 then 'registrar' else 'estornar' end,
      jsonb_build_object('item',_item,'quantidade',_quantidade,'chave',_chave,'estorno_de',_estorno_de),auth.uid());
  return jsonb_build_object('id', mov, 'repetido', false);
end $$;

-- ============ 7. Grants mínimos de funções ============
revoke execute on all functions in schema public from public, anon;
grant execute on function public.pode(uuid,text), public.is_member(uuid), public.has_org_role(uuid,app_role),
  public.can_see_costs(uuid), public.revisao_editavel(uuid), public.criar_organizacao(text),
  public.proximo_numero_proposta(uuid), public.proximo_numero(uuid,text), public.hash_tecnico(uuid),
  public.registrar_movimento(text,uuid,numeric,text,uuid) to authenticated;
