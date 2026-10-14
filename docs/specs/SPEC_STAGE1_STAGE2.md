# Věřím tomu? – Stage 1 (Verdict UX) a Stage 2 (Prověřit firmu)

*Návrh pro Codex. Nic není implementováno.*
*Výchozí stav: produkce = `release/web-checker-2-2026-10-13` @ `1dee388` (strom = `5c91de2`).*
*Stage 0 (karta firmy, mobilní navigace) dokončuje Codex. F5a je rozpracované v samostatné větvi.*

Navazuje na `SPEC_PROVERIT_FIRMU.md`. Ten obsahuje detaily registrů, pravidla F01–F16 a SSRF model. Zde je minimální implementovatelný výřez a pořadí.

---

## 0. SKUTEČNÝ STAV REPOZITÁŘE (relevantní komponenty)

| Oblast | Dnes | Soubor |
|---|---|---|
| Prověřit zprávu / půjčku | server `analyze()` vrací `risk_score`, `risk_level` (`unassessed`, `caution`, `high`, `very_high`), `summary`, `signals[]` (s `source`), `recommended_actions[]`, `verification_steps[]`, `uncertainties[]`, `engine`, `ai_status`. UI (F5a mezivýsledek) skóre nezobrazuje a z úrovně nic neodvozuje: „Co udělat teď“ (1. akce ze serveru), „Co z kontroly vyplývá“, „Co si zaslouží pozornost“ (rules vs. AI), „Co nevíme“, „Jak to bezpečně ověřit“ | `src/analysis.js`, `public/app.js`, `public/index.html`, `message.html`, `loan.html` |
| Prověřit web | čistě lokální rozbor URL → `{status:'unverified', hostname, signals[{id,title,explanation}]}`; bez úrovně a závažnosti | `public/web-checker.js` |
| E-shop / ČOI / ARES | ČOI: `VAROVÁNÍ`, `BEZ ZNÁMÉHO NÁLEZU`, `NEOVĚŘENO`. ARES `lookupAres()` vrací vždy `status:'NEOVĚŘENO'` + `registryFinding` + `entity` | `public/eshop-checker.js`, `src/eshop-sources.js` |
| Kalkulačka půjčky | čisté výpočty v haléřích | `public/loan-cost.js` |
| Prověřit smlouvu | `CLASSIFICATIONS` (`common`, `potentially_unfavourable`, `ambiguous`, `possible_conflict`), zdroj nálezu `rules`/`ai`, katalog `[]` | `public/contract-*.js` |
| Registry relay | `POST /v1/registry/ares` (Bearer, `{"ico"}` + checksum, pevná URL, `redirect:'error'`, 3,5 s, 128 kB, souběh 2, 20/min) | `ai-proxy.cjs` |
| Server API pro registry | `POST /api/eshop-operator` → `lookupAres` (Origin + session, `AdmissionGate(2)`, `registryLimiter` 20/min, tělo ≤ 256 B) | `src/server.js` |
| Release | `deploy/release/verimtomu-release.sh` staví web i relay z jednoho SHA a umí nezávislý rollback | `deploy/release/` |

**Závěr pro návrh:** jednotný model výsledku dnes neexistuje. Každý checker má vlastní slovník stavů a nejblíže Verdict UX je F5a struktura u zprávy. Stage 1 přidá **sdílený model + renderer + adaptéry**. Checkery samotné nepřepisuje.

---

# 1. STAGE1_SPEC – Verdict UX

## 1.1 Jednotný model výsledku (`CheckResult`, schema 1)

Nový čistý ES modul `public/verdict-model.js`. Bez DOM a bez sítě, importovatelný serverem i prohlížečem (stejný vzor jako `public/contract-core.js`).

