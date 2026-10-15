# Stage 10 – nasazení OAuth SEO dashboardu na staging (OVH VPS)

- **Datum:** 2026-10-15
- **Aplikace:** commit `ea64080` (`feat/stage10-gsc-oauth`). Image se staví přesně z tohoto commitu (`git archive`).
- **Nasazovací nástroj:** `admin/stage10-staging.sh` na větvi `deploy/stage10-staging`. Commit přidává jen tento skript a dokumentaci; obsah image je beze změny proti `ea64080`.
- **Rozsah:** jen kontejner `verimtomu-admin-staging` (`staging.verimtomu.fyi`). Produkční web, jeho kontejnery, Cloudflare Tunnel a produkční databáze se jen čtou.

## Stav
**Nasazení na VPS NEBYLO provedeno.** Z cloudového prostředí, kde pracuji, není přístup na VPS: chybí SSH klíč a adresa a odchozí SSH je blokované. Všechno ostatní je připravené a ověřené proti simulaci VPS. Spuštění na VPS je posloupnost příkazů v §3. Interaktivně musíte zasáhnout jen u souhlasu Google.

## 1. Zjištění při ověření proti skutečnému stavu VPS

| # | Zjištění | Důsledek a řešení |
|---|---|---|
| 1 | **`admin/compose.yaml` neodpovídá běžícímu stagingu.** Repozitář má síť `admin`, volume `admin-data` a žádný mount usage exportu. VPS má síť `verimtomu-admin-stage1`, volume `verimtomu-admin-stage1-data` a mount `/opt/verimtomu/usage-export`. | `docker compose up` by vytvořil **novou síť a prázdný volume** a zkolidoval by o IP 172.30.42.2. **Compose proto pro tento staging nepoužívat.** Skript odvodí nový kontejner z `docker inspect` běžícího kontejneru (síť, IP, volume, všechny mounty, prostředí, limity, restart policy, logování). Mění jen image a přidává read-only mount tokenu a 2 proměnné `GSC_*`. |
| 2 | **Práva souborů v checkoutu:** checkout pod `umask 077` (běžné u roota) dá image, jehož soubory uživatel `node` nepřečte. Kontejner by nenastartoval a autorizační nástroj by nešel spustit. Odhalil to test. | Build i autorizace používají `git archive` kopii commitu se standardními právy, nezávisle na checkoutu |
| 3 | Žádné jiné nastavení než ověřený stav: Cloudflare token a usage export jsou jen pro čtení; read-only rootfs, `cap_drop ALL`, `no-new-privileges`, 192 MB, PID 64 | Preflight to kontroluje a při jakékoli odchylce (publikované porty, privileged, další sítě, neznámé mounty…) skončí dřív, než něco změní |
| 4 | Odchozí HTTPS ze sítě `verimtomu-admin-stage1` ke Googlu není z repozitáře ověřitelné | Preflight to ověří zkušebním kontejnerem na téže síti. Firewall se nemění; při blokaci skript skončí. |
| 5 | Cloudflare Access, živá kontrola z tohoto prostředí (jen čtení, 2026-10-15): anonymní `GET https://staging.verimtomu.fyi/` a `/api/seo` vrací 302 na `aged-brook-5b74.cloudflareaccess.com` s `kid=59d367…7456`; `https://verimtomu.fyi/` vrací 200 | Access je aktivní a AUD sedí. Skript stejnou kontrolu opakuje před nasazením i po něm. |

## 2. Co skript dělá (fáze)

