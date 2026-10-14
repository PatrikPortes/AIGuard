# Stage 3 – Check Orchestrator

*Původně návrh pro Codex. Stav 2026-10-14: S3.1–S3.7 implementováno (větve `feat/stage3-*`), S3.8 pre-release opravy; nic není nasazeno. Aktuální stav: kap. 12.*
*Produkce: `54e0058b0096aaff5a7b580841669eea11843517` (Stage 0–2, VERIFY OK).*
*Navazuje na `docs/specs/SPEC_STAGE1_STAGE2.md` (CheckResult, L1–L5) a `docs/specs/SPEC_PROVERIT_FIRMU.md`.*

---

## 1. CURRENT_ARCHITECTURE (ověřeno v kódu `54e0058`)

### 1.1 Checkery

| Checker | Kde běží | Vstup | Výstup (dnes) | Adaptér → `CheckResult` | Síť |
|---|---|---|---|---|---|
| **Zpráva** | server `src/analysis.js` `analyze(input)` (rules-v1). Případné AI jde přes `pipeline.analyze` v `/api/analyze` | text, typ, odesílatel | `risk_level`, `signals[]`, `recommended_actions[]`, … | `fromMessage(a, opts)` (`public/verdict-adapters.js`) | žádná (rules); AI přes relay |
| **Půjčka** | stejné API (`topic: 'loan'`) + `public/loan-cost.js` (prohlížeč) | text + odpovědi, čísla kalkulačky | jako zpráva + kalkulace | `fromLoan(a, calc, opts)` | jako zpráva |
| **Web** | **prohlížeč** `public/web-checker.js` `checkWebUrl(url)`: čistá funkce, importovatelná i na serveru. ČOI přes `public/eshop-checker.js` `coiResult(host, data)` + `/eshop-coi.json` | URL | `{status:'unverified', hostname, signals[]}` | `fromWeb(urlResult, coi, ares, opts)` | **žádná. URL nikdy neopouští prohlížeč** (slib produktu, test `scripts/ares-browser.js`) |
| **Smlouva** | prohlížeč `public/contract-*.js` (+ volitelná AI `/api/analyze-contract`) | text/PDF | nálezy s klasifikací | `fromContract(result, opts)` | žádná (rules) |
| **Firma** | server `src/firm-sources.js` → `src/firm-rules.js` `evaluateFirm` → `public/firm-verdict.js` `fromFirm` | IČO | `CheckResult` (přímo) | `fromFirm(profile, findings)` | relay: ARES (základ, VR, RES) + DPH |

### 1.2 API (`src/server.js`)

| Endpoint | Limity |
|---|---|
| `POST /api/analyze` | Origin + session, body ≤ 64 kB, `globalLimiter('analysis')`, visitor quota, AI pipeline |
| `POST /api/analyze-contract` | body ≤ 256 kB, AI kontrakt |
| `POST /api/eshop-operator` | `{"ico"}` ≤ 256 B, `registryRequests` gate 2, `registryLimiter` 20/min |
| `POST /api/firm` | přesný wire formát `{"ico":"########"}`, `firmRequests` gate 2, `firmLimiter` 20/min globálně, `firmSessionLimiter` 10/min; `firmClient.profile()` má cache 10 min a in-flight dedup podle IČO |
| `GET /eshop-coi.json`, `/api/health`, `/api/session`, `/api/contract-status` | — |

### 1.3 Relay (`ai-proxy.cjs`, 172.30.41.3:8080, jediný egress)

`/v1/registry/ares` (Web), `/v1/registry/ares-profile`, `/v1/registry/dph` (Firma), AI routy. Pevné upstreamy a přesný formát vstupu. Web kontejner nemá žádný outbound kromě relay.

### 1.4 Verdict foundation (`public/verdict-model.js`)

- `CheckResult` schema 1;
- `LEVELS` = `serious`, `attention`, `none_found`, `incomplete`, `not_assessable`;
- `deriveLevel` L1–L5;
- `createCheckResult` / `validateCheckResult` (invarianty: AI ≠ červená, registry nález vyžaduje registry fakt, žádné snížení důvěryhodné červené);
- `isSafeCopy`, `approvedLink`, `HEADLINES`, `CHECKERS` (`message`, `loan`, `web`, `contract`, `firm`);
- renderer `public/verdict-view.js` `renderVerdict`.

### 1.5 Hranice

**F5a:** *(stav 2026-10-14: F5a je dokončená a nasazená v produkci, commit `fd9f7b4`; lokální větev `frontend/f5a-neutral-result` je starší rozpracovaná verze a nemerguje se. Viz kap. 12.)* Původní znění: `public/app.js`, `public/index.html`, `public/style.css` a `docs/design/DESIGN_SYSTEM.md` jsou rozpracované. Stránky **Zpráva a Půjčka** (`message.html`, `loan.html`) běží na `app.js`.

