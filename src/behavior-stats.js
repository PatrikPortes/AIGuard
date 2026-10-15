// Stage 12 A1: server-side behaviour statistics (docs/STAGE12A_REVIEW.md §2–§5). OFF by default.
// Counts only from requests the site already receives: HTML page loads and public check APIs.
// No client script, cookie, identifier, IP, User-Agent storage, text, URL or query. In-memory
// daily counters with a fixed vocabulary are flushed every few seconds to a separate worker;
// the existing completed-check statistics (usage-stats.js) are untouched and stay the single
// source of truth for completed message checks (D1).
import {Worker} from 'node:worker_threads';
import {PAGE_BY_PATH,CHECKER_BY_PATH,OUTCOME_CODE,allowed,behaviorDay} from './behavior-stats-model.js';

const BOT_TOKENS=['bot','crawl','spider','slurp','preview','monitor','curl','wget','python','headless','http-client','java/','go-http','okhttp','axios','node-fetch','undici'];
const INPUT_STATUSES=new Set([400,413,415]);
const INPUT_CODES=new Set(['INVALID_INPUT','INVALID_JSON','INVALID_REQUEST','BODY_TOO_LARGE','UNSUPPORTED_ENCODING','AI_INPUT_LIMIT']);

// Device class from request headers, only when explicitly enabled (BEHAVIOR_DEVICE=1, legal review ⚖ 3).
// The header is bounded and matched with plain substring checks (no backtracking); it is never stored.
export function deviceClass(headers){
 const ua=String(headers['user-agent']??'').slice(0,512).toLowerCase();
 if(!ua||BOT_TOKENS.some(t=>ua.includes(t)))return 'bot';
 if(headers['sec-ch-ua-mobile']==='?1'||ua.includes('mobi')||ua.includes('iphone'))return 'mobile';
 return 'desktop';
}
// Failure reason of a submitted check from the final status and the fixed ServiceError code.
export function outcome(status,code){
 if(status===200)return ['check_completed'];
 if(status===429)return ['check_failed',code==='AI_VISITOR_LIMIT'?'quota':'rate_limited'];
 if(status===408||code==='AI_TIMEOUT'||code==='REQUEST_TIMEOUT')return ['check_failed','timeout'];
 if(status>=400&&status<500)return ['check_rejected','precondition'];
 return ['check_failed','upstream'];
}

