-- Recuperação de projeções da experiência NR. Não reclassifica nem reimporta acervo.
-- Fontes, snapshots, respostas, revisões emitidas e datas históricas não são alterados.
create table public.nr_contextos (
 organization_id uuid not null references public.organizations(id), cliente_id uuid not null,
 unidade_id uuid not null, normas text[] not null,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 primary key(organization_id,unidade_id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 check(cardinality(normas) between 1 and 2 and normas<@array['NR33','NR35']::text[] and(cardinality(normas)=1 or normas[1]<>normas[2]))
);
alter table public.nr_contextos enable row level security;
revoke all on public.nr_contextos from public,anon,authenticated,service_role;
grant select on public.nr_contextos to authenticated;
create policy nr_contextos_ler on public.nr_contextos for select to authenticated using(public.pode(organization_id,'ver_nr'));

create function public.nr_contextos_acervo(p_org uuid)returns table(cliente_id uuid,unidade_id uuid,normas text[])
language sql stable security definer set search_path='' as $$
 select x.cliente_id,x.unidade_id,array_agg(distinct n.norma order by n.norma)
 from(
  select c.cliente_id,c.unidade_id,c.normas from public.nr_contextos c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_locais c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_documentos c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_pastas c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_pendencias c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_levantamentos c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_sistemas c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_arquivos c where c.organization_id=p_org
  union all select c.cliente_id,c.unidade_id,c.normas from public.nr_modelos c where c.organization_id=p_org and c.unidade_id is not null
 )x cross join lateral unnest(x.normas)n(norma) group by x.cliente_id,x.unidade_id
$$;

create function public.nr_contexto_associar(p_org uuid,p_cliente uuid,p_unidade uuid,p_normas text[],p_chave uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare pedido jsonb:=jsonb_build_object('cliente_id',p_cliente,'unidade_id',p_unidade,'normas',p_normas);r jsonb;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pode(p_org,'ver_nr')or not public.pode(p_org,'cadastrar_nr')then raise exception 'Acesso negado.'using errcode='42501';end if;
 if p_chave is null or p_normas is null or cardinality(p_normas)not between 1 and 2 or not p_normas<@array['NR33','NR35']::text[] or(cardinality(p_normas)=2 and p_normas[1]=p_normas[2])then raise exception 'Informe as normas aplicáveis ao contexto.'using errcode='23514';end if;
 perform 1 from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id where u.organization_id=p_org and u.cliente_id=p_cliente and u.id=p_unidade and u.arquivado_em is null and c.arquivado_em is null for share of u,c;
 if not found then raise exception 'Cliente ou unidade indisponível.'using errcode='42501';end if;
 r:=public.operacao_repetir(p_org,p_chave,'nr_contexto_associar',pedido);if r is not null then return r;end if;
 insert into public.nr_contextos(organization_id,cliente_id,unidade_id,normas)values(p_org,p_cliente,p_unidade,p_normas)
 on conflict(organization_id,unidade_id)do update set normas=(select array_agg(distinct n order by n)from unnest(nr_contextos.normas||excluded.normas)n);
 r:=jsonb_build_object('cliente_id',p_cliente,'unidade_id',p_unidade);
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,autor)values(p_org,'contextos',p_unidade,'associar',pedido,auth.uid());
 return public.operacao_concluir(p_org,p_chave,'nr_contexto_associar',pedido,r);
end$$;

-- TAG continua textual. A chave auxilia ordenação, sem recodificar zeros, aliases ou sufixos.
create function public.nr_tag_ordem(p_tag text)returns text[] language sql immutable parallel safe set search_path=''as $$
 select coalesce(array_agg(case when v[1]~'^[0-9]+$'then lpad(v[1],120,'0')else v[1]end order by pos),'{}')from regexp_matches(lower(coalesce(p_tag,'')),'([0-9]+|[^0-9]+)','g')with ordinality r(v,pos)
$$;
create index nr_locais_tag_natural on public.nr_locais(organization_id,unidade_id,public.nr_tag_ordem(tag),tag,id)where arquivado_em is null;
create index nr_doc_copia_original on public.nr_documentos(organization_id,(dados#>>'{conversao,documento_origem_id}'))where arquivado_em is null;
create index nr_doc_copias_manifesto on public.nr_documentos using gin((dados->'documentos_originais'));
create index nr_doc_copias_conversao on public.nr_documentos using gin((dados#>'{conversao,documentos_originais}'));
create index nr_doc_contexto_local on public.nr_documentos(organization_id,unidade_id,local_id,id)where arquivado_em is null;
create index nr_sistemas_contexto_local on public.nr_sistemas(organization_id,unidade_id,local_id,id)where arquivado_em is null;

create function public.nr_documento_copia_comprovada(p_org uuid,p_dados jsonb)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.nr_documentos d join public.nr_arquivos a on a.organization_id=d.organization_id and a.cliente_id=d.cliente_id and a.unidade_id=d.unidade_id and a.id::text=coalesce(p_dados->>'arquivo_original_id',p_dados#>>'{conversao,original_arquivo_id}')and a.estado='vinculado'and a.bytes_verificados and(a.documento_id=d.id or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=p_org and l.arquivo_id=a.id and l.documento_id=d.id))where d.organization_id=p_org and(
 p_dados#>>'{conversao,documento_origem_id}'=d.id::text or
 p_dados->'documentos_originais'@>jsonb_build_array(jsonb_build_object('documento_id',d.id))or
 p_dados#>'{conversao,documentos_originais}'@>jsonb_build_array(jsonb_build_object('documento_id',d.id))))
$$;

create function public.nr_documento_resumo(p_org uuid,p_norma text,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare d public.nr_documentos;v public.nr_documento_revisoes;nota text;arquivos jsonb;copias jsonb;begin
 select * into d from public.nr_documentos where organization_id=p_org and id=p_id;
 select * into v from public.nr_documento_revisoes where organization_id=p_org and id=d.revisao_atual_id;
 nota:=case when v.snapshot is not null then coalesce(nullif(d.dados->>'substituido_por',''),case when d.dados->>'desatualizado'~*'substitu[ií]d[oa]'then d.dados->>'desatualizado'end,case when d.descricao~*'substitu[ií]d[oa]'then d.descricao end)end;
 select jsonb_build_object('word',count(*)filter(where a.extensao='docx'),'pdf',count(*)filter(where a.extensao='pdf'),'total',count(*))into arquivos
 from public.nr_arquivos a where a.organization_id=p_org and a.estado='vinculado'and a.bytes_verificados and(
  (a.documento_id=d.id and a.revisao_id=v.id)or exists(select 1 from public.nr_arquivo_vinculos l where l.organization_id=p_org and l.arquivo_id=a.id and l.documento_id=d.id and l.revisao_id=v.id));
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'titulo',c.titulo,'estado',c.estado,'revisao_atual_id',c.revisao_atual_id,'normas',c.normas)order by c.titulo,c.id),'[]')into copias
 from public.nr_documentos c where c.organization_id=p_org and c.cliente_id=d.cliente_id and c.unidade_id=d.unidade_id and c.id<>d.id and c.arquivado_em is null and p_norma=any(c.normas)and public.nr_documento_copia_comprovada(p_org,c.dados)and(
 c.dados#>>'{conversao,documento_origem_id}'=d.id::text or
 c.dados->'documentos_originais'@>jsonb_build_array(jsonb_build_object('documento_id',d.id))or
 c.dados#>'{conversao,documentos_originais}'@>jsonb_build_array(jsonb_build_object('documento_id',d.id)));
 return jsonb_build_object('vigencia',v.vigencia,'vigencia_apresentacao',case when v.vigencia='superada'then 'superada'when nota is not null then 'substituicao_declarada'when v.snapshot is not null and coalesce(d.dados->>'desatualizado','')not in('','false','null')then 'desatualizacao_declarada'else coalesce(v.vigencia,'nao_informada')end,
 'motivo_substituicao',nota,'data_origem',v.data_origem,'data_origem_texto',coalesce(nullif(v.snapshot->>'emitido_em',''),nullif(v.snapshot->>'criado_em','')),
 'autor_historico',v.autor_historico,'revisao_numero',v.numero,'arquivos_word',arquivos->'word','arquivos_pdf',arquivos->'pdf','arquivos_total',arquivos->'total',
 'copia_editavel',public.nr_documento_copia_comprovada(p_org,d.dados),'copias_editaveis',copias,'documento_origem_id',d.dados#>>'{conversao,documento_origem_id}',
 'originais_comprovados',coalesce(d.dados->'documentos_originais',d.dados#>'{conversao,documentos_originais}','[]'::jsonb),
 'disponibilidade',case when(arquivos->>'total')::integer>0 then 'arquivos_confirmados'else 'sem_arquivo_confirmado'end);
end$$;

create function public.nr_local_resumo(p_org uuid,p_norma text,p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('setor',l.dados->>'setor','enquadramento',l.dados->'enquadramento','situacao_levantamento',l.dados#>>'{levantamento,situacao}',
 'memorial',coalesce(l.dados#>>'{calculo,indicativo}',l.dados#>>'{ventilacao,validacao}',l.dados#>>'{calculo_fixo,indicativo}'),
 'avaliacoes_total',(select count(*)from public.nr_sistemas s where s.organization_id=p_org and s.local_id=l.id and s.arquivado_em is null and p_norma=any(s.normas)),
 'documentos_total',(select count(*)from public.nr_documentos d where d.organization_id=p_org and d.local_id=l.id and d.arquivado_em is null and p_norma=any(d.normas)and not public.nr_documento_copia_comprovada(p_org,d.dados)),
 'imagens_total',case when jsonb_typeof(l.dados->'fotos')='array'then jsonb_array_length(l.dados->'fotos')else 0 end,
 'historico_tecnico_total',case when jsonb_typeof(l.dados->'historico')='array'then jsonb_array_length(l.dados->'historico')else 0 end)
 from public.nr_locais l where l.organization_id=p_org and l.id=p_id
$$;

create function public.nr_historico_tecnico_consultar(p_org uuid,p_norma text,p_filtros jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);begin
 with eventos as(select l.id local_id,l.tag local_tag,l.titulo local_titulo,l.cliente_id,l.unidade_id,e.ordinality ordem,e.value
 from public.nr_locais l cross join lateral jsonb_array_elements(case when jsonb_typeof(l.dados->'historico')='array'then l.dados->'historico'else '[]'::jsonb end)with ordinality e
 where l.organization_id=p_org and p_norma=any(l.normas)and l.arquivado_em is null and(nullif(p_filtros->>'cliente_id','')is null or l.cliente_id=(p_filtros->>'cliente_id')::uuid)and(nullif(p_filtros->>'unidade_id','')is null or l.unidade_id=(p_filtros->>'unidade_id')::uuid)and(nullif(p_filtros->>'local_id','')is null or l.id=(p_filtros->>'local_id')::uuid)),
 paginados as(select * from eventos order by value->>'data'desc nulls last,local_id,ordem desc offset pagina::bigint*limite limit limite)
 select(select count(*)from eventos),(select coalesce(jsonb_agg(jsonb_build_object('id',local_id::text||':'||ordem::text,'local_id',local_id,'local_tag',local_tag,'local_titulo',local_titulo,'cliente_id',cliente_id,'unidade_id',unidade_id,'data',value->'data','autor_historico',value->'autor','acao',value->'acao','texto',value->'detalhe','evento',value,'escopo','local','categoria','alteracao_tecnica')order by value->>'data'desc nulls last,local_id,ordem desc),'[]')from paginados)into total,linhas;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

-- Contrato interno: somente projeção comprovada por mesma fonte/hash da versão importada.
create function public.nr_levantamento_apresentacao(p_org uuid,p_norma text,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare l public.nr_levantamentos;m public.nr_modelo_versoes;candidato jsonb;begin
 select * into l from public.nr_levantamentos where organization_id=p_org and id=p_id and p_norma=any(normas);
 if not found or not coalesce((l.dados->>'modelo_legado')::boolean,false)or not coalesce((l.dados->>'respostas_extraidas_por_caminho')::boolean,false)then return null;end if;
 select * into m from public.nr_modelo_versoes where organization_id=p_org and id=l.modelo_versao_id;
 if exists(select 1 from jsonb_array_elements(coalesce(m.dados->'blocos','[]'))b cross join lateral jsonb_array_elements(coalesce(b->'campos','[]'))f)then return null;end if;
 -- Não usa os IDs Bxx dos blocos históricos como equivalência (B07 histórico pode ser outra área).
 select jsonb_build_object('id',v.modelo_id,'numero',v.numero,'dados',v.dados,'projecao_versao','nr-levantamento-apresentacao-1','origem','Roteiro da mesma fonte importada; respostas extraídas pelo destino exato Bxx.campo. Snapshot histórico preservado.')into candidato
 from public.nr_fontes sf join public.nr_modelo_versoes v on v.organization_id=sf.organization_id and v.modelo_id=sf.destino_id and v.sha256=sf.sha256
 join public.nr_modelos modelo on modelo.organization_id=v.organization_id and modelo.id=v.modelo_id
 where sf.organization_id=p_org and sf.tipo='modelo_levantamento'and sf.destino_tipo='modelos'and sf.externo_id='MLT-EC-R00'and sf.payload->>'id'=sf.externo_id and v.dados->>'id'=sf.externo_id
 and p_norma=any(modelo.normas)and(modelo.cliente_id is null or modelo.cliente_id=l.cliente_id)and(modelo.unidade_id is null or modelo.unidade_id=l.unidade_id)
 and exists(select 1 from public.nr_fontes lf where lf.organization_id=p_org and lf.destino_tipo='levantamentos'and lf.destino_id=l.id and lf.tipo='levantamento'and lf.origem=sf.origem and jsonb_typeof(lf.payload->'respostas')='object'and not exists(select 1 from jsonb_object_keys(lf.payload->'respostas')r(campo_id)where not exists(select 1 from jsonb_array_elements(coalesce(v.dados->'blocos','[]'))b cross join lateral jsonb_array_elements(coalesce(b->'campos','[]'))f where f->>'id'=r.campo_id)))
 order by v.numero desc,v.id limit 1;
 return candidato;
end$$;

revoke all on function public.nr_contextos_acervo(uuid),public.nr_contexto_associar(uuid,uuid,uuid,text[],uuid),public.nr_tag_ordem(text),public.nr_documento_copia_comprovada(uuid,jsonb),public.nr_documento_resumo(uuid,text,uuid),public.nr_local_resumo(uuid,text,uuid),public.nr_historico_tecnico_consultar(uuid,text,jsonb),public.nr_levantamento_apresentacao(uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_contexto_associar(uuid,uuid,uuid,text[],uuid)to authenticated;

-- Consulta mantém os contratos existentes e acrescenta DTOs de leitura contextual.
create or replace function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);rid uuid:=nullif(p_filtros->>'id','')::uuid;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;busca text:=coalesce(p_filtros->>'busca','');situacao text:=nullif(p_filtros->>'estado','');lixeira boolean:=coalesce((p_filtros->>'lixeira')::boolean,false);r jsonb;extras text:='';recorte text:='$2=any(normas)';begin
 if p_norma is null or p_norma not in('NR33','NR35') or not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 or length(busca)>300 or jsonb_typeof(p_filtros)<>'object' then raise exception 'Filtros inválidos.' using errcode='23514';end if;
 if p_recurso='contexto' then
  with vinculados as(select * from public.nr_contextos_acervo(p_org)),
  unidades as(select u.*,x.normas,f.payload origem from public.unidades u join vinculados x on x.cliente_id=u.cliente_id and x.unidade_id=u.id
   left join lateral(select sf.payload from public.nr_fontes sf where sf.organization_id=p_org and sf.destino_tipo='unidades'and sf.destino_id=u.id and sf.tipo='unidade'order by sf.capturado_em desc,sf.id limit 1)f on true
   where u.organization_id=p_org and u.arquivado_em is null),
  clientes as(select c.* from public.clientes c where c.organization_id=p_org and c.arquivado_em is null and exists(select 1 from unidades u where u.cliente_id=c.id))
  select jsonb_build_object(
   'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'razao_social',c.razao_social,'nome_exibicao',c.nome_exibicao,'cnpj',c.cnpj)order by c.razao_social,c.id),'[]')from clientes c),
   'unidades',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'cliente_id',u.cliente_id,'nome',u.nome,'endereco',u.endereco,'cnpj',u.origem->>'cnpj','escopo',u.origem->>'escopo','situacao',u.origem->>'situacao','responsavel_cliente',u.origem->>'responsavel_cliente','documentacao',u.origem->'documentacao','normas',u.normas,
    'locais',(select count(*)from public.nr_locais l where l.organization_id=p_org and l.unidade_id=u.id and l.arquivado_em is null and p_norma=any(l.normas)),
    'documentos',(select count(*)from public.nr_documentos d where d.organization_id=p_org and d.unidade_id=u.id and d.arquivado_em is null and p_norma=any(d.normas)and not public.nr_documento_copia_comprovada(p_org,d.dados)),
    'pendencias_abertas',(select count(*)from public.nr_pendencias p where p.organization_id=p_org and p.unidade_id=u.id and p.arquivado_em is null and p.estado='aberta'and p_norma=any(p.normas)))order by u.nome,u.id),'[]')from unidades u),
   'permissoes',jsonb_build_object('visualizar',true,'cadastrar',public.pode(p_org,'cadastrar_nr'),'editar',public.pode(p_org,'editar_nr'),'anexar',public.pode(p_org,'anexar_nr'),'mover',public.pode(p_org,'mover_nr'),'arquivar',public.pode(p_org,'arquivar_nr'),'restaurar',public.pode(p_org,'restaurar_nr'),'revisar',public.pode(p_org,'revisar_nr'),'aprovar',false,'emitir',false,'configurar',public.pode(p_org,'configurar_nr')))into r;
  return r;
 end if;
 if p_recurso='historico_tecnico'then return public.nr_historico_tecnico_consultar(p_org,p_norma,p_filtros);end if;
 if p_recurso='painel' then return jsonb_build_object(
  'eventos_globais',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'data',f.payload->'data','autor_historico',f.payload->'autor','acao',f.payload->'acao','escopo','global_sem_associacao','capturado_em',f.capturado_em)order by f.payload->>'data'desc,f.id),'[]')from public.nr_fontes f where f.organization_id=p_org and f.tipo='evento'and f.destino_tipo='referencias'),
  'historico_tecnico',(public.nr_historico_tecnico_consultar(p_org,p_norma,p_filtros||jsonb_build_object('pagina',0,'limite',8)))->'rows',
  'historico_tecnico_total',(public.nr_historico_tecnico_consultar(p_org,p_norma,p_filtros||jsonb_build_object('pagina',0,'limite',1)))->'total',
  'copias_editaveis',(select count(*)from public.nr_documentos d where d.organization_id=p_org and p_norma=any(d.normas)and d.arquivado_em is null and(cliente is null or d.cliente_id=cliente)and(unidade is null or d.unidade_id=unidade)and public.nr_documento_copia_comprovada(p_org,d.dados)),
  'documentos_origem',(select count(*)from public.nr_documentos d where d.organization_id=p_org and p_norma=any(d.normas)and d.arquivado_em is null and(cliente is null or d.cliente_id=cliente)and(unidade is null or d.unidade_id=unidade)and not public.nr_documento_copia_comprovada(p_org,d.dados)),
  'arquivos_fisicos',(select count(*)from public.nr_arquivos a where a.organization_id=p_org and p_norma=any(a.normas)and a.estado='vinculado'and a.bytes_verificados and(cliente is null or a.cliente_id=cliente)and(unidade is null or a.unidade_id=unidade)),
  'documentos_revisao_necessaria',(select count(distinct i.documento_id) from public.nr_documento_impactos i join public.nr_documentos d on d.organization_id=i.organization_id and d.id=i.documento_id where i.organization_id=p_org and p_norma=any(d.normas) and d.arquivado_em is null and(cliente is null or d.cliente_id=cliente)and(unidade is null or d.unidade_id=unidade) and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)),
  'locais',(select count(*) from public.nr_locais where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'documentos',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_abertas',(select count(*) from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'levantamentos',(select count(*) from public.nr_levantamentos where organization_id=p_org and p_norma=any(normas) and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'em_revisao',(select count(*) from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade)),
  'pendencias_prioritarias',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,prazo,criticidade,unidade_id from public.nr_pendencias where organization_id=p_org and p_norma=any(normas) and estado='aberta' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by case criticidade when 'critica' then 0 when 'alta' then 1 else 2 end,prazo nulls last,id limit 8)q),
  'documentos_revisao',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,titulo,estado,unidade_id from public.nr_documentos where organization_id=p_org and p_norma=any(normas) and estado='em_revisao' and arquivado_em is null and(cliente is null or cliente_id=cliente)and(unidade is null or unidade_id=unidade) order by updated_at desc,id limit 8)q));end if;
 if p_recurso='historico' then
  select count(*) into total from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and(h.normas_contexto @> to_jsonb(array[p_norma])or(h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb and cliente is null and unidade is null))and(h.recurso not in('fontes','recibos_storage','import_lotes','import_itens')or public.pode(p_org,'configurar_nr'))and(cliente is null or h.cliente_contexto is null or h.cliente_contexto=cliente::text) and(unidade is null or h.unidade_contexto is null or h.unidade_contexto=unidade::text);
  select coalesce(jsonb_agg(to_jsonb(q)order by q.created_at desc,q.ordem_id desc),'[]') into linhas from(select h.id::text id,h.id ordem_id,h.recurso,h.registro_id,h.comando,left(h.motivo,1000) motivo,coalesce(length(h.motivo)>1000,false) motivo_resumido,h.autor,left(h.autor_historico,240) autor_historico,h.created_at,h.normas_contexto normas,h.cliente_contexto cliente_id,h.unidade_contexto unidade_id,case when h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb then 'nao_classificado'else 'vinculado'end escopo from public.nr_historico h where h.organization_id=p_org and(rid is null or h.registro_id=rid) and(h.normas_contexto @> to_jsonb(array[p_norma])or(h.recurso='eventos_origem'and h.normas_contexto='[]'::jsonb and cliente is null and unidade is null))and(h.recurso not in('fontes','recibos_storage','import_lotes','import_itens')or public.pode(p_org,'configurar_nr'))and(cliente is null or h.cliente_contexto is null or h.cliente_contexto=cliente::text) and(unidade is null or h.unidade_contexto is null or h.unidade_contexto=unidade::text)order by h.created_at desc,h.id desc offset pagina::bigint*limite limit limite)q;
  select coalesce(jsonb_agg(e.value-'ordem_id'order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
  return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
 end if;
 if p_recurso not in('locais','pastas','documentos','pendencias','modelos','levantamentos','sistemas') then raise exception 'Recurso inválido.' using errcode='23514';end if;tabela:='nr_'||p_recurso;
 if rid is not null then
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 and $3=any(normas)',tabela) into r using p_org,rid,p_norma;
  if r is null or(cliente is not null and cliente is distinct from coalesce((r->>'cliente_id')::uuid,cliente))or(unidade is not null and unidade is distinct from coalesce((r->>'unidade_id')::uuid,unidade)) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  r:=public.nr_linha(p_recurso,r);
  linhas:=public.nr_historico_listar(p_org,p_norma,p_recurso,rid,0,25);
  r:=r||jsonb_build_object('historico',linhas->'rows','historico_total',linhas->'total','historico_pagina',0,'historico_limite',25);
  if p_recurso in('documentos','modelos')then
   linhas:=public.nr_revisoes_listar(p_org,p_norma,p_recurso,rid,0,25);
   r:=r||jsonb_build_object('revisoes',linhas->'rows','revisoes_total',linhas->'total','revisoes_pagina',0,'revisoes_limite',25);
  elsif p_recurso='pendencias' then select coalesce(jsonb_agg(to_jsonb(v) order by created_at,id),'[]') into linhas from public.nr_tratativas v where organization_id=p_org and pendencia_id=rid;r:=r||jsonb_build_object('tratativas',linhas);end if;
  if p_recurso='pendencias'then r:=r||jsonb_build_object('revisao_aplicabilidade',public.nr_pendencia_aplicabilidade_candidata(p_org,rid));end if;
  if p_recurso='documentos'then r:=r||jsonb_build_object('resumo_documental',public.nr_documento_resumo(p_org,p_norma,rid));end if;
  if p_recurso='locais'then r:=r||jsonb_build_object('resumo_tecnico',public.nr_local_resumo(p_org,p_norma,rid));end if;
  if p_recurso='levantamentos'then
   r:=r||jsonb_build_object('modelo_apresentacao',public.nr_levantamento_apresentacao(p_org,p_norma,rid),
    'local_contexto',(select jsonb_build_object('tipo',l.tipo,'familia',l.familia,'normas',l.normas)from public.nr_locais l where l.organization_id=p_org and l.id=(r->>'local_id')::uuid));
  end if;
  r:=r||jsonb_build_object('local_contexto',(select jsonb_build_object('tipo',l.tipo,'familia',l.familia,'normas',l.normas)from public.nr_locais l where l.organization_id=p_org and l.id=(r->>'local_id')::uuid),'local_titulo',(select l.titulo from public.nr_locais l where l.organization_id=p_org and l.id=(r->>'local_id')::uuid),'local_tag',(select l.tag from public.nr_locais l where l.organization_id=p_org and l.id=(r->>'local_id')::uuid),'unidade_nome',(select u.nome from public.unidades u where u.organization_id=p_org and u.id=(r->>'unidade_id')::uuid));
  return r;
 end if;
 if p_recurso='pendencias'and p_norma='NR35'and coalesce((p_filtros->>'revisao_aplicabilidade')::boolean,false)then recorte:='($2=any(normas)or public.nr_pendencia_aplicabilidade_candidata($1,t.id)is not null)';end if;
 if p_filtros?'pasta_id'  and p_recurso in('pastas','documentos') then extras:=extras||format(' and to_jsonb(t)->>%L is not distinct from %L',case p_recurso when 'pastas' then 'parent_id' else 'pasta_id' end,nullif(p_filtros->>'pasta_id','')::uuid::text);end if;
 if p_filtros?'local_id'and p_recurso in('documentos','pendencias','levantamentos','sistemas')then extras:=extras||format(' and to_jsonb(t)->>''local_id'' is not distinct from %L',nullif(p_filtros->>'local_id','')::uuid::text);end if;
 if p_recurso='documentos'and coalesce((p_filtros->>'somente_unidade')::boolean,false)then extras:=extras||' and t.local_id is null';end if;
 if p_recurso='documentos'and nullif(p_filtros->>'grupo_documental','')is not null then
  case p_filtros->>'grupo_documental'
   when 'vigentes'then extras:=extras||' and(t.estado=''emitido_origem''or t.estado_origem=''recebido''or t.recebimento=''recebido'')and public.nr_documento_resumo(t.organization_id,$2,t.id)->>''vigencia_apresentacao''=''vigente''';
   when 'emitidos'then extras:=extras||' and t.estado=''emitido_origem''';
   when 'recebidos'then extras:=extras||' and(t.estado_origem=''recebido''or t.recebimento=''recebido'')';
   when 'em_revisao'then extras:=extras||' and t.estado in(''rascunho'',''em_revisao'')';
   when 'anteriores'then extras:=extras||' and public.nr_documento_resumo(t.organization_id,$2,t.id)->>''vigencia_apresentacao''in(''superada'',''substituicao_declarada'',''desatualizacao_declarada'')';
   else raise exception 'Grupo documental inválido.'using errcode='23514';
  end case;
 end if;
 if p_recurso='documentos'and not coalesce((p_filtros->>'copias_editaveis')::boolean,true)then extras:=extras||' and not public.nr_documento_copia_comprovada(t.organization_id,t.dados)';end if;
 if p_recurso='locais'and nullif(p_filtros->>'familia','')is not null then extras:=extras||format(' and t.familia=%L',p_filtros->>'familia');end if;
 if nullif(p_filtros->>'tipo','') is not null then extras:=extras||format(' and to_jsonb(t)->>''tipo''=%L',p_filtros->>'tipo');end if;
 execute format('select count(*) from public.%I t where organization_id=$1 and %s and ($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'' or t.dados->>''setor'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s',tabela,recorte,extras) into total using p_org,p_norma,cliente,unidade,busca,situacao,lixeira;
 execute format('select coalesce(jsonb_agg((to_jsonb(q)-array[''dados'',''conteudo''])||jsonb_build_object(''dados'',''{}''::jsonb)),''[]'') from(select t.* from public.%I t where organization_id=$1 and %s and($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'' or t.dados->>''setor'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s order by %s offset $8 limit $9)q',tabela,recorte,extras,case when p_recurso='pastas'then 'ordem,titulo,id'when p_recurso='locais'then 'unidade_id,public.nr_tag_ordem(tag),tag,titulo,id'else 'updated_at desc,id'end) into linhas using p_org,p_norma,cliente,unidade,busca,situacao,lixeira,pagina*limite,limite;
 if p_recurso='documentos' then
  with selecionados as(select e.value registro,(e.value->>'id')::uuid id,e.ordinality pos from jsonb_array_elements(linhas) with ordinality e),
  pendentes as(select i.documento_id,count(*)::integer quantidade from public.nr_documento_impactos i join selecionados s on s.id=i.documento_id where i.organization_id=p_org and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)group by i.documento_id)
  select coalesce(jsonb_agg(s.registro||jsonb_build_object('revisao_necessaria',coalesce(p.quantidade,0)>0,'impactos_pendentes',coalesce(p.quantidade,0)) order by s.pos),'[]') into linhas from selecionados s left join pendentes p on p.documento_id=s.id;
 end if;
 if p_recurso='documentos'then
  select coalesce(jsonb_agg(e.value||jsonb_build_object('resumo_documental',public.nr_documento_resumo(p_org,p_norma,(e.value->>'id')::uuid))order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
 elsif p_recurso='locais'then
  select coalesce(jsonb_agg(e.value||jsonb_build_object('resumo_tecnico',public.nr_local_resumo(p_org,p_norma,(e.value->>'id')::uuid))order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
 elsif p_recurso='pendencias'then
  select coalesce(jsonb_agg(e.value||jsonb_build_object('revisao_aplicabilidade',public.nr_pendencia_aplicabilidade_candidata(p_org,(e.value->>'id')::uuid))order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
 elsif p_recurso='pastas'then
  select coalesce(jsonb_agg(e.value||jsonb_build_object('resumo_pasta',jsonb_build_object(
   'subpastas',(select count(*)from public.nr_pastas p where p.organization_id=p_org and p.parent_id=(e.value->>'id')::uuid and p.arquivado_em is null and p_norma=any(p.normas)),
   'documentos',(select count(*)from public.nr_documentos d where d.organization_id=p_org and d.pasta_id=(e.value->>'id')::uuid and d.arquivado_em is null and p_norma=any(d.normas)and not public.nr_documento_copia_comprovada(p_org,d.dados)),
   'arquivos',(select count(*)from public.nr_arquivos a where a.organization_id=p_org and a.estado='vinculado'and a.bytes_verificados and p_norma=any(a.normas)and(a.pasta_id=(e.value->>'id')::uuid or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id and v.pasta_id=(e.value->>'id')::uuid))),
   'imagens',(select count(*)from public.nr_arquivos a where a.organization_id=p_org and a.estado='vinculado'and a.bytes_verificados and a.mime like 'image/%'and p_norma=any(a.normas)and(a.pasta_id=(e.value->>'id')::uuid or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id and v.pasta_id=(e.value->>'id')::uuid)))
  ))order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e;
 elsif p_recurso='sistemas'then
  -- Cinco eixos de avaliação são metadados técnicos; não expõe o snapshot inteiro na lista.
  select coalesce(jsonb_agg(e.value||jsonb_build_object('dados',jsonb_build_object('existencia',s.dados->'existencia','aplicabilidade',s.dados->'aplicabilidade','condicao',s.dados->'condicao','acao',s.dados->'acao','validacao',s.dados->'validacao','validacao_nexus',s.dados->'validacao_nexus','familia_biblioteca',s.dados->'familia_biblioteca'))order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e join public.nr_sistemas s on s.organization_id=p_org and s.id=(e.value->>'id')::uuid;
 end if;
 select coalesce(jsonb_agg(e.value||jsonb_build_object('local_titulo',l.titulo,'local_tag',l.tag,'local_contexto',case when l.id is not null then jsonb_build_object('tipo',l.tipo,'familia',l.familia,'normas',l.normas)else null end,'unidade_nome',u.nome)order by e.ordinality),'[]')into linhas from jsonb_array_elements(linhas)with ordinality e left join public.nr_locais l on l.organization_id=p_org and l.id=(e.value->>'local_id')::uuid left join public.unidades u on u.organization_id=p_org and u.id=(e.value->>'unidade_id')::uuid;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;

-- O acesso segue associações explícitas, inclusive imagem compartilhada por documento NR35.
create or replace function public.nr_arquivo_listar(p_org uuid,p_norma text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);begin
 if not public.pode(p_org,'ver_nr') or p_norma is null or p_norma not in('NR33','NR35') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 then raise exception 'Paginação inválida.' using errcode='23514';end if;
 with filtered as(select * from public.nr_arquivos a where a.organization_id=p_org and (p_norma=any(a.normas)or exists(select 1 from public.nr_arquivo_vinculos v join public.nr_documentos d on d.organization_id=v.organization_id and d.id=v.documento_id where v.organization_id=p_org and v.arquivo_id=a.id and p_norma=any(d.normas)))
 and (case when coalesce((p_filtros->>'lixeira')::boolean,false) then a.estado='arquivado' else (a.estado='vinculado' or (a.created_by=auth.uid() and a.estado in('preparado','falhou'))) end)
 and (nullif(p_filtros->>'cliente_id','') is null or a.cliente_id=(p_filtros->>'cliente_id')::uuid)
 and (nullif(p_filtros->>'unidade_id','') is null or a.unidade_id=(p_filtros->>'unidade_id')::uuid)
 and(
  ((nullif(p_filtros->>'pasta_id','')is null or a.pasta_id=(p_filtros->>'pasta_id')::uuid)
   and(nullif(p_filtros->>'documento_id','')is null or a.documento_id=(p_filtros->>'documento_id')::uuid)
   and(nullif(p_filtros->>'revisao_id','')is null or a.revisao_id=(p_filtros->>'revisao_id')::uuid)
   and(nullif(p_filtros->>'local_id','')is null or a.local_id=(p_filtros->>'local_id')::uuid))
  or exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=a.id
   and(nullif(p_filtros->>'pasta_id','')is null or v.pasta_id=(p_filtros->>'pasta_id')::uuid)
   and(nullif(p_filtros->>'documento_id','')is null or v.documento_id=(p_filtros->>'documento_id')::uuid)
   and(nullif(p_filtros->>'revisao_id','')is null or v.revisao_id=(p_filtros->>'revisao_id')::uuid)
   and(nullif(p_filtros->>'local_id','')is null or v.local_id=(p_filtros->>'local_id')::uuid)))
 and(coalesce(p_filtros->>'busca','')=''or position(lower(p_filtros->>'busca')in lower(coalesce(a.nome_exibicao,a.nome)))>0)),paged as(select * from filtered order by created_at desc,id offset pagina*limite limit limite)
 select (select count(*) from filtered),(select coalesce(jsonb_agg(to_jsonb(paged)||jsonb_build_object('revisao_numero',(select r.numero from public.nr_documento_revisoes r where r.organization_id=p_org and r.id=paged.revisao_id),'documento_titulo',(select d.titulo from public.nr_documentos d where d.organization_id=p_org and d.id=paged.documento_id),'contextos',(select coalesce(jsonb_agg(jsonb_build_object('documento_id',v.documento_id,'revisao_id',v.revisao_id,'revisao_numero',(select r.numero from public.nr_documento_revisoes r where r.organization_id=p_org and r.id=v.revisao_id),'documento_titulo',(select d.titulo from public.nr_documentos d where d.organization_id=p_org and d.id=v.documento_id),'local_id',v.local_id,'pasta_id',v.pasta_id,'evidencia',v.evidencia)order by v.id),'[]')from public.nr_arquivo_vinculos v where v.organization_id=p_org and v.arquivo_id=paged.id))order by paged.created_at desc,paged.id),'[]') from paged) into n,rows;
 return jsonb_build_object('rows',rows,'total',n,'pagina',pagina,'limite',limite);
end$$;


-- Uma nota histórica de substituição não autoriza submeter o mesmo rascunho como atual.
create function public.nr_documento_transicao_coerente()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.estado='em_revisao'and old.estado='rascunho'and new.revisao_atual_id is not distinct from old.revisao_atual_id and exists(select 1 from public.nr_documento_revisoes v where v.organization_id=old.organization_id and v.id=old.revisao_atual_id and v.snapshot is not null)and(coalesce(old.dados->>'substituido_por','')<>''or coalesce(old.dados->>'desatualizado','')~*'substitu[ií]d[oa]'or old.descricao~*'substitu[ií]d[oa]')then
  raise exception 'A origem declara este rascunho substituído. Confira o motivo e crie uma nova revisão antes de submetê-lo.'using errcode='23514';
 end if;return new;
end$$;
create trigger nr_documento_transicao_coerente before update on public.nr_documentos for each row execute function public.nr_documento_transicao_coerente();
revoke all on function public.nr_documento_transicao_coerente()from public,anon,authenticated,service_role;

-- Metadados históricos do Drive por arquivo/contexto comprovado. Nenhuma retenção é alterada.
create index nr_import_versoes_contextos on public.nr_import_itens using gin((evidencia->'contextos'))where tipo='versao_arquivo';
create function public.nr_arquivo_versoes_listar(p_org uuid,p_norma text,p_arquivo uuid,p_pagina integer default 0,p_limite integer default 25)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare a public.nr_arquivos;linhas jsonb;total bigint;begin
 if not public.pode(p_org,'ver_nr')or p_norma is null or p_norma not in('NR33','NR35')then raise exception 'Acesso negado.'using errcode='42501';end if;
 if p_pagina is null or p_pagina<0 or p_limite is null or p_limite not between 1 and 100 then raise exception 'Paginação inválida.'using errcode='23514';end if;
 select * into a from public.nr_arquivos f where f.organization_id=p_org and f.id=p_arquivo and(f.estado in('vinculado','arquivado')or f.created_by=auth.uid())and(p_norma=any(f.normas)or exists(select 1 from public.nr_arquivo_vinculos l join public.nr_documentos d on d.organization_id=l.organization_id and d.id=l.documento_id where l.organization_id=p_org and l.arquivo_id=f.id and p_norma=any(d.normas)));
 if not found then raise exception 'Arquivo indisponível no contexto atual.'using errcode='42501';end if;
 with identificados as(
  select distinct on(i.origem,i.externo_id)i.* from public.nr_import_itens i
  where i.organization_id=p_org and i.tipo='versao_arquivo'and i.payload->>'head'='false'
  and i.evidencia->'contextos'@>jsonb_build_array(jsonb_build_object('arquivo_id',a.id,'cliente_id',a.cliente_id,'unidade_id',a.unidade_id))
  and i.payload->>'file_id'=a.origem_metadata->>'drive_id'and i.evidencia->>'drive_file_id'=i.payload->>'file_id'and i.evidencia->>'drive_revision_id'=i.payload->>'revision_id'
  order by i.origem,i.externo_id,i.capturado_em desc,i.updated_at desc,i.id
 ),paginados as(select * from identificados order by payload->>'modified_time'desc nulls last,externo_id,id offset p_pagina::bigint*p_limite limit p_limite)
 select(select count(*)from identificados),(select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'arquivo_id',a.id,'versao_origem',p.payload->>'revision_id','nome_original',p.payload->>'original_filename','mime',p.payload->>'mime','tamanho_declarado',p.payload->>'size',
  'modificado_em',p.payload->>'modified_time','autor_historico',p.payload#>>'{last_modifying_user,displayName}','estado',coalesce(p.payload->>'estado',p.resultado),
  'bytes_disponiveis',h.id is not null,'arquivo_historico_id',h.id,'motivo',coalesce(p.motivo,p.payload->>'motivo'),
  'retencao_origem',case when jsonb_typeof(p.payload->'keep_forever')='boolean'then p.payload->'keep_forever'else 'null'::jsonb end,'capturado_em',p.capturado_em
 )order by p.payload->>'modified_time'desc nulls last,p.externo_id,p.id),'[]')from paginados p
 left join lateral(select f.id from public.nr_arquivos f where f.organization_id=p_org and f.cliente_id=a.cliente_id and f.unidade_id=a.unidade_id and f.id::text=p.evidencia->>'arquivo_historico_id'and f.estado='vinculado'and f.bytes_verificados and f.origem_metadata->>'drive_revision_id'=p.payload->>'revision_id'and f.origem_metadata->>'drive_id'=p.payload->>'file_id'limit 1)h on true)into total,linhas;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',p_pagina,'limite',p_limite);
end$$;
revoke all on function public.nr_arquivo_versoes_listar(uuid,text,uuid,integer,integer)from public,anon,authenticated,service_role;
grant execute on function public.nr_arquivo_versoes_listar(uuid,text,uuid,integer,integer)to authenticated;

-- Candidatura não é enquadramento. A norma registrada só muda por decisão autorizada explícita.
create function public.nr_pendencia_aplicabilidade_candidata(p_org uuid,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare p public.nr_pendencias;fonte public.nr_fontes;trechos jsonb;begin
 select * into p from public.nr_pendencias where organization_id=p_org and id=p_id;
 if not found or 'NR35'=any(p.normas)then return null;end if;
 select * into fonte from public.nr_fontes f where f.organization_id=p_org and f.tipo='pendencia'and f.destino_tipo='pendencias'and f.destino_id=p.id order by f.capturado_em desc,f.id limit 1;
 if not found then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('campo',v.key,'texto',v.value)order by v.key),'[]')into trechos
 from jsonb_each_text(jsonb_build_object('titulo',fonte.payload->>'titulo','descricao',fonte.payload->>'descricao','desfecho',fonte.payload->>'desfecho','conclusao',fonte.payload->>'conclusao','encaminhamento',fonte.payload->>'encaminhamento'))v
 where v.value~*'trabalho[s]?[[:space:]]+em[[:space:]]+altura|linha[s]?[[:space:]]+de[[:space:]]+vida|ancorag|PGSSTA';
 if jsonb_array_length(trechos)=0 then return null;end if;
 return jsonb_build_object('versao','nr-aplicabilidade-candidatos-1','estado','aguardando_revisao','norma_candidata','NR35','normas_registradas',p.normas,'fonte_id',fonte.id,'sha256_origem',fonte.sha256,'origem_externa',fonte.externo_id,'evidencias',trechos,'decisao_automatica',false,'justificativa','A própria pendência de origem menciona trabalho em altura, ancoragem, linha de vida ou PGSSTA. A menção exige análise humana; não demonstra aplicabilidade por si só.');
end$$;
revoke all on function public.nr_pendencia_aplicabilidade_candidata(uuid,uuid)from public,anon,authenticated,service_role;
