-- Projeção de leitura da ação: relacionamentos existentes reaparecem após recarregar.
-- ACL canônica da ação é verificada antes de resolver nomes e colaboradores.
create or replace function public.ag_obter_acao(_org uuid,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.acoes_operacionais;g boolean:=public.operacao_pode(_org,'gerir_operacao');propria boolean;begin
 if not public.ag_autor_acao(_org,_id,auth.uid()) then raise exception 'Registro indisponível.' using errcode='42501';end if;select * into a from public.acoes_operacionais where organization_id=_org and id=_id;propria:=a.responsavel_id=public.ag_pessoa(_org,auth.uid());
 return jsonb_build_object('acao',to_jsonb(a),'responsavel_nome',(select nome from public.pessoas where organization_id=_org and id=a.responsavel_id),'cliente_nome',(select c.razao_social from public.clientes c where c.organization_id=_org and c.id=a.cliente_id),
 'projeto_nome',(select p.codigo from public.projetos p where p.organization_id=_org and p.id=a.projeto_id),
 'unidade_nome',(select u.nome from public.unidades u where u.organization_id=_org and u.id=a.unidade_id),
 'pessoas',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',p.id,'nome',p.nome) order by(p.id=a.responsavel_id) desc,p.nome,p.id) from public.pessoas p where p.organization_id=_org and(p.id=a.responsavel_id or exists(select 1 from public.acao_colaboradores c where c.organization_id=_org and c.acao_id=a.id and c.pessoa_id=p.id))),'[]'),
 'permissoes',jsonb_build_object('iniciar',a.estado='aberta' and(g or propria),'devolver',a.estado='aguardando_verificacao' and(g or propria),'enviar_verificacao',a.estado='em_execucao' and(g or propria) and exists(select 1 from public.anexos where organization_id=_org and acao_id=_id and estado='vinculado'),'concluir',a.estado='aguardando_verificacao' and public.operacao_pode(_org,'revisar_operacao') and(not a.exige_verificacao or not public.operacao_identidade_propria(_org,a.responsavel_id)),'cancelar',g and a.estado not in('concluida','cancelada'),'agendar',g and a.estado not in('concluida','cancelada')));
end$$;
notify pgrst,'reload schema';
