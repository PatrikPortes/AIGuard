import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {planCheck as rawPlanCheck,validateCheckPlan as rawValidateCheckPlan,validIco,PLANNER_VERSION,BUDGET,CHECKER_REGISTRY,PLANNER_RULES} from '../public/check-plan.js';
import {validateRegistryInput} from '../src/eshop-sources.js';
import {CHECKERS,createCheckResult} from '../public/verdict-model.js';

import {checkWebUrl} from '../public/web-checker.js';
const planCheck=(input,opts={})=>rawPlanCheck(input,{normalizeUrl:checkWebUrl,...opts});
const validateCheckPlan=(plan,opts={})=>rawValidateCheckPlan(plan,{normalizeUrl:checkWebUrl,...opts});
const client={runAt:'client'},ico='27082440',other='00006947';
// Committed reference sources, byte-identical to the given commit (verified by Git blob id),
// so these comparisons also run in git archive / Docker builds without .git.
function baselineSource(file,blobId){const bytes=readFileSync(new URL('../test-support/baselines/'+file,import.meta.url));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),blobId,file+' must equal the reference blob');return bytes.toString('utf8');}
const signature=p=>p.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary,s.runAt]);
const firmSteps=p=>p.steps.filter(s=>s.checker==='firm');
const webSteps=p=>p.steps.filter(s=>s.checker==='web');
function deepFrozen(x){if(x&&typeof x==='object'){assert(Object.isFrozen(x));Object.values(x).forEach(deepFrozen);}}

test('P1-P3 and specified user-field combinations have exact primary/required flags',()=>{
 assert.deepEqual(signature(planCheck({text:'  Běžná zpráva.  '})),[['message','P1',true,true,'server']]);
 assert.equal(planCheck({text:'  Běžná zpráva.  '}).input.text.chars,'Běžná zpráva.'.length);
 assert.deepEqual(signature(planCheck({ico})),[['firm','P3',true,true,'server']]);
 assert.deepEqual(signature(planCheck({url:'EXAMPLE.COM'},client)),[['web','P2',true,true,'client']]);
 assert.deepEqual(signature(planCheck({url:'https://example.com',ico},client)),[['web','P2',true,true,'client'],['firm','P3',true,false,'server']]);
 assert.deepEqual(signature(planCheck({text:'Zpráva',ico})),[['message','P1',true,true,'server'],['firm','P3',true,false,'server']]);
 assert.deepEqual(signature(planCheck({text:'Zpráva',url:'example.com'},client)),[['message','P1',true,false,'server'],['web','P2',true,true,'client']]);
});

test('P4 plans one/two links and P7 omits the third distinct host; no network checker is run',()=>{
 for(const n of [1,2,3]){
  const text=Array.from({length:n},(_,i)=>'https://host'+i+'.example/path').join(' '),p=planCheck({text});
  assert.equal(webSteps(p).length,Math.min(n,2));
  assert(webSteps(p).every(s=>s.reason.ruleId==='P4'&&s.trigger==='extracted_from_text'&&s.required&&!s.primary&&s.runAt==='server'));
  assert.equal(p.notPlanned.filter(s=>s.reason==='limit').length,n===3?1:0);
 }
 const p=planCheck({text:'www.example.com https://other.example/path'},client);
 assert(webSteps(p).every(s=>s.runAt==='client'));
 assert.deepEqual(webSteps(p).map(s=>s.input.ref),['https://other.example/path','https://www.example.com/']);
});

test('P5 only accepts exactly one distinct explicitly labelled, checksum-valid IČO within 12 chars',()=>{
 for(const label of ['IČO: ','IČ: ','IČ ','iČo ','IČO','IČO:       ','IČO:        ']){
  const p=planCheck({text:'Firma '+label+ico});assert.equal(firmSteps(p).length,1,label);
  assert.deepEqual(signature(p),[['message','P1',true,true,'server'],['firm','P5',false,false,'server']]);
 }
 for(const text of ['Číslo '+ico,'ICO: '+ico,'IČO: 27082441','IČO: 270824400','IČO: 27082440X','IČO:         '+ico,'IČO: '+ ' '.repeat(2000)+ico])assert.equal(firmSteps(planCheck({text})).length,0,text.slice(0,50));
 assert.equal(planCheck({text:'Neplatné IČO: 27082441'}).notPlanned[0].reason,'invalid');
 // Invalid numeric candidates are not a second valid economic-subject identity.
 assert.equal(firmSteps(planCheck({text:'IČO: '+ico+' IČO: 27082441'})).length,1);
});

