-- A unidade foi confirmada no cadastro operacional. Uma instalação sem essa tripla não recebe a cena.
insert into public.nr_cenas_unidade(organization_id,cliente_id,unidade_id,cena,estado)
select organization_id,cliente_id,id,'tres-tentos-cruz-alta','publicada'
from public.unidades
where (organization_id,cliente_id,id)=('abab473b-8baa-4781-aed2-c1243338af65','c3d779b6-c407-8ab4-8545-6bdfd6068013','a9f6603b-6497-8e9e-822a-dfc860510c1a')
and arquivado_em is null;
alter table public.nr_cenas_unidade add constraint nr_cena_cruz_alta_cadastro check (
 cena<>'tres-tentos-cruz-alta' or (organization_id,cliente_id,unidade_id)=
 ('abab473b-8baa-4781-aed2-c1243338af65','c3d779b6-c407-8ab4-8545-6bdfd6068013','a9f6603b-6497-8e9e-822a-dfc860510c1a'));
create unique index nr_cena_cruz_alta_unica on public.nr_cenas_unidade(cena)
where cena='tres-tentos-cruz-alta';

-- A hierarquia do levantamento não altera a identidade ou a versão da ficha de campo.
create table public.nr_cena_elementos (
 cena text not null, chave text not null, pai text, tipo text not null
 check(tipo in ('unidade','setor','estrutura','componente','lvhf')),
 nome text not null check(length(trim(nome)) between 2 and 240),
 codigo text, aliases text[] not null default '{}', situacao text, nota text,
 primary key(cena,chave),
 foreign key(cena,pai) references public.nr_cena_elementos(cena,chave) deferrable initially deferred,
 check(chave<>pai)
);
create index nr_cena_elementos_pai on public.nr_cena_elementos(cena,pai);
create index nr_cena_elementos_codigo on public.nr_cena_elementos(cena,codigo);

-- Delegações de consulta são explícitas e não concedem o papel organizacional ver_nr.
create table public.nr_cena_consultores (
 organization_id uuid not null, cliente_id uuid not null, unidade_id uuid not null, usuario_id uuid not null references auth.users(id),
 permite_original boolean not null default false,
 primary key(organization_id,unidade_id,usuario_id),
 foreign key(organization_id,usuario_id) references public.memberships(organization_id,user_id) on delete cascade,
 foreign key(organization_id,cliente_id,unidade_id) references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id)
);
create table public.nr_cena_documentos (
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,local_id uuid not null,documento_id uuid not null,
 escopo text not null check(escopo in ('individual','estrutura','conjunto','unidade')),
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),
 removido_por uuid references auth.users(id),removido_em timestamptz,
 primary key(organization_id,local_id,documento_id,escopo),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 check ((removido_por is null)=(removido_em is null))
);
create index nr_cena_documentos_lista on public.nr_cena_documentos(organization_id,unidade_id,documento_id) where removido_em is null;
-- A intenção guarda o par objeto-arquivo, a autoria, o nome original e o resultado do commit.
create table public.nr_cena_envios (
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,local_id uuid not null,
 operacao uuid not null,autor uuid not null references auth.users(id),arquivo_id uuid not null,
 pedido jsonb not null,publicacao jsonb,resultado jsonb,criado_em timestamptz not null default now(),
 primary key(organization_id,operacao),
 foreign key(organization_id,cliente_id,unidade_id,arquivo_id) references public.nr_arquivos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,local_id) references public.nr_locais(organization_id,cliente_id,unidade_id,id)
);
create index nr_cena_envios_arquivo on public.nr_cena_envios(arquivo_id);
-- Não expõe fichas de preparação, mapa de distribuição, operações ou delegações por PostgREST.
alter table public.nr_cena_consultores enable row level security;
alter table public.nr_cena_documentos enable row level security;
alter table public.nr_cena_elementos enable row level security;
alter table public.nr_cena_envios enable row level security;
revoke all on public.nr_cena_consultores,public.nr_cena_documentos,public.nr_cena_elementos,public.nr_cena_envios from public,anon,authenticated,service_role;

create function public.ca_contexto(p_org uuid) returns public.nr_cenas_unidade language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade;
begin
 select n.* into c from public.nr_cenas_unidade n
 join public.unidades u on (u.organization_id,u.cliente_id,u.id)=(n.organization_id,n.cliente_id,n.unidade_id)
 join public.clientes k on (k.organization_id,k.id)=(n.organization_id,n.cliente_id)
 where n.organization_id=p_org and n.cena='tres-tentos-cruz-alta' and n.estado='publicada'
 and u.arquivado_em is null and k.arquivado_em is null and public.is_member(p_org)
 and (public.pode(p_org,'ver_nr') or exists(select 1 from public.nr_cena_consultores v
 where (v.organization_id,v.cliente_id,v.unidade_id,v.usuario_id)=(p_org,n.cliente_id,n.unidade_id,auth.uid())));
 if not found then raise exception 'Unidade indisponível neste acesso.' using errcode='42501';end if;
 return c;
