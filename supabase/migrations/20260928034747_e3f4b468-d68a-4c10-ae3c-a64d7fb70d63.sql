create or replace function public.atualizar_componentes_revisao(
  _rev uuid,
  _ids uuid[],
  _patch jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.proposta_revisoes;
  permitidas text[] := array['incluido_orcamento','modalidade','fornecedor_id','custo_adotado','justificativa','custo_origem_id'];
  chave text;
  atualizados integer;
begin
  select * into r from public.proposta_revisoes where id = _rev for update;
  if not found or auth.uid() is null or not public.is_member(r.organization_id) or not public.pode(r.organization_id,'editar_revisao') then
    raise exception 'Acesso negado';
  end if;
  if r.status not in ('rascunho','em_revisao') then
    raise exception 'Revisão emitida é imutável';
  end if;
  if coalesce(array_length(_ids,1),0)=0 then raise exception 'Nenhum item selecionado'; end if;
  for chave in select jsonb_object_keys(_patch) loop
    if not (chave = any(permitidas)) then raise exception 'Campo não permitido: %', chave; end if;
  end loop;
  if exists(
    select 1 from unnest(_ids) x(id)
    left join public.revisao_componentes c on c.id=x.id and c.revisao_id=_rev and c.organization_id=r.organization_id
    where c.id is null
  ) then raise exception 'Item não pertence à revisão'; end if;
  if _patch ? 'incluido_orcamento' and jsonb_typeof(_patch->'incluido_orcamento') <> 'boolean' then raise exception 'Inclusão inválida'; end if;
  if _patch ? 'modalidade' and (_patch->>'modalidade') not in ('comprar','fabricar','terceirizar') then raise exception 'Modalidade inválida'; end if;
  if _patch ? 'custo_adotado' and ((_patch->>'custo_adotado')::numeric < 0) then raise exception 'Custo inválido'; end if;

  update public.revisao_componentes c set
    incluido_orcamento = case when _patch ? 'incluido_orcamento' then (_patch->>'incluido_orcamento')::boolean else c.incluido_orcamento end,
    modalidade = case when _patch ? 'modalidade' then (_patch->>'modalidade')::public.modalidade_suprimento else c.modalidade end,
    fornecedor_id = case when _patch ? 'fornecedor_id' then nullif(_patch->>'fornecedor_id','')::uuid else c.fornecedor_id end,
    custo_adotado = case when _patch ? 'custo_adotado' then (_patch->>'custo_adotado')::numeric else c.custo_adotado end,
    justificativa = case when _patch ? 'justificativa' then nullif(_patch->>'justificativa','') else c.justificativa end,
    custo_origem_id = case when _patch ? 'custo_origem_id' then nullif(_patch->>'custo_origem_id','')::uuid else c.custo_origem_id end
  where c.revisao_id=_rev and c.id=any(_ids);
  get diagnostics atualizados = row_count;
  return atualizados;
end $$;
revoke all on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb) to authenticated;