-- Relatórios derivados têm snapshot e arquivo próprios. Não emitem PET nem certificam assinatura.
-- Aditiva após 0032; os originais e os recibos anteriores permanecem intactos.
alter table public.pet_revisoes drop constraint pet_revisoes_finalidade_check;
alter table public.pet_revisoes add constraint pet_revisoes_finalidade_check
 check(finalidade in('conferencia','emissao','encerramento','retificacao','relatorio'));

create table public.pet_relatorio_jobs (
 documento_id uuid primary key,organization_id uuid not null,pet_id uuid not null,revisao_id uuid not null,
 pet_version integer not null check(pet_version>0),chave uuid not null,autor uuid not null references auth.users(id),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),snapshot_sha256 text not null check(snapshot_sha256~'^[0-9a-f]{64}$'),
 anexo_id uuid,arquivo_sha256 text check(arquivo_sha256~'^[0-9a-f]{64}$'),tamanho bigint check(tamanho between 1 and 20971520),
 created_at timestamptz not null default clock_timestamp(),finalizado_em timestamptz,
 unique(organization_id,autor,chave),unique(organization_id,documento_id),
 foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id),
 foreign key(organization_id,documento_id) references public.pet_documentos(organization_id,id),
 foreign key(organization_id,pet_id,revisao_id) references public.pet_revisoes(organization_id,pet_id,id),
 foreign key(organization_id,anexo_id) references public.anexos(organization_id,id),
 check(num_nonnulls(anexo_id,arquivo_sha256,tamanho) in(0,3))
);
create index pet_relatorio_jobs_lista on public.pet_relatorio_jobs(organization_id,pet_id,created_at desc);
alter table public.pet_relatorio_jobs enable row level security;
revoke all on public.pet_relatorio_jobs from public,anon,authenticated,service_role;

create function public.pet_relatorio_job_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.finalizado_em is not null or
  (to_jsonb(new)-array['anexo_id','arquivo_sha256','tamanho','finalizado_em']) is distinct from
  (to_jsonb(old)-array['anexo_id','arquivo_sha256','tamanho','finalizado_em']) or
  (old.anexo_id is not null and(new.anexo_id,new.arquivo_sha256,new.tamanho) is distinct from(old.anexo_id,old.arquivo_sha256,old.tamanho)) then
  raise exception 'Snapshot e intenção do relatório são imutáveis.' using errcode='23514';
 end if;return new;
end$$;
create trigger pet_relatorio_job_guard before update or delete on public.pet_relatorio_jobs
 for each row execute function public.pet_relatorio_job_guard();

create function public.pet_preparar_relatorio(p_org uuid,p_pet uuid,p_expected_version integer,p_chave uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pet_permissoes;j public.pet_relatorio_jobs;d public.pet_documentos;
 snap jsonb;files jsonb;rid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();versao integer;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_pet for update;
 if not found or not public.pet_ler(p_org,p_pet) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if p_chave is null then raise exception 'Informe uma chave idempotente para o relatório.' using errcode='23514';end if;
 select * into j from public.pet_relatorio_jobs where organization_id=p_org and autor=auth.uid() and chave=p_chave;
 if found then
  if j.pet_id<>p_pet or j.pet_version is distinct from p_expected_version then raise exception 'Chave de relatório usada com outro conteúdo.' using errcode='23505';end if;
  select * into d from public.pet_documentos where organization_id=p_org and id=j.documento_id;
  if d.estado='falha' then update public.pet_documentos set estado='gerando',erro=null where id=d.id returning * into d;end if;
  return jsonb_build_object('documento',to_jsonb(d),'snapshot',j.snapshot,'snapshot_sha256',j.snapshot_sha256,'pet_version',j.pet_version);
 end if;
 if p.version is distinct from p_expected_version then raise exception 'A PET mudou; confira a versão antes de gerar o relatório.' using errcode='40001';end if;
 -- Relatórios anteriores são documentos relacionados, sem cópia recursiva de seus snapshots.
 snap:=public.pet_obter(p_org,p_pet);
 snap:=jsonb_set(snap,'{revisoes}',coalesce((select jsonb_agg(x-'conteudo') from jsonb_array_elements(snap->'revisoes') x),'[]'));
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]') into files
 from public.anexos a where a.organization_id=p_org and a.pet_id=p_pet and a.estado='vinculado'
  and coalesce(a.pet_item,'') not like 'documento:%';
 if jsonb_array_length(files)>200 then raise exception 'A PET excede 200 evidências; é necessário processamento documental em lote.' using errcode='23514';end if;
 snap:=snap||jsonb_build_object('anexos',files,'relatorio_contexto',jsonb_build_object('documento_id',did,'revisao_relatorio_id',rid,'pet_version',p.version,'natureza','relatorio_derivado'));
 select coalesce(max(v.versao),0)+1 into versao from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=p_pet;
 insert into public.pet_revisoes(id,organization_id,pet_id,versao,conteudo,sha256,finalidade)
 values(rid,p_org,p_pet,versao,snap,public.pet_sha256(snap),'relatorio');
 insert into public.pet_documentos(id,organization_id,pet_id,revisao_id,tipo,estado)
 values(did,p_org,p_pet,rid,'relatorio_derivado','gerando') returning * into d;
 insert into public.pet_relatorio_jobs(documento_id,organization_id,pet_id,revisao_id,pet_version,chave,autor,snapshot,snapshot_sha256)
 values(did,p_org,p_pet,rid,p.version,p_chave,auth.uid(),snap,public.pet_sha256(snap));
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,versao)
 values(p_org,'pet_documentos',did,'relatorio_preparado',p.version);
 return jsonb_build_object('documento',to_jsonb(d),'snapshot',snap,'snapshot_sha256',public.pet_sha256(snap),'pet_version',p.version);