---

## 2. ORCHESTRATOR_ARCHITECTURE

**Rozhodnutí: C, kombinace.** Nová služba nevzniká.

```
public/check-plan.js        ČISTÝ sdílený modul (prohlížeč i server): model, planner, agregace. Žádné I/O, žádný DOM.
src/check-runner.js         serverový runner: provede kroky plánu přes existující funkce in-process, rozpočty, dedup, limity.
POST /api/check             nový endpoint v současné aplikaci: {text?, ico?} → CombinedResult.
public/check-flow.js        klientský runner pro stránky, kde vstup nesmí na server (Web: URL zůstává v prohlížeči).
public/check-view.js        „Co jsme prověřili“ – rozšíření rendereru (používá renderVerdict pro dílčí výsledky).
```

**Architektonické pravidlo (závazné):**
- `public/check-plan.js` **nesmí importovat žádný checker**: `web-checker.js`, `eshop-checker.js`, `contract-*.js`, `loan*.js`, `firm*.js`, `src/*`. Smí importovat nejvýš `./verdict-model.js` (modul bez importů a bez DOM).
- **URL normalizér `checkWebUrl` předává volající jako parametr** (dependency injection):
  - `planCheck(input, {runAt, normalizeUrl})`;
  - `validateCheckPlan(plan, {normalizeUrl})`.
- Volající:
  - serverový runner (S3.3) předává `checkWebUrl` z `../public/web-checker.js` (v Node bezpečné, DOM část se nespustí);
  - Web stránka (S3.6) předává už načtený `checkWebUrl`.
- Důvod: `web-checker.js` a transitivně `eshop-checker.js` při importu v prohlížeči připojují handlery k `#web-form` a `#operator-form`. Mimo stránku Web import padá (`TypeError … reading 'addEventListener'`, reprodukováno na `/proverit-firmu`).

**Proč C:**
- Planner a agregace musí být identické v prohlížeči i na serveru. Proto jsou v jednom čistém modulu, stejný vzor jako `verdict-model.js`.
- Server smí spouštět jen to, co uživatel serveru stejně posílá: text zprávy, IČO. **URL zadaná do Web Checkeru se na server nikdy neposílá.** Proto má Web stránka klientský runner, který volá jen existující `/api/firm`.
- Orchestrátor volá checkery **přímo jako funkce**, ne přes HTTP. Nevzniká interní síťová cesta, SSRF ani smyčka.

**Na co se nesahá:**
- existující endpointy, checkery a adaptéry (jen se volají);
- relay (Stage 3 nepřidává žádný upstream);
- `CheckResult` schema 1 (agregát je nový obalový typ `CombinedResult`).

---

## 3. CHECK_PLAN_MODEL (`public/check-plan.js`)

```js
CheckPlan {
  schema: 1,
  planner: 'p1',                       // verze pravidel planneru
  input: {                             // CO UŽIVATEL ZADAL (bez surového textu)
    text: { present: bool, chars: int } | null,
    urlField: { host, normalized } | null,      // jen klientský runner
    icoField: '########' | null,
    extracted: { urls: [{host, normalized}], icos: ['########'], ignored: [{kind, reason}] }
  },
  steps: Step[],                       // KTERÉ KONTROLY A PROČ
  notPlanned: [{ kind, value, reason: 'limit'|'ambiguous'|'duplicate'|'invalid' }],
  budget: { maxSteps: 4, maxUrls: 2, maxIcos: 1, deadlineMs: 5000 }
}

Step {
  id: 's1'..'s4',
  checker: 'message'|'web'|'firm'|'contract'|'loan',        // Stage 4: 'investment'
  input: { kind: 'text'|'url'|'ico', ref: string },          // ref = 'text' | normalized URL | IČO
  trigger: 'user_field'|'extracted_from_text',
  reason: { ruleId: 'P1'..'P7', text },                      // PROČ byla spuštěna
  required: bool,                                            // ovlivňuje agregaci (A3)
  primary: bool,                                             // právě jeden krok
  runAt: 'server'|'client'
}

StepOutcome {                          // výstup runneru, 1:1 ke Step
  stepId, status: 'done'|'failed'|'skipped',
  skipReason?: 'rate_limited'|'deadline'|'duplicate'|'budget',
  sourcesContacted: ('ARES'|'ARES_VR'|'ARES_RES'|'DPH'|'COI'|'none')[],   // KTERÉ ZDROJE
  durationMs: int,
  result: CheckResult | null           // CO BYLO OVĚŘENO / INDIKÁTOR / NEOVĚŘENO (fakta, findings, sources ze Stage 1)
}

CombinedResult {
  schema: 1, kind: 'combined',
  plan: CheckPlan,
  outcomes: StepOutcome[],
  aggregate: {
    level, headline,                   // LEVELS + HEADLINES z verdict-model
    reasons: [{ ruleId: 'A1'..'A6', stepId: string|null, text }],   // JAK výsledky ovlivnily verdikt
    actions: { primary, secondary[] }  // převzato z dílčích výsledků, nic se negeneruje
  },
  checkedAt
}
```

