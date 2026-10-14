// Stage 4 (S4.1): deterministic rules for investment offers.
// Pure module: no DOM, network, storage, clock or randomness. The offer text never
// leaves this function; the result contains only short quotes of matched claims.
// No score, weight or percentage: each rule has a fixed severity, title and explanation.
// Rules detect CLAIMS in the text, never their truth, and never infer regulation from a name.
import {validIco} from './check-plan.js';

export const RULES_VERSION='inv-1';
export const MAX_OFFER_CHARS=20000;
const MAX_QUOTE=120,MAX_QUOTES=2;
// Accepted matches per rule. Quotes use 2; the escalation check needs only a few. Bounds work.
const MAX_HITS=8;

// Fixed catalogue (ID → severity, title, explanation). Copy states why a claim is a
// warning sign, never that an offer is a fraud or that an investment is safe.
export const INVESTMENT_RULES=Object.freeze({
 inv_guaranteed_return:Object.freeze({severity:'attention',title:'Slib garantovaného výnosu',explanation:'Výnos investice nikdo nemůže zaručit. Slib jistého výnosu je častým znakem investičních podvodů.'}),
 inv_no_risk:Object.freeze({severity:'serious',title:'Tvrzení o investici bez rizika',explanation:'Žádná investice není bez rizika. Tvrzení o nulovém riziku nebo nemožnosti ztráty je typické pro podvodné nabídky.'}),
 inv_multiply:Object.freeze({severity:'serious',title:'Slib znásobení vkladu',explanation:'Slib, že se vklad zdvojnásobí nebo znásobí, je výrazný varovný signál.'}),
 inv_periodic_return:Object.freeze({severity:'attention',title:'Slib pravidelného výnosu za den, týden nebo měsíc',explanation:'Slibované výnosy počítané po dnech, týdnech nebo měsících bývají nereálné a objevují se u podvodných platforem.'}),
 inv_pressure:Object.freeze({severity:'attention',title:'Nátlak na rychlé rozhodnutí',explanation:'Časový nátlak má zabránit tomu, abyste si nabídku v klidu ověřili.'}),
 inv_immediate_transfer:Object.freeze({severity:'serious',title:'Požadavek na okamžitý převod peněz',explanation:'Požadavek poslat peníze ihned je jedním z hlavních znaků investičního podvodu.'}),
 inv_crypto_payment:Object.freeze({severity:'attention',title:'Platba v kryptoměnách',explanation:'Platby v kryptoměnách jsou prakticky nevratné. Podvodníci je proto často vyžadují.'}),
 inv_personal_account:Object.freeze({severity:'attention',title:'Platba na osobní účet',explanation:'Investiční firma nepřijímá peníze na osobní účet poradce nebo jiné soukromé osoby.'}),
 inv_remote_access:Object.freeze({severity:'serious',title:'Požadavek na vzdálený přístup',explanation:'Nikomu nedávejte vzdálený přístup k počítači nebo telefonu. Podvodníci ho zneužívají k převodům z vašeho účtu.'}),
 inv_credentials:Object.freeze({severity:'serious',title:'Požadavek na hesla nebo kódy',explanation:'Investiční firma nikdy nechce hesla, PIN ani potvrzovací kódy z vašeho bankovnictví.'}),
 inv_secrecy:Object.freeze({severity:'attention',title:'Žádost o utajení',explanation:'Žádost, abyste o investici neříkali bance nebo blízkým, je varovný signál.'}),
 inv_regulation_claim_negative:Object.freeze({severity:'attention',title:'Nejasná nebo vzdálená regulace',explanation:'Tvrzení, že poskytovatel licenci nepotřebuje nebo je regulován jen ve vzdálené zemi, neznamená ochranu investora v Česku.'}),
 inv_authority_endorsement:Object.freeze({severity:'attention',title:'Odvolávání na ČNB nebo stát',explanation:'ČNB ani stát nezaručují výnos konkrétní investice. Odkaz na ně podvodníci často zneužívají.'}),
 inv_recovery_offer:Object.freeze({severity:'serious',title:'Nabídka vrácení ztracených peněz',explanation:'Nabídky na vrácení ztracených investic za poplatek bývají dalším podvodem na stejné oběti.'}),
 inv_referral:Object.freeze({severity:'attention',title:'Odměna za získávání dalších lidí',explanation:'Výdělek závislý na získávání dalších členů je znakem pyramidového schématu.'})
});

