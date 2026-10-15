// S10.2: synchronization and storage with a mocked Search Console client.
import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {syncGsc,createGscScheduler,pagePath,SYNC_LIMITS} from '../src/gsc-sync.js';
import {GscError} from '../src/gsc.js';
import {ensureGscSchema,latestSync,meta} from '../src/gsc-store.js';

const NOW=Date.parse('2026-10-15T06:00:00Z');
const db=()=>{const d=new DatabaseSync(':memory:');ensureGscSchema(d);return d;};
const day=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
// Fake Google: data for the given days; days not listed have no impressions (Google omits them).
function google({days,incomplete='2026-10-13',override={},fail}={}){
 const calls=[];
 return {calls,client:{async searchAnalytics(body){
  calls.push(body);if(fail){const e=fail(calls.length,body);if(e)throw e;}
  const inRange=d=>d>=body.startDate&&d<=body.endDate,list=(days||[]).filter(inRange);
  const dims=body.dimensions.join(',');
  if(dims==='date')return {rows:list.map(d=>({keys:[d],clicks:override[d]?.clicks??2,impressions:override[d]?.impressions??40,ctr:0.05,position:7.5})),metadata:{firstIncompleteDate:incomplete}};
  if(dims==='date,page')return {rows:list.flatMap(d=>[{keys:[d,'https://verimtomu.fyi/overit-zpravu'],clicks:1,impressions:20,position:5},{keys:[d,'https://verimtomu.fyi/'],clicks:1,impressions:10,position:9},{keys:[d,'https://verimtomu.fyi/neznama?x=1'],clicks:0,impressions:6,position:20},{keys:[d,'https://evil.example/overit-zpravu'],clicks:0,impressions:4,position:30}])};
  if(dims==='date,device')return {rows:list.flatMap(d=>[{keys:[d,'MOBILE'],clicks:1,impressions:25,position:7},{keys:[d,'DESKTOP'],clicks:1,impressions:15,position:8}])};
  if(dims==='query')return {rows:[{keys:['podvodna sms'],clicks:3,impressions:50,position:6},{keys:['bad\u0000query'],clicks:1,impressions:2,position:3}]};
  throw Error('unexpected '+dims);
 }}};
}
const noSleep=async()=>{};

test('page paths: only our own known pages; everything else is "other"', () => {
 assert.equal(pagePath('https://verimtomu.fyi/overit-zpravu'),'/overit-zpravu');assert.equal(pagePath('https://www.verimtomu.fyi/proverit-web/'),'/proverit-web');
 assert.equal(pagePath('https://verimtomu.fyi/'),'/');assert.equal(pagePath('https://verimtomu.fyi/overit-zpravu?utm=x#y'),'/overit-zpravu');
 for(const u of ['https://evil.example/overit-zpravu','http://verimtomu.fyi/','https://verimtomu.fyi/neznama','not a url'])assert.equal(pagePath(u),'__other__');
});

test('first run: 180-day backfill, bounded calls, preliminary days flagged, missing days not stored as zero', async () => {
 const d=db(),g=google({days:['2026-10-01','2026-10-02','2026-10-12','2026-10-13']});
 const r=await syncGsc({client:g.client,db:d,now:NOW,sleep:noSleep});
 assert.equal(r.status,'ok');assert.equal(r.from,day('2026-10-15',-180));assert.equal(r.to,'2026-10-15');assert.equal(r.lastDay,'2026-10-13');
 assert.equal(g.calls.length,6,'date + page + device + 3 query windows');assert(g.calls.length<=SYNC_LIMITS.maxCalls);
 for(const c of g.calls){assert.equal(c.dataState,'all');assert.equal(c.type,'web');}
 assert.deepEqual(d.prepare('SELECT day,final FROM gsc_daily ORDER BY day').all().map(r=>[r.day,r.final]),[['2026-10-01',1],['2026-10-02',1],['2026-10-12',1],['2026-10-13',0]]);
 assert.equal(d.prepare("SELECT count(*) c FROM gsc_daily WHERE day='2026-10-05'").get().c,0,'no fabricated zero rows');
 // Unknown page and foreign host merged into "other" with impression-weighted position.
 const other=d.prepare("SELECT clicks,impressions,position FROM gsc_daily_page WHERE day='2026-10-01' AND path='__other__'").get();
 assert.deepEqual([other.clicks,other.impressions],[0,10]);assert(Math.abs(other.position-(20*6+30*4)/10)<1e-9);
 assert.deepEqual(d.prepare('SELECT days,query FROM gsc_query_window ORDER BY days').all().map(r=>[r.days,r.query]),[[7,'podvodna sms'],[28,'podvodna sms'],[90,'podvodna sms']],'control characters rejected');
 assert.equal(g.calls[3].endDate,'2026-10-13');assert.equal(g.calls[3].startDate,'2026-10-07');
 assert.equal(meta(d,'range_start'),day('2026-10-15',-180));assert.equal(latestSync(d).status,'ok');assert.equal(latestSync(d).calls,6);
});

