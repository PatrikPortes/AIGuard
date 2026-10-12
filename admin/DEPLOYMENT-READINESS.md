# Připravenost nasazení — 12. 10. 2026

Větev feature/admin-dashboard-stage1-2026-10-12. Bez commitu/pushnutí/nasazení.
Produkční revision stále 589fe511e3d7a27ff87f233117a4fdea6e97d417, čtecí kontrola VPS. Žádný zásah do produkce.

## Přesná konfigurace Access

Cloudflare One → Access controls → Applications → Create new application → Self-hosted and private / Public DNS.
Name: Věřím tomu? — soukromá administrace
Public hostname: admin.verimtomu.fyi, bez path (chránit všechny cesty).
Session Duration: 30 minutes.
Jedna nová politika „Věřím tomu admin — pouze Patrik“, Action Allow, Include → Emails → patrik.portes@icloud.com. Nikoli Emails ending in, Everyone, Bypass, Service Auth. Policy Session Duration stejná jako aplikace. Výchozí odmítnutí všech ostatních.
Authentication → MFA → Customize MFA settings: Authenticator application a Biometrics, vlastní trvání 1 hour. Globální MFA účtu je nyní Off, proto použít toto nastavení pouze pro novou aplikaci; globální ani cizí aplikace neměnit. Politika nesmí aplikaci MFA přepisovat vypnutím.

V prohlížeči je připraven NEULOŽENÝ formulář včetně rozepsané e-mailové politiky. Save policy ani Create nebylo stisknuto. Nevytvořená aplikace nemá AUD. Návrh v souboru je trvalý podklad; formulář není spolehlivě uložený draft na Cloudflare a může se při reloadu ztratit.
Po vytvoření: Access controls → Applications → nová aplikace → konfigurace/Overview → **Application Audience (AUD)**. Zkopírovat 64znakový AUD do ACCESS_AUDIENCE. Není tajný klíč; nejde o UUID aplikace.
ACCESS_ISSUER=https://aged-brook-5b74.cloudflareaccess.com
Ještě není ověřeno přihlášení správce ani reálné Access MFA/enrollment, protože aplikace nebyla vytvořena a DNS/route neexistují.

## Přesný postup Analytics tokenu

Cloudflare → profil uživatele → API Tokens → Create Token → Custom token / Get started.
Name: verimtomu-admin-analytics-read
Permissions: **Zone / Analytics / Read**.
Zone Resources: **Include / Specific zone / verimtomu.fyi**.
Žádná další oprávnění, žádné All zones. Žádný Global API Key. Trvání například 90 dní s naplánovanou výměnou. Volitelné IP omezení pouze na ověřené skutečné výstupní IP VPS — IPv4 i IPv6 musí odpovídat reálnému provozu; neodhadovat.
Continue to summary → ověřit oprávnění → Create Token. Obsah tokenu se zobrazí jednou; neposílat do chatu, reportu ani příkazové řádky jako parametr.
Token bezpečně uložit pomocí připraveného store-analytics-token.sh spuštěného přímo na VPS: skrytá výzva. Skript je pouze připravený, nebyl spuštěn. Soubor se nepřepíše, pokud už existuje.
Na přehledu zóny verimtomu.fyi získat Zone ID (32 hex), doplnit CF_ZONE_ID v .env. Po mountu jediného souboru doplnit CF_API_TOKEN_FILE=/run/secrets/cloudflare-token.

Zone / Analytics / Read je první nejmenší varianta pro zone-level HTTP dataset. Cloudflare dokumentace k zone datasetům: https://developers.cloudflare.com/observability/logs/datasets/
Obecný průvodce GraphQL používá také Account / Account Analytics / Read: https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
Přesnou nutnost dalšího oprávnění musí doložit skutečný settings dotaz; nepřidávat ho předem. Pokud bude potřeba, pouze tento účet. Free-plan dokumentace má rozdílná tvrzení o dostupnosti datasetů; autoritativní pro tento účet bude settings enabled/availableFields a konkrétní omezený dotaz. Nedostupný plán/schema není důvod rozšiřovat oprávnění. Skutečný token zatím není k dispozici, API proto dosud neověřeno.

## Docker a nezbytné kontroly

Docker build prošel pro Mac i linux/amd64 používané VPS.
VPS image připravená lokálně: verimtomu-admin:stage1-amd64-check
Image ID: sha256:22c3a47d166130c7b74b1b443747d0c8210a2a7c8b8ecbfd6fe4c780a569c90c
Oficiální Node base z buildu: node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
Compose nyní explicitně používá linux/amd64. Konkrétní build již prošel, ale tag node:24-alpine může při budoucím buildu změnit obsah; pro neměnný release lze použít ověřený image ID nebo tuto base digest připnout při sestavení releasu.
Izolovaný kontejner na Macu: network none, žádné host ports, UID 1000, read-only root, drop ALL, no-new-privileges, memory 192m/CPU .25/PID 64, pouze dočasný zapisovatelný /data a /tmp. SQLite databáze vznikla jako uživatel node. Zápis do /admin odmítnut.
Ověřené HTTP cesty /, /app.js, /style.css, /api/dashboard, /health bez JWT všechny vrátily 403.
Testovací kontejner zastaven a automaticky odstraněn. Na VPS nevznikl dashboard ani nový kontejner.
Žádný Docker socket, žádné veřejné aplikační env/ai-data/session-secret/OpenAI key mounty.
Šest cílených testů skutečné JWT validace prošlo v předchozím kroku; nebyly opakovány. Žádný rozsáhlý audit.
Navržený subnet 172.30.42.0/24 nekolizuje se současnými Docker sítěmi VPS (ověřeno). Před skutečným startem znovu zkontrolovat, pokud se infrastruktura změní.

## Pořadí budoucího spuštění

1. Uložit Access aplikaci a politiku, získat skutečný AUD a ověřit MFA pro konkrétní účet.
2. Připravit .env a volitelný read-only Analytics token mount; .env zůstává mimo Git.
3. Spustit pouze admin kontejner z admin/ a ověřit interně odmítnutí bez JWT. Produkční aplikaci nesestavovat ani nepřepínat.
4. Teprve potom samostatně schválená published route admin.verimtomu.fyi → http://172.30.42.2:3100 a proxied DNS; Protect with Access se stejným AUD.
5. Krátce ověřit povoleného/nepovoleného uživatele a skutečný GraphQL dotaz. Nepřipojovat dashboard k veřejným aplikačním databázím.

Nyní nejsou připravené skutečné Access AUD a Analytics token. Dashboard může fungovat bez Analytics tokenu s nedostupnými daty, ale nikdy bez Access konfigurace. DNS ani tunnel route se v této etapě nevytvářejí.
