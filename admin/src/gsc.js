// Stage 10 (S10.1): Google Search Console client. Service account (JWT bearer) via the existing
// `jose` dependency; read-only scope; fixed Google hosts only; bounded responses; errors carry
// only a short code (never a response body, token or key).
import {readFile} from 'node:fs/promises';
import {importPKCS8,SignJWT} from 'jose';

export const TOKEN_URL='https://oauth2.googleapis.com/token';
export const API_ORIGIN='https://searchconsole.googleapis.com';
export const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const SITE_URLS=Object.freeze(['sc-domain:verimtomu.fyi','https://verimtomu.fyi/']);
const TOKEN_MAX=65536,QUERY_MAX=1048576,TIMEOUT=15000;

export class GscError extends Error{constructor(code){super(code);this.code=code;}}

// Reads and validates the service-account JSON. Only client_email and private_key are used.
export async function loadServiceAccount(path){
 let raw;try{raw=await readFile(path);}catch{throw new GscError('not_configured');}
 if(raw.length>16384)throw new GscError('invalid_credentials');
 let data;try{data=JSON.parse(raw.toString('utf8'));}catch{throw new GscError('invalid_credentials');}
 if(!data||data.type!=='service_account'||typeof data.client_email!=='string'||!/^[a-z0-9-]{6,30}@[a-z0-9-]{6,30}\.iam\.gserviceaccount\.com$/.test(data.client_email)
  ||typeof data.private_key!=='string'||!data.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||(data.token_uri!==undefined&&data.token_uri!==TOKEN_URL))
  throw new GscError('invalid_credentials');
 let key;try{key=await importPKCS8(data.private_key,'RS256');}catch{throw new GscError('invalid_credentials');}
 return Object.freeze({email:data.client_email,key});
}

async function boundedJson(response,limit){
 const reader=response.body?.getReader();if(!reader)throw new GscError('invalid_response');
 const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new GscError('invalid_response');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new GscError('invalid_response');}
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
  const iat=Math.floor(now/1000);
  const assertion=await new SignJWT({scope:SCOPE}).setProtectedHeader({alg:'RS256',typ:'JWT'})
   .setIssuer(this.account.email).setAudience(TOKEN_URL).setIssuedAt(iat).setExpirationTime(iat+3600).sign(this.account.key);
  let response;
  try{response=await this.fetcher(TOKEN_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString(),signal:AbortSignal.timeout(TIMEOUT)});}
  catch{throw new GscError('upstream');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new GscError(response.status===400||response.status===401?'auth':codeFor(response.status));}
  const data=await boundedJson(response,TOKEN_MAX);
  if(typeof data.access_token!=='string'||!data.access_token||data.access_token.length>4096||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new GscError('invalid_response');
  this.cached={value:data.access_token,expires:now+Math.min(data.expires_in,3600)*1000};
  return this.cached.value;
 }
 // One Search Analytics request. The body is built by the caller from fixed dimensions only.
 async searchAnalytics(body){
  const token=await this.token();
  let response;
  try{response=await this.fetcher(API_ORIGIN+'/webmasters/v3/sites/'+encodeURIComponent(this.siteUrl)+'/searchAnalytics/query',{method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)});}
  catch{throw new GscError('upstream');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});if(response.status===401)this.cached=null;throw new GscError(codeFor(response.status));}
  const data=await boundedJson(response,QUERY_MAX);
  if(!data||typeof data!=='object'||(data.rows!==undefined&&!Array.isArray(data.rows)))throw new GscError('invalid_response');
  return data;
 }
}
