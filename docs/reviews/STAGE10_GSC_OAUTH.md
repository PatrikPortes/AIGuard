# Stage 10 – OAuth 2.0 pro Google Search Console: review a runbook

- **Datum:** 2026-10-15
- **Větev:** `feat/stage10-gsc-oauth`. Navazuje na schválený návrh `docs/specs/STAGE10_GSC_OAUTH.md` (`6ad8942`) a implementaci `feat/stage10-gsc-dashboard` (`9eed1a1`).
- **Google Cloud (hotovo vlastníkem):**
  - projekt `verimtomu-search-console`, Search Console API zapnuté;
  - Audience **External**, stav **In production**, scope `webmasters.readonly`;
  - OAuth klient „Verimtomu GSC Dashboard“, typ **Desktop app**.
- Nic nebylo mergováno ani nasazeno. Testy používaly jen vymyšlené testovací údaje a mock Googlu; skutečný OAuth JSON ani refresh token nebyl potřeba.

## Verdikt
**GO pro staging** po krocích §4–§6. Kritické ani vysoké nálezy nejsou.

## 1. Změny (jen `admin/` a `docs/`)

| Soubor | Změna |
|---|---|
| `admin/src/gsc.js` | `loadGoogleCredentials()` přijímá soubor `authorized_user` (client_id, client_secret, refresh_token) a dál i service account. `token()` obnovuje access token přes `grant_type=refresh_token` na pevný `oauth2.googleapis.com`, drží ho v cache a obnoví ho 60 s před vypršením. `invalid_grant` vrací `reauth_required`. Pokud Google udělí jiný scope než `webmasters.readonly`, vrací `invalid_scope`. Z chybové odpovědi Googlu se čte jen pole `error`, nikdy se nevypisuje. |
| `admin/src/gsc-sync.js` | Po `reauth_required`, `auth`, `permissions` a `invalid_scope` plánovač opakuje až za 24 h, protože opakování nepomůže, dokud nezasáhne člověk. Po přechodných chybách opakuje za 1 h jako dosud. |
| `admin/src/gsc-store.js` | Nové kódy chyb `reauth_required` a `invalid_scope` |
| `admin/src/server.js` | Načítá `loadGoogleCredentials` a při neúspěšné synchronizaci zapíše do logu jen kód (`Search Console sync failed: <kód>.`) |
| `admin/src/config.js` | Jen komentář; proměnná zůstává `GSC_CREDENTIALS_FILE` |
| `admin/public/app.js` | Nové texty pro `reauth_required` a `invalid_scope`; texty pro `permissions` a `invalid_credentials` už nezmiňují service account |
| **nový** `admin/tools/gsc-oauth-authorize.mjs` | Jednorázová autorizace: loopback, PKCE S256, `state`, `access_type=offline`, `prompt=consent`. Používá jen vestavěné moduly Node. **Není v Docker image.** |
| **nový** `admin/gsc-oauth-authorize.sh` | Spouští nástroj na VPS v image adminu s omezeními kontejneru a ukládá refresh token do `/opt/verimtomu/admin-secrets/gsc-oauth.json` (`0400`, 1000:1000) |
| `admin/compose.yaml`, `staging.env.example` | Zakomentovaný mount `gsc-oauth.json:ro` a `GSC_CREDENTIALS_FILE=/run/secrets/gsc-oauth.json` |
| `admin/store-gsc-key.sh` | Odstraněn (klíč service accountu nelze vytvořit) |
| testy | `admin/tests/gsc-oauth.test.js`, `gsc-oauth-tool.test.js` (nové), `gsc-client.test.js` (1 řádek), `admin/scripts/seo-browser.js` (texty a stav `reauth_required`) |
| dokumentace | tento runbook, README adminu, odkazy v `STAGE10_GSC.md`, stav ve specifikaci |

**Beze změny:**
- SQLite schéma, synchronizace (180 dní, 14denní obnova, limit volání), report, `/api/seo`, UI a CSP;
- Cloudflare Access (JWT na každé cestě), `Dockerfile`, `package.json` a lockfile (žádná nová závislost), limity kontejneru;
- veřejný web: žádný soubor mimo `admin/` a `docs/`.

