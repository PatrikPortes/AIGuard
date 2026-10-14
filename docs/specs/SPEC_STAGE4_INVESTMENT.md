# Stage 4 – Prověřit investici

*Návrh a specifikace. Nic není implementováno.*
*Produkce: `ff9615c54f388bd408d9d7915cce886a85452a03` (Stage 0–3), větev `release/web-checker-2-2026-10-13`.*
*Navazuje na `docs/specs/SPEC_STAGE3_ORCHESTRATOR.md` (zejména kap. 10 STAGE4_EXTENSION_POINT a kap. 12), `SPEC_STAGE1_STAGE2.md` (CheckResult, L1–L5) a `SPEC_PROVERIT_FIRMU.md`.*
*Termín soutěže: 26. října 2026. Návrh preferuje malé funkční MVP.*

---

## 0. SHRNUTÍ

- Nová stránka **`/proverit-investici`**: uživatel vloží text investiční nabídky a volitelně IČO poskytovatele.
- **Text nabídky zůstane v prohlížeči.** Investiční pravidla jsou čistý deterministický modul, který běží v prohlížeči.
- Odkazy v textu prověří existující Web checker v prohlížeči (P4). IČO prověří existující `/api/firm` (P3/P5).
- Orchestrace přes **existující Stage 3**: `check-plan.js` (nové pravidlo P8), `check-flow.js` (`runPlan`), `check-view.js`, agregace A1–A6 beze změny.
- **Žádné nové API, endpoint, relay route, egress ani závislost.** Na serveru přibudou jen statické assety a route stránky.
- **ČNB v MVP:** žádné automatické ověření oprávnění. Výsledek vždy říká „Oprávnění ČNB jsme neověřili“ a nabídne přímé odkazy na seznamy a upozornění ČNB. Automatizace je V2 (kap. 5.3).
- Výsledek nikdy není zelený. Aplikace netvrdí, že investice je bezpečná, a nedává investiční doporučení.

---

## 1. SOUČASNÝ STAV (ověřeno v kódu `ff9615c`)

### 1.1 Investice v aplikaci dnes

| Místo | Stav |
|---|---|
| `public/index.html` | karta „Prověřit investici“ se stavem **„Již brzy“**. V přehledu podvodů je řádek „Investice s jistým výnosem“. |
| Stránka investice | **neexistuje** (žádné HTML, route ani JS) |
| `src/analysis.js` | jedno pravidlo zprávy `investment` (váha 45): `garantovan…(vynos\|zisk)`, `bez rizika`, `zdvojnasob…`, `% denne/tydne`. Běží jen na serveru v `/api/analyze`. |
| `public/verdict-model.js`, `verdict-catalog.js` | `investment` je jen **ID nálezu** v katalogu zprávy a půjčky, ne samostatný checker |
| ČNB | jen odkazy (`www.cnb.cz`) a texty u půjčky („Registr ČNB jsme neprohledávali“). Žádný datový zdroj ČNB. |

### 1.2 Stage 3: co lze bezpečně znovu použít

| Komponenta | Použití ve Stage 4 | Změna |
|---|---|---|
| `public/check-plan.js` | planner P1–P7, `BUDGET`, agregace A1–A6, `createCombinedResult`, `validateCombinedResult`, `CHECKER_REGISTRY`, `PLANNER_RULES` | **aditivní:** checker `investment`, vstup `offer`, pravidlo P8; `investment` v A5 (nikdy zelená) |
| `public/check-flow.js` | `runPlan` (deadline 5 s, web krok v prohlížeči, firm krok přes `/api/firm`, whitelist výsledků) | **aditivní:** executor kroku `investment` a `runInvestmentCheck`/`startInvestmentCheck` |
| `public/check-view.js` | „Co jsme prověřili“, detaily přes `renderVerdict`, „Co jsme neprověřili“ | **aditivní:** popisek `investment: 'Investice'` |
| `public/verdict-model.js` | `CheckResult` schema 1, L1–L5, `isSafeCopy`, `approvedLink` (`www.cnb.cz` už povolen) | **aditivní:** `'investment'` v `CHECKERS`, `RULE_CATALOG.investment`, výchozí akce |
| `public/verdict-view.js`, `verdict.css` | renderer dílčího výsledku | beze změny |
| `public/web-checker.js` + `eshop-checker.js` | `checkWebUrl`, `coiResult` (čisté funkce, po S3.7 importovatelné kdekoli) | beze změny |
| `/api/firm` + `firmClient` | ARES, VR, RES, DPH, sdílené limity a cache | beze změny |
| `/api/check` + `src/check-runner.js` | serverový runner | **nepoužije se** v MVP (text nabídky na server nejde) |
| Věrka a Robo (`character-assets.js`) | stávající assety | beze změny |

**Závěr:** nový orchestrátor není potřeba. Stage 4 je přesně rozšíření popsané ve Stage 3 kap. 10, jen s klientským runnerem místo serverového (stejně jako S3.6 a S3.7).

---

## 2. CÍLOVÝ STAV (MVP)

### 2.1 Uživatelský postup