**Dohledatelnost:**

| Otázka | Kde je odpověď |
|---|---|
| Co uživatel zadal | `plan.input` |
| Které kontroly | `plan.steps` |
| Proč | `step.reason` |
| Které zdroje | `outcome.sourcesContacted` + `result.sources` |
| Co je ověřené | `result.facts[kind=registry]` |
| Co je jen indikátor | `result.findings[origin=rules\|ai]` |
| Co nešlo ověřit | `result.sources[status≠checked]` + `outcome.status≠done` + `plan.notPlanned` |
| Vliv na verdikt | `aggregate.reasons[]` s odkazem na `stepId` |

**Soukromí:**
- `CombinedResult` neobsahuje surový text; jen `chars`.
- Neukládá se.
- Log obsahuje jen `planner`, ruleId kroků, statusy a `durationMs`.

---

## 4. PLANNER_RULES (`planCheck(input, opts)`, čistá deterministická funkce, bez AI)

**Normalizace vstupu:**
- `text`: string 1–20 000 znaků po trimu (stejný limit jako dnešní validace zprávy; přesná hodnota z `validateInput`);
- `ico`: `validateRegistryInput` (8 číslic + checksum);
- `url`: jen klientský runner, přes `checkWebUrl` (vyhazuje na neplatné).

| ID | Podmínka | Krok | trigger | required | primary |
|---|---|---|---|---|---|
| **P1** | `text` přítomen | `message` (rules-v1) | user_field | ano | ano, pokud chybí `urlField` |
| **P2** | `urlField` přítomen (klient) | `web` | user_field | ano | ano |
| **P3** | `icoField` přítomen | `firm` | user_field | ano | ano, pokud není `text` ani `urlField` |
| **P4** | v textu nalezeny URL (`https?://` nebo `www.`, max 2 různé hosty, každý projde `checkWebUrl`) | `web` pro každou | extracted_from_text | ano (lokální, nemůže selhat síťově) | ne |
| **P5** | v textu **právě jedno** různé IČO s návěštím `IČ`, `IČO` nebo `IČ:` do 12 znaků před číslem, s platným checksumem, a `icoField` chybí | `firm` | extracted_from_text | **ne** (relevance IČO k odesílateli není jistá) | ne |
| **P6** | dedup: stejné IČO / stejná normalizovaná URL → jeden krok; `user_field` má přednost před `extracted` | — | — | — | — |
| **P7** | limity: celkem ≤ 4 kroky (≤ 1 message, ≤ 2 web, ≤ 1 firm). Co se nevejde, jde do `notPlanned` s `reason: 'limit'`. ≥ 2 různá IČO v textu → žádný firm krok, všechna do `notPlanned` s `reason: 'ambiguous'` | — | — | — | — |

**Pevné zásady:**
- **Planner běží jednou, jen nad uživatelským vstupem.** Výstupy checkerů se nikdy nevracejí do planneru. Nevzniká rozvětvování ani smyčka.
- Text bez URL a bez IČO dá jen P1. Samotné IČO dá jen P3. Samotná URL (Web stránka) dá jen P2.
- Kombinace ze zadání:
  - `URL` → Web (P2);
  - `IČO` → Firma (P3);
  - `text + URL v textu` → Zpráva + Web (P1 + P4);
  - `text + IČO v textu` → Zpráva + Firma (P1 + P5);
  - `URL + IČO` (Web stránka) → Web + Firma (P2 + P3).

---

## 5. VERDICT_AGGREGATION (`aggregate(steps, outcomes)`, čistá funkce)

Vstupem jsou jen validní `CheckResult` (`validateCheckResult`). Pořadí pravidel je závazné, první platné rozhoduje:

| ID | Pravidlo | Výsledek |
|---|---|---|
| **A1** | některý `result.level === 'serious'` (Stage 1 zaručuje, že nejde o AI) | `serious` |
| **A2** | primární krok `status≠done` nebo `result.level === 'incomplete'` | `incomplete` |
| **A3** | některý **required** krok `failed` nebo `skipped`, nebo jeho `result.level === 'incomplete'` | `attention` („Část kontrol se nepodařilo dokončit: …“) |
| **A4** | některý výsledek `attention` (včetně ne-required kroků, které proběhly) | `attention` |
| **A5** | některý výsledek `not_assessable` | `not_assessable` |
| **A6** | všechny provedené výsledky `none_found` | `none_found` + povinná věta o neověřené bezpečnosti |

