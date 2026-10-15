# Stage 10 – Google Search Console v administraci: review a runbook nasazení

- **Datum:** 2026-10-15
- **Větev:** `feat/stage10-gsc-dashboard` (navazuje na schválený návrh `79e8157`, základ produkce `4ea9110`)
- **Specifikace:** `docs/specs/STAGE10_GSC_DASHBOARD.md`
- **Rozsah:** S10.1–S10.4 implementace a S10.6 příprava nasazení. S10.5 (URL Inspection) podle zadání vynecháno.
- Nic nebylo mergováno ani nasazeno. Žádný skutečný Google klíč nebyl použit ani vyžádán.

## Verdikt
**GO pro nasazení na staging** po krocích vlastníka (§4). Kritické ani vysoké nálezy nejsou.

## 1. Změny (jen `admin/` a `docs/`)

| Soubor | Obsah |
|---|---|
| `admin/src/gsc.js` | S10.1 klient GSC: service account (JWT bearer přes `jose`), scope `webmasters.readonly`, pevné hostitele `oauth2.googleapis.com` a `searchconsole.googleapis.com`, `redirect:'error'`, timeout 15 s, limit odpovědi (token 64 kB, data 1 MB), krátké kódy chyb |
| `admin/src/gsc-store.js` | S10.2 tabulky `gsc_*` v existující `admin.sqlite`, atomický přepis rozsahu, retence přibližně 16 měsíců, log synchronizací (posledních 60) |
| `admin/src/gsc-sync.js` | S10.2 synchronizace a plánovač (detail níže) |
| `admin/src/gsc-report.js` | S10.3 report z SQLite |
| `admin/src/server.js`, `config.js` | S10.3 `GET /api/seo?days=7\|28\|90` za stávajícím Access JWT; volitelná konfigurace `GSC_CREDENTIALS_FILE` a `GSC_SITE_URL` |
| `admin/public/index.html`, `app.js`, `style.css` | S10.4 sekce „SEO & Návštěvnost“ |
| `admin/compose.yaml`, `staging.env.example` | S10.6 zakomentovaný read-only mount klíče a env |
| `admin/store-gsc-key.sh` | S10.6 bezpečné uložení klíče na VPS |
| `admin/tests/gsc-*.test.js`, `admin/scripts/seo-browser.js` | testy |

**Synchronizace:**
- první běh stáhne 180 dní dozadu;
- **každý další běh znovu stáhne posledních 14 dní**, protože Google zpětně opravuje nedávná data; dny, které Google přestal vykazovat, se smažou;
- předběžné dny se poznají podle `firstIncompleteDate`;
- nejvýš 10 volání za běh, opakování jen při 429 a 5xx (max. 3 pokusy, 2 s a 4 s);
- plánovač běží v procesu: první běh 15 s po startu HTTP serveru, pak každých 24 h, po chybě za 1 h, nikdy souběžně.

**Report:**
- celkové součty se počítají jen z denních řádků; CTR z agregací, pozice vážená zobrazeními;
- srovnání s předchozím obdobím se ukáže, jen pokud bylo celé předchozí období staženo;
- dny bez dat jsou mezery, ne nuly;
- Google se při requestu nikdy nevolá.

**UI:**
- 4 ukazatele se srovnáním, SVG graf (mezery a body) s tabulkou, kontroly, stránky, dotazy (jen text), zařízení, přepínač 7/28/90;
- stavy „nepřipojeno“, „probíhá první synchronizace“, „nedostupné“ a **„Google zatím neposkytuje dostatek dat.“**;
- bez knihoven a externích požadavků, CSP beze změny.

**Beze změny:**
- autentizace Cloudflare Access (ověření JWT na každé cestě), stávající sekce dashboardu, `admin/Dockerfile`, `package.json` a lockfile (žádná nová závislost);
- veřejný web: žádný soubor mimo `admin/` a `docs/`, veřejný image (kopíruje jen nezměněný `admin/src/usage.js`) ani release skript.

## 2. Výsledky testů