| Fáze | Mění něco? | Obsah |
|---|---|---|
| `preflight` | ne (jen soubory stavu v `/root/verimtomu-backups/stage10-deploy`, 0700) | čistý checkout s `ea64080`; konfigurace běžícího kontejneru proti očekávání; image `pre-stage10` a zálohy; subnet; port 8765 volný; **egress ke Googlu ze sítě adminu**; snapshot produkčních kontejnerů (ID, start, stav) a `cloudflared.service`; Access 302 a AUD |
| `build` | jen nový image `verimtomu-admin:stage10-ea64080` | `git archive ea64080`, `docker build`; **30 unit testů přímo v novém image** (bez sítě, read-only); smoke start: bez GSC běží, bez JWT 403. Běžící kontejner se nemění. |
| `authorize <client.json>` | jen `/opt/verimtomu/admin-secrets/gsc-oauth.json` | jednorázový souhlas Google přes SSH tunel (`gsc-oauth-authorize.sh` z `ea64080`). Pokud token existuje, nedělá nic. Při chybě nic neuloží. |
| `deploy` | jen `verimtomu-admin-staging` | uloží `inspect` (0600) a odvodí parametry; zastaví starý kontejner, přejmenuje ho na `verimtomu-admin-staging-pre10` a nastaví mu restart `no` (po rebootu nesoupeří o IP); zkopíruje `/data`; spustí nový kontejner se **stejnou sítí, IP, volume, mounty, limity a prostředím** a tokenem jen pro čtení. **Automatický rollback**, když nový kontejner nenastartuje, hlásí „Search Console disabled“ nebo neodpovídá 403. |
| `verify` | ne | konfigurace shodná se starým kontejnerem (+ GSC ro); image; cesta tunelu `http://172.30.42.2:3100` → 403; Access 302 na všech cestách; log bez tajemství; **produkce beze změny proti snapshotu** a `verimtomu.fyi` 200; paměť; **první synchronizace GSC `ok`** (nebo konkrétní důvod) |
| `rollback` | jen `verimtomu-admin-staging` | nový kontejner zastaví a ponechá jako `…-failed-<čas>`, starý vrátí pod původním jménem a s původní restart policy. Pokud starý mezitím odstranil `finalize`, vytvoří ho znovu z `verimtomu-admin:pre-stage10` podle uloženého `inspect`. |
| `finalize` | odstraní zastavený `…-pre10` | až po několika dnech provozu; image `pre-stage10` zůstává |

Bez tajemství na výstupu: hodnoty prostředí jdou jen přes `--env-file` (0600, po startu `shred`). Token a OAuth klient se nikde nevypisují a do Gitu se nedostanou.

## 3. Přesný postup na VPS

Na VPS jako root, v SSH relaci **s tunelem** (krok 4 ho potřebuje):
```
ssh -L 8765:127.0.0.1:8765 root@<vps>
```

1. **Checkout** (samostatný adresář, nedotýká se ničeho jiného; stejným způsobem, jakým na VPS stahujete release):
   ```
   git clone --branch deploy/stage10-staging <URL repozitáře> /root/verimtomu-stage10
   cd /root/verimtomu-stage10
   git log --oneline -2          # nahoře commit se skriptem, pod ním ea64080
   ```
2. **Preflight:** `bash admin/stage10-staging.sh preflight` → končí „Preflight OK.“.
   - `CHYBA … nedosáhne oauth2.googleapis.com` znamená, že egress je blokovaný. Zastavit a rozhodnout o firewallu (skript ho nemění).
   - `PROBLEM: …` znamená, že kontejner se liší od ověřeného stavu. Zastavit.
3. **Build:** `bash admin/stage10-staging.sh build` → „unit testy … pass 30 … fail 0“, „bez JWT 403“, „Build OK“. Běžící staging se nemění.
4. **⏸ Autorizace Google: tady jste potřeba vy.**
   1. Ze svého počítače nahrajte JSON klienta „Verimtomu GSC Dashboard“ (Desktop app):
      ```
      scp ~/Downloads/client_secret_….json root@<vps>:/root/gsc-oauth-client.json
      ```
      Nikam jinam ho neposílejte.
   2. V SSH relaci s tunelem spusťte:
      ```
      bash admin/stage10-staging.sh authorize /root/gsc-oauth-client.json
      ```
   3. Vypsanou adresu `https://accounts.google.com/o/oauth2/v2/auth?…` otevřete ve svém prohlížeči:
      - přihlaste se účtem s přístupem k verimtomu.fyi v Search Console;
      - zvolte *Advanced → Go to … (unsafe)*;
      - povolte jen „View Search Console data for your verified sites“.
   4. Prohlížeč ukáže „Autorizace dokončena“. Skript vypíše „Uloženo.“ a „refresh token: 0400 1000:1000“ a soubor klienta smaže.
5. **Deploy:** `bash admin/stage10-staging.sh deploy` → „Deploy OK.“ Starý kontejner zůstane zastavený jako `verimtomu-admin-staging-pre10`.
6. **Verify:** `bash admin/stage10-staging.sh verify` → všechny body OK a „Search Console synchronizace: ok …“.
   - `reauth_required`: zopakovat krok 4 (předtím `shred -u /opt/verimtomu/admin-secrets/gsc-oauth.json`), pak `docker restart verimtomu-admin-staging`.
   - `permissions`: účet nemá v GSC přístup, nebo jde o URL-prefix property. U URL-prefix property spusťte:
     ```
     bash admin/stage10-staging.sh rollback && GSC_SITE_URL=https://verimtomu.fyi/ bash admin/stage10-staging.sh deploy
     ```
   - `upstream`: egress.