- Ne-required krok, který selhal nebo byl přeskočen, verdikt nezhorší. V UI je ale vždy vidět jako ⚪ s důvodem.
- **Nedostatek informací ≠ bezpečné.** Zpráva a Web mají v Stage 1 `canConfirmAbsence=false`, takže každý jejich výsledek je nejvýš `not_assessable`. Agregát se zprávou nebo webem proto **nikdy není 🟢** (A5). 🟢 může vzniknout jen z čistě registrové kontroly (Firma) bez nálezů.
- Žádné sčítání, váhy ani procenta. Tři `attention` jsou pořád `attention`.
- **AI:** agregace nevolá AI a nepřebírá nic mimo `CheckResult`. Pravidla Stage 1 (AI nesnižuje, AI nevytvoří červenou) zůstávají v dílčích výsledcích a A1–A6 je nemohou porušit, protože úroveň jen zvyšují.
- `aggregate.reasons` obsahuje rozhodující pravidlo, `stepId` a pro A3 seznam kroků.
- `aggregate.actions.primary` je primární akce kroku s nejhorší úrovní (`serious` > `incomplete` > `attention` > `not_assessable` > `none_found`), při shodě podle pořadí kroků. `secondary` jsou deduplikované akce dalších kroků, max. 3.

---

## 6. SECURITY_AND_BUDGETS

| Hrozba | Opatření |
|---|---|
| **SSRF** | Orchestrátor nevolá žádnou URL. `web` krok je strukturální rozbor `checkWebUrl` (bez sítě). `firm` krok jde přes existující `firmClient` a relay s pevnými upstreamy. `/api/check` nepřijímá pole `url` (URL jen uvnitř textu, který uživatel serveru posílá kvůli zprávě) |
| **Nekontrolovaný fan-out** | P7: max 4 kroky, 2 web, 1 firm. Planner se nevolá znovu |
| **Smyčky** | Runner volá checkery in-process. Checkery neimportují `check-runner.js` ani `check-plan.js` (test statické analýzy). Žádné HTTP volání sebe sama |
| **Rate limity registrů** | `firm` krok sdílí **stejné instance** `firmClient`, `firmRequests`, `firmLimiter` a `firmSessionLimiter` jako `/api/firm`. Při vyčerpání se krok `skipped: rate_limited` a zobrazí se. Celý `/api/check` se počítá jako 1× `globalLimiter('analysis')` + session limiter jako `/api/analyze` |
| **Dlouhé requesty** | celkový `AbortSignal.timeout(5000)` pro plán. Firm krok má vlastní 4 s (už v `firmClient`). Po deadline se nedokončené kroky označí `skipped: deadline` a agregát se vrátí (A2/A3) |
| **Duplicitní kontroly** | P6 v planneru (v rámci plánu) + `firmClient` cache 10 min a in-flight dedup (napříč požadavky) |
| **Únik osobních údajů** | Žádný surový text ve výstupu ani v logu. Firm data procházejí existující minimalizací (relay + `sanitizeFirmProfile`). Výstup se validuje `validateCheckResult` a novým `validateCombinedResult` (whitelist klíčů, `isSafeCopy`) |
| **Velikost vstupu** | `/api/check`: body ≤ 64 kB (jako `/api/analyze`), přesné klíče `{text?, ico?}`, aspoň jeden. Neznámý klíč → 400 |
| **CPU** | message krok používá existující `analyze()` rules-v1 s CPU gate testy. Žádný nový text parser kromě regexů P4/P5 s omezenou délkou vstupu (≤ 20 000 znaků, lineární regexy, test 40k) |

---

## 7. UX – „Co jsme prověřili“

Bez redesignu. Použije se stávající Verdict UX a přidá se jedna sekce nad dílčími výsledky:

```
🟠 STOJÍ ZA POZORNOST                         ← aggregate.headline
Proč tento výsledek? ▸                        ← aggregate.reasons (A1–A6 + krok)
CO UDĚLAT TEĎ                                 ← aggregate.actions

CO JSME PROVĚŘILI
✓ Zpráva – pravidla                           [detail ▸]   důvod: „Vložili jste text zprávy“ (P1)
✓ Web alza-cz.example – struktura adresy       [detail ▸]   důvod: „Odkaz ve zprávě“ (P4)
✓ Firma IČO 27082440 – ARES, VR, RES, DPH      [detail ▸]   důvod: „IČO uvedené ve zprávě“ (P5) · „Neověřili jsme, že zprávu poslala tato firma.“
⚪ DPH se nepodařilo ověřit                     zdroj nedostupný (Registr DPH, 13:04)
– 2 další IČO v textu jsme neprověřili         důvod: nejednoznačné (P7)
```

