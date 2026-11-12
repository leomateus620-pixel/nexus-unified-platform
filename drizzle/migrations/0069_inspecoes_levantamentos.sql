-- Fluxo operacional separado dos resultados, documentos e aprovações da origem.
create table public.inspecoes_protocolos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  familia text not null,
  tipo text not null check (tipo in ('T1','T2','T3','T4','T5','T6')),
  version integer not null check (version>0),
  familia_registro_id uuid not null,
  checklist jsonb not null check (jsonb_typeof(checklist)='array'),
  fonte text not null,
  art_obrigatoria boolean not null,
  ensaio_obrigatorio boolean not null,
  justificativa text not null,
  aprovado_por uuid not null references auth.users(id),
  aprovado_em timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,familia,tipo,version),
  foreign key (organization_id,familia_registro_id) references public.inspecoes_registros(organization_id,id)
);
create trigger inspecoes_protocolo_imutavel before update or delete on public.inspecoes_protocolos
  for each row execute function public.inspecoes_historico_imutavel();

create table public.inspecoes_levantamentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  ativo_id uuid not null,
  documento_base_id uuid,
  tipo text not null check (tipo in ('T1','T2','T3','T4','T5','T6')),
  estado text not null default 'rascunho' check (estado in ('rascunho','em_revisao','aprovado','emitido','cancelado')),
  version integer not null default 1 check (version>0),
  atribuido_a uuid references auth.users(id),
  data_inspecao date,
  conteudo jsonb not null default '{}' check (jsonb_typeof(conteudo)='object'),
  familia_registro_id uuid not null,
  checklist jsonb not null check (jsonb_typeof(checklist)='array'),
  protocolo_id uuid,
  calculo_versao text not null default 'insp-resultado-previa-v1',
  resultado_calculado text not null default 'incompleto'
    check (resultado_calculado in ('incompleto','candidato_apto','apto_restricao','nao_apto','nao_inspecionado')),
  calculo_justificativa text not null default 'Checklist sem preenchimento.',
  parecer_est text check (parecer_est in ('apto','apto_restricao','nao_apto','nao_inspecionado')),
  justificativa_est text,
  devolucao text,
  alertas text[] not null default '{}',
  prazo_restricao date,
  validade_tecnica date,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  issued_by uuid references auth.users(id),
  issued_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,ativo_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,documento_base_id)
    references public.inspecoes_registros(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,familia_registro_id) references public.inspecoes_registros(organization_id,id),
  foreign key (organization_id,protocolo_id) references public.inspecoes_protocolos(organization_id,id),
  check (estado not in ('aprovado','emitido') or (protocolo_id is not null and data_inspecao is not null
    and parecer_est is not null and approved_by is not null and approved_at is not null)),
  check (estado <> 'emitido' or (issued_by is not null and issued_at is not null))
);
create index inspecoes_lev_fila on public.inspecoes_levantamentos(organization_id,unidade_id,estado,updated_at desc,id);
create index inspecoes_lev_ativo on public.inspecoes_levantamentos(organization_id,ativo_id,updated_at desc,id);

create table public.inspecoes_levantamento_eventos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  levantamento_id uuid not null,
  versao integer not null,
  evento text not null,
  autor_id uuid not null references auth.users(id),
  ocorrido_em timestamptz not null default now(),
  dados jsonb not null check (jsonb_typeof(dados)='object'),
  unique (organization_id,levantamento_id,versao),
  foreign key (organization_id,levantamento_id) references public.inspecoes_levantamentos(organization_id,id)
);
create trigger inspecoes_lev_evento_imutavel before update or delete on public.inspecoes_levantamento_eventos
  for each row execute function public.inspecoes_historico_imutavel();

create table public.inspecoes_levantamento_recibos (
  organization_id uuid not null,
  chave uuid not null,
  autor_id uuid not null references auth.users(id),
  levantamento_id uuid not null,
  pedido jsonb not null,
  resultado jsonb not null,
  primary key (organization_id,chave),
  foreign key (organization_id,levantamento_id) references public.inspecoes_levantamentos(organization_id,id)
);

create table public.inspecoes_documentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  codigo text not null,
  unique (organization_id,cliente_id,unidade_id,id),
  unique (organization_id,unidade_id,codigo),
  foreign key (organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id)
);
create table public.inspecoes_emissoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id uuid not null,
  unidade_id uuid not null,
  documento_id uuid not null,
  levantamento_id uuid not null,
  revisao text not null,
  snapshot jsonb not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  emitido_em timestamptz not null default now(),
  emitido_por uuid not null references auth.users(id),
  unique (organization_id,documento_id,revisao),
  unique (organization_id,levantamento_id),
  foreign key (organization_id,cliente_id,unidade_id,documento_id)
    references public.inspecoes_documentos(organization_id,cliente_id,unidade_id,id),
  foreign key (organization_id,cliente_id,unidade_id,levantamento_id)
    references public.inspecoes_levantamentos(organization_id,cliente_id,unidade_id,id)
);
create trigger inspecoes_documento_imutavel before update or delete on public.inspecoes_documentos
  for each row execute function public.inspecoes_historico_imutavel();
create trigger inspecoes_emissao_imutavel before update or delete on public.inspecoes_emissoes
  for each row execute function public.inspecoes_historico_imutavel();

