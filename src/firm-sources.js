import {validateRegistryInput} from './eshop-sources.js';
const text=v=>typeof v==='string'?v.slice(0,500):null;
const date=v=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Invalid date');return v;};
const list=(v,max=100)=>{if(!Array.isArray(v)||v.length>max)throw Error('List');return v;};
// Second whitelist at application boundary: never forward relay extras or personal addresses.
export function sanitizeFirmProfile(raw,ico){
 const x=raw?.identity;if(!x||x.ico!==ico||typeof x.name!=='string'||typeof x.legalFormCode!=='string'||!/^\d{3}$/.test(x.legalFormCode)||typeof x.soleTrader!=='boolean')throw Error('Identity');
 const sole=['101','102','104','105','107','108','424','425'].includes(x.legalFormCode);if(x.soleTrader!==sole)throw Error('Sole trader');
 const identity={ico,name:text(x.name),legalFormCode:text(x.legalFormCode),legalForm:text(x.legalForm),seat:text(sole?x.municipality:x.seat),soleTrader:sole,founded:date(x.founded),dissolved:date(x.dissolved),dic:!sole&&/^CZ\d{8}$/.test(x.dic||'')?x.dic:null,nace:list(x.nace||[],3).map(v=>({code:text(v.code),text:text(v.text)})),source:'ARES',sourceUpdated:date(x.sourceUpdated),registrations:Object.fromEntries(Object.entries(x.registrations||{}).filter(([k,v])=>/^stavZdroje[A-Za-z]+$/.test(k)&&typeof v==='string').slice(0,25).map(([k,v])=>[k,text(v)]))};
 let register={status:'NEOVĚŘENO'};const r=raw.register;
 if(r?.status==='NENÍ_V_REJSTŘÍKU')register={status:r.status};
 else if(r&&!r.status&&['AKTIVNI','VYMAZAN'].includes(r.state)){
  const entries=v=>list(v,500).map(e=>({recordedOn:date(e.recordedOn),deletedOn:date(e.deletedOn),typeCode:text(e.typeCode),typeText:text(e.typeText),text:null}));
  register={state:r.state,fileNo:text(r.fileNo),deletedOn:date(r.deletedOn),deletionReason:null,capital:r.capital&&Number.isFinite(r.capital.amount)&&r.capital.amount>=0&&r.capital.currency==='CZK'?{amount:r.capital.amount,currency:'CZK'}:null,liquidation:{active:r.liquidation?.active===true,since:date(r.liquidation?.since)},statutory:list(r.statutory).map(p=>({name:text(p.name),role:text(p.role),since:date(p.since)})),owners:list(r.owners).map(p=>({name:text(p.name),share:null,since:date(p.since)})),statutoryChanges12m:Number.isInteger(r.statutoryChanges12m)&&r.statutoryChanges12m>=0?r.statutoryChanges12m:0,statutoryChanged90d:r.statutoryChanged90d===true,ownerAndLeadershipChanged90d:r.ownerAndLeadershipChanged90d===true,insolvency:{entries:entries(r.insolvency?.entries),bankruptcy:entries(r.insolvency?.bankruptcy)}};
 }
 return{identity,register,employees:raw.employees&&/^\d{3}$/.test(raw.employees.code)&&raw.employees.code!=='000'?{code:raw.employees.code,label:text(raw.employees.label)}:null,resVerified:raw.resVerified===true,isirFlag:text(raw.isirFlag)};
}

export function sanitizeVat(x){
 if(!x||!['PLATCE_DPH','IDENTIFIKOVANA_OSOBA','NESPOLEHLIVA_OSOBA','SKUPINA_DPH','NENALEZEN'].includes(x.status)||!['ANO','NE','NENALEZEN'].includes(x.unreliable)||!date(x.generatedOn))throw Error('VAT schema');
 return{status:x.status,unreliable:x.unreliable,generatedOn:date(x.generatedOn),unreliableSince:date(x.unreliableSince),publishedAccounts:list(x.publishedAccounts,100).map(a=>{if(typeof a.display!=='string'||! /^(?:(?:\d{1,6}-)?\d{1,10}\/\d{4}|[A-Z]{2}\d{2}[A-Z0-9]{11,30})$/.test(a.display)||!date(a.publishedOn))throw Error('Account');return{display:a.display,publishedOn:a.publishedOn};})};
}
// No direct upstream fallback: web has no internet, only the existing private relay.
export function createFirmSources({relay,fetchImpl=fetch,clock=Date.now}={}){
 const cache=new Map(),inflight=new Map();
 async function call(route,body,signal){
  if(!relay)throw Error('Unavailable');
  const work=(async()=>{
   const r=await fetchImpl('http://172.30.41.3:8080/v1/registry/'+route,{method:'POST',redirect:'error',signal,headers:{Authorization:relay.authorization,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
   if(r.url&&r.url!=='http://172.30.41.3:8080/v1/registry/'+route)throw Error('Redirect');
   if(r.status===404){await r.body?.cancel();throw Error('NOT_FOUND');}
   if(!r.ok||!/^application\/json\b/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error(r.status===503?'Maintenance':'Unavailable');}
   const reader=r.body.getReader(),parts=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000)throw Error('Oversized');parts.push(value);}}finally{await reader.cancel();}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
  })();
  let abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('Unavailable'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([work,cancelled]);}finally{signal.removeEventListener('abort',abort);}
 }
 async function load(ico){
  const checkedAt=new Date(clock()).toISOString(),signal=AbortSignal.timeout(4000);
  const data={query:{ico},checkedAt,identity:null,register:{status:'NEOVĚŘENO'},vat:{status:'NEOVĚŘENO'},resVerified:false,employees:null,isirFlag:null};
  try{Object.assign(data,sanitizeFirmProfile(await call('ares-profile',{ico},signal),ico));}
  catch(e){data.notFound=e.message==='NOT_FOUND';return data;}
  if(!data.identity.soleTrader&&/^CZ\d{8}$/.test(data.identity.dic||'')){
   try{data.vat=sanitizeVat(await call('dph',{dic:data.identity.dic.slice(2)},signal));}catch(e){data.vat={status:'NEOVĚŘENO',maintenance:e.message==='Maintenance'};}
  }else data.vat={status:'NOT_APPLICABLE'};
  return data;
 }
 async function profile(input,{signal}={}){
  const ico=validateRegistryInput(input);if(signal?.aborted)throw Error('Cancelled');
  for(const [key,value]of cache)if(value.until<=clock())cache.delete(key);
  if(cache.has(ico))return structuredClone(cache.get(ico).data);
  let pending=inflight.get(ico);
  if(!pending){pending=load(ico).then(data=>{if(data.identity){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(ico,{until:clock()+600000,data:structuredClone(data)});}return data;}).finally(()=>inflight.delete(ico));inflight.set(ico,pending);}
  return structuredClone(await pending);
 }
 return{profile};
}
