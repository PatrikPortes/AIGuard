# Initial Git review candidate — pre-commit security check

2026-10-08. **PRE-COMMIT CHECK: PASS pro předávaného lokálního kandidáta. SECURITY RELEASE GATE: BLOCKED.** Tento dokument je lokální kontrola autora; není nezávislé review, přijetí 34 CVE, produkční release ani povolení deploymentu.

## Návrh předávaný ke schválení

- Remote: `https://github.com/PatrikPortes/AIGuard.git` (`origin`); read-only `git ls-remote origin` úspěšně dokončeno s prázdným výsledkem. Nebyly testovány write permissions ani proveden push.
- Branch: `security/gate-1-review`; lokální unborn větev, žádný HEAD commit.
- Commit message: `Security Gate 1 review candidate`.
- Scope: celý zkontrolovaný pracovní tree — source, frontend, canonical PNG/reference assets, testy, konfigurace/templates, deployment runbooks a úplná bezpečnostní evidence. Přesný seznam v [files.txt](evidence/pre-commit/files.txt); aktuální hashes/modes v [manifest.json](evidence/pre-commit/manifest.json).
- Kandidát je kompletně staged. **Commit ani push se v tomto kroku neprovádí.** Přesný staged Git tree ID se předává ve výsledku kontroly; samotný manifest nemůže hashovat sám sebe. Změna kteréhokoli staged souboru po kontrole vyžaduje nové scan/test/evidence ověření relevantního scope před publikací.

## Working tree a citlivý obsah

Před změnami bylo fyzicky 139 regular files / 30 054 583 bytes, žádné symlinks/submodules/special files; Git index obsahoval pouze 16 dříve schválených PNG. `git rev-parse --verify HEAD` nepotvrdí žádný commit. `.git` metadata nejsou kandidátní soubory a nejsou kopírována do release payloadu. Kandidát používá explicitně vyjmenované paths; žádné `git add -f` ani přebírání obsahu mimo checkout.

Kontrola názvů, typů a obsahu pracovního stromu, environment šablon, test fixtures a raw security reportů nenašla skutečné API keys/Cloudflare tokens/SSH private keys/credentials/cookies/session state/real env/database/uploads/user logs/build exports/dependencies/editor metadata. Kontrola environment proběhla pouze podle přítomnosti jmen, bez výpisu hodnot; známé AI/tunnel key bindings v tomto execution procesu nejsou nastaveny. Platformní Git autentizace není čtena, exportována ani uložena do repo.

Tři environment **templates** jsou záměrně zahrnuty: `.env.example`, `deploy/env/app.env.example`, `deploy/env/deployment.env.example`. Credential pole jsou prázdná, deployment IP/release fields jsou placeholders, image digests veřejné. Produkční template vynucuje `AI_MODE=rules` a nulové budgets; nebyla zapnuta externí AI. Testovací provider credentials jsou explicitně syntetické lokální fixtures, nikoli produkční klíče. Žádné reálné session cookies se neukládají.

Historické raw Trivy reports a test output v `docs/security/evidence/` jsou záměrná sanitizovaná reviewer evidence, nikoli runtime/request/user logs. Byly zahrnuty do úplného secret scanu. Obsahují veřejná CVE metadata, package/image identifikaci, lokální ne-secret paths a výsledky syntetických testů.

Všech 16 schválených PNG bylo ponecháno byte-exact. Ověřeny CRC/chunks a žádné trailing bytes; jediný další chunk je C2PA `caBX`. Metadata byla navíc extrahována mimo repo a skenována jako bytes i printable strings; 0 secret findings. Žádný obrázek nebyl pozměněn, rekomprimován ani metadata odstraněna.

## .gitignore a vyloučený obsah

`.gitignore` doplněn o credentials/auth files, env, DB+WAL/SHM, uploads/logs, dependencies, build/cache/coverage/image archives, temp a OS/editor metadata. Ověřeny deny probes i zachování povolených examples/PNG/security evidence. Výsledek: [ignore-check.json](evidence/pre-commit/ignore-check.json).

