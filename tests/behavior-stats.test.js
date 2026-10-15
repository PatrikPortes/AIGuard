// Stage 12 A1: server-side behaviour statistics (docs/STAGE12A_REVIEW.md, A1 acceptance criteria).
import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {mkdtemp,rm,readFile,stat,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import http from 'node:http';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {createServer} from '../src/server.js';
import {createBehaviorCounter,createBehaviorStats,behaviorStatsFromEnv,deviceClass,outcome} from '../src/behavior-stats.js';
import {EVENTS,K1,K2,PAGES,CHECKERS,allowed,behaviorDay,OUTCOME_CODE,RETENTION} from '../src/behavior-stats-model.js';
import {BehaviorStore} from '../src/behavior-stats-store.js';
import {usageDay} from '../src/usage-stats-store.js';

const NAV={'sec-fetch-mode':'navigate','sec-fetch-dest':'document','sec-fetch-site':'none'};
const MESSAGE='Dobrý den, váš balík čeká na doplatek 49 Kč. Zaplaťte na https://posta-doplatek.example/platba dnes.';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 BehaviourTestUA';
// Counter with a capturing sink; rows are flushed manually.
function counter(extra={}){const batches=[];const c=createBehaviorCounter({flushMs:0,sink:rows=>batches.push(rows),...extra});
 const rows=()=>{c.flush();const m=new Map();for(const b of batches)for(const [d,e,k1,k2,n] of b){const k=[e,k1,k2].join('|');m.set(k,(m.get(k)||0)+n);}batches.length=0;return Object.fromEntries(m);};return {c,rows};}
async function app(t,extra={}){
 const server=createServer({rateLimit:1000,sessionRateLimit:1000,...extra});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 // node:http keeps the browser navigation headers (fetch would rewrite Sec-Fetch-Mode).
 const get=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{const r=http.request(base+path,{method,headers},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>{const body=Buffer.concat(parts);
  resolve({status:res.statusCode,headers:{get:h=>{const v=res.headers[h];return v===undefined?null:String(v);}},arrayBuffer:async()=>body});});});r.on('error',reject);r.end();});
 return {base,post,get};
}
const settle=()=>new Promise(r=>setTimeout(r,30));

test('vocabulary: fixed lists, only allowed combinations; completed message checks are never a behaviour event (D1)', () => {
 assert.deepEqual(EVENTS,['page_view','bot_page_view','check_submitted','check_completed','check_failed','check_rejected']);
 assert.deepEqual(PAGES,['index','message','web','loan','contract','firm','investment','happened','privacy','about','contact','not_found']);
 assert.deepEqual(CHECKERS,['message','loan_text','firm','firm_search','eshop_operator','contract','check']);
 for(const v of [...K1,...K2])assert.match(v,/^[a-z_]*$/,'no free text in the vocabulary');
 assert.equal(allowed('check_completed','message',''),false);assert.equal(allowed('check_completed','loan_text',''),true);
 for(const [e,k1,k2] of [['page_view','index','x'],['page_view','/','',],['visit','index',''],['check_submitted','firm_search',''],['check_failed','firm','oops'],['bot_page_view','index','mobile'],['page_view','https://verimtomu.fyi/?q=1','']])
  assert.equal(allowed(e,k1,k2),false,[e,k1,k2].join());
 for(const now of [Date.parse('2026-10-24T22:30:00Z'),Date.parse('2026-10-25T00:30:00Z'),Date.parse('2026-10-25T23:30:00Z'),Date.parse('2026-03-29T00:30:00Z')])assert.equal(behaviorDay(now),usageDay(now),'same Prague day as usage stats (DST)');
});

test('OFF by default: only BEHAVIOR_STATS=1 with separate, explicit paths enables it', async () => {
 for(const env of [{},{BEHAVIOR_STATS:'0'},{BEHAVIOR_STATS:'true'},{BEHAVIOR_STATS:'1'},{BEHAVIOR_STATS:'1',BEHAVIOR_DB_PATH:'/x/db'},
  {BEHAVIOR_STATS:'1',BEHAVIOR_DB_PATH:'/x/u.db',BEHAVIOR_SNAPSHOT_PATH:'/x/b.json',USAGE_DB_PATH:'/x/u.db'},{BEHAVIOR_STATS:'1',BEHAVIOR_DB_PATH:'/x/b.db',BEHAVIOR_SNAPSHOT_PATH:'/x/u.json',USAGE_SNAPSHOT_PATH:'/x/u.json'},
  {BEHAVIOR_STATS:'1',BEHAVIOR_DB_PATH:'/x/a',BEHAVIOR_SNAPSHOT_PATH:'/x/a'}])assert.equal(behaviorStatsFromEnv(env),undefined,JSON.stringify(env));
 const dir=await mkdtemp(join(tmpdir(),'behavior-env-'));
 try{const s=behaviorStatsFromEnv({BEHAVIOR_STATS:'1',BEHAVIOR_DB_PATH:join(dir,'b.sqlite'),BEHAVIOR_SNAPSHOT_PATH:join(dir,'b.json')},{log:()=>{}});assert.equal(typeof s.observePage,'function');await s.close();}
 finally{await rm(dir,{recursive:true,force:true});}
});

