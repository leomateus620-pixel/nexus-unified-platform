-- Candidata não aplicada: anexos privados canônicos por evento real da Agenda.
-- Dependência: 0027_agenda_equipe. Nenhum binário, bucket ou cadastro paralelo.
alter table public.anexos add column agenda_evento_id uuid;
alter table public.anexos drop constraint anexos_pai_unico;
alter table public.anexos add constraint anexos_pai_unico check(num_nonnulls(pessoa_id,acao_id,qualificacao_id,ferramenta_id,calibracao_id,agenda_evento_id)=1),
 add constraint anexo_agenda_tenant foreign key(organization_id,agenda_evento_id) references public.agenda_eventos(organization_id,id) on delete restrict;
create index anexo_agenda on public.anexos(organization_id,agenda_evento_id,created_at desc,id) where agenda_evento_id is not null;

create function public.ag_anexo_autor_destino(_org uuid,_evento uuid,_autor uuid,_escrever boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select public.ag_autor_ler(_org,_evento,_autor) and exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.id=_evento
  and(not _escrever or(e.estado in('rascunho','publicado','em_andamento') and(public.operacao_autor_pode(_org,_autor,'gerir_operacao') or exists(
   select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.funcao in('responsavel','participante') and p.pessoa_id=public.ag_pessoa(_org,_autor))))));
$$;

