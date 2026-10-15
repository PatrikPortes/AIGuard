# SEO optimalizace – návrh implementace

*Stav 2026-10-15: návrh. Nic není implementováno. Podklad: `docs/reviews/SEO_AUDIT_2026.md` (revize `dfd7c4f`, živý web ověřen).*

## 0. Zásady

- **SEO nesmí změnit funkci checkerů.** Beze změny zůstávají: algoritmy, API, ARES relay, AI, limity, zpracování dat, CSP, cookies, analytika.
- **Pravdivost:**
  - Nikdy „ověříme, že nejde o podvod“, „bezpečný web“ ani „garantovaně“.
  - Vždy „varovné signály“, „co si ověřit“, „pomůže rozpoznat“.
  - Žádná falešná hodnocení, recenze, certifikace ani autorita.
  - Všechny nové texty musí projít `isSafeCopy`.
- **Žádné citlivé údaje** v URL ani v metadatech. Žádné nové parametry.
- **Žádný nový tracking.** Měření vyhledávání jen přes nástroje vyhledávačů (Search Console, Seznam Webmaster), které na web nic nepřidávají.
- Stará F5a a release Stage 8 se nemění. SEO půjde na vlastní větev z aktuální produkce.

## 1. Návrhy po stránkách (P1)

Délky: title ≤ 60 znaků, description přibližně 120–155 znaků. Oddělovač značky ` | Věřím tomu?` (P2-7).

### `/` (homepage)
- **Title:** ~~Věřím tomu? — Radši ověřit než litovat.~~ → **„Jak poznat podvod? Prověřte zprávu i web | Věřím tomu?“**
- **Description:** → „Přišla vám podezřelá SMS, e-mail nebo nabídka? Prověřte zprávu, e-shop, firmu, půjčku, investici nebo smlouvu a zjistěte, co si ověřit.“
- **Hlavní fráze:** jak poznat podvod. **Související:** internetové podvody, ověření podezřelé nabídky.
- **H1:** „Jak poznat podvod dřív, než zaplatíte“. Slogan „Radši ověřit než litovat.“ zůstane jako podnadpis (beze změny designu).
- **H2:** beze změny (S čím vám můžeme pomoci? / Už se to stalo? / Typické situace / Jak to funguje / Co umíme a co neumíme).
- **Odkazy:**
  - „Investice s jistým výnosem“ → `/proverit-investici`;
  - „Půjčka pro každého“ → `/proverit-pujcku`;
  - zprávové situace (banka, balík, nové číslo, nová známost) → `/overit-zpravu`;
  - „Nedoplatek nebo faktura“ → `/overit-zpravu` (a zmínka o `/proverit-firmu`).

### `/overit-zpravu`
- **Title:** → **„Podvodná SMS nebo e-mail? Prověřte zprávu | Věřím tomu?“**
- **Description:** → „Přišla vám podezřelá SMS, e-mail nebo zpráva od „banky“ či dopravce? Ukážeme varovné signály a poradíme, jak požadavek bezpečně ověřit.“
- **Hlavní:** podvodná SMS. **Související:** podvodný e-mail, phishing, falešná SMS od banky, SMS o balíku, „mami, mám nové číslo“.
- **H1:** „Prověřit podezřelou zprávu“.
- **H2:** „Na co si dát pozor u podezřelé zprávy“ (nová statická sekce, §3), „Co jsme zjistili“ (výsledek, beze změny).
- **Odkazy:** `/proverit-web` (odkaz ve zprávě), `/proverit-firmu`, `/uz-se-to-stalo`.

### `/proverit-web`
- **Title:** → **„Podvodný e-shop? Prověřte web před nákupem | Věřím tomu?“**
- **Description:** → „Než zaplatíte v neznámém e-shopu, prověřte adresu webu a seznam rizikových e-shopů ČOI. Ukážeme varovné signály a co si ověřit.“
- **Hlavní:** podvodný e-shop. **Související:** jak poznat podvodný e-shop, ověření webu, je web důvěryhodný, ČOI rizikové e-shopy.
- **H1:** „Prověřit web nebo e-shop“. Skrytý H1 „Co jsme zjistili“ → **H2** (P2-2).
- **H2:** „Na co si dát pozor u neznámého e-shopu“.
- **Odkazy:** `/proverit-firmu` (IČO provozovatele), `/overit-zpravu`.

