-- Staging privado e execução durável. Nunca executa SQL ou código do manifesto.
create table public.nr_import_filas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 lote_id uuid not null, norma text not null check(norma in('NR33','NR35')),origem text not null,chave text not null,
 estado text not null default 'preparando' check(estado in('preparando','fila','processando','pausado','concluido','com_pendencias','cancelado')),
 total integer not null check(total between 1 and 100000),manifesto jsonb not null,
 created_by uuid not null references auth.users(id),updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,origem,chave),
 foreign key(organization_id,lote_id)references public.nr_import_lotes(organization_id,id)
);
create table public.nr_import_fila_itens (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,fila_id uuid not null,
 sequencia integer not null check(sequencia between 1 and 100000),tipo text not null,externo_id text not null,
 payload jsonb not null,destino jsonb not null,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),sha256_origem text not null check(sha256_origem~'^[a-f0-9]{64}$'),staging_sha256 text not null,
 capturado_em timestamptz not null,estado text not null default 'fila' check(estado in('fila','processado','erro')),
 resultado text,motivo text,tentativas integer not null default 0 check(tentativas between 0 and 10),
 updated_at timestamptz not null default now(),
 unique(organization_id,fila_id,sequencia),unique(organization_id,fila_id,tipo,externo_id),
 foreign key(organization_id,fila_id)references public.nr_import_filas(organization_id,id)
);
create table public.nr_import_fila_eventos (
 id bigint generated always as identity primary key,organization_id uuid not null,fila_id uuid not null,
 acao text not null,autor uuid references auth.users(id),detalhes jsonb not null default '{}',created_at timestamptz not null default now(),
 foreign key(organization_id,fila_id)references public.nr_import_filas(organization_id,id)
);
create index nr_import_filas_pendentes on public.nr_import_filas(estado,created_at,id);
create index nr_import_fila_paginacao on public.nr_import_fila_itens(organization_id,fila_id,sequencia);
create index nr_import_fila_trabalho on public.nr_import_fila_itens(fila_id,estado,sequencia);
create index nr_import_filas_contexto on public.nr_import_filas(organization_id,created_at desc,id);
create index nr_import_fila_eventos_tempo on public.nr_import_fila_eventos(organization_id,fila_id,created_at desc,id desc);
do $$declare t text;begin
 foreach t in array array['nr_import_filas','nr_import_fila_itens','nr_import_fila_eventos']loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy nr_import_administrar on public.%I for select to authenticated using(public.pode(organization_id,''configurar_nr''))',t);
 end loop;
end$$;

create function public.nr_import_fila_criar(p_org uuid,p_norma text,p_origem text,p_chave text,p_inicio timestamptz,p_fim timestamptz,p_manifesto jsonb,p_total integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.nr_import_filas;lote uuid;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'configurar_nr')then raise exception 'Sem permissão para administrar importações.'using errcode='42501';end if;
 if p_norma is null or p_norma not in('NR33','NR35')or p_total is null or p_total not between 1 and 100000 or p_inicio is null or p_fim is null or not pg_catalog.isfinite(p_inicio)or not pg_catalog.isfinite(p_fim)or p_fim<p_inicio or jsonb_typeof(p_manifesto)is distinct from 'object' or octet_length(p_manifesto::text)>100000 then raise exception 'Cabeçalho do manifesto inválido.'using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-fila:'||p_org||':'||p_origem||':'||p_chave,0));
 select * into f from public.nr_import_filas where organization_id=p_org and origem=p_origem and chave=p_chave for update;
 if found then
  if(f.norma,f.total,f.manifesto)is distinct from(p_norma,p_total,p_manifesto)or not exists(select 1 from public.nr_import_lotes l where l.organization_id=p_org and l.id=f.lote_id and l.snapshot_inicio is not distinct from p_inicio and l.snapshot_fim is not distinct from p_fim)then raise exception 'Chave de importação reutilizada com outro manifesto ou janela de captura.'using errcode='23505';end if;
  return to_jsonb(f)-'manifesto';
 end if;
 if exists(select 1 from public.nr_import_lotes l where l.organization_id=p_org and l.origem=p_origem and l.chave=p_chave)then raise exception 'Já existe um lote com esta identidade fora desta fila. Use uma nova chave, preservando o histórico.'using errcode='23505';end if;
 lote:=public.nr_iniciar_importacao(p_org,p_origem,p_chave,p_inicio,p_fim,p_manifesto);
 update public.nr_import_lotes set created_by=auth.uid(),executor='interface_nexus'where organization_id=p_org and id=lote and created_by is null;
 insert into public.nr_import_filas(organization_id,lote_id,norma,origem,chave,total,manifesto,created_by,updated_by)
 values(p_org,lote,p_norma,p_origem,p_chave,p_total,p_manifesto,auth.uid(),auth.uid())returning * into f;
 insert into public.nr_import_fila_eventos(organization_id,fila_id,acao,autor,detalhes)values(p_org,f.id,'preparar',auth.uid(),jsonb_build_object('total',p_total));
 return to_jsonb(f)-'manifesto';end$$;

