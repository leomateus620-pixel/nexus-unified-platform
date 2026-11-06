create table public.pet_funcao_competencias(
 organization_id uuid not null references public.organizations(id),
 funcao text not null check(funcao in('supervisor','vigia','trabalhador','resgate','substituto_vigia')),
 competencia_id uuid not null,
 rotulo_vinculo text not null check(length(rotulo_vinculo) between 2 and 80),
 validade_meses integer check(validade_meses between 1 and 120),
 regra text not null default '',
 regra_versao integer not null default 1,
 primary key(organization_id,funcao,competencia_id),
 foreign key(organization_id,competencia_id) references public.competencias(organization_id,id)
);
comment on table public.pet_funcao_competencias is 'Regra versionada: qual competência comprova cada função da PET e por qual rótulo a pessoa aparece como candidata na equipe da unidade.';
grant select on public.pet_funcao_competencias to authenticated;
grant all on public.pet_funcao_competencias to service_role;
alter table public.pet_funcao_competencias enable row level security;
create policy pet_funcao_competencias_ler on public.pet_funcao_competencias for select to authenticated
 using(public.operacao_pode(organization_id,'ver_equipe'));

create or replace function public.pet_equipe_candidatos(p_org uuid,p_cliente uuid,p_unidade uuid,p_funcao text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hoje date;r jsonb;begin
 if p_funcao not in('supervisor','vigia','trabalhador','resgate','substituto_vigia')then raise exception 'Função inválida.'using errcode='23514';end if;
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,'NR33')or not public.operacao_pode(p_org,'ver_equipe')then raise exception 'Equipe indisponível para este acesso.'using errcode='42501';end if;
 hoje:=(now()at time zone(select timezone from public.organizations where id=p_org))::date;
 with regra as(select * from public.pet_funcao_competencias where organization_id=p_org and funcao=p_funcao),
 cand as(select p.id,p.nome,m.funcao funcao_unidade from public.nr_unidade_pessoas m join public.pessoas p on p.organization_id=m.organization_id and p.id=m.pessoa_id
  where m.organization_id=p_org and m.cliente_id=p_cliente and m.unidade_id=p_unidade and m.ativa and p.ativa
  and exists(select 1 from regra g where strpos(lower(m.funcao),lower(g.rotulo_vinculo))>0)),
 ev as(select q.id qualificacao_id,q.pessoa_id,c.nome curso,q.emissor,q.conclusao,q.carga_horaria,q.tipo_treinamento,q.estado,
  coalesce(q.validade,case when g.validade_meses is not null then(q.conclusao+make_interval(months=>g.validade_meses))::date end)validade,
  case when q.validade is not null then 'explicita' when g.validade_meses is not null then 'calculada' else 'nao_informada' end validade_origem,g.regra,
  (select a.id from public.anexos a where a.organization_id=p_org and a.qualificacao_id=q.id and a.estado='vinculado' order by a.created_at desc limit 1)anexo_id
  from public.pessoa_qualificacoes q join regra g on g.competencia_id=q.competencia_id join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id
  where q.organization_id=p_org and q.estado<>'revogada' and q.pessoa_id in(select id from cand)),
 ev2 as(select e.*,case when e.anexo_id is null then 'incompleto' when e.validade is not null and e.validade<hoje then 'vencido'
  when e.estado in('enviada','em_conferencia')then 'em_conferencia' else 'vinculado' end situacao from ev e),
 ranked as(select e.*,row_number()over(partition by pessoa_id order by case situacao when 'vinculado' then 0 when 'em_conferencia' then 1 when 'vencido' then 2 else 3 end,validade desc nulls last,conclusao desc)rk,
  count(*)over(partition by pessoa_id)total from ev2 e)
 select jsonb_build_object('funcao',p_funcao,'data_referencia',hoje,'regra_versao',(select max(regra_versao)from regra),
  'candidatos',coalesce((select jsonb_agg(jsonb_build_object('pessoa_id',c.id,'nome',c.nome,'funcao_unidade',c.funcao_unidade,
   'situacao',coalesce(r.situacao,'ausente'),'total_evidencias',coalesce(r.total,0),
   'evidencia',case when r.qualificacao_id is null then null else jsonb_build_object('qualificacao_id',r.qualificacao_id,'anexo_id',r.anexo_id,'curso',r.curso,'emissor',r.emissor,
    'conclusao',r.conclusao,'carga_horaria',r.carga_horaria,'tipo_treinamento',r.tipo_treinamento,'estado',r.estado,'validade',r.validade,'validade_origem',r.validade_origem,'regra',r.regra)end)order by c.nome,c.id)
   from cand c left join ranked r on r.pessoa_id=c.id and r.rk=1),'[]'::jsonb))into r;
 return r;
end$$;
revoke all on function public.pet_equipe_candidatos(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.pet_equipe_candidatos(uuid,uuid,uuid,text) to authenticated;

create or replace function public.pet_equipe_evidencias(p_org uuid,p_cliente uuid,p_unidade uuid,p_funcao text,p_pessoa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,'NR33')or not public.operacao_pode(p_org,'ver_equipe')then raise exception 'Equipe indisponível para este acesso.'using errcode='42501';end if;
 if not exists(select 1 from public.nr_unidade_pessoas where organization_id=p_org and cliente_id=p_cliente and unidade_id=p_unidade and pessoa_id=p_pessoa and ativa)then raise exception 'Pessoa não vinculada a esta unidade.'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('qualificacao_id',q.id,'curso',c.nome,'emissor',q.emissor,'conclusao',q.conclusao,'carga_horaria',q.carga_horaria,'estado',q.estado,'validade',q.validade,
  'anexo_id',(select a.id from public.anexos a where a.organization_id=p_org and a.qualificacao_id=q.id and a.estado='vinculado' order by a.created_at desc limit 1))order by q.conclusao desc)
  from public.pessoa_qualificacoes q join public.pet_funcao_competencias g on g.organization_id=q.organization_id and g.funcao=p_funcao and g.competencia_id=q.competencia_id
  join public.competencias c on c.organization_id=q.organization_id and c.id=q.competencia_id where q.organization_id=p_org and q.pessoa_id=p_pessoa and q.estado<>'revogada'),'[]'::jsonb);
end$$;
revoke all on function public.pet_equipe_evidencias(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.pet_equipe_evidencias(uuid,uuid,uuid,text,uuid) to authenticated;