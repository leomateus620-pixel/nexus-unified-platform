-- Levantamentos: coleta rastreável e revisão técnica. Não define periodicidade/limite normativo.
-- Numeric(18,6) em medidas; o DTO expõe valores decimais como texto.
alter table public.propostas add constraint lev_proposta_contexto unique(organization_id,cliente_id,id);
alter table public.projetos add constraint lev_projeto_contexto unique(organization_id,cliente_id,id);
alter table public.proposta_revisoes add constraint lev_revisao_org unique(organization_id,id);
alter table public.sistemas_dimensionados add constraint lev_sistema_revisao_org unique(organization_id,revisao_id,id);

create table public.levantamento_modelos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  nome text not null check(length(trim(nome)) between 3 and 160), descricao text not null default '' check(length(descricao)<=2000),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique(organization_id,id),unique(organization_id,nome)
);
create table public.levantamento_modelo_versoes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, modelo_id uuid not null,
  numero integer not null check(numero>0), fonte text not null check(length(trim(fonte)) between 3 and 2000),
  requisitos jsonb not null check(jsonb_typeof(requisitos)='array' and jsonb_array_length(requisitos)<=100),
  responsavel_id uuid not null, created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique(organization_id,id),unique(modelo_id,numero),
  foreign key(organization_id,modelo_id) references public.levantamento_modelos(organization_id,id),
  foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.levantamentos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  codigo text not null, cliente_id uuid not null, unidade_id uuid not null, responsavel_id uuid not null,
  finalidade text not null check(length(trim(finalidade)) between 3 and 2000), proposta_id uuid, projeto_id uuid,
  revisao_atual_id uuid, aprovada_id uuid, version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(organization_id,id),unique(organization_id,codigo),
  foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
  foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id),
  foreign key(organization_id,cliente_id,proposta_id) references public.propostas(organization_id,cliente_id,id),
  foreign key(organization_id,cliente_id,projeto_id) references public.projetos(organization_id,cliente_id,id)
);
create index levantamento_lista on public.levantamentos(organization_id,updated_at desc,id);
create index levantamento_responsavel on public.levantamentos(organization_id,responsavel_id,id);
create table public.levantamento_revisoes (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,levantamento_id uuid not null,
  numero integer not null check(numero>0),base_id uuid,modelo_versao_id uuid,
  estado text not null default 'rascunho' check(estado in ('rascunho','programado','em_coleta','em_revisao','aprovado','cancelado')),
  inicio_previsto timestamptz,fim_previsto timestamptz,version integer not null default 1,
  snapshot jsonb,snapshot_sha256 text,aprovado_por uuid references auth.users(id),aprovado_em timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(organization_id,id),unique(organization_id,levantamento_id,id),unique(levantamento_id,numero),
  check((inicio_previsto is null)=(fim_previsto is null)),check(fim_previsto>inicio_previsto),
  check((estado='aprovado')=(snapshot is not null and snapshot_sha256 is not null and aprovado_por is not null and aprovado_em is not null)),
  foreign key(organization_id,levantamento_id) references public.levantamentos(organization_id,id),
  foreign key(organization_id,levantamento_id,base_id) references public.levantamento_revisoes(organization_id,levantamento_id,id),
  foreign key(organization_id,modelo_versao_id) references public.levantamento_modelo_versoes(organization_id,id)
);
create index levantamento_revisoes_lista on public.levantamento_revisoes(organization_id,estado,inicio_previsto,id);
alter table public.levantamentos add constraint lev_atual_fk foreign key(organization_id,id,revisao_atual_id) references public.levantamento_revisoes(organization_id,levantamento_id,id);
alter table public.levantamentos add constraint lev_aprovada_fk foreign key(organization_id,id,aprovada_id) references public.levantamento_revisoes(organization_id,levantamento_id,id);
create table public.levantamento_pontos (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,levantamento_id uuid not null,revisao_id uuid not null,
  base_id uuid,codigo text not null check(length(trim(codigo)) between 1 and 40),nome text not null check(length(trim(nome)) between 2 and 200),
  area text not null default '' check(length(area)<=200),localizacao text not null default '' check(length(localizacao)<=1000),
  tipo_sistema text not null default '' check(length(tipo_sistema)<=120),observacoes text not null default '' check(length(observacoes)<=4000),
  exige_foto boolean not null default false,version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(organization_id,id),unique(organization_id,levantamento_id,revisao_id,id),unique(revisao_id,codigo),
  foreign key(organization_id,levantamento_id,revisao_id) references public.levantamento_revisoes(organization_id,levantamento_id,id),
  foreign key(organization_id,base_id) references public.levantamento_pontos(organization_id,id)
);
create function public.lev_unidade_compativel(_grandeza text,_unidade text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(_unidade=any(case _grandeza when 'comprimento' then array['m','cm','mm'] when 'area' then array['m2'] when 'contagem' then array['un'] when 'angulo' then array['grau'] when 'forca' then array['kN','N'] else array[]::text[] end),false);
$$;
create table public.levantamento_medicoes (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,levantamento_id uuid not null,revisao_id uuid not null,ponto_id uuid not null,
  base_id uuid,chave text not null check(length(trim(chave)) between 1 and 120),
  grandeza text not null check(grandeza in ('comprimento','area','contagem','angulo','forca')),
  valor numeric(18,6),unidade text not null default '',precisao numeric(18,6),metodo text not null default '' check(length(metodo)<=1000),
  origem text not null default 'campo' check(origem in ('campo','documento','modelo_3d')),
  natureza text not null default 'medida' check(natureza in ('medida','estimativa')),coletado_em timestamptz,
  observacoes text not null default '' check(length(observacoes)<=4000),version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(valor>=0 and valor<> 'NaN'::numeric),check(precisao>0 and precisao<>'NaN'::numeric),
  check(unidade='' or public.lev_unidade_compativel(grandeza,unidade)),check(origem<>'modelo_3d' or natureza='estimativa'),
  check(grandeza<>'contagem' or valor=trunc(valor)),
  unique(organization_id,id),unique(organization_id,levantamento_id,revisao_id,id),unique(ponto_id,chave),
  foreign key(organization_id,levantamento_id,revisao_id,ponto_id) references public.levantamento_pontos(organization_id,levantamento_id,revisao_id,id),
  foreign key(organization_id,base_id) references public.levantamento_medicoes(organization_id,id)
);
create table public.levantamento_avaliacoes (
  id bigint generated always as identity primary key,organization_id uuid not null,levantamento_id uuid not null,revisao_id uuid not null,
  decisao text not null,comentario text not null default '',pendencias jsonb not null default '[]'::jsonb check(jsonb_typeof(pendencias)='array'),
  autor uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
  foreign key(organization_id,levantamento_id,revisao_id) references public.levantamento_revisoes(organization_id,levantamento_id,id)
);
create index levantamento_avaliacoes_pai on public.levantamento_avaliacoes(organization_id,levantamento_id,id desc);
create table public.levantamento_arquivos (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,levantamento_id uuid not null,revisao_id uuid not null,ponto_id uuid,
  nome text not null check(length(nome) between 1 and 240),mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),
  tamanho bigint not null check(tamanho between 1 and 20971520),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),caminho text not null unique,
  estado text not null default 'pendente' check(estado in ('pendente','enviado','vinculado','cancelado')),motivo text,confirmado_em timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,levantamento_id,revisao_id) references public.levantamento_revisoes(organization_id,levantamento_id,id),
  foreign key(organization_id,levantamento_id,revisao_id,ponto_id) references public.levantamento_pontos(organization_id,levantamento_id,revisao_id,id)
);
create index levantamento_arquivos_pai on public.levantamento_arquivos(organization_id,revisao_id,ponto_id,estado);
create table public.levantamento_adocoes (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,levantamento_id uuid not null,revisao_id uuid not null,medicao_id uuid not null,
  revisao_destino_id uuid not null,sistema_id uuid not null,campo text not null check(campo in ('metragem','trechos')),
  valor_anterior numeric(18,6) not null,valor_adotado numeric(18,6) not null,preview_hash text not null,origem jsonb not null,
  autor uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
  foreign key(organization_id,levantamento_id,revisao_id,medicao_id) references public.levantamento_medicoes(organization_id,levantamento_id,revisao_id,id),
  foreign key(organization_id,revisao_destino_id,sistema_id) references public.sistemas_dimensionados(organization_id,revisao_id,id)
);
create index levantamento_adocoes_destino on public.levantamento_adocoes(organization_id,revisao_destino_id,id);

