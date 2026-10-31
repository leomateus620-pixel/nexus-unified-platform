-- Derivados privados são bytes próprios, nunca substituem o original nem criam vínculos técnicos.
create table public.nr_imagem_representacoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 arquivo_id uuid not null, original_sha256 text not null check(original_sha256~'^[a-f0-9]{64}$'),
 variante text not null check(variante in('miniatura_384','previa_768')),
 processador text not null default 'nexus-pillow-v1' check(processador='nexus-pillow-v1'),
 proveniencia text not null default 'gerada_nexus' check(proveniencia='gerada_nexus'),
 estado text not null default 'fila' check(estado in('fila','processando','disponivel','falhou')),
 caminho text generated always as(organization_id::text||'/representacoes/'||arquivo_id::text||'/'||original_sha256||'/nexus-pillow-v1/'||variante||'.webp') stored,
 mime text check(mime='image/webp'), tamanho bigint check(tamanho between 1 and 52428800),
 largura integer check(largura between 1 and 768), altura integer check(altura between 1 and 768),
 sha256 text check(sha256~'^[a-f0-9]{64}$'),tentativas integer not null default 0 check(tentativas between 0 and 3),
 lease uuid,lease_ate timestamptz,erro text,created_at timestamptz not null default now(),processado_em timestamptz,
 unique(organization_id,arquivo_id,original_sha256,variante,processador),unique(caminho),
 foreign key(organization_id,arquivo_id)references public.nr_arquivos(organization_id,id),
 check(estado<>'disponivel'or(mime is not null and tamanho is not null and largura is not null and altura is not null and sha256 is not null and processado_em is not null))
);
create index nr_imagem_trabalho on public.nr_imagem_representacoes(estado,lease_ate,created_at,id);
alter table public.nr_imagem_representacoes enable row level security;
revoke all on public.nr_imagem_representacoes from public,anon,authenticated,service_role;
grant select on public.nr_imagem_representacoes to authenticated;
create policy nr_imagem_metadata on public.nr_imagem_representacoes for select to authenticated
 using(public.nr_arquivo_ler(organization_id,arquivo_id));
create policy nr_imagem_download on storage.objects for select to authenticated
 using(bucket_id='nexus-nr-acervo'and exists(select 1 from public.nr_imagem_representacoes r
 where r.caminho=name and r.estado='disponivel'and public.nr_arquivo_ler(r.organization_id,r.arquivo_id)));

create function public.nr_imagem_enfileirar()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.estado='vinculado'and new.bytes_verificados and new.mime like'image/%'and coalesce(new.origem_metadata->>'tipo','')<>'miniatura_origem'then
  insert into public.nr_imagem_representacoes(organization_id,arquivo_id,original_sha256,variante)
  select new.organization_id,new.id,new.sha256,v from unnest(array['miniatura_384','previa_768'])v
  on conflict(organization_id,arquivo_id,original_sha256,variante,processador)do nothing;
 end if;return new;
end$$;
create trigger nr_imagem_enfileirar after insert or update of estado,bytes_verificados on public.nr_arquivos
 for each row execute function public.nr_imagem_enfileirar();
insert into public.nr_imagem_representacoes(organization_id,arquivo_id,original_sha256,variante)
 select a.organization_id,a.id,a.sha256,v from public.nr_arquivos a
 cross join unnest(array['miniatura_384','previa_768'])v
 where a.estado='vinculado'and a.bytes_verificados and a.mime like'image/%'and coalesce(a.origem_metadata->>'tipo','')<>'miniatura_origem'
 on conflict(organization_id,arquivo_id,original_sha256,variante,processador)do nothing;

create function public.nr_imagem_representacao_ler(p_org uuid,p_arquivo uuid,p_variante text)returns jsonb
 language plpgsql stable security definer set search_path=''as $$declare r public.nr_imagem_representacoes;begin
 if not public.nr_arquivo_ler(p_org,p_arquivo)then raise exception'Acesso negado.'using errcode='42501';end if;
 if p_variante is null or p_variante not in('miniatura_384','previa_768')then raise exception'Variante inválida.'using errcode='23514';end if;
 select i.*into r from public.nr_imagem_representacoes i join public.nr_arquivos a
 on a.organization_id=i.organization_id and a.id=i.arquivo_id and a.sha256=i.original_sha256
 where i.organization_id=p_org and i.arquivo_id=p_arquivo and i.variante=p_variante;
 if not found then return jsonb_build_object('estado','sem_representacao');end if;
 return to_jsonb(r)-array['lease','lease_ate','erro'];
end$$;

