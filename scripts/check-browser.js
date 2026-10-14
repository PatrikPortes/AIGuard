// Isolated S3.5 fixture server. No production page/API changes or checker execution.
// CHECK_MANUAL=1 node scripts/check-browser.js keeps the fixture open for review.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createCheckResult} from '../public/verdict-model.js';
import {planCheck,createCombinedResult} from '../public/check-plan.js';
const at='2026-10-14T12:00:00Z';
const normalizeUrl=u=>({hostname:new URL(u).hostname,normalized:u});
function fixture(index){
 const levels=['serious','attention','none_found','incomplete','not_assessable'];
 const plan=index===6?planCheck({text:'IČO: 27082440',ico:'27082440'},{normalizeUrl}):index===7?planCheck({text:'https://a.example/ https://b.example/ https://c.example/ IČO: 27082440 IČO: 00006947'},{normalizeUrl}):planCheck({ico:'27082440'});
 const outcomes=plan.steps.map(step=>{
  if(index===6&&step.checker==='firm')return {stepId:step.id,status:'skipped',skipReason:'deadline',sourcesContacted:[],durationMs:4000,result:null};
  const level=levels[index]||'attention',checker=step.checker;
  const result=createCheckResult({checker,checkedAt:at,sources:[{id:'main',label:'Oficiální registr',status:level==='incomplete'?'unavailable':'checked',checkedAt:at},...(index===5?[{id:'dph',label:'Registr DPH',status:'unavailable',checkedAt:at}]:[])],policy:{primary:'main',required:index===5?['dph']:[],canConfirmAbsence:level!=='not_assessable'},actions:{primary:'Před platbou ověřte údaje protistrany jinou cestou.',secondary:[]},findings:['attention','serious'].includes(level)?[{id:'signal',ruleId:checker==='firm'?'F01':checker==='web'?'http':'urgency',origin:'rules',severity:level,title:'Varovný signál',explanation:'Ověřte uvedené údaje.',evidence:[]}]:[],facts:index===5?[{id:'input',label:'Neověřený vstup',value:'<img src=x onerror=alert(1)> '+ 'x'.repeat(250),kind:'user_input',source:'user'}]:[]});
  return {stepId:step.id,status:'done',sourcesContacted:[],durationMs:1,result};
 });
 return createCombinedResult({plan,outcomes,checkedAt:at},{normalizeUrl});
}
const allow=new Set(['check-view.js','check-plan.js','verdict-model.js','verdict-view.js','character-assets.js','verdict.css']);
const s=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'");
 try{
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orchestrátor – testovací výsledky</title><link rel="stylesheet" href="/verdict.css"><main id="result"></main><script type="module" src="/fixture.js?case='+Number(u.searchParams.get('case')||0)+'"></script></html>');}
  if(u.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end('import{renderCombinedResult,renderCheckProgress}from"/check-view.js";const c=document.querySelector("#result");renderCheckProgress(c);renderCombinedResult(c,'+JSON.stringify(fixture(Number(u.searchParams.get('case')||0)))+', {normalizeUrl:u=>({hostname:new URL(u).hostname,normalized:u})});');}
  const file=u.pathname.slice(1);
  if(!allow.has(file)&&!/^assets\/characters\/optimized\/verka-explaining\.[a-f0-9]+\.webp$/.test(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'text/javascript');res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 }catch{res.writeHead(500);res.end();}
});
await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;
if(process.env.CHECK_MANUAL){console.log('CHECK_FIXTURE '+base);await new Promise(()=>{});}
let browser;
try{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});const page=await browser.newPage();const external=[],errors=[];
 page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,375,390,430])for(let i=0;i<8;i++){
  await page.setViewportSize({width,height:568});await page.goto(base+'/?case='+i);await page.locator('.check-headline').waitFor();
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,focus:document.activeElement.className,actionBottom:document.querySelector('.verdict-primary').getBoundingClientRect().bottom,small:[...document.querySelectorAll('summary,a')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<48).length}));
  assert(!metrics.overflow);assert.equal(metrics.focus,'verdict-headline check-headline');assert(metrics.actionBottom<=568,'action below fold: '+width+'/'+i+' '+metrics.actionBottom);assert.equal(metrics.small,0);
  assert.equal(await page.locator('#result').getAttribute('aria-busy'),'false');assert.equal(await page.locator('[onerror],script:not([type=module])').count(),0);
  const row=page.locator('.check-step').first();await row.locator('summary').first().focus();await page.keyboard.press('Enter');await row.locator('.check-detail').waitFor({state:'visible'});assert(await row.evaluate(e=>e.open));
  assert((await row.innerText()).includes('Důvod spuštění:'));assert((await row.innerText()).includes('Zdroje:'));
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  if(i===5){assert((await row.innerText()).includes('<img src=x onerror=alert(1)>'));assert((await row.innerText()).includes('nedostupné, neověřeno'));}
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('PASS: 32 mobile scenarios (320/375/390/430 px), above-fold action, no overflow, focus, keyboard details, 48px targets, XSS and no external requests.');
}finally{await browser?.close();await new Promise(r=>s.close(r));}
