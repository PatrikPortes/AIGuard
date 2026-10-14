import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runWebFirmCheck,isValidIco} from '../public/check-flow.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {validateCombinedResult} from '../public/check-plan.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {profile} from '../test-support/firm/profiles.js';

const ico='27082440',url='https://priklad-obchod.example/kosik?token=tajne#platba';
const now=Date.parse('2026-10-14T12:00:00Z');
const records=Object.fromEntries(Array.from({length:100},(_,i)=>['shop'+i+'.example',['Varování ČOI']]));
const coi={schema:1,source:'https://coi.gov.cz/userdata/files/dokumenty-ke-stazeni/open-data/rizikove-seznam.csv',fetchedAt:new Date(now).toISOString(),lastAttemptOk:true,records};
const firmResult=(p=profile())=>fromFirm(p,evaluateFirm(p,{now}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

// Records every request; answers /api/session and /api/firm like the real server.
function fake(firm=()=>json(firmResult())){
 const calls=[];
 return {calls,fetchImpl:async(input,init={})=>{
  calls.push({url:String(input),body:init.body??null});
  if(input==='/api/session')return json({ok:true});
  if(input==='/api/firm')return firm(init);
  throw Error('unexpected request '+input);
 }};
}
const deps=(extra={})=>({checkWebUrl,coiResult,coiData:Promise.resolve(coi),clock:()=>now,...extra});
const leaksUrl=calls=>calls.some(c=>/priklad-obchod|kosik|token|tajne|platba/.test(c.url+' '+(c.body||'')));

test('URL without IČO: only the local web step, no request, never green', async () => {
 const {calls,fetchImpl}=fake();
 const r=await runWebFirmCheck({url},deps({fetchImpl}));
 assert.equal(calls.length,0);
 assert.deepEqual(r.plan.steps.map(s=>[s.checker,s.reason.ruleId,s.runAt]),[['web','P2','client']]);
 assert.equal(r.outcomes[0].status,'done');assert.deepEqual(r.outcomes[0].sourcesContacted,['COI']);
 assert.notEqual(r.aggregate.level,'none_found');
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
});

test('URL + valid IČO: one session + one /api/firm with exactly {"ico"}; URL never leaves the browser', async () => {
 const {calls,fetchImpl}=fake();
 const r=await runWebFirmCheck({url,ico},deps({fetchImpl}));
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);
 assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert.equal(leaksUrl(calls),false);
 assert.deepEqual(r.plan.steps.map(s=>[s.checker,s.reason.ruleId]),[['web','P2'],['firm','P3']]);
 assert.deepEqual(r.outcomes.map(o=>o.status),['done','done']);
 // Web cannot confirm absence → the combination is never green.
 assert.equal(r.aggregate.level,'not_assessable');
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
});

test('invalid IČO never reaches the network', async () => {
 for(const bad of ['27082441','1234567','abcdefgh','27082440 ','../../x']){
  const {calls,fetchImpl}=fake();
  assert.equal(isValidIco(bad),false);
  await assert.rejects(runWebFirmCheck({url,ico:bad},deps({fetchImpl})),/INVALID_ICO/);
  assert.equal(calls.length,0,bad);
 }
 assert.equal(isValidIco(ico),true);
});

test('/api/firm unavailable, rate limited or mismatched: visible, not green, web result kept', async () => {
 const cases=[[()=>json({code:'X'},503),'failed',undefined],[()=>json({code:'RATE_LIMITED'},429),'skipped','rate_limited'],
  [()=>json(firmResult(profile({query:{ico:'00006947'},identity:{...profile().identity,ico:'00006947',dic:'CZ00006947'}}))),'failed',undefined],
  [()=>new Response('not json',{status:200}),'failed',undefined],[()=>{throw TypeError('offline');},'failed',undefined]];
 for(const [firm,status,skipReason] of cases){
  const {fetchImpl}=fake(firm);
  const r=await runWebFirmCheck({url,ico},deps({fetchImpl}));
  assert.equal(r.outcomes[0].status,'done');
  assert.equal(r.outcomes[1].status,status);assert.equal(r.outcomes[1].skipReason,skipReason);
  assert.equal(r.aggregate.level,'attention');assert.equal(r.aggregate.reasons[0].ruleId,'A3');
 }
});

test('timeout: a hanging /api/firm is cut at the plan deadline (5 s) and shown as skipped', async () => {
 const {fetchImpl}=fake((init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})));
 // AbortSignal.timeout does not keep Node's event loop alive (a browser page does).
 const keepAlive=setInterval(()=>{},250),started=Date.now();
 let r;try{r=await runWebFirmCheck({url,ico},deps({fetchImpl,clock:Date.now}));}finally{clearInterval(keepAlive);}
 const took=Date.now()-started;
 assert(took>=4900&&took<6000,'took '+took);
 assert.equal(r.outcomes[1].status,'skipped');assert.equal(r.outcomes[1].skipReason,'deadline');
 assert.notEqual(r.aggregate.level,'none_found');
});

test('aggregation: serious firm or ČOI warning wins; required failure never yields green', async () => {
 const serious=fake(()=>json(firmResult(profile({identity:{...profile().identity,dissolved:'2025-01-01'}}))));
 assert.equal((await runWebFirmCheck({url,ico},deps({fetchImpl:serious.fetchImpl}))).aggregate.level,'serious');
 const coiHit=fake();
 const r=await runWebFirmCheck({url:'https://shop1.example/',ico},deps({fetchImpl:coiHit.fetchImpl}));
 assert.equal(r.aggregate.level,'serious');
 // COI unavailable → web result unverified, still not green.
 const none=fake();
 const u=await runWebFirmCheck({url,ico},deps({fetchImpl:none.fetchImpl,coiData:Promise.reject(Error('offline'))}));
 assert.notEqual(u.aggregate.level,'none_found');assert.equal(u.outcomes[0].status,'done');
});

test('static boundary: flow imports no checker and only calls /api/session and /api/firm', () => {
 const src=readFileSync(new URL('../public/check-flow.js',import.meta.url),'utf8');
 const imports=[...src.matchAll(/^import[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]).sort();
 assert.deepEqual(imports,['./check-plan.js','./check-view.js','./verdict-adapters.js','./verdict-model.js']);
 assert.deepEqual([...src.matchAll(/fetchImpl\('([^']+)'/g)].map(m=>m[1]),['/api/session','/api/firm']);
 assert.doesNotMatch(src,/innerHTML|insertAdjacentHTML|document\.write|sendBeacon|localStorage|sessionStorage/);
 const web=readFileSync(new URL('../public/web-checker.js',import.meta.url),'utf8');
 assert.doesNotMatch(web,/\bfetch\s*\(|innerHTML/);
});
