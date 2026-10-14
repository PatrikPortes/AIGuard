// Stage 5 S5.4: Zpráva ↔ Web/Firma (optional IČO on the message page, firm follow-up link,
// #ico= prefill on /proverit-firmu, navigation back to the message check).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runMessageCheck,planMessageCheck} from '../public/check-flow.js';
import {planCheck,validateCombinedResult,createCombinedResult} from '../public/check-plan.js';
import {renderCombinedResult,FIRM_DETAIL_LABEL,firmDetailHref} from '../public/check-view.js';
import {createCheckResult} from '../public/verdict-model.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {analyze} from '../src/analysis.js';
import {profile} from '../test-support/firm/profiles.js';

const ICO='27082440',OTHER='00006947',now=Date.parse('2026-10-14T12:00:00Z'),at='2026-10-14T12:00:00Z';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const firmResult=(p=profile())=>fromFirm(p,evaluateFirm(p,{now}));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const sig=p=>p.steps.map(s=>[s.checker,s.reason.ruleId,s.required,s.primary]);
function fake(firm=()=>json(firmResult())){
 const calls=[];
 return {calls,fetchImpl:async(input,init={})=>{calls.push({url:String(input),body:init.body??null});
  if(input==='/api/session')return json({ok:true});if(input==='/api/firm')return firm(init);throw Error('unexpected request '+input);}};
}
async function run(text,{ico,firm}={}){
 const f=fake(firm);
 const r=await runMessageCheck({text,ico,analysis:await analyze({type:'text',content:text}),analysisMs:50},{checkWebUrl,coiResult,coiData:null,fetchImpl:f.fetchImpl,clock:()=>now});
 validateCombinedResult(r,{normalizeUrl:checkWebUrl});
 return {r,calls:f.calls};
}
const MSG='Dobrý den, zaplaťte prosím dnes fakturu za služby, jinak bude účet zablokován. Tajné číslo 4242.';

test('without the IČO field the message plan is unchanged (byte-identical)', () => {
 for(const text of [MSG,MSG+' IČO 27082440.',MSG+' IČO 27082440, IČ 00006947.',MSG+' https://platba.example/x']){
  const a=JSON.stringify(planMessageCheck(text,{checkWebUrl})),b=JSON.stringify(planCheck({text},{runAt:'client',normalizeUrl:checkWebUrl}));
  assert.equal(a,b);assert.equal(JSON.stringify(planMessageCheck(text,{checkWebUrl,ico:''})),b);
 }
});

test('IČO field → P3 (required, not primary); IČO in text and several IČO handled by existing rules', () => {
 assert.deepEqual(sig(planMessageCheck(MSG,{checkWebUrl,ico:ICO})),[['message','P1',true,true],['firm','P3',true,false]]);
 const same=planMessageCheck(MSG+' IČO 27082440.',{checkWebUrl,ico:ICO});
 assert.deepEqual(sig(same),[['message','P1',true,true],['firm','P3',true,false]]);assert.deepEqual(same.notPlanned,[{kind:'ico',value:ICO,reason:'duplicate'}]);
 const other=planMessageCheck(MSG+' IČO 00006947.',{checkWebUrl,ico:ICO});
 assert.deepEqual(sig(other),[['message','P1',true,true],['firm','P3',true,false]]);assert.deepEqual(other.notPlanned,[{kind:'ico',value:OTHER,reason:'limit'}]);
 const many=planMessageCheck(MSG+' IČO 27082440, IČ 00006947.',{checkWebUrl});
 assert.deepEqual(sig(many),[['message','P1',true,true]]);assert.deepEqual(many.notPlanned.map(n=>n.reason),['ambiguous','ambiguous']);
 const manyField=planMessageCheck(MSG+' IČO 27082440, IČ 00006947.',{checkWebUrl,ico:'25596641'});
 assert.deepEqual(sig(manyField),[['message','P1',true,true],['firm','P3',true,false]]);
 const text=planMessageCheck(MSG+' IČO 27082440.',{checkWebUrl});assert.deepEqual(sig(text),[['message','P1',true,true],['firm','P5',false,false]]);
 for(const bad of ['27082441','1234567','abcdefgh',27082440])assert.throws(()=>planMessageCheck(MSG,{checkWebUrl,ico:bad}),/INVALID_ICO/);
});

test('message + IČO: one session + exactly one /api/firm {"ico"}; the message text is never sent', async () => {
 const {r,calls}=await run(MSG+' IČO 27082440.',{ico:ICO});
 assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/firm']);assert.equal(calls[1].body,'{"ico":"27082440"}');
 assert(!calls.some(c=>/zaplaťte|Tajné|4242/.test(c.url+' '+(c.body||''))));
 assert.deepEqual(r.outcomes.map(o=>o.status),['done','done']);
 // Many IČO in the text plus the field: still one firm request, for the field.
 const many=await run(MSG+' IČO 00006947, IČ 25596641.',{ico:ICO});
 assert.deepEqual(many.calls.filter(c=>c.url==='/api/firm').map(c=>c.body),['{"ico":"27082440"}']);
 // No field, no IČO in the text: no request at all.
 assert.equal((await run(MSG)).calls.length,0);
});

test('message page firm result keeps its meaning: clean firm stays as before, risky firm wins, outage is attention', async () => {
 const clean=await run(MSG,{ico:ICO});assert.equal(clean.r.outcomes[1].result.level,'none_found');
 const dissolved=()=>json(firmResult(profile({identity:{...profile().identity,dissolved:'2025-01-01'}})));
 assert.equal((await run(MSG,{ico:ICO,firm:dissolved})).r.aggregate.level,'serious');
 const down=await run(MSG,{ico:ICO,firm:()=>json({code:'X'},503)});assert.notEqual(down.r.aggregate.level,'none_found');
});

