-- Staging privado. Identidade da origem e id do destino sobrevivem a novas versões do pacote.
create table public.inspecoes_importacao_lotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  fonte text not null check (fonte='nexus-inspecoes'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  versao integer not null check (versao>0),
  data_origem date not null,
  blocos integer not null check (blocos between 1 and 10000),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  executor name not null default session_user,
  concluido_em timestamptz,
  unique(organization_id,fonte,snapshot_sha256,versao)
);

create table public.inspecoes_importacao_contextos (
  organization_id uuid not null,
  cliente_source_id text not null check (length(cliente_source_id) between 1 and 200),
  unidade_source_id text not null check (length(unidade_source_id) between 1 and 200),
  cliente_id uuid not null,
  unidade_id uuid not null,
  evidencia text not null check (length(trim(evidencia)) between 15 and 4000),
  origem jsonb not null check (jsonb_typeof(origem)='object'),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  executor name not null default session_user,
  primary key (organization_id,cliente_source_id,unidade_source_id),
  unique(organization_id,cliente_id,unidade_id),
  foreign key(organization_id,cliente_id,unidade_id)
    references public.inspecoes_contextos(organization_id,cliente_id,unidade_id)
);

create table public.inspecoes_importacao_blocos (
  lote_id uuid not null references public.inspecoes_importacao_lotes(id),
  numero integer not null check (numero>0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  aplicado_em timestamptz,
  aplicado_por uuid references auth.users(id),
  primary key(lote_id,numero)
);

create table public.inspecoes_importacao_itens (
  lote_id uuid not null,
  bloco integer not null,
  colecao text not null check (length(colecao) between 1 and 40),
  source_id text not null check (length(trim(source_id)) between 1 and 200),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  estado text not null default 'em_staging' check (estado in ('em_staging','importado','identico','preservado','conflito')),
  destino_id uuid references public.inspecoes_registros(id),
  motivo text,
  aplicado_em timestamptz,
  primary key(lote_id,colecao,source_id),
  foreign key(lote_id,bloco) references public.inspecoes_importacao_blocos(lote_id,numero)
);
create index inspecoes_importacao_itens_bloco on public.inspecoes_importacao_itens(lote_id,bloco);

alter table public.inspecoes_importacao_lotes enable row level security;
alter table public.inspecoes_importacao_contextos enable row level security;
alter table public.inspecoes_importacao_blocos enable row level security;
alter table public.inspecoes_importacao_itens enable row level security;
revoke all on public.inspecoes_importacao_lotes,public.inspecoes_importacao_contextos,
  public.inspecoes_importacao_blocos,public.inspecoes_importacao_itens from public,anon,authenticated,service_role;

create function public.inspecoes_importacao_executor() returns boolean
language sql stable set search_path='' as $$
  select (session_user='postgres' and current_setting('role',true) in ('none','postgres') and auth.uid() is null)
    or (current_setting('role',true)='service_role' and
      (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') is not distinct from 'service_role')
$$;

create function public.inspecoes_importacao_exigir(p_org uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if p_org is null or (public.inspecoes_importacao_executor() or public.inspecoes_pode(p_org,null,null,'importar')) is not true then
    raise exception 'Importação exige atribuição EST com acesso de importação a toda a organização.' using errcode='42501';
  end if;
end
$$;

create function public.inspecoes_importar_contexto(
  p_org uuid,p_cliente uuid,p_unidade uuid,p_evidencia text,p_cliente_origem jsonb,p_unidade_origem jsonb,
  p_criar_cliente boolean default false,p_criar_unidade boolean default false
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_anterior public.inspecoes_importacao_contextos;
  v_cliente_source text := p_cliente_origem->>'id';
  v_unidade_source text := p_unidade_origem->>'id';
  v_cnpj text := nullif(btrim(p_cliente_origem->>'cnpj_matriz'),'');
  v_nome text := btrim(p_cliente_origem->>'razao_social');
  v_nome_exibicao text := nullif(btrim(p_cliente_origem->>'nome_fantasia'),'');
  v_dados jsonb := jsonb_build_object('cliente',p_cliente_origem,'unidade',p_unidade_origem);
begin
  perform public.inspecoes_importacao_exigir(p_org);
  if p_cliente is null or p_unidade is null or v_cliente_source is null or v_unidade_source is null
    or length(trim(coalesce(p_evidencia,''))) not between 15 and 4000
    or jsonb_typeof(p_cliente_origem) is distinct from 'object'
    or jsonb_typeof(p_unidade_origem) is distinct from 'object'
    or coalesce((p_cliente_origem->>'exemplo')::boolean,false)
    or coalesce((p_unidade_origem->>'exemplo')::boolean,false)
  then
    raise exception 'Contexto exige identidade, evidência e registros operacionais da origem.' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':inspecoes:importacao',0));
  select * into v_anterior from public.inspecoes_importacao_contextos
  where organization_id=p_org and cliente_source_id=v_cliente_source and unidade_source_id=v_unidade_source;
  if found then
    if (v_anterior.cliente_id,v_anterior.unidade_id) is distinct from (p_cliente,p_unidade) then
      raise exception 'Origem já possui outro destino. Resolva o mapeamento antes de reaplicar.' using errcode='23514';
    end if;
    return jsonb_build_object('estado','identico','cliente_id',p_cliente,'unidade_id',p_unidade);
  end if;

  if (p_criar_cliente or p_criar_unidade) and not
    (public.inspecoes_importacao_executor() or public.pode(p_org,'editar_cadastro'))
  then
    raise exception 'Criação do cadastro canônico exige permissão de cadastro.' using errcode='42501';
  end if;

  if p_criar_cliente then
    if exists(select 1 from public.clientes c where c.organization_id=p_org and (
      lower(btrim(c.razao_social))=lower(v_nome) or lower(btrim(c.nome_exibicao))=lower(v_nome_exibicao)
      or (v_cnpj is not null and left(c.identificador_normalizado,8)=left(regexp_replace(v_cnpj,'[^0-9A-Za-z]','','g'),8))
    )) then
      raise exception 'Identidade canônica potencialmente existente. Exija mapeamento explícito.' using errcode='23505';
    end if;
    insert into public.clientes(id,organization_id,razao_social,nome_exibicao,cnpj,observacoes)
    values(p_cliente,p_org,v_nome,v_nome_exibicao,v_cnpj,nullif(p_cliente_origem->>'observacao',''));
  end if;
  if not exists(select 1 from public.clientes c where c.organization_id=p_org and c.id=p_cliente) then
    raise exception 'Cliente canônico indisponível no destino.' using errcode='23503';
  end if;
  if p_criar_unidade then
    if exists(select 1 from public.unidades u where u.organization_id=p_org and u.cliente_id=p_cliente
      and lower(btrim(u.nome))=lower(btrim(p_unidade_origem->>'nome'))) then
      raise exception 'Unidade canônica potencialmente existente. Exija mapeamento explícito.' using errcode='23505';
    end if;
    insert into public.unidades(id,organization_id,cliente_id,nome,endereco)
    values(p_unidade,p_org,p_cliente,p_unidade_origem->>'nome',
      nullif(concat_ws(' · ',nullif(p_unidade_origem->>'endereco',''),nullif(p_unidade_origem->>'cidade',''),
        nullif(p_unidade_origem->>'uf','')),''));
  end if;
  insert into public.inspecoes_contextos(organization_id,cliente_id,unidade_id,segmento,snapshot)
  values(p_org,p_cliente,p_unidade,nullif(p_cliente_origem->>'segmento_codigo',''),v_dados)
  on conflict(organization_id,cliente_id,unidade_id) do nothing;
  insert into public.inspecoes_importacao_contextos(organization_id,cliente_source_id,unidade_source_id,
    cliente_id,unidade_id,evidencia,origem,criado_por)
  values(p_org,v_cliente_source,v_unidade_source,p_cliente,p_unidade,p_evidencia,v_dados,auth.uid());
  return jsonb_build_object('estado','mapeado','cliente_id',p_cliente,'unidade_id',p_unidade);
end
$$;

create function public.inspecoes_importar_iniciar(
  p_org uuid,p_sha256 text,p_versao integer,p_data date,p_blocos integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_lote public.inspecoes_importacao_lotes;
begin
  perform public.inspecoes_importacao_exigir(p_org);
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':inspecoes:importacao',0));
  insert into public.inspecoes_importacao_lotes(organization_id,fonte,snapshot_sha256,versao,data_origem,blocos,criado_por)
  values(p_org,'nexus-inspecoes',p_sha256,p_versao,p_data,p_blocos,auth.uid())
  on conflict(organization_id,fonte,snapshot_sha256,versao) do nothing;
  select * into strict v_lote from public.inspecoes_importacao_lotes where organization_id=p_org
    and fonte='nexus-inspecoes' and snapshot_sha256=p_sha256 and versao=p_versao;
  if v_lote.blocos<>p_blocos or v_lote.data_origem<>p_data then
    raise exception 'Manifesto divergente para o mesmo lote.' using errcode='23514';
  end if;
  return v_lote.id;
end
$$;

create function public.inspecoes_importar_estagiar(
  p_org uuid,p_lote uuid,p_bloco integer,p_itens jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_lote public.inspecoes_importacao_lotes;
  v_hash text := encode(sha256(convert_to(p_itens::text,'UTF8')),'hex');
  v_existente text;
begin
  perform public.inspecoes_importacao_exigir(p_org);
  select * into v_lote from public.inspecoes_importacao_lotes where organization_id=p_org and id=p_lote for update;
  if not found or p_bloco not between 1 and v_lote.blocos then
    raise exception 'Bloco fora do manifesto.' using errcode='23514';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or octet_length(p_itens::text)>6000000 then
    raise exception 'Formato ou tamanho do bloco inválido.' using errcode='23514';
  end if;
  if jsonb_array_length(p_itens) not between 1 and 500 then
    raise exception 'Quantidade de itens do bloco inválida.' using errcode='23514';
  end if;
  select sha256 into v_existente from public.inspecoes_importacao_blocos where lote_id=p_lote and numero=p_bloco;
  if found then
    if v_existente<>v_hash then
      raise exception 'Bloco existente com conteúdo diferente. Registre outra versão do lote.' using errcode='23514';
    end if;
    return jsonb_build_object('estado','identico','sha256',v_hash);
  end if;
  if v_lote.concluido_em is not null then
    raise exception 'Lote já concluído.' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_array_elements(p_itens) i where
    jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'snapshot') is distinct from 'object'
    or not coalesce(i->>'colecao' in ('documentos','ativos','inspecoes','pendencias','importacoes','plantas','equipamentos',
      'servicos','familias','tipos','pacotes','matrizes','regras','parametros','textos','listas','registro','avisos',
      'contratos','ensaios','os','configuracoes','metadados','demonstracao','relacao'),false)
    or length(coalesce(i->>'source_id','')) not between 1 and 200
    or length(coalesce(i->>'titulo','')) not between 1 and 1000
    or ((i->>'cliente_source_id' is null) <> (i->>'unidade_source_id' is null))
    or (i->>'colecao' in ('documentos','ativos','inspecoes','pendencias','importacoes','plantas','avisos','contratos','ensaios','os')
      and i->>'unidade_source_id' is null)
  ) then
    raise exception 'Um ou mais itens não correspondem ao contrato de staging.' using errcode='23514';
  end if;
  insert into public.inspecoes_importacao_blocos(lote_id,numero,sha256) values(p_lote,p_bloco,v_hash);
  insert into public.inspecoes_importacao_itens(lote_id,bloco,colecao,source_id,sha256,payload)
  select p_lote,p_bloco,i->>'colecao',i->>'source_id',encode(sha256(convert_to(i::text,'UTF8')),'hex'),i
  from jsonb_array_elements(p_itens) i;
  return jsonb_build_object('estado','em_staging','sha256',v_hash,'itens',jsonb_array_length(p_itens));
end
$$;

create function public.inspecoes_importar_aplicar(
  p_org uuid,p_lote uuid,p_bloco integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_lote public.inspecoes_importacao_lotes;
  v_bloco public.inspecoes_importacao_blocos;
  v_item public.inspecoes_importacao_itens;
  v_contexto public.inspecoes_importacao_contextos;
  v_existente public.inspecoes_registros;
  v_origem public.inspecoes_registros;
  v_destino public.inspecoes_registros;
  v_payload jsonb;
  v_rel jsonb;
  v_destino_id uuid;
  v_estado text;
  v_motivo text;
begin
  perform public.inspecoes_importacao_exigir(p_org);
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':inspecoes:importacao',0));
  select * into v_lote from public.inspecoes_importacao_lotes where organization_id=p_org and id=p_lote for update;
  if not found then
    raise exception 'Lote indisponível.' using errcode='42501';
  end if;
  select * into v_bloco from public.inspecoes_importacao_blocos where lote_id=p_lote and numero=p_bloco for update;
  if not found then
    raise exception 'Estagie o bloco antes de aplicar.' using errcode='23514';
  end if;
  if v_lote.concluido_em is null then
    for v_item in select * from public.inspecoes_importacao_itens where lote_id=p_lote and bloco=p_bloco
      and estado in ('em_staging','conflito') order by colecao,source_id
    loop
      v_payload:=v_item.payload;
      v_rel:=v_payload->'snapshot';
      v_destino_id:=null;
      v_estado:='importado';
      v_motivo:=null;
      begin
        if v_item.colecao in ('metadados','demonstracao') then
          v_estado:='preservado';
          v_motivo:='Metadados originais ou demonstração mantidos somente no staging.';
        elsif v_item.colecao='relacao' then
          select * into v_origem from public.inspecoes_registros where organization_id=p_org
            and colecao=v_rel->>'origem_colecao' and source_id=v_rel->>'origem_id';
          select * into v_destino from public.inspecoes_registros where organization_id=p_org
            and colecao=v_rel->>'destino_colecao' and source_id=v_rel->>'destino_id';
          if v_origem.id is null or v_destino.id is null or v_origem.unidade_id is null
            or (v_origem.cliente_id,v_origem.unidade_id) is distinct from (v_destino.cliente_id,v_destino.unidade_id)
          then
            raise exception 'Relação aguarda registros compatíveis no destino.' using errcode='23514';
          end if;
          if exists(select 1 from public.inspecoes_importacao_itens i where i.lote_id=p_lote
            and ((i.colecao,i.source_id)=(v_origem.colecao,v_origem.source_id) or
            (i.colecao,i.source_id)=(v_destino.colecao,v_destino.source_id)) and i.estado='conflito') then
            raise exception 'Relação aguarda conciliação da versão dos registros.' using errcode='23514';
          end if;
          insert into public.inspecoes_relacoes(organization_id,cliente_id,unidade_id,origem_id,destino_id,tipo)
          values(p_org,v_origem.cliente_id,v_origem.unidade_id,v_origem.id,v_destino.id,v_rel->>'tipo') on conflict do nothing;
          if not found then v_estado:='identico'; end if;
          v_destino_id:=v_destino.id;
        else
          v_contexto:=null;
          if v_payload->>'unidade_source_id' is not null then
            select * into v_contexto from public.inspecoes_importacao_contextos where organization_id=p_org
              and cliente_source_id=v_payload->>'cliente_source_id' and unidade_source_id=v_payload->>'unidade_source_id';
            if not found then raise exception 'Unidade aguarda conciliação canônica.' using errcode='23514'; end if;
          end if;
          select * into v_existente from public.inspecoes_registros where organization_id=p_org
            and colecao=v_item.colecao and source_id=v_item.source_id;
          if found then
            v_destino_id:=v_existente.id;
            if (v_existente.cliente_id,v_existente.unidade_id) is not distinct from (v_contexto.cliente_id,v_contexto.unidade_id)
              and exists (select 1 from public.inspecoes_importacao_itens i
                join public.inspecoes_importacao_lotes l on l.id=i.lote_id and l.organization_id=p_org
                where i.destino_id=v_existente.id and i.colecao=v_item.colecao and i.source_id=v_item.source_id
                  and i.estado in ('importado','identico') and i.sha256=v_item.sha256)
            then v_estado:='identico';
            else v_estado:='conflito'; v_motivo:='Nova versão mantida no staging para conciliação. Destino preservado.';
            end if;
          else
            insert into public.inspecoes_registros(organization_id,cliente_id,unidade_id,colecao,source_id,titulo,
              codigo,familia,situacao,data_ref,vigente,existente,snapshot,origem_autor,origem_data,importado_por)
            values(p_org,v_contexto.cliente_id,v_contexto.unidade_id,v_item.colecao,v_item.source_id,v_payload->>'titulo',
              v_payload->>'codigo',v_payload->>'familia',v_payload->>'situacao',(v_payload->>'data_ref')::date,
              coalesce((v_payload->>'vigente')::boolean,true),coalesce((v_payload->>'existente')::boolean,true),v_rel,
              v_payload->>'origem_autor',v_payload->>'origem_data',auth.uid())
            returning id into v_destino_id;
          end if;
        end if;
      exception when check_violation or foreign_key_violation or unique_violation or data_exception then
        v_estado:='conflito';
        v_motivo:=case when sqlstate='23514' then sqlerrm else 'Dados incompatíveis com a integridade do destino ('||sqlstate||').' end;
      end;
      update public.inspecoes_importacao_itens set estado=v_estado,destino_id=v_destino_id,motivo=v_motivo,
        aplicado_em=now() where lote_id=p_lote and colecao=v_item.colecao and source_id=v_item.source_id;
    end loop;
    update public.inspecoes_importacao_blocos set aplicado_em=now(),aplicado_por=auth.uid()
    where lote_id=p_lote and numero=p_bloco and aplicado_em is null;
  end if;
  return (select coalesce(jsonb_object_agg(estado,total),'{}') from (
    select estado,count(*) total from public.inspecoes_importacao_itens where lote_id=p_lote and bloco=p_bloco group by estado
  ) s);
