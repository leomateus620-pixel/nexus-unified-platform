-- Contratos e ciclos usam a identidade da proposta e da OS canônicas.
create table public.inspecoes_contratos_operacionais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  segmento text not null check (segmento in ('CC','AG-A','AG-B','IN')),
  titulo text not null check (length(trim(titulo)) between 3 and 200),
  referencia text check (length(trim(referencia)) between 3 and 200),
  proposta_id uuid,
  pacote_id uuid,
  inicio date,
  fim date,
  estado text not null default 'rascunho' check (estado in ('rascunho','vigente','cancelado')),
  version integer not null default 1 check (version>0),
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id),
  cancelamento_motivo text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id),
  foreign key (organization_id,cliente_id,proposta_id)
    references public.propostas(organization_id,cliente_id,id) on delete set null (proposta_id),
  foreign key (organization_id,pacote_id) references public.inspecoes_registros(organization_id,id),
  check (fim is null or inicio is null or fim>=inicio),
  check (estado<>'vigente' or inicio is not null),
  check (estado<>'cancelado' or (cancelado_em is not null and cancelado_por is not null and
    length(trim(cancelamento_motivo)) between 8 and 2000))
);
create index inspecoes_contratos_escopo on public.inspecoes_contratos_operacionais
  (organization_id,cliente_id,unidade_id,updated_at desc,id);

create table public.inspecoes_ciclos_atendimento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  contrato_id uuid not null,
  os_id uuid,
  titulo text not null check (length(trim(titulo)) between 3 and 200),
  recorte text not null check (length(trim(recorte)) between 2 and 200),
  janela_inicio date,
  janela_fim date,
  detalhes text not null default '' check (length(detalhes)<=2000),
  version integer not null default 1 check (version>0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,contrato_id)
    references public.inspecoes_contratos_operacionais(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,os_id)
    references public.ordens_servico(organization_id,cliente_id,unidade_id,id),
  check (janela_fim is null or janela_inicio is null or janela_fim>=janela_inicio)
);
create unique index inspecoes_ciclo_os_unica on public.inspecoes_ciclos_atendimento(organization_id,os_id)
  where os_id is not null;
create index inspecoes_ciclos_contrato on public.inspecoes_ciclos_atendimento
  (organization_id,contrato_id,created_at desc,id);

create table public.inspecoes_continuidade_eventos (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  contrato_id uuid not null,
  ciclo_id uuid,
  evento text not null check (evento in ('criar_contrato','editar_contrato','ativar_contrato',
    'cancelar_contrato','planejar_ciclo','vincular_os')),
  autor_id uuid not null references auth.users(id),
  ocorrido_em timestamptz not null default now(),
  dados jsonb not null check (jsonb_typeof(dados)='object'),
  foreign key (organization_id,cliente_id,unidade_id,contrato_id)
    references public.inspecoes_contratos_operacionais(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,ciclo_id)
    references public.inspecoes_ciclos_atendimento(organization_id,cliente_id,unidade_id,id)
);
create trigger inspecoes_continuidade_evento_imutavel before update or delete on public.inspecoes_continuidade_eventos
  for each row execute function public.inspecoes_historico_imutavel();

alter table public.inspecoes_contratos_operacionais enable row level security;
alter table public.inspecoes_ciclos_atendimento enable row level security;
alter table public.inspecoes_continuidade_eventos enable row level security;
revoke all on public.inspecoes_contratos_operacionais,public.inspecoes_ciclos_atendimento,
  public.inspecoes_continuidade_eventos from public,anon,authenticated,service_role;