test('disabled server: identical responses, no User-Agent read, existing usage statistics unchanged', async t => {
 const usageA=[],usageB=[],seen=[];
 const off=await app(t,{usageStats:{record:m=>usageA.push(m),close(){}}});
 const {c}=counter();const on=await app(t,{usageStats:{record:m=>usageB.push(m),close(){}},behaviorStats:{...c,observePage(req,res,p){seen.push(p);return c.observePage(req,res,p);}}});
 for(const [path,headers] of [['/',NAV],['/overit-zpravu',NAV],['/style.css',{}],['/neexistuje',NAV],['/api/session',{}]]){
  const [a,b]=[await off.get(path,headers),await on.get(path,headers)];
  assert.equal(a.status,b.status,path);assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()),path);
  for(const h of ['content-type','content-security-policy','cache-control','referrer-policy','content-length'])assert.equal(a.headers.get(h),b.headers.get(h),path+' '+h);
  const attrs=h=>h.headers.get('set-cookie')?.replace(/=[^;]*/,'=<random>');assert.equal(attrs(a),attrs(b),path+' set-cookie attributes');
 }
 const [a,b]=[await off.post('/api/analyze',{type:'text',content:MESSAGE}),await on.post('/api/analyze',{type:'text',content:MESSAGE})];
 assert.equal(a.status,200);assert.equal(b.status,200);await settle();
 assert.deepEqual(usageA,['rules']);assert.deepEqual(usageB,['rules'],'existing completed-check counter unchanged with behaviour stats on');
 assert.deepEqual(seen,['/','/overit-zpravu','/404.html']);
 // With device detection off the User-Agent header is never read.
 const req={method:'GET',headers:new Proxy({...NAV},{get(o,k){if(k==='user-agent')throw Error('UA read');return o[k];}})};
 const res=Object.assign(new EventEmitter(),{statusCode:200});const x=counter();x.c.observePage(req,res,'/');res.emit('finish');assert.deepEqual(x.rows(),{'page_view|index|':1});
});

test('page views: navigations only, prefetch never, bots separate, 404 as not_found, assets/APIs/queries never', async t => {
 const {c,rows}=counter();const {get}=await app(t,{behaviorStats:c});
 await get('/',NAV);await get('/?utm_source=x&q=tajne',NAV);await get('/overit-zpravu',NAV);await get('/proverit-firmu',NAV);
 await get('/',{...NAV,'sec-purpose':'prefetch'});await get('/',{...NAV,purpose:'prefetch'});await get('/',{...NAV,'sec-purpose':'prefetch;prerender'});
 await get('/');await get('/',{'sec-fetch-mode':'cors','sec-fetch-dest':'empty'});
 await get('/neexistuje',NAV);await get('/404.html',NAV);
 await get('/style.css',NAV);await get('/app.js',NAV);await get('/api/session',NAV);await get('/api/health',NAV);
 await get('/',NAV,'HEAD');
 await settle();
 assert.deepEqual(rows(),{'page_view|index|':2,'page_view|message|':1,'page_view|firm|':1,'bot_page_view|index|':2,'page_view|not_found|':2});
});

test('device classification (only with BEHAVIOR_DEVICE): mobile/desktop, bots by token, bounded and fast', async t => {
 const {c,rows}=counter({device:true});const {get}=await app(t,{behaviorStats:c});
 await get('/',{...NAV,'user-agent':UA});await get('/',{...NAV,'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148'});
 await get('/',{...NAV,'user-agent':UA,'sec-ch-ua-mobile':'?1'});await get('/',{...NAV,'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1)'});
 await get('/',{...NAV,'user-agent':''});await settle();
 assert.deepEqual(rows(),{'page_view|index|desktop':1,'page_view|index|mobile':2,'bot_page_view|index|':2});
 const long={'user-agent':'a'.repeat(9000)+'Mobile'};const start=process.hrtime.bigint();for(let i=0;i<1000;i++)deviceClass(long);
 assert(Number(process.hrtime.bigint()-start)/1e6<50,'bounded, no backtracking');assert.equal(deviceClass(long),'desktop','only the first 512 characters are considered');
});

