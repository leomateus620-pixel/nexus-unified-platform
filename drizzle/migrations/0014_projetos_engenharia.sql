-- Domínio independente de autoria documental. Depende da fundação 0012 e cadastros 0013.
-- Congelamento interno não representa aprovação profissional, ART ou aceite comercial.
create table public.pe_projetos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cliente_id uuid not null references public.clientes(id), unidade_id uuid references public.unidades(id),
  responsavel_id uuid not null, titulo text not null check(length(trim(titulo)) between 3 and 200),
  local_descritivo text not null default '' check(length(local_descritivo)<=1000),
  descricao text not null default '' check(length(descricao)<=4000),
  visibilidade text not null default 'restrito' check(visibilidade in ('organizacao','restrito')),
  arquivado boolean not null default false, vigente_id uuid,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id),
  check(unidade_id is not null or length(trim(local_descritivo))>=3),
  foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create index pe_lista on public.pe_projetos(organization_id,arquivado,updated_at desc,id);
create index pe_cliente on public.pe_projetos(organization_id,cliente_id);

create table public.pe_versoes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  projeto_id uuid not null, numero integer not null check(numero>0), parent_id uuid,
  estado text not null default 'rascunho' check(estado in ('rascunho','em_revisao','congelada')),
  elaborado_em date, autor_declarado text not null default '' check(length(autor_declarado)<=200),
  revisao_declarada text not null default '' check(length(revisao_declarada)<=40),
  resumo text not null check(length(trim(resumo)) between 3 and 2000),
  modelo jsonb not null, snapshot jsonb, snapshot_sha256 text,
  congelado_por uuid references auth.users(id), congelado_em timestamptz,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,projeto_id,id), unique(projeto_id,numero),
  check((estado='congelada')=(snapshot is not null and snapshot_sha256 is not null and congelado_em is not null and congelado_por is not null)),
  foreign key(organization_id,projeto_id) references public.pe_projetos(organization_id,id),
  foreign key(organization_id,projeto_id,parent_id) references public.pe_versoes(organization_id,projeto_id,id)
);
create index pe_versoes_projeto on public.pe_versoes(organization_id,projeto_id,numero desc);
alter table public.pe_projetos add constraint pe_vigente_mesmo_projeto
  foreign key(organization_id,id,vigente_id) references public.pe_versoes(organization_id,projeto_id,id);

create table public.pe_cenarios (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, projeto_id uuid not null,
  base_id uuid not null, titulo text not null check(length(trim(titulo)) between 3 and 200),
  modelo jsonb not null, promovida_id uuid, descartado boolean not null default false,
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,projeto_id,id),
  foreign key(organization_id,projeto_id,base_id) references public.pe_versoes(organization_id,projeto_id,id),
  foreign key(organization_id,projeto_id,promovida_id) references public.pe_versoes(organization_id,projeto_id,id)
);
create index pe_cenarios_projeto on public.pe_cenarios(organization_id,projeto_id,created_at desc);

create table public.pe_eventos (
  id bigint generated always as identity primary key, organization_id uuid not null,
  projeto_id uuid not null, versao_id uuid, cenario_id uuid,
  comando text not null, motivo text, autor uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id,projeto_id) references public.pe_projetos(organization_id,id),
  foreign key(organization_id,projeto_id,versao_id) references public.pe_versoes(organization_id,projeto_id,id),
  foreign key(organization_id,projeto_id,cenario_id) references public.pe_cenarios(organization_id,projeto_id,id)
);
create index pe_eventos_projeto on public.pe_eventos(organization_id,projeto_id,id desc);

-- Metadados reservados para o adaptador comum de upload privado; sem escrita direta.
create table public.pe_arquivos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  projeto_id uuid not null, versao_id uuid not null,
  nome text not null check(length(nome) between 1 and 240),
  mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),
  tamanho bigint not null check(tamanho between 1 and 52428800),
  sha256 text not null check(sha256~'^[0-9a-f]{64}$'), caminho text not null unique,
  estado text not null default 'pendente' check(estado in ('pendente','enviado','vinculado','cancelado')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), confirmado_em timestamptz,
  unique(organization_id,id),
  foreign key(organization_id,projeto_id,versao_id) references public.pe_versoes(organization_id,projeto_id,id)
);
create index pe_arquivos_versao on public.pe_arquivos(organization_id,versao_id,estado);