7. **Ruční kontrola v prohlížeči:**
   - https://staging.verimtomu.fyi → přihlášení přes Access;
   - sekce „SEO & Návštěvnost“: data nebo „Google zatím neposkytuje dostatek dat.“;
   - čísla za 28 dní porovnat se Search Console (poslední 2–3 dny jsou předběžné);
   - ostatní sekce dashboardu beze změny.
8. Po několika dnech bez problémů: `bash admin/stage10-staging.sh finalize`.

## 4. Rollback
- **Okamžitě:** `bash admin/stage10-staging.sh rollback`. Vrátí původní kontejner (`pre-stage10`) se stejnou IP, sítí, volume a mounty; ověří 403 přes cestu tunelu. Tabulky `gsc_*` v SQLite stará verze ignoruje.
- **Data:**
  - kopie `/data` po zastavení starého kontejneru je v `/root/verimtomu-backups/stage10-deploy/data-pre-swap-*`;
  - původní zálohy jsou `/root/verimtomu-backups/admin-stage10-backup.sqlite` a `admin-data-pre-stage10.tar.gz`;
  - obnova jen při zastaveném kontejneru (`docker cp` do `/data`).
- **Odvolání tokenu:** Google účet → Zabezpečení → Připojení třetích stran → Odebrat přístup, pak `shred -u /opt/verimtomu/admin-secrets/gsc-oauth.json`.
- **Nepoužívat `docker compose up`** z `admin/` (§1, bod 1).

## 5. Ověření nástroje (sandbox, simulace VPS)
Simulace:
- síť `verimtomu-admin-stage1` 172.30.42.0/24, volume `verimtomu-admin-stage1-data`;
- Cloudflare token a usage export jen pro čtení;
- `verimtomu-admin:pre-stage10` postavený z admin kódu produkce `4ea9110`;
- kontejner se stejnými omezeními a restart policy `unless-stopped`;
- jeden „produkční“ kontejner.

Kontroly Access a `verimtomu.fyi` šly proti skutečnému internetu (jen čtení).

| Scénář | Výsledek |
|---|---|
| preflight | OK. Bez egressu ke Googlu správně zastaví: „nedosáhne oauth2.googleapis.com“. |
| build | 30/30 testů v novém image, smoke 403. Odhalil a opravil problém s právy souborů (§1, bod 2). |
| authorize (testovací klient, bez internetu) | URL, tunelový port a archivní kopie fungují. Výměna kódu u Googlu skončí `upstream`: nic neuloženo, kontejner beze změny. |
| deploy | nový kontejner: síť, IP 172.30.42.2, volume, 3+1 mounty, 192 MB, 0,25 CPU, PID 64, read-only, `cap_drop ALL`, `no-new-privileges`, restart a logování shodné; všech 11 proměnných prostředí zachováno (+ 2× `GSC_`); data ve volume zachována |
| verify | všechny kontroly OK, produkce beze změny. Synchronizace v sandboxu `upstream` (bez internetu), což je očekávané. |
| rollback na zachovaný kontejner | OK: původní image, IP, restart `unless-stopped`, tunel 403 |
| `finalize` a rollback z image `pre-stage10` | OK: HostConfig, mounty, prostředí i IP shodné s původním kontejnerem |
| neplatný token při deploy | automatický rollback; staging běží dál na `pre-stage10` |

Simulace nemohla ověřit: skutečný egress a firewall VPS, skutečný souhlas Google a první synchronizaci s Googlem, `cloudflared.service` a build s Docker Hubem (v sandboxu nahrazeno lokální kopií závislostí z lockfile; na VPS běží normální `npm ci`).

## 6. Chyba synchronizace `invalid_response` (po nasazení `ea64080`)

**Stav na VPS:**
- `verify` hlásí `error invalid_response 1 -`;
- log hlásí `Search Console sync failed: invalid_response.`;
- infrastruktura, Access a produkce jsou OK, OAuth autorizace je hotová.

**Rozbor:** `calls=1` znamená, že selhal hned první požadavek, tedy obnova access tokenu nebo denní dotaz `date` a jeho validace. Kód vyvolá `invalid_response` na 13 místech:
- **token:** chybí tělo, tělo je delší než 64 kB, nejde o JSON, chybí nebo je neplatný `access_token`, chybí nebo je neplatný `expires_in`;
- **API:** chybí tělo, tělo je delší než 1 MB, nejde o JSON, `rows` není pole;
- **validace řádků:** `keys`, `clicks`, `impressions`, `position` (1–1000), formát data, data mimo rozsah, duplicitní data, neznámé zařízení, příliš mnoho řádků.

