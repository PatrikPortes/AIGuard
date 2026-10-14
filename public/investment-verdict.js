// Stage 4 (S4.2): evaluateInvestment() result → schema-1 CheckResult (checker 'investment').
// Presentation adapter only: no re-analysis, no network, no decision about the offer's truth.
// All copy is taken from the fixed S4.1 catalogue by ID; only offer quotes are free text.
import {createCheckResult,OFFER_QUOTE_LABEL,approvedLink} from './verdict-model.js';
import {INVESTMENT_RULES,INVESTMENT_ACTIONS,MISSING_INFO,RULES_VERSION} from './investment-rules.js';

const fail=()=>{throw Error('INVALID_INVESTMENT_EVALUATION');};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exactKeys=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
// ČNB is never verified automatically in the MVP (D2): skipped, or unavailable on an outage.
const CNB_NOTE=Object.freeze({
 skipped:'Oprávnění u ČNB automaticky neověřujeme. Poskytovatele ověřte ručně v seznamech ČNB.',
 unavailable:'Zdroj ČNB nebyl dostupný. Poskytovatele ověřte ručně v seznamech ČNB.'
});

function validEvaluation(e){
 if(!exactKeys(e,['schema','rulesVersion','findings','missing','actions','input'])||e.schema!==1||e.rulesVersion!==RULES_VERSION)fail();
 if(!Array.isArray(e.findings)||e.findings.length>Object.keys(INVESTMENT_RULES).length)fail();
 const seen=new Set();
 for(const f of e.findings){
  if(!exactKeys(f,['ruleId','severity','title','explanation','evidence'])||!Object.hasOwn(INVESTMENT_RULES,f.ruleId)||seen.has(f.ruleId))fail();
  seen.add(f.ruleId);
  const rule=INVESTMENT_RULES[f.ruleId];
  // Only a guaranteed return may be escalated (D3); no rule may be lowered.
  const severities=f.ruleId==='inv_guaranteed_return'?['attention','serious']:[rule.severity];
  if(!severities.includes(f.severity)||f.title!==rule.title||f.explanation!==rule.explanation)fail();
  if(!Array.isArray(f.evidence)||f.evidence.length>2||f.evidence.some(q=>typeof q!=='string'||!q.trim()||q.length>120))fail();
 }
 if(!Array.isArray(e.missing)||e.missing.some(m=>!exactKeys(m,['id','text'])||MISSING_INFO[m.id]!==m.text)||new Set(e.missing.map(m=>m.id)).size!==e.missing.length)fail();
 if(!e.missing.some(m=>m.id==='cnb_authorization'))fail(); // the ČNB gap is always stated
 const action=a=>plain(a)&&Object.hasOwn(INVESTMENT_ACTIONS,a.id)&&a.text===INVESTMENT_ACTIONS[a.id].text;
 if(!exactKeys(e.actions,['primary','secondary'])||!action(e.actions.primary)||!Array.isArray(e.actions.secondary)||!e.actions.secondary.every(action))fail();
 if(!plain(e.input)||!Number.isSafeInteger(e.input.chars)||e.input.chars<1)fail();
 return e;
}

export function fromInvestment(evaluation,{checkedAt=new Date().toISOString(),cnbStatus='skipped'}={}){
 validEvaluation(evaluation);
 if(!Object.hasOwn(CNB_NOTE,cnbStatus))fail();
 const facts=[],findings=[];
 for(const f of evaluation.findings){
  const rule=INVESTMENT_RULES[f.ruleId];
  // Quotes of the offer become labelled user_input facts ("uvedli jste vy, neověřeno").
  const evidence=f.evidence.map((quote,i)=>{const id=`quote_${f.ruleId}_${i+1}`;facts.push({id,label:OFFER_QUOTE_LABEL,value:quote,kind:'user_input',source:'user'});return id;});
  findings.push({id:f.ruleId,ruleId:f.ruleId,origin:'rules',severity:f.severity,title:rule.title,explanation:rule.explanation,evidence});
 }
 const actionText=a=>INVESTMENT_ACTIONS[a.id].text;
 // Both ČNB pages are always offered: the provider is never verified automatically (D2).
 const verifyLinks=['cnb_registry','cnb_warnings'].map(id=>INVESTMENT_ACTIONS[id].link).filter(l=>approvedLink(l.url)).map(l=>({label:l.label,url:l.url}));
 return createCheckResult({
  checker:'investment',facts,findings,
  sources:[
   {id:'investment_rules',label:'Pravidla pro investiční nabídky',status:'checked',checkedAt},
   {id:'cnb_registry',label:'Seznamy a upozornění ČNB',status:cnbStatus,note:CNB_NOTE[cnbStatus]}
  ],
  // Rules are primary; ČNB is not required so its gap is shown, never turned into green.
  policy:{primary:'investment_rules',required:[],canConfirmAbsence:false},
  actions:{primary:actionText(evaluation.actions.primary),secondary:evaluation.actions.secondary.map(actionText)},
  unknowns:evaluation.missing.map(m=>MISSING_INFO[m.id]),
  verifyLinks,checkedAt
 });
}
