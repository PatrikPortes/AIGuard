# Security Gate 1 / 1.1 — release rozhodnutí

2026-10-08: **BLOCKED pro veřejný deployment.** Lokální HTTP/runtime hardening z Gate1 je implementovaný a jeho testy prošly. **34 package nálezů zůstává nevyřešených / bez externě schválené dispozice.** Kompletní Git release ani independent review/staging/public TLS/CF trust proof nejsou schválené. P0 ani P1 nesmí být otevřené při veřejné betě. Žádné Accepted Risk schválení se neodvozuje z mlčení nebo z tohoto auditu. Gate1.1 přidává evidenci a přípravu review, nikoli release approval.

## Oddělený readiness stav

| Oblast | Stav | Důkaz / podmínka dalšího kroku |
|---|---|---|
| Lokální implementace Gate1 | HOTOVÁ v pracovním tree | HTTP admission/parser/CSRF/trust/rules guard a izolované Docker konfigurace. Nevztahuje se na vyřešení všech CVE, feature gates nebo produkci. [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) |
| Lokální testy Gate1.1 | HOTOVÉ pro provedené scénáře | 65/65 tests + syntax/config/browser a frozen-DB rescans; skutečné výsledky/mezery v [GATE_1_1_VALIDATION.md](GATE_1_1_VALIDATION.md). Test PASS není review sign-off |
| Zranitelnosti | NEVYŘEŠENÉ | 23 MEDIUM+8 LOW app; 2 MEDIUM+1 UNKNOWN connector; všech 34 evidováno, 2 FIX/18 MITIGATE/14 INVESTIGATE jsou návrhy, 0 ACCEPT. [VULNERABILITY_EVIDENCE.md](VULNERABILITY_EVIDENCE.md), R13 |
| Nezávislé review | ČEKÁ | [INDEPENDENT_REVIEW_PACKAGE.md](INDEPENDENT_REVIEW_PACKAGE.md) připraven; externí reviewer a sign-off nejsou k dispozici |
| Staging | ČEKÁ | Žádný staging deployment, reálné edge load/HTTPS ani restore drill; R06 |
| VPS / Cloudflare konfigurace | ČEKÁ | Host/SSH/firewall/resolver/token/HTTP-only Tunnel/DNS/TLS/client-IP nejsou ověřeny; R03/R04 |
| Privacy informace | ČEKÁ | Chybí skutečné provozovatelské údaje, kontakt, zpracovatelé/region/retence a veřejné beta označení; R05 |
| Git release | REVIEW KANDIDÁT PŘIPRAVEN; COMMIT/PUSH ČEKÁ NA SCHVÁLENÍ | Unborn repository, celý review kandidát v indexu na security/gate-1-review, pre-commit kontrola viz PRE_COMMIT_SECURITY_CHECK.md. Žádný approved production release; nic commitnuto/pushnuto; R00 |

Žádné nasazení, push, DNS změna, AI aktivace nebo risk acceptance v Gate1.1. Nové dokumenty jsou příprava autora, **ne nezávislé review**.

**Severity evidence:** čtyři identifikátory (CVE-2026-102010 / 95619 / 19499 / 85091) mají CNA HIGH, zatímco Trivy MEDIUM. Obě hodnocení jsou evidována. Scanner nula HIGH/CRITICAL není bezpečnostní waiver; vyšší CNA dopad musí zvlášť posoudit externí reviewer v R13, bez automatického schválení nebo předstírání prokázané exploitační cesty.

## P0 — veřejný deployment zakázán

