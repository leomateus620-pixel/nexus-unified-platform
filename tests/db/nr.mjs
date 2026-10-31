import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

// Somente cluster descartável criado pelo runner; nunca aceita URL/credencial remota.
if (process.env.PGTEST_EPHEMERAL !== "1" || process.env.PGTEST_HOST !== "127.0.0.1" || !/^\d{4,5}$/.test(process.env.PGTEST_PORT ?? "") || process.env.PGTEST_PORT === "5432") throw new Error("NR tests require isolated loopback PostgreSQL");
const sql = postgres({host:"127.0.0.1",port:Number(process.env.PGTEST_PORT),user:"postgres",database:process.env.PGTEST_DATABASE||"postgres",prepare:false,max:8,onnotice:()=>{}});
const org=randomUUID(),otherOrg=randomUUID(),engineer=randomUUID(),field=randomUUID(),finance=randomUUID(),outsider=randomUUID(),client=randomUUID(),unit=randomUUID(),otherUnit=randomUUID(),otherClient=randomUUID();
let count=0;
async function as(user,fn){return sql.begin(async tx=>{await tx.unsafe("set local role authenticated");await tx`select set_config('request.jwt.claim.sub',${user},true)`;return fn(tx)});}
async function cmd(resource,command,data={},id=null,version=null,key=randomUUID(),norm="NR33",user=engineer){return as(user,async tx=>(await tx`select public.nr_executar(${org},${norm},${resource},${command},${id},${version},${key},${tx.json(data)}) value`)[0].value)}
async function query(resource,filters={},norm="NR33",user=engineer,organization=org){return as(user,async tx=>(await tx`select public.nr_consultar(${organization},${norm},${resource},${tx.json(filters)}) value`)[0].value)}
async function rejects(action,code){await assert.rejects(action,e=>e.code===code);count++;}
const scoped=(titulo,extra={})=>({titulo,cliente_id:client,unidade_id:unit,...extra});
try{
 await sql`insert into auth.users(id,email)values(${engineer},'nr-eng@test.invalid'),(${field},'nr-campo@test.invalid'),(${finance},'nr-fin@test.invalid'),(${outsider},'nr-out@test.invalid')`;
 await sql`insert into public.organizations(id,nome)values(${org},'NR isolated'),(${otherOrg},'NR other isolated')`;
 await sql`insert into public.memberships(organization_id,user_id)values(${org},${engineer}),(${org},${field}),(${org},${finance}),(${otherOrg},${outsider})`;
 await sql`insert into public.user_roles(organization_id,user_id,role)values(${org},${engineer},'engenharia'),(${org},${field},'campo'),(${org},${finance},'financeiro'),(${otherOrg},${outsider},'engenharia')`;
 await sql`insert into public.clientes(id,organization_id,razao_social)values(${client},${org},'NR canonical client'),(${otherClient},${otherOrg},'NR other client')`;
 await sql`insert into public.unidades(id,organization_id,cliente_id,nome)values(${unit},${org},${client},'NR canonical unit'),(${otherUnit},${otherOrg},${otherClient},'NR other unit')`;
 const ctx=await query('contexto');assert.equal(ctx.clientes.length,0);assert.equal(ctx.unidades.length,0);assert.equal(ctx.permissoes.emitir,false);count++;
 await rejects(()=>query('locais',{},'NR33',outsider),'42501');
 await rejects(()=>query('locais',{},'NR33',finance),'42501');
 await rejects(()=>cmd('locais','salvar',scoped('Forbidden role'),null,null,randomUUID(),'NR33',field),'42501');
 await rejects(()=>cmd('locais','salvar',scoped('Cross org unit',{unidade_id:otherUnit})),'23503');
 const chave=randomUUID(),local=await cmd('locais','salvar',scoped('Local técnico',{tag:'EC 13A',aliases:['13 A','61 EFGHIJ'],normas:['NR33','NR35']}),null,null,chave);
 assert.equal(local.tag,'EC 13A');assert.deepEqual(local.aliases,['13 A','61 EFGHIJ']);assert.equal(local.pet_espaco_id,null);count++;
 assert.equal((await query('contexto')).clientes.length,1);assert.equal((await query('contexto')).unidades.length,1);count++;
 const retry=await cmd('locais','salvar',scoped('Local técnico',{tag:'EC 13A',aliases:['13 A','61 EFGHIJ'],normas:['NR33','NR35']}),null,null,chave);assert.equal(retry.id,local.id);assert.equal((await query('locais')).total,1);assert.equal((await query('locais',{},'NR35')).rows[0].id,local.id);count++;
 await rejects(()=>cmd('locais','salvar',scoped('Changed intent'),null,null,chave),'23505');
 const changed=await cmd('locais','salvar',{titulo:'Local atualizado'},local.id,local.version);assert.equal(changed.version,local.version+1);count++;
 await rejects(()=>cmd('locais','salvar',{titulo:'Lost edit'},local.id,local.version),'40001');
 await rejects(()=>cmd('locais','salvar',{organization_id:otherOrg},local.id,changed.version),'23514');
 const movedContext={cliente_id:client,unidade_id:otherUnit};await rejects(()=>cmd('locais','salvar',movedContext,local.id,changed.version),'23514');
 const folder=await cmd('pastas','salvar',scoped('Pasta A')),child=await cmd('pastas','salvar',scoped('Pasta B',{parent_id:folder.id}));
 await rejects(()=>cmd('pastas','salvar',{parent_id:child.id},folder.id,folder.version),'23514');
 const renamed=await cmd('pastas','salvar',{titulo:'Pasta renomeada'},folder.id,folder.version);assert.equal((await query('pastas',{id:child.id})).parent_id,folder.id);count++;
 const content={schema_version:1,blocos:[{id:randomUUID(),tipo:'titulo',texto:'Procedimento técnico'},{id:randomUUID(),tipo:'tabela',linhas:[['Campo','Valor'],['TAG','EC 13A']]}]};
 const doc=await cmd('documentos','salvar',scoped('Documento técnico',{pasta_id:folder.id,local_id:local.id,conteudo:content}));assert.deepEqual(doc.conteudo,content);assert.equal(doc.revisao_numero,1);count++;
 const editContent={...content,blocos:[...content.blocos,{id:randomUUID(),tipo:'paragrafo',texto:'Edição salva no conteúdo nativo'}]};
 const editedDoc=await cmd('documentos','salvar',{conteudo:editContent},doc.id,doc.version);assert.deepEqual(editedDoc.conteudo,editContent);count++;
 const docList=await query('documentos');assert.equal(docList.rows[0].conteudo,undefined);assert.deepEqual(docList.rows[0].dados,{});count++;
 let submitted=await cmd('documentos','submeter',{motivo:'Conferir parâmetros'},doc.id,editedDoc.version);assert.equal(submitted.estado,'em_revisao');
 await rejects(()=>cmd('documentos','salvar',{conteudo:content},doc.id,submitted.version),'23514');
 const revised=await cmd('documentos','nova_revisao',{motivo:'Correção para conferência'},doc.id,submitted.version);assert.equal(revised.revisao_numero,2);assert.equal(revised.revisoes[1].vigencia,'superada');assert.deepEqual(revised.conteudo,editContent);count++;
 assert.equal((await query('documentos',{pasta_id:folder.id})).total,1);assert.equal((await query('documentos',{pasta_id:child.id})).total,0);assert.equal((await query('pastas',{pasta_id:folder.id})).rows[0].id,child.id);assert.equal((await query('locais',{busca:'61 EFGHIJ'})).rows[0].id,local.id);count++;
 await rejects(()=>sql`update public.nr_documento_revisoes set estado='rascunho' where id=${revised.revisoes[1].id}`,'23514');
 await sql`update public.nr_documento_revisoes set estado='emitido_origem',snapshot=${sql.json({origem:'legacy'})} where id=${revised.revisao_atual_id}`;
 await sql`update public.nr_documentos set estado='emitido_origem' where id=${doc.id}`;
 let issued=await query('documentos',{id:doc.id});await rejects(()=>cmd('documentos','salvar',{titulo:'Forbidden historical rewrite'},doc.id,issued.version),'23514');
 await rejects(()=>sql`update public.nr_documento_revisoes set conteudo=${sql.json({schema_version:1,blocos:[]})} where id=${revised.revisao_atual_id}`,'23514');
 const model=await cmd('modelos','salvar',{titulo:'Modelo teste',tipo:'levantamento',dados:{schema_version:1,blocos:[{codigo:'B01',campos:[{id:'identificacao',nome:'Identificação',tipo:'texto'}]}]},conteudo:{schema_version:1,blocos:[]}});
 const survey=await cmd('levantamentos','salvar',scoped('Levantamento parcial',{local_id:local.id,modelo_id:model.id,respostas:{identificacao:'EC 13A',diametro:null},dados:{avaliacoes:{ventilacao:{existencia:'nao_verificado',aplicabilidade:'aplicavel',condicao:'nao_verificado',acao:'a_verificar',validacao:'pendente'}}}}));
 assert.equal(survey.respostas.identificacao,'EC 13A');assert.equal(survey.respostas.diametro,null);assert.ok(survey.modelo_versao_id);count++;
 const pending=await cmd('pendencias','salvar',scoped('Confirmar documento',{local_id:local.id,documento_id:doc.id,criticidade:'alta',tratativa:'Fonte ainda pendente de acesso'}));
 const closed=await cmd('pendencias','encerrar',{tratativa:'Recebido e vinculado com evidência'},pending.id,pending.version);assert.equal(closed.estado,'encerrada');assert.equal(closed.tratativas.length,2);assert.equal(closed.tratativas[0].texto,'Fonte ainda pendente de acesso');
 const reopened=await cmd('pendencias','reabrir',{tratativa:'Nova divergência identificada'},pending.id,closed.version);assert.equal(reopened.estado,'aberta');assert.equal(reopened.tratativas.length,3);count++;
 const archived=await cmd('pastas','arquivar',{motivo:'Pasta arquivada para teste'},folder.id,renamed.version);assert.ok(archived.arquivado_em);assert.equal((await query('pastas',{lixeira:true})).total,1);assert.equal((await query('documentos',{id:doc.id})).pasta_id,folder.id);count++;
 await cmd('pastas','salvar',scoped('Pasta renomeada'));
 await rejects(()=>cmd('pastas','restaurar',{motivo:'Restaurar com conflito'},folder.id,archived.version),'23505');
 await rejects(()=>cmd('pastas','restaurar',{motivo:'Retomar sob pai arquivado'},child.id,child.version),'23514');
 const standalone=await cmd('pastas','salvar',scoped('Pasta para restaurar'));
 const inTrash=await cmd('pastas','arquivar',{motivo:'Teste de lixeira'},standalone.id,standalone.version);
 const restored=await cmd('pastas','restaurar',{motivo:'Retomar pasta'},standalone.id,inTrash.version);assert.equal(restored.arquivado_em,null);count++;
 const c1=await sql.reserve(),c2=await sql.reserve();try{
  await c1.unsafe("begin;set local role authenticated");await c1`select set_config('request.jwt.claim.sub',${engineer},true)`;
  const d1={titulo:'Concurrent first'};await c1`select public.nr_executar(${org},'NR33','locais','salvar',${local.id},${changed.version},${randomUUID()},${c1.json(d1)})`;
  const concurrent=as(engineer,async tx=>(await tx`select public.nr_executar(${org},'NR33','locais','salvar',${local.id},${changed.version},${randomUUID()},${tx.json({titulo:'Concurrent second'})})`)[0]);
  await c1.unsafe('commit');await rejects(()=>concurrent,'40001');
 }finally{c1.release();c2.release();}
 const rls=await as(outsider,tx=>tx`select count(*)::int n from public.nr_documentos where organization_id=${org}`);assert.equal(rls[0].n,0);count++;
 await rejects(()=>as(engineer,tx=>tx`update public.nr_locais set titulo='Bypass' where id=${local.id}`),'42501');
 const detail=await query('locais',{id:local.id});assert.ok(detail.historico.length>=3);assert.ok((await query('painel')).pendencias_abertas>=1);count++;
 console.log(JSON.stringify({suite:'NR core PostgreSQL',assertions:count,passed:true,scope:'isolated fixtures; real PostgreSQL constraints/RLS/RPC/locks; no Storage HTTP proof'}));
}finally{await sql.end({timeout:3});}
