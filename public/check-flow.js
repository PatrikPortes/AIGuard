import {planCheck,aggregate,createCombinedResult,validIco} from './check-plan.js';
import {validateCheckResult} from './verdict-model.js';
import {fromWeb,fromMessage,fromLoan,fromContract} from './verdict-adapters.js';
import {renderCheckProgress,renderCombinedResult} from './check-view.js';

// S3.6/S3.7 client runner. URLs are planned and checked only in this browser
// (P2 field, P4 links in a message). The only request this runner makes is the
// existing /api/firm with the IČO (P3/P5); a URL, host or path is never sent.
// The message step (P1) adopts the result the page already received from the
// existing /api/analyze. Checkers are injected by the page (no checker import, no fan-out).
// S4.4: the investment step (P8) runs the injected S4.1 rules + S4.2 adapter in this
// browser; the offer text is never sent anywhere (only {"ico"} to /api/firm).
const failed=(step,durationMs=0)=>({stepId:step.id,status:'failed',sourcesContacted:[],durationMs,result:null});
const skipped=(step,reason,durationMs=0)=>({...failed(step,durationMs),status:'skipped',skipReason:reason});
class Skip extends Error {constructor(reason){super(reason);this.reason=reason;}}

export const isValidIco=ico=>typeof ico==='string'&&validIco(ico);

function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const stop=()=>reject(new Skip('deadline'));
  if(signal.aborted)return stop();
  signal.addEventListener('abort',stop,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
 });
}

export async function runWebFirmCheck({url,ico}={},{checkWebUrl,coiResult,coiData=null,fetchImpl=globalThis.fetch,clock=Date.now,signal}={}){
 if(typeof checkWebUrl!=='function'||typeof coiResult!=='function'||typeof fetchImpl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 const plan=planCheck({url,...(ico===undefined||ico===''?{}:{ico})},{runAt:'client',normalizeUrl:checkWebUrl});
 return runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal});
}

// S3.7: the message text is planned in the browser (P1, P4, P5). `analysis` is the
// completed /api/analyze response for exactly this text; it is never re-requested.
// coiData may be a function, so the ČOI snapshot is loaded only for a planned web step.
export function planMessageCheck(text,{checkWebUrl}={}){
 if(typeof checkWebUrl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 return planCheck({text},{runAt:'client',normalizeUrl:checkWebUrl});
}
export async function runMessageCheck({text,analysis,analysisMs=0}={},{checkWebUrl,coiResult,coiData=null,fetchImpl=globalThis.fetch,clock=Date.now,signal}={}){
 if(typeof checkWebUrl!=='function'||typeof coiResult!=='function'||typeof fetchImpl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 const plan=planMessageCheck(text,{checkWebUrl});
 const message={analysis,durationMs:Number.isSafeInteger(analysisMs)&&analysisMs>=0?analysisMs:0};
 return runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal,message});
}

// S4.4: investment offer (+ optional IČO field, optional URL field), planned with P8.
export function planInvestmentCheck({offer,ico,url}={},{checkWebUrl}={}){
 if(typeof checkWebUrl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 return planCheck({offer,...(ico===undefined||ico===''?{}:{ico}),...(url===undefined||url===''?{}:{url})},{runAt:'client',normalizeUrl:checkWebUrl});
}
export async function runInvestmentCheck({offer,ico,url}={},{evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData=null,fetchImpl=globalThis.fetch,clock=Date.now,signal}={}){
 if(typeof evaluateInvestment!=='function'||typeof fromInvestment!=='function'||typeof checkWebUrl!=='function'||typeof coiResult!=='function'||typeof fetchImpl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 const plan=planInvestmentCheck({offer,ico,url},{checkWebUrl});
 // The raw offer stays in this closure; the plan and the result carry only quotes/chars.
 const investment={offer,ico:plan.input.icoField??undefined,evaluateInvestment,fromInvestment};
 return runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal,investment});
}

