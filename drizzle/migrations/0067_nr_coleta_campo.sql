-- Field collection uses the existing NR identities, answers and pinned model versions.
create table public.nr_coleta_revisoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  levantamento_id uuid not null,
  numero integer not null check (numero > 0),
  levantamento_version integer not null,
  snapshot jsonb not null,
  sha256 text not null,
  documento_id uuid not null,
  documento_tecnico_id uuid,
  itens_confirmados jsonb not null default '[]',
  estado text not null default 'em_revisao' check (estado in ('em_revisao','devolvida','aprovada')),
  motivo text,
  concluida_por uuid not null references auth.users(id),
  concluida_em timestamptz not null default clock_timestamp(),
  revisada_por uuid references public.pessoas(id),
  revisada_em timestamptz,
  unique (organization_id, levantamento_id, numero),
  unique (organization_id, levantamento_id, levantamento_version),
  foreign key (organization_id, levantamento_id) references public.nr_levantamentos(organization_id,id),
  foreign key (organization_id, documento_id) references public.nr_documentos(organization_id,id),
  foreign key (organization_id, documento_tecnico_id) references public.nr_documentos(organization_id,id)
);
alter table public.nr_coleta_revisoes enable row level security;
revoke all on public.nr_coleta_revisoes from public, anon, authenticated, service_role;

create function public.nr_coleta_roteiro_altura() returns jsonb
language sql immutable set search_path='' as $$
  with campos(bloco,ordem,chave,nome,tipo,obrigatorio,unidade) as (values
    (1,1,'tarefa','Tarefa prevista','texto_longo',true,null),
    (1,2,'area','Área, setor e ativo','texto',true,null),
    (2,1,'acesso','Acesso e percurso previsto','texto_longo',true,null),
    (2,2,'desnivel','Desnível observado','numero',false,'m'),
    (2,3,'bordas','Bordas, aberturas e obstáculos','texto_longo',false,null),
    (2,4,'fragilidade','Superfícies frágeis e condições da cobertura','texto_longo',false,null),
    (3,1,'protecao','Proteções coletivas observadas','texto_longo',false,null),
    (3,2,'sistemas','Ancoragens e linhas de vida · posição, identificação, tipo e condição','texto_longo',false,null),
    (3,3,'documentos','Projeto, laudo, ART e inspeções apresentados','texto_longo',false,null),
    (4,1,'vista','Vista geral e identificação','foto',false,null),
    (4,2,'detalhes','Evidências de acesso, medidas e proteções','foto',false,null),
    (4,3,'pendencias','Pendências e informações não verificadas','texto_longo',false,null)
  ), blocos(n,titulo) as (values
    (1,'Identificação e tarefa'),(2,'Acesso, percurso e superfície'),
    (3,'Proteções, ancoragens e documentos'),(4,'Evidências e fechamento')
  )
  select jsonb_build_object('id','NXS-ALT-COLETA-01','familias',jsonb_build_array('telhado_laje'),
    'blocos', jsonb_agg(jsonb_build_object('id','A0'||n,'codigo','A0'||n,'titulo',titulo,
    'campos',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id','A0'||n||'.'||chave,
       'nome',nome,'tipo',tipo,'obrigatorio',obrigatorio,'unidade',unidade)) order by ordem)
       from campos where bloco=n)) order by n)) from blocos
$$;

create function public.nr_coleta_contexto(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,
  p_local uuid default null,p_busca text default '',p_pagina integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais; modelos jsonb:='[]'; locais jsonb; total integer;
begin
  if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Unidade indisponível.' using errcode='42501';
  end if;
  if p_local is not null then
    select * into l from public.nr_locais where organization_id=p_org and cliente_id=p_cliente
      and unidade_id=p_unidade and id=p_local and arquivado_em is null and p_norma=any(normas);
    if not found then raise exception 'Local indisponível nesta norma.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'titulo',m.titulo,'normas',m.normas,
      'version',m.version,'numero',v.numero,'familias',m.dados->'familias') order by
      (m.unidade_id is not null) desc,(m.cliente_id is not null) desc,m.titulo,m.id),'[]') into modelos
    from public.nr_modelos m
    left join lateral (select numero from public.nr_modelo_versoes
      where organization_id=m.organization_id and modelo_id=m.id and dados=m.dados and conteudo=m.conteudo
      order by numero desc limit 1) v on true
    where m.organization_id=p_org and m.tipo='levantamento' and m.arquivado_em is null
      and (m.estado='publicado' or exists(select 1 from public.nr_fontes f
        join public.nr_modelo_versoes s on s.organization_id=f.organization_id
         and s.modelo_id=m.id and s.sha256=f.sha256 and s.dados=m.dados and s.conteudo=m.conteudo
        where f.organization_id=p_org and f.destino_id=m.id and f.tipo='modelo_levantamento'))
      and p_norma=any(m.normas)
      and (m.cliente_id is null or m.cliente_id=p_cliente)
      and (m.unidade_id is null or m.unidade_id=p_unidade)
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(m.dados->'blocos')='array'
        then m.dados->'blocos' else '[]' end) b where jsonb_typeof(b->'campos')='array'
        and jsonb_array_length(b->'campos')>0)
      and (not (m.dados?'familias') or m.dados->'familias' ? coalesce(l.familia,''))
      and (m.dados->>'id' is distinct from 'MLT-EC-R00' or 'NR33'=any(l.normas));
  end if;
  with matches as materialized (
    select id,tag,titulo,familia,normas,aliases
    from public.nr_locais where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade
      and arquivado_em is null and p_norma=any(normas)
      and (p_local is null or id=p_local)
      and position(lower(trim(coalesce(p_busca,''))) in lower(concat_ws(' ',tag,titulo,array_to_string(aliases,' '))))>0
  ), page as (
    select * from matches order by public.nr_tag_ordem(tag),tag,id
    offset greatest(0,least(100000,coalesce(p_pagina,0)))*25 limit 25
  )
  select (select count(*) from matches),coalesce(jsonb_agg(to_jsonb(page)||
    jsonb_build_object('rascunho_id',(select s.id from public.nr_levantamentos s
    where s.organization_id=p_org and s.local_id=page.id and s.arquivado_em is null
      and s.estado='rascunho' and p_norma=any(s.normas)
    order by s.updated_at desc,s.id limit 1))),'[]') into total,locais from page;
  return jsonb_build_object('locais',locais,'total',total,'modelos',modelos,
    'piloto_altura',coalesce(p_norma='NR35' and l.familia='telhado_laje' and not 'NR33'=any(l.normas),false));
