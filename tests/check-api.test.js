import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from '../src/server.js';
import {createFirmSources} from '../src/firm-sources.js';
import {profile} from '../test-support/firm/profiles.js';
import {validateCombinedResult} from '../public/check-plan.js';
// Committed reference sources, byte-identical to the given commit (verified by Git blob id),
// so these comparisons also run in git archive / Docker builds without .git.
function baselineSource(file,blobId){const bytes=readFileSync(new URL('../test-support/baselines/'+file,import.meta.url));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),blobId,file+' must equal the reference blob');return bytes.toString('utf8');}
import {checkWebUrl} from '../public/web-checker.js';
const ico='27082440';
async function app(t,extra={}){
 const {factory=createServer,...options}=extra;const calls=[];const server=factory({registryRelay:null,rateLimit:1000,sessionRateLimit:1000,firmSources:{profile:async b=>{calls.push(b);return profile();}},...options});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(input,path='/api/check',headers={},raw)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:raw??JSON.stringify(input)});
 const cookie=async()=>(await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 return {server,base,post,cookie,calls};
}
test('text, IČO and combined input => stable validated CombinedResult without AI calls',async t=>{
 const a=await app(t,{pipeline:{status:()=>({mode:'rules'}),validate:()=>{throw Error('AI validation');},analyze:()=>{throw Error('AI called');},close(){}}});
 for(const body of [{text:'Běžná zpráva'},{ico},{text:'IČO: '+ico,ico},{text:'https://example.com'}]){
  const r=await a.post(body);assert.equal(r.status,200);const data=await r.json();assert.equal(validateCombinedResult(data,{normalizeUrl:checkWebUrl}),data);assert.deepEqual(Object.keys(data),['schema','kind','plan','outcomes','aggregate','checkedAt']);assert(!JSON.stringify(data).includes('Běžná zpráva'));assert(!data.outcomes.some(o=>o.result?.ai?.status==='performed'));
 }
 assert.deepEqual(a.calls,[{ico},{ico}]);
});
test('strict flat schema rejects url, unknown fields, types, duplicate and escaped duplicate keys',async t=>{
 const a=await app(t);
 for(const body of [{url:'https://example.com'},{text:'x',url:'https://example.com'},{text:4},{ico:27082440},{text:null},[],null,{}, {ico:'27082441'},{text:' '},{text:'x',ai:true},{text:'x',sender:'test'}])assert.equal((await a.post(body)).status,400,JSON.stringify(body));
 for(const raw of ['{"text":"x","text":"y"}','{"ico":"27082440","\\u0069co":"27082440"}','{"text":"x","nested":{"ico":"27082440"}}'])assert.equal((await a.post(null,'/api/check',{},raw)).status,400);
 assert.equal(a.calls.length,0);
 const tricky='Řekl: "url": "https://example.com"\nČárka, složená závorka }';assert.equal((await a.post({text:tricky})).status,200);
 assert.equal((await a.post(null,'/api/check',{},'{"\\u0074ext":"Obsah"}')).status,200);
});
test('10000 allowed, 10001/20000 rejected explicitly without truncation; body cap is 64 kB',async t=>{
 const a=await app(t);assert.equal((await a.post({text:'x'.repeat(10000)})).status,200);
 for(const n of [10001,20000]){const r=await a.post({text:'x'.repeat(n),ico});assert.equal(r.status,400);assert.match((await r.json()).error,/10 000/);}
 const r=await a.post({text:'x'.repeat(65536)});assert.equal(r.status,400);assert.equal((await r.json()).code,'BODY_TOO_LARGE');assert.equal(a.calls.length,0);
 assert.equal((await a.post({content:'x'.repeat(65536),type:'text'},'/api/analyze')).status,413);
});
test('method, JSON content type and cross-origin protections match existing endpoints',async t=>{
 const a=await app(t);const r=await fetch(a.base+'/api/check');assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST');
 assert.equal((await a.post({ico},'/api/check',{'Content-Type':'text/plain'})).status,415);
 assert.equal((await a.post({ico},'/api/check',{Origin:'https://evil.invalid'})).status,403);assert.equal(a.calls.length,0);
});
test('production origin and signed session required exactly as for analyze/firm',async t=>{
 const a=await app(t,{publicOrigin:'https://verimtomu.fyi'});
 const req=(path,headers,body)=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:new URL(a.base).port,path,method:'POST',headers:{Host:'verimtomu.fyi','Content-Type':'application/json',...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end(JSON.stringify(body));});
 for(const path of ['/api/check','/api/firm','/api/analyze'])assert.equal(await req(path,{Origin:'https://verimtomu.fyi'},{ico}),403);
 const cookie=await new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:new URL(a.base).port,path:'/api/session',headers:{Host:'verimtomu.fyi',Origin:'https://verimtomu.fyi'}},res=>{res.resume();res.on('end',()=>resolve(res.headers['set-cookie'][0].split(';')[0]));});r.on('error',reject);r.end();});assert.equal(await req('/api/check',{Origin:'https://verimtomu.fyi',Cookie:cookie},{ico}),200);assert.equal(a.calls.length,1);
});
test('registry client cache is the same instance across /api/firm and /api/check',async t=>{
 let n=0;const client=createFirmSources({relay:{authorization:'Bearer synthetic'},fetchImpl:async url=>{n++;return Response.json(url.endsWith('/dph')?profile().vat:profile());}});
 const a=await app(t,{firmSources:client});assert.equal((await a.post({ico},'/api/firm')).status,200);assert.equal(n,2);
 const r=await a.post({ico});assert.equal(r.status,200);const data=await r.json();assert.equal(n,2);assert.deepEqual(data.outcomes[0].sourcesContacted,[]);
});
test('shared firm session 10/min and global 20/min: API check reports skipped, legacy firm still 429',async t=>{
 const a=await app(t);const Cookie=await a.cookie();
 for(let i=0;i<10;i++)assert.equal((await a.post({ico},'/api/firm',{Cookie})).status,200);
 const r=await a.post({ico},'/api/check',{Cookie});assert.equal(r.status,200);assert.equal((await r.json()).outcomes[0].skipReason,'rate_limited');assert.equal((await a.post({ico},'/api/firm',{Cookie})).status,429);assert.equal(a.calls.length,10);
 const b=await app(t);for(let i=0;i<20;i++)assert.equal((await b.post({ico},'/api/firm')).status,200);
 const x=await b.post({text:'Obsah',ico});assert.equal(x.status,200);const d=await x.json();assert.equal(d.aggregate.reasons[0].ruleId,'A3');assert.equal(d.outcomes[1].skipReason,'rate_limited');assert.equal(b.calls.length,20);
});
test('global analysis bucket charged once per plan, not once per step; invalid requests spend no global token',async t=>{
 const a=await app(t,{globalApiRateLimit:1});assert.equal((await a.post({url:'https://example.com'})).status,400);
 assert.equal((await a.post({text:'https://a.example https://b.example',ico})).status,200);
 assert.equal((await a.post({text:'Obsah'})).status,429);
});
test('registry outage returns conservative result while legacy /api/firm response is unchanged',async t=>{
 const p=profile({identity:null,resVerified:false,vat:{status:'NEOVĚŘENO'}}),a=await app(t,{firmSources:{profile:async()=>p}});
 const legacy=await (await a.post({ico},'/api/firm')).json(),result=await (await a.post({ico})).json();assert.deepEqual(result.outcomes[0].result,legacy);assert.equal(result.aggregate.level,'incomplete');
});

