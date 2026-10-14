export const COI_PAGE='https://coi.gov.cz/pro-spotrebitele/otevrena-data/rizikove-weby/';
export const COI_LICENSE='https://coi.gov.cz/pro-spotrebitele/otevrena-data/licence-otevrenych-dat/';
export function coiResult(host,data,now=Date.now()){
 const checked=new Date(now).toISOString(),fetched=Date.parse(data?.fetchedAt),age=now-fetched;
 const known=data?.records?.[host.toLowerCase().replace(/\.$/,'')];
 const valid=data?.schema===1&&data?.source==='https://coi.gov.cz/userdata/files/dokumenty-ke-stazeni/open-data/rizikove-seznam.csv'&&data.lastAttemptOk===true&&Number.isFinite(fetched)&&age>=-300000&&age<=48*3600000&&data.records&&Object.keys(data.records).length>=100&&Object.entries(data.records).every(([domain,reasons])=>domain.length<=253&&Array.isArray(reasons)&&reasons.length>0&&reasons.every(r=>typeof r==='string'&&r.length>0&&r.length<=4000));
 if(!valid)return{status:'NEOVĚŘENO',freshness:!Number.isFinite(fetched)?'nedostupná':data?.lastAttemptOk!==true?'nedostupná':'zastaralá',checked,fetchedAt:data?.fetchedAt||null,historicalMatch:Array.isArray(known)?known:null,reason:'Aktuálnost seznamu není potvrzena. Výsledek nelze použít k ujištění o bezpečnosti.'};
 return{status:Array.isArray(known)&&known.length?'VAROVÁNÍ':'BEZ ZNÁMÉHO NÁLEZU',freshness:'aktuální kopie',checked,fetchedAt:data.fetchedAt,reasons:Array.isArray(known)?known:[],sourceLastModified:data.sourceLastModified||null};
}
export function experienceLinks(host){const q=encodeURIComponent(host);return[
 ['Heureka.cz','https://www.google.com/search?q='+encodeURIComponent('site:obchody.heureka.cz '+host)],
 ['Zboží.cz','https://www.google.com/search?q='+encodeURIComponent('site:zbozi.cz '+host+' recenze')],
 ['Google recenze','https://www.google.com/search?q='+q+'+recenze'],
 ['Trustpilot','https://www.trustpilot.com/search?query='+q],
 ['VašeStížnosti.cz (dTest)','https://www.google.com/search?q='+encodeURIComponent('site:vasestiznosti.cz '+host)]];}
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function link(label,url){const a=text('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer nofollow';a.referrerPolicy='no-referrer';return a;}
export function renderEshop(host,data){
 const result=coiResult(host,data),target=document.querySelector('#eshop-coi');target.replaceChildren();
 const alert=document.querySelector('#eshop-alert');alert.hidden=result.status!=='VAROVÁNÍ';alert.replaceChildren();if(!alert.hidden)alert.append(text('strong','VAROVÁNÍ ČOI'),text('p','Česká obchodní inspekce tuto doménu uvádí v seznamu rizikových e-shopů. Před nákupem zvažte její varování; důvody a datum kontroly najdete níže.'),link('Otevřít seznam ČOI',COI_PAGE));
 target.dataset.status=result.status;target.append(text('h3','Seznam rizikových e-shopů ČOI'),text('strong',result.status),text('p','Data: '+result.freshness+'. Kontrola: '+new Date(result.checked).toLocaleString('cs-CZ')+'. Poslední úspěšná synchronizace: '+(result.fetchedAt?new Date(result.fetchedAt).toLocaleString('cs-CZ'):'není dostupná')+'.'));
 if(result.status==='VAROVÁNÍ'){target.append(text('p','ČOI tuto přesnou doménu uvádí ve svém seznamu. Před nákupem důkladně zvažte uvedené varování.'));for(const reason of result.reasons)target.append(text('p',reason));}
 else if(result.status==='BEZ ZNÁMÉHO NÁLEZU')target.append(text('p','Tuto přesnou doménu jsme v aktuální místní kopii nenašli. Neznamená to, že je obchod bezpečný. Subdomény ani podobné názvy nezaměňujeme.'));
 else{target.append(text('p',result.reason));if(result.historicalMatch)target.append(text('p','Ve starší kopii je záznam pro tuto doménu. Jeho současnou platnost neověřujeme; ověřte aktuální seznam přímo u ČOI.'));}
 target.append(link('Zdroj a podrobnosti: Česká obchodní inspekce',COI_PAGE),text('p','Seznam nemusí obsahovat všechny rizikové obchody. ČOI naši aplikaci nepodporuje ani nepotvrzuje její závěry.'),link('Podmínky použití dat ČOI',COI_LICENSE));
 const reviews=document.querySelector('#eshop-reviews');reviews.replaceChildren(text('h3','Zákaznické recenze a veřejné stížnosti'),text('strong','NEOVĚŘENO'),text('p','Hodnocení, počty recenzí ani stížností nemáme dostupné. Odkazy otevřete sami; na externí službu se předá pouze doména, nikoli cesta nebo parametry URL. Datum ověření těchto zdrojů: kontrola neproběhla.'));
 for(const [name,url]of experienceLinks(host))reviews.append(link('Vyhledat zkušenosti: '+name,url));
 reviews.append(text('p','Tvrzení zákazníka, reakce obchodníka, vyřešený spor a oficiální zjištění úřadu jsou odlišné informace. Stížnost sama nedokazuje podvod. Výsledky hledání nemusí patřit tomuto obchodu.'));
 const age=document.querySelector('#eshop-age');age.replaceChildren(text('h3','Stáří domény'),text('strong','NEOVĚŘENO'),text('p','Datum ověření: kontrola neproběhla. Zdroj pro ruční kontrolu: CZ.NIC nebo ICANN. Datum registrace jsme nezjišťovali. Stáří domény ani změny držitele nejsou samy důkazem důvěryhodnosti.'),link('Ruční ověření registrace domény',host.endsWith('.cz')?'https://www.nic.cz/whois/':'https://lookup.icann.org/en'));
}
let currentController,operatorController;
export function resetEshop(){currentController?.abort();operatorController?.abort();}
export async function startEshop(host){
 resetEshop();currentController=new AbortController();const signal=currentController.signal;
 document.querySelector('#operator-result').replaceChildren();document.querySelector('#operator-ico').value='';
 renderEshop(host,null);document.querySelector('#eshop-coi').append(text('p','Načítáme místní kopii seznamu ČOI…'));
 // Returns the one loaded local snapshot so the page can reuse it (no second fetch).
 try{const r=await fetch('/eshop-coi.json',{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]),cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('Unavailable');const data=await r.json();if(!signal.aborted)renderEshop(host,data);return data;}catch{if(!signal.aborted)renderEshop(host,null);return null;}
}
// Wires the Web page operator form only; elsewhere coiResult is imported as a pure function.
if(typeof document!=='undefined'&&document.querySelector('#operator-form')){
 document.querySelector('#operator-form').addEventListener('submit',async event=>{
  event.preventDefault();operatorController?.abort();operatorController=new AbortController();const signal=operatorController.signal,output=document.querySelector('#operator-result'),button=event.currentTarget.querySelector('button');output.replaceChildren(text('p','Ověřujeme IČO v ARES…'));button.disabled=true;
  try{const session=await fetch('/api/session',{signal});if(!session.ok)throw Error('Session unavailable');const r=await fetch('/api/eshop-operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ico:document.querySelector('#operator-ico').value}),signal:AbortSignal.any([signal,AbortSignal.timeout(7000)])});if(!r.ok)throw Error('Invalid or unavailable');const data=await r.json();if(signal.aborted)return;output.replaceChildren(text('strong','NEOVĚŘENO'),text('p',data.registryFinding),text('p',data.limitation),text('p','Zdroj: ARES. Datum kontroly: '+new Date(data.checkedAt).toLocaleString('cs-CZ')));if(data.entity){const e=data.entity;output.append(text('p','IČO: '+e.ico),text('p','Název: '+e.name),text('p','Sídlo: '+(e.address||'údaj nedostupný')),text('p','Právní forma – kód ARES: '+(e.legalFormCode||'údaj nedostupný')),text('p','Registrace – kódy uvedené ARES: '+Object.entries(e.registrations).map(([k,v])=>k+': '+v).join('; ')));}}
  catch{if(!signal.aborted)output.replaceChildren(text('strong','NEOVĚŘENO'),text('p','IČO je neplatné, byl dosažen limit, nebo ARES není dostupný. Provozovatele tohoto webu se nepodařilo jednoznačně ověřit. Použijte ruční kontrolu.'));}finally{button.disabled=false;}
 });
}
