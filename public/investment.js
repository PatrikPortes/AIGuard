// S4.5: page /proverit-investici. Wires the existing S4.1–S4.4 modules; no new orchestrator.
// The offer text stays in this browser: it is only passed to the local rules. The only
// request with user data is the existing /api/firm with {"ico"} (inside check-flow.js).
import {startInvestmentCheck,resetWebFirmCheck,isValidIco} from './check-flow.js';
import {evaluateInvestment,INVESTMENT_ACTIONS,MAX_OFFER_CHARS} from './investment-rules.js';
import {fromInvestment} from './investment-verdict.js';
import {checkWebUrl} from './web-checker.js';
import {coiResult} from './eshop-checker.js';

export const REGISTRY_FOUND_HEADLINE='Firma nalezena v registrech';
export const REGISTRY_FOUND_NOTE='Zápis firmy v registru nepotvrzuje oprávnění poskytovat investiční služby ani bezpečnost nabídky.';

// Investment page only: a clean firm sub-result (level none_found) is shown neutrally as
// "found in registers", never as a green safety signal. Presentation only: the CheckResult,
// /api/firm, the combined verdict and other pages are unchanged; findings are untouched
// because a none_found result has none.
export function presentRegistryNeutral(container,result){
 const rows=container.querySelectorAll('.check-step');
 result.plan.steps.forEach((step,i)=>{
  const outcome=result.outcomes[i];
  if(step.checker!=='firm'||outcome?.status!=='done'||outcome.result.level!=='none_found')return;
  const root=rows[i]?.querySelector('.check-detail .verdict-result[data-level="none_found"]');
  if(!root)return;
  root.dataset.presentation='registry-found';
  const headline=root.querySelector('.verdict-headline'),symbol=headline?.querySelector('.verdict-symbol');
  if(!headline||!symbol)return;
  symbol.textContent='⚪';
  headline.replaceChildren(symbol,container.ownerDocument.createTextNode(REGISTRY_FOUND_HEADLINE));
  const note=container.ownerDocument.createElement('p');note.className='verdict-limitation registry-found-note';note.textContent=REGISTRY_FOUND_NOTE;
  headline.closest('.verdict-heading')?.after(note);
 });
}

export function validateOfferInput(offer,ico){
 const text=typeof offer==='string'?offer.trim():'';
 if(!text)return 'Vložte text investiční nabídky. Nic jsme neodeslali.';
 if(text.length>MAX_OFFER_CHARS)return 'Text nabídky může mít nejvýše 20 000 znaků. Zkraťte ho prosím. Nic jsme neodeslali.';
 if(ico&&!isValidIco(ico))return 'IČO musí mít 8 číslic a platný kontrolní součet. Nic jsme neodeslali.';
 return null;
}

const EXAMPLES={
 guaranteed:'Garantovaný výnos 30 % ročně, investice je zcela bez rizika. Nabídka platí jen dnes, pošlete ihned 50 000 Kč na můj účet a neříkejte to bance.',
 platform:'Dobrý den, jsem váš osobní poradce. Na platformě https://crypto-profit.example/start vyděláte 2 % denně. Nainstalujte si AnyDesk, pomohu vám s vkladem v USDT.',
 fund:'Podílový fond spravuje investiční společnost. Minulé výnosy nejsou zárukou budoucích výnosů a hodnota investice může klesat i stoupat. IČO: 27082440.'
};

function renderChecklist(list){
 const doc=list.ownerDocument;
 list.replaceChildren(...Object.values(INVESTMENT_ACTIONS).map(action=>{
  const li=doc.createElement('li');li.append(doc.createTextNode(action.text));
  if(action.link){
   const a=doc.createElement('a');a.textContent=action.link.label;a.href=action.link.url;
   if(action.link.url.startsWith('https://')){a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}
   li.append(doc.createTextNode(' '),a);
  }
  return li;
 }));
}

if(typeof document!=='undefined'&&document.querySelector('#investment-form')){
 const form=document.querySelector('#investment-form'),offer=document.querySelector('#offer'),ico=document.querySelector('#offer-ico');
 const error=document.querySelector('#investment-error'),submit=document.querySelector('#investment-submit');
 const entry=document.querySelector('#investment-entry'),result=document.querySelector('#investment-result');
 const combined=document.querySelector('#check-combined'),checklist=document.querySelector('#investment-checklist');
 // The local ČOI copy is loaded only when a link from the offer is planned; no URL is sent.
 const coiData=()=>fetch('/eshop-coi.json',{cache:'no-store',credentials:'omit'}).then(r=>r.ok?r.json():null);
 let busy=false;
 renderChecklist(document.querySelector('#checklist'));
 // Disabled in HTML so nothing can be submitted without JavaScript (CR-08); enabled once wired.
 submit.disabled=false;
 const showError=message=>{error.textContent=message;error.hidden=false;};
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  error.hidden=true;
  const icoValue=ico.value.trim(),message=validateOfferInput(offer.value,icoValue);
  if(message){showError(message);(message.startsWith('IČO')?ico:offer).focus();return;}
  busy=true;submit.disabled=true;submit.setAttribute('aria-busy','true');
  entry.hidden=true;result.hidden=false;checklist.hidden=true;
  try{
   const outcome=await startInvestmentCheck(combined,{offer:offer.value,ico:icoValue||undefined,evaluateInvestment,fromInvestment,checkWebUrl,coiResult,coiData});
   if(outcome)presentRegistryNeutral(combined,outcome);
   checklist.hidden=false;
  }finally{busy=false;submit.disabled=false;submit.removeAttribute('aria-busy');}
 });
 document.querySelector('#investment-again').addEventListener('click',()=>{
  resetWebFirmCheck(combined);checklist.hidden=true;result.hidden=true;entry.hidden=false;
  offer.value='';ico.value='';error.hidden=true;offer.focus();
 });
 document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{
  offer.value=EXAMPLES[button.dataset.example];ico.value='';error.hidden=true;offer.focus();
 }));
}
