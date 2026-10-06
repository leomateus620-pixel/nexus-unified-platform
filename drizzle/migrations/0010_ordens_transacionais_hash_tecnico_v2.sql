ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS hash_tecnico text;
ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS hash_tecnico text;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS hash_tecnico text;
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS anterior jsonb;
COMMENT ON COLUMN public.ordens_producao.hash_tecnico IS 'Fingerprint técnico do conteúdo que originou a OP; liberação exige aprovação deste mesmo conteúdo.';
COMMENT ON COLUMN public.demandas.anterior IS 'Quantidade/modalidade/fornecedor antes do último replanejamento (reconciliação visível).';

CREATE TABLE IF NOT EXISTS public.geracao_ordens (
  chave text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  revisao_id uuid NOT NULL REFERENCES public.proposta_revisoes(id),
  resposta jsonb NOT NULL,
  autor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.geracao_ordens TO authenticated;
GRANT ALL ON public.geracao_ordens TO service_role;
ALTER TABLE public.geracao_ordens ENABLE ROW LEVEL SECURITY;
CREATE POLICY geracao_ordens_select ON public.geracao_ordens FOR SELECT TO authenticated USING (public.is_member(organization_id));

CREATE OR REPLACE FUNCTION public.hash_tecnico(_rev uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select md5(
    'v2|S:' || coalesce((select string_agg(s.ordem||':'||s.tipo::text||':'||s.metragem||':'||s.trechos, ';' order by s.ordem, s.id)
       from sistemas_dimensionados s where s.revisao_id=_rev), '') ||
    '|Q:' || coalesce((select string_agg(s.ordem||':'||rc.codigo||':'||sc.quantidade_tecnica||':'||coalesce(sc.override_quantidade, sc.quantidade), ';' order by s.ordem, rc.codigo, sc.regra_chave)
       from sistema_componentes sc join sistemas_dimensionados s on s.id=sc.sistema_id
       join revisao_componentes rc on rc.id=sc.revisao_componente_id where sc.revisao_id=_rev and rc.incluido_orcamento), '') ||
    '|C:' || coalesce((select string_agg(rc.codigo||':'||rc.produto_id||':'||rc.modalidade::text||':'||rc.quantidade_avulsa||':'||rc.indivisivel||':'||rc.multiplo_compra||':'||coalesce(rc.estrutura::text,''), ';' order by rc.codigo, rc.id)
       from revisao_componentes rc where rc.revisao_id=_rev and rc.incluido_orcamento), '') ||
    '|R:' || coalesce((select regras_snapshot::text from proposta_revisoes where id=_rev), ''))
  where exists(select 1 from proposta_revisoes r where r.id=_rev and public.is_member(r.organization_id));
$$;

CREATE OR REPLACE FUNCTION public.op_exige_aprovacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if new.status = 'liberada' and old.status is distinct from 'liberada' then
    if new.hash_tecnico is null then
      raise exception 'OP gerada antes do controle de origem técnica: atualize a demanda e gere novamente antes de liberar';
    end if;
    if new.hash_tecnico is distinct from public.hash_tecnico(new.revisao_id) then
      raise exception 'A composição técnica mudou desde que esta OP foi planejada; replaneje antes de liberar';
    end if;
    if not exists(select 1 from aprovacoes a where a.revisao_id=new.revisao_id and a.tipo='tecnica'
                  and a.invalidada_em is null and a.hash_conteudo = new.hash_tecnico) then
      raise exception 'Liberação exige aprovação técnica do conteúdo que originou esta OP';
    end if;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.gerar_ordens(_rev uuid, _chave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  r record; d record; v_hash text; v_proj uuid; v_falta text; prev jsonb;
  saldo numeric; q numeric; v_id uuid; v_num text; v_acao text; v_tipo text; v_novo boolean;
  v_ordens jsonb := '{}'::jsonb; v_itens int := 0; v_dem uuid[] := '{}'; res jsonb;
begin
  if _chave is null or length(_chave) < 8 then raise exception 'Chave de operação inválida'; end if;
  select * into r from proposta_revisoes where id=_rev;
  if not found or not public.is_member(r.organization_id) then raise exception 'Revisão não encontrada'; end if;
  if not public.pode(r.organization_id, 'emitir_ordem') then raise exception 'Permissão insuficiente para gerar ordens'; end if;
  perform pg_advisory_xact_lock(hashtext('gerar_ordens:'||_rev::text));
  select resposta into prev from geracao_ordens where chave=_chave;
  if found then return prev || '{"repetido":true}'::jsonb; end if;
  if r.status in ('recusada','substituida') then raise exception 'Revisão recusada ou substituída não gera ordens'; end if;
  if r.desatualizada then raise exception 'Recalcule a revisão antes de gerar ordens'; end if;
  if not exists(select 1 from demandas where revisao_id=_rev) then raise exception 'Planeje a demanda antes de gerar ordens'; end if;
  v_hash := public.hash_tecnico(_rev);
  if exists(select 1 from demandas where revisao_id=_rev and hash_tecnico is distinct from v_hash) then
    raise exception 'A composição técnica mudou desde o planejamento. Use Atualizar demanda antes de gerar ordens';
  end if;
  select id into v_proj from projetos where revisao_id=_rev limit 1;
  for d in
    select dm.id, dm.modalidade::text modalidade, dm.quantidade_planejada, rc.codigo, rc.fornecedor_id, rc.custo_adotado,
           rc.multiplo_compra, rc.indivisivel,
           case when dm.modalidade='fabricar' then
             (select coalesce(sum(i.quantidade),0) from ordem_producao_itens i join ordens_producao o on o.id=i.ordem_id where i.demanda_id=dm.id and o.status<>'cancelada')
           else
             (select coalesce(sum(i.quantidade - i.quantidade_cancelada),0) from ordem_compra_itens i join ordens_compra o on o.id=i.ordem_id where i.demanda_id=dm.id and o.status<>'cancelada')
           end comp
    from demandas dm join revisao_componentes rc on rc.id=dm.revisao_componente_id
    where dm.revisao_id=_rev order by rc.fornecedor_id nulls last, rc.codigo
  loop
    saldo := d.quantidade_planejada - d.comp;
    if saldo <= 0 then continue; end if;
    if d.modalidade <> 'fabricar' and d.fornecedor_id is null then
      v_falta := coalesce(v_falta||', ','') || d.codigo; continue;
    end if;
    q := case when d.multiplo_compra > 0 then ceil(saldo / d.multiplo_compra) * d.multiplo_compra
              when d.indivisivel then ceil(saldo) else saldo end;
    v_novo := false;
    if d.modalidade = 'fabricar' then
      v_tipo := 'OP';
      select id, numero into v_id, v_num from ordens_producao
        where revisao_id=_rev and status='rascunho' and hash_tecnico = v_hash order by created_at limit 1;
      if v_id is null then
        v_num := public.proximo_numero(r.organization_id, 'OP');
        insert into ordens_producao(organization_id, numero, revisao_id, projeto_id, hash_tecnico)
          values (r.organization_id, v_num, _rev, v_proj, v_hash) returning id into v_id;
        v_novo := true;
      end if;
      if exists(select 1 from ordem_producao_itens where ordem_id=v_id and demanda_id=d.id) then
        update ordem_producao_itens set quantidade = quantidade + q where ordem_id=v_id and demanda_id=d.id; v_acao := 'complementada';
      else
        insert into ordem_producao_itens(organization_id, ordem_id, demanda_id, quantidade) values (r.organization_id, v_id, d.id, q);
        v_acao := 'reutilizada';
      end if;
    else
      v_tipo := 'OC';
      select id, numero into v_id, v_num from ordens_compra
        where revisao_id=_rev and fornecedor_id=d.fornecedor_id and status='rascunho' order by created_at limit 1;
      if v_id is null then
        v_num := public.proximo_numero(r.organization_id, 'OC');
        insert into ordens_compra(organization_id, numero, revisao_id, projeto_id, fornecedor_id, hash_tecnico)
          values (r.organization_id, v_num, _rev, v_proj, d.fornecedor_id, v_hash) returning id into v_id;
        v_novo := true;
      else
        update ordens_compra set hash_tecnico = v_hash where id=v_id and hash_tecnico is distinct from v_hash;
      end if;
      if exists(select 1 from ordem_compra_itens where ordem_id=v_id and demanda_id=d.id) then
        update ordem_compra_itens set quantidade = quantidade + q where ordem_id=v_id and demanda_id=d.id; v_acao := 'complementada';
      else
        insert into ordem_compra_itens(organization_id, ordem_id, demanda_id, quantidade, preco_unitario)
          values (r.organization_id, v_id, d.id, q, d.custo_adotado);
        v_acao := 'reutilizada';
      end if;
    end if;
    if v_novo or v_ordens->v_id::text->>'acao' = 'criada' then v_acao := 'criada';
    elsif v_ordens->v_id::text->>'acao' = 'complementada' then v_acao := 'complementada'; end if;
    v_ordens := jsonb_set(v_ordens, array[v_id::text], jsonb_build_object('id', v_id, 'tipo', v_tipo, 'numero', v_num, 'acao', v_acao));
    v_itens := v_itens + 1; v_dem := v_dem || d.id; v_id := null;
  end loop;
  if v_falta is not null then raise exception 'Selecione fornecedor para: %', v_falta; end if;
  update demandas set status='alocada' where id = any(v_dem) and status='planejada';
  res := jsonb_build_object('ordens', coalesce((select jsonb_agg(value order by value->>'tipo', value->>'numero') from jsonb_each(v_ordens)), '[]'::jsonb),
                            'itens', v_itens, 'hash', v_hash);
  insert into geracao_ordens(chave, organization_id, revisao_id, resposta, autor) values (_chave, r.organization_id, _rev, res, auth.uid());
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (r.organization_id, 'revisao', _rev, 'gerar_ordens', res, auth.uid());
  return res;
end $$;
REVOKE ALL ON FUNCTION public.gerar_ordens(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gerar_ordens(uuid, text) TO authenticated;