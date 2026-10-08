# CR03 stability evidence

The implementing author's local evidence, not independent approval. Security Gate BLOCKED. All inputs/logs are synthetic. Historical files are immutable copies, not current PASS claims.

- `history/original-92ms-tests.txt`: original failed full run, byte-exact SHA-256 f5860fef5eb542d626fbb66380ca0035867c44fa3b9cd70af9bd1ab227231f62.
- `history/controlled-results.json` plus ten TAPs: pre-fix 46.843ms failure; `contention-results.json`/three TAPs keep the distinct load experiment.
- `history/*30-results.json`: all measurements/hashes for ASCII-only, selected-token and removed classification attempts; each worst raw TAP is also retained. `ascii-only-maximum-size.json` preserves the 30.836ms/6-failure intermediate.
- `baseline-analysis.mjs`: exact analysis.js bytes from prior staged tree b63c0d6786e55118c9c8b59103328731c03694ca, solely for comparison; it is not imported by production or shipped in runtime.
- `root-cause.json`: phase samples, GC limits, operation measurements and SHA-256 references to external larger diagnostic traces; no unsupported attribution of the historical aggregate maxima.
- `controlled/results30.json` and every `controlled/run-*.tap`: final-source 30-run acceptance, all runs retained.
- `maximum-size.json`, `differential.json`, `regression/*`: final source scaling/semantic/regression evidence.
- `candidate-manifest.json`, `candidate-files.txt`: complete current candidate byte/mode inventory, excluding only their own self-referential paths.
- `secret-scan.json`/`gitleaks.json`: final complete candidate scan; no credential values.

Reproduce from the repo root, with no competing build/audit workloads:

```sh
AI_MODE=rules NODE_ENV=development python3 docs/security/evidence/cr03-stability/run-stability.py /tmp/verim-cr03-review-results
node docs/security/evidence/cr03-stability/differential.mjs
node docs/security/evidence/cr03-stability/maximum-size.mjs
node --trace-gc-nvp docs/security/evidence/cr03-stability/profile-baseline.mjs > /tmp/verim-cr03-baseline-profile.txt
node docs/security/evidence/cr03-stability/profile-baseline.mjs current > /tmp/verim-cr03-final-profile.txt
npm test
npm run check
PLAYWRIGHT_MODULE=<installed-module> CHROMIUM_PATH=<chromium> node scripts/security-browser.js
```

The assertion observer logs only the already-computed measurement and delegates the original unchanged assertion. No new threshold, corpus or warmup setting. Source/test hashes are checked after every repetition. Profiling is separate from acceptance timing. Reproduction runs create results outside the repository and do not activate external AI.