- ✓ znamená „kontrola proběhla“, ne „v pořádku“. Barvu nese jen úroveň dílčího výsledku v detailu.
- Každý řádek ukazuje zdroj (`sourcesContacted` / `result.sources`) a důvod (`step.reason`).
- Detail vykreslí existující `renderVerdict(result)`.
- Mobil:
  - řádky jsou `<details>`, prvky ≥ 48 px, bez horizontálního overflow na 320 px;
  - fokus jde na agregovaný nadpis;
  - `role="status"` během běhu.
- Text vždy přes `textContent`. CSP beze změny.

---

## 8. IMPLEMENTATION_STEPS

| Krok | Obsah | Soubory (jen tyto) | Závisí na | Nesmí se měnit |
|---|---|---|---|---|
| **S3.1** | Model + planner (P1–P7) + validace plánu | `public/check-plan.js` (nový), `tests/check-plan.test.js` (nový) | — | vše ostatní |
| **S3.2a** (povinný první krok S3.2) | Odstranit import `web-checker.js` z `check-plan.js`; normalizér URL jen parametrem `normalizeUrl` v `planCheck` a `validateCheckPlan`; `text`/`url` bez `normalizeUrl` → `throw Error('URL_NORMALIZER_REQUIRED')`, vstup jen s IČO ho nevyžaduje | `public/check-plan.js`, `tests/check-plan.test.js` | S3.1 | `public/web-checker.js`, `public/eshop-checker.js`, `src/server.js`, `web.html`, F5a soubory |
| **S3.2** | Agregace A1–A6 + `validateCombinedResult` | `public/check-plan.js`, `tests/check-aggregate.test.js` (nový) | S3.1 | `verdict-model.js`, adaptéry |
| **S3.3** | Serverový runner: in-process kroky (`message` = `analyze` + `fromMessage`; `web` = `checkWebUrl` + `coiResult(readCoiSnapshot)` + `fromWeb`; `firm` = sdílený `firmClient` + `evaluateFirm` + `fromFirm`), deadline, dedup, mapování limitů na `skipped` | `src/check-runner.js` (nový), `tests/check-runner.test.js` (nový, fake checkery + fake hodiny) | S3.1, S3.2 | checkery, `firm-sources.js`, relay |
| **S3.4** | `POST /api/check` (přesné klíče, Origin/session, sdílené limitery a gate, 64 kB) | `src/server.js` (jen nová větev + předání sdílených instancí), `tests/check-api.test.js` (nový) | S3.3 | ostatní endpointy a jejich limity, CSP |
| **S3.5** | „Co jsme prověřili“ renderer | `public/check-view.js`, `public/verdict.css` (jen nové třídy), `tests/check-view.test.js`, `scripts/check-browser.js` | S3.2 | `verdict-view.js` API, `style.css` (F5a) |
| **S3.6** | **První reálný flow: Web stránka „URL + volitelné IČO provozovatele“** (klientský runner: P2 lokálně, P3 přes existující `/api/firm`; URL nikdy na server) | `public/check-flow.js` (nový), `public/web.html`, `public/web-checker.js` (jen napojení), `src/server.js` (allowlist nových assetů), `scripts/ares-browser.js` (rozšíření: URL se neodesílá, firm se volá) | S3.5 | `/api/eshop-operator` (zůstává pro zpětnou kompatibilitu), relay |
| **S3.7** | Textový flow „Zpráva + Web + Firma“ na stránce Zpráva. **Implementováno klientským runnerem (`check-flow.js`), ne přes `/api/check`; viz kap. 12.** | `public/app.js`, `public/message.html`, `public/check-flow.js`; `public/web-checker.js` a `public/eshop-checker.js` jen podmíněné napojení formulářů | S3.4, S3.5, F5a (sloučeno, `fd9f7b4`) | `/api/check`, relay, API |
| **S3.8** | Release: `.dockerignore` (nové testy/fixtures jmenovitě), release skript beze změny, ruční post-deploy kontrola `/api/check` | `.dockerignore`, `docs/reviews/STAGE3.md` | S3.6 (S3.7 volitelně) | relay, release skript |

---

## 9. ACCEPTANCE_CRITERIA

