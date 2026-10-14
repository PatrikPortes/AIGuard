import {planCheck,validateCheckPlan,aggregate,createCombinedResult} from '../public/check-plan.js';
import {validateCheckResult} from '../public/verdict-model.js';
import {analyze} from './analysis.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {fromMessage,fromWeb} from '../public/verdict-adapters.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from './firm-rules.js';
import {readCoiSnapshot} from './eshop-sources.js';

const FIRM_BUDGET_MS=4000;
const failed=(step,durationMs)=>({stepId:step.id,status:'failed',sourcesContacted:[],durationMs,result:null});
const skipped=(step,reason,durationMs=0)=>({...failed(step,durationMs),status:'skipped',skipReason:reason});
class Skip extends Error {constructor(reason){super(reason);this.reason=reason;}}

// S3.4 must inject the SAME instances used by /api/firm. No client, cache,
// limiter or gate is constructed here. Origin/session/IP/global analysis
// admission belongs to the existing HTTP boundary, not this in-process runner.
// prepare(input) binds one immutable plan to its request-local text; execute
// cannot accept a caller-modified plan or create steps from checker results.
export function createCheckRunner({
 firmClient,firmRequests,firmLimiter,firmSessionLimiter,
 adapters={},clock=Date.now,timers={setTimeout,clearTimeout},
 // The current client does not report cache hit/upstream contact metadata.
 // Empty by default, rather than inventing network contacts from cached facts.
 firmSourcesContacted=()=>[]
}={}){
 const handlers={analyze,checkWebUrl,coiResult,fromMessage,fromWeb,fromFirm,evaluateFirm,readCoiSnapshot,...adapters};
 const allowed=Object.keys({analyze,checkWebUrl,coiResult,fromMessage,fromWeb,fromFirm,evaluateFirm,readCoiSnapshot});
 if(Object.keys(adapters).some(k=>!allowed.includes(k))||allowed.some(k=>typeof handlers[k]!=='function')||typeof clock!=='function'||typeof timers.setTimeout!=='function'||typeof timers.clearTimeout!=='function'||typeof firmSourcesContacted!=='function')throw Error('INVALID_RUNNER_DEPENDENCIES');
 const opts={normalizeUrl:handlers.checkWebUrl};
 const elapsed=start=>Math.max(0,Math.floor(clock()-start));

 // Always races the adapter, even when it ignores AbortSignal. The losing
 // promise has rejection handlers and cannot update a returned outcome.
 async function bounded(task,parent,ms){
  const controller=new AbortController();let timer,abort;
  const stop=new Promise((_,reject)=>{
   abort=()=>{controller.abort();reject(new Skip('deadline'));};
   if(parent.aborted)abort();else{parent.addEventListener('abort',abort,{once:true});timer=timers.setTimeout(abort,ms);}
  });
  try{
   if(parent.aborted)throw new Skip('deadline');
   return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw new Skip('deadline');return task(controller.signal);}),stop]);
  }finally{if(timer!==undefined)timers.clearTimeout(timer);parent.removeEventListener('abort',abort);}
 }
 async function firm(ico,sessionId,signal){
  if(!firmClient||typeof firmClient.profile!=='function'||typeof firmRequests?.enter!=='function'||typeof firmLimiter?.check!=='function'||typeof firmSessionLimiter?.check!=='function'||typeof sessionId!=='string'||!sessionId)throw Error('SHARED_FIRM_DEPENDENCIES_REQUIRED');
  try{firmSessionLimiter.check(sessionId);firmLimiter.check('firm');}
  catch(e){if(e?.status===429||e?.statusCode===429||e?.code==='RATE_LIMITED'||e?.message==='RATE_LIMITED')throw new Skip('rate_limited');throw e;}
  let release;
  try{release=firmRequests.enter();}catch{throw new Skip('rate_limited');}
  if(typeof release!=='function')throw Error('INVALID_ADMISSION_RELEASE');
  // Keep admission until the underlying shared profile settles, even if the
  // caller has already received a deadline result (client owns in-flight dedup).
  try{
   if(signal.aborted)throw new Skip('deadline');
   const profile=await firmClient.profile({ico},{signal});
   if(signal.aborted)throw new Skip('deadline');
   return {result:handlers.fromFirm(profile,handlers.evaluateFirm(profile,{now:clock()})),sourcesContacted:firmSourcesContacted(profile)};
  }finally{release();}
 }
 async function execute(plan,input,{sessionId,signal}={}){
  validateCheckPlan(plan,opts);
  const started=clock(),controller=new AbortController();
  const abort=()=>controller.abort();
  const timer=timers.setTimeout(abort,plan.budget.deadlineMs);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
   const outcomes=await Promise.all(plan.steps.map(async step=>{
    const begin=clock();
    if(controller.signal.aborted)return skipped(step,'deadline');
    // Prepared server plans cannot contain P2/client executions. Fail closed
    // here too, so a future caller cannot execute a client-only step in-process.
    if(step.runAt!=='server'||!['message','web','firm'].includes(step.checker))return skipped(step,'budget');
    try{
     const data=await bounded(async stepSignal=>{
      const checkedAt=new Date(clock()).toISOString();
      if(step.checker==='message')return {result:handlers.fromMessage(await handlers.analyze({type:'text',content:input.text}),{checkedAt}),sourcesContacted:['none']};
      if(step.checker==='web'){
       if(step.trigger!=='extracted_from_text')throw Error('URL_NOT_ALLOWED');
       const url=handlers.checkWebUrl(step.input.ref);
       let snapshot;try{snapshot=await handlers.readCoiSnapshot();}catch{snapshot={schema:1,lastAttemptOk:false};}
       if(stepSignal.aborted)throw new Skip('deadline');
       return {result:handlers.fromWeb(url,handlers.coiResult(url.hostname,snapshot,clock()),undefined,{checkedAt}),sourcesContacted:['COI']};
      }
      return firm(step.input.ref,sessionId,stepSignal);
     },controller.signal,step.checker==='firm'?FIRM_BUDGET_MS:plan.budget.deadlineMs-elapsed(started));
     if(controller.signal.aborted||elapsed(started)>=plan.budget.deadlineMs||step.checker==='firm'&&elapsed(begin)>=FIRM_BUDGET_MS)throw new Skip('deadline');
     validateCheckResult(data.result);
     const candidate={stepId:step.id,status:'done',sourcesContacted:data.sourcesContacted,durationMs:elapsed(begin),result:data.result};
     // Reuse S3.2's strict nested whitelist before admitting an adapter result.
     aggregate(plan.steps,plan.steps.map(s=>s.id===step.id?candidate:failed(s,0)));
     return candidate;
    }catch(e){return e instanceof Skip?skipped(step,e.reason,elapsed(begin)):failed(step,elapsed(begin));}
   }));
   return createCombinedResult({plan,outcomes,checkedAt:new Date(clock()).toISOString()},opts);
  }finally{timers.clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 function prepare(input){
  // Exact server wire shape. Standalone URL is never accepted by this runner.
  if(!input||typeof input!=='object'||Array.isArray(input)||Reflect.ownKeys(input).some(k=>!['text','ico'].includes(k)||!('value' in Object.getOwnPropertyDescriptor(input,k))))throw Error('INVALID_INPUT');
  const plan=planCheck(input,{...opts,runAt:'server'});
  let raw=Object.freeze({...('text' in input?{text:input.text.trim()}:{}),...('ico' in input?{ico:input.ico}:{})});
  let used=false;
  return Object.freeze({plan,run(options){if(used)throw Error('PLAN_ALREADY_EXECUTED');used=true;const input=raw;raw=null;return execute(plan,input,options);}});
 }
 return Object.freeze({prepare,run:(input,options)=>prepare(input).run(options)});
}
