CREATE OR REPLACE FUNCTION public.pet_demo_validar(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare x jsonb;m jsonb;k text;begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then raise exception 'Preenchimento inválido.'using errcode='23514';end if;
 perform public.ag_payload(p,array['atividade','inicio_previsto','termino_previsto','equipe','perigos','medidas','leituras','procedimentos','seguranca','procedimentos_sel']);
 foreach k in array array['atividade','inicio_previsto','termino_previsto','perigos','medidas','procedimentos']loop
  if jsonb_typeof(p->k)is distinct from 'string' or length(p->>k)>10000 then raise exception 'Campo de texto inválido.'using errcode='23514';end if;
 end loop;
 if length(trim(coalesce(p->>'atividade','')))<3 or length(p->>'atividade')>4000 then raise exception 'Descreva a atividade com ao menos três caracteres.'using errcode='23514';end if;
 if nullif(p->>'inicio_previsto','')is null or nullif(p->>'termino_previsto','')is null or (p->>'termino_previsto')::timestamptz<=(p->>'inicio_previsto')::timestamptz then raise exception 'Informe o início e um término posterior.'using errcode='23514';end if;
 if jsonb_typeof(p->'equipe')is distinct from 'array' or jsonb_typeof(p->'leituras')is distinct from 'array' then raise exception 'Equipe ou leituras inválidas.'using errcode='23514';end if;
 if jsonb_array_length(p->'equipe')>100 or jsonb_array_length(p->'leituras')>100 then raise exception 'Limite de itens excedido.'using errcode='23514';end if;
 if (select count(*) from jsonb_array_elements(p->'equipe'))<>(select count(distinct value->>'id') from jsonb_array_elements(p->'equipe'))then raise exception 'Participante duplicado.'using errcode='23514';end if;
 for x in select value from jsonb_array_elements(p->'equipe') loop
  perform public.ag_payload(x,array['id','nome','funcao','pessoa_id']);perform (x->>'id')::uuid;perform nullif(x->>'pessoa_id','')::uuid;
  if x->>'id' is null or length(trim(coalesce(x->>'nome','')))<2 or length(x->>'nome')>160 or coalesce(x->>'funcao','')not in('supervisor','vigia','trabalhador','resgate','substituto_vigia')then raise exception 'Informe nome e função de cada participante.'using errcode='23514';end if;
 end loop;
 for x in select value from jsonb_array_elements(p->'leituras') loop
  perform public.ag_payload(x,array['id','agente','valor','unidade','instrumento','ponto','coletada_em','momento']);perform (x->>'id')::uuid;
  if x->>'id' is null or jsonb_typeof(x->'valor')is distinct from 'string' or length(x->>'agente')>80 or length(x->>'unidade')>30 or length(coalesce(x->>'instrumento',''))>160 or length(coalesce(x->>'ponto',''))>160 then raise exception 'Leitura inválida.'using errcode='23514';end if;
  if coalesce(x->>'momento','pre_entrada') not in ('pre_entrada','monitoramento') then raise exception 'Momento da leitura inválido.'using errcode='23514';end if;
  if length(trim(coalesce(x->>'agente','')))<1 or length(trim(coalesce(x->>'unidade','')))<1 or nullif(x->>'valor','')is null or (x->>'valor')::numeric::text in('NaN','Infinity','-Infinity')then raise exception 'Informe agente, valor numérico e unidade de cada leitura.'using errcode='23514';end if;
 end loop;
 if p ? 'seguranca' then
  if jsonb_typeof(p->'seguranca')<>'array' or jsonb_array_length(p->'seguranca')>100 then raise exception 'Segurança inválida.'using errcode='23514';end if;
  for x in select value from jsonb_array_elements(p->'seguranca') loop
   perform public.ag_payload(x,array['id','grupo','perigo','origem','outro_motivo','medidas']);
   if length(trim(coalesce(x->>'perigo','')))<2 or length(x->>'perigo')>200 or coalesce(x->>'origem','') not in ('avaliacao','entrada') or jsonb_typeof(x->'medidas')<>'array' then raise exception 'Perigo inválido.'using errcode='23514';end if;
   for m in select value from jsonb_array_elements(x->'medidas') loop
    perform public.ag_payload(m,array['id','medida','estado','justificativa','outro_motivo']);
    if length(trim(coalesce(m->>'medida','')))<2 or length(m->>'medida')>200 or coalesce(m->>'estado','') not in ('pendente','confirmada','impeditiva','nao_aplica') then raise exception 'Medida inválida.'using errcode='23514';end if;
    if m->>'estado'='nao_aplica' and length(trim(coalesce(m->>'justificativa','')))<3 then raise exception 'Justifique a medida marcada como não se aplica.'using errcode='23514';end if;
   end loop;
  end loop;
 end if;
 if p ? 'procedimentos_sel' then
  if jsonb_typeof(p->'procedimentos_sel')<>'array' or jsonb_array_length(p->'procedimentos_sel')>50 then raise exception 'Procedimentos inválidos.'using errcode='23514';end if;
  for x in select value from jsonb_array_elements(p->'procedimentos_sel') loop
   perform public.ag_payload(x,array['grupo','procedimento','verificado']);
   if length(coalesce(x->>'procedimento',''))<2 or length(x->>'procedimento')>200 or jsonb_typeof(x->'verificado')<>'boolean' then raise exception 'Procedimento inválido.'using errcode='23514';end if;
  end loop;
 end if;
end$function$;