Žádná z kontrol neodmítne odpověď ve tvaru, který Google dokumentuje (test „a valid Google answer … syncs“). **Příčinu proto nelze určit bez skutečné odpovědi Googlu.** Verze `ea64080` navíc nezaznamenávala, které místo selhalo.

**Oprava `e4efe71` (diagnostika, beze změny chování):**
- každá chyba nese pevný štítek fáze a důvodu, např. `token.expires_in`, `api.json_parse`, `check.position` nebo `token.http_400_invalid_client`;
- log uvede požadavek a štítek, např. `Search Console sync failed: invalid_response (request=date, detail=check.position, calls=1).`;
- štítky jsou konstanty, případně kód OAuth chyby Googlu omezený na `[a-z_]`; nikdy hodnota, tělo odpovědi ani token;
- kódy chyb, opakování, UI, schéma ani bezpečnostní limity se nemění.

### 6.1 Jeden bezpečný diagnostický krok (hned, bez nasazení)
Na VPS v existujícím checkoutu:
```
cd /root/verimtomu-stage10
git fetch origin fix/stage10-gsc-sync
git show FETCH_HEAD:admin/tools/gsc-diagnose.mjs | docker exec -i verimtomu-admin-staging node --input-type=module -
```
- Nástroj běží v nasazeném kontejneru s jeho vlastním kódem `ea64080` a tokenem. Dělá stejnou synchronizaci, ale do **databáze v paměti**, takže `/data/admin.sqlite` neotevře.
- Vypíše jen strukturu odpovědí Googlu: klíče, typy, počty, rozsahy čísel, rozsah dat, `firstIncompleteDate`, výčtové hodnoty zařízení.
- **Nikdy** nevypíše token, secret, URL stránek ani texty dotazů. Výstup tedy můžete bezpečně poslat k vyhodnocení.
- Provede nejvýš 10 čtecích dotazů na Google.

Jak číst výstup:

| Výstup | Význam |
|---|---|
| `{"step":"token","ok":false,"code":"invalid_response"…}` | Selhala obnova access tokenu. S novým image ukáže `detail` přesné pole. |
| `"step":"request","request":"date","ok":true,"shape":{…}` a pak `"step":"sync","error":"invalid_response"` | Odpověď přišla, ale neprošla validací. `shape` ukáže pole mimo očekávání, např. `position.below1>0`, `date.afterEnd>0`, `date.duplicates>0` nebo typy jiné než `number`. |
| `"request":"date","ok":false,"code":"invalid_response"` | Tělo odpovědi API není JSON nebo nemá očekávaný tvar |

### 6.2 Nasazení opravy jen do staging administrace
Kontejner s `ea64080` se nahradí image z `e4efe71` stejným odvozením (síť, IP, volume, mounty, limity, prostředí, token). Zastavený `pre10` zůstává cílem rollbacku.
```
cd /root/verimtomu-stage10
git fetch origin fix/stage10-gsc-sync && git checkout --detach FETCH_HEAD
bash admin/stage10-staging.sh preflight     # info: pre10 existuje → upgrade
bash admin/stage10-staging.sh build         # verimtomu-admin:stage10-e4efe71, 34/34 testů v image
bash admin/stage10-staging.sh upgrade       # předchozí kontejner zůstane jako verimtomu-admin-staging-prev
bash admin/stage10-staging.sh verify        # při chybě vypíše řádek logu se štítkem
bash admin/stage10-staging.sh diagnose      # volitelně: struktura odpovědí Googlu
```
**Rollback:**
- `bash admin/stage10-staging.sh rollback-upgrade` vrátí `ea64080`;
- `bash admin/stage10-staging.sh rollback` vrátí `pre-stage10`;
- `finalize` odstraní zastavené kontejnery `-prev` a `-pre10`.

**Ověřeno v simulaci VPS:**
- výchozí stav jako na VPS: nasazený `ea64080`, zastavený `pre10`;
- `preflight` → `diagnose` na `ea64080` → `build` (34/34) → `upgrade` → `verify`;
- `verify` čeká na synchronizaci nového kontejneru; starý chybový záznam ignoruje;
- `rollback-upgrade` → opakovaný `upgrade` → `rollback` na `pre10` → `finalize`;
- produkce se v žádném kroku nezměnila;
- štítek v logu ze simulace: `upstream (request=date, detail=token.network_SELF_SIGNED_CERT_IN_CHAIN, calls=3)`. Sandbox má TLS proxy; na VPS se zobrazí skutečná příčina.
