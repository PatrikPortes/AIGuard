# SEO audit 2026 – Věřím tomu? (verimtomu.fyi)

- **Datum:** 2026-10-15
- **Revize:** produkční větev `release/web-checker-2-2026-10-13` = `dfd7c4fd59b565c4d10470f4c59fa60b1ccb03af` (Stage 8).
  - Živý web odpovídá této revizi: `/share-result.js` vrací 200 a SEO prvky všech 11 stránek jsou s repozitářem **shodné**.
- **Jazyk a trh:** čeština, Česká republika.
- **Rozsah:** pouze audit a návrh. Nic nebylo změněno, mergováno ani nasazeno. Návrh implementace je v `docs/specs/SPEC_SEO_OPTIMIZATION.md`.

## 0. Jak byl audit proveden a co ověřit nešlo

| Zdroj | Co jsem ověřil |
|---|---|
| Repozitář (`public/*.html`, `src/server.js`, `robots.txt`, `sitemap.xml`) | Title, description, H1/H2, canonical, robots, OG/Twitter, `lang`, JSON-LD, odkazy, alt, `noscript` (parser HTML přes všech 12 stránek) |
| **Živý web** `https://verimtomu.fyi` (přes HTTPS proxy prostředí) | HTML 11 stránek, `robots.txt`, `sitemap.xml`, HTTP stavy, hlavičky, komprese, cache, duplicitní URL, 404 |
| Chromium (Playwright) proti živému webu | Text viditelný **bez JavaScriptu**, laboratorní LCP/CLS, přetečení na 375 a 1280 px |

**Neověřeno** (chybí přístup nebo nástroj):
- Google Search Console, Seznam Webmaster, Bing Webmaster: stav indexace, pokrytí a dotazy nevidím.
- Terénní Core Web Vitals (CrUX): mám jen laboratorní měření z jednoho prostředí.
- Přesměrování `http://` → `https://` a `www.` → bez `www`: proxy prostředí povoluje jen HTTPS a `www.verimtomu.fyi` přes ni nejde rozlišit (502).
- Hledanost a obtížnost klíčových slov: data nemám, proto **žádná čísla neuvádím**.

## 1. Souhrn

| Priorita | Počet | Hlavní body |
|---|---|---|
| **P0** | **0 ověřených** | Indexace, canonical, statusy, robots a sitemap jsou v pořádku. Dvě položky jsou neověřené (http→https, www) a ověří je vlastník. |
| **P1** | 5 | Titulky a description bez problémových slov; `/proverit-firmu` bez description a OG; stránky checkerů mají málo vysvětlujícího textu; slabé prolinkování Smlouvy a Investice; homepage H1 je jen slogan |
| **P2** | 7 | Žádná strukturovaná data; dvojí H1 na `/proverit-web`; chybějící `og:locale` a `twitter:image`; `/cesta/` vrací 404 místo 301; CSS a JS s `no-store`; sitemap bez `lastmod`; nejednotný oddělovač v titulcích |
| **P3** | 2 | Nanejvýš 5 vzdělávacích stránek; IndexNow pro Seznam a Bing |

**Už hotovo (nepředělávat):**
- `lang="cs"` na všech stránkách;
- absolutní self-canonical na všech 11 indexovaných stránkách, shodný s `og:url` (kromě Firmy, viz P1);
- `robots.txt` s `Disallow: /api/` a odkazem na sitemap;
- sitemap s 11 kanonickými URL, shodná s canonicaly;
- skutečný stav 404 s `noindex,follow`;
- `/index.html` a `/*.html` vracejí 404 (žádné duplicity);
- query parametry vracejí 200 se správným canonical;
- obsah stránek je v HTML i bez JS;
- OG obrázek 1200×627 a `summary_large_image`;
- viewport na všech stránkách, žádné přetečení;
- laboratorní LCP 0,7–1,2 s, CLS 0;
- komprese (zstd), hashované obrázky s `immutable`, `fetchpriority="high"` u hero obrázku;
- HSTS a CSP. CSP SEO neškodí, roboti JS na indexaci nepotřebují.

