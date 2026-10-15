# Stage 12 – analytika chování návštěvníků (technický návrh)

- **Stav:** návrh. Nic není implementováno ani nasazeno.
- **Datum:** 2026-10-15
- **Výchozí kód:** `feat/stage11-admin-tabs` @ `465cf96`. Veřejný web je shodný s produkcí `4ea9110`; Stage 10 a 11 mění jen `admin/` a `docs/`.
- **Rozsah návrhu:** veřejný web `verimtomu.fyi` (měření) a staging administrace (zobrazení).

> **Právní upozornění.** Návrh není právní posouzení. Pro rozhodnutí o souhlasu je potřeba ověření u osoby znalé GDPR a zákona o elektronických komunikacích. Návrh je konzervativní: **netvrdí, že analytika bez cookies je automaticky bez souhlasu.**

---

## 0. Shrnutí a doporučení

**Doporučuji variantu A: minimální agregované měření na serveru**
- bez nového skriptu v prohlížeči, bez identifikátorů, bez cookies;
- jen denní součty v paměti a SQLite.

**Variantu B** (krátkodobé anonymní měření průchodu kroky v prohlížeči) doporučuji až jako **samostatnou, volitelnou Stage 12b**, a jen za těchto podmínek:
- po právním posouzení;
- s výslovným opt-in souhlasem;
- s vyhodnocením, zda variantu A doplňuje natolik, aby stála za zásah do koncového zařízení.

**Proč A:**
1. Odpovídá na většinu otázek (3, 5, 6, 7 plně; 4 a 2 částečně) **jen z požadavků, které prohlížeč na server posílá už dnes**. Nic nového se v zařízení návštěvníka neukládá ani nečte. Riziko vůči § 89 odst. 3 zákona č. 127/2005 Sb. je proto výrazně nižší.
2. Nepřidává veřejný zápisový endpoint, tedy ani nový cíl pro podvržené události a zahlcení.
3. Pasuje do existujícího a ověřeného vzoru měření dokončených ověření (worker → SQLite → snapshot JSON → admin jen čte) a do limitů VPS.
4. Poctivě ukazuje, co měří. Nepředstírá unikátní návštěvníky ani přesný čas na stránce.

**Co A neumí** (a proč je B oddělená):
- aktivní čas (otázka 1);
- kliknutí, která nevyvolají požadavek na server (otázka 2);
- kroky v kontrolách, které běží jen v prohlížeči (web, investice, kalkulačka půjčky).

To vše vyžaduje skript, který čte stav zařízení (viditelnost karty, šířku okna, časovače) a posílá ho na server. Podle výkladu EDPB (Guidelines 2/2023 k čl. 5 odst. 3 ePrivacy) to pravděpodobně **spadá pod souhlas**.

---

## 1. Inventura současného stavu (ze skutečného kódu)

### 1.1 Veřejný web (`src/server.js`, Node 24, kontejner 512 MB / 0,5 CPU, read-only)

| Oblast | Současný stav | Zdroj |
|---|---|---|
| Stránky | Pevná mapa cest na HTML: `/` (index), `/overit-zpravu`, `/proverit-web`, `/proverit-pujcku`, `/proverit-smlouvu`, `/proverit-firmu`, `/proverit-investici`, `/uz-se-to-stalo`, `/privacy`, `/o-projektu`, `/kontakt`, 404 | `src/server.js:28–71` |
| Veřejné API | POST `/api/analyze` (zpráva, půjčka), `/api/check`, `/api/firm`, `/api/firm-search`, `/api/eshop-operator`, `/api/analyze-contract`; GET `/api/session`, `/api/health`, `/api/contract-status` | `src/server.js:224–313` |
| Ochrana API | Kontrola `Origin` a `Sec-Fetch-Site` (`checkBrowserRequest`), jednoznačné hlavičky, striktní cesty, limity těla, IP/IPv6 /64 + relace + globální limitery (`WindowLimiter`), burst a denní kvóty v SQLite přes HMAC otisky (`VisitorQuota`) | `src/http-security.js`, `src/limits.js`, `src/visitor-quota.js` |
| Hlavičky | CSP `default-src 'self'; script-src 'self'; connect-src 'self'…`, **`Referrer-Policy: no-referrer`**, `Cache-Control: no-store` | `src/server.js:103–107` |
| Cookie | Jen `__Host-guard_session` (Secure, HttpOnly, SameSite=Strict, 24 h) pro AI limity. Zdokumentována v `privacy.html` jako ochrana služby, ne analytika. | `public/privacy.html` |
| Klientské úložiště | Veřejné skripty nepoužívají `localStorage`, `sessionStorage`, IndexedDB ani `document.cookie` (ověřeno grepem `public/*.js`) | — |
| Externí měření | **Cloudflare Web Analytics** (beacon `static.cloudflareinsights.com`) jen na `/` a `/privacy`; CSP ho povoluje jen tam. Kontroly ho nenačítají. | `src/server.js:376–377`, `privacy.html` |