```
/proverit-investici
 1. Vložte text nabídky (e-mail, zpráva, popis z webu nebo hovoru) ≤ 10 000 znaků
    + volitelně: IČO poskytovatele (8 číslic)
 2. [Prověřit nabídku]
 3. Prohlížeč:
    planCheck({offer, ico?}, {runAt:'client', normalizeUrl})
      P8  investment  – investiční pravidla (lokálně)          required, primary
      P4  web ×≤2     – odkazy z textu (lokálně + kopie ČOI)    required
      P3  firm        – zadané IČO  → /api/firm {"ico"}         required
      P5  firm        – jediné IČO s návěštím v textu (pokud P3 chybí)  nepovinné
      P6/P7 dedup a limity (≤4 kroky)
 4. Výsledek: společný verdikt + „Co jsme prověřili“ + checklist „Než pošlete peníze“
```

### 2.2 Co výsledek rozlišuje

| Kategorie | Zdroj v datech | Příklad v UI |
|---|---|---|
| **Ověřené skutečnosti** | `facts[kind=registry]` (jen ARES/DPH/COI) | „Firma s IČO 27082440 je v ARES vedena jako …“ |
| **Rizikové signály** | `findings[origin=rules]` investičních pravidel a webu | „Garantovaný vysoký výnos“ |
| **Neověřené informace** | `unknowns`, `sources[status≠checked]`, ČNB vždy `skipped` | „Oprávnění ČNB jsme neověřili“, „Tvrzení o výnosu jsme neověřovali“ |
| **Nedokončené kontroly** | `outcome.status ∈ {failed, skipped}`, `plan.notPlanned` | „Firma – Přeskočeno: vypršel čas“, „2 další IČO jsme neprověřili“ |

### 2.3 Co MVP nedělá

- Nedoporučuje investovat ani neinvestovat. Nehodnotí produkt, výnosnost ani vhodnost.
- Netvrdí, že investice nebo firma je bezpečná, ani že oprávnění existuje či neexistuje.
- Neodhaduje regulaci podle názvu produktu ani poskytovatele.
- Neposílá text nabídky na server ani do AI.
- Nehledá firmu podle názvu (jen podle IČO, stejně jako Stage 2).

---

## 3. ARCHITEKTURA

### 3.1 Tok dat

```
prohlížeč (/proverit-investici)
 ├─ investment-rules.js  evaluateInvestment(offer) ─► fromInvestment() ─► CheckResult(investment)
 ├─ web-checker.js       checkWebUrl(url) + coiResult(/eshop-coi.json) ─► fromWeb()        (P4)
 └─ check-flow.js        fetch /api/session, POST /api/firm {"ico"} ─► CheckResult(firm)   (P3/P5)
        ▼
 check-plan.js  aggregate A1–A6 ─► CombinedResult ─► check-view.js renderCombinedResult
```

- **Server:** jen nová statická route `/proverit-investici` a allowlist nových assetů (`investment.html`, `investment.js`, `investment-rules.js`). Sitemap a homepage karta jsou samostatný krok.
- **`/api/check` se nemění** a nepoužívá se. Text nabídky na server nejde.

### 3.2 Změny modelu (aditivní)

**`check-plan.js`**
```js
CHECKER_REGISTRY.investment = {entityKinds:['investment_offer'], runAt:'client', requiredDefault:true}
// nový vstupní klíč; vzájemně výlučný s `text`, stejné limity (1–20 000 po trimu)
planCheck({offer, ico?, url?}, {runAt:'client', normalizeUrl})
// P8: offer přítomen → step {checker:'investment', input:{kind:'text', ref:'offer'},
//     trigger:'user_field', required:true, primary:!urlField, runAt:'client'}
// P4/P5 extrahují z textu nabídky stejně jako z `text`
// `offer` na serveru (runAt:'server') → throw 'OFFER_NOT_ALLOWED'
// REASONS.P8 = 'Vložili jste text investiční nabídky.'
// A5: rows.find(r => ['message','web','investment'].includes(r.step.checker))
```

- Validátor: `offer` a `text` současně → `INVALID_INPUT`.
- Pravidlo P8 se validuje stejně přísně jako P1.
- `PLANNER_RULES` dostane P8 **na konec** seznamu ID; P1–P7 se nemění.
- Byte-for-byte baseline test S3.2a (`check-plan-2dcf1ac.js`) musí dál projít.

**`verdict-model.js`**
- `CHECKERS += 'investment'`.
- `RULE_CATALOG.investment = [ID z kap. 4]`.
- `defaultActions.investment = 'Než pošlete peníze, ověřte poskytovatele v seznamech ČNB a nabídku přes kontakt, který si najdete sami.'`
- Registry fakta zůstávají jen ARES/DPH/COI. **Žádné ČNB fakty v MVP.**

**`investment-verdict.js`** (nový, vzor `firm-verdict.js`)
```js
fromInvestment(evaluation, {checkedAt}) → createCheckResult({
  checker:'investment',
  findings,                                 // z pravidel, origin 'rules'
  sources:[
    {id:'investment_rules', label:'Pravidla pro investiční nabídky', status:'checked'},
    {id:'cnb_registry', label:'Seznamy a upozornění ČNB', status:'skipped',
     note:'Automaticky neověřujeme. Ověřte ručně.'}
  ],
  policy:{primary:'investment_rules', required:[], canConfirmAbsence:false},   // nikdy zelená
  unknowns:[…kap. 5.2…],
  actions:{primary, secondary},             // pevný katalog, kap. 6.3
  verifyLinks:[ČNB JERRS, ČNB Upozornění na aktivity]                         // www.cnb.cz – už schváleno
})
```

