// Stage 4 S4.3: planner P8 (offer → investment step, browser only) and A5 with investment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planCheck as rawPlanCheck,validateCheckPlan,aggregate,createCombinedResult,validateCombinedResult,CHECKER_REGISTRY,PLANNER_RULES,BUDGET} from '../public/check-plan.js';
import {checkWebUrl} from '../public/web-checker.js';
import {evaluateInvestment} from '../public/investment-rules.js';
import {fromInvestment} from '../public/investment-verdict.js';
import {fromFirm} from '../public/firm-verdict.js';
import {fromWeb} from '../public/verdict-adapters.js';
import {coiResult} from '../public/eshop-checker.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {createCheckRunner} from '../src/check-runner.js';
import {profile} from '../test-support/firm/profiles.js';

const client={runAt:'client',normalizeUrl:checkWebUrl};
const plan=(input,opts=client)=>rawPlanCheck(input,opts);
const sig=p=>p.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary,s.runAt]);
const checkedAt='2026-10-14T12:00:00.000Z',now=Date.parse(checkedAt);
const SAFE='Podílový fond spravuje investiční společnost. Hodnota investice může klesat i stoupat.';
const SERIOUS='Investice je zcela bez rizika, pošlete ihned peníze na můj účet.';
const investmentResult=(offer,opts)=>fromInvestment(evaluateInvestment(offer),{checkedAt,...opts});
const firmOk=()=>{const p=profile();return fromFirm(p,evaluateFirm(p,{now}));};
const done=(step,result)=>({stepId:step.id,status:'done',sourcesContacted:[],durationMs:1,result});
const failed=step=>({stepId:step.id,status:'failed',sourcesContacted:[],durationMs:1,result:null});
const combined=(p,outcomes)=>createCombinedResult({plan:p,outcomes,checkedAt},{normalizeUrl:checkWebUrl});

test('P8 registry entry, reason and rule id are additive', () => {
 assert.deepEqual(CHECKER_REGISTRY.investment,{entityKinds:['investment_offer'],runAt:'client',requiredDefault:true});
 assert.deepEqual(PLANNER_RULES.map(r=>r.id),['P1','P2','P3','P4','P5','P6','P7','P8','P9']);
});

test('offer without IČO: one required, primary, browser-only investment step; no raw text in the plan', () => {
 const p=plan({offer:'  '+SAFE+'  '});
 assert.deepEqual(sig(p),[['investment','P8',true,true,'client']]);
 assert.deepEqual(p.steps[0].input,{kind:'text',ref:'offer'});
 assert.equal(p.steps[0].reason.text,'Vložili jste text investiční nabídky.');
 assert.deepEqual(p.input.offer,{present:true,chars:SAFE.length});assert.equal(p.input.text,null);
 assert.equal(JSON.stringify(p).includes('Podílový fond'),false);
 assert.equal(validateCheckPlan(p,{normalizeUrl:checkWebUrl}),p);
});

test('offer with IČO: field → required P3 (not primary); labelled IČO in the offer → optional P5', () => {
 assert.deepEqual(sig(plan({offer:SAFE,ico:'27082440'})),[['investment','P8',true,true,'client'],['firm','P3',true,false,'server']]);
 assert.deepEqual(sig(plan({offer:SAFE+' Poskytovatel IČO: 27082440.'})),[['investment','P8',true,true,'client'],['firm','P5',false,false,'server']]);
 // Field and the same IČO in the text → one firm step (P6), field wins.
 const p=plan({offer:SAFE+' IČO 27082440',ico:'27082440'});
 assert.deepEqual(sig(p),[['investment','P8',true,true,'client'],['firm','P3',true,false,'server']]);
 assert.deepEqual(p.notPlanned,[{kind:'ico',value:'27082440',reason:'duplicate'}]);
 // Two labelled IČO → ambiguous, no firm step.
 assert.deepEqual(plan({offer:'IČO 27082440 a IČO 00006947'}).notPlanned.map(n=>n.reason),['ambiguous','ambiguous']);
});

test('offer with links: P4 web steps run in the browser; trailing punctuation handled as in S3.8', () => {
 const p=plan({offer:'Registrujte se na https://crypto-profit.example/start, vklad v USDT.'});
 assert.deepEqual(sig(p),[['investment','P8',true,true,'client'],['web','P4',true,false,'client']]);
 assert.equal(p.steps[1].input.ref,'https://crypto-profit.example/start');
});