// Counter core (testable without a worker): bounded keys, values outside the vocabulary dropped.
export function createBehaviorCounter({sink,device=false,clock=Date.now,flushMs=5000,maxKeys=256}={}){
 let counts=new Map(),dropped=0,timer=null,dayAt=-Infinity,day='';
 // The Prague day is recomputed at most once per second (Intl formatting is the costly part).
 const today=()=>{const now=clock();if(Math.abs(now-dayAt)>=1000){dayAt=now;day=behaviorDay(now);}return day;};
 const add=(event,k1,k2='')=>{
  if(!allowed(event,k1,k2)){dropped++;return;}
  const key=today()+'\t'+event+'\t'+k1+'\t'+k2;
  if(!counts.has(key)&&counts.size>=maxKeys){dropped++;return;}
  counts.set(key,(counts.get(key)||0)+1);
 };
 const flush=()=>{
  if(!counts.size)return;
  const rows=[...counts].map(([key,n])=>[...key.split('\t'),n]);counts=new Map();
  try{sink(rows);}catch{dropped+=rows.length;}
 };
 if(flushMs>0){timer=setInterval(flush,flushMs);timer.unref?.();}
 return {
  add,flush,get dropped(){return dropped;},get size(){return counts.size;},
  // HTML page load. Counted once the response was fully sent; prefetch/prerender never counts;
  // requests that are not browser navigations are counted only as bot page views.
  observePage(req,res,path){
   const page=PAGE_BY_PATH[path];
   if(!page||req.method!=='GET')return;
   const purpose=String(req.headers['sec-purpose']??req.headers.purpose??'').toLowerCase();
   if(purpose.includes('prefetch')||purpose.includes('prerender'))return;
   let bot=!(req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'),k2='';
   if(device){const d=deviceClass(req.headers);if(d==='bot')bot=true;else k2=d;}
   res.once('finish',()=>{
    if(res.statusCode!==(page==='not_found'?404:200))return;
    bot?add('bot_page_view',page):add('page_view',page,k2);
   });
  },
  // Public check API. Before validation only input rejections count; after validation the
  // request is "submitted" and ends as completed, failed (reason) or rejected (precondition).
  beginCheck(res,path){
   let checker=CHECKER_BY_PATH[path],sub='',submitted=false,done=false;
   if(!checker)return undefined;
   const topic=input=>{if(path==='/api/analyze'&&input&&typeof input==='object'&&input.topic==='loan')checker='loan_text';};
   res.once('finish',()=>{
    done=true;const status=res.statusCode,code=res[OUTCOME_CODE];
    if(!submitted){if(INPUT_STATUSES.has(status)&&(!code||INPUT_CODES.has(code)))add('check_rejected',checker,'input');return;}
    const [event,reason]=outcome(status,code);
    if(event==='check_completed'){if(checker!=='message')add(event,checker,sub);}
    else add(event,checker,reason);
   });
   res.once('close',()=>{if(submitted&&!done&&!res.writableFinished)add('check_failed',checker,'client_abort');});
   return {
    parsed(input){topic(input);},
    submitted(input,prepared){
     if(submitted)return;topic(input);
     if(path==='/api/firm-search')sub=Number.isInteger(prepared?.start)&&prepared.start>0?'page':'search';
     submitted=true;add('check_submitted',checker,sub);
    },
   };
  },
  close(){if(timer)clearInterval(timer);flush();},
 };
}

// Worker-backed statistics. A failed or slow worker only disables/drops statistics; requests are
// never affected. At most `maxPending` unacknowledged batches; further batches are dropped.
export function createBehaviorStats({db,snapshot,device=false,flushMs=5000,maxPending=4,log=console.log}){
 let worker,pending=0,active=true;
 const disable=()=>{if(active){active=false;log('Behavior statistics disabled.');}};
 try{worker=new Worker(new URL('./behavior-stats-worker.js',import.meta.url),{workerData:{db,snapshot},resourceLimits:{maxOldGenerationSizeMb:32}});}
 catch{log('Behavior statistics disabled.');return undefined;}
 worker.on('error',disable);worker.on('exit',disable);worker.on('message',m=>{pending=Math.max(0,pending-1);if(m==='fail')log('Behavior statistics write failed.');});worker.unref();
 const counter=createBehaviorCounter({device,flushMs,sink:rows=>{if(!active||pending>=maxPending)throw Error('drop');worker.postMessage({rows});pending++;}});
 return {...counter,
  close(){counter.close();if(!active)return worker.terminate();active=false;
   // Keep the process alive until the last batch is written and the worker has exited (max 2 s).
   worker.ref();
   return new Promise(resolve=>{const t=setTimeout(()=>worker.terminate().then(resolve,resolve),2000);worker.once('exit',()=>{clearTimeout(t);resolve();});try{worker.postMessage('close');}catch{clearTimeout(t);resolve();}});}};
}

// Enabled only by BEHAVIOR_STATS=1 with explicit, separate database and snapshot paths.
export function behaviorStatsFromEnv(env=process.env,options={}){
 if(env.BEHAVIOR_STATS!=='1')return undefined;
 const db=env.BEHAVIOR_DB_PATH,snapshot=env.BEHAVIOR_SNAPSHOT_PATH;
 if(!db||!snapshot||db===env.USAGE_DB_PATH||snapshot===env.USAGE_SNAPSHOT_PATH||db===snapshot)return undefined;
 return createBehaviorStats({db,snapshot,device:env.BEHAVIOR_DEVICE==='1',...options});
}
