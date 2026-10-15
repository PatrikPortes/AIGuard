# Stage 12 – etapa A1: serverové měření chování (vypnuto)

- **Datum:** 2026-10-15
- **Větev:** `feat/stage12-a1-behavior-stats`, navazuje na `docs/stage12a-analytics-review` (`d3b37ec`)
- **Podklady:** `docs/STAGE12_ANALYTICS_PROPOSAL.md` (varianta A), `docs/STAGE12A_REVIEW.md` (§2–§5, AC A1)
- **Stav:**
  - **Implementováno, ve výchozím stavu VYPNUTO.** Nic nenasazeno, produkční konfigurace beze změny.
  - Admin (A3), vyřazení smoke testů (A2), A4 ani Stage 12b nejsou součástí.

## 1. Inventura (výchozí kód)
- `src/usage-stats.js`, `usage-stats-worker.js`, `usage-stats-store.js`: dnešní počty dokončených kontrol zpráv (`daily`), worker a snapshot. **Beze změny.**
- `src/server.js`: mapa HTML cest (11 stránek + `/404.html`), POST API kontrol, `serviceError()`, servírování stránek a 404 fallback.
- `/api/analyze`:
  - vstup `{type, content, topic?}`;
  - výsledek má jen engine `rules-v1` a `rules+ai-v1`;
  - `completedMode` vynechává jen `topic=loan`.
  
  Z toho plyne přesný invariant D2 pro zprávy.

## 2. Co bylo implementováno

| Soubor | Obsah |
|---|---|
| `src/behavior-stats-model.js` | Pevné výčty (6 událostí, 12 stránek, 7 kontrol, zařízení, důvody), `allowed(event,k1,k2)`, den `Europe/Prague` shodný s `usageDay`, retence (400 / 90 / snapshot 190 dní), symbol `OUTCOME_CODE` |
| `src/behavior-stats.js` | Čítač v paměti (nejvýš 256 klíčů, mimo výčet = zahozeno), flush po 5 s do workeru (nejvýš 4 nepotvrzené dávky, jinak zahozeno), `observePage`, `beginCheck` (parsed → submitted → completed / failed / rejected), `deviceClass` (jen s `BEHAVIOR_DEVICE=1`), `behaviorStatsFromEnv` |
| `src/behavior-stats-store.js` | SQLite `behavior_daily` s **CHECK** výčty, `PRAGMA secure_delete=ON`, UPSERT s horním limitem, druhá validace řádků, retence, kompaktní snapshot (indexy do slovníku, 190 dní, `0444`, atomicky) |
| `src/behavior-stats-worker.js` | Zápis dávek v transakci, retence každou hodinu, publikace snapshotu nejvýš jednou za 30 s, řízené ukončení |
| `src/server.js` (+12 / −3 řádky) | Volitelný parametr `behaviorStats`; `serviceError` značí kód chyby symbolem; volání `?.` v POST větvi kontrol, u HTML stránek a 404; zavření se serverem; zapnutí jen přes prostředí |
| `tests/behavior-stats.test.js` | 11 testů (§ 4) |

**Definice (shrnutí):**
- **`page_view`:** jen GET HTML stránky z mapy, `200` (u `not_found` `404`) po `finish`, `Sec-Fetch-Mode: navigate` a `Sec-Fetch-Dest: document`. `Sec-Purpose` nebo `Purpose` s prefetch/prerender se nepočítá. Ostatní požadavky na stránky jdou do `bot_page_view`.
- **`check_submitted`:** až po úspěšné validaci vstupu. Před ní se počítá jen `check_rejected{input}` (400/413/415 se vstupním kódem). Ochrany proti zneužití (403/429 před validací) se nepočítají.
- **Po odeslání** kontrola skončí jako:
  - `completed` (200);
  - `failed{rate_limited|quota|timeout|upstream|client_abort}`;
  - `rejected{precondition}` (4xx, např. souhlas s AI, Turnstile).
- **D1:** dokončená kontrola zprávy se do `behavior_daily` **nezapisuje**. Jediným zdrojem zůstává `daily`.
- **D3/D5:** `loan_text` je samostatný klíč. `firm_search` se dělí na `search` (start 0) a `page` (stránkování).