test('checks: submitted after validation; completed/failed/rejected; message completion only in existing stats (D1, D2)', async t => {
 const usage=[];const {c,rows}=counter();const {post}=await app(t,{behaviorStats:c,usageStats:{record:m=>usage.push(m),close(){}}});
 assert.equal((await post('/api/analyze',{type:'text',content:MESSAGE})).status,200);
 assert.equal((await post('/api/analyze',{type:'text',content:MESSAGE})).status,200);
 assert.equal((await post('/api/analyze','{"type":"text","content":')).status,400,'invalid JSON');
 assert.equal((await post('/api/analyze',{type:'text',content:''})).status,400,'invalid input');
 assert.equal((await post('/api/analyze',{type:'text',content:MESSAGE},{'Content-Type':'text/plain'})).status,415);
 await settle();
 const r=rows();
 assert.equal(r['check_submitted|message|'],2);assert.equal(r['check_completed|message|'],undefined,'D1: not stored again');
 assert.deepEqual(usage,['rules','rules'],'existing counter: exactly the two completions');
 assert.equal(r['check_rejected|message|input'],3);
 // D2: submitted = completed (existing stats) + failed + rejected after submission.
 const failed=Object.entries(r).filter(([k])=>k.startsWith('check_failed|message|')).reduce((s,[,n])=>s+n,0);
 assert.equal(r['check_submitted|message|'],usage.length+failed+(r['check_rejected|message|precondition']||0));
});

test('failure reasons after submission: timeout, quota, rate limit, upstream, precondition, client abort', () => {
 assert.deepEqual(outcome(200),['check_completed']);
 assert.deepEqual(outcome(429,'RATE_LIMITED'),['check_failed','rate_limited']);assert.deepEqual(outcome(429,'AI_VISITOR_LIMIT'),['check_failed','quota']);
 assert.deepEqual(outcome(503,'AI_TIMEOUT'),['check_failed','timeout']);assert.deepEqual(outcome(408,'REQUEST_TIMEOUT'),['check_failed','timeout']);
 assert.deepEqual(outcome(400,'AI_CONSENT_REQUIRED'),['check_rejected','precondition']);assert.deepEqual(outcome(403,'BOT_CHECK_REQUIRED'),['check_rejected','precondition']);
 assert.deepEqual(outcome(502),['check_failed','upstream']);assert.deepEqual(outcome(503,'AI_UNAVAILABLE'),['check_failed','upstream']);
 const run=(path,input,prepared,status,code,abort=false)=>{const {c,rows}=counter();const res=Object.assign(new EventEmitter(),{statusCode:status,writableFinished:!abort});
  const k=c.beginCheck(res,path);k.parsed(input);k.submitted(input,prepared);if(code)res[OUTCOME_CODE]=code;if(abort)res.emit('close');else{res.emit('finish');res.emit('close');}return rows();};
 assert.deepEqual(run('/api/analyze',{content:'x',topic:'loan'},{},200),{'check_submitted|loan_text|':1,'check_completed|loan_text|':1},'loan topic separate, completion stored');
 assert.deepEqual(run('/api/analyze',{content:'x'},{},503,'AI_TIMEOUT'),{'check_submitted|message|':1,'check_failed|message|timeout':1});
 assert.deepEqual(run('/api/analyze',{content:'x'},{},200,undefined,true),{'check_submitted|message|':1,'check_failed|message|client_abort':1});
 assert.deepEqual(run('/api/firm-search',{name:'abc'},{name:'abc',start:0},200),{'check_submitted|firm_search|search':1,'check_completed|firm_search|search':1});
 assert.deepEqual(run('/api/firm-search',{name:'abc',start:20},{name:'abc',start:20},200),{'check_submitted|firm_search|page':1,'check_completed|firm_search|page':1},'D5: paging is not a new search');
 assert.deepEqual(run('/api/analyze-contract',{},{},403,'BOT_CHECK_REQUIRED'),{'check_submitted|contract|':1,'check_rejected|contract|precondition':1},'D11');
 assert.deepEqual(run('/api/firm',{ico:'1'},'1',429,'RATE_LIMITED'),{'check_submitted|firm|':1,'check_failed|firm|rate_limited':1});
 // Before validation only input rejections count; abuse protections (403/429) are not checks.
 const pre=(status,code)=>{const {c,rows}=counter();const res=Object.assign(new EventEmitter(),{statusCode:status,writableFinished:true});c.beginCheck(res,'/api/firm');if(code)res[OUTCOME_CODE]=code;res.emit('finish');return rows();};
 assert.deepEqual(pre(400,'INVALID_INPUT'),{'check_rejected|firm|input':1});assert.deepEqual(pre(413,'BODY_TOO_LARGE'),{'check_rejected|firm|input':1});
 assert.deepEqual(pre(403,'ORIGIN_REQUIRED'),{});assert.deepEqual(pre(429,'RATE_LIMITED'),{});assert.deepEqual(pre(400,'AI_CONSENT_REQUIRED'),{});
 assert.equal(createBehaviorCounter({flushMs:0,sink(){}}).beginCheck(new EventEmitter(),'/api/session'),undefined);
});