```js
CheckResult {
  schema: 1,
  checker: 'message'|'loan'|'web'|'contract'|'firm',
  level:   'serious'|'attention'|'none_found'|'incomplete'|'not_assessable',
  headline: string,                 // pevná šablona podle level+checker
  reasons: Reason[],                // proč tento level (kap. 1.4)
  actions: { primary: string, secondary: string[] },   // jen pevné šablony
  facts:    Fact[],                 // OVĚŘENÉ SKUTEČNOSTI (registry) + vstupy uživatele + výpočty
  findings: Finding[],              // PRAVIDLOVÉ INDIKÁTORY (a AI nálezy odděleně, viz origin)
  ai: { status: 'performed'|'not_performed'|'unavailable', summary?: string } | null,
  unknowns: string[],               // NEOVĚŘENÉ / co nevíme (pevné texty)
  sources:  SourceStatus[],         // co jsme kontrolovali a s jakým výsledkem
  verifyLinks: { label, url }[],    // „Ověřte si“ – jen statické oficiální šablony
  checkedAt: ISO string
}
Fact     { id, label, value, kind: 'registry'|'user_input'|'calculated', source: 'ARES'|'DPH'|'COI'|'user'|'calc', sourceDetail?, observedAt?, sourceUrl? }
Finding  { id, ruleId, origin: 'rules'|'registry'|'ai', severity: 'serious'|'attention'|'info', title, explanation, evidence: FactId[] }
SourceStatus { id, label, status: 'checked'|'unavailable'|'not_found'|'not_applicable'|'skipped', checkedAt?, note? }
Reason   { ruleId: 'L1'..'L5', text }
```

**Invarianty (vynucené testy):**
1. Žádné číselné skóre ani procenta ve výstupu modelu. `risk_score` se do modelu nepřenáší.
2. `Fact.kind = 'registry'` vyžaduje `source ∈ {ARES, DPH, COI}` a `observedAt`.
3. `Finding.origin = 'ai'` nikdy nemá `severity = 'serious'`.
4. Každý `Finding.ruleId` existuje v katalogu pravidel daného checkeru.
5. Veškerý text je `string`; renderer ho vkládá jen přes `textContent`.

## 1.2 Úrovně (bez procent)

| level | Ikona + text (barva nikdy není jediný nosič) | Kdy |
|---|---|---|
| `serious` | 🔴 **Našli jsme závažné varovné signály** | aspoň jeden `serious` nález z `rules` nebo `registry` |
| `attention` | 🟠 **Stojí za pozornost** | aspoň jeden `attention` nález, nebo nedostupný povinný zdroj (viz L3) |
| `none_found` | 🟢 **Nenašli jsme výrazné varovné signály** + povinná věta: „To neznamená, že je {zpráva/web/firma} bezpečná. Ověřili jsme jen zdroje uvedené níže.“ | všechny povinné zdroje `checked`/`not_found` s výsledkem a žádný nález nad `info` |
| `incomplete` | ⚪ **Kontrolu se nepodařilo dokončit** | primární zdroj nedostupný a není `serious` |
| `not_assessable` | ⚪ **Z dostupných údajů nelze posoudit** | checker z principu nic nepotvrdí (např. jen URL zprávy, strukturální rozbor webu bez nálezu) |

**Nedostatek informací nikdy nedá `none_found`.** Pravidla L3–L5 to zajišťují.

## 1.3 Odvození úrovně – deterministicky, čistá funkce `deriveLevel(findings, sources, policy)`

Vyhodnocuje se shora, první platné pravidlo rozhoduje:

| # | Pravidlo |
|---|---|
| L1 | existuje `serious` nález s `origin ∈ {rules, registry}` → `serious` |
| L2 | primární zdroj (`policy.primary`) má status `unavailable` → `incomplete` |
| L3 | některý povinný zdroj (`policy.required`) je `unavailable` nebo `skipped` → `attention` („Část kontrol se nepodařilo dokončit: …“) |
| L4 | existuje `attention` nález (z jakéhokoli `origin`) → `attention` |
| L5 | `policy.canConfirmAbsence === false` → `not_assessable`; jinak → `none_found` |

- **AI nikdy nesnižuje úroveň.** Může přidat nejvýš `attention`, protože AI nálezy nemají `serious`.
- Úrovně se nesčítají: tři `attention` jsou pořád `attention`.
- Výstup `reasons[]` obsahuje ID pravidla L1–L5 a lidskou větu („Výsledek je červený, protože ARES uvádí, že firma zanikla.“).

## 1.4 Vysvětlení důvodů

