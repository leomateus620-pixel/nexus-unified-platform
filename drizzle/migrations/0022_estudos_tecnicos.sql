-- Estudos técnicos: métodos aprovados, submissões imutáveis e decisões profissionais.
-- Não contém critérios normativos, fórmulas, certificação automática ou emissão de ART.
alter table public.documentos add constraint est_documento_org unique(organization_id,id);

create table public.est_metodos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 nome text not null check(length(trim(nome)) between 3 and 160),descricao text not null default '' check(length(descricao)<=2000),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,nome)
);
create table public.est_metodo_versoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,metodo_id uuid not null,numero integer not null check(numero>0),
 nome text not null check(length(trim(nome)) between 3 and 160),tipo text not null check(tipo in ('apreciacao_riscos','classificacao','memorial','solucao')),
 instrucoes text not null check(length(trim(instrucoes)) between 3 and 20000),fontes jsonb not null,requisitos jsonb not null,
 responsavel_id uuid not null,registro_profissional text not null check(length(trim(registro_profissional)) between 3 and 500),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(metodo_id,numero),
 foreign key(organization_id,metodo_id) references public.est_metodos(organization_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id),
 check(jsonb_typeof(fontes)='array' and jsonb_array_length(fontes) between 1 and 50),check(jsonb_typeof(requisitos)='object')
);
create table public.estudos_tecnicos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),codigo text not null,
 titulo text not null check(length(trim(titulo)) between 3 and 200),tipo text not null check(tipo in ('apreciacao_riscos','classificacao','memorial','solucao')),
 cliente_id uuid not null,unidade_id uuid not null,projeto_id uuid,responsavel_id uuid not null,
 visibilidade text not null default 'restrito' check(visibilidade in ('organizacao','restrito')),revisao_atual_id uuid,aprovada_id uuid,
 version integer not null default 1 check(version>0),created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,codigo),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,cliente_id,projeto_id) references public.projetos(organization_id,cliente_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create index estudo_lista on public.estudos_tecnicos(organization_id,updated_at desc,id);
create index estudo_responsavel on public.estudos_tecnicos(organization_id,responsavel_id,id);
create table public.estudo_revisoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,numero integer not null check(numero>0),base_id uuid,
 metodo_versao_id uuid,estado text not null default 'elaboracao' check(estado in ('elaboracao','em_revisao','aprovado','cancelado')),
 escopo text not null default '' check(length(escopo)<=20000),premissas text not null default '' check(length(premissas)<=20000),
 analise text not null default '' check(length(analise)<=40000),conclusao text not null default '' check(length(conclusao)<=20000),
 responsavel_tecnico_id uuid not null,revisor_id uuid,responsabilidade_tecnica text not null default '' check(length(responsabilidade_tecnica)<=4000),
 art_referencia text not null default '' check(length(art_referencia)<=500),submissao_atual_id uuid,
 snapshot jsonb,snapshot_sha256 text,aprovado_por uuid references auth.users(id),aprovado_em timestamptz,
 version integer not null default 1 check(version>0),created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estudo_id,id),unique(estudo_id,numero),
 foreign key(organization_id,estudo_id) references public.estudos_tecnicos(organization_id,id),
 foreign key(organization_id,estudo_id,base_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,metodo_versao_id) references public.est_metodo_versoes(organization_id,id),
 foreign key(organization_id,responsavel_tecnico_id) references public.pessoas(organization_id,id),
 foreign key(organization_id,revisor_id) references public.pessoas(organization_id,id),
 check((estado='aprovado')=(snapshot is not null and snapshot_sha256 is not null and aprovado_por is not null and aprovado_em is not null))
);
create index estudo_revisoes_fila on public.estudo_revisoes(organization_id,estado,revisor_id,id);
alter table public.estudos_tecnicos add constraint est_atual_fk foreign key(organization_id,id,revisao_atual_id) references public.estudo_revisoes(organization_id,estudo_id,id);
alter table public.estudos_tecnicos add constraint est_aprovada_fk foreign key(organization_id,id,aprovada_id) references public.estudo_revisoes(organization_id,estudo_id,id);
create table public.estudo_perigos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,base_id uuid,
 codigo text not null check(length(trim(codigo)) between 1 and 40),descricao text not null default '' check(length(descricao)<=4000),
 local text not null default '' check(length(local)<=500),exposicao text not null default '' check(length(exposicao)<=4000),
 avaliacao text not null default '' check(length(avaliacao)<=4000),critico boolean not null default false,
 version integer not null default 1 check(version>0),created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estudo_id,id),unique(organization_id,estudo_id,revisao_id,id),unique(revisao_id,codigo),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id,base_id) references public.estudo_perigos(organization_id,estudo_id,id)
);
create table public.estudo_medida_linhagens (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,acao_id uuid,acao_request_hash text,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id) references public.estudos_tecnicos(organization_id,id),
 foreign key(organization_id,acao_id) references public.acoes_operacionais(organization_id,id),check((acao_id is null)=(acao_request_hash is null))
);
create table public.estudo_medidas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,perigo_id uuid not null,
 linhagem_id uuid not null,base_id uuid,descricao text not null default '' check(length(descricao)<=4000),fundamento text not null default '' check(length(fundamento)<=4000),
 prioridade text not null default 'normal' check(prioridade in ('baixa','normal','alta','critica')),responsavel_id uuid,prazo date,exige_acao boolean not null default true,
 version integer not null default 1 check(version>0),created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estudo_id,id),unique(organization_id,estudo_id,revisao_id,id),unique(revisao_id,linhagem_id),
 foreign key(organization_id,estudo_id,revisao_id,perigo_id) references public.estudo_perigos(organization_id,estudo_id,revisao_id,id),
 foreign key(organization_id,estudo_id,linhagem_id) references public.estudo_medida_linhagens(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id,base_id) references public.estudo_medidas(organization_id,estudo_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.estudo_fontes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,
 tipo text not null check(tipo in ('levantamento','projeto_engenharia','documento')),
 levantamento_id uuid,levantamento_revisao_id uuid,pe_projeto_id uuid,pe_versao_id uuid,documento_id uuid,
 titulo text not null,numero integer,sha256 text,justificativa text not null check(length(trim(justificativa)) between 3 and 2000),
 ativa boolean not null default true,desativada_motivo text,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,levantamento_id,levantamento_revisao_id) references public.levantamento_revisoes(organization_id,levantamento_id,id),
 foreign key(organization_id,pe_projeto_id,pe_versao_id) references public.pe_versoes(organization_id,projeto_id,id),
 foreign key(organization_id,documento_id) references public.documentos(organization_id,id),
 check((tipo='levantamento' and levantamento_id is not null and levantamento_revisao_id is not null and pe_projeto_id is null and pe_versao_id is null and documento_id is null)
 or(tipo='projeto_engenharia' and pe_projeto_id is not null and pe_versao_id is not null and levantamento_id is null and levantamento_revisao_id is null and documento_id is null)
 or(tipo='documento' and documento_id is not null and levantamento_id is null and levantamento_revisao_id is null and pe_projeto_id is null and pe_versao_id is null)),
 check(ativa or length(trim(desativada_motivo)) between 3 and 2000)
);
create unique index estudo_fonte_lev on public.estudo_fontes(revisao_id,levantamento_revisao_id) where levantamento_revisao_id is not null;
create unique index estudo_fonte_pe on public.estudo_fontes(revisao_id,pe_versao_id) where pe_versao_id is not null;
create unique index estudo_fonte_doc on public.estudo_fontes(revisao_id,documento_id) where documento_id is not null;
create index estudo_fontes_pai on public.estudo_fontes(organization_id,estudo_id,revisao_id);
create table public.estudo_arquivos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,perigo_id uuid,
 nome text not null check(length(nome) between 1 and 240),mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),
 tamanho bigint not null check(tamanho between 1 and 20971520),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),caminho text not null unique,
 estado text not null default 'pendente' check(estado in ('pendente','enviado','vinculado','cancelado')),motivo text,confirmado_em timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id,revisao_id,perigo_id) references public.estudo_perigos(organization_id,estudo_id,revisao_id,id)
);
create index estudo_arquivos_pai on public.estudo_arquivos(organization_id,revisao_id,perigo_id,estado);
create table public.estudo_submissoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,numero integer not null check(numero>0),
 snapshot jsonb not null,sha256 text not null check(sha256~'^[0-9a-f]{64}$'),autor uuid not null default auth.uid() references auth.users(id),
 pessoa_id uuid not null,registro_profissional text not null,created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,estudo_id,revisao_id,id),unique(revisao_id,numero),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
alter table public.estudo_revisoes add constraint est_submissao_fk foreign key(organization_id,estudo_id,id,submissao_atual_id) references public.estudo_submissoes(organization_id,estudo_id,revisao_id,id);
create table public.estudo_decisoes (
 id bigint generated always as identity primary key,organization_id uuid not null,estudo_id uuid not null,revisao_id uuid not null,submissao_id uuid,
 decisao text not null check(decisao in ('devolver','aprovar','cancelar')),motivo text not null check(length(trim(motivo)) between 3 and 4000),
 pessoa_id uuid,registro_profissional text,responsabilidade_tecnica text not null default '',autor uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id,revisao_id,submissao_id) references public.estudo_submissoes(organization_id,estudo_id,revisao_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create unique index estudo_uma_decisao_submissao on public.estudo_decisoes(submissao_id) where submissao_id is not null;
create table public.estudo_substituicoes (
 organization_id uuid not null,estudo_id uuid not null,anterior_id uuid not null,atual_id uuid not null,
 autor uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 primary key(organization_id,anterior_id),unique(organization_id,atual_id),check(anterior_id<>atual_id),
 foreign key(organization_id,estudo_id,anterior_id) references public.estudo_revisoes(organization_id,estudo_id,id),
 foreign key(organization_id,estudo_id,atual_id) references public.estudo_revisoes(organization_id,estudo_id,id)
);
create table public.estudo_eventos (
 id bigint generated always as identity primary key,organization_id uuid not null,estudo_id uuid not null,revisao_id uuid,
 comando text not null,motivo text,autor uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organization_id,estudo_id) references public.estudos_tecnicos(organization_id,id),
 foreign key(organization_id,estudo_id,revisao_id) references public.estudo_revisoes(organization_id,estudo_id,id)
);
create index estudo_eventos_pai on public.estudo_eventos(organization_id,estudo_id,id desc);

