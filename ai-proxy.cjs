const http=require('node:http');const {timingSafeEqual}=require('node:crypto');
const token=process.env.OPENAI_API_KEY;if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(token||''))throw Error('Missing API credential');
const expected=Buffer.from('Bearer '+token);let active=0,contractActive=0,botActive=0,aresActive=0;const aresCalls=[];
// ARES registry relay: fixed upstream, IČO is the only client-controlled value.
const ARES_BASE='https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
const validIco=ico=>typeof ico==='string'&&/^\d{8}$/.test(ico)&&((11-[8,7,6,5,4,3,2].reduce((v,w,i)=>v+Number(ico[i])*w,0)%11)%10)===Number(ico[7]);
async function ares(req,res){
 const now=Date.now();while(aresCalls.length&&aresCalls[0]<=now-60000)aresCalls.shift();
 if(aresActive>=2||aresCalls.length>=20){req.resume();return reply(res,429);}
 aresActive++;const timer=setTimeout(()=>req.destroy(),3000);
 try{
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>64)throw Error('Body limit');parts.push(part);}clearTimeout(timer);
  let body;try{body=JSON.parse(Buffer.concat(parts));}catch{return reply(res,400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!validIco(body.ico))return reply(res,400);
  // The 20/minute window counts real upstream lookups only.
  aresCalls.push(Date.now());
  const upstream=await fetch(ARES_BASE+body.ico,{method:'GET',redirect:'error',signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});
  if(upstream.status===404){await upstream.body?.cancel();return reply(res,404);}
  if(upstream.status!==200||!/^application\/json\b/i.test(upstream.headers.get('content-type')||'')){await upstream.body?.cancel();return reply(res,502);}
  const reader=upstream.body.getReader();const chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>128000)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!raw||raw.ico!==body.ico||typeof raw.obchodniJmeno!=='string')return reply(res,502);
  // Forward only the fields the application displays.
  const out={ico:raw.ico,obchodniJmeno:raw.obchodniJmeno,sidlo:{textovaAdresa:typeof raw.sidlo?.textovaAdresa==='string'?raw.sidlo.textovaAdresa:null},pravniForma:typeof raw.pravniForma==='string'?raw.pravniForma:null,seznamRegistraci:raw.seznamRegistraci&&typeof raw.seznamRegistraci==='object'&&!Array.isArray(raw.seznamRegistraci)?raw.seznamRegistraci:{}};
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(out));
 }catch(error){if(!res.destroyed)reply(res,error?.message==='Body limit'?400:502);}finally{clearTimeout(timer);aresActive--;}
}
const reply=(res,status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{}');};
// Firm registry routes: fixed upstreams, bounded parsing, no persistence or raw data forwarding.
const firmLabels={"legal": {"000": "Zatím neurčeno", "101": "Fyzická osoba podnikající dle živnostenského zákona", "105": "Fyzická osoba podnikající dle jiných zákonů než živnostenského a zákona o zemědělství", "107": "Zemědělský podnikatel - fyzická osoba", "111": "Veřejná obchodní společnost", "112": "Společnost s ručením omezeným", "113": "Společnost komanditní", "115": "Společný podnik", "116": "Zájmové sdružení", "117": "Nadace", "118": "Nadační fond", "121": "Akciová společnost", "141": "Obecně prospěšná společnost", "145": "Společenství vlastníků jednotek", "151": "Komoditní burza", "161": "Ústav", "205": "Družstvo", "301": "Státní podnik", "313": "Česká národní banka", "325": "Organizační složka státu", "326": "Stálý rozhodčí soud", "331": "Příspěvková organizace", "352": "Státní organizace Správa železnic", "353": "Rada pro veřejný dohled nad auditem", "361": "Veřejnoprávní instituce (ČT,ČRo,ČTK)", "381": "Fond (ze zákona)", "391": "Zdravotní pojišťovna", "421": "Odštěpný závod zahraniční právnické osoby", "422": "Organizační složka zahraničního nadačního fondu", "423": "Organizační složka zahraniční nadace", "424": "Zahraniční fyzická osoba", "425": "Odštěpný závod zahraniční fyzické osoby", "426": "Zastoupení zahraniční banky", "501": "Odštěpný závod nebo jiná organizační složka podniku zapisující se do obchodního rejstříku", "521": "Samostatná drobná provozovna obecního úřadu", "541": "Podílový, penzijní fond", "601": "Vysoká škola (veřejná, státní)", "641": "Školská právnická osoba", "661": "Veřejná výzkumná instituce", "704": "Zvláštní organizace pro zastoupení českých zájmů v mezinárodních nevládních organizacích", "705": "Podnik nebo hospodářské zařízení sdružení", "706": "Spolek", "707": "Odborová organizace", "708": "Organizace zaměstnavatelů", "711": "Politická strana, politické hnutí", "715": "Podnik nebo hospodářské zařízení politické strany", "721": "Církve a náboženské společnosti", "722": "Evidované církevní právnické osoby", "723": "Svazy církví a náboženských společností", "733": "Organizační jednotka odborové organizace a organizace zaměstnavatelů", "734": "Organizační jednotka zvláštní organizace pro zastoupení českých zájmů v mezinárodních nevládních organizacích", "736": "Pobočný spolek", "741": "Stavovská organizace - profesní komora", "745": "Komora (s výjimkou profesních komor)", "751": "Zájmové sdružení právnických osob", "761": "Honební společenstvo", "771": "Dobrovolný svazek obcí", "801": "Obec nebo městská část hlavního města Prahy", "804": "Kraj a hl.m.Praha", "901": "Zastupitelský orgán jiných států", "906": "Zahraniční spolek", "907": "Mezinárodní odborová organizace", "908": "Mezinárodní organizace zaměstnavatelů", "911": "Zahraniční kulturní, informační středisko, rozhlasová, tisková a televizní agentura", "921": "Mezinárodní nevládní organizace", "922": "Organizační jednotka mezinárodní nevládní organizace", "931": "Evropské hospodářské zájmové sdružení", "932": "Evropská společnost", "933": "Evropská družstevní společnost", "936": "Zahraniční pobočný spolek", "941": "Evropské seskupení pro územní spolupráci", "950": "Subjekt právním řádem výslovně neupravený", "951": "Mezinárodní vojenská organizace vzniklá na základě mezinárodní smlouvy", "952": "Konsorcium evropské výzkumné infrastruktury", "960": "Právnická osoba zřízená zvláštním zákonem zapisovaná do veřejného rejstříku"}, "employees": {"000": "Neuvedeno", "110": "Bez zaměstnanců", "120": "1 - 5 zaměstnanců", "130": "6 - 9 zaměstnanců", "210": "10 - 19 zaměstnanců", "220": "20 - 24 zaměstnanci", "230": "25 - 49 zaměstnanců", "240": "50 - 99 zaměstnanců", "310": "100 - 199 zaměstnanců", "320": "200 - 249 zaměstnanců", "330": "250 - 499 zaměstnanců", "340": "500 - 999 zaměstnanců", "410": "1000 - 1499 zaměstnanců", "420": "1500 - 1999 zaměstnanců", "430": "2000 - 2499 zaměstnanců", "440": "2500 - 2999 zaměstnanců", "450": "3000 - 3999 zaměstnanců", "460": "4000 - 4999 zaměstnanců", "470": "5000 - 9999 zaměstnanců", "510": "10 000 a více zaměstnanců"}, "insolvency": {"150": "Usnesení o zákazu nakládat s majetkovou podstatou", "151": "Usnesení o omezení nakládat s majetkovou podstatou", "152": "Usnesení o odmítnutí návrhu na povolení reorganizace pro opožděnost", "153": "Usnesení o odmítnutí návrhu na povolení reorganizace pro vady", "154": "Usnesení o vzetí na vědomí zpětvzetí návrhu na povolení reorganizace", "156": "Usnesení o zamítnutí návrhu na povolení reorganizace", "158": "Usnesení o schválení reorganizačního plánu", "159": "Usnesení o schválení změny reorganizačního plánu", "163": "Usnesení o přeměně reorganizace v konkurs", "164": "Usnesení o vzetí na vědomí splnění reorganizačního plánu", "171": "Usnesení o zamítnutí návrhu na povolení oddlužení", "172": "Usnesení o povolení oddlužení", "174": "Usnesení o schválení oddlužení zpeněžením majetkové podstaty", "175": "Usnesení o schválení oddlužení plněním splátkového kalendáře", "176": "Usnesení o neschválení oddlužení", "177": "Usnesení o vzetí na vědomí splnění oddlužení", "185": "Vyhláška o zahájení insolvenčního řízení", "473": "Usnesení o zastavení řízení", "487": "Vyřízeno jiným způsobem", "67": "Usnesení o vyhlášení moratoria", "69": "Usnesení o prodloužení moratoria", "70": "Usnesení o zrušení moratoria", "72": "Usnesení o odmítnutí insolvenčního návrhu", "73": "Usnesení o zastavení řízení pro zpětvzetí insolvenčního návrhu", "75": "Usnesení o úpadku", "76": "Usnesení o úpadku spojené s prohlášením konkursu", "77": "Usnesení o úpadku spojené s povolením reorganizace", "78": "Usnesení o úpadku spojené s povolením oddlužení", "79": "Usnesení o způsobu řešení úpadku konkursem dle usnesení schůze věřitelů", "80": "Usnesení o způsobu řešení úpadku reorganizací dle usnesení schůze věřitelů", "81": "Usnesení o zastavení řízení pro nedostatek podmínky řízení", "82": "Usnesení o zamítnutí insolvenčního návrhu", "84": "Usnesení o tom, že dlužník není v úpadku", "85": "Usnesení o vydání předběžného opatření", "86": "Usnesení o zrušení předběžného opatření", "87": "Usnesení o zastavení řízení pro nezaplacení zálohy na náklady řízení", "94": "Usnesení o prohlášení konkursu", "95": "Usnesení o zrušení konkursu", "99": "Usnesení o povolení reorganizace", "999": "Jiné usnesení"}, "nace": {}};
const FIRM_REST='https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/';
const DPH_URL='https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP';
const firmWindows=new Map();
const text=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500):null;
const date=v=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Invalid date');return v;};
const array=v=>{if(v==null)return[];if(!Array.isArray(v))throw Error('Array schema');return v;};
const current=x=>!x.datumVymazu&&!x.clenstvi?.funkce?.zanikFunkce&&!x.clenstvi?.clenstvi?.zanikClenstvi;
const personName=x=>text(x?.pravnickaOsoba?.obchodniJmeno)||text([x?.fyzickaOsoba?.jmeno,x?.fyzickaOsoba?.prijmeni].filter(Boolean).join(' '));
const recent=(v,days)=>date(v)&&Date.parse(v)<=Date.now()&&Date.parse(v)>=Date.now()-days*86400000;
function minimalIdentity(raw,ico){
 if(raw?.ico!==ico||typeof raw.obchodniJmeno!=='string'||typeof raw.pravniForma!=='string'||!/^\d{3}$/.test(raw.pravniForma)||!raw.seznamRegistraci||typeof raw.seznamRegistraci!=='object')throw Error('Schema');
 const sole=['101','102','104','105','107','108','424','425'].includes(raw.pravniForma);
 return{ico,name:text(raw.obchodniJmeno),legalFormCode:text(raw.pravniForma),legalForm:firmLabels.legal[raw.pravniForma]||null,seat:text(sole?raw.sidlo?.nazevObce:raw.sidlo?.textovaAdresa),municipality:text(raw.sidlo?.nazevObce),soleTrader:sole,founded:date(raw.datumVzniku),dissolved:date(raw.datumZaniku),dic:!sole&&/^CZ\d{8}$/.test(raw.dic||'')?raw.dic:null,nace:array(raw.czNace).filter(x=>/^\d{1,5}$/.test(x)).slice(0,3).map(code=>({code,text:firmLabels.nace[code]||null})),source:'ARES',sourceUpdated:date(raw.datumAktualizace),registrations:Object.fromEntries(Object.entries(raw.seznamRegistraci).filter(([k,v])=>/^stavZdroje[A-Za-z]+$/.test(k)&&typeof v==='string').map(([k,v])=>[k,text(v)]))};
}
function minimalRegister(raw,ico){
 if(![ico,'ARES_'+ico].includes(raw?.icoId)||!Array.isArray(raw.zaznamy))throw Error('Schema');
 const prim=raw.zaznamy.filter(x=>x.primarniZaznam===true);if(prim.length!==1)throw Error('Primary record');const r=prim[0];
 if(!['AKTIVNI','ZANIKLY','VYMAZAN'].includes(r.stavSubjektu))throw Error('State');
 const organs=[...array(r.statutarniOrgany),...array(r.ostatniOrgany)];
 const members=organs.flatMap(o=>array(o.clenoveOrganu).map(m=>({o,m})));if(members.length>1000)throw Error('Too many persons');
 const statutory=members.filter(({o,m})=>current(o)&&current(m)&&o.typOrganu!=='LIKVIDATOR').map(({o,m})=>({role:text(m.clenstvi?.funkce?.nazev)||text(o.typOrganu),name:personName(m),since:date(m.clenstvi?.funkce?.vznikFunkce)||date(m.datumZapisu)})).filter(x=>x.name);
 const changes=members.filter(({o})=>array(r.statutarniOrgany).includes(o)).flatMap(({m})=>[m.datumZapisu,m.datumVymazu]).filter(d=>recent(d,365)&&d!==r.datumZapisu);
 const change90=members.some(({o,m})=>array(r.statutarniOrgany).includes(o)&&[m.datumZapisu,m.datumVymazu].some(d=>recent(d,90)&&d!==r.datumZapisu));
 const owners= array(r.spolecnici).filter(current).flatMap(g=>array(g.spolecnik)).filter(current).map(s=>{const share=array(s.podil).filter(current).find(p=>p.velikostPodilu?.typObnos==='PROCENTA');return{name:personName(s.osoba),since:date(s.datumZapisu),share:share&&Number.isFinite(Number(share.velikostPodilu.hodnota.replace(',','.')))?Number(share.velikostPodilu.hodnota.replace(',','.'))+' ze sta':null};}).filter(x=>x.name);
 const previousOwnerChanged=array(r.spolecnici).flatMap(g=>array(g.spolecnik)).some(o=>recent(o.datumVymazu,90)&&array(o.podil).some(p=>p.velikostPodilu?.typObnos==='PROCENTA'&&Number(String(p.velikostPodilu.hodnota).replace(',','.'))===100));
 const ownerDates=owners.filter(x=>x.share==='100 ze sta'&&recent(x.since,90)).map(x=>x.since);
 const leadershipDates=changes.filter(d=>recent(d,90));
 const liquidation=organs.find(o=>o.typOrganu==='LIKVIDATOR'&&current(o)&&array(o.clenoveOrganu).some(current));
 const writtenLiquidation=array(r.ostatniSkutecnosti).find(x=>current(x)&&/zruš(?:uje|ena|en).*s likvidací/iu.test(x.text||''));
 // Free insolvency text can contain personal data: only the structured event type is forwarded.
 const entry=(x,parent={})=>({recordedOn:date(x.datumZapisu)||date(parent.datumZapisu),deletedOn:date(x.datumVymazu)||date(parent.datumVymazu),typeCode:/^\d{1,4}$/.test(x.typZapisu||x.typKonkursu||'')?String(x.typZapisu||x.typKonkursu):null,typeText:firmLabels.insolvency[x.typZapisu]||null,text:null});
 const entries=array(r.insolvence).flatMap(x=>array(x.insolvencniZapis).map(e=>entry(e,x)));
 const bankruptcy=array(r.konkursy).map(x=>entry(x));if(entries.length+bankruptcy.length>500)throw Error('Too many entries');
 const file=array(r.spisovaZnacka).filter(current)[0];const cap=array(r.zakladniKapital).filter(current)[0]?.vklad;
 return{state:r.stavSubjektu==='AKTIVNI'?'AKTIVNI':'VYMAZAN',deletedOn:date(r.datumVymazu),deletionReason:null,fileNo:file?text([file.oddil,file.vlozka,file.soud].join(' ')):null,capital:cap&&cap.typObnos==='KORUNY'&&/^\d+(?:[.,]\d+)?$/.test(cap.hodnota)?{amount:Number(cap.hodnota.replace(',','.')),currency:'CZK'}:null,liquidation:{active:Boolean(liquidation||writtenLiquidation),since:date(liquidation?.datumZapisu||writtenLiquidation?.datumZapisu)},statutory,statutoryChanges12m:changes.length,statutoryChanged90d:change90,ownerAndLeadershipChanged90d:previousOwnerChanged&&ownerDates.some(d=>leadershipDates.some(l=>Math.abs(Date.parse(l)-Date.parse(d))<=90*86400000)),owners,insolvency:{entries,bankruptcy}};
}
async function boundedUpstream(url,options={},limit=128000,xml=false){
 const r=await fetch(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(3500)]):AbortSignal.timeout(3500)});
 if(r.url&&r.url!==url){await r.body?.cancel();throw Error('Redirect');}
 if(r.status!==200||!(xml?/^text\/xml\b/i:/^application\/json\b/i).test(r.headers.get('content-type')||'')){await r.body?.cancel();const e=Error('Upstream');e.status=r.status;throw e;}
 const reader=r.body.getReader();const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Oversized');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 const value=Buffer.concat(chunks).toString('utf8');return xml?value:JSON.parse(value);
}
// Small strict XML subset parser. No entity declarations, external resources, DTD, processing
// instructions (except initial XML declaration), recursion, or document execution.
function parseDph(xml,dic){
 if(/<!|&(?!amp;|lt;|gt;|quot;|apos;)/i.test(xml)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml))throw Error('XML declaration/entity');
 xml=xml.replace(/^\s*<\?xml\s+[^?]*\?>/,'');if(/<\?/.test(xml))throw Error('XML instruction');
 const root={name:'root',children:[]},stack=[root];let pos=0,nodes=0;
 const decode=s=>s.replace(/&(amp|lt|gt|quot|apos);/g,(_,v)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v]));
 for(const m of xml.matchAll(/<([^<>]*)>/g)){
  if(xml.slice(pos,m.index).includes('<')||xml.slice(pos,m.index).includes('>')||stack.length===1&&/[^\s]/.test(xml.slice(pos,m.index)))throw Error('Unexpected XML text');pos=m.index+m[0].length;
  const token=m[1];if(token.startsWith('/')){if(!/^\/[A-Za-z_][\w.:-]*\s*$/.test(token)||stack.length===1||stack.pop().qualified!==token.slice(1).trim())throw Error('XML nesting');continue;}
  const nm=token.match(/^([A-Za-z_][\w.:-]*)([\s\S]*)$/);if(!nm)throw Error('XML tag');let attrs=nm[2],self=/\/\s*$/.test(attrs);if(self)attrs=attrs.replace(/\/\s*$/,'');const a={};let used=0;
  for(const am of attrs.matchAll(/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g)){if(attrs.slice(used,am.index).trim())throw Error('XML attribute');used=am.index+am[0].length;if(Object.hasOwn(a,am[1]))throw Error('Duplicate attribute');a[am[1]]=decode(am[2]??am[3]);}if(attrs.slice(used).trim())throw Error('XML attributes');
  const namespaces={...(stack.at(-1).namespaces||{})};for(const [key,value]of Object.entries(a))if(key==='xmlns')namespaces['']=value;else if(key.startsWith('xmlns:'))namespaces[key.slice(6)]=value;const prefix=nm[1].includes(':')?nm[1].split(':')[0]:'';if(prefix&&!namespaces[prefix])throw Error('XML namespace');const node={qualified:nm[1],name:nm[1].split(':').pop(),namespace:namespaces[prefix]||'',namespaces,attrs:a,children:[]};stack.at(-1).children.push(node);if(++nodes>1500||stack.length>12)throw Error('XML limit');if(!self)stack.push(node);
 }
 if(stack.length!==1||xml.slice(pos).trim()||root.children.length!==1)throw Error('XML incomplete');
 const env=root.children[0];if(env.name!=='Envelope'||env.namespace!=='http://schemas.xmlsoap.org/soap/envelope/')throw Error('SOAP envelope');
 const body=env.children.filter(x=>x.name==='Body');if(body.length!==1||body[0].namespace!=='http://schemas.xmlsoap.org/soap/envelope/'||body[0].children.length!==1)throw Error('SOAP body');const response=body[0].children[0];if(response.name!=='StatusNespolehlivySubjektRozsirenyResponse'||response.namespace!=='http://adis.mfcr.cz/rozhraniCRPDPH/')throw Error('SOAP response');
 const status=response.children.filter(x=>x.name==='status'),subjects=response.children.filter(x=>x.name==='statusSubjektu');
 if(status.length!==1||status[0].namespace!==response.namespace)throw Error('SOAP status');
 if(['2','3'].includes(status[0].attrs.statusCode)){const e=Error('Maintenance');e.status=503;throw e;}
 if(status[0].attrs.bezVypisuUctu||status[0].attrs.statusCode!=='0'||!date(status[0].attrs.odpovedGenerovana)||subjects.length!==1)throw Error('SOAP status');
 const s=subjects[0];if(s.namespace!==response.namespace||status[0].namespace!==response.namespace||s.attrs.dic!==dic||!['PLATCE_DPH','IDENTIFIKOVANA_OSOBA','NESPOLEHLIVA_OSOBA','SKUPINA_DPH','NENALEZEN'].includes(s.attrs.typSubjektu)||!['ANO','NE','NENALEZEN'].includes(s.attrs.nespolehlivyPlatce))throw Error('SOAP identity');
 const descendants=[response];while(descendants.length){const node=descendants.pop();if(node.namespace!==response.namespace)throw Error('SOAP namespace');descendants.push(...node.children);}
 const accounts=[];for(const list of s.children.filter(x=>x.name==='zverejneneUcty'))for(const u of list.children){if(u.name!=='ucet')throw Error('SOAP account');if(u.attrs.datumZverejneniUkonceni){if(!date(u.attrs.datumZverejneniUkonceni))throw Error('SOAP end date');if(Date.parse(u.attrs.datumZverejneniUkonceni)<=Date.now())continue;}const x=u.children[0];if(u.children.length!==1||!date(u.attrs.datumZverejneni))throw Error('SOAP account');let display;
  if(x.name==='standardniUcet'){const a=x.attrs;if(!/^\d{1,10}$/.test(a.cislo)||!/^\d{4}$/.test(a.kodBanky)||(a.predcisli&&!/^\d{1,6}$/.test(a.predcisli)))throw Error('SOAP account');display=(a.predcisli?Number(a.predcisli)+'-':'')+Number(a.cislo)+'/'+a.kodBanky;}
  else if(x.name==='nestandardniUcet'&&/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x.attrs.cislo||''))display=x.attrs.cislo;
  else throw Error('SOAP account format');accounts.push({display,publishedOn:u.attrs.datumZverejneni});
 }if(accounts.length>100)throw Error('Too many accounts');
 return{status:s.attrs.typSubjektu,unreliable:s.attrs.nespolehlivyPlatce,publishedAccounts:accounts,unreliableSince:date(s.attrs.datumZverejneniNespolehlivosti),generatedOn:status[0].attrs.odpovedGenerovana};
}
// Search extends the existing authenticated relay, never accepts a client URL.
async function firmSearch(req,res){
 const key='ares-search';let window=firmWindows.get(key);if(!window){window={active:0,calls:[]};firmWindows.set(key,window);}
 if(window.active>=2){req.resume();return reply(res,429);}window.active++;
 const timer=setTimeout(()=>req.destroy(),3000);
 try{
  const parts=[];let bytes=0;for await(const p of req){bytes+=p.length;if(bytes>1024)throw Error('Body limit');parts.push(p);}clearTimeout(timer);
  const wire=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  // Reject duplicate/escaped keys; JSON string escapes in the name remain legitimate.
  if(!/^\s*\{\s*"name"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"start"\s*:\s*\d+\s*\}\s*$/.test(wire))return reply(res,400);
  const {name,start}=JSON.parse(wire);
  if(typeof name!=='string'||name!==name.trim()||name.length<3||name.length>100||/[\p{Cc}\p{Cf}]/u.test(name)||/[<>\/\\?#]/.test(name)||!/[\p{L}]/u.test(name)||!Number.isInteger(start)||start<0||start>990||start%10)return reply(res,400);
  const now=Date.now();while(window.calls.length&&window.calls[0]<=now-60000)window.calls.shift();if(window.calls.length>=10)return reply(res,429);window.calls.push(now);
  const raw=await boundedUpstream(FIRM_REST+'ekonomicke-subjekty/vyhledat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({obchodniJmeno:name,start,pocet:10})},256000);
  if(!Number.isInteger(raw.pocetCelkem)||raw.pocetCelkem<0||raw.pocetCelkem>1000||!Array.isArray(raw.ekonomickeSubjekty)||raw.ekonomickeSubjekty.length>10||raw.ekonomickeSubjekty.length>raw.pocetCelkem)throw Error('Search schema');
  const seen=new Set();const candidates=raw.ekonomickeSubjekty.map(x=>{
   if(!validIco(x.ico)||seen.has(x.ico)||typeof x.obchodniJmeno!=='string'||!x.obchodniJmeno.trim()||x.obchodniJmeno.length>500||!/^\d{3}$/.test(x.pravniForma||''))throw Error('Candidate schema');seen.add(x.ico);
   const sole=['101','102','104','105','107','108','424','425'].includes(x.pravniForma);
   return{ico:x.ico,name:x.obchodniJmeno,seat:text(sole?x.sidlo?.nazevObce:x.sidlo?.textovaAdresa)};
  });
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({total:raw.pocetCelkem,candidates}));
 }catch(e){if(!res.destroyed)reply(res,e.message==='Body limit'?400:502);}finally{clearTimeout(timer);window.active--;}
}
async function firmRegistry(req,res){
 const kind=req.url.split('/').pop();let window=firmWindows.get(kind);
 if(!window){window={active:0,calls:[]};firmWindows.set(kind,window);}
 if(window.active>=2){req.resume();return reply(res,429);}window.active++;
 const timer=setTimeout(()=>req.destroy(),3000);
 try{
  const parts=[];let size=0;for await(const p of req){size+=p.length;if(size>64)throw Error('Body limit');parts.push(p);}clearTimeout(timer);
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  // Exact wire format prevents duplicate JSON keys, escape aliases and client URLs.
  const match=raw.match(kind==='ares-profile'?/^\s*\{\s*"ico"\s*:\s*"(\d{8})"\s*\}\s*$/:/^\s*\{\s*"dic"\s*:\s*"(\d{8})"\s*\}\s*$/);
  if(!match||kind==='ares-profile'&&!validIco(match[1]))return reply(res,400);
  const b=kind==='ares-profile'?{ico:match[1]}:{dic:match[1]},now=Date.now();
  while(window.calls.length&&window.calls[0]<=now-(kind==='dph'?86400000:60000))window.calls.shift();
  const count=ms=>window.calls.filter(t=>t>now-ms).length;
  if(count(60000)>=(kind==='dph'?10:20)||kind==='dph'&&(count(3600000)>=500||window.calls.length>=4000))return reply(res,429);
  window.calls.push(now);let out;
  if(kind==='ares-profile'){
   const signal=AbortSignal.timeout(3500);
   const identity=minimalIdentity(await boundedUpstream(FIRM_REST+'ekonomicke-subjekty/'+b.ico,{signal}),b.ico);
   const vr=identity.registrations.stavZdrojeVr;
   const [register,resData]=await Promise.all([
    identity.soleTrader||vr==='NEEXISTUJICI'?Promise.resolve({status:'NENÍ_V_REJSTŘÍKU'}):['AKTIVNI','ZANIKLY'].includes(vr)?boundedUpstream(FIRM_REST+'ekonomicke-subjekty-vr/'+b.ico,{signal},512000).then(x=>minimalRegister(x,b.ico)).catch(()=>({status:'NEOVĚŘENO'})):Promise.resolve({status:'NEOVĚŘENO'}),
    boundedUpstream(FIRM_REST+'ekonomicke-subjekty-res/'+b.ico,{signal},64000).then(x=>{if(![b.ico,'ARES_'+b.ico].includes(x.icoId)||!Array.isArray(x.zaznamy)||x.zaznamy.filter(r=>r.primarniZaznam===true).length!==1)throw Error('RES schema');const r=x.zaznamy.find(r=>r.primarniZaznam===true);if(!r.statistickeUdaje||typeof r.statistickeUdaje!=='object')throw Error('RES schema');return r;}).catch(()=>null)
   ]);
   const code=resData?.statistickeUdaje?.kategoriePoctuPracovniku;out={identity,register,employees:code&&code!=='000'&&firmLabels.employees[code]?{code,label:firmLabels.employees[code]}:null,resVerified:Boolean(resData),isirFlag:identity.registrations.stavZdrojeIr||null};
  }else{
   const envelope='<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:d="http://adis.mfcr.cz/rozhraniCRPDPH/"><soap:Body><d:StatusNespolehlivySubjektRozsirenyV2Request><d:dic>'+b.dic+'</d:dic></d:StatusNespolehlivySubjektRozsirenyV2Request></soap:Body></soap:Envelope>';
   out=parseDph(await boundedUpstream(DPH_URL,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'""'},body:envelope},64000,true),b.dic);
  }
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(out));
 }catch(e){if(!res.destroyed)reply(res,e.message==='Body limit'?400:e.status===404&&kind==='ares-profile'?404:e.status===503?503:502);}finally{clearTimeout(timer);window.active--;}
}

