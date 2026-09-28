create or replace function nexus_private.atualizar_componentes_e_recalcular(
  _rev uuid,
  _ids uuid[],
  _patch jsonb,
  _calculo jsonb,
  _versao bigint,
  _versao_salva bigint,
  _snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, nexus_private
as $$
declare
  alterados integer;
  captura jsonb;
begin
  alterados := nexus_private.atualizar_componentes_revisao(_rev,_ids,_patch);
  captura := nexus_private.capturar_revisao(_rev,null);
  return jsonb_build_object('alterados',alterados,'captura',captura);
end $$;
revoke all on function nexus_private.atualizar_componentes_e_recalcular(uuid,uuid[],jsonb,jsonb,bigint,bigint,jsonb) from public,anon,authenticated;
