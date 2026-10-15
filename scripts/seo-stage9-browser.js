// Stage 9 SEO browser QA: new static sections, footer checks and situation links on the real pages.
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/seo-stage9-browser.js
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer({rateLimit:1000,sessionRateLimit:1000,sessionIssueRateLimit:1000,globalApiRateLimit:9999,staticRateLimit:10000,staticBytesPerMinute:1e9});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
const CHECKERS=['/overit-zpravu','/proverit-web','/proverit-firmu','/proverit-pujcku','/proverit-investici','/proverit-smlouvu'];
const ALL=['/',...CHECKERS,'/uz-se-to-stalo','/o-projektu','/kontakt','/privacy'];
let layouts=0;
try{
 for(const width of [320,375,430,1280]){
  const page=await browser.newPage({viewport:{width,height:800}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
  for(const path of ALL){
   await page.goto(base+path,{waitUntil:'networkidle'});
   const m=await page.evaluate(()=>{const w=innerWidth,vis=e=>e.offsetParent!==null&&e.getBoundingClientRect().width>0;
    const sel='.watch-out a,.situation-link,.trust-footer-checks a';
    return{scroll:document.documentElement.scrollWidth,
     outside:[...document.querySelectorAll('.watch-out,.watch-out *,.situation-link,.trust-footer-checks,.trust-footer-checks *,.welcome h1')].filter(e=>vis(e)&&e.getBoundingClientRect().right>w+0.5).length,
     small:[...document.querySelectorAll(sel)].filter(e=>vis(e)&&e.getBoundingClientRect().height<48).map(e=>e.textContent),
     footer:[...document.querySelectorAll('.trust-footer-checks a')].map(a=>a.getAttribute('href')),
     h1:[...document.querySelectorAll('h1')].filter(vis).length};});
   assert.equal(m.scroll,width,path+' overflow at '+width);assert.equal(m.outside,0,path+' element outside at '+width);assert.deepEqual(m.small,[],path+' targets < 48px at '+width);
   assert.deepEqual(m.footer,[...CHECKERS,'/uz-se-to-stalo'],path);assert.equal(m.h1,1,path+' one visible H1');
   layouts++;
  }
  // Homepage: the new H1 fits and the primary action stays in the first viewport.
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const hero=await page.evaluate(()=>({h1:document.querySelector('.welcome h1').innerText.replace(/\s+/g,' ').trim(),action:document.querySelector('.welcome-action').getBoundingClientRect().bottom}));
  assert.equal(hero.h1,'Jak poznat podvod dřív, než zaplatíte');assert(hero.action<=800||width>=1280,'welcome action visible at '+width);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'no external requests');await page.close();
 }
 // Without JavaScript the guidance is in the HTML (what crawlers and no-JS readers see).
 const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:800}});const nojs=await ctx.newPage();
 for(const path of CHECKERS){
  await nojs.goto(base+path);
  const t=await nojs.locator('.watch-out').innerText();assert.match(t,/Na co si dát pozor|Typické znaky investičního podvodu/);
  assert(await nojs.locator('.watch-out li').count()>=6,'items and related links visible without JS on '+path);
  const words=(await nojs.locator('main').innerText()).split(/\s+/).filter(Boolean).length;assert(words>=150,path+' words without JS '+words);
 }
 await ctx.close();
 // Keyboard: the footer checks are reachable and activate with Enter.
 const kb=await browser.newPage({viewport:{width:375,height:800}});await kb.goto(base+'/proverit-firmu',{waitUntil:'networkidle'});
 await kb.locator('.trust-footer-checks a[href="/proverit-smlouvu"]').focus();
 assert.notEqual(await kb.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none','visible focus');
 await kb.keyboard.press('Enter');await kb.waitForURL(/\/proverit-smlouvu$/);await kb.close();
 console.log(`SEO Stage 9 browser: PASS (${layouts} page/width layouts at 320/375/430/1280 px; no overflow, link targets ≥48px, footer checks on every page, one visible H1, homepage H1 and first action, guidance visible without JS, keyboard footer navigation, no external requests)`);
}finally{await browser.close();server.close();}
