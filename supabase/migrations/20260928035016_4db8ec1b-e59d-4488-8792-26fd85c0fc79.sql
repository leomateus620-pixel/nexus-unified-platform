revoke usage on schema nexus_private from authenticated;
grant usage on schema nexus_private to public;
revoke execute on all functions in schema nexus_private from public, anon, authenticated;
grant execute on function nexus_private.capturar_revisao(uuid,uuid) to authenticated;
grant execute on function nexus_private.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) to authenticated;
grant execute on function nexus_private.atualizar_componentes_revisao(uuid,uuid[],jsonb,jsonb) to authenticated;