## 3. Odchylka od review (zdůvodněná)
**Samostatná databáze a samostatný snapshot** (`BEHAVIOR_DB_PATH`, `BEHAVIOR_SNAPSHOT_PATH`) místo tabulky v `USAGE_DB_PATH` a pole `behavior` ve snapshotu v2.
- Dva workery zapisující do stejné SQLite by mohly způsobit `SQLITE_BUSY` (dnešní `busy_timeout=50`) a **ztrátu dokončených kontrol**. To porušuje podmínku „nesmí narušit existující statistiky“.
- Oddělení navíc zaručuje, že `usage.json` zůstane **bajtově stejný** i se zapnutým měřením.
- `behaviorStatsFromEnv` odmítne konfiguraci, ve které by cesty kolidovaly s `USAGE_*`.
- Admin (A3) bude číst druhý soubor ze stejného read-only adresáře (`/opt/verimtomu/usage-export/behavior.json`). Limit 1 MiB z review S3 platí pro tento soubor.

## 4. Testy

| Test | Výsledek |
|---|---|
| `tests/behavior-stats.test.js` (Node 22 lokálně) | **11/11 PASS** |
| Kořenová brána: Docker `validated` (Node 24: `node --test --test-concurrency=1`, strict gate, `npm run check`) | **522/522 PASS** (511 předchozích + 11 nových), strict gate 16/16 PASS, check PASS |
| Docker `production` build | OK |
| Produkční image, runtime smoke (read-only, `cap_drop ALL`, bez sítě) | **Vypnuto:** stránky i `/api/analyze` 200, v `/tmp` nevznikl žádný soubor. **Zapnuto** (cesty v tmpfs): DB obsahuje přesně 2× `page_view|index`, 1× `page_view|message`, 1× `bot_page_view|index`, 1× `check_submitted|message`; prefetch se nezapočítal; `?q=tajne` v DB není; snapshot `0444`. RAM 32,5 → 36,4 MiB. |

**Pokrytí (AC A1):**
- vypnutý výchozí stav (8 neplatných konfigurací, kolize cest);
- shodné odpovědi a hlavičky se zapnutým i vypnutým měřením;
- bez `BEHAVIOR_DEVICE` se User-Agent vůbec nečte (test proxy na hlavičkách);
- každá definice: navigace, prefetch, HEAD, robot, 404, assety a API, query string;
- invarianty D1 a D2 se skutečným serverem;
- všechny důvody selhání a odmítnutí;
- stránkování (D5), Turnstile (D11);
- zahození hodnot mimo výčet v kódu i v SQL (CHECK);
- limit klíčů;
- výkon (100 000 událostí < 150 ms);
- retence 400/90 dní, snapshot 190 dní, `secure_delete`;
- v DB ani ve snapshotu není UA, IP, text ani query;
- worker end-to-end;
- **chyby zápisu:** nedostupná cesta → měření se vypne s jedním řádkem v logu a web odpovídá; DB jen pro čtení → „write failed“ bez detailu, web odpovídá; výjimka v sinku se nepropaguje;
- izolace importů (žádné moduly relací, kvót ani IP);
- žádný klientský skript;
- přechod času (DST).

## 5. Bezpečnostní kontrola změn
- **Nové vstupy zvenku:** žádné. Žádný nový endpoint ani hlavička odpovědi; HTML, JS a CSP beze změny.
- **Data:** jen výčtové hodnoty a denní čísla. Hlavičky se čtou jen pro rozhodnutí (`sec-fetch-*`, `sec-purpose`, `purpose`; `user-agent` a `sec-ch-ua-mobile` jen s `BEHAVIOR_DEVICE=1`) a nikde se neukládají.
- **Logy:** jen „Behavior statistics disabled.“ a „Behavior statistics write failed.“, bez hodnot.
- **Zdroje:**
  - paměť: nejvýš 256 klíčů a 4 dávky po nejvýš 256 řádcích;
  - worker: `maxOldGenerationSizeMb: 32`;
  - SQL jen s parametry, CHECK seznamy z konstant.
- **Selhání:** všechny cesty měření jsou po `finish`/`close` a v try/catch; worker se při chybě vypne; odpovědi se nemění.
- **Zbytek:** `serviceError` vždy nastaví symbolovou vlastnost na objektu odpovědi (neviditelná, bez vlivu na výstup).

## 6. Zapnutí (až po A0, ne teď)
```
BEHAVIOR_STATS=1
BEHAVIOR_DB_PATH=/data/behavior.sqlite          # jiný soubor než USAGE_DB_PATH
BEHAVIOR_SNAPSHOT_PATH=/usage-export/behavior.json
# BEHAVIOR_DEVICE=1                             # jen po kladném závěru ⚖ 3
```
**Rollback:** proměnnou odebrat a restartovat. Tabulka zůstane a nic neovlivní; lze ji smazat bez dopadu na `daily`.

## 7. Další etapy (čekají na schválení)
- **A2:** vyřazení smoke testů a healthchecku.
- **A3:** karta v adminu (čte `behavior.json`, potlačení malých hodnot na serveru).
- **A4:** volitelný referrer.
- **A5:** nasazení po A0.
