-- The detached image processor uses the same immutable NR representations and leases.
-- Only files reachable through a current Cruz Alta document link are eligible.
create function public.ca_imagem_fontes() returns setof uuid
language sql stable security definer set search_path = '' as $$
    select distinct r.arquivo_id
    from (
      select distinct d.organization_id, d.documento_id
      from public.nr_cena_documentos d
      join public.nr_cenas_unidade s using (organization_id, cliente_id, unidade_id)
      where s.cena = 'tres-tentos-cruz-alta' and d.removido_em is null
    ) d
    cross join lateral public.ca_revisoes(d.organization_id, d.documento_id) r
    where r.mime in ('image/png', 'image/jpeg', 'image/webp')
$$;

create function public.ca_imagem_reservar(p_processador text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  files uuid[];
  result jsonb;
begin
  if p_processador is null or p_processador not in ('nexus-pillow-v1', 'nexus-storage-transform-v1') then
    raise exception 'Processador inválido' using errcode='23514';
  end if;
  select array(select public.ca_imagem_fontes()) into files;
  insert into public.nr_imagem_representacoes
    (organization_id, arquivo_id, original_sha256, variante, processador)
  select a.organization_id, a.id, a.sha256, v.variante, p_processador
  from public.nr_arquivos a
  cross join (values ('miniatura_384'), ('previa_768')) as v(variante)
  where a.id = any(files) and a.bytes_verificados and a.estado = 'vinculado'
    and not exists (
      select 1 from public.nr_imagem_representacoes i
      where i.arquivo_id = a.id and i.original_sha256 = a.sha256
        and i.variante = v.variante and (i.estado = 'disponivel' or i.processador = p_processador)
    )
  order by a.id, v.variante
  on conflict (organization_id, arquivo_id, original_sha256, variante, processador) do nothing;

  update public.nr_imagem_representacoes set estado = 'falhou', lease = null, lease_ate = null,
    erro = 'Lease expirado após o limite de tentativas'
  where arquivo_id = any(files) and processador = p_processador and estado = 'processando'
    and tentativas >= 3 and lease_ate < clock_timestamp();

  with job as (
    select i.id
    from public.nr_imagem_representacoes i
    join public.nr_arquivos a on a.id = i.arquivo_id and a.sha256 = i.original_sha256
    where i.arquivo_id = any(files) and a.bytes_verificados and a.estado = 'vinculado'
      and i.processador = p_processador and i.tentativas < 3
      and (i.estado = 'fila' or (i.estado = 'processando' and i.lease_ate < clock_timestamp()))
      and not exists (
        select 1 from public.nr_imagem_representacoes ready
        where ready.arquivo_id = i.arquivo_id and ready.original_sha256 = i.original_sha256
          and ready.variante = i.variante and ready.estado = 'disponivel'
      )
    order by i.created_at, i.id
    limit 1 for update of i skip locked
  ), claimed as (
    update public.nr_imagem_representacoes i set estado = 'processando', tentativas = i.tentativas + 1,
      lease = gen_random_uuid(), lease_ate = clock_timestamp() + interval '5 minutes', erro = null
    from job where i.id = job.id returning i.*
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    'original_caminho', a.caminho, 'original_mime', a.mime, 'original_tamanho', a.tamanho
  )), '[]'::jsonb) into result
  from claimed c join public.nr_arquivos a on a.id = c.arquivo_id;
  return result;
end $$;
-- Legacy NR tickets authorize a different queue. Bind this callback to its own purpose.
alter table public.nr_imagem_worker_tickets drop constraint nr_imagem_worker_tickets_finalidade_check;
alter table public.nr_imagem_worker_tickets add check (finalidade in ('processar_representacao', 'cruz_alta'));

create function public.ca_imagem_worker_validar(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.nr_imagem_worker_tickets set consumido_em = clock_timestamp()
  where ticket_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and finalidade = 'cruz_alta'
    and consumido_em is null and expira_em > clock_timestamp();
  return found;
end $$;

create function public.ca_imagem_disparar() returns void
language plpgsql security definer set search_path = '' as $$
declare
  endpoint text := public.ca_inspecao_sync_url();
  token text;
begin
  if endpoint is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or not pg_try_advisory_xact_lock(hashtextextended('cruz-alta:imagem:dispatch', 0)) then return; end if;
  delete from public.nr_imagem_worker_tickets where finalidade = 'cruz_alta' and expira_em <= clock_timestamp();
  if exists (select 1 from public.nr_imagem_worker_tickets where finalidade = 'cruz_alta' and consumido_em is null)
    then return; end if;
  if not exists (
    select 1 from public.ca_imagem_fontes() as f(id)
    join public.nr_imagem_representacoes i on i.arquivo_id = f.id
    join public.nr_arquivos a on a.id = f.id and a.sha256 = i.original_sha256
    where i.processador = 'nexus-storage-transform-v1'
      and (i.estado='fila' or (i.estado='processando' and i.lease_ate < clock_timestamp()))
      and not exists (
        select 1 from public.nr_imagem_representacoes ready where ready.arquivo_id = i.arquivo_id
          and ready.original_sha256 = i.original_sha256 and ready.variante = i.variante and ready.estado = 'disponivel'
      )
  ) then return; end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.nr_imagem_worker_tickets(ticket_sha256, expira_em, finalidade)
  values (encode(sha256(convert_to(token,'UTF8')),'hex'), clock_timestamp()+interval '120 seconds', 'cruz_alta');
  execute 'select net.http_post(url:=$1, headers:=$2, body:=$3, timeout_milliseconds:=60000)'
  using endpoint, jsonb_build_object('Content-Type','application/json','X-Nexus-Job-Token',token,
    'X-Nexus-Job-Queue','imagens'), '{}'::jsonb;
end $$;
revoke all on function public.ca_imagem_fontes(), public.ca_imagem_reservar(text),
  public.ca_imagem_worker_validar(text), public.ca_imagem_disparar() from public, anon, authenticated, service_role;
grant execute on function public.ca_imagem_reservar(text), public.ca_imagem_worker_validar(text) to service_role;

do $$begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1,$2,$3)' using 'nexus-ca-imagens', '* * * * *', 'select public.ca_imagem_disparar();';
  end if;
end $$;
notify pgrst, 'reload schema';
