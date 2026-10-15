// Stage 10: one-off, read-only Search Console diagnostics inside the running admin container.
//   docker exec -i verimtomu-admin-staging node --input-type=module - < admin/tools/gsc-diagnose.mjs
// Runs the container's own client and sync code against Google with an in-memory database (the real
// /data/admin.sqlite is never opened) and prints only the STRUCTURE of each answer: field types,
// counts, numeric ranges, date ranges, fixed enum values. Never prints a token, secret, authorization
// code, page URL or search query. Works with images that predate the diagnostic labels (ea64080).
import {pathToFileURL} from 'node:url';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const range=values=>{const n=values.filter(v=>typeof v==='number'&&Number.isFinite(v));return n.length?[Math.min(...n),Math.max(...n)]:null;};
const types=values=>[...new Set(values.map(v=>v===null?'null':Array.isArray(v)?'array':typeof v))].sort();

// Structure of one Search Analytics answer. Only dates, counts, numbers and Google's enum values.
export function shape(data,body){
 const s={topKeys:data&&typeof data==='object'?Object.keys(data).sort():types([data])};
 if(data?.metadata&&typeof data.metadata==='object'){
  s.metadataKeys=Object.keys(data.metadata).sort();
  const f=data.metadata.firstIncompleteDate;s.firstIncompleteDate=typeof f==='string'&&DAY.test(f)?f:types([f]);
 }
 if(typeof data?.responseAggregationType==='string'&&/^[a-zA-Z]{1,40}$/.test(data.responseAggregationType))s.aggregation=data.responseAggregationType;
 const rows=Array.isArray(data?.rows)?data.rows:null;
 s.rows=rows?rows.length:types([data?.rows]);
 if(!rows?.length)return s;
 s.rowKeys=[...new Set(rows.flatMap(r=>r&&typeof r==='object'?Object.keys(r):['<'+typeof r+'>']))].sort();
 s.keysLength=[...new Set(rows.map(r=>Array.isArray(r?.keys)?r.keys.length:-1))];
 s.keyTypes=types(rows.flatMap(r=>Array.isArray(r?.keys)?r.keys:[]));
 for(const f of ['clicks','impressions','ctr','position']){const v=rows.map(r=>r?.[f]);s[f]={types:types(v),range:range(v)};}
 s.position.below1=rows.filter(r=>typeof r?.position==='number'&&r.position<1).length;
 s.position.above1000=rows.filter(r=>typeof r?.position==='number'&&r.position>1000).length;
 const dims=body.dimensions,di=dims.indexOf('date');
 if(di>=0){
  const days=rows.map(r=>r?.keys?.[di]);
  const valid=days.filter(d=>typeof d==='string'&&DAY.test(d));
  s.date={invalidFormat:days.length-valid.length,min:valid.slice().sort()[0]??null,max:valid.slice().sort().at(-1)??null,
   beforeStart:valid.filter(d=>d<body.startDate).length,afterEnd:valid.filter(d=>d>body.endDate).length};
  if(dims.length===1)s.date.duplicates=valid.length-new Set(valid).size;
 }
 const dv=dims.indexOf('device');if(dv>=0)s.devices=[...new Set(rows.map(r=>String(r?.keys?.[dv])).map(v=>/^[A-Za-z_]{1,20}$/.test(v)?v:'<other>'))].sort();
 const pg=dims.indexOf('page');if(pg>=0){const urls=rows.map(r=>r?.keys?.[pg]);let own=0;for(const u of urls){try{if(['verimtomu.fyi','www.verimtomu.fyi'].includes(new URL(u).hostname))own++;}catch{}}s.pages={rows:urls.length,ownHost:own};}
 const q=dims.indexOf('query');if(q>=0){const t=rows.map(r=>r?.keys?.[q]);s.queries={count:t.length,maxLength:Math.max(0,...t.map(x=>typeof x==='string'?x.length:0)),controlChars:t.filter(x=>typeof x==='string'&&/[\u0000-\u001f\u007f]/.test(x)).length};}
 return s;
}

const label=v=>typeof v==='string'&&/^[A-Za-z0-9_.]{1,64}$/.test(v)?v:null;

// Runs one sync against an in-memory database; returns the report (array of plain objects).
export async function diagnose({gsc,sync,DatabaseSync,file,site,now=Date.now()}){
 const report=[{step:'start',utcNow:new Date(now).toISOString(),siteType:site.startsWith('sc-domain:')?'domain':'url-prefix',siteIsVerimtomu:gsc.SITE_URLS.includes(site)}];
 let account;
 try{account=await gsc.loadGoogleCredentials(file);report.push({step:'credentials',ok:true,kind:account.kind??'service_account'});}
 catch(e){report.push({step:'credentials',ok:false,code:label(e?.code)??'unknown'});return report;}
 const client=new gsc.GscClient({siteUrl:site,account});
 try{await client.token();report.push({step:'token',ok:true});}
 catch(e){report.push({step:'token',ok:false,code:label(e?.code)??'unknown',detail:label(e?.detail),error:e instanceof gsc.GscError?undefined:e?.name});return report;}
 const recorder={async searchAnalytics(body){
  const entry={step:'request',request:body.dimensions.join('+'),startDate:body.startDate,endDate:body.endDate,startRow:body.startRow??0};
  try{const data=await client.searchAnalytics(body);report.push({...entry,ok:true,shape:shape(data,body)});return data;}
  catch(e){report.push({...entry,ok:false,code:label(e?.code)??'unknown',detail:label(e?.detail)});throw e;}
 }};
 const db=new DatabaseSync(':memory:');
 try{const r=await sync.syncGsc({client:recorder,db,now,sleep:async()=>{}});
  report.push({step:'sync',status:r.status,error:label(r.error),calls:r.calls,request:label(r.request),detail:label(r.detail),lastDay:r.lastDay??null});}
 catch(e){report.push({step:'sync',status:'exception',error:e?.name??'Error'});}
 finally{db.close();}
 return report;
}

const isMain=!process.argv[1]||process.argv[1]==='-'||import.meta.url===pathToFileURL(process.argv[1]).href;
if(isMain){
 const src=process.env.GSC_DIAG_SRC||'/admin/src';
 const [gsc,sync,{DatabaseSync}]=await Promise.all([import(src+'/gsc.js'),import(src+'/gsc-sync.js'),import('node:sqlite')]);
 const file=process.env.GSC_CREDENTIALS_FILE,site=process.env.GSC_SITE_URL||'sc-domain:verimtomu.fyi';
 if(!file){console.log(JSON.stringify({step:'start',ok:false,code:'not_configured'}));process.exit(1);}
 for(const line of await diagnose({gsc,sync,DatabaseSync,file,site}))console.log(JSON.stringify(line));
}
