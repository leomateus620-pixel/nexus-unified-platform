-- Consultas somente leitura usadas nas medições reais; não definem JWT ou identidade.
-- Fonte/unidade/local são identidades da reconciliação, não constantes da interface.
-- Não executa DDL, DML, aprovação, emissão ou obtenção de binários.

-- Mesma contagem de linhagem medida antes e depois da posição69.
explain(analyze,buffers,format json)select count(*)from public.nr_documentos d where d.organization_id=(select f.organization_id from public.nr_fontes f where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='unidade'and f.externo_id='und-cotrirosa-fabrica'limit 1)and d.unidade_id=(select f.destino_id from public.nr_fontes f where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='unidade'and f.externo_id='und-cotrirosa-fabrica'limit 1)and 'NR33'=any(d.normas)and d.arquivado_em is null and public.nr_documento_copia_comprovada(d.organization_id,d.dados);

-- documentos_ec01_fabrica_pagina25
explain(analyze,buffers,format json)with alvo as(select l.id,l.organization_id,l.unidade_id from public.nr_fontes f join public.nr_locais l on l.organization_id=f.organization_id and l.id=f.destino_id where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='local'and f.externo_id='und-cotrirosa-fabrica/CTR-EC-01')select d.id,d.titulo,d.tipo,d.local_id,public.nr_documento_resumo(d.organization_id,'NR33',d.id)resumo from public.nr_documentos d join alvo a on a.organization_id=d.organization_id and a.unidade_id=d.unidade_id and a.id=d.local_id where 'NR33'=any(d.normas)and d.arquivado_em is null and not public.nr_documento_copia_comprovada(d.organization_id,d.dados)order by d.updated_at desc,d.id offset 0 limit 25;

-- locais_fabrica_pagina25_tag_natural
explain(analyze,buffers,format json)with alvo as(select l.id,l.organization_id,l.unidade_id from public.nr_fontes f join public.nr_locais l on l.organization_id=f.organization_id and l.id=f.destino_id where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='local'and f.externo_id='und-cotrirosa-fabrica/CTR-EC-01')select l.id,l.tag,l.titulo,l.tipo,l.familia,public.nr_local_resumo(l.organization_id,'NR33',l.id)resumo from public.nr_locais l join alvo a on a.organization_id=l.organization_id and a.unidade_id=l.unidade_id where 'NR33'=any(l.normas)and l.arquivado_em is null order by l.unidade_id,public.nr_tag_ordem(l.tag),l.tag,l.titulo,l.id offset 0 limit 25;

-- historico_tecnico_ec01_fabrica_pagina25
explain(analyze,buffers,format json)with alvo as(select l.id,l.organization_id,l.unidade_id from public.nr_fontes f join public.nr_locais l on l.organization_id=f.organization_id and l.id=f.destino_id where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='local'and f.externo_id='und-cotrirosa-fabrica/CTR-EC-01')select public.nr_historico_tecnico_consultar(a.organization_id,'NR33',jsonb_build_object('unidade_id',a.unidade_id,'local_id',a.id,'pagina',0,'limite',25))pagina from alvo a;

-- painel_contadores_documentais_fabrica
explain(analyze,buffers,format json)with alvo as(select l.id,l.organization_id,l.unidade_id from public.nr_fontes f join public.nr_locais l on l.organization_id=f.organization_id and l.id=f.destino_id where f.origem='perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422'and f.tipo='local'and f.externo_id='und-cotrirosa-fabrica/CTR-EC-01')select public.nr_painel_contadores_documentos(a.organization_id,'NR33',jsonb_build_object('unidade_id',a.unidade_id))indicadores from alvo a;
