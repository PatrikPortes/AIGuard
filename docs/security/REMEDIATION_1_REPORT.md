# Security Remediation 1 — implementation report

> CR03 follow-up: the results/image identity below describe the prior remediation candidate and are retained as history. [Current CR03 stability report](CR03_STABILITY_REMEDIATION.md) preserves later 92.124/46.843ms failures and failed intermediates, documents the final fix/30 repetitions/90 tests, and links the current manifest. Previous Docker/source matching is stale after analysis.js changed; rebuild/runtime/hash verification awaits the next final pre-commit gate. Security Gate remains BLOCKED.

2026-10-08. **Security Gate remains BLOCKED.** Branch `security/gate-1-remediation` starts at `fde14ba57d62ba9e6aab0181170386a1d38da7a1`. This is the implementing author's candidate for another independent retest, not an independent sign-off. No commit, push, deployment, DNS/Cloudflare change, production access or real AI activation occurred.

## Independent evidence

Review commit `1e26f6c957e752eef86aa3227839efa64121dfaa` has the approved base as its parent. Only its report and adversarial test were imported, byte-for-byte:

- Report SHA-256: `eedc7f15a8cc820b3276e0d35bb94eb32099f75568d2fa24e840d8892d62eef9`.
- Test SHA-256: `94eabe970bc359b2fc03e5ea70cca199524c432e680af4eb3a31d5ffcb2bc748`.

The original TODO labels remain. Node treats a failing TODO test as exit zero; the new strict runner verifies the file hash and rejects **any** failed assertion, missing assertion, skip or nonzero exit. The independent files were not edited.

## CR01–11 disposition

| Finding | Baseline classification | Evidence and remediation |
|---|---|---|
| CR01 / CR01b | **CONFIRMED** | Session GETs exhausted the shared quota: unrelated victim429. Filling10k limiter keys denied a new victim503. **FIXED IN CODE:** IPv6 /64 aggregation, independent signed-session quotas, client checks before global charge, dedicated issuance quota and bounded LRU token buckets. Only validated, admitted analyses consume the global burst. Distributed attacks, NAT sharing, LRU churn and restart reset remain residual risks. |
| CR02 | **CONFIRMED** | Eight incomplete bodies from one client occupied every analysis slot; victim503. **FIXED IN CODE:** bounded body read and validation precede analysis admission. Body cap2/client+1/session; analysis cap2/client+1/session+8global; body deadline2s. Original attack now leaves victim200. A worker ignoring cancellation retains its slot until it really settles. |
| CR03 | **CONFIRMED** | The original10k-character case took1194ms synchronously during the concurrent baseline. **FIXED IN CODE:** bounded regex gaps/digit quantifiers and ordered line scans; no-Latin normalization fast path and fewer allocations. New80-call, eight-case CPU corpus stays below20ms per analysis; Claude's unchanged single wall-time assertion also passes. Real0.5CPU staging load remains pending. |
| CR04 | **CONFIRMED** | Invisible characters and mixed-script lookalikes reduced an obvious scam to score0. **FIXED IN CODE:** exact original input is separate from NFKC/ignorable-character/mixed-Latin confusable matching text. The scam corpus retains `very_high`; standalone Greek/Cyrillic words are not transliterated. An unusual-character signal alone weighs only5 and never confirms fraud. General multilingual detection is not claimed. |
| CR05 | **CONFIRMED** | Unfetched phishing-style HTTPS URLs received `low` and success visuals. **FIXED IN CODE:** URL-only, zero-signal and score<30 results are neutral `unassessed`. URL text explicitly says the destination was not visited or verified. Neutral characters and a dash replace the reassuring success/0-of100 display. URL fetching remains disabled. |
| CR06 | **CONFIRMED** | A tossed legacy cookie denied the valid victim403. **FIXED IN CODE:** production `__Host-guard_session`, Secure/Path=/, no Domain, HttpOnly/Strict. Invalid shadow values do not suppress one valid signed identity; distinct valid identities are rejected as ambiguous. Raw duplicate-header checks remain. |
| CR07 | **CONFIRMED** |100 original hero requests transferred>200MB with no-store; the baseline took58.7s. **FIXED IN CODE + REQUIRES CLOUDFLARE VALIDATION:** unchanged masters produce14 lossless delivery WebP files, total bytes−90.1%. Exact hash URLs, immutable caching, CF headers, ETag, physical integrity before304, legacy301 and client request/byte budgets. API/HTML remain no-store. Edge caching/WAF and distributed cold-cache bandwidth still require proof. |
| CR08 | **CONFIRMED** | Chromium with JavaScript disabled put the synthetic private marker in a GET query. **FIXED IN CODE:** initially disabled submit, POST target, noscript notice and permanently unnamed private input fields. JS-disabled/module-failure/native empty-POST checks pass. This does not substitute for checking edge logs or manually constructed URLs. |
| CR09 | **CONFIRMED** | An isolated ordinary bridge had a default route and reached an owned host fixture200. **MITIGATED IN CODE / REQUIRES VPS VALIDATION:** app has only an internal bridge and no published ports; its default route disappears. The host fixture still returns200 on an internal bridge. Reviewed host/bridge IPv4/IPv6 firewall enforcement and tests are mandatory before staging. No production firewall was changed. |
| CR10 | **CONFIRMED** | Baseline mock execution activated an arbitrary cached SHA-like tag with **zero build calls**. **FIXED IN CODE / REQUIRES VPS VALIDATION:** always build a clean approved Git archive, capture immutable IID, verify inspect.Id/revision and record source/tree/base manifest. Activation and rollback use immutable IDs; mutable pointers, missing/mismatched IID fail closed. Docker admin remains a trusted boundary; mock tests are not a real VPS rollout drill. |
| CR11 | **PARTIALLY CONFIRMED** | A fake provider steered the public summary, and per-client cost accounting is absent. The atomic global monetary cap **works**; no cost-cap bypass was reproduced. **MITIGATED IN CODE / AI RELEASE GATE:** fixed public-summary templates and direct production startup guard. Persistent identity budgets/fairness, busy-store handling, idempotency and broader semantic-output attacks remain gated. Rules only, zero budgets, no AI secrets or real calls. |

