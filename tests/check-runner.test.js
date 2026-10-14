import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createCheckRunner} from '../src/check-runner.js';
import {createFirmSources} from '../src/firm-sources.js';
import {AdmissionGate} from '../src/http-security.js';
import {WindowLimiter} from '../src/limits.js';
import {createCheckResult} from '../public/verdict-model.js';
import {validateCombinedResult} from '../public/check-plan.js';
import {checkWebUrl} from '../public/web-checker.js';
import {profile} from '../test-support/firm/profiles.js';
const at=Date.parse('2026-10-14T12:00:00.000Z'),ico='27082440';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function flush(){for(let i=0;i<25;i++)await Promise.resolve();}
function fakeClock(){
 let now=at,id=0;const tasks=new Map();
 return {clock:()=>now,timers:{setTimeout(fn,ms){const n=++id;tasks.set(n,{fn,at:now+ms});return n;},clearTimeout(n){tasks.delete(n);}},async tick(ms){const target=now+ms;while(true){const next=[...tasks].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}now=target;await flush();},get pending(){return tasks.size;}};
}
function setup(extra={}){
 const calls=[],gate=new AdmissionGate(2),firmLimiter=new WindowLimiter({limit:20,windowMs:60000,clock:()=>at}),sessionLimiter=new WindowLimiter({limit:10,windowMs:60000,clock:()=>at});
 const deps={firmClient:{profile:async(input)=>{calls.push(input);return profile();}},firmRequests:gate,firmLimiter,firmSessionLimiter:sessionLimiter,clock:()=>at,...extra};
 return {runner:createCheckRunner(deps),calls,gate,firmLimiter,sessionLimiter};
}
const opts={sessionId:'synthetic-session'};
function messageResult(level='not_assessable'){
 return createCheckResult({checker:'message',checkedAt:new Date(at).toISOString(),sources:[{id:'m',label:'Pravidla',status:'checked',checkedAt:new Date(at).toISOString()}],policy:{primary:'m',required:[],canConfirmAbsence:false},findings:level==='serious'?[{id:'s',ruleId:'credentials',origin:'rules',severity:'serious',title:'Zadání přihlašovacích údajů',explanation:'Nezadávejte údaje.',evidence:[]}]:[]});
}

test('prepared plan executes only its steps once, in plan order, with no raw text in output',async()=>{
 const {runner,calls}=setup({adapters:{readCoiSnapshot:async()=>({schema:1,lastAttemptOk:false})}});
 const input={text:'Soukromá zpráva xyz-secret https://a.example https://b.example IČO: '+ico};
 const prepared=runner.prepare(input);input.text='změněný text';
 assert(Object.isFrozen(prepared.plan));const r=await prepared.run(opts);
 assert.deepEqual(r.outcomes.map(o=>o.stepId),['s1','s2','s3','s4']);assert(r.outcomes.every(o=>o.status==='done'));
 assert.deepEqual(calls,[{ico}]);assert(!JSON.stringify(r).includes('xyz-secret'));
 assert.equal(validateCombinedResult(r,{normalizeUrl:checkWebUrl}),r);assert.equal(r.aggregate.level,'attention');
 assert.throws(()=>prepared.run(opts),/PLAN_ALREADY_EXECUTED/);
});

test('standalone URL, extra inputs, invalid IČO and forged checker selection never execute adapters',async()=>{
 let n=0;const {runner}=setup({adapters:{analyze:()=>{n++;throw Error('not reached');}}});
 for(const input of [{url:'https://example.com'},{text:'x',url:'https://example.com'},{ico:'27082441'},{text:'x',checker:'loan'},{text:'x',plan:{steps:[]}},{text:'x',ai:true},{}])assert.throws(()=>runner.prepare(input));
 const getter={};Object.defineProperty(getter,'text',{get(){throw Error('getter invoked');}});assert.throws(()=>runner.prepare(getter),/INVALID_INPUT/);
 assert.equal(n,0);assert.throws(()=>createCheckRunner({adapters:{investment:()=>{}}}),/INVALID_RUNNER_DEPENDENCIES/);
});

test('P6/P7 fan-out and dedup: at most message, two web and one firm, explicit IČO wins',async()=>{
 let web=0;const {runner,calls}=setup({adapters:{checkWebUrl:u=>{web++;return checkWebUrl(u);},readCoiSnapshot:async()=>({})}});
 const r=await runner.run({ico,text:'https://a.example https://a.example/ https://b.example https://c.example IČO: '+ico+' IČO: '+ico},opts);
 assert.equal(r.outcomes.length,4);assert.equal(calls.length,1);assert.equal(r.plan.steps.filter(s=>s.checker==='web').length,2);
 assert.equal(r.plan.steps.filter(s=>s.checker==='firm').length,1);assert(r.plan.notPlanned.some(s=>s.reason==='duplicate'));assert(r.plan.notPlanned.some(s=>s.reason==='limit'));
 assert.equal(r.plan.steps.find(s=>s.checker==='firm').reason.ruleId,'P3');assert(web>0);
});