end$$;
create function public.ca_local(p_org uuid,p_chave text) returns public.nr_locais language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); l public.nr_locais;
begin
 select a.* into l from public.nr_cena_objetos o join public.nr_locais a
 on (a.organization_id,a.cliente_id,a.unidade_id,a.id)=(o.organization_id,o.cliente_id,o.unidade_id,o.local_id)
 join public.nr_cena_elementos e on e.cena=c.cena and e.chave=o.chave
 where (o.organization_id,o.cliente_id,o.unidade_id,o.chave)=(p_org,c.cliente_id,c.unidade_id,p_chave)
 and a.arquivado_em is null and 'NR35'=any(a.normas);
 if not found then raise exception 'Objeto indisponível no acervo desta unidade.' using errcode='42501';end if;
 return l;
end$$;
create function public.ca_estado(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
begin
 return jsonb_build_object('provisionada',exists(select 1 from public.nr_cena_objetos where organization_id=p_org and unidade_id=c.unidade_id and chave='unidade'),
 'pode_provisionar',public.pode(p_org,'cadastrar_nr'));
end$$;
create function public.ca_provisionar(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); e public.nr_cena_elementos; lid uuid; quantidade integer:=0;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'cadastrar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-cadastro:'||c.unidade_id::text,0));
 if not exists(select 1 from public.nr_cena_elementos where cena=c.cena and chave='unidade') then raise exception 'Manifesto da unidade indisponível.' using errcode='55000';end if;
 for e in select * from public.nr_cena_elementos v where v.cena=c.cena and not exists(
 select 1 from public.nr_cena_objetos o where o.organization_id=p_org and o.unidade_id=c.unidade_id and o.chave=v.chave) order by chave loop
  insert into public.nr_locais(organization_id,cliente_id,unidade_id,normas,titulo,tag,tipo,aliases,dados)
  values(p_org,c.cliente_id,c.unidade_id,array['NR35'],e.nome,coalesce(e.codigo,''),e.tipo,e.aliases,jsonb_strip_nulls(jsonb_build_object('situacao_cadastral',e.situacao,'nota_origem',e.nota))) returning id into lid;
  insert into public.nr_cena_objetos(organization_id,cliente_id,unidade_id,chave,local_id)
  values(p_org,c.cliente_id,c.unidade_id,e.chave,lid);
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor)
  values(p_org,'locais',lid,'cadastrar_objeto_cena',jsonb_build_object('cena',c.cena,'chave',e.chave),auth.uid());
  quantidade:=quantidade+1;
 end loop;
 return jsonb_build_object('quantidade',quantidade);
end$$;

-- O escopo "estrutura" resolve o ancestral efetivo. O escopo "unidade" usa a ficha da unidade.
create function public.ca_destino(p_org uuid,p_chave text,p_escopo text) returns public.nr_locais language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); dest text;
begin
 if p_escopo='unidade' then return public.ca_local(p_org,'unidade');end if;
 if p_escopo='estrutura' then
  with recursive cadeia as (
   select chave,pai,tipo from public.nr_cena_elementos where cena='tres-tentos-cruz-alta' and chave=p_chave
   union select e.chave,e.pai,e.tipo from public.nr_cena_elementos e join cadeia p on e.chave=p.pai where e.cena='tres-tentos-cruz-alta')
  select chave into dest from cadeia where tipo='estrutura' limit 1;
  return public.ca_local(p_org,dest);
 end if;
 if p_escopo is null or p_escopo not in('individual','conjunto') then raise exception 'Escopo documental inválido.' using errcode='23514';end if;
 return l;
end$$;

create function public.ca_relacoes(p_org uuid,p_chave text) returns table(documento_id uuid,escopo text,objeto text)
language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 return query
 with recursive cadeia as (
 select e.chave,e.tipo,e.pai from public.nr_cena_elementos e where e.cena='tres-tentos-cruz-alta' and e.chave=p_chave
 union select e.chave,e.tipo,e.pai from public.nr_cena_elementos e join cadeia c on e.chave=c.pai where e.cena='tres-tentos-cruz-alta'),
 alvos as (
 select chave,tipo from cadeia where chave=p_chave or tipo in('componente','estrutura')
 union select e.chave,e.tipo from public.nr_cena_elementos e where e.cena='tres-tentos-cruz-alta' and e.pai=p_chave and e.tipo='lvhf')
 select distinct v.documento_id,v.escopo,o.chave from alvos a join public.nr_cena_objetos o
 on o.chave=a.chave and (o.organization_id,o.cliente_id,o.unidade_id)=(p_org,l.cliente_id,l.unidade_id)
 join public.nr_cena_documentos v on v.organization_id=p_org and v.local_id=o.local_id
 join public.nr_documentos d on d.id=v.documento_id and d.arquivado_em is null and 'NR35'=any(d.normas)
 where v.removido_em is null;
end$$;

-- A errata editorial corrige o índice de consulta; a revisão emitida e o carimbo continuam imutáveis.
create table public.nr_cena_metadados (
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,documento_id uuid primary key,
 titulo text not null check(length(trim(titulo)) between 2 and 240),descricao text not null check(length(descricao)<=20000),
 versao integer not null default 1,autor uuid not null references auth.users(id),atualizado_em timestamptz not null default now(),
 foreign key(organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id)
);
alter table public.nr_cena_metadados enable row level security;
revoke all on public.nr_cena_metadados from public,anon,authenticated,service_role;

