// Stage 4 S4.1: deterministic investment rules (pure, browser-only module).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateInvestment,INVESTMENT_RULES,INVESTMENT_ACTIONS,MISSING_INFO,RULES_VERSION,MAX_OFFER_CHARS} from '../public/investment-rules.js';
import {isSafeCopy,approvedLink} from '../public/verdict-model.js';

const ids=text=>evaluateInvestment(text).findings.map(f=>f.ruleId);
const find=(text,id)=>evaluateInvestment(text).findings.find(f=>f.ruleId===id);

// Every rule: ≥3 positive and ≥3 negative examples (negatives include negations,
// legitimate disclaimers, historical returns and quoted warnings).
const CASES={
 inv_guaranteed_return:{
  pos:['Nabízíme garantovaný výnos 8 % ročně.','Výnos vám garantujeme smluvně.','Zaručený zisk každý měsíc.','Jistý výnos bez starostí.'],
  neg:['Výnos není garantován a hodnota investice může klesat.','Minulé výnosy nejsou zárukou budoucích výnosů.','Pozor na nabídky s garantovaným výnosem.','Výnos nelze zaručit.','Fond nabízí kapitálovou ochranu, výnos závisí na trhu.']},
 inv_no_risk:{
  pos:['Investice je zcela bez rizika.','Riziko je nulové, peníze nemůžete ztratit.','100% jistota zhodnocení.','Nemůžete prodělat ani korunu.'],
  neg:['Žádná investice není bez rizika.','Nejde o investici bez rizika, hodnota může kolísat.','Investice nese riziko ztráty.','Nevěřte nabídkám bez rizika.']},
 inv_multiply:{
  pos:['Za rok zdvojnásobíte své peníze.','Váš vklad se ztrojnásobí do půl roku.','Získáte 10x více peněz než v bance.'],
  neg:['Hodnota akcií se za posledních 10 let zdvojnásobila u vkladu do indexu.','Nikdo vám nemůže slíbit, že zdvojnásobíte peníze.','Vaše úspory nezdvojnásobíme, investice nese riziko.','Počet klientů se zdvojnásobil.']},
 inv_periodic_return:{
  pos:['Vyděláte 2 % denně.','Výnos 5 % týdně je u nás standard.','Garantujeme 3 % měsíčně.','Očekávaný výnos 8 % měsíčně.'],
  neg:['Fond v roce 2023 vydělal 2 % měsíčně.','Očekávaný výnos 1 % měsíčně, investice nese riziko.','Poplatek za správu je 0,1 % měsíčně z hodnoty.','Za posledních 12 měsíců fond dosáhl 1,5 % měsíčně.']},
 inv_pressure:{
  pos:['Nabídka platí jen dnes!','Zbývají poslední volná místa.','Rozhodněte se ihned, jinak o příležitost přijdete.','Akce končí do 2 hodin.'],
  neg:['Neváhejte nás kontaktovat.','Odpovíme vám do 24 hodin.','Nemusíte se rozhodnout hned, vše si v klidu promyslete.','Dnes je pondělí a kancelář je otevřena.']},
 inv_immediate_transfer:{
  pos:['Pošlete ihned 50 000 Kč na účet.','Vložte peníze ještě dnes, jinak vklad propadne.','Okamžitě převeďte úspory na nový účet.','Zaplaťte do 30 minut poplatek za aktivaci účtu.'],
  neg:['Nikdy po vás nebudeme chtít okamžitě poslat peníze.','Poslali jsme vám dnes smlouvu k podpisu.','Peníze můžete vložit kdykoli, až si vše ověříte.','Pošlete nám ihned dotaz, rádi odpovíme.']},
 inv_crypto_payment:{
  pos:['Vklad proveďte v USDT.','Zaplaťte v bitcoinech na naši adresu.','Peníze pošlete na tuto bitcoinovou peněženku.','Vložte hotovost do kryptobankomatu.'],
  neg:['Fond investuje do kryptoměn a nese vysoké riziko.','Neposílejte peníze v kryptoměnách neznámým lidem.','Kryptoměny jsou volatilní aktivum.','Platbu provádíte převodem na účet fondu.']},
 inv_personal_account:{
  pos:['Peníze pošlete na můj účet.','Vklad zašlete na osobní účet poradce.','Platbu proveďte na účet vašeho manažera.'],
  neg:['Nikdy neposílejte peníze na osobní účet.','Platba probíhá na účet fondu vedený u depozitáře.','Můj účet v aplikaci ukazuje přehled investic.']},
 inv_remote_access:{
  pos:['Nainstalujte si AnyDesk, poradce vám pomůže.','Poradce se připojí přes TeamViewer.','Pro otevření účtu potřebujeme vzdálený přístup k počítači.'],
  neg:['Nikdy neinstalujte AnyDesk na pokyn cizí osoby.','Nikdy nikomu nedávejte vzdálený přístup.','Aplikaci si stáhnete z oficiálního obchodu.']},
 inv_credentials:{
  pos:['Sdělte nám potvrzovací kód z SMS.','Zadejte přihlašovací údaje do internetového bankovnictví.','Pro ověření nadiktujte číslo karty a CVV.','PIN nám pošlete e-mailem.'],
  neg:['Nikdy nikomu nesdělujte PIN ani potvrzovací kódy.','Po registraci zadejte heslo do aplikace.','Banka po vás nikdy nebude chtít přihlašovací údaje.']},
 inv_secrecy:{
  pos:['O investici neříkejte bance.','Nesdělujte to rodině, nepochopili by to.','Nechte si to pro sebe a nikomu nic neříkejte, nemluvte s okolím.'],
  neg:['Nikomu nesdělujte své heslo.','Poraďte se s rodinou nebo s bankou.','Nesdělujte nikomu PIN.']},
 inv_regulation_claim_negative:{
  pos:['Nepotřebujeme licenci ČNB.','Jsme mimo regulaci, proto máme vyšší výnosy.','Jsme licencováni na Seychelách.','Společnost je regulována na ostrově Vanuatu.'],
  neg:['Jsme regulováni Českou národní bankou.','Fond je registrován u ČNB.','Licenci ověříte v seznamu ČNB.']},
 inv_authority_endorsement:{
  pos:['Investice je schválena ČNB.','Výnos garantuje stát.','Projekt je podporován vládou a ministerstvem financí.'],
  neg:['ČNB nezaručuje výnos žádné investice.','Investice není garantována státem.','Na vklady se vztahuje Garanční systém finančního trhu, který je krytý zákonem.','Statistika garantuje přehled.']},
 inv_recovery_offer:{
  pos:['Vrátíme vaše ztracené peníze z kryptoměn.','Pomůžeme vám získat zpět ukradené investice.','Ztracené peníze vymůžeme za malý poplatek.'],
  neg:['Nikdo vám ztracené peníze za poplatek nevrátí.','Vrátíme vám dotaz s odpovědí.','Pokud jste přišli o peníze, obraťte se na policii.']},
 inv_referral:{
  pos:['Bonus 500 Kč za každého nového člena.','Vydělávejte na každém novém investorovi.','Přiveďte přátele a získáte provizi z jejich vkladu.'],
  neg:['Doporučte nás přátelům.','Zisk z každého obchodu se zdaňuje.','Klienti si mohou pozvat poradce domů.']}
};

