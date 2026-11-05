-- Explicitly separate demonstrations from permits, certificates, orders and operational events.
create table public.pet_demo_habilitacoes (
 organization_id uuid not null, cliente_id uuid not null, unidade_id uuid not null, local_id uuid not null,
 ativo boolean not null default true,
 primary key(organization_id,local_id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
insert into public.pet_demo_habilitacoes(organization_id,cliente_id,unidade_id,local_id)
 select o.organization_id,o.cliente_id,o.unidade_id,o.local_id from public.nr_cena_objetos o
 join public.nr_cenas_unidade c using(organization_id,cliente_id,unidade_id)
 where c.cena='cotrirosa-racao-santa-rosa-v1' and c.estado='publicada'
 and o.unidade_id='6a454dcc-82b2-4506-aca3-410a3cc820f2' and o.cliente_id='9d6dfbe8-285a-44e5-9ea1-2574daa7cb28'
 and o.local_id=any(array['ed835456-14f5-430a-a12b-55a92c86c018','8b0ed1b7-53df-4743-8be1-6b34221e471e','18f64e04-8674-4870-a7cd-8b633e1b2282','d1977ff8-36ab-4241-a884-bee802df1b94','c640b3bd-2731-490d-ab3a-d47a7953bce0']::uuid[]);
create table public.pet_demo_series (
 organization_id uuid not null, unidade_id uuid not null, ultimo bigint not null default 0,
 primary key(organization_id,unidade_id), foreign key(organization_id,unidade_id) references public.unidades(organization_id,id)
);
create table public.pet_demo_sessoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, cliente_id uuid not null,
 unidade_id uuid not null, local_id uuid not null, numero text not null, norma_origem text not null check(norma_origem in('NR33','NR35')),
 estado text not null default 'rascunho' check(estado in('rascunho','em_andamento','encerrada','cancelada')),
 etapa integer not null default 0 check(etapa between 0 and 7), version integer not null default 1,
 conteudo jsonb not null, identificacao jsonb not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), encerrada_em timestamptz,
 unique(organization_id,id), unique(organization_id,unidade_id,numero),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
create index pet_demo_lista on public.pet_demo_sessoes(organization_id,unidade_id,local_id,created_at desc,id);
create table public.pet_demo_eventos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, sessao_id uuid not null,
 tipo text not null, dados jsonb not null default '{}', autor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,sessao_id) references public.pet_demo_sessoes(organization_id,id)
);
create table public.pet_demo_recibos (
 organization_id uuid not null, chave uuid not null, autor_id uuid not null references auth.users(id),
 pedido jsonb not null, sessao_id uuid not null, resultado jsonb not null,
 primary key(organization_id,chave), foreign key(organization_id,sessao_id) references public.pet_demo_sessoes(organization_id,id)
);
create table public.pet_demo_presencas (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, sessao_id uuid not null,
 participante_id uuid not null, nome text not null, entrada_em timestamptz not null default now(), saida_em timestamptz,
 foreign key(organization_id,sessao_id) references public.pet_demo_sessoes(organization_id,id),
 check(saida_em is null or saida_em>=entrada_em)
);
create unique index pet_demo_presenca_aberta on public.pet_demo_presencas(sessao_id,participante_id) where saida_em is null;
create table public.pet_demo_anexos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, sessao_id uuid not null,
 nome text not null check(length(nome) between 1 and 240), caminho text not null unique,
 mime text not null check(mime in('application/pdf','image/png','image/jpeg','image/webp')),
 tamanho integer not null check(tamanho between 1 and 20971520),
 estado text not null default 'pendente' check(estado in('pendente','disponivel')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(organization_id,sessao_id) references public.pet_demo_sessoes(organization_id,id)
);

create function public.pet_demo_acesso(p_org uuid,p_local uuid,p_norma text default 'NR33',p_escrita boolean default false)
 returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.operacao_pode(p_org,case when p_escrita then 'gerir_operacao' else 'ver_operacao' end)
 and exists(select 1 from public.pet_demo_habilitacoes h join public.nr_locais l
 on l.organization_id=h.organization_id and l.id=h.local_id
 where h.organization_id=p_org and h.local_id=p_local and h.ativo and l.arquivado_em is null
 and public.nr_unidade_autorizada(p_org,h.cliente_id,h.unidade_id,p_norma)
 and public.nr_local_no_contexto(p_org,p_local,p_norma))