### 1.2 Měření dokončených ověření (dnes jediná vlastní statistika)
- **Spuštění:** v `src/usage-stats.js`. `countOnFinish` započítá úspěšně dokončenou odpověď `/api/analyze` mimo téma `loan`, a to až po událostech `finish` a `statusCode 200` a `writableFinished`.
- **Režimy:** `completedMode()` rozliší `ai` (engine `rules+ai-v1`), `fallback` (AI se neprovedla z jiného důvodu než odmítnutí) a `rules`.
- **Zápis:** do worker threadu (`usage-stats-worker.js`, limit 32 MB, fronta nejvýš 64, při chybě se měření vypne a nikdy neovlivní odpověď).
- **Úložiště:** `UsageStore` (`src/usage-stats-store.js`), SQLite tabulka `daily(day, rules, ai, fallback)` po dnech `Europe/Prague` a `metadata(startedDay)`.
- **Export:** atomicky do snapshotu JSON (`USAGE_SNAPSHOT_PATH`, mód 0444). Administrace ho čte **jen pro čtení** (mount `/opt/verimtomu/usage-export:ro`, `admin/src/usage.js`, validace verze, rozsahu a velikosti).
- **Co se nepočítá:** `/api/check`, firmy, e-shopy, smlouvy ani kontroly běžící jen v prohlížeči (web, investice, kalkulačka). `privacy.html` to výslovně uvádí.

### 1.3 Kontroly podle místa běhu

| Kontrola | Stránka | Kde běží | Co server vidí dnes |
|---|---|---|---|
| Zpráva | `/overit-zpravu` | server `/api/analyze` (+ `/api/session`) | odeslání a dokončení |
| Půjčka | `/proverit-pujcku` | kalkulačka jen v prohlížeči; text nabídky `/api/analyze` (topic loan) | odeslání textu; kalkulačku ne |
| Web / e-shop | `/proverit-web` | hlavně prohlížeč (`web-checker.js`, `eshop-checker.js`), volitelně `/api/eshop-operator` | jen dotaz na provozovatele |
| Firma | `/proverit-firmu` | server `/api/firm`, `/api/firm-search` | odeslání a výsledek |
| Investice | `/proverit-investici` | prohlížeč (`investment.js`) | nic (jen načtení stránky) |
| Smlouva | `/proverit-smlouvu` | server `/api/analyze-contract` (+ Turnstile, pokud je zapnutý) | odeslání a výsledek |

### 1.4 Administrace (Stage 11)
- Samostatná aplikace `admin/` za Cloudflare Access (JWT na každé cestě), CSP `'self'`, read-only kontejner 192 MB / 0,25 CPU.
- SQLite `/data/admin.sqlite` (cache Cloudflare, tabulky GSC).
- Karty: Cloudflare, Google, Dokončená ověření, AI.
- Data z webu dostává **jen přes read-only snapshot**; do databáze webu nemá přístup. Tuto izolaci návrh zachovává.

### 1.5 Hlavní interakce (tlačítka)
- **Úvod:** 6× „Prověřit …“ (`choice-link`), „Už se to stalo?“, odkazy „Prověřit takovou zprávu“.
- **Kontroly:**
  - `#submit`, `#retry`, `#edit-content`, `#to-verification`, `#loan-entry`;
  - `#cost-submit`, `#loan-followup-open`, `#next-check`;
  - `#firm-submit`, `#firm-search-next` a `#firm-search-previous`, `#firm-again`;
  - `#investment-submit`, `#investment-again`, `#web-again`;
  - smlouva: `#contract-preview-button`, `#contract-copy`, `#contract-print`;
  - sdílení výsledku (`share-result.js`).

### 1.6 Zjištění k inventuře
- `Referrer-Policy: no-referrer` znamená, že server **nevidí přechody mezi stránkami**. Varianta A je bez úpravy nezná. Volitelná úprava na `same-origin` je změna veřejného webu, proto je samostatná etapa (A4).
- Cloudflare Web Analytics na `/` a `/privacy` je JavaScript, který čte informace ze zařízení. Bez ohledu na Stage 12 doporučuji **zahrnout ho do stejného právního posouzení** (EDPB 2/2023). Návrh na něm nestaví.

---