| Test | Výsledek |
|---|---|
| Admin unit testy (`npm test` v `admin/`), lokálně Node 22 | **19/19 PASS** (6 původních + 13 nových) |
| Admin unit testy v kontejneru Node 24.21 (read-only, bez sítě) | **19/19 PASS** |
| `admin/scripts/seo-browser.js` (Chromium, testovací JWT, mock data) | **PASS** (9 kontrol): 4 prázdné stavy bez čísel, data na 320/375/430/1280 px, porovnání, graf s mezerami a tabulkou, dotaz `<img …>` jen jako text, přepínač období klávesnicí (Enter, mezerník), cíle ≥ 48 px, bez přetečení, bez externích požadavků a CSP chyb, bez JWT 403 |
| Kořenová sada repozitáře | 528 PASS, 0 fail, 2 cancelled (známé ARES časování Node 22) |
| `npm run check` / Claude strict gate | PASS / 16/16 PASS |
| Docker image adminu (Node 24.21) | sestaven; uživatel `node` (1000), image obsahuje jen `src/` a `public/` |
| Kontejner s omezeními z compose (read-only, `cap_drop ALL`, `no-new-privileges`, 192 MB, 0,25 CPU, 64 PID, bez sítě) | bez GSC: start OK, všechny cesty bez JWT 403. Neplatný klíč: „Search Console disabled: invalid_credentials.“, dashboard běží. Platný **testovací** klíč bez sítě: synchronizace skončí `error/upstream` po 3 pokusech, v logu žádný klíč, e-mail ani token. |
| Paměť a CPU (nejhorší případ: 2 × 25 000 řádků stránek, maxima všech seznamů) | špička **85 MB** RSS (limit 192 MB), celý běh přibližně 2,3 s při 0,25 CPU |
| Blokování serveru | síť je asynchronní; jediný synchronní krok, transakce SQLite, trvá **6 ms** realisticky (11 stránek × 180 dní) a 488 ms v teoretickém maximu jednou denně. Test: HTTP odpovídá během probíhající synchronizace. |
| Bezpečnostní kontrola zdrojů | bez `innerHTML`, `eval` a dynamického kódu; logy jen s kódy; síť jen na pevné hostitele; bez cookies, úložiště a analytiky; v repozitáři žádný klíč ani token |

**Poznámka k Docker buildu:**
- Docker Hub v tomto prostředí vracel 429 pro `node:24-alpine`.
- Ověřovací build proto použil stejné kroky s lokálně dostupným Node 24.21 image (digest z release gate) a závislostmi nainstalovanými z lockfile. `admin/Dockerfile` je beze změny.
- Skutečný build na VPS bude stejný jako u dnešního stagingu: `npm ci` ze stejného lockfile.
- Ověřené byly runtime vlastnosti: spuštění, omezení, paměť a cesty.

## 3. Rizika a omezení

1. **Typ property:** výchozí `GSC_SITE_URL=sc-domain:verimtomu.fyi` předpokládá doménovou property. U URL-prefix property je potřeba nastavit `https://verimtomu.fyi/`. ⚠ Vlastník ověří.
2. **Egress:** admin kontejner potřebuje HTTPS na `oauth2.googleapis.com` a `searchconsole.googleapis.com`. ⚠ Zda je jeho odchozí provoz omezen, není v repozitáři ověřitelné.
3. **Zpoždění dat Google** přibližně 2–3 dny. Nejnovější dny jsou předběžné a UI to uvádí.
4. **Dotazy nejsou úplné:** Google anonymizuje vzácné dotazy. UI to uvádí a celky z dotazů nepočítá.
5. **Postup nasazení stagingu** (adresář compose a `.env` na VPS) není v repozitáři zdokumentován. ⚠ Runbook proto pracuje s kontejnerem `verimtomu-admin-staging` a adresářem, kde jeho compose skutečně leží.
6. **Klíč service accountu** je dlouhodobé tajemství. Mitigace: soubor `0400`, jediný read-only mount, role „Omezené“, obměna do 90 dní.
7. URL Inspection (S10.5) není součástí; stav indexace jednotlivých URL zůstává v GSC.

## 4. Postup nasazení na staging (po schválení)

### A. Vlastník – Google (jednorázově, mimo repozitář)
Přesné kroky jsou ve specifikaci §10:
1. GCP projekt, zapnout Search Console API.
2. Service account bez rolí, JSON klíč.
3. V Search Console přidat e-mail service accountu jako uživatele s oprávněním **Omezené**.
4. Ověřit typ property.

### B. VPS (root, krok po kroku)
1. **Stav před změnou:**
   ```
   docker inspect verimtomu-admin-staging --format '{{.Image}} {{.Config.Image}}'
   docker inspect verimtomu-admin-staging --format '{{json .Mounts}}'
   docker tag <Image ID z prvního řádku> verimtomu-admin:pre-stage10
   ```
   Poznamenat adresář compose a `.env` stagingu: `docker inspect verimtomu-admin-staging --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`.
