import assert from "node:assert/strict";
import postgres from "postgres";
import {randomUUID,createHash} from "node:crypto";
if(process.env.PGTEST_EPHEMERAL!=="1"||process.env.PGTEST_HOST!=="127.0.0.1"||!/^\d{4,5}$/.test(process.env.PGTEST_PORT??"")||process.env.PGTEST_PORT==="5432")throw new Error("Import tests require isolated loopback PostgreSQL");
const sql=postgres({host:"127.0.0.1",port:Number(process.env.PGTEST_PORT),user:"postgres",database:process.env.PGTEST_DATABASE||"postgres",prepare:false,max:2,onnotice:()=>{}});
const org=randomUUID(),source=`isolated-${randomUUID()}`,engineer=randomUUID();let n=0;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const now=new Date().toISOString();
async function lote(key=randomUUID()){return(await sql`select public.nr_iniciar_importacao(${org},${source},${key},${now},${now},${sql.json({source_hash:hash({key})})})id`)[0].id;}
async function item(l,type,id,payload,dest){return(await sql`select public.nr_importar_item(${org},${l},${type},${id},${sql.json(payload)},${sql.json(dest)},${hash(payload)},${now})value`)[0].value;}
try{
 await sql`insert into public.organizations(id,nome)values(${org},'NR import isolated')`;
 await sql`insert into auth.users(id,email)values(${engineer},'nr-import@test.invalid')`;
 await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer})`;
 await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia')`;
 const l=await lote();
 const cli=await item(l,'cliente','c1',{id:'c1',razao_social:'Cliente legado'},{entidade:'clientes',registro:{razao_social:'Cliente legado',cnpj:'00.000.000/0001-91'}});assert.equal(cli.resultado,'importado');n++;
 const unit=await item(l,'unidade','u1',{id:'u1',nome:'Unidade'},{entidade:'unidades',registro:{cliente_id:cli.destino_id,nome:'Unidade'}});assert.equal(unit.resultado,'importado');n++;
 const ctx={cliente_id:cli.destino_id,unidade_id:unit.destino_id,normas:['NR33']};
 const model=await item(l,'modelo','MLT-test',{id:'MLT-test',versao:2,blocos:[{codigo:'B01',campos:[{id:'f1',nome:'Campo preservado'}]}]},{entidade:'modelos',registro:{normas:['NR33'],titulo:'Modelo importado de teste',tipo:'levantamento',dados:{blocos:[{codigo:'B01',campos:[{id:'f1',nome:'Campo preservado'}]}]}},modelo_numero:2,modelo_fonte:'Fonte isolada'});assert.equal(model.resultado,'importado');
 const[modelVersion]=await sql`select id,numero from public.nr_modelo_versoes where modelo_id=${model.destino_id}`;assert.equal(modelVersion.numero,2);assert.equal((await sql`select estado from public.nr_modelos where id=${model.destino_id}`)[0].estado,'rascunho');n++;
 const localPayload={id:'EC 01',titulo:'Nome confirmado na origem',geometria:{diametro:4}};
 const localDest={entidade:'locais',registro:{...ctx,titulo:'Nome confirmado na origem',tag:'EC 01',dados:{geometria:{diametro:4}}},integrar_pet:true,localizacao_pet:'Setor de descarga'};
 const local=await item(l,'local','u1:EC 01',localPayload,localDest);assert.equal(local.resultado,'importado');n++;
 const survey=await item(l,'levantamento','u1:EC 01:survey',{blocos:['B01'],valores:{f1:'valor de origem'}},{entidade:'levantamentos',registro:{...ctx,titulo:'Coleta histórica',local_id:local.destino_id,modelo_id:model.destino_id,modelo_versao_id:modelVersion.id},respostas:{f1:'valor de origem'}});assert.equal(survey.resultado,'importado');assert.equal((await sql`select valor from public.nr_respostas where levantamento_id=${survey.destino_id} and campo_id='f1'`)[0].valor,'valor de origem');n++;
 const linked=(await sql`select l.created_by,l.pet_espaco_id,e.created_by espaco_autor,e.import_origem from public.nr_locais l join public.pet_espacos e on e.id=l.pet_espaco_id where l.id=${local.destino_id}`)[0];assert.equal(linked.created_by,null);assert.equal(linked.espaco_autor,null);assert.ok(linked.import_origem);n++;
 const again=await item(l,'local','u1:EC 01',localPayload,localDest);assert.equal(again.resultado,'ja_existente');assert.equal(again.destino_id,local.destino_id);assert.equal((await sql`select count(*)::int n from public.nr_locais where organization_id=${org}`)[0].n,1);n++;
 await sql.begin(async tx=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${engineer},true)`;const[v]=await tx`select version from public.nr_locais where id=${local.destino_id}`;await tx`select public.nr_executar(${org},'NR33','locais','salvar',${local.destino_id},${v.version},${randomUUID()},${tx.json({titulo:'Edição posterior no Nexus'})})`;});
 const sameAfterEdit=await item(l,'local','u1:EC 01',localPayload,localDest);assert.equal(sameAfterEdit.resultado,'ja_existente');
 const l2=await lote();const changed=await item(l2,'local','u1:EC 01',{...localPayload,titulo:'Alteração na origem'},{...localDest,registro:{...localDest.registro,titulo:'Alteração na origem'}});assert.equal(changed.resultado,'conflito');assert.equal((await sql`select titulo from public.nr_locais where id=${local.destino_id}`)[0].titulo,'Edição posterior no Nexus');n++;
 const invalid=await item(l2,'local','u1:bad',{id:'bad'},{entidade:'locais',registro:{...ctx,titulo:'Registro com falha',unidade_id:randomUUID()}});assert.equal(invalid.resultado,'erro');assert.equal((await sql`select count(*)::int n from public.nr_locais where organization_id=${org} and titulo='Registro com falha'`)[0].n,0);n++;
 const docPayload={id:'D1',estado:'Emitido',autor:'Autor histórico',texto:'Conteúdo preservado'};
 const doc=await item(l,'documento','u1:D1',docPayload,{entidade:'documentos',registro:{...ctx,titulo:'Documento emitido origem',estado:'emitido_origem',estado_origem:'Emitido',recebimento:'referencia'},revisao:{numero:3,conteudo:{schema_version:1,blocos:[{id:'text',tipo:'paragrafo',texto:'Conteúdo preservado'}]},snapshot:docPayload,data_origem:'2026-10-11T12:00:00Z'},autor_historico:'Autor histórico'});assert.equal(doc.resultado,'importado');
 const[dr]=await sql`select v.* from public.nr_documentos d join public.nr_documento_revisoes v on v.id=d.revisao_atual_id where d.id=${doc.destino_id}`;assert.equal(dr.estado,'emitido_origem');assert.equal(dr.numero,3);assert.equal(dr.autor_historico,'Autor histórico');assert.equal(dr.created_by,null);n++;
 const closed=await item(l,'pendencia','p1',{id:'p1',situacao:'encerrada'},{entidade:'pendencias',registro:{...ctx,titulo:'Pendência histórica encerrada',estado:'encerrada'},tratativas:[{texto:'Documento recebido e conferido pelo autor histórico',autor_historico:'Histórico'}]});assert.equal(closed.resultado,'importado');assert.equal((await sql`select count(*)::int n from public.nr_tratativas where pendencia_id=${closed.destino_id}`)[0].n,1);n++;
 const superseded=await item(l,'documento','u1:old',{id:'old',substituido_por:'D1'},{entidade:'documentos',registro:{...ctx,titulo:'Original superado',recebimento:'referencia'},revisao:{vigencia:'superada',snapshot:{substituido_por:'D1'}}});assert.equal(superseded.resultado,'importado');
 await sql`select public.nr_vincular_documentos_importados(${org},${source},'documento','u1:old','u1:D1','substituido_por',${sql.json({campo_origem:'substituido_por',valor:'D1'})})`;
 assert.equal((await sql`select count(*)::int n from public.nr_documento_relacoes where organization_id=${org}`)[0].n,1);n++;
 await assert.rejects(()=>sql`update public.nr_documento_revisoes set estado='em_revisao' where documento_id=${superseded.destino_id}`,e=>e.code==='23514');n++;
 const pureHeight=await item(l,'local','u1:A1',{id:'A1'},{entidade:'locais',registro:{...ctx,normas:['NR35'],titulo:'Cobertura'},integrar_pet:true});assert.equal(pureHeight.resultado,'erro');n++;
 const reference=await item(l2,'referencia','pending-file',{url:'https://example.invalid/original.pdf'},{entidade:'referencias',registro:{},motivo:'Original ainda sem bytes verificados'});assert.equal(reference.resultado,'sem_correspondencia');
 await item(l2,'referencia','pending-file',{url:'https://example.invalid/original.pdf'},{entidade:'referencias',registro:{},motivo:'Original ainda sem bytes verificados'});
 assert.equal((await sql`select resultado from public.nr_import_itens where organization_id=${org} and lote_id=${l2} and externo_id='pending-file'`)[0].resultado,'sem_correspondencia');n++;
 const summary=(await sql`select public.nr_concluir_importacao(${org},${l2})value`)[0].value;assert.equal(summary.conflito,1);assert.equal(summary.erro,1);assert.equal((await sql`select estado from public.nr_import_lotes where id=${l2}`)[0].estado,'com_pendencias');n++;
 await assert.rejects(()=>sql.begin(async tx=>{await tx.unsafe('set local role authenticated');await tx`select public.nr_iniciar_importacao(${org},${source},'auth-denied-key',${now},${now},'{}')`}),e=>e.code==='42501');n++;
 console.log(JSON.stringify({suite:'NR import PostgreSQL',assertions:n,passed:true,scope:'private staging, canonical CNPJ identity, no fabricated Auth actor, resume,idempotence,three-way conflict,partial failure rollback,original historical status'}));
}finally{await sql.end({timeout:3});}
