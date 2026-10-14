// Stage 5 S5.2: Loan → Firm (planner P9, runner adoption of fromLoan, /api/firm only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCheck,validateCheckPlan,CHECKER_REGISTRY,PLANNER_RULES,BUDGET} from '../public/check-plan.js';
import {runLoanCheck,planLoanCheck} from '../public/check-flow.js';
import {LOAN_AUTHORISATION_NOTE,REGISTRY_CONTEXT} from '../public/check-view.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {validateCombinedResult} from '../public/check-plan.js';
import {analyze} from '../src/analysis.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {createCheckRunner} from '../src/check-runner.js';
import {profile} from '../test-support/firm/profiles.js';

const client={runAt:'client',normalizeUrl:checkWebUrl};
const ICO='27082440',now=Date.parse('2026-10-14T12:00:00Z');
const sig=p=>p.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary,s.runAt]);
const SAFE='Dobrý den, posíláme nabídku spotřebitelského úvěru 50 000 Kč na 24 měsíců, smlouvu vám zašleme k prostudování.';
const RISKY='Půjčka 50 000 Kč ihned bez registru, nejdřív zaplaťte poplatek 2 000 Kč a pošlete kód z SMS.';
const loanAnalysis=text=>analyze({type:'text',content:text,topic:'loan',loan_context:{}});
const firmResult=(p=profile())=>fromFirm(p,evaluateFirm(p,{now}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
// Only /api/session and /api/firm exist here: any /api/analyze call would throw.
function fake(firm=()=>json(firmResult())){
 const calls=[];
 return {calls,fetchImpl:async(input,init={})=>{calls.push({url:String(input),body:init.body??null});
  if(input==='/api/session')return json({ok:true});if(input==='/api/firm')return firm(init);throw Error('unexpected request '+input);}};
}
async function run(loan,{ico,firm,analysis}={}){
 const f=fake(firm);
 const r=await runLoanCheck({loan,ico,analysis:analysis??await loanAnalysis(loan),analysisMs:80},{checkWebUrl,coiResult,coiData:null,fetchImpl:f.fetchImpl,clock:()=>now});
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
 return {r,calls:f.calls};
}
const leaks=(calls,text)=>calls.some(c=>(c.url+' '+(c.body||'')).includes(text.slice(0,20)));

test('P9: registry entry and rule are additive; loan is a required primary step adopted from the server analysis', () => {
 assert.deepEqual(CHECKER_REGISTRY.loan,{entityKinds:['loan_text'],runAt:'server',requiredDefault:true});
 assert.deepEqual(PLANNER_RULES.map(r=>r.id),['P1','P2','P3','P4','P5','P6','P7','P8','P9']);
 const p=planCheck({loan:'  '+SAFE+'  '},client);
 assert.deepEqual(sig(p),[['loan','P9',true,true,'server']]);
 assert.deepEqual(p.steps[0].input,{kind:'text',ref:'loan'});assert.equal(p.steps[0].reason.text,'Vložili jste text nabídky půjčky.');
 assert.deepEqual(p.input.loan,{present:true,chars:SAFE.length});assert.equal(p.input.text,null);
 assert.equal(JSON.stringify(p).includes('spotřebitelského'),false,'no raw loan text in the plan');
});

test('P9 with IČO: field → required P3 (not primary); labelled IČO in text → optional P5; dedup; ambiguity', () => {
 assert.deepEqual(sig(planCheck({loan:SAFE,ico:ICO},client)),[['loan','P9',true,true,'server'],['firm','P3',true,false,'server']]);
 assert.deepEqual(sig(planCheck({loan:SAFE+' Poskytovatel IČO: 27082440.'},client)),[['loan','P9',true,true,'server'],['firm','P5',false,false,'server']]);
 const dup=planCheck({loan:SAFE+' IČO 27082440',ico:ICO},client);
 assert.deepEqual(sig(dup),[['loan','P9',true,true,'server'],['firm','P3',true,false,'server']]);assert.deepEqual(dup.notPlanned,[{kind:'ico',value:ICO,reason:'duplicate'}]);
 const many=planCheck({loan:'Věřitel IČO 27082440, zprostředkovatel IČ 00006947.'},client);
 assert.deepEqual(sig(many),[['loan','P9',true,true,'server']]);assert.deepEqual(many.notPlanned.map(n=>n.reason),['ambiguous','ambiguous']);
 assert.throws(()=>planCheck({loan:SAFE,ico:'27082441'},client),/INVALID_ICO/);
 // Links in the loan text are checked in the browser (P4); limits hold.
 const links=planCheck({loan:'https://a.example/ https://b.example/ https://c.example/ IČO: 27082440'},client);
 assert(links.steps.length<=BUDGET.maxSteps);assert.equal(links.steps.filter(s=>s.checker==='web').length,2);
 assert.equal(links.steps.filter(s=>s.checker==='firm').length,1);assert(links.notPlanned.some(n=>n.reason==='limit'));
});

test('P9 boundaries: browser-only planning, exclusive with text/offer, never on /api/check, tampering rejected', () => {
 assert.throws(()=>planCheck({loan:SAFE},{normalizeUrl:checkWebUrl}),/LOAN_NOT_ALLOWED/);
 assert.throws(()=>planCheck({loan:SAFE,text:'x'},client),/INVALID_INPUT/);
 assert.throws(()=>planCheck({loan:SAFE,offer:'x'},client),/INVALID_INPUT/);
 for(const bad of ['','   ',42,'x'.repeat(20001)])assert.throws(()=>planCheck({loan:bad},client),/INVALID_LOAN/);
 const runner=createCheckRunner({firmClient:{profile:async()=>{throw Error('no');}},firmRequests:{enter:()=>()=>{}},firmLimiter:{check(){}},firmSessionLimiter:{check(){}}});
 assert.throws(()=>runner.prepare({loan:SAFE}),/INVALID_INPUT/);
 const p=structuredClone(planCheck({loan:SAFE,ico:ICO},client)),v=x=>validateCheckPlan(x,{normalizeUrl:checkWebUrl});
 for(const mutate of [c=>{c.steps[0].runAt='client';},c=>{c.steps[0].required=false;},c=>{c.steps[0].primary=false;},c=>{c.steps[1].primary=true;},c=>{delete c.input.loan;},c=>{c.input.offer={present:true,chars:3};}]){
  const c=structuredClone(p);mutate(c);assert.throws(()=>v(c),/INVALID_PLAN/);
 }
});

test('loan without IČO: adopted result only, no request at all, never green, ČNB authorisation gap stated', async () => {
 const {r,calls}=await run(SAFE);
 assert.deepEqual(r.plan.steps.map(s=>s.checker),['loan']);assert.equal(calls.length,0);
 const o=r.outcomes[0];assert.equal(o.status,'done');assert.equal(o.result.checker,'loan');assert.equal(o.durationMs,80);
 assert(o.result.unknowns.includes('Poskytovatele ani jeho oprávnění od ČNB jsme neověřili.'));
 assert(o.result.verifyLinks.some(l=>l.url==='https://www.cnb.cz/cs/dohled-financni-trh/seznamy/'));
 assert.notEqual(r.aggregate.level,'none_found');
});

test('loan + valid IČO: exactly one session + one /api/firm with {"ico"}; no /api/analyze; text never sent; clean firm not green', async () => {
 const {r,calls}=await run(SAFE,{ico:ICO});
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert.equal(leaks(calls,SAFE),false);
 assert.equal(r.outcomes[1].result.level,'none_found','the firm alone may be green');
 assert.equal(r.aggregate.level,'not_assessable','registry presence never improves the loan verdict (A5)');
});

test('risky loan stays red with a clean firm; risky (dissolved) firm makes a quiet loan red', async () => {
 assert.equal((await run(RISKY,{ico:ICO})).r.aggregate.level,'serious');
 const dissolved=()=>json(firmResult(profile({identity:{...profile().identity,dissolved:'2025-01-01'}})));
 const {r}=await run(SAFE,{ico:ICO,firm:dissolved});
 assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId,r.aggregate.reasons[0].stepId],['serious','A1','s2']);
});