**Žádný ze skutečně přítomných 139 původních souborů nebyl vyřazen**: všechny jsou zamýšlený kód, assets, veřejné templates nebo sanitizovaná evidence. Citlivé/runtime/artifact soubory v checkoutu nejsou přítomny; netvrdíme, že byly smazány. `.git` metadata jsou Git internals. `/tmp/verim-*` scanner executables, image/rootfs exports, inspection files, scan scratch outputs a metadata extraction zůstávají mimo repository a nejsou staged. Lokální test DB jsou vytvářeny/uklízeny v systémovém temp adresáři, nikoli v kandidátovi.

Ignorování není security boundary proti `git add -f`; proto byla navíc ověřena **skutečná sada indexovaných files** a skenován její přesný export mimo `.git`.

## Provedené kontroly

| Kontrola | Výsledek / evidence |
|---|---|
| Gitleaks8.30.1 matching official config, `--redact`, working tree | 0 findings, žádné vlastní allowlists/suppression |
| Gitleaks nad celým byte-exact exportem Git indexu | 0 findings; [gitleaks.json](evidence/pre-commit/gitleaks.json). Žádné omezení jen na diff/source — zahrnuty docs, raw reports a PNG |
| Extra PNG metadata secret scan | 0 findings; [png-metadata-gitleaks.json](evidence/pre-commit/png-metadata-gitleaks.json); struktura/CRC [png-check.json](evidence/pre-commit/png-check.json) |
| Kompletní `npm test` | 65 PASS, 0 FAIL, 0 skipped; source i exact kandidátní export. [tests.txt](evidence/pre-commit/tests.txt). Fake/loopback provider, žádný live AI request |
| Node syntax, bash -n 4 deploy skripty | PASS; [syntax.txt](evidence/pre-commit/syntax.txt) |
| Docker Compose config verifier | PASS, jen config/placeholder env, žádný service start; [compose-config-check.txt](evidence/pre-commit/compose-config-check.txt) |
| Chromium browser verifier | PASS, rules/XSS/1440/390/320/no overflow; [browser.txt](evidence/pre-commit/browser.txt) |
| Source/evidence/index shoda | PASS; [validation.json](evidence/pre-commit/validation.json), staged export bytes/modes, všechna manifest data a seznam paths ověřeny |

Secret scan neposkytuje matematickou garanci absence každého myslitelného secretu; závěr se opírá také o kompletní inventuru a kontrolu citlivých kategorií. Gitleaks config nebyl upraven, známé test credentials nebyly plošně allowlistovány a scanner failures nejsou vydávány za PASS.

## Vazba na bezpečnostní evidence

Gate1.1 raw reports a jejich původní SHA-256 manifest **zůstávají beze změny**. Všech 34 ID/package nálezů zůstává evidováno a otevřeno. Z historických 64 source/config/test hashů se změnil pouze `.gitignore`, přesně z důvodu pre-commit ochrany; všech ostatních 63 hashů je shodných. Všech 36 `/app` runtime files auditovaného image se shoduje s kandidátem. Žádná změna backendu, AI pipeline, frontend UI, safety limits nebo canonical assets.

Aktuální pre-commit manifest nově pokrývá také upravené review/release dokumenty a všechny nové pre-commit artefakty. Obsahuje SHA-256 a Git file mode každého kandidátního souboru kromě samotného manifestu; **celý** kandidát včetně manifestu je identifikován finálním Git tree ID předaným uživateli. SHA-256 ověření manifestu je nutné provést před interpretací jeho tvrzení; Git tree/commit je identita, nikoli externí schválení.

## Schválení a další krok

Z hlediska ověřeného obsahu je kandidát vhodný k vytvoření prvního **review** commitu a následnému pushi pouze této větve po výslovném schválení uživatelem. Publikace umožní reviewerovi:

```sh
git clone --branch security/gate-1-review https://github.com/PatrikPortes/AIGuard.git
cd AIGuard
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
npm test
```

Node24 je požadovaný runtime; npm test nepoužívá skutečný OpenAI ani produkční credentials. Browser/config checks mají separátní prerequisites v [INDEPENDENT_REVIEW_PACKAGE.md](INDEPENDENT_REVIEW_PACKAGE.md). Claude Code musí samostatně provést nezávislé review dodaného exact commitu. Push review kandidáta s otevřenými nálezy není deployment ani schválení production release.

