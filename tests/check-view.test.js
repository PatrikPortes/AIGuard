import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderCombinedResult,renderCheckProgress} from '../public/check-view.js';
import {planCheck,createCombinedResult} from '../public/check-plan.js';
import {createCheckResult,HEADLINES} from '../public/verdict-model.js';
import {checkWebUrl} from '../public/web-checker.js';
const at='2026-10-14T12:00:00Z',opts={normalizeUrl:checkWebUrl};
class Node {
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this._text='';}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
 append(...nodes){this.children.push(...nodes);}prepend(...nodes){this.children.unshift(...nodes);}replaceChildren(...nodes){this._text='';this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;}focus(){this.ownerDocument.activeElement=this;}
}
function dom(){const doc={createElement(tag){return new Node(tag,doc);}};return new Node('div',doc);}
function all(root,fn){return [root,...root.children.flatMap(n=>all(n,fn))].filter(fn);}
function result(level='none_found',checker='firm'){
 return createCheckResult({checker,checkedAt:at,sources:[{id:'m',label:'ARES',status:level==='incomplete'?'unavailable':'checked',checkedAt:at}],policy:{primary:'m',required:[],canConfirmAbsence:level!=='not_assessable'},findings:['serious','attention'].includes(level)?[{id:'f',ruleId:checker==='firm'?'F01':'urgency',origin:'rules',severity:level,title:'Nález',explanation:'Ověřte údaje.',evidence:[]}]:[]});
}
function fixture(level='none_found'){
 const plan=planCheck({ico:'27082440'}),outcomes=[{stepId:'s1',status:'done',sourcesContacted:[],durationMs:0,result:result(level)}];return createCombinedResult({plan,outcomes,checkedAt:at});
}
test('all five aggregate headlines are unchanged and primary action is before detailed checks',()=>{
 for(const level of ['serious','attention','none_found','incomplete','not_assessable']){
  const c=dom(),data=fixture(level);renderCombinedResult(c,data);
  assert.equal(all(c,n=>n.className==='verdict-headline check-headline')[0].textContent.includes(HEADLINES[level]),true);
  const text=c.textContent;assert(text.indexOf('Co udělat teď')<text.indexOf('Co jsme prověřili'));assert(text.includes(data.aggregate.actions.primary));
  if(level==='none_found')assert.match(text,/nemůže zaručit/);assert.doesNotMatch(text,/\d\s*%|\/100/);
 }
});
test('completed check does not conceal unavailable sources or fabricate source contact metadata',()=>{
 const data=structuredClone(fixture('attention'));data.outcomes[0].result.sources.push({id:'dph',label:'Registr DPH',status:'unavailable',checkedAt:at});
 const c=dom();renderCombinedResult(c,data);assert.match(c.textContent,/Registr DPH — nedostupné, neověřeno/);assert.match(c.textContent,/Přesné kontakty se zdroji kontrola nevykázala/);
 assert.equal(all(c,n=>n.className==='check-step-symbol')[0].textContent,'⚪');
 const done=dom();renderCombinedResult(done,fixture('attention'));assert.equal(all(done,n=>n.className==='check-step-symbol')[0].textContent,'✓');
});
test('deadline, rate limit, failed controls and null actions remain visibly incomplete',()=>{
 for(const reason of ['deadline','rate_limited','budget','duplicate']){
  const plan=planCheck({ico:'27082440'}),data=createCombinedResult({plan,outcomes:[{stepId:'s1',status:'skipped',skipReason:reason,sourcesContacted:[],durationMs:5000,result:null}],checkedAt:at});
  const c=dom();renderCombinedResult(c,data);assert.match(c.textContent,/Přeskočeno/);assert.match(c.textContent,/Z dokončených kontrol nemáme/);assert(!c.textContent.includes('✓'));
 }
 const plan=planCheck({ico:'27082440'}),data=createCombinedResult({plan,outcomes:[{stepId:'s1',status:'failed',sourcesContacted:[],durationMs:0,result:null}],checkedAt:at});const c=dom();renderCombinedResult(c,data);assert.match(c.textContent,/Nedokončeno/);
});
test('untrusted fact and source labels render as literal text, never element content',()=>{
 const data=structuredClone(fixture());data.outcomes[0].result.facts.push({id:'u',kind:'user_input',source:'user',label:'Vstup',value:'<img src=x onerror=alert(1)>'});data.outcomes[0].result.sources[0].label='<script>alert(1)</script>';
 const c=dom();renderCombinedResult(c,data);assert.match(c.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(all(c,n=>n.tag==='script'||n.attrs.onerror).length,0);
});
test('loading status, focus, optional no-focus and native details provide accessible states',()=>{
 const c=dom();renderCheckProgress(c);assert.equal(c.attrs['aria-busy'],'true');assert.equal(c.children[0].attrs.role,'status');renderCombinedResult(c,fixture());assert.equal(c.attrs['aria-busy'],'false');assert.equal(c.ownerDocument.activeElement.tabIndex,-1);
 assert(all(c,n=>n.tag==='details').length>0);assert(all(c,n=>n.attrs.role==='status').length>0);
 const other=dom();renderCombinedResult(other,fixture(),{focus:false});assert.equal(other.ownerDocument.activeElement,undefined);
});
test('P5 attribution limitation and omitted ambiguous inputs are visible; each step shows source and reason',()=>{
 const plan=planCheck({text:'IČO: 27082440'},opts),outcomes=plan.steps.map(s=>({stepId:s.id,status:'done',sourcesContacted:['none'],durationMs:0,result:result('not_assessable',s.checker)}));
 const c=dom();renderCombinedResult(c,createCombinedResult({plan,outcomes,checkedAt:at},opts),opts);assert.match(c.textContent,/Neověřili jsme, že zprávu poslala tato firma/);
 assert.equal(all(c,n=>n.className==='check-step-reason').length,2);assert.equal(all(c,n=>n.className==='check-step-sources').length,2);
 const omitted=planCheck({text:'IČO: 27082440 IČO: 00006947'},opts),data=createCombinedResult({plan:omitted,outcomes:[{stepId:'s1',status:'done',sourcesContacted:['none'],durationMs:0,result:result('not_assessable','message')}],checkedAt:at},opts);renderCombinedResult(c,data,opts);assert.match(c.textContent,/Nejednoznačný údaj/);
});
test('validation happens before replacing DOM; no checker/network dependency or unsafe insertion',()=>{
 const c=dom();renderCheckProgress(c);const before=c.children[0];const bad=structuredClone(fixture());bad.aggregate.level='serious';assert.throws(()=>renderCombinedResult(c,bad));assert.equal(c.children[0],before);
 const source=readFileSync(new URL('../public/check-view.js',import.meta.url),'utf8');assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML|document\.write|\bfetch\b|XMLHttpRequest|WebSocket|from ['"][^'"]*(?:checker|runner)\.js/);
 const css=readFileSync(new URL('../public/verdict.css',import.meta.url),'utf8');assert.match(css,/\.check-step>summary.*min-height:48px/);assert.match(css,/overflow-wrap:anywhere/);
});


test('verified registry facts retain provenance/date and unverified user information remains distinct',()=>{
 const data=structuredClone(fixture());data.outcomes[0].result.facts.push({id:'ico',kind:'registry',source:'ARES',observedAt:at,label:'IČO v ARES',value:'27082440',sourceUrl:'https://ares.gov.cz/ekonomicke-subjekty?ico=27082440'});data.outcomes[0].result.unknowns.push('Vztah firmy a webu neověřujeme.');
 const c=dom();renderCombinedResult(c,data);assert.match(c.textContent,/Údaj z ARES .*stav k/);assert(c.textContent.includes(at));assert.match(c.textContent,/Vztah firmy a webu neověřujeme/);assert.match(c.textContent,/Podrobnosti kontroly/);
 const a=all(c,n=>n.tag==='a')[0];assert.equal(a.href,'https://ares.gov.cz/ekonomicke-subjekty?ico=27082440');assert.equal(a.rel,'noopener noreferrer');
});
