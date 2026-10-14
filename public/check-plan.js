// Pure shared planner and aggregation: no checker imports, DOM or I/O.
import {CHECKERS,HEADLINES,validateCheckResult,isSafeCopy} from './verdict-model.js';

export const PLANNER_VERSION='p1';
export const BUDGET=Object.freeze({maxSteps:4,maxUrls:2,maxIcos:1,deadlineMs:5000});
function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
}
export const CHECKER_REGISTRY=freeze({
 message:{entityKinds:['text'],runAt:'server',requiredDefault:true},
 web:{entityKinds:['url'],runAt:'client',requiredDefault:true},
 firm:{entityKinds:['ico'],runAt:'server',requiredDefault:true}
});
const REASONS=Object.freeze({
 P1:'Vložili jste text zprávy.',P2:'Vložili jste adresu webu.',
 P3:'Vložili jste IČO firmy.',P4:'Odkaz uvedený v textu zprávy.',
 P5:'IČO uvedené v textu zprávy. Vztah k odesílateli jsme neověřili.',
 P6:'Duplicitní kontrolu neplánujeme.',P7:'Další kontrolu nelze jednoznačně naplánovat nebo přesahuje limit.'
});
const ORDER=(a,b)=>a<b?-1:a>b?1:0;
const MAX_URL_CANDIDATES=50;
const MAX_ICO_CANDIDATES=20000; // bounded by the maximum text length, not an extra heuristic cap
const own=(o,k)=>Object.hasOwn(o,k);
function object(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function keys(value,allowed,exact=false){
 if(!object(value))return false;
 const names=Reflect.ownKeys(value);
 return names.every(k=>typeof k==='string'&&allowed.includes(k)&&'value' in Object.getOwnPropertyDescriptor(value,k))&&
  (!exact||names.length===allowed.length&&allowed.every(k=>own(value,k)));
}
export function validIco(ico){
 if(typeof ico!=='string'||!/^\d{8}$/.test(ico))return false;
 const sum=[8,7,6,5,4,3,2].reduce((total,weight,i)=>total+Number(ico[i])*weight,0);
 return ((11-sum%11)%10)===Number(ico[7]);
}
function urlRecord(value,normalizeUrl){
 if(typeof normalizeUrl!=='function')throw Error('URL_NORMALIZER_REQUIRED');
 try{const {hostname,normalized}=normalizeUrl(value);return{host:hostname,normalized};}
 catch{throw Error('INVALID_URL');}
}
const draft=(checker,kind,ref,ruleId,trigger,required,primary,runAt)=>({
 checker,input:{kind,ref},trigger,reason:{ruleId,text:REASONS[ruleId]},required,primary,runAt
});
const skip=(kind,value,reason)=>({kind,value,reason});
function extract(text,normalizeUrl){
 const urls=new Map(),icos=new Set(),ignored=[],notPlanned=[];
 // The full match must also fit the existing normalizer's 2048-character cap.
 // Never truncate an overlong URL into a different, seemingly valid address.
 let count=0;
 for(const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"']{1,2048}/giu)){
  if(count++===MAX_URL_CANDIDATES){ignored.push({kind:'url',reason:'limit'});notPlanned.push(skip('url','','limit'));break;}
  const candidate=match[0],next=text[match.index+candidate.length];
  if(candidate.length>2048||next!==undefined&&/[^\s<>"']/u.test(next)){
   ignored.push({kind:'url',reason:'invalid'});notPlanned.push(skip('url','','invalid'));continue;
  }
  let record;try{record=urlRecord(candidate,normalizeUrl);}catch{
   ignored.push({kind:'url',reason:'invalid'});notPlanned.push(skip('url','','invalid'));continue;
  }
  if(urls.has(record.normalized))notPlanned.push(skip('url',record.normalized,'duplicate'));
  else urls.set(record.normalized,record);
 }
 // Bounded whitespace is equivalent to the specified regex at the <=12-character
 // label distance. It avoids quadratic backtracking on an invalid whitespace tail.
 for(const match of text.matchAll(/\bIČO?\s{0,10}:?\s{0,10}(\d{8})\b/giu)){
  if(match[0].length-match[1].length>12)continue;
  const ico=match[1];
  if(!validIco(ico)){ignored.push({kind:'ico',reason:'invalid'});notPlanned.push(skip('ico',ico,'invalid'));}
  else if(icos.has(ico))notPlanned.push(skip('ico',ico,'duplicate'));
  else icos.add(ico);
 }
 return{urls:[...urls.values()].sort((a,b)=>ORDER(a.normalized,b.normalized)),icos:[...icos].sort(ORDER),ignored,notPlanned};
}
function deduplicate(steps){
 const unique=new Map(),notPlanned=[];
 for(const step of steps){
  const key=step.checker+'\0'+step.input.ref,previous=unique.get(key);
  if(!previous)unique.set(key,step);
  else{
   if(previous.trigger!=='user_field'&&step.trigger==='user_field')unique.set(key,step);
   notPlanned.push(skip(step.input.kind,step.input.ref,'duplicate'));
  }
 }
 return{steps:[...unique.values()],notPlanned};
}
function limit(steps){
 const selected=[],notPlanned=[],counts={message:0,web:0,firm:0};
 for(const step of steps){
  const max=step.checker==='web'?BUDGET.maxUrls:1;
  if(selected.length>=BUDGET.maxSteps||counts[step.checker]>=max)notPlanned.push(skip(step.input.kind,step.input.ref,'limit'));
  else{selected.push(step);counts[step.checker]++;}
 }
 return{steps:selected,notPlanned};
}
// Read-only rule registry for later stages; no Stage 4 checker or rule is added.
// P1-P5 return candidate steps; P6/P7 return {steps,notPlanned} transformations.
export const PLANNER_RULES=freeze([
 {id:'P1',when:c=>c.input.text!==null,steps:c=>[draft('message','text','text','P1','user_field',true,!c.input.urlField,'server')]},
 {id:'P2',when:c=>c.input.urlField!==null,steps:c=>[draft('web','url',c.input.urlField.normalized,'P2','user_field',true,true,'client')]},
 {id:'P3',when:c=>c.input.icoField!==null,steps:c=>[draft('firm','ico',c.input.icoField,'P3','user_field',true,!c.input.text&&!c.input.urlField,'server')]},
 {id:'P4',when:c=>c.input.extracted.urls.length>0,steps:c=>c.input.extracted.urls.map(u=>draft('web','url',u.normalized,'P4','extracted_from_text',true,false,c.runAt))},
 {id:'P5',when:c=>!c.input.icoField&&c.input.extracted.icos.length===1,steps:c=>[draft('firm','ico',c.input.extracted.icos[0],'P5','extracted_from_text',false,false,'server')]},
 {id:'P6',when:()=>true,steps:c=>deduplicate(c.steps)},
 {id:'P7',when:()=>true,steps:c=>limit(c.steps)}
]);
export function planCheck(input={},opts={}){
 if(!keys(input,['text','ico','url']))throw Error('INVALID_INPUT');
 if(!keys(opts,['runAt','normalizeUrl'])||opts.runAt!==undefined&&!['server','client'].includes(opts.runAt))throw Error('INVALID_OPTIONS');
 const {normalizeUrl}=opts;
 if(normalizeUrl!==undefined&&typeof normalizeUrl!=='function')throw Error('INVALID_OPTIONS');
 const runAt=opts.runAt||'server';let text=null,icoField=null,urlField=null;
 if(input.text!==undefined){
  if(typeof input.text!=='string')throw Error('INVALID_TEXT');text=input.text.trim();
  if(text.length<1||text.length>20000)throw Error('INVALID_TEXT');
 }
 if(input.ico!==undefined){if(!validIco(input.ico))throw Error('INVALID_ICO');icoField=input.ico;}
 if(text!==null&&typeof normalizeUrl!=='function')throw Error('URL_NORMALIZER_REQUIRED');
 if(input.url!==undefined){if(runAt!=='client')throw Error('URL_NOT_ALLOWED');urlField=urlRecord(input.url,normalizeUrl);}
 if(text===null&&!icoField&&!urlField)throw Error('EMPTY_INPUT');
 const extracted=extract(text||'',normalizeUrl);
 const planInput={text:text===null?null:{present:true,chars:text.length},urlField,icoField,
  extracted:{urls:extracted.urls,icos:extracted.icos,ignored:extracted.ignored}};
 const context={input:planInput,runAt,steps:[]},notPlanned=[...extracted.notPlanned];
 for(const rule of PLANNER_RULES.slice(0,5))if(rule.when(context))context.steps.push(...rule.steps(context));
 if(extracted.icos.length>1){for(const ico of extracted.icos)notPlanned.push(skip('ico',ico,'ambiguous'));}
 else if(icoField&&extracted.icos.length){
  const ico=extracted.icos[0];notPlanned.push(skip('ico',ico,ico===icoField?'duplicate':'limit'));
 }
 for(const rule of PLANNER_RULES.slice(5)){
  const result=rule.steps(context);context.steps=result.steps;notPlanned.push(...result.notPlanned);
 }
 const omissions=[...new Map(notPlanned.map(n=>[JSON.stringify(n),n])).values()]
  .sort((a,b)=>ORDER(a.kind,b.kind)||ORDER(a.value,b.value)||ORDER(a.reason,b.reason));
 const plan={schema:1,planner:PLANNER_VERSION,input:planInput,
  steps:context.steps.map((step,i)=>({id:'s'+(i+1),...step})),notPlanned:omissions,budget:{...BUDGET}};
 validateCheckPlan(plan,{normalizeUrl});
 return freeze(plan);
}

export function validateCheckPlan(plan,opts={}){
 if(!keys(opts,['normalizeUrl'])||opts.normalizeUrl!==undefined&&typeof opts.normalizeUrl!=='function')throw Error('INVALID_OPTIONS');
 const {normalizeUrl}=opts;
 const require=value=>{if(!value)throw Error('INVALID_PLAN');};
 require(keys(plan,['schema','planner','input','steps','notPlanned','budget'],true));
 require(plan.schema===1&&plan.planner===PLANNER_VERSION&&keys(plan.budget,Object.keys(BUDGET),true));
 require(Object.keys(BUDGET).every(k=>plan.budget[k]===BUDGET[k]));
 const input=plan.input;
 require(keys(input,['text','urlField','icoField','extracted'],true));
 require(input.text===null||keys(input.text,['present','chars'],true)&&input.text.present===true&&Number.isInteger(input.text.chars)&&input.text.chars>=1&&input.text.chars<=20000);
 const validateUrl=record=>{
  require(keys(record,['host','normalized'],true));let canonical;
  if(typeof normalizeUrl!=='function')throw Error('URL_NORMALIZER_REQUIRED');
  try{canonical=urlRecord(record.normalized,normalizeUrl);}catch{throw Error('INVALID_PLAN');}
  require(record.host===canonical.host&&record.normalized===canonical.normalized);
 };
 if(input.urlField!==null)validateUrl(input.urlField);
 require(input.icoField===null||validIco(input.icoField));
 require(input.text!==null||input.urlField!==null||input.icoField!==null);
 require(keys(input.extracted,['urls','icos','ignored'],true));
 const {urls,icos,ignored}=input.extracted;
 require(Array.isArray(urls)&&urls.length<=MAX_URL_CANDIDATES&&Array.isArray(icos)&&icos.length<=MAX_ICO_CANDIDATES&&Array.isArray(ignored)&&ignored.length<=MAX_ICO_CANDIDATES+MAX_URL_CANDIDATES+1);
 urls.forEach(validateUrl);require(new Set(urls.map(u=>u.normalized)).size===urls.length);
 require(icos.every(validIco)&&new Set(icos).size===icos.length);
 require(ignored.every(x=>keys(x,['kind','reason'],true)&&['url','ico'].includes(x.kind)&&['invalid','limit'].includes(x.reason)));
 if(input.text===null)require(urls.length===0&&icos.length===0&&ignored.length===0);
 require(Array.isArray(plan.steps)&&plan.steps.length>=1&&plan.steps.length<=BUDGET.maxSteps);
 require(Array.isArray(plan.notPlanned)&&plan.notPlanned.length<=MAX_ICO_CANDIDATES+2*MAX_URL_CANDIDATES+2);
 const unique=new Set(),counts={message:0,web:0,firm:0};let primaries=0;
 for(const [index,step]of plan.steps.entries()){
  require(keys(step,['id','checker','input','trigger','reason','required','primary','runAt'],true));
  require(step.id==='s'+(index+1)&&own(CHECKER_REGISTRY,step.checker));counts[step.checker]++;
  require(keys(step.input,['kind','ref'],true)&&typeof step.input.ref==='string');
  require(keys(step.reason,['ruleId','text'],true)&&own(REASONS,step.reason.ruleId)&&step.reason.text===REASONS[step.reason.ruleId]);
  require(typeof step.required==='boolean'&&typeof step.primary==='boolean'&&['server','client'].includes(step.runAt));
  require(['user_field','extracted_from_text'].includes(step.trigger));
  const rule=step.reason.ruleId,key=step.checker+'\0'+step.input.ref;
  require(!unique.has(key));unique.add(key);if(step.primary)primaries++;
  if(rule==='P1')require(step.checker==='message'&&step.input.kind==='text'&&step.input.ref==='text'&&input.text!==null&&step.trigger==='user_field'&&step.required&&step.primary===!input.urlField&&step.runAt==='server');
  else if(rule==='P2')require(step.checker==='web'&&step.input.kind==='url'&&step.input.ref===input.urlField?.normalized&&step.trigger==='user_field'&&step.required&&step.primary&&step.runAt==='client');
  else if(rule==='P3')require(step.checker==='firm'&&step.input.kind==='ico'&&step.input.ref===input.icoField&&step.trigger==='user_field'&&step.required&&step.primary===(!input.text&&!input.urlField)&&step.runAt==='server');
  else if(rule==='P4')require(step.checker==='web'&&step.input.kind==='url'&&urls.some(u=>u.normalized===step.input.ref)&&step.input.ref!==input.urlField?.normalized&&step.trigger==='extracted_from_text'&&step.required&&!step.primary&&(!input.urlField||step.runAt==='client'));
  else if(rule==='P5')require(step.checker==='firm'&&step.input.kind==='ico'&&icos.length===1&&step.input.ref===icos[0]&&!input.icoField&&step.trigger==='extracted_from_text'&&!step.required&&!step.primary&&step.runAt==='server');
  else require(false); // P6/P7 remove/limit steps; they never create checker executions.
 }
 require(primaries===1&&counts.message<=1&&counts.web<=2&&counts.firm<=1);
 if(input.text!==null)require(plan.steps.some(s=>s.reason.ruleId==='P1'));
 if(input.urlField!==null)require(plan.steps.some(s=>s.reason.ruleId==='P2'));
 if(input.icoField!==null)require(plan.steps.some(s=>s.reason.ruleId==='P3'));
 for(const omission of plan.notPlanned){
  require(keys(omission,['kind','value','reason'],true)&&['url','ico'].includes(omission.kind)&&typeof omission.value==='string'&&omission.value.length<=2048&&['limit','ambiguous','duplicate','invalid'].includes(omission.reason));
  if(omission.kind==='ico')require(/^\d{8}$/.test(omission.value));
  else if(omission.value!==''){if(typeof normalizeUrl!=='function')throw Error('URL_NORMALIZER_REQUIRED');try{urlRecord(omission.value,normalizeUrl);}catch{throw Error('INVALID_PLAN');}}
  if(omission.reason==='ambiguous')require(omission.kind==='ico'&&icos.length>1&&icos.includes(omission.value));
 }
 return plan;
}

const OUTCOME_SOURCES=Object.freeze(['ARES','ARES_VR','ARES_RES','DPH','COI','none']);
const SKIP_REASONS=Object.freeze(['rate_limited','deadline','duplicate','budget']);
const RISK_ORDER=Object.freeze(['serious','incomplete','attention','not_assessable','none_found']);
const AGGREGATE_COPY=Object.freeze({
 A1:'Dílčí kontrola ukazuje závažný varovný signál.',
 A2:'Primární kontrolu se nepodařilo dokončit.',
 A3:'Část povinných kontrol se nepodařilo dokončit.',
 A4:'Dílčí kontrola našla podněty k dalšímu ověření.',
 A5:'Rozsah kontroly neumožňuje potvrdit nepřítomnost rizika.',
 A6:'V prověřených zdrojích jsme nenašli výrazné varovné signály. Kontrola nemůže zaručit, že je obsah nebo nabídka bezpečná.'
});
function aggregationInputs(steps,outcomes){
 const require=value=>{if(!value)throw Error('INVALID_OUTCOMES');};
 require(Array.isArray(steps)&&steps.length>=1&&steps.length<=BUDGET.maxSteps);
 require(Array.isArray(outcomes)&&outcomes.length===steps.length);
 require(steps.filter(s=>s?.primary===true).length===1);
 const ids=new Set();
 for(const [i,s]of steps.entries()){
  require(keys(s,['id','checker','input','trigger','reason','required','primary','runAt'],true));
  require(s.id==='s'+(i+1)&&CHECKERS.includes(s.checker)&&typeof s.required==='boolean'&&typeof s.primary==='boolean');
  require(keys(s.input,['kind','ref'],true)&&['text','url','ico'].includes(s.input.kind)&&typeof s.input.ref==='string');
  require(keys(s.reason,['ruleId','text'],true)&&own(REASONS,s.reason.ruleId)&&s.reason.text===REASONS[s.reason.ruleId]);
  require(['user_field','extracted_from_text'].includes(s.trigger)&&['server','client'].includes(s.runAt));
 }
 for(const o of outcomes){
  require(keys(o,['stepId','status','skipReason','sourcesContacted','durationMs','result']));
  require(['stepId','status','sourcesContacted','durationMs','result'].every(k=>own(o,k)));
  const s=steps.find(s=>s.id===o.stepId);require(s&&!ids.has(o.stepId));ids.add(o.stepId);
  require(['done','failed','skipped'].includes(o.status));
  require(Number.isSafeInteger(o.durationMs)&&o.durationMs>=0);
  require(Array.isArray(o.sourcesContacted)&&o.sourcesContacted.length<=OUTCOME_SOURCES.length&&o.sourcesContacted.every(s=>OUTCOME_SOURCES.includes(s))&&new Set(o.sourcesContacted).size===o.sourcesContacted.length);
  require(!o.sourcesContacted.includes('none')||o.sourcesContacted.length===1);
  if(o.status==='skipped')require(SKIP_REASONS.includes(o.skipReason));else require(!own(o,'skipReason'));
  if(o.status==='done'){
   require(o.result!==null);validateCheckResult(o.result);require(o.result.checker===s.checker);
   // Schema-1 nested whitelist prevents hidden raw inputs/scores in the wrapper.
   const r=o.result;
   require(keys(r.actions,['primary','secondary'],true));
   require(r.reasons.every(v=>keys(v,['ruleId','text'],true)));
   require(r.facts.every(v=>keys(v,['id','label','value','kind','source','sourceDetail','observedAt','sourceUrl'])));
   require(r.findings.every(v=>keys(v,['id','ruleId','origin','severity','title','explanation','evidence'],true)));
   require(r.sources.every(v=>keys(v,['id','label','status','checkedAt','note'])));
   require(r.verifyLinks.every(v=>keys(v,['label','url'],true)));
   require(r.ai===null||keys(r.ai,['status','summary']));
   require(!['none_found','not_assessable'].includes(r.level)||!r.findings.some(v=>v.severity==='attention'));
   require(r.level!=='none_found'||!r.sources.some(v=>['unavailable','skipped'].includes(v.status)));

  }else require(o.result===null);
 }
 return steps.map(step=>({step,outcome:outcomes.find(o=>o.stepId===step.id)}));
}

// A1-A6 only consume completed, validated results; no checker execution occurs.
export function aggregate(steps,outcomes){
 const rows=aggregationInputs(steps,outcomes),completed=rows.filter(r=>r.outcome.status==='done');
 const find=level=>completed.find(r=>r.outcome.result.level===level);
 let level,ruleId,decisive;
 if((decisive=find('serious'))){level='serious';ruleId='A1';}
 else if((decisive=rows.find(r=>r.step.primary&&(r.outcome.status!=='done'||r.outcome.result.level==='incomplete')))){level='incomplete';ruleId='A2';}
 else if((decisive=rows.find(r=>r.step.required&&(r.outcome.status!=='done'||r.outcome.result.level==='incomplete')))){level='attention';ruleId='A3';}
 else if((decisive=find('attention'))){level='attention';ruleId='A4';}
 // A completed optional incomplete result cannot satisfy A6 (all completed none_found).
 else if((decisive=find('not_assessable'))||(decisive=find('incomplete'))||(decisive=rows.find(r=>['message','web'].includes(r.step.checker)))){level='not_assessable';ruleId='A5';}
 else{level='none_found';ruleId='A6';}
 const influential=ruleId==='A3'?rows.filter(r=>r.step.required&&(r.outcome.status!=='done'||r.outcome.result.level==='incomplete')):[decisive];
 const reasons=influential.map(r=>({ruleId,stepId:r?.step.id||null,text:AGGREGATE_COPY[ruleId]}));
 // Sort by severity, then original plan order, never outcome arrival order.
 const ranked=[...completed].sort((a,b)=>RISK_ORDER.indexOf(a.outcome.result.level)-RISK_ORDER.indexOf(b.outcome.result.level)||steps.indexOf(a.step)-steps.indexOf(b.step));
 const primary=ranked[0]?.outcome.result.actions.primary||null;
 const secondary=[...new Set(ranked.slice(1).flatMap(r=>[r.outcome.result.actions.primary,...r.outcome.result.actions.secondary]))].filter(s=>s!==primary).slice(0,3);
 return freeze({level,headline:HEADLINES[level],reasons,actions:{primary,secondary}});
}

// Explicit checkedAt keeps the shared module deterministic (no implicit clock).
export function createCombinedResult({plan,outcomes,checkedAt},opts={}){
 validateCheckPlan(plan,opts);
 const combinedAggregate=aggregate(plan.steps,outcomes);
 const result={schema:1,kind:'combined',plan:structuredClone(plan),outcomes:structuredClone(outcomes),aggregate:combinedAggregate,checkedAt};
 validateCombinedResult(result,opts);
 return freeze(result);
}
export function validateCombinedResult(result,opts={}){
 const require=value=>{if(!value)throw Error('INVALID_COMBINED_RESULT');};
 require(keys(result,['schema','kind','plan','outcomes','aggregate','checkedAt'],true));
 require(result.schema===1&&result.kind==='combined');
 require(typeof result.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(result.checkedAt)&&Number.isFinite(Date.parse(result.checkedAt)));
 validateCheckPlan(result.plan,opts);
 const expected=aggregate(result.plan.steps,result.outcomes),a=result.aggregate;
 require(keys(a,['level','headline','reasons','actions'],true));
 require(a.level===expected.level&&a.headline===expected.headline);
 require(Array.isArray(a.reasons)&&a.reasons.length===expected.reasons.length);
 a.reasons.forEach((r,i)=>require(keys(r,['ruleId','stepId','text'],true)&&r.ruleId===expected.reasons[i].ruleId&&r.stepId===expected.reasons[i].stepId&&r.text===expected.reasons[i].text&&isSafeCopy(r.text)));
 require(keys(a.actions,['primary','secondary'],true)&&a.actions.primary===expected.actions.primary);
 require(Array.isArray(a.actions.secondary)&&a.actions.secondary.length===expected.actions.secondary.length&&a.actions.secondary.every((s,i)=>s===expected.actions.secondary[i]&&isSafeCopy(s)));
 require(a.actions.primary===null||isSafeCopy(a.actions.primary));
 return result;
}
