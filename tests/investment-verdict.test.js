// Stage 4 S4.2: investment CheckResult (verdict-model extension + fromInvestment).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateInvestment,INVESTMENT_RULES,INVESTMENT_ACTIONS,MISSING_INFO} from '../public/investment-rules.js';
import {fromInvestment} from '../public/investment-verdict.js';
import {CHECKERS,RULE_CATALOG,HEADLINES,validateCheckResult,createCheckResult,limitationFor,OFFER_QUOTE_LABEL} from '../public/verdict-model.js';
import {planCheck,aggregate,validIco} from '../public/check-plan.js';
import {checkWebUrl} from '../public/web-checker.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {profile} from '../test-support/firm/profiles.js';

const checkedAt='2026-10-14T12:00:00.000Z',now=Date.parse(checkedAt);
const verdict=(text,opts={})=>fromInvestment(evaluateInvestment(text,opts.ico?{ico:opts.ico}:{}),{checkedAt,...opts.verdict});
const SERIOUS='Investice je zcela bez rizika.';
const ATTENTION='Nabídka platí jen dnes!';
const NONE='Podílový fond spravuje investiční společnost. Hodnota investice může klesat i stoupat. IČO 27082440.';

test('model: investment is an additional checker; existing checkers and catalogues are unchanged', () => {
 assert.deepEqual(CHECKERS,['message','loan','web','contract','firm','investment']);
 assert.deepEqual([...RULE_CATALOG.investment],Object.keys(INVESTMENT_RULES));
 assert.deepEqual(Object.keys(RULE_CATALOG),['message','loan','web','contract','firm','investment']);
 assert.equal(limitationFor('investment'),'To neznamená, že je investice bezpečná. Ověřili jsme jen zdroje uvedené níže.');
 for(const c of ['message','loan','web','firm'])assert.match(limitationFor(c),/^To neznamená, že je (zpráva|nabídka|web|firma) bezpečná\./);
});

test('serious signal → serious (L1), quoted and explained', () => {
 const r=verdict(SERIOUS);
 assert.equal(r.checker,'investment');assert.equal(r.level,'serious');assert.equal(r.headline,HEADLINES.serious);assert.equal(r.reasons[0].ruleId,'L1');
 const f=r.findings.find(f=>f.ruleId==='inv_no_risk');
 assert.deepEqual({id:f.id,origin:f.origin,severity:f.severity,title:f.title,explanation:f.explanation},
  {id:'inv_no_risk',origin:'rules',severity:'serious',title:INVESTMENT_RULES.inv_no_risk.title,explanation:INVESTMENT_RULES.inv_no_risk.explanation});
 assert.deepEqual(f.evidence,['quote_inv_no_risk_1']);
 assert.deepEqual(r.facts,[{id:'quote_inv_no_risk_1',label:OFFER_QUOTE_LABEL,value:'bez rizika',kind:'user_input',source:'user'}]);
});

test('weaker signal → attention (L4)', () => {
 const r=verdict(ATTENTION);
 assert.equal(r.level,'attention');assert.equal(r.reasons[0].ruleId,'L4');
 assert.deepEqual(r.findings.map(f=>[f.ruleId,f.severity]),[['inv_pressure','attention']]);
 assert.equal(r.actions.primary,INVESTMENT_ACTIONS.no_pressure.text);
});

test('no signal → not assessable (L5), never green; limitation and ČNB gap stay visible', () => {
 const r=verdict(NONE);
 assert.equal(r.level,'not_assessable');assert.equal(r.reasons[0].ruleId,'L5');assert.notEqual(r.level,'none_found');
 assert.deepEqual(r.findings,[]);assert.deepEqual(r.facts,[]);
 assert.deepEqual(r.sources.map(s=>[s.id,s.status]),[['investment_rules','checked'],['cnb_registry','skipped']]);
 assert(r.unknowns.includes(MISSING_INFO.cnb_authorization));
});

