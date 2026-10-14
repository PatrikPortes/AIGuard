// Stage 4 S4.4: investment runner in check-flow (real runs; only /api/firm is faked).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInvestmentCheck,planInvestmentCheck,runWebFirmCheck} from '../public/check-flow.js';
import {evaluateInvestment} from '../public/investment-rules.js';
import {fromInvestment} from '../public/investment-verdict.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {validateCombinedResult} from '../public/check-plan.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {profile} from '../test-support/firm/profiles.js';

const ICO='27082440';
const now=Date.parse('2026-10-14T12:00:00Z');
const records=Object.fromEntries(Array.from({length:100},(_,i)=>['shop'+i+'.example',['Varování ČOI']]));
const coi={schema:1,source:'https://coi.gov.cz/userdata/files/dokumenty-ke-stazeni/open-data/rizikove-seznam.csv',fetchedAt:new Date(now).toISOString(),lastAttemptOk:true,records};
const firmResult=(p=profile())=>fromFirm(p,evaluateFirm(p,{now}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function fake(firm=()=>json(firmResult())){
 const calls=[];
 return {calls,fetchImpl:async(input,init={})=>{
  calls.push({url:String(input),body:init.body??null});
  if(input==='/api/session')return json({ok:true});
  if(input==='/api/firm')return firm(init);
  throw Error('unexpected request '+input);
 }};
}
function setup(extra={}){
 const loads={count:0},f=fake(extra.firm);
 const deps={evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData:()=>{loads.count++;return Promise.resolve(coi);},fetchImpl:f.fetchImpl,clock:()=>now,...extra.deps};
 return {calls:f.calls,loads,deps};
}
async function run(input,extra){
 const s=setup(extra);const r=await runInvestmentCheck(input,s.deps);
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
 return {r,...s};
}
const SAFE='Podílový fond spravuje investiční společnost. Hodnota investice může klesat i stoupat.';
const SERIOUS='Investice je zcela bez rizika, pošlete ihned peníze na můj účet.';
const WEAK='Nabídka platí jen dnes!';
const SECRET=/Podílový|bez rizika|pošlete|platí jen|Garant|crypto|kosik|tajne/i;
const leaks=calls=>calls.some(c=>SECRET.test(c.url+' '+(c.body||'')));
const steps=r=>r.plan.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary]);
const inv=r=>r.outcomes[r.plan.steps.findIndex(s=>s.checker==='investment')];

test('offer only: one local investment step, no request, ČNB shown as not verified, never green', async () => {
 const {r,calls,loads}=await run({offer:SAFE});
 assert.deepEqual(steps(r),[['investment','P8',true,true]]);
 assert.equal(calls.length,0);assert.equal(loads.count,0);
 const o=inv(r);assert.equal(o.status,'done');assert.deepEqual(o.sourcesContacted,['none']);
 assert.equal(o.result.checker,'investment');assert.equal(o.result.level,'not_assessable');
 assert.equal(o.result.sources.find(s=>s.id==='cnb_registry').status,'skipped');
 assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['not_assessable','A5']);
 assert.equal(JSON.stringify(r).includes('Podílový fond'),false,'no raw offer in the result');
});

test('offer + IČO field: one session + one /api/firm with exactly {"ico"}; the offer never leaves the browser; clean firm is not green', async () => {
 const {r,calls}=await run({offer:SAFE,ico:ICO});
 assert.deepEqual(steps(r),[['investment','P8',true,true],['firm','P3',true,false]]);
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);
 assert.equal(calls[1].body,'{"ico":"27082440"}');assert.equal(leaks(calls),false);
 assert.equal(r.outcomes[1].result.level,'none_found','firm alone may be green');
 assert.equal(r.aggregate.level,'not_assessable','ARES record never makes the investment green');
 assert(!inv(r).result.unknowns.some(u=>/neuvádí IČO/.test(u)),'IČO field fills the provider gap');
});

test('offer + links: local web steps with one ČOI load; no request', async () => {
 const {r,calls,loads}=await run({offer:'Registrace na https://crypto-profit.example/start, druhý web https://shop1.example/. Vklad v USDT.'});
 assert.deepEqual(steps(r),[['investment','P8',true,true],['web','P4',true,false],['web','P4',true,false]]);
 assert.equal(calls.length,0);assert.equal(loads.count,1);
 assert.deepEqual(r.outcomes.slice(1).map(o=>o.sourcesContacted),[['COI'],['COI']]);
 assert.equal(r.aggregate.level,'serious','ČOI lists exactly shop1.example (A1)');
 assert.equal(r.outcomes[2].result.level,'serious');
});

test('all inputs combined (offer with links and IČO + IČO field + URL field): limits, dedup, transparent omissions, real run', async () => {
 const offer='Garantovaný výnos 3 % měsíčně! Viz https://a.example/ https://b.example/ https://c.example/, IČO: 27082440, IČ 00006947.';
 const {r,calls}=await run({offer,ico:ICO,url:'https://field.example/'});
 assert(r.plan.steps.length<=4);
 assert.deepEqual(r.plan.steps.map(s=>s.checker+':'+s.reason.ruleId),['investment:P8','web:P2','firm:P3','web:P4']);
 assert.equal(r.plan.steps.find(s=>s.checker==='web').reason.ruleId,'P2');
 assert.deepEqual(r.plan.steps.filter(s=>s.primary).map(s=>s.checker),['web']);
 assert(r.plan.notPlanned.some(n=>n.kind==='url'&&n.reason==='limit'));
 assert(r.plan.notPlanned.some(n=>n.kind==='ico'&&n.reason==='ambiguous'));
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert.equal(leaks(calls),false);
 assert.deepEqual(r.outcomes.map(o=>o.status),['done','done','done','done']);
 assert.equal(r.aggregate.level,'serious');
 assert.equal(inv(r).result.findings.find(f=>f.ruleId==='inv_guaranteed_return').severity,'serious');
});

