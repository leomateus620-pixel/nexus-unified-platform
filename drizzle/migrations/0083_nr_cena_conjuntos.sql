-- O conjunto ligado aos itens de uma estrutura também aparece na ficha dessa estrutura.
-- A projeção não cria vínculos persistidos nem estende a consulta de anexos individuais de irmãos.
create or replace function public.ca_relacoes(p_org uuid,p_chave text) returns table(documento_id uuid,escopo text,objeto text)
language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 return query
 with recursive cadeia as (
  select e.chave,e.tipo,e.pai from public.nr_cena_elementos e where e.cena='tres-tentos-cruz-alta' and e.chave=p_chave
  union select e.chave,e.tipo,e.pai from public.nr_cena_elementos e join cadeia c on e.chave=c.pai where e.cena='tres-tentos-cruz-alta'
 ), estrutura as (
  select e.chave from public.nr_cena_elementos e where e.cena='tres-tentos-cruz-alta' and e.chave=p_chave and e.tipo='estrutura'
  union select e.chave from public.nr_cena_elementos e join estrutura pai on e.pai=pai.chave where e.cena='tres-tentos-cruz-alta'
 ), alvos as (
  select chave,false as so_conjunto from cadeia where chave=p_chave or tipo in('estrutura','componente')
  union select e.chave,false from public.nr_cena_elementos e where e.cena='tres-tentos-cruz-alta' and e.pai=p_chave and e.tipo='lvhf'
  union select chave,true from estrutura where chave<>p_chave
 )
 select distinct v.documento_id,v.escopo,o.chave from alvos a join public.nr_cena_objetos o
 on o.chave=a.chave and (o.organization_id,o.cliente_id,o.unidade_id)=(p_org,l.cliente_id,l.unidade_id)
 join public.nr_cena_documentos v on v.organization_id=p_org and v.local_id=o.local_id
 join public.nr_documentos d on d.id=v.documento_id and d.arquivado_em is null and 'NR35'=any(d.normas)
 where v.removido_em is null and (not a.so_conjunto or v.escopo='conjunto');
end$$;

create or replace function public.ca_ficha(p_org uuid,p_chave text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.nr_locais:=public.ca_local(p_org,p_chave);
begin
 return jsonb_build_object('id',l.id,'chave',p_chave,'titulo',l.titulo,'descricao',l.descricao,'version',l.version,
 'observacoes',coalesce(l.dados->>'observacoes',''),'atributos',coalesce(l.dados->'atributos','{}'),
 'atualizado_em',l.updated_at,'atualizado_por',coalesce(l.dados->>'atualizado_por',l.created_by::text),
 'pode_editar',public.pode(p_org,'editar_nr'),'pode_publicar',public.pode(p_org,'anexar_nr') and public.pode(p_org,'revisar_nr'),
 'cliente_id',l.cliente_id,'unidade_id',l.unidade_id,
 'historico',coalesce((select jsonb_agg(to_jsonb(h) order by h.em desc) from
 (select comando,autor,created_at em from public.nr_historico where organization_id=p_org and recurso='locais' and registro_id=l.id order by created_at desc,id desc limit 30)h),'[]'),
 'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'titulo',coalesce(m.titulo,d.titulo),'descricao',coalesce(m.descricao,d.descricao),'version',d.version+coalesce(m.versao,0),'pode_corrigir',public.pode(p_org,'editar_nr'),'escopo',v.escopo,'objeto',v.objeto,'origens',v.origens,
 'vigente_id',d.revisao_atual_id,'revisoes',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('nota',vdoc.snapshot#>>'{origem,nota}','autor',vdoc.created_by,'publicado_em',vdoc.created_at) order by r.numero desc)
 from public.ca_revisoes(p_org,d.id) r join public.nr_documento_revisoes vdoc on vdoc.id=r.id),'[]')) order by d.titulo,v.objeto)
 from (select rel.documento_id,rel.escopo,coalesce(min(rel.objeto) filter(where rel.objeto=p_chave),min(rel.objeto)) objeto,
 array_agg(distinct rel.objeto order by rel.objeto) origens from public.ca_relacoes(p_org,p_chave) rel group by rel.documento_id,rel.escopo) v
 join public.nr_documentos d on d.id=v.documento_id left join public.nr_cena_metadados m on m.documento_id=d.id),'[]'));
end$$;
-- A procedência de uma incorporação decorre do inventário conciliado por um editor.
-- Manter o recibo permite retomar uma publicação anterior mesmo depois de a pasta mudar.
alter function public.ca_publicar(uuid,text,uuid,uuid,jsonb) rename to ca_publicar_ate82;
revoke all on function public.ca_publicar_ate82(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.ca_publicar(p_org uuid,p_chave text,p_operacao uuid,p_arquivo uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare origem jsonb:=p_dados->'origem'; fonte jsonb; a jsonb; l public.nr_locais;
begin
 if origem is not null then
  l:=public.ca_local(p_org,p_chave);
  a:=public.ca_envio(p_org,p_chave,p_operacao,p_arquivo);
  if not exists(select 1 from public.nr_cena_envios e where e.organization_id=p_org and e.operacao=p_operacao and e.resultado is not null) then
   select f into fonte from public.nr_cena_inventarios i cross join lateral jsonb_array_elements(i.fontes) f
   where i.organization_id=p_org and i.cliente_id=l.cliente_id and i.unidade_id=l.unidade_id and i.atual
   and f->>'sourceId'=origem->>'id' and f->>'sha256'=a->>'sha256' and f->>'mime'=a->>'mime'
   and f->>'size'=a->>'tamanho' and f->>'status'='conferido'
   and f->>'documentKey'=origem->>'documento_chave' and f->>'page'=origem->>'pagina'
   and f->>'title'=p_dados->>'titulo' and coalesce(f->>'revision','Original')=p_dados->>'rotulo'
   and (f->>'date') is not distinct from (p_dados->>'data')
   and ((f->>'scope'='unidade' and p_chave='unidade' and p_dados->>'escopo'='unidade')
   or (coalesce(f->'objectKeys','[]') ? p_chave and p_dados->>'escopo'=case f->>'scope'
    when 'conjunto' then 'conjunto' when 'evidencia' then case when l.tipo='estrutura' then 'estrutura' else 'individual' end
    else 'individual' end));
   if fonte is null then raise exception 'Origem, revisão ou destino divergente do inventário conferido.' using errcode='23514';end if;
  end if;
 end if;
 return public.ca_publicar_ate82(p_org,p_chave,p_operacao,p_arquivo,p_dados);
end$$;
revoke all on function public.ca_publicar(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ca_publicar(uuid,text,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