create function public.inspecoes_lev_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.estado in ('emitido','cancelado') then
    raise exception 'O levantamento encerrado exige nova revisão.' using errcode='23514';
  end if;
  if (old.id,old.organization_id,old.cliente_id,old.unidade_id,old.ativo_id,old.created_by,old.created_at)
    is distinct from (new.id,new.organization_id,new.cliente_id,new.unidade_id,new.ativo_id,new.created_by,new.created_at)
    or new.version <> old.version+1
  then
    raise exception 'Identidade ou versão inválida para o levantamento.' using errcode='23514';
  end if;
  if old.estado='aprovado' and (new.estado <> 'emitido' or
    (to_jsonb(new)-array['estado','version','updated_at','issued_by','issued_at']) is distinct from
    (to_jsonb(old)-array['estado','version','updated_at','issued_by','issued_at']))
  then
    raise exception 'A revisão aprovada é imutável.' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger inspecoes_lev_guard before update or delete on public.inspecoes_levantamentos
  for each row execute function public.inspecoes_lev_guard();

create function public.inspecoes_lev_acesso(p_org uuid,p_id uuid,p_editar boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.inspecoes_levantamentos l
    where l.organization_id=p_org and l.id=p_id
      and public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id)
      and (public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id,'est')
        or l.atribuido_a=auth.uid() or l.created_by=auth.uid() or (l.estado='emitido' and not p_editar))
      and (not p_editar or l.estado='rascunho')
  )
$$;

alter table public.inspecoes_arquivos alter column registro_id drop not null;
alter table public.inspecoes_arquivos add column levantamento_id uuid;
alter table public.inspecoes_arquivos add constraint inspecoes_arquivos_destino
  check (num_nonnulls(registro_id,levantamento_id)=1 and (levantamento_id is null or unidade_id is not null));
alter table public.inspecoes_arquivos add constraint inspecoes_arquivos_lev_contexto
  foreign key (organization_id,cliente_id,unidade_id,levantamento_id)
    references public.inspecoes_levantamentos(organization_id,cliente_id,unidade_id,id);
alter table public.inspecoes_arquivos drop constraint inspecoes_arquivos_estado_check;
alter table public.inspecoes_arquivos add constraint inspecoes_arquivos_estado_check
  check (estado in ('envio_pendente','original_verificado','referencia_externa','snapshot_textual','original_pendente','falha_processamento'));
create index inspecoes_arquivos_levantamento on public.inspecoes_arquivos(organization_id,levantamento_id,ordem,id)
  where levantamento_id is not null;

create function public.inspecoes_arquivo_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception 'Preserve o registro e o original do arquivo.' using errcode='23514';
  end if;
  if (to_jsonb(new)-array['estado','caminho','sha256','bytes','mime','miniatura_caminho','miniatura_sha256','previa_caminho','previa_sha256'])
    is distinct from
    (to_jsonb(old)-array['estado','caminho','sha256','bytes','mime','miniatura_caminho','miniatura_sha256','previa_caminho','previa_sha256'])
    or (old.caminho is not null and
      (old.caminho,old.sha256,old.bytes,old.mime) is distinct from (new.caminho,new.sha256,new.bytes,new.mime))
    or (old.caminho is null and new.caminho is not null
      and new.estado not in ('original_verificado','falha_processamento'))
    or (old.miniatura_caminho is not null and
      (old.miniatura_caminho,old.miniatura_sha256) is distinct from (new.miniatura_caminho,new.miniatura_sha256))
    or (old.previa_caminho is not null and
      (old.previa_caminho,old.previa_sha256) is distinct from (new.previa_caminho,new.previa_sha256))
    or (old.estado in ('original_verificado','falha_processamento') and new.estado not in ('original_verificado','falha_processamento'))
  then
    raise exception 'Preserve a identificação, proveniência e bytes originais.' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger inspecoes_arquivo_guard before update or delete on public.inspecoes_arquivos
  for each row execute function public.inspecoes_arquivo_guard();

