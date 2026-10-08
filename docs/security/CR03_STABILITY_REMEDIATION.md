# CR03 stability remediation — local validation only

2026-10-08. **CR03 FIXED IN CODE for the controlled acceptance scenario; Security Gate BLOCKED.** This is the implementing author's evidence, not independent approval. No commit, push, merge, deployment, infrastructure change or external AI activation.

Base `fde14ba57d62ba9e6aab0181170386a1d38da7a1`; branch `security/gate-1-remediation`; prior staged tree `b63c0d6786e55118c9c8b59103328731c03694ca`. Final `src/analysis.js` SHA-256 `14f698e70a953315ff3a6d67cf2052e5965f2e1f63ad973e5ed183d7ead8653c`. [Current candidate manifest](evidence/cr03-stability/candidate-manifest.json) binds all candidate files with explicit self-reference exclusions. The resulting Git tree ID is reported separately after staging, avoiding recursive tree claims.

## Root cause and evidence limits

The earlier CR03 remediation had already bounded rule regex quantifiers and ordered scans. The remaining spikes are in **matchingRepresentation's normalization**, not demonstrated exponential regex backtracking. [Baseline phase profiling](evidence/cr03-stability/root-cause.json) recorded **55.055ms normalization** on `"posli ".repeat(1666)` versus **2.163ms rules** in the same analysis. ASCII money/urgency prefixes unnecessarily invoked NFD **1,666/2,000 times** plus NFKC each call, allocating token replacements and regex objects. The diagnostic GC trace's largest pause was **5.2ms**: allocation/GC contributes but that single pause does not explain the whole spike.

A second, distinct path is **U+FDFA NFKC expansion**: 3,000 input characters become 54,000 matching characters; an accepted 15,999-byte input becomes 95,994. Long native Unicode-property scans and per-word token callbacks operate on that expanded copy. A diagnostic selected-token attempt still measured **22.475ms ignorable stripping** and **29.192ms Latin searching** separately. These are CPU readings, not wall-time contention explanations. Baseline/profile reproduction scripts and operation counts are included in [evidence](evidence/cr03-stability/README.md).

Historical **92.124ms** and **46.843ms** failures are retained byte-for-byte in raw logs. Their original assertion recorded the corpus maximum without its input index, so profiling cannot honestly assign either historical sample to one specific token, GC event or syscall. The observed application paths above independently reproduce over-budget CPU work. All measurements were on Node24.19.0; actual production 0.5CPU/staging behavior remains unverified.

## Small, bounded change

Only `src/analysis.js: matchingRepresentation` and its normalization regex constants change runtime behavior. ASCII now takes the mathematically equivalent lowercase-only path, requiring zero NFKC/NFD calls. For NFKC output consisting only of ASCII plus U+0600–U+06FF, simple character classes replace the large property scans: that block contains no Latin-script characters and exactly eight ignorable/format characters. The new focused test exhaustively checks all 384 code points in this domain against the engine's Unicode properties, and checks Latin/Arabic mixed-token decomposition.

Other Unicode text retains NFKC, invisible removal, lowercase and Latin-containing-token confusable/NFD folding. A token is selected once through its first Latin letter/mark; non-Latin-only words create no per-word callback. Token boundaries honor code points including surrogate pairs and the old letter/mark grammar. Scans advance monotonically; each region is visited only a constant number of times. There is no truncation, new input relaxation, user-content cache or removed signal. Original input remains exact for CR04/provider/evidence.

Rule definitions, weights, limits, orderedPhrase, AI/API, frontend and deployment configuration are unchanged by this task. Existing CR03 and Claude test bytes, corpus, measurement and **strict <20ms** assertion are unchanged. `tests/cr03-normalization.test.js` adds three focused semantic/property regression tests. One new test fixture initially mistyped a Latin `b` as Arabic `ب`; its expected literal was corrected before the full run, with no production code or existing assertion altered.

## Historical attempts remain visible