create function public.nr_import_fila_staging(p_org uuid,p_fila uuid,p_itens jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.nr_import_filas;x jsonb;h text;existente public.nr_import_fila_itens;n integer:=0;seq integer;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'configurar_nr')then raise exception 'Sem permissão para administrar importações.'using errcode='42501';end if;
 select * into f from public.nr_import_filas where organization_id=p_org and id=p_fila for update;
 if not found or f.estado<>'preparando'then raise exception 'Fila indisponível para staging; consulte seu estado.'using errcode='23514';end if;
 if jsonb_typeof(p_itens)is distinct from 'array'or jsonb_array_length(p_itens)not between 1 and 25 or octet_length(p_itens::text)>2000000 then raise exception 'Envie até 25 itens e 2 MB de metadados por etapa.'using errcode='23514';end if;
 for x in select value from jsonb_array_elements(p_itens)loop
  perform public.ag_payload(x,array['sequencia','tipo','externo_id','payload','destino','sha256','capturado_em']);
  seq:=(x->>'sequencia')::integer;
  if seq not between 1 and f.total or length(coalesce(x->>'tipo',''))not between 1 and 100 or length(coalesce(x->>'externo_id',''))not between 1 and 1000 or coalesce(x->>'sha256','')!~'^[a-f0-9]{64}$' or jsonb_typeof(x->'payload')is distinct from 'object'or jsonb_typeof(x->'destino')is distinct from 'object' or jsonb_typeof(x#>'{destino,registro}')is distinct from 'object' or x->>'capturado_em'is null then raise exception 'Identidade, snapshot ou destino do item inválido.'using errcode='23514';end if;
  if x#>>'{destino,entidade}'not in('clientes','unidades','locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas','referencias')then raise exception 'Entidade de destino não suportada.'using errcode='23514';end if;
  h:=public.pet_sha256(x);
  select * into existente from public.nr_import_fila_itens where organization_id=p_org and fila_id=p_fila and sequencia=seq;
  if found then
   if existente.staging_sha256<>h then raise exception 'Etapa já recebida com conteúdo diferente; preserve o lote e envie um novo manifesto.'using errcode='23505';end if;
  else
   insert into public.nr_import_fila_itens(organization_id,fila_id,sequencia,tipo,externo_id,payload,destino,sha256,sha256_origem,staging_sha256,capturado_em)
   values(p_org,p_fila,seq,x->>'tipo',x->>'externo_id',x->'payload',x->'destino',public.pet_sha256(x->'payload'),x->>'sha256',h,(x->>'capturado_em')::timestamptz);
  end if;n:=n+1;
 end loop;
 update public.nr_import_filas set updated_at=clock_timestamp(),updated_by=auth.uid()where id=p_fila;
 return jsonb_build_object('confirmados',n,'recebidos',(select count(*)from public.nr_import_fila_itens where organization_id=p_org and fila_id=p_fila));end$$;

create function public.nr_import_fila_comandar(p_org uuid,p_fila uuid,p_acao text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.nr_import_filas;n integer;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'configurar_nr')then raise exception 'Sem permissão para administrar importações.'using errcode='42501';end if;
 select * into f from public.nr_import_filas where organization_id=p_org and id=p_fila for update;
 if not found then raise exception 'Fila indisponível.'using errcode='42501';end if;
 if p_acao='iniciar'then
  if f.estado in('fila','processando','concluido','com_pendencias')then return to_jsonb(f)-'manifesto';end if;
  if f.estado<>'preparando'then raise exception 'O lote não está em preparação.'using errcode='23514';end if;
  select count(*)into n from public.nr_import_fila_itens where organization_id=p_org and fila_id=p_fila;
  if n<>f.total then raise exception 'Staging incompleto: % de % itens recebidos.',n,f.total using errcode='23514';end if;
  update public.nr_import_filas set estado='fila'where id=p_fila;
 elsif p_acao='pausar'then
  if f.estado not in('fila','processando','pausado')then raise exception 'Somente filas em execução podem ser pausadas.'using errcode='23514';end if;
  update public.nr_import_filas set estado='pausado'where id=p_fila;
 elsif p_acao='retomar'then
  if f.estado not in('pausado','com_pendencias','fila')then raise exception 'Estado não permite retomada.'using errcode='23514';end if;
  update public.nr_import_fila_itens set estado='fila',motivo=null where organization_id=p_org and fila_id=p_fila and estado='erro'and tentativas<10;
  if not exists(select 1 from public.nr_import_fila_itens where organization_id=p_org and fila_id=p_fila and estado='fila')then raise exception 'Nenhum erro retomável. Conflitos exigem conciliação; não são sobrescritos.'using errcode='23514';end if;
  update public.nr_import_lotes set estado='importacao'where organization_id=p_org and id=f.lote_id;
  update public.nr_import_filas set estado='fila'where id=p_fila;
 elsif p_acao='cancelar'then
  if f.estado='cancelado'then return to_jsonb(f)-'manifesto';end if;
  if f.estado in('concluido','com_pendencias')then raise exception 'Lote já processado; seus dados e evidências ficam retidos.'using errcode='23514';end if;
  update public.nr_import_filas set estado='cancelado'where id=p_fila;
  update public.nr_import_lotes set estado='com_pendencias',checkpoint=checkpoint||jsonb_build_object('fila_cancelada',true,'fila_id',p_fila),updated_at=clock_timestamp()where organization_id=p_org and id=f.lote_id;
 else raise exception 'Ação de fila inválida.'using errcode='23514';end if;
 update public.nr_import_filas set updated_at=clock_timestamp(),updated_by=auth.uid()where id=p_fila returning * into f;
 insert into public.nr_import_fila_eventos(organization_id,fila_id,acao,autor)values(p_org,p_fila,p_acao,auth.uid());
 return to_jsonb(f)-'manifesto';end$$;

create function public.nr_import_processar(p_limite integer default 10)returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.nr_import_filas;i public.nr_import_fila_itens;d jsonb;k text;dep jsonb;destino_id uuid;r jsonb;n integer:=0;erro text;st text;pendentes integer;hash_efetivo text;begin
 if p_limite is null or p_limite not between 1 and 25 then raise exception 'Limite do worker inválido.'using errcode='23514';end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nexus-nr-import-worker',0))then return jsonb_build_object('processados',0,'ocupado',true);end if;
 for f in select * from public.nr_import_filas where estado in('fila','processando')order by updated_at,id limit p_limite loop
  -- Mesma ordem de locks dos comandos administrativos: autor antes da fila.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||f.organization_id::text,0));
  select q.* into f from public.nr_import_filas q where q.id=f.id and q.estado in('fila','processando')for update skip locked;
  if not found then continue;end if;
  -- A permissão do solicitante é revalidada; o worker não transforma o criador em administrador.
  if not exists(select 1 from public.memberships m join public.user_roles u on u.organization_id=m.organization_id and u.user_id=m.user_id where m.organization_id=f.organization_id and m.user_id=f.created_by and u.role::text in('admin','engenharia'))then
   update public.nr_import_filas set estado='pausado',updated_at=clock_timestamp()where id=f.id;
   insert into public.nr_import_fila_eventos(organization_id,fila_id,acao,detalhes)values(f.organization_id,f.id,'permissao_revogada','{"motivo":"Solicitante sem permissão de configuração; processamento suspenso."}');continue;
  end if;
  perform public.lev_travar_autor(f.organization_id,f.created_by);
  update public.nr_import_filas set estado='processando',updated_at=clock_timestamp()where id=f.id;
  for i in select * from public.nr_import_fila_itens where fila_id=f.id and estado='fila'order by sequencia for update skip locked limit (p_limite-n)loop
   begin
    d:=i.destino;
    for k,dep in select key,value from jsonb_each(coalesce(d->'dependencias','{}'))loop
     if k not in('cliente_id','unidade_id','local_id','pasta_id','parent_id','documento_id','modelo_id')or jsonb_typeof(dep)is distinct from 'object'then raise exception 'Dependência de destino inválida.'using errcode='23514';end if;
     select fonte.destino_id into destino_id from public.nr_fontes fonte where fonte.organization_id=f.organization_id and fonte.origem=f.origem and fonte.tipo=dep->>'tipo'and fonte.externo_id=dep->>'externo_id';
     if destino_id is null then raise exception 'Dependência ainda não conciliada: %.',k using errcode='23514';end if;
     d:=jsonb_set(d,array['registro',k],to_jsonb(destino_id));
    end loop;
    d:=d-'dependencias';
    if d->>'entidade'not in('clientes','unidades','referencias')and not coalesce(d#>'{registro,normas}'@>to_jsonb(array[f.norma]),false)then raise exception 'O destino deve manter a norma declarada neste manifesto.'using errcode='23514';end if;
    d:=jsonb_set(d,array['norma'],to_jsonb(f.norma));
    -- Compatibilidade com hashes históricos de outro serializador: igualdade de
    -- payload é comprovada no mesmo escopo; hash declarado nunca autoriza reuso.
    select fonte.sha256 into hash_efetivo from public.nr_fontes fonte where fonte.organization_id=f.organization_id and fonte.origem=f.origem and fonte.tipo=i.tipo and fonte.externo_id=i.externo_id and fonte.payload=i.payload;
    r:=public.nr_importar_item(f.organization_id,f.lote_id,i.tipo,i.externo_id,i.payload,d,coalesce(hash_efetivo,i.sha256),i.capturado_em);
    update public.nr_import_fila_itens set estado=case when r->>'resultado'='erro'then 'erro'else 'processado'end,resultado=r->>'resultado',motivo=left(r->>'motivo',2000),tentativas=tentativas+1,updated_at=clock_timestamp()where id=i.id;
   exception when others then
    get stacked diagnostics erro=message_text,st=returned_sqlstate;
    update public.nr_import_fila_itens set estado='erro',resultado='erro',motivo=left(erro,2000),tentativas=tentativas+1,updated_at=clock_timestamp()where id=i.id;
    insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,norma,payload,sha256,destino_tipo,resultado,motivo,evidencia,capturado_em,executor)
    values(f.organization_id,f.lote_id,f.origem,i.tipo,i.externo_id,f.norma,i.payload,i.sha256,i.destino->>'entidade','erro',left(erro,2000),jsonb_build_object('fila_id',f.id,'sequencia',i.sequencia,'staging_sha256',i.staging_sha256,'sqlstate',st),i.capturado_em,session_user)
    on conflict(organization_id,lote_id,tipo,externo_id)do update set resultado='erro',motivo=excluded.motivo,evidencia=excluded.evidencia,updated_at=clock_timestamp();
   end;n:=n+1;
  end loop;
  select count(*)into pendentes from public.nr_import_fila_itens where fila_id=f.id and estado='fila';
  if pendentes=0 then
   r:=public.nr_concluir_importacao(f.organization_id,f.lote_id);
   update public.nr_import_filas set estado=case when exists(select 1 from public.nr_import_fila_itens where fila_id=f.id and(estado='erro'or resultado in('conflito','indisponivel','sem_correspondencia')))then 'com_pendencias'else 'concluido'end,updated_at=clock_timestamp()where id=f.id;
   insert into public.nr_import_fila_eventos(organization_id,fila_id,acao,detalhes)values(f.organization_id,f.id,'checkpoint_final',jsonb_build_object('resultado',r));
  else update public.nr_import_filas set estado='fila',updated_at=clock_timestamp()where id=f.id;end if;
  exit when n>=p_limite;
 end loop;
 return jsonb_build_object('processados',n);end$$;