create function public.ca_revisoes(p_org uuid,p_doc uuid) returns table(id uuid,rotulo text,data date,arquivo_id uuid,mime text,numero integer)
language sql stable security definer set search_path='' as $$
 select r.id,coalesce(r.snapshot->>'rotulo',r.numero::text),r.data_origem::date,f.id,f.mime,r.numero
 from public.nr_documento_revisoes r
 left join lateral (
 select c.id,c.mime from (
 select a.id,a.mime,count(*) over() as candidatos from public.nr_arquivos a where a.organization_id=p_org and a.bytes_verificados and a.estado='vinculado' and
 ((a.documento_id,a.revisao_id)=(p_doc,r.id) or exists(select 1 from public.nr_arquivo_vinculos v where
 (v.organization_id,v.arquivo_id,v.documento_id,v.revisao_id)=(p_org,a.id,p_doc,r.id)))
 )c where c.id::text=r.snapshot->>'arquivo_id' or (not coalesce(r.snapshot?'arquivo_id',false) and c.candidatos=1) limit 1) f on true
 where r.organization_id=p_org and r.documento_id=p_doc
$$;
create function public.ca_ficha(p_org uuid,p_chave text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 return jsonb_build_object('id',l.id,'chave',p_chave,'titulo',l.titulo,'descricao',l.descricao,'version',l.version,
 'observacoes',coalesce(l.dados->>'observacoes',''),'atributos',coalesce(l.dados->'atributos','{}'),
 'atualizado_em',l.updated_at,'atualizado_por',coalesce(l.dados->>'atualizado_por',l.created_by::text),
 'pode_editar',public.pode(p_org,'editar_nr'),'pode_publicar',public.pode(p_org,'anexar_nr') and public.pode(p_org,'revisar_nr'),
 'cliente_id',l.cliente_id,'unidade_id',l.unidade_id,
 'historico',coalesce((select jsonb_agg(to_jsonb(h) order by h.em desc) from
 (select comando,autor,created_at em from public.nr_historico where organization_id=p_org and recurso='locais' and registro_id=l.id order by created_at desc,id desc limit 30)h),'[]'),
 'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'titulo',coalesce(m.titulo,d.titulo),'descricao',coalesce(m.descricao,d.descricao),'version',d.version+coalesce(m.versao,0),'pode_corrigir',public.pode(p_org,'editar_nr'),'escopo',v.escopo,'objeto',v.objeto,
 'vigente_id',d.revisao_atual_id,'revisoes',coalesce((select jsonb_agg(to_jsonb(r) order by r.numero desc) from public.ca_revisoes(p_org,d.id) r),'[]')) order by d.titulo,v.objeto)
 from public.ca_relacoes(p_org,p_chave) v join public.nr_documentos d on d.id=v.documento_id left join public.nr_cena_metadados m on m.documento_id=d.id),'[]'));
end$$;
create function public.ca_salvar(p_org uuid,p_chave text,p_version integer,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); v jsonb; a jsonb; registro public.nr_locais;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'editar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.ag_payload(p_dados,array['titulo','descricao','observacoes','atributos']);
 if p_dados='{}' or jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>100000
 or exists(select 1 from jsonb_each(p_dados) x where x.key<>'atributos' and jsonb_typeof(x.value)<>'string')
 then raise exception 'Alteração inválida.' using errcode='23514';end if;
 if p_dados?'atributos' then
  if jsonb_typeof(p_dados->'atributos')<>'object' then raise exception 'Atributos inválidos.' using errcode='23514';end if;
  for a in select value from jsonb_each(p_dados->'atributos') loop
   perform public.ag_payload(a,array['valor','unidade','fonte','confirmacao']);
   if jsonb_typeof(a) is distinct from 'object' or not(a?&array['valor','unidade','fonte','confirmacao'])
   or jsonb_typeof(a->'valor') not in ('number','null') or coalesce(length(trim(a->>'unidade')),0) not between 1 and 32
   or coalesce(length(trim(a->>'fonte')),0) not between 1 and 2000
   or coalesce(a->>'confirmacao','') not in('medido','cotado','interpretado','estimado','pendente') then
    raise exception 'Cada dimensão exige unidade, fonte e grau de confirmação.' using errcode='23514';
   end if;
  end loop;
 end if;
 select * into l from public.nr_locais where id=l.id for update;
 if l.version is distinct from p_version then raise exception 'Conflito de edição. Recarregue a ficha e concilie suas alterações.' using errcode='40001';end if;
 v:=l.dados||jsonb_build_object('atualizado_por',auth.uid())||(p_dados-array['titulo','descricao','atributos']);
 if p_dados?'atributos' then v:=v||jsonb_build_object('atributos',coalesce(l.dados->'atributos','{}')||(p_dados->'atributos'));end if;
 update public.nr_locais set titulo=coalesce(p_dados->>'titulo',l.titulo),descricao=coalesce(p_dados->>'descricao',l.descricao),dados=v where id=l.id returning * into registro;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,autor) values(p_org,'locais',l.id,'editar_ficha_cena',to_jsonb(l),to_jsonb(registro),auth.uid());
 return public.ca_ficha(p_org,p_chave);