### Odchylky od návrhu
1. **Redirect je `http://127.0.0.1:8765` bez cesty `/callback`**, tedy přesně ve tvaru z dokumentace Google pro Desktop klienty.
2. **Zápis jako UID 1000:** místo dočasného `chown` celého adresáře tajemství vytvoří skript privátní podadresář `/opt/verimtomu/admin-secrets/.oauth.XXXXXX` (0700, UID 1000). Hotový soubor pak přesune bez přepsání (`mv -n`) a podadresář smaže.
3. **Navíc `invalid_scope`:** dashboard odmítne access token s jiným než read-only oprávněním a autorizační nástroj takový grant neuloží.
4. Do logu se při neúspěšné synchronizaci zapisuje kód chyby (návrh §7: „viditelný v UI a logu“).

## 2. Výsledky testů

| Test | Výsledek |
|---|---|
| Admin unit testy, Node 22 lokálně | **30/30 PASS**: 19 původních (1 upravený řádek) a 11 nových |
| Admin unit testy v kontejneru Node 24.22 | **30/30 PASS** |
| OAuth klient | Validace souboru (11 neplatných variant); `refresh_token` grant jen s potřebnými poli; access token v cache, obnova po 59 min bez interakce; 401 z API zahodí token a obnoví ho; ignoruje rotovaný refresh token |
| Odvolaný token | `invalid_grant` → `reauth_required`. Synchronizace udělá 1 požadavek bez retry a chybu zapíše; dřívější data zůstanou. `/api/seo` vrací data a důvod. Proces nespadne. |
| Bezpečnost tokenů | V chybách, stacku, `/api/seo`, stdout ani stderr nástroje není client secret, refresh token, access token ani autorizační kód. API nikdy nedostane refresh token. |
| Autorizační nástroj (mock Google) | Parametry URL, PKCE (ověřen SHA-256 verifieru), `state` (špatný nebo zdvojený je odmítnut a tok pokračuje), uložený soubor `0400` načitatelný dashboardem, bez dočasných souborů, listener po dokončení zavřen. Odmítnutí bez uložení: širší scope, chybějící refresh token, chyba Googlu, odmítnutý souhlas, timeout, existující soubor (i souběh). |
| Plánovač | Chyby vyžadující člověka → 24 h; `upstream`, `rate_limited` a výjimka → 1 h |
| `admin/scripts/seo-browser.js` (Chromium) | **PASS (10 kontrol)**: 5 prázdných stavů včetně odvolaného tokenu, data na 320/375/430/1280 px, bez externích požadavků a CSP chyb, bez JWT 403 |
| Kořenová brána (Docker `validated`: `node --test`, strict gate, `npm run check`) | **511/511 PASS**, strict gate PASS; build `production` OK |
| Docker image adminu (Node 24.22) | sestaven; obsahuje jen `src/` a `public/` (bez `tools/`) |
| Dashboard v kontejneru s limity z compose (read-only, `cap_drop ALL`, 192 MB, 0,25 CPU, bez sítě) | Bez souboru: běží, bez JWT 403, přibližně 21 MB. Neplatný soubor: „Search Console disabled: invalid_credentials.“, dashboard běží. Platný **testovací** soubor bez sítě: „Search Console sync failed: upstream.“; v logu žádné tajemství. |
| Nástroj v image adminu s omezeními (UID 1000, read-only, 192 MB, 0,25 CPU, port jen na 127.0.0.1) | vypíše URL, cizí požadavky odmítne; přibližně 18 MB RAM |
| `gsc-oauth-authorize.sh` nanečisto (fiktivní `verimtomu-admin-staging`, bez internetu) | Tunelový port, mounty a práva fungují. Výměna kódu skončí `upstream` a čistě selže: nic neuloženo, dočasné adresáře smazány, nahraný soubor klienta ponechán pro další pokus. Úspěšná cesta skriptu nebyla bez Googlu spuštěna; uložení samotné je otestované v unit testech. |

Poznámka k buildu: Docker Hub v tomto prostředí nedovolí `npm ci` při buildu. Ověřovací build adminu proto použil stejný `Dockerfile` a závislosti z lockfile zkopírované do kontextu. `admin/Dockerfile` je beze změny.

## 3. Bezpečnostní rizika