### 3.3 Proč klientský runner a text v prohlížeči

- Investiční nabídka často obsahuje jméno, telefon a výši úspor. Lokální pravidla dávají nejlepší soukromí bez nového API.
- Shoduje se s kap. 12 Stage 3 (URL jen v prohlížeči, firma jen přes `/api/firm`).
- Nevyžaduje změnu produkční konfigurace ani limitů.
- Cena: obecná pravidla zprávy (`src/analysis.js`) na stránce investice neběží. Relevantní obecné signály (nátlak, utajení, přihlašovací údaje, vzdálený přístup) proto investiční katalog obsahuje sám (kap. 4).

---

## 4. PRAVIDLA HODNOCENÍ (`public/investment-rules.js`)

### 4.1 Zásady

- Čistý ES modul: žádný DOM, síť ani úložiště. `evaluateInvestment(offer) → {findings:[{ruleId, evidence:[…]}], extracted:{percentages, periods}}`.
- **Deterministická regex pravidla nad normalizovaným textem.** Normalizace: NFKC → malá písmena → odstranění diakritiky → sjednocení mezer.
  - Regexy jsou omezené: `.{0,N}` s malým `N`, bez vnořených kvantifikátorů.
  - Vstup má nejvýš 20 000 znaků.
  - CPU test: < 20 ms na 20 000 znaků, 40k adversarial vstup.
- Každé pravidlo má **ID, závažnost, pevný český titul a vysvětlení** (`isSafeCopy`) a vrací **evidenci**: krátký úsek ≤ 120 znaků, zobrazený přes `textContent`.
- **Žádné skóre, váhy ani procenta bezpečnosti.** Úroveň určuje L1–L5:
  - ≥ 1 `serious` → 🔴;
  - jinak ≥ 1 `attention` → 🟠;
  - jinak ⚪ „Z dostupných údajů nelze posoudit“ (`canConfirmAbsence=false`).
- Pravidla hledají **tvrzení v textu**, ne pravdivost. Vysvětlení vždy říká, proč je tvrzení varovné, a nikdy netvrdí „je to podvod“.
- **Regulace se neodhaduje podle názvu.** Pravidla reagují jen na výslovná tvrzení v textu (např. „nepotřebujeme licenci“), nikdy na název produktu nebo firmy.

### 4.2 Katalog MVP

| ID | Závažnost | Spouštěč (zkráceně; přesné regexy v implementaci + testy) | Vysvětlení pro uživatele (zkráceně) |
|---|---|---|---|
| `inv_guaranteed_return` | **serious** | `garant\|zarucen\|jist` do 25 znaků od `vynos\|zisk\|zhodnoceni` **a** v textu je procento nebo násobek | Investice s garantovaným vysokým výnosem prakticky neexistuje. Výnos vždy nese riziko. |
| `inv_no_risk` | **serious** | `bez (jakehokoli )?rizika`, `nulove riziko`, `nemuzete (prodelat\|ztratit)`, `100 % jistota` | Žádná investice není bez rizika. Tvrzení o nulovém riziku je typické pro podvod. |
| `inv_multiply` | **serious** | `zdvojnasob\|ztrojnasob\|\d+\s?x (vic\|vice)` do 30 znaků od `penez\|vklad\|investic` | Slib znásobení vkladu za krátkou dobu je varovný signál. |
| `inv_periodic_return` | **attention** (serious, pokud zároveň `inv_guaranteed_return`) | `\d{1,3}([,.]\d{1,2})?\s?%` do 25 znaků od `denne\|tydne\|mesicne\|za den\|za tyden\|za mesic` | Pravidelný vysoký výnos za den, týden nebo měsíc je nereálný a typický pro podvodné platformy. |
| `inv_high_annual` | attention | procento ≥ **15** do 25 znaků od `rocne\|p\.a\.\|za rok` | Vysoký slíbený roční výnos vyžaduje zvýšenou opatrnost. Ověřte, kdo ho slibuje a jaké nese riziko. *(Práh je otevřené rozhodnutí D3.)* |
| `inv_pressure` | attention | `jen dnes`, `posledni (mista\|kusy)`, `nabidka konci`, `rozhodnete se (ihned\|hned)`, `do \d+ (hodin\|minut)` | Nátlak na rychlé rozhodnutí brání v klidném ověření. |
| `inv_immediate_transfer` | **serious** | `(posl\|preved\|vlozt)` do 30 znaků od `(ihned\|hned\|okamzite\|dnes)` a zároveň `(ucet\|penez\|kc\|eur\|bitcoin\|krypto)` | Požadavek na okamžitý převod peněz je hlavní znak investičního podvodu. |
| `inv_crypto_payment` | attention | `bitcoin\|btc\|usdt\|tether\|kryptomen\|krypto(bankomat\|atm)\|penezenk` + slovo platby | Platby v kryptoměnách jsou prakticky nevratné. Podvodníci je proto vyžadují. |
| `inv_personal_account` | attention | `na (muj\|osobni\|soukromy) ucet`, `ucet (poradce\|manazera\|brokera)` | Investiční firma nepřijímá peníze na osobní účet poradce. |
| `inv_remote_access` | **serious** | `anydesk\|teamviewer\|rustdesk\|quicksupport\|vzdalen(y\|eho) pristup` | Nikdy nikomu nedávejte vzdálený přístup k počítači nebo telefonu. |
| `inv_credentials` | **serious** | `(heslo\|pin\|potvrzovaci kod\|sms kod\|prihlasovaci udaje)` do 40 znaků od `(sdel\|zadej\|posl\|nadiktuj)` | Investiční firma nikdy nechce hesla ani kódy z bankovnictví. |
| `inv_secrecy` | attention | `(nerikejte\|neinformujte\|nesdelujte)` do 30 znaků od `(bance\|rodine\|nikomu\|policii)` | Žádost o utajení před bankou nebo blízkými je varovný signál. |
| `inv_regulation_claim_negative` | attention | `nepotrebujeme (licenci\|povoleni)`, `mimo regulac`, `regulace (neni\|se nevztahuje)`, `licenc` do 40 znaků od offshore jurisdikce z pevného seznamu (Seychely, Vanuatu, Svatý Vincenc, Marshallovy ostrovy…) | Tvrzení o licenci mimo EU nebo bez regulace neznamená ochranu investora v ČR. |
| `inv_authority_endorsement` | attention | `(schvalen\|garantovan\|zarucen\|doporucen)` do 30 znaků od `(cnb\|ceska narodni banka\|stat\|vlad\|ministerstv)` | ČNB ani stát nezaručují výnos konkrétní investice. Odkaz na ně podvodníci často zneužívají. |
| `inv_recovery_offer` | **serious** | `(vratime\|ziskame zpet\|vymahame)` do 40 znaků od `(ztracen\|ukraden\|prodelan)` + `(penez\|investic\|prostredk)` | Nabídky „vrácení ztracených investic“ za poplatek jsou častý druhý podvod na stejné oběti. |
| `inv_referral` | attention | `za kazdeho (noveho )?(clena\|klienta\|pritele)`, `doporuc\w* (pratele\|zname)` do 30 znaků od `(bonus\|odmen\|provize)` | Výnos závislý na získávání dalších lidí je znak pyramidového schématu. |
| `inv_celebrity` | attention | `(investuje\|doporucuje\|zbohatl)` do 30 znaků od pevného seznamu známých jmen | Známé osobnosti bývají v podvodných reklamách zneužité bez jejich vědomí. |
| `inv_info_provider_missing` | info | žádné IČO ani `icoField` | Nabídka neuvádí IČO. Poskytovatele jsme nemohli ověřit. |