2. **Záloha dat** (volitelné, tabulky Stage 10 jsou jen aditivní):
   ```
   docker cp verimtomu-admin-staging:/data/admin.sqlite /root/admin-pre-stage10.sqlite
   ```
3. **Klíč:**
   - nahrát JSON na VPS do `/root/gsc-key-upload.json` (scp, `chmod 600`);
   - spustit `bash admin/store-gsc-key.sh /root/gsc-key-upload.json`;
   - skript ověří strukturu, uloží `/opt/verimtomu/admin-secrets/gsc-service-account.json` (`0400`, 1000:1000), nahraný soubor smaže a nic nevypisuje.
4. **Kód:** v adresáři compose stagingu nahradit `src/`, `public/`, `compose.yaml` a skripty obsahem `admin/` z release SHA této větve (`git archive <SHA> admin`).
   - **Existující `.env` nepřepisovat**: AUD `59d367…7456`, issuer, `ADMIN_HOSTNAME=staging.verimtomu.fyi`, `CF_ZONE_ID` a mount Cloudflare tokenu ponechat.
5. **Konfigurace:**
   - v `compose.yaml` odkomentovat **jen** řádek mountu `gsc-service-account.json:ro`;
   - do `.env` přidat:
     ```
     GSC_CREDENTIALS_FILE=/run/secrets/gsc-service-account.json
     GSC_SITE_URL=sc-domain:verimtomu.fyi
     ```
     (případně `https://verimtomu.fyi/` u URL-prefix property)
6. **Build a start** (jen admin):
   ```
   docker compose build && docker compose up -d
   ```
   Veřejný web ani jeho kontejner se nesestavují ani nerestartují.
7. **Ověření:**
   - `docker logs verimtomu-admin-staging` obsahuje „Admin dashboard started.“ a **neobsahuje** „Search Console disabled“;
   - interně bez JWT:
     ```
     docker exec verimtomu-admin-staging node -e "fetch('http://127.0.0.1:3100/api/seo?days=28',{headers:{Host:'staging.verimtomu.fyi'}}).then(r=>console.log(r.status))"
     ```
     → `403`;
   - zvenku anonymně: `curl -sI https://staging.verimtomu.fyi/api/seo?days=28` → `302` na `aged-brook-5b74.cloudflareaccess.com` (Access beze změny);
   - po přihlášení: sekce „SEO & Návštěvnost“ se zobrazí. Po přibližně 15 s proběhne první synchronizace, poté „Aktualizováno …“ nebo „Google zatím neposkytuje dostatek dat.“;
   - stav synchronizace:
     ```
     docker exec verimtomu-admin-staging node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/admin.sqlite',{readOnly:true}).prepare('SELECT status,error,calls FROM gsc_sync ORDER BY id DESC LIMIT 1').get())"
     ```
     → `status: 'ok'`;
   - porovnat kliknutí a zobrazení za 28 dní s GSC UI (Výkon, Web, stejné období). Kvůli předběžným dnům jsou malé rozdíly v posledních 2–3 dnech normální.
   - Při `error: 'permissions'` zkontrolovat uživatele v GSC a typ property. Při `upstream` zkontrolovat egress.
8. **Kontrola Cloudflare Access (beze změny):**
   - Zero Trust → Access → Applications → aplikace pro `staging.verimtomu.fyi`: politika Allow jen pro účet vlastníka, žádné Bypass ani Everyone;
   - AUD v `.env` shodný s aplikací;
   - anonymní požadavek vede na login (bod 7).

### C. Rollback
1. Varianta „jen vypnout GSC“: odebrat 2 řádky z `.env` a mount z `compose.yaml`, pak `docker compose up -d`. Sekce ukáže „nepřipojeno“, zbytek dashboardu beze změny.
2. Úplný návrat: v `compose.yaml` nastavit `image: verimtomu-admin:pre-stage10`, odstranit `build:` a GSC mount, pak `docker compose up -d`.
   - Tabulky `gsc_*` v SQLite stará verze ignoruje.
   - Případně obnovit zálohu `admin-pre-stage10.sqlite` (`docker cp` zpět při zastaveném kontejneru).
3. **Klíč:** při podezření na únik smazat klíč v GCP (Service account → Keys) a odebrat uživatele v GSC. Soubor na VPS: `shred -u /opt/verimtomu/admin-secrets/gsc-service-account.json`.
4. Veřejný web rollback nepotřebuje, protože se ho Stage 10 nedotýká.
