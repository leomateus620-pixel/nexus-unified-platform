-- Revalida permissões após adquirir a mesma trava da administração de vínculos.
-- Sem novos cadastros/grants: preserva assinaturas, recibos e regras canônicas de 0012.
-- Ordem: autor/admin → idempotência → entidade/par. Função privada vem de 0021.
-- Arquivar a própria pessoa não elimina sua identidade para a conferência independente.

create or replace function public.salvar_pessoa(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.pessoas; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_pessoa',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.pessoas(organization_id,nome,vinculo,funcao,email_profissional,telefone_profissional,user_id,registro_profissional)
    values(_org,trim(_dados->>'nome'),_dados->>'vinculo',nullif(trim(_dados->>'funcao'),''),nullif(_dados->>'email_profissional',''),nullif(_dados->>'telefone_profissional',''),nullif(_dados->>'user_id','')::uuid,nullif(_dados->>'registro_profissional','')) returning * into p;
  else
    select * into p from public.pessoas where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if p.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    update public.pessoas set nome=trim(_dados->>'nome'),vinculo=_dados->>'vinculo',funcao=nullif(trim(_dados->>'funcao'),''),email_profissional=nullif(_dados->>'email_profissional',''),telefone_profissional=nullif(_dados->>'telefone_profissional',''),user_id=nullif(_dados->>'user_id','')::uuid,registro_profissional=nullif(_dados->>'registro_profissional',''),ativa=coalesce((_dados->>'ativa')::boolean,true) where id=_id returning * into p;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_pessoa',payload,to_jsonb(p));
end $$;

create or replace function public.salvar_equipe(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.equipes; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_equipe',payload); if r is not null then return r; end if;
  if nullif(_dados->>'lider_id','') is not null and not exists(
    select 1 from public.pessoas where organization_id=_org and id=(_dados->>'lider_id')::uuid and ativa
  ) then raise exception 'Líder indisponível.' using errcode='23514'; end if;
  if _id is null then
    insert into public.equipes(organization_id,nome,lider_id)
    values(_org,trim(_dados->>'nome'),nullif(_dados->>'lider_id','')::uuid) returning * into e;
  else
    select * into e from public.equipes where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if e.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    update public.equipes set nome=trim(_dados->>'nome'),lider_id=nullif(_dados->>'lider_id','')::uuid,ativa=coalesce((_dados->>'ativa')::boolean,true)
    where id=_id returning * into e;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_equipe',payload,to_jsonb(e));
end $$;

create or replace function public.vincular_membro_equipe(_org uuid,_chave uuid,_equipe uuid,_pessoa uuid,_inicio date,_fim date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.equipe_membros; r jsonb; payload jsonb:=jsonb_build_object('equipe',_equipe,'pessoa',_pessoa,'inicio',_inicio,'fim',_fim); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'vincular_membro_equipe',payload); if r is not null then return r; end if;
  if _inicio is null or (_fim is not null and _fim<_inicio) then raise exception 'Período inválido.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('equipe:'||_org::text||_equipe::text||_pessoa::text,0));
  if not exists(select 1 from public.equipes where organization_id=_org and id=_equipe and ativa)
    or not exists(select 1 from public.pessoas where organization_id=_org and id=_pessoa and ativa)
    then raise exception 'Equipe ou pessoa indisponível.' using errcode='23514'; end if;
  if exists(select 1 from public.equipe_membros where organization_id=_org and equipe_id=_equipe and pessoa_id=_pessoa
    and daterange(inicio,fim,'[]') && daterange(_inicio,_fim,'[]')) then
    raise exception 'A pessoa já pertence à equipe nesse período.' using errcode='23P01';
  end if;
  insert into public.equipe_membros(organization_id,equipe_id,pessoa_id,inicio,fim) values(_org,_equipe,_pessoa,_inicio,_fim) returning * into m;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo)
    values(_org,'equipe_membros',m.id,'INSERT','Vínculo temporal criado');
  return public.operacao_concluir(_org,_chave,'vincular_membro_equipe',payload,to_jsonb(m));
end $$;

create or replace function public.encerrar_membro_equipe(_org uuid,_chave uuid,_id uuid,_fim date,_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.equipe_membros; r jsonb; payload jsonb:=jsonb_build_object('id',_id,'fim',_fim,'motivo',_motivo); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'gerir_equipe') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'encerrar_membro_equipe',payload); if r is not null then return r; end if;
  select * into m from public.equipe_membros where organization_id=_org and id=_id for update;
  if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
  if m.fim is not null then raise exception 'Vínculo encerrado. O período histórico é imutável.' using errcode='23514'; end if;
  if _fim is null or _fim<m.inicio or length(trim(coalesce(_motivo,'')))<5 then raise exception 'Informe fim válido e motivo com ao menos 5 caracteres.' using errcode='23514'; end if;
  update public.equipe_membros set fim=_fim where id=_id returning * into m;
  insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo)
    values(_org,'equipe_membros',m.id,'UPDATE',_motivo);
  return public.operacao_concluir(_org,_chave,'encerrar_membro_equipe',payload,to_jsonb(m));
