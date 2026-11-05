-- Jornada da unidade. Aditiva: OS históricas, atos, assinaturas e originais preservados.
alter table public.pet_permissoes alter column os_id drop not null;
alter table public.pet_permissoes add column local_nr_id uuid;
alter table public.pet_permissoes add column norma_origem text not null default 'NR33' check(norma_origem in('NR33','NR35'));
alter table public.pet_permissoes add constraint pet_local_contexto_fk foreign key(organization_id,cliente_id,unidade_id,local_nr_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id);
-- Vinculo legado apenas pela FK real de espaço, nunca por nome ou posição.
update public.pet_permissoes p set local_nr_id=l.id from public.nr_locais l where l.organization_id=p.organization_id and l.cliente_id=p.cliente_id and l.unidade_id=p.unidade_id and l.pet_espaco_id=p.espaco_id and 1=(select count(*) from public.nr_locais n where n.organization_id=p.organization_id and n.unidade_id=p.unidade_id and n.pet_espaco_id=p.espaco_id);
create function public.pet_local_guard() returns trigger language plpgsql set search_path='' as $$begin
 if (new.local_nr_id,new.norma_origem) is distinct from(old.local_nr_id,old.norma_origem) then raise exception 'O contexto histórico da PET é imutável.' using errcode='23514';end if;return new;
end$$;
create trigger pet_local_guard before update on public.pet_permissoes for each row execute function public.pet_local_guard();
create index pet_lista_espaco on public.pet_permissoes(organization_id,unidade_id,espaco_id,created_at desc,id);