| Riziko | Opatření | Zbytkové riziko |
|---|---|---|
| Únik refresh tokenu a client secretu (dávají jen čtení dat Search Console) | Jen na VPS: soubor `0400` 1000:1000, adresář 0700 root, jediný read-only mount. Nikdy v Gitu, logu, HTML, API ani na notebooku. Token vzniká přímo na VPS. | Kdo získá root na VPS, může data GSC číst. Odvolání viz §7. |
| Únik souboru OAuth klienta | Nahrává se jen `scp` do `/root` a po úspěchu se smaže `shred -u`. Pro Desktop klienta Google secret nepovažuje za důvěrný, sám nic neodemkne. | nízké |
| Podvržený callback | Port je publikovaný jen na 127.0.0.1 VPS a otevřený jen po dobu autorizace (nejvýš 10 min). PKCE S256, 128bitový `state` (porovnání v konstantním čase), jediné použití. Žádné přesměrování ani HTML. | velmi nízké |
| Příliš široké oprávnění | Autorizační URL žádá jen `webmasters.readonly`; nástroj i dashboard jiný grant odmítnou. Autorizující účet má mít v GSC oprávnění „Omezené“. | nízké |
| Zneplatnění tokenu (odvolání, 6 měsíců nepoužití, limit 100 tokenů, změna nastavení klienta) | UI a log ukážou `reauth_required`; data se nepřepíší nulami; plánovač nezahlcuje Google; denní synchronizace token používá | opakovaná autorizace (§5) |
| Varování „Google hasn't verified this app“ | Očekávané u External aplikace v produkci bez ověření. Pro vlastní interní nástroj je přijatelné. | žádné |
| Egress kontejneru k Googlu | Potřeba HTTPS na `accounts.google.com` (jen prohlížeč), `oauth2.googleapis.com` a `searchconsole.googleapis.com` (kontejner) | ⚠ Na VPS neověřeno. Projeví se jako `upstream`. |
| SSH tunel | Lokální přesměrování na `127.0.0.1:8765` VPS | ⚠ vyžaduje `AllowTcpForwarding` v sshd (běžně povoleno) |

## 4. Kontrola v Google Cloud Console (vlastník, hotovo, jen ověřit)
1. Google Auth Platform → **Audience**: User type **External**, Publishing status **In production**. Ne Testing, jinak by refresh token vypršel za 7 dní.
2. **Data Access**: jediný scope `…/auth/webmasters.readonly`.
3. **Clients**: „Verimtomu GSC Dashboard“, typ **Desktop app** → **Download JSON**. Soubor obsahuje `"installed"`. Nástroj klienta typu Web odmítne.
4. Search Console → Nastavení → Uživatelé a oprávnění: účet, kterým budete autorizovat, má přístup k property `verimtomu.fyi` (doporučeno **Omezené**). Service account můžete odebrat.

## 5. Přesný postup autorizace (jednorázově, na VPS přes SSH tunel)

Předpoklady:
- na VPS běží kontejner `verimtomu-admin-staging` (stačí i dnešní verze; nástroj potřebuje jen Node z jeho image);
- na VPS je checkout release SHA této větve, např. `/root/verimtomu-stage10`.

1. **Na svém počítači** nahrajte stažený JSON klienta (nikam jinam ho neposílejte):
   ```
   scp ~/Downloads/client_secret_….json root@<vps>:/root/gsc-oauth-client.json
   ssh root@<vps> chmod 600 /root/gsc-oauth-client.json
   ```
2. **Na svém počítači** otevřete tunel a nechte okno otevřené:
   ```
   ssh -L 8765:127.0.0.1:8765 root@<vps>
   ```
   (port 8765 nesmí být na počítači obsazený)
3. **V tomto SSH okně (na VPS):**
   ```
   cd /root/verimtomu-stage10
   bash admin/gsc-oauth-authorize.sh /root/gsc-oauth-client.json
   ```
4. Skript vypíše adresu `https://accounts.google.com/o/oauth2/v2/auth?…`. Otevřete ji **ve svém prohlížeči**:
   - přihlaste se účtem s přístupem k verimtomu.fyi v Search Console;
   - u varování „Google hasn't verified this app“ zvolte *Advanced → Go to … (unsafe)*;
   - povolte jediné požadované oprávnění „View Search Console data for your verified sites“ (česky „Zobrazit data služby Search Console…“). Jiné oprávnění se nesmí objevit.
5. Prohlížeč se vrátí na `http://127.0.0.1:8765/…` a ukáže „Autorizace dokončena. Okno můžete zavřít.“ Skript vypíše „Uloženo.“ a „Refresh token uložen do /opt/verimtomu/admin-secrets/gsc-oauth.json (0400, UID 1000)…“. Nahraný soubor klienta smaže.
6. Kontrola (nic tajného se nevypisuje):
   ```
   stat -c '%a %u:%g %s' /opt/verimtomu/admin-secrets/gsc-oauth.json   # 400 1000:1000
   ls -la /opt/verimtomu/admin-secrets                                  # žádné .oauth.* zbytky
   ls /root/gsc-oauth-client.json                                       # No such file
   ```
7. Ukončete tunel (`exit`).

Chyby nástroje jsou krátké kódy:

