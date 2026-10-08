# Security Gate 1 — výsledky lokálního auditu

> Historická evidence původní Gate 1, nikoli současných opravených souborů. Aktuální výsledky jsou v [REMEDIATION_1_VALIDATION.md](REMEDIATION_1_VALIDATION.md); původní raw výstupy zůstávají zachovány.

Datum 2026-10-08. Testy proběhly v izolovaném cloud workspace, nikoli na VPS nebo doma. Nejde o pentest. Žádný produkční secret, DNS/Tunnel nebo placené AI nebyly použity. **Release gate pro veřejný deployment zůstává BLOCKED.**

## Opravené nálezy

| Nález | Skutečná změna | Důkaz |
|---|---|---|
| Chybějící browser request-origin ochrana | Pevný production Origin/Host, Sec-Fetch-Site, valid signed session; bez forwarded origin trust | CSRF/session security tests; reálný Docker trusted ingress 403 vs200 |
| Slabé admission/slow body limity | HTTP64 aktivních/128 conn, analysis8 včetně receiving, globalAPI600/min; JSON64KiB, UTF8 fatal, body5s, analysis25s, worker slot held do skutečného dokončení | Raw slow/chunked requests, timeout/overload/global IP rotation tests |
| Ambiguous cesty/HTTP | Strict path před normalizací, explicitní 405/Allow, duplicate critical headers, strict parser8KiB, GET-body odmítnut | Raw TCP traversal, absolute form, CL/TE, doubleHost/CL a header overflow tests |
| Kvadratické ordered regex | Ordered line scan se stejným pořadím/frázemi a hranicemi řádků | Existing rules tests + repeated prefix/order/newline regression; původní synthetic 9k repeated pošli ~136ms, finální ~3ms pro stejný vstup; není benchmark SLA |
| Deployment race a nedostatečné ukončení | Release flock, pinned upstream validation, SIGTERM drain10s/stop grace15s | Script regression + HTTP drain + actual Docker graceful exit |
| Zbytečné CVE/runtime nástroje | Distroless Node24 runtime bez shell/npm; původní cloudflared binary byte-exact ve static-distroless bez OpenSSL | Trivy before/after, UID/write tests a binary SHA |
| CSP attack surface | object-src/worker-src none, zachovaný self-only JS/CSS/img/connect a frame/base restrictions | Header tests + actual Chromium XSS/text rendering |

## Výsledky a přesný rozsah