create table public.nr_cenas_unidade(
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,
 cena text not null,versao integer not null default 1,estado text not null check(estado in('rascunho','publicada')),
 primary key(organization_id,unidade_id),unique(organization_id,cliente_id,unidade_id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id)
);
create table public.nr_cena_objetos(
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,chave text not null,local_id uuid not null,
 posicao_confirmada boolean not null default false, aliases text[] not null default '{}',
 primary key(organization_id,unidade_id,chave),unique(organization_id,unidade_id,local_id),
 foreign key(organization_id,cliente_id,unidade_id) references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
alter table public.nr_cenas_unidade enable row level security;
alter table public.nr_cena_objetos enable row level security;
revoke all on public.nr_cenas_unidade,public.nr_cena_objetos from public,anon,authenticated,service_role;
-- Não cria cliente, local ou espaço. Somente associa os cinco UUIDs existentes na unidade exata.
insert into public.nr_cenas_unidade(organization_id,cliente_id,unidade_id,cena,estado)
 select u.organization_id,u.cliente_id,u.id,'cotrirosa-racao-santa-rosa-v1','publicada' from public.unidades u
 where u.id='6a454dcc-82b2-4506-aca3-410a3cc820f2' and u.cliente_id='9d6dfbe8-285a-44e5-9ea1-2574daa7cb28'
 and 5=(select count(*) from public.nr_locais l where l.organization_id=u.organization_id and l.cliente_id=u.cliente_id and l.unidade_id=u.id and l.arquivado_em is null and l.id=any(array['ed835456-14f5-430a-a12b-55a92c86c018','8b0ed1b7-53df-4743-8be1-6b34221e471e','18f64e04-8674-4870-a7cd-8b633e1b2282','d1977ff8-36ab-4241-a884-bee802df1b94','c640b3bd-2731-490d-ab3a-d47a7953bce0']::uuid[]));
insert into public.nr_cena_objetos(organization_id,cliente_id,unidade_id,chave,local_id)
 select c.organization_id,c.cliente_id,c.unidade_id,v.chave,v.id::uuid from public.nr_cenas_unidade c cross join(values
 ('sa01','ed835456-14f5-430a-a12b-55a92c86c018'),('sa02','8b0ed1b7-53df-4743-8be1-6b34221e471e'),('sa03','18f64e04-8674-4870-a7cd-8b633e1b2282'),('sa04','d1977ff8-36ab-4241-a884-bee802df1b94'),('sa05','c640b3bd-2731-490d-ab3a-d47a7953bce0'))v(chave,id)
 where c.cena='cotrirosa-racao-santa-rosa-v1';
-- Apelidos documentados, sem alterar a grafia do cadastro nem atribuir documentos por texto.
update public.nr_cena_objetos set aliases=case chave when 'sa01' then array['S01'] when 'sa02' then array['S02'] when 'sa03' then array['S03'] when 'sa04' then array['S04'] when 'sa05' then array['AS 05'] else '{}'::text[] end;

create function public.nr_unidade_autorizada(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text) returns boolean language sql stable security definer set search_path='' as $$
 select p_norma in('NR33','NR35') and public.pode(p_org,'ver_nr') and exists(select 1 from public.nr_contextos_acervo(p_org)c join public.unidades u on u.organization_id=p_org and u.cliente_id=c.cliente_id and u.id=c.unidade_id join public.clientes cl on cl.organization_id=u.organization_id and cl.id=u.cliente_id where c.cliente_id=p_cliente and c.unidade_id=p_unidade and p_norma=any(c.normas) and u.arquivado_em is null and cl.arquivado_em is null)
$$;
create function public.nr_mapa_contexto(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c public.nr_cenas_unidade;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then raise exception 'Unidade indisponível neste contexto.' using errcode='42501';end if;
 select * into c from public.nr_cenas_unidade where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and estado='publicada';
 if not found then return jsonb_build_object('cena',null,'objetos','[]'::jsonb);end if;
 return jsonb_build_object('cena',c.cena,'versao',c.versao,'objetos',coalesce((select jsonb_agg(jsonb_build_object('chave',o.chave,'local_id',l.id,'tag',l.tag,'titulo',l.titulo,'aliases',l.aliases||o.aliases,'posicao_confirmada',o.posicao_confirmada)order by o.chave) from public.nr_cena_objetos o join public.nr_locais l on l.organization_id=o.organization_id and l.cliente_id=o.cliente_id and l.unidade_id=o.unidade_id and l.id=o.local_id where o.organization_id=p_org and o.unidade_id=p_unidade and l.arquivado_em is null and 'NR33'=any(l.normas) and p_norma=any(l.normas)),'[]'));
end$$;

create function public.pet_contexto_unidade(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_local uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare l public.nr_locais;v_gerir boolean;v_bloqueio text;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then raise exception 'Unidade indisponível neste contexto.' using errcode='42501';end if;
 v_gerir:=public.operacao_pode(p_org,'gerir_operacao');
 if p_local is not null then
  select * into l from public.nr_locais where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and id=p_local and arquivado_em is null and 'NR33'=any(normas) and p_norma=any(normas);
  if not found then raise exception 'Local indisponível para PET nesta unidade.' using errcode='42501';end if;
  if l.pet_espaco_id is null or not exists(select 1 from public.pet_espacos e where e.organization_id=p_org and e.unidade_id=p_unidade and e.id=l.pet_espaco_id and e.ativo) then v_bloqueio:='Vínculo com espaço operacional pendente. Solicite regularização ao responsável pelo cadastro.';end if;
 else v_bloqueio:='Selecione um local com espaço confinado vinculado.';end if;
 if not v_gerir then v_bloqueio:='Seu acesso não permite criar PET. Consulta NR não concede atribuição operacional.';end if;
 if v_bloqueio is null and not exists(select 1 from public.pet_modelo_versoes where organization_id=p_org and estado='aprovado') then v_bloqueio:='Procedimento aprovado indisponível. Solicite ao responsável técnico a regularização do modelo.';end if;
 return jsonb_build_object('local_id',l.id,'espaco_id',l.pet_espaco_id,'pode_criar',v_gerir and v_bloqueio is null,'pode_consultar',public.operacao_pode(p_org,'ver_operacao'),'bloqueio',v_bloqueio,
 'locais',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'tag',n.tag,'titulo',n.titulo,'pet_espaco_id',n.pet_espaco_id)order by public.nr_tag_ordem(n.tag))from public.nr_locais n where n.organization_id=p_org and n.cliente_id=p_cliente and n.unidade_id=p_unidade and n.arquivado_em is null and 'NR33'=any(n.normas) and p_norma=any(n.normas)),'[]'),
 'modelos',case when v_gerir then coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nome',m.nome,'versao',v.versao)) from public.pet_modelo_versoes v join public.pet_modelos m on m.organization_id=v.organization_id and m.id=v.modelo_id where v.organization_id=p_org and v.estado='aprovado'),'[]')else '[]'::jsonb end,
 'ordens',case when v_gerir then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'titulo',o.titulo))from public.ordens_servico o where o.organization_id=p_org and o.cliente_id=p_cliente and o.unidade_id=p_unidade and o.estado in('aberta','em_execucao') and public.os_ler(p_org,o.id)),'[]')else '[]'::jsonb end,
 'assinatura_configurada',public.operacao_pode(p_org,'ver_operacao') and exists(select 1 from public.pet_assinatura_integracoes where organization_id=p_org and configurada and icp_brasil));
end$$;