test('two parallel plans reuse the injected existing client in-flight dedup and cache, no parallel client',async()=>{
 const wait=deferred();let upstream=0,dph=0;
 const client=createFirmSources({relay:{authorization:'Bearer synthetic'},clock:()=>at,fetchImpl:async(url)=>{
  if(url.endsWith('ares-profile')){upstream++;await wait.promise;return Response.json(profile());}
  if(url.endsWith('dph')){dph++;return Response.json(profile().vat);}throw Error('unexpected upstream');
 }});
 const {runner}=setup({firmClient:client});const a=runner.run({ico},{sessionId:'a'}),b=runner.run({ico},{sessionId:'b'});
 await flush();assert.equal(upstream,1);wait.resolve();const results=await Promise.all([a,b]);
 assert(results.every(r=>r.outcomes[0].status==='done'));assert.equal(upstream,1);assert.equal(dph,1);
 await runner.run({ico},{sessionId:'c'});assert.equal(upstream,1);assert.equal(dph,1);
});

test('shared global/session limiter or admission exhaustion => skipped rate_limited, never green',async()=>{
 for(const blocked of ['firmLimiter','firmSessionLimiter']){
  const limit=new WindowLimiter({limit:0,windowMs:60000,clock:()=>at}),x=setup({[blocked]:limit});
  const r=await x.runner.run({ico},opts);assert.equal(r.outcomes[0].skipReason,'rate_limited');assert.equal(r.aggregate.level,'incomplete');assert.equal(x.calls.length,0);
 }
 const gate=new AdmissionGate(1),release=gate.enter(),x=setup({firmRequests:gate});
 const r=await x.runner.run({text:'Obsah',ico},opts);assert.equal(r.outcomes[1].skipReason,'rate_limited');assert.equal(r.aggregate.reasons[0].ruleId,'A3');release();assert.equal(x.calls.length,0);
});

test('shared session quota is charged on the original limiter instance, not a private replacement',async()=>{
 const limit=new WindowLimiter({limit:1,windowMs:60000,clock:()=>at}),x=setup({firmSessionLimiter:limit});
 assert.equal((await x.runner.run({ico},opts)).outcomes[0].status,'done');
 assert.equal((await x.runner.run({ico},opts)).outcomes[0].skipReason,'rate_limited');assert.equal(x.calls.length,1);
});

test('five-second deadline with fake clocks bounds an adapter ignoring cancellation; late completion cannot alter output',async()=>{
 const time=fakeClock(),wait=deferred(),x=setup({...time,adapters:{analyze:()=>wait.promise,fromMessage:()=>messageResult()}});
 let settled=false;const p=x.runner.run({text:'Obsah'},opts).then(r=>{settled=true;return r;});await flush();await time.tick(4999);assert(!settled);
 await time.tick(1);const r=await p;assert.equal(r.outcomes[0].skipReason,'deadline');assert.equal(r.outcomes[0].durationMs,5000);assert.equal(r.aggregate.level,'incomplete');assert(time.clock()-at<5200);
 const original=JSON.stringify(r);wait.resolve({});await flush();assert.equal(JSON.stringify(r),original);assert.equal(time.pending,0);
});

test('firm four-second sub-budget returns deadline but holds admission until ignored operation settles',async()=>{
 const time=fakeClock(),wait=deferred();let signal;
 const x=setup({...time,firmClient:{profile:(input,o)=>{signal=o.signal;return wait.promise;}}});
 const p=x.runner.run({text:'Obsah',ico},opts);await flush();assert.equal(x.gate.active,1);
 await time.tick(4000);const r=await p;assert.equal(r.outcomes[1].skipReason,'deadline');assert.equal(r.aggregate.reasons[0].ruleId,'A3');assert(signal.aborted);assert.equal(x.gate.active,1);
 wait.resolve(profile());await flush();assert.equal(x.gate.active,0);assert.equal(time.pending,0);
});

test('external cancellation before admission and during execution returns deadline conservatively',async()=>{
 const c=new AbortController();c.abort();const x=setup();const r=await x.runner.run({ico},{...opts,signal:c.signal});assert.equal(r.outcomes[0].skipReason,'deadline');assert.equal(x.calls.length,0);
 const time=fakeClock(),wait=deferred(),y=setup({...time,adapters:{analyze:()=>wait.promise}}),controller=new AbortController();
 const p=y.runner.run({text:'Obsah'},{...opts,signal:controller.signal});await flush();controller.abort();const result=await p;assert.equal(result.outcomes[0].skipReason,'deadline');wait.reject(Error('late rejection'));await flush();assert.equal(time.pending,0);
});

test('adapter failure/invalid result fails only that step; trustworthy red survives other failures',async()=>{
 const x=setup({firmClient:{profile:async()=>{throw Error('private upstream error');}},adapters:{analyze:()=>({}),fromMessage:()=>messageResult('serious')}});
 const r=await x.runner.run({text:'Obsah',ico},opts);assert.equal(r.outcomes[1].status,'failed');assert.equal(r.aggregate.level,'serious');assert(!JSON.stringify(r).includes('private upstream'));assert.equal(x.gate.active,0);
 for(const change of [r=>r.checker='firm',r=>r.raw='secret',r=>r.actions.raw='secret']){
  const x=setup({adapters:{analyze:()=>({}),fromMessage:()=>{const r=messageResult();change(r);return r;}}});
  assert.equal((await x.runner.run({text:'Obsah'},opts)).outcomes[0].status,'failed');
 }
});

