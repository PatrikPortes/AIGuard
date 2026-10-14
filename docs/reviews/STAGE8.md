# Stage 8 – Sdílení výsledků a Věrka s Robem: review

- **Datum:** 2026-10-14
- **Větev:** `feat/stage8-sharing`
- **Produkční základ:** `a961078dddc40e0743ab50e80a120c8aa116ccd1` (Stage 7.1). HEAD `release/web-checker-2-2026-10-13` ověřen.
- **Specifikace:** `docs/specs/SPEC_STAGE8_SHARING_MASCOTS.md` (S8.1, schválená). Větev ji obsahuje beze změny obsahu, jen se stavovým řádkem.
- **Ověřený kód:** `c28766d` (Docker gate). Tento dokument a stavový řádek spec mění jen `docs/`, které nejsou v build contextu.
- **Rozsah:** S8.2, S8.3, S8.4 a S8.6. Animace jsou podle rozhodnutí autora mimo Stage 8. Nic nebylo mergováno ani nasazeno.

## Verdikt

**GO pro feature review.** Kritické ani vysoké nálezy nejsou.

## 1. Rozhodnutí autora a jejich naplnění

| # | Rozhodnutí | Stav |
|---|---|---|
| 1 | Samostatné výsledky Zprávy a Půjčky se sdílejí neutrálně, bez kategorie rizika | `app.js`: kategorie `neutral` |
| 2 | S kombinovaným výsledkem se sdílí jeho skutečná kategorie | ovládací prvek v `check-view` z `aggregate.level`; neutrální prvek F5a i prvek smlouvy se po zobrazení kombinovaného výsledku odstraní |
| 3 | Jen existující ilustrace | `verka-warning`, `verka-explaining`, `verka-thinking` |
| 4 | „Bez nalezených rizik“ → `verka-thinking` | ano; `*-success` se u výsledků nepoužívá (unit i browser test) |
| 5 | `verka-share` a `robo-incomplete` odloženy | nevytvořeny |
| 6 | Bez animací | žádné `animation`, `transition` ani `@keyframes` (statický i browser test) |
| 7 | Tlačítko až u konečného výsledku | Vytváří se jen při vykreslení konečného výsledku, nikdy v průběhu. Browser test drží `/api/analyze` a ověří, že během kontroly tlačítko není vidět. |
| 8 | Stará F5a | nedotčena |

## 2. Změny (proti produkci `a961078`)

| Soubor | Změna |
|---|---|
| `public/share-result.js` (nový) | Texty (6 typů × 5 kategorií) a mapování úroveň → kategorie (`not_assessable` → `incomplete`). Postup: `navigator.share` → schránka → ruční kopírování. Ovládací prvek s `role="status"`. |
| `public/check-view.js` | volba `share` (výchozí vypnuto) přidá ovládací prvek za „Co udělat teď“; postava podle `aggregate.level` |
| `public/verdict-view.js` | `guideFor`/`applyGuide`: statická nálada podle úrovně |
| `public/check-flow.js` | runnery předávají typ stránky (`web`, `message`, `loan`, `investment`, `contract`). Zpráva vrací výsledek, aby stránka věděla, že má neutrální prvek odstranit. |
| `public/app.js` | neutrální sdílení výsledku F5a před „Prověřit další …“ |
| `public/contract.js` | sdílení výsledku smlouvy (kategorie přes existující `fromContract`) |
| `public/firm.js` | sdílení samostatného výsledku firmy v `#firm-followup` (nikdy u vnořené firmy) |
| `public/verdict.css` | statické styly ovládacího prvku (48 px, zalamování, ruční textarea) |
| `src/server.js` | jedna položka statického whitelistu `/share-result.js` |
| Testy | nové `tests/stage8-share.test.js` (7) a `scripts/stage8-browser.js` (18 scénářů); úpravy viz §5 |

**Beze změny:**
- algoritmy checkerů, planner (otisk `d695a2b8…` shodný), agregace A1–A6 a nadpisy;
- API (stejných 9 cest), limity, relay `ai-proxy.cjs`, AI konfigurace;
- CSP, `Permissions-Policy`, `deploy/`, Dockerfile, `package*.json`;
- homepage, sitemap a ilustrace.

