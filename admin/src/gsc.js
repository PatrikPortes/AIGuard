// Stage 10 (S10.1): Google Search Console client. OAuth 2.0 refresh token of an authorized user
// (offline access, see docs/specs/STAGE10_GSC_OAUTH.md) or a service account (JWT bearer via the
// existing `jose` dependency); read-only scope; fixed Google hosts only; bounded responses; errors
// carry only a short code (never a response body, token, secret or key).
import {readFile} from 'node:fs/promises';
import {importPKCS8,SignJWT} from 'jose';

export const TOKEN_URL='https://oauth2.googleapis.com/token';
export const API_ORIGIN='https://searchconsole.googleapis.com';
export const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const SITE_URLS=Object.freeze(['sc-domain:verimtomu.fyi','https://verimtomu.fyi/']);
const TOKEN_MAX=65536,QUERY_MAX=1048576,TIMEOUT=15000;

// `detail` is a fixed diagnostic label (phase and reason, e.g. "token.expires_in", "api.http_500"):
// never a value, body, token or secret. It is safe to log and is not part of the message.
export class GscError extends Error{constructor(code,detail=null){super(code);this.code=code;this.detail=detail;}}
// Network failure label from the error cause code only (e.g. ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, TimeoutError).
const netDetail=(phase,e)=>{const c=e?.cause?.code??e?.name;return phase+'.network'+(typeof c==='string'&&/^[A-Za-z_]{2,40}$/.test(c)?'_'+c:'');};

async function readCredentials(path){
 let raw;try{raw=await readFile(path);}catch{throw new GscError('not_configured');}
 if(raw.length>16384)throw new GscError('invalid_credentials');
 try{return JSON.parse(raw.toString('utf8'));}catch{throw new GscError('invalid_credentials');}
}
// OAuth client of type "Desktop app" and the refresh token written by tools/gsc-oauth-authorize.mjs
// (the "authorized_user" format of Google's application default credentials).
export const CLIENT_ID_PATTERN=/^[0-9]{6,30}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;
const opaque=(v,max)=>typeof v==='string'&&v.length>=8&&v.length<=max&&/^[\x21-\x7e]+$/.test(v);
function authorizedUser(data){
 if(!CLIENT_ID_PATTERN.test(data.client_id??'')||!opaque(data.client_secret,256)||!opaque(data.refresh_token,2048)
  ||(data.token_uri!==undefined&&data.token_uri!==TOKEN_URL))throw new GscError('invalid_credentials');
 return Object.freeze({kind:'authorized_user',clientId:data.client_id,clientSecret:data.client_secret,refreshToken:data.refresh_token});
}
// Reads and validates the credentials file: an OAuth refresh token (preferred) or a service account.
export async function loadGoogleCredentials(path){
 const data=await readCredentials(path);
 if(data?.type==='authorized_user')return authorizedUser(data);
 if(data?.type==='service_account')return serviceAccount(data);
 throw new GscError('invalid_credentials');
}

// Reads and validates the service-account JSON. Only client_email and private_key are used.
export async function loadServiceAccount(path){
 const data=await readCredentials(path);
 if(data?.type!=='service_account')throw new GscError('invalid_credentials');
 return serviceAccount(data);
}
async function serviceAccount(data){
 if(!data||data.type!=='service_account'||typeof data.client_email!=='string'||!/^[a-z0-9-]{6,30}@[a-z0-9-]{6,30}\.iam\.gserviceaccount\.com$/.test(data.client_email)
  ||typeof data.private_key!=='string'||!data.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||(data.token_uri!==undefined&&data.token_uri!==TOKEN_URL))
  throw new GscError('invalid_credentials');
 let key;try{key=await importPKCS8(data.private_key,'RS256');}catch{throw new GscError('invalid_credentials');}
 return Object.freeze({kind:'service_account',email:data.client_email,key});
}

