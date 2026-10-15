// Stage 10 OAuth: refresh-token client, automatic access-token renewal, revoked token, scheduler
// back-off and secret hygiene. Mocked Google endpoints and made-up test values only.
import http from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet,exportPKCS8} from 'jose';
import {loadGoogleCredentials,GscClient,GscError,TOKEN_URL,API_ORIGIN} from '../src/gsc.js';
import {syncGsc,createGscScheduler,MANUAL_FIX_ERRORS} from '../src/gsc-sync.js';
import {ensureGscSchema,ERROR_CODES} from '../src/gsc-store.js';
import {accessVerifier} from '../src/access.js';import {Store} from '../src/store.js';import {createDashboard} from '../src/server.js';

const dir=mkdtempSync(join(tmpdir(),'gsc-oauth-'));
const CLIENT_ID='123456789012-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com';
const SECRET='GOCSPX-test-client-secret-not-real',REFRESH='1//0test-refresh-token-not-real',ACCESS='ya29.test-oauth-access-token';
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
function writeUser(overrides={},name='oauth.json'){const p=join(dir,name);writeFileSync(p,JSON.stringify({type:'authorized_user',client_id:CLIENT_ID,client_secret:SECRET,refresh_token:REFRESH,...overrides}));return p;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function fake(handler){const calls=[];return {calls,fetcher:async(url,init)=>{calls.push({url:String(url),init});return handler(String(url),init,calls.length);}};}
const tokenOk=(extra={})=>json({access_token:ACCESS,expires_in:3599,token_type:'Bearer',scope:SCOPE,...extra});
const SECRETS=[SECRET,REFRESH,ACCESS];
const noLeak=(text,what)=>{for(const s of SECRETS)assert(!String(text).includes(s),what+' leaks '+s.slice(0,8));};

test('credentials file: OAuth refresh token (authorized_user) strictly validated; service account still accepted', async () => {
 const c=await loadGoogleCredentials(writeUser());
 assert.deepEqual({...c},{kind:'authorized_user',clientId:CLIENT_ID,clientSecret:SECRET,refreshToken:REFRESH});assert(Object.isFrozen(c));
 assert.equal((await loadGoogleCredentials(writeUser({token_uri:TOKEN_URL,quota_project_id:'ignored'}))).kind,'authorized_user');
 await assert.rejects(()=>loadGoogleCredentials(join(dir,'missing.json')),e=>e.code==='not_configured');
 for(const bad of [{type:'external_account'},{type:undefined},{client_id:'someone@gmail.com'},{client_id:'123.apps.googleusercontent.com.evil.example'},{client_secret:''},{client_secret:'short'},
  {client_secret:'x'.repeat(300)},{refresh_token:undefined},{refresh_token:'with space inside'},{refresh_token:'x'.repeat(3000)},{token_uri:'https://evil.example/token'}])
  await assert.rejects(()=>loadGoogleCredentials(writeUser(bad,'bad.json')),e=>e instanceof GscError&&e.code==='invalid_credentials',JSON.stringify(bad).slice(0,60));
 writeFileSync(join(dir,'garbage.json'),'{');await assert.rejects(()=>loadGoogleCredentials(join(dir,'garbage.json')),e=>e.code==='invalid_credentials');
 // The Desktop-app client file itself is not a credentials file.
 writeFileSync(join(dir,'client.json'),JSON.stringify({installed:{client_id:CLIENT_ID,client_secret:SECRET}}));await assert.rejects(()=>loadGoogleCredentials(join(dir,'client.json')),e=>e.code==='invalid_credentials');
 const pair=await generateKeyPair('RS256',{extractable:true});
 writeFileSync(join(dir,'sa.json'),JSON.stringify({type:'service_account',client_email:'verimtomu-gsc-reader@test-project-123.iam.gserviceaccount.com',private_key:await exportPKCS8(pair.privateKey),token_uri:TOKEN_URL}));
 assert.equal((await loadGoogleCredentials(join(dir,'sa.json'))).kind,'service_account');
});

test('access token: refresh_token grant to the fixed Google endpoint, cached, renewed automatically before expiry', async () => {
 const account=await loadGoogleCredentials(writeUser());let now=Date.parse('2026-10-15T08:00:00Z');
 const f=fake(url=>url===TOKEN_URL?tokenOk():json({rows:[]}));
 const c=new GscClient({siteUrl:'sc-domain:verimtomu.fyi',account,fetcher:f.fetcher,clock:()=>now});
 const q={startDate:'2026-10-01',endDate:'2026-10-02',dimensions:['date']};
 await c.searchAnalytics(q);await c.searchAnalytics(q);
 const api=API_ORIGIN+'/webmasters/v3/sites/sc-domain%3Averimtomu.fyi/searchAnalytics/query';
 assert.deepEqual(f.calls.map(x=>x.url),[TOKEN_URL,api,api],'one token request for two API calls');
 const t=f.calls[0].init;assert.equal(t.method,'POST');assert.equal(t.redirect,'error');assert.equal(t.headers['Content-Type'],'application/x-www-form-urlencoded');
 const form=new URLSearchParams(t.body);
 assert.deepEqual(Object.fromEntries(form),{grant_type:'refresh_token',client_id:CLIENT_ID,client_secret:SECRET,refresh_token:REFRESH},'only the refresh grant fields');
 assert.equal(f.calls[1].init.headers.Authorization,'Bearer '+ACCESS);assert(!f.calls[1].init.body.includes(REFRESH),'refresh token never sent to the API');
 // 58 minutes later the cached token is still used; at 59+ minutes it is renewed without any interaction.
 now+=58*60000;await c.searchAnalytics(q);assert.equal(f.calls.filter(x=>x.url===TOKEN_URL).length,1);
 now+=2*60000;await c.searchAnalytics(q);assert.equal(f.calls.filter(x=>x.url===TOKEN_URL).length,2);
 // A 401 from the API drops the cached token; the next call renews it.
 let n=0;const g=fake(url=>url===TOKEN_URL?tokenOk():(++n===1?json({},401):json({rows:[]})));const c2=new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:g.fetcher});
 await assert.rejects(()=>c2.searchAnalytics(q),e=>e.code==='auth');await c2.searchAnalytics(q);assert.equal(g.calls.filter(x=>x.url===TOKEN_URL).length,2);
 // Google may omit "scope" on refresh; a rotated refresh token in the answer is ignored (read-only mount).
 const h=fake(url=>url===TOKEN_URL?json({access_token:ACCESS,expires_in:3599,refresh_token:'1//rotated-test'}):json({rows:[]}));
 await new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:h.fetcher}).searchAnalytics(q);
});