### `/proverit-firmu`
- **Title:** → **„Ověření firmy podle IČO nebo názvu | Věřím tomu?“**
- **Description (chybí):** → „Prověřte firmu podle IČO nebo názvu ve veřejných registrech ARES a DPH. Ukážeme vybrané údaje a varovné signály, například zánik nebo insolvenci.“
- **Hlavní:** ověření firmy. **Související:** kontrola IČO, jak prověřit firmu, vyhledat firmu podle názvu, nespolehlivý plátce DPH.
- **Doplnit:** OG a Twitter údaje podle ostatních stránek (`og:url` = canonical).
- **H1:** „Prověřit firmu“ (ponechat). **H2:** „Na co si dát pozor u neznámé firmy“.
- **Odkazy:** `/proverit-web`, `/overit-zpravu` (už je), `/proverit-smlouvu`.

### `/proverit-pujcku`
- **Title:** → **„Podvodná půjčka? Prověřte nabídku a náklady | Věřím tomu?“**
- **Description:** → „Chce poskytovatel poplatek předem nebo slibuje jisté schválení? Spočítejte náklady půjčky a prověřte varovné signály v nabídce.“
- **Hlavní:** podvodná půjčka. **Související:** půjčka s poplatkem předem, ověření poskytovatele půjčky (ČNB), kolik zaplatím za půjčku.
- **H1:** „Prověřit nabídku půjčky“ (ponechat). **H2:** stávající a k tomu „Na co si dát pozor u nabídky půjčky“.
- **Odkazy:** `/proverit-firmu`, `/proverit-smlouvu`.

### `/proverit-investici`
- **Title:** → **„Investiční podvod? Prověřte nabídku | Věřím tomu?“**
- **Description:** → „Slibuje nabídka garantovaný výnos nebo spěchá s platbou? Prověřte investiční nabídku a zjistěte, co si ověřit u ČNB. Text zůstane ve vašem prohlížeči.“
- **Hlavní:** investiční podvod. **Související:** jak poznat investiční podvod, garantovaný výnos, kryptoměny podvod, ověření investiční nabídky.
- **H1:** „Prověřit investiční nabídku“. **H2:** „Než pošlete peníze“ (stávající) a „Typické znaky investičního podvodu“.
- **Odkazy:** `/proverit-firmu`, `/proverit-web`, `/uz-se-to-stalo`.

### `/proverit-smlouvu`
- **Title:** → **„Kontrola smlouvy před podpisem | Věřím tomu?“**
- **Description:** → „Na co si dát pozor ve smlouvě? Najdeme místa jako smluvní pokuty, automatické prodloužení nebo výpovědní lhůty. Text zůstane ve vašem prohlížeči.“
- **Hlavní:** kontrola smlouvy. **Související:** na co si dát pozor ve smlouvě, smluvní pokuta, automatické prodloužení smlouvy.
  - Tvrzení musí odpovídat existujícím kategoriím pravidel; ověří se při implementaci proti `DEFINITIONS` v `contract-core.js`.
- **H1:** „Prověřit smlouvu před podpisem“. **H2:** stávající.
- **Odkazy:** `/proverit-firmu`, `/proverit-pujcku`.

### `/uz-se-to-stalo`
- **Title:** → **„Naletěli jste podvodníkům? Co udělat hned | Věřím tomu?“**
- **Description:** → „Poslali jste peníze, sdělili údaje nebo povolili přístup do zařízení? Praktické kroky, co udělat hned: banka, policie, hesla a důkazy.“
- **Hlavní:** naletěl jsem podvodníkovi, co dělat. **H1, H2:** ponechat.
- **Odkazy:** beze změny. Stránka má přísný test M9 bez externích zdrojů a skriptů a ten zůstává.