create function public.inspecoes_arquivo_reservar(
  p_org uuid,p_levantamento uuid,p_chave uuid,p_papel text,p_nome text,p_mime text,p_bytes bigint,p_sha256 text,p_legenda text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  l public.inspecoes_levantamentos;
  a public.inspecoes_arquivos;
  extensao text;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=p_levantamento for update;
  if not public.inspecoes_lev_acesso(p_org,p_levantamento,true)
    and not coalesce(l.estado='aprovado' and p_papel='original'
      and public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id,'est'),false) then
    raise exception 'Rascunho indisponível para anexar.' using errcode='42501';
  end if;
  if p_chave is null or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or not coalesce(p_bytes between 1 and 20971520,false)
    or not coalesce(length(trim(p_nome)) between 1 and 255,false) or length(p_legenda)>2000
    or p_papel is null or p_papel not in ('original','foto','art','ensaio','evidencia')
    or (p_papel in ('original','art') and p_mime is distinct from 'application/pdf')
    or (p_papel='foto' and coalesce(p_mime,'') not in ('image/jpeg','image/png','image/webp')) then
    raise exception 'Arquivo inválido para este vínculo (limite de 20 MiB).' using errcode='23514';
  end if;
  extensao:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' end;
  if extensao is null then raise exception 'Formato de arquivo não permitido.' using errcode='23514'; end if;
  if p_papel='original' and not public.inspecoes_pode(p_org,l.cliente_id,l.unidade_id,'est') then
    raise exception 'Somente EST pode vincular o arquivo do laudo para emissão.' using errcode='42501';
  end if;
  insert into public.inspecoes_arquivos(id,organization_id,cliente_id,unidade_id,levantamento_id,papel,
    nome,legenda,estado,origem,caminho,sha256,bytes,mime,created_by)
  values(p_chave,p_org,l.cliente_id,l.unidade_id,l.id,p_papel,trim(p_nome),nullif(trim(p_legenda),''),
    'envio_pendente','Levantamento Nexus',p_org::text||'/'||p_chave::text||'/original.'||extensao,
    p_sha256,p_bytes,p_mime,auth.uid()) on conflict (id) do nothing;
  select * into a from public.inspecoes_arquivos where id=p_chave and organization_id=p_org;
  if not found or (a.levantamento_id,a.papel,a.nome,a.legenda,a.sha256,a.bytes,a.mime,a.created_by)
    is distinct from (l.id,p_papel,trim(p_nome),nullif(trim(p_legenda),''),p_sha256,p_bytes,p_mime,auth.uid()) then
    raise exception 'A chave de envio já pertence a outro arquivo.' using errcode='23505';
  end if;
  return to_jsonb(a);
end
$$;

create function public.inspecoes_arquivo_pode_enviar(p_caminho text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.inspecoes_arquivos a where a.caminho=p_caminho
    and a.created_by=auth.uid() and a.estado='envio_pendente'
    and (public.inspecoes_lev_acesso(a.organization_id,a.levantamento_id,true)
      or (a.papel='original' and public.inspecoes_pode(a.organization_id,a.cliente_id,a.unidade_id,'est')
        and exists(select 1 from public.inspecoes_levantamentos l where l.organization_id=a.organization_id
          and l.id=a.levantamento_id and l.estado='aprovado'))))
$$;

-- O servidor que leu e verificou os bytes é o único chamador deste RPC.
create function public.inspecoes_arquivo_atestar(
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
  if a.estado='envio_pendente' then
    update public.inspecoes_arquivos set estado='original_verificado'
      where id=a.id and estado='envio_pendente' returning * into a;
  end if;
  return to_jsonb(a);
end
$$;

create function public.inspecoes_lev_bloqueios(l public.inspecoes_levantamentos) returns text[]
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
  if p.ensaio_obrigatorio then
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

create function public.inspecoes_levantamento_bloqueios(p_org uuid,p_id uuid) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare
  l public.inspecoes_levantamentos;
begin
  if not public.inspecoes_lev_acesso(p_org,p_id) then
    raise exception 'Levantamento indisponível.' using errcode='42501';
  end if;
  select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=p_id;
  if l.estado='emitido' then return '{}'::text[]; end if;
  if l.estado='aprovado' then
    if not exists(select 1 from public.inspecoes_arquivos where organization_id=p_org and levantamento_id=p_id
      and papel='original' and mime='application/pdf' and estado in ('original_verificado','falha_processamento')) then
      return array['Vincule e verifique o PDF desta revisão para emitir.'];
    end if;
    return '{}'::text[];
  end if;
  return public.inspecoes_lev_bloqueios(l);
end
$$;
create function public.inspecoes_levantamento_candidatos(p_org uuid,p_cliente uuid,p_unidade uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nome,x.user_id,x.perfil),'[]'::jsonb)
  from (
    select distinct p.user_id,p.nome,a.perfil
    from public.pessoas p
    cross join lateral public.inspecoes_atribuicoes_validas(p_org,p.user_id) a
    where p.organization_id=p_org and public.inspecoes_pode(p_org,p_cliente,p_unidade,'est')
      and p_cliente is not null and p_unidade is not null
      and (a.cliente_id is null or a.cliente_id=p_cliente)
      and (a.unidade_id is null or a.unidade_id=p_unidade)
  ) x
$$;

create function public.inspecoes_checklist(p_familia jsonb,p_tipo text) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(i.valor order by i.ordem),'[]'::jsonb)
  from jsonb_array_elements(coalesce(p_familia->'checklist','[]')) with ordinality i(valor,ordem)
  where p_tipo <> 'T6' or coalesce(p_familia->'checklist_t6','[]') ? (i.valor->>'id')
$$;

