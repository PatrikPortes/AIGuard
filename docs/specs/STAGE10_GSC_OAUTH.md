# Stage 10 – přechod Google autentizace na OAuth 2.0 (návrh)

*Stav 2026-10-15: pouze návrh. Nic není implementováno ani nasazeno.*

- **Výchozí stav:** `feat/stage10-gsc-dashboard` @ `9eed1a1`, kde se autentizuje service account klíčem JSON.
- **Důvod změny:** v projektu `verimtomu-search-console` organizační politika `iam.disableServiceAccountKeyCreation` blokuje JSON klíče. Politiku neměníme.
- **Cíl:** OAuth 2.0 s offline přístupem (refresh token). Dashboard, SQLite, synchronizace, Cloudflare Access, scope `webmasters.readonly` a veřejný web zůstávají beze změny.

---

## 1. Ověřená fakta (dokumentace Google, staženo 2026-10-15)

| Téma | Fakt | Zdroj |
|---|---|---|
| Platnost refresh tokenu | Přestane fungovat, když: uživatel odvolá přístup; **token se 6 měsíců nepoužije**; změní se heslo (jen u Gmail scope); překročí se limit tokenů; vyprší časově omezený přístup; admin nastaví službu jako Restricted (`admin_policy_enforced`); u GCP API vyprší session (jen scope `cloud-platform`) | developers.google.com/identity/protocols/oauth2, „Refresh token expiration“ |
| Režim **Testing** | U typu **External** a stavu **Testing** se refresh token vydá s platností **7 dní**. Autorizace testovacích uživatelů vyprší za 7 dní, s ní i refresh token. Nejvýš 100 testovacích uživatelů. | tamtéž; support.google.com/cloud/answer/15549945 („Manage App Audience“) |
| Režim **In production** | Bez 7denního limitu. U sensitive scope bez dokončeného ověření Google zobrazí obrazovku „unverified app“ a platí limit 100 nových uživatelů. | support.google.com/cloud/answer/15549945 |
| Typ **Internal** | Pro projekty v Google Cloud organizaci: autorizovat mohou jen členové organizace. Interní aplikace **nepotřebují ověření**. | answer/15549945; support.google.com/cloud/answer/7454865 („Unverified apps“) |
| Limit tokenů | 100 refresh tokenů na Google účet a OAuth klienta; nový nad limit tiše zneplatní nejstarší | oauth2, „Refresh token expiration“ |
| Instalované aplikace | Doporučený redirect je **loopback** `http://127.0.0.1:<port>` pro typ klienta **Desktop app**. Ruční copy/paste (OOB) je **ukončený a nepodporovaný**. Doporučeno PKCE (`S256`). | developers.google.com/identity/protocols/oauth2/native-app |
| Nový refresh token | Pokud už grant existuje, nový refresh token se vydá jen s `prompt=consent`, nebo po odvolání | native-app |
| Device flow (TV a zařízení) | Povolené scope jsou jen OpenID/e-mail, `drive.appdata`, `drive.file` a YouTube. **`webmasters.readonly` mezi nimi není**, takže tento flow nelze použít. | developers.google.com/identity/protocols/oauth2/limited-input-device |
| Politika klíčů | `iam.disableServiceAccountKeyCreation` se týká klíčů service accountů, ne OAuth klientů | (popis politiky). ⚠ Jiné organizační politiky projektu neověřeny. |

**Nejisté (ověří vlastník v konzoli):**
- zda je `webmasters.readonly` vedený jako *sensitive*. Ovlivní jen to, zda se při jednorázovém souhlasu objeví varování „unverified app“; na platnost tokenu vliv nemá;
- zda účet, kterým autorizujete, patří do organizace projektu. Na tom závisí volba Internal / External.

---

## 2. Doporučený flow

**OAuth klient typu „Desktop app“ a jednorázová autorizace s loopback redirectem, PKCE a `access_type=offline`, `prompt=consent`. Autorizace proběhne přímo na VPS přes SSH tunel.**

- Autorizace proběhne **jednou**. Pak dashboard sám obnovuje access token (platnost přibližně 1 h) z refresh tokenu a další přihlašování není potřeba.
- Denní synchronizace token používá, takže **nevyprší 6 měsíců nepoužívání**.
- Refresh token vznikne **rovnou na VPS** a nikdy neprojde notebookem, chatem, Gitem ani logem:
  - prohlížeč vlastníka se po souhlasu přesměruje na `http://127.0.0.1:8765/…`;
  - SSH tunel `ssh -L 8765:127.0.0.1:8765 vps` to předá jednorázovému procesu na VPS.