**S3.1 – planner**
1. Tabulka P1–P7 je pokrytá testy: text, `icoField`, `urlField`, text s 1/2/3 URL, text s 0/1/2 IČO, neplatný checksum, IČO bez návěští, duplicitní IČO a URL, field + extracted shodné.
2. Determinismus: stejný vstup → `deepEqual` plán (100 opakování, permutace pořadí URL v textu dá stejný set kroků).
3. Limity: nikdy > 4 kroky, > 2 web, > 1 firm, > 1 message (property test 1 000 náhodných vstupů).
4. Výstup neobsahuje surový text, jen `chars`.
5. Výkon: text 20 000 znaků s 500 kandidáty URL/IČO naplánován < 20 ms CPU (`process.threadCpuUsage`).

**S3.2a – planner bez importu checkeru**
1. Statický test: `public/check-plan.js` importuje nejvýš `./verdict-model.js`, nic jiného.
2. Všechny dosavadní testy S3.1 dávají shodné plány (`deepEqual` fixture) při předání `checkWebUrl` z `../public/web-checker.js`.
3. `text` nebo `url` bez `normalizeUrl` → `URL_NORMALIZER_REQUIRED`. `{ico}` bez normalizéru → validní plán.
4. Produkční `web-checker.js`, `eshop-checker.js`, `server.js` a `web.html` jsou beze změny (diff proti základu).

**S3.2 – agregace**
1. Generovaná pravdivostní tabulka levelů (5) × status (`done`, `failed`, `skipped`) × required (ano/ne) × primary pro 1–4 kroky. Výsledek odpovídá A1–A6.
2. **Nikdy `none_found`, pokud** je některý krok message/web, nebo některý required krok není `done`/`none_found`.
3. Žádná kombinace nesníží `serious` dílčího výsledku.
4. `reasons[0].ruleId ∈ A1..A6` a pro A1–A4 ukazuje na existující `stepId`.
5. Výstup projde `validateCombinedResult`. Žádná čísla a procenta mimo pole `chars` a `durationMs`.

**S3.3 – runner**
1. Firm krok volá `firmClient.profile` **nejvýš jednou** na plán. Dva paralelní plány se stejným IČO dají jeden upstream profil (in-flight dedup).
2. Vyčerpaný `firmLimiter` → `skipped: rate_limited`, odpověď 200 s A3/A2, ne 429.
3. Deadline 5 s s falešnými hodinami → nedokončený krok `skipped: deadline`, celková doba < 5,2 s.
4. Statický test: žádný soubor checkeru neimportuje `check-runner.js` ani `check-plan.js`.
5. Žádný `fetch` v `check-runner.js` (statický test).

**S3.4 – API**
1. `{text}` / `{ico}` / `{text, ico}` → 200 `CombinedResult`.
2. `{url}`, neznámý klíč, prázdný objekt, > 64 kB, neplatné IČO → 400 bez spuštění kroků.
3. Origin/session chyby se chovají stejně jako u `/api/analyze`.
4. `/api/analyze`, `/api/firm` a `/api/eshop-operator` vracejí bajtově stejné odpovědi jako před změnou (regresní testy).

**S3.5 a S3.6 – UX a první flow**
1. Na 320/375/430 px je agregovaný verdikt a primární akce nad ohybem. Každý řádek „Co jsme prověřili“ má zdroj i důvod.
2. Web flow: Playwright síťový spy:
   - **URL nikdy v žádném requestu**;
   - při zadaném IČO právě 1× `/api/firm` s `{"ico":"########"}`;
   - bez IČO žádný request na API.
3. Bez IČO dá Web flow `not_assessable` nebo vyšší, nikdy 🟢.

**S3.8 – release**
1. Čistý `git archive` build gate PASS.
2. CSP všech stránek beze změny.
3. Release skript a nezávislý rollback projdou beze změny skriptu.

---

## 10. STAGE4_EXTENSION_POINT (Prověřit investici)

- `check-plan.js` exportuje tabulku `CHECKER_REGISTRY`:
  ```js
  { id, entityKinds: ['text','url','ico',…], runAt: 'server'|'client', requiredDefault, sourceIds: […] }
  ```
  a pole pravidel `PLANNER_RULES` (`{id, when(input), steps(input)}`).
- Investment přidá:
  - (1) položku registru `investment` (`entityKinds: ['investment_offer']`);
  - (2) pravidlo `P8: investment fields → investment`;
  - (3) runner handler v `check-runner.js` (`handlers.investment`);
  - (4) `'investment'` do `CHECKERS` ve `verdict-model.js` a adaptér `fromInvestment`.
- **Agregace (A1–A6), validátory, UX „Co jsme prověřili“ ani existující handlery se nemění.**
- Investice pak automaticky využije P3/P5 (emitent IČO → Firma) a P4 (URL nabídky → Web) bez nového kódu orchestrátoru.

