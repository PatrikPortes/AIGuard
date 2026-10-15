# Stage 9 – SEO-1 a SEO-2: review

- **Datum:** 2026-10-15
- **Větev:** `feat/seo-stage9`
- **Produkční základ:** `8b0370e473ca83d5b66e02d3522697217ec05672`. Remote HEAD ověřen; od auditu (`dfd7c4f`) přibyly 3 commity ke sdílení obrázků, HTML se nezměnilo.
- **Podklad:** `docs/reviews/SEO_AUDIT_2026.md`, `docs/specs/SPEC_SEO_OPTIMIZATION.md` (schváleno; obsaženo cherry-pickem `4ad1cf9`).
- **Ověřený kód:** `f922e95` (Docker gate). Tento dokument mění jen `docs/` (mimo build context).
- Nic nebylo mergováno ani nasazeno.

## Verdikt
**GO pro review.** Kritické ani vysoké nálezy ve změnách Stage 9 nejsou. Tři existující selhání browser testů nesouvisejí se SEO (§4).

## Změny
| Oblast | Co |
|---|---|
| SEO-1 titulky a description | homepage, 6 checkerů a `/uz-se-to-stalo`: titulek pojmenuje problém uživatele (≤ 57 znaků), description 127–150 znaků, `og:title` a `og:description` shodné. Canonical URL beze změny. |
| SEO-1 Firma | doplněna chybějící description, Open Graph a Twitter údaje (`og:url` = canonical) |
| SEO-1 H1 homepage | „Jak poznat podvod dřív, než zaplatíte“. Slogan zůstává v hlavičce. H1 checkerů beze změny. |
| SEO-2 „Na co si dát pozor“ | statická sekce pod nástrojem na 6 checkerech: 4–6 bodů jen z existujících pravidel, vždy s poznámkou o omezeních a s 2–3 souvisejícími kontrolami |
| SEO-2 patička | na všech 12 stránkách řádek „Kontroly“ (6 checkerů a „Už se to stalo?“) |
| SEO-2 Typické situace | každá karta odkazuje na odpovídající kontrolu |
| Investice | výsledek se po odeslání posune do zobrazení. Delší stránka už nespoléhá na to, že se „smrskne“ (nalezeno browser testem). |
| CSS | statické styly nových prvků, cíle ≥ 48 px, bez animací |

**Beze změny:** algoritmy, API, relay, AI, limity, zpracování údajů, CSP, cookies, analytika, sdílení (Stage 8), `robots.txt`, sitemap, canonical.

**Zdroje tvrzení (ověřuje `tests/seo-stage9.test.js`):** `src/analysis.js` (zprávy, půjčky), web adaptéry a seznam ČOI, `src/firm-rules.js` (F01–F12), `public/investment-rules.js`, kategorie `contract-core.js`. Všech 94 nových textů prošlo `isSafeCopy` a zakázanými výrazy („garantovaně“, „ověříme, že“, „bezpečný web“…).

## Testy
| Test | Výsledek |
|---|---|
| Docker gate (Node 24.21, bez sítě) | **511/511 PASS**, produkční image sestaven |
| Claude strict gate | 16/16 PASS |
| `npm run check` | PASS |
| Lokální sada (Node 22) | 509 PASS + 3 známé (admin dashboard, 2 ARES časování; v Node 24 PASS) |
| `tests/seo-stage9.test.js` | 5/5 |
| `scripts/seo-stage9-browser.js` | 44 kombinací stránek a šířek (320/375/430/1280) a scénáře bez JS a s klávesnicí: PASS |
| Browser regrese | `stage8` 18, `share-image`, `message-flow` 16, `message-links` 16, `loan-firm` 11, `contract-firm` 13, `investment-page` 13, `investment-flow` 8, `stage5-qa` 21, `stage7` 48, `check` 32, `verdict` 28, `ares`, `responsive-review` 90 / 0 nálezů: PASS |
| `frontend` | 100 / 34 / 0 regresí, řádek po řádku shodné s produkcí `8b0370e` |

**Upravené existující testy** (jen kvůli novým interním odkazům v patičce, nic neoslabeno):
- `tests/m9.test.js`: povolené cíle odkazů rozšířeny přesně o 6 interních cest checkerů. Zákaz externích zdrojů, skriptů a formulářů zůstává.
- `scripts/stage7-browser.js`: počet odkazů v patičce 5 → 12. Kontrola rozměrů a hranic zůstává.

## 4. Regresní opravy (větev `fix/seo-stage9-regressions`)

Tři selhání browser testů existovala už na produkci `8b0370e` a jsou opravená.

1. **`web-firm` – snímek ČOI.**
   - **Příčina:** test používal snímek seznamu ČOI z repozitáře (`public/coi-snapshot.json`, staženo 2026-10-13 06:07 UTC), platný 48 h. Po jeho vypršení test selhával.
   - **Oprava (jen test):** test odpovídá na `/eshop-coi.json` stejnými záznamy s `fetchedAt` relativním k běhu testu.
   - Produkční kontrola aktuálnosti (`eshop-checker.js`, okno 48 h) i server zůstávají beze změny.
   - Nový scénář ověřuje, že kopie starší než 48 h se zobrazí jako „zastaralá“ a výsledek není zelený (14 scénářů PASS).
2. **`investment-qa` – pořadí Tab.**
   - Pořadí je **správné**: produkční sdílení obrázků přidalo nepovinné nastavení („Náhled obrázku a nepovinný popisek“) před tlačítko, které ho používá. DOM odpovídá vizuálnímu pořadí.
   - Test teď ověřuje celé pořadí: nastavení → „Poslat výsledek blízkému“ → „Uložit obrázek výsledku“ → podrobnosti výsledku, vždy s viditelným fokusem.
   - Čeká na povolení tlačítka, protože do připravení obrázku je zakázané a Tab by ho přeskočil.
   - UI se nemění (16 scénářů PASS).
3. **`firm` – dotykový cíl.**
   - Zaškrtávací políčko souhlasu s popiskem mělo 24 px na výšku.
   - **Oprava UI** (`verdict.css`): klikací plocha políčka je 24 × 48 px, políčko zůstává vizuálně 24 px a je vycentrované v popisku (který měl už ≥ 48 px).
   - Limit 48 px se nemění (20 scénářů PASS).

Po opravách: celá browser regrese PASS, `frontend` 100 / 34 / 0 regresí shodný s produkcí. Docker gate je v §5.

## 5. Release gate (strom `2225bd1`)
| Test | Výsledek |
|---|---|
| Docker gate (Node 24.21, čistý `git archive`, bez sítě) | **511/511 PASS**, produkční image sestaven |
| Claude strict gate | 16/16 PASS |
| `npm run check` | PASS |
| Otisk planneru | `d695a2b8…` beze změny |

Release SHA = HEAD `fix/seo-stage9-regressions` (commit s touto sekcí, jen `docs/`). Fast-forward vůči produkci `8b0370e` je možný.