**Zamítnuté varianty:**

| Varianta | Důvod |
|---|---|
| Typ klienta „Web application“ s redirectem na `staging.verimtomu.fyi` | Do adminu by přibyl zapisovací callback endpoint a stav OAuth; větší změna a větší útočná plocha |
| Device flow | Scope Search Console není povolený (§1) |
| OOB / ruční vložení kódu | Google ho nepodporuje |
| Service account | Blokuje ho politika, kterou neměníme |

### Volba Audience (rozhoduje vlastník podle účtu, kterým bude autorizovat)

| Situace | Nastavení | Důsledek |
|---|---|---|
| **A (preferováno):** autorizující účet patří do organizace projektu (Workspace / Cloud Identity) | **User type: Internal** | Bez 7denního limitu, bez ověřování, bez varování; autorizovat mohou jen účty organizace |
| **B:** autorizující účet je mimo organizaci (např. osobní Gmail) | **User type: External, Publishing status: In production** (nikdy Testing) | Bez 7denního limitu. Při jednorázovém souhlasu možné varování „Google hasn't verified this app“ (Pokročilé → pokračovat), které je pro vlastní interní nástroj přijatelné. Ověřování aplikace není potřeba, dokud ji nepoužívá veřejnost. |

**Nejmenší oprávnění:**
- autorizovat účtem, který má v Search Console jen **„Omezené“** oprávnění k `verimtomu.fyi`. Ideálně samostatný účet organizace, např. `seo-reader@…`;
- vlastník property je také možný; scope `webmasters.readonly` stejně dovolí jen čtení;
- service account `verimtomu-gsc-reader` je pak nepoužitý. Doporučuji ho z uživatelů Search Console odebrat.

---

## 3. Minimální změna implementace

Beze změny zůstává: SQLite schéma, synchronizace (180 dní a 14denní obnova), plánovač, report, `/api/seo`, UI, Cloudflare Access, CSP, compose (jen jiný název souboru v mountu), veřejný web.

| Soubor | Změna |
|---|---|
| `admin/src/gsc.js` | `loadServiceAccount` → `loadGoogleCredentials(path)`. Rozpozná formát `{"type":"authorized_user","client_id","client_secret","refresh_token"}`, tedy formát Application Default Credentials od Google. Validace: `client_id` končí `.apps.googleusercontent.com`, `client_secret` a `refresh_token` neprázdné, délky omezené, nic jiného se nečte. Ve `GscClient.token()` přibude větev `grant_type=refresh_token` (POST `client_id`, `client_secret`, `refresh_token` na pevný `https://oauth2.googleapis.com/token`, `redirect:'error'`, timeout, limit). Nový kód chyby **`reauth_required`** pro `400 invalid_grant` (odvoláno, vypršelo, limit). Service-account větev zůstane (pro případ budoucí změny politiky), nebo se odstraní; doporučuji ponechat, je otestovaná. |
| `admin/src/gsc-sync.js` | Plánovač: po `reauth_required`, `auth` a `permissions` další pokus až za 24 h (ne za 1 h); opakování nemá smysl, dokud nezasáhne člověk |
| `admin/src/gsc-store.js` | `reauth_required` přidat do povolených kódů chyb |
| `admin/public/app.js` | Text pro `reauth_required`: „Přístup ke Google Search Console vypršel nebo byl odvolán. Je potřeba jednorázově znovu autorizovat (runbook).“ |
| **Nový** `admin/tools/gsc-oauth-authorize.mjs` | Jednorázový autorizační nástroj (§4). Není v image (Dockerfile kopíruje jen `src/` a `public/`); spouští se z checkoutu přes `docker run` s image adminu. |
| `admin/store-gsc-key.sh` | Odstranit (nahrazuje ho nástroj, který zapisuje přímo) |
| `admin/compose.yaml`, `staging.env.example` | mount `/opt/verimtomu/admin-secrets/gsc-oauth.json:/run/secrets/gsc-oauth.json:ro`, `GSC_CREDENTIALS_FILE=/run/secrets/gsc-oauth.json` |
| Testy | Mock token endpointu: úspěch, `invalid_grant` → `reauth_required` (bez retry), 401 → `auth`; nikde nesmí uniknout `refresh_token`, `client_secret` ani access token. Validace souboru. Autorizační nástroj (PKCE S256, kontrola `state`, kontrola vrácených scope = přesně `webmasters.readonly`, zápis `O_EXCL` `0400`, nic se nevypisuje). Stávajících 19 testů upravit jen tam, kde testují service account. |

