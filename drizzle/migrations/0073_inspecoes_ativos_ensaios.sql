-- Cadastro de ativos novos, componentes e pontos; coleta de ensaio em rascunho.
create function public.inspecoes_normalizar_tag(p_tag text) returns text
language sql immutable strict set search_path='' as $$
  select trim(both '-' from regexp_replace(
    upper(regexp_replace(normalize(trim(p_tag),NFD),U&'[\0300-\036f]','','g')),
    '[[:space:]_./-]+','-','g'))
$$;

create table public.inspecoes_componentes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  ativo_id uuid not null,
  codigo text not null,
  nome text not null,
  unique(organization_id,ativo_id,codigo),
  unique(organization_id,ativo_id,id),
  foreign key(organization_id,cliente_id,unidade_id,ativo_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id)
);
create table public.inspecoes_pontos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  ativo_id uuid not null,
  componente_id uuid,
  codigo text not null,
  nome text,
  unique(organization_id,ativo_id,codigo),
  foreign key(organization_id,cliente_id,unidade_id,ativo_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  foreign key(organization_id,ativo_id,componente_id)
    references public.inspecoes_componentes(organization_id,ativo_id,id)
);
create trigger inspecoes_componente_imutavel before update or delete on public.inspecoes_componentes
  for each row execute function public.inspecoes_historico_imutavel();
create trigger inspecoes_ponto_imutavel before update or delete on public.inspecoes_pontos
  for each row execute function public.inspecoes_historico_imutavel();

