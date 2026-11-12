-- A regra aprovada R64 usa datas civis. O vencimento e o parecer permanecem independentes.
create function public.inspecoes_r64_grupos(p_org uuid, p_hoje date)
returns table(
  id uuid, cliente_id uuid, unidade_id uuid, documento_id uuid, data_base date, vence date,
  aviso_em date, situacao text, ativos jsonb, versao text
)
language sql stable security invoker set search_path='' as $$
  with recursive documentos as (
    select d.id, d.unidade_id, d.snapshot
    from public.inspecoes_registros d
    where d.organization_id=p_org and d.colecao='documentos'
  ), caminho as (
    select d.id as inicial,d.id as atual,array[d.id] as visitados
    from documentos d
    union all
    select c.inicial,r.destino_id,c.visitados||r.destino_id
    from caminho c
    join public.inspecoes_relacoes r on r.organization_id=p_org and r.origem_id=c.atual and r.tipo='principal'
    join documentos d on d.id=r.destino_id
    where not r.destino_id=any(c.visitados)
  ), principal as (
    select distinct on (inicial) inicial,atual
    from caminho
    order by inicial, cardinality(visitados) desc, atual
  ), substituidos as (
    select r.origem_id from public.inspecoes_relacoes r
    where r.organization_id=p_org and r.tipo='substituido_por'
  ), candidatos as (
    select a.destino_id as ativo_id, i.id as inspecao_id, p.atual as documento_id, d.destino_id as documento_origem,
      i.data_ref, coalesce(nullif(i.snapshot->>'data_precisao',''),'dia') as precisao,
      i.snapshot->>'resultado' as resultado, false as operacional
    from public.inspecoes_registros i
    join public.inspecoes_relacoes a on a.organization_id=i.organization_id and a.origem_id=i.id and a.tipo='ativo'
    left join public.inspecoes_relacoes d on d.organization_id=i.organization_id and d.origem_id=i.id and d.tipo='documento'
    left join principal p on p.inicial=d.destino_id
    where i.organization_id=p_org and i.colecao='inspecoes' and i.data_ref is not null
      and i.snapshot->>'tipo_inspecao' in ('T1','T2','T4')
      and coalesce(i.snapshot->>'cancelado','false')<>'true'
    union all
    select l.ativo_id,l.id,e.documento_id,e.documento_id,l.data_inspecao,'dia',l.parecer_est,true
    from public.inspecoes_levantamentos l
    join public.inspecoes_emissoes e on e.organization_id=l.organization_id and e.levantamento_id=l.id
    where l.organization_id=p_org and l.estado='emitido' and l.tipo in ('T1','T2','T4')
      and l.data_inspecao is not null and l.parecer_est is not null
  ), ultimas as (
    select distinct on (c.ativo_id) c.*
    from candidatos c
    order by c.ativo_id,c.data_ref desc,c.operacional desc,c.inspecao_id
  ), elegiveis as (
    select u.*,a.cliente_id,a.unidade_id,a.codigo as tag,a.familia,
      case when u.operacional then u.resultado else nullif(a.snapshot->>'resultado','') end as resultado_atual,
      (u.data_ref + interval '12 months')::date as vencimento
    from ultimas u
    join public.inspecoes_registros a on a.organization_id=p_org and a.id=u.ativo_id and a.colecao='ativos'
    where a.vigente and a.existente and coalesce(a.snapshot->>'cancelado','false')<>'true'
      and not exists(select 1 from substituidos s where s.origem_id in (u.documento_id,u.documento_origem))
  ), grupos as (
    select e.cliente_id,e.unidade_id,e.documento_id,min(e.data_ref) as data_base,min(e.vencimento) as vence,
      jsonb_agg(jsonb_build_object(
        'ativo_id',e.ativo_id,'inspecao_id',e.inspecao_id,'tag',e.tag,'familia',e.familia,
        'data_base',e.data_ref,'data_precisao',e.precisao,'vence',e.vencimento,'resultado',e.resultado_atual,
        'sem_validade',coalesce(e.resultado_atual='nao_apto',false)
      ) order by e.vencimento,e.tag,e.ativo_id) as ativos
    from elegiveis e group by e.cliente_id,e.unidade_id,e.documento_id
  ), d3 as (
    select coalesce((
      select (r.snapshot->>'valor')::integer
      from public.inspecoes_registros r
      where r.organization_id=p_org and r.colecao='parametros' and r.codigo='D3'
        and r.situacao='definido' and r.snapshot->>'valor' ~ '^[0-9]{1,3}$'
      order by r.id limit 1
    ),90) as dias
  )
  select md5(p_org::text||'|'||g.unidade_id::text||'|'||coalesce(g.documento_id::text,'sem-documento'))::uuid,
    g.cliente_id,g.unidade_id,g.documento_id,g.data_base,g.vence,g.vence-d3.dias,
    case when p_hoje>g.vence then 'vencido' when p_hoje>=g.vence-d3.dias then 'em_aviso' else 'em_dia' end,
    g.ativos,'R64-2026-10-31-v1'
  from grupos g cross join d3
