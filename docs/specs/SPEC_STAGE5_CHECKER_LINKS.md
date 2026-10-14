# Stage 5 – Propojit checkery

*Stav 2026-10-14: S5.1 specifikace; S5.2 (Půjčka → Firma) implementováno ve větvi `feat/stage5-s5.2-loan-firm`, rozhodnutí D1–D5 potvrzena podle doporučení. Další kroky nejsou implementovány.*
*Produkce: `289f27389e75957ba3f2135bde35b8bf2bc3b031` (Stage 0–4), větev `release/web-checker-2-2026-10-13`.*
*Navazuje na `SPEC_STAGE3_ORCHESTRATOR.md` (planner P1–P7, agregace A1–A6, kap. 12) a `SPEC_STAGE4_INVESTMENT.md` (P8, neutrální firma).*

---

## 0. SHRNUTÍ

- **Investice → Firma/Web je hotová** (Stage 4: P8 + P3/P5 + P4, neutrální zobrazení firmy).
- **Zpráva → Web/Firma je hotová** (S3.7: P1 + P4 + P5 v prohlížeči). Chybí jen opačný směr a navazující odkazy.
- **Půjčka → Firma chybí.** Stránka Půjčka má kombinovaný běh výslovně vypnutý (`app.js`: `isLoan() || dedicatedLoan`).
- **Smlouva → Firma chybí.** Stránka Smlouva nepracuje s IČO a nepoužívá model výsledků (`fromContract` existuje, ale stránka ho nevolá).
- **Žádné propojení nepotřebuje nové API ani nový externí síťový přístup.**
  - Všechno jde přes existující klientský runner (`check-flow.js`), planner (`check-plan.js`), `check-view.js` a `/api/firm` s přesně `{"ico"}`.
  - Text smlouvy zůstává v prohlížeči. Text půjčky jde jen tam, kam už dnes jde (`/api/analyze`).
- **Doporučené pořadí:** S5.2 Půjčka → Firma, S5.3 Smlouva → Firma, S5.4 Zpráva ↔ Web/Firma (zmenšený rozsah), S5.5 QA + release. Společný základ (neutrální firma a kontextová poznámka) vznikne v S5.2 jako první krok.

---

## 1. INVENTURA (ověřeno v kódu `289f273`)

### 1.1 Stránky a jejich napojení

| Stránka | Modul | Kam jde text / vstup | Orchestrátor Stage 3 | IČO / firma | Model výsledků |
|---|---|---|---|---|---|
| `/overit-zpravu` | `app.js` (F5a) | text → `/api/analyze` (existující) | **ano** (S3.7, `runMessageCheck`) | jen IČO s návěštím v textu (P5) | F5a výsledek + `check-view` |
| `/proverit-pujcku` | `app.js` (`data-flow=loan`), `loan.js`, `loan-cost.js` | text → `/api/analyze` s `topic:'loan'` (existující) | **ne** (`startCombined` končí pro půjčku) | **ne**; ČNB jen jako ruční rada v textu | F5a výsledek (bez `fromLoan`) |
| `/proverit-smlouvu` | `contract.js`, `contract-core.js`, `contract-pdf.js`, `contract-verify.js` | text/PDF jen v prohlížeči. AI `/api/analyze-contract` vypnutá (`AI_CONTRACT_ENABLED=false`). | **ne** | **ne** | vlastní render (bez `fromContract`) |
| `/proverit-web` | `web-checker.js`, `eshop-checker.js` | URL jen v prohlížeči | **ano** (S3.6) | pole IČO (P3) | `check-view` |
| `/proverit-firmu` | `firm.js` | IČO → `/api/firm` | ne (samostatný checker) | pole IČO | `renderVerdict` |
| `/proverit-investici` | `investment.js` (Stage 4) | text jen v prohlížeči | **ano** (P8) | pole IČO (P3) + text (P5) | `check-view` + neutrální firma |

### 1.2 Navigace mezi stránkami (`flow-navigation`)

| Stránka | Odkazy |
|---|---|
| Zpráva | úvod, Půjčka |
| Půjčka | úvod, Zpráva |
| Smlouva | úvod, Zpráva, Web, Půjčka |
| Web | úvod, Zpráva, Půjčka |
| Firma | úvod, Web |
| Investice | úvod, Firma, Web |

Data se mezi stránkami nepředávají. Stránka Firma neumí převzít IČO (žádné `location.search` ani `location.hash`).

### 1.3 Znovupoužitelné komponenty