- Sekce **PROČ** vypisuje nálezy seřazené `serious → attention`. `info` je sbalené v `<details>`.
- U každého nálezu je odkaz **„Proč to tvrdíme?“** (rozbalí `<details>`): pravidlo, fakta z `evidence` se zdrojem a datem a zkrácená citace vstupu u textových pravidel.
- **„Proč tento výsledek?“** pod verdiktem zobrazí `reasons[]`.

## 1.5 „Co udělat teď“

- `actions.primary` je jediná nejdůležitější akce. Vybere se z akce nejzávažnějšího nálezu. Bez nálezu se použije pevná výchozí akce checkeru.
- `secondary` obsahuje max. 3 akce, deduplikované podle textu.
- Akce existují jen v revidovaném katalogu šablon checkeru. Žádný text se negeneruje.
- U zprávy a půjčky zůstává dnešní pořadí akcí ze serveru (F5a: první akce ze serveru).

## 1.6 Oddělení typů informací (pořadí sekcí v UI)

```
VERDIKT            ikona + headline (+ povinná věta u none_found) + „Proč tento výsledek?“
CO UDĚLAT TEĎ      actions.primary (+ secondary)
PROČ               findings origin=rules|registry  → „Zjištěno pravidly“ / „Podle {zdroj}“
OVĚŘENÉ ÚDAJE      facts kind=registry  → „Údaj z {ARES}, stav k {datum}“ + odkaz na zdroj
HODNOCENÍ AI       jen když ai.status=performed: findings origin=ai + ai.summary, jasně označené „Odhad AI – může se mýlit“; bez názvu poskytovatele/modelu
CO JSME NEOVĚŘILI  unknowns + facts kind=user_input („Uvedli jste vy, neověřovali jsme.“)
CO JSME KONTROLOVALI  sources[] – ✓ = kontrola proběhla (ne „v pořádku“), ⚠ nedostupné, – nepoužito
OVĚŘTE SI          verifyLinks (oficiální stránky, target=_blank rel=noopener)
```

## 1.7 Stavy nedostupnosti a chyb

| Stav | `SourceStatus.status` | Dopad na level | Text |
|---|---|---|---|
| Registr neodpověděl / timeout / 5xx / nevalidní odpověď | `unavailable` | L2 (primární) nebo L3 | „{Zdroj} je teď nedostupný. Údaje jsme neověřili.“ |
| Subjekt v registru není | `not_found` | žádný nález, nebo pravidlo checkeru (např. firma F-NF) | „V {zdroj} jsme záznam nenašli.“ |
| Rate limit aplikace (429) | celý výsledek se nevytvoří | — | inline chyba formuláře „Mnoho dotazů, zkuste to za minutu.“, bez verdiktu |
| Neplatný vstup | — | — | inline chyba u pole, nic se neodesílá |
| Plánovaná odstávka (DPH 0:00–0:10, ne 3–4) | `unavailable` + `note` | L3 | „Registr DPH má plánovanou odstávku.“ |
| Neočekávaná chyba aplikace | `incomplete` | L2 | „Kontrolu se nepodařilo dokončit. Zkuste to prosím znovu.“ |

## 1.8 Mobilní UX a přístupnost

- Na šířce 320–430 px je VERDIKT a „Co udělat teď“ vidět bez scrollu (nad ohybem 568 px).
- Žádný horizontální overflow na 320 px. Dlouhé hodnoty (IČO, adresy, URL) mají `overflow-wrap:anywhere`.
- Klikací prvky mají ≥ 48 px. Sekce PROČ a „Proč to tvrdíme?“ jsou nativní `<details>/<summary>`.
- Po zobrazení výsledku se fokus přesune na nadpis verdiktu (`tabindex="-1"`). Průběh kontroly hlásí `role="status"` / `aria-live="polite"`.
- Úroveň nese text + ikona (`aria-hidden` na emoji) + barva. Kontrast textu ≥ 4,5 : 1, ověřeno `scripts/contrast-check.js`.
- `prefers-reduced-motion`: žádné animace verdiktu.
- CSP beze změny: same-origin moduly, žádné inline skripty ani styly.

## 1.9 Kompatibilita se stávajícími checkery (adaptéry, checkery se nemění)

