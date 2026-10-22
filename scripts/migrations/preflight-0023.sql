-- Somente contagens agregadas de integridade e metadados; não retorna identidades ou conteúdo.
-- O responsável deve conferir projeto/repositório, prefixo/checksums41 e snapshot do catálogo.
with checks as (
 select 'oc_revisao_tenant' nome,count(*)::bigint conflitos from public.ordens_compra o left join public.proposta_revisoes r on r.organization_id=o.organization_id and r.id=o.revisao_id where r.id is null
 union all select 'op_revisao_tenant',count(*) from public.ordens_producao o left join public.proposta_revisoes r on r.organization_id=o.organization_id and r.id=o.revisao_id where r.id is null
 union all select 'oc_fornecedor_tenant',count(*) from public.ordens_compra o left join public.fornecedores f on f.organization_id=o.organization_id and f.id=o.fornecedor_id where f.id is null
 union all select 'oc_projeto_revisao',count(*) from public.ordens_compra o left join public.projetos p on p.organization_id=o.organization_id and p.revisao_id=o.revisao_id and p.id=o.projeto_id where o.projeto_id is not null and p.id is null
 union all select 'op_projeto_revisao',count(*) from public.ordens_producao o left join public.projetos p on p.organization_id=o.organization_id and p.revisao_id=o.revisao_id and p.id=o.projeto_id where o.projeto_id is not null and p.id is null
 union all select 'projeto_proposta_cliente',count(*) from public.projetos p left join public.proposta_revisoes r on r.organization_id=p.organization_id and r.id=p.revisao_id left join public.propostas pr on pr.organization_id=r.organization_id and pr.id=r.proposta_id where r.id is null or pr.id is null or p.proposta_id is distinct from pr.id or p.cliente_id is distinct from pr.cliente_id
 union all select 'oci_ordem_tenant',count(*) from public.ordem_compra_itens i left join public.ordens_compra o on o.organization_id=i.organization_id and o.id=i.ordem_id where o.id is null
 union all select 'opi_ordem_tenant',count(*) from public.ordem_producao_itens i left join public.ordens_producao o on o.organization_id=i.organization_id and o.id=i.ordem_id where o.id is null
 union all select 'oci_demanda_revisao',count(*) from public.ordem_compra_itens i join public.ordens_compra o on o.organization_id=i.organization_id and o.id=i.ordem_id left join public.demandas d on d.organization_id=i.organization_id and d.revisao_id=o.revisao_id and d.id=i.demanda_id where d.id is null
 union all select 'opi_demanda_revisao',count(*) from public.ordem_producao_itens i join public.ordens_producao o on o.organization_id=i.organization_id and o.id=i.ordem_id left join public.demandas d on d.organization_id=i.organization_id and d.revisao_id=o.revisao_id and d.id=i.demanda_id where d.id is null
 union all select 'recebimento_item_tenant',count(*) from public.recebimentos e left join public.ordem_compra_itens i on i.organization_id=e.organization_id and i.id=e.item_id where i.id is null
 union all select 'apontamento_item_tenant',count(*) from public.apontamentos e left join public.ordem_producao_itens i on i.organization_id=e.organization_id and i.id=e.item_id where i.id is null
 union all select 'produto_tenant_unicidade',count(*) from(select organization_id,id from public.produtos group by organization_id,id having count(*)>1)x
 union all select 'projeto_tenant_revisao_unicidade',count(*) from(select organization_id,revisao_id,id from public.projetos group by organization_id,revisao_id,id having count(*)>1)x
 union all select 'fornecedor_tenant_unicidade',count(*) from(select organization_id,id from public.fornecedores group by organization_id,id having count(*)>1)x
 union all select 'demanda_tenant_revisao_unicidade',count(*) from(select organization_id,revisao_id,id from public.demandas group by organization_id,revisao_id,id having count(*)>1)x
 union all select 'oc_tenant_revisao_unicidade',count(*) from(select organization_id,revisao_id,id from public.ordens_compra group by organization_id,revisao_id,id having count(*)>1)x
 union all select 'op_tenant_revisao_unicidade',count(*) from(select organization_id,revisao_id,id from public.ordens_producao group by organization_id,revisao_id,id having count(*)>1)x
 union all select 'oci_tenant_unicidade',count(*) from(select organization_id,id from public.ordem_compra_itens group by organization_id,id having count(*)>1)x
 union all select 'opi_tenant_unicidade',count(*) from(select organization_id,id from public.ordem_producao_itens group by organization_id,id having count(*)>1)x
 union all select 'recebimento_tenant_unicidade',count(*) from(select organization_id,id from public.recebimentos group by organization_id,id having count(*)>1)x
 union all select 'apontamento_tenant_unicidade',count(*) from(select organization_id,id from public.apontamentos group by organization_id,id having count(*)>1)x
)
select jsonb_build_object('checked_at',clock_timestamp(),'ledger_count',(select count(*) from nexus_migrations.applied),'ledger_last',(select jsonb_build_object('position',position,'path',path,'sha256',sha256) from nexus_migrations.applied order by position desc limit 1),'candidate_absent',to_regclass('public.estoque_movimentos') is null,'checks',(select jsonb_object_agg(nome,conflitos order by nome) from checks),'conflicts',(select sum(conflitos) from checks),'integrity_ready',(select sum(conflitos)=0 from checks));