Závazná pravidla katalogu:
- Při testech se katalog nesmí rozšiřovat bez testu. Každé pravidlo má ≥ 3 pozitivní a ≥ 3 negativní fixture, včetně legitimních formulací:
  - „výnos není zaručen“, „minulé výnosy nejsou zárukou“, „investice nese riziko ztráty“ **nesmí** spustit `inv_guaranteed_return` ani `inv_no_risk`.
  - To vyžaduje negaci v okně do 15 znaků před shodou: `ne(ni)?`, `nemuze`, `bez zaruky`.
- Seznamy jmen (celebrity, offshore) jsou malé, pevné a verzované v modulu. Jejich doplnění je změna kódu s testem.
- `inv_info_provider_missing` je jen informace a úroveň nezvyšuje.

### 4.3 Agregace

- Investiční výsledek je vždy **nejvýš `not_assessable`**, pokud nejsou nálezy.
- Kombinace s webem a firmou probíhá přes A1–A6 beze změny:
  - **serious** z kteréhokoli kroku vede na 🔴 (A1);
  - selhání povinného IČO kroku vede na 🟠 (A3).
- Nepovinné P5 IČO verdikt nezhorší, ale je vidět.
- Zápis firmy v ARES/DPH **nikdy nesníží** úroveň a nikdy nevede na zelenou (investiční krok je `canConfirmAbsence=false`, A5).

---

## 5. OVĚŘOVÁNÍ POSKYTOVATELE A DATOVÉ ZDROJE

### 5.1 Zdroje (ověřeno 2026-10-14)

| Zdroj | Co dává | Dostupnost / podmínky | MVP |
|---|---|---|---|
| **ARES, VR, RES, DPH** (existující `/api/firm`) | existence, název, sídlo, stav, insolvence v ARES, DPH | v produkci přes relay | **ANO** (P3/P5) |
| **ČOI rizikové e-shopy** (existující snapshot) | doména na seznamu ČOI | v produkci | **ANO** (P4, jen informačně) |
| **ČNB JERRS – webové služby** `getSubjekt` (SOAP, `aplc.cnb.cz/jerrsws/ws`) | registrace a oprávnění regulovaných subjektů podle IČO, včetně obchodníků s cennými papíry, investičních zprostředkovatelů a fondů | z prostředí analýzy **nedostupné** (timeout; stejně jako ve Stage 2). Podmínky nedohledány. Vyžaduje nový egress v relay. | **NE** (V2) |
| **ČNB otevřená data** (`/cs/dohled-financni-trh/seznamy/Otevrena-data/`, JSON a CSV `jerrs.cnb.cz/…OPENDATA.STAHUJ?p_seznam=1–7`) | banky, směnárny, nebankovní poskytovatelé a zprostředkovatelé **spotřebitelského úvěru** | dostupné (HTTP 200, `text/csv`) | **NE:** nepokrývá investiční firmy. Použitelné pro půjčky (mimo Stage 4). |
| **ČNB „Upozornění ČNB na aktivity“** (`/cs/dohled-financni-trh/ochrana-spotrebitele/upozorneni/`) | subjekty a platformy s možnými znaky neoprávněné činnosti na finančním trhu | stránka dostupná. Seznam se načítá AJAXem z CMS, **není to dokumentovaný strojově čitelný dataset**. Podmínky převzetí neověřeny. | **jen odkaz** (V2: snapshot, pokud ČNB potvrdí formát a podmínky) |
| ESMA / IOSCO I-SCAN, zahraniční regulátoři | zahraniční varování | mimo rozsah | NE |