end
$$;

create function public.inspecoes_importar_resumo(p_org uuid,p_lote uuid,p_concluir boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_lote public.inspecoes_importacao_lotes; v_aplicados integer; v_conflitos bigint;
begin
  perform public.inspecoes_importacao_exigir(p_org);
  select * into v_lote from public.inspecoes_importacao_lotes where organization_id=p_org and id=p_lote for update;
  if not found then raise exception 'Lote indisponível.' using errcode='42501'; end if;
  select count(*) into v_aplicados from public.inspecoes_importacao_blocos where lote_id=p_lote and aplicado_em is not null;
  select count(*) into v_conflitos from public.inspecoes_importacao_itens where lote_id=p_lote and estado='conflito';
  if p_concluir and v_lote.concluido_em is null and v_aplicados=v_lote.blocos and v_conflitos=0 then
    update public.inspecoes_importacao_lotes set concluido_em=now() where id=p_lote returning * into v_lote;
  end if;
  return jsonb_build_object('lote',to_jsonb(v_lote),'blocos_aplicados',v_aplicados,'conflitos',v_conflitos,
    'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by colecao,estado),'[]') from
      (select colecao,estado,count(*) total from public.inspecoes_importacao_itens where lote_id=p_lote group by colecao,estado) x));
end
$$;

