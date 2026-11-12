-- Lista única para o acervo e documentos emitidos na Nexus, sob as mesmas regras de acesso.
create view public.inspecoes_acervo_consulta with (security_invoker=true) as
  select r.id,r.organization_id,r.cliente_id,r.unidade_id,r.colecao,r.source_id,r.titulo,r.codigo,
    r.familia,r.situacao,r.data_ref,r.vigente,r.existente,r.snapshot,r.origem_autor,r.origem_data,r.importado_em,
    null::uuid as levantamento_id,null::uuid as ativo_id
  from public.inspecoes_registros r
  union all
  select d.id,d.organization_id,d.cliente_id,d.unidade_id,'documentos',d.id::text,
    concat('Laudo ',d.codigo),d.codigo,r.familia,'emitido',l.data_inspecao,true,true,
    jsonb_build_object('revisao',e.revisao,'emitido_em',e.emitido_em,'emissao_sha256',e.sha256,
      'resultado',l.parecer_est,'calculo_versao',l.calculo_versao,'resultado_calculado',l.resultado_calculado,
      'validade_tecnica',l.validade_tecnica,'prazo_restricao',l.prazo_restricao,'conteudo',l.conteudo,
      'protocolo_homologado',e.snapshot->'protocolo_homologado'),
    null::text,null::text,null::timestamptz,e.levantamento_id,l.ativo_id
  from public.inspecoes_documentos d
  join lateral (
    select v.levantamento_id,v.revisao,v.emitido_em,v.sha256,v.snapshot
    from public.inspecoes_emissoes v where v.organization_id=d.organization_id and v.documento_id=d.id
    order by v.emitido_em desc,v.id desc limit 1
  ) e on true
  join public.inspecoes_levantamentos l on l.organization_id=d.organization_id and l.id=e.levantamento_id
  join public.inspecoes_registros r on r.organization_id=l.organization_id and r.id=l.ativo_id;

revoke all on public.inspecoes_acervo_consulta from public,anon,authenticated,service_role;
grant select on public.inspecoes_acervo_consulta to authenticated;
