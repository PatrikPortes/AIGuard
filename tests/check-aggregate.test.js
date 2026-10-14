import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,createCombinedResult,validateCombinedResult,planCheck} from '../public/check-plan.js';
import {createCheckResult,validateCheckResult,HEADLINES,isSafeCopy} from '../public/verdict-model.js';
import {spawnSync} from 'node:child_process';
import {checkWebUrl} from '../public/web-checker.js';
const at='2026-10-14T12:00:00.000Z',opts={normalizeUrl:checkWebUrl};
function result(level,checker='firm',action='Před platbou ověřte aktuální stav.'){
 const findings=['serious','attention'].includes(level)?[{id:'signal',ruleId:checker==='firm'?'F01':'risk_high',origin:'rules',severity:level,title:'Varovný signál',explanation:'Ověřte uvedené údaje.',evidence:[]}]:[];
 return createCheckResult({checker,findings,checkedAt:at,sources:[{id:'main',label:'Kontrola',status:level==='incomplete'?'unavailable':'checked',checkedAt:at}],policy:{primary:'main',required:[],canConfirmAbsence:level!=='not_assessable'},actions:{primary:action,secondary:[]}});
}
function outcome(step,level='none_found',status='done'){
 return {stepId:step.id,status,...(status==='skipped'?{skipReason:'deadline'}:{}),sourcesContacted:status==='done'?['ARES']:[],durationMs:1,result:status==='done'?result(level,step.checker):null};
}
const step=(i,required=true,primary=i===0)=>({id:'s'+(i+1),checker:'firm',input:{kind:'ico',ref:'27082440'},trigger:'user_field',reason:{ruleId:'P3',text:'Vložili jste IČO firmy.'},required,primary,runAt:'server'});
function expected(steps,outcomes){
 const pairs=steps.map(s=>[s,outcomes.find(o=>o.stepId===s.id)]),done=pairs.filter(([,o])=>o.status==='done');
 if(done.some(([,o])=>o.result.level==='serious'))return ['serious','A1'];
 if(pairs.some(([s,o])=>s.primary&&(o.status!=='done'||o.result.level==='incomplete')))return ['incomplete','A2'];
 if(pairs.some(([s,o])=>s.required&&(o.status!=='done'||o.result.level==='incomplete')))return ['attention','A3'];
 if(done.some(([,o])=>o.result.level==='attention'))return ['attention','A4'];
 if(done.some(([,o])=>['not_assessable','incomplete'].includes(o.result.level))||steps.some(s=>['message','web'].includes(s.checker)))return ['not_assessable','A5'];
 return ['none_found','A6'];
}

test('A1–A6 exhaustive generated truth table: 1–4 steps, levels, statuses, required and each primary',t=>{
 const choices=[];
 for(const required of [true,false]){
  for(const level of ['serious','incomplete','attention','not_assessable','none_found'])choices.push({required,status:'done',level});
  for(const status of ['failed','skipped'])choices.push({required,status,level:null});
 }
 const cached=Object.fromEntries(['serious','incomplete','attention','not_assessable','none_found'].map(l=>[l,result(l)]));
 let cases=0;
 function run(config){
  for(let primary=0;primary<config.length;primary++){
   const steps=config.map((v,i)=>step(i,v.required,i===primary));
   const outcomes=config.map((v,i)=>({...outcome(steps[i],'none_found',v.status),result:v.status==='done'?cached[v.level]:null}));
   const a=aggregate(steps,outcomes);assert.deepEqual([a.level,a.reasons[0].ruleId],expected(steps,outcomes));
   if(a.level==='none_found')assert(steps.every((s,i)=>!s.required||outcomes[i].status==='done'&&outcomes[i].result.level==='none_found'));
   if(a.reasons[0].ruleId!=='A6')assert(steps.some(s=>s.id===a.reasons[0].stepId));
   cases++;
  }
 }
 function generate(n,prefix=[]){if(!n)return run(prefix);for(const c of choices)generate(n-1,[...prefix,c]);}
 for(let n=1;n<=4;n++)generate(n);
 t.diagnostic(cases+' exhaustive combinations');
});