| Kód | Co udělat |
|---|---|
| `exists` | Soubor už existuje. Postup pro novou autorizaci je v §8. |
| `client_not_desktop` / `client_invalid` | Stáhněte JSON klienta typu Desktop app |
| `access_denied` | V Googlu jste nepovolili přístup; spusťte znovu |
| `wrong_scope` | Zkontrolujte Data Access (jen `webmasters.readonly`) |
| `no_refresh_token` | Odeberte aplikaci v Google účtu (§7) a spusťte znovu |
| `upstream` | Egress kontejneru na `oauth2.googleapis.com` |
| `timeout` | Do 10 minut nepřišel návrat z Googlu; zkontrolujte tunel |
| `port_in_use` | Na VPS je port 8765 obsazený; najděte a ukončete proces |

## 6. Nasazení na staging (po schválení, jen admin)
Navazuje na `docs/reviews/STAGE10_GSC.md` §4 B. Platí z něj body 1, 2, 4, 6, 7 a 8; body 3 a 5 nahrazuje toto:
1. **Stav před změnou a záloha** (B1, B2): `docker tag <Image ID> verimtomu-admin:pre-stage10`, `docker cp … /root/admin-pre-stage10.sqlite`.
2. **Autorizace:** §5 tohoto dokumentu.
3. **Kód:** v adresáři compose stagingu nahradit `src/`, `public/`, `compose.yaml` a skripty obsahem `admin/` z release SHA (`git archive <SHA> admin`). **Existující `.env` nepřepisovat.**
4. **Konfigurace:**
   - v `compose.yaml` odkomentovat **jen** řádek
     ```
     - /opt/verimtomu/admin-secrets/gsc-oauth.json:/run/secrets/gsc-oauth.json:ro
     ```
   - do `.env` přidat:
     ```
     GSC_CREDENTIALS_FILE=/run/secrets/gsc-oauth.json
     GSC_SITE_URL=sc-domain:verimtomu.fyi
     ```
     U URL-prefix property použijte `https://verimtomu.fyi/`.
5. **Build a start:** `docker compose build && docker compose up -d` (jen admin; veřejný web se nesestavuje ani nerestartuje).
6. **Ověření:**
   - `docker logs verimtomu-admin-staging`: „Admin dashboard started.“, **ne** „Search Console disabled“ a po 15 s **ne** „Search Console sync failed“;
   - stav synchronizace (B7) → `status: 'ok'`;
   - bez JWT interně `403`, zvenku `302` na Access;
   - po přihlášení se sekce SEO zobrazí s daty nebo s textem „Google zatím neposkytuje dostatek dat.“;
   - `docker logs verimtomu-admin-staging 2>&1 | grep -cE 'GOCSPX|1//|refresh_token|client_secret'` → `0`.

## 7. Rollback a odvolání
1. **Jen vypnout GSC:** odebrat 2 řádky z `.env` a mount z `compose.yaml`, pak `docker compose up -d`. Sekce ukáže „nepřipojeno“, zbytek dashboardu beze změny.
2. **Úplný návrat:** `image: verimtomu-admin:pre-stage10`, odstranit `build:` a mount, `docker compose up -d`. Tabulky `gsc_*` stará verze ignoruje. Případně vrátit zálohu SQLite (při zastaveném kontejneru).
3. **Odvolání přístupu** (při podezření na únik nebo po ukončení):
   - Google účet → Zabezpečení → Připojení k aplikacím a službám třetích stran → aplikace OAuth klienta → **Odebrat přístup**. Refresh token tím okamžitě přestane platit.
   - Volitelně v konzoli klienta smazat nebo resetovat jeho secret.
   - Na VPS: `shred -u /opt/verimtomu/admin-secrets/gsc-oauth.json`.
   - Dashboard pak ukáže `reauth_required` nebo po restartu „nepřipojeno“.
4. Veřejný web rollback nepotřebuje.

## 8. Opakovaná autorizace (UI: „Přístup ke Google Search Console vypršel nebo byl odvolán…“)
1. `shred -u /opt/verimtomu/admin-secrets/gsc-oauth.json`
2. §5 (stáhnout JSON klienta znovu z konzole, pokud už na VPS není).
3. `docker restart verimtomu-admin-staging`, protože soubor se načítá při startu.
4. Zkontrolovat stav synchronizace (§6 bod 6).

Token se zneplatní, když: jste přístup odvolali, nebyl 6 měsíců použit, překročil se limit 100 tokenů na účet a klienta (každá autorizace vytváří nový), nebo se aplikace vrátila do stavu Testing.