**Rotace refresh tokenu:** Google refresh token při obnově běžně nevyměňuje. Kdyby odpověď nový token obsahovala, dashboard ho kvůli read-only mountu neuloží a dál použije původní, který zůstává platný. Případné `reauth_required` řeší runbook.

---

## 4. Autorizační nástroj (návrh chování)

`admin/tools/gsc-oauth-authorize.mjs`, Node 24, bez nových závislostí:
1. Vstup:
   - cesta k JSON souboru OAuth klienta (Desktop app) stažená z konzole a nahraná na VPS (`chmod 600`);
   - cílová cesta `/out/gsc-oauth.json`.
2. Vygeneruje `code_verifier` (32 B náhodně), `code_challenge` (S256) a `state` (16 B).
3. Vypíše **jen** autorizační URL: `https://accounts.google.com/o/oauth2/v2/auth` s parametry `client_id`, `redirect_uri=http://127.0.0.1:8765/callback`, `response_type=code`, `scope=https://www.googleapis.com/auth/webmasters.readonly`, `access_type=offline`, `prompt=consent`, `code_challenge`, `code_challenge_method=S256` a `state`. URL neobsahuje nic tajného.
4. Poslouchá na `0.0.0.0:8765` v kontejneru (publikováno jen na `127.0.0.1` VPS):
   - přijme jediný `GET /callback`, ověří `state` a vymění `code` (+ `code_verifier`, `client_secret`) na tokenovém endpointu;
   - ověří, že odpověď obsahuje `refresh_token` a že `scope` je přesně `webmasters.readonly`.
5. Zapíše `{"type":"authorized_user",client_id,client_secret,refresh_token}` atomicky s `O_EXCL` a oprávněním `0400` (UID 1000). Nikdy nepřepíše existující soubor.
6. Prohlížeči vrátí „Autorizace dokončena, okno můžete zavřít.“ a v terminálu vypíše jen „Uloženo.“. Pak skončí.
7. Časový limit 10 minut. Chyby jsou jen krátké kódy; tokeny ani kód se nikdy nevypisují.

---

## 5. Postup v Google Cloud Console (vlastník)

Projekt **`verimtomu-search-console`**. Nová konzole: *Google Auth Platform*, starší název *APIs & Services → OAuth consent screen*.

1. **Google Auth Platform → Branding**
   - App name: `Věřím tomu? – admin Search Console`;
   - User support email: váš e-mail;
   - Developer contact: váš e-mail;
   - logo **nenahrávat** (logo spouští ověřování);
   - homepage, privacy a ToS nejsou pro Internal nutné; u External můžete uvést `https://verimtomu.fyi/` a `https://verimtomu.fyi/privacy`.
2. **Audience**
   - **Internal**, pokud účet, kterým budete autorizovat, patří do organizace projektu (varianta A);
   - jinak **External** a hned **Publish app → In production** (varianta B).
   - **Nenechávat Testing**: refresh token by vypršel za 7 dní.
3. **Data Access → Add or remove scopes:** přidat jen `https://www.googleapis.com/auth/webmasters.readonly` („See Search Console data…“). Nic dalšího.
4. **Clients → Create client:**
   - Application type **Desktop app**, Name `verimtomu-admin-staging`;
   - Create, pak **Download JSON**;
   - soubor obsahuje `client_id` a `client_secret`. Neposílat chatem ani e-mailem a neukládat do Gitu; jen přes `scp` na VPS.
5. **APIs & Services → Library:** Google Search Console API je už zapnuté (ponechat).
6. **Search Console → Nastavení → Uživatelé a oprávnění**
   - autorizující účet musí mít přístup k property `verimtomu.fyi`. Doporučeno **Omezené**;
   - `verimtomu-gsc-reader@…` (service account) odebrat, protože nebude používán.

---

## 6. Postup na VPS (po implementaci; jednorázově)