test('P6 exact canonical URL/IČO duplicates collapse, explicit fields win',()=>{
 const p=planCheck({text:'https://EXAMPLE.com https://example.com/ IČO: '+ico+' IČ: '+ico,ico,url:'example.com'},client);
 assert.equal(webSteps(p).length,1);assert.equal(firmSteps(p).length,1);
 assert.equal(webSteps(p)[0].trigger,'user_field');assert.equal(firmSteps(p)[0].trigger,'user_field');assert(firmSteps(p)[0].required);
 assert(p.notPlanned.some(x=>x.kind==='url'&&x.reason==='duplicate'));
 assert(p.notPlanned.some(x=>x.kind==='ico'&&x.reason==='duplicate'));
 assert.equal(firmSteps(planCheck({text:'IČO: '+ico+' IČO: '+ico})).length,1);
 // P6 specifies URL equality, not inferred company/host relationships.
 assert.equal(webSteps(planCheck({text:'https://example.com/a https://example.com/b'})).length,2);
});

test('P7 ambiguous labelled IČO creates no inferred firm; explicit IČO remains an independent choice',()=>{
 const p=planCheck({text:'IČO: '+ico+' IČ: '+other});assert.equal(firmSteps(p).length,0);
 assert.deepEqual(p.notPlanned,[{kind:'ico',value:other,reason:'ambiguous'},{kind:'ico',value:ico,reason:'ambiguous'}]);
 const field=planCheck({ico,text:'IČO: '+ico+' IČO: '+other});assert.equal(firmSteps(field).length,1);assert.equal(firmSteps(field)[0].reason.ruleId,'P3');
 const conflict=planCheck({ico,text:'IČO: '+other});assert.equal(firmSteps(conflict).length,1);assert(conflict.notPlanned.some(n=>n.value===other&&n.reason==='limit'));
});

test('P7 fan-out reaches at most message + two web + one firm; stable user-field priority',()=>{
 const p=planCheck({text:'https://b.example https://a.example https://c.example IČO: '+ico,url:'https://z.example'},client);
 assert.deepEqual(p.steps.map(s=>s.id),['s1','s2','s3','s4']);
 assert.deepEqual(signature(p),[['message','P1',true,false,'server'],['web','P2',true,true,'client'],['web','P4',true,false,'client'],['firm','P5',false,false,'server']]);
 assert.equal(p.steps.length,4);assert.equal(p.notPlanned.filter(x=>x.reason==='limit').length,2);
 assert.equal(webSteps(p)[1].input.ref,'https://a.example/');
});

test('invalid input rejects unknown keys, null/types, checksum, bounds and server URL',()=>{
 for(const text of ['', '   ',null,12,{},'x'.repeat(20001),'x'.repeat(40000)])assert.throws(()=>planCheck({text}),/^Error: INVALID_TEXT$/);
 for(const value of ['27082441',' 27082440','２７０８２４４０',27082440,null,'../27082440'])assert.throws(()=>planCheck({ico:value}),/^Error: INVALID_ICO$/);
 assert.throws(()=>planCheck({url:'example.com'}),/^Error: URL_NOT_ALLOWED$/);
 for(const value of ['javascript:alert(1)','https://user:pass@example.com','https://example.com/%zz'])assert.throws(()=>planCheck({url:value},client),/^Error: INVALID_URL$/);
 assert.throws(()=>planCheck(),/^Error: EMPTY_INPUT$/);assert.throws(()=>planCheck({}),/^Error: EMPTY_INPUT$/);
 for(const value of [null,[],{text:'x',ai:true},{text:'x',result:{}},{text:'x',checker:'loan'}])assert.throws(()=>planCheck(value),/^Error: INVALID_INPUT$/);
 assert.throws(()=>planCheck({ico},{runAt:'remote'}),/^Error: INVALID_OPTIONS$/);
 assert.throws(()=>planCheck({ico},{runAt:'server',ai:true}),/^Error: INVALID_OPTIONS$/);
 assert.equal(planCheck({text:'x'.repeat(20000)}).input.text.chars,20000);
});

