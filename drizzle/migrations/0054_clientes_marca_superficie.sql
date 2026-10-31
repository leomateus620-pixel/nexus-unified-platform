-- O arquivo oficial tem tipografia branca: a superfície é metadado da mídia, sem filtro/recoloração.
-- Não altera o binário nem a razão social/nome comercial já conciliados.
update public.clientes set marca=marca||'{"superficie":"escura"}'::jsonb
where organization_id='abab473b-8baa-4781-aed2-c1243338af65'
 and id='9d6dfbe8-285a-44e5-9ea1-2574daa7cb28'
 and marca->>'sha256'='8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7'
 and not (marca ? 'superficie');
update public.clientes set marca=marca||'{"superficie":"clara"}'::jsonb
where organization_id='abab473b-8baa-4781-aed2-c1243338af65'
 and id='56fc28f9-f5ef-44b2-a5ea-8bfc6bfb94e0'
 and marca->>'sha256'='a7965c6dc0d707d83d4320f2ea5e8119ec6cbbdb216999c4b033b73dabb2d917'
 and not (marca ? 'superficie');
