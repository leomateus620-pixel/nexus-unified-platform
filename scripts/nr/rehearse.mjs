import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';
import {SOURCE} from './inventory.mjs';

// Real source data stays in the user's private directory. Only loopback test DBs are accepted.
if(process.env.PGTEST_EPHEMERAL!=='1'||process.env.PGTEST_HOST!=='127.0.0.1'||!/^\d{4,5}$/.test(process.env.PGTEST_PORT??'')||process.env.PGTEST_PORT==='5432')throw Error('Rehearsal requires disposable loopback PostgreSQL');
const [sourceDirectory,outputDirectory]=process.argv.slice(2);
if(!sourceDirectory||!outputDirectory||path.resolve(sourceDirectory)===path.resolve(outputDirectory))throw Error('Usage: rehearse.mjs PRIVATE_SOURCE_DIRECTORY PRIVATE_REHEARSAL_DIRECTORY');
const directory=path.resolve(outputDirectory);
if(directory.startsWith(path.resolve(process.cwd())+path.sep))throw Error('Rehearsal payloads must stay outside the repository');
const sql=postgres({host:'127.0.0.1',port:Number(process.env.PGTEST_PORT),user:'postgres',database:process.env.PGTEST_DATABASE||'postgres',prepare:false,max:1,onnotice:()=>{}});
const org=randomUUID(),phases=['contexto','clientes','unidades','modelos','locais','levantamentos','sistemas','documentos','pendencias','eventos','referencias'];
const report={format:'nexus-nr-rehearsal-v1',organization_id:org,started_at:new Date().toISOString(),phases:[],scope:'Source-backed private rehearsal on disposable local PostgreSQL; no remote writes; no proof of migrated file bytes'};
try{
 await mkdir(directory,{recursive:true,mode:0o700});
 for(const file of ['source-db.json','inventory.json'])await symlink(path.join(path.resolve(sourceDirectory),file),path.join(directory,file));
 const inventory=JSON.parse(await readFile(path.join(directory,'inventory.json'),'utf8'));
 await sql`insert into public.organizations(id,nome)values(${org},'NR source rehearsal — disposable')`;
 const[{lote_id}]=await sql`select public.nr_iniciar_importacao(${org},${SOURCE},${randomUUID()},${inventory.captured_at},${inventory.captured_at},${sql.json({snapshot_sha256:inventory.snapshot_sha256,rehearsal:true})})lote_id`;
 await writeFile(path.join(directory,'lot.json'),JSON.stringify({lote_id}),{mode:0o600});
 await writeFile(path.join(directory,'mappings.json'),'[]',{mode:0o600});
 for(const phase of phases){
  const started=performance.now();
  const compiler=spawnSync(process.execPath,['scripts/nr/prepare-import.mjs',directory,org,phase],{encoding:'utf8',maxBuffer:1024*1024});
  if(compiler.status!==0)throw Error(`Compiler ${phase}: ${compiler.stderr}`);
  const plan=JSON.parse(await readFile(path.join(directory,'plans',`${phase}.json`),'utf8'));
  for(const batch of plan.batches)await sql.unsafe(batch);
  const errors=await sql`select tipo,externo_id,resultado,motivo from public.nr_import_itens where organization_id=${org} and lote_id=${lote_id} and resultado in('erro','conflito')order by tipo,externo_id`;
  const mappings=await sql`select tipo,externo_id,destino_id from public.nr_fontes where organization_id=${org} order by tipo,externo_id`;
  await writeFile(path.join(directory,'mappings.json'),JSON.stringify(mappings),{mode:0o600});
  const result={phase,count:plan.count,batches:plan.batches.length,elapsed_ms:Math.round(performance.now()-started),errors:errors.length};report.phases.push(result);
  console.log(JSON.stringify(result));
  if(errors.length){await writeFile(path.join(directory,'errors.json'),JSON.stringify(errors,null,2),{mode:0o600});throw Error(`${errors.length} import errors. Details preserved privately in ${path.join(directory,'errors.json')}`);}
 }
 const tables=['clientes','unidades','nr_locais','pet_espacos','nr_documentos','nr_documento_revisoes','nr_modelos','nr_modelo_versoes','nr_levantamentos','nr_sistemas','nr_pendencias','nr_tratativas','nr_fontes','nr_import_itens'];
 const totals={};for(const table of tables)totals[table]=(await sql.unsafe(`select count(*)::int n from public.${table} where organization_id=$1`,[org]))[0].n;
 assert.equal(totals.clientes,2);assert.equal(totals.unidades,4);assert.equal(totals.nr_locais,112);assert.equal(totals.pet_espacos,108);assert.equal(totals.nr_documentos,736);assert.equal(totals.nr_pendencias,80);
 const [pending]=await sql`select count(*)filter(where estado='aberta')::int abertas,count(*)filter(where estado='encerrada')::int encerradas from public.nr_pendencias where organization_id=${org}`;assert.deepEqual(pending,{abertas:51,encerradas:29});
 report.totals=totals;report.pendencias=pending;
 const retryStarted=performance.now();let retried=0;
 for(const phase of phases){const plan=JSON.parse(await readFile(path.join(directory,'plans',`${phase}.json`),'utf8'));for(const batch of plan.batches)await sql.unsafe(batch);retried+=plan.count;}
 const afterRetry={};for(const table of tables)afterRetry[table]=(await sql.unsafe(`select count(*)::int n from public.${table} where organization_id=$1`,[org]))[0].n;
 assert.deepEqual(afterRetry,totals,'Identical retry must preserve every entity/file mapping count');
 const referencePending=(await sql`select count(*)::int n from public.nr_import_itens where organization_id=${org} and lote_id=${lote_id} and tipo='referencia' and resultado='sem_correspondencia'`)[0].n;
 assert.equal(referencePending,inventory.references.length,'Unobtained references must stay pending after identical retry');
 report.retry={items:retried,elapsed_ms:Math.round(performance.now()-retryStarted),counts_unchanged:true,pending_references_preserved:referencePending};
 report.per_unit=await sql`select u.id,u.nome,(select count(*)::int from public.nr_locais l where l.organization_id=u.organization_id and l.unidade_id=u.id)locais,(select count(*)::int from public.nr_documentos d where d.organization_id=u.organization_id and d.unidade_id=u.id)documentos,(select count(*)::int from public.nr_pendencias p where p.organization_id=u.organization_id and p.unidade_id=u.id and estado='aberta')pendencias_abertas from public.unidades u where organization_id=${org} order by nome`;
 report.summary=(await sql`select public.nr_concluir_importacao(${org},${lote_id})value`)[0].value;report.passed=true;report.finished_at=new Date().toISOString();
 await writeFile(path.join(directory,'rehearsal-report.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({passed:true,totals,pendencias:pending,report:path.join(directory,'rehearsal-report.json')}));
}catch(error){report.passed=false;report.error=error.message;await writeFile(path.join(directory,'rehearsal-report.json'),JSON.stringify(report,null,2),{mode:0o600});throw error;}
finally{await sql.end({timeout:3});}
