# Security Gate 1.1 — provedené ověření a jeho limity

2026-10-08. **BLOCKED.** Pouze lokální testy a příprava evidence pro externí review. Žádná runtime implementace/front-end/deployment konfigurace nebyla změněna; přibyly bezpečnostní dokumenty a raw evidence. Nezávislé review, pentest, staging, VPS/Cloudflare a schválený Git release nebyly provedeny.

## Výsledky tohoto kroku

| Příkaz / kontrola | Výsledek | Přesný rozsah a evidence |
|---|---|---|
| `npm test` | **65 PASS, 0 FAIL, 0 skipped** | Současné kompletní testy server/parser/rules/ingress/session/quotas/queue/SQLite budget/provider/schema/deploy-helper/assets. [tests.txt](evidence/gate-1.1/tests.txt). AI provider je fake/loopback HTTP, nikoli OpenAI. Čtyři SQLite worker_threads skutečně soutěží nad jednou DB. |
| `npm run check` | PASS | Node syntax check zdrojů/testů/skriptů, [syntax.txt](evidence/gate-1.1/syntax.txt). Ne plný SAST. |
| `bash -n` pro common/deploy/rollback/build-connector | PASS | Všechny čtyři release skripty; syntaktická kontrola, nikoli vykonání deploymentu. |
| `node scripts/security-config.js` | PASS | Skutečný Docker Compose config, pouze placeholder IP/image a dočasný env file, žádný service start. Guard/isolation/limits/loopback/no socket/healthchecks. [compose-config-check.txt](evidence/gate-1.1/compose-config-check.txt) |
| `scripts/security-browser.js` | PASS | Skutečný Chromium: rules workflow, textContent/XSS i při fake HTML-looking result, 1440/390/320px, bez overflow, canonical hero contain. [browser.txt](evidence/gate-1.1/browser.txt). Ne kompletní accessibility audit/pentest. |
| `npm audit --json` | 0 npm vulnerabilities | Nula externích npm dependencies; nevztahuje se na OS/Node/Go. [npm-audit.json](evidence/gate-1.1/npm-audit.json) |
| Gitleaks8.30.1 `dir .` official matching config + `--redact` | 0 findings | Současné pracovní soubory, žádná historie (unborn repo). [gitleaks.json](evidence/gate-1.1/gitleaks.json); secret scan nemá úplné pokrytí všech typů secrets. |
| Trivy0.75.0 app frozen-DB rescan | Scan dokončen; **31 nálezů neuzavřeno** | 23 MEDIUM+8 LOW; stejné ID/package/version/severity/fix jako Gate1. Žádné ignore/suppression. [trivy-app-rescan.json](evidence/gate-1.1/trivy-app-rescan.json) |
| Trivy0.75.0 connector frozen-DB rescan | Scan dokončen; **3 nálezy neuzavřeno** | 2 MEDIUM+1 UNKNOWN; stejný výsledek jako Gate1. [trivy-connector-rescan.json](evidence/gate-1.1/trivy-connector-rescan.json) |
| Trivy config nad oběma Dockerfiles | **54 successful / 0 failed** | Každý Dockerfile 27/0. Uložený checks bundle, žádný refresh. [trivy-docker-config.json](evidence/gate-1.1/trivy-docker-config.json). Compose audit samostatným verifierem. |
| Image/source porovnání | **36/36 byte hashes shodné** | Všechny regular `/app` files z audit app image exportu shodné se současným worktree. [image-source-comparison.json](evidence/gate-1.1/image-source-comparison.json). Žádný nový build/release tag vytvořen v Gate1.1. |
| Evidence integrity / completeness / links | PASS | 34 unikátních image+ID+package řádků, 28 advisory ID, shoda obou původních a rescan reportů, source/file hashes, všech 34 detailů a všechny lokální doc links. [integrity-check.json](evidence/gate-1.1/integrity-check.json) |

Trivy databáze: v2 UpdatedAt 2026-10-07T07:38:55.515026687Z, DownloadedAt 2026-10-08T05:16:37.376558156Z; [trivy-db-metadata.json](evidence/gate-1.1/trivy-db-metadata.json). `--skip-db-update` reprodukuje známý baseline, **není fresh release scan**. HIGH/CRITICAL0 jsou Trivy severity; čtyři advisory mají CNA HIGH, což evidence výslovně uchovává. Žádné riziko se neuzavírá exit0 scanneru.

První nový pokus Trivy config s dvěma positional filenames byl CLI odmítnut (`multiple targets cannot be specified`, exit1). Opravený příkaz skenoval dočasný adresář obsahující byte-exact oba Dockerfiles, výsledek 27/0 pro každý. Nešlo o zranitelnost ani potlačený scan failure. Síťová nedostupnost Debian/vuln.go.dev a glibc-mirror404 je zaznamenána v evidence README/source-fetches; žádný neověřený vendor fixed_version nebyl domyšlen.

## Co se v tomto kroku netestovalo

- Skutečný Cloudflare Tunnel/client-IP overwrite/Workers/PseudoIPv4, remote ingress HTTP-only, HTTP2/3 parser transform, HTTPS/HSTS/redirect/DNS a external IPv4/IPv6 port scan.
- VPS kernel/Docker/firewall/SSH, token file chmod/owner, resolver configuration, health alert/recovery, reálný bounded load, connector restart/rollout/rollback a backup restore.
- Úplný exact Git archive→build→deploy script fault-injection nebo failed explicit rollback recovery. Dosavadní skriptové testy mockují Docker CLI; žádný host release nebyl aktivován.
- Native exploitation/call graph, zdrojové Debian backports/Node zlib fork, vendor signatures a Go subpackage/module attribution nezávislým odborníkem.
- Captured runtime/edge/hosting log absence syntetického sensitive markeru, crash/core dumps a právní schválení privacy.
- Live OpenAI, upload/PDF parser, fetch/SSRF nebo multi-host budget. Všechny tyto feature gates zůstávají zavřené.

Detaily jednotlivých testovacích mezer (cookie expiry, duplicate Origin/CT/Cookie raw tests, slow headers, HTTP admission/load, log capture, remote Docker context, complete rollback/config recovery) jsou v [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md). Nejsou zde automaticky označeny za prokázané exploity ani ignorovány.

## Stav po ověření

Review balíček: [INDEPENDENT_REVIEW_PACKAGE.md](INDEPENDENT_REVIEW_PACKAGE.md). Gate: [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md), R00/R03–R06/R13 OPEN. Všech 34 package nálezů má pouze navrženou dispozici; žádný ACCEPT/waiver ani independent sign-off. V tomto kroku nic nasazeno, pushnuto, DNS změněno nebo AI aktivováno. **STOP; Security Gate zůstává BLOCKED až do externího schválení a uzavření ostatních podmínek.**