-- Somente o worker privilegiado recebe originais pendentes. SKIP LOCKED + lease permitem retomada.
create function public.nr_imagem_trabalho_obter(p_limite integer default 1)returns jsonb
 language plpgsql security definer set search_path=''as $$declare result jsonb;begin
 if p_limite is null or p_limite not between 1 and 3 then raise exception'Lote inválido.'using errcode='23514';end if;
 with jobs as(select r.id from public.nr_imagem_representacoes r join public.nr_arquivos a
  on a.organization_id=r.organization_id and a.id=r.arquivo_id and a.sha256=r.original_sha256
  where a.estado='vinculado'and a.bytes_verificados and r.tentativas<3
   and(r.estado='fila'or(r.estado='processando'and r.lease_ate<clock_timestamp()))
  order by r.created_at,r.id limit p_limite for update of r skip locked), claimed as(
 update public.nr_imagem_representacoes r set estado='processando',tentativas=tentativas+1,
  lease=gen_random_uuid(),lease_ate=clock_timestamp()+interval'5 minutes',erro=null
 from jobs where r.id=jobs.id returning r.*)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('original_caminho',a.caminho,
  'original_mime',a.mime,'original_tamanho',a.tamanho)),'[]')into result
 from claimed c join public.nr_arquivos a on a.organization_id=c.organization_id and a.id=c.arquivo_id;
 return result;
end$$;
create function public.nr_imagem_trabalho_concluir(p_id uuid,p_lease uuid,p_resultado jsonb)returns void
 language plpgsql security definer set search_path=''as $$declare r public.nr_imagem_representacoes;begin
 select *into r from public.nr_imagem_representacoes where id=p_id for update;
 if not found or r.estado<>'processando'or r.lease is distinct from p_lease or r.lease_ate<clock_timestamp()then
  raise exception'Trabalho expirado ou já concluído.'using errcode='40001';end if;
 if p_resultado->>'estado'='disponivel'then
  if p_resultado->>'mime'is distinct from'image/webp'or(p_resultado->>'tamanho')::bigint not between 1 and 52428800
   or(p_resultado->>'largura')::integer not between 1 and(case r.variante when'miniatura_384'then 384 else 768 end)
   or(p_resultado->>'altura')::integer not between 1 and(case r.variante when'miniatura_384'then 384 else 768 end)
   or(p_resultado->>'sha256')!~'^[a-f0-9]{64}$'or not(p_resultado?'sha256'and p_resultado?'largura'and p_resultado?'altura'and p_resultado?'tamanho')then
   raise exception'Representação inválida.'using errcode='23514';end if;
  update public.nr_imagem_representacoes set estado='disponivel',mime=p_resultado->>'mime',
   tamanho=(p_resultado->>'tamanho')::bigint,largura=(p_resultado->>'largura')::integer,
   altura=(p_resultado->>'altura')::integer,sha256=p_resultado->>'sha256',processado_em=clock_timestamp(),lease=null,lease_ate=null
   where id=p_id;
 else
  update public.nr_imagem_representacoes set estado=case when tentativas<3 then'fila'else'falhou'end,
   erro=left(coalesce(p_resultado->>'erro','Falha de processamento'),500),lease=null,lease_ate=null where id=p_id;
 end if;
end$$;
revoke all on function public.nr_imagem_enfileirar(),public.nr_imagem_representacao_ler(uuid,uuid,text),
 public.nr_imagem_trabalho_obter(integer),public.nr_imagem_trabalho_concluir(uuid,uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_imagem_representacao_ler(uuid,uuid,text)to authenticated;
grant execute on function public.nr_imagem_trabalho_obter(integer),public.nr_imagem_trabalho_concluir(uuid,uuid,jsonb)to service_role;

-- Ocorrências preservam sua identidade e legenda; miniatura da origem pode existir sem original.
create table public.nr_foto_ocorrencias (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 cliente_id uuid not null,unidade_id uuid not null,local_id uuid not null,
 origem text not null,ocorrencia_origem text not null,referencia_original text not null,
 referencia_miniatura text,ordem integer not null check(ordem>=0),campo text not null default 'fotos',
 arquivo_id uuid,miniatura_arquivo_id uuid,miniatura_proveniencia text check(miniatura_proveniencia in('origem','nexus')),
 legenda_origem text not null default '',categoria_origem text,data_origem text,autoria_historica text,
 evidencia jsonb not null check(jsonb_typeof(evidencia)='object'),created_at timestamptz not null default now(),
 unique(organization_id,origem,ocorrencia_origem),unique(organization_id,local_id,campo,ordem,referencia_original),
 foreign key(organization_id,cliente_id,unidade_id,local_id)references public.nr_locais(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,arquivo_id)references public.nr_arquivos(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id,miniatura_arquivo_id)references public.nr_arquivos(organization_id,cliente_id,unidade_id,id),
 check(miniatura_arquivo_id is null or miniatura_proveniencia is not null)
);
alter table public.nr_foto_ocorrencias enable row level security;
revoke all on public.nr_foto_ocorrencias from public,anon,authenticated,service_role;
create function public.nr_foto_ocorrencias_ler(p_org uuid,p_local uuid)returns jsonb
 language plpgsql stable security definer set search_path=''as $$begin
 if not public.pode(p_org,'ver_nr')or not exists(select 1 from public.nr_locais where organization_id=p_org and id=p_local)then
  raise exception'Acesso negado.'using errcode='42501';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'ordem',o.ordem,'campo',o.campo,
  'referencia_original',o.referencia_original,'referencia_miniatura',o.referencia_miniatura,
  'arquivo_id',case when public.nr_arquivo_ler(p_org,o.arquivo_id)then o.arquivo_id end,
  'miniatura_arquivo_id',case when public.nr_arquivo_ler(p_org,o.miniatura_arquivo_id)then o.miniatura_arquivo_id end,
  'miniatura_proveniencia',o.miniatura_proveniencia)order by o.ordem,o.id),'[]')
 from public.nr_foto_ocorrencias o where o.organization_id=p_org and o.local_id=p_local);
