-- Retificação formal pré-encerramento. Eventos, assinaturas e intervalos originais
-- permanecem intactos; projeção usa somente decisões técnicas imutáveis aprovadas.
-- Não autoriza entradas retroativas, reabre operações nem altera validade.
create table public.pet_retificacoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,pessoa_id uuid not null,
 evento_id uuid not null,intervalo_id uuid not null,modelo_versao_id uuid not null,evidencia_id uuid not null,
 momento_original timestamptz not null,momento_corrigido timestamptz not null,motivo text not null check(length(trim(motivo)) between 10 and 4000),
 intervalo_base_sha256 text not null check(intervalo_base_sha256~'^[0-9a-f]{64}$'),procedimento_sha256 text not null check(procedimento_sha256~'^[0-9a-f]{64}$'),
 registrante_original uuid not null references auth.users(id),solicitado_por uuid not null default auth.uid() references auth.users(id),
 solicitado_em timestamptz not null default clock_timestamp(),version_pet integer not null,
 unique(organization_id,id),unique(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,evento_id) references public.pet_eventos_presenca(organization_id,pet_id,id),
 foreign key(organization_id,intervalo_id) references public.pet_intervalos(organization_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
 foreign key(organization_id,modelo_versao_id) references public.pet_modelo_versoes(organization_id,id),
 foreign key(organization_id,evidencia_id) references public.anexos(organization_id,id)
);
create table public.pet_retificacao_decisoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,retificacao_id uuid not null,
 decisao text not null check(decisao in('aprovada','recusada')),responsavel_id uuid not null,
 motivo text not null check(length(trim(motivo)) between 10 and 4000),revisao_id uuid,
 decidido_por uuid not null default auth.uid() references auth.users(id),decidido_em timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,retificacao_id),
 foreign key(organization_id,pet_id,retificacao_id) references public.pet_retificacoes(organization_id,pet_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id),
 foreign key(organization_id,pet_id,revisao_id) references public.pet_revisoes(organization_id,pet_id,id) deferrable initially deferred
);
-- Vínculos fundamentais também são declarativos: uma evidência/intervalo de
-- outra PET da mesma organização não pode ser usado nem por um adaptador privilegiado.
alter table public.pet_intervalos add constraint pet_intervalo_pessoa_contexto unique(organization_id,pet_id,id,pessoa_id);
alter table public.anexos add constraint anexo_pet_contexto unique(organization_id,pet_id,id);
alter table public.pet_retificacoes add constraint pet_retificacao_intervalo_contexto foreign key(organization_id,pet_id,intervalo_id,pessoa_id) references public.pet_intervalos(organization_id,pet_id,id,pessoa_id);
alter table public.pet_retificacoes add constraint pet_retificacao_evidencia_contexto foreign key(organization_id,pet_id,evidencia_id) references public.anexos(organization_id,pet_id,id);
alter table public.pet_documentos add constraint pet_documento_anexo_contexto foreign key(organization_id,pet_id,anexo_id) references public.anexos(organization_id,pet_id,id);
create index pet_retificacoes_evento on public.pet_retificacoes(organization_id,evento_id,solicitado_em desc,id);
create index pet_retificacoes_pet on public.pet_retificacoes(organization_id,pet_id,solicitado_em desc,id);
alter table public.pet_retificacoes enable row level security;
alter table public.pet_retificacao_decisoes enable row level security;
revoke all on public.pet_retificacoes,public.pet_retificacao_decisoes from public,anon,authenticated,service_role;
grant select on public.pet_retificacoes,public.pet_retificacao_decisoes to authenticated;
create policy pet_ler on public.pet_retificacoes for select to authenticated using(public.pet_ler(organization_id,pet_id));
create policy pet_ler on public.pet_retificacao_decisoes for select to authenticated using(public.pet_ler(organization_id,pet_id));
create trigger pet_imutavel before update or delete on public.pet_retificacoes for each row execute function public.pet_imutavel();
create trigger pet_imutavel before update or delete on public.pet_retificacao_decisoes for each row execute function public.pet_imutavel();