---

## 11. RISKS

| # | Riziko | Opatření |
|---|---|---|
| R1 | **F5a** drží `app.js`, tedy stránky Zpráva a Půjčka | S3.7 až po sloučení F5a. První reálný flow (S3.6) je na stránce Web, která F5a nepoužívá. **Vyřešeno:** F5a je v produkci (`fd9f7b4`), S3.7 staví na produkčním `app.js` |
| R2 | Slib „URL webu neopouští prohlížeč“ | `/api/check` nepřijímá `url`. Web flow běží klientsky (S3.6). Test v `ares-browser.js` se rozšiřuje, ne mění |
| R3 | Extrahované IČO nemusí patřit odesílateli | P5 jen s návěštím a jen jedno; krok není required; UX věta „Neověřili jsme, že zprávu poslala tato firma.“ |
| R4 | Sdílené limity mezi `/api/firm` a `/api/check` | stejné instance limiterů. Vyčerpání se projeví jako `skipped`, ne chybou ani zelenou |
| R5 | Doba odpovědi (firm až 4 s) | deadline 5 s, částečný výsledek s A2/A3 |
| R6 | Rozšíření `CHECKERS` ve Stage 4 mění `verdict-model.js` | jediná aditivní změna, pokrytá existujícími invariant testy |
| R7 | Rozpočet Codexu | kroky S3.1–S3.6 mají 1–3 soubory a izolované testy. S3.1 a S3.2 jsou čistě funkcionální bez I/O |

---

## VERDIKT

**READY FOR CODEX** (S3.1–S3.6, S3.8). S3.7 čeká na sloučení F5a. *(Historický verdikt. F5a je sloučená, S3.7 implementováno; viz kap. 12.)*

---

## ZADÁNÍ PRO CODEX – POUZE S3.1

```
PROJEKT: Věřím tomu? – Stage 3, krok S3.1 (Core model + planner)
ZÁKLAD: release/web-checker-2-2026-10-13 (produkce 54e0058). Nová větev: feat/stage3-s3.1-planner.
SPEC: docs/specs/SPEC_STAGE3_ORCHESTRATOR.md, kap. 3, 4, 9 (S3.1).

VYTVOŘ POUZE:
  public/check-plan.js
  tests/check-plan.test.js

public/check-plan.js – čistý ES modul (žádný DOM, fetch, fs, process, Date.now bez injekce):
  import {validateRegistryInput} – NE (je v src/); implementuj vlastní validIco(ico) se stejným checksumem
  jako src/eshop-sources.js (8 číslic, vážený součet 8..2, mod 11 → kontrolní číslice).
  import {checkWebUrl} from './web-checker.js'   // NAHRAZENO v S3.2a: check-plan.js nesmí importovat checker; normalizér předává volající (normalizeUrl)
  export const PLANNER_VERSION = 'p1';
  export const BUDGET = Object.freeze({maxSteps:4, maxUrls:2, maxIcos:1, deadlineMs:5000});
  export const CHECKER_REGISTRY = Object.freeze({
    message:{entityKinds:['text'],runAt:'server',requiredDefault:true},
    web:{entityKinds:['url'],runAt:'client',requiredDefault:true},     // server smí jen pro URL z textu
    firm:{entityKinds:['ico'],runAt:'server',requiredDefault:true}
  });
  export function planCheck({text, ico, url}={}, {runAt='server'}={}) → CheckPlan (kap. 3)
    - text: string, trim, 1..20000 znaků, jinak throw Error('INVALID_TEXT')
    - ico: validIco, jinak throw Error('INVALID_ICO')
    - url: povoleno jen při runAt==='client'; normalizace přes checkWebUrl; jinak throw Error('URL_NOT_ALLOWED')
    - žádný vstup → throw Error('EMPTY_INPUT')
    - pravidla P1–P7 přesně dle kap. 4 (URL v textu: /\b(?:https?:\/\/|www\.)[^\s<>"']{1,2048}/giu, max 50 kandidátů;
      IČO v textu: /\bIČO?\s*:?\s*(\d{8})\b/giu do vzdálenosti 12 znaků, platný checksum)
    - step.reason.text z pevné mapy REASONS {P1..P7}
    - výstup bez surového textu (input.text = {present,chars})
    - Object.freeze celého výsledku (deep)
  export function validateCheckPlan(plan) → plan | throw (whitelist klíčů, limity, unikátní stepId s1..s4,
    právě jeden primary, ruleId ∈ P1..P7, checker ∈ CHECKER_REGISTRY)

tests/check-plan.test.js (node:test, bez sítě):
  - všechny řádky tabulky P1–P7 + kombinace ze zadání (URL, IČO, text+URL, text+IČO, URL+IČO na klientu)
  - 2 různá IČO v textu → žádný firm krok, oba v notPlanned reason 'ambiguous'
  - 3 různé hosty v textu → 2 web kroky + 1 notPlanned 'limit'
  - icoField + stejné IČO v textu → 1 firm krok, trigger 'user_field'
  - neplatný checksum, IČO bez návěští → žádný firm krok
  - url na serveru → URL_NOT_ALLOWED
  - property test 1000 náhodných vstupů: ≤4 kroky, ≤2 web, ≤1 firm, ≤1 message, validateCheckPlan projde
  - determinismus: 100× stejný vstup → deepEqual
  - plán neobsahuje vstupní text (JSON.stringify(plan) nezahrnuje 20znakový náhodný úsek textu)
  - CPU: text 20000 znaků s 500 kandidáty → < 20 ms threadCpuUsage (po zahřátí)

NESMÍŠ MĚNIT: jakýkoli jiný soubor (server.js, verdict-*.js, checkery, relay, .dockerignore, F5a soubory,
release skript). Žádný endpoint, žádné UI.

HOTOVO KDYŽ: `node --test tests/check-plan.test.js` PASS a celý `node --test` beze změny počtu selhání
proti základu. Commit na feat/stage3-s3.1-planner, push, nic nemerguj.
```

