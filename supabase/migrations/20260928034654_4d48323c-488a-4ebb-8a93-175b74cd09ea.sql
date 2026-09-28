create or replace function nexus_private.concluir_revisao(_rev uuid,_versao bigint,_versao_salva bigint,_snapshot jsonb,_calculo jsonb,_operacao uuid default null)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare r proposta_revisoes; h proposta_checkpoints; op proposta_operacoes; snap jsonb; diffs jsonb; calc_id uuid; resp jsonb; nobj int; nfields int; email text;
begin
 select * into r from proposta_revisoes where id=_rev for update;
 if not found or auth.uid() is null or not is_member(r.organization_id) or not pode(r.organization_id,'editar_revisao') then raise exception 'Acesso negado'; end if;
 if _operacao is not null then
  select * into op from proposta_operacoes where id=_operacao;
  if found then
   if op.autor<>auth.uid() or op.revisao_id<>_rev then raise exception 'Chave de operação pertence a outro contexto'; end if;
   return op.resposta;
  end if;
 end if;
 if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
 select * into h from proposta_checkpoints where revisao_id=_rev for update;
 snap:=snapshot_rascunho(_rev);
 if h.revisao_id is null or h.versao<>_versao or h.versao_salva<>_versao_salva or snap is distinct from _snapshot then
  raise exception 'Conflito: o rascunho mudou durante o salvamento. Rascunho preservado; confira e salve novamente.' using errcode='40001';
 end if;
 select count(*),count(distinct objeto) into nfields,nobj from diferencas_comerciais(_rev,h.snapshot,snap);
 if _operacao is not null and nfields=0 then
  resp:=jsonb_build_object('id',_operacao,'evento',false,'objetos',0,'campos',0,'versao',h.versao,'mensagem','Nenhuma alteração para salvar');
  insert into proposta_operacoes(id,revisao_id,autor,resposta) values(_operacao,_rev,auth.uid(),resp);
  return resp;
 end if;
 if _operacao is not null and exists(select 1 from sistemas_dimensionados where revisao_id=_rev and (trim(identificacao)='' or metragem<=0 or trechos<1)) then raise exception 'Sistema inválido: revise identificação, metragem e trechos'; end if;
 if _calculo is null or coalesce(jsonb_typeof(_calculo->'itens'),'null')<>'array' or _calculo->'resumo' is null then raise exception 'Cálculo ausente ou inválido; salvamento não consolidado'; end if;
 if _operacao is not null then
  select coalesce(u.email,auth.uid()::text) into email from auth.users u where u.id=auth.uid();
  select jsonb_agg(to_jsonb(d)||jsonb_build_object('antes_rotulo',h.snapshot->d.objeto->'rotulos'->d.campo,'depois_rotulo',snap->d.objeto->'rotulos'->d.campo,'autores',coalesce((
    select jsonb_agg(a) from (select distinct autor,autor_nome from proposta_rascunho_autores
      where revisao_id=_rev and versao>h.versao_salva and versao<=h.versao and objeto=d.objeto and campo=d.campo) a),'[]'::jsonb)))
    into diffs from diferencas_comerciais(_rev,h.snapshot,snap) d;
 end if;
 delete from sistema_componentes i where revisao_id=_rev and not exists(
  select 1 from jsonb_array_elements(_calculo->'itens') x where (x->>'sistema_id')::uuid=i.sistema_id and (x->>'componente_id')::uuid=i.revisao_componente_id);
 insert into sistema_componentes(organization_id,revisao_id,sistema_id,revisao_componente_id,regra_chave,quantidade_tecnica,quantidade,override_quantidade,override_justificativa,memoria)
 select r.organization_id,_rev,(x->>'sistema_id')::uuid,(x->>'componente_id')::uuid,x->>'chave',(x->>'quantidade_tecnica')::numeric,(x->>'quantidade')::numeric,
 (snap->('override:'||(x->>'sistema_id')||':'||(x->>'componente_id'))->'campos'->>'override_quantidade')::numeric,
 snap->('override:'||(x->>'sistema_id')||':'||(x->>'componente_id'))->>'justificativa',x->>'memoria'
 from jsonb_array_elements(_calculo->'itens') x
 on conflict(sistema_id,revisao_componente_id) do update set regra_chave=excluded.regra_chave,quantidade_tecnica=excluded.quantidade_tecnica,quantidade=excluded.quantidade,memoria=excluded.memoria;
 insert into calculo_execucoes(organization_id,revisao_id,motor_versao,regras_id,entradas,resultado,created_by)
 values(r.organization_id,_rev,_calculo->>'motor_versao',r.regras_id,_calculo->'entradas',_calculo->'resumo',auth.uid()) returning id into calc_id;
 update proposta_revisoes set totais=_calculo->'resumo',calculado_em=now(),desatualizada=false where id=_rev;
 resp:=jsonb_build_object('id',_operacao,'evento',_operacao is not null,'objetos',nobj,'campos',nfields,'versao',h.versao,'calculo_id',calc_id,
 'pendencias',jsonb_array_length(_calculo->'resumo'->'pendencias'),'final',_calculo->'resumo'->'totais'->'final');
 if _operacao is not null then
  insert into proposta_salvamentos(id,organization_id,proposta_id,revisao_id,autor,autor_nome,versao_origem,versao_destino,objetos,campos,diferencas,calculo_id,impacto)
  values(_operacao,r.organization_id,r.proposta_id,_rev,auth.uid(),coalesce(email,auth.uid()::text),h.versao_salva,h.versao,nobj,nfields,diffs,calc_id,
   jsonb_build_object('total_anterior',h.total_salvo,'total_calculado',_calculo->'resumo'->'totais'->'final'));
  update proposta_checkpoints set snapshot=snapshot_rascunho(_rev),versao_salva=versao,total_salvo=(_calculo->'resumo'->'totais'->>'final')::numeric where revisao_id=_rev;
  insert into proposta_operacoes(id,revisao_id,autor,resposta) values(_operacao,_rev,auth.uid(),resp);
 end if;
 return resp;
end $$;
revoke all on function nexus_private.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) from public, anon;
grant execute on function nexus_private.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) to authenticated;