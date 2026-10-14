// S3.1 only: a synchronous plan, never a runner or an aggregate.
// URL normalization uses the existing function; no findings are retained.
// Integration blocker outside S3.1: web-checker.js/eshop-checker.js bind DOM
// listeners at import time. A side-effect-free browser import needs their UI
// initialization isolated first; this module does not modify those checkers.
import {checkWebUrl} from './web-checker.js';

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
function urlRecord(value){
 try{const {hostname,normalized}=checkWebUrl(value);return{host:hostname,normalized};}
 catch{throw Error('INVALID_URL');}
}
const draft=(checker,kind,ref,ruleId,trigger,required,primary,runAt)=>({
 checker,input:{kind,ref},trigger,reason:{ruleId,text:REASONS[ruleId]},required,primary,runAt
});
const skip=(kind,value,reason)=>({kind,value,reason});
function extract(text){
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
  let record;try{record=urlRecord(candidate);}catch{
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
 if(!keys(opts,['runAt'])||opts.runAt!==undefined&&!['server','client'].includes(opts.runAt))throw Error('INVALID_OPTIONS');
 const runAt=opts.runAt||'server';let text=null,icoField=null,urlField=null;
 if(input.text!==undefined){
  if(typeof input.text!=='string')throw Error('INVALID_TEXT');text=input.text.trim();
  if(text.length<1||text.length>20000)throw Error('INVALID_TEXT');
 }
 if(input.ico!==undefined){if(!validIco(input.ico))throw Error('INVALID_ICO');icoField=input.ico;}
 if(input.url!==undefined){if(runAt!=='client')throw Error('URL_NOT_ALLOWED');urlField=urlRecord(input.url);}
 if(text===null&&!icoField&&!urlField)throw Error('EMPTY_INPUT');
 const extracted=extract(text||'');
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
 validateCheckPlan(plan);
 return freeze(plan);
}

export function validateCheckPlan(plan){
 const require=value=>{if(!value)throw Error('INVALID_PLAN');};
 require(keys(plan,['schema','planner','input','steps','notPlanned','budget'],true));
 require(plan.schema===1&&plan.planner===PLANNER_VERSION&&keys(plan.budget,Object.keys(BUDGET),true));
 require(Object.keys(BUDGET).every(k=>plan.budget[k]===BUDGET[k]));
 const input=plan.input;
 require(keys(input,['text','urlField','icoField','extracted'],true));
 require(input.text===null||keys(input.text,['present','chars'],true)&&input.text.present===true&&Number.isInteger(input.text.chars)&&input.text.chars>=1&&input.text.chars<=20000);
 const validateUrl=record=>{
  require(keys(record,['host','normalized'],true));let canonical;
  try{canonical=urlRecord(record.normalized);}catch{throw Error('INVALID_PLAN');}
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
  else if(omission.value!==''){try{urlRecord(omission.value);}catch{throw Error('INVALID_PLAN');}}
  if(omission.reason==='ambiguous')require(omission.kind==='ico'&&icos.length>1&&icos.includes(omission.value));
 }
 return plan;
}
