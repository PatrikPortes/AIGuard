# Stage 10 – Google Search Console v administraci (inventura a návrh)

*Stav 2026-10-15: pouze inventura a návrh. Nic není implementováno ani nasazeno.*

- **Produkční základ:** `4ea91103479995b9e80f24df3b5c610d635b9141` (HEAD `release/web-checker-2-2026-10-13`, ověřeno).
- **Cíl:** rozšířit **existující** administraci na `https://staging.verimtomu.fyi` o sekci „SEO & Návštěvnost“. Data budou z Google Search Console pro property `verimtomu.fyi`.
- Veřejný web `https://verimtomu.fyi` se nemění a na Googlu nebude nijak záviset.

**Legenda:**
- ✔ = ověřeno v repozitáři nebo živě;
- ⚠ = **neověřeno** (chybí přístup);
- ℹ = převzato z dokumentace Google, ověří se při implementaci proti aktuální dokumentaci.

---

## 1. Inventura současné administrace

| # | Zjištění | Důkaz |
|---|---|---|
| 1 | **Samostatná aplikace**, oddělená od veřejného webu: Node 24, vlastní `package.json` (jediná závislost `jose`), vlastní Dockerfile a compose | ✔ `admin/package.json`, `admin/Dockerfile`, `admin/compose.yaml` |
| 2 | **Nasazení na stagingu:** `ADMIN_HOSTNAME=staging.verimtomu.fyi`, Access audience `59d367…7456` | ✔ `admin/staging.env.example` |
| 3 | Živě: `https://staging.verimtomu.fyi/` i `/api/dashboard` → **302 na Cloudflare Access login** (`aged-brook-5b74.cloudflareaccess.com`) se stejnou audience | ✔ ověřeno curlem 2026-10-15 |
| 4 | Na VPS existuje kontejner `verimtomu-admin-staging`. Release veřejného webu ho nemění, starý deploy skript jen kontroloval, že zůstal nedotčen. | ✔ `deploy/web-checker/deploy.py:13,71`. `deploy/release/verimtomu-release.sh` admin vůbec nezmiňuje. |
| 5 | `admin.verimtomu.fyi` (původní návrh v README) živě neodpovídá | ✔ (proxy 502). README a `.env.example` jsou zastaralé, platí staging. |
| 6 | Verze kódu skutečně běžící na stagingu | ⚠ **neověřeno**: obsah je za Access. Poslední commity `admin/`: `37855bf` (Access dashboard), `0254e69` (Cloudflare analytics), `a7938eb` (usage counters). |

### 1.1 Autentizace a autorizace
- ✔ `admin/src/access.js`:
  - každý request (HTML, JS, CSS, API i 404) nejdřív ověří `Cf-Access-Jwt-Assertion`;
  - kontroluje RS256 podpis z JWKS issueru, `iss`, `aud`, `exp`, `iat`, `nbf` a `type=app`;
  - JWKS se cachuje s timeoutem a cooldownem;
  - identita se neukládá ani neloguje.
- ✔ `admin/src/config.js`: bez platného issueru a audience aplikace **nenastartuje** (fail-closed).
- ✔ `admin/src/server.js` povoluje jen `GET` a kontroluje hlavičku `Host`. Odpovědi mají vlastní CSP (`script-src 'self'`, `connect-src 'self'`), `no-store` a `frame-ancestors 'none'`.
- Politika Access (kdo smí dovnitř) je v Cloudflare. ✔ `admin/DEPLOYMENT-READINESS.md` popisuje Allow jen pro jeden e-mail a MFA. ⚠ Skutečné nastavení na Cloudflare neověřeno.

### 1.2 Úložiště
- ✔ `admin/src/store.js`: vestavěný `node:sqlite` (`DatabaseSync`), soubor `/data/admin.sqlite` v named volume `admin-data`.
- Tabulky: `cache(key, updated, value JSON)` a nevyužitá `daily_totals`.
- ✔ Usage statistiky veřejné aplikace se čtou jen z read-only exportu `summary.json` (`admin/src/usage.js`, `admin/USAGE-STATS-STAGE-B.md`). Admin nemá přístup k databázím veřejné aplikace.

### 1.3 API
- ✔ Jediné datové API je `GET /api/dashboard` (JSON: `traffic`, `usage`, `ai`, `operations`). Statické soubory jsou `/`, `/app.js` a `/style.css`; vše ostatní vrací 404.