-- Todos os comandos antigos passam pelo mesmo motor; intercepta apenas criação contextual.
alter function public.pet_executar(uuid,jsonb) rename to pet_executar_ate60;
create function public.pet_executar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb:=p_comando->'dados';chave uuid:=(p_comando->>'chave')::uuid;r jsonb;l public.nr_locais;e public.pet_espacos;o public.ordens_servico;pid uuid;v_modelo uuid;v_agora timestamptz:=clock_timestamp();begin
 if p_comando->>'comando'<>'criar_pet' or not(d?'local_id')then return public.pet_executar_ate60(p_org,p_comando);end if;
 perform public.ag_payload(p_comando,array['chave','comando','dados']);
 perform public.ag_payload(d,array['cliente_id','unidade_id','local_id','espaco_id','norma','os_id','atividade','termino_previsto','timezone','modelo_versao_id']);
 if chave is null then raise exception 'Chave idempotente obrigatória.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.operacao_pode(p_org,'gerir_operacao') or not public.nr_unidade_autorizada(p_org,(d->>'cliente_id')::uuid,(d->>'unidade_id')::uuid,d->>'norma')then raise exception 'Acesso negado.'using errcode='42501';end if;
 -- Recibo continua sujeito ao acesso corrente, inclusive após revogação.
 r:=public.operacao_repetir(p_org,chave,'pet:criar_pet',d);
 if r is not null then return r||jsonb_build_object('detalhe',public.pet_obter(p_org,(r->>'id')::uuid));end if;
 select * into l from public.nr_locais where organization_id=p_org and cliente_id=(d->>'cliente_id')::uuid and unidade_id=(d->>'unidade_id')::uuid and id=(d->>'local_id')::uuid and pet_espaco_id=(d->>'espaco_id')::uuid and 'NR33'=any(normas) and d->>'norma'=any(normas) and arquivado_em is null for share;
 if not found then raise exception 'Local, unidade e espaço não correspondem.'using errcode='42501';end if;
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

create or replace function public.pet_listar(p_org uuid,p_filtros jsonb default '{}')returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_pagina integer:=greatest(0,coalesce((p_filtros->>'pagina')::integer,0));v_limite integer:=least(100,greatest(1,coalesce((p_filtros->>'limite')::integer,50)));v_os uuid:=nullif(p_filtros->>'os_id','')::uuid;v_unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;v_espaco uuid:=nullif(p_filtros->>'espaco_id','')::uuid;v_busca text:=lower(trim(coalesce(p_filtros->>'busca','')));r jsonb;begin
 if not public.operacao_pode(p_org,'ver_operacao')then raise exception 'Acesso negado.'using errcode='42501';end if;
 if v_espaco is not null and v_unidade is null then raise exception 'Informe a unidade do espaço.'using errcode='23514';end if;
 with filtradas as materialized(
 select p.*,coalesce(p.snapshot_identificacao#>>'{espaco,identificacao}',e.identificacao)as espaco_nome from public.pet_permissoes p join public.pet_espacos e on e.organization_id=p.organization_id and e.id=p.espaco_id
 where p.organization_id=p_org and public.pet_ler(p_org,p.id)and(v_os is null or p.os_id=v_os)and(v_unidade is null or p.unidade_id=v_unidade)and(v_espaco is null or p.espaco_id=v_espaco)
 and(coalesce(p_filtros->>'grupo','')not in('andamento','concluidas')or case when p_filtros->>'grupo'='andamento'then p.estado_documental not in('encerrada','cancelada')else p.estado_documental in('encerrada','cancelada')end)
 and(nullif(p_filtros->>'estado','')is null or p.estado_documental=p_filtros->>'estado')
 and(nullif(p_filtros->>'desde','')is null or p.created_at>=(p_filtros->>'desde')::timestamptz)
 and(nullif(p_filtros->>'ate','')is null or p.created_at<(p_filtros->>'ate')::timestamptz)
 and(v_busca=''or strpos(lower(concat_ws(' ',p.numero,p.atividade,p.estado_documental,p.snapshot_identificacao#>>'{espaco,identificacao}',p.snapshot_identificacao#>>'{local,tag}',p.snapshot_identificacao#>>'{local,aliases}',e.identificacao)),v_busca)>0)
 ),pagina as(select * from filtradas order by created_at desc,id limit v_limite offset v_pagina::bigint*v_limite),registros as(
 select p.*,(select pt.nome_snapshot from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=p.id and pt.funcao='supervisor'and pt.fim is null limit 1)as responsavel_nome,(select count(*)from public.pet_intervalos i where i.organization_id=p_org and i.pet_id=p.id and i.saida_em is null)as presentes,case when p.emitida_em is null then 'nao_emitida'when p.termino_previsto<=clock_timestamp()then 'expirada'else 'vigente'end as validade_temporal from pagina p)
 select jsonb_build_object('registros',coalesce((select jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id)from registros x),'[]'),'ordens',coalesce((select jsonb_agg(to_jsonb(o)order by o.created_at desc)from public.ordens_servico o where o.organization_id=p_org and public.os_ler(p_org,o.id)and(coalesce((p_filtros->>'contexto_unidade')::boolean,false)=false or o.unidade_id=v_unidade)),'[]'),'total',(select count(*)from filtradas),'pagina',v_pagina,'limite',v_limite)into r;return r;
end$$;
revoke all on function public.pet_local_guard(),public.nr_unidade_autorizada(uuid,uuid,uuid,text),public.pet_executar_ate60(uuid,jsonb),public.nr_mapa_contexto(uuid,uuid,uuid,text),public.pet_contexto_unidade(uuid,uuid,uuid,text,uuid),public.pet_executar(uuid,jsonb),public.pet_listar(uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_mapa_contexto(uuid,uuid,uuid,text),public.pet_contexto_unidade(uuid,uuid,uuid,text,uuid),public.pet_executar(uuid,jsonb),public.pet_listar(uuid,jsonb)to authenticated;
notify pgrst,'reload schema';