## 2. Právní rámec (konzervativní předpoklady)
- **§ 89 odst. 3 zákona č. 127/2005 Sb.** (transpozice čl. 5 odst. 3 ePrivacy), od 1. 1. 2022 opt-in: ukládat informace do koncového zařízení nebo k nim přistupovat lze jen se souhlasem, **pokud nejde o technicky nezbytné uložení či přístup** pro poskytnutí služby, kterou si uživatel výslovně vyžádal.
- **EDPB Guidelines 2/2023:** „přístup“ zahrnuje i techniky bez cookies, například skripty, které čtou vlastnosti zařízení nebo posílají jinak neodesílané informace (pixely, beacony, dočasné identifikátory). **Předpoklad návrhu:** klientský analytický skript (varianta B) vyžaduje souhlas. Česká úprava nemá výslovnou výjimku pro měření návštěvnosti, jaká existuje například ve Francii.
- **GDPR:** IP adresa a User-Agent mohou být osobní údaje. Varianta A je zpracuje jen přechodně v paměti při vyřízení požadavku (stejně jako dnešní limitery), neukládá je a ukládá jen součty po dnech (anonymní agregace). Právní titul pro přechodné zpracování: oprávněný zájem (čl. 6 odst. 1 písm. f) – provoz a zlepšování služby. Potřeba: test proporcionality, záznam v `privacy.html` a záznam o činnostech zpracování.
- **Varianta A a § 89:** pracuje jen s požadavky a hlavičkami, které prohlížeč posílá kvůli samotnému načtení stránky nebo odeslání kontroly. Do zařízení nic neukládá ani z něj nic navíc nečte. Konzervativní závěr: **pravděpodobně mimo § 89 odst. 3** (nejde o přístup ke koncovému zařízení nad rámec vyžádané služby). Potvrdí to právní posouzení (etapa A0).
- **Client Hints:** `Sec-CH-UA-Mobile` je hlavička s nízkou entropií, kterou Chromium posílá vždy. Varianta A ji čte jen pro zařazení mobil/desktop a hned zahodí. **Nepoužívá** `Accept-CH` (vyžádání dalších údajů ze zařízení), protože to by už byl aktivní přístup.

---

## 3. Měřené události (definice proti dvojímu započítání)

Všechny události jsou **denní čítače** (den `Europe/Prague`) s klíči jen z pevných výčtů. Žádný text, URL parametr, výsledek kontroly, IP, UA ani identifikátor.

### 3.1 Varianta A (server, bez nového kódu v prohlížeči)

| Událost | Přesná definice | Klíče | Proti dvojímu počítání |
|---|---|---|---|
| `page_view` | GET (ne HEAD) na **HTML cestu z pevné mapy**, odpověď **200** úspěšně odeslaná (`finish` + `writableFinished`). 404 se počítá zvlášť jako `page = not_found`. | `page` (výčet 12 stránek), `device` (`mobile`/`desktop`/`unknown`) | Jen HTML cesty, ne assety ani API. **Nepočítá se:** `Sec-Purpose: prefetch`/`prerender`, `If-None-Match` → 304, odpovědi ≥ 400 kromě 404, roboti (§ 3.3). Obnovení stránky = nové načtení a počítá se; uvádí se jako „načtení stránky“, ne „návštěva“. |
| `check_submitted` | Přijatý POST kontroly, který **prošel validací vstupu** (po `readJson` a `prepare/validate`) | `checker` (`message`, `loan_text`, `firm`, `firm_search`, `eshop_operator`, `contract`, `check`) | Počítá se na serveru jednou na přijatý požadavek. Opakování po chybě je nový požadavek (proto i `check_failed`). |
| `check_completed` | Odpověď **200 s výsledkem** úspěšně odeslaná. Stejné místo jako dnešní `countOnFinish`. | `checker`, u zprávy navíc `mode` (`rules`/`ai`/`fallback`) | Jedna odpověď = jedna událost. Dnešní `daily` zůstává beze změny; nová tabulka je nadmnožina a pro `message` se s ní kontrolně porovnává. |
| `check_failed` | Validní požadavek skončil chybou nebo nedokončením | `checker`, `reason` (`rate_limited`, `quota`, `timeout`, `upstream`, `client_abort`) | Jedna událost na požadavek. Chyby validace vstupu (400) se počítají zvlášť jako `check_rejected` bez detailu. |
| `share_page_view` (volitelné) | Načtení stránky sdílení, pokud existuje serverová cesta | `page` | Jako `page_view` |

**Co v A není:**
- `check_started` (otevření formuláře nebo psaní), protože ho server nevidí;
- `result_viewed`: zobrazení výsledku se rovná úspěšně doručené odpovědi; zda ji člověk četl, server neví a nepředstírá to;
- `check_abandoned`: v A **nelze spolehlivě odvodit pro jednotlivce**. Uvádí se jen jako agregovaný **odhad** (§ 5.4).

### 3.2 Varianta B (prohlížeč, jen se souhlasem)

