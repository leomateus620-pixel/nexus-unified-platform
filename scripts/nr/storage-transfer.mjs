#!/usr/bin/env node
/** Authorized maintenance receiver: only declared private targets, immutable upload + byte readback. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import path from 'node:path';

const [archive,expectedArchiveHash,reportPath]=process.argv.slice(2);
if(!archive||!reportPath||!/^[a-f0-9]{64}$/.test(expectedArchiveHash??''))throw Error('Usage: storage-transfer.mjs PRIVATE_ZIP ARCHIVE_SHA256 PRIVATE_REPORT_JSON');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Integração não configurada: credenciais de servidor ausentes. Nenhuma chave deve ser exibida em logs.');
if(new URL(url).hostname!=='yhtgijtllvgzoqtfcgal.supabase.co')throw Error('Projeto Supabase diferente do destino confirmado. Nenhum envio realizado.');
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(archive);
if(sha(raw)!==expectedArchiveHash||raw.length>50*1024*1024)throw Error('Arquivo de transferência diverge do pacote autorizado.');
const entries=unzipSync(raw),manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json']));
if(manifest.format!=='nexus-private-storage-part/1')throw Error('Manifesto desconhecido.');
const allowed=new Set(['manifest.json','README.txt',...manifest.objects.map(o=>o.entry)]);
if(Object.keys(entries).some(n=>!allowed.has(n)))throw Error('Entrada não declarada no pacote.');
for(const object of manifest.objects){const bytes=entries[object.entry];if(!bytes||bytes.length!==object.tamanho||sha(bytes)!==object.sha256)throw Error('Bytes do objeto não conferem com o manifesto.');}
const targetPaths=new Set();
const MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
for(const file of manifest.files){
 if(file.bucket!=='nexus-nr-acervo'||!/^abab473b-8baa-4781-aed2-c1243338af65\/acervo\/[a-f0-9-]{36}\.(pdf|docx|xlsx|jpe?g|png|webp)$/.test(file.caminho)||!MIME.has(file.mime)||targetPaths.has(file.caminho))throw Error('Destino inválido ou repetido.');
 if(!manifest.objects.some(o=>o.entry===file.entry&&o.sha256===file.sha256&&o.tamanho===file.tamanho&&o.mime===file.mime))throw Error('Destino sem objeto validado.');
 targetPaths.add(file.caminho);
}
const headers={apikey:key,...(key.startsWith('sb_')?{}:{Authorization:`Bearer ${key}`})};
const endpoint=(file,authenticated=false)=>`${url.replace(/\/$/,'')}/storage/v1/object/${authenticated?'authenticated/':''}${file.bucket}/${file.caminho.split('/').map(encodeURIComponent).join('/')}`;
const transient=s=>[408,429,500,502,503,504].includes(s);
async function request(file,method,bytes){
 for(let attempt=0;attempt<4;attempt++){
  try{const result=await fetch(endpoint(file,method==='GET'),{method,headers:{...headers,...(method==='POST'?{'Content-Type':file.mime,'x-upsert':'false'}:{})},body:bytes,signal:AbortSignal.timeout(60000)});if(transient(result.status)&&attempt<3){await result.arrayBuffer();await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}return result;}catch(error){if(attempt===3)throw Error('Falha transitória de rede; envio permanece retomável.');await new Promise(r=>setTimeout(r,1000*2**attempt));}
 }
}
let prior=null;try{prior=JSON.parse(await readFile(reportPath,'utf8'));}catch{}
if(prior&&prior.archive_sha256!==expectedArchiveHash)throw Error('Checkpoint pertence a outro pacote.');
const report={format:'nexus-storage-readback-v1',package_id:manifest.package_id,part:manifest.part,archive_sha256:expectedArchiveHash,project_ref:'yhtgijtllvgzoqtfcgal',bucket:'nexus-nr-acervo',started_at:new Date().toISOString(),records:[]};
async function checkpoint(){const tmp=reportPath+'.part';await writeFile(tmp,JSON.stringify(report,null,2),{mode:0o600});await rename(tmp,reportPath);}
let checkpointQueue=Promise.resolve();
function persist(){checkpointQueue=checkpointQueue.then(()=>checkpoint());return checkpointQueue;}
let index=0;
async function worker(){while(index<manifest.files.length){const file=manifest.files[index++];
 const row={arquivo_id:file.arquivo_id,caminho:file.caminho,mime:file.mime,tamanho:file.tamanho,sha256:file.sha256,estado:'pendente'};
 try{
  const bytes=entries[file.entry];const uploaded=await request(file,'POST',bytes);
  if(!uploaded.ok){const text=await uploaded.text();if(!([400,409].includes(uploaded.status)&&/already exists|duplicate|already_exists/i.test(text)))throw Error(`Storage recusou o envio (HTTP ${uploaded.status}); bytes não confirmados.`);}
  const received=await request(file,'GET');if(!received.ok)throw Error(`Leitura após envio falhou (HTTP ${received.status}).`);
  const actual=new Uint8Array(await received.arrayBuffer()),mime=(received.headers.get('content-type')??'').split(';')[0];
  if(actual.length!==file.tamanho||sha(actual)!==file.sha256||mime!==file.mime)throw Error('Leitura do Storage diverge do tamanho, MIME ou SHA-256 esperado. Nenhum objeto existente foi sobrescrito.');
  row.estado='bytes_verificados_no_storage';row.verificado_em=new Date().toISOString();
 }catch(error){row.estado='erro';row.motivo=error.message;}
 report.records.push(row);await persist();
 // Checkpoints serialize writes from the three workers; stdout contains only aggregate progress.
 if(report.records.length%20===0)process.stdout.write(JSON.stringify({part:manifest.part,verificados:report.records.filter(r=>r.estado==='bytes_verificados_no_storage').length,processados:report.records.length,total:manifest.files.length})+'\n');
}}
await Promise.all([worker(),worker(),worker()]);
report.finished_at=new Date().toISOString();report.summary={targets:manifest.files.length,verified:report.records.filter(r=>r.estado==='bytes_verificados_no_storage').length,errors:report.records.filter(r=>r.estado==='erro').length,bytes:report.records.filter(r=>r.estado==='bytes_verificados_no_storage').reduce((n,r)=>n+r.tamanho,0),database_confirmation:false};
await persist();process.stdout.write(JSON.stringify({part:manifest.part,...report.summary,report_path:path.resolve(reportPath)})+'\n');
if(report.summary.errors)process.exitCode=2;