create function public.inspecoes_continuidade_consultar(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_pagina integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_segmento text;
  v_limite constant integer := 10;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_cliente is null or p_unidade is null or not public.inspecoes_pode(p_org,p_cliente,p_unidade,'consultar') then
    raise exception 'Contexto de Inspeções indisponível.' using errcode='42501';
  end if;
  select segmento into v_segmento from public.inspecoes_contextos
  where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade;
  if not found then raise exception 'Contexto de Inspeções indisponível.' using errcode='42501'; end if;
  if p_pagina is null or p_pagina not between 0 and 10000 then
    raise exception 'Página inválida.' using errcode='22023';
  end if;
  return (
    with contratos as (
      select c.* from public.inspecoes_contratos_operacionais c
      where c.organization_id=p_org and c.cliente_id=p_cliente and c.unidade_id=p_unidade
    ), pagina as (
      select * from contratos order by updated_at desc,id offset p_pagina*v_limite limit v_limite
    )
    select jsonb_build_object('segmento',v_segmento,'total',(select count(*) from contratos),'limite',v_limite,
      'contratos',coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'titulo',c.titulo,'referencia',c.referencia,'segmento',c.segmento,'estado',c.estado,'version',c.version,
        'inicio',c.inicio,'fim',c.fim,'cancelado_em',c.cancelado_em,'cancelamento_motivo',c.cancelamento_motivo,
        'situacao_prazo',case when c.estado<>'vigente' then null when c.inicio>v_hoje then 'a_iniciar'
          when c.fim is null then 'sem_prazo' when c.fim<v_hoje then 'vencido'
          when c.fim<=v_hoje+60 then 'em_aviso' else 'em_dia' end,
        'proposta',(select jsonb_build_object('id',p.id,'numero',p.numero,'titulo',p.titulo) from public.propostas p
          where p.organization_id=p_org and p.cliente_id=p_cliente and p.unidade_id=p_unidade and p.id=c.proposta_id
            and public.is_member(p_org)),
        'pacote',(select jsonb_build_object('id',p.id,'codigo',p.codigo,'titulo',p.titulo)
          from public.inspecoes_registros p where p.organization_id=p_org and p.id=c.pacote_id and p.colecao='pacotes')
      ) order by c.updated_at desc,c.id) from pagina c),'[]'::jsonb))
  );
end
$$;

create function public.inspecoes_ciclos_consultar(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_contrato uuid,p_pagina integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limite constant integer := 10;
begin
  if p_cliente is null or p_unidade is null or not public.inspecoes_pode(p_org,p_cliente,p_unidade,'consultar')
    or not exists(select 1 from public.inspecoes_contratos_operacionais c where c.organization_id=p_org
      and c.cliente_id=p_cliente and c.unidade_id=p_unidade and c.id=p_contrato) then
    raise exception 'Contrato indisponível neste contexto.' using errcode='42501';
  end if;
  if p_pagina is null or p_pagina not between 0 and 10000 then
    raise exception 'Página inválida.' using errcode='22023';
  end if;
  return (
    with ciclos as (
      select c.* from public.inspecoes_ciclos_atendimento c where c.organization_id=p_org
        and c.cliente_id=p_cliente and c.unidade_id=p_unidade and c.contrato_id=p_contrato
    ), pagina as (
      select * from ciclos order by created_at desc,id offset p_pagina*v_limite limit v_limite
    )
    select jsonb_build_object('total',(select count(*) from ciclos),'limite',v_limite,
      'ciclos',coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'titulo',c.titulo,'recorte',c.recorte,'janela_inicio',c.janela_inicio,'janela_fim',c.janela_fim,
        'detalhes',c.detalhes,'version',c.version,'tem_ordem',c.os_id is not null,
        'ordem',(select jsonb_build_object('id',o.id,'numero',o.numero,'titulo',o.titulo,'estado',o.estado)
          from public.ordens_servico o where o.organization_id=p_org and o.cliente_id=p_cliente
            and o.unidade_id=p_unidade and o.id=c.os_id and public.os_ler(p_org,o.id))
      ) order by c.created_at desc,c.id) from pagina c),'[]'::jsonb))
  );
end
$$;