test('combination of rules: serious wins; escalated guaranteed return kept; every finding keeps its quotes', () => {
 const text='Garantovaný výnos 30 % ročně, bez rizika. Nabídka platí jen dnes. Pošlete ihned peníze na můj účet. Nainstalujte AnyDesk.';
 const e=evaluateInvestment(text),r=fromInvestment(e,{checkedAt});
 assert.equal(r.level,'serious');
 assert.deepEqual(r.findings.map(f=>[f.ruleId,f.severity]),e.findings.map(f=>[f.ruleId,f.severity]));
 assert.equal(r.findings.find(f=>f.ruleId==='inv_guaranteed_return').severity,'serious');
 for(const f of r.findings){
  const source=e.findings.find(x=>x.ruleId===f.ruleId);
  assert.deepEqual(f.evidence.map(id=>r.facts.find(x=>x.id===id).value),source.evidence,f.ruleId);
 }
 assert.equal(r.actions.primary,INVESTMENT_ACTIONS.no_access.text);
});

test('quotes may contain the scam claim (percentages) only as labelled investment quotes', () => {
 const r=verdict('Vyděláte 2 % denně.');
 assert.deepEqual(r.facts.map(f=>f.value),['2 % denně']);
 // The same text is still rejected as our own copy or in any other checker.
 const base={checker:'investment',sources:[{id:'investment_rules',label:'Pravidla',status:'checked',checkedAt},{id:'cnb_registry',label:'ČNB',status:'skipped'}],policy:{primary:'investment_rules',required:[],canConfirmAbsence:false},checkedAt};
 assert.throws(()=>createCheckResult({...base,facts:[{id:'quote_x_1',label:'Jiný popisek',value:'2 % denně',kind:'user_input',source:'user'}]}),/Invalid verdict text/);
 assert.throws(()=>createCheckResult({...base,facts:[{id:'note_1',label:OFFER_QUOTE_LABEL,value:'2 % denně',kind:'user_input',source:'user'}]}),/Invalid verdict text/);
 assert.throws(()=>createCheckResult({checker:'message',facts:[{id:'quote_x_1',label:OFFER_QUOTE_LABEL,value:'2 % denně',kind:'user_input',source:'user'}],sources:[{id:'message_rules',label:'Pravidla',status:'checked',checkedAt}],policy:{primary:'message_rules',required:[],canConfirmAbsence:false},checkedAt}),/Invalid verdict text/);
 for(const bad of ['x'.repeat(201),'a‮b','a\u0007b','  '])
  assert.throws(()=>createCheckResult({...base,facts:[{id:'quote_x_1',label:OFFER_QUOTE_LABEL,value:bad,kind:'user_input',source:'user'}]}),/Invalid offer quote/);
});

test('missing information and recommended steps are preserved from the S4.1 catalogue', () => {
 const e=evaluateInvestment('Garantovaný výnos, pošlete ihned peníze.'),r=fromInvestment(e,{checkedAt});
 assert.deepEqual(r.unknowns,e.missing.map(m=>m.text));
 assert(r.unknowns.includes(MISSING_INFO.provider_identity));
 assert(!verdict(NONE).unknowns.includes(MISSING_INFO.provider_identity),'IČO in text');
 assert(!verdict('Garantovaný výnos.',{ico:'27082440'}).unknowns.includes(MISSING_INFO.provider_identity),'IČO supplied');
 assert.equal(r.actions.primary,e.actions.primary.text);
 assert.deepEqual(r.actions.secondary,e.actions.secondary.slice(0,3).map(a=>a.text)); // schema 1 keeps max 3
 assert.deepEqual(r.verifyLinks,[INVESTMENT_ACTIONS.cnb_registry.link,INVESTMENT_ACTIONS.cnb_warnings.link].map(l=>({label:l.label,url:l.url})));
});