test('A1 trusted red wins over primary failure, other findings and AI; AI alone cannot be red',()=>{
 const steps=[step(0),step(1)];
 const red=outcome(steps[1],'serious'),failed=outcome(steps[0],null,'failed');
 assert.equal(aggregate(steps,[failed,red]).level,'serious');
 const ai=createCheckResult({checker:'firm',checkedAt:at,sources:[{id:'main',label:'ARES',status:'checked',checkedAt:at}],policy:{primary:'main',required:[],canConfirmAbsence:true},findings:[{id:'ai',ruleId:'F09',origin:'ai',severity:'serious',title:'Podnět k ověření',explanation:'Ověřte údaje.',evidence:[]}]});
 assert.equal(ai.level,'attention');
 assert.equal(aggregate([steps[0]],[{...outcome(steps[0]),result:ai}]).level,'attention');
 assert.equal(aggregate(steps,[{...outcome(steps[0]),result:ai},red]).level,'serious');
 const forged=structuredClone(ai);forged.level='serious';forged.headline=HEADLINES.serious;forged.findings[0].severity='serious';
 assert.throws(()=>aggregate([steps[0]],[{...outcome(steps[0]),result:forged}]));
});

test('A2/A3 failed and skipped required checks prevent green; A3 lists every failed required step',()=>{
 const steps=[step(0),step(1),step(2)];
 for(const status of ['failed','skipped'])assert.equal(aggregate([steps[0]],[outcome(steps[0],null,status)]).level,'incomplete');
 const a=aggregate(steps,[outcome(steps[0]),outcome(steps[1],null,'failed'),outcome(steps[2],null,'skipped')]);
 assert.equal(a.level,'attention');assert.deepEqual(a.reasons.map(r=>r.stepId),['s2','s3']);assert(a.reasons.every(r=>r.ruleId==='A3'));
});

test('optional failed/skipped do not worsen verdict; optional completed incomplete does not fabricate A6',()=>{
 const steps=[step(0),step(1,false)];
 for(const status of ['failed','skipped'])assert.equal(aggregate(steps,[outcome(steps[0]),outcome(steps[1],null,status)]).level,'none_found');
 assert.equal(aggregate(steps,[outcome(steps[0]),outcome(steps[1],'incomplete')]).level,'not_assessable');
});

test('message/web in any combination never green; A6 registered absence has mandatory limitation',()=>{
 for(const checker of ['message','web']){
  const s={...step(0),checker},a=aggregate([s],[outcome(s)]);
  assert.equal(a.level,'not_assessable');assert.equal(a.reasons[0].ruleId,'A5');
 }
 const p=planCheck({ico:'27082440'}),a=aggregate(p.steps,[outcome(p.steps[0])]);
 assert.equal(a.level,'none_found');assert.match(a.reasons[0].text,/nemůže zaručit/);assert(isSafeCopy(a.reasons[0].text));assert.doesNotMatch(JSON.stringify(a),/\d\s*%|\/100|risk_score/);
});

test('actions are inherited, severity-ranked, stable on outcome reordering and deduplicated to three',()=>{
 const steps=[step(0),step(1),step(2),step(3)],levels=['none_found','attention','serious','serious'];
 const outcomes=steps.map((s,i)=>({...outcome(s,levels[i]),result:result(levels[i],'firm','Ověřte údaj '+String.fromCharCode(65+i)+'.')}));
 outcomes[2].result.actions.secondary=['Ověřte další údaj.','Ověřte údaj C.','Ověřte účet.'];
 const expected=aggregate(steps,outcomes);assert.equal(expected.actions.primary,'Ověřte údaj C.');assert.deepEqual(expected.actions.secondary,['Ověřte údaj D.','Ověřte údaj B.','Ověřte údaj A.']);assert(!expected.actions.secondary.includes(expected.actions.primary));
 for(let i=0;i<100;i++)assert.deepEqual(aggregate(steps,[...outcomes].reverse()),expected);
 assert(Object.isFrozen(expected));assert(Object.isFrozen(expected.actions.secondary));
 const missing=aggregate([steps[0]],[outcome(steps[0],null,'failed')]);assert.deepEqual(missing.actions,{primary:null,secondary:[]});
});