## Implementation and files

- `src/client-ip.js`: canonical IPv4 or IPv6 /64 quota identity, separate from exact trusted-peer comparison.
- `src/limits.js`: O(1) LRU token buckets capped at10k keys each; idempotent client admission; host-prefixed cookies and explicit ambiguity handling.
- `src/server.js`: endpoint fairness/order, validation before scarce slots, separate body/analysis/client/session admission, global charge after admission. Exact WebP/legacy allowlist, static byte/request budgets, bounded integrity-checked file cache, recovery after failed reads and physical checks before304. No assets wildcard.
- `src/analysis.js`: separate normalized representation, bounded matching, IPv6 literal indicator, neutral verdict and fixed summaries. `src/ai/pipeline.js` exports bounded validation and replaces model summaries with server templates. `runtime.js` invokes the production guard directly; `production-config.js` validates new controls. Global budget/queue/provider architecture remains intact and dormant in production.
- `public/index.html`, `app.js`, `style.css`: no-JS privacy, module asset mapping and neutral verdict states. Existing layout, character identity, hero alt and contain sizing remain.
- `scripts/optimize-characters.py`, `public/character-assets.js` and14 hashed WebP files: unchanged PNG masters; full canvas up to384px per character or840px hero; lossless decoded RGBA/alpha relative to the resized source.
- Compose/env/helpers: internal app network, no host port, amd64; token only in connector. Always-build and immutable identities for app/connector, separate connector activation and no infrastructure mutation.
- Strict Claude runner/package/Docker checks: independent failures cannot be hidden by TODO. Builder verifies masters and derivatives; runtime ships WebP and app files, excluding original PNG archives/docs/tests/env/Git.
- Tests and documentation:17 remediation tests, five deployment regressions, extended browser/config checks; current architecture/assets/operations/CF/feature/release/CVE/review docs. Historical raw evidence stays frozen. Full changed-file list: [changed-files.txt](evidence/remediation-1/changed-files.txt).

## Testing integrity

[Complete validation](REMEDIATION_1_VALIDATION.md) separates baseline, failed intermediate checks and final results. The original65 tests remain; changed contracts are tested more directly: the global quota test now sends three analyses, and the image test checks unchanged masters plus exact WebP/301 delivery. The rate test uses an injected clock; cancellation waits for actual worker start instead of a sleep. Assertions were retained.

Baseline:64/65 original tests, with a50ms timing-window failure under concurrent CPU load; Claude had seven passing invariants and nine failing TODO assertions despite exit zero. One new CPU assertion measured21.414ms. **Its20ms threshold was not raised:** normalization was optimized, then the same assertion passed. Independent report/test hashes remain unchanged.

## CVE and remaining gates

[All34 package findings](VULNERABILITY_REMEDIATION_1.md): author proposes24 scoped NOT AFFECTED, eight MITIGATED and two OPEN. Fresh-retrieved DB still reports31+3 rows and zero Trivy HIGH/CRITICAL; CNA HIGH and UNKNOWN remain visible. A03/A28/A31 are more conservative than Claude. Exact Go affected functions/OpenPGP/s2 are absent. The official Node core feed has194 records,39 relevant advisories and zero known unpatched advisories for actual runtime24.21.0. No suppression, Accepted Risk or vendor-patch claim.

- **P0 release condition:** an approved remediated release/sign-off is missing. The previous empty-repository R00 is resolved; no new confirmed P0 exploit was found.
- **P1:** independent retest and human review; R13 disposition/native provenance for A28/A31; VPS host/firewall; CF trust/cache/WAF/TLS/load; privacy; actual staging rollout/rollback/restore and health alerts.
- **P2/residual:** distributed quota/bandwidth exhaustion, NAT-/64 sharing, LRU churn, RAM reset, single-VPS outage and weekly vendor/advisory monitoring.
- **AI release only:** persistent client cost ledger/fairness, atomic combined reservations, idempotency, busy-store work outside the HTTP loop, semantic output checks and provider privacy remain required before activation.

The exact local candidate is suitable for another independent Claude retest. A remote clone still returns the approved base without these uncommitted fixes; publishing a new review commit needs separate explicit authorization. Code/test success is not staging or production approval.

**STOP. Gate BLOCKED. No commit, push, deployment, DNS/Cloudflare change or real AI activation.**
