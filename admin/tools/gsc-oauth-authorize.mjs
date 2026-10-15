// Stage 10: one-time OAuth 2.0 authorization for Google Search Console (docs/specs/STAGE10_GSC_OAUTH.md).
// Installed-app flow of an OAuth client of type "Desktop app": loopback redirect, PKCE (S256), state,
// access_type=offline, read-only scope only. Run on the VPS through an SSH tunnel (gsc-oauth-authorize.sh)
// so the refresh token is created where it is used and never passes through a laptop, chat, Git or log.
//   node gsc-oauth-authorize.mjs <client.json> <out.json> [--listen 0.0.0.0] [--port 8765]
// Prints only the authorization URL (no secret in it) and short status codes. Never overwrites a file.
// Self-contained (Node built-ins only): it runs from a read-only mount in the admin image.
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,open,link,unlink,lstat} from 'node:fs/promises';
import {dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL='https://oauth2.googleapis.com/token';
export const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const CLIENT_ID_PATTERN=/^[0-9]{6,30}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;
const AUTH_URIS=['https://accounts.google.com/o/oauth2/auth',AUTH_URL];
const TOKEN_MAX=65536,TIMEOUT=15000;

export class AuthError extends Error{constructor(code){super(code);this.code=code;}}
const opaque=(v,max)=>typeof v==='string'&&v.length>=8&&v.length<=max&&/^[\x21-\x7e]+$/.test(v);
const b64url=b=>Buffer.from(b).toString('base64url');

// The JSON downloaded from Google Auth Platform → Clients (Desktop app): {"installed":{client_id,client_secret,…}}.
export async function loadClient(path){
 let raw;try{raw=await readFile(path);}catch{throw new AuthError('client_missing');}
 if(raw.length>16384)throw new AuthError('client_invalid');
 let data;try{data=JSON.parse(raw.toString('utf8'));}catch{throw new AuthError('client_invalid');}
 if(data?.web)throw new AuthError('client_not_desktop');
 const c=data?.installed;
 if(!c||!CLIENT_ID_PATTERN.test(c.client_id??'')||!opaque(c.client_secret,256)
  ||(c.token_uri!==undefined&&c.token_uri!==TOKEN_URL)||(c.auth_uri!==undefined&&!AUTH_URIS.includes(c.auth_uri)))throw new AuthError('client_invalid');
 return Object.freeze({clientId:c.client_id,clientSecret:c.client_secret});
}

export function pkce(random=randomBytes){
 const verifier=b64url(random(32));
 return {verifier,challenge:b64url(createHash('sha256').update(verifier).digest())};
}

export function authorizationUrl({clientId,redirectUri,challenge,state}){
 const u=new URL(AUTH_URL);
 for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',code_challenge:challenge,code_challenge_method:'S256',state}))u.searchParams.set(k,v);
 return u.toString();
}

async function boundedJson(response,limit){
 const reader=response.body?.getReader();if(!reader)throw new AuthError('invalid_response');
 const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new AuthError('invalid_response');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new AuthError('invalid_response');}
}

// Authorization code + PKCE verifier → refresh token. The grant must be exactly webmasters.readonly.
export async function exchangeCode({client,code,verifier,redirectUri,fetcher=globalThis.fetch}){
 let response;
 try{response=await fetcher(TOKEN_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client.clientId,client_secret:client.clientSecret,redirect_uri:redirectUri,code_verifier:verifier}).toString(),
  signal:AbortSignal.timeout(TIMEOUT)});}
 catch{throw new AuthError('upstream');}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new AuthError(response.status===400||response.status===401?'token_refused':'upstream');}
 const data=await boundedJson(response,TOKEN_MAX);
 if(typeof data?.scope!=='string'||data.scope.trim().split(/\s+/).join(' ')!==SCOPE)throw new AuthError('wrong_scope');
 if(!opaque(data.refresh_token,2048))throw new AuthError('no_refresh_token');
 return data.refresh_token;
}

// Atomic, never overwriting: a private temp file (O_CREAT|O_EXCL, 0400) hard-linked to the target name.
export async function writeCredentials(outFile,{clientId,clientSecret,refreshToken}){
 const body=JSON.stringify({type:'authorized_user',client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken})+'\n';
 const tmp=join(dirname(outFile),'.'+basename(outFile)+'.'+randomBytes(6).toString('hex'));
 let fh;try{fh=await open(tmp,'wx',0o400);}catch{throw new AuthError('write_failed');}
 try{await fh.writeFile(body);await fh.sync();}catch{await fh.close().catch(()=>{});await unlink(tmp).catch(()=>{});throw new AuthError('write_failed');}
 await fh.close();
 try{await link(tmp,outFile);}catch(e){throw new AuthError(e.code==='EEXIST'?'exists':'write_failed');}
 finally{await unlink(tmp).catch(()=>{});}
}