end$$;
create function public.ca_disponiveis(p_org uuid,p_chave text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'titulo',coalesce(m.titulo,d.titulo)) order by coalesce(m.titulo,d.titulo),d.id)
 from public.nr_documentos d left join public.nr_cena_metadados m on m.documento_id=d.id where (d.organization_id,d.cliente_id,d.unidade_id)=(p_org,l.cliente_id,l.unidade_id)
 and arquivado_em is null and 'NR35'=any(normas)),'[]');
end$$;
create function public.ca_metadados(p_org uuid,p_chave text,p_doc uuid,p_version integer,p_titulo text,p_descricao text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); d public.nr_documentos; m public.nr_cena_metadados; antes jsonb;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'editar_nr') or not exists(select 1 from public.ca_relacoes(p_org,p_chave)v where documento_id=p_doc)
 then raise exception 'Acesso negado.' using errcode='42501';end if;
 select * into strict d from public.nr_documentos where (organization_id,cliente_id,unidade_id,id)=(p_org,l.cliente_id,l.unidade_id,p_doc) and arquivado_em is null for update;
 select * into m from public.nr_cena_metadados where documento_id=d.id;
 if p_version is distinct from(d.version+coalesce(m.versao,0)) then raise exception 'Conflito de edição dos metadados.' using errcode='40001';end if;
 antes:=jsonb_build_object('titulo',coalesce(m.titulo,d.titulo),'descricao',coalesce(m.descricao,d.descricao));
 insert into public.nr_cena_metadados(organization_id,cliente_id,unidade_id,documento_id,titulo,descricao,autor)
 values(p_org,l.cliente_id,l.unidade_id,d.id,p_titulo,p_descricao,auth.uid())
 on conflict(documento_id) do update set titulo=excluded.titulo,descricao=excluded.descricao,versao=nr_cena_metadados.versao+1,atualizado_em=now(),autor=excluded.autor;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,autor)
 values(p_org,'documentos',d.id,'corrigir_metadados_cena',antes,jsonb_build_object('titulo',p_titulo,'descricao',p_descricao,'revisao_id',d.revisao_atual_id),auth.uid());
 return public.ca_ficha(p_org,p_chave);
end$$;
revoke all on function public.ca_metadados(uuid,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ca_metadados(uuid,text,uuid,integer,text,text) to authenticated;
create function public.ca_vinculo(p_org uuid,p_chave text,p_documento uuid,p_escopo text,p_remover boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_destino(p_org,p_chave,p_escopo); evento text;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,case when p_remover then 'arquivar_nr' else 'anexar_nr' end) then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform 1 from public.nr_documentos where (organization_id,cliente_id,unidade_id,id)=(p_org,l.cliente_id,l.unidade_id,p_documento)
 and arquivado_em is null and 'NR35'=any(normas) for share;
 if not found then raise exception 'Documento indisponível neste destino.' using errcode='42501';end if;
 if p_remover then
  update public.nr_cena_documentos set removido_em=now(),removido_por=auth.uid() where
  (organization_id,local_id,documento_id,escopo)=(p_org,l.id,p_documento,p_escopo) and removido_em is null;
  evento:='desvincular_documento';
 else
  insert into public.nr_cena_documentos(organization_id,cliente_id,unidade_id,local_id,documento_id,escopo,criado_por)
  values(p_org,l.cliente_id,l.unidade_id,l.id,p_documento,p_escopo,auth.uid())
  on conflict(organization_id,local_id,documento_id,escopo) do update set
  removido_por=null,removido_em=null,criado_por=excluded.criado_por,criado_em=now() where nr_cena_documentos.removido_em is not null;
  evento:='vincular_documento';
 end if;
 if found then
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor)
  values(p_org,'locais',l.id,evento,jsonb_build_object('documento_id',p_documento,'escopo',p_escopo),auth.uid());
 end if;
 return public.ca_ficha(p_org,p_chave);
end$$;

create function public.ca_preparar(p_org uuid,p_chave text,p_operacao uuid,p_meta jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); a public.nr_arquivos; op public.nr_cena_envios; arquivo uuid;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.ag_payload(p_meta,array['nome','mime','tamanho','sha256']);
 if p_operacao is null or not(p_meta?&array['nome','mime','tamanho','sha256'])
 or (p_meta->>'sha256')!~'^[a-f0-9]{64}$' then raise exception 'Identidade de envio inválida.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-op:'||p_org::text||p_operacao::text,0));
 select * into op from public.nr_cena_envios where organization_id=p_org and operacao=p_operacao;
 if found then
  if (op.autor,op.local_id,op.pedido) is distinct from (auth.uid(),l.id,p_meta) then raise exception 'Operação já utilizada com outro destino ou conteúdo.' using errcode='23505';end if;
  select * into strict a from public.nr_arquivos where id=op.arquivo_id;
 end if;
 if op.operacao is null or (a.estado='arquivado' and op.resultado is null) then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-hash:'||l.unidade_id::text||(p_meta->>'sha256'),0));
  select * into a from public.nr_arquivos f where
  (f.organization_id,f.cliente_id,f.unidade_id,f.sha256,f.mime,f.tamanho)=(p_org,l.cliente_id,l.unidade_id,p_meta->>'sha256',p_meta->>'mime',(p_meta->>'tamanho')::bigint)
  and 'NR35'=any(f.normas) and ((f.bytes_verificados and f.estado='vinculado') or exists(select 1 from public.nr_cena_envios i where i.arquivo_id=f.id and f.estado in('preparado','verificado','falhou')))
  order by (f.estado='vinculado') desc,f.created_at,f.id limit 1 for update;
  if not found then
   arquivo:=(public.nr_arquivo_preparar_interno(p_org,gen_random_uuid(),p_meta||jsonb_build_object(
   'cliente_id',l.cliente_id,'unidade_id',l.unidade_id,'normas',array['NR35']),auth.uid(),false)->>'id')::uuid;
   select * into strict a from public.nr_arquivos where id=arquivo;
  elsif a.estado<>'vinculado' and a.created_by<>auth.uid() then raise exception 'Outro envio deste conteúdo aguarda confirmação.' using errcode='55000';end if;
  insert into public.nr_cena_envios(organization_id,cliente_id,unidade_id,local_id,operacao,autor,arquivo_id,pedido)
  values(p_org,l.cliente_id,l.unidade_id,l.id,p_operacao,auth.uid(),a.id,p_meta)
  on conflict (organization_id,operacao) do update set arquivo_id=excluded.arquivo_id where nr_cena_envios.resultado is null;
 end if;
 if a.estado='arquivado' then raise exception 'Envio arquivado. Inicie outra operação.' using errcode='23514';end if;
 return jsonb_build_object('id',a.id,'estado',a.estado,'caminho',a.caminho,'nome',a.nome,'sha256',a.sha256,'tamanho',a.tamanho,'mime',a.mime);
