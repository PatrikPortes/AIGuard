# Security Gate 1 — změněné soubory

Porovnání SHA-256 proti stavu na začátku tohoto úkolu, nikoli Git diff (repo nemá HEAD). Původní staging zachován, žádný commit/push.

## Nové soubory

- Dockerfile.cloudflared
- deploy/scripts/build-connector.sh
- docs/security/CHANGES.md
- docs/security/CLOUDFLARE_SECURITY.md
- docs/security/DATA_AND_FEATURE_GATES.md
- docs/security/OPERATIONS.md
- docs/security/SCAN_SUMMARY.json
- docs/security/SECURITY_RELEASE_GATE.md
- docs/security/THREAT_MODEL.md
- docs/security/VALIDATION_REPORT.md
- scripts/security-browser.js
- scripts/security-config.js
- src/http-security.js
- tests/security.test.js

## Upravené soubory

- .dockerignore
- .env.example
- Dockerfile
- README.md
- deploy/compose.yaml
- deploy/env/app.env.example
- deploy/env/deployment.env.example
- deploy/scripts/common.sh
- deploy/scripts/deploy.sh
- docs/ARCHITECTURE.md
- docs/DEPLOYMENT_PLAN.md
- docs/STAGES.md
- scripts/deployment-smoke.js
- src/ai/errors.js
- src/analysis.js
- src/limits.js
- src/production-config.js
- src/server.js
- tests/deploy-scripts.test.js
- tests/ingress.test.js

Celkem 14 nových a 20 upravených (34). Public HTML/CSS/JS a všech14 produkčních PNG, obě design reference i DESIGN_SYSTEM/ASSETS zůstaly bajtově nezměněné. AI provider/pipeline/schema/queue/runtime/budget jsou nezměněné; src/ai/errors.js pouze rozšiřuje bezpečné HTTP error codes. Rules mají zachovaný význam a nové lineární vyhodnocení ordered frází.