| Událost | Definice | Klíče |
|---|---|---|
| `page_engaged` | Odesílá se jednou za zobrazení stránky při `pagehide`/`visibilitychange→hidden` (podle toho, co nastane dřív) | `page`, `device`, `active_bucket` (§ 4) |
| `check_started` | První `input` do hlavního pole formuláře na stránce (jednou za načtení stránky) | `checker` |
| `check_submitted_client` | Kliknutí na odeslání, které prošlo validací v prohlížeči (u lokálních kontrol jde o jedinou možnost) | `checker` |
| `result_viewed` | Blok výsledku byl alespoň 2 s viditelný (`IntersectionObserver` ≥ 50 % a karta viditelná) | `checker` |
| `cta_click` | Kliknutí na tlačítko z pevného seznamu (§ 1.5) | `target` (výčet asi 25 hodnot) |
| `check_abandoned` | Při odchodu ze stránky: `check_started` nastalo, ale `check_submitted_client` ne | `checker`, `last_step` (`started`/`validated_error`) |

Každá událost B se v jednom zobrazení stránky odešle **nejvýš jednou** (klientská množina odeslaných klíčů v paměti), na serveru se zahodí duplicita se stejným `view_token` (§ 6.3) a typem.

### 3.3 Roboti a technická volání
- User-Agent se v paměti **zařadí do třídy** a zahodí:
  - `bot`: obsahuje `bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless`, nebo chybí;
  - `mobile`: `Sec-CH-UA-Mobile: ?1` nebo `Mobi|Android|iPhone`;
  - `desktop`: ostatní.
- Roboti se počítají jen jako jedno číslo `bot_page_views` za den, aby bylo vidět, kolik se vyřadilo.
- Health checky (`/api/health`, Docker healthcheck) a interní smoke testy se nepočítají.
- Smoke testy releasu mohou nést hlavičku `X-Verimtomu-Smoke: 1`, kterou web při volání z `127.0.0.1` vyřadí. Detail implementace ověří A2.

---

## 4. Měření času

**Varianta A:** aktivní čas **neměří**. Odvozený čas mezi požadavky by vyžadoval spojovat požadavky jednoho člověka, tedy identifikátor. Návrh to odmítá. Panel ukazuje „Aktivní čas: neměřeno (vyžaduje volitelné měření v prohlížeči)“.

**Varianta B, odhad aktivního času na zobrazení stránky:**
- **Aktivní** = karta viditelná (`document.visibilityState === 'visible'`) **a** okno má focus **a** za posledních 30 s došlo k interakci (`pointerdown`, `keydown`, `scroll`, `touchstart`). Zaznamenává se jen to, *že* k interakci došlo, ne kde ani jaká klávesa.
- Časovač tiká po 5 s jen v aktivním stavu. Při skrytí karty se zastaví (`visibilitychange`), po návratu pokračuje.
- Nic se neposílá průběžně: **jedna** zpráva při `pagehide` nebo prvním skrytí přes `navigator.sendBeacon` (bez odpovědi, bez cookies díky `credentials: 'omit'` u záložního `fetch keepalive`).
- Odesílá se jen **koš**: `0–10 s`, `10–30 s`, `30–60 s`, `1–3 min`, `3–10 min`, `10+ min`. Přesné sekundy server nikdy nedostane.
- **Omezení přesnosti** (v UI se zobrazí jako *odhad*):
  - odchod bez poslední zprávy (pád prohlížeče, ztráta sítě, iOS ukončí kartu na pozadí): zobrazení se nezapočítá. Podíl ztrát se odhadne poměrem `page_engaged / page_view` za stejný den a stránku a zobrazí se;
  - čtení bez interakce delší než 30 s se ořízne, takže odhad je dolní mez aktivního času;
  - více karet: každá měří sama, nesčítají se;
  - neaktivní karta se nepočítá;
  - bfcache (návrat zpět): nové zobrazení po `pageshow` s `persisted` se měří znovu jako nové zobrazení.
- Zobrazuje se **medián koše** a rozdělení košů, nikdy průměr přesných hodnot.

---

## 5. Architektura