const exists=p=>lstat(p).then(()=>true,()=>false);
const HEADERS={'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

// One authorization: listens until one valid callback (or the timeout), then stops.
export async function authorize({clientFile,outFile,host='127.0.0.1',port=8765,fetcher=globalThis.fetch,timeoutMs=600000,print=console.log,random=randomBytes}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw new AuthError('invalid_port');
 if(await exists(outFile))throw new AuthError('exists');
 const client=await loadClient(clientFile);
 // The browser reaches the VPS loopback through the SSH tunnel; Google allows any loopback port for Desktop clients.
 const redirectUri='http://127.0.0.1:'+port;
 const {verifier,challenge}=pkce(random);const state=b64url(random(16));
 const expected=Buffer.from(state);
 return new Promise((resolve,reject)=>{
  let used=false,finished=false;
  const server=http.createServer({requestTimeout:30000,headersTimeout:10000,maxHeaderSize:8192},(req,res)=>{
   const reply=(status,text)=>new Promise(r=>{res.on('close',r);res.writeHead(status,HEADERS);res.end(text);});
   let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{reply(400,'Neplatný požadavek.');return;}
   if(req.method!=='GET'||url.pathname!=='/'){reply(404,'Nenalezeno.');return;}
   const states=url.searchParams.getAll('state'),got=Buffer.from(states[0]??'');
   // Requests without the exact state are ignored (fail closed); only the matching browser redirect counts.
   if(used||states.length!==1||got.length!==expected.length||!timingSafeEqual(got,expected)){reply(400,'Neplatný požadavek.');return;}
   used=true;
   (async()=>{
    const codes=url.searchParams.getAll('code'),error=url.searchParams.get('error');
    if(error!==null||codes.length!==1||!opaque(codes[0],2048)){
     await reply(400,'Autorizace nebyla udělena. Okno můžete zavřít.');
     return finish(new AuthError(error==='access_denied'?'access_denied':'authorization_failed'));
    }
    try{
     const refreshToken=await exchangeCode({client,code:codes[0],verifier,redirectUri,fetcher});
     await writeCredentials(outFile,{clientId:client.clientId,clientSecret:client.clientSecret,refreshToken});
    }catch(e){await reply(500,'Autorizace se nezdařila. Důvod je uveden v terminálu.');return finish(e instanceof AuthError?e:new AuthError('failed'));}
    await reply(200,'Autorizace dokončena. Okno můžete zavřít.');finish(null);
   })();
  });
  const timer=setTimeout(()=>finish(new AuthError('timeout')),timeoutMs);
  function finish(err){
   if(finished)return;finished=true;clearTimeout(timer);
   server.close();server.closeAllConnections();
   err?reject(err):resolve();
  }
  server.on('error',e=>finish(new AuthError(e.code==='EADDRINUSE'?'port_in_use':'listen_failed')));
  server.listen(port,host,()=>{
   print('Otevřete ve svém prohlížeči tuto adresu a přihlaste se účtem s přístupem k verimtomu.fyi v Search Console:');
   print(authorizationUrl({clientId:client.clientId,redirectUri,challenge,state}));
   print('Čekám nejvýše '+Math.round(timeoutMs/60000)+' min na návrat z Googlu…');
  });
 });
}

const MESSAGES={exists:'Cílový soubor už existuje; nic nepřepsáno.',client_missing:'Soubor OAuth klienta nelze přečíst.',client_invalid:'Soubor OAuth klienta není platný.',
 client_not_desktop:'OAuth klient není typu Desktop app.',access_denied:'Přístup byl v Googlu zamítnut.',authorization_failed:'Google nevrátil autorizační kód.',
 token_refused:'Google odmítl výměnu kódu (kód vypršel nebo nesouhlasí klient).',wrong_scope:'Google udělil jiné oprávnění než webmasters.readonly; nic neuloženo.',
 no_refresh_token:'Google nevrátil refresh token; nic neuloženo.',upstream:'Google neodpovídá nebo je blokovaný odchozí provoz.',invalid_response:'Google vrátil neplatnou odpověď.',
 write_failed:'Soubor nelze zapsat.',timeout:'Vypršel čas na autorizaci.',port_in_use:'Port je obsazený.',listen_failed:'Nelze naslouchat na portu.',invalid_port:'Neplatný port.',usage:'Použití: gsc-oauth-authorize.mjs <client.json> <out.json> [--listen 0.0.0.0] [--port 8765]'};

export function parseArgs(argv){
 const pos=[];let host='127.0.0.1',port=8765;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--listen'&&['127.0.0.1','0.0.0.0'].includes(argv[i+1]))host=argv[++i];
  else if(argv[i]==='--port'&&/^\d{4,5}$/.test(argv[i+1]??''))port=Number(argv[++i]);
  else if(!argv[i].startsWith('-'))pos.push(argv[i]);
  else throw new AuthError('usage');
 }
 if(pos.length!==2)throw new AuthError('usage');
 return {clientFile:pos[0],outFile:pos[1],host,port};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await authorize(parseArgs(process.argv.slice(2)));console.log('Uloženo.');}
 catch(e){const code=e instanceof AuthError?e.code:'failed';console.error('Chyba ('+code+'): '+(MESSAGES[code]||'Autorizace se nezdařila.'));process.exitCode=1;}
}
