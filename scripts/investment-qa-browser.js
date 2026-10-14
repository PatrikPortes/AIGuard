// S4.6 final browser QA for /proverit-investici (real page, real server, real modules).
// Adds only scenarios not covered by investment-page-browser.js / investment-flow-browser.js:
// desktop, form readability, information order, ČNB gap on every verdict type, ambiguous IČO,
// a real 20 000-character offer, no-JS, ČNB links, double submit, result keyboard use, CSP.
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/investment-qa-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico})=>{
 if(mode==='down')throw Error('Unavailable');
 if(mode==='slow')await new Promise(r=>setTimeout(r,600));
 const base=profile();return {...base,query:{ico},identity:{...base.identity,ico}};
}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const CNB_SOURCE='Seznamy a upozornění ČNB — neprovedeno',CNB_UNKNOWN='Oprávnění poskytovatele u ČNB jsme automaticky neověřili.';
const CNB_LINKS=['https://www.cnb.cz/cs/dohled-financni-trh/seznamy/','https://www.cnb.cz/cs/dohled-financni-trh/ochrana-spotrebitele/upozorneni/'];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,height=800,options={}){
 const context=await browser.newContext({viewport:{width,height},...options});const page=await context.newPage();
 const requests=[],errors=[],csp=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))csp.push(m.text());});
 await page.goto(base+'/proverit-investici',{waitUntil:'networkidle'});posts.length=0;requests.length=0;
 return {context,page,requests,errors,csp};
}
async function run(page,offer,ico=''){
 await page.locator('#offer').fill(offer);await page.locator('#offer-ico').fill(ico);await page.locator('#investment-submit').click();
 await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
}
const level=page=>page.locator('#check-combined .check-lead').getAttribute('data-level');
async function cnbVisible(page,label){
 const row=page.locator('#check-combined .check-step').first();
 assert.match(await row.locator('.check-step-title').textContent(),/Investice/,label);
 assert((await row.locator('.check-step-sources').textContent()).includes(CNB_SOURCE),label+': ČNB source visible without expanding');
 await row.evaluate(d=>{d.open=true;});
 assert((await row.textContent()).includes(CNB_UNKNOWN),label+': ČNB gap stated');
 assert.doesNotMatch(await page.locator('#investment-result').textContent(),/🟢/,label+': never green');
}
const noLeak=(requests,secret)=>assert(!requests.some(r=>secret.test(decodeURIComponent(r.url))||secret.test(r.body)),'offer never sent');
try{
 // 1) Form readability and layout on mobile and desktop; information order; CSP.
 for(const [width,height] of [[320,700],[375,760],[430,900],[1280,900]]){
  const {context,page,errors,csp}=await open(width,height);
  const form=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect(),font=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
   return{width:document.documentElement.scrollWidth,offerH:box('#offer').height,icoH:box('#offer-ico').height,icoW:box('#offer-ico').width,offerW:box('#offer').width,
    submitH:box('#investment-submit').height,fonts:['#offer','#offer-ico','label[for=offer]','label[for=offer-ico]','#investment-submit'].map(font),hint:font('#offer-help')};});
  assert.equal(form.width,width,width+': no horizontal scroll (form)');
  assert(form.offerH>=48&&form.icoH>=48&&form.submitH>=48,width+': 48px targets '+JSON.stringify(form));
  assert(Math.abs(form.icoW-form.offerW)<=1,width+': IČO field as wide as the offer field '+JSON.stringify(form));
  assert(form.fonts.every(f=>f>=16)&&form.hint>=14,width+': readable font sizes '+JSON.stringify(form));
  await run(page,'Garantovaný výnos 30 % ročně, investice je zcela bez rizika. Nabídka platí jen dnes.','27082440');
  const order=await page.evaluate(()=>{const at=s=>document.querySelector(s).getBoundingClientRect().top+scrollY;
   return [at('#check-combined .check-headline'),at('#check-combined .verdict-primary'),at('#check-combined .check-steps'),at('#investment-checklist'),at('#investment-again')];});
  assert.deepEqual([...order].sort((a,b)=>a-b),order,width+': verdict → first step → checks → checklist → again');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,width+': no horizontal scroll (result)');
  await cnbVisible(page,'desktop/mobile '+width);
  assert.deepEqual(errors,[]);assert.deepEqual(csp,[],'no CSP violations');
  await context.close();scenarios++;
 }
 // 2) The ČNB gap stays visible for every verdict type.
 for(const [label,offer,ico,expected,setup] of [
  ['serious','Pošlete ihned 50 000 Kč na můj účet, investice je bez rizika.','','serious'],
  ['attention','Nabídka platí jen dnes!','','attention'],
  ['not assessable','Podílový fond. Hodnota investice může klesat i stoupat.','','not_assessable'],
  ['clean firm','Podílový fond. Hodnota investice může klesat i stoupat.','27082440','not_assessable'],
  ['firm unavailable','Podílový fond.','27082440','attention','down'],
  ['links only','Vyděláte 2 % denně na https://crypto-profit.example/start, vklad v USDT.','','attention']]){
  mode=setup||'ok';const {context,page}=await open(375);
  await run(page,offer,ico);assert.equal(await level(page),expected,label);await cnbVisible(page,label);
  await context.close();scenarios++;
 }
 mode='ok';
 // 3) Ambiguous IČO in the offer: no firm request, both listed as not checked.
 {const {context,page,requests}=await open(375);
  await run(page,'Dodavatel IČO: 27082440, zprostředkovatel IČ 00006947. Nabídka platí jen dnes.');
  assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));
  assert.equal(await page.locator('#check-combined .check-step').count(),1);
  const omitted=await page.locator('#check-combined .check-omitted').textContent();
  assert.match(omitted,/IČO · 00006947 — Nejednoznačný údaj; nebyl vybrán subjekt\./);assert.match(omitted,/IČO · 27082440 — Nejednoznačný údaj/);
  await cnbVisible(page,'ambiguous');await context.close();scenarios++;}
 // 4) A real 20 000-character offer: completes quickly, bounded quotes, nothing sent.
 {const {context,page,requests}=await open(320);
  const offer=('Garantovaný výnos 2 % denně, pošlete ihned peníze na můj účet. Nainstalujte AnyDesk. '.repeat(260)).slice(0,20000);
  const t=Date.now();await run(page,offer);const took=Date.now()-t;
  assert(took<3000,'20 000 characters evaluated in '+took+' ms');assert.equal(await level(page),'serious');
  await page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  const quotes=(await page.locator('#check-combined').textContent()).match(/Citace z nabídky: [^\n]*?(?=Uživatel|Uvedli)/g)||[];
  assert(quotes.length>0&&quotes.every(q=>q.length<=140),'bounded quotes');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  assert.deepEqual(posts,[]);noLeak(requests,/AnyDesk|Garant|pošlete/i);await context.close();scenarios++;}
 // 5) Without JavaScript nothing can be submitted and nothing is requested.
 {const {context,page,requests}=await open(375,760,{javaScriptEnabled:false});
  assert.equal(await page.locator('#investment-submit').isDisabled(),true);
  await page.locator('#offer').fill('Pošlete ihned peníze.');await page.locator('#offer').press('Control+Enter');
  await page.locator('#offer-ico').press('Enter');await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).search,'');assert(!requests.some(r=>r.url.includes('/api/')||/pošlete/i.test(decodeURIComponent(r.url))));
  assert.match(await page.locator('noscript').first().evaluate(n=>n.textContent),/Bez něj se nic neodesílá/);
  await context.close();scenarios++;}
 // 6) ČNB links: exact approved URLs, new tab, no opener/referrer (checklist and result).
 {const {context,page}=await open(375);await run(page,'Nabídka platí jen dnes!');
  const links=await page.locator('#investment-result a[href*="cnb.cz"]').evaluateAll(as=>as.map(a=>({href:a.href,target:a.target,rel:a.rel,ref:a.referrerPolicy})));
  assert(links.length>=4,'checklist + result verify links');
  for(const l of links){assert(CNB_LINKS.includes(l.href),l.href);assert.equal(l.target,'_blank');assert.match(l.rel,/noopener/);assert.match(l.rel,/noreferrer/);assert.equal(l.ref,'no-referrer');}
  await context.close();scenarios++;}
 // 7) Double submit while the registry is slow: exactly one /api/firm request.
 {mode='slow';const {context,page}=await open(375);
  await page.locator('#offer').fill('Podílový fond.');await page.locator('#offer-ico').fill('27082440');
  await page.locator('#investment-submit').evaluate(b=>{b.click();b.click();});
  await page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
  assert.deepEqual(posts.map(p=>p.body),['{"ico":"27082440"}']);mode='ok';await context.close();scenarios++;}
 // 8) Keyboard in the result: details open with Enter, focus visible, "Prověřit jinou nabídku" by keyboard.
 {const {context,page}=await open(375);await run(page,'Nabídka platí jen dnes!');
  // Stage 8: the share button is the first result control (after "Co udělat teď"); then the details.
  await page.keyboard.press('Tab');
  const share=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outlineStyle}));
  assert.deepEqual([share.tag,share.text],['BUTTON','Poslat výsledek blízkému']);assert.notEqual(share.outline,'none','visible focus on the share button');
  await page.keyboard.press('Tab');
  const first=await page.evaluate(()=>({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));
  assert.equal(first.tag,'SUMMARY');assert.notEqual(first.outline,'none','visible focus on the first result control');
  const wasOpen=await page.evaluate(()=>document.activeElement.parentElement.open);await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.parentElement.open),!wasOpen);
  await page.locator('#investment-again').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#investment-entry').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'offer');
  await context.close();scenarios++;}
 console.log(`Investment QA browser: PASS (${scenarios} scenarios: 320/375/430/1280 readability, order, CSP; ČNB gap on every verdict; ambiguous IČO; 20 000 chars; no-JS; ČNB links; double submit; keyboard)`);
}finally{await browser.close();server.close();}