### `/o-projektu`, `/kontakt`, `/privacy`
- Ponechat (nejsou cílem vyhledávání). Jen P2-3: `twitter:image` na `/o-projektu` a `/kontakt` a jednotný oddělovač.

## 2. Prolinkování (P1)

1. **Patička** (stejná na všech stránkách, Stage 7 komponenta): přidat řádek „Kontroly“ se 6 odkazy (Zpráva, Web, Firma, Půjčka, Investice, Smlouva) a „Už se to stalo?“.
   - Každý checker tím získá aspoň 11 příchozích odkazů.
   - Upravit `tests/stage7-trust.test.js` (stejná patička) a `tests/m9.test.js` (povolené cíle odkazů na `/uz-se-to-stalo`).
2. **Homepage „Typické situace“:** každá karta odkazuje na příslušný checker.
3. **Křížové odkazy** v nové sekci „Na co si dát pozor“ (§3): 1–2 relevantní checkery.
4. **Anchor texty** popisné („prověřit firmu podle IČO“), ne „klikněte zde“.

## 3. Sekce „Na co si dát pozor“ na checkerech (P1)

- **Forma:** statický HTML blok pod formulářem (pod výsledkem, aby neposouval hlavní akci). `<h2>` a `<ul>` se 4–6 body, 80–150 slov, bez JS.
- **Obsah** pouze z existujících pravidel a textů projektu (žádná nová tvrzení):

| Checker | Body (zdroj) |
|---|---|
| Zpráva | nátlak a krátký termín; žádost o hesla, PIN nebo kódy; odkaz na přihlášení; nové číslo „blízkého“; platba na neznámý účet; jak ověřit jinou cestou (pravidla `analysis.js`, homepage „Typické situace“) |
| Web | koupě jen přes neznámý web; podezřelá adresa (IDN, číselná, bez HTTPS); seznam rizikových e-shopů ČOI; chybějící IČO a kontakty; platba předem převodem (`WEB_COPY`, ČOI) |
| Firma | zaniklá firma, insolvence, nespolehlivý plátce DPH, krátká historie; zápis v ARES není záruka (`firm-rules.js`) |
| Půjčka | poplatek předem; jisté schválení „pro každého“; nátlak; ověření poskytovatele u ČNB (pravidla půjčky, kalkulačka) |
| Investice | garantovaný nebo vysoký výnos; nátlak a časový limit; kryptoměny a „poradce“; platba na osobní účet; ověření u ČNB (`investment-rules.js`) |
| Smlouva | smluvní pokuty, automatické prodloužení, výpovědní lhůty, jednostranné změny (kategorie `DEFINITIONS`: penalty, auto_renewal, notice_period, unilateral_change, fees) |

- **Rozsah:** 6 HTML souborů a malé CSS. **Riziko:** nízké.
  - Fold testy kontrolují první akci nad okrajem; sekce bude pod formulářem.
  - Browser testy s přesnými H2 je potřeba ověřit.
  - Texty projdou `isSafeCopy`.

## 4. Technické SEO

