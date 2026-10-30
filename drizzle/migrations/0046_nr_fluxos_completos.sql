-- Fluxos operacionais NR: revisão com roteiro fixado, documento derivado de modelo,
-- captura verificável de campos da base e ordenação recuperável de pastas.
create function public.nr_valor_preenchido(p_valor jsonb)returns boolean language sql immutable set search_path=''as $$
 select p_valor is not null and p_valor<>'null'::jsonb and case jsonb_typeof(p_valor)when'string'then length(trim(p_valor#>>'{}'))>0 when'array'then jsonb_array_length(p_valor)>0 when'object'then p_valor<>'{}'::jsonb else true end
$$;
create function public.nr_condicao_levantamento(p_condicao jsonb,p_respostas jsonb,p_local jsonb)returns jsonb
language plpgsql immutable set search_path=''as $$declare k text;opcoes jsonb;valor jsonb;begin
 if p_condicao is null or p_condicao='null'::jsonb then return jsonb_build_object('aplica',true);end if;
 if jsonb_typeof(p_condicao)<>'object'or exists(select 1 from jsonb_object_keys(p_condicao)as keys(nome)where keys.nome not in('familias','tipos_local','campo','valor'))then return jsonb_build_object('aplica',null,'motivo','Condição do roteiro sem estrutura suportada; revise a versão do modelo.');end if;
 foreach k in array array['familias','tipos_local']loop
  if p_condicao?k then
   opcoes:=p_condicao->k;
   if jsonb_typeof(opcoes) is distinct from'array'or jsonb_array_length(opcoes)=0 or exists(select 1 from jsonb_array_elements(opcoes)e where jsonb_typeof(e)<>'string')then return jsonb_build_object('aplica',null,'motivo','A condição por família/tipo precisa de uma lista explícita.');end if;
   valor:=p_local->case k when'familias'then'familia'else'tipo'end;
   if not public.nr_valor_preenchido(valor)then return jsonb_build_object('aplica',null,'motivo',case k when'familias'then'Defina a família do local para determinar a aplicabilidade deste bloco.'else'Defina a classificação do local para determinar a aplicabilidade deste bloco.'end);end if;
   if not opcoes @> jsonb_build_array(valor)then return jsonb_build_object('aplica',false);end if;
  end if;
 end loop;
 if p_condicao?'campo'or p_condicao?'valor'then
  if jsonb_typeof(p_condicao->'campo')is distinct from'string'or jsonb_typeof(p_condicao->'valor')is distinct from'array'or jsonb_array_length(p_condicao->'valor')=0 then return jsonb_build_object('aplica',null,'motivo','Condição de campo sem referência e opções verificáveis.');end if;
  valor:=p_respostas->(p_condicao->>'campo');
  if not public.nr_valor_preenchido(valor)then return jsonb_build_object('aplica',null,'motivo','Informe o campo '||(p_condicao->>'campo')||' para determinar a aplicabilidade.');end if;
  if not(p_condicao->'valor' @> jsonb_build_array(valor))then return jsonb_build_object('aplica',false);end if;
 end if;
 return jsonb_build_object('aplica',true);
end$$;
create function public.nr_levantamento_diagnostico(p_modelo jsonb,p_respostas jsonb,p_local jsonb)returns jsonb
language plpgsql immutable set search_path=''as $$
declare b jsonb;f jsonb;condicao jsonb;pendencias jsonb:='[]';ignorados jsonb:='[]';idcampo text;ids text[]:='{}';total integer:=0;obrigatorios integer:=0;preenchidos integer:=0;definidos integer:=0;bcodigo text;begin
 if p_modelo is null or jsonb_typeof(p_modelo->'blocos')is distinct from'array'or jsonb_array_length(p_modelo->'blocos')=0 then
  return jsonb_build_object('pode_submeter',false,'modelo_conhecido',false,'campos_aplicaveis',0,'campos_obrigatorios',0,'campos_preenchidos',0,'pendencias',jsonb_build_array(jsonb_build_object('motivo','Modelo sem campos estruturados verificáveis. Fixe um roteiro compatível antes de enviar para revisão; os blocos históricos não serão tratados como campos ausentes.')),'blocos_ignorados','[]'::jsonb);
 end if;
 for b in select value from jsonb_array_elements(p_modelo->'blocos')loop
  bcodigo:=coalesce(b->>'codigo',b->>'id','Bloco sem código');
  if jsonb_typeof(b->'campos')is distinct from'array'then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'motivo','Bloco sem definição verificável de campos.'));continue;end if;
  definidos:=definidos+jsonb_array_length(b->'campos');
  condicao:=public.nr_condicao_levantamento(b->'aplica_se',p_respostas,p_local);
  if condicao->'aplica'='false'::jsonb then ignorados:=ignorados||jsonb_build_array(bcodigo);continue;end if;
  if condicao->'aplica'='null'::jsonb then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'motivo',condicao->>'motivo'));continue;end if;
  for f in select value from jsonb_array_elements(b->'campos')loop
   idcampo:=f->>'id';
   if idcampo is null or length(idcampo)not between 1 and 160 or idcampo=any(ids)then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'motivo','Campo sem identidade única na versão fixada.'));continue;end if;
   ids:=array_append(ids,idcampo);
   if f?'obrigatorio'and jsonb_typeof(f->'obrigatorio')<>'boolean'then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'campo_id',idcampo,'nome',coalesce(f->>'nome',idcampo),'motivo','Defina a obrigatoriedade como verdadeiro/falso na versão do modelo.'));continue;end if;
   condicao:=public.nr_condicao_levantamento(f->'mostrar_se',p_respostas,p_local);
   if condicao->'aplica'='false'::jsonb then continue;end if;
   if condicao->'aplica'='null'::jsonb then
    if f->'obrigatorio'='true'::jsonb then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'campo_id',idcampo,'nome',coalesce(f->>'nome',idcampo),'motivo',condicao->>'motivo'));end if;continue;
   end if;
   total:=total+1;
   if public.nr_valor_preenchido(p_respostas->idcampo)then preenchidos:=preenchidos+1;end if;
   if f->'obrigatorio'='true'::jsonb then
    obrigatorios:=obrigatorios+1;
    if not public.nr_valor_preenchido(p_respostas->idcampo)then pendencias:=pendencias||jsonb_build_array(jsonb_build_object('bloco',bcodigo,'campo_id',idcampo,'nome',coalesce(f->>'nome',idcampo),'motivo','Preencha o campo obrigatório aplicável antes de enviar para revisão.'));end if;
   end if;
  end loop;
 end loop;
 if definidos=0 and jsonb_array_length(pendencias)=0 then pendencias:=jsonb_build_array(jsonb_build_object('motivo','A versão fixada não expõe campos estruturados. Configure/fixe um roteiro; não se presume preenchimento completo.'));end if;
 return jsonb_build_object('pode_submeter',jsonb_array_length(pendencias)=0,'modelo_conhecido',definidos>0,'campos_aplicaveis',total,'campos_obrigatorios',obrigatorios,'campos_preenchidos',preenchidos,'pendencias',pendencias,'blocos_ignorados',ignorados,'natureza','Verificação de preenchimento; não valida conteúdo técnico nem autoriza entrada.');