### 5.2 Rozlišení stavů poskytovatele

V MVP se automaticky zjišťuje jen **identita podle IČO** (ARES). Oprávnění ČNB se neověřuje. Výsledek proto vždy uvádí, ve kterém stavu se poskytovatel nachází:

| Stav | Kdy (MVP) | Co ukážeme | Nikdy neříkáme |
|---|---|---|---|
| **Ověřená registrace u ČNB** | **v MVP nikdy** (vyžaduje JERRS, V2) | — | „Firma má licenci“ |
| **Subjekt nalezen v ARES** | P3/P5 a `/api/firm` vrátí profil | Fakta ARES/DPH + věta „Zápis v obchodním rejstříku neznamená oprávnění k investičním službám ani bezpečnost investice.“ | „Firma je ověřená nebo důvěryhodná“ |
| **Neověřený subjekt** | IČO chybí, je neplatné, nejednoznačné nebo registr nedostupný | `inv_info_provider_missing` nebo neúspěšný firm krok + „Poskytovatele jsme neověřili.“ | „Firma neexistuje“ (kromě výslovného výsledku ARES „nenalezeno“ ze Stage 2) |
| **Varování regulátora** | **v MVP se automaticky nezjišťuje** | Vždy odkaz „Zkontrolujte upozornění ČNB na aktivity“ | „ČNB nemá varování“ |
| **Registrace není pro činnost vyžadována** | **neurčujeme** (záleží na typu produktu a právní kvalifikaci) | Věta „Zda činnost vyžaduje oprávnění ČNB, z textu neurčíme. Pokud si nejste jistí, zeptejte se ČNB.“ | jakékoli odvození z názvu produktu nebo firmy |

Pevné texty v `unknowns` investičního výsledku:
1. „Oprávnění poskytovatele u ČNB jsme automaticky neověřili.“
2. „Tvrzení o výnosu, bezpečnosti ani regulaci v nabídce jsme neověřovali.“
3. „Nevíme, zda nabídku poslala firma, za kterou se odesílatel vydává.“

### 5.3 V2: automatizace ČNB (mimo termín soutěže)

1. **JERRS `getSubjekt` přes relay:**
   - pevný upstream, jen IČO, limity a cache jako Stage 2;
   - nový registry fact `source:'CNB'`;
   - pravidla:
     - `inv_cnb_registered` (info: „ČNB eviduje subjekt s oprávněním …“; nikdy nesnižuje úroveň);
     - `inv_cnb_not_found` (attention: „V seznamu ČNB jsme subjekt s tímto IČO nenašli. Neznamená to automaticky podvod.“).
   - Vyžaduje: ověřit podmínky a dostupnost, **změnit egress firewall** a samostatné review.
2. **Snapshot „Upozornění ČNB na aktivity“:**
   - jen pokud ČNB potvrdí strojově čitelný formát a podmínky převzetí;
   - offline synchronizace jako `scripts/sync-coi.py`;
   - porovnání podle **přesné domény a IČO**, nikdy podle podobnosti názvu.

---

## 6. UX

### 6.1 Stránka `/proverit-investici`

- Stejná kostra jako `message.html` a `loan.html`: hlavička, flow navigace, hero s Věrkou, `tool-card`, `style.css` + `verdict.css`.
- Nadpis „Prověřit investici“. Úvod: „Vložte text nabídky. Ukážeme, co je na ní podezřelé a co si ověřit dřív, než pošlete peníze. Text zůstane ve vašem prohlížeči.“
- Pole:
  - `textarea#offer` (max 10 000 znaků, povinné);
  - `input#offer-ico` (nepovinné, 8 číslic, validace checksumu jako `isValidIco`) s nápovědou „Najdete ho v obchodních podmínkách nebo patičce webu. Odešleme pouze IČO.“
- Tlačítko „Prověřit nabídku“. Pod ním příklady „Garantovaný výnos“, „Kryptoplatforma s poradcem“ a „Běžná nabídka fondu“.
- `noscript`: kontrola vyžaduje JavaScript, nic se neodesílá.

### 6.2 Výsledek (pořadí odpovídá otázkám uživatele)

```
[Věrka] 🟠 STOJÍ ZA POZORNOST                ← aggregate.headline (nikdy zelená)
        Co jsme zjistili?                      aggregate.reasons + počet kontrol
CO UDĚLAT TEĎ                                 ← aggregate.actions.primary
CO JE PODEZŘELÉ                               ← nálezy investičních pravidel (titul + vysvětlení + citovaný úsek)
CO SE NEPODAŘILO OVĚŘIT                       ← unknowns + ČNB neověřeno + nedokončené kroky
CO JSME PROVĚŘILI                             ← check-view (Investice, Web, Firma; zdroje, důvody)
[Robo] NEŽ POŠLETE PENÍZE                     ← pevný checklist (kap. 6.3)
Prověřit jinou nabídku
```

