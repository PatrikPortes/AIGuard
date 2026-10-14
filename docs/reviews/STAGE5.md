# Stage 5 – Propojení kontrol: release review

- **Datum:** 2026-10-14
- **Integrační větev:** `integration/stage5-final`
- **Specifikace:** `docs/specs/SPEC_STAGE5_CHECKER_LINKS.md` (rozhodnutí D1–D5)
- **Rozsah review:** cílené release review rozdílu produkce → kandidát. Nejde o obecný audit. Nic nebylo nasazeno ani mergováno do produkční větve.

## Verdikt

**GO**, s jednou podmínkou nasazení:

- Produkční základ se během Stage 5 změnil.
- Release obsahuje i commit `d4b9998` (vyhledávání firmy podle názvu, nové `/api/firm-search`, nová trasa relay). Ten je už na produkční větvi, ale podle `docs/reviews/RESPONSIVE_COPY_FIRM_SEARCH_2026-10-14.md` ještě nebyl nasazen.
- Před nasazením je proto potřeba výslovně potvrdit, že se má nasadit i `d4b9998`, a nasadit cílem `all` (relay před webem).

Kritické ani vysoké nálezy ve Stage 5 nejsou.

## 1. Historie a základ

| Položka | SHA | Stav |
|---|---|---|
| Produkce při zadání S5.5 | `289f27389e75957ba3f2135bde35b8bf2bc3b031` | předek Stage 5 |
| **Aktuální produkční větev** `release/web-checker-2-2026-10-13` | **`d4b9998879f2ef4834ca0cde1e0d62afec2886fb`** | fast-forward z `289f273`, 1 commit: „feat(ux): polish responsive layouts and add explicit firm-name search“ |
| S5.1 spec | `c9a6049` | lineárně |
| S5.2 Půjčka → Firma | `77aa82d` | lineárně |
| S5.3 Smlouva → Firma | `f866fc0` | lineárně |
| S5.4 Zpráva ↔ Web/Firma | `c68ec62` | lineárně; `289f273` je předkem, bez merge commitů |
| Integrační merge | `7b69db2` | rodiče `c68ec62` + `d4b9998` |
| QA skript S5.5 | `bdec1d0` | ověřený strom (Docker gate) |
| Tento dokument | commit, který tento soubor přidává | jen `docs/`, mimo build context |

**Proč merge commit.**
- Produkční větev se posunula na `d4b9998`, který není předkem `c68ec62`.
- Integrace jen nad `289f273` by při nasazení vrátila `d4b9998` zpět.
- Merge produkce do Stage 5 je proto nutný. Kandidát je potomkem `d4b9998`, takže produkční větev ho později přijme jako fast-forward.

**Kolize při merge** (všechny vyřešeny, obě strany zachovány):
- `public/contract.css`, `public/style.css`: obě strany jen připojovaly pravidla na konec souboru.
- `public/firm.html`: zachován produkční formulář (IČO nebo název, výběr kandidátů). Přidána navigace S5.4 Firma → Zpráva a kontextový odkaz na `/overit-zpravu` za výběr kandidátů.
- `public/firm.js`: produkční logika beze změny. Na konec je přidáno předvyplnění S5.4 z `#ico=`; při něm se vyprázdní pole názvu, protože produkce odmítá vyplněná obě pole.

## 2. Rozsah Stage 5

| Krok | Obsah |
|---|---|
| S5.1 | inventura a specifikace propojení |
| S5.2 Půjčka → Firma | P9 (`loan`, adopce výsledku `/api/analyze` přes `fromLoan`); pole „IČO poskytovatele“ na `/proverit-pujcku`; neutrální firma; poznámka „Oprávnění ČNB jsme neověřili“ |
| S5.3 Smlouva → Firma | P10 (`contract`, jen v prohlížeči, adopce `fromContract`, bez odkazů ze smlouvy); výběr smluvní strany (0/1/více IČO, ruční IČO, neplatné IČO); nic se nepředvybírá |
| S5.4 Zpráva ↔ Web/Firma | pole „IČO firmy (nepovinné)“ na `/overit-zpravu` (P3); odkaz „Prověřit firmu podrobně“ → `/proverit-firmu#ico=XXXXXXXX` (předvyplnění bez automatického spuštění); odkazy Web/Firma → Zpráva |
| Investice → Firma/Web | z Stage 4; ve Stage 5 jen odkaz „Prověřit firmu podrobně“ |