test('CombinedResult validates real four-step plans, provenance, no text and immutable output',()=>{
 const text='Soukromé ujednání QWERTYuiop https://a.example https://b.example IČO: 27082440';
 const plan=planCheck({text},opts),outcomes=plan.steps.map(s=>outcome(s,s.checker==='firm'?'none_found':'not_assessable'));
 const combined=createCombinedResult({plan,outcomes,checkedAt:at},opts);
 assert.equal(validateCombinedResult(combined,opts),combined);assert.equal(combined.aggregate.level,'not_assessable');assert(!JSON.stringify(combined).includes('QWERTYuiop'));
 for(const o of combined.outcomes){assert.equal(validateCheckResult(o.result),o.result);assert(Object.isFrozen(o.result));}
 assert(!Object.isFrozen(outcomes));
});

test('wrapper rejects forged aggregate, raw fields, unknown statuses, mismatches, duplicates and unsafe copy',()=>{
 const plan=planCheck({ico:'27082440'}),base=createCombinedResult({plan,outcomes:[outcome(plan.steps[0])],checkedAt:at});
 for(const change of [
  c=>c.raw='private',c=>c.aggregate.score=100,c=>c.aggregate.level='serious',c=>c.aggregate.reasons[0].text='Je to bezpečné.',
  c=>c.aggregate.actions.primary='Firma je důvěryhodná.',c=>c.checkedAt='bad',c=>c.outcomes[0].raw='private',
  c=>c.outcomes[0].status='unknown',c=>c.outcomes[0].durationMs=-1,c=>c.outcomes[0].sourcesContacted=['OTHER'],
  c=>c.outcomes[0].sourcesContacted=['none','ARES'],c=>c.outcomes[0].result.checker='web',c=>c.outcomes.push(c.outcomes[0]),
  c=>c.outcomes[0].result.actions.raw='private',c=>c.outcomes[0].result.sources[0].raw='private',
  c=>c.outcomes[0].result.sources[0].status='unavailable',c=>c.outcomes[0].result=null,
  c=>c.outcomes[0].skipReason='deadline',c=>c.outcomes[0].stepId='s4',c=>c.aggregate.reasons[0].stepId='s4'
 ]){const c=structuredClone(base);change(c);assert.throws(()=>validateCombinedResult(c));}
 const failed=outcome(plan.steps[0],null,'failed');failed.result=result('none_found');assert.throws(()=>aggregate(plan.steps,[failed]));
 const skipped=outcome(plan.steps[0],null,'skipped');delete skipped.skipReason;assert.throws(()=>aggregate(plan.steps,[skipped]));
});


test('shared aggregate imports and runs without DOM, network, AI or implicit clock',()=>{
 const plan=planCheck({ico:'27082440'}),module=new URL('../public/check-plan.js',import.meta.url).href;
 const payload={plan,outcomes:[outcome(plan.steps[0])],checkedAt:at};
 const child=spawnSync(process.execPath,['--input-type=module','-e',`globalThis.document={getElementById(){throw Error('DOM');}};globalThis.fetch=()=>{throw Error('network');};Date.now=()=>{throw Error('implicit clock');};const m=await import(${JSON.stringify(module)});const r=m.createCombinedResult(${JSON.stringify(payload)});if(r.aggregate.level!=='none_found')process.exit(1);`],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
});

test('AI attention cannot be forged into a green completed CheckResult',()=>{
 const s=step(0),r=result('attention');r.findings[0].origin='ai';r.level='none_found';r.headline=HEADLINES.none_found;
 assert.throws(()=>aggregate([s],[{...outcome(s),result:r}]));
});