## 2. Inventura stránek (živý web = repozitář)

| URL | Title (délka) | Description (délka) | H1 | Slova bez JS |
|---|---|---|---|---|
| `/` | Věřím tomu? — Radši ověřit než litovat. (39) | Prověřte zprávu, web, půjčku, smlouvu, firmu nebo investiční nabídku… (129) | Radši ověřit než litovat. | 645 |
| `/overit-zpravu` | Prověřit zprávu · Věřím tomu? (29) | Prověřte podezřelou SMS, e-mail nebo zprávu… (115) | Prověřit zprávu | 158 |
| `/proverit-pujcku` | Prověřit nabídku půjčky · Věřím tomu? (37) | Spočítejte náklady půjčky, porovnejte dvě nabídky… (107) | Prověřit nabídku půjčky | 389 |
| `/proverit-web` | Prověřit web · Věřím tomu? (26) | Prověřte adresu webu, místní seznam rizikových e-shopů ČOI… (134) | Prověřit web **+ skrytý H1 „Co jsme zjistili“** | 113 |
| `/proverit-firmu` | Prověřit firmu · Věřím tomu? (28) | **chybí** | Prověřit firmu | 95 |
| `/proverit-smlouvu` | Prověřit smlouvu · Věřím tomu? (30) | Najděte ve smlouvě místa, která stojí za otázku… (153) | Prověřit smlouvu | 99 |
| `/proverit-investici` | Prověřit investici · Věřím tomu? (32) | Prověřte investiční nabídku: rizikové sliby výnosů… (123) | Prověřit investici | 139 |
| `/uz-se-to-stalo` | Už se to stalo? — Věřím tomu? (29) | Poslali jste peníze, údaje nebo povolili přístup… (93) | Už se to stalo? Co udělat teď | 308 |
| `/o-projektu` | O projektu · Věřím tomu? (24) | Proč vzniklo Věřím tomu?, kdo je autor… (114) | Věřím tomu? Protože někdy stačí jedna otázka… | 526 |
| `/kontakt` | Kontakt · Věřím tomu? (21) | Kontakt na autora… (121) | Napište nám | — |
| `/privacy` | Soukromí — Věřím tomu? (22) | Jak zpracováváme údaje šesti kontrol… (107) | Vaše soukromí | — |
| `/404` (jakákoli neznámá cesta) | Stránku jsme nenašli — Věřím tomu? | ano | Tuhle stránku jsme nenašli. | `noindex,follow`, HTTP 404 |

**Metadata:**
- `og:locale` chybí všude.
- `twitter:image` chybí na `/kontakt` a `/o-projektu`.
- `/proverit-firmu` nemá žádné OG ani Twitter údaje a nemá description.
- JSON-LD není nikde.
- `hreflang` není potřeba (jedna jazyková verze).

## 3. Technické SEO (ověřeno na živém webu)

| Kontrola | Výsledek |
|---|---|
| `/robots.txt` | 200, `Allow: /`, `Disallow: /api/`, `Sitemap:` OK |
| `/sitemap.xml` | 200, `application/xml`, 11 URL = 11 canonicalů; bez `lastmod` |
| Stránky v sitemap | všech 11 vrací 200 a `text/html` |
| `/neexistuje`, `/OVERIT-ZPRAVU`, `/404.html` | 404 + `noindex,follow` ✔ |
| `/index.html`, `/message.html`, `/firm.html` | 404 ✔ (zdrojové soubory nejsou duplicitně dostupné) |
| `/overit-zpravu/` (koncové lomítko) | **404** (ne 301) → P2 |
| `/overit-zpravu?utm_source=x` | 200 + canonical bez parametru ✔ |
| `http://`, `www.` | **neověřeno** z prostředí → vlastník (Cloudflare) |
| HTML `Cache-Control` | `no-store` (záměr kvůli relacím; indexaci neblokuje) |
| `style.css` a moduly JS | `no-store` → při každé návštěvě znovu ke stažení (P2, výkon) |
| Hashované obrázky | `public, max-age=31536000, immutable` ✔ |
| Komprese | zstd ✔ |
| HSTS | `max-age=2592000` (30 dní) |
| CSP | `script-src 'self'` (+ Cloudflare beacon na `/` a `/privacy`). JSON-LD jako datový blok CSP neporušuje; jde ale proti existujícím testům „bez inline skriptu“ (viz spec). |
| `X-Robots-Tag` | nepoužito ✔ |