- MVP použije `renderCombinedResult` beze změny. Bloky „Co je podezřelé“ a „Co se nepodařilo ověřit“ jsou v detailu kroku Investice (`renderVerdict`).
- Rozšíření o samostatné bloky nad „Co jsme prověřili“ je volitelný krok S4.6b.
- Mobil 320–430 px, cíle ≥ 48 px, fokus na agregovaný nadpis, `role="status"`, vše přes `textContent`.

### 6.3 Pevné akce a checklist „Než pošlete peníze“

| # | Text | Odkaz |
|---|---|---|
| 1 | Ověřte poskytovatele v seznamech ČNB. Hledejte přesné IČO, ne jen podobný název. | ČNB – Seznamy regulovaných a registrovaných subjektů (`www.cnb.cz/cs/dohled-financni-trh/seznamy/`) |
| 2 | Zkontrolujte, zda ČNB na poskytovatele nebo platformu neupozorňuje. | ČNB – Upozornění ČNB na aktivity (`www.cnb.cz/cs/dohled-financni-trh/ochrana-spotrebitele/upozorneni/`) |
| 3 | Kontakt na firmu si najděte sami, ne z nabídky. | — |
| 4 | Neposílejte peníze na osobní účet ani v kryptoměnách na pokyn „poradce“. | — |
| 5 | Nikomu nedávejte vzdálený přístup k počítači ani kódy z bankovnictví. | — |
| 6 | Neinvestujte pod časovým tlakem. Poraďte se s někým, komu věříte. | — |
| 7 | Už jste peníze poslali? | `/uz-se-to-stalo` |

- Akce `actions.primary` se vybírá deterministicky z nálezů, např. `inv_remote_access` → akce 5, `inv_immediate_transfer` → akce 4, jinak akce 1.
- Všechny texty projdou `isSafeCopy`. Žádný text nesmí obsahovat „bezpečná investice“, „doporučujeme investovat“ ani procenta mimo citovaný úsek nabídky.

### 6.4 Homepage

- Karta „Prověřit investici“ přejde z „Již brzy“ na aktivní odkaz. Jde o jednu změnu produkční homepage, která vyžaduje schválení textu (D5).
- Homepage test „6 karet, 1× Již brzy“ se aktualizuje na 0× Již brzy.

---

## 7. BEZPEČNOSTNÍ OMEZENÍ

| Oblast | Pravidlo |
|---|---|
| Soukromí | Text nabídky neopustí prohlížeč. Žádné ukládání, `localStorage`, `sendBeacon` ani logy s textem. Ven jde jen `{"ico":"########"}` na `/api/firm` a `GET /eshop-coi.json`. |
| URL | Jen v prohlížeči přes `checkWebUrl` (P4), max 2. Žádné otevření ani fetch cílové URL. |
| Síť | Žádný nový endpoint, relay route, egress ani CSP výjimka. `/api/check` se nemění. |
| Limity | Firm krok sdílí `firmLimiter`, `firmSessionLimiter`, gate a cache. Plán max 4 kroky, deadline 5 s. |
| Vstup | `offer` 1–20 000 znaků (UI 10 000). IČO checksum. Odmítnuté vstupy nic neodesílají. |
| ReDoS / CPU | Ohraničené regexy, lineární normalizace, test < 20 ms na 20 000 znaků a 40k adversarial. |
| XSS | Citované úseky a registrová data jen přes `textContent`. Test s `<img onerror>` v nabídce i v názvu firmy. |
| Pravdivost | Nikdy zelená (`canConfirmAbsence=false`, A5). Žádné procento bezpečnosti ani skóre. `isSafeCopy` na všech textech. Žádné individuální investiční doporučení. |
| AI | V MVP žádná AI. Případná AI ve V2 smí jen popsat nálezy, nikdy nesnížit úroveň ani vytvořit červenou (pravidla Stage 1). |
| Závislosti | Žádné nové npm závislosti. |

---

## 8. TESTOVACÍ PLÁN

### 8.1 Unit (`tests/investment-rules.test.js`, `tests/investment-flow.test.js`, rozšíření `check-plan`/`check-aggregate`)