test('revoked/expired refresh token → reauth_required; other token failures map to short codes without leaks', async () => {
 const account=await loadGoogleCredentials(writeUser());
 const cases=[[()=>json({error:'invalid_grant',error_description:'Token has been expired or revoked. '+REFRESH},400),'reauth_required'],
  [()=>json({error:'invalid_client',error_description:SECRET},401),'auth'],[()=>json({error:'unauthorized_client'},400),'auth'],[()=>new Response('not json '+SECRET,{status:400}),'auth'],
  [()=>new Response('x'.repeat(70000),{status:400}),'auth'],[()=>json({error:'internal'},500),'upstream'],[()=>json({},429),'rate_limited'],
  [()=>tokenOk({scope:SCOPE+' https://www.googleapis.com/auth/webmasters'}),'invalid_scope'],[()=>tokenOk({scope:'https://www.googleapis.com/auth/drive'}),'invalid_scope'],[()=>tokenOk({scope:42}),'invalid_scope'],
  [()=>json({access_token:'',expires_in:3599}),'invalid_response']];
 for(const [response,code] of cases){
  const f=fake(url=>url===TOKEN_URL?response():json({rows:[]}));
  const err=await new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:f.fetcher}).searchAnalytics({}).catch(e=>e);
  assert(err instanceof GscError);assert.equal(err.code,code,code);noLeak(err.message+err.stack+JSON.stringify(err),code);
  assert.equal(f.calls.length,1,'no API call without a valid read-only token');
 }
 const net=fake(()=>{throw TypeError('fetch failed '+SECRET);});const e=await new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:net.fetcher}).searchAnalytics({}).catch(x=>x);
 assert.equal(e.code,'upstream');noLeak(e.message+e.stack,'network');
 for(const c of ['reauth_required','invalid_scope'])assert(ERROR_CODES.includes(c),c+' is a stored error code');
});