| ID / stav | Důkaz | Konkrétní oprava / owner | Ověření uzavření |
|---|---|---|---|
| R00 OPEN — chybí schválený úplný release | git rev-parse --verify HEAD selže; remote ls-remote nevrací refs. Celý pracovní tree nyní připraven jako staged initial review candidate, pre-commit secrets/test/evidence kontrola doložena v PRE_COMMIT_SECURITY_CHECK.md. Lokální image má audit revision, není release | Člověk přezkoumá kompletní staged scope/tree ID a výslovně schválí commit/push review větve; teprve published exact commit umožní Claude Code clone/review. Produkční release dále potřebuje exact SHA + review + runtime/base digesty. Nevyužít audit tag jako production | Git clone --branch security/gate-1-review má kompletní source/tests/evidence a matching tree; clean archive build/tests/scans; nezávislý reviewer sign-off a samostatné production release schválení. Samotné staging indexu nebo push review větve veřejný deployment neschvaluje |
| R01 FIXED LOCALLY — produkční image HIGH/CRITICAL | Původní app: 60 HIGH / 4 CRITICAL package nálezy; upstream connector 2 HIGH OpenSSL CVE-2026-75804/CVE-2026-84782 | Pinned distroless Node24 runtime bez npm/shell/nepotřebných OS balíčků; byte-exact statický cloudflared v pinned distroless-static bez nepotřebného OpenSSL | Trivy finální app i connector: 0 HIGH/CRITICAL. SCAN_SUMMARY.json. Znovu scan schválené release image před staging/production; nebyl prokázán exploit původních CVE |
| R02 FIXED LOCALLY — cost/ingress fail-closed | Production guard a resolver již existovaly; nyní rozšířeny testy/origin/zero budget guard | Rules only, no known AI keys, zero limits/critic/retry/local, exact ingress peer, žádný public header fallback | ingress/security tests, reálný container AI_MODEai odmítnut před HTTP startem. Live CF end-to-end je dále R04, neslučovat s lokálním PASS |

Nový nález kritické remote exploitable zranitelnosti/secretu/root exposure okamžitě znovu otevře P0 a ukončí release, i pokud zde dosud není uveden.

## P1 — opravit/ověřit před veřejnou betou

| ID / stav | Důkaz | Konkrétní oprava / owner | Ověření |
|---|---|---|---|
| R03 OPEN — VPS/SSH/firewall/patching | VPS neobjednáno, IP/admin source CIDR/hostDocker/IPAM neznámé | Human bootstrap Ubuntu24.04 dle OPERATIONS.md, key-only/MFA/recovery, SSH source firewall IPv4+IPv6, Docker28+, vlastní nekolizní sítě, žádné home/VPN spojení | Effective sshd config, druhá SSH relace, external port scan, loopback binding/runtime audit, patching a recovery console |
| R04 OPEN — CF/TLS/client IP/WAF | Žádný Tunnel/DNS/token/HSTS/edge rules nebyl vytvořen; fake ingress není Cloudflare | Human nové standalone route/token/proxiedCNAME/TLS/redirect/HSTS, edge overwrite/Workers/PseudoIPv4 audit, tarif-specific rules | Živý HTTPS smoke, two-client-IP quotas, spoof header bypass tests, CF ready, IPv6, HTTP redirect/HSTS a origin firewall proof |
| R05 OPEN — privacy a veřejné označení | /privacy stále říká neveřejný prototyp, chybí provozovatel/kontakt/CF/VPS zpracovatelé/konkrétní log retence; footer prototype | Člověk dodá skutečné právní údaje/region/contact/DPA/retenci; upravit public copy bez smyšlených údajů a bez tvrzení o aktivní AI | Právní+technický review veřejné stránky, syntetický marker v app/edge/hosting logs nenalezen, správný rules/beta wording |
| R06 OPEN — staging/review/kapacita/restore | Jen lokální build+65 tests; nebyl staging, actual edge load, VPS rollback, backup restore ani alert setup | Independent security review, restricted staging se syntetikou, bounded load (včetně velkých PNG), monitoring, app+connector rollout/rollback a restore drill | Podepsaný checklist, HTTP errors/latency/OOM/RAM/disk/egress, expected429/503 bez provider calls, alerts+restore doklad |
| R07 FIXED LOCALLY — HTTP admission/CSRF/routing/ambiguity | Audit původně bez Origin/gate/body deadline; raw normalization a opakované regex CPU | Fixed Origin/Host/session/metadata, global600/min, HTTP64/conn128/analysis8, body5s/strictUTF8, strict paths/405/duplicates/8KiB parser, lineární ordered rules, timeout slots a drain | security.test.js + ingress tests + browser1440/390/320 + actual Docker quotas. End-to-end ingress parser stále součást R04/R06 |
| R08 FIXED LOCALLY — deployment concurrency | Paralelní release skripty mohly přepsat pointer/rollback | Flock celého projektu, pinned source/runtime validation, bounded graceful stop | deploy-scripts.test.js lock/pin/fail-start/fail-smoke/oldDocker. Skripty dosud mock CLI, skutečný exact-commit VPS rollout patří do R06 |
| R13 OPEN — dispozice všech 34 CVE/package nálezů není dokončena | Raw reporty + runtime/CNA evidence v VULNERABILITY_EVIDENCE.md. SSH kód v connectoru skutečně zlinkován, fix x/crypto0.56.0 existuje. Native source-family/version-range/UNKNOWN otázky zůstávají | Ověřit opravený vendor connector, provést nezávislý reachability/provenance review každého řádku A01–A31/C01–C03. Žádné blanket suppression/automatic ACCEPT | Reviewer závěr + důkazy/owner/retest pro všech 34; fresh approved-release scan. R13 je P1 readiness blocker, nikoli automatické zvýšení Trivy severity všech CVE |