// S5.2: loan communication (P9) on /proverit-pujcku, optionally with the provider's IČO.
// `analysis` is the completed /api/analyze (topic loan) response for exactly this text;
// it is adopted with fromLoan and never re-requested.
export function planLoanCheck({loan,ico}={},{checkWebUrl}={}){
 if(typeof checkWebUrl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 return planCheck({loan,...(ico===undefined||ico===''?{}:{ico})},{runAt:'client',normalizeUrl:checkWebUrl});
}
export async function runLoanCheck({loan,ico,analysis,analysisMs=0}={},{checkWebUrl,coiResult,coiData=null,fetchImpl=globalThis.fetch,clock=Date.now,signal}={}){
 if(typeof checkWebUrl!=='function'||typeof coiResult!=='function'||typeof fetchImpl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 const plan=planLoanCheck({loan,ico},{checkWebUrl});
 const loanAdoption={analysis,durationMs:Number.isSafeInteger(analysisMs)&&analysisMs>=0?analysisMs:0};
 return runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal,loanAdoption});
}

// S5.3: contract (P10) + the firm the user chose. The contract text never leaves the browser;
// `contractResult` is the page's completed local contract check, adopted with fromContract.
export function planContractFirm({contract,ico}={}){
 return planCheck({contract,...(ico===undefined||ico===''?{}:{ico})},{runAt:'client'});
}
// Candidate parties for the user to choose from: labelled IČO with a valid checksum, plus
// labelled numbers that fail the checksum (shown for manual confirmation). Nothing is assumed.
export function contractParties(contract){
 const plan=planContractFirm({contract});
 return {candidates:[...plan.input.extracted.icos],invalid:plan.notPlanned.filter(n=>n.kind==='ico'&&n.reason==='invalid').map(n=>n.value)};
}
export async function runContractFirmCheck({contract,ico,contractResult}={},{checkWebUrl,coiResult,coiData=null,fetchImpl=globalThis.fetch,clock=Date.now,signal}={}){
 if(typeof checkWebUrl!=='function'||typeof coiResult!=='function'||typeof fetchImpl!=='function')throw Error('INVALID_FLOW_DEPENDENCIES');
 const plan=planContractFirm({contract,ico});
 return runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal,contractAdoption:{result:contractResult}});
}

