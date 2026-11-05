-- Evidências fotográficas adicionais, sem alterar bytes do original.
create table public.pet_foto_metadados (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,anexo_id uuid not null,
 capturada_em timestamptz not null,latitude numeric check(latitude between -90 and 90),longitude numeric check(longitude between -180 and 180),precisao_m numeric check(precisao_m>0 and precisao_m<=100000),
 origem text not null check(origem in('declarada','dispositivo')),legenda text not null check(length(trim(legenda))between 3 and 2000),sha256 text not null,
 created_by uuid not null default auth.uid()references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,anexo_id),foreign key(organization_id,pet_id)references public.pet_permissoes(organization_id,id),foreign key(organization_id,anexo_id)references public.anexos(organization_id,id),
 check((latitude is null)=(longitude is null)),check(origem<>'dispositivo'or(latitude is not null and precisao_m is not null))
);
alter table public.pet_foto_metadados enable row level security;
revoke all on public.pet_foto_metadados from public,anon,authenticated,service_role;
create trigger pet_foto_imutavel before update or delete on public.pet_foto_metadados for each row execute function public.pet_imutavel();
create function public.pet_foto_registrar(p_org uuid,p_pet uuid,p_anexo uuid,p_expected_version integer,p_chave uuid,p_dados jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pet_permissoes;a public.anexos;m public.pet_foto_metadados;r jsonb;payload jsonb;begin
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.pet_operar(p_org,p_pet)then raise exception 'Sem atribuição nesta PET.'using errcode='42501';end if;
 perform public.ag_payload(p_dados,array['capturada_em','latitude','longitude','precisao_m','origem','legenda']);
 if p_chave is null or p_expected_version is null then raise exception 'Versão e chave obrigatórias.'using errcode='23514';end if;
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_pet for update;
 payload:=jsonb_build_object('pet',p_pet,'anexo',p_anexo,'version',p_expected_version,'dados',p_dados);
 r:=public.operacao_repetir(p_org,p_chave,'pet_foto_registrar',payload);if r is not null then return r;end if;
 if p.version<>p_expected_version then raise exception 'PET alterada; confira a versão antes de vincular metadados.'using errcode='40001';end if;
 if p.estado_documental not in('rascunho','em_conferencia')then raise exception 'Evidência prévia exige PET em preparação. Preserve as revisões emitidas.'using errcode='23514';end if;
 select * into a from public.anexos where organization_id=p_org and id=p_anexo and pet_id=p_pet and estado='vinculado' and mime in('image/jpeg','image/png','image/webp')for share;
 if not found then raise exception 'Foto confirmada indisponível nesta PET.'using errcode='42501';end if;
 if nullif(p_dados->>'capturada_em','')is null or(p_dados->>'capturada_em')::timestamptz>clock_timestamp()+interval '5 minutes'then raise exception 'Informe a data e hora da captura, sem data futura.'using errcode='23514';end if;
 insert into public.pet_foto_metadados(organization_id,pet_id,anexo_id,capturada_em,latitude,longitude,precisao_m,origem,legenda,sha256)
 values(p_org,p_pet,p_anexo,(p_dados->>'capturada_em')::timestamptz,(p_dados->>'latitude')::numeric,(p_dados->>'longitude')::numeric,(p_dados->>'precisao_m')::numeric,p_dados->>'origem',p_dados->>'legenda',a.sha256)returning * into m;
 insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados)values(p_org,p_pet,'foto_documentada','Metadados declarados vinculados ao original confirmado.',jsonb_build_object('anexo_id',a.id,'metadados_id',m.id,'sha256',a.sha256));
 return public.operacao_concluir(p_org,p_chave,'pet_foto_registrar',payload,jsonb_build_object('id',m.id));
end$$;
create function public.pet_fotos_listar(p_org uuid,p_pet uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.pet_ler(p_org,p_pet)then raise exception 'Registro indisponível.'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'item',a.pet_item,'metadados',to_jsonb(m))order by a.created_at,a.id)from public.anexos a left join public.pet_foto_metadados m on m.organization_id=a.organization_id and m.anexo_id=a.id where a.organization_id=p_org and a.pet_id=p_pet and a.estado='vinculado'and a.mime in('image/jpeg','image/png','image/webp')),'[]');
end$$;
-- O RT define quais itens exigem foto datada/georreferenciada na versão do procedimento.
alter function public.pet_pendencias(uuid,uuid)rename to pet_pendencias_ate63;
create function public.pet_pendencias(p_org uuid,p_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;p public.pet_permissoes;modelo jsonb;x jsonb;begin
 r:=public.pet_pendencias_ate63(p_org,p_id);
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_id;
 select procedimento into modelo from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id;
 for x in select value from jsonb_array_elements(coalesce(modelo->'itens','[]'))loop
  if x->>'foto_obrigatoria'='true'and not exists(select 1 from public.anexos a join public.pet_foto_metadados m on m.organization_id=a.organization_id and m.anexo_id=a.id where a.organization_id=p_org and a.pet_id=p_id and a.pet_item=x->>'id'and a.estado='vinculado'and a.sha256=m.sha256 and(coalesce(x->>'gps_obrigatorio','false')<>'true'or(m.latitude is not null and m.longitude is not null)))then
   r:=r||jsonb_build_array(jsonb_build_object('codigo','foto_documentada','campo',x->>'id','mensagem','Foto confirmada com data, hora e localização exigida pelo procedimento: '||coalesce(x->>'rotulo',x->>'id')));
  end if;
 end loop;
 return r;
end$$;
create function public.pet_exportar_unidade(p_org uuid,p_cliente uuid,p_unidade uuid,p_norma text,p_filtros jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pagina integer:=0;lista jsonb;rows jsonb:='[]';begin
 if not public.nr_unidade_autorizada(p_org,p_cliente,p_unidade,p_norma)or not public.operacao_pode(p_org,'ver_operacao')then raise exception 'Unidade indisponível.'using errcode='42501';end if;
 perform public.ag_payload(p_filtros,array['espaco_id','grupo','estado','desde','ate','busca']);
 if p_filtros?'espaco_id'and not exists(select 1 from public.pet_espacos where organization_id=p_org and unidade_id=p_unidade and id=(p_filtros->>'espaco_id')::uuid)then raise exception 'Espaço fora desta unidade.'using errcode='42501';end if;
 loop
  lista:=public.pet_listar(p_org,p_filtros||jsonb_build_object('unidade_id',p_unidade,'contexto_unidade',true,'pagina',pagina,'limite',100));
  if(lista->>'total')::integer>5000 then raise exception 'Mais de 5.000 registros. Restrinja o período para exportar sem truncamento.'using errcode='23514';end if;
  rows:=rows||coalesce(lista->'registros','[]');
  exit when jsonb_array_length(rows)>=(lista->>'total')::integer;
  pagina:=pagina+1;
 end loop;
 return jsonb_build_object('registros',rows,'total',jsonb_array_length(rows),'consultado_em',now());
end$$;
revoke all on function public.pet_foto_registrar(uuid,uuid,uuid,integer,uuid,jsonb),public.pet_fotos_listar(uuid,uuid),public.pet_pendencias_ate63(uuid,uuid),public.pet_pendencias(uuid,uuid),public.pet_exportar_unidade(uuid,uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.pet_foto_registrar(uuid,uuid,uuid,integer,uuid,jsonb),public.pet_fotos_listar(uuid,uuid),public.pet_exportar_unidade(uuid,uuid,uuid,text,jsonb)to authenticated;
notify pgrst,'reload schema';
