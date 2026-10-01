revoke all on function public.previa_codigo(uuid, text, char) from public, anon;
grant execute on function public.previa_codigo(uuid, text, char) to authenticated;
revoke all on function public.formatar_codigo(text, char, int) from anon;

create or replace function public.recodificar_produto(_produto uuid, _familia text, _tipo char)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _p produtos; _n int; _codigo text;
begin
  select * into _p from produtos where id = _produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if auth.uid() is null or not public.pode(_p.organization_id, 'importar_catalogo') then
    raise exception 'Sem permissão.';
  end if;
  if _p.familia is not null then raise exception 'Produto já codificado: %', _p.codigo; end if;
  if not exists (select 1 from familias_codigo where sigla = _familia) or _tipo not in ('M','S','P') then
    raise exception 'Família ou tipo inválido.';
  end if;
  _n := public.reservar_sequencia(_p.organization_id, _familia, _tipo);
  _codigo := public.formatar_codigo(_familia, _tipo, _n);
  perform set_config('nexus.codigo_autorizado', '1', true);
  update produtos set codigo = _codigo, codigo_legado = coalesce(codigo_legado, _p.codigo),
    familia = _familia, tipo_item = _tipo, sequencia = _n where id = _produto;
  perform set_config('nexus.codigo_autorizado', '', true);
  update revisao_componentes rc set codigo = _codigo
    from proposta_revisoes r
    where rc.produto_id = _produto and r.id = rc.revisao_id and r.status in ('rascunho','em_revisao');
  update proposta_revisoes r set regras_snapshot = jsonb_set(r.regras_snapshot, '{componentes}',
      (select jsonb_object_agg(k, case when v = to_jsonb(_p.codigo) then to_jsonb(_codigo) else v end)
         from jsonb_each(r.regras_snapshot->'componentes') e(k, v)))
    where r.organization_id = _p.organization_id and r.status in ('rascunho','em_revisao')
      and r.regras_snapshot ? 'componentes';
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (_p.organization_id, 'produto', _produto, 'recodificar',
      jsonb_build_object('de', _p.codigo, 'para', _codigo), auth.uid());
  return jsonb_build_object('id', _produto, 'codigo', _codigo, 'anterior', _p.codigo);
end $$;
revoke all on function public.recodificar_produto(uuid, text, char) from public, anon;
grant execute on function public.recodificar_produto(uuid, text, char) to authenticated;