async function runPlan(plan,{checkWebUrl,coiResult,coiData,fetchImpl,clock,signal,message,investment,loanAdoption,contractAdoption}){
 const opts={normalizeUrl:checkWebUrl};
 const elapsed=begin=>Math.max(0,Math.floor(clock()-begin));
 const deadline=AbortSignal.timeout(plan.budget.deadlineMs);
 const all=signal?AbortSignal.any([signal,deadline]):deadline;
 let snapshot;
 const coi=()=>snapshot??=Promise.resolve().then(()=>typeof coiData==='function'?coiData():coiData);

 async function web(step,checkedAt){
  const urlResult=checkWebUrl(step.input.ref);
  let data=null;try{data=await abortable(coi(),all);}catch(e){if(e instanceof Skip)throw e;data=null;}
  return {result:fromWeb(urlResult,coiResult(urlResult.hostname,data,clock()),undefined,{checkedAt}),sourcesContacted:['COI']};
 }
 async function firm(step){
  try{
   const session=await fetchImpl('/api/session',{signal:all,credentials:'same-origin',cache:'no-store'});
   if(!session.ok)throw Error('SESSION_UNAVAILABLE');
   const r=await fetchImpl('/api/firm',{method:'POST',signal:all,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({ico:step.input.ref})});
   if(r.status===429)throw new Skip('rate_limited');
   if(!r.ok)throw Error('FIRM_UNAVAILABLE');
   const result=validateCheckResult(await r.json());
   const fact=result.facts.find(f=>f.id==='ico');
   if(result.checker!=='firm'||fact&&fact.value!==step.input.ref)throw Error('FIRM_MISMATCH');
   // /api/firm does not report cache or upstream contacts; nothing is inferred here.
   return {result,sourcesContacted:[]};
  }catch(e){if(all.aborted&&!(e instanceof Skip&&e.reason!=='deadline'))throw new Skip('deadline');throw e;}
 }
 // Local investment rules (S4.1) → CheckResult (S4.2). ČNB is never checked automatically.
 function evaluateOffer(checkedAt){
  const evaluation=investment.evaluateInvestment(investment.offer,investment.ico===undefined?{}:{ico:investment.ico});
  return {result:investment.fromInvestment(evaluation,{checkedAt}),sourcesContacted:['none']};
 }
 // Adopts the already completed server analysis; an invalid one fails this step.
 function adoptMessage(checkedAt){
  return {result:fromMessage(message.analysis,{checkedAt}),sourcesContacted:['none']};
 }

 const outcomes=await Promise.all(plan.steps.map(async step=>{
  const begin=clock();
  try{
   if(step.checker==='contract'&&contractAdoption){
    // Adopts the local contract result (no second evaluation); an invalid one fails the step.
    const candidate={stepId:step.id,status:'done',sourcesContacted:['none'],durationMs:0,result:fromContract(contractAdoption.result,{checkedAt:new Date(clock()).toISOString()})};
    aggregate(plan.steps,plan.steps.map(s=>s.id===step.id?candidate:failed(s)));
    return candidate;
   }
   if(step.checker==='loan'&&loanAdoption){
    // Adopts the existing loan analysis; an invalid one fails this required step.
    const candidate={stepId:step.id,status:'done',sourcesContacted:['none'],durationMs:loanAdoption.durationMs,result:fromLoan(loanAdoption.analysis,undefined,{checkedAt:new Date(clock()).toISOString()})};
    aggregate(plan.steps,plan.steps.map(s=>s.id===step.id?candidate:failed(s)));
    return candidate;
   }
   if(step.checker==='message'&&message){
    const candidate={stepId:step.id,status:'done',sourcesContacted:['none'],durationMs:message.durationMs,result:adoptMessage(new Date(clock()).toISOString()).result};
    aggregate(plan.steps,plan.steps.map(s=>s.id===step.id?candidate:failed(s)));
    return candidate;
   }
   if(all.aborted)throw new Skip('deadline');
   const checkedAt=new Date(clock()).toISOString();
   const data=step.checker==='web'&&step.runAt==='client'?await web(step,checkedAt):step.checker==='firm'?await firm(step):step.checker==='investment'&&step.runAt==='client'&&investment?evaluateOffer(checkedAt):null;
   if(!data)return skipped(step,'budget');
   if(all.aborted)throw new Skip('deadline');
   const candidate={stepId:step.id,status:'done',sourcesContacted:data.sourcesContacted,durationMs:elapsed(begin),result:data.result};
   // Same strict nested whitelist the server runner applies before admitting a result.
   aggregate(plan.steps,plan.steps.map(s=>s.id===step.id?candidate:failed(s)));
   return candidate;
  }catch(e){return e instanceof Skip?skipped(step,e.reason,elapsed(begin)):failed(step,elapsed(begin));}
 }));
 return createCombinedResult({plan,outcomes,checkedAt:new Date(clock()).toISOString()},opts);
}

let current;
export function resetWebFirmCheck(container){
 current?.abort();current=undefined;
 if(container){container.replaceChildren();container.hidden=true;container.setAttribute('aria-busy','false');}
}
export async function startWebFirmCheck(container,{url,ico,checkWebUrl,coiResult,coiData}){
 resetWebFirmCheck(container);
 const controller=new AbortController();current=controller;
 container.hidden=false;renderCheckProgress(container);
 try{
  const result=await runWebFirmCheck({url,ico},{checkWebUrl,coiResult,coiData,signal:controller.signal});
  if(controller.signal.aborted)return;
  renderCombinedResult(container,result,{normalizeUrl:checkWebUrl});
 }catch{
  if(controller.signal.aborted)return;
  const p=container.ownerDocument.createElement('p');p.setAttribute('role','alert');
  p.textContent='Společné prověření webu a firmy se nepodařilo dokončit. Výsledek kontroly adresy níže zůstává platný; firmu jsme neověřili.';
  container.replaceChildren(p);container.setAttribute('aria-busy','false');
 }
}

