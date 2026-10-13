import {open} from 'node:fs/promises';
import {ServiceError} from './ai/errors.js';
export async function readCoiSnapshot(){
 let f;try{try{f=await open('/app/data/eshop-sources/coi.json','r');}catch(e){if(e.code!=='ENOENT')throw e;f=await open(new URL('../public/coi-snapshot.json',import.meta.url),'r');}
 if((await f.stat()).size>2_000_000)throw Error('Oversized data');const data=JSON.parse(await f.readFile('utf8'));if(data.schema!==1)throw Error('Invalid data');return data;
 }catch{return{schema:1,lastAttemptOk:false};}finally{await f?.close();}
}
export function validateRegistryInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.ico!=='string'||!/^\d{8}$/.test(input.ico))throw new ServiceError('INVALID_INPUT',400);
 const sum=[8,7,6,5,4,3,2].reduce((v,w,i)=>v+Number(input.ico[i])*w,0);if(((11-sum%11)%10)!==Number(input.ico[7]))throw new ServiceError('INVALID_INPUT',400);return input.ico;
}
// Production: the app has no general egress and reaches ARES only through the
// private relay's fixed registry route. Only the validated IČO is sent.
export const ARES_RELAY_URL='http://172.30.41.3:8080/v1/registry/ares';
export function aresRelayFromEnv(env=process.env){
 if(env.AI_INTERNAL_PROXY!=='true')return null;const key=env.GUARD_LLM_API_KEY||env.OPENAI_API_KEY;
 return /^sk-[A-Za-z0-9_-]{20,}$/.test(key||'')?Object.freeze({authorization:'Bearer '+key}):null;
}
export async function lookupAres(ico,{fetchImpl=fetch,signal,relay}={}){
 const checkedAt=new Date().toISOString(),base={status:'NEOVĚŘENO',checkedAt,source:'ARES – Ministerstvo financí ČR',sourceUrl:'https://ares.gov.cz/ekonomicke-subjekty',domainAssociationVerified:false,limitation:'Provozovatele tohoto webu se nepodařilo jednoznačně ověřit. Existence IČO nepotvrzuje vztah firmy k doméně. IČO zadal uživatel; jeho původ neověřujeme.'};
 try{
  validateRegistryInput({ico});const bounded4s=signal?AbortSignal.any([signal,AbortSignal.timeout(4000)]):AbortSignal.timeout(4000);
  const response=relay?await fetchImpl(ARES_RELAY_URL,{method:'POST',redirect:'error',signal:bounded4s,headers:{Authorization:relay.authorization,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({ico})})
   :await fetchImpl('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/'+ico,{redirect:'error',signal:bounded4s,headers:{Accept:'application/json'}});
  if(response.status===404)return{...base,registryFinding:'Subjekt s tímto IČO nebyl v ARES nalezen.'};if(!response.ok)throw Error('Unavailable');
  const reader=response.body.getReader();let bytes=0,chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>128000)throw Error('Oversized');chunks.push(value);}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(raw.ico!==ico||typeof raw.obchodniJmeno!=='string')throw Error('Invalid response');
  const bounded=v=>typeof v==='string'?v.slice(0,2000):null;
  return{...base,registryFinding:'Subjekt nalezen v ARES. Vztah k webu není ověřen.',entity:{ico,name:bounded(raw.obchodniJmeno),address:bounded(raw.sidlo?.textovaAdresa),legalFormCode:bounded(raw.pravniForma),registrations:Object.fromEntries(Object.entries(raw.seznamRegistraci||{}).filter(([k,v])=>/^stavZdroje[A-Za-z]+$/.test(k)&&typeof v==='string').slice(0,25).map(([k,v])=>[k,v.slice(0,64)]))}};
 }catch{return{...base,registryFinding:'ARES je nedostupný nebo odpověď nelze ověřit. Údaje o subjektu nezobrazujeme.'};}
}
