import {validateCombinedResult} from './check-plan.js';
import {renderVerdict} from './verdict-view.js';
import {characterAssets} from './character-assets.js';
const SYMBOL={serious:'🔴',attention:'🟠',none_found:'🟢',incomplete:'⚪',not_assessable:'⚪'};
const CHECKER={message:'Zpráva',web:'Web',firm:'Firma',loan:'Půjčka',contract:'Smlouva'};
const SOURCE={ARES:'ARES',ARES_VR:'Veřejný rejstřík přes ARES',ARES_RES:'RES přes ARES',DPH:'Registr DPH',COI:'Místní kopie seznamu ČOI',none:'Pravidla bez externího zdroje'};
const SOURCE_STATUS={checked:'kontrola proběhla',not_found:'kontrola proběhla, záznam nenalezen',unavailable:'nedostupné, neověřeno',skipped:'neprovedeno',not_applicable:'nevztahuje se'};
const SKIP={rate_limited:'Vyčerpán limit služby.',deadline:'Vypršel čas pro kontrolu.',duplicate:'Duplicitní kontrola.',budget:'Kontrola přesahuje rozpočet plánu.'};
const OMIT={limit:'Přesahuje limit plánu.',ambiguous:'Nejednoznačný údaj; nebyl vybrán subjekt.',duplicate:'Stejný údaj už je v plánu.',invalid:'Neplatný údaj.'};
function dom(container){
 if(!container?.ownerDocument)throw Error('A DOM container is required');
 const doc=container.ownerDocument;
 return (tag,text,className)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
}
export function renderCheckProgress(container){
 const el=dom(container),status=el('p','Prověřujeme zadané údaje…','check-progress');status.setAttribute('role','status');status.setAttribute('aria-live','polite');container.setAttribute('aria-busy','true');container.replaceChildren(status);return status;
}
// Presentation only. URL normalization is supplied by the integrating page;
// validation does not execute a checker or contact a source.
export function renderCombinedResult(container,result,{normalizeUrl,focus=true}={}){
 validateCombinedResult(result,{normalizeUrl});const el=dom(container);
 const root=el('article',undefined,'check-result');root.setAttribute('aria-label','Výsledek společného prověření');
 const lead=el('div',undefined,'verdict-result check-lead');lead.dataset.level=result.aggregate.level;
 const card=el('section',undefined,'verdict-lead'),heading=el('div',undefined,'verdict-heading');
 const guide=el('img',undefined,'verdict-guide');guide.src=characterAssets['verka-explaining'];guide.alt='Věrka vysvětluje výsledek';guide.width=72;guide.height=66;
 const h=el('h2',result.aggregate.headline,'verdict-headline check-headline');h.tabIndex=-1;
 const symbol=el('span',SYMBOL[result.aggregate.level],'verdict-symbol');symbol.setAttribute('aria-hidden','true');h.prepend(symbol);heading.append(guide,h);card.append(heading);
 card.append(el('p',result.aggregate.reasons[0].text,'check-explanation'));
 const action=el('section',undefined,'verdict-next');action.append(el('h3','Co udělat teď'));
 action.append(el('p',result.aggregate.actions.primary??'Z dokončených kontrol nemáme k dispozici další krok.','verdict-primary'));
 if(result.aggregate.actions.secondary.length){const more=el('details');more.append(el('summary','Další kroky'));result.aggregate.actions.secondary.forEach(s=>more.append(el('p',s)));action.append(more);}card.append(action);
 const reasons=el('details',undefined,'verdict-reasons');reasons.append(el('summary','Proč tento výsledek?'));for(const r of result.aggregate.reasons)reasons.append(el('p',r.text+(r.stepId?' · '+CHECKER[result.plan.steps.find(s=>s.id===r.stepId).checker]:'')));card.append(reasons);
 lead.append(card);root.append(lead,el('p','Datum kontroly: '+result.checkedAt,'check-date'));
 const checks=el('section',undefined,'check-steps');checks.append(el('h3','Co jsme prověřili'),el('p','Kontrola proběhla neznamená, že je vše v pořádku. Nedostupný zdroj zůstává neověřený.','check-note'));
 for(const step of result.plan.steps){
  const outcome=result.outcomes.find(o=>o.stepId===step.id),done=outcome.status==='done';
  const complete=done&&outcome.result.level!=='incomplete'&&!outcome.result.sources.some(s=>['unavailable','skipped'].includes(s.status));
  const row=el('details',undefined,'check-step');row.dataset.status=outcome.status;
  const title=CHECKER[step.checker]+(step.checker==='web'?' · '+new URL(step.input.ref).hostname:step.checker==='firm'?' · IČO '+step.input.ref:'');
  const summary=el('summary'),name=el('span',title,'check-step-title'),symbol=el('span',complete?'✓':'⚪','check-step-symbol');symbol.setAttribute('aria-hidden','true');name.prepend(symbol);
  const state=!done?outcome.status==='skipped'?'Přeskočeno':'Nedokončeno':outcome.result.level==='incomplete'?'Kontrola se nepodařila dokončit':outcome.result.sources.some(s=>['unavailable','skipped'].includes(s.status))?'Výsledek s neověřenými zdroji':'Kontrola proběhla';
  summary.append(name,el('span',state,'check-step-state'),el('span','Důvod spuštění: '+step.reason.text,'check-step-reason'));
  const sources=done?outcome.result.sources.map(s=>s.label+' — '+SOURCE_STATUS[s.status]).join('; '):'Výsledek zdrojů není k dispozici.';
  summary.append(el('span','Zdroje: '+(sources||'Žádné uvedené zdroje.'),'check-step-sources'),el('span','Podrobnosti kontroly ▾','check-detail-label'));row.append(summary);
  if(!done)row.append(el('p',outcome.status==='skipped'?SKIP[outcome.skipReason]:'Kontrola nevrátila platný dokončený výsledek.'));
  if(outcome.sourcesContacted.length)row.append(el('p','Zdroje vykázané kontrolou: '+outcome.sourcesContacted.map(s=>SOURCE[s]).join(', ')));
  else row.append(el('p','Přesné kontakty se zdroji kontrola nevykázala. Neodvozujeme je z výsledku ani z cache.'));
  if(step.reason.ruleId==='P5')row.append(el('p','Neověřili jsme, že zprávu poslala tato firma.'));
  if(done){const detail=el('div',undefined,'check-detail');renderVerdict(detail,outcome.result,{focus:false});row.append(detail);}checks.append(row);
 }
 if(result.plan.notPlanned.length){const omitted=el('section',undefined,'check-omitted');omitted.append(el('h3','Co jsme neprověřili'));for(const n of result.plan.notPlanned)omitted.append(el('p',(n.kind==='ico'?'IČO':'Odkaz')+(n.value?' · '+n.value:'')+' — '+OMIT[n.reason]));checks.append(omitted);}
 root.append(checks);const status=el('p','Výsledek společného prověření je připraven.','verdict-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
 container.replaceChildren(root);container.setAttribute('aria-busy','false');if(focus)h.focus({preventScroll:true});return root;
}
