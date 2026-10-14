# Stage 4 – Prověřit investici: release review

- **Produkční baseline:** `ff9615c54f388bd408d9d7915cce886a85452a03` (HEAD `release/web-checker-2-2026-10-13`, ověřeno 2026-10-14; žádná novější release/hotfix větev na remote)
- **Integrační větev:** `integration/stage4-final`
  - merge `99d95d8` = produkce `ff9615c` + Stage 4 `6ada7c4` (S4.1–S4.6), bez squashe;
  - S4.7 homepage + sitemap: `861f99f`;
  - tento dokument: commit, který tento soubor přidává (jen `docs/`, mimo build context).
- **Specifikace:** `docs/specs/SPEC_STAGE4_INVESTMENT.md` (rozhodnutí D1–D8)
- **Datum:** 2026-10-14
- **Rozsah:** cílené release review rozdílu produkce → kandidát. Nejde o obecný audit. Nic nebylo nasazeno ani mergováno do produkční větve.

## Verdikt

**GO.** Kritické ani vysoké nálezy nejsou. Nasazení vyžaduje samostatné schválení uživatele.

## 1. Rozdíl proti produkci (24 souborů)

| Oblast | Soubory | Hodnocení |
|---|---|---|
| Nové moduly Stage 4 | `public/investment-rules.js`, `investment-verdict.js`, `investment.html`, `investment.js` | čisté moduly, bez sítě. Stránka volá jen existující orchestrátor. |
| Aditivní změny Stage 3 | `check-plan.js` (P8, `offer`, A5), `check-flow.js` (investiční runner), `check-view.js` (popisek, poznámka u firmy), `verdict-model.js` (checker `investment`, invarianty) | plány bez `offer` bajtově shodné (otisk 300 vstupů P1–P7/A1–A6 + baseline S3.2a) |
| Styly | `verdict.css` (1 pravidlo vázané na atribut investiční stránky), `style.css` (selektor `#offer-ico` přidán k existujícímu `#sender`) | žádný nový design systém, `/overit-zpravu` beze změny |
| Server | `src/server.js` +5 řádků: route `/proverit-investici` + 3 skripty ve statickém whitelistu | žádný nový API endpoint, CSP beze změny |
| Homepage | `public/index.html`: 6. karta aktivní (vzor `choice-card`), odkaz `/proverit-investici`, bez „Již brzy“ | 6 karet. Ostatní obsah, hero a design beze změny. |
| Sitemap | `public/sitemap.xml`: +`/proverit-investici` | ostatních 8 adres beze změny |
| Testy | 5 nových unit souborů, 3 browser skripty; upraveny `check-plan.test.js` (ID P8), `web-release.test.js` (0× „Již brzy“, route a sitemap) | žádný test neoslaben, prahy beze změny |
| Dokumentace | spec Stage 4, tento review | — |

**Beze změny proti produkci:**
- `Dockerfile`, `Dockerfile.cloudflared`, `.dockerignore`, `deploy/`;
- `ai-proxy.cjs` (relay), compose, env, `package.json`, `package-lock.json`, `admin/`;
- release skript (sha256 `4ea56054…`).

## 2. Release kontroly

| Kontrola | Výsledek | Důkaz |
|---|---|---|
| Dostupnost stránky | PASS | `/proverit-investici` 200, stejná CSP jako `/proverit-web` (unit). Karta na homepage vede na stránku (prohlížeč, 320 a 1280 px). |
| Funkčnost investiční kontroly | PASS | 15 deterministických pravidel (≥ 3 pozitivní a ≥ 3 negativní případy na pravidlo), skutečná stránka v Chromiu |
| Investice + IČO + URL | PASS | Skutečný runner: 4 kroky, limity, deduplikace, přeskočené kroky viditelné. Na stránce: investice + firma + 2 weby + odkaz nad limit. |
| Neověřené oprávnění ČNB | PASS | U každého typu verdiktu je viditelné „Seznamy a upozornění ČNB — neprovedeno“ i „Oprávnění poskytovatele u ČNB jsme automaticky neověřili.“ |
| Neutrální čistá firma | PASS | Na investiční stránce „Firma nalezena v registrech“ + poznámka, šedé pozadí. `/proverit-web` beze změny. |
| Žádný zelený investiční verdikt | PASS | Pojistky v modelu (`none_found` zakázáno, ČNB povinně neověřená) + A5. Vyčerpávající agregační test. Na stránce nikde 🟢. |
| Zachování Stage 3 | PASS | Browser regrese Web + Firma (13), Zpráva + Web + Firma (16), check (32), verdict (28), firm (20), ARES. Otisk planneru a agregace shodný. |
| Zachování CSP | PASS | CSP hlavičky beze změny (`web-release`, `investment-page`). V prohlížeči 0 porušení CSP. |
| Žádné nové API | PASS | Diff `src/` neobsahuje nový `/api/` path. `/api/check` nepřijímá `offer` ani `url`. |
| Produkční konfigurace | PASS | infra a konfigurační soubory beze změny (výše) |

## 3. Bezpečnostní hranice

- **Text nabídky neopouští prohlížeč.** Síťový spy na skutečné stránce:
  - jediný POST je `/api/firm` s přesně `{"ico":"########"}`;
  - bez IČO nejde žádný API požadavek;
  - nikdy se nevolá `/api/check` ani `/api/analyze`;
  - všechny požadavky jdou na stejný origin.