### 5.1 Varianta A: tok dat
```
prohlížeč ──GET /overit-zpravu, POST /api/analyze …──▶ web (src/server.js)
                                     │  (v hotovém handleru, po 'finish')
                                     ▼
                        stats.record({event, page|checker, device, mode|reason})   ← jen výčtové hodnoty
                                     │  postMessage, fronta ≤ 256, při plné frontě se zahazuje
                                     ▼
                     usage-stats-worker (existující worker, 32 MB)
                       SQLite: tabulka behavior_daily (UPSERT +1)
                       každé 3 min: snapshot JSON v2 → /opt/verimtomu/usage-export/usage.json (0444, atomicky)
                                     │  read-only mount
                                     ▼
                     admin: usageSummary() v2 → /api/dashboard (beze změny cesty) → karta „Chování návštěvníků“
```
- **Klient:** nic nového, žádný skript, žádná změna HTML.
- **Příjem:** žádný nový endpoint. Události vznikají ze stávajících požadavků po jejich úplném vyřízení, a proto **nejdou podvrhnout bez skutečného načtení stránky nebo skutečné kontroly**, které už chrání stávající limitery.
- **Výkon:**
  - `record()` je O(1), jen `postMessage` výčtů;
  - UPSERT dávkuje worker (jedna transakce za 1 s nebo za 100 událostí);
  - SQLite odhad: 12 stránek × 3 zařízení + asi 40 klíčů kontrol, tedy **pod 100 řádků denně**;
  - 400 dní znamená pod 40 000 řádků, pod 5 MB.

### 5.2 Datový model (A)
```sql
-- Jediná nová tabulka ve stávající databázi usage stats (USAGE_DB_PATH), žádná změna tabulky daily.
CREATE TABLE IF NOT EXISTS behavior_daily(
  day    TEXT NOT NULL,                 -- YYYY-MM-DD Europe/Prague
  event  TEXT NOT NULL,                 -- výčet: page_view, bot_page_view, check_submitted, check_completed, check_failed, check_rejected
  k1     TEXT NOT NULL,                 -- výčet: page nebo checker
  k2     TEXT NOT NULL DEFAULT '',      -- výčet: device, mode nebo reason
  n      INTEGER NOT NULL CHECK(n >= 0),
  PRIMARY KEY(day, event, k1, k2)
) WITHOUT ROWID;
```
- Hodnoty `event`, `k1` a `k2` se validují **proti výčtům v kódu** při zápisu i při čtení snapshotu adminem; neznámá hodnota se zahodí.
- Žádný sloupec nesmí obsahovat volný text.
- Snapshot v2 přidá pole `behavior: [{day, event, k1, k2, n}]` (nejvýš 400 dní a 200 řádků na den) a `behaviorStartedDay`. Pole `days` zůstane pro zpětnou kompatibilitu; admin v1 ho dál čte.

### 5.3 Retence a mazání
- `behavior_daily`: **400 dní**, stejně jako dnešní snapshot (pokrývá 90 dní + srovnání + rok pro sezónnost).
- Mazání provádí worker jednou denně: `DELETE … WHERE day < date('now','-400 days')`.
- Snapshot obsahuje nejvýš 400 dní.
- Roboti: 90 dní.
- Nic dalšího se neukládá: žádné surové logy, žádné záznamy jednotlivých požadavků.
- Mazání na žádost subjektu údajů není potřeba, protože agregace neobsahuje osobní údaje. Uvede se v `privacy.html`.

### 5.4 Agregace pro panel (výpočty v adminu, jen z denních čítačů)

| Ukazatel | Výpočet | Označení |
|---|---|---|
| Načtení stránek | Σ `page_view` (bez robotů) | **naměřeno** |
| Načtení podle stránky | Σ podle `k1` | naměřeno |
| Mobil vs. desktop | podíl `page_view` podle `k2` (`unknown` zvlášť) | naměřeno (zařazení podle hlavičky) |
| Odeslané a dokončené kontroly | Σ `check_submitted`, `check_completed` podle `checker` | naměřeno |
| Úspěšnost dokončení | `check_completed / check_submitted` | naměřeno (poměr požadavků) |
| Využití stránky kontroly | `check_submitted / page_view` dané stránky | **odhad** (poměr požadavků, ne lidí; jeden člověk může odeslat víckrát nebo stránku víckrát obnovit) |
| Kde se odchází | „načtení stránky bez odeslání“ ≈ `page_view − check_submitted` (spodní mez 0); „odesláno, nedokončeno“ = `check_failed` podle `reason` | **odhad** pro první krok, naměřeno pro druhý |
| Trend | 7/28/90 dní, srovnání s předchozím obdobím jen při plném pokrytí (stejné pravidlo jako u GSC) | — |

**Unikátní návštěvníky ani návštěvy (relace) A nepočítá a nezobrazuje.** Poctivá alternativa:
- „načtení stránek“ místo návštěv;
- „odeslané a dokončené kontroly“ místo návštěvníků, kteří kontrolu provedli;
- „poměr odeslání na načtení stránky“ místo konverze uživatelů.

### 5.5 Propojení s administrací
- Pátá karta **„Chování návštěvníků“** v liště Stage 11 (`#chovani`).
- Data přicházejí stávající cestou `/api/dashboard` (rozšíří se jen obsah pole `usage`; nové API ani databáze adminu nevzniká).
- Přepínač 7/28/90 dní funguje stejně jako u Google (klient přepočítá ze snapshotu, pro 90 dní a srovnání stačí 180 dní).

