// S3.7: Zpráva + Web + Firma on the message page (client runner, no /api/check).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runMessageCheck,planMessageCheck} from '../public/check-flow.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {validateCombinedResult,BUDGET} from '../public/check-plan.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {analyze} from '../src/analysis.js';
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
// coiData as a function: the snapshot is loaded only for a planned web step.
function deps(extra={}){
 const loads={count:0};
 return {loads,deps:{checkWebUrl,coiResult,coiData:()=>{loads.count++;return Promise.resolve(coi);},clock:()=>now,...extra}};
}
// The real rules analysis the page receives from the existing /api/analyze.
const analysisOf=text=>analyze({type:'text',content:text});
const SECRET=/banka-priklad|tajne|kosik|shop1|platba/;
const leaks=calls=>calls.some(c=>SECRET.test(c.url+' '+(c.body||'')));
async function run(text,{firm,extra,analysis}={}){
 const f=fake(firm),d=deps({fetchImpl:f.fetchImpl,...extra});
 const r=await runMessageCheck({text,analysis:analysis??await analysisOf(text),analysisMs:120},d.deps);
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
 return {r,calls:f.calls,loads:d.loads};
}
const steps=r=>r.plan.steps.map(s=>[s.checker,s.reason.ruleId]);

test('text without URL and IČO: only the message step, no request, no ČOI load, never green', async () => {
 const {r,calls,loads}=await run('Ahoj, zítra se potkáme v deset u knihovny.');
 assert.deepEqual(steps(r),[['message','P1']]);
 assert.equal(calls.length,0);assert.equal(loads.count,0);
 assert.equal(r.outcomes[0].status,'done');assert.equal(r.outcomes[0].durationMs,120);
 assert.notEqual(r.aggregate.level,'none_found');
 assert.equal(JSON.stringify(r).includes('knihovny'),false,'no raw text in the result');
});

test('text with one URL: message + one local web step; the URL is never requested', async () => {
 const text='Vaše banka: ihned zadejte heslo na https://banka-priklad.invalid/login?token=tajne, jinak účet zablokujeme.';
 const {r,calls,loads}=await run(text);
 assert.deepEqual(steps(r),[['message','P1'],['web','P4']]);
 assert.equal(r.plan.steps[1].runAt,'client');assert.equal(r.plan.steps[1].primary,false);
 assert.equal(calls.length,0);assert.equal(loads.count,1);
 assert.deepEqual(r.outcomes[1].sourcesContacted,['COI']);
 assert.equal(r.aggregate.level,'serious','message credentials rule keeps red');
 assert.equal(r.aggregate.reasons[0].ruleId,'A1');
});

test('text with two URLs: two web steps; the ČOI snapshot is loaded once', async () => {
 const {r,calls,loads}=await run('Objednávka: https://shop1.example/kosik a www.priklad-dva.example/platba');
 assert.deepEqual(steps(r),[['message','P1'],['web','P4'],['web','P4']]);
 assert.equal(loads.count,1);assert.equal(calls.length,0);
 // shop1.example is on the ČOI list → serious wins (A1).
 assert.equal(r.aggregate.level,'serious');
});

test('text with more than two URLs: max 2 web steps, the rest is visible as not planned (P7 limit)', async () => {
 const {r}=await run('Odkazy: https://a.example/ https://b.example/ https://c.example/ https://d.example/');
 assert.equal(r.plan.steps.filter(s=>s.checker==='web').length,BUDGET.maxUrls);
 assert(r.plan.steps.length<=BUDGET.maxSteps);
 assert.deepEqual(r.plan.notPlanned.filter(n=>n.reason==='limit').map(n=>n.kind),['url','url']);
});

test('text with a valid labelled IČO: one session + one /api/firm with exactly {"ico"}; optional step', async () => {
 const text='Faktura od dodavatele, IČO: 27082440, zaplaťte na https://banka-priklad.invalid/platba';
 const {r,calls}=await run(text);
 assert.deepEqual(steps(r),[['message','P1'],['web','P4'],['firm','P5']]);
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);
 assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert.equal(leaks(calls),false,'URL and text never leave the browser through this runner');
 const firm=r.plan.steps[2];assert.equal(firm.required,false);assert.equal(firm.trigger,'extracted_from_text');
 assert.equal(r.outcomes[2].status,'done');
});

test('invalid or ambiguous IČO never reaches the network and is listed as not planned', async () => {
 const invalid=await run('Platbu pošlete firmě IČO 27082441 ještě dnes.');
 assert.deepEqual(steps(invalid.r),[['message','P1']]);assert.equal(invalid.calls.length,0);
 assert.deepEqual(invalid.r.plan.notPlanned,[{kind:'ico',value:'27082441',reason:'invalid'}]);
 const unlabelled=await run('Číslo objednávky 27082440, děkujeme.');
 assert.deepEqual(steps(unlabelled.r),[['message','P1']]);assert.equal(unlabelled.calls.length,0);
 const two=await run('Dodavatel IČ 27082440, odběratel IČO 00006947.');
 assert.deepEqual(steps(two.r),[['message','P1']]);assert.equal(two.calls.length,0);
 assert.deepEqual(two.r.plan.notPlanned.map(n=>n.reason),['ambiguous','ambiguous']);
});

