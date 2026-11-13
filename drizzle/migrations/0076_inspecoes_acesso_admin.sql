-- Administração da organização e exercício profissional de Inspeções têm permissões distintas.
create function public.inspecoes_admin(p_org uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.memberships m join public.user_roles r using(organization_id,user_id)
    where m.organization_id=p_org and m.user_id=p_user and r.role='admin'
  )
$$;
revoke all on function public.inspecoes_admin(uuid,uuid) from public,anon,authenticated,service_role;

create function public.inspecoes_competencia_apta(p_org uuid,p_qualificacao uuid,p_perfil text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.pessoa_qualificacoes q
    join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id
    join public.pessoas p on p.organization_id=q.organization_id and p.id=q.pessoa_id
    where q.organization_id=p_org and q.id=p_qualificacao and q.estado='validada'
      and q.conferido_por is not null and q.conferido_por is distinct from p.user_id
      and q.conferido_em is not null and c.exige_evidencia
      and lower(trim(c.nome))=case p_perfil when 'EST' then 'engenharia de segurança do trabalho'
        when 'TST' then 'técnico em segurança do trabalho' end
      and exists (select 1 from public.anexos a where a.organization_id=p_org
        and a.qualificacao_id=q.id and a.estado='vinculado')
  )
$$;
revoke all on function public.inspecoes_competencia_apta(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.inspecoes_pode(
  p_org uuid,p_cliente uuid default null,p_unidade uuid default null,p_capacidade text default 'consultar'
) returns boolean language sql stable security definer set search_path='' as $$
  select (p_unidade is null or p_cliente is not null) and (
    (p_capacidade in ('consultar','gerir_acervo') and public.inspecoes_admin(p_org,auth.uid())
      and (p_cliente is null or exists (
        select 1 from public.inspecoes_contextos i where i.organization_id=p_org and i.cliente_id=p_cliente
          and (p_unidade is null or i.unidade_id=p_unidade)
      )))
    or exists (
      select 1 from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
      where (
        (p_cliente is null and p_capacidade='consultar')
        or ((a.cliente_id is null or a.cliente_id=p_cliente) and (a.unidade_id is null or a.unidade_id=p_unidade))
      ) and case p_capacidade
        when 'consultar' then true
        when 'levantar' then true
        when 'est' then a.perfil='EST'
        when 'ensaio' then a.ensaios
        when 'biblioteca' then a.perfil='EST' and a.biblioteca
        when 'importar' then a.perfil='EST' and a.importacao
        when 'comunicar' then a.perfil='EST' and a.comunicacao
        else false end
    )
  )
$$;

create or replace function public.inspecoes_lev_acesso(p_org uuid,p_id uuid,p_editar boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.inspecoes_levantamentos l
    where l.organization_id=p_org and l.id=p_id
      and (not p_editar or l.estado='rascunho')
      and (
        (not p_editar and public.inspecoes_admin(p_org,auth.uid()))
        or exists (
          select 1 from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
          where (a.cliente_id is null or a.cliente_id=l.cliente_id)
            and (a.unidade_id is null or a.unidade_id=l.unidade_id)
            and (a.perfil='EST' or l.atribuido_a=auth.uid() or l.created_by=auth.uid()
              or (l.estado='emitido' and not p_editar))
        )
      )
  )
$$;

create or replace function public.inspecoes_acesso(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'perfil',a.perfil,'pessoa_id',a.pessoa_id,'nome',p.nome,
    'cliente_id',a.cliente_id,'unidade_id',a.unidade_id,'ensaios',a.ensaios,
    'biblioteca',a.biblioteca,'importacao',a.importacao,'comunicacao',a.comunicacao
  ) order by a.perfil,a.id),'[]'::jsonb)
  from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
  join public.pessoas p on p.organization_id=a.organization_id and p.id=a.pessoa_id
$$;

alter policy inspecoes_registros_leitura on public.inspecoes_registros using(
  public.inspecoes_pode(organization_id,cliente_id,unidade_id)
  and (colecao<>'registro' or public.inspecoes_pode(organization_id,null,null,'importar')
    or public.inspecoes_pode(organization_id,null,null,'gerir_acervo'))
);
alter policy inspecoes_arquivos_leitura on public.inspecoes_arquivos using(
  (levantamento_id is not null and public.inspecoes_lev_acesso(organization_id,levantamento_id))
  or (registro_id is not null and public.inspecoes_pode(organization_id,cliente_id,unidade_id)
    and (papel not in ('modelo','piloto') or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'est')
      or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'gerir_acervo')))
);