Nový modul `public/verdict-adapters.js` (čisté funkce):

| Adaptér | Vstup (beze změny) | Mapování | `policy` |
|---|---|---|---|
| `fromMessage(analysis)` | odpověď `/api/analyze` | `risk_level`: `unassessed` → `not_assessable`; `caution` → `attention`; `high`, `very_high` → `serious`. `signals` → findings (`origin` z `signal.source`). `recommended_actions` → actions (pořadí zachováno). `uncertainties` → unknowns. **`risk_score` se ignoruje.** | primary=`message_rules`, canConfirmAbsence=false |
| `fromLoan(analysis, calc)` | stejné API + `loan-cost.calculate` | jako zpráva; výpočty → `facts kind=calculated` | jako zpráva |
| `fromWeb(urlResult, coi?, ares?)` | `checkWebUrl` + ČOI + `lookupAres` | ČOI `VAROVÁNÍ` → `serious` (`registry`); signál `phishing` → `serious` (`rules`); ostatní signály → `attention`; bez signálu → nic. ARES fakta → `facts` (se zachovaným „vztah k webu neověřen“) | primary=`url_rules`, required=[`coi`] pokud se načítal, canConfirmAbsence=false |
| `fromContract(result)` | výsledek smlouvy | `possible_conflict`, `potentially_unfavourable`, `ambiguous` → `attention`; `common` → `info`; **max `attention`** (smlouva neposuzuje podvod) | primary=`contract_rules`, canConfirmAbsence=false |
| `fromFirm(profile)` | `/api/firm` (Stage 2) | 1:1 podle pravidel F | primary=`ares`, required=[`ares`, `vr`?, `dph`?], canConfirmAbsence=true |

`canConfirmAbsence=false` znamená, že checker nikdy nevrátí 🟢 a jeho nejlepší výsledek je `not_assessable`. Tak se zachovává dnešní chování („Pravidla nenašla známé signály. Z toho nelze poznat…“).

**Migrace stránek (každá samostatně, s Playwright snapshotem):** Firma (nová) → Web → Smlouva → Půjčka → Zpráva.
- **Zpráva a půjčka až po sloučení F5a**, protože `public/app.js`, `public/index.html` a `public/style.css` jsou F5a soubory.
- Do té doby zpráva a půjčka jen procházejí adaptérem v testech. Bez změny UI.

---

# 2. STAGE2_SPEC – Prověřit firmu (MVP podle IČO)

Detailní zdroje, pole, pravidla a privacy: **`SPEC_PROVERIT_FIRMU.md`**. Zde je minimální výřez.

## 2.1 Rozsah

- **Vstup:** jen IČO (8 číslic + checksum, existující `validateRegistryInput`). Vyhledávání podle názvu je až volitelný krok 2.9 (kandidáti, nikdy automatický výběr).
- **Zdroje:**
  - ARES `ekonomicke-subjekty/{ico}` (základní údaje + `seznamRegistraci`);
  - ARES `ekonomicke-subjekty-vr/{ico}` (Veřejný rejstřík: stav, likvidace, statutáři, insolvenční zápisy);
  - ARES `ekonomicke-subjekty-res/{ico}` (RES: kategorie počtu pracovníků, CZ-NACE);
  - Registr DPH: SOAP `getStatusNespolehlivySubjektRozsirenyV2` na `https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP`.
- **Mimo MVP:** ISIR přímo (insolvence jen z ARES VR), ESM, Sbírka listin (jen odkaz), ČNB.

## 2.2 Architektura (bez nové služby)

```
prohlížeč ─POST /api/firm {"ico"}─► verimtomu-web (bez egress)
                                     │ Bearer, pevná URL 172.30.41.3:8080
                                     ▼
                     verimtomu-ai-proxy (existující relay)
                       ├─ POST /v1/registry/ares          (beze změny – Web Checker)
                       ├─ POST /v1/registry/ares-profile  {"ico"}  → 3 pevné GET (základ, VR, RES)
                       └─ POST /v1/registry/dph           {"dic"}  → 1 pevný SOAP POST
```