create function public.inspecoes_continuidade_comando(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_chave uuid,p_dados jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_contrato public.inspecoes_contratos_operacionais;
  v_ciclo public.inspecoes_ciclos_atendimento;
  v_segmento text;
  v_acao text := p_dados->>'acao';
  v_proposta uuid;
  v_pacote uuid;
  v_os uuid;
  v_motivo text;
  v_pedido jsonb := jsonb_build_object('cliente_id',p_cliente,'unidade_id',p_unidade,'comando',p_dados);
  v_resultado jsonb;
begin
  if p_cliente is null or p_unidade is null or not public.inspecoes_pode(p_org,p_cliente,p_unidade,'est') then
    raise exception 'Continuidade exige atribuição EST neste contexto.' using errcode='42501';
  end if;
  if p_chave is null or jsonb_typeof(p_dados) is distinct from 'object' or length(p_dados::text)>10000
    or v_acao is null or v_acao not in ('criar_contrato','editar_contrato','ativar_contrato',
      'cancelar_contrato','planejar_ciclo','vincular_os') then
    raise exception 'Comando de continuidade inválido.' using errcode='22023';
  end if;
  v_resultado:=public.operacao_repetir(p_org,p_chave,'inspecoes_continuidade',v_pedido);
  if v_resultado is not null then return v_resultado; end if;
  select segmento into v_segmento from public.inspecoes_contextos
    where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade;
  if not found then raise exception 'Contexto de Inspeções indisponível.' using errcode='42501'; end if;
  if v_segmento is null then raise exception 'Defina o segmento da unidade antes de planejar.' using errcode='23514'; end if;
  if v_acao<>'criar_contrato' then
    select * into v_contrato from public.inspecoes_contratos_operacionais where organization_id=p_org
      and cliente_id=p_cliente and unidade_id=p_unidade and id=(p_dados->>'contrato_id')::uuid for update;
    if not found then raise exception 'Contrato indisponível neste contexto.' using errcode='42501'; end if;
    if v_contrato.estado='cancelado' then
      raise exception 'O contrato está cancelado. Consulte seu histórico.' using errcode='23514';
    end if;
    if v_contrato.version is distinct from (p_dados->>'version')::integer then
      raise exception 'Contrato alterado por outra pessoa. Atualize a consulta e compare os dados.' using errcode='40001';
    end if;
  end if;
  if v_acao in ('criar_contrato','editar_contrato') then
    v_proposta:=(p_dados->>'proposta_id')::uuid;
    v_pacote:=(p_dados->>'pacote_id')::uuid;
    if v_proposta is not null and not exists(select 1 from public.propostas p where p.organization_id=p_org
      and p.cliente_id=p_cliente and p.unidade_id=p_unidade and p.id=v_proposta and public.is_member(p_org)) then
      raise exception 'Proposta indisponível para esta unidade.' using errcode='42501';
    end if;
    if v_pacote is not null and not exists(select 1 from public.inspecoes_registros p where p.organization_id=p_org
      and p.id=v_pacote and p.colecao='pacotes') then
      raise exception 'Pacote indisponível.' using errcode='42501';
    end if;
    if v_acao='criar_contrato' then
      insert into public.inspecoes_contratos_operacionais(organization_id,cliente_id,unidade_id,segmento,titulo,
        referencia,proposta_id,pacote_id,inicio,fim,created_by)
      values(p_org,p_cliente,p_unidade,v_segmento,trim(p_dados->>'titulo'),nullif(trim(p_dados->>'referencia'),''),
        v_proposta,v_pacote,(p_dados->>'inicio')::date,(p_dados->>'fim')::date,auth.uid()) returning * into v_contrato;
    else
      if v_contrato.estado<>'rascunho' then
        raise exception 'O contrato vigente exige nova formalização para alterar os termos.' using errcode='23514';
      end if;
      update public.inspecoes_contratos_operacionais set titulo=trim(p_dados->>'titulo'),
        referencia=nullif(trim(p_dados->>'referencia'),''),proposta_id=v_proposta,pacote_id=v_pacote,
        inicio=(p_dados->>'inicio')::date,fim=(p_dados->>'fim')::date,version=version+1,updated_at=now()
      where id=v_contrato.id returning * into v_contrato;
    end if;
  elsif v_acao='ativar_contrato' then
    if v_contrato.estado<>'rascunho' or v_contrato.inicio is null then
      raise exception 'A vigência exige contrato em rascunho com data de início.' using errcode='23514';
    end if;
    if v_contrato.referencia is null and not exists(
      select 1 from public.propostas p join public.proposta_revisoes r on r.organization_id=p.organization_id
        and r.proposta_id=p.id and r.id=p.revisao_corrente_id and r.status='aceita'
      where p.organization_id=p_org and p.cliente_id=p_cliente and p.unidade_id=p_unidade and p.id=v_contrato.proposta_id
    ) then raise exception 'Informe a referência do contrato ou vincule uma proposta aceita.' using errcode='23514'; end if;
    update public.inspecoes_contratos_operacionais set estado='vigente',version=version+1,updated_at=now()
    where id=v_contrato.id returning * into v_contrato;
  elsif v_acao='cancelar_contrato' then
    v_motivo:=trim(p_dados->>'motivo');
    if length(coalesce(v_motivo,'')) not between 8 and 2000 then
      raise exception 'Descreva o motivo do cancelamento.' using errcode='23514';
    end if;
    update public.inspecoes_contratos_operacionais set estado='cancelado',cancelado_em=now(),cancelado_por=auth.uid(),
      cancelamento_motivo=v_motivo,version=version+1,updated_at=now() where id=v_contrato.id returning * into v_contrato;
  else
    v_os:=(p_dados->>'os_id')::uuid;
    if v_os is not null then
      perform 1 from public.ordens_servico o where o.organization_id=p_org and o.cliente_id=p_cliente
        and o.unidade_id=p_unidade and o.id=v_os and o.estado<>'cancelada' and public.os_ler(p_org,o.id) for share;
      if not found then raise exception 'OS indisponível para esta unidade.' using errcode='42501'; end if;
    end if;
    if v_acao='planejar_ciclo' then
      insert into public.inspecoes_ciclos_atendimento(organization_id,cliente_id,unidade_id,contrato_id,os_id,
        titulo,recorte,janela_inicio,janela_fim,detalhes,created_by)
      values(p_org,p_cliente,p_unidade,v_contrato.id,v_os,trim(p_dados->>'titulo'),trim(p_dados->>'recorte'),
        (p_dados->>'janela_inicio')::date,(p_dados->>'janela_fim')::date,coalesce(p_dados->>'detalhes',''),auth.uid())
      returning * into v_ciclo;
    else
      select * into v_ciclo from public.inspecoes_ciclos_atendimento where organization_id=p_org and cliente_id=p_cliente
        and unidade_id=p_unidade and contrato_id=v_contrato.id and id=(p_dados->>'ciclo_id')::uuid for update;
      if not found then raise exception 'Ciclo indisponível neste contrato.' using errcode='42501'; end if;
      if v_ciclo.version is distinct from (p_dados->>'ciclo_version')::integer then
        raise exception 'Ciclo alterado. Atualize a consulta antes de vincular a OS.' using errcode='40001';
      end if;
      if v_os is null or v_ciclo.os_id is not null then
        raise exception 'Selecione uma OS para um ciclo ainda sem vínculo.' using errcode='23514';
      end if;
      update public.inspecoes_ciclos_atendimento set os_id=v_os,version=version+1,updated_at=now()
      where id=v_ciclo.id returning * into v_ciclo;
    end if;
  end if;
  insert into public.inspecoes_continuidade_eventos(organization_id,cliente_id,unidade_id,contrato_id,ciclo_id,
    evento,autor_id,dados)
  values(p_org,p_cliente,p_unidade,v_contrato.id,v_ciclo.id,v_acao,auth.uid(),p_dados);
  v_resultado:=jsonb_build_object('contrato_id',v_contrato.id,'ciclo_id',v_ciclo.id,'version',v_contrato.version);
  return public.operacao_concluir(p_org,p_chave,'inspecoes_continuidade',v_pedido,v_resultado);
end
$$;

revoke all on function public.inspecoes_continuidade_consultar(uuid,uuid,uuid,integer),
  public.inspecoes_ciclos_consultar(uuid,uuid,uuid,uuid,integer),
  public.inspecoes_continuidade_comando(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_continuidade_consultar(uuid,uuid,uuid,integer),
  public.inspecoes_ciclos_consultar(uuid,uuid,uuid,uuid,integer),
  public.inspecoes_continuidade_comando(uuid,uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