-- Mesma ordem global de locks dos vínculos administrativos e Lev; nunca expor ator arbitrário.
create function public.est_travar_autor(_org uuid,_autor uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.lev_travar_autor(_org,_autor);end $$;
create function public.est_autor_base(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(_org,_autor,'revisar_operacao') and exists(select 1 from public.estudos_tecnicos e where e.organization_id=_org and e.id=_id and
 (e.visibilidade='organizacao' or e.created_by=_autor or exists(select 1 from public.user_roles r where r.organization_id=_org and r.user_id=_autor and r.role='admin')
 or exists(select 1 from public.pessoas p where p.organization_id=_org and p.user_id=_autor and p.ativa and(p.id=e.responsavel_id or exists(select 1 from public.estudo_revisoes v where v.estudo_id=e.id and v.id=e.revisao_atual_id and p.id in(v.responsavel_tecnico_id,v.revisor_id))))));
$$;
create function public.est_autor_fonte(_org uuid,_autor uuid,_lev uuid,_pe uuid,_doc uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when _lev is not null then public.lev_autor_ler(_org,_lev,_autor)
 when _pe is not null then public.pe_autor_acessa(_org,_pe,_autor)
 when _doc is not null then exists(select 1 from public.documentos d where d.organization_id=_org and d.id=_doc and exists(select 1 from public.memberships m where m.organization_id=_org and m.user_id=_autor)
 and(not d.interno or exists(select 1 from public.user_roles r where r.organization_id=_org and r.user_id=_autor and r.role in('admin','comercial','engenharia','compras','financeiro')))) else false end;
$$;
create function public.est_autor_ler(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.est_autor_base(_org,_id,_autor) and not exists(select 1 from public.estudo_fontes f where f.organization_id=_org and f.estudo_id=_id
 and not public.est_autor_fonte(_org,_autor,f.levantamento_id,f.pe_projeto_id,f.documento_id));
$$;
create function public.est_pe_fonte_valida(_org uuid,_versao uuid,_cliente uuid,_unidade uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pe_versoes v where v.organization_id=_org and v.id=_versao and v.estado='congelada'
 and v.snapshot->'projeto'->>'id'=v.projeto_id::text and v.snapshot->'projeto'->>'organization_id'=_org::text
 and v.snapshot->'projeto'->>'cliente_id'=_cliente::text and v.snapshot->'projeto'->>'unidade_id'=_unidade::text);
$$;
create function public.est_doc_fonte_valida(_org uuid,_documento uuid,_cliente uuid,_unidade uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.documentos d join public.proposta_revisoes r on r.organization_id=d.organization_id and r.id=d.revisao_id join public.propostas p on p.organization_id=r.organization_id and p.id=r.proposta_id
 where d.organization_id=_org and d.id=_documento and d.snapshot->'contexto'->>'organization_id'=_org::text
 and d.snapshot->'contexto'->>'cliente_id'=_cliente::text and d.snapshot->'contexto'->>'unidade_id'=_unidade::text
 and d.snapshot->'contexto'->>'proposta_id'=p.id::text and d.snapshot->'contexto'->>'revisao_id'=r.id::text);
$$;
create function public.est_ler(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.est_autor_ler(_org,_id,auth.uid()); $$;
create function public.est_ler_arquivo(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.estudo_arquivos a where a.organization_id=_org and a.id=_id and a.estado<>'cancelado' and public.est_ler(_org,a.estudo_id));
$$;
create function public.est_travar_fontes(_org uuid,_estudo uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.levantamentos l where l.organization_id=_org and exists(select 1 from public.estudo_fontes f where f.estudo_id=_estudo and f.levantamento_id=l.id) order by l.id for share;
 perform 1 from public.pe_projetos p where p.organization_id=_org and exists(select 1 from public.estudo_fontes f where f.estudo_id=_estudo and f.pe_projeto_id=p.id) order by p.id for share;
 perform 1 from public.documentos d where d.organization_id=_org and exists(select 1 from public.estudo_fontes f where f.estudo_id=_estudo and f.documento_id=d.id) order by d.id for share;
end $$;

create function public.est_vincular_acao(_org uuid,_chave uuid,_medida uuid,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.estudo_medidas;r public.estudo_revisoes;l public.estudo_medida_linhagens;a public.acoes_operacionais;replay jsonb;resultado jsonb;
 payload jsonb:=jsonb_build_object('medida',_medida,'dados',_dados);begin
 select * into m from public.estudo_medidas where organization_id=_org and id=_medida;if not found then raise exception 'Medida indisponível.' using errcode='42501';end if;
 r:=public.est_travar_destino(_org,m.revisao_id,auth.uid(),false);
 select * into m from public.estudo_medidas where organization_id=_org and id=_medida for share;if not found then raise exception 'Medida indisponível.' using errcode='42501';end if;
 if public.est_profissional(_org,auth.uid()) is null then raise exception 'Liberação de instrução exige profissional com registro atual.' using errcode='42501';end if;
 replay:=public.operacao_repetir(_org,_chave,'est_vincular_acao',payload);if replay is not null then return replay;end if;
 if r.estado<>'aprovado' or not exists(select 1 from public.estudos_tecnicos where id=r.estudo_id and aprovada_id=r.id) then raise exception 'Libere ações a partir da revisão aprovada vigente.' using errcode='23514';end if;
 select * into l from public.estudo_medida_linhagens where organization_id=_org and estudo_id=m.estudo_id and id=m.linhagem_id for update;
 if l.acao_id is not null then
  if l.acao_request_hash<>md5(_dados::text) and nullif(_dados->>'acao_id','')::uuid is distinct from l.acao_id then raise exception 'Ação já vinculada; consulte sua ficha para alterar a execução.' using errcode='23505';end if;
 else
  if nullif(_dados->>'acao_id','') is not null then
   select * into a from public.acoes_operacionais where organization_id=_org and id=(_dados->>'acao_id')::uuid for update;
   if not found or not public.operacao_ler_acao(_org,a.id) or a.estado='cancelada' then raise exception 'Ação indisponível.' using errcode='42501';end if;
  else
   perform public.est_validar_textos(_dados,array['titulo','descricao','prazo','prioridade']);
   if coalesce(length(_dados->>'descricao'),0)>4000 or(_dados ? 'exige_verificacao' and jsonb_typeof(_dados->'exige_verificacao')<>'boolean') then raise exception 'Instrução liberada ou política inválida.' using errcode='23514';end if;
   -- A instrução é redigida explicitamente. Não copiar análise, fonte privada ou snapshot para Campo.
   resultado:=public.salvar_acao_operacional(_org,md5('est-acao:'||_chave::text)::uuid,_dados);select * into a from public.acoes_operacionais where id=(resultado->>'id')::uuid;
  end if;
  update public.estudo_medida_linhagens set acao_id=a.id,acao_request_hash=md5(_dados::text) where id=l.id;l.acao_id:=a.id;
  insert into public.estudo_eventos(organization_id,estudo_id,revisao_id,comando) values(_org,m.estudo_id,m.revisao_id,'vincular_acao');
 end if;
 resultado:=jsonb_build_object('acao_id',l.acao_id,'linhagem_id',l.id,'estudo_id',m.estudo_id,'revisao_id',m.revisao_id);
 return public.operacao_concluir(_org,_chave,'est_vincular_acao',payload,resultado);
end $$;

create function public.est_pode_enviar_arquivo(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.estudo_arquivos a join public.estudo_revisoes r on r.id=a.revisao_id join public.estudos_tecnicos e on e.id=a.estudo_id where a.organization_id=_org and a.id=_id and a.created_by=auth.uid() and a.estado in('pendente','enviado') and r.estado='elaboracao' and e.revisao_atual_id=r.id and public.est_ler(_org,e.id));
$$;
create function public.est_preparar_arquivo(_org uuid,_revisao uuid,_perigo uuid,_chave uuid,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.estudo_revisoes;a public.estudo_arquivos;replay jsonb;novo uuid:=gen_random_uuid();payload jsonb:=jsonb_build_object('revisao',_revisao,'perigo',_perigo,'dados',_dados);begin
 r:=public.est_travar_destino(_org,_revisao,auth.uid());
 replay:=public.operacao_repetir(_org,_chave,'est_preparar_arquivo',payload);if replay is not null then return replay;end if;
 perform public.est_validar_textos(_dados,array['nome','mime','sha256']);
 if _perigo is not null and not exists(select 1 from public.estudo_perigos where organization_id=_org and estudo_id=r.estudo_id and revisao_id=r.id and id=_perigo) then raise exception 'Perigo indisponível.' using errcode='42501';end if;
 select * into a from public.estudo_arquivos where organization_id=_org and revisao_id=r.id and perigo_id is not distinct from _perigo and sha256=_dados->>'sha256' and estado<>'cancelado' order by created_at,id limit 1;
 if found then
  if a.mime<>_dados->>'mime' or a.tamanho<>(_dados->>'tamanho')::bigint then raise exception 'Mesmo hash com metadados diferentes.' using errcode='23505';end if;
 else
  if(select count(*)>=200 from public.estudo_arquivos where revisao_id=r.id) then raise exception 'Limite de duzentos arquivos por revisão.' using errcode='23514';end if;
  insert into public.estudo_arquivos(id,organization_id,estudo_id,revisao_id,perigo_id,nome,mime,tamanho,sha256,caminho)
  values(novo,_org,r.estudo_id,r.id,_perigo,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/estudos/'||r.estudo_id::text||'/'||novo::text) returning * into a;
  update public.estudo_revisoes set updated_at=now() where id=r.id;update public.estudos_tecnicos set updated_at=now() where id=r.estudo_id;
  insert into public.estudo_eventos(organization_id,estudo_id,revisao_id,comando,motivo) values(_org,r.estudo_id,r.id,'preparar_arquivo',a.id::text);
 end if;
 return public.operacao_concluir(_org,_chave,'est_preparar_arquivo',payload,to_jsonb(a));
end $$;
create function public.est_confirmar_arquivo(_org uuid,_id uuid,_autor uuid,_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.estudo_arquivos;r public.estudo_revisoes;begin
 select * into a from public.estudo_arquivos where organization_id=_org and id=_id;if not found then raise exception 'Envio indisponível.' using errcode='42501';end if;
 r:=public.est_travar_destino(_org,a.revisao_id,_autor,false);
 select * into a from public.estudo_arquivos where organization_id=_org and id=_id for update;
 if a.created_by<>_autor or a.sha256 is distinct from _sha256 or not public.est_autor_ler(_org,a.estudo_id,_autor) then raise exception 'Autor, hash ou autorização atual inválidos.' using errcode='42501';end if;
 if a.estado='vinculado' then return to_jsonb(a);end if;
 if a.estado not in('pendente','enviado') or r.estado<>'elaboracao' or not exists(select 1 from public.estudos_tecnicos where id=r.estudo_id and revisao_atual_id=r.id) then raise exception 'Envio não pode ser confirmado nesta revisão.' using errcode='23514';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='nexus-operacional' and o.name=a.caminho and o.metadata->>'mimetype'=a.mime and nullif(o.metadata->>'size','')::bigint=a.tamanho) then raise exception 'Objeto privado ausente ou metadados divergentes.' using errcode='23514';end if;
 update public.estudo_arquivos set estado='vinculado',confirmado_em=now() where id=a.id returning * into a;
 update public.estudo_revisoes set updated_at=now() where id=r.id;update public.estudos_tecnicos set updated_at=now() where id=r.estudo_id;
 insert into public.estudo_eventos(organization_id,estudo_id,revisao_id,comando,motivo,autor) values(_org,r.estudo_id,r.id,'confirmar_arquivo',a.id::text,_autor);return to_jsonb(a);
end $$;
create function public.est_cancelar_arquivo(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.estudo_arquivos;r public.estudo_revisoes;replay jsonb;payload jsonb:=jsonb_build_object('arquivo',_id,'motivo',_motivo);begin
 select * into a from public.estudo_arquivos where organization_id=_org and id=_id;if not found then raise exception 'Envio indisponível.' using errcode='42501';end if;
 r:=public.est_travar_destino(_org,a.revisao_id,auth.uid(),false);
 replay:=public.operacao_repetir(_org,_chave,'est_cancelar_arquivo',payload);if replay is not null then return replay;end if;
 if r.estado<>'elaboracao' or not exists(select 1 from public.estudos_tecnicos where id=r.estudo_id and revisao_atual_id=r.id) or coalesce(length(trim(_motivo)),0) not between 3 and 2000 then raise exception 'Cancelamento exige revisão editável e motivo.' using errcode='23514';end if;
 select * into a from public.estudo_arquivos where organization_id=_org and id=_id for update;
 if a.estado not in('pendente','enviado') then raise exception 'Original confirmado não pode ser cancelado ou sobrescrito.' using errcode='23514';end if;
 update public.estudo_arquivos set estado='cancelado',motivo=_motivo where id=a.id returning * into a;
 update public.estudo_revisoes set updated_at=now() where id=r.id;update public.estudos_tecnicos set updated_at=now() where id=r.estudo_id;
 insert into public.estudo_eventos(organization_id,estudo_id,revisao_id,comando,motivo) values(_org,r.estudo_id,r.id,'cancelar_arquivo',a.id::text||': '||_motivo);
 return public.operacao_concluir(_org,_chave,'est_cancelar_arquivo',payload,to_jsonb(a));
end $$;
create policy "estudos arquivos privados ler" on storage.objects for select to authenticated using(bucket_id='nexus-operacional' and exists(select 1 from public.estudo_arquivos a where a.caminho=name and a.estado='vinculado' and public.est_ler_arquivo(a.organization_id,a.id)));
create policy "estudos arquivos privados enviar" on storage.objects for insert to authenticated with check(bucket_id='nexus-operacional' and exists(select 1 from public.estudo_arquivos a where a.caminho=name and public.est_pode_enviar_arquivo(a.organization_id,a.id)));

create function public.est_travar_destino(_org uuid,_revisao uuid,_autor uuid,_editavel boolean default true) returns public.estudo_revisoes language plpgsql security definer set search_path='' as $$
declare r public.estudo_revisoes;e public.estudos_tecnicos;begin
 perform public.est_travar_autor(_org,_autor);
 select * into r from public.estudo_revisoes where organization_id=_org and id=_revisao;
 if not found then raise exception 'Revisão indisponível.' using errcode='42501';end if;
 select * into e from public.estudos_tecnicos where organization_id=_org and id=r.estudo_id for update;
 select * into r from public.estudo_revisoes where organization_id=_org and id=_revisao for update;
 perform public.est_travar_fontes(_org,e.id);
 if not public.est_autor_ler(_org,e.id,_autor) then raise exception 'Registro indisponível ou acesso revogado.' using errcode='42501';end if;
 if _editavel and(e.revisao_atual_id<>r.id or r.estado<>'elaboracao') then raise exception 'A revisão não está em elaboração.' using errcode='23514';end if;return r;
end $$;
create function public.est_profissional(_org uuid,_autor uuid) returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.pessoas p where p.organization_id=_org and p.user_id=_autor and p.ativa and length(trim(coalesce(p.registro_profissional,'')))>=3 and public.operacao_autor_pode(_org,_autor,'revisar_operacao');
$$;

create function public.est_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.estudo_revisoes;j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;begin
 if tg_op<>'INSERT' and tg_table_name in('est_metodos','est_metodo_versoes','estudo_submissoes','estudo_decisoes','estudo_substituicoes','estudo_eventos') then raise exception 'Registro histórico é imutável.' using errcode='23514';end if;
 if tg_op='UPDATE' and(to_jsonb(new)->'id' is distinct from to_jsonb(old)->'id' or to_jsonb(new)->'organization_id' is distinct from to_jsonb(old)->'organization_id' or to_jsonb(new)->'created_by' is distinct from to_jsonb(old)->'created_by' or to_jsonb(new)->'created_at' is distinct from to_jsonb(old)->'created_at') then raise exception 'Identidade e autoria são imutáveis.' using errcode='23514';end if;
 if tg_table_name='estudos_tecnicos' then
  if tg_op='DELETE' then raise exception 'Preserve o estudo e seu histórico.' using errcode='23514';end if;
  if tg_op='UPDATE' then if new.codigo<>old.codigo or new.cliente_id<>old.cliente_id or new.unidade_id<>old.unidade_id or new.tipo<>old.tipo then raise exception 'Código, tipo e unidade são imutáveis.' using errcode='23514';end if;new.version:=old.version+1;new.updated_at:=now();end if;
 elsif tg_table_name='estudo_revisoes' then
  if tg_op='DELETE' or(tg_op='UPDATE' and old.estado in('aprovado','cancelado')) then raise exception 'Revisão final é imutável; abra outra revisão.' using errcode='23514';end if;
  if tg_op='UPDATE' then
   if new.estudo_id<>old.estudo_id or new.numero<>old.numero or new.base_id is distinct from old.base_id then raise exception 'Origem da revisão é imutável.' using errcode='23514';end if;
   if old.estado='em_revisao' and(to_jsonb(new)-array['estado','snapshot','snapshot_sha256','aprovado_por','aprovado_em','version','updated_at']) is distinct from(to_jsonb(old)-array['estado','snapshot','snapshot_sha256','aprovado_por','aprovado_em','version','updated_at']) then raise exception 'A submissão em revisão não aceita edição de conteúdo.' using errcode='23514';end if;
   new.version:=old.version+1;new.updated_at:=now();
  end if;
 elsif tg_table_name='estudo_medida_linhagens' then
  if tg_op='DELETE' then raise exception 'Preserve a linhagem de execução.' using errcode='23514';end if;
  if tg_op='UPDATE' and(old.acao_id is not null or new.acao_id is null or new.estudo_id<>old.estudo_id) then raise exception 'Vínculo de ação é permanente.' using errcode='23514';end if;
 elsif tg_table_name in('estudo_perigos','estudo_medidas','estudo_fontes','estudo_arquivos') then
  select * into r from public.estudo_revisoes where organization_id=(j->>'organization_id')::uuid and estudo_id=(j->>'estudo_id')::uuid and id=(j->>'revisao_id')::uuid for update;
  if not found or r.estado<>'elaboracao' then raise exception 'A revisão não aceita edição.' using errcode='23514';end if;
  if tg_op='UPDATE' and(new.estudo_id<>old.estudo_id or new.revisao_id<>old.revisao_id) then raise exception 'Pai é imutável.' using errcode='23514';end if;
  if tg_table_name in('estudo_perigos','estudo_medidas') and tg_op='UPDATE' then
   if to_jsonb(new)->'base_id' is distinct from to_jsonb(old)->'base_id' then raise exception 'Origem é imutável.' using errcode='23514';end if;
   if tg_table_name='estudo_medidas' then if new.perigo_id<>old.perigo_id or new.linhagem_id<>old.linhagem_id then raise exception 'Perigo e linhagem são imutáveis.' using errcode='23514';end if;end if;new.version:=old.version+1;new.updated_at:=now();
  elsif tg_table_name='estudo_fontes' then
   if tg_op='DELETE' or(tg_op='UPDATE' and(not old.ativa or new.ativa or(to_jsonb(new)-array['ativa','desativada_motivo']) is distinct from(to_jsonb(old)-array['ativa','desativada_motivo']))) then raise exception 'Fonte histórica não pode ser removida ou trocada.' using errcode='23514';end if;
  elsif tg_table_name='estudo_arquivos' then
   if tg_op='DELETE' or(tg_op='UPDATE' and(old.estado in('vinculado','cancelado') or(to_jsonb(new)-array['estado','motivo','confirmado_em']) is distinct from(to_jsonb(old)-array['estado','motivo','confirmado_em']))) then raise exception 'Original e metadados de evidência são imutáveis.' using errcode='23514';end if;
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$declare t text;begin
 foreach t in array array['est_metodos','est_metodo_versoes','estudos_tecnicos','estudo_revisoes','estudo_perigos','estudo_medidas','estudo_fontes','estudo_arquivos','estudo_submissoes','estudo_decisoes','estudo_substituicoes','estudo_medida_linhagens','estudo_eventos'] loop
  execute format('create trigger est_guard before insert or update or delete on public.%I for each row execute function public.est_guard()',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy ler on public.est_metodos for select to authenticated using(public.operacao_pode(organization_id,'revisar_operacao'));
create policy ler on public.est_metodo_versoes for select to authenticated using(public.operacao_pode(organization_id,'revisar_operacao'));
create policy ler on public.estudos_tecnicos for select to authenticated using(public.est_ler(organization_id,id));
do $$declare t text;begin
 foreach t in array array['estudo_revisoes','estudo_perigos','estudo_medidas','estudo_fontes','estudo_arquivos','estudo_submissoes','estudo_decisoes','estudo_substituicoes','estudo_medida_linhagens','estudo_eventos'] loop
  execute format('create policy ler on public.%I for select to authenticated using(public.est_ler(organization_id,estudo_id))',t);
 end loop;
end $$;

create function public.est_validar_textos(_d jsonb,_campos text[]) returns void language plpgsql immutable set search_path='' as $$
declare c text;begin foreach c in array _campos loop
 if _d ? c and jsonb_typeof(_d->c) not in('string','null') then raise exception 'Campo % deve ser texto.',c using errcode='23514';end if;
end loop;end $$;
create function public.est_publicar_metodo(_org uuid,_chave uuid,_metodo uuid,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.est_metodos;v public.est_metodo_versoes;prof uuid;replay jsonb;f jsonb;k text;req jsonb;n integer;
 payload jsonb:=jsonb_build_object('metodo',_metodo,'dados',_dados);begin
 perform public.est_travar_autor(_org,auth.uid());prof:=public.est_profissional(_org,auth.uid());
 if prof is null then raise exception 'Publicação exige profissional de engenharia com registro cadastrado.' using errcode='42501';end if;
 replay:=public.operacao_repetir(_org,_chave,'est_publicar_metodo',payload);if replay is not null then return replay;end if;
 if jsonb_typeof(_dados) is distinct from 'object' or jsonb_typeof(_dados->'fontes') is distinct from 'array' or jsonb_array_length(_dados->'fontes') not between 1 and 50 or jsonb_typeof(_dados->'requisitos') is distinct from 'object' then raise exception 'Método exige fontes versionadas e requisitos explícitos.' using errcode='23514';end if;
 perform public.est_validar_textos(_dados,array['nome','descricao','tipo','instrucoes']);
 for k in select jsonb_object_keys(_dados->'requisitos') loop
  if k not in('exige_levantamento','exige_perigos','exige_medidas','exige_art','revisao_independente') or jsonb_typeof(_dados->'requisitos'->k)<>'boolean' then raise exception 'Requisito desconhecido ou não booleano.' using errcode='23514';end if;
 end loop;
 req:=jsonb_build_object('exige_levantamento',false,'exige_perigos',false,'exige_medidas',false,'exige_art',false,'revisao_independente',false)||(_dados->'requisitos');
 for f in select value from jsonb_array_elements(_dados->'fontes') loop
  if jsonb_typeof(f)<>'object' then raise exception 'Fonte bibliográfica inválida.' using errcode='23514';end if;
  for k in select jsonb_object_keys(f) loop if k not in('titulo','edicao','emissor','url','consultado_em') then raise exception 'Campo de fonte desconhecido.' using errcode='23514';end if;end loop;
  perform public.est_validar_textos(f,array['titulo','edicao','emissor','url','consultado_em']);
  if coalesce(length(trim(f->>'titulo')),0) not between 3 and 200 or coalesce(length(trim(f->>'edicao')),0) not between 1 and 120 or coalesce(length(trim(f->>'emissor')),0) not between 1 and 200
   or(f->>'url' is not null and(length(f->>'url')>2000 or f->>'url'!~*'^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'))
   or(f->>'consultado_em' is not null and f->>'consultado_em'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Fonte exige título, edição, emissor e referência segura.' using errcode='23514';end if;
  if f->>'consultado_em' is not null then perform(f->>'consultado_em')::date;end if;
  if coalesce(substring(f->>'url' from '://[^/?#]+:([0-9]{1,5})')::integer,0)>65535 then raise exception 'Porta de URL inválida.' using errcode='23514';end if;
 end loop;
 if _metodo is null then
  insert into public.est_metodos(organization_id,nome,descricao) values(_org,trim(_dados->>'nome'),coalesce(_dados->>'descricao','')) returning * into m;
 else select * into m from public.est_metodos where organization_id=_org and id=_metodo for update;if not found then raise exception 'Método indisponível.' using errcode='42501';end if;end if;
 select coalesce(max(numero),0)+1 into n from public.est_metodo_versoes where metodo_id=m.id;
 insert into public.est_metodo_versoes(organization_id,metodo_id,numero,nome,tipo,instrucoes,fontes,requisitos,responsavel_id,registro_profissional)
 values(_org,m.id,n,m.nome,_dados->>'tipo',_dados->>'instrucoes',_dados->'fontes',req,prof,(select registro_profissional from public.pessoas where id=prof)) returning * into v;
 return public.operacao_concluir(_org,_chave,'est_publicar_metodo',payload,jsonb_build_object('metodo',to_jsonb(m),'versao',to_jsonb(v)));
end $$;
create function public.est_metodos(_org uuid,_busca text default '',_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;begin
 if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina not between 0 and 10000 or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Filtro inválido.' using errcode='23514';end if;
 with autorizados as(select v.* from public.est_metodo_versoes v where v.organization_id=_org and(coalesce(_busca,'')='' or position(lower(_busca) in lower(v.nome||' '||v.instrucoes))>0)),pagina as(select * from autorizados order by created_at desc,id limit _limite offset _pagina*_limite)
 select jsonb_build_object('registros',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at desc,id),'[]') from pagina p),'total',(select count(*) from autorizados),'pagina',_pagina,'limite',_limite,'permissoes',jsonb_build_object('publicar_metodo',public.est_profissional(_org,auth.uid()) is not null)) into resultado;
 return resultado;
end $$;
create function public.est_bloqueios(_org uuid,_revisao uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.estudo_revisoes;m public.est_metodo_versoes;itens jsonb:='[]';begin
 select * into r from public.estudo_revisoes where organization_id=_org and id=_revisao;
 select * into m from public.est_metodo_versoes where organization_id=_org and id=r.metodo_versao_id;
 if m.id is null then itens:=itens||jsonb_build_array('Selecione um método profissionalmente validado.');end if;
 if length(trim(r.escopo))<3 or length(trim(r.premissas))<3 or length(trim(r.analise))<3 or length(trim(r.conclusao))<3 then itens:=itens||jsonb_build_array('Complete escopo, premissas, análise e conclusão.');end if;
 if length(trim(r.responsabilidade_tecnica))<3 then itens:=itens||jsonb_build_array('Registre a responsabilidade técnica declarada.');end if;
 if not exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=r.responsavel_tecnico_id and p.ativa and length(trim(coalesce(p.registro_profissional,'')))>=3) then itens:=itens||jsonb_build_array('Responsável técnico ativo com registro é necessário.');end if;
 if not exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=r.revisor_id and p.ativa and length(trim(coalesce(p.registro_profissional,'')))>=3) then itens:=itens||jsonb_build_array('Atribua um revisor ativo com registro profissional.');end if;
 if coalesce((m.requisitos->>'revisao_independente')::boolean,false) and r.revisor_id=r.responsavel_tecnico_id then itens:=itens||jsonb_build_array('O método exige revisor distinto do responsável técnico.');end if;
 if coalesce((m.requisitos->>'exige_art')::boolean,false) and length(trim(r.art_referencia))<3 then itens:=itens||jsonb_build_array('Registre a referência de responsabilidade exigida pelo método; o cadastro não emite ART.');end if;
 if coalesce((m.requisitos->>'exige_levantamento')::boolean,false) and not exists(select 1 from public.estudo_fontes where revisao_id=r.id and ativa and tipo='levantamento') then itens:=itens||jsonb_build_array('O método exige levantamento aprovado como fonte.');end if;
 if coalesce((m.requisitos->>'exige_perigos')::boolean,false) and not exists(select 1 from public.estudo_perigos where revisao_id=r.id) then itens:=itens||jsonb_build_array('O método exige registro dos perigos identificados.');end if;
 if coalesce((m.requisitos->>'exige_medidas')::boolean,false) and not exists(select 1 from public.estudo_medidas where revisao_id=r.id) then itens:=itens||jsonb_build_array('O método exige medidas de controle propostas.');end if;
 if exists(select 1 from public.estudo_perigos p where p.revisao_id=r.id and(length(trim(p.descricao))<3 or length(trim(p.exposicao))<3 or length(trim(p.avaliacao))<3)) then itens:=itens||jsonb_build_array('Complete descrição, exposição e avaliação de cada perigo.');end if;
 if exists(select 1 from public.estudo_perigos perigo where perigo.revisao_id=r.id and perigo.critico and not exists(select 1 from public.estudo_medidas medida where medida.perigo_id=perigo.id)) then itens:=itens||jsonb_build_array('Perigo classificado como crítico exige medida de controle.');end if;
 if exists(select 1 from public.estudo_medidas where revisao_id=r.id and(length(trim(descricao))<3 or length(trim(fundamento))<3)) then itens:=itens||jsonb_build_array('Complete descrição e fundamento das medidas propostas.');end if;
 if exists(select 1 from public.estudo_arquivos where revisao_id=r.id and estado in('pendente','enviado')) then itens:=itens||jsonb_build_array('Confirme ou cancele os envios pendentes antes de submeter.');end if;
 return itens;
end $$;
create function public.est_snapshot(_org uuid,_revisao uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema_version',1,
 'estudo',to_jsonb(e)||jsonb_build_object('cliente_nome',c.razao_social,'unidade_nome',u.nome,'responsavel_nome',p.nome),
 'revisao',(to_jsonb(r)-array['snapshot','snapshot_sha256','submissao_atual_id','aprovado_por','aprovado_em'])||jsonb_build_object('responsavel_tecnico_nome',(select nome from public.pessoas where id=r.responsavel_tecnico_id),'revisor_nome',(select nome from public.pessoas where id=r.revisor_id)),
 'metodo',(select to_jsonb(m) from public.est_metodo_versoes m where m.id=r.metodo_versao_id),
 'perigos',(select coalesce(jsonb_agg(to_jsonb(x) order by codigo,id),'[]') from public.estudo_perigos x where x.revisao_id=r.id),
 'medidas',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('responsavel_nome',(select nome from public.pessoas where id=x.responsavel_id)) order by perigo_id,id),'[]') from public.estudo_medidas x where x.revisao_id=r.id),
 'fontes',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at,id),'[]') from public.estudo_fontes x where x.revisao_id=r.id and x.ativa),
 'arquivos',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at,id),'[]') from public.estudo_arquivos x where x.revisao_id=r.id and x.estado='vinculado'))
 from public.estudo_revisoes r join public.estudos_tecnicos e on e.id=r.estudo_id join public.clientes c on c.id=e.cliente_id join public.unidades u on u.id=e.unidade_id join public.pessoas p on p.id=e.responsavel_id
 where r.organization_id=_org and r.id=_revisao;
$$;
create function public.est_obter(_org uuid,_id uuid,_revisao uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.estudos_tecnicos;r public.estudo_revisoes;ctx jsonb;prof uuid;atual boolean;revisor boolean;autor boolean;substituida uuid;begin
 if not public.est_ler(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select * into e from public.estudos_tecnicos where organization_id=_org and id=_id;
 select * into r from public.estudo_revisoes where organization_id=_org and estudo_id=e.id and id=coalesce(_revisao,e.revisao_atual_id);
 if not found then raise exception 'Revisão indisponível.' using errcode='42501';end if;
 ctx:=to_jsonb(e)||jsonb_build_object('cliente_nome',(select razao_social from public.clientes where id=e.cliente_id),'unidade_nome',(select nome from public.unidades where id=e.unidade_id),'responsavel_nome',(select nome from public.pessoas where id=e.responsavel_id));
 if r.estado='aprovado' then ctx:=(r.snapshot->'estudo')||jsonb_build_object('revisao_atual_id',e.revisao_atual_id,'aprovada_id',e.aprovada_id,'version',e.version);end if;
 select atual_id into substituida from public.estudo_substituicoes where organization_id=_org and anterior_id=r.id;
 prof:=public.est_profissional(_org,auth.uid());atual:=r.id=e.revisao_atual_id;revisor:=prof is not null and prof=r.revisor_id;autor:=prof is not null and prof=r.responsavel_tecnico_id;
 return jsonb_build_object('estudo',ctx,'revisao',to_jsonb(r)||jsonb_build_object('estado',case when substituida is not null then 'substituido' else r.estado end,'substituida_por',substituida,'responsavel_tecnico_nome',case when r.estado='aprovado' then r.snapshot->'revisao'->>'responsavel_tecnico_nome' else(select nome from public.pessoas where id=r.responsavel_tecnico_id) end,'revisor_nome',case when r.estado='aprovado' then r.snapshot->'revisao'->>'revisor_nome' else(select nome from public.pessoas where id=r.revisor_id) end),
 'revisoes',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'estado',case when s.atual_id is not null then 'substituido' else x.estado end,'version',x.version,'snapshot_sha256',x.snapshot_sha256,'aprovado_em',x.aprovado_em,'created_at',x.created_at,'substituida_por',s.atual_id) order by x.numero desc),'[]') from public.estudo_revisoes x left join public.estudo_substituicoes s on s.organization_id=_org and s.anterior_id=x.id where x.estudo_id=e.id),
 'perigos',(select coalesce(jsonb_agg(to_jsonb(x) order by codigo,id),'[]') from public.estudo_perigos x where x.revisao_id=r.id),
 'medidas',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('acao_id',l.acao_id,'responsavel_nome',case when r.estado='aprovado' then(select j->>'responsavel_nome' from jsonb_array_elements(r.snapshot->'medidas') j where j->>'id'=x.id::text) else(select nome from public.pessoas where id=x.responsavel_id) end) order by perigo_id,x.id),'[]') from public.estudo_medidas x join public.estudo_medida_linhagens l on l.id=x.linhagem_id where x.revisao_id=r.id),
 'fontes',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at,id),'[]') from public.estudo_fontes x where x.revisao_id=r.id),
 'submissoes',(select coalesce(jsonb_agg(to_jsonb(x) order by numero),'[]') from public.estudo_submissoes x where x.revisao_id=r.id),
 'decisoes',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.estudo_decisoes x where x.revisao_id=r.id),
 'arquivos',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at,id),'[]') from public.estudo_arquivos x where x.revisao_id=r.id),
 'acoes',(select coalesce(jsonb_agg(jsonb_build_object('linhagem_id',l.id,'acao_id',a.id,'titulo',a.titulo,'estado',a.estado,'version',a.version) order by a.id),'[]') from public.estudo_medida_linhagens l join public.acoes_operacionais a on a.id=l.acao_id where l.estudo_id=e.id),
 'historico',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.estudo_eventos x where x.estudo_id=e.id),
 'metodo',(select to_jsonb(x) from public.est_metodo_versoes x where x.id=r.metodo_versao_id),
 'permissoes',jsonb_build_object('ler',true,'criar',true,'gerir',true,'editar',atual and r.estado='elaboracao','revisar',atual and r.estado='em_revisao' and revisor,'aprovar',atual and r.estado='em_revisao' and revisor,'submeter',atual and r.estado='elaboracao' and autor,'nova_revisao',atual and r.estado in('aprovado','cancelado'),'vincular_acao',prof is not null and r.estado='aprovado' and e.aprovada_id=r.id,'publicar_metodo',prof is not null),
 'bloqueios',public.est_bloqueios(_org,r.id),
 'entrega_documental',jsonb_build_object('estado',case when r.estado='aprovado' then 'aguardando_emissao' else 'nao_aprovado' end,'motivo','A emissão documental consome revisão técnica aprovada; este registro não representa um PDF emitido.'));