- Firewall, sítě a DNS se nemění. Relay už má egress na ARES. **Egress na `adisrws.mfcr.cz` je třeba jednou ověřit** (kap. 5, D1).
- Nasazení relay řeší existující `deploy/release/verimtomu-release.sh` (relay image ze stejného SHA, samostatný rollback).

## 2.3 Relay adaptéry (`ai-proxy.cjs`)

| | `ares-profile` | `dph` |
|---|---|---|
| Vstup přesně | `{"ico":"\d{8}"}` + checksum, ≤ 64 B, jiné klíče → 400 | `{"dic":"\d{8}"}`, ≤ 64 B (jen právnické osoby) |
| Upstream | `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty{,-vr,-res}/{ico}` (konstanty) | `https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP`, pevná SOAP šablona |
| Síť | `redirect:'error'`, 3,5 s na volání, 3 paralelně | `redirect:'error'`, 3,5 s, cookies se ignorují |
| Velikost | základ 128 kB, VR 512 kB, RES 64 kB (čteno streamem) | 64 kB |
| Validace | `ico` v odpovědi == dotaz; JSON; očekávané typy | XML bez `<!DOCTYPE`/`<!ENTITY`; `statusCode="0"`; jeden `statusSubjektu` s `dic` == dotaz; hodnoty z výčtu |
| Minimalizace (už v relay) | statutáři a společníci FO: jen jméno, příjmení, funkce, datum od; **nikdy `datumNarozeni`, adresa FO**; jen aktuální členové + počet změn za 12 měsíců | zahodit `nazevSubjektu`, `adresa` |
| Limity | souběh 2; 20 profilů/min (= 60 volání; ARES dovoluje 500/min) | souběh 2; 10/min, 500/h, 4 000/24 h (GFŘ: 2 000/h, 10 000/24 h, ≤ 4 paralelně) |
| Chyba | 502 → aplikace `unavailable` | 502/503 (statusCode 2/3) → `unavailable` + note „odstávka“ |
| Částečný výsledek | základ OK + VR/RES selže → 200 s `vr:{status:'unavailable'}` | — |

Stávající route `/v1/registry/ares` zůstává bajtově beze změny.

## 2.4 Aplikace

- `src/firm-sources.js`: klient relay se 4s rozpočtem. Sdílí `validateRegistryInput`, vzor čtení s limitem a NEOVĚŘENO fallback z `eshop-sources.js`. DPH volá jen když ARES vrátí `dic` ve tvaru `CZ\d{8}`.
- `src/firm-rules.js`: čistá pravidla F01–F12, F14, F15 (F13 se neimplementuje, F16 je až v orchestrátoru) → `findings`, `facts` (`source`, `observedAt`).
- `POST /api/firm`:
  - stejné kontroly jako `/api/eshop-operator` (Origin, session, tělo ≤ 256 B, jen klíč `ico`);
  - **vlastní** `AdmissionGate(2)` a limiter (10/min na session, 20/min globálně);
  - cache v paměti 10 min podle IČO (jen data registrů);
  - odpověď = `CheckResult` (Stage 1) přes `fromFirm`.
- Stránka `/proverit-firmu`:
  - stávající design;
  - formulář jen s IČO (`inputmode="numeric"`, `autocomplete="off"`);
  - výsledek přes `verdict-view.js`;
  - odkazy „Ověřte si“: ARES detail, výpis z or.justice.cz (Sbírka listin), ISIR lustrace, Registr DPH (MOJE daně) – statické šablony s IČO.
- Stage 0 karta „Prověřit firmu“ (dnes „Již brzy“) se v posledním kroku přepne na aktivní odkaz.

## 2.5 Pravidla (výřez, plné znění v `SPEC_PROVERIT_FIRMU.md` kap. 6)