test('/api/firm unavailable: required P3 → attention (A3); optional P5 does not worsen', async () => {
 for(const firm of [()=>json({code:'X'},503),()=>json({code:'RATE_LIMITED'},429),()=>{throw TypeError('offline');}]){
  const field=await run(SAFE,{ico:ICO,firm});
  assert.notEqual(field.r.outcomes[1].status,'done');assert.deepEqual([field.r.aggregate.level,field.r.aggregate.reasons[0].ruleId],['attention','A3']);
  const text=await run(SAFE+' IČO: 27082440',{firm});
  assert.notEqual(text.r.outcomes[1].status,'done');assert.equal(text.r.aggregate.level,'not_assessable');
 }
});

test('failed loan analysis (invalid adopted result) fails the primary step → incomplete, never green', async () => {
 const {r,calls}=await run(SAFE,{ico:ICO,analysis:{summary:'x'}});
 assert.equal(r.outcomes[0].status,'failed');assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['incomplete','A2']);
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm'],'still at most one firm call');
});

test('at most one /api/firm per combined check (property over random loan texts)', async () => {
 let seed=11;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
 const bits=['IČO: 27082440','IČ 00006947','IČO 25596641','https://x.example/','www.y.example','půjčka','poplatek předem'];
 for(let i=0;i<60;i++){
  const loan=Array.from({length:1+rnd(6)},()=>bits[rnd(bits.length)]).join(' ');
  const {calls}=await run(loan,{ico:rnd(2)?ICO:undefined,analysis:await loanAnalysis(loan)});
  assert(calls.filter(c=>c.url==='/api/firm').length<=1,loan);assert(calls.every(c=>c.url!=='/api/analyze'));
 }
});