$$;
create function public.pet_demo_sessao_acesso(p_org uuid,p_id uuid,p_escrita boolean default false)
 returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pet_demo_sessoes s where s.organization_id=p_org and s.id=p_id
 and public.pet_demo_acesso(p_org,s.local_id,'NR33',p_escrita))
$$;
create function public.pet_demo_contexto(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_local uuid default null)
 returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then raise exception 'Unidade indisponível.' using errcode='42501';end if;
 return jsonb_build_object('habilitado',exists(select 1 from public.pet_demo_habilitacoes h where h.organization_id=p_org and h.cliente_id=p_cliente and h.unidade_id=p_unidade and h.ativo and(p_local is null or h.local_id=p_local) and public.pet_demo_acesso(p_org,h.local_id,p_norma)),
 'pode_editar',public.operacao_pode(p_org,'gerir_operacao'));
end$$;
create function public.pet_demo_obter(p_org uuid,p_id uuid,p_norma text default 'NR33')
 returns jsonb language plpgsql stable security definer set search_path='' as $$declare s public.pet_demo_sessoes;begin
 select * into s from public.pet_demo_sessoes where organization_id=p_org and id=p_id;
 if not found or not public.pet_demo_acesso(p_org,s.local_id,p_norma) then raise exception 'Demonstração indisponível.' using errcode='42501';end if;
 return jsonb_build_object('sessao',to_jsonb(s),'pode_editar',public.pet_demo_acesso(p_org,s.local_id,p_norma,true),
 'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id) from(select * from public.pet_demo_eventos where organization_id=p_org and sessao_id=p_id order by created_at desc,id limit 50)e),'[]'),
 'presencas',coalesce((select jsonb_agg(to_jsonb(p) order by p.entrada_em,p.id) from public.pet_demo_presencas p where p.organization_id=p_org and p.sessao_id=p_id),'[]'),
 'anexos',coalesce((select jsonb_agg(to_jsonb(a)-'caminho' order by a.created_at,a.id) from(select * from public.pet_demo_anexos where organization_id=p_org and sessao_id=p_id order by created_at,id limit 20)a),'[]'));
end$$;
-- Large histories and attachment collections are fetched on demand, in bounded pages.
create function public.pet_demo_registros(p_org uuid,p_id uuid,p_norma text,p_recurso text,p_pagina integer default 0)
 returns jsonb language plpgsql stable security definer set search_path='' as $$declare s public.pet_demo_sessoes;t bigint;r jsonb;begin
 select * into s from public.pet_demo_sessoes where organization_id=p_org and id=p_id;
 if not found or not public.pet_demo_acesso(p_org,s.local_id,p_norma)then raise exception 'Demonstração indisponível.'using errcode='42501';end if;
 if p_pagina<0 or p_pagina>100000 then raise exception 'Página inválida.'using errcode='23514';end if;
 if p_recurso='eventos' then
  select count(*)into t from public.pet_demo_eventos where organization_id=p_org and sessao_id=p_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]')into r from(select id,tipo,dados,created_at from public.pet_demo_eventos where organization_id=p_org and sessao_id=p_id order by created_at desc,id limit 50 offset p_pagina*50)e;
 elsif p_recurso='anexos' then
  select count(*)into t from public.pet_demo_anexos where organization_id=p_org and sessao_id=p_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]')into r from(select id,nome,mime,tamanho,estado,created_at from public.pet_demo_anexos where organization_id=p_org and sessao_id=p_id order by created_at,id limit 20 offset p_pagina*20)a;
 else raise exception 'Recurso inválido.'using errcode='23514';end if;
 return jsonb_build_object('total',t,'registros',r);
end$$;

