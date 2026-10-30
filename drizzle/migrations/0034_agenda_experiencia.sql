-- Agenda: visualização e indicadores compartilham o mesmo universo autorizado.
-- Nenhuma ocorrência é expandida no cliente; cada agenda_eventos.id é uma ocorrência real.
alter table public.agenda_eventos drop constraint agenda_eventos_tipo_check;
alter table public.agenda_eventos add constraint agenda_eventos_tipo_check check(tipo in('sem_categoria','visita_tecnica','levantamento','execucao','inspecao','manutencao','reuniao','treinamento','acao_interna','deslocamento'));
alter table public.acoes_operacionais add column cliente_id uuid,add column projeto_id uuid,add column unidade_id uuid,add column local text not null default '' check(length(local)<=1000),
 add constraint acao_cliente foreign key(organization_id,cliente_id) references public.clientes(organization_id,id),
 add constraint acao_projeto foreign key(organization_id,cliente_id,projeto_id) references public.projetos(organization_id,cliente_id,id),
 add constraint acao_unidade foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 add constraint acao_contexto check((projeto_id is null and unidade_id is null) or cliente_id is not null);
create index agenda_cliente_periodo on public.agenda_eventos(organization_id,cliente_id,inicio) where cliente_id is not null;
create index agenda_projeto_periodo on public.agenda_eventos(organization_id,projeto_id,inicio) where projeto_id is not null;

create function public.ag_universo(_org uuid,_inicio date,_fim date,_filtros jsonb default '{}') returns setof public.agenda_eventos
language plpgsql stable security definer set search_path='' as $$
declare gestor boolean:=public.operacao_pode(_org,'gerir_operacao');tz text:='America/Sao_Paulo';begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _inicio is null or _fim is null or not isfinite(_inicio) or not isfinite(_fim) or _fim<=_inicio or _fim>_inicio+93 then raise exception 'Consulte uma janela de até 93 dias.' using errcode='23514';end if;
 perform public.ag_payload(_filtros,array['demanda','minha','busca','estado','tipo','equipe_id','pessoa_id','cliente_id','projeto_id','natureza','hora']);
 if length(coalesce(_filtros->>'busca',''))>120 or (nullif(_filtros->>'hora','')::integer is not null and (nullif(_filtros->>'hora','')::integer<0 or nullif(_filtros->>'hora','')::integer>23)) or (nullif(_filtros->>'natureza','') is not null and _filtros->>'natureza' not in('evento','acao')) then raise exception 'Confira os filtros da agenda.' using errcode='23514';end if;
 return query select e.* from public.agenda_eventos e
 where e.organization_id=_org and (case when gestor and e.acao_id is null and e.levantamento_id is null then true else public.agenda_ler_evento(_org,e.id) end)
 and ((e.dia_inteiro and daterange(e.data_inicio,e.data_fim,'[)')&&daterange(_inicio,_fim,'[)')) or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(_inicio::timestamp at time zone tz,_fim::timestamp at time zone tz,'[)')))
 and (not coalesce((_filtros->>'demanda')::boolean,false) or e.estado in('publicado','em_andamento','concluido'))
 and (nullif(_filtros->>'estado','') is null or e.estado=_filtros->>'estado')
 and (nullif(_filtros->>'tipo','') is null or e.tipo=_filtros->>'tipo')
 and (nullif(_filtros->>'cliente_id','') is null or e.cliente_id=(_filtros->>'cliente_id')::uuid)
 and (nullif(_filtros->>'projeto_id','') is null or e.projeto_id=(_filtros->>'projeto_id')::uuid)
 and (nullif(_filtros->>'natureza','') is null or case _filtros->>'natureza' when 'acao' then e.acao_id is not null else e.acao_id is null end)
 and strpos(lower(concat_ws(' ',e.titulo,e.local,e.descricao)),lower(coalesce(_filtros->>'busca','')))>0
 and (not coalesce((_filtros->>'minha')::boolean,false) or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.pessoa_id=public.ag_pessoa(_org,auth.uid())))
 and (nullif(_filtros->>'equipe_id','') is null or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.equipe_origem_id=(_filtros->>'equipe_id')::uuid))
 and (nullif(_filtros->>'pessoa_id','') is null or exists(select 1 from public.agenda_participantes p where p.organization_id=_org and p.evento_id=e.id and p.vigente and p.funcao<>'observador' and p.confirmacao<>'recusada' and p.pessoa_id=(_filtros->>'pessoa_id')::uuid))
 and (nullif(_filtros->>'hora','') is null or(not e.dia_inteiro and exists(select 1 from generate_series(_inicio::timestamp,(_fim-1)::timestamp,interval '1 day') d where tstzrange(e.inicio,e.fim,'[)')&&tstzrange((d+make_interval(hours=>(_filtros->>'hora')::integer)) at time zone tz,(d+make_interval(hours=>(_filtros->>'hora')::integer+1)) at time zone tz,'[)'))));
end$$;

