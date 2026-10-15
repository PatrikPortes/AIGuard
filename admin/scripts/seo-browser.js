// Stage 10 browser QA for the SEO section of the existing admin dashboard (mocked data, test JWT).
//   cd admin && PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/seo-browser.js
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {accessVerifier} from '../src/access.js';import {Store} from '../src/store.js';import {createDashboard} from '../src/server.js';
import {syncGsc} from '../src/gsc-sync.js';import {ensureGscSchema} from '../src/gsc-store.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const issuer='https://test-team.cloudflareaccess.com',audience='a'.repeat(64);
const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='t';jwk.alg='RS256';
const verify=accessVerifier({issuer,audience},createLocalJWKSet({keys:[jwk]}));
const jwt=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'t'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('30m').sign(pair.privateKey);
const day=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const NOW=Date.parse('2026-10-15T06:00:00Z');
// Fake Google with 200 days of data (some days without impressions) and a hostile query string.
const fakeGoogle={async searchAnalytics(b){const days=[];for(let d=b.startDate;d<=b.endDate;d=day(d,1))if(Number(d.slice(8))%5)days.push(d);const dims=b.dimensions.join(',');
 if(dims==='date')return {rows:days.map((d,i)=>({keys:[d],clicks:i%7,impressions:40+i,position:8-(i%3)})),metadata:{firstIncompleteDate:'2026-10-13'}};
 if(dims==='date,page')return {rows:days.flatMap(d=>[{keys:[d,'https://verimtomu.fyi/overit-zpravu'],clicks:1,impressions:20,position:5},{keys:[d,'https://verimtomu.fyi/proverit-web'],clicks:0,impressions:8,position:12}])};
 if(dims==='date,device')return {rows:days.map(d=>({keys:[d,'MOBILE'],clicks:1,impressions:30,position:7}))};
 return {rows:[{keys:['jak poznat podvodnou sms'],clicks:9,impressions:120,position:4.2},{keys:['<img src=x onerror=alert(1)>'],clicks:1,impressions:3,position:9}]};}};