### 1.4 Plánované úlohy
- ✔ V procesu: `setInterval(refresh, 5 min)` pro Cloudflare analytics se zámkem `busy`, při chybě zůstávají stará data označená jako `stale` (`admin/src/server.js`).
- Cron ani externí scheduler není. **Stejný mechanismus stačí i pro denní GSC synchronizaci.**

### 1.5 Docker a deployment
- ✔ `admin/compose.yaml`:
  - read-only root, `cap_drop: ALL`, `no-new-privileges`, limity 192 MB, 0,25 CPU a 64 PID;
  - vlastní bridge síť `172.30.42.0/24`, žádné publikované porty;
  - secret soubory se mountují jednotlivě a read-only (`/run/secrets/…`).
- ✔ `admin/store-analytics-token.sh`: skript pro bezpečné uložení tokenu na VPS (skrytý vstup, `0400`, UID 1000).
- Nasazení stagingu není součástí release skriptu veřejného webu; admin se staví samostatně z `admin/`. ⚠ Přesný postup posledního nasazení stagingu není v repozitáři zdokumentovaný.
- ✔ Dashboard potřebuje odchozí HTTPS (Cloudflare GraphQL, Access JWKS). ⚠ Zda firewall VPS omezuje egress kontejneru `verimtomu-admin-staging`, neověřeno; pro Google bude nutný přístup na 2 hostitele (§5).

### 1.6 Testy a gate
- ✔ `admin/tests/dashboard.test.js` (`node --test` v `admin/`, vyžaduje `npm ci` kvůli `jose`) pokrývá:
  - validaci JWT, fail-closed konfiguraci a SQLite;
  - pevný endpoint a whitelist metrik;
  - ochranu všech cest a stale cache.
- ✔ Release gate veřejného webu admin neobsahuje (`deploy/release/README.md:50–53`). Do jeho image se kopíruje jen `admin/src/usage.js` pro validaci. **Stage 10 se proto nesmí dotknout veřejného image ani jeho gate**, kromě toho, že kořenový `node --test` bude dál procházet.

### 1.7 Závislosti
- ✔ Pro GSC **není potřeba nová závislost**:
  - `jose` umí `importPKCS8` a `SignJWT` (RS256) pro service-account assertion;
  - `fetch`, `AbortSignal.timeout` a `node:sqlite` jsou v Node 24.
- Oficiální knihovnu `googleapis` **nepřidávat**: je velká a pokrývá stovky API, které nepotřebujeme.

---

## 2. Google API – volba a limity

| API | Použití | Limity a pravdivost |
|---|---|---|
| **Search Analytics** `POST https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` ℹ | Kliknutí, zobrazení, CTR a pozice podle `date`, `page`, `query` a `device` | ℹ Data mají zpoždění přibližně 2–3 dny; `dataState: "final"` nebo `"all"` (předběžná). ℹ **Řádky podle dotazů nejsou úplné**: anonymizované (vzácné) dotazy Google vynechává, takže součet podle dotazů < celkový součet. Celky se proto počítají **jen z dimenze `date`**, nikdy ze součtu dotazů. ℹ Dny bez zobrazení Google nevrací (chybějící řádek ≠ chyba). ℹ Historie přibližně 16 měsíců. |
| **URL Inspection** `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` ℹ | Volitelně: stav indexace **jen 11 URL ze sitemap** jednou denně | ℹ Kvóta přibližně 2 000 dotazů za den na property. Ukazuje stav jedné URL, **není** to přehled indexace webu (počty z reportu „Stránky“ API neposkytuje). |
| Sitemaps API | **ne v MVP** | Stav sitemap uvidí vlastník přímo v GSC. |

**Property:** uživatel uvádí, že je přidaná *doména* `verimtomu.fyi`. Pro doménovou property je `siteUrl` = `sc-domain:verimtomu.fyi` ⚠ (ověřit v GSC; u URL-prefix property by to bylo `https://verimtomu.fyi/`). Hodnota bude v konfiguraci, ne v kódu.

**Rozsah volání:** jedna synchronizace denně, nejvýš přibližně 8 volání (date, date×page, date×device a 3 okna dotazů). Při prvním běhu se jednorázově stáhne 180 dní dozadu. Kvóty Google (ℹ v řádu tisíců za minutu) tím využijeme nepatrně.

---

## 3. Autentizace s Googlem – doporučení