create function public.lev_autor_ler(_org uuid,_id uuid,_autor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(select 1 from public.levantamentos l where l.organization_id=_org and l.id=_id and (
    public.operacao_autor_pode(_org,_autor,'gerir_operacao') or exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=l.responsavel_id and p.user_id=_autor and p.ativa)));
$$;
create function public.lev_ler(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.lev_autor_ler(_org,_id,auth.uid()); $$;
create function public.lev_profissional(_org uuid) returns uuid language sql stable security definer set search_path='' as $$
  select p.id from public.pessoas p where p.organization_id=_org and p.user_id=auth.uid() and p.ativa and length(trim(coalesce(p.registro_profissional,'')))>=3 and public.operacao_pode(_org,'revisar_operacao');
$$;
create function public.lev_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.levantamento_revisoes; rowdata jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; begin
  if tg_op<>'INSERT' and tg_table_name in ('levantamento_modelo_versoes','levantamento_avaliacoes','levantamento_adocoes') then raise exception 'Histórico publicado é imutável.' using errcode='23514'; end if;
  if tg_op='UPDATE' and (to_jsonb(new)->'organization_id' is distinct from to_jsonb(old)->'organization_id' or to_jsonb(new)->'id' is distinct from to_jsonb(old)->'id' or to_jsonb(new)->'created_at' is distinct from to_jsonb(old)->'created_at' or to_jsonb(new)->'created_by' is distinct from to_jsonb(old)->'created_by') then raise exception 'Identidade e autoria são imutáveis.' using errcode='23514'; end if;
  if tg_table_name='levantamentos' then
    if tg_op='DELETE' then raise exception 'Preserve o levantamento; cancele sua revisão.' using errcode='23514'; end if;
    if tg_op='UPDATE' then
      if new.cliente_id<>old.cliente_id or new.unidade_id<>old.unidade_id or new.codigo<>old.codigo then raise exception 'Contexto e código são imutáveis.' using errcode='23514'; end if;
      new.version:=old.version+1;new.updated_at:=now();
    end if;
  elsif tg_table_name='levantamento_revisoes' then
    if tg_op='DELETE' or (tg_op='UPDATE' and old.estado in ('aprovado','cancelado')) then raise exception 'Revisão final é imutável; abra outra revisão.' using errcode='23514'; end if;
    if tg_op='UPDATE' then
      if new.levantamento_id<>old.levantamento_id or new.numero<>old.numero or new.base_id is distinct from old.base_id or new.modelo_versao_id is distinct from old.modelo_versao_id then raise exception 'Origem e modelo da revisão são imutáveis.' using errcode='23514'; end if;
      new.version:=old.version+1;new.updated_at:=now();
    end if;
  elsif tg_table_name in ('levantamento_pontos','levantamento_medicoes','levantamento_arquivos') then
    select * into r from public.levantamento_revisoes where organization_id=(rowdata->>'organization_id')::uuid and id=(rowdata->>'revisao_id')::uuid for update;
    if not found or r.estado not in ('rascunho','programado','em_coleta') then raise exception 'A coleta desta revisão não está editável.' using errcode='23514'; end if;
    if tg_op='UPDATE' then
      if new.levantamento_id<>old.levantamento_id or new.revisao_id<>old.revisao_id then raise exception 'Pai da coleta é imutável.' using errcode='23514'; end if;
      if tg_table_name='levantamento_medicoes' and to_jsonb(new)->'ponto_id' is distinct from to_jsonb(old)->'ponto_id' then raise exception 'Ponto da medição é imutável.' using errcode='23514'; end if;
      if tg_table_name='levantamento_arquivos' then
        if old.estado in ('vinculado','cancelado') or new.ponto_id is distinct from old.ponto_id or new.nome<>old.nome or new.mime<>old.mime or new.tamanho<>old.tamanho or new.sha256<>old.sha256 or new.caminho<>old.caminho then raise exception 'Original e metadados do arquivo são imutáveis.' using errcode='23514'; end if;
      else new.version:=old.version+1;new.updated_at:=now(); end if;
    end if;
    if tg_op='DELETE' and tg_table_name='levantamento_arquivos' then raise exception 'Cancele o envio preservando histórico.' using errcode='23514'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;return new;
end $$;

-- A série canônica numeracao já atende OC/OP. Não ampliar seu RPC público nem suas permissões.
create function public.lev_proximo_codigo(_org uuid) returns text
language plpgsql security definer set search_path='' as $$
declare n integer;y integer:=extract(year from now() at time zone 'America/Sao_Paulo')::integer;begin
  if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  insert into public.numeracao(organization_id,prefixo,ano,proximo) values(_org,'LEV',y,2)
    on conflict(organization_id,prefixo,ano) do update set proximo=public.numeracao.proximo+1 returning proximo-1 into n;
  return 'LEV-'||y::text||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
end $$;
create function public.lev_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.levantamentos;r public.levantamento_revisoes;p public.levantamento_pontos;m public.levantamento_medicoes;
  lid uuid:=nullif(_dados->>'levantamento_id','')::uuid;rid uuid:=nullif(_dados->>'revisao_id','')::uuid;
  pid uuid:=nullif(_dados->>'ponto_id','')::uuid;mid uuid:=nullif(_dados->>'medicao_id','')::uuid;
  payload jsonb:=jsonb_build_object('comando',_comando,'dados',_dados);replay jsonb;d jsonb;snap jsonb;prof uuid;n integer;antiga uuid;novo_ponto uuid;begin
  if jsonb_typeof(_dados) is distinct from 'object' or _chave is null then raise exception 'Comando inválido.' using errcode='23514';end if;
  perform public.lev_travar_autor(_org,auth.uid());
  if _comando='criar' then
    if not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  elsif not public.lev_ler(_org,lid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if _comando in ('contexto','nova_revisao','cancelar') and not public.operacao_pode(_org,'gerir_operacao') then raise exception 'A operação exige coordenação.' using errcode='42501';end if;
  if _comando in ('aprovar','devolver') then prof:=public.lev_profissional(_org);if prof is null then raise exception 'Revisão exige profissional de engenharia cadastrado.' using errcode='42501';end if;end if;
  replay:=public.operacao_repetir(_org,_chave,'lev_executar',payload);if replay is not null then return replay;end if;
  if _comando='criar' then
    if not exists(select 1 from public.clientes where organization_id=_org and id=(_dados->>'cliente_id')::uuid and arquivado_em is null and situacao='Ativo') or not exists(select 1 from public.unidades where organization_id=_org and cliente_id=(_dados->>'cliente_id')::uuid and id=(_dados->>'unidade_id')::uuid and arquivado_em is null) then raise exception 'Cliente ou unidade indisponível.' using errcode='23514';end if;
    if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514';end if;
    insert into public.levantamentos(organization_id,codigo,cliente_id,unidade_id,responsavel_id,finalidade,proposta_id,projeto_id)
    values(_org,public.lev_proximo_codigo(_org),(_dados->>'cliente_id')::uuid,(_dados->>'unidade_id')::uuid,(_dados->>'responsavel_id')::uuid,trim(_dados->>'finalidade'),nullif(_dados->>'proposta_id','')::uuid,nullif(_dados->>'projeto_id','')::uuid) returning * into l;
    lid:=l.id;
    insert into public.levantamento_revisoes(organization_id,levantamento_id,numero,modelo_versao_id) values(_org,l.id,1,nullif(_dados->>'modelo_versao_id','')::uuid) returning * into r;rid:=r.id;
    update public.levantamentos set revisao_atual_id=r.id where id=l.id;
  else
    select * into l from public.levantamentos where organization_id=_org and id=lid for update;
    if not public.lev_ler(_org,lid) then raise exception 'Acesso revogado.' using errcode='42501';end if;
    rid:=coalesce(rid,l.revisao_atual_id);
    select * into r from public.levantamento_revisoes where organization_id=_org and levantamento_id=l.id and id=rid for update;
    if not found or r.id<>l.revisao_atual_id then raise exception 'Selecione a revisão atual para editar.' using errcode='23514';end if;
    if _comando='contexto' then
      if l.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
      if r.estado not in ('rascunho','programado','em_coleta') then raise exception 'Contexto não está editável nesta revisão.' using errcode='23514';end if;
      if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514';end if;
      update public.levantamentos set finalidade=trim(_dados->>'finalidade'),responsavel_id=(_dados->>'responsavel_id')::uuid,proposta_id=nullif(_dados->>'proposta_id','')::uuid,projeto_id=nullif(_dados->>'projeto_id','')::uuid where id=lid;
      update public.levantamento_revisoes set updated_at=now() where id=rid;
    elsif _comando in ('salvar_ponto','salvar_medicao','excluir_medicao','excluir_ponto') then
      if r.estado not in ('rascunho','programado','em_coleta') then raise exception 'A coleta não está editável.' using errcode='23514';end if;
      if _comando='salvar_ponto' then
        if pid is null then
          if (select count(*)>=100 from public.levantamento_pontos where revisao_id=rid) then raise exception 'Limite de 100 pontos por revisão.' using errcode='23514';end if;
          insert into public.levantamento_pontos(organization_id,levantamento_id,revisao_id,codigo,nome,area,localizacao,tipo_sistema,observacoes,exige_foto)
          values(_org,lid,rid,trim(_dados->>'codigo'),trim(_dados->>'nome'),coalesce(_dados->>'area',''),coalesce(_dados->>'localizacao',''),coalesce(_dados->>'tipo_sistema',''),coalesce(_dados->>'observacoes',''),coalesce((_dados->>'exige_foto')::boolean,false)) returning id into pid;
        else
          select * into p from public.levantamento_pontos where organization_id=_org and levantamento_id=lid and revisao_id=rid and id=pid for update;
          if not found then raise exception 'Ponto indisponível.' using errcode='42501';end if;
          if p.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
          update public.levantamento_pontos set codigo=trim(_dados->>'codigo'),nome=trim(_dados->>'nome'),area=coalesce(_dados->>'area',''),localizacao=coalesce(_dados->>'localizacao',''),tipo_sistema=coalesce(_dados->>'tipo_sistema',''),observacoes=coalesce(_dados->>'observacoes',''),exige_foto=coalesce((_dados->>'exige_foto')::boolean,false) where id=pid;
        end if;
        if _dados ? 'medicoes' then
          if jsonb_typeof(_dados->'medicoes')<>'array' or jsonb_array_length(_dados->'medicoes')>100 then raise exception 'Lista de medições inválida.' using errcode='23514';end if;
          for d in select value from jsonb_array_elements(_dados->'medicoes') loop perform public.lev_gravar_medicao(_org,lid,rid,pid,d);end loop;
        end if;
        if _dados ? 'excluir_medicoes' then
          if jsonb_typeof(_dados->'excluir_medicoes')<>'array' or jsonb_array_length(_dados->'excluir_medicoes')>100 then raise exception 'Lista de exclusões inválida.' using errcode='23514';end if;
          for d in select value from jsonb_array_elements(_dados->'excluir_medicoes') loop
            select * into m from public.levantamento_medicoes where organization_id=_org and revisao_id=rid and ponto_id=pid and id=(d->>'medicao_id')::uuid for update;
            if not found then raise exception 'Medição indisponível.' using errcode='42501';end if;
            if m.version is distinct from (d->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
            delete from public.levantamento_medicoes where id=m.id;
          end loop;
        end if;
      elsif _comando='salvar_medicao' then perform public.lev_gravar_medicao(_org,lid,rid,pid,_dados);
      elsif _comando='excluir_medicao' then
        select * into m from public.levantamento_medicoes where organization_id=_org and revisao_id=rid and id=mid for update;
        if not found then raise exception 'Medição indisponível.' using errcode='42501';end if;
        if m.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
        delete from public.levantamento_medicoes where id=m.id;
      else
        if r.version is distinct from (_dados->>'expected_revision_version')::integer then raise exception 'A coleta mudou. Recarregue antes de excluir o ponto e suas medições.' using errcode='40001';end if;
        select * into p from public.levantamento_pontos where organization_id=_org and revisao_id=rid and id=pid for update;
        if not found then raise exception 'Ponto indisponível.' using errcode='42501';end if;
        if p.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
        if exists(select 1 from public.levantamento_arquivos where ponto_id=pid) then raise exception 'Ponto com histórico de arquivos não pode ser excluído.' using errcode='23514';end if;
        delete from public.levantamento_medicoes where ponto_id=pid;
        delete from public.levantamento_pontos where id=pid;
      end if;
    else
      if r.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
      if _comando='programar' then
        if r.estado not in ('rascunho','programado','em_coleta') then raise exception 'Revisão não pode ser programada.' using errcode='23514';end if;
        if coalesce(_dados->>'inicio_previsto','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(_dados->>'fim_previsto','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Informe período com fuso horário.' using errcode='23514';end if;
        update public.levantamento_revisoes set inicio_previsto=(_dados->>'inicio_previsto')::timestamptz,fim_previsto=(_dados->>'fim_previsto')::timestamptz,estado=case when r.estado='em_coleta' then 'em_coleta' else 'programado' end where id=rid;
      elsif _comando='iniciar_coleta' then
        if r.estado<>'programado' then raise exception 'Programe a visita antes de iniciar a coleta.' using errcode='23514';end if;
        update public.levantamento_revisoes set estado='em_coleta' where id=rid;
      elsif _comando='submeter' then
        if r.estado<>'em_coleta' then raise exception 'Inicie a coleta antes de enviar à revisão.' using errcode='23514';end if;
        perform public.lev_validar_coleta(_org,rid);update public.levantamento_revisoes set estado='em_revisao' where id=rid;
      elsif _comando='devolver' then
        if r.estado<>'em_revisao' then raise exception 'A revisão não aguarda conferência.' using errcode='23514';end if;
        if length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Explique as pendências da devolução.' using errcode='23514';end if;
        if jsonb_typeof(coalesce(_dados->'pendencias','[]'))<>'array' or jsonb_array_length(coalesce(_dados->'pendencias','[]'))>100 then raise exception 'Pendências inválidas.' using errcode='23514';end if;
        for d in select value from jsonb_array_elements(coalesce(_dados->'pendencias','[]')) loop
          if length(trim(coalesce(d->>'descricao','')))<3 or ((d->>'ponto_id') is not null and not exists(select 1 from public.levantamento_pontos where revisao_id=rid and id=(d->>'ponto_id')::uuid)) or ((d->>'medicao_id') is not null and not exists(select 1 from public.levantamento_medicoes where revisao_id=rid and id=(d->>'medicao_id')::uuid and ((d->>'ponto_id') is null or ponto_id=(d->>'ponto_id')::uuid))) then raise exception 'Pendência precisa apontar dados desta revisão.' using errcode='23514';end if;
        end loop;
        update public.levantamento_revisoes set estado='em_coleta' where id=rid;
      elsif _comando='aprovar' then
        if r.estado<>'em_revisao' then raise exception 'Envie a coleta para revisão antes da aprovação.' using errcode='23514';end if;
        perform public.lev_validar_coleta(_org,rid);
        snap:=public.lev_obter(_org,lid,rid)-'permissoes'-'adocoes'-'revisoes';
        snap:=snap||jsonb_build_object('arquivos',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.levantamento_arquivos a where a.revisao_id=rid and a.estado='vinculado'),'responsavel_tecnico',(select jsonb_build_object('id',id,'nome',nome,'registro_profissional',registro_profissional) from public.pessoas where id=prof),'aprovado_por',auth.uid(),'aprovado_em',now());
        update public.levantamento_revisoes set estado='aprovado',snapshot=snap,snapshot_sha256=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),aprovado_por=auth.uid(),aprovado_em=now() where id=rid;
        update public.levantamentos set aprovada_id=rid where id=lid;
      elsif _comando='cancelar' then
        if r.estado in ('aprovado','cancelado') or length(trim(coalesce(_dados->>'motivo','')))<5 then raise exception 'Cancelamento exige revisão não final e motivo.' using errcode='23514';end if;
        if exists(select 1 from public.levantamento_arquivos where revisao_id=rid and estado in ('pendente','enviado')) then raise exception 'Cancele os envios pendentes antes da revisão.' using errcode='23514';end if;
        update public.levantamento_revisoes set estado='cancelado' where id=rid;
      elsif _comando='nova_revisao' then
        if r.estado not in ('aprovado','cancelado') then raise exception 'Conclua ou cancele a revisão atual antes de abrir outra.' using errcode='23514';end if;
        antiga:=rid;select max(numero)+1 into n from public.levantamento_revisoes where levantamento_id=lid;
        insert into public.levantamento_revisoes(organization_id,levantamento_id,numero,base_id,modelo_versao_id) values(_org,lid,n,rid,coalesce(nullif(_dados->>'modelo_versao_id','')::uuid,r.modelo_versao_id)) returning id into rid;
        update public.levantamentos set revisao_atual_id=rid where id=lid;
        for p in select * from public.levantamento_pontos where revisao_id=antiga order by codigo loop
          insert into public.levantamento_pontos(organization_id,levantamento_id,revisao_id,base_id,codigo,nome,area,localizacao,tipo_sistema,observacoes,exige_foto)
          values(_org,lid,rid,p.id,p.codigo,p.nome,p.area,p.localizacao,p.tipo_sistema,p.observacoes,p.exige_foto) returning id into novo_ponto;
          insert into public.levantamento_medicoes(organization_id,levantamento_id,revisao_id,ponto_id,base_id,chave,grandeza,valor,unidade,precisao,metodo,origem,natureza,coletado_em,observacoes)
          select _org,lid,rid,novo_ponto,id,chave,grandeza,valor,unidade,precisao,metodo,origem,natureza,coletado_em,observacoes from public.levantamento_medicoes where ponto_id=p.id;
        end loop;
      else raise exception 'Comando de levantamento desconhecido.' using errcode='23514';end if;
    end if;
  end if;
  insert into public.levantamento_avaliacoes(organization_id,levantamento_id,revisao_id,decisao,comentario,pendencias) values(_org,lid,rid,_comando,coalesce(_dados->>'motivo',''),coalesce(_dados->'pendencias','[]'));
  replay:=public.lev_obter(_org,lid,rid);
  return public.operacao_concluir(_org,_chave,'lev_executar',payload,replay);
end $$;
create function public.lev_touch() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;begin
  update public.levantamento_revisoes set updated_at=now() where id=(d->>'revisao_id')::uuid;
  update public.levantamentos set updated_at=now() where id=(d->>'levantamento_id')::uuid;
  return null;
end $$;
do $$ declare t text;begin
  foreach t in array array['levantamento_modelos','levantamento_modelo_versoes','levantamentos','levantamento_revisoes','levantamento_pontos','levantamento_medicoes','levantamento_avaliacoes','levantamento_arquivos','levantamento_adocoes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    if t in ('levantamento_modelos','levantamento_modelo_versoes') then
      execute format('create policy ler on public.%I for select to authenticated using(public.operacao_pode(organization_id,''ver_operacao''))',t);
    elsif t='levantamentos' then execute format('create policy ler on public.%I for select to authenticated using(public.lev_ler(organization_id,id))',t);
    elsif t='levantamento_adocoes' then execute format('create policy ler on public.%I for select to authenticated using(public.lev_ler(organization_id,levantamento_id) and public.operacao_pode(organization_id,''revisar_operacao''))',t);
    else execute format('create policy ler on public.%I for select to authenticated using(public.lev_ler(organization_id,levantamento_id))',t);end if;
    if t<>'levantamento_modelos' then execute format('create trigger lev_guard before insert or update or delete on public.%I for each row execute function public.lev_guard()',t);end if;
    if t in ('levantamento_pontos','levantamento_medicoes','levantamento_arquivos') then execute format('create trigger lev_touch after insert or update or delete on public.%I for each row execute function public.lev_touch()',t);end if;
  end loop;
end $$;

create function public.lev_obter(_org uuid,_id uuid,_revisao uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.levantamentos;r public.levantamento_revisoes;contexto jsonb;begin
  if not public.lev_ler(_org,_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  select * into l from public.levantamentos where organization_id=_org and id=_id;
  select * into r from public.levantamento_revisoes where organization_id=_org and levantamento_id=l.id and id=coalesce(_revisao,l.revisao_atual_id);
  if not found then raise exception 'Revisão indisponível.' using errcode='42501';end if;
  contexto:=to_jsonb(l)||jsonb_build_object('cliente_nome',(select razao_social from public.clientes where id=l.cliente_id),'unidade_nome',(select nome from public.unidades where id=l.unidade_id),'responsavel_nome',(select nome from public.pessoas where id=l.responsavel_id));
  if r.estado='aprovado' then contexto:=(r.snapshot->'levantamento')||jsonb_build_object('revisao_atual_id',l.revisao_atual_id,'aprovada_id',l.aprovada_id,'version',l.version);end if;
  return jsonb_build_object('levantamento',contexto,
    'revisao',to_jsonb(r),
    'revisoes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'numero',numero,'estado',estado,'version',version,'created_at',created_at) order by numero desc),'[]') from public.levantamento_revisoes where levantamento_id=l.id),
    'pontos',(select coalesce(jsonb_agg(to_jsonb(p) order by codigo,id),'[]') from public.levantamento_pontos p where p.revisao_id=r.id),
    'medicoes',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('valor',m.valor::text,'precisao',m.precisao::text) order by ponto_id,chave,id),'[]') from public.levantamento_medicoes m where m.revisao_id=r.id),
    'avaliacoes',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.levantamento_avaliacoes a where a.revisao_id=r.id),
    'arquivos',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at,id),'[]') from public.levantamento_arquivos a where a.revisao_id=r.id),
    'adocoes',case when public.operacao_pode(_org,'revisar_operacao') then (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('valor_anterior',valor_anterior::text,'valor_adotado',valor_adotado::text) order by created_at,id),'[]') from public.levantamento_adocoes a where a.revisao_id=r.id) else '[]'::jsonb end,
    'modelo',(select to_jsonb(v)||jsonb_build_object('nome',m.nome) from public.levantamento_modelo_versoes v join public.levantamento_modelos m on m.id=v.modelo_id where v.id=r.modelo_versao_id),
    'permissoes',jsonb_build_object('gerir',public.operacao_pode(_org,'gerir_operacao'),'editar',r.estado in ('rascunho','programado','em_coleta'),'coletar',r.estado in ('rascunho','programado','em_coleta'),'revisar',public.lev_profissional(_org) is not null and r.estado='em_revisao','adotar',public.operacao_pode(_org,'revisar_operacao') and public.pode(_org,'editar_revisao') and r.estado='aprovado'));
