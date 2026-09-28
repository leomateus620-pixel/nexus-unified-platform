alter table public.revisao_componentes
  add column incluido_orcamento boolean not null default true;

create policy negar_acesso_direto_checkpoints
on public.proposta_checkpoints
for all
to authenticated
using (false)
with check (false);

create policy negar_acesso_direto_autores
on public.proposta_rascunho_autores
for all
to authenticated
using (false)
with check (false);

create policy negar_acesso_direto_operacoes
on public.proposta_operacoes
for all
to authenticated
using (false)
with check (false);

create schema if not exists nexus_private;
revoke all on schema nexus_private from public, anon, authenticated;
grant usage on schema nexus_private to authenticated;

alter function public.capturar_revisao(uuid,uuid) set schema nexus_private;
alter function public.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) set schema nexus_private;
revoke all on function nexus_private.capturar_revisao(uuid,uuid) from public, anon;
revoke all on function nexus_private.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) from public, anon;
grant execute on function nexus_private.capturar_revisao(uuid,uuid) to authenticated;
grant execute on function nexus_private.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) to authenticated;

create or replace function public.capturar_revisao(_rev uuid, _operacao uuid default null)
returns jsonb
language sql
security invoker
set search_path = public, nexus_private
as $$
  select nexus_private.capturar_revisao(_rev, _operacao)
$$;

create or replace function public.concluir_revisao(
  _rev uuid,
  _versao bigint,
  _versao_salva bigint,
  _snapshot jsonb,
  _calculo jsonb,
  _operacao uuid default null
)
returns jsonb
language sql
security invoker
set search_path = public, nexus_private
as $$
  select nexus_private.concluir_revisao(_rev, _versao, _versao_salva, _snapshot, _calculo, _operacao)
$$;

revoke all on function public.capturar_revisao(uuid,uuid) from public, anon;
revoke all on function public.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.capturar_revisao(uuid,uuid) to authenticated;
grant execute on function public.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) to authenticated;

create or replace function public.objeto_rascunho(_t text, _r jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare k text; v jsonb;
begin
 if _r is null then return '{}'::jsonb; end if;
 if _t='proposta_revisoes' then
  return jsonb_build_object('parametros',jsonb_build_object('nome','Parâmetros','campos',_r->'parametros'),
                           'textos',jsonb_build_object('nome','Textos do documento','campos',_r->'textos'));
 elsif _t='sistemas_dimensionados' then
  k:='sistema:'||(_r->>'id');
  v:=jsonb_build_object('nome',coalesce(nullif(_r->>'identificacao',''),'Sistema '||(_r->>'ordem')),'campos',jsonb_build_object(
    'identificacao',_r->'identificacao','tipo',_r->'tipo','metragem',_r->'metragem','trechos',_r->'trechos'));
 elsif _t='revisao_componentes' then
  k:='componente:'||(_r->>'id');
  v:=jsonb_build_object('nome',(_r->>'codigo')||' · '||(_r->>'descricao'),'justificativa',_r->'justificativa','rotulos',jsonb_build_object('fornecedor_id',_r->'fornecedor_nome'),'campos',jsonb_build_object(
    'incluido_orcamento',_r->'incluido_orcamento','modalidade',_r->'modalidade','fornecedor_id',_r->'fornecedor_id','custo_adotado',_r->'custo_adotado'));
 elsif _t='sistema_componentes' then
  if _r->>'override_quantidade' is null then return '{}'::jsonb; end if;
  k:='override:'||(_r->>'sistema_id')||':'||(_r->>'revisao_componente_id');
  v:=jsonb_build_object('nome','Ajuste de composição','justificativa',_r->'override_justificativa','campos',jsonb_build_object('override_quantidade',_r->'override_quantidade'));
 else return '{}'::jsonb;
 end if;
 return jsonb_build_object(k,v);
end $$;

revoke execute on function public.objeto_rascunho(text,jsonb) from public, anon, authenticated;

update public.proposta_checkpoints c
set snapshot = public.snapshot_rascunho(c.revisao_id),
    atualizado_em = now();