| ID | Zdroj | Podmínka | Závažnost |
|---|---|---|---|
| F-NF | ARES | IČO neexistuje (404) | `attention` („Subjekt s tímto IČO v ARES neexistuje. Ověřte IČO u protistrany.“) |
| F01 | ARES | `datumZaniku` / VR vymazán | `serious` |
| F02 | ARES VR | aktivní člen orgánu `LIKVIDATOR` / zápis o likvidaci | `serious` |
| F03 | ARES VR | insolvenční/konkurzní zápis bez `datumVymazu` | `serious` |
| F04 | ARES VR | jen historický insolvenční zápis | `attention` |
| F05 | ARES | `stavZdrojeIr = AKTIVNI` bez F03/F04 | `attention` („má záznam v ISIR“, nikdy „probíhá insolvence“) |
| F06 | DPH | `nespolehlivyPlatce = ANO` a `typSubjektu ≠ NESPOLEHLIVA_OSOBA` | `serious` |
| F07 | DPH | `typSubjektu = NESPOLEHLIVA_OSOBA` | `serious` (má přednost před F06) |
| F09 | ARES | vznik < 6 měsíců | `attention` |
| F10 | ARES VR | ≥ 2 změny statutárů za 12 měsíců | `attention` |
| F12 | ARES | s. r. o. / a. s. bez záznamu ve VR | `attention` |
| F14 | DPH | `NENALEZEN` | `info` |
| F15 | ARES VR | základní kapitál < 1 000 Kč | `info` |

**Zakázané formulace v celé aplikaci (test):** „podvod“ jako závěr, „bezpečná/důvěryhodná firma“, „spolehlivý plátce“, „doporučujeme obchodovat“, procenta a skóre.

F08 (porovnání účtu se zveřejněnými účty) je ve V2 kroku 2.9. MVP nemá pole pro účet a drží se jen IČO.

---

# 3. IMPLEMENTATION_PLAN (malé commity, každý s testy, pořadí závazné)

| Krok | Obsah | Soubory | Závisí na |
|---|---|---|---|
| **S1.1** | `verdict-model.js`: typy, `deriveLevel` L1–L5, validace invariantů, katalog headline šablon | `public/verdict-model.js`, `tests/verdict-model.test.js` | — |
| **S1.2** | `verdict-adapters.js` pro message/loan/web/contract (zatím jen testy, UI beze změny) | `public/verdict-adapters.js`, `tests/verdict-adapters.test.js` | S1.1 |
| **S1.3** | `verdict-view.js` renderer + styly v **novém** `public/verdict.css` (ne `style.css`) | `public/verdict-view.js`, `public/verdict.css`, `tests/verdict-view.test.js` (jsdom-free: renderer testovaný přes Playwright skript) | S1.1 |
| **S1.4** | Server: allowlist nových statických assetů a CSP beze změny | `src/server.js` (jen mapa assetů), `tests/web-release.test.js` | S1.3, **Stage 0 sloučena** |
| **S2.1** | Relay `/v1/registry/ares-profile` + minimalizace + limity | `ai-proxy.cjs`, `tests/firm-relay.test.js`, `test-support/contract/relay-fetch.cjs` (fake upstream, rozšířit) | — |
| **S2.2** | Relay `/v1/registry/dph` (SOAP, XML bez DTD, limity h/24 h, odstávky) | `ai-proxy.cjs`, `tests/firm-relay.test.js` | S2.1 |
| **S2.3** | `firm-sources.js` (klient relay, 4s rozpočet, cache 10 min) | `src/firm-sources.js`, `tests/firm-sources.test.js` | S2.1, S2.2 |
| **S2.4** | `firm-rules.js` + fixtures (Alza 27082440, likvidace 02032945, historická insolvence 04147464, nespolehlivý plátce 00121100, nespolehlivá osoba 01988468, neplátce 01432087, 404) – **jen anonymizované/minimalizované snapshoty** | `src/firm-rules.js`, `test-support/firm/*.json`, `tests/firm-rules.test.js` | S1.1 |
| **S2.5** | `POST /api/firm` (Origin, session, gate, limiter, cache) → `CheckResult` | `src/server.js`, `tests/firm-api.test.js` | S2.3, S2.4, S1.2 |
| **S2.6** | Stránka `/proverit-firmu` + sitemap + allowlist + `.dockerignore` (nové `test-support/firm/` jmenovitě!) | `public/firm.html`, `public/firm.js`, `src/server.js`, `public/sitemap.xml`, `.dockerignore` | S1.3, S2.5 |
| **S2.7** | Playwright: `scripts/firm-browser.js` (320/375/430 px, relay výpadek → NEOVĚŘENO, jen IČO odchází, žádné externí requesty) | `scripts/firm-browser.js` | S2.6 |
| **S2.8** | Homepage: karta „Prověřit firmu“ z „Již brzy“ na aktivní odkaz; `tests/web-release.test.js` počty | `public/index.html`, `tests/web-release.test.js` | S2.7, Stage 0 |
| S1.5 | Migrace Web a Smlouva na `verdict-view` (každá zvlášť) | `public/web.html`, `web-checker.js`, `contract.js` | S1.3 |
| S1.6 | Migrace Zpráva a Půjčka | `public/app.js`, `public/loan.js`, … | **F5a sloučeno** |
| 2.9 *(volitelné)* | Vyhledání podle názvu (kandidáti, `/v1/registry/ares-search`) a F08 (účet) | — | S2.8 |