test('registry unavailable, rate limited or mismatched: visible, optional firm does not lower or replace the message verdict', async () => {
 const text='Ahoj, pošli prosím zálohu firmě IČO 27082440.';
 const baseline=(await run(text)).r.aggregate.level;
 for(const [firm,status,skipReason] of [[()=>json({code:'X'},503),'failed',undefined],[()=>json({code:'RATE_LIMITED'},429),'skipped','rate_limited'],
  [()=>json(firmResult(profile({query:{ico:'00006947'},identity:{...profile().identity,ico:'00006947',dic:'CZ00006947'}}))),'failed',undefined],[()=>{throw TypeError('offline');},'failed',undefined]]){
  const {r}=await run(text,{firm});
  assert.equal(r.outcomes[0].status,'done');
  assert.equal(r.outcomes[1].status,status);assert.equal(r.outcomes[1].skipReason,skipReason);
  assert.notEqual(r.aggregate.level,'none_found');
  assert.equal(r.aggregate.level,baseline==='none_found'?'not_assessable':baseline);
 }
});

test('timeout: a hanging /api/firm is cut at the 5 s plan deadline; the message result stays', async () => {
 const f=fake(init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})));
 const keepAlive=setInterval(()=>{},250),started=Date.now();let r;
 try{r=await runMessageCheck({text:'Zálohu pošlete firmě IČO 27082440.',analysis:await analysisOf('Zálohu pošlete firmě IČO 27082440.')},{...deps({fetchImpl:f.fetchImpl,clock:Date.now}).deps});}
 finally{clearInterval(keepAlive);}
 const took=Date.now()-started;
 assert(took>=4900&&took<6000,'took '+took);
 assert.equal(r.outcomes[0].status,'done');
 assert.equal(r.outcomes[1].status,'skipped');assert.equal(r.outcomes[1].skipReason,'deadline');
 assert.notEqual(r.aggregate.level,'none_found');
});

test('aggregation: serious firm wins; missing ČOI keeps the web step unverified; invalid analysis fails the primary step', async () => {
 const text='Zálohu pošlete firmě IČO 27082440.';
 const serious=await run(text,{firm:()=>json(firmResult(profile({identity:{...profile().identity,dissolved:'2025-01-01'}})))});
 assert.equal(serious.r.aggregate.level,'serious');assert.equal(serious.r.aggregate.reasons[0].stepId,'s2');
 const offline=await run('Platba na https://banka-priklad.invalid/',{extra:{coiData:()=>Promise.reject(Error('offline'))}});
 assert.equal(offline.r.outcomes[1].status,'done');
 assert(offline.r.outcomes[1].result.sources.some(s=>s.status!=='checked'),'ČOI marked unverified');
 assert.notEqual(offline.r.aggregate.level,'none_found');
 const broken=await run('Platba na https://banka-priklad.invalid/',{analysis:{summary:'x'}});
 assert.equal(broken.r.outcomes[0].status,'failed');assert.equal(broken.r.aggregate.level,'incomplete');assert.equal(broken.r.aggregate.reasons[0].ruleId,'A2');
});

test('every step result separates verified facts, risk signals, unverified items and incomplete checks', async () => {
 const {r}=await run('Faktura IČO 27082440, platba na https://banka-priklad.invalid/ heslo zadejte ihned.');
 for(const o of r.outcomes.filter(o=>o.status==='done')){
  for(const key of ['facts','findings','unknowns','sources'])assert(Array.isArray(o.result[key]),key);
 }
 const firm=r.outcomes.find(o=>o.result?.checker==='firm');
 assert(firm.result.facts.some(f=>f.kind==='registry'),'registry facts are the only verified facts');
 // Message rules are indicators only: no verified fact, findings carry the signals.
 const msg=r.outcomes.find(o=>o.result?.checker==='message');
 assert.equal(msg.result.facts.some(f=>f.kind==='registry'),false);assert(msg.result.findings.length>0);
 assert(msg.result.unknowns.length>0,'unverified items are stated');
});

test('no score or percentage anywhere in the combined result', async () => {
 const {r}=await run('Vaše banka: zadejte heslo na https://banka-priklad.invalid/ IČO 27082440');
 const s=JSON.stringify(r);
 assert.doesNotMatch(s,/risk_score|\d\s*%|\/\s*100/);
});

test('planner is the existing check-plan: deterministic and bounded for 40k-character abuse', async () => {
 const text=('https://x'+'a'.repeat(30)+'.example/ IČO 27082440 ').repeat(200).slice(0,10000);
 const a=planMessageCheck(text,{checkWebUrl}),b=planMessageCheck(text,{checkWebUrl});
 assert.deepEqual(a,b);assert(a.steps.length<=4);
 assert.throws(()=>planMessageCheck('x'.repeat(20001),{checkWebUrl}),/INVALID_TEXT/);
});

test('static boundary: the message page uses the client runner, not /api/check, and never imports a checker into the planner', () => {
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/\/api\/check\b/);
 assert.deepEqual([...app.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]).sort(),['/api/analyze','/api/session','/eshop-coi.json']);
 assert.doesNotMatch(app,/innerHTML|insertAdjacentHTML|document\.write|sendBeacon|localStorage|sessionStorage/);
 const flow=readFileSync(new URL('../public/check-flow.js',import.meta.url),'utf8');
 assert.deepEqual([...flow.matchAll(/fetchImpl\('([^']+)'/g)].map(m=>m[1]),['/api/session','/api/firm']);
 const html=readFileSync(new URL('../public/message.html',import.meta.url),'utf8');
 assert.match(html,/<link rel="stylesheet" href="\/verdict.css">/);
 assert.match(html,/<section id="check-combined" class="check-combined" aria-live="polite" hidden><\/section>/);
 // F5a markers stay: neutral heading, server-ordered first action.
 assert.match(html,/id="result-title">Co jsme zjist/);assert.match(html,/id="primary-action"/);
 assert.match(app,/F5a interim result: neutral heading, no score/);
});

test('checker modules attach their page handlers only on the Web page', () => {
 for(const [file,selector] of [['web-checker.js','#web-form'],['eshop-checker.js','#operator-form']]){
  const src=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
  assert(src.includes(`if(typeof document!=='undefined'&&document.querySelector('${selector}')){`),file);
 }
});