**STOP před commit/push. R00 zůstává otevřený do schválení/publikace a příslušného release ověření; ostatní security gates zůstávají BLOCKED.**

## Přesný git status (short) před schválením

Větev `security/gate-1-review`, unborn / žádný commit. Všech 151 paths je staged jako nové soubory, 0 unstaged, 0 untracked. Níže finální short status; jeho path set musí být shodný s files.txt a kandidátním manifestem.

```text
A  .dockerignore
A  .env.example
A  .gitignore
A  Dockerfile
A  Dockerfile.cloudflared
A  README.md
A  deploy/compose.yaml
A  deploy/env/app.env.example
A  deploy/env/deployment.env.example
A  deploy/scripts/build-connector.sh
A  deploy/scripts/common.sh
A  deploy/scripts/deploy.sh
A  deploy/scripts/rollback.sh
A  docs/AI-STAGE-REPORT.md
A  docs/ARCHITECTURE.md
A  docs/DEPLOYMENT_PLAN.md
A  docs/STAGE-REPORT.md
A  docs/STAGES.md
A  docs/design/ASSETS.md
A  docs/design/DESIGN_SYSTEM.md
A  docs/design/INTEGRATION_REPORT.md
A  docs/design/VERIM_CHARACTER_REFERENCE.png
A  docs/design/VERIM_VISUAL_REFERENCE.png
A  docs/security/ARCHITECTURE_REVIEW.md
A  docs/security/CHANGES.md
A  docs/security/CLOUDFLARE_SECURITY.md
A  docs/security/DATA_AND_FEATURE_GATES.md
A  docs/security/GATE_1_1_VALIDATION.md
A  docs/security/INDEPENDENT_REVIEW_PACKAGE.md
A  docs/security/OPERATIONS.md
A  docs/security/PRE_COMMIT_SECURITY_CHECK.md
A  docs/security/SCAN_SUMMARY.json
A  docs/security/SECURITY_RELEASE_GATE.md
A  docs/security/THREAT_MODEL.md
A  docs/security/VALIDATION_REPORT.md
A  docs/security/VULNERABILITY_EVIDENCE.md
A  docs/security/evidence/gate-1.1/CVE-2010-4756.json
A  docs/security/evidence/gate-1.1/CVE-2018-20796.json
A  docs/security/evidence/gate-1.1/CVE-2019-1010022.json
A  docs/security/evidence/gate-1.1/CVE-2019-1010023.json
A  docs/security/evidence/gate-1.1/CVE-2019-1010024.json
A  docs/security/evidence/gate-1.1/CVE-2019-1010025.json
A  docs/security/evidence/gate-1.1/CVE-2019-9192.json
A  docs/security/evidence/gate-1.1/CVE-2026-102010.json
A  docs/security/evidence/gate-1.1/CVE-2026-18374.json
A  docs/security/evidence/gate-1.1/CVE-2026-19499.json
A  docs/security/evidence/gate-1.1/CVE-2026-19542.json
A  docs/security/evidence/gate-1.1/CVE-2026-27171.json
A  docs/security/evidence/gate-1.1/CVE-2026-5435.json
A  docs/security/evidence/gate-1.1/CVE-2026-56855.json
A  docs/security/evidence/gate-1.1/CVE-2026-6238.json
A  docs/security/evidence/gate-1.1/CVE-2026-6368.json
A  docs/security/evidence/gate-1.1/CVE-2026-6791.json
A  docs/security/evidence/gate-1.1/CVE-2026-77117.json
A  docs/security/evidence/gate-1.1/CVE-2026-78662.json
A  docs/security/evidence/gate-1.1/CVE-2026-80489.json
A  docs/security/evidence/gate-1.1/CVE-2026-85091.json
A  docs/security/evidence/gate-1.1/CVE-2026-8674.json
A  docs/security/evidence/gate-1.1/CVE-2026-86805.json
A  docs/security/evidence/gate-1.1/CVE-2026-89092.json
A  docs/security/evidence/gate-1.1/CVE-2026-95619.json
A  docs/security/evidence/gate-1.1/CVE-2026-95818.json
A  docs/security/evidence/gate-1.1/CVE-2026-97399.json
A  docs/security/evidence/gate-1.1/GO-2026-5932.json
A  docs/security/evidence/gate-1.1/README.md
A  docs/security/evidence/gate-1.1/browser.txt
A  docs/security/evidence/gate-1.1/cloudflared-2026.10.0-go.mod
A  docs/security/evidence/gate-1.1/compose-config-check.txt
A  docs/security/evidence/gate-1.1/connector-symbol-counts.json
A  docs/security/evidence/gate-1.1/findings.json
A  docs/security/evidence/gate-1.1/gitleaks.json
A  docs/security/evidence/gate-1.1/image-source-comparison.json
A  docs/security/evidence/gate-1.1/integrity-check.json
A  docs/security/evidence/gate-1.1/manifest.json
A  docs/security/evidence/gate-1.1/node-linkage.json
A  docs/security/evidence/gate-1.1/node-runtime.json
A  docs/security/evidence/gate-1.1/npm-audit.json
A  docs/security/evidence/gate-1.1/review-source-manifest.json
A  docs/security/evidence/gate-1.1/runtime-files.json
A  docs/security/evidence/gate-1.1/source-fetches.json
A  docs/security/evidence/gate-1.1/syntax.txt
A  docs/security/evidence/gate-1.1/tests.txt
A  docs/security/evidence/gate-1.1/trivy-app-rescan.json
A  docs/security/evidence/gate-1.1/trivy-app.json
A  docs/security/evidence/gate-1.1/trivy-connector-rescan.json
A  docs/security/evidence/gate-1.1/trivy-connector.json
A  docs/security/evidence/gate-1.1/trivy-db-metadata.json
A  docs/security/evidence/gate-1.1/trivy-docker-config.json
A  docs/security/evidence/pre-commit/browser.txt
A  docs/security/evidence/pre-commit/compose-config-check.txt
A  docs/security/evidence/pre-commit/files.txt
A  docs/security/evidence/pre-commit/gitleaks.json
A  docs/security/evidence/pre-commit/ignore-check.json
A  docs/security/evidence/pre-commit/manifest.json
A  docs/security/evidence/pre-commit/png-check.json
A  docs/security/evidence/pre-commit/png-metadata-gitleaks.json
A  docs/security/evidence/pre-commit/syntax.txt
A  docs/security/evidence/pre-commit/tests.txt
A  docs/security/evidence/pre-commit/validation.json
A  package-lock.json
A  package.json
A  public/app.js
A  public/assets/characters/robo/robo-analyzing.png
A  public/assets/characters/robo/robo-capacity.png
A  public/assets/characters/robo/robo-default.png
A  public/assets/characters/robo/robo-error.png
A  public/assets/characters/robo/robo-searching.png
A  public/assets/characters/robo/robo-success.png
A  public/assets/characters/robo/robo-tip.png
A  public/assets/characters/robo/robo-warning.png
A  public/assets/characters/verka/verka-explaining.png
A  public/assets/characters/verka/verka-success.png
A  public/assets/characters/verka/verka-thinking.png
A  public/assets/characters/verka/verka-warning.png
A  public/assets/characters/verka/verka-welcome.png
A  public/assets/characters/verkarob.png
A  public/index.html
A  public/privacy.html
A  public/style.css
A  scripts/check.js
A  scripts/deployment-smoke.js
A  scripts/healthcheck.js
A  scripts/live-ai-smoke.js
A  scripts/production-guard.js
A  scripts/security-browser.js
A  scripts/security-config.js
A  src/ai/budget.js
A  src/ai/errors.js
A  src/ai/pipeline.js
A  src/ai/provider.js
A  src/ai/queue.js
A  src/ai/runtime.js
A  src/ai/schema.js
A  src/analysis.js
A  src/client-ip.js
A  src/http-security.js
A  src/limits.js
A  src/production-config.js
A  src/server.js
A  test-support/ai.js
A  tests/ai-http.test.js
A  tests/ai.test.js
A  tests/analysis.test.js
A  tests/budget.test.js
A  tests/characters.test.js
A  tests/deploy-scripts.test.js
A  tests/ingress.test.js
A  tests/provider.test.js
A  tests/queue.test.js
A  tests/security.test.js
A  tests/server.test.js
```
