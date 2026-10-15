// Stage 11 browser QA: tabbed admin dashboard (navigation, rendering, status line, mobile layout,
// keyboard and ARIA). Mocked data and a test JWT only.
//   cd admin && PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/tabs-browser.js
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {accessVerifier} from '../src/access.js';import {Store} from '../src/store.js';import {createDashboard} from '../src/server.js';
import {syncGsc} from '../src/gsc-sync.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const issuer='https://test-team.cloudflareaccess.com',audience='a'.repeat(64);
const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='t';jwk.alg='RS256';
const verify=accessVerifier({issuer,audience},createLocalJWKSet({keys:[jwk]}));
const jwt=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'t'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('30m').sign(pair.privateKey);
const prague=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const back=n=>new Date(Date.parse(prague+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
const dir=mkdtempSync(join(tmpdir(),'admin-tabs-'));
const usageFile=join(dir,'usage.json');
writeFileSync(usageFile,JSON.stringify({version:1,updated:Date.now(),startedDay:back(20),days:[{day:back(0),rules:3,ai:5,fallback:1},{day:back(1),rules:7,ai:2,fallback:0},{day:back(10),rules:1,ai:1,fallback:1}]}));
const day=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const fakeGoogle={async searchAnalytics(b){const days=[];for(let d=b.startDate;d<=b.endDate;d=day(d,1))days.push(d);const dims=b.dimensions.join(',');
 if(dims==='date')return {rows:days.map((d,i)=>({keys:[d],clicks:i%4,impressions:30+i,position:6})),metadata:{firstIncompleteDate:day(b.endDate,-1)}};
 if(dims==='date,page')return {rows:days.map(d=>({keys:[d,'https://verimtomu.fyi/overit-zpravu'],clicks:1,impressions:10,position:4}))};
 if(dims==='date,device')return {rows:days.map(d=>({keys:[d,'MOBILE'],clicks:1,impressions:10,position:4}))};
 return {rows:[{keys:['podvodna sms'],clicks:3,impressions:40,position:3}]};}};

async function dashboard(withData){
 const store=new Store(':memory:');
 const settings={host:'127.0.0.1',port:0,zone:withData?'a'.repeat(32):'',token:withData?'test-not-a-real-token':'',usageSnapshot:withData?usageFile:''};
 if(withData){
  assert.equal((await syncGsc({client:fakeGoogle,db:store.db,sleep:async()=>{}})).status,'ok');}
 const app=createDashboard({settings,verify,store,analytics:{totals:async()=>({requests24h:1234,requests7d:8765,blocked24h:12,blocked7d:80,source:'Cloudflare HTTP Analytics',sampled:true})},seo:withData?{configured:true,setupError:null}:{configured:false,setupError:'not_configured'}});
 await app.refresh();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));settings.port=app.server.address().port;
 return {url:'http://127.0.0.1:'+settings.port,close:()=>new Promise(r=>app.server.close(()=>{store.close();r();}))};
}
const TABS=[['cloudflare','Cloudflare','Přehled návštěvnosti'],['google','Google','SEO & Návštěvnost'],['overeni','Dokončená ověření','Používání aplikace'],['ai','AI','AI statistiky']];
const selected=page=>page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.tab));
const visiblePanels=page=>page.evaluate(()=>[...document.querySelectorAll('[role=tabpanel]')].filter(p=>!p.hidden&&p.offsetParent).map(p=>p.id));

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let checks=0;const ok=()=>checks++;
try{
 const d=await dashboard(true);
 const page=await browser.newPage({viewport:{width:1280,height:900},extraHTTPHeaders:{'cf-access-jwt-assertion':jwt}});
 const external=[],errors=[];page.on('request',r=>{if(!r.url().startsWith(d.url))external.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!/status of 404/.test(m.text()))errors.push(m.text());});
 await page.goto(d.url+'/');await page.locator('#usage table').waitFor({timeout:5000});

 // ARIA structure: one tablist, tabs ↔ panels linked both ways, roving tabindex, default "Dokončená ověření".
 const aria=await page.evaluate(()=>{const list=document.querySelectorAll('[role=tablist]');const tabs=[...document.querySelectorAll('[role=tab]')];
  return {lists:list.length,label:list[0]?.getAttribute('aria-label'),tabs:tabs.map(t=>({id:t.id,tab:t.dataset.tab,text:t.textContent,controls:t.getAttribute('aria-controls'),
   linked:document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('aria-labelledby')===t.id,role:document.getElementById(t.getAttribute('aria-controls'))?.getAttribute('role'),
   tabindex:t.tabIndex,selected:t.getAttribute('aria-selected'),type:t.type}))};});
 assert.equal(aria.lists,1);assert.equal(aria.label,'Sekce přehledu');
 assert.deepEqual(aria.tabs.map(t=>t.text),TABS.map(t=>t[1]),'order: Cloudflare, Google, Dokončená ověření, AI');
 for(const t of aria.tabs){assert(t.linked&&t.role==='tabpanel',t.id);assert.equal(t.type,'button');}
 assert.deepEqual(aria.tabs.map(t=>[t.selected,t.tabindex]),[['false',-1],['false',-1],['true',0],['false',-1]],'default tab and roving tabindex');
 assert.deepEqual(await visiblePanels(page),['panel-overeni']);ok();

 // Default tab content: usage table, 30-day chart, notes; nothing from other sections visible.
 let t=await page.locator('main').innerText();
 for(const s of ['Používání aplikace','Pravidla','AI','Náhradní','Celkem','Měření od','Denní součty podle času Europe/Prague'])assert(t.includes(s),'ověření: '+s);
 assert.equal(await page.locator('#usage meter').count(),30);
 for(const s of ['Přehled návštěvnosti','SEO & Návštěvnost','AI statistiky','HTTP požadavky za 24 hodin'])assert(!t.includes(s),'only related info: '+s);ok();

 // Status line: compact, role=status, only states reported by the APIs.
 const status=page.locator('.statusbar');assert.equal(await status.getAttribute('role'),'status');
 await page.waitForFunction(()=>document.querySelectorAll('#status-sources .source').length===3,null,{timeout:5000});
 const st=await status.innerText();
 for(const s of ['Přehled načten','Dashboard odpovídá · běží 0 minut','Cloudflare: aktuální','Ověření: aktuální','Google: aktuální','Veřejná aplikace a tunel: data zatím nejsou dostupná'])assert(st.includes(s),'status: '+s);
 assert((await status.boundingBox()).height<=120,'status line stays compact on desktop');ok();

 // Switching by mouse: no reload (marker survives, one navigation entry), URL fragment updated, content per tab.
 await page.evaluate(()=>{window.__noReload=true;});
 const expected={cloudflare:['Přehled návštěvnosti','HTTP požadavky za 24 hodin','1\u00a0234','8\u00a0765','Blokované HTTP požadavky za 7 dní','Údaje z Cloudflare mohou být vzorkované'],
  google:['SEO & Návštěvnost','Kliknutí z Google','Průměrná pozice','Nejvýkonnější stránky','podvodna sms'],
  overeni:['Používání aplikace','Celkem'],ai:['AI statistiky','Dokončené AI kontroly dnes: 5','Náhradní vyhodnocení dnes: 1','Dokončené AI kontroly za 7 dní: 7']};
 for(const [name,label,heading] of TABS){
  await page.getByRole('tab',{name:label,exact:true}).click();
  assert.deepEqual(await selected(page),[name]);assert.deepEqual(await visiblePanels(page),['panel-'+name]);
  if(name==='google')await page.locator('#seo .seo-kpi').first().waitFor({timeout:5000});
  t=await page.locator('main').innerText();for(const s of expected[name])assert(t.includes(s),name+': '+s);
  for(const [,,other] of TABS)if(other!==heading)assert(!t.includes(other),name+' shows only its section, not '+other);
  assert.equal(new URL(page.url()).hash,'#'+name);
 }
 assert.equal(await page.evaluate(()=>window.__noReload),true,'no page reload');
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),1);ok();

 // Active tab visually highlighted (filled accent) vs. outlined inactive tabs.
 await page.mouse.move(1,1);
 const colors=await page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].map(t=>[t.dataset.tab,getComputedStyle(t).backgroundColor,getComputedStyle(t).color]));
 const active=colors.find(c=>c[0]==='ai'),inactive=colors.filter(c=>c[0]!=='ai');
 assert.deepEqual(active.slice(1),['rgb(68, 53, 183)','rgb(255, 255, 255)']);for(const c of inactive)assert.deepEqual(c.slice(1),['rgb(255, 255, 255)','rgb(68, 53, 183)']);ok();

 // Keyboard: ArrowRight/ArrowLeft with wrap, Home/End, automatic activation, focus moves, visible focus ring.
 await page.getByRole('tab',{name:'Dokončená ověření',exact:true}).click();
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.tab),'overeni','Tab enters the tablist on the selected tab');
 for(const [key,want] of [['ArrowRight','ai'],['ArrowRight','cloudflare'],['ArrowLeft','ai'],['Home','cloudflare'],['End','ai'],['ArrowLeft','overeni']]){
  await page.keyboard.press(key);
  assert.deepEqual([await page.evaluate(()=>document.activeElement.dataset.tab),...(await selected(page))],[want,want],key);
 }
 const ring=await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return [s.outlineStyle,parseFloat(s.outlineWidth)];});
 assert.notEqual(ring[0],'none');assert(ring[1]>=3,'visible focus');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'panel-overeni','Tab moves from the tablist into the panel');
 const ring2=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);assert.notEqual(ring2,'none');ok();

 // Deep link and history: #google opens Google directly; an unknown fragment falls back to the default.
 await page.goto(d.url+'/#google');await page.locator('#seo .seo-kpi').first().waitFor({timeout:5000});
 assert.deepEqual(await selected(page),['google']);
 await page.evaluate(()=>{location.hash='#ai';});await page.waitForFunction(()=>document.querySelector('#tab-ai').getAttribute('aria-selected')==='true');
 await page.goto(d.url+'/#neexistuje');assert.deepEqual(await selected(page),['overeni']);ok();
 // Stage 10 Search Console controls still work inside the Google tab.
 await page.goto(d.url+'/#google');await page.locator('#seo .seo-kpi').first().waitFor({timeout:5000});
 await page.locator('.seo-periods button[data-days="7"]').click();await page.locator('.seo-periods button[data-days="7"][aria-pressed="true"]').waitFor();
 assert.match(await page.locator('#seo').innerText(),/Předchozích 7 dní/);ok();
 assert.deepEqual(external,[],'no external requests');assert.deepEqual(errors,[],'no console/CSP errors');
 await page.close();

 // Responsive layout: phone, small phone, tablet, desktop.
 for(const [width,cols] of [[320,2],[375,2],[768,4],[1280,4]]){
  const p=await browser.newPage({viewport:{width,height:800},extraHTTPHeaders:{'cf-access-jwt-assertion':jwt}});
  await p.goto(d.url+'/');await p.locator('#usage table').waitFor({timeout:5000});
  for(const [name] of TABS){
   await p.locator('#tab-'+name).click();if(name==='google')await p.locator('#seo .seo-kpi').first().waitFor({timeout:5000});
   const m=await p.evaluate(()=>{const tabs=[...document.querySelectorAll('[role=tab]')].map(t=>t.getBoundingClientRect());
    return {scroll:document.documentElement.scrollWidth,rows:new Set(tabs.map(r=>Math.round(r.top))).size,small:tabs.filter(r=>r.height<48||r.width<48).length,
     out:[...document.querySelectorAll('header *,.statusbar *,.tabs *,[role=tabpanel]:not([hidden]) *:not(table *):not(svg *)')].filter(e=>e.offsetParent&&!e.closest('.seo-table-wrap')&&e.getBoundingClientRect().right>innerWidth+0.5).length};});
   assert.equal(m.scroll,width,width+'/'+name+': no horizontal page scroll');assert.equal(m.small,0,'tab targets ≥ 48 px');assert.equal(m.out,0,width+'/'+name+': nothing outside the viewport');
   assert.equal(m.rows,cols===4?1:2,width+': tabs in '+(cols===4?'one row':'a 2×2 grid'));
  }
  await p.close();
 }
 ok();
 await d.close();

 // Without data: honest unavailable states in tabs and status line; no invented numbers.
 const e=await dashboard(false);
 const q=await browser.newPage({extraHTTPHeaders:{'cf-access-jwt-assertion':jwt}});
 await q.goto(e.url+'/');await q.waitForFunction(()=>document.querySelectorAll('#status-sources .source').length===3,null,{timeout:5000});
 const sq=await q.locator('.statusbar').innerText();
 for(const s of ['Cloudflare: nedostupné','Ověření: nedostupné','Google: nepřipojeno'])assert(sq.includes(s),'status: '+s);
 assert.match(await q.locator('#panel-overeni').innerText(),/Data zatím nejsou dostupná/);
 await q.locator('#tab-cloudflare').click();assert.match(await q.locator('#panel-cloudflare').innerText(),/Cloudflare API ještě není připojeno/);
 assert.equal(await q.locator('.stat').count(),0,'no numbers without data');
 await q.locator('#tab-ai').click();assert.match(await q.locator('#panel-ai').innerText(),/Data zatím nejsou dostupná/);
 await q.close();
 // Without the Access JWT nothing is served.
 const anon=await browser.newPage();assert.equal((await anon.goto(e.url+'/')).status(),403);await anon.close();
 await e.close();ok();
 console.log(`Admin tabs browser: PASS (${checks} checks; ARIA tabs, default "Dokončená ověření", per-tab content only, status line, no reload, active highlight, keyboard arrows/Home/End/Tab with visible focus, deep links, Stage 10 periods, 320/375/768/1280 px without overflow, ≥48 px targets, unavailable states, no external requests or CSP errors, JWT required)`);
}finally{await browser.close();}