end$$;
-- Relações são inseridas exclusivamente por manutenção com evidência e IDs de de-para comprovados.
-- ON CONFLICT não regrava legendas/vínculos já reconciliados: divergências exigem revisão explícita.
create function public.nr_foto_ocorrencia_importar(p_org uuid,p_dados jsonb)returns uuid
 language plpgsql security definer set search_path=''as $$declare o public.nr_foto_ocorrencias;l public.nr_locais;
 original uuid:=nullif(p_dados->>'arquivo_id','')::uuid;mini uuid:=nullif(p_dados->>'miniatura_arquivo_id','')::uuid;begin
 select *into l from public.nr_locais where organization_id=p_org and id=(p_dados->>'local_id')::uuid;
 if not found then raise exception'Local não conciliado.'using errcode='23514';end if;
 if nullif(p_dados->>'referencia_original','')is null or nullif(p_dados->>'ocorrencia_origem','')is null
  or nullif(p_dados->>'origem','')is null or jsonb_typeof(p_dados->'evidencia')is distinct from'object'then
  raise exception'Evidência da ocorrência obrigatória.'using errcode='23514';end if;
 if exists(select 1 from unnest(array[original,mini])f(id)where id is not null and not exists(
  select 1 from public.nr_arquivos a where a.organization_id=p_org and a.id=f.id and a.cliente_id=l.cliente_id
   and a.unidade_id=l.unidade_id and a.estado='vinculado'and a.bytes_verificados and a.mime like'image/%'))then
  raise exception'Imagem não verificada ou contexto divergente.'using errcode='23514';end if;
 select *into o from public.nr_foto_ocorrencias where organization_id=p_org and origem=p_dados->>'origem'
  and ocorrencia_origem=p_dados->>'ocorrencia_origem';
 if found then
  if o.local_id is distinct from l.id or o.referencia_original is distinct from p_dados->>'referencia_original'
   or o.arquivo_id is distinct from original or o.miniatura_arquivo_id is distinct from mini then
   raise exception'Ocorrência já conciliada com conteúdo diferente; revisão explícita obrigatória.'using errcode='23505';end if;
  return o.id;
 end if;
 insert into public.nr_foto_ocorrencias(organization_id,cliente_id,unidade_id,local_id,origem,ocorrencia_origem,
  referencia_original,referencia_miniatura,ordem,campo,arquivo_id,miniatura_arquivo_id,miniatura_proveniencia,
  legenda_origem,categoria_origem,data_origem,autoria_historica,evidencia)
 values(p_org,l.cliente_id,l.unidade_id,l.id,p_dados->>'origem',p_dados->>'ocorrencia_origem',p_dados->>'referencia_original',
  p_dados->>'referencia_miniatura',(p_dados->>'ordem')::integer,coalesce(p_dados->>'campo','fotos'),original,mini,
  p_dados->>'miniatura_proveniencia',coalesce(p_dados->>'legenda_origem',''),p_dados->>'categoria_origem',
  p_dados->>'data_origem',p_dados->>'autoria_historica',p_dados->'evidencia')returning id into original;
 return original;
end$$;
revoke all on function public.nr_foto_ocorrencias_ler(uuid,uuid),public.nr_foto_ocorrencia_importar(uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_foto_ocorrencias_ler(uuid,uuid)to authenticated;