**Release:**
1. Po S2.8 jeden release přes `deploy/release/verimtomu-release.sh` (web + relay ze stejného SHA).
2. **Před `deploy` spustit jednorázový DPH test z relay** (D1).

---

# 4. ACCEPTANCE_CRITERIA

## Stage 1

1. `deriveLevel` je pokrytý generovanou pravdivostní tabulkou: každá kombinace (`serious`/`attention`/`info`/žádný) × `origin` (`rules`/`registry`/`ai`) × stav zdrojů. Výsledek odpovídá L1–L5.
2. **Žádný vstup s `unavailable` nebo `skipped` povinným zdrojem nedá `none_found`** (property test, 1 000 náhodných vstupů).
3. **AI nikdy nesníží úroveň a nikdy nevytvoří `serious`.** Test: přidání AI nálezu k libovolnému vstupu nesníží level.
4. Adaptéry:
   - `fromMessage` zachová pořadí `recommended_actions` 1:1;
   - `risk_score` není v žádném výstupu (deep scan klíčů a textů, regex `\d+\s*%|/\s*100`);
   - checkery s `canConfirmAbsence=false` nikdy nevrátí `none_found`.
5. Renderer:
   - jen `textContent` (statický test: žádné `innerHTML`, `insertAdjacentHTML`, `document.write` v `verdict-*.js`);
   - pořadí sekcí podle 1.6;
   - AI sekce se nezobrazí, pokud `ai.status ≠ performed`;
   - AI sekce nikdy neobsahuje název poskytovatele/modelu.
6. Mobil:
   - na 320, 375, 390 a 430 px je verdikt i primární akce v prvních 568 px;
   - `scrollWidth ≤ innerWidth`;
   - všechny ovládací prvky ≥ 48 px;
   - fokus po vykreslení je na nadpisu verdiktu;
   - kontrast ≥ 4,5 : 1 pro všechny nové barvy.
7. Všechny stávající testy procházejí beze změny prahů. CSP hlavičky jsou bajtově beze změny.

## Stage 2

1. **Jen IČO opouští prohlížeč.** Playwright síťový spy: tělo `{"ico":"########"}` na `/api/firm`, žádný jiný origin.
2. **Relay SSRF:**
   - každý vstup mimo přesný tvar (URL, `../`, `?`, `#`, mezery, extra klíče, duplicitní klíče, > 64 B) → 400 **bez upstream volání**;
   - redirect, oversize, špatný content-type, nesoulad IČO/DIČ, DTD/entity v XML, timeout → 502;
   - žádná route nepřijme URL, host ani cestu z klienta;
   - stávající `/v1/registry/ares` a AI routy mají beze změny stejné odpovědi (regresní testy).
3. **Limity:**
   - 3. souběžný požadavek → 429;
   - 21. profil za minutu → 429;
   - DPH 11./min → 429, 501./h → 429;
   - požadavky odmítnuté validací se do limitů nepočítají;
   - cache: 2 dotazy na stejné IČO do 10 min = 1 upstream profil.
4. **Minimalizace:**
   - fixture VR s `datumNarozeni` a `adresa` u FO → v odpovědi relay **ani** `/api/firm` tyto klíče a hodnoty nejsou (deep scan);
   - DPH odpověď neobsahuje `nazevSubjektu` ani `adresa`.
