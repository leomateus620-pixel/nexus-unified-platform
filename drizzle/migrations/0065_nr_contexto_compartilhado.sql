-- Acesso contextual não altera a norma de cadastro nem converte trabalho em altura em PET.
create function public.nr_local_no_contexto(p_org uuid,p_local uuid,p_norma text)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nr_locais l where l.organization_id=p_org and l.id=p_local and l.arquivado_em is null and 'NR33'=any(l.normas)
 and public.nr_unidade_autorizada(p_org,l.cliente_id,l.unidade_id,'NR33')and public.nr_unidade_autorizada(p_org,l.cliente_id,l.unidade_id,p_norma)
 and(p_norma=any(l.normas)or exists(select 1 from public.nr_documentos d where d.organization_id=l.organization_id and d.cliente_id=l.cliente_id and d.unidade_id=l.unidade_id and d.local_id=l.id and d.arquivado_em is null and p_norma=any(d.normas))))
$$;
revoke all on function public.nr_local_no_contexto(uuid,uuid,text)from public,anon,authenticated,service_role;
create or replace function public.nr_mapa_contexto(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c public.nr_cenas_unidade;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then raise exception 'Unidade indisponível neste contexto.' using errcode='42501';end if;
 select * into c from public.nr_cenas_unidade where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and estado='publicada';
 if not found then return jsonb_build_object('cena',null,'objetos','[]'::jsonb);end if;
 return jsonb_build_object('cena',c.cena,'versao',c.versao,'objetos',coalesce((select jsonb_agg(jsonb_build_object('chave',o.chave,'local_id',l.id,'tag',l.tag,'titulo',l.titulo,'aliases',l.aliases||o.aliases,'posicao_confirmada',o.posicao_confirmada)order by o.chave) from public.nr_cena_objetos o join public.nr_locais l on l.organization_id=o.organization_id and l.cliente_id=o.cliente_id and l.unidade_id=o.unidade_id and l.id=o.local_id where o.organization_id=p_org and o.unidade_id=p_unidade and l.arquivado_em is null and 'NR33'=any(l.normas) and public.nr_local_no_contexto(p_org,l.id,p_norma)),'[]'));
end$$;

create or replace function public.pet_contexto_unidade(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_local uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare l public.nr_locais;v_gerir boolean;v_bloqueio text;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then raise exception 'Unidade indisponível neste contexto.' using errcode='42501';end if;
 v_gerir:=public.operacao_pode(p_org,'gerir_operacao');
 if p_local is not null then
  select * into l from public.nr_locais where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and id=p_local and arquivado_em is null and 'NR33'=any(normas) and public.nr_local_no_contexto(p_org,id,p_norma);
  if not found then raise exception 'Local indisponível para PET nesta unidade.' using errcode='42501';end if;
  if l.pet_espaco_id is null or not exists(select 1 from public.pet_espacos e where e.organization_id=p_org and e.unidade_id=p_unidade and e.id=l.pet_espaco_id and e.ativo) then v_bloqueio:='Vínculo com espaço operacional pendente. Solicite regularização ao responsável pelo cadastro.';end if;
 else v_bloqueio:='Selecione um local com espaço confinado vinculado.';end if;
 if not v_gerir then v_bloqueio:='Seu acesso não permite criar PET. Consulta NR não concede atribuição operacional.';end if;
 if v_bloqueio is null and not exists(select 1 from public.pet_modelo_versoes where organization_id=p_org and estado='aprovado') then v_bloqueio:='Procedimento aprovado indisponível. Solicite ao responsável técnico a regularização do modelo.';end if;
 if v_bloqueio is null and not exists(select 1 from public.nr_contratacoes where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and 'pet'=any(documentos))then v_bloqueio:='PET não selecionada na contratação confirmada pelo responsável técnico. Regularize os documentos contratados da unidade.';end if;
 return jsonb_build_object('local_id',l.id,'espaco_id',l.pet_espaco_id,'pode_criar',v_gerir and v_bloqueio is null,'pode_consultar',public.operacao_pode(p_org,'ver_operacao'),'bloqueio',v_bloqueio,
 'locais',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'tag',n.tag,'titulo',n.titulo,'pet_espaco_id',n.pet_espaco_id)order by public.nr_tag_ordem(n.tag))from public.nr_locais n where n.organization_id=p_org and n.cliente_id=p_cliente and n.unidade_id=p_unidade and n.arquivado_em is null and 'NR33'=any(n.normas) and public.nr_local_no_contexto(p_org,n.id,p_norma)),'[]'),
 'modelos',case when v_gerir then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nome',m.nome,'versao',v.versao)) from public.pet_modelo_versoes v join public.pet_modelos m on m.organization_id=v.organization_id and m.id=v.modelo_id where v.organization_id=p_org and v.estado='aprovado'),'[]')else '[]'::jsonb end,
 'ordens',case when v_gerir then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'titulo',o.titulo))from public.ordens_servico o where o.organization_id=p_org and o.cliente_id=p_cliente and o.unidade_id=p_unidade and o.estado in('aberta','em_execucao') and public.os_ler(p_org,o.id)),'[]')else '[]'::jsonb end,
 'assinatura_configurada',public.operacao_pode(p_org,'ver_operacao') and exists(select 1 from public.pet_assinatura_integracoes where organization_id=p_org and configurada and icp_brasil));
