# Soukromý dashboard — etapa 1

Stav: připraveno lokálně, bez commitu, pushnutí a nasazení. Veřejná aplikace nebyla změněna.

## Návaznost verzí (ověřeno 12. 10. 2026)

Produkční image: sha256:9cd6b51297f3bbf8d7f5965db8c883eddaf338ba6d0bda05762dde3e7bcf300f, revision 589fe511e3d7a27ff87f233117a4fdea6e97d417.
GitHub fix/guide-size-2026-10-12: stejný commit. GitHub feature/sender-phishing-2026-10-12: 0b3094d35f6545f16dcc9e4db82ca4df506ae21b.
Lokální fix/message-result-flow-2026-10-12: 4f18143 → 98325df → 1e0d314, přímí potomci 589fe51. Tato větev při inventuře na GitHubu nebyla.
Nový izolovaný checkout je založený na 1e0d314 a obsahuje všechny tyto změny. Etapa přidává pouze adresář admin/.
Budoucí nasazení dashboardu sestavuje výhradně admin/Dockerfile; nesestavovat ani nepřepínat veřejnou aplikaci v rámci této etapy.

## Co funguje

Samostatná Node 24 služba, SQLite cache a prázdná tabulka pro budoucí denní agregace. Čtyři responzivní sekce. Žádné předvyplněné statistiky.
Každá cesta včetně HTML, JS, CSS, API a neexistujících cest nejprve ověřuje Cf-Access-Jwt-Assertion: RS256 podpis, klíče z pevného issuer JWKS, issuer, AUD, exp, iat, nbf a typ app. Žádné přihlášení podle pouhé e-mailové hlavičky, žádný vývojový bypass.
Chybějící nebo neplatná Access konfigurace zastaví startup. Neplatný JWT vrátí 403. JWT ani identita se neukládají a nelogují.
JWKS má omezenou cache, timeout a cooldown při změně kid; bez platného podpisu služba nikdy neposkytne data.
CSP pouze vlastní soubory, zákaz rámování, no-store. Bez externí analytiky na admin stránkách.
GraphQL klient používá pouze pevný HTTPS endpoint, odmítá redirect, má timeout a limit odpovědi. Nejprve ověří dostupnost datasetu přes settings. Cache se obnovuje každých 5 minut. Při výpadku ukáže stará data s označením, nebo nedostupnost. Dotazy jsou pouze agregované HTTP counts pro verimtomu.fyi za 24 hodin a 7 dní; žádné IP, úplné URL ani údaje návštěvníků.
Tato integrace je cíleně testována s mockovanou Cloudflare odpovědí. Skutečné oprávnění, schema/filtry a limity účtu zatím nebyly ověřeny API tokenem. Nezaručujeme, že všechny metriky jsou dostupné na Free plánu.

## Co zatím není připojeno

Počty dokončených ověření, AI statistiky, rozpočet, skutečný stav veřejné aplikace a tunelu. Prázdné metriky mají stav nedostupné, nikoli 0. Provozní sekce ukazuje pouze skutečnou dostupnost a dobu běhu dashboardu.
Healthcheck Dockeru kontroluje lokální TCP listener, ne anonymní HTTP endpoint. Není to náhrada za kontrolu JWT či externí dostupnosti. Veřejný healthcheck se nemění.
Cloudflare Web Analytics není pro verimtomu.fyi založené. Etapa používá serverové HTTP Analytics, nepřidává beacon a nemění CSP veřejné aplikace. RUM/návštěvy/výkon v prohlížeči vyžadují další explicitně schválenou etapu. HTTP počty nejsou lidé ani dokončená ověření.

## Cloudflare — nutná konfigurace před zveřejněním