test('levels: serious → red, weaker → attention, none → not assessable', async () => {
 assert.equal((await run({offer:SERIOUS})).r.aggregate.level,'serious');
 assert.equal((await run({offer:WEAK})).r.aggregate.level,'attention');
 assert.equal((await run({offer:SAFE})).r.aggregate.level,'not_assessable');
 const {r}=await run({offer:SERIOUS});
 const o=inv(r);
 assert(o.result.facts.every(f=>f.label==='Citace z nabídky'&&f.kind==='user_input'));
 assert(o.result.facts.some(f=>f.value==='bez rizika'));
 assert.equal(r.aggregate.actions.primary,o.result.actions.primary);
});

test('failed investment step: A2 when primary, A3 when a URL field is primary; never looks completed', async () => {
 const broken={deps:{evaluateInvestment:()=>{throw Error('boom');}}};
 const a=await run({offer:SAFE,ico:ICO},broken);
 assert.equal(inv(a.r).status,'failed');assert.deepEqual([a.r.aggregate.level,a.r.aggregate.reasons[0].ruleId],['incomplete','A2']);
 const b=await run({offer:SAFE,url:'https://shop.example/'},broken);
 assert.equal(inv(b.r).status,'failed');assert.deepEqual([b.r.aggregate.level,b.r.aggregate.reasons[0].ruleId],['attention','A3']);
 // An adapter that tries to return a green investment result is rejected → failed.
 const green=await run({offer:SAFE},{deps:{fromInvestment:(e,o)=>({...fromInvestment(e,o),level:'none_found',headline:'Nenašli jsme výrazné varovné signály'})}});
 assert.equal(inv(green.r).status,'failed');assert.notEqual(green.r.aggregate.level,'none_found');
});

test('/api/firm unavailable / rate limited / mismatched: visible, required P3 → A3, optional P5 does not worsen', async () => {
 for(const [firm,status,skipReason] of [[()=>json({code:'X'},503),'failed',undefined],[()=>json({code:'RATE_LIMITED'},429),'skipped','rate_limited'],[()=>{throw TypeError('offline');},'failed',undefined]]){
  const field=await run({offer:SAFE,ico:ICO},{firm});
  assert.equal(field.r.outcomes[1].status,status);assert.equal(field.r.outcomes[1].skipReason,skipReason);
  assert.deepEqual([field.r.aggregate.level,field.r.aggregate.reasons[0].ruleId],['attention','A3']);
  const text=await run({offer:SAFE+' IČO: 27082440'},{firm});
  assert.equal(text.r.plan.steps[1].reason.ruleId,'P5');assert.equal(text.r.outcomes[1].status,status);
  assert.equal(text.r.aggregate.level,'not_assessable');
 }
});

test('deadline: a hanging /api/firm is cut at 5 s and shown as skipped; the investment result stays', async () => {
 const s=setup({firm:init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})),deps:{clock:Date.now}});
 const keepAlive=setInterval(()=>{},250),started=Date.now();let r;
 try{r=await runInvestmentCheck({offer:WEAK,ico:ICO},s.deps);}finally{clearInterval(keepAlive);}
 const took=Date.now()-started;
 assert(took>=4900&&took<6000,'took '+took);
 assert.equal(r.outcomes[0].status,'done');assert.equal(r.outcomes[1].status,'skipped');assert.equal(r.outcomes[1].skipReason,'deadline');
 assert.equal(r.aggregate.level,'attention');
});

test('input validation happens before any request', async () => {
 for(const input of [{offer:''},{offer:'x'.repeat(20001)},{offer:SAFE,ico:'27082441'},{offer:SAFE,url:'ftp://x'}]){
  const s=setup();await assert.rejects(runInvestmentCheck(input,s.deps));assert.equal(s.calls.length,0,JSON.stringify(input).slice(0,40));
 }
 await assert.rejects(runInvestmentCheck({offer:SAFE},{checkWebUrl,coiResult}),/INVALID_FLOW_DEPENDENCIES/);
 assert.throws(()=>planInvestmentCheck({offer:SAFE}),/INVALID_FLOW_DEPENDENCIES/);
});

test('regression: Web + Firma flow is unchanged; check-flow still imports no checker and calls only /api/session and /api/firm', async () => {
 const f=fake();
 const r=await runWebFirmCheck({url:'https://priklad.example/',ico:ICO},{checkWebUrl,coiResult,coiData:Promise.resolve(coi),fetchImpl:f.fetchImpl,clock:()=>now});
 assert.deepEqual(r.plan.steps.map(s=>s.checker),['web','firm']);assert.equal(r.aggregate.level,'not_assessable');
 const src=readFileSync(new URL('../public/check-flow.js',import.meta.url),'utf8');
 assert.deepEqual([...src.matchAll(/^import[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]).sort(),['./check-plan.js','./check-view.js','./verdict-adapters.js','./verdict-model.js']);
 assert.deepEqual([...src.matchAll(/fetchImpl\('([^']+)'/g)].map(m=>m[1]),['/api/session','/api/firm']);
 assert.doesNotMatch(src,/'\/api\/check'|'\/api\/analyze'|innerHTML|insertAdjacentHTML|sendBeacon|localStorage|sessionStorage/);
 const view=readFileSync(new URL('../public/check-view.js',import.meta.url),'utf8');
 assert.match(view,/investment:'Investice'/);assert.doesNotMatch(view,/innerHTML|insertAdjacentHTML/);
});