end $$;
create function public.lev_listar(_org uuid,_busca text default '',_estado text default null,_responsavel uuid default null,_pagina integer default 0,_limite integer default 25,_cliente uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare itens jsonb;total bigint;begin
  if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  if _pagina not between 0 and 10000 or _limite not between 1 and 50 or length(coalesce(_busca,''))>200 then raise exception 'Filtro ou paginação inválidos.' using errcode='23514';end if;
  with autorizados as (
    select to_jsonb(l)||jsonb_build_object('estado',r.estado,'numero_revisao',r.numero,'cliente_nome',c.razao_social,'unidade_nome',u.nome,'responsavel_nome',p.nome,'inicio_previsto',r.inicio_previsto,'fim_previsto',r.fim_previsto) as registro,l.updated_at,l.id
    from public.levantamentos l join public.levantamento_revisoes r on r.id=l.revisao_atual_id join public.clientes c on c.id=l.cliente_id join public.unidades u on u.id=l.unidade_id join public.pessoas p on p.id=l.responsavel_id
    where l.organization_id=_org and public.lev_ler(_org,l.id) and (_estado is null or r.estado=_estado) and (_responsavel is null or l.responsavel_id=_responsavel) and (_cliente is null or l.cliente_id=_cliente)
      and (coalesce(_busca,'')='' or position(lower(_busca) in lower(l.codigo||' '||l.finalidade||' '||c.razao_social||' '||u.nome))>0)
  ), pagina as (select * from autorizados order by updated_at desc,id limit _limite offset _pagina*_limite)
  select (select count(*) from autorizados),(select coalesce(jsonb_agg(registro order by updated_at desc,id),'[]') from pagina) into total,itens;
  return jsonb_build_object('registros',itens,'total',total,'pagina',_pagina,'limite',_limite);
end $$;
create function public.lev_publicar_modelo(_org uuid,_chave uuid,_modelo uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.levantamento_modelos;v public.levantamento_modelo_versoes;prof uuid;d jsonb;r jsonb;n integer;requisitos jsonb;begin
  perform public.lev_travar_autor(_org,auth.uid());
  prof:=public.lev_profissional(_org);if prof is null then raise exception 'Modelo exige responsável de engenharia com registro profissional cadastrado.' using errcode='42501';end if;
  r:=public.operacao_repetir(_org,_chave,'lev_publicar_modelo',jsonb_build_object('modelo',_modelo,'dados',_dados));if r is not null then return r;end if;
  if jsonb_typeof(_dados->'requisitos') is distinct from 'array' or jsonb_array_length(_dados->'requisitos')>100 then raise exception 'Informe requisitos do modelo.' using errcode='23514';end if;
  for d in select value from jsonb_array_elements(_dados->'requisitos') loop
    if jsonb_typeof(d)<>'object' or length(trim(coalesce(d->>'chave',''))) not between 1 and 80 or not public.lev_unidade_compativel(d->>'grandeza',d->>'unidade') then raise exception 'Grandeza/unidade ou chave do modelo inválida.' using errcode='23514';end if;
    if (d ? 'minimo' and jsonb_typeof(d->'minimo') not in ('string','null')) or (d ? 'maximo' and jsonb_typeof(d->'maximo') not in ('string','null')) or (d ? 'obrigatoria' and jsonb_typeof(d->'obrigatoria')<>'boolean') or (d ? 'exige_foto' and jsonb_typeof(d->'exige_foto')<>'boolean') then raise exception 'Faixas do modelo são textos decimais e políticas são booleanas.' using errcode='23514';end if;
    if (d->>'minimo' is not null and d->>'minimo'!~'^[0-9]{1,12}([.][0-9]{1,6})?$') or (d->>'maximo' is not null and d->>'maximo'!~'^[0-9]{1,12}([.][0-9]{1,6})?$') then raise exception 'Faixa do modelo deve ser decimal finita com até doze inteiros e seis casas.' using errcode='23514';end if;
    if (nullif(d->>'minimo','')::numeric<0) or (nullif(d->>'maximo','')::numeric<nullif(d->>'minimo','')::numeric) then raise exception 'Faixa configurada inválida.' using errcode='23514';end if;
  end loop;
  if (select count(*)<>count(distinct trim(value->>'chave')) from jsonb_array_elements(_dados->'requisitos')) then raise exception 'Chaves do modelo repetidas.' using errcode='23514';end if;
  select coalesce(jsonb_agg(value||jsonb_build_object('chave',trim(value->>'chave')) order by ord),'[]') into requisitos from jsonb_array_elements(_dados->'requisitos') with ordinality as d(value,ord);
  if _modelo is null then insert into public.levantamento_modelos(organization_id,nome,descricao) values(_org,trim(_dados->>'nome'),coalesce(_dados->>'descricao','')) returning * into m;
  else select * into m from public.levantamento_modelos where organization_id=_org and id=_modelo for update;if not found then raise exception 'Modelo indisponível.' using errcode='42501';end if;end if;
  select coalesce(max(numero),0)+1 into n from public.levantamento_modelo_versoes where modelo_id=m.id;
  insert into public.levantamento_modelo_versoes(organization_id,modelo_id,numero,fonte,requisitos,responsavel_id) values(_org,m.id,n,_dados->>'fonte',requisitos,prof) returning * into v;
  return public.operacao_concluir(_org,_chave,'lev_publicar_modelo',jsonb_build_object('modelo',_modelo,'dados',_dados),jsonb_build_object('modelo',to_jsonb(m),'versao',to_jsonb(v)));
end $$;

create function public.lev_gravar_medicao(_org uuid,_levantamento uuid,_revisao uuid,_ponto uuid,_d jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.levantamento_medicoes;mid uuid:=nullif(_d->>'medicao_id','')::uuid;begin
  if (nullif(_d->>'valor','') is not null and _d->>'valor'!~'^[0-9]+([.][0-9]{1,6})?$') or (nullif(_d->>'precisao','') is not null and _d->>'precisao'!~'^[0-9]+([.][0-9]{1,6})?$') then raise exception 'Valor e precisão devem ser decimais finitos com até seis casas.' using errcode='23514';end if;
  if nullif(_d->>'coletado_em','') is not null and _d->>'coletado_em'!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Data de coleta exige fuso horário.' using errcode='23514';end if;
  if not exists(select 1 from public.levantamento_pontos where organization_id=_org and levantamento_id=_levantamento and revisao_id=_revisao and id=_ponto) then raise exception 'Ponto indisponível.' using errcode='42501';end if;
  if mid is null then
    if (select count(*)>=1000 from public.levantamento_medicoes where revisao_id=_revisao) then raise exception 'Limite de 1000 medições por revisão.' using errcode='23514';end if;
    insert into public.levantamento_medicoes(organization_id,levantamento_id,revisao_id,ponto_id,chave,grandeza,valor,unidade,precisao,metodo,origem,natureza,coletado_em,observacoes)
    values(_org,_levantamento,_revisao,_ponto,_d->>'chave',_d->>'grandeza',nullif(_d->>'valor','')::numeric,coalesce(_d->>'unidade',''),nullif(_d->>'precisao','')::numeric,coalesce(_d->>'metodo',''),coalesce(_d->>'origem','campo'),coalesce(_d->>'natureza','medida'),nullif(_d->>'coletado_em','')::timestamptz,coalesce(_d->>'observacoes','')) returning id into mid;
  else
    select * into m from public.levantamento_medicoes where organization_id=_org and levantamento_id=_levantamento and revisao_id=_revisao and ponto_id=_ponto and id=mid for update;
    if not found then raise exception 'Medição indisponível.' using errcode='42501';end if;
    if m.version is distinct from (_d->>'expected_version')::integer then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001';end if;
    update public.levantamento_medicoes set chave=_d->>'chave',grandeza=_d->>'grandeza',valor=nullif(_d->>'valor','')::numeric,unidade=coalesce(_d->>'unidade',''),precisao=nullif(_d->>'precisao','')::numeric,metodo=coalesce(_d->>'metodo',''),origem=coalesce(_d->>'origem','campo'),natureza=coalesce(_d->>'natureza','medida'),coletado_em=nullif(_d->>'coletado_em','')::timestamptz,observacoes=coalesce(_d->>'observacoes','') where id=mid;
  end if;return mid;
end $$;

create function public.lev_validar_coleta(_org uuid,_revisao uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.levantamento_pontos;m public.levantamento_medicoes;req jsonb;requisitos jsonb;begin
  if not exists(select 1 from public.levantamento_pontos where organization_id=_org and revisao_id=_revisao) then raise exception 'Cadastre ao menos um ponto.' using errcode='23514';end if;
  if exists(select 1 from public.levantamento_arquivos where organization_id=_org and revisao_id=_revisao and estado in ('pendente','enviado')) then raise exception 'Confirme ou cancele os envios pendentes antes da revisão.' using errcode='23514';end if;
  select v.requisitos into requisitos from public.levantamento_revisoes r join public.levantamento_modelo_versoes v on v.id=r.modelo_versao_id where r.id=_revisao;
  for p in select * from public.levantamento_pontos where organization_id=_org and revisao_id=_revisao loop
    if not exists(select 1 from public.levantamento_medicoes where ponto_id=p.id) then raise exception 'Ponto %: cadastre ao menos uma medição.',p.codigo using errcode='23514';end if;
    if p.exige_foto and not exists(select 1 from public.levantamento_arquivos where ponto_id=p.id and estado='vinculado' and mime like 'image/%') then raise exception 'Ponto %: foto obrigatória pendente.',p.codigo using errcode='23514';end if;
    for m in select * from public.levantamento_medicoes where ponto_id=p.id loop
      if m.valor is null or m.unidade='' or length(trim(m.metodo))<2 or m.coletado_em is null or (m.natureza='medida' and m.precisao is null) then raise exception 'Ponto %, medida %: valor, unidade, método, data e precisão da medida são necessários.',p.codigo,m.chave using errcode='23514';end if;
    end loop;
    for req in select value from jsonb_array_elements(coalesce(requisitos,'[]')) loop
      select * into m from public.levantamento_medicoes where ponto_id=p.id and chave=req->>'chave';
      if not found then if coalesce((req->>'obrigatoria')::boolean,true) then raise exception 'Ponto %: falta a medida % do modelo.',p.codigo,req->>'chave' using errcode='23514';end if;continue;end if;
      if m.grandeza<>req->>'grandeza' or m.unidade<>req->>'unidade' or m.valor<nullif(req->>'minimo','')::numeric or m.valor>nullif(req->>'maximo','')::numeric then raise exception 'Ponto %, medida %: dados fora da política versionada do modelo.',p.codigo,m.chave using errcode='23514';end if;
      if coalesce((req->>'exige_foto')::boolean,false) and not exists(select 1 from public.levantamento_arquivos where ponto_id=p.id and estado='vinculado' and mime like 'image/%') then raise exception 'Ponto %: falta foto exigida no modelo.',p.codigo using errcode='23514';end if;
    end loop;
  end loop;
end $$;

create function public.lev_travar_autor(_org uuid,_autor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
  perform 1 from public.user_roles where organization_id=_org and user_id=_autor order by role for share;
  perform 1 from public.user_capacidades where organization_id=_org and user_id=_autor order by capacidade for share;
  perform 1 from public.pessoas where organization_id=_org and user_id=_autor order by id for share;
  perform 1 from public.memberships where organization_id=_org and user_id=_autor for share;
  if not found then raise exception 'Acesso revogado.' using errcode='42501';end if;
end $$;
create function public.lev_travar_destino(_org uuid,_revisao uuid,_autor uuid,_editavel boolean default true) returns public.levantamento_revisoes
language plpgsql security definer set search_path='' as $$
declare r public.levantamento_revisoes;l public.levantamentos;begin
  perform public.lev_travar_autor(_org,_autor);
  select * into r from public.levantamento_revisoes where organization_id=_org and id=_revisao;
  if not found then raise exception 'Revisão indisponível.' using errcode='42501';end if;
  select * into l from public.levantamentos where organization_id=_org and id=r.levantamento_id for update;
  select * into r from public.levantamento_revisoes where organization_id=_org and id=_revisao for update;
  if not public.lev_autor_ler(_org,l.id,_autor) then raise exception 'Acesso revogado.' using errcode='42501';end if;
  if _editavel and (l.revisao_atual_id<>r.id or r.estado not in ('rascunho','programado','em_coleta')) then raise exception 'A revisão não aceita novos arquivos.' using errcode='23514';end if;
  return r;
end $$;
create function public.lev_pode_enviar_arquivo(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.levantamento_arquivos a join public.levantamento_revisoes r on r.id=a.revisao_id join public.levantamentos l on l.id=a.levantamento_id
    where a.organization_id=_org and a.id=_id and a.created_by=auth.uid() and a.estado in ('pendente','enviado') and r.estado in ('rascunho','programado','em_coleta') and l.revisao_atual_id=r.id and public.lev_ler(_org,l.id));
$$;
create function public.lev_preparar_arquivo(_org uuid,_revisao uuid,_ponto uuid,_chave uuid,_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.levantamento_revisoes;a public.levantamento_arquivos;replay jsonb;novo uuid:=gen_random_uuid();payload jsonb:=jsonb_build_object('revisao',_revisao,'ponto',_ponto,'dados',_dados);begin
  r:=public.lev_travar_destino(_org,_revisao,auth.uid());
  replay:=public.operacao_repetir(_org,_chave,'lev_preparar_arquivo',payload);if replay is not null then return replay;end if;
  if _ponto is not null and not exists(select 1 from public.levantamento_pontos where organization_id=_org and levantamento_id=r.levantamento_id and revisao_id=r.id and id=_ponto) then raise exception 'Ponto indisponível.' using errcode='42501';end if;
  select * into a from public.levantamento_arquivos where organization_id=_org and revisao_id=r.id and ponto_id is not distinct from _ponto and sha256=_dados->>'sha256' and estado<>'cancelado' order by created_at,id limit 1;
  if found then
    if a.tamanho<>(_dados->>'tamanho')::bigint or a.mime<>_dados->>'mime' then raise exception 'Metadados divergentes para o mesmo arquivo.' using errcode='23514';end if;
    if a.estado<>'vinculado' and a.created_by<>auth.uid() then raise exception 'Arquivo pendente de outro responsável.' using errcode='23514';end if;
  else
    if (select count(*)>=500 from public.levantamento_arquivos where revisao_id=r.id) then raise exception 'Limite de 500 arquivos por revisão.' using errcode='23514';end if;
    insert into public.levantamento_arquivos(id,organization_id,levantamento_id,revisao_id,ponto_id,nome,mime,tamanho,sha256,caminho)
    values(novo,_org,r.levantamento_id,r.id,_ponto,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/levantamentos/'||r.levantamento_id::text||'/'||r.id::text||'/'||novo::text) returning * into a;
    insert into public.levantamento_avaliacoes(organization_id,levantamento_id,revisao_id,decisao,comentario) values(_org,r.levantamento_id,r.id,'arquivo_pendente',a.nome);
  end if;
  return public.operacao_concluir(_org,_chave,'lev_preparar_arquivo',payload,to_jsonb(a));
end $$;
create function public.lev_confirmar_arquivo(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.levantamento_arquivos;r public.levantamento_revisoes;begin
  select * into a from public.levantamento_arquivos where organization_id=_org and id=_id;
  if not found then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
  r:=public.lev_travar_destino(_org,a.revisao_id,_autor,false);
  select * into a from public.levantamento_arquivos where organization_id=_org and id=_id for update;
  if a.created_by is distinct from _autor or a.sha256 is distinct from _sha256 or a.estado='cancelado' then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
  if a.estado='vinculado' then return;end if;
  if r.estado not in ('rascunho','programado','em_coleta') then raise exception 'A revisão não aceita novos arquivos.' using errcode='23514';end if;
  if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and (metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then raise exception 'Armazenamento ainda não confirmado.' using errcode='23514';end if;
  update public.levantamento_arquivos set estado='vinculado',confirmado_em=now() where id=a.id;
  insert into public.levantamento_avaliacoes(organization_id,levantamento_id,revisao_id,decisao,comentario,autor) values(_org,a.levantamento_id,a.revisao_id,'arquivo_confirmado',a.nome,_autor);
end $$;
create function public.lev_cancelar_arquivo(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.levantamento_arquivos;r public.levantamento_revisoes;replay jsonb;payload jsonb:=jsonb_build_object('id',_id,'motivo',_motivo);begin
  select * into a from public.levantamento_arquivos where organization_id=_org and id=_id;
  if not found then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
  r:=public.lev_travar_destino(_org,a.revisao_id,auth.uid());
  if a.created_by<>auth.uid() and not public.operacao_pode(_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  replay:=public.operacao_repetir(_org,_chave,'lev_cancelar_arquivo',payload);if replay is not null then return replay;end if;
  select * into a from public.levantamento_arquivos where organization_id=_org and id=_id for update;
  if a.estado not in ('pendente','enviado') or length(trim(coalesce(_motivo,'')))<5 then raise exception 'Somente envio pendente pode ser cancelado com motivo.' using errcode='23514';end if;
  update public.levantamento_arquivos set estado='cancelado',motivo=_motivo where id=a.id returning * into a;
  insert into public.levantamento_avaliacoes(organization_id,levantamento_id,revisao_id,decisao,comentario) values(_org,a.levantamento_id,a.revisao_id,'arquivo_cancelado',_motivo);
  return public.operacao_concluir(_org,_chave,'lev_cancelar_arquivo',payload,to_jsonb(a));
end $$;
create policy nexus_levantamento_upload on storage.objects for insert to authenticated with check(bucket_id='nexus-operacional' and exists(select 1 from public.levantamento_arquivos a where a.caminho=name and public.lev_pode_enviar_arquivo(a.organization_id,a.id)));
create policy nexus_levantamento_download on storage.objects for select to authenticated using(bucket_id='nexus-operacional' and exists(select 1 from public.levantamento_arquivos a where a.caminho=name and a.estado='vinculado' and public.lev_ler(a.organization_id,a.levantamento_id)));

create function public.lev_prever_adocao(_org uuid,_revisao uuid,_medicao uuid,_sistema uuid,_campo text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.levantamento_medicoes;r public.levantamento_revisoes;l public.levantamentos;s public.sistemas_dimensionados;dest public.proposta_revisoes;prop public.propostas;v numeric;atual numeric;result jsonb;begin
  if not public.operacao_pode(_org,'revisar_operacao') or not public.pode(_org,'editar_revisao') then raise exception 'Adoção exige engenharia autorizada.' using errcode='42501';end if;
  select * into r from public.levantamento_revisoes where organization_id=_org and id=_revisao;
  if not found or not public.lev_ler(_org,r.levantamento_id) then raise exception 'Revisão de origem indisponível.' using errcode='42501';end if;
  select * into l from public.levantamentos where organization_id=_org and id=r.levantamento_id;
  select * into m from public.levantamento_medicoes where organization_id=_org and levantamento_id=l.id and revisao_id=r.id and id=_medicao;
  if not found or r.estado<>'aprovado' then raise exception 'Adote somente medições de revisão aprovada.' using errcode='23514';end if;
  if m.natureza<>'medida' or m.origem='modelo_3d' then raise exception 'Estimativas e referências 3D não são adotadas como medidas verificadas.' using errcode='23514';end if;
  select * into s from public.sistemas_dimensionados where organization_id=_org and id=_sistema;
  if not found then raise exception 'Sistema de destino indisponível.' using errcode='42501';end if;
  select * into dest from public.proposta_revisoes where organization_id=_org and id=s.revisao_id;
  select * into prop from public.propostas where organization_id=_org and id=dest.proposta_id;
  if dest.status<>'rascunho' then raise exception 'A adoção altera somente proposta em rascunho.' using errcode='23514';end if;
  if prop.cliente_id<>l.cliente_id or prop.unidade_id is distinct from l.unidade_id then raise exception 'Destino precisa ter o mesmo cliente e unidade do levantamento.' using errcode='23514';end if;
  if _campo='metragem' and m.grandeza='comprimento' and m.unidade in ('m','cm','mm') then
    v:=m.valor/case m.unidade when 'mm' then 1000 when 'cm' then 100 else 1 end;
    if v>99999999999.999 then raise exception 'Medição excede a precisão do destino.' using errcode='23514';end if;
    if v<>trunc(v,3) then raise exception 'Medição não representável na precisão do destino (0,001 m); confira a coleta antes de adotar.' using errcode='23514';end if;
    v:=v::numeric(14,3);atual:=s.metragem;
  elsif _campo='trechos' and m.grandeza='contagem' and m.unidade='un' and m.valor between 1 and 2147483647 and m.valor=trunc(m.valor) then v:=m.valor;atual:=s.trechos;
  else raise exception 'Grandeza/unidade incompatível com o campo de destino.' using errcode='23514';end if;
  result:=jsonb_build_object('levantamento_id',l.id,'revisao_fonte_id',r.id,'medicao_id',m.id,'sistema_id',s.id,'revisao_destino_id',dest.id,'proposta_destino_id',dest.proposta_id,'campo',_campo,'atual',atual::text,'proposto',v::text,'unidade',case when _campo='metragem' then 'm' else 'un' end,'versao_destino',dest.version,'hash_destino',public.hash_tecnico(dest.id),
    'origem',jsonb_build_object('codigo',l.codigo,'revisao',r.numero,'snapshot_sha256',r.snapshot_sha256,'ponto_id',m.ponto_id,'chave',m.chave,'valor',m.valor::text,'unidade',m.unidade,'precisao',m.precisao::text,'metodo',m.metodo,'origem',m.origem,'natureza',m.natureza,'coletado_em',m.coletado_em),
    'afetados',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'regra_chave',sc.regra_chave,'codigo',rc.codigo) order by sc.id),'[]') from public.sistema_componentes sc join public.revisao_componentes rc on rc.id=sc.revisao_componente_id where sc.organization_id=_org and sc.sistema_id=s.id));
  return result||jsonb_build_object('preview_hash',md5(result::text));
end $$;
create function public.lev_adotar_medicao(_org uuid,_chave uuid,_revisao uuid,_medicao uuid,_sistema uuid,_campo text,_preview_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb;replay jsonb;payload jsonb:=jsonb_build_object('revisao',_revisao,'medicao',_medicao,'sistema',_sistema,'campo',_campo,'preview_hash',_preview_hash);s public.sistemas_dimensionados;a public.levantamento_adocoes;begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'revisar_operacao') or not public.pode(_org,'editar_revisao') or not exists(select 1 from public.levantamento_revisoes r where r.organization_id=_org and r.id=_revisao and public.lev_ler(_org,r.levantamento_id)) then raise exception 'Acesso negado.' using errcode='42501';end if;
  replay:=public.operacao_repetir(_org,_chave,'lev_adotar_medicao',payload);if replay is not null then return replay;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-admin:'||_org::text,0));
  perform 1 from public.user_roles where organization_id=_org and user_id=auth.uid() order by role for share;
  select * into s from public.sistemas_dimensionados where organization_id=_org and id=_sistema;
  perform public.travar_revisao(s.revisao_id);
  perform 1 from public.proposta_revisoes where organization_id=_org and id=s.revisao_id for update;
  perform 1 from public.sistemas_dimensionados where organization_id=_org and id=_sistema for update;
  p:=public.lev_prever_adocao(_org,_revisao,_medicao,_sistema,_campo);
  if p->>'preview_hash' is distinct from _preview_hash then raise exception 'O destino mudou. Compare os valores novamente antes de adotar.' using errcode='40001';end if;
  if _campo='metragem' then update public.sistemas_dimensionados set metragem=(p->>'proposto')::numeric,origem='levantamento_aprovado' where id=_sistema;
  else update public.sistemas_dimensionados set trechos=(p->>'proposto')::integer,origem='levantamento_aprovado' where id=_sistema;end if;
  -- Gatilhos existentes registram a edição e invalidam cálculo. Não há outro motor de quantidades.
  update public.proposta_revisoes set desatualizada=true where id=s.revisao_id;
  insert into public.levantamento_adocoes(organization_id,levantamento_id,revisao_id,medicao_id,revisao_destino_id,sistema_id,campo,valor_anterior,valor_adotado,preview_hash,origem)
  values(_org,(p->>'levantamento_id')::uuid,_revisao,_medicao,s.revisao_id,_sistema,_campo,(p->>'atual')::numeric,(p->>'proposto')::numeric,_preview_hash,p->'origem') returning * into a;
  insert into public.levantamento_avaliacoes(organization_id,levantamento_id,revisao_id,decisao,comentario) values(_org,a.levantamento_id,_revisao,'medicao_adotada',_sistema::text||':'||_campo);
  return public.operacao_concluir(_org,_chave,'lev_adotar_medicao',payload,jsonb_build_object('adocao',to_jsonb(a)||jsonb_build_object('valor_anterior',a.valor_anterior::text,'valor_adotado',a.valor_adotado::text),'revisao_destino_id',s.revisao_id,'proposta_destino_id',(p->>'proposta_destino_id')::uuid,'sistema_id',s.id,'recalculo_necessario',true));
end $$;

-- Toda função nova é privada por padrão; só os contratos autenticados abaixo são RPCs.
revoke all on function public.lev_travar_autor(uuid,uuid),public.lev_proximo_codigo(uuid),public.lev_autor_ler(uuid,uuid,uuid),public.lev_profissional(uuid),public.lev_guard(),public.lev_touch(),public.lev_gravar_medicao(uuid,uuid,uuid,uuid,jsonb),public.lev_validar_coleta(uuid,uuid),public.lev_travar_destino(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.lev_ler(uuid,uuid),public.lev_obter(uuid,uuid,uuid),public.lev_listar(uuid,text,text,uuid,integer,integer,uuid),public.lev_publicar_modelo(uuid,uuid,uuid,jsonb),public.lev_executar(uuid,uuid,text,jsonb),public.lev_pode_enviar_arquivo(uuid,uuid),public.lev_preparar_arquivo(uuid,uuid,uuid,uuid,jsonb),public.lev_cancelar_arquivo(uuid,uuid,uuid,text),public.lev_prever_adocao(uuid,uuid,uuid,uuid,text),public.lev_adotar_medicao(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.lev_ler(uuid,uuid),public.lev_obter(uuid,uuid,uuid),public.lev_listar(uuid,text,text,uuid,integer,integer,uuid),public.lev_publicar_modelo(uuid,uuid,uuid,jsonb),public.lev_executar(uuid,uuid,text,jsonb),public.lev_pode_enviar_arquivo(uuid,uuid),public.lev_preparar_arquivo(uuid,uuid,uuid,uuid,jsonb),public.lev_cancelar_arquivo(uuid,uuid,uuid,text),public.lev_prever_adocao(uuid,uuid,uuid,uuid,text),public.lev_adotar_medicao(uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;
revoke all on function public.lev_confirmar_arquivo(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.lev_confirmar_arquivo(uuid,uuid,uuid,text) to service_role;
-- Unidade é uma verificação dimensional pura, usada também pelos CHECKs.
revoke all on function public.lev_unidade_compativel(text,text) from public,anon;
grant execute on function public.lev_unidade_compativel(text,text) to authenticated;