revoke all on function public.inspecoes_importacao_executor(),public.inspecoes_importacao_exigir(uuid),
  public.inspecoes_importar_contexto(uuid,uuid,uuid,text,jsonb,jsonb,boolean,boolean),
  public.inspecoes_importar_iniciar(uuid,text,integer,date,integer),public.inspecoes_importar_estagiar(uuid,uuid,integer,jsonb),
  public.inspecoes_importar_aplicar(uuid,uuid,integer),public.inspecoes_importar_resumo(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_importar_contexto(uuid,uuid,uuid,text,jsonb,jsonb,boolean,boolean),
  public.inspecoes_importar_iniciar(uuid,text,integer,date,integer),public.inspecoes_importar_estagiar(uuid,uuid,integer,jsonb),
  public.inspecoes_importar_aplicar(uuid,uuid,integer),public.inspecoes_importar_resumo(uuid,uuid,boolean)
  to authenticated,service_role;

-- Só o executor da transferência confirma binários após releitura e SHA-256.
create function public.inspecoes_importar_arquivo(
  p_org uuid,p_colecao text,p_source_id text,p_arquivo jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_registro public.inspecoes_registros;
  v_anterior public.inspecoes_arquivos;
  v_id uuid := (p_arquivo->>'id')::uuid;
  v_estado text := p_arquivo->>'estado';
  v_derivado text;
begin
  perform public.inspecoes_importacao_exigir(p_org);
  if v_estado is null or v_estado not in ('original_pendente','snapshot_textual','referencia_externa',
    'original_verificado','falha_processamento') then
    raise exception 'Estado de arquivo desconhecido.' using errcode='23514';
  end if;
  if v_estado in ('original_verificado','falha_processamento') and not public.inspecoes_importacao_executor() then
    raise exception 'Confirmação de bytes exige o executor do armazenamento privado.' using errcode='42501';
  end if;
  select * into v_registro from public.inspecoes_registros where organization_id=p_org
    and colecao=p_colecao and source_id=p_source_id;
  if not found then
    raise exception 'Registro de destino do arquivo indisponível.' using errcode='23503';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':inspecoes:arquivo:'||v_id::text,0));
  select * into v_anterior from public.inspecoes_arquivos where id=v_id for update;
  if found and (v_anterior.organization_id,v_anterior.registro_id,v_anterior.papel,v_anterior.ordem,
    v_anterior.nome,v_anterior.legenda,v_anterior.origem) is distinct from
    (p_org,v_registro.id,p_arquivo->>'papel',(p_arquivo->>'ordem')::integer,p_arquivo->>'nome',
     p_arquivo->>'legenda',p_arquivo->>'origem') then
    raise exception 'A identidade do arquivo já foi registrada para outra origem.' using errcode='23514';
  end if;
  if v_estado in ('original_verificado','falha_processamento') and
    (p_arquivo->>'caminho' is null or p_arquivo->>'sha256' is null or p_arquivo->>'bytes' is null or p_arquivo->>'mime' is null)
  then
    raise exception 'A confirmação exige original, SHA-256, tamanho e MIME.' using errcode='23514';
  end if;
  if v_estado not in ('original_verificado','falha_processamento') and p_arquivo ? 'caminho' then
    raise exception 'Arquivo sem bytes verificados não pode anunciar um destino.' using errcode='23514';
  end if;
  if v_anterior.caminho is not null then
    if v_estado not in ('original_verificado','falha_processamento') then
      return jsonb_build_object('id',v_id,'estado',v_anterior.estado);
    end if;
    if (v_anterior.caminho,v_anterior.sha256,v_anterior.bytes,v_anterior.mime) is distinct from
      (p_arquivo->>'caminho',p_arquivo->>'sha256',(p_arquivo->>'bytes')::bigint,p_arquivo->>'mime') then
      raise exception 'O original confirmado é imutável. Use outro vínculo versionado.' using errcode='23514';
    end if;
    if (v_anterior.miniatura_caminho is not null and (v_anterior.miniatura_caminho,v_anterior.miniatura_sha256)
        is distinct from (p_arquivo->>'miniatura_caminho',p_arquivo->>'miniatura_sha256'))
      or (v_anterior.previa_caminho is not null and (v_anterior.previa_caminho,v_anterior.previa_sha256)
        is distinct from (p_arquivo->>'previa_caminho',p_arquivo->>'previa_sha256')) then
      raise exception 'Derivados confirmados são imutáveis.' using errcode='23514';
    end if;
  end if;
  foreach v_derivado in array array['miniatura','previa'] loop
    if p_arquivo->>(v_derivado||'_caminho') is not null and not exists(
      select 1 from storage.objects o where o.bucket_id='inspecoes-acervo'
        and o.name=p_arquivo->>(v_derivado||'_caminho')
        and o.metadata->>'mimetype'='image/webp'
        and o.metadata->>'size'=p_arquivo->>(v_derivado||'_bytes')
    ) then
      raise exception 'Derivado ainda não confirmado no armazenamento.' using errcode='23514';
    end if;
  end loop;
  insert into public.inspecoes_arquivos(id,organization_id,cliente_id,unidade_id,registro_id,papel,ordem,nome,legenda,
    estado,origem,caminho,sha256,bytes,mime,miniatura_caminho,miniatura_sha256,previa_caminho,previa_sha256,created_by)
  values(v_id,p_org,v_registro.cliente_id,v_registro.unidade_id,v_registro.id,p_arquivo->>'papel',
    (p_arquivo->>'ordem')::integer,p_arquivo->>'nome',p_arquivo->>'legenda',v_estado,p_arquivo->>'origem',
    p_arquivo->>'caminho',p_arquivo->>'sha256',(p_arquivo->>'bytes')::bigint,p_arquivo->>'mime',
    p_arquivo->>'miniatura_caminho',p_arquivo->>'miniatura_sha256',p_arquivo->>'previa_caminho',
    p_arquivo->>'previa_sha256',auth.uid())
  on conflict(id) do update set estado=excluded.estado,caminho=excluded.caminho,sha256=excluded.sha256,
    bytes=excluded.bytes,mime=excluded.mime,miniatura_caminho=excluded.miniatura_caminho,
    miniatura_sha256=excluded.miniatura_sha256,previa_caminho=excluded.previa_caminho,previa_sha256=excluded.previa_sha256;
  return jsonb_build_object('id',v_id,'estado',v_estado);
end
$$;
revoke all on function public.inspecoes_importar_arquivo(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.inspecoes_importar_arquivo(uuid,text,text,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