create function public.inspecoes_homologar_protocolo(
  p_org uuid,p_familia text,p_tipo text,p_fonte text,p_art_obrigatoria boolean,
  p_ensaio_obrigatorio boolean,p_justificativa text,p_versao_anterior integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  familia public.inspecoes_registros;
  versao integer;
  lista jsonb;
  protocolo public.inspecoes_protocolos;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.inspecoes_pode(p_org,null,null,'biblioteca') then
    raise exception 'A homologação da biblioteca exige atribuição EST para toda a organização.' using errcode='42501';
  end if;
  if p_tipo is null or p_tipo not in ('T1','T2','T3','T4','T5','T6')
    or not coalesce(length(trim(p_fonte)) between 5 and 2000,false)
    or not coalesce(length(trim(p_justificativa)) between 10 and 4000,false)
    or p_art_obrigatoria is null or p_ensaio_obrigatorio is null then
    raise exception 'Informe fonte e requisitos técnicos aplicáveis, com justificativa.' using errcode='23514';
  end if;
  select * into familia from public.inspecoes_registros
    where organization_id=p_org and colecao='familias' and codigo=p_familia
    order by schema_version desc,importado_em desc,id limit 1;
  lista:=public.inspecoes_checklist(familia.snapshot,p_tipo);
  if jsonb_array_length(lista)=0 then
    raise exception 'Família sem checklist aplicável.' using errcode='23514';
  end if;
  select coalesce(max(p.version),0) into versao from public.inspecoes_protocolos p
    where p.organization_id=p_org and p.familia=p_familia and p.tipo=p_tipo;
  if versao is distinct from p_versao_anterior then
    raise exception 'A biblioteca ganhou outra revisão.' using errcode='40001';
  end if;
  insert into public.inspecoes_protocolos(organization_id,familia,tipo,version,familia_registro_id,checklist,fonte,
    art_obrigatoria,ensaio_obrigatorio,justificativa,aprovado_por)
  values(p_org,p_familia,p_tipo,versao+1,familia.id,lista,trim(p_fonte),p_art_obrigatoria,
    p_ensaio_obrigatorio,trim(p_justificativa),auth.uid()) returning * into protocolo;
  return to_jsonb(protocolo);
end
$$;

create function public.inspecoes_lev_calcular(p_checklist jsonb,p_conteudo jsonb,p_ensaio_reprovado boolean default false)
returns jsonb language sql immutable set search_path='' as $$
  with itens as (
    select i->>'id' id,i->'critico'='true'::jsonb critico,p_conteudo->'respostas'->>(i->>'id') resposta
    from jsonb_array_elements(p_checklist) i
  ),
  avaliacao as (
    select case
      when p_ensaio_reprovado then array['nao_apto','Ensaio reprovado.']
      when exists(select 1 from itens where resposta='NC' and critico) then array['nao_apto','Item crítico não conforme.']
      when nullif(trim(p_conteudo->>'limitacao_impeditiva'),'') is not null then array['nao_inspecionado','Limitação impeditiva registrada.']
      when not exists(select 1 from itens) or exists(select 1 from itens where resposta is null)
        then array['incompleto','Checklist com itens sem resposta.']
      when exists(select 1 from itens where resposta in ('CR','NC'))
        then array['apto_restricao','Checklist contém restrição ou não conformidade não crítica.']
      else array['candidato_apto','Todos os itens foram respondidos com C ou NA.'] end valores
  )
  select jsonb_build_object('versao','insp-resultado-previa-v1','resultado',valores[1],'justificativa',valores[2])
  from avaliacao
$$;

create function public.inspecoes_lev_validar(p_checklist jsonb,p_dados jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare
  k text;
  resposta record;
  medicao jsonb;
begin
  perform public.ag_payload(p_dados,array['data_inspecao','respostas','observacoes','limitacao_impeditiva',
    'protocolo','codigo_documento','revisao_documento','art','art_inicio','prazo_restricao','medicoes','comentarios']);
  foreach k in array array['observacoes','limitacao_impeditiva','protocolo','codigo_documento','revisao_documento','art'] loop
    if p_dados ? k and (jsonb_typeof(p_dados->k) <> 'string' or length(p_dados->>k) >
      case when k in ('observacoes','limitacao_impeditiva') then 4000 else 120 end) then
      raise exception 'Campo inválido: %.',k using errcode='23514';
    end if;
  end loop;
  foreach k in array array['data_inspecao','art_inicio','prazo_restricao'] loop
    if p_dados ? k and nullif(p_dados->>k,'') is not null then
      if (p_dados->>k) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida: %.',k using errcode='23514'; end if;
      perform (p_dados->>k)::date;
    end if;
  end loop;
  foreach k in array array['respostas','comentarios'] loop
    if p_dados ? k and jsonb_typeof(p_dados->k) <> 'object' then
      raise exception 'Respostas e comentários devem estar vinculados a itens do checklist.' using errcode='23514';
    end if;
    for resposta in select * from jsonb_each(coalesce(p_dados->k,'{}')) loop
      if not exists(select 1 from jsonb_array_elements(p_checklist) i where i->>'id'=resposta.key)
        or jsonb_typeof(resposta.value) <> 'string'
        or (k='respostas' and resposta.value#>>'{}' not in ('C','CR','NC','NA'))
        or (k='comentarios' and length(resposta.value#>>'{}')>2000) then
        raise exception 'Resposta ou comentário inválido para o item %.',resposta.key using errcode='23514';
      end if;
    end loop;
  end loop;
  if p_dados ? 'medicoes' then
    if jsonb_typeof(p_dados->'medicoes') <> 'array' or jsonb_array_length(p_dados->'medicoes')>100 then
      raise exception 'Medições inválidas.' using errcode='23514';
    end if;
    for medicao in select value from jsonb_array_elements(p_dados->'medicoes') loop
      perform public.ag_payload(medicao,array['item_id','valor','unidade','observacao']);
      if not exists(select 1 from jsonb_array_elements(p_checklist) i where i->>'id'=medicao->>'item_id')
        or not coalesce(medicao->>'valor' ~ '^-?\d{1,12}([.]\d{1,9})?$',false)
        or not coalesce(length(trim(medicao->>'unidade')) between 1 and 30,false)
        or coalesce(length(medicao->>'observacao'),0)>1000 then
        raise exception 'Cada medição exige item, valor decimal e unidade.' using errcode='23514';
      end if;
    end loop;
  end if;
end
$$;

create function public.inspecoes_levantamento_atuacao(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_atribuicao uuid,p_exige_est boolean
) returns public.inspecoes_atribuicoes language sql stable security definer set search_path='' as $$
  select a from public.inspecoes_atribuicoes_validas(p_org,auth.uid()) a
  where (p_atribuicao is null or a.id=p_atribuicao)
    and (not p_exige_est or a.perfil='EST')
    and (a.cliente_id is null or a.cliente_id=p_cliente)
    and (a.unidade_id is null or a.unidade_id=p_unidade)
  order by a.perfil,a.id limit 1
$$;

create function public.inspecoes_executar(p_org uuid,p_comando jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  comando_chave uuid;
  acao text:=p_comando->>'comando';
  dados jsonb:=p_comando->'dados';
  l public.inspecoes_levantamentos;
  recibo public.inspecoes_levantamento_recibos;
  ativo public.inspecoes_registros;
  familia public.inspecoes_registros;
  protocolo public.inspecoes_protocolos;
  resultado jsonb;
  bloqueios text[];
  atuacao public.inspecoes_atribuicoes;
  atribuicao_selecionada uuid;
  exige_est boolean:=acao in ('criar','devolver','aprovar','emitir','cancelar');
  atribuicao uuid;
  base uuid;
  doc uuid;
  emissao jsonb;
  arquivos jsonb;
  art_inicio date;
begin
  perform public.ag_payload(p_comando,array['comando','chave','id','expected_version','dados','atribuicao_id']);
  comando_chave:=(p_comando->>'chave')::uuid;
  atribuicao_selecionada:=(p_comando->>'atribuicao_id')::uuid;
  if actor is null or comando_chave is null or jsonb_typeof(dados) is distinct from 'object'
    or octet_length(p_comando::text)>200000
    or acao is null or acao not in ('criar','salvar','submeter','devolver','aprovar','emitir','cancelar')
  then raise exception 'Comando inválido.' using errcode='23514'; end if;
  perform public.lev_travar_autor(p_org,actor);
  select * into recibo from public.inspecoes_levantamento_recibos
    where organization_id=p_org and chave=comando_chave;
  if found then
    if recibo.autor_id<>actor or recibo.pedido<>p_comando or not public.inspecoes_lev_acesso(p_org,recibo.levantamento_id) then
      raise exception 'Intenção ou acesso divergente.' using errcode='42501';
    end if;
    select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=recibo.levantamento_id;
    atuacao:=public.inspecoes_levantamento_atuacao(p_org,l.cliente_id,l.unidade_id,atribuicao_selecionada,exige_est);
    if atuacao.id is null or (atuacao.perfil='TST' and actor is distinct from l.atribuido_a and actor<>l.created_by) then
      raise exception 'A atribuição não está habilitada para o trabalho.' using errcode='42501';
    end if;
    return recibo.resultado;
  end if;

  if acao='criar' then
    perform public.ag_payload(dados,array['ativo_id','tipo','atribuido_a','documento_base_id']);
    select * into ativo from public.inspecoes_registros
      where organization_id=p_org and id=(dados->>'ativo_id')::uuid and colecao='ativos';
    atuacao:=public.inspecoes_levantamento_atuacao(p_org,ativo.cliente_id,ativo.unidade_id,atribuicao_selecionada,true);
    if ativo.id is null or atuacao.id is null then
      raise exception 'Somente EST pode iniciar e distribuir o trabalho deste ativo.' using errcode='42501';
    end if;
    if not ativo.vigente or not ativo.existente or ativo.situacao='cancelado'
      or not exists(select 1 from public.unidades where organization_id=p_org and id=ativo.unidade_id and arquivado_em is null)
      or not exists(select 1 from public.clientes where organization_id=p_org and id=ativo.cliente_id and arquivado_em is null)
    then raise exception 'Ativo sem vigência, inexistente ou em cadastro arquivado.' using errcode='23514'; end if;
    select * into familia from public.inspecoes_registros
      where organization_id=p_org and colecao='familias' and codigo=ativo.familia
      order by schema_version desc,importado_em desc,id limit 1;
    if not found then raise exception 'O ativo exige uma família conciliada.' using errcode='23514'; end if;
    if dados->>'tipo' is null or dados->>'tipo' not in ('T1','T2','T3','T4','T5','T6') then
      raise exception 'Selecione o tipo de inspeção.' using errcode='23514';
    end if;
    atribuicao:=(dados->>'atribuido_a')::uuid;
    if atribuicao is not null and not exists(select 1 from public.inspecoes_atribuicoes_validas(p_org,atribuicao) a
      where (a.cliente_id is null or a.cliente_id=ativo.cliente_id) and (a.unidade_id is null or a.unidade_id=ativo.unidade_id)
    ) then raise exception 'Pessoa sem atribuição técnica para a unidade.' using errcode='42501'; end if;
    base:=(dados->>'documento_base_id')::uuid;
    if base is not null and not exists(select 1 from public.inspecoes_registros d where d.organization_id=p_org
      and d.id=base and d.colecao='documentos' and d.cliente_id=ativo.cliente_id and d.unidade_id=ativo.unidade_id
      and exists(select 1 from public.inspecoes_relacoes r where r.organization_id=p_org
        and ((r.origem_id=ativo.id and r.destino_id=d.id) or (r.origem_id=d.id and r.destino_id=ativo.id)))
    ) then raise exception 'O documento base não está vinculado ao ativo desta unidade.' using errcode='42501'; end if;
    insert into public.inspecoes_levantamentos(organization_id,cliente_id,unidade_id,ativo_id,documento_base_id,tipo,
      atribuido_a,familia_registro_id,checklist,created_by)
    values(p_org,ativo.cliente_id,ativo.unidade_id,ativo.id,base,dados->>'tipo',atribuicao,
      familia.id,public.inspecoes_checklist(familia.snapshot,dados->>'tipo'),actor)
    returning * into l;
  else
    select * into l from public.inspecoes_levantamentos where organization_id=p_org and id=(p_comando->>'id')::uuid for update;
    if not found or not public.inspecoes_lev_acesso(p_org,l.id) then
      raise exception 'Levantamento indisponível.' using errcode='42501';
    end if;
    atuacao:=public.inspecoes_levantamento_atuacao(p_org,l.cliente_id,l.unidade_id,atribuicao_selecionada,exige_est);
    if atuacao.id is null or (atuacao.perfil='TST' and actor is distinct from l.atribuido_a and actor<>l.created_by) then
      raise exception 'A atribuição selecionada não autoriza esta ação no trabalho.' using errcode='42501';
    end if;
    if l.version is distinct from (p_comando->>'expected_version')::integer then
      raise exception 'Outra pessoa salvou esta revisão. Compare a versão atual e mantenha seu preenchimento.' using errcode='40001';
    end if;
    case acao
      when 'salvar' then
        if not public.inspecoes_lev_acesso(p_org,l.id,true) then
          raise exception 'O levantamento não está disponível para edição.' using errcode='23514';
        end if;
        perform public.inspecoes_lev_validar(l.checklist,dados);
        l.data_inspecao:=nullif(dados->>'data_inspecao','')::date;
        l.prazo_restricao:=nullif(dados->>'prazo_restricao','')::date;
        if l.data_inspecao > (now() at time zone 'America/Sao_Paulo')::date then
          raise exception 'A data da inspeção não pode ser futura.' using errcode='23514';
        end if;
        if l.prazo_restricao<l.data_inspecao then
          raise exception 'O prazo da restrição deve ser posterior ou igual à data da inspeção.' using errcode='23514';
        end if;
        art_inicio:=nullif(dados->>'art_inicio','')::date;
        l.conteudo:=dados;
        resultado:=public.inspecoes_lev_calcular(l.checklist,dados);
        l.resultado_calculado:=resultado->>'resultado';
        l.calculo_justificativa:=resultado->>'justificativa';
        l.alertas:=case when l.data_inspecao<art_inicio then array['R19: inspeção anterior ao início da ART.'] else '{}'::text[] end;
      when 'submeter' then
        perform public.ag_payload(dados,array[]::text[]);
        if l.estado<>'rascunho' or l.data_inspecao is null or l.resultado_calculado='incompleto' then
          raise exception 'Para submeter, informe a data e conclua o checklist ou registre a limitação impeditiva.' using errcode='23514';
        end if;
        if exists(select 1 from public.inspecoes_arquivos where organization_id=p_org and levantamento_id=l.id and estado='envio_pendente') then
          raise exception 'Conclua a verificação dos bytes dos arquivos vinculados.' using errcode='23514';
        end if;
        l.estado:='em_revisao';
        l.devolucao:=null;
      when 'devolver' then
        perform public.ag_payload(dados,array['motivo']);
        if l.estado<>'em_revisao' or not coalesce(length(trim(dados->>'motivo')) between 5 and 4000,false) then
          raise exception 'Informe o motivo para devolver um levantamento em revisão.' using errcode='23514';
        end if;
        l.estado:='rascunho';
        l.devolucao:=trim(dados->>'motivo');
      when 'aprovar' then
        perform public.ag_payload(dados,array['parecer','motivo','validade_tecnica']);
        if l.estado<>'em_revisao' then raise exception 'Submeta o levantamento para revisão.' using errcode='23514'; end if;
        bloqueios:=public.inspecoes_lev_bloqueios(l);
        if cardinality(bloqueios)>0 then
          raise exception 'Aprovação bloqueada.' using errcode='23514', detail=array_to_string(bloqueios,E'\n');
        end if;
        l.parecer_est:=dados->>'parecer';
        if l.parecer_est is null or l.parecer_est not in ('apto','apto_restricao','nao_apto','nao_inspecionado')
          or not coalesce(length(trim(dados->>'motivo')) between 5 and 4000,false)
          or (l.resultado_calculado='nao_apto' and l.parecer_est<>'nao_apto')
          or (l.resultado_calculado='nao_inspecionado' and l.parecer_est<>'nao_inspecionado')
          or (l.resultado_calculado='apto_restricao' and l.parecer_est='apto') then
          raise exception 'Informe um parecer compatível com os achados, com justificativa.' using errcode='23514';
        end if;
        if l.parecer_est='apto_restricao' and l.prazo_restricao is null then
          raise exception 'Informe o prazo da restrição antes da aprovação.' using errcode='23514';
        end if;
        if nullif(dados->>'validade_tecnica','') is not null and dados->>'validade_tecnica' !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'Data de validade técnica inválida.' using errcode='23514';
        end if;
        l.validade_tecnica:=nullif(dados->>'validade_tecnica','')::date;
        if l.validade_tecnica is not null and (l.parecer_est not in ('apto','apto_restricao')
          or l.validade_tecnica<l.data_inspecao or (l.parecer_est='apto_restricao' and l.validade_tecnica>l.prazo_restricao)) then
          raise exception 'A validade técnica é incompatível com a inspeção ou com o parecer.' using errcode='23514';
        end if;
        select p.* into protocolo from public.inspecoes_protocolos p where p.organization_id=p_org and p.tipo=l.tipo
          and p.familia=(select codigo from public.inspecoes_registros where organization_id=p_org and id=l.familia_registro_id)
          order by p.version desc limit 1;
        l.protocolo_id:=protocolo.id;
        l.estado:='aprovado';
        l.justificativa_est:=trim(dados->>'motivo');
        l.approved_by:=actor;
        l.approved_at:=now();
      when 'emitir' then
        perform public.ag_payload(dados,array[]::text[]);
        if l.estado<>'aprovado' then raise exception 'A emissão exige uma revisão aprovada.' using errcode='23514'; end if;
        bloqueios:=public.inspecoes_levantamento_bloqueios(p_org,l.id);
        if cardinality(bloqueios)>0 then
          raise exception 'Emissão bloqueada.' using errcode='23514', detail=array_to_string(bloqueios,E'\n');
        end if;
        if exists(select 1 from public.inspecoes_arquivos where organization_id=p_org and levantamento_id=l.id and estado='envio_pendente') then
          raise exception 'Conclua a verificação de todos os arquivos antes de emitir.' using errcode='23514';
        end if;
        insert into public.inspecoes_documentos(organization_id,cliente_id,unidade_id,codigo)
          values(p_org,l.cliente_id,l.unidade_id,upper(trim(l.conteudo->>'codigo_documento')))
          on conflict(organization_id,unidade_id,codigo) do nothing;
        select id into doc from public.inspecoes_documentos where organization_id=p_org and unidade_id=l.unidade_id
          and codigo=upper(trim(l.conteudo->>'codigo_documento'));
        select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) into arquivos
          from public.inspecoes_arquivos a where a.organization_id=p_org and a.levantamento_id=l.id
          and a.estado in ('original_verificado','falha_processamento');
        select * into protocolo from public.inspecoes_protocolos where organization_id=p_org and id=l.protocolo_id;
        emissao:=jsonb_build_object('schema_version',1,'revisao_aprovada',to_jsonb(l),'protocolo_homologado',to_jsonb(protocolo),
          'arquivos',arquivos,'ativo',(select snapshot from public.inspecoes_registros where organization_id=p_org and id=l.ativo_id));
        insert into public.inspecoes_emissoes(organization_id,cliente_id,unidade_id,documento_id,levantamento_id,
          revisao,snapshot,sha256,emitido_por)
        values(p_org,l.cliente_id,l.unidade_id,doc,l.id,upper(trim(l.conteudo->>'revisao_documento')),
          emissao,encode(sha256(convert_to(emissao::text,'UTF8')),'hex'),actor);
        l.estado:='emitido';
        l.issued_by:=actor;
        l.issued_at:=now();
      when 'cancelar' then
        perform public.ag_payload(dados,array['motivo']);
        if l.estado not in ('rascunho','em_revisao') or not coalesce(length(trim(dados->>'motivo')) between 5 and 4000,false) then
          raise exception 'Somente rascunho ou revisão podem ser cancelados com motivo registrado.' using errcode='23514';
        end if;
        l.estado:='cancelado';
    end case;
    update public.inspecoes_levantamentos set estado=l.estado,version=l.version+1,conteudo=l.conteudo,
      data_inspecao=l.data_inspecao,prazo_restricao=l.prazo_restricao,validade_tecnica=l.validade_tecnica,
      resultado_calculado=l.resultado_calculado,calculo_justificativa=l.calculo_justificativa,alertas=l.alertas,
      devolucao=l.devolucao,protocolo_id=l.protocolo_id,parecer_est=l.parecer_est,justificativa_est=l.justificativa_est,
      approved_by=l.approved_by,approved_at=l.approved_at,issued_by=l.issued_by,issued_at=l.issued_at,updated_at=now()
      where id=l.id returning * into l;
  end if;
  resultado:=to_jsonb(l);
  insert into public.inspecoes_levantamento_eventos(organization_id,levantamento_id,versao,evento,autor_id,dados)
    values(p_org,l.id,l.version,acao,actor,jsonb_build_object('pedido',dados,'estado',l.estado,
      'resultado_calculado',l.resultado_calculado,'parecer_est',l.parecer_est,
      'atribuicao_id',atuacao.id,'perfil',atuacao.perfil));
  insert into public.inspecoes_levantamento_recibos(organization_id,chave,autor_id,levantamento_id,pedido,resultado)
    values(p_org,comando_chave,actor,l.id,p_comando,resultado);
  return resultado;
end
$$;

create function public.inspecoes_levantamento_situacao(p_org uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('parecer_est',l.parecer_est,'prazo_restricao',l.prazo_restricao,
    'validade_tecnica',l.validade_tecnica,
    'situacao_efetiva',case when l.parecer_est='apto_restricao' and l.prazo_restricao < (now() at time zone 'America/Sao_Paulo')::date
      then 'nao_apto' else l.parecer_est end,
    'motivo',case when l.parecer_est='apto_restricao' and l.prazo_restricao < (now() at time zone 'America/Sao_Paulo')::date
      then 'Prazo de restrição vencido. Consulte uma revisão posterior com a comprovação da correção.' end)
  from public.inspecoes_levantamentos l where l.organization_id=p_org and l.id=p_id and public.inspecoes_lev_acesso(p_org,p_id)
$$;

alter table public.inspecoes_protocolos enable row level security;
alter table public.inspecoes_levantamentos enable row level security;
alter table public.inspecoes_levantamento_eventos enable row level security;
alter table public.inspecoes_levantamento_recibos enable row level security;
alter table public.inspecoes_documentos enable row level security;
alter table public.inspecoes_emissoes enable row level security;
revoke all on public.inspecoes_protocolos,public.inspecoes_levantamentos,public.inspecoes_levantamento_eventos,
  public.inspecoes_levantamento_recibos,public.inspecoes_documentos,public.inspecoes_emissoes
  from public,anon,authenticated,service_role;
grant select on public.inspecoes_protocolos,public.inspecoes_levantamentos,public.inspecoes_levantamento_eventos,
  public.inspecoes_documentos,public.inspecoes_emissoes to authenticated;

revoke all on function public.inspecoes_lev_guard(),public.inspecoes_arquivo_guard(),
  public.inspecoes_lev_acesso(uuid,uuid,boolean),public.inspecoes_levantamento_candidatos(uuid,uuid,uuid),
  public.inspecoes_checklist(jsonb,text),public.inspecoes_homologar_protocolo(uuid,text,text,text,boolean,boolean,text,integer),
  public.inspecoes_lev_calcular(jsonb,jsonb,boolean),public.inspecoes_lev_validar(jsonb,jsonb),
  public.inspecoes_lev_bloqueios(public.inspecoes_levantamentos),public.inspecoes_levantamento_bloqueios(uuid,uuid),
  public.inspecoes_levantamento_atuacao(uuid,uuid,uuid,uuid,boolean),
  public.inspecoes_executar(uuid,jsonb),public.inspecoes_levantamento_situacao(uuid,uuid),
  public.inspecoes_arquivo_reservar(uuid,uuid,uuid,text,text,text,bigint,text,text),
  public.inspecoes_arquivo_pode_enviar(text),public.inspecoes_arquivo_atestar(uuid,uuid,uuid,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_lev_acesso(uuid,uuid,boolean),public.inspecoes_levantamento_candidatos(uuid,uuid,uuid),
  public.inspecoes_homologar_protocolo(uuid,text,text,text,boolean,boolean,text,integer),
  public.inspecoes_levantamento_bloqueios(uuid,uuid),public.inspecoes_executar(uuid,jsonb),
  public.inspecoes_levantamento_situacao(uuid,uuid),public.inspecoes_arquivo_reservar(uuid,uuid,uuid,text,text,text,bigint,text,text),
  public.inspecoes_arquivo_pode_enviar(text) to authenticated;
grant execute on function public.inspecoes_arquivo_atestar(uuid,uuid,uuid,text,bigint) to service_role;

create policy inspecoes_protocolos_leitura on public.inspecoes_protocolos for select to authenticated
  using(public.inspecoes_pode(organization_id));
create policy inspecoes_levantamentos_leitura on public.inspecoes_levantamentos for select to authenticated
  using(public.inspecoes_lev_acesso(organization_id,id));
create policy inspecoes_eventos_leitura on public.inspecoes_levantamento_eventos for select to authenticated
  using(public.inspecoes_lev_acesso(organization_id,levantamento_id));
create policy inspecoes_documentos_leitura on public.inspecoes_documentos for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));
create policy inspecoes_emissoes_leitura on public.inspecoes_emissoes for select to authenticated
  using(public.inspecoes_pode(organization_id,cliente_id,unidade_id));

alter policy inspecoes_arquivos_leitura on public.inspecoes_arquivos using(
  (levantamento_id is not null and public.inspecoes_lev_acesso(organization_id,levantamento_id))
  or (registro_id is not null and public.inspecoes_pode(organization_id,cliente_id,unidade_id)
    and (papel not in ('modelo','piloto') or public.inspecoes_pode(organization_id,cliente_id,unidade_id,'est')))
);
create policy inspecoes_storage_envio on storage.objects for insert to authenticated with check(
  bucket_id='inspecoes-acervo' and public.inspecoes_arquivo_pode_enviar(name)
);
create policy inspecoes_storage_retomada on storage.objects for select to authenticated using(
  bucket_id='inspecoes-acervo' and public.inspecoes_arquivo_pode_enviar(name)
);

notify pgrst,'reload schema';
