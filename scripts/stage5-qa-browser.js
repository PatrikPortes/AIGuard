// S5.5 integration QA: all Stage 5 links on the real pages at 320/375/430/1280 px.
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/stage5-qa-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico})=>{
 if(mode==='slow')await new Promise(r=>setTimeout(r,6500));
 const base=profile();return {...base,query:{ico},identity:{...base.identity,ico}};
},search:async()=>{throw Error('not used');}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[],paths=[];
server.on('request',req=>{paths.push(req.url);const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
const MARK='tajne-5521';
let scenarios=0;
async function open(width,path,ready){
 const page=await browser.newPage({viewport:{width,height:800}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
 await page.goto(base+path,{waitUntil:'networkidle'});if(ready)await page.locator(ready).waitFor({timeout:8000});
 posts.length=0;requests.length=0;paths.length=0;
 return {page,requests,errors};
}
const done=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:12000});
const openAll=page=>page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
// Layout: no horizontal overflow, nothing outside the viewport, link/control targets ≥ 48 px.
async function layout(page,width,extra=''){
 const m=await page.evaluate(sel=>{const w=innerWidth;const vis=e=>e.offsetParent!==null&&e.getBoundingClientRect().width>0;
  return{scroll:document.documentElement.scrollWidth,
   outside:[...document.querySelectorAll('main *')].filter(e=>vis(e)&&getComputedStyle(e).position!=='absolute'&&e.getBoundingClientRect().right>w+0.5).map(e=>e.id||e.className||e.tagName).slice(0,5),
   small:[...document.querySelectorAll('#check-combined summary,#check-combined .check-firm-link a,.context-link a'+(sel?','+sel:''))].filter(e=>vis(e)&&e.getBoundingClientRect().height<48).map(e=>e.id||e.className||e.tagName)};},extra);
 assert.equal(m.scroll,width,'horizontal overflow at '+width);assert.deepEqual(m.outside,[],'element outside viewport at '+width);assert.deepEqual(m.small,[],'small targets at '+width);
}
const firmCalls=()=>posts.filter(p=>p.url==='/api/firm');
const noGreen=async page=>{await openAll(page);const t=await page.locator('#check-combined').textContent();assert.doesNotMatch(t,/🟢/);return t;};
async function followToFirm(page,ico,requests){
 const link=page.locator('#check-combined .check-firm-link a').first();assert.equal(await link.getAttribute('href'),'/proverit-firmu#ico='+ico);
 requests.length=0;posts.length=0;await link.click();await page.waitForURL(/\/proverit-firmu$/);await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('#firm-ico').inputValue(),ico);assert.equal(await page.locator('#firm-name').inputValue(),'');
 assert.equal(new URL(page.url()).hash,'');assert(!requests.some(r=>r.url.includes('/api/')),'no automatic request');assert.deepEqual(posts,[]);
 assert(!paths.some(p=>p.includes(ico)),'IČO never in a server URL');
}
try{
 for(const width of [320,375,430,1280]){
  // A. Zpráva + IČO → Firma (link, #ico prefill, explicit submit).
  {mode='ok';const {page,requests,errors}=await open(width,'/overit-zpravu','#submit:not([disabled])');
   await page.locator('#content').fill('Zaplaťte dnes fakturu, jinak odpojíme službu. Kód '+MARK+'.');await page.locator('#message-ico').fill('27082440');await page.locator('#submit').click();
   await page.locator('#result').waitFor({state:'visible',timeout:8000});await done(page);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);assert.equal(firmCalls()[0].body,'{"ico":"27082440"}');
   assert(!requests.filter(r=>!r.url.endsWith('/api/analyze')).some(r=>r.body.includes(MARK)||r.url.includes(MARK)));
   await openAll(page);await layout(page,width,'#message-ico');
   await followToFirm(page,'27082440',requests);await layout(page,width,'#firm-ico,#firm-submit');
   await page.locator('#firm-submit').click();await page.locator('#firm-result').waitFor({state:'visible',timeout:8000});
   assert.deepEqual(posts.map(p=>p.url+' '+p.body),['/api/firm {"ico":"27082440"}']);
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // B. Půjčka → Firma: F5a result kept, neutral firm, one /api/analyze + one /api/firm.
  {const {page,errors}=await open(width,'/proverit-pujcku','#submit:not([disabled])');
   await page.locator('#content').fill('Nabídka spotřebitelského úvěru 50 000 Kč na 24 měsíců, smlouvu zašleme.');await page.locator('#loan-ico').fill('27082440');await page.locator('#submit').click();
   await page.locator('#result').waitFor({state:'visible',timeout:8000});await done(page);
   assert.deepEqual(posts.map(p=>p.url),['/api/analyze','/api/firm']);
   const t=await noGreen(page);assert(t.includes('Firma nalezena v registrech'));assert(t.includes('Oprávnění poskytovat spotřebitelské úvěry (ČNB) jsme automaticky neověřili.'));
   assert.notEqual(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'none_found');
   await layout(page,width,'#loan-ico');assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // C. Smlouva → Firma: text stays local, explicit party choice, one /api/firm, original result kept.
  {const {page,requests,errors}=await open(width,'/proverit-smlouvu','#contract-form button[type=submit]:not([disabled])');
   const contract='Kupní smlouva. Prodávající ABC s.r.o., IČO: 27082440. Kupující XYZ a.s., IČ 00006947. Smluvní pokuta '+MARK+' 0,5 % denně.';
   await page.locator('#contract-text').fill(contract);await page.locator('#contract-form button[type=submit]').click();
   await page.locator('#contract-party').waitFor({state:'visible',timeout:8000});
   const original=await page.locator('#contract-findings').innerText();
   assert.equal(await page.locator('#contract-party-options input:checked').count(),0);assert.deepEqual(posts,[]);
   await layout(page,width,'#contract-party-options label,#contract-party-ico,#contract-party-submit');
   // Keyboard only: focus the first option, select it with Space, submit with Enter.
   await page.locator('#contract-party-options input').first().focus();await page.keyboard.press('Space');
   await page.locator('#contract-party-submit').focus();await page.keyboard.press('Enter');await done(page);
   assert.deepEqual(posts.map(p=>p.url+' '+p.body),['/api/firm {"ico":"00006947"}']);
   assert(!requests.some(r=>r.body.includes(MARK)||r.body.includes('Kupní')||decodeURIComponent(r.url).includes(MARK)),'contract text never sent');
   assert.equal(await page.locator('#contract-findings').innerText(),original);
   const t=await noGreen(page);assert(t.includes('Neověřili jsme, že smlouvu uzavírá právě tato firma.'));
   await layout(page,width);assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // D. Investice → Firma/Web: one /api/firm, URL checked locally, neutral firm, link to the firm page.
  {const {page,requests,errors}=await open(width,'/proverit-investici','#investment-submit');
   await page.locator('#offer').fill('Fond nabízí investici do nemovitostí, podrobnosti na https://fond-priklad.example/info '+MARK+'.');await page.locator('#offer-ico').fill('27082440');
   await page.locator('#investment-submit').click();await done(page);
   assert.deepEqual(posts.map(p=>p.url),['/api/firm']);assert(!requests.some(r=>r.body.includes(MARK)||r.body.includes('fond-priklad')||(r.url.includes('fond-priklad'))));
   const rows=(await page.locator('#check-combined .check-step-title').allTextContents()).map(s=>s.replace(/^[✓⚪]/,''));
   assert.deepEqual(rows,['Investice','Firma · IČO 27082440','Web · fond-priklad.example']);
   const t=await noGreen(page);assert(t.includes('Firma nalezena v registrech'));
   await layout(page,width,'#offer-ico');await followToFirm(page,'27082440',requests);assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // Web/Firma → Zpráva links.
  {for(const path of ['/proverit-web','/proverit-firmu']){const {page}=await open(width,path);await layout(page,width);
    await page.locator('.context-link a').click();await page.waitForURL(/\/overit-zpravu$/);await page.locator('#submit:not([disabled])').waitFor();
    assert.equal(await page.locator('#content').inputValue(),'');await page.close();}
   scenarios++;}
 }
 // Timeout: a firm source slower than the 5 s plan deadline → step not done, never green; F5a result kept.
 {mode='slow';const {page}=await open(375,'/overit-zpravu','#submit:not([disabled])');
  await page.locator('#content').fill('Zaplaťte dnes fakturu.');await page.locator('#message-ico').fill('27082440');await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible',timeout:8000});await done(page);
  assert.match(await page.locator('#check-combined .check-steps').textContent(),/Přeskočeno|Nedokončeno/);
  assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'attention');
  assert(await page.locator('#primary-action').isVisible());assert.equal(firmCalls().length,1);await page.close();scenarios++;}
 console.log(`Stage 5 integration QA browser: PASS (${scenarios} scenarios at 320/375/430/1280 px; Zpráva↔Firma with #ico prefill and explicit submit, Půjčka→Firma, Smlouva→Firma with keyboard party choice and local text, Investice→Firma/Web, Web/Firma→Zpráva, no duplicate requests, no green, layout and 48px targets, deadline timeout)`);
}finally{await browser.close();server.close();}
