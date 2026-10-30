import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {SOURCE,digest} from './inventory.mjs';
const [directory,org,mode='plan']=process.argv.slice(2);
if(!directory||!/^[a-f0-9-]{36}$/.test(org??''))throw Error('Usage: prepare-files.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID [plan]');
const read=async f=>JSON.parse(await readFile(path.join(directory,f),'utf8'));
const db=await read('source-db.json'),inventory=await read('inventory.json'),mappings=await read('mappings.json'),lot=await read('lot.json');
const ids=new Map(mappings.map(m=>[`${m.tipo}:${m.externo_id}`,m.destino_id]));
const units=new Map(db.clientes.flatMap(c=>c.unidades.map(u=>[u.id,{...u,client:c.id}])));
const ref=(t,id)=>ids.get(`${t}:${id}`);
const q=x=>`'${String(x).replaceAll("'","''")}'`;
const j=x=>`${q(JSON.stringify(x))}::jsonb`;
const stableUuid=value=>{const b=createHash('sha256').update(value).digest().subarray(0,16);b[6]=(b[6]&15)|0x50;b[8]=(b[8]&63)|0x80;const s=b.toString('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
function contexts(reference) {
 const out=[];
 for(const a of reference.associacoes??[]) {
  const local=a.caminho_json.match(/^\/locais\/(\d+)\//),doc=a.caminho_json.match(/^\/documentos\/(\d+)\//);
  if(local) {const l=db.locais[Number(local[1])];out.push({unit:l.unidade_id,local_externo:`${l.unidade_id}/${l.id}`,normas:l.tipo==='ALTURA'?['NR35']:['NR33'],evidencia:a.caminho_json});}
  if(doc) {const d=db.documentos[Number(doc[1])];out.push({unit:d.unidade_id,doc_externo:`${d.unidade_id}/${d.id}`,local_externo:d.local_id?`${d.unidade_id}/${d.local_id}`:null,normas:d.tipo==='PGSSTA'||d.tipo==='PTA'?['NR35']:['NR33'],evidencia:a.caminho_json});}
 }
 return [...new Map(out.map(x=>[JSON.stringify(x),x])).values()];
}
const references=new Map(inventory.references.filter(r=>r.external_id).map(r=>[r.external_id,r]));
const edges=await read('folder-edges.json');
const folders=[];
for(const filename of await readdir(path.join(directory,'folders'))) {
 const f=await read(`folders/${filename}`);const contextsForFolder=contexts(references.get(f.id)??{});
 for(const unit of new Set(contextsForFolder.map(c=>c.unit))) {
  const rows=contextsForFolder.filter(c=>c.unit===unit);const title=f.metadata?.title||f.id;
  folders.push({tipo:'pasta_origem',externo_id:`${unit}/drive:${f.id}`,payload:f,destino:{entidade:'pastas',registro:{cliente_id:ref('cliente',units.get(unit).client),unidade_id:ref('unidade',unit),normas:[...new Set(rows.flatMap(c=>c.normas))],titulo:title.slice(0,240),dados:{drive_id:f.id,ancestral_nao_exposto:true,origem:SOURCE,relacao_confirmada:rows}},caminho_original:`drive:folder:${f.id}`,evidencia:{metodo:'Metadados e enumeração oficial de pasta explicitamente vinculada na origem',ancestrais:'Não expostos; pasta representada na raiz de destino sem inventar ancestrais'}},sha256:digest(f)});
 }
}
const files=[];const unavailable=[];
for(const filename of await readdir(path.join(directory,'originals')))if(filename.endsWith('.json')) {
 const file=await read(`originals/${filename}`);
 if(file.estado!=='validado'){unavailable.push({id:file.id,estado:file.estado,motivo:file.motivo});continue;}
 const direct=contexts(references.get(file.id)??{});
 const parents=edges.filter(e=>e.child_id===file.id);
 const related=parents.flatMap(edge=>contexts(references.get(edge.parent_id)??{}).map(c=>({...c,pasta_externa:`${c.unit}/drive:${edge.parent_id}`,evidencia:`${c.evidencia} → Drive list_folder ${edge.parent_id}/${file.id}`})));
 const bindings=[...new Map([...direct,...related].map(c=>[JSON.stringify(c),c])).values()];
 if(!bindings.length){unavailable.push({id:file.id,estado:'sem_correspondencia',motivo:'Nenhum vínculo explícito de cliente/unidade; não associado por nome ou TAG.'});continue;}
 for(const unit of new Set(bindings.map(b=>b.unit))) {
  const links=bindings.filter(b=>b.unit===unit);const first=links.find(b=>b.local_externo&&ref('local',b.local_externo))??links[0];
  const metadata={cliente_id:ref('cliente',units.get(unit).client),unidade_id:ref('unidade',unit),normas:[...new Set(links.flatMap(b=>b.normas))],nome:file.name,mime:file.mime_detectado,tamanho:file.bytes,sha256:file.sha256,papel:file.mime_detectado.startsWith('image/')?'foto':'original',lote_id:lot.lote_id,origem_metadata:{sistema:SOURCE,drive_id:file.id,snapshot_sha256:inventory.snapshot_sha256,originais_anteriores:'Não presumidos; consultar inventário de revisões',vinculos_explicitos:links}};
  if(first.local_externo&&ref('local',first.local_externo))metadata.local_id=ref('local',first.local_externo);
  if(first.pasta_externa&&ref('pasta_origem',first.pasta_externa))metadata.pasta_id=ref('pasta_origem',first.pasta_externa);
  files.push({source_id:file.id,source_unit:unit,chave:stableUuid(`${SOURCE}|${file.id}|${unit}|${file.sha256}`),local_path:file.path,metadata,bindings:links});
 }
}
function batches(statements,max=250000) {const out=[];let current='';for(const s of statements){if(current.length+s.length>max&&current){out.push(current);current='';}current+=s+'\n';}if(current)out.push(current);return out;}
const folderSql=folders.map(f=>`select public.nr_importar_item(${q(org)}::uuid,${q(lot.lote_id)}::uuid,${q(f.tipo)},${q(f.externo_id)},${j(f.payload)},${j(f.destino)},${q(f.sha256)},${q(inventory.captured_at)}::timestamptz)as result;`);
const fileSql=files.map(f=>`select public.nr_arquivo_importar_preparar(${q(org)}::uuid,${q(f.chave)}::uuid,${j(f.metadata)})as arquivo;`);
await mkdir(path.join(directory,'plans'),{recursive:true,mode:0o700});
await writeFile(path.join(directory,'file-destinations.json'),JSON.stringify({files,folders,unavailable},null,2),{mode:0o600});
await writeFile(path.join(directory,'plans','pastas-origem.json'),JSON.stringify({count:folders.length,batches:batches(folderSql)}),{mode:0o600});
await writeFile(path.join(directory,'plans','arquivos-preparar.json'),JSON.stringify({count:files.length,batches:batches(fileSql)}),{mode:0o600});
console.log(JSON.stringify({mode,folders:folders.length,files:files.length,unavailable:unavailable.length,original_bytes:files.reduce((n,f)=>n+f.metadata.tamanho,0),duplicate_context_objects:files.length-new Set(files.map(f=>f.source_id)).size}));
