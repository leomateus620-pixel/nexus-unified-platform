-- Checkpoints comerciais: aditivo. Nenhum log ou documento legado é reescrito.
create table public.proposta_checkpoints (
 revisao_id uuid primary key references public.proposta_revisoes(id),
 organization_id uuid not null references public.organizations(id),
 versao bigint not null default 0, versao_salva bigint not null default 0,
 snapshot jsonb not null, total_salvo numeric, atualizado_em timestamptz not null default now()
);
create table public.proposta_rascunho_autores (
 id bigint generated always as identity primary key,
 revisao_id uuid not null references public.proposta_revisoes(id),
 versao bigint not null, objeto text not null, campo text not null,
 autor uuid, autor_nome text, created_at timestamptz not null default now()
);
create table public.proposta_salvamentos (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 proposta_id uuid not null references public.propostas(id), revisao_id uuid not null references public.proposta_revisoes(id),
 autor uuid not null, autor_nome text not null, created_at timestamptz not null default now(),
 versao_origem bigint not null, versao_destino bigint not null,
 objetos integer not null, campos integer not null, diferencas jsonb not null,
 calculo_id uuid references public.calculo_execucoes(id), impacto jsonb
);
create table public.proposta_operacoes (
 id uuid primary key, revisao_id uuid not null references public.proposta_revisoes(id),
 autor uuid not null, resposta jsonb not null, created_at timestamptz not null default now()
);
alter table public.proposta_checkpoints enable row level security;
alter table public.proposta_rascunho_autores enable row level security;
alter table public.proposta_salvamentos enable row level security;
alter table public.proposta_operacoes enable row level security;
revoke all on public.proposta_checkpoints, public.proposta_rascunho_autores, public.proposta_salvamentos, public.proposta_operacoes from anon, authenticated;
grant select on public.proposta_salvamentos to authenticated;
-- Counts, impacts and diffs have the same cost permission as the source revision.
create policy ler_salvamentos on public.proposta_salvamentos for select to authenticated
 using (is_member(organization_id) and pode(organization_id,'ver_custos'));
create trigger salvamento_imutavel before update or delete on public.proposta_salvamentos for each row execute function public.bloquear_alteracao();
create trigger operacao_imutavel before update or delete on public.proposta_operacoes for each row execute function public.bloquear_alteracao();