| Scénář | Vstup (zkráceně) | Očekávání |
|---|---|---|
| Legitimní nabídka | „Fond … Minulé výnosy nejsou zárukou budoucích. Investice nese riziko ztráty. IČO 27082440.“ | žádný serious ani attention nález, úroveň ⚪ `not_assessable`, P5 firm krok, **nikdy zelená** |
| Podezřelá nabídka | „Jen dnes! Pošlete 50 000 Kč na můj účet, neříkejte to bance.“ | `inv_pressure`, `inv_immediate_transfer`, `inv_personal_account`, `inv_secrecy` → 🔴 |
| Garantovaný výnos | „Garantovaný výnos 30 % ročně, bez rizika.“ | `inv_guaranteed_return`, `inv_no_risk`, `inv_high_annual` → 🔴 |
| Falešná platforma | „Naše platforma https://crypto-profit.example, poradce vám nainstaluje AnyDesk, vklad v USDT, 2 % denně.“ | `inv_remote_access`, `inv_crypto_payment`, `inv_periodic_return` + web krok P4 (lokálně) → 🔴; URL jen v prohlížeči |
| Neznámý poskytovatel | text bez IČO | `inv_info_provider_missing` (info), unknown „Poskytovatele jsme neověřili“, žádný firm krok |
| Nedostupný registr | IČO + `/api/firm` 503 | firm krok `failed`; P3 required → 🟠 A3; P5 nepovinný → úroveň beze změny, krok viditelný |
| Timeout | `/api/firm` visí | `skipped: deadline` do 5 s |
| Nejednoznačný výsledek | 2 různá IČO s návěštím | žádný firm krok, oba `notPlanned: ambiguous` |
| Negace | „výnos není garantován“, „nejde o investici bez rizika“ | žádný `inv_guaranteed_return` ani `inv_no_risk` |
| Zápis v ARES | legitimní text + aktivní firma | úroveň se nesníží; text „Zápis … neznamená oprávnění …“ |
| Agregace | serious firma + čistá investice; serious investice + firma OK | 🔴 v obou případech; nikdy `none_found` |
| Planner | `offer` + `text` současně; `offer` na serveru; baseline S3.2a | `INVALID_INPUT`; `OFFER_NOT_ALLOWED`; byte-identický plán |
| Bezpečnost vstupu | 20 000 znaků, 40k adversarial, `<img onerror>` v nabídce, control chars, RTL znaky | < 20 ms CPU, text jen jako text, validní výsledek |
| Statické hranice | `investment-rules.js` bez `fetch`, DOM a storage; `check-flow` volá jen `/api/session` a `/api/firm` | regex testy importů a volání |
| Copy | všechny texty katalogu a akcí | `isSafeCopy` PASS, žádné „bezpečn…“ ani „doporučujeme investovat“ |

### 8.2 Browser (`scripts/investment-browser.js`, Playwright jako S3.6/S3.7)

- 320/375/430 px:
  - verdikt a primární akce nad ohybem;
  - bez horizontálního scrollu;
  - cíle ≥ 48 px;
  - fokus na nadpis;
  - checklist viditelný.
- Síťový spy:
  - **text nabídky ani URL v žádném požadavku**;
  - s IČO právě jednou `/api/firm` s `{"ico"}`;
  - bez IČO a bez odkazu žádný API požadavek;
  - same-origin.
- Výpadek, timeout, serious firma, XSS v nabídce i v registru, příklady na stránce, reset „Prověřit jinou nabídku“.
- Regrese: S3.6 `web-firm-browser`, S3.7 `message-flow-browser`, `check-browser`, `firm-browser` PASS.

### 8.3 Release gate

- Docker gate (Node 24, čistý `git archive`) + Claude strict gate + `npm run check`.
- `.dockerignore` pokrývá `tests/*.js` a `scripts/*.js` globem. Nová fixtures (pokud vzniknou) se přidají jmenovitě.

---

## 9. IMPLEMENTAČNÍ ROADMAPA

Odhad: S ≈ do půl dne, M ≈ 1 den, L ≈ 2 dny. Kalendář počítá s review mezi kroky.

| Krok | Rozsah | Soubory | Závisí na | Acceptance criteria | Složitost |
|---|---|---|---|---|---|
| **S4.1** | Investiční pravidla + normalizace | `public/investment-rules.js` (nový), `tests/investment-rules.test.js` (nový) | — | Všechna ID z kap. 4.2: ≥ 3 pozitivní a ≥ 3 negativní fixture včetně negací. Determinismus. CPU < 20 ms / 20k. Žádný DOM, síť ani storage (statický test). Texty projdou `isSafeCopy`. | **M** |
| **S4.2** | Verdikt adaptér + model | `public/investment-verdict.js` (nový), `public/verdict-model.js` (aditivně `CHECKERS`, `RULE_CATALOG`, `defaultActions`), `tests/investment-verdict.test.js` | S4.1 | `createCheckResult` validní. `canConfirmAbsence=false` → nikdy `none_found`. ČNB zdroj `skipped` s poznámkou. `verifyLinks` jen `www.cnb.cz`. Stávající `verdict-*` testy beze změny. | **S** |
| **S4.3** | Planner P8 + `offer` + A5 | `public/check-plan.js`, `tests/check-plan.test.js`, `tests/check-aggregate.test.js` | S4.2 | P8 dle kap. 3.2. `offer`+`text` → `INVALID_INPUT`. Server → `OFFER_NOT_ALLOWED`. P4/P5 nad nabídkou. Fan-out ≤ 4. Baseline S3.2a byte-identická. Property test 1 000 vstupů. Investice nikdy zelená (A5). | **M** |
| **S4.4** | Klientský runner + view | `public/check-flow.js` (`runInvestmentCheck`, `startInvestmentCheck`, executor `investment`), `public/check-view.js` (popisek), `tests/investment-flow.test.js` | S4.3 | Scénáře kap. 8.1. Text nabídky v žádném požadavku. Jen `/api/session` a `/api/firm`. Deadline 5 s. S3.6/S3.7 testy beze změny PASS. | **S–M** |
| **S4.5** | Stránka | `public/investment.html` (nový), `public/investment.js` (nový), `src/server.js` (route `/proverit-investici` + allowlist 3 assetů), `public/sitemap.xml` | S4.4 | Stránka ve stylu `message.html` s Věrkou a Robem a checklistem kap. 6.3. CSP beze změny. `web-release` test rozšířen o route. Žádné jiné změny serveru. | **M** |
| **S4.6** | Browser regrese | `scripts/investment-browser.js` (nový) | S4.5 | Kap. 8.2 PASS na 320/375/430. Regresní browser skripty Stage 3 PASS. | **M** |
| **S4.6b** *(volitelné)* | Bloky „Co je podezřelé / Co se nepodařilo ověřit“ nad „Co jsme prověřili“ | `public/investment.js`, `public/verdict.css` (nové třídy) | S4.6 | Bez redesignu. Mobilní kritéria beze změny. | S |
| **S4.7** | Homepage karta + release | `public/index.html` (karta), `tests/web-release.test.js`, `docs/reviews/STAGE4.md` | S4.6, schválení D5 | Karta aktivní, 0× „Již brzy“. Docker gate PASS. Release review GO. Nasazení stávajícím release skriptem. | **S** |