test('counter: drops values outside the vocabulary, bounded keys, sink errors never throw, fast', () => {
 const {c,rows}=counter({maxKeys:3});
 c.add('page_view','index');c.add('page_view','/admin');c.add('visit','index');c.add('page_view','index','iPhone');
 c.add('page_view','message');c.add('page_view','web');c.add('page_view','loan');
 assert.deepEqual(rows(),{'page_view|index|':1,'page_view|message|':1,'page_view|web|':1});assert.equal(c.dropped,4);
 const bad=createBehaviorCounter({flushMs:0,sink(){throw Error('disk full');}});bad.add('page_view','index');assert.doesNotThrow(()=>bad.flush());assert.equal(bad.dropped,1);
 const fast=createBehaviorCounter({flushMs:0,sink(){}});const t0=process.hrtime.bigint();
 for(let i=0;i<100000;i++)fast.add('page_view',PAGES[i%PAGES.length]);assert(Number(process.hrtime.bigint()-t0)/1e6<150,'100k events');assert.equal(fast.size,PAGES.length);
});

test('store: SQL CHECKs, secure_delete, retention 400/90 days, compact 190-day snapshot 0444, no free text', async () => {
 const dir=await mkdtemp(join(tmpdir(),'behavior-store-'));
 try{
  let now=Date.parse('2026-10-15T10:00:00Z');const db=join(dir,'b.sqlite'),snap=join(dir,'b.json');const s=new BehaviorStore(db,()=>now);
  assert.equal(s.db.prepare('PRAGMA secure_delete').get().secure_delete,1);
  for(const sql of ["INSERT INTO behavior_daily VALUES('2026-10-15','visit','index','',1)","INSERT INTO behavior_daily VALUES('2026-10-15','page_view','"+MESSAGE.replace(/'/g,"''")+"','',1)",
   "INSERT INTO behavior_daily VALUES('2026-10-15','page_view','index','203.0.113.7',1)","INSERT INTO behavior_daily VALUES('2026-10-15','page_view','index','',-1)"])assert.throws(()=>s.db.exec(sql),/CHECK/);
  const day=n=>new Date(Date.parse('2026-10-15T12:00:00Z')-n*86400000).toISOString().slice(0,10);
  assert.equal(s.apply([[day(0),'page_view','index','',3],[day(0),'page_view','index','',2],[day(100),'bot_page_view','index','',4],[day(395),'page_view','web','',1],[day(200),'check_submitted','firm','',5],
   [day(0),'page_view','index',UA,1],[day(0),'check_completed','message','',1],['2026-13-01','page_view','index','',1],[day(500),'page_view','index','',1],[day(0),'page_view','index','',0],[day(0),'page_view','index','',1.5]]),5);
  const all=()=>s.db.prepare('SELECT day,event,k1,k2,n FROM behavior_daily ORDER BY day DESC,event').all().map(r=>({...r}));
  assert.deepEqual(all()[0],{day:day(0),event:'page_view',k1:'index',k2:'',n:5});
  s.prune();assert.deepEqual(all().map(r=>r.day),[day(0),day(200),day(395)],'bot counts older than 90 days removed');
  now+=10*86400000;s.prune();assert(!all().some(r=>r.day===day(395)),'older than 400 days removed');
  s.export(snap);const j=JSON.parse(await readFile(snap,'utf8'));assert.equal((await stat(snap)).mode&0o777,0o444);
  assert.deepEqual(Object.keys(j).sort(),['days','kind','startedDay','updated','version','vocabulary']);assert.equal(j.kind,'behavior');
  assert.deepEqual(j.days.map(d=>d.d),[day(0)],'only the last 190 days in the snapshot');
  const [e,k1,k2,n]=j.days[0].r[0];assert.deepEqual([j.vocabulary.events[e],j.vocabulary.k1[k1],j.vocabulary.k2[k2],n],['page_view','index','',5]);
  s.close();
  const bytes=(await readFile(db)).toString('latin1')+(await readFile(snap,'utf8'));for(const secret of ['BehaviourTestUA','posta-doplatek','203.0.113.7','utm_source'])assert(!bytes.includes(secret),secret);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('worker end to end: batches persisted, snapshot published; write failure and broken worker never affect requests', async t => {
 const dir=await mkdtemp(join(tmpdir(),'behavior-worker-'));
 try{
  const logs=[];const s=createBehaviorStats({db:join(dir,'b.sqlite'),snapshot:join(dir,'b.json'),flushMs:0,log:m=>logs.push(m)});
  const {get,post}=await app(t,{behaviorStats:s});
  await get('/',NAV);await get('/proverit-web',NAV);assert.equal((await post('/api/analyze',{type:'text',content:MESSAGE})).status,200);await settle();
  s.flush();await new Promise(r=>setTimeout(r,300));await s.close();
  const j=JSON.parse(await readFile(join(dir,'b.json'),'utf8'));const flat=j.days.flatMap(d=>d.r.map(([e,a,b,n])=>[j.vocabulary.events[e],j.vocabulary.k1[a],j.vocabulary.k2[b],n].join('|')));
  assert.deepEqual(flat.sort(),['check_submitted|message||1','page_view|index||1','page_view|web||1']);assert.deepEqual(logs,[]);
  // Unwritable database path: statistics disable themselves, the site keeps answering.
  const broken=createBehaviorStats({db:join(dir,'missing','x','b.sqlite'),snapshot:join(dir,'missing','b.json'),flushMs:0,log:m=>logs.push(m)});
  const b=await app(t,{behaviorStats:broken});await new Promise(r=>setTimeout(r,300));
  assert.equal((await b.get('/',NAV)).status,200);assert.equal((await b.post('/api/analyze',{type:'text',content:MESSAGE})).status,200);
  assert.doesNotThrow(()=>broken.flush());assert.deepEqual(logs,['Behavior statistics disabled.']);await broken.close();
  // Read-only database file: write fails inside the worker, reported once per batch, requests unaffected.
  const roDb=join(dir,'ro.sqlite');new BehaviorStore(roDb).close();await chmod(roDb,0o444);
  const ro=createBehaviorStats({db:roDb,snapshot:join(dir,'ro.json'),flushMs:0,log:m=>logs.push(m)});
  const r=await app(t,{behaviorStats:ro});assert.equal((await r.get('/',NAV)).status,200);await settle();ro.flush();await new Promise(x=>setTimeout(x,300));
  if(process.getuid?.()!==0)assert(logs.includes('Behavior statistics write failed.'),'write failure reported without details');
  await ro.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('isolation: behaviour modules never import identity, session, quota or IP modules; no client script added', async () => {
 for(const f of ['behavior-stats.js','behavior-stats-model.js','behavior-stats-store.js','behavior-stats-worker.js']){
  const src=await readFile(new URL('../src/'+f,import.meta.url),'utf8');
  const imports=[...src.matchAll(/import[^;]*?from\s*'([^']+)'/g)].map(m=>m[1]);
  for(const i of imports)assert(['node:worker_threads','node:sqlite','node:fs','./behavior-stats-model.js','./behavior-stats-store.js'].includes(i),f+' imports '+i);
  for(const m of ['remoteAddress','x-forwarded-for','cf-connecting-ip','headers.cookie',"headers['cookie']",'set-cookie','localStorage'])assert(!src.toLowerCase().includes(m.toLowerCase()),f+' must not use '+m);
 }
 const {readdir}=await import('node:fs/promises');for(const f of await readdir(new URL('../public/',import.meta.url)))assert(!/behavio|analytic|beacon/i.test(f),'no client analytics file: '+f);
 const html=(await Promise.all(['index.html','message.html','privacy.html'].map(f=>readFile(new URL('../public/'+f,import.meta.url),'utf8')))).join('');assert(!/sendBeacon|\/api\/m\b/.test(html));
 assert.equal(RETENTION.days,400);assert.equal(RETENTION.botDays,90);assert.equal(RETENTION.snapshotDays,190);
});
