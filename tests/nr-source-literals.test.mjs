import assert from 'node:assert/strict';
import test from 'node:test';
import {readSourceLiterals} from '../scripts/nr/source-literals.mjs';
test('selected literal data survives without executing source',()=>{
 const source='globalThis.nexusSourceExecuted = true; const L={e:{sim:"Presente",nao:"Ausente"},a:[0,true,false,null]}; const SIT_PEND={a:"Aberta"};const SIT_ANC={p:"Proposta"};';
 const data=readSourceLiterals(source);
 assert.equal(data.L.e.sim,'Presente');assert.deepEqual(data.L.a,[0,true,false,null]);assert.equal(globalThis.nexusSourceExecuted,undefined);
});
for(const expression of ['window.location','fetch("https://example.invalid")','()=>true','({...other})','{[key]:"value"}','{...other}','{x:variable}','"https://example.invalid?token=secret"'])test('reject nonliteral or unsafe initializer '+expression,()=>assert.throws(()=>readSourceLiterals(`const L=${expression};const SIT_PEND={};const SIT_ANC={};`)));
test('duplicate and nonconst dictionaries are rejected',()=>{
 assert.throws(()=>readSourceLiterals('let L={};const SIT_PEND={};const SIT_ANC={};'));
 assert.throws(()=>readSourceLiterals('const L={a:1,a:2};const SIT_PEND={};const SIT_ANC={};'));
});
