-- Publicação técnica interna declarada por profissional; não emite/assina documentos ou PET.
create function public.nr_fonte_oficial_valida(p_url text,p_norma text)returns boolean
language sql immutable set search_path='' as $$
 select p_norma in('NR33','NR35') and p_url is not null and (
 lower(rtrim(p_url,'/'))='https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-'||right(p_norma,2)||'-nr-'||right(p_norma,2)
 or lower(p_url)~('^https://www[.]gov[.]br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/(arquivos/normas-regulamentadoras|normas-regulamentadora/normas-regulamentadoras-vigentes)/nr-?'||right(p_norma,2)||'[^/?#[:space:]]*[.]pdf(/view|/@@download/file)?$')
 )
$$;
revoke all on function public.nr_fonte_oficial_valida(text,text)from public,anon,authenticated,service_role;

create table public.nr_modelo_publicacao_fontes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),modelo_id uuid not null,modelo_versao_id uuid not null,
 natureza text not null check(natureza in('oficial','licenciada')),normas text[] not null check(cardinality(normas)between 1 and 2 and normas<@array['NR33','NR35']::text[]),
 titulo text not null check(length(trim(titulo))between 5 and 500),versao text not null check(length(trim(versao))between 3 and 500),data_fonte date not null,consultado_em date not null,
 url text check(url is null or length(url)<=2000),confronto text not null check(length(trim(confronto))between 20 and 10000),arquivo_id uuid,arquivo_sha256 text check(arquivo_sha256~'^[a-f0-9]{64}$'),arquivo_contexto jsonb,
 licenca_referencia text,licenca_confirmada boolean not null default false,responsavel_id uuid not null,publicado_por uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),foreign key(organization_id,modelo_id,modelo_versao_id)references public.nr_modelo_versoes(organization_id,modelo_id,id),
 foreign key(organization_id,arquivo_id)references public.nr_arquivos(organization_id,id),foreign key(organization_id,responsavel_id)references public.pessoas(organization_id,id),
 check(data_fonte<=consultado_em),check((arquivo_id is null)=(arquivo_sha256 is null)),check(arquivo_contexto is null or jsonb_typeof(arquivo_contexto)='object'),
 check(natureza<>'licenciada'or(arquivo_id is not null and licenca_confirmada and licenca_referencia is not null and length(trim(licenca_referencia))between 20 and 4000))
);
create index nr_publicacao_fontes_versao on public.nr_modelo_publicacao_fontes(organization_id,modelo_id,modelo_versao_id,created_at);
create index nr_publicacao_fontes_arquivo on public.nr_modelo_publicacao_fontes(organization_id,arquivo_id)where arquivo_id is not null;
alter table public.nr_modelo_publicacao_fontes enable row level security;
revoke all on public.nr_modelo_publicacao_fontes from public,anon,authenticated,service_role;
grant select on public.nr_modelo_publicacao_fontes to authenticated;
create policy nr_publicacao_fontes_ler on public.nr_modelo_publicacao_fontes for select to authenticated using(public.pode(organization_id,'ver_nr'));