create function public.nr_import_fila_consultar(p_org uuid,p_id uuid default null,p_pagina integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.nr_import_filas;rows jsonb;total integer;agendado boolean;begin
 if not public.pode(p_org,'configurar_nr')then raise exception 'Sem permissão para administrar importações.'using errcode='42501';end if;
 if p_pagina is null or p_pagina not between 0 and 1000000 then raise exception 'Página inválida.'using errcode='23514';end if;
 agendado:=false;
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')then
  execute 'select exists(select 1 from cron.job where jobname=''nexus-nr-import-worker'' and active)'into agendado;
 end if;
 if p_id is null then
  select count(*)into total from public.nr_import_filas where organization_id=p_org;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]')into rows from(select id,lote_id,norma,origem,estado,total,created_at,updated_at,(select count(*)from public.nr_import_fila_itens i where i.fila_id=f.id and i.estado='processado')processados,(select count(*)from public.nr_import_fila_itens i where i.fila_id=f.id)recebidos from public.nr_import_filas f where organization_id=p_org order by created_at desc,id limit 25 offset p_pagina*25)q;
  return jsonb_build_object('rows',rows,'total',total,'pagina',p_pagina,'agendador_ativo',agendado);
 end if;
 select * into f from public.nr_import_filas where organization_id=p_org and id=p_id;
 if not found then raise exception 'Fila indisponível.'using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]')into rows from(select id,sequencia,tipo,externo_id,estado,resultado,motivo,tentativas,sha256,sha256_origem,staging_sha256 from public.nr_import_fila_itens where organization_id=p_org and fila_id=p_id order by sequencia limit 25 offset p_pagina*25)q;
 return jsonb_build_object('fila',to_jsonb(f)-'manifesto','rows',rows,'total',f.total,'pagina',p_pagina,'agendador_ativo',agendado,'recebidos',(select count(*)from public.nr_import_fila_itens where fila_id=p_id),'processados',(select count(*)from public.nr_import_fila_itens where fila_id=p_id and estado='processado'),'erros',(select count(*)from public.nr_import_fila_itens where fila_id=p_id and estado='erro'));
end$$;

revoke all on function public.nr_import_fila_criar(uuid,text,text,text,timestamptz,timestamptz,jsonb,integer),public.nr_import_fila_staging(uuid,uuid,jsonb),public.nr_import_fila_comandar(uuid,uuid,text),public.nr_import_fila_consultar(uuid,uuid,integer),public.nr_import_processar(integer)from public,anon,authenticated,service_role;
grant execute on function public.nr_import_fila_criar(uuid,text,text,text,timestamptz,timestamptz,jsonb,integer),public.nr_import_fila_staging(uuid,uuid,jsonb),public.nr_import_fila_comandar(uuid,uuid,text),public.nr_import_fila_consultar(uuid,uuid,integer)to authenticated;
grant execute on function public.nr_import_processar(integer)to service_role;
do $$begin
 -- O PostgreSQL isolado sem pg_cron conserva a fila, mas informa agendador indisponível.
 -- Em produção a extensão instalada foi conferida antes desta migração.
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron')then
  execute 'select cron.schedule(''nexus-nr-import-worker'',''* * * * *'',''select public.nr_import_processar(10);'')';
 end if;
end$$;