-- Delegação mantém a matriz legada em um só local e preserva todas as chaves anteriores.
alter function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean) rename to operacao_autor_destino_anexo_ate27;
create function public.operacao_autor_destino_anexo(_org uuid,_pai jsonb,_autor uuid,_escrever boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare evento uuid:=nullif(_pai->>'agenda_evento_id','')::uuid;begin
 if evento is null then return public.operacao_autor_destino_anexo_ate27(_org,_pai-'agenda_evento_id',_autor,_escrever);end if;
 if num_nonnulls(nullif(_pai->>'pessoa_id',''),nullif(_pai->>'acao_id',''),nullif(_pai->>'qualificacao_id',''),nullif(_pai->>'ferramenta_id',''),nullif(_pai->>'calibracao_id',''),evento)<>1 then return false;end if;
 return public.ag_anexo_autor_destino(_org,evento,_autor,_escrever);
end$$;

alter function public.operacao_travar_pai_anexo(uuid,jsonb) rename to operacao_travar_pai_anexo_ate27;
create function public.operacao_travar_pai_anexo(_org uuid,_pai jsonb) returns void language plpgsql security definer set search_path='' as $$
declare evento uuid:=nullif(_pai->>'agenda_evento_id','')::uuid;e public.agenda_eventos;begin
 if evento is null then perform public.operacao_travar_pai_anexo_ate27(_org,_pai-'agenda_evento_id');return;end if;
 select * into e from public.agenda_eventos where organization_id=_org and id=evento;
 if not found then raise exception 'Registro indisponível.' using errcode='42501';end if;
 -- Todas as chamadas mutáveis tomam lev_travar_autor antes deste helper.
 perform public.ag_travar_origem(_org,e.acao_id,e.levantamento_id);
 perform 1 from public.agenda_eventos where organization_id=_org and id=evento for update;
 perform 1 from public.agenda_participantes where organization_id=_org and evento_id=evento and vigente order by pessoa_id,id for share;
end$$;

create function public.iniciar_anexo_agenda(_org uuid,_evento uuid,_chave uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;novo uuid:=gen_random_uuid();payload jsonb:=_dados||jsonb_build_object('agenda_evento_id',_evento);begin
 perform public.lev_travar_autor(_org,auth.uid());
 perform public.operacao_travar_pai_anexo(_org,jsonb_build_object('agenda_evento_id',_evento));
 if not public.ag_anexo_autor_destino(_org,_evento,auth.uid(),false) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 perform public.ag_payload(_dados,array['nome','mime','tamanho','sha256']);
 -- Repetição continua a exigir acesso atual; o handler relê o estado atual do arquivo.
 r:=public.operacao_repetir(_org,_chave,'iniciar_anexo_agenda',payload);if r is not null then return r;end if;
 if not public.ag_anexo_autor_destino(_org,_evento,auth.uid(),true) then raise exception 'O evento não aceita novos anexos para seu acesso atual.' using errcode='42501';end if;
 insert into public.anexos(id,organization_id,agenda_evento_id,nome,mime,tamanho,sha256,caminho)
 values(novo,_org,_evento,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/anexos/'||novo::text) returning * into a;
 return public.operacao_concluir(_org,_chave,'iniciar_anexo_agenda',payload,to_jsonb(a));
end$$;

create function public.ag_anexo_cancelavel(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.agenda_evento_id is not null and a.estado in('pendente','enviado') and public.ag_anexo_autor_destino(_org,a.agenda_evento_id,_autor,false)
  and(a.created_by=_autor or public.operacao_autor_pode(_org,_autor,'gerir_operacao')));
$$;

alter function public.cancelar_anexo_operacional(uuid,uuid,uuid,text) rename to cancelar_anexo_operacional_ate27;
create function public.cancelar_anexo_operacional(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;payload jsonb:=jsonb_build_object('id',_id,'motivo',_motivo);begin
 -- O caminho legado preserva autorização, payload idempotente e retorno.
 select * into a from public.anexos where organization_id=_org and id=_id;
 if a.agenda_evento_id is null then return public.cancelar_anexo_operacional_ate27(_org,_id,_chave,_motivo);end if;
 perform public.lev_travar_autor(_org,auth.uid());
 perform public.operacao_travar_pai_anexo(_org,to_jsonb(a));
 select * into a from public.anexos where organization_id=_org and id=_id for update;
 if not public.ag_anexo_autor_destino(_org,a.agenda_evento_id,auth.uid(),false) or not(a.created_by=auth.uid() or public.operacao_autor_pode(_org,auth.uid(),'gerir_operacao')) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if length(trim(coalesce(_motivo,''))) not between 5 and 2000 then raise exception 'Informe motivo com cinco a 2000 caracteres.' using errcode='23514';end if;
 r:=public.operacao_repetir(_org,_chave,'cancelar_anexo',payload);if r is not null then return r;end if;
 if a.estado not in('pendente','enviado') then raise exception 'Somente envio pendente pode ser cancelado.' using errcode='23514';end if;
 update public.anexos set estado='cancelado' where organization_id=_org and id=_id returning * into a;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'anexos',_id,'cancelar',_motivo);
 return public.operacao_concluir(_org,_chave,'cancelar_anexo',payload,to_jsonb(a));
end$$;

alter function public.listar_anexos_operacionais(uuid,jsonb) rename to listar_anexos_operacionais_ate27;
create function public.listar_anexos_operacionais(_org uuid,_pai jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare evento uuid:=nullif(_pai->>'agenda_evento_id','')::uuid;r jsonb;begin
 if evento is null then return public.listar_anexos_operacionais_ate27(_org,_pai-'agenda_evento_id');end if;
 perform public.ag_payload(_pai,array['pessoa_id','acao_id','qualificacao_id','ferramenta_id','calibracao_id','agenda_evento_id']);
 if not public.operacao_autor_destino_anexo(_org,_pai,auth.uid(),false) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select jsonb_build_object('registros',coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('pode_retomar',public.operacao_pode_enviar_anexo(_org,x.id),'pode_cancelar',public.ag_anexo_cancelavel(_org,x.id,auth.uid())) order by x.created_at desc,x.id),'[]'::jsonb),'permissoes',jsonb_build_object('adicionar',public.ag_anexo_autor_destino(_org,evento,auth.uid(),true))) into r
 from(select a.* from public.anexos a where a.organization_id=_org and a.agenda_evento_id=evento and a.estado<>'cancelado' order by a.created_at desc,a.id limit 50)x;
 return r;
end$$;

-- Confirmar/retomar/baixar e Storage continuam os mesmos caminhos canônicos.
-- Seus helpers de destino e lock agora reconhecem a FK explícita do evento.
revoke all on function public.operacao_autor_destino_anexo_ate27(uuid,jsonb,uuid,boolean),public.operacao_travar_pai_anexo_ate27(uuid,jsonb),public.cancelar_anexo_operacional_ate27(uuid,uuid,uuid,text),public.listar_anexos_operacionais_ate27(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean),public.operacao_travar_pai_anexo(uuid,jsonb),public.ag_anexo_autor_destino(uuid,uuid,uuid,boolean),public.ag_anexo_cancelavel(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.iniciar_anexo_agenda(uuid,uuid,uuid,jsonb),public.cancelar_anexo_operacional(uuid,uuid,uuid,text),public.listar_anexos_operacionais(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.iniciar_anexo_agenda(uuid,uuid,uuid,jsonb),public.cancelar_anexo_operacional(uuid,uuid,uuid,text),public.listar_anexos_operacionais(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
