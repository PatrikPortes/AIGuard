# Cloudflare security — human setup, zatím neprovedeno

Pro verimtomu.fyi: vlastní nový remote-managed named Tunnel a vlastní zone/DNS pravidla. Žádný domácí server, Tailscale, předchozí tunnel nebo cizí token. Cloudflare není náhradou backendových limitů nebo SSH firewallu. Skutečné funkce a kvóty ověřit ve vybraném tarifu; tento dokument neslibuje placené funkce Free účtu.

## DNS, TLS a síť

1. Člověk potvrdí správu zóny a registrátora, MFA/passkeys a recovery offline. Při změně nameserverů zachová MX/TXT/CAA/ostatní záznamy, správně koordinuje DNSSEC DS. Nepřesunovat celou zónu bez schválení.
2. Nový tunnel jen pro tento projekt. Public hostname přesně verimtomu.fyi → http://app:3000; konečný catch-all 404, žádný wildcard, SSH, admin nebo domácí hostname. cloudflared je jiný non-root kontejner bez ports/socket/hostnet; jeho localhost není host nebo app. Diagnostic host port app je pouze 127.0.0.1:43127.
3. Proxied apex CNAME na skutečně přidělené <TUNNEL_UUID>.cfargotunnel.com (apex flattening). UUID nevymýšlet. Žádné A/AAAA na VPS/domácí IP, žádný DNS-only bypass. www pouze pokud výslovně žádán; pak proxied redirect na kanonickou doménu.
4. Ověřit aktivní edge certifikát a automatickou obnovu, Always Use HTTPS / jednoznačný HTTP→HTTPS redirect se zachováním cesty/query. Browser→edge HTTPS, connector→Cloudflare šifrovaný Tunnel; http://app:3000 je host-local vlastní bridge. Full (strict) pro případné jiné HTTPS origins; nejde o tvrzení, že tento HTTP bridge má certifikát. Nepoužívat Flexible pro běžný veřejný origin.
5. HSTS na edge až po ověřeném HTTPS: max-age=86400 pro začátek, po provozním ověření navýšit na 31536000. Bez includeSubDomains/preload, dokud nejsou všechny subdomény pod kontrolou a plně HTTPS. Nedůvěřovat veřejnému X-Forwarded-Proto pro HSTS rozhodnutí backendu.
6. API a HTML respektují Cache-Control no-store, žádné Cache Everything ani Edge TTL přepsání pro /api/*. Statické PNG jsou zatím také no-store; optimální explicitní cache jen pro schválené static URLs je samostatné provozní rozhodnutí, nikdy obsahové API.

## Identita ingressu — release-critical

Backend GUARD_CLIENT_IP_MODE=cloudflare vyžaduje jediný CF-Connecting-IP od přesného socket peer VERIM_INGRESS_IP na vlastní bridge. Chybějící/duplicitní/invalid CF IP nebo jiný peer → 403 před analýzou. IPv4/IPv6 se canonicalizují. Host loopback diagnostic port neumí autentizovat API ani s podvrženou hlavičkou.

Zone admin musí potvrdit, že edge původní návštěvnickou CF-Connecting-IP přepíše a nedovolí veřejnému klientovi vybrat novou identitu. Zakázat Pseudo IPv4 Overwrite Headers (může přepsat IPv6), transformy měnící client-IP a nedůvěryhodné Workers před API. Same-zone Worker může měnit x-real-ip/CF identity; takový Worker nesmí být součástí této hranice. Veřejné spoofed XFF/Forwarded/X-Real-IP nikdy backend nepřebírá.

Před publikací provést skutečný HTTPS test: legitimní různí klienti získají oddělené kvóty, opakovaný klient dosáhne quota i přes rotaci veřejných forwarding headers, IPv6 canonicalizace neobchází limit, direct origin je nedostupný. Nelze to ověřit vytvořením fake CF hlavičky v lokálním Dockeru. Samotný přesný peer IP nechrání proti kompromitovanému connectoru/host root/zone adminovi; tyto identity patří mezi privilegované trust aktéry. Pokud později přibude neověřený ingress/Worker, původní konfigurace není schválená: nová kontrolovaná proxy/mTLS a nový audit, bez fallbacku na veřejné hlavičky.

## WAF a endpoint-specific limity

Zavádět nejprve ve stagingu/Log, pokud účet tento režim nabízí. Pokud ne, testovat jednotlivá pravidla v odděleném neveřejném prostředí. Připravit přesné expressions a ověřit syntaxi v dashboardu; nikoli plošné blokování celé země nebo ASN.

| Endpoint | Záměr pravidla | Výchozí návrh edge kvóty |
|---|---|---|
| POST /api/analyze | Pouze POST, JSON, limit body, schválený Origin; žádná cache | 10 POST/min/client-IP, dočasný 429 na 60 s; tuning pro NAT, edge kvóta nesmí chybně blokovat celé skupiny |
| GET /api/session | Pouze GET, no-store | 20/min/client-IP, samostatně od static; cookie rotation není bot auth |
| GET /api/health | Pouze GET, bez payload a secrets | 60/min/client-IP; monitoring nízká frekvence a omezené výjimky |
| Explicitní static | Pouze GET; žádné jiné /assets paths | Začít monitoringem burstů, ne API limitem 10/min — legitimní page načítá více PNG |
| Neznámé /api/* a interní paths | Blokovat nepoužívané /api/upload, admin, .env/.git/docs/src/tests | Backend zůstává autoritou 404; edge není náhrada exact allowlistu |

Příklad záměru expression: http.host eq "verimtomu.fyi" and http.request.uri.path eq "/api/analyze" and http.request.method ne "POST" → Block. Content-type může obsahovat charset: nekontrolovat pouze exact string. Body size/WAF regex dostupnost závisí na tarifu; backend 64 KiB limit zůstává závazný. Managed WAF ruleset, advanced bot score a advanced rate limiting nejsou automaticky součástí všech plánů. V Free typicky jen omezený počet pravidel/managed ochrany; ověřit aktuální účet a oficiální feature matrix, nehádáme kvóty. DDoS mitigace na edge neřeší app CPU, backend egress ani SSH.

Challenge nepřidávat jako HTML mezistránku na JSON fetch POST: klient by dostal místo JSON challenge a běžný uživatel by skončil s chybou. Bot Fight Mode není granular API bypass řešení a může blokovat assistive/automatizované klienty. Začít s backend kvótami a přesnými edge pravidly; risk-based challenge případně na vstupní stránce s přístupnou cestou zpět.

## Turnstile — návrh, NEAKTIVNÍ

GUARD_REQUIRE_BOT_CHECK=false je nyní povinné. Existuje pouze injektované serverové botVerifier rozhraní; žádný produkční Siteverify adaptér/widget/secret. Nastavení true bez verifikátoru fail-closed. Netvrdíme, že CAPTCHA dnes chrání API.

Před aktivací: zvlášť schválit widget a CSP změnu pro přesné https://challenges.cloudflare.com, managed/non-interactive mód, české vysvětlení, keyboard/screen-reader testing, žádný vizuální puzzle. Token jde pouze serveru, ověření Siteverify HTTPS deadline 3 s, single-use/replay protection, očekávaný hostname a action=analyze, freshness a token length, žádné message content v ověření. Remote IP pouze z trusted resolveru. Nepřijmout client-side success flag. Chybějící/expirující/duplicate token nebo provider outage nesmí obejít bránu, musí vrátit srozumitelný opakovatelný stav a nabídnout načtení stránky; žádné neomezené retries nebo tiché snížení pravidel.

Oddělit legitimní NAT, seniorské uživatele, VPN a assistive technologie od bot signálů. Měřit false-positive counts bez identity/content. Nemít obcházející veřejné API pro „přístupnost“; alternativní pomoc musí být operátorem kontrolovaná a nikdy nechtěně povolit placené AI.

## Hlavičky, logy a emergency

App CSP odpovídá čistému same-origin HTML/CSS/JS/PNG: bez CDN, inline, eval, frame, object nebo worker. Nosniff, no-referrer, DENY frames, Permissions-Policy camera/microphone/geolocation=(), API no-store, session Secure/HttpOnly/SameSite Strict. HSTS a HTTPS redirect patří na ověřený ingress. Nepřidávat Cloudflare auto JS injections (např. Rocket Loader/analytics) bez samostatného CSP/privacy review.

Zakázat logování body, Authorization, cookies a neomezeného query do WAF/Workers/Logpush; ověřit dostupné redaction a retention nastavení účtu. Managed edge/provider logy nelze označit jako anonymní nebo bez obsahu bez smluvního a technického ověření.

Při útoku: přesné edge rate/Block, případně dočasně zablokovat POST /api/analyze; ne globální challenge, který rozbije API. Pokud kapacita nestačí, zastavit pouze app/connector projektu; nevystavovat direct public origin při outage Cloudflare. AI zůstává rules/zero budget. Nouzové změny provádí člověk, zaznamená čas/pravidlo a po incidentu odstraní krátkodobé výjimky, ověří false positives a HTTPS smoke. Viz OPERATIONS.md.

Oficiální zdroje pro ověření před nastavením: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ ; https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip ; https://developers.cloudflare.com/waf/ ; https://developers.cloudflare.com/waf/rate-limiting-rules/ ; https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ ; https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/ . Dostupnost, UI a tarif musí správce ověřit v okamžiku realizace.
