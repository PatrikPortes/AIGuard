// Stage 5 S5.3: Contract → Firm (planner P10, user-chosen party, adoption of fromContract).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCheck,validateCheckPlan,validateCombinedResult,CHECKER_REGISTRY,PLANNER_RULES} from '../public/check-plan.js';
import {runContractFirmCheck,planContractFirm,contractParties} from '../public/check-flow.js';
import {REGISTRY_CONTEXT,CONTRACT_LEGAL_NOTE} from '../public/check-view.js';
import {rulesForContract} from '../public/contract-core.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {createCheckRunner} from '../src/check-runner.js';
import {profile} from '../test-support/firm/profiles.js';

const client={runAt:'client'};
const ICO='27082440',OTHER='00006947',now=Date.parse('2026-10-14T12:00:00Z');
const sig=p=>p.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary,s.runAt]);
const TWO='Kupní smlouva. Prodávající: ABC s.r.o., IČO: 27082440. Kupující: XYZ a.s., IČ 00006947. Podmínky na https://abc.example/vop. Smluvní pokuta 0,5 % denně.';
const NONE='Smlouva o dílo mezi dvěma stranami. Cena je splatná do 14 dnů.';
const ONE='Smlouva o poskytování služeb. Poskytovatel: ABC s.r.o., IČO 27082440.';
const local=text=>({...rulesForContract(text,'unknown'),mode:'rules_only'});
const firmResult=(p=profile())=>fromFirm(p,evaluateFirm(p,{now}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function fake(firm=()=>json(firmResult())){
 const calls=[];
 return {calls,fetchImpl:async(input,init={})=>{calls.push({url:String(input),body:init.body??null});
  if(input==='/api/session')return json({ok:true});if(input==='/api/firm')return firm(init);throw Error('unexpected request '+input);}};
}
async function run(contract,{ico,firm,contractResult}={}){
 const f=fake(firm);
 const r=await runContractFirmCheck({contract,ico,contractResult:contractResult??local(contract)},{checkWebUrl,coiResult,fetchImpl:f.fetchImpl,clock:()=>now});
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
 return {r,calls:f.calls};
}

test('P10: registry entry and rule are additive; the contract is a required primary browser step', () => {
 assert.deepEqual(CHECKER_REGISTRY.contract,{entityKinds:['contract_text'],runAt:'client',requiredDefault:true});
 assert.deepEqual(PLANNER_RULES.map(r=>r.id),['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10']);
 const p=planCheck({contract:'  '+NONE+'  '},client);
 assert.deepEqual(sig(p),[['contract','P10',true,true,'client']]);
 assert.deepEqual(p.steps[0].input,{kind:'text',ref:'contract'});assert.equal(p.steps[0].reason.text,'Vložili jste text smlouvy.');
 assert.deepEqual(p.input.contract,{present:true,chars:NONE.length});
 assert.equal(JSON.stringify(p).includes('Smlouva o dílo'),false,'no raw contract text in the plan');
});

test('P10 never checks links and never assumes a party: no firm step without the user’s choice', () => {
 const p=planCheck({contract:TWO},client);
 assert.deepEqual(sig(p),[['contract','P10',true,true,'client']]);
 assert.deepEqual(p.input.extracted.urls,[],'no URL extraction from contracts (D2)');
 assert.deepEqual(p.notPlanned,[{kind:'ico',value:OTHER,reason:'ambiguous'},{kind:'ico',value:ICO,reason:'ambiguous'}]);
 const one=planCheck({contract:ONE},client);
 assert.deepEqual(sig(one),[['contract','P10',true,true,'client']],'a single IČO is offered, not auto-checked');
 assert.deepEqual(one.notPlanned,[{kind:'ico',value:ICO,reason:'ambiguous'}]);
 assert.deepEqual(planCheck({contract:NONE},client).notPlanned,[]);
});

test('chosen party: P3 required (not primary); the chosen IČO is a duplicate, other parties stay ambiguous', () => {
 const p=planContractFirm({contract:TWO,ico:ICO});
 assert.deepEqual(sig(p),[['contract','P10',true,true,'client'],['firm','P3',true,false,'server']]);
 assert.deepEqual(p.notPlanned,[{kind:'ico',value:OTHER,reason:'ambiguous'},{kind:'ico',value:ICO,reason:'duplicate'}]);
 // A manually entered IČO absent from the contract.
 const m=planContractFirm({contract:NONE,ico:'25596641'});
 assert.deepEqual(sig(m),[['contract','P10',true,true,'client'],['firm','P3',true,false,'server']]);assert.deepEqual(m.notPlanned,[]);
 assert.throws(()=>planContractFirm({contract:NONE,ico:'27082441'}),/INVALID_ICO/);
});

test('contractParties: none / one / two / many / invalid labelled numbers', () => {
 assert.deepEqual(contractParties(NONE),{candidates:[],invalid:[]});
 assert.deepEqual(contractParties(ONE),{candidates:[ICO],invalid:[]});
 assert.deepEqual(contractParties(TWO),{candidates:[OTHER,ICO],invalid:[]});
 assert.deepEqual(contractParties('IČO 27082440, IČO 00006947, IČ 25596641, IČO 27082440.'),{candidates:[OTHER,'25596641',ICO],invalid:[]});
 assert.deepEqual(contractParties('Dodavatel IČO 27082441, odběratel IČO 00006947.'),{candidates:[OTHER],invalid:['27082441']});
});

test('P10 boundaries: browser only, exclusive with text/loan/offer/url, 40 000 characters, tampering rejected', () => {
 assert.throws(()=>planCheck({contract:NONE}),/CONTRACT_NOT_ALLOWED/);
 for(const extra of [{text:'x'},{loan:'x'},{offer:'x'},{url:'https://a.example/'}])assert.throws(()=>planCheck({contract:NONE,...extra},{runAt:'client',normalizeUrl:checkWebUrl}),/INVALID_INPUT/);
 for(const bad of ['','  ',7,'x'.repeat(40001)])assert.throws(()=>planCheck({contract:bad},client),/INVALID_CONTRACT/);
 assert.doesNotThrow(()=>planCheck({contract:'x'.repeat(40000)},client));
 const runner=createCheckRunner({firmClient:{profile:async()=>{throw Error('no');}},firmRequests:{enter:()=>()=>{}},firmLimiter:{check(){}},firmSessionLimiter:{check(){}}});
 assert.throws(()=>runner.prepare({contract:NONE}),/INVALID_INPUT/);
 const p=planContractFirm({contract:TWO,ico:ICO}),v=x=>validateCheckPlan(x,{normalizeUrl:checkWebUrl});
 const mutations=[c=>{c.steps[0].runAt='server';},c=>{c.steps[0].required=false;},c=>{c.steps[1].primary=true;},
  c=>{c.steps.push({id:'s3',checker:'web',input:{kind:'url',ref:'https://abc.example/vop'},trigger:'extracted_from_text',reason:{ruleId:'P4',text:'Odkaz uvedený v textu zprávy.'},required:true,primary:false,runAt:'client'});},
  c=>{c.steps[1]={...c.steps[1],trigger:'extracted_from_text',required:false,reason:{ruleId:'P5',text:'IČO uvedené v textu zprávy. Vztah k odesílateli jsme neověřili.'}};c.input.icoField=null;},
  c=>{c.input.extracted.urls=[{host:'abc.example',normalized:'https://abc.example/vop'}];}];
 for(const mutate of mutations){const c=structuredClone(p);mutate(c);assert.throws(()=>v(c),/INVALID_PLAN/);}
 // Linear on long contracts with many labelled numbers.
 const long=('Strana IČO 27082440, jiná IČ 00006947, číslo 12345678. ').repeat(800).slice(0,40000);
 for(let i=0;i<3;i++)planCheck({contract:long},client);
 const before=process.threadCpuUsage();planCheck({contract:long},client);const used=process.threadCpuUsage(before);
 assert((used.user+used.system)/1000<40,'planner CPU on 40 000 characters');
});

test('contract only (no choice): adopted local result, no request, never green, legal limitation kept', async () => {
 const {r,calls}=await run(NONE);
 assert.equal(calls.length,0);assert.deepEqual(r.plan.steps.map(s=>s.checker),['contract']);
 const o=r.outcomes[0];assert.equal(o.status,'done');assert.equal(o.result.checker,'contract');
 assert(o.result.unknowns.some(u=>/nenahrazuje právní posouzení/.test(u)));
 assert.notEqual(r.aggregate.level,'none_found');
});

test('chosen IČO: exactly one session + one /api/firm with {"ico"}; contract text never sent; no second evaluation', async () => {
 const sentinel=local(TWO);
 const {r,calls}=await run(TWO,{ico:ICO,contractResult:sentinel});
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert(!calls.some(c=>/Kupní|Prodávající|abc\.example|pokuta/.test(c.url+' '+(c.body||''))));
 // The adopted result is exactly the page's local result (same findings), not a re-run.
 assert.equal(r.outcomes[0].result.findings.length,sentinel.findings.length);
 const flow=readFileSync(new URL('../public/check-flow.js',import.meta.url),'utf8');
 assert.doesNotMatch(flow,/contract-core|rulesForContract|analyze-contract/);
});

test('clean firm never improves the verdict; risky firm → serious; unavailable firm → attention (A3)', async () => {
 const clean=await run(NONE,{ico:ICO});
 assert.equal(clean.r.outcomes[1].result.level,'none_found');assert.equal(clean.r.aggregate.level,'not_assessable');
 const dissolved=()=>json(firmResult(profile({identity:{...profile().identity,dissolved:'2025-01-01'}})));
 assert.equal((await run(NONE,{ico:ICO,firm:dissolved})).r.aggregate.level,'serious');
 for(const firm of [()=>json({code:'X'},503),()=>json({code:'RATE_LIMITED'},429),()=>{throw TypeError('offline');}]){
  const {r}=await run(NONE,{ico:ICO,firm});assert.notEqual(r.outcomes[1].status,'done');
  assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['attention','A3']);
 }
});

test('invalid contract result: primary source unavailable → incomplete (A2); at most one /api/firm', async () => {
 const {r,calls}=await run(TWO,{ico:ICO,contractResult:{findings:'x'}});
 assert.equal(r.outcomes[0].result.sources[0].status,'unavailable');assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['incomplete','A2']);
 assert.equal(calls.filter(c=>c.url==='/api/firm').length,1);
});

