// S5.3 browser regression: /proverit-smlouvu Contract → Firm (real page, rules-only contract check).
// Only the firm registry source is a synthetic fixture (no network).
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node scripts/contract-firm-browser.js
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
const posts=[];
server.on('request',req=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{if(req.method==='POST')posts.push({url:req.url,body:String(Buffer.concat(parts))});});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const MARK='Smluvní pokuta činí 0,5 % denně';
const BODY=' Předmětem smlouvy je dodávka zboží. '+MARK+' z dlužné částky. Podmínky jsou na https://abc.example/vop.';
const NONE='Kupní smlouva.'+BODY;
const ONE='Kupní smlouva. Prodávající: ABC s.r.o., IČO: 27082440.'+BODY;
const TWO='Kupní smlouva. Prodávající: ABC s.r.o., IČO: 27082440. Kupující: XYZ a.s., IČ 00006947.'+BODY;
const MANY='Smlouva. Strana 1 IČO 27082440, strana 2 IČO 00006947, ručitel IČ 25596641.'+BODY;
const BAD='Smlouva. Dodavatel IČO 27082441, odběratel IČO 00006947.'+BODY;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
let scenarios=0;
async function open(width,path='/proverit-smlouvu'){
 const page=await browser.newPage({viewport:{width,height:760}});
 const requests=[],errors=[];
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy/.test(m.text()))errors.push(m.text());});
 await page.goto(base+path,{waitUntil:'networkidle'});
 if(path==='/proverit-smlouvu')await page.locator('#contract-form button[type=submit]:not([disabled])').waitFor({timeout:8000});
 posts.length=0;requests.length=0;
 return {page,requests,errors};
}
async function checkContract(page,text){
 await page.locator('#contract-text').fill(text);await page.locator('#contract-form button[type=submit]').click();
 await page.locator('#contract-result').waitFor({state:'visible',timeout:8000});
 await page.locator('#contract-party').waitFor({state:'visible',timeout:8000});
}
const options=page=>page.locator('#contract-party-options label').allTextContents();
const combinedDone=page=>page.locator('#check-combined .check-headline').waitFor({state:'visible',timeout:9000});
const level=page=>page.locator('#check-combined .check-lead').getAttribute('data-level');
const openAll=page=>page.locator('#check-combined details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
const leaked=requests=>requests.some(r=>decodeURIComponent(r.url).includes(MARK)||r.body.includes(MARK)||r.body.includes('Kupní smlouva')||r.url.includes('abc.example'));
try{
 for(const width of [320,375,430]){
  // 1) Two IČO: party choice without pre-selection; user picks one → exactly one /api/firm {"ico"}.
  {mode='ok';const {page,requests,errors}=await open(width);
   await checkContract(page,TWO);
   const original=await page.locator('#contract-findings').innerText();const action=await page.locator('#contract-action').innerText();assert(action.trim());
   assert.match(await page.locator('#contract-party-intro').innerText(),/více IČO\. Nevíme, které patří které smluvní straně/);
   assert.deepEqual(await options(page),['IČO 00006947','IČO 27082440','Zadat IČO ručně']);
   assert.equal(await page.locator('#contract-party-options input:checked').count(),0,'no automatic party');
   assert.deepEqual(posts,[],'contract check stays in the browser (no AI configured)');
   // Submit without choosing → error, nothing sent.
   await page.locator('#contract-party-submit').click();
   assert.match(await page.locator('#contract-party-error').innerText(),/Vyberte firmu.*Nic jsme neodeslali\./);assert.deepEqual(posts,[]);
   await page.locator('#contract-party-options input[value="27082440"]').check();await page.locator('#contract-party-submit').click();
   await combinedDone(page);
   assert.equal(await page.locator('#contract-findings').innerText(),original,'original contract result preserved');
   const rows=(await page.locator('#check-combined .check-step-title').allTextContents()).map(t=>t.replace(/^[✓⚪]/,''));
   assert.deepEqual(rows,['Smlouva','Firma · IČO 27082440']);
   await openAll(page);
   const all=await page.locator('#check-combined').textContent();
   for(const t of ['Firma nalezena v registrech','Firma s tímto IČO existuje v registrech. Neověřuje to, že smlouvu uzavírá právě ona, ani obsah smlouvy.',
    'Firmu jste vybrali vy. Neověřili jsme, že smlouvu uzavírá právě tato firma. Kontrola firmy nenahrazuje právní posouzení smlouvy.',
    'Kontrola smlouvy ani firmy nenahrazuje právní posouzení.','Nejednoznačný údaj'])
    assert(all.includes(t),width+': missing '+t);
   assert.doesNotMatch(all,/🟢|Nenašli jsme výrazné varovné signály/);assert.notEqual(await level(page),'none_found');
   assert.deepEqual(posts.map(p=>p.url),['/api/firm']);assert.equal(posts[0].body,'{"ico":"27082440"}');
   assert(!leaked(requests),'contract text and links never sent');assert(!requests.some(r=>/\/api\/(check|analyze)/.test(r.url)));
   assert(requests.every(r=>r.url.startsWith(base)));
   const m=await page.evaluate(()=>{const a=document.querySelector('#contract-action').getBoundingClientRect(),c=document.querySelector('#check-combined').getBoundingClientRect();
    return{order:a.top<c.top,width:document.documentElement.scrollWidth,
     over:[...document.querySelectorAll('#contract-result *')].some(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+0.5),
     small:[...document.querySelectorAll('#check-combined summary,#contract-party-options label,#contract-party-submit,#contract-party-ico')].filter(e=>e.getBoundingClientRect().height<48).length};});
   assert.equal(m.order,true,'contract result above the combined result');assert.equal(m.width,width);assert.equal(m.over,false);assert.equal(m.small,0,'48px targets');
   assert.deepEqual(errors,[]);await page.close();scenarios++;}
  // 2) Manual IČO with an invalid checksum: error, focus on the field, nothing sent.
  {mode='ok';const {page,requests}=await open(width);await checkContract(page,NONE);
   assert.match(await page.locator('#contract-party-intro').innerText(),/nenašli platné IČO/);assert.deepEqual(await options(page),['Zadat IČO ručně']);
   await page.locator('#contract-party-ico').fill('27082441');
   assert.equal(await page.locator('#contract-party-options input[value="manual"]').isChecked(),true,'typing selects manual entry');
   await page.locator('#contract-party-submit').click();
   assert.match(await page.locator('#contract-party-error').innerText(),/platný kontrolní součet\. Nic jsme neodeslali\./);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'contract-party-ico');
   assert.deepEqual(posts,[]);assert(!requests.some(r=>r.url.includes('/api/')));await page.close();scenarios++;}
 }
 // 3) Contract without IČO and no choice: the contract check works as before, no request at all.
 {mode='ok';const {page,requests}=await open(375);await checkContract(page,NONE);await page.waitForTimeout(300);
  assert.equal(await page.locator('#check-combined').isHidden(),true);assert.deepEqual(posts,[]);
  assert(!requests.some(r=>r.url.includes('/api/')));await page.close();scenarios++;}
 // 4) One IČO: offered, not pre-selected; keyboard only (Tab/Space/Enter) runs the check.
 {mode='ok';const {page}=await open(375);await checkContract(page,ONE);
  assert.match(await page.locator('#contract-party-intro').innerText(),/jedno IČO\. Nevíme, které smluvní straně patří/);
  assert.deepEqual(await options(page),['IČO 27082440','Zadat IČO ručně']);assert.equal(await page.locator('#contract-party-options input:checked').count(),0);
  await page.locator('#contract-party-options input').first().focus();await page.keyboard.press('Space');
  await page.locator('#contract-party-submit').focus();await page.keyboard.press('Enter');await combinedDone(page);
  assert.deepEqual(posts.map(p=>p.url+' '+p.body),['/api/firm {"ico":"27082440"}']);
  assert.equal(await page.evaluate(()=>document.querySelector('#check-combined').contains(document.activeElement)),true,'focus moves to the combined result');
  await page.close();scenarios++;}
 // 5) Many IČO + manual override: the manual number is checked, every contract IČO stays ambiguous.
 {mode='ok';const {page}=await open(375);await checkContract(page,MANY);
  assert.deepEqual(await options(page),['IČO 00006947','IČO 25596641','IČO 27082440','Zadat IČO ručně']);
  await page.locator('#contract-party-options input[value="manual"]').check();await page.locator('#contract-party-ico').fill('45274649');
  await page.locator('#contract-party-submit').click();await combinedDone(page);
  assert.deepEqual(posts.map(p=>p.body),['{"ico":"45274649"}']);
  assert.equal((await page.locator('#check-combined .check-omitted').textContent()).match(/Nejednoznačný údaj/g).length,3);await page.close();scenarios++;}
 // 6) Invalid IČO in the contract: shown as invalid, not offered; manual confirmation required.
 {mode='ok';const {page}=await open(375);await checkContract(page,BAD);
  assert.match(await page.locator('#contract-party-invalid').innerText(),/27082441 u označení IČO nemá platný kontrolní součet/);
  assert.deepEqual(await options(page),['IČO 00006947','Zadat IČO ručně']);assert.deepEqual(posts,[]);await page.close();scenarios++;}
 // 7) Firm unavailable: attention, never green; contract result stays.
 {mode='down';const {page}=await open(375);await checkContract(page,ONE);
  await page.locator('#contract-party-options input[value="27082440"]').check();await page.locator('#contract-party-submit').click();await combinedDone(page);
  assert.match(await page.locator('#check-combined .check-steps').textContent(),/Nedokončeno/);assert.equal(await level(page),'attention');
  assert(await page.locator('#contract-findings').isVisible());await page.close();scenarios++;}
 // 8) Risky (dissolved) firm wins the aggregate; re-check replaces (≤1 /api/firm per check).
 {mode='dissolved';const {page}=await open(375);await checkContract(page,ONE);
  await page.locator('#contract-party-options input[value="27082440"]').check();await page.locator('#contract-party-submit').click();await combinedDone(page);
  assert.equal(await level(page),'serious');assert.equal(posts.filter(p=>p.url==='/api/firm').length,1);
  // "Prověřit další smlouvu" clears the party UI and the combined result.
  await page.locator('#contract-again').click();
  assert.equal(await page.locator('#check-combined').isHidden(),true);assert.equal(await page.locator('#contract-party-options label').count(),0);
  await page.close();scenarios++;}
 // 9) Regression: loan page keeps its own neutral firm; message page keeps the original firm detail.
 {mode='ok';const {page}=await open(375,'/overit-zpravu');await page.locator('#submit:not([disabled])').waitFor();
  await page.locator('#content').fill('Faktura od dodavatele, IČO: 27082440, zaplaťte dnes.');await page.locator('#submit').click();
  await page.locator('#result').waitFor({state:'visible'});await combinedDone(page);await openAll(page);
  const t=await page.locator('#check-combined').textContent();
  assert(t.includes('Nenašli jsme výrazné varovné signály'),'message page firm detail unchanged');assert(!/smlouvu uzavírá/.test(t));
  await page.close();scenarios++;}
 console.log(`Contract → Firm browser: PASS (${scenarios} scenarios at 320/375/430 px; contract result kept, no automatic party, 0/1/2/3 IČO, manual and invalid IČO send nothing, ≤1 /api/firm {"ico"}, text never sent, neutral firm A/B/C, outage, risky firm, keyboard, message page unchanged)`);
}finally{await browser.close();server.close();}