### 5.6 Varianta B: navíc oproti A
- **Klient:** malý modul `public/behavior.js` (asi 3 kB), načtený **jen po udělení souhlasu**:
  - výčty událostí, koše času, `sendBeacon('/api/m', …)`;
  - žádné `localStorage` kromě uložení samotné volby souhlasu (§ 7);
  - CSP beze změny (`connect-src 'self'`).
- **Příjem:** `POST /api/m`, nový veřejný endpoint:
  - `Content-Type: text/plain` (aby `sendBeacon` nevyvolal preflight), tělo nejvýš 512 B, přesný regulární formát jako u `/api/firm`;
  - kontrola `Origin` a `Sec-Fetch-Site: same-origin`;
  - vlastní `WindowLimiter` (IP/64: 30 za minutu) a globální limit (600 za minutu); při překročení se data tiše zahodí s odpovědí `204` (útočník nepozná, že ho limit zastavil);
  - žádné cookies se nečtou ani nenastavují (požadavek s `credentials: 'omit'`).
- **Krátkodobý token zobrazení** (`view_token`): náhodných 64 bitů vygenerovaných **v paměti stránky** při načtení. Nikde se neukládá, platí jen do zavření stránky.
  - Server ho drží **jen v paměti** nejvýš 30 minut v LRU mapě (nejvýš 20 000 položek), aby spojil `check_started → submitted → result_viewed → abandoned` **v rámci jednoho zobrazení stránky** a zahodil duplicity.
  - Do SQLite jde jen výsledný agregát (`funnel_daily(day, checker, step, n)`). Token se nikdy neukládá ani nespojuje s IP, relací či cookie.

---

## 6. Administrace: karta „Chování návštěvníků“

Rozložení odpovídá kartě Google (Stage 10/11): přepínač **7 / 28 / 90 dní**, dlaždice se srovnáním, graf, tabulky. U každé hodnoty je štítek **Naměřeno** nebo **Odhad**.

1. **Dlaždice:**
   - Načtení stránek (naměřeno);
   - Odeslané kontroly (naměřeno);
   - Dokončené kontroly (naměřeno, u zpráv rozpad pravidla/AI/náhradní);
   - Podíl mobilu (naměřeno, zařazení podle hlavičky);
   - **Aktivní čas:** v A text „neměřeno“; v B medián koše a štítek „odhad, jen návštěvy se souhlasem“.
2. **Graf v čase:** denní načtení stránek a dokončené kontroly. Dny bez měření jsou mezery, ne nuly.
3. **Konverzní cesta ověřování** (tabulka po kontrolách: zpráva, půjčka, firma, e-shop, smlouva):
   - načtení stránky → odesláno → dokončeno;
   - poměry „odesláno/načteno“ (odhad) a „dokončeno/odesláno“ (naměřeno);
   - kontroly jen v prohlížeči (web, investice, kalkulačka) mají v A poznámku „probíhá jen v prohlížeči, server ji nevidí“.
4. **Kde se odchází:**
   - „načteno bez odeslání“ (odhad);
   - „odesláno, ale nedokončeno“ podle důvodu (naměřeno: limit, časový limit, chyba služby, přerušení klientem);
   - v B navíc `check_abandoned` po krocích (naměřeno jen u návštěv se souhlasem).
5. **Nejčastější interakce:**
   - v A pořadí stránek kontrol podle načtení (nejbližší pravdivá náhrada za proklik z úvodu) a pořadí odeslaných kontrol;
   - v B `cta_click` podle tlačítka.
6. **Mobil vs. desktop:** sloupcový podíl za období a vývoj podílu v čase.
7. **Poznámky v kartě:**
   - „Nepočítáme unikátní návštěvníky ani návštěvy. Obnovení stránky je nové načtení. Roboti jsou vyřazeni podle hlavičky (vyřazeno: N).“
   - „Cloudflare HTTP požadavky (karta Cloudflare) jsou jiná metrika a nesčítají se.“

**Stavový řádek** (Stage 11) dostane zdroj „Chování: aktuální / neobnovuje se / nedostupné“ ze stavu snapshotu.

---

## 7. Souhlas (jen varianta B)
- **Opt-in:**
  - malý pruh pod hlavičkou na stránkách kontrol: „Pomozte nám zlepšit Věřím tomu? anonymním měřením použití (bez cookies, bez obsahu zpráv). Povolit / Ne, děkuji“;
  - obě volby stejně výrazné, bez předvybrání;
  - odvolání a vysvětlení v `privacy.html`.
- **Uložení volby:** `localStorage['verimtomu-measure'] = 'yes'|'no'` jako technicky nezbytné uložení volby (běžný výklad). Bez volby se nic nenačítá ani neposílá.
- **Důsledek:** data B popisují **jen návštěvníky se souhlasem** a nejsou reprezentativní (typicky 10–40 % návštěv). Panel to vždy uvádí a neextrapoluje.