end$$;

-- Readback privilegiado dos bytes deixa um comprovante não visível no acervo. O commit do autor
-- confirma o arquivo, a revisão, o vínculo, a autoria e o recibo na mesma transação.
create function public.ca_bytes_verificados(p_org uuid,p_arquivo uuid,p_autor uuid,p_sha256 text,p_tamanho bigint,p_mime text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.nr_arquivos;
begin
 perform public.lev_travar_autor(p_org,p_autor);
 if not exists(select 1 from public.memberships m join public.user_roles r using(organization_id,user_id)
 where m.organization_id=p_org and m.user_id=p_autor and r.role::text in('admin','engenharia')) then raise exception 'Acesso revogado.' using errcode='42501';end if;
 select f.* into strict a from public.nr_arquivos f where f.id=p_arquivo and f.organization_id=p_org and exists(
 select 1 from public.nr_cena_envios op where op.arquivo_id=f.id and op.autor=p_autor) for update;
 if (a.sha256,a.tamanho,a.mime) is distinct from (p_sha256,p_tamanho,p_mime) or a.estado='arquivado'
 then raise exception 'Arquivo divergente ou arquivado.' using errcode='23514';end if;
 if a.estado='vinculado' then return;end if;
 if a.created_by is distinct from p_autor or not public.nr_arquivo_destino(p_org,a.id,false) or not exists(
 select 1 from storage.objects where bucket_id='nexus-nr-acervo' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime)
 then raise exception 'Transferência privada ainda não confirmada.' using errcode='23514';end if;
 update public.nr_arquivos set bytes_verificados=true,verificado_em=now(),estado='verificado',erro=null where id=a.id and a.estado<>'verificado';
end$$;

create unique index nr_cena_documento_origem on public.nr_documentos(organization_id,cliente_id,unidade_id,(dados->>'documento_chave'))
where dados->>'acervo'='cena' and dados?'documento_chave';

create table public.nr_cena_origens (
 organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,sistema text not null,externo_id text not null,
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'),documento_id uuid not null,revisao_id uuid not null,
 primary key(organization_id,unidade_id,sistema,externo_id,sha256),
 foreign key (organization_id,cliente_id,unidade_id,documento_id) references public.nr_documentos(organization_id,cliente_id,unidade_id,id),
 foreign key (organization_id,documento_id,revisao_id) references public.nr_documento_revisoes(organization_id,documento_id,id)
);
alter table public.nr_cena_origens enable row level security;
revoke all on public.nr_cena_origens from public,anon,authenticated,service_role;

create function public.ca_localizar_origem(p_org uuid,p_chave text,p_doc_chave text,p_source text,p_sha text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); d public.nr_documentos; anterior uuid;
begin
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select * into d from public.nr_documentos where (organization_id,cliente_id,unidade_id)=(p_org,l.cliente_id,l.unidade_id)
 and dados->>'acervo'='cena' and dados->>'documento_chave'=p_doc_chave and arquivado_em is null;
 select revisao_id into anterior from public.nr_cena_origens where documento_id=d.id and externo_id=p_source and sha256=p_sha limit 1;
 return jsonb_build_object('documento_id',d.id,'vigente_id',d.revisao_atual_id,'revisao_id',anterior);
end$$;

create function public.ca_publicar(p_org uuid,p_chave text,p_operacao uuid,p_arquivo uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); dest public.nr_locais;
 op public.nr_cena_envios; a public.nr_arquivos; d public.nr_documentos; r public.nr_documento_revisoes;
 doc uuid:=(p_dados->>'documento_id')::uuid; prev uuid:=(p_dados->>'anterior_id')::uuid;
 v_titulo text:=trim(p_dados->>'titulo'); rotulo text:=trim(p_dados->>'rotulo'); origem jsonb:=p_dados->'origem';
 origem_chave text:=origem->>'documento_chave'; v_resultado jsonb; n integer:=1; reutilizada boolean:=false;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') or not public.pode(p_org,'revisar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.ag_payload(p_dados,array['documento_id','anterior_id','titulo','rotulo','data','escopo','origem','categoria']);
 dest:=public.ca_destino(p_org,p_chave,p_dados->>'escopo');
 if coalesce(length(v_titulo),0) not between 2 and 240 or coalesce(length(rotulo),0) not between 1 and 100 or coalesce(p_dados->>'data','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Título, revisão interna e data obrigatórios.' using errcode='23514';end if;
 if origem is not null then
  perform public.ag_payload(origem,array['sistema','id','pagina','autor','documento_chave']);
  if coalesce(origem->>'sistema','') not in('google_drive','anexo') or coalesce(length(trim(origem->>'id')),0) not between 1 and 500
  or coalesce((origem->>'pagina')::integer,0)<1 or length(origem_chave)>500 then raise exception 'Proveniência incompleta.' using errcode='23514';end if;
 end if;
 select * into op from public.nr_cena_envios where organization_id=p_org and operacao=p_operacao for update;
 if not found or (op.autor,op.arquivo_id,op.local_id) is distinct from(auth.uid(),p_arquivo,l.id) then raise exception 'Envio indisponível neste destino.' using errcode='42501';end if;
 if op.resultado is not null then
  if op.publicacao is distinct from p_dados then raise exception 'Operação já confirmada com outro pedido.' using errcode='23505';end if;
  return op.resultado;
 end if;
 select * into strict a from public.nr_arquivos where id=p_arquivo for update;
 if a.estado not in('verificado','vinculado') or not a.bytes_verificados then raise exception 'Bytes ainda não validados no servidor.' using errcode='23514';end if;
 if a.estado='verificado' then perform public.nr_arquivo_confirmar_interno(p_org,a.id,a.sha256,a.tamanho,a.mime,auth.uid(),false);end if;
 if origem_chave is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-doc:'||l.unidade_id::text||origem_chave,0));
  select * into d from public.nr_documentos where (organization_id,cliente_id,unidade_id)=(p_org,l.cliente_id,l.unidade_id) and dados->>'acervo'='cena' and dados->>'documento_chave'=origem_chave;
  if d.id is not null and d.id is distinct from doc then raise exception 'Conflito de origem. Confira o documento e a revisão vigente.' using errcode='40001';end if;
 end if;
 if doc is not null then
  select * into d from public.nr_documentos where (organization_id,cliente_id,unidade_id,id)=(p_org,l.cliente_id,l.unidade_id,doc)
  and dados->>'acervo'='cena' and arquivado_em is null and 'NR35'=any(normas) for update;
  if not found or not exists(select 1 from public.ca_relacoes(p_org,p_chave) v where v.documento_id=doc) then raise exception 'Documento indisponível para revisão neste destino.' using errcode='42501';end if;
  if d.revisao_atual_id is distinct from prev or prev is null then raise exception 'Conflito de revisão. Confira a revisão vigente.' using errcode='40001';end if;
  select * into strict r from public.nr_documento_revisoes where id=prev;
  if origem is not null and ((rotulo~'^[0-9]+$' and (r.snapshot->>'rotulo')~'^[0-9]+$' and rotulo::numeric<=(r.snapshot->>'rotulo')::numeric)
  or (p_dados->>'data')::date<r.data_origem::date) then raise exception 'Revisão anterior ou ambígua. Concilie a fonte antes da publicação.' using errcode='23514';end if;
  n:=r.numero+1;
  update public.nr_documento_revisoes set vigencia='superada' where id=prev;
 else
  -- Outra intenção para o mesmo original, destino e revisão recupera o primeiro registro.
  select v.* into r from public.nr_documento_revisoes v join public.nr_documentos original on original.id=v.documento_id
  join public.nr_cena_documentos link on link.documento_id=original.id
  where link.local_id=dest.id and link.escopo=p_dados->>'escopo' and link.removido_em is null and original.arquivado_em is null
  and original.dados->>'acervo'='cena' and original.titulo=v_titulo and v.snapshot->>'arquivo_id'=a.id::text and v.snapshot->>'rotulo'=rotulo
  and v.data_origem::date=(p_dados->>'data')::date and (original.dados->>'documento_chave') is not distinct from origem_chave limit 1;
  if found then doc:=r.documento_id;reutilizada:=true;
  else
   insert into public.nr_documentos(organization_id,cliente_id,unidade_id,normas,titulo,tipo,estado,recebimento,dados)
   values(p_org,l.cliente_id,l.unidade_id,array['NR35'],v_titulo,'original_externo','emitido_origem','recebido',
   jsonb_strip_nulls(jsonb_build_object('acervo','cena','categoria',coalesce(p_dados->>'categoria',p_dados->>'escopo'),'documento_chave',origem_chave))) returning id into doc;
  end if;
 end if;
 if not reutilizada then
  insert into public.nr_documento_revisoes(organization_id,documento_id,numero,estado,substitui_id,sha256,data_origem,snapshot)
  values(p_org,doc,n,'emitido_origem',prev,a.sha256,(p_dados->>'data')::date,
  jsonb_strip_nulls(jsonb_build_object('rotulo',rotulo,'arquivo_id',a.id,'origem',origem,'nome_original',op.pedido->>'nome','titulo',v_titulo,'mime',a.mime,'bytes',a.tamanho))) returning * into r;
  insert into public.nr_arquivo_vinculos(organization_id,cliente_id,unidade_id,arquivo_id,documento_id,revisao_id,origem_chave,evidencia)
  values(p_org,l.cliente_id,l.unidade_id,a.id,doc,r.id,'cena:'||r.id::text,jsonb_build_object('autor',auth.uid(),'sha256',a.sha256,'origem',origem));
  update public.nr_documentos set revisao_atual_id=r.id,titulo=v_titulo where id=doc;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor) values
  (p_org,'documentos',doc,'publicar_original_recebido',jsonb_build_object('revisao',r.id,'arquivo',a.id,'rotulo',rotulo,'substitui',prev,'origem',origem),auth.uid());
 end if;
 if origem is not null then
  insert into public.nr_cena_origens values(p_org,l.cliente_id,l.unidade_id,origem->>'sistema',origem->>'id',a.sha256,doc,r.id)
  on conflict do nothing;
  if not exists(select 1 from public.nr_cena_origens s where (s.organization_id,s.unidade_id,s.sistema,s.externo_id,s.sha256,s.documento_id,s.revisao_id)=
  (p_org,l.unidade_id,origem->>'sistema',origem->>'id',a.sha256,doc,r.id)) then raise exception 'Origem já associada a outra revisão.' using errcode='23505';end if;
 end if;
 perform public.ca_vinculo(p_org,p_chave,doc,p_dados->>'escopo',false);
 v_resultado:=jsonb_build_object('documento_id',doc,'revisao_id',r.id);
 update public.nr_cena_envios set publicacao=p_dados,resultado=v_resultado where organization_id=p_org and operacao=p_operacao;
 return v_resultado;
end$$;

-- Só entrega os bytes associados à revisão do documento alcançável pela ficha pedida.
create function public.ca_previa(p_org uuid,p_chave text,p_doc uuid,p_rev uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); a public.nr_arquivos;
begin
 if not exists(select 1 from public.ca_relacoes(p_org,p_chave) d where d.documento_id=p_doc)
 then raise exception 'Revisão indisponível neste destino.' using errcode='42501';end if;
 select f.* into a from public.ca_revisoes(p_org,p_doc) r join public.nr_arquivos f on f.id=r.arquivo_id
 where r.id=p_rev and (f.organization_id,f.cliente_id,f.unidade_id)=(p_org,l.cliente_id,l.unidade_id);
 if not found then raise exception 'Prévia indisponível para esta revisão.' using errcode='55000';end if;
 if not(public.nr_arquivo_ler(p_org,a.id) or exists(select 1 from public.nr_cena_consultores v where
 (v.organization_id,v.cliente_id,v.unidade_id,v.usuario_id)=(p_org,l.cliente_id,l.unidade_id,auth.uid()) and v.permite_original)) then
 raise exception 'Seu perfil não permite abrir os bytes originais desta revisão.' using errcode='42501';end if;
 if a.mime<>'application/pdf' and a.mime not like 'image/%' then raise exception 'Prévia indisponível para este formato.' using errcode='55000';end if;
 return jsonb_build_object('arquivo_id',a.id,'tamanho',a.tamanho,'mime',a.mime,'sha256',a.sha256,'caminho',a.caminho);
end$$;
create function public.ca_envio(p_org uuid,p_chave text,p_operacao uuid,p_arquivo uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); a public.nr_arquivos;
begin
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select f.* into a from public.nr_cena_envios e join public.nr_arquivos f on f.id=e.arquivo_id where
 (e.organization_id,e.cliente_id,e.unidade_id,e.local_id,e.operacao,e.arquivo_id,e.autor)=(p_org,l.cliente_id,l.unidade_id,l.id,p_operacao,p_arquivo,auth.uid()) and f.estado<>'arquivado';
 if not found then raise exception 'Envio indisponível.' using errcode='42501';end if;
 return jsonb_build_object('id',a.id,'nome',a.nome,'sha256',a.sha256,'tamanho',a.tamanho,'mime',a.mime,'estado',a.estado,'caminho',a.caminho);
end$$;

-- Aposenta o caminho antes da limpeza no Storage. Uma retomada reserva outro UUID físico,
-- portanto a limpeza atrasada e tentativas concorrentes não removem o original recuperado.
create function public.ca_retirar_pendente(p_org uuid,p_chave text,p_operacao uuid,p_arquivo uuid)
returns text language plpgsql security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave); a public.nr_arquivos;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform 1 from public.nr_cena_envios where (organization_id,operacao,local_id,arquivo_id,autor)=(p_org,p_operacao,l.id,p_arquivo,auth.uid())
 and resultado is null for update;
 if not found then raise exception 'Envio indisponível.' using errcode='42501';end if;
 select * into strict a from public.nr_arquivos where id=p_arquivo for update;
 if a.created_by is distinct from auth.uid() or a.bytes_verificados or a.estado not in('preparado','falhou','arquivado')
 or a.documento_id is not null or exists(select 1 from public.nr_arquivo_vinculos where arquivo_id=a.id)
 then raise exception 'Arquivo retido pelo acervo.' using errcode='23514';end if;
 if a.estado<>'arquivado' then
  update public.nr_arquivos set estado='arquivado',arquivado_em=now(),erro='Transferência incompleta ou inválida.' where id=a.id;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor)
  values(p_org,'arquivos',a.id,'descartar_transferencia_pendente',jsonb_build_object('operacao',p_operacao),auth.uid());
 end if;
 return a.caminho;