test('IČO validator matches existing registry checksum, without importing server code in the planner',()=>{
 for(let n=0;n<200;n++){
  const prefix=String(n*37019%10000000).padStart(7,'0');
  for(let d=0;d<10;d++){const candidate=prefix+d;let ok=true;try{validateRegistryInput({ico:candidate});}catch{ok=false;}assert.equal(validIco(candidate),ok,candidate);}
 }
 for(const x of [ico,other,'02032945','04147464'])assert(validIco(x));
});

test('deterministic 100 repeats, canonical sorted URL selection and stable order under permutations',()=>{
 const input=Object.freeze({text:'Zpráva https://z.example https://a.example IČO: '+ico});
 const before=JSON.stringify(input),expected=planCheck(input);
 for(let n=0;n<100;n++)assert.deepEqual(planCheck(input),expected);
 assert.equal(JSON.stringify(input),before);deepFrozen(expected);deepFrozen(BUDGET);deepFrozen(CHECKER_REGISTRY);
 const p=planCheck({text:'Zpráva https://a.example https://z.example IČO: '+ico});assert.deepEqual(p.steps,expected.steps);
 const a=planCheck({text:'https://c.example https://b.example https://a.example'}),b=planCheck({text:'https://a.example https://c.example https://b.example'});assert.deepEqual(a.steps,b.steps);
 assert.equal(PLANNER_VERSION,'p1');assert.deepEqual(PLANNER_RULES.map(r=>r.id),['P1','P2','P3','P4','P5','P6','P7']);
});

test('1000 seeded plans respect all budgets, validity, checker compatibility and one primary',()=>{
 let seed=32;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let n=0;n<1000;n++){
  const input={text:'Obsah '+Array.from({length:next()%8},()=>['https://a.example','https://b.example','www.c.example','https://c.example/a','IČO: '+ico,'IČ: '+other,'IČO: 27082441'][next()%7]).join(' ')};
  if(next()%2)input.ico=ico;const options=next()%2?client:{};if(options.runAt==='client'&&next()%2)input.url='https://a.example/';
  const p=planCheck(input,options);assert.equal(validateCheckPlan(p),p);assert(p.steps.length<=4);assert(webSteps(p).length<=2);assert(firmSteps(p).length<=1);assert(p.steps.filter(s=>s.checker==='message').length<=1);assert.equal(p.steps.filter(s=>s.primary).length,1);
  for(const s of p.steps)assert(CHECKERS.includes(s.checker));
 }
 // S3.1 does not modify the existing result schema or construct checker results.
 const result=createCheckResult({checker:'message',sources:[{id:'m',label:'Pravidla',status:'checked',checkedAt:'2026-10-14T12:00:00Z'}],policy:{primary:'m',required:[],canConfirmAbsence:false}});assert.equal(result.schema,1);assert.equal(result.level,'not_assessable');
});

test('plan stores text length only and contains no source text, checker result, AI or clock data',()=>{
 const secret='a73fef902e68451ba8c321cf9c28402db3e04f80',text='   Soukromá zpráva '+secret+'   ',p=planCheck({text});
 assert(!JSON.stringify(p).includes(secret.slice(0,20)));assert.deepEqual(p.input.text,{present:true,chars:text.trim().length});
 assert.deepEqual(Object.keys(p),['schema','planner','input','steps','notPlanned','budget']);assert(!('checkedAt' in p));assert(!('findings' in p));assert(!('aggregate' in p));
});

test('50-candidate extraction cap, invalid links and overlong candidates never become truncated URLs',()=>{
 const p=planCheck({text:Array.from({length:60},(_,i)=>'https://h'+i+'.example').join(' ')});
 assert.equal(p.input.extracted.urls.length,50);assert(p.input.extracted.ignored.some(x=>x.reason==='limit'));
 const tooLong='https://example.com/'+'a'.repeat(2048),invalid=planCheck({text:tooLong});assert.equal(webSteps(invalid).length,0);assert(invalid.notPlanned.some(x=>x.reason==='invalid'));
 const malformed=planCheck({text:'https://user:pass@example.com www.-bad.example https://example.com/%xx'});assert.equal(webSteps(malformed).length,0);
});