- **URL z nabídky** se kontrolují jen v prohlížeči (`checkWebUrl` + místní kopie ČOI).
- **Citace** se vykreslují přes `textContent`, test XSS `<img src=x>` prošel. Citace nabídky jsou jediný text mimo `isSafeCopy`: pevný popisek, ≤ 200 znaků, bez řídicích a bidi znaků, jen u typu `investment`.
- **Neplatný vstup nic neodešle:**
  - validace proběhne před požadavkem;
  - formulář nemá pojmenovaná pole ani `action`;
  - tlačítko je bez JavaScriptu zakázané (CR-08, strict gate).
- **Statický whitelist:** jen 4 nové položky. Moduly bez DOM side-effectů na jiných stránkách.
- **Limity Stage 3 platí:**
  - max. 4 kroky / 2 weby / 1 firma;
  - deadline 5 s;
  - sdílené limitery a cache `/api/firm`.

## 4. Výsledky testů (kandidát `861f99f`)

| Test | Výsledek |
|---|---|
| Docker release gate (Node 24, čistý `git archive`, `--no-cache-filter validated`) | **452/452 PASS**, image sestaven |
| Claude strict gate (v image i lokálně) | 16/16 PASS |
| `npm run check` (v image i lokálně) | PASS |
| Lokální celá sada (Node 22) | 450 PASS. 1 FAIL + 2 cancelled jsou existující stav produkce (`admin/tests/dashboard.test.js`, 2 ARES testy s časováním Node 22). V Node 24 gate PASS. |
| Browser Stage 4 | `investment-qa` 16, `investment-page` 13, `investment-flow` 8: PASS |
| Browser Stage 3 | `web-firm` 13, `message-flow` 16, `check` 32, `verdict` 28, `firm` 20, `ares`, `frontend` (SHORTFALL = očekávané baseline zjištění): PASS |

Commit s tímto dokumentem mění jen `docs/reviews/`, který není v build contextu (`.dockerignore`). Image je proto obsahově totožný s ověřeným kandidátem.

## 5. Nálezy

Kritické ani vysoké: **žádné.**

Opraveno během Stage 4 QA (S4.6): pole IČO bylo nestylované (pod 48 px) a na 320 px přetékalo o 9 px. Opraveno sdíleným selektorem a pokryto regresním testem.

## 6. Známé neblokující dluhy

1. Oprávnění ČNB se v MVP automaticky neověřuje (D2). Uživatel dostane ruční odkazy na seznamy a upozornění ČNB.
2. Pravidla jsou deterministická slovní: neřeší záměnné znaky (např. cyrilici) ani význam bez klíčových slov. Nález nikdy netvrdí pravdivost ani podvod.
3. Čistá firma na `/proverit-web` zůstává zobrazena původně (zelená vnořená firma). Neutrální zobrazení platí jen na investiční stránce.
4. Browser testy nekontrolují dostupnost webu ČNB (bez externí sítě), jen přesné URL a atributy odkazů.
5. 7 starších browser skriptů Stage 3 (`security`, `beta-ux`, `loan`, `ai-loan-integration`, `ai-p0`, `ai-beta`, `ai-fallback`) je zastaralých už před Stage 3/4.
6. CSS třída `.coming-soon` zůstává ve `style.css` nevyužitá (bez vlivu).

## 7. Rollback

- Release skript beze změny. `prepare` zaznamená běžící image obou služeb jako cíle rollbacku.
- `deploy` při chybě automaticky vrátí, co změnil. `rollback <SHA> [all|proxy|web]` funguje nezávisle po službách.
- Stage 4 nemění data, konfiguraci, env, relay ani síť. Rollback na image `ff9615c` je úplný návrat (stránka, karta i sitemapa zmizí s image).
- Relay (`ai-proxy.cjs`) je beze změny. Stačí nasadit/vrátit jen `web`, plné `all` je ale také bezpečné.

## 8. Podmínky a plán nasazení (po schválení uživatelem)

1. Ověřit, že `release/web-checker-2-2026-10-13` má stále HEAD `ff9615c`. Pokud ne, nová integrace a review.
2. Release SHA = HEAD `integration/stage4-final` (commit obsahující tento dokument).
3. Na VPS jako root, krok po kroku, stop při prvním STOP:
   - `bash verimtomu-release.sh prepare <SHA>`
   - `bash verimtomu-release.sh build <SHA>` (release gate běží v buildu)
   - merge `integration/stage4-final` do `release/web-checker-2-2026-10-13` jako merge commit nebo fast-forward (sloučený strom musí být roven release stromu; skript to kontroluje)
   - `bash verimtomu-release.sh deploy <SHA> all`
   - `bash verimtomu-release.sh verify <SHA>`
4. Firewall, egress, relay a env beze změny. `AI_CONTRACT_ENABLED` zůstává nenastaveno (false), právní katalog `[]`.
5. Ruční kontrola po nasazení:
   - homepage: 6 aktivních karet, „Prověřit investici“ vede na `/proverit-investici`, žádné „Již brzy“;
   - `/sitemap.xml` obsahuje `/proverit-investici`;
   - `/proverit-investici`: příklad „Garantovaný výnos“ → 🔴, ČNB „neprovedeno“, v síti žádný požadavek. S IČO 27082440 právě jeden `/api/firm` s `{"ico"}`, firma „Firma nalezena v registrech“, nikde 🟢.
   - příklad „Běžná nabídka fondu“ → „Z dostupných údajů nelze posoudit“;
   - `/overit-zpravu`, `/proverit-web`, `/proverit-firmu`, `/proverit-smlouvu`, `/proverit-pujcku` fungují jako dosud;
   - `POST /api/check` s `{"offer":"x"}` → 400.
6. Při jakékoli odchylce: `bash verimtomu-release.sh rollback <SHA> all`.