| ID | Změna | Přínos | Rozsah | Riziko |
|---|---|---|---|---|
| P2-1 | **JSON-LD na homepage:** `WebSite` (`name`, `alternateName`, `url`, `inLanguage: cs`, `publisher`) a `Organization` nebo `Person` (Patrik Porteš, značka GrowMate, `url`, `email` jen pokud chcete). **Bez** `aggregateRating`, `Review`, `FAQPage` (Google FAQ výsledky pro tento typ webu neukazuje), `HowTo` (vyřazeno) a `SoftwareApplication` (bez hodnocení nemá výsledek). | název webu ve výsledcích, jasná identita | `index.html` | Nízké. Datový blok `<script type="application/ld+json">` CSP neblokuje ani nespouští. Na homepage žádný test „bez inline skriptu“ není; na checkerech, `/o-projektu`, `/kontakt` a `/uz-se-to-stalo` takové testy jsou, proto **jen homepage**. Strict gate ověřit. |
| P2-2 | `/proverit-web`: druhý H1 → H2 | jeden H1 na stránku | `web.html` a selektory v `web-checker.js` a testech | Nízké. Ověřit focus a nadpis v browser testech. |
| P2-3 | `og:locale=cs_CZ` všude; `twitter:image` na `/o-projektu` a `/kontakt`; plná sada OG na `/proverit-firmu` (P1) | konzistentní náhledy | HTML | Velmi nízké. Upravit testy M9 a Stage 7, které vyjmenovávají povolené `<meta>`. |
| P2-4 | **301** `/<známá-cesta>/` → `/<známá-cesta>` (jen cesty z `assets` mapy, bez query) | žádné ztracené odkazy s lomítkem | `src/server.js` (statický routing) | Nízké. Netýká se `/api/`. Test na redirect a na zachovaný 404 u neznámých cest. |
| P2-5 | CSS a JS moduly: `Cache-Control: no-cache` (s ETag nebo Last-Modified) místo `no-store`; HTML ponechat `no-store` | rychlejší opakované návštěvy | `src/server.js` (statické hlavičky) | Střední: riziko nekonzistence verzí modulů po deployi. Proto `no-cache` (vždy revalidace), ne `max-age`. Alternativa: odložit. |
| P2-6 | `lastmod` v sitemap (jen skutečná data, aktualizovat při release) | rychlejší přeprocházení změn | `sitemap.xml` a release checklist | Nízké. Falešný `lastmod` škodí, proto ruční nebo z gitu. |
| P2-7 | Jednotný oddělovač ` \| Věřím tomu?` | konzistence | HTML | Velmi nízké |
| — | `robots.txt` | — | **beze změny** (správně) | — |
| — | canonical | — | **beze změny** (self-canonical je správně; jen doplnit OG na Firmě) | — |
| — | URL parametry | — | **beze změny**: canonical bez parametrů pokrývá `utm_*`; aplikace žádné parametry nepoužívá | — |
| — | `hreflang` | — | nepotřebné (jeden jazyk) | — |
| — | Mobilní zobrazení a výkon | — | bez nálezů (CLS 0, LCP do 1,3 s laboratorně, žádné přetečení) | — |

## 5. Ověření po implementaci

- Unit testy:
  - každá stránka má 1 H1, title ≤ 60, description 100–160 a `og:url` = canonical;
  - všechny nové texty projdou `isSafeCopy`;
  - sitemap = canonicaly;
  - JSON-LD jen na homepage, jen povolené typy, bez rating a review.
- Browser: stávající regresní sady (fold, focus, 48 px, Stage 3–8), `responsive-review`, `frontend` shodný s produkcí.
- Živý web po nasazení:
  - Rich Results Test a Schema Markup Validator pro homepage;
  - kontrola URL v Search Console;
  - `curl` na 301 s lomítkem.
- `npm test`, `npm run check`, strict gate, Docker gate.

## 6. Obsahové SEO – nanejvýš 5 témat (P3, zatím nevytvářet)

Každé téma je krátká stránka (přibližně 600–900 slov) psaná pro lidi. Na konci má odkaz na příslušný checker a na `/uz-se-to-stalo`. Žádné hromadné generování.

| # | Téma (návrh URL) | Proč | Vazba |
|---|---|---|---|
| 1 | **Jak poznat podvodnou SMS a e-mail** (`/jak-poznat-podvodnou-sms`) | nejčastější situace; homepage ukazuje scénáře banka, balík, nové číslo | `/overit-zpravu` |
| 2 | **Jak poznat podvodný e-shop** (`/jak-poznat-podvodny-eshop`) | silný informační dotaz před nákupem; ČOI seznam | `/proverit-web`, `/proverit-firmu` |
| 3 | **Znaky investičního podvodu** (`/investicni-podvod`) | vysoké škody; ČNB upozornění | `/proverit-investici` |
| 4 | **Na co si dát pozor před sjednáním půjčky** (`/podvodna-pujcka`) | poplatek předem, ČNB, výpočet nákladů | `/proverit-pujcku` |
| 5 | **Naletěl jsem podvodníkovi – co teď** | **existuje** jako `/uz-se-to-stalo`; jen zlepšit title a description (P1), novou stránku nevytvářet | `/uz-se-to-stalo` |