// Fixed, reviewed next steps ("Než pošlete peníze"). Links only to approved www.cnb.cz pages.
export const INVESTMENT_ACTIONS=Object.freeze({
 cnb_registry:Object.freeze({text:'Ověřte poskytovatele v seznamech ČNB. Hledejte přesné IČO, ne jen podobný název.',link:Object.freeze({label:'ČNB – seznamy regulovaných a registrovaných subjektů',url:'https://www.cnb.cz/cs/dohled-financni-trh/seznamy/'})}),
 cnb_warnings:Object.freeze({text:'Zkontrolujte, zda ČNB na poskytovatele nebo platformu neupozorňuje.',link:Object.freeze({label:'ČNB – upozornění na aktivity',url:'https://www.cnb.cz/cs/dohled-financni-trh/ochrana-spotrebitele/upozorneni/'})}),
 own_contact:Object.freeze({text:'Kontakt na firmu si najděte sami, ne z nabídky.'}),
 no_transfer:Object.freeze({text:'Neposílejte peníze na osobní účet ani v kryptoměnách na pokyn poradce.'}),
 no_access:Object.freeze({text:'Nikomu nedávejte vzdálený přístup k počítači ani kódy z bankovnictví.'}),
 no_pressure:Object.freeze({text:'Nerozhodujte se pod časovým tlakem. Poraďte se s někým, komu věříte.'}),
 already_paid:Object.freeze({text:'Už jste peníze poslali? Podívejte se, co udělat hned.',link:Object.freeze({label:'Už se to stalo',url:'/uz-se-to-stalo'})})
});
const ACTION_ORDER=Object.freeze(['cnb_registry','cnb_warnings','own_contact','no_transfer','no_access','no_pressure','already_paid']);
// First matching finding decides the primary step; otherwise the registry check.
const PRIMARY_BY_RULE=Object.freeze([
 ['inv_remote_access','no_access'],['inv_credentials','no_access'],['inv_recovery_offer','already_paid'],
 ['inv_immediate_transfer','no_transfer'],['inv_personal_account','no_transfer'],['inv_crypto_payment','no_transfer'],
 ['inv_pressure','no_pressure'],['inv_secrecy','no_pressure']
]);

export const MISSING_INFO=Object.freeze({
 cnb_authorization:'Oprávnění poskytovatele u ČNB jsme automaticky neověřili.',
 claims_unverified:'Tvrzení o výnosu, bezpečnosti ani regulaci v nabídce jsme neověřovali.',
 provider_identity:'Nabídka neuvádí IČO. Poskytovatele jsme nemohli ověřit.',
 sender_relation:'Nevíme, zda nabídku poslala firma, za kterou se odesílatel vydává.'
});