| Kontrola | Stav | Důkaz / limit |
|---|---|---|
| npm test | PASS | 65 testů, 65 pass, 0 fail/skip; původních49 zachováno |
| npm run check | PASS | Syntax všech src/public/tests/scripts JS |
| bash -n deploy/scripts/*.sh | PASS | common/deploy/rollback/build-connector |
| Docker app build | PASS | Offline validated stage: 65/65 + syntax; pinned builder/runtime Node24.21.0 |
| Docker connector build | PASS | Vendor2026.10.0 binárka zachována, pinned minimal runtime |
| Compose security-config.js | PASS | Pouze app+connector, explicitní loopback, non-root/RO/NNP/caps/resource/tmpfs/log limits, vlastní sítě, bez socket/hostnet/volumes/app secrets, obě healthchecks |
| Actual app Docker runtime | PASS | Healthy; UID65532; /app write denied, /tmp allowed; bez docs/tests/.git/env/deploy/shell/npm; pouze127.0.0.1:43127 efetivní publikace; host health200 |
| Local deployment smoke | PASS | Rules/frontend/private404/direct forged CF403 a 14 byte-exact PNG/MIME |
| Actual Docker trusted client | PASS | Secure signed cookie, origin rejection, IP20/session10 kvóty, XFF bypass odmítnut, nová IP samostatně; syntetický ingress, ne Cloudflare |
| Production AI guard | PASS | AI_MODEai odmítnut v network-none kontejneru před HTTP startem; testy zero budget/secrets/retry/critic/Secure/ingress |
| Connector version/ready/binary | PASS omezeně | Version2026.10.0; ready proti lokálnímu synthetic200 exit0 a bez listeneru exit1; žádný tunnel/token. Vendor/final binary SHA stejný |
| Browser security-browser.js | PASS | Chromium skutečný rules flow, HTML-looking model strings jako text, žádný injected img/JS, viewport1440/390/320 bez overflow a hero contain; není úplný accessibility audit |
| Budget race/cost/queue/injection | PASS | 4 souběžné skutečné SQLite workers nepřekročí budget; queue overload/timeouts, structured/evidence/unsafe output; syntetický LLM, žádný skutečný OpenAI |
| npm audit --json | PASS / deps N/A | 0 vulnerabilities, 0 externích dependencies; tento audit NEkontroluje OS/Node interní knihovny |
| Gitleaks 8.30.1 dir | PASS | 0 findings v současných files, official v8.30.1 default config, --redact; historie N/A (unborn repo) |
| Trivy 0.75.0 Dockerfile config | PASS | 27 successful /0 failed checks v každém Dockerfile; Compose pokryt samostatným verifierem |
| Trivy runtime image security | PASS pro HIGH/CRITICAL gate | App0HIGH/0CRITICAL, connector0HIGH/0CRITICAL. Nižší/unknown findings nejsou odstraněny ani automaticky schváleny |
| Independent security review / pentest / full SAST | NOT RUN | Audit provedl jeden implementující agent; automated HTTP/browser/config checks nejsou nezávislý review, plný SAST ani pentest |
| VPS/cloud edge/tunnel/TLS/HSTS/SSH/ports/WAF | NOT RUN | VPS a route/token nejsou vytvořeny, task je zakazuje změnit |
| Real release deploy/rollback/backup restore/load | NOT RUN | Chybí schválený Git commit a staging/VPS. Skripty jsou regresně testované mock CLI; actual app kontejner není approved release |
| Real AI quality/provider charge test | NOT RUN | Externí AI záměrně neaktivní, žádný klíč nebo nenulový produkční budget |
| Upload parser / URL fetch exploit corpus | NOT APPLICABLE nyní | Tyto features neexistují; regression prokazuje odmítnutí/nefetch. Povinné future gates, nikoli tvrzení o bezpečném parseru/fetcheru |

## Scanner evidence

Sanitizovaná data a všechny finální nižší nálezy: [SCAN_SUMMARY.json](SCAN_SUMMARY.json). Raw JSON reporty jsou lokální /tmp artefakty; obsahují scan metadata, nikoli user content/secrets. Package counts mohou obsahovat stejný CVE u více balíčků; nejsou počty potvrzených exploitable zranitelností.

- Původní app bookworm-slim runtime: 4 CRITICAL /60 HIGH /113 MEDIUM /78 LOW /1 UNKNOWN. npm audit tyto OS/bundled npm nálezy neviděl.
- Finální app distroless: 0 CRITICAL/HIGH /23 MEDIUM /8 LOW, převážně glibc/GCC/zlib, aktuální feed bez fixu. Runtime ~170 MiB vs původních~265 MiB (uncompressed Docker image size).
- Vendor cloudflared runtime: 2 HIGH OpenSSL (oba fixed in3.5.7-1~deb13u3) /26 MEDIUM /10 LOW /1 UNKNOWN. Statically linked Go binary OpenSSL runtime nepotřebuje.
- Finální connector: 0 CRITICAL/HIGH /2 MEDIUM golang.org/x/crypto /1 UNKNOWN; runtime ~40 MiB. Vendor binary se NErebuildoval ani neupravoval. Byte SHA-256: 6fb373461c6de859684477920d9c599c309751f162e08592857f310a68906c8e.

Scan DB a checks stáhnuty z oficiálních ghcr.io/aquasecurity OCI artefaktů přes standardní digest/TLS verification; původní mirror.gcr.io byl odmítnut síťovou politikou, bez vypnutí TLS/hash kontroly. První scanner container pokusy selhaly kvůli lokálním filesystem/DNS podmínkám; konečné skeny běžely host binárkami extrahovanými z ověřených scanner image digestů. Gitleaks builtin-config lookup nefungoval, proto použit explicitní oficiální config stejného release; žádná pravidla suppress/ignore.

Scanner images: Trivy aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa; Gitleaks ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f. Scan není vendor signature/provenance nebo exploitability proof. Review sbom/registry identity a refresh feeds při releasu stále nutné.

Úplný [seznam změněných souborů](CHANGES.md): 14 nových +20 upravených; žádný frontend/asset redesign nebo změna AI business logiky.

## Reprodukce bez produkce

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
bash -n deploy/scripts/common.sh deploy/scripts/deploy.sh deploy/scripts/rollback.sh deploy/scripts/build-connector.sh
node scripts/security-config.js
# Optional isolated test tooling; není production dependency:
PLAYWRIGHT_MODULE=<PATH_TO_PLAYWRIGHT_MODULE> CHROMIUM_PATH=<CHROMIUM_EXECUTABLE> node scripts/security-browser.js
npm audit --json
# Ověřené scanner binárky v izolovaném workspace:
gitleaks dir . --config <OFFICIAL_MATCHING_RELEASE_CONFIG> --redact --report-format json --report-path <REDACTED_REPORT>
docker build --build-arg VCS_REF=<APPROVED_SHA> -t verimtomu:<APPROVED_SHA> .
docker build -f Dockerfile.cloudflared --build-arg VCS_REF=<APPROVED_SHA> -t verimtomu-cloudflared:<APPROVED_SHA> .
docker save verimtomu:<APPROVED_SHA> -o <APP_IMAGE_TAR>
docker save verimtomu-cloudflared:<APPROVED_SHA> -o <CONNECTOR_IMAGE_TAR>
trivy image --db-repository ghcr.io/aquasecurity/trivy-db:2 --input <APP_IMAGE_TAR> --scanners vuln --severity HIGH,CRITICAL --exit-code 1
trivy image --db-repository ghcr.io/aquasecurity/trivy-db:2 --input <CONNECTOR_IMAGE_TAR> --scanners vuln --severity HIGH,CRITICAL --exit-code 1
trivy config --checks-bundle-repository ghcr.io/aquasecurity/trivy-checks:1 .
```

Pouze izolovaný local build, žádné tunnel secrets/produkční Docker host. Commands s placeholders nejsou automaticky provedeny. Plné nižší findings reportovat i vedle severity-filter gate. .dockerignore, exact static allowlist a final-image filesystem kontrolovat při každé změně files/routes/Dockerfile. Git/history scan zopakovat po vytvoření schváleného commitu.