### Změněné soubory proti aktuální produkci `d4b9998` (26 + tento dokument)

| Oblast | Soubory |
|---|---|
| Orchestrátor (aditivně) | `public/check-plan.js` (P9, P10, A5 `loan`/`contract`), `check-flow.js` (runnery půjčky, smlouvy a zprávy s IČO), `check-view.js` (kontextové poznámky, neutrální firma, odkaz na firmu) |
| Stránky | `app.js` (pole IČO půjčky a zprávy), `contract.js`, `investment.js` (neutrální firma přesunuta do `check-view`), `firm.js`, `firm.html`, `loan.html`, `message.html`, `smlouva.html`, `web.html` |
| Styly | `style.css` (selektor polí IČO, `.context-link`), `verdict.css` (`.check-firm-link`), `contract.css` (výběr strany) |
| Testy | nové: `tests/loan-firm.test.js`, `contract-firm.test.js`, `message-links.test.js`; upravené přesné výčty: `check-plan`, `investment-plan`, `investment-page` |
| Browser skripty | nové: `loan-firm`, `contract-firm`, `message-links`, `stage5-qa`; `message-flow` (scénář půjčky upraven podle S5.2) |
| Dokumentace | spec Stage 5, tento review |

**Beze změny proti produkci `d4b9998`:**
- `src/` (server, API, CSP, limity), `ai-proxy.cjs`;
- `Dockerfile*`, `.dockerignore`, `deploy/` (release skript sha256 `4ea56054…`);
- `package*.json`, `admin/`;
- `public/index.html`, `public/sitemap.xml`, `contract-legal-catalog.json`.

## 3. Integrační QA (strom `bdec1d0`)

`scripts/stage5-qa-browser.js`: 21 scénářů na šířkách 320, 375, 430 a 1280 px, skutečné stránky a server, registr je fixture.

| Propojení | Ověřeno |
|---|---|
| A. Zpráva ↔ Web/Firma | `/api/analyze` 1× a `/api/firm` 1× (`{"ico"}`). Text zprávy jde jen na `/api/analyze`. Odkaz → `/proverit-firmu`: IČO předvyplněné, pole názvu prázdné, fragment odstraněn, **žádný API požadavek**; teprve tlačítko pošle 1× `/api/firm`. Web/Firma → Zpráva: prázdný formulář. |
| B. Půjčka → Firma | `/api/analyze` 1× + `/api/firm` 1×, původní výsledek nahoře, neutrální firma, ČNB neověřeno, nikde 🟢, verdikt ≠ `none_found` |
| C. Smlouva → Firma | Bez výběru 0 požadavků, nic předvybráno. Výběr strany jen klávesnicí (Tab, mezerník, Enter). 1× `/api/firm`. Text smlouvy nikdy v síti. Původní výsledek zůstává beze změny. Poznámka „Neověřili jsme, že smlouvu uzavírá právě tato firma.“ |
| D. Investice → Firma/Web | jen 1× `/api/firm`, URL kontrolována lokálně (nikdy v síti), řádky Investice/Firma/Web, neutrální firma, odkaz na firmu bez auto-submit |
| Chyby a timeouty | firma pomalejší než deadline plánu 5 s → krok nedokončen, společný verdikt „vyžaduje pozornost“, výsledek zprávy zachován, 1× `/api/firm` |
| Layout | Na všech 4 šířkách bez horizontálního přetečení a bez prvků mimo viewport. Odkazy, pole IČO, volby strany a souhrny mají aspoň 48 px. |