end$$;

create or replace function public.pet_executar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb:=p_comando->'dados';chave uuid:=(p_comando->>'chave')::uuid;r jsonb;l public.nr_locais;e public.pet_espacos;o public.ordens_servico;pid uuid;v_modelo uuid;v_agora timestamptz:=clock_timestamp();begin
 if p_comando->>'comando'<>'criar_pet'then return public.pet_executar_ate60(p_org,p_comando);end if;
 if not(d?'local_id')then
  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.operacao_pode(p_org,'gerir_operacao')or not public.os_ler(p_org,(d->>'os_id')::uuid)then raise exception 'Acesso negado.'using errcode='42501';end if;
  r:=public.operacao_repetir(p_org,chave,'pet:criar_pet',d);
  if r is null then
   select * into o from public.ordens_servico where organization_id=p_org and id=(d->>'os_id')::uuid;
   perform public.nr_documento_exigir_contrato(p_org,o.cliente_id,o.unidade_id,'pet');
  end if;
  return public.pet_executar_ate60(p_org,p_comando);
 end if;
 perform public.ag_payload(p_comando,array['chave','comando','dados']);
 perform public.ag_payload(d,array['cliente_id','unidade_id','local_id','espaco_id','norma','os_id','atividade','termino_previsto','timezone','modelo_versao_id']);
 if chave is null then raise exception 'Chave idempotente obrigatória.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.operacao_pode(p_org,'gerir_operacao') or not public.nr_unidade_autorizada(p_org,(d->>'cliente_id')::uuid,(d->>'unidade_id')::uuid,d->>'norma')then raise exception 'Acesso negado.'using errcode='42501';end if;
 -- Recibo continua sujeito ao acesso corrente, inclusive após revogação.
 r:=public.operacao_repetir(p_org,chave,'pet:criar_pet',d);
 if r is not null then return r||jsonb_build_object('detalhe',public.pet_obter(p_org,(r->>'id')::uuid));end if;
 select * into l from public.nr_locais where organization_id=p_org and cliente_id=(d->>'cliente_id')::uuid and unidade_id=(d->>'unidade_id')::uuid and id=(d->>'local_id')::uuid and pet_espaco_id=(d->>'espaco_id')::uuid and 'NR33'=any(normas) and public.nr_local_no_contexto(p_org,id,d->>'norma') and arquivado_em is null for share;
 if not found then raise exception 'Local, unidade e espaço não correspondem.'using errcode='42501';end if;
 perform public.nr_documento_exigir_contrato(p_org,l.cliente_id,l.unidade_id,'pet');
 select * into e from public.pet_espacos where organization_id=p_org and unidade_id=l.unidade_id and id=l.pet_espaco_id and ativo for share;
 if not found then raise exception 'Espaço operacional indisponível.'using errcode='23514';end if;
 if nullif(d->>'os_id','')is not null then
  select * into o from public.ordens_servico where organization_id=p_org and cliente_id=l.cliente_id and unidade_id=l.unidade_id and id=(d->>'os_id')::uuid for update;
  if not found or not public.os_ler(p_org,o.id) or o.estado not in('aberta','em_execucao')then raise exception 'OS indisponível ou de outra unidade.'using errcode='23514';end if;
 end if;
 select id into v_modelo from public.pet_modelo_versoes where organization_id=p_org and id=(d->>'modelo_versao_id')::uuid and estado='aprovado' for share;
 if v_modelo is null then raise exception 'Selecione uma versão de procedimento aprovada pelo responsável técnico.'using errcode='23514';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=d->>'timezone')then raise exception 'Fuso inválido.'using errcode='23514';end if;
 if nullif(d->>'termino_previsto','')is null or (d->>'termino_previsto')::timestamptz<=v_agora or(d->>'termino_previsto')::timestamptz>v_agora+interval '24 hours'then raise exception 'Informe o término futuro da jornada, até 24 horas.'using errcode='23514';end if;
 insert into public.pet_permissoes(organization_id,os_id,cliente_id,unidade_id,espaco_id,local_nr_id,norma_origem,modelo_versao_id,atividade,termino_previsto,timezone,snapshot_identificacao)
 values(p_org,o.id,l.cliente_id,l.unidade_id,e.id,l.id,d->>'norma',v_modelo,public.ag_texto(d,'atividade',3,4000),(d->>'termino_previsto')::timestamptz,d->>'timezone',jsonb_build_object('organizacao',(select nome from public.organizations where id=p_org),'cliente',(select to_jsonb(c)-array['created_by','updated_by']from public.clientes c where c.organization_id=p_org and c.id=l.cliente_id),'unidade',(select to_jsonb(u)-array['created_by','updated_by']from public.unidades u where u.organization_id=p_org and u.id=l.unidade_id),'espaco',to_jsonb(e),'os',case when o.id is null then null else to_jsonb(o)end,'local',jsonb_build_object('id',l.id,'tag',l.tag,'titulo',l.titulo,'aliases',l.aliases||coalesce((select a.aliases from public.nr_cena_objetos a where a.organization_id=p_org and a.unidade_id=l.unidade_id and a.local_id=l.id),'{}'::text[])),'norma_origem',d->>'norma'))returning id into pid;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao)values(p_org,'pet_permissoes',pid,'criar_pet');
 r:=jsonb_build_object('tipo','pet','id',pid,'pet_id',pid);
 perform public.operacao_concluir(p_org,chave,'pet:criar_pet',d,r);
 return r||jsonb_build_object('detalhe',public.pet_obter(p_org,pid));
