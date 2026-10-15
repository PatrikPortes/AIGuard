// Stage 8: result sharing (S8.2/S8.3) and static Věrka moods (S8.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHARE_TYPES,SHARE_CATEGORIES,SHARE_LABEL,buildShare,shareCategory,shareResult,createShareControl} from '../public/share-result.js';
import {guideFor} from '../public/verdict-view.js';
import {renderCombinedResult,renderCheckProgress} from '../public/check-view.js';
import {runMessageCheck,runInvestmentCheck} from '../public/check-flow.js';
import {planCheck,createCombinedResult} from '../public/check-plan.js';
import {createCheckResult,isSafeCopy} from '../public/verdict-model.js';
import {evaluateInvestment} from '../public/investment-rules.js';
import {fromInvestment} from '../public/investment-verdict.js';
import {checkWebUrl} from '../public/web-checker.js';
import {coiResult} from '../public/eshop-checker.js';
import {fromFirm} from '../public/firm-verdict.js';
import {evaluateFirm} from '../src/firm-rules.js';
import {analyze} from '../src/analysis.js';
import {profile} from '../test-support/firm/profiles.js';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const TYPES=['message','loan','contract','web','firm','investment'],CATS=['serious','attention','none_found','incomplete','neutral'];
const LEVELS=['serious','attention','none_found','incomplete','not_assessable'];
const at='2026-10-14T12:00:00Z',now=Date.parse(at);