create table public.inspecoes_acesso_eventos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  atribuicao_id uuid not null,
  acao text not null check (acao in ('designada','revogada')),
  motivo text not null check (length(trim(motivo)) between 5 and 2000),
  antes jsonb,
  depois jsonb not null,
  autor_id uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique(organization_id,atribuicao_id,acao)
);
create index inspecoes_acesso_eventos_usuario on public.inspecoes_acesso_eventos(organization_id,user_id,criado_em desc,id);
alter table public.inspecoes_acesso_eventos enable row level security;
revoke all on public.inspecoes_acesso_eventos from public,anon,authenticated,service_role;
create trigger inspecoes_acesso_eventos_imutaveis before update or delete on public.inspecoes_acesso_eventos
  for each row execute function public.inspecoes_historico_imutavel();

create function public.inspecoes_acessos_listar(p_org uuid,p_busca text,p_pagina integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.inspecoes_admin(p_org,auth.uid()) then
    raise exception 'Somente administradores da organização podem consultar as atribuições.' using errcode='42501';
  end if;
  if not coalesce(p_pagina between 0 and 10000,false) or length(coalesce(p_busca,''))>100 then
    raise exception 'Busca de membros inválida.' using errcode='22023';
  end if;
  return (
    with membros as materialized (
      select m.user_id,coalesce(p.nome,m.nome,m.email,m.user_id::text) as nome,m.email,
        p.id as pessoa_id,coalesce(length(trim(p.registro_profissional))>=3,false) as tem_registro
      from public.memberships m
      left join public.pessoas p on p.organization_id=m.organization_id and p.user_id=m.user_id and p.ativa
      where m.organization_id=p_org and (coalesce(trim(p_busca),'')='' or
        strpos(lower(concat_ws(' ',p.nome,m.nome,m.email)),lower(trim(p_busca)))>0)
    ), pagina as (
      select * from membros order by nome,user_id limit 20 offset p_pagina*20
    )
    select jsonb_build_object('total',(select count(*) from membros),'membros',coalesce((
      select jsonb_agg(to_jsonb(m)||jsonb_build_object(
        'qualificacoes',coalesce((
          select jsonb_agg(jsonb_build_object('id',q.id,'nome',c.nome,'validade',q.validade,
            'perfis_para_associar',coalesce((select jsonb_agg(v.perfil order by v.perfil)
              from (values ('EST'),('TST')) v(perfil) where public.inspecoes_competencia_apta(p_org,q.id,v.perfil)),'[]'::jsonb),
            'perfis',coalesce((select jsonb_agg(pc.perfil order by pc.perfil)
              from public.inspecoes_perfis_competencias pc where pc.organization_id=p_org and pc.competencia_id=c.id),'[]'::jsonb))
            order by c.nome,q.id)
          from public.pessoa_qualificacoes q
          join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id
          where q.organization_id=p_org and q.pessoa_id=m.pessoa_id and c.ativa and q.estado='validada'
            and q.conferido_por is not null and q.conferido_por<>m.user_id and q.conferido_em is not null
            and q.conclusao<=hoje and (q.validade>=hoje or (q.validade is null and not c.exige_validade))
        ),'[]'::jsonb),
        'atribuicoes',coalesce((
          select jsonb_agg(jsonb_build_object('id',a.id,'perfil',a.perfil,'cliente_id',a.cliente_id,
            'unidade_id',a.unidade_id,'designacao',a.designacao,'inicio',a.inicio,'fim',a.fim,
            'concedido_em',a.concedido_em,'revogada_em',a.revogada_em,
            'valida',exists(select 1 from public.inspecoes_atribuicoes_validas(p_org,m.user_id) v where v.id=a.id))
            order by a.concedido_em desc,a.id)
          from (select * from public.inspecoes_atribuicoes where organization_id=p_org and user_id=m.user_id
            order by concedido_em desc,id limit 100) a
        ),'[]'::jsonb)
      ) order by m.nome,m.user_id) from pagina m
    ),'[]'::jsonb))
  );
end
$$;

create function public.inspecoes_acessos_historico(p_org uuid,p_usuario uuid,p_pagina integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.inspecoes_admin(p_org,auth.uid()) then
    raise exception 'Somente administradores da organização podem consultar o histórico de acesso.' using errcode='42501';
  end if;
  if not coalesce(p_pagina between 0 and 10000,false) then
    raise exception 'Página de histórico inválida.' using errcode='22023';
  end if;
  return (
    with eventos as materialized (
      select e.id,e.acao,e.motivo,e.criado_em,e.autor_id,e.depois->>'perfil' as perfil,
        coalesce(p.nome,m.nome,m.email,e.autor_id::text) as autor
      from public.inspecoes_acesso_eventos e
      left join public.memberships m on m.organization_id=e.organization_id and m.user_id=e.autor_id
      left join public.pessoas p on p.organization_id=e.organization_id and p.user_id=e.autor_id
      where e.organization_id=p_org and e.user_id=p_usuario
    ), pagina as (
      select * from eventos order by criado_em desc,id limit 20 offset p_pagina*20
    )
    select jsonb_build_object('total',(select count(*) from eventos),'eventos',
      coalesce((select jsonb_agg(to_jsonb(p) order by p.criado_em desc,p.id) from pagina p),'[]'::jsonb))
  );
end
$$;

create function public.inspecoes_acessos_executar(p_org uuid,p_chave uuid,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  acao text:=p_dados->>'acao';
  motivo text:=trim(p_dados->>'motivo');
  usuario uuid:=(p_dados->>'user_id')::uuid;
  perfil_alvo text:=p_dados->>'perfil';
  cliente uuid:=(p_dados->>'cliente_id')::uuid;
  unidade uuid:=(p_dados->>'unidade_id')::uuid;
  hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
  inicio_alvo date:=coalesce((p_dados->>'inicio')::date,hoje);
  fim_alvo date:=(p_dados->>'fim')::date;
  vincular_competencia boolean:=coalesce((p_dados->>'vincular_competencia')::boolean,false);
  q public.pessoa_qualificacoes;
  a public.inspecoes_atribuicoes;
  antes jsonb;
  retorno jsonb;
begin
  perform public.lev_travar_autor(p_org,actor);
  if not public.inspecoes_admin(p_org,actor) then
    raise exception 'Somente administradores da organização podem alterar atribuições.' using errcode='42501';
  end if;
  if p_chave is null or acao is null or acao not in ('designar','revogar') or not coalesce(length(motivo) between 5 and 2000,false) then
    raise exception 'Informe a ação e o motivo da atribuição.' using errcode='23514';
  end if;
  retorno:=public.operacao_repetir(p_org,p_chave,'inspecoes_acessos',p_dados);
  if retorno is not null then return retorno; end if;

  if acao='designar' then
    perform public.ag_payload(p_dados,array['acao','motivo','user_id','qualificacao_id','perfil','cliente_id','unidade_id',
      'inicio','fim','vincular_competencia','ensaios','biblioteca','importacao']);
    if perfil_alvo is null or perfil_alvo not in ('EST','TST') or inicio_alvo<hoje
      or (fim_alvo is not null and fim_alvo<inicio_alvo) or (unidade is not null and cliente is null)
      or (perfil_alvo='TST' and (coalesce((p_dados->>'biblioteca')::boolean,false)
        or coalesce((p_dados->>'importacao')::boolean,false))) then
      raise exception 'Perfil, contexto, vigência ou capacidade inválida.' using errcode='23514';
    end if;
    if cliente is not null and not exists (
      select 1 from public.inspecoes_contextos i
      join public.clientes c on c.organization_id=i.organization_id and c.id=i.cliente_id
      join public.unidades u on u.organization_id=i.organization_id and u.cliente_id=i.cliente_id and u.id=i.unidade_id
      where i.organization_id=p_org and i.cliente_id=cliente and (unidade is null or i.unidade_id=unidade)
        and c.arquivado_em is null and u.arquivado_em is null
    ) then
      raise exception 'Cliente ou unidade indisponível para atribuição de Inspeções.' using errcode='23503';
    end if;
    select q0.* into q from public.pessoa_qualificacoes q0
      join public.pessoas p on p.organization_id=q0.organization_id and p.id=q0.pessoa_id
      join public.memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
      join public.competencias c on c.organization_id=q0.organization_id and c.id=q0.competencia_id
      where q0.organization_id=p_org and q0.id=(p_dados->>'qualificacao_id')::uuid and p.user_id=usuario
        and p.ativa and c.ativa and q0.estado='validada' and q0.conclusao<=hoje
        and q0.conferido_por is not null and q0.conferido_por<>usuario and q0.conferido_em is not null
        and (q0.validade>=inicio_alvo or (q0.validade is null and not c.exige_validade))
        and (perfil_alvo<>'EST' or length(trim(p.registro_profissional))>=3)
      for share of q0,p,m,c;
    if not found then
      raise exception 'Use uma qualificação vigente, conferida por outra pessoa, e registro profissional para EST.' using errcode='23514';
    end if;
    if not exists (select 1 from public.inspecoes_perfis_competencias pc
      where pc.organization_id=p_org and pc.perfil=perfil_alvo and pc.competencia_id=q.competencia_id) then
      if not vincular_competencia then
        raise exception 'Confirme a associação da competência ao perfil.' using errcode='23514';
      end if;
      if not public.inspecoes_competencia_apta(p_org,q.id,perfil_alvo) then
        raise exception 'A associação exige qualificação específica do perfil, evidência vinculada e conferência independente.' using errcode='42501';
      end if;
      insert into public.inspecoes_perfis_competencias(organization_id,perfil,competencia_id)
      values(p_org,perfil_alvo,q.competencia_id);
    else
      vincular_competencia:=false;
    end if;
    if exists(select 1 from public.inspecoes_atribuicoes x where x.organization_id=p_org and x.user_id=usuario
      and x.perfil=perfil_alvo and x.cliente_id is not distinct from cliente and x.unidade_id is not distinct from unidade
      and x.revogada_em is null and daterange(x.inicio,x.fim,'[]') && daterange(inicio_alvo,fim_alvo,'[]')) then
      raise exception 'Já existe atribuição deste perfil para este período e contexto.' using errcode='23505';
    end if;
    insert into public.inspecoes_atribuicoes(organization_id,user_id,pessoa_id,qualificacao_id,perfil,cliente_id,unidade_id,
      inicio,fim,designacao,ensaios,biblioteca,importacao,concedido_por)
    values(p_org,usuario,q.pessoa_id,q.id,perfil_alvo,cliente,unidade,inicio_alvo,fim_alvo,motivo,
      coalesce((p_dados->>'ensaios')::boolean,false),coalesce((p_dados->>'biblioteca')::boolean,false),
      coalesce((p_dados->>'importacao')::boolean,false),actor) returning * into a;
  else
    perform public.ag_payload(p_dados,array['acao','motivo','atribuicao_id']);
    select * into a from public.inspecoes_atribuicoes where organization_id=p_org and id=(p_dados->>'atribuicao_id')::uuid for update;
    if not found then raise exception 'Atribuição indisponível nesta organização.' using errcode='42501'; end if;
    if a.revogada_em is not null then raise exception 'A atribuição já foi revogada.' using errcode='23514'; end if;
    antes:=to_jsonb(a);
    update public.inspecoes_atribuicoes set revogada_em=now() where id=a.id returning * into a;
  end if;

  insert into public.inspecoes_acesso_eventos(organization_id,user_id,atribuicao_id,acao,motivo,antes,depois,autor_id)
  values(p_org,a.user_id,a.id,case when acao='designar' then 'designada' else 'revogada' end,motivo,antes,
    to_jsonb(a)||case when acao='designar' then jsonb_build_object('competencia_id',q.competencia_id,
      'qualificacao_conferida_por',q.conferido_por,'qualificacao_conferida_em',q.conferido_em,
      'competencia_associada',vincular_competencia) else '{}'::jsonb end,actor);
  retorno:=jsonb_build_object('id',a.id,'user_id',a.user_id,'acao',acao);
  return public.operacao_concluir(p_org,p_chave,'inspecoes_acessos',p_dados,retorno);
end
$$;

revoke all on function public.inspecoes_acessos_listar(uuid,text,integer),public.inspecoes_acessos_executar(uuid,uuid,jsonb),
  public.inspecoes_acessos_historico(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_acessos_listar(uuid,text,integer),public.inspecoes_acessos_executar(uuid,uuid,jsonb),
  public.inspecoes_acessos_historico(uuid,uuid,integer) to authenticated;
-- Cadastro de identidade, pontos e componentes não atribui parecer nem habilita ensaio.
create or replace function public.inspecoes_ativo_criar(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_chave uuid,p_dados jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_registros;
  tag text:=public.inspecoes_normalizar_tag(p_dados->>'tag');
  familia_codigo text:=p_dados->>'familia';
  c jsonb;
  p jsonb;
  codigo text;
  componente uuid;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if not (public.inspecoes_pode(p_org,p_cliente,p_unidade,'est')
    or public.inspecoes_pode(p_org,p_cliente,p_unidade,'gerir_acervo')) then
    raise exception 'Cadastro exige administração de Inspeções ou atribuição EST para a unidade.' using errcode='42501';
  end if;
  perform 1 from public.inspecoes_contextos i
    join public.clientes c on c.organization_id=i.organization_id and c.id=i.cliente_id
    join public.unidades u on u.organization_id=i.organization_id and u.cliente_id=i.cliente_id and u.id=i.unidade_id
    where i.organization_id=p_org and i.cliente_id=p_cliente and i.unidade_id=p_unidade
      and c.arquivado_em is null and u.arquivado_em is null for share of c,u;
  if not found then raise exception 'Unidade sem contexto operacional de Inspeções.' using errcode='23514'; end if;
  perform public.ag_payload(p_dados,array['tag','nome','familia','local','setor','componentes','pontos']);
  if p_chave is null or not coalesce(tag ~ '^[A-Z0-9-]{1,80}$',false)
    or not coalesce(length(trim(p_dados->>'nome')) between 2 and 240,false)
    or length(p_dados->>'local')>500 or length(p_dados->>'setor')>500
    or octet_length(p_dados::text)>60000
    or not exists(select 1 from public.inspecoes_registros where organization_id=p_org and colecao='familias' and inspecoes_registros.codigo=familia_codigo)
  then raise exception 'Informe TAG, nome e família cadastrada.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||':inspecoes:importacao',0));
  select * into a from public.inspecoes_registros where organization_id=p_org and colecao='ativos'
    and source_id='nexus-ativo:'||p_chave::text;
  if found then
    if a.unidade_id is distinct from p_unidade or a.snapshot->'cadastro' is distinct from p_dados
      or a.importado_por is distinct from auth.uid() then
      raise exception 'Chave de cadastro já usada em outra operação.' using errcode='23505';
    end if;
    return to_jsonb(a);
  end if;
  if exists(select 1 from public.inspecoes_registros r where r.organization_id=p_org and r.unidade_id=p_unidade
    and r.colecao='ativos' and r.vigente and r.existente and public.inspecoes_normalizar_tag(r.codigo)=tag)
  then raise exception 'Já existe ativo vigente com esta TAG na unidade.' using errcode='23505'; end if;
  if (p_dados ? 'componentes' and jsonb_typeof(p_dados->'componentes')<>'array')
    or (p_dados ? 'pontos' and jsonb_typeof(p_dados->'pontos')<>'array')
  then raise exception 'Componentes e pontos devem ser listas.' using errcode='23514'; end if;
  if jsonb_array_length(p_dados->'componentes')>100 or jsonb_array_length(p_dados->'pontos')>300 then
    raise exception 'Quantidade de componentes ou pontos acima do limite.' using errcode='23514';
  end if;
  insert into public.inspecoes_registros(organization_id,cliente_id,unidade_id,colecao,source_id,titulo,codigo,
    familia,situacao,snapshot,importado_por)
  values(p_org,p_cliente,p_unidade,'ativos','nexus-ativo:'||p_chave::text,trim(p_dados->>'nome'),tag,familia_codigo,'existente',
    jsonb_build_object('origem','nexus','cadastro',p_dados,'tag',tag,'descricao',trim(p_dados->>'nome'),
      'local',p_dados->>'local','setor',p_dados->>'setor','familia',familia_codigo,'situacao_sistema','existente'),
    auth.uid()) returning * into a;
  for c in select value from jsonb_array_elements(coalesce(p_dados->'componentes','[]')) loop
    perform public.ag_payload(c,array['codigo','nome']);
    codigo:=public.inspecoes_normalizar_tag(c->>'codigo');
    if not coalesce(codigo ~ '^[A-Z0-9-]{1,80}$',false) or not coalesce(length(trim(c->>'nome')) between 2 and 200,false)
    then raise exception 'Componente exige código e nome.' using errcode='23514'; end if;
    insert into public.inspecoes_componentes(organization_id,cliente_id,unidade_id,ativo_id,codigo,nome)
      values(p_org,p_cliente,p_unidade,a.id,codigo,trim(c->>'nome'));
  end loop;
  for p in select value from jsonb_array_elements(coalesce(p_dados->'pontos','[]')) loop
    perform public.ag_payload(p,array['codigo','nome','componente_codigo']);
    codigo:=public.inspecoes_normalizar_tag(p->>'codigo');
    if not coalesce(codigo ~ '^[A-Z0-9-]{1,80}$',false) or length(p->>'nome')>200 then
      raise exception 'Ponto exige código válido.' using errcode='23514';
    end if;
    componente:=null;
    if p ? 'componente_codigo' then
      select x.id into componente from public.inspecoes_componentes x
        where x.organization_id=p_org and x.ativo_id=a.id and x.codigo=public.inspecoes_normalizar_tag(p->>'componente_codigo');
      if componente is null then raise exception 'O componente do ponto não pertence ao ativo.' using errcode='23503'; end if;
    end if;
    insert into public.inspecoes_pontos(organization_id,cliente_id,unidade_id,ativo_id,componente_id,codigo,nome)
      values(p_org,p_cliente,p_unidade,a.id,componente,codigo,nullif(trim(p->>'nome'),''));
  end loop;
  return to_jsonb(a);
end
$$;

notify pgrst,'reload schema';