| Varianta | Pro | Proti |
|---|---|---|
| **A) Service account** s klíčem JSON, přidaný jako uživatel GSC property | Žádný interaktivní login ani refresh token; přístup jen pro čtení jedné property; jednoduché odvolání (smazání klíče nebo uživatele v GSC); implementace pomocí `jose` bez nových závislostí | Dlouhodobý privátní klíč na VPS (mitigace v §6) |
| B) OAuth 2.0 (uživatelský účet) | Bez klíče SA | Refresh token **uživatelského** Google účtu s plným přístupem k jeho GSC; potřeba OAuth consent screen, redirect URI a jednorázového interaktivního toku na stagingu; token může expirovat (nepublikovaná aplikace má 7denní platnost refresh tokenu ℹ) |

**Doporučení: A) Service account.** Pro jednu property, read-only a serverovou denní synchronizaci je jednodušší a bezpečnější.
- Scope: `https://www.googleapis.com/auth/webmasters.readonly` ℹ.
- Oprávnění v GSC: **Omezené** (Restricted). ℹ Stačí na čtení výkonu; ⚠ u URL Inspection ověřit při prvním dotazu. Pokud by nestačilo, URL Inspection vypustit, ne zvyšovat práva.
- Token se vyměňuje JWT-bearer grantem na `https://oauth2.googleapis.com/token` ℹ. Access token (přibližně 1 h) drží jen paměť procesu, nikdy SQLite ani log.
- Klíč: soubor `/opt/verimtomu/admin-secrets/gsc-service-account.json` (`0400`, UID 1000), mount read-only do `/run/secrets/gsc-service-account.json`. Proměnná `GSC_CREDENTIALS_FILE`.
- Klíč nesmí být v Gitu, HTML, JS, logu ani v odpovědi API. Z JSON se čtou jen `client_email`, `private_key` a `token_uri`, a `token_uri` musí být přesně Google.

---

## 4. Architektura

```
Google Search Console API
        │  (denně, HTTPS, timeout, limit velikosti, pevné hostitele)
        ▼
admin/src/gsc.js  ── auth (jose SignJWT → oauth2 token) ── query(siteUrl, body)
        │
        ▼
admin/src/gsc-sync.js  ── plánovač v procesu (start + každých 24 h, zámek, backoff)
        │  ukládá jen agregace
        ▼
SQLite /data/admin.sqlite (nové tabulky gsc_*)
        │
        ▼
GET /api/seo?days=7|28|90  (za stejným Access JWT jako vše ostatní)
        │
        ▼
admin/public: sekce „SEO & Návštěvnost“ (statické JS a SVG, bez knihoven)
```

**Hranice:**
- Veřejný web, jeho image, release, sitemap, metadata, checkery, AI proxy, ARES ani sdílení se **nemění**.
- Výpadek Google ovlivní jen tuto sekci, která pak ukáže stará data s datem, nebo „nedostupné“.
- Konfigurace je **volitelná**: bez `GSC_CREDENTIALS_FILE` dashboard běží dál a sekce ukáže „Google Search Console zatím není připojeno.“ Access zůstává povinný jako dnes.

---

## 5. Datový model (stávající SQLite, nové tabulky)

```sql
-- Denní celky (jen dimenze date → úplné součty).
CREATE TABLE gsc_daily(day TEXT PRIMARY KEY, clicks INTEGER NOT NULL CHECK(clicks>=0),
  impressions INTEGER NOT NULL CHECK(impressions>=0), position REAL, final INTEGER NOT NULL);
-- Stránky (jen cesta na verimtomu.fyi, nikdy celé URL s parametry).
CREATE TABLE gsc_daily_page(day TEXT, path TEXT, clicks INTEGER, impressions INTEGER, position REAL,
  final INTEGER, PRIMARY KEY(day,path));
-- Zařízení (DESKTOP | MOBILE | TABLET).
CREATE TABLE gsc_daily_device(day TEXT, device TEXT, clicks INTEGER, impressions INTEGER, position REAL,
  final INTEGER, PRIMARY KEY(day,device));
-- Nejčastější dotazy: jen snapshot okna (top 50), ne denní historie.
CREATE TABLE gsc_query_window(days INTEGER, end_day TEXT, query TEXT, clicks INTEGER, impressions INTEGER,
  position REAL, PRIMARY KEY(days,query));
-- Stav synchronizace (bez tajných údajů a bez odpovědí Google).
CREATE TABLE gsc_sync(id INTEGER PRIMARY KEY, started INTEGER, finished INTEGER, status TEXT,
  error TEXT CHECK(error IN ('not_configured','auth','permissions','rate_limited','upstream','invalid_response') OR error IS NULL),
  last_day TEXT);
```