Nová URL v bodech 1–4 vyžadují statický whitelist, sitemap a patičku. Doporučuji nejdřív P1 sekce „Na co si dát pozor“; články až podle dat ze Search Console.

## 7. Google, Seznam, Bing – postup

### A. Musí provést vlastník (mimo repozitář)
1. **Google Search Console:**
   - doménová vlastnost `verimtomu.fyi` s ověřením přes **DNS TXT v Cloudflare** (bez souboru a bez meta tagu v repozitáři);
   - odeslat `https://verimtomu.fyi/sitemap.xml`;
   - v „Kontrole URL“ požádat o indexaci homepage a šesti checkerů;
   - sledovat „Stránky“ (pokrytí), „Výkon“ (dotazy, CTR, pozice), „Core Web Vitals“ (terénní data) a „HTTPS“.
2. **Seznam Webmaster** (`webmaster.seznam.cz`):
   - přidat web; ověření jedním z nabízených způsobů. Preferovat ten, který nevyžaduje změnu aplikace. Pokud nabídne jen soubor nebo meta tag, připravím ho v repozitáři (statický soubor, bez skriptu a bez cookies);
   - odeslat sitemap a sledovat indexaci.
3. **Bing Webmaster Tools:** import webu ze Search Console (bez dalšího ověření), odeslat sitemap. Přínos v ČR je menší, ale náklad nulový a Bing data využívají i jiné vyhledávače.
4. **Cloudflare:**
   - ověřit „Always Use HTTPS“ (http → https 301);
   - ověřit, že `www` buď neexistuje, nebo přesměrovává 301 na hlavní doménu;
   - ponechat bez Rocket Loaderu a bez přidaných skriptů.
5. **Kontrola problémů s procházením:** Search Console „Stránky“ a „Statistiky procházení“; Seznam Webmaster „Indexace“; po každém release jednou „Kontrola URL“ změněných stránek.
6. **Sledování návštěv bez nového trackingu:** dotazy a kliknutí z vyhledávání ukážou Search Console a Seznam Webmaster (server-side data vyhledávačů). Stávající Cloudflare Web Analytics na `/` a `/privacy` zůstává beze změny. **Nic nového nepřidávat.**

### B. Změny v repozitáři
- P1 a P2 z této specifikace.
- Případný ověřovací soubor pro Seznam (jen pokud DNS nejde).
- P3 volitelně: IndexNow klíč `/<key>.txt` a odeslání URL při release. Seznam i Bing IndexNow podporují; Google ne.

## 8. Implementační plán

| Krok | Obsah | Odhad |
|---|---|---|
| **SEO-1 (P1)** | title a description všech checkerů a homepage; OG a description `/proverit-firmu`; H1 homepage | 0,5 dne |
| **SEO-2 (P1)** | sekce „Na co si dát pozor“ na 6 checkerech; patička s kontrolami; odkazy z „Typických situací“ | 1 den |
| **SEO-3 (P2)** | JSON-LD na homepage; H1 → H2 na Webu; `og:locale`, `twitter:image`; 301 s lomítkem; `lastmod`; oddělovač | 0,5 dne |
| **SEO-4 (P2, volitelné)** | cache CSS a JS (`no-cache`) | 0,25 dne + review |
| **Vlastník** | Search Console, Seznam Webmaster, Bing, Cloudflare kontrola | po nasazení SEO-1 |
| **SEO-5 (P3)** | 1–4 vzdělávací stránky podle dat ze Search Console; IndexNow | později |

Každý krok bude mít vlastní větev z aktuální produkce, plné testy a review dokument. Nic se nemerguje ani nenasazuje bez schválení.