$$;

create table public.inspecoes_r64_ciclos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  grupo_id uuid not null,
  documento_id uuid,
  vence date not null,
  aviso_em date not null,
  situacao text not null check(situacao in ('em_aviso','vencido','encerrado')),
  versao text not null,
  entradas jsonb not null check(jsonb_typeof(entradas)='array'),
  justificativa text not null,
  aberto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  unique(organization_id,grupo_id,vence),
  foreign key(organization_id,cliente_id,unidade_id) references public.inspecoes_contextos
);
alter table public.inspecoes_r64_ciclos enable row level security;
revoke all on public.inspecoes_r64_ciclos from public,anon,authenticated,service_role;
grant select on public.inspecoes_r64_ciclos to authenticated;
create policy inspecoes_r64_ciclos_ler on public.inspecoes_r64_ciclos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));

create function public.inspecoes_r64_recalcular(p_org uuid,p_hoje date default (now() at time zone 'America/Sao_Paulo')::date)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('inspecoes:r64:'||p_org::text,0));

  insert into public.inspecoes_r64_ciclos
    (organization_id,cliente_id,unidade_id,grupo_id,documento_id,vence,aviso_em,situacao,versao,entradas,justificativa)
  select p_org,g.cliente_id,g.unidade_id,g.id,g.documento_id,g.vence,g.aviso_em,g.situacao,g.versao,g.ativos,
    'Primeiro vencimento dos ativos do grupo: última inspeção elegível mais 12 meses de calendário; antecedência D3.'
  from public.inspecoes_r64_grupos(p_org,p_hoje) g
  where g.situacao in ('em_aviso','vencido')
  on conflict (organization_id,grupo_id,vence) do update
    set situacao=excluded.situacao,atualizado_em=now(),aviso_em=excluded.aviso_em,versao=excluded.versao,
        entradas=excluded.entradas,justificativa=excluded.justificativa,encerrado_em=null
    where (inspecoes_r64_ciclos.situacao,inspecoes_r64_ciclos.aviso_em,inspecoes_r64_ciclos.versao,inspecoes_r64_ciclos.entradas)
      is distinct from (excluded.situacao,excluded.aviso_em,excluded.versao,excluded.entradas);

  update public.inspecoes_r64_ciclos c set situacao='encerrado',atualizado_em=now(),encerrado_em=now(),
    justificativa='O grupo deixou de estar na janela D3 ou a base elegível do ciclo mudou.'
  where c.organization_id=p_org and c.situacao<>'encerrado'
    and not exists(select 1 from public.inspecoes_r64_grupos(p_org,p_hoje) g
      where g.id=c.grupo_id and g.vence=c.vence and g.situacao in ('em_aviso','vencido'));
end
$$;