Cílené browser sady jednotlivých kroků (na integraci):

| Sada | Výsledek |
|---|---|
| `message-links` (S5.4) | 16 PASS (320/375/430) |
| `contract-firm` (S5.3) | 13 PASS |
| `loan-firm` (S5.2) | 11 PASS |

## 4. Regrese (integrace)

| Oblast | Výsledek |
|---|---|
| Stage 4 | `investment-qa` 16 (320/375/430/1280), `investment-page` 13, `investment-flow` 8: PASS |
| Stage 3 | `web-firm` 13, `message-flow` 16, `check` 32, `verdict` 28, `firm` 20, `ares`: PASS |
| F5a | `message-flow` (první akce F5a nad kombinovaným výsledkem), `loan-firm` (výsledek F5a první): PASS |
| Produkční `d4b9998` | `responsive-review`: 90 layoutů (10 stránek × 9 šířek), 0 nálezů, 3 toky vyhledávání podle názvu. `tests/firm-search.test.js` a `tests/firm-relay.test.js`: PASS. |
| `frontend` | 114 splněno, 20 SHORTFALL, 0 regresí. Shodné s produkcí `d4b9998` (SHORTFALL je známý stav designu, ne chyba testu). |
| Planner | otisk 300 vstupů beze změny (`d695a2b8…`) |
| Stávající API | `src/` beze změny proti produkci; `/api/firm` wire `{"ico":"########"}`, limity a cache beze změny |

Žádný test ani práh nebyl oslaben. Upravené testy jen sledují aditivní změny: výčty pravidel P9 a P10, selektor pole IČO a přesný text validace v `app.js`.

## 5. Bezpečnostní gate

| Kontrola | Výsledek |
|---|---|
| Docker release gate (Node 24.21, čistý `git archive`, `--no-cache-filter validated`, bez sítě) | **491/491 PASS**, produkční image sestaven |
| Claude strict gate | 16/16 PASS (lokálně i v image) |
| `npm run check` | PASS (lokálně i v image) |
| Lokální sada (Node 22) | 489 PASS. 1 FAIL + 2 cancelled jsou existující stav produkce (`admin/tests/dashboard.test.js`, 2 ARES testy s časováním Node 22). V Node 24 gate PASS. |
| Žádné nové API | Stage 5 nemění `src/`. `/api/firm-search` patří k `d4b9998` (viz Verdikt). |
| Žádný nový egress | Nové klientské požadavky jdou jen na existující `/api/session` a `/api/firm`. Externí adresy v rozdílu jsou jen existující odkazy `<a>`. |
| CSP | beze změny (`src/server.js` beze změny); 0 porušení CSP v prohlížeči |
| Žádné nové odesílání textů | síťový spy: text půjčky a zprávy jen na existující `/api/analyze`; text smlouvy a nabídky ani URL nikdy |
| Žádné automatické spuštění kontroly firmy | `#ico=` jen předvyplní (platné IČO); neplatné nebo cizí fragmenty ignoruje; fragment se odstraní; IČO nikdy v URL na server |
| Žádné falešně zelené verdikty | A5: `message`, `web`, `investment`, `loan` a `contract` samy nevedou na zelenou. Čistá firma u investice, půjčky a smlouvy je neutrální. Na stránkách Zpráva a Web zůstalo původní zobrazení. |
| Žádné zvýšení limitů | BUDGET 4 kroky / 2 URL / 1 IČO / 5 s beze změny; limitery `/api/firm` beze změny |
| Produkční konfigurace | `deploy/`, env, compose, Dockerfile beze změny. `AI_CONTRACT_ENABLED` zůstává false, právní katalog `[]`. |

## 6. Známá omezení (neblokující)

