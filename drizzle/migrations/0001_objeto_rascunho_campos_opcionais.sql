create or replace function public.objeto_rascunho(_t text, _r jsonb) returns jsonb
 language plpgsql immutable set search_path to 'public' as $function$
declare k text; v jsonb; campos jsonb;
begin
 if _r is null then return '{}'::jsonb; end if;
 if _t='proposta_revisoes' then
  return jsonb_build_object('parametros',jsonb_build_object('nome','Parâmetros','campos',_r->'parametros'),
                           'textos',jsonb_build_object('nome','Textos do documento','campos',_r->'textos'));
 elsif _t='sistemas_dimensionados' then
  k:='sistema:'||(_r->>'id');
  v:=jsonb_build_object('nome',coalesce(nullif(_r->>'identificacao',''),'Sistema '||(_r->>'ordem')),'campos',jsonb_build_object(
    'identificacao',_r->'identificacao','tipo',_r->'tipo','metragem',_r->'metragem','trechos',_r->'trechos'));
 elsif _t='revisao_componentes' then
  k:='componente:'||(_r->>'id');
  campos := jsonb_build_object('incluido_orcamento',_r->'incluido_orcamento','modalidade',_r->'modalidade','fornecedor_id',_r->'fornecedor_id','custo_adotado',_r->'custo_adotado');
  -- campos novos só entram quando usados, preservando a igualdade com checkpoints anteriores
  if coalesce((_r->>'quantidade_avulsa')::numeric,0) <> 0 then campos := campos || jsonb_build_object('quantidade_avulsa',_r->'quantidade_avulsa'); end if;
  if coalesce(_r->'estrutura','null'::jsonb) <> 'null'::jsonb then campos := campos || jsonb_build_object('estrutura',_r->'estrutura'); end if;
  v:=jsonb_build_object('nome',(_r->>'codigo')||' · '||(_r->>'descricao'),'justificativa',_r->'justificativa','rotulos',jsonb_build_object('fornecedor_id',_r->'fornecedor_nome'),'campos',campos);
 elsif _t='sistema_componentes' then
  if _r->>'override_quantidade' is null then return '{}'::jsonb; end if;
  k:='override:'||(_r->>'sistema_id')||':'||(_r->>'revisao_componente_id');
  v:=jsonb_build_object('nome','Ajuste de composição','justificativa',_r->'override_justificativa','campos',jsonb_build_object('override_quantidade',_r->'override_quantidade'));
 else return '{}'::jsonb;
 end if;
 return jsonb_build_object(k,v);
end $function$;