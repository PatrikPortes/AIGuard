// Stage 10 (S10.2): bounded daily Search Console synchronization and an in-process scheduler.
// Network I/O is async (the HTTP server keeps serving); the SQLite write is one short transaction.
import {GscError} from './gsc.js';
import {ensureGscSchema,KNOWN_PATHS,OTHER_PATH,DEVICES,QUERY_WINDOWS,lastStoredDay,startSyncRecord,finishSyncRecord,writeSyncResult} from './gsc-store.js';

export const SYNC_LIMITS=Object.freeze({initialDays:180,refreshDays:14,retentionDays:490,maxCalls:10,attempts:3,pageRows:25000,maxPages:2,queryRows:50});
const DAY=86400000;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const addDays=(day,n)=>iso(Date.parse(day+'T00:00:00Z')+n*DAY);
const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(Date.parse(s+'T00:00:00Z'))===s;
const count=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e12)throw new GscError('invalid_response');return Math.round(v);};
const position=v=>{if(v===undefined||v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<1||v>1000)throw new GscError('invalid_response');return v;};

// Our own pages only: any other host, unknown path or malformed URL is aggregated as "other".
export function pagePath(url){
 try{const u=new URL(url);if(!['verimtomu.fyi','www.verimtomu.fyi'].includes(u.hostname)||u.protocol!=='https:')return OTHER_PATH;
  const path=u.pathname.length>1?u.pathname.replace(/\/$/,''):'/';return KNOWN_PATHS.includes(path)?path:OTHER_PATH;}
 catch{return OTHER_PATH;}
}
function rowsOf(data,dims){
 const rows=data.rows??[];if(rows.length>SYNC_LIMITS.pageRows)throw new GscError('invalid_response');
 return rows.map(r=>{if(!r||!Array.isArray(r.keys)||r.keys.length!==dims||!r.keys.every(k=>typeof k==='string'))throw new GscError('invalid_response');
  return {keys:r.keys,clicks:count(r.clicks),impressions:count(r.impressions),position:position(r.position)};});
}

export async function syncGsc({client,db,now=Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 ensureGscSchema(db);
 const today=iso(now),stored=lastStoredDay(db);
 const retainFrom=addDays(today,-SYNC_LIMITS.retentionDays);
 // First run: backfill. Later runs: refresh the recent days Google may still revise, and close any gap.
 let from=stored?addDays(stored,-SYNC_LIMITS.refreshDays):addDays(today,-SYNC_LIMITS.initialDays);
 if(from<retainFrom)from=retainFrom;
 const to=today;let calls=0;
 const id=startSyncRecord(db,now);
 async function call(body){
  for(let attempt=1;;attempt++){
   if(++calls>SYNC_LIMITS.maxCalls)throw new GscError('budget');
   try{return await client.searchAnalytics(body);}
   catch(e){const code=e instanceof GscError?e.code:'upstream';
    if(!['rate_limited','upstream'].includes(code)||attempt>=SYNC_LIMITS.attempts)throw new GscError(code);
    await sleep(2000*2**(attempt-1));}
  }
 }
 try{
  const base={startDate:from,endDate:to,dataState:'all',type:'web'};
  const daily=await call({...base,dimensions:['date'],rowLimit:SYNC_LIMITS.pageRows});
  // Rows on/after firstIncompleteDate are preliminary; without metadata, treat the last 3 days as preliminary.
  const incomplete=isDay(daily.metadata?.firstIncompleteDate)?daily.metadata.firstIncompleteDate:addDays(today,-2);
  const fin=day=>day<incomplete;
  const days=rowsOf(daily,1).map(r=>{const day=r.keys[0];if(!isDay(day)||day<from||day>to)throw new GscError('invalid_response');return {day,clicks:r.clicks,impressions:r.impressions,position:r.position,final:fin(day)};});
  if(new Set(days.map(d=>d.day)).size!==days.length)throw new GscError('invalid_response');
  const pages=[];
  for(let page=0;page<SYNC_LIMITS.maxPages;page++){
   const data=await call({...base,dimensions:['date','page'],rowLimit:SYNC_LIMITS.pageRows,startRow:page*SYNC_LIMITS.pageRows});
   const rows=rowsOf(data,2);
   for(const r of rows){if(!isDay(r.keys[0])||r.keys[0]<from||r.keys[0]>to)throw new GscError('invalid_response');pages.push({day:r.keys[0],path:pagePath(r.keys[1]),clicks:r.clicks,impressions:r.impressions,position:r.position,final:fin(r.keys[0])});}
   if(rows.length<SYNC_LIMITS.pageRows)break;
  }
  const devices=rowsOf(await call({...base,dimensions:['date','device'],rowLimit:SYNC_LIMITS.pageRows}),2).map(r=>{
   const device=r.keys[1].toUpperCase();if(!isDay(r.keys[0])||!DEVICES.includes(device))throw new GscError('invalid_response');
   return {day:r.keys[0],device,clicks:r.clicks,impressions:r.impressions,position:r.position,final:fin(r.keys[0])};});
  // Top queries per window, ending at the last day Google reported. Google omits anonymized queries.
  const lastDay=[stored,...days.map(d=>d.day)].filter(Boolean).sort().at(-1)??null;
  let queries=null;
  if(lastDay){
   queries=[];
   for(const n of QUERY_WINDOWS){
    const rows=rowsOf(await call({startDate:addDays(lastDay,-(n-1)),endDate:lastDay,dataState:'all',type:'web',dimensions:['query'],rowLimit:SYNC_LIMITS.queryRows}),1);
    for(const r of rows.slice(0,SYNC_LIMITS.queryRows)){
     const q=r.keys[0];if(!q||q.length>200||/[\u0000-\u001f\u007f]/.test(q))continue;
     queries.push({days:n,endDay:lastDay,query:q,clicks:r.clicks,impressions:r.impressions,position:r.position});
    }
   }
  }
  writeSyncResult(db,{from,to,daily:days,pages,devices,queries,retainFrom});
  finishSyncRecord(db,id,{now:Date.now(),status:'ok',from,to,lastDay,calls});
  return {status:'ok',from,to,lastDay,calls};
 }catch(e){
  const code=e instanceof GscError?e.code:'upstream';
  finishSyncRecord(db,id,{now:Date.now(),status:'error',error:code,from,to,lastDay:stored,calls});
  return {status:'error',error:code,calls};
 }
}

// In-process scheduler: first run shortly after start (HTTP is already listening), then every 24 h;
// after a failure one retry after 1 h. Never overlapping, timers are unref'd.
export function createGscScheduler({run,initialDelay=15000,interval=24*3600000,retry=3600000,timers={setTimeout,clearTimeout}}){
 let timer=null,busy=false,stopped=false;
 const schedule=ms=>{if(stopped)return;timer=timers.setTimeout(tick,ms);timer?.unref?.();};
 async function tick(){
  if(busy||stopped)return;busy=true;let ok=false;
  try{ok=(await run())?.status==='ok';}catch{ok=false;}
  finally{busy=false;schedule(ok?interval:retry);}
 }
 return {start(){schedule(initialDelay);},stop(){stopped=true;if(timer)timers.clearTimeout(timer);},get busy(){return busy;}};
}
