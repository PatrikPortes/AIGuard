// S3.7 browser regression: /overit-zpravu with links and IČO in the message (Zpráva + Web + Firma).
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/message-flow-browser.js
// Real page, server and rules analysis; only the firm registry source is a synthetic fixture (no network).
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico},{signal}={})=>{
 if(mode==='down')throw Error('Unavailable');
 if(mode==='hang')await new Promise(r=>setTimeout(r,7000));
 const base=profile();
 if(mode==='xss')return profile({identity:{...base.identity,name:'<img src=x onerror="window.__xss=1">Firma'}});
 if(mode==='serious')return profile({identity:{...base.identity,dissolved:'2025-01-01'}});
 return {...base,query:{ico},identity:{...base.identity,ico}};
}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const PLAIN='Ahoj, zítra se potkáme v deset u knihovny. Těším se.';
const FULL='Vaše banka: ihned zadejte heslo na https://banka-priklad.invalid/login?token=tajne#platba. Dodavatel IČO: 27082440.';
const leaks=s=>/banka-priklad|token|tajne|platba/.test(s);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,path='/overit-zpravu'){
 const page=await browser.newPage({viewport:{width,height:740}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+path,{waitUntil:'networkidle'});
 await page.locator('#submit:not([disabled])').waitFor();
 posts.length=0;requests.length=0;
 return {page,requests,errors};
}
async function check(page,text){
 await page.locator('#content').fill(text);await page.locator('#submit').click();
 await page.locator('#result').waitFor({state:'visible',timeout:8000});
}
const combinedDone=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
async function f5a(page){
 // F5a: neutral heading, server-ordered first action first, no score/percentage in the message result.
 assert.match(await page.locator('#result-title').innerText(),/Co jsme zjistili/);
 const primary=await page.locator('#primary-action').innerText();assert(primary.trim().length>0);
 const text=await page.locator('#result').innerText();assert.doesNotMatch(text,/\d\s*%|skóre|\/\s*100/i);
 return primary;
}
try{
 for(const width of [320,375,430]){
  // 1) Plain text: the existing F5a result only; orchestrator modules and ČOI are not even loaded.
  {const {page,requests,errors}=await open(width);await check(page,PLAIN);await page.waitForTimeout(400);
   await f5a(page);
   assert.equal(await page.locator('#check-combined').isHidden(),true);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
   assert(!requests.some(r=>/check-flow|check-plan|eshop-coi|\/api\/firm|\/api\/check/.test(r.url)),'nothing extra loaded');
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // 2) Link + valid IČO: F5a result first, combined result below; only {"ico"} goes to /api/firm.
  {mode='ok';const {page,requests,errors}=await open(width);await check(page,FULL);
   const primary=await f5a(page);await combinedDone(page);
   assert.equal(await page.locator('#check-combined .check-step').count(),3);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);
   assert.equal(posts[1].body,'{"ico":"27082440"}');
   assert(!requests.some(r=>r.url.includes('/api/check')),'no /api/check');
   assert(requests.every(r=>r.url.startsWith(base)),'same-origin only');
   // The text (with its link) goes only to the existing /api/analyze, as before S3.7.
   assert(!requests.filter(r=>!r.url.endsWith('/api/analyze')).some(r=>leaks(r.url)||leaks(r.body)),'URL never sent by the orchestrator');
   const m=await page.evaluate(()=>{const p=document.querySelector('#primary-action').getBoundingClientRect(),c=document.querySelector('#check-combined').getBoundingClientRect();
    return{primaryTop:p.top+scrollY,primaryBottom:p.bottom,combinedTop:c.top+scrollY,vh:innerHeight,width:document.documentElement.scrollWidth,
     over:[...document.querySelectorAll('#check-combined *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
     small:[...document.querySelectorAll('#check-combined summary')].filter(e=>e.getBoundingClientRect().height<48).length,
     focus:document.activeElement?.id,busy:document.querySelector('#check-combined').getAttribute('aria-busy')};});
   assert(m.primaryTop<m.combinedTop,'F5a server first action stays above the combined result');
   assert(m.primaryBottom<=m.vh,'F5a first action above the fold at '+width+': '+JSON.stringify(m));
   assert.equal(m.over,false,'combined result does not overflow');assert.equal(m.width,width,'no horizontal page scroll');
   assert.equal(m.small,0,'48px targets');assert.equal(m.focus,'result','focus stays on the F5a result');assert.equal(m.busy,'false');
   assert.equal(await page.locator('#primary-action').innerText(),primary,'server first action unchanged');
   assert.match(await page.locator('#check-combined .check-steps').textContent(),/Neověřili jsme, že zprávu poslala tato firma/);
   assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'serious','credentials rule stays red');
   assert.doesNotMatch(await page.locator('#check-combined').innerText(),/\d\s*%|skóre/i);
   assert.deepEqual(errors,[]);
   // Next check resets the combined result.
   await page.locator('#next-check').click();assert.equal(await page.locator('#check-combined').isHidden(),true);
   await page.close();scenarios++;}
  // 3) Invalid IČO: nothing sent, shown as not checked.
  {const {page,errors}=await open(width);await check(page,'Zálohu pošlete firmě IČO 27082441 ještě dnes.');
   await combinedDone(page);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
   assert.match(await page.locator('#check-combined .check-omitted').innerText(),/IČO · 27082441 — Neplatný údaj/);
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
 }
 // 4) More than two links: two web rows, the rest listed as not checked.
 {const {page}=await open(375);await check(page,'Odkazy: https://a.example/ https://b.example/ https://c.example/');await combinedDone(page);
  assert.equal(await page.locator('#check-combined .check-step').count(),3);
  assert.match(await page.locator('#check-combined .check-omitted').innerText(),/Odkaz · https:\/\/c\.example\/ — Přesahuje limit plánu/);
  assert.equal(posts.length,1);await page.close();scenarios++;}
 // 5) Registry unavailable: optional firm step visible as not done; never green.
 {mode='down';const {page}=await open(375);await check(page,'Ahoj, pošli prosím zálohu firmě IČO 27082440.');await combinedDone(page);
  assert.match(await page.locator('#check-combined .check-steps').innerText(),/Nedokončeno/);
  assert.notEqual(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'none_found');await page.close();scenarios++;}
 // 6) Serious registry finding wins the aggregate.
 {mode='serious';const {page}=await open(375);await check(page,'Ahoj, pošli prosím zálohu firmě IČO 27082440.');await combinedDone(page);
  assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'serious');await page.close();scenarios++;}
 // 7) Registry text is rendered as text only.
 {mode='xss';const {page}=await open(375);await check(page,'Ahoj, pošli prosím zálohu firmě IČO 27082440.');await combinedDone(page);
  await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  assert.equal(await page.locator('#check-combined img[src="x"]').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.match(await page.locator('#check-combined').innerText(),/<img src=x/);await page.close();scenarios++;}
 // 8) Timeout: a slow firm source is cut at the 5 s plan deadline.
 {mode='hang';const {page}=await open(375);await check(page,'Ahoj, pošli prosím zálohu firmě IČO 27082440.');const t=Date.now();await combinedDone(page);
  assert(Date.now()-t<6500,'deadline');assert.match(await page.locator('#check-combined .check-steps').innerText(),/Přeskočeno/);
  assert.notEqual(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'none_found');await page.close();scenarios++;}
 // 9) Built-in "bank" example: its link ends with a comma (S3.8 P4 fix) and still gets a local web row.
 {mode='ok';const {page,errors}=await open(375);await page.locator('[data-example="bank"]').click();await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible'});await combinedDone(page);
  assert.equal(await page.locator('#check-combined .check-step').count(),2);assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
  assert.match(await page.locator('#check-combined .check-steps').innerText(),/Web · banka-priklad\.invalid/);
  assert.equal(await page.locator('#check-combined .check-omitted').count(),0);
  assert.deepEqual(errors,[]);await page.close();scenarios++;}
 // 10) Loan page shares app.js. Since S5.2 it has its own Loan → Firm combined run (covered by
 // loan-firm-browser.js); here: hidden on load, no errors, and a plain loan text (no IČO, no link)
 // keeps the original single result with one /api/analyze and no orchestrator request.
 {const page=await browser.newPage({viewport:{width:375,height:740}});const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
  await page.goto(base+'/proverit-pujcku',{waitUntil:'networkidle'});assert.equal(await page.locator('#check-combined').isHidden(),true);
  await page.locator('#submit:not([disabled])').waitFor();posts.length=0;requests.length=0;
  await page.locator('#content').fill('Nabídka půjčky 20 000 Kč na 12 měsíců.');await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible'});await page.waitForTimeout(300);
  assert.equal(await page.locator('#check-combined').isHidden(),true);assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
  assert(!requests.some(u=>/check-flow|\/api\/firm/.test(u)));
  assert.deepEqual(errors,[]);await page.close();scenarios++;}
 console.log(`Zpráva + Web + Firma browser: PASS (${scenarios} scenarios at 320/375/430 px; F5a first action kept, URL never sent by the orchestrator, only {"ico"} to /api/firm, no /api/check, limits, invalid IČO, outage, serious, XSS, timeout, loan page)`);
}finally{await browser.close();server.close();}
