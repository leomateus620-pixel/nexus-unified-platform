-- Evidências PET no pipeline canônico privado, sem mudar payloads legados.
-- Dependência 0030. Relação ao item é imutável e validada no preparo.
alter table public.anexos add column pet_id uuid;
alter table public.anexos add column pet_item text check(pet_item is null or(pet_id is not null and length(pet_item) between 1 and 120));
alter table public.anexos drop constraint anexos_pai_unico;
alter table public.anexos add constraint anexos_pai_unico check(num_nonnulls(pessoa_id,acao_id,qualificacao_id,ferramenta_id,calibracao_id,agenda_evento_id,pet_id)=1),
 add constraint anexo_pet_tenant foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id) on delete restrict;
create index anexo_pet on public.anexos(organization_id,pet_id,created_at desc,id) where pet_id is not null;

create function public.pet_anexo_autor_destino(_org uuid,_pet uuid,_autor uuid,_escrever boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select public.pet_autor_ler(_org,_pet,_autor) and exists(select 1 from public.pet_permissoes e where e.organization_id=_org and e.id=_pet
  and(not _escrever or(e.estado_documental not in('encerrada','cancelada') and(public.operacao_autor_pode(_org,_autor,'gerir_operacao') or exists(
   select 1 from public.pet_participantes p where p.organization_id=_org and p.pet_id=e.id and p.fim is null and p.funcao in('supervisor','vigia','substituto_vigia') and exists(select 1 from public.pessoas pe where pe.organization_id=_org and pe.id=p.pessoa_id and pe.user_id=_autor and pe.ativa))))));
$$;

-- Delegação mantém a matriz legada em um só local e preserva todas as chaves anteriores.
alter function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean) rename to operacao_autor_destino_anexo_ate30;
create function public.operacao_autor_destino_anexo(_org uuid,_pai jsonb,_autor uuid,_escrever boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare pet uuid:=nullif(_pai->>'pet_id','')::uuid;begin
 if pet is null then return public.operacao_autor_destino_anexo_ate30(_org,_pai-array['pet_id','pet_item'],_autor,_escrever);end if;
 if num_nonnulls(nullif(_pai->>'pessoa_id',''),nullif(_pai->>'acao_id',''),nullif(_pai->>'qualificacao_id',''),nullif(_pai->>'ferramenta_id',''),nullif(_pai->>'calibracao_id',''),nullif(_pai->>'agenda_evento_id',''),pet)<>1 then return false;end if;
 return public.pet_anexo_autor_destino(_org,pet,_autor,_escrever);
end$$;

alter function public.operacao_travar_pai_anexo(uuid,jsonb) rename to operacao_travar_pai_anexo_ate30;
create function public.operacao_travar_pai_anexo(_org uuid,_pai jsonb) returns void language plpgsql security definer set search_path='' as $$
declare pet uuid:=nullif(_pai->>'pet_id','')::uuid;e public.pet_permissoes;begin
 if pet is null then perform public.operacao_travar_pai_anexo_ate30(_org,_pai-array['pet_id','pet_item']);return;end if;
 select * into e from public.pet_permissoes where organization_id=_org and id=pet;
 if not found then raise exception 'Registro indisponível.' using errcode='42501';end if;
 -- Same parent lock as PET commands; no unrelated OS lock on evidence upload.
 perform 1 from public.pet_permissoes where organization_id=_org and id=pet for update;
 perform 1 from public.pet_participantes where organization_id=_org and pet_id=pet and fim is null order by pessoa_id,id for share;
end$$;

create function public.iniciar_anexo_pet(_org uuid,_pet uuid,_chave uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;novo uuid:=gen_random_uuid();payload jsonb:=_dados||jsonb_build_object('pet_id',_pet);begin
 perform public.lev_travar_autor(_org,auth.uid());
 perform public.operacao_travar_pai_anexo(_org,jsonb_build_object('pet_id',_pet));
 if not public.pet_anexo_autor_destino(_org,_pet,auth.uid(),false) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 perform public.alm_validar_payload(_dados,array['nome','mime','tamanho','sha256','pet_item']);
 -- Repetição continua a exigir acesso atual; o handler relê o estado atual do arquivo.
 r:=public.operacao_repetir(_org,_chave,'iniciar_anexo_pet',payload);if r is not null then return r;end if;
 if not public.pet_anexo_autor_destino(_org,_pet,auth.uid(),true) then raise exception 'O pet não aceita novos anexos para seu acesso atual.' using errcode='42501';end if;
 insert into public.anexos(id,organization_id,pet_id,pet_item,nome,mime,tamanho,sha256,caminho)
 values(novo,_org,_pet,nullif(_dados->>'pet_item',''),_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/anexos/'||novo::text) returning * into a;
 return public.operacao_concluir(_org,_chave,'iniciar_anexo_pet',payload,to_jsonb(a));
end$$;

create function public.pet_anexo_cancelavel(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.pet_id is not null and a.estado in('pendente','enviado') and public.pet_anexo_autor_destino(_org,a.pet_id,_autor,false)
  and(a.created_by=_autor or public.operacao_autor_pode(_org,_autor,'gerir_operacao')));
$$;

alter function public.cancelar_anexo_operacional(uuid,uuid,uuid,text) rename to cancelar_anexo_operacional_ate30;
create function public.cancelar_anexo_operacional(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;payload jsonb:=jsonb_build_object('id',_id,'motivo',_motivo);begin
 -- O caminho legado preserva autorização, payload idempotente e retorno.
 select * into a from public.anexos where organization_id=_org and id=_id;
 if a.pet_id is null then return public.cancelar_anexo_operacional_ate30(_org,_id,_chave,_motivo);end if;
 perform public.lev_travar_autor(_org,auth.uid());
 perform public.operacao_travar_pai_anexo(_org,to_jsonb(a));
 select * into a from public.anexos where organization_id=_org and id=_id for update;
 if not public.pet_anexo_autor_destino(_org,a.pet_id,auth.uid(),false) or not(a.created_by=auth.uid() or public.operacao_autor_pode(_org,auth.uid(),'gerir_operacao')) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if length(trim(coalesce(_motivo,''))) not between 5 and 2000 then raise exception 'Informe motivo com cinco a 2000 caracteres.' using errcode='23514';end if;
 r:=public.operacao_repetir(_org,_chave,'cancelar_anexo',payload);if r is not null then return r;end if;
 if a.estado not in('pendente','enviado') then raise exception 'Somente envio pendente pode ser cancelado.' using errcode='23514';end if;
 update public.anexos set estado='cancelado' where organization_id=_org and id=_id returning * into a;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'anexos',_id,'cancelar',_motivo);
 return public.operacao_concluir(_org,_chave,'cancelar_anexo',payload,to_jsonb(a));
end$$;

alter function public.listar_anexos_operacionais(uuid,jsonb) rename to listar_anexos_operacionais_ate30;
create function public.listar_anexos_operacionais(_org uuid,_pai jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pet uuid:=nullif(_pai->>'pet_id','')::uuid;r jsonb;begin
 if pet is null then return public.listar_anexos_operacionais_ate30(_org,_pai-array['pet_id','pet_item']);end if;
 perform public.alm_validar_payload(_pai,array['pessoa_id','acao_id','qualificacao_id','ferramenta_id','calibracao_id','agenda_evento_id','pet_id','pet_item']);
 if not public.operacao_autor_destino_anexo(_org,_pai,auth.uid(),false) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select jsonb_build_object('registros',coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('pode_retomar',public.operacao_pode_enviar_anexo(_org,x.id),'pode_cancelar',public.pet_anexo_cancelavel(_org,x.id,auth.uid())) order by x.created_at desc,x.id),'[]'::jsonb),'permissoes',jsonb_build_object('adicionar',public.pet_anexo_autor_destino(_org,pet,auth.uid(),true))) into r
 from(select a.* from public.anexos a where a.organization_id=_org and a.pet_id=pet and (nullif(_pai->>'pet_item','') is null or a.pet_item=_pai->>'pet_item') and a.estado<>'cancelado' order by a.created_at desc,a.id limit 50)x;
 return r;
end$$;

-- Confirmar/retomar/baixar e Storage continuam os mesmos caminhos canônicos.
-- Seus helpers de destino e lock agora reconhecem a FK explícita do pet.
revoke all on function public.operacao_autor_destino_anexo_ate30(uuid,jsonb,uuid,boolean),public.operacao_travar_pai_anexo_ate30(uuid,jsonb),public.cancelar_anexo_operacional_ate30(uuid,uuid,uuid,text),public.listar_anexos_operacionais_ate30(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean),public.operacao_travar_pai_anexo(uuid,jsonb),public.pet_anexo_autor_destino(uuid,uuid,uuid,boolean),public.pet_anexo_cancelavel(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.iniciar_anexo_pet(uuid,uuid,uuid,jsonb),public.cancelar_anexo_operacional(uuid,uuid,uuid,text),public.listar_anexos_operacionais(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.iniciar_anexo_pet(uuid,uuid,uuid,jsonb),public.cancelar_anexo_operacional(uuid,uuid,uuid,text),public.listar_anexos_operacionais(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