## 3. Sdílený obsah (S8.3)

- `buildShare(type, category)` přijímá **jen dva výčty**. Do funkce nevstupuje žádný vstup uživatele, výsledek, nález, URL, IČO, DIČ, jméno, telefon ani identifikátor.
- Odkaz je kanonický `https://verimtomu.fyi/<checker>`, bez query a bez fragmentu. Neodvozuje se z `location`, takže se nesdílí ani `#ico=`.
- Kategorie:
  - **vysoké riziko**;
  - **vyžaduje pozornost**;
  - **bez nalezených rizik**, vždy s „To neznamená, že je vše v pořádku. Kontrola nemůže zaručit bezpečnost.“;
  - **nedokončeno**, vždy s „Chybějící ověření neberte jako dobrou zprávu.“;
  - **neutrální** (samotné F5a).
- Poznámka checkeru je přiložena vždy: ČNB neověřeno u Půjčky a Investice; „Kontrola nenahrazuje právní posouzení“ u Smlouvy; „Web jsme nenavštívili…“; „Zápis v registru není záruka bezpečnosti“; „Odesílatele ani odkazy jsme neověřovali.“
- Všechny texty projdou `isSafeCopy`. Bez čísel, procent a skóre.

## 4. Nálady (S8.4)

| Úroveň | Věrka |
|---|---|
| `serious` | `verka-warning` („Věrka upozorňuje na varovné signály“) |
| `attention` | `verka-explaining` |
| `none_found`, `incomplete`, `not_assessable` | `verka-thinking` („Věrka přemýšlí nad výsledkem“) |

- Platí pro kombinovaný výsledek a pro výsledek firmy (samostatný i vnořený).
- Výsledek F5a zůstává beze změny (D6).
- Vedlejší postavy Roba (`robo-tip`, `robo-searching`, `robo-warning`) spec uváděla jako doplněk. Do výsledkové karty jsem je nepřidal. Další obrázek v kartě by posunul hlavní akci pod okraj obrazovky na 320 px a fold testy by neprošly. Doplnit je lze v pozdější etapě.

## 5. Výsledky testů

| Test | Výsledek |
|---|---|
| Docker release gate (Node 24.21, čistý `git archive`, `--no-cache-filter validated`, bez sítě) | **504/504 PASS**, produkční image sestaven |
| Claude strict gate | 16/16 PASS (lokálně i v image) |
| `npm run check` | PASS (lokálně i v image) |
| Lokální sada (Node 22) | 502 PASS. 1 FAIL + 2 cancelled jsou existující stav produkce (`admin/tests/dashboard.test.js`, 2 ARES testy s časováním Node 22); v Node 24 gate PASS. |
| `tests/stage8-share.test.js` | 7/7 |
| `scripts/stage8-browser.js` | 18 scénářů PASS |
| Browser regrese | `web-firm` 13, `message-flow` 16, `message-links` 16, `loan-firm` 11, `contract-firm` 13, `investment-qa` 16, `investment-page` 13, `investment-flow` 8, `firm` 20, `ares`, `check` 32, `verdict` 28, `stage5-qa` 21, `stage7` 48 layoutů, `responsive-review` 90 layoutů / 0 nálezů: PASS |
| `frontend` | 114 / 20 SHORTFALL / 0 regresí, **řádek po řádku shodné** s produkcí `a961078` |

**`unit stage8-share` ověřuje:**
- všech 30 kombinací typu a kategorie, `isSafeCopy`, zakázané výrazy a povinné věty;
- odmítnutí neznámých hodnot (včetně `__proto__`);
- úspěšné nativní sdílení (jen klíče `title`, `text`, `url`), zrušení bez fallbacku, chybu nativního sdílení → schránku, odepřenou schránku → ruční kopírování, prohlížeč bez Share API;
- ruční textareu: jen pro čtení, bez `name`, s fokusem a označeným textem;
- že průběh kontroly ani výsledek bez volby `share` tlačítko nemají;
- **únik dat:** skutečné běhy Zprávy a Investice se vstupy obsahujícími jméno, telefon, e-mail, URL s tajným parametrem, IČO a DIČ → žádný z těchto údajů není ve sdílených datech;
- mapování nálad bez `*-success`;
- že modul nemá síť, úložiště, cookies ani `location`;
- že CSS Stage 8 nemá animace a API zůstává 9 cest.