async function dashboard(state){
 const store=new Store(':memory:');ensureGscSchema(store.db);
 if(state==='available'){const r=await syncGsc({client:fakeGoogle,db:store.db,now:NOW,sleep:async()=>{}});assert.equal(r.status,'ok');}
 if(state==='no_data')await syncGsc({client:{searchAnalytics:async()=>({rows:[]})},db:store.db,now:NOW,sleep:async()=>{}});
 if(state==='unavailable')store.db.prepare("INSERT INTO gsc_sync(started,finished,status,error) VALUES(1,2,'error','permissions')").run();
 const settings={host:'127.0.0.1',port:0,zone:'',token:''};
 const app=createDashboard({settings,verify,store,analytics:{totals:async()=>({})},seo:state==='not_configured'?{configured:false,setupError:'invalid_credentials'}:{configured:true,setupError:null}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));settings.port=app.server.address().port;
 return {url:'http://127.0.0.1:'+settings.port,close:()=>new Promise(r=>app.server.close(()=>{store.close();r();}))};
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let checks=0;
try{
 for(const [state,expected] of [['not_configured',/Google Search Console zatím není připojeno\.[\s\S]*Klíč služby chybí, je neplatný nebo nečitelný\./],['pending',/Probíhá první synchronizace/],['unavailable',/Účet služby nemá v Google Search Console přístup/],['no_data',/Google zatím neposkytuje dostatek dat\./]]){
  const d=await dashboard(state);const page=await browser.newPage({extraHTTPHeaders:{'cf-access-jwt-assertion':jwt}});
  await page.goto(d.url+'/');await page.locator('#seo').filter({hasText:expected}).waitFor({timeout:5000});
  assert.equal(await page.locator('#seo .seo-kpi').count(),0,'no numbers without data');
  await page.close();await d.close();checks++;
 }
 const d=await dashboard('available');
 for(const width of [320,375,430,1280]){
  const page=await browser.newPage({viewport:{width,height:900},extraHTTPHeaders:{'cf-access-jwt-assertion':jwt}});
  const external=[],errors=[];page.on('request',r=>{if(!r.url().startsWith(d.url))external.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
  const notFound=[];page.on('response',r=>{if(r.status()===404)notFound.push(new URL(r.url()).pathname);});
  page.on('console',m=>{if(m.type()==='error'&&!/status of 404/.test(m.text()))errors.push(m.text());});
  await page.goto(d.url+'/');await page.locator('#seo .seo-kpi').first().waitFor({timeout:5000});
  assert.equal(await page.locator('#seo .seo-kpi').count(),4);
  const t=await page.locator('#seo').innerText();
  for(const s of ['Kliknutí z Google','Zobrazení ve vyhledávání','Průměrné CTR','Průměrná pozice','Předchozích 28 dní','Výkon jednotlivých kontrol','Zpráva','Web','Firma','Půjčka','Investice','Smlouva','Ostatní stránky','Nejvýkonnější stránky','/overit-zpravu','Nejčastější vyhledávací dotazy','jak poznat podvodnou sms','Google neuvádí všechny dotazy','Obsahuje předběžná data','Mobil','Nižší číslo znamená lepší pozici'])assert(t.includes(s),width+': missing '+s);
  assert(t.includes('<img src=x onerror=alert(1)>'),'hostile query shown as text');assert.equal(await page.locator('#seo img').count(),0,'no HTML injected');
  assert.equal(await page.locator('.seo-chart svg path').count(),2);assert(await page.locator('.seo-chart svg circle').count()>=2*23,'a point for every reported day');assert.doesNotMatch(t,/\.\.(?!\.)/,'no double full stop');assert(await page.locator('.seo-chart rect.gap').count()>0,'days without Google data shown as gaps');
  await page.locator('.seo-chart summary').click();assert(await page.locator('.seo-chart table tr').count()>28);
  const m=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('.seo-periods button,#seo summary')].filter(e=>e.getBoundingClientRect().height<48).length,
   outside:[...document.querySelectorAll('.seo,.seo *:not(table *):not(svg *)')].filter(e=>e.offsetParent&&!e.closest('.seo-table-wrap')&&e.getBoundingClientRect().right>innerWidth+0.5).length}));
  assert.equal(m.scroll,width,'no horizontal page scroll at '+width);assert.equal(m.small,0,'targets ≥ 48 px');assert.equal(m.outside,0,'nothing outside the viewport');
  // Keyboard period switch (7 → 90) with aria-pressed.
  await page.locator('.seo-periods button[data-days="7"]').focus();await page.keyboard.press('Enter');
  await page.locator('.seo-periods button[data-days="7"][aria-pressed="true"]').waitFor();assert.match(await page.locator('#seo').innerText(),/Předchozích 7 dní/);
  await page.locator('.seo-periods button[data-days="90"]').focus();await page.keyboard.press('Space');
  await page.locator('.seo-periods button[data-days="90"][aria-pressed="true"]').waitFor();assert.match(await page.locator('#seo').innerText(),/z 90 dní/);
  // The existing dashboard sections are still there.
  for(const h of ['Přehled návštěvnosti','Používání aplikace','AI statistiky','Provozní stav'])assert.equal(await page.getByRole('heading',{name:h}).count(),1,h);
  // The dashboard has never served a favicon; the browser's automatic request is the only 404.
  assert(notFound.every(p=>p==='/favicon.ico'),'unexpected 404: '+notFound.join(','));
  assert.deepEqual(external,[],'no external requests');assert.deepEqual(errors,[],'no console/CSP errors');
  await page.close();checks++;
 }
 // Without the Access JWT nothing is served.
 const anon=await browser.newPage();const res=await anon.goto(d.url+'/api/seo?days=28');assert.equal(res.status(),403);await anon.close();
 await d.close();checks++;
 console.log(`Admin SEO browser: PASS (${checks} checks; 4 empty states without numbers, data view at 320/375/430/1280 px, KPIs with comparison, chart with gaps and table, checkers, pages, queries as text, devices, keyboard period switch, 48 px targets, no overflow, no external requests, no CSP errors, JWT required)`);
}finally{await browser.close();}