create function public.pet_demo_listar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_local uuid default null,p_busca text default '',p_grupo text default 'andamento',p_pagina integer default 0)
 returns jsonb language plpgsql stable security definer set search_path='' as $$declare total integer;registros jsonb;begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) or not public.operacao_pode(p_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_pagina<0 or p_pagina>100000 or length(p_busca)>120 or p_grupo not in('andamento','concluidas')then raise exception 'Filtro inválido.' using errcode='23514';end if;
 with visiveis as(select s.* from public.pet_demo_sessoes s where s.organization_id=p_org and s.cliente_id=p_cliente and s.unidade_id=p_unidade
 and(p_local is null or s.local_id=p_local) and public.pet_demo_acesso(p_org,s.local_id,p_norma)
 and ((p_grupo='andamento' and s.estado in('rascunho','em_andamento'))or(p_grupo='concluidas' and s.estado in('encerrada','cancelada')))
 and (p_busca='' or concat_ws(' ',s.numero,s.conteudo->>'atividade',s.identificacao->>'tag',s.identificacao->>'titulo',s.identificacao->>'aliases') ilike '%'||p_busca||'%'))
 select (select count(*) from visiveis),(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id),'[]') from(select * from visiveis order by created_at desc,id limit 10 offset p_pagina*10)v) into total,registros;
 return jsonb_build_object('total',total,'registros',registros);
end$$;

create function public.pet_demo_validar(p jsonb) returns void language plpgsql set search_path='' as $$declare x jsonb;k text;begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then raise exception 'Preenchimento inválido.'using errcode='23514';end if;
 perform public.ag_payload(p,array['atividade','inicio_previsto','termino_previsto','equipe','perigos','medidas','leituras','procedimentos']);
 foreach k in array array['atividade','inicio_previsto','termino_previsto','perigos','medidas','procedimentos']loop
  if jsonb_typeof(p->k)is distinct from 'string' or length(p->>k)>10000 then raise exception 'Campo de texto inválido.'using errcode='23514';end if;
 end loop;
 if length(trim(coalesce(p->>'atividade','')))<3 or length(p->>'atividade')>4000 then raise exception 'Descreva a atividade com ao menos três caracteres.'using errcode='23514';end if;
 if nullif(p->>'inicio_previsto','')is null or nullif(p->>'termino_previsto','')is null or (p->>'termino_previsto')::timestamptz<=(p->>'inicio_previsto')::timestamptz then raise exception 'Informe o início e um término posterior.'using errcode='23514';end if;
 if jsonb_typeof(p->'equipe')is distinct from 'array' or jsonb_typeof(p->'leituras')is distinct from 'array' then raise exception 'Equipe ou leituras inválidas.'using errcode='23514';end if;
 if jsonb_array_length(p->'equipe')>100 or jsonb_array_length(p->'leituras')>100 then raise exception 'Limite de itens excedido.'using errcode='23514';end if;
 if (select count(*) from jsonb_array_elements(p->'equipe'))<>(select count(distinct value->>'id') from jsonb_array_elements(p->'equipe'))then raise exception 'Participante duplicado.'using errcode='23514';end if;
 for x in select value from jsonb_array_elements(p->'equipe') loop
  perform public.ag_payload(x,array['id','nome','funcao']);perform (x->>'id')::uuid;
  if x->>'id' is null or length(trim(coalesce(x->>'nome','')))<2 or length(x->>'nome')>160 or coalesce(x->>'funcao','')not in('supervisor','vigia','trabalhador','resgate','substituto_vigia')then raise exception 'Informe nome e função de cada participante.'using errcode='23514';end if;
 end loop;
 for x in select value from jsonb_array_elements(p->'leituras') loop
  perform public.ag_payload(x,array['id','agente','valor','unidade']);perform (x->>'id')::uuid;
  if x->>'id' is null or jsonb_typeof(x->'valor')is distinct from 'string' or length(x->>'agente')>80 or length(x->>'unidade')>30 then raise exception 'Leitura inválida.'using errcode='23514';end if;
  if length(trim(coalesce(x->>'agente','')))<1 or length(trim(coalesce(x->>'unidade','')))<1 or nullif(x->>'valor','')is null or (x->>'valor')::numeric::text in('NaN','Infinity','-Infinity')then raise exception 'Informe agente, valor numérico e unidade de cada leitura.'using errcode='23514';end if;
 end loop;
end$$;