---

## 8. Threat model

| Hrozba | A | B | Opatření |
|---|---|---|---|
| **Zneužití veřejného analytického endpointu** | Endpoint neexistuje | `/api/m` je nový veřejný cíl | B: přesný formát, 512 B, Origin a Sec-Fetch-Site, limitery IP/64 a globální, tiché zahazování, žádná odpověď s daty, žádné cookies |
| **Zahlcení databáze** | Klíče jen z výčtů, tedy pevný strop řádků za den (≈ 100); worker fronta ≤ 256 se zahazováním; UPSERT dávkově | Navíc LRU tokenů ≤ 20 000 v paměti, funnel jen výčty | Strop velikosti DB (monitor > 50 MB = varování), retence 400 dní, `PRAGMA max_page_count` |
| **Podvržené události** | Jen skutečné načtení stránky nebo skutečná kontrola. Nafouknutí čísel = skutečné požadavky, které už brzdí stávající limitery a Cloudflare. Robot může zvednout `page_view` → klasifikace robotů a srovnání s Cloudflare v kartě. | Lze posílat libovolné výčtové události | B: limity na IP/64, globální strop, ve funnelu jen přechody s platným pořadím v rámci tokenu; panel ukazuje B jen jako doplněk A (podvrh v B nezmění naměřená čísla A) |
| **Únik citlivých údajů** | Ukládají se jen výčty a čísla; text, URL parametry, výsledky, IP a UA se do `record()` vůbec nepředávají (typová kontrola + test, že `record` odmítne cokoli mimo výčty) | Klient posílá jen výčty a koše | Testy: v DB, snapshotu, logu ani API se neobjeví text kontroly, query string, IP ani UA; CSP `'self'`; admin za Access |
| **Sledování jednotlivců** | Bez identifikátoru nelze; denní agregace. Při malém provozu (např. 1 kontrola smlouvy za den) však lze z počtu odhadnout jednotlivý čin. | `view_token` jen v paměti 30 min, nikdy v DB | Admin jen za Access; v UI se **čísla < 3 za den** zobrazují jako „< 3“ (k-anonymita pro řídké klíče); export se neplánuje |
| **Propojení s existujícími daty** | `VisitorQuota` má HMAC otisky IP a relací, Cloudflare logy mají IP. A nesdílí žádný klíč, čas ukládá jen na den, takže spojit nejde. | B nesmí číst `__Host-guard_session` ani posílat čas přesnější než den | Oddělená tabulka, žádné joiny s `visitor_calls`; kódový test, že behavior modul neimportuje quota ani session moduly |
| **Únik přes administraci** | Admin čte jen snapshot (read-only mount) | stejné | Beze změny: Access JWT, CSP, read-only kontejner |
| **Dostupnost webu** | Chyba měření nesmí ovlivnit odpověď. Vzor `countOnFinish`: try/catch, worker se při chybě vypne. | Endpoint s nejnižší prioritou, `204` | Test: při pádu workeru web odpovídá stejně; zátěžový test s frontou 256 |

---

## 9. Porovnání variant

| Kritérium | **A – minimální agregované (server)** | **B – krátkodobý průchod kroky (prohlížeč + souhlas)** |
|---|---|---|
| Otázka 1: aktivní čas | ne | ano, odhad v koších, jen se souhlasem |
| Otázka 2: kliknutí | jen kliknutí vedoucí k požadavku (načtení stránky, odeslání) | ano, pevný seznam tlačítek |
| Otázka 3: stránky a funkce | ano (stránky, serverové kontroly); lokální kontroly ne | ano, včetně lokálních kontrol |
| Otázka 4: kde se odchází | odhad (načteno bez odeslání) + naměřené chyby po odeslání | naměřeno po krocích v rámci zobrazení (jen souhlas) |
| Otázka 5: zahájeno / dokončeno | odesláno → dokončeno naměřeno; „zahájeno“ jen odhadem | ano (started → submitted → result_viewed) |
| Otázka 6: mobil / desktop | ano (hlavička) | ano |
| Otázka 7: v čase | ano, 400 dní | ano (souhlas mění reprezentativnost v čase) |
| Pokrytí | všechna načtení stránek a kontroly | jen návštěvy se souhlasem, zkreslené |
| Složitost | nízká: rozšíření existujícího workeru, asi 150 řádků webu a 250 řádků adminu | vyšší: klientský modul, souhlas, nový endpoint, LRU, funnel, UI souhlasu |
| Provoz VPS | zanedbatelný (< 1 MB RAM navíc, < 5 MB disku za rok) | malý (LRU asi 2–3 MB, endpoint s limity) |
| Bezpečnostní riziko | velmi nízké (žádný nový vstup) | střední (nový veřejný zápisový endpoint) |
| Soukromí | žádný identifikátor, nic v zařízení, jen denní součty | dočasný token v paměti, čtení stavu zařízení, uložená volba souhlasu |
| Souhlas (§ 89/3) | pravděpodobně ne (posoudit, A0) | **pravděpodobně ano** |
| Změna veřejného webu | malá, jen serverová (`src/`), bez HTML a JS | HTML, JS, CSS, `privacy.html`, nový endpoint |