## P2 — sledovat po spuštění / samostatné navazující gates

| ID | Důkaz / riziko | Postup a ověření |
|---|---|---|
| R09 — průběžné CVE sledování po schválení dispozic | Finální app 23 MEDIUM / 8 LOW; connector 2 MEDIUM / 1 UNKNOWN. **Dnešní rozhodnutí o nich blokuje release jako R13**, není odloženo po spuštění | Po uzavření R13 pravidelný fresh scan/nový vendor release/retest všech kompenzací; UNKNOWN není LOW. Potvrzený vysoký dopad eskaluje P1/P0. Žádné blanket ignore/accepted waiver |
| R10 — availability a kvóty | Single VPS/process, RAM quota restart reset, NAT/IPv6/privacy, PNG hero ~2.2 MB no-store | Bounded staged load+tuning, alerts, případná explicitní static-only cache; ne plošná API cache. Shared quotas až při škálování |
| R11 — future AI/uploads/fetch | Dnes uzavřené: žádný externí provider call, upload parser nebo URL fetch | Samostatné DATA_AND_FEATURE_GATES.md implementace+tests+review+privacy. AI idempotency/distributed budget, parser sandbox a rebinding/egress nelze odložit až po aktivaci |
| R12 — operational maturity | Žádná deploy CI ani content telemetry, aplikace nyní neexportuje agregované metriky | Oddělené read-only CI/agent ephemeral flow, provenance/SBOM signing po návrhu, sanitized monitoring, pravidelný recovery drill |

## Accepted Risk

**Žádné riziko nebylo v tomto kroku schváleno jako Accepted Risk.** Potenciální single-VPS outage, procesové kvóty, lower CVEs, bridge NAT a provider/Cloudflare trust musí reviewer výslovně posoudit a člověk schválit s ownerem, důvodem, kompenzací, datem expirace a retestem. Waiver nesmí obejít otevřenou P0/P1 podle tohoto zadání.

## Před public startem člověk podepíše

Exact Git SHA + app/connector/base digests; independent reviewer/datum; R00, R03–R06 a R13 CLOSED s důkazy; fresh scan bez nevyřešených P0/P1; explicitní dispozice všech 34 package nálezů a schválené P2/risks bez blanket suppression; staging load/edge spoof/CSRF/HTTPS/ports/rollback/restore; privacy; omezený deployment a monitoring owner; explicitní human approval. Do té doby nic nenasazovat. Build/test PASS nebo přítomnost runbooku žádný z těchto kroků nenahrazuje.