// --- Normalization with an index map back to the original text (for quotes). ---
// Lowercase, no diacritics (NFKD), compatibility forms folded (fullwidth digits),
// invisible/bidi controls removed, any whitespace run collapsed to one space.
const INVISIBLE=/[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/u;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const isInvisible=c=>c===0xad||c===0x61c||c===0x180e||c>=0x200b&&c<=0x200f||c>=0x202a&&c<=0x202e||c>=0x2060&&c<=0x2064||c>=0x2066&&c<=0x2069||c===0xfeff;
function normalize(text){
 let out='';const map=[];let space=false;
 for(let index=0;index<text.length;){
  const code=text.codePointAt(index),at=index,size=code>0xffff?2:1;index+=size;
  if(code<128){ // ASCII fast path
   if(code===32||code>=9&&code<=13){if(!space&&out.length){out+=' ';map.push(at);}space=true;continue;}
   if(code<32||code===127)continue;
   space=false;out+=code>=65&&code<=90?String.fromCharCode(code+32):text[at];map.push(at);continue;
  }
  if(isInvisible(code))continue;
  const ch=text.slice(at,at+size);
  if(/\s/u.test(ch)){if(!space&&out.length){out+=' ';map.push(at);}space=true;continue;}
  space=false;
  const folded=ch.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
  for(let k=0;k<folded.length;k++)map.push(at); // one entry per UTF-16 unit
  out+=folded;
 }
 return {text:out,map};
}
function quote(original,map,start,end){
 const from=map[start],to=end>0?map[end-1]:from;
 let raw=original.slice(from,to+1+(original.codePointAt(to)>0xffff?1:0));
 raw=[...raw].filter(c=>!INVISIBLE.test(c)&&!CONTROL.test(c)).join('').replace(/\s+/gu,' ').trim();
 return raw.length>MAX_QUOTE?[...raw].slice(0,MAX_QUOTE-1).join('')+'…':raw;
}

// --- Context helpers (bounded windows; clause = up to the last . ! ? ; , or newline). ---
const NEGATION=/(?:^|[^a-z0-9])(?:neni|nejsou|nelze|nejde|nejedna|nebude|nebudou|nebudeme|nemuze|nemuzeme|nemuzete|nemusi|nemusite|nechceme|nechteji|nezadame|nepozadujeme|nepozadame|negarantujeme|negarantuje|nezarucujeme|nezarucuje|neslibujeme|neslibuje|neexistuje|nema|nemaji|nikdy|nikdo|nikoli|zadny|zadna|zadne|zadneho|zadnou|zadnym|bez zaruky|neposilejte|neposilame|neprevadejte|nezasilejte|neplatte|neplatite|nedavejte|nesdelujte|neinstalujte|nerikejte|neverte|nereagujte|neodpovidejte|neklikejte|negarantovan[a-z]*|nezarucen[a-z]*)(?![a-z0-9])/;
const WARNING=/(?:pozor na|varujeme pred|varovani pred|dejte si pozor|vyhnete se|podezrel[a-z]*|typick[a-z]* (?:znak|podvod)[a-z]*|nabidky typu|nabidkam typu)/;
const HISTORICAL=/(?:^|[^a-z0-9])(?:vydelal[aoi]?|dosahl[aoi]?|zhodnotil[aoi]?|vynesl[aoi]?|historick[a-z]*|v minulosti|za posledni[ch]*|loni|minul[a-z]*|predchozi[a-z]*|v roce \d{4}|za rok \d{4}|za obdobi|od zalozeni|byl[aoiy]?)(?![a-z0-9])/;
// Dots that do not end a sentence ("p. a.", "tzv.", "1.5") are masked for boundary search only.
function boundaries(text){return text.replace(/p\. ?a\.|\b(?:tzv|atd|apod|resp|napr|cca|kc|mil|mld|tis|s\.r\.o|a\.s)\.|\d\.(?=\d)/g,m=>m.replace(/\./g,'_'));}
const lastCut=(slice,cuts)=>Math.max(...[...cuts].map(c=>slice.lastIndexOf(c)));
// Clause before a match. A that-clause ("…, že …") continues the previous clause.
function clauseBefore(bounds,start,size=30,cuts='.!?;,:\n'){
 let slice=bounds.slice(Math.max(0,start-size),start);
 let cut=lastCut(slice,cuts);
 while(cut>=0&&slice[cut]===','&&/^ ?ze /.test(slice.slice(cut+1)))cut=lastCut(slice.slice(0,cut),cuts);
 return cut<0?slice:slice.slice(cut+1);
}
function sentenceAround(bounds,start,end,size=80){
 const before=bounds.slice(Math.max(0,start-size),start),after=bounds.slice(end,end+size);
 const b=lastCut(before,'.!?;\n'),a=after.search(/[.!?;\n]/);
 return (b<0?before:before.slice(b+1))+bounds.slice(start,end)+(a<0?after:after.slice(0,a));
}
// Negated in the clause before the claim, inside a two-part claim, or quoted as a warning.
function negated(bounds,start,end,{inside=true}={}){
 if(NEGATION.test(clauseBefore(bounds,start))||WARNING.test(clauseBefore(bounds,start,40,'.!?;,\n')))return true;
 return inside&&NEGATION.test(' '+bounds.slice(start,end)+' ');
}

const S='[^.!?;\\n]'; // stays inside one sentence
const re=source=>new RegExp(source,'g');
const PERCENT=re(String.raw`(?<![0-9.,])(\d{1,4}(?:[.,]\d{1,2})?) ?(?:%|procent[a-z]*)`);
const PERIOD_DAY=String.raw`(?:denne|za den|kazdy den|na den|tydne|za tyden|kazdy tyden|tydenne)`;
const PERIOD_MONTH=String.raw`(?:mesicne|za mesic|kazdy mesic|mesicni)`;
const PERIOD_YEAR=String.raw`(?:rocne|za rok|p[._] ?a[._]|rocni|per annum)`;
const PROMISE=/(?:^|[^a-z0-9])(?:vydelate|vydelavate|vydelavat|ziskate|dostanete|dostavate|vyplacime|vyplacite|vyplaci|vynasi|vynese|budete mit|zhodnotime|zhodnoti|zhodnocujeme|minimalne|az|garant[a-z]*|zaruc[a-z]*|jist[a-z]*|slibujeme)(?![a-z0-9])/;

const MATCHERS={
 inv_guaranteed_return:[
  re(String.raw`(?<![a-z])(?:garant[a-z]*|zarucen[a-z]*|zarucuj[a-z]*|zaruk[a-z]*|100 ?% jist[a-z]*)${S}{0,25}?(?<![a-z])(?:vynos|zisk|zhodnoceni|vydelek|vynosnost|uroc|dividend)[a-z]*`),
  re(String.raw`(?<![a-z])(?:vynos|zisk|zhodnoceni|vydelek|vynosnost|uroc|dividend)[a-z]*${S}{0,25}?(?<![a-z])(?:garant[a-z]*|zarucen[a-z]*|zarucuj[a-z]*|zaruk[a-z]*)`),
  re(String.raw`(?<![a-z])jist(?:y|eho|ym|a|ou|e) (?:vynos|zisk|zhodnoceni|vydelek|prijem)[a-z]*`)
 ],
 inv_no_risk:[re(String.raw`(?<![a-z])(?:bez (?:jakehokoli |zadneho |sebemensiho )?rizik[a-z]*|nulov[a-z]* rizik[a-z]*|zadne riziko|riziko je nulove|nemuzete (?:nic )?(?:prodelat|ztratit|prijit o)|nikdy neprodelate|100 ?% (?:jistot|bezpecn)[a-z]*|zcela bezpecn[a-z]* (?:investic|zhodnoceni|vynos)[a-z]*|absolutne bezpecn[a-z]*)`)],
 inv_multiply:[
  re(String.raw`(?<![a-z])(?:zdvojnasob|ztrojnasob|znasob|zdesetinasob)[a-z]*${S}{0,30}?(?<![a-z])(?:penez|penize|vklad|investic|kapital|uspor|prostredk)[a-z]*`),
  re(String.raw`(?<![a-z])(?:penez|penize|vklad|investic|kapital|uspor|prostredk)[a-z]*${S}{0,30}?(?<![a-z])(?:zdvojnasob|ztrojnasob|znasob|zdesetinasob)[a-z]*`),
  re(String.raw`(?<![0-9])\d{1,3} ?(?:x|krat|nasob)[a-z]* (?:vic|vice|vetsi)${S}{0,20}?(?:penez|zisk|vynos|vklad)[a-z]*`)
 ],
 inv_periodic_return:[], // linear custom matcher: periodicMatches()
 inv_pressure:[re(String.raw`(?<![a-z])(?:jen dnes|pouze dnes|jen do zitra|posledni (?:volna )?(?:mista|misto|kusy)|uz jen \d{1,3} (?:volnych )?(?:mist|hodin|minut)|(?:nabidka|akce|bonus|cena|prilezitost)${S}{0,20}?(?:plati|konci|vyprsi|skonci)${S}{0,15}?(?:dnes|do pulnoci|(?:do|za) \d{1,3} (?:hodin|minut))|casove omezena nabidka|rozhodn[a-z]*(?: se)? (?:ihned|hned|dnes|okamzite)|kdo vaha,? prodelava|neopakovateln[a-z]* (?:prilezitost|nabidk)[a-z]*)`)],
 inv_immediate_transfer:[
  re(String.raw`(?<![a-z])(?:poslete|posilejte|prevedte|prevadejte|vlozte|zaplatte|uhradte|odeslete|nabijte|musite (?:poslat|prevest|vlozit|zaplatit|uhradit))(?![a-z])${S}{0,30}?(?<![a-z])(?:ihned|hned|okamzite|obratem|jeste dnes|hned dnes|nejpozdeji dnes|do \d{1,3} (?:hodin|minut))(?![a-z])`),
  re(String.raw`(?<![a-z])(?:ihned|hned|okamzite|obratem|jeste dnes|hned dnes|nejpozdeji dnes)${S}{0,30}?(?<![a-z])(?:poslete|posilejte|prevedte|prevadejte|vlozte|zaplatte|uhradte|odeslete|nabijte|poslat|prevest|vlozit|zaplatit|uhradit)(?![a-z])`)
 ],
 inv_crypto_payment:[
  re(String.raw`(?<![a-z])(?:plat|posl|posil|preved|prevad|vloz|vklad|zaplat|uhrad|nabij|odesl)[a-z]*${S}{0,25}?(?<![a-z])(?:(?:v|ve|pres|pomoci) (?:bitcoin[a-z]*|btc|usdt|tether[a-z]*|ethereum[a-z]*|eth|kryptomen[a-z]*|krypto[a-z]*)|na (?:svou |vasi |nasi |tuto |nasledujici )?(?:krypto ?penezenk[a-z]*|bitcoinov[a-z]* (?:penezenk|adres)[a-z]*|penezenk[a-z]*|wallet[a-z]*|krypto ?adres[a-z]*))(?![a-z])`),
  re(String.raw`(?<![a-z])(?:kryptobankomat|bitcoinomat|bitcoinov[a-z]* bankomat|crypto ?atm|bitcoin ?atm)[a-z]*`)
 ],
 inv_personal_account:[re(String.raw`(?<![a-z])(?:na (?:muj|moj|osobni|soukromy|soukromi|privatni) (?:bankovni )?ucet|(?:osobni|soukromy) ucet (?:poradce|manazera|brokera|maklere|zprostredkovatele)|ucet (?:vaseho |naseho )?(?:poradce|manazera|account manazera|brokera|maklere))`)],
 inv_remote_access:[re(String.raw`(?<![a-z])(?:anydesk|any desk|teamviewer|team viewer|rustdesk|quicksupport|quick support|ultraviewer|supremo|vzdalen[a-z]* (?:pristup|plocha|plochu|sprava|spravu|pripojeni|ovladani))(?![a-z])`)],
 inv_credentials:[
  re(String.raw`(?<![a-z])(?:sdelte|sdelit|zadejte|zadat|poslete|posilejte|nadiktujte|nadiktovat|napiste|vyplnte|potvrdte|prepiste|predejte|potrebujeme)(?![a-z])${S}{0,40}?(?<![a-z])(?:pin|potvrzovaci kod[a-z]*|sms kod[a-z]*|overovaci kod[a-z]*|kod z sms|(?:prihlasovaci )?udaje (?:do|k|pro) (?:internetov[a-z]* |mobilni[a-z]* )?bankovnictvi|heslo (?:do|k) (?:internetov[a-z]* |mobilni[a-z]* )?(?:bankovnictvi|banky|uctu)|cislo (?:platebni )?karty|cvv|cvc)(?![a-z])`),
  re(String.raw`(?<![a-z])(?:pin|potvrzovaci kod[a-z]*|sms kod[a-z]*|overovaci kod[a-z]*|kod z sms|(?:prihlasovaci )?udaje (?:do|k|pro) (?:internetov[a-z]* |mobilni[a-z]* )?bankovnictvi|heslo (?:do|k) (?:internetov[a-z]* |mobilni[a-z]* )?(?:bankovnictvi|banky|uctu)|cislo (?:platebni )?karty|cvv|cvc)${S}{0,25}?(?<![a-z])(?:nam |mi )?(?:sdelte|zadejte|poslete|nadiktujte|napiste|vyplnte|predejte)(?![a-z])`)
 ],
 inv_secrecy:[re(String.raw`(?<![a-z])(?:nerikejte|neinformujte|nesdelujte|neprozrazujte|nemluvte|zatajte|tajte|nechte si (?:to )?pro sebe)${S}{0,30}?(?<![a-z])(?:bance|bankou|bankeri|bankere|rodine|rodinou|nikomu|policii|pratelum|manzel[a-z]*|detem|blizkym|okoli)(?![a-z])`)],
 inv_regulation_claim_negative:[
  re(String.raw`(?<![a-z])(?:nepotrebujeme (?:zadnou )?(?:licenci|povoleni|registraci|dohled)|nepodlehame (?:zadne )?(?:regulaci|dohledu)|mimo (?:dosah )?(?:regulac|dohled)[a-z]*|regulace (?:se na nas nevztahuje|neni (?:potreba|nutna))|bez (?:nutnosti )?(?:licence|povoleni) cnb)`),
  re(String.raw`(?<![a-z])(?:licenc|regulovan|registrovan|povolen)[a-z]*${S}{0,40}?(?<![a-z])(?:seychel[a-z]*|vanuat[a-z]*|svat[a-z]* vincenc[a-z]*|saint vincent|st\. ?vincent|marshallov[a-z]* ostrov[a-z]*|belize)(?![a-z])`)
 ],
 inv_authority_endorsement:[
  re(String.raw`(?<![a-z])(?:schvalen|garantovan|zarucen|doporucen|podporovan|kryt|certifikovan)[a-z]*${S}{0,30}?(?<![a-z])(?:cnb|ceskou narodni bankou|ceska narodni banka|statem|vladou|ministerstv[a-z]*|evropskou unii)(?![a-z])`),
  re(String.raw`(?<![a-z])(?:cnb|ceska narodni banka|stat|vlada|ministerstvo [a-z]+)(?![a-z])${S}{0,20}?(?<![a-z])(?:garantuje|zarucuje|schvalila|schvalilo|schvalil|doporucuje|podporuje|kryje)(?![a-z])`),
  re(String.raw`(?<![a-z])(?:garantuje|zarucuje|schvalila|schvalilo|schvalil|doporucuje|podporuje|kryje)${S}{0,15}?(?<![a-z])(?:cnb|ceska narodni banka|stat|vlada|ministerstvo [a-z]+)(?![a-z])`)
 ],
 inv_recovery_offer:[
  re(String.raw`(?<![a-z])(?:vratime|vratit|ziskame zpet|ziskat zpet|vymuzeme|vymahame|vymahani|pomuzeme (?:vam )?ziskat)[a-z]*${S}{0,40}?(?<![a-z])(?:ztracen|ukraden|prodelan|zpronever|podvodn|zmrazen)[a-z]*`),
  re(String.raw`(?<![a-z])(?:ztracen|ukraden|prodelan|zpronever)[a-z]* (?:penez|penize|investic|prostredk|kryptomen|uspor)[a-z]*${S}{0,40}?(?<![a-z])(?:vratime|ziskame zpet|vymuzeme|vymahame)(?![a-z])`)
 ],
 inv_referral:[
  re(String.raw`(?<![a-z])(?:bonus|odmen|proviz|vydel|zisk)[a-z]*${S}{0,30}?(?<![a-z])(?:za kazdeho|z kazdeho|na kazdem|za privedeni|za pozvani|z vkladu)(?: (?:noveho|novem|novych|dalsiho|dalsich|pozvaneho|pozvanych))? (?:clen|investor|klient|clovek|cloveka|pritel|lid)[a-z]*`),
  re(String.raw`(?<![a-z])(?:za kazdeho|privedte|pozvete|pozvi|naverbujte)${S}{0,30}?(?<![a-z])(?:pritel|pratel|znam|clen|klient|investor|lid)[a-z]*${S}{0,40}?(?<![a-z])(?:bonus|odmen|provize|provizi|vydel|zisk)[a-z]*`)
 ]
};
// Claims whose own wording is negative ("bez rizika", "nerikejte") are checked only before.
const OUTER_ONLY=new Set(['inv_no_risk','inv_secrecy','inv_regulation_claim_negative']);

// Period word first, then the nearest percentage up to 30 characters before it in the
// same sentence. Linear in the input; avoids a lazy gap tried at every percentage.
const PERIOD_RE=re(String.raw`(?<![a-z])(?:${PERIOD_DAY}|${PERIOD_MONTH})(?![a-z])`);
const PERCENT_TAIL=/(?<![0-9.,])\d{1,3}(?:[.,]\d{1,2})? ?(?:%|procent[a-z]*)/g;
function* periodicMatches(norm,bounds){
 for(const p of norm.matchAll(PERIOD_RE)){
  const from=Math.max(0,p.index-30),slice=bounds.slice(from,p.index);
  if(/[.!?;\n]/.test(slice.slice(slice.search(/\d/)<0?0:slice.search(/\d/))))continue;
  let last=null;for(const m of slice.matchAll(PERCENT_TAIL))last=m;
  if(!last)continue;
  const start=from+last.index,text=norm.slice(start,p.index+p[0].length);
  yield Object.assign([text],{index:start});
 }
}
function percentsIn(text){return [...text.matchAll(PERCENT)].map(m=>Number(m[1].replace(',','.')));}

function scan(norm){
 const hits=new Map(),bounds=boundaries(norm);
 const add=(id,m,extra={})=>{const list=hits.get(id)||[];list.push({start:m.index,end:m.index+m[0].length,...extra});hits.set(id,list);};
 for(const [id,patterns] of Object.entries(MATCHERS)){
  const sources=id==='inv_periodic_return'?[periodicMatches(norm,bounds)]:patterns.map(pattern=>norm.matchAll(pattern));
  scanning:for(const source of sources)for(const m of source){
   if((hits.get(id)?.length||0)>=MAX_HITS)break scanning;
   const start=m.index,end=start+m[0].length,sentence=sentenceAround(bounds,start,end);
   if(negated(bounds,start,end,{inside:!OUTER_ONLY.has(id)}))continue;
   if(id==='inv_secrecy'&&/(?:heslo|hesla|pin|kod|udaj)/.test(norm.slice(end,end+30)))continue; // "nikomu nesdělujte heslo" is advice
   if(id==='inv_multiply'&&HISTORICAL.test(sentence))continue;
   if(id==='inv_authority_endorsement'&&/garancni (?:system|fond)|pojisten/.test(sentence))continue; // statutory schemes
   if(id==='inv_recovery_offer'&&!/(?:penez|penize|investic|prostredk|kryptomen|uspor|vklad)/.test(sentence))continue;
   if(id==='inv_immediate_transfer'&&!/(?:ucet|uctu|penez|penize|kc|korun|czk|eur|usd|bitcoin|btc|krypto|usdt|vklad|castk|platb|investic)/.test(sentence))continue;
   if(id==='inv_periodic_return'){
    // D3: historical returns are never a finding by percentage alone; monthly expected
    // returns are flagged only when promised or at least 5 % a month.
    if(HISTORICAL.test(sentence))continue;
    const monthly=new RegExp(PERIOD_MONTH).test(m[0])&&!new RegExp(PERIOD_DAY).test(m[0]);
    const value=Number(/\d{1,3}(?:[.,]\d{1,2})?/.exec(m[0])[0].replace(',','.'));
    if(value<=0)continue;
    if(monthly&&value<5&&!PROMISE.test(' '+sentence+' '))continue;
   }
   add(id,m);
  }
 }
 return hits;
}

export function evaluateInvestment(offer,{ico}={}){
 if(typeof offer!=='string')throw Error('INVALID_OFFER');
 const trimmed=offer.trim();
 if(trimmed.length<1||trimmed.length>MAX_OFFER_CHARS)throw Error('INVALID_OFFER');
 if(ico!==undefined&&!validIco(ico))throw Error('INVALID_ICO');
 const {text:norm,map}=normalize(trimmed);
 const hits=scan(norm),bounds=boundaries(norm);
 // Escalation of a guaranteed return (D3): serious when combined with a no-risk claim,
 // a multiplied deposit, a guaranteed periodic return, or (auxiliary) ≥ 15 % a year.
 const guaranteed=hits.get('inv_guaranteed_return')||[];
 let guaranteedSerious=hits.has('inv_no_risk')||hits.has('inv_multiply');
 for(const g of guaranteed){
  const sentence=sentenceAround(bounds,g.start,g.end,60);
  if(new RegExp(`(?:${PERIOD_DAY}|${PERIOD_MONTH})`).test(sentence)&&percentsIn(sentence).some(v=>v>0))guaranteedSerious=true;
  if(new RegExp(PERIOD_YEAR).test(sentence)&&percentsIn(sentence).some(v=>v>=15))guaranteedSerious=true;
 }
 const findings=[];
 for(const id of Object.keys(INVESTMENT_RULES)){
  const list=hits.get(id);if(!list)continue;
  const rule=INVESTMENT_RULES[id];
  const evidence=[...new Set(list.sort((a,b)=>a.start-b.start).map(h=>quote(trimmed,map,h.start,h.end)))].filter(Boolean).slice(0,MAX_QUOTES);
  findings.push({ruleId:id,severity:id==='inv_guaranteed_return'&&guaranteedSerious?'serious':rule.severity,title:rule.title,explanation:rule.explanation,evidence});
 }
 const icoInText=[...norm.matchAll(/(?<![a-z])ico?\s{0,10}:?\s{0,10}(\d{8})(?!\d)/g)].some(m=>validIco(m[1]));
 const missing=['cnb_authorization','claims_unverified',...(ico||icoInText?[]:['provider_identity']),'sender_relation'].map(id=>({id,text:MISSING_INFO[id]}));
 const ids=new Set(findings.map(f=>f.ruleId));
 const primary=(PRIMARY_BY_RULE.find(([rule])=>ids.has(rule))||[null,'cnb_registry'])[1];
 const action=id=>({id,...INVESTMENT_ACTIONS[id]});
 return deepFreeze({schema:1,rulesVersion:RULES_VERSION,findings,missing,
  actions:{primary:action(primary),secondary:ACTION_ORDER.filter(id=>id!==primary).map(action)},
  input:{chars:trimmed.length,ico:ico??null}});
}
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
