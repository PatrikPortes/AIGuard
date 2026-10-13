# Minimální SEO release — 13. října 2026

## Nasazení

Implementace: `7e2112e4fcf0b14784deac66541867efa2a15083`.

Základ: přesný produkční image revize `a7938eb291e777eef328ba46953110028cee7e57`, `sha256:88791e89695f63bbb53e1b966ec1b03ec6cc25c04d1f71cc2455b50147e69e14`.

Nasazený image: `sha256:d91f79fbc0cde8431e3558a3833b26a8fb124b860f03fb94207511a944023a90`.

Tag: `verimtomu-web:seo-7e2112e-a7938eb`.

Záložní kontejner: `verimtomu-web-before-seo-20261013T053558Z`.

Sestavení a aktualizaci spustil provozovatel ze svého Terminálu. Výstup BUILD_PROOF potvrdil úspěch jediného cíleného SEO testu, shodu ostatních runtime souborů a zachování konfigurace image. Výstup aktualizačního skriptu potvrdil UPDATED a vytvoření záložního kontejneru. Skript při aktualizaci ověřil zachování konfigurace a mountů, dostupnost API health s AI/fallback a lokální dostupnost SEO souborů. Celá původní testovací sada nebyla opakována.

## Rozsah

Změněny pouze `src/server.js`, `public/privacy.html`, `public/robots.txt` a `public/sitemap.xml`.

CSP výjimka pro `https://static.cloudflareinsights.com/beacon.min.js` platí pouze na `/`, `/privacy` a `/uz-se-to-stalo`. `connect-src` zůstává `'self'`; formuláře a API zachovávají původní CSP. Výjimka sama analytický beacon nevkládá.

Ostatní runtime byl převzat z produkčního image. AI kontroly při startu, frontend, kalkulačka, anonymní čítače, data, konfigurace a mounty zůstaly zachovány. Dashboard, Access/JWT ani AI proxy nebyly v tomto release měněny.

## Veřejné ověření

Provozovatel doložil úspěšný výstup `curl -fsS` pro:

- https://verimtomu.fyi/sitemap.xml — XML sitemap s pěti veřejnými canonical adresami: `/`, `/overit-zpravu`, `/proverit-pujcku`, `/privacy`, `/uz-se-to-stalo`.
- https://verimtomu.fyi/robots.txt — `User-agent: *`, `Allow: /`, `Disallow: /api/` a odkaz `Sitemap: https://verimtomu.fyi/sitemap.xml`.

Sitemap neobsahuje dashboard, API, výsledky kontrol ani parametry.

## Dosud nedokončeno

- Google Search Console: vlastnictví domény bylo ověřeno přes DNS TXT. Odeslání sitemap ani její přijetí Googlem zatím nebylo potvrzeno.
- Docker healthcheck: původní kontrola byla zachována. Před nasazením hlásila `unhealthy`, přesto API health odpovídalo 200. Aktuální Docker health stav a konkrétní příčina nebyly potvrzeny; tento release healthcheck neopravuje.
- Cloudflare Web Analytics: dosud není aktivní a příjem analytických dat nebyl potvrzen. Automatické vložení do celé zóny nebylo zapnuto. Další zapojení musí respektovat omezení na schválené informační stránky a vyloučit formuláře i dashboard. Širší změna CSP vyžaduje samostatné schválení.