// S3.7: rendered below the message result. Focus stays on the F5a result the user
// is already reading; the combined result is announced through role="status".
export async function startMessageCheck(container,{text,analysis,analysisMs,checkWebUrl,coiResult,coiData}){
 resetWebFirmCheck(container);
 const controller=new AbortController();current=controller;
 container.hidden=false;renderCheckProgress(container);
 try{
  const result=await runMessageCheck({text,analysis,analysisMs},{checkWebUrl,coiResult,coiData,signal:controller.signal});
  if(controller.signal.aborted)return;
  renderCombinedResult(container,result,{normalizeUrl:checkWebUrl,focus:false});
 }catch{
  if(controller.signal.aborted)return;
  const p=container.ownerDocument.createElement('p');p.setAttribute('role','alert');
  p.textContent='Společné prověření odkazů a firmy se nepodařilo dokončit. Výsledek kontroly zprávy výše zůstává platný; odkazy ani firmu jsme neověřili.';
  container.replaceChildren(p);container.setAttribute('aria-busy','false');
 }
}

// S4.4: dedicated investment page. Focus moves to the combined headline (S3.5 rule).
export async function startInvestmentCheck(container,{offer,ico,url,evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData}){
 resetWebFirmCheck(container);
 const controller=new AbortController();current=controller;
 container.hidden=false;renderCheckProgress(container);
 try{
  const result=await runInvestmentCheck({offer,ico,url},{evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData,signal:controller.signal});
  if(controller.signal.aborted)return;
  renderCombinedResult(container,result,{normalizeUrl:checkWebUrl,registryNeutral:true});
  return result;
 }catch{
  if(controller.signal.aborted)return;
  const p=container.ownerDocument.createElement('p');p.setAttribute('role','alert');
  p.textContent='Prověření nabídky se nepodařilo dokončit. Nic jsme neodeslali kromě případného IČO. Zkuste to prosím znovu.';
  container.replaceChildren(p);container.setAttribute('aria-busy','false');
 }
}

// S5.2: rendered below the F5a loan result (focus stays there); clean firm shown neutrally.
export async function startLoanCheck(container,{loan,ico,analysis,analysisMs,checkWebUrl,coiResult,coiData}){
 resetWebFirmCheck(container);
 const controller=new AbortController();current=controller;
 container.hidden=false;renderCheckProgress(container);
 try{
  const result=await runLoanCheck({loan,ico,analysis,analysisMs},{checkWebUrl,coiResult,coiData,signal:controller.signal});
  if(controller.signal.aborted)return;
  renderCombinedResult(container,result,{normalizeUrl:checkWebUrl,focus:false,registryNeutral:true});
  return result;
 }catch{
  if(controller.signal.aborted)return;
  const p=container.ownerDocument.createElement('p');p.setAttribute('role','alert');
  p.textContent='Společné prověření poskytovatele se nepodařilo dokončit. Výsledek kontroly půjčky výše zůstává platný; firmu ani oprávnění jsme neověřili.';
  container.replaceChildren(p);container.setAttribute('aria-busy','false');
 }
}

// S5.3: started by the user's explicit choice of a party, so focus moves to the new verdict.
export async function startContractFirmCheck(container,{contract,ico,contractResult,checkWebUrl,coiResult}){
 resetWebFirmCheck(container);
 const controller=new AbortController();current=controller;
 container.hidden=false;renderCheckProgress(container);
 try{
  const result=await runContractFirmCheck({contract,ico,contractResult},{checkWebUrl,coiResult,signal:controller.signal});
  if(controller.signal.aborted)return;
  renderCombinedResult(container,result,{normalizeUrl:checkWebUrl,registryNeutral:true});
  return result;
 }catch{
  if(controller.signal.aborted)return;
  const p=container.ownerDocument.createElement('p');p.setAttribute('role','alert');
  p.textContent='Prověření vybrané firmy se nepodařilo dokončit. Výsledek kontroly smlouvy výše zůstává platný; firmu jsme neověřili.';
  container.replaceChildren(p);container.setAttribute('aria-busy','false');
 }
}