end$$;
create function public.nr_levantamento_validacao(p_org uuid,p_norma text,p_id uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare l public.nr_levantamentos;m public.nr_modelo_versoes;respostas jsonb;local jsonb;begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_norma is null or p_norma not in('NR33','NR35')then raise exception 'Acesso negado.'using errcode='42501';end if;
 select * into l from public.nr_levantamentos where organization_id=p_org and id=p_id and p_norma=any(normas);
 if not found then raise exception 'Levantamento indisponível.'using errcode='42501';end if;
 select * into m from public.nr_modelo_versoes where organization_id=p_org and modelo_id=l.modelo_id and id=l.modelo_versao_id;
 select coalesce(jsonb_object_agg(campo_id,valor),'{}')into respostas from public.nr_respostas where organization_id=p_org and levantamento_id=p_id;
 select jsonb_build_object('familia',familia,'tipo',tipo)into local from public.nr_locais where organization_id=p_org and cliente_id=l.cliente_id and unidade_id=l.unidade_id and id=l.local_id;
 return public.nr_levantamento_diagnostico(m.dados,respostas,local)||jsonb_build_object('modelo_versao_id',l.modelo_versao_id,'modelo_numero',m.numero,'levantamento_version',l.version);
end$$;
create function public.nr_levantamento_revisao_guard()returns trigger language plpgsql security definer set search_path=''as $$declare m public.nr_modelo_versoes;respostas jsonb;local jsonb;r jsonb;primeira jsonb;begin
 if new.estado='em_revisao'and(old.estado is distinct from new.estado)then
  select * into m from public.nr_modelo_versoes where organization_id=new.organization_id and modelo_id=new.modelo_id and id=new.modelo_versao_id;
  perform 1 from public.nr_respostas where organization_id=new.organization_id and levantamento_id=new.id order by campo_id for share;
  select coalesce(jsonb_object_agg(campo_id,valor),'{}')into respostas from public.nr_respostas where organization_id=new.organization_id and levantamento_id=new.id;
  select jsonb_build_object('familia',familia,'tipo',tipo)into local from public.nr_locais where organization_id=new.organization_id and cliente_id=new.cliente_id and unidade_id=new.unidade_id and id=new.local_id for share;
  r:=public.nr_levantamento_diagnostico(m.dados,respostas,local);
  if r->'pode_submeter'<>'true'::jsonb then primeira:=r->'pendencias'->0;raise exception '% %: %',coalesce(primeira->>'bloco','Roteiro'),coalesce(primeira->>'nome',''),primeira->>'motivo'using errcode='23514',detail=(r->'pendencias')::text,hint='Salve parcialmente, corrija as pendências e envie novamente. A versão histórica do roteiro permanece fixada.';end if;
 end if;return new;
end$$;
create trigger nr_levantamento_revisao before update of estado on public.nr_levantamentos for each row execute function public.nr_levantamento_revisao_guard();
revoke all on function public.nr_valor_preenchido(jsonb),public.nr_condicao_levantamento(jsonb,jsonb,jsonb),public.nr_levantamento_diagnostico(jsonb,jsonb,jsonb),public.nr_levantamento_revisao_guard()from public,anon,authenticated,service_role;
revoke all on function public.nr_levantamento_validacao(uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_levantamento_validacao(uuid,text,uuid)to authenticated;

-- Uma nova associação fixa o corpo atual do roteiro; edições posteriores não reinterpretam levantamentos.
create function public.nr_levantamento_modelo_guard()returns trigger language plpgsql security definer set search_path=''as $$
declare m public.nr_modelos;v public.nr_modelo_versoes;capturar boolean;begin
 if auth.uid()is null then return new;end if;
 if new.modelo_id is null then new.modelo_versao_id:=null;return new;end if;
 capturar:=tg_op='INSERT';if tg_op='UPDATE'then capturar:=old.modelo_id is distinct from new.modelo_id or old.modelo_versao_id is null;end if;
 if capturar then
  select * into m from public.nr_modelos where organization_id=new.organization_id and id=new.modelo_id for update;
  if not found or m.tipo<>'levantamento'or m.arquivado_em is not null or not new.normas<@m.normas or(m.cliente_id is not null and m.cliente_id is distinct from new.cliente_id)or(m.unidade_id is not null and m.unidade_id is distinct from new.unidade_id)then raise exception 'Roteiro indisponível ou incompatível com o levantamento.'using errcode='23514';end if;
  select * into v from public.nr_modelo_versoes where organization_id=new.organization_id and modelo_id=m.id and conteudo=m.conteudo and dados=m.dados order by numero desc limit 1;
  if not found then insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,fonte,sha256)values(new.organization_id,m.id,(select coalesce(max(numero),0)+1 from public.nr_modelo_versoes where organization_id=new.organization_id and modelo_id=m.id),m.conteudo,m.dados,'Snapshot do roteiro efetivamente escolhido; não altera versões de levantamentos existentes.',public.pet_sha256(jsonb_build_object('conteudo',m.conteudo,'dados',m.dados)))returning * into v;end if;
  new.modelo_versao_id:=v.id;
 end if;return new;
end$$;
create trigger nr_levantamento_modelo before insert or update of modelo_id,modelo_versao_id on public.nr_levantamentos for each row execute function public.nr_levantamento_modelo_guard();
revoke all on function public.nr_levantamento_modelo_guard()from public,anon,authenticated,service_role;

-- Valores capturados no servidor; referências por UUID/contexto, sem equivalência por TAG.
create function public.nr_documento_campos_interno(p_org uuid,p_norma text,p_cliente uuid,p_unidade uuid,p_local uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare c jsonb;u jsonb;l jsonb;campos jsonb:='[]';fonte jsonb;k text;r record;v jsonb;begin
 select to_jsonb(x)into c from public.clientes x where organization_id=p_org and id=p_cliente;
 select to_jsonb(x)into u from public.unidades x where organization_id=p_org and cliente_id=p_cliente and id=p_unidade and arquivado_em is null;
 if c is null or u is null then raise exception 'Cliente/unidade indisponível para captura.'using errcode='42501';end if;
 if p_local is not null then select to_jsonb(x)into l from public.nr_locais x where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and id=p_local and p_norma=any(normas)and arquivado_em is null;if l is null then raise exception 'Local indisponível no contexto da captura.'using errcode='42501';end if;end if;
 for r in select * from(values('cliente','razao_social','Razão social do cliente'),('cliente','nome_exibicao','Nome do cliente'),('unidade','nome','Nome da unidade'),('unidade','endereco','Endereço da unidade'),('local','tag','TAG do local'),('local','titulo','Nome do local'),('local','descricao','Descrição do local'),('local','tipo','Classificação do local'),('local','familia','Família do local'))as x(tipo,campo,rotulo)loop
  v:=case r.tipo when'cliente'then c when'unidade'then u else l end;if v is null then continue;end if;
  fonte:=jsonb_build_object('tipo',r.tipo,'id',v->'id','version',v->'version','updated_at',v->'updated_at','sha256',public.pet_sha256(jsonb_build_object('tipo',r.tipo,'id',v->'id','version',v->'version','updated_at',v->'updated_at','valor',v->r.campo,'chave',r.tipo||'.'||r.campo)));
  campos:=campos||jsonb_build_array(jsonb_build_object('chave',r.tipo||'.'||r.campo,'rotulo',r.rotulo,'valor',v->r.campo,'fonte',fonte));
 end loop;
 return jsonb_build_object('campos',campos,'contexto',jsonb_build_object('cliente_id',p_cliente,'unidade_id',p_unidade,'local_id',p_local,'atualizacao_automatica',false));
end$$;
create function public.nr_documento_campos(p_org uuid,p_norma text,p_cliente uuid,p_unidade uuid,p_local uuid default null)returns jsonb
language plpgsql stable security definer set search_path=''as $$begin
 if not coalesce(public.pode(p_org,'ver_nr'),false)or p_norma is null or p_norma not in('NR33','NR35')then raise exception 'Acesso negado.'using errcode='42501';end if;
 return public.nr_documento_campos_interno(p_org,p_norma,p_cliente,p_unidade,p_local);
end$$;
create function public.nr_documento_campos_guard()returns trigger language plpgsql security definer set search_path=''as $$
declare d public.nr_documentos;b jsonb;anterior jsonb;anteriores jsonb;blocos jsonb:='[]';base jsonb;campo jsonb;chave text;modo text;norma_base text;begin
 if tg_op='UPDATE'and new.conteudo is not distinct from old.conteudo then return new;end if;
 if tg_op='UPDATE'then anteriores:=old.conteudo->'blocos';elsif new.substitui_id is not null then select conteudo->'blocos'into anteriores from public.nr_documento_revisoes where organization_id=new.organization_id and documento_id=new.documento_id and id=new.substitui_id;end if;
 select * into d from public.nr_documentos where organization_id=new.organization_id and id=new.documento_id;
 if not found then raise exception 'Documento indisponível para captura de campos.'using errcode='23514';end if;
 for b in select value from jsonb_array_elements(new.conteudo->'blocos')loop
  if b->>'tipo'<>'campo'then blocos:=blocos||jsonb_build_array(b);continue;end if;
  select value into anterior from jsonb_array_elements(coalesce(anteriores,'[]'))where value->>'id'=b->>'id';
  if b is not distinct from anterior then blocos:=blocos||jsonb_build_array(b);continue;end if;
  chave:=b->>'chave';modo:=coalesce(b->>'modo','snapshot');
  if anterior->>'modo'='vinculado'and modo<>'vinculado'then
   if modo<>'livre'or length(trim(coalesce(b->>'motivo_substituicao','')))<3 then raise exception 'Substituição de campo vinculado exige modo livre e motivo registrado.'using errcode='23514';end if;
   b:=jsonb_set(b,'{fonte_snapshot}',coalesce(anterior->'fonte_snapshot','null'));
  end if;
  if modo='vinculado'and chave not in('local.tag','local.titulo','local.descricao','local.tipo','local.familia')then raise exception 'Vínculo dinâmico disponível apenas para campos permitidos do local; outros valores são snapshots ou texto livre.'using errcode='23514';end if;
  if modo in('vinculado','snapshot')and chave in('cliente.razao_social','cliente.nome_exibicao','unidade.nome','unidade.endereco','local.tag','local.titulo','local.descricao','local.tipo','local.familia')then
   if base is null then
    norma_base:=d.normas[1];if d.local_id is not null then select n into norma_base from unnest(d.normas)n join public.nr_locais l on l.organization_id=d.organization_id and l.id=d.local_id and n=any(l.normas)limit 1;end if;
    base:=public.nr_documento_campos_interno(d.organization_id,norma_base,d.cliente_id,d.unidade_id,d.local_id);
   end if;
   select value into campo from jsonb_array_elements(base->'campos')where value->>'chave'=chave;
   if campo is null then raise exception 'Vincule um local do mesmo contexto antes de capturar o campo %.',chave using errcode='23514';end if;
   if b?'fonte_snapshot'and b->'fonte_snapshot'<>'null'::jsonb and b->'fonte_snapshot' is distinct from campo->'fonte'then raise exception 'A base do campo % mudou. Capture novamente e compare antes de salvar.',chave using errcode='40001';end if;
   b:=b||jsonb_build_object('valor_snapshot',campo->'valor','fonte_snapshot',campo->'fonte');
  end if;
  blocos:=blocos||jsonb_build_array(b);
 end loop;
 new.conteudo:=jsonb_set(new.conteudo,'{blocos}',blocos);return new;
end$$;
create trigger nr_documento_campos before insert or update of conteudo on public.nr_documento_revisoes for each row execute function public.nr_documento_campos_guard();
create function public.nr_documento_local_campos_guard()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.local_id is distinct from old.local_id and exists(select 1 from public.nr_documento_revisoes r,jsonb_array_elements(r.conteudo->'blocos')b where r.organization_id=old.organization_id and r.id=old.revisao_atual_id and b->>'tipo'='campo'and b->>'modo'='vinculado')then raise exception 'O documento possui campos vinculados ao local. Registre substituição manual justificada antes de alterar o vínculo, ou crie outro documento para o novo local.'using errcode='23514';end if;return new;
end$$;
create trigger nr_documento_local_campos before update of local_id on public.nr_documentos for each row execute function public.nr_documento_local_campos_guard();
revoke all on function public.nr_documento_campos_interno(uuid,text,uuid,uuid,uuid),public.nr_documento_campos_guard(),public.nr_documento_local_campos_guard()from public,anon,authenticated,service_role;
revoke all on function public.nr_documento_campos(uuid,text,uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_documento_campos(uuid,text,uuid,uuid,uuid)to authenticated;

create table public.nr_documento_modelos(
 organization_id uuid not null,documento_id uuid not null,revisao_id uuid not null,modelo_id uuid not null,modelo_versao_id uuid not null,
 modelo_version_capturada integer not null,modelo_estado_capturado text not null,modelo_snapshot jsonb not null,conteudo_modelo_sha256 text not null,rascunho_reconhecido boolean not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,documento_id,revisao_id),
 foreign key(organization_id,documento_id,revisao_id)references public.nr_documento_revisoes(organization_id,documento_id,id),
 foreign key(organization_id,modelo_id,modelo_versao_id)references public.nr_modelo_versoes(organization_id,modelo_id,id)
);
alter table public.nr_documento_modelos enable row level security;
revoke all on public.nr_documento_modelos from public,anon,authenticated,service_role;
grant select on public.nr_documento_modelos to authenticated;
create policy nr_documento_modelos_ler on public.nr_documento_modelos for select to authenticated using(public.pode(organization_id,'ver_nr'));
create trigger nr_documento_modelos_imutavel before update or delete on public.nr_documento_modelos for each row execute function public.pet_imutavel();
create function public.nr_documento_de_modelo(p_org uuid,p_norma text,p_chave uuid,p_dados jsonb)returns jsonb
language plpgsql security definer set search_path=''as $$
declare m public.nr_modelos;v public.nr_modelo_versoes;r jsonb;pedido jsonb;dados jsonb;conteudo jsonb;blocos jsonb:='[]';b jsonb;novo uuid;revisao uuid;cliente uuid;unidade uuid;local uuid;pasta uuid;normas text[];publicado boolean;captura_modelo jsonb;begin
 if p_norma is null or p_norma not in('NR33','NR35')or p_chave is null or jsonb_typeof(p_dados)is distinct from'object'or octet_length(p_dados::text)>50000 then raise exception 'Pedido de documento/modelo inválido.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not coalesce(public.pode(p_org,'ver_nr')and public.pode(p_org,'cadastrar_nr'),false)then raise exception 'Sem permissão para criar documento.'using errcode='42501';end if;
 perform public.ag_payload(p_dados,array['cliente_id','unidade_id','local_id','pasta_id','titulo','descricao','tipo','normas','modelo_id','modelo_versao_id','modelo_expected_version','usar_rascunho']);
 pedido:=jsonb_build_object('norma',p_norma,'dados',p_dados);
 r:=public.operacao_repetir(p_org,p_chave,'nr_documento_de_modelo',pedido);
 if r is not null then return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'documentos',jsonb_build_object('id',r->>'documento_id')));end if;
 if length(trim(coalesce(p_dados->>'titulo','')))not between 2 and 240 or length(coalesce(p_dados->>'descricao',''))>20000 or length(coalesce(p_dados->>'tipo',''))>100 or nullif(p_dados->>'modelo_expected_version','')is null then raise exception 'Informe título e versão esperada do modelo.'using errcode='23514';end if;
 cliente:=(p_dados->>'cliente_id')::uuid;unidade:=(p_dados->>'unidade_id')::uuid;local:=nullif(p_dados->>'local_id','')::uuid;pasta:=nullif(p_dados->>'pasta_id','')::uuid;
 select x.* into m from public.nr_modelos x where x.organization_id=p_org and x.id=(p_dados->>'modelo_id')::uuid and p_norma=any(x.normas)for update;
 if not found or m.tipo<>'documento'or m.arquivado_em is not null or(m.cliente_id is not null and m.cliente_id is distinct from cliente)or(m.unidade_id is not null and m.unidade_id is distinct from unidade)then raise exception 'Modelo indisponível ou incompatível com cliente/unidade/norma.'using errcode='42501';end if;
 perform public.nr_documento_campos_interno(p_org,p_norma,cliente,unidade,local);
 if pasta is not null and not exists(select 1 from public.nr_pastas x where x.organization_id=p_org and x.cliente_id=cliente and x.unidade_id=unidade and x.id=pasta and p_norma=any(x.normas)and x.arquivado_em is null)then raise exception 'Pasta indisponível no contexto do documento.'using errcode='42501';end if;
 if m.version is distinct from(p_dados->>'modelo_expected_version')::integer then raise exception 'Modelo alterado. Consulte e compare a versão antes de criar o documento.'using errcode='40001';end if;
 if p_dados?'normas'then
  if jsonb_typeof(p_dados->'normas')is distinct from'array'then raise exception 'Normas inválidas.'using errcode='23514';end if;normas:=array(select jsonb_array_elements_text(p_dados->'normas'));
 else normas:=array[p_norma];end if;
 if cardinality(normas)not between 1 and 2 or not p_norma=any(normas)or not normas<@m.normas or(cardinality(normas)=2 and normas[1]=normas[2])then raise exception 'Normas do documento devem caber no escopo do modelo.'using errcode='23514';end if;
 if nullif(p_dados->>'modelo_versao_id','')is not null then
  select * into v from public.nr_modelo_versoes where organization_id=p_org and modelo_id=m.id and id=(p_dados->>'modelo_versao_id')::uuid;
  if not found then raise exception 'Versão do modelo indisponível.'using errcode='42501';end if;
 else
  select x.* into v from public.nr_modelo_versoes x where x.organization_id=p_org and x.modelo_id=m.id and x.conteudo=m.conteudo and x.dados=m.dados order by x.numero desc limit 1;
  if not found then insert into public.nr_modelo_versoes(organization_id,modelo_id,numero,conteudo,dados,fonte,sha256)values(p_org,m.id,(select coalesce(max(numero),0)+1 from public.nr_modelo_versoes where organization_id=p_org and modelo_id=m.id),m.conteudo,m.dados,'Snapshot explícito para criação de documento; não equivale a publicação ou aprovação.',public.pet_sha256(jsonb_build_object('conteudo',m.conteudo,'dados',m.dados)))returning * into v;end if;
 end if;
 publicado:=m.estado='publicado'and v.conteudo=m.conteudo and v.dados=m.dados and v.numero=(select max(numero)from public.nr_modelo_versoes where organization_id=p_org and modelo_id=m.id);
 if not publicado and p_dados->'usar_rascunho'is distinct from'true'::jsonb then raise exception 'A versão selecionada não comprova publicação vigente. Reconheça explicitamente o uso de rascunho/versão histórica; o documento será criado sem aprovação.'using errcode='23514';end if;
 -- Modelos descrevem campos; os valores da base são capturados para o contexto de destino.
 for b in select value from jsonb_array_elements(v.conteudo->'blocos')loop
  if b->>'tipo'='campo'then b:=b-'fonte_snapshot';end if;blocos:=blocos||jsonb_build_array(b);
 end loop;
 conteudo:=jsonb_set(v.conteudo,'{blocos}',blocos);
 captura_modelo:=jsonb_build_object('id',m.id,'titulo',m.titulo,'tipo',m.tipo,'normas',m.normas,'cliente_id',m.cliente_id,'unidade_id',m.unidade_id,'version',m.version,'estado_capturado',m.estado,'versao_id',v.id,'numero',v.numero,'sha256',v.sha256,'publicacao_vigente',publicado,'herda_aprovacao',false);
 dados:=jsonb_build_object('titulo',p_dados->>'titulo','descricao',coalesce(p_dados->>'descricao',m.descricao),'tipo',coalesce(nullif(p_dados->>'tipo',''),nullif(m.dados->>'tipo_documento',''),'documento'),'cliente_id',cliente,'unidade_id',unidade,'local_id',local,'pasta_id',pasta,'normas',normas,'conteudo',conteudo,'dados',jsonb_build_object('modelo_origem',captura_modelo,'origem_criacao','modelo_versionado','aprovacao_herdada',false));
 r:=public.nr_executar(p_org,p_norma,'documentos','salvar',null,null,p_chave::text||':de-modelo',dados);novo:=(r->>'id')::uuid;revisao:=(r->>'revisao_atual_id')::uuid;
 update public.nr_documento_revisoes set snapshot=jsonb_build_object('modelo_origem',captura_modelo,'contexto',jsonb_build_object('cliente_id',cliente,'unidade_id',unidade,'local_id',local),'conteudo_modelo_sha256',public.pet_sha256(v.conteudo),'sem_aprovacao_herdada',true)where organization_id=p_org and documento_id=novo and id=revisao;
 insert into public.nr_documento_modelos(organization_id,documento_id,revisao_id,modelo_id,modelo_versao_id,modelo_version_capturada,modelo_estado_capturado,modelo_snapshot,conteudo_modelo_sha256,rascunho_reconhecido,created_by)values(p_org,novo,revisao,m.id,v.id,m.version,m.estado,captura_modelo,public.pet_sha256(v.conteudo),not publicado,auth.uid());
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,motivo,autor)values(p_org,'documentos',novo,'criar_de_modelo',jsonb_build_object('modelo_origem',captura_modelo,'revisao_id',revisao),'Documento em rascunho derivado de versão explícita de modelo; sem aprovação, emissão ou assinatura herdada.',auth.uid());
 perform public.operacao_concluir(p_org,p_chave,'nr_documento_de_modelo',pedido,jsonb_build_object('documento_id',novo,'revisao_id',revisao));
 return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'documentos',jsonb_build_object('id',novo)));