1. Firmu zadanou uživatelem nespojujeme se zprávou, smlouvou ani půjčkou. Výsledek to vždy výslovně uvádí.
2. Oprávnění ČNB (půjčka, investice) se automaticky neověřuje; zůstávají ruční odkazy.
3. Odkazy ve smlouvě se nekontrolují (D2).
4. Na `/proverit-web` a `/overit-zpravu` se čistá firma zobrazuje původně (zelený dílčí výsledek, souhrnný verdikt zůstává podle A1–A6).
5. Po načtení `#ico=` se fragment odstraní. Obnovení stránky proto IČO znovu nepředvyplní (záměr: IČO se nesdílí ani neukládá do záložek).
6. 7 starších browser skriptů Stage 3 (`security`, `beta-ux`, `loan`, `ai-loan-integration`, `ai-p0`, `ai-beta`, `ai-fallback`) je zastaralých už před Stage 3/4.
7. Nasazení Stage 4 na VPS (`289f273`) není v tomto prostředí potvrzené (bez přístupu k VPS).

## 7. Regresní problémy

Žádné otevřené. Během Stage 5 nalezeno a opraveno:
- S5.4: styl odkazu „Prověřit firmu podrobně“ byl v `style.css`, které fixture `check` nenačítá (target pod 48 px). Přesunuto do `verdict.css`, které načítají všechny stránky s kombinovaným výsledkem.

## 8. Podmínky a plán nasazení (po schválení uživatelem)

1. Potvrdit, že se nasazuje i obsah `d4b9998`: vyhledávání podle názvu, `/api/firm-search`, nová trasa relay `/v1/registry/ares-search`.
2. Ověřit, že `release/web-checker-2-2026-10-13` má stále HEAD `d4b9998`. Pokud ne, je potřeba nová integrace a review.
3. Release SHA = HEAD `integration/stage5-final` (commit s tímto dokumentem). Image je obsahově totožný s ověřeným `bdec1d0`, protože `docs/` nejsou v build contextu.
4. Na VPS jako root, krok po kroku, stop při prvním STOP:
   - `bash verimtomu-release.sh prepare <SHA>`
   - `bash verimtomu-release.sh build <SHA>` (release gate běží v buildu)
   - fast-forward `release/web-checker-2-2026-10-13` → `<SHA>`
   - `bash verimtomu-release.sh deploy <SHA> all` (**všechno**: relay před webem, kvůli `d4b9998`)
   - `bash verimtomu-release.sh verify <SHA>`
5. Firewall, egress, env a CSP se nemění. `AI_CONTRACT_ENABLED` zůstává nenastaveno.
6. Ruční kontrola po nasazení:
   - `/overit-zpravu`: pole „IČO firmy (nepovinné)“. S IČO 27082440 právě jeden `/api/firm`. Odkaz „Prověřit firmu podrobně“ otevře `/proverit-firmu`, IČO je předvyplněné a žádný požadavek bez kliknutí.
   - `/proverit-pujcku` s IČO: firma „Firma nalezena v registrech“, ČNB neověřeno, nikde 🟢.
   - `/proverit-smlouvu` se dvěma IČO: volba strany bez předvýběru; po výběru jeden `/api/firm`; text smlouvy v síti nikde.
   - `/proverit-investici`, `/proverit-web`, `/proverit-firmu` (IČO i název): fungují jako dosud. Na Webu a Firmě je odkaz na Zprávu.
   - homepage a sitemap beze změny proti `d4b9998`.
7. Při jakékoli odchylce: `bash verimtomu-release.sh rollback <SHA> all`.

## 9. Rollback

- Release skript je beze změny. `prepare` zaznamená běžící image webu i relay jako cíle rollbacku.
- `deploy` při chybě automaticky vrátí, co změnil. `rollback <SHA> [all|proxy|web]` funguje nezávisle po službách.
- Stage 5 nemění data, konfiguraci, env, síť ani serverové API.
- Rollback samotného webu na image `d4b9998` vrátí jen Stage 5. Relay z `d4b9998` je zpětně kompatibilní, nové trasy přidává jen aditivně.
- Rollback `all` vrací i `d4b9998` (stav podle `prepare`).