create function public.pet_demo_executar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb:=p_comando->'dados';cmd text:=p_comando->>'comando';k uuid:=(p_comando->>'chave')::uuid;s public.pet_demo_sessoes;l public.nr_locais;r public.pet_demo_recibos;v bigint;pid uuid;x jsonb;resultado jsonb;n text:=coalesce(p_comando->>'norma','NR33');begin
 perform public.ag_payload(p_comando,array['comando','chave','id','expected_version','norma','dados']);
 if k is null or auth.uid()is null or d is null or jsonb_typeof(d)<>'object' or octet_length(p_comando::text)>120000 then raise exception 'Comando inválido.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||k::text,0));
 select * into r from public.pet_demo_recibos where organization_id=p_org and chave=k;
 if found then
  if r.autor_id<>auth.uid() or r.pedido<>p_comando or not exists(select 1 from public.pet_demo_sessoes rs where rs.organization_id=p_org and rs.id=r.sessao_id and public.pet_demo_acesso(p_org,rs.local_id,n,true)) then raise exception 'Intenção ou acesso divergente.'using errcode='42501';end if;
  return r.resultado;
 end if;
 if cmd='criar' then
  perform public.ag_payload(d,array['cliente_id','unidade_id','local_id','conteudo']);
  select * into l from public.nr_locais where organization_id=p_org and cliente_id=(d->>'cliente_id')::uuid and unidade_id=(d->>'unidade_id')::uuid and id=(d->>'local_id')::uuid for share;
  if not found or not public.pet_demo_acesso(p_org,l.id,n,true) then raise exception 'Local não autorizado para demonstração.'using errcode='42501';end if;
  perform public.pet_demo_validar(d->'conteudo');
  insert into public.pet_demo_series(organization_id,unidade_id,ultimo)values(p_org,l.unidade_id,1)on conflict(organization_id,unidade_id)do update set ultimo=pet_demo_series.ultimo+1 returning ultimo into v;
  insert into public.pet_demo_sessoes(organization_id,cliente_id,unidade_id,local_id,numero,norma_origem,conteudo,identificacao,created_by)
  values(p_org,l.cliente_id,l.unidade_id,l.id,'DEMO-'||lpad(v::text,greatest(6,length(v::text)),'0'),n,d->'conteudo',jsonb_build_object('tag',l.tag,'titulo',l.titulo,'aliases',l.aliases||coalesce((select aliases from public.nr_cena_objetos where organization_id=p_org and local_id=l.id),'{}'::text[]),'unidade',(select nome from public.unidades where organization_id=p_org and id=l.unidade_id)),auth.uid())returning * into s;
 else
  select * into s from public.pet_demo_sessoes where organization_id=p_org and id=(p_comando->>'id')::uuid for update;
  if not found or not public.pet_demo_acesso(p_org,s.local_id,n,true) then raise exception 'Demonstração indisponível.'using errcode='42501';end if;
  if s.version is distinct from (p_comando->>'expected_version')::integer then raise exception 'Outra pessoa atualizou esta demonstração. Recarregue para comparar; seu preenchimento foi preservado.'using errcode='40001';end if;
  if s.estado in('encerrada','cancelada')then raise exception 'Esta demonstração já foi finalizada.'using errcode='23514';end if;
  case cmd
   when 'salvar' then
    if s.estado<>'rascunho' then raise exception 'O preenchimento inicial já foi confirmado.'using errcode='23514';end if;
    perform public.ag_payload(d,array['conteudo','etapa']);perform public.pet_demo_validar(d->'conteudo');
    s.conteudo:=d->'conteudo';s.etapa:=greatest(0,least(4,(d->>'etapa')::integer));
   when 'iniciar' then
    perform public.ag_payload(d,array[]::text[]);
    if s.estado<>'rascunho' then raise exception 'A demonstração já está em andamento.'using errcode='23514';end if;
    if not exists(select 1 from jsonb_array_elements(s.conteudo->'equipe') e where e->>'funcao'='trabalhador') or not exists(select 1 from jsonb_array_elements(s.conteudo->'equipe') e where e->>'funcao'='vigia') then raise exception 'Inclua trabalhador e vigia para testar o acompanhamento.'using errcode='23514';end if;
    s.estado:='em_andamento';s.etapa:=5;
   when 'entrada' then
    perform public.ag_payload(d,array['participante_id']);
    if s.estado<>'em_andamento' then raise exception 'Inicie a demonstração primeiro.'using errcode='23514';end if;
    select value into x from jsonb_array_elements(s.conteudo->'equipe') where value->>'id'=d->>'participante_id' and value->>'funcao'='trabalhador';
    if x is null then raise exception 'Selecione um trabalhador desta demonstração.'using errcode='23514';end if;
    insert into public.pet_demo_presencas(organization_id,sessao_id,participante_id,nome)values(p_org,s.id,(x->>'id')::uuid,x->>'nome');
   when 'saida' then
    perform public.ag_payload(d,array['participante_id']);
    update public.pet_demo_presencas set saida_em=clock_timestamp()where organization_id=p_org and sessao_id=s.id and participante_id=(d->>'participante_id')::uuid and saida_em is null;
    if not found then raise exception 'Nenhuma entrada aberta para este participante.'using errcode='23514';end if;
   when 'medicao' then
    perform public.ag_payload(d,array['agente','valor','unidade']);
    if s.estado<>'em_andamento' then raise exception 'Inicie a demonstração primeiro.'using errcode='23514';end if;
    if nullif(trim(d->>'agente'),'')is null or nullif(trim(d->>'unidade'),'')is null or nullif(d->>'valor','')is null or (d->>'valor')::numeric::text in('NaN','Infinity','-Infinity')then raise exception 'Informe agente, valor e unidade.'using errcode='23514';end if;
   when 'ocorrencia' then
    perform public.ag_payload(d,array['texto']);
    if s.estado<>'em_andamento' or length(trim(coalesce(d->>'texto','')))<3 then raise exception 'Informe a ocorrência durante o acompanhamento.'using errcode='23514';end if;
   when 'prorrogar' then
    perform public.ag_payload(d,array['termino_previsto']);
    if s.estado<>'em_andamento' or nullif(d->>'termino_previsto','')is null or (d->>'termino_previsto')::timestamptz<=(s.conteudo->>'termino_previsto')::timestamptz then raise exception 'Informe um término posterior ao atual.'using errcode='23514';end if;
    s.conteudo:=jsonb_set(s.conteudo,'{termino_previsto}',d->'termino_previsto');
   when 'encerrar','cancelar' then
    perform public.ag_payload(d,array['texto']);
    if cmd='encerrar' and s.estado<>'em_andamento' then raise exception 'A demonstração ainda não foi iniciada.'using errcode='23514';end if;
    if exists(select 1 from public.pet_demo_presencas where organization_id=p_org and sessao_id=s.id and saida_em is null)then raise exception 'Registre as saídas antes de finalizar.'using errcode='23514';end if;
    if length(trim(coalesce(d->>'texto','')))<3 then raise exception 'Informe uma observação de finalização.'using errcode='23514';end if;
    s.estado:=case cmd when 'encerrar'then 'encerrada'else 'cancelada'end;s.etapa:=7;s.encerrada_em:=clock_timestamp();
   else raise exception 'Comando de demonstração desconhecido.'using errcode='23514';
  end case;
  update public.pet_demo_sessoes set conteudo=s.conteudo,estado=s.estado,etapa=s.etapa,encerrada_em=s.encerrada_em,version=version+1,updated_at=clock_timestamp()where id=s.id returning * into s;
 end if;
 insert into public.pet_demo_eventos(organization_id,sessao_id,tipo,dados,autor_id)values(p_org,s.id,cmd,case when cmd in('criar','salvar')then jsonb_build_object('etapa',s.etapa,'version',s.version)else d end,auth.uid());
 resultado:=jsonb_build_object('id',s.id,'version',s.version,'numero',s.numero);
 insert into public.pet_demo_recibos(organization_id,chave,autor_id,pedido,sessao_id,resultado)values(p_org,k,auth.uid(),p_comando,s.id,resultado);
 return resultado;
