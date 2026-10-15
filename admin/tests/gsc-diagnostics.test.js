// Stage 10: diagnostics for failed Search Console syncs. Every failure carries a fixed label of the
// phase and reason (never a value, body, token or secret). Mocked Google, made-up values only.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as gsc from '../src/gsc.js';import * as sync from '../src/gsc-sync.js';
import {diagnose,shape} from '../tools/gsc-diagnose.mjs';
const {loadGoogleCredentials,GscClient,GscError,TOKEN_URL}=gsc;const {syncGsc}=sync;

const dir=mkdtempSync(join(tmpdir(),'gsc-diag-'));
const CLIENT_ID='123456789012-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com';
const SECRET='GOCSPX-test-client-secret-not-real',REFRESH='1//0test-refresh-token-not-real',ACCESS='ya29.test-oauth-access-token';
const QUERY='tajny dotaz uzivatele',PAGE='https://verimtomu.fyi/overit-zpravu';
const file=join(dir,'oauth.json');writeFileSync(file,JSON.stringify({type:'authorized_user',client_id:CLIENT_ID,client_secret:SECRET,refresh_token:REFRESH}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const tokenOk=()=>json({access_token:ACCESS,expires_in:3599,token_type:'Bearer',scope:'https://www.googleapis.com/auth/webmasters.readonly'});
const NOW=Date.parse('2026-10-15T06:00:00Z');
const LEAKS=[SECRET,REFRESH,ACCESS,QUERY,PAGE,'SECRET-BODY'];
const noLeak=(text,what)=>{for(const s of LEAKS)assert(!String(text).includes(s),what+' leaks '+s.slice(0,10));};
const client=async handler=>new GscClient({siteUrl:'sc-domain:verimtomu.fyi',account:await loadGoogleCredentials(file),fetcher:async(url,init)=>handler(String(url),init)});

test('client errors carry a phase label: token vs API, HTTP status, body problem, missing field', async () => {
 const netErr=code=>()=>{const e=new TypeError('fetch failed SECRET-BODY');e.cause=Object.assign(new Error('x'),{code});throw e;};
 const cases=[
  [()=>json({access_token:ACCESS,token_type:'Bearer'}),null,'invalid_response','token.expires_in'],
  [()=>json({access_token:ACCESS,expires_in:'3599'}),null,'invalid_response','token.expires_in'],
  [()=>json({expires_in:3599}),null,'invalid_response','token.access_token'],
  [()=>new Response('<html>SECRET-BODY</html>',{status:200}),null,'invalid_response','token.json_parse'],
  [()=>json(['x']),null,'invalid_response','token.access_token'],
  [()=>new Response('x'.repeat(70000)),null,'invalid_response','token.body_too_large'],
  [()=>json({error:'invalid_client',error_description:'SECRET-BODY'},401),null,'auth','token.http_401'],
  [()=>json({error:'invalid_client'},400),null,'auth','token.http_400_invalid_client'],
  [()=>json({error:'SECRET-BODY with spaces'},400),null,'auth','token.http_400_unknown'],
  [()=>json({error:'invalid_grant'},400),null,'reauth_required','token.http_400_invalid_grant'],
  [()=>json({},500),null,'upstream','token.http_500'],
  [netErr('ENOTFOUND'),null,'upstream','token.network_ENOTFOUND'],
  [tokenOk,()=>new Response('<html>SECRET-BODY</html>'),'invalid_response','api.json_parse'],
  [tokenOk,()=>json({rows:{a:1}}),'invalid_response','api.rows_not_array'],
  [tokenOk,()=>json([1,2]),'invalid_response','api.not_object'],
  [tokenOk,()=>new Response('x'.repeat(1048577)),'invalid_response','api.body_too_large'],
  [tokenOk,()=>json({error:{message:'SECRET-BODY'}},403),'permissions','api.http_403'],
  [tokenOk,()=>json({},503),'upstream','api.http_503'],
  [tokenOk,netErr('UND_ERR_CONNECT_TIMEOUT'),'upstream','api.network_UND_ERR_CONNECT_TIMEOUT'],
 ];
 for(const [token,api,code,detail] of cases){
  const c=await client(url=>url===TOKEN_URL?token():api());
  const e=await c.searchAnalytics({dimensions:['date']}).catch(x=>x);
  assert(e instanceof GscError,detail);assert.deepEqual([e.code,e.detail],[code,detail]);
  assert.equal(e.message,code,'message stays the bare code');assert.match(e.detail,/^[A-Za-z0-9_.]{1,64}$/);noLeak(e.message+e.stack+e.detail,detail);
 }
});

const daily=rows=>({rows,metadata:{firstIncompleteDate:'2026-10-13'},responseAggregationType:'byProperty'});
const fake=(byDims)=>({searchAnalytics:async b=>{const k=b.dimensions.join('+');const v=byDims[k]??{rows:[]};if(v instanceof Error)throw v;return typeof v==='function'?v(b):v;}});

test('sync reports which request and which check failed; earlier data untouched; nothing secret', async () => {
 const good={date:daily([{keys:['2026-10-10'],clicks:1,impressions:10,ctr:0.1,position:4}])};
 const cases=[
  [{date:daily([{keys:['2026-10-10'],clicks:1,impressions:10,position:0}])},'invalid_response','date','check.position'],
  [{date:daily([{keys:['2026-10-10'],clicks:'1',impressions:10,position:3}])},'invalid_response','date','check.clicks'],
  [{date:daily([{keys:['2026-10-10'],clicks:1,impressions:-1,position:3}])},'invalid_response','date','check.impressions'],
  [{date:daily([{keys:['10/10/2026'],clicks:1,impressions:1,position:3}])},'invalid_response','date','check.day_format'],
  [{date:daily([{keys:['2027-01-01'],clicks:1,impressions:1,position:3}])},'invalid_response','date','check.day_range'],
  [{date:daily([{keys:['2026-10-10'],clicks:1,impressions:1,position:3},{keys:['2026-10-10'],clicks:1,impressions:1,position:3}])},'invalid_response','date','check.day_duplicate'],
  [{date:daily([{keys:[1],clicks:1,impressions:1,position:3}])},'invalid_response','date','check.keys'],
  [{...good,'date+page':{rows:[{keys:['2026-10-10'],clicks:1,impressions:1,position:3}]}},'invalid_response','date+page','check.keys'],
  [{...good,'date+device':{rows:[{keys:['2026-10-10','SMARTWATCH'],clicks:1,impressions:1,position:3}]}},'invalid_response','date+device','check.device'],
  [{...good,query:{rows:[{keys:[QUERY],clicks:1,impressions:1,position:1001}]}},'invalid_response','query','check.position'],
  [{date:new GscError('permissions','api.http_403')},'permissions','date','api.http_403'],
  [{date:new TypeError('boom '+SECRET)},'upstream','date','unknown'],
 ];
 for(const [byDims,error,request,detail] of cases){
  const db=new DatabaseSync(':memory:');
  assert.equal((await syncGsc({client:fake({...good}),db,now:NOW,sleep:async()=>{}})).status,'ok');
  const before=db.prepare('SELECT COUNT(*) n FROM gsc_daily').get().n;
  const r=await syncGsc({client:fake(byDims),db,now:NOW+86400000,sleep:async()=>{}});
  assert.deepEqual([r.status,r.error,r.request,r.detail],['error',error,request,detail],detail);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gsc_daily').get().n,before,'earlier data kept');
  noLeak(JSON.stringify(r),detail);
 }
 // An unexpected exception outside the Google calls is named by its class only.
 const db=new DatabaseSync(':memory:');const real=db.prepare.bind(db);let armed=false;
 db.prepare=sql=>{if(armed&&/^INSERT INTO gsc_daily /.test(sql))throw new RangeError('disk '+SECRET);return real(sql);};
 const p=syncGsc({client:fake(good),db,now:NOW,sleep:async()=>{}});armed=true;const r=await p;
 assert.deepEqual([r.status,r.error,r.detail],['error','upstream','internal.RangeError']);noLeak(JSON.stringify(r),'internal');
});

test('a valid Google answer (all documented fields, fractional CTR/position, fresh data) syncs', async () => {
 const rows=[{keys:['2026-10-12'],clicks:0,impressions:3,ctr:0,position:12.333333333333334},{keys:['2026-10-14'],clicks:2,impressions:40,ctr:0.05,position:1}];
 const r=await syncGsc({client:fake({date:daily(rows),'date+page':{rows:[{keys:['2026-10-14',PAGE],clicks:2,impressions:40,ctr:0.05,position:1}],responseAggregationType:'byPage'},
  'date+device':{rows:[{keys:['2026-10-14','MOBILE'],clicks:2,impressions:40,ctr:0.05,position:1}]},query:{rows:[{keys:[QUERY],clicks:1,impressions:4,ctr:0.25,position:2.5}]}}),db:new DatabaseSync(':memory:'),now:NOW,sleep:async()=>{}});
 assert.equal(r.status,'ok');assert.equal(r.lastDay,'2026-10-14');
});

test('diagnostic tool: structure only, finds the failing request and check, never prints secrets, queries or URLs', async () => {
 const rows=[{keys:['2026-10-10'],clicks:1,impressions:10,ctr:0.1,position:0},{keys:['2026-10-11'],clicks:0,impressions:2,ctr:0,position:7.5}];
 const original=globalThis.fetch;const seen=[];
 globalThis.fetch=async(url,init)=>{url=String(url);seen.push(url);if(url===TOKEN_URL)return tokenOk();
  const b=JSON.parse(init.body);return json(b.dimensions[0]==='query'?{rows:[{keys:[QUERY],clicks:1,impressions:1,position:2}]}:b.dimensions.includes('page')?{rows:[{keys:['2026-10-10',PAGE],clicks:1,impressions:1,position:2}]}:daily(rows));};
 try{
  const report=await diagnose({gsc,sync,DatabaseSync,file,site:'sc-domain:verimtomu.fyi',now:NOW});
  const out=report.map(l=>JSON.stringify(l)).join('\n');noLeak(out,'diagnose');
  assert.deepEqual(report.map(l=>l.step),['start','credentials','token','request','sync']);
  const req=report.find(l=>l.step==='request');assert.equal(req.request,'date');assert.equal(req.ok,true);
  assert.deepEqual(req.shape.position,{types:['number'],range:[0,7.5],below1:1,above1000:0});
  assert.deepEqual(req.shape.date,{invalidFormat:0,min:'2026-10-10',max:'2026-10-11',beforeStart:0,afterEnd:0,duplicates:0});
  assert.equal(req.shape.firstIncompleteDate,'2026-10-13');
  assert.deepEqual(report.at(-1),{step:'sync',status:'error',error:'invalid_response',calls:1,request:'date',detail:'check.position',lastDay:null});
  assert(seen.every(u=>u.startsWith('https://oauth2.googleapis.com/')||u.startsWith('https://searchconsole.googleapis.com/')));
  // Query and page answers: only counts and lengths.
  const q=shape({rows:[{keys:[QUERY],clicks:1,impressions:1,position:2}]},{dimensions:['query'],startDate:'a',endDate:'b'});
  assert.deepEqual(q.queries,{count:1,maxLength:QUERY.length,controlChars:0});noLeak(JSON.stringify(q),'query shape');
  const p=shape({rows:[{keys:['2026-10-10',PAGE],clicks:1,impressions:1,position:2}]},{dimensions:['date','page'],startDate:'2026-10-01',endDate:'2026-10-15'});
  assert.deepEqual(p.pages,{rows:1,ownHost:1});noLeak(JSON.stringify(p),'page shape');
  // Token failure stops before any API call and names the phase.
  globalThis.fetch=async()=>json({access_token:ACCESS});
  const t=await diagnose({gsc,sync,DatabaseSync,file,site:'sc-domain:verimtomu.fyi',now:NOW});
  assert.deepEqual(t.at(-1),{step:'token',ok:false,code:'invalid_response',detail:'token.expires_in',error:undefined});noLeak(JSON.stringify(t),'token');
 }finally{globalThis.fetch=original;}
});