// Minimal DOM for check-view (same approach as tests/check-view.test.js).
class Node{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this._text='';}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
 append(...n){this.children.push(...n);}prepend(...n){this.children.unshift(...n);}replaceChildren(...n){this._text='';this.children=n;}
 setAttribute(k,v){this.attrs[k]=v;}focus(){this.ownerDocument.activeElement=this;}querySelector(){return null;}
}
const dom=()=>{const doc={createElement(tag){return new Node(tag,doc);}};return new Node('div',doc);};
const all=(root,fn)=>[root,...root.children.flatMap(n=>all(n,fn))].filter(fn);
const res=checker=>createCheckResult({checker,checkedAt:at,sources:[{id:'m',label:'ARES',status:'checked',checkedAt:at}],policy:{primary:'m',required:[],canConfirmAbsence:checker==='firm'},findings:[],facts:[],unknowns:[]});

test('"Prověřit firmu podrobně": one link per firm step, only the IČO in the fragment', () => {
 assert.equal(FIRM_DETAIL_LABEL,'Prověřit firmu podrobně');assert.equal(firmDetailHref(ICO),'/proverit-firmu#ico=27082440');
 const plan=planCheck({ico:ICO}),c=dom();
 renderCombinedResult(c,createCombinedResult({plan,outcomes:[{stepId:'s1',status:'done',sourcesContacted:['ARES'],durationMs:0,result:res('firm')}],checkedAt:at}),{normalizeUrl:checkWebUrl});
 const links=all(c,n=>n.tag==='a');assert.equal(links.length,1);
 assert.equal(links[0].href,'/proverit-firmu#ico=27082440');assert.equal(links[0].textContent,'Prověřit firmu podrobně');
 assert.doesNotMatch(links[0].href,/\?|text|zprav/);
 // A failed firm step still offers the detailed page (the user decides).
 const failed=dom();renderCombinedResult(failed,createCombinedResult({plan,outcomes:[{stepId:'s1',status:'failed',sourcesContacted:[],durationMs:0,result:null}],checkedAt:at}),{normalizeUrl:checkWebUrl});
 assert.equal(all(failed,n=>n.tag==='a').length,1);
 // No firm step → no link.
 const web=planCheck({url:'https://obchod.example/'},{runAt:'client',normalizeUrl:checkWebUrl}),w=dom();
 renderCombinedResult(w,createCombinedResult({plan:web,outcomes:[{stepId:'s1',status:'done',sourcesContacted:[],durationMs:0,result:res('web')}],checkedAt:at},{normalizeUrl:checkWebUrl}),{normalizeUrl:checkWebUrl});
 assert.equal(all(w,n=>n.tag==='a').length,0);
});

test('/proverit-firmu#ico=: prefill only a valid IČO, no automatic request, fragment removed', () => {
 const firm=read('firm.js');
 const block=firm.slice(firm.indexOf('// S5.4'));
 assert.match(block,/\/\^#ico=\(\\d\{8\}\)\$\//);assert.match(block,/valid\(m\[1\]\)/);
 assert.match(block,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/);
 assert.doesNotMatch(block,/fetch|requestSubmit|submit\(|dispatchEvent|click\(/,'prefill never starts the check');
 assert.equal([...firm.matchAll(/fetch\(/g)].length,2,'only the existing submit handler requests /api/session and /api/firm');
});

test('pages: message IČO field, context links, navigation; no new endpoint, no message text in links', () => {
 const msg=read('message.html');
 assert.match(msg,/<label for="message-ico">IČO firmy \(nepovinné\)<\/label>\s*<input id="message-ico" type="text" inputmode="numeric" pattern="\[0-9\]\{8\}" maxlength="8" autocomplete="off" spellcheck="false" aria-describedby="message-ico-help">/);
 assert.doesNotMatch(msg.match(/<input id="message-ico"[^>]*>/)[0],/\sname=/);
 assert.match(msg,/<form id="analysis-form" method="post" action="\/api\/analyze">/,'CR-08: form stays POST');
 const ctx='<p class="context-link"><a href="/overit-zpravu">Máte podezřelou zprávu? Prověřte také její obsah.</a></p>';
 for(const f of ['web.html','firm.html'])assert.equal(read(f).split(ctx).length-1,1,f+' context link');
 assert.match(read('firm.html'),/<nav class="flow-navigation" aria-label="Výběr kontroly"><a href="\/">← Zpět na úvod<\/a><a href="\/overit-zpravu">Prověřit zprávu<\/a><a href="\/proverit-web">Prověřit web<\/a><\/nav>/);
 assert.match(read('web.html'),/<a href="\/overit-zpravu">Prověřit zprávu<\/a>/,'web navigation kept');
 const app=read('app.js');
 assert.match(app,/const icoInput = document\.querySelector\('#loan-ico'\) \|\| document\.querySelector\('#message-ico'\);/);
 assert.match(app,/INVALID_FIRM_ICO: \{ kind: 'input', title: 'IČO firmy není platné\.', message: 'IČO musí mít 8 číslic a platný kontrolní součet\. Nic jsme neodeslali\.' \}/);
 for(const f of ['check-view.js','firm.js','app.js'])assert.doesNotMatch(read(f),/proverit-firmu\?|#text=|#url=|#zprava=/);
});
