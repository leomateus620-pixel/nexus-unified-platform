-- 0023 acrescentou integridade composta sem retirar nove FKs simples históricas.
-- PostgREST interpreta cada FK como uma relação e passa a rejeitar os embeds existentes.
-- Manter uma única FK por relação, preservando os nomes históricos e o escopo mais forte.
-- Cabeçalhos: ambas as representações já usam NO ACTION em UPDATE e DELETE.
alter table public.ordens_compra drop constraint ordens_compra_revisao_id_fkey;
alter table public.ordens_compra rename constraint alm_oc_revisao_fk to ordens_compra_revisao_id_fkey;
alter table public.ordens_compra drop constraint ordens_compra_fornecedor_id_fkey;
alter table public.ordens_compra rename constraint alm_oc_fornecedor_fk to ordens_compra_fornecedor_id_fkey;
alter table public.ordens_compra drop constraint ordens_compra_projeto_id_fkey;
alter table public.ordens_compra rename constraint alm_oc_projeto_fk to ordens_compra_projeto_id_fkey;
alter table public.ordens_producao drop constraint ordens_producao_revisao_id_fkey;
alter table public.ordens_producao rename constraint alm_op_revisao_fk to ordens_producao_revisao_id_fkey;
alter table public.ordens_producao drop constraint ordens_producao_projeto_id_fkey;
alter table public.ordens_producao rename constraint alm_op_projeto_fk to ordens_producao_projeto_id_fkey;

-- Filhos: conservar CASCADE histórico. A FK composta permanece validada e tenant-scoped.
-- O executor aplica esta troca em uma única transação, sem janela para writes sem integridade.
alter table public.ordem_compra_itens drop constraint alm_oci_ordem_fk;
alter table public.ordem_compra_itens drop constraint ordem_compra_itens_ordem_id_fkey;
alter table public.ordem_compra_itens add constraint ordem_compra_itens_ordem_id_fkey
 foreign key(organization_id,ordem_id) references public.ordens_compra(organization_id,id) on delete cascade;
alter table public.ordem_producao_itens drop constraint alm_opi_ordem_fk;
alter table public.ordem_producao_itens drop constraint ordem_producao_itens_ordem_id_fkey;
alter table public.ordem_producao_itens add constraint ordem_producao_itens_ordem_id_fkey
 foreign key(organization_id,ordem_id) references public.ordens_producao(organization_id,id) on delete cascade;
alter table public.recebimentos drop constraint alm_recebimento_item_fk;
alter table public.recebimentos drop constraint recebimentos_item_id_fkey;
alter table public.recebimentos add constraint recebimentos_item_id_fkey
 foreign key(organization_id,item_id) references public.ordem_compra_itens(organization_id,id) on delete cascade;
alter table public.apontamentos drop constraint alm_apontamento_item_fk;
alter table public.apontamentos drop constraint apontamentos_item_id_fkey;
alter table public.apontamentos add constraint apontamentos_item_id_fkey
 foreign key(organization_id,item_id) references public.ordem_producao_itens(organization_id,id) on delete cascade;

-- Trigger interno sem RPC pública. Sua execução pelo trigger não depende deste privilégio.
revoke all on function public.operacao_guard_anexo() from public,anon,authenticated,service_role;

-- Solicitar recarga do catálogo no PostgREST após o commit desta mesma transação.
notify pgrst, 'reload schema';