create function public.nr_modelo_publicacao_fonte_guard()returns trigger language plpgsql security definer set search_path='' as $$
declare m public.nr_modelos;a public.nr_arquivos;n text;begin
 if tg_op<>'INSERT'then raise exception 'Fonte de publicação técnica é imutável.'using errcode='23514';end if;
 select * into m from public.nr_modelos where organization_id=new.organization_id and id=new.modelo_id;
 if not found or m.tipo not in('regra','criterio')or not new.normas<@m.normas or new.consultado_em>(now()at time zone'UTC')::date then raise exception 'Fonte/modelo/data fora do contexto técnico.'using errcode='23514';end if;
 if new.natureza='oficial'then
  foreach n in array new.normas loop if not coalesce(public.nr_fonte_oficial_valida(new.url,n),false)then raise exception 'Fonte oficial deve referenciar a página NR correspondente ou PDF no acervo MTE autorizado, sem parâmetros temporários.'using errcode='23514';end if;end loop;
 elsif new.url is not null and new.url!~'^https://[^/@?#[:space:]]+([/][^?#[:space:]]*)?$'then raise exception 'URL permanente inválida.'using errcode='23514';end if;
 if new.arquivo_id is not null then
  select * into a from public.nr_arquivos where organization_id=new.organization_id and id=new.arquivo_id for update;
  if not found or a.estado<>'vinculado'or not a.bytes_verificados or a.arquivado_em is not null or(m.cliente_id is not null and m.cliente_id<>a.cliente_id)or(m.unidade_id is not null and m.unidade_id<>a.unidade_id)then raise exception 'Arquivo fonte deve estar confirmado no contexto autorizado; referência não comprova bytes.'using errcode='23514';end if;
  new.arquivo_sha256:=a.sha256;new.arquivo_contexto:=jsonb_build_object('id',a.id,'cliente_id',a.cliente_id,'unidade_id',a.unidade_id,'mime',a.mime,'tamanho',a.tamanho,'sha256',a.sha256);
 end if;
 return new;
end$$;
create trigger nr_modelo_publicacao_fonte_guard before insert or update or delete on public.nr_modelo_publicacao_fontes for each row execute function public.nr_modelo_publicacao_fonte_guard();

create function public.nr_modelo_fonte_retencao_guard()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.estado='arquivado'and old.estado<>'arquivado'and exists(select 1 from public.nr_modelo_publicacao_fontes f where f.organization_id=old.organization_id and f.arquivo_id=old.id)then raise exception 'Arquivo retido por versão técnica publicada; preserve a evidência e crie nova edição do modelo.'using errcode='23514';end if;
 return new;
end$$;
create trigger nr_modelo_fonte_retencao before update on public.nr_arquivos for each row execute function public.nr_modelo_fonte_retencao_guard();

create function public.nr_modelo_dados_publicacao_guard()returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE'and old.tipo in('regra','criterio')and new.tipo<>old.tipo then raise exception 'A classificação de regra/critério é preservada; crie outro modelo para mudar o domínio sem contornar a revisão técnica.'using errcode='23514';end if;
 if new.tipo in('regra','criterio')and(new.dados ?| array['publicacao_tecnica','publicacao_tecnica_validada','aprovacao_tecnica']or(new.dados?'ativacao_automatica'and new.dados->'ativacao_automatica'<>'false'::jsonb)or(new.dados?'validacao_normativa'and coalesce(new.dados->>'validacao_normativa','')not in('pendente','nao_revisado','nao_verificado')))then raise exception 'Situação técnica não é um campo editável; registre publicação interna pelo fluxo profissional. Nenhuma regra é aplicada automaticamente.'using errcode='23514';end if;
 return new;
end$$;
create trigger nr_modelo_dados_publicacao before insert or update on public.nr_modelos for each row execute function public.nr_modelo_dados_publicacao_guard();

