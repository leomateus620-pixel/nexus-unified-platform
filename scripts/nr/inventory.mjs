import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE = 'perplexity:ebbeeabb-f55b-4b45-b218-87ab8a412422';
export const canonical = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

// An external identity is scoped by entity and unit. TAG and bytes are never identities.
export function inventory(db, capturedAt, uiOptions = null) {
  const units = new Map(db.clientes.flatMap(c => c.unidades.map(u => [u.id, { ...u, cliente_id: c.id }])));
  const items = [], references = new Map();
  function add(tipo, id, payload, unit = null, parent = null, originalPath = null) {
    if (!id) throw new Error(`Missing external identity: ${tipo}`);
    const externo_id = unit ? `${unit}/${id}` : String(id);
    const key = `${tipo}:${externo_id}`;
    if (items.some(x => x.key === key)) throw new Error(`Ambiguous identity: ${key}`);
    items.push({ key, sistema_origem: SOURCE, tipo, externo_id, cliente_id: units.get(unit)?.cliente_id ?? null, unidade_id: unit, pai_externo_id: parent, caminho_original: originalPath, capturado_em: capturedAt, sha256: digest(payload), payload, resultado: 'extraido' });
  }
  for (const c of db.clientes) {
    add('cliente', c.id, c);
    for (const u of c.unidades) add('unidade', u.id, u, u.id, c.id);
  }
  if (Object.hasOwn(db,'meta')) add('contexto_origem','meta',db.meta);
  if (Object.hasOwn(db,'projeto')) add('contexto_origem','projeto',db.projeto);
  if (Object.hasOwn(db,'cliente_ativo') || Object.hasOwn(db,'unidade_ativa')) add('contexto_origem','selecao_ui',{cliente_ativo:db.cliente_ativo,unidade_ativa:db.unidade_ativa});
  if (uiOptions) add('contexto_origem','opcoes_interface',uiOptions);
  for (const l of db.locais) add('local', l.id, l, l.unidade_id);
  for (const d of db.documentos) add('registro_documental', d.id, d, d.unidade_id, d.local_id || null);
  for (const p of db.pendencias) add('pendencia', p.id, p, p.unidade_id, p.local_id || null);
  for (const [name, tipo, idKey] of [['familias','familia','cod'],['regras','regra','id'],['criterios','criterio','id'],['modelos_documento','modelo_documento','tipo']])
    for (const v of db[name]) add(tipo, v[idKey], v);
  add('modelo_levantamento', db.modelo_levantamento.id, db.modelo_levantamento);
  for (const [i, v] of db.log.entries()) add('evento', `${i}:${digest(v).slice(0,16)}`, v);
  function scan(v, location, context) {
    if (v && typeof v === 'object') {
      for (const [k,x] of Object.entries(v)) scan(x, `${location}/${k}`, { ...context, ...(v.unidade_id ? {unidade_id:v.unidade_id} : {}), ...(v.id ? {pai:v.id} : {}) });
    } else if (typeof v === 'string') {
      const urls = v.match(/https?:\/\/[^\s<>"\[\]{}]+/g) ?? [];
      for (const raw of urls) {
        const url = raw.replace(/[),;.]+$/,'');
        let u; try { u = new URL(url); } catch { continue; }
        // Signed preview URLs and credentials are never persisted in the inventory.
        if (u.hostname.endsWith('.pplx.app') || ['token','recovery','sig'].some(k => u.searchParams.has(k))) continue;
        const drive = u.hostname === 'drive.google.com' ? u.pathname.match(/\/(?:file\/d|folders)\/([^/]+)/)?.[1] : null;
        const key = drive ? `drive:${drive}` : url;
        if (!references.has(key)) references.set(key,{ id:key,url,tipo:u.pathname.includes('/folders/')?'pasta':'referencia',external_id:drive,associacoes:[],estado:'localizado' });
        references.get(key).associacoes.push({caminho_json:location,...context});
      }
      if (/^(fotos|arquivos)\//.test(v)) {
        const key = `source-path:${v}`;
        if (!references.has(key)) references.set(key,{id:key,caminho_original:v,tipo:/\.(jpe?g|png|webp)$/i.test(v)?'foto':'referencia',associacoes:[],estado:'localizado'});
        references.get(key).associacoes.push({caminho_json:location,...context});
      }
    }
  }
  scan(db,'',{});
  const perUnit = [...units.values()].map(u=>({id:u.id,locais:db.locais.filter(l=>l.unidade_id===u.id).length,espacos_confinados:db.locais.filter(l=>l.unidade_id===u.id&&l.tipo==='EC').length,altura:db.locais.filter(l=>l.unidade_id===u.id&&l.tipo!=='EC').length,registros_documentais:db.documentos.filter(d=>d.unidade_id===u.id).length,pendencias_abertas:db.pendencias.filter(p=>p.unidade_id===u.id&&p.situacao==='aberta').length,pendencias_encerradas:db.pendencias.filter(p=>p.unidade_id===u.id&&p.situacao==='encerrada').length}));
  return {format:'nexus-nr-inventory-v1',source:SOURCE,captured_at:capturedAt,items,references:[...references.values()],summary:{units:perUnit,categories:Object.fromEntries([...new Set(items.map(x=>x.tipo))].map(t=>[t,items.filter(x=>x.tipo===t).length])),references:references.size,bytes_validated:0,files_imported:0,complete:false}};
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [input,output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: inventory.mjs PRIVATE_SNAPSHOT PRIVATE_OUTPUT_DIRECTORY');
  const raw = await readFile(input);
  const hash = createHash('sha256').update(raw).digest('hex');
  let capturedAt = new Date().toISOString();
  try {
    const previous = JSON.parse(await readFile(path.join(output,'inventory.json'),'utf8'));
    if (previous.snapshot_sha256 === hash) {
      if (Number.isNaN(Date.parse(previous.captured_at))) throw new Error('Existing capture timestamp is invalid');
      capturedAt = previous.captured_at;
    }
  } catch(error) { if (error.code !== 'ENOENT') throw error; }
  let uiOptions = null;
  try { uiOptions = JSON.parse(await readFile(path.join(output,'source-ui-options.json'),'utf8')); }
  catch(error) { if (error.code !== 'ENOENT') throw error; }
  const result = inventory(JSON.parse(raw.toString('utf8')),capturedAt,uiOptions);
  result.snapshot_sha256 = hash;
  result.inventory_adapter_updated_at = new Date().toISOString();
  result.snapshot_bytes = raw.length;
  await mkdir(output,{recursive:true,mode:0o700});
  await writeFile(path.join(output,'inventory.json'),JSON.stringify(result,null,2),{mode:0o600});
  await writeFile(path.join(output,'summary.json'),JSON.stringify({...result,items:undefined,references:undefined},null,2),{mode:0o600});
  console.log(JSON.stringify({snapshot_sha256:result.snapshot_sha256,snapshot_bytes:raw.length,...result.summary}));
}
