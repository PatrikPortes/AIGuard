# Stage 11 – redesign admin dashboardu (karty)

- **Datum:** 2026-10-15
- **Větev:** `feat/stage11-admin-tabs`, navazuje na `fix/stage10-gsc-sync` @ `84d8910`, tedy na Stage 10 včetně opravy synchronizace `6fcf04a`.
- **Commity:**
  - `5e05a20`: UI;
  - `0ca8559`: testy, z tohoto commitu se staví image;
  - commit s nasazením: tento dokument a skript.
- **Rozsah:** jen `admin/public/*`, testy, nasazovací skript a dokumentace. API, databáze, server, CSP, Cloudflare Access, OAuth ani veřejný web se nemění.

## 1. Inventura původního UI
| Sekce | Obsah | Nové umístění |
|---|---|---|
| Přehled návštěvnosti (`#traffic`) | 4 počty HTTP požadavků (24 h / 7 dní, z toho blokované), poznámky, čas aktualizace; patička o vzorkování | karta **Cloudflare**; počty jako 4 dlaždice, poznámka o vzorkování v kartě |
| SEO & Návštěvnost (`#seo`) | období 7/28/90, ukazatele, graf, kontroly, stránky, dotazy, zařízení | karta **Google**, beze změny (Stage 10) |
| Používání aplikace (`#usage`) | tabulka dnes/7/30 dní, denní graf 30 dní, poznámky | karta **Dokončená ověření** (výchozí) |
| AI statistiky (`#ai-usage`) | AI kontroly dnes a za 7 dní, náhradní vyhodnocení | karta **AI** |
| Provozní stav (`#operations`) a stav načtení (`#notice`) | dashboard odpovídá, doba běhu; stav veřejné aplikace a tunelu „data zatím nejsou dostupná“ | **stavový řádek** |

Žádná metrika ani text nezmizel a žádná nová metrika nepřibyla. Stavový řádek ukazuje jen stavy, které API už vrací:
- `traffic.status`: Cloudflare aktuální / neobnovuje se / nedostupné;
- `usage.status`: ověření aktuální / neobnovuje se / nedostupné;
- stav `/api/seo`: Google aktuální / probíhá synchronizace / bez dat / nepřipojeno / poslední synchronizace selhala.

## 2. Rozložení
- Shora: hlavička, stavový řádek (`role=status`, `aria-live=polite`), lišta karet a panel vybrané karty.
- **Karty** podle vzoru WAI-ARIA Tabs:
  - `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`, roving `tabindex`;
  - šipky vlevo a vpravo (s přetočením), Home a End, automatická aktivace;
  - Tab přejde z lišty do panelu;
  - výrazný focus (obrys 3 px).
- **Přepínání** bez obnovení stránky. Vybraná karta je v URL (`#cloudflare`, `#google`, `#overeni`, `#ai`), takže odkaz otevře správnou kartu; neznámý fragment vede na výchozí kartu „Dokončená ověření“.
- **Aktivní karta** je vyplněná barvou `#4435b7` s tmavým podtržením, neaktivní jsou obrysové. Barvy, písmo a karty mají původní identitu.
- **Responzivita:**
  - desktop a tablet: 4 karty v řadě;
  - telefon (do 520 px): mřížka 2×2;
  - Cloudflare dlaždice 4 / 2 / 1 sloupec;
  - cíle o velikosti alespoň 48 px, bez vodorovného posunu stránky.
- Všechna data se načítají jako dosud: `/api/dashboard` po minutě, `/api/seo` po 5 minutách. Synchronizace GSC běží na serveru beze změny.

## 3. Testy
| Test | Výsledek |
|---|---|
| Unit testy adminu (Node 22 lokálně, Node 24 v image při `build`) | **39/39 PASS**: 37 předchozích a 2 nové v `tests/admin-tabs.test.js` (pořadí a propojení karet, výchozí karta, zachované sekce a poznámky, žádný inline kód ani styl, DOM jen přes `textContent`) |
| `scripts/tabs-browser.js` (Chromium) | **PASS, 10 kontrol**: ARIA, výchozí karta, obsah jen dané karty, stavový řádek, bez reloadu, zvýraznění, klávesnice a focus, odkazy s `#`, období GSC v kartě Google, 320/375/768/1280 px bez přetečení, cíle ≥ 48 px, stavy bez dat bez vymyšlených čísel, bez externích požadavků a CSP chyb, bez JWT 403 |
| `scripts/seo-browser.js` (Chromium) | **PASS, 10 kontrol** (upraveno: otevírá kartu Google) |
| Simulace VPS (stav jako teď: běží `6fcf04a`, zastavené `-prev` a `-pre10`) | `preflight`, `build` (39/39 v image), `upgrade`, `verify` (konfigurace, Access, tunel 403, log bez tajemství, produkce beze změny, 21 MB RAM). `rollback-upgrade` vrátil `6fcf04a`, `rollback` vrátil `pre-stage10`. Synchronizace s Googlem v sandboxu nejde (bez egressu) a na VPS ji ověří `verify`. |

Kořenová brána repozitáře se netýká: z `admin/` se do veřejného image kopíruje jen `admin/src/usage.js`, a ten se nezměnil.

## 4. Nasazení jen do staging administrace
Na VPS jako root, v checkoutu použitém pro Stage 10:
```
cd /root/verimtomu-stage10
git fetch origin feat/stage11-admin-tabs && git checkout --detach FETCH_HEAD
bash admin/stage10-staging.sh preflight   # info: pre10 a prev existují → upgrade
bash admin/stage10-staging.sh build       # verimtomu-admin:stage10-0ca8559, 39/39 testů v image
bash admin/stage10-staging.sh upgrade     # běžící 6fcf04a zůstane zastavený jako verimtomu-admin-staging-prev
bash admin/stage10-staging.sh verify      # vše OK včetně „Search Console synchronizace: ok …“
```
Pak v prohlížeči přes Access otevřete https://staging.verimtomu.fyi a zkontrolujte:
- výchozí kartu „Dokončená ověření“;
- přepínání čtyř karet a stavový řádek;
- kartu Google s daty.

**Rollback:**
- `bash admin/stage10-staging.sh rollback-upgrade` vrátí Stage 10 (`6fcf04a`);
- `bash admin/stage10-staging.sh rollback` vrátí `pre-stage10`;
- při chybném startu se `upgrade` vrátí sám.
Data ani token se nemění, protože jde jen o UI.