- **CTR se neukládá.** Počítá se z agregací (`clicks / impressions`).
- **Průměrná pozice za období** = Σ(position × impressions) / Σ impressions. Vážený průměr odpovídá výpočtu GSC ℹ.
- **Kontroly:**
  - mapa cest: `/overit-zpravu` → Zpráva, `/proverit-web` → Web, `/proverit-firmu` → Firma, `/proverit-pujcku` → Půjčka, `/proverit-investici` → Investice, `/proverit-smlouvu` → Smlouva;
  - URL z jiného hostitele nebo s parametry se normalizují na cestu, a pokud cesta není ze sitemap, ukládá se jako „ostatní“.
- **Retence:** denní tabulky 16 měsíců (shodně s GSC), okna dotazů se při každé synchronizaci přepisují. Starší řádky se mažou.
- **Osobní údaje:**
  - ukládají se jen agregace z Google, žádná data návštěvníků webu;
  - vyhledávací dotazy jsou agregované a Google vzácné dotazy anonymizuje ℹ;
  - přesto se ukládá jen top 50 na okno, text dotazu se zobrazuje pouze přes `textContent` a nikam dál se neposílá.

---

## 6. Bezpečnost

| Riziko | Řešení |
|---|---|
| Únik klíče SA | Soubor `0400`, UID 1000, jediný read-only mount; nikdy v Gitu, env výpisech, logu ani API. Validace tvaru JSON; chyba zastaví jen GSC, ne dashboard. Výměna klíče každých 90 dní, odvolání smazáním klíče nebo uživatele v GSC. |
| Příliš široká práva | Scope `webmasters.readonly`; GSC role Omezené; SA bez rolí v GCP projektu; projekt bez jiných API |
| Únik access tokenu | Jen v paměti, obnova před expirací, nelogovat. Hlavička `Authorization` jen na pevné hostitele. |
| SSRF a přesměrování | Pevné URL (`oauth2.googleapis.com`, `searchconsole.googleapis.com`), `redirect:'error'`, `token_uri` z JSON musí být přesně Google |
| Neomezené volání API | Jedna synchronizace za 24 h, zámek proti souběhu, nejvýš 8 volání (při backfillu 10), timeout 15 s, limit odpovědi 1 MB, `rowLimit` ≤ 25 000, exponenciální backoff při 429 a 5xx (max. 3 pokusy). **Žádné ruční spouštění z UI v MVP** (admin API zůstává jen GET). |
| Neplatná nebo podvržená data | Validace schématu: čísla ≥ 0, datum `YYYY-MM-DD`, pozice > 0, délka dotazu ≤ 200, zařízení z výčtu. Neplatná odpověď se neuloží (`invalid_response`), zůstanou stará data. |
| XSS přes text dotazu | Jen `textContent` a SVG vytvářené přes DOM, CSP beze změny (`script-src 'self'`) |
| Přístup nepovolaného uživatele | Beze změny: Access a ověření JWT na každém requestu včetně `/api/seo` |
| Vliv na veřejný web | Žádný. Jiný kontejner a síť, nic sdíleného. Veřejný web Google nevolá. |
| Zkreslené závěry | UI vždy uvádí zdroj, datum posledních dat, předběžná data a neúplnost dotazů. Žádné nuly místo chybějících dat. |
| Egress | Admin potřebuje HTTPS na `oauth2.googleapis.com` a `searchconsole.googleapis.com`. Veřejná aplikace a její firewall se nemění. ⚠ Pravidla egress pro admin kontejner ověří vlastník. |

---

## 7. Administrační UI – sekce „SEO & Návštěvnost“

Umístění: nová `<section>` v `admin/public/index.html` za „Přehled návštěvnosti“. Stávající sekce se nemění.

1. **Hlavička:**
   - „Google Search · verimtomu.fyi“;
   - přepínač období **7 / 28 / 90 dní** (tlačítka, `aria-pressed`, výchozí 28);
   - „Data do: <poslední den>“, „Aktualizováno: <čas synchronizace>“ a štítek „Předběžná data“, pokud období obsahuje nefinální dny.
