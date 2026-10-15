// Stage 8 browser QA: "Poslat výsledek blízkému" and static Věrka moods on the real pages.
// Only the firm registry source is a synthetic fixture (no network). Share/clipboard are stubbed per page.
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/stage8-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
import {buildShare} from '../public/share-result.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const firmSources={profile:async({ico})=>{const b=profile();return {...b,query:{ico},identity:{...b.identity,ico}};},search:async()=>{throw Error('unused');}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
const SENTINELS=['Jan Novák','777123456','tajne-heslo-42','platba.example','27082440','jan.novak@example.cz'];
let scenarios=0;
// mode: native | cancel | error-then-copy | copy | manual
function stub(mode){
 return `(()=>{const log=window.__shareLog=[];
  const share=async d=>{log.push(['share',JSON.parse(JSON.stringify(d))]);if('${mode}'==='cancel')throw new DOMException('x','AbortError');if('${mode}'==='error-then-copy')throw new DOMException('x','NotAllowedError');};
  const clip={writeText:async t=>{log.push(['copy',t]);if('${mode}'==='manual')throw new DOMException('denied','NotAllowedError');}};
  if(['native','cancel','error-then-copy'].includes('${mode}'))Object.defineProperty(Navigator.prototype,'share',{value:share,configurable:true});
  else delete Navigator.prototype.share;
  Object.defineProperty(Navigator.prototype,'clipboard',{get:()=>clip,configurable:true});})();`;
}
async function open(width,path,{mode='native',ready,reducedMotion='no-preference'}={}){
 const context=await browser.newContext({viewport:{width,height:800},reducedMotion});
 await context.addInitScript(stub(mode));
 const page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
 await page.goto(base+path,{waitUntil:'networkidle'});if(ready)await page.locator(ready).waitFor({timeout:8000});
 requests.length=0;return {context,page,requests,errors};
}
const log=page=>page.evaluate(()=>window.__shareLog);
const done=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:12000});
async function clickShare(page,scope,requests){
 const before=requests.length;const b=page.locator(scope+' .share-button');
 assert.equal(await b.innerText(),'Poslat výsledek blízkému');await b.click();
 await page.locator(scope+' .share-status').filter({hasText:/./}).waitFor({timeout:5000});
 assert.equal(requests.length,before,'sharing makes no network request');
 return page.locator(scope+' .share-status').innerText();
}
const noLeak=entries=>{const s=JSON.stringify(entries);for(const x of SENTINELS)assert(!s.includes(x),'leaked '+x);};
async function layout(page,width){
 const m=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('.share-button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<48).length,
  outside:[...document.querySelectorAll('.share-result,.share-result *')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+0.5).length}));
 assert.equal(m.scroll,width);assert.equal(m.small,0,'share button ≥ 48 px');assert.equal(m.outside,0);
}
try{
 for(const width of [320,375,430,1280]){
  // 1) Web: combined result → native share with the fixed payload only (URL and IČO never shared).
  {const {context,page,requests,errors}=await open(width,'/proverit-web');
   await page.locator('#web-url').fill('https://platba.example/x?k=tajne-heslo-42');await page.locator('#web-ico').fill('27082440');
   await page.locator('#web-form button[type=submit]').click();await done(page);
   const level=await page.locator('#check-combined .check-lead').getAttribute('data-level');
   const cat=await page.locator('#check-combined .share-result').getAttribute('data-share-category');
   assert.equal(cat,{serious:'serious',attention:'attention',none_found:'none_found',incomplete:'incomplete',not_assessable:'incomplete'}[level]);
   assert.equal(await clickShare(page,'#check-combined',requests),'Výsledek je připravený ke sdílení.');
   const l=await log(page);assert.equal(l.length,1);const {full,...expected}=buildShare('web',cat);assert.deepEqual(l[0],['share',expected]);noLeak(l);
   await layout(page,width);assert.deepEqual(errors,[]);await context.close();scenarios++;}
  // 2) Firm page: share in the follow-up, never nested; clean firm → verka-thinking, never a success pose.
  {const {context,page,requests}=await open(width,'/proverit-firmu',{mode:'copy'});
   await page.locator('#firm-ico').fill('27082440');await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible'});
   assert.equal(await page.locator('#firm-result .share-result').count(),0);assert.equal(await page.locator('#firm-followup .share-result').count(),1);
   assert.equal(await page.locator('#firm-result .verdict-guide').getAttribute('data-mood'),'verka-thinking');
   assert.match(await clickShare(page,'#firm-followup',requests),/Text je zkopírovaný/);
   const l=await log(page);assert.deepEqual(l,[['copy',buildShare('firm','none_found').full]]);noLeak(l);
   await layout(page,width);await context.close();scenarios++;}
 }
 // 3) Native share cancelled: status only, no clipboard fallback.
 {const {context,page,requests}=await open(375,'/proverit-firmu',{mode:'cancel'});
  await page.locator('#firm-ico').fill('27082440');await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible'});
  assert.equal(await clickShare(page,'#firm-followup',requests),'Sdílení bylo zrušeno.');assert.deepEqual((await log(page)).map(x=>x[0]),['share']);
  assert.equal(await page.locator('#firm-followup .share-manual').isHidden(),true);await context.close();scenarios++;}
 // 4) Native share error → clipboard fallback.
 {const {context,page,requests}=await open(375,'/proverit-firmu',{mode:'error-then-copy'});
  await page.locator('#firm-ico').fill('27082440');await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible'});
  assert.match(await clickShare(page,'#firm-followup',requests),/zkopírovaný/);assert.deepEqual((await log(page)).map(x=>x[0]),['share','copy']);await context.close();scenarios++;}
 // 5) No share, clipboard denied → manual: visible, focused, selected, read-only; keyboard activation (Enter).
 {const {context,page,requests}=await open(320,'/proverit-firmu',{mode:'manual'});
  await page.locator('#firm-ico').fill('27082440');await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible'});
  await page.locator('#firm-followup .share-button:not([disabled])').waitFor();
  const before=requests.length;await page.locator('#firm-followup .share-button').focus();await page.keyboard.press('Enter');
  await page.locator('#firm-followup .share-manual').waitFor({state:'visible'});
  const m=await page.evaluate(()=>{const t=document.querySelector('#firm-followup .share-manual');return{focus:document.activeElement===t,ro:t.readOnly,sel:t.value.slice(t.selectionStart,t.selectionEnd),val:t.value,name:t.name,inForm:Boolean(t.closest('form'))};});
  assert.equal(m.focus,true);assert.equal(m.ro,true);assert.equal(m.sel,m.val);assert.equal(m.val,buildShare('firm','none_found').full);assert.equal(m.name,'');assert.equal(m.inForm,false);
  assert.equal(requests.length,before,'sharing makes no network request');await layout(page,320);await context.close();scenarios++;}
 // 6) Message F5a alone: neutral share (no risk category); never visible while the check runs.
 {const {context,page,requests}=await open(375,'/overit-zpravu',{ready:'#submit:not([disabled])'});
  await page.locator('#content').fill('Dobrý den, Jan Novák +420777123456 prosí o platbu, heslo tajne-heslo-42.');
  // Hold /api/analyze so the running state can be observed.
  let release;const held=new Promise(r=>{release=r;});
  await page.route('**/api/analyze',async route=>{await held;await route.continue();});
  await page.locator('#submit').click();await page.locator('#processing').waitFor({state:'visible'});
  assert.equal(await page.locator('.share-button:visible').count(),0,'no share button during the check');release();
  await page.locator('#result').waitFor({state:'visible'});
  assert.equal(await page.locator('#result-share').getAttribute('data-share-category'),'neutral');assert.equal(await page.locator('#result-share').getAttribute('data-share-type'),'message');
  await clickShare(page,'#result-share',requests);const l=await log(page);const {full,...e}=buildShare('message','neutral');assert.deepEqual(l,[['share',e]]);noLeak(l);
  await context.close();scenarios++;}
 // 7) Message + IČO: the combined result's real category replaces the neutral F5a share.
 {const {context,page}=await open(375,'/overit-zpravu',{ready:'#submit:not([disabled])'});
  await page.locator('#content').fill('Zaplaťte dnes fakturu.');await page.locator('#message-ico').fill('27082440');await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible'});await done(page);
  assert.equal(await page.locator('#result-share').count(),0);assert.equal(await page.locator('#check-combined .share-result').count(),1);
  assert.equal(await page.locator('#check-combined .share-result').getAttribute('data-share-type'),'message');assert.notEqual(await page.locator('#check-combined .share-result').getAttribute('data-share-category'),'neutral');
  await context.close();scenarios++;}
 // 8) Loan alone: neutral loan share with the ČNB note.
 {const {context,page,requests}=await open(375,'/proverit-pujcku',{ready:'#submit:not([disabled])'});
  await page.locator('#content').fill('Nabídka spotřebitelského úvěru 50 000 Kč na 24 měsíců.');await page.locator('#submit').click();await page.locator('#result').waitFor({state:'visible'});
  await clickShare(page,'#result-share',requests);const l=await log(page);assert.match(l[0][1].text,/ČNB jsme automaticky neověřili/);assert.equal(l[0][1].url,'https://verimtomu.fyi/proverit-pujcku');await context.close();scenarios++;}
 // 9) Contract: category from fromContract; contract text never shared; party check replaces the control.
 {const {context,page,requests}=await open(375,'/proverit-smlouvu',{ready:'#contract-form button[type=submit]:not([disabled])'});
  await page.locator('#contract-text').fill('Smlouva. Jan Novák, IČO: 27082440. Smluvní pokuta 0,5 % denně, tajne-heslo-42.');await page.locator('#contract-form button[type=submit]').click();
  await page.locator('#contract-share').waitFor({state:'visible'});const cat=await page.locator('#contract-share').getAttribute('data-share-category');assert(['attention','incomplete'].includes(cat));
  await clickShare(page,'#contract-share',requests);noLeak(await log(page));
  await page.locator('#contract-party-options input').first().check();await page.locator('#contract-party-submit').click();await done(page);
  assert.equal(await page.locator('#contract-share').count(),0);assert.equal(await page.locator('#check-combined .share-result').getAttribute('data-share-type'),'contract');await context.close();scenarios++;}
 // 10) Investment "Garantovaný výnos": serious → verka-warning; share keeps the ČNB note.
 {const {context,page,requests}=await open(375,'/proverit-investici',{ready:'#investment-submit'});
  await page.locator('[data-example="guaranteed"]').click();await page.locator('#investment-submit').click();await done(page);
  assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'serious');
  assert.equal(await page.locator('#check-combined .check-lead .verdict-guide').getAttribute('data-mood'),'verka-warning');
  await clickShare(page,'#check-combined',requests);const l=await log(page);assert.equal(l[0][1].text,buildShare('investment','serious').text);
  assert.doesNotMatch(JSON.stringify(l),/\d+\s*%|garant/i);
  for(const img of await page.locator('img').evaluateAll(is=>is.map(i=>i.getAttribute('src')||'')))assert.doesNotMatch(img,/success/,'no success pose on a result page');
  await context.close();scenarios++;}
 // 11) No animation or transition on Stage 8 elements (with and without reduced motion).
 for(const reducedMotion of ['no-preference','reduce']){
  const {context,page}=await open(375,'/proverit-firmu',{mode:'copy',reducedMotion});
  await page.locator('#firm-ico').fill('27082440');await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible'});
  const anim=await page.evaluate(()=>[...document.querySelectorAll('.share-result,.share-result *,.verdict-guide')].map(e=>{const s=getComputedStyle(e);return [s.animationName,s.transitionDuration];}));
  // The existing global reduced-motion rule clamps durations to 0.01 ms; Stage 8 itself sets none.
  for(const [name,dur] of anim){assert.equal(name,'none');for(const d of dur.split(','))assert(parseFloat(d)<=0.00001,dur);}
  await context.close();scenarios++;}
 console.log(`Stage 8 browser: PASS (${scenarios} scenarios at 320/375/430/1280 px; native share fixed payload, cancel without fallback, error → clipboard, manual read-only copy with focus, keyboard, neutral F5a and combined category, contract/firm/investment/loan, moods without success pose, no network on share, no leak, no animation, layout ≥48 px)`);
}finally{await browser.close();server.close();}