| Komponenta | Stav | Použití ve Stage 5 |
|---|---|---|
| `check-plan.js` | P1–P8, A1–A6, `CHECKER_REGISTRY` (message, web, firm, investment), deterministický | **aditivně:** P9 (`loan`), P10 (`contract`), registr `loan` a `contract`, A5 pro `loan` a `contract` |
| `check-flow.js` | `runPlan` (deadline 5 s, web v prohlížeči, firma přes `/api/firm`, adopce výsledku zprávy, investiční executor). Checkery se injektují. | **aditivně:** adopce výsledku půjčky (`fromLoan`) a smlouvy (`fromContract`), `runLoanCheck` a `runContractCheck`. Planování jen IČO funguje už dnes (`planCheck({ico})` → P3). |
| `check-view.js` | „Co jsme prověřili“, popisky, poznámka o ARES jen pro investici | **aditivně:** popisky „Půjčka“ a „Smlouva“. Kontextová poznámka u firmy pro půjčku a smlouvu. Volitelné neutrální zobrazení čisté firmy (dnes v `investment.js`). |
| `verdict-model.js` | `CHECKERS` obsahuje `loan` i `contract`, `RULE_CATALOG` pro oba | beze změny |
| `verdict-adapters.js` | `fromLoan(a, calc, opts)`, `fromContract(result, opts)`, otestované v `verdict-adapters.test.js` | beze změny, jen se začnou volat |
| `/api/firm` | přesný wire `{"ico":"########"}`, gate 2, globálně 20/min, session 10/min, cache 10 min, in-flight dedup | beze změny |
| `/api/check` | serverový runner `{text, ico}` | **nepoužije se** (text smlouvy nesmí na server; text půjčky už jde přes `/api/analyze`) |

---

## 2. MATICE PROPOJENÍ

| Propojení | Funguje | Částečně | Chybí | Data, která se předávají | Nové API |
|---|---|---|---|---|---|
| **Zpráva → Web** | ano (S3.7, P4, max 2 odkazy, jen v prohlížeči) | — | — | URL zůstává v prohlížeči. Text jde jen na existující `/api/analyze`. | ne |
| **Zpráva → Firma** | ano (S3.7, P5: jediné IČO s návěštím) | bez pole IČO; více IČO = nejednoznačné, bez volby | volitelné pole IČO (P3); odkaz „Prověřit firmu podrobně“ | jen `{"ico"}` na `/api/firm` | ne |
| **Web/Firma → Zpráva** | jen navigace z Webu | — | odkaz ze stránky Firma; kontextová nabídka „Máte k tomu zprávu?“ | žádná data (text se mezi stránkami nikdy nepředává) | ne |
| **Půjčka → Firma** | ne | ČNB jen jako ruční rada | celé propojení: pole IČO, P5 z textu, firma v kombinovaném výsledku, poznámka „registr ≠ oprávnění k úvěrům“ | jen `{"ico"}`; text půjčky beze změny (`/api/analyze`) | ne |
| **Smlouva → Firma** | ne | — | výběr smluvní strany (IČO z textu v prohlížeči), firma v kombinovaném výsledku, poznámka „registr ≠ strana smlouvy ≠ právní hodnocení“ | jen `{"ico"}`; text smlouvy zůstává v prohlížeči | ne |
| **Investice → Firma/Web** | **ano** (Stage 4) | — | jen navazující odkaz na Firmu (S5.4) | jen `{"ico"}`; text a URL v prohlížeči | ne |

---

## 3. CÍLOVÁ ARCHITEKTURA

### 3.1 Princip (beze změny Stage 3 a 4)

```
stránka (prohlížeč)
 ├─ vlastní checker stránky (beze změny):  zpráva/půjčka → /api/analyze (existující) · smlouva → contract-core (lokálně)
 ├─ check-flow.js runPlan:  adopce hotového výsledku stránky (fromMessage | fromLoan | fromContract | fromInvestment)
 │                          + web (P4, lokálně) + firma (P3/P5 → /api/firm {"ico"})
 └─ check-view.js renderCombinedResult (+ kontextová poznámka u firmy, volitelně neutrální čistá firma)
```

- **Planner běží jednou nad uživatelským vstupem.** Výstupy checkerů se do planneru nevracejí. Výběr smluvní strany je nová uživatelská akce, ne smyčka.
- **Adopce místo nového volání.** Výsledek, který stránka už má, se jen převede adaptérem. Text se neposílá podruhé.

### 3.2 Planner (aditivně, `check-plan.js`)