test('view copy (A/B/C) and page boundaries', () => {
 assert.equal(REGISTRY_CONTEXT.contract.neutral,'Firma s tímto IČO existuje v registrech. Neověřuje to, že smlouvu uzavírá právě ona, ani obsah smlouvy.');
 assert.equal(REGISTRY_CONTEXT.contract.row,'Firmu jste vybrali vy. Neověřili jsme, že smlouvu uzavírá právě tato firma. Kontrola firmy nenahrazuje právní posouzení smlouvy.');
 assert.equal(CONTRACT_LEGAL_NOTE,'Kontrola smlouvy ani firmy nenahrazuje právní posouzení.');
 const page=readFileSync(new URL('../public/contract.js',import.meta.url),'utf8');
 const fetches=src=>[...src.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]).sort();
 assert.deepEqual(fetches(page),['/api/analyze-contract','/api/contract-status','/api/session','/contract-legal-catalog.json'],'contract page requests unchanged');
 assert.doesNotMatch(page,/'\/api\/firm'|'\/api\/check'/,'the page itself never calls registry APIs; only check-flow does, with {"ico"}');
 assert.match(page,/import\('\/check-flow\.js'\)/);
 const html=readFileSync(new URL('../public/smlouva.html',import.meta.url),'utf8');
 const party=html.match(/<section id="contract-party"[\s\S]*?<\/section>/)[0];
 assert.doesNotMatch(party,/\sname=|<textarea/);assert.match(party,/<form id="contract-party-form" novalidate>/);
 assert.match(html,/<link rel="stylesheet" href="\/verdict.css">/);
 assert.match(html,/<section id="check-combined" class="check-combined" aria-live="polite" hidden><\/section>/);
});