- Original failed full run: **92.124ms**; subsequent pre-fix controlled ten-run failure **46.843ms** (1/10); separate contention failure **27.796ms** (1/3).
- ASCII-only intermediate: 30 repetitions passed, but maximum-size expansion with a Latin tail failed **6/60**, max **30.836ms**. It was not accepted.
- General Unicode selected-token intermediate: **10/30 failed**, max **48.728ms**. A separate max-size run passed; that does not override the stability failure.
- Bounded character-property memoization experiment: **5/30 failed**, max **34.234ms**. It was removed; the candidate contains no such cache.
- Final source is a different hash from each failed intermediate. Raw series summaries and worst-run TAPs remain in [history](evidence/cr03-stability/README.md).

## Final controlled results

Unchanged existing CR03 test, **30 sequential fresh processes**, no competing builds/audits launched. Normal CPU affinity and existing shared-environment background services; no special runtime flags. Each process uses the existing 20 warmups and 80 measured analyses. The external observer records the already-calculated assertion message after timing and delegates the original assert.ok unchanged. No test/threshold changes or discarded final-source runs.

Runs 1–30, milliseconds: **7.962, 6.723, 4.855, 5.232, 4.331, 5.897, 4.875, 7.323, 10.639, 7.664, 6.694, 7.596, 3.549, 5.301, 5.098, 4.750, 4.821, 5.131, 4.607, 7.300, 16.600, 5.477, 6.621, 8.092, 4.034, 4.541, 5.426, 4.866, 4.850, 8.933**.

Min **3.549**, median **5.3635**, p95 **10.639** (nearest rank), max **16.600**. Failures >20ms: **0/30**; failures >=20ms: **0/30**. [Every raw TAP and source/test hash](evidence/cr03-stability/controlled/results30.json).

Maximum-size/scaling validation: eight input families at 1k/2.5k/5k/10k characters plus both near-16k-byte expansions; **34 cases ×60 =2,040 measurements**, all inputs pass unchanged validateInput. **0 over20ms**, global maximum **9.995ms**. Pure expansion max **7.864ms**, 16,000-byte expansion+Latin tail max **7.991ms**. No pathological scaling observed; full per-case min/median/p95/max is in [maximum-size.json](evidence/cr03-stability/maximum-size.json). [Deterministic differential](evidence/cr03-stability/differential.json): **5,051 inputs** identical to the exact pre-fix baseline in matching content and both flags.

## Regression and release boundaries

- **90/90 automated tests**, zero failures/skips/TODO, including three new semantic tests and existing deployment regressions.
- **16/16 Claude assertions** under unchanged suite and strict runner. Seven raw pass/nine original TODO labels remain; none fail or skip.
- `npm run check` PASS; Chromium1440/390/320, XSS/text rendering, neutral results, no-JS and failed-module privacy PASS. [Logs](evidence/cr03-stability/regression/tests.txt).
- Complete candidate secret scan is recorded in [secret scan](evidence/cr03-stability/secret-scan.json); synthetic test fixtures are not real credentials.
- **Docker/Trivy intentionally not rerun in this source-only step.** Previous image/build/runtime checks remain historical. Their 37/37 runtime-file binding does **not** cover the changed analysis.js or the new test. A new exact-candidate image/build/hash/runtime verification is required in the next final pre-commit gate; prior PASS must not be carried forward as current identity.
- No dependencies, Docker/native packages or feature scope changed. CVE disposition remains proposed **24 NOT AFFECTED /8 MITIGATED /2 OPEN**: **A28 CVE-2026-102010 (libstdc++ PBDS/provenance)** and **A31 CVE-2026-85091 (zlib provenance/backport)**. No ACCEPTED risk or patch claim.

Independent retest/human approval, image identity verification, A28/A31 disposition, actual staging/VPS/Cloudflare/privacy and separately authorized Git release remain blockers. Rules mode remains the production guard; no external AI. **STOP: Security Gate BLOCKED.**