const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){return reply(res,200);}
 const supplied=Buffer.from(req.headers.authorization||'');
 if(req.method!=='POST'||!['/v1/chat/completions','/v1/contract/chat/completions','/v1/contract/turnstile','/v1/registry/ares','/v1/registry/ares-profile','/v1/registry/dph','/v1/registry/ares-search'].includes(req.url)||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){req.resume();return reply(res,403);}
 if(req.url==='/v1/registry/ares-search')return firmSearch(req,res);
 if(req.url==='/v1/registry/ares')return ares(req,res);
 if(['/v1/registry/ares-profile','/v1/registry/dph'].includes(req.url))return firmRegistry(req,res);
 const bot=req.url==='/v1/contract/turnstile',contract=req.url==='/v1/contract/chat/completions';
 if(bot?botActive>=2:contract?contractActive>=2:active>=1){req.resume();return reply(res,429);}
 if(bot)botActive++;else if(contract)contractActive++;else active++;
 const timer=setTimeout(()=>req.destroy(),3000);const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),bot?7000:contract?50000:12000);res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>(bot?8192:262144))throw Error('Body limit');parts.push(part);}clearTimeout(timer);
  const body=JSON.parse(Buffer.concat(parts));
  if(bot){
   if(Object.keys(body).length!==2||typeof body.secret!=='string'||!body.secret||body.secret.length>4096||typeof body.response!=='string'||!body.response||body.response.length>4096)return reply(res,400);
   const botUpstream=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(4000)]),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
   if(!botUpstream.ok){await botUpstream.body?.cancel();return reply(res,502);}
   const botReader=botUpstream.body.getReader();let botParts=[],botSize=0;try{while(true){const {done,value}=await botReader.read();if(done)break;botSize+=value.length;if(botSize>8192)throw Error('Response limit');botParts.push(Buffer.from(value));}}finally{await botReader.cancel();}const raw=Buffer.concat(botParts).toString();let result;try{result=JSON.parse(raw);}catch{return reply(res,502);}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({success:result.success===true,hostname:result.hostname,action:result.action}));
  }
  const contractSchema=Boolean(body.response_format?.json_schema?.schema?.properties?.schema_version?.enum?.length===1&&body.response_format.json_schema.schema.properties.schema_version.enum[0]==='contract-findings-v1');
  if(contract!==contractSchema)return reply(res,400);
  const expectedModel=contract?process.env.AI_CONTRACT_MODEL:'gpt-4.1-mini-2025-04-14';
  if(!expectedModel||body.model!==expectedModel||body.max_completion_tokens!==(contract?4000:800)||body.store!==false||body.stream!==false||body.tools||body.response_format?.type!=='json_schema'||body.response_format?.json_schema?.strict!==true||!Array.isArray(body.messages)||(!contract&&size>65536))return reply(res,400);
  const aiDeadline=setTimeout(()=>controller.abort(),contract?45000:12000);controller.signal.addEventListener('abort',()=>clearTimeout(aiDeadline),{once:true});res.once('finish',()=>clearTimeout(aiDeadline));
  const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!upstream.ok){await upstream.body?.cancel();return reply(res,[429,503].includes(upstream.status)?upstream.status:502);}
  const reader=upstream.body.getReader();const chunks=[];size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(Buffer.concat(chunks));
 }catch{if(!res.destroyed)reply(res,502);}finally{clearTimeout(timer);clearTimeout(deadline);if(bot)botActive--;else if(contract)contractActive--;else active--;}
});
server.maxConnections=64;server.maxRequestsPerSocket=100;server.requestTimeout=5000;server.headersTimeout=5000;server.listen(8080,'0.0.0.0');
process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(),1000).unref();});
