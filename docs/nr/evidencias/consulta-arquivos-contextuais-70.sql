-- Prova agregada de leitura; nenhum JWT, identidade simulada, DDL ou DML.
-- A consulta owner inspeciona metadados/associações; não substitui a jornada autenticada da RPC.
with definition as(
 select p.prosrc,p.prosecdef,p.provolatile,p.proconfig,p.proacl
 from pg_proc p where p.oid='public.nr_arquivo_listar(uuid,text,jsonb)'::regprocedure
), ledger as(
 select count(*)::int positions,max(position)::int last_position,
 md5(string_agg(position::text||':'||path||':'||sha256||E'\n','' order by position)filter(where position<=70))prefix70_md5,
 max(sha256)filter(where position=70)source_sha256,
 max(path)filter(where position=70)path
 from nexus_migrations.applied
), files as(
 select count(*)::int quantity,md5(string_agg(to_jsonb(a)::text,''order by a.id))records_md5 from public.nr_arquivos a
), relationships as(
 select count(*)::int quantity,md5(string_agg(to_jsonb(v)::text,''order by v.id))records_md5 from public.nr_arquivo_vinculos v
), target as(
 select d.organization_id,d.cliente_id,d.unidade_id,d.id documento_id,r.id revisao_id,d.local_id
 from public.nr_documentos d join public.nr_documento_revisoes r on r.organization_id=d.organization_id and r.documento_id=d.id and r.id=d.revisao_atual_id
 where d.id='3f114e10-cc01-4b53-81de-d8041da6ca5d'and r.id='12884b71-6e06-417f-8a4b-fa23bda39ddf'
), expected_assets(id,sha256,size)as(values
 ('9b64b0c3-dd03-43c0-9335-b3e16b640040'::uuid,'5fe236bd90f9845d3f1759ee3b2d8b7cce4e3207aa29cd291b42d9c895905e4c',131300::bigint),
 ('8bba91e9-843a-467d-b464-56744336d09d'::uuid,'02feb54ec3b5eaaaf5471081ae3e1f4f55075459cd0b83cda25d0db1a684a0eb',121456::bigint)
), matched_assets as(
 select a.id,a.sha256=e.sha256 and a.tamanho=e.size and a.mime='image/jpeg'and a.estado='vinculado'and a.bytes_verificados physical_identity_confirmed,
 exists(select 1 from public.nr_arquivo_vinculos v where v.organization_id=t.organization_id and v.cliente_id=t.cliente_id and v.unidade_id=t.unidade_id
 and v.arquivo_id=a.id and v.documento_id=t.documento_id and v.revisao_id=t.revisao_id and v.local_id is not distinct from t.local_id
 and v.evidencia->>'arquivo_original_id'='6a558ab1-d888-4195-8da6-e03d3f6a9140'
 and v.evidencia->>'source_sha256'='9ec17cbbc1f99f225909014cc5541d6ce468e3ee6be3be79d073c30a03a12a09'
 and v.evidencia->>'image_sha256'=a.sha256)exact_single_relationship
 from expected_assets e join public.nr_arquivos a on a.id=e.id cross join target t where a.organization_id=t.organization_id
)
select jsonb_build_object(
 'capturado_em_utc',clock_timestamp(),'postgres',version(),
 'ledger',jsonb_build_object('positions',l.positions,'last_position',l.last_position,'path',l.path,'source_sha256',l.source_sha256,
 'position70_exact',l.path='drizzle/migrations/0051_nr_arquivos_contextuais.sql'and l.source_sha256='1ddab7f1e30776c921862408f25f5c9fe3693283c58d796898b6d7d572a26117',
 'prefix70_md5',l.prefix70_md5,'prefix70_matches_manifest',l.prefix70_md5='ffe7200d9ce5e988ac92d496c303bb01'),
 'rpc',jsonb_build_object('body_md5',md5(d.prosrc),'body_matches_frozen_source',md5(d.prosrc)='90505972907c73c15135dae68ffde075',
 'security_definer',d.prosecdef,'volatility',d.provolatile,'search_path',to_jsonb(d.proconfig),
 'context_scope_keys',position('''organization_id'',v.organization_id,''cliente_id'',v.cliente_id,''unidade_id'',v.unidade_id'in d.prosrc)>0,
 'bounded_identity_filter',position('jsonb_array_length(p_filtros->''arquivo_ids'')>100'in d.prosrc)>0,
 'identity_filter_before_page',position('a.id=any(ids)'in d.prosrc)<position('offset pagina::bigint*limite'in d.prosrc)),
 'files',jsonb_build_object('quantity',f.quantity,'records_md5',f.records_md5,'unchanged_from_before',f.records_md5='543702cc98c40722c2aeaa5336bc2e1f'),
 'relationships',jsonb_build_object('quantity',v.quantity,'records_md5',v.records_md5,'unchanged_from_before',v.records_md5='bd3f38222bdd885cf7300ae868360502'),
 'sample_copy_assets',jsonb_build_object('expected',2,'found',(select count(*)from matched_assets),'physical_identity_confirmed',(select count(*)from matched_assets where physical_identity_confirmed),'same_relationship_confirmed',(select count(*)from matched_assets where exact_single_relationship))
)proof from ledger l cross join definition d cross join files f cross join relationships v;
