// Presentation adapters only: existing checker objects are never mutated or re-analysed.
import {createCheckResult,RULE_CATALOG,isSafeCopy} from './verdict-model.js';
import {SIGNAL_COPY,MESSAGE_ACTIONS,LEGACY_RULE_CONTRIBUTIONS} from './verdict-catalog.js';
import {DEFINITIONS} from './contract-core.js';
const at=opts=>opts?.checkedAt||new Date().toISOString();
const source=(id,label,status,checkedAt)=>({id,label,status,checkedAt});
const finding=(id,origin,severity,copy,ruleId=id,evidence=[])=>({id,ruleId,origin,severity,...copy,evidence});
const severeRules=new Set(['credentials','family_cash_pickup','safe_account_transfer','loan_advance_fee','loan_bank_login','loan_sms_code','loan_card_details','loan_remote_access']);
function message(a,checker,opts={}){
 if(!a||!Array.isArray(a.signals)||a.signals.length>100||!['unassessed','caution','high','very_high'].includes(a.risk_level))throw Error('No completed message analysis');
 const checkedAt=at(opts),findings=[],unknowns=[checker==='loan'?'Poskytovatele ani jeho oprávnění od ČNB jsme neověřili.':'Totožnost odesílatele ani pravdivost tvrzení jsme neověřili.','Odkazy ani jejich obsah jsme neotevírali.'];let primaryStatus='checked';
 const aiPerformed=a.ai_status==='performed'||a.engine==='rules+ai-v1';
 for(const s of a.signals){
  if(!s||!RULE_CATALOG[checker].includes(s.id)||!SIGNAL_COPY[s.id]){primaryStatus='skipped';continue;}
  if((s.source!==undefined&&!['rules','ai'].includes(s.source))||(s.id.startsWith('ai_')&&s.source==='rules')){primaryStatus='skipped';continue;}
  const origin=s.source==='rules'?'rules':s.source==='ai'?'ai':a.engine==='rules-v1'&&!s.id.startsWith('ai_')?'rules':'ai';
  const severity=origin==='rules'&&severeRules.has(s.id)?'serious':'attention';
  if(!findings.some(f=>f.id===s.id))findings.push(finding(s.id,origin,severity,SIGNAL_COPY[s.id]));
 }
 // A mixed aggregate may be raised by AI. Recover only its existing rules floor
 // from the fixed contribution metadata of baseline 5c91de2, never from AI or risk_score.
 // Preserve a separately supplied rules baseline when the integration has one; otherwise
 // only existing rules can support red. Never promote AI's aggregate.
 if(opts.rulesBaseline){const baseline=message(opts.rulesBaseline,checker,{checkedAt});for(const f of baseline.findings.filter(f=>f.origin==='rules'))if(!findings.some(x=>x.id===f.id))findings.push(f);}
 else if(a.input_type!=='url'&&(findings.filter(f=>f.origin==='rules').reduce((sum,f)=>sum+(LEGACY_RULE_CONTRIBUTIONS[f.ruleId]||0),0)>=60||['high','very_high'].includes(a.risk_level)&&!aiPerformed&&a.engine==='rules-v1'))findings.push(finding('risk_high','rules','serious',{title:'Výrazné signály pravidlové kontroly',explanation:'Pravidlové vyhodnocení ukazuje výrazné varovné signály.'}));
 else if(a.risk_level==='caution'||['high','very_high'].includes(a.risk_level)&&aiPerformed&&!findings.some(f=>f.severity==='serious'))findings.push(finding('risk_caution',aiPerformed?'ai':'rules','attention',{title:'Podněty k dalšímu ověření',explanation:'Výsledek vyžaduje další ověření; původ případného zvýšení úrovně nelze oddělit.'}));
 const supplied=a.recommended_actions;
 const actions=Array.isArray(supplied)&&supplied.length>0&&supplied.every(s=>MESSAGE_ACTIONS.includes(s)&&isSafeCopy(s))?{primary:supplied[0],secondary:supplied.slice(1)}:undefined;
 if(!actions)unknowns.push('Doporučené kroky nebylo možné převzít; používáme obecný postup ověření.');
 return createCheckResult({checker,findings,sources:[source('message_rules','Textová pravidla',primaryStatus,checkedAt)],policy:{primary:'message_rules',required:[],canConfirmAbsence:false},actions,unknowns,ai:{status:aiPerformed?'performed':a.ai_fallback_reason&&!['declined','consent_declined'].includes(a.ai_fallback_reason)?'unavailable':'not_performed'},checkedAt,
 verifyLinks:checker==='loan'?[{label:'ČNB – seznamy poskytovatelů',url:'https://www.cnb.cz/cs/dohled-financni-trh/seznamy/'}]:[]});
}
export function fromMessage(a,opts){return message(a,'message',opts);}
export function fromLoan(a,calc,opts){const r=message(a,'loan',opts);if(calc){for(const [id,label]of [['total','Celkové platby podle zadaných údajů'],['overpayment','Náklady nad vyplacenou částku'],['monthly','Běžná měsíční platba']]){if(!Number.isSafeInteger(calc[id])||calc[id]<0)throw Error('Invalid calculation');r.facts.push({id:'calc_'+id,label,value:new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK'}).format(calc[id]/100),kind:'calculated',source:'calc'});}r.unknowns.push('Výpočty vycházejí ze zadaných plateb. Neověřují vhodnost půjčky ani nezadané náklady.');}return r;}
const WEB_COPY={http:['Adresa nepoužívá HTTPS','Přenos nemusí být šifrovaný.'],idn:['Mezinárodní zápis domény','Zápis může ztížit porovnání domény.'],numeric:['Číselná nebo místní adresa','Cíl ani dostupnost neověřujeme.'],'trailing-dot':['Koncová tečka domény','Ověřte přesný zápis adresy.'],subdomains:['Více úrovní subdomén','Ověřte hlavní doménu.'],port:['Neobvyklý port','Ověřte, zda jej služba používá.'],brand:['Podobnost se známou značkou','Podobnost názvu neprokazuje totožnost.'],encoded:['Zakódované oddělovače','Adresa se obtížněji čte.'],redirect:['Parametr možného přesměrování','Konečný cíl jsme nezjišťovali.'],phishing:['Napodobování značky spojené s přihlášením','Adresa kombinuje existující signály napodobování a přihlášení.']};
export function fromWeb(urlResult,coi,ares,opts={}){
 const checkedAt=at(opts),findings=[],facts=[],sources=[],unknowns=['Web jsme nenavštívili; jeho obsah a totožnost provozovatele neověřujeme.'],required=[];
 const complete=urlResult?.status==='unverified'&&typeof urlResult.hostname==='string'&&Array.isArray(urlResult.signals);
 sources.push(source('url_rules','Struktura URL',complete?'checked':'unavailable',checkedAt));
 if(complete)for(const s of urlResult.signals){const ruleId=s.id?.startsWith('brand-')?'brand':s.id,copy=WEB_COPY[ruleId];if(!copy){sources[0].status='skipped';continue;}if(!findings.some(f=>f.id===ruleId))findings.push(finding(ruleId,'rules',ruleId==='phishing'?'serious':'attention',{title:copy[0],explanation:copy[1]}));}
 if(coi!==undefined){required.push('coi');const current=coi?.freshness==='aktuální kopie'&&['VAROVÁNÍ','BEZ ZNÁMÉHO NÁLEZU'].includes(coi.status)&&typeof coi.checked==='string'&&Number.isFinite(Date.parse(coi.checked));sources.push(source('coi','Seznam rizikových e-shopů ČOI',current?'checked':'unavailable',current?new Date(coi.checked).toISOString():checkedAt));
  if(current){facts.push({id:'coi_status',kind:'registry',source:'COI',label:'Výsledek kontroly seznamu ČOI',value:coi.status==='VAROVÁNÍ'?'Přesná doména je uvedena v načteném seznamu ČOI.':'Přesná doména není uvedena v načteném seznamu ČOI.',observedAt:new Date(coi.checked).toISOString(),sourceUrl:'https://coi.gov.cz/pro-spotrebitele/otevrena-data/rizikove-weby/'});if(coi.status==='VAROVÁNÍ')findings.push(finding('coi_warning','registry','serious',{title:'ČOI uvádí tuto doménu v seznamu',explanation:'Před nákupem si přečtěte aktuální varování ČOI.'},'coi_warning',['coi_status']));}
  unknowns.push('Absence v seznamu ČOI není zárukou nákupu bez rizika.');
 }
 if(ares!==undefined){const entity=ares?.entity;const verified=typeof entity?.ico==='string'&&/^\d{8}$/.test(entity.ico)&&typeof entity.name==='string'&&typeof ares.checkedAt==='string'&&Number.isFinite(Date.parse(ares.checkedAt));sources.push(source('ares','ARES – existence subjektu',verified?'checked':'unavailable',verified?new Date(ares.checkedAt).toISOString():checkedAt));if(verified){facts.push({id:'ares_ico',label:'IČO uvedené v ARES',value:entity.ico,kind:'registry',source:'ARES',observedAt:new Date(ares.checkedAt).toISOString(),sourceUrl:'https://ares.gov.cz/ekonomicke-subjekty?ico='+entity.ico});facts.push({id:'ares_name',label:'Název v ARES',value:entity.name,kind:'registry',source:'ARES',observedAt:new Date(ares.checkedAt).toISOString()});}unknowns.push('IČO zadal uživatel. Vztah firmy a domény se nepodařilo jednoznačně ověřit.');}
 const serious=findings.some(f=>f.severity==='serious');return createCheckResult({checker:'web',findings,facts,sources,policy:{primary:'url_rules',required,canConfirmAbsence:false},actions:{primary:serious?'Před platbou nebo zadáním údajů ověřte web jinou cestou.':'Před nákupem ověřte provozovatele a zkušenosti zákazníků.',secondary:[]},unknowns,verifyLinks:[{label:'Aktuální seznam ČOI',url:'https://coi.gov.cz/pro-spotrebitele/otevrena-data/rizikove-weby/'}],checkedAt});
}
export function fromContract(result,opts={}){
 const checkedAt=at(opts),findings=[],facts=[];let valid=Array.isArray(result?.findings)&&result.findings.length<=100;
 if(valid)for(const f of result.findings){const definition=DEFINITIONS[f.category];if(!['rules','rules+ai','ai'].includes(f.source)||!definition||!['common','potentially_unfavourable','ambiguous','possible_conflict'].includes(f.classification)){valid=false;continue;}const origin=f.source==='ai'?'ai':'rules';const evidence=[];
  if(typeof f.quote==='string'&&f.quote.length<=600&&isSafeCopy(f.quote)){const id='quote_'+facts.length;facts.push({id,label:'Doslovná citace vloženého textu',value:f.quote,kind:'user_input',source:'user'});evidence.push(id);}
  findings.push(finding('contract_'+findings.length,origin,f.classification==='common'?'info':'attention',{title:definition.title,explanation:definition.explanation},f.category,evidence));
 }
 const top=findings.find(f=>f.severity==='attention'),actions=top?{primary:DEFINITIONS[top.ruleId].questions[0],secondary:DEFINITIONS[top.ruleId].questions.slice(1)}:undefined;
 return createCheckResult({checker:'contract',findings,facts,sources:[source('contract_rules','Pravidla pro text smlouvy',valid?'checked':'unavailable',checkedAt)],policy:{primary:'contract_rules',required:[],canConfirmAbsence:false},actions,unknowns:['Kontrola nenahrazuje právní posouzení. Neověřujeme platnost smlouvy ani druhou stranu.'],ai:{status:result?.mode==='rules+ai'?'performed':result?.mode==='rules_fallback'?'unavailable':'not_performed'},checkedAt});
}
