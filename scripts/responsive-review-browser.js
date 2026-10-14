// Fixture-only responsive/content and firm-name flow checks. No registry/AI network.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from '../src/server.js';
import {profile} from '../test-support/firm/profiles.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const calls=[],server=createServer({rateLimit:10000,sessionRateLimit:10000,sessionIssueRateLimit:10000,staticRateLimit:100000,staticBytesPerMinute:1e9,globalApiRateLimit:10000,limiterClock:()=>Date.now()+calls.length*60001,firmSources:{profile:async b=>{calls.push({kind:'profile',...b});return profile();},search:async b=>{calls.push({kind:'search',...b});if(b.name==='Výpadek')throw Error('Unavailable');return {total:b.name==='Více'?12:1,candidates:Array.from({length:b.name==='Více'?(b.start?2:10):1},(_,i)=>({ico:'27082440',name:i===0?'<img src=x onerror=alert(1)>':'Ukázková firma '+(b.start+i+1),seat:'Praha'}))};}}});
await new Promise(r=>server.listen(0,'0.0.0.0',r));const base='http://127.0.0.1:'+server.address().port,out=process.env.RESPONSIVE_OUTPUT_DIR||'/tmp/responsive-review';mkdirSync(out,{recursive:true});
let browser;const findings=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
 const paths=['/','/overit-zpravu','/proverit-web','/proverit-pujcku','/proverit-smlouvu','/proverit-firmu','/proverit-investici','/privacy','/uz-se-to-stalo','/missing-page'];
 for(const width of [320,360,390,430,600,768,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const path of paths){await page.goto(base+path);await page.waitForTimeout(80);
   const metrics=await page.evaluate(()=>{const w=innerWidth;return {overflow:document.documentElement.scrollWidth>w+1,outside:[...document.querySelectorAll('main *,header *,footer *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.right>w+1||r.left< -1)&&getComputedStyle(e).position!=='absolute';}).slice(0,8).map(e=>e.id||e.className||e.tagName),headerOverlap:(()=>{const a=document.querySelector('header .brand'),b=document.querySelector('header nav,header>a:not(.brand)');if(!a||!b)return false;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right>y.left+1&&x.bottom>y.top+1&&y.bottom>x.top;})()};});
   if(metrics.overflow||metrics.headerOverlap)findings.push({width,path,...metrics});
   if([390,1440].includes(width)&&['/','/proverit-firmu','/proverit-smlouvu'].includes(path))await page.screenshot({path:`${out}/${path==='/'?'home':path.slice(1)}-${width}.png`,fullPage:true});
  }
  await page.close();assert.deepEqual(errors,[]);
 }
 // Every candidate, including a single match, requires an explicit user click.
 for(const width of [320,390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});await page.goto(base+'/proverit-firmu');
  const before=calls.filter(x=>x.kind==='profile').length;
  await page.locator('#firm-name').fill('Ukázka');await page.locator('#firm-submit').click();await page.locator('.firm-candidate').waitFor();assert.equal(calls.filter(x=>x.kind==='profile').length,before);assert.equal(await page.locator('#firm-result').isVisible(),false);assert.equal(await page.locator('#firm-candidates [onerror]').count(),0);await page.locator('.firm-candidate').click();await page.locator('.verdict-headline').waitFor();assert.equal(calls.filter(x=>x.kind==='profile').length,before+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#firm-again').click();await page.locator('#firm-name').fill('Více');await page.locator('#firm-submit').click();await page.locator('.firm-candidate').first().waitFor();assert.equal(await page.locator('.firm-candidate').count(),10);await page.locator('#firm-search-next').click();await page.waitForFunction(()=>document.querySelector('#firm-candidates-count').textContent.includes('11–12'));assert.equal(await page.locator('.firm-candidate').count(),2);
  await page.locator('#firm-name').fill('Výpadek');await page.locator('#firm-submit').click();await page.locator('#firm-error').waitFor({state:'visible'});assert.equal(await page.locator('#firm-result').isVisible(),false);await page.close();
 }
 // Exercise actual result layouts, not only empty entry forms.
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const [path,fill,submit,ready]of [
   ['/overit-zpravu','#content','#analysis-form button[type=submit]','#result'],
   ['/proverit-web','#web-url','#web-form button[type=submit]','#web-result'],
   ['/proverit-smlouvu','#contract-text','#contract-form button[type=submit]','#contract-result'],
   ['/proverit-investici','#offer','#investment-submit','#investment-result']]){
   await page.goto(base+path);await page.locator(fill).fill(path==='/proverit-web'?'https://example.invalid/':path==='/proverit-smlouvu'?'Nájem bytu se automaticky prodlužuje o další rok, pokud jej nájemce písemně nevypoví nejpozději tři měsíce před koncem.':'Garantovaný výnos 30 % měsíčně bez rizika. Peníze pošlete ihned.');
   const consent=page.locator('#consent');if(await consent.count()&&await consent.isVisible())await consent.uncheck();
   await page.locator(submit).click();await page.locator(ready).waitFor({state:'visible'});
   const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,collisions:[...document.querySelectorAll('.result-heading,.character-heading,.contract-card-heading,.verdict-heading')].filter(e=>e.getBoundingClientRect().height).filter(e=>{const a=e.querySelector('img'),b=e.querySelector('h1,h2,h3');if(!a||!b)return false;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right>y.left+1&&x.left<y.right-1&&x.bottom>y.top+1&&x.top<y.bottom-1;}).map(e=>e.className)}));
   assert.equal(m.overflow,false,JSON.stringify({width,path,m}));assert.deepEqual(m.collisions,[],JSON.stringify({width,path,m}));
   if([390,1440].includes(width))await page.screenshot({path:`${out}/${path.slice(1)}-result-${width}.png`,fullPage:true});
  }
  await page.goto(base+'/proverit-pujcku');
  for(const [id,value]of [['amount','50000'],['count','24'],['payment','2600'],['fee','0'],['insurance','0'],['upfront','0']])await page.locator('#a-'+id).fill(value);
  await page.locator('#a-complete').check();await page.locator('#cost-submit').click();await page.locator('#cost-result').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Loan calculation overflow');
  if([390,1440].includes(width))await page.screenshot({path:`${out}/loan-cost-result-${width}.png`,fullPage:true});
  await page.close();
 }
 writeFileSync(out+'/report.json' ,JSON.stringify({pages:paths.length,widths:9,findings,calls},null,2));console.log(JSON.stringify({layouts:90,findings,firmFlows:3}));
 assert.deepEqual(findings,[],'Responsive layout failures');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
