import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { canonical, digest, SOURCE } from './inventory.mjs';

const [directory,org,phase] = process.argv.slice(2);
if (!directory || !/^[0-9a-f-]{36}$/.test(org??'') || !phase) throw Error('Usage: prepare-import.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID PHASE');
const db = JSON.parse(await readFile(path.join(directory,'source-db.json'),'utf8'));
const inventory = JSON.parse(await readFile(path.join(directory,'inventory.json'),'utf8'));
const mappings = JSON.parse(await readFile(path.join(directory,'mappings.json'),'utf8').catch(()=> '[]'));
const map = new Map(mappings.map(x=>[`${x.tipo}:${x.externo_id}`,x.destino_id]));
const ref = (tipo,id) => { const result=map.get(`${tipo}:${id}`);if(!result)throw Error(`Dependency unresolved: ${tipo}:${id}`);return result; };
const units = new Map(db.clientes.flatMap(c=>c.unidades.map(u=>[u.id,{...u,cliente_externo:c.id}])));
const localMap = new Map(db.locais.map(l=>[`${l.unidade_id}/${l.id}`,l]));
const q = value => `'${String(value).replaceAll("'","''")}'`;
const json = value => `${q(JSON.stringify(value))}::jsonb`;
const base = unit => ({cliente_id:ref('cliente',units.get(unit).cliente_externo),unidade_id:ref('unidade',unit)});
const localRef = (unit,id) => id ? ref('local',`${unit}/${id}`) : null;
const norms = l => l?.tipo==='ALTURA'?['NR35']:['NR33'];
function modelBlocks(blocos) {
  return (blocos??[]).map(b=>({...b,codigo:b.id,campos:(b.campos??[]).map(f=>({...f,
    id:`${b.id}.${f.id}`,id_origem:f.id,nome:f.rotulo??f.nome??f.id,
    tipo:['texto','texto_longo','numero','selecao','foto','lista','data'].includes(f.tipo)?f.tipo:'lista',
    tipo_origem:f.tipo,obrigatorio:!!f.obrigatorio,
    ...(f.mostrar_se?{mostrar_se:{...f.mostrar_se,campo:`${b.id}.${f.mostrar_se.campo}`}}:{}),
  }))}));
}
function content(value) {
  const blocks=[];let n=0;
  const add = b => blocks.push({id:`source-${++n}`,...b});
  function visit(v,label,depth=0) {
    if (v==null || v==='') return;
    if (depth>8) {add({tipo:'paragrafo',texto:canonical(v)});return;}
    if (typeof v!=='object') {add({tipo:'paragrafo',texto:label?`${label}: ${v}`:String(v)});return;}
    if (label) add({tipo:'titulo',nivel:Math.min(depth+2,6),texto:label});
    if (Array.isArray(v)) {
      if(v.every(x=>typeof x!=='object')) {add({tipo:'paragrafo',texto:v.join('\n')});return;}
      for(const item of v)visit(item,'',depth+1);
    } else for (const [k,x] of Object.entries(v)) visit(x,k,depth+1);
  }
  visit(value,'Snapshot documental da origem');
  if(blocks.length>1000)throw Error('Editable conversion exceeds 1000 blocks; preserve original and split explicitly before importing.');
  return {schema_version:1,blocos:blocks};
}
const rows=[];
function push(tipo,external,payload,dest) {
  rows.push({tipo,externo_id:external,payload,destino:{...dest,evidencia:{snapshot_sha256:inventory.snapshot_sha256,sistema:SOURCE,estrategia_identidade:'ID de origem, escopado por unidade quando aplicável',...dest.evidencia}},sha256:digest(payload)});
}
if(phase==='contexto') for(const item of inventory.items.filter(item=>item.tipo==='contexto_origem'))push('contexto_origem',item.externo_id,item.payload,{entidade:'referencias',registro:{},caminho_original:item.externo_id==='opcoes_interface'?'app.js/{L,SIT_PEND,SIT_ANC}':'source-db.json/'+item.externo_id,evidencia:{metadata_only:true,active_context_applied:false,auth_accounts_created:false,professional_powers_assigned:false},motivo:'Metadados históricos da origem; não aplicados à seleção atual, contas, papéis ou poderes técnicos.'});
else if(phase==='clientes') for(const c of db.clientes)push('cliente',c.id,c,{entidade:'clientes',registro:{razao_social:c.razao_social,nome_exibicao:c.nome_fantasia,cnpj:c.cnpj_matriz,observacoes:c.observacao||null}});
else if(phase==='unidades') for(const [id,u]of units)push('unidade',id,u,{entidade:'unidades',registro:{cliente_id:ref('cliente',u.cliente_externo),nome:u.nome,endereco:[u.endereco,u.cidade,u.uf].filter(Boolean).join(' · '),observacoes:JSON.stringify({cnpj:u.cnpj,escopo:u.escopo,documentacao:u.documentacao,origem_id:id})}});
else if(phase==='modelos') {
  const m=db.modelo_levantamento;
  push('modelo_levantamento',m.id,m,{entidade:'modelos',modelo_numero:m.versao,registro:{titulo:`${m.id} — ${m.nome}`,tipo:'levantamento',normas:['NR33','NR35'],descricao:m.origem,dados:{...m,blocos:modelBlocks(m.blocos),blocos_origem:m.blocos},conteudo:{schema_version:1,blocos:[]}}});
  for(const [key,tipo,idkey]of [['familias','familia','cod'],['regras','regra','id'],['criterios','criterio','id'],['modelos_documento','documento','tipo']])for(const value of db[key]) {
    const id=value[idkey];const title=value.titulo??value.nome??value.tipo;
    push(tipo==='documento'?'modelo_documento':tipo,id,value,{entidade:'modelos',registro:{titulo:`${value.id??value.cod??''} ${title}`.trim(),tipo,normas:['NR33','NR35'],descricao:value.texto??'',dados:{...value,validacao_normativa:'pendente',ativacao_automatica:false},conteudo:content(value)}});
  }
  const historical = new Map();
  for(const l of db.locais) if(l.levantamento) {
    const lmodel={nome:l.levantamento.modelo,blocos:l.levantamento.blocos??[]};
    const id=`historico-${digest(lmodel).slice(0,24)}`;
    if(!historical.has(id)) {historical.set(id,lmodel);push('modelo_historico',id,lmodel,{entidade:'modelos',registro:{titulo:lmodel.nome||'Roteiro histórico sem nome',tipo:'levantamento',normas:['NR33','NR35'],dados:{...lmodel,blocos:modelBlocks(lmodel.blocos),blocos_origem:lmodel.blocos,origem:'Estrutura efetivamente observada no levantamento',campos_nao_expostos:true},conteudo:{schema_version:1,blocos:[]}}});}
  }
}
else if(phase==='locais') for(const l of db.locais)push('local',`${l.unidade_id}/${l.id}`,l,{entidade:'locais',registro:{...base(l.unidade_id),normas:norms(l),titulo:l.nome,tag:l.tag,tipo:l.tipo,familia:l.familia??'',descricao:l.descricao??'',aliases:[l.tag_campo,l.numeracao_anterior,l.nome_levantamento].filter(x=>typeof x==='string'&&x.length),dados:l},integrar_pet:l.tipo==='EC',localizacao_pet:l.setor||l.acesso||l.nome,autor_historico:l.levantamento?.autor});
else if(phase==='levantamentos') { for(const l of db.locais) if(l.levantamento) {
  const m={nome:l.levantamento.modelo,blocos:l.levantamento.blocos??[]};const mid=`historico-${digest(m).slice(0,24)}`;
  const responses={};
  for(const b of db.modelo_levantamento.blocos)for(const f of b.campos??[]) {
    if(!f.destino)continue;let value=l;for(const k of f.destino.split('.'))value=value?.[k];
    if(value!==undefined)responses[`${b.id}.${f.id}`]=value;
  }
  push('levantamento',`${l.unidade_id}/${l.id}`,{levantamento:l.levantamento,respostas:responses},{entidade:'levantamentos',registro:{...base(l.unidade_id),normas:norms(l),titulo:`Levantamento — ${l.tag} ${l.nome}`.slice(0,240),local_id:localRef(l.unidade_id,l.id),modelo_id:ref('modelo_historico',mid),dados:{...l.levantamento,modelo_legado:true,estado_historico:l.levantamento.situacao,respostas_extraidas_por_caminho:true}},respostas:responses,autor_historico:l.levantamento.autor});
} }
else if(phase==='sistemas') for(const l of db.locais)for(const [family,data]of Object.entries(l.itens??{}))push('sistema',`${l.unidade_id}/${l.id}/${family}`,data,{entidade:'sistemas',registro:{...base(l.unidade_id),normas:norms(l),titulo:`${family} — ${l.tag} ${l.nome}`.slice(0,240),local_id:localRef(l.unidade_id,l.id),tipo:family,descricao:data.justificativa??'',dados:{...data,familia_biblioteca:family,codigo_catalogo:null,validacao_origem:data.validacao,validacao_nexus:'nao_revisado'}},autor_historico:data.atualizado_por});
else if(phase==='documentos') for(const d of db.documentos) {
  const loc=d.local_id?localMap.get(`${d.unidade_id}/${d.local_id}`):null;
  const declared=d.tipo?.includes('PGSSTA')||d.tipo==='PTA'||d.tipo?.includes('altura')?['NR35']:norms(loc);
  push('registro_documental',`${d.unidade_id}/${d.id}`,d,{entidade:'documentos',registro:{...base(d.unidade_id),normas:declared,titulo:d.titulo,tipo:d.tipo,descricao:d.nota??'',local_id:localRef(d.unidade_id,d.local_id),estado:d.estado==='emitido'?'emitido_origem':d.estado==='em_revisao'?'em_revisao':'rascunho',estado_origem:d.estado,recebimento:d.arquivos?.length?'pendente':d.estado==='recebido'?'referencia':'nativo',dados:{numero_origem:d.numero,versao_origem:d.versao,desatualizado:d.desatualizado,faltas:d.faltas,pendencias:d.pendencias,substituido_por:d.substituido_por,origem:d.origem,originais_verificados:false}},revisao:{numero:Math.max(1,Number(String(d.versao??'').replace(/\D/g,''))||1),vigencia:d.substituido_por?'superada':'vigente',conteudo:d.snapshot?content(d.snapshot):{schema_version:1,blocos:[]},snapshot:d.snapshot??d,data_origem:d.emitido_em||d.criado_em||null},autor_historico:d.aprovado_por||null,evidencia:{norma:loc?'Vínculo explícito local da origem':/PGSSTA|^PTA$/.test(d.tipo??'')?'Tipo documental explicitamente de altura':'Contexto inicial NR-33 para organização do acervo; aplicabilidade específica pendente de conferência',conteudo:d.arquivos?.length?'Snapshot estruturado preservado; binários serão vinculados separadamente':'Conversão fiel de valores do snapshot em blocos; não representa arquivo original',associacao_substituida:d.substituido_por?'Não confirmada: origem fornece descrição, sem ID alvo':null}});
}
else if(phase==='pendencias') for(const p of db.pendencias) {
  const closed=p.situacao==='encerrada';const texts=[p.desfecho,p.conclusao,p.encaminhamento].filter(Boolean);
  push('pendencia',`${p.unidade_id}/${p.id}`,p,{entidade:'pendencias',registro:{...base(p.unidade_id),normas:norms(localMap.get(`${p.unidade_id}/${p.local_id}`)),titulo:p.titulo,descricao:p.descricao,local_id:localRef(p.unidade_id,p.local_id),estado:closed?'encerrada':'aberta',criticidade:p.criticidade==='média'?'media':p.criticidade||'a_classificar',dados:p},tratativas:texts.map(text=>({texto:text,autor_historico:p.encerrada_por||p.atualizado_por||p.responsavel||null,data_origem:p.encerrada_em||p.atualizado_em||null})),autor_historico:p.encerrada_por||p.atualizado_por||null});
}
else if(phase==='referencias') for(const r of inventory.references)push('referencia',r.id,r,{entidade:'referencias',registro:{},caminho_original:r.caminho_original??r.url,pai_externo_id:r.associacoes[0]?.pai??null,evidencia:{associacoes:r.associacoes,estado_obtencao:'localizado'},motivo:'Bytes e correspondência são conciliados no inventário de arquivos; não presumidos pelo vínculo.'});
else if(phase==='eventos')for(const [i,event]of db.log.entries())push('evento',`${i}:${digest(event).slice(0,16)}`,event,{entidade:'referencias',registro:{},autor_historico:event.autor,motivo:'Evento histórico integral preservado como fonte privada, sem assinatura Nexus retroativa.'});
else throw Error('Unknown import phase');
const lotId=JSON.parse(await readFile(path.join(directory,'lot.json'),'utf8')).lote_id;
// Reuse the raw value within each statement instead of transmitting large snapshots twice.
// The RPC still receives the exact same normalized destination as the rehearsal.
const statements = rows.map(r=>{
  const destination=structuredClone(r.destino);const setters=[];
  if(destination.registro.dados&&Object.keys(r.payload).every(k=>k in destination.registro.dados)) {
    const rest={...destination.registro.dados};
    for(const [k,value]of Object.entries(r.payload))if(canonical(value)===canonical(rest[k]))delete rest[k];
    delete destination.registro.dados;setters.push(['{registro,dados}',`(s.payload||${json(rest)})`]);
  }
  if(destination.revisao?.snapshot) {delete destination.revisao.snapshot;setters.push(['{revisao,snapshot}',`coalesce(nullif(s.payload->'snapshot','null'::jsonb),s.payload)`]);}
  if(destination.respostas&&canonical(destination.respostas)===canonical(r.payload.respostas)) {delete destination.respostas;setters.push(['{respostas}',`s.payload->'respostas'`]);}
  let transformed=json(destination);for(const [key,value]of setters)transformed=`jsonb_set(${transformed},${q(key)},${value})`;
  return `with s as(select ${json(r.payload)} as payload) select public.nr_importar_item(${q(org)}::uuid,${q(lotId)}::uuid,${q(r.tipo)},${q(r.externo_id)},s.payload,${transformed},${q(r.sha256)},${q(inventory.captured_at)}::timestamptz) as result from s;`;
});
const batches=[];let current='';
for(const s of statements){if(current.length+s.length>480000&&current){batches.push(current);current='';}current+=s+'\n';}if(current)batches.push(current);
await mkdir(path.join(directory,'plans'),{recursive:true,mode:0o700});
await writeFile(path.join(directory,'plans',`${phase}.json`),JSON.stringify({phase,count:rows.length,batches}),{mode:0o600});
console.log(JSON.stringify({phase,count:rows.length,batches:batches.length,bytes:statements.reduce((s,x)=>s+x.length,0)}));