test('ČNB unavailable → still unverified; level is decided by the rules, never improved', () => {
 for(const [text,level] of [[NONE,'not_assessable'],[ATTENTION,'attention'],[SERIOUS,'serious']]){
  const r=verdict(text,{verdict:{cnbStatus:'unavailable'}});
  assert.equal(r.level,level);
  const cnb=r.sources.find(s=>s.id==='cnb_registry');assert.equal(cnb.status,'unavailable');assert.match(cnb.note,/ručně/);
 }
 assert.throws(()=>verdict(NONE,{verdict:{cnbStatus:'checked'}}),/INVALID_INVESTMENT_EVALUATION/);
});

test('invalid input is rejected (no re-analysis, no free text except quotes)', () => {
 const e=evaluateInvestment('Garantovaný výnos, bez rizika.');
 const clone=x=>structuredClone(x);
 const mutate=fn=>{const c=clone(e);fn(c);return c;};
 const bad=[null,{},'text',
  mutate(c=>{c.schema=2;}),mutate(c=>{c.rulesVersion='inv-0';}),mutate(c=>{c.extra=1;}),
  mutate(c=>{c.findings[0].ruleId='inv_unknown';}),
  mutate(c=>{c.findings.find(f=>f.ruleId==='inv_no_risk').severity='attention';}), // lowering a serious rule
  mutate(c=>{c.findings.find(f=>f.ruleId==='inv_no_risk').title='Bezpečná investice';}),
  mutate(c=>{c.findings[0].evidence=['x'.repeat(121)];}),mutate(c=>{c.findings[0].evidence=['a','b','c'];}),
  mutate(c=>{c.findings.push(clone(c.findings[0]));}),
  mutate(c=>{c.missing=c.missing.filter(m=>m.id!=='cnb_authorization');}),
  mutate(c=>{c.missing[0].text='Vše ověřeno.';}),
  mutate(c=>{c.actions.primary={id:'cnb_registry',text:'Investujte.'};}),
  mutate(c=>{c.input={chars:0};})];
 for(const b of bad)assert.throws(()=>fromInvestment(b,{checkedAt}),/INVALID_INVESTMENT_EVALUATION/,JSON.stringify(b)?.slice(0,80));
 assert.throws(()=>fromInvestment(e,{checkedAt:'včera'}),/Invalid CheckResult/);
});

test('model invariants: an investment result can never be green or hide the ČNB gap', () => {
 const r=verdict(NONE);
 assert.throws(()=>validateCheckResult({...r,level:'none_found',headline:HEADLINES.none_found}),/Investment cannot confirm absence/);
 assert.throws(()=>validateCheckResult({...r,sources:r.sources.filter(s=>s.id!=='cnb_registry')}),/ČNB verification must stay visible/);
 assert.throws(()=>validateCheckResult({...r,sources:r.sources.map(s=>s.id==='cnb_registry'?{...s,status:'checked',checkedAt}:s)}),/ČNB verification must stay visible/);
 assert.throws(()=>createCheckResult({checker:'investment',sources:[{id:'investment_rules',label:'Pravidla',status:'checked',checkedAt},{id:'cnb_registry',label:'ČNB',status:'skipped'}],policy:{primary:'investment_rules',required:[],canConfirmAbsence:true},checkedAt}),/Investment cannot confirm absence/);
 // A registry fact can only come from ARES/DPH/COI: no ČNB "verified" fact can be forged.
 assert.throws(()=>validateCheckResult({...r,facts:[{id:'cnb',label:'ČNB',value:'Registrováno',kind:'registry',source:'CNB',observedAt:checkedAt}]}),/Unverified registry fact/);
});

