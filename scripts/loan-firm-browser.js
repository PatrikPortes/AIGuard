// S5.2 browser regression: /proverit-pujcku Loan → Firm (real page, server and rules analysis).
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/loan-firm-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico})=>{
 if(mode==='down')throw Error('Unavailable');
 const base=profile();
 if(mode==='dissolved')return profile({identity:{...base.identity,dissolved:'2025-01-01'}});
 return {...base,query:{ico},identity:{...base.identity,ico}};
}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const SAFE='Dobrý den, posíláme nabídku spotřebitelského úvěru 50 000 Kč na 24 měsíců, smlouvu vám zašleme k prostudování.';
const MARK='spotřebitelského úvěru 50 000';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,path='/proverit-pujcku'){
 const page=await browser.newPage({viewport:{width,height:760}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+path,{waitUntil:'networkidle'});await page.locator('#submit:not([disabled])').waitFor({timeout:8000});
 posts.length=0;requests.length=0;
 return {page,requests,errors};
}
async function check(page,text,ico=''){
 await page.locator('#content').fill(text);if(await page.locator('#loan-ico').count())await page.locator('#loan-ico').fill(ico);
 await page.locator('#submit').click();
}
const combinedDone=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
const level=page=>page.locator('#check-combined .check-lead').getAttribute('data-level');
const openAll=page=>page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
try{
 for(const width of [320,375,430]){
  // 1) Loan + valid IČO: F5a result first, combined below, neutral firm, ČNB gap, one firm call.
  {mode='ok';const {page,requests,errors}=await open(width);
   await check(page,SAFE,'27082440');
   await page.locator('#result').waitFor({state:'visible',timeout:8000});
   assert.match(await page.locator('#result-title').innerText(),/Co jsme zjistili/);
   const primary=await page.locator('#primary-action').innerText();assert(primary.trim());
   await combinedDone(page);
   const rows=(await page.locator('#check-combined .check-step-title').allTextContents()).map(t=>t.replace(/^[✓⚪]/,''));
   assert.deepEqual(rows,['Půjčka','Firma · IČO 27082440']);
   assert.match(await page.locator('#check-combined .check-step').first().locator(':scope > summary').innerText(),/Oprávnění poskytovat spotřebitelské úvěry \(ČNB\) jsme automaticky neověřili\./,'ČNB gap visible without expanding');
   await openAll(page);
   const all=await page.locator('#check-combined').textContent();
   for(const t of ['Firma nalezena v registrech','Zápis firmy v registru nepotvrzuje oprávnění poskytovat spotřebitelské úvěry ani výhodnost nabídky.',
    'Zápis v obchodním rejstříku neznamená oprávnění poskytovat spotřebitelské úvěry ani bezpečnost půjčky.','Poskytovatele ani jeho oprávnění od ČNB jsme neověřili.','ČNB – seznamy poskytovatelů'])
    assert(all.includes(t),width+': missing '+t);
   assert.doesNotMatch(all,/🟢|Nenašli jsme výrazné varovné signály/);
   assert.notEqual(await level(page),'none_found');
   // Network: one /api/analyze (existing, unchanged) and exactly one /api/firm with {"ico"}.
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);assert.equal(posts[1].body,'{"ico":"27082440"}');
   assert(posts[0].body.includes('"topic":"loan"'),'loan analysis unchanged');
   assert(!requests.filter(r=>!r.url.endsWith('/api/analyze')).some(r=>decodeURIComponent(r.url).includes(MARK)||r.body.includes(MARK)),'loan text only to /api/analyze');
   assert(!requests.some(r=>r.url.includes('/api/check')));assert(requests.every(r=>r.url.startsWith(base)));
   const m=await page.evaluate(()=>{const p=document.querySelector('#primary-action').getBoundingClientRect(),c=document.querySelector('#check-combined').getBoundingClientRect();
    return{order:p.top<c.top,width:document.documentElement.scrollWidth,focus:document.activeElement?.id,
     over:[...document.querySelectorAll('#result *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
     small:[...document.querySelectorAll('#check-combined summary')].filter(e=>e.getBoundingClientRect().height<48).length,
     ico:document.querySelector('#loan-ico').getBoundingClientRect().height};});
   assert.equal(m.order,true,'F5a first action above the combined result');assert.equal(m.width,width);assert.equal(m.over,false);
   assert.equal(m.small,0);assert.equal(m.focus,'result','focus stays on the F5a result');assert(m.ico>=48,'IČO field 48px');
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // 2) Invalid IČO: error, nothing at all is sent (no /api/analyze, no /api/firm).
  {const {page,requests}=await open(width);await check(page,SAFE,'27082441');
   await page.locator('#error-panel').waitFor({state:'visible'});
   assert.match(await page.locator('#error-title').innerText(),/IČO poskytovatele není platné/);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'loan-ico');
   assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));await page.close();scenarios++;}
 }
 // 3) Loan without IČO and without a link: original result only, orchestrator not even loaded.
 {const {page,requests}=await open(375);await check(page,SAFE);
  await page.locator('#result').waitFor({state:'visible'});await page.waitForTimeout(400);
  assert.equal(await page.locator('#check-combined').isHidden(),true);assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
  assert(!requests.some(r=>/check-flow|eshop-coi|\/api\/firm/.test(r.url)));await page.close();scenarios++;}
 // 4) Several IČO in the text: ambiguous → no firm request, both listed.
 {const {page}=await open(375);await check(page,SAFE+' Věřitel IČO 27082440, zprostředkovatel IČ 00006947.');await combinedDone(page);
  assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
  assert.match(await page.locator('#check-combined .check-omitted').textContent(),/Nejednoznačný údaj/);await page.close();scenarios++;}
 // 5) Firm unavailable: required step not done → attention, never green.
 {mode='down';const {page}=await open(375);await check(page,SAFE,'27082440');await combinedDone(page);
  assert.match(await page.locator('#check-combined .check-steps').textContent(),/Nedokončeno/);assert.equal(await level(page),'attention');await page.close();scenarios++;}
 // 6) Risky (dissolved) firm wins the aggregate.
 {mode='dissolved';const {page}=await open(375);await check(page,SAFE,'27082440');await combinedDone(page);
  assert.equal(await level(page),'serious');await page.close();scenarios++;}
 // 7) Regression: the message page keeps its original (non-neutral) firm presentation and no loan notes.
 {mode='ok';const {page}=await open(375,'/overit-zpravu');
  await page.locator('#content').fill('Faktura od dodavatele, IČO: 27082440, zaplaťte dnes.');await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible'});await combinedDone(page);await openAll(page);
  const t=await page.locator('#check-combined').textContent();
  assert(t.includes('Nenašli jsme výrazné varovné signály'),'message page firm detail unchanged');
  assert(!/Firma nalezena v registrech|spotřebitelské úvěry/.test(t));assert.equal(await page.locator('#loan-ico').count(),0);
  await page.close();scenarios++;}
 console.log(`Loan → Firm browser: PASS (${scenarios} scenarios at 320/375/430 px; F5a result first, one /api/analyze, ≤1 /api/firm {"ico"}, neutral firm, ČNB gap, invalid IČO sends nothing, ambiguity, outage, risky firm, message page unchanged)`);
}finally{await browser.close();server.close();}
