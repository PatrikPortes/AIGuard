// S10.3: SEO report and GET /api/seo behind the existing Access JWT; mocked data only.
import http from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {accessVerifier} from '../src/access.js';import {Store} from '../src/store.js';import {createDashboard} from '../src/server.js';
import {seoReport} from '../src/gsc-report.js';import {ensureGscSchema} from '../src/gsc-store.js';import {syncGsc} from '../src/gsc-sync.js';

const issuer='https://test-team.cloudflareaccess.com',audience='a'.repeat(64);
const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='test';jwk.alg='RS256';
const verify=accessVerifier({issuer,audience},createLocalJWKSet({keys:[jwk]}));
const token=()=>new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
const day=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

function fixture(db,{rangeStart='2026-06-01',last='2026-10-13'}={}){
 ensureGscSchema(db);
 const ins=db.prepare('INSERT INTO gsc_daily VALUES(?,?,?,?,?)'),pg=db.prepare('INSERT INTO gsc_daily_page VALUES(?,?,?,?,?,?)'),dv=db.prepare('INSERT INTO gsc_daily_device VALUES(?,?,?,?,?,?)');
 // Last 28 days: every other day reported. Previous 28 days: every day, 1 click / 10 impressions.
 for(let i=0;i<56;i++){const d=day(last,-i);
  if(i<28&&i%2)continue;
  const cur=i<28;ins.run(d,cur?4:1,cur?100:10,cur?(i===0?3:6):12,i===0?0:1);
  if(cur){pg.run(d,'/overit-zpravu',2,60,4,1);pg.run(d,'/',1,30,8,1);pg.run(d,'__other__',1,10,20,1);dv.run(d,'MOBILE',3,70,5,1);dv.run(d,'DESKTOP',1,30,9,1);}
 }
 db.prepare("INSERT INTO gsc_query_window VALUES(28,?,'podvodna sms',5,80,6)").run(last);
 db.prepare("INSERT INTO gsc_query_window VALUES(28,?,'<img src=x>',1,9,3)").run(last);
 db.prepare("INSERT INTO gsc_meta VALUES('range_start',?)").run(rangeStart);
 db.prepare("INSERT INTO gsc_sync(started,finished,status,last_day,calls) VALUES(1,2,'ok',?,6)").run(last);
}

test('report: totals from daily rows, CTR from aggregates, impression-weighted position, comparison only when covered', () => {
 const db=new DatabaseSync(':memory:');fixture(db);
 const r=seoReport(db,{days:28,configured:true});
 assert.equal(r.status,'available');assert.equal(r.lastDay,'2026-10-13');assert.equal(r.final,false,'the newest day is preliminary');
 assert.deepEqual([r.period.from,r.period.to,r.period.reportedDays],['2026-09-16','2026-10-13',14]);
 assert.deepEqual([r.period.clicks,r.period.impressions],[56,1400]);assert.equal(r.period.ctr,56/1400);
 assert(Math.abs(r.period.position-(3*100+6*100*13)/1400)<1e-9,'impression-weighted');
 assert.deepEqual([r.previous.from,r.previous.to,r.previous.clicks,r.previous.impressions,r.previous.reportedDays],['2026-08-19','2026-09-15',28,280,28]);
 assert.equal(r.daily.length,28);assert.deepEqual(r.daily.at(-1),{day:'2026-10-13',clicks:4,impressions:100});assert.deepEqual(r.daily.at(-2),{day:'2026-10-12',missing:true},'no fabricated zero');
 const msg=r.checkers.find(c=>c.label==='Zpráva');assert.deepEqual([msg.clicks,msg.impressions,msg.position],[28,840,4]);
 assert.equal(r.checkers.find(c=>c.label==='Web').missing,true);
 const other=r.checkers.find(c=>c.label==='Ostatní stránky');assert.deepEqual([other.clicks,other.impressions],[28,560]);
 assert.deepEqual(r.pages.map(p=>p.path),['/overit-zpravu','/'],'"other" bucket is not a page');
 assert.deepEqual(r.queries.map(q=>q.query),['podvodna sms','<img src=x>']);assert.deepEqual(r.devices.map(d=>d.device),['MOBILE','DESKTOP']);
 // Previous period not fully requested from Google → no comparison.
 const db2=new DatabaseSync(':memory:');fixture(db2,{rangeStart:'2026-09-01'});assert.equal(seoReport(db2,{days:28,configured:true}).previous,null);
 assert.throws(()=>seoReport(db,{days:30,configured:true}),/invalid_days/);
});

