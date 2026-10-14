import {validateCheckResult,limitationFor} from './verdict-model.js';
import {characterAssets,characterAssetFiles} from './character-assets.js';
// Stage 8 (S8.4): static Věrka mood per verdict level, existing approved assets only.
// A success pose is never used for a result: "none found" is not a confirmation of safety.
const GUIDE=Object.freeze({
 serious:Object.freeze({name:'verka-warning',alt:'Věrka upozorňuje na varovné signály'}),
 attention:Object.freeze({name:'verka-explaining',alt:'Věrka vysvětluje výsledek'}),
 none_found:Object.freeze({name:'verka-thinking',alt:'Věrka přemýšlí nad výsledkem'}),
 incomplete:Object.freeze({name:'verka-thinking',alt:'Věrka přemýšlí nad výsledkem'}),
 not_assessable:Object.freeze({name:'verka-thinking',alt:'Věrka přemýšlí nad výsledkem'})
});
export function guideFor(level){
 const g=GUIDE[level];if(!g)throw Error('INVALID_GUIDE_LEVEL');
 const file=characterAssetFiles.find(f=>f.name===g.name);
 return {name:g.name,src:characterAssets[g.name],alt:g.alt,width:72,height:Math.round(72*file.height/file.width)};
}
export function applyGuide(img,level){const g=guideFor(level);img.src=g.src;img.alt=g.alt;img.width=g.width;img.height=g.height;img.dataset.mood=g.name;return img;}
const SYMBOL={serious:'🔴',attention:'🟠',none_found:'🟢',incomplete:'⚪',not_assessable:'⚪'};
const SOURCES={ARES:'ARES (Ministerstvo financí)',DPH:'Registr DPH',COI:'ČOI',user:'Uživatel',calc:'Výpočet'};
const STATUS={checked:'Kontrola proběhla',not_found:'Kontrola proběhla, záznam nenalezen',unavailable:'Nedostupné, neověřeno',skipped:'Kontrola neprovedena',not_applicable:'Pro tuto kontrolu nepoužito'};
export function renderVerdict(container,result,{focus=true}={}){
 validateCheckResult(result);if(!container?.ownerDocument)throw Error('A DOM container is required');const doc=container.ownerDocument;
 const el=(tag,text,className)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const root=el('article',undefined,'verdict-result');root.dataset.level=result.level;
 const section=(label,className)=>{const n=el('section',undefined,className);n.append(el('h3',label));root.append(n);return n;};
 const link=(label,url)=>{const n=el('a',label);n.href=url;n.target='_blank';n.rel='noopener noreferrer';n.referrerPolicy='no-referrer';return n;};
 const lead=el('section',undefined,'verdict-lead'),heading=el('div',undefined,'verdict-heading'),guide=applyGuide(el('img'),result.level);guide.className='verdict-guide';
 const h=el('h2',result.headline,'verdict-headline');h.tabIndex=-1;const symbol=el('span',SYMBOL[result.level],'verdict-symbol');symbol.setAttribute('aria-hidden','true');h.prepend(symbol);heading.append(guide,h);lead.append(heading);
 if(result.level==='none_found')lead.append(el('p',limitationFor(result.checker),'verdict-limitation'));
 const reasons=el('details',undefined,'verdict-reasons');reasons.append(el('summary','Proč tento výsledek?'));for(const r of result.reasons)reasons.append(el('p',r.text));lead.append(reasons);
 const now=el('section',undefined,'verdict-next');now.append(el('h3','Co udělat teď'),el('p',result.actions.primary,'verdict-primary'));if(result.actions.secondary.length){const more=el('details');more.append(el('summary','Další kroky'));for(const a of result.actions.secondary)more.append(el('p',a));now.append(more);}lead.append(now);root.append(lead);
 const why=section('Proč','verdict-why');
 const showFinding=(parent,f)=>{const item=el('details',undefined,'verdict-finding');item.append(el('summary',f.title),el('p',f.explanation),el('p',f.origin==='ai'?'Odhad AI – může se mýlit':f.origin==='registry'?'Podle uvedeného registru':'Zjištěno pravidly'));const evidence=el('details');evidence.append(el('summary','Proč to tvrdíme?'),el('p','Pravidlo: '+f.ruleId));for(const id of f.evidence){const fact=result.facts.find(x=>x.id===id);evidence.append(el('p',fact.label+': '+fact.value),el('p',SOURCES[fact.source]+(fact.observedAt?' · stav k '+fact.observedAt:' · uvedli jste vy, neověřovali jsme')));}if(!f.evidence.length)evidence.append(el('p','Indikátor z příslušné kontroly; nezávislé potvrzení nemáme.'));item.append(evidence);parent.append(item);};
 const ordered=result.findings.filter(f=>f.origin!=='ai').sort((a,b)=>({serious:0,attention:1,info:2}[a.severity]-{serious:0,attention:1,info:2}[b.severity]));
 for(const f of ordered.filter(f=>f.severity!=='info'))showFinding(why,f);
 if(!ordered.some(f=>f.severity!=='info'))why.append(el('p','V prověřené části nemáme konkrétní výrazný nález. Omezení kontroly najdete níže.'));
 const info=ordered.filter(f=>f.severity==='info');if(info.length){const details=el('details');details.append(el('summary','Další kontext'));info.forEach(f=>showFinding(details,f));why.append(details);}
 const verified=section('Ověřené údaje','verdict-facts');const registry=result.facts.filter(f=>f.kind==='registry');if(!registry.length)verified.append(el('p','Nemáme nezávisle ověřené údaje z registrů.'));for(const f of registry){verified.append(el('p',f.label+': '+f.value),el('p','Údaj z '+SOURCES[f.source]+' · stav k '+f.observedAt));if(f.sourceUrl)verified.append(link('Zdroj údaje',f.sourceUrl));}
 const calculated=result.facts.filter(f=>f.kind==='calculated');if(calculated.length){const calc=section('Výpočty ze zadaných údajů','verdict-calculations');for(const f of calculated)calc.append(el('p',f.label+': '+f.value));calc.append(el('p','Výpočet není nezávislým ověřením vstupů.'));}
 if(result.ai?.status==='performed'){const ai=section('Hodnocení AI','verdict-ai');ai.append(el('p','Odhad AI – může se mýlit'));result.findings.filter(f=>f.origin==='ai').forEach(f=>showFinding(ai,f));if(result.ai.summary)ai.append(el('p',result.ai.summary));}
 const unknown=section('Co jsme neověřili','verdict-unknowns');result.unknowns.forEach(s=>unknown.append(el('p',s)));result.facts.filter(f=>f.kind==='user_input').forEach(f=>unknown.append(el('p',f.label+': '+f.value),el('p','Uvedli jste vy, neověřovali jsme.')));
 const sources=section('Co jsme kontrolovali','verdict-sources');sources.append(el('p','Kontrola proběhla znamená dostupnost kontroly, nikoli potvrzení, že je vše v pořádku.'));for(const s of result.sources)sources.append(el('p',s.label+' — '+STATUS[s.status]+(s.checkedAt?' · '+s.checkedAt:'')),...(s.note?[el('p',s.note)]:[]));
 const links=section('Ověřte si','verdict-links');if(!result.verifyLinks.length)links.append(el('p','Použijte kontakt nebo oficiální aplikaci, kterou už znáte.'));result.verifyLinks.forEach(l=>links.append(link(l.label,l.url)));
 const status=el('p','Výsledek kontroly je připraven.','verdict-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
 container.replaceChildren(root);if(focus)h.focus({preventScroll:true});return root;
}