async function boundedJson(response,limit,phase='api'){
 const reader=response.body?.getReader();if(!reader)throw new GscError('invalid_response',phase+'.body_missing');
 const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new GscError('invalid_response',phase+'.body_too_large');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new GscError('invalid_response',phase+'.json_parse');}
}
const codeFor=status=>status===401?'auth':status===403?'permissions':status===429?'rate_limited':'upstream';

export class GscClient{
 constructor({siteUrl,account,fetcher=globalThis.fetch,clock=Date.now}){
  if(!SITE_URLS.includes(siteUrl))throw new GscError('invalid_site');
  this.siteUrl=siteUrl;this.account=account;this.fetcher=fetcher;this.clock=clock;this.cached=null;
 }
 async token(){
  const now=this.clock();
  if(this.cached&&this.cached.expires-60000>now)return this.cached.value;
  const oauth=this.account.kind==='authorized_user';
  let form;
  if(oauth)form={grant_type:'refresh_token',client_id:this.account.clientId,client_secret:this.account.clientSecret,refresh_token:this.account.refreshToken};
  else{
   const iat=Math.floor(now/1000);
   const assertion=await new SignJWT({scope:SCOPE}).setProtectedHeader({alg:'RS256',typ:'JWT'})
    .setIssuer(this.account.email).setAudience(TOKEN_URL).setIssuedAt(iat).setExpirationTime(iat+3600).sign(this.account.key);
   form={grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion};
  }
  let response;
  try{response=await this.fetcher(TOKEN_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams(form).toString(),signal:AbortSignal.timeout(TIMEOUT)});}
  catch(e){throw new GscError('upstream',netDetail('token',e));}
  if(!response.ok){
   // A revoked, expired (6 months unused, Testing mode) or superseded refresh token is "invalid_grant":
   // only a new one-time authorization helps. Only the OAuth error code is read, never echoed.
   // Only Google's own OAuth error code (a fixed vocabulary) is kept as a diagnostic label.
   if(oauth&&response.status===400){let error=null;try{error=(await boundedJson(response,TOKEN_MAX,'token'))?.error;}catch{}
    const label=typeof error==='string'&&/^[a-z_]{3,40}$/.test(error)?error:'unknown';
    throw new GscError(error==='invalid_grant'?'reauth_required':'auth','token.http_400_'+label);}
   await response.body?.cancel().catch(()=>{});throw new GscError(response.status===400||response.status===401?'auth':codeFor(response.status),'token.http_'+response.status);}
  const data=await boundedJson(response,TOKEN_MAX,'token');
  if(!data||typeof data!=='object')throw new GscError('invalid_response','token.not_object');
  if(typeof data.access_token!=='string'||!data.access_token||data.access_token.length>4096)throw new GscError('invalid_response','token.access_token');
  if(!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new GscError('invalid_response','token.expires_in');
  // The grant must stay read-only: any scope other than webmasters.readonly is refused.
  if(oauth&&data.scope!==undefined&&(typeof data.scope!=='string'||data.scope.trim().split(/\s+/).some(s=>s!==SCOPE)))throw new GscError('invalid_scope','token.scope');
  this.cached={value:data.access_token,expires:now+Math.min(data.expires_in,3600)*1000};
  return this.cached.value;
 }
 // One Search Analytics request. The body is built by the caller from fixed dimensions only.
 async searchAnalytics(body){
  const token=await this.token();
  let response;
  try{response=await this.fetcher(API_ORIGIN+'/webmasters/v3/sites/'+encodeURIComponent(this.siteUrl)+'/searchAnalytics/query',{method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)});}
  catch(e){throw new GscError('upstream',netDetail('api',e));}
  if(!response.ok){await response.body?.cancel().catch(()=>{});if(response.status===401)this.cached=null;throw new GscError(codeFor(response.status),'api.http_'+response.status);}
  const data=await boundedJson(response,QUERY_MAX,'api');
  if(!data||typeof data!=='object'||Array.isArray(data))throw new GscError('invalid_response','api.not_object');
  if(data.rows!==undefined&&!Array.isArray(data.rows))throw new GscError('invalid_response','api.rows_not_array');
  return data;
 }
}
