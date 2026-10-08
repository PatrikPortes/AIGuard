# Remediation 1 — validation and evidence boundaries

> CR03 follow-up: the results/image identity below describe the prior remediation candidate and are retained as history. [Current CR03 stability report](CR03_STABILITY_REMEDIATION.md) preserves later 92.124/46.843ms failures and failed intermediates, documents the final fix/30 repetitions/90 tests, and links the current manifest. Previous Docker/source matching is stale after analysis.js changed; rebuild/runtime/hash verification awaits the next final pre-commit gate. Security Gate remains BLOCKED.

2026-10-08. **Security Gate: BLOCKED.** These are the implementing author's local checks, not independent approval. No commit, push, deployment, production access, DNS/Cloudflare changes or real provider calls occurred. All request content and credentials used by tests are synthetic.

## Final results

| Check | Result | Evidence and limits |
|---|---|---|
| Original suite and new regressions | **87/87 PASS**, no failures/skips/TODO | Original 65 tests retained, plus 17 remediation and five deployment tests. Host Node24.19.0. [tests.txt](evidence/remediation-1/tests.txt) |
| Unchanged Claude assertions | **16/16 PASS** under strict runner | Raw TAP retains seven pass + nine original TODO labels. Every assertion actually passed. The hash-checking wrapper rejects ANY `not ok`, missing test, skip or nonzero exit; a failing TODO cannot silently pass. Report/test bytes match the exact review commit. |
| Docker build | **PASS** | Pinned amd64 builder/runtime Node24.21.0; build validation uses network-none and runs all87 tests, strict16 and syntax. [docker-build.txt](evidence/remediation-1/docker-build.txt) |
| JS/MJS and shell syntax | **PASS** | `npm run check`; `bash -n` for all four release helpers. Python optimizer compiled with cache outside the checkout. [syntax.txt](evidence/remediation-1/syntax.txt) |
| Chromium security/responsiveness | **PASS** | Desktop1440px,390px,320px; no horizontal overflow; full hero aspect/contain and Czech alt; labels/main, textContent/XSS, rules workflow, neutral URL/zero-signal visuals. Actual JS-disabled and aborted-module contexts, plus native POST, do not place private markers in request URLs or bodies. [browser.txt](evidence/remediation-1/browser.txt) |
| Compose security | **PASS locally** | Internal app bridge, zero published ports, non-root/read-only/cap-drop/NNP/resource limits, no host/socket mounts, connector-only token, amd64. [config-check.txt](evidence/remediation-1/config-check.txt). No real tunnel or VPS firewall validated. |
| Hardened local runtime/smoke | **PASS** | UID65532, read-only, capabilities dropped, network-none,512MiB/0.5CPU/PID64, no host ports. Health/rules/assets/private404 checks through local container exec. Direct production `AI_MODE=ai` startup rejected before listen, without relying on Docker's import hook. [runtime](evidence/remediation-1/container-runtime.json), [smoke](evidence/remediation-1/container-local-smoke.txt) |
| Runtime source identity | **PASS** | All37 runtime app files match current working bytes;14 hashed WebP and no master PNGs/docs/tests/env/Git. Pinned native files are unchanged. [comparison](evidence/remediation-1/image-source-comparison.json). Audit revision `unreleased` is deliberately NOT an approved release commit. |
| Asset fidelity/transparency | **PASS** | Fourteen original PNGs and two canonical references remain byte-exact. Full-canvas resizing only; lossless WebP decoded RGBA/alpha equals the resized reference, PSNR100 on cream. Delivery is not pixel-identical to full-resolution masters.23,659,415→2,342,188B total (−90.1%); hero2,193,410→702,152B (−68.0%). [asset evidence](evidence/remediation-1/asset-optimization.json) |
| npm dependency audit | **PASS / limited scope** | Zero dependency vulnerabilities; zero external runtime npm packages. Does not audit Node core or native OS libraries. [npm-audit-final.json](evidence/remediation-1/npm-audit-final.json) |
| Gitleaks | **PASS, zero findings** | Official v8.30.1 default rules, redacted, no new allowlist/suppression. Complete versionable candidate copied for scanning, including unchanged files and imported review evidence; final pass includes new manifests/reports. Gitleaks inspects text, not compressed raster pixels. Separately extracted metadata from all30 PNG/WebP images also has zero findings; all16 PNGs match the approved base bytes. [gitleaks.json](evidence/remediation-1/gitleaks.json), [scan metadata](evidence/remediation-1/secret-scan.json), [image metadata](evidence/remediation-1/image-metadata.json). This is not proof against every possible secret format. |
| Fresh Trivy image scan | **34 unresolved raw rows retained** | App23MEDIUM+8LOW, connector2MEDIUM+1UNKNOWN; zero Trivy HIGH/CRITICAL. CNA HIGH preserved. Fresh DB retrieval succeeded; registry still published the same DB version. No scanner suppression. [all dispositions](VULNERABILITY_REMEDIATION_1.md) |
| Node core / Go gap checks | **Evidence collected** | Official Node feed194 records,39 relevant Node24 advisories, zero known unpatched for24.21.0; no parse errors. Exact cloudflared affected SSH/OpenPGP/s2 symbols absent. These are scoped feed/linkage checks, not proof against undisclosed/inlined bugs. |
| Isolated egress probe | **CR09 remains infrastructure-dependent** | Ordinary bridge has default route; internal bridge does not. Both reach an owned host-gateway fixture200. No real metadata service or production endpoint contacted. [network-probe.json](evidence/remediation-1/network-probe.json) |
| Independent retest / human sign-off / staging | **NOT RUN** | Current repairs remain uncommitted. VPS/CF trust/cache/WAF/TLS/parser/log/load checks, host+bridge firewall, real rollout/rollback/restore and privacy approval remain mandatory. |

