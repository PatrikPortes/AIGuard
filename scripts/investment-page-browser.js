// S4.5 browser regression: the real /proverit-investici page (real server, real modules).
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/investment-page-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico})=>{
 if(mode==='down')throw Error('Unavailable');
 const base=profile();
 return {...base,query:{ico},identity:{...base.identity,ico}};
}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const FULL='Investice je zcela bez rizika, pošlete ihned peníze na můj účet. Registrace na https://crypto-profit.example/start, druhý odkaz https://b.example/ a třetí https://c.example/.';
const SECRET=/bez rizika|pošlete|crypto-profit|b\.example|c\.example|můj účet|Garant|img|Podílový|platí jen/i;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,path='/proverit-investici'){
 const page=await browser.newPage({viewport:{width,height:740}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+path,{waitUntil:'networkidle'});posts.length=0;requests.length=0;
 return {page,requests,errors};
}
async function check(page,offer,ico=''){
 await page.locator('#offer').fill(offer);await page.locator('#offer-ico').fill(ico);await page.locator('#investment-submit').click();
}
const done=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
const level=page=>page.locator('#check-combined .check-lead').getAttribute('data-level');
const openAll=page=>page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
const noLeak=requests=>assert(!requests.some(r=>SECRET.test(decodeURIComponent(r.url))||SECRET.test(r.body)),'offer text never leaves the browser');
try{
 for(const width of [320,375,430]){
  // 1) Offer + IČO + links: full result; clean firm presented neutrally; only {"ico"} sent.
  {mode='ok';const {page,requests,errors}=await open(width);
   await check(page,FULL,'27082440');await done(page);
   assert.equal(await level(page),'serious');
   assert.equal(await page.locator('#investment-entry').isHidden(),true);
   const rows=(await page.locator('#check-combined .check-step-title').allTextContents()).map(t=>t.replace(/^[✓⚪]/,''));
   assert.deepEqual(rows,['Investice','Firma · IČO 27082440','Web · b.example','Web · c.example']);
   assert.match(await page.locator('#check-combined .check-omitted').textContent(),/crypto-profit\.example\/start — Přesahuje limit plánu/);
   await openAll(page);
   const all=await page.locator('#investment-result').textContent();
   for(const expected of ['Tvrzení o investici bez rizika','Citace z nabídky: bez rizika','Požadavek na okamžitý převod peněz','Platba na osobní účet',
    'Oprávnění poskytovatele u ČNB jsme automaticky neověřili.','Seznamy a upozornění ČNB — neprovedeno','Uvedli jste vy, neověřovali jsme.',
    'Firma nalezena v registrech','Zápis firmy v registru nepotvrzuje oprávnění poskytovat investiční služby ani bezpečnost nabídky.',
    'Než pošlete peníze','Ověřte poskytovatele v seznamech ČNB. Hledejte přesné IČO, ne jen podobný název.'])
    assert(all.includes(expected),width+': missing '+expected);
   // No green anywhere on the investment page, the firm sub-result is neutral, its facts stay.
   assert.doesNotMatch(all,/🟢|Nenašli jsme výrazné varovné signály/);
   const firm=page.locator('#check-combined .check-step').nth(1).locator('.verdict-result');
   assert.equal(await firm.getAttribute('data-level'),'none_found');assert.equal(await firm.getAttribute('data-presentation'),'registry-found');
   assert.equal(await firm.locator('.verdict-lead').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(244, 245, 249)');
   assert.match(await firm.textContent(),/Obchodní název: Testovací společnost/);
   assert.equal(await page.locator('#checklist li').count(),7);
   assert.deepEqual(await page.locator('#checklist a[href^="https://"]').evaluateAll(as=>as.map(a=>new URL(a.href).hostname)),['www.cnb.cz','www.cnb.cz']);
   // Network.
   assert.deepEqual(posts.map(p=>p.url),['/api/firm']);assert.equal(posts[0].body,'{"ico":"27082440"}');
   assert(requests.every(r=>r.url.startsWith(base)),'same-origin');assert(!requests.some(r=>/\/api\/(?:check|analyze)/.test(r.url)));noLeak(requests);
   // Mobile, focus, targets.
   const m=await page.evaluate(()=>({width:document.documentElement.scrollWidth,
    over:[...document.querySelectorAll('#investment-result *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
    small:[...document.querySelectorAll('#investment-result summary,#investment-result button')].filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().height<48).length,
    focus:document.activeElement?.classList.contains('check-headline'),
    fold:(()=>{const h=document.querySelector('#check-combined .check-headline').getBoundingClientRect();return h.top>=0&&h.top<innerHeight;})()}));
   assert.equal(m.width,width,'no horizontal scroll');assert.equal(m.over,false,'no overflow');assert.equal(m.small,0,'48px targets');
   assert.equal(m.focus,true,'focus on the verdict headline');assert.equal(m.fold,true,'verdict visible');
   assert.deepEqual(errors,[]);
   // "Prověřit jinou nabídku" resets and returns focus to the offer.
   await page.locator('#investment-again').click();
   assert.equal(await page.locator('#investment-result').isHidden(),true);assert.equal(await page.locator('#offer').inputValue(),'');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'offer');
   await page.close();scenarios++;}
  // 2) Validation: nothing is sent.
  {const {page,requests}=await open(width);
   await page.locator('#investment-submit').click();
   assert.match(await page.locator('#investment-error').textContent(),/Vložte text investiční nabídky/);assert.equal(await page.evaluate(()=>document.activeElement.id),'offer');
   await check(page,'Garantovaný výnos','27082441');
   assert.match(await page.locator('#investment-error').textContent(),/IČO musí mít 8 číslic/);assert.equal(await page.evaluate(()=>document.activeElement.id),'offer-ico');
   await page.locator('#offer').evaluate(t=>{t.removeAttribute('maxlength');t.value='x'.repeat(20001);});await page.locator('#offer-ico').fill('');await page.locator('#investment-submit').click();
   assert.match(await page.locator('#investment-error').textContent(),/nejvýše 20 000 znaků/);
   assert.equal(await page.locator('#investment-result').isHidden(),true);assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));
   await page.close();scenarios++;}
 }
 // 3) Offer only, weaker signal → attention; no request at all.
 {const {page,requests}=await open(375);await check(page,'Nabídka platí jen dnes!');await done(page);
  assert.equal(await level(page),'attention');assert.equal(await page.locator('#check-combined .check-step').count(),1);
  assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));noLeak(requests);await page.close();scenarios++;}
 // 4) No findings (fund example with IČO in the text, P5) → not assessable; neutral firm.
 {const {page,requests}=await open(375);await page.locator('[data-example="fund"]').click();await page.locator('#investment-submit').click();await done(page);
  assert.equal(await level(page),'not_assessable');
  assert.match(await page.locator('#check-combined .check-headline').textContent(),/Z dostupných údajů nelze posoudit/);
  assert.match(await page.locator('#check-combined').textContent(),/Firma nalezena v registrech/);
  assert.doesNotMatch(await page.locator('#investment-result').textContent(),/🟢/);
  assert.deepEqual(posts.map(p=>p.body),['{"ico":"27082440"}']);noLeak(requests);await page.close();scenarios++;}
 // 5) Offer + links only (platform example): local web checks, serious, no API request.
 {const {page,requests}=await open(375);await page.locator('[data-example="platform"]').click();await page.locator('#investment-submit').click();await done(page);
  assert.equal(await level(page),'serious');assert.match(await page.locator('#check-combined').textContent(),/Web · crypto-profit\.example/);
  assert.deepEqual(posts,[]);noLeak(requests);await page.close();scenarios++;}
 // 6) /api/firm unavailable: required firm step not done → attention, never green.
 {mode='down';const {page}=await open(375);await check(page,'Podílový fond.','27082440');await done(page);
  assert.match(await page.locator('#check-combined .check-steps').textContent(),/Nedokončeno/);assert.equal(await level(page),'attention');await page.close();scenarios++;}
 // 7) Quotes are text, never HTML.
 {mode='ok';const {page,errors}=await open(375);await check(page,'Garantovaný <img src=x> výnos, investice je zcela bez rizika.');await done(page);await openAll(page);
  assert.equal(await page.locator('#investment-result img[src="x"]').count(),0);
  assert((await page.locator('#check-combined').textContent()).includes('Citace z nabídky: Garantovaný <img src=x> výnos'));
  assert.deepEqual(errors,[]);await page.close();scenarios++;}
 // 8) Keyboard: skip link → form; Tab order offer → IČO → submit.
 {const {page}=await open(375);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');
  await page.locator('#offer').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'offer-ico');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'investment-submit');
  const outline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);assert.notEqual(outline,'none','visible focus');
  await page.close();scenarios++;}
 // 9) Regression: /proverit-web keeps its own clean-firm presentation (no investment rewrite).
 {const {page}=await open(375,'/proverit-web');await page.locator('#web-url').fill('https://priklad.example/');await page.locator('#web-ico').fill('27082440');
  await page.locator('#web-form button[type=submit]').click();await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
  await openAll(page);assert.equal(await page.locator('[data-presentation]').count(),0);
  assert.match(await page.locator('#check-combined .check-step').nth(1).textContent(),/Nenašli jsme výrazné varovné signály/);
  await page.close();scenarios++;}
 console.log(`Investment page browser: PASS (${scenarios} scenarios at 320/375/430 px; offer never sent, only {"ico"} to /api/firm, neutral registry firm, ČNB unverified, quotes as text, validation, outage, keyboard, /proverit-web unchanged)`);
}finally{await browser.close();server.close();}