---

## 10. Realizační plán (varianta A, malé etapy)

Každá etapa má vlastní větev a commit, nemerguje se do produkce bez schválení a má samostatný rollback.

| Etapa | Obsah | Acceptance criteria | Testy | Rollback |
|---|---|---|---|---|
| **A0** Právní a obsahové posouzení | Posouzení § 89/3 a GDPR pro A (a Cloudflare Web Analytics), text pro `privacy.html`, záznam o zpracování | Písemný závěr; schválený text | — | — |
| **A1** Záznam událostí ve webu (vypnuto) | `src/behavior-stats.js`: výčty, `recordPageView`/`recordCheck` po `finish`; worker UPSERT `behavior_daily`; retence; snapshot v2 (zpětně kompatibilní). Zapnutí jen proměnnou `BEHAVIOR_STATS=1`, výchozí stav vypnuto. | Bez proměnné je chování bit-identické; se zapnutím přibývají jen výčtové řádky; `daily` beze změny | Unit: definice každé události (prefetch, 304, HEAD, 404, roboti, abort, 429), odmítnutí hodnot mimo výčet, žádné IP/UA/text/query v DB a snapshotu, výkon (10 000 záznamů < 50 ms ve vlákně serveru), pád workeru nemění odpověď; celá kořenová brána | Vypnout proměnnou; tabulka zůstane a neovlivní nic |
| **A2** Vyřazení technických volání | Smoke a healthcheck se nepočítají; seznam robotů | Release smoke nezvýší `page_view` | Unit a release smoke v simulaci | Revert commitu |
| **A3** Karta „Chování návštěvníků“ v adminu | `usageSummary` v2 (validace výčtů), pátá karta, 7/28/90, štítky Naměřeno/Odhad, < 3 jako „< 3“, stav ve stavovém řádku | Bez dat v2 poctivé „data zatím nejsou“; žádné vymyšlené metriky; přístupnost jako Stage 11 | Unit (výpočty, pokrytí srovnání, k-anonymita), browser (karta, klávesnice, 320–1280 px, bez CSP chyb) | `rollback-upgrade` adminu (stage10-staging.sh) |
| **A4** (volitelné) Přechody z úvodu | `Referrer-Policy: same-origin` jen pro HTML stránky; `nav_from` = výčet stránky z referreru (jen vlastní origin, jen cesta z mapy) | Externí referrer se nikdy neukládá; jiné hlavičky beze změny | Unit (cizí origin, query string, neznámá cesta) | Vrátit hlavičku |
| **A5** Nasazení | Web: release skript (mimo Stage 12 schválení). Admin: upgrade stagingu. `privacy.html` podle A0. | 7 dní dat; kontrola proti Cloudflare (řádově) a proti dnešní `daily` (zprávy: shoda `check_completed` = rules+ai+fallback) | `verify` a ruční kontrola | Proměnná `BEHAVIOR_STATS=0` a `rollback-upgrade` adminu |

**Varianta B (Stage 12b, jen po rozhodnutí):**
- B0: právní posouzení a text souhlasu;
- B1: `/api/m` za proměnnou;
- B2: klientský modul a souhlas;
- B3: funnel a aktivní čas v kartě (štítek „jen se souhlasem“).

Každá etapa má stejné typy testů: limity a podvrhy endpointu, žádné úložiště bez souhlasu, CSP beze změny, ztrátovost beaconu.

---

## 11. Předpoklady (zvolené konzervativně)
1. Den = `Europe/Prague`, stejně jako u dnešních statistik.
2. „Návštěva“ se bez identifikátorů nepočítá; nahrazuje ji „načtení stránky“.
3. Zařazení mobil/desktop podle `Sec-CH-UA-Mobile` nebo UA v paměti; tablet se počítá jako desktop, pokud se neoznačí jako mobile.
4. Retence 400 dní pro agregáty, 90 dní pro počty robotů.
5. Zobrazení `< 3` pro denní hodnoty 1–2 v kombinaci kontrola × den.
6. Cloudflare Web Analytics návrh nemění; doporučuje ho zahrnout do A0.
7. Administrace zůstává oddělená a čte jen snapshot; žádný nový zápisový kanál z webu do adminu.