---

## 12. STAV IMPLEMENTACE A ROZHODNUTÍ PO S3.7 (2026-10-14)

Doplněk. Ostatní architektonická rozhodnutí (kap. 2–11) platí beze změny.

**F5a**
- F5a je dokončená a nasazená v produkci (commit `fd9f7b4`, obsažen v `release/web-checker-2-2026-10-13`).
- Podmínka „S3.7 až po sloučení F5a“ je splněná. Lokální větev `frontend/f5a-neutral-result` je starší rozpracovaná verze a **nemerguje se**.

**S3.7 – stránka Zpráva používá klientský runner, ne `/api/check`**
- Zpráva jde jako dosud na existující `/api/analyze`. Výsledek F5a (neutrální nadpis, první akce ze serveru) se zobrazí první a beze změny.
- Prohlížeč pak stejný text naplánuje sdíleným `planCheck({text}, {runAt:'client', normalizeUrl: checkWebUrl})` (P1, P4, P5, P6, P7) a provede ho `runMessageCheck` z `public/check-flow.js`:
  - krok `message` převezme hotovou odpověď `/api/analyze` přes `fromMessage` (žádný druhý požadavek);
  - kroky `web` (P4, nejvýš 2) běží **jen v prohlížeči**: `checkWebUrl` + místní kopie seznamu ČOI (`/eshop-coi.json`);
  - krok `firm` (P5) volá existující `/api/firm` s přesně `{"ico":"########"}` (sdílené limitery, gate a cache);
  - deadline 5 s, agregace A1–A6 a renderer `check-view.js` jsou existující.
- Důvod: URL kontroly mají probíhat v prohlížeči a firma přes existující `/api/firm`. Serverový runner by URL z textu prověřoval na serveru.
- Společný výsledek je pod úvodní částí výsledku F5a. Fokus zůstává na výsledku F5a, společný výsledek se ohlásí přes `role="status"`.
- `web-checker.js` a `eshop-checker.js` připojují obsluhu formulářů jen tehdy, když na stránce existují `#web-form` / `#operator-form`. Jejich čisté funkce lze proto importovat i na stránce Zpráva.

**`/api/check` zůstává dostupné**
- Endpoint a serverový runner (S3.3, S3.4) zůstávají beze změny, se stejnými limity a validací. Pole `url` dál nepřijímají.
- Žádná stránka ho po S3.7 nevolá. Je připravený pro budoucí serverové flow (např. Stage 4).

**URL kontroly probíhají v prohlížeči**
- Web stránka (S3.6, P2) i stránka Zpráva (S3.7, P4) prověřují URL jen v prohlížeči. Orchestrátor URL, host ani cestu na server neposílá.
- Text zprávy (který odkazy obsahuje) jde jen na `/api/analyze`, stejně jako před Stage 3.

**S3.8 – P4 a koncová interpunkce**
- P4 odstraní z konce nalezeného odkazu běžnou větnou interpunkci `.` `,` `;` `!` `?` (i opakovanou). Ořez je lineární a nikdy nezasáhne prefix `https://` / `www.`.
- Vnitřní interpunkce, query string, kotva i procentové kódování zůstávají beze změny. Odkaz bez koncové interpunkce se plánuje stejně jako dřív.
- Ostatní pravidla planneru (P1–P3, P5–P7) se nemění.