### 9.1 Kalendář do 26. 10. 2026

| Datum | Cíl |
|---|---|
| 15.–16. 10. | S4.1 (pravidla) + S4.2 |
| 17. 10. | S4.3 (planner) |
| 18.–19. 10. | S4.4 + S4.5 (stránka funkční lokálně) |
| 20. 10. | S4.6 browser regrese; **feature freeze** |
| 21. 10. | integrace s produkcí, Docker gate, release review |
| 22. 10. | nasazení (S4.7) + ruční kontrola |
| 23.–25. 10. | rezerva: opravy z review, S4.6b, prezentace |
| 26. 10. | soutěž |

**Kritická cesta:** S4.1 → S4.3 → S4.4 → S4.5. Pokud by S4.3 (planner) ohrožoval termín, záložní plán je **S4.5 bez orchestrátoru**: stránka s `evaluateInvestment` + `fromInvestment` + `renderVerdict` a volitelný samostatný firm krok přes existující `renderVerdict`. Orchestrace se doplní po soutěži. Odkazy v nabídce by se pak v MVP neprověřovaly.

---

## 10. OTEVŘENÁ ROZHODNUTÍ

| # | Rozhodnutí | Doporučení |
|---|---|---|
| D1 | Text nabídky jen v prohlížeči (bez `/api/analyze`, bez AI) | **ANO pro MVP:** soukromí, žádná změna API, rychlost. Obecné signály pokrývá investiční katalog. |
| D2 | ČNB v MVP | **Jen ruční odkazy a pevné „neověřeno“.** JERRS WS je nedostupná (vyžaduje egress a podmínky), otevřená data nepokrývají investiční firmy, upozornění nejsou dataset. Automatizace je V2 (kap. 5.3). |
| D3 | Práh `inv_high_annual` | **15 % ročně** jako attention. Případně vypustit a ponechat jen garance a periodické výnosy. Potřeba produktového schválení. |
| D4 | Seznamy jmen (celebrity, offshore jurisdikce) | Malé pevné seznamy v kódu. Případně v MVP vypustit `inv_celebrity`: méně rizika falešných shod a sporných jmen. |
| D5 | Aktivace homepage karty a text karty | Schválit text karty a přepnutí z „Již brzy“. Mění produkční homepage. |
| D6 | Vstup přes `/api/check` (server) pro budoucí sdílení výsledků nebo AI | **Ne v Stage 4.** Případně V2 s vlastním review soukromí. |
| D7 | Investiční signály také na stránce Zpráva (`/overit-zpravu`) | **Ne v MVP.** Existující pravidlo zprávy `investment` zůstává. Odkaz „Jde o investiční nabídku? Prověřte ji zde“ lze přidat po soutěži. |
| D8 | Záložní plán bez orchestrátoru (kap. 9.1) | Použít jen pokud S4.3 do 17. 10. neprojde review. |

---

## 11. RIZIKA

| # | Riziko | Opatření |
|---|---|---|
| R1 | Falešné poplachy u legitimních nabídek (zákonné disclaimery obsahují „riziko“, „výnos“) | Negace v okně, ≥ 3 negativní fixture na pravidlo, legitimní scénář v browser testu. Attention místo serious u nejistých vzorů. |
| R2 | Uživatel chápe zápis v ARES jako potvrzení bezpečnosti | Pevná věta u faktů. Investice nikdy zelená. ČNB vždy „neověřeno“. |
| R3 | Chybějící automatické ověření ČNB působí slabě | Výrazné ruční odkazy a checklist. V2 JERRS s egress review. |
| R4 | Termín 26. 10. | Malé kroky, kritická cesta, záložní plán D8, feature freeze 20. 10. |
| R5 | Zásah do sdíleného planneru rozbije Stage 3 | Aditivní změny, baseline byte-identický test, regresní browser skripty S3.6 a S3.7. |
| R6 | ReDoS v nových regexech | Ohraničené vzory, CPU test na 40k adversarial vstupu. |
| R7 | Seznamy jmen se rychle zastarají | Verzované v kódu. Absence na seznamu nic neznamená (žádné „nenalezeno = OK“). |