// Stage 3 aggregation (A1–A6) with an investment step. Planner support is S4.3, so the
// step is a P1-shaped step with checker 'investment' (aggregate validates CHECKERS only).
function steps(...checkers){
 const p=planCheck({text:'Dodavatel IČO: 27082440, web https://priklad.example/'},{runAt:'client',normalizeUrl:checkWebUrl});
 const base=p.steps.find(s=>s.checker==='message'),firm=p.steps.find(s=>s.checker==='firm'),web=p.steps.find(s=>s.checker==='web');
 return checkers.map((c,i)=>({...structuredClone(c==='investment'?base:c==='firm'?firm:web),id:'s'+(i+1),checker:c,primary:i===0}));
}
const done=(step,result)=>({stepId:step.id,status:'done',sourcesContacted:[],durationMs:1,result});
const failed=step=>({stepId:step.id,status:'failed',sourcesContacted:[],durationMs:1,result:null});
const firmOk=()=>{const p=profile();return fromFirm(p,evaluateFirm(p,{now}));};
const firmSerious=()=>{const p=profile({identity:{...profile().identity,dissolved:'2025-01-01'}});return fromFirm(p,evaluateFirm(p,{now}));};

test('aggregation A1–A6: conservative with investment; never a green combined result', () => {
 assert.equal(firmOk().level,'none_found','precondition: a clean firm alone may be green');
 const [i,f]=steps('investment','firm');
 const agg=(a,b)=>aggregate([i,f],[a,b]);
 // ARES existence never turns an unassessable investment green (A5).
 assert.deepEqual([agg(done(i,verdict(NONE)),done(f,firmOk())).level,agg(done(i,verdict(NONE)),done(f,firmOk())).reasons[0].ruleId],['not_assessable','A5']);
 assert.equal(agg(done(i,verdict(SERIOUS)),done(f,firmOk())).level,'serious');
 assert.equal(agg(done(i,verdict(ATTENTION)),done(f,firmOk())).level,'attention');
 assert.equal(agg(done(i,verdict(NONE)),done(f,firmSerious())).level,'serious');
 assert.equal(agg(failed(i),done(f,firmOk())).level,'incomplete');            // A2: primary investment step failed
 assert.equal(aggregate([i,{...f,required:true}],[done(i,verdict(NONE)),failed(f)]).level,'attention'); // A3: required (P3) firm step failed
 assert.equal(agg(done(i,verdict(NONE)),failed(f)).level,'not_assessable');   // optional (P5) firm failure does not worsen
 // Exhaustive: every investment outcome × every firm outcome → never none_found.
 const investments=[failed(i),...[NONE,ATTENTION,SERIOUS,'Vyděláte 2 % denně.'].map(t=>done(i,verdict(t))),done(i,verdict(NONE,{verdict:{cnbStatus:'unavailable'}}))];
 const firms=[failed(f),{...failed(f),status:'skipped',skipReason:'deadline'},done(f,firmOk()),done(f,firmSerious())];
 for(const a of investments)for(const b of firms)for(const required of [true,false]){
  const s=[i,{...f,required}];
  assert.notEqual(aggregate(s,[a,b]).level,'none_found');
 }
 const [w,inv]=steps('web','investment');
 assert.notEqual(aggregate([w,inv],[failed(w),done(inv,verdict(NONE))]).level,'none_found');
});

test('regression: existing checkers produce the same results and are untouched', () => {
 // Firm (green possible), web and message keep their behaviour after the CHECKERS extension.
 assert.equal(firmOk().level,'none_found');assert.equal(firmSerious().level,'serious');
 const src=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
 for(const f of ['check-plan.js','check-flow.js','check-view.js','verdict-adapters.js','firm-verdict.js','web-checker.js','eshop-checker.js','app.js'])
  assert.doesNotMatch(src(f),/investment-verdict|investment-rules/,f);
 assert(validIco('27082440'));
 // The adapter is pure: no network, DOM, storage, clock inside the conversion beyond the default checkedAt.
 const adapter=src('investment-verdict.js');
 assert.deepEqual([...adapter.matchAll(/^import[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]),['./verdict-model.js','./investment-rules.js']);
 assert.doesNotMatch(adapter,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.|innerHTML|Math\.random/);
});