create function public.nr_modelo_publicacao_contexto(p_org uuid,p_norma text,p_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.nr_modelos;prof uuid;cap boolean;motivo text;v jsonb;f jsonb;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_norma is null or p_norma not in('NR33','NR35')then raise exception 'Acesso negado.'using errcode='42501';end if;
 select * into m from public.nr_modelos where organization_id=p_org and id=p_id and p_norma=any(normas);
 if not found then raise exception 'Modelo indisponível.'using errcode='42501';end if;
 prof:=public.lev_profissional(p_org);cap:=public.pode(p_org,'configurar_nr')and public.pode(p_org,'revisar_nr')and prof is not null;
 motivo:=case when m.tipo not in('regra','criterio')then 'Este fluxo publica regras e critérios técnicos internos.'when not public.pode(p_org,'configurar_nr')or not public.pode(p_org,'revisar_nr')then 'Seu papel não permite configurar e revisar critérios.'when prof is null then 'Vincule uma pessoa ativa ao usuário com registro profissional declarado e permissão operacional de revisão. Ser administrador não confere responsabilidade técnica.'when m.arquivado_em is not null then 'Restaure o modelo para preparar uma edição.'when m.estado='publicado'then 'Crie nova edição para alterar uma versão publicada.'else null end;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.numero desc),'[]')into v from(select x.id,x.numero,x.fonte,x.responsavel_id,x.sha256,x.created_at,
  case when exists(select 1 from public.nr_modelo_publicacao_fontes s where s.organization_id=x.organization_id and s.modelo_versao_id=x.id)then jsonb_build_object('publicacao_tecnica',jsonb_build_object('tipo','declaracao_revisao_interna','responsavel_id',x.responsavel_id,'profissional_snapshot',x.dados->'publicacao_tecnica'->'profissional_snapshot','aplicacao_automatica',false,'certificacao_externa',false))else'{}'::jsonb end as dados,
  exists(select 1 from public.nr_modelo_publicacao_fontes s where s.organization_id=x.organization_id and s.modelo_versao_id=x.id)as publicacao_tecnica_interna
  from public.nr_modelo_versoes x where x.organization_id=p_org and x.modelo_id=p_id order by numero desc limit 25)q;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.created_at,q.id),'[]')into f from(select id,modelo_versao_id,natureza,normas,titulo,versao,data_fonte,consultado_em,url,arquivo_id,arquivo_sha256,arquivo_contexto,licenca_confirmada,responsavel_id,publicado_por,created_at from public.nr_modelo_publicacao_fontes where organization_id=p_org and modelo_id=p_id and modelo_versao_id=(select x.id from public.nr_modelo_versoes x where x.organization_id=p_org and x.modelo_id=p_id and exists(select 1 from public.nr_modelo_publicacao_fontes s where s.organization_id=p_org and s.modelo_versao_id=x.id)order by x.numero desc limit 1)order by created_at desc,id limit 20)q;
 return jsonb_build_object('profissional',(select jsonb_build_object('id',id,'nome',nome,'registro_profissional',registro_profissional)from public.pessoas where organization_id=p_org and id=prof),'pode_publicar',coalesce(cap and motivo is null,false),'bloqueio',motivo,'versoes',v,'fontes',f);
end$$;

