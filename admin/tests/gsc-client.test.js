// S10.1: Search Console client with a mocked Google API and a throw-away test key (never a real credential).
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateKeyPair,exportPKCS8,exportJWK,jwtVerify,importJWK} from 'jose';
import {loadServiceAccount,GscClient,GscError,TOKEN_URL,API_ORIGIN,SCOPE} from '../src/gsc.js';

const pair=await generateKeyPair('RS256',{extractable:true});
const pem=await exportPKCS8(pair.privateKey);
const dir=mkdtempSync(join(tmpdir(),'gsc-test-'));
const EMAIL='verimtomu-gsc-reader@test-project-123.iam.gserviceaccount.com';
export function writeAccount(overrides={},name='sa.json'){const p=join(dir,name);writeFileSync(p,JSON.stringify({type:'service_account',client_email:EMAIL,private_key:pem,token_uri:TOKEN_URL,...overrides}));return p;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function fake(handler){const calls=[];return {calls,fetcher:async(url,init)=>{calls.push({url:String(url),init});return handler(String(url),init,calls.length);}};}
const tokenOk=()=>json({access_token:'ya29.test-access-token',expires_in:3599,token_type:'Bearer'});

test('service-account file: strict validation; only email and key are used', async () => {
 const a=await loadServiceAccount(writeAccount());assert.equal(a.email,EMAIL);assert.deepEqual(Object.keys(a).sort(),['email','key','kind']);assert.equal(a.kind,'service_account');
 await assert.rejects(()=>loadServiceAccount(join(dir,'missing.json')),e=>e.code==='not_configured');
 for(const bad of [{type:'authorized_user'},{client_email:'someone@gmail.com'},{private_key:'not a key'},{token_uri:'https://evil.example/token'}])
  await assert.rejects(()=>loadServiceAccount(writeAccount(bad,'bad.json')),e=>e.code==='invalid_credentials');
 writeFileSync(join(dir,'big.json'),'x'.repeat(20000));await assert.rejects(()=>loadServiceAccount(join(dir,'big.json')),e=>e.code==='invalid_credentials');
 writeFileSync(join(dir,'garbage.json'),'{');await assert.rejects(()=>loadServiceAccount(join(dir,'garbage.json')),e=>e.code==='invalid_credentials');
});

test('token exchange: signed RS256 assertion with read-only scope to the fixed Google endpoint; cached', async () => {
 const account=await loadServiceAccount(writeAccount());let now=Date.parse('2026-10-15T08:00:00Z');
 const f=fake((url)=>url===TOKEN_URL?tokenOk():json({rows:[]}));
 const c=new GscClient({siteUrl:'sc-domain:verimtomu.fyi',account,fetcher:f.fetcher,clock:()=>now});
 await c.searchAnalytics({startDate:'2026-10-01',endDate:'2026-10-02',dimensions:['date']});
 await c.searchAnalytics({startDate:'2026-10-01',endDate:'2026-10-02',dimensions:['date']});
 assert.deepEqual(f.calls.map(c=>c.url),[TOKEN_URL,API_ORIGIN+'/webmasters/v3/sites/sc-domain%3Averimtomu.fyi/searchAnalytics/query',API_ORIGIN+'/webmasters/v3/sites/sc-domain%3Averimtomu.fyi/searchAnalytics/query']);
 for(const call of f.calls)assert.equal(call.init.redirect,'error');
 const form=new URLSearchParams(f.calls[0].init.body);assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
 const pub=await importJWK(await exportJWK(pair.publicKey),'RS256');
 const {payload,protectedHeader}=await jwtVerify(form.get('assertion'),pub,{issuer:EMAIL,audience:TOKEN_URL,currentDate:new Date(now)});
 assert.equal(protectedHeader.alg,'RS256');assert.equal(payload.scope,SCOPE);assert.equal(payload.exp-payload.iat,3600);
 assert.equal(f.calls[1].init.headers.Authorization,'Bearer ya29.test-access-token');
 // Token refreshed only when close to expiry.
 now+=3600*1000;await c.searchAnalytics({startDate:'2026-10-01',endDate:'2026-10-02',dimensions:['date']});assert.equal(f.calls.filter(c=>c.url===TOKEN_URL).length,2);
 assert.throws(()=>new GscClient({siteUrl:'https://example.com/',account,fetcher:f.fetcher}),e=>e.code==='invalid_site');
});

test('errors map to short codes; no body, token or key ever appears in an error', async () => {
 const account=await loadServiceAccount(writeAccount());
 const cases=[[400,'auth','token'],[401,'auth','token'],[500,'upstream','token'],[401,'auth','api'],[403,'permissions','api'],[429,'rate_limited','api'],[503,'upstream','api']];
 for(const [status,code,where] of cases){
  const secret='SECRET-BODY-'+status;
  const f=fake(url=>url===TOKEN_URL?(where==='token'?json({error:secret},status):tokenOk()):json({error:secret},status));
  const c=new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:f.fetcher});
  const err=await c.searchAnalytics({}).catch(e=>e);
  assert(err instanceof GscError,status+where);assert.equal(err.code,code);
  for(const leak of [secret,'ya29.test-access-token',pem.slice(40,80),EMAIL])assert(!String(err.message+err.stack).includes(leak),'leak '+leak);
 }
 // Network failure, oversized and malformed responses.
 for(const [handler,code] of [[()=>{throw TypeError('fetch failed');},'upstream'],[url=>url===TOKEN_URL?tokenOk():new Response('x'.repeat(1048577)),'invalid_response'],[url=>url===TOKEN_URL?tokenOk():new Response('{oops'),'invalid_response'],[url=>url===TOKEN_URL?tokenOk():json({rows:'x'}),'invalid_response'],[url=>url===TOKEN_URL?json({access_token:''}):json({}),'invalid_response']]){
  const f=fake(handler);const err=await new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:f.fetcher}).searchAnalytics({}).catch(e=>e);assert.equal(err.code,code);
 }
 // A 401 from the API drops the cached token.
 let n=0;const f=fake(url=>url===TOKEN_URL?tokenOk():(++n===1?json({},401):json({rows:[]})));const c=new GscClient({siteUrl:'https://verimtomu.fyi/',account,fetcher:f.fetcher});
 await assert.rejects(()=>c.searchAnalytics({}));await c.searchAnalytics({});assert.equal(f.calls.filter(c=>c.url===TOKEN_URL).length,2);
});