create function public.inspecoes_r64_listar(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_estado text,p_busca text,p_offset integer,p_limite integer
) returns jsonb language sql stable security invoker set search_path='' as $$
  with filtrados as materialized (
    select g.*,
      coalesce(d.titulo, 'Reinspeção da unidade') as titulo, coalesce(d.codigo,l.codigo) as codigo
    from public.inspecoes_r64_grupos(p_org,(now() at time zone 'America/Sao_Paulo')::date) g
    left join public.inspecoes_registros d on d.organization_id=p_org and d.id=g.documento_id
    left join public.inspecoes_documentos l on l.organization_id=p_org and l.id=g.documento_id
    where (p_cliente is null or g.cliente_id=p_cliente) and (p_unidade is null or g.unidade_id=p_unidade)
      and (p_estado is null or p_estado='todos' or p_estado=g.situacao)
      and (coalesce(p_busca,'')='' or strpos(lower(concat_ws(' ',d.titulo,d.codigo,l.codigo)),lower(p_busca))>0)
  ), pagina as (
    select f.* from filtrados f order by f.vence,f.id
    limit greatest(1,least(coalesce(p_limite,24),100)) offset greatest(0,coalesce(p_offset,0))
  )
  select jsonb_build_object(
    'total',(select count(*) from filtrados),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'cliente_id',p.cliente_id,'unidade_id',p.unidade_id,'colecao','vencimentos',
      'source_id',p.id::text,'titulo',p.titulo,'codigo',p.codigo,'familia',null,'situacao',p.situacao,
      'data_ref',p.vence,'vigente',true,'existente',true,
      'resumo',jsonb_build_object('aviso_em',p.aviso_em,'data_base',p.data_base,'documento_id',p.documento_id,
        'n_ativos',jsonb_array_length(p.ativos),'versao',p.versao)
    ) order by p.vence,p.id),'[]'::jsonb)
  ) from pagina p
$$;

create function public.inspecoes_r64_apos_emissao() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.inspecoes_r64_recalcular(new.organization_id);
  return new;
end
$$;
create trigger inspecoes_r64_emissao after update of estado on public.inspecoes_levantamentos
  for each row when (new.estado='emitido' and old.estado is distinct from new.estado)
  execute function public.inspecoes_r64_apos_emissao();

revoke all on function public.inspecoes_r64_grupos(uuid,date),public.inspecoes_r64_recalcular(uuid,date),
  public.inspecoes_r64_listar(uuid,uuid,uuid,text,text,integer,integer),public.inspecoes_r64_apos_emissao()
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_r64_grupos(uuid,date),
  public.inspecoes_r64_listar(uuid,uuid,uuid,text,text,integer,integer) to authenticated;
grant execute on function public.inspecoes_r64_recalcular(uuid,date) to service_role;

-- A consulta é atual mesmo em ambientes de teste que não tenham o agendador.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('nexus-inspecoes-r64','17 * * * *',
      'select public.inspecoes_r64_recalcular(x.organization_id) from (select distinct organization_id from public.inspecoes_contextos) x');
  end if;
end
$$;

-- Projeta prazo por registro sem expor detalhes de outros contextos.
create function public.inspecoes_r64_projecoes(p_org uuid,p_ids uuid[])
returns table(registro_id uuid,r64_status text,vence date)
language sql stable security invoker set search_path='' as $$
  with grupos as materialized (
    select g.* from public.inspecoes_r64_grupos(p_org,(now() at time zone 'America/Sao_Paulo')::date) g
  )
  select g.documento_id,g.situacao,g.vence from grupos g where g.documento_id=any(p_ids)
  union all
  select r.origem_id,g.situacao,g.vence from grupos g
    join public.inspecoes_relacoes r on r.organization_id=p_org and r.tipo='principal' and r.destino_id=g.documento_id
    where r.origem_id=any(p_ids)
  union all
  select (a->>'ativo_id')::uuid,g.situacao,g.vence
    from grupos g cross join lateral jsonb_array_elements(g.ativos) a
    where (a->>'ativo_id')::uuid=any(p_ids)
$$;
revoke all on function public.inspecoes_r64_projecoes(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_r64_projecoes(uuid,uuid[]) to authenticated;