-- Whitelist of MANUAL inputs. Derived values, timestamps, generated IDs, reasons and labels do not inflate counts.
create or replace function public.objeto_rascunho(_t text, _r jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare k text; v jsonb;
begin
 if _r is null then return '{}'::jsonb; end if;
 if _t='proposta_revisoes' then
  return jsonb_build_object('parametros',jsonb_build_object('nome','Parâmetros','campos',_r->'parametros'),
                           'textos',jsonb_build_object('nome','Textos do documento','campos',_r->'textos'));
 elsif _t='sistemas_dimensionados' then
  k:='sistema:'||(_r->>'id');
  v:=jsonb_build_object('nome',coalesce(nullif(_r->>'identificacao',''),'Sistema '||(_r->>'ordem')),'campos',jsonb_build_object(
    'identificacao',_r->'identificacao','tipo',_r->'tipo','metragem',_r->'metragem','trechos',_r->'trechos'));
 elsif _t='revisao_componentes' then
  k:='componente:'||(_r->>'id');
  v:=jsonb_build_object('nome',(_r->>'codigo')||' · '||(_r->>'descricao'),'justificativa',_r->'justificativa','rotulos',jsonb_build_object('fornecedor_id',_r->'fornecedor_nome'),'campos',jsonb_build_object(
    'modalidade',_r->'modalidade','fornecedor_id',_r->'fornecedor_id','custo_adotado',_r->'custo_adotado'));
 elsif _t='sistema_componentes' then
  if _r->>'override_quantidade' is null then return '{}'::jsonb; end if;
  k:='override:'||(_r->>'sistema_id')||':'||(_r->>'revisao_componente_id');
  v:=jsonb_build_object('nome','Ajuste de composição','justificativa',_r->'override_justificativa','campos',jsonb_build_object('override_quantidade',_r->'override_quantidade'));
 else return '{}'::jsonb;
 end if;
 return jsonb_build_object(k,v);
end $$;
create or replace function public.snapshot_rascunho(_rev uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from (
  select objeto_rascunho('proposta_revisoes',to_jsonb(r)) v from proposta_revisoes r where id=_rev
  union all select objeto_rascunho('sistemas_dimensionados',to_jsonb(s)) from sistemas_dimensionados s where revisao_id=_rev
  union all select objeto_rascunho('revisao_componentes',to_jsonb(c)||jsonb_build_object('fornecedor_nome',f.nome)) from revisao_componentes c left join fornecedores f on f.id=c.fornecedor_id where c.revisao_id=_rev
  union all select objeto_rascunho('sistema_componentes',to_jsonb(i)) from sistema_componentes i where revisao_id=_rev
 ) x cross join lateral jsonb_each(x.v) e
$$;
create or replace function public.diferencas_rascunho(_a jsonb,_b jsonb) returns table(objeto text,campo text,antes jsonb,depois jsonb,nome text,justificativa text)
 language sql immutable set search_path=public as $$
 with objetos as (select jsonb_object_keys(_a) k union select jsonb_object_keys(_b)),
 campos as (select k,f from objetos cross join lateral (select jsonb_object_keys(coalesce(_a->k->'campos','{}')) f union select jsonb_object_keys(coalesce(_b->k->'campos','{}'))) fs)
 select k,f,coalesce(_a->k->'campos'->f,'null'),coalesce(_b->k->'campos'->f,'null'),coalesce(_b->k->>'nome',_a->k->>'nome'),coalesce(_b->k->>'justificativa',_a->k->>'justificativa')
 from campos where coalesce(_a->k->'campos'->f,'null') is distinct from coalesce(_b->k->'campos'->f,'null')
$$;
create or replace function public.rastrear_rascunho() returns trigger language plpgsql security definer set search_path=public as $$
declare r uuid; org uuid; a jsonb; b jsonb; vers bigint; email text;
begin
 a:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 b:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 r:=case when tg_table_name='proposta_revisoes' then (coalesce(b,a)->>'id')::uuid else (coalesce(b,a)->>'revisao_id')::uuid end;
 if tg_table_name='sistema_componentes' and tg_op<>'UPDATE' then return coalesce(new,old); end if;
 a:=objeto_rascunho(tg_table_name,a); b:=objeto_rascunho(tg_table_name,b);
 if not exists(select 1 from diferencas_rascunho(a,b)) then return coalesce(new,old); end if;
 select organization_id into org from proposta_revisoes where id=r for update;
 if not found then return coalesce(new,old); end if;
 insert into proposta_checkpoints(revisao_id,organization_id,snapshot,total_salvo)
 select id,organization_id,snapshot_rascunho(id),(totais->'totais'->>'final')::numeric from proposta_revisoes where id=r on conflict do nothing;
 update proposta_checkpoints set versao=versao+1, atualizado_em=now() where revisao_id=r returning versao into vers;
 if tg_table_name<>'proposta_revisoes' then
  update proposta_revisoes set desatualizada=true where id=r;
 end if;
 select u.email into email from auth.users u where id=auth.uid();
 insert into proposta_rascunho_autores(revisao_id,versao,objeto,campo,autor,autor_nome)
 select r,vers,objeto,campo,auth.uid(),email from diferencas_rascunho(a,b);
 return coalesce(new,old);
end $$;
create trigger rastrear_entradas before update on public.proposta_revisoes for each row execute function public.rastrear_rascunho();
create trigger rastrear_sistemas before insert or update or delete on public.sistemas_dimensionados for each row execute function public.rastrear_rascunho();
create trigger rastrear_componentes before insert or update or delete on public.revisao_componentes for each row execute function public.rastrear_rascunho();
create trigger rastrear_overrides before update on public.sistema_componentes for each row execute function public.rastrear_rascunho();
-- Baseline for existing data: no inferred legacy authors or fabricated prior diffs.
insert into proposta_checkpoints(revisao_id,organization_id,snapshot,total_salvo) select id,organization_id,snapshot_rascunho(id),(totais->'totais'->>'final')::numeric from proposta_revisoes;

create or replace function public.capturar_revisao(_rev uuid,_operacao uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r proposta_revisoes; h proposta_checkpoints; snap jsonb; op proposta_operacoes;
begin
 select * into r from proposta_revisoes where id=_rev for update;
 if not found or auth.uid() is null or not is_member(r.organization_id) or not pode(r.organization_id,'editar_revisao') then raise exception 'Acesso negado'; end if;
 if _operacao is not null then
  select * into op from proposta_operacoes where id=_operacao;
  if found then
   if op.autor<>auth.uid() or op.revisao_id<>_rev then raise exception 'Chave de operação pertence a outro contexto'; end if;
   return jsonb_build_object('confirmacao',op.resposta);
  end if;
 end if;
 if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
 snap:=snapshot_rascunho(_rev);
 insert into proposta_checkpoints(revisao_id,organization_id,snapshot) values(_rev,r.organization_id,snap) on conflict do nothing;
 select * into h from proposta_checkpoints where revisao_id=_rev;
 return jsonb_build_object('revisao',to_jsonb(r),'versao',h.versao,'versao_salva',h.versao_salva,'snapshot',snap,
 'alterado',exists(select 1 from diferencas_rascunho(h.snapshot,snap)),
 'sistemas',coalesce((select jsonb_agg(to_jsonb(s) order by ordem) from sistemas_dimensionados s where revisao_id=_rev),'[]'),
 'componentes',coalesce((select jsonb_agg(to_jsonb(c) order by codigo) from revisao_componentes c where revisao_id=_rev),'[]'),
 'overrides',coalesce((select jsonb_agg(to_jsonb(i)) from sistema_componentes i where revisao_id=_rev and override_quantidade is not null),'[]'));
end $$;

-- One transaction owns derived composition, calculation record, immutable save event AND checkpoint.
-- Manual before/after are read and compared here, never accepted as browser audit payloads.
create or replace function public.diferencas_comerciais(_rev uuid,_a jsonb,_b jsonb)
 returns table(objeto text,campo text,antes jsonb,depois jsonb,nome text,justificativa text)
 language sql stable security definer set search_path=public as $$
 select d.* from diferencas_rascunho(_a,_b) d
 where not (d.objeto like 'override:%' and not (_b ? d.objeto) and not exists(
   select 1 from sistema_componentes i where i.revisao_id=_rev
     and 'override:'||i.sistema_id::text||':'||i.revisao_componente_id::text=d.objeto))
$$;
revoke execute on function public.diferencas_comerciais(uuid,jsonb,jsonb) from public,anon,authenticated;
create or replace function public.concluir_revisao(_rev uuid,_versao bigint,_versao_salva bigint,_snapshot jsonb,_calculo jsonb,_operacao uuid default null)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare r proposta_revisoes; h proposta_checkpoints; op proposta_operacoes; snap jsonb; diffs jsonb; calc_id uuid; resp jsonb; nobj int; nfields int; email text;
begin
 select * into r from proposta_revisoes where id=_rev for update;
 if not found or auth.uid() is null or not is_member(r.organization_id) or not pode(r.organization_id,'editar_revisao') then raise exception 'Acesso negado'; end if;
 if _operacao is not null then
  select * into op from proposta_operacoes where id=_operacao;
  if found then
   if op.autor<>auth.uid() or op.revisao_id<>_rev then raise exception 'Chave de operação pertence a outro contexto'; end if;
   return op.resposta;
  end if;
 end if;
 if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
 select * into h from proposta_checkpoints where revisao_id=_rev for update;
 snap:=snapshot_rascunho(_rev);
 if h.revisao_id is null or h.versao<>_versao or h.versao_salva<>_versao_salva or snap is distinct from _snapshot then
  raise exception 'Conflito: o rascunho mudou durante o salvamento. Rascunho preservado; confira e salve novamente.' using errcode='40001';
 end if;
 select count(*),count(distinct objeto) into nfields,nobj from diferencas_comerciais(_rev,h.snapshot,snap);
 if _operacao is not null and nfields=0 then
  resp:=jsonb_build_object('id',_operacao,'evento',false,'objetos',0,'campos',0,'versao',h.versao,'mensagem','Nenhuma alteração para salvar');
  insert into proposta_operacoes(id,revisao_id,autor,resposta) values(_operacao,_rev,auth.uid(),resp);
  return resp;
 end if;
 if _operacao is not null and exists(select 1 from sistemas_dimensionados where revisao_id=_rev and (trim(identificacao)='' or metragem<=0 or trechos<1)) then raise exception 'Sistema inválido: revise identificação, metragem e trechos'; end if;
 if _calculo is null or coalesce(jsonb_typeof(_calculo->'itens'),'null')<>'array' or _calculo->'resumo' is null then raise exception 'Cálculo ausente ou inválido; salvamento não consolidado'; end if;
 if _operacao is not null then
  select coalesce(u.email,auth.uid()::text) into email from auth.users u where u.id=auth.uid();
  select jsonb_agg(to_jsonb(d)||jsonb_build_object('antes_rotulo',h.snapshot->d.objeto->'rotulos'->d.campo,'depois_rotulo',snap->d.objeto->'rotulos'->d.campo,'autores',coalesce((
    select jsonb_agg(a) from (select distinct autor,autor_nome from proposta_rascunho_autores
      where revisao_id=_rev and versao>h.versao_salva and versao<=h.versao and objeto=d.objeto and campo=d.campo) a),'[]'::jsonb)))
    into diffs from diferencas_comerciais(_rev,h.snapshot,snap) d;
 end if;
 -- Composition writes preserve stable logical identities and existing override reasons.
 delete from sistema_componentes i where revisao_id=_rev and not exists(
  select 1 from jsonb_array_elements(_calculo->'itens') x where (x->>'sistema_id')::uuid=i.sistema_id and (x->>'componente_id')::uuid=i.revisao_componente_id);
 insert into sistema_componentes(organization_id,revisao_id,sistema_id,revisao_componente_id,regra_chave,quantidade_tecnica,quantidade,override_quantidade,override_justificativa,memoria)
 select r.organization_id,_rev,(x->>'sistema_id')::uuid,(x->>'componente_id')::uuid,x->>'chave',(x->>'quantidade_tecnica')::numeric,(x->>'quantidade')::numeric,
 (snap->('override:'||(x->>'sistema_id')||':'||(x->>'componente_id'))->'campos'->>'override_quantidade')::numeric,
 snap->('override:'||(x->>'sistema_id')||':'||(x->>'componente_id'))->>'justificativa',x->>'memoria'
 from jsonb_array_elements(_calculo->'itens') x
 on conflict(sistema_id,revisao_componente_id) do update set regra_chave=excluded.regra_chave,quantidade_tecnica=excluded.quantidade_tecnica,quantidade=excluded.quantidade,memoria=excluded.memoria;
 insert into calculo_execucoes(organization_id,revisao_id,motor_versao,regras_id,entradas,resultado,created_by)
 values(r.organization_id,_rev,_calculo->>'motor_versao',r.regras_id,_calculo->'entradas',_calculo->'resumo',auth.uid()) returning id into calc_id;
 update proposta_revisoes set totais=_calculo->'resumo',calculado_em=now(),desatualizada=false where id=_rev;
 resp:=jsonb_build_object('id',_operacao,'evento',_operacao is not null,'objetos',nobj,'campos',nfields,'versao',h.versao,'calculo_id',calc_id,
 'pendencias',jsonb_array_length(_calculo->'resumo'->'pendencias'),'final',_calculo->'resumo'->'totais'->'final');
 if _operacao is not null then
  insert into proposta_salvamentos(id,organization_id,proposta_id,revisao_id,autor,autor_nome,versao_origem,versao_destino,objetos,campos,diferencas,calculo_id,impacto)
  values(_operacao,r.organization_id,r.proposta_id,_rev,auth.uid(),coalesce(email,auth.uid()::text),h.versao_salva,h.versao,nobj,nfields,diffs,calc_id,
   jsonb_build_object('total_anterior',h.total_salvo,'total_calculado',_calculo->'resumo'->'totais'->'final'));
  update proposta_checkpoints set snapshot=snapshot_rascunho(_rev),versao_salva=versao,total_salvo=(_calculo->'resumo'->'totais'->>'final')::numeric where revisao_id=_rev;
  insert into proposta_operacoes(id,revisao_id,autor,resposta) values(_operacao,_rev,auth.uid(),resp);
 end if;
 return resp;
end $$;
revoke execute on function public.objeto_rascunho(text,jsonb),public.snapshot_rascunho(uuid),public.diferencas_rascunho(jsonb,jsonb),public.rastrear_rascunho(),public.capturar_revisao(uuid,uuid),public.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.capturar_revisao(uuid,uuid),public.concluir_revisao(uuid,bigint,bigint,jsonb,jsonb,uuid) to authenticated;
