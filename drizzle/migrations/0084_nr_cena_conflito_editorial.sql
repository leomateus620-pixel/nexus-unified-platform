-- Um conflito editorial requer conciliação do técnico. Retornar HTTP 409 evita
-- que o transporte repita a transação como uma falha transitória de serialização.
do $migration$
declare
  fn regprocedure;
  ddl text;
  marker constant text := 'using errcode=''40001''';
begin
  foreach fn in array array[
    'public.ca_salvar(uuid,text,integer,jsonb)'::regprocedure,
    'public.ca_metadados(uuid,text,uuid,integer,text,text)'::regprocedure,
    'public.ca_publicar_ate82(uuid,text,uuid,uuid,jsonb)'::regprocedure
  ] loop
    ddl := pg_catalog.pg_get_functiondef(fn);
    if position(marker in ddl) > 0 then
      execute replace(ddl, marker, 'using errcode=''PT409''');
    elsif position('using errcode=''PT409''' in ddl) = 0 then
      raise exception 'Contrato de concorrência inesperado em %', fn;
    end if;
  end loop;
end
$migration$;
notify pgrst,'reload schema';