create function public.pe_ler_projeto(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_pode(_org,'ver_projetos_engenharia') and exists(
    select 1 from public.pe_projetos p where p.organization_id=_org and p.id=_id and
    (p.visibilidade='organizacao' or p.created_by=auth.uid() or public.has_org_role(_org,'admin') or
      public.operacao_minha_pessoa(_org,p.responsavel_id)));
$$;
create function public.pe_ler_arquivo(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.pe_arquivos a where a.organization_id=_org and a.id=_id and a.estado<>'cancelado' and public.pe_ler_projeto(_org,a.projeto_id));
$$;

create function public.pe_validar_modelo(_modelo jsonb) returns void
language plpgsql set search_path='' as $$
declare item jsonb; ids uuid[]:=array[]::uuid[]; item_id uuid; begin
  if _modelo is null or jsonb_typeof(_modelo)<>'object' or (_modelo->'schema_version') is distinct from '1'::jsonb
    or (_modelo->>'familia') is distinct from 'documental'
    or coalesce(_modelo->>'finalidade','') not in ('estudo','layout_preliminar','referencia_documental')
    or jsonb_typeof(_modelo->'secoes') is distinct from 'array'
    or jsonb_typeof(_modelo->'parametros') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(_modelo) k where k not in ('schema_version','familia','finalidade','secoes','parametros')) then
    raise exception 'Modelo documental inválido.' using errcode='23514';
  end if;
  if jsonb_array_length(_modelo->'secoes') not between 1 and 50 or jsonb_array_length(_modelo->'parametros')>200 or octet_length(_modelo::text)>1048576 then
    raise exception 'Modelo excede os limites documentais.' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements((_modelo->'secoes')||(_modelo->'parametros')) loop
    item_id:=(item->>'id')::uuid;
    if item_id is null or item_id=any(ids) then raise exception 'Identidade de item inválida ou repetida.' using errcode='23514'; end if;
    ids:=array_append(ids,item_id);
  end loop;
  for item in select value from jsonb_array_elements(_modelo->'secoes') loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'titulo') is distinct from 'string' or jsonb_typeof(item->'texto') is distinct from 'string'
      or length(trim(item->>'titulo')) not between 1 and 160 or length(item->>'texto')>20000
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','titulo','texto')) then
      raise exception 'Seção documental inválida.' using errcode='23514';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(_modelo->'parametros') loop
    if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'nome',''))) not between 1 and 120
      or exists(select 1 from jsonb_each(item) e where jsonb_typeof(e.value)<>'string')
      or length(trim(coalesce(item->>'valor_original',''))) not between 1 and 120
      or length(trim(coalesce(item->>'unidade',''))) not between 1 and 30
      or length(trim(coalesce(item->>'fonte',''))) not between 1 and 1000
      or coalesce(item->>'natureza','') not in ('declarado','medido','estimado','proposto')
      or coalesce(item->>'validacao','') not in ('a_confirmar','conferido','divergente')
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','nome','valor_original','unidade','natureza','validacao','fonte')) then
      raise exception 'Parâmetro inválido: informe valor, unidade, natureza e fonte.' using errcode='23514';
    end if;
  end loop;
end $$;

create function public.pe_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Histórico técnico não pode ser apagado.' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id or new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then
      raise exception 'Identidade e autoria são imutáveis.' using errcode='23514';
    end if;
    if tg_table_name='pe_versoes' then
      if old.estado='congelada' then raise exception 'Versão congelada é imutável. Crie nova versão.' using errcode='23514'; end if;
      if new.projeto_id<>old.projeto_id or new.numero<>old.numero or new.parent_id is distinct from old.parent_id then raise exception 'Origem da versão é imutável.' using errcode='23514'; end if;
    elsif tg_table_name='pe_cenarios' then
      if old.promovida_id is not null or old.descartado or new.base_id<>old.base_id or new.projeto_id<>old.projeto_id then raise exception 'Cenário encerrado ou sua origem é imutável.' using errcode='23514'; end if;
    end if;
    new.version:=old.version+1; new.updated_at:=now();
  end if;
  if tg_table_name in ('pe_versoes','pe_cenarios') then perform public.pe_validar_modelo(new.modelo); end if;
  if tg_table_name='pe_projetos' then
    if not exists(select 1 from public.clientes c where c.organization_id=new.organization_id and c.id=new.cliente_id)
      or (new.unidade_id is not null and not exists(select 1 from public.unidades u where u.organization_id=new.organization_id and u.id=new.unidade_id and u.cliente_id=new.cliente_id)) then
      raise exception 'Cliente e unidade incompatíveis.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['pe_projetos','pe_versoes','pe_cenarios'] loop
    execute format('create trigger pe_guard before insert or update or delete on public.%I for each row execute function public.pe_guard()',t);
  end loop;
  foreach t in array array['pe_projetos','pe_versoes','pe_cenarios','pe_eventos','pe_arquivos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy ler on public.pe_projetos for select to authenticated using(public.pe_ler_projeto(organization_id,id));
create policy ler on public.pe_versoes for select to authenticated using(public.pe_ler_projeto(organization_id,projeto_id));
create policy ler on public.pe_cenarios for select to authenticated using(public.pe_ler_projeto(organization_id,projeto_id));
create policy ler on public.pe_eventos for select to authenticated using(public.pe_ler_projeto(organization_id,projeto_id));
create policy ler on public.pe_arquivos for select to authenticated using(public.pe_ler_arquivo(organization_id,id));

create function public.pe_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb
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
        select jsonb_build_object('schema_version',1,'projeto',jsonb_build_object('id',p.id,'titulo',p.titulo,'cliente',cl.razao_social,'unidade',u.nome,'local',p.local_descritivo),'versao',jsonb_build_object('id',v.id,'numero',v.numero,'elaborado_em',v.elaborado_em,'autor_declarado',v.autor_declarado,'revisao_declarada',v.revisao_declarada,'resumo',v.resumo),'modelo',v.modelo)
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

revoke all on function public.pe_guard(),public.pe_validar_modelo(jsonb) from public,anon,authenticated;
revoke all on function public.pe_ler_projeto(uuid,uuid),public.pe_ler_arquivo(uuid,uuid),public.pe_executar(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.pe_ler_projeto(uuid,uuid),public.pe_ler_arquivo(uuid,uuid),public.pe_executar(uuid,uuid,text,jsonb) to authenticated;
