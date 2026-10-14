// S4.4 browser regression: investment runner + combined view in real Chromium.
// The investment page is S4.5, so this script serves a test-only harness page via a
// Playwright route (same origin and the same CSP as /proverit-web). All other modules,
// /api/session, /api/firm and /eshop-coi.json come from the real server; only the firm
// registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/investment-flow-browser.js
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

let mode='ok';
const firmSources={profile:async({ico})=>{
 if(mode==='down')throw Error('Unavailable');
 if(mode==='hang')await new Promise(r=>setTimeout(r,7000));
 const base=profile();
 return {...base,query:{ico},identity:{...base.identity,ico}};
}};
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9,firmSources});
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const csp=(await fetch(base+'/proverit-web')).headers.get('content-security-policy');
const local=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const HARNESS=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/verdict.css"><script type="module" src="/__s44-harness.js"></script></head>
<body><main><section id="combined" class="check-combined" aria-live="polite" hidden></section></main></body></html>`;
const HARNESS_JS=`import {startInvestmentCheck} from '/check-flow.js';
import {evaluateInvestment} from '/investment-rules.js';import {fromInvestment} from '/investment-verdict.js';
import {checkWebUrl} from '/web-checker.js';import {coiResult} from '/eshop-checker.js';
const coiData=()=>fetch('/eshop-coi.json',{cache:'no-store',credentials:'omit'}).then(r=>r.ok?r.json():null);
window.runInvestment=(offer,ico,url)=>startInvestmentCheck(document.querySelector('#combined'),{offer,ico,url,evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData}).then(()=>true);
window.harnessReady=true;`;
const OFFER='Investice je zcela bez rizika, pošlete ihned peníze na můj účet. Registrace na https://crypto-profit.example/start. Poskytovatel IČO: 27082440.';
const SECRET=/bez rizika|pošlete|crypto-profit|start|můj účet|Garant|img/i;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width){
 const page=await browser.newPage({viewport:{width,height:740}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 await page.route(base+'/__s44-harness',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':csp},body:HARNESS}));
 await page.route(base+'/__s44-harness.js',r=>r.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:HARNESS_JS}));
 for(const f of ['investment-rules.js','investment-verdict.js'])await page.route(base+'/'+f,r=>r.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:local(f)}));
 await page.goto(base+'/__s44-harness',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.harnessReady===true);
 posts.length=0;requests.length=0;
 return {page,requests,errors};
}
const run=(page,offer,ico,url)=>page.evaluate(([o,i,u])=>window.runInvestment(o,i,u),[offer,ico,url]);
const text=page=>page.locator('#combined').textContent();
try{
 for(const width of [320,375,430]){
  // 1) Full combined check: offer with a link and a labelled IČO + IČO field.
  {mode='ok';const {page,requests,errors}=await open(width);
   await run(page,OFFER,'27082440');
   await page.locator('#combined .check-headline').waitFor({state:'visible'});
   assert.equal(await page.locator('#combined .check-lead').getAttribute('data-level'),'serious');
   const rows=await page.locator('#combined .check-step-title').allTextContents();
   assert.deepEqual(rows.map(r=>r.replace(/^[✓⚪]/,'')),['Investice','Firma · IČO 27082440','Web · crypto-profit.example']);
   const invRow=page.locator('#combined .check-step').first();
   assert.match(await invRow.locator('.check-step-state').textContent(),/Výsledek s neověřenými zdroji/);
   assert.match(await invRow.locator('.check-step-sources').textContent(),/Seznamy a upozornění ČNB — neprovedeno/);
   await page.locator('#combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
   const all=await text(page);
   for(const expected of ['Tvrzení o investici bez rizika','Citace z nabídky: bez rizika','Požadavek na okamžitý převod peněz','Citace z nabídky: pošlete ihned',
    'Oprávnění poskytovatele u ČNB jsme automaticky neověřili.','Tvrzení o výnosu, bezpečnosti ani regulaci v nabídce jsme neověřovali.','Uvedli jste vy, neověřovali jsme.',
    'Oprávnění u ČNB automaticky neověřujeme. Poskytovatele ověřte ručně v seznamech ČNB.','ČNB – seznamy regulovaných a registrovaných subjektů','ČNB – upozornění na aktivity',
    'Zápis v obchodním rejstříku neznamená oprávnění k investičním službám ani bezpečnost investice.','Důvod spuštění: Vložili jste text investiční nabídky.'])
    assert(all.includes(expected),width+': missing '+expected);
   assert.match(await page.locator('#combined .verdict-primary').first().textContent(),/Neposílejte peníze na osobní účet/);
   // Never green for the investment: not in the combined lead nor in the investment step.
   // (A clean firm keeps its own nested firm verdict, as on /proverit-web, next to the ARES note.)
   assert.doesNotMatch(await page.locator('#combined .check-lead').textContent(),/🟢/);
   assert.doesNotMatch(await invRow.textContent(),/🟢/);
   const firmRow=page.locator('#combined .check-step').nth(1);
   if(/🟢/.test(await firmRow.textContent()))assert.match(await firmRow.textContent(),/Zápis v obchodním rejstříku neznamená oprávnění k investičním službám ani bezpečnost investice\.[\s\S]*To neznamená, že je firma bezpečná/);
   assert.doesNotMatch(all,/je bezpečná investice|investice je bezpečná/i);
   // Network: only {"ico"} to /api/firm; the offer never leaves the browser.
   assert.deepEqual(posts.map(p=>p.url),['/api/firm']);assert.equal(posts[0].body,'{"ico":"27082440"}');
   assert(requests.every(r=>r.url.startsWith(base)),'same-origin only');
   assert(!requests.some(r=>/\/api\/(?:check|analyze)/.test(r.url)),'no /api/check or /api/analyze');
   assert(!requests.some(r=>SECRET.test(decodeURIComponent(r.url))||SECRET.test(r.body)),'offer text never sent');
   // Mobile layout: fold, overflow, targets, focus.
   const m=await page.evaluate(()=>{const h=document.querySelector('#combined .check-headline').getBoundingClientRect(),a=document.querySelector('#combined .verdict-primary').getBoundingClientRect();
    return{h:h.top,a:a.bottom,vh:innerHeight,width:document.documentElement.scrollWidth,
     over:[...document.querySelectorAll('#combined *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
     small:[...document.querySelectorAll('#combined summary')].filter(e=>e.getBoundingClientRect().height<48).length,
     focus:document.activeElement?.classList.contains('check-headline')};});
   assert.equal(m.over,false,'no overflow at '+width);assert.equal(m.width,width,'no horizontal scroll');assert.equal(m.small,0,'48px targets');assert.equal(m.focus,true,'focus on headline');
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
 }
 // 2) Quotes are text, never HTML.
 {const {page,errors}=await open(375);
  await run(page,'Garantovaný <img src=x> výnos a investice je zcela bez rizika.');
  await page.locator('#combined .check-headline').waitFor({state:'visible'});
  await page.locator('#combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
  assert.equal(await page.locator('#combined img[src="x"]').count(),0);
  assert((await text(page)).includes('Citace z nabídky: Garantovaný <img src=x> výnos'));
  assert.deepEqual(errors,[]);await page.close();scenarios++;}
 // 3) No signals → not assessable (never green); ČNB still unverified.
 {const {page}=await open(375);
  await run(page,'Podílový fond spravuje investiční společnost. Hodnota investice může klesat i stoupat.');
  await page.locator('#combined .check-headline').waitFor({state:'visible'});
  assert.equal(await page.locator('#combined .check-lead').getAttribute('data-level'),'not_assessable');
  assert.match(await page.locator('#combined .check-headline').textContent(),/Z dostupných údajů nelze posoudit/);
  assert.deepEqual(posts,[]);await page.close();scenarios++;}
 // 4) Skipped checks are listed: more links than the limit.
 {const {page}=await open(375);
  await run(page,'Nabídka platí jen dnes: https://a.example/ https://b.example/ https://c.example/');
  await page.locator('#combined .check-headline').waitFor({state:'visible'});
  assert.equal(await page.locator('#combined .check-step').count(),3);
  assert.match(await page.locator('#combined .check-omitted').textContent(),/Odkaz · https:\/\/c\.example\/ — Přesahuje limit plánu\./);
  assert.equal(await page.locator('#combined .check-lead').getAttribute('data-level'),'attention');
  await page.close();scenarios++;}
 // 5) /api/firm unavailable: required firm step not done → attention, never green.
 {mode='down';const {page}=await open(375);
  await run(page,'Podílový fond.','27082440');
  await page.locator('#combined .check-headline').waitFor({state:'visible'});
  assert.match(await page.locator('#combined .check-steps').textContent(),/Nedokončeno/);
  assert.equal(await page.locator('#combined .check-lead').getAttribute('data-level'),'attention');
  await page.close();scenarios++;}
 // 6) Deadline: a hanging registry is cut at the 5 s plan deadline.
 {mode='hang';const {page}=await open(375);const t=Date.now();
  await run(page,'Nabídka platí jen dnes!','27082440');
  assert(Date.now()-t<6500,'deadline '+(Date.now()-t));
  assert.match(await page.locator('#combined .check-steps').textContent(),/Přeskočeno/);
  assert.notEqual(await page.locator('#combined .check-lead').getAttribute('data-level'),'none_found');
  await page.close();scenarios++;}
 console.log(`Investment runner browser: PASS (${scenarios} scenarios at 320/375/430 px; offer never sent, only {"ico"} to /api/firm, Investice row, ČNB unverified, quotes as text, missing info, steps, ARES note, limits, outage, deadline)`);
}finally{await browser.close();server.close();}