1. Access controls → Applications: vytvořit **novou Self-hosted aplikaci** pouze pro admin.verimtomu.fyi, včetně všech cest. Nezměnit pravidla stagingu ani jiných domén. Allow pouze konkrétní účet správce (musí být určen), ideálně IdP s MFA; e-mailový OTP sám o sobě není MFA. Žádné Everyone či Bypass. Krátká session, například 1 hodina.
2. Opsat Application Audience (AUD), ne ID aplikace. Issuer stávajícího účtu je https://aged-brook-5b74.cloudflareaccess.com. AUD této nové aplikace zatím neexistuje. Doplnit do lokální .env podle .env.example; skutečná .env se nesmí commitnout.
3. Pro současné zone-level HTTP dotazy vytvořit samostatný token **Zone / Analytics / Read**, Zone Resources **Include / Specific zone / verimtomu.fyi**. Začít pouze tímto oprávněním. Account-level Analytics nepřidávat předem; pouze pokud skutečný omezený settings dotaz doloží jeho nutnost, cíleně doplnit Account / Account Analytics / Read pro tento konkrétní účet. Bez DNS Edit, Access Edit a Tunnel Edit. Dashboard nevyužívá ostatní domény. Dostupnost Free-plan datasetu stále musí potvrdit API; chybu plánu neřešit automatickým rozšiřováním tokenu.
4. Do CF_ZONE_ID doplnit úplné 32znakové Zone ID z přehledu verimtomu.fyi. Token nepatří do prohlížeče, Gitu ani chatu. Uložit v /opt/verimtomu/admin-secrets/cloudflare-token, přístup pouze účtu služby (UID 1000 v image) a root; soubor 0400, rodičovský adresář nepřístupný ostatním. Doplnit jediný read-only file mount a CF_API_TOKEN_FILE=/run/secrets/cloudflare-token. Nemountovat celý secrets adresář. Bez tokenu lze dashboard spustit, ale Analytics budou nedostupné.
5. Po vytvoření Access ochrany a místním ověření JWT přidat do existujícího tunelu **admin.verimtomu.fyi → http://172.30.42.2:3100**. Zapnout Protect with Access se správným AUD. Tato IP je navržená, nikoli již existující; před vytvořením sítě ověřit kolize subnetu. DNS bude proxied CNAME na stejný tunnel. Dashboard ověřuje JWT také sám.

Dokumentace: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/

## Bezpečné budoucí spuštění (nyní neprovedeno)

Nejdřív Access, skutečný AUD, ověřený admin účet a konfigurace. Potom sestavit image z admin/, `docker compose -f compose.yaml up -d --build` pouze v adresáři admin/.
Compose nemá ports ani host network, běží jako neprivilegovaný node, read-only root, cap-drop ALL, no-new-privileges, limity paměti/CPU/PID a vlastní bridge síť. Data jsou v odděleném named volume. Nemá Docker socket, veřejný app.env, ai-data ani OpenAI klíč/session secret.
Jediný navrhovaný file mount je Cloudflare read-only Analytics token. Dashboard potřebuje odchozí HTTPS pro Cloudflare GraphQL a Access JWKS; současný firewall veřejné aplikace se nemění. Stávající produkční síť se do dashboardu nepřipojuje.
Po ověření lokálního odmítnutí bez JWT přidat trasu chráněnou Access. Ověřit: anonymní klient nedostane dashboard, nepovolený účet je blokován, povolený účet jej otevře; neplatný AUD/signature odmítnut i při přímé interní cestě. Ověřit žádný veřejný listener 3100.
Teprve se skutečným tokenem spustit omezený API smoke dotaz a ověřit cache. Nepřepisovat příznak unavailable nulou při chybě nebo chybějícím oprávnění.
Docker build pro linux/amd64 a izolovaný kontejner ověřeny; Access flow na skutečné doméně zatím neproveden. Konkrétní nastavení a výsledky viz DEPLOYMENT-READINESS.md.

## Budoucí rozšiřování

Oddělené moduly access, cloudflare, store a server. Připravená daily_totals tabulka nyní nemá writer ani ingest endpoint. Další etapa může přidat souhrnné čítače po dokončení odpovědi serveru, bez osobních identifikátorů. Veřejné aplikační databáze a tajné klíče se dashboardu nesdílejí. Rozpočet bude označen jako rezervace, nikoli skutečné vyúčtování.

## Cílené ověření

`npm ci && npm test` uvnitř admin/. Šest testů: podpis/claims/algoritmus JWT, fail-closed config, SQLite cache, pevný GraphQL endpoint a whitelist metrik, selhání oprávnění/dat, ochrana všech HTTP cest a stale-cache chování.