Audit app image: `sha256:5c8bd3840add45251e86dc533188fa2fee9996f9aef2b01819d73bdfdf3aede2`. Unchanged connector image: `sha256:3d0a7b710bbced831dc303af25dbb831129834d13f4bdc0d304682dd75f566c9`. Local images are audit artifacts, not deployments or release approval.

## Baseline and intermediate failures

- Original baseline:64/65 tests; the50ms timing-window assertion failed under simultaneous CPU-heavy adversarial work. The test now uses an injected clock, retaining its quota assertion. [baseline-tests.txt](evidence/remediation-1/baseline-tests.txt).
- Unchanged Claude baseline: seven invariants passed and nine TODO assertions failed, despite Node exit zero. Their raw failure output remains preserved. [baseline-claude.txt](evidence/remediation-1/baseline-claude.txt).
- CR03 baseline measured1194ms for one synchronous attack during concurrent load. A new80-call/eight-case CPU regression initially measured21.414ms against20ms. **The threshold was not raised**: no-Latin normalization and allocations were optimized, then the same check passed. CPU time and single-call wall time test different properties; neither establishes a production latency SLO.
- A preliminary quality95 WebP failed the minimum35dB comparison (34.38dB). It was replaced with lossless encoding. Canonical masters were never edited; rejected derivatives are not in the candidate.
- Actual no-JS baseline leaked a synthetic marker into a query. Original release helpers activated an arbitrary cached tag with zero builds in an isolated mock. A fake provider reproduced summary steering; the global monetary cap worked. [baseline JSON evidence](evidence/remediation-1/README.md).
- CR09 is intentionally **not** claimed closed: an internal bridge still permits host/same-bridge access without separately validated firewall enforcement.

## Reproduction commands

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node --test --test-reporter=tap tests/adversarial/claude-review.adversarial.mjs
node scripts/claude-review-check.js
node scripts/security-config.js
PLAYWRIGHT_MODULE=<installed-playwright-module> CHROMIUM_PATH=<chromium> node scripts/security-browser.js
bash -n deploy/scripts/common.sh deploy/scripts/deploy.sh deploy/scripts/rollback.sh deploy/scripts/build-connector.sh
npm audit --omit=dev --json
python3 scripts/optimize-characters.py
```

Pillow12.3.0 and browser/scanner tools are development-only, installed outside the runtime. The optimizer verifies full-canvas source/delivery fidelity and rewrites deterministic derivative files/mapping; source PNG hashes must remain unchanged. Do not run `test:live`, connect a provider or set real AI secrets for this review.

Image/scanner commands used locally (replace tool/cache/output paths; never use production secrets):

```sh
docker build --platform linux/amd64 --build-arg VCS_REF=unreleased --iidfile <audit-iid-file> -t verimtomu-remediation:local-audit .
docker save --output <app-image.tar> verimtomu-remediation:local-audit
trivy image --download-db-only --cache-dir <cache>
trivy image --input <app-image.tar> --cache-dir <cache> --skip-db-update --scanners vuln --format json --output <app-report.json>
trivy image --input <connector-image.tar> --cache-dir <cache> --skip-db-update --scanners vuln --format json --output <connector-report.json>
gitleaks dir <complete-candidate-copy> --config <official-v8.30.1-default.toml> --redact --report-format json --report-path <report.json> --no-banner
```

Base image digests are committed in Dockerfile/defaults and release helpers; final deployment must independently bind a clean approved commit/tree to immutable image IDs. Audit building the dirty working candidate here is only local evidence, not the production helper workflow.

[Candidate manifest](evidence/remediation-1/candidate-manifest.json) records current bytes/modes, excluding only its own JSON and its own file list to avoid recursive self-hashes. [Changed files](evidence/remediation-1/changed-files.txt) includes expanded new files. Frozen Gate1/Gate1.1/pre-commit evidence describes previous states, not the repaired candidate. **STOP: Security Gate remains BLOCKED.**
