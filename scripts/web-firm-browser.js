// S3.6 browser regression: /proverit-web with optional operator IČO (Web + Firma).
// Needs Playwright installed OUTSIDE this project:
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/web-firm-browser.js
// Real page and server; only the firm registry source is a synthetic fixture (no network).
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
// High static limits: many page loads per minute in this test must not exhaust the ČOI snapshot budget.
const server=createServer({rateLimit:1000,sessionRateLimit:1000,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push(req.url+' '+Buffer.concat(parts));});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const URL_IN='https://www.priklad-obchod.invalid/kosik?token=tajne#platba',ICO='27082440';
const leaks=s=>/priklad-obchod|kosik|token|tajne|platba/.test(s);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0,widthWithout;
// Known, pre-existing (also on 87fed8b/production): h2#eshop-title overflows by ~40 px at 320 px.
// S3.6 must not add overflow: the combined result is checked, and the page width may not grow.
async function open(width){
 const page=await browser.newPage({viewport:{width,height:740}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/proverit-web',{waitUntil:'networkidle'});posts.length=0;requests.length=0;
 return {page,requests,errors};
}
async function submit(page,ico){await page.locator('#web-url').fill(URL_IN);await page.locator('#web-ico').fill(ico);await page.locator('#web-form button[type=submit]').click();}
try{
 for(const width of [320,375,430]){
  // 1) URL only: the original Web Checker, no API request, no combined result.
  {const {page,requests,errors}=await open(width);await submit(page,'');
   await page.locator('#web-result').waitFor({state:'visible'});await page.waitForTimeout(300);
   assert.equal(await page.locator('#check-combined').isHidden(),true);
   assert.equal(await page.locator('#eshop-operator').isVisible(),true,'legacy operator lookup still offered');
   assert.match(await page.locator('#web-domain').innerText(),/priklad-obchod\.invalid/);
   assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')),'no API call without IČO');
   widthWithout=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // 2) URL + valid IČO: combined result; only {"ico"} leaves the browser.
  {mode='ok';const {page,requests,errors}=await open(width);await submit(page,ICO);
   await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:8000});
   assert.equal(await page.locator('#check-combined .check-step').count(),2);
   assert.equal(await page.locator('#eshop-operator').isHidden(),true,'no duplicate ARES lookup');
   assert.deepEqual(posts,['/api/firm {"ico":"27082440"}']);
   assert(requests.every(r=>r.url.startsWith(base)),'same-origin only');
   assert(!requests.some(r=>leaks(r.url)||leaks(r.body)),'URL never leaves the browser');
   const fold=await page.evaluate(()=>{const h=document.querySelector('#check-combined .check-headline').getBoundingClientRect(),a=document.querySelector('#check-combined .verdict-primary').getBoundingClientRect();return{h:h.top,a:a.bottom,vh:innerHeight,over:[...document.querySelectorAll('#check-combined *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),width:document.documentElement.scrollWidth,focus:document.activeElement?.classList.contains('check-headline'),small:[...document.querySelectorAll('#check-combined summary,#web-again')].filter(e=>e.getBoundingClientRect().height<48).length};});
   assert(fold.h>=0&&fold.a<=fold.vh,'verdict and primary action above the fold at '+width+': '+JSON.stringify(fold));
   assert.equal(fold.over,false,'combined result does not overflow');assert(fold.width<=widthWithout,'page width unchanged by S3.6: '+fold.width+' > '+widthWithout);assert.equal(fold.focus,true,'focus on combined headline');assert.equal(fold.small,0,'48px targets');
   assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'not_assessable');
   assert.deepEqual(errors,[]);
   // Reset clears the combined result and restores the legacy section.
   await page.locator('#web-again').click();assert.equal(await page.locator('#check-combined').isHidden(),true);assert.equal(await page.locator('#eshop-operator').isVisible(),false);
   await page.close();scenarios++;}
  // 3) Invalid IČO: inline error, nothing rendered or sent.
  {const {page,requests,errors}=await open(width);await submit(page,'27082441');
   await page.locator('#web-error').waitFor({state:'visible'});assert.match(await page.locator('#web-error').innerText(),/IČO/);
   assert.equal(await page.locator('#web-result').isHidden(),true);assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
 }
 // 4) Firm source unavailable → required step not done, never green.
 {mode='down';const {page}=await open(375);await submit(page,ICO);
  await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:8000});
  assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'attention');
  assert.match(await page.locator('#check-combined .check-steps').innerText(),/Nedokončeno|neověřen/);await page.close();scenarios++;}
 // 5) Serious registry finding wins the aggregate.
 {mode='serious';const {page}=await open(375);await submit(page,ICO);
  await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:8000});
  assert.equal(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'serious');await page.close();scenarios++;}
 // 6) Registry text is rendered as text only.
 {mode='xss';const {page}=await open(375);await submit(page,ICO);
  await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:8000});
  await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  assert.equal(await page.locator('#check-combined img[src="x"]').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.match(await page.locator('#check-combined').innerText(),/<img src=x/);await page.close();scenarios++;}
 // 7) Timeout: a slow firm source is cut at the 5 s plan deadline.
 {mode='hang';const {page}=await open(375);const t=Date.now();await submit(page,ICO);
  await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});const took=Date.now()-t;
  assert(took<6500,'deadline '+took);assert.match(await page.locator('#check-combined .check-steps').innerText(),/Přeskočeno/);
  assert.notEqual(await page.locator('#check-combined .check-lead').getAttribute('data-level'),'none_found');await page.close();scenarios++;}
 console.log(`Web + Firma browser: PASS (${scenarios} scenarios at 320/375/430 px; URL never sent, only {"ico"} to /api/firm, fold, focus, 48px, XSS, outage, timeout)`);
}finally{await browser.close();server.close();}