end$$;
revoke all on function public.ca_retirar_pendente(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ca_retirar_pendente(uuid,text,uuid,uuid) to authenticated;

-- RPCs auxiliares e os dados do manifesto exigem a jornada contextual das funções públicas.
revoke all on function public.ca_contexto(uuid),public.ca_local(uuid,text),public.ca_destino(uuid,text,text),
public.ca_revisoes(uuid,uuid),public.ca_relacoes(uuid,text),public.ca_bytes_verificados(uuid,uuid,uuid,text,bigint,text),
public.ca_previa(uuid,text,uuid,uuid),public.ca_envio(uuid,text,uuid,uuid),public.ca_localizar_origem(uuid,text,text,text,text),
public.ca_estado(uuid),public.ca_provisionar(uuid),public.ca_ficha(uuid,text),public.ca_salvar(uuid,text,integer,jsonb),
public.ca_disponiveis(uuid,text),public.ca_vinculo(uuid,text,uuid,text,boolean),public.ca_preparar(uuid,text,uuid,jsonb),
public.ca_publicar(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ca_bytes_verificados(uuid,uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.ca_previa(uuid,text,uuid,uuid),public.ca_envio(uuid,text,uuid,uuid),public.ca_localizar_origem(uuid,text,text,text,text),
public.ca_estado(uuid),public.ca_provisionar(uuid),public.ca_ficha(uuid,text),public.ca_salvar(uuid,text,integer,jsonb),
public.ca_disponiveis(uuid,text),public.ca_vinculo(uuid,text,uuid,text,boolean),public.ca_preparar(uuid,text,uuid,jsonb),
public.ca_publicar(uuid,text,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Inventário privado de conferência. O snapshot registra a leitura da pasta e as pendências
-- independentemente de haver um original validado e publicado.
create table public.nr_cena_inventarios (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,cliente_id uuid not null,unidade_id uuid not null,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),fontes jsonb not null check(jsonb_typeof(fontes)='array'),
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),atual boolean not null default true,
 unique(organization_id,unidade_id,sha256),
 foreign key(organization_id,cliente_id,unidade_id) references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id)
);
create unique index nr_cena_inventario_atual on public.nr_cena_inventarios(organization_id,unidade_id) where atual;
alter table public.nr_cena_inventarios enable row level security;
revoke all on public.nr_cena_inventarios from public,anon,authenticated,service_role;
create function public.ca_inventario(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
begin
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 return coalesce((select fontes from public.nr_cena_inventarios where organization_id=p_org and unidade_id=c.unidade_id and atual),'[]');
end$$;
create function public.ca_conciliar_inventario(p_org uuid,p_fontes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org); i public.nr_cena_inventarios; digest text; n integer;
begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'anexar_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if jsonb_typeof(p_fontes) is distinct from 'array' or octet_length(p_fontes::text)>2097152 then raise exception 'Inventário inválido ou extenso.' using errcode='23514';end if;
 n:=jsonb_array_length(p_fontes);
 if n>2000 or exists(select 1 from jsonb_array_elements(p_fontes) e where jsonb_typeof(e)<>'object' or coalesce(length(e->>'sourceId'),0) not between 1 and 500)
 or n<>(select count(distinct e->>'sourceId') from jsonb_array_elements(p_fontes) e)
 then raise exception 'Inventário contém fonte inválida, repetida ou excede 2.000 itens.' using errcode='23514';end if;
 -- A ordem de enumeração do Drive não caracteriza um novo snapshot.
 select coalesce(jsonb_agg(value order by value->>'sourceId'),'[]') into p_fontes from jsonb_array_elements(p_fontes);
 digest:=encode(sha256(convert_to(p_fontes::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ca-inventario:'||c.unidade_id::text,0));
 select * into i from public.nr_cena_inventarios where organization_id=p_org and unidade_id=c.unidade_id and sha256=digest;
 if i.id is null or not i.atual then
  update public.nr_cena_inventarios set atual=false where organization_id=p_org and unidade_id=c.unidade_id and atual;
  insert into public.nr_cena_inventarios(organization_id,cliente_id,unidade_id,sha256,fontes,criado_por)
  values(p_org,c.cliente_id,c.unidade_id,digest,p_fontes,auth.uid()) on conflict(organization_id,unidade_id,sha256)
  do update set atual=true returning * into i;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor)
  values(p_org,'inventario_cena',i.id,'conciliar_inventario',jsonb_build_object('unidade_id',c.unidade_id,'cliente_id',c.cliente_id,'sha256',digest,'quantidade',n),auth.uid());
 end if;
 return jsonb_build_object('id',i.id,'sha256',digest,'quantidade',n);
end$$;
revoke all on function public.ca_inventario(uuid),public.ca_conciliar_inventario(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ca_inventario(uuid),public.ca_conciliar_inventario(uuid,jsonb) to authenticated;
