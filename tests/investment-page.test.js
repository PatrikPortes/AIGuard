// Stage 4 S4.5: /proverit-investici page, route, assets and static boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from '../src/server.js';
import {validateOfferInput,REGISTRY_FOUND_HEADLINE,REGISTRY_FOUND_NOTE} from '../public/investment.js';
import {isSafeCopy} from '../public/verdict-model.js';

const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
async function withServer(fn){
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}
}

test('route and assets are served with the existing CSP; no new API endpoint', async () => {
 await withServer(async base=>{
  const web=await fetch(base+'/proverit-web'),page=await fetch(base+'/proverit-investici');
  assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/^text\/html/);
  assert.equal(page.headers.get('content-security-policy'),web.headers.get('content-security-policy'),'same CSP as the Web checker page');
  assert.match(await page.text(),/<h1 id="hero-title">Prověřit investici<\/h1>/);
  for(const asset of ['/investment.js','/investment-rules.js','/investment-verdict.js']){
   const r=await fetch(base+asset);assert.equal(r.status,200,asset);assert.match(r.headers.get('content-type'),/^text\/javascript/,asset);
  }
  for(const [method,path] of [['POST','/api/investment'],['GET','/api/investment'],['POST','/proverit-investici']]){
   const r=await fetch(base+path,{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
   assert(r.status>=400&&r.status<500,method+' '+path+' → '+r.status);
  }
 });
});

test('form: offer 1–20 000 characters and optional IČO, without names or action (nothing is ever submitted natively)', () => {
 const html=read('investment.html');
 assert.match(html,/<textarea id="offer"[^>]*maxlength="20000"[^>]*required/);
 assert.match(html,/<input id="offer-ico"[^>]*inputmode="numeric"[^>]*maxlength="8"/);
 assert.match(html,/<form id="investment-form" novalidate>/);
 assert.doesNotMatch(html,/<form[^>]*(?:action|method)=/);
 assert.doesNotMatch(html,/<(?:textarea|input)[^>]*\sname=/,'no named fields: a no-JS submit carries no data');
 assert.match(html,/Text nabídky zůstane ve vašem prohlížeči/);
 assert.match(html,/Jde o orientační kontrolu rizikových tvrzení v textu\. Nehodnotíme výnosnost ani vhodnost investice a nedáváme investiční doporučení\./);
 assert.match(html,/<noscript>/);
 assert.match(html,/<button id="investment-submit" type="submit" disabled>/,'CR-08: submit disabled until JavaScript runs');
 assert.match(html,/verka|robo-default/);
 assert.match(html,/<link rel="stylesheet" href="\/style.css">\s*<link rel="stylesheet" href="\/verdict.css">/);
 assert.doesNotMatch(html,/<script(?![^>]*src="\/investment.js")/,'only the module script, no inline script');
});

test('validation messages', () => {
 assert.equal(validateOfferInput('Nabídka',''),null);
 assert.equal(validateOfferInput('Nabídka','27082440'),null);
 assert.match(validateOfferInput('   ',''),/Vložte text investiční nabídky\. Nic jsme neodeslali\./);
 assert.match(validateOfferInput('x'.repeat(20001),''),/nejvýše 20 000 znaků/);
 assert.equal(validateOfferInput('  '+'x'.repeat(20000)+'  ',''),null);
 assert.match(validateOfferInput('Nabídka','27082441'),/IČO musí mít 8 číslic/);
 assert.match(validateOfferInput('Nabídka','1234'),/IČO musí mít 8 číslic/);
 for(const t of [REGISTRY_FOUND_HEADLINE,REGISTRY_FOUND_NOTE])assert(isSafeCopy(t),t);
 assert.equal(REGISTRY_FOUND_HEADLINE,'Firma nalezena v registrech');
 assert.equal(REGISTRY_FOUND_NOTE,'Zápis firmy v registru nepotvrzuje oprávnění poskytovat investiční služby ani bezpečnost nabídky.');
});

test('page script: existing modules only, no orchestrator, the only own request is the local ČOI copy', () => {
 const src=read('investment.js');
 assert.deepEqual([...src.matchAll(/^import[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]),['./check-flow.js','./investment-rules.js','./investment-verdict.js','./web-checker.js','./eshop-checker.js']);
 assert.deepEqual([...src.matchAll(/\bfetch\s*\(\s*'([^']+)'/g)].map(m=>m[1]),['/eshop-coi.json']);
 assert.doesNotMatch(src,/'\/api\/|innerHTML|insertAdjacentHTML|outerHTML|document\.write|sendBeacon|localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket/);
 assert.match(src,/startInvestmentCheck\(combined,\{offer:offer\.value,ico:icoValue\|\|undefined,evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData\}\)/);
});

test('neutral clean-firm presentation is scoped to the investment page (CSS attribute rule only)', () => {
 const css=read('verdict.css');
 assert.match(css,/\.verdict-result\[data-level=none_found\]\[data-presentation=registry-found\] \.verdict-lead\{background:#f4f5f9;border-color:#657089\}/);
 for(const f of ['verdict-view.js','check-view.js','check-flow.js','web-checker.js','web.html','firm.js'])assert.doesNotMatch(read(f),/registry-found|data-presentation|Firma nalezena v registrech/,f);
});

test('D5: homepage card stays "Již brzy" and the page is not in the sitemap yet (public launch is S4.7)', () => {
 const home=read('index.html');
 assert.match(home,/<article class="choice-card coming-soon"><span class="feature-status">Již brzy<\/span><h3>Prověřit investici<\/h3>/);
 assert.doesNotMatch(home,/proverit-investici/);
 assert.doesNotMatch(read('sitemap.xml'),/proverit-investici/);
});

test('S4.6 regression: the IČO field reuses the existing #sender field style (48px, full width, focus ring)', () => {
 const css=read('style.css');
 assert.match(css,/#sender,#offer-ico\{box-sizing:border-box;width:100%;min-height:48px;/);
 assert.match(css,/#sender:focus-visible,#offer-ico:focus-visible\{outline:3px solid var\(--brand-action\);outline-offset:3px\}/);
});
