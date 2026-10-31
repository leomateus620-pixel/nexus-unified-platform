-- Encerrar o último lease vencido não altera o original nem reinicia um trabalho ativo.
create or replace function public.nr_imagem_trabalho_obter(p_limite integer default 1)returns jsonb
 language plpgsql security definer set search_path=''as $$declare result jsonb;begin
 if p_limite is null or p_limite not between 1 and 3 then raise exception'Lote inválido.'using errcode='23514';end if;
 update public.nr_imagem_representacoes
 set estado='falhou',lease=null,lease_ate=null,
  erro='Lease expirado após o limite de tentativas'
 where estado='processando'and tentativas>=3 and lease_ate<clock_timestamp();
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
revoke all on function public.nr_imagem_trabalho_obter(integer)from public,anon,authenticated;
grant execute on function public.nr_imagem_trabalho_obter(integer)to service_role;
