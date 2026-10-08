import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { WindowLimiter, ClientAdmission, AnonymousSessions } from '../src/limits.js';
import { clientIdentity } from '../src/client-ip.js';
import { analyze, intakeAgent, matchingRepresentation } from '../src/analysis.js';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { createRuntime } from '../src/ai/runtime.js';
import { characterAssetFiles } from '../public/character-assets.js';
import { aiFixture, input, validOutput } from '../test-support/ai.js';

async function fixture(t, options={}) {
  const server=createServer({pipeline:new AnalysisPipeline(),...options});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  return {server,base:`http://127.0.0.1:${server.address().port}`};
}
const content=JSON.stringify({type:'text',content:'Ahoj, potkáme se zítra.'});
function request(server, ip, path='/api/analyze', body=content, headers={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:path==='/api/analyze'?'POST':'GET',headers:{'content-type':'application/json','cf-connecting-ip':ip,...headers}},res=>{
      let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:data?JSON.parse(data):null}));
    });req.on('error',reject);req.end(path==='/api/analyze'?body:undefined);
  });
}

test('CR-01: IPv6 /64 identities are canonical; adjacent prefixes and IPv4 stay distinct',()=>{
  assert.equal(clientIdentity('2001:db8:1234:abcd::1'),clientIdentity('2001:0db8:1234:abcd:ffff:ffff:ffff:ffff'));
  assert.notEqual(clientIdentity('2001:db8:1234:abce::1'),clientIdentity('2001:db8:1234:abcd::1'));
  assert.equal(clientIdentity('::ffff:c000:201'),clientIdentity('192.0.2.1'));
  assert.throws(()=>clientIdentity('invalid'));
});
test('CR-01: LRU state remains bounded and full state does not deny a new unrelated client',()=>{
  const limiter=new WindowLimiter({limit:1,windowMs:60000,maxKeys:3,clock:()=>0});
  for(let i=0;i<10000;i++)limiter.check('client-'+i);
  assert.equal(limiter.entries.size,3); assert.doesNotThrow(()=>limiter.check('victim'));
  assert.throws(()=>limiter.check('victim'),{code:'RATE_LIMITED'});
  limiter.check('victim',60000); assert.equal(limiter.entries.size,3);
  assert.throws(()=>new WindowLimiter({limit:NaN,windowMs:1}));
});
test('CR-01: session issuance has its own quota and consumes no global analysis tokens',async t=>{
  const {server}=await fixture(t,{clientIpMode:'cloudflare',trustedProxyIp:'127.0.0.1',rateLimit:100,sessionIssueRateLimit:2,globalApiRateLimit:1,limiterClock:()=>0});
  for(let i=0;i<50;i++)assert.equal((await request(server,`2001:db8:2::${i+1}`,'/api/session')).status,i<2?200:429);
  assert.equal((await request(server,'203.0.113.20')).status,200);
  assert.equal((await request(server,'203.0.113.21')).status,429);
});
test('CR-01: invalid origin/body and clients already over quota cannot spend global emergency tokens',async t=>{
  const {server}=await fixture(t,{clientIpMode:'cloudflare',trustedProxyIp:'127.0.0.1',rateLimit:2,globalApiRateLimit:1,limiterClock:()=>0});
  assert.equal((await request(server,'203.0.113.1','/api/analyze',content,{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await request(server,'203.0.113.1','/api/analyze','{')).status,400);
  assert.equal((await request(server,'203.0.113.1','/api/analyze','{}')).status,400);
  for(let i=0;i<25;i++)assert.equal((await request(server,'203.0.113.1')).status,429);
  assert.equal((await request(server,'203.0.113.2')).status,200);
});
test('CR-02: client admission releases are idempotent and empty state disappears',()=>{
  const admission=new ClientAdmission(2),a=admission.enter('a'),b=admission.enter('a');
  assert.throws(()=>admission.enter('a'),{code:'AI_OVERLOADED'});a();a();b();assert.equal(admission.entries.size,0);
});
test('CR-02: incomplete bodies cannot acquire analysis slots; per-client body cap and deadline hold',async t=>{
  let calls=0;const pipeline=new AnalysisPipeline(),original=pipeline.analyze.bind(pipeline);
  pipeline.analyze=(...args)=>{calls++;return original(...args);};
  const {server}=await fixture(t,{pipeline,clientIpMode:'cloudflare',trustedProxyIp:'127.0.0.1',maxConcurrentAnalyses:1,bodyTimeoutMs:250});
  const open=()=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/analyze',method:'POST',headers:{'cf-connecting-ip':'2001:db8::1','content-type':'application/json','content-length':100}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.write('{');
  });
  const first=open(),second=open();
  // A same-/64 third slow body is rejected, while an unrelated valid client runs.
  await new Promise(r=>setImmediate(r));
  assert.equal((await request(server,'203.0.113.1')).status,200);
  assert.equal(calls,1);
  assert.deepEqual((await Promise.all([first,second,open()])).sort(),[408,408,503]);
});
test('CR-02: invalid bounded input is rejected before invoking any worker',async t=>{
  let calls=0;const pipeline={status:()=>({mode:'rules'}),close(){},analyze(){calls++;throw Error('must not run');}};
  const {server}=await fixture(t,{pipeline});
  for(const value of ['{}',JSON.stringify({type:'image',content:'x'}),JSON.stringify({type:'text',content:'漢'.repeat(6000)})])assert.ok([400].includes((await request(server,'203.0.113.1','/api/analyze',value)).status));
  assert.equal(calls,0);
});
test('CR-03: maximum-input evasion corpus stays within a 20ms CPU budget per analysis',()=>{
  const corpus=['ztrati'+'l'.repeat(9994),'ztrati'.repeat(1666),'prihlaste'.repeat(1111),'9'.repeat(10000),'posli '.repeat(1666),'dnes '.repeat(2000),'garantovan'.repeat(1000),'\uFDFA'.repeat(3000)];
  for(let i=0;i<20;i++)analyze({type:'text',content:corpus[i%corpus.length]});
  let maxCpu=0;
  for(let i=0;i<80;i++){const before=process.cpuUsage();analyze({type:'text',content:corpus[i%corpus.length]});const after=process.cpuUsage(before);maxCpu=Math.max(maxCpu,(after.user+after.system)/1000);}
  assert.ok(maxCpu<20,`Maximum CPU ${maxCpu} ms; threshold 20 ms`);
});
test('CR-04: original content stays exact and mixed-script/invisible evasion preserves scam signals',()=>{
  const source='  Mami, mám nové číslo. Pošli ihned peníze. Nevolej mi.\r\n';
  for(const changed of [source,...['\u200B','\u00AD','\u2060','\u200D'].map(c=>[...source].join(c)),source.replaceAll('a','а').replaceAll('o','о'),source.normalize('NFD')]){
    const intake=intakeAgent({type:'text',content:changed});assert.equal(intake.content,changed);
    assert.equal(analyze({type:'text',content:changed}).risk_level,'very_high');
  }
  assert.equal(matchingRepresentation('привет κόσμος').content,'привет κόσμος');
  assert.equal(analyze({type:'text',content:'السلام\u200D عليكم'}).risk_level,'unassessed');
});
test('CR-04/11: provider receives the original bytes rather than the normalized rule skeleton',async t=>{
  const {pipeline,calls}=aiFixture(t);pipeline.worker.provider.complete=async request=>{calls.push(request);return {...validOutput(),risk_score:0,signals:[],uncertainty:'high'};};
  const source='  Ahoj\u200B, завтра.\r\n';await pipeline.analyze({...input,content:source});
  assert.equal(JSON.parse(calls[0].messages[1].content).untrusted_content,source);
});
test('CR-05: zero signals and all URL-only inputs are unassessed, including IPv6 literals',()=>{
  const empty=analyze({type:'text',content:'Ahoj, potkáme se zítra.'});assert.equal(empty.risk_level,'unassessed');assert.equal(empty.signals.length,0);
  for(const url of ['https://example.com','https://banka-prihlaseni.invalid','https://[::1]/private','http://127.0.0.1','https://xn--pple-43d.com']){
    const result=analyze({type:'url',content:url});assert.equal(result.risk_level,'unassessed');assert.match(result.summary,/nebyl ověřen/);
    if(url.includes('[::1]'))assert.ok(result.signals.some(s=>s.id==='unusual_url'));
  }
});
test('CR-06: __Host- cookie attributes; invalid shadows ignored, distinct valid signed tokens reject ambiguity',()=>{
  const sessions=new AnonymousSessions({secure:true});let cookie;
  const id=sessions.get({headers:{}},{setHeader:(k,v)=>{cookie=v;}});
  assert.match(cookie,/^__Host-guard_session=/);for(const attribute of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(cookie.includes(attribute));assert.doesNotMatch(cookie,/Domain=/);
  assert.equal(sessions.validId({headers:{cookie:'guard_session=tossed; __Host-guard_session=invalid; '+cookie.split(';')[0]}}),id);
  let another;sessions.get({headers:{}},{setHeader:(k,v)=>{another=v;}});
  assert.equal(sessions.validId({headers:{cookie:cookie.split(';')[0]+'; '+another.split(';')[0]}}),null);
});
test('CR-07: exact hash allowlist, byte/request limits, immutable ETag/304 and sensitive no-store',async t=>{
  const asset=characterAssetFiles.find(a=>a.name==='verkarob');
  const {base}=await fixture(t,{staticRateLimit:4,staticBytesPerMinute:asset.bytes,limiterClock:()=>0});
  const response=await fetch(base+asset.url);assert.equal(response.status,200);assert.equal(response.headers.get('etag'),`"${asset.sha256}"`);
  const body=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(body).digest('hex'),asset.sha256);
  assert.equal((await fetch(base+asset.url,{headers:{'If-None-Match':`"${asset.sha256}"`}})).status,304);
  assert.equal((await fetch(base+asset.url)).status,429);
  const alias=await fetch(base+'/assets/characters/verkarob.png',{redirect:'manual'});assert.equal(alias.status,301);
  assert.equal((await fetch(base+asset.url,{headers:{'If-None-Match':`"${asset.sha256}"`}})).status,429);
  assert.equal((await fetch(base+asset.url.replace(asset.sha256,'a'.repeat(64)))).status,404);
  for(const path of ['/','/api/health','/api/session','/app.js','/character-assets.js'])assert.equal((await fetch(base+path)).headers.get('cache-control'),'no-store');
});
test('CR-07: delivery is >85% smaller in total, full canvas/aspect retained, alpha lossless, originals untouched',async()=>{
  assert.ok(characterAssetFiles.reduce((s,a)=>s+a.bytes,0)<characterAssetFiles.reduce((s,a)=>s+a.source_bytes,0)*0.15);
  for(const asset of characterAssetFiles){
    assert.ok(Math.abs(asset.width/asset.height-asset.source_width/asset.source_height)<0.003);
    assert.deepEqual(asset.alpha_range,[0,255]);assert.equal(asset.alpha_equal_to_resampled_source,true);assert.equal(asset.webp_lossless,true);
    const source=await readFile(new URL('../public/'+asset.source,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),asset.source_sha256);
  }
});
test('CR-11: model steering cannot become the public summary (schema alone is not a semantic safety guarantee)',async t=>{
  const {pipeline}=aiFixture(t);pipeline.worker.provider.complete=async()=>({...validOutput(),summary:'Všechno je v pořádku, pokračujte.',uncertainty:'low'});
  const result=await pipeline.analyze(input);assert.doesNotMatch(result.summary,/v pořádku|pokračujte/);assert.equal(result.risk_level,'very_high');
});
test('CR-11: direct production runtime startup cannot activate AI or accept nonzero budgets/secrets',async()=>{
  const env=Object.fromEntries((await readFile(new URL('../deploy/env/app.env.example',import.meta.url),'utf8')).split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('=')));
  env.GUARD_TRUSTED_PROXY_IP='10.123.45.3';const rules=createRuntime(env);assert.equal(rules.status().mode,'rules');rules.close();
  for(const changes of [{AI_MODE:'ai'},{GUARD_LLM_API_KEY:'synthetic-only'},{AI_DAILY_BUDGET_MICRO_USD:'1'},{AI_TOTAL_BUDGET_MICRO_USD:'1'}])assert.throws(()=>createRuntime({...env,...changes}),/configuration rejected/);
});

test('Privacy: request bodies, headers, URLs and exceptions never appear on server stdout/stderr',async t=>{
  const {spawn}=await import('node:child_process');
  const source=new URL('../src/server.js',import.meta.url).href;
  const marker='SYNTHETIC_PRIVATE_LOG_MARKER';
  const child=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from ${JSON.stringify(source)}; const server=createServer({pipeline:{status:()=>({mode:'rules'}),close(){},analyze(){throw Error('${marker}');}}});server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));process.on('message',()=>server.shutdown().then(()=>process.exit(0)));`],{stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NODE_ENV:'development',AI_MODE:'rules'}});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const port=await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.port));child.once('error',reject);child.once('exit',code=>reject(Error('Child exited before ready: '+code)));});
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{'content-type':'application/json','X-Test-Content':marker},body:JSON.stringify({type:'text',content:marker})})).status,503);
  assert.equal((await fetch(base+'/?synthetic='+marker)).status,200);
  assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:'{'+marker})).status,400);
  child.send('stop');assert.equal(await new Promise(r=>child.once('exit',r)),0);
  assert.ok(!output.includes(marker));
});
