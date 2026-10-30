/** Offline preparation only. Run with Node + --import tsx; customer bytes remain private. */
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validarBinarioNr} from '../../src/features/nr/files.ts';

const [directory]=process.argv.slice(2);
if(!directory)throw Error('Usage: node --import tsx scripts/nr/prepare-docx-asset-storage.mjs PRIVATE_DIRECTORY');
const root=await realpath(directory),repo=await realpath(process.cwd());
if(root===repo||root.startsWith(repo+path.sep))throw Error('Private migration directory must be outside Git');
const phaseBytes=await readFile(path.join(root,'docx-derived-plans/phase-assets.json'));
const phase=JSON.parse(phaseBytes),records=phase.records;
if(phase.format!=='nexus-docx-derived-plan/1'||phase.converter!=='nr-docx-1.0.1'||!Array.isArray(records))throw Error('Expected final reviewed DOCX conversion plan1.0.1');
const keys=new Set(),verified=[],destinations=[];
for(const record of records){
 const rpc=record.rpc;
 if(rpc?.nome!=='nr_arquivo_importar_preparar'||rpc.args.p_org!==phase.organization_id||rpc.args.p_chave!==record.chave||keys.has(record.chave))throw Error('Unreviewed, duplicate or mismatched asset RPC');
 const meta=rpc.args.p_dados;
 if(meta.papel!=='derivado'||meta.lote_id!==phase.lote_id||meta.origem_metadata?.tipo!=='imagem_extraida_docx'||meta.origem_metadata.converter!==phase.converter)throw Error('Derivative provenance is missing or inconsistent');
 const filename=await realpath(record.local_path);
 if(!filename.startsWith(root+path.sep)||filename.startsWith(repo+path.sep))throw Error('Extracted bytes escaped private staging');
 const bytes=new Uint8Array(await readFile(filename));
 await validarBinarioNr(bytes,{nome:meta.nome,mime:meta.mime,tamanho:meta.tamanho,sha256:meta.sha256});
 keys.add(record.chave);verified.push({chave:record.chave,bytes:bytes.length,mime:meta.mime,sha256:meta.sha256});
 destinations.push({source_id:`docx-asset:${meta.unidade_id}:${meta.sha256}`,chave:record.chave,local_path:filename,metadata:meta});
}
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const sqlFor=items=>`select public.nr_arquivo_importar_preparar((item->>'p_org')::uuid,(item->>'p_chave')::uuid,item->'p_dados')as arquivo from jsonb_array_elements(${q(JSON.stringify(items.map(record=>record.rpc.args)))}::jsonb)with ordinality as r(item,n)order by n;`;
const grouped=[];let current=[];
for(const record of records){
 if(current.length&&(Buffer.byteLength(sqlFor([...current,record]))>100000||current.length>=40)){grouped.push(current);current=[];}
 current.push(record);
 if(Buffer.byteLength(sqlFor(current))>100000)throw Error('Single image request exceeds bounded preparation size');
}
if(current.length)grouped.push(current);
const output=path.join(root,'docx-storage');await mkdir(output,{recursive:true,mode:0o700});
await writeFile(path.join(output,'file-destinations.json'),JSON.stringify({files:destinations,folders:[],unavailable:[]},null,2),{mode:0o600});
const plan={format:'nexus-docx-assets-owner-plan-v1',converter:phase.converter,organization_id:phase.organization_id,lote_id:phase.lote_id,count:records.length,bytes:verified.reduce((sum,r)=>sum+r.bytes,0),phase_sha256:createHash('sha256').update(phaseBytes).digest('hex'),batches:grouped.map(sqlFor),batch_counts:grouped.map(items=>items.length),execution:'prepared_only; no network or database execution'};
await writeFile(path.join(root,'plans/docx-assets-preparar.json'),JSON.stringify(plan),{mode:0o600});
await writeFile(path.join(output,'byte-validation.json'),JSON.stringify({capturado_em:new Date().toISOString(),converter:phase.converter,records:verified},null,2),{mode:0o600});
console.log(JSON.stringify({count:plan.count,bytes:plan.bytes,batches:plan.batches.length,max_batch_bytes:Math.max(...plan.batches.map(b=>Buffer.byteLength(b))),batch_counts:plan.batch_counts,phase_sha256:plan.phase_sha256}));