end$$;
notify pgrst,'reload schema';

-- O tipo da cópia deriva da relação rastreável, nunca do nome do arquivo.
create or replace function public.nr_executar(p_org uuid,p_norma text,p_recurso text,p_comando text,p_id uuid,p_expected_version integer,p_chave text,p_dados jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.nr_documentos;origem_tipo text;achou boolean:=false;begin
 if p_recurso='documentos'and((p_comando='salvar'and p_id is null)or p_comando='nova_revisao')then
  if not public.pode(p_org,'ver_nr')then raise exception 'Acesso negado.'using errcode='42501';end if;
  if p_id is not null then select * into d from public.nr_documentos where organization_id=p_org and id=p_id and p_norma=any(normas);if not found then raise exception 'Documento indisponível.'using errcode='42501';end if;end if;
  if not public.nr_unidade_autorizada(p_org,coalesce(d.cliente_id,(p_dados->>'cliente_id')::uuid),coalesce(d.unidade_id,(p_dados->>'unidade_id')::uuid),p_norma)then raise exception 'Unidade indisponível.'using errcode='42501';end if;
  if d.tipo='derivado_docx'then
   for origem_tipo in select distinct o.tipo from public.nr_documento_relacoes r join public.nr_documentos o on o.organization_id=r.organization_id and o.id=r.documento_relacionado_id where r.organization_id=p_org and r.documento_id=d.id and r.tipo='referencia'and r.evidencia->>'tipo'='derivado_docx_editavel'and o.cliente_id=d.cliente_id and o.unidade_id=d.unidade_id loop
    achou:=true;perform public.nr_documento_exigir_contrato(p_org,d.cliente_id,d.unidade_id,origem_tipo);
   end loop;
   if not achou then raise exception 'Cópia sem relação comprovada com o tipo documental de origem. Regularize a classificação.'using errcode='23514';end if;
  else perform public.nr_documento_exigir_contrato(p_org,coalesce(d.cliente_id,(p_dados->>'cliente_id')::uuid),coalesce(d.unidade_id,(p_dados->>'unidade_id')::uuid),coalesce(d.tipo,p_dados->>'tipo'));end if;
 end if;
 return public.nr_executar_ate61(p_org,p_norma,p_recurso,p_comando,p_id,p_expected_version,p_chave,p_dados);
end$$;
create trigger nr_contratacao_evento_imutavel before update or delete on public.nr_contratacao_eventos for each row execute function public.pet_imutavel();
create trigger nr_equipe_evento_imutavel before update or delete on public.nr_unidade_pessoa_eventos for each row execute function public.pet_imutavel();