test('later runs refresh the last 14 days (Google revisions replace stored values; vanished days are removed)', async () => {
 const d=db();
 await syncGsc({client:google({days:['2026-09-20','2026-10-10','2026-10-12']}).client,db:d,now:NOW,sleep:noSleep});
 const g=google({days:['2026-10-10','2026-10-14'],override:{'2026-10-10':{clicks:9,impressions:90}},incomplete:'2026-10-15'});
 const r=await syncGsc({client:g.client,db:d,now:NOW+86400000,sleep:noSleep});
 assert.equal(r.from,day('2026-10-12',-14));assert.equal(g.calls[0].startDate,'2026-09-28');
 assert.deepEqual(d.prepare('SELECT day,clicks,final FROM gsc_daily ORDER BY day').all().map(r=>[r.day,r.clicks,r.final]),[['2026-09-20',2,1],['2026-10-10',9,1],['2026-10-14',2,1]],'outside the window kept, revised value replaced, vanished day removed');
});

test('invalid responses and errors never overwrite stored data; retries and the call budget are bounded', async () => {
 const d=db();await syncGsc({client:google({days:['2026-10-10']}).client,db:d,now:NOW,sleep:noSleep});
 const before=JSON.stringify(d.prepare('SELECT * FROM gsc_daily').all());
 for(const bad of [{rows:[{keys:['2026-10-10'],clicks:-1,impressions:2}]},{rows:[{keys:['2026-10-10','x'],clicks:1,impressions:2}]},{rows:[{keys:['2099-01-01'],clicks:1,impressions:2}]},{rows:[{keys:['2026-10-10'],clicks:1,impressions:2,position:0}]}]){
  const r=await syncGsc({client:{searchAnalytics:async()=>bad},db:d,now:NOW,sleep:noSleep});
  assert.deepEqual([r.status,r.error],['error','invalid_response']);assert.equal(JSON.stringify(d.prepare('SELECT * FROM gsc_daily').all()),before);
 }
 // 429 then success: retried with backoff.
 const sleeps=[];let g=google({days:['2026-10-10'],fail:n=>n===1?new GscError('rate_limited'):null});
 assert.equal((await syncGsc({client:g.client,db:d,now:NOW,sleep:async ms=>sleeps.push(ms)})).status,'ok');assert.deepEqual(sleeps,[2000]);
 // Persistent upstream error: at most 3 attempts, no further calls.
 g=google({days:['2026-10-10'],fail:()=>new GscError('upstream')});let r=await syncGsc({client:g.client,db:d,now:NOW,sleep:noSleep});
 assert.deepEqual([r.status,r.error,g.calls.length],['error','upstream',3]);
 // Permission and auth errors are not retried.
 for(const code of ['permissions','auth']){g=google({fail:()=>new GscError(code)});r=await syncGsc({client:g.client,db:d,now:NOW,sleep:noSleep});assert.deepEqual([r.error,g.calls.length],[code,1]);}
 // Budget: endless 503 on later calls never exceeds the maximum.
 g=google({days:['2026-10-10'],fail:(n,b)=>b.dimensions[0]==='query'?new GscError('upstream'):null});r=await syncGsc({client:g.client,db:d,now:NOW,sleep:noSleep});
 assert(g.calls.length<=SYNC_LIMITS.maxCalls,'calls '+g.calls.length);assert.equal(r.status,'error');
 assert.equal(JSON.stringify(d.prepare('SELECT * FROM gsc_daily').all()),before);
 assert.equal(latestSync(d).status,'error');assert.equal(latestSync(d).error,'upstream');
});

test('retention keeps about 16 months; a crashed run is closed on the next start', async () => {
 const d=db();d.prepare("INSERT INTO gsc_daily VALUES('2024-01-01',1,1,1,1)").run();d.prepare("INSERT INTO gsc_sync(started,status) VALUES(1,'running')").run();
 await syncGsc({client:google({days:['2026-10-10']}).client,db:d,now:NOW,sleep:noSleep});
 assert.equal(d.prepare("SELECT count(*) c FROM gsc_daily WHERE day<'2025-01-01'").get().c,0);
 assert.equal(d.prepare("SELECT count(*) c FROM gsc_sync WHERE status='running'").get().c,0);
});

test('scheduler: first run after start, 24 h after success, 1 h after failure, never overlapping', async () => {
 const queue=[];const timers={setTimeout:(f,ms)=>{const t={f,ms,unrefCalled:false,unref(){this.unrefCalled=true;}};queue.push(t);return t;},clearTimeout(t){t.cleared=true;}};
 const results=['ok','error','ok'];let runs=0,release;
 const s=createGscScheduler({run:async()=>{runs++;if(runs===1)await new Promise(r=>{release=r;});return {status:results[runs-1]};},initialDelay:15000,timers});
 s.start();assert.deepEqual(queue.map(t=>t.ms),[15000]);assert.equal(queue[0].unrefCalled,true);
 const first=queue[0].f();assert.equal(s.busy,true);
 await queue[0].f();assert.equal(runs,1,'a second tick while busy does not start another run');
 release();await first;assert.equal(s.busy,false);assert.equal(queue.at(-1).ms,24*3600000,'next run after 24 h on success');
 await queue.at(-1).f();assert.equal(queue.at(-1).ms,3600000,'retry after 1 h on failure');
 await queue.at(-1).f();assert.equal(queue.at(-1).ms,24*3600000);
 s.stop();assert.equal(queue.at(-1).cleared,true);const n=queue.length;await queue.at(-1).f();assert.equal(queue.length,n,'stopped scheduler does not reschedule');
 // A throwing run counts as a failure.
 const q2=[];const s2=createGscScheduler({run:async()=>{throw Error('boom');},timers:{setTimeout:(f,ms)=>{q2.push({f,ms});return {unref(){}};},clearTimeout(){}}});
 s2.start();await q2[0].f();assert.equal(q2.at(-1).ms,3600000);
});