test('fake-clock five-second API deadline returns a conservative 200 CombinedResult',async t=>{
 let now=Date.parse('2026-10-14T12:00:00Z'),id=0,entered;const started=new Promise(r=>entered=r),tasks=new Map();
 const a=await app(t,{checkClock:()=>now,checkTimers:{setTimeout(fn,ms){const i=++id;tasks.set(i,{fn,at:now+ms});return i;},clearTimeout(i){tasks.delete(i);}},checkAdapters:{analyze:()=>{entered();return new Promise(()=>{});}}});
 const request=a.post({text:'Obsah'});await started;now+=5000;
 for(const [i,task]of [...tasks])if(task.at<=now){tasks.delete(i);task.fn();}
 const r=await request;assert.equal(r.status,200);const data=await r.json();assert.equal(data.outcomes[0].skipReason,'deadline');assert.equal(data.outcomes[0].durationMs,5000);assert.equal(data.aggregate.level,'incomplete');assert.equal(tasks.size,0);
});

test('concurrency gate is shared across legacy firm and orchestrator, and releases after completion',async t=>{
 let finish,start;const hold=new Promise(r=>finish=r),entered=new Promise(r=>start=r);let n=0;
 const a=await app(t,{firmSources:{profile:async()=>{if(++n===2)start();await hold;return profile();}}});
 const first=a.post({ico},'/api/firm'),second=a.post({ico});await entered;
 const blocked=await a.post({ico});assert.equal(blocked.status,200);assert.equal((await blocked.json()).outcomes[0].skipReason,'rate_limited');assert.equal(n,2);
 finish();assert.deepEqual((await Promise.all([first,second])).map(r=>r.status),[200,200]);assert.equal((await a.post({ico})).status,200);
});

test('baseline comparison: existing analyze/firm/health/contract/static responses and headers unchanged',async t=>{
 // 6e6ed02d614a41ff7c2e86dd8ddc42f4f70f74ae:src/server.js
 const baseline={stdout:baselineSource('server-6e6ed02.js','a584deca295ea900249a928e30fcf4110b432942')};
 const location=new URL('../src/server.js',import.meta.url);
 const source=baseline.stdout.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,quote,path)=>'from '+JSON.stringify(new URL(path,location).href)).replaceAll('import.meta.url',JSON.stringify(location.href));
 const original=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const pipeline=()=>({status:()=>({mode:'rules',ai_configured:false}),validate:x=>x,analyze:async()=>({engine:'rules-v1',risk_level:'unassessed',signals:[],recommended_actions:[]}),close(){}});
 const old=await app(t,{factory:original.createServer,pipeline:pipeline()}),current=await app(t,{pipeline:pipeline()});
 for(const route of ['/api/health','/api/contract-status','/contract-legal-catalog.json','/overit-zpravu','/proverit-pujcku','/proverit-web']){
  const a=await fetch(old.base+route),b=await fetch(current.base+route);assert.equal(a.status,b.status);assert.equal(await a.text(),await b.text(),route);
  for(const key of ['content-security-policy','content-type','cache-control','x-content-type-options'])assert.equal(a.headers.get(key),b.headers.get(key),route+' '+key);
 }
 for(const [route,input]of [['/api/firm',{ico}],['/api/analyze',{content:'Obsah',type:'text'}]]){
  const a=await old.post(input,route),b=await current.post(input,route);assert.equal(a.status,b.status);assert.equal(await a.text(),await b.text(),route);
 }
 const a=await (await old.post({ico},'/api/eshop-operator')).json(),b=await (await current.post({ico},'/api/eshop-operator')).json();
 assert(Number.isFinite(Date.parse(a.checkedAt))&&Number.isFinite(Date.parse(b.checkedAt)));delete a.checkedAt;delete b.checkedAt;assert.deepEqual(a,b);
});