2. **Čtyři ukazatele:**
   - Kliknutí, Zobrazení, Průměrné CTR, Průměrná pozice;
   - každý se změnou proti předchozímu stejně dlouhému období (absolutně i relativně, šipka a text, ne jen barva);
   - u pozice je menší číslo lepší a text to říká.
3. **Graf vývoje:**
   - denní kliknutí a zobrazení jako SVG čára;
   - dny bez řádku od Google jako mezera s legendou „Google pro den nevrátil data“;
   - pod grafem vždy přístupná tabulka (`<details>` „Zobrazit data v tabulce“).
4. **Výkon kontrol:** tabulka 6 kontrol (kliknutí, zobrazení, CTR, pozice) a řádek „Ostatní stránky“.
5. **Nejvýkonnější stránky:** top 10 cest.
6. **Nejčastější dotazy:** top 20 s poznámkou „Google neuvádí všechny dotazy (vzácné dotazy anonymizuje). Součet se proto neshoduje s celkem.“
7. **Zařízení** (volitelné): mobil, desktop a tablet.
8. **Stavy:**
   - nepřipojeno → „Google Search Console zatím není připojeno.“;
   - synchronizace OK, ale bez řádků → **„Google zatím neposkytuje dostatek dat.“**;
   - chyba → stará data se štítkem „Poslední synchronizace se nepodařila (důvod)“ nebo „Data nejsou dostupná“.

**Přístupnost a responzivita:**
- sémantické tabulky s `<caption>`, nadpisy H2 a H3;
- kontrast ≥ 7:1 podle stávajícího stylu;
- cíle ≥ 48 px;
- na 320 px se ukazatele řadí pod sebe a tabulky se posouvají vodorovně uvnitř kontejneru;
- bez animací;
- čísla formátovaná `Intl.NumberFormat('cs-CZ')`.

**API:** `GET /api/seo?days=7|28|90` → `{status, configured, lastSync:{finished,status,error}, lastDay, final, period:{from,to,clicks,impressions,ctr,position}, previous:{…}, daily:[{day,clicks,impressions}|{day,missing:true}], checkers:[…], pages:[…], queries:[…], devices:[…]}`. Jiná hodnota `days` → 400. Odpověď se počítá ze SQLite; Google se nevolá.

---

## 8. Etapy implementace a acceptance criteria

| Etapa | Obsah | Acceptance criteria |
|---|---|---|
| **S10.1** Klient GSC a auth | `admin/src/gsc.js`: načtení a validace klíče, `SignJWT` RS256 → token, `query()` s pevnými URL, timeout, limitem velikosti a mapováním chyb; `config.js`: volitelné `GSC_CREDENTIALS_FILE` a `GSC_SITE_URL` | Bez konfigurace dashboard startuje a GSC hlásí `not_configured`. Neplatný klíč zastaví jen GSC. Žádné volání mimo 2 hostitele. Token ani klíč se nikdy neobjeví v logu, chybě ani API (test). Mapování 401, 403, 429 a 5xx. Bez nových závislostí. |
| **S10.2** Synchronizace a úložiště | `admin/src/gsc-sync.js` a tabulky §5: plánovač (start a 24 h), zámek, backfill 180 dní, validace, retence a stav | Nejvýš 10 volání za běh; souběh nemožný; neplatná odpověď nepřepíše platná data; opakovaný běh je idempotentní (upsert); dny bez řádků se neukládají jako 0; při chybě status a důvod bez detailů odpovědi. |
| **S10.3** API | `GET /api/seo` v `server.js`: období, porovnání, vážená pozice, CTR z agregací, kontroly, stránky, dotazy, zařízení | Za JWT (403 bez něj); jen GET; `days` jen 7, 28 nebo 90; součty sedí s ručně spočítanou fixturou; „nedostatek dat“ při 0 řádcích; žádné volání Google při requestu. |
| **S10.4** UI | sekce v `index.html`, `app.js`, `style.css` | Všechny stavy textem; graf má tabulkovou alternativu; ovládání klávesnicí; 320, 375, 430 a 1280 px bez přetečení; cíle ≥ 48 px; žádné nové externí zdroje; CSP beze změny; stávající sekce nedotčené. |
| **S10.5** (volitelné) URL Inspection | 11 URL ze sitemap jednou denně | Nejvýš 11 volání za den; při 403 se funkce vypne (bez eskalace práv); UI ji označí jako „stav jednotlivých URL, ne přehled indexace“. |
| **S10.6** Nasazení stagingu | runbook a skript pro uložení klíče (`store-gsc-key.sh` podle vzoru `store-analytics-token.sh`), compose mount, env | Kontejner jen s novým read-only mountem a 2 env; staging bez JWT dál 403 nebo 302; po přihlášení se sekce zobrazí. Veřejný web, jeho image a release skript beze změny. |

