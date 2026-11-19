-- A planilha interna ao layout mantém sua própria revisão e hash, separada dos laudos.
create table public.ca_inspecao_layout_revisoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, cliente_id uuid not null, unidade_id uuid not null,
  numero integer not null check(numero>=0), sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
  fonte_id uuid references public.ca_inspecao_fontes(id), registrado_em timestamptz not null default now(),
  foreign key(organization_id,cliente_id,unidade_id)
    references public.nr_cenas_unidade(organization_id,cliente_id,unidade_id),
  unique(organization_id,unidade_id,numero,sha256), unique(organization_id,unidade_id,id)
);
create table public.ca_inspecao_layout_linhas (
  revisao_id uuid not null references public.ca_inspecao_layout_revisoes(id),
  codigo text not null check(codigo~'^[0-9]{2,6}(\.[0-9]{1,4})?$'),
  descricao text not null check(length(descricao) between 2 and 1000),
  lacre text check(lacre is null or (length(lacre)<=160 and lacre~'^[0-9]+( / [0-9]+)*$')),
  primary key(revisao_id,codigo)
);
create table public.ca_inspecao_layout_atual (
  organization_id uuid not null, unidade_id uuid not null, revisao_id uuid not null,
  conflito boolean not null default false,
  primary key(organization_id,unidade_id),
  foreign key(organization_id,unidade_id,revisao_id)
    references public.ca_inspecao_layout_revisoes(organization_id,unidade_id,id)
);
create trigger ca_inspecao_layout_revisao_preservar before update or delete on public.ca_inspecao_layout_revisoes
  for each row execute function public.ca_inspecao_imutavel();
create trigger ca_inspecao_layout_linha_preservar before update or delete on public.ca_inspecao_layout_linhas
  for each row execute function public.ca_inspecao_imutavel();
alter table public.ca_inspecao_layout_revisoes enable row level security;
alter table public.ca_inspecao_layout_linhas enable row level security;
alter table public.ca_inspecao_layout_atual enable row level security;
revoke all on public.ca_inspecao_layout_revisoes,public.ca_inspecao_layout_linhas,public.ca_inspecao_layout_atual
  from public,anon,authenticated,service_role;

create function public.ca_inspecao_lacres_iguais(a text,b text) returns boolean
language sql immutable set search_path='' as $$
  select case when a is null or b is null then a is not distinct from b else
    array(select distinct unnest(string_to_array(a,' / ')) order by 1)=
    array(select distinct unnest(string_to_array(b,' / ')) order by 1) end
$$;