test('30 type × category texts: fixed, safe, conservative, canonical link without query or fragment', () => {
 assert.deepEqual(Object.keys(SHARE_TYPES),TYPES);assert.deepEqual(Object.keys(SHARE_CATEGORIES),CATS);
 assert.equal(SHARE_LABEL,'Poslat výsledek blízkému');assert.equal(buildShare.length,2,'only two enum arguments');
 for(const type of TYPES)for(const category of CATS){
  const s=buildShare(type,category);
  assert.equal(s.url,'https://verimtomu.fyi'+SHARE_TYPES[type].path);assert.doesNotMatch(s.url,/[?#]/);
  assert(s.title.startsWith('Věřím tomu? – '));
  for(const part of [s.title,s.text])assert(isSafeCopy(part),part);
  // No score, percentage or number in the shared prose; the only digits allowed are none.
  assert.doesNotMatch(s.title+' '+s.text,/\d|%|skóre|bezpečn[áé] je|je bezpečn|ověřeno|vše je v pořádku/iu);
  assert(s.text.endsWith(SHARE_TYPES[type].note));
  assert.equal(s.full,s.title+'\n\n'+s.text+'\n\nVlastní kontrolu si můžete udělat na '+s.url);
  if(category==='none_found')assert.match(s.text,/To neznamená, že je vše v pořádku\. Kontrola nemůže zaručit bezpečnost\./);
  if(category==='incomplete')assert.match(s.text,/Chybějící ověření neberte jako dobrou zprávu\./);
  if(category==='neutral')assert.doesNotMatch(s.text,/závažné|pozornost|nenašli|nepodařilo/,'neutral has no risk category');
 }
 for(const t of ['loan','investment'])assert.match(buildShare(t,'none_found').text,/ČNB jsme automaticky neověřili/);
 assert.match(buildShare('contract','attention').text,/nenahrazuje právní posouzení/);
 for(const [t,c] of [['x','serious'],['message','safe'],['__proto__','serious'],['message','toString'],[undefined,undefined]])assert.throws(()=>buildShare(t,c),/INVALID_SHARE/);
});

test('verdict level → share category (conservative; not_assessable is incomplete)', () => {
 assert.deepEqual(LEVELS.map(shareCategory),['serious','attention','none_found','incomplete','incomplete']);
 for(const bad of ['neutral','ok','safe','constructor',undefined])assert.throws(()=>shareCategory(bad),/INVALID_SHARE_LEVEL/);
});

function nav({share,clipboard}={}){
 const calls=[];
 return {calls,nav:{...(share?{share:async d=>{calls.push(['share',d]);return share(d);}}:{}),...(clipboard?{clipboard:{writeText:async t=>{calls.push(['copy',t]);return clipboard(t);}}}:{})}};
}
test('native share → clipboard → manual; a cancelled native share is final', async () => {
 let n=nav({share:()=>undefined,clipboard:()=>undefined});
 assert.equal((await shareResult('web','attention',{nav:n.nav})).outcome,'shared');
 assert.deepEqual(n.calls.map(c=>c[0]),['share']);assert.deepEqual(Object.keys(n.calls[0][1]),['title','text','url']);
 n=nav({share:()=>{throw Object.assign(Error('x'),{name:'AbortError'});},clipboard:()=>undefined});
 assert.equal((await shareResult('web','attention',{nav:n.nav})).outcome,'cancelled');assert.deepEqual(n.calls.map(c=>c[0]),['share']);
 n=nav({share:()=>{throw Object.assign(Error('x'),{name:'NotAllowedError'});},clipboard:()=>undefined});
 assert.equal((await shareResult('web','attention',{nav:n.nav})).outcome,'copied');assert.deepEqual(n.calls.map(c=>c[0]),['share','copy']);
 assert.equal(n.calls[1][1],buildShare('web','attention').full);
 n=nav({clipboard:()=>{throw Error('denied');}});
 const manual=await shareResult('firm','none_found',{nav:n.nav});assert.equal(manual.outcome,'manual');assert.equal(manual.data.full,buildShare('firm','none_found').full);
 assert.equal((await shareResult('firm','none_found',{nav:{}})).outcome,'manual');
 assert.equal((await shareResult('firm','none_found',{nav:undefined})).outcome,'manual');
});

// Minimal DOM with events (no browser needed).
class Node{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this._text='';this.listeners={};this.hidden=false;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
 append(...n){this.children.push(...n);}prepend(...n){this.children.unshift(...n);}replaceChildren(...n){this._text='';this.children=n;}
 setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.listeners[k]=f;}focus(){this.ownerDocument.activeElement=this;}select(){this.selected=true;}querySelector(){return null;}
}
const dom=navigator=>{const doc={defaultView:{navigator},createElement(tag){return new Node(tag,doc);}};return new Node('div',doc);};
const all=(root,fn)=>[root,...root.children.flatMap(n=>all(n,fn))].filter(fn);

test('share control: button, status, manual fallback with focus; only for a final result', async () => {
 const n=nav({}),c=dom(n.nav),control=createShareControl(c.ownerDocument,'investment','attention');
 const button=all(control,x=>x.tag==='button')[0],manual=all(control,x=>x.tag==='textarea')[0],status=all(control,x=>x.attrs.role==='status')[0];
 assert.equal(button.textContent,SHARE_LABEL);assert.equal(button.type,'button');assert.equal(manual.readOnly,true);assert.equal(manual.hidden,true);assert.equal(manual.name,undefined);
 assert.equal(status.attrs['aria-live'],'polite');
 await button.listeners.click();
 assert.equal(manual.hidden,false);assert.equal(manual.value,buildShare('investment','attention').full);assert.equal(c.ownerDocument.activeElement,manual);assert.equal(manual.selected,true);
 assert.match(status.textContent,/Text označte a zkopírujte/);
 for(const s of [all(control,x=>x.className==='share-hint')[0].textContent])assert(isSafeCopy(s));
 // Progress never carries the control; the combined result only with the page's share option.
 const p=dom();renderCheckProgress(p);assert.equal(all(p,x=>x.className==='share-result').length,0);
 const plan=planCheck({ico:'27082440'}),r=createCombinedResult({plan,outcomes:[{stepId:'s1',status:'failed',sourcesContacted:[],durationMs:0,result:null}],checkedAt:at});
 const plain=dom();renderCombinedResult(plain,r);assert.equal(all(plain,x=>x.className==='share-result').length,0);
 const shared=dom();renderCombinedResult(shared,r,{share:'firm'});const roots=all(shared,x=>x.className==='share-result');
 assert.equal(roots.length,1);assert.deepEqual([roots[0].dataset.shareType,roots[0].dataset.shareCategory],['firm','incomplete']);
});

test('no leak: real runs with sensitive inputs share only the fixed text', async () => {
 const SENTINELS=['Jan Novák','777123456','+420777123456','tajne-heslo-42','platba.example','27082440','CZ27082440','#ico=','jan.novak@example.cz'];
 const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});
 const fetchImpl=async u=>u==='/api/session'?json({ok:true}):json(fromFirm(profile(),evaluateFirm(profile(),{now})));
 const text='Dobrý den, Jan Novák (jan.novak@example.cz, +420777123456) žádá platbu na https://platba.example/x?k=tajne-heslo-42. Dodavatel IČO: 27082440, DIČ CZ27082440.';
 const deps={checkWebUrl,coiResult,coiData:null,fetchImpl,clock:()=>now};
 const results=[['message',await runMessageCheck({text,analysis:await analyze({type:'text',content:text}),analysisMs:1},deps)],
  ['investment',await runInvestmentCheck({offer:'Garantovaný výnos 30 % měsíčně, Jan Novák +420777123456, https://platba.example/x, IČO 27082440.',ico:'27082440'},{evaluateInvestment,fromInvestment,...deps})]];
 for(const [type,r] of results){
  const n=nav({share:()=>undefined}),c=dom(n.nav);renderCombinedResult(c,r,{normalizeUrl:checkWebUrl,share:type});
  const root=all(c,x=>x.className==='share-result')[0];await all(root,x=>x.tag==='button')[0].listeners.click();
  const payload=JSON.stringify(n.calls);assert.equal(n.calls.length,1);
  for(const s of SENTINELS)assert(!payload.includes(s),type+' leaked '+s);
  assert.deepEqual(n.calls[0][1],(({title,text,url})=>({title,text,url}))(buildShare(type,shareCategory(r.aggregate.level))));
 }
});