end;
$$;

create function public.nr_coleta_iniciar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,
  p_local uuid,p_modelo uuid,p_modelo_version integer,p_duplo boolean,p_origem uuid,p_chave uuid,p_reinspecao boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.nr_locais; s public.nr_levantamentos; m public.nr_modelos;
  v_normas text[]; v_dados jsonb; respostas jsonb:='{}'; origem jsonb; modelo uuid:=p_modelo;
  pedido jsonb; recibo jsonb; anterior uuid; novo jsonb; pessoa public.pessoas;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if p_chave is null or not public.pode(p_org,'cadastrar_nr')
     or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Criação indisponível.' using errcode='42501';
  end if;
  select * into l from public.nr_locais where organization_id=p_org and cliente_id=p_cliente
    and unidade_id=p_unidade and id=p_local and arquivado_em is null and p_norma=any(nr_locais.normas) for share;
  if not found then raise exception 'Local indisponível.' using errcode='42501'; end if;
  v_normas:=array[p_norma];
  if p_duplo then
    if not array['NR33','NR35'] <@ l.normas or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,'NR33')
      or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,'NR35') then
      raise exception 'Confirme os dois escopos no cadastro do local.' using errcode='23514';
    end if;
    v_normas:=array['NR33','NR35'];
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-coleta:'||p_org||':'||p_local,0));
  pedido:=jsonb_build_object('local',p_local,'normas',v_normas,'modelo',p_modelo,'versao',p_modelo_version,'origem',p_origem,'reinspecao',p_reinspecao);
  recibo:=public.operacao_repetir(p_org,p_chave,'nr_coleta:iniciar',pedido);
  if recibo is not null then
    perform public.nr_consultar(p_org,p_norma,'levantamentos',jsonb_build_object('id',recibo->>'id','unidade_id',p_unidade));
    return recibo;
  end if;
  select id into anterior from public.nr_levantamentos where organization_id=p_org
    and local_id=p_local and p_norma=any(nr_levantamentos.normas) and arquivado_em is null
    and estado='rascunho' and id is distinct from p_origem
    order by updated_at desc,id limit 1;
  if anterior is not null then
    return jsonb_build_object('id',anterior,'existente',true);
  end if;

  if p_modelo is null then
    if not coalesce((public.nr_coleta_contexto(p_org,p_cliente,p_unidade,p_norma,p_local)->>'piloto_altura')::boolean,false) then
      raise exception 'Selecione um roteiro estruturado compatível.' using errcode='23514';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-coleta-altura:'||p_org,0));
    v_dados:=public.nr_coleta_roteiro_altura();
    select id into modelo from public.nr_modelos where organization_id=p_org
      and tipo='levantamento' and arquivado_em is null and estado='publicado'
      and nr_modelos.dados=v_dados and nr_modelos.normas=array['NR35'] limit 1;
    if modelo is null then
      insert into public.nr_modelos(organization_id,normas,tipo,estado,titulo,dados)
      values(p_org,array['NR35'],'levantamento','publicado','Coleta de campo · Telhado ou laje',v_dados)
      returning id into modelo;
    end if;
  else
    select * into m from public.nr_modelos where organization_id=p_org and id=p_modelo for share;
    if not found or m.version is distinct from p_modelo_version or not v_normas <@ m.normas
      or not exists(select 1 from jsonb_array_elements(public.nr_coleta_contexto(
        p_org,p_cliente,p_unidade,p_norma,p_local)->'modelos') op where op->>'id'=p_modelo::text) then
      raise exception 'Roteiro alterado ou incompatível. Confira as versões disponíveis.' using errcode='23514';
    end if;
  end if;
  v_dados:=jsonb_build_object('coleta_campo',true,'identificacao_verificada',false);
  if p_reinspecao then
    select s0.* into s from public.nr_levantamentos s0 join public.nr_coleta_revisoes r
      on r.organization_id=s0.organization_id and r.levantamento_id=s0.id and r.estado='aprovada'
      where s0.organization_id=p_org and s0.id=p_origem and s0.local_id=p_local
        and s0.arquivado_em is null and p_norma=any(s0.normas) order by r.numero desc limit 1 for share of s0;
    if not found then raise exception 'A reinspeção exige coleta aprovada do mesmo ativo.' using errcode='23514'; end if;
    v_dados:=v_dados||jsonb_build_object('coleta_origem_id',s.id,'coleta_origem_version',s.version,'finalidade','reinspecao');
  elsif p_origem is not null then
    select * into s from public.nr_levantamentos where organization_id=p_org and local_id=p_local
      and id=p_origem and arquivado_em is null and p_norma=any(nr_levantamentos.normas) for share;
    if not found then raise exception 'Origem indisponível.' using errcode='42501'; end if;
    origem:=public.nr_consultar(p_org,p_norma,'levantamentos',jsonb_build_object('id',p_origem,'unidade_id',p_unidade));
    if m.id is null or (m.id is distinct from s.modelo_id and m.id::text is distinct from origem#>>'{modelo_apresentacao,id}')
      or m.dados is distinct from coalesce(nullif(origem#>'{modelo_apresentacao,dados}','null'),origem#>'{modelo_snapshot,dados}') then
      raise exception 'A cópia exige correspondência exata dos campos com o roteiro de origem.' using errcode='23514';
    end if;
    respostas:=coalesce(origem->'respostas','{}');
    v_dados:=v_dados||jsonb_build_object('coleta_origem_id',p_origem,'coleta_origem_version',s.version,
      'coleta_origem_campos',(select coalesce(jsonb_agg(c),'[]') from jsonb_object_keys(respostas) c),
      'medidas_coleta',s.dados->'medidas_coleta');
  end if;
  select * into pessoa from public.pessoas where organization_id=p_org and user_id=auth.uid() and ativa limit 1;
  v_dados:=v_dados||jsonb_build_object('tecnico_id',pessoa.id,'tecnico_nome',pessoa.nome);
  novo:=public.nr_executar(p_org,p_norma,'levantamentos','salvar',null,null,'coleta:'||p_chave,
    jsonb_build_object('cliente_id',p_cliente,'unidade_id',p_unidade,'local_id',p_local,'normas',v_normas,
      'titulo',left(concat_ws(' · ',l.tag,l.titulo),240),'modelo_id',modelo,'dados',v_dados,'respostas',respostas));
  recibo:=jsonb_build_object('id',coalesce(novo->>'id',novo#>>'{registro,id}'),'existente',false);
  if p_origem is not null and not p_reinspecao then
    update public.nr_respostas nova set updated_by=antiga.updated_by,updated_at=antiga.updated_at
      from public.nr_respostas antiga where nova.organization_id=p_org and antiga.organization_id=p_org
        and nova.levantamento_id=(recibo->>'id')::uuid and antiga.levantamento_id=p_origem and antiga.campo_id=nova.campo_id;
  end if;
  perform public.operacao_concluir(p_org,p_chave,'nr_coleta:iniciar',pedido,recibo);
  return recibo;
end;
$$;

create function public.nr_coleta_revisoes_listar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) or not exists(
    select 1 from public.nr_levantamentos s where s.organization_id=p_org and s.cliente_id=p_cliente
      and s.unidade_id=p_unidade and s.id=p_id and p_norma=any(s.normas) and s.arquivado_em is null)
  then raise exception 'Levantamento indisponível.' using errcode='42501'; end if;
  return jsonb_build_object('pode_revisar',public.pode(p_org,'revisar_nr') and public.lev_profissional(p_org) is not null,
    'revisoes',coalesce((select jsonb_agg((to_jsonb(r)-'snapshot')||jsonb_build_object('adequacoes',r.snapshot->'adequacoes',
      'pdf_estado',coalesce((select a.estado from public.nr_arquivos a where a.organization_id=r.organization_id
        and a.documento_id=r.documento_id and a.papel='derivado' and a.mime='application/pdf'
        and a.nome='relatorio-de-campo.pdf' order by a.created_at desc limit 1),'pendente')) order by r.numero desc)
      from public.nr_coleta_revisoes r where r.organization_id=p_org and r.levantamento_id=p_id),'[]'));
end;
$$;


create function public.nr_coleta_conteudo(p_snapshot jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare blocos jsonb; b jsonb; f jsonb; a jsonb; foto jsonb; arquivo uuid;
  c integer:=0; valor text; item jsonb;
begin
  blocos:=jsonb_build_array(
    jsonb_build_object('id','contexto','tipo','paragrafo','texto',concat_ws(E'\n',
      p_snapshot->>'cliente',p_snapshot->>'unidade',p_snapshot#>>'{local,tag}',
      p_snapshot#>>'{local,titulo}','Escopos: '||(p_snapshot->'normas')::text,
      'Revisão da coleta: '||(p_snapshot->>'numero'),
      'Roteiro: '||(p_snapshot#>>'{roteiro,titulo}')||' · v'||(p_snapshot#>>'{roteiro,numero}'),
      'Técnico: '||coalesce(p_snapshot->>'tecnico','Identidade profissional não vinculada'),
      'Coleta confirmada em '||(p_snapshot->>'data'),
      case when p_snapshot->'identificacao_verificada'='true' then 'Identificação conferida em campo' else 'Identificação por verificar' end)));
  for b in select value from jsonb_array_elements(p_snapshot#>'{roteiro,dados,blocos}') loop
    if public.nr_condicao_levantamento(b->'aplica_se',p_snapshot->'valores',p_snapshot->'local')->'aplica'='false'::jsonb then
      continue;
    end if;
    c:=c+1;
    blocos:=blocos||jsonb_build_array(jsonb_build_object('id','b'||c,'tipo','titulo',
      'texto',concat_ws(' · ',coalesce(b->>'codigo',b->>'id'),b->>'titulo')));
    for f in select value from jsonb_array_elements(coalesce(b->'campos','[]')) loop
      if public.nr_condicao_levantamento(f->'mostrar_se',p_snapshot->'valores',p_snapshot->'local')->'aplica'='false'::jsonb then
        continue;
      end if;
      a:=p_snapshot->'respostas'->(f->>'id');
      valor:=case when jsonb_typeof(a->'valor')='string' then a->>'valor' else (a->'valor')::text end;
      c:=c+1;
      blocos:=blocos||jsonb_build_array(jsonb_build_object('id','f'||c,'tipo','paragrafo','texto',
        concat_ws(E'\n',concat_ws(' · ',f->>'id',coalesce(f->>'nome',f->>'rotulo'),f->>'unidade'),
          coalesce(nullif(valor,''),'Não informado'),
          'Fonte: '||coalesce(p_snapshot->'medidas'->(f->>'id')->>'natureza',case
            when a->>'updated_by' is null then 'Histórica ou não verificada' else 'Coleta registrada' end),
          nullif(p_snapshot->'medidas'->(f->>'id')->>'referencia',''),
          case when p_snapshot->'campos_de_origem' ? (f->>'id') then
            'Resposta preservada de '||(p_snapshot->>'origem')||' · versão '||(p_snapshot->>'origem_version') end,
          'Registro: '||coalesce(a->>'updated_at','Sem data'))));
      for foto in select distinct value from jsonb_path_query(coalesce(a->'valor','null'),'strict $.** ? (exists (@.arquivo_id))') value loop
        if foto->>'arquivo_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
          arquivo:=(foto->>'arquivo_id')::uuid;
          if not exists(select 1 from public.nr_arquivos ar where ar.organization_id=(p_snapshot->>'organizacao_id')::uuid
            and ar.unidade_id=(p_snapshot->>'unidade_id')::uuid and ar.local_id=(p_snapshot#>>'{local,id}')::uuid
            and ar.id=arquivo and ar.mime like 'image/%' and ar.estado='vinculado' and ar.bytes_verificados) then
            raise exception 'Evidência indisponível ou de outro local no campo %.',f->>'id' using errcode='23514';
          end if;
          c:=c+1;
          blocos:=blocos||jsonb_build_array(jsonb_build_object('id','i'||c,'tipo','imagem','arquivo_id',arquivo,
            'legenda',left(concat_ws(' · ',f->>'id',coalesce(foto->>'legenda','Evidência da coleta')),2000)));
        end if;
      end loop;
    end loop;
  end loop;
  if jsonb_array_length(coalesce(p_snapshot->'adequacoes','[]'))>0 then
    blocos:=blocos||jsonb_build_array(jsonb_build_object('id','adequacoes','tipo','titulo','texto','Adequações e pendências da coleta'));
    for item in select value from jsonb_array_elements(p_snapshot->'adequacoes') loop
      c:=c+1;
      blocos:=blocos||jsonb_build_array(jsonb_build_object('id','a'||c,'tipo','paragrafo','texto',
        concat_ws(' · ',item->>'campo',item->>'codigo',item->>'acao',item->>'estado',item->>'justificativa')));
    end loop;
  end if;
  return jsonb_build_object('schema_version',1,'blocos',blocos);
end;
$$;

create function public.nr_coleta_concluir(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,
  p_id uuid,p_version integer,p_chave uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.nr_levantamentos; l public.nr_locais; m public.nr_modelo_versoes;
  respostas jsonb; valores jsonb; snap jsonb; v_diagnostico jsonb; primeira jsonb; v_numero integer;
  doc uuid; rev uuid; v_result jsonb; v_pedido jsonb; v_hash text; v_titulo text;
  v_coleta uuid:=gen_random_uuid();
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if p_chave is null or not public.pode(p_org,'editar_nr')
    or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Conclusão indisponível.' using errcode='42501';
  end if;
  select * into s from public.nr_levantamentos where organization_id=p_org and cliente_id=p_cliente
    and unidade_id=p_unidade and id=p_id and p_norma=any(normas) and arquivado_em is null for update;
  if not found then raise exception 'Coleta indisponível.' using errcode='42501'; end if;
  v_pedido:=jsonb_build_object('id',p_id,'version',p_version,'norma',p_norma);
  v_result:=public.operacao_repetir(p_org,p_chave,'nr_coleta:concluir',v_pedido);
  if v_result is not null then return v_result; end if;
  if s.version is distinct from p_version then raise exception 'A coleta mudou.' using errcode='40001'; end if;
  if s.estado<>'rascunho' then raise exception 'A coleta já está em revisão.' using errcode='23514'; end if;
  select * into l from public.nr_locais where organization_id=p_org and id=s.local_id and arquivado_em is null for share;
  if not found or not s.normas <@ l.normas then raise exception 'Confira o vínculo e os escopos do local.' using errcode='23514'; end if;
  select * into m from public.nr_modelo_versoes where organization_id=p_org and id=s.modelo_versao_id;
  select coalesce(jsonb_object_agg(campo_id,jsonb_build_object('valor',valor,'updated_at',updated_at,'updated_by',updated_by)),'{}'),
    coalesce(jsonb_object_agg(campo_id,valor),'{}') into respostas,valores
  from public.nr_respostas where organization_id=p_org and levantamento_id=p_id;
  v_diagnostico:=public.nr_levantamento_diagnostico(m.dados,valores,to_jsonb(l));
  if not coalesce((v_diagnostico->>'pode_submeter')::boolean,false) then
    primeira:=v_diagnostico->'pendencias'->0;
    raise exception '%',concat_ws(' · ',primeira->>'bloco',primeira->>'nome',primeira->>'motivo') using errcode='23514';
  end if;
  select coalesce(max(numero),0)+1 into v_numero from public.nr_coleta_revisoes
    where organization_id=p_org and levantamento_id=p_id;
  snap:=jsonb_build_object('levantamento_id',s.id,'levantamento_version',s.version,'numero',v_numero,
    'organizacao_id',p_org,'cliente_id',p_cliente,'unidade_id',p_unidade,'normas',s.normas,
    'cliente',(select coalesce(nullif(nome_exibicao,''),razao_social) from public.clientes where organization_id=p_org and id=p_cliente),
    'unidade',(select nome from public.unidades where organization_id=p_org and id=p_unidade),
    'local',jsonb_build_object('id',l.id,'tag',l.tag,'titulo',l.titulo,'familia',l.familia,'tipo',l.tipo),
    'roteiro',jsonb_build_object('id',m.id,'numero',m.numero,'sha256',m.sha256,'dados',m.dados,
      'titulo',(select titulo from public.nr_modelos where organization_id=p_org and id=m.modelo_id)),
    'tecnico',coalesce(s.dados->>'tecnico_nome',(select nome from public.pessoas
      where organization_id=p_org and user_id=auth.uid() and ativa limit 1)),
    'tecnico_autor',auth.uid(),'data',clock_timestamp(),'origem',s.dados->'coleta_origem_id',
    'origem_version',s.dados->'coleta_origem_version','campos_de_origem',s.dados->'coleta_origem_campos',
    'identificacao_verificada',s.dados->'identificacao_verificada','medidas',s.dados->'medidas_coleta',
    'respostas',respostas,'valores',valores,'diagnostico',v_diagnostico);
  snap:=snap||jsonb_build_object('adequacoes',public.nr_coleta_itens(snap));
  v_hash:=public.pet_sha256(snap);
  v_titulo:=left('Relatório de Campo · '||s.titulo||' · coleta '||v_numero,240);
  insert into public.nr_documentos(organization_id,cliente_id,unidade_id,local_id,normas,titulo,tipo,estado,dados)
    values(p_org,p_cliente,p_unidade,l.id,s.normas,v_titulo,'relatorio_campo','em_revisao',
      jsonb_build_object('levantamento_id',s.id,'coleta_revisao_id',v_coleta,'coleta_numero',v_numero,'coleta_sha256',v_hash,'modelo_saida','campo-1'))
    returning id into doc;
  insert into public.nr_documento_revisoes(organization_id,documento_id,numero,estado,conteudo,snapshot,sha256)
    values(p_org,doc,1,'rascunho',public.nr_coleta_conteudo(snap),snap,v_hash) returning id into rev;
  update public.nr_documentos set revisao_atual_id=rev where id=doc;
  update public.nr_levantamentos set estado='em_revisao',updated_at=clock_timestamp() where id=s.id;
  insert into public.nr_coleta_revisoes(id,organization_id,levantamento_id,numero,levantamento_version,snapshot,
    sha256,documento_id,concluida_por)
    values(v_coleta,p_org,s.id,v_numero,s.version,snap,v_hash,doc,auth.uid())
    returning jsonb_build_object('id',id,'documento_id',doc,'numero',numero) into v_result;
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,autor)
    values(p_org,'levantamentos',s.id,'concluir_coleta',jsonb_build_object('version',s.version),v_result,auth.uid());
  insert into public.nr_pendencias(organization_id,cliente_id,unidade_id,local_id,documento_id,normas,titulo,descricao,dados)
    select p_org,p_cliente,p_unidade,l.id,doc,s.normas,left('Verificar adequação · '||(i->>'codigo'),240),
      left(coalesce(nullif(i->>'justificativa',''),'Confirmar aplicabilidade em campo.'),20000),
      jsonb_build_object('levantamento_id',s.id,'coleta_revisao_id',v_coleta,'campo',i->>'campo','codigo',i->>'codigo')
    from jsonb_array_elements(snap->'adequacoes') i where i->>'estado'='pendente'
      and not exists(select 1 from public.nr_pendencias p where p.organization_id=p_org and p.local_id=l.id
        and p.estado='aberta' and p.arquivado_em is null and p.dados @> jsonb_build_object('levantamento_id',s.id,
          'campo',i->>'campo','codigo',i->>'codigo'));
  perform public.operacao_concluir(p_org,p_chave,'nr_coleta:concluir',v_pedido,v_result);
  return v_result;
end;
$$;

create function public.nr_coleta_revisar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_id uuid,
  p_revisao uuid,p_version integer,p_decisao text,p_motivo text,p_chave uuid,p_itens jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.nr_levantamentos; r public.nr_coleta_revisoes; prof uuid; v_pedido jsonb; v_result jsonb;
  v_doc uuid; v_doc_rev uuid; v_titulo text; v_conteudo jsonb; v_dados jsonb; confirmados jsonb:='[]';
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  prof:=public.lev_profissional(p_org);
  if p_chave is null or prof is null or not public.pode(p_org,'revisar_nr')
    or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Revisão requer profissional habilitado no Nexus.' using errcode='42501';
  end if;
  select * into s from public.nr_levantamentos where organization_id=p_org and cliente_id=p_cliente
    and unidade_id=p_unidade and id=p_id and p_norma=any(normas) and arquivado_em is null for update;
  if not found then raise exception 'Coleta indisponível.' using errcode='42501'; end if;
  v_pedido:=jsonb_build_object('id',p_id,'revisao',p_revisao,'version',p_version,'decisao',p_decisao,'motivo',p_motivo,'itens',p_itens);
  v_result:=public.operacao_repetir(p_org,p_chave,'nr_coleta:revisar',v_pedido);
  if v_result is not null then return v_result; end if;
  if s.version is distinct from p_version then raise exception 'A coleta mudou.' using errcode='40001'; end if;
  select * into r from public.nr_coleta_revisoes where organization_id=p_org and levantamento_id=p_id
    and id=p_revisao and estado='em_revisao' for update;
  if not found or s.estado<>'em_revisao' then raise exception 'A revisão não está pendente.' using errcode='23514'; end if;
  if p_decisao='devolver' then
    if length(trim(coalesce(p_motivo,''))) not between 3 and 4000 then
      raise exception 'Informe o motivo da devolução.' using errcode='23514';
    end if;
    update public.nr_coleta_revisoes set estado='devolvida' where id=r.id;
    update public.nr_levantamentos set estado='rascunho',updated_at=clock_timestamp() where id=p_id;
  elsif p_decisao='aprovar' then
    if not public.pode(p_org,'aprovar_nr') then raise exception 'Sem atribuição de aprovação.' using errcode='42501'; end if;
    if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>100 then
      raise exception 'Seleção de adequações inválida.' using errcode='23514'; end if;
    select coalesce(jsonb_agg(i),'[]') into confirmados
      from jsonb_array_elements(r.snapshot->'adequacoes') i where i->>'estado'='candidato'
        and p_itens @> jsonb_build_array(jsonb_build_object('campo',i->>'campo','codigo',i->>'codigo'));
    if jsonb_array_length(confirmados)<>jsonb_array_length(p_itens) then
      raise exception 'Confirme apenas itens com código, quantidade, unidade e evidência na revisão fixada.' using errcode='23514'; end if;
    select left(replace(d.titulo,'Relatório de Campo ·','Relatório Técnico ·'),240),v.conteudo,d.dados
      into v_titulo,v_conteudo,v_dados
      from public.nr_documentos d join public.nr_documento_revisoes v
        on v.organization_id=d.organization_id and v.id=d.revisao_atual_id
      where d.organization_id=p_org and d.id=r.documento_id and d.arquivado_em is null for share;
    if not found then raise exception 'Restaure o relatório no acervo antes de aprovar.' using errcode='23514'; end if;
    v_conteudo:=jsonb_set(v_conteudo,'{blocos}',v_conteudo->'blocos'||jsonb_build_array(
      jsonb_build_object('id','revisao-tecnica','tipo','titulo','texto','Revisão técnica'),
      jsonb_build_object('id','decisao-tecnica','tipo','paragrafo','texto',concat_ws(E'\n',
        (select concat_ws(' · ',nome,registro_profissional) from public.pessoas where id=prof),
        clock_timestamp()::text,nullif(trim(p_motivo),'')))));
    insert into public.nr_documentos(organization_id,cliente_id,unidade_id,local_id,normas,titulo,tipo,estado_origem,dados)
      values(p_org,p_cliente,p_unidade,s.local_id,s.normas,v_titulo,'relatorio_tecnico','aprovado',
        v_dados||jsonb_build_object('modelo_saida','tecnico-1','relatorio_campo_id',r.documento_id,
          'revisado_por',prof,'revisado_em',clock_timestamp(),'adequacoes_confirmadas',confirmados))
      returning id into v_doc;
    insert into public.nr_documento_revisoes(organization_id,documento_id,numero,estado,conteudo,snapshot,sha256)
      values(p_org,v_doc,1,'emitido',v_conteudo,r.snapshot,public.pet_sha256(v_conteudo)) returning id into v_doc_rev;
    update public.nr_documentos set revisao_atual_id=v_doc_rev where id=v_doc;
  else raise exception 'Decisão inválida.' using errcode='23514';
  end if;
  update public.nr_coleta_revisoes set estado=case p_decisao when 'aprovar' then 'aprovada' else 'devolvida' end,
    motivo=nullif(trim(coalesce(p_motivo,'')),''),documento_tecnico_id=v_doc,itens_confirmados=confirmados,
    revisada_por=prof,revisada_em=clock_timestamp() where id=p_revisao;
  v_result:=jsonb_build_object('id',r.id,'documento_id',coalesce(v_doc,r.documento_id),'decisao',p_decisao);
  insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,motivo,autor)
    values(p_org,'levantamentos',s.id,p_decisao||'_coleta',v_result,p_motivo,auth.uid());
  perform public.operacao_concluir(p_org,p_chave,'nr_coleta:revisar',v_pedido,v_result);
  return v_result;
end;
$$;

-- A collection already frozen by this workflow cannot be reopened through the old generic editor.
create function public.nr_coleta_proteger_reabertura() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.estado='em_revisao' and new.estado='rascunho' and exists(
    select 1 from public.nr_coleta_revisoes r where r.organization_id=old.organization_id
      and r.levantamento_id=old.id and r.estado='em_revisao'
  ) then raise exception 'Use a devolução da revisão de campo.' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger nr_coleta_proteger_reabertura before update of estado on public.nr_levantamentos
for each row execute function public.nr_coleta_proteger_reabertura();

create function public.nr_coleta_proteger_relatorio() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.nr_coleta_revisoes r where r.organization_id=old.organization_id
      and (r.documento_id=old.id or r.documento_tecnico_id=old.id))
    and (to_jsonb(new)-array['arquivado_em','version','updated_at']) is distinct from
      (to_jsonb(old)-array['arquivado_em','version','updated_at']) then
    raise exception 'Relatório fixado pela coleta. Faça a revisão no levantamento.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger nr_coleta_proteger_relatorio before update on public.nr_documentos
for each row execute function public.nr_coleta_proteger_relatorio();

create function public.nr_coleta_proteger_conteudo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.nr_coleta_revisoes r where r.organization_id=old.organization_id
      and (r.documento_id=old.documento_id or r.documento_tecnico_id=old.documento_id)) and new is distinct from old then
    raise exception 'Conteúdo do relatório fixado pela coleta.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger nr_coleta_proteger_conteudo before update on public.nr_documento_revisoes
for each row execute function public.nr_coleta_proteger_conteudo();

revoke all on function public.nr_coleta_roteiro_altura(),public.nr_coleta_conteudo(jsonb),
  public.nr_coleta_proteger_reabertura(),public.nr_coleta_proteger_relatorio(),public.nr_coleta_proteger_conteudo(),
  public.nr_coleta_contexto(uuid,uuid,uuid,text,uuid,text,integer),
  public.nr_coleta_iniciar(uuid,uuid,uuid,text,uuid,uuid,integer,boolean,uuid,uuid,boolean),
  public.nr_coleta_revisoes_listar(uuid,uuid,uuid,text,uuid),
  public.nr_coleta_concluir(uuid,uuid,uuid,text,uuid,integer,uuid),
  public.nr_coleta_revisar(uuid,uuid,uuid,text,uuid,uuid,integer,text,text,uuid,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_contexto(uuid,uuid,uuid,text,uuid,text,integer),
  public.nr_coleta_iniciar(uuid,uuid,uuid,text,uuid,uuid,integer,boolean,uuid,uuid,boolean),
  public.nr_coleta_revisoes_listar(uuid,uuid,uuid,text,uuid),
  public.nr_coleta_concluir(uuid,uuid,uuid,text,uuid,integer,uuid),
  public.nr_coleta_revisar(uuid,uuid,uuid,text,uuid,uuid,integer,text,text,uuid,jsonb)
to authenticated;
notify pgrst,'reload schema';



create function public.nr_coleta_listar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_filtros jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total integer; linhas jsonb; termo text:=lower(trim(coalesce(p_filtros->>'busca','')));
  pagina integer:=greatest(0,least(100000,coalesce((p_filtros->>'pagina')::integer,0)));
begin
  if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Unidade indisponível.' using errcode='42501';
  end if;
  with matches as materialized (
    select s,l.tag,l.titulo as local_titulo,l.familia,l.tipo
    from public.nr_levantamentos s left join public.nr_locais l
      on l.organization_id=s.organization_id and l.id=s.local_id
    where s.organization_id=p_org and s.cliente_id=p_cliente and s.unidade_id=p_unidade
      and p_norma=any(s.normas) and s.arquivado_em is null
      and (nullif(p_filtros->>'local_id','') is null or s.local_id=(p_filtros->>'local_id')::uuid)
      and (nullif(p_filtros->>'estado','') is null or s.estado=p_filtros->>'estado')
      and position(termo in lower(concat_ws(' ',s.titulo,l.tag,l.titulo,array_to_string(l.aliases,' '))))>0
  ), page as (
    select * from matches order by (s).updated_at desc,(s).id offset pagina*25 limit 25
  ), enriched as (
    select page.*, public.nr_levantamento_diagnostico(
      coalesce(public.nr_levantamento_apresentacao(p_org,p_norma,(s).id)->'dados',v.dados),
      coalesce((select jsonb_object_agg(r.campo_id,r.valor) from public.nr_respostas r
        where r.organization_id=p_org and r.levantamento_id=(s).id),'{}'),
      jsonb_build_object('familia',page.familia,'tipo',page.tipo)) as diagnostico,
      (select c.estado from public.nr_coleta_revisoes c where c.organization_id=p_org
        and c.levantamento_id=(s).id order by c.numero desc limit 1) as revisao
    from page left join public.nr_modelo_versoes v on v.organization_id=p_org and v.id=(s).modelo_versao_id
  )
  select (select count(*) from matches),coalesce(jsonb_agg((to_jsonb(s)-'dados')||
    jsonb_build_object('tag',tag,'local_titulo',local_titulo,'familia',familia,
      'dados',jsonb_build_object('tecnico_nome',(s).dados->'tecnico_nome',
        'levantado_por',(s).dados->'levantado_por','coleta_preenchidos',diagnostico->'campos_preenchidos',
        'coleta_total',diagnostico->'campos_aplicaveis','coleta_revisao',revisao))
      order by (s).updated_at desc,(s).id),'[]') into total,linhas from enriched;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',25);
end;
$$;
revoke all on function public.nr_coleta_listar(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_listar(uuid,uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';



create function public.nr_coleta_salvar(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,
  p_id uuid,p_version integer,p_chave uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.nr_levantamentos; l public.nr_locais; m jsonb; foto jsonb;
  respostas jsonb:=coalesce(p_dados->'respostas','{}'); dados jsonb;
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if p_chave is null or not public.pode(p_org,'editar_nr')
    or not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma) then
    raise exception 'Salvamento indisponível.' using errcode='42501';
  end if;
  perform public.ag_payload(p_dados,array['respostas','bloco','identificacao_verificada','medidas']);
  select * into s from public.nr_levantamentos where organization_id=p_org and cliente_id=p_cliente
    and unidade_id=p_unidade and id=p_id and p_norma=any(normas) and arquivado_em is null for update;
  if not found then raise exception 'Coleta indisponível.' using errcode='42501'; end if;
  select * into l from public.nr_locais where organization_id=p_org and id=s.local_id and arquivado_em is null for share;
  if not found or not s.normas <@ l.normas then raise exception 'Confira os escopos do local.' using errcode='23514'; end if;
  m:=public.nr_levantamento_apresentacao(p_org,p_norma,p_id)->'dados';
  if m is null then select v.dados into m from public.nr_modelo_versoes v
    where v.organization_id=p_org and v.id=s.modelo_versao_id; end if;
  if jsonb_typeof(respostas)<>'object' or exists(select 1 from jsonb_object_keys(respostas) c
    where not exists(select 1 from jsonb_array_elements(coalesce(m->'blocos','[]')) b
      cross join lateral jsonb_array_elements(coalesce(b->'campos','[]')) f where f->>'id'=c)) then
    raise exception 'Há campos que não pertencem ao roteiro fixado.' using errcode='23514';
  end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(m->'blocos','[]')) b where b->>'id'=p_dados->>'bloco') then
    raise exception 'Etapa indisponível neste roteiro.' using errcode='23514';
  end if;
  for foto in select distinct value from jsonb_path_query(respostas,'strict $.** ? (exists (@.arquivo_id))') value loop
    if foto->>'arquivo_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and not exists(
      select 1 from public.nr_arquivos a where a.organization_id=p_org and a.id=(foto->>'arquivo_id')::uuid
      and a.unidade_id=p_unidade and a.local_id=l.id and a.estado='vinculado' and a.bytes_verificados and a.mime like 'image/%'
    ) then raise exception 'Selecione uma evidência verificada do mesmo local.' using errcode='23514'; end if;
  end loop;
  dados:=s.dados||jsonb_build_object('coleta_bloco_'||p_norma,p_dados->>'bloco',
    'identificacao_verificada',coalesce((p_dados->>'identificacao_verificada')::boolean,false),
    'medidas_coleta',coalesce(p_dados->'medidas','{}'));
  if jsonb_typeof(dados->'coleta_origem_campos')='array' then
    dados:=jsonb_set(dados,'{coleta_origem_campos}',(dados->'coleta_origem_campos')-
      array(select jsonb_object_keys(respostas)));
  end if;
  return public.nr_executar(p_org,p_norma,'levantamentos','salvar',p_id,p_version,'campo:'||p_chave,
    jsonb_build_object('dados',dados,'respostas',respostas));
end;
$$;
revoke all on function public.nr_coleta_salvar(uuid,uuid,uuid,text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_salvar(uuid,uuid,uuid,text,uuid,integer,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';


create function public.nr_coleta_snapshot(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_id uuid,p_revisao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.nr_coleta_revisoes_listar(p_org,p_cliente,p_unidade,p_norma,p_id);
  select r.snapshot into result from public.nr_coleta_revisoes r where r.organization_id=p_org
    and r.levantamento_id=p_id and r.id=p_revisao;
  if not found then raise exception 'Revisão indisponível.' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function public.nr_coleta_snapshot(uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_snapshot(uuid,uuid,uuid,text,uuid,uuid) to authenticated;


create function public.nr_coleta_itens(p_snapshot jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('campo', f->>'id','codigo',i.key,'acao',i.value->>'acao',
    'quantidade',i.value->'quantidade','unidade',i.value->>'unidade','justificativa',i.value->>'justificativa',
    'evidencias',i.value->'evidencias',
    'estado',case when i.value->>'acao'='verificar' and i.value->>'aplicabilidade'='pendente' then 'pendente'
      when i.value->>'aplicabilidade'='aplicavel' and i.value->>'acao' in ('adequar','instalar','substituir')
        and jsonb_typeof(i.value->'quantidade')='number' and (i.value->>'quantidade')::numeric > 0
        and length(trim(coalesce(i.value->>'unidade','')))>0
        and exists(select 1 from jsonb_path_query(i.value,'strict $.** ? (exists (@.arquivo_id))') foto
          join public.nr_arquivos a on a.id::text=foto->>'arquivo_id'
          where a.organization_id=(p_snapshot->>'organizacao_id')::uuid and a.local_id=(p_snapshot#>>'{local,id}')::uuid
            and a.unidade_id=(p_snapshot->>'unidade_id')::uuid and a.estado='vinculado' and a.bytes_verificados and a.mime like 'image/%')
        and exists(select 1 from public.nr_modelos m where m.organization_id=(p_snapshot->>'organizacao_id')::uuid
          and m.tipo='familia' and m.arquivado_em is null and m.dados->>'cod'=i.key
          and (m.cliente_id is null or m.cliente_id=(p_snapshot->>'cliente_id')::uuid)
          and (m.unidade_id is null or m.unidade_id=(p_snapshot->>'unidade_id')::uuid))
      then 'candidato' else 'observado' end) order by f->>'id',i.key),'[]')
  from jsonb_array_elements(p_snapshot#>'{roteiro,dados,blocos}') b
  cross join lateral jsonb_array_elements(b->'campos') f
  cross join lateral jsonb_each(case when jsonb_typeof(p_snapshot->'valores'->(f->>'id'))='object'
    then p_snapshot->'valores'->(f->>'id') else '{}' end) i
  where coalesce(f->>'tipo_origem',f->>'tipo')='checklist'
    and public.nr_condicao_levantamento(b->'aplica_se',p_snapshot->'valores',p_snapshot->'local')->>'aplica'='true'
    and public.nr_condicao_levantamento(f->'mostrar_se',p_snapshot->'valores',p_snapshot->'local')->>'aplica'='true'
$$;
revoke all on function public.nr_coleta_itens(jsonb) from public,anon,authenticated,service_role;


-- Verified generated representation; ordinary upload cannot claim its provenance.
create function public.nr_coleta_pdf_proteger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.nr_coleta_revisoes r where r.organization_id=new.organization_id
      and r.documento_id=new.documento_id)
    and (new.origem_metadata->>'gerador' is distinct from 'nr-coleta-pdf-1'
      or new.papel<>'derivado' or new.mime<>'application/pdf') then
    raise exception 'Use a geração do PDF no levantamento.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger nr_coleta_pdf_proteger before insert on public.nr_arquivos
for each row execute function public.nr_coleta_pdf_proteger();
revoke all on function public.nr_coleta_pdf_proteger() from public,anon,authenticated,service_role;

create function public.nr_coleta_pdf_preparar(p_org uuid,p_documento uuid,p_revisao uuid,p_autor uuid,
  p_sha256 text,p_tamanho bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.nr_documentos; a public.nr_arquivos; v_chave uuid;
begin
  perform public.lev_travar_autor(p_org,p_autor);
  if not exists(select 1 from public.user_roles where organization_id=p_org and user_id=p_autor
    and role::text in ('admin','engenharia')) then
    raise exception 'Geração indisponível para este perfil.' using errcode='42501';
  end if;
  select d0.* into d from public.nr_documentos d0 join public.nr_coleta_revisoes r
    on r.organization_id=d0.organization_id and r.documento_id=d0.id
    where d0.organization_id=p_org and d0.id=p_documento and d0.revisao_atual_id=p_revisao
      and d0.arquivado_em is null for share of d0;
  if not found then raise exception 'Relatório de campo indisponível.' using errcode='42501'; end if;
  v_chave:=md5('nr-coleta-pdf-1:'||p_revisao)::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-arquivo:'||p_org::text||':'||v_chave,0));
  select * into a from public.nr_arquivos where organization_id=p_org and chave=v_chave;
  if found then
    if a.sha256<>p_sha256 or a.tamanho<>p_tamanho then
      raise exception 'O resultado preparado tem bytes diferentes. Preserve o arquivo anterior e confira a versão do renderizador.' using errcode='23514';
    end if;
    return to_jsonb(a);
  end if;
  return public.nr_arquivo_preparar_interno(p_org,v_chave,jsonb_build_object(
    'cliente_id',d.cliente_id,'unidade_id',d.unidade_id,'local_id',d.local_id,'documento_id',d.id,
    'revisao_id',p_revisao,'normas',d.normas,'nome','relatorio-de-campo.pdf','mime','application/pdf',
    'tamanho',p_tamanho,'sha256',p_sha256,'papel','derivado','origem_metadata',jsonb_build_object('gerador','nr-coleta-pdf-1')
  ),p_autor,false);
end;
$$;
revoke all on function public.nr_coleta_pdf_preparar(uuid,uuid,uuid,uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_pdf_preparar(uuid,uuid,uuid,uuid,text,bigint) to service_role;
notify pgrst,'reload schema';


create function public.nr_coleta_documento(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,
  p_id uuid,p_revisao uuid,p_modelo uuid,p_modelo_version integer,p_modelo_versao uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.nr_coleta_revisoes; m public.nr_modelos; v public.nr_modelo_versoes;
  cat public.nr_catalogo_documental; resultado jsonb; doc uuid; doc_rev uuid; destino uuid;
  v_chave uuid; v_evidencia jsonb; v_normas text[];
begin
  perform public.lev_travar_autor(p_org,auth.uid());
  if not public.pode(p_org,'cadastrar_nr') then raise exception 'Sem atribuição para criar documento.' using errcode='42501'; end if;
  perform public.nr_coleta_snapshot(p_org,p_cliente,p_unidade,p_norma,p_id,p_revisao);
  select * into r from public.nr_coleta_revisoes where organization_id=p_org and levantamento_id=p_id
    and id=p_revisao and estado='aprovada' for share;
  if not found then raise exception 'Selecione uma revisão aprovada.' using errcode='23514'; end if;
  select * into m from public.nr_modelos where organization_id=p_org and id=p_modelo and tipo='documento'
    and estado='publicado' and arquivado_em is null and p_norma=any(normas)
    and (cliente_id is null or cliente_id=p_cliente) and (unidade_id is null or unidade_id=p_unidade) for update;
  if not found or m.version is distinct from p_modelo_version then
    raise exception 'Confira a publicação vigente do modelo.' using errcode='23514'; end if;
  select * into cat from public.nr_catalogo_documental where codigo=coalesce(m.dados->>'tipo_documento',m.dados->>'tipo')
    and p_norma=any(normas) and codigo<>'pet';
  if not found then raise exception 'Modelo sem tipo documental aplicável no catálogo contratado.' using errcode='23514'; end if;
  perform public.nr_documento_exigir_contrato(p_org,p_cliente,p_unidade,cat.codigo);
  select * into v from public.nr_modelo_versoes where organization_id=p_org and modelo_id=m.id
    and conteudo=m.conteudo and dados=m.dados order by numero desc limit 1;
  if not found or (p_modelo_versao is not null and p_modelo_versao<>v.id) then
    raise exception 'Escolha a versão publicada vigente do modelo.' using errcode='23514'; end if;
  v_chave:=md5('nr-coleta-saida:'||r.id||':'||cat.codigo||':'||v.id)::uuid;
  v_evidencia:=jsonb_build_object('tipo','coleta_aprovada','coleta_revisao_id',r.id,'levantamento_id',p_id,
    'coleta_sha256',r.sha256,'modelo_versao_id',v.id,'tipo_saida',cat.codigo);
  select documento_id into doc from public.nr_documento_relacoes where organization_id=p_org
    and documento_relacionado_id=r.documento_tecnico_id and tipo='depende' and nr_documento_relacoes.evidencia=v_evidencia;
  if doc is not null then
    perform public.nr_consultar(p_org,p_norma,'documentos',jsonb_build_object('id',doc,'unidade_id',p_unidade));
    return jsonb_build_object('id',doc);
  end if;
  if cat.escopo='local' then destino:=(r.snapshot#>>'{local,id}')::uuid; end if;
  v_normas:=array(select n from jsonb_array_elements_text(r.snapshot->'normas') n where n=any(m.normas) and n=any(cat.normas));
  resultado:=public.nr_documento_de_modelo(p_org,p_norma,v_chave,jsonb_build_object(
    'cliente_id',p_cliente,'unidade_id',p_unidade,'local_id',destino,'normas',v_normas,
    'titulo',left(concat_ws(' · ',cat.titulo,case when destino is not null then r.snapshot#>>'{local,tag}' else r.snapshot->>'unidade' end),240),
    'tipo',cat.codigo,'modelo_id',m.id,'modelo_expected_version',m.version,'modelo_versao_id',v.id,'usar_rascunho',false));
  doc:=(resultado#>>'{registro,id}')::uuid;
  doc_rev:=(resultado#>>'{registro,revisao_atual_id}')::uuid;
  update public.nr_documento_revisoes set snapshot=coalesce(snapshot,'{}')||jsonb_build_object('coleta_origem',v_evidencia)
    where organization_id=p_org and id=doc_rev;
  update public.nr_documentos set dados=dados||v_evidencia where organization_id=p_org and id=doc;
  insert into public.nr_documento_relacoes(organization_id,documento_id,documento_relacionado_id,tipo,evidencia)
    values(p_org,doc,r.documento_tecnico_id,'depende',v_evidencia);
  return jsonb_build_object('id',doc);
end;
$$;
revoke all on function public.nr_coleta_documento(uuid,uuid,uuid,text,uuid,uuid,uuid,integer,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.nr_coleta_documento(uuid,uuid,uuid,text,uuid,uuid,uuid,integer,uuid) to authenticated;
notify pgrst,'reload schema';