test('view copy and static boundaries', () => {
 assert.equal(LOAN_AUTHORISATION_NOTE,'Oprávnění poskytovat spotřebitelské úvěry (ČNB) jsme automaticky neověřili.');
 assert.match(REGISTRY_CONTEXT.loan.neutral,/nepotvrzuje oprávnění poskytovat spotřebitelské úvěry/);
 assert.throws(()=>planLoanCheck({loan:SAFE}),/INVALID_FLOW_DEPENDENCIES/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.deepEqual([...app.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]).sort(),['/api/analyze','/api/session','/eshop-coi.json']);
 assert.match(app,/if \(loanIcoInput\?\.value\.trim\(\) && !validIcoDigits\(loanIcoInput\.value\.trim\(\)\)\) \{ showError\('INVALID_ICO'\);/);
 const flow=readFileSync(new URL('../public/check-flow.js',import.meta.url),'utf8');
 assert.deepEqual([...flow.matchAll(/fetchImpl\('([^']+)'/g)].map(m=>m[1]),['/api/session','/api/firm']);
 const html=readFileSync(new URL('../public/loan.html',import.meta.url),'utf8');
 assert.match(html,/<input id="loan-ico" type="text" inputmode="numeric" pattern="\[0-9\]\{8\}" maxlength="8"/);
 assert.doesNotMatch(html,/<input id="loan-ico"[^>]*\sname=/);
 assert.match(html,/<section id="check-combined" class="check-combined" aria-live="polite" hidden><\/section>/);
 // validIcoDigits in app.js matches check-plan validIco.
 const fn=new Function('return '+app.match(/const validIcoDigits = (ico => [^;]+);/)[1])();
 for(const ico of ['27082440','00006947','25596641','27082441','1234567','abcdefgh'])assert.equal(fn(ico),/^\d{8}$/.test(ico)&&planCheckIcoValid(ico),ico);
});
function planCheckIcoValid(ico){try{planCheck({ico});return true;}catch{return false;}}
