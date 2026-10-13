import http from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet}from'jose';
import {accessVerifier}from'../src/access.js';import {config}from'../src/config.js';import{Store}from'../src/store.js';import{CloudflareAnalytics}from'../src/cloudflare.js';import{createDashboard}from'../src/server.js';
const issuer='https://test-team.cloudflareaccess.com',audience='a'.repeat(64);
const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='test';jwk.alg='RS256';
const verify=accessVerifier({issuer,audience},createLocalJWKSet({keys:[jwk]}));
async function token(overrides={},privateKey=pair.privateKey,algorithm='RS256'){return new SignJWT({type:'app',...overrides}).setProtectedHeader({alg:algorithm,kid:'test'}).setIssuer(overrides.iss??issuer).setAudience(overrides.aud??audience).setIssuedAt().setExpirationTime(overrides.exp??'5m').sign(privateKey);}
test('JWT signature, issuer, audience, expiry, not-before and algorithm are enforced',async()=>{
 await verify(await token());await assert.rejects(()=>verify(undefined));await assert.rejects(()=>verify('a.b.c'));
 for(const changes of [{iss:'https://evil.example'},{aud:'b'.repeat(64)},{exp:1},{nbf:Math.floor(Date.now()/1000)+600},{type:'service'}])await assert.rejects(()=>token(changes).then(verify));
 const wrong=await generateKeyPair('RS256');await assert.rejects(()=>token({},wrong.privateKey).then(verify));
 await assert.rejects(()=>new SignJWT({type:'app'}).setProtectedHeader({alg:'HS256',kid:'test'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(new Uint8Array(32)).then(verify));
 const missing=new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience(audience).setIssuedAt();await assert.rejects(()=>missing.sign(pair.privateKey).then(verify));
});
test('configuration fails closed without Access configuration; analytics token is optional',()=>{
 assert.throws(()=>config({}));assert.throws(()=>config({ACCESS_ISSUER:'http://evil.example',ACCESS_AUDIENCE:audience}));assert.throws(()=>config({ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:'placeholder'}));assert.equal(config({ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:audience}).token,'');
});
test('SQLite retains genuine cache, without prepopulated statistics',()=>{const s=new Store(':memory:');assert.equal(s.get('traffic'),null);s.put('traffic',{requests24h:12},100);assert.deepEqual(s.get('traffic'),{updated:100,value:{requests24h:12}});s.close();});
test('Cloudflare uses fixed endpoint, discovers dataset and keeps only bounded counts',async()=>{
 let calls=[];const a=new CloudflareAnalytics({zone:'a'.repeat(32),token:'test-not-a-real-key',publicHostname:'verimtomu.fyi'},async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{data:{viewer:{zones:[{settings:{httpRequestsAdaptiveGroups:{enabled:true,availableFields:['count','dimensions_securityAction'],notOlderThan:1000000,maxDuration:1000000}}}]}}}:{data:{viewer:{zones:[{httpRequestsAdaptiveGroups:[{count:123}]}]}}});});
 assert.deepEqual(await a.totals(),{requests24h:123,requests7d:123,blocked24h:123,blocked7d:123,visitorsStatus:'unavailable',securityEventsStatus:'unavailable',source:'Cloudflare HTTP Analytics',sampled:true});assert.equal(calls.length,5);assert.equal(JSON.parse(calls[2].options.body).variables.filter.securityAction,'block');assert.equal(JSON.parse(calls[4].options.body).variables.filter.securityAction,'block');for(const c of calls){assert.equal(c.url,'https://api.cloudflare.com/client/v4/graphql');assert.equal(c.options.redirect,'error');assert.ok(!c.options.body.includes('clientIP'));}
});
test('Cloudflare missing configuration, permission errors and unavailable datasets never become zero totals',async()=>{
 const base={zone:'a'.repeat(32),token:'not-real',publicHostname:'verimtomu.fyi'};
 await assert.rejects(()=>new CloudflareAnalytics({...base,token:''}).totals(),/not_configured/);
 await assert.rejects(()=>new CloudflareAnalytics(base,async()=>new Response('',{status:403})).totals(),/permissions/);
 await assert.rejects(()=>new CloudflareAnalytics(base,async()=>Response.json({errors:[{message:'upstream secret must not be emitted'}]})).totals(),/dataset_unavailable/);
});
test('every HTTP route requires real JWT; unknown data stays unavailable and refresh errors retain stale cache',async()=>{
 const store=new Store(':memory:');const settings={host:'admin.verimtomu.fyi',port:3100,zone:'a'.repeat(32),token:'not-real'};let fail=false;
 const app=createDashboard({settings,verify,store,analytics:{totals:async()=>{if(fail)throw Error('permissions');return{requests24h:42,requests7d:null,source:'Cloudflare HTTP Analytics',sampled:true};}}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+app.server.address().port;const jwt=await token();
 const request=(target,options={})=>new Promise((resolve,reject)=>{const r=http.request(target,{method:options.method||'GET',headers:options.headers},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(data)}));});r.on('error',reject);r.end();});
 try{
  for(const path of ['/','/style.css','/app.js','/api/dashboard','/health','/not-found'])assert.equal((await request(url+path,{headers:{Host:settings.host}})).status,403,path);
  const h={Host:settings.host,'cf-access-jwt-assertion':jwt};assert.equal((await request(url,{headers:h})).status,200);assert.equal((await request(url,{headers:{...h,Host:'verimtomu.fyi'}})).status,400);
  let d=await(await request(url+'/api/dashboard',{headers:h})).json();assert.equal(d.traffic.status,'unavailable');assert.equal(d.usage.status,'unavailable');assert.equal(d.ai.status,'unavailable');assert.equal(d.operations.publicApplication.status,'unavailable');assert.ok(!JSON.stringify(d).includes(jwt));
  await app.refresh();d=await(await request(url+'/api/dashboard',{headers:h})).json();assert.equal(d.traffic.requests24h,42);fail=true;await app.refresh();d=await(await request(url+'/api/dashboard',{headers:h})).json();assert.equal(d.traffic.status,'stale');assert.equal(d.traffic.requests24h,42);assert.equal(d.traffic.issue,'permissions');
  assert.equal((await request(url+'/api/dashboard',{method:'POST',headers:h})).status,405);
 }finally{await new Promise(resolve=>app.server.close(resolve));store.close();}
});