test('COI snapshot failure remains unverified and cannot reassure; URL checker makes no target request',async()=>{
 const x=setup({adapters:{readCoiSnapshot:()=>{throw Error('missing snapshot');}}});
 const r=await x.runner.run({text:'https://shop.example'},opts);assert.equal(r.outcomes[1].status,'done');assert.equal(r.outcomes[1].result.sources.find(s=>s.id==='coi').status,'unavailable');assert.notEqual(r.aggregate.level,'none_found');assert.equal(x.calls.length,0);
});

test('outcomes stay in plan order when adapters finish out of order; only planned adapters execute',async()=>{
 const time=fakeClock(),wait=deferred(),x=setup({...time,adapters:{analyze:()=>wait.promise,fromMessage:()=>messageResult()}});
 const p=x.runner.run({text:'Obsah',ico},opts);await flush();assert.equal(x.calls.length,1);wait.resolve({});const r=await p;assert.deepEqual(r.outcomes.map(o=>o.stepId),['s1','s2']);assert.equal(time.pending,0);
});

test('missing shared dependencies fail closed; upstream-contact metadata is not invented from cached facts',async()=>{
 const runner=createCheckRunner({clock:()=>at});const r=await runner.run({ico},opts);assert.equal(r.outcomes[0].status,'failed');assert.equal(r.aggregate.level,'incomplete');
 const x=setup(),ok=await x.runner.run({ico},opts);assert.deepEqual(ok.outcomes[0].sourcesContacted,[]);assert(ok.outcomes[0].result.sources.some(s=>s.id==='ares'&&s.status==='checked'));
 const y=setup({firmSourcesContacted:()=>['ARES','ARES_VR','ARES_RES','DPH']});assert.deepEqual((await y.runner.run({ico},opts)).outcomes[0].sourcesContacted,['ARES','ARES_VR','ARES_RES','DPH']);
});

test('existing rules keep their input limit: oversized 20k planner text fails safely rather than changing checker',async()=>{
 const x=setup();const r=await x.runner.run({text:'x'.repeat(20000)},opts);assert.equal(r.outcomes[0].status,'failed');assert.equal(r.aggregate.level,'incomplete');
});

test('static runner and checker boundaries: no direct network, AI pipeline, new clients or recursive imports',()=>{
 const source=readFileSync(new URL('../src/check-runner.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\b|XMLHttpRequest|WebSocket|createFirmSources|new\s+(?:WindowLimiter|AdmissionGate)|ai\/|check-runner\.js['"]/);
 const files=['src/analysis.js','src/firm-sources.js','src/firm-rules.js','ai-proxy.cjs',...readdirSync(new URL('../public/',import.meta.url)).filter(f=>/^(?:web-checker|eshop-checker|contract-|loan-|firm)/.test(f)&&f.endsWith('.js')).map(f=>'public/'+f)];
 for(const file of files){const s=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.doesNotMatch(s,/\b(?:import|export)\b[^;\n]*['"][^'"]*(?:check-runner|check-plan)\.js['"]/,file);}
});

test('optional firm rate limit is visible without hiding completed message; no result-driven fan-out',async()=>{
 const limit=new WindowLimiter({limit:0,windowMs:60000,clock:()=>at});
 const x=setup({firmLimiter:limit});const r=await x.runner.run({text:'IČO: '+ico},opts);
 assert.equal(r.outcomes[1].skipReason,'rate_limited');assert.equal(r.plan.steps[1].required,false);assert.equal(r.aggregate.level,'not_assessable');
 const y=setup({adapters:{analyze:()=>({next:'https://other.example IČO: '+ico}),fromMessage:()=>messageResult()}});
 const only=await y.runner.run({text:'Běžná zpráva'},opts);assert.equal(only.outcomes.length,1);assert.equal(y.calls.length,0);
});

test('combined deadlines preserve partial results at four seconds and finish remaining work by five',async()=>{
 const time=fakeClock(),message=deferred(),registry=deferred();
 const x=setup({...time,firmClient:{profile:()=>registry.promise},adapters:{analyze:()=>message.promise,fromMessage:()=>messageResult()}});
 let done=false;const p=x.runner.run({text:'Obsah',ico},opts).then(r=>{done=true;return r;});await flush();await time.tick(4000);assert(!done);
 await time.tick(1000);const r=await p;assert.deepEqual(r.outcomes.map(o=>o.skipReason),['deadline','deadline']);assert.deepEqual(r.outcomes.map(o=>o.durationMs),[5000,4000]);assert.equal(r.aggregate.level,'incomplete');
 message.reject(Error('late'));registry.resolve(profile());await flush();assert.equal(x.gate.active,0);assert.equal(time.pending,0);
});