test('S8.4 static moods: existing assets only, never a success pose, applied by level', () => {
 const expected={serious:'verka-warning',attention:'verka-explaining',none_found:'verka-thinking',incomplete:'verka-thinking',not_assessable:'verka-thinking'};
 for(const level of LEVELS){const g=guideFor(level);assert.equal(g.name,expected[level]);assert.doesNotMatch(g.name+g.alt,/success|v pořádku|bezpečn/);assert.equal(g.width,72);assert(g.height>50&&g.height<80);}
 assert.throws(()=>guideFor('safe'),/INVALID_GUIDE_LEVEL/);
 const clean=fromFirm(profile(),evaluateFirm(profile(),{now})),dissolved=fromFirm(profile({identity:{...profile().identity,dissolved:'2025-01-01'}}),evaluateFirm(profile({identity:{...profile().identity,dissolved:'2025-01-01'}}),{now}));
 const plan=planCheck({ico:'27082440'});
 for(const [outcome,level] of [[{status:'done',result:clean},'none_found'],[{status:'done',result:dissolved},'serious'],[{status:'failed',result:null},'incomplete']]){
  const r=createCombinedResult({plan,outcomes:[{stepId:'s1',sourcesContacted:[],durationMs:0,...outcome}],checkedAt:at});assert.equal(r.aggregate.level,level);
  const c=dom();renderCombinedResult(c,r);const img=all(c,x=>x.className==='verdict-guide')[0];
  assert.equal(img.dataset.mood,guideFor(level).name);assert.equal(img.alt,guideFor(level).alt);
 }
 for(const f of ['public/check-view.js','public/verdict-view.js'])assert.doesNotMatch(read(f),/verka-success|robo-success/);
});

test('boundaries: no network, storage, cookies or tracking; static styles; one static route; no new API', () => {
 const src=read('public/share-result.js');
 assert.doesNotMatch(src,/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|location|innerHTML|insertAdjacentHTML|eval\(|new Function|import\(/);
 const css=read('public/verdict.css'),from=css.indexOf('/* Stage 8: share control'),share=css.slice(css.indexOf('*/',from)+2);
 assert(share.length>50);assert.doesNotMatch(share,/animation|transition|@keyframes/);
 const server=read('src/server.js');assert.match(server,/\['\/share-result\.js',\['share-result\.js','text\/javascript; charset=utf-8'\]\]/);
 const apis=[...new Set(server.match(/'\/api\/[a-z-]+'/g))].sort();
 assert.deepEqual(apis,["'/api/analyze'","'/api/analyze-contract'","'/api/check'","'/api/contract-status'","'/api/eshop-operator'","'/api/firm'","'/api/firm-search'","'/api/health'","'/api/session'"]);
});

test('image sharing refuses untrusted supplied files; cancellation remains final',async()=>{
 const file={name:'verimtomu-firm-attention.png',type:'image/png'};let payload,copied=0;
 const nav={canShare:({files})=>files[0]===file,share:async d=>{payload=d;},clipboard:{writeText:async()=>copied++}};
 assert.equal((await shareResult('firm','attention',{nav,file})).outcome,'shared');assert.equal(payload.files,undefined);assert.equal(payload.url,buildShare('firm','attention').url);assert.equal(copied,0);
 nav.share=async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});};assert.equal((await shareResult('firm','attention',{nav,file})).outcome,'cancelled');assert.equal(copied,0);
 nav.canShare=()=>false;nav.share=async d=>{payload=d;};await shareResult('firm','attention',{nav,file});assert.equal(payload.files,undefined);
});

test('optional image caption has bounded plain text and never changes canonical text/link sharing',async()=>{
 const {normalizeShareCaption}=await import('../public/share-result.js');assert.equal(normalizeShareCaption('  Nájemní\n smlouva\u202e  '),'Nájemní smlouva');assert.equal(Array.from(normalizeShareCaption('a'.repeat(100))).length,64);assert.throws(()=>normalizeShareCaption({name:'secret'}));assert(!buildShare('firm','attention').full.includes('Ukázková firma'));
});
