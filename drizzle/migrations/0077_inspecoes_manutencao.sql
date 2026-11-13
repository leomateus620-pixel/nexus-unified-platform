-- A manutenção do acervo registra correções sem reescrever os snapshots de origem.
create table public.inspecoes_acervo_revisoes (
  organization_id uuid not null,
  registro_id uuid not null,
  versao integer not null check (versao > 0),
  autor_id uuid not null references auth.users(id),
  ocorrido_em timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) between 5 and 2000),
  antes jsonb,
  depois jsonb not null check (jsonb_typeof(depois)='object'),
  primary key (organization_id,registro_id,versao),
  foreign key (organization_id,registro_id) references public.inspecoes_registros(organization_id,id)
);
create table public.inspecoes_arquivo_apresentacoes (
  organization_id uuid not null,
  arquivo_id uuid not null references public.inspecoes_arquivos(id),
  versao integer not null check (versao > 0),
  autor_id uuid not null references auth.users(id),
  ocorrido_em timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) between 5 and 2000),
  antes jsonb not null,
  legenda text check (length(legenda)<=2000),
  ordem integer check (ordem between 0 and 100000),
  primary key (organization_id,arquivo_id,versao)
);
create table public.inspecoes_contexto_eventos (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  autor_id uuid not null references auth.users(id),
  ocorrido_em timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) between 5 and 2000),
  segmento text not null check (segmento in ('CC','AG-A','AG-B','IN')),
  foreign key (organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id)
);
create index inspecoes_contexto_eventos_escopo on public.inspecoes_contexto_eventos
  (organization_id,cliente_id,unidade_id,id desc);
create trigger inspecoes_acervo_revisao_imutavel before update or delete on public.inspecoes_acervo_revisoes
  for each row execute function public.inspecoes_historico_imutavel();
create trigger inspecoes_apresentacao_imutavel before update or delete on public.inspecoes_arquivo_apresentacoes
  for each row execute function public.inspecoes_historico_imutavel();
create trigger inspecoes_contexto_evento_imutavel before update or delete on public.inspecoes_contexto_eventos
  for each row execute function public.inspecoes_historico_imutavel();

alter table public.inspecoes_acervo_revisoes enable row level security;
alter table public.inspecoes_arquivo_apresentacoes enable row level security;
alter table public.inspecoes_contexto_eventos enable row level security;
revoke all on public.inspecoes_acervo_revisoes,public.inspecoes_arquivo_apresentacoes,
  public.inspecoes_contexto_eventos from public,anon,authenticated,service_role;
grant select on public.inspecoes_acervo_revisoes,public.inspecoes_arquivo_apresentacoes,
  public.inspecoes_contexto_eventos to authenticated;
create policy inspecoes_acervo_revisoes_ler on public.inspecoes_acervo_revisoes for select to authenticated
  using(exists(select 1 from public.inspecoes_registros r where r.organization_id=inspecoes_acervo_revisoes.organization_id
    and r.id=inspecoes_acervo_revisoes.registro_id));
create policy inspecoes_apresentacoes_ler on public.inspecoes_arquivo_apresentacoes for select to authenticated
  using(exists(select 1 from public.inspecoes_arquivos a where a.organization_id=inspecoes_arquivo_apresentacoes.organization_id
    and a.id=inspecoes_arquivo_apresentacoes.arquivo_id));
create policy inspecoes_contexto_eventos_ler on public.inspecoes_contexto_eventos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id,'consultar'));