create function public.inspecoes_ativo_criar(
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
  if not public.inspecoes_pode(p_org,p_cliente,p_unidade,'est') then
    raise exception 'Cadastro exige atribuição EST para a unidade.' using errcode='42501';
  end if;
  if not exists(select 1 from public.inspecoes_contextos i
    join public.clientes c on c.organization_id=i.organization_id and c.id=i.cliente_id
    join public.unidades u on u.organization_id=i.organization_id and u.cliente_id=i.cliente_id and u.id=i.unidade_id
    where i.organization_id=p_org and i.cliente_id=p_cliente and i.unidade_id=p_unidade
      and c.arquivado_em is null and u.arquivado_em is null)
  then raise exception 'Unidade sem contexto operacional de Inspeções.' using errcode='23514'; end if;
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

alter table public.inspecoes_arquivos drop constraint inspecoes_arquivos_estado_check;
alter table public.inspecoes_arquivos add constraint inspecoes_arquivos_estado_check
  check (estado in ('envio_pendente','envio_cancelado','original_verificado','referencia_externa',
    'snapshot_textual','original_pendente','falha_processamento'));

create function public.inspecoes_arquivo_cancelar(p_org uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_arquivos;
  l public.inspecoes_levantamentos;
  est boolean;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id and levantamento_id is not null;
  if not found then raise exception 'Envio indisponível.' using errcode='42501'; end if;
  select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=a.levantamento_id for update;
  est:=public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id,'est');
  if not (public.inspecoes_lev_acesso(p_org,l.id,true) and (est or a.created_by=auth.uid())
    or l.estado='aprovado' and est and a.papel='original')
  then raise exception 'Envio indisponível.' using errcode='42501'; end if;
  if a.estado='envio_cancelado' then return to_jsonb(a); end if;
  if a.estado<>'envio_pendente' then raise exception 'Somente envios pendentes podem ser cancelados.' using errcode='23514'; end if;
  update public.inspecoes_arquivos set estado='envio_cancelado' where id=p_id and estado='envio_pendente' returning * into a;
  return to_jsonb(a);
end
$$;

create or replace function public.inspecoes_arquivo_atestar(
  p_org uuid,p_id uuid,p_actor uuid,p_sha256 text,p_bytes bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.inspecoes_arquivos;
  l public.inspecoes_levantamentos;
begin
  perform public.lev_travar_autor(p_org,p_actor);
  select * into a from public.inspecoes_arquivos where organization_id=p_org and id=p_id;
  if not found or a.levantamento_id is null or a.created_by is distinct from p_actor
    or a.sha256 is distinct from p_sha256 or a.bytes is distinct from p_bytes then
    raise exception 'Envio indisponível ou bytes divergentes.' using errcode='42501';
  end if;
  select * into l from public.inspecoes_levantamentos
    where organization_id=p_org and id=a.levantamento_id for update;
  if not exists(select 1 from public.inspecoes_atribuicoes_validas(p_org,p_actor) g
    where (g.cliente_id is null or g.cliente_id=l.cliente_id) and (g.unidade_id is null or g.unidade_id=l.unidade_id)
      and (g.perfil='EST' or l.atribuido_a=p_actor or l.created_by=p_actor))
    or (a.estado='envio_pendente' and l.estado<>'rascunho' and not (l.estado='aprovado' and a.papel='original')) then
    raise exception 'Envio indisponível para confirmação.' using errcode='42501';
  end if;
  if a.estado='envio_cancelado' then raise exception 'O envio foi cancelado.' using errcode='23514'; end if;
  if a.estado='envio_pendente' then
    update public.inspecoes_arquivos set estado='original_verificado'
      where id=a.id and estado='envio_pendente' returning * into a;
  end if;
  return to_jsonb(a);
end
$$;

alter table public.inspecoes_levantamentos add unique(organization_id,cliente_id,unidade_id,id,ativo_id);
create table public.inspecoes_ensaios (
  id uuid primary key,
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  levantamento_id uuid not null,
  ativo_id uuid not null,
  ponto_codigo text,
  data_hora timestamptz,
  equipamento_codigo text check (equipamento_codigo in ('EQ-01','EQ-02')),
  certificado_numero text,
  operador_id uuid not null,
  resultado_app text check (resultado_app in ('aprovado','reprovado','sem_resultado')),
  carga_pico_kn numeric,
  carga_pico_kgf numeric,
  calculo_versao text not null default 'R62-previa-v1',
  estado text not null default 'rascunho' check (estado in ('rascunho','cancelado')),
  version integer not null default 1 check (version>0),
  conteudo jsonb not null check (jsonb_typeof(conteudo)='object'),
  bloqueios text[] not null,
  alertas text[] not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,cliente_id,unidade_id,levantamento_id,ativo_id)
    references public.inspecoes_levantamentos(organization_id,cliente_id,unidade_id,id,ativo_id),
  foreign key(organization_id,cliente_id,unidade_id,ativo_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  foreign key(organization_id,operador_id) references public.pessoas(organization_id,id)
);
create index inspecoes_ensaios_levantamento on public.inspecoes_ensaios(organization_id,levantamento_id,estado,created_at,id);
create table public.inspecoes_ensaio_versoes (
  organization_id uuid not null,
  ensaio_id uuid not null,
  versao integer not null,
  snapshot jsonb not null,
  autor_id uuid not null references auth.users(id),
  atribuicao_id uuid not null,
  registrado_em timestamptz not null default now(),
  primary key(organization_id,ensaio_id,versao),
  foreign key(organization_id,ensaio_id) references public.inspecoes_ensaios(organization_id,id)
);
create trigger inspecoes_ensaio_versao_imutavel before update or delete on public.inspecoes_ensaio_versoes
  for each row execute function public.inspecoes_historico_imutavel();

create function public.inspecoes_ensaio_atuacao(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_atribuicao uuid
) returns public.inspecoes_atribuicoes language sql stable security definer set search_path='' as $$
  select a from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
  where (p_atribuicao is null or a.id=p_atribuicao) and a.ensaios
    and (a.cliente_id is null or a.cliente_id=p_cliente)
    and (a.unidade_id is null or a.unidade_id=p_unidade)
  order by a.perfil,a.id limit 1
$$;

-- kN → kgf usa a proposta R62. lbf → kN usa o fator exato NIST SP 811, nota 23.
-- https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes
create function public.inspecoes_ensaio_converter(p_valor numeric,p_unidade text) returns jsonb
language sql immutable strict set search_path='' as $$
  select jsonb_build_object('kn',valor_kn,'kgf',case when p_unidade='kgf' then p_valor else valor_kn*101.97 end,
    'versao','R62-previa-v1')
  from (values (case p_unidade when 'kN' then p_valor when 'lbf' then p_valor*0.0044482216152605
    when 'kgf' then p_valor/101.97 end)) v(valor_kn)
$$;

create function public.inspecoes_ensaio_salvar(
  p_org uuid,p_levantamento uuid,p_id uuid,p_version integer,p_dados jsonb,p_atribuicao uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
<<coleta>>
declare
  l public.inspecoes_levantamentos;
  e public.inspecoes_ensaios;
  a public.inspecoes_atribuicoes;
  chave text;
  ponto text;
  datahora timestamptz;
  certificado jsonb;
  validade date;
  fotos integer;
  medidas jsonb;
  bloqueios text[]:='{}';
  alertas text[]:='{}';
  relatorio uuid;
  video uuid;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=p_levantamento for update;
  if l.id is null or l.estado<>'rascunho' then raise exception 'Rascunho indisponível.' using errcode='42501'; end if;
  a:=public.inspecoes_ensaio_atuacao(p_org,l.cliente_id,l.unidade_id,p_atribuicao);
  if a.id is null or (a.perfil='TST' and l.atribuido_a is distinct from auth.uid() and l.created_by<>auth.uid()) then
    raise exception 'Ensaio exige habilitação técnica e atribuição ao trabalho.' using errcode='42501';
  end if;
  perform public.ag_payload(p_dados,array['ponto_codigo','data_hora','equipamento_codigo','certificado_numero',
    'area_pistao_cm2','capacidade_kn','carga_alvo_kn','carga_pico','unidade_carga','sustentacao_s','deslocamento_valor',
    'deslocamento_unidade','deslocamento_obs','resultado_app','relatorio_id','relatorio_numero','fotos_ids',
    'video_id','horario_visivel','lat','lon','croqui','lacre','temperatura_c','chuva','motivo_reserva']);
  if p_id is null or octet_length(p_dados::text)>16000 then raise exception 'Rascunho de ensaio inválido.' using errcode='23514'; end if;
  foreach chave in array array['area_pistao_cm2','capacidade_kn','carga_alvo_kn','carga_pico','deslocamento_valor','lat','lon','temperatura_c'] loop
    if nullif(p_dados->>chave,'') is not null and (p_dados->>chave) !~ '^-?\d{1,9}([.]\d{1,9})?$' then
      raise exception 'Valor decimal inválido: %.',chave using errcode='23514';
    end if;
  end loop;
  foreach chave in array array['area_pistao_cm2','capacidade_kn','carga_alvo_kn','carga_pico'] loop
    if nullif(p_dados->>chave,'')::numeric<0 then raise exception 'O valor de % não pode ser negativo.',chave using errcode='23514'; end if;
  end loop;
  if nullif(p_dados->>'sustentacao_s','') is not null and (p_dados->>'sustentacao_s') !~ '^\d{1,6}$'
    or nullif(p_dados->>'lat','')::numeric not between -90 and 90
    or nullif(p_dados->>'lon','')::numeric not between -180 and 180
    or (p_dados ? 'horario_visivel' and jsonb_typeof(p_dados->'horario_visivel')<>'boolean')
    or (p_dados ? 'chuva' and jsonb_typeof(p_dados->'chuva')<>'boolean')
    or nullif(p_dados->>'unidade_carga','') not in ('kN','kgf','lbf')
    or nullif(p_dados->>'equipamento_codigo','') not in ('EQ-01','EQ-02')
    or length(p_dados->>'motivo_reserva')>2000
  then raise exception 'Verifique unidades, limites e formato do registro de ensaio.' using errcode='23514'; end if;
  if nullif(p_dados->>'data_hora','') is not null then
    if (p_dados->>'data_hora') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}([.]\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'O ensaio exige data, hora e fuso informados pela origem.' using errcode='23514';
    end if;
    datahora:=(p_dados->>'data_hora')::timestamptz;
    if datahora>now() then raise exception 'Data de ensaio futura.' using errcode='23514'; end if;
  end if;
  ponto:=public.inspecoes_normalizar_tag(p_dados->>'ponto_codigo');
  if nullif(ponto,'') is null then
    bloqueios:=array_append(bloqueios,'ENS-01: selecione o ponto do ativo.');
  elsif not exists(select 1 from public.inspecoes_pontos p
    where p.organization_id=p_org and p.ativo_id=l.ativo_id and p.codigo=ponto)
    and not exists(select 1 from public.inspecoes_registros r where r.organization_id=p_org
      and r.id=l.ativo_id and public.inspecoes_normalizar_tag(r.codigo)=ponto) then
    raise exception 'O ponto não pertence ao ativo deste trabalho.' using errcode='23503';
  end if;
  if datahora is null then bloqueios:=array_append(bloqueios,'ENS-02: informe a data e hora da origem.'); end if;
  select item into certificado from public.inspecoes_registros r
    cross join lateral jsonb_array_elements(coalesce(r.snapshot->'certificados','[]')) item
    where r.organization_id=p_org and r.colecao='equipamentos' and r.codigo=p_dados->>'equipamento_codigo'
      and item->>'numero'=p_dados->>'certificado_numero'
    order by r.schema_version desc,r.id limit 1;
  if certificado->>'validade' ~ '^\d{4}-\d{2}-\d{2}$' then validade:=(certificado->>'validade')::date; end if;
  if validade is null or datahora is null or (datahora at time zone 'America/Sao_Paulo')::date>validade
    or (datahora at time zone 'America/Sao_Paulo')::date<nullif(certificado->>'data','')::date then
    bloqueios:=array_append(bloqueios,'R58: confirme equipamento e certificado vigente na data; recomendação não é validade impressa.');
  end if;
  if p_dados->>'equipamento_codigo'='EQ-02' then
    bloqueios:=array_append(bloqueios,'R59: EQ-02 exige perfil do cilindro e certificado do conjunto confirmados.');
  end if;
  if (datahora at time zone 'America/Sao_Paulo')::date<nullif(l.conteudo->>'art_inicio','')::date then
    alertas:=array_append(alertas,'R19: ensaio anterior ao início da ART.');
  end if;
  if (p_dados ? 'fotos_ids' and jsonb_typeof(p_dados->'fotos_ids')<>'array')
    or jsonb_array_length(p_dados->'fotos_ids')>20 then raise exception 'Lista de fotos inválida.' using errcode='23514'; end if;
  relatorio:=nullif(p_dados->>'relatorio_id','')::uuid;
  video:=nullif(p_dados->>'video_id','')::uuid;
  with midia as (
    select v::uuid id,'foto' categoria from jsonb_array_elements_text(coalesce(p_dados->'fotos_ids','[]')) v
    union all select relatorio,'relatorio' where relatorio is not null
    union all select video,'video' where video is not null
  )
  select count(distinct id) filter (where categoria='foto') into fotos from midia m
    where not exists(select 1 from public.inspecoes_arquivos f
      where f.id=m.id and f.organization_id=p_org and f.levantamento_id=l.id
        and f.estado in ('original_verificado','falha_processamento')
        and (case m.categoria when 'foto' then f.mime like 'image/%'
          when 'video' then f.mime like 'video/%' else f.mime='application/pdf' end));
  if fotos<>0 or exists(select 1 from (values (relatorio,'application/pdf'),(video,'video/%')) v(id,mime)
    where v.id is not null and not exists(select 1 from public.inspecoes_arquivos f
      where f.id=v.id and f.organization_id=p_org and f.levantamento_id=l.id and f.mime like v.mime
        and f.estado in ('original_verificado','falha_processamento'))) then
    raise exception 'Evidência não verificada ou vinculada a outro trabalho.' using errcode='23503';
  end if;
  select count(distinct value) into fotos from jsonb_array_elements_text(coalesce(p_dados->'fotos_ids','[]'));
  if p_dados->>'equipamento_codigo'='EQ-02' and relatorio is null then
    bloqueios:=array_append(bloqueios,'R60: vincule o relatório do aplicativo ao ponto.');
  end if;
  if p_dados->>'equipamento_codigo'='EQ-01' and
    (video is null or fotos<2 or not coalesce((p_dados->>'horario_visivel')::boolean,false)
      or length(trim(coalesce(p_dados->>'motivo_reserva','')))<5) then
    bloqueios:=array_append(bloqueios,'R63: reserva exige motivo, vídeo com horário e fotos de início e fim.');
  end if;
  bloqueios:=array_append(bloqueios,'Homologue cargas, tolerâncias, duração, amostragem e capacidade antes de conferir o ensaio.');
  if p_dados->>'resultado_app'='reprovado' then
    alertas:=array_append(alertas,'R61 (prévia): ensaio reprovado indica ponto não apto; encaminhe para conferência do EST.');
  end if;
  medidas:=public.inspecoes_ensaio_converter(nullif(p_dados->>'carga_pico','')::numeric,nullif(p_dados->>'unidade_carga',''));
  select * into e from public.inspecoes_ensaios where organization_id=p_org and id=p_id for update;
  if found then
    if e.levantamento_id<>l.id or e.estado<>'rascunho'
      or (a.perfil='TST' and e.created_by<>auth.uid()) then
      raise exception 'Ensaio indisponível para edição.' using errcode='42501';
    end if;
    if e.version=p_version+1 and e.conteudo=p_dados then return to_jsonb(e); end if;
    if e.version is distinct from p_version then raise exception 'Concilie a versão atual antes de salvar.' using errcode='40001'; end if;
    update public.inspecoes_ensaios set version=e.version+1,ponto_codigo=nullif(ponto,''),data_hora=datahora,
      equipamento_codigo=nullif(p_dados->>'equipamento_codigo',''),certificado_numero=nullif(p_dados->>'certificado_numero',''),
      resultado_app=nullif(p_dados->>'resultado_app',''),carga_pico_kn=(medidas->>'kn')::numeric,
      carga_pico_kgf=(medidas->>'kgf')::numeric,conteudo=p_dados,bloqueios=coleta.bloqueios,
      alertas=coleta.alertas,updated_at=now() where id=e.id returning * into e;
  else
    if p_version is distinct from 0 then raise exception 'O ensaio ainda não existe.' using errcode='40001'; end if;
    insert into public.inspecoes_ensaios(id,organization_id,cliente_id,unidade_id,levantamento_id,ativo_id,ponto_codigo,data_hora,
      equipamento_codigo,certificado_numero,operador_id,resultado_app,carga_pico_kn,carga_pico_kgf,conteudo,bloqueios,alertas,created_by)
    values(p_id,p_org,l.cliente_id,l.unidade_id,l.id,l.ativo_id,nullif(ponto,''),datahora,nullif(p_dados->>'equipamento_codigo',''),
      nullif(p_dados->>'certificado_numero',''),a.pessoa_id,nullif(p_dados->>'resultado_app',''),
      (medidas->>'kn')::numeric,(medidas->>'kgf')::numeric,p_dados,bloqueios,alertas,auth.uid()) returning * into e;
  end if;
  insert into public.inspecoes_ensaio_versoes(organization_id,ensaio_id,versao,snapshot,autor_id,atribuicao_id)
    values(p_org,e.id,e.version,to_jsonb(e),auth.uid(),a.id);
  return to_jsonb(e);
end
$$;

create function public.inspecoes_ensaio_cancelar(
  p_org uuid,p_id uuid,p_version integer,p_motivo text,p_atribuicao uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  l public.inspecoes_levantamentos;
  e public.inspecoes_ensaios;
  a public.inspecoes_atribuicoes;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into e from public.inspecoes_ensaios where organization_id=p_org and id=p_id;
  if not found then raise exception 'Ensaio indisponível.' using errcode='42501'; end if;
  select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=e.levantamento_id for update;
  a:=public.inspecoes_levantamento_atuacao(p_org,l.cliente_id,l.unidade_id,p_atribuicao,true);
  if a.id is null or l.estado<>'rascunho' then
    raise exception 'Cancelamento exige atribuição EST e levantamento em rascunho.' using errcode='42501';
  end if;
  if not coalesce(length(trim(p_motivo)) between 5 and 2000,false) then
    raise exception 'Informe o motivo do cancelamento.' using errcode='23514';
  end if;
  select * into e from public.inspecoes_ensaios where id=p_id and organization_id=p_org for update;
  if e.estado='cancelado' and e.version=p_version+1 and exists(
    select 1 from public.inspecoes_ensaio_versoes v where v.organization_id=p_org and v.ensaio_id=e.id
      and v.versao=e.version and v.autor_id=auth.uid() and v.snapshot->>'motivo_cancelamento'=trim(p_motivo)
  ) then return to_jsonb(e); end if;
  if e.estado<>'rascunho' or e.version is distinct from p_version then
    raise exception 'Concilie a versão atual do ensaio.' using errcode='40001';
  end if;
  update public.inspecoes_ensaios set estado='cancelado',version=version+1,updated_at=now()
    where id=p_id returning * into e;
  insert into public.inspecoes_ensaio_versoes(organization_id,ensaio_id,versao,snapshot,autor_id,atribuicao_id)
    values(p_org,e.id,e.version,to_jsonb(e)||jsonb_build_object('motivo_cancelamento',trim(p_motivo)),auth.uid(),a.id);
  return to_jsonb(e);
end
$$;

create or replace function public.inspecoes_lev_bloqueios(l public.inspecoes_levantamentos) returns text[]
language plpgsql stable set search_path='' as $$
declare
  r text[]:='{}';
  p public.inspecoes_protocolos;
  familia_codigo text;
begin
  select codigo into familia_codigo from public.inspecoes_registros where organization_id=l.organization_id and id=l.familia_registro_id;
  select * into p from public.inspecoes_protocolos where organization_id=l.organization_id
    and familia=familia_codigo and tipo=l.tipo order by version desc limit 1;
  if p.id is null or p.checklist is distinct from l.checklist then
    r:=array_append(r,'Homologue o protocolo desta família e tipo com o checklist aplicável.');
  end if;
  if l.data_inspecao is null then r:=array_append(r,'Informe a data da inspeção.'); end if;
  if l.resultado_calculado='incompleto' then r:=array_append(r,'Preencha o checklist ou registre a limitação impeditiva.'); end if;
  if nullif(trim(l.conteudo->>'protocolo'),'') is null then r:=array_append(r,'Informe a referência do protocolo usado.'); end if;
  if nullif(trim(l.conteudo->>'codigo_documento'),'') is null then r:=array_append(r,'Informe o código do laudo.'); end if;
  if nullif(trim(l.conteudo->>'revisao_documento'),'') is null then r:=array_append(r,'Informe a revisão do laudo.'); end if;
  if p.art_obrigatoria and (nullif(trim(l.conteudo->>'art'),'') is null or nullif(l.conteudo->>'art_inicio','') is null) then
    r:=array_append(r,'Informe número e início de vigência da ART aplicável.');
  end if;
  if p.ensaio_obrigatorio or exists(select 1 from public.inspecoes_ensaios e where e.organization_id=l.organization_id
    and e.levantamento_id=l.id and e.estado='rascunho') then
    r:=array_append(r,'Vincule um ensaio conferido com protocolo, equipamento e certificado aplicáveis.');
  end if;
  if exists(select 1 from public.inspecoes_arquivos where organization_id=l.organization_id
    and levantamento_id=l.id and estado='envio_pendente') then
    r:=array_append(r,'Conclua a verificação dos bytes dos arquivos vinculados.');
  end if;
  if concat_ws(' ',l.conteudo->>'observacoes',l.conteudo->>'limitacao_impeditiva')
    ~* '(^|[^0-9])100[[:space:]]*%|nenhuma multa|nenhum conflito com as fiscaliza' then
    r:=array_append(r,'R54: remova promessas vedadas do novo conteúdo técnico.');
  end if;
  return r;
end
$$;

alter table public.inspecoes_componentes enable row level security;
alter table public.inspecoes_pontos enable row level security;
alter table public.inspecoes_ensaios enable row level security;
alter table public.inspecoes_ensaio_versoes enable row level security;
revoke all on public.inspecoes_componentes,public.inspecoes_pontos,public.inspecoes_ensaios,public.inspecoes_ensaio_versoes
  from public,anon,authenticated,service_role;
grant select on public.inspecoes_componentes,public.inspecoes_pontos,public.inspecoes_ensaios,public.inspecoes_ensaio_versoes to authenticated;
revoke all on function public.inspecoes_normalizar_tag(text),public.inspecoes_ativo_criar(uuid,uuid,uuid,uuid,jsonb),
  public.inspecoes_arquivo_cancelar(uuid,uuid),public.inspecoes_ensaio_atuacao(uuid,uuid,uuid,uuid),
  public.inspecoes_ensaio_converter(numeric,text),public.inspecoes_ensaio_salvar(uuid,uuid,uuid,integer,jsonb,uuid),
  public.inspecoes_ensaio_cancelar(uuid,uuid,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_ativo_criar(uuid,uuid,uuid,uuid,jsonb),public.inspecoes_arquivo_cancelar(uuid,uuid),
  public.inspecoes_ensaio_salvar(uuid,uuid,uuid,integer,jsonb,uuid),public.inspecoes_ensaio_cancelar(uuid,uuid,integer,text,uuid)
  to authenticated;
create policy inspecoes_componentes_leitura on public.inspecoes_componentes for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));
create policy inspecoes_pontos_leitura on public.inspecoes_pontos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));
create policy inspecoes_ensaios_leitura on public.inspecoes_ensaios for select to authenticated
  using(public.inspecoes_lev_acesso(organization_id,levantamento_id));
create policy inspecoes_ensaio_versoes_leitura on public.inspecoes_ensaio_versoes for select to authenticated
  using(exists(select 1 from public.inspecoes_ensaios e where e.organization_id=inspecoes_ensaio_versoes.organization_id
    and e.id=inspecoes_ensaio_versoes.ensaio_id));
notify pgrst,'reload schema';