| Pravidlo | Vstup | Krok | runAt | Poznámka |
|---|---|---|---|---|
| **P9** | `loan` (text komunikace o půjčce, 1–20 000 znaků; jen klient) | `loan`, required, primary (pokud není P2) | `server` (adopce výsledku `/api/analyze` s `topic:'loan'`, stejně jako P1) | vzájemně výlučné s `text`, `offer` a `contract`. P4/P5 extrahují z textu půjčky, P3 z pole. |
| **P10** | `contract` (text smlouvy; jen klient) | `contract`, required, primary | `client` (adopce výsledku `contract-core`) | vzájemně výlučné s ostatními texty. **P4 se na smlouvu neuplatní** (D2). P5 extrahuje IČO s návěštím; ≥ 2 IČO = `ambiguous` (typická smlouva) → uživatel vybere stranu (P3). |
| A5 | — | `['message','web','investment','loan','contract']` nikdy samy nevedou na zelenou | — | `fromLoan` i `fromContract` už mají `canConfirmAbsence=false`. A5 je druhá pojistka. |

**Kompatibilita:**
- plány bez nových klíčů musí zůstat bajtově shodné (otisk 300 vstupů jako v S4.3 a baseline S3.2a);
- `PLANNER_VERSION` zůstává `p1`;
- nové klíče se do `plan.input` přidávají jen tehdy, když jsou zadány.

### 3.3 Runner (`check-flow.js`, aditivně)

- `runLoanCheck({loan, ico, analysis, analysisMs, calc?})`: krok `loan` adoptuje `fromLoan(analysis, calc)`. Žádný druhý `/api/analyze`.
- `runContractCheck({contract, ico, contractResult})`: krok `contract` adoptuje `fromContract(contractResult)`. `planContractParties(contract)` vrátí kandidáty IČO (z `plan.notPlanned` `ambiguous` nebo z P5) pro výběr strany.
- Checkery a adaptéry injektuje stránka. Importy `check-flow.js` zůstávají beze změny (statický test S3.6).

### 3.4 Zobrazení (`check-view.js`, aditivně)

- Popisky `loan:'Půjčka'` a `contract:'Smlouva'`.
- Kontextová poznámka u kroku firmy podle typu hlavní kontroly:
  - investice (existuje): „Zápis v obchodním rejstříku neznamená oprávnění k investičním službám ani bezpečnost investice.“
  - **půjčka:** „Zápis firmy v registru nepotvrzuje oprávnění poskytovat spotřebitelské úvěry ani výhodnost nabídky.“
  - **smlouva:** „Údaje z registru se týkají firmy s tímto IČO. Neověřují, že smlouvu uzavírá právě ona, ani obsah smlouvy.“
- **Neutrální čistá firma** („Firma nalezena v registrech“) se přesune z `investment.js` do `check-view.js` jako volitelný parametr `{registryNeutral:true}`.
  - Zapne se pro investici, půjčku a smlouvu; `/proverit-web` a `/overit-zpravu` zůstanou beze změny.
  - Investiční stránka musí zůstat vizuálně i textově shodná (regresní browser test S4.5/S4.6).

### 3.5 Navazující odkazy (S5.4)

- **Předvyplnění IČO na `/proverit-firmu` přes fragment `#ico=########`**, ne přes query.
  - Fragment se neposílá na server ani do logů. IČO OSVČ je osobní údaj.
  - `firm.js` IČO jen předvyplní a kontrolu nespustí automaticky (žádný požadavek bez akce uživatele).
- Odkaz „Prověřit firmu podrobně“ u kroku firmy v kombinovaném výsledku (všechny stránky s `check-view`).
- Navigace: Firma → Zpráva a kontextová věta „Máte k tomu zprávu nebo nabídku? Prověřte ji“ na Web a Firma.
- **Žádné předávání textu zprávy, půjčky, smlouvy ani URL mezi stránkami.**

---

## 4. PROPOJENÍ PODROBNĚ

### 4.1 Půjčka → Firma (S5.2)

| Rozlišení | Co ukážeme | Zdroj |
|---|---|---|
| **Identita firmy** | údaje ARES/VR/RES/DPH podle IČO, neutrálně („Firma nalezena v registrech“) | `/api/firm` (P3 pole IČO, P5 IČO v textu) |
| **Oprávnění poskytovat úvěry** | **neověřujeme automaticky:** „Oprávnění poskytovat spotřebitelské úvěry jsme neověřili.“ + odkaz na seznamy ČNB | ruční ověření (`www.cnb.cz`, už schválený odkaz v `fromLoan`) |
| **Rizikovost nabídky** | existující pravidla půjčky (`loan_*`) + kalkulačka | `/api/analyze` s `topic:'loan'` (beze změny), `fromLoan` |