end$$;
revoke all on function public.nr_documento_de_modelo(uuid,text,uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.nr_documento_de_modelo(uuid,text,uuid,jsonb)to authenticated;

alter table public.nr_pastas add column ordem integer not null default 0 check(ordem between 0 and 10000000);
create index nr_pasta_ordenacao on public.nr_pastas(organization_id,cliente_id,unidade_id,parent_id,ordem,titulo,id)where arquivado_em is null;
create function public.nr_pasta_ordenar(p_org uuid,p_norma text,p_id uuid,p_expected_version integer,p_direcao text,p_chave uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare p public.nr_pastas;q record;ids uuid[]:='{}';pos integer;outra integer;n integer;temporario uuid;antes jsonb;pedido jsonb;r jsonb;alteracoes jsonb:='[]';begin
 if p_norma is null or p_norma not in('NR33','NR35')or p_id is null or p_chave is null or p_expected_version is null or p_direcao is null or p_direcao not in('subir','descer')then raise exception 'Ordenação inválida.'using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not coalesce(public.pode(p_org,'ver_nr')and public.pode(p_org,'editar_nr')and public.pode(p_org,'mover_nr'),false)then raise exception 'Sem permissão para ordenar pastas.'using errcode='42501';end if;
 pedido:=jsonb_build_object('norma',p_norma,'id',p_id,'expected_version',p_expected_version,'direcao',p_direcao);
 r:=public.operacao_repetir(p_org,p_chave,'nr_pasta_ordenar',pedido);if r is not null then return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'pastas',jsonb_build_object('id',p_id)));end if;
 select * into p from public.nr_pastas where organization_id=p_org and id=p_id and p_norma=any(normas)and arquivado_em is null;
 if not found then raise exception 'Pasta indisponível.'using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr-pastas:'||p_org::text||':'||p.unidade_id::text,0));
 for q in select id,ordem,version from public.nr_pastas where organization_id=p_org and cliente_id=p.cliente_id and unidade_id=p.unidade_id and parent_id is not distinct from p.parent_id and arquivado_em is null order by ordem,titulo,id for update loop ids:=array_append(ids,q.id);end loop;
 select * into p from public.nr_pastas where organization_id=p_org and id=p_id;
 if p.version is distinct from p_expected_version then raise exception 'A pasta mudou. Recarregue a ordem antes de mover.'using errcode='40001';end if;
 pos:=array_position(ids,p_id);outra:=pos+case p_direcao when'subir'then -1 else 1 end;
 if outra not between 1 and cardinality(ids)then raise exception 'A pasta já está no limite da lista.'using errcode='23514';end if;
 antes:=to_jsonb(p);temporario:=ids[pos];ids[pos]:=ids[outra];ids[outra]:=temporario;
 for n in 1..cardinality(ids)loop
  update public.nr_pastas set ordem=n*10 where organization_id=p_org and id=ids[n]and ordem<>n*10;
  alteracoes:=alteracoes||jsonb_build_array(jsonb_build_object('id',ids[n],'ordem',n*10));
 end loop;
 insert into public.nr_historico(organization_id,recurso,registro_id,comando,antes,depois,motivo,autor)values(p_org,'pastas',p_id,'ordenar',antes,jsonb_build_object('irmas',alteracoes,'direcao',p_direcao),'Ordem explícita de pastas; identidades, pais, caminhos originais e arquivos preservados.',auth.uid());
 perform public.operacao_concluir(p_org,p_chave,'nr_pasta_ordenar',pedido,jsonb_build_object('id',p_id));
 return jsonb_build_object('registro',public.nr_consultar(p_org,p_norma,'pastas',jsonb_build_object('id',p_id)));
