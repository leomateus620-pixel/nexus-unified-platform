
create or replace function public.ordem_item_imutavel() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; acum text[]; a text; mudou_acum boolean := false;
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
    if tg_op = 'INSERT' then
      foreach a in array acum loop
        if coalesce((to_jsonb(new)->>a)::numeric,0) <> 0 then raise exception 'Saldos só mudam por movimento registrado'; end if;
      end loop;
    end if;
    return coalesce(new, old);
  end if;
  if (to_jsonb(new) - acum) is distinct from (to_jsonb(old) - acum) and st <> 'rascunho' then
    raise exception 'Item de ordem emitida/liberada é imutável';
  end if;
  foreach a in array acum loop
    if (to_jsonb(new)->a) is distinct from (to_jsonb(old)->a) then mudou_acum := true; end if;
  end loop;
  if mudou_acum and coalesce(current_setting('nexus.movimento', true),'') <> '1' then
    raise exception 'Saldos só mudam por movimento registrado';
  end if;
  return new;
end $$;

create or replace function public.registrar_movimento(_tipo text, _item uuid, _quantidade numeric, _chave text, _estorno_de uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org uuid; st text; qtd numeric; acum numeric; canc numeric := 0; indiv boolean; mov uuid; prev record; _sinal smallint := 1; saldo numeric; orig numeric; ja numeric;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if _quantidade is null or _quantidade <= 0 or _quantidade > 1e9 then raise exception 'Quantidade inválida'; end if;
  if coalesce(trim(_chave),'') = '' then raise exception 'Chave idempotente obrigatória'; end if;
  if _estorno_de is not null then _sinal := -1; end if;

  if _tipo = 'recebimento' then
    select i.organization_id, o.status, i.quantidade, i.quantidade_recebida, i.quantidade_cancelada, rc.indivisivel
      into org, st, qtd, acum, canc, indiv
      from ordem_compra_itens i join ordens_compra o on o.id=i.ordem_id
      join demandas d on d.id=i.demanda_id join revisao_componentes rc on rc.id=d.revisao_componente_id
      where i.id=_item for update of i;
    if org is null then raise exception 'Item não encontrado'; end if;
    if not pode(org,'receber') then raise exception 'Acesso negado'; end if;
    select r.id, r.item_id, r.quantidade, r.sinal, r.estorno_de into prev from recebimentos r where r.organization_id=org and r.chave=_chave;
  elsif _tipo = 'apontamento' then
    select i.organization_id, o.status, i.quantidade, i.quantidade_produzida, rc.indivisivel
      into org, st, qtd, acum, indiv
      from ordem_producao_itens i join ordens_producao o on o.id=i.ordem_id
      join demandas d on d.id=i.demanda_id join revisao_componentes rc on rc.id=d.revisao_componente_id
      where i.id=_item for update of i;
    if org is null then raise exception 'Item não encontrado'; end if;
    if not pode(org,'produzir') then raise exception 'Acesso negado'; end if;
    select r.id, r.item_id, r.quantidade, r.sinal, r.estorno_de into prev from apontamentos r where r.organization_id=org and r.chave=_chave;
  else raise exception 'Tipo inválido'; end if;

  if prev.id is not null then
    if prev.item_id = _item and prev.quantidade = _quantidade and prev.sinal = _sinal and prev.estorno_de is not distinct from _estorno_de then
      return jsonb_build_object('id', prev.id, 'repetido', true);
    end if;
    raise exception 'Chave já usada com dados diferentes' using errcode = '23505';
  end if;

  if st not in ('emitida','liberada') then raise exception 'Ordem em estado incompatível (%)', st; end if;
  if indiv and _quantidade <> trunc(_quantidade) then raise exception 'Peça indivisível não aceita fração'; end if;

  if _sinal = 1 then
    saldo := qtd - acum - canc;
    if _quantidade > saldo then raise exception 'Quantidade acima do saldo (%)', saldo; end if;
  else
    if _tipo = 'recebimento' then
      select r.quantidade into orig from recebimentos r where r.id=_estorno_de and r.item_id=_item and r.sinal=1;
      select coalesce(sum(r.quantidade),0) into ja from recebimentos r where r.estorno_de=_estorno_de;
    else
      select r.quantidade into orig from apontamentos r where r.id=_estorno_de and r.item_id=_item and r.sinal=1;
      select coalesce(sum(r.quantidade),0) into ja from apontamentos r where r.estorno_de=_estorno_de;
    end if;
    if orig is null then raise exception 'Movimento original inválido'; end if;
    if _quantidade > orig - ja then raise exception 'Estorno acima do movimento original'; end if;
  end if;

  perform set_config('nexus.movimento','1',true);
  if _tipo = 'recebimento' then
    insert into recebimentos(organization_id,item_id,quantidade,created_by,chave,estorno_de,sinal)
      values (org,_item,_quantidade,auth.uid(),_chave,_estorno_de,_sinal) returning id into mov;
    update ordem_compra_itens set quantidade_recebida = quantidade_recebida + _sinal*_quantidade where id=_item;
  else
    insert into apontamentos(organization_id,item_id,quantidade,created_by,chave,estorno_de,sinal)
      values (org,_item,_quantidade,auth.uid(),_chave,_estorno_de,_sinal) returning id into mov;
    update ordem_producao_itens set quantidade_produzida = quantidade_produzida + _sinal*_quantidade where id=_item;
  end if;
  perform set_config('nexus.movimento','',true);
  insert into auditoria(organization_id,entidade,entidade_id,acao,dados,autor)
    values (org,_tipo,mov,case when _sinal=1 then 'registrar' else 'estornar' end,
      jsonb_build_object('item',_item,'quantidade',_quantidade,'chave',_chave,'estorno_de',_estorno_de),auth.uid());
  return jsonb_build_object('id', mov, 'repetido', false);
end $$;
revoke execute on function public.ordem_item_imutavel() from public, anon, authenticated;
