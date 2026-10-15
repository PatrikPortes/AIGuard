// Stage 10 OAuth: one-time authorization tool against a mocked Google (made-up client and tokens only).
import http from 'node:http';import net from 'node:net';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,statSync,readdirSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import * as tool from '../tools/gsc-oauth-authorize.mjs';
import * as gsc from '../src/gsc.js';

const CLIENT_ID='123456789012-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com';
const SECRET='GOCSPX-test-client-secret-not-real',REFRESH='1//0test-refresh-token-not-real',CODE='4/0test-authorization-code';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const fresh=()=>mkdtempSync(join(tmpdir(),'gsc-tool-'));
function clientFile(d,body={installed:{client_id:CLIENT_ID,project_id:'verimtomu-search-console',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token',client_secret:SECRET,redirect_uris:['http://localhost']}}){
 const p=join(d,'client.json');writeFileSync(p,JSON.stringify(body));return p;}
const freePort=()=>new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const get=(port,path)=>new Promise((res,rej)=>http.get({host:'127.0.0.1',port,path},r=>{let d='';r.on('data',b=>d+=b);r.on('end',()=>res({status:r.statusCode,headers:r.headers,body:d}));}).on('error',rej));

// Starts the tool, returns the printed authorization URL and the pending result.
async function start({fetcher,timeoutMs=5000,d=fresh()}={}){
 const port=await freePort(),out=join(d,'gsc-oauth.json'),lines=[];
 let printed;const ready=new Promise(r=>{printed=r;});
 const done=tool.authorize({clientFile:clientFile(d),outFile:out,port,fetcher,timeoutMs,print:l=>{lines.push(l);if(l.startsWith('https://'))printed();}});
 done.catch(()=>{});await Promise.race([ready,done]);
 return {port,out,lines,dir:d,done,url:new URL(lines.find(l=>l.startsWith('https://')))};
}
const googleOk=(calls,extra={})=>async(url,init)=>{calls.push({url:String(url),init});return json({access_token:'ya29.test',expires_in:3599,token_type:'Bearer',scope:'https://www.googleapis.com/auth/webmasters.readonly',refresh_token:REFRESH,...extra});};

test('constants match the dashboard client (same endpoint, scope and client-id rule)', () => {
 assert.equal(tool.TOKEN_URL,gsc.TOKEN_URL);assert.equal(tool.SCOPE,gsc.SCOPE);assert.equal(tool.CLIENT_ID_PATTERN.source,gsc.CLIENT_ID_PATTERN.source);
});

test('client file: only a Desktop-app client with Google endpoints', async () => {
 const d=fresh();assert.deepEqual({...await tool.loadClient(clientFile(d))},{clientId:CLIENT_ID,clientSecret:SECRET});
 await assert.rejects(()=>tool.loadClient(join(d,'none.json')),e=>e.code==='client_missing');
 await assert.rejects(()=>tool.loadClient(clientFile(d,{web:{client_id:CLIENT_ID,client_secret:SECRET}})),e=>e.code==='client_not_desktop');
 for(const bad of [{installed:{client_id:'x',client_secret:SECRET}},{installed:{client_id:CLIENT_ID}},{installed:{client_id:CLIENT_ID,client_secret:SECRET,token_uri:'https://evil.example/token'}},
  {installed:{client_id:CLIENT_ID,client_secret:SECRET,auth_uri:'https://evil.example/auth'}},{type:'authorized_user'}])
  await assert.rejects(()=>tool.loadClient(clientFile(d,bad)),e=>e.code==='client_invalid');
});

test('full flow: PKCE S256 + state + offline read-only consent; refresh token stored 0400, loadable by the dashboard', async () => {
 const calls=[];const s=await start({fetcher:googleOk(calls)});
 const p=Object.fromEntries(s.url.searchParams);
 assert.equal(s.url.origin+s.url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 assert.deepEqual(Object.keys(p).sort(),['access_type','client_id','code_challenge','code_challenge_method','prompt','redirect_uri','response_type','scope','state']);
 assert.deepEqual([p.client_id,p.redirect_uri,p.response_type,p.scope,p.access_type,p.prompt,p.code_challenge_method],
  [CLIENT_ID,'http://127.0.0.1:'+s.port,'code','https://www.googleapis.com/auth/webmasters.readonly','offline','consent','S256']);
 assert.match(p.state,/^[A-Za-z0-9_-]{22}$/);assert.match(p.code_challenge,/^[A-Za-z0-9_-]{43}$/);
 // Unrelated, wrong-state and duplicate-state requests are refused and do not end the flow.
 assert.equal((await get(s.port,'/favicon.ico')).status,404);
 assert.equal((await get(s.port,'/?code=x&state=wrong')).status,400);
 assert.equal((await get(s.port,'/?code=x&state='+p.state+'&state='+p.state)).status,400);
 assert.equal(calls.length,0,'no code exchange for refused requests');
 const r=await get(s.port,'/?code='+encodeURIComponent(CODE)+'&state='+p.state+'&scope='+encodeURIComponent(p.scope));
 assert.equal(r.status,200);assert.match(r.body,/Autorizace dokončena/);assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['content-security-policy'],/default-src 'none'/);
 await s.done;
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');assert.equal(calls[0].init.redirect,'error');
 const form=Object.fromEntries(new URLSearchParams(calls[0].init.body));
 assert.deepEqual(Object.keys(form).sort(),['client_id','client_secret','code','code_verifier','grant_type','redirect_uri']);
 assert.deepEqual([form.grant_type,form.code,form.client_id,form.client_secret,form.redirect_uri],['authorization_code',CODE,CLIENT_ID,SECRET,'http://127.0.0.1:'+s.port]);
 assert.equal(createHash('sha256').update(form.code_verifier).digest('base64url'),p.code_challenge,'PKCE S256');
 assert.equal(statSync(s.out).mode&0o777,0o400);
 assert.deepEqual(JSON.parse(readFileSync(s.out,'utf8')),{type:'authorized_user',client_id:CLIENT_ID,client_secret:SECRET,refresh_token:REFRESH});
 assert.deepEqual(readdirSync(s.dir).sort(),['client.json','gsc-oauth.json'],'no temp file left');
 assert.equal((await gsc.loadGoogleCredentials(s.out)).refreshToken,REFRESH);
 // Nothing secret printed; the listener is gone.
 for(const l of s.lines)for(const secret of [SECRET,REFRESH,CODE])assert(!l.includes(secret));
 await assert.rejects(()=>get(s.port,'/?code=x&state='+p.state),/ECONNREFUSED/);
});

test('refusals store nothing: wrong scope, no refresh token, Google error, denied consent, timeout, existing file', async () => {
 for(const [fetcher,code] of [[googleOk([],{scope:'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/drive'}),'wrong_scope'],
  [googleOk([],{scope:'https://www.googleapis.com/auth/webmasters'}),'wrong_scope'],[googleOk([],{scope:undefined}),'wrong_scope'],
  [googleOk([],{refresh_token:undefined}),'no_refresh_token'],[async()=>json({error:'invalid_grant',error_description:SECRET},400),'token_refused'],
  [async()=>json({},503),'upstream'],[async()=>{throw TypeError('fetch failed');},'upstream'],[async()=>new Response('x'.repeat(70000)),'invalid_response']]){
  const s=await start({fetcher});const r=await get(s.port,'/?code=c0de-test&state='+s.url.searchParams.get('state'));
  assert.equal(r.status,500);assert(!r.body.includes(SECRET));
  await assert.rejects(s.done,e=>e.code===code&&!String(e.message+e.stack).includes(SECRET),code);
  assert(!existsSync(s.out),code+': nothing stored');assert.deepEqual(readdirSync(s.dir),['client.json']);
 }
 const denied=await start({fetcher:async()=>assert.fail('no exchange')});
 assert.equal((await get(denied.port,'/?error=access_denied&state='+denied.url.searchParams.get('state'))).status,400);
 await assert.rejects(denied.done,e=>e.code==='access_denied');
 const t=await start({fetcher:async()=>assert.fail('no exchange'),timeoutMs:150});await assert.rejects(t.done,e=>e.code==='timeout');assert(!existsSync(t.out));
 const d=fresh();writeFileSync(join(d,'gsc-oauth.json'),'old');
 const port=await freePort();
 await assert.rejects(()=>tool.authorize({clientFile:clientFile(d),outFile:join(d,'gsc-oauth.json'),port,print:()=>assert.fail('must not start')}),e=>e.code==='exists');
 assert.equal(readFileSync(join(d,'gsc-oauth.json'),'utf8'),'old','never overwritten');
 // Racing writer: the target appears between the check and the write → refused, not overwritten.
 const e=fresh();const target=join(e,'gsc-oauth.json');writeFileSync(target,'other');
 await assert.rejects(()=>tool.writeCredentials(target,{clientId:CLIENT_ID,clientSecret:SECRET,refreshToken:REFRESH}),x=>x.code==='exists');
 assert.equal(readFileSync(target,'utf8'),'other');assert.deepEqual(readdirSync(e),['gsc-oauth.json']);
});

test('command line: strict arguments, short Czech errors, no secrets on stdout/stderr', async () => {
 const script=fileURLToPath(new URL('../tools/gsc-oauth-authorize.mjs',import.meta.url));
 const run=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
 for(const args of [[],['a'],['a','b','c'],['a','b','--listen','10.0.0.1'],['a','b','--port','80x'],['a','b','--debug']]){
  const r=run(args);assert.equal(r.status,1,args.join(' '));assert.match(r.stderr,/^Chyba \(usage\)/);
 }
 assert.deepEqual(tool.parseArgs(['c.json','o.json','--listen','0.0.0.0','--port','8765']),{clientFile:'c.json',outFile:'o.json',host:'0.0.0.0',port:8765});
 const d=fresh();writeFileSync(join(d,'gsc-oauth.json'),'old');
 const r=run([clientFile(d),join(d,'gsc-oauth.json')]);assert.equal(r.status,1);assert.match(r.stderr,/Chyba \(exists\): Cílový soubor už existuje/);
 const bad=fresh();const r2=run([clientFile(bad,{installed:{client_id:CLIENT_ID,client_secret:SECRET,token_uri:'https://evil.example/'}}),join(bad,'o.json')]);
 assert.match(r2.stderr,/Chyba \(client_invalid\)/);assert(!(r2.stdout+r2.stderr).includes(SECRET));
});