test('sync with a revoked token: one token request, no retry, error recorded, earlier data kept, no crash', async () => {
 const store=new Store(':memory:');ensureGscSchema(store.db);
 const NOW=Date.parse('2026-10-15T06:00:00Z');
 const ok={searchAnalytics:async b=>b.dimensions.join()==='date'?{rows:[{keys:['2026-10-10'],clicks:3,impressions:50,position:4}]}:{rows:[]}};
 assert.equal((await syncGsc({client:ok,db:store.db,now:NOW,sleep:async()=>{}})).status,'ok');
 const account=await loadGoogleCredentials(writeUser());
 const f=fake(url=>url===TOKEN_URL?json({error:'invalid_grant'},400):json({rows:[]}));
 const slept=[];const r=await syncGsc({client:new GscClient({siteUrl:'sc-domain:verimtomu.fyi',account,fetcher:f.fetcher}),db:store.db,now:NOW+86400000,sleep:async ms=>slept.push(ms)});
 assert.deepEqual([r.status,r.error,r.calls],['error','reauth_required',1]);assert.deepEqual(slept,[],'no back-off retries');assert.equal(f.calls.length,1);
 assert.equal(store.db.prepare('SELECT SUM(clicks) c FROM gsc_daily').get().c,3,'earlier data kept');
 const last=store.db.prepare('SELECT status,error FROM gsc_sync ORDER BY id DESC LIMIT 1').get();assert.deepEqual({...last},{status:'error',error:'reauth_required'});
 // The dashboard shows the earlier data with the reason; nothing secret in the API answer.
 const issuer='https://test-team.cloudflareaccess.com',audience='a'.repeat(64);
 const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='t';jwk.alg='RS256';
 const jwt=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'t'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
 const settings={host:'staging.verimtomu.fyi',port:3100,zone:'',token:''};
 const app=createDashboard({settings,verify:accessVerifier({issuer,audience},createLocalJWKSet({keys:[jwk]})),store,analytics:{totals:async()=>({})},seo:{configured:true,setupError:null}});
 await new Promise(res=>app.server.listen(0,'127.0.0.1',res));
 try{
  const body=await new Promise((res,rej)=>http.get('http://127.0.0.1:'+app.server.address().port+'/api/seo?days=28',{headers:{Host:settings.host,'cf-access-jwt-assertion':jwt}},r=>{let d='';r.on('data',b=>d+=b);r.on('end',()=>res(d));}).on('error',rej));
  const data=JSON.parse(body);assert.equal(data.status,'available');assert.deepEqual([data.sync.status,data.sync.error],['error','reauth_required']);noLeak(body,'/api/seo');
 }finally{await new Promise(res=>app.server.close(res));store.close();}
});

test('scheduler: failures needing a person wait for the next daily run; transient failures retry after 1 h', async () => {
 assert.deepEqual([...MANUAL_FIX_ERRORS].sort(),['auth','invalid_scope','permissions','reauth_required']);
 for(const [result,expected] of [[{status:'ok'},'interval'],[{status:'error',error:'reauth_required'},'interval'],[{status:'error',error:'permissions'},'interval'],
  [{status:'error',error:'upstream'},'retry'],[{status:'error',error:'rate_limited'},'retry'],['throw','retry']]){
  const delays=[];const pending=[];
  const timers={setTimeout:(fn,ms)=>{delays.push(ms);pending.push(fn);return {unref(){}};},clearTimeout(){}};
  const s=createGscScheduler({run:async()=>{if(result==='throw')throw Error('x');return result;},initialDelay:1,interval:86400000,retry:3600000,timers});
  s.start();await pending.shift()();s.stop();
  assert.deepEqual(delays,[1,expected==='interval'?86400000:3600000],JSON.stringify(result));
 }
});

test('UI explains reauth_required and invalid_scope; no service-account wording left for OAuth errors', async () => {
 const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/reauth_required:'Přístup ke Google Search Console vypršel nebo byl odvolán\./);assert.match(app,/invalid_scope:'/);
 assert.doesNotMatch(app,/Účet služby|Klíč služby/);
});
