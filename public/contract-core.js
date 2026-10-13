// Shared, dependency-free contract rules and quotation gates. No I/O or storage.
export const CONTRACT_TYPES=['consumer_services','energy','eshop_terms','work_contract','loan','other','unknown'];
export const CLASSIFICATIONS={common:'Běžné ustanovení',potentially_unfavourable:'Může být nevýhodné',ambiguous:'Nejasná formulace',possible_conflict:'Může být v rozporu se zákonem — ověřte'};
export const DEFINITIONS={
 penalty:{title:'Smluvní pokuty',pattern:/smluvn[ií] pokut|pokuta ve v[yý][sš]i|za ka[zž]d[yý] den prodlen/iu,classification:'potentially_unfavourable',explanation:'Text upravuje platbu při porušení povinnosti.',why:'Při prodlení může vzniknout další platba nad původní cenu.',questions:['Kdy vzniká povinnost zaplatit pokutu?','Jak se vypočítá celková pokuta při delším prodlení?']},
 auto_renewal:{title:'Automatické prodlužování',pattern:/automaticky (?:prodlu[zž]|obnov)|automatick[eé] (?:prodlo|obnov)|nebude.li.{0,80}vypov[eě]|po uplynut[ií].{0,100}na dobu neur[cč]itou/iu,classification:'potentially_unfavourable',explanation:'Smlouva může pokračovat bez nového podpisu.',why:'Můžete zůstat zavázáni, pokud si včas nepohlídáte ukončení.',questions:['Kdy a jak mám oznámit, že nechci smlouvu prodloužit?','Jaké podmínky platí po prodloužení?']},
 notice_period:{title:'Výpovědní lhůty a ukončení',pattern:/v[yý]pov[eě]dn[ií] (?:lh[uů]t|dob)|v[yý]pov[eě][dď] lze|lze ukon[cč]it pouze|poplatek za (?:p[rř]ed[cč]asn[eé] )?ukon[cč]/iu,classification:'common',explanation:'Text stanovuje způsob nebo časový průběh ukončení.',why:'Ověřte, zda budete platit i během čekání na ukončení.',questions:['Jak a kdy mohu smlouvu ukončit?','Co budu platit do jejího ukončení?']},
 unilateral_change:{title:'Jednostranné změny podmínek',pattern:/jednostrann[eě] (?:zm[eě]n|upravit)|zm[eě]n(?:a|u|it) cen[ií]ku|aktu[aá]ln[ií] zn[eě]n[ií].{0,60}(?:web|zve[rř]ejn)/iu,classification:'potentially_unfavourable',explanation:'Text připouští změnu podmínek během smlouvy.',why:'Cena nebo jiné podmínky se mohou změnit bez nového podpisu.',questions:['Jak se dozvím o změně ceny nebo podmínek?','Co mohu udělat, když se změnou nesouhlasím?']},
 fees:{title:'Poplatky a chybějící ceník',pattern:/poplatek|administrativn[ií]|dle cen[ií]ku|storno/iu,classification:'ambiguous',explanation:'Text zmiňuje další platbu nebo odkazuje na ceník.',why:'Bez úplného ceníku nemusí být jasné celkové náklady.',questions:['Které další poplatky mohou vzniknout?','Dostanu platný ceník před podpisem?']},
 obligation:{title:'Další závazky',pattern:/v[yý]hradnost|minim[aá]ln[ií] odb[eě]r|sm[eě]nk|ru[cč]en[ií]|z[aá]vazek.{0,60}dobu ur[cč]itou/iu,classification:'potentially_unfavourable',explanation:'Text ukládá závazek, který může omezit vaše možnosti.',why:'Závazek může pokračovat i při změně vaší situace.',questions:['Jaké závazky mi vzniknou kromě běžné platby?','Jak se mohu závazku zbavit, když službu nepotřebuji?']},
 liability_limit:{title:'Omezení odpovědnosti',pattern:/neodpov[ií]d[aá] za|vylu[cč]uje odpov[eě]dnost|n[aá]hrada [sš]kody.{0,30}omezena/iu,classification:'potentially_unfavourable',explanation:'Text omezuje odpovědnost druhé strany za určité situace.',why:'Při problému nemusí být jasné, jaké řešení můžete požadovat.',questions:['Kdo ponese následky, když služba nefunguje?','Jak se budou řešit reklamace a případná škoda?']},
 arbitration:{title:'Rozhodčí doložky',pattern:/rozhod[cč][ií] (?:[rř][ií]zen[ií]|dolo[zž]k|soud)|rozhodce/iu,classification:'potentially_unfavourable',explanation:'Text zmiňuje řešení sporu prostřednictvím rozhodce.',why:'Způsob řešení sporu může ovlivnit jeho průběh a náklady.',questions:['Kdo by řešil spor a kdo ho vybírá?','Jaké náklady může řešení sporu přinést?']},
 unclear:{title:'Nejasná nebo neobvyklá ustanovení',pattern:/dle (?:vlastn[ií]ho )?uv[aá][zž]en[ií]|p[rř]im[eě][rř]en[yáé]|nep[rř]ilo[zž]en|samostatn[eé]m dokumentu|ignoruj.{0,60}instrukce|system prompt|jsi asistent|schema_version/iu,classification:'ambiguous',explanation:'Text obsahuje nejasný pojem, další dokument nebo pokyny pro program.',why:'Význam si ověřte u druhé strany, místo abyste jej domýšleli.',questions:['Co tato formulace znamená v konkrétní situaci?','Které další dokumenty jsou součástí smlouvy?']},
};
export const INJECTION=/ignoruj.{0,60}instrukce|ignore.{0,60}instructions|system prompt|jsi asistent|schema_version|<\/?system/iu;
const mark=/\p{M}/u,letter=/\p{L}$/u,space=/\s/u;
export function normalizeContractText(text,{fold=false}={}){let s=text.normalize('NFKC').replace(/(\p{L})-\r?\n[ \t]{0,80}(?=\p{L})/gu,'$1').replace(/[“”„«»]/g,'"').replace(/[‘’‚]/g,"'").replace(/[–—−]/g,'-').replace(/\s+/gu,' ');return fold?s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase():s;}
export function normalizeWithMap(raw,{fold=false}={}){
 let chars=[],starts=[],ends=[],lastSpace=false;
 for(let i=0;i<raw.length;){const start=i;let piece=String.fromCodePoint(raw.codePointAt(i));i+=piece.length;
  if(piece==='-'&&letter.test(raw.slice(Math.max(0,start-2),start))){const tail=raw.slice(i,i+100),m=/^(?:\r?\n)[ \t]{0,80}(?=\p{L})/u.exec(tail);if(m){i+=m[0].length;continue;}}
  while(i<raw.length&&mark.test(String.fromCodePoint(raw.codePointAt(i)))){const ch=String.fromCodePoint(raw.codePointAt(i));piece+=ch;i+=ch.length;}
  piece=piece.normalize('NFKC').replace(/[“”„«»]/g,'"').replace(/[‘’‚]/g,"'").replace(/[–—−]/g,'-');
  if(fold)piece=piece.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  for(const ch of piece){if(space.test(ch)){if(lastSpace){ends[ends.length-1]=i;continue;}chars.push(' ');lastSpace=true;starts.push(start);ends.push(i);}else{chars.push(ch);lastSpace=false;for(let k=0;k<ch.length;k++){starts.push(start);ends.push(i);}}}
 }
 return{value:chars.join(''),starts,ends};
}
export function verifyQuote(text,quote){
 if(typeof quote!=='string'||quote.length<20||quote.length>600||quote.includes('…')||quote.includes('...'))return null;
 for(const fold of [false,true]){const hay=normalizeWithMap(text,{fold}),needle=normalizeWithMap(quote,{fold}).value.trim();if(needle.length<20)continue;const i=hay.value.indexOf(needle);if(i<0||(fold&&hay.value.indexOf(needle,i+1)>=0))continue;
  const start=hay.starts[i],end=hay.ends[i+needle.length-1];if(start===undefined||end===undefined||end-start>600)return null;return{start,end,quote:text.slice(start,end)};
 }return null;
}
export function validateContractInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!CONTRACT_TYPES.includes(input.contract_type)||typeof input.content!=='string'||!input.content.trim()||input.content.length>40000)throw Error('AI_INPUT_LIMIT');
 if(Object.keys(input).some(k=>!['content','contract_type','ai_consent','bot_token'].includes(k))||typeof input.ai_consent!=='boolean'||(input.bot_token!==undefined&&(typeof input.bot_token!=='string'||input.bot_token.length>4096)))throw Error('INVALID_INPUT');
 return{...input,content:input.content.normalize('NFC')};
}
export function guessContractType(text){const n=normalizeContractText(text,{fold:true});for(const [type,re]of [['loan',/uver|pujck/],['energy',/elektrin|dodavk.{0,30}plyn/],['work_contract',/smlouva o dilo|zhotovitel/],['eshop_terms',/obchodni podminky|eshop/],['consumer_services',/predplatn|telekomunik|fitness|streaming/],['other',/pracovni smlouv|najem bytu|nemovitost|podnikatel|darovaci|dedick/]])if(re.test(n))return type;return'unknown';}
export function rulesForContract(text,type='unknown'){
 if(typeof text!=='string'||!text.trim()||text.length>40000)throw Error('AI_INPUT_LIMIT');
 const findings=[];let start=0;
 for(let i=0;i<=text.length;i++){
  const decimal=text[i]==='.'&&/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||'');
  if(i===text.length||(!decimal&&(/[.!?]/.test(text[i])||(text[i]==='\n'&&/^[ \t]{0,40}\r?\n/.test(text.slice(i+1,i+45)))))||i-start>=590){
   const end=i===text.length?i:i+1,segmentStart=start,segment=text.slice(segmentStart,end);start=end;
   const quote=segment.trim(),actual=segmentStart+segment.indexOf(quote);if(quote.length<20||quote.length>600)continue;
   const normal=normalizeContractText(quote);
   for(const [category,d]of Object.entries(DEFINITIONS))if((!INJECTION.test(normal)||category==='unclear')&&(d.pattern.test(normal)||(category==='unclear'&&INJECTION.test(normal))))findings.push({category,classification:d.classification,...dFields(d),quote,start:actual,end:actual+quote.length,confidence:['penalty','arbitration'].includes(category)&&(category==='arbitration'||/\d+(?:[.,]\d+)?\s*(?:%|Kč|Kc|CZK|EUR|€)|(?:ve výši|částk[ay]?)\s+\d/iu.test(quote))?'high':'medium',source:'rules',catalog_id:null});
  }
 }
 const seen=new Set(),unique=[];for(const f of findings){const key=f.start+':'+f.end+':'+f.category;if(!seen.has(key)){seen.add(key);unique.push(f);}}
 return{schema_version:'contract-findings-v1',contract_type_guess:guessContractType(text),findings:sortFindings(unique),questions_before_signing:[...new Set(unique.flatMap(f=>f.what_to_check))],insufficient_text:text.trim().length<80,mode:'rules',legal_catalog_empty:true};
}
function dFields(d){return{plain_explanation:d.explanation,why_it_matters:d.why,what_to_check:d.questions};}
export function sortFindings(items){const order={possible_conflict:0,potentially_unfavourable:1,ambiguous:2,common:3};return items.sort((a,b)=>order[a.classification]-order[b.classification]||a.start-b.start);}