create function public.ag_evento_resumo(_org uuid,_id uuid,_inicio date default null,_fim date default null) returns jsonb language sql stable security definer set search_path='' as $$
 select public.ag_evento_json(_org,_id,_inicio,_fim,'America/Sao_Paulo')||jsonb_build_object(
 'projeto_nome',(select p.codigo from public.projetos p where p.organization_id=_org and p.id=e.projeto_id),
 'pessoas',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',pa.pessoa_id,'nome',p.nome,'funcao',pa.funcao,'confirmacao',pa.confirmacao) order by (pa.funcao='responsavel') desc,p.nome,pa.pessoa_id) from public.agenda_participantes pa join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id where pa.organization_id=_org and pa.evento_id=e.id and pa.vigente),'[]')) from public.agenda_eventos e where e.organization_id=_org and e.id=_id;
$$;

create function public.ag_listar_v2(_org uuid,_inicio date,_fim date,_filtros jsonb default '{}',_pagina integer default 0,_limite integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;g boolean:=public.operacao_pode(_org,'gerir_operacao');begin
 if _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 100 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 with q as materialized(select * from public.ag_universo(_org,_inicio,_fim,_filtros)),ds as(select d::date data from generate_series(_inicio::timestamp,(_fim-1)::timestamp,interval '1 day')d)
 select jsonb_build_object('total',(select count(*) from q),'pagina',_pagina,'limite',_limite,'inicio',_inicio,'fim',_fim,'timezone','America/Sao_Paulo','minha_pessoa_id',public.ag_pessoa(_org,auth.uid()),'permissoes',jsonb_build_object('criar',g,'criar_acao',g,'gerir_series',g),
 'registros',coalesce((select jsonb_agg(public.ag_evento_resumo(_org,e.id,_inicio,_fim) order by e.inicio,e.id) from(select * from q order by inicio,id offset _pagina::bigint*_limite limit _limite)e),'[]'),
 'dias',(select jsonb_agg(jsonb_build_object('data',d.data,'total',(select count(*) from q e where(e.dia_inteiro and d.data>=e.data_inicio and d.data<e.data_fim)or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(d.data::timestamp at time zone 'America/Sao_Paulo',(d.data+1)::timestamp at time zone 'America/Sao_Paulo','[)')))) order by d.data) from ds d)) into result;
 return result;
end$$;

create function public.ag_dashboard(_org uuid,_inicio date,_fim date,_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 with q as materialized(select * from public.ag_universo(_org,_inicio,_fim,_filtros) where estado in('publicado','em_andamento','concluido')),
 ep as materialized(select distinct p.evento_id,p.pessoa_id from public.agenda_participantes p join q e on e.organization_id=p.organization_id and e.id=p.evento_id where p.vigente and p.funcao<>'observador' and p.confirmacao<>'recusada'),
 people as(select p.id pessoa_id,p.nome from public.pessoas p where p.organization_id=_org and((public.operacao_pode(_org,'gerir_operacao') and p.ativa)or exists(select 1 from ep where ep.pessoa_id=p.id)) and(nullif(_filtros->>'pessoa_id','') is null or p.id=(_filtros->>'pessoa_id')::uuid) and(not coalesce((_filtros->>'minha')::boolean,false) or p.id=public.ag_pessoa(_org,auth.uid()))),
 ds as(select d::date data from generate_series(_inicio::timestamp,(_fim-1)::timestamp,interval '1 day')d),
 weeks as(select w::date inicio,least(w::date+7,_fim) fim from generate_series(date_trunc('week',_inicio::timestamp),(_fim-1)::timestamp,interval '7 days')w),
 clipped as(select w.inicio,ep.pessoa_id,tstzrange(greatest(e.inicio,greatest(w.inicio,_inicio)::timestamp at time zone 'America/Sao_Paulo'),least(e.fim,w.fim::timestamp at time zone 'America/Sao_Paulo'),'[)') span from weeks w cross join q e join ep on ep.evento_id=e.id where not e.dia_inteiro and e.inicio<w.fim::timestamp at time zone 'America/Sao_Paulo' and e.fim>greatest(w.inicio,_inicio)::timestamp at time zone 'America/Sao_Paulo'),
 merged as(select inicio,pessoa_id,range_agg(span) spans from clipped group by inicio,pessoa_id),
 minutes as(select inicio,pessoa_id,sum(extract(epoch from(upper(s)-lower(s)))/60) minutos from merged cross join lateral unnest(spans)s group by inicio,pessoa_id)
 select jsonb_build_object('inicio',_inicio,'fim',_fim,'timezone','America/Sao_Paulo','total',(select count(*) from q),
 'pessoas',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',x.pessoa_id,'nome',x.nome,'total',x.total) order by x.total desc,x.nome,x.pessoa_id) from(select p.pessoa_id,p.nome,count(ep.evento_id) total from people p left join ep on ep.pessoa_id=p.pessoa_id group by p.pessoa_id,p.nome)x),'[]'),
 'dias',(select jsonb_agg(jsonb_build_object('data',d.data,'total',(select count(*) from q e where(e.dia_inteiro and d.data>=e.data_inicio and d.data<e.data_fim)or(not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange(d.data::timestamp at time zone 'America/Sao_Paulo',(d.data+1)::timestamp at time zone 'America/Sao_Paulo','[)')))) order by d.data) from ds d),
 'horas',(select jsonb_agg(jsonb_build_object('hora',h,'total',(select count(*) from ds d cross join q e where not e.dia_inteiro and tstzrange(e.inicio,e.fim,'[)')&&tstzrange((d.data::timestamp+make_interval(hours=>h)) at time zone 'America/Sao_Paulo',(d.data::timestamp+make_interval(hours=>h+1)) at time zone 'America/Sao_Paulo','[)'))) order by h) from generate_series(0,23)h),
 'categorias',coalesce((select jsonb_agg(jsonb_build_object('tipo',x.tipo,'total',x.total) order by x.total desc,x.tipo) from(select tipo,count(*) total from q group by tipo)x),'[]'),
 'semanas',(select jsonb_agg(jsonb_build_object('inicio',w.inicio,'fim',w.fim,'parcial',w.inicio<_inicio or w.inicio+7>_fim,'pessoas',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',p.pessoa_id,'nome',p.nome,'minutos',coalesce(m.minutos,0)) order by coalesce(m.minutos,0) desc,p.nome,p.pessoa_id) from people p left join minutes m on m.pessoa_id=p.pessoa_id and m.inicio=w.inicio),'[]')) order by w.inicio) from weeks w)) into result;
 return result;
end$$;

-- Salvar e publicar são uma só transação idempotente: falha não deixa rascunho parcial.
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
  update public.acoes_operacionais set cliente_id=nullif(_dados->'acao'->>'cliente_id','')::uuid,projeto_id=nullif(_dados->'acao'->>'projeto_id','')::uuid,unidade_id=nullif(_dados->'acao'->>'unidade_id','')::uuid,local=coalesce(_dados->'acao'->>'local','') where organization_id=_org and id=aid;
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

-- Edição conserva confirmações, observadores e atribuição temporal da equipe.
create or replace function public.ag_gravar(_org uuid,_autor uuid,_dados jsonb,_id uuid default null,_expected integer default null,_job uuid default null,_serie uuid default null,_serie_versao uuid default null,_data date default null) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare anteriores jsonb:='[]';e public.agenda_eventos;novo uuid:=coalesce(_id,gen_random_uuid());periodo jsonb;resp uuid:=(_dados->>'responsavel_id')::uuid;item jsonb;pessoa uuid;papel text;compet uuid;eq uuid;m record;ant text;lev public.levantamentos;ferramentas_explicitas boolean:=_dados?'ferramentas';cliente uuid:=nullif(_dados->>'cliente_id','')::uuid;unidade uuid:=nullif(_dados->>'unidade_id','')::uuid;acao uuid:=nullif(_dados->>'acao_id','')::uuid;levant uuid:=nullif(_dados->>'levantamento_id','')::uuid;begin
 perform public.lev_travar_autor(_org,_autor);
 if not public.operacao_autor_pode(_org,_autor,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _id is not null and not ferramentas_explicitas then
  _dados:=_dados||jsonb_build_object('ferramentas',coalesce((select jsonb_agg(jsonb_build_object('ferramenta_id',f.ferramenta_id,'pessoa_id',f.pessoa_id) order by f.ferramenta_id) from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.vigente and(f.custodia_id is null or exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.id=f.custodia_id and c.estado in('reservada','retirada')))),'[]'::jsonb));
 end if;
 perform public.ag_payload(_dados,array['titulo','descricao','tipo','inicio','fim','inicio_local','fim_local','timezone','dia_inteiro','data_inicio','data_fim','local','responsavel_id','acao_id','levantamento_id','origem_ocorrencia','bloqueia_recursos','participantes','competencias','equipes','ferramentas','cliente_id','unidade_id','projeto_id','visibilidade']);
 perform public.ag_texto(_dados,'titulo',3,200);perform public.ag_texto(_dados,'descricao',0,4000);perform public.ag_texto(_dados,'local',0,1000);
 if jsonb_typeof(_dados->'participantes') is distinct from 'array' or jsonb_array_length(_dados->'participantes')>100 or jsonb_typeof(coalesce(_dados->'competencias','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'competencias','[]'))>50 or jsonb_typeof(coalesce(_dados->'equipes','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'equipes','[]'))>20 or jsonb_typeof(coalesce(_dados->'ferramentas','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'ferramentas','[]'))>30 then raise exception 'Confira listas de participantes,competências,equipes e ferramentas.' using errcode='23514';end if;
 if _dados?'bloqueia_recursos' and jsonb_typeof(_dados->'bloqueia_recursos')<>'boolean' then raise exception 'Bloqueio de recurso deve ser booleano.' using errcode='23514';end if;
 periodo:=public.ag_resolver_periodo(_dados);
 if num_nonnulls(acao,levant)>1 then raise exception 'Selecione uma origem operacional principal.' using errcode='23514';end if;
 perform public.ag_travar_origem(_org,acao,levant);
 if acao is not null and not public.ag_autor_acao(_org,acao,_autor) then raise exception 'Origem indisponível.' using errcode='42501';end if;
 if levant is not null then
  if not public.lev_autor_ler(_org,levant,_autor) then raise exception 'Origem indisponível.' using errcode='42501';end if;select * into lev from public.levantamentos where organization_id=_org and id=levant;
  if(cliente is not null and cliente<>lev.cliente_id) or(unidade is not null and unidade<>lev.unidade_id) then raise exception 'Contexto diverge do levantamento.' using errcode='23514';end if;cliente:=lev.cliente_id;unidade:=lev.unidade_id;
 end if;
 if not exists(select 1 from public.pessoas where organization_id=_org and id=resp and ativa) then raise exception 'Responsável ativo é obrigatório.' using errcode='23514';end if;
 perform public.ag_travar_ferramentas(_org,_id,_dados);
 if _id is not null then
  select * into e from public.agenda_eventos where organization_id=_org and id=_id for update;
  if not found or not public.ag_autor_ler(_org,_id,_autor) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if e.version is distinct from _expected then raise exception 'Versão desatualizada; recarregue e compare.' using errcode='40001';end if;
  if e.estado not in('rascunho','publicado') then raise exception 'Planejamento iniciado/encerrado é imutável.' using errcode='23514';end if;
  if e.acao_id is distinct from acao or e.levantamento_id is distinct from levant then raise exception 'Origem é imutável; cancele e crie outra visita.' using errcode='23514';end if;
  -- Uma revisão somente editorial conserva as relações e reservas por identidade.
  -- Não recria confirmações nem valida novamente a equipe atual como se fosse a histórica.
  if e.inicio=(periodo->>'inicio')::timestamptz and e.fim=(periodo->>'fim')::timestamptz and e.timezone=periodo->>'timezone' and e.dia_inteiro=(periodo->>'dia_inteiro')::boolean
   and e.data_inicio is not distinct from (periodo->>'data_inicio')::date and e.data_fim is not distinct from (periodo->>'data_fim')::date
   and e.responsavel_id=resp and e.bloqueia_recursos=coalesce((_dados->>'bloqueia_recursos')::boolean,true) and e.visibilidade=coalesce(_dados->>'visibilidade','participantes')
   and coalesce(_dados->'equipes','[]')='[]'::jsonb
   and coalesce(_dados->'participantes','[]') @> coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',p.pessoa_id,'funcao',p.funcao)) from public.agenda_participantes p where p.organization_id=_org and p.evento_id=_id and p.vigente),'[]')
   and coalesce(_dados->'participantes','[]') <@ coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',p.pessoa_id,'funcao',p.funcao)) from public.agenda_participantes p where p.organization_id=_org and p.evento_id=_id and p.vigente),'[]')
   and coalesce(_dados->'competencias','[]') @> coalesce((select jsonb_agg(r.competencia_id) from public.agenda_requisitos r where r.organization_id=_org and r.evento_id=_id),'[]')
   and coalesce(_dados->'competencias','[]') <@ coalesce((select jsonb_agg(r.competencia_id) from public.agenda_requisitos r where r.organization_id=_org and r.evento_id=_id),'[]')
   and coalesce(_dados->'ferramentas','[]') @> coalesce((select jsonb_agg(jsonb_build_object('ferramenta_id',f.ferramenta_id,'pessoa_id',f.pessoa_id)) from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.vigente),'[]')
   and coalesce(_dados->'ferramentas','[]') <@ coalesce((select jsonb_agg(jsonb_build_object('ferramenta_id',f.ferramenta_id,'pessoa_id',f.pessoa_id)) from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.vigente),'[]') then
   ant:=e.estado;
   update public.agenda_eventos set titulo=trim(_dados->>'titulo'),descricao=coalesce(_dados->>'descricao',''),tipo=_dados->>'tipo',local=coalesce(_dados->>'local',''),cliente_id=cliente,unidade_id=unidade,projeto_id=nullif(_dados->>'projeto_id','')::uuid,motivo='Conteúdo atualizado',excecao=e.serie_id is not null where organization_id=_org and id=_id;
   if e.serie_id is not null then insert into public.agenda_excecoes(organization_id,serie_id,serie_versao_id,evento_id,data_original,tipo,motivo,created_by) values(_org,e.serie_id,e.serie_versao_id,e.id,e.ocorrencia_data,'alterada','Somente esta ocorrência',_autor);end if;
   perform public.ag_registrar(_org,_id,_autor,ant,case when ant='publicado' then 'agenda_alterada' end);return _id;
  end if;
  if ferramentas_explicitas then
   -- O comando explícito pode gerir somente uma custódia que já corresponde à janela anterior.
   insert into public.agenda_ferramentas(organization_id,evento_id,ferramenta_id,pessoa_id,custodia_id,created_by)
   select c.organization_id,c.agenda_evento_id,c.ferramenta_id,c.pessoa_id,c.id,_autor from public.ferramenta_custodias c
   where c.organization_id=_org and c.agenda_evento_id=_id and c.estado='reservada' and c.inicio=e.inicio and c.fim=e.fim and c.timezone=e.timezone
    and exists(select 1 from public.agenda_participantes pa where pa.organization_id=_org and pa.evento_id=_id and pa.pessoa_id=c.pessoa_id and pa.vigente and pa.funcao<>'observador')
    and not exists(select 1 from public.agenda_ferramentas f where f.organization_id=_org and f.evento_id=_id and f.ferramenta_id=c.ferramenta_id and f.vigente);
  end if;
  perform public.ag_liberar_ferramentas(_org,_id,'Reserva substituída por revisão do evento');ant:=e.estado;
  update public.agenda_eventos set titulo=trim(_dados->>'titulo'),descricao=coalesce(_dados->>'descricao',''),tipo=_dados->>'tipo',inicio=(periodo->>'inicio')::timestamptz,fim=(periodo->>'fim')::timestamptz,timezone=periodo->>'timezone',dia_inteiro=(periodo->>'dia_inteiro')::boolean,data_inicio=(periodo->>'data_inicio')::date,data_fim=(periodo->>'data_fim')::date,local=coalesce(_dados->>'local',''),responsavel_id=resp,bloqueia_recursos=coalesce((_dados->>'bloqueia_recursos')::boolean,true),cliente_id=cliente,unidade_id=unidade,projeto_id=nullif(_dados->>'projeto_id','')::uuid,visibilidade=coalesce(_dados->>'visibilidade','participantes'),motivo='Planejamento atualizado',excecao=e.serie_id is not null where id=_id returning * into e;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into anteriores from public.agenda_participantes p where p.organization_id=_org and p.evento_id=_id and p.vigente;
  update public.agenda_participantes set vigente=false,retirado_em=clock_timestamp() where organization_id=_org and evento_id=_id and vigente;
  delete from public.agenda_requisitos where organization_id=_org and evento_id=_id;
  update public.agenda_ferramentas set vigente=false,version=version+1 where organization_id=_org and evento_id=_id and vigente;
  if e.serie_id is not null then insert into public.agenda_excecoes(organization_id,serie_id,serie_versao_id,evento_id,data_original,tipo,motivo,created_by) values(_org,e.serie_id,e.serie_versao_id,e.id,e.ocorrencia_data,'alterada','Somente esta ocorrência',_autor);end if;
 else
  if cliente is not null and not exists(select 1 from public.clientes where organization_id=_org and id=cliente and arquivado_em is null) then raise exception 'Cliente indisponível.' using errcode='23514';end if;
  if unidade is not null and not exists(select 1 from public.unidades where organization_id=_org and cliente_id=cliente and id=unidade and arquivado_em is null) then raise exception 'Unidade indisponível.' using errcode='23514';end if;
  insert into public.agenda_eventos(id,organization_id,titulo,descricao,tipo,inicio,fim,timezone,dia_inteiro,data_inicio,data_fim,local,responsavel_id,acao_id,levantamento_id,origem_ocorrencia,bloqueia_recursos,cliente_id,unidade_id,projeto_id,visibilidade,serie_id,serie_versao_id,ocorrencia_data,gerado_automaticamente,geracao_job_id,created_by)
  values(novo,_org,trim(_dados->>'titulo'),coalesce(_dados->>'descricao',''),_dados->>'tipo',(periodo->>'inicio')::timestamptz,(periodo->>'fim')::timestamptz,periodo->>'timezone',(periodo->>'dia_inteiro')::boolean,(periodo->>'data_inicio')::date,(periodo->>'data_fim')::date,coalesce(_dados->>'local',''),resp,acao,levant,case when num_nonnulls(acao,levant)>0 then coalesce(nullif(_dados->>'origem_ocorrencia',''),novo::text) end,coalesce((_dados->>'bloqueia_recursos')::boolean,true),cliente,unidade,nullif(_dados->>'projeto_id','')::uuid,coalesce(_dados->>'visibilidade','participantes'),_serie,_serie_versao,_data,_job is not null,_job,_autor) returning * into e;
 end if;
 insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,created_by,confirmacao,ciencia_em,equipe_origem_id,equipe_inicio)
 select _org,novo,resp,'responsavel',_autor,coalesce(p->>'confirmacao','pendente'),(p->>'ciencia_em')::timestamptz,(p->>'equipe_origem_id')::uuid,(p->>'equipe_inicio')::date from (select (select x from jsonb_array_elements(anteriores)x where x->>'pessoa_id'=resp::text and x->>'funcao'='responsavel' limit 1)p)s;
 for item in select value from jsonb_array_elements(_dados->'participantes') loop
  perform public.ag_payload(item,array['pessoa_id','funcao']);pessoa:=(item->>'pessoa_id')::uuid;papel:=coalesce(item->>'funcao','participante');
  if pessoa=resp then if papel<>'responsavel' then raise exception 'Responsável deve manter sua função única.' using errcode='23514';end if;continue;end if;
  if papel not in('participante','observador') or not exists(select 1 from public.pessoas where organization_id=_org and id=pessoa and ativa) then raise exception 'Participante/função indisponível.' using errcode='23514';end if;
  insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,created_by,confirmacao,ciencia_em,equipe_origem_id,equipe_inicio)
  select _org,novo,pessoa,papel,_autor,coalesce(p->>'confirmacao','pendente'),(p->>'ciencia_em')::timestamptz,(p->>'equipe_origem_id')::uuid,(p->>'equipe_inicio')::date from(select(select x from jsonb_array_elements(anteriores)x where x->>'pessoa_id'=pessoa::text and x->>'funcao'=papel limit 1)p)s;
 end loop;
 for eq in select(value#>>'{}')::uuid from jsonb_array_elements(coalesce(_dados->'equipes','[]')) loop
  if not exists(select 1 from public.equipes where organization_id=_org and id=eq and ativa) then raise exception 'Equipe indisponível.' using errcode='23514';end if;
  for m in select em.* from public.equipe_membros em where em.organization_id=_org and em.equipe_id=eq and em.inicio<=(e.inicio at time zone e.timezone)::date and(em.fim is null or em.fim>=(e.inicio at time zone e.timezone)::date) order by em.pessoa_id,em.inicio loop
   if m.fim is not null and m.fim<((e.fim-interval '1 microsecond') at time zone e.timezone)::date then raise exception 'Vínculo de equipe termina antes da atividade; confira participantes.' using errcode='23514';end if;
   if not exists(select 1 from public.pessoas where organization_id=_org and id=m.pessoa_id and ativa) then raise exception 'Equipe contém pessoa inativa.' using errcode='23514';end if;
   if exists(select 1 from public.agenda_participantes where organization_id=_org and evento_id=novo and pessoa_id=m.pessoa_id and vigente) then continue;end if;
   insert into public.agenda_participantes(organization_id,evento_id,pessoa_id,funcao,equipe_origem_id,equipe_inicio,created_by) values(_org,novo,m.pessoa_id,'participante',eq,m.inicio,_autor);
  end loop;
 end loop;
 if(select count(*) from public.agenda_participantes where organization_id=_org and evento_id=novo and vigente)>100 then raise exception 'Expansão excede100participantes.' using errcode='23514';end if;
 for compet in select(value#>>'{}')::uuid from jsonb_array_elements(coalesce(_dados->'competencias','[]')) loop
  insert into public.agenda_requisitos(organization_id,evento_id,competencia_id,nome,exige_evidencia,exige_validade) select _org,novo,c.id,c.nome,c.exige_evidencia,c.exige_validade from public.competencias c where c.organization_id=_org and c.id=compet and c.ativa;
  if not found then raise exception 'Competência indisponível.' using errcode='23514';end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(_dados->'ferramentas','[]')) loop
  perform public.ag_payload(item,array['ferramenta_id','pessoa_id']);
  if not exists(select 1 from public.agenda_participantes where organization_id=_org and evento_id=novo and pessoa_id=(item->>'pessoa_id')::uuid and vigente and funcao<>'observador') then raise exception 'Custodiante deve ser participante do evento.' using errcode='23514';end if;
  insert into public.agenda_ferramentas(organization_id,evento_id,ferramenta_id,pessoa_id,created_by) values(_org,novo,(item->>'ferramenta_id')::uuid,(item->>'pessoa_id')::uuid,_autor);
 end loop;
 perform public.agenda_reservar(_org,novo);perform public.ag_reservar_ferramentas(_org,novo,_autor,_job);perform public.ag_registrar(_org,novo,_autor,ant,case when e.estado='publicado' then 'agenda_alterada' end);return novo;
end$$;

-- Opções de criação continuam nos cadastros canônicos; endereço vem da unidade da proposta.
-- A autorização de projetos canônicos é membership (RLS existente); o editor exige gerir_operacao.
create or replace function public.ag_opcoes(_org uuid,_tipo text,_busca text default '',_cliente uuid default null,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;begin
 if not public.operacao_pode(_org,'ver_operacao') or (_tipo not in('pessoas','equipes','projetos') and not public.operacao_pode(_org,'gerir_operacao')) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _tipo not in('pessoas','equipes','acoes','levantamentos','ferramentas','clientes','unidades','projetos','competencias') or _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Opções/filtro inválido.' using errcode='23514';end if;
 with q as(
 select p.id,p.nome,coalesce(p.funcao,p.vinculo) contexto,null::uuid cliente_id,null::uuid unidade_id,p.id pessoa_id,null::text cliente_nome,null::text endereco from public.pessoas p where _tipo='pessoas' and p.organization_id=_org and p.ativa and (public.operacao_pode(_org,'gerir_operacao') or p.id=public.ag_pessoa(_org,auth.uid()) or exists(select 1 from public.agenda_participantes pa where pa.organization_id=_org and pa.pessoa_id=p.id and pa.vigente and public.agenda_ler_evento(_org,pa.evento_id)))
 union all select e.id,e.nome,'Equipe por vigência',null,null,null,null,null from public.equipes e where _tipo='equipes' and e.organization_id=_org and e.ativa and(public.operacao_pode(_org,'gerir_operacao') or exists(select 1 from public.equipe_membros m where m.organization_id=_org and m.equipe_id=e.id and m.pessoa_id=public.ag_pessoa(_org,auth.uid())))
 union all select a.id,a.titulo,a.estado,null,null,a.responsavel_id,null,null from public.acoes_operacionais a where _tipo='acoes' and a.organization_id=_org and a.estado not in('concluida','cancelada') and public.ag_autor_acao(_org,a.id,auth.uid())
 union all select l.id,l.codigo||' · '||l.finalidade,r.estado,l.cliente_id,l.unidade_id,l.responsavel_id,null,null from public.levantamentos l join public.levantamento_revisoes r on r.organization_id=l.organization_id and r.id=l.revisao_atual_id where _tipo='levantamentos' and l.organization_id=_org and r.estado not in('aprovado','cancelado') and public.lev_ler(_org,l.id) and(_cliente is null or l.cliente_id=_cliente)
 union all select f.id,f.patrimonio||' · '||f.descricao,f.condicao,null,null,null,null,null from public.ferramentas f where _tipo='ferramentas' and f.organization_id=_org and f.condicao<>'desativada'
 union all select c.id,c.razao_social,c.situacao,c.id,null,null,c.razao_social,null from public.clientes c where _tipo='clientes' and c.organization_id=_org and c.arquivado_em is null
 union all select u.id,u.nome,c.razao_social,u.cliente_id,u.id,null,c.razao_social,u.endereco from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id where _tipo='unidades' and u.organization_id=_org and c.arquivado_em is null and u.arquivado_em is null and(_cliente is null or u.cliente_id=_cliente)
 union all select p.id,p.codigo,c.razao_social||' · '||p.status,p.cliente_id,u.id,null,c.razao_social,u.endereco from public.projetos p join public.clientes c on c.organization_id=p.organization_id and c.id=p.cliente_id join public.propostas pr on pr.organization_id=p.organization_id and pr.id=p.proposta_id left join public.unidades u on u.organization_id=p.organization_id and u.cliente_id=p.cliente_id and u.id=pr.unidade_id and u.arquivado_em is null where _tipo='projetos' and p.organization_id=_org and c.arquivado_em is null and public.is_member(_org) and(_cliente is null or p.cliente_id=_cliente)
 union all select c.id,c.nome,coalesce(c.descricao,''),null,null,null,null,null from public.competencias c where _tipo='competencias' and c.organization_id=_org and c.ativa
 ),filtered as(select * from q where strpos(lower(nome||' '||contexto),lower(coalesce(_busca,'')))>0)
 select(select count(*) from filtered),coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(x)) order by cliente_nome,nome,id) from(select * from filtered order by cliente_nome,nome,id offset _pagina::bigint*_limite limit _limite)x),'[]'::jsonb) into tot,arr;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite);
end$$;

create function public.ag_pendentes_v2(_org uuid,_minhas boolean default true,_filtros jsonb default '{}',_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare arr jsonb;tot bigint;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina is null or _pagina<0 or _limite is null or _limite not between 1 and 100 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 perform public.ag_payload(_filtros,array['demanda','minha','busca','estado','tipo','equipe_id','pessoa_id','cliente_id','projeto_id','natureza','hora']);
 with q as(
 select a.id,'acao'::text tipo,a.titulo,a.estado,a.responsavel_id,p.nome responsavel_nome,a.prazo,a.cliente_id,a.unidade_id,a.projeto_id,a.local,c.razao_social cliente_nome,pr.codigo projeto_nome,
 coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',p2.id,'nome',p2.nome) order by p2.nome) from public.pessoas p2 where p2.organization_id=_org and(p2.id=a.responsavel_id or exists(select 1 from public.acao_colaboradores ac where ac.organization_id=_org and ac.acao_id=a.id and ac.pessoa_id=p2.id))),'[]') pessoas
 from public.acoes_operacionais a join public.pessoas p on p.organization_id=a.organization_id and p.id=a.responsavel_id left join public.clientes c on c.organization_id=a.organization_id and c.id=a.cliente_id left join public.projetos pr on pr.organization_id=a.organization_id and pr.id=a.projeto_id
 where a.organization_id=_org and public.ag_autor_acao(_org,a.id,auth.uid()) and(not _minhas or a.responsavel_id=public.ag_pessoa(_org,auth.uid()) or exists(select 1 from public.acao_colaboradores ac where ac.organization_id=_org and ac.acao_id=a.id and ac.pessoa_id=public.ag_pessoa(_org,auth.uid())))
 and not exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.acao_id=a.id and e.estado<>'cancelado')
 and(nullif(_filtros->>'estado','') is null and a.estado not in('concluida','cancelada') or (_filtros->>'estado' in('rascunho','publicado') and a.estado='aberta') or(_filtros->>'estado'='em_andamento' and a.estado in('em_execucao','aguardando_verificacao'))or(_filtros->>'estado'='concluido' and a.estado='concluida')or(_filtros->>'estado'='cancelado' and a.estado='cancelada'))
 and(nullif(_filtros->>'pessoa_id','') is null or a.responsavel_id=(_filtros->>'pessoa_id')::uuid or exists(select 1 from public.acao_colaboradores ac where ac.organization_id=_org and ac.acao_id=a.id and ac.pessoa_id=(_filtros->>'pessoa_id')::uuid))
 and(nullif(_filtros->>'cliente_id','') is null or a.cliente_id=(_filtros->>'cliente_id')::uuid) and(nullif(_filtros->>'projeto_id','') is null or a.projeto_id=(_filtros->>'projeto_id')::uuid)
 and nullif(_filtros->>'hora','') is null and nullif(_filtros->>'equipe_id','') is null and coalesce(nullif(_filtros->>'natureza',''),'acao')='acao' and coalesce(nullif(_filtros->>'tipo',''),'sem_categoria')='sem_categoria' and not coalesce((_filtros->>'demanda')::boolean,false)
 ),filtered as(select * from q where strpos(lower(titulo||' '||local),lower(coalesce(_filtros->>'busca','')))>0)
 select(select count(*) from filtered),coalesce((select jsonb_agg(to_jsonb(x) order by prazo nulls last,titulo,id) from(select * from filtered order by prazo nulls last,titulo,id offset _pagina::bigint*_limite limit _limite)x),'[]') into tot,arr;
 return jsonb_build_object('registros',arr,'total',tot,'pagina',_pagina,'limite',_limite);
end$$;

revoke all on function public.ag_universo(uuid,date,date,jsonb),public.ag_evento_resumo(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.ag_listar_v2(uuid,date,date,jsonb,integer,integer),public.ag_dashboard(uuid,date,date,jsonb),public.ag_pendentes_v2(uuid,boolean,jsonb,integer,integer) from public,anon;
grant execute on function public.ag_listar_v2(uuid,date,date,jsonb,integer,integer),public.ag_dashboard(uuid,date,date,jsonb),public.ag_pendentes_v2(uuid,boolean,jsonb,integer,integer) to authenticated;
create or replace function public.ag_configuracao(_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p jsonb;g boolean:=public.operacao_pode(_org,'gerir_operacao');begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select jsonb_build_object('antecedencia_minutos',antecedencia_minutos,'notificar_atrasos',notificar_atrasos,'notificar',notificar) into p from public.agenda_preferencias where organization_id=_org and user_id=auth.uid();
 return jsonb_build_object('minha_pessoa_id',public.ag_pessoa(_org,auth.uid()),'minha_pessoa_nome',(select nome from public.pessoas where organization_id=_org and id=public.ag_pessoa(_org,auth.uid())),'timezone',(select timezone from public.organizations where id=_org),'server_now',clock_timestamp(),'permissoes',jsonb_build_object('criar',g,'criar_acao',g,'gerir_series',g),'preferencias',coalesce(p,jsonb_build_object('antecedencia_minutos',60,'notificar_atrasos',true,'notificar',true)),'jobs',case when g then public.consultar_jobs_operacionais(_org) end);
end$$;
create or replace function public.ag_obter(_org uuid,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare e public.agenda_eventos;begin
 if not public.agenda_ler_evento(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;select * into e from public.agenda_eventos where organization_id=_org and id=_id;
 return jsonb_build_object('evento',public.ag_evento_resumo(_org,_id),
 'participantes',coalesce((select jsonb_agg(to_jsonb(pa)||jsonb_build_object('pessoa_nome',p.nome,'pode_confirmar',pa.vigente and pa.pessoa_id=public.ag_pessoa(_org,auth.uid())) order by case pa.funcao when 'responsavel' then 0 when 'participante' then 1 else 2 end,p.nome,pa.id) from public.agenda_participantes pa join public.pessoas p on p.organization_id=pa.organization_id and p.id=pa.pessoa_id where pa.organization_id=_org and pa.evento_id=_id and pa.vigente),'[]'::jsonb),
 'competencias',coalesce((select jsonb_agg(jsonb_build_object('competencia_id',r.competencia_id,'nome',r.nome,'exige_evidencia',r.exige_evidencia,'exige_validade',r.exige_validade) order by r.nome,r.competencia_id) from public.agenda_requisitos r where r.organization_id=_org and r.evento_id=_id),'[]'::jsonb),
 'ferramentas',coalesce((select jsonb_agg(jsonb_build_object('id',af.id,'ferramenta_id',af.ferramenta_id,'patrimonio',f.patrimonio,'descricao',f.descricao,'pessoa_id',af.pessoa_id,'pessoa_nome',p.nome,'custodia_id',af.custodia_id,'estado',coalesce(c.estado,'planejada'),'version',af.version) order by f.patrimonio,af.id) from public.agenda_ferramentas af join public.ferramentas f on f.organization_id=af.organization_id and f.id=af.ferramenta_id join public.pessoas p on p.organization_id=af.organization_id and p.id=af.pessoa_id left join public.ferramenta_custodias c on c.organization_id=af.organization_id and c.id=af.custodia_id where af.organization_id=_org and af.evento_id=_id and af.vigente),'[]'::jsonb),
 'historico',public.ag_historico(_org,_id,'revisoes'),'comentarios',public.ag_historico(_org,_id,'comentarios'),'serie',public.ag_serie_json(_org,e.serie_id),'bloqueios',public.ag_bloqueios(_org,_id),'permissoes',public.ag_permissoes(_org,_id),'server_now',clock_timestamp());
end$$;
notify pgrst,'reload schema';
