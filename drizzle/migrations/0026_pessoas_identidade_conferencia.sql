-- Preserve known user/person associations for independent qualification review.
-- Historical identity is not membership and never grants access to current records.
-- Serialize association writes until backfill and the tracking trigger are installed together.
lock table public.pessoas in share row exclusive mode;
create table public.pessoa_usuario_identidades (
  organization_id uuid not null references public.organizations(id),
  pessoa_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  registrado_em timestamptz not null default now(),
  origem text not null check (origem in ('vinculo_atual','recibo_historico','auditoria_historica','alteracao_vinculo')),
  primary key (organization_id,pessoa_id,user_id),
  foreign key (organization_id,pessoa_id) references public.pessoas(organization_id,id) on delete restrict
);
alter table public.pessoa_usuario_identidades enable row level security;
revoke all on public.pessoa_usuario_identidades from public,anon,authenticated,service_role;

insert into public.pessoa_usuario_identidades(organization_id,pessoa_id,user_id,origem)
select organization_id,id,user_id,'vinculo_atual' from public.pessoas where user_id is not null;

-- Only immutable, server-written receipts with matching tenant/person/Auth IDs are evidence.
insert into public.pessoa_usuario_identidades(organization_id,pessoa_id,user_id,origem)
select distinct p.organization_id,p.id,u.id,'recibo_historico'
from public.operacoes_idempotentes r
join public.pessoas p on p.organization_id=r.organization_id and p.id::text=r.resultado->>'id'
join auth.users u on u.id::text=r.resultado->>'user_id'
where r.comando='salvar_pessoa' and r.resultado->>'organization_id'=r.organization_id::text
on conflict do nothing;

insert into public.pessoa_usuario_identidades(organization_id,pessoa_id,user_id,origem)
select distinct p.organization_id,p.id,u.id,'auditoria_historica'
from public.auditoria a
join public.pessoas p on p.organization_id=a.organization_id and p.id::text=lower(a.dados->>'pessoa_id')
join auth.users u on u.id::text=lower(a.dados->>'user_id') and u.id=a.entidade_id
where a.entidade='vinculo_usuario' and a.acao in ('vincular','papel')
on conflict do nothing;

create function public.pessoa_preservar_identidade() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.user_id is not null then
    insert into public.pessoa_usuario_identidades(organization_id,pessoa_id,user_id,origem)
    values(old.organization_id,old.id,old.user_id,'alteracao_vinculo') on conflict do nothing;
  end if;
  if new.user_id is not null then
    insert into public.pessoa_usuario_identidades(organization_id,pessoa_id,user_id,origem)
    values(new.organization_id,new.id,new.user_id,'alteracao_vinculo') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger pessoa_preservar_identidade after insert or update of user_id on public.pessoas
for each row execute function public.pessoa_preservar_identidade();

create function public.pessoa_identidade_imutavel() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'O histórico de identidade é imutável.' using errcode='23514'; end $$;
create trigger pessoa_identidade_imutavel before update or delete on public.pessoa_usuario_identidades
for each row execute function public.pessoa_identidade_imutavel();

create function public.operacao_identidade_propria(_org uuid,_pessoa uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.pessoas p where p.organization_id=_org and p.id=_pessoa and p.user_id=auth.uid()) or
    exists(select 1 from public.pessoa_usuario_identidades i where i.organization_id=_org and i.pessoa_id=_pessoa and i.user_id=auth.uid())
  );
$$;

create function public.qualificacao_validacao_permitida(_org uuid,_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.operacao_pode(_org,'revisar_operacao') and exists(
    select 1 from public.pessoa_qualificacoes q join public.competencias c
      on c.organization_id=q.organization_id and c.id=q.competencia_id
    where q.organization_id=_org and q.id=_id and c.ativa
      and not public.operacao_identidade_propria(_org,q.pessoa_id)
  );
$$;

revoke all on function public.pessoa_preservar_identidade(),public.pessoa_identidade_imutavel(),public.operacao_identidade_propria(uuid,uuid),public.qualificacao_validacao_permitida(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.qualificacao_validacao_permitida(uuid,uuid) to authenticated;

-- Preserve the published transition contract; only its independent-review identity changes.
create or replace function public.transicionar_qualificacao(_org uuid,_chave uuid,_id uuid,_expected_version integer,_estado text,_motivo text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes; c public.competencias; r jsonb;
  payload jsonb:=jsonb_build_object('id',_id,'version',_expected_version,'estado',_estado,'motivo',_motivo); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'transicionar_qualificacao',payload); if r is not null then return r; end if;
  select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  if not ((q.estado='enviada' and _estado='em_conferencia') or (q.estado='em_conferencia' and _estado in ('enviada','validada')) or (q.estado='validada' and _estado='revogada')) then raise exception 'Transição não permitida.' using errcode='23514'; end if;
  if _estado in ('enviada','revogada') and length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  if _estado='validada' then
    if public.operacao_identidade_propria(_org,q.pessoa_id) then raise exception 'Conferência exige outra pessoa autorizada.' using errcode='42501'; end if;
    select * into c from public.competencias where organization_id=_org and id=q.competencia_id;
    if not c.ativa then raise exception 'Competência arquivada.' using errcode='23514'; end if;
    if c.exige_validade and q.validade is null then raise exception 'A política exige data de validade.' using errcode='23514'; end if;
    if c.exige_evidencia and not exists(select 1 from public.anexos where organization_id=_org and qualificacao_id=_id and estado='vinculado') then raise exception 'Anexe evidência conferida antes da validação.' using errcode='23514'; end if;
  end if;
  update public.pessoa_qualificacoes set estado=_estado,motivo=_motivo,
    conferido_por=case when _estado in ('validada','revogada') then auth.uid() else conferido_por end,
    conferido_em=case when _estado in ('validada','revogada') then now() else conferido_em end
    where id=_id returning * into q;
  return public.operacao_concluir(_org,_chave,'transicionar_qualificacao',payload,to_jsonb(q));
end $$;