- UI: na `loan.html` volitelné pole „IČO poskytovatele“ (vzor `#offer-ico`). Výsledek F5a zůstává první, kombinovaný výsledek pod ním (vzor S3.7).
- Text půjčky jde jen tam, kam už dnes jde. IČO jen na `/api/firm`.
- **ČNB automaticky ne.** Otevřená data ČNB pokrývají nebankovní poskytovatele spotřebitelského úvěru (`npsu`) a banky. Automatizace by ale vyžadovala nový zdroj dat a synchronizaci (D3, mimo Stage 5).

### 4.2 Smlouva → Firma (S5.3)

| Rozlišení | Co ukážeme | Zdroj |
|---|---|---|
| **Identifikace smluvní strany** | kandidáti IČO z textu smlouvy (s návěštím, platný checksum), uživatel vybere stranu | prohlížeč (planner P5 a `notPlanned`) |
| **Ověření firmy** | registrové údaje vybraného IČO, neutrálně | `/api/firm` jen s `{"ico"}` |
| **Právní hodnocení smlouvy** | existující pravidla smlouvy (beze změny), „Kontrola nenahrazuje právní posouzení“ | `contract-core` (lokálně), `fromContract` |

- Typická smlouva obsahuje IČO obou stran. P5 proto vrátí `ambiguous` a UI nabídne volbu „Kterou stranu prověřit?“. Nic se neodešle, dokud uživatel nevybere.
- Text smlouvy a PDF nikdy neopustí prohlížeč. AI smlouvy zůstává vypnutá a nemění se.
- Poznámka: registr neověřuje, že smlouvu uzavírá tato firma.

### 4.3 Zpráva ↔ Web/Firma (S5.4)

- Zpráva → Web/Firma: hotovo. Doplnit volitelné pole IČO na `message.html` (P3; D4) a odkaz „Prověřit firmu podrobně“.
- Web/Firma → Zpráva: navigace a kontextová věta, bez dat.
- Firma ← všechny: předvyplnění `#ico=` (3.5).

### 4.4 Investice → Firma/Web

- Hotovo ve Stage 4. Ve Stage 5 jen sdílení neutrální firmy z `check-view` (refaktor bez změny chování) a odkaz „Prověřit firmu podrobně“.

---

## 5. BEZPEČNOSTNÍ HRANICE (závazné)

| Hranice | Pravidlo pro Stage 5 |
|---|---|
| Text na server | Text smlouvy nikdy. Text půjčky a zprávy jen na existující `/api/analyze` (beze změny). Žádný text na `/api/check` ani `/api/firm`. |
| Nové API | žádné. `/api/firm` beze změny (`{"ico"}`, limity, cache). |
| Externí síť | žádný nový upstream, relay route ani egress. ČNB automaticky ne (D3). |
| Falešná bezpečnost | `loan`, `contract`, `message`, `web` a `investment` v A5. Čistá firma neutrálně. Registrace firmy nikdy nezlepší úroveň. |
| Oprávnění vs. identita | U půjčky a investice vždy viditelné „oprávnění jsme neověřili“, u smlouvy „stranu smlouvy jsme neověřili“. |
| Předávání mezi stránkami | jen IČO ve fragmentu `#ico=` a jen pro předvyplnění; žádný text ani URL |
| CSP | beze změny (jen same-origin skripty; nové soubory jen ve statickém whitelistu) |
| Rate limity | jeden firm krok na plán (P7). Výběr smluvní strany je samostatná akce uživatele, limiter `/api/firm` platí. |
| Bez JS | formuláře s textem mají tlačítko zakázané do načtení skriptu (CR-08) |

---

## 6. IMPLEMENTAČNÍ PLÁN