test('report states: not configured, pending, unavailable, no data from Google yet', () => {
 const db=new DatabaseSync(':memory:');
 assert.equal(seoReport(db,{days:28,configured:false,setupError:'invalid_credentials'}).status,'not_configured');
 assert.equal(seoReport(db,{days:28,configured:true}).status,'pending');
 db.prepare("INSERT INTO gsc_sync(started,finished,status,error) VALUES(1,2,'error','permissions')").run();
 const u=seoReport(db,{days:28,configured:true});assert.equal(u.status,'unavailable');assert.equal(u.sync.error,'permissions');
 db.prepare("INSERT INTO gsc_sync(started,finished,status) VALUES(3,4,'ok')").run();assert.equal(seoReport(db,{days:28,configured:true}).status,'no_data');
 // Data exist, but none in the selected window ending at the last reported day cannot happen; an old last day still reports.
});

function request(target,options={}){return new Promise((resolve,reject)=>{const r=http.request(target,{method:options.method||'GET',headers:options.headers},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));});r.on('error',reject);r.end();});}

test('GET /api/seo: Access JWT required, only days=7|28|90, GET only, no Google call while serving, existing routes intact', async () => {
 const store=new Store(':memory:');fixture(store.db);
 const settings={host:'staging.verimtomu.fyi',port:3100,zone:'',token:''};
 const app=createDashboard({settings,verify,store,analytics:{totals:async()=>({})},seo:{configured:true,setupError:null}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.server.address().port;
 const h={Host:settings.host,'cf-access-jwt-assertion':await token()};
 try{
  assert.equal((await request(url+'/api/seo?days=28',{headers:{Host:settings.host}})).status,403,'no JWT');
  const ok=await request(url+'/api/seo?days=28',{headers:h});assert.equal(ok.status,200);assert.match(ok.headers['content-type'],/application\/json/);
  assert.equal(ok.headers['cache-control'],'no-store');assert.match(ok.headers['content-security-policy'],/default-src 'none'/);
  assert.equal(JSON.parse(ok.body).period.clicks,56);
  for(const q of ['days=7','days=90'])assert.equal((await request(url+'/api/seo?'+q,{headers:h})).status,200,q);
  for(const q of ['','days=30','days=07','days=7&days=7','days=7&x=1','x=1','days=28.0','days=-28'])assert.equal((await request(url+'/api/seo?'+q,{headers:h})).status,400,q);
  assert.equal((await request(url+'/api/seo',{headers:h})).status,400);
  assert.equal((await request(url+'/api/seo?days=28',{method:'POST',headers:h})).status,405);
  for(const p of ['/','/app.js','/style.css','/api/dashboard'])assert.equal((await request(url+p,{headers:h})).status,200,p);
  for(const p of ['/?x=1','/api/dashboard?days=28','/api/seo/x'])assert.equal((await request(url+p,{headers:h})).status,404,p);
 }finally{await new Promise(r=>app.server.close(r));store.close();}
 // Without Search Console the endpoint answers "not configured"; the rest of the dashboard is unchanged.
 const s2=new Store(':memory:');const a2=createDashboard({settings,verify,store:s2,analytics:{totals:async()=>({})}});
 await new Promise(r=>a2.server.listen(0,'127.0.0.1',r));const u2='http://127.0.0.1:'+a2.server.address().port;
 try{const r=JSON.parse((await request(u2+'/api/seo?days=28',{headers:h})).body);assert.deepEqual([r.status,r.configured,r.setupError],['not_configured',false,'not_configured']);
  assert.equal((await request(u2+'/api/dashboard',{headers:h})).status,200);}
 finally{await new Promise(r=>a2.server.close(r));s2.close();}
});

test('a slow Google sync never blocks the HTTP server', async () => {
 const store=new Store(':memory:');let release;const held=new Promise(r=>{release=r;});
 const client={searchAnalytics:async body=>{await held;return {rows:body.dimensions[0]==='date'&&body.dimensions.length===1?[{keys:['2026-10-10'],clicks:1,impressions:5,position:4}]:[]};}};
 const sync=syncGsc({client,db:store.db,now:Date.parse('2026-10-15T06:00:00Z'),sleep:async()=>{}});
 const settings={host:'staging.verimtomu.fyi',port:3100,zone:'',token:''};
 const app=createDashboard({settings,verify,store,analytics:{totals:async()=>({})},seo:{configured:true,setupError:null}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.server.address().port;const h={Host:settings.host,'cf-access-jwt-assertion':await token()};
 try{
  const t=Date.now();const during=await request(url+'/api/seo?days=7',{headers:h});assert.equal(during.status,200);assert(Date.now()-t<1000);
  assert.equal(JSON.parse(during.body).status,'pending','sync in progress, no data yet');
  assert.equal((await request(url+'/api/dashboard',{headers:h})).status,200);
  release();assert.equal((await sync).status,'ok');assert.equal(JSON.parse((await request(url+'/api/seo?days=7',{headers:h})).body).status,'available');
 }finally{await new Promise(r=>app.server.close(r));store.close();}
});