end$$;
revoke all on function public.nr_pasta_ordenar(uuid,text,uuid,integer,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.nr_pasta_ordenar(uuid,text,uuid,integer,text,uuid)to authenticated;

-- Mesmo contrato64; somente a listagem de pastas passa a usar a ordem explícita.
create or replace function public.nr_consultar(p_org uuid,p_norma text,p_recurso text,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tabela text;linhas jsonb;total bigint;pagina integer:=coalesce((p_filtros->>'pagina')::integer,0);limite integer:=coalesce((p_filtros->>'limite')::integer,25);rid uuid:=nullif(p_filtros->>'id','')::uuid;cliente uuid:=nullif(p_filtros->>'cliente_id','')::uuid;unidade uuid:=nullif(p_filtros->>'unidade_id','')::uuid;busca text:=coalesce(p_filtros->>'busca','');situacao text:=nullif(p_filtros->>'estado','');lixeira boolean:=coalesce((p_filtros->>'lixeira')::boolean,false);r jsonb;extras text:='';begin
 if p_norma is null or p_norma not in('NR33','NR35') or not public.pode(p_org,'ver_nr') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pagina<0 or limite not between 1 and 100 or length(busca)>300 or jsonb_typeof(p_filtros)<>'object' then raise exception 'Filtros inválidos.' using errcode='23514';end if;
 if p_recurso='contexto' then return jsonb_build_object(
  'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'razao_social',c.razao_social,'nome_exibicao',c.nome_exibicao) order by c.razao_social),'[]') from public.clientes c where c.organization_id=p_org),
  'unidades',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'cliente_id',u.cliente_id,'nome',u.nome) order by u.nome),'[]') from public.unidades u where u.organization_id=p_org),
  'permissoes',jsonb_build_object('visualizar',true,'cadastrar',public.pode(p_org,'cadastrar_nr'),'editar',public.pode(p_org,'editar_nr'),'anexar',public.pode(p_org,'anexar_nr'),'mover',public.pode(p_org,'mover_nr'),'arquivar',public.pode(p_org,'arquivar_nr'),'restaurar',public.pode(p_org,'restaurar_nr'),'revisar',public.pode(p_org,'revisar_nr'),'aprovar',false,'emitir',false,'configurar',public.pode(p_org,'configurar_nr')));end if;
 if p_recurso='painel' then return jsonb_build_object(
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
  return r;
 end if;
 if p_filtros?'pasta_id' and p_recurso in('pastas','documentos') then extras:=extras||format(' and to_jsonb(t)->>%L is not distinct from %L',case p_recurso when 'pastas' then 'parent_id' else 'pasta_id' end,nullif(p_filtros->>'pasta_id','')::uuid::text);end if;
 if p_filtros?'local_id' then extras:=extras||format(' and to_jsonb(t)->>''local_id''=%L',(p_filtros->>'local_id')::uuid::text);end if;
 if nullif(p_filtros->>'tipo','') is not null then extras:=extras||format(' and to_jsonb(t)->>''tipo''=%L',p_filtros->>'tipo');end if;
 execute format('select count(*) from public.%I t where organization_id=$1 and $2=any(normas) and ($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s',tabela,extras) into total using p_org,p_norma,cliente,unidade,busca,situacao,lixeira;
 execute format('select coalesce(jsonb_agg((to_jsonb(q)-array[''dados'',''conteudo''])||jsonb_build_object(''dados'',''{}''::jsonb)),''[]'') from(select t.* from public.%I t where organization_id=$1 and $2=any(normas) and($3 is null or coalesce(cliente_id,$3)=$3) and($4 is null or coalesce(unidade_id,$4)=$4) and($5='''' or titulo ilike ''%%''||$5||''%%'' or descricao ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''tag'' ilike ''%%''||$5||''%%'' or to_jsonb(t)->>''aliases'' ilike ''%%''||$5||''%%'') and($6 is null or estado=$6) and((arquivado_em is not null)=$7)%s order by %s offset $8 limit $9)q',tabela,extras,case when p_recurso='pastas'then 'ordem,titulo,id'else 'updated_at desc,id'end) into linhas using p_org,p_norma,cliente,unidade,busca,situacao,lixeira,pagina*limite,limite;
 if p_recurso='documentos' then
  with selecionados as(select e.value registro,(e.value->>'id')::uuid id,e.ordinality pos from jsonb_array_elements(linhas) with ordinality e),
  pendentes as(select i.documento_id,count(*)::integer quantidade from public.nr_documento_impactos i join selecionados s on s.id=i.documento_id where i.organization_id=p_org and not exists(select 1 from public.nr_documento_impacto_revisoes c where c.organization_id=i.organization_id and c.impacto_id=i.id)group by i.documento_id)
  select coalesce(jsonb_agg(s.registro||jsonb_build_object('revisao_necessaria',coalesce(p.quantidade,0)>0,'impactos_pendentes',coalesce(p.quantidade,0)) order by s.pos),'[]') into linhas from selecionados s left join pendentes p on p.documento_id=s.id;
 end if;
 return jsonb_build_object('rows',linhas,'total',total,'pagina',pagina,'limite',limite);
end$$;