test('offer with more links and IČO: limits hold (≤4 steps, ≤2 web, ≤1 firm), investment is never dropped, omissions are listed', () => {
 const p=plan({offer:'https://a.example/ https://b.example/ https://c.example/ https://d.example/ IČO: 27082440',url:'https://e.example/'});
 assert(p.steps.length<=BUDGET.maxSteps);
 assert.equal(p.steps.filter(s=>s.checker==='web').length,2);
 assert.equal(p.steps[0].checker,'investment');
 assert.equal(p.steps.find(s=>s.checker==='investment').primary,false,'URL field is primary (P2)');
 assert.equal(p.steps.filter(s=>s.primary).length,1);
 assert(p.notPlanned.filter(n=>n.reason==='limit').length>=3,'skipped links/IČO are visible as not planned');
 // Property: random offers never exceed limits and always keep the investment step.
 let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
 const bits=['https://x'+'.example/','www.y.example','IČO: 27082440','IČ 00006947','výnos 2 % denně','https://z.example/a,','text'];
 for(let i=0;i<500;i++){
  const offer=Array.from({length:1+rnd(8)},()=>bits[rnd(bits.length)]+rnd(9)).join(' ');
  const q=plan({offer,...(rnd(3)?{}:{ico:'27082440'}),...(rnd(4)?{}:{url:'https://field.example/'})});
  const count=c=>q.steps.filter(s=>s.checker===c).length;
  assert(q.steps.length<=4&&count('web')<=2&&count('firm')<=1&&count('investment')===1&&count('message')===0);
 }
});

test('security: the offer is browser-only and never a server/API input', () => {
 assert.throws(()=>plan({offer:SAFE},{runAt:'server',normalizeUrl:checkWebUrl}),/OFFER_NOT_ALLOWED/);
 assert.throws(()=>plan({offer:SAFE},{normalizeUrl:checkWebUrl}),/OFFER_NOT_ALLOWED/); // default runAt is server
 assert.throws(()=>plan({offer:SAFE,text:'Zpráva'}),/INVALID_INPUT/);
 assert.throws(()=>rawPlanCheck({offer:SAFE},{runAt:'client'}),/URL_NORMALIZER_REQUIRED/);
 for(const bad of [42,'','   ','x'.repeat(20001)])assert.throws(()=>plan({offer:bad}),/INVALID_OFFER/);
 // /api/check runner accepts only {text, ico}; an offer (or URL) is rejected before planning.
 const runner=createCheckRunner({firmClient:{profile:async()=>{throw Error('no');}},firmRequests:{enter:()=>()=>{}},firmLimiter:{check(){}},firmSessionLimiter:{check(){}}});
 for(const input of [{offer:SAFE},{url:'https://a.example/'},{text:'x',offer:SAFE}])assert.throws(()=>runner.prepare(input),/INVALID_INPUT/);
 // A server-runner plan can never contain an investment step.
 assert(!runner.prepare({text:'Zpráva IČO 27082440'}).plan.steps.some(s=>s.checker==='investment'));
});

test('plan validation rejects tampered investment steps', () => {
 const p=structuredClone(plan({offer:SAFE,ico:'27082440'}));
 const v=x=>validateCheckPlan(x,{normalizeUrl:checkWebUrl});
 const mutate=fn=>{const c=structuredClone(p);fn(c);return c;};
 for(const bad of [mutate(c=>{c.steps[0].runAt='server';}),mutate(c=>{c.steps[0].required=false;}),mutate(c=>{c.steps[0].primary=false;}),
  mutate(c=>{c.steps[0].input.ref='text';}),mutate(c=>{c.steps[1].primary=true;}),mutate(c=>{delete c.input.offer;}),
  mutate(c=>{c.input.text={present:true,chars:5};}),mutate(c=>{c.steps.shift();c.steps[0].id='s1';c.steps[0].primary=true;}),
  mutate(c=>{c.steps.push({...c.steps[0],id:'s3'});})])
  assert.throws(()=>v(bad),/INVALID_PLAN/);
 // Message plans cannot carry an investment step.
 const m=structuredClone(plan({text:'Zpráva'}));m.steps.push({...structuredClone(p.steps[0]),id:'s2',primary:false});
 assert.throws(()=>v(m),/INVALID_PLAN/);
});

test('aggregation: no-risk offer is never green (also with a clean firm); serious offer → serious', () => {
 const p=plan({offer:SAFE,ico:'27082440'});
 const quiet=combined(p,[done(p.steps[0],investmentResult(SAFE)),done(p.steps[1],firmOk())]);
 assert.equal(firmOk().level,'none_found');
 assert.deepEqual([quiet.aggregate.level,quiet.aggregate.reasons[0].ruleId],['not_assessable','A5']);
 const red=combined(p,[done(p.steps[0],investmentResult(SERIOUS)),done(p.steps[1],firmOk())]);
 assert.deepEqual([red.aggregate.level,red.aggregate.reasons[0].ruleId,red.aggregate.reasons[0].stepId],['serious','A1','s1']);
 assert.equal(red.aggregate.actions.primary,investmentResult(SERIOUS).actions.primary);
 validateCombinedResult(quiet,{normalizeUrl:checkWebUrl});
});