test('validateCheckPlan rejects extra fields and invalid IDs, provenance, primary, limits and references',()=>{
 const base=planCheck({text:'https://example.com IČO: '+ico});
 const mutate=change=>{const p=structuredClone(base);change(p);assert.throws(()=>validateCheckPlan(p),/^Error: INVALID_PLAN$/);};
 for(const change of [p=>p.extra=1,p=>p.input.text.raw='secret',p=>p.budget.maxSteps=5,p=>p.steps[0].id='s2',p=>p.steps[1].id='s1',p=>p.steps[0].checker='investment',p=>p.steps[0].primary=false,p=>p.steps[1].primary=true,p=>p.steps[0].reason.text='AI says safe',p=>p.steps[0].reason.ruleId='P8',p=>p.steps[2].required=true,p=>p.steps[1].input.ref='https://unknown.example/',p=>p.steps[0].runAt='client',p=>p.steps.push(structuredClone(p.steps[1])),p=>p.input.extracted.urls[0].host='other.example',p=>p.input.icoField='27082441',p=>p.notPlanned.push({kind:'ico',value:'raw secret',reason:'invalid'})])mutate(change);
 const getter=structuredClone(base);Object.defineProperty(getter,'extra',{get(){throw Error('must not execute getter');}});assert.throws(()=>validateCheckPlan(getter),/^Error: INVALID_PLAN$/);
});