5. **Pravidla:**
   - každá fixture z S2.4 dá očekávaný level a ruleId;
   - historická insolvence nikdy nedá F03;
   - nespolehlivá osoba dá F07 a nikdy zároveň F06;
   - neplátce dá jen `info`.
6. **Výpadky:**
   - ARES nedostupný → `incomplete`, žádná fakta;
   - VR nedostupný → `attention` (L3) + sekce „Veřejný rejstřík neověřen“;
   - DPH nedostupný nebo odstávka → `attention` (L3) + text o odstávce;
   - nikdy `none_found`.
7. **Texty:**
   - zakázané formulace se nevyskytují v `firm*.js`, `verdict*.js`, šablonách ani vykresleném DOM;
   - `none_found` vždy obsahuje povinnou větu o neověřené bezpečnosti.
8. **Release:**
   - build gate projde z čistého `git archive` (včetně nových `test-support/firm/*`);
   - relay image obsahuje `ai-proxy.cjs` ze SHA;
   - z běžícího web kontejneru `adisrws.mfcr.cz` a `ares.gov.cz` hlásí BLOCKED;
   - z relay DPH test PASS.

---

# 5. RISKS_AND_DEPENDENCIES

| # | Riziko / závislost | Dopad | Opatření |
|---|---|---|---|
| D1 | **Dostupnost Registru DPH z produkčního relay není ověřena** (test připraven v `SPEC_PROVERIT_FIRMU.md` kap. 15) | bez egressu by DPH bylo vždy `unavailable` → každá firma maximálně 🟠 | jednorázový test na VPS **před deployem Stage 2**. Implementaci neblokuje; adaptér je fail-closed |
| D2 | **F5a** mění `public/app.js`, `index.html` a `style.css` | konflikt při migraci zprávy a půjčky | S1.6 až po sloučení F5a; Stage 1 používá nové soubory `verdict-*.js` a `verdict.css` |
| D3 | **Stage 0** mění `index.html` a `style.css` (karta, mobilní navigace) | konflikt v S1.4 a S2.8 | S1.4 a S2.8 až po sloučení Stage 0 |
| D4 | Stage 2 závisí na S1.1 a S1.2 (model a `fromFirm`) a S1.3 (renderer) | — | pořadí v kap. 3 |
| R1 | ARES VR obsahuje osobní údaje (datum narození, bydliště) | únik osobních údajů | minimalizace v relay + test deep scanu; logy jen IČO a ruleId |
| R2 | Sémantika `stavZdrojeIr = AKTIVNI` zahrnuje i historické záznamy (ověřeno na 04147464) | falešný dojem probíhající insolvence | F05 jen `attention` s textem „má záznam v ISIR“ + odkaz na lustraci |
| R3 | Zpoždění ARES proti zdrojovým registrům | zastaralý údaj | u každého faktu `observedAt` + odkaz na zdroj; text „stav k datu“ |
| R4 | Limity GFŘ (IP blok při překročení) a ARES (500/min) | zablokování relay IP | tvrdé limity v relay pod hranicí + cache; neplatné dotazy se neodesílají |
| R5 | Nová route v relay vyžaduje rebuild relay image | riziko nasazení | existující release skript s nezávislým rollbackem relay; `/v1/registry/ares` beze změny (regresní test) |
| R6 | Nové fixtury v `test-support/firm/` se nemusí dostat do build kontextu | build gate selže | `.dockerignore` jmenovitě (AC Stage 2 bod 8) |
| R7 | Občasné selhání testu „20ms CPU gate“ v buildu | opakovaný build | beze změny prahu; gate je fail-closed |
| R8 | Uživatel může zaměnit 🟢 za „bezpečné“ | špatné rozhodnutí | povinná věta u `none_found`, ✓ = „kontrola proběhla“, žádná procenta |

---

## VERDIKT

**READY FOR CODEX.**

Stage 1 (kroky S1.1–S1.3, S1.5) a Stage 2 (S2.1–S2.7) lze implementovat hned. Kroky S1.4 a S2.8 počkají na sloučení Stage 0, krok S1.6 na sloučení F5a. Produkční nasazení Stage 2 vyžaduje jen jednorázový DPH test z relay (D1); implementaci neblokuje.