test('catalogue: every rule has ≥3 positive and ≥3 negative cases and they hold', () => {
 assert.deepEqual(Object.keys(CASES).sort(),Object.keys(INVESTMENT_RULES).sort());
 for(const [id,{pos,neg}] of Object.entries(CASES)){
  assert(pos.length>=3&&neg.length>=3,id);
  for(const text of pos)assert(ids(text).includes(id),`${id} should match: ${text} → ${ids(text)}`);
  for(const text of neg)assert(!ids(text).includes(id),`${id} must not match: ${text} → ${ids(text)}`);
 }
});

test('legitimate offer with standard disclaimers yields no risk signal', () => {
 const legit='Podílový fond XY spravuje investiční společnost regulovaná ČNB, IČO 27082440. Minulé výnosy nejsou zárukou budoucích výnosů. Hodnota investice může klesat i stoupat a není zaručena návratnost vložené částky. Fond v roce 2024 dosáhl zhodnocení 18 %. Doporučujeme investovat jen peníze, které nebudete potřebovat. Neváhejte nás kontaktovat, odpovíme do 24 hodin.';
 const r=evaluateInvestment(legit);
 assert.deepEqual(r.findings,[]);
 assert.equal(r.actions.primary.id,'cnb_registry');
 assert(!r.missing.some(m=>m.id==='provider_identity'),'labelled valid IČO counts as provider identity');
});

test('D3: guaranteed return escalates only with no-risk, multiplication, periodic or ≥15 % a year', () => {
 const sev=t=>find(t,'inv_guaranteed_return')?.severity;
 assert.equal(sev('Garantovaný výnos 8 % ročně.'),'attention');
 assert.equal(sev('Garantovaný výnos 14 % ročně.'),'attention');
 assert.equal(sev('Garantovaný výnos 15 % ročně.'),'serious');
 assert.equal(sev('Garantovaný výnos 30 % p. a.'),'serious');
 assert.equal(sev('Garantovaný výnos 3 % měsíčně.'),'serious');
 assert.equal(sev('Garantovaný výnos, investice je bez rizika.'),'serious');
 assert.equal(sev('Garantovaný výnos, vklad zdvojnásobíte.'),'serious');
 // Amount alone is never a finding (D3): no guarantee wording → no guaranteed rule.
 assert.deepEqual(ids('Očekávaný výnos 25 % ročně.'),[]);
 assert.deepEqual(ids('Akcie loni vynesly 40 %.'),[]);
});

