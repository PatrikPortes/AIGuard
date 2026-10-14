// S5.4 browser regression: Zpráva ↔ Web/Firma links (real pages, rules analysis).
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/message-links-browser.js
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
const posts=[],paths=[];
server.on('request',req=>{paths.push(req.url);const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const MARK='tajny-kod-5521';
const MSG='Dobrý den, zaplaťte dnes fakturu, jinak bude služba odpojena. Variabilní symbol '+MARK+'.';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,path='/overit-zpravu',ready='#submit:not([disabled])'){
 const page=await browser.newPage({viewport:{width,height:760}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
 await page.goto(base+path,{waitUntil:'networkidle'});if(ready)await page.locator(ready).waitFor({timeout:8000});
 posts.length=0;requests.length=0;paths.length=0;
 return {page,requests,errors};
}
async function check(page,text,ico=''){
 await page.locator('#content').fill(text);await page.locator('#message-ico').fill(ico);await page.locator('#submit').click();
}
const combinedDone=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
const level=page=>page.locator('#check-combined .check-lead').getAttribute('data-level');
const leaked=requests=>requests.filter(r=>!r.url.endsWith('/api/analyze')).some(r=>decodeURIComponent(r.url).includes(MARK)||r.body.includes(MARK));
// The firm page after following a link: prefilled, no request, fragment removed.
async function assertPrefilled(page,ico,requests){
 await page.waitForURL(/\/proverit-firmu$/,{timeout:8000});await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('#firm-ico').inputValue(),ico);
 assert.match(await page.locator('#firm-progress').innerText(),/IČO jsme předvyplnili\. Kontrolu spustíte tlačítkem/);
 assert.equal(new URL(page.url()).hash,'','fragment removed from the address bar');
 assert.equal(await page.locator('#firm-result').isHidden(),true);
 assert(!requests.some(r=>r.url.includes('/api/')),'no automatic API request');
 assert(!paths.some(p=>p.includes('ico=')||p.includes(ico)),'IČO never reaches the server in a URL');
}
try{
 for(const width of [320,375,430]){
  // 1) Message + valid IČO field: F5a result first, combined below, one /api/firm {"ico"}, detail link.
  {mode='ok';const {page,requests,errors}=await open(width);
   await check(page,MSG,'27082440');
   await page.locator('#result').waitFor({state:'visible',timeout:8000});assert.match(await page.locator('#result-title').innerText(),/Co jsme zjistili/);
   await combinedDone(page);
   const rows=(await page.locator('#check-combined .check-step-title').allTextContents()).map(t=>t.replace(/^[✓⚪]/,''));
   assert.deepEqual(rows,['Zpráva','Firma · IČO 27082440']);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);assert.equal(posts[1].body,'{"ico":"27082440"}');
   assert(!posts[0].body.includes('27082440')||posts[0].body.includes(MARK),'IČO field is not added to the analysis request');
   assert(!JSON.parse(posts[0].body).ico,'no ico key in /api/analyze');
   assert(!leaked(requests),'message text only to the existing /api/analyze');assert(requests.every(r=>r.url.startsWith(base)));
   const link=page.locator('#check-combined .check-firm-link a');assert.equal(await link.count(),1);
   assert.equal(await link.innerText(),'Prověřit firmu podrobně');assert.equal(await link.getAttribute('href'),'/proverit-firmu#ico=27082440');
   // Message page keeps its original (non-neutral) firm presentation and meaning.
   await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
   const t=await page.locator('#check-combined').textContent();assert(!/Firma nalezena v registrech/.test(t));
   const m=await page.evaluate(()=>({width:document.documentElement.scrollWidth,ico:document.querySelector('#message-ico').getBoundingClientRect().height,
    link:document.querySelector('#check-combined .check-firm-link a').getBoundingClientRect().height,
    over:[...document.querySelectorAll('#check-combined *,#analysis-form *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
    order:document.querySelector('#primary-action').getBoundingClientRect().top<document.querySelector('#check-combined').getBoundingClientRect().top}));
   assert.equal(m.width,width);assert.equal(m.over,false);assert(m.ico>=48,'IČO field 48px');assert(m.link>=48,'link 48px');assert.equal(m.order,true);
   // Follow the link: prefilled, nothing requested until the user presses the button.
   requests.length=0;await link.click();await assertPrefilled(page,'27082440',requests);
   posts.length=0;await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible',timeout:8000});
   assert.deepEqual(posts.map(p=>p.url+' '+p.body),['/api/firm {"ico":"27082440"}']);
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // 2) Invalid IČO field: error before any request, focus on the field.
  {const {page,requests}=await open(width);await check(page,MSG,'27082441');
   await page.locator('#error-panel').waitFor({state:'visible'});
   assert.match(await page.locator('#error-title').innerText(),/IČO firmy není platné/);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'message-ico');
   assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));await page.close();scenarios++;}
 }
 // 3) No IČO and nothing to plan: original result only, orchestrator not loaded.
 {const {page,requests}=await open(375);await check(page,MSG);await page.locator('#result').waitFor({state:'visible'});await page.waitForTimeout(400);
  assert.equal(await page.locator('#check-combined').isHidden(),true);assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);
  assert(!requests.some(r=>/check-flow|\/api\/firm/.test(r.url)));await page.close();scenarios++;}
 // 4) IČO only in the text (P5): one firm request; the "not verified that this firm sent it" note stays.
 {const {page}=await open(375);await check(page,MSG+' Dodavatel IČO: 27082440.');await combinedDone(page);
  assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);assert.equal(posts[1].body,'{"ico":"27082440"}');
  assert.equal(await page.locator('#check-combined .check-firm-link a').getAttribute('href'),'/proverit-firmu#ico=27082440');
  await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  assert.match(await page.locator('#check-combined').textContent(),/Neověřili jsme, že zprávu poslala tato firma\./);await page.close();scenarios++;}
 // 5) Several IČO in the text: ambiguous, no firm request; with the field exactly one, for the field.
 {const {page}=await open(375);await check(page,MSG+' IČO 27082440, IČ 00006947.');await combinedDone(page);
  assert.deepEqual(posts.map(p=>p.url),['/api/analyze']);assert.match(await page.locator('#check-combined .check-omitted').textContent(),/Nejednoznačný údaj/);
  assert.equal(await page.locator('#check-combined .check-firm-link').count(),0);
  posts.length=0;await page.locator('#next-check').click();
  assert.equal(await page.locator('#message-ico').inputValue(),'','new check clears the IČO field');
  await check(page,MSG+' IČO 27082440, IČ 00006947.','25596641');await combinedDone(page);
  assert.deepEqual(posts.filter(p=>p.url==='/api/firm').map(p=>p.body),['{"ico":"25596641"}']);await page.close();scenarios++;}
 // 6) Firm outage / risky firm keep their meaning on the message page.
 {mode='down';const {page}=await open(375);await check(page,MSG,'27082440');await combinedDone(page);
  assert.equal(await level(page),'attention');assert.equal(await page.locator('#check-combined .check-firm-link').count(),1);await page.close();scenarios++;}
 {mode='dissolved';const {page}=await open(375);await check(page,MSG,'27082440');await combinedDone(page);
  assert.equal(await level(page),'serious');await page.close();scenarios++;}
 // 7) Direct #ico= on the firm page: valid prefilled; invalid or foreign fragments ignored; never auto-run.
 {mode='ok';const {page,requests}=await open(375,'/proverit-firmu#ico=27082440',null);
  assert.equal(await page.locator('#firm-ico').inputValue(),'27082440');assert.equal(new URL(page.url()).hash,'');
  await page.waitForTimeout(300);assert(!requests.some(r=>r.url.includes('/api/')));assert.deepEqual(posts,[]);await page.close();
  for(const hash of ['#ico=27082441','#ico=123','#ico=27082440&text=ahoj','#text=ahoj']){
   const o=await open(375,'/proverit-firmu'+hash,null);assert.equal(await o.page.locator('#firm-ico').inputValue(),'',hash);
   assert.equal(await o.page.locator('#firm-progress').innerText(),'');await o.page.waitForTimeout(150);assert(!o.requests.some(r=>r.url.includes('/api/')));await o.page.close();
  }
  scenarios++;}
 // 8) Web → Zpráva: context link and existing navigation; message page starts empty.
 {const {page}=await open(375,'/proverit-web',null);
  const ctx=page.locator('.context-link a');assert.equal(await ctx.innerText(),'Máte podezřelou zprávu? Prověřte také její obsah.');
  assert(await page.locator('.flow-navigation a[href="/overit-zpravu"]').count()===1,'navigation kept');
  assert((await ctx.boundingBox()).height>=48);
  await ctx.click();await page.waitForURL(/\/overit-zpravu$/);await page.locator('#submit:not([disabled])').waitFor();
  assert.equal(await page.locator('#content').inputValue(),'');assert.equal(await page.locator('#message-ico').inputValue(),'');await page.close();scenarios++;}
 // 9) Firm → Zpráva: navigation link and context link.
 {for(const sel of ['.flow-navigation a[href="/overit-zpravu"]','.context-link a']){
   const {page}=await open(375,'/proverit-firmu',null);await page.locator(sel).click();await page.waitForURL(/\/overit-zpravu$/);
   await page.locator('#submit:not([disabled])').waitFor();assert.equal(await page.locator('#content').inputValue(),'');await page.close();}
  scenarios++;}
 // 10) Investice → Firma: link under the neutral registry firm; the investment verdict is unchanged.
 {mode='ok';const {page,requests}=await open(375,'/proverit-investici',null);
  await page.locator('#offer').fill('Fond nabízí investici do nemovitostí, podrobnosti v prospektu.');await page.locator('#offer-ico').fill('27082440');
  await page.locator('#investment-submit').click();await combinedDone(page);
  await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  const t=await page.locator('#check-combined').textContent();assert(t.includes('Firma nalezena v registrech'));assert.doesNotMatch(t,/🟢/);
  const link=page.locator('#check-combined .check-firm-link a');assert.equal(await link.getAttribute('href'),'/proverit-firmu#ico=27082440');
  requests.length=0;await link.click();await assertPrefilled(page,'27082440',requests);await page.close();scenarios++;}
 // 11) Loan page (S5.2) also offers the link; its neutral firm stays.
 {mode='ok';const {page}=await open(375,'/proverit-pujcku');
  await page.locator('#content').fill('Nabídka spotřebitelského úvěru 50 000 Kč na 24 měsíců.');await page.locator('#loan-ico').fill('27082440');await page.locator('#submit').click();
  await combinedDone(page);assert.equal(await page.locator('#check-combined .check-firm-link a').getAttribute('href'),'/proverit-firmu#ico=27082440');
  assert.equal(await page.locator('#message-ico').count(),0,'loan page has no message IČO field');await page.close();scenarios++;}
 console.log(`Message ↔ Web/Firm browser: PASS (${scenarios} scenarios at 320/375/430 px; message IČO field, ≤1 /api/firm {"ico"}, invalid IČO sends nothing, IČO in text, several IČO, outage, risky firm, detail link with #ico= prefill and no automatic request, Web → Zpráva, Firma → Zpráva, Investice → Firma, loan link)`);
}finally{await browser.close();server.close();}