**`browser stage8` (320/375/430/1280 px) ověřuje:**
- Web, Firmu, Zprávu (samotné F5a i s IČO), Půjčku, Smlouvu (před výběrem strany i po něm) a Investici („Garantovaný výnos“ → `verka-warning`);
- přesná sdílená data a žádný síťový požadavek při sdílení;
- zrušení, chybu → schránku a ruční kopírování ovládané klávesnicí (Enter);
- žádné tlačítko během probíhající kontroly;
- žádný `success` obrázek na stránce s výsledkem;
- žádné animace ani přechody bez reduced-motion i s ním;
- tlačítko aspoň 48 px a žádné přetečení.

**Upravené existující testy** (jen kvůli novému ovládacími prvku, kontroly nejsou oslabené):
- `tests/investment-page.test.js`: přesná signatura `renderCombinedResult` a volání pro Web a Zprávu obsahují `share`. Kontrola, že Web a Zpráva nemají neutrální firmu, zůstává.
- `scripts/investment-qa-browser.js`: první Tab v kartě výsledku teď vede na tlačítko sdílení (s ověřením viditelného fokusu), další Tab na původní `<details>`. Původní kontrola zůstává.
- `scripts/check-browser.js`, `scripts/verdict-browser.js`: allowlist fixture serveru doplněn o `share-result.js` a dvě schválené ilustrace (`verka-warning`, `verka-thinking`).

**Nález opravený během QA:** nápověda pod tlačítkem měla menší a světlejší písmo a `frontend` hlásil 11 nových SHORTFALL (kontrast a 18 px). Styl jsem sjednotil s běžným textem; výsledek je teď shodný s produkcí.

## 6. Bezpečnostní hranice

- **Žádné nové API, databáze, cookies, měření ani externí služby.** Sdílení nevolá síť (ověřeno síťovým spy).
- **Žádný únik dat:** sdílený text je funkcí dvou výčtů; test se skutečnými vstupy neobsahujícími v textu nic z citlivých údajů.
- Žádná data v URL (query ani fragment), žádné veřejné odkazy na výsledek, žádné serverové ukládání.
- **Žádný falešně bezpečný výsledek:** kategorie „bez rizik“ vždy říká, že bezpečnost nezaručuje. Postavy nepoužívají úspěšné pózy.
- Ruční textarea je mimo formulář a bez `name`. CR-08 a strict gate PASS.
- CSP a `Permissions-Policy` beze změny. `navigator.share` i schránka fungují v zabezpečeném kontextu.

## 7. Známá omezení

1. Nativní sdílení závisí na prohlížeči. Desktopové prohlížeče bez Share API použijí schránku, a pokud není k dispozici, ruční kopírování.
2. Sdílený text je záměrně obecný. Neobsahuje nálezy ani konkrétní důvody, protože i ty by mohly nést údaje z kontroly.
3. Smlouva bez nálezů se sdílí jako „nedokončeno / nelze posoudit“. Odpovídá to `fromContract`, který neumí potvrdit absenci rizika.
4. Vedlejší nálady Roba ve výsledku a ilustrace `verka-share` a `robo-incomplete` jsou odložené.
5. Animace jsou budoucí rozšíření (spec §7).

## 8. Další krok

Po schválení:
1. Ověřit, že HEAD `release/web-checker-2-2026-10-13` je stále `a961078`.
2. Provést fast-forward na HEAD `feat/stage8-sharing`.
3. Nasadit existujícím release skriptem: `prepare` → `build` → `deploy <SHA> web` → `verify`. Cíl `web` stačí, protože relay se nemění; `all` je také bezpečný.
4. Rollback: `rollback <SHA> web`.
