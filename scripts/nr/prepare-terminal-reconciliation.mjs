/** Prepare owner-only reconciliation DML; never connects to a database or network. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {SOURCE,digest} from './inventory.mjs';

const [directory,organization]=process.argv.slice(2);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if(!directory||!uuid.test(organization??''))throw Error('Usage: prepare-terminal-reconciliation.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID');
const root=path.resolve(directory);
if(root.startsWith(path.resolve(process.cwd())+path.sep))throw Error('Customer payloads and DML plans must remain outside Git');
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const db=await read('source-db.json'),inventory=await read('inventory.json'),lot=await read('lot.json');
const destinations=await read('file-destinations.json'),prepared=await read('storage-prepared.json');
const mappings=await read('mappings.json'),revisions=await read('revisions-reconciliation.json');
if(!uuid.test(lot.lote_id??''))throw Error('Missing imported lot UUID');
const q=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`;
const json=value=>`${q(JSON.stringify(value))}::jsonb`;
function doBlock(body,prefix='nr_reconcile'){
 let index=0;while(body.includes(`$${prefix}_${index}$`))index++;
 const delimiter=`$${prefix}_${index}$`;return`do ${delimiter}\n${body}\n${delimiter};`;
}
const ids=new Map(mappings.map(m=>[`${m.tipo}:${m.externo_id}`,m.destino_id]));
const byKey=new Map(prepared.map(row=>[row.chave,row]));
const bySource=new Map();
for(const file of destinations.files){
 const row=byKey.get(file.chave);
 if(!row||!uuid.test(row.id??'')||row.sha256!==file.metadata.sha256||Number(row.tamanho)!==Number(file.metadata.tamanho))throw Error(`Unverified prepared target for source ID ${file.source_id}`);
 const expected={arquivo_id:row.id,cliente_id:row.cliente_id,unidade_id:row.unidade_id,sha256:row.sha256,tamanho:Number(row.tamanho),mime:row.mime,caminho:row.caminho,source_unit:file.source_unit};
 bySource.set(file.source_id,[...(bySource.get(file.source_id)??[]),expected]);
}
const planDir=path.join(root,'plans');await mkdir(planDir,{recursive:true,mode:0o700});
function batches(statements,max=400000){
 const result=[];let current='';
 for(const statement of statements){
  if(Buffer.byteLength(statement)>max)throw Error('One reconciliation item exceeds the maximum batch size');
  if(current&&Buffer.byteLength(current)+Buffer.byteLength(statement)+1>max){result.push(current);current='';}
  current+=statement+'\n';
 }
 if(current)result.push(current);return result;
}
async function save(name,phase,statements,extra={}){
 const chunks=batches(statements);
 const report={format:'nexus-owner-reconciliation-plan-v1',phase,organization_id:organization,lote_id:lot.lote_id,count:statements.length,execution:'PREPARED_ONLY; requires authorized owner execution',...extra,batches:chunks};
 await writeFile(path.join(planDir,name+'.json'),JSON.stringify(report),{mode:0o600});
 return{phase,count:statements.length,batches:chunks.length,max_batch_bytes:Math.max(0,...chunks.map(x=>Buffer.byteLength(x))),path:path.join(planDir,name+'.json')};
}

const historical=revisions.records.filter(r=>!r.head&&r.keep_forever===false);
const historicalStatements=historical.map(record=>{
 const contexts=bySource.get(record.file_id)??[];
 if(!contexts.length)throw Error(`No confirmed source/context mapping for historical file ${record.file_id}`);
 const contextKeys=new Map(contexts.map(c=>[`${c.cliente_id}/${c.unidade_id}`,c]));
 const context=contextKeys.size===1?[...contextKeys.values()][0]:null;
 const external=record.file_id+'/'+record.revision_id;
 const reason='Bytes da revisão histórica indisponíveis pela API Google Drive: keepForever=false. Download de amostra retornou403. Metadados preservados; nenhuma retenção foi alterada e nenhum original foi reconstruído.';
 const evidence={sistema:SOURCE,drive_file_id:record.file_id,drive_revision_id:record.revision_id,keepForever:false,official_download_policy:revisions.summary.official_download_policy,sampled_download:'403 FORBIDDEN',historical_bytes:false,head_bytes_separate:true,contextos:contexts.map(c=>({arquivo_id:c.arquivo_id,cliente_id:c.cliente_id,unidade_id:c.unidade_id,unidade_origem:c.source_unit})),snapshot_sha256:inventory.snapshot_sha256};
 const destination={entidade:'referencias',registro:{},pai_externo_id:'drive:'+record.file_id,caminho_original:'drive:revision:'+external,autor_historico:record.last_modifying_user?.displayName??null,motivo:reason,evidencia:evidence};
 return doBlock(`declare imported_result jsonb;begin
select public.nr_importar_item(${q(organization)}::uuid,${q(lot.lote_id)}::uuid,'versao_arquivo',${q(external)},${json(record)},${json(destination)},${q(digest(record))},${q(record.capturado_em)}::timestamptz) into imported_result;
update public.nr_import_itens i set resultado='indisponivel',motivo=${q(reason)},cliente_id=${q(context?.cliente_id)}::uuid,unidade_id=${q(context?.unidade_id)}::uuid,evidencia=i.evidencia||${json(evidence)},updated_at=clock_timestamp()
where i.organization_id=${q(organization)}::uuid and i.lote_id=${q(lot.lote_id)}::uuid and i.id=(imported_result->>'item_id')::uuid and imported_result->>'resultado' in('sem_correspondencia','ja_existente');
end;`,'nr_revision');
});
const historicalPlan=await save('revisoes-historicas','historical_revision_metadata',historicalStatements,{source_revisions:550,binary_downloads:0,terminal_result:'indisponivel',precondition:'Existing lot and all source-file context mappings; this plan never marks a historical binary as obtained.'});

const referenceStatements=[];
let directFiles=0,folders=0;
for(const ref of inventory.references.filter(r=>r.external_id)){
 if(ref.tipo==='pasta'){
  const folderTargets=destinations.folders.filter(f=>f.payload.id===ref.external_id).map(f=>({pasta_id:ids.get(`${f.tipo}:${f.externo_id}`),cliente_id:f.destino.registro.cliente_id,unidade_id:f.destino.registro.unidade_id,externo_id:f.externo_id}));
  if(!folderTargets.length||folderTargets.some(f=>!uuid.test(f.pasta_id??'')))throw Error(`Unresolved source folder identity: ${ref.external_id}`);
  const evidence={sistema:SOURCE,drive_folder_id:ref.external_id,pastas_nexus:folderTargets,metodo:'ID externo de pasta e enumeração oficial; nenhuma ancestralidade foi inferida.',arquivos_filhos:'Verificações independentes; importar a pasta não confirma bytes dos filhos.'};
  referenceStatements.push(`update public.nr_import_itens i set resultado='importado',destino_tipo='pastas',destino_id=${q(folderTargets[0].pasta_id)}::uuid,motivo='Pasta de origem enumerada e persistida por ID estável; identidades dos filhos preservadas.',evidencia=i.evidencia||${json(evidence)},updated_at=clock_timestamp()
where i.organization_id=${q(organization)}::uuid and i.lote_id=${q(lot.lote_id)}::uuid and i.tipo='referencia' and i.externo_id=${q(ref.id)}
and not exists(select1 from jsonb_array_elements(${json(folderTargets)}) t left join public.nr_pastas p on p.organization_id=i.organization_id and p.id=(t->>'pasta_id')::uuid and p.cliente_id=(t->>'cliente_id')::uuid and p.unidade_id=(t->>'unidade_id')::uuid and p.dados->>'drive_id'=${q(ref.external_id)} where p.id is null) returning i.id,i.resultado;`.replace('select1','select 1'));
  folders++;
 }else{
  const targets=bySource.get(ref.external_id);
  if(!targets?.length)throw Error(`Unresolved source file identity: ${ref.external_id}`);
  const evidence={sistema:SOURCE,drive_file_id:ref.external_id,arquivos_nexus:targets,metodo:'Drive file ID → chave de preparação → arquivo Nexus; bytes confirmados pela pipeline privada.',link_nao_constitui_migracao:true};
  referenceStatements.push(`update public.nr_import_itens i set resultado='importado',destino_tipo='arquivos',destino_id=${q(targets[0].arquivo_id)}::uuid,motivo='Original com bytes verificados e confirmado no Storage privado do Nexus.',evidencia=i.evidencia||${json(evidence)},updated_at=clock_timestamp()
where i.organization_id=${q(organization)}::uuid and i.lote_id=${q(lot.lote_id)}::uuid and i.tipo='referencia' and i.externo_id=${q(ref.id)}
and not exists(select 1 from jsonb_array_elements(${json(targets)}) t
left join public.nr_arquivos a on a.organization_id=i.organization_id and a.id=(t->>'arquivo_id')::uuid and a.cliente_id=(t->>'cliente_id')::uuid and a.unidade_id=(t->>'unidade_id')::uuid
left join storage.objects o on o.bucket_id='nexus-nr-acervo' and o.name=a.caminho
where a.id is null or a.estado is distinct from 'vinculado' or a.bytes_verificados is distinct from true or a.confirmado_em is null or a.sha256 is distinct from t->>'sha256' or a.tamanho is distinct from (t->>'tamanho')::bigint or a.mime is distinct from t->>'mime' or a.caminho is distinct from t->>'caminho' or o.id is null or o.metadata->>'size' is distinct from t->>'tamanho' or o.metadata->>'mimetype' is distinct from t->>'mime') returning i.id,i.resultado;`);
  directFiles++;
 }
}
const referencePlan=await save('referencias-pos-storage','source_references_after_storage',referenceStatements,{direct_file_references:directFiles,folder_references:folders,image_paths_left_pending:inventory.references.filter(r=>r.tipo==='foto').length,precondition:'Execute only after actual uploads and canonical confirmation. Each file update independently guards linked state, hash, size, MIME, scope and Storage metadata. Unconfirmed files update zero rows.'});

function stableUuid(value){const bytes=createHash('sha256').update(value).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;const s=bytes.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
const eventStatements=db.log.map((event,index)=>{
 const external=index+':'+digest(event).slice(0,16),id=stableUuid(`${organization}|${SOURCE}|evento|${external}`);
 const payload={sistema:SOURCE,tipo:'evento',externo_id:external,payload_origem:event,data_historica_original:event.data,interpretacao_data:'texto original preservado; nenhum fuso ou instante foi inferido',lote_id:lot.lote_id,snapshot_sha256:inventory.snapshot_sha256,identidade:'posição original no log + hash canônico; UUID determinístico por organização e origem'};
 return doBlock(`begin
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${q('nr-event:'+organization+':'+id)},0));
insert into public.nr_historico(organization_id,recurso,registro_id,comando,depois,motivo,autor_historico)
select ${q(organization)}::uuid,'eventos_origem',${q(id)}::uuid,'importar_evento_origem',${json(payload)},'Evento histórico importado; created_at registra a captura Nexus, data da origem permanece no payload.',${q(event.autor)}
where not exists(select 1 from public.nr_historico where organization_id=${q(organization)}::uuid and recurso='eventos_origem' and registro_id=${q(id)}::uuid and comando='importar_evento_origem');
update public.nr_import_itens i set resultado='importado',destino_tipo='historico',destino_id=${q(id)}::uuid,motivo='Evento de origem preservado integralmente no histórico; sem autoria Auth ou aprovação retroativa.',evidencia=i.evidencia||jsonb_build_object('registro_historico_uuid',${q(id)},'historico_id',(select h.id from public.nr_historico h where h.organization_id=i.organization_id and h.registro_id=${q(id)}::uuid and h.recurso='eventos_origem' and h.comando='importar_evento_origem' limit 1),'data_historica_original',${q(event.data)},'sem_fuso_inferido',true),updated_at=clock_timestamp()
where i.organization_id=${q(organization)}::uuid and i.lote_id=${q(lot.lote_id)}::uuid and i.tipo='evento' and i.externo_id=${q(external)};
end;`,'nr_event');
});
const eventPlan=await save('eventos-historicos','source_event_history',eventStatements,{historical_date_interpretation:'Original string only; no timezone inference.',idempotency:'Deterministic registro_id UUID + advisory lock + current existence check; no Auth accounts.'});
const summary={capturado_em:new Date().toISOString(),execution:'prepared_only',plans:[historicalPlan,referencePlan,eventPlan],historical_revisions:historical.length,direct_files:directFiles,folders,images_left_pending:490,events:db.log.length};
await writeFile(path.join(root,'terminal-reconciliation-plan-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
console.log(JSON.stringify(summary));