end$$;

-- Exceção mínima: somente o arquivo PDF do job autorizado, também após encerramento.
-- Não abre a inclusão de fotos/outros itens de uma PET encerrada.
create function public.pet_relatorio_anexo_autorizado(p_org uuid,p_pet uuid,p_item text,p_autor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_item~'^documento:[0-9a-f-]{36}$' and public.pet_autor_ler(p_org,p_pet,p_autor) and exists(
 select 1 from public.pet_relatorio_jobs j join public.pet_documentos d on d.organization_id=j.organization_id and d.id=j.documento_id
 where j.organization_id=p_org and j.pet_id=p_pet and j.autor=p_autor and 'documento:'||j.documento_id::text=p_item
  and d.tipo='relatorio_derivado' and d.estado in('gerando','falha') and j.finalizado_em is null);
$$;

alter function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean) rename to operacao_autor_destino_anexo_ate32;
create function public.operacao_autor_destino_anexo(_org uuid,_pai jsonb,_autor uuid,_escrever boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$begin
 if _escrever and nullif(_pai->>'pet_id','') is not null and coalesce(_pai->>'pet_item','') like 'documento:%' then
  return public.pet_relatorio_anexo_autorizado(_org,(_pai->>'pet_id')::uuid,_pai->>'pet_item',_autor)
   and num_nonnulls(nullif(_pai->>'pessoa_id',''),nullif(_pai->>'acao_id',''),nullif(_pai->>'qualificacao_id',''),nullif(_pai->>'ferramenta_id',''),nullif(_pai->>'calibracao_id',''),nullif(_pai->>'agenda_evento_id',''),nullif(_pai->>'pet_id',''))=1;
 end if;
 return public.operacao_autor_destino_anexo_ate32(_org,_pai,_autor,_escrever);
end$$;

alter function public.iniciar_anexo_pet(uuid,uuid,uuid,jsonb) rename to iniciar_anexo_pet_ate32;
create function public.iniciar_anexo_pet(_org uuid,_pet uuid,_chave uuid,_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.pet_relatorio_jobs;a public.anexos;r jsonb;novo uuid:=gen_random_uuid();
 payload jsonb:=_dados||jsonb_build_object('pet_id',_pet);begin
 if coalesce(_dados->>'pet_item','') not like 'documento:%' then return public.iniciar_anexo_pet_ate32(_org,_pet,_chave,_dados);end if;
 perform public.lev_travar_autor(_org,auth.uid());
 perform public.operacao_travar_pai_anexo(_org,jsonb_build_object('pet_id',_pet));
 if not public.pet_relatorio_anexo_autorizado(_org,_pet,_dados->>'pet_item',auth.uid()) then raise exception 'Documento indisponível para este envio.' using errcode='42501';end if;
 perform public.alm_validar_payload(_dados,array['nome','mime','tamanho','sha256','pet_item']);
 if _dados->>'mime'<>'application/pdf' then raise exception 'Relatório derivado exige arquivo PDF.' using errcode='23514';end if;
 select * into j from public.pet_relatorio_jobs where organization_id=_org and pet_id=_pet and 'documento:'||documento_id::text=_dados->>'pet_item' for update;
 r:=public.operacao_repetir(_org,_chave,'iniciar_anexo_pet',payload);if r is not null then return r;end if;
 if j.anexo_id is not null then
  select * into a from public.anexos where organization_id=_org and id=j.anexo_id;
  if a.sha256 is distinct from _dados->>'sha256' or a.tamanho is distinct from(_dados->>'tamanho')::bigint or a.nome is distinct from _dados->>'nome' or a.estado='cancelado' then
   raise exception 'O envio preparado possui outro conteúdo; solicite novo relatório.' using errcode='23514';end if;
 else
  insert into public.anexos(id,organization_id,pet_id,pet_item,nome,mime,tamanho,sha256,caminho)
  values(novo,_org,_pet,_dados->>'pet_item',_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/anexos/'||novo::text) returning * into a;
  update public.pet_relatorio_jobs set anexo_id=a.id,arquivo_sha256=a.sha256,tamanho=a.tamanho where documento_id=j.documento_id;
 end if;
 return public.operacao_concluir(_org,_chave,'iniciar_anexo_pet',payload,to_jsonb(a));
end$$;

create function public.pet_finalizar_relatorio(p_org uuid,p_documento uuid,p_autor uuid,p_anexo uuid,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.pet_relatorio_jobs;d public.pet_documentos;a public.anexos;begin
 perform public.lev_travar_autor(p_org,p_autor);
 select * into j from public.pet_relatorio_jobs where organization_id=p_org and documento_id=p_documento;
 if not found then raise exception 'Relatório indisponível.' using errcode='42501';end if;
 perform public.operacao_travar_pai_anexo(p_org,jsonb_build_object('pet_id',j.pet_id));
 select * into j from public.pet_relatorio_jobs where organization_id=p_org and documento_id=p_documento for update;
 if j.autor<>p_autor or not public.pet_autor_ler(p_org,j.pet_id,p_autor) then raise exception 'Acesso revogado.' using errcode='42501';end if;
 select * into d from public.pet_documentos where organization_id=p_org and id=p_documento for update;
 select * into a from public.anexos where organization_id=p_org and id=p_anexo for update;
 if a.id is null or a.pet_id<>j.pet_id or a.pet_item<>'documento:'||p_documento::text or a.estado<>'vinculado' or a.mime<>'application/pdf' or
  a.created_by<>p_autor or a.id is distinct from j.anexo_id or a.sha256 is distinct from p_sha256 or a.sha256 is distinct from j.arquivo_sha256 or a.tamanho is distinct from j.tamanho or
  d.tipo<>'relatorio_derivado' or d.revisao_id<>j.revisao_id or
  not exists(select 1 from public.pet_revisoes v where v.organization_id=p_org and v.id=j.revisao_id and v.pet_id=j.pet_id and v.finalidade='relatorio' and v.sha256=j.snapshot_sha256 and v.conteudo=j.snapshot) then
  raise exception 'Arquivo ou snapshot divergente do relatório preparado.' using errcode='23514';end if;
 if d.estado='disponivel' then
  if d.anexo_id<>p_anexo or d.sha256<>p_sha256 then raise exception 'Relatório disponível é imutável.' using errcode='23514';end if;return to_jsonb(d);
 end if;
 update public.pet_documentos set estado='disponivel',anexo_id=a.id,sha256=a.sha256,erro=null where id=d.id returning * into d;
 update public.pet_relatorio_jobs set finalizado_em=clock_timestamp() where documento_id=d.id;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao) values(p_org,'pet_documentos',d.id,'relatorio_arquivado');
 return to_jsonb(d);
end$$;

create function public.pet_relatorio_falhar(p_org uuid,p_documento uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$declare j public.pet_relatorio_jobs;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 select * into j from public.pet_relatorio_jobs where organization_id=p_org and documento_id=p_documento;
 if not found or j.autor<>auth.uid() or not public.pet_ler(p_org,j.pet_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 perform public.operacao_travar_pai_anexo(p_org,jsonb_build_object('pet_id',j.pet_id));
 update public.pet_documentos set estado='falha',erro=left(coalesce(nullif(trim(p_motivo),''),'Arquivamento não confirmado.'),1000)
 where organization_id=p_org and id=p_documento and tipo='relatorio_derivado' and estado in('solicitado','gerando','falha');
end$$;

create function public.pet_relatorio_documento_guard() returns trigger language plpgsql set search_path='' as $$begin
 if old.tipo='relatorio_derivado' and exists(select 1 from public.pet_relatorio_jobs where documento_id=old.id) and
  (tg_op='DELETE' or old.estado='disponivel' or(to_jsonb(new)-array['estado','anexo_id','sha256','erro']) is distinct from(to_jsonb(old)-array['estado','anexo_id','sha256','erro'])) then
  raise exception 'Identidade, snapshot e arquivo disponível do relatório são imutáveis.' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger pet_relatorio_documento_guard before update or delete on public.pet_documentos
 for each row execute function public.pet_relatorio_documento_guard();

revoke all on function public.operacao_autor_destino_anexo_ate32(uuid,jsonb,uuid,boolean),public.iniciar_anexo_pet_ate32(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.operacao_autor_destino_anexo(uuid,jsonb,uuid,boolean),public.pet_relatorio_anexo_autorizado(uuid,uuid,text,uuid),public.pet_relatorio_job_guard(),public.pet_relatorio_documento_guard() from public,anon,authenticated,service_role;
revoke all on function public.pet_preparar_relatorio(uuid,uuid,integer,uuid),public.iniciar_anexo_pet(uuid,uuid,uuid,jsonb),public.pet_finalizar_relatorio(uuid,uuid,uuid,uuid,text),public.pet_relatorio_falhar(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pet_preparar_relatorio(uuid,uuid,integer,uuid),public.iniciar_anexo_pet(uuid,uuid,uuid,jsonb),public.pet_relatorio_falhar(uuid,uuid,text) to authenticated;
grant execute on function public.pet_finalizar_relatorio(uuid,uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