**Výkon (laboratoř, Chromium přes proxy, ne terénní data):**

| Stránka | LCP 375 px | LCP 1280 px | CLS |
|---|---|---|---|
| `/` | 1,24 s | 1,18 s | 0 |
| `/overit-zpravu` | 1,12 s | 0,72 s | 0 |
| `/proverit-web` | 0,93 s | 1,15 s | 0 |
| `/proverit-firmu` | 1,03 s | 1,24 s | 0 |

## 4. Obsah a sémantika

- **Stránky checkerů jsou „nástroj bez obsahu“.**
  - Bez JS mají 95–160 slov a jde převážně o pokyny k formuláři.
  - Pro dotazy typu „jak poznat podvodnou SMS“ nebo „jak poznat podvodný e-shop“ stránky neobsahují vysvětlující text, na který by vyhledávač mohl odpovědět.
  - Nejvýraznější obsahová mezera. Řeší ji krátká statická sekce „Na co si dát pozor“ (P1), ne desítky článků.
- **Homepage** má dobrý obsah (645 slov), sekce „Typické situace“ pokrývá hlavní scénáře. H1 je ale slogan bez tématu a situace „Investice s jistým výnosem“ a „Půjčka pro každého“ neodkazují na příslušné checkery.
- **`/uz-se-to-stalo`** je silná stránka pro dotazy „co dělat, když jsem naletěl podvodníkovi“. Titulek to ale nevyjadřuje.
- **Sémantika:**
  - správné `main`, `nav`, `footer`, `section`, `details` a jeden viditelný H1 na stránku;
  - výjimka: `/proverit-web` má v HTML druhý H1 („Co jsme zjistili“, zpočátku skrytý);
  - všechny obrázky mají `alt`.

## 5. Interní prolinkování (počet stránek, které odkazují na cíl)

| Cíl | Příchozích odkazů |
|---|---|
| `/`, `/o-projektu`, `/kontakt`, `/privacy` | 10 (patička) |
| `/uz-se-to-stalo` | 9 |
| `/overit-zpravu` | 6 |
| `/proverit-pujcku`, `/proverit-web` | 5 |
| `/proverit-firmu` | 4 |
| **`/proverit-smlouvu`, `/proverit-investici`** | **2** (jen homepage a O projektu) |

Patička neodkazuje na žádný checker. Navigace mezi checkery je nesouměrná, například ze Zprávy nevede odkaz na Web ani Investici.

## 6. Klíčová slova (bez dat o hledanosti)

Návrh vychází z přirozených formulací a ze skutečných schopností checkerů. Objemy ani obtížnost neuvádím.

**Typ dotazu:**
- **N** = nástrojový: uživatel chce něco ověřit hned;
- **I** = informační: uživatel se chce dozvědět, jak něco poznat.

