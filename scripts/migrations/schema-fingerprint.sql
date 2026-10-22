-- Somente catálogos PostgreSQL; não consulta registros, usuários, segredos ou binários.
-- Compare a baseline local e o projeto confirmado ANTES de aplicar a evolução.
with app_relations as (
  select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m')
    and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), app_functions as (
  select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
    and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), definitions as (
  select 'relations' as kind,r.relname::text as key,
    jsonb_build_object('kind',r.relkind,'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',replace(pg_catalog.pg_get_expr(d.adbin,d.adrelid),chr(13),'')) order by a.attnum)
        from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped)) as definition
  from app_relations r
  union all
  select 'constraints',r.relname||'.'||c.conname,to_jsonb(pg_catalog.pg_get_constraintdef(c.oid,true))
    from pg_catalog.pg_constraint c join app_relations r on r.oid=c.conrelid
  union all
  select 'indexes',r.relname||'.'||i.relname,to_jsonb(pg_catalog.pg_get_indexdef(x.indexrelid))
    from pg_catalog.pg_index x join app_relations r on r.oid=x.indrelid join pg_catalog.pg_class i on i.oid=x.indexrelid
  union all
  select 'policies',r.relname||'.'||p.polname,jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
    'roles',(select jsonb_agg(coalesce(role.rolname,'PUBLIC') order by coalesce(role.rolname,'PUBLIC')) from unnest(p.polroles) as allowed(oid) left join pg_catalog.pg_roles role on role.oid=allowed.oid),
    'using',replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),chr(13),''),'check',replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),chr(13),''))
    from pg_catalog.pg_policy p join app_relations r on r.oid=p.polrelid
  union all
  select 'triggers',r.relname||'.'||t.tgname,to_jsonb(pg_catalog.pg_get_triggerdef(t.oid,true))
    from pg_catalog.pg_trigger t join app_relations r on r.oid=t.tgrelid where not t.tgisinternal
  union all
  select 'functions',p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('source',replace(p.prosrc,chr(13),''),'language',l.lanname,'result',pg_catalog.pg_get_function_result(p.oid),
      'volatility',p.provolatile,'security_definer',p.prosecdef,'strict',p.proisstrict,'config',p.proconfig)
    from app_functions p join pg_catalog.pg_language l on l.oid=p.prolang
  union all
  select 'table_grants',table_name||'.'||grantee||'.'||privilege_type,to_jsonb(is_grantable)
    from information_schema.table_privileges where table_schema='public' and grantee in ('PUBLIC','anon','authenticated','service_role')
  union all
  select 'function_grants',p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||').' || coalesce(r.rolname,'PUBLIC') || '.' || a.privilege_type,to_jsonb(a.is_grantable)
    from app_functions p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    left join pg_catalog.pg_roles r on r.oid=a.grantee where a.grantee=0 or r.rolname in ('anon','authenticated','service_role')
), fingerprints as (
  select kind,key,md5(definition::text) as hash from definitions
), summaries as (
  select kind,count(*) as objects,md5(string_agg(key||':'||hash,E'\n' order by key)) as hash from fingerprints group by kind
)
select jsonb_build_object(
  'format','nexus-public-catalog-v1',
  'summary',(select jsonb_object_agg(kind,jsonb_build_object('count',objects,'md5',hash)) from summaries),
  'objects',(select jsonb_agg(jsonb_build_object('kind',kind,'key',key,'md5',hash) order by kind,key) from fingerprints)
);