create function public.inspecoes_ativar_unidade(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_segmento text,p_motivo text,p_chave uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; pedido jsonb:=jsonb_build_array(p_cliente,p_unidade,p_segmento,p_motivo);
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.inspecoes_pode(p_org,null,null,'gerir_acervo') then
    raise exception 'Ativação exige administração de Inspeções.' using errcode='42501'; end if;
  if p_chave is null or not coalesce(p_segmento in ('CC','AG-A','AG-B','IN'),false)
    or not coalesce(length(trim(p_motivo)) between 5 and 2000,false)
  then raise exception 'Informe segmento e motivo para incluir a unidade.' using errcode='22023'; end if;
  r:=public.operacao_repetir(p_org,p_chave,'inspecoes_ativar_unidade',pedido);
  if r is not null then return r; end if;
  perform 1 from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id
  where u.organization_id=p_org and u.id=p_unidade and u.cliente_id=p_cliente
    and u.arquivado_em is null and c.arquivado_em is null for share of u,c;
  if not found then raise exception 'Unidade ativa não encontrada para este cliente.' using errcode='42501'; end if;
  insert into public.inspecoes_contextos(organization_id,cliente_id,unidade_id,segmento)
    values(p_org,p_cliente,p_unidade,p_segmento)
    on conflict(organization_id,cliente_id,unidade_id) do nothing;
  if not found then
    if not exists(select 1 from public.inspecoes_contextos where organization_id=p_org and cliente_id=p_cliente
      and unidade_id=p_unidade and segmento is not distinct from p_segmento)
    then raise exception 'A unidade já tem um contexto de Inspeções; confira o segmento existente.' using errcode='23505'; end if;
  else
    insert into public.inspecoes_contexto_eventos(organization_id,cliente_id,unidade_id,autor_id,motivo,segmento)
      values(p_org,p_cliente,p_unidade,auth.uid(),trim(p_motivo),p_segmento);
  end if;
  return public.operacao_concluir(p_org,p_chave,'inspecoes_ativar_unidade',pedido,jsonb_build_object('id',p_unidade));
end $$;

create function public.inspecoes_acervo_salvar(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_id uuid,p_versao integer,p_chave uuid,p_dados jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.inspecoes_registros; anterior jsonb; posterior jsonb; v integer; recibo jsonb;
  pedido jsonb:=jsonb_build_array(p_cliente,p_unidade,p_id,p_versao,p_dados);
  titulo text:=trim(p_dados->>'titulo'); nota text:=nullif(trim(p_dados->>'nota'),'');
  motivo text:=trim(p_dados->>'motivo'); codigo text:=nullif(trim(p_dados->>'codigo'),'');
  relacionado uuid;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.inspecoes_pode(p_org,p_cliente,p_unidade,'gerir_acervo') then
    raise exception 'Edição exige administração de Inspeções.' using errcode='42501'; end if;
  perform public.ag_payload(p_dados,array['titulo','nota','motivo','codigo','relacionado_id']);
  if p_chave is null or p_versao is null or p_versao<0
    or not coalesce(length(titulo) between 2 and 1000,false)
    or not coalesce(length(motivo) between 5 and 2000,false)
    or length(nota)>8000 or length(codigo)>100
    or (p_id is not null and (p_dados ? 'codigo' or p_dados ? 'relacionado_id'))
  then raise exception 'Informe título, motivo e versão válidos.' using errcode='22023'; end if;
  recibo:=public.operacao_repetir(p_org,p_chave,'inspecoes_acervo_salvar',pedido);
  if recibo is not null then return recibo; end if;
  if p_id is null then
    if p_cliente is null or p_unidade is null or p_versao<>0 then
      raise exception 'Selecione a unidade para cadastrar o documento.' using errcode='22023'; end if;
    relacionado:=(p_dados->>'relacionado_id')::uuid;
    if relacionado is not null and not exists(select 1 from public.inspecoes_registros x
      where x.organization_id=p_org and x.cliente_id=p_cliente and x.unidade_id=p_unidade and x.id=relacionado
        and x.colecao in ('ativos','inspecoes','pendencias','plantas','documentos'))
    then raise exception 'Vínculo indisponível para esta unidade.' using errcode='42501'; end if;
    insert into public.inspecoes_registros(organization_id,cliente_id,unidade_id,colecao,source_id,titulo,codigo,situacao,snapshot,importado_por)
      values(p_org,p_cliente,p_unidade,'documentos','nexus-documento:'||p_chave,titulo,codigo,'cadastrado',
        jsonb_build_object('origem','nexus'),auth.uid()) returning * into r;
    if relacionado is not null then
      insert into public.inspecoes_relacoes(organization_id,cliente_id,unidade_id,origem_id,destino_id,tipo)
        values(p_org,p_cliente,p_unidade,relacionado,r.id,'documento');
    end if;
    anterior:=null; v:=0;
  else
    select * into r from public.inspecoes_registros x where x.organization_id=p_org and x.id=p_id
      and x.cliente_id is not distinct from p_cliente and x.unidade_id is not distinct from p_unidade
      and x.colecao not in ('registro','configuracoes','importacoes') for update;
    if not found then raise exception 'Registro indisponível para correção.' using errcode='42501'; end if;
    select x.versao,x.depois into v,anterior from public.inspecoes_acervo_revisoes x
      where x.organization_id=p_org and x.registro_id=r.id order by x.versao desc limit 1;
    if not found then v:=0; anterior:=jsonb_build_object('titulo',r.titulo,'nota',null); end if;
    if v<>p_versao then raise exception 'A ficha já possui uma revisão mais recente.' using errcode='40001'; end if;
  end if;
  posterior:=jsonb_build_object('titulo',titulo,'nota',nota);
  if relacionado is not null then posterior:=posterior||jsonb_build_object('relacionado_id',relacionado); end if;
  if posterior is distinct from anterior then
    v:=v+1;
    insert into public.inspecoes_acervo_revisoes(organization_id,registro_id,versao,autor_id,motivo,antes,depois)
      values(p_org,r.id,v,auth.uid(),motivo,anterior,posterior);
  end if;
  return public.operacao_concluir(p_org,p_chave,'inspecoes_acervo_salvar',pedido,
    jsonb_build_object('id',r.id,'versao',v));
end $$;

create function public.inspecoes_apresentacao_salvar(
  p_org uuid,p_id uuid,p_versao integer,p_chave uuid,p_legenda text,p_ordem integer,p_motivo text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.inspecoes_arquivos; v integer; anterior jsonb; recibo jsonb;
  pedido jsonb:=jsonb_build_array(p_id,p_versao,p_legenda,p_ordem,p_motivo);
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id for update;
  if not found or a.papel<>'foto' or a.estado not in ('original_verificado','falha_processamento')
    or not public.inspecoes_pode(p_org,a.cliente_id,a.unidade_id,'gerir_acervo')
  then raise exception 'Fotografia indisponível para edição.' using errcode='42501'; end if;
  if p_chave is null or p_versao is null or p_versao<0 or length(p_legenda)>2000 or
    (p_ordem is not null and p_ordem not between 0 and 100000) or
    not coalesce(length(trim(p_motivo)) between 5 and 2000,false)
  then raise exception 'Confira legenda, ordem e motivo.' using errcode='22023'; end if;
  recibo:=public.operacao_repetir(p_org,p_chave,'inspecoes_apresentacao_salvar',pedido);
  if recibo is not null then return recibo; end if;
  select x.versao,jsonb_build_object('legenda',x.legenda,'ordem',x.ordem) into v,anterior
    from public.inspecoes_arquivo_apresentacoes x where x.organization_id=p_org and x.arquivo_id=p_id
    order by x.versao desc limit 1;
  if not found then v:=0; anterior:=jsonb_build_object('legenda',a.legenda,'ordem',a.ordem); end if;
  if v<>p_versao then raise exception 'A apresentação da fotografia mudou.' using errcode='40001'; end if;
  if jsonb_build_object('legenda',nullif(trim(p_legenda),''),'ordem',p_ordem) is distinct from anterior then
    v:=v+1;
    insert into public.inspecoes_arquivo_apresentacoes(organization_id,arquivo_id,versao,autor_id,motivo,antes,legenda,ordem)
      values(p_org,p_id,v,auth.uid(),trim(p_motivo),anterior,nullif(trim(p_legenda),''),p_ordem);
  end if;
  return public.operacao_concluir(p_org,p_chave,'inspecoes_apresentacao_salvar',pedido,jsonb_build_object('id',p_id,'versao',v));
end $$;

create view public.inspecoes_apresentacao_atual with (security_invoker=true) as
  select distinct on(organization_id,arquivo_id) organization_id,arquivo_id,versao,legenda,ordem
  from public.inspecoes_arquivo_apresentacoes order by organization_id,arquivo_id,versao desc;
revoke all on public.inspecoes_apresentacao_atual from public,anon,authenticated,service_role;
grant select on public.inspecoes_apresentacao_atual to authenticated;

create or replace view public.inspecoes_acervo_consulta with (security_invoker=true) as
  select r.id,r.organization_id,r.cliente_id,r.unidade_id,r.colecao,r.source_id,
    coalesce(v.depois->>'titulo',r.titulo) as titulo,r.codigo,r.familia,r.situacao,r.data_ref,r.vigente,r.existente,
    r.snapshot,r.origem_autor,r.origem_data,r.importado_em,null::uuid as levantamento_id,null::uuid as ativo_id,
    coalesce(v.versao,0) as acervo_versao,v.depois->>'nota' as nota_acervo
  from public.inspecoes_registros r
  left join lateral (select x.versao,x.depois from public.inspecoes_acervo_revisoes x
    where x.organization_id=r.organization_id and x.registro_id=r.id order by x.versao desc limit 1) v on true
  union all
  select d.id,d.organization_id,d.cliente_id,d.unidade_id,'documentos',d.id::text,
    concat('Laudo ',d.codigo),d.codigo,r.familia,'emitido',l.data_inspecao,true,true,
    jsonb_build_object('revisao',e.revisao,'emitido_em',e.emitido_em,'emissao_sha256',e.sha256,
      'resultado',l.parecer_est,'calculo_versao',l.calculo_versao,'resultado_calculado',l.resultado_calculado,
      'validade_tecnica',l.validade_tecnica,'prazo_restricao',l.prazo_restricao,'conteudo',l.conteudo,
      'protocolo_homologado',e.snapshot->'protocolo_homologado'),
    null::text,null::text,null::timestamptz,e.levantamento_id,l.ativo_id,null::integer,null::text
  from public.inspecoes_documentos d
  join lateral (
    select v.levantamento_id,v.revisao,v.emitido_em,v.sha256,v.snapshot
    from public.inspecoes_emissoes v where v.organization_id=d.organization_id and v.documento_id=d.id
    order by v.emitido_em desc,v.id desc limit 1
  ) e on true
  join public.inspecoes_levantamentos l on l.organization_id=d.organization_id and l.id=e.levantamento_id
  join public.inspecoes_registros r on r.organization_id=l.organization_id and r.id=l.ativo_id;

revoke all on function public.inspecoes_ativar_unidade(uuid,uuid,uuid,text,text,uuid),
  public.inspecoes_acervo_salvar(uuid,uuid,uuid,uuid,integer,uuid,jsonb),
  public.inspecoes_apresentacao_salvar(uuid,uuid,integer,uuid,text,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_ativar_unidade(uuid,uuid,uuid,text,text,uuid),
  public.inspecoes_acervo_salvar(uuid,uuid,uuid,uuid,integer,uuid,jsonb),
  public.inspecoes_apresentacao_salvar(uuid,uuid,integer,uuid,text,integer,text) to authenticated;

-- Administração pode preparar rascunhos; vigência, cancelamento e ciclos preservam o EST técnico.
create or replace function public.inspecoes_continuidade_comando(
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
  v_antes jsonb;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if p_cliente is null or p_unidade is null or not (
    public.inspecoes_pode(p_org,p_cliente,p_unidade,'est') or
    (v_acao in ('criar_contrato','editar_contrato') and public.inspecoes_pode(p_org,p_cliente,p_unidade,'gerir_acervo'))
  ) then
    raise exception 'Ação indisponível para sua atuação de Inspeções.' using errcode='42501';
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
    v_antes:=to_jsonb(v_contrato);
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
  values(p_org,p_cliente,p_unidade,v_contrato.id,v_ciclo.id,v_acao,auth.uid(),
    p_dados||jsonb_build_object('antes',v_antes,'depois',to_jsonb(v_contrato)));
  v_resultado:=jsonb_build_object('contrato_id',v_contrato.id,'ciclo_id',v_ciclo.id,'version',v_contrato.version);
  return public.operacao_concluir(p_org,p_chave,'inspecoes_continuidade',v_pedido,v_resultado);
end
$$;

grant select on public.inspecoes_continuidade_eventos to authenticated;
create policy inspecoes_continuidade_eventos_ler on public.inspecoes_continuidade_eventos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id,'consultar'));

notify pgrst,'reload schema';