| Okruh | Hlavní fráze | Vedlejší fráze | Typ | Stránka | Mezera |
|---|---|---|---|---|---|
| A Zprávy | podvodná SMS; jak poznat podvodnou SMS | podvodný e-mail, phishing, falešná SMS od banky, SMS o nedoručeném balíku, „mami, mám nové číslo“, podezřelá zpráva | N + I | `/overit-zpravu` | stránka nevysvětluje znaky podvodné zprávy |
| B Weby a e-shopy | podvodný e-shop; jak poznat podvodný e-shop | ověření webu, je web důvěryhodný, falešný obchod, seznam rizikových e-shopů ČOI | N + I | `/proverit-web` | chybí text o znacích podvodného e-shopu |
| C Firmy | ověření firmy; kontrola IČO | jak prověřit firmu, vyhledat firmu podle IČO nebo názvu, ARES, nespolehlivý plátce DPH | N | `/proverit-firmu` | **chybí description**; minimum textu |
| D Půjčky | podvodná půjčka; jak poznat podvodnou půjčku | půjčka s poplatkem předem, ověření poskytovatele půjčky (ČNB), kolik zaplatím za půjčku | N + I | `/proverit-pujcku` | chybí text o znacích podvodné půjčky |
| E Investice | investiční podvod; jak poznat investiční podvod | garantovaný výnos, kryptoměny podvod, falešný investiční poradce, ověření investiční nabídky | I > N | `/proverit-investici` | málo textu, slabé prolinkování |
| F Smlouvy | kontrola smlouvy před podpisem | na co si dát pozor ve smlouvě, smluvní pokuta, automatické prodloužení smlouvy, výpovědní lhůta | N + I | `/proverit-smlouvu` | málo textu, slabé prolinkování |
| G Obecné | jak poznat podvod; internetové podvody | jak nenaletět podvodníkům, ověření podezřelé nabídky, ochrana před podvody | I | `/` | H1 a titulek bez tématu |
| (H) Po podvodu | naletěl jsem podvodníkovi, co dělat | poslal jsem peníze podvodníkovi, zablokovat kartu, nahlásit podvod | I (akutní) | `/uz-se-to-stalo` | titulek to nevyjadřuje |

**Formulace:** používat jazyk uživatele („Přišla vám podezřelá SMS?“), ne interní pojmy („checker“, „orchestrátor“). Nikdy „ověříme, že nejde o podvod“ ani „bezpečný web“; vždy „varovné signály“ a „co si ověřit“.

## 7. Nálezy podle priority

Detail, rozsah a riziko každé změny jsou ve specifikaci. Zde je jen přehled.

### P0 – kritické
Žádné ověřené. **Vlastník ověří:** `http://verimtomu.fyi/` → 301 na `https://`; `www.verimtomu.fyi` → 301 na hlavní doménu, nebo neexistuje (Cloudflare).

### P1 – vysoká
1. **Titulky** bez problémových slov (např. „Prověřit zprávu · Věřím tomu?“ místo „Podvodná SMS nebo e-mail? …“).
2. **Meta description** chybí na `/proverit-firmu`. Ostatní lze zpřesnit směrem k dotazům.
3. **Krátká statická sekce „Na co si dát pozor“** na každém checkeru (4–6 znaků podvodu z existujících pravidel, bez nových tvrzení).
4. **Prolinkování:** patička se seznamem kontrol; odkazy z „Typických situací“ na příslušné checkery; křížové odkazy mezi checkery.
5. **H1 homepage** s tématem (slogan zůstane jako podnadpis); `/proverit-firmu` doplnit OG a Twitter údaje.

### P2 – střední
1. JSON-LD `WebSite` (a `Organization` pro značku) jen na homepage.
2. Druhý H1 na `/proverit-web` → H2.
3. `og:locale=cs_CZ` všude; `twitter:image` na `/kontakt` a `/o-projektu`.
4. 301 z `/cesta/` na `/cesta` pro známé stránky.
5. Cache pro CSS a JS (`no-cache` s validací, nebo hashování) místo `no-store`.
6. `lastmod` v sitemap (jen skutečná data změn).
7. Jednotný oddělovač v titulcích.

### P3 – budoucí
1. Nanejvýš 5 vzdělávacích stránek navázaných na checkery (spec §6).
2. IndexNow (Seznam a Bing podporují): klíčový soubor a odeslání při release.