end $$;
create function public.est_listar(_org uuid,_busca text default '',_estado text default null,_responsavel uuid default null,_pagina integer default 0,_limite integer default 25,_cliente uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;begin
 if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina not between 0 and 10000 or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Filtro inválido.' using errcode='23514';end if;
 with autorizados as(select to_jsonb(e)||jsonb_build_object('estado',r.estado,'numero_revisao',r.numero,'cliente_nome',c.razao_social,'unidade_nome',u.nome,'responsavel_nome',p.nome) as registro,e.updated_at,e.id
 from public.estudos_tecnicos e join public.estudo_revisoes r on r.id=e.revisao_atual_id join public.clientes c on c.id=e.cliente_id join public.unidades u on u.id=e.unidade_id join public.pessoas p on p.id=e.responsavel_id
 where e.organization_id=_org and public.est_ler(_org,e.id) and(_estado is null or r.estado=_estado) and(_responsavel is null or e.responsavel_id=_responsavel) and(_cliente is null or e.cliente_id=_cliente)
 and(coalesce(_busca,'')='' or position(lower(_busca) in lower(e.codigo||' '||e.titulo||' '||c.razao_social||' '||u.nome))>0)),pagina as(select * from autorizados order by updated_at desc,id limit _limite offset _pagina*_limite)
 select jsonb_build_object('registros',(select coalesce(jsonb_agg(registro order by updated_at desc,id),'[]') from pagina),'total',(select count(*) from autorizados),'pagina',_pagina,'limite',_limite,'permissoes',jsonb_build_object('criar',true,'publicar_metodo',public.est_profissional(_org,auth.uid()) is not null)) into resultado;return resultado;
end $$;

create function public.est_opcoes(_org uuid,_tipo text,_busca text default '',_cliente uuid default null,_unidade uuid default null,_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;begin
 if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina not between 0 and 10000 or length(coalesce(_busca,''))>200 or _tipo not in('clientes','unidades','pessoas','metodos','levantamentos','projetos_engenharia','documentos','projetos','acoes') then raise exception 'Seletor inválido.' using errcode='23514';end if;
 with opcoes as(
 select c.id,c.razao_social as nome,coalesce(c.nome_exibicao,'') as contexto,c.id as cliente_id,null::uuid as unidade_id,null::uuid as pai_id,null::integer as numero,null::text as sha256 from public.clientes c where _tipo='clientes' and c.organization_id=_org and c.arquivado_em is null and c.situacao='Ativo'
 union all select u.id,u.nome,'Unidade do cliente',u.cliente_id,u.id,u.cliente_id,null,null from public.unidades u join public.clientes c on c.id=u.cliente_id where _tipo='unidades' and u.organization_id=_org and u.arquivado_em is null and c.arquivado_em is null and c.situacao='Ativo'
 union all select p.id,p.nome,coalesce(p.funcao,''),null,null,null,null,null from public.pessoas p where _tipo='pessoas' and p.organization_id=_org and p.ativa
 union all select m.id,m.nome||' · V'||m.numero::text,m.tipo,null,null,m.metodo_id,m.numero,null from public.est_metodo_versoes m where _tipo='metodos' and m.organization_id=_org
 union all select r.id,l.codigo||' · V'||r.numero::text,l.finalidade,l.cliente_id,l.unidade_id,l.id,r.numero,r.snapshot_sha256 from public.levantamento_revisoes r join public.levantamentos l on l.id=r.levantamento_id where _tipo='levantamentos' and r.organization_id=_org and r.estado='aprovado' and public.lev_ler(_org,l.id)
 union all select v.id,coalesce(v.snapshot->'projeto'->>'titulo',p.titulo)||' · V'||v.numero::text,v.resumo,u.cliente_id,u.id,p.id,v.numero,v.snapshot_sha256 from public.pe_versoes v join public.pe_projetos p on p.id=v.projeto_id join public.unidades u on u.organization_id=v.organization_id and u.id::text=v.snapshot->'projeto'->>'unidade_id' and u.cliente_id::text=v.snapshot->'projeto'->>'cliente_id' where _tipo='projetos_engenharia' and v.organization_id=_org and public.est_pe_fonte_valida(_org,v.id,u.cliente_id,u.id) and public.pe_ler_projeto(_org,p.id)
 union all select d.id,d.tipo||' · V'||d.versao::text,'Documento emitido com contexto verificado',u.cliente_id,u.id,p.id,d.versao,encode(sha256(convert_to(d.snapshot::text,'UTF8')),'hex') from public.documentos d join public.proposta_revisoes r on r.id=d.revisao_id join public.propostas p on p.id=r.proposta_id join public.unidades u on u.organization_id=d.organization_id and u.id::text=d.snapshot->'contexto'->>'unidade_id' and u.cliente_id::text=d.snapshot->'contexto'->>'cliente_id' where _tipo='documentos' and d.organization_id=_org and public.est_doc_fonte_valida(_org,d.id,u.cliente_id,u.id) and public.est_autor_fonte(_org,auth.uid(),null,null,d.id)
 union all select p.id,p.codigo,'Projeto operacional',p.cliente_id,null,p.id,null,null from public.projetos p where _tipo='projetos' and p.organization_id=_org
 union all select a.id,a.titulo,a.estado,null,null,a.id,null,null from public.acoes_operacionais a where _tipo='acoes' and a.organization_id=_org and a.estado<>'cancelada' and public.operacao_ler_acao(_org,a.id)
 ),filtradas as(select * from opcoes where(_cliente is null or cliente_id=_cliente or _tipo in('pessoas','metodos','acoes')) and(_unidade is null or unidade_id=_unidade or _tipo in('pessoas','metodos','acoes','projetos')) and(coalesce(_busca,'')='' or position(lower(_busca) in lower(nome||' '||contexto))>0)),pagina as(select * from filtradas order by nome,id limit 25 offset _pagina*25)
 select jsonb_build_object('registros',(select coalesce(jsonb_agg(to_jsonb(p) order by nome,id),'[]') from pagina p),'total',(select count(*) from filtradas),'pagina',_pagina,'limite',25) into resultado;return resultado;
end $$;
create function public.est_proximo_codigo(_org uuid) returns text language plpgsql security definer set search_path='' as $$
declare n integer;y integer:=extract(year from now() at time zone 'America/Sao_Paulo')::integer;begin
 insert into public.numeracao(organization_id,prefixo,ano,proximo) values(_org,'EST',y,2) on conflict(organization_id,prefixo,ano) do update set proximo=public.numeracao.proximo+1 returning proximo-1 into n;
 return 'EST-'||y::text||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
end $$;
create function public.est_gravar_medida(_org uuid,_estudo uuid,_revisao uuid,_perigo uuid,_d jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.estudo_medidas;mid uuid:=nullif(_d->>'medida_id','')::uuid;lid uuid;begin
 perform public.est_validar_textos(_d,array['descricao','fundamento','prioridade','prazo']);
 if _d ? 'exige_acao' and jsonb_typeof(_d->'exige_acao')<>'boolean' then raise exception 'Política de ação deve ser booleana.' using errcode='23514';end if;
 if not exists(select 1 from public.estudo_perigos where organization_id=_org and estudo_id=_estudo and revisao_id=_revisao and id=_perigo) then raise exception 'Perigo indisponível.' using errcode='42501';end if;
 if nullif(_d->>'responsavel_id','') is not null and not exists(select 1 from public.pessoas where organization_id=_org and id=(_d->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável da medida indisponível.' using errcode='23514';end if;
 if mid is null then
  if(select count(*)>=1000 from public.estudo_medidas where revisao_id=_revisao) then raise exception 'Limite de mil medidas por revisão.' using errcode='23514';end if;
  insert into public.estudo_medida_linhagens(organization_id,estudo_id) values(_org,_estudo) returning id into lid;
  insert into public.estudo_medidas(organization_id,estudo_id,revisao_id,perigo_id,linhagem_id,descricao,fundamento,prioridade,responsavel_id,prazo,exige_acao)
  values(_org,_estudo,_revisao,_perigo,lid,coalesce(_d->>'descricao',''),coalesce(_d->>'fundamento',''),coalesce(_d->>'prioridade','normal'),nullif(_d->>'responsavel_id','')::uuid,nullif(_d->>'prazo','')::date,coalesce((_d->>'exige_acao')::boolean,true)) returning id into mid;
 else
  select * into m from public.estudo_medidas where organization_id=_org and estudo_id=_estudo and revisao_id=_revisao and perigo_id=_perigo and id=mid for update;
  if not found then raise exception 'Medida indisponível.' using errcode='42501';end if;
  if m.version is distinct from(_d->>'expected_version')::integer then raise exception 'Medida alterada; recarregue antes de salvar.' using errcode='40001';end if;
  update public.estudo_medidas set descricao=coalesce(_d->>'descricao',''),fundamento=coalesce(_d->>'fundamento',''),prioridade=coalesce(_d->>'prioridade','normal'),responsavel_id=nullif(_d->>'responsavel_id','')::uuid,prazo=nullif(_d->>'prazo','')::date,exige_acao=coalesce((_d->>'exige_acao')::boolean,true) where id=mid;
 end if;return mid;
end $$;
create function public.est_gravar_fonte(_org uuid,_estudo uuid,_revisao uuid,_d jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.estudos_tecnicos;l public.levantamentos;lr public.levantamento_revisoes;p public.pe_projetos;pv public.pe_versoes;d public.documentos;fid uuid;begin
 if num_nonnulls(nullif(_d->>'levantamento_revisao_id',''),nullif(_d->>'pe_versao_id',''),nullif(_d->>'documento_id',''))<>1
 or(_d->>'tipo'='levantamento' and nullif(_d->>'levantamento_revisao_id','') is null)
 or(_d->>'tipo'='projeto_engenharia' and nullif(_d->>'pe_versao_id','') is null)
 or(_d->>'tipo'='documento' and nullif(_d->>'documento_id','') is null) then raise exception 'Selecione exatamente uma fonte coerente com seu tipo.' using errcode='23514';end if;
 select * into e from public.estudos_tecnicos where organization_id=_org and id=_estudo;
 if _d->>'tipo'='levantamento' then
  select * into lr from public.levantamento_revisoes where organization_id=_org and id=(_d->>'levantamento_revisao_id')::uuid and estado='aprovado';
  if not found then raise exception 'Selecione revisão de levantamento aprovada.' using errcode='23514';end if;
  select * into l from public.levantamentos where organization_id=_org and id=lr.levantamento_id for share;
  if not public.lev_ler(_org,l.id) then raise exception 'Fonte indisponível.' using errcode='42501';end if;
  if l.cliente_id<>e.cliente_id or l.unidade_id<>e.unidade_id then raise exception 'Fonte pertence a outro cliente ou unidade.' using errcode='23514';end if;
  insert into public.estudo_fontes(organization_id,estudo_id,revisao_id,tipo,levantamento_id,levantamento_revisao_id,titulo,numero,sha256,justificativa)
  values(_org,_estudo,_revisao,'levantamento',l.id,lr.id,l.codigo||' · '||coalesce(lr.snapshot->'levantamento'->>'finalidade',l.finalidade),lr.numero,lr.snapshot_sha256,_d->>'justificativa') returning id into fid;
 elsif _d->>'tipo'='projeto_engenharia' then
  select * into pv from public.pe_versoes where organization_id=_org and id=(_d->>'pe_versao_id')::uuid and estado='congelada';
  if not found then raise exception 'Selecione versão de projeto congelada.' using errcode='23514';end if;
  select * into p from public.pe_projetos where organization_id=_org and id=pv.projeto_id for share;
  if not public.pe_ler_projeto(_org,p.id) then raise exception 'Fonte indisponível.' using errcode='42501';end if;
  if not public.est_pe_fonte_valida(_org,pv.id,e.cliente_id,e.unidade_id) then raise exception 'Versão sem IDs congelados verificáveis do mesmo cliente e unidade. Confira o contexto no acervo, crie nova versão e congele; não inferir por nomes.' using errcode='23514';end if;
  insert into public.estudo_fontes(organization_id,estudo_id,revisao_id,tipo,pe_projeto_id,pe_versao_id,titulo,numero,sha256,justificativa)
  values(_org,_estudo,_revisao,'projeto_engenharia',p.id,pv.id,coalesce(pv.snapshot->'projeto'->>'titulo',p.titulo),pv.numero,pv.snapshot_sha256,_d->>'justificativa') returning id into fid;
 elsif _d->>'tipo'='documento' then
  select * into d from public.documentos where organization_id=_org and id=(_d->>'documento_id')::uuid for share;
  if not found or not public.est_autor_fonte(_org,auth.uid(),null,null,d.id) then raise exception 'Documento indisponível.' using errcode='42501';end if;
  if not public.est_doc_fonte_valida(_org,d.id,e.cliente_id,e.unidade_id) then raise exception 'Documento sem IDs congelados e nexo de revisão verificáveis do mesmo cliente/unidade. Biblioteca técnica e emissão contextual precisam habilitar esta fonte; o arquivo original permanece íntegro.' using errcode='23514';end if;
  insert into public.estudo_fontes(organization_id,estudo_id,revisao_id,tipo,documento_id,titulo,numero,sha256,justificativa)
  values(_org,_estudo,_revisao,'documento',d.id,d.tipo,d.versao,encode(sha256(convert_to(d.snapshot::text,'UTF8')),'hex'),_d->>'justificativa') returning id into fid;
 else raise exception 'Tipo de fonte inválido.' using errcode='23514';end if;return fid;
end $$;
create function public.est_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.estudos_tecnicos;r public.estudo_revisoes;p public.estudo_perigos;m public.estudo_medidas;f public.estudo_fontes;s public.estudo_submissoes;
 eid uuid:=nullif(_dados->>'estudo_id','')::uuid;rid uuid:=nullif(_dados->>'revisao_id','')::uuid;pid uuid:=nullif(_dados->>'perigo_id','')::uuid;mid uuid:=nullif(_dados->>'medida_id','')::uuid;
 payload jsonb:=jsonb_build_object('comando',_comando,'dados',_dados);replay jsonb;d jsonb;snap jsonb;prof uuid;n integer;oldrid uuid;newpid uuid;bloqueios jsonb;
begin
 if jsonb_typeof(_dados) is distinct from 'object' or _chave is null then raise exception 'Comando inválido.' using errcode='23514';end if;
 perform public.est_travar_autor(_org,auth.uid());
 if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Operação exige acesso técnico.' using errcode='42501';end if;
 replay:=public.operacao_repetir(_org,_chave,'est_executar',payload);
 if replay is not null then
  r:=public.est_travar_destino(_org,(replay->'revisao'->>'id')::uuid,auth.uid(),false);prof:=public.est_profissional(_org,auth.uid());
  if _comando in('aprovar','devolver') and(prof is null or prof<>r.revisor_id) then raise exception 'Atribuição profissional revogada.' using errcode='42501';end if;
  if _comando='submeter' and(prof is null or prof<>r.responsavel_tecnico_id) then raise exception 'Atribuição profissional revogada.' using errcode='42501';end if;return replay;
 end if;
 perform public.est_validar_textos(_dados,array['titulo','tipo','visibilidade','escopo','premissas','analise','conclusao','responsabilidade_tecnica','art_referencia','codigo','descricao','local','exposicao','avaliacao','motivo','justificativa']);
 if _comando='criar' then
  if not exists(select 1 from public.clientes where organization_id=_org and id=(_dados->>'cliente_id')::uuid and arquivado_em is null and situacao='Ativo') or not exists(select 1 from public.unidades where organization_id=_org and cliente_id=(_dados->>'cliente_id')::uuid and id=(_dados->>'unidade_id')::uuid and arquivado_em is null) then raise exception 'Cliente ou unidade indisponível.' using errcode='23514';end if;
  if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514';end if;
  insert into public.estudos_tecnicos(organization_id,codigo,titulo,tipo,cliente_id,unidade_id,projeto_id,responsavel_id,visibilidade)
  values(_org,public.est_proximo_codigo(_org),trim(_dados->>'titulo'),_dados->>'tipo',(_dados->>'cliente_id')::uuid,(_dados->>'unidade_id')::uuid,nullif(_dados->>'projeto_id','')::uuid,(_dados->>'responsavel_id')::uuid,coalesce(_dados->>'visibilidade','restrito')) returning * into e;eid:=e.id;
  if nullif(_dados->>'metodo_versao_id','') is not null and not exists(select 1 from public.est_metodo_versoes where organization_id=_org and id=(_dados->>'metodo_versao_id')::uuid and tipo=e.tipo) then raise exception 'Método incompatível com o tipo do estudo.' using errcode='23514';end if;
  insert into public.estudo_revisoes(organization_id,estudo_id,numero,metodo_versao_id,responsavel_tecnico_id,escopo) values(_org,eid,1,nullif(_dados->>'metodo_versao_id','')::uuid,e.responsavel_id,coalesce(_dados->>'escopo','')) returning * into r;rid:=r.id;
  update public.estudos_tecnicos set revisao_atual_id=rid where id=eid;
  if nullif(_dados->>'levantamento_revisao_id','') is not null then perform public.est_gravar_fonte(_org,eid,rid,jsonb_build_object('tipo','levantamento','levantamento_revisao_id',_dados->>'levantamento_revisao_id','justificativa','Origem declarada na criação do estudo.'));end if;
 else
  if not public.est_ler(_org,eid) then raise exception 'Estudo indisponível.' using errcode='42501';end if;
  select revisao_atual_id into rid from public.estudos_tecnicos where organization_id=_org and id=eid and(nullif(_dados->>'revisao_id','') is null or revisao_atual_id=(_dados->>'revisao_id')::uuid);
  if not found then raise exception 'Selecione a revisão atual.' using errcode='23514';end if;
  r:=public.est_travar_destino(_org,rid,auth.uid(),false);select * into e from public.estudos_tecnicos where id=eid;
  if r.id<>e.revisao_atual_id then raise exception 'A revisão atual mudou; recarregue antes de editar.' using errcode='40001';end if;
  if _comando in('contexto','salvar_revisao','salvar_perigo','salvar_medida','excluir_perigo','excluir_medida','vincular_fonte','desativar_fonte','submeter') and r.estado<>'elaboracao' then raise exception 'A revisão não está em elaboração.' using errcode='23514';end if;
  if _comando='contexto' then
   if e.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Estudo alterado; recarregue antes de salvar.' using errcode='40001';end if;
   if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514';end if;
   update public.estudos_tecnicos set titulo=trim(_dados->>'titulo'),responsavel_id=(_dados->>'responsavel_id')::uuid,visibilidade=_dados->>'visibilidade',projeto_id=nullif(_dados->>'projeto_id','')::uuid where id=eid;
   update public.estudo_revisoes set updated_at=now() where id=rid;
  elsif _comando='salvar_revisao' then
   if r.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Revisão alterada; recarregue antes de salvar.' using errcode='40001';end if;
   if nullif(_dados->>'metodo_versao_id','') is not null and not exists(select 1 from public.est_metodo_versoes where organization_id=_org and id=(_dados->>'metodo_versao_id')::uuid and tipo=e.tipo) then raise exception 'Método incompatível com o tipo do estudo.' using errcode='23514';end if;
   if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_tecnico_id')::uuid and ativa) or(nullif(_dados->>'revisor_id','') is not null and not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'revisor_id')::uuid and ativa)) then raise exception 'Profissional indisponível.' using errcode='23514';end if;
   update public.estudo_revisoes set metodo_versao_id=nullif(_dados->>'metodo_versao_id','')::uuid,escopo=coalesce(_dados->>'escopo',''),premissas=coalesce(_dados->>'premissas',''),analise=coalesce(_dados->>'analise',''),conclusao=coalesce(_dados->>'conclusao',''),responsavel_tecnico_id=(_dados->>'responsavel_tecnico_id')::uuid,revisor_id=nullif(_dados->>'revisor_id','')::uuid,responsabilidade_tecnica=coalesce(_dados->>'responsabilidade_tecnica',''),art_referencia=coalesce(_dados->>'art_referencia','') where id=rid;
  elsif _comando in('salvar_perigo','salvar_medida','excluir_perigo','excluir_medida') then
   if _comando='salvar_perigo' then
    if _dados ? 'critico' and jsonb_typeof(_dados->'critico')<>'boolean' then raise exception 'Criticidade deve ser booleana e profissionalmente atribuída.' using errcode='23514';end if;
    if _dados ? 'medidas' and(jsonb_typeof(_dados->'medidas')<>'array' or jsonb_array_length(_dados->'medidas')>100) then raise exception 'Envie até cem medidas por operação.' using errcode='23514';end if;
    if(select count(*)<>count(distinct value->>'medida_id') from jsonb_array_elements(coalesce(_dados->'medidas','[]')) where nullif(value->>'medida_id','') is not null) then raise exception 'Uma medida não pode ser editada duas vezes na mesma operação.' using errcode='23514';end if;
    if pid is null then
     if(select count(*)>=200 from public.estudo_perigos where revisao_id=rid) then raise exception 'Limite de duzentos perigos por revisão.' using errcode='23514';end if;
     insert into public.estudo_perigos(organization_id,estudo_id,revisao_id,codigo,descricao,local,exposicao,avaliacao,critico) values(_org,eid,rid,trim(_dados->>'codigo'),coalesce(_dados->>'descricao',''),coalesce(_dados->>'local',''),coalesce(_dados->>'exposicao',''),coalesce(_dados->>'avaliacao',''),coalesce((_dados->>'critico')::boolean,false)) returning id into pid;
    else
     select * into p from public.estudo_perigos where organization_id=_org and estudo_id=eid and revisao_id=rid and id=pid for update;if not found then raise exception 'Perigo indisponível.' using errcode='42501';end if;
     if p.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Perigo alterado; recarregue antes de salvar.' using errcode='40001';end if;
     update public.estudo_perigos set codigo=trim(_dados->>'codigo'),descricao=coalesce(_dados->>'descricao',''),local=coalesce(_dados->>'local',''),exposicao=coalesce(_dados->>'exposicao',''),avaliacao=coalesce(_dados->>'avaliacao',''),critico=coalesce((_dados->>'critico')::boolean,false) where id=pid;
    end if;
    for d in select value from jsonb_array_elements(coalesce(_dados->'medidas','[]')) loop perform public.est_gravar_medida(_org,eid,rid,pid,d);end loop;
   elsif _comando='salvar_medida' then perform public.est_gravar_medida(_org,eid,rid,pid,_dados);
   elsif _comando='excluir_medida' then
    select * into m from public.estudo_medidas where organization_id=_org and estudo_id=eid and revisao_id=rid and id=mid for update;if not found then raise exception 'Medida indisponível.' using errcode='42501';end if;
    if m.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Medida alterada; recarregue antes de excluir.' using errcode='40001';end if;delete from public.estudo_medidas where id=mid;
   else
    select * into p from public.estudo_perigos where organization_id=_org and estudo_id=eid and revisao_id=rid and id=pid for update;if not found then raise exception 'Perigo indisponível.' using errcode='42501';end if;
    if p.version is distinct from(_dados->>'expected_version')::integer or r.version is distinct from(_dados->>'expected_revision_version')::integer then raise exception 'Perigo ou medidas alterados; recarregue antes de excluir.' using errcode='40001';end if;
    if exists(select 1 from public.estudo_arquivos where perigo_id=pid) then raise exception 'Perigo possui histórico de arquivos e deve ser preservado.' using errcode='23514';end if;
    delete from public.estudo_medidas where perigo_id=pid;delete from public.estudo_perigos where id=pid;
   end if;update public.estudo_revisoes set updated_at=now() where id=rid;
  elsif _comando in('vincular_fonte','desativar_fonte') then
   if r.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Revisão alterada; recarregue antes de alterar fontes.' using errcode='40001';end if;
   if _comando='vincular_fonte' then
    if(select count(*)>=200 from public.estudo_fontes where revisao_id=rid) then raise exception 'Limite de duzentas fontes por revisão.' using errcode='23514';end if;perform public.est_gravar_fonte(_org,eid,rid,_dados);
   else update public.estudo_fontes set ativa=false,desativada_motivo=_dados->>'motivo' where organization_id=_org and estudo_id=eid and revisao_id=rid and id=(_dados->>'fonte_id')::uuid and ativa;if not found then raise exception 'Fonte indisponível.' using errcode='42501';end if;end if;
   update public.estudo_revisoes set updated_at=now() where id=rid;
  elsif _comando in('submeter','devolver','aprovar','cancelar') then
   if r.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Revisão alterada; recarregue antes da decisão.' using errcode='40001';end if;
   prof:=public.est_profissional(_org,auth.uid());
   if _comando='submeter' then
    if prof is null or prof<>r.responsavel_tecnico_id then raise exception 'Submissão exige o responsável técnico atribuído e seu registro atual.' using errcode='42501';end if;
    bloqueios:=public.est_bloqueios(_org,rid);if jsonb_array_length(bloqueios)>0 then raise exception '%',bloqueios->>0 using errcode='23514';end if;
    snap:=public.est_snapshot(_org,rid);select coalesce(max(numero),0)+1 into n from public.estudo_submissoes where revisao_id=rid;
    insert into public.estudo_submissoes(organization_id,estudo_id,revisao_id,numero,snapshot,sha256,pessoa_id,registro_profissional) values(_org,eid,rid,n,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),prof,(select registro_profissional from public.pessoas where id=prof)) returning * into s;
    update public.estudo_revisoes set submissao_atual_id=s.id,estado='em_revisao' where id=rid;
   else
    if coalesce(length(trim(_dados->>'motivo')),0) not between 3 and 4000 then raise exception 'Informe motivo verificável da decisão.' using errcode='23514';end if;
    if _comando in('aprovar','devolver') then
     if r.estado<>'em_revisao' then raise exception 'Revisão não aguarda decisão.' using errcode='23514';end if;
     if prof is null or prof<>r.revisor_id then raise exception 'Decisão exige o revisor atribuído com registro atual.' using errcode='42501';end if;
     if(select coalesce((requisitos->>'revisao_independente')::boolean,false) from public.est_metodo_versoes where id=r.metodo_versao_id) and r.revisor_id=r.responsavel_tecnico_id then raise exception 'Método exige revisão independente.' using errcode='23514';end if;
    elsif r.estado not in('elaboracao','em_revisao') then raise exception 'Revisão final não pode ser cancelada ou alterada.' using errcode='23514';end if;
    insert into public.estudo_decisoes(organization_id,estudo_id,revisao_id,submissao_id,decisao,motivo,pessoa_id,registro_profissional,responsabilidade_tecnica)
    values(_org,eid,rid,case when r.estado='em_revisao' then r.submissao_atual_id end,_comando,_dados->>'motivo',prof,(select registro_profissional from public.pessoas where id=prof),r.responsabilidade_tecnica);
    if _comando='devolver' then update public.estudo_revisoes set estado='elaboracao' where id=rid;
    elsif _comando='cancelar' then update public.estudo_revisoes set estado='cancelado' where id=rid;
    else
     select * into s from public.estudo_submissoes where id=r.submissao_atual_id;
     snap:=s.snapshot||jsonb_build_object('submissao',jsonb_build_object('id',s.id,'numero',s.numero,'sha256',s.sha256),'aprovacao',jsonb_build_object('autor',auth.uid(),'pessoa_id',prof,'registro_profissional',(select registro_profissional from public.pessoas where id=prof),'responsabilidade_tecnica',r.responsabilidade_tecnica,'motivo',_dados->>'motivo','aprovado_em',now()));
     update public.estudo_revisoes set estado='aprovado',snapshot=snap,snapshot_sha256=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),aprovado_por=auth.uid(),aprovado_em=now() where id=rid;
     if e.aprovada_id is not null then insert into public.estudo_substituicoes(organization_id,estudo_id,anterior_id,atual_id) values(_org,eid,e.aprovada_id,rid);end if;
     update public.estudos_tecnicos set aprovada_id=rid where id=eid;
    end if;
   end if;
  elsif _comando='nova_revisao' then
   if r.version is distinct from(_dados->>'expected_version')::integer then raise exception 'Revisão alterada; recarregue antes de versionar.' using errcode='40001';end if;
   if r.estado not in('aprovado','cancelado') then raise exception 'Conclua a revisão atual antes de abrir outra.' using errcode='23514';end if;
   if coalesce(length(trim(_dados->>'motivo')),0) not between 3 and 4000 then raise exception 'Explique a nova revisão.' using errcode='23514';end if;
   oldrid:=rid;select coalesce(max(numero),0)+1 into n from public.estudo_revisoes where estudo_id=eid;
   insert into public.estudo_revisoes(organization_id,estudo_id,numero,base_id,metodo_versao_id,escopo,premissas,analise,conclusao,responsavel_tecnico_id,revisor_id,responsabilidade_tecnica,art_referencia)
   values(_org,eid,n,oldrid,r.metodo_versao_id,r.escopo,r.premissas,r.analise,r.conclusao,r.responsavel_tecnico_id,r.revisor_id,r.responsabilidade_tecnica,r.art_referencia) returning id into rid;
   for p in select * from public.estudo_perigos where revisao_id=oldrid order by codigo,id loop
    insert into public.estudo_perigos(organization_id,estudo_id,revisao_id,base_id,codigo,descricao,local,exposicao,avaliacao,critico) values(_org,eid,rid,p.id,p.codigo,p.descricao,p.local,p.exposicao,p.avaliacao,p.critico) returning id into newpid;
    insert into public.estudo_medidas(organization_id,estudo_id,revisao_id,perigo_id,linhagem_id,base_id,descricao,fundamento,prioridade,responsavel_id,prazo,exige_acao)
    select _org,eid,rid,newpid,linhagem_id,id,descricao,fundamento,prioridade,responsavel_id,prazo,exige_acao from public.estudo_medidas where perigo_id=p.id;
   end loop;
   insert into public.estudo_fontes(organization_id,estudo_id,revisao_id,tipo,levantamento_id,levantamento_revisao_id,pe_projeto_id,pe_versao_id,documento_id,titulo,numero,sha256,justificativa)
   select _org,eid,rid,tipo,levantamento_id,levantamento_revisao_id,pe_projeto_id,pe_versao_id,documento_id,titulo,numero,sha256,justificativa from public.estudo_fontes where revisao_id=oldrid and ativa;
   update public.estudos_tecnicos set revisao_atual_id=rid where id=eid;
  else raise exception 'Comando desconhecido.' using errcode='23514';end if;
  update public.estudos_tecnicos set updated_at=now() where id=eid;
 end if;
 insert into public.estudo_eventos(organization_id,estudo_id,revisao_id,comando,motivo) values(_org,eid,rid,_comando,_dados->>'motivo');
 return public.operacao_concluir(_org,_chave,'est_executar',payload,public.est_obter(_org,eid,rid));
end $$;

-- Evolução autorizada do congelamento PE: cópia do comando canônico0014.
-- Única mudança de comportamento: novos snapshots fixam IDs de organização/cliente/unidade.
-- Revisões congeladas anteriores e seus hashes permanecem intactos.
create or replace function public.pe_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.pe_projetos; v public.pe_versoes; c public.pe_cenarios; r jsonb; _pid uuid:=(_dados->>'projeto_id')::uuid;
  _vid uuid:=(_dados->>'versao_id')::uuid; _cid uuid:=(_dados->>'cenario_id')::uuid; n integer; snap jsonb; begin
  if not public.operacao_pode(_org,'gerir_projetos_engenharia') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if _chave is null then raise exception 'Informe a chave da operação.' using errcode='23514'; end if;
  -- Autorização é revalidada antes de retornar resultado de uma operação antiga.
  if _comando<>'criar' and not public.pe_ler_projeto(_org,_pid) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'pe_'||_comando,_dados); if r is not null then return r; end if;
  if _comando='criar' then
    if not exists(select 1 from public.clientes where organization_id=_org and id=(_dados->>'cliente_id')::uuid and arquivado_em is null and situacao='Ativo')
      or ((_dados->>'unidade_id') is not null and not exists(select 1 from public.unidades where organization_id=_org and id=(_dados->>'unidade_id')::uuid and cliente_id=(_dados->>'cliente_id')::uuid and arquivado_em is null)) then
      raise exception 'Cliente ou unidade indisponível para novo projeto.' using errcode='23514';
    end if;
    if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514'; end if;
    insert into public.pe_projetos(organization_id,cliente_id,unidade_id,responsavel_id,titulo,local_descritivo,descricao,visibilidade)
    values(_org,(_dados->>'cliente_id')::uuid,(_dados->>'unidade_id')::uuid,(_dados->>'responsavel_id')::uuid,trim(_dados->>'titulo'),coalesce(_dados->>'local_descritivo',''),coalesce(_dados->>'descricao',''),coalesce(_dados->>'visibilidade','restrito')) returning * into p;
    _pid:=p.id;
    insert into public.pe_versoes(organization_id,projeto_id,numero,elaborado_em,autor_declarado,revisao_declarada,resumo,modelo)
    values(_org,p.id,1,(_dados->>'elaborado_em')::date,coalesce(_dados->>'autor_declarado',''),coalesce(_dados->>'revisao_declarada',''),_dados->>'resumo',_dados->'modelo') returning * into v;
    _vid:=v.id;
  else
    select * into p from public.pe_projetos where organization_id=_org and id=_pid for update;
    if p.arquivado and _comando<>'reativar' then raise exception 'Projeto arquivado. Reative para continuar.' using errcode='23514'; end if;
    if _comando in ('arquivar','reativar','vigente') then
      if p.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
      if _comando='vigente' then
        if not exists(select 1 from public.pe_versoes where organization_id=_org and projeto_id=p.id and id=_vid and estado='congelada') then raise exception 'Selecione versão congelada deste projeto.' using errcode='23514'; end if;
        update public.pe_projetos set vigente_id=_vid where id=p.id returning * into p;
      else
        if length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Informe motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
        update public.pe_projetos set arquivado=(_comando='arquivar') where id=p.id returning * into p;
      end if;
    elsif _comando in ('criar_cenario','nova_versao') then
      select * into v from public.pe_versoes where organization_id=_org and projeto_id=p.id and id=_vid;
      if not found or v.estado<>'congelada' then raise exception 'Use uma versão congelada como base.' using errcode='23514'; end if;
      if _comando='criar_cenario' then
        insert into public.pe_cenarios(organization_id,projeto_id,base_id,titulo,modelo) values(_org,p.id,v.id,_dados->>'titulo',v.modelo) returning * into c;
        _cid:=c.id;
      else
        select coalesce(max(numero),0)+1 into n from public.pe_versoes where projeto_id=p.id;
        insert into public.pe_versoes(organization_id,projeto_id,numero,parent_id,elaborado_em,autor_declarado,revisao_declarada,resumo,modelo)
        values(_org,p.id,n,v.id,(_dados->>'elaborado_em')::date,coalesce(_dados->>'autor_declarado',''),coalesce(_dados->>'revisao_declarada',''),_dados->>'resumo',v.modelo) returning * into v;
        _vid:=v.id;
      end if;
    elsif _comando in ('salvar_cenario','promover_cenario','descartar_cenario') then
      select * into c from public.pe_cenarios where organization_id=_org and projeto_id=p.id and id=_cid for update;
      if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
      if c.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
      if c.promovida_id is not null or c.descartado then raise exception 'Cenário já encerrado.' using errcode='23514'; end if;
      if _comando='salvar_cenario' then
        update public.pe_cenarios set modelo=_dados->'modelo' where id=c.id returning * into c;
      elsif _comando='descartar_cenario' then
        if length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Descarte exige motivo.' using errcode='23514'; end if;
        update public.pe_cenarios set descartado=true where id=c.id returning * into c;
      else
        select coalesce(max(numero),0)+1 into n from public.pe_versoes where projeto_id=p.id;
        insert into public.pe_versoes(organization_id,projeto_id,numero,parent_id,resumo,modelo)
        values(_org,p.id,n,c.base_id,_dados->>'resumo',c.modelo) returning * into v;
        _vid:=v.id;
        update public.pe_cenarios set promovida_id=v.id where id=c.id returning * into c;
      end if;
    elsif _comando in ('salvar','submeter','devolver','congelar') then
      select * into v from public.pe_versoes where organization_id=_org and projeto_id=p.id and id=_vid for update;
      if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
      if v.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
      if _comando='salvar' then
        if v.estado<>'rascunho' then raise exception 'Edição exige rascunho.' using errcode='23514'; end if;
        update public.pe_versoes set modelo=_dados->'modelo',resumo=_dados->>'resumo',elaborado_em=(_dados->>'elaborado_em')::date,autor_declarado=coalesce(_dados->>'autor_declarado',''),revisao_declarada=coalesce(_dados->>'revisao_declarada','') where id=v.id returning * into v;
      elsif _comando='submeter' then
        if v.estado<>'rascunho' or not exists(select 1 from jsonb_array_elements(v.modelo->'secoes') s where length(trim(s->>'texto'))>0) then raise exception 'Preencha o conteúdo antes de enviar para revisão.' using errcode='23514'; end if;
        update public.pe_versoes set estado='em_revisao' where id=v.id returning * into v;
      elsif _comando='devolver' then
        if v.estado<>'em_revisao' or length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Devolução exige versão em revisão e motivo.' using errcode='23514'; end if;
        update public.pe_versoes set estado='rascunho' where id=v.id returning * into v;
      else
        if v.estado<>'em_revisao' then raise exception 'Congele somente após revisão interna.' using errcode='23514'; end if;
        select jsonb_build_object('schema_version',1,'projeto',jsonb_build_object('id',p.id,'titulo',p.titulo,'organization_id',p.organization_id,'cliente_id',p.cliente_id,'unidade_id',p.unidade_id,'cliente',cl.razao_social,'unidade',u.nome,'local',p.local_descritivo),'versao',jsonb_build_object('id',v.id,'numero',v.numero,'elaborado_em',v.elaborado_em,'autor_declarado',v.autor_declarado,'revisao_declarada',v.revisao_declarada,'resumo',v.resumo),'modelo',v.modelo)
          into snap from public.clientes cl left join public.unidades u on u.organization_id=p.organization_id and u.id=p.unidade_id where cl.organization_id=p.organization_id and cl.id=p.cliente_id;
        update public.pe_versoes set estado='congelada',snapshot=snap,snapshot_sha256=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),congelado_por=auth.uid(),congelado_em=now() where id=v.id returning * into v;
      end if;
    else raise exception 'Comando não suportado.' using errcode='23514'; end if;
    update public.pe_projetos set updated_at=now() where id=p.id returning * into p;
  end if;
  insert into public.pe_eventos(organization_id,projeto_id,versao_id,cenario_id,comando,motivo) values(_org,_pid,_vid,_cid,_comando,coalesce(_dados->>'motivo',_dados->>'resumo'));
  r:=jsonb_build_object('projeto',to_jsonb(p),'versao',case when v.id is not null then to_jsonb(v) end,'cenario',case when c.id is not null then to_jsonb(c) end);
  return public.operacao_concluir(_org,_chave,'pe_'||_comando,_dados,r);
end $$;

-- A superfície pública é explícita; helpers com ator arbitrário e snapshots são internos.
do $$declare f record;begin
 for f in select p.oid::regprocedure as nome from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'est\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.nome);
 end loop;
end $$;
grant execute on function public.est_ler(uuid,uuid),public.est_ler_arquivo(uuid,uuid),public.est_pode_enviar_arquivo(uuid,uuid),public.est_obter(uuid,uuid,uuid),public.est_listar(uuid,text,text,uuid,integer,integer,uuid),public.est_metodos(uuid,text,integer,integer),public.est_opcoes(uuid,text,text,uuid,uuid,integer),public.est_publicar_metodo(uuid,uuid,uuid,jsonb),public.est_executar(uuid,uuid,text,jsonb),public.est_vincular_acao(uuid,uuid,uuid,jsonb),public.est_preparar_arquivo(uuid,uuid,uuid,uuid,jsonb),public.est_cancelar_arquivo(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.est_confirmar_arquivo(uuid,uuid,uuid,text) to service_role;