create function public.ca_inspecao_layout_registrar(p_revision integer,p_sha text,p_rows jsonb,p_fonte uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare contexto public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto();
  atual public.ca_inspecao_layout_revisoes; eid uuid; linha jsonb; dados jsonb; original jsonb;
  total integer; estado text;
begin
  if contexto.organization_id is null then raise exception 'Unidade indisponível.' using errcode='42501'; end if;
  if p_fonte is not null and not exists(select 1 from public.ca_inspecao_fontes f
    where (f.id,f.organization_id,f.unidade_id,f.tipo)=(p_fonte,contexto.organization_id,contexto.unidade_id,'layout')
    and f.disponivel) then raise exception 'Fonte de layout indisponível.' using errcode='42501'; end if;
  if p_revision is null or p_revision not between 0 and 99999 or coalesce(p_sha,'')!~'^[a-f0-9]{64}$'
     or jsonb_typeof(p_rows) is distinct from 'array' or octet_length(p_rows::text)>1048576 then
    raise exception 'Revisão de implantação inválida.' using errcode='23514';
  end if;
  total:=jsonb_array_length(p_rows);
  if total not between 1 and 300 then raise exception 'Tabela de implantação vazia ou extensa.' using errcode='23514'; end if;
  for linha in select jsonb_array_elements(p_rows) loop
    perform public.ag_payload(linha,array['code','description','seal']);
    if jsonb_typeof(linha->'code') is distinct from 'string'
      or coalesce(linha->>'code','')!~'^[0-9]{2,6}(\.[0-9]{1,4})?$'
      or jsonb_typeof(linha->'description') is distinct from 'string'
      or coalesce(length(trim(linha->>'description')),0) not between 2 and 1000
      or (linha->>'seal' is not null and (jsonb_typeof(linha->'seal') is distinct from 'string'
        or length(linha->>'seal')>160 or linha->>'seal' !~ '^[0-9]+( / [0-9]+)*$')) then
      raise exception 'Linha do layout sem código, descrição ou lacre válido.' using errcode='23514';
    end if;
  end loop;
  if (select count(distinct x->>'code') from jsonb_array_elements(p_rows) as r(x))<>total then
    raise exception 'A tabela contém código LVHF duplicado.' using errcode='23514';
  end if;
  select jsonb_agg(jsonb_build_object('code',x->>'code','description',trim(x->>'description'),'seal',x->>'seal')
      order by x->>'code') into dados from jsonb_array_elements(p_rows) as r(x);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cruz-alta:layout:'||contexto.unidade_id::text,0));
  select r.* into atual from public.ca_inspecao_layout_atual a join public.ca_inspecao_layout_revisoes r
    on r.id=a.revisao_id where (a.organization_id,a.unidade_id)=(contexto.organization_id,contexto.unidade_id);
  insert into public.ca_inspecao_layout_revisoes(organization_id,cliente_id,unidade_id,numero,sha256,fonte_id)
    values(contexto.organization_id,contexto.cliente_id,contexto.unidade_id,p_revision,p_sha,p_fonte)
    on conflict(organization_id,unidade_id,numero,sha256) do nothing returning id into eid;
  if eid is null then
    select r.id into strict eid from public.ca_inspecao_layout_revisoes r where
      (r.organization_id,r.unidade_id,r.numero,r.sha256)=(contexto.organization_id,contexto.unidade_id,p_revision,p_sha);
    select jsonb_agg(jsonb_build_object('code',l.codigo,'description',l.descricao,'seal',l.lacre) order by l.codigo)
      into original from public.ca_inspecao_layout_linhas l where l.revisao_id=eid;
    if original is distinct from dados then
      raise exception 'O mesmo PDF já possui uma tabela conferida diferente.' using errcode='23514';
    end if;
  else
    insert into public.ca_inspecao_layout_linhas(revisao_id,codigo,descricao,lacre)
      select eid,x->>'code',x->>'description',x->>'seal' from jsonb_array_elements(dados) as r(x);
  end if;
  if atual.id is null or p_revision>atual.numero then
    insert into public.ca_inspecao_layout_atual values(contexto.organization_id,contexto.unidade_id,eid,false)
      on conflict(organization_id,unidade_id) do update set revisao_id=excluded.revisao_id,conflito=false;
    estado:='adopted';
  elsif p_revision<atual.numero then
    estado:='historical';
  elsif atual.id=eid then
    estado:='same';
  else
    update public.ca_inspecao_layout_atual set conflito=true
    where (organization_id,unidade_id)=(contexto.organization_id,contexto.unidade_id) and not conflito;
    estado:=case when found then 'conflict' else 'known_conflict' end;
  end if;
  if estado in ('adopted','conflict') then
    update public.ca_inspecao_linhas l set versao=l.versao+1 where
      (l.organization_id,l.unidade_id)=(contexto.organization_id,contexto.unidade_id);
  end if;
  return jsonb_build_object('state',case when estado='known_conflict' then 'conflict' else estado end,
    'revision',p_revision,'rows',total,'currentRevision',greatest(atual.numero,p_revision));
end $$;

-- Recebe os campos vistos na tabela privada do layout por um operador de backend.
create function public.ca_inspecao_layout_conferido(p_revision integer,p_sha text,p_rows jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select public.ca_inspecao_layout_registrar(p_revision,p_sha,p_rows,null)
$$;

create function public.ca_inspecao_layout_linha(p_org uuid,p_unit uuid,p_key text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('description',l.descricao,'revision',r.numero,'conflict',a.conflito,
    'seal',case when l.lacre is not null then jsonb_build_object(
      'value',l.lacre,'page',1,'revision',r.numero,'source','layout') end)
  from public.ca_inspecao_layout_atual a join public.ca_inspecao_layout_revisoes r on r.id=a.revisao_id
  join public.nr_cena_elementos e on e.cena='tres-tentos-cruz-alta' and e.chave=p_key and e.tipo='lvhf'
  join public.ca_inspecao_layout_linhas l on l.revisao_id=r.id and l.codigo=e.codigo
  where (a.organization_id,a.unidade_id)=(p_org,p_unit)
$$;

-- Lacres de laudos e placas usam a mesma cadeia de evidências e revisão dos campos de data.
alter function public.ca_inspecao_item(uuid,uuid,text,boolean) rename to ca_inspecao_item_documental;
create function public.ca_inspecao_item(p_org uuid,p_unit uuid,p_key text,p_reviewer boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item jsonb:=public.ca_inspecao_item_documental(p_org,p_unit,p_key,p_reviewer);
  plano jsonb:=public.ca_inspecao_layout_linha(p_org,p_unit,p_key);
  lacre_pdf jsonb:=item#>'{fields,seal}'; lacre_layout jsonb:=nullif(plano->'seal','null');
  divergente boolean; disputa boolean;
begin
  if item is null then return null; end if;
  divergente:=lacre_pdf->>'origin'='drive' and lacre_layout is not null and
    not public.ca_inspecao_lacres_iguais(lacre_pdf->>'value',lacre_layout->>'value');
  disputa:=coalesce((plano->>'conflict')::boolean,false) or coalesce(divergente,false);
  if disputa then
    item:=item || jsonb_build_object('reviewRequired',true,
      'availability',case when item->>'availability'='stale' then 'stale' else 'review' end,
      'issues',(item->'issues') || jsonb_build_array('Há divergência na identificação conferida do layout.'));
  end if;
  if divergente then
    select item || jsonb_build_object('documents',coalesce(jsonb_agg(
      case when d->>'id'=lacre_pdf->>'evidence' and d->>'state'='approved' then
        d || jsonb_build_object('state','pending') ||
          case when p_reviewer then jsonb_build_object('issues',coalesce(d->'issues','[]') ||
            jsonb_build_array('Lacre diferente do layout conferido.')) else '{}' end
      else d end order by pos),'[]'))
    into item from jsonb_array_elements(item->'documents') with ordinality as docs(d,pos);
  end if;
  return item || jsonb_build_object('description',plano->>'description',
    'descriptionRevision',plano->'revision','layoutConflict',coalesce((plano->>'conflict')::boolean,false),
    'layoutSeal',lacre_layout,'seal',case
    when lacre_pdf is not null and lacre_pdf->>'origin' is distinct from 'drive'
      then lacre_pdf || jsonb_build_object('source','pdf')
    when lacre_layout is not null then lacre_layout
    when lacre_pdf is not null then lacre_pdf || jsonb_build_object('source','pdf') end);
end $$;

create or replace function public.ca_inspecao_sync_processar(p_lote uuid,p_source jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_inspecao_sync_contexto(); l public.ca_inspecao_lotes;
  s public.ca_inspecao_fontes; eid uuid; code text; campo text; valor jsonb;
  hash text:=p_result->>'sha256'; bytes bigint:=(p_result->>'size')::bigint;
  paginas integer:=coalesce((p_result->>'pages')::integer,0); campos jsonb:=p_result->'fields';
  restricao jsonb:=nullif(p_result->'restriction','null'); issues jsonb:=p_result->'issues';
  lacre jsonb:=nullif(p_result->'seal','null'); layout jsonb:=nullif(p_result->'layout','null');
  keys text[]; antigo uuid; inequivoca boolean; novo_campos jsonb; rev integer;
begin
  select * into strict l from public.ca_inspecao_lotes where id=p_lote;
  if c.organization_id is null then raise exception 'Contexto da unidade indisponível.' using errcode='42501'; end if;
  select * into strict s from public.ca_inspecao_fontes where
    (organization_id,unidade_id,raiz,drive_id)=(c.organization_id,c.unidade_id,l.raiz,p_source->>'id') for update;
  if not s.disponivel or s.versao<>(p_source->>'version')::numeric(30,0) then return; end if;
  if s.versao_processada=s.versao then return; end if;
  perform public.ag_payload(p_result,array['kind','status','sha256','size','itemKeys','fields','restriction','issues','pages','seal','layout']);
  if coalesce(p_result->>'status','') not in ('verified','review','ready')
     or jsonb_typeof(p_result->'itemKeys') is distinct from 'array' or jsonb_array_length(p_result->'itemKeys')>100
     or jsonb_typeof(campos) is distinct from 'object' or paginas not between 0 and 5000
     or jsonb_typeof(issues) is distinct from 'array' or jsonb_array_length(issues)>30
     or exists(select 1 from jsonb_array_elements(issues) as e(i) where jsonb_typeof(i)<>'string' or length(i #>> '{}')>600)
  then raise exception 'Resultado documental inválido.' using errcode='23514'; end if;

  select coalesce(array_agg(distinct k),'{}') into keys from jsonb_array_elements_text(p_result->'itemKeys') as a(k);
  if cardinality(keys)>0 and (cardinality(keys)<>1 or
     keys[1] is distinct from case when s.tipo='layout' then 'unidade' else 'lvhf-'||(s.meta->>'code') end)
  then raise exception 'Associação distinta da identificação confirmada no inventário.' using errcode='23514'; end if;
  foreach code in array keys loop
    if not exists(select 1 from public.nr_cena_elementos e where e.cena=c.cena and e.chave=code
      and (e.tipo='lvhf' or (s.tipo='layout' and code='unidade'))) then
      raise exception 'Chave documental desconhecida.' using errcode='23514';
    end if;
  end loop;

  if layout is not null then
    perform public.ag_payload(layout,array['revision','sha256','rows']);
    if s.tipo<>'layout' or cardinality(keys)<>1 or keys[1]<>'unidade' or hash is not null
      or coalesce(layout->>'revision','')!~'^\d{1,5}$'
      or (s.meta->>'sha256' is not null and layout->>'sha256' is distinct from s.meta->>'sha256') then
      raise exception 'Tabela fora da revisão observada no layout.' using errcode='23514';
    end if;
    perform public.ca_inspecao_layout_registrar((layout->>'revision')::integer,layout->>'sha256',layout->'rows',s.id);
  end if;
  if campos ? 'seal' then
    raise exception 'O lacre deve ser fornecido pela evidência identificada.' using errcode='23514';
  end if;
  if lacre is not null then
    if hash is null or cardinality(keys)<>1 then
      raise exception 'Lacre sem PDF associado a uma única linha LVHF.' using errcode='23514';
    end if;
    campos:=campos || jsonb_build_object('seal',lacre);
  end if;

  if hash is null then
    if bytes is not null or campos<>'{}' or restricao is not null or paginas<>0 then
      raise exception 'Extração sem original indisponível.' using errcode='23514';
    end if;
    if s.tipo in ('laudo','placa') and jsonb_array_length(issues)=0 then
      issues:=jsonb_build_array('Ausência de original validado para conferência.');
    end if;
    update public.ca_inspecao_fontes set versao_processada=s.versao,problemas=issues,chaves=keys
      where id=s.id;
    perform public.ca_inspecao_sync_invalidar(s.id);
    return;
  end if;

  if s.tipo not in ('laudo','placa') or hash !~ '^[a-f0-9]{64}$'
    or bytes is null or bytes not between 10 and 52428800
    or (s.meta->>'size' is not null and bytes is distinct from (s.meta->>'size')::bigint)
    or (s.meta->>'sha256' is not null and hash is distinct from s.meta->>'sha256')
    or not exists(select 1 from storage.objects o
      where o.bucket_id='nexus-cruz-alta-laudos' and o.name=hash||'.pdf'
        and o.metadata->>'size'=bytes::text and o.metadata->>'mimetype'='application/pdf')
  then raise exception 'PDF privado ainda não confirmado.' using errcode='23514'; end if;

  for campo,valor in select * from jsonb_each(campos) loop
    perform public.ag_payload(valor,array['value','page','label']);
    if campo not in ('installation','rt','inspection','due','seal')
      or coalesce(length(trim(valor->>'value')),0) not between 1 and 300
      or coalesce(length(trim(valor->>'label')),0) not between 1 and 140
      or coalesce(valor->>'page','') !~ '^\d{1,4}$' or (valor->>'page')::integer not between 1 and paginas
      or (campo in ('installation','inspection','due') and valor->>'value' !~ '^\d{4}-\d{2}-\d{2}$')
      or (campo='seal' and (jsonb_typeof(valor->'value') is distinct from 'string'
        or length(valor->>'value')>160 or valor->>'value' !~ '^[0-9]+( / [0-9]+)*$'))
      then raise exception 'Campo documental sem página ou valor válido.' using errcode='23514'; end if;
    if campo in ('installation','inspection','due') then perform (valor->>'value')::date; end if;
  end loop;
  if restricao is not null then
    perform public.ag_payload(restricao,array['text','page']);
    if coalesce(length(trim(restricao->>'text')),0) not between 1 and 6000
      or coalesce(restricao->>'page','') !~ '^\d{1,4}$' or (restricao->>'page')::integer not between 1 and paginas
    then raise exception 'Aviso documental sem página ou valor válido.' using errcode='23514'; end if;
  end if;

  if cardinality(keys)=0 and jsonb_array_length(issues)=0 then
    issues:=jsonb_build_array('Associação com item LVHF requer conferência.');
  end if;
  if campos ? 'due' and campos ? 'inspection' and
    (campos#>>'{due,value}')::date < (campos#>>'{inspection,value}')::date then
    issues:=issues || jsonb_build_array('A validade extraída é anterior à inspeção.');
  end if;
  inequivoca:=cardinality(keys)=1 and paginas>0 and jsonb_array_length(issues)=0 and campos<>'{}'
    and p_result->>'status'='verified';
  rev:=(s.meta->>'revision')::integer;
  antigo:=s.evidencia_atual;
  insert into public.ca_inspecao_evidencias(fonte_id,sha256,tamanho,nome,tipo,versao,revisao,modificado_em,
    paginas,campos,restricao,problemas,extracao_inequivoca)
  values(s.id,hash,bytes,s.nome,s.tipo,s.versao,rev,(s.meta->>'modifiedAt')::timestamptz,
    paginas,campos,restricao,issues,inequivoca)
  on conflict(fonte_id,sha256) do nothing returning id into eid;
  if eid is null then
    select e.id,e.campos,e.extracao_inequivoca,e.revisao into strict eid,campos,inequivoca,rev
    from public.ca_inspecao_evidencias e where e.fonte_id=s.id and e.sha256=hash;
  end if;
  foreach code in array keys loop
    insert into public.ca_inspecao_linhas(organization_id,cliente_id,unidade_id,chave)
    values(c.organization_id,c.cliente_id,c.unidade_id,code) on conflict do nothing;
    insert into public.ca_inspecao_vinculos(organization_id,unidade_id,chave,evidencia_id)
    values(c.organization_id,c.unidade_id,code,eid) on conflict do nothing;
    if inequivoca then
      select ll.campos into novo_campos from public.ca_inspecao_linhas ll
        where (ll.organization_id,ll.unidade_id,ll.chave)=(c.organization_id,c.unidade_id,code) for update;
      for campo,valor in select * from jsonb_each(campos) loop
        if campo='seal' and exists(select 1 from
          (select public.ca_inspecao_layout_linha(c.organization_id,c.unidade_id,code) p) layout_ativo
          where p#>>'{seal,value}' is not null and
            not public.ca_inspecao_lacres_iguais(p#>>'{seal,value}',valor->>'value')) then continue; end if;
        if (not novo_campos ? campo or (novo_campos->campo->>'origin'='drive'
          and exists(select 1 from public.ca_inspecao_evidencias prev
            where prev.id::text=novo_campos->campo->>'evidence' and (
              (prev.tipo=s.tipo and rev>prev.revisao)
              or lower(trim(novo_campos->campo->>'value'))=lower(trim(valor->>'value'))
                and (prev.id=eid or (prev.tipo='placa' and s.tipo='laudo'))
            )))) and not exists(
            select 1 from public.ca_inspecao_vinculos v join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
            join public.ca_inspecao_fontes f on f.id=e.fonte_id
            where (v.organization_id,v.unidade_id,v.chave)=(c.organization_id,c.unidade_id,code)
              and e.id<>eid and e.extracao_inequivoca
              and ((e.tipo=s.tipo and e.revisao=rev and e.sha256<>hash)
                or (f.evidencia_atual=e.id and f.disponivel and (e.tipo<>s.tipo or e.revisao>=rev)
                  and e.campos ? campo and lower(trim(e.campos->campo->>'value'))<>lower(trim(valor->>'value'))))
              and coalesce((select dd.acao from public.ca_inspecao_decisoes dd where
                (dd.organization_id,dd.unidade_id,dd.chave,dd.evidencia_id)=(v.organization_id,v.unidade_id,v.chave,e.id)
                order by dd.versao desc limit 1),'')<>'dismiss'
        ) then
          novo_campos:=jsonb_set(novo_campos,array[campo],
            valor || jsonb_build_object('evidence',eid,'origin','drive'),true);
        end if;
      end loop;
      if not (novo_campos ? 'due' and novo_campos ? 'inspection' and
        (novo_campos#>>'{due,value}')::date < (novo_campos#>>'{inspection,value}')::date) then
        update public.ca_inspecao_linhas ll set campos=novo_campos where
          (ll.organization_id,ll.unidade_id,ll.chave)=(c.organization_id,c.unidade_id,code);
      end if;
    end if;
  end loop;
  update public.ca_inspecao_fontes set evidencia_atual=eid,versao_processada=s.versao,
    problemas=case when cardinality(keys)=0 then issues else '[]'::jsonb end,chaves=keys where id=s.id;
  if antigo is distinct from eid or s.versao_processada is distinct from s.versao then
    perform public.ca_inspecao_sync_invalidar(s.id);
  end if;
end $$;

create or replace function public.ca_inspecao_review(
  p_org uuid,p_key text,p_version integer,p_decisions jsonb,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.nr_cenas_unidade:=public.ca_contexto(p_org);
  perfil uuid; l public.ca_inspecao_linhas; r public.ca_inspecao_evidencias;
  s public.ca_inspecao_fontes; eid uuid; campo text; novos_campos jsonb; novo_aviso jsonb;
  nota text:=trim(coalesce(p_note,'')); acao text:=p_decisions->>'action';
  decisao text:=coalesce(p_decisions#>>'{restriction,action}','keep'); anterior jsonb;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  perfil:=public.ca_inspecao_revisor(p_org);
  if perfil is null then raise exception 'A conferência exige um revisor técnico autorizado.' using errcode='42501'; end if;
  perform public.ag_payload(p_decisions,array['evidence','action','adopt','restriction']);
  if p_decisions ? 'restriction' then perform public.ag_payload(p_decisions->'restriction',array['action']); end if;
  if p_version is null or acao is null or acao not in ('approve','dismiss') or decisao not in ('keep','adopt','remove')
    or length(nota)>2500 or (acao='dismiss' or decisao='remove') and nota=''
    or jsonb_typeof(coalesce(p_decisions->'adopt','[]')) is distinct from 'array'
    or coalesce(p_decisions->>'evidence','') !~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'
  then raise exception 'Decisão técnica inválida ou justificativa ausente.' using errcode='23514'; end if;
  eid:=(p_decisions->>'evidence')::uuid;
  select * into l from public.ca_inspecao_linhas
    where (organization_id,unidade_id,chave)=(p_org,c.unidade_id,p_key) for update;
  if not found then raise exception 'Linha indisponível nesta revisão.' using errcode='42501'; end if;
  if l.versao is distinct from p_version then
    raise exception 'A linha mudou. Atualize antes de confirmar.' using errcode='PT409';
  end if;
  select e.* into r from public.ca_inspecao_evidencias e join public.ca_inspecao_vinculos v on v.evidencia_id=e.id
    where (v.organization_id,v.unidade_id,v.chave,v.evidencia_id)=(p_org,c.unidade_id,p_key,eid);
  if not found then raise exception 'Laudo indisponível neste destino.' using errcode='42501'; end if;
  begin
    select * into s from public.ca_inspecao_fontes where id=r.fonte_id for share nowait;
  exception when lock_not_available then
    raise exception 'A fonte está sendo conferida. Atualize antes de decidir.' using errcode='PT409';
  end;
  if (s.organization_id,s.unidade_id) is distinct from (p_org,c.unidade_id)
     or not s.disponivel or s.evidencia_atual is distinct from eid or s.versao_processada is distinct from s.versao then
    raise exception 'A fonte foi alterada ou está indisponível. Confira a revisão atual.' using errcode='PT409';
  end if;
  if exists(select 1 from public.ca_inspecao_vinculos v join public.ca_inspecao_evidencias e on e.id=v.evidencia_id
    join public.ca_inspecao_fontes f on f.evidencia_atual=e.id
    where (v.organization_id,v.unidade_id,v.chave)=(p_org,c.unidade_id,p_key)
      and e.tipo=r.tipo and e.revisao>r.revisao and e.extracao_inequivoca and f.disponivel
      and coalesce((select dd.acao from public.ca_inspecao_decisoes dd where
        (dd.organization_id,dd.unidade_id,dd.chave,dd.evidencia_id)=(p_org,c.unidade_id,p_key,e.id)
        order by dd.versao desc limit 1),'')<>'dismiss') then
    raise exception 'Existe uma revisão documental mais recente nesta linha.' using errcode='PT409';
  end if;

  novos_campos:=l.campos;
  novo_aviso:=l.restricao;
  anterior:=jsonb_build_object('fields',novos_campos,'restriction',novo_aviso);
  if acao='dismiss' and (decisao<>'keep' or jsonb_array_length(coalesce(p_decisions->'adopt','[]'))>0
    or l.restricao->>'evidence'=eid::text or exists(
      select 1 from jsonb_each(l.campos) f where f.value->>'evidence'=eid::text
    )) then
    raise exception 'Descartar uma evidência não altera dados publicados.' using errcode='23514';
  end if;
  if acao='approve' then
    for campo in select jsonb_array_elements_text(coalesce(p_decisions->'adopt','[]')) loop
      if campo not in ('installation','rt','inspection','due','seal') or not r.campos ? campo then
        raise exception 'O campo não consta da revisão conferida.' using errcode='23514';
      end if;
      novos_campos:=jsonb_set(novos_campos,array[campo],r.campos->campo || jsonb_build_object('evidence',r.id),true);
    end loop;
    if r.restricao is not null and not p_decisions ? 'restriction' then
      raise exception 'Escolha como tratar o aviso da revisão.' using errcode='23514';
    end if;
    if decisao='adopt' then
      if r.restricao is null or r.tipo not in ('laudo','placa') then
        raise exception 'O aviso deve constar da revisão conferida.' using errcode='23514';
      end if;
      novo_aviso:=r.restricao || jsonb_build_object('evidence',r.id);
    elsif decisao='remove' then
      if l.restricao is null or r.tipo<>'laudo' or r.restricao is not null or jsonb_array_length(r.problemas)>0 then
        raise exception 'A remoção exige um laudo atual sem aviso ou pendência de leitura.' using errcode='23514';
      end if;
      novo_aviso:=null;
    end if;
  end if;
  if novos_campos ? 'due' and novos_campos ? 'inspection' and
    (novos_campos#>>'{due,value}')::date < (novos_campos#>>'{inspection,value}')::date then
    raise exception 'Validade anterior à inspeção. Confira os dois campos.' using errcode='23514';
  end if;
  update public.ca_inspecao_linhas ll set campos=novos_campos,restricao=novo_aviso,
    versao=ll.versao+1 where (ll.organization_id,ll.unidade_id,ll.chave)=(p_org,c.unidade_id,p_key);
  insert into public.ca_inspecao_decisoes(organization_id,unidade_id,chave,versao,evidencia_id,autor,profissional_id,
    acao,nota,antes,depois,pedido)
  values(p_org,c.unidade_id,p_key,l.versao+1,eid,auth.uid(),perfil,acao,nota,anterior,
    jsonb_build_object('fields',novos_campos,'restriction',novo_aviso),p_decisions);
  return public.ca_inspecao_item(p_org,c.unidade_id,p_key,true);
end $$;

revoke all on function public.ca_inspecao_item(uuid,uuid,text,boolean),
  public.ca_inspecao_item_documental(uuid,uuid,text,boolean),
  public.ca_inspecao_sync_processar(uuid,jsonb,jsonb),
  public.ca_inspecao_lacres_iguais(text,text),public.ca_inspecao_layout_registrar(integer,text,jsonb,uuid),
  public.ca_inspecao_layout_linha(uuid,uuid,text),public.ca_inspecao_layout_conferido(integer,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ca_inspecao_layout_conferido(integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