end$$;

-- Private demonstration attachments. Availability is not a certified original or signature.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('nexus-pet-demo','nexus-pet-demo',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp'])on conflict(id)do nothing;
create function public.pet_demo_arquivo(p_org uuid,p_id uuid,p_comando text,p_dados jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare a public.pet_demo_anexos;s public.pet_demo_sessoes;aid uuid;begin
 select * into s from public.pet_demo_sessoes where organization_id=p_org and id=p_id for update;
 if not found or not public.pet_demo_acesso(p_org,s.local_id,'NR33',p_comando<>'abrir')then raise exception 'Arquivo indisponível.'using errcode='42501';end if;
 if p_comando='preparar' then
  if s.estado in('encerrada','cancelada')then raise exception 'Demonstração finalizada.'using errcode='23514';end if;
  aid:=(p_dados->>'id')::uuid;
  select * into a from public.pet_demo_anexos where id=aid;
  if found then
   if a.organization_id<>p_org or a.sessao_id<>p_id or a.created_by<>auth.uid()or a.nome<>p_dados->>'nome'or a.mime<>p_dados->>'mime'or a.tamanho<>(p_dados->>'tamanho')::integer then raise exception 'Intenção de arquivo divergente.'using errcode='42501';end if;
  else
   insert into public.pet_demo_anexos(id,organization_id,sessao_id,nome,mime,tamanho,caminho,created_by)
   values(aid,p_org,p_id,p_dados->>'nome',p_dados->>'mime',(p_dados->>'tamanho')::integer,p_org::text||'/'||p_id::text||'/'||aid::text,auth.uid())returning * into a;
  end if;
 else
  select * into a from public.pet_demo_anexos where organization_id=p_org and sessao_id=p_id and id=(p_dados->>'id')::uuid;
  if not found then raise exception 'Arquivo indisponível.'using errcode='42501';end if;
  if p_comando='confirmar' then
   if s.estado in('encerrada','cancelada')then raise exception 'Demonstração finalizada.'using errcode='23514';end if;
   if a.created_by<>auth.uid()then raise exception 'Envio de outro autor.'using errcode='42501';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='nexus-pet-demo'and o.name=a.caminho and (o.metadata->>'size')::bigint=a.tamanho and o.metadata->>'mimetype'=a.mime)then raise exception 'Envio ainda não confirmado. Tente novamente.'using errcode='23514';end if;
   update public.pet_demo_anexos set estado='disponivel'where id=a.id returning * into a;
  elsif p_comando<>'abrir'or a.estado<>'disponivel'then raise exception 'Arquivo ainda não disponível.'using errcode='23514';end if;
 end if;
 return to_jsonb(a);
end$$;
create function public.pet_demo_storage(p_name text,p_escrita boolean default false)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pet_demo_anexos a join public.pet_demo_sessoes s on s.organization_id=a.organization_id and s.id=a.sessao_id
 where a.caminho=p_name and public.pet_demo_sessao_acesso(a.organization_id,a.sessao_id,p_escrita)
 and(case when p_escrita then a.estado='pendente' and a.created_by=auth.uid() and s.estado not in('encerrada','cancelada')else a.estado='disponivel'end))
