import {startEshop,resetEshop}from'./eshop-checker.js';
import {brandReferences} from './brand-references.js';
// Pure structural analysis. No fetch, DNS, AI, storage or navigation to user URLs.
export function checkWebUrl(value){
 if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f]/u.test(value.trim())||/%(?![a-f0-9]{2})/i.test(value)||value.includes('\\'))throw Error('Vložte platnou URL bez mezer, nejvýše 2 048 znaků.');
 const raw=value.trim();if(!raw)throw Error('Vložte adresu webu.');
 const full=/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw;
 let url;try{url=new URL(full);}catch{throw Error('Adresu nelze přečíst. Zadejte například https://obchod.cz.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw Error('Podporujeme pouze HTTP(S) adresy bez vložených přihlašovacích údajů.');
 const host=url.hostname.toLowerCase(),signals=[];
 const domain=host.replace(/\.$/,'');
 if(!host.startsWith('[')&&domain.split('.').some(label=>!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.test(label)))throw Error('Doména nemá platný zápis.');
 const add=(id,title,explanation)=>signals.push({id,title,explanation});
 if(url.protocol==='http:')add('http','Adresa nepoužívá HTTPS','Přenos nemusí být šifrovaný. Ani HTTPS ale nepotvrzuje pravost webu.');
 if(host.includes('xn--'))add('idn','Mezinárodní zápis domény','Doména obsahuje znaky přepsané do punycode. To je běžné u některých jazyků, může se však využít i k napodobování jiné adresy.');
 if(/^\[|^\d+(?:\.\d+){3}$/.test(host)||host==='localhost'||!host.includes('.')||host.endsWith('.local'))add('numeric','Číselná nebo místní adresa','Adresa nemá obvyklou veřejnou doménu. Cíl ani jeho dostupnost neověřujeme.');
 if(host.endsWith('.'))add('trailing-dot','Doména má koncovou tečku','Neobvyklý zápis může ztížit porovnání s adresou, kterou znáte.');
 const labels=host.replace(/\.$/,'').split('.');
 if(labels.length>4)add('subdomains','Mnoho úrovní subdomén','Dlouhá doména může skrývat jiného provozovatele. Samotný počet částí není důkaz podvodu.');
 if(url.port&&url.port!=='443'&&url.port!=='80')add('port','Neobvyklý port','Adresa používá jiný port než obvykle. Ověřte, zda jej služba skutečně používá.');
 for(const brand of brandReferences){
  if(brand.domains.some(d=>domain===d||domain.endsWith('.'+d)))continue;
  const decoy=brand.domains.some(d=>host.startsWith(d+'.')||host.includes('.'+d+'.'));
  const spelling=labels.some(label=>brand.tokens.some(token=>label.toLowerCase().replace(/0/g,'o').replace(/1/g,'l').split('-').includes(token)));
  if(decoy||spelling)add('brand-'+brand.tokens[0],decoy?'Značka je uvnitř jiné domény':'Doména může napodobovat '+brand.name,'Adresa připomíná '+brand.name+', ale neodpovídá našemu omezenému přehledu běžných domén značky. Může existovat i oprávněná jiná doména; identitu neověřujeme.');
 }
 if(/%2f|%5c|%40|%2e/i.test(url.pathname+url.search))add('encoded','Zakódované oddělovače v URL','Zápis obsahuje zakódované lomítko, tečku nebo zavináč. Může být legitimní, ale ztěžuje čtení adresy.');
 if([...url.searchParams.keys()].some(k=>/^(url|redirect|redirect_uri|next|return|continue|target)$/i.test(k)))add('redirect','Parametr možného přesměrování','URL obsahuje parametr, který může určovat další cíl. Přesměrování jsme neprovedli a konečný cíl neznáme.');
 if(/(?:login|signin|verify|password|account|payment|secure)/i.test(url.pathname)&&signals.some(s=>s.id.startsWith('brand-')))add('phishing','Napodobování značky spojené s přihlášením','Adresa kombinuje podobnost se známou značkou a část připomínající přihlášení či ověření. Do takového formuláře nevpisujte údaje bez nezávislého ověření.');
 return{status:'unverified',normalized:url.href,hostname:host,signals};
}
if(typeof document!=='undefined'){
 const form=document.querySelector('#web-form'),input=document.querySelector('#web-url'),result=document.querySelector('#web-result'),error=document.querySelector('#web-error');
 form.addEventListener('submit',event=>{event.preventDefault();error.hidden=true;try{const data=checkWebUrl(input.value);document.querySelector('#web-domain').textContent=data.hostname;document.querySelector('#web-summary').textContent=data.signals.length?'Našli jsme znaky, které si zaslouží pozornost. Pravost webu z URL neurčíme.':'Při kontrole struktury URL jsme známé varovné znaky nenašli. Neznamená to, že je web bezpečný.';const list=document.querySelector('#web-signals');list.replaceChildren();for(const signal of data.signals){const li=document.createElement('li');const strong=document.createElement('strong');strong.textContent=signal.title+'. ';li.append(strong,document.createTextNode(signal.explanation));list.append(li);}if(!data.signals.length){const li=document.createElement('li');li.textContent='Samotná URL neposkytuje dost informací k určení důvěryhodnosti.';list.append(li);}form.closest('.web-entry').hidden=true;result.hidden=false;startEshop(data.hostname);result.scrollIntoView({block:'start'});result.focus({preventScroll:true});}catch(e){error.textContent=e.message;error.hidden=false;input.focus();}});
 document.querySelector('#web-again').addEventListener('click',()=>{resetEshop();result.hidden=true;form.closest('.web-entry').hidden=false;input.focus();input.select();});
}
