/** Preserve source context as private metadata; never apply selection, roles or technical powers. */
import {readFile,writeFile,realpath,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {SOURCE,digest} from './inventory.mjs';
import {readSourceLiterals} from './source-literals.mjs';
const [directory,org]=process.argv.slice(2);
if(!directory||!/^[a-f0-9-]{36}$/.test(org??''))throw Error('Usage: prepare-source-context.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID');
const root=await realpath(directory),repo=await realpath(process.cwd());
if(root===repo||root.startsWith(repo+path.sep))throw Error('Source context must stay private');
const db=JSON.parse(await readFile(path.join(root,'source-db.json'),'utf8'));
const inventory=JSON.parse(await readFile(path.join(root,'inventory.json'),'utf8'));
const lot=JSON.parse(await readFile(path.join(root,'lot.json'),'utf8'));
const app=await readFile(path.join(root,'app.js'));
const options={source_file:'app.js',source_sha256:createHash('sha256').update(app).digest('hex'),method:'TypeScript AST: selected top-level consts; recursive string/number/boolean/null/array/object-property literal whitelist; no execution',literals:readSourceLiterals(app.toString('utf8'))};
if(Object.keys(options.literals.L).length!==7)throw Error('Unexpected legacy dictionary structure; review before importing');
await writeFile(path.join(root,'source-ui-options.json'),JSON.stringify(options,null,2),{mode:0o600});
const records=[{id:'meta',payload:db.meta},{id:'projeto',payload:db.projeto},{id:'selecao_ui',payload:{cliente_ativo:db.cliente_ativo,unidade_ativa:db.unidade_ativa}},{id:'opcoes_interface',payload:options}];
const q=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>`${q(JSON.stringify(value))}::jsonb`;
function block(body){let n=0;while(body.includes(`$nr_source_context_${n}$`))n++;const d=`$nr_source_context_${n}$`;return`do ${d}\n${body}\n${d};`;}
const statements=records.map(({id,payload})=>{
 if(!payload||Array.isArray(payload)||typeof payload!=='object')throw Error('Source root context must be an object');
 const evidence={source:SOURCE,snapshot_sha256:inventory.snapshot_sha256,original_capture:inventory.captured_at,root_field:id,metadata_only:true,operational_settings_applied:false,auth_accounts_created:false,roles_or_professional_powers_assigned:false,...(id==='opcoes_interface'?{source_app_sha256:options.source_sha256,literal_parser:true,no_source_code_executed:true}:{} )};
 const destination={entidade:'referencias',registro:{},caminho_original:id==='selecao_ui'?'source-db.json/{cliente_ativo,unidade_ativa}':id==='opcoes_interface'?'app.js/{L,SIT_PEND,SIT_ANC}':'source-db.json/'+id,evidencia:evidence,motivo:'Contexto histórico da origem preservado como metadados; não aplicado à seleção atual, contas, papéis ou habilitações profissionais.'};
 return block(`declare imported_result jsonb;begin
select public.nr_importar_item(${q(org)}::uuid,${q(lot.lote_id)}::uuid,'contexto_origem',${q(id)},${json(payload)},${json(destination)},${q(digest(payload))},${q(inventory.captured_at)}::timestamptz)into imported_result;
update public.nr_import_itens i set resultado='importado',destino_tipo='fontes',destino_id=f.id,motivo=${q(destination.motivo)},evidencia=i.evidencia||${json(evidence)},updated_at=clock_timestamp()from public.nr_fontes f where i.organization_id=${q(org)}::uuid and i.lote_id=${q(lot.lote_id)}::uuid and i.id=(imported_result->>'item_id')::uuid and imported_result->>'resultado'in('sem_correspondencia','ja_existente')and f.organization_id=i.organization_id and f.origem=${q(SOURCE)}and f.tipo='contexto_origem'and f.externo_id=${q(id)}and f.sha256=${q(digest(payload))};
end;`);
});
const sql=statements.join('\n');
await mkdir(path.join(root,'plans'),{recursive:true,mode:0o700});
await writeFile(path.join(root,'plans/contexto-origem.json'),JSON.stringify({format:'nexus-source-context-owner-plan-v1',count:records.length,captured_at:inventory.captured_at,snapshot_sha256:inventory.snapshot_sha256,batches:[sql],records:records.map(r=>({id:r.id,sha256:digest(r.payload)})),execution:'prepared_only'}),{mode:0o600});
console.log(JSON.stringify({count:records.length,sql_bytes:Buffer.byteLength(sql),captured_at:inventory.captured_at,snapshot_sha256:inventory.snapshot_sha256,ui_dictionaries:Object.keys(options.literals.L).length,source_app_sha256:options.source_sha256,source_executed:false}));