$$;
create policy pet_demo_upload on storage.objects for insert to authenticated with check(bucket_id='nexus-pet-demo'and public.pet_demo_storage(name,true));
create policy pet_demo_download on storage.objects for select to authenticated using(bucket_id='nexus-pet-demo'and public.pet_demo_storage(name,false));

alter table public.pet_demo_habilitacoes enable row level security;
alter table public.pet_demo_series enable row level security;
alter table public.pet_demo_sessoes enable row level security;
alter table public.pet_demo_eventos enable row level security;
alter table public.pet_demo_recibos enable row level security;
alter table public.pet_demo_presencas enable row level security;
alter table public.pet_demo_anexos enable row level security;
revoke all on public.pet_demo_habilitacoes,public.pet_demo_series,public.pet_demo_sessoes,public.pet_demo_eventos,public.pet_demo_recibos,public.pet_demo_presencas,public.pet_demo_anexos from public,anon,authenticated,service_role;
revoke all on function public.pet_demo_acesso(uuid,uuid,text,boolean),public.pet_demo_sessao_acesso(uuid,uuid,boolean),public.pet_demo_contexto(uuid,uuid,uuid,text,uuid),public.pet_demo_obter(uuid,uuid,text),public.pet_demo_registros(uuid,uuid,text,text,integer),public.pet_demo_listar(uuid,uuid,uuid,text,uuid,text,text,integer),public.pet_demo_validar(jsonb),public.pet_demo_executar(uuid,jsonb),public.pet_demo_arquivo(uuid,uuid,text,jsonb),public.pet_demo_storage(text,boolean)from public,anon,authenticated,service_role;
grant execute on function public.pet_demo_contexto(uuid,uuid,uuid,text,uuid),public.pet_demo_obter(uuid,uuid,text),public.pet_demo_registros(uuid,uuid,text,text,integer),public.pet_demo_listar(uuid,uuid,uuid,text,uuid,text,text,integer),public.pet_demo_executar(uuid,jsonb),public.pet_demo_arquivo(uuid,uuid,text,jsonb),public.pet_demo_storage(text,boolean)to authenticated;
notify pgrst,'reload schema';