create function public.nr_modelo_publicar_tecnico(p_org uuid,p_norma text,p_id uuid,p_expected_version integer,p_chave uuid,p_evidencia jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.nr_modelos;v public.nr_modelo_versoes;prof uuid;src jsonb;n text;ids uuid[];fid uuid;a public.nr_arquivos;r jsonb;payload jsonb;d jsonb;revdate date;begin
 if p_norma is null or p_norma not in('NR33','NR35')or p_chave is null or p_expected_version is null or jsonb_typeof(p_evidencia)is distinct from'object'or octet_length(p_evidencia::text)>200000 then raise exception 'Publicação técnica inválida.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not coalesce(public.pode(p_org,'ver_nr')and public.pode(p_org,'configurar_nr')and public.pode(p_org,'revisar_nr'),false)then raise exception 'Permissão insuficiente para revisão técnica.'using errcode='42501';end if;
 prof:=public.lev_profissional(p_org);if prof is null then raise exception 'Publicação interna exige pessoa ativa vinculada ao usuário, registro profissional declarado e permissão operacional de revisão.'using errcode='42501';end if;
 perform public.ag_payload(p_evidencia,array['motivo','escopo','excecoes','confrontado_em','declaracao_revisao','fontes']);
 if length(trim(coalesce(p_evidencia->>'motivo','')))not between 10 and 4000 or length(trim(coalesce(p_evidencia->>'escopo','')))not between 10 and 10000 or length(trim(coalesce(p_evidencia->>'excecoes','')))not between 3 and 10000 or p_evidencia->'declaracao_revisao'is distinct from'true'::jsonb or jsonb_typeof(p_evidencia->'fontes')is distinct from'array'or jsonb_array_length(p_evidencia->'fontes')not between 1 and 20 or coalesce(p_evidencia->>'confrontado_em','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'then raise exception 'Informe confronto, escopo, exceções, motivo e declaração do responsável.'using errcode='23514';end if;
 revdate:=(p_evidencia->>'confrontado_em')::date;if revdate>(now()at time zone'UTC')::date then raise exception 'Data de revisão não pode estar no futuro.'using errcode='23514';end if;
 select * into m from public.nr_modelos where organization_id=p_org and id=p_id and p_norma=any(normas)for update;
 if not found or m.tipo not in('regra','criterio')then raise exception 'Regra/critério indisponível.'using errcode='42501';end if;
 payload:=jsonb_build_object('modelo_id',p_id,'norma',p_norma,'expected_version',p_expected_version,'responsavel_id',prof,'evidencia',p_evidencia);
 r:=public.operacao_repetir(p_org,p_chave,'nr_modelo_publicar_tecnico',payload);if r is not null then return public.nr_consultar(p_org,p_norma,'modelos',jsonb_build_object('id',p_id));end if;
 if m.version<>p_expected_version then raise exception 'Modelo alterado; compare as versões antes de publicar.'using errcode='40001';end if;
 if m.estado not in('rascunho','em_revisao')or m.arquivado_em is not null then raise exception 'Prepare nova edição para publicar.'using errcode='23514';end if;
 if jsonb_array_length(m.conteudo->'blocos')=0 and length(trim(m.descricao))=0 then raise exception 'Informe o conteúdo técnico antes de revisar.'using errcode='23514';end if;
 for src in select value from jsonb_array_elements(p_evidencia->'fontes')loop
  if jsonb_typeof(src)is distinct from'object'then raise exception 'Fonte inválida.'using errcode='23514';end if;
  perform public.ag_payload(src,array['natureza','normas','titulo','versao','data_fonte','consultado_em','confronto','url','arquivo_id','licenca_referencia','licenca_confirmada']);
  if coalesce(src->>'natureza','')not in('oficial','licenciada')or jsonb_typeof(src->'normas')is distinct from'array'or jsonb_array_length(src->'normas')not between 1 and 2 or not src->'normas'<@to_jsonb(m.normas)or length(trim(coalesce(src->>'titulo','')))not between 5 and 500 or length(trim(coalesce(src->>'versao','')))not between 3 and 500 or length(trim(coalesce(src->>'confronto','')))not between 20 and 10000 or coalesce(src->>'data_fonte','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'or coalesce(src->>'consultado_em','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'then raise exception 'Fonte exige natureza, norma, versão, datas e confronto.'using errcode='23514';end if;
  if(src->>'data_fonte')::date>(src->>'consultado_em')::date or(src->>'consultado_em')::date>revdate then raise exception 'Datas da fonte/consulta/confronto incompatíveis.'using errcode='23514';end if;
  if src->>'natureza'='oficial'then for n in select jsonb_array_elements_text(src->'normas')loop if not coalesce(public.nr_fonte_oficial_valida(src->>'url',n),false)then raise exception 'Fonte oficial MTE/NR não reconhecida; URL genérica não comprova confronto.'using errcode='23514';end if;end loop;
  elsif nullif(src->>'arquivo_id','')is null or src->'licenca_confirmada'is distinct from'true'::jsonb or length(trim(coalesce(src->>'licenca_referencia','')))not between 20 and 4000 then raise exception 'Referência licenciada exige arquivo confirmado e declaração/evidência de autorização de uso.'using errcode='23514';end if;
 end loop;
 foreach n in array m.normas loop if not exists(select 1 from jsonb_array_elements(p_evidencia->'fontes')s where s->>'natureza'='oficial'and s->'normas'@>to_jsonb(array[n]))then raise exception 'Cada norma aplicável exige confronto próprio com fonte oficial MTE.'using errcode='23514';end if;end loop;
 select array_agg(distinct nullif(x->>'arquivo_id','')::uuid order by nullif(x->>'arquivo_id','')::uuid)into ids from jsonb_array_elements(p_evidencia->'fontes')x where nullif(x->>'arquivo_id','')is not null;
 foreach fid in array coalesce(ids,'{}')loop
  select * into a from public.nr_arquivos where organization_id=p_org and id=fid for update;
  if not found or a.estado<>'vinculado'or not a.bytes_verificados or a.arquivado_em is not null or(m.cliente_id is not null and m.cliente_id<>a.cliente_id)or(m.unidade_id is not null and m.unidade_id<>a.unidade_id)then raise exception 'Arquivo fonte indisponível/fora do contexto autorizado.'using errcode='23514';end if;
 end loop;
 d:=m.dados||jsonb_build_object('publicacao_tecnica',jsonb_build_object('tipo','declaracao_revisao_interna','responsavel_id',prof,'executor',auth.uid(),'profissional_snapshot',(select jsonb_build_object('id',id,'nome',nome,'registro_profissional_declarado',registro_profissional)from public.pessoas where organization_id=p_org and id=prof),'evidencia',p_evidencia,'modelo_snapshot',jsonb_build_object('titulo',m.titulo,'descricao',m.descricao,'tipo',m.tipo,'normas',m.normas,'cliente_id',m.cliente_id,'unidade_id',m.unidade_id,'version',m.version),'aplicacao_automatica',false,'certificacao_externa',false));
 insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,fonte,responsavel_id,sha256)values(p_org,p_id,(select coalesce(max(numero),0)+1 from public.nr_modelo_versoes where organization_id=p_org and modelo_id=p_id),m.conteudo,d,'Fontes e declaração de confronto preservadas na publicação técnica interna.',prof,public.pet_sha256(jsonb_build_object('conteudo',m.conteudo,'dados',d)))returning * into v;
 for src in select value from jsonb_array_elements(p_evidencia->'fontes')loop
  insert into public.nr_modelo_publicacao_fontes(organization_id,modelo_id,modelo_versao_id,natureza,normas,titulo,versao,data_fonte,consultado_em,url,confronto,arquivo_id,licenca_referencia,licenca_confirmada,responsavel_id,publicado_por)
  values(p_org,p_id,v.id,src->>'natureza',array(select jsonb_array_elements_text(src->'normas')),src->>'titulo',src->>'versao',(src->>'data_fonte')::date,(src->>'consultado_em')::date,nullif(src->>'url',''),src->>'confronto',nullif(src->>'arquivo_id','')::uuid,nullif(src->>'licenca_referencia',''),coalesce((src->>'licenca_confirmada')::boolean,false),prof,auth.uid());
 end loop;
 update public.nr_modelos set estado='publicado'where id=p_id;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,motivo,autor)values(p_org,'modelos',p_id,'publicar_tecnico',to_jsonb(m),jsonb_build_object('organization_id',p_org,'normas',m.normas,'cliente_id',m.cliente_id,'unidade_id',m.unidade_id,'modelo',public.nr_linha('modelos',(select to_jsonb(x)from public.nr_modelos x where id=p_id)),'versao_id',v.id,'numero',v.numero,'sha256',v.sha256,'responsavel_id',prof),p_evidencia->>'motivo',auth.uid());
 perform public.operacao_concluir(p_org,p_chave,'nr_modelo_publicar_tecnico',payload,jsonb_build_object('modelo_id',p_id,'versao_id',v.id));
 return public.nr_consultar(p_org,p_norma,'modelos',jsonb_build_object('id',p_id));
end$$;
revoke all on function public.nr_modelo_publicacao_fonte_guard(),public.nr_modelo_fonte_retencao_guard(),public.nr_modelo_dados_publicacao_guard()from public,anon,authenticated,service_role;
revoke all on function public.nr_modelo_publicacao_contexto(uuid,text,uuid),public.nr_modelo_publicar_tecnico(uuid,text,uuid,integer,uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_modelo_publicacao_contexto(uuid,text,uuid),public.nr_modelo_publicar_tecnico(uuid,text,uuid,integer,uuid,jsonb)to authenticated;