test('historical returns are not flagged by percentage', () => {
 for(const t of ['Fond loni vydělal 3 % měsíčně.','Historický výnos 2 % týdně za rok 2021.','V minulosti dosáhl 1 % denně.','Za posledních 5 let fond zhodnotil vklady 120 %.','V roce 2020 se hodnota vkladu zdvojnásobila.'])
  assert.deepEqual(ids(t),[],t);
});

test('negations and quoted warnings do not trigger, while scam text after a comma or sentence still does', () => {
 for(const t of ['Nevěřte slibům, že nemůžete prodělat.','Pozor na nabídky typu garantovaný výnos.','Dejte si pozor na garantovaný výnos.','Typický znak podvodu: garantovaný zisk.','ČNB upozorňuje, že nikdo nemůže zaručit výnos.'])
  assert(!ids(t).some(id=>['inv_guaranteed_return','inv_no_risk'].includes(id)),t+' → '+ids(t));
 assert(ids('Pozor na podvodníky, my vám garantujeme výnos 20 % ročně.').includes('inv_guaranteed_return'));
 assert(ids('Bojíte se podvodů? Garantovaný zisk u nás.').includes('inv_guaranteed_return'));
});

test('evidence quotes the original suspicious claim (diacritics kept), bounded and de-duplicated', () => {
 const r=evaluateInvestment('Úvod.  Garantovaný   výnos 30 % ročně!\nPošlete ihned peníze. Garantovaný výnos 30 % ročně!');
 const g=r.findings.find(f=>f.ruleId==='inv_guaranteed_return');
 assert.deepEqual(g.evidence,['Garantovaný výnos']);
 assert.deepEqual(r.findings.find(f=>f.ruleId==='inv_immediate_transfer').evidence,['Pošlete ihned']);
 const long=evaluateInvestment('Garantujeme '+'x'.repeat(10)+' že zisk bude vysoký.');
 assert(long.findings[0].evidence[0].length<=120);
 for(const f of evaluateInvestment('Vyděláte 2 % denně. Vyděláte 3 % týdně. Vyděláte 4 % denně.').findings)assert(f.evidence.length<=2);
});

test('result separates risk signals, missing information and recommended steps; no raw text, no score', () => {
 const text='Tajný projekt Alfa: garantovaný výnos, pošlete ihned 10 000 Kč na můj účet.';
 const r=evaluateInvestment(text);
 assert.deepEqual(Object.keys(r),['schema','rulesVersion','findings','missing','actions','input']);
 assert.equal(r.rulesVersion,RULES_VERSION);
 assert.deepEqual(r.missing.map(m=>m.id),['cnb_authorization','claims_unverified','provider_identity','sender_relation']);
 assert.equal(r.actions.primary.id,'no_transfer');
 assert.deepEqual(r.actions.secondary.map(a=>a.id),['cnb_registry','cnb_warnings','own_contact','no_access','no_pressure','already_paid']);
 assert.deepEqual(r.input,{chars:text.length,ico:null});
 const json=JSON.stringify(r);
 assert(!json.includes('Tajný projekt Alfa'),'raw text beyond quotes is not returned');
 assert.doesNotMatch(json,/score|risk_level|probab|"weight"/i);
 assert(Object.isFrozen(r)&&Object.isFrozen(r.findings)&&Object.isFrozen(r.actions.primary));
 // A supplied valid IČO removes the provider-identity gap; an invalid one is rejected.
 assert(!evaluateInvestment(text,{ico:'27082440'}).missing.some(m=>m.id==='provider_identity'));
 assert.throws(()=>evaluateInvestment(text,{ico:'27082441'}),/INVALID_ICO/);
});

test('primary action is chosen deterministically from findings', () => {
 const p=t=>evaluateInvestment(t).actions.primary.id;
 assert.equal(p('Nainstalujte AnyDesk a pošlete ihned peníze.'),'no_access');
 assert.equal(p('Vrátíme vaše ztracené peníze.'),'already_paid');
 assert.equal(p('Vklad v USDT.'),'no_transfer');
 assert.equal(p('Nabídka platí jen dnes.'),'no_pressure');
 assert.equal(p('Garantovaný výnos.'),'cnb_registry');
});

