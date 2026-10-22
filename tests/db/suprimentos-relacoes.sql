\set ON_ERROR_STOP on
begin;
-- Teste de catálogo real: os mesmos embeds sem hints precisam de um único relacionamento.
-- Não simula HTTP/PostgREST nem substitui o typecheck contra tipos regenerados oficialmente.
do $$declare r record;c record;total integer;expected_parent text[];begin
 for r in select * from(values
 ('ordens_compra','proposta_revisoes','ordens_compra_revisao_id_fkey',array['organization_id','revisao_id'],'a'),
 ('ordens_compra','fornecedores','ordens_compra_fornecedor_id_fkey',array['organization_id','fornecedor_id'],'a'),
 ('ordens_compra','projetos','ordens_compra_projeto_id_fkey',array['organization_id','revisao_id','projeto_id'],'a'),
 ('ordens_producao','proposta_revisoes','ordens_producao_revisao_id_fkey',array['organization_id','revisao_id'],'a'),
 ('ordens_producao','projetos','ordens_producao_projeto_id_fkey',array['organization_id','revisao_id','projeto_id'],'a'),
 ('ordem_compra_itens','ordens_compra','ordem_compra_itens_ordem_id_fkey',array['organization_id','ordem_id'],'c'),
 ('ordem_producao_itens','ordens_producao','ordem_producao_itens_ordem_id_fkey',array['organization_id','ordem_id'],'c'),
 ('recebimentos','ordem_compra_itens','recebimentos_item_id_fkey',array['organization_id','item_id'],'c'),
 ('apontamentos','ordem_producao_itens','apontamentos_item_id_fkey',array['organization_id','item_id'],'c')
 ) v(child,parent,legacy_name,columns,delete_action) loop
 select count(*) into total from pg_constraint where contype='f' and conrelid=('public.'||r.child)::regclass and confrelid=('public.'||r.parent)::regclass;
 if total<>1 then raise exception 'Relação %.% ambígua: % FKs',r.child,r.parent,total;end if;
 select conname,convalidated,confdeltype::text delete_action,confupdtype::text update_action,confmatchtype::text match_type,condeferrable,
 (select array_agg(a.attname::text order by x.pos) from unnest(conkey) with ordinality x(attnum,pos) join pg_attribute a on a.attrelid=conrelid and a.attnum=x.attnum) columns,
 (select array_agg(a.attname::text order by x.pos) from unnest(confkey) with ordinality x(attnum,pos) join pg_attribute a on a.attrelid=confrelid and a.attnum=x.attnum) parent_columns
 into c from pg_constraint where contype='f' and conrelid=('public.'||r.child)::regclass and confrelid=('public.'||r.parent)::regclass;
 expected_parent:=case when r.parent='projetos' then array['organization_id','revisao_id','id'] else array['organization_id','id'] end;
 if c.conname<>r.legacy_name or c.columns<>r.columns or c.parent_columns<>expected_parent or c.delete_action<>r.delete_action or c.update_action<>'a' or c.match_type<>'s' or c.condeferrable or not c.convalidated then
 raise exception 'Contrato composto/histórico divergente em %: %',r.child,row_to_json(c);end if;
 raise notice 'FK % → %: única, tenant/revisão preservados, ação histórica e nome compatíveis | PASSOU',r.child,r.parent;
 end loop;
 if has_function_privilege('authenticated','public.operacao_guard_anexo()','execute') or has_function_privilege('anon','public.operacao_guard_anexo()','execute') or has_function_privilege('service_role','public.operacao_guard_anexo()','execute') then raise exception 'Trigger privado exposto';end if;
 if (select prosecdef from pg_proc where oid='public.operacao_guard_anexo()'::regprocedure) then raise exception 'Trigger deixou de ser invoker';end if;
 raise notice 'Trigger interno operacao_guard_anexo sem EXECUTE público; invoker preservado | PASSOU';
end$$;
rollback;
