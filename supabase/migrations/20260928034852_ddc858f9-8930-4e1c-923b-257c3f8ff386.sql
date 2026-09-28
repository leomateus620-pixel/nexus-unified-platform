create or replace function nexus_private.atualizar_componentes_revisao(
  _rev uuid,
  _ids uuid[],
  _patch jsonb,
  _esperados jsonb
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
  item uuid;
  esperado jsonb;
  atual jsonb;
  atualizados integer;
begin
  select * into r from public.proposta_revisoes where id = _rev for update;
  if not found or auth.uid() is null or not public.is_member(r.organization_id) or not public.pode(r.organization_id,'editar_revisao') then
    raise exception 'Acesso negado';
  end if;
  if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
  if coalesce(array_length(_ids,1),0)=0 then raise exception 'Nenhum item selecionado'; end if;
  for chave in select jsonb_object_keys(_patch) loop
    if not (chave = any(permitidas)) then raise exception 'Campo não permitido: %', chave; end if;
  end loop;
  if _patch ? 'incluido_orcamento' and jsonb_typeof(_patch->'incluido_orcamento') <> 'boolean' then raise exception 'Inclusão inválida'; end if;
  if _patch ? 'modalidade' and (_patch->>'modalidade') not in ('comprar','fabricar','terceirizar') then raise exception 'Modalidade inválida'; end if;
  if _patch ? 'custo_adotado' and ((_patch->>'custo_adotado')::numeric < 0) then raise exception 'Custo inválido'; end if;

  foreach item in array _ids loop
    select to_jsonb(c) into atual from public.revisao_componentes c
      where c.id=item and c.revisao_id=_rev and c.organization_id=r.organization_id;
    if atual is null then raise exception 'Item não pertence à revisão'; end if;
    esperado := _esperados->item::text;
    if esperado is null then raise exception 'Versão esperada ausente'; end if;
    for chave in select jsonb_object_keys(_patch) loop
      if (atual->chave) is distinct from (esperado->chave) then
        raise exception 'Conflito no componente: outro usuário alterou o campo. Trabalho local preservado.' using errcode='40001';
      end if;
    end loop;
  end loop;

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
revoke all on function nexus_private.atualizar_componentes_revisao(uuid,uuid[],jsonb,jsonb) from public,anon;
grant execute on function nexus_private.atualizar_componentes_revisao(uuid,uuid[],jsonb,jsonb) to authenticated;

create or replace function public.atualizar_componentes_revisao(
  _rev uuid,
  _ids uuid[],
  _patch jsonb,
  _esperados jsonb
)
returns integer
language sql
security invoker
set search_path = public, nexus_private
as $$
  select nexus_private.atualizar_componentes_revisao(_rev, _ids, _patch, _esperados)
$$;
revoke all on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb,jsonb) from public,anon;
grant execute on function public.atualizar_componentes_revisao(uuid,uuid[],jsonb,jsonb) to authenticated;