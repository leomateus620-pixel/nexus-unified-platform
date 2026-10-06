-- Idempotência por contexto (organização + revisão + chave), escopo explícito, prévia compartilhada,
-- revisão de rascunho de OP com fingerprint antigo e trava compartilhada edição/demanda/geração.
ALTER TABLE public.geracao_ordens ADD COLUMN IF NOT EXISTS chave_operacao text;
ALTER TABLE public.geracao_ordens ADD COLUMN IF NOT EXISTS escopo text;
ALTER TABLE public.geracao_ordens ADD COLUMN IF NOT EXISTS pedido_hash text;
UPDATE public.geracao_ordens SET chave_operacao = chave WHERE chave_operacao IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS geracao_ordens_contexto_uk ON public.geracao_ordens(organization_id, revisao_id, chave_operacao);
COMMENT ON COLUMN public.geracao_ordens.chave IS 'Chave técnica interna (org:revisão:chave). Lookup de idempotência usa organization_id + revisao_id + chave_operacao.';

-- Trava única por revisão, usada por edição da proposta, atualização da demanda e geração/revisão de ordens.
CREATE OR REPLACE FUNCTION public.travar_revisao(_rev uuid)
RETURNS void LANGUAGE sql VOLATILE SET search_path TO 'public' AS $$
  select pg_advisory_xact_lock(hashtext('revisao:'||_rev::text));
$$;
GRANT EXECUTE ON FUNCTION public.travar_revisao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trava_revisao_edicao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if tg_op = 'DELETE' then perform public.travar_revisao(old.revisao_id); return old; end if;
  perform public.travar_revisao(new.revisao_id);
  if tg_op = 'UPDATE' and old.revisao_id is distinct from new.revisao_id then perform public.travar_revisao(old.revisao_id); end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_trava_revisao ON public.revisao_componentes;
CREATE TRIGGER trg_trava_revisao BEFORE INSERT OR UPDATE OR DELETE ON public.revisao_componentes FOR EACH ROW EXECUTE FUNCTION public.trava_revisao_edicao();
DROP TRIGGER IF EXISTS trg_trava_revisao ON public.sistema_componentes;
CREATE TRIGGER trg_trava_revisao BEFORE INSERT OR UPDATE OR DELETE ON public.sistema_componentes FOR EACH ROW EXECUTE FUNCTION public.trava_revisao_edicao();
DROP TRIGGER IF EXISTS trg_trava_revisao ON public.sistemas_dimensionados;
CREATE TRIGGER trg_trava_revisao BEFORE INSERT OR UPDATE OR DELETE ON public.sistemas_dimensionados FOR EACH ROW EXECUTE FUNCTION public.trava_revisao_edicao();

-- Quantidade-alvo de cada item de um rascunho de OP: saldo da demanda atual menos compromissos de outras ordens.
CREATE OR REPLACE FUNCTION public._alvos_rascunho_op(_op uuid)
RETURNS TABLE(demanda_id uuid, codigo text, atual numeric, produzida numeric, alvo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select dm.id, rc.codigo, coalesce(i.quantidade,0), coalesce(i.quantidade_produzida,0),
    greatest(coalesce(i.quantidade_produzida,0),
      case when rc.multiplo_compra > 0 then ceil(greatest(dm.quantidade_planejada - z.outros,0) / rc.multiplo_compra) * rc.multiplo_compra
           when rc.indivisivel then ceil(greatest(dm.quantidade_planejada - z.outros,0))
           else greatest(dm.quantidade_planejada - z.outros,0) end)
  from demandas dm
  join revisao_componentes rc on rc.id = dm.revisao_componente_id
  left join ordem_producao_itens i on i.ordem_id = _op and i.demanda_id = dm.id
  cross join lateral (select coalesce(sum(x.quantidade),0) outros from ordem_producao_itens x join ordens_producao o on o.id = x.ordem_id
                      where x.demanda_id = dm.id and o.status <> 'cancelada' and o.id <> _op) z
  where dm.revisao_id = (select revisao_id from ordens_producao where id = _op)
    and (dm.modalidade = 'fabricar' or i.id is not null)
  order by rc.codigo;
$$;
REVOKE ALL ON FUNCTION public._alvos_rascunho_op(uuid) FROM public, anon, authenticated;

-- Plano único: usado pela prévia e pela execução. Não grava nada.
CREATE OR REPLACE FUNCTION public._plano_ordens(_rev uuid, _escopo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  r record; d record; v_hash text; bloq text; saldo numeric; q numeric; v_dest uuid;
  linhas jsonb := '[]'; faltas jsonb := '[]'; ops jsonb := '[]';
begin
  select * into r from proposta_revisoes where id = _rev;
  v_hash := public.hash_tecnico(_rev);
  if r.status in ('recusada','substituida') then bloq := 'Revisão recusada ou substituída não gera ordens';
  elsif r.desatualizada then bloq := 'Recalcule a revisão antes de gerar ordens';
  elsif not exists(select 1 from demandas where revisao_id = _rev) then bloq := 'Planeje a demanda antes de gerar ordens';
  elsif exists(select 1 from demandas where revisao_id = _rev and hash_tecnico is distinct from v_hash) then
    bloq := 'A composição técnica mudou desde o planejamento. Use Atualizar demanda antes de gerar ordens';
  end if;
  if _escopo <> 'compra' then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero,
             'itens', (select coalesce(jsonb_agg(jsonb_build_object('demanda_id', a.demanda_id, 'codigo', a.codigo, 'atual', a.atual, 'alvo', a.alvo)), '[]')
                       from public._alvos_rascunho_op(o.id) a where a.atual <> a.alvo))
           order by o.numero), '[]') into ops
    from ordens_producao o where o.revisao_id = _rev and o.status = 'rascunho' and o.hash_tecnico is distinct from v_hash
      and exists(select 1 from ordem_producao_itens i where i.ordem_id = o.id);
  end if;
  for d in
    select dm.id, dm.modalidade::text modalidade, dm.quantidade_planejada, rc.codigo, rc.fornecedor_id, f.nome fornecedor,
           rc.custo_adotado, rc.multiplo_compra, rc.indivisivel,
           case when dm.modalidade = 'fabricar' then
             (select coalesce(sum(i.quantidade),0) from ordem_producao_itens i join ordens_producao o on o.id = i.ordem_id where i.demanda_id = dm.id and o.status <> 'cancelada')
           else
             (select coalesce(sum(i.quantidade - i.quantidade_cancelada),0) from ordem_compra_itens i join ordens_compra o on o.id = i.ordem_id where i.demanda_id = dm.id and o.status <> 'cancelada')
           end comp
    from demandas dm join revisao_componentes rc on rc.id = dm.revisao_componente_id
    left join fornecedores f on f.id = rc.fornecedor_id
    where dm.revisao_id = _rev
      and (_escopo = 'ambas' or (_escopo = 'producao') = (dm.modalidade = 'fabricar'))
    order by rc.fornecedor_id nulls last, rc.codigo, dm.id
  loop
    saldo := d.quantidade_planejada - d.comp;
    if saldo <= 0 then continue; end if;
    if d.modalidade <> 'fabricar' and d.fornecedor_id is null then faltas := faltas || to_jsonb(d.codigo); continue; end if;
    q := case when d.multiplo_compra > 0 then ceil(saldo / d.multiplo_compra) * d.multiplo_compra
              when d.indivisivel then ceil(saldo) else saldo end;
    v_dest := null;
    if d.modalidade = 'fabricar' then
      select id into v_dest from ordens_producao where revisao_id = _rev and status = 'rascunho' and hash_tecnico = v_hash order by created_at limit 1;
    else
      select id into v_dest from ordens_compra where revisao_id = _rev and fornecedor_id = d.fornecedor_id and status = 'rascunho' order by created_at limit 1;
    end if;
    linhas := linhas || jsonb_build_object('demanda_id', d.id, 'tipo', case when d.modalidade = 'fabricar' then 'OP' else 'OC' end,
      'codigo', d.codigo, 'fornecedor_id', d.fornecedor_id, 'fornecedor', d.fornecedor, 'saldo', saldo, 'quantidade', q,
      'destino', v_dest, 'custo', d.custo_adotado);
  end loop;
  return jsonb_build_object('escopo', _escopo, 'bloqueio', bloq, 'hash', v_hash, 'linhas', linhas, 'faltas', faltas,
    'ops_desatualizadas', ops,
    'oc_fornecedores', (select coalesce(jsonb_agg(distinct x->>'fornecedor'), '[]') from jsonb_array_elements(linhas) x where x->>'tipo' = 'OC'),
    'op', exists(select 1 from jsonb_array_elements(linhas) x where x->>'tipo' = 'OP'),
    'plano_hash', md5(_escopo || '|' || coalesce(bloq,'') || '|' || coalesce(v_hash,'') || '|' || linhas::text || '|' || faltas::text || '|' || ops::text));
end $$;
REVOKE ALL ON FUNCTION public._plano_ordens(uuid, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.planejar_ordens(_rev uuid, _escopo text DEFAULT 'ambas')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_org uuid;
begin
  if _escopo not in ('ambas','compra','producao') then raise exception 'Escopo inválido'; end if;
  select organization_id into v_org from proposta_revisoes where id = _rev;
  if v_org is null or not public.is_member(v_org) then raise exception 'Revisão não encontrada'; end if;
  return public._plano_ordens(_rev, _escopo);
end $$;
REVOKE ALL ON FUNCTION public.planejar_ordens(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.planejar_ordens(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.gerar_ordens(uuid, text);
CREATE OR REPLACE FUNCTION public.gerar_ordens(_rev uuid, _chave text, _escopo text DEFAULT 'ambas', _plano_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  r record; x record; v_org uuid; v_proj uuid; prev jsonb; v_prevped text; v_ped text; plano jsonb;
  v_id uuid; v_num text; v_acao text; v_novo boolean; v_hash text;
  v_ordens jsonb := '{}'::jsonb; v_itens int := 0; v_dem uuid[] := '{}'; res jsonb;
begin
  if _chave is null or length(_chave) < 8 then raise exception 'Chave de operação inválida'; end if;
  if _escopo not in ('ambas','compra','producao') then raise exception 'Escopo inválido'; end if;
  select organization_id into v_org from proposta_revisoes where id = _rev;
  if v_org is null or not public.is_member(v_org) then raise exception 'Revisão não encontrada'; end if;
  if not public.pode(v_org, 'emitir_ordem') then raise exception 'Permissão insuficiente para gerar ordens'; end if;
  perform public.travar_revisao(_rev);
  v_ped := md5('gerar|' || _escopo || '|' || coalesce(_plano_hash, ''));
  select resposta, pedido_hash into prev, v_prevped from geracao_ordens
    where organization_id = v_org and revisao_id = _rev and chave_operacao = _chave;
  if found then
    if v_prevped is not null and v_prevped <> v_ped then
      raise exception 'Esta chave de operação já foi usada para outro pedido nesta revisão';
    end if;
    return prev || '{"repetido":true}'::jsonb;
  end if;
  -- Estado relido dentro da trava: nenhuma edição/atualização de demanda concorrente pode estar em curso.
  select * into r from proposta_revisoes where id = _rev;
  plano := public._plano_ordens(_rev, _escopo);
  if plano->>'bloqueio' is not null then raise exception '%', plano->>'bloqueio'; end if;
  if jsonb_array_length(plano->'faltas') > 0 then
    raise exception 'Selecione fornecedor para: %', (select string_agg(value #>> '{}', ', ') from jsonb_array_elements(plano->'faltas'));
  end if;
  if jsonb_array_length(plano->'ops_desatualizadas') > 0 then
    raise exception 'Revise o rascunho % (composição antiga) antes de gerar ordens de produção',
      (select string_agg(value->>'numero', ', ') from jsonb_array_elements(plano->'ops_desatualizadas'));
  end if;
  if _plano_hash is not null and _plano_hash <> plano->>'plano_hash' then
    raise exception 'O planejamento mudou desde a prévia. Revise a prévia e confirme novamente';
  end if;
  v_hash := plano->>'hash';
  select id into v_proj from projetos where revisao_id = _rev limit 1;
  for x in select * from jsonb_to_recordset(plano->'linhas') as t(demanda_id uuid, tipo text, quantidade numeric, fornecedor_id uuid, custo numeric)
  loop
    v_novo := false; v_id := null;
    if x.tipo = 'OP' then
      select id, numero into v_id, v_num from ordens_producao
        where revisao_id = _rev and status = 'rascunho' and hash_tecnico = v_hash order by created_at limit 1;
      if v_id is null then
        v_num := public.proximo_numero(r.organization_id, 'OP');
        insert into ordens_producao(organization_id, numero, revisao_id, projeto_id, hash_tecnico)
          values (r.organization_id, v_num, _rev, v_proj, v_hash) returning id into v_id;
        v_novo := true;
      end if;
      if exists(select 1 from ordem_producao_itens where ordem_id = v_id and demanda_id = x.demanda_id) then
        update ordem_producao_itens set quantidade = quantidade + x.quantidade where ordem_id = v_id and demanda_id = x.demanda_id; v_acao := 'complementada';
      else
        insert into ordem_producao_itens(organization_id, ordem_id, demanda_id, quantidade) values (r.organization_id, v_id, x.demanda_id, x.quantidade);
        v_acao := 'reutilizada';
      end if;
    else
      select id, numero into v_id, v_num from ordens_compra
        where revisao_id = _rev and fornecedor_id = x.fornecedor_id and status = 'rascunho' order by created_at limit 1;
      if v_id is null then
        v_num := public.proximo_numero(r.organization_id, 'OC');
        insert into ordens_compra(organization_id, numero, revisao_id, projeto_id, fornecedor_id, hash_tecnico)
          values (r.organization_id, v_num, _rev, v_proj, x.fornecedor_id, v_hash) returning id into v_id;
        v_novo := true;
      else
        update ordens_compra set hash_tecnico = v_hash where id = v_id and hash_tecnico is distinct from v_hash;
      end if;
      if exists(select 1 from ordem_compra_itens where ordem_id = v_id and demanda_id = x.demanda_id) then
        update ordem_compra_itens set quantidade = quantidade + x.quantidade where ordem_id = v_id and demanda_id = x.demanda_id; v_acao := 'complementada';
      else
        insert into ordem_compra_itens(organization_id, ordem_id, demanda_id, quantidade, preco_unitario)
          values (r.organization_id, v_id, x.demanda_id, x.quantidade, x.custo);
        v_acao := 'reutilizada';
      end if;
    end if;
    if v_novo or v_ordens->v_id::text->>'acao' = 'criada' then v_acao := 'criada';
    elsif v_ordens->v_id::text->>'acao' = 'complementada' then v_acao := 'complementada'; end if;
    v_ordens := jsonb_set(v_ordens, array[v_id::text], jsonb_build_object('id', v_id, 'tipo', x.tipo, 'numero', v_num, 'acao', v_acao));
    v_itens := v_itens + 1; v_dem := v_dem || x.demanda_id;
  end loop;
  update demandas set status = 'alocada' where id = any(v_dem) and status = 'planejada';
  res := jsonb_build_object('ordens', coalesce((select jsonb_agg(value order by value->>'tipo', value->>'numero') from jsonb_each(v_ordens)), '[]'::jsonb),
                            'itens', v_itens, 'hash', v_hash, 'escopo', _escopo, 'plano_hash', plano->>'plano_hash');
  insert into geracao_ordens(chave, chave_operacao, organization_id, revisao_id, escopo, pedido_hash, resposta, autor)
    values (v_org::text || ':' || _rev::text || ':' || _chave, _chave, v_org, _rev, _escopo, v_ped, res, auth.uid());
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (r.organization_id, 'revisao', _rev, 'gerar_ordens', res, auth.uid());
  return res;
end $$;
REVOKE ALL ON FUNCTION public.gerar_ordens(uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gerar_ordens(uuid, text, text, text) TO authenticated;

-- Revisão de rascunho de OP com fingerprint antigo: ajusta o próprio rascunho ao saldo atual, grava o novo fingerprint.
CREATE OR REPLACE FUNCTION public.revisar_rascunho_op(_op uuid, _chave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  o record; r record; a record; v_hash text; prev jsonb; v_prevped text; v_ped text; mudancas jsonb := '[]'; res jsonb;
begin
  if _chave is null or length(_chave) < 8 then raise exception 'Chave de operação inválida'; end if;
  select * into o from ordens_producao where id = _op;
  if not found or not public.is_member(o.organization_id) then raise exception 'Ordem não encontrada'; end if;
  if not public.pode(o.organization_id, 'emitir_ordem') then raise exception 'Permissão insuficiente para revisar ordens'; end if;
  perform public.travar_revisao(o.revisao_id);
  v_ped := md5('revisar_op|' || _op::text);
  select resposta, pedido_hash into prev, v_prevped from geracao_ordens
    where organization_id = o.organization_id and revisao_id = o.revisao_id and chave_operacao = _chave;
  if found then
    if v_prevped is distinct from v_ped then raise exception 'Esta chave de operação já foi usada para outro pedido nesta revisão'; end if;
    return prev || '{"repetido":true}'::jsonb;
  end if;
  select * into o from ordens_producao where id = _op;
  if o.status <> 'rascunho' then raise exception 'Só rascunhos podem ser revisados; a ordem % está %', o.numero, o.status; end if;
  select * into r from proposta_revisoes where id = o.revisao_id;
  if r.desatualizada then raise exception 'Recalcule a revisão antes de revisar o rascunho'; end if;
  v_hash := public.hash_tecnico(o.revisao_id);
  if exists(select 1 from demandas where revisao_id = o.revisao_id and hash_tecnico is distinct from v_hash) then
    raise exception 'A composição técnica mudou desde o planejamento. Use Atualizar demanda antes de revisar o rascunho';
  end if;
  for a in select * from public._alvos_rascunho_op(_op) loop
    if a.atual = a.alvo then continue; end if;
    mudancas := mudancas || jsonb_build_object('demanda_id', a.demanda_id, 'codigo', a.codigo, 'antes', a.atual, 'depois', a.alvo);
    if a.alvo = 0 then
      delete from ordem_producao_itens where ordem_id = _op and demanda_id = a.demanda_id;
    elsif exists(select 1 from ordem_producao_itens where ordem_id = _op and demanda_id = a.demanda_id) then
      update ordem_producao_itens set quantidade = a.alvo where ordem_id = _op and demanda_id = a.demanda_id;
    else
      insert into ordem_producao_itens(organization_id, ordem_id, demanda_id, quantidade) values (o.organization_id, _op, a.demanda_id, a.alvo);
    end if;
  end loop;
  update ordens_producao set hash_tecnico = v_hash where id = _op;
  update demandas set status = 'alocada' where status = 'planejada'
    and id in (select demanda_id from ordem_producao_itens where ordem_id = _op);
  res := jsonb_build_object('ordem', jsonb_build_object('id', _op, 'numero', o.numero), 'hash_anterior', o.hash_tecnico, 'hash', v_hash, 'mudancas', mudancas);
  insert into geracao_ordens(chave, chave_operacao, organization_id, revisao_id, escopo, pedido_hash, resposta, autor)
    values (o.organization_id::text || ':' || o.revisao_id::text || ':' || _chave, _chave, o.organization_id, o.revisao_id, 'revisar_op', v_ped, res, auth.uid());
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (o.organization_id, 'ordem_producao', _op, 'revisar_rascunho', res, auth.uid());
  return res;
end $$;
REVOKE ALL ON FUNCTION public.revisar_rascunho_op(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revisar_rascunho_op(uuid, text) TO authenticated;

-- Atualização da demanda dentro da mesma trava, revalidando o fingerprint usado no cálculo.
CREATE OR REPLACE FUNCTION public.aplicar_demanda(_rev uuid, _hash text, _linhas jsonb, _remover uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare r record; v_org uuid; n int; m int;
begin
  select organization_id into v_org from proposta_revisoes where id = _rev;
  if v_org is null or not public.is_member(v_org) then raise exception 'Revisão não encontrada'; end if;
  if not public.pode(v_org, 'planejar_suprimentos') then raise exception 'Permissão insuficiente para planejar suprimentos'; end if;
  perform public.travar_revisao(_rev);
  select * into r from proposta_revisoes where id = _rev;
  if r.desatualizada then raise exception 'Recalcule a revisão antes de planejar a demanda'; end if;
  if public.hash_tecnico(_rev) is distinct from _hash then
    raise exception 'A proposta mudou durante a atualização da demanda. Atualize de novo';
  end if;
  insert into demandas(organization_id, revisao_id, revisao_componente_id, modalidade, quantidade_necessaria, quantidade_planejada,
                       hash_tecnico, anterior, quantidade_tecnica, origem)
  select v_org, _rev, t.revisao_componente_id, t.modalidade::modalidade_suprimento, t.quantidade_necessaria, t.quantidade_planejada,
         _hash, t.anterior, t.quantidade_tecnica, t.origem
  from jsonb_to_recordset(_linhas) as t(revisao_componente_id uuid, modalidade text, quantidade_necessaria numeric, quantidade_planejada numeric,
                                         anterior jsonb, quantidade_tecnica numeric, origem jsonb)
  where exists(select 1 from revisao_componentes rc where rc.id = t.revisao_componente_id and rc.revisao_id = _rev)
  on conflict (revisao_id, revisao_componente_id) do update set
    modalidade = case when exists(select 1 from ordem_compra_itens i where i.demanda_id = demandas.id)
                        or exists(select 1 from ordem_producao_itens i where i.demanda_id = demandas.id)
                      then demandas.modalidade else excluded.modalidade end,
    quantidade_necessaria = excluded.quantidade_necessaria, quantidade_planejada = excluded.quantidade_planejada,
    hash_tecnico = excluded.hash_tecnico, anterior = excluded.anterior,
    quantidade_tecnica = excluded.quantidade_tecnica, origem = excluded.origem;
  get diagnostics n = row_count;
  delete from demandas d where d.id = any(coalesce(_remover, '{}')) and d.revisao_id = _rev
    and not exists(select 1 from ordem_compra_itens i where i.demanda_id = d.id)
    and not exists(select 1 from ordem_producao_itens i where i.demanda_id = d.id);
  get diagnostics m = row_count;
  return jsonb_build_object('gravadas', n, 'removidas', m, 'hash', _hash);
end $$;
REVOKE ALL ON FUNCTION public.aplicar_demanda(uuid, text, jsonb, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_demanda(uuid, text, jsonb, uuid[]) TO authenticated;
