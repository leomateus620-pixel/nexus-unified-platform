import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {SOURCE,digest} from '../../scripts/nr/inventory.mjs';

// Optional source-backed rehearsal. Private input is never a repository fixture.
if(process.env.PGTEST_EPHEMERAL!=='1'||process.env.PGTEST_HOST!=='127.0.0.1'||!/^\d{4,5}$/.test(process.env.PGTEST_PORT??'')||process.env.PGTEST_PORT==='5432')throw Error('Disposable loopback PostgreSQL required');
const root=path.resolve(process.argv[2]??'');
if(!process.argv[2]||root.startsWith(path.resolve(process.cwd())+path.sep))throw Error('Pass the private migration directory outside Git');
const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const db=await read('source-db.json'),inv=await read('inventory.json'),maps=await read('mappings.json');
const dest=await read('file-destinations.json'),files=await read('storage-prepared.json'),lot=await read('lot.json');
const org=files[0].caminho.split('/')[0],ids=new Map(maps.map(m=>[m.tipo+':'+m.externo_id,m.destino_id]));
const sql=postgres({host:'127.0.0.1',port:Number(process.env.PGTEST_PORT),user:'postgres',database:process.env.PGTEST_DATABASE||'postgres',max:1,prepare:false,onnotice:()=>{}});
const plans=await Promise.all(['revisoes-historicas','referencias-pos-storage','eventos-historicos'].map(name=>read('plans/'+name+'.json')));
const documentRevisions=await read('document-revisions.json').catch(()=>[]);
const linkPlan=await read('plans/arquivos-vincular.json').catch(()=>null);
const receiptPlan=await read('plans/durable-storage-receipts.json').catch(()=>null);
const imageAssets=receiptPlan?await read('docx-assets-prepared.json'):[];
const sourceContextPlan=await read('plans/contexto-origem.json').catch(()=>null);
const rollback=Symbol('rollback');let report;
try{
 assert.equal((await sql`select count(*)::int n from public.organizations where id=${org}`)[0].n,0,'Rehearsal never alters an existing organization');
 await sql.begin(async tx=>{
  await tx`insert into public.organizations(id,nome)values(${org},'Private terminal rehearsal - rollback')`;
  for(const c of db.clientes){
   const id=ids.get('cliente:'+c.id);await tx`insert into public.clientes(id,organization_id,razao_social)values(${id},${org},${c.razao_social})`;
   for(const u of c.unidades)await tx`insert into public.unidades(id,organization_id,cliente_id,nome)values(${ids.get('unidade:'+u.id)},${org},${id},${u.nome})`;
  }
  await tx`insert into public.nr_import_lotes(id,organization_id,origem,chave,estado)values(${lot.lote_id},${org},${SOURCE},'isolated-terminal-rehearsal','staging')`;
  const units=new Map(db.clientes.flatMap(c=>c.unidades.map(u=>[u.id,{...u,client:c.id}])));
  for(const l of db.locais){
   const unit=units.get(l.unidade_id);
   await tx`insert into public.nr_locais(id,organization_id,cliente_id,unidade_id,normas,titulo,tag)values(${ids.get('local:'+l.unidade_id+'/'+l.id)},${org},${ids.get('cliente:'+unit.client)},${ids.get('unidade:'+unit.id)},${tx.array(l.tipo==='ALTURA'?['NR35']:['NR33'])},${l.nome},${l.tag})`;
  }
  for(const f of dest.folders){
   const d=f.destino.registro;
   await tx`insert into public.nr_pastas(id,organization_id,cliente_id,unidade_id,normas,titulo,dados)values(${ids.get(f.tipo+':'+f.externo_id)},${org},${d.cliente_id},${d.unidade_id},${tx.array(d.normas)},${d.titulo},${tx.json(d.dados)})`;
  }
  if(linkPlan){
   const revisions=new Map(documentRevisions.map(r=>[r.id,r.revisao_atual_id]));
   for(const doc of db.documentos){
    const id=ids.get('registro_documental:'+doc.unidade_id+'/'+doc.id),revision=revisions.get(id),unit=units.get(doc.unidade_id);
    assert.ok(id&&revision,'Document and current revision must use the captured Nexus IDs');
    await tx`insert into public.nr_documentos(id,organization_id,cliente_id,unidade_id,normas,titulo,estado)values(${id},${org},${ids.get('cliente:'+unit.client)},${ids.get('unidade:'+unit.id)},${tx.array(doc.tipo==='PGSSTA'||doc.tipo==='PTA'?['NR35']:['NR33'])},${doc.titulo},${doc.estado==='emitido'?'emitido_origem':'rascunho'})`;
    await tx`insert into public.nr_documento_revisoes(id,organization_id,documento_id,numero,estado,vigencia)values(${revision},${org},${id},1,${doc.estado==='emitido'?'emitido_origem':'rascunho'},${doc.substituido_por?'superada':'vigente'})`;
    await tx`update public.nr_documentos set revisao_atual_id=${revision} where id=${id}`;
   }
  }
  for(const r of inv.references)await tx`insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,payload,sha256,resultado,capturado_em)values(${org},${lot.lote_id},${SOURCE},'referencia',${r.id},${tx.json(r)},${digest(r)},'sem_correspondencia',${inv.captured_at})`;
  for(const[i,e]of db.log.entries())await tx`insert into public.nr_import_itens(organization_id,lote_id,origem,tipo,externo_id,payload,sha256,resultado,capturado_em)values(${org},${lot.lote_id},${SOURCE},'evento',${i+':'+digest(e).slice(0,16)},${tx.json(e)},${digest(e)},'sem_correspondencia',${inv.captured_at})`;
  const byKey=new Map(dest.files.map(f=>[f.chave,f]));
  for(const f of files){
   const m=byKey.get(f.chave).metadata,ext=f.caminho.split('.').at(-1);
   await tx`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,local_id,pasta_id,lote_id,nome,mime,extensao,tamanho,sha256,caminho,papel,origem,origem_metadata,chave,request_hash)values(${f.id},${org},${f.cliente_id},${f.unidade_id},${tx.array(m.normas)},${f.local_id},${f.pasta_id},${lot.lote_id},${f.nome},${f.mime},${ext},${f.tamanho},${f.sha256},${f.caminho},${m.papel},'importacao',${tx.json(m.origem_metadata)},${f.chave},${digest(m)})`;
  }
  if(linkPlan){
   for(const batch of linkPlan.batches)await tx.unsafe(batch);
   for(const batch of linkPlan.batches)await tx.unsafe(batch);
   assert.equal((await tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org}`)[0].n,linkPlan.count);
   assert.equal((await tx`select count(*)::int n from public.nr_arquivo_vinculos where organization_id=${org} and documento_id is not null`)[0].n,130);
  }
  for(const batch of plans[0].batches)await tx.unsafe(batch);
  for(const batch of plans[0].batches)await tx.unsafe(batch);
  assert.equal((await tx`select count(*)::int n from public.nr_import_itens where organization_id=${org} and tipo='versao_arquivo' and resultado='indisponivel'`)[0].n,550);
  for(const batch of plans[1].batches)await tx.unsafe(batch);
  assert.equal((await tx`select count(*)::int n from public.nr_import_itens where organization_id=${org} and tipo='referencia' and externo_id like 'drive:%' and resultado='importado'`)[0].n,60,'Unconfirmed file metadata cannot become imported; only persisted folders reconcile');
  for(const f of files){
   await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${f.caminho},${tx.json({size:f.tamanho,mimetype:f.mime})})`;
   await tx`update public.nr_arquivos set estado='vinculado',bytes_verificados=true,verificado_em=now(),confirmado_em=now()where id=${f.id}`;
  }
  const badRef=inv.references.find(r=>r.external_id&&r.tipo!=='pasta'),badSource=dest.files.find(f=>f.source_id===badRef.external_id),bad=files.find(f=>f.chave===badSource.chave);
  await tx`update storage.objects set metadata=jsonb_set(metadata,'{size}','1')where name=${bad.caminho}`;
  for(const batch of plans[1].batches)await tx.unsafe(batch);
  assert.equal((await tx`select resultado from public.nr_import_itens where organization_id=${org} and tipo='referencia' and externo_id=${badRef.id}`)[0].resultado,'sem_correspondencia','Divergent Storage metadata cannot reconcile a file');
  await tx`update storage.objects set metadata=jsonb_set(metadata,'{size}',${tx.json(bad.tamanho)})where name=${bad.caminho}`;
  for(const batch of plans[1].batches)await tx.unsafe(batch);
  assert.equal((await tx`select count(*)::int n from public.nr_import_itens where organization_id=${org} and tipo='referencia' and resultado='importado'`)[0].n,525);
  assert.equal((await tx`select count(*)::int n from public.nr_import_itens where organization_id=${org} and tipo='referencia' and resultado='sem_correspondencia'`)[0].n,490);
  for(const batch of plans[2].batches)await tx.unsafe(batch);
  for(const batch of plans[2].batches)await tx.unsafe(batch);
  assert.equal((await tx`select count(*)::int n from public.nr_historico where organization_id=${org} and recurso='eventos_origem'`)[0].n,9);
  assert.equal((await tx`select count(*)::int n from public.nr_import_itens where organization_id=${org} and tipo='evento' and resultado='importado'`)[0].n,9);
  if(receiptPlan){
   await assert.rejects(()=>tx.savepoint(sp=>sp.unsafe(receiptPlan.batches[0])),error=>error.code==='55000','Aggregate receipt requires an existing per-file confirmation audit');
   await assert.rejects(()=>tx.savepoint(sp=>sp.unsafe(receiptPlan.batches[1])),error=>error.code==='55000','Aggregate image receipt cannot precede confirmed image rows');
   for(const a of imageAssets){
    await tx`insert into public.nr_arquivos(id,organization_id,cliente_id,unidade_id,normas,local_id,pasta_id,lote_id,nome,mime,extensao,tamanho,sha256,caminho,papel,origem,origem_metadata,chave,request_hash,estado,bytes_verificados,verificado_em,confirmado_em)values(${a.id},${org},${a.cliente_id},${a.unidade_id},${tx.array(a.normas)},${a.local_id},${a.pasta_id},${lot.lote_id},${a.nome},${a.mime},${a.extensao},${a.tamanho},${a.sha256},${a.caminho},'derivado','importacao',${tx.json(a.origem_metadata)},${a.chave},${a.request_hash},'vinculado',true,now(),now())`;
    await tx`insert into storage.objects(bucket_id,name,metadata)values('nexus-nr-acervo',${a.caminho},${tx.json({size:a.tamanho,mimetype:a.mime})})`;
   }
   await tx`insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,motivo)select organization_id,'arquivos',id,'bytes_verificados',to_jsonb(a),'Isolated confirmation fixture; no remote HTTP request'from public.nr_arquivos a where organization_id=${org}`;
   for(const batch of receiptPlan.batches)await tx.unsafe(batch);
   for(const batch of receiptPlan.batches)await tx.unsafe(batch);
   const receipts=await tx`select depois from public.nr_historico where organization_id=${org} and recurso='recibos_storage'`;
   assert.equal(receipts.length,2);
   for(const row of receipts){
    const snapshot=row.depois,order=snapshot.canonicalization.field_order;
    const reconstructed=snapshot.expected_metadata_records.map(record=>Object.fromEntries(order.map(key=>[key,record[key]])));
    assert.equal(createHash('sha256').update(JSON.stringify(reconstructed)).digest('hex'),snapshot.canonical_sha256,'JSONB recordset and declared field order reproduce the retained canonical hash');
    assert.equal(snapshot.HTTP_verbose_provenance.per_file_HTTP_timestamps,null);
    assert.equal(snapshot.per_file_HTTP_timestamps_reconstructed,false);
   }
  }
  if(sourceContextPlan){
   for(const batch of sourceContextPlan.batches)await tx.unsafe(batch);
   for(const batch of sourceContextPlan.batches)await tx.unsafe(batch);
   assert.equal((await tx`select count(*)::integer n from public.nr_fontes where organization_id=${org} and tipo='contexto_origem'`)[0].n,4);
   assert.equal((await tx`select count(*)::integer n from public.nr_import_itens where organization_id=${org} and tipo='contexto_origem' and resultado='importado' and capturado_em=${inv.captured_at}`)[0].n,4);
  }
  report={capturado_em:new Date().toISOString(),passed:true,isolated:true,transaction_rolled_back:true,historical_metadata_indisponivel:550,historical_identical_retry_no_duplicates:true,unconfirmed_files_not_marked_imported:true,storage_metadata_mismatch_not_marked_imported:true,reconciled_source_references:525,image_paths_unchanged_pending:490,historical_events:9,historical_event_retry_no_duplicates:true,...(linkPlan?{file_junctions:linkPlan.count,known_issued_document_links:130,file_junction_retry_no_duplicates:true}:{}),...(receiptPlan?{durable_storage_receipts:2,receipts_require_per_file_database_audit:true,receipt_retry_no_duplicates:true,canonical_hash_reproduced_after_JSONB_roundtrip:true,HTTP_timestamps_not_reconstructed:true}:{}),...(sourceContextPlan?{source_context_metadata:4,context_retry_no_duplicates:true,original_capture_timestamp_preserved:true}:{}),limites:'Storage metadata simulated only in disposable fixtures; this rehearsal does not prove remote uploaded bytes.'};
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}
finally{await sql.end({timeout:3});}
await writeFile('docs/nr/evidencias/terminal-reconciliation-test.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