test('A5 covers investment on its own: even a hypothetical all-unknown completed set stays not assessable', () => {
 const p=plan({offer:SAFE});
 const r=combined(p,[done(p.steps[0],investmentResult(SAFE))]);
 assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['not_assessable','A5']);
 // The A5 checker list itself includes investment (defence in depth beside the model invariant).
 assert.match(aggregate.toString(),/\['message','web','investment','loan'\]\.includes\(r\.step\.checker\)/);
});

test('failed investment step never looks like a completed check', () => {
 const p=plan({offer:SAFE,ico:'27082440'});
 const r=combined(p,[failed(p.steps[0]),done(p.steps[1],firmOk())]);
 assert.deepEqual([r.aggregate.level,r.aggregate.reasons[0].ruleId],['incomplete','A2']);
 const skipped=combined(p,[{...failed(p.steps[0]),status:'skipped',skipReason:'deadline'},done(p.steps[1],firmOk())]);
 assert.equal(skipped.aggregate.level,'incomplete');
 // With a URL field the investment step is required but not primary → A3, never green.
 const q=plan({offer:SAFE,url:'https://shop.example/'});
 const web=q.steps.find(s=>s.checker==='web'),inv=q.steps.find(s=>s.checker==='investment');
 assert.deepEqual([web.primary,inv.primary,inv.required],[true,false,true]);
 const url=checkWebUrl('https://shop.example/');
 const webResult=fromWeb(url,coiResult(url.hostname,null,now),undefined,{checkedAt});
 const out=q.steps.map(s=>s===web?done(s,webResult):failed(s));
 const a=combined(q,out).aggregate;
 assert.deepEqual([a.level,a.reasons[0].ruleId,a.reasons[0].stepId],['attention','A3',inv.id]);
});

test('ČNB not verified is never a successful check: visible in the result and blocks green', () => {
 const p=plan({offer:SAFE});
 for(const cnbStatus of ['skipped','unavailable']){
  const r=combined(p,[done(p.steps[0],investmentResult(SAFE,{cnbStatus}))]);
  const cnb=r.outcomes[0].result.sources.find(s=>s.id==='cnb_registry');
  assert.equal(cnb.status,cnbStatus);assert.notEqual(r.aggregate.level,'none_found');
 }
 // A forged "green" investment result cannot enter a combined result.
 const forged={...investmentResult(SAFE),level:'none_found',headline:'Nenašli jsme výrazné varovné signály'};
 assert.throws(()=>combined(p,[done(p.steps[0],forged)]),/Investment cannot confirm absence|INVALID/);
});

// Regression fingerprint of plans and aggregates for 300 seeded inputs without `offer`,
// computed with the pre-S4.3 modules (commit 3c7420d). Any change to P1–P7 or A1–A6
// behaviour for existing inputs changes this hash.
const PRE_S43_FINGERPRINT='d695a2b8653749ca9a6ff6f50d28e8f6f31d390866490041aec51c43543e136e';
test('regression: P1–P7 plans and A1–A6 aggregates without offer are byte-identical to 3c7420d', () => {
 let seed=20261014;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
 const parts=['Zpráva','https://a.example/x','www.b.example','https://c.example/?q=1,','IČO: 27082440','IČ 00006947','IČO 27082441','http://d.example.','text bez ničeho','https://a.example/x'];
 const out=[];
 for(let i=0;i<300;i++){
  const n=1+rnd(5),text=Array.from({length:n},()=>parts[rnd(parts.length)]).join(' ');
  const input={...(rnd(4)?{text}:{}),...(rnd(3)===0?{ico:['27082440','00006947'][rnd(2)]}:{}),...(rnd(4)===0?{url:['example.com','https://shop.example/a'][rnd(2)]}:{})};
  if(!Object.keys(input).length)input.text=text;
  for(const runAt of ['client','server']){
   try{const p=rawPlanCheck(input,{runAt,normalizeUrl:checkWebUrl});out.push(p);
    const statuses=['failed','skipped'];
    out.push(aggregate(p.steps,p.steps.map((s,k)=>({stepId:s.id,status:statuses[(i+k)%2],...((i+k)%2?{skipReason:'deadline'}:{}),sourcesContacted:[],durationMs:0,result:null}))));
   }catch(e){out.push('ERR:'+e.message);}
  }
 }
 assert.equal(createHash('sha256').update(JSON.stringify(out)).digest('hex'),PRE_S43_FINGERPRINT);
 // And no plan without an offer carries the new key or step.
 for(const input of [{text:'Zpráva https://a.example/ IČO 27082440'},{ico:'27082440'}])
  {const p=rawPlanCheck(input,{normalizeUrl:checkWebUrl});assert.equal('offer' in p.input,false);assert(!p.steps.some(s=>s.checker==='investment'));}
});