| Krok | Rozsah | Soubory | Závisí na | Acceptance criteria | Složitost |
|---|---|---|---|---|---|
| **S5.2** Půjčka → Firma | (a) sdílená neutrální firma a kontextová poznámka v `check-view` + refaktor investice; (b) P9 + A5 `loan`; (c) `runLoanCheck` (adopce `fromLoan`); (d) `loan.html`: pole IČO + kombinovaný výsledek pod F5a | `check-view.js`, `investment.js`, `check-plan.js`, `check-flow.js`, `app.js` (jen loan větev), `loan.html`, `style.css` (selektor), testy | — | investiční stránka beze změny (browser S4.5/S4.6 PASS); otisk P1–P8 beze změny; půjčka + IČO → právě 1× `/api/firm {"ico"}`; text jen na `/api/analyze`; nikdy zelená; „oprávnění neověřeno“ viditelné; bez pole IČO a bez IČO v textu žádná změna proti dnešku | **M–L** |
| **S5.3** Smlouva → Firma | P10 (bez P4) + A5 `contract`; `runContractCheck` (adopce `fromContract`); výběr smluvní strany; kombinovaný výsledek na `smlouva.html` | `check-plan.js`, `check-flow.js`, `contract.js`, `smlouva.html`, `check-view.js` (popisek), testy | S5.2 (a) | text a PDF nikdy v síti (síťový spy); 0 požadavků bez výběru strany; ≥ 2 IČO → volba; po výběru 1× `/api/firm`; poznámka o straně smlouvy; právní pravidla beze změny | **M** |
| **S5.4** Zpráva ↔ Web/Firma | `#ico=` předvyplnění na `/proverit-firmu` (bez automatického spuštění); odkaz „Prověřit firmu podrobně“; navigace Firma → Zpráva; volitelné pole IČO na `message.html` (D4) | `firm.js`, `firm.html`, `check-view.js`, `web.html`, `message.html`, `app.js` (jen předání IČO), testy | S5.2 (a) | žádný požadavek při načtení s `#ico=`; IČO nikdy v query ani v logu; S3.7 regrese PASS | **S–M** |
| **S5.5** QA + Release | browser QA všech propojení (320/375/430/1280), síťový spy, regrese Stage 3/4, integrace nad produkcí, `docs/reviews/STAGE5.md` | testy, skripty, review | S5.2–S5.4 | Docker gate PASS, strict gate PASS, GO | **M** |

**Úprava pořadí oproti zadání:**
- Investice → Firma/Web je hotová, Zpráva → Web/Firma také, proto se S5.4 zmenšuje na navazující odkazy.
- Sdílený základ (neutrální firma v `check-view`) je první část S5.2, protože ho S5.3 i S5.4 potřebují.
- S5.4 lze dělat paralelně se S5.3 (různé soubory, oba závisí jen na S5.2 (a)).

---

## 7. RIZIKA

| # | Riziko | Opatření |
|---|---|---|
| R1 | `app.js` je sdílený soubor Zprávy a Půjčky (F5a) | změny jen v loan větvi; S3.7 a F5a regresní browser testy; stará lokální F5a se nepoužívá |
| R2 | Refaktor neutrální firmy změní investiční stránku | browser testy S4.5/S4.6 musí projít beze změny; `/proverit-web` bez `registryNeutral` |
| R3 | Uživatel zamění registraci za oprávnění nebo za smluvní stranu | kontextové poznámky, „neověřeno“ vždy viditelné, nikdy zelená |
| R4 | Smlouva s mnoha IČO (např. přílohy) | P5 `ambiguous` + explicitní volba; max 1 firm krok na akci |
| R5 | Opakované volby strany zatíží `/api/firm` | existující session 10/min a globální 20/min limiter, cache 10 min, tlačítko zakázané během běhu |
| R6 | IČO OSVČ v URL | jen fragment `#ico=`, ne query; nic se neodesílá bez akce |
| R7 | Rozšíření planneru rozbije Stage 3/4 | bajtový otisk P1–P8, baseline S3.2a, property testy limitů |

---

## 8. OTEVŘENÁ ROZHODNUTÍ

| # | Rozhodnutí | Doporučení |
|---|---|---|
| D1 | Půjčka: kombinovaný výsledek pod výsledkem F5a (jako Zpráva) | **ano**; F5a první akce zůstává první |
| D2 | Smlouva: neprověřovat odkazy (P4) | **ano**, jen smlouva + firma (méně šumu, odkazy ve smlouvách jsou typicky podmínky) |
| D3 | Automatické ověření oprávnění ČNB pro půjčky (otevřená data `npsu`/`banky`) | **ne ve Stage 5.** Vyžaduje nový zdroj dat a synchronizaci. Případně později jako offline snapshot s datem a pravidlem zastarání (vlastní review). |
| D4 | Volitelné pole IČO na stránce Zpráva | **ano** (P3; malé, užitečné při více IČO) |
| D5 | Předvyplnění `/proverit-firmu` přes `#ico=` bez automatického spuštění | **ano** |

## 9. BLOCKERY

Žádné technické. Před S5.2 je potřeba potvrdit D1–D5. Bez potvrzení se postupuje podle doporučení.