test('copy is safe: no safety claim, no percentage, links only to approved ČNB pages or the local help page', () => {
 for(const r of Object.values(INVESTMENT_RULES)){assert(isSafeCopy(r.title),r.title);assert(isSafeCopy(r.explanation),r.explanation);assert(['serious','attention'].includes(r.severity));}
 for(const a of Object.values(INVESTMENT_ACTIONS)){
  assert(isSafeCopy(a.text),a.text);
  if(a.link){assert(isSafeCopy(a.link.label));assert(approvedLink(a.link.url)||a.link.url==='/uz-se-to-stalo',a.link.url);}
 }
 for(const t of Object.values(MISSING_INFO))assert(isSafeCopy(t),t);
});

test('input validation', () => {
 for(const bad of [undefined,null,42,'','   ','x'.repeat(MAX_OFFER_CHARS+1)])assert.throws(()=>evaluateInvestment(bad),/INVALID_OFFER/);
 assert.doesNotThrow(()=>evaluateInvestment('  '+'x'.repeat(MAX_OFFER_CHARS)+'  '));
});

test('Unicode: invisible characters, fullwidth digits, NBSP, combining marks and emoji do not hide claims', () => {
 assert(ids('Gar​antovaný výnos 30 % ročně').includes('inv_guaranteed_return'));
 assert.equal(find('Garantovaný výnos １５ ％ ročně','inv_guaranteed_return').severity,'serious');
 assert(ids('Investice je BEZ RIZIKA!!!').includes('inv_no_risk'));
 assert(ids('Investice je bez rizika').includes('inv_no_risk')); // decomposed diacritics (NFD)
 assert(ids('Poradce použije Any⁠Desk 💻').includes('inv_remote_access'));
 assert(ids('‮Vyděláte 2 % denně‬').includes('inv_periodic_return'));
 const q=find('🚀🚀 Garantovaný výnos 🚀','inv_guaranteed_return').evidence[0];
 assert.equal(q,'Garantovaný výnos');
 // Control and bidi characters never appear in quotes.
 const r=evaluateInvestment('Pošlete\u0007 ihned‮ peníze');
 assert.doesNotMatch(JSON.stringify(r.findings),/[\u0000-\u001f‪-‮]/);
});

test('determinism: same input → identical result; order of sentences does not change the set of rules', () => {
 const a='Garantovaný výnos 20 % ročně. Pošlete ihned peníze na můj účet. Nainstalujte AnyDesk.';
 const first=JSON.stringify(evaluateInvestment(a));
 for(let i=0;i<50;i++)assert.equal(JSON.stringify(evaluateInvestment(a)),first);
 const b=a.split('. ').reverse().join('. ');
 assert.deepEqual(ids(b).sort(),ids(a).sort());
});

test('long and adversarial inputs stay linear (ReDoS): < 20 ms thread CPU per 20 000 characters', t => {
 const samples={
  realistic:('Garantovaný výnos 20 % ročně, pošlete ihned peníze na můj účet. Nainstalujte AnyDesk. '.repeat(300)).slice(0,20000),
  keywords:('garant '.repeat(4000)).slice(0,20000),
  percents:('1 % '.repeat(6000)).slice(0,20000),
  noSentenceEnd:('vynos zisk garantovany bez rizika posl vloz ihned '.repeat(500)).slice(0,20000),
  negations:('ne nikdy zadny '.repeat(2000)).slice(0,20000),
  digits:('12345678 '.repeat(3000)).slice(0,20000),
  invisible:('g​'.repeat(10000)).slice(0,20000),
  combining:('á'.repeat(10000)).slice(0,20000)
 };
 for(const [name,text] of Object.entries(samples)){
  for(let i=0;i<3;i++)evaluateInvestment(text);
  // Best of 3 measured runs: one GC pause must not decide; the threshold stays 20 ms.
  let ms=Infinity,r;
  for(let i=0;i<3;i++){const before=process.threadCpuUsage();r=evaluateInvestment(text);const used=process.threadCpuUsage(before);ms=Math.min(ms,(used.user+used.system)/1000);}
  t.diagnostic(`${name}: ${ms} ms`);
  assert(ms<20,`${name} took ${ms} ms thread CPU`);
  for(const f of r.findings)assert(f.evidence.length<=2&&f.evidence.every(q=>q.length<=120));
 }
});

test('static boundary: pure module without DOM, network, storage, clock or randomness; Stage 3 untouched', () => {
 const src=readFileSync(new URL('../public/investment-rules.js',import.meta.url),'utf8');
 assert.deepEqual([...src.matchAll(/^import[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]),['./check-plan.js']);
 assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.|window\.|innerHTML|Date\.now|new Date|Math\.random|eval\(|new Function/);
 // Stage 3 modules do not know about the investment module yet (S4.2+).
 for(const f of ['check-plan.js','check-flow.js','check-view.js','verdict-model.js'])
  assert.doesNotMatch(readFileSync(new URL('../public/'+f,import.meta.url),'utf8'),/investment-rules/,f);
});
