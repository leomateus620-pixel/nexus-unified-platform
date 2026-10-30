import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('Usage: reconcile-revisions.mjs PRIVATE_STAGING_DIRECTORY');
const root=path.resolve(directory);
if(root.startsWith(path.resolve(process.cwd())+path.sep))throw Error('Revision provenance must remain private');
const policy='https://developers.google.com/workspace/drive/api/guides/manage-downloads';
const records=[],failures=[];
for(const file of await readdir(path.join(root,'revisions')))if(file.endsWith('.json')){
 const value=JSON.parse(await readFile(path.join(root,'revisions',file),'utf8'));
 if(value.listing_state==='erro'){failures.push({file_id:value.file_id,error_code:value.error_code});continue;}
 const head=JSON.parse(await readFile(path.join(root,'originals',value.file_id+'.json'),'utf8'));
 const listing=value.listing??{},current=listing.currentRevisionId;
 for(const revision of listing.revisions??[]){
  const isHead=revision.id===current;
  const record={file_id:value.file_id,revision_id:revision.id,mime:revision.mimeType,size:revision.size,modified_time:revision.modifiedTime,keep_forever:revision.keepForever,original_filename:revision.originalFilename,last_modifying_user:revision.lastModifyingUser,capturado_em:value.captured_at,head:isHead};
  if(isHead){record.estado=head.estado==='validado'?'head_obtido':'head_pendente';record.sha256=head.sha256;record.bytes=head.bytes;}
  else if(revision.keepForever===false){record.estado='bloqueado_api_retencao';record.motivo='A API Drive somente permite baixar revisões binárias históricas marcadas Keep Forever. Nenhuma retenção foi alterada.';record.fonte_limitacao=policy;}
  else if(revision.keepForever===true){record.estado='pendente_download_elegivel';}
  else{record.estado='identificado_nao_obtido';record.motivo='A API não expôs a condição de download desta revisão.';}
  records.push(record);
 }
}
const heads=(await readdir(path.join(root,'originals'))).filter(x=>x.endsWith('.json')).length;
const summary={format:'nexus-nr-drive-revisions-v1',capturado_em:new Date().toISOString(),head_files:heads,files_revision_metadata:(await readdir(path.join(root,'revisions'))).filter(x=>x.endsWith('.json')).length,metadata_failures:failures.length,revisions_exposed:records.length,head_revisions:records.filter(x=>x.head).length,historical_revisions:records.filter(x=>!x.head).length,historical_binary_downloads:0,states:records.reduce((out,x)=>(out[x.estado]=(out[x.estado]??0)+1,out),{}),official_download_policy:policy,sampled_historical_download:'403 FORBIDDEN from fetch_file_revision; evidence retained privately',limitations:['Metadata enumeration does not constitute historical binary preservation.','Keep Forever was not changed: the authorized Drive workflow is read-only.']};
await writeFile(path.join(root,'revisions-reconciliation.json'),JSON.stringify({summary,records,failures},null,2),{mode:0o600});
await writeFile(path.join(root,'revisions-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
console.log(JSON.stringify(summary));