1. Nahrát klienta: `scp client_secret_….json vps:/root/gsc-oauth-client.json`, pak na VPS `chmod 600`.
2. Ze svého počítače otevřít tunel:
   ```
   ssh -L 8765:127.0.0.1:8765 root@<vps>
   ```
3. Na VPS (jako root, v checkoutu release SHA) spustit nástroj v image adminu:
   ```
   docker run --rm -it --user 1000 --read-only --cap-drop ALL \
     -p 127.0.0.1:8765:8765 \
     -v /root/gsc-oauth-client.json:/in/client.json:ro \
     -v /opt/verimtomu/admin-secrets:/out \
     -v "$PWD/admin/tools":/tools:ro \
     --entrypoint node <admin image> /tools/gsc-oauth-authorize.mjs /in/client.json /out/gsc-oauth.json
   ```
   - Adresář `/opt/verimtomu/admin-secrets` musí existovat (`0700`).
   - Pro zápis jako UID 1000 se na dobu běhu dočasně předá vlastnictví adresáře (`chown 1000 …`) a pak se vrátí rootovi. Přesné příkazy budou v runbooku.
4. Otevřít vypsanou URL ve svém prohlížeči, přihlásit se **autorizujícím účtem** a povolit „See Search Console data“. Prohlížeč se vrátí na `127.0.0.1:8765` přes tunel a nástroj vypíše „Uloženo.“.
5. Uklidit: `shred -u /root/gsc-oauth-client.json`, ukončit tunel a zkontrolovat `stat` souboru (`0400 1000:1000`).
6. Nasazení dashboardu podle `docs/reviews/STAGE10_GSC.md` §4 (Access, `.env` a ostatní mounty beze změny). Jen mount a env podle §3.
7. **Opakovaná autorizace** (po `reauth_required`):
   - smazat starý soubor (`shred -u`), zopakovat body 2–5 a restartovat kontejner;
   - starý grant případně odvolat v Google Account → Zabezpečení → Připojení třetích stran.

**Odvolání při podezření na únik:**
- Google Account → Zabezpečení → Připojení k aplikacím třetích stran → odebrat přístup;
- v konzoli případně smazat klienta nebo resetovat jeho secret;
- na VPS `shred -u /opt/verimtomu/admin-secrets/gsc-oauth.json`.

---

## 7. Bezpečnost

| Riziko | Opatření |
|---|---|
| Únik refresh tokenu nebo `client_secret` | Soubor `0400` (UID 1000), jediný read-only mount; nikdy v Gitu, logu, HTML ani API. Token vznikne přímo na VPS. Scope je jen čtení a autorizující účet má v GSC jen „Omezené“. Odvolání je okamžité (§6). |
| Útok na autorizační callback | Listener jen na `127.0.0.1` VPS a jen po dobu autorizace (nejvýš 10 min). PKCE S256 a kontrola `state`, jediný požadavek, pak konec. |
| Neočekávaný rozsah | Nástroj odmítne odpověď, pokud udělené scope nejsou přesně `webmasters.readonly` |
| Tichý výpadek (odvolání, 6 měsíců, limit tokenů) | Kód `reauth_required` je viditelný v UI a logu; žádné nuly místo dat; denní použití zabrání vypršení |
| Testing (7 dní) | Postup nastavuje Internal nebo In production a runbook to kontroluje |
| Limit 100 tokenů na účet a klienta | Jeden klient a jedna autorizace; při opakování starý soubor nahradit |

---

## 8. Etapy a kritéria

| Etapa | Obsah | Kritéria |
|---|---|---|
| O1 | `gsc.js`: OAuth refresh větev a `reauth_required` | Unit testy s mockem; žádný únik tajemství; 19 stávajících testů zelených, upravují se jen testy service accountu |
| O2 | Plánovač: 24 h pauza po chybách autentizace; UI text | Testy plánovače a browser test stavu `reauth_required` |
| O3 | Autorizační nástroj | Test s mockem Google (lokální OAuth server): PKCE, `state`, chybějící refresh token, špatné scope, existující soubor, timeout |
| O4 | compose, env, runbook | Kontejnerový test: bez souboru dashboard běží, s neplatným souborem se vypne jen GSC, bez JWT 403 |

Odhad: O1–O4 přibližně 1 den. Nasazení až po vašem schválení a po krocích §5–§6.