---

## 9. Testovací plán

- **Unit testy (`admin/tests/*.test.js`, `npm test` v `admin/`)** s mockovaným `fetch` a lokálním RSA klíčem:
  - podpis assertion (`iss`, `scope`, `aud`, `exp` ≤ 1 h) a výměna tokenu;
  - pevné hostitele a `redirect:'error'`;
  - timeout a limit velikosti;
  - mapování chyb a backoff;
  - validace odpovědí a fixtury s anonymizovanými dotazy (součet dotazů < celek);
  - chybějící dny;
  - vážená pozice a CTR;
  - porovnání období přes hranici roku;
  - retence, idempotence a zámek;
  - API stavy (`not_configured`, prázdno, `stale`, chyba) a validace parametru;
  - **regexový test, že klíč ani token nejsou v žádném výstupu**.
- **Stávající testy admin** (JWT, config, cache, ochrana cest) beze změny PASS.
- **Browser:** skript se serverem dashboardu, lokálním JWKS (jako v unit testu) a fixturou SQLite: všechny stavy, přepínač období, klávesnice, šířky, tabulka grafu, žádné externí requesty.
- **Docker:** build `admin/Dockerfile` (linux/amd64), kontejner read-only a bez sítě: start bez GSC konfigurace OK, všechny cesty bez JWT 403.
- **Veřejný web:** kořenový `npm test` a release gate (511) beze změny; `git diff` mimo `admin/` a `docs/` prázdný.
- **Na stagingu (vlastník a review):** jedna synchronizace se skutečným klíčem, kontrola čísel proti GSC UI za stejné období (tolerance kvůli zpoždění dat), ověření 403 bez Access.

---

## 10. Kroky vlastníka projektu (ručně, mimo repozitář)

1. **Google Cloud Console** (účet, který vlastní GSC property):
   1. Vytvořit projekt, např. `verimtomu-search-console` (bez fakturace).
   2. APIs & Services → Library → **Google Search Console API** → Enable.
   3. IAM & Admin → Service Accounts → Create:
      - název `verimtomu-gsc-reader`;
      - **bez rolí v projektu** (krok „Grant access“ přeskočit).
   4. Service account → Keys → Add key → JSON.
      - Soubor se stáhne jen jednou. Neposílat e-mailem, chatem ani do Gitu.
      - ℹ Pokud organizační politika zakazuje klíče (`iam.disableServiceAccountKeyCreation`), dejte vědět; navrhnu variantu B.
2. **Google Search Console:**
   1. Property `verimtomu.fyi` → Nastavení → Uživatelé a oprávnění → Přidat uživatele: e-mail service accountu (`…@…iam.gserviceaccount.com`), oprávnění **Omezené**.
   2. Ověřit typ property: doménová → `GSC_SITE_URL=sc-domain:verimtomu.fyi`; URL prefix → `https://verimtomu.fyi/`.
3. **VPS** (po implementaci S10.6, jako root, interaktivně):
   1. uložit JSON připraveným skriptem do `/opt/verimtomu/admin-secrets/gsc-service-account.json` (`0400`, vlastník 1000);
   2. smazat stažený soubor z počítače, nebo ho uložit do správce hesel.
4. **Síť:** ověřit, že kontejner `verimtomu-admin-staging` smí odchozí HTTPS na `oauth2.googleapis.com` a `searchconsole.googleapis.com` (pokud je egress omezen). Ostatní pravidla neměnit.
5. **Nasazení stagingu:**
   - schválit build `admin/` a přidat jediný read-only mount klíče a 2 env proměnné (`GSC_CREDENTIALS_FILE`, `GSC_SITE_URL`);
   - Access, AUD i ostatní mounty ponechat.
6. **Údržba:**
   - klíč obměnit do 90 dní (Keys → Add key, uložit, smazat starý);
   - při podezření na únik ihned smazat klíč nebo odebrat uživatele v GSC.