test('planner performs no I/O, no AI, no execution; deterministic import and planning with forbidden fetch',()=>{
 const module=new URL('../public/check-plan.js',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',`let calls=0;globalThis.fetch=()=>{calls++;throw Error('network');};globalThis.document={getElementById(){throw Error('DOM access');}};const {planCheck}=await import(${JSON.stringify(module)});const p=planCheck({ico:'27082440'});if(calls||p.steps.length!==1)process.exit(1);`],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const source=readFileSync(new URL('../public/check-plan.js',import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,'');
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|document|process|setTimeout|setInterval)\s*[.(]|Date\.now|node:|src\//);
 assert.deepEqual([...source.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)].map(m=>m[1]),['./verdict-model.js']);
 assert.doesNotMatch(source,/\b(?:AI|LLM|OpenAI|analyze|firmClient)\s*[.(]/);
});

test('20k characters / 500 URL-IČO candidates stay below unchanged 20ms thread CPU after warmup',t=>{
 const unit='https://shop.example IČO: '+ico+' ',text=(unit.repeat(500)+'x'.repeat(20000)).slice(0,20000);
 assert.equal(text.length,20000);for(let n=0;n<5;n++)planCheck({text});
 const before=process.threadCpuUsage();const p=planCheck({text});const used=process.threadCpuUsage(before),cpuMs=(used.user+used.system)/1000;
 assert(cpuMs<20,'Planner thread CPU '+cpuMs+' ms, threshold 20 ms');assert.equal(p.steps.length,3);t.diagnostic('500 candidates: '+cpuMs+' ms thread CPU');
 const whitespace='IČO'+ ' '.repeat(19996)+'x';const start=process.threadCpuUsage();planCheck({text:whitespace});const elapsed=process.threadCpuUsage(start);assert((elapsed.user+elapsed.system)/1000<20);
});


test('S3.2a requires injected normalizer for text/URL, never for pure IČO',()=>{
 for(const input of [{text:'Zpráva'},{text:'https://example.com'}])assert.throws(()=>rawPlanCheck(input),/^Error: URL_NORMALIZER_REQUIRED$/);
 assert.throws(()=>rawPlanCheck({url:'example.com'},{runAt:'client'}),/^Error: URL_NORMALIZER_REQUIRED$/);
 const p=rawPlanCheck({ico});assert.equal(rawValidateCheckPlan(p),p);
 assert.throws(()=>rawValidateCheckPlan(planCheck({url:'example.com'},client)),/^Error: URL_NORMALIZER_REQUIRED$/);
 assert.throws(()=>rawValidateCheckPlan(planCheck({text:'https://example.com'})),/^Error: URL_NORMALIZER_REQUIRED$/);
});

test('injected normalizer keeps full original S3.1 plans byte-for-byte',()=>{
 // Run the committed original module with a redirected existing checker import.
 // 2dcf1ac64ee96af2792e37a80bbb0be2c8880798:public/check-plan.js
 const original={stdout:baselineSource('check-plan-2dcf1ac.js','ad8cc9d8d0c7fff0228171b6ee1615e89ae64439')};
 const moduleSource=original.stdout.replace("'./web-checker.js'",JSON.stringify(new URL('../public/web-checker.js',import.meta.url).href));
 const inputs=[{text:'Běžná zpráva'},{ico},{url:'EXAMPLE.COM'}, {text:'https://a.example https://b.example https://c.example IČO: '+ico}, {url:'example.com',ico,text:'https://example.com/ IČO: '+ico+' IČO: '+other}];
 const child=spawnSync(process.execPath,['--input-type=module','-e',`const {planCheck}=await import('data:text/javascript;base64,'+${JSON.stringify(Buffer.from(moduleSource).toString('base64'))});console.log(JSON.stringify(${JSON.stringify(inputs)}.map(input=>planCheck(input,{runAt:'client'}))));`],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 assert.deepEqual(inputs.map(input=>planCheck(input,client)),JSON.parse(child.stdout));
});

// S3.8: P4 ignores sentence punctuation after a link. Other rules are unchanged.
const linksOf=text=>webSteps(planCheck({text},client)).map(s=>s.input.ref);
test('P4 strips trailing . , ; ! ? after a link and plans the real address',()=>{
 for(const mark of ['.',',',';','!','?','...','?!',',.'])
  assert.deepEqual(linksOf('Platba na https://banka-priklad.invalid'+mark+' jinak účet zablokujeme'),['https://banka-priklad.invalid/'],JSON.stringify(mark));
 // The built-in "bank" example of the message page.
 const p=planCheck({text:'Vaše banka: ihned zadejte heslo a potvrzovací kód na https://banka-priklad.invalid, jinak bude účet zablokován.'},client);
 assert.deepEqual(webSteps(p).map(s=>s.input.ref),['https://banka-priklad.invalid/']);assert.deepEqual(p.notPlanned,[]);
 assert.deepEqual(linksOf('Navštivte www.priklad.example.'),['https://www.priklad.example/']);
 assert.deepEqual(linksOf('Konec věty https://priklad.example/'),['https://priklad.example/']);
});
test('P4 punctuation fix keeps query strings, percent-encoding and inner punctuation intact',()=>{
 assert.deepEqual(linksOf('Odkaz https://x.example/p?a=1&b=2.'),['https://x.example/p?a=1&b=2']);
 assert.deepEqual(linksOf('Odkaz https://x.example/p?q=a,b;c!d.e, prosím'),['https://x.example/p?q=a,b;c!d.e']);
 assert.deepEqual(linksOf('Soubor https://x.example/v1.2/file.pdf.'),['https://x.example/v1.2/file.pdf']);
 assert.deepEqual(linksOf('Kód https://x.example/a%2Cb%2E%3F?x=%21, hotovo'),['https://x.example/a%2Cb%2E%3F?x=%21']);
 assert.deepEqual(linksOf('Kotva https://x.example/a#sekce.1!'),['https://x.example/a#sekce.1']);
 // Unchanged without trailing punctuation (byte-for-byte as before).
 assert.deepEqual(linksOf('https://x.example/p?a=1&b=2 a www.y.example/z'),['https://www.y.example/z','https://x.example/p?a=1&b=2']);
});
test('P4 never strips into the prefix; duplicates after stripping are deduplicated (P6)',()=>{
 for(const text of ['Jen www., nic dál','Jen https://. nic','Jen http://?! nic']){
  const p=planCheck({text},client);
  assert.deepEqual(webSteps(p),[],text);assert.deepEqual(p.notPlanned,[{kind:'url',value:'',reason:'invalid'}],text);
 }
 const p=planCheck({text:'https://a.example, nebo https://a.example. nebo https://a.example'},client);
 assert.deepEqual(webSteps(p).map(s=>s.input.ref),['https://a.example/']);
 // notPlanned lists each distinct omission once (existing planner behaviour).
 assert.deepEqual(p.notPlanned,[{kind:'url',value:'https://a.example/',reason:'duplicate'}]);
});
test('P4 punctuation stripping stays linear on punctuation-heavy input',(t)=>{
 const unit='https://p.example/'+'.,;!?'.repeat(400)+' ',text=(unit.repeat(20)).slice(0,20000);
 for(let n=0;n<5;n++)planCheck({text});
 const before=process.threadCpuUsage();const p=planCheck({text});const used=process.threadCpuUsage(before),cpuMs=(used.user+used.system)/1000;
 assert(cpuMs<20,'Planner thread CPU '+cpuMs+' ms, threshold 20 ms');assert.deepEqual(webSteps(p).map(s=>s.input.ref),['https://p.example/']);
 t.diagnostic('punctuation-heavy: '+cpuMs+' ms thread CPU');
});