end $$;

create or replace function public.salvar_competencia(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.competencias; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not public.operacao_pode(_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_competencia',payload); if r is not null then return r; end if;
  if _id is null then
    insert into public.competencias(organization_id,nome,descricao,exige_evidencia,exige_validade)
    values(_org,trim(_dados->>'nome'),_dados->>'descricao',coalesce((_dados->>'exige_evidencia')::boolean,true),coalesce((_dados->>'exige_validade')::boolean,false)) returning * into c;
  else
    select * into c from public.competencias where organization_id=_org and id=_id for update;
    if not found then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if c.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if exists(select 1 from public.pessoa_qualificacoes where organization_id=_org and competencia_id=_id)
      and (c.exige_evidencia is distinct from coalesce((_dados->>'exige_evidencia')::boolean,true) or c.exige_validade is distinct from coalesce((_dados->>'exige_validade')::boolean,false)) then
      raise exception 'Política já utilizada. Cadastre nova competência e preserve a anterior.' using errcode='23514';
    end if;
    update public.competencias set nome=trim(_dados->>'nome'),descricao=_dados->>'descricao',exige_evidencia=coalesce((_dados->>'exige_evidencia')::boolean,true),exige_validade=coalesce((_dados->>'exige_validade')::boolean,false),ativa=coalesce((_dados->>'ativa')::boolean,true)
    where id=_id returning * into c;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_competencia',payload,to_jsonb(c));
end $$;

create or replace function public.salvar_qualificacao(_org uuid,_chave uuid,_dados jsonb,_id uuid default null,_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.pessoa_qualificacoes; r jsonb; payload jsonb:=jsonb_build_object('dados',_dados,'id',_id,'version',_expected_version); begin
  perform public.lev_travar_autor(_org,auth.uid());
  if not (public.operacao_pode(_org,'gerir_equipe') or (public.operacao_pode(_org,'ver_equipe') and public.operacao_minha_pessoa(_org,(_dados->>'pessoa_id')::uuid))) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  r:=public.operacao_repetir(_org,_chave,'salvar_qualificacao',payload); if r is not null then return r; end if;
  if length(trim(coalesce(_dados->>'emissor','')))<2 then raise exception 'Informe o emissor.' using errcode='23514'; end if;
  if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'pessoa_id')::uuid and ativa)
    or not exists(select 1 from public.competencias where organization_id=_org and id=(_dados->>'competencia_id')::uuid and ativa)
    then raise exception 'Pessoa ou competência indisponível.' using errcode='23514'; end if;
  if _id is null then
    insert into public.pessoa_qualificacoes(organization_id,pessoa_id,competencia_id,emissor,conclusao,validade)
    values(_org,(_dados->>'pessoa_id')::uuid,(_dados->>'competencia_id')::uuid,trim(_dados->>'emissor'),(_dados->>'conclusao')::date,nullif(_dados->>'validade','')::date) returning * into q;
  else
    select * into q from public.pessoa_qualificacoes where organization_id=_org and id=_id for update;
    if not found or (not public.operacao_pode(_org,'gerir_equipe') and not public.operacao_minha_pessoa(_org,q.pessoa_id)) then raise exception 'Registro indisponível.' using errcode='42501'; end if;
    if q.version is distinct from _expected_version then raise exception 'Registro alterado por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
    if q.estado<>'enviada' then raise exception 'Qualificação em conferência ou concluída é imutável; devolva ou registre nova qualificação.' using errcode='23514'; end if;
    if q.pessoa_id<>(_dados->>'pessoa_id')::uuid or q.competencia_id<>(_dados->>'competencia_id')::uuid then raise exception 'Pessoa e competência de origem são imutáveis.' using errcode='23514'; end if;
    update public.pessoa_qualificacoes set emissor=trim(_dados->>'emissor'),conclusao=(_dados->>'conclusao')::date,validade=nullif(_dados->>'validade','')::date
    where id=_id returning * into q;
  end if;
  return public.operacao_concluir(_org,_chave,'salvar_qualificacao',payload,to_jsonb(q));
end $$;

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
    if exists(select 1 from public.pessoas where organization_id=_org and id=q.pessoa_id and user_id=auth.uid()) then raise exception 'Conferência exige outra pessoa autorizada.' using errcode='42501'; end if;
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