-- Projeção canônica interna. Relatórios distinguem os horários originais e corrigidos.
create function public.pet_intervalos_efetivos(p_org uuid,p_pet uuid default null)
 returns table(id uuid,pet_id uuid,pessoa_id uuid,entrada_id uuid,saida_id uuid,entrada_original_em timestamptz,saida_original_em timestamptz,entrada_em timestamptz,saida_em timestamptz,retificacao_entrada_id uuid,retificacao_saida_id uuid)
 language sql stable security definer set search_path='' as $$
 select i.id,i.pet_id,i.pessoa_id,i.entrada_id,i.saida_id,i.entrada_em,i.saida_em,
 coalesce(re.momento_corrigido,i.entrada_em),coalesce(rs.momento_corrigido,i.saida_em),re.id,rs.id
 from public.pet_intervalos i
 left join lateral(
  select r.id,r.momento_corrigido from public.pet_retificacoes r join public.pet_retificacao_decisoes d
   on d.organization_id=r.organization_id and d.retificacao_id=r.id and d.decisao='aprovada'
  where r.organization_id=i.organization_id and r.pet_id=i.pet_id and r.evento_id=i.entrada_id
  order by d.decidido_em desc,d.id desc limit 1
 )re on true
 left join lateral(
  select r.id,r.momento_corrigido from public.pet_retificacoes r join public.pet_retificacao_decisoes d
   on d.organization_id=r.organization_id and d.retificacao_id=r.id and d.decisao='aprovada'
  where r.organization_id=i.organization_id and r.pet_id=i.pet_id and r.evento_id=i.saida_id
  order by d.decidido_em desc,d.id desc limit 1
 )rs on true
 where i.organization_id=p_org and(p_pet is null or i.pet_id=p_pet);
$$;
create function public.pet_retificacao_validar(p_org uuid,p_pet uuid,p_evento uuid,p_corrigido timestamptz)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pet_permissoes;e public.pet_eventos_presenca;m public.pet_modelo_versoes;i record;a timestamptz;b timestamptz;limite numeric;begin
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_pet for update;
 if p.id is null or p.estado_documental<>'encerramento_pendente' or p.condicao_operacional<>'terminada' or p.termino_operacional_em is null
  or exists(select 1 from public.pet_intervalos where organization_id=p_org and pet_id=p_pet and saida_em is null)
  or exists(select 1 from public.pet_revisoes where organization_id=p_org and pet_id=p_pet and finalidade='encerramento')
 then raise exception 'Retificação operacional exige todas as saídas conferidas e revisão final ainda não preparada. Após a revisão final, use aditamento certificado próprio.' using errcode='23514';end if;
 select * into e from public.pet_eventos_presenca where organization_id=p_org and pet_id=p_pet and id=p_evento and tipo in('entrada','saida');
 if not found then raise exception 'Evento original indisponível.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pet-presenca:'||p_org::text||e.pessoa_id::text,0));
 select * into m from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id for share;
 if m.estado is distinct from 'aprovado' or m.procedimento#>>'{retificacao,permitida}' is distinct from 'true'
  or m.procedimento#>>'{retificacao,metodo}' is distinct from 'revisao_independente_pre_encerramento'
  or m.procedimento#>>'{retificacao,exige_evidencia}' is distinct from 'true'
 then raise exception 'Procedimento aprovado não prevê este método de retificação, limites e evidências. Publique e aprove o procedimento antes da operação.' using errcode='23514';end if;
 limite:=nullif(m.procedimento#>>'{retificacao,tolerancia_max_segundos}','')::numeric;
 if limite is null or limite<1 or limite>86400 or p_corrigido is null or p_corrigido>clock_timestamp()
  or abs(extract(epoch from(p_corrigido-e.momento_declarado)))>limite
 then raise exception 'Horário proposto fora da tolerância original aprovada ou no futuro.' using errcode='23514';end if;
 select * into i from public.pet_intervalos_efetivos(p_org,p_pet) where entrada_id=p_evento or saida_id=p_evento;
 if not found or i.saida_em is null then raise exception 'Intervalo individual ainda não está fechado.' using errcode='23514';end if;
 a:=case when e.tipo='entrada' then p_corrigido else i.entrada_em end;
 b:=case when e.tipo='saida' then p_corrigido else i.saida_em end;
 if b<a or a<p.emitida_em or a>=p.termino_previsto or b>p.termino_operacional_em then
  raise exception 'A correção deve manter entrada/saída ordenadas, entrada na validade e término operacional já declarado. Não altera autorização nem término operacional.' using errcode='23514';
 end if;
 if exists(select 1 from public.pet_intervalos_efetivos(p_org) outro where outro.pessoa_id=e.pessoa_id and outro.id<>i.id
  and tstzrange(outro.entrada_em,coalesce(outro.saida_em,'infinity'::timestamptz),'[)') && tstzrange(a,b,'[)')) then
  raise exception 'A correção sobrepõe outro intervalo da mesma pessoa. Confira as fontes antes de decidir.' using errcode='23P01';
 end if;
 return jsonb_build_object('intervalo_id',i.id,'pessoa_id',e.pessoa_id,'momento_original',e.momento_declarado,'registrante_original',e.created_by,'modelo_versao_id',m.id,'procedimento_sha256',m.sha256,
  'intervalo_base_sha256',public.pet_sha256(to_jsonb(i)),'entrada_corrigida_em',a,'saida_corrigida_em',b);
end$$;

create function public.pet_retificar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cmd text:=p_comando->>'comando';d jsonb:=p_comando->'dados';chave uuid:=(p_comando->>'chave')::uuid;
 p public.pet_permissoes;r public.pet_retificacoes;dec public.pet_retificacao_decisoes;base jsonb;res jsonb;snap jsonb;pid uuid;rid uuid;versao integer;begin
 perform public.ag_payload(p_comando,array['comando','chave','dados']);
 if chave is null or jsonb_typeof(d) is distinct from 'object' then raise exception 'Chave e dados obrigatórios.' using errcode='23514';end if;
 if cmd not in('solicitar','decidir') then raise exception 'Comando de retificação inválido.' using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.operacao_pode(p_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if cmd='solicitar' then
  perform public.ag_payload(d,array['pet_id','expected_version','evento_id','momento_corrigido','motivo','evidencia_id']);pid:=(d->>'pet_id')::uuid;
 else
  perform public.ag_payload(d,array['retificacao_id','expected_version','responsavel_id','decisao','motivo']);
  select * into r from public.pet_retificacoes where organization_id=p_org and id=(d->>'retificacao_id')::uuid;
  if not found then raise exception 'Registro indisponível.' using errcode='42501';end if;pid:=r.pet_id;
 end if;
 select * into p from public.pet_permissoes where organization_id=p_org and id=pid for update;
 if not found or not public.pet_operar(p_org,pid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 -- Autorização atual também é exigida para replay de uma decisão.
 if cmd='decidir' and(not public.operacao_pode(p_org,'revisar_operacao') or not exists(select 1 from public.pet_responsaveis_tecnicos t join public.pessoas pe on pe.organization_id=t.organization_id and pe.id=t.pessoa_id
  where t.organization_id=p_org and t.pessoa_id=(d->>'responsavel_id')::uuid and t.inicio<=clock_timestamp() and(t.fim is null or t.fim>clock_timestamp())
   and pe.user_id=auth.uid() and pe.ativa and length(trim(coalesce(pe.registro_profissional,'')))>=3)
  or r.solicitado_por=auth.uid() or r.registrante_original=auth.uid() or public.operacao_identidade_propria(p_org,r.pessoa_id)) then
  raise exception 'Decisão exige responsável técnico designado em sessão própria, diferente do solicitante, registrante original e trabalhador.' using errcode='42501';
 end if;
 res:=public.operacao_repetir(p_org,chave,'pet_retificacao:'||cmd,d);
 if res is not null then return res||jsonb_build_object('detalhe',public.pet_obter(p_org,pid));end if;
 if p.version is distinct from(d->>'expected_version')::integer then raise exception 'PET alterada; confira a revisão atual antes de retificar.' using errcode='40001';end if;
 if cmd='solicitar' then
  base:=public.pet_retificacao_validar(p_org,pid,(d->>'evento_id')::uuid,(d->>'momento_corrigido')::timestamptz);
  if not exists(select 1 from public.anexos a where a.organization_id=p_org and a.id=(d->>'evidencia_id')::uuid and a.pet_id=pid and a.estado='vinculado') then raise exception 'Vincule evidência privada confirmada da correção à mesma PET.' using errcode='23514';end if;
  insert into public.pet_retificacoes(organization_id,pet_id,pessoa_id,evento_id,intervalo_id,modelo_versao_id,evidencia_id,momento_original,momento_corrigido,motivo,intervalo_base_sha256,procedimento_sha256,registrante_original,version_pet)
  values(p_org,pid,(base->>'pessoa_id')::uuid,(d->>'evento_id')::uuid,(base->>'intervalo_id')::uuid,(base->>'modelo_versao_id')::uuid,(d->>'evidencia_id')::uuid,(base->>'momento_original')::timestamptz,(d->>'momento_corrigido')::timestamptz,public.ag_texto(d,'motivo',10,4000),base->>'intervalo_base_sha256',base->>'procedimento_sha256',(base->>'registrante_original')::uuid,p.version) returning * into r;
  update public.pet_permissoes set version=version where id=pid;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'retificacao_proposta',r.motivo,jsonb_build_object('retificacao_id',r.id,'evento_id',r.evento_id,'momento_original',r.momento_original,'momento_corrigido',r.momento_corrigido));
 else
  if d->>'decisao' not in('aprovar','recusar') then raise exception 'Decisão inválida.' using errcode='23514';end if;
  if exists(select 1 from public.pet_retificacao_decisoes where organization_id=p_org and retificacao_id=r.id) then raise exception 'Solicitação já decidida; preserve a decisão anterior.' using errcode='23505';end if;
  if d->>'decisao'='aprovar' then
   base:=public.pet_retificacao_validar(p_org,pid,r.evento_id,r.momento_corrigido);
   if base->>'intervalo_base_sha256'<>r.intervalo_base_sha256 or base->>'procedimento_sha256'<>r.procedimento_sha256 then raise exception 'Intervalo ou procedimento mudou após a solicitação. Faça nova proposta mantendo a anterior.' using errcode='40001';end if;
   rid:=gen_random_uuid();
   insert into public.pet_retificacao_decisoes(organization_id,pet_id,retificacao_id,decisao,responsavel_id,motivo,revisao_id)
   values(p_org,pid,r.id,'aprovada',(d->>'responsavel_id')::uuid,public.ag_texto(d,'motivo',10,4000),rid) returning * into dec;
   snap:=jsonb_build_object('pet_id',pid,'numero',p.numero,'revisao_anterior_id',p.revisao_atual_id,'revisao_anterior_sha256',(select v.sha256 from public.pet_revisoes v where v.id=p.revisao_atual_id),
    'retificacao',to_jsonb(r),'decisao',to_jsonb(dec),'intervalos_efetivos',(select jsonb_agg(to_jsonb(i) order by i.entrada_em,i.id) from public.pet_intervalos_efetivos(p_org,pid)i));
   select coalesce(max(v.versao),0)+1 into versao from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=pid;
   insert into public.pet_revisoes(id,organization_id,pet_id,versao,conteudo,sha256,finalidade) values(rid,p_org,pid,versao,snap,public.pet_sha256(snap),'retificacao');
   -- FK diferida vincula decisão e revisão criadas na mesma transação, sem UPDATE histórico.
   update public.pet_permissoes set revisao_atual_id=rid where id=pid;
  else
   insert into public.pet_retificacao_decisoes(organization_id,pet_id,retificacao_id,decisao,responsavel_id,motivo) values(p_org,pid,r.id,'recusada',(d->>'responsavel_id')::uuid,public.ag_texto(d,'motivo',10,4000)) returning * into dec;
   update public.pet_permissoes set version=version where id=pid;
  end if;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'retificacao_'||dec.decisao,dec.motivo,jsonb_build_object('retificacao_id',r.id,'decisao_id',dec.id,'revisao_id',rid));
 end if;
 res:=jsonb_build_object('retificacao',to_jsonb(r),'decisao',to_jsonb(dec),'pet_id',pid);
 perform public.operacao_concluir(p_org,chave,'pet_retificacao:'||cmd,d,res);
 return res||jsonb_build_object('detalhe',public.pet_obter(p_org,pid));
end$$;

alter function public.pet_obter(uuid,uuid) rename to pet_obter_ate31;
create function public.pet_obter(p_org uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;arr jsonb;total numeric;agora timestamptz:=clock_timestamp();begin
 r:=public.pet_obter_ate31(p_org,p_id);
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('organization_id',p_org,'pessoa_nome',(select pt.nome_snapshot from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=p_id and pt.pessoa_id=i.pessoa_id order by pt.created_at desc,pt.id desc limit 1),
  'segundos',greatest(0,floor(extract(epoch from(coalesce(i.saida_em,agora)-i.entrada_em))))) order by i.entrada_em,i.id),'[]'),
  coalesce(sum(greatest(0,floor(extract(epoch from(coalesce(i.saida_em,agora)-i.entrada_em))))),0) into arr,total from public.pet_intervalos_efetivos(p_org,p_id)i;
 return jsonb_set(r,'{intervalos}',arr)||jsonb_build_object('metricas',(r->'metricas')||jsonb_build_object('permanencia_segundos',total,'horas_pessoa_segundos',total),
  'retificacoes',coalesce((select jsonb_agg(to_jsonb(x) order by x.solicitado_em,x.id) from public.pet_retificacoes x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
  'retificacao_decisoes',coalesce((select jsonb_agg(to_jsonb(x) order by x.decidido_em,x.id) from public.pet_retificacao_decisoes x where x.organization_id=p_org and x.pet_id=p_id),'[]'));
end$$;

-- Mantém o comando e o hash de requests existentes. A única adaptação é incluir
-- a projeção aprovada no NOVO snapshot final antes que ele possa receber assinatura.
alter function public.pet_executar(uuid,jsonb) rename to pet_executar_ate31;
create function public.pet_executar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=nullif(p_comando#>>'{dados,pet_id}','')::uuid;anterior uuid;atual uuid;rid uuid;r jsonb;snap jsonb;versao integer;begin
 if p_comando->>'comando'<>'encerrar' then return public.pet_executar_ate31(p_org,p_comando);end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pet_operar(p_org,pid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select revisao_atual_id into anterior from public.pet_permissoes where organization_id=p_org and id=pid for update;
 r:=public.pet_executar_ate31(p_org,p_comando);
 select revisao_atual_id into atual from public.pet_permissoes where organization_id=p_org and id=pid;
 if atual is distinct from anterior and exists(select 1 from public.pet_retificacao_decisoes where organization_id=p_org and pet_id=pid and decisao='aprovada') then
  select v.conteudo into snap from public.pet_revisoes v where v.organization_id=p_org and v.id=atual and v.finalidade='encerramento';
  if snap is not null then
   snap:=snap||jsonb_build_object('snapshot_preliminar_id',atual,'intervalos',(select jsonb_agg(to_jsonb(i) order by i.entrada_em,i.id) from public.pet_intervalos_efetivos(p_org,pid)i),
    'retificacoes',(select jsonb_agg(jsonb_build_object('solicitacao',to_jsonb(s),'decisao',to_jsonb(d)) order by d.decidido_em,d.id) from public.pet_retificacoes s join public.pet_retificacao_decisoes d on d.organization_id=s.organization_id and d.retificacao_id=s.id where s.organization_id=p_org and s.pet_id=pid and d.decisao='aprovada'));
   select coalesce(max(v.versao),0)+1 into versao from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=pid;
   insert into public.pet_revisoes(organization_id,pet_id,versao,conteudo,sha256,finalidade) values(p_org,pid,versao,snap,public.pet_sha256(snap),'encerramento') returning id into rid;
   update public.pet_permissoes set revisao_atual_id=rid where id=pid;
  end if;
 end if;
 return r||jsonb_build_object('detalhe',public.pet_obter(p_org,pid));
end$$;
revoke all on function public.pet_intervalos_efetivos(uuid,uuid),public.pet_retificacao_validar(uuid,uuid,uuid,timestamptz),public.pet_obter_ate31(uuid,uuid),public.pet_executar_ate31(uuid,jsonb),public.pet_retificar(uuid,jsonb),public.pet_obter(uuid,uuid),public.pet_executar(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pet_retificar(uuid,jsonb),public.pet_obter(uuid,uuid),public.pet_executar(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
