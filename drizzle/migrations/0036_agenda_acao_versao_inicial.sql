-- Mantém a versão inicial canônica de ações legadas sem contexto adicional.
-- Não registrar uma revisão vazia para escrever novamente null/defaults.
create or replace function public.ag_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;ret jsonb;payload jsonb:=jsonb_build_object('dados',_dados);eid uuid:=nullif(_dados->>'evento_id','')::uuid;aid uuid;cid uuid;sid uuid;tipo text;gestor boolean;p public.agenda_participantes;e public.agenda_eventos;x jsonb;estado text;begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;gestor:=public.operacao_pode(_org,'gerir_operacao');
 if _chave is null then raise exception 'Chave idempotente obrigatória.' using errcode='23514';end if;
 if _comando in('agendar','salvar_evento','publicar','cancelar','criar_acao','criar_serie','editar_serie','cancelar_serie','reprocessar_serie','reprocessar_notificacoes') and not gestor then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _comando in('iniciar','concluir') then select * into e from public.agenda_eventos where organization_id=_org and id=eid;if not public.agenda_ler_evento(_org,eid) or(not gestor and e.responsavel_id is distinct from public.ag_pessoa(_org,auth.uid())) then raise exception 'Acesso negado.' using errcode='42501';end if;end if;
 if _comando in('agendar','salvar_evento','publicar','cancelar','comentar') and eid is not null and not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if _comando='confirmar' then
  select * into p from public.agenda_participantes where organization_id=_org and id=(_dados->>'participante_id')::uuid;
  if p.id is null or not p.vigente or p.pessoa_id is distinct from public.ag_pessoa(_org,auth.uid()) or not public.agenda_ler_evento(_org,p.evento_id) then raise exception 'Participação indisponível.' using errcode='42501';end if;eid:=p.evento_id;
 end if;
 if _comando='transicionar_acao' then
  aid:=(_dados->>'acao_id')::uuid;
  if not public.ag_autor_acao(_org,aid,auth.uid()) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  perform 1 from public.acoes_operacionais where organization_id=_org and id=aid for update;
  x:=public.ag_obter_acao(_org,aid);
  if not(gestor or public.operacao_minha_pessoa(_org,(x->'acao'->>'responsavel_id')::uuid)) or(_dados->>'estado'='cancelada' and not gestor) or(_dados->>'estado'='concluida' and(not public.operacao_pode(_org,'revisar_operacao') or((x->'acao'->>'exige_verificacao')::boolean and public.operacao_identidade_propria(_org,(x->'acao'->>'responsavel_id')::uuid)))) then raise exception 'Acesso negado.' using errcode='42501';end if;
 end if;
 r:=public.operacao_repetir(_org,_chave,'ag:'||_comando,payload);if r is not null then return public.ag_resultado(_org,r);end if;
 if _comando='agendar' then
  perform public.ag_payload(_dados,array['evento']);
  if _dados->'evento'->>'timezone' is distinct from 'America/Sao_Paulo' then raise exception 'Novos eventos usam o horário de São Paulo.' using errcode='23514';end if;
  eid:=public.ag_gravar(_org,auth.uid(),_dados->'evento');
  perform public.ag_transicionar(_org,auth.uid(),eid,1,'publicado');tipo:='evento';cid:=eid;
 elsif _comando='salvar_evento' then
  perform public.ag_payload(_dados,array['evento_id','expected_version','evento']);eid:=public.ag_gravar(_org,auth.uid(),_dados->'evento',eid,(_dados->>'expected_version')::integer);tipo:='evento';cid:=eid;
 elsif _comando in('publicar','iniciar','concluir','cancelar') then
  perform public.ag_payload(_dados,array['evento_id','expected_version','motivo']);estado:=case _comando when 'publicar' then 'publicado' when 'iniciar' then 'em_andamento' when 'concluir' then 'concluido' else 'cancelado' end;
  perform public.ag_transicionar(_org,auth.uid(),eid,(_dados->>'expected_version')::integer,estado,_dados->>'motivo');tipo:='evento';cid:=eid;
 elsif _comando='confirmar' then
  perform public.ag_payload(_dados,array['participante_id','expected_version','confirmacao']);perform public.confirmar_participacao_agenda(_org,gen_random_uuid(),p.id,(_dados->>'expected_version')::integer,_dados->>'confirmacao');tipo:='evento';cid:=eid;
 elsif _comando='comentar' then
  perform public.ag_payload(_dados,array['evento_id','texto']);if not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  insert into public.agenda_comentarios(organization_id,evento_id,texto) values(_org,eid,public.ag_texto(_dados,'texto',3,4000)) returning id into cid;tipo:='comentario';
 elsif _comando='criar_acao' then
  perform public.ag_payload(_dados,array['acao','evento']);x:=public.salvar_acao_operacional(_org,gen_random_uuid(),_dados->'acao');aid:=(x->>'id')::uuid;
  perform public.ag_payload(_dados->'acao',array['titulo','descricao','responsavel_id','prazo','prioridade','exige_verificacao','participantes','cliente_id','projeto_id','unidade_id','local']);
  if length(coalesce(_dados->'acao'->>'local',''))>1000 then raise exception 'Local pode ter até 1000 caracteres.' using errcode='23514';end if;
  update public.acoes_operacionais set cliente_id=nullif(_dados->'acao'->>'cliente_id','')::uuid,projeto_id=nullif(_dados->'acao'->>'projeto_id','')::uuid,unidade_id=nullif(_dados->'acao'->>'unidade_id','')::uuid,local=coalesce(_dados->'acao'->>'local','') where organization_id=_org and id=aid
   and(cliente_id is distinct from nullif(_dados->'acao'->>'cliente_id','')::uuid or projeto_id is distinct from nullif(_dados->'acao'->>'projeto_id','')::uuid or unidade_id is distinct from nullif(_dados->'acao'->>'unidade_id','')::uuid or local is distinct from coalesce(_dados->'acao'->>'local',''));
  if jsonb_array_length(coalesce(_dados->'acao'->'participantes','[]'))>100 then raise exception 'Selecione até 100 pessoas.' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(_dados->'acao'->'participantes','[]'))pa_item where not exists(select 1 from public.pessoas pe where pe.organization_id=_org and pe.id=(pa_item->>'pessoa_id')::uuid and pe.ativa) or pa_item->>'funcao' not in('responsavel','participante')) then raise exception 'Selecione pessoas operacionais válidas para a ação.' using errcode='23514';end if;
  insert into public.acao_colaboradores(organization_id,acao_id,pessoa_id) select _org,aid,(pa_item->>'pessoa_id')::uuid from jsonb_array_elements(coalesce(_dados->'acao'->'participantes','[]'))pa_item on conflict do nothing;
  if _dados->'evento' is not null and jsonb_typeof(_dados->'evento')<>'null' then
   if _dados->'evento'->>'timezone' is distinct from 'America/Sao_Paulo' then raise exception 'Novos eventos usam o horário de São Paulo.' using errcode='23514';end if;
   eid:=public.ag_gravar(_org,auth.uid(),(_dados->'evento')||jsonb_build_object('acao_id',aid,'levantamento_id',null));perform public.ag_transicionar(_org,auth.uid(),eid,1,'publicado');
  end if;tipo:='acao';cid:=aid;
 elsif _comando='transicionar_acao' then
  perform public.ag_payload(_dados,array['acao_id','expected_version','estado','motivo']);aid:=(_dados->>'acao_id')::uuid;x:=public.transicionar_acao_operacional(_org,gen_random_uuid(),aid,(_dados->>'expected_version')::integer,_dados->>'estado',_dados->>'motivo');tipo:='acao';cid:=aid;
 elsif _comando in('criar_serie','editar_serie','cancelar_serie','reprocessar_serie') then
  x:=public.ag_serie_comando(_org,auth.uid(),_comando,_dados);cid:=(x->>'id')::uuid;eid:=nullif(x->>'evento_id','')::uuid;tipo:='serie';
 elsif _comando='preferencias' then
  perform public.ag_payload(_dados,array['antecedencia_minutos','notificar_atrasos','notificar']);if jsonb_typeof(_dados->'notificar_atrasos') is distinct from 'boolean' or jsonb_typeof(_dados->'notificar') is distinct from 'boolean' then raise exception 'Preferências devem usar booleanos.' using errcode='23514';end if;
  insert into public.agenda_preferencias(organization_id,user_id,antecedencia_minutos,notificar_atrasos,notificar) values(_org,auth.uid(),(_dados->>'antecedencia_minutos')::integer,(_dados->>'notificar_atrasos')::boolean,(_dados->>'notificar')::boolean) on conflict(organization_id,user_id) do update set antecedencia_minutos=excluded.antecedencia_minutos,notificar_atrasos=excluded.notificar_atrasos,notificar=excluded.notificar,updated_at=clock_timestamp();tipo:='preferencias';cid:=null;
 elsif _comando='marcar_lida' then
  perform public.ag_payload(_dados,array['notificacao_id']);cid:=(_dados->>'notificacao_id')::uuid;perform public.marcar_notificacao_lida(_org,cid);tipo:='leitura';
 elsif _comando='reprocessar_notificacoes' then
  perform public.ag_payload(_dados,array['evento_id']);if not public.agenda_ler_evento(_org,eid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  update public.outbox_eventos set estado='pendente',disponivel_em=clock_timestamp(),erro_codigo=null where organization_id=_org and agenda_evento_id=eid and estado='falha';
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'agenda_eventos',eid,'REPROCESSAR','Reprocessamento de notificações solicitado');tipo:='job';cid:=eid;
 else raise exception 'Comando não reconhecido.' using errcode='23514';end if;
 ret:=jsonb_build_object('tipo',tipo,'id',cid,'evento_id',eid,'acao_id',aid);perform public.operacao_concluir(_org,_chave,'ag:'||_comando,payload,ret);return public.ag_resultado(_org,ret);
end$$;
notify pgrst,'reload